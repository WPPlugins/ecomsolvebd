/**
 * @typedef {Object} TrackerInit
 * @property {string} endpoint Full URL for POST JSON ingest (e.g. https://api.example.com/api/v1/tracking/collect)
 * @property {string} [attributionConfigUrl] GET URL for Google backup param (set by WordPress plugin)
 * @property {string} [siteKey] Optional namespace for storage keys / multi-site installs
 * @property {boolean} [autoPageView=true] Fire page_view on init when document is ready
 * @property {RequestCredentials} [credentials="omit"] fetch credentials mode
 * @property {string} [merchantId] Public Merchant ID (tracking key) sent as `x-merchant-key`
 * @property {number} [batchFlushMs=0] Debounced batch window (ms); 0 = send immediately
 * @property {number} [sessionTimeoutMs] Session inactivity timeout (default 30 min)
 * @property {number} [journeyTtlDays=30] Attribution journey window (days)
 * @property {boolean} [resetSessionOnCampaignChange=false] If click-id/UTM campaign changes, rotate session (+1 session_number)
 * @property {string} [personId] Server `person_id` (cuid) after login — sent on collects for identity graph
 * @property {Record<string, string>} [identityHints] Extra identity fields (e.g. `email_hash`, `customer_id`) merged with browser signals
 * @property {Record<string, string>} [requestHeaders] Extra fetch headers (e.g. ngrok-skip-browser-warning)
 * @property {string} [pluginVersion] WordPress plugin version
 * @property {{ href: string, referrer?: string }|null} [precapturedLanding] True landing href/referrer
 *   frozen by an earlier `<head>` snippet (e.g. hosted CMS storefront) — preferred over the live
 *   `location.href` when establishing first-touch, since by the time `init()` runs the SPA may
 *   already have navigated away from the actual landing page.
 */

/** @param {Partial<TrackerInit>} next */
export function mergeDefaults(next) {
  const merchantId = next.merchantId ? String(next.merchantId).trim() : "";
  /** @type {Record<string, string>} */
  const requestHeaders = {};
  if (merchantId && merchantId.length <= 128) {
    requestHeaders["x-merchant-key"] = merchantId;
  }

  const endpoint = String(next.endpoint || "");
  if (endpoint) {
    try {
      const host = new URL(endpoint).hostname.toLowerCase();
      if (host.includes("ngrok")) {
        requestHeaders["ngrok-skip-browser-warning"] = "true";
      }
    } catch {
      /* ignore */
    }
  }

  if (next.requestHeaders && typeof next.requestHeaders === "object") {
    for (const [k, v] of Object.entries(next.requestHeaders)) {
      if (typeof k !== "string" || typeof v !== "string") continue;
      const val = v.trim();
      if (!val || val.length > 512) continue;
      requestHeaders[k.slice(0, 64)] = val.slice(0, 512);
    }
  }

  /** @type {Record<string, string>} */
  const identityHints = {};
  if (next.identityHints && typeof next.identityHints === "object") {
    for (const [k, v] of Object.entries(next.identityHints)) {
      if (typeof k !== "string" || typeof v !== "string") continue;
      const val = v.trim();
      if (!val || val.length > 512) continue;
      identityHints[k.slice(0, 64)] = val.slice(0, 512);
    }
  }

  const personId =
    next.personId && String(next.personId).trim().length >= 20 ? String(next.personId).trim().slice(0, 32) : "";

  return {
    endpoint: String(next.endpoint || ""),
    attributionConfigUrl: next.attributionConfigUrl ? String(next.attributionConfigUrl).trim() : "",
    siteKey: next.siteKey ? String(next.siteKey) : "",
    autoPageView: next.autoPageView !== false,
    credentials: /** @type {RequestCredentials} */ (next.credentials || "omit"),
    merchantId,
    batchFlushMs: Math.max(0, Number(next.batchFlushMs) || 0),
    sessionTimeoutMs: Math.max(60_000, Number(next.sessionTimeoutMs) || 30 * 60 * 1000),
    journeyTtlDays: Math.max(1, Math.floor(Number(next.journeyTtlDays) || 30)),
    resetSessionOnCampaignChange: Boolean(next.resetSessionOnCampaignChange),
    requestHeaders,
    personId,
    identityHints,
    pluginVersion: next.pluginVersion ? String(next.pluginVersion).trim() : "",
    precapturedLanding:
      next.precapturedLanding &&
      typeof next.precapturedLanding === "object" &&
      typeof next.precapturedLanding.href === "string" &&
      next.precapturedLanding.href
        ? {
            href: String(next.precapturedLanding.href).slice(0, 2048),
            referrer:
              typeof next.precapturedLanding.referrer === "string"
                ? String(next.precapturedLanding.referrer).slice(0, 2048)
                : "",
          }
        : null,
  };
}
