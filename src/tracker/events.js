import { generateClientEventId } from "./outbox.js";
import { buildIngestDedupeKey, dedupeStorageKey, shouldSkipIngestDedupe } from "./ingest-dedupe.js";

/** @type {Map<string, Promise<boolean>>} */
const inFlightByDedupeKey = new Map();
import { buildBrowserIdentityPayload } from "./identity-context.js";
import { buildDeviceContextPayload } from "./device-context.js";
import { readFirstTouch } from "./first-touch.js";
import { enqueueOrSend, flushPending, sendNow } from "./queue.js";
import { enrichPayloadWithMarketingChannel } from "./channel-attribution.js";
import { buildCampaignSignature, captureCurrent } from "./query-params.js";
import { getOrCreateSession } from "./session.js";
import { getOrCreateJourneyId } from "./journey.js";
import { getOrCreateVisitorMeta } from "./visitor-meta.js";
import { buildGa4MetricsPayload } from "./ga4-metrics.js";
import { buildMetaBrowserPayload } from "./meta-browser-ids.js";
import { buildGoogleClickPayload } from "./google-click-resolver.js";
import { readClarityCookieValue } from "./clarity-id.js";
import {
  buildResolvedTouchFromPayload,
  readStoredLastTouch,
  readStoredSessionTouch,
  updateStoredTouches,
} from "./touch-state.js";

/**
 * @param {import('./config.js').TrackerInit & { userId: string, sessionId: string, requestHeaders: Record<string, string>, sessionTimeoutMs: number, journeyId?: string, sessionNumber?: number }} state
 * @param {string} event
 * @param {Record<string, unknown>} [props]
 */
export async function trackEvent(state, event, props = {}) {
  if (!state.endpoint) return false;

  const now = captureCurrent();
  const first = readFirstTouch({ siteKey: state.siteKey });
  const storedLastTouch = readStoredLastTouch({ siteKey: state.siteKey });
  const storedSessionTouch = readStoredSessionTouch({ siteKey: state.siteKey });

  const campaignSig = buildCampaignSignature(now);
  const forceNew =
    Boolean(state.resetSessionOnCampaignChange) && campaignSig.replace(/\|/g, "") !== "";

  const sess = getOrCreateSession(
    { siteKey: state.siteKey },
    { sessionTimeoutMs: state.sessionTimeoutMs, forceNew },
  );
  state.sessionId = sess.id;
  state.sessionNumber = sess.session_number;
  state.journeyId =
    state.journeyId || getOrCreateJourneyId({ siteKey: state.siteKey }, { ttlDays: state.journeyTtlDays });

  const vmeta = getOrCreateVisitorMeta({ siteKey: state.siteKey });

  const browserIdentity = buildBrowserIdentityPayload();
  const deviceContext = await buildDeviceContextPayload();
  /** @type {Record<string, unknown>} */
  const identityMerged = {
    ...(browserIdentity || {}),
    ...(state.identityHints && typeof state.identityHints === "object" ? state.identityHints : {}),
  };
  const identityPayload = Object.keys(identityMerged).length ? identityMerged : undefined;

  const client_event_id =
    props && typeof props.client_event_id === "string" && props.client_event_id.trim()
      ? String(props.client_event_id).trim().slice(0, 128)
      : generateClientEventId();

  const payload = {
    event,
    timestamp: new Date().toISOString(),
    ...(state.merchantId ? { merchant_key: state.merchantId, tracking_merchant_key: state.merchantId } : {}),
    user_id: state.userId,
    session_id: state.sessionId,
    session_number: state.sessionNumber,
    sass_session_id: String(state.sessionId),
    sass_session_number: state.sessionNumber,
    session_started_at: sess.started_at,
    journey_id: state.journeyId,
    first_seen_at: vmeta.first_seen_at,
    last_seen_at: vmeta.last_seen_at,
    site_key: state.siteKey || undefined,
    url: typeof location !== "undefined" ? location.href : undefined,
    referrer: typeof document !== "undefined" ? document.referrer || undefined : undefined,
    click_ids: Object.keys(now.clickIds).length ? now.clickIds : undefined,
    utm: Object.keys(now.utm).length ? now.utm : undefined,
    raw_query_params: Object.keys(now.raw_query_params || {}).length ? now.raw_query_params : undefined,
    normalized_click_ids: Object.keys(now.normalized_click_ids || {}).length
      ? now.normalized_click_ids
      : undefined,
    normalized_attribution: Object.keys(now.normalized_attribution || {}).length
      ? now.normalized_attribution
      : undefined,
    identity: identityPayload,
    device: deviceContext?.device,
    device_model: deviceContext?.device_model,
    browser: deviceContext?.browser,
    os: deviceContext?.os,
    language: deviceContext?.language,
    screen_resolution: deviceContext?.screen_resolution,
    screen_width:
      typeof screen !== "undefined" && screen.width ? Math.floor(screen.width) : undefined,
    screen_height:
      typeof screen !== "undefined" && screen.height ? Math.floor(screen.height) : undefined,
    person_id: typeof state.personId === "string" && state.personId ? state.personId : undefined,
    first_touch: first || undefined,
    last_touch: storedLastTouch || undefined,
    session_touch: storedSessionTouch || undefined,
    clarity_id: readClarityCookieValue() || undefined,
    ...props,
    client_event_id,
    ...(typeof location !== "undefined"
      ? {
          url: (props && typeof props.url === "string" && props.url.trim()) || location.href,
          path:
            (props && typeof props.path === "string" && props.path.trim()) ||
            location.pathname + location.search,
          title:
            (props && typeof props.title === "string" && props.title.trim()) ||
            (typeof document !== "undefined" ? document.title : undefined),
        }
      : {}),
    ...buildGa4MetricsPayload({ siteKey: state.siteKey }),
    ...buildMetaBrowserPayload({ siteKey: state.siteKey }, now.clickIds),
    ...buildGoogleClickPayload(
      { siteKey: state.siteKey },
      { clickIds: now.clickIds, raw_query_params: now.raw_query_params },
    ),
  };

  enrichPayloadWithMarketingChannel(/** @type {Record<string, unknown>} */ (payload));
  const resolvedTouch = buildResolvedTouchFromPayload(payload);
  const touchState = updateStoredTouches({ siteKey: state.siteKey }, resolvedTouch);
  payload.last_touch = touchState.lastTouch || undefined;
  payload.session_touch = touchState.sessionTouch || undefined;

  const dedupeKey = buildIngestDedupeKey(payload);
  const dedupeSk = dedupeKey ? dedupeStorageKey(state.siteKey, dedupeKey) : "";

  if (dedupeSk) {
    const inflight = inFlightByDedupeKey.get(dedupeSk);
    if (inflight) return inflight;
  }

  if (dedupeKey && shouldSkipIngestDedupe(state.siteKey, dedupeKey)) {
    return false;
  }

  const deliver = async () => {
    try {
      const critical = new Set([
        "page_view",
        "landing_page_view",
        "view_item",
        "view_content",
        "add_to_cart",
        "view_cart",
        "remove_from_cart",
        "remove_cart",
        "begin_checkout",
        "initiate_checkout",
        "purchase",
        "checkout_form_started",
        "checkout_form_completed",
        "checkout_form_abandoned",
        "first_name_added",
        "last_name_added",
        "phone_number_added",
        "email_address_added",
        "address_added",
        "city_added",
        "state_added",
        "postal_code_added",
        "country_added",
      ]);
      return critical.has(event)
        ? await sendNow(/** @type {any} */ (state), payload)
        : await enqueueOrSend(/** @type {any} */ (state), payload);
    } catch {
      return false;
    }
  };

  const promise = deliver();
  if (dedupeSk) {
    inFlightByDedupeKey.set(dedupeSk, promise);
    promise.finally(() => {
      if (inFlightByDedupeKey.get(dedupeSk) === promise) inFlightByDedupeKey.delete(dedupeSk);
    });
  }
  return promise;
}

export function installLifecycleFlush() {
  if (typeof document === "undefined") return;
  const run = () => void flushPending({ preferBeacon: true });
  document.addEventListener("pagehide", run, { capture: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") run();
  });
}
