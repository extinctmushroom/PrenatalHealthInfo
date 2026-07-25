import {
  blankProfile, normalizeProfile, cycleStats, effectiveCycleLength,
  addPeriodStart, removePeriodStart, computeCycle, daysBetween, addDays,
} from '../js/cycle.js';

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        expected ${e}\n        actual   ${a}`); }
}

console.log('\n-- date helpers --');
check('daysBetween same day', daysBetween('2026-03-01', '2026-03-01'), 0);
check('daysBetween across month', daysBetween('2026-02-25', '2026-03-04'), 7);
check('daysBetween across DST (US spring fwd)', daysBetween('2026-03-07', '2026-03-09'), 2);
check('daysBetween leap day 2028', daysBetween('2028-02-28', '2028-03-01'), 2);
check('addDays across year', addDays('2026-12-30', 5), '2027-01-04');

console.log('\n-- legacy migration --');
check('legacy lastPeriodStart migrates into periodStarts',
  normalizeProfile({ lastPeriodStart: '2026-06-01', cycleLength: 30 }).periodStarts, ['2026-06-01']);
check('legacy key is dropped',
  normalizeProfile({ lastPeriodStart: '2026-06-01' }).lastPeriodStart, undefined);
check('legacy merges with existing array without duplicating',
  normalizeProfile({ lastPeriodStart: '2026-06-01', periodStarts: ['2026-06-01', '2026-05-04'] }).periodStarts,
  ['2026-05-04', '2026-06-01']);
check('blank profile is empty', normalizeProfile(undefined).periodStarts, []);
check('garbage dates are filtered out',
  normalizeProfile({ periodStarts: ['2026-06-01', 'nope', null, 42] }).periodStarts, ['2026-06-01']);

console.log('\n-- stats --');
const p3 = { periodStarts: ['2026-01-01', '2026-01-29', '2026-02-28'] }; // gaps 28, 30
check('observed gaps', cycleStats(p3).observed, [28, 30]);
check('average of 28,30', cycleStats(p3).average, 29);
check('single period = no average', cycleStats({ periodStarts: ['2026-01-01'] }).average, null);
check('implausible gap ignored',
  cycleStats({ periodStarts: ['2026-01-01', '2026-01-02', '2026-01-30'] }).observed, [28]);
const irregular = { periodStarts: ['2026-01-01', '2026-01-22', '2026-02-25'] }; // 21, 34 -> spread 13
check('irregular flagged when spread >= 8', cycleStats(irregular).irregular, true);
check('regular not flagged', cycleStats(p3).irregular, false);

console.log('\n-- effective length --');
check('uses observed average once available', effectiveCycleLength(p3).source, 'observed');
check('observed average value', effectiveCycleLength(p3).length, 29);
check('falls back to estimate with <2 periods',
  effectiveCycleLength({ periodStarts: ['2026-01-01'], cycleLength: 31 }).source, 'estimate');
check('estimate value respected',
  effectiveCycleLength({ periodStarts: ['2026-01-01'], cycleLength: 31 }).length, 31);

console.log('\n-- add / remove --');
check('addPeriodStart keeps sorted',
  addPeriodStart({ periodStarts: ['2026-02-01'] }, '2026-01-05').periodStarts, ['2026-01-05', '2026-02-01']);
check('addPeriodStart dedupes',
  addPeriodStart({ periodStarts: ['2026-02-01'] }, '2026-02-01').periodStarts, ['2026-02-01']);
check('removePeriodStart undoes a mis-tap',
  removePeriodStart({ periodStarts: ['2026-01-05', '2026-02-01'] }, '2026-02-01').periodStarts, ['2026-01-05']);

console.log('\n-- computeCycle --');
check('null with no data', computeCycle(blankProfile(), '2026-03-01'), null);

// 28-day estimate, period started 7 days ago -> day 8, follicular
const c1 = computeCycle({ periodStarts: ['2026-03-01'], cycleLength: 28 }, '2026-03-08');
check('cycle day', c1.cycleDay, 8);
check('phase follicular', c1.phase, 'Follicular');
check('ovulation day (len-14)', c1.ovulationDay, 14);
check('fertile window start', c1.fertileStart, 9);
check('next period date', c1.nextPeriodDate, '2026-03-29');
check('days until next period', c1.daysUntilNextPeriod, 21);

// day 3 -> menstrual
check('menstrual phase on day 3',
  computeCycle({ periodStarts: ['2026-03-01'], cycleLength: 28 }, '2026-03-03').phase, 'Menstrual');
// day 13 -> fertile window (fertileStart 9 .. fertileEnd 14)
const c2 = computeCycle({ periodStarts: ['2026-03-01'], cycleLength: 28 }, '2026-03-13');
check('fertile window on day 13', c2.phase, 'Fertile window');
check('inFertileWindow flag', c2.inFertileWindow, true);
// day 20 -> luteal
check('luteal on day 20',
  computeCycle({ periodStarts: ['2026-03-01'], cycleLength: 28 }, '2026-03-20').phase, 'Luteal');

// rolls forward when user hasn't logged in a while.
// Jan 1 -> Feb 28 is 58 days = 2 full 28-day cycles + 2, so cycle day 3.
const stale = computeCycle({ periodStarts: ['2026-01-01'], cycleLength: 28 }, '2026-02-28');
check('rolls forward stale log', stale.cycleDay, 3);
check('rolled-forward next period', stale.nextPeriodDate, '2026-03-26');

// uses observed average, not the stale manual estimate
const c3 = computeCycle({ periodStarts: ['2026-01-01', '2026-01-29', '2026-02-28'], cycleLength: 28 }, '2026-03-01');
check('prediction uses observed average 29', c3.cycleLength, 29);
check('lengthSource observed', c3.lengthSource, 'observed');

// future-dated entry must not produce negative/garbage cycle day
const future = computeCycle({ periodStarts: ['2026-05-01'], cycleLength: 28 }, '2026-04-01');
check('future-dated log clamps to day 1', future.cycleDay, 1);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
