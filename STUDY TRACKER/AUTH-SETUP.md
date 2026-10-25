# 🔐 Real Sign-In Setup — Google (Gmail), Facebook & GitHub

This app supports **real account sign-in** through **Firebase Authentication**
(the free tier is enough). Firebase performs the actual OAuth handshake with
each provider, so you never touch passwords and the app stays a static site.

> ⚠️ GitHub does not allow browser-only OAuth (it requires a server-side
> secret), which is exactly why we use Firebase — it acts as that secure
> middleman for all three providers.

**Time needed: ~10 minutes. You only do this once.**

> 🧙 **Easiest path:** open **`SETUP-WIZARD.html`** (double-click it) — it walks
> you through these steps with checkboxes, direct console links, generates your
> exact callback URLs, and activates the config for you at the end.

---

## 1) Create a Firebase project (free)

1. Go to <https://console.firebase.google.com> and sign in with your Google account.
2. Click **"Add project"** → name it (e.g. `study-tracker`) → **Continue**.
3. Google Analytics is optional — either way, click **Create project**.

## 2) Register the web app and copy the config

1. On the project overview page click the **Web** icon (`</>`).
2. Nickname: `study-tracker` → **Register app** (skip Hosting for now).
3. Firebase shows a `firebaseConfig` block — **copy it**.
4. Open `firebase-config.js` in this project and replace
   `window.FIREBASE_CONFIG = null;` with your real config, e.g.:

```js
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSy...",
  authDomain: "study-tracker-xxxxx.firebaseapp.com",
  projectId: "study-tracker-xxxxx",
  storageBucket: "study-tracker-xxxxx.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};
```

> 💡 **No-code option:** instead of editing the file, click **"⚙️ Enable real
> sign-in"** on the app's login screen and paste the same `firebaseConfig`
> into the box — it's saved in that browser and can be removed from the
> same panel.

## 3) Turn on the sign-in providers

Open **Build → Authentication → Get started**, then:

### Email/Password (sign-up & log-in forms)
- Click **Email/Password** → **Enable** → **Save** (it's usually already on).
  This powers the **"Create account"** and **"Sign in"** forms on the app's login
  screen — the standard email + password sign-up/log-in flow.

### Google (Gmail) — easiest
- Click **Google** → toggle **Enable** → pick a support email → **Save**. Done ✅

### Facebook
1. Go to <https://developers.facebook.com> → **My Apps → Create App**.
   Use case: *Build something else* → App type **Consumer** → **Create**.
2. In the app dashboard add the **Facebook Login** product.
3. **Settings → Basic**: copy the **App ID** and **App Secret**.
4. Back in Firebase → Authentication → Sign-in method → **Facebook** →
   **Enable** → paste the App ID + App Secret → **Save**.
5. Firebase shows a callback URI like
   `https://<YOUR-PROJECT-ID>.firebaseapp.com/__/auth/handler` — copy it.
   In the Facebook app open **Facebook Login → Settings → Valid OAuth
   Redirect URIs**, paste it there → **Save changes**.
6. In **Settings → Basic** set **App Domains** to your site domain and add a
   **Privacy Policy URL** (a simple placeholder page is fine while testing).
7. While the app is in **Development mode**, only your own accounts can log
   in. Flip it **Live** (top bar) to allow anyone.

### GitHub
1. On GitHub: **Settings → Developer settings → OAuth Apps → New OAuth App**
   (<https://github.com/settings/developers>).
2. Fill in:
   - **Application name**: `Study Tracker`
   - **Homepage URL**: your site URL, e.g. `https://yourname.github.io/study-tracker`
   - **Authorization callback URL**: `https://<YOUR-PROJECT-ID>.firebaseapp.com/__/auth/handler`
3. **Register application** → copy the **Client ID** → **Generate a new
   client secret** → copy it too.
4. In Firebase → Authentication → Sign-in method → **GitHub** → **Enable** →
   paste the Client ID + Client Secret → **Save**.

## 4) Allowlist your domains

**Authentication → Settings → Authorized domains → Add domain**:

| Where you host | Domain to add |
|---|---|
| Local test server | `localhost` (usually already present) |
| GitHub Pages | `yourname.github.io` |
| Firebase Hosting | `your-project.web.app` (usually already present) |

## 5) Run the app over http(s)

Sign-in popups **do not work from `file://`**. Use one of:

- **Easiest:** double-click **`start-server.bat`** in this folder → open <http://localhost:8000>
  (a tiny built-in server — nothing to install), or
- **VS Code Live Server** extension → right-click `index.html` → "Open with Live Server", or
- Deploy to GitHub Pages / Firebase Hosting and open the live URL.

Click any provider button → the real provider window opens → after approving,
you're signed in with your **real name, email and avatar**. 🔒

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `This domain isn't allowlisted…` | Add your domain in Authentication → Settings → Authorized domains (step 4). |
| `This sign-in provider isn't enabled…` | Enable that provider in Authentication → Sign-in method (step 3). |
| Popup vanishes / nothing happens | Allow popups for the site; the app auto-falls back to a full-page redirect. |
| Facebook: "URL Blocked" | The redirect URI in Facebook Login settings must match Firebase's handler URL exactly (https included). |
| GitHub: `redirect_uri_mismatch` | The OAuth App callback URL must be exactly `https://<project>.firebaseapp.com/__/auth/handler`. |
| Signed out after every reload | You opened the app via `file://` or the Firebase SDK failed to load — check the browser console. |
| `Invalid Firebase API key` | The pasted `firebaseConfig` is wrong — copy it again from Project settings. |

## How accounts & data work

- Firebase stores only your **identity** (name/email/avatar + which provider).
- Your subjects, sessions, and stats live in this browser's localStorage,
  **namespaced per account** (`st_uid:<provider>:<email>___…`), so two people
  on the same computer keep separate data, and logging out never deletes it.
- If `firebase-config.js` is left as `null`, the app automatically uses
  **demo mode** so it still works offline.

