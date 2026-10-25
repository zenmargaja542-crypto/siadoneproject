// ============================================================
//   FIREBASE CONFIG — REAL sign-in with Google / Facebook / GitHub
//   ------------------------------------------------------------
//   The app ships in DEMO mode (works offline, session stored in
//   this browser only). To sign in with REAL accounts:
//
//     1. Create a free project at https://console.firebase.google.com
//     2. Build → Authentication → Get started → enable Email/Password
//        (usually already on) and Google, Facebook and GitHub (see
//        AUTH-SETUP.md for the exact clicks, App IDs and secrets
//        for Facebook/GitHub).
//     3. Project Overview → ⚙️ Project settings → "Your apps" →
//        Web app (</>) → copy the firebaseConfig object.
//     4. Paste it below (replace the `null`) and save this file.
//     5. Serve the app over http(s) — localhost, GitHub Pages or
//        Firebase Hosting. Sign-in popups don't work on file://.
//
//   Full step-by-step guide → AUTH-SETUP.md
//   ============================================================
window.FIREBASE_CONFIG = null;

// If you saved a config through the app's "⚙️ Enable real sign-in"
// panel, it lives in this browser's storage and activates here.
try {
  if (!window.FIREBASE_CONFIG) {
    const saved = localStorage.getItem("st_firebase_config");
    if (saved) window.FIREBASE_CONFIG = JSON.parse(saved);
  }
} catch (e) { /* storage unavailable — stay in demo mode */ }

// Example — replace the `null` above with something like this:
// window.FIREBASE_CONFIG = {
//   apiKey: "AIzaSy...",
//   authDomain: "your-project.firebaseapp.com",
//   projectId: "your-project",
//   storageBucket: "your-project.appspot.com",
//   messagingSenderId: "1234567890",
//   appId: "1:1234567890:web:abcdef"
// };