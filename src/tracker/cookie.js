/**
 * Minimal cookie helpers (no deps). SameSite=Lax; Secure on HTTPS.
 * @param {string} name
 */
export function readCookie(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  const parts = String(typeof document !== "undefined" ? document.cookie : "").split("; ");
  for (const p of parts) {
    if (p.startsWith(prefix)) return decodeURIComponent(p.slice(prefix.length));
  }
  return "";
}

/**
 * @param {string} name
 * @param {string} value
 * @param {number} maxAgeSeconds
 */
export function writeCookie(name, value, maxAgeSeconds) {
  if (typeof document === "undefined") return;
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}
