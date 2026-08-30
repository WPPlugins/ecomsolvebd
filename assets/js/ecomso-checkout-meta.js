(function () {
  "use strict";

  function safeStr(v) {
    try {
      return v === null || v === undefined ? "" : String(v);
    } catch (e) {
      return "";
    }
  }

  function ensureHidden(form, name, value) {
    try {
      var el = form.querySelector('input[name="' + name + '"]');
      if (!el) {
        el = document.createElement("input");
        el.type = "hidden";
        el.name = name;
        form.appendChild(el);
      }
      el.value = safeStr(value);
    } catch (e) {}
  }

  document.addEventListener(
    "DOMContentLoaded",
    function () {
      var form = document.querySelector("form.checkout");
      if (!form) return;

      var st = null;
      try {
        if (
          window.EcomSolveBDTracker &&
          typeof window.EcomSolveBDTracker.getState === "function"
        ) {
          st = window.EcomSolveBDTracker.getState();
        }
      } catch (e) {}

      ensureHidden(form, "ecomso_user_id", st && st.userId ? st.userId : "");
      ensureHidden(form, "ecomso_session_id", st && st.sessionId ? st.sessionId : "");
      ensureHidden(
        form,
        "ecomso_session_number",
        st && st.sessionNumber ? st.sessionNumber : ""
      );
      ensureHidden(form, "ecomso_journey_id", st && st.journeyId ? st.journeyId : "");
    },
    { once: true }
  );
})();
