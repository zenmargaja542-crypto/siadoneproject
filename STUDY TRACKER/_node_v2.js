// Node harness v2: full auth.js boot + one-click demo sign-in validation.
const fs = require("fs");
const SRC = fs.readFileSync("c:/STUDY TRACKER/auth.js", "utf8");

function makeEl(tag) {
  const el = {
    tagName: tag || "div",
    style: {},
    dataset: {},
    attributes: {},
    value: "",
    innerHTML: "",
    textContent: "",
    id: "",
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      contains(c) { return this._s.has(c); },
      toggle(c, force) {
        const has = this._s.has(c);
        const on = force === undefined ? !has : Boolean(force);
        on ? this._s.add(c) : this._s.delete(c);
        return on;
      }
    },
    setAttribute(k, v) { this.attributes[k] = v; },
    getAttribute(k) { return this.attributes[k]; },
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    prepend() {},
    remove() {},
    closest() { return null; },
    querySelector() { return makeEl("div"); },
    querySelectorAll() { return []; },
    focus() {}
  };
  return el;
}

const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: k => { store.delete(k); },
  clear: () => { store.clear(); }
};
globalThis.window = globalThis;
try { globalThis.location = { protocol: "file:", reload() {} }; } catch (e) {}
const docBody = makeEl("body");
const docEls = new Map();
let authRootEl = null;
docEls.set("appShell", makeEl("div"));
globalThis.document = {
  readyState: "loading",
  body: docBody,
  head: makeEl("head"),
  getElementById: id => {
    if (id === "authRoot") { if (!authRootEl) authRootEl = makeEl("div"); return authRootEl; }
    if (id === "authSwitchText" || id === "authSwitch") return docEls.get("authSwitch") || makeEl("button");
    if (id === "demoQuickSignin") return docEls.get("demoQuickSignin") || null;
    if (id === "openSetupGuide") return null;
    if (id === "setupOverlay") return null;
    if (id === "appShell") return docEls.get("appShell");
    return null;
  },
  createElement: t => makeEl(t),
  addEventListener() {},
  removeEventListener() {},
  prepend() {}
};
globalThis.showToast = (m, t) => { globalThis.__lastToast = { m, t }; };
globalThis.closeModal = () => {};
globalThis.escapeHtml = s => String(s);
globalThis.updateGreetingAndClock = () => {};
globalThis.init = () => {};

/* Materialize #authRoot as a proxy that watches innerHTML so the
   renderAuthScreen wiring (getElementById -> demoQuickSignin) works. */
(function wireAuthRoot() {
  const base = makeEl("div");
  authRootEl = new Proxy(base, {
    set(obj, prop, val) {
      obj[prop] = val;
      if (prop === "innerHTML") {
        const html = String(val);
        if (/demoQuickSignin/.test(html)) {
          if (!docEls.has("demoQuickSignin")) {
            const qb = makeEl("button");
            qb.id = "demoQuickSignin";
            qb.addEventListener = (ev, fn) => { if (ev === "click") qb._click = fn; };
            qb.click = async () => { if (qb._click) await qb._click(); };
            docEls.set("demoQuickSignin", qb);
          }
        } else if (docEls.has("demoQuickSignin")) {
          docEls.delete("demoQuickSignin");
        }
        if (!docEls.has("authSwitch")) docEls.set("authSwitch", makeEl("button"));
      }
      return true;
    },
    get(obj, prop) { return obj[prop]; }
  });
})();

const TESTS = `
(async () => {
  const _t = [];
  const _s = (n, ok, d) => _t.push((ok ? "PASS" : "FAIL") + ": " + n + (d ? " | " + d : ""));
  try {
    AuthManager.mode = "simulated";
    onAuthUserChanged();
    const qb = document.getElementById("demoQuickSignin");
    _s("auth screen: instant demo button rendered", !!qb && qb.id === "demoQuickSignin");

    await qb.click();
    _s("quick demo signs in", !!AuthManager.currentUser &&
      AuthManager.currentUser.providerId === "password" &&
      AuthManager.currentUser.email === "demo@studytracker.app" &&
      AuthManager.currentUser.name === "Demo Student",
      JSON.stringify(AuthManager.currentUser));

    const acc = JSON.parse(localStorage.getItem("st_demo_accounts") || "{}");
    _s("quick demo account persisted (hashed only)", !!acc["demo@studytracker.app"] &&
      acc["demo@studytracker.app"].passHash.startsWith("d$") &&
      localStorage.getItem("st_demo_accounts").indexOf("demo1234") === -1,
      localStorage.getItem("st_demo_accounts"));

    AuthManager.signOut();
    _s("sign-out returns to auth screen", !AuthManager.currentUser &&
      document.body.classList.contains("auth-screen"));
    const ok = await simulatedEmailSignIn("demo@studytracker.app", "demo1234");
    _s("quick demo creds work in normal sign-in", ok === true &&
      AuthManager.currentUser && AuthManager.currentUser.email === "demo@studytracker.app");

    _s("regression providerLabel", providerLabel("password") === "Email" && providerIcon("password") === "\\u2709");
    let tm = null, tt = null;
    const rt = globalThis.showToast;
    globalThis.showToast = (m, t) => { tm = m; tt = t; };
    showAuthError({ code: "auth/email-already-in-use" });
    _s("regression error map", tt === "error" && tm.indexOf("already registered") !== -1, tm);
    globalThis.showToast = rt;

    _s("firebase mode hides quick button", (function () {
      AuthManager.mode = "firebase";
      AuthManager.signOut(); // currentUser -> null -> re-render in firebase mode
      return document.getElementById("demoQuickSignin") === null;
    })());

    AuthManager.mode = "simulated";
    AuthManager.signOut();
    localStorage.removeItem("st_demo_accounts");
  } catch (e) {
    _t.push("FAIL: harness | " + String(e) + "\\n" + (e.stack ? e.stack : ""));
  }
  console.log(_t.join("\\n"));
  if (_t.some(x => x.startsWith("FAIL"))) process.exit(2);
})();
`;

let fn;
try { fn = new Function(SRC + "\n" + TESTS); }
catch (e) { console.log("SYNTAX ERROR: " + e); process.exit(3); }
fn();