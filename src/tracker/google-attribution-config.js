/**
 * Merchant Google backup param from SaaS API (cached in localStorage).
 */
import { lsGet, lsSet } from "./local-store.js";
import { storageKey } from "./storage-keys.js";

var cachedParam = null;
var fetchPromise = null;

function sanitizeBackupParam(raw) {
  var t = String(raw || "")
    .replace(/^\s+|\s+$/g, "")
    .toLowerCase();
  if (!t || t.length > 64) return "";
  if (!/^[a-z][a-z0-9_.]*$/.test(t)) return "";
  return t;
}

/**
 * Resolve API base from collect / master-ingest endpoint.
 * @param {string} endpoint
 * @returns {string}
 */
export function apiBaseFromCollectEndpoint(endpoint) {
  try {
    var raw = String(endpoint || "").trim();
    if (!raw) return "";
    var baseHref =
      typeof location !== "undefined" && location.href ? location.href : "https://localhost/";
    var u = new URL(raw, baseHref);
    u.search = "";
    u.hash = "";
    var path = u.pathname.replace(/\/+$/, "");
    path = path
      .replace(/\/v1\/events\/master-ingest$/i, "")
      .replace(/\/v1\/tracking\/collect$/i, "")
      .replace(/\/wp-json\/ecomso\/v1\/master-ingest$/i, "/wp-json/ecomso/v1")
      .replace(/\/wp-json\/ecomso\/v1\/ingest$/i, "/wp-json/ecomso/v1")
      .replace(/\/wp-json\/esb\/v1\/master-ingest$/i, "/wp-json/esb/v1")
      .replace(/\/wp-json\/esb\/v1\/ingest$/i, "/wp-json/esb/v1")
      .replace(/\/wp-json\/fct\/v1\/master-ingest$/i, "/wp-json/fct/v1")
      .replace(/\/wp-json\/fct\/v1\/ingest$/i, "/wp-json/fct/v1");
    u.pathname = path;
    return u.origin + path;
  } catch (e) {
    return "";
  }
}

/**
 * @param {string} endpoint Collect or master-ingest endpoint URL.
 * @param {string} merchantId
 * @returns {string}
 */
function attributionConfigUrl(endpoint, merchantId, explicitUrl) {
  try {
    var key = String(merchantId || "").trim();
    if (explicitUrl && String(explicitUrl).trim()) {
      var u = String(explicitUrl).trim();
      try {
        var parsed = new URL(
          u,
          typeof location !== "undefined" ? location.href : "https://localhost/",
        );
        if (key && !parsed.searchParams.get("key")) {
          parsed.searchParams.set("key", key);
        }
        return parsed.toString();
      } catch (eExplicit) {
        if (key && u.indexOf("key=") < 0) {
          return u + (u.indexOf("?") >= 0 ? "&" : "?") + "key=" + encodeURIComponent(key);
        }
        return u;
      }
    }
    var base = apiBaseFromCollectEndpoint(endpoint);
    if (!base) return "";
    var url;
    try {
      var bu = new URL(base, typeof location !== "undefined" ? location.href : "https://localhost/");
      if (/\/wp-json\/(esb|fct)\/v1$/i.test(bu.pathname)) {
        url = bu.origin + bu.pathname.replace(/\/+$/, "") + "/attribution-config";
      } else {
        url = base.replace(/\/+$/, "") + "/v1/tracking/attribution-config";
      }
    } catch (eUrl) {
      url = base.replace(/\/+$/, "") + "/v1/tracking/attribution-config";
    }
    return url + "?key=" + encodeURIComponent(merchantId);
  } catch (e) {
    return "";
  }
}

/**
 * @param {{ siteKey?: string, endpoint?: string, merchantId?: string }} cfg
 */
function authBlockedKey(cfg) {
  return storageKey(cfg, "merchant_key_unauthorized");
}

export function prefetchGoogleAttributionConfig(cfg) {
  if (!cfg || !cfg.endpoint || !cfg.merchantId) return;
  try {
    if (lsGet(authBlockedKey(cfg)) === "1") return;
  } catch (e0) {
    /* ignore */
  }
  var key = storageKey(cfg, "google_backup_param");
  var fetchedAtKey = storageKey(cfg, "google_backup_param_at");
  var stored = lsGet(key);
  if (stored) {
    cachedParam = sanitizeBackupParam(stored);
  }
  // Skip network when we already have a cached param from the last 12h (store_proxy hits same host rate limits).
  try {
    var at = parseInt(String(lsGet(fetchedAtKey) || "0"), 10) || 0;
    if (cachedParam && at > 0 && Date.now() - at < 12 * 60 * 60 * 1000) {
      return;
    }
  } catch (eTtl) {
    /* ignore */
  }
  if (fetchPromise) return;
  var url = attributionConfigUrl(cfg.endpoint, cfg.merchantId, cfg.attributionConfigUrl);
  if (!url || typeof fetch === "undefined") return;

  /** @type {Record<string, string>} */
  var headers = {};
  if (cfg.merchantId) headers["x-merchant-key"] = String(cfg.merchantId).trim();
  try {
    var host = new URL(url).hostname.toLowerCase();
    if (host.includes("ngrok")) headers["ngrok-skip-browser-warning"] = "true";
  } catch (eH) {
    /* ignore */
  }

  var cred = cfg.credentials === "include" || cfg.credentials === "same-origin" ? cfg.credentials : "omit";

  fetchPromise = fetch(url, {
    method: "GET",
    credentials: cred,
    cache: "no-store",
    headers: headers,
  })
    .then(function (res) {
      if (!res) return null;
      if (res.status === 401 || res.status === 403) {
        try {
          lsSet(authBlockedKey(cfg), "1");
        } catch (e401) {
          /* ignore */
        }
        return null;
      }
      if (!res.ok) return null;
      return res.json();
    })
    .then(function (j) {
      var p =
        j && j.data && j.data.google_backup_param
          ? sanitizeBackupParam(j.data.google_backup_param)
          : "";
      if (p) {
        cachedParam = p;
        try {
          lsSet(key, p);
          lsSet(fetchedAtKey, String(Date.now()));
        } catch (e2) {
          /* ignore */
        }
      } else if (cachedParam) {
        try {
          lsSet(fetchedAtKey, String(Date.now()));
        } catch (e3) {
          /* ignore */
        }
      }
      return p;
    })
    .catch(function () {
      return null;
    })
    .finally(function () {
      fetchPromise = null;
    });
}

/**
 * @param {{ siteKey?: string }} cfg
 * @returns {string}
 */
export function getGoogleBackupParam(cfg) {
  if (cachedParam) return cachedParam;
  try {
    var p = sanitizeBackupParam(lsGet(storageKey(cfg, "google_backup_param")));
    if (p) cachedParam = p;
    return p || "";
  } catch (e) {
    return "";
  }
}
