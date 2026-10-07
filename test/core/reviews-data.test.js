import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, emptyData, normalizeData, validateData, put, created } from '../../src/core/data.js';
import { ids } from '../../src/core/ids.js';
import { platformsReached, openReview } from '../../src/core/queries.js';
import { createPlatform } from '../../src/core/ops/platforms.js';
import { KIND_LABEL } from '../../src/ui/names.js';
import { act, seed } from '../helpers.js';

test('reviews and their rows are record kinds', () => {
  assert.ok(KINDS.includes('review'));
  assert.ok(KINDS.includes('reviewRow'));
  assert.deepEqual(emptyData().records.review, {});
  assert.equal(ids.reviewRow('r1', 'h1'), 'rr:r1:h1');
  assert.equal(KIND_LABEL.review, 'Review');
  assert.equal(KIND_LABEL.reviewRow, 'Review row');
});

test('a new platform has no review schedule', () => {
  const d = createPlatform(emptyData(), act, { id: 'p9', name: 'Spare', ownerId: 'u1' });
  assert.equal(d.records.platform.p9.reviewMonths, null);
  assert.equal(d.records.platform.p9.reviewDue, null);
});

test('an older data file gains the review kinds on load, and still validates', () => {
  const old = emptyData();
  delete old.records.review;
  delete old.records.reviewRow;
  old.records.platform.p1 = created(act, 'p1', { number: 1, name: 'Alpha', ownerId: 'u1' });
  const d = normalizeData(old);
  assert.deepEqual(d.records.review, {});
  assert.deepEqual(d.records.reviewRow, {});
  assert.deepEqual(validateData(d), []);
});

test('a review and its rows reach their platform; openReview finds the open one', () => {
  let d = seed();
  d = put(d, 'review', created(act, 'r1', { platformId: 'p1', state: 'open', outcome: '', dueBefore: null, dueAfter: null, completedBy: null, completedAt: null }));
  const row = created(act, ids.reviewRow('r1', 'h1'), { reviewId: 'r1', hazardId: 'h1', reviewed: true, note: '' });
  assert.deepEqual(platformsReached(d, 'review', d.records.review.r1), ['p1']);
  assert.deepEqual(platformsReached(d, 'reviewRow', row), ['p1']);
  assert.deepEqual(platformsReached(d, 'reviewRow', { ...row, reviewId: 'gone' }), []);
  assert.equal(openReview(d, 'p1')?.id, 'r1');
  assert.equal(openReview(d, 'p2'), null);
  d = put(d, 'review', { ...d.records.review.r1, state: 'completed' });
  assert.equal(openReview(d, 'p1'), null);
});
