# WooCommerce event tracking — theme/plugin extension

Goal: support new store themes by adding hints in ecomso-wc-bridge.js (and class-ecomso-wc.php if needed) without rewriting the whole plugin.

## Console vs DB / Realtime

| Symptom | Cause |
|---------|--------|
| [esb] track → view_cart in console | Bridge created the event |
| No row in DB | Ingest failed (401, ngrok, API down) |
| Missing in Realtime | Not stored in DB |

Checklist: look for [esb] ingest OK, Network POST 200, and ECOMSO_WC_TEST in ecomsolvebd.php.

## Key files

1. ssets/js/ecomso-wc-bridge.js — Woo events + DOM clicks + checkout fields
2. ssets/js/ecomsolvebd.js — core tracker (synced via 
pm run tracker:sync)
3. includes/class-ecomso-wc.php — PHP product/cart/purchase injection

Add DOM hints in ECOMSO_DOM_ADD_TO_CART_CLASS_HINTS / ECOMSO_DOM_REMOVE_FROM_CART_CLASS_HINTS / CHECKOUT_FIELD_ALIASES.
