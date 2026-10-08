import { PivotError } from '../errors.js';
import { newId, ids } from '../ids.js';
import { get, all, live, created, changed, need, needText, put } from '../data.js';
import { commit } from '../apply.js';
import { isDate } from '../time.js';
import { openReview } from '../queries.js';
import { dueOf, seenOf, POLICY_BANDS } from '../schedule.js';
import { RECEPTORS } from '../receptors.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */
/** @typedef {import('../data.js').Rec} Rec */

export const MAX_REVIEW_MONTHS = 120;

/** A new policy is reviewed at least this often, until someone says otherwise. */
const DEFAULT_LONGEST = 36;

/** Row-level review actions: kept in the history, but left out of the platform's History tab. */
export const REVIEW_DETAIL_ACTIONS = Object.freeze(['Mark review row', 'Set review outcome', 'Set review notes']);

/** @param {unknown} v */
const blank = (v) => v === undefined || v === null || v === '';

/**
 * A period from a form: a whole number of months or years, as months from 1 to MAX_REVIEW_MONTHS.
 * @param {unknown} n @param {unknown} unit 'years', or months otherwise @param {string} code
 */
export function toMonths(n, unit, code) {
  const v = blank(n) ? NaN : Number(n);
  const months = unit === 'years' ? v * 12 : v;
  if (!Number.isInteger(v) || months < 1 || months > MAX_REVIEW_MONTHS) {
    throw new PivotError(code, `A review period is a whole number of months or years, from 1 month to ${MAX_REVIEW_MONTHS / 12} years.`);
  }
  return months;
}

/**
 * The record of the due date a platform's owner last saw. It is a record of its own, not a
 * platform field, so acknowledging a date never overwrites someone else's edit to the platform
 * when their saves are merged.
 * @param {Data} data @param {Act} act @param {string} platformId @param {string | null} due
 * @returns {{ kind: string, rec: Rec }}
 */
function seenRec(data, act, platformId, due) {
  const r = get(data, 'reviewSeen', platformId);
  return { kind: 'reviewSeen', rec: r ? changed(r, act, { status: 'live', due }) : created(act, platformId, { platformId, due }) };
}

/**
 * Set how a platform's reviews are scheduled: none, a fixed period, or a review policy. A first
 * rule needs a start date (the date reviews are counted from); after that the start is kept
 * unless a new one is given. A start given blank (a cleared date field) is refused.
 * @param {Data} data @param {Act} act
 * @param {{ platformId: string, kind: string, months?: unknown, unit?: unknown, policyId?: string, start?: unknown }} args
 */
export function setRule(data, act, { platformId, kind, months, unit, policyId, start }) {
  const p = need(data, 'platform', platformId);
  if (kind === 'none') {
    return commit(data, act, 'Remove review rule', [{ kind: 'platform', rec: changed(p, act, { reviewRule: null, reviewStart: null }) }, seenRec(data, act, p.id, null)]);
  }
  /** @type {any} */
  let rule;
  if (kind === 'fixed') rule = { kind: 'fixed', months: toMonths(months, unit, 'review.months') };
  else if (kind === 'policy') rule = { kind: 'policy', policyId: need(data, 'reviewPolicy', /** @type {string} */ (policyId)).id };
  else throw new PivotError('review.rule', 'Choose no schedule, a fixed period or a review policy.');
  const from = start === undefined || start === null ? p.reviewStart : start;
  if (!isDate(from)) throw new PivotError('review.start', 'Give the date reviews are counted from as a real date.');
  // Whoever sets the rule has seen the date it gives.
  const rec = changed(p, act, { reviewRule: rule, reviewStart: from });
  return commit(data, act, 'Set review rule', [{ kind: 'platform', rec }, seenRec(data, act, p.id, dueOf(put(data, 'platform', rec), p.id))]);
}

/**
 * The owner has seen that the platform's review date moved: the calculated date becomes the
 * seen one. Nothing happens when nothing moved.
 * @param {Data} data @param {Act} act @param {{ platformId: string }} args
 */
export function acknowledgeReviewDate(data, act, { platformId }) {
  need(data, 'platform', platformId);
  const due = dueOf(data, platformId);
  if (!due || due === seenOf(data, platformId)) return data;
  return commit(data, act, 'Acknowledge review date', [seenRec(data, act, platformId, due)]);
}

/** A policy name, trimmed, not blank, and not another policy's (ignoring case). @param {Data} data @param {unknown} name @param {string | null} self */
function needPolicyName(data, name, self) {
  const n = needText(name, 'A policy name');
  const clash = all(data, 'reviewPolicy').find((x) => x.status !== 'deleted' && x.id !== self && String(x.name).toLowerCase() === n.toLowerCase());
  if (clash) throw new PivotError('reviewPolicy.duplicate', `There is already a policy called ${clash.name}.`);
  return n;
}

/** @returns {Record<string, number | null>} */
const blankPeriods = () => Object.fromEntries(POLICY_BANDS.map((b) => [b, null]));

/**
 * A review policy sets a platform's review period from its residual risk: a period for each band,
 * for each receptor it considers, the shortest any hazard gives being used.
 * @param {Data} data @param {Act} act @param {{ id?: string, name: string }} args
 */
export function createReviewPolicy(data, act, { id = newId(), name }) {
  const order = Math.max(0, ...all(data, 'reviewPolicy').map((x) => (Number.isInteger(x.order) ? x.order : 0))) + 1;
  const receptors = Object.fromEntries(RECEPTORS.map((r) => [r, { considered: true, periods: blankPeriods() }]));
  const rec = created(act, id, { name: needPolicyName(data, name, null), order, longest: DEFAULT_LONGEST, receptors });
  return commit(data, act, 'Create review policy', [{ kind: 'reviewPolicy', rec }]);
}

/**
 * One change to a policy: a band's period for a receptor (blank clears it), whether a receptor is
 * considered, or the longest period.
 * @param {Data} data @param {Act} act
 * @param {{ id: string, receptor?: string, band?: string, months?: unknown, unit?: unknown, considered?: unknown, longest?: unknown, longestUnit?: unknown }} args
 */
export function updateReviewPolicy(data, act, { id, receptor, band, months, unit, considered, longest, longestUnit }) {
  const pol = need(data, 'reviewPolicy', id);
  if (longest !== undefined) {
    return commit(data, act, 'Change review policy', [{ kind: 'reviewPolicy', rec: changed(pol, act, { longest: toMonths(longest, longestUnit, 'review.months') }) }]);
  }
  if (!RECEPTORS.includes(/** @type {any} */ (receptor))) throw new PivotError('reviewPolicy.receptor', 'Choose personnel, environment or capability.');
  const r = /** @type {string} */ (receptor);
  const was = pol.receptors[r];
  /** @type {any} */
  let next;
  if (considered !== undefined) next = { ...was, considered: considered === true || considered === 'true' };
  else {
    if (!POLICY_BANDS.includes(/** @type {any} */ (band))) throw new PivotError('reviewPolicy.band', 'That is not a risk band.');
    next = { ...was, periods: { ...was.periods, [/** @type {string} */ (band)]: blank(months) ? null : toMonths(months, unit, 'review.months') } };
  }
  return commit(data, act, 'Change review policy', [{ kind: 'reviewPolicy', rec: changed(pol, act, { receptors: { ...pol.receptors, [r]: next } }) }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string, name: string }} args */
export function renameReviewPolicy(data, act, { id, name }) {
  const pol = need(data, 'reviewPolicy', id);
  return commit(data, act, 'Rename review policy', [{ kind: 'reviewPolicy', rec: changed(pol, act, { name: needPolicyName(data, name, id) }) }]);
}

/**
 * A policy any platform not deleted uses cannot be deleted, retired ones too (restoring one would
 * leave its rule without a policy); the refusal names them.
 * @param {Data} data @param {Act} act @param {{ id: string }} args
 */
export function deleteReviewPolicy(data, act, { id }) {
  const pol = need(data, 'reviewPolicy', id);
  const users = all(data, 'platform').filter((p) => p.status !== 'deleted' && p.reviewRule?.kind === 'policy' && p.reviewRule.policyId === id);
  if (users.length) throw new PivotError('reviewPolicy.inUse', `${pol.name} is used by ${users.map((p) => p.name).join(', ')}. Give them another rule first.`);
  return commit(data, act, 'Delete review policy', [{ kind: 'reviewPolicy', rec: changed(pol, act, { status: 'deleted' }) }]);
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
 * Complete a review. The schedule then counts from the date this review answered, so a late
 * review does not drift it and an early one does not push it out; the next date steps on in whole
 * periods to the first after today, so one completed several periods late does not leave the
 * platform still overdue. The new date is marked seen. Every hazard on the platform with no row
 * gets one, not reviewed, so the review records what it covered. Every row is marked final, so a
 * merge sees the completion as a change to each row: another user's abandoning the same review
 * then conflicts with it, and the completed rows are kept.
 * @param {Data} data @param {Act} act @param {{ reviewId: string }} args
 */
export function completeReview(data, act, { reviewId }) {
  const r = needOpen(data, reviewId);
  const p = need(data, 'platform', r.platformId);
  const dueBefore = dueOf(data, p.id);
  if (!dueBefore) throw new PivotError('review.no-schedule', `Set a review schedule for ${p.name} first.`);
  /** @type {{ kind: string, rec: Rec }[]} */
  const recs = [];
  for (const link of live(data, 'hazardPlatform').filter((l) => l.platformId === p.id)) {
    const id = ids.reviewRow(reviewId, link.hazardId);
    const row = get(data, 'reviewRow', id);
    if (!row || row.status !== 'live') recs.push({ kind: 'reviewRow', rec: created(act, id, { reviewId, hazardId: link.hazardId, reviewed: false, note: '', final: true }) });
  }
  for (const row of live(data, 'reviewRow').filter((x) => x.reviewId === reviewId)) recs.push({ kind: 'reviewRow', rec: changed(row, act, { final: true }) });
  const done = changed(r, act, { state: 'completed', dueBefore, completedBy: act.by, completedAt: act.at });
  const counted = changed(p, act, { reviewStart: dueBefore });
  const dueAfter = /** @type {string} */ (dueOf(put(put(data, 'review', done), 'platform', counted), p.id));
  recs.push({ kind: 'review', rec: changed(done, act, { dueAfter }) });
  recs.push({ kind: 'platform', rec: counted }, seenRec(data, act, p.id, dueAfter));
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
