/* Dashboard: exercise, supplements, water, meals, notes trackers.
   Persists to Firestore when configured + signed in; otherwise runs in a
   local "demo mode" (localStorage) so the page is still explorable — with no
   dependency on the Firebase CDN. */
import { initFirebase } from "./firebase-init.js";
import { DEFAULT_SUPPLEMENTS, EXERCISE_SUGGESTIONS, MEAL_IDEAS, GOALS } from "./content.js";
import {
  blankProfile, normalizeProfile, computeCycle, cycleStats,
  addPeriodStart, removePeriodStart, PHASE_COLOR, PHASE_NOTE,
} from "./cycle.js";

const app = document.getElementById("dashApp");
const { auth, db, authMod, fsMod, loadError } = await initFirebase();

/* ---------- Boot ---------- */
if (auth) {
  authMod.onAuthStateChanged(auth, (user) => {
    if (user) start(firestoreStore(user.uid), user);
    // if no user, auth.js redirects to login
  });
} else {
  // Unconfigured (demo) or SDK unreachable (offline) — either way, keep the
  // dashboard usable with browser-local storage instead of a dead page.
  start(localStore(), { displayName: "Guest", email: "demo mode", demo: true, offline: loadError });
}

/* ---------- Storage adapters ---------- */
function blankDay() { return { exercise: [], supplements: {}, water: 0, meals: [], notes: "" }; }

function firestoreStore(uid) {
  const { doc, getDoc, setDoc, collection, getDocs, query, where, documentId } = fsMod;
  const daysCol = collection(db, "users", uid, "days");
  const ref = (d) => doc(db, "users", uid, "days", d);
  const profileRef = doc(db, "users", uid, "profile", "cycle");
  return {
    /* One range query instead of a getDoc per day. Document IDs are ISO dates,
       which sort lexicographically, so a documentId() range covers the week.
       Missing days aren't returned — and aren't billed as reads. */
    async getRange(dateStrs) {
      const out = {};
      dateStrs.forEach((d) => { out[d] = blankDay(); });
      const snap = await getDocs(query(
        daysCol,
        where(documentId(), ">=", dateStrs[0]),
        where(documentId(), "<=", dateStrs[dateStrs.length - 1]),
      ));
      snap.forEach((d) => { out[d.id] = { ...blankDay(), ...d.data() }; });
      return out;
    },
    async get(dateStr) {
      const snap = await getDoc(ref(dateStr));
      return snap.exists() ? { ...blankDay(), ...snap.data() } : blankDay();
    },
    async set(dateStr, data) { await setDoc(ref(dateStr), data); },
    async getProfile() {
      const snap = await getDoc(profileRef);
      return normalizeProfile(snap.exists() ? snap.data() : null);
    },
    async setProfile(data) { await setDoc(profileRef, data); },
    /* Every logged day, for export. */
    async getAll() {
      const snap = await getDocs(daysCol);
      const out = {};
      snap.forEach((d) => { out[d.id] = { ...blankDay(), ...d.data() }; });
      return out;
    },
  };
}
function localStore() {
  const KEY = "willow-demo-days";
  const PKEY = "willow-demo-profile";
  const all = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } };
  const readProfile = () => { try { return JSON.parse(localStorage.getItem(PKEY) || "{}"); } catch { return {}; } };
  return {
    async getRange(dateStrs) {
      const a = all(), out = {};
      dateStrs.forEach((d) => { out[d] = { ...blankDay(), ...(a[d] || {}) }; });
      return out;
    },
    async get(dateStr) { return { ...blankDay(), ...(all()[dateStr] || {}) }; },
    async set(dateStr, data) { const a = all(); a[dateStr] = data; localStorage.setItem(KEY, JSON.stringify(a)); },
    async getProfile() { return normalizeProfile(readProfile()); },
    async setProfile(data) { localStorage.setItem(PKEY, JSON.stringify(data)); },
    async getAll() { return all(); },
  };
}

/* ---------- Date helpers (local, Monday-start week) ---------- */
function iso(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function weekDates(ref = new Date()) {
  const d = new Date(ref); const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - day);
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return x; });
}

/* ---------- Main ---------- */
async function start(store, user) {
  const today = iso(new Date());
  const week = weekDates();

  // One batched query for the week + one for the profile.
  const weekIsos = week.map(iso);
  const [days, loadedProfile] = await Promise.all([
    store.getRange(weekIsos),
    store.getProfile(),
  ]);
  if (!days[today]) days[today] = blankDay();
  let day = days[today];
  let profile = loadedProfile;

  /* ---------- Saving ----------
     Taps are fast and writes are the scarcest resource (and cost money on
     Firestore), so update the UI immediately and coalesce writes. Tapping
     water five times becomes one write instead of five. */
  const SAVE_DEBOUNCE_MS = 700;
  let saveTimer = null;
  let inFlight = Promise.resolve();
  let dirty = false;

  function save() {
    days[today] = day;
    dirty = true;
    setSaveStatus("saving");
    render();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }

  function flush() {
    clearTimeout(saveTimer);
    if (!dirty) return inFlight;
    dirty = false;
    const snapshot = JSON.parse(JSON.stringify(day));
    // Chain writes so rapid edits can't land out of order.
    inFlight = inFlight
      .then(() => store.set(today, snapshot))
      .then(() => { if (!dirty) setSaveStatus("saved"); })
      .catch((err) => {
        console.warn("Willow: save failed", err);
        dirty = true;
        setSaveStatus("error");
      });
    return inFlight;
  }

  async function saveProfile(patch) {
    profile = normalizeProfile(typeof patch === "function" ? patch(profile) : { ...profile, ...patch });
    setSaveStatus("saving");
    render();
    try {
      await store.setProfile(profile);
      setSaveStatus("saved");
    } catch (err) {
      console.warn("Willow: profile save failed", err);
      setSaveStatus("error");
    }
  }

  const SAVE_LABEL = {
    idle: ["", "var(--ink-3)"],
    saving: ["Saving…", "var(--ink-3)"],
    saved: ["All changes saved", "var(--good)"],
    error: ["Couldn't save — retrying on next change", "var(--accent-ink)"],
  };
  let saveState = "idle";

  function setSaveStatus(state) {
    saveState = state;
    paintSaveStatus();
  }
  function paintSaveStatus() {
    const el = byId("saveStatus");
    if (!el) return;
    const [text, color] = SAVE_LABEL[saveState] || SAVE_LABEL.idle;
    el.textContent = text;
    el.style.color = color;
  }

  // Don't lose a pending write when the tab is hidden or closed.
  // visibilitychange is the reliable one on mobile; pagehide covers bfcache.
  addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  addEventListener("pagehide", flush);

  // First paint happens only after the save machinery above exists, since
  // render() reads it.
  render();

  function totals() {
    let minutes = 0, strength = 0;
    week.forEach((d) => {
      const dd = days[iso(d)];
      dd.exercise.forEach((e) => {
        minutes += Number(e.mins) || 0;
        if ((e.intensity || "").toLowerCase().includes("strength") ||
            (e.tags || []).some(t => /strength/i.test(t)) || e.strength) strength++;
      });
    });
    const suppDone = Object.values(day.supplements).filter(Boolean).length;
    return { minutes, strength, suppDone, suppTotal: DEFAULT_SUPPLEMENTS.length };
  }

  function render() {
    // Re-rendering replaces the DOM; remember what had keyboard focus so
    // checklist/stepper users aren't dumped back to the top of the page.
    const focused = document.activeElement;
    const focusSel = focused?.dataset?.supp ? `[data-supp="${focused.dataset.supp}"]`
      : (focused?.id === "waterPlus" || focused?.id === "waterMinus") ? `#${focused.id}`
      : null;

    const t = totals();
    const name = user.displayName || (user.email || "there").split("@")[0];
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const demoBanner = !user.demo ? "" : user.offline ? `
      <div class="config-banner">
        <strong>Connection issue.</strong> We couldn't reach the sync service, so your entries are being saved
        in this browser for now. Refresh once you're back online to sign in and sync.
      </div>` : `
      <div class="config-banner">
        <strong>Demo mode.</strong> Firebase isn't configured, so your data is saved only in this browser.
        Add your project keys in <code>js/firebase-config.js</code> to enable real accounts &amp; sync across devices.
      </div>`;

    app.innerHTML = `
      ${demoBanner}
      <div class="dash-head">
        <div>
          <span class="eyebrow">${new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"})}</span>
          <h1 style="margin:.2em 0 0">${greeting}, ${esc(name)} 🌿</h1>
          <p class="mb-0" style="max-width:52ch">Small, consistent habits in the 90 days before conception shape egg quality and hormone balance. Here's your week.</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="small" id="saveStatus" aria-live="polite"></span>
          <button class="btn btn-ghost btn-sm" id="exportBtn" title="Download all your tracked data">⬇ Export data</button>
        </div>
      </div>

      <div class="grid grid-4 mt-2">
        ${tile("Active minutes", `${t.minutes}<small>/${GOALS.activeMinutes}</small>`, "this week · moderate+")}
        ${tile("Strength sessions", `${t.strength}<small>/${GOALS.strengthSessions}</small>`, "this week")}
        ${tile("Supplements today", `${t.suppDone}<small>/${t.suppTotal}</small>`, "daily checklist")}
        ${tile("Water today", `${day.water}<small> cups</small>`, "aim ~8–10")}
      </div>

      ${cycleCard(profile, today)}

      <div class="grid" style="grid-template-columns:1.15fr .85fr; margin-top:18px" id="topGrid">
        <div class="card card-pad-lg">
          <div class="flex between items-center mb-2">
            <h3 style="margin:0">Movement this week</h3>
            <span class="pill muted">${t.minutes} min logged</span>
          </div>
          ${weekChart(week, days)}
        </div>
        <div class="card card-pad-lg">
          <h3 style="margin:0 0 16px">Weekly goals</h3>
          <div class="ring-row">
            ${ring(pct(t.minutes, GOALS.activeMinutes), "var(--series-move)", `${Math.round(pct(t.minutes,GOALS.activeMinutes)*100)}%`, "Movement")}
            ${ring(pct(t.strength, GOALS.strengthSessions), "var(--accent)", `${t.strength}/${GOALS.strengthSessions}`, "Strength")}
            ${ring(pct(t.suppDone, t.suppTotal), "var(--gold)", `${t.suppDone}/${t.suppTotal}`, "Supplements")}
          </div>
        </div>
      </div>

      <div class="grid" style="grid-template-columns:1fr 1fr; margin-top:18px">
        <!-- Exercise -->
        <div class="card card-pad-lg">
          <h3 style="margin:0 0 14px">Log a workout</h3>
          <div class="field">
            <label for="exTitle">Activity</label>
            <input class="input" id="exTitle" list="exList" placeholder="e.g. Brisk walk">
            <datalist id="exList">${EXERCISE_SUGGESTIONS.map(e=>`<option value="${e.title}">`).join("")}</datalist>
          </div>
          <div class="row-inline">
            <div class="field"><label for="exMins">Minutes</label><input class="input" id="exMins" type="number" min="1" max="480" value="30"></div>
            <div class="field"><label for="exInt">Intensity</label>
              <select class="input" id="exInt"><option>Light</option><option selected>Moderate</option><option>Vigorous</option><option>Strength</option></select>
            </div>
          </div>
          <button class="btn btn-primary btn-block" id="addEx">＋ Add workout</button>
          <ul class="log-list mt-2" id="exLog">
            ${day.exercise.length ? day.exercise.map((e,i)=>`
              <li><span class="dot"></span><span class="li-main">${esc(e.title)} <span class="tag">${esc(e.intensity)}</span></span>
              <span class="small">${e.mins} min</span><button class="li-del" data-ex="${i}" aria-label="Delete">✕</button></li>`).join("")
              : `<li class="muted" style="border:none">Nothing logged yet today — even a short walk counts 🌱</li>`}
          </ul>
        </div>

        <!-- Supplements + water -->
        <div class="card card-pad-lg">
          <h3 style="margin:0 0 6px">Today's supplements</h3>
          <p class="small muted mt-0" style="margin-bottom:10px">Tap to check off. Targets follow ACOG &amp; NIH guidance.</p>
          <ul class="checklist" id="suppList">
            ${DEFAULT_SUPPLEMENTS.map(s=>`
              <li>
                <div class="cl-check ${day.supplements[s.id]?"on":""}" data-supp="${s.id}" role="checkbox" aria-checked="${!!day.supplements[s.id]}" tabindex="0">✓</div>
                <span class="cl-name">${esc(s.name)}<small>${esc(s.note)}</small></span>
              </li>`).join("")}
          </ul>
          <div class="divider"></div>
          <div class="flex between items-center">
            <div><strong>Water</strong> <span class="muted small">— cups today</span></div>
            <div class="flex items-center gap-2">
              <button class="icon-btn" id="waterMinus" aria-label="Remove cup">−</button>
              <strong style="min-width:2ch;text-align:center;font-size:1.2rem">${day.water}</strong>
              <button class="icon-btn" id="waterPlus" aria-label="Add cup">＋</button>
            </div>
          </div>
        </div>
      </div>

      <div class="grid" style="grid-template-columns:1fr 1fr; margin-top:18px">
        <!-- Meals -->
        <div class="card card-pad-lg">
          <h3 style="margin:0 0 14px">Meals &amp; nutrition</h3>
          <div class="field">
            <label for="mealTitle">Add a meal</label>
            <input class="input" id="mealTitle" list="mealList" placeholder="e.g. Lentil & spinach bowl">
            <datalist id="mealList">${MEAL_IDEAS.map(m=>`<option value="${m.title}">`).join("")}</datalist>
          </div>
          <button class="btn btn-ghost btn-block" id="addMeal">＋ Add meal</button>
          <ul class="log-list mt-2" id="mealLog">
            ${day.meals.length ? day.meals.map((m,i)=>`
              <li><span class="dot" style="background:var(--accent)"></span><span class="li-main">${esc(m.title)}
              ${(m.tags||[]).map(tg=>`<span class="tag">${esc(tg)}</span>`).join(" ")}</span>
              <button class="li-del" data-meal="${i}" aria-label="Delete">✕</button></li>`).join("")
              : `<li class="muted" style="border:none">No meals logged yet today — add one below, or try a suggestion 🍽️</li>`}
          </ul>
        </div>

        <!-- Notes -->
        <div class="card card-pad-lg">
          <h3 style="margin:0 0 14px">Notes &amp; how you feel</h3>
          <div class="field">
            <label for="notes">Energy, sleep, cycle, symptoms…</label>
            <textarea class="input" id="notes" style="min-height:150px" placeholder="Slept 8h, felt energized. Cycle day 12…">${esc(day.notes)}</textarea>
          </div>
          <div class="flex between items-center">
            <span class="small muted" id="noteStatus">Saved automatically</span>
            <button class="btn btn-primary btn-sm" id="saveNotes">Save notes</button>
          </div>
        </div>
      </div>

      <!-- Suggestions -->
      <div class="card card-pad-lg" style="margin-top:18px">
        <div class="flex between items-center wrap gap-2 mb-2">
          <h3 style="margin:0">Suggested for you</h3>
          <a href="guide.html#exercise" class="small">See the evidence →</a>
        </div>
        <div class="grid grid-3" id="exSuggest">
          ${EXERCISE_SUGGESTIONS.slice(0,3).map(s=>`
            <div class="suggestion">
              <h4>${esc(s.title)}</h4>
              <p>${esc(s.why)}</p>
              <div class="meta">${s.tags.map(tg=>`<span class="tag">${esc(tg)}</span>`).join("")}<span class="tag">${s.mins} min</span></div>
              <button class="btn btn-ghost btn-sm mt-2" data-suggest-ex='${encodeURIComponent(JSON.stringify(s))}'>＋ Add to today</button>
            </div>`).join("")}
        </div>
        <div class="divider"></div>
        <div class="grid grid-3" id="mealSuggest">
          ${MEAL_IDEAS.slice(0,3).map(m=>`
            <div class="suggestion">
              <h4>${esc(m.title)}</h4>
              <p>${esc(m.desc)}</p>
              <div class="meta">${m.tags.map(tg=>`<span class="tag">${esc(tg)}</span>`).join("")}</div>
              <button class="btn btn-ghost btn-sm mt-2" data-suggest-meal='${encodeURIComponent(JSON.stringify(m))}'>＋ Add meal</button>
            </div>`).join("")}
        </div>
      </div>

      <p class="disclaimer mt-3">Educational tracking only — not medical advice or diagnosis. Discuss supplements, medications, and any symptoms with your clinician, especially if you have a chronic condition or take prescription medication.</p>
    `;
    wire();
    paintSaveStatus();
    if (focusSel) app.querySelector(focusSel)?.focus();
  }

  function wire() {
    byId("addEx")?.addEventListener("click", () => {
      const title = val("exTitle"); if (!title) return;
      const mins = Math.max(1, Number(val("exMins")) || 0);
      const intensity = val("exInt");
      day.exercise.push({ title, mins, intensity, strength: intensity === "Strength" });
      save();
    });
    byId("addMeal")?.addEventListener("click", () => {
      const title = val("mealTitle"); if (!title) return;
      const match = MEAL_IDEAS.find(m => m.title.toLowerCase() === title.toLowerCase());
      day.meals.push({ title, tags: match ? match.tags : [] });
      save();
    });
    document.querySelectorAll("[data-ex]").forEach(b => b.addEventListener("click", () => { day.exercise.splice(+b.dataset.ex,1); save(); }));
    document.querySelectorAll("[data-meal]").forEach(b => b.addEventListener("click", () => { day.meals.splice(+b.dataset.meal,1); save(); }));
    document.querySelectorAll("[data-supp]").forEach(c => {
      const toggle = () => { const id = c.dataset.supp; day.supplements[id] = !day.supplements[id]; save(); };
      c.addEventListener("click", toggle);
      c.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); } });
    });
    byId("waterPlus")?.addEventListener("click", () => { day.water++; save(); });
    byId("waterMinus")?.addEventListener("click", () => { day.water = Math.max(0, day.water-1); save(); });
    byId("saveNotes")?.addEventListener("click", () => { day.notes = val("notes"); flush(); });
    // Typing shouldn't re-render (it would fight the caret), so update the
    // model directly and let the shared debounce coalesce the write.
    let noteTimer;
    byId("notes")?.addEventListener("input", () => {
      day.notes = val("notes");
      days[today] = day;
      dirty = true;
      setSaveStatus("saving");
      clearTimeout(noteTimer);
      noteTimer = setTimeout(flush, SAVE_DEBOUNCE_MS);
    });
    document.querySelectorAll("[data-suggest-ex]").forEach(b => b.addEventListener("click", () => {
      const s = JSON.parse(decodeURIComponent(b.dataset.suggestEx));
      day.exercise.push({ title: s.title, mins: s.mins, intensity: s.intensity, strength: s.tags.some(t=>/strength/i.test(t)) });
      save();
    }));
    document.querySelectorAll("[data-suggest-meal]").forEach(b => b.addEventListener("click", () => {
      const m = JSON.parse(decodeURIComponent(b.dataset.suggestMeal));
      day.meals.push({ title: m.title, tags: m.tags }); save();
    }));
    byId("startCycle")?.addEventListener("click", () => {
      const start = val("cycleStart") || today;
      const len = Math.max(15, Math.min(60, Number(val("cycleLen")) || 28));
      saveProfile((p) => ({ ...addPeriodStart(p, start), cycleLength: len }));
    });
    byId("logPeriodToday")?.addEventListener("click", () => {
      saveProfile((p) => addPeriodStart(p, today));
    });
    byId("addPeriodDate")?.addEventListener("click", () => {
      const d = val("newPeriodDate");
      if (d) saveProfile((p) => addPeriodStart(p, d));
    });
    byId("saveCycleLen")?.addEventListener("click", () => {
      saveProfile({ cycleLength: Math.max(15, Math.min(60, Number(val("cycleLen")) || 28)) });
    });
    // Undo a mis-logged period date.
    app.querySelectorAll("[data-del-period]").forEach((b) => b.addEventListener("click", () => {
      saveProfile((p) => removePeriodStart(p, b.dataset.delPeriod));
    }));
    byId("exportBtn")?.addEventListener("click", () => exportData(store, profile, user));
  }
}

/* ---------- Export ----------
   Health data should be portable. Everything happens client-side; nothing is
   uploaded anywhere. */
async function exportData(store, profile, user) {
  const btn = byId("exportBtn");
  const original = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Preparing…"; }
  try {
    const allDays = await store.getAll();
    const dates = Object.keys(allDays).sort();
    const stamp = iso(new Date());

    download(`willow-export-${stamp}.json`, "application/json", JSON.stringify({
      exportedAt: new Date().toISOString(),
      account: user?.email && user.email !== "demo mode" ? user.email : null,
      cycle: profile,
      days: allDays,
    }, null, 2));

    const headers = ["date", "active_minutes", "workouts", "supplements_taken", "water_cups", "meals", "notes"];
    const rows = dates.map((d) => {
      const v = allDays[d] || {};
      const ex = v.exercise || [];
      return [
        d,
        ex.reduce((s, e) => s + (Number(e.mins) || 0), 0),
        ex.map((e) => `${e.title} (${e.mins}m, ${e.intensity})`).join("; "),
        Object.entries(v.supplements || {}).filter(([, on]) => on).map(([k]) => k).join("; "),
        v.water || 0,
        (v.meals || []).map((m) => m.title).join("; "),
        v.notes || "",
      ].map(csvCell).join(",");
    });
    download(`willow-export-${stamp}.csv`, "text/csv", [headers.join(","), ...rows].join("\r\n"));

    if (btn) btn.textContent = `✓ Exported ${dates.length} day${dates.length === 1 ? "" : "s"}`;
  } catch (err) {
    console.warn("Willow: export failed", err);
    if (btn) btn.textContent = "Export failed — try again";
  } finally {
    if (btn) {
      btn.disabled = false;
      setTimeout(() => { if (byId("exportBtn")) byId("exportBtn").textContent = original; }, 3200);
    }
  }
}

/* Quote for CSV, and defuse spreadsheet formula injection on text cells. */
function csvCell(value) {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function download(filename, mime, contents) {
  const url = URL.createObjectURL(new Blob([contents], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- Cycle card ---------- */
function cycleCard(profile, todayIso) {
  const cyc = computeCycle(profile, todayIso);

  if (!cyc) {
    return `
      <div class="card card-pad-lg mt-2" id="cycleCard">
        <h3 style="margin:0 0 4px">🌸 Track your cycle</h3>
        <p class="small" style="margin:0 0 14px">Log your last period's start date to see your cycle day, estimated fertile window, and next period — right alongside your hormone-health habits.</p>
        <div class="row-inline">
          <div class="field"><label for="cycleStart">Last period started</label><input class="input" id="cycleStart" type="date" max="${todayIso}" value="${todayIso}"></div>
          <div class="field"><label for="cycleLen">Average cycle length</label><input class="input" id="cycleLen" type="number" min="15" max="60" value="${profile.cycleLength || 28}"></div>
        </div>
        <button class="btn btn-primary" id="startCycle">Start tracking my cycle</button>
        <p class="disclaimer mt-2" style="border:none;padding-top:0">Estimates only, based on average cycle length — not a contraceptive method. Cycles vary, especially with PCOS; track a few cycles to see your own pattern.</p>
      </div>`;
  }

  const fertilePct = { start: pct(cyc.fertileStart - 1, cyc.cycleLength), end: pct(cyc.fertileEnd, cyc.cycleLength) };
  const dayPct = pct(cyc.cycleDay, cyc.cycleLength);
  const color = PHASE_COLOR[cyc.phase] || "var(--brand)";
  const fmt = (iso) => new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const st = cyc.stats;
  const logged = normalizeProfile(profile).periodStarts;

  // Say where the prediction came from — an average of real cycles is very
  // different from a default guess, and the user should know which they have.
  const basis = cyc.lengthSource === "observed"
    ? `<span class="pill" style="background:var(--brand-soft);color:var(--brand-ink)" title="Average of your last ${st.count} cycle${st.count === 1 ? "" : "s"}">📊 Your average: ${cyc.cycleLength} days</span>`
    : `<span class="pill muted" title="Log two or more periods and Willow will use your real average instead">Estimate: ${cyc.cycleLength} days</span>`;

  const variability = st.irregular
    ? `<div class="callout rose" style="margin:14px 0 0">
         <p><strong>Your cycles vary by ${st.spread} days</strong> (${st.shortest}–${st.longest}). Ovulation and
         fertile-window estimates are less reliable with irregular cycles — worth mentioning at your
         preconception visit. <a href="guide.html#hormones">Why cycle length varies →</a></p>
       </div>`
    : "";

  return `
    <div class="card card-pad-lg mt-2" id="cycleCard">
      <div class="flex between items-center wrap gap-2 mb-2">
        <div>
          <h3 style="margin:0">🌸 Your cycle</h3>
          <p class="small mb-0" style="margin-top:2px">Day ${cyc.cycleDay} of ~${cyc.cycleLength} · <span class="pill" style="background:color-mix(in srgb, ${color} 16%, transparent); color:${color}">${cyc.phase}</span> ${basis}</p>
        </div>
        <button class="btn btn-ghost btn-sm" id="logPeriodToday">🩸 Period started today</button>
      </div>
      <p class="small muted" style="margin:0 0 12px">${esc(PHASE_NOTE[cyc.phase] || "")}</p>

      <div class="cycle-meter" role="img" aria-label="Cycle day ${cyc.cycleDay} of ${cyc.cycleLength}, phase ${cyc.phase}">
        <div class="cycle-meter-fertile" style="left:${(fertilePct.start*100).toFixed(1)}%; width:${((fertilePct.end-fertilePct.start)*100).toFixed(1)}%"></div>
        <div class="cycle-meter-fill" style="width:${(dayPct*100).toFixed(1)}%; background:${color}"></div>
        <div class="cycle-meter-marker" style="left:${(dayPct*100).toFixed(1)}%"></div>
      </div>
      <div class="flex between small muted" style="margin-top:6px"><span>Period</span><span>Fertile window</span><span>Next period</span></div>

      <div class="grid grid-3 mt-2">
        <div class="stat-tile"><div class="label">Estimated ovulation</div><div class="value" style="font-size:1.3rem">${fmt(cyc.fertileEndDate)}</div></div>
        <div class="stat-tile"><div class="label">Fertile window</div><div class="value" style="font-size:1.3rem">${fmt(cyc.fertileStartDate)}–${fmt(cyc.fertileEndDate)}</div></div>
        <div class="stat-tile"><div class="label">Next period (est.)</div><div class="value" style="font-size:1.3rem">${fmt(cyc.nextPeriodDate)}</div><div class="sub">in ${cyc.daysUntilNextPeriod} day${cyc.daysUntilNextPeriod===1?"":"s"}</div></div>
      </div>

      ${variability}

      <details class="mt-2">
        <summary class="small" style="cursor:pointer;color:var(--ink-2);font-weight:600">Period history &amp; settings${logged.length ? ` (${logged.length} logged)` : ""}</summary>

        <div class="mt-2">
          <label class="small" style="font-weight:600;display:block;margin-bottom:6px">Log a past period start</label>
          <div class="flex gap-2 wrap items-center">
            <input class="input" id="newPeriodDate" type="date" max="${todayIso}" style="max-width:200px">
            <button class="btn btn-ghost btn-sm" id="addPeriodDate">Add date</button>
          </div>
        </div>

        ${logged.length ? `
          <div class="mt-2">
            <label class="small" style="font-weight:600;display:block;margin-bottom:6px">Logged periods${st.observed.length ? ` · cycle lengths: ${st.observed.slice(-6).join(", ")} days` : ""}</label>
            <ul class="log-list">
              ${logged.slice().reverse().map((d, i, arr) => {
                const next = arr[i + 1];
                const gap = next ? daysSince(next, d) : null;
                return `<li>
                  <span class="dot" style="background:var(--accent)"></span>
                  <span class="li-main">${fmt(d)} <span class="muted small">${new Date(d + "T00:00:00").getFullYear()}</span></span>
                  <span class="small muted">${gap ? `${gap}-day cycle` : ""}</span>
                  <button class="li-del" data-del-period="${d}" aria-label="Remove ${fmt(d)}" title="Remove this date">✕</button>
                </li>`;
              }).join("")}
            </ul>
          </div>` : ""}

        <div class="divider"></div>
        ${cyc.lengthSource === "observed" ? `
          <p class="small muted" style="margin:0">
            Predictions use the average of your last ${st.count} cycle${st.count === 1 ? "" : "s"}
            (<strong>${cyc.cycleLength} days</strong>). Log each period to keep it accurate.
          </p>` : `
          <div class="field" style="max-width:260px">
            <label for="cycleLen">Expected cycle length</label>
            <input class="input" id="cycleLen" type="number" min="15" max="60" value="${cyc.cycleLength}">
          </div>
          <button class="btn btn-ghost btn-sm" id="saveCycleLen">Save length</button>
          <p class="small muted mt-2" style="margin-bottom:0">
            Used until you've logged a second period — then Willow switches to your own measured average.
          </p>`}
      </details>
      <p class="disclaimer mt-2" style="border:none;padding-top:0">Estimates only — not a contraceptive method. See <a href="guide.html#hormones">how your cycle works →</a></p>
    </div>`;
}

/* Whole days from one ISO date to another (both date-only). */
function daysSince(fromIso, toIso) {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

/* ---------- Render helpers ---------- */
function tile(label, value, sub) {
  return `<div class="stat-tile"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;
}
function pct(v, max) { return Math.min(1, max ? v / max : 0); }

function ring(fraction, color, centerText, label) {
  const r = 34, c = 2 * Math.PI * r, off = c * (1 - fraction), size = 88;
  return `<div class="ring">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="9"></circle>
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="9"
        stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"
        transform="rotate(-90 ${size/2} ${size/2})"></circle>
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
        style="font:600 15px var(--font);fill:var(--ink)">${centerText}</text>
    </svg>
    <div class="rlabel">${label}</div>
  </div>`;
}

function weekChart(week, days) {
  const labels = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const data = week.map(d => days[iso(d)].exercise.reduce((s,e)=>s+(Number(e.mins)||0),0));
  const W = 460, H = 210, padL = 34, padB = 28, padT = 14, padR = 8;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const rawMax = Math.max(60, ...data);
  const yMax = Math.ceil(rawMax / 30) * 30;
  const band = plotW / 7;
  const barW = Math.min(24, band - 16);
  const x = i => padL + band * i + (band - barW) / 2;
  const y = v => padT + plotH * (1 - v / yMax);
  const todayIdx = week.findIndex(d => iso(d) === iso(new Date()));

  const grid = [];
  for (let g = 0; g <= yMax; g += yMax / 3) {
    const gy = y(g);
    grid.push(`<line x1="${padL}" y1="${gy}" x2="${W-padR}" y2="${gy}" stroke="var(--line)" stroke-width="1"></line>`);
    grid.push(`<text x="${padL-6}" y="${gy+3}" text-anchor="end" style="font:500 10px var(--font);fill:var(--ink-3)">${Math.round(g)}</text>`);
  }
  const bars = data.map((v,i) => {
    const bx = x(i), by = y(v);
    const isToday = i === todayIdx;
    const fill = isToday ? "var(--series-move)" : "color-mix(in srgb, var(--series-move) 55%, var(--surface-2))";
    const rounded = v > 0 ? 4 : 0;
    return `<g><title>${labels[i]}: ${v} min</title>
      ${v>0?`<path d="M${bx} ${padT+plotH} L${bx} ${by+rounded} Q${bx} ${by} ${bx+rounded} ${by} L${bx+barW-rounded} ${by} Q${bx+barW} ${by} ${bx+barW} ${by+rounded} L${bx+barW} ${padT+plotH} Z" fill="${fill}"></path>`:""}
      ${v>0?`<text x="${bx+barW/2}" y="${by-5}" text-anchor="middle" style="font:600 10px var(--font);fill:var(--ink-2)">${v}</text>`:""}
      <text x="${bx+barW/2}" y="${H-9}" text-anchor="middle" style="font:${isToday?600:500} 11px var(--font);fill:${isToday?"var(--ink)":"var(--ink-3)"}">${labels[i]}</text>
    </g>`;
  }).join("");

  return `<div class="table-scroll" style="border:none;overflow-x:auto">
    <svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:380px;display:block" role="img" aria-label="Active minutes per day this week">
      ${grid.join("")}
      <line x1="${padL}" y1="${padT+plotH}" x2="${W-padR}" y2="${padT+plotH}" stroke="var(--line-2)" stroke-width="1"></line>
      ${bars}
    </svg>
  </div>`;
}

/* ---------- tiny utils ---------- */
function byId(id) { return document.getElementById(id); }
function val(id) { return (byId(id)?.value || "").trim(); }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
