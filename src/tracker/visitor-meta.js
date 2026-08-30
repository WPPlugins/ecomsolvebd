import { lsGet, lsSet } from "./local-store.js";
import { storageKey } from "./storage-keys.js";

/**
 * @param {{ siteKey?: string }} cfg
 */
export function getOrCreateVisitorMeta(cfg) {
  const key = storageKey(cfg, "visitor_meta");
  const nowSec = Math.floor(Date.now() / 1000);

  /** @type {{ first_seen_at?: number, last_seen_at?: number }} */
  let meta = {};
  const raw = lsGet(key);
  if (raw) {
    try {
      meta = JSON.parse(raw) || {};
    } catch {
      meta = {};
    }
  }

  if (typeof meta.first_seen_at !== "number") meta.first_seen_at = nowSec;
  meta.last_seen_at = nowSec;

  lsSet(key, JSON.stringify(meta));
  return meta;
}

