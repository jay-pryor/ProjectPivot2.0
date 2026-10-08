import { get, live } from './data.js';
import { BANDS } from './matrix.js';
import { RECEPTORS } from './receptors.js';
import { addMonths, addDays, aestDate, reviewState } from './time.js';
import { ratingsOf, bandOf, lastReviewed } from './queries.js';

/** @typedef {import('./data.js').Data} Data */
/** @typedef {import('./data.js').Rec} Rec */
/** @typedef {'personnel' | 'environment' | 'capability'} Receptor */
/** @typedef {{ kind: 'fixed' } | { kind: 'longest' } | { kind: 'hazard', hazardId: string, receptor: Receptor, band: string }} Driver */
/** @typedef {{ months: number, driver: Driver }} Period */

/** A moved review date is urgent when the new date is this many days away or fewer (or passed). */
export const URGENT_DAYS = 30;

/** Bands in the order a policy lists them, worst first. */
export const POLICY_BANDS = BANDS;

/** The live policy a platform's rule names, or null. @param {Data} data @param {Rec} p @returns {Rec | null} */
export function policyOf(data, p) {
  if (p.reviewRule?.kind !== 'policy') return null;
  const pol = get(data, 'reviewPolicy', p.reviewRule.policyId);
  return pol && pol.status === 'live' ? pol : null;
}

/**
 * The period a policy gives a platform: for every live hazard on it and every receptor the policy
 * considers, the period its residual band has in the policy; the shortest of those and the
 * policy's longest. Ties keep the first found (hazards in link order, receptors in RECEPTORS order).
 * @param {Data} data @param {Rec} pol @param {string} platformId @returns {Period}
 */
function policyPeriod(data, pol, platformId) {
  /** @type {Period} */
  let best = { months: pol.longest, driver: { kind: 'longest' } };
  for (const link of live(data, 'hazardPlatform').filter((l) => l.platformId === platformId)) {
    const hazard = get(data, 'hazard', link.hazardId);
    if (!hazard || hazard.status !== 'live') continue;
    const residual = ratingsOf(data, link.hazardId, platformId).residual;
    for (const receptor of /** @type {Receptor[]} */ ([...RECEPTORS])) {
      const r = pol.receptors?.[receptor];
      if (!r?.considered) continue;
      const band = bandOf(residual[receptor]);
      const months = r.periods?.[band];
      if (Number.isInteger(months) && months < best.months) best = { months, driver: { kind: 'hazard', hazardId: link.hazardId, receptor, band } };
    }
  }
  return best;
}

/** @type {WeakMap<Data, Map<string, Period | null>>} */
const periodCache = new WeakMap();

/**
 * How often a platform is reviewed, and what sets that: its fixed months, or its policy's shortest
 * period (with the hazard, receptor and band giving it) or longest. Null with no rule, or a rule
 * naming a policy that no longer exists. Worked out once per data.
 * @param {Data} data @param {string} platformId @returns {Period | null}
 */
export function periodOf(data, platformId) {
  let m = periodCache.get(data);
  if (!m) periodCache.set(data, (m = new Map()));
  if (m.has(platformId)) return /** @type {Period | null} */ (m.get(platformId));
  const p = get(data, 'platform', platformId);
  /** @type {Period | null} */
  let out = null;
  if (p?.reviewRule?.kind === 'fixed') out = { months: p.reviewRule.months, driver: { kind: 'fixed' } };
  else if (p?.reviewRule?.kind === 'policy') {
    const pol = policyOf(data, p);
    out = pol ? policyPeriod(data, pol, platformId) : null;
  }
  m.set(platformId, out);
  return out;
}

/**
 * The next review due: the start plus one period, stepped on in whole periods (counted from the
 * start, so short months do not wear the day down) to the first date after the latest completed
 * review when that came on or after it. Null with no period or no start.
 * @param {Data} data @param {string} platformId @returns {string | null}
 */
export function dueOf(data, platformId) {
  const p = get(data, 'platform', platformId);
  const period = periodOf(data, platformId);
  if (!p || !period || !p.reviewStart) return null;
  const last = lastReviewed(data, platformId);
  const after = last ? aestDate(last) : null;
  let k = 1;
  let due = addMonths(p.reviewStart, period.months);
  while (after && due <= after) {
    k += 1;
    due = addMonths(p.reviewStart, k * period.months);
  }
  return due;
}

/**
 * Everything the screens say about a platform's schedule. `moved`: the calculated date differs
 * from the one its owner last acknowledged; `urgent`: moved, and the new date has passed or is
 * within URGENT_DAYS.
 * @param {Data} data @param {string} platformId @param {string} today
 */
export function scheduleOf(data, platformId, today) {
  const p = get(data, 'platform', platformId);
  const period = periodOf(data, platformId);
  const due = dueOf(data, platformId);
  const seen = p?.reviewDueSeen ?? null;
  const moved = Boolean(due && seen && due !== seen);
  return {
    rule: p?.reviewRule ?? null, policy: p ? policyOf(data, p) : null,
    months: period?.months ?? null, driver: period?.driver ?? null,
    start: p?.reviewStart ?? null, due, state: reviewState(due, today), seen, moved,
    urgent: moved && /** @type {string} */ (due) <= addDays(today, URGENT_DAYS),
  };
}
