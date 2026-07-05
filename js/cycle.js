/* Menstrual cycle estimation — simple calendar-method math.
   Estimates only: real cycles vary, especially with PCOS or perimenopause.
   Not for contraception. See guide.html#hormones for the phase explainer. */

export function blankProfile() {
  return { lastPeriodStart: null, cycleLength: 28, periodLength: 5 };
}

/* Days between two date-only ISO strings (YYYY-MM-DD), ignoring time-of-day. */
function daysBetween(fromIso, toIso) {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86400000);
}

export function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/* Returns null if no period start is logged yet. */
export function computeCycle(profile, todayIso) {
  if (!profile || !profile.lastPeriodStart) return null;
  const cycleLength = Math.max(15, Math.min(60, Number(profile.cycleLength) || 28));
  const periodLength = Math.max(1, Math.min(10, Number(profile.periodLength) || 5));

  const elapsed = daysBetween(profile.lastPeriodStart, todayIso);
  const cyclesElapsed = Math.floor(elapsed / cycleLength);
  const cycleStart = addDays(profile.lastPeriodStart, cyclesElapsed * cycleLength);
  const cycleDay = elapsed - cyclesElapsed * cycleLength + 1;

  const ovulationDay = Math.max(1, cycleLength - 14);
  const fertileStart = Math.max(1, ovulationDay - 5);
  const fertileEnd = ovulationDay;

  let phase;
  if (cycleDay <= periodLength) phase = "Menstrual";
  else if (cycleDay < fertileStart) phase = "Follicular";
  else if (cycleDay <= fertileEnd) phase = "Fertile window";
  else phase = "Luteal";

  return {
    cycleDay,
    cycleLength,
    periodLength,
    phase,
    ovulationDay,
    fertileStart,
    fertileEnd,
    fertileStartDate: addDays(cycleStart, fertileStart - 1),
    fertileEndDate: addDays(cycleStart, fertileEnd - 1),
    nextPeriodDate: addDays(cycleStart, cycleLength),
    daysUntilNextPeriod: cycleLength - cycleDay + 1,
  };
}

export const PHASE_COLOR = {
  "Menstrual": "var(--accent)",
  "Follicular": "var(--brand)",
  "Fertile window": "var(--gold)",
  "Luteal": "var(--ink-3)",
};
