import { lsGet, lsSet } from "./local-store.js";
import { storageKey } from "./storage-keys.js";

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function recordOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function touchStorageKey(cfg, suffix) {
  return storageKey(cfg || {}, suffix);
}

function readJson(key) {
  const raw = lsGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  return lsSet(key, JSON.stringify(value));
}

export function readStoredLastTouch(cfg) {
  return readJson(touchStorageKey(cfg, "last_touch"));
}

export function readStoredSessionTouch(cfg) {
  return readJson(touchStorageKey(cfg, "session_touch"));
}

export function isMeaningfulExternalTouch(touch) {
  if (!touch || typeof touch !== "object") return false;
  const channel = safeString(touch.channel).toLowerCase();
  const source = safeString(touch.source).toLowerCase();
  const medium = safeString(touch.medium).toLowerCase();
  if (channel && channel !== "direct" && channel !== "unknown") return true;
  if (source && source !== "direct" && source !== "(direct)" && source !== "unknown") return true;
  if (medium && medium !== "none" && medium !== "direct") return true;
  return false;
}

export function buildResolvedTouchFromPayload(payload) {
  const p = recordOrEmpty(payload);
  const utm = recordOrEmpty(p.utm);
  const normalized = recordOrEmpty(p.normalized_attribution);
  const clickIds = recordOrEmpty(p.normalized_click_ids || p.click_ids);
  const channel = safeString(p.marketing_channel) || "Unknown";
  const source =
    safeString(p.platform_source || utm.utm_source || normalized.utm_source) ||
    (channel === "Direct" ? "direct" : channel === "Unknown" ? "unknown" : safeString(p.marketing_channel_detail));
  const explicitMedium = safeString(p.platform_medium || utm.utm_medium || normalized.utm_medium);
  const medium =
    channel === "Direct" && (!explicitMedium || explicitMedium.toLowerCase() === "direct")
      ? "none"
      : explicitMedium || (channel === "Direct" ? "none" : "");
  return {
    at: safeString(p.timestamp) || new Date().toISOString(),
    event: safeString(p.event),
    url: safeString(p.url),
    referrer: safeString(p.referrer),
    sessionId: safeString(p.session_id || p.sass_session_id),
    journeyId: safeString(p.journey_id),
    source: source.toLowerCase(),
    medium: medium.toLowerCase(),
    campaign: safeString(utm.utm_campaign || normalized.utm_campaign),
    channel,
    clickIds,
    utm,
  };
}

export function updateStoredTouches(cfg, currentTouch) {
  if (!currentTouch || typeof currentTouch !== "object") return { lastTouch: null, sessionTouch: null };
  const previousSessionTouch = readStoredSessionTouch(cfg);
  const sameSession =
    previousSessionTouch &&
    safeString(previousSessionTouch.sessionId) &&
    safeString(previousSessionTouch.sessionId) === safeString(currentTouch.sessionId);

  const sessionTouch = sameSession
    ? isMeaningfulExternalTouch(currentTouch)
      ? currentTouch
      : previousSessionTouch
    : currentTouch;

  writeJson(touchStorageKey(cfg, "last_touch"), currentTouch);
  writeJson(touchStorageKey(cfg, "session_touch"), sessionTouch);
  return { lastTouch: currentTouch, sessionTouch };
}
