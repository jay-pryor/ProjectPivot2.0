import { emptyData } from '../src/core/data.js';
import { createHazard, addCausalFactor, addConsequence } from '../src/core/ops/hazards.js';
import { createControl, linkControl } from '../src/core/ops/controls.js';
import { createPlatform, linkHazard } from '../src/core/ops/platforms.js';
import { setRule } from '../src/core/ops/reviews.js';
import { addMonths } from '../src/core/time.js';

export const act = { by: 'u1', at: '2026-09-28T10:00:00+10:00' };
export const later = { by: 'u2', at: '2026-09-28T11:00:00+10:00' };

/** h1 Fire (cf1, cq1, c1 preventative, c2 mitigating) on p1 Alpha and p2 Bravo; h2 Flood on nothing. */
export function seed() {
  let d = emptyData();
  d = createHazard(d, act, { id: 'h1', title: 'Fire' });
  d = createHazard(d, act, { id: 'h2', title: 'Flood' });
  d = addCausalFactor(d, act, { id: 'cf1', hazardId: 'h1', text: 'Hot works' });
  d = addConsequence(d, act, { id: 'cq1', hazardId: 'h1', text: 'Burns' });
  d = createControl(d, act, { id: 'c1', title: 'Sprinklers' });
  d = createControl(d, act, { id: 'c2', title: 'Fire drills' });
  d = linkControl(d, act, { hazardId: 'h1', controlId: 'c1', kind: 'preventative' });
  d = linkControl(d, act, { hazardId: 'h1', controlId: 'c2', kind: 'mitigating' });
  d = createPlatform(d, act, { id: 'p1', name: 'Alpha', ownerId: 'u1' });
  d = createPlatform(d, act, { id: 'p2', name: 'Bravo', ownerId: 'u2' });
  d = linkHazard(d, act, { hazardId: 'h1', platformId: 'p1' });
  d = linkHazard(d, act, { hazardId: 'h1', platformId: 'p2' });
  return d;
}

/**
 * The same data with these controls made existing controls (EC-…), so a test can add them on a
 * platform as existing controls. Their links as additional controls, if any, are left alone.
 * @param {import('../src/core/data.js').Data} d @param {...string} controlIds
 */
export function asExisting(d, ...controlIds) {
  const control = { ...d.records.control };
  for (const id of controlIds) if (control[id]) control[id] = { ...control[id], category: 'existing' };
  return { ...d, records: { ...d.records, control } };
}

/**
 * The data with a platform's owner having last seen `due` as its review date, as if the date has
 * since moved under them.
 * @param {import('../src/core/data.js').Data} d @param {string} platformId @param {string | null} due
 */
export function seeDue(d, platformId, due) {
  const r = d.records.reviewSeen?.[platformId] ?? { id: platformId, status: 'live', createdBy: act.by, createdAt: act.at, updatedBy: act.by, updatedAt: act.at, platformId };
  return { ...d, records: { ...d.records, reviewSeen: { ...d.records.reviewSeen, [platformId]: { ...r, due } } } };
}

/**
 * A fixed review rule whose next due date is `due`: the start is one period before it, and the
 * owner has seen that date. For tests that only care when a review falls due. A due date no
 * start can reach (31 Oct is never 6 months after a day in April) is refused, so a fixture never
 * drifts a day without saying so.
 * @param {import('../src/core/data.js').Data} d @param {string} platformId @param {number} months @param {string} due
 * @param {{ by: string, at: string }} [by] who sets it, and when (the usual act unless given)
 */
export function scheduleFixed(d, platformId, months, due, by = act) {
  const start = addMonths(due, -months);
  if (addMonths(start, months) !== due) throw new Error(`No start date is ${months} months before ${due}; pick another fixture date.`);
  return setRule(d, by, { platformId, kind: 'fixed', months, unit: 'months', start });
}
