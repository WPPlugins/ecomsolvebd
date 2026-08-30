import { mergeDefaults } from "./config.js";
import { initOutbox, installOutboxNetworkHandlers, scheduleDrainOutbox } from "./outbox.js";
import { installLifecycleFlush, trackEvent } from "./events.js";
import { setQueueLiveGetter } from "./queue.js";
import { ensureFirstTouch } from "./first-touch.js";
import { landingPageView, pageView } from "./pageview.js";
import { captureCurrent } from "./query-params.js";
import { getOrCreateSession } from "./session.js";
import { getOrCreateUserId } from "./visitor-id.js";
import { installBehaviorTracking } from "./behavior.js";
import { getOrCreateJourneyId } from "./journey.js";
import { getOrCreateVisitorMeta } from "./visitor-meta.js";
import { installEngagementTracking } from "./engagement-time.js";
import { processMetaOnFbclidLanding } from "./meta-browser-ids.js";
import { prefetchGoogleAttributionConfig } from "./google-attribution-config.js";
import { whenClarityIdAvailable } from "./clarity-id.js";
import { captureFromUrl } from "./query-params.js";
import { checkIpAccessGate } from "./ip-block-gate.js";
import { installCheckoutContactCapture } from "./checkout-contact-detect.js";

/** @type {(ReturnType<typeof mergeDefaults> & { userId?: string, sessionId?: string, sessionNumber?: number, journeyId?: string }) | null} */
let _state = null;

/**
 * After login / checkout identification, attach server person id and optional hashed identity hints.
 * @param {string} [personId]
 * @param {Record<string, string>} [identityHints]
 */
export function setPersonContext(personId, identityHints) {
  if (!_state) return false;
  if (personId && String(personId).trim().length >= 20) {
    _state.personId = String(personId).trim().slice(0, 32);
  }
  if (identityHints && typeof identityHints === "object") {
    _state.identityHints = { ...(_state.identityHints || {}), ...identityHints };
  }
  return true;
}

/**
 * Initialize tracker: attribution snapshot first, then visitor + session ids, optional auto page_view.
 * @param {import('./config.js').TrackerInit} options
 */
function isMerchantKeyBlocked(cfg) {
  try {
    const siteKey = cfg && cfg.siteKey ? String(cfg.siteKey) : "0";
    return sessionStorage.getItem(`esb:merchant_key_unauthorized:${siteKey}`) === "1";
  } catch {
    return false;
  }
}

export function init(options) {
  const cfg = mergeDefaults(options);
  if (!cfg.endpoint) {
    if (cfg.debug && typeof console !== "undefined") console.warn("[esb] endpoint missing");
    return null;
  }
  if (isMerchantKeyBlocked(cfg)) {
    if (cfg.debug && typeof console !== "undefined") {
      console.warn("[esb] tracking paused — invalid Merchant ID (fix in WP plugin settings)");
    }
    return null;
  }

  // Fire-and-forget IP gate (all platforms). Overlay is non-closable until merchant unblocks.
  void checkIpAccessGate(cfg);

  initOutbox(cfg.siteKey);
  installEngagementTracking();

  const snap = captureCurrent();
  // By the time init() finally runs (script load + config round trips can lag first paint by
  // seconds), an SPA may have already navigated away from the true landing page. A precaptured
  // snapshot (frozen synchronously at first paint by the host page) is the more trustworthy
  // source for what the *actual* landing URL/referrer was — only used for first-touch, never for
  // per-event `click_ids`/`utm`, which should keep reflecting the current page.
  const landingSnap = cfg.precapturedLanding?.href ? captureFromUrl(cfg.precapturedLanding.href) : snap;
  const landingReferrer = cfg.precapturedLanding
    ? cfg.precapturedLanding.referrer || undefined
    : typeof document !== "undefined"
      ? document.referrer || undefined
      : undefined;
  const firstTouch = ensureFirstTouch(
    { siteKey: cfg.siteKey },
    {
      occurredAt: new Date().toISOString(),
      landingUrl: landingSnap.href || (typeof location !== "undefined" ? location.href : snap.href),
      referrer: landingReferrer,
      clickIds: landingSnap.clickIds,
      utm: landingSnap.utm,
      raw_query_params: landingSnap.raw_query_params,
      normalized_click_ids: landingSnap.normalized_click_ids,
      normalized_attribution: landingSnap.normalized_attribution,
    },
  );
  const isNewVisitor = firstTouch.isNew;

  if (isNewVisitor) {
    try {
      processMetaOnFbclidLanding(
        { siteKey: cfg.siteKey },
        landingSnap.clickIds || landingSnap.normalized_click_ids || {},
      );
    } catch {
      /* ignore */
    }
  }

  const userId = getOrCreateUserId({ siteKey: cfg.siteKey });
  const sess = getOrCreateSession(
    { siteKey: cfg.siteKey },
    { sessionTimeoutMs: cfg.sessionTimeoutMs },
  );
  const journeyId = getOrCreateJourneyId({ siteKey: cfg.siteKey }, { ttlDays: cfg.journeyTtlDays });
  getOrCreateVisitorMeta({ siteKey: cfg.siteKey });

  _state = { ...cfg, userId, sessionId: sess.id, sessionNumber: sess.session_number, journeyId };
  try {
    prefetchGoogleAttributionConfig({
      siteKey: cfg.siteKey,
      endpoint: cfg.endpoint,
      merchantId: cfg.merchantId,
      attributionConfigUrl: cfg.attributionConfigUrl,
      credentials: cfg.credentials,
    });
  } catch {
    /* ignore */
  }

  setQueueLiveGetter(() => _state);
  installOutboxNetworkHandlers(() => _state);
  // Do not drain the full outbox on every page init — that re-fired failed POSTs and tripped host 429.
  // Background interval (45s) + pagehide flush still deliver the backlog.

  installLifecycleFlush();
  installBehaviorTracking(/** @type {any} */ (_state));
  installCheckoutContactCapture((event, props) => trackEvent(/** @type {any} */ (_state), event, props || {}));

  if (cfg.autoPageView) {
    if (typeof window !== "undefined") {
      window.__ECOMSO_PENDING_AUTO_PAGEVIEW__ = isNewVisitor ? "landing_page_view" : "page_view";
    }
    const run = () => {
      if (!_state?.userId) return;
      if (typeof window !== "undefined") {
        delete window.__ECOMSO_PENDING_AUTO_PAGEVIEW__;
      }
      if (isNewVisitor) {
        void landingPageView(/** @type {any} */ (_state), {});
      } else {
        void pageView(/** @type {any} */ (_state), {});
      }
    };
    queueMicrotask(run);

    if (typeof window !== "undefined") {
      window.addEventListener("pageshow", (event) => {
        if (!_state?.userId) return;
        if (!event.persisted) return;
        void pageView(/** @type {any} */ (_state), {});
      });
    }
  }

  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(
        new CustomEvent("esb:ready", {
          detail: { userId, sessionId: sess.id, sessionNumber: sess.session_number, journeyId },
        }),
      );
    } catch {
      /* IE / old browsers */
    }
  }

  // Clarity id is already attached on every later event via readClarityCookieValue().
  // One sync per session only (not every page) — avoids an extra master-ingest on each navigation.
  whenClarityIdAvailable((clarityId) => {
    if (!_state?.userId || !clarityId) return;
    try {
      const sk = `esb:clarity_synced:${cfg.siteKey || "0"}`;
      if (typeof sessionStorage !== "undefined") {
        if (sessionStorage.getItem(sk) === clarityId) return;
        sessionStorage.setItem(sk, clarityId);
      }
    } catch {
      /* ignore */
    }
    void trackEvent(/** @type {any} */ (_state), "esb_clarity_sync", {
      clarity_id: clarityId,
      path: typeof location !== "undefined" ? location.pathname + location.search : undefined,
      url: typeof location !== "undefined" ? location.href : undefined,
    });
  });

  return { userId, sessionId: sess.id, sessionNumber: sess.session_number, journeyId, config: cfg };
}

/** @param {{ path?: string, title?: string }} [extra] */
export function trackPageView(extra) {
  if (!_state?.userId) return Promise.resolve(false);
  return pageView(/** @type {any} */ (_state), extra);
}

/**
 * @param {string} event
 * @param {Record<string, unknown>} [props]
 */
export function track(event, props) {
  if (!_state?.userId) return Promise.resolve(false);
  return trackEvent(/** @type {any} */ (_state), event, props || {});
}

export function getState() {
  return _state ? { ..._state } : null;
}

/**
 * Hot-apply ingest URL / credentials after DNS verify (or delete) without resetting
 * visitor/session/outbox. Pending outbox rows keep the same `client_event_id` and are
 * delivered to the new endpoint on the next drain — no duplicate purchase identity.
 *
 * @param {Partial<import('./config.js').TrackerInit> & { ingestMode?: string }} partial
 * @returns {{ ok: boolean, endpointChanged: boolean }}
 */
export function updateIngestConfig(partial) {
  if (!_state || !partial || typeof partial !== "object") {
    return { ok: false, endpointChanged: false };
  }

  const next = mergeDefaults({
    ..._state,
    ...partial,
    // Never invent a blank endpoint that would pause tracking mid-session.
    endpoint: partial.endpoint != null ? String(partial.endpoint) : _state.endpoint,
    attributionConfigUrl:
      partial.attributionConfigUrl != null
        ? String(partial.attributionConfigUrl)
        : _state.attributionConfigUrl,
    credentials: partial.credentials != null ? partial.credentials : _state.credentials,
    merchantId: partial.merchantId != null ? String(partial.merchantId).trim() : _state.merchantId,
    requestHeaders:
      partial.requestHeaders && typeof partial.requestHeaders === "object"
        ? partial.requestHeaders
        : _state.requestHeaders,
    siteKey: _state.siteKey,
    autoPageView: _state.autoPageView,
    sessionTimeoutMs: _state.sessionTimeoutMs,
    journeyTtlDays: _state.journeyTtlDays,
    personId: _state.personId,
    identityHints: _state.identityHints,
    pluginVersion: partial.pluginVersion != null ? String(partial.pluginVersion) : _state.pluginVersion,
  });

  if (!next.endpoint) {
    return { ok: false, endpointChanged: false };
  }

  const prevEndpoint = String(_state.endpoint || "");
  const endpointChanged = prevEndpoint !== String(next.endpoint || "");

  // Preserve runtime identity — only transport fields change.
  _state.endpoint = next.endpoint;
  _state.attributionConfigUrl = next.attributionConfigUrl;
  _state.credentials = next.credentials;
  _state.merchantId = next.merchantId;
  _state.requestHeaders = next.requestHeaders;
  _state.pluginVersion = next.pluginVersion;
  if (typeof partial.ingestMode === "string") {
    /** @type {any} */ (_state).ingestMode = partial.ingestMode;
  }

  if (typeof window !== "undefined") {
    try {
      const prev =
        window.__ECOMSO_CONFIG__ && typeof window.__ECOMSO_CONFIG__ === "object" ? window.__ECOMSO_CONFIG__ : {};
      window.__ECOMSO_CONFIG__ = {
        ...prev,
        endpoint: _state.endpoint,
        attributionConfigUrl: _state.attributionConfigUrl,
        credentials: _state.credentials,
        merchantId: _state.merchantId,
        pluginVersion: _state.pluginVersion,
        ...(typeof partial.ingestMode === "string" ? { ingestMode: partial.ingestMode } : {}),
        ...(typeof partial.trackingHostname === "string"
          ? { trackingHostname: partial.trackingHostname }
          : {}),
      };
    } catch {
      /* ignore */
    }
  }

  if (endpointChanged || partial.attributionConfigUrl != null) {
    try {
      prefetchGoogleAttributionConfig({
        siteKey: _state.siteKey,
        endpoint: _state.endpoint,
        merchantId: _state.merchantId,
        attributionConfigUrl: _state.attributionConfigUrl,
        credentials: _state.credentials,
      });
    } catch {
      /* ignore */
    }
  }

  // Re-deliver pending outbox against the live host; payload + client_event_id unchanged.
  if (endpointChanged) {
    scheduleDrainOutbox(() => _state);
  }

  return { ok: true, endpointChanged };
}

const api = { init, trackPageView, track, getState, setPersonContext, updateIngestConfig };
export default api;
