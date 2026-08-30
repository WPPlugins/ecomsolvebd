/** @param {{ siteKey?: string }} cfg */
export function storageNamespace(cfg) {
  const host = typeof location !== "undefined" ? location.hostname : "unknown";
  const sk =
    cfg.siteKey && /^[a-zA-Z0-9_-]{1,32}$/.test(cfg.siteKey) ? `:${cfg.siteKey}` : "";
  return `fct${sk}:${host}`;
}

/** @param {{ siteKey?: string }} cfg @param {string} suffix */
export function storageKey(cfg, suffix) {
  return `${storageNamespace(cfg)}:${suffix}`;
}

/** @param {{ siteKey?: string }} cfg */
export function cookieName(cfg) {
  const sk =
    cfg.siteKey && /^[a-zA-Z0-9_-]{1,32}$/.test(cfg.siteKey) ? `_${cfg.siteKey}` : "";
  return `fct_uid${sk}`;
}

/** Session id cookie (GA-style engagement window; refreshed each hit). */
/** @param {{ siteKey?: string }} cfg */
export function sessionCookieName(cfg) {
  const sk =
    cfg.siteKey && /^[a-zA-Z0-9_-]{1,32}$/.test(cfg.siteKey) ? `_${cfg.siteKey}` : "";
  return `fct_sid${sk}`;
}

/** Compact first-touch mirror (cookie + LS). */
/** @param {{ siteKey?: string }} cfg */
export function attributionCookieName(cfg) {
  const sk =
    cfg.siteKey && /^[a-zA-Z0-9_-]{1,32}$/.test(cfg.siteKey) ? `_${cfg.siteKey}` : "";
  return `fct_ft${sk}`;
}

/** Attribution journey id cookie. */
/** @param {{ siteKey?: string }} cfg */
export function journeyCookieName(cfg) {
  const sk =
    cfg.siteKey && /^[a-zA-Z0-9_-]{1,32}$/.test(cfg.siteKey) ? `_${cfg.siteKey}` : "";
  return `fct_jid${sk}`;
}

/** Permanent SaaS client id (GA-style `N.N`, sass_client_id) — first-party cookie. */
/** @param {{ siteKey?: string }} cfg */
export function sassClientCookieName(cfg) {
  const sk =
    cfg.siteKey && /^[a-zA-Z0-9_-]{1,32}$/.test(cfg.siteKey) ? `_${cfg.siteKey}` : "";
  return `fct_sass_cid${sk}`;
}
