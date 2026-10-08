import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../../src/core/errors.js';
import { ids } from '../../../src/core/ids.js';
import { entries } from '../../../src/core/history.js';
import { openReview } from '../../../src/core/queries.js';
import { linkHazard, retirePlatform, deletePlatform, createPlatform } from '../../../src/core/ops/platforms.js';
import {
  setRule, acknowledgeReviewDate, startReview, markRow, setReviewOutcome, completeReview, abandonReview, MAX_REVIEW_MONTHS, REVIEW_DETAIL_ACTIONS,
} from '../../../src/core/ops/reviews.js';
import { act, later, seed, scheduleFixed, seeDue } from '../../helpers.js';
import { scheduleOf, seenOf } from '../../../src/core/schedule.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
/** p1 Alpha (h1 on it) reviewed every 6 months, next due 2026-10-30 (counted from 2026-04-30). */
const scheduled = () => scheduleFixed(seed(), 'p1', 6, '2026-10-30');
const dueNow = (d, id = 'p1') => scheduleOf(d, id, '2026-09-28').due;
const started = () => startReview(scheduled(), act, { id: 'r1', platformId: 'p1' });

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

test('one review at a time per platform, and only on a live platform', () => {
  const d = started();
  const r = d.records.review.r1;
  assert.deepEqual(
    { platformId: r.platformId, state: r.state, outcome: r.outcome, dueBefore: r.dueBefore, dueAfter: r.dueAfter, completedBy: r.completedBy, completedAt: r.completedAt },
    { platformId: 'p1', state: 'open', outcome: '', dueBefore: null, dueAfter: null, completedBy: null, completedAt: null },
  );
  assert.throws(() => startReview(d, later, { platformId: 'p1' }), code('review.open'));
  assert.doesNotThrow(() => startReview(d, later, { platformId: 'p2' }), 'another platform is separate');
  assert.throws(() => startReview(retirePlatform(scheduled(), act, { id: 'p2' }), act, { platformId: 'p2' }), code('platform.retired'));
});

test('ticking and noting a hazard, which must be on the platform', () => {
  let d = markRow(started(), later, { reviewId: 'r1', hazardId: 'h1', reviewed: true });
  const id = ids.reviewRow('r1', 'h1');
  assert.deepEqual({ reviewed: d.records.reviewRow[id].reviewed, note: d.records.reviewRow[id].note }, { reviewed: true, note: '' });
  d = markRow(d, later, { reviewId: 'r1', hazardId: 'h1', note: '  Checked with the crew  ' });
  assert.deepEqual({ reviewed: d.records.reviewRow[id].reviewed, note: d.records.reviewRow[id].note }, { reviewed: true, note: 'Checked with the crew' }, 'a note keeps the tick');
  assert.deepEqual(entries(d).at(-1).platforms, ['p1']);
  assert.throws(() => markRow(d, later, { reviewId: 'r1', hazardId: 'h2', reviewed: true }), code('review.hazard'), 'h2 is on no platform');
  const linked = linkHazard(d, later, { hazardId: 'h2', platformId: 'p1' });
  assert.doesNotThrow(() => markRow(linked, later, { reviewId: 'r1', hazardId: 'h2', reviewed: true }), 'a hazard linked during the review can be ticked');
  assert.deepEqual(REVIEW_DETAIL_ACTIONS, ['Mark review row', 'Set review outcome', 'Set review notes']);
});

test('completing moves the due date on from the old due date by one period, and records the review', () => {
  let d = setReviewOutcome(started(), later, { reviewId: 'r1', outcome: 'All current' });
  d = completeReview(d, later, { reviewId: 'r1' });
  const r = d.records.review.r1;
  assert.deepEqual(
    { state: r.state, outcome: r.outcome, dueBefore: r.dueBefore, dueAfter: r.dueAfter, completedBy: r.completedBy, completedAt: r.completedAt },
    { state: 'completed', outcome: 'All current', dueBefore: '2026-10-30', dueAfter: '2027-04-30', completedBy: 'u2', completedAt: later.at },
  );
  assert.equal(dueNow(d), '2027-04-30');
  assert.equal(d.records.platform.p1.reviewStart, '2026-10-30', 'counted from the date it answered');
  assert.equal(seenOf(d, 'p1'), '2027-04-30');
  const row = d.records.reviewRow[ids.reviewRow('r1', 'h1')];
  assert.deepEqual({ reviewed: row.reviewed, note: row.note }, { reviewed: false, note: '' }, 'an unticked hazard is recorded as not reviewed');
  assert.equal(entries(d).at(-1).action, 'Complete review');
});

test('an early review does not push the schedule out, and month-end clamping does not come back', () => {
  let d = scheduleFixed(seed(), 'p1', 1, '2027-01-31');
  d = startReview(d, act, { id: 'r1', platformId: 'p1' });
  d = completeReview(d, act, { reviewId: 'r1' });
  assert.equal(dueNow(d), '2027-02-28', 'completed four months early, still one period on from the due date');
  d = startReview(d, act, { id: 'r2', platformId: 'p1' });
  d = completeReview(d, act, { reviewId: 'r2' });
  assert.equal(dueNow(d), '2027-03-28');
});

test('a review completed more than a period late moves on in whole periods until the date is after the completion', () => {
  let d = scheduleFixed(seed(), 'p1', 6, '2025-01-31');
  d = startReview(d, act, { id: 'r1', platformId: 'p1' });
  d = completeReview(d, act, { reviewId: 'r1' });
  assert.equal(d.records.review.r1.dueBefore, '2025-01-31');
  assert.equal(dueNow(d), '2027-01-31', 'act is 2026-09-28: 2025-07-31, 2026-01-31 and 2026-07-31 are all past');
  let e = scheduleFixed(seed(), 'p1', 6, '2026-09-01');
  e = startReview(e, act, { id: 'r2', platformId: 'p1' });
  e = completeReview(e, act, { reviewId: 'r2' });
  assert.equal(dueNow(e), '2027-03-01', 'a little late: one period on, not pulled forward to today');
});

test('a platform with no hazards can be reviewed', () => {
  let d = createPlatform(seed(), act, { id: 'p9', name: 'Empty', ownerId: 'u1' });
  d = scheduleFixed(d, 'p9', 12, '2026-12-01');
  d = startReview(d, act, { id: 'r9', platformId: 'p9' });
  d = completeReview(d, act, { reviewId: 'r9' });
  assert.equal(d.records.review.r9.state, 'completed');
  assert.equal(dueNow(d, 'p9'), '2027-12-01');
  assert.equal(Object.values(d.records.reviewRow).filter((r) => r.reviewId === 'r9').length, 0);
});

test('completing needs a schedule; a completed review cannot be changed', () => {
  const noSchedule = startReview(seed(), act, { id: 'r1', platformId: 'p1' });
  assert.throws(() => completeReview(noSchedule, act, { reviewId: 'r1' }), code('review.no-schedule'));
  const done = completeReview(started(), act, { reviewId: 'r1' });
  assert.throws(() => markRow(done, later, { reviewId: 'r1', hazardId: 'h1', reviewed: true }), code('review.completed'));
  assert.throws(() => setReviewOutcome(done, later, { reviewId: 'r1', outcome: 'x' }), code('review.completed'));
  assert.throws(() => completeReview(done, later, { reviewId: 'r1' }), code('review.completed'));
  assert.throws(() => abandonReview(done, later, { reviewId: 'r1' }), code('review.completed'));
});

test('abandoning deletes the review and its rows, and another can then be started', () => {
  let d = markRow(started(), later, { reviewId: 'r1', hazardId: 'h1', reviewed: true });
  d = abandonReview(d, later, { reviewId: 'r1' });
  assert.equal(d.records.review.r1.status, 'deleted');
  assert.equal(d.records.reviewRow[ids.reviewRow('r1', 'h1')].status, 'deleted');
  assert.equal(openReview(d, 'p1'), null);
  assert.equal(entries(d).at(-1).action, 'Abandon review');
  assert.doesNotThrow(() => startReview(d, later, { platformId: 'p1' }));
  assert.throws(() => markRow(d, later, { reviewId: 'r1', hazardId: 'h1', reviewed: true }), code('not-found'));
});

test('retiring or deleting a platform abandons its open review in the same entry', () => {
  const d = retirePlatform(markRow(started(), later, { reviewId: 'r1', hazardId: 'h1', reviewed: true }), later, { id: 'p1' });
  assert.equal(d.records.review.r1.status, 'deleted');
  assert.equal(d.records.reviewRow[ids.reviewRow('r1', 'h1')].status, 'deleted');
  assert.equal(entries(d).at(-1).action, 'Retire platform');
  let e = createPlatform(seed(), act, { id: 'p9', name: 'Empty', ownerId: 'u1' });
  e = startReview(e, act, { id: 'r9', platformId: 'p9' });
  e = deletePlatform(e, later, { id: 'p9' });
  assert.equal(e.records.review.r9.status, 'deleted');
});

test('completing moves the start to the date answered and steps past the completion, even many periods late', () => {
  let d = started();
  d = completeReview(d, { by: 'u1', at: '2027-09-01T09:00:00+10:00' }, { reviewId: 'r1' });
  const p = d.records.platform.p1;
  assert.equal(p.reviewStart, '2026-10-30', 'the date that review answered');
  assert.equal(d.records.review.r1.dueBefore, '2026-10-30');
  assert.equal(d.records.review.r1.dueAfter, '2027-10-30', 'two periods on: the first after 1 Sep 2027');
  assert.equal(seenOf(d, 'p1'), '2027-10-30');
  assert.equal(scheduleOf(d, 'p1', '2027-09-01').due, '2027-10-30');
});
