/** @type {Map<string, number>} */
const recent = new Map();

const DEFAULT_TTL_MS = 5000;

export function dedupeStorageKey(siteKey, key) {
  return `${siteKey || "0"}:${key}`;
}

function storageKey(siteKey, key) {
  return dedupeStorageKey(siteKey, key);
}

/**
 * Drop duplicate ingests within a short window (same logical event, multiple hooks).
 * @param {string} [siteKey]
 * @param {string} dedupeKey
 * @param {number} [ttlMs]
 */
export function shouldSkipIngestDedupe(siteKey, dedupeKey, ttlMs = DEFAULT_TTL_MS) {
  const k = storageKey(siteKey, dedupeKey);
  const now = Date.now();
  const prev = recent.get(k);
  if (prev != null && now - prev < ttlMs) return true;
  recent.set(k, now);
  if (recent.size > 500) {
    for (const [rk, ts] of recent) {
      if (now - ts > ttlMs * 2) recent.delete(rk);
    }
  }
  return false;
}

/**
 * @param {Record<string, unknown>} payload
 */
export function buildIngestDedupeKey(payload) {
  const event = String(payload.event || "").trim();
  if (!event) return "";

  const cid =
    typeof payload.client_event_id === "string" && payload.client_event_id.trim()
      ? payload.client_event_id.trim()
      : "";
  if (cid) return `cid:${cid}`;

  const session = typeof payload.session_id === "string" ? payload.session_id : "";
  const path =
    typeof payload.path === "string" && payload.path
      ? payload.path
      : typeof payload.url === "string"
        ? payload.url
        : "";

  if (event === "page_view" || event === "landing_page_view") {
    return `${event}:${session}:${path}`;
  }

  if (event === "click") {
    const el = payload.element;
    if (el && typeof el === "object") {
      const o = /** @type {Record<string, unknown>} */ (el);
      return `click:${path}:${o.tag || ""}:${o.id || ""}:${o.href || ""}:${o.text || ""}`;
    }
    return `click:${path}`;
  }

  const eco = payload.ecommerce;
  if (eco && typeof eco === "object") {
    const items = /** @type {{ items?: unknown[] }} */ (eco).items;
    if (Array.isArray(items) && items.length) {
      const parts = items.slice(0, 8).map((raw) => {
        const it = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
        const pid = it.product_id != null ? String(it.product_id) : "";
        const iid = it.item_id != null ? String(it.item_id) : "";
        const qty = it.quantity != null ? String(it.quantity) : "1";
        return `${pid || iid}:${qty}`;
      });
      return `${event}:${session}:${parts.join(",")}`;
    }
  }

  if (typeof payload.order_id === "string" && payload.order_id) {
    return `${event}:${payload.order_id}`;
  }

  return `${event}:${session}:${path}`;
}
