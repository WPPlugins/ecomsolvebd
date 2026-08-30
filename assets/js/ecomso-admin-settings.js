(function () {
  "use strict";

  var cfg = window.ecomsoAdminSettings;
  if (!cfg || !cfg.ajaxUrl) return;

  var btn = document.getElementById("ecomso-test-connection");
  var msg = document.getElementById("ecomso-connection-message");
  var box = document.getElementById("ecomso-connection-status");
  var mid = document.getElementById("ecomso_merchant_id");

  function i18n(key, fallback) {
    return cfg.i18n && cfg.i18n[key] ? cfg.i18n[key] : fallback;
  }

  function setConnectionStatus(ok, text) {
    if (!msg) return;
    msg.textContent = text || "";
    if (!box) return;
    box.hidden = false;
    box.style.display = "block";
    box.classList.remove("notice-success", "notice-warning", "notice-error", "notice-info");
    box.classList.add(ok ? "notice-success" : "notice-warning");
  }

  if (btn && msg && mid) {
    btn.addEventListener("click", function () {
      btn.disabled = true;
      setConnectionStatus(false, i18n("testing", "Testing…"));
      var body = new URLSearchParams();
      body.set("action", "ecomso_test_connection");
      body.set("nonce", cfg.nonce);
      body.set("merchant_id", mid.value || "");
      fetch(cfg.ajaxUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body: body.toString(),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (json) {
          var data = json && json.data ? json.data : {};
          setConnectionStatus(Boolean(data.ok), data.message || i18n("failed", "Done."));
        })
        .catch(function () {
          setConnectionStatus(false, i18n("failed", "Test failed."));
        })
        .finally(function () {
          btn.disabled = false;
        });
    });
  }
})();
