=== EcomSolveBD ===
Contributors: ecomsolvebd
Tags: woocommerce, analytics, attribution, tracking, utm
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.0.67
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

First-party storefront tracking and WooCommerce events for EcomSolveBD — UTM, click IDs, sessions, and optional Google Analytics 4 Measurement ID.

== Description ==

EcomSolveBD connects your WordPress / WooCommerce store to [EcomSolveBD](https://ecomsolvebd.com) so you can attribute visits and orders with first-party collection.

**Features**

* Browser tracking for UTM parameters and ad click IDs (e.g. gclid, fbclid, ttclid)
* WooCommerce events when WooCommerce is active (view item, add to cart, purchase, and related hooks)
* Optional first-party tracking hostname (CNAME) to reduce ad-blocker impact
* Optional Google Analytics 4 Measurement ID (standard gtag.js automatic events only)
* Product feed URLs for EcomSolveBD catalog, Meta, TikTok, and Google Merchant Center

This plugin is a client for the EcomSolveBD service (SaaS). You need a free or paid EcomSolveBD account and a Tracking Merchant ID from your dashboard. All plugin code is free under GPLv2 or later; EcomSolveBD account features are provided by the service.

**External services**

After you save a valid Merchant ID, the plugin communicates with external services. No data is sent until you connect.

* **EcomSolveBD API** (`https://api.ecomsolvebd.com`) — validates your Merchant ID, syncs configuration, receives tracking and order-related events, provisions first-party collect hostnames, and powers reporting in your dashboard. Sent when you save settings, test connection, verify DNS, sync orders, or when storefront visitors trigger tracking. Terms: https://ecomsolvebd.com/terms — Privacy: https://ecomsolvebd.com/privacy

* **Your first-party tracking subdomain** (optional CNAME you configure) — after DNS verification, browser collect requests may go to your own subdomain (for example `tracking.yourstore.com`) instead of the API host. Sent only when tracking runs on your storefront.

* **Cloudflare DNS over HTTPS** (`https://cloudflare-dns.com/dns-query`) — used by the EcomSolveBD service when you verify first-party DNS in your dashboard (Integrations). The WordPress plugin syncs the verified status; it does not run DNS checks on its own. Cloudflare terms: https://www.cloudflare.com/website-terms/ — Privacy: https://www.cloudflare.com/privacypolicy/

* **Google Analytics / Google Tag Manager** (optional) — when you enter a GA4 Measurement ID, the plugin loads `gtag.js` from `https://www.googletagmanager.com/gtag/js` for standard GA4 automatic events. Google terms: https://marketingplatform.google.com/about/analytics/terms/us/ — Privacy: https://policies.google.com/privacy

See the FAQ below for a summary of storefront data fields.

== Installation ==

1. In WordPress go to **Plugins → Add New → Upload Plugin** (or install from WordPress.org when listed).
2. Upload the `ecomsolvebd` zip, or search for **EcomSolveBD**.
3. Activate **EcomSolveBD**.
4. Open **EcomSolveBD** in the admin menu, paste your Tracking Merchant ID from [EcomSolveBD → Integrations](https://ecomsolvebd.com/dashboard), and save.
5. (Optional) Configure first-party DNS in EcomSolveBD → Integrations (the plugin syncs status). Optionally set a GA4 Measurement ID under **Google Analytics 4** in this plugin.

**Correct install path:** `wp-content/plugins/ecomsolvebd/ecomsolvebd.php`

If WordPress shows **“Plugin file does not exist”**, delete any broken `ecomsolvebd*` or legacy `ecomsolvebd-tracker*` / `fcommerce-tracker` folders under `wp-content/plugins/` (SFTP), then upload a zip built with forward-slash paths (not Windows Explorer “Send to compressed folder”).

**Upgrading from older zips:** Deactivate and delete the old `ecomsolvebd-tracker` folder, then install this `ecomsolvebd` package. Your `ecomso_*` settings are kept in the database.

== Frequently Asked Questions ==

= Does this require WooCommerce? =

No. Storefront tracking works on normal pages. WooCommerce-specific scripts load only when WooCommerce is active.

= Does this require an EcomSolveBD account? =

Yes. Create an account at [ecomsolvebd.com](https://ecomsolvebd.com), connect your store, and copy the Tracking Merchant ID into the plugin settings. Saving a valid Merchant ID is how you authorize the plugin to send data to EcomSolveBD.

= What data is sent? =

Depending on configuration: page and session identifiers, UTM / click IDs, device and referrer context, and (with WooCommerce) order and cart-related event payloads used for attribution and reporting in your EcomSolveBD dashboard. See the service privacy policy.

= Does the plugin load Google Analytics? =

Only if you enter a GA4 Measurement ID on the plugin’s GA4 settings page. Then the standard Google tag (gtag.js) is loaded from Google for automatic events. Leave the field empty to disable GA4.

= Is there a trial lock or paid unlock inside the plugin? =

No. All plugin code that ships in this package is available once connected. First-party DNS is configured and verified in the EcomSolveBD dashboard; the plugin syncs that status. Premium capabilities live on the EcomSolveBD service, not behind a locked local feature.

= Where is the source for the minified tracker script? =

`assets/js/ecomsolvebd.js` is a minified browser bundle. The same human-readable JavaScript lives in `src/tracker/` inside this plugin (see `src/BUILD.txt`). Rebuild from the EcomSolveBD monorepo with `npm run tracker:sync` when developing.

== Privacy ==

This plugin does not phone home until an administrator configures a Merchant ID (and optionally GA4). Merchants are responsible for disclosing storefront analytics and advertising attribution to their visitors (cookie / privacy notices, consent tools) as required by local law. Visitor identifiers may be stored in first-party cookies for attribution continuity.

Privacy policy: https://ecomsolvebd.com/privacy  
Terms: https://ecomsolvebd.com/terms

== Development ==

* Readable tracker source: `src/tracker/`
* Build notes: `src/BUILD.txt`
* Minified runtime: `assets/js/ecomsolvebd.js` (generated; do not hand-edit)
* Other storefront scripts (`ecomso-runtime.js`, `ecomso-wc-bridge.js`) ship unminified

== Changelog ==

= 1.0.67 =
* EcomSolveBD catalog feed (`/feed/products.xml`): optional sku, description, and variants_note for SaaS / Inbox AI (Meta, TikTok, and Google channel feeds unchanged).

= 1.0.66 =
* WordPress.org: banner crop fix; Version header sync.

= 1.0.65 =
* readme: Tested up to WordPress 7.1 (compatibility notice fix).

= 1.0.64 =
* WordPress.org: plugin banner assets; Tested up to 6.8.

= 1.0.63 =
* Security: stop forwarding spoofable client IP/geo headers from public REST requests; derive visitor IP from REMOTE_ADDR or verified Cloudflare edge signals only.

= 1.0.62 =
* Plugin Check: avoid apply_filters on WooCommerce core hook in cart payload builder (behavior unchanged).

= 1.0.61 =
* WP admin: remove first-party DNS form (subdomain, CNAME table, Verify button). Configure DNS in EcomSolveBD → Integrations; plugin shows read-only status + link.

= 1.0.60 =
* WordPress.org review: rename short `esb` prefix to `ecomso` (options, classes, script handles, REST `ecomso/v1`). Legacy `esb/v1` + `fct/v1` routes kept for cached HTML. Auto-migrate `esb_*` options and order meta.

= 1.0.59 =
* Plugin Check: set script version on GA4 gtag registration.

= 1.0.58 =
* readme: Tested up to WordPress 7.1 (automated Plugin Check).

= 1.0.57 =
* WordPress.org review: restore first-party DNS verify in WP admin (no locked local features).
* Plugin Check: wp_enqueue for admin feed copy, checkout meta, and WooCommerce globals (no raw `<script>` tags).
* Sanitize landing query keys in server-side precapture; REST product-ecommerce returns only publicly viewable products.
* readme: disclose EcomSolveBD API, Cloudflare DNS-over-HTTPS, and Google Analytics external services.

= 1.0.56 =
* Plugin Check: enqueue runtime/gtag via wp_enqueue_script; escape/sanitize input warnings cleared (no tracking behavior change).

= 1.0.55 =
* WordPress.org slug alignment: plugin folder, main file, and text domain are now `ecomsolvebd` (was `ecomsolvebd-tracker`). Settings (`ecomso_*`) unchanged.

= 1.0.54 =
* WordPress.org Plugin Check: Plugin URI and Author URI must differ — Author URI set to WordPress.org profile.

= 1.0.53 =
* WordPress.org readiness: ship human-readable tracker source under `src/tracker/` (Guideline 4) + BUILD notes.
* readme: Development section, Tested up to 7.0.
* Default IP-block overlay fallback copy is English; API can still return a localized message (no feature change).

= 1.0.52 =
* begin_checkout on FunnelKit / CartFlows / CheckoutWC pages (not only Woo `is_checkout()` URLs). Bridge loads on those funnels; form injected late is still captured.

= 1.0.51 =
* Checkout email/phone detected from type, autocomplete, and common field names (not only billing_email / billing_phone). checkout_form_abandoned is no longer sent from the storefront.

= 1.0.50 =
* Admin menu uses the original EcomSolveBD bag+e mark, now white on transparent (matches other WP sidebar icons).

= 1.0.49 =
* Admin menu icon is a white SVG (same style as other WP sidebar icons) — old PNG sat on black and vanished on the dark menu.

= 1.0.48 =
* TikTok catalog feed is RSS/XML (g: namespace + sku_id) — same shape as Meta/Google, for Ads Manager RSS/XML upload.

= 1.0.47 =
* Tracker: merchant IP block gate — blocked visitors see a full-screen contact-admin message (cannot dismiss until unblocked).

= 1.0.46 =
* Remove storefront Attribution Debug overlay and Console debug product (use staging dashboard Attribution Debugger).

= 1.0.45 =
* DNS verify/delete: hot-swap ingest endpoint; pending outbox keeps same client_event_id (no lost events / no duplicate purchase).

= 1.0.44 =
* Auto mode: Direct API (api.ecomsolvebd.com) until DNS verified; then custom subdomain. Shared outbox/retry; WP REST proxy kept for back-compat.

= 1.0.43 =
* WP admin: remove first-party DNS table / parity copy — verify only in EcomSolveBD Integrations; plugin shows status + link.

= 1.0.42 =
* First-party DNS Verify moved to EcomSolveBD Integrations (Woo) — plugin syncs status from SaaS like Shopify/Laravel/Next.

= 1.0.41 =
* DNS Verify: Cloudflare DoH + SaaS CNAME check when hosting dns_get_record misses a valid CNAME (common on managed WP).

= 1.0.40 =
* On Verify: call SaaS to auto-create Cloudflare Custom Hostname (no manual Add per merchant), then require HTTPS before activating subdomain ingest.

= 1.0.39 =
* Persist DNS verify to settings immediately (survives Clear Cache). Require HTTPS health on the tracking host before activating subdomain ingest (CNAME-only no longer switches off store_proxy onto a dead edge). Save keeps a verified host if DNS re-check flakes.

= 1.0.38 =
* Restore checkout/cart auto page_view (same as before): page_view + begin_checkout/view_cart. Keep 1.0.36 storm fixes (one HTTP per event).

= 1.0.37 =
* Checkout/cart: skip auto page_view + clarity sync so only begin_checkout / view_cart fire (keeps form events). Stops duplicate master-ingest.

= 1.0.36 =
* Fix multi-POST storms: each track() sends only that event (no outbox backlog replay); clarity sync once/session; cache attribution-config 12h.

= 1.0.35 =
* Fix wrong visitor geo on store_proxy: map CF visitor IP/country to X-ESB-* (raw cf-* still not forwarded).
* Harden view_item to once per PDP page (stops 429 storms with page_view/outbox).

= 1.0.34 =
* Fix checkout hang: stop `ecomso-wc-bridge` from retry-storming `master-ingest` on HTTP 429 (was starving Woo AJAX).
* Tracker outbox: long backoff + drain pause on rate limit; stable client_event_id for begin_checkout/view_cart.

= 1.0.27 =
* Settings: clearer Merchant ID help; hide connection banner, server-side capture toggle, and console debug from UI.
* GA4: cleaner copy; keep Measurement ID guide link.
* WordPress.org polish: plugin-only notices, merchant-safe connection errors, exclude internal docs from zip.

= 1.0.26 =
* Plugins screen: Settings link next to Deactivate.

= 1.0.25 =
* Admin UI: English-only strings (removed hardcoded Bengali).

= 1.0.24 =
* Product Feed: restore EcomSolveBD catalog card (`/feed/products.xml`).

= 1.0.23 =
* Plugin display name: EcomSolveBD (removed “Tracker”).
* Admin menu icon: white mark matching WordPress menu style.

= 1.0.22 =
* WordPress.org readiness: LICENSE, readme Description / Privacy / external services disclosure.
* Full EcomSolveBD branding (removed leftover F-Commerce admin copy).
* Packaging guidance: keep slug `ecomsolvebd` stable; ship POSIX-path zips only.

= 1.0.21 =
* Admin menu brand icon; menu position above WooCommerce.
* Link to Measurement ID & API Secret guide from the GA4 settings page.

= 1.0.20 =
* First-party tracking settings UI aligned with EcomSolveBD dashboard patterns.

= 1.0.19 =
* First-party Auto mode: browser collect uses same-origin store REST proxy until DNS is verified, then switches to the custom tracking subdomain.

= 1.0.18 =
* Product Feed admin: Facebook / TikTok / Google feed URLs.

= 1.0.17 =
* Product feeds: `/feed/products.xml`, `/feed/facebook.xml`, `/feed/tiktok.xml`, `/feed/google.xml`.

= 1.0.16 =
* GA4 Measurement ID loads standard gtag.js only (automatic events).

= 1.0.15 =
* Server-side landing capture for click IDs / UTM before theme and pixels run.

= 1.0.1 =
* Rename from legacy folder to `ecomsolvebd`; migrate `fct_*` options to `ecomso_*`.

= 1.0.0 =
* Rebrand to EcomSolveBD Tracker.

== Upgrade Notice ==

= 1.0.67 =
Richer SaaS catalog feed fields only. Tracking and Meta/TikTok/Google feeds unchanged — safe overwrite.

= 1.0.61 =
First-party DNS UI removed from WP admin (use EcomSolveBD dashboard). Status still syncs. Safe overwrite.

= 1.0.60 =
Prefix rename (`ecomso_*`); settings migrate from `esb_*` automatically. Safe overwrite (folder `ecomsolvebd`).

= 1.0.59 =
Plugin Check gtag version fix. Safe overwrite (folder `ecomsolvebd`).

= 1.0.58 =
readme Tested up to 7.1. Safe overwrite (folder `ecomsolvebd`).

= 1.0.57 =
WordPress.org review compliance (DNS verify, enqueue, sanitization, readme). Safe overwrite (folder `ecomsolvebd`).

= 1.0.56 =
Plugin Check security/enqueue fixes. Same features — safe overwrite (folder `ecomsolvebd`).

= 1.0.55 =
Folder renamed to `ecomsolvebd`. Delete old `ecomsolvebd-tracker` folder before installing this zip (settings are kept).

= 1.0.54 =
Plugin/Author URI header fix for WordPress.org. Same features — safe overwrite (keep folder `ecomsolvebd`).

= 1.0.53 =
WordPress.org source disclosure for the tracker bundle. Same features — safe overwrite update (keep folder `ecomsolvebd`).

= 1.0.23 =
Display name EcomSolveBD + white admin menu icon. Same folder slug — safe to overwrite-update.

= 1.0.22 =
Branding and WordPress.org documentation updates. Keep the same plugin folder name when updating — do not rename `ecomsolvebd`.
