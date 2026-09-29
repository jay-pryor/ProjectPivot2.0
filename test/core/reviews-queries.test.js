import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewRows, completedReviews, lastReviewed, hazardLastReviewed, reviewDueList } from '../../src/core/queries.js';
import { linkHazard, unlinkHazard } from '../../src/core/ops/platforms.js';
import { confirmControl } from '../../src/core/ops/assessment.js';
import { assignHazardNumbers } from '../../src/core/ops/hazards.js';
import { setSchedule, startReview, markRow, completeReview } from '../../src/core/ops/reviews.js';
import { act, later, seed } from '../helpers.js';

const t1 = { by: 'u1', at: '2026-09-28T10:00:00+10:00' };
const t2 = { by: 'u2', at: '2026-10-05T10:00:00+10:00' };

function reviewing() {
  let d = assignHazardNumbers(seed());
  d = linkHazard(d, act, { hazardId: 'h2', platformId: 'p1' });
  d = confirmControl(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1' });
  d = setSchedule(d, act, { platformId: 'p1', months: 6, due: '2026-10-31' });
  d = startReview(d, act, { id: 'r1', platformId: 'p1' });
  return markRow(d, t1, { reviewId: 'r1', hazardId: 'h1', reviewed: true, note: 'Fine' });
}

test('an open review lists every hazard on the platform with its current ratings and control decisions', () => {
  const items = reviewRows(reviewing(), 'r1');
  assert.deepEqual(items.map((i) => [i.hazard.id, i.reportId, i.onPlatform, i.reviewed, i.note]), [
    ['h1', 'H-0001', true, true, 'Fine'],
    ['h2', 'H-0002', true, false, ''],
  ]);
  assert.deepEqual(items[0].counts, { confirmed: 1, excluded: 0, awaiting: 1 });
  assert.deepEqual(items[0].rating, { initial: null, residual: null });
});

test('a hazard unlinked during a review keeps its row, shown as off the platform, and comes back when relinked', () => {
  let d = unlinkHazard(reviewing(), later, { hazardId: 'h1', platformId: 'p1' });
  let h1 = reviewRows(d, 'r1').find((i) => i.hazard.id === 'h1');
  assert.deepEqual([h1.onPlatform, h1.reviewed, h1.note, h1.rating, h1.counts], [false, true, 'Fine', null, null]);
  d = linkHazard(d, later, { hazardId: 'h1', platformId: 'p1' });
  h1 = reviewRows(d, 'r1').find((i) => i.hazard.id === 'h1');
  assert.deepEqual([h1.onPlatform, h1.reviewed, h1.note], [true, true, 'Fine']);
});

test('a completed review lists exactly what it covered; past reviews, last reviewed and a hazard\'s last review', () => {
  let d = completeReview(reviewing(), t1, { reviewId: 'r1' });
  d = linkHazard(d, later, { hazardId: 'h2', platformId: 'p2' });
  assert.deepEqual(reviewRows(d, 'r1').map((i) => [i.hazard.id, i.reviewed, i.rating, i.counts]), [['h1', true, null, null], ['h2', false, null, null]]);
  d = startReview(d, t2, { id: 'r2', platformId: 'p1' });
  d = markRow(d, t2, { reviewId: 'r2', hazardId: 'h2', reviewed: true });
  d = completeReview(d, t2, { reviewId: 'r2' });
  assert.deepEqual(completedReviews(d, 'p1').map((c) => [c.review.id, c.ticked, c.notTicked]), [['r2', 1, 1], ['r1', 1, 1]]);
  assert.equal(lastReviewed(d, 'p1'), t2.at);
  assert.equal(lastReviewed(d, 'p2'), null);
  assert.equal(hazardLastReviewed(d, 'h1', 'p1'), t1.at, 'h1 was not ticked in r2');
  assert.equal(hazardLastReviewed(d, 'h2', 'p1'), t2.at);
  assert.equal(hazardLastReviewed(d, 'h2', 'p2'), null);
});

test('reviewDueList: scheduled live platforms, soonest first, with their state', () => {
  let d = setSchedule(seed(), act, { platformId: 'p1', months: 6, due: '2026-12-31' });
  d = setSchedule(d, act, { platformId: 'p2', months: 6, due: '2026-09-01' });
  assert.deepEqual(reviewDueList(d, '2026-09-28').map((x) => [x.platform.id, x.state, x.due]), [['p2', 'overdue', '2026-09-01'], ['p1', 'ok', '2026-12-31']]);
  assert.deepEqual(reviewDueList(seed(), '2026-09-28'), []);
});
