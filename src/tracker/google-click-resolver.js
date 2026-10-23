/**
 * Google Ads click ID resolution (gclid / wbraid / gbraid / backup param).
 * ES5-safe; Safari-first-party persistence.
 */
import { readCookie, writeCookie } from "./cookie.js";
import { lsGet, lsSet } from "./local-store.js";
import { getGoogleBackupParam } from "./google-attribution-config.js";
import { storageKey } from "./storage-keys.js";

var PERSIST_MAX_AGE = 90 * 24 * 60 * 60;
var COOKIE_NAME = "fct_google_clk";

function safeTrim(v) {
  if (v == null) return "";
  return String(v).replace(/^\s+|\s+$/g, "");
}

function pickClick(clickIds, key) {
  try {
    if (!clickIds || typeof clickIds !== "object") return "";
    var v = clickIds[key];
    if (typeof v === "string" && safeTrim(v)) return safeTrim(v).slice(0, 8000);
  } catch (e) {
    /* ignore */
  }
  return "";
}

/**
 * @param {Record<string, string>|undefined} clickIds
 * @param {Record<string, string | string[]>|undefined} rawQuery
 * @param {string} backupParam
 * @returns {string}
 */
function readBackupFromQuery(clickIds, rawQuery, backupParam) {
  var fromIds = pickClick(clickIds, backupParam);
  if (fromIds) return fromIds;
  if (!rawQuery || !backupParam) return "";
  try {
    var direct = rawQuery[backupParam];
    if (typeof direct === "string" && safeTrim(direct)) return safeTrim(direct).slice(0, 8000);
    if (Array.isArray(direct) && direct[0]) return safeTrim(String(direct[0])).slice(0, 8000);
    var lower = backupParam.toLowerCase();
    var v2 = rawQuery[lower];
    if (typeof v2 === "string" && safeTrim(v2)) return safeTrim(v2).slice(0, 8000);
  } catch (e) {
    /* ignore */
  }
  return "";
}

/**
 * @param {{ gclid?: string, wbraid?: string, gbraid?: string, backup_gclid?: string }} parts
 * @returns {{ final: string, source: string }}
 */
export function resolveFinalGoogleClickId(parts) {
  var p = parts || {};
  var gclid = safeTrim(p.gclid);
  var wbraid = safeTrim(p.wbraid);
  var gbraid = safeTrim(p.gbraid);
  var backup = safeTrim(p.backup_gclid);

  if (gclid) return { final: gclid.slice(0, 8000), source: "gclid" };
  if (wbraid) return { final: wbraid.slice(0, 8000), source: "wbraid" };
  if (gbraid) return { final: gbraid.slice(0, 8000), source: "gbraid" };
  if (backup) return { final: backup.slice(0, 8000), source: "backup_param" };
  return { final: "", source: "" };
}

/**
 * @param {{ siteKey?: string }} cfg
 * @returns {Record<string, string>}
 */
function readPersisted(cfg) {
  var out = {};
  try {
    var raw = lsGet(storageKey(cfg, "google_click_ids"));
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") out = parsed;
    }
  } catch (e) {
    /* ignore */
  }
  try {
    var ck = safeTrim(readCookie(COOKIE_NAME));
    if (ck) {
      var parsedCk = JSON.parse(ck);
      if (parsedCk && typeof parsedCk === "object") {
        for (var k in parsedCk) {
          if (Object.prototype.hasOwnProperty.call(parsedCk, k) && !out[k]) {
            out[k] = parsedCk[k];
          }
        }
      }
    }
  } catch (e2) {
    /* ignore */
  }
  return out;
}

/**
 * @param {{ siteKey?: string }} cfg
 * @param {Record<string, string>} data
 */
function writePersisted(cfg, data) {
  try {
    lsSet(storageKey(cfg, "google_click_ids"), JSON.stringify(data || {}));
  } catch (e) {
    /* ignore */
  }
  try {
    writeCookie(COOKIE_NAME, JSON.stringify(data || {}), PERSIST_MAX_AGE);
  } catch (e2) {
    /* ignore */
  }
}

/**
 * Resolve + persist Google click IDs for this hit.
 * @param {{ siteKey?: string }} cfg
 * @param {{ clickIds?: Record<string, string>, raw_query_params?: Record<string, string|string[]> }} snap
 * @returns {Record<string, string>}
 */
export function buildGoogleClickPayload(cfg, snap) {
  var clickIds = snap && snap.clickIds ? snap.clickIds : {};
  var raw = snap && snap.raw_query_params ? snap.raw_query_params : {};
  var backupParam = getGoogleBackupParam(cfg);

  var gclid = pickClick(clickIds, "gclid");
  var wbraid = pickClick(clickIds, "wbraid");
  var gbraid = pickClick(clickIds, "gbraid");
  var backupGclid = backupParam ? readBackupFromQuery(clickIds, raw, backupParam) : "";

  var resolved = resolveFinalGoogleClickId({
    gclid: gclid,
    wbraid: wbraid,
    gbraid: gbraid,
    backup_gclid: backupGclid,
  });

  var persisted = readPersisted(cfg);
  if (!gclid && persisted.gclid) gclid = persisted.gclid;
  if (!wbraid && persisted.wbraid) wbraid = persisted.wbraid;
  if (!gbraid && persisted.gbraid) gbraid = persisted.gbraid;
  if (!backupGclid && persisted.backup_gclid) backupGclid = persisted.backup_gclid;

  resolved = resolveFinalGoogleClickId({
    gclid: gclid,
    wbraid: wbraid,
    gbraid: gbraid,
    backup_gclid: backupGclid,
  });

  var store = {
    gclid: gclid || "",
    wbraid: wbraid || "",
    gbraid: gbraid || "",
    backup_gclid: backupGclid || "",
    final_google_click_id: resolved.final || "",
    google_click_source: resolved.source || "",
  };
  writePersisted(cfg, store);

  /** @type {Record<string, string>} */
  var out = {};
  if (store.gclid) out.gclid = store.gclid;
  if (store.wbraid) out.wbraid = store.wbraid;
  if (store.gbraid) out.gbraid = store.gbraid;
  if (store.backup_gclid) out.backup_gclid = store.backup_gclid;
  if (store.final_google_click_id) out.final_google_click_id = store.final_google_click_id;
  if (store.google_click_source) out.google_click_source = store.google_click_source;
  return out;
}
