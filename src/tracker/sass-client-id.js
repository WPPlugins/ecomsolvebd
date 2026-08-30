import { readCookie, writeCookie } from "./cookie.js";
import { lsGet, lsSet } from "./local-store.js";
import { sassClientCookieName, storageKey } from "./storage-keys.js";

var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var GA_CID_RE = /^\d+\.\d+$/;

/**
 * GA4-style client id (`1234567890.1234567890`) — same shape as `_ga` cookie, first-party SaaS id.
 * @returns {string}
 */
export function generateGaStyleSassClientId() {
  var a = Math.floor(Math.random() * 2147483646) + 1;
  var b = Math.floor(Date.now() / 1000);
  return String(a) + "." + String(b);
}

/**
 * Permanent SaaS visitor id — separate from short `user_id` and GA `client_id`.
 * @param {{ siteKey?: string }} cfg
 * @returns {string}
 */
export function getOrCreateSassClientId(cfg) {
  var key = storageKey(cfg, "sass_client_id");
  var cname = sassClientCookieName(cfg);
  var maxAge = 60 * 60 * 24 * 730;

  var id = "";
  try {
    id = lsGet(key) || readCookie(cname) || "";
  } catch (e) {
    id = "";
  }
  id = id && (GA_CID_RE.test(id) || UUID_RE.test(id)) ? id : "";

  if (id && UUID_RE.test(id)) {
    id = "";
  }

  if (!id) {
    id = generateGaStyleSassClientId();
    try {
      lsSet(key, id);
    } catch (eLs) {
      /* ignore */
    }
    try {
      writeCookie(cname, id, maxAge);
    } catch (eCk) {
      /* ignore */
    }
    return id;
  }

  try {
    lsSet(key, id);
  } catch (e2) {
    /* ignore */
  }
  try {
    writeCookie(cname, id, maxAge);
  } catch (e3) {
    /* ignore */
  }
  return id;
}
