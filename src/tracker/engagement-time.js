/** Active engagement ms (GA4 engagement_time_msec). Pauses when tab hidden / window blurred. */

var activeMs = 0;
var lastTick = 0;
var running = true;
var installed = false;

function nowMs() {
  return typeof Date !== "undefined" ? Date.now() : 0;
}

function syncTick() {
  if (!running) return;
  var n = nowMs();
  if (!lastTick) {
    lastTick = n;
    return;
  }
  var delta = n - lastTick;
  if (delta > 0 && delta < 600000) {
    activeMs += delta;
  }
  lastTick = n;
}

function pauseEngagement() {
  if (!running) return;
  syncTick();
  running = false;
}

function resumeEngagement() {
  if (running) return;
  running = true;
  lastTick = nowMs();
}

/**
 * Call before each event dispatch.
 * @returns {number}
 */
export function getEngagementTimeMsec() {
  syncTick();
  return Math.max(0, Math.round(activeMs));
}

/** Install visibility / focus listeners once. */
export function installEngagementTracking() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  lastTick = nowMs();

  document.addEventListener(
    "visibilitychange",
    function () {
      try {
        if (document.visibilityState === "hidden") pauseEngagement();
        else resumeEngagement();
      } catch (e) {
        /* ignore */
      }
    },
    { passive: true },
  );

  if (typeof window !== "undefined") {
    window.addEventListener("blur", pauseEngagement, { passive: true });
    window.addEventListener("focus", resumeEngagement, { passive: true });
    window.addEventListener("pagehide", pauseEngagement, { passive: true });
    window.addEventListener("pageshow", resumeEngagement, { passive: true });
  }
}
