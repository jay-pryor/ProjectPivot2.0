import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, SCHEMA_VERSION, put, created, changed } from '../../src/core/data.js';
import { reviewState } from '../../src/core/time.js';
import { periodOf, dueOf, scheduleOf } from '../../src/core/schedule.js';
import { setRating } from '../../src/core/ops/assessment.js';
import { unlinkHazard } from '../../src/core/ops/platforms.js';
import { act, seed, seeDue } from '../helpers.js';

const BLANK = { High: null, Serious: null, Medium: null, Low: null, Eliminated: null, 'Not Credible': null, Uncategorised: null };
/** Serious → 6 months, Medium → 36 months for personnel; environment Serious → 12; capability not considered. */
const policy = (over = {}) => created(act, 'pol1', {
  name: 'Standard', order: 1,
  receptors: {
    personnel: { considered: true, periods: { ...BLANK, Serious: 6, Medium: 36 } },
    environment: { considered: true, periods: { ...BLANK, Serious: 12 } },
    capability: { considered: false, periods: { ...BLANK, Serious: 1, Medium: 1 } },
  },
  ...over,
});
/** p1 on the policy, counted from 2026-01-01. h1 is the only hazard on p1. */
function onPolicy(over) {
  let d = put(seed(), 'reviewPolicy', policy(over));
  d = put(d, 'platform', changed(d.records.platform.p1, act, { reviewRule: { kind: 'policy', policyId: 'pol1' }, reviewStart: '2026-01-01' }));
  return d;
}
const residual = (d, receptor, consequence, likelihood) => setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor, consequence, likelihood });
/** p1 with a fixed rule. */
const fixed = (months, start) => put(seed(), 'platform', changed(seed().records.platform.p1, act, { reviewRule: { kind: 'fixed', months }, reviewStart: start }));

test('review policies are a record kind, under schema 4', () => {
  assert.ok(KINDS.includes('reviewPolicy'));
  assert.equal(SCHEMA_VERSION, 4);
});

test('reviewState reads a due date against today', () => {
  assert.equal(reviewState(null, '2026-10-08'), 'none');
  assert.equal(reviewState('2026-10-07', '2026-10-08'), 'overdue');
  assert.equal(reviewState('2026-11-07', '2026-10-08'), 'dueSoon');
  assert.equal(reviewState('2026-11-08', '2026-10-08'), 'ok');
});

test('a fixed rule gives its months; no rule gives no period', () => {
  assert.equal(periodOf(seed(), 'p1'), null);
  const d = fixed(24, '2026-01-31');
  assert.deepEqual(periodOf(d, 'p1'), { months: 24, driver: { kind: 'fixed' } });
  assert.equal(dueOf(d, 'p1'), '2028-01-31');
});

test('a policy takes the shortest period any hazard gives for a considered receptor', () => {
  let d = residual(onPolicy(), 'personnel', 3, 'C'); // Medium → 36
  assert.deepEqual(periodOf(d, 'p1'), { months: 36, driver: { kind: 'hazard', hazardId: 'h1', receptor: 'personnel', band: 'Medium' } });
  d = residual(d, 'environment', 2, 'C'); // Serious → 12
  assert.equal(periodOf(d, 'p1')?.months, 12);
  d = residual(d, 'capability', 2, 'C'); // Serious, but capability is not considered
  assert.equal(periodOf(d, 'p1')?.months, 12);
  d = residual(d, 'personnel', 2, 'C'); // Serious → 6
  assert.deepEqual(periodOf(d, 'p1'), { months: 6, driver: { kind: 'hazard', hazardId: 'h1', receptor: 'personnel', band: 'Serious' } });
});

test('when no hazard falls in a band with a period, a policy gives no period and no review date', () => {
  assert.equal(periodOf(onPolicy(), 'p1'), null, 'unrated, and Uncategorised is blank');
  assert.equal(scheduleOf(onPolicy(), 'p1', '2026-10-08').due, null);
  assert.equal(scheduleOf(onPolicy(), 'p1', '2026-10-08').state, 'none');
  const withUnrated = onPolicy({ receptors: { ...policy().receptors, personnel: { considered: true, periods: { ...BLANK, Uncategorised: 3 } } } });
  assert.deepEqual(periodOf(withUnrated, 'p1'), { months: 3, driver: { kind: 'hazard', hazardId: 'h1', receptor: 'personnel', band: 'Uncategorised' } }, 'Uncategorised has its own row');
  const noHazards = unlinkHazard(onPolicy(), act, { hazardId: 'h1', platformId: 'p1' });
  assert.equal(periodOf(noHazards, 'p1'), null);
});

test('a rule naming a missing or deleted policy reads as no schedule', () => {
  let d = onPolicy();
  d = put(d, 'reviewPolicy', changed(d.records.reviewPolicy.pol1, act, { status: 'deleted' }));
  assert.equal(periodOf(d, 'p1'), null);
  assert.equal(scheduleOf(d, 'p1', '2026-10-08').state, 'none');
});

test('the next due date steps past the latest completed review, in whole periods from the start', () => {
  let d = fixed(6, '2026-01-31');
  assert.equal(dueOf(d, 'p1'), '2026-07-31');
  d = put(d, 'review', created(act, 'r1', { platformId: 'p1', state: 'completed', completedAt: '2027-03-01T09:00:00+10:00', dueBefore: '2026-01-31', dueAfter: null, completedBy: 'u1', outcome: '', notes: '' }));
  assert.equal(dueOf(d, 'p1'), '2027-07-31', 'three periods on, the first after 1 Mar 2027');
});

test('scheduleOf says whether the due date moved from what the owner saw, and whether that is urgent', () => {
  let d = residual(onPolicy(), 'personnel', 3, 'C'); // 36 months from 2026-01-01 → 2029-01-01
  d = seeDue(d, 'p1', '2029-01-01');
  const s = scheduleOf(d, 'p1', '2026-10-08');
  assert.deepEqual([s.due, s.state, s.moved, s.urgent], ['2029-01-01', 'ok', false, false]);
  d = residual(d, 'personnel', 2, 'C'); // 6 months → 2026-07-01, already passed
  const m = scheduleOf(d, 'p1', '2026-10-08');
  assert.deepEqual([m.due, m.state, m.moved, m.urgent, m.seen], ['2026-07-01', 'overdue', true, true, '2029-01-01']);
  d = residual(d, 'personnel', 3, 'C');
  d = residual(d, 'environment', 2, 'C'); // 12 months → 2027-01-01: moved, not urgent
  const n = scheduleOf(d, 'p1', '2026-10-08');
  assert.deepEqual([n.due, n.moved, n.urgent], ['2027-01-01', true, false]);
});
