// ============================================================
//   STUDY TRACKER — AUTH (login with Gmail/Google, Facebook,
//   or GitHub)
//   ------------------------------------------------------------
//   Two modes, chosen automatically:
//     • SIMULATED (default) — works instantly offline. Each
//       provider opens a friendly login popup and signs you in.
//       Session is saved in this browser only.
//     • FIREBASE (real)     — if window.FIREBASE_CONFIG is set,
//       this uses the Firebase Auth SDK for real Google /
//       Facebook / GitHub sign-in. Requires hosting on an
//       allowlisted domain (not file://) and the providers
//       enabled in the Firebase console.
//   ============================================================

const AUTH_STORAGE_KEY = "st_auth_user";
// Demo-mode email/password accounts (offline, demo-grade hashing only).
// e.g. st_demo_accounts = { "you@school.edu": { name, passHash, createdAt } }
const DEMO_ACCOUNTS_KEY = "st_demo_accounts";

/* ---------- Per-user data keys ---------- */
// Every signed-in user gets their own namespaced copy of the app
// data, e.g.  st_uid:google:me@gmail.com___subjects
// Signed-out visitors share one "guest" namespace. Theme is global.
function authUserId() {
  if (!AuthManager.currentUser) return "guest";
  return `${AuthManager.currentUser.providerId}:${AuthManager.currentUser.email.toLowerCase()}`;
}

function userKey(k) {
  return `st_uid:${authUserId()}___${k}`;
}

function userKeyPrefix(u) {
  return `st_uid:${u.providerId}:${u.email.toLowerCase()}___`;
}

/* ---------- AuthManager: single source of truth ---------- */
const AuthManager = {
  mode: "simulated",
  currentUser: null, // null | { providerId, name, email, photoUrl, real, loginAt }

  init() {
    // Restore session first (so storage keys are correct at boot time)
    this._restore();
    if (window.FIREBASE_CONFIG) this.mode = "firebase";
  },

  _restore() {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return;
    try {
      const u = JSON.parse(raw);
      if (u && u.providerId && u.email) {
        this.currentUser = u;
        document.body.classList.add("auth-signed-in");
      }
    } catch (e) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  },

  _persist(u) {
    this.currentUser = u;
    if (u) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(u));
      document.body.classList.add("auth-signed-in");
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      document.body.classList.remove("auth-signed-in");
    }
  },

  /* Sign in with a provider: simulated mode asks the friendly
     popup for an email, then creates the local account. */
  async signInWithProvider(provider) {
    const email = await showProviderPopup(provider);
    if (!email) return false; // cancelled
    await delay(400); // small loading shimmer

    const u = {
      providerId: provider,
      email,
      name: nameFromEmail(email),
      photoUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(email)}`,
      real: false,
      loginAt: Date.now()
    };
    this._migrateOrReset(u);
    this._persist(u);
    onAuthUserChanged();
    return true;
  },

  /* Cleanly drop the session without touching the user's data.
     In Firebase mode we also sign out of the real Firebase session,
     otherwise a page reload would sign the user straight back in. */
  signOut() {
    if (this.mode === "firebase" && window.firebase && window.firebase.auth) {
      try { window.firebase.auth().signOut(); } catch (e) { /* noop */ }
    }
    this._persist(null);
    onAuthUserChanged();
  },

  /* Detect first-time sign-in and copy any existing guest/local
     data so the user doesn't lose their work. Only runs when a
     previous session left data under the old global keys. */
  _migrateOrReset(u) {
    const keys = ["subjects", "resources", "sessions", "studyGoal", "subjectGoals"];
    const hasGlobalData = keys.some(k => localStorage.getItem(k) != null);
    if (!hasGlobalData) return;

    const target = userKeyPrefix(u);
    const hasTargetData = keys.some(k => localStorage.getItem(target + k) != null);
    if (hasTargetData) return; // don't clobber an existing account

    keys.forEach(k => localStorage.setItem(target + k, localStorage.getItem(k)));
  }
};

/* ---------- Helpers ---------- */
function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

function nameFromEmail(email) {
  const raw = email.split("@")[0] || "Student";
  return raw
    .split(/[._-]+/)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ") || "Student";
}

function providerLabel(p) {
  return { google: "Google", facebook: "Facebook", github: "GitHub", password: "Email" }[p] || p;
}

function providerIcon(p) {
  return { google: "G", facebook: "f", github: "&lt;/&gt;", password: "✉" }[p] || "?";
}

/* ---------- Firebase (real) sign-in path ---------- */

/* Map Firebase error codes to friendly, actionable messages. */
function showAuthError(err) {
  const code = (err && err.code) || "";
  const cancelled = code === "auth/popup-closed-by-user" ||
                    code === "auth/cancelled-popup-request";
  if (cancelled) { showToast("Sign-in cancelled.", "info"); return; }

  const map = {
    "auth/unauthorized-domain":
      "This domain isn't allowlisted for sign-in yet. In the Firebase console open Authentication → Settings → Authorized domains, add this site's domain, then try again. (See AUTH-SETUP.md, step 4.)",
    "auth/operation-not-allowed":
      "This sign-in provider isn't enabled yet. In the Firebase console open Authentication → Sign-in method and enable it. (See AUTH-SETUP.md, step 3.)",
    "auth/popup-blocked":
      "Your browser blocked the sign-in window. Allow popups for this site and try again.",
    "auth/network-request-failed":
      "Network error — check your internet connection and try again.",
    "auth/user-disabled":
      "This account has been disabled.",
    "auth/email-already-in-use":
      "That email is already registered — try signing in instead, or use a different email.",
    "auth/weak-password":
      "That password is too weak — use at least 6 characters, ideally a mix of letters, numbers and symbols.",
    "auth/missing-password":
      "Enter your password to continue.",
    "auth/invalid-email":
      "That email address doesn't look right — double-check it and try again.",
    "auth/wrong-password":
      "Incorrect password — try again. If you forgot it, reset it from the Firebase console, or use a social login.",
    "auth/user-not-found":
      "No account found with that email — create an account first.",
    "auth/invalid-login-credentials":
      "That email or password is incorrect — try again.",
    "auth/too-many-requests":
      "Too many attempts — wait a minute before trying again.",
    "auth/credential-too-old-login-again":
      "For security, please sign in again.",
    "auth/invalid-api-key":
      "The Firebase API key is invalid — double-check firebase-config.js.",
    "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
      "The Firebase API key is invalid — double-check firebase-config.js."
  };
  if (map[code]) showToast(map[code], "error", 7000);
  else showToast(`Sign-in failed: ${err && err.message ? err.message : "unknown error"}`, "error", 6000);
  console.error("Auth error:", err);
}

/* Build our lightweight user object from a real Firebase user. */
function userFromFirebase(f, providerId) {
  // GitHub often hides the real email — fall back to a stable id.
  const email = (f.email || `user-${f.uid}@${providerId}.local`).toLowerCase();
  return {
    providerId,
    email,
    name: f.displayName || nameFromEmail(email),
    photoUrl: f.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(email)}`,
    real: true,
    uid: f.uid,
    loginAt: Date.now()
  };
}

async function firebaseSignIn(providerId) {
  // Sign-in windows simply don't exist on file:// pages — catch it early.
  if (location.protocol === "file:") {
    showToast("Sign-in can't run from a file (file://). Double-click start-server.bat in this folder, then open http://localhost:8000 and sign in there.", "error", 9000);
    return false;
  }
  if (!window.firebase || !window.firebase.auth) {
    showToast("Firebase SDK not loaded yet — try again in a second.", "error");
    return false;
  }
  try {
    const fb = window.firebase;
    const Provider = {
      google: fb.auth.GoogleAuthProvider,
      facebook: fb.auth.FacebookAuthProvider,
      github: fb.auth.GithubAuthProvider
    }[providerId];
    if (!Provider) throw new Error(`Unknown provider "${providerId}".`);

    const provider = new Provider();
    if (providerId === "github") {
      provider.addScope("read:user");
      provider.addScope("user:email");
    }
    if (providerId === "facebook") provider.addScope("email");
    if (providerId === "google") provider.addScope("email");

    let result;
    try {
      result = await fb.auth().signInWithPopup(provider);
    } catch (popupErr) {
      const c = popupErr && popupErr.code;
      // Popups can be blocked by the browser or unsupported in some
      // in-app browsers. A full-page redirect always works.
      if (c === "auth/popup-blocked" ||
          c === "auth/operation-not-supported-in-this-environment") {
        showToast("Popup blocked — opening the secure sign-in page…", "info");
        await fb.auth().signInWithRedirect(provider);
        return true; // page navigates away; result handled on return
      }
      throw popupErr;
    }

    const u = userFromFirebase(result.user, providerId);
    AuthManager._migrateOrReset(u);
    AuthManager._persist(u);
    onAuthUserChanged();
    const first = (result.user.displayName || "").split(" ")[0];
    showToast(`Welcome${first ? ", " + first : ""}! Signed in with ${providerLabel(providerId)}. 🔒`, "success");
    return true;
  } catch (err) {
    showAuthError(err);
    return false;
  }
}

/* ---------- Email/password login & sign-up ----------
   Real accounts use Firebase Auth (createUserWithEmailAndPassword /
   signInWithEmailAndPassword). In demo mode a local, offline account
   book backs the same form so Sign-up → Sign-in works with no backend. */

function demoHash(email, password) {
  const s = "study-tracker-demo::" + email.toLowerCase() + "::" + password;
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff;
  return "d$" + h;
}

function demoAccounts() {
  try {
    const raw = localStorage.getItem(DEMO_ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}

function saveDemoAccounts(acc) {
  try { localStorage.setItem(DEMO_ACCOUNTS_KEY, JSON.stringify(acc)); } catch (e) { /* storage blocked */ }
}

/* Build the app's user object for an email/password account. */
function buildPasswordUser(email, name, real) {
  const emailNorm = email.toLowerCase();
  return {
    providerId: "password",
    email: emailNorm,
    name: (name && name.trim()) || nameFromEmail(emailNorm),
    photoUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(emailNorm)}`,
    real,
    uid: real ? undefined : "demo:" + emailNorm,
    loginAt: Date.now()
  };
}

async function simulatedEmailSignUp(name, email, password) {
  const emailNorm = email.toLowerCase();
  const acc = demoAccounts();
  if (acc[emailNorm]) {
    showToast("That email is already registered — try signing in instead.", "error");
    return false;
  }
  acc[emailNorm] = {
    name: (name && name.trim()) || nameFromEmail(emailNorm),
    passHash: demoHash(emailNorm, password),
    createdAt: Date.now()
  };
  saveDemoAccounts(acc);
  await delay(350); // loading shimmer
  const u = buildPasswordUser(emailNorm, name, false);
  AuthManager._migrateOrReset(u);
  AuthManager._persist(u);
  onAuthUserChanged();
  showToast(`Welcome, ${u.name}! Demo account created — data stays in this browser.`, "success");
  return true;
}

async function simulatedEmailSignIn(email, password) {
  const emailNorm = email.toLowerCase();
  const acc = demoAccounts();
  const acct = acc[emailNorm];
  if (!acct) {
    showToast("No account found with that email — create one first.", "error");
    return false;
  }
  if (acct.passHash !== demoHash(emailNorm, password)) {
    showToast("Incorrect password — try again.", "error");
    return false;
  }
  await delay(350); // loading shimmer
  const u = buildPasswordUser(emailNorm, acct.name, false);
  AuthManager._migrateOrReset(u);
  AuthManager._persist(u);
  onAuthUserChanged();
  showToast(`Welcome back, ${u.name}! 👋`, "success");
  return true;
}

/* One-click demo sign-in: no typing, no Firebase — a single local account
   that exists the moment you click it. Perfect for trying the app before
   connecting a real Firebase project. */
async function quickDemoSignIn() {
  const email = "demo@studytracker.app";
  const password = "demo1234";
  const acc = demoAccounts();
  let name = "Demo Student";
  if (!acc[email]) {
    acc[email] = { name, passHash: demoHash(email, password), createdAt: Date.now() };
    saveDemoAccounts(acc);
  } else {
    name = acc[email].name || name;
  }
  await delay(350); // loading shimmer
  const u = buildPasswordUser(email, name, false);
  AuthManager._migrateOrReset(u);
  AuthManager._persist(u);
  onAuthUserChanged();
  showToast(`Signed in! Welcome, ${u.name} 👋 (demo account — data stays in this browser)`, "success");
  return true;
}

async function firebaseEmailSignUp(name, email, password) {
  if (location.protocol === "file:") {
    showToast("Sign-up can't run from a file (file://). Double-click start-server.bat in this folder, then open http://localhost:8000 and create your account there.", "error", 9000);
    return false;
  }
  if (!window.firebase || !window.firebase.auth) {
    showToast("Firebase SDK not loaded yet — try again in a second.", "error");
    return false;
  }
  try {
    const fb = window.firebase;
    const credential = await fb.auth().createUserWithEmailAndPassword(email.trim().toLowerCase(), password);
    const f = credential.user;
    if (name && name.trim()) {
      try { await f.updateProfile({ displayName: name.trim() }); } catch (e) { /* display name is optional */ }
    }
    const u = userFromFirebase(f, "password");
    AuthManager._migrateOrReset(u);
    AuthManager._persist(u);
    onAuthUserChanged();
    showToast(`Welcome, ${u.name}! Your account was created. 🔒`, "success");
    return true;
  } catch (err) {
    showAuthError(err);
    return false;
  }
}

async function firebaseEmailSignIn(email, password) {
  if (location.protocol === "file:") {
    showToast("Sign-in can't run from a file (file://). Double-click start-server.bat in this folder, then open http://localhost:8000 and sign in there.", "error", 9000);
    return false;
  }
  if (!window.firebase || !window.firebase.auth) {
    showToast("Firebase SDK not loaded yet — try again in a second.", "error");
    return false;
  }
  try {
    const fb = window.firebase;
    const credential = await fb.auth().signInWithEmailAndPassword(email.trim().toLowerCase(), password);
    const u = userFromFirebase(credential.user, "password");
    AuthManager._migrateOrReset(u);
    AuthManager._persist(u);
    onAuthUserChanged();
    const first = (u.name || "").split(" ")[0];
    showToast(`Welcome back${first ? ", " + first : ""}! Signed in with Email. 🔒`, "success");
    return true;
  } catch (err) {
    showAuthError(err);
    return false;
  }
}

/* Work out the provider behind a Firebase user. Social accounts carry a
   providerData entry (google.com / facebook.com / github.com); email/password
   accounts carry none (or "password"). */
function providerIdFromFirebaseUser(f) {
  if (!f) return "password";
  const known = ["google.com", "facebook.com", "github.com"];
  const used = (f.providerData || []).find(p => p && known.includes(p.providerId));
  return used ? used.providerId.replace(".com", "") : "password";
}

/* Flash an input red until the user types again. */
function markAuthFieldError(input) {
  if (!input) return;
  input.classList.add("input-error");
  input.addEventListener("input", () => input.classList.remove("input-error"), { once: true });
}

/* ---------- Auth screen ---------- */
function createAuthRoot() {
  const div = document.createElement("div");
  div.id = "authRoot";
  div.className = "auth-root";
  div.setAttribute("aria-live", "polite");
  document.body.prepend(div);
  return div;
}

function renderAuthScreen() {
  const shell = document.getElementById("appShell");
  if (shell) shell.style.display = "none";

  const authRoot = document.getElementById("authRoot") || createAuthRoot();
  authRoot.innerHTML = `
    <div class="auth-card">
      <div class="auth-brand" aria-hidden="true">🎓</div>
      <h1 class="auth-title">Study Tracker</h1>
      <p class="auth-sub">Sign in to save your progress and keep your streak alive.</p>

      <div class="auth-tabs" role="tablist" aria-label="Sign in or create account">
        <button type="button" class="auth-tab active" data-panel="signin" role="tab" aria-selected="true">Sign in</button>
        <button type="button" class="auth-tab" data-panel="signup" role="tab" aria-selected="false">Create account</button>
      </div>

      <form class="auth-form" id="authForm" novalidate>
        <div class="auth-field auth-signup-only">
          <label class="auth-label" for="authName">Your name <span class="auth-opt">(optional)</span></label>
          <input type="text" id="authName" class="auth-input" placeholder="e.g. Jordan Lee" autocomplete="name">
        </div>
        <div class="auth-field">
          <label class="auth-label" for="authEmail">Email</label>
          <input type="email" id="authEmail" class="auth-input" placeholder="you@school.edu" autocomplete="email" required>
        </div>
        <div class="auth-field">
          <label class="auth-label" for="authPassword">Password</label>
          <input type="password" id="authPassword" class="auth-input" placeholder="At least 6 characters" autocomplete="current-password" required>
          <p class="auth-hint">Use at least 6 characters — make it one only you know.</p>
        </div>
        <button type="submit" class="auth-submit" id="authSubmit">Sign in</button>
        <p class="auth-switch">
          <span id="authSwitchText">Don't have an account?</span>
          <button type="button" class="auth-switch-btn" id="authSwitch">Create one free</button>
        </p>
      </form>

      ${AuthManager.mode !== "firebase" ? `
      <div class="auth-demo-wrap">
        <button type="button" class="auth-demo-quick" id="demoQuickSignin">⚡ Instant demo sign-in — no account or setup needed</button>
      </div>` : ""}

      <div class="auth-divider"><span>or continue with</span></div>

      <button class="auth-btn auth-google" data-provider="google" title="Continue with Google">
        <span class="auth-btn-icon" aria-hidden="true">G</span>
        <span class="auth-btn-text">Continue with Google</span>
      </button>
      <button class="auth-btn auth-facebook" data-provider="facebook" title="Continue with Facebook">
        <span class="auth-btn-icon" aria-hidden="true">f</span>
        <span class="auth-btn-text">Continue with Facebook</span>
      </button>
      <button class="auth-btn auth-github" data-provider="github" title="Continue with GitHub">
        <span class="auth-btn-icon" aria-hidden="true">&lt;/&gt;</span>
        <span class="auth-btn-text">Continue with GitHub</span>
      </button>

      ${AuthManager.mode === "firebase" ? `
      <div class="auth-meta">
        <span>🔒 Secured by Firebase — real accounts only</span>
      </div>` : `
      <div class="auth-setup-note">
        <p class="auth-setup-title">⚡ Demo mode — real sign-in isn't set up yet</p>
        <p class="auth-setup-sub">The form above and the buttons below run a <b>demo</b> — accounts are saved in this browser only. To use your <b>real</b> email/password, Google, Facebook or GitHub account, connect a free Firebase project (about 10&nbsp;minutes, once).</p>
        <button type="button" class="auth-setup-btn" id="openSetupGuide">⚙️&nbsp; Enable real sign-in</button>
      </div>
      <div class="auth-meta">
        <span>🛡️ Works offline — data stays on this device</span>
      </div>`}
    </div>`;

  document.body.classList.add("auth-screen");
  document.body.classList.remove("auth-signed-in");

  /* --- Sign in / Create account panel switching --- */
  const setPanel = which => {
    const isSignup = which === "signup";
    authRoot.querySelectorAll(".auth-tab").forEach(t => {
      const on = t.dataset.panel === which;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    authRoot.querySelector(".auth-signup-only").style.display = isSignup ? "" : "none";
    const submit = authRoot.querySelector("#authSubmit");
    submit.textContent = isSignup ? "Create free account" : "Sign in";
    const st = document.getElementById("authSwitchText");
    if (st) st.textContent = isSignup ? "Already have an account?" : "Don't have an account?";
    const sw = document.getElementById("authSwitch");
    if (sw) sw.textContent = isSignup ? "Sign in instead" : "Create one free";
    authRoot.dataset.panel = which;
  };
  setPanel("signin");

  authRoot.querySelectorAll(".auth-tab").forEach(t =>
    t.addEventListener("click", () => setPanel(t.dataset.panel)));
  document.getElementById("authSwitch").addEventListener("click", () =>
    setPanel(authRoot.dataset.panel === "signup" ? "signin" : "signup"));

  /* --- One-click demo sign-in (demo mode only) --- */
  const quickBtn = document.getElementById("demoQuickSignin");
  if (quickBtn) quickBtn.addEventListener("click", async () => {
    quickBtn.classList.add("loading");
    quickBtn.disabled = true;
    const original = quickBtn.textContent;
    quickBtn.textContent = "Signing you in…";
    try { await quickDemoSignIn(); } finally {
      quickBtn.classList.remove("loading");
      quickBtn.disabled = false;
      if (document.getElementById("authRoot")) quickBtn.textContent = original;
    }
  });

  /* --- Email/password form submission --- */
  const form = authRoot.querySelector("#authForm");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const isSignup = authRoot.dataset.panel === "signup";
    const submit = authRoot.querySelector("#authSubmit");
    const name = authRoot.querySelector("#authName").value.trim();
    const email = authRoot.querySelector("#authEmail").value.trim();
    const password = authRoot.querySelector("#authPassword").value;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      markAuthFieldError(authRoot.querySelector("#authEmail"));
      showToast("Enter a valid email address to continue.", "error");
      return;
    }
    if (password.length < 6) {
      markAuthFieldError(authRoot.querySelector("#authPassword"));
      showToast("Password needs at least 6 characters.", "error");
      return;
    }
    if (isSignup && name.length > 60) {
      markAuthFieldError(authRoot.querySelector("#authName"));
      showToast("Keep your name under 60 characters (or leave it blank).", "error");
      return;
    }

    submit.classList.add("loading");
    submit.disabled = true;
    submit.textContent = AuthManager.mode === "firebase"
      ? (isSignup ? "Creating account…" : "Signing in…")
      : (isSignup ? "Creating demo account…" : "Signing in demo…");
    try {
      if (AuthManager.mode === "firebase") {
        if (isSignup) await firebaseEmailSignUp(name, email, password);
        else await firebaseEmailSignIn(email, password);
      } else {
        if (isSignup) await simulatedEmailSignUp(name, email, password);
        else await simulatedEmailSignIn(email, password);
      }
    } finally {
      submit.classList.remove("loading");
      submit.disabled = false;
      // On success onAuthUserChanged() already replaced this screen.
      if (document.getElementById("authRoot")) setPanel(isSignup ? "signup" : "signin");
    }
  });

  authRoot.querySelectorAll("[data-provider]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const provider = btn.dataset.provider;
      btn.classList.add("loading");
      btn.disabled = true;
      try {
        if (AuthManager.mode === "firebase") {
          await firebaseSignIn(provider);
        } else {
          await AuthManager.signInWithProvider(provider);
        }
      } finally {
        btn.classList.remove("loading");
        btn.disabled = false;
      }
    });
  });

  const setupBtn = document.getElementById("openSetupGuide");
  if (setupBtn) setupBtn.addEventListener("click", openSetupGuide);
}

/* ---------- "Enable real sign-in" guide + config paste box ---------- */
function openSetupGuide() {
  closeModal();
  const old = document.getElementById("setupOverlay");
  if (old) old.remove();

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay show setup-overlay";
  overlay.id = "setupOverlay";
  overlay.innerHTML = `
    <div class="modal setup-modal" role="dialog" aria-modal="true" aria-label="Enable real sign-in">
      <button class="modal-close" type="button" aria-label="Close">✕</button>
      <h2 class="setup-title">⚙️ Enable real sign-in</h2>
      <ol class="setup-steps">
        <li><b>Create a free Firebase project</b> at
          <a href="https://console.firebase.google.com" target="_blank" rel="noopener">console.firebase.google.com</a>.</li>
        <li><b>Build → Authentication → Get started</b> → enable <b>Google</b>, <b>Facebook</b> and <b>GitHub</b>.
          Facebook &amp; GitHub need an App ID + Secret from their developer sites — exact clicks in
          <a href="AUTH-SETUP.md" target="_blank" rel="noopener">AUTH-SETUP.md</a>, step 3.</li>
        <li><b>⚙️ Project settings → Your apps → Web (&lt;/&gt;)</b> → copy the <code>firebaseConfig</code> object.</li>
        <li><b>Paste it below</b> → Save. Real sign-in turns on immediately in this browser.</li>
      </ol>
      <textarea id="setupConfig" class="setup-config" rows="7" spellcheck="false"
        placeholder='Paste the whole firebaseConfig here, e.g.&#10;{&#10;  "apiKey": "AIzaSy...",&#10;  "authDomain": "your-project.firebaseapp.com",&#10;  "projectId": "your-project",&#10;  "storageBucket": "your-project.appspot.com",&#10;  "messagingSenderId": "1234567890",&#10;  "appId": "1:1234567890:web:abc123"&#10;}'></textarea>
      <div class="setup-actions">
        <button type="button" class="auth-setup-btn" id="setupSave">💾&nbsp; Save &amp; reload</button>
        ${localStorage.getItem("st_firebase_config") ? '<button type="button" class="setup-remove" id="setupRemove">🗑&nbsp; Remove saved config (back to demo)</button>' : ""}
      </div>
      <p class="setup-foot">⚠️ Sign-in windows need <b>http(s)</b>: double-click <b>start-server.bat</b> in this folder and open <code>http://localhost:8000</code> (or use the VS Code "Live Server" extension). Full guide: <a href="AUTH-SETUP.md" target="_blank" rel="noopener">AUTH-SETUP.md</a> · <a href="SETUP-WIZARD.html" target="_blank" rel="noopener">🧙 Interactive wizard</a></p>
    </div>`;

  document.body.appendChild(overlay);
  document.body.classList.add("no-scroll");

  // Running from a file? The saved config + sign-in windows need http://.
  if (location.protocol === "file:") {
    const warn = document.createElement("div");
    warn.className = "setup-filewarn";
    warn.innerHTML = "⚠️ <b>You opened the app as a file (file://) — sign-in windows can't work this way.</b><br>Double-click <b>start-server.bat</b> in this folder, then open <b>http://localhost:8000</b> and paste your config there (it saves per-address).";
    overlay.querySelector(".setup-modal").prepend(warn);
  }

  const close = () => { overlay.remove(); document.body.classList.remove("no-scroll"); };
  overlay.querySelector(".modal-close").addEventListener("click", close);
  overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
  overlay.querySelector("#setupSave").addEventListener("click", saveFirebaseConfigFromSetup);
  const removeBtn = overlay.querySelector("#setupRemove");
  if (removeBtn) removeBtn.addEventListener("click", () => {
    localStorage.removeItem("st_firebase_config");
    showToast("Saved config removed — reloading in demo mode.", "info");
    reloadApp();
  });
}

/* Parse the pasted firebaseConfig (tolerates it being wrapped in
   `window.FIREBASE_CONFIG = …;`) and validate the required keys. */
function parseFirebaseConfigInput(raw) {
  const text = (raw || "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (!text || start === -1 || end <= start) {
    return { ok: false, error: "Couldn't find a { … } config block in what you pasted." };
  }
  try {
    const cfg = JSON.parse(text.slice(start, end + 1));
    const missing = ["apiKey", "authDomain", "projectId", "appId"].filter(k => !cfg[k]);
    if (missing.length) {
      return { ok: false, error: `That config is missing: ${missing.join(", ")}. Copy the whole block from Project settings.` };
    }
    return { ok: true, cfg };
  } catch (e) {
    return { ok: false, error: "That isn't valid JSON — copy the whole firebaseConfig block exactly from Firebase." };
  }
}

function saveFirebaseConfigFromSetup() {
  const ta = document.getElementById("setupConfig");
  const res = parseFirebaseConfigInput(ta && ta.value);
  if (!res.ok) {
    showToast(res.error, "error", 6000);
    return false;
  }
  try {
    localStorage.setItem("st_firebase_config", JSON.stringify(res.cfg));
  } catch (e) {
    showToast("Couldn't save the config (storage blocked?).", "error");
    return false;
  }
  showToast("Config saved! Reloading with real sign-in enabled… 🔒", "success");
  reloadApp();
  return true;
}

function reloadApp() {
  setTimeout(() => location.reload(), 900);
}

/* Swap from the auth screen to the app shell. */
function showApp() {
  const authRoot = document.getElementById("authRoot");
  if (authRoot) authRoot.remove();
  document.body.classList.remove("auth-screen");
  const shell = document.getElementById("appShell");
  if (shell) shell.style.display = "";
}

/* ---------- Provider login popup (simulated mode) ----------
   Mimics the provider OAuth window: a mini popup with a form.
   Resolves with the chosen email, or null if cancelled.      */
function showProviderPopup(provider) {
  return new Promise(resolve => {
    closeModal();
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay provider-popup-overlay";

    const isFacebook = provider === "facebook";
    overlay.innerHTML = `
      <div class="modal provider-popup" role="dialog" aria-modal="true" aria-label="Sign in with ${providerLabel(provider)}">
        <button class="modal-close" type="button" aria-label="Close">✕</button>
        <div class="provider-popup-head">
          <div class="provider-popup-logo ${provider}" aria-hidden="true">${isFacebook ? "f" : provider === "github" ? "&lt;/&gt;" : "G"}</div>
          <p class="provider-popup-title">Sign in with ${providerLabel(provider)}</p>
          <p class="provider-popup-sub">to continue to Study Tracker</p>
        </div>
        <div class="provider-popup-form">
          <input type="email" id="providerEmail" class="provider-input"
                 placeholder="Your email (demo)" autocomplete="email"
                 value="student@${provider}.example.com"
                 aria-label="${providerLabel(provider)} email">
          <button class="provider-popup-cta ${provider}" data-cta>Continue</button>
        </div>
        <p class="provider-popup-foot">🔒 Demo popup — no real ${providerLabel(provider)} account is contacted.</p>
      </div>`;

    document.body.appendChild(overlay);
    const input = overlay.querySelector("#providerEmail");
    document.body.classList.add("no-scroll");

    function done() {
      overlay.remove();
      document.body.classList.remove("no-scroll");
    }

    overlay.querySelector(".modal-close").addEventListener("click", () => { done(); resolve(null); });
    overlay.addEventListener("click", e => {
      if (e.target === overlay) { done(); resolve(null); }
    });
    overlay.querySelector("[data-cta]").addEventListener("click", () => {
      const email = input.value.trim();
      if (!email || !email.includes("@")) {
        input.classList.add("input-error");
        showToast("Enter a valid email to continue.", "error");
        return;
      }
      done();
      resolve(email);
    });
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        overlay.querySelector("[data-cta]").click();
      }
    });
    setTimeout(() => input.focus(), 50);
  });
}

/* ---------- Auth state router ----------
   Called whenever auth state changes: show the right screen and
   refresh every piece of UI that depends on the user. */
function onAuthUserChanged() {
  if (!AuthManager.currentUser) {
    updateAuthBar(); // clears the sidebar chip
    renderAuthScreen();
    return;
  }
  showApp();
  updateAuthBar();
  if (typeof updateGreetingAndClock === "function") updateGreetingAndClock();
  if (typeof init === "function") init();
}

/* ---------- Sidebar user chip + menu ---------- */
function updateAuthBar() {
  const bar = document.getElementById("authBar");
  if (!bar) return;
  const u = AuthManager.currentUser;
  if (!u) { bar.innerHTML = ""; return; }
  bar.innerHTML = `
    <div class="user-chip-wrap">
      <button class="user-chip" id="userChip" onclick="toggleUserMenu()" title="Account">
        <img class="user-chip-avatar" src="${escapeHtml(u.photoUrl || "")}" alt="" crossorigin="anonymous">
        <span class="user-chip-name">${escapeHtml(u.name || "Student")}</span>
        <span class="user-chip-provider">${providerLabel(u.providerId)}</span>
      </button>
      <div class="user-menu" id="userMenu">
        <div class="user-menu-head">
          <img class="user-menu-avatar" src="${escapeHtml(u.photoUrl || "")}" alt="" crossorigin="anonymous">
          <div>
            <span class="user-menu-name">${escapeHtml(u.name || "Student")}</span>
            <span class="user-menu-email">${escapeHtml(u.email)}</span>
          </div>
        </div>
        <div class="user-menu-label">Signed in with ${providerLabel(u.providerId)}${u.real ? " 🔒" : " (demo)"}</div>
        <button class="user-menu-logout" onclick="logout()">🚪 &nbsp;Log out</button>
      </div>
    </div>`;
}

function toggleUserMenu() {
  const menu = document.getElementById("userMenu");
  if (menu) menu.classList.toggle("open");
}

function closeUserMenu() {
  const menu = document.getElementById("userMenu");
  if (menu) menu.classList.remove("open");
}

function logout() {
  closeUserMenu();
  AuthManager.signOut();
  showToast("Signed out. See you soon! 👋", "info");
}

document.addEventListener("click", e => {
  const menu = document.getElementById("userMenu");
  if (menu && menu.classList.contains("open") && !e.target.closest(".user-chip-wrap")) {
    menu.classList.remove("open");
  }
});

/* ---------- Bootstrap (loads Firebase SDK only if configured) ---------- */
function loadFirebaseAndStart() {
  if (!window.FIREBASE_CONFIG) {
    AuthManager.init();
    onAuthUserChanged();
    return;
  }
  const load = src => new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error("Failed to load " + src));
    document.head.appendChild(s);
  });
  (async () => {
    try {
      if (!window.firebase) await load("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
      if (!window.firebase || !window.firebase.apps || !window.firebase.apps.length) {
        if (!window.firebase || !window.firebase.initializeApp) throw new Error("Firebase app SDK missing.");
        window.firebase.initializeApp(window.FIREBASE_CONFIG);
      }
      if (!window.firebase.auth) await load("https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js");
      AuthManager.mode = "firebase";
    } catch (err) {
      console.error("Firebase init failed, falling back to simulated auth.", err);
      AuthManager.mode = "simulated";
    } finally {
      AuthManager.init();
      onAuthUserChanged();
      if (AuthManager.mode === "firebase") attachFirebaseAuthListeners();
    }
  })();
}

/* Keep our app in sync with the real Firebase session. This fires
   on page load, when a full-page redirect sign-in returns, and on
   sign-out — so the UI always matches the real account state. */
function attachFirebaseAuthListeners() {
  const fb = window.firebase;
  if (!fb || !fb.auth) return;

  fb.auth().onAuthStateChanged(firebaseUser => {
    if (firebaseUser) {
      // Work out which provider they actually used (social OAuth or email/password).
      const providerId = providerIdFromFirebaseUser(firebaseUser);
      const u = userFromFirebase(firebaseUser, providerId);

      // Keep the original login timestamp if it's the same session.
      const prev = AuthManager.currentUser;
      if (prev && prev.real && prev.uid === u.uid && prev.providerId === u.providerId) {
        u.loginAt = prev.loginAt;
      }
      AuthManager._migrateOrReset(u); // safe: skips if account already has data
      AuthManager._persist(u);
      onAuthUserChanged();
    } else if (AuthManager.currentUser && AuthManager.currentUser.real) {
      // Signed out on Firebase's side — clear the local session too.
      AuthManager._persist(null);
      onAuthUserChanged();
    }
  });

  // Surface errors from full-page redirect sign-ins (popup fallback).
  fb.auth().getRedirectResult().catch(showAuthError);
}

function startAuth() {
  loadFirebaseAndStart();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startAuth);
} else {
  startAuth();
}



