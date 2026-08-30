/**
 * Production-grade persistent outbound queue (IndexedDB + localStorage fallback).
 * Retries with exponential backoff + long-tail interval; payloads are not removed until POST succeeds.
 */
import { postJson } from "./transport.js";

/** @typedef {{ id: string, payload: string, compressed: number, endpoint: string, cred: string, headersJson: string, retry_count: number, retry_after: number, delivery_status: string, created_at: number }} OutboxRecord */

const DB_NAME_PREFIX = "fct_outbox_v1_";
const STORE = "events";
const LS_VERSION = 1;
const LS_MAX_ITEMS = 150;
const LS_MAX_BYTES = 4 * 1024 * 1024;

/** @type {string} */
let _siteSlug = "0";
/** @type {Promise<IDBDatabase|null>} */
let _dbPromise = null;
/** @type {boolean} */
let _idbUnavailable = false;
/** @type {'unknown'|'idb'|'ls'} */
let _storageMode = "unknown";

/** @param {string} [siteKey] */
function siteSlug(siteKey) {
  const s = String(siteKey || "0").replace(/[^a-z0-9_-]/gi, "_");
  return s.length ? s.slice(0, 32) : "0";
}

function lsKey() {
  return `fct_ob_v${LS_VERSION}:${_siteSlug}`;
}

export function generateClientEventId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * @param {unknown} body
 * @returns {Promise<{ payload: string, compressed: number }>}
 */
export async function maybeCompressBody(body) {
  const json = JSON.stringify(body);
  try {
    if (typeof CompressionStream === "undefined" || typeof Blob === "undefined") {
      return { payload: json, compressed: 0 };
    }
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
    const buf = await new Response(stream).arrayBuffer();
    if (buf.byteLength >= json.length * 0.92) return { payload: json, compressed: 0 };
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunk = 0x4000;
    for (let i = 0; i < bytes.length; i += chunk) {
      const sub = bytes.subarray(i, i + chunk);
      binary += String.fromCharCode.apply(null, Array.from(sub));
    }
    const b64 = typeof btoa !== "undefined" ? btoa(binary) : json;
    return { payload: b64, compressed: 1 };
  } catch {
    return { payload: json, compressed: 0 };
  }
}

/**
 * @param {string} payload
 * @param {number} compressed
 */
export async function maybeDecompressBody(payload, compressed) {
  if (!compressed) {
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }
  try {
    if (typeof atob === "undefined") return null;
    const binary = atob(payload);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    if (typeof DecompressionStream === "undefined") return null;
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    const text = await new Response(stream).text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * @param {number} retryCount
 */
export function computeRetryDelayMs(retryCount) {
  const n = Math.max(0, retryCount);
  if (n < 14) {
    const base = Math.min(60_000, 800 * 2 ** Math.min(n, 10));
    const jitter = Math.floor(Math.random() * 400);
    return base + jitter;
  }
  return 15 * 60 * 1000 + Math.floor(Math.random() * 60_000);
}

/** @returns {Promise<IDBDatabase|null>} */
function openIdb() {
  if (_idbUnavailable || typeof indexedDB === "undefined") return Promise.resolve(null);
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve) => {
    try {
      const name = `${DB_NAME_PREFIX}${_siteSlug}`;
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const st = db.createObjectStore(STORE, { keyPath: "id" });
          st.createIndex("retry_after", "retry_after", { unique: false });
          st.createIndex("delivery_status", "delivery_status", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        _idbUnavailable = true;
        _dbPromise = null;
        _storageMode = "ls";
        resolve(null);
      };
      req.onblocked = () => {
        _idbUnavailable = true;
        _dbPromise = null;
        _storageMode = "ls";
        resolve(null);
      };
    } catch {
      _idbUnavailable = true;
      _dbPromise = null;
      _storageMode = "ls";
      resolve(null);
    }
  });
  return _dbPromise;
}

async function resolveStorageMode() {
  if (_storageMode !== "unknown") return _storageMode;
  if (typeof indexedDB === "undefined") {
    _storageMode = "ls";
    return "ls";
  }
  const db = await openIdb();
  _storageMode = db ? "idb" : "ls";
  return _storageMode;
}

function lsReadAll() {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(lsKey());
    if (!raw) return [];
    const j = JSON.parse(raw);
    if (!j || !Array.isArray(j.items)) return [];
    return /** @type {OutboxRecord[]} */ (j.items);
  } catch {
    return [];
  }
}

function lsWriteAll(items) {
  try {
    if (typeof localStorage === "undefined") return false;
    let trimmed = items;
    while (trimmed.length > LS_MAX_ITEMS) trimmed = trimmed.slice(1);
    let json = JSON.stringify({ v: LS_VERSION, items: trimmed });
    while (json.length > LS_MAX_BYTES && trimmed.length > 1) {
      trimmed = trimmed.slice(1);
      json = JSON.stringify({ v: LS_VERSION, items: trimmed });
    }
    localStorage.setItem(lsKey(), json);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {import('./config.js').TrackerInit & { requestHeaders: Record<string, string> }} state
 * @param {Record<string, unknown>} body
 */
export async function buildOutboxRecord(state, body) {
  const id = typeof body.client_event_id === "string" && body.client_event_id ? body.client_event_id : generateClientEventId();
  const payload = { ...body, client_event_id: id };
  const packed = await maybeCompressBody(payload);
  return {
    id,
    payload: packed.payload,
    compressed: packed.compressed,
    endpoint: state.endpoint,
    cred: String(state.credentials || "omit"),
    headersJson: JSON.stringify(state.requestHeaders || {}),
    retry_count: 0,
    retry_after: 0,
    delivery_status: "pending",
    created_at: Date.now(),
  };
}

/**
 * @param {OutboxRecord} rec
 */
export async function outboxEnqueue(rec) {
  const mode = await resolveStorageMode();
  if (mode === "ls") {
    const items = lsReadAll();
    if (!items.some((x) => x.id === rec.id)) items.push(rec);
    lsWriteAll(items);
    return;
  }
  const db = await openIdb();
  if (!db) {
    const items = lsReadAll();
    if (!items.some((x) => x.id === rec.id)) items.push(rec);
    lsWriteAll(items);
    return;
  }
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * @param {string} id
 */
export async function outboxDelete(id) {
  const mode = await resolveStorageMode();
  if (mode === "ls") {
    lsWriteAll(lsReadAll().filter((x) => x.id !== id));
    return;
  }
  const db = await openIdb();
  if (!db) {
    lsWriteAll(lsReadAll().filter((x) => x.id !== id));
    return;
  }
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * @param {OutboxRecord} rec
 */
export async function outboxPutUpdate(rec) {
  const mode = await resolveStorageMode();
  if (mode === "ls") {
    const items = lsReadAll();
    const idx = items.findIndex((x) => x.id === rec.id);
    if (idx >= 0) items[idx] = rec;
    else items.push(rec);
    lsWriteAll(items);
    return;
  }
  const db = await openIdb();
  if (!db) {
    const items = lsReadAll();
    const idx = items.findIndex((x) => x.id === rec.id);
    if (idx >= 0) items[idx] = rec;
    else items.push(rec);
    lsWriteAll(items);
    return;
  }
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * @param {string} id
 */
export async function outboxGet(id) {
  const mode = await resolveStorageMode();
  if (mode === "ls") return lsReadAll().find((x) => x.id === id) ?? null;
  const db = await openIdb();
  if (!db) return lsReadAll().find((x) => x.id === id) ?? null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * @param {number} now
 * @returns {Promise<OutboxRecord[]>}
 */
export async function outboxListDue(now) {
  const filter = (r) => r && typeof r.retry_after === "number" && r.retry_after <= now;
  const mode = await resolveStorageMode();
  if (mode === "ls") return lsReadAll().filter(filter);
  const db = await openIdb();
  if (!db) return lsReadAll().filter(filter);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result || []).filter(filter));
    req.onerror = () => reject(req.error);
  });
}

/**
 * @param {string} siteKey
 */
export function initOutbox(siteKey) {
  _siteSlug = siteSlug(siteKey);
  _idbUnavailable = false;
  _dbPromise = null;
  _storageMode = "unknown";
}

let _drainChain = Promise.resolve();
/** @type {ReturnType<typeof setInterval> | null} */
let _intervalId = null;
/** Pause all drains after HTTP 429 so we do not amplify host/CF rate limits. */
let _rateLimitedUntil = 0;

/**
 * @param {() => (import('./config.js').TrackerInit & { requestHeaders: Record<string, string> }) | null} getLive
 */
export function scheduleDrainOutbox(getLive) {
  _drainChain = _drainChain.then(() => drainOutboxOnce(getLive)).catch(() => {});
}

/**
 * Deliver a single outbox row (used by sendNow so one track() does not replay the whole backlog).
 * @param {() => (import('./config.js').TrackerInit & { requestHeaders: Record<string, string> }) | null} getLive
 * @param {string} id
 * @param {{ preferBeacon?: boolean }} [opts]
 */
export async function drainOutboxRecord(getLive, id, opts = {}) {
  const live = getLive();
  if (!live?.endpoint || !id) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  if (Date.now() < _rateLimitedUntil) return;

  let rec;
  try {
    rec = await outboxGet(id);
  } catch {
    return;
  }
  if (!rec) return;

  const body = await maybeDecompressBody(rec.payload, rec.compressed);
  if (!body) {
    await outboxDelete(rec.id).catch(() => {});
    return;
  }

  let headers = {};
  try {
    headers = JSON.parse(rec.headersJson || "{}");
  } catch {
    headers = {};
  }
  const cred = /** @type {RequestCredentials} */ (live.credentials || rec.cred || "omit");
  const endpoint = live.endpoint || rec.endpoint;
  // Keep queued transport target in sync with live DNS/mode; identity stays on payload.id.
  if (live.endpoint && rec.endpoint !== live.endpoint) {
    rec.endpoint = live.endpoint;
    rec.cred = String(live.credentials || rec.cred || "omit");
  }
  const liveHeaders = live.requestHeaders && typeof live.requestHeaders === "object" ? live.requestHeaders : {};
  const mergedHeaders = { ...headers, ...liveHeaders };

  let ok = false;
  /** @type {number|null} */
  let rateLimitMs = null;
  try {
    ok = await postJson(endpoint, body, cred, {
      headers: mergedHeaders,
      useBeacon: Boolean(opts.preferBeacon),
    });
  } catch (e) {
    ok = false;
    const err = /** @type {{ code?: string, retryAfterMs?: number }} */ (e || {});
    if (err.code === "RATE_LIMIT") {
      rateLimitMs = typeof err.retryAfterMs === "number" ? err.retryAfterMs : 60_000;
    }
  }

  if (ok) {
    await outboxDelete(rec.id).catch(() => {});
    return;
  }

  const delay =
    rateLimitMs != null ? Math.max(60_000, rateLimitMs) : computeRetryDelayMs(rec.retry_count);
  if (rateLimitMs != null) {
    _rateLimitedUntil = Date.now() + delay;
  }
  rec.retry_count += 1;
  rec.retry_after = Date.now() + delay;
  rec.delivery_status = "failed";
  await outboxPutUpdate(rec).catch(() => {});
}

/**
 * @param {() => (import('./config.js').TrackerInit & { requestHeaders: Record<string, string> }) | null} getLive
 * @param {{ preferBeacon?: boolean }} [opts] `preferBeacon`: page is unloading/hidden — try
 *   `navigator.sendBeacon` first (survives teardown better than fetch+keepalive in some
 *   browsers/in-app webviews), falling back to the normal path if beacon is unavailable/refused.
 */
export async function drainOutboxOnce(getLive, opts = {}) {
  const live = getLive();
  if (!live?.endpoint) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const now = Date.now();
  if (now < _rateLimitedUntil) return;

  let batch;
  try {
    batch = await outboxListDue(now);
  } catch {
    return;
  }
  batch.sort((a, b) => a.created_at - b.created_at);

  for (const rec of batch) {
    if (Date.now() < _rateLimitedUntil) break;

    const body = await maybeDecompressBody(rec.payload, rec.compressed);
    if (!body) {
      await outboxDelete(rec.id).catch(() => {});
      continue;
    }

    let headers = {};
    try {
      headers = JSON.parse(rec.headersJson || "{}");
    } catch {
      headers = {};
    }
    const cred = /** @type {RequestCredentials} */ (live.credentials || rec.cred || "omit");
    const endpoint = live.endpoint || rec.endpoint;
    if (live.endpoint && rec.endpoint !== live.endpoint) {
      rec.endpoint = live.endpoint;
      rec.cred = String(live.credentials || rec.cred || "omit");
    }
    const liveHeaders = live.requestHeaders && typeof live.requestHeaders === "object" ? live.requestHeaders : {};
    const mergedHeaders = { ...headers, ...liveHeaders };

    let ok = false;
    /** @type {number|null} */
    let rateLimitMs = null;
    try {
      ok = await postJson(endpoint, body, cred, {
        headers: mergedHeaders,
        useBeacon: Boolean(opts.preferBeacon),
      });
    } catch (e) {
      ok = false;
      const err = /** @type {{ code?: string, retryAfterMs?: number }} */ (e || {});
      if (err.code === "RATE_LIMIT") {
        rateLimitMs = typeof err.retryAfterMs === "number" ? err.retryAfterMs : 60_000;
      }
    }

    if (ok) {
      await outboxDelete(rec.id).catch(() => {});
    } else {
      const delay =
        rateLimitMs != null
          ? Math.max(60_000, rateLimitMs)
          : computeRetryDelayMs(rec.retry_count);
      if (rateLimitMs != null) {
        _rateLimitedUntil = Date.now() + delay;
      }
      rec.retry_count += 1;
      rec.retry_after = Date.now() + delay;
      rec.delivery_status = "failed";
      await outboxPutUpdate(rec).catch(() => {});
      // Stop the rest of this drain — further posts would only deepen 429.
      if (rateLimitMs != null) break;
    }
  }
}

/**
 * @param {() => (import('./config.js').TrackerInit & { requestHeaders: Record<string, string> }) | null} getLive
 */
export function installOutboxNetworkHandlers(getLive) {
  if (typeof window === "undefined") return;
  const run = () => scheduleDrainOutbox(getLive);
  window.addEventListener("online", run, { passive: true });
  if (!_intervalId) _intervalId = window.setInterval(run, 45_000);
}

/**
 * @param {() => (import('./config.js').TrackerInit & { requestHeaders: Record<string, string> }) | null} getLive
 * @param {{ preferBeacon?: boolean }} [opts]
 */
export function flushOutboxAll(getLive, opts) {
  return drainOutboxOnce(getLive, opts);
}
