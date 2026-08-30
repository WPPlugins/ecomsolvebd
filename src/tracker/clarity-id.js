/**
 * Microsoft Clarity `_clck` cookie helpers.
 * Cookie value looks like: `1chodmg^2^g87^0^2403` (URL-encoded uses %5E for ^).
 * Clarity often sets `_clck` AFTER our first page_view — callers should retry briefly.
 */
import { readCookie } from "./cookie.js";

/**
 * @param {string} raw
 * @returns {string}
 */
export function normalizeClarityCookieValue(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  try {
    // Cookie jar may be single- or double-encoded (%5E vs ^).
    s = decodeURIComponent(s);
    if (/%[0-9a-f]{2}/i.test(s)) {
      try {
        s = decodeURIComponent(s);
      } catch {
        /* keep once-decoded */
      }
    }
  } catch {
    /* keep raw */
  }
  return s.slice(0, 256);
}

/**
 * Clarity user id = first segment before `^`.
 * @param {string} raw
 * @returns {string}
 */
export function clarityUserIdFromCookie(raw) {
  const full = normalizeClarityCookieValue(raw);
  if (!full) return "";
  const first = full.split("^")[0]?.trim() || "";
  return first.slice(0, 64);
}

/**
 * @returns {string} Raw `_clck` cookie value (possibly encoded), or ""
 */
function readClckRaw() {
  const viaHelper = readCookie("_clck");
  if (viaHelper) return viaHelper;
  if (typeof document === "undefined") return "";
  const m = String(document.cookie || "").match(/(?:^|;\s*)_clck=([^;]*)/);
  if (!m || !m[1]) return "";
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/**
 * Read `_clck` and return only the Clarity user id (segment before `^`).
 * @returns {string}
 */
export function readClarityCookieValue() {
  return clarityUserIdFromCookie(readClckRaw());
}

/**
 * Clarity often writes `_clck` a moment after page load. Poll briefly, then notify.
 * @param {(clarityId: string) => void} onFound
 * @param {{ maxMs?: number, intervalMs?: number }} [opts]
 */
export function whenClarityIdAvailable(onFound, opts = {}) {
  const maxMs = typeof opts.maxMs === "number" ? opts.maxMs : 20000;
  const intervalMs = typeof opts.intervalMs === "number" ? opts.intervalMs : 500;
  const immediate = readClarityCookieValue();
  if (immediate) {
    onFound(immediate);
    return () => {};
  }
  const started = Date.now();
  const timer = setInterval(() => {
    const id = readClarityCookieValue();
    if (id) {
      clearInterval(timer);
      onFound(id);
      return;
    }
    if (Date.now() - started >= maxMs) clearInterval(timer);
  }, intervalMs);
  return () => clearInterval(timer);
}
