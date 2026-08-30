/**
 * Universal query-string capture: raw params, normalized click IDs, and attribution (UTM, etc.).
 * Backward compatible: `clickIds` === `normalized_click_ids`, `utm` holds utm_* only (lowercase keys).
 */

/** @param {string} s */
function safeDecodeURIComponent(s) {
  if (s === "") return "";
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s.replace(/\+/g, " ");
  }
}

/**
 * Parse application/x-www-form-urlencoded query segment into raw key → value | value[].
 * Preserves first-seen key casing; supports duplicate keys (arrays).
 * @param {string} searchWithOptionalQuestion
 * @returns {Record<string, string | string[]>}
 */
export function parseRawQueryParamsFromSearch(searchWithOptionalQuestion) {
  const q = String(searchWithOptionalQuestion || "").replace(/^\?/, "");
  /** @type {Record<string, string | string[]>} */
  const raw = {};
  if (!q) return raw;

  for (const part of q.split("&")) {
    if (part === "") continue;
    const eq = part.indexOf("=");
    const encKey = eq === -1 ? part : part.slice(0, eq);
    const encVal = eq === -1 ? "" : part.slice(eq + 1);
    const key = safeDecodeURIComponent(encKey);
    const val = safeDecodeURIComponent(encVal);
    if (key === "") continue;
    if (!Object.prototype.hasOwnProperty.call(raw, key)) {
      raw[key] = val;
    } else {
      const cur = raw[key];
      if (Array.isArray(cur)) {
        cur.push(val);
      } else {
        raw[key] = [cur, val];
      }
    }
  }
  return raw;
}

/** Known ad / click identifiers (lowercase). Custom future params still caught via heuristics. */
const KNOWN_CLICK_ID_KEYS = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "ttclid",
  "msclkid",
  "li_fat_id",
  "epik",
  "twclid",
  "rdt_cid",
  "sccid",
  "tb_clickid",
  "ob_click_id",
  "qclid",
  "yclid",
  "aaid",
  "irclickid",
  "cjevent",
  "sscid",
  "pscd",
  "vlid",
  "gbraid",
  "wbraid",
]);

/** Non-click attribution tokens (lowercase). */
const KNOWN_ATTRIBUTION_KEYS = new Set(["gclsrc", "srsltid", "ref"]);

/**
 * @param {string} lower
 * @returns {boolean}
 */
function isLikelyClickIdKey(lower) {
  if (lower.startsWith("utm_")) return false;
  if (KNOWN_CLICK_ID_KEYS.has(lower)) return true;
  if (lower.endsWith("_clid")) return true;
  if (lower.endsWith("clid") && lower.length >= 5) return true;
  if (lower.endsWith("_cid") && lower.length >= 6) return true;
  if (lower.includes("clickid")) return true;
  if (lower.includes("click_id")) return true;
  return false;
}

/**
 * @param {string} lower
 * @returns {boolean}
 */
function isAttributionMarketingKey(lower) {
  if (lower.startsWith("utm_")) return true;
  if (KNOWN_ATTRIBUTION_KEYS.has(lower)) return true;
  return false;
}

/**
 * First scalar string for a raw entry (arrays → first element), URL-decoded already from parse.
 * @param {string | string[] | undefined} v
 */
function firstScalar(v) {
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) {
    for (const x of v) {
      const s = String(x);
      if (s !== "") return s;
    }
    return "";
  }
  return String(v);
}

/**
 * Dedupe: same normalized key → keep first non-empty scalar; identical repeated values collapse to one.
 * @param {Record<string, string | string[]>} raw
 * @param {(origKey: string, lower: string) => boolean} pick
 * @returns {Record<string, string>}
 */
function buildNormalizedStringMap(raw, pick) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const origKey of Object.keys(raw)) {
    const lower = origKey.toLowerCase();
    if (!pick(origKey, lower)) continue;
    const scalar = firstScalar(raw[origKey]).trim();
    if (scalar === "") continue;
    if (out[lower] !== undefined) continue;
    out[lower] = scalar;
  }
  return out;
}

/**
 * @param {Record<string, string | string[]>} raw
 * @returns {{ normalized_click_ids: Record<string, string>, normalized_attribution: Record<string, string>, utm: Record<string, string> }}
 */
function splitAttribution(raw) {
  const normalized_click_ids = buildNormalizedStringMap(raw, (_orig, lower) => isLikelyClickIdKey(lower));
  const normalized_attribution = buildNormalizedStringMap(raw, (_orig, lower) => isAttributionMarketingKey(lower));

  /** @type {Record<string, string>} */
  const utm = {};
  for (const k of Object.keys(normalized_attribution)) {
    if (k.startsWith("utm_")) utm[k] = normalized_attribution[k];
  }

  return { normalized_click_ids, normalized_attribution, utm };
}

/**
 * Parse marketing params from an absolute URL string.
 * @param {string} href
 */
export function captureFromUrl(href) {
  let u;
  try {
    u = new URL(href);
  } catch {
    return {
      clickIds: {},
      utm: {},
      raw_query_params: {},
      normalized_click_ids: {},
      normalized_attribution: {},
      href: String(href || ""),
      pathname: "",
      search: "",
    };
  }

  const raw_query_params = parseRawQueryParamsFromSearch(u.search);
  const { normalized_click_ids, normalized_attribution, utm } = splitAttribution(raw_query_params);

  /** Backward compatible: legacy `clickIds` is the normalized click-id map (lowercase keys). */
  const clickIds = normalized_click_ids;

  return {
    clickIds,
    utm,
    raw_query_params,
    normalized_click_ids,
    normalized_attribution,
    href: u.href,
    pathname: u.pathname,
    search: u.search,
  };
}

/**
 * @param {Location} [loc]
 */
export function captureCurrent(loc) {
  const l = loc || (typeof location !== "undefined" ? location : null);
  if (!l) {
    return {
      clickIds: {},
      utm: {},
      raw_query_params: {},
      normalized_click_ids: {},
      normalized_attribution: {},
      href: "",
      pathname: "",
      search: "",
    };
  }
  return captureFromUrl(l.href);
}

/**
 * Stable signature string for campaign / session rotation (all click ids + utm_campaign).
 * @param {{ normalized_click_ids?: Record<string, string>, clickIds?: Record<string, string>, utm?: Record<string, string>, normalized_attribution?: Record<string, string> }} snap
 */
export function buildCampaignSignature(snap) {
  const clicks = snap.normalized_click_ids || snap.clickIds || {};
  const utm = snap.utm || {};
  const nattr = snap.normalized_attribution || {};
  const utmCampaign = utm.utm_campaign || nattr.utm_campaign || "";
  const clickPart = Object.keys(clicks)
    .sort()
    .map((k) => `${k}=${clicks[k]}`)
    .join("&");
  return `${clickPart}|${utmCampaign}`;
}
