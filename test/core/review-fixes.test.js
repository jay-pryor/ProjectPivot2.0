import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { mergeData } from '../../src/core/merge.js';
import { put, changed, created } from '../../src/core/data.js';
import { retirePlatform, updatePlatform } from '../../src/core/ops/platforms.js';
import { createReviewPolicy, setRule, deleteReviewPolicy, acknowledgeReviewDate } from '../../src/core/ops/reviews.js';
import { dueOf, scheduleOf } from '../../src/core/schedule.js';
import { monthsInRange, timelineMarks } from '../../src/core/timeline.js';
import { seed, act, later, scheduleFixed } from '../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;

test('Final C1: a policy a retired platform still names cannot be deleted, so restoring the platform never leaves a rule without its policy', () => {
  let d = createReviewPolicy(seed(), act, { id: 'pol1', name: 'Standard' });
  d = setRule(d, act, { platformId: 'p1', kind: 'policy', policyId: 'pol1', start: '2026-01-01' });
  d = retirePlatform(d, act, { id: 'p1' });
  assert.throws(() => deleteReviewPolicy(d, act, { id: 'pol1' }), (e) => code('reviewPolicy.inUse')(e) && /Alpha/.test(e.message));
});

test('Final I1: an overdue platform has no projected reviews at or before today, only after it', () => {
  const d = scheduleFixed(seed(), 'p1', 1, '2026-06-15');
  const marks = timelineMarks(d, 'p1', '2026-10-08', monthsInRange('2025-10', 24));
  for (const [ym, list] of Object.entries(marks)) {
    for (const m of list) if (m.kind === 'projected') assert.ok(m.date > '2026-10-08', `projected ${m.date} in ${ym}`);
  }
  assert.deepEqual(marks['2026-10'], [{ kind: 'overdue', date: '2026-06-15' }, { kind: 'projected', date: '2026-10-15' }], 'the first after today, on the schedule’s day');
  assert.deepEqual(marks['2026-11'], [{ kind: 'projected', date: '2026-11-15' }]);
  assert.equal(marks['2026-07'], undefined, 'no phantom reviews while it was overdue');
});

test('Final I2: the next due date is worked out once per data', () => {
  const d = scheduleFixed(seed(), 'p1', 6, '2026-12-15');
  assert.equal(dueOf(d, 'p1'), '2026-12-15');
  // Data is never changed in place; doing so here shows the answer comes from the first working-out.
  d.records.review.rX = created(act, 'rX', { platformId: 'p1', state: 'completed', completedAt: '2027-01-10T09:00:00+10:00', dueBefore: '2026-12-15', dueAfter: null, completedBy: 'u1', outcome: '', notes: '' });
  assert.equal(dueOf(d, 'p1'), '2026-12-15');
});

test('Final I3: acknowledging a moved review date does not overwrite someone else’s edit to the platform in a merge', () => {
  let base = scheduleFixed(seed(), 'p1', 6, '2026-12-30');
  base = setRule(base, act, { platformId: 'p1', kind: 'fixed', months: 3, unit: 'months', start: '2026-06-30' });
  // The owner had last seen another date.
  base = put(base, 'reviewSeen', { ...base.records.reviewSeen.p1, due: '2026-12-30' });
  assert.equal(scheduleOf(base, 'p1', '2026-10-08').moved, true);
  const mine = acknowledgeReviewDate(base, later, { platformId: 'p1' });
  const theirs = updatePlatform(base, { by: 'u2', at: '2026-09-28T10:30:00+10:00' }, { id: 'p1', name: 'Alpha Mk2' });
  const { data, conflicts } = mergeData(base, mine, theirs, later);
  assert.equal(data.records.platform.p1.name, 'Alpha Mk2', 'their rename stands');
  assert.equal(scheduleOf(data, 'p1', '2026-10-08').moved, false, 'and my acknowledgement too');
  assert.equal(conflicts.length, 0);
});
