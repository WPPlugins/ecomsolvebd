import { getEngagementTimeMsec } from "./engagement-time.js";
import { readGa4CookieMetrics } from "./ga-cookies.js";
import { getOrCreateSassClientId } from "./sass-client-id.js";

/**
 * GA4-compatible enrichment merged into every collect payload.
 * @param {{ siteKey?: string }} cfg
 * @returns {Record<string, string | number>}
 */
export function buildGa4MetricsPayload(cfg) {
  /** @type {Record<string, string | number>} */
  var out = {};

  try {
    out.sass_client_id = getOrCreateSassClientId(cfg);
  } catch (e) {
    /* ignore */
  }

  try {
    out.timestamp_micros = Date.now() * 1000;
  } catch (e2) {
    /* ignore */
  }

  try {
    out.engagement_time_msec = getEngagementTimeMsec();
  } catch (e3) {
    /* ignore */
  }

  try {
    var ga = readGa4CookieMetrics();
    if (ga.client_id) out.client_id = ga.client_id;
    if (ga.ga_session_id) out.ga_session_id = String(ga.ga_session_id);
    if (ga.ga_session_number) out.ga_session_number = String(ga.ga_session_number);
  } catch (e4) {
    /* ignore */
  }

  return out;
}
