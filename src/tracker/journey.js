import { readCookie, writeCookie } from "./cookie.js";
import { lsGet, lsSet } from "./local-store.js";
import { storageKey, journeyCookieName } from "./storage-keys.js";
import { generateShortId } from "./visitor-id.js";

const DEFAULT_TTL_DAYS = 30;

/**
 * Attribution journey id: stable across multiple sessions for a limited TTL.
 * @param {{ siteKey?: string }} cfg
 * @param {{ ttlDays?: number }} [opts]
 */
export function getOrCreateJourneyId(cfg, opts = {}) {
  const ttlDays = Math.max(1, Math.floor(Number(opts.ttlDays ?? DEFAULT_TTL_DAYS)));
  const maxAge = ttlDays * 24 * 60 * 60;

  const idKey = storageKey(cfg, "journey_id");
  const metaKey = storageKey(cfg, "journey_meta");
  const cname = journeyCookieName(cfg);

  const now = Date.now();

  let id = readCookie(cname) || lsGet(idKey);
  let metaRaw = lsGet(metaKey);
  /** @type {{ exp?: number }} */
  let meta = {};
  if (metaRaw) {
    try {
      meta = JSON.parse(metaRaw) || {};
    } catch {
      meta = {};
    }
  }

  const valid = id && /^j_[a-z0-9]{8,16}$/.test(id) && typeof meta.exp === "number" && meta.exp > now;
  if (!valid) {
    id = `j_${generateShortId(12)}`;
    meta = { exp: now + ttlDays * 24 * 60 * 60 * 1000 };
  }

  writeCookie(cname, id, maxAge);
  lsSet(idKey, id);
  lsSet(metaKey, JSON.stringify(meta));

  return id;
}

