/**
 * EcomSolveBD tracker runtime — always loads live config from REST (cache-plugin safe).
 */
(function (w) {
  if (w.__ecomsoRuntimeStarted) {
    return;
  }
  w.__ecomsoRuntimeStarted = true;

  function configUrl() {
    try {
      if (w.__ECOMSO_RUNTIME__ && w.__ECOMSO_RUNTIME__.configUrl) {
        return String(w.__ECOMSO_RUNTIME__.configUrl);
      }
    } catch (e0) {}
    try {
      var base = (w.location.origin || "") + "/wp-json/ecomso/v1/tracker-config";
      return base + (base.indexOf("?") >= 0 ? "&" : "?") + "_nc=" + Date.now();
    } catch (e1) {
      return "";
    }
  }

  function trackerApi() {
    try {
      var t = w.EcomSolveBDTracker || w.FCommerceTracker;
      if (t && t.default && typeof t.default.track === "function") {
        return t.default;
      }
      if (t && typeof t.track === "function") {
        return t;
      }
    } catch (e2) {}
    return null;
  }

  function loadScript(url, next) {
    if (!url) {
      next();
      return;
    }
    var s = document.createElement("script");
    s.src = url;
    s.async = false;
    s.onload = function () {
      next();
    };
    s.onerror = function () {
      next();
    };
    (document.head || document.documentElement).appendChild(s);
  }

  function applyCartFromConfig(cfg) {
    try {
      if (cfg && cfg.cartEcommerce && cfg.cartEcommerce.items && cfg.cartEcommerce.items.length) {
        w.__ECOMSO_CART__ = cfg.cartEcommerce;
      }
    } catch (eCart) {}
    return cfg;
  }

  function applyIngestConfig(t, cfg) {
    cfg = applyCartFromConfig(cfg || {});
    w.__ECOMSO_CONFIG__ = cfg;
    try {
      if (t && typeof t.updateIngestConfig === "function") {
        t.updateIngestConfig(cfg);
      }
    } catch (eUp) {}
    return cfg;
  }

  function bootTracker(cfg) {
    cfg = applyCartFromConfig(cfg || {});
    w.__ECOMSO_CONFIG__ = cfg;
    try {
      var sk = cfg.siteKey || "0";
      w.sessionStorage.removeItem("esb:merchant_key_unauthorized:" + sk);
    } catch (e3) {}
    var t = trackerApi();
    if (!t || typeof t.init !== "function") {
      return false;
    }
    if (w.__ecomsoTrackerInited && typeof t.getState === "function" && t.getState()) {
      // DNS verify/delete: swap endpoint only — keep visitor/session/outbox + client_event_id.
      applyIngestConfig(t, cfg);
      scheduleAutoPageViewFallback(t, cfg);
      return true;
    }
    w.EcomSolveBDTracker = t;
    var state = t.init(cfg);
    w.__ecomsoTrackerInited = true;
    scheduleAutoPageViewFallback(t, cfg);
    try {
      w.dispatchEvent(new CustomEvent("ecomso:ready", { detail: state || true }));
    } catch (e4) {}
    return true;
  }

  /** Safety net when init missed auto page_view (late async script load). */
  function scheduleAutoPageViewFallback(t, cfg) {
    if (!cfg || cfg.autoPageView === false) return;
    setTimeout(function () {
      try {
        var pending = w.__ECOMSO_PENDING_AUTO_PAGEVIEW__ || w.__FCT_PENDING_AUTO_PAGEVIEW__;
        if (!pending) return;
        var st = t.getState && t.getState();
        if (!st || !st.userId) return;
        delete w.__ECOMSO_PENDING_AUTO_PAGEVIEW__;
        delete w.__FCT_PENDING_AUTO_PAGEVIEW__;
        if (pending === "landing_page_view" && typeof t.track === "function") {
          t.track("landing_page_view", {});
        } else if (typeof t.trackPageView === "function") {
          t.trackPageView();
        }
      } catch (e6) {}
    }, 200);
  }

  function scriptUrl(cfg, role) {
    if (cfg.scriptUrls && cfg.scriptUrls[role]) {
      return String(cfg.scriptUrls[role]);
    }
    var ver = cfg.pluginVersion || "1";
    var rev = cfg.configRevision != null ? String(cfg.configRevision) : ver;
    var base = (w.location.origin || "") + "/wp-content/plugins/ecomsolvebd/assets/js/";
    var file = role === "bridge" ? "ecomso-wc-bridge.js" : "ecomsolvebd.js";
    return base + file + "?ver=" + encodeURIComponent(rev + "." + ver);
  }

  function runWithConfig(cfg) {
    if (!cfg || !cfg.merchantId || !cfg.endpoint) {
      return;
    }

    var loadBridge =
      cfg.loadWcBridge === true ||
      (w.__ECOMSO_RUNTIME__ && w.__ECOMSO_RUNTIME__.wcBridge === true);

    if (trackerApi()) {
      bootTracker(cfg);
      if (loadBridge) {
        loadScript(scriptUrl(cfg, "bridge"), function () {});
      }
      return;
    }

    loadScript(scriptUrl(cfg, "tracker"), function () {
      if (!bootTracker(cfg)) {
        return;
      }
      if (loadBridge) {
        loadScript(scriptUrl(cfg, "bridge"), function () {});
      }
    });
  }

  function fetchConfig(done) {
    var url = configUrl();
    if (!url || typeof w.fetch === "undefined") {
      done(w.__ECOMSO_CONFIG__ || null);
      return;
    }
    w.fetch(url, { cache: "no-store", credentials: "same-origin" })
      .then(function (res) {
        return res && res.ok ? res.json() : null;
      })
      .then(function (json) {
        done(json && json.data ? json.data : null);
      })
      .catch(function () {
        done(null);
      });
  }

  fetchConfig(runWithConfig);

  // Soft refresh when tab becomes visible again (merchant may have verified DNS in dashboard).
  var _esbCfgRefreshAt = 0;
  function softRefreshConfig() {
    var now = Date.now();
    if (now - _esbCfgRefreshAt < 30_000) return;
    _esbCfgRefreshAt = now;
    fetchConfig(function (cfg) {
      if (!cfg || !cfg.endpoint) return;
      if (!w.__ecomsoTrackerInited) {
        runWithConfig(cfg);
        return;
      }
      var t = trackerApi();
      applyIngestConfig(t, cfg);
    });
  }
  try {
    w.document.addEventListener(
      "visibilitychange",
      function () {
        if (w.document.visibilityState === "visible") softRefreshConfig();
      },
      { passive: true },
    );
    w.addEventListener("pageshow", softRefreshConfig, { passive: true });
  } catch (eVis) {}
})(window);
