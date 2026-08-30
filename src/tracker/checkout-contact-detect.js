/**
 * Platform-agnostic email/phone input detection.
 * Do not rely on a single static name — match type, autocomplete, name/id/class/placeholder.
 * Keep copies in sync: nextjs-tracker checkout-contact-detect.ts, Woo esb-wc-bridge, Laravel funnel-auto.
 */

var EMAIL_TOKEN =
  /(^|[^a-z0-9])(e-?mail|user_email|customer_email|billing_email|shipping_email|contact_email|checkout_email|email_address|mailaddress|ইমেইল|ই-মেইল)([^a-z0-9]|$)/i;
var PHONE_TOKEN =
  /(^|[^a-z0-9])(phone|mobile|cellphone|whatsapp|billing_phone|shipping_phone|contact_phone|customer_phone|checkout_phone|phone_number|phonenumber|tel|telephone|মোবাইল|ফোন)([^a-z0-9]|$)/i;

function attr(el, name) {
  try {
    return el && el.getAttribute ? String(el.getAttribute(name) || "") : "";
  } catch (e) {
    return "";
  }
}

function fieldHaystack(el) {
  if (!el) return "";
  return [
    el.name,
    el.id,
    el.className,
    el.placeholder,
    el.type,
    el.inputMode,
    attr(el, "autocomplete"),
    attr(el, "inputmode"),
    attr(el, "aria-label"),
    attr(el, "data-field"),
    attr(el, "data-name"),
    attr(el, "data-testid"),
    attr(el, "data-esb-track"),
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * @param {Element|null|undefined} el
 * @returns {"email"|"phone"|null}
 */
export function classifyCheckoutContactField(el) {
  if (!el || el.disabled) return null;
  var tag = String(el.tagName || "").toLowerCase();
  if (tag !== "input" && tag !== "textarea") return null;
  var type = String(el.type || "text").toLowerCase();
  if (
    type === "hidden" ||
    type === "checkbox" ||
    type === "radio" ||
    type === "submit" ||
    type === "button" ||
    type === "password" ||
    type === "file" ||
    type === "image"
  ) {
    return null;
  }

  if (type === "email") return "email";
  if (type === "tel") return "phone";

  var ac = String(el.autocomplete || attr(el, "autocomplete") || "")
    .toLowerCase()
    .split(" ")
    .pop();
  if (ac === "email") return "email";
  if (ac === "tel" || ac === "tel-national" || ac === "tel-local" || ac === "tel-country-code" || ac === "mobile") {
    return "phone";
  }

  var mode = String(el.inputMode || attr(el, "inputmode") || "").toLowerCase();
  if (mode === "email") return "email";
  if (mode === "tel") return "phone";

  var hay = fieldHaystack(el);
  if (EMAIL_TOKEN.test(hay)) return "email";
  if (PHONE_TOKEN.test(hay)) return "phone";
  return null;
}

export function contactValueFromInput(el) {
  if (!el) return "";
  var v = el.type === "checkbox" || el.type === "radio" ? "" : String(el.value || "").trim();
  return v;
}

export function isValidContactValue(kind, value) {
  var raw = String(value || "").trim();
  if (!raw) return false;
  if (kind === "phone") return raw.replace(/\D/g, "").length >= 8;
  if (kind === "email") return raw.indexOf("@") > 0;
  return false;
}

/** @returns {boolean} true if this value was not fired yet */
export function markContactValueFired(kind, value) {
  var g = typeof window !== "undefined" ? window : {};
  g.__ecomsoContactValueFired = g.__ecomsoContactValueFired || {};
  var raw = String(value || "").trim();
  if (!isValidContactValue(kind, raw)) return false;
  var norm = kind === "phone" ? raw.replace(/\D/g, "").slice(-10) : raw.toLowerCase();
  var key = kind + ":" + norm;
  if (g.__ecomsoContactValueFired[key]) return false;
  g.__ecomsoContactValueFired[key] = 1;
  return true;
}

/**
 * @param {(event: string, props?: Record<string, unknown>) => unknown} track
 */
export function installCheckoutContactCapture(track) {
  if (typeof document === "undefined" || typeof track !== "function") return;
  if (document.documentElement.getAttribute("data-esb-contact-capture") === "1") return;
  document.documentElement.setAttribute("data-esb-contact-capture", "1");

  function onField(ev) {
    try {
      var el = ev && ev.target;
      var kind = classifyCheckoutContactField(el);
      if (!kind) return;
      var v = contactValueFromInput(el);
      if (!isValidContactValue(kind, v)) return;
      // Defer so Woo/Next/Laravel form handlers send first (they include cart extras).
      setTimeout(function () {
        try {
          if (!markContactValueFired(kind, v)) return;
          var eventName = kind === "email" ? "email_address_added" : "phone_number_added";
          var props = kind === "email" ? { email: v } : { phone: v };
          track(eventName, props);
        } catch (e2) {
          /* ignore */
        }
      }, 0);
    } catch (e) {
      /* ignore */
    }
  }

  document.addEventListener("change", onField, true);
  document.addEventListener("blur", onField, true);
}
