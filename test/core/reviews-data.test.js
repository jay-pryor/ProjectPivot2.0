import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, emptyData, normalizeData, validateData, put, created } from '../../src/core/data.js';
import { platformsReached, openReview } from '../../src/core/queries.js';
import { createPlatform } from '../../src/core/ops/platforms.js';
import { KIND_LABEL } from '../../src/ui/names.js';
import { act, seed, beginPlatformReview } from '../helpers.js';

test('reviews and workflows are record kinds; review rows are gone', () => {
  assert.ok(KINDS.includes('review'));
  assert.ok(KINDS.includes('workflow'));
  assert.ok(!KINDS.includes('reviewRow'));
  assert.deepEqual(emptyData().records.review, {});
  assert.equal(KIND_LABEL.review, 'Review');
});

test('a new platform has no review schedule', () => {
  const d = createPlatform(emptyData(), act, { id: 'p9', name: 'Spare', ownerId: 'u1' });
  assert.deepEqual([d.records.platform.p9.reviewRule, d.records.platform.p9.reviewStart, d.records.reviewSeen.p9], [null, null, undefined]);
});

test('an older data file gains the review kinds on load, and still validates', () => {
  const old = emptyData();
  delete old.records.review;
  delete old.records.workflow;
  old.records.platform.p1 = created(act, 'p1', { number: 1, name: 'Alpha', ownerId: 'u1' });
  const d = normalizeData(old);
  assert.deepEqual(d.records.review, {});
  assert.deepEqual(d.records.workflow, {});
  assert.deepEqual(validateData(d), []);
});

test('a completed review reaches its platform; a workflow reaches none; openReview finds the open Platform Review', () => {
  let d = seed();
  d = put(d, 'review', created(act, 'r0', { platformId: 'p1', workflowId: null, state: 'completed', outcome: '', dueBefore: null, dueAfter: null, completedBy: 'u1', completedAt: act.at }));
  assert.deepEqual(platformsReached(d, 'review', d.records.review.r0), ['p1']);
  d = beginPlatformReview(d, act, { id: 'w1', platformId: 'p1' });
  assert.deepEqual(platformsReached(d, 'workflow', d.records.workflow.w1), []);
  assert.equal(openReview(d, 'p1')?.id, 'w1');
  assert.equal(openReview(d, 'p1')?.type, 'platformReview');
  assert.equal(openReview(d, 'p2'), null);
});
