import { trackEvent } from "./events.js";

function truncate(s, max) {
  const t = String(s || "").trim();
  if (!t) return "";
  return t.length > max ? t.slice(0, max) : t;
}

function elSummary(el) {
  if (!el || typeof el !== "object") return {};
  const tag = el.tagName ? String(el.tagName).toLowerCase() : "";
  const id = el.id ? String(el.id) : "";
  const cls = el.className ? truncate(String(el.className), 180) : "";
  const href = el.getAttribute ? el.getAttribute("href") : "";
  const text = truncate(el.textContent || "", 120);
  return { tag, id, class: cls, href: href || "", text };
}

function isInsideCheckoutForm(el) {
  if (!el || typeof el.closest !== "function") return false;
  return !!el.closest(
    [
      "form.checkout",
      "form.woocommerce-checkout",
      ".woocommerce-checkout",
      ".wc-block-checkout",
      "#checkout",
      ".checkout_coupon",
      "#order_review",
    ].join(","),
  );
}

/**
 * Install lightweight click + scroll tracking.
 * @param {import('./config.js').TrackerInit & { userId: string, sessionId: string, requestHeaders: Record<string, string> }} state
 */
export function installBehaviorTracking(state) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  document.addEventListener(
    "click",
    (e) => {
      const t = /** @type {any} */ (e.target);
      const el = t && t.closest ? t.closest("a,button,input,select,textarea,[role='button']") : t;
      if (!el || isInsideCheckoutForm(el)) return;
      const props = { element: elSummary(el), path: location.pathname + location.search };
      void trackEvent(/** @type {any} */ (state), "click", props);
    },
    { capture: true },
  );

  const marks = [25, 50, 75, 100];
  /** @type {Record<string, boolean>} */
  const sent = {};
  let ticking = false;

  function computeDepth() {
    const doc = document.documentElement;
    const scrollTop = window.scrollY || doc.scrollTop || 0;
    const height = Math.max(doc.scrollHeight, doc.offsetHeight, doc.clientHeight);
    const viewport = window.innerHeight || doc.clientHeight || 0;
    const denom = Math.max(1, height - viewport);
    const pct = Math.min(100, Math.max(0, Math.round((scrollTop / denom) * 100)));
    return pct;
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const pct = computeDepth();
      for (const m of marks) {
        if (!sent[String(m)] && pct >= m) {
          sent[String(m)] = true;
          void trackEvent(/** @type {any} */ (state), "scroll", {
            depth: m,
            path: location.pathname + location.search,
          });
        }
      }
    });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
}
