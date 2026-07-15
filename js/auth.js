/* Authentication: header auth slot, login/signup page, route guard.
   Uses Firebase Email/Password. "Username" is stored as the display name;
   the email address is the login identifier (Firebase's canonical method).
   The Firebase SDK is loaded lazily and only when configured. */
import { initFirebase, isConfigured } from "./firebase-init.js";

const base = document.body.dataset.base || "";
const configured = isConfigured();
const { auth, authMod, loadError } = await initFirebase();

/* ---------- Header auth slot ---------- */
function paintAuthSlot(user) {
  const slot = document.getElementById("authSlot");
  if (!slot) return;
  if (user) {
    const name = user.displayName || user.email.split("@")[0];
    slot.innerHTML =
      `<a href="${base}dashboard.html" class="btn btn-ghost btn-sm" title="${escapeHtml(user.email)}">${escapeHtml(name)}</a>
       <button class="btn btn-sm" id="signOutBtn"
         style="background:var(--surface-2);color:var(--ink-2);border:1px solid var(--line)">Sign out</button>`;
    const so = document.getElementById("signOutBtn");
    if (so) so.addEventListener("click", async () => { await authMod.signOut(auth); location.href = base + "index.html"; });
  } else {
    slot.innerHTML = `<a href="${base}login.html" class="btn btn-primary btn-sm">Sign in</a>`;
  }
}

/* ---------- Auth-state wiring ---------- */
if (configured && auth) {
  authMod.onAuthStateChanged(auth, (user) => {
    paintAuthSlot(user);
    document.dispatchEvent(new CustomEvent("willow-auth", { detail: { user } }));
    if (document.body.dataset.requiresAuth === "true" && !user) {
      location.replace(base + "login.html?next=dashboard");
    }
  });
} else {
  paintAuthSlot(null);
  document.dispatchEvent(new CustomEvent("willow-auth", { detail: { user: null, unconfigured: true } }));
}

/* ---------- Login page controller ---------- */
const loginForm = document.getElementById("authForm");
if (loginForm) initLoginPage();

function initLoginPage() {
  const tabs = document.querySelectorAll(".auth-tabs button");
  const nameField = document.getElementById("field-name");
  const submitBtn = document.getElementById("authSubmit");
  const msg = document.getElementById("authMsg");
  const forgot = document.getElementById("forgotLink");
  let mode = "signin";

  if (!configured || !auth) {
    showMsg(loadError
      ? "We couldn't reach the sign-in service — check your connection and refresh. Your dashboard still works in this browser meanwhile."
      : "Firebase isn't configured yet. Add your project keys in <code>js/firebase-config.js</code> to enable accounts. You can still browse the full guide and try the dashboard in demo mode.", "error");
    submitBtn.disabled = true;
  }

  tabs.forEach(t => t.addEventListener("click", () => {
    mode = t.dataset.mode;
    tabs.forEach(x => x.classList.toggle("active", x === t));
    nameField.classList.toggle("hidden", mode !== "signup");
    submitBtn.textContent = mode === "signup" ? "Create account" : "Sign in";
    // Hint password managers correctly: new password on signup, saved one on sign-in.
    document.getElementById("password").setAttribute("autocomplete", mode === "signup" ? "new-password" : "current-password");
    hideMsg();
  }));

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!configured || !auth) return;
    hideMsg();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const username = document.getElementById("username").value.trim();
    submitBtn.disabled = true;
    submitBtn.textContent = "Please wait…";
    try {
      if (mode === "signup") {
        if (username.length < 2) throw { code: "custom/name", message: "Please choose a username (2+ characters)." };
        const cred = await authMod.createUserWithEmailAndPassword(auth, email, password);
        await authMod.updateProfile(cred.user, { displayName: username });
      } else {
        await authMod.signInWithEmailAndPassword(auth, email, password);
      }
      const params = new URLSearchParams(location.search);
      location.href = base + (params.get("next") ? params.get("next") + ".html" : "dashboard.html");
    } catch (err) {
      showMsg(friendlyError(err), "error");
      submitBtn.disabled = false;
      submitBtn.textContent = mode === "signup" ? "Create account" : "Sign in";
    }
  });

  if (forgot) forgot.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!configured || !auth) return;
    const email = document.getElementById("email").value.trim();
    if (!email) { showMsg("Enter your email above first, then tap “Forgot password”.", "error"); return; }
    try {
      await authMod.sendPasswordResetEmail(auth, email);
      showMsg("Password reset email sent — check your inbox.", "ok");
    } catch (err) { showMsg(friendlyError(err), "error"); }
  });

  function showMsg(html, kind) { msg.innerHTML = html; msg.className = "auth-msg show " + kind; }
  function hideMsg() { msg.className = "auth-msg"; }
}

function friendlyError(err) {
  const map = {
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/email-already-in-use": "An account already exists with that email. Try signing in.",
    "auth/weak-password": "Password should be at least 6 characters.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Email or password is incorrect.",
    "auth/too-many-requests": "Too many attempts — please wait a moment and try again.",
    "custom/name": err.message,
  };
  return map[err.code] || (err.message || "Something went wrong. Please try again.");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
