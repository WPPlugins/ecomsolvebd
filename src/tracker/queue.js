import {
  buildOutboxRecord,
  drainOutboxRecord,
  flushOutboxAll,
  outboxGet,
  outboxEnqueue,
  scheduleDrainOutbox,
} from "./outbox.js";

/** @type {() => (import('./config.js').TrackerInit & { requestHeaders: Record<string, string> }) | null} */
let getLive = () => null;

/** @param {() => (import('./config.js').TrackerInit & { requestHeaders: Record<string, string> }) | null} fn */
export function setQueueLiveGetter(fn) {
  getLive = typeof fn === "function" ? fn : () => null;
}

/** @type {ReturnType<typeof setTimeout> | null} */
let debounceTimer = null;

function scheduleDebouncedDrain(ms) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    scheduleDrainOutbox(getLive);
  }, ms);
}

/**
 * @param {import('./config.js').TrackerInit & { userId: string, requestHeaders: Record<string, string> }} state
 * @param {unknown} body
 */
export async function enqueueOrSend(state, body) {
  const rec = await buildOutboxRecord(/** @type {any} */ (state), /** @type {Record<string, unknown>} */ (body));
  await outboxEnqueue(rec);
  const ms = state.batchFlushMs || 0;
  if (ms <= 0) {
    // Only this event — never replay the whole failed backlog on every track().
    await drainOutboxRecord(getLive, rec.id);
    const pending = await outboxGet(rec.id);
    return !pending;
  }
  scheduleDebouncedDrain(ms);
  return true;
}

/**
 * @param {import('./config.js').TrackerInit & { userId: string, requestHeaders: Record<string, string> }} state
 * @param {unknown} body
 */
export async function sendNow(state, body) {
  const rec = await buildOutboxRecord(/** @type {any} */ (state), /** @type {Record<string, unknown>} */ (body));
  await outboxEnqueue(rec);
  // Critical: one HTTP per event. Full backlog drains on the 45s timer / pagehide only.
  await drainOutboxRecord(getLive, rec.id);
  const pending = await outboxGet(rec.id);
  return !pending;
}

/**
 * Flush debounced timer + drain persistent outbox (pagehide / visibility / manual).
 * @param {{ preferBeacon?: boolean }} [opts]
 */
export function flushPending(opts) {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  return flushOutboxAll(getLive, opts);
}
