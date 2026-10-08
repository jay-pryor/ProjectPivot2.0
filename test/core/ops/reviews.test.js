import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../../src/core/errors.js';
import { entries } from '../../../src/core/history.js';
import { setRule, acknowledgeReviewDate, MAX_REVIEW_MONTHS } from '../../../src/core/ops/reviews.js';
import { act, later, seed, scheduleFixed, seeDue } from '../../helpers.js';
import { scheduleOf, seenOf } from '../../../src/core/schedule.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
/** p1 Alpha (h1 on it) reviewed every 6 months, next due 2026-10-30 (counted from 2026-04-30). */
const scheduled = () => scheduleFixed(seed(), 'p1', 6, '2026-10-30');
const dueNow = (d, id = 'p1') => scheduleOf(d, id, '2026-09-28').due;

test('a fixed rule is 1 to 120 months, given in months or years, from a real start date; none clears it', () => {
  const d = scheduled();
  assert.deepEqual(d.records.platform.p1.reviewRule, { kind: 'fixed', months: 6 });
  assert.equal(d.records.platform.p1.reviewStart, '2026-04-30');
  assert.equal(dueNow(d), '2026-10-30');
  assert.equal(seenOf(d, 'p1'), '2026-10-30', 'whoever sets the rule has seen its date');
  assert.equal(entries(d).at(-1).action, 'Set review rule');
  const years = setRule(seed(), act, { platformId: 'p1', kind: 'fixed', months: '2', unit: 'years', start: '2026-01-01' });
  assert.deepEqual(years.records.platform.p1.reviewRule, { kind: 'fixed', months: 24 });
  assert.equal(MAX_REVIEW_MONTHS, 120);
  for (const [months, unit] of [[0, 'months'], [121, 'months'], [11, 'years'], [1.5, 'months'], ['x', 'months'], ['', 'months']]) {
    assert.throws(() => setRule(seed(), act, { platformId: 'p1', kind: 'fixed', months, unit, start: '2026-01-01' }), code('review.months'), `${months} ${unit}`);
  }
  assert.throws(() => setRule(seed(), act, { platformId: 'p1', kind: 'fixed', months: 6, unit: 'months', start: '2026-02-30' }), code('review.start'));
  const cleared = setRule(d, later, { platformId: 'p1', kind: 'none' });
  assert.deepEqual([cleared.records.platform.p1.reviewRule, cleared.records.platform.p1.reviewStart, seenOf(cleared, 'p1')], [null, null, null]);
  assert.equal(entries(cleared).at(-1).action, 'Remove review rule');
});

test('changing only the rule keeps the start; a cleared start is refused; a policy rule needs a live policy', () => {
  const d = setRule(scheduled(), act, { platformId: 'p1', kind: 'fixed', months: 12, unit: 'months' });
  assert.equal(d.records.platform.p1.reviewStart, '2026-04-30');
  assert.throws(() => setRule(scheduled(), act, { platformId: 'p1', kind: 'fixed', months: 12, unit: 'months', start: '' }), code('review.start'));
  assert.throws(() => setRule(seed(), act, { platformId: 'p1', kind: 'policy', policyId: 'nope', start: '2026-01-01' }), code('not-found'));
  assert.throws(() => setRule(seed(), act, { platformId: 'p1', kind: 'fixed', months: 6, unit: 'months' }), code('review.start'), 'a first rule needs a start');
});

test('acknowledging a moved review date makes the calculated date the seen one', () => {
  let d = setRule(scheduled(), later, { platformId: 'p1', kind: 'fixed', months: 3, unit: 'months' });
  // A rule change is seen by whoever made it; move the date under the owner another way.
  d = seeDue(d, 'p1', '2026-10-30');
  assert.equal(scheduleOf(d, 'p1', '2026-09-28').moved, true);
  d = acknowledgeReviewDate(d, later, { platformId: 'p1' });
  assert.equal(scheduleOf(d, 'p1', '2026-09-28').moved, false);
  assert.equal(entries(d).at(-1).action, 'Acknowledge review date');
  assert.equal(acknowledgeReviewDate(d, act, { platformId: 'p1' }), d, 'nothing to acknowledge changes nothing');
});
