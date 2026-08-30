import assert from "node:assert/strict";
import { classifyCheckoutContactField, isValidContactValue } from "./checkout-contact-detect.js";

function el(partial) {
  const attrs = partial.attrs || {};
  return {
    tagName: "INPUT",
    disabled: false,
    type: "text",
    name: "",
    id: "",
    className: "",
    placeholder: "",
    inputMode: "",
    autocomplete: "",
    getAttribute(name) {
      if (Object.prototype.hasOwnProperty.call(attrs, name)) return attrs[name];
      if (name === "autocomplete") return this.autocomplete || "";
      if (name === "inputmode") return this.inputMode || "";
      return "";
    },
    ...partial,
  };
}

assert.equal(classifyCheckoutContactField(el({ type: "email" })), "email");
assert.equal(classifyCheckoutContactField(el({ type: "tel" })), "phone");
assert.equal(classifyCheckoutContactField(el({ autocomplete: "email" })), "email");
assert.equal(classifyCheckoutContactField(el({ autocomplete: "section-billing email" })), "email");
assert.equal(classifyCheckoutContactField(el({ autocomplete: "tel" })), "phone");
assert.equal(classifyCheckoutContactField(el({ autocomplete: "tel-national" })), "phone");
assert.equal(classifyCheckoutContactField(el({ inputMode: "email" })), "email");
assert.equal(classifyCheckoutContactField(el({ inputMode: "tel" })), "phone");
assert.equal(classifyCheckoutContactField(el({ name: "billing_email" })), "email");
assert.equal(classifyCheckoutContactField(el({ id: "customer_phone" })), "phone");
assert.equal(classifyCheckoutContactField(el({ name: "user[contact_email]" })), "email");
assert.equal(classifyCheckoutContactField(el({ className: "form-control checkout_phone" })), "phone");
assert.equal(classifyCheckoutContactField(el({ placeholder: "আপনার ইমেইল" })), "email");
assert.equal(classifyCheckoutContactField(el({ attrs: { "aria-label": "মোবাইল নম্বর" } })), "phone");
assert.equal(classifyCheckoutContactField(el({ attrs: { "data-field": "phone_number" } })), "phone");
assert.equal(classifyCheckoutContactField(el({ attrs: { "data-esb-track": "email_address_added" } })), "email");
assert.equal(classifyCheckoutContactField(el({ type: "password", name: "email" })), null);
assert.equal(classifyCheckoutContactField(el({ type: "hidden", name: "billing_email" })), null);
assert.equal(classifyCheckoutContactField(el({ name: "first_name" })), null);
assert.equal(classifyCheckoutContactField(el({ name: "hotel_name" })), null);
assert.equal(classifyCheckoutContactField(el({ tagName: "SELECT", name: "email" })), null);

assert.equal(isValidContactValue("email", "a@b.com"), true);
assert.equal(isValidContactValue("email", "not-an-email"), false);
assert.equal(isValidContactValue("phone", "01777777333"), true);
assert.equal(isValidContactValue("phone", "123"), false);

console.log("checkout-contact-detect.selftest: ok");
