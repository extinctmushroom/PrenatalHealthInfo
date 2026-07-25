/* Menstrual cycle estimation — calendar-method math over a log of period
   start dates. Estimates only: real cycles vary, especially with PCOS or
   perimenopause. Not for contraception.
   See guide.html#hormones for the phase explainer. */

/* How many recent cycles feed the running average. Recent cycles are more
   representative than ones from a year ago. */
const AVERAGE_WINDOW = 6;

/* Gaps outside this range are treated as a missed or mis-logged entry rather
   than a real cycle, so one bad tap can't wreck the average. */
const MIN_PLAUSIBLE_CYCLE = 15;
const MAX_PLAUSIBLE_CYCLE = 60;

/* Cycle-length spread (longest - shortest) at or above which we tell the user
   their estimates are less reliable. Mirrors the guide's note that ovulation
   estimates degrade as cycles get more irregular. */
const IRREGULAR_SPREAD_DAYS = 8;

export function blankProfile() {
  return { periodStarts: [], cycleLength: 28, periodLength: 5 };
}

/* Accepts any stored profile — including the older single-date shape — and
   returns the current shape with a sorted, de-duplicated period log. */
export function normalizeProfile(stored) {
  const p = { ...blankProfile(), ...(stored || {}) };
  const starts = Array.isArray(p.periodStarts) ? p.periodStarts.slice() : [];

  // Migrate legacy { lastPeriodStart: "YYYY-MM-DD" } profiles.
  if (p.lastPeriodStart && !starts.includes(p.lastPeriodStart)) starts.push(p.lastPeriodStart);
  delete p.lastPeriodStart;

  // ISO dates sort lexicographically, which is also chronological.
  p.periodStarts = [...new Set(starts.filter(isIsoDate))].sort();
  p.cycleLength = clampCycleLength(p.cycleLength);
  p.periodLength = Math.max(1, Math.min(10, Number(p.periodLength) || 5));
  return p;
}

function isIsoDate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }
function clampCycleLength(n) {
  return Math.max(MIN_PLAUSIBLE_CYCLE, Math.min(MAX_PLAUSIBLE_CYCLE, Number(n) || 28));
}

/* Days between two date-only ISO strings, ignoring time-of-day and DST. */
export function daysBetween(fromIso, toIso) {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

export function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/* Derives observed cycle lengths from consecutive logged period starts.
   Returns { observed, average, shortest, longest, spread, irregular, count }.
   `average` is null until at least two periods have been logged. */
export function cycleStats(profile) {
  const starts = normalizeProfile(profile).periodStarts;
  const observed = [];
  for (let i = 1; i < starts.length; i++) {
    const gap = daysBetween(starts[i - 1], starts[i]);
    if (gap >= MIN_PLAUSIBLE_CYCLE && gap <= MAX_PLAUSIBLE_CYCLE) observed.push(gap);
  }
  if (!observed.length) {
    return { observed: [], average: null, shortest: null, longest: null, spread: null, irregular: false, count: 0 };
  }
  const recent = observed.slice(-AVERAGE_WINDOW);
  const average = Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
  const shortest = Math.min(...recent);
  const longest = Math.max(...recent);
  const spread = longest - shortest;
  return {
    observed, average, shortest, longest, spread,
    irregular: recent.length >= 2 && spread >= IRREGULAR_SPREAD_DAYS,
    count: recent.length,
  };
}

/* The cycle length predictions should use: the user's own observed average
   once we have real data, otherwise their entered estimate. */
export function effectiveCycleLength(profile) {
  const stats = cycleStats(profile);
  if (stats.average) return { length: stats.average, source: "observed", stats };
  return { length: clampCycleLength(normalizeProfile(profile).cycleLength), source: "estimate", stats };
}

/* Adds a period start date, keeping the log sorted and de-duplicated. */
export function addPeriodStart(profile, dateIso) {
  const p = normalizeProfile(profile);
  if (isIsoDate(dateIso) && !p.periodStarts.includes(dateIso)) {
    p.periodStarts = [...p.periodStarts, dateIso].sort();
  }
  return p;
}

/* Removes a mis-logged period start (one stray tap shouldn't be permanent). */
export function removePeriodStart(profile, dateIso) {
  const p = normalizeProfile(profile);
  p.periodStarts = p.periodStarts.filter((d) => d !== dateIso);
  return p;
}

/* Returns null until at least one period start has been logged. */
export function computeCycle(profile, todayIso) {
  const p = normalizeProfile(profile);
  if (!p.periodStarts.length) return null;

  const { length: cycleLength, source, stats } = effectiveCycleLength(p);
  const periodLength = p.periodLength;

  // Predict forward from the most recent logged start, rolling whole cycles
  // if the user hasn't logged in a while.
  const lastStart = p.periodStarts[p.periodStarts.length - 1];
  const elapsed = daysBetween(lastStart, todayIso);

  // A future-dated entry would make cycleDay nonsensical; clamp to day 1.
  if (elapsed < 0) {
    return buildCycle(lastStart, 1, cycleLength, periodLength, source, stats, lastStart);
  }

  const cyclesElapsed = Math.floor(elapsed / cycleLength);
  const cycleStart = addDays(lastStart, cyclesElapsed * cycleLength);
  const cycleDay = elapsed - cyclesElapsed * cycleLength + 1;
  return buildCycle(cycleStart, cycleDay, cycleLength, periodLength, source, stats, lastStart);
}

function buildCycle(cycleStart, cycleDay, cycleLength, periodLength, source, stats, lastLogged) {
  // Luteal phase is the stable part (~14 days), so ovulation is estimated
  // backwards from the next expected period.
  const ovulationDay = Math.max(1, cycleLength - 14);
  const fertileStart = Math.max(1, ovulationDay - 5);
  const fertileEnd = ovulationDay;

  let phase;
  if (cycleDay <= periodLength) phase = "Menstrual";
  else if (cycleDay < fertileStart) phase = "Follicular";
  else if (cycleDay <= fertileEnd) phase = "Fertile window";
  else phase = "Luteal";

  return {
    cycleDay, cycleLength, periodLength, phase,
    ovulationDay, fertileStart, fertileEnd,
    lengthSource: source,
    stats,
    lastLogged,
    fertileStartDate: addDays(cycleStart, fertileStart - 1),
    fertileEndDate: addDays(cycleStart, fertileEnd - 1),
    nextPeriodDate: addDays(cycleStart, cycleLength),
    daysUntilNextPeriod: cycleLength - cycleDay + 1,
    inFertileWindow: phase === "Fertile window",
  };
}

export const PHASE_COLOR = {
  "Menstrual": "var(--accent)",
  "Follicular": "var(--brand)",
  "Fertile window": "var(--gold)",
  "Luteal": "var(--ink-3)",
};

/* Short, plain-language note about what each phase means for how you may feel.
   Educational framing only — no clinical claims. */
export const PHASE_NOTE = {
  "Menstrual": "Energy is often lowest now. Gentle movement and iron-rich meals can help.",
  "Follicular": "Estrogen is rising — often a good stretch for harder workouts.",
  "Fertile window": "Your most fertile days, estimated from your cycle length.",
  "Luteal": "Progesterone rises. Steady blood sugar and sleep matter most here.",
};
