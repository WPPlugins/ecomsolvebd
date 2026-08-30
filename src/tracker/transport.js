/** @param {string} pathname */
function isIngestPath(pathname) {
  const p = String(pathname || "").toLowerCase();
  return (
    p.includes("/tracking/collect") ||
    p.includes("/master-ingest") ||
    p.includes("/events/master-ingest") ||
    /\/(collect|ingest)(\/|$)/.test(p)
  );
}

/**
 * Prefer live ingest URL when DNS/mode flips (direct_api ↔ custom_subdomain) or a stale
 * cross-origin URL is queued. Identity (`client_event_id`) stays on the body — only the host changes.
 * @param {string} endpoint
 */
function resolvePostEndpoint(endpoint) {
  let url = String(endpoint || "");
  try {
    if (typeof window === "undefined" || typeof location === "undefined") return url;
    const cfg =
      window.__ECOMSO_CONFIG__ && typeof window.__ECOMSO_CONFIG__ === "object" ? window.__ECOMSO_CONFIG__ : null;
    const live = cfg && cfg.endpoint ? String(cfg.endpoint).trim() : "";
    if (!live) return url;
    const liveUrl = new URL(live, location.href);
    const reqUrl = new URL(url || live, location.href);
    if (liveUrl.href === reqUrl.href) return url;

    const bothIngest = isIngestPath(liveUrl.pathname) && isIngestPath(reqUrl.pathname);
    // DNS verify / delete: api.ecomsolvebd.com ↔ tracking.store.com (or store proxy).
    if (bothIngest && liveUrl.hostname !== reqUrl.hostname) {
      return live;
    }
    // Legacy same-origin store proxy wins over a stale cross-origin queue row.
    if (liveUrl.hostname === location.hostname && reqUrl.hostname !== location.hostname) {
      return live;
    }
  } catch {
    /* ignore */
  }
  return url;
}

/**
 * @param {Response} res
 * @returns {number|null} ms
 */
function parseRetryAfterMs(res) {
  try {
    const raw = res.headers && typeof res.headers.get === "function" ? res.headers.get("retry-after") : null;
    if (!raw) return null;
    const asInt = parseInt(String(raw).trim(), 10);
    if (Number.isFinite(asInt) && asInt >= 0) return Math.min(15 * 60_000, asInt * 1000);
    const when = Date.parse(String(raw));
    if (Number.isFinite(when)) return Math.min(15 * 60_000, Math.max(0, when - Date.now()));
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * @param {string} endpoint
 * @param {unknown} body
 * @param {RequestCredentials} credentials
 * @param {{ useBeacon?: boolean, signal?: AbortSignal, headers?: Record<string, string> }} [opts]
 * @returns {Promise<boolean>}
 */
export async function postJson(endpoint, body, credentials, opts = {}) {
  const json = JSON.stringify(body);
  /** @type {Record<string, string>} */
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  let cfg = null;

  let postUrl = resolvePostEndpoint(endpoint);
  try {
    const u = new URL(postUrl);
    cfg =
      typeof window !== "undefined" && window.__ECOMSO_CONFIG__ && typeof window.__ECOMSO_CONFIG__ === "object"
        ? window.__ECOMSO_CONFIG__
        : null;
    const mid = cfg && cfg.merchantId ? String(cfg.merchantId).trim() : "";
    if (mid && mid.length <= 128) {
      headers["x-merchant-key"] = mid;
      u.searchParams.set("key", mid);
      postUrl = u.toString();
    }
    const host = u.hostname.toLowerCase();
    if (host.includes("ngrok")) {
      headers["ngrok-skip-browser-warning"] = "true";
    }
    if (cfg && cfg.pluginVersion) {
      headers["x-esb-plugin-version"] = String(cfg.pluginVersion).slice(0, 32);
    }
  } catch {
    /* ignore bad endpoint URL */
  }

  // sendBeacon cannot attach custom headers — merchant auth instead travels via the `?key=`
  // query param already appended to `postUrl` above, so this only drops optional debug/plugin
  // version headers (fine for a teardown flush). Only used when the caller explicitly opts in
  // (page is being unloaded / hidden) — fetch+keepalive stays the default for normal sends.
  // NB: must post to `postUrl` (has the merchant key), not the raw `endpoint`.
  if (
    opts.useBeacon &&
    typeof navigator !== "undefined" &&
    navigator.sendBeacon &&
    !String(postUrl).toLowerCase().includes("ngrok")
  ) {
    const blob = new Blob([json], { type: "application/json" });
    const queued = navigator.sendBeacon(postUrl, blob);
    if (queued) return true;
    // Browser refused (payload too large / beacon quota) — fall through to fetch+keepalive.
  }

  const res = await fetch(postUrl, {
    method: "POST",
    headers,
    body: json,
    credentials,
    keepalive: true,
    mode: "cors",
    signal: opts.signal,
  });
  if ((res.status === 401 || res.status === 403) && typeof window !== "undefined") {
    try {
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("json")) {
        const j = await res.clone().json().catch(() => null);
        if (j && (j.blocked === true || (j.error && j.error.code === "IP_BLOCKED"))) {
          const { showIpBlockedOverlay } = await import("./ip-block-gate.js");
          showIpBlockedOverlay(j.error && j.error.message ? j.error.message : j.message);
          return false;
        }
      }
    } catch {
      /* ignore */
    }
    try {
      const cfg =
        window.__ECOMSO_CONFIG__ && typeof window.__ECOMSO_CONFIG__ === "object" ? window.__ECOMSO_CONFIG__ : null;
      const siteKey = cfg && cfg.siteKey ? String(cfg.siteKey) : "0";
      sessionStorage.setItem(`esb:merchant_key_unauthorized:${siteKey}`, "1");
    } catch {
      /* ignore */
    }
    return false;
  }
  if (res.status === 429) {
    const retryAfterMs = parseRetryAfterMs(res) ?? 60_000;
    const err = /** @type {Error & { code?: string, retryAfterMs?: number, status?: number }} */ (
      new Error("esb_rate_limited")
    );
    err.code = "RATE_LIMIT";
    err.status = 429;
    err.retryAfterMs = retryAfterMs;
    throw err;
  }
  if (!res.ok) {
    return false;
  }

  try {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("json")) {
      await res.json();
    }
  } catch {
    /* ignore */
  }

  // HTTP 200 (+ optional server dedupe) = delivered — do not retry
  return res.ok;
}
