import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../../src/core/errors.js';
import { entries } from '../../../src/core/history.js';
import { platformsReached } from '../../../src/core/queries.js';
import { checkRules } from '../../../src/core/rules.js';
import { NOT_ACKNOWLEDGED } from '../../../src/core/acks.js';
import { createReviewPolicy, updateReviewPolicy, renameReviewPolicy, deleteReviewPolicy, setRule } from '../../../src/core/ops/reviews.js';
import { act, seed } from '../../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
const made = () => createReviewPolicy(seed(), act, { id: 'pol1', name: 'Standard' });

test('a new policy considers every receptor and drives nothing', () => {
  const pol = made().records.reviewPolicy.pol1;
  assert.equal(pol.name, 'Standard');
  assert.ok(!('longest' in pol), 'there is no longest period');
  for (const r of ['personnel', 'environment', 'capability']) {
    assert.equal(pol.receptors[r].considered, true);
    assert.deepEqual(Object.values(pol.receptors[r].periods), [null, null, null, null, null, null, null]);
  }
  assert.equal(entries(made()).at(-1).action, 'Create review policy');
  assert.throws(() => createReviewPolicy(made(), act, { name: ' standard ' }), code('reviewPolicy.duplicate'));
  assert.throws(() => createReviewPolicy(seed(), act, { name: '  ' }), code('empty'));
});

test('a policy cell takes months or years, or blank; a receptor can be left out', () => {
  let d = updateReviewPolicy(made(), act, { id: 'pol1', receptor: 'personnel', band: 'Serious', months: '6', unit: 'months' });
  d = updateReviewPolicy(d, act, { id: 'pol1', receptor: 'personnel', band: 'Medium', months: '3', unit: 'years' });
  d = updateReviewPolicy(d, act, { id: 'pol1', receptor: 'capability', considered: false });
  const pol = d.records.reviewPolicy.pol1;
  assert.equal(pol.receptors.personnel.periods.Serious, 6);
  assert.equal(pol.receptors.personnel.periods.Medium, 36);
  assert.equal(pol.receptors.capability.considered, false);
  d = updateReviewPolicy(d, act, { id: 'pol1', receptor: 'personnel', band: 'Serious', months: '' });
  assert.equal(d.records.reviewPolicy.pol1.receptors.personnel.periods.Serious, null, 'blank clears a cell');
  assert.throws(() => updateReviewPolicy(d, act, { id: 'pol1', receptor: 'personnel', band: 'Serious', months: '0', unit: 'months' }), code('review.months'));
  assert.throws(() => updateReviewPolicy(d, act, { id: 'pol1', receptor: 'people', band: 'Serious', months: '6' }), code('reviewPolicy.receptor'));
  assert.throws(() => updateReviewPolicy(d, act, { id: 'pol1', receptor: 'personnel', band: 'Awful', months: '6' }), code('reviewPolicy.band'));
});

test('renaming checks for clashes; a policy in use cannot be deleted', () => {
  let d = createReviewPolicy(made(), act, { id: 'pol2', name: 'Light' });
  assert.throws(() => renameReviewPolicy(d, act, { id: 'pol2', name: 'STANDARD' }), code('reviewPolicy.duplicate'));
  d = renameReviewPolicy(d, act, { id: 'pol2', name: 'Lighter' });
  assert.equal(d.records.reviewPolicy.pol2.name, 'Lighter');
  d = setRule(d, act, { platformId: 'p1', kind: 'policy', policyId: 'pol1', start: '2026-01-01' });
  assert.throws(() => deleteReviewPolicy(d, act, { id: 'pol1' }), (e) => code('reviewPolicy.inUse')(e) && /Alpha/.test(e.message));
  d = deleteReviewPolicy(d, act, { id: 'pol2' });
  assert.equal(d.records.reviewPolicy.pol2.status, 'deleted');
});

test('a policy reaches the platforms that use it; a rule naming a gone policy is reported', () => {
  let d = setRule(made(), act, { platformId: 'p1', kind: 'policy', policyId: 'pol1', start: '2026-01-01' });
  assert.deepEqual(platformsReached(d, 'reviewPolicy', d.records.reviewPolicy.pol1), ['p1']);
  // As a merge could leave it: the policy deleted under a platform still using it.
  const pol = { ...d.records.reviewPolicy.pol1, status: 'deleted' };
  d = { ...d, records: { ...d.records, reviewPolicy: { pol1: pol } } };
  assert.ok(checkRules(d).some((p) => p.rule === 'platform-policy-missing'));
});

test('acknowledging a review date never itself waits for acknowledgement', () => {
  assert.ok(NOT_ACKNOWLEDGED.includes('Acknowledge review date'));
});
