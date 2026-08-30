import { readCookie, writeCookie } from "./cookie.js";
import { lsGet, lsSet } from "./local-store.js";
import { cookieName, storageKey } from "./storage-keys.js";

const CHARSET = "0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * @param {number} length 5–6 recommended
 */
export function generateShortId(length = 6) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i += 1) out += CHARSET[bytes[i] % CHARSET.length];
  return out;
}

/**
 * Semi-stable per device + registrable domain: persisted in localStorage + cookie.
 * @param {{ siteKey?: string }} cfg
 * @param {{ length?: number, maxAgeSeconds?: number }} [opts]
 */
export function getOrCreateUserId(cfg, opts = {}) {
  const len = Math.min(8, Math.max(5, opts.length ?? 6));
  const maxAge = opts.maxAgeSeconds ?? 60 * 60 * 24 * 730; // ~2 years
  const key = storageKey(cfg, "uid");
  const cname = cookieName(cfg);

  let id = readCookie(cname) || lsGet(key);
  id = id && /^[a-z0-9]{5,8}$/.test(id) ? id : "";

  if (!id) {
    id = generateShortId(len);
    writeCookie(cname, id, maxAge);
    lsSet(key, id);
    return id;
  }

  // Refresh persistence (cookie may have expired; LS may be missing)
  writeCookie(cname, id, maxAge);
  lsSet(key, id);
  return id;
}
