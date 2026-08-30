import { trackEvent } from "./events.js";

/**
 * @param {import('./config.js').TrackerInit & { userId: string }} state
 * @param {{ path?: string, title?: string }} [extra]
 */
function pagePayload(extra = {}) {
  return {
    path: extra.path || (typeof location !== "undefined" ? location.pathname + location.search : ""),
    url: extra.url || (typeof location !== "undefined" ? location.href : undefined),
    title: extra.title || (typeof document !== "undefined" ? document.title : undefined),
  };
}

export function pageView(state, extra = {}) {
  return trackEvent(state, "page_view", pagePayload(extra));
}

/** First-ever visit only — do not also fire page_view on init. */
export function landingPageView(state, extra = {}) {
  const path =
    extra.path ||
    (typeof location !== "undefined" ? location.pathname || "/" : "");
  const url =
    extra.url ||
    (typeof location !== "undefined" ? location.href : undefined);
  return trackEvent(state, "landing_page_view", {
    path,
    url,
    title: extra.title || (typeof document !== "undefined" ? document.title : undefined),
  });
}
