import { test } from 'node:test';
import assert from 'node:assert/strict';
import { platformView } from '../../src/ui/screens/platforms.js';
import { KIND_LABEL, recordName } from '../../src/ui/names.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { setRule, createReviewPolicy } from '../../src/core/ops/reviews.js';
import { state } from './screens-reviews-tab.test.js';
import { seed, later, scheduleFixed } from '../helpers.js';

const history = (d) => platformView({ ...state, view: { name: 'platform', id: 'p1', tab: 'history' } }, d, 'p1').toString();

test('a rule change reads in words in the platform history', () => {
  const d = setRule(scheduleFixed(assignNumbers(seed()), 'p1', 6, '2026-12-30'), later, { platformId: 'p1', kind: 'fixed', months: '2', unit: 'years' });
  const out = history(d);
  assert.match(out, /review rule[\s\S]*?fixed, every 6 months[\s\S]*?fixed, every 2 years/);
  assert.doesNotMatch(out, /kind fixed; months/);
});

test('a policy rule reads as the policy, and a policy is named by its name', () => {
  let d = createReviewPolicy(assignNumbers(seed()), later, { id: 'pol1', name: 'Standard' });
  d = setRule(d, later, { platformId: 'p1', kind: 'policy', policyId: 'pol1', start: '2026-01-01' });
  assert.match(history(d), /review rule[\s\S]*?a review policy/);
  assert.equal(KIND_LABEL.reviewPolicy, 'Review policy');
  assert.equal(recordName('reviewPolicy', d.records.reviewPolicy.pol1, d), 'Standard');
});
