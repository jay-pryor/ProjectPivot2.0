import { PivotError } from '../errors.js';
import { newId } from '../ids.js';
import { get, all, created, changed, need, needText, put } from '../data.js';
import { commit } from '../apply.js';
import { isDate } from '../time.js';
import { dueOf, seenOf, POLICY_BANDS } from '../schedule.js';
import { RECEPTORS } from '../receptors.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */
/** @typedef {import('../data.js').Rec} Rec */

export const MAX_REVIEW_MONTHS = 120;

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
export function seenRec(data, act, platformId, due) {
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
  const rec = created(act, id, { name: needPolicyName(data, name, null), order, receptors });
  return commit(data, act, 'Create review policy', [{ kind: 'reviewPolicy', rec }]);
}

/**
 * One change to a policy: a band's period for a receptor (blank clears it), or whether a receptor
 * is considered.
 * @param {Data} data @param {Act} act
 * @param {{ id: string, receptor?: string, band?: string, months?: unknown, unit?: unknown, considered?: unknown }} args
 */
export function updateReviewPolicy(data, act, { id, receptor, band, months, unit, considered }) {
  const pol = need(data, 'reviewPolicy', id);
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
