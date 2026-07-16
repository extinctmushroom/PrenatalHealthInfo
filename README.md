# 🌿 Willow — Preconception Health Guide & Dashboard

An evidence-based **knowledge base, guide, and personal dashboard** for women
preparing their bodies before pregnancy. Willow turns trustworthy preconception
science — hormone optimization, nutrition, exercise, and vitamins — into clear
reading and daily, trackable habits.

> **Educational only — not medical advice.** Every recommendation is sourced to
> ACOG, the CDC, the NIH Office of Dietary Supplements, the WHO, and
> peer-reviewed research. Always consult your own clinician.

**Live site:** enable GitHub Pages (see below), then visit
`https://<your-username>.github.io/PrenatalHealthInfo/`

---

## ✨ Features

- **The Guide** — a fully-cited walkthrough across six chapters:
  1. Preconception basics (checkups, folic acid timing, the 90-day window)
  2. **Hormone optimization** — insulin/blood sugar, thyroid, cortisol, sleep, body composition, endocrine disruptors — what's actually in your control
  3. Nutrition & diet
  4. Exercise & movement (with PCOS-specific guidance)
  5. Vitamins & supplements (doses + food sources table)
  6. Sleep, stress & environment
- **Personal dashboard** (account-gated):
  - Weekly **exercise tracker** with an inline SVG bar chart + workout suggestions
  - **Supplement checklist** with evidence-based daily targets
  - **Diet / meal** logging with nutrient-focused meal ideas
  - Water tracker and daily notes (energy, sleep, cycle, symptoms)
  - Progress **rings** and stat tiles against weekly goals (150 min movement, 2 strength sessions)
- **Firebase Authentication** (email + password) with a username display name
- **Cloud Firestore** for private, per-user tracking data
- Light/dark theme, responsive, no build step
- Runs in a local **demo mode** (browser storage) before Firebase is configured, so you can preview everything immediately

---

## 🗂️ Project structure

```
.
├── index.html          # Landing page
├── guide.html          # The sourced knowledge base (6 chapters + references)
├── dashboard.html      # Account-gated tracking dashboard
├── login.html          # Sign in / create account
├── about.html          # About, sourcing method, privacy, disclaimer
├── css/
│   └── styles.css      # Design system (light/dark)
├── js/
│   ├── layout.js       # Shared header/footer, theme toggle, nav
│   ├── firebase-config.js  # ← put your Firebase keys here
│   ├── firebase-init.js    # Shared Firebase app/auth/db instance
│   ├── auth.js         # Sign in / sign up / route guard
│   ├── dashboard.js    # Trackers, rings, weekly chart, Firestore/local storage
│   └── content.js      # Supplement checklist, exercise & meal suggestions
├── firestore.rules     # Security rules (paste into Firebase console)
├── .github/workflows/pages.yml  # Auto-deploy to GitHub Pages
├── .nojekyll
└── README.md
```

---

## 🔐 Firebase setup (accounts + tracking)

The site works in **demo mode** without any setup. To enable real accounts that
sync across devices:

1. Create a project at <https://console.firebase.google.com>.
2. **Add a Web App** (`</>` icon) and copy its config object.
3. Paste the values into [`js/firebase-config.js`](js/firebase-config.js):
   ```js
   export const firebaseConfig = {
     apiKey: "…",
     authDomain: "yourproject.firebaseapp.com",
     projectId: "yourproject",
     storageBucket: "yourproject.appspot.com",
     messagingSenderId: "…",
     appId: "…",
   };
   ```
   > These web keys are **not secrets** — Firebase web API keys are designed to be
   > public. Your data is protected by Firestore **security rules**, not the key.
4. **Authentication → Sign-in method →** enable **Email/Password**.
5. **Firestore Database →** create a database (start in production mode), then
   open the **Rules** tab and paste the contents of
   [`firestore.rules`](firestore.rules) and **Publish**.
6. **Authentication → Settings → Authorized domains →** add your GitHub Pages
   domain (e.g. `your-username.github.io`) so sign-in works on the live site.

That's it — sign-up, sign-in, password reset, and per-user tracking now work.

---

## 🚀 Deploy to GitHub Pages

**Option A — GitHub Actions (recommended, included):**
1. Push to the `main` branch.
2. Repo **Settings → Pages → Build and deployment → Source: “GitHub Actions.”**
3. The included [`pages.yml`](.github/workflows/pages.yml) workflow publishes the
   site automatically on every push to `main`.

**Option B — Branch source:**
Repo **Settings → Pages →** Source: *Deploy from a branch* → `main` / root.

---

## 🧪 Run locally

It's a static site — any static server works:

```bash
# Python
python3 -m http.server 8000
# then open http://localhost:8000
```

> Use a local server rather than opening `index.html` from the file system, so
> the ES module imports and Firebase SDK load correctly.

---

## ⚕️ Disclaimer

Willow summarizes public health guidance and research for **education only**. It
is not medical advice, diagnosis, or treatment, and creates no clinician–patient
relationship. Guidelines evolve and individual circumstances vary — always
consult a qualified healthcare professional about your own care. See the full
[references](guide.html#references) and [disclaimer](about.html#disclaimer).
