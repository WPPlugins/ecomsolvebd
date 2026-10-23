import { readCookie } from "./cookie.js";
import { readGaClientIdFromDocument } from "./ga-cookies.js";

/**
 * Browser-native identity signals for the identity graph (Meta / GA cookies).
 * @returns {Record<string, string> | undefined}
 */
export function buildBrowserIdentityPayload() {
  const fbp = readCookie("_fbp").trim();
  const fbc = readCookie("_fbc").trim();
  /** @type {Record<string, string>} */
  const out = {};
  if (fbp) out.fbp = fbp.slice(0, 256);
  if (fbc) out.fbc = fbc.slice(0, 512);
  const gaClientId = readGaClientIdFromDocument();
  if (gaClientId) out.ga_client_id = gaClientId;
  return Object.keys(out).length ? out : undefined;
}
