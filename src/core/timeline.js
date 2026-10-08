import { addMonths, aestDate } from './time.js';
import { periodOf, dueOf } from './schedule.js';
import { completedReviews, openReview } from './queries.js';
import { get } from './data.js';

/** @typedef {import('./data.js').Data} Data */
/** @typedef {{ kind: 'due' | 'overdue' | 'dueWas' | 'projected' | 'done' | 'late' | 'open', date: string }} Mark */

/** A YYYY-MM month moved on (or back) by `n` months. @param {string} ym @param {number} n */
export function shiftMonth(ym, n) {
  const t = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** `length` months from `startYm`, as YYYY-MM. @param {string} startYm @param {number} length */
export function monthsInRange(startYm, length) {
  return Array.from({ length }, (_, i) => shiftMonth(startYm, i));
}

/**
 * Where the timeline starts: the chosen month or this one, a year earlier when the past is shown.
 * @param {{ start: string | null, past: boolean }} prefs @param {string} today
 */
export function rangeStart(prefs, today) {
  const from = prefs.start ?? today.slice(0, 7);
  return prefs.past ? shiftMonth(from, -12) : from;
}

/**
 * What the timeline draws for one platform, by month: completed reviews (late when done after the
 * date they answered), a review in progress (in the month it started), the next review due (an
 * overdue one in this month, with a mark where it was due), and the reviews after it at today's
 * period. The later ones are projections: they assume today's ratings hold.
 * @param {Data} data @param {string} platformId @param {string} today @param {string[]} months
 * @returns {Record<string, Mark[]>}
 */
export function timelineMarks(data, platformId, today, months) {
  /** @type {Record<string, Mark[]>} */
  const out = {};
  const inRange = new Set(months);
  /** @param {string} ym @param {Mark} mark */
  const add = (ym, mark) => {
    if (inRange.has(ym)) (out[ym] ??= []).push(mark);
  };
  for (const { review } of completedReviews(data, platformId).slice().reverse()) {
    const done = aestDate(review.completedAt);
    add(done.slice(0, 7), { kind: review.dueBefore && done > review.dueBefore ? 'late' : 'done', date: done });
  }
  const open = openReview(data, platformId);
  if (open) add(aestDate(open.createdAt).slice(0, 7), { kind: 'open', date: aestDate(open.createdAt) });
  const due = dueOf(data, platformId);
  const period = periodOf(data, platformId);
  if (!due || !period) return out;
  if (due < today) {
    if (due.slice(0, 7) !== today.slice(0, 7)) add(due.slice(0, 7), { kind: 'dueWas', date: due });
    add(today.slice(0, 7), { kind: 'overdue', date: due });
  } else add(due.slice(0, 7), { kind: 'due', date: due });
  // Later reviews fall on the schedule's own dates, counted from its start (so a month-end day is
  // kept); after an overdue one, from the first after today, as completing it today would give.
  const start = /** @type {string} */ (get(data, 'platform', platformId)?.reviewStart);
  const after = due < today ? today : due;
  const last = months.at(-1) ?? '';
  for (let k = 1; ; k += 1) {
    const next = addMonths(start, k * period.months);
    if (next.slice(0, 7) > last) break;
    if (next > after) add(next.slice(0, 7), { kind: 'projected', date: next });
  }
  return out;
}
