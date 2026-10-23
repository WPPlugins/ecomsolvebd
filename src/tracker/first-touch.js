import { writeCookie } from "./cookie.js";
import { lsGet, lsSet } from "./local-store.js";
import { attributionCookieName, storageKey } from "./storage-keys.js";

const ATTR_COOKIE_MAX = 180 * 24 * 60 * 60; // ~6 months — attribution persistence

function mirrorFirstTouchCookie(cfg, snapshot) {
  try {
    const compact = {
      v: 2,
      at: snapshot.occurredAt,
      u: snapshot.landingUrl,
      c: snapshot.clickIds || snapshot.normalized_click_ids || {},
      m: snapshot.utm,
    };
    const json = JSON.stringify(compact);
    if (json.length > 3500) return;
    writeCookie(attributionCookieName(cfg), json, ATTR_COOKIE_MAX);
  } catch {
    /* ignore */
  }
}

/**
 * Persist first landing context once (for attribution).
 * @param {{ siteKey?: string }} cfg
 * @param {{ occurredAt: string, landingUrl: string, clickIds: Record<string, string>, utm: Record<string, string>, raw_query_params?: Record<string, string | string[]>, normalized_click_ids?: Record<string, string>, normalized_attribution?: Record<string, string> }} snapshot
 */
export function ensureFirstTouch(cfg, snapshot) {
  const key = storageKey(cfg, "first_touch");
  const existing = lsGet(key);
  if (existing) {
    try {
      return { snapshot: JSON.parse(existing), isNew: false };
    } catch {
      return { snapshot, isNew: false };
    }
  }
  lsSet(key, JSON.stringify(snapshot));
  mirrorFirstTouchCookie(cfg, snapshot);
  return { snapshot, isNew: true };
}

/** @param {{ siteKey?: string }} cfg */
export function readFirstTouch(cfg) {
  const key = storageKey(cfg, "first_touch");
  const raw = lsGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
