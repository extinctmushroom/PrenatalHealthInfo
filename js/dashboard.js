/* Dashboard: exercise, supplements, water, meals, notes trackers.
   Persists to Firestore when configured + signed in; otherwise runs in a
   local "demo mode" (localStorage) so the page is still explorable — with no
   dependency on the Firebase CDN. */
import { initFirebase } from "./firebase-init.js";
import { DEFAULT_SUPPLEMENTS, EXERCISE_SUGGESTIONS, MEAL_IDEAS, GOALS } from "./content.js";

const app = document.getElementById("dashApp");
const { auth, db, authMod, fsMod } = await initFirebase();

/* ---------- Boot ---------- */
if (auth) {
  authMod.onAuthStateChanged(auth, (user) => {
    if (user) start(firestoreStore(user.uid), user);
    // if no user, auth.js redirects to login
  });
} else {
  start(localStore(), { displayName: "Guest", email: "demo mode", demo: true });
}

/* ---------- Storage adapters ---------- */
function blankDay() { return { exercise: [], supplements: {}, water: 0, meals: [], notes: "" }; }

function firestoreStore(uid) {
  const { doc, getDoc, setDoc } = fsMod;
  const ref = (d) => doc(db, "users", uid, "days", d);
  return {
    async get(dateStr) {
      const snap = await getDoc(ref(dateStr));
      return snap.exists() ? { ...blankDay(), ...snap.data() } : blankDay();
    },
    async set(dateStr, data) { await setDoc(ref(dateStr), data); },
  };
}
function localStore() {
  const KEY = "willow-demo-days";
  const all = () => JSON.parse(localStorage.getItem(KEY) || "{}");
  return {
    async get(dateStr) { return { ...blankDay(), ...(all()[dateStr] || {}) }; },
    async set(dateStr, data) { const a = all(); a[dateStr] = data; localStorage.setItem(KEY, JSON.stringify(a)); },
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

  // Load this week's days.
  const days = {};
  await Promise.all(week.map(async (d) => { days[iso(d)] = await store.get(iso(d)); }));
  let day = days[today];

  render();

  async function save() {
    days[today] = day;
    await store.set(today, day);
    render();
  }

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
    const t = totals();
    const name = user.displayName || (user.email || "there").split("@")[0];
    const demoBanner = user.demo ? `
      <div class="config-banner">
        <strong>Demo mode.</strong> Firebase isn't configured, so your data is saved only in this browser.
        Add your project keys in <code>js/firebase-config.js</code> to enable real accounts &amp; sync across devices.
      </div>` : "";

    app.innerHTML = `
      ${demoBanner}
      <div class="dash-head">
        <div>
          <span class="eyebrow">${new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"})}</span>
          <h1 style="margin:.2em 0 0">Hello, ${esc(name)} 🌿</h1>
          <p class="mb-0" style="max-width:52ch">Small, consistent habits in the 90 days before conception shape egg quality and hormone balance. Here's your week.</p>
        </div>
      </div>

      <div class="grid grid-4 mt-2">
        ${tile("Active minutes", `${t.minutes}<small>/${GOALS.activeMinutes}</small>`, "this week · moderate+")}
        ${tile("Strength sessions", `${t.strength}<small>/${GOALS.strengthSessions}</small>`, "this week")}
        ${tile("Supplements today", `${t.suppDone}<small>/${t.suppTotal}</small>`, "daily checklist")}
        ${tile("Water today", `${day.water}<small> cups</small>`, "aim ~8–10")}
      </div>

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
              : `<li class="muted" style="border:none">No workouts logged today yet.</li>`}
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
              : `<li class="muted" style="border:none">No meals logged today yet.</li>`}
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
    byId("saveNotes")?.addEventListener("click", () => { day.notes = val("notes"); save(); });
    let noteTimer;
    byId("notes")?.addEventListener("input", () => {
      clearTimeout(noteTimer);
      byId("noteStatus").textContent = "Saving…";
      noteTimer = setTimeout(() => { day.notes = val("notes"); days[today] = day; store.set(today, day).then(()=> byId("noteStatus") && (byId("noteStatus").textContent = "Saved ✓")); }, 800);
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
  }
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
    const bx = x(i), by = y(v), bh = padT + plotH - by;
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
