import { readCookie } from "./cookie.js";

/**
 * GA4 _ga cookie → client_id (e.g. 1076233809.1776658906).
 * @param {string} [gaRaw]
 * @returns {string|null}
 */
export function parseGaClientIdFromRaw(gaRaw) {
  try {
    if (!gaRaw || typeof gaRaw !== "string") return null;
    var t = gaRaw.trim();
    if (t.indexOf("GA1.") !== 0) return null;
    var parts = t.split(".");
    if (parts.length < 4) return null;
    var cid = String(parts[2]) + "." + String(parts[3]);
    if (!cid || cid === ".") return null;
    return cid.slice(0, 128);
  } catch (e) {
    return null;
  }
}

/** @returns {string|null} */
export function readGaClientIdFromDocument() {
  try {
    return parseGaClientIdFromRaw(readCookie("_ga"));
  } catch (e) {
    return null;
  }
}

/**
 * Find first _ga_* measurement cookie value (dynamic measurement id suffix).
 * @returns {string|null}
 */
function readGa4SessionCookieValue() {
  try {
    if (typeof document === "undefined") return null;
    var raw = String(document.cookie || "");
    if (!raw) return null;
    var parts = raw.split(";");
    for (var i = 0; i < parts.length; i++) {
      var seg = parts[i];
      if (!seg) continue;
      var eq = seg.indexOf("=");
      if (eq < 0) continue;
      var name = seg.slice(0, eq).replace(/^\s+|\s+$/g, "");
      if (name.indexOf("_ga_") === 0 && name.length > 4) {
        var val = seg.slice(eq + 1);
        try {
          val = decodeURIComponent(val);
        } catch (eDec) {
          /* keep raw */
        }
        if (val) return val.trim();
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Parse `_ga_<MEASUREMENT_ID>` cookie value.
 * - Dot form: `GS1.1.{session_id}.{session_number}.…`
 * - `s` + `$o` form: `GS2.1.s{session_id}$o{session_number}$…` (common gtag today)
 * - Legacy `$` form: `GS2.1.{session_id}$o{session_number}$…`
 * @param {string} raw
 * @returns {{ ga_session_id: string|null, ga_session_number: string|null }}
 */
export function parseGa4SessionCookieValue(raw) {
  var out = { ga_session_id: null, ga_session_number: null };
  try {
    if (!raw || typeof raw !== "string") return out;
    var v = raw.trim();

    // GS1.1.1717922127.4.1.1717922147.25.0.0
    var dotMatch = v.match(/^GS\d+\.\d+\.(\d+)\.(\d+)/);
    if (dotMatch) {
      out.ga_session_id = String(dotMatch[1]).slice(0, 32);
      out.ga_session_number = String(dotMatch[2]).slice(0, 16);
      return out;
    }

    // GS2.1.s1779225547$o1$g1$t1779225642…
    var sPrefix = v.match(/^GS\d+\.\d+\.s(\d+)/i);
    if (sPrefix) {
      out.ga_session_id = String(sPrefix[1]).slice(0, 32);
      var oAfterS = v.match(/\$o(\d+)\$/i);
      if (oAfterS && oAfterS[1]) {
        out.ga_session_number = String(oAfterS[1]).slice(0, 16);
      }
      return out;
    }

    // GS2.1.1779195474$o14$g0$…
    var prefixMatch = v.match(/^GS\d+\.\d+\./);
    if (!prefixMatch) return out;
    var rest = v.slice(prefixMatch[0].length);
    var dollar = rest.indexOf("$");
    if (dollar > 0) {
      var sid = rest.slice(0, dollar);
      if (/^\d+$/.test(sid)) out.ga_session_id = sid.slice(0, 32);
    }
    var oMatch = v.match(/\$o(\d+)\$/i);
    if (oMatch && oMatch[1]) {
      out.ga_session_number = String(oMatch[1]).slice(0, 16);
    }
    return out;
  } catch (e) {
    return out;
  }
}

/**
 * GA4 cookie metrics for every collect payload (null-safe).
 * @returns {{ client_id: string|null, ga_session_id: string|null, ga_session_number: string|null }}
 */
export function readGa4CookieMetrics() {
  var clientId = readGaClientIdFromDocument();
  var sessionRaw = readGa4SessionCookieValue();
  var session = parseGa4SessionCookieValue(sessionRaw || "");
  return {
    client_id: clientId,
    ga_session_id: session.ga_session_id,
    ga_session_number: session.ga_session_number,
  };
}
