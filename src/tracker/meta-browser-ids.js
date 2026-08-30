/**
 * Meta _fbc / _fbp — original vs generated (fbclid landing only).
 * ES5-safe; reuses cookie + storage helpers.
 */
import { readCookie, writeCookie } from "./cookie.js";
import { lsGet, lsSet } from "./local-store.js";
import { storageKey } from "./storage-keys.js";

var META_COOKIE_MAX_AGE = 90 * 24 * 60 * 60;

function safeTrim(v) {
  if (v == null) return "";
  return String(v).replace(/^\s+|\s+$/g, "");
}

/**
 * @param {Record<string, string>|undefined} clickIds
 * @returns {string|null}
 */
function fbclidFromClickIds(clickIds) {
  try {
    if (!clickIds || typeof clickIds !== "object") return null;
    var v = clickIds.fbclid;
    if (typeof v === "string" && safeTrim(v)) return safeTrim(v).slice(0, 8000);
    return null;
  } catch (e) {
    return null;
  }
}

/** @param {{ siteKey?: string }} cfg */
function metaStoreKey(cfg) {
  return storageKey(cfg, "meta_browser_ids");
}

/**
 * @param {{ siteKey?: string }} cfg
 * @returns {Record<string, string>}
 */
function readMetaStore(cfg) {
  try {
    var raw = lsGet(metaStoreKey(cfg));
    if (!raw) return {};
    var parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (e) {
    /* ignore */
  }
  return {};
}

/**
 * @param {{ siteKey?: string }} cfg
 * @param {Record<string, string>} data
 */
function writeMetaStore(cfg, data) {
  try {
    lsSet(metaStoreKey(cfg), JSON.stringify(data || {}));
  } catch (e) {
    /* ignore */
  }
}

function randomFbpSuffix() {
  try {
    var n = Math.floor(Math.random() * 9000000000) + 1000000000;
    return String(n);
  } catch (e) {
    return String(Math.floor(Date.now() % 10000000000));
  }
}

/**
 * Run once per fbclid landing: capture originals, generate missing cookies.
 * @param {{ siteKey?: string }} cfg
 * @param {Record<string, string>|undefined} clickIds
 */
export function processMetaOnFbclidLanding(cfg, clickIds) {
  var fbclid = fbclidFromClickIds(clickIds);
  if (!fbclid) return;

  var store = readMetaStore(cfg);
  if (store.fbclid_processed === fbclid) return;

  var existingFbc = safeTrim(readCookie("_fbc"));
  var existingFbp = safeTrim(readCookie("_fbp"));
  var ts = Date.now();

  if (existingFbc) {
    store.original_fbc = existingFbc.slice(0, 512);
  }
  if (existingFbp) {
    store.original_fbp = existingFbp.slice(0, 512);
  }

  if (!existingFbc) {
    var genFbc = "fb.1." + ts + "." + fbclid;
    try {
      writeCookie("_fbc", genFbc, META_COOKIE_MAX_AGE);
    } catch (eW) {
      /* ignore */
    }
    store.generated_fbc = genFbc.slice(0, 512);
  }

  if (!existingFbp) {
    var genFbp = "fb.1." + ts + "." + randomFbpSuffix();
    try {
      writeCookie("_fbp", genFbp, META_COOKIE_MAX_AGE);
    } catch (eW2) {
      /* ignore */
    }
    store.generated_fbp = genFbp.slice(0, 512);
  }

  store.fbclid_processed = fbclid;
  writeMetaStore(cfg, store);
}

/**
 * Attach Meta browser fields + client_user_agent to every collect payload.
 * @param {{ siteKey?: string }} cfg
 * @param {Record<string, string>|undefined} [clickIds]
 * @returns {Record<string, string>}
 */
export function buildMetaBrowserPayload(cfg, clickIds) {
  var out = {};
  try {
    processMetaOnFbclidLanding(cfg, clickIds);
  } catch (e0) {
    /* ignore */
  }

  try {
    var store = readMetaStore(cfg);
    if (store.original_fbc) out.original_fbc = store.original_fbc;
    if (store.original_fbp) out.original_fbp = store.original_fbp;
    if (store.generated_fbc) out.generated_fbc = store.generated_fbc;
    if (store.generated_fbp) out.generated_fbp = store.generated_fbp;
  } catch (e1) {
    /* ignore */
  }

  try {
    if (typeof navigator !== "undefined" && navigator.userAgent) {
      var ua = safeTrim(navigator.userAgent);
      if (ua) out.client_user_agent = ua.slice(0, 512);
    }
  } catch (e2) {
    /* ignore */
  }

  return out;
}
