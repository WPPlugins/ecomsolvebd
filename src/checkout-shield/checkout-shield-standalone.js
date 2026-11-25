/**
 * Standalone Checkout Shield script — load it only on checkout pages:
 *
 *   <script src="https://api.ecomsolvebd.com/api/v1/checkout-shield/public/script.js"
 *           data-merchant-key="YOUR_MERCHANT_ID" defer></script>
 *
 * WooCommerce plugin enqueues a local copy on the checkout page; Laravel / Next.js / Custom add the tag.
 * Inert unless Super Admin turned Checkout Shield on for that store. Never blocks an order on our trouble.
 */
import { installCheckoutShield } from "./checkout-shield.js";

(function boot() {
  if (typeof document === "undefined") return;
  const script = document.currentScript;
  const ds = (script && script.dataset) || {};
  const cfgWin = (typeof window !== "undefined" && window.ESB_CHECKOUT_SHIELD) || {};
  const merchantId = String(ds.merchantKey || ds.key || cfgWin.merchantKey || "").trim();
  if (!merchantId) return;
  let shieldApiBase = String(ds.api || cfgWin.api || "").trim();
  if (shieldApiBase) {
    shieldApiBase = `${shieldApiBase.replace(/\/+$/, "").replace(/\/api$/, "")}/api/v1/checkout-shield/public`;
  } else if (script && script.src && /\/api\/v1\/checkout-shield\/public\//.test(script.src)) {
    shieldApiBase = script.src.replace(/\/script\.js.*$/, "");
  }
  try {
    installCheckoutShield({ merchantId, shieldApiBase: shieldApiBase || undefined });
  } catch {
    /* never break the store */
  }
})();
