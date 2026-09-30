import { PivotError } from '../errors.js';
import { newId, ids } from '../ids.js';
import { get, live, created, changed, need } from '../data.js';
import { commit } from '../apply.js';
import { addMonths, aestDate, isDate } from '../time.js';
import { openReview } from '../queries.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */
/** @typedef {import('../data.js').Rec} Rec */

export const MAX_REVIEW_MONTHS = 120;

/** Row-level review actions: kept in the history, but left out of the platform's History tab. */
export const REVIEW_DETAIL_ACTIONS = Object.freeze(['Mark review row', 'Set review outcome', 'Set review notes']);

/** @param {unknown} v */
const blank = (v) => v === undefined || v === null || v === '';

/**
 * Set a platform's review period and next due date together, or clear both.
 * @param {Data} data @param {Act} act @param {{ platformId: string, months?: number | string | null, due?: string | null }} args
 */
export function setSchedule(data, act, { platformId, months, due }) {
  const p = need(data, 'platform', platformId);
  if (blank(months) && blank(due)) {
    return commit(data, act, 'Remove review schedule', [{ kind: 'platform', rec: changed(p, act, { reviewMonths: null, reviewDue: null }) }]);
  }
  const n = blank(months) ? NaN : Number(months);
  if (!Number.isInteger(n) || n < 1 || n > MAX_REVIEW_MONTHS) {
    throw new PivotError('review.months', `A review period is a whole number of months from 1 to ${MAX_REVIEW_MONTHS}.`);
  }
  if (!isDate(due)) throw new PivotError('review.due', 'Give the next review date as a real date.');
  return commit(data, act, 'Set review schedule', [{ kind: 'platform', rec: changed(p, act, { reviewMonths: n, reviewDue: due }) }]);
}

/** @param {Data} data @param {string} reviewId */
function needOpen(data, reviewId) {
  const r = need(data, 'review', reviewId);
  if (r.state !== 'open') throw new PivotError('review.completed', 'That review is completed and can no longer be changed.');
  return r;
}

/** @param {Data} data @param {Act} act @param {{ id?: string, platformId: string }} args */
export function startReview(data, act, { id = newId(), platformId }) {
  const p = need(data, 'platform', platformId);
  if (p.status !== 'live') throw new PivotError('platform.retired', `${p.name} is retired, so it cannot be reviewed.`);
  if (openReview(data, platformId)) throw new PivotError('review.open', `${p.name} already has a review in progress.`);
  const rec = created(act, id, { platformId, state: 'open', outcome: '', notes: '', dueBefore: null, dueAfter: null, completedBy: null, completedAt: null });
  return commit(data, act, 'Start review', [{ kind: 'review', rec }]);
}

/**
 * Tick or untick a hazard in an open review, or change its note. Either may be left out.
 * @param {Data} data @param {Act} act @param {{ reviewId: string, hazardId: string, reviewed?: boolean, note?: string }} args
 */
export function markRow(data, act, { reviewId, hazardId, reviewed, note }) {
  const r = needOpen(data, reviewId);
  const link = get(data, 'hazardPlatform', ids.hazardPlatform(hazardId, r.platformId));
  if (!link || link.status !== 'live') throw new PivotError('review.hazard', 'That hazard is not on this platform.');
  const id = ids.reviewRow(reviewId, hazardId);
  const existing = get(data, 'reviewRow', id);
  const fields = {
    ...(reviewed === undefined ? {} : { reviewed: Boolean(reviewed) }),
    ...(note === undefined ? {} : { note: String(note).trim() }),
  };
  const rec = existing && existing.status === 'live'
    ? changed(existing, act, fields)
    : created(act, id, { reviewId, hazardId, reviewed: false, note: '', ...fields });
  return commit(data, act, 'Mark review row', [{ kind: 'reviewRow', rec }]);
}

/** @param {Data} data @param {Act} act @param {{ reviewId: string, outcome: string }} args */
export function setReviewOutcome(data, act, { reviewId, outcome }) {
  const r = needOpen(data, reviewId);
  return commit(data, act, 'Set review outcome', [{ kind: 'review', rec: changed(r, act, { outcome: String(outcome ?? '').trim() }) }]);
}

/** Anything else worth keeping with the review, beside its outcome. @param {Data} data @param {Act} act @param {{ reviewId: string, notes: string }} args */
export function setReviewNotes(data, act, { reviewId, notes }) {
  const r = needOpen(data, reviewId);
  return commit(data, act, 'Set review notes', [{ kind: 'review', rec: changed(r, act, { notes: String(notes ?? '').trim() }) }]);
}

/**
 * Complete a review. The due date moves on from the old due date in whole periods, to the first
 * date after today: a late review does not pull the schedule forward, an early one does not push
 * it out, and one completed several periods late does not leave the platform still overdue. Every
 * hazard on the platform with no row gets one, not reviewed, so the review records what it covered.
 * Every row is marked final, so a merge sees the completion as a change to each row: another
 * user's abandoning the same review then conflicts with it, and the completed rows are kept.
 * @param {Data} data @param {Act} act @param {{ reviewId: string }} args
 */
export function completeReview(data, act, { reviewId }) {
  const r = needOpen(data, reviewId);
  const p = need(data, 'platform', r.platformId);
  if (!p.reviewMonths || !p.reviewDue) throw new PivotError('review.no-schedule', `Set a review schedule for ${p.name} first.`);
  const today = aestDate(act.at);
  let k = 1;
  let dueAfter = addMonths(p.reviewDue, p.reviewMonths);
  while (dueAfter <= today) {
    k += 1;
    dueAfter = addMonths(p.reviewDue, k * p.reviewMonths);
  }
  /** @type {{ kind: string, rec: Rec }[]} */
  const recs = [];
  for (const link of live(data, 'hazardPlatform').filter((l) => l.platformId === p.id)) {
    const id = ids.reviewRow(reviewId, link.hazardId);
    const row = get(data, 'reviewRow', id);
    if (!row || row.status !== 'live') recs.push({ kind: 'reviewRow', rec: created(act, id, { reviewId, hazardId: link.hazardId, reviewed: false, note: '', final: true }) });
  }
  for (const row of live(data, 'reviewRow').filter((x) => x.reviewId === reviewId)) recs.push({ kind: 'reviewRow', rec: changed(row, act, { final: true }) });
  recs.push({ kind: 'review', rec: changed(r, act, { state: 'completed', dueBefore: p.reviewDue, dueAfter, completedBy: act.by, completedAt: act.at }) });
  recs.push({ kind: 'platform', rec: changed(p, act, { reviewDue: dueAfter }) });
  return commit(data, act, 'Complete review', recs);
}

/**
 * The records that abandon a review: it and its live rows, marked deleted.
 * @param {Data} data @param {Act} act @param {Rec} review
 * @returns {{ kind: string, rec: Rec }[]}
 */
export function abandonRecs(data, act, review) {
  return [
    { kind: 'review', rec: changed(review, act, { status: 'deleted' }) },
    ...live(data, 'reviewRow').filter((x) => x.reviewId === review.id).map((x) => ({ kind: 'reviewRow', rec: changed(x, act, { status: 'deleted' }) })),
  ];
}

/** @param {Data} data @param {Act} act @param {{ reviewId: string }} args */
export function abandonReview(data, act, { reviewId }) {
  return commit(data, act, 'Abandon review', abandonRecs(data, act, needOpen(data, reviewId)));
}
