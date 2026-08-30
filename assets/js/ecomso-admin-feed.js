(function () {
  "use strict";

  var cfg = window.ecomsoAdminFeed || {};
  var copiedLabel = (cfg.i18n && cfg.i18n.copied) || "Copied";

  document.querySelectorAll(".ecomso-copy-feed-url").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var url = btn.getAttribute("data-url") || "";
      if (!url) return;
      var done = function () {
        var prev = btn.textContent;
        btn.textContent = copiedLabel;
        setTimeout(function () {
          btn.textContent = prev;
        }, 1200);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(function () {
          window.prompt("Copy URL", url);
        });
      } else {
        window.prompt("Copy URL", url);
      }
    });
  });
})();
