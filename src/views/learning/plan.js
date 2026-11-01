// Daily learning planner. Pure functions: the Learning tab feeds in courses, settings and the
// career phases, and gets back today's objectives plus a projected finish date per course.
//
// Each study day gets `dailyMinutes`. Courses with a target date take their required pace first;
// the rest of the day goes to the highest-scoring course (current career phase, already started,
// priority), so you finish one course before spreading thin. The whole schedule is simulated
// day by day, which is also where the projected finish dates come from.

import { todayStr } from '../../dates';

const MIN_ITEM = 5; // items Coursera lists with no time still take a few minutes
const SLACK = 10; // a day may run this many minutes over rather than stop just short of an item
const HORIZON = 730; // days simulated before a course counts as "not scheduled"

const pad = (n) => String(n).padStart(2, '0');
const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const shiftDate = (s, days) => {
  const d = parse(s);
  d.setDate(d.getDate() + days);
  return fmt(d);
};
const weekday = (s) => parse(s).getDay();

export const itemMinutes = (it) => Math.max(it.minutes || 0, MIN_ITEM);

// Progress counts required items by minutes, so a 2-hour project weighs more than a reading.
export function courseStats(course) {
  const items = course.modules.flatMap((m) => m.items.filter((it) => !it.optional).map((it) => ({ ...it, moduleName: m.name })));
  const total = items.reduce((a, it) => a + itemMinutes(it), 0);
  const done = items.filter((it) => it.done).reduce((a, it) => a + itemMinutes(it), 0);
  return {
    items,
    totalMinutes: total,
    doneMinutes: done,
    remainingMinutes: total - done,
    percent: total ? Math.round((done / total) * 100) : 0,
    doneCount: items.filter((it) => it.done).length,
    count: items.length,
    next: items.find((it) => !it.done) || null,
    complete: items.length > 0 && items.every((it) => it.done),
  };
}

// Study days from `from` to `to`, both included.
function studyDaysBetween(from, to, studyDays) {
  let n = 0;
  for (let d = from; d <= to; d = shiftDate(d, 1)) if (studyDays.includes(weekday(d))) n++;
  return n;
}

// Minutes finished per local date, across every course (optional items count too: time was spent).
export function minutesByDate(courses) {
  const out = {};
  for (const c of courses) for (const m of c.modules) for (const it of m.items) {
    if (it.done && it.doneOn) out[it.doneOn] = (out[it.doneOn] || 0) + itemMinutes(it);
  }
  return out;
}

// Consecutive study days with some learning, ending today (or yesterday, if today hasn't started).
export function streak(byDate, studyDays, today = todayStr()) {
  let n = 0;
  let d = byDate[today] ? today : shiftDate(today, -1);
  for (let i = 0; i < 400; i++, d = shiftDate(d, -1)) {
    if (!studyDays.includes(weekday(d))) continue;
    if (!byDate[d]) break;
    n++;
  }
  return n;
}

export function buildPlan({ courses, settings, phases, currentPhaseId, today = todayStr() }) {
  const daily = settings?.dailyMinutes || 60;
  const studyDays = settings?.studyDays?.length ? settings.studyDays : [0, 1, 2, 3, 4, 5, 6];
  const doneToday = minutesByDate(courses)[today] || 0;
  const phaseIndex = (id) => phases.findIndex((p) => p.id === id);
  const currentIndex = phaseIndex(currentPhaseId);

  const score = (c, st) => {
    let s = 0;
    if (c.phaseId) {
      const i = phaseIndex(c.phaseId);
      // The current phase first, then catching up on earlier phases, then later ones.
      s += i === currentIndex ? 40 : i >= 0 && i < currentIndex ? 30 : 10;
    }
    if (st.doneMinutes > 0) s += 15;
    s += { high: 25, medium: 0, low: -20 }[c.priority] || 0;
    return s;
  };

  const open = courses
    .filter((c) => !c.archived)
    .map((c, order) => {
      const st = courseStats(c);
      return { course: c, stats: st, queue: st.items.filter((it) => !it.done), score: score(c, st), order, finish: null };
    })
    .filter((q) => q.queue.length);
  const byScore = [...open].sort((a, b) => b.score - a.score || a.order - b.order);
  const withDeadline = open.filter((q) => q.course.targetDate).sort((a, b) => a.course.targetDate.localeCompare(b.course.targetDate));

  // Pace each deadline course needs from today, before any simulation.
  const required = {};
  for (const q of withDeadline) {
    const days = q.course.targetDate >= today ? studyDaysBetween(today, q.course.targetDate, studyDays) : 0;
    required[q.course.id] = days ? Math.ceil(q.stats.remainingMinutes / days) : q.stats.remainingMinutes;
  }

  let todayPlan = [];
  let nextStudyDate = null;
  for (let i = 0; i < HORIZON && open.some((q) => q.queue.length); i++) {
    const date = shiftDate(today, i);
    if (!studyDays.includes(weekday(date))) continue;
    nextStudyDate ||= date;
    let budget = daily - (i === 0 ? doneToday : 0);
    if (budget < MIN_ITEM) continue; // today's goal already met
    let dayUsed = 0;
    const picks = new Map();

    const take = (q, limit) => {
      let used = 0;
      while (q.queue.length && budget > 0) {
        const m = itemMinutes(q.queue[0]);
        // Stop at the limit; only the day's very first item may be larger than what's left.
        if (used + m > limit + SLACK && (used > 0 || dayUsed > 0)) break;
        const it = q.queue.shift();
        used += m;
        dayUsed += m;
        budget -= m;
        if (!picks.has(q)) picks.set(q, []);
        picks.get(q).push(it);
      }
      if (!q.queue.length) q.finish = date;
    };

    for (const q of withDeadline) {
      if (!q.queue.length || budget < MIN_ITEM) continue;
      const left = q.course.targetDate >= date ? studyDaysBetween(date, q.course.targetDate, studyDays) : 0;
      const remaining = q.queue.reduce((a, it) => a + itemMinutes(it), 0);
      take(q, Math.min(budget, left ? Math.ceil(remaining / left) : remaining));
    }
    for (const q of byScore) {
      if (budget < MIN_ITEM) break;
      if (q.queue.length) take(q, budget);
    }

    if (i === 0) {
      todayPlan = [...picks].map(([q, items]) => ({
        course: q.course,
        items,
        minutes: items.reduce((a, it) => a + itemMinutes(it), 0),
      }));
    }
  }

  const projections = {};
  for (const q of open) {
    const target = q.course.targetDate;
    projections[q.course.id] = {
      finishDate: q.finish,
      onTrack: target ? !!q.finish && q.finish <= target : null,
      requiredPerDay: required[q.course.id] ?? null,
    };
  }
  const requiredTotal = Object.values(required).reduce((a, b) => a + b, 0);

  return {
    today,
    isStudyDay: studyDays.includes(weekday(today)),
    nextStudyDate,
    daily,
    doneToday,
    plan: todayPlan,
    projections,
    overloaded: requiredTotal > daily ? requiredTotal : 0,
  };
}
