import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertBody } from '../../scripts/convert-to-v4.mjs';
import { emptyData, created } from '../../src/core/data.js';
import { act } from '../helpers.js';

/** A schema 3 body: p1 every 6 months due 31 Oct, p2 with no schedule. */
function v3() {
  const d = emptyData();
  delete d.records.reviewPolicy;
  d.records.platform.p1 = created(act, 'p1', { number: 1, name: 'A', ownerId: 'u1', reviewMonths: 6, reviewDue: '2026-10-31' });
  d.records.platform.p2 = created(act, 'p2', { number: 2, name: 'B', ownerId: 'u1', reviewMonths: null, reviewDue: null });
  return d;
}

test('a schema 3 schedule becomes a fixed rule counted from one period before its due date', () => {
  const p1 = convertBody(v3()).records.platform.p1;
  assert.deepEqual(p1.reviewRule, { kind: 'fixed', months: 6 });
  assert.equal(p1.reviewStart, '2026-04-30');
  assert.ok(!('reviewMonths' in p1) && !('reviewDue' in p1));
});

test('the date marked seen is the one the app will calculate, so nothing reads as moved', () => {
  const out = convertBody(v3());
  assert.deepEqual([out.records.reviewSeen.p1.platformId, out.records.reviewSeen.p1.due, out.records.reviewSeen.p1.status], ['p1', '2026-10-30', 'live'], '30 Apr + 6 months: a month-end due loses a day');
  assert.ok(!('reviewDueSeen' in out.records.platform.p1));
});

test('a platform with no schedule gets an empty rule, and the data gains the policy kind', () => {
  const out = convertBody(v3());
  const p2 = out.records.platform.p2;
  assert.deepEqual([p2.reviewRule, p2.reviewStart, out.records.reviewSeen.p2], [null, null, undefined]);
  assert.deepEqual(out.records.reviewPolicy, {});
});
