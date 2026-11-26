/**
 * Checkout Shield — browser side for connected stores (WooCommerce classic + Blocks, Laravel, Next.js, Custom).
 *
 * - Starts the phone check the moment a full BD number is typed (finishes while the buyer types the address).
 * - On "Place order" (form submit OR button click — works for jQuery, React, Blocks): if the store wants an
 *   SMS code for this buyer, holds the click, shows a Bangla OTP dialog, then re-sends the same click/submit.
 * - Never blocks on our trouble: network error, slow API (>3s), inactive shield → the order goes on.
 *   The real gate is server-side: the store backend asks `/checkout-shield/public/verify-order` before saving.
 * - Custom code can call `window.EsbCheckoutShield.ensure(phone)` before its own order request.
 */

const SUBMIT_WAIT_MS = 3000;
const CHECK_TIMEOUT_MS = 8000;
const BN = "০১২৩৪৫৬৭৮৯";
const PHONE_HINT = /tel|phone|mobile|billing_phone|shipping_phone|01x|মোবাইল|ফোন/i;
const PLACE_ORDER_SELECTOR = [
  "#place_order",
  ".wc-block-components-checkout-place-order-button",
  "[data-esb-place-order]",
  "[name='woocommerce_checkout_place_order']",
].join(",");

function bn(v) {
  return String(v).replace(/\d/g, (d) => BN[Number(d)]);
}

export function validBdPhone(raw) {
  const d = String(raw || "")
    .replace(/[০-৯]/g, (c) => String(BN.indexOf(c)))
    .replace(/\D/g, "");
  let local = d;
  if (local.startsWith("880")) local = local.slice(2);
  else if (local.startsWith("88") && local.length === 13) local = local.slice(2);
  return /^01\d{9}$/.test(local) ? local : null;
}

function isPhoneInput(el) {
  if (!el || el.tagName !== "INPUT") return false;
  const hay = [el.type, el.name, el.id, el.autocomplete, el.inputMode, el.placeholder, el.getAttribute("aria-label") || ""]
    .join(" ")
    .toLowerCase();
  return PHONE_HINT.test(hay);
}

/** Only real checkout forms (never contact / newsletter forms that also ask for a phone). */
function isCheckoutForm(form) {
  if (!form || form.tagName !== "FORM") return false;
  if (form.hasAttribute("data-esb-checkout")) return true;
  if (form.matches("form.checkout, form.woocommerce-checkout, #order_review")) return true;
  const hay = `${form.id} ${form.className} ${form.getAttribute("action") || ""} ${form.getAttribute("name") || ""}`.toLowerCase();
  return /checkout|place[-_]?order|order[-_]?form|অর্ডার/.test(hay);
}

function findPhone(root) {
  const scope = root && root.querySelectorAll ? root : document;
  const inputs = scope.querySelectorAll("input");
  // Visible fields first: builders such as FunnelKit keep a hidden JSON copy of the phone that can be stale
  // until the field blurs. A hidden field is used only when the form has no visible phone at all.
  for (const hiddenPass of [false, true]) {
    for (let i = 0; i < inputs.length; i++) {
      const el = inputs[i];
      if ((el.type === "hidden") !== hiddenPass) continue;
      if (!isPhoneInput(el)) continue;
      const p = validBdPhone(el.value);
      if (p) return p;
    }
  }
  return null;
}

/** API base for the shield: same host as the tracker API, or the canonical API when collect is first-party. */
export function shieldApiBase(cfg) {
  if (cfg && cfg.shieldApiBase) return String(cfg.shieldApiBase).replace(/\/+$/, "");
  try {
    const u = new URL(String(cfg.endpoint), typeof location !== "undefined" ? location.href : undefined);
    const i = u.pathname.indexOf("/api/v1/");
    if (i >= 0) return `${u.origin}${u.pathname.slice(0, i)}/api/v1/checkout-shield/public`;
  } catch {
    /* fall through */
  }
  return "https://api.ecomsolvebd.com/api/v1/checkout-shield/public";
}

function post(base, path, mid, body, timeoutMs) {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const t = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs || 15000) : null;
  return fetch(`${base}/${path}`, {
    method: "POST",
    mode: "cors",
    credentials: "omit",
    headers: { "Content-Type": "application/json", "x-merchant-key": mid },
    body: JSON.stringify({ merchant_key: mid, host: location.host, ...body }),
    signal: ctrl ? ctrl.signal : undefined,
  })
    .then((r) => r.json().then((j) => ({ ok: r.ok, j })).catch(() => ({ ok: false, j: null })))
    .then(({ ok, j }) => {
      if (!ok || !j || !j.data) {
        const err = new Error((j && j.error && j.error.message) || "চেষ্টা ব্যর্থ — আবার চেষ্টা করুন।");
        throw err;
      }
      return j.data;
    })
    .finally(() => t && clearTimeout(t));
}

/* ───────── OTP dialog (vanilla, Bangla, mobile-first) ───────── */

function openOtpDialog(api, checkId, phoneMasked) {
  return new Promise((resolve, reject) => {
    const wrap = document.createElement("div");
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-label", "মোবাইল নম্বর যাচাই");
    wrap.style.cssText =
      "position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.55);display:flex;align-items:flex-end;justify-content:center;padding:12px;font-family:inherit";
    if (window.matchMedia && window.matchMedia("(min-width: 640px)").matches) wrap.style.alignItems = "center";
    wrap.innerHTML =
      '<form style="width:100%;max-width:400px;background:#fff;color:#0f172a;border-radius:18px;padding:22px 20px 18px;box-shadow:0 20px 50px rgba(15,23,42,.3)">' +
      '<div style="font-size:18px;font-weight:700;line-height:1.35">মোবাইল নম্বর যাচাই করুন</div>' +
      '<p data-r="lead" style="margin:8px 0 0;font-size:14.5px;line-height:1.6;color:#475569"></p>' +
      '<input data-r="code" inputmode="numeric" autocomplete="one-time-code" placeholder="______" aria-label="যাচাই কোড" ' +
      'style="margin-top:14px;width:100%;height:54px;border-radius:12px;border:1.5px solid #cbd5e1;text-align:center;font-size:24px;letter-spacing:8px;font-weight:700;outline:none;color:#0f172a;background:#f8fafc;box-sizing:border-box" />' +
      '<p data-r="msg" style="margin:8px 0 0;font-size:13.5px;min-height:1em"></p>' +
      '<button data-r="ok" type="submit" style="margin-top:12px;width:100%;min-height:50px;border-radius:12px;border:none;background:#0f172a;color:#fff;font-size:16px;font-weight:700;cursor:pointer">যাচাই করে অর্ডার করুন</button>' +
      '<div style="margin-top:12px;display:flex;justify-content:space-between;gap:8px;font-size:14px">' +
      '<button data-r="resend" type="button" style="background:none;border:none;padding:4px;font-weight:600;color:#2563eb;cursor:pointer"></button>' +
      '<button data-r="cancel" type="button" style="background:none;border:none;padding:4px;color:#64748b;cursor:pointer">বাতিল</button>' +
      "</div></form>";
    const $ = (r) => wrap.querySelector(`[data-r="${r}"]`);
    const lead = $("lead");
    const code = $("code");
    const msg = $("msg");
    const ok = $("ok");
    const resend = $("resend");
    let wait = 0;
    let timer = null;

    const setLead = (masked) => {
      lead.textContent = "";
      lead.append("অর্ডার নিশ্চিত করতে ");
      const b = document.createElement("b");
      b.style.color = "#0f172a";
      b.textContent = masked || "আপনার";
      lead.append(b, " নম্বরে একটি ৬ সংখ্যার কোড পাঠানো হয়েছে।");
    };
    const say = (text, good) => {
      msg.textContent = text || "";
      msg.style.color = good ? "#15803d" : "#dc2626";
    };
    const tick = () => {
      resend.textContent = wait > 0 ? `আবার পাঠান (${bn(wait)})` : "কোড আবার পাঠান";
      resend.disabled = wait > 0;
      resend.style.color = wait > 0 ? "#94a3b8" : "#2563eb";
    };
    const startWait = (sec) => {
      wait = sec;
      tick();
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        wait -= 1;
        tick();
        if (wait <= 0) clearInterval(timer);
      }, 1000);
    };
    const close = () => {
      if (timer) clearInterval(timer);
      wrap.remove();
    };
    const done = (token) => {
      close();
      resolve(token);
    };
    const send = () =>
      api
        .post("otp/send", { checkId })
        .then((r) => {
          if (r.phoneMasked) setLead(r.phoneMasked);
          if (r.token) return done(r.token); // SMS trouble → never lose the order
          if (r.sent) say("কোড পাঠানো হয়েছে।", true);
          else if (r.message) say(bn(r.message), !/ফোন/.test(r.message));
          startWait(r.retryAfterSec || 90);
        })
        .catch((e) => say(e.message));

    setLead(phoneMasked);
    tick();
    $("cancel").onclick = () => {
      close();
      reject(new Error("অর্ডার করতে মোবাইলে পাঠানো কোডটি দিন।"));
    };
    resend.onclick = () => wait <= 0 && send();
    wrap.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      const c = String(code.value || "")
        .replace(/[০-৯]/g, (x) => String(BN.indexOf(x)))
        .replace(/\D/g, "");
      if (c.length !== 6) return say("৬ সংখ্যার কোডটি লিখুন।");
      ok.disabled = true;
      ok.textContent = "যাচাই হচ্ছে…";
      api
        .post("otp/verify", { checkId, code: c })
        .then((r) => done(r.token))
        .catch((err) => {
          say(err.message);
          ok.disabled = false;
          ok.textContent = "যাচাই করে অর্ডার করুন";
        });
    };
    document.body.appendChild(wrap);
    setTimeout(() => code.focus(), 50);
    send();
  });
}

function showNotice(text) {
  const el = document.createElement("div");
  el.setAttribute("role", "alert");
  el.style.cssText =
    "position:fixed;left:12px;right:12px;bottom:16px;z-index:2147483000;max-width:440px;margin:0 auto;background:#0f172a;color:#fff;border-radius:14px;padding:14px 16px;font-size:14.5px;line-height:1.55;box-shadow:0 12px 30px rgba(15,23,42,.35)";
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 8000);
}

/* ───────── install ───────── */

/**
 * @param {{ endpoint?: string, merchantId?: string, shieldApiBase?: string }} cfg
 */
export function installCheckoutShield(cfg) {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  if (window.EsbCheckoutShield) return window.EsbCheckoutShield;
  const mid = cfg && cfg.merchantId ? String(cfg.merchantId).trim() : "";
  if (!mid) return null;
  const base = shieldApiBase(cfg);
  const api = { post: (path, body, ms) => post(base, path, mid, body, ms) };
  const offKey = `esb_shield_off:${mid}:${location.host}`;
  const checks = new Map(); // phone → Promise<result|null>
  const tokens = new Map(); // phone → token (allowed / verified)
  let bypass = false;
  let lastReplay = null; // how to send the last Place-order again (any checkout UI)
  let recovering = false;

  const isOff = () => {
    try {
      const v = sessionStorage.getItem(offKey);
      return Boolean(v && Date.now() - Number(v) < 10 * 60 * 1000);
    } catch {
      return false;
    }
  };

  const check = (raw) => {
    const phone = validBdPhone(raw);
    if (!phone || isOff()) return Promise.resolve(null);
    if (checks.has(phone)) return checks.get(phone);
    const run = api
      .post("check", { phone }, CHECK_TIMEOUT_MS)
      .then((r) => {
        if (!r || !r.active) {
          try {
            sessionStorage.setItem(offKey, String(Date.now()));
          } catch {
            /* ignore */
          }
          return null;
        }
        if (r.decision === "allow" && r.token) tokens.set(phone, r.token);
        return r;
      })
      .catch(() => {
        checks.delete(phone);
        return null;
      });
    checks.set(phone, run);
    return run;
  };

  /**
   * Before placing an order: resolves `{ ok: true, token }` (go on) or `{ ok: false, message }` (stop, show message).
   * Never rejects because of our trouble.
   */
  const ensure = async (raw) => {
    const phone = validBdPhone(raw);
    if (!phone) return { ok: true, token: null };
    if (tokens.has(phone)) return { ok: true, token: tokens.get(phone) };
    const r = await Promise.race([check(phone), new Promise((res) => setTimeout(() => res(null), SUBMIT_WAIT_MS))]);
    if (!r) return { ok: true, token: null };
    if (r.decision === "cooldown") return { ok: false, message: r.message || "এই নম্বর থেকে কিছুক্ষণ পরে অর্ডার করুন।" };
    if (r.decision === "allow") return { ok: true, token: r.token || null };
    if (!r.checkId) return { ok: true, token: null };
    try {
      const token = await openOtpDialog(api, r.checkId, r.phoneMasked || "");
      tokens.set(phone, token);
      return { ok: true, token };
    } catch (e) {
      return { ok: false, message: e.message, cancelled: true };
    }
  };

  // 1) Check on the 11th digit, in any phone field.
  const onInput = (e) => {
    const el = e.target;
    if (isPhoneInput(el) && validBdPhone(el.value)) check(el.value);
  };
  document.addEventListener("input", onInput, true);
  document.addEventListener("change", onInput, true);
  // Returning buyers: the phone is often pre-filled (no typing at all) — check it right away.
  const scanPrefilled = () => {
    const p = findPhone(document);
    if (p) check(p);
  };
  setTimeout(scanPrefilled, 800);
  setTimeout(scanPrefilled, 3000); // React / Blocks checkouts fill fields after mount

  // 2) Hold "Place order" only when this buyer needs a code / is under the timer.
  const gate = (e, replay) => {
    lastReplay = replay;
    if (bypass || isOff()) return;
    const root = (e.target && e.target.closest && e.target.closest("form")) || document;
    const phone = findPhone(root) || findPhone(document);
    if (!phone || tokens.has(phone)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    ensure(phone).then((res) => {
      if (!res.ok) {
        if (!res.cancelled && res.message) showNotice(res.message);
        return;
      }
      if (res.token) {
        const form = root.tagName === "FORM" ? root : null;
        if (form && !form.querySelector("input[name='esb_shield_token']")) {
          const h = document.createElement("input");
          h.type = "hidden";
          h.name = "esb_shield_token";
          form.appendChild(h);
        }
        const h = form && form.querySelector("input[name='esb_shield_token']");
        if (h) h.value = res.token;
      }
      bypass = true;
      try {
        replay();
      } finally {
        setTimeout(() => (bypass = false), 0);
      }
    });
  };
  document.addEventListener(
    "submit",
    (e) => {
      const form = e.target;
      if (!isCheckoutForm(form) || !findPhone(form)) return;
      gate(e, () => (typeof form.requestSubmit === "function" ? form.requestSubmit() : form.submit()));
    },
    true,
  );
  document.addEventListener(
    "click",
    (e) => {
      const btn = e.target && e.target.closest ? e.target.closest(PLACE_ORDER_SELECTOR) : null;
      if (!btn) return;
      gate(e, () => btn.click());
    },
    true,
  );

  // 3) Fallback for checkout UIs we do not recognise (page builders, custom themes, FunnelKit, CartFlows …):
  //    the store backend refused with our message → open the code dialog here, then send the order again.
  const SERVER_ASKED = "মোবাইলে পাঠানো কোড দিন";
  const recover = () => {
    if (recovering || bypass) return;
    const phone = findPhone(document);
    if (!phone) return;
    recovering = true;
    checks.delete(phone);
    tokens.delete(phone);
    ensure(phone)
      .then((res) => {
        if (!res.ok) {
          if (!res.cancelled && res.message) showNotice(res.message);
          return;
        }
        const replay = lastReplay || (() => {
          const btn = document.querySelector(PLACE_ORDER_SELECTOR) || document.querySelector("form.checkout [type='submit']");
          if (btn) btn.click();
        });
        bypass = true;
        try {
          replay();
        } finally {
          setTimeout(() => (bypass = false), 0);
        }
      })
      .finally(() => setTimeout(() => (recovering = false), 1500));
  };
  try {
    const seen = new WeakSet();
    const mo = new MutationObserver((list) => {
      for (const m of list) {
        for (const n of m.addedNodes) {
          if (!n || seen.has(n)) continue;
          const text = n.nodeType === 3 ? n.textContent : n.nodeType === 1 && !(n.closest && n.closest("[aria-label='মোবাইল নম্বর যাচাই']")) ? n.textContent : "";
          if (text && text.indexOf(SERVER_ASKED) >= 0) {
            seen.add(n);
            recover();
            return;
          }
        }
      }
    });
    mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
  } catch {
    /* old browsers: the server message alone still tells the buyer what to do */
  }

  const api2 = { ensure, check, validBdPhone };
  window.EsbCheckoutShield = api2;
  return api2;
}
