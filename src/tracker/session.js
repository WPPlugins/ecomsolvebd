import { readCookie, writeCookie } from "./cookie.js";
import { lsGet, lsSet } from "./local-store.js";
import { sessionCookieName, storageKey } from "./storage-keys.js";
const DEFAULT_SESSION_MS = 30 * 60 * 1000; // GA default engagement timeout — 30 minutes

/**
 * GA4-like session: stable id until inactivity exceeds `sessionTimeoutMs`, then rotate.
 * Also tracks `session_number` (increment per visitor) and `started_at`.
 * @param {{ siteKey?: string }} cfg
 * @param {{ sessionTimeoutMs?: number, sessionMaxAgeSeconds?: number, forceNew?: boolean }} [opts]
 */
export function getOrCreateSession(cfg, opts = {}) {
  const timeoutMs = Math.max(60_000, opts.sessionTimeoutMs ?? DEFAULT_SESSION_MS);
  const maxAge = opts.sessionMaxAgeSeconds ?? 60 * 30; // cookie rolling ~30m (refreshed each event)

  const metaKey = storageKey(cfg, "sess_meta");
  const numKey = storageKey(cfg, "sess_number");
  const cname = sessionCookieName(cfg);

  const now = Date.now();
  const nowSec = Math.floor(now / 1000);
  let id = readCookie(cname) || "";
  if (id && !/^\d{9,16}$/.test(id)) {
    id = "";
  }
  let raw = lsGet(metaKey);

  /** @type {{ id?: string, last?: number, started_at?: number, campaign_sig?: string }} */
  let meta = {};
  if (raw) {
    try {
      meta = JSON.parse(raw);
    } catch {
      meta = {};
    }
  }

  const isNumericId = Boolean(id && /^\d{9,12}$/.test(id));
  const sameId = isNumericId && meta.id === id;
  const fresh = sameId && typeof meta.last === "number" && now - meta.last < timeoutMs;

  const forceNew = Boolean(opts.forceNew);

  if (!fresh || forceNew) {
    const prev = Number(lsGet(numKey) || 0);
    const session_number = Math.max(1, (Number.isFinite(prev) ? prev : 0) + 1);
    lsSet(numKey, String(session_number));

    // Numeric SaaS session id (unix seconds); suffix only if same-second collision.
    id = String(nowSec);
    if (readCookie(cname) === id) {
      id = String(nowSec) + String(Math.floor(Math.random() * 900) + 100);
    }
    meta = { id, last: now, started_at: nowSec };
    writeCookie(cname, id, maxAge);
    lsSet(metaKey, JSON.stringify(meta));
    return { id, session_number, started_at: meta.started_at };
  }

  meta.last = now;
  if (typeof meta.started_at !== "number") meta.started_at = nowSec;
  lsSet(metaKey, JSON.stringify(meta));
  writeCookie(cname, id, maxAge);
  const session_number = Math.max(1, Number(lsGet(numKey) || 1) || 1);
  return { id, session_number, started_at: meta.started_at };
}

/**
 * Backward compatible helper: returns id only.
 * @param {{ siteKey?: string }} cfg
 * @param {{ sessionTimeoutMs?: number, sessionMaxAgeSeconds?: number, forceNew?: boolean }} [opts]
 */
export function getOrCreateSessionId(cfg, opts = {}) {
  return getOrCreateSession(cfg, opts).id;
}
