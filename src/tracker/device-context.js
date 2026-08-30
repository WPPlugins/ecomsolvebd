/** @type {Promise<string | undefined> | null} */
let deviceModelPromise = null;

/**
 * Client device / browser / OS snapshot from `navigator.userAgent`.
 * Sent on every event for dashboard facet filters (device, browser, os).
 * @returns {Promise<{ device: string, device_model?: string, browser: string, os: string } | undefined>}
 */
export async function buildDeviceContextPayload() {
  if (typeof navigator === "undefined") return undefined;
  const ua = String(navigator.userAgent || "").trim();
  if (!ua) return undefined;

  const device = detectDeviceType(ua);
  const browser = detectBrowserWithVersion(ua);
  const os = detectOsWithVersion(ua);
  const deviceModel = await detectDeviceModel(ua);

  const language =
    typeof navigator !== "undefined" && navigator.language
      ? String(navigator.language).trim().slice(0, 32)
      : undefined;
  const screenResolution =
    typeof screen !== "undefined" && screen.width && screen.height
      ? `${Math.floor(screen.width)}x${Math.floor(screen.height)}`
      : undefined;

  return {
    device: device.slice(0, 64),
    ...(deviceModel ? { device_model: deviceModel.slice(0, 128) } : {}),
    browser: browser.slice(0, 128),
    os: os.slice(0, 128),
    ...(language ? { language } : {}),
    ...(screenResolution ? { screen_resolution: screenResolution.slice(0, 32) } : {}),
  };
}

/** @param {string} ua */
function detectDeviceType(ua) {
  if (/iPad|Tablet|PlayBook|Silk\/|Kindle/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) {
    return "Tablet";
  }
  if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone|IEMobile|BlackBerry|Opera Mini/i.test(ua)) {
    return "Mobile";
  }
  if (/Smart-?TV|AppleTV|GoogleTV|HbbTV|NetCast|webOS|Tizen|Roku|CrKey/i.test(ua)) {
    return "TV";
  }
  return "Desktop";
}

/** @param {string} ua */
function detectBrowserWithVersion(ua) {
  const edge = ua.match(/\bEdg(?:e|A|iOS)?\/([\d.]+)/i);
  if (edge) return `Edge ${edge[1]}`;

  const opera = ua.match(/\bOPR\/([\d.]+)/i) || ua.match(/\bOpera\/([\d.]+)/i);
  if (opera) return `Opera ${opera[1]}`;

  const samsung = ua.match(/\bSamsungBrowser\/([\d.]+)/i);
  if (samsung) return `Samsung Internet ${samsung[1]}`;

  const firefox = ua.match(/\bFirefox\/([\d.]+)/i);
  if (firefox) return `Firefox ${firefox[1]}`;

  const chrome = ua.match(/\bChrome\/([\d.]+)/i);
  const isChromium = chrome && !/\bEdg/i.test(ua) && !/\bOPR\//i.test(ua);
  if (isChromium) return `Chrome ${chrome[1]}`;

  const safari = ua.match(/\bVersion\/([\d.]+).*Safari/i);
  if (safari && /\bSafari/i.test(ua)) return `Safari ${safari[1]}`;

  const ie = ua.match(/\b(?:MSIE |rv:)([\d.]+)/i);
  if (ie) return `Internet Explorer ${ie[1]}`;

  return "Unknown";
}

/** @param {string} ua */
function detectOsWithVersion(ua) {
  const windows = ua.match(/\bWindows NT ([\d.]+)/i);
  if (windows) {
    const map = {
      "10.0": "10/11",
      "6.3": "8.1",
      "6.2": "8",
      "6.1": "7",
      "6.0": "Vista",
      "5.1": "XP",
    };
    const label = map[windows[1]] || windows[1];
    return `Windows ${label}`;
  }
  if (/\bWindows/i.test(ua)) return "Windows";

  const mac = ua.match(/\bMac OS X ([\d_]+)/i);
  if (mac) return `macOS ${mac[1].replace(/_/g, ".")}`;

  const ios = ua.match(/\b(?:iPhone OS|CPU OS) ([\d_]+)/i);
  if (ios) return `iOS ${ios[1].replace(/_/g, ".")}`;

  const android = ua.match(/\bAndroid ([\d.]+)/i);
  if (android) return `Android ${android[1]}`;

  const cros = ua.match(/\bCrOS ([\w.]+)/i);
  if (cros) return `Chrome OS ${cros[1]}`;

  if (/\bLinux/i.test(ua)) return "Linux";

  return "Unknown";
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function titleCaseWords(value) {
  return normalizeWhitespace(value)
    .split(" ")
    .filter(Boolean)
    .map((part) => {
      if (/^[A-Z0-9-]+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

function parseSamsungModel(raw) {
  const upper = normalizeWhitespace(raw).toUpperCase();
  const midrange = upper.match(/\bSM-([AMF])(\d{2})\d[A-Z0-9]*\b/);
  if (midrange) return `Samsung ${midrange[1]}${midrange[2]}`;
  return null;
}

function formatDeviceModel(raw) {
  const value = normalizeWhitespace(raw.replace(/\s+Build\/.+$/i, ""));
  if (!value) return "";
  if (/^iphone/i.test(value)) return "iPhone";
  if (/^ipad/i.test(value)) return "iPad";
  if (/^ipod/i.test(value)) return "iPod";
  const samsung = parseSamsungModel(value);
  if (samsung) return samsung;
  if (/^sm-[a-z0-9-]+$/i.test(value)) return `Samsung ${value.toUpperCase()}`;
  if (/^(pixel)(\s|$)/i.test(value)) return titleCaseWords(`Google ${value}`);
  if (/^(moto|motorola)(\s|$)/i.test(value)) return titleCaseWords(value.replace(/^moto/i, "Motorola"));
  if (/^(redmi|poco|mi)(\s|$)/i.test(value)) return titleCaseWords(value);
  if (/^(oppo|vivo|realme|infinix|tecno|oneplus|huawei|honor|nokia|itel)(\s|$)/i.test(value)) {
    return titleCaseWords(value);
  }
  return titleCaseWords(value);
}

function isUsefulModelCandidate(candidate) {
  const value = normalizeWhitespace(candidate);
  if (!value) return false;
  if (/^(linux|android|mobile|tablet|wv|k|u|armv8l|wow64|x64|compatible)$/i.test(value)) return false;
  if (/^[a-z]{2}-[a-z]{2}$/i.test(value)) return false;
  if (/^android\s+\d+(\.\d+)*$/i.test(value)) return false;
  if (/^cpu iphone os /i.test(value)) return false;
  if (/^cpu os /i.test(value)) return false;
  if (/^like mac os x$/i.test(value)) return false;
  return true;
}

function guessDeviceModelFromUa(ua) {
  if (/\biPhone\b/i.test(ua)) return "iPhone";
  if (/\biPad\b/i.test(ua)) return "iPad";
  if (/\bPixel [0-9A-Za-z ]+\b/i.test(ua)) return formatDeviceModel(ua.match(/\bPixel [0-9A-Za-z ]+\b/i)?.[0] || "");

  const group = ua.match(/\(([^)]+)\)/)?.[1] || "";
  const parts = group
    .split(";")
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);

  const preferred = parts.find((part) =>
    /\b(?:SM-[A-Z0-9]+|Pixel\s+\d|CPH\d+|RMX\d+|V\d{4}|M\d{4}|Infinix|TECNO|OPPO|vivo|Redmi|POCO|OnePlus|iPhone|iPad)\b/i.test(part),
  );
  if (preferred) return formatDeviceModel(preferred);

  for (const part of parts) {
    const cleaned = normalizeWhitespace(part.replace(/\s+Build\/.+$/i, ""));
    if (!isUsefulModelCandidate(cleaned)) continue;
    if (/\b(?:Linux|Android|AppleWebKit|KHTML|Safari|Chrome|Version)\b/i.test(cleaned) && !/\b(?:iPhone|iPad|Pixel)\b/i.test(cleaned)) {
      continue;
    }
    return formatDeviceModel(cleaned);
  }
  return "";
}

async function readHighEntropyDeviceModel() {
  if (typeof navigator === "undefined") return "";
  const uaData = navigator.userAgentData;
  if (!uaData || typeof uaData.getHighEntropyValues !== "function") return "";
  try {
    const values = await uaData.getHighEntropyValues(["model"]);
    return normalizeWhitespace(values && typeof values.model === "string" ? values.model : "");
  } catch {
    return "";
  }
}

async function detectDeviceModel(ua) {
  const fromUa = guessDeviceModelFromUa(ua);
  if (fromUa) return fromUa;

  if (!deviceModelPromise) {
    deviceModelPromise = readHighEntropyDeviceModel()
      .then((model) => (model ? formatDeviceModel(model) : undefined))
      .catch(() => undefined);
  }
  return (await deviceModelPromise) || undefined;
}
