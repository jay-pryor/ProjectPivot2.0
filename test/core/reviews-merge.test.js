import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeData } from '../../src/core/merge.js';
import { checkRules } from '../../src/core/rules.js';
import { ids } from '../../src/core/ids.js';
import { put, changed } from '../../src/core/data.js';
import { retirePlatform, linkHazard } from '../../src/core/ops/platforms.js';
import { setSchedule, startReview, markRow, completeReview, abandonReview } from '../../src/core/ops/reviews.js';
import { seed } from '../helpers.js';

const setup = { by: 'u1', at: '2026-09-28T09:00:00+10:00' };
const me = { by: 'me', at: '2026-09-28T12:00:00+10:00' };
const them = { by: 'them', at: '2026-09-28T12:30:00+10:00' };
const saveAct = { by: 'me', at: '2026-09-28T13:00:00+10:00' };

/** p1 with h1 and h2, a 6-monthly schedule due 2026-10-31, and review r1 open. */
function base() {
  let d = linkHazard(seed(), setup, { hazardId: 'h2', platformId: 'p1' });
  d = setSchedule(d, setup, { platformId: 'p1', months: 6, due: '2026-10-31' });
  return startReview(d, setup, { id: 'r1', platformId: 'p1' });
}
const names = (violations) => violations.map((v) => v.rule).sort();

test('the rules: an open review needs a live platform, one open review per platform, rows follow their review', () => {
  const d = base();
  assert.deepEqual(checkRules(d), []);
  const retired = put(d, 'platform', { ...d.records.platform.p1, status: 'retired' });
  assert.deepEqual(names(checkRules(retired)), ['review-on-platform-not-live']);
  const second = put(d, 'review', { ...d.records.review.r1, id: 'r2' });
  assert.deepEqual(names(checkRules(second)), ['two-open-reviews']);
  const ticked = markRow(d, me, { reviewId: 'r1', hazardId: 'h1', reviewed: true });
  const orphan = put(ticked, 'review', { ...ticked.records.review.r1, status: 'deleted' });
  assert.deepEqual(names(checkRules(orphan)), ['review-row-orphaned']);
  const rowId = ids.reviewRow('r1', 'h1');
  const done = completeReview(ticked, me, { reviewId: 'r1' });
  assert.deepEqual(checkRules(done), []);
  const tampered = put(done, 'reviewRow', changed(done.records.reviewRow[rowId], them, { note: 'after' }));
  assert.deepEqual(names(checkRules(tampered)), ['completed-review-changed']);
});

test('two people ticking different hazards in the same review: both ticks are kept', () => {
  const b = base();
  const mine = markRow(b, me, { reviewId: 'r1', hazardId: 'h1', reviewed: true });
  const theirs = markRow(b, them, { reviewId: 'r1', hazardId: 'h2', reviewed: true, note: 'Seen' });
  const { data, conflicts } = mergeData(b, mine, theirs, saveAct);
  assert.deepEqual(conflicts, []);
  assert.equal(data.records.reviewRow[ids.reviewRow('r1', 'h1')].reviewed, true);
  assert.equal(data.records.reviewRow[ids.reviewRow('r1', 'h2')].note, 'Seen');
});

test('both completing the same review moves the due date on once', () => {
  const b = base();
  const { data } = mergeData(b, completeReview(b, me, { reviewId: 'r1' }), completeReview(b, them, { reviewId: 'r1' }), saveAct);
  assert.equal(data.records.platform.p1.reviewDue, '2027-04-30');
  assert.equal(data.records.review.r1.completedBy, 'me');
  assert.deepEqual(checkRules(data), []);
});

test('both starting a review on the same platform: mine stays open, theirs is deleted and they are told', () => {
  const b = setSchedule(seed(), setup, { platformId: 'p1', months: 6, due: '2026-10-31' });
  const mine = startReview(b, me, { id: 'rm', platformId: 'p1' });
  let theirs = startReview(b, them, { id: 'rt', platformId: 'p1' });
  theirs = markRow(theirs, them, { reviewId: 'rt', hazardId: 'h1', reviewed: true });
  const { data, conflicts } = mergeData(b, mine, theirs, saveAct);
  assert.equal(data.records.review.rm.state, 'open');
  assert.equal(data.records.review.rt.status, 'deleted');
  assert.equal(data.records.reviewRow[ids.reviewRow('rt', 'h1')].status, 'deleted');
  assert.ok(conflicts.some((c) => c.kind === 'review' && c.id === 'rt' && c.overriddenBy === 'them'));
  assert.deepEqual(checkRules(data), []);
});

test('I retire the platform while they start a review on it: their review is deleted', () => {
  const b = setSchedule(seed(), setup, { platformId: 'p1', months: 6, due: '2026-10-31' });
  const { data } = mergeData(b, retirePlatform(b, me, { id: 'p1' }), startReview(b, them, { id: 'rt', platformId: 'p1' }), saveAct);
  assert.equal(data.records.platform.p1.status, 'retired');
  assert.equal(data.records.review.rt.status, 'deleted');
  assert.deepEqual(checkRules(data), []);
});

test('I complete a review they abandoned: the completed review keeps every row', () => {
  const b0 = base();
  const b = markRow(b0, setup, { reviewId: 'r1', hazardId: 'h1', reviewed: true });
  const { data } = mergeData(b, completeReview(b, me, { reviewId: 'r1' }), abandonReview(b, them, { reviewId: 'r1' }), saveAct);
  assert.equal(data.records.review.r1.state, 'completed');
  assert.equal(data.records.reviewRow[ids.reviewRow('r1', 'h1')].status, 'live');
  assert.equal(data.records.reviewRow[ids.reviewRow('r1', 'h1')].reviewed, true);
  assert.deepEqual(checkRules(data), []);
});

test('a row they add to a review I completed, for a hazard only they linked, is dropped', () => {
  let b = setSchedule(seed(), setup, { platformId: 'p1', months: 6, due: '2026-10-31' });
  b = startReview(b, setup, { id: 'r1', platformId: 'p1' });
  let theirs = linkHazard(b, them, { hazardId: 'h2', platformId: 'p1' });
  theirs = markRow(theirs, them, { reviewId: 'r1', hazardId: 'h2', reviewed: true });
  const { data } = mergeData(b, completeReview(b, me, { reviewId: 'r1' }), theirs, saveAct);
  assert.equal(data.records.reviewRow[ids.reviewRow('r1', 'h2')].status, 'deleted');
  assert.deepEqual(checkRules(data), []);
});
