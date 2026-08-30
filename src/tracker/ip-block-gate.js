const OVERLAY_ID = "esb-ip-block-overlay";

/**
 * Full-screen, non-dismissible gate when merchant blocked this visitor IP.
 * Shared across Woo / Shopify / Laravel / Next / ESB (any host that loads the tracker).
 * Default copy is English (WordPress.org); API may still send a localized `message`.
 */
export function showIpBlockedOverlay(message) {
  if (typeof document === "undefined") return;
  if (document.getElementById(OVERLAY_ID)) return;

  const msg =
    (message && String(message).trim()) ||
    "Please contact the store administrator.";

  const el = document.createElement("div");
  el.id = OVERLAY_ID;
  el.setAttribute("role", "alertdialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", msg);
  el.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483647",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "padding:24px",
    "background:#0f172a",
    "color:#f8fafc",
    "font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
    "text-align:center",
    "pointer-events:auto",
  ].join(";");

  const inner = document.createElement("div");
  inner.style.cssText = "max-width:28rem;line-height:1.6;font-size:1.125rem;font-weight:600";
  inner.textContent = msg;
  el.appendChild(inner);

  const lockScroll = () => {
    try {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    } catch {
      /* ignore */
    }
  };
  lockScroll();

  const blockKeys = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener("keydown", blockKeys, true);
  window.addEventListener("keyup", blockKeys, true);

  const mount = () => {
    try {
      (document.body || document.documentElement).appendChild(el);
    } catch {
      /* ignore */
    }
  };
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });
}

/**
 * Same-host IP gate URL. Never append /access-check onto master-ingest
 * (that hits dashboard merchantContext → 401). Unknown ingest paths → skip.
 * @param {string} pathname
 * @returns {string | null}
 */
export function accessCheckPathFromIngest(pathname) {
  const p = String(pathname || "").replace(/\/+$/, "") || "/";
  if (/\/access-check$/i.test(p)) return p;
  if (/\/v1\/events\/master-ingest$/i.test(p)) {
    return p.replace(/\/v1\/events\/master-ingest$/i, "/v1/tracking/access-check");
  }
  if (/\/v1\/tracking\/collect$/i.test(p)) {
    return p.replace(/\/v1\/tracking\/collect$/i, "/v1/tracking/access-check");
  }
  if (/\/collect$/i.test(p)) {
    return p.replace(/\/collect$/i, "/access-check");
  }
  return null;
}

/**
 * @param {import('./config.js').TrackerInit} cfg
 */
export async function checkIpAccessGate(cfg) {
  try {
    if (!cfg || !cfg.endpoint) return false;
    const mid = cfg.merchantId ? String(cfg.merchantId).trim() : "";
    if (!mid) return false;
    const base = new URL(String(cfg.endpoint), typeof location !== "undefined" ? location.href : undefined);
    const accessPath = accessCheckPathFromIngest(base.pathname);
    if (!accessPath) return false;
    base.pathname = accessPath;
    base.search = "";
    base.searchParams.set("key", mid);

    const headers = { Accept: "application/json", "x-merchant-key": mid };
    if (base.hostname.toLowerCase().includes("ngrok")) {
      headers["ngrok-skip-browser-warning"] = "true";
    }

    const res = await fetch(base.toString(), {
      method: "GET",
      credentials: cfg.credentials || "omit",
      headers,
      cache: "no-store",
      mode: "cors",
    });
    if (!res.ok) return false;
    const json = await res.json().catch(() => null);
    if (json && json.blocked === true) {
      showIpBlockedOverlay(json.message);
      return true;
    }
  } catch {
    /* fail open — never break storefront if gate check fails */
  }
  return false;
}
