/**
 * WooCommerce → EcomSolveBDTracker bridge (add_to_cart, thank-you purchase).
 * Loaded by ecomso-runtime.js after the core tracker is ready.
 */
(function () {
  if (typeof window !== "undefined" && window.__ecomsoWcBridgeStarted) {
    return;
  }
  if (typeof window !== "undefined") {
    window.__ecomsoWcBridgeStarted = true;
  }

  // =============================================================================
  // Verbose [esb] console logging — removed (use staging dashboard Attribution Debugger)
  // =============================================================================
  function consoleLoggingEnabled() {
    return false;
  }

  function esbTestLog() {
    if (!consoleLoggingEnabled() || typeof console === "undefined") return;
    try {
      console.info.apply(console, arguments);
    } catch (e) {}
  }

  // =============================================================================
  // DOM class/name hints — add entries here for other WooCommerce themes/plugins
  // (class/id/name/value are normalized together when matching)
  // =============================================================================
  var ECOMSO_DOM_ADD_TO_CART_CLASS_HINTS = [
    "add_to_cart",
    "add-to-cart",
    "addtocart",
    "add to cart",
    "single_add_to_cart",
    "ajax_add_to_cart",
    "wc-block-components-add-to-cart",
  ];

  var ECOMSO_DOM_REMOVE_FROM_CART_CLASS_HINTS = [
    "remove",
    "remove_from_cart",
    "remove-from-cart",
    "cart-item__remove",
    "product-remove",
    "wc-block-cart-item__remove",
    "remove-item",
  ];

  /** Update cart button — qty down = remove, qty up = add (used in submit handler) */
  var ECOMSO_DOM_UPDATE_CART_NAMES = ["update_cart"];

  function normDomToken(str) {
    return String(str || "")
      .toLowerCase()
      .replace(/[\s_\-]+/g, "");
  }

  function elementDomBlob(el) {
    if (!el) return "";
    var parts = [];
    try {
      if (el.classList && el.classList.length) {
        for (var ci = 0; ci < el.classList.length; ci += 1) parts.push(el.classList[ci]);
      }
      if (el.id) parts.push(el.id);
      if (el.getAttribute) {
        var nm = el.getAttribute("name");
        var val = el.getAttribute("value");
        var typ = el.getAttribute("type");
        if (nm) parts.push(nm);
        if (val) parts.push(val);
        if (typ) parts.push(typ);
      }
    } catch (eB) {}
    return normDomToken(parts.join(" "));
  }

  function domHintsMatch(el, hints) {
    if (!el || !hints || !hints.length) return false;
    var blob = elementDomBlob(el);
    if (!blob) return false;
    for (var hi = 0; hi < hints.length; hi += 1) {
      if (blob.indexOf(normDomToken(hints[hi])) >= 0) return true;
    }
    return false;
  }

  function resolveClickableTarget(target) {
    if (!target || !target.closest) return target || null;
    // Prefer add-to-cart over generic .button when icon/span inside the button is clicked
    var atc = target.closest(
      "button.single_add_to_cart_button, button[name='add-to-cart'], .single_add_to_cart_button, .add_to_cart_button, a.add_to_cart_button, .ajax_add_to_cart, [class*='add-to-cart'], [class*='add_to_cart']"
    );
    if (atc) return atc;
    return target.closest(
      "a, button, input[type='submit'], input[type='button'], [role='button'], .button, .btn"
    );
  }

  /** PDP: hidden input / data attribute / __ECOMSO_PRODUCT__ — payload available on normal AJAX click */
  function readPdpProductItemFromElement(el) {
    try {
      var rawItem = parseJsonAttr(el, "data-ecomso-product-data");
      if (!rawItem && el && el.closest) {
        var wrap = el.closest("[data-ecomso-product-data]");
        if (wrap) rawItem = parseJsonAttr(wrap, "data-ecomso-product-data");
      }
      var form = el && el.closest ? el.closest("form.cart") : null;
      if (!rawItem && form) {
        var hid = form.querySelector('input[name="ecomso_product_data"]');
        if (hid && hid.value) {
          try {
            rawItem = JSON.parse(String(hid.value));
          } catch (eH) {}
        }
      }
      if (!rawItem && typeof window !== "undefined" && window.__ECOMSO_PRODUCT__) {
        var g = window.__ECOMSO_PRODUCT__;
        if (g.items && Array.isArray(g.items) && g.items[0]) rawItem = g.items[0];
        else if (g.product_id != null || g.item_id) rawItem = g;
      }
      return rawItem && typeof rawItem === "object" ? rawItem : null;
    } catch (eR) {
      return null;
    }
  }

  function trackAddToCartWithItem(el, rawItem, source) {
    if (!rawItem) return false;
    var qty = 1;
    var form = el && el.closest ? el.closest("form.cart") : null;
    if (form) {
      var qinp = form.querySelector('input.qty, input[name="quantity"]');
      if (qinp && qinp.value) qty = Math.max(1, parseInt(String(qinp.value), 10) || 1);
    }
    var item = normalizeItem(Object.assign({}, rawItem, { quantity: qty }));
    if (!item) return false;
    var ik = mutationKeyFromItem("add", item, qty);
    if (shouldSkipMutationDedupe("add", ik)) {
      esbTestLog("[esb] add_to_cart skipped (mutation dedupe)", source);
      return false;
    }
    esbTestLog("[esb] add_to_cart → track", source, item);
    track("add_to_cart", {
      ecommerce: {
        currency: guessWooCurrency(),
        value: (item.price || 0) * qty,
        items: [item],
      },
    });
    return true;
  }

  /** New add-to-cart button match: add hints to ECOMSO_DOM_ADD_TO_CART_CLASS_HINTS */
  function isDomAddToCartClick(el) {
    if (!el) return false;
    try {
      if (el.matches) {
        if (
          el.matches(
            '[name="add-to-cart"], .single_add_to_cart_button, .add_to_cart_button, .ajax_add_to_cart, [class*="add-to-cart"], [class*="add_to_cart"], [class*="addtocart"]'
          )
        )
          return true;
      }
      if (el.getAttribute && el.getAttribute("name") === "add-to-cart") return true;
    } catch (eM) {}
    return domHintsMatch(el, ECOMSO_DOM_ADD_TO_CART_CLASS_HINTS);
  }

  /** New remove button match: add hints to ECOMSO_DOM_REMOVE_FROM_CART_CLASS_HINTS */
  function isDomRemoveFromCartClick(el) {
    if (!el) return false;
    try {
      var href = String(el.href || (el.getAttribute && el.getAttribute("href")) || "");
      if (href.indexOf("remove_item") >= 0) return true;
      if (el.matches) {
        if (
          el.matches(
            "a.remove, .remove, [class*='remove'], .product-remove a, .cart-item__remove, .wc-block-cart-item__remove-link"
          )
        )
          return true;
      }
    } catch (eR) {}
    return domHintsMatch(el, ECOMSO_DOM_REMOVE_FROM_CART_CLASS_HINTS);
  }

  /** Update cart: <button name="update_cart" value="Update cart"> — add names to ECOMSO_DOM_UPDATE_CART_NAMES */
  function isDomUpdateCartButton(el) {
    if (!el) return false;
    try {
      var name = el.getAttribute ? el.getAttribute("name") : "";
      if (name && ECOMSO_DOM_UPDATE_CART_NAMES.indexOf(name) >= 0) return true;
      if (el.matches && el.matches('[name="update_cart"], button[name="update_cart"], input[name="update_cart"]'))
        return true;
    } catch (eU) {}
    return domHintsMatch(el, ["updatecart", "update_cart"]);
  }

  /** ngrok free tier: without this header ingest returns HTML / fails from the storefront. */
  (function patchFetchNgrok() {
    if (typeof window === "undefined" || typeof window.fetch !== "function" || window.__ecomsoNgrokFetchPatched) return;
    window.__ecomsoNgrokFetchPatched = true;
    var orig = window.fetch.bind(window);
    window.fetch = function (input, init) {
      var url = "";
      try {
        url = typeof input === "string" ? input : input && input.url ? String(input.url) : "";
      } catch (eU) {}
      if (url && url.toLowerCase().indexOf("ngrok") >= 0) {
        init = init || {};
        var h = init.headers;
        if (h && typeof Headers !== "undefined" && h instanceof Headers) {
          if (!h.has("ngrok-skip-browser-warning")) h.set("ngrok-skip-browser-warning", "true");
        } else {
          var flat = {};
          if (h && typeof h === "object") {
            if (Array.isArray(h)) {
              for (var i = 0; i < h.length; i += 1) {
                var pair = h[i];
                if (pair && pair.length >= 2) flat[String(pair[0])] = String(pair[1]);
              }
            } else {
              for (var k in h) if (Object.prototype.hasOwnProperty.call(h, k)) flat[k] = h[k];
            }
          }
          flat["ngrok-skip-browser-warning"] = "true";
          init.headers = flat;
        }
      }
      return orig(input, init);
    };
  })();

  /** @returns {{track:Function,getState?:Function}|null} */
  function resolveTrackerApi() {
    try {
      var t = window.EcomSolveBDTracker;
      if (t && t.default && typeof t.default.track === "function") t = t.default;
      if (t && typeof t.track === "function") {
        return t;
      }
    } catch (e) {}
    return null;
  }

  var __ecomsoTrackerWaiters = [];

  function flushTrackerWaiters() {
    var api = resolveTrackerApi();
    if (!api) return;
    var q = __ecomsoTrackerWaiters.splice(0);
    for (var i = 0; i < q.length; i += 1) {
      try {
        q[i](api);
      } catch (e) {}
    }
  }

  function scheduleTrackerWaitPoll() {
    if (window.__ecomsoTrackerWaitScheduled) return;
    window.__ecomsoTrackerWaitScheduled = true;
    var attempt = 0;
    (function tick() {
      flushTrackerWaiters();
      if (__ecomsoTrackerWaiters.length === 0) {
        window.__ecomsoTrackerWaitScheduled = false;
        return;
      }
      attempt += 1;
      if (attempt > 100) {
        window.__ecomsoTrackerWaitScheduled = false;
        if (typeof console !== "undefined") {
          console.error(
            "[esb] Woo bridge: EcomSolveBDTracker not ready. Check EcomSolveBD Tracker → Settings (API URL + Merchant ID) and save."
          );
        }
        return;
      }
      setTimeout(tick, 100);
    })();
  }

  /** @param {(api:{track:Function,getState?:Function}) => void} fn */
  function whenTrackerReady(fn) {
    var api = resolveTrackerApi();
    if (api) {
      fn(api);
      return;
    }
    __ecomsoTrackerWaiters.push(fn);
    scheduleTrackerWaitPoll();
  }

  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("ecomso:ready", flushTrackerWaiters, { passive: true });
  }

  function debugEnabled() {
    return false;
  }

  /** Snapshot page URL at event time (checkout/cart retries must not use a later location). */
  function capturePageContext() {
    try {
      if (typeof location === "undefined") return {};
      return {
        url: String(location.href || ""),
        path: String((location.pathname || "") + (location.search || "")),
        title: typeof document !== "undefined" ? String(document.title || "") : "",
      };
    } catch (eCtx) {
      return {};
    }
  }

  function mergePageContext(props, frozenPage) {
    var base = props && typeof props === "object" ? props : {};
    var page = frozenPage && frozenPage.url ? frozenPage : capturePageContext();
    var out = Object.assign({}, base);
    if (page.url) out.url = page.url;
    if (page.path) out.path = page.path;
    if (page.title) out.title = page.title;
    return out;
  }

  /** DataLayer sometimes nests ecommerce twice — flatten before send. */
  function flattenTrackProps(props) {
    if (!props || typeof props !== "object") return props || {};
    var eco = props.ecommerce;
    if (eco && typeof eco === "object" && eco.ecommerce && typeof eco.ecommerce === "object") {
      var inner = eco.ecommerce;
      if (inner.currency != null || inner.value != null || (Array.isArray(inner.items) && inner.items.length)) {
        return Object.assign({}, props, { ecommerce: inner });
      }
    }
    return props;
  }

  function hash32(str) {
    var h = 2166136261;
    var s = String(str || "");
    for (var i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  /** Stable id for purchase + once-per-page cart/PDP events (stops 429 retry storms). */
  function buildStableClientEventId(ev, props) {
    var p = props || {};
    if (p.client_event_id) return String(p.client_event_id);
    try {
      if (ev === "purchase" && p.order_id) return "ecomso_" + hash32("purchase:" + String(p.order_id));
      if (ev === "begin_checkout" || ev === "view_cart" || ev === "view_item") {
        var eco = p.ecommerce && typeof p.ecommerce === "object" ? p.ecommerce : null;
        var parts = [];
        if (eco && Array.isArray(eco.items)) {
          for (var i = 0; i < Math.min(8, eco.items.length); i += 1) {
            var it = eco.items[i] || {};
            parts.push(
              String(it.product_id != null ? it.product_id : it.item_id || "") +
                "x" +
                String(it.quantity != null ? it.quantity : 1)
            );
          }
        }
        var path = p.path ? String(p.path) : "";
        return "ecomso_" + hash32(String(ev) + ":" + path + ":" + parts.join(","));
      }
    } catch (_cid) {}
    return "";
  }

  var __ecomsoLocalTrackSent = {};

  function track(ev, props, onDone, frozenPage) {
    var flat = flattenTrackProps(mergePageContext(props || {}, frozenPage));
    var cid = buildStableClientEventId(ev, flat);
    if (cid) {
      flat.client_event_id = cid;
      if (
        (ev === "purchase" || ev === "begin_checkout" || ev === "view_cart" || ev === "view_item") &&
        __ecomsoLocalTrackSent[cid]
      ) {
        if (typeof onDone === "function") onDone(true);
        return;
      }
    }
    whenTrackerReady(function (api) {
      if (debugEnabled()) {
        esbTestLog("[esb] wc bridge →", ev, "(see next line for payload)");
        try {
          if (typeof api.getState === "function") esbTestLog("[esb] tracker state", api.getState());
        } catch (eSt) {}
      }
      var sent = false;
      try {
        var r = api.track(ev, flat || {});
        if (r && typeof r.then === "function") {
          r.then(function (ok) {
            if (ok && cid) __ecomsoLocalTrackSent[cid] = Date.now();
            else if (cid) delete __ecomsoLocalTrackSent[cid];
            if (debugEnabled()) {
              esbTestLog(ok ? "[esb] wc ingest OK ✓" : "[esb] wc ingest FAIL ✗", ev);
            }
            if (!ok && typeof console !== "undefined" && debugEnabled()) {
              console.warn(
                "[esb] wc ingest failed for",
                ev,
                "— check ingest HTTP status above (400 = invalid payload, 401 = merchant key)."
              );
            }
            if (typeof onDone === "function") onDone(!!ok);
          });
          return;
        }
        sent = r !== false;
      } catch (e2) {
        sent = false;
      }
      if (sent && cid) __ecomsoLocalTrackSent[cid] = Date.now();
      else if (cid) delete __ecomsoLocalTrackSent[cid];
      if (debugEnabled()) esbTestLog(sent ? "[esb] wc ingest OK ✓" : "[esb] wc ingest FAIL ✗", ev);
      if (typeof onDone === "function") onDone(sent);
    });
  }

  function purchasePayloadFromUrl() {
    try {
      var path = String(location.pathname || "");
      var m = path.match(/order-received\/(\d+)/i);
      if (!m) return null;
      return { orderId: m[1] };
    } catch (e) {
      return null;
    }
  }

  function emitPurchaseEvent(attempt) {
    var p = window.__ECOMSO_PURCHASE__ || purchasePayloadFromUrl();
    if (!p) return;
    var orderId = String(p.orderId || p.order_id || "");
    if (!orderId) return;
    var cid = "ecomso_" + hash32("purchase:" + orderId);
    if (__ecomsoLocalTrackSent[cid]) return;

    if (!resolveTrackerApi()) {
      if ((attempt || 0) < 40) {
        setTimeout(function () {
          emitPurchaseEvent((attempt || 0) + 1);
        }, 250);
      }
      return;
    }

    track("purchase", {
      order_id: orderId,
      value: p.total != null ? p.total : p.value,
      currency: p.currency || "",
      email: p.email || "",
      phone: p.phone || "",
      ecommerce: p.ecommerce || null,
    });
  }

  function hasBodyClass(cls) {
    try {
      return document && document.body && document.body.classList && document.body.classList.contains(cls);
    } catch {
      return false;
    }
  }

  /** Cart URL may be /cart, /cart/, or translated — body class is sometimes missing (blocks / page builders). */
  function isLikelyCartUrl() {
    try {
      var path = (typeof location !== "undefined" ? location.pathname || "" : "").toLowerCase();
      path = path.replace(/\/+$/, "") || "/";
      if (path === "/cart" || path.endsWith("/cart")) return true;
    } catch (e) {}
    return false;
  }

  /** Checkout slug may be checkout-2 etc.; avoid order-received thank-you page. */
  function isLikelyCheckoutUrl() {
    try {
      var path = (typeof location !== "undefined" ? location.pathname || "" : "").toLowerCase();
      if (path.indexOf("order-received") >= 0) return false;
      if (path.indexOf("thank-you") >= 0 || path.indexOf("thankyou") >= 0) return false;
      if (path.indexOf("checkout") >= 0) return true;
      if (path.indexOf("wfacp") >= 0) return true;
      if (path.indexOf("cartflow") >= 0) return true;
      if (path.indexOf("/wcf-") >= 0) return true;
    } catch (e2) {}
    return false;
  }

  function hasFunnelCheckoutBodyClass() {
    var names = [
      "wfacp_checkout_page",
      "wfacp-template",
      "wfacp_default_template",
      "cartflows-checkout",
      "wcf-checkout",
      "checkout-wc",
      "cfw-checkout",
      "fk-checkout",
    ];
    for (var i = 0; i < names.length; i += 1) {
      if (hasBodyClass(names[i])) return true;
    }
    try {
      var cls = document.body && document.body.className ? String(document.body.className).toLowerCase() : "";
      if (cls.indexOf("wfacp") >= 0 && cls.indexOf("checkout") >= 0) return true;
    } catch (eCls) {}
    return false;
  }

  function hasCheckoutFormOrSummary() {
    try {
      if (getCheckoutForm()) return true;
      return !!document.querySelector(
        [
          "#wfacp-e-form",
          ".wfacp_main_form",
          ".wfacp-form",
          ".wfacp_order_summary",
          "#wcf-embed-checkout-form",
          ".wcf-embed-checkout-form",
          "#order_review",
          "form.checkout",
          "form.wc-block-checkout__form",
        ].join(", ")
      );
    } catch (eDom) {
      return false;
    }
  }

  /** Standard Woo + FunnelKit / CartFlows / CheckoutWC one-page checkouts. */
  function isCheckoutPage() {
    if (typeof isOrderReceivedPage === "function" && isOrderReceivedPage()) return false;
    if (hasBodyClass("woocommerce-order-received")) return false;
    if (hasBodyClass("woocommerce-checkout")) return true;
    if (isLikelyCheckoutUrl()) return true;
    if (hasFunnelCheckoutBodyClass()) return true;
    if (hasCheckoutFormOrSummary()) return true;
    return false;
  }

  function parseJsonAttr(el, attr) {
    try {
      if (!el) return null;
      var raw = el.getAttribute ? el.getAttribute(attr) : null;
      if (!raw) return null;
      return JSON.parse(String(raw));
    } catch (e) {
      return null;
    }
  }

  function guessWooCurrency() {
    try {
      if (window.__ECOMSO_CART__ && window.__ECOMSO_CART__.currency) return String(window.__ECOMSO_CART__.currency);
      if (window.__ECOMSO_PRODUCT__ && window.__ECOMSO_PRODUCT__.currency) return String(window.__ECOMSO_PRODUCT__.currency);
      if (typeof window.wcSettings !== "undefined" && window.wcSettings) {
        var c = window.wcSettings.currency;
        if (c && typeof c === "object" && c.code) return String(c.code);
        if (typeof c === "string") return c;
      }
      if (typeof window.wcBlocksConfig !== "undefined" && window.wcBlocksConfig && window.wcBlocksConfig.currencyCode) {
        return String(window.wcBlocksConfig.currencyCode);
      }
    } catch (e) {}
    return "";
  }

  /** EcomSolveBD live Woo payloads (PHP session) — safe with page cache; avoids wc/store 500s. */
  function esbWcDataBase() {
    try {
      if (window.__ECOMSO_CONFIG__ && window.__ECOMSO_CONFIG__.wcDataBase) return String(window.__ECOMSO_CONFIG__.wcDataBase);
      if (window.__ECOMSO_RUNTIME__ && window.__ECOMSO_RUNTIME__.wcDataBase) return String(window.__ECOMSO_RUNTIME__.wcDataBase);
    } catch (e0) {}
    try {
      return (location.origin || "") + "/wp-json/ecomso/v1/";
    } catch (e1) {
      return "";
    }
  }

  function fetchFctJson(path) {
    return new Promise(function (resolve) {
      try {
        var base = esbWcDataBase();
        if (!base || typeof fetch === "undefined") return resolve(null);
        var url = base.replace(/\/+$/, "") + "/" + String(path || "").replace(/^\/+/, "");
        fetch(url, { credentials: "same-origin", cache: "no-store" })
          .then(function (res) {
            if (!res.ok) return resolve(null);
            return res.json();
          })
          .then(function (json) {
            resolve(json && json.data && typeof json.data === "object" ? json.data : null);
          })
          .catch(function () {
            resolve(null);
          });
      } catch (e2) {
        resolve(null);
      }
    });
  }

  /**
   * Live cart from EcomSolveBD REST (not Woo Store API — avoids 500 + cache issues).
   * @returns {Promise<{currency:string,value:number,items:unknown[]}|null>}
   */
  function fetchStoreApiCartEcommerce() {
    return fetchFctJson("cart-ecommerce").then(function (eco) {
      if (eco && Array.isArray(eco.items)) {
        rememberLastCartEco(eco);
      }
      return eco;
    });
  }

  /**
   * Live product view_item from EcomSolveBD REST.
   * @param {number} productId
   * @returns {Promise<{currency:string,value:number,items:unknown[]}|null>}
   */
  function fetchStoreApiProductViewItem(productId) {
    var id = parseInt(String(productId || 0), 10);
    if (!Number.isFinite(id) || id <= 0) return Promise.resolve(null);
    return fetchFctJson("product-ecommerce?product_id=" + encodeURIComponent(String(id)));
  }

  function cartLineKey(it) {
    if (!it || typeof it !== "object") return "";
    return String(it.product_id != null ? it.product_id : "") + "|" + String(it.item_id != null ? it.item_id : "");
  }

  function guessProductIdFromPage() {
    try {
      var fr = window.__ECOMSO_PRODUCT__;
      if (fr && Array.isArray(fr.items) && fr.items[0] && fr.items[0].product_id != null) {
        var n = parseInt(String(fr.items[0].product_id), 10);
        if (Number.isFinite(n) && n > 0) return n;
      }
      var body = document.body;
      if (body && body.className) {
        var cn = " " + body.className + " ";
        var m = cn.match(/\bpostid-(\d+)\b/) || cn.match(/\bproduct-id-(\d+)\b/);
        if (m) {
          var p = parseInt(m[1], 10);
          if (Number.isFinite(p) && p > 0) return p;
        }
      }
      var inp = document.querySelector('input[name="add-to-cart"]');
      if (inp && inp.value) {
        var v = parseInt(String(inp.value), 10);
        if (Number.isFinite(v) && v > 0) return v;
      }
    } catch (eG) {}
    return 0;
  }

  function ecommerceFromCartLineForProduct(cartEco, productId) {
    if (!cartEco || !Array.isArray(cartEco.items)) return null;
    var pid = parseInt(String(productId || 0), 10);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    var line = null;
    for (var i = 0; i < cartEco.items.length; i += 1) {
      var li = cartEco.items[i];
      if (!li || typeof li !== "object") continue;
      var lid = li.product_id != null ? parseInt(String(li.product_id), 10) : 0;
      if (lid === pid) {
        line = li;
        break;
      }
    }
    if (!line) return null;
    var unit = normalizeItem(Object.assign({}, line, { quantity: 1 }));
    if (!unit) return null;
    return {
      currency: String(cartEco.currency || ""),
      value: unit.price || 0,
      items: [unit],
    };
  }

  function ecommerceFromWcBlocksCart() {
    try {
      var wp = window.wp;
      if (!wp || !wp.data || typeof wp.data.select !== "function") return null;
      var sel = wp.data.select("wc/store/cart");
      if (!sel || typeof sel.getCartData !== "function") return null;
      var data = sel.getCartData();
      if (!data || !Array.isArray(data.items)) return null;
      var totals = typeof sel.getCartTotals === "function" ? sel.getCartTotals() : null;
      var minor = totals && totals.currency_minor_unit != null ? Number(totals.currency_minor_unit) : 2;
      if (!Number.isFinite(minor) || minor < 0) minor = 2;
      var div = Math.pow(10, minor);
      var currency = totals && totals.currency_code ? String(totals.currency_code) : guessWooCurrency();

      function minorToFloat(raw) {
        var n = parseInt(String(raw != null ? raw : "0"), 10);
        if (!Number.isFinite(n)) n = 0;
        return n / div;
      }

      var items = [];
      var sum = 0;
      for (var i = 0; i < data.items.length; i += 1) {
        var li = data.items[i];
        if (!li || typeof li !== "object") continue;
        var qty = Math.max(1, parseInt(String(li.quantity || 1), 10) || 1);
        var name = String(li.name || "");
        var pid = li.id != null ? parseInt(String(li.id), 10) : 0;
        var sku = li.sku != null && String(li.sku).trim() ? String(li.sku) : pid ? String(pid) : "";
        var price = 0;
        if (li.prices && li.prices.price != null) price = minorToFloat(li.prices.price);
        else if (li.prices && li.prices.sale_price != null) price = minorToFloat(li.prices.sale_price);
        else if (li.prices && li.prices.regular_price != null) price = minorToFloat(li.prices.regular_price);
        sum += price * qty;
        items.push({
          product_id: Number.isFinite(pid) && pid > 0 ? pid : undefined,
          item_id: sku,
          item_name: name,
          item_category: "",
          price: price,
          item_cost: 0,
          quantity: qty,
        });
      }

      var totalFromTotals = 0;
      if (totals && totals.total_price != null) totalFromTotals = minorToFloat(totals.total_price);
      var value = totalFromTotals > 0 ? totalFromTotals : sum;

      return { currency: currency || "", value: value, items: items };
    } catch (e) {
      return null;
    }
  }

  function pickDataLayerEcommerce(eventNames) {
    try {
      var dl = window.dataLayer;
      if (!dl || typeof dl.length !== "number") return null;
      var want = {};
      if (Array.isArray(eventNames)) {
        for (var w = 0; w < eventNames.length; w += 1) want[String(eventNames[w])] = true;
      } else if (eventNames) {
        want[String(eventNames)] = true;
      }
      for (var i = dl.length - 1; i >= 0; i--) {
        var row = dl[i];
        if (!row || typeof row !== "object") continue;
        var ev = String(row.event || "");
        if (Object.keys(want).length && !want[ev]) continue;
        var eco = row.ecommerce;
        if (eco && typeof eco === "object" && Array.isArray(eco.items) && eco.items.length) return eco;
      }
    } catch (e) {}
    return null;
  }

  function resolveCartPayload(kind) {
    var direct = window.__ECOMSO_CART__;
    if (direct && typeof direct === "object" && direct.ecommerce && typeof direct.ecommerce === "object") {
      direct = direct.ecommerce;
    }
    if (direct && typeof direct === "object" && Array.isArray(direct.items) && direct.items.length) return direct;

    try {
      if (window.__ECOMSO_CONFIG__ && window.__ECOMSO_CONFIG__.cartEcommerce) {
        var cfgCart = window.__ECOMSO_CONFIG__.cartEcommerce;
        if (cfgCart && Array.isArray(cfgCart.items) && cfgCart.items.length) return cfgCart;
      }
    } catch (eCfgCart) {}

    var blocks = ecommerceFromWcBlocksCart();
    if (blocks && typeof blocks === "object" && Array.isArray(blocks.items) && blocks.items.length) return blocks;

    var primaryEv =
      kind === "checkout"
        ? ["begin_checkout", "checkout", "start_checkout"]
        : ["view_cart", "viewcart", "cart_view"];
    var fromDl = pickDataLayerEcommerce(primaryEv);
    if (fromDl) return fromDl;
    var alt = pickDataLayerEcommerce(["view_cart", "viewcart"]);
    if (alt) return alt;

    if (kind === "checkout") {
      var domCheckout = ecommerceFromCheckoutOrderSummaryDom();
      if (domCheckout && domCheckout.items && domCheckout.items.length) return domCheckout;
    }
    return null;
  }

  /** Woo Blocks checkout order summary (when cart store / PHP globals missing on cached HTML). */
  function ecommerceFromCheckoutOrderSummaryDom() {
    try {
      var rows = document.querySelectorAll(
        ".wc-block-components-order-summary-item, .wc-block-cart-items__row, .wc-block-components-product-metadata"
      );
      if (!rows || !rows.length) {
        rows = document.querySelectorAll(
          [
            ".shop_table.woocommerce-checkout-review-order-table tr.cart_item",
            "#order_review tr.cart_item",
            ".wfacp_order_summary tr.cart_item",
            ".wfacp_mini_cart_start_from_iframe tr.cart_item",
            ".wcf-review-order-wrapper tr.cart_item",
            ".shop_table tr.cart_item",
          ].join(", ")
        );
      }
      if (!rows || !rows.length) return null;
      var items = [];
      var sum = 0;
      var currency = guessWooCurrency();
      for (var i = 0; i < rows.length; i += 1) {
        var row = rows[i];
        if (!row || !row.querySelector) continue;
        var nameEl = row.querySelector(
          ".wc-block-components-product-name, .wc-block-components-order-summary-item__description, .product-name"
        );
        var name = nameEl ? String(nameEl.textContent || "").trim() : "";
        var qtyEl = row.querySelector(".wc-block-components-order-summary-item__quantity, .product-quantity");
        var qty = 1;
        if (qtyEl) {
          var qm = String(qtyEl.textContent || "").match(/(\d+)/);
          if (qm) qty = Math.max(1, parseInt(qm[1], 10) || 1);
        }
        var priceEl = row.querySelector(
          ".wc-block-formatted-money-amount, .wc-block-components-order-summary-item__total-price, .product-total .amount"
        );
        var price = parseWooAmountFromNode(priceEl);
        if (!price && qty > 1 && priceEl) price = parseWooAmountFromNode(priceEl) / qty;
        var pid = 0;
        var link = row.querySelector("a[href*='/product/']");
        if (link && link.href) {
          var pm = String(link.href).match(/\/product\/([^/?#]+)/);
          if (pm) pid = parseInt(String(pm[1]), 10) || 0;
        }
        items.push({
          product_id: pid > 0 ? pid : undefined,
          item_id: pid > 0 ? String(pid) : name.slice(0, 32),
          item_name: name,
          item_category: "",
          price: price,
          item_cost: 0,
          quantity: qty,
        });
        sum += price * qty;
      }
      if (!items.length) return null;
      return { currency: currency, value: sum, items: items };
    } catch (eDom) {
      return null;
    }
  }

  /**
   * Resolve cart lines: inline globals → blocks → live ESB REST (session cookie).
   * @returns {Promise<{currency:string,value:number,items:unknown[]}|null>}
   */
  function resolveLiveCartPayload(kind) {
    var local = resolveCartPayload(kind);
    if (local && Array.isArray(local.items) && local.items.length) {
      return Promise.resolve(local);
    }
    return fetchStoreApiCartEcommerce().then(function (apiEco) {
      if (apiEco && Array.isArray(apiEco.items) && apiEco.items.length) {
        try {
          window.__ECOMSO_CART__ = apiEco;
          if (window.__ECOMSO_CONFIG__) window.__ECOMSO_CONFIG__.cartEcommerce = apiEco;
        } catch (eSet) {}
        return apiEco;
      }
      var blocks = ecommerceFromWcBlocksCart();
      if (blocks && blocks.items && blocks.items.length) return blocks;
      if (kind === "checkout") {
        var dom = ecommerceFromCheckoutOrderSummaryDom();
        if (dom && dom.items && dom.items.length) return dom;
      }
      return local || apiEco || blocks;
    });
  }

  var __ecomsoCartPageTracked = {};
  var __ecomsoCartTrackInflight = {};

  function resetCartPageTrackedFlags() {
    try {
      delete __ecomsoCartPageTracked.view_cart;
      delete __ecomsoCartPageTracked.begin_checkout;
      delete __ecomsoCartTrackInflight.view_cart;
      delete __ecomsoCartTrackInflight.begin_checkout;
    } catch (eR) {}
  }

  if (typeof window !== "undefined" && window.addEventListener) {
    // Only bfcache restore — clearing on every pageshow re-armed duplicate begin_checkout.
    window.addEventListener(
      "pageshow",
      function (ev) {
        try {
          if (ev && ev.persisted) resetCartPageTrackedFlags();
        } catch (ePs) {}
      },
      { passive: true }
    );
  }

  function scheduleCartTrack(eventName, attempt, frozenPage) {
    if (__ecomsoCartPageTracked[eventName]) return;
    // Hold lock for the whole empty-cart poll + single send (attempt 0 only starts a chain).
    if (attempt === 0) {
      if (__ecomsoCartTrackInflight[eventName]) return;
      __ecomsoCartTrackInflight[eventName] = true;
    } else if (!__ecomsoCartTrackInflight[eventName]) {
      // Stale timer after unlock — drop.
      return;
    }
    var pageCtx = frozenPage && frozenPage.url ? frozenPage : capturePageContext();
    var checkoutPage = isCheckoutPage();
    var cartPage = hasBodyClass("woocommerce-cart") || isLikelyCartUrl();
    var kind = eventName === "begin_checkout" ? "checkout" : "cart";
    var max = checkoutPage ? 80 : 40;
    var delayMs = checkoutPage ? 150 : 90;

    if (eventName === "view_cart" && !cartPage) {
      __ecomsoCartTrackInflight[eventName] = false;
      return;
    }
    if (eventName === "begin_checkout" && !checkoutPage) {
      __ecomsoCartTrackInflight[eventName] = false;
      return;
    }

    var giveUp = attempt >= max;

    void resolveLiveCartPayload(kind).then(function (eco) {
      if (__ecomsoCartPageTracked[eventName]) {
        __ecomsoCartTrackInflight[eventName] = false;
        return;
      }
      var hasLines = !!(eco && Array.isArray(eco.items) && eco.items.length > 0);

      if (!hasLines && !giveUp) {
        setTimeout(function () {
          scheduleCartTrack(eventName, attempt + 1, pageCtx);
        }, delayMs);
        return;
      }

      if (!hasLines) {
        __ecomsoCartTrackInflight[eventName] = false;
        if (debugEnabled() && typeof console !== "undefined") {
          console.warn(
            "[esb] skipped " + eventName + " — cart lines empty after live fetch (check Woo session / wp-json/ecomso/v1/cart-ecommerce)"
          );
        }
        return;
      }

      rememberLastCartEco(eco);
      try {
        __ecomsoCachedViewCartEco = JSON.parse(
          JSON.stringify({ currency: eco.currency, value: eco.value, items: eco.items })
        );
      } catch (_) {
        __ecomsoCachedViewCartEco = eco;
      }
      // Claim once before send. Tracker outbox owns HTTP retries — bridge must NOT re-fire on 429
      // (that floods store_proxy and starves Woo checkout AJAX on the same host).
      __ecomsoCartPageTracked[eventName] = true;
      track(eventName, { ecommerce: eco }, function () {
        __ecomsoCartTrackInflight[eventName] = false;
      }, pageCtx);
    });
  }

  /** Last cart ecommerce from Store API / view_cart — used for remove_from_cart diff. */
  var __ecomsoLastCartEco = null;
  var __ecomsoCachedViewCartEco = null;
  var __ecomsoPreMutationCartEco = null;
  var __ecomsoPreAddCartEco = null;

  function cloneCartEcoSnapshot(eco) {
    try {
      if (!eco || typeof eco !== "object" || !Array.isArray(eco.items) || !eco.items.length) return null;
      return {
        currency: eco.currency,
        value: eco.value,
        items: eco.items.map(function (it) {
          return Object.assign({}, it);
        }),
      };
    } catch (eC) {
      return null;
    }
  }

  function rememberLastCartEco(eco) {
    try {
      if (!eco || typeof eco !== "object" || !Array.isArray(eco.items) || !eco.items.length) return;
      __ecomsoLastCartEco = {
        currency: eco.currency,
        value: eco.value,
        items: eco.items.map(function (it) {
          return Object.assign({}, it);
        }),
      };
    } catch (eR) {}
  }

  function diffRemovedCartLine(prevEco, nextEco) {
    if (!prevEco || !Array.isArray(prevEco.items) || !prevEco.items.length) return null;
    var prevItems = prevEco.items;
    var nextItems = nextEco && Array.isArray(nextEco.items) ? nextEco.items : [];
    var nextByKey = {};
    for (var i = 0; i < nextItems.length; i += 1) {
      nextByKey[cartLineKey(nextItems[i])] = nextItems[i];
    }
    for (var p = 0; p < prevItems.length; p += 1) {
      var it = prevItems[p];
      var k = cartLineKey(it);
      var n = nextByKey[k];
      if (!n) {
        return normalizeItem(it);
      }
      var pq = parseInt(String(it.quantity || "1"), 10) || 1;
      var nq = parseInt(String(n.quantity || "1"), 10) || 1;
      if (pq > nq) {
        return normalizeItem(Object.assign({}, it, { quantity: pq - nq }));
      }
    }
    return null;
  }

  function diffAddedCartLine(prevEco, nextEco) {
    if (!nextEco || !Array.isArray(nextEco.items) || !nextEco.items.length) return null;
    var nextItems = nextEco.items;
    if (!prevEco || !Array.isArray(prevEco.items) || !prevEco.items.length) {
      return normalizeItem(nextItems[nextItems.length - 1]);
    }
    var prevByKey = {};
    for (var i = 0; i < prevEco.items.length; i += 1) {
      prevByKey[cartLineKey(prevEco.items[i])] = prevEco.items[i];
    }
    for (var j = 0; j < nextItems.length; j += 1) {
      var li = nextItems[j];
      var k = cartLineKey(li);
      var pLine = prevByKey[k];
      if (!pLine) return normalizeItem(li);
      var pq = parseInt(String(pLine.quantity || "1"), 10) || 1;
      var nq = parseInt(String(li.quantity || "1"), 10) || 1;
      if (nq > pq) return normalizeItem(Object.assign({}, li, { quantity: nq - pq }));
    }
    return null;
  }

  /** Avoid double emit when fetch hook + jQuery `added_to_cart` both run for one action. */
  var __ecomsoMutationDedupeKey = "";
  var __ecomsoMutationDedupeAt = 0;
  function mutationKeyFromItem(kind, item, qty) {
    try {
      var base = "";
      if (item && typeof item === "object") base = cartLineKey(item);
      if (!base) base = String(item && (item.product_id || item.item_id || "") ? item.product_id || item.item_id : "");
      return String(kind || "") + ":" + base + "x" + String(qty || 1);
    } catch (eK) {
      return String(kind || "") + ":" + String(qty || 1);
    }
  }
  function shouldSkipMutationDedupe(kind, itemKey) {
    var key = String(kind || "") + ":" + String(itemKey || "");
    var now = Date.now();
    if (key === __ecomsoMutationDedupeKey && now - __ecomsoMutationDedupeAt < 800) return true;
    __ecomsoMutationDedupeKey = key;
    __ecomsoMutationDedupeAt = now;
    return false;
  }

  /**
   * Compare Store API cart after mutation vs snapshot before — works when themes omit `$button` on `added_to_cart`.
   * @param {ReturnType<cloneCartEcoSnapshot>} beforeSnap null = empty cart before
   * @param {number} [delayMs]
   */
  function emitAddToCartFromCartDelta(beforeSnap, delayMs) {
    var before = beforeSnap !== undefined ? beforeSnap : cloneCartEcoSnapshot(__ecomsoLastCartEco);
    var ms = delayMs == null ? 220 : delayMs;
    setTimeout(function () {
      void fetchStoreApiCartEcommerce().then(function (next) {
        rememberLastCartEco(next);
        var added = diffAddedCartLine(before, next);
        if (!added || !next) return;
        var ik = mutationKeyFromItem("add", added, added.quantity || 1);
        if (shouldSkipMutationDedupe("add", ik)) return;
        esbTestLog("[esb] emit add_to_cart (cart delta)", added);
        track("add_to_cart", {
          ecommerce: {
            currency: String(next.currency || guessWooCurrency() || ""),
            value: (added.price || 0) * (added.quantity || 1),
            items: [added],
          },
        });
      });
    }, ms);
  }

  function emitRemoveFromCartFromCartDelta(prevSnap, delayMs) {
    var prev = prevSnap !== undefined ? prevSnap : cloneCartEcoSnapshot(__ecomsoLastCartEco);
    var ms = delayMs == null ? 220 : delayMs;
    setTimeout(function () {
      void fetchStoreApiCartEcommerce().then(function (next) {
        rememberLastCartEco(next);
        var removed = diffRemovedCartLine(prev, next);
        if (!removed || !next) return;
        var ik = mutationKeyFromItem("rm", removed, removed.quantity || 1);
        if (shouldSkipMutationDedupe("rm", ik)) return;
        esbTestLog("[esb] emit remove_from_cart (cart delta)", removed);
        track("remove_from_cart", {
          ecommerce: {
            currency: String(next.currency || guessWooCurrency() || ""),
            value: (removed.price || 0) * (removed.quantity || 1),
            items: [removed],
          },
        });
      });
    }, ms);
  }

  function parseWooAmountFromNode(node) {
    try {
      if (!node) return 0;
      var raw = (node.textContent || "").replace(/[^0-9.,-]/g, "").replace(",", ".");
      var n = parseFloat(raw);
      return Number.isFinite(n) ? n : 0;
    } catch (_) {
      return 0;
    }
  }

  function findCachedCartLineByProductId(pid) {
    if (!__ecomsoLastCartEco || !Array.isArray(__ecomsoLastCartEco.items) || !pid) return null;
    for (var i = 0; i < __ecomsoLastCartEco.items.length; i += 1) {
      var it = __ecomsoLastCartEco.items[i];
      if (!it || typeof it !== "object") continue;
      var id = it.product_id != null ? parseInt(String(it.product_id), 10) : 0;
      if (id === pid) return it;
    }
    return null;
  }

  /** add_to_cart from DOM click — product payload directly; otherwise cart diff after AJAX */
  function emitAddToCartFromDomClick(el, source) {
    try {
      if (!isDomAddToCartClick(el)) return;
      esbTestLog("[esb] dom add_to_cart matched", source || "click", el);
      __ecomsoPreAddCartEco = cloneCartEcoSnapshot(__ecomsoLastCartEco);

      var rawItem = readPdpProductItemFromElement(el);
      if (trackAddToCartWithItem(el, rawItem, source || "dom-click")) return;

      var ajaxDelay =
        typeof window !== "undefined" &&
        (typeof window.wc_add_to_cart_params !== "undefined" || typeof window.jQuery !== "undefined")
          ? 480
          : 280;
      emitAddToCartFromCartDelta(__ecomsoPreAddCartEco, ajaxDelay);
    } catch (eAddDom) {
      esbTestLog("[esb] dom add_to_cart error", eAddDom);
    }
  }

  /** remove_from_cart from DOM click */
  function emitRemoveFromDomClick(el) {
    try {
      if (!isDomRemoveFromCartClick(el)) return;
      esbTestLog("[esb] dom remove_from_cart matched", el);
      var href = String((el.href || (el.getAttribute && el.getAttribute("href"))) || "");
      if (href.indexOf("remove_item") >= 0 || (el.tagName && String(el.tagName).toLowerCase() === "a")) {
        emitRemoveFromCartFromRemoveLink(el);
        return;
      }
      __ecomsoPreMutationCartEco = cloneCartEcoSnapshot(__ecomsoLastCartEco);
      emitRemoveFromCartFromCartDelta(__ecomsoPreMutationCartEco, 280);
    } catch (eRmDom) {
      esbTestLog("[esb] dom remove_from_cart error", eRmDom);
    }
  }

  /** Full navigation remove (?remove_item=) + reliable payload from view_cart snapshot + row DOM. */
  function emitRemoveFromCartFromRemoveLink(anchor) {
    try {
      if (!anchor || !anchor.getAttribute) return;
      if (!isDomRemoveFromCartClick(anchor)) return;
      var href = String(anchor.getAttribute("href") || anchor.href || "");
      __ecomsoPreMutationCartEco = cloneCartEcoSnapshot(__ecomsoLastCartEco);

      var pid = 0;
      try {
        var ds = anchor.getAttribute("data-product_id");
        if (ds) pid = parseInt(String(ds), 10) || 0;
      } catch (_e) {}
      var tr = anchor.closest ? anchor.closest("tr.cart_item, tr.woocommerce-cart-form__cart-item") : null;
      var qty = 1;
      if (tr) {
        var qinp = tr.querySelector("input.qty");
        if (qinp && qinp.value !== undefined && qinp.value !== "")
          qty = Math.max(1, parseInt(String(qinp.value), 10) || 1);
      }

      var line = pid > 0 ? findCachedCartLineByProductId(pid) : null;
      var item = line ? normalizeItem(Object.assign({}, line, { quantity: qty })) : null;
      var currency =
        (__ecomsoLastCartEco && __ecomsoLastCartEco.currency) ||
        (__ecomsoCachedViewCartEco && __ecomsoCachedViewCartEco.currency) ||
        guessWooCurrency() ||
        "";

      if (!item && tr) {
        var nm = "";
        try {
          var na = tr.querySelector(".product-name a, .product-name");
          nm = na ? String(na.textContent || "").trim().replace(/\s+/g, " ") : "";
        } catch (_) {}
        var pu = parseWooAmountFromNode(tr.querySelector(".product-price .amount, td.product-price .woocommerce-Price-amount"));
        if (!pu && tr.querySelector(".product-subtotal"))
          pu = parseWooAmountFromNode(tr.querySelector(".product-subtotal .woocommerce-Price-amount"));
        item = normalizeItem({
          product_id: pid > 0 ? pid : undefined,
          item_id: pid > 0 ? String(pid) : "",
          item_name: nm,
          price: pu,
          quantity: qty,
        });
      }
      if (!item) return;

      var ik = mutationKeyFromItem("rm", item, qty);
      if (shouldSkipMutationDedupe("rm", ik)) return;
      track("remove_from_cart", {
        ecommerce: {
          currency: String(currency || ""),
          value: (item.price || 0) * (item.quantity || 1),
          items: [item],
        },
      });
    } catch (_ex2) {}
  }

  function isWoocommerceClassicAddToCartForm(form) {
    if (!form || !form.matches || !form.classList.contains("cart")) return false;
    if (form.closest(".woocommerce-cart-form")) return false;
    if (!form.closest(".woocommerce") && !form.closest("div.product, .single-product, div[id^=\"product-\"]")) return false;
    if (
      form.closest("#reviews") ||
      form.closest(".woocommerce-Reviews") ||
      form.closest("#review_form_wrapper") ||
      form.closest(".comment-respond") ||
      form.closest("#respond")
    )
      return false;
    var hasCartBtn =
      !!(form.querySelector('button.single_add_to_cart_button') || form.querySelector('button[name="add-to-cart"]'));
    return hasCartBtn;
  }

  function resolvePdpAddProductId(form, submitter) {
    var sub =
      submitter &&
      submitter.matches &&
      submitter.matches('button[type="submit"], input[type="submit"]') &&
      (submitter.getAttribute("name") === "add-to-cart" ||
        (submitter.classList && submitter.classList.contains("single_add_to_cart_button")))
        ? submitter
        : form.querySelector(
            'button.single_add_to_cart_button[type="submit"], button[type="submit"][name="add-to-cart"], button[name="add-to-cart"][type="submit"]'
          );
    var v =
      sub && sub.getAttribute && sub.getAttribute("value") !== null
        ? sub.getAttribute("value")
        : sub && typeof sub.value === "string"
          ? sub.value
          : null;
    var pid = v ? parseInt(String(v), 10) : 0;
    if (pid <= 0) {
      var h = form.querySelector('input[name="add-to-cart"][type="hidden"], input[type="hidden"][name="product_id"]');
      if (h && h.value) pid = parseInt(String(h.value), 10) || 0;
    }
    return pid > 0 ? pid : guessProductIdFromPage();
  }

  /** Non-Ajax PDP cart submit (OceanWP theme / many storefronts): no `added_to_cart` jQuery event. */
  function emitAddToCartFromPdpCartForm(form, submitEvt) {
    try {
      if (!isWoocommerceClassicAddToCartForm(form)) return;
      if (window.jQuery && form && form.classList && form.classList.contains("cart")) {
        var ajaxCapable =
          typeof window.wc_add_to_cart_params !== "undefined" ||
          (form.classList.contains("variations_form") && window.jQuery);
        if (ajaxCapable) return;
      }
      var sub = submitEvt && submitEvt.submitter ? submitEvt.submitter : null;
      var pid = resolvePdpAddProductId(form, sub);
      if (pid <= 0) return;
      var qtyIn = form.querySelector('input.input-text.qty, input.qty[name="quantity"], input[type="number"].qty');
      var qty = qtyIn && qtyIn.value ? Math.max(1, parseInt(String(qtyIn.value), 10) || 1) : 1;

      var viewSnap = null;
      try {
        if (window.__ECOMSO_LAST_VIEW_ITEM__ && window.__ECOMSO_LAST_VIEW_ITEM__.items && window.__ECOMSO_LAST_VIEW_ITEM__.items[0])
          viewSnap = JSON.parse(JSON.stringify(window.__ECOMSO_LAST_VIEW_ITEM__));
      } catch (_vs) {}

      var unitPrice = 0;
      var itemName = "";
      var sku = String(pid);
      var cat = "";
      var cur = "";

      var useView = !!(viewSnap && viewSnap.items && viewSnap.items[0]);
      if (
        useView &&
        viewSnap.items[0].product_id != null &&
        parseInt(String(viewSnap.items[0].product_id), 10) === pid
      ) {
        cur = String(viewSnap.currency || "");
        var it0 = viewSnap.items[0];
        unitPrice = parseFloat(String(it0.price || 0)) || 0;
        itemName = String(it0.item_name || "");
        sku = String(it0.item_id || pid);
        cat = String(it0.item_category || "");
      } else {
        var title = document.querySelector("h1.product_title, .product_title");
        itemName = title ? String(title.textContent || "").trim() : "";
        var amt = document.querySelector(
          ".entry-summary .price .woocommerce-Price-amount, .summary .price .woocommerce-Price-amount, div.product .price .woocommerce-Price-amount"
        );
        unitPrice = parseWooAmountFromNode(amt);
        cur =
          (__ecomsoLastCartEco && __ecomsoLastCartEco.currency) ||
          (__ecomsoCachedViewCartEco && __ecomsoCachedViewCartEco.currency) ||
          guessWooCurrency();
      }

      var item = normalizeItem({
        product_id: pid,
        item_id: sku || String(pid),
        item_name: itemName || "",
        item_category: cat,
        price: unitPrice,
        quantity: qty,
      });
      if (!item) return;

      var ik = mutationKeyFromItem("add", item, qty);
      if (shouldSkipMutationDedupe("add", ik)) return;

      track("add_to_cart", {
        ecommerce: {
          currency: String(cur || guessWooCurrency() || ""),
          value: unitPrice * qty,
          items: [item],
        },
      });
    } catch (__pdp) {}
  }

  /**
   * DOM click listeners — add_to_cart / remove_from_cart
   * New theme/plugin: add hints to ECOMSO_DOM_*_CLASS_HINTS above (do not edit the if blocks below)
   */
  function installDomSelectorCartClickHandlers() {
    if (typeof document === "undefined" || !document.addEventListener || window.__ecomsoDomCartClickBound) return;
    window.__ecomsoDomCartClickBound = true;

    function onCartPointer(e, phase) {
      try {
        var el = resolveClickableTarget(e.target);
        if (!el) return;

        if (isDomRemoveFromCartClick(el)) {
          if (phase === "click") emitRemoveFromDomClick(el);
          return;
        }

        if (isDomAddToCartClick(el)) {
          // pointerdown/mousedown — send payload before Woo AJAX submit (normal click fix)
          if (phase === "down") {
            emitAddToCartFromDomClick(el, "pointerdown");
            return;
          }
          if (phase === "click") {
            emitAddToCartFromDomClick(el, "click");
          }
        }
      } catch (exClick) {
        esbTestLog("[esb] dom " + phase + " handler error", exClick);
      }
    }

    document.addEventListener(
      "pointerdown",
      function (e) {
        onCartPointer(e, "down");
      },
      true
    );
    document.addEventListener(
      "mousedown",
      function (e) {
        onCartPointer(e, "down");
      },
      true
    );
    document.addEventListener(
      "click",
      function (e) {
        onCartPointer(e, "click");
      },
      true
    );
  }

  function installCapturePhaseCartAndPdpHandlers() {
    if (typeof document === "undefined" || !document.addEventListener) return;
    installDomSelectorCartClickHandlers();

    document.addEventListener(
      "submit",
      function (evt) {
        try {
          var form = evt.target;
          // Cart "Update cart" is full POST → emit deltas BEFORE navigation.
          if (form && form.matches && form.matches("form.woocommerce-cart-form")) {
            var submitter = evt.submitter || null;
            var isUpdate = isDomUpdateCartButton(submitter);
            if (isUpdate) {
              esbTestLog("[esb] dom update_cart submit — qty diff → add/remove events");
              try {
                var prev = cloneCartEcoSnapshot(__ecomsoLastCartEco) || (__ecomsoCachedViewCartEco ? cloneCartEcoSnapshot(__ecomsoCachedViewCartEco) : null);
                var rows = form.querySelectorAll("tr.cart_item, tr.woocommerce-cart-form__cart-item");
                var nextByPid = {};
                var prevQtyByPid = {};
                var rowMetaByPid = {};
                for (var r = 0; r < rows.length; r += 1) {
                  var tr = rows[r];
                  var a = tr.querySelector("a.remove[data-product_id]");
                  var pid = a && a.getAttribute ? parseInt(String(a.getAttribute("data-product_id") || "0"), 10) || 0 : 0;
                  var q = tr.querySelector("input.qty");
                  var nq = q && q.value !== undefined ? parseInt(String(q.value || "0"), 10) || 0 : 0;
                  var pqDom = 0;
                  if (q) {
                    pqDom = parseInt(String(q.defaultValue || q.getAttribute("value") || "0"), 10) || 0;
                    if (!pqDom && q.value !== undefined) pqDom = parseInt(String(q.value || "0"), 10) || 0;
                  }
                  if (pid > 0) {
                    nextByPid[pid] = nq;
                    prevQtyByPid[pid] = pqDom;
                    rowMetaByPid[pid] = { tr: tr, anchor: a };
                  }
                }

                function itemForPid(pidNum) {
                  if (prev && prev.items) {
                    for (var fi = 0; fi < prev.items.length; fi += 1) {
                      var fit = prev.items[fi];
                      var fp = fit && fit.product_id != null ? parseInt(String(fit.product_id), 10) || 0 : 0;
                      if (fp === pidNum) return fit;
                    }
                  }
                  var meta = rowMetaByPid[pidNum];
                  if (meta && meta.anchor) {
                    var raw = parseJsonAttr(meta.anchor, "data-ecomso-product-data");
                    if (raw && typeof raw === "object") return raw;
                  }
                  return null;
                }

                var pids = Object.keys(nextByPid);
                for (var pi = 0; pi < pids.length; pi += 1) {
                  var pid0 = parseInt(String(pids[pi]), 10) || 0;
                  if (!pid0) continue;
                  var it = itemForPid(pid0);
                  if (!it) continue;
                  var pq = prevQtyByPid[pid0] != null ? prevQtyByPid[pid0] : parseInt(String(it.quantity || "1"), 10) || 1;
                  var nq0 = nextByPid[pid0];
                  if (typeof nq0 !== "number") continue;
                  if (nq0 < pq) {
                      var dq = pq - Math.max(0, nq0);
                      if (dq > 0) {
                        var removed = normalizeItem(Object.assign({}, it, { quantity: dq }));
                        if (!removed) continue;
                        var k = mutationKeyFromItem("rm", removed, dq);
                        if (!shouldSkipMutationDedupe("rm", k)) {
                          track("remove_from_cart", {
                            ecommerce: {
                              currency: String((prev && prev.currency) || guessWooCurrency() || ""),
                              value: (removed.price || 0) * (removed.quantity || 1),
                              items: [removed],
                            },
                          });
                        }
                      }
                    } else if (nq0 > pq) {
                      var aq = nq0 - pq;
                      if (aq > 0) {
                        var added = normalizeItem(Object.assign({}, it, { quantity: aq }));
                        if (!added) continue;
                        var k2 = mutationKeyFromItem("add", added, aq);
                        if (!shouldSkipMutationDedupe("add", k2)) {
                          track("add_to_cart", {
                            ecommerce: {
                              currency: String((prev && prev.currency) || guessWooCurrency() || ""),
                              value: (added.price || 0) * (added.quantity || 1),
                              items: [added],
                            },
                          });
                        }
                      }
                    }
                }
              } catch (eU) {
                esbTestLog("[esb] update_cart qty diff error", eU);
              }
            }
          }
          emitAddToCartFromPdpCartForm(form, evt);
        } catch (es) {}
      },
      true
    );
  }

  function installJQueryAjaxCartHooks() {
    if (!window.jQuery || window.__ecomsoAjaxCartHooksBound) return;
    window.__ecomsoAjaxCartHooksBound = true;
    var $ = window.jQuery;
    $(document).ajaxComplete(function (_evt, _xhr, settings) {
      try {
        var url = String((settings && settings.url) || "");
        var dataStr = typeof settings.data === "string" ? settings.data : "";
        var blob = (url + "&" + dataStr).toLowerCase();
        if (blob.indexOf("wc-ajax=add_to_cart") >= 0 || blob.indexOf("wc_ajax=add_to_cart") >= 0) {
          emitAddToCartFromCartDelta(__ecomsoPreAddCartEco != null ? __ecomsoPreAddCartEco : cloneCartEcoSnapshot(__ecomsoLastCartEco), 260);
          __ecomsoPreAddCartEco = null;
          return;
        }
        if (
          blob.indexOf("remove_from_cart") >= 0 ||
          blob.indexOf("wc-ajax=remove_from_cart") >= 0 ||
          blob.indexOf("wc_ajax=remove_from_cart") >= 0
        ) {
          var prevRm = cloneCartEcoSnapshot(__ecomsoPreMutationCartEco || __ecomsoLastCartEco);
          emitRemoveFromCartFromCartDelta(prevRm, 260);
        }
      } catch (ea) {}
    });
  }

  function isStoreCartAddItemUrl(urlStr) {
    var lower = String(urlStr || "").toLowerCase();
    return lower.indexOf("wc/store") >= 0 && lower.indexOf("cart/add-item") >= 0;
  }

  function isStoreCartRemoveItemUrl(urlStr) {
    var lower = String(urlStr || "").toLowerCase();
    return lower.indexOf("wc/store") >= 0 && lower.indexOf("cart/remove-item") >= 0;
  }
  function isStoreCartUpdateItemUrl(urlStr) {
    var lower = String(urlStr || "").toLowerCase();
    return lower.indexOf("wc/store") >= 0 && lower.indexOf("cart/update-item") >= 0;
  }

  var __ecomsoFetchPatched = false;
  function installStoreApiFetchHooks() {
    if (typeof window === "undefined" || typeof window.fetch !== "function" || __ecomsoFetchPatched) return;
    __ecomsoFetchPatched = true;
    var orig = window.fetch.bind(window);
    window.fetch = function () {
      var args = arguments;
      var input = args[0];
      var reqUrl = "";
      try {
        if (typeof input === "string") reqUrl = input;
        else if (input && typeof input.url === "string") reqUrl = input.url;
      } catch (eu) {}
      var isAdd = isStoreCartAddItemUrl(reqUrl);
      var isRemove = isStoreCartRemoveItemUrl(reqUrl);
      var isUpdate = isStoreCartUpdateItemUrl(reqUrl);
      if (isRemove) {
        __ecomsoPreMutationCartEco = cloneCartEcoSnapshot(__ecomsoLastCartEco);
      }
      if (isAdd) {
        __ecomsoPreAddCartEco = cloneCartEcoSnapshot(__ecomsoLastCartEco);
      }
      if (isUpdate) {
        __ecomsoPreMutationCartEco = cloneCartEcoSnapshot(__ecomsoLastCartEco);
      }
      return orig.apply(window, args).then(function (res) {
        try {
          if (!res || !res.ok) return res;
          if (isAdd) {
            emitAddToCartFromCartDelta(__ecomsoPreAddCartEco, 90);
          }
          if (isRemove) {
            emitRemoveFromCartFromCartDelta(__ecomsoPreMutationCartEco, 90);
          }
          if (isUpdate) {
            var before = __ecomsoPreMutationCartEco;
            setTimeout(function () {
              void fetchStoreApiCartEcommerce().then(function (next) {
                rememberLastCartEco(next);
                var added = diffAddedCartLine(before, next);
                if (added) {
                  var k = mutationKeyFromItem("add", added, added.quantity || 1);
                  if (!shouldSkipMutationDedupe("add", k)) {
                    track("add_to_cart", {
                      ecommerce: {
                        currency: String(next.currency || guessWooCurrency() || ""),
                        value: (added.price || 0) * (added.quantity || 1),
                        items: [added],
                      },
                    });
                  }
                }
                var removed = diffRemovedCartLine(before, next);
                if (removed) {
                  var k2 = mutationKeyFromItem("rm", removed, removed.quantity || 1);
                  if (!shouldSkipMutationDedupe("rm", k2)) {
                    track("remove_from_cart", {
                      ecommerce: {
                        currency: String(next.currency || guessWooCurrency() || ""),
                        value: (removed.price || 0) * (removed.quantity || 1),
                        items: [removed],
                      },
                    });
                  }
                }
              });
            }, 120);
          }
        } catch (eh) {}
        return res;
      });
    };
  }

  function deferAfterCheckoutHydration(fn) {
    if (typeof fn !== "function") return;
    var delayMs = 1200;
    function run() {
      try {
        fn();
      } catch (e) {}
    }
    if (typeof window !== "undefined" && window.addEventListener) {
      if (document.readyState === "complete") {
        setTimeout(run, delayMs);
      } else {
        window.addEventListener(
          "load",
          function () {
            setTimeout(run, delayMs);
          },
          { once: true }
        );
      }
    } else {
      setTimeout(run, delayMs);
    }
  }

  function scheduleStoreApiFetchHooks() {
    var checkoutPage = isCheckoutPage();
    if (checkoutPage) {
      deferAfterCheckoutHydration(installStoreApiFetchHooks);
    } else {
      installStoreApiFetchHooks();
    }
  }
  scheduleStoreApiFetchHooks();

  function normalizeItem(item) {
    if (!item || typeof item !== "object") return null;
    var out = {
      product_id: typeof item.product_id === "number" ? item.product_id : item.product_id ? Number(item.product_id) : undefined,
      item_id: item.item_id ? String(item.item_id) : "",
      item_name: item.item_name ? String(item.item_name) : "",
      item_category: item.item_category ? String(item.item_category) : "",
      price: Number(item.price || 0) || 0,
      item_cost: Number(item.item_cost || 0) || 0,
      quantity: Math.max(1, parseInt(String(item.quantity || 1), 10) || 1),
    };
    return out;
  }

  /** view_item when PHP global missing (cached PDP, builders): JSON-LD Product on page. */
  function ecommerceFromJsonLdProduct() {
    try {
      var scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (var s = 0; s < scripts.length; s += 1) {
        var raw = scripts[s].textContent || "";
        if (!raw.trim()) continue;
        var j = JSON.parse(raw);
        var list = Array.isArray(j) ? j : [j];
        for (var k = 0; k < list.length; k += 1) {
          var node = list[k];
          if (!node || typeof node !== "object") continue;
          var types = String(node["@type"] || "");
          if (types.indexOf("Product") < 0) continue;
          var name = String(node.name || "");
          var sku = String(node.sku || node.gtin13 || node.gtin14 || "");
          var offers = node.offers;
          var price = 0;
          var cur = "";
          if (offers && typeof offers === "object") {
            if (!Array.isArray(offers)) offers = [offers];
            var o0 = offers[0];
            if (o0 && o0.price != null) price = parseFloat(String(o0.price)) || 0;
            if (o0 && o0.priceCurrency) cur = String(o0.priceCurrency);
          }
          var itemId = sku || (typeof location !== "undefined" ? location.pathname.split("/").filter(Boolean).pop() || "" : "");
          return {
            currency: cur || guessWooCurrency(),
            value: price,
            items: [
              {
                item_id: itemId,
                item_name: name,
                item_category: "",
                price: price,
                item_cost: 0,
                quantity: 1,
              },
            ],
          };
        }
      }
    } catch (e) {}
    return null;
  }

  function finalizeViewItemEcommerce(eco) {
    if (!eco || typeof eco !== "object") return null;
    var out = {
      currency: String(eco.currency != null ? eco.currency : ""),
      value: typeof eco.value === "number" && Number.isFinite(eco.value) ? eco.value : parseFloat(String(eco.value || "0")) || 0,
      items: Array.isArray(eco.items) ? eco.items.slice() : [],
    };
    var guess = guessWooCurrency();
    if (!String(out.currency || "").trim() && guess) out.currency = guess;
    if ((!out.value || out.value <= 0) && out.items.length) {
      var sum = 0;
      for (var i = 0; i < out.items.length; i += 1) {
        var it = out.items[i];
        sum += (parseFloat(String(it && it.price != null ? it.price : "0")) || 0) * (parseInt(String(it && it.quantity != null ? it.quantity : "1"), 10) || 1);
      }
      if (sum > 0) out.value = sum;
    }
    return out;
  }

  function viewItemEcommerceWeak(eco) {
    var fin = finalizeViewItemEcommerce(eco);
    if (!fin || !fin.items.length) return true;
    var curOk = String(fin.currency || "").trim().length > 0;
    var p0 = fin.items[0] ? parseFloat(String(fin.items[0].price || "0")) : 0;
    var valOk = (fin.value && fin.value > 0) || (p0 > 0 && Number.isFinite(p0));
    return !curOk || !valOk;
  }

  function mergeViewItemLabels(prefer, fallback) {
    var a = finalizeViewItemEcommerce(prefer);
    var b = finalizeViewItemEcommerce(fallback);
    if (!a || !a.items || !a.items.length) return b;
    if (!b || !b.items || !b.items.length) return a;
    var ia = a.items[0];
    var ib = b.items[0];
    if (ib.item_name && !ia.item_name) ia.item_name = ib.item_name;
    if (ib.item_id && (!ia.item_id || ia.item_id === String(ib.product_id || ""))) ia.item_id = ib.item_id;
    if (ib.product_id != null && ia.product_id == null) ia.product_id = ib.product_id;
    a.items[0] = ia;
    return finalizeViewItemEcommerce({ currency: a.currency, value: a.value, items: [ia] });
  }

  function scheduleViewItemFallback() {
    if (window.__ecomsoViewItemScheduled) return;
    window.__ecomsoViewItemScheduled = true;
    var maxWait = 12;
    var delayMs = 80;
    var attempt = 0;
    var sent = false;
    function enrichAndTrack(baseRaw) {
      if (sent) return;
      var pid = guessProductIdFromPage();
      try {
        if (window.__ECOMSO_RUNTIME__ && window.__ECOMSO_RUNTIME__.productId) {
          var bootPid = parseInt(String(window.__ECOMSO_RUNTIME__.productId), 10);
          if (Number.isFinite(bootPid) && bootPid > 0) pid = bootPid;
        }
      } catch (ePid) {}
      var promises = [];
      if ((!baseRaw || viewItemEcommerceWeak(baseRaw)) && pid > 0) {
        promises.push(fetchStoreApiProductViewItem(pid));
      }
      Promise.all(promises).then(function (results) {
        if (sent) return;
        var best = null;
        for (var i = 0; i < results.length; i++) {
          var r = results[i];
          if (!r || !r.items || !r.items.length) continue;
          if (!viewItemEcommerceWeak(r)) {
            best = r;
            break;
          }
          if (!best) best = r;
        }
        var dlVi = pickDataLayerEcommerce(["view_item", "viewitem"]);
        if (dlVi && dlVi.items && dlVi.items.length && !viewItemEcommerceWeak(dlVi)) best = dlVi;

        var ld = ecommerceFromJsonLdProduct();
        if ((!best || viewItemEcommerceWeak(best)) && ld && ld.items && ld.items.length && !viewItemEcommerceWeak(ld)) best = ld;

        var merged = best;
        if (baseRaw && baseRaw.items && baseRaw.items.length) merged = mergeViewItemLabels(best || {}, baseRaw);

        var fin = merged ? finalizeViewItemEcommerce(merged) : baseRaw ? finalizeViewItemEcommerce(baseRaw) : null;
        if (!fin || !fin.items.length) return;
        sent = true;
        try {
          window.__ECOMSO_LAST_VIEW_ITEM__ = JSON.parse(JSON.stringify(fin));
        } catch (_s) {}
        track("view_item", { ecommerce: fin }, undefined, capturePageContext());
      });
    }
    function tick() {
      if (window.__ECOMSO_PRODUCT__) {
        enrichAndTrack(window.__ECOMSO_PRODUCT__);
        return;
      }
      attempt += 1;
      if (attempt < maxWait) setTimeout(tick, delayMs);
      else enrichAndTrack(null);
    }
    tick();
  }

  function runPageLoadEvents() {
    if (window.__ecomsoPageLoadEventsStarted) return;
    window.__ecomsoPageLoadEventsStarted = true;
    whenTrackerReady(function () {
      // Purchase is recorded server-side from WooCommerce REST/webhook — not from thank-you page.

      if (hasBodyClass("single-product") || (typeof location !== "undefined" && location.pathname.indexOf("/product/") >= 0)) {
        scheduleViewItemFallback();
      }

      var cartPage = hasBodyClass("woocommerce-cart") || isLikelyCartUrl();
      var checkoutPage = isCheckoutPage();
      if (cartPage) scheduleCartTrack("view_cart", 0);
      if (cartPage) {
        void fetchStoreApiCartEcommerce().then(function (eco) {
          rememberLastCartEco(eco);
        });
      }

      if (checkoutPage) {
        startBeginCheckoutCapture();
      } else {
        watchForLateCheckoutPage();
      }
    });
  }

  function startBeginCheckoutCapture() {
    if (window.__ecomsoBeginCheckoutCaptureStarted) return;
    window.__ecomsoBeginCheckoutCaptureStarted = true;
    deferAfterCheckoutHydration(function () {
      void resolveLiveCartPayload("checkout").then(function (eco) {
        rememberLastCartEco(eco);
        scheduleCartTrack("begin_checkout", 0);
      });
      installCheckoutFormTracking();
    });
  }

  /** FunnelKit / CartFlows often inject the checkout form after first paint. */
  function watchForLateCheckoutPage() {
    if (typeof document === "undefined" || !document.body || window.__ecomsoLateCheckoutWatch) return;
    window.__ecomsoLateCheckoutWatch = true;
    var tries = 0;
    var maxTries = 40;
    var timer = window.setInterval(function () {
      tries += 1;
      if (isCheckoutPage()) {
        window.clearInterval(timer);
        startBeginCheckoutCapture();
        return;
      }
      if (tries >= maxTries) window.clearInterval(timer);
    }, 250);
  }

  if (document && document.readyState && document.readyState !== "loading") {
    runPageLoadEvents();
  } else if (document && document.addEventListener) {
    document.addEventListener("DOMContentLoaded", runPageLoadEvents, { once: true });
  } else {
    runPageLoadEvents();
  }

  installCapturePhaseCartAndPdpHandlers();

  function installBlocksCartListeners() {
    if (typeof document === "undefined" || !document.body || !document.body.addEventListener) return;
    document.body.addEventListener(
      "wc-blocks_adding_to_cart",
      function () {
        __ecomsoPreAddCartEco = cloneCartEcoSnapshot(__ecomsoLastCartEco);
      },
      true
    );
    document.body.addEventListener(
      "wc-blocks_added_to_cart",
      function () {
        emitAddToCartFromCartDelta(__ecomsoPreAddCartEco, 140);
      },
      true
    );
    document.body.addEventListener(
      "wc-blocks_removed_from_cart",
      function () {
        var prev = cloneCartEcoSnapshot(__ecomsoPreMutationCartEco || __ecomsoLastCartEco);
        emitRemoveFromCartFromCartDelta(prev, 160);
      },
      true
    );
  }
  installBlocksCartListeners();

  function isOrderReceivedPage() {
    // Most-universal "thank you" / success detection (Woo + common checkout plugins)
    try {
      var url = typeof location !== "undefined" ? String(location.href || "").toLowerCase() : "";
      var path = typeof location !== "undefined" ? String(location.pathname || "").toLowerCase() : "";
      if (hasBodyClass("woocommerce-order-received")) return true;

      // Woo defaults
      if (url.indexOf("/order-received/") >= 0 || path.indexOf("order-received") >= 0) return true;

      // WooCommerce key query (some setups redirect with order key only)
      if (url.indexOf("key=wc_order_") >= 0) return true;
      if (url.indexOf("key=") >= 0) return true;

      // Common thank you slugs
      if (
        url.indexOf("/thank-you/") >= 0 ||
        url.indexOf("/thankyou/") >= 0 ||
        url.indexOf("/order-confirmed/") >= 0 ||
        url.indexOf("/order-success/") >= 0 ||
        url.indexOf("/payment-success/") >= 0 ||
        url.indexOf("/success/") >= 0 ||
        url.indexOf("/confirmation/") >= 0
      )
        return true;

      // Query params (various plugins)
      if (url.indexOf("order-received=") >= 0) return true;
      if (url.indexOf("order_id=") >= 0) return true;
      if (url.indexOf("payment=success") >= 0) return true;

      return false;
    } catch (e) {
      return false;
    }
  }

  function safeLsGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }
  function safeLsSet(key, val) {
    try {
      localStorage.setItem(key, val);
    } catch (e) {}
  }
  function safeLsRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  }

  function normalizeTextValue(v) {
    try {
      return String(v == null ? "" : v).trim();
    } catch {
      return "";
    }
  }

  function getCheckoutForm() {
    try {
      // Classic shortcode checkout + Woo Blocks checkout
      return document.querySelector(
        [
          // Classic Woo
          "form.checkout.woocommerce-checkout",
          "form[name='checkout'].checkout",
          "form.checkout",
          "form.wc-block-checkout__form",
          "form.wc-block-components-form",
          "form.checkout.wcf-checkout-form",
          "form#wcf-checkout-form",
          "form.checkout.woocommerce-checkout.wcf-checkout",
          "#wcf-embed-checkout-form form.checkout",
          "form.checkout.checkoutwc",
          "form.checkout.checkoutwc_checkout",
          "form.checkout.fk-checkout",
          "form.fk-checkout-form",
          "#wfacp-e-form form.checkout",
          "form.wfacp_checkout_form",
          ".wfacp_main_form form.checkout",
          "#cfw-checkout form",
          "form.cfw-checkout",
        ].join(", ")
      );
    } catch (e) {
      return null;
    }
  }

  var ECOMSO_EMAIL_TOKEN =
    /(^|[^a-z0-9])(e-?mail|user_email|customer_email|billing_email|shipping_email|contact_email|checkout_email|email_address|mailaddress|ইমেইল|ই-মেইল)([^a-z0-9]|$)/i;
  var ECOMSO_PHONE_TOKEN =
    /(^|[^a-z0-9])(phone|mobile|cellphone|whatsapp|billing_phone|shipping_phone|contact_phone|customer_phone|checkout_phone|phone_number|phonenumber|tel|telephone|মোবাইল|ফোন)([^a-z0-9]|$)/i;

  function esbFieldAttr(el, name) {
    try {
      return el && el.getAttribute ? String(el.getAttribute(name) || "") : "";
    } catch (e) {
      return "";
    }
  }

  function esbClassifyCheckoutContactField(el) {
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
    var ac = String(el.autocomplete || esbFieldAttr(el, "autocomplete") || "")
      .toLowerCase()
      .split(" ")
      .pop();
    if (ac === "email") return "email";
    if (ac === "tel" || ac === "tel-national" || ac === "tel-local" || ac === "tel-country-code" || ac === "mobile") {
      return "phone";
    }
    var mode = String(el.inputMode || esbFieldAttr(el, "inputmode") || "").toLowerCase();
    if (mode === "email") return "email";
    if (mode === "tel") return "phone";
    var hay = [
      el.name,
      el.id,
      el.className,
      el.placeholder,
      el.type,
      el.inputMode,
      esbFieldAttr(el, "autocomplete"),
      esbFieldAttr(el, "inputmode"),
      esbFieldAttr(el, "aria-label"),
      esbFieldAttr(el, "data-field"),
      esbFieldAttr(el, "data-name"),
      esbFieldAttr(el, "data-testid"),
      esbFieldAttr(el, "data-ecomso-track"),
    ]
      .join(" ")
      .toLowerCase();
    if (ECOMSO_EMAIL_TOKEN.test(hay)) return "email";
    if (ECOMSO_PHONE_TOKEN.test(hay)) return "phone";
    return null;
  }

  function esbMarkContactValueFired(kind, value) {
    var g = typeof window !== "undefined" ? window : {};
    g.__ecomsoContactValueFired = g.__ecomsoContactValueFired || {};
    var raw = String(value || "").trim();
    if (!raw || (kind !== "email" && kind !== "phone")) return false;
    var norm = kind === "phone" ? raw.replace(/\D/g, "").slice(-10) : raw.toLowerCase();
    if (kind === "phone" && norm.length < 8) return false;
    if (kind === "email" && norm.indexOf("@") < 1) return false;
    var key = kind + ":" + norm;
    if (g.__ecomsoContactValueFired[key]) return false;
    g.__ecomsoContactValueFired[key] = 1;
    return true;
  }

  // New checkout field aliases (theme/plugin): add name/id under CHECKOUT_FIELD_ALIASES canonical keys
  var CHECKOUT_FIELD_ALIASES = {
    billing_first_name: ["billing_first_name", "first_name", "firstname", "billing-first_name"],
    billing_last_name: ["billing_last_name", "last_name", "lastname", "billing-last_name"],
    billing_email: [
      "billing_email",
      "contact_email",
      "email",
      "customer_email",
      "checkout_email",
      "user_email",
      "account_email",
      "shipping_email",
      "email_address",
    ],
    billing_phone: [
      "billing_phone",
      "contact_phone",
      "phone",
      "customer_phone",
      "checkout_phone",
      "billing-phone",
      "shipping_phone",
      "mobile",
      "tel",
      "whatsapp",
      "phone_number",
    ],
    billing_address_1: ["billing_address_1", "address_1", "billing-address_1", "shipping_address_1", "shipping-address_1"],
    billing_city: ["billing_city", "city", "billing-city", "shipping_city", "shipping-city"],
    billing_state: ["billing_state", "state", "billing-state", "shipping_state", "shipping-state"],
    billing_postcode: ["billing_postcode", "postcode", "zip", "billing-postcode", "shipping_postcode", "shipping-postcode"],
    billing_country: ["billing_country", "country", "billing-country", "shipping_country", "shipping-country"],
  };

  function findCheckoutFieldEl(form, canonical) {
    try {
      if (!form) return null;
      var aliases = CHECKOUT_FIELD_ALIASES[canonical] || [canonical];
      for (var i = 0; i < aliases.length; i += 1) {
        var key = aliases[i];
        if (!key) continue;
        // by name
        var byName = null;
        try {
          byName = form.querySelector("[name='" + CSS.escape(String(key)) + "']");
        } catch (e1) {}
        if (byName) return byName;
        // by id
        var byId = null;
        try {
          byId = form.querySelector("#" + CSS.escape(String(key)));
        } catch (e2) {}
        if (byId) return byId;
      }
      if (canonical === "billing_email" || canonical === "billing_phone") {
        var want = canonical === "billing_email" ? "email" : "phone";
        var inputs = form.querySelectorAll("input, textarea");
        for (var s = 0; s < inputs.length; s += 1) {
          if (esbClassifyCheckoutContactField(inputs[s]) === want) return inputs[s];
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function canonicalCheckoutFieldFromTarget(t) {
    try {
      if (!t) return null;
      var kind = esbClassifyCheckoutContactField(t);
      if (kind === "email") return "billing_email";
      if (kind === "phone") return "billing_phone";
      var nm = t.name ? String(t.name) : "";
      var id = t.id ? String(t.id) : "";
      var key = nm || id;
      if (!key) return null;
      var canonicals = Object.keys(CHECKOUT_FIELD_ALIASES);
      for (var c = 0; c < canonicals.length; c += 1) {
        var can = canonicals[c];
        var aliases = CHECKOUT_FIELD_ALIASES[can] || [];
        for (var a = 0; a < aliases.length; a += 1) {
          if (aliases[a] === key) return can;
        }
      }
      // fall back: if it already matches canonical
      if (CHECKOUT_FIELD_ALIASES[key]) return key;
      return null;
    } catch (e) {
      return null;
    }
  }

  function fieldValue(form, name) {
    try {
      if (!form) return "";
      var el = findCheckoutFieldEl(form, name);
      if (!el) return "";
      if (el.type === "checkbox" || el.type === "radio") return el.checked ? "1" : "";
      return normalizeTextValue(el.value);
    } catch (e) {
      return "";
    }
  }

  function isFieldRequired(form, name) {
    try {
      var el = findCheckoutFieldEl(form, name);
      if (!el) return false;
      if (el.required || el.getAttribute("aria-required") === "true") return true;
      var wrap = el.closest ? el.closest(".validate-required, .form-row.validate-required, p.validate-required") : null;
      return !!wrap;
    } catch (e) {
      return false;
    }
  }

  /** Always returns GA4-style ecommerce { currency, value, items[] } for checkout form events. */
  function finalizeCheckoutEcommerce(eco) {
    var items = [];
    if (eco && Array.isArray(eco.items)) {
      for (var i = 0; i < eco.items.length; i += 1) {
        var row = normalizeItem(eco.items[i]);
        if (row) items.push(row);
      }
    }
    var currency = eco && eco.currency != null ? String(eco.currency) : guessWooCurrency();
    if (!String(currency || "").trim()) currency = guessWooCurrency();
    var value = 0;
    if (eco && typeof eco.value === "number" && Number.isFinite(eco.value)) value = eco.value;
    else if (eco && eco.value != null) value = parseFloat(String(eco.value)) || 0;
    if (value <= 0 && items.length) {
      for (var j = 0; j < items.length; j += 1) {
        value += (parseFloat(String(items[j].price || "0")) || 0) * (parseInt(String(items[j].quantity || "1"), 10) || 1);
      }
    }
    return { currency: String(currency || ""), value: value, items: items };
  }

  function checkoutEcommerceSnapshot() {
    var eco = null;
    try {
      if (__ecomsoLastCartEco && Array.isArray(__ecomsoLastCartEco.items) && __ecomsoLastCartEco.items.length) {
        eco = __ecomsoLastCartEco;
      } else if (__ecomsoCachedViewCartEco && Array.isArray(__ecomsoCachedViewCartEco.items) && __ecomsoCachedViewCartEco.items.length) {
        eco = __ecomsoCachedViewCartEco;
      }
    } catch (e0) {}
    if (!eco || !eco.items || !eco.items.length) {
      var resolved = resolveCartPayload("checkout");
      if (resolved && Array.isArray(resolved.items) && resolved.items.length) {
        eco = resolved;
        rememberLastCartEco(eco);
      }
    }
    return finalizeCheckoutEcommerce(eco);
  }

  /**
   * Checkout UX events — always include ecommerce.currency, ecommerce.value, ecommerce.items (+ root currency/value).
   * @param {string} eventName
   * @param {Record<string, unknown>} [extra]
   */
  function trackCheckoutFormEvent(eventName, extra) {
    var base = checkoutEcommerceSnapshot();
    var props = {
      ecommerce: base,
      currency: base.currency,
      value: base.value,
    };
    if (extra && typeof extra === "object") {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) props[k] = extra[k];
      }
    }
    if (base.items && base.items.length) {
      track(eventName, props);
      return;
    }
    void resolveLiveCartPayload("checkout").then(function (live) {
      var fin = finalizeCheckoutEcommerce(live);
      if (fin.items && fin.items.length) rememberLastCartEco(fin);
      props.ecommerce = fin;
      props.currency = fin.currency;
      props.value = fin.value;
      track(eventName, props);
    });
  }

  function installCheckoutFormTracking() {
    if (typeof document === "undefined") return;
    if (window.__ecomsoCheckoutFormTrackingInstalled) return;

    var ABANDON_KEY = "ecomso_checkout_abandon_v1";
    // Abandon timeout (5 minutes) — for testing.
    var ABANDON_AFTER_MS = 5 * 60 * 1000;
    var ABANDON_POLL_MS = 30 * 1000; // check every 30s while on checkout

    // Cleanup on success page
    if (isOrderReceivedPage()) {
      safeLsRemove(ABANDON_KEY);
      return;
    }

    var form = getCheckoutForm();
    if (!form) {
      if (!window.__ecomsoCheckoutFormTrackingWatch && typeof MutationObserver !== "undefined" && document.body) {
        window.__ecomsoCheckoutFormTrackingWatch = true;
        var obs = new MutationObserver(function () {
          var f = getCheckoutForm();
          if (!f) return;
          obs.disconnect();
          window.__ecomsoCheckoutFormTrackingWatch = false;
          installCheckoutFormTracking();
        });
        obs.observe(document.body, { childList: true, subtree: true });
        setTimeout(function () {
          try {
            obs.disconnect();
            window.__ecomsoCheckoutFormTrackingWatch = false;
          } catch (eD) {}
        }, 60000);
      }
      return;
    }
    window.__ecomsoCheckoutFormTrackingInstalled = true;

    void resolveLiveCartPayload("checkout").then(function (eco) {
      if (eco && eco.items && eco.items.length) rememberLastCartEco(eco);
    });

    var FIELD_TO_EVENT = {
      billing_first_name: "first_name_added",
      billing_last_name: "last_name_added",
      billing_phone: "phone_number_added",
      billing_email: "email_address_added",
      billing_address_1: "address_added",
      billing_city: "city_added",
      billing_state: "state_added",
      billing_postcode: "postal_code_added",
      billing_country: "country_added",
    };

    function computeRequiredCanonicals() {
      var req = {};
      var canonicals = Object.keys(FIELD_TO_EVENT);
      for (var i = 0; i < canonicals.length; i += 1) {
        var c = canonicals[i];
        var el = findCheckoutFieldEl(form, c);
        if (!el) continue;
        if (isFieldRequired(form, c)) req[c] = true;
      }
      // Ensure we track completion for email/phone if present & required by plugin
      if (findCheckoutFieldEl(form, "billing_email") && isFieldRequired(form, "billing_email")) req.billing_email = true;
      if (findCheckoutFieldEl(form, "billing_phone") && isFieldRequired(form, "billing_phone")) req.billing_phone = true;
      return Object.keys(req);
    }
    var REQUIRED_FIELDS = computeRequiredCanonicals();

    var started = false;
    var completed = false;
    var firedFields = {};

    function markAbandonState() {
      try {
        var firstName = fieldValue(form, "billing_first_name");
        var lastName = fieldValue(form, "billing_last_name");
        var email = fieldValue(form, "billing_email");
        var phone = fieldValue(form, "billing_phone");
        if (!email && !phone) return;
        var eco = checkoutEcommerceSnapshot();
        var st = null;
        try {
          var apiSt = resolveTrackerApi();
          st = apiSt && typeof apiSt.getState === "function" ? apiSt.getState() : null;
        } catch (e) {}
        var payload = {
          startedAt: Date.now(),
          lastActivityAt: Date.now(),
          lastEmittedAbandonedAt: 0,
          sessionId: st && st.sessionId ? String(st.sessionId) : "",
          userId: st && st.userId ? String(st.userId) : "",
          path: typeof location !== "undefined" ? String(location.pathname || "") : "",
          // Saved customer info (for abandon recovery)
          name: normalizeTextValue((firstName ? firstName + " " : "") + (lastName || "")),
          email: normalizeTextValue(email),
          phone: normalizeTextValue(phone),
          emailDomain: email && email.indexOf("@") > 0 ? String(email.split("@").pop() || "").slice(0, 64) : "",
          phoneLast4: phone ? String(phone).replace(/[^0-9]/g, "").slice(-4) : "",
          currency: eco && eco.currency ? String(eco.currency) : "",
          value: eco && eco.value != null ? Number(eco.value) : 0,
          itemsCount: eco && eco.items ? eco.items.length : 0,
          fields: Object.assign({}, firedFields),
        };
        safeLsSet(ABANDON_KEY, JSON.stringify(payload));
      } catch (e) {}
    }

    function touchAbandonState() {
      try {
        var raw = safeLsGet(ABANDON_KEY);
        if (!raw) return;
        var obj = JSON.parse(raw);
        if (!obj || typeof obj !== "object") return;
        obj.lastActivityAt = Date.now();
        obj.fields = Object.assign({}, obj.fields || {}, firedFields);
        safeLsSet(ABANDON_KEY, JSON.stringify(obj));
      } catch (e) {}
    }

    // checkout_form_abandoned is server-owned (contact idle). Do not emit from the storefront.

    function emitStarted() {
      if (started) return;
      started = true;
      trackCheckoutFormEvent("checkout_form_started");
      markAbandonState();
    }

    function allRequiredFilled() {
      for (var i = 0; i < REQUIRED_FIELDS.length; i += 1) {
        if (!fieldValue(form, REQUIRED_FIELDS[i])) return false;
      }
      return true;
    }

    function emitCompletedIfReady() {
      if (completed) return;
      if (!allRequiredFilled()) return;
      completed = true;
      trackCheckoutFormEvent("checkout_form_completed");
      // keep abandon state until order success; but update fields snapshot
      touchAbandonState();
    }

    function handleFieldMaybeAdded(fieldName, rawOverride) {
      if (!FIELD_TO_EVENT[fieldName]) return;
      var v =
        rawOverride != null && String(rawOverride).trim() !== ""
          ? normalizeTextValue(rawOverride)
          : fieldValue(form, fieldName);
      if (!v) return;
      if (fieldName === "billing_phone" || fieldName === "billing_email") {
        var contactKind = fieldName === "billing_email" ? "email" : "phone";
        if (!esbMarkContactValueFired(contactKind, v)) {
          var valid =
            contactKind === "email" ? v.indexOf("@") > 0 : v.replace(/\D/g, "").length >= 8;
          if (valid) {
            firedFields[fieldName] = true;
            emitCompletedIfReady();
          }
          return;
        }
      }
      if (firedFields[fieldName]) return;
      firedFields[fieldName] = true;
      var geoHint = null;
      if (fieldName === "billing_country") geoHint = { country: v };
      else if (fieldName === "billing_city") geoHint = { city: v };
      else if (fieldName === "billing_state") geoHint = { region: v };
      trackCheckoutFormEvent(FIELD_TO_EVENT[fieldName], {
        geo: geoHint,
        phone: fieldName === "billing_phone" ? v : undefined,
        email: fieldName === "billing_email" ? v : undefined,
        // Real name → Checkout drop-off "Customer" (server-only; not forwarded to GA4/ads).
        name: fieldName === "billing_first_name" ? v : undefined,
        last_name: fieldName === "billing_last_name" ? v : undefined,
      });
      markAbandonState();
      emitCompletedIfReady();
    }

    function onAnyInputEvent(e) {
      try {
        var t = e && e.target ? e.target : null;
        if (!t) return;
        if (!form.contains(t)) return;
        if (!started) emitStarted();
        // update abandon state on any activity (not only tracked fields)
        touchAbandonState();
      } catch (ex) {}
    }

    function onBlurOrChange(e) {
      try {
        var t = e && e.target ? e.target : null;
        if (!t) return;
        if (!form.contains(t)) return;
        if (!started) emitStarted();
        var canonical = canonicalCheckoutFieldFromTarget(t);
        if (canonical) {
          var raw = t.value != null ? String(t.value) : "";
          handleFieldMaybeAdded(canonical, raw);
        }
        touchAbandonState();
      } catch (ex) {}
    }

    // Start detection: first typing / change inside form
    form.addEventListener("input", onAnyInputEvent, true);
    form.addEventListener("change", onAnyInputEvent, true);
    form.addEventListener("keydown", onAnyInputEvent, true);

    // Field completion: blur/change
    form.addEventListener("blur", onBlurOrChange, true);
    form.addEventListener("change", onBlurOrChange, true);

    // On submit success page will clear; on submit we also touch abandon
    form.addEventListener(
      "submit",
      function () {
        if (!started) emitStarted();
        touchAbandonState();
        emitCompletedIfReady();
      },
      true
    );

  }

  var __ecomsoJqCartHooksBound = false;
  function bindJQueryWooCartHooks() {
    if (window.jQuery) installJQueryAjaxCartHooks();
    if (__ecomsoJqCartHooksBound || !window.jQuery) return;
    __ecomsoJqCartHooksBound = true;
    window.jQuery(function ($) {
      $(document.body).on("adding_to_cart", function (_evt, $button) {
        __ecomsoPreAddCartEco = cloneCartEcoSnapshot(__ecomsoLastCartEco);
        try {
          if ($button && $button.length && $button[0]) {
            emitAddToCartFromDomClick($button[0], "jquery-adding_to_cart");
          }
        } catch (eAdd) {}
      });

      $(document.body).on("added_to_cart", function () {
        var before = __ecomsoPreAddCartEco != null ? __ecomsoPreAddCartEco : cloneCartEcoSnapshot(__ecomsoLastCartEco);
        emitAddToCartFromCartDelta(before, 320);
        __ecomsoPreAddCartEco = null;
      });

      $(document.body).on("removed_from_cart", function () {
        var prev = cloneCartEcoSnapshot(__ecomsoPreMutationCartEco || __ecomsoLastCartEco);
        emitRemoveFromCartFromCartDelta(prev, 200);
      });

      $(document.body).on("updated_cart_totals updated_wc_div", function () {
        void fetchStoreApiCartEcommerce().then(function (eco) {
          rememberLastCartEco(eco);
        });
      });
    });
  }
  bindJQueryWooCartHooks();
  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("load", bindJQueryWooCartHooks);
  }
})();
