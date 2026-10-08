import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completedReviews, lastReviewed, hazardLastReviewed, reviewDueList } from '../../src/core/queries.js';
import { linkHazard, unlinkHazard } from '../../src/core/ops/platforms.js';
import { assignHazardNumbers } from '../../src/core/ops/hazards.js';
import { later, seed, scheduleFixed, beginPlatformReview, finishPlatformReview } from '../helpers.js';

const t1 = { by: 'u1', at: '2026-09-28T10:00:00+10:00' };
const t2 = { by: 'u2', at: '2026-10-05T10:00:00+10:00' };

test('past reviews come with the workflow that completed them; last reviewed and a hazard\'s last review', () => {
  let d = assignHazardNumbers(seed());
  d = scheduleFixed(d, 'p1', 6, '2026-10-30');
  d = finishPlatformReview(beginPlatformReview(d, t1, { id: 'w1', platformId: 'p1' }), t1, { workflowId: 'w1' });
  d = linkHazard(d, later, { hazardId: 'h2', platformId: 'p1' });
  d = finishPlatformReview(beginPlatformReview(d, t2, { id: 'w2', platformId: 'p1' }), t2, { workflowId: 'w2' });
  assert.deepEqual(completedReviews(d, 'p1').map((c) => c.workflow?.id), ['w2', 'w1']);
  assert.equal(lastReviewed(d, 'p1'), t2.at);
  assert.equal(lastReviewed(d, 'p2'), null);
  assert.equal(hazardLastReviewed(d, 'h1', 'p1'), t2.at);
  assert.equal(hazardLastReviewed(d, 'h2', 'p1'), t2.at, 'h2 joined after the first review');
  assert.equal(hazardLastReviewed(d, 'h2', 'p2'), null);
  d = unlinkHazard(d, later, { hazardId: 'h2', platformId: 'p1' });
  assert.equal(hazardLastReviewed(d, 'h1', 'p1'), t2.at);
});

test('reviewDueList: scheduled live platforms, soonest first, with their state', () => {
  let d = scheduleFixed(seed(), 'p1', 6, '2026-12-30');
  d = scheduleFixed(d, 'p2', 6, '2026-09-01');
  assert.deepEqual(reviewDueList(d, '2026-09-28').map((x) => [x.platform.id, x.state, x.due]), [['p2', 'overdue', '2026-09-01'], ['p1', 'ok', '2026-12-30']]);
  assert.deepEqual(reviewDueList(seed(), '2026-09-28'), []);
});
