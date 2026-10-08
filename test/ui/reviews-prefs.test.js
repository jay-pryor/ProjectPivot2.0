import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage } from '../fakes/storage.js';
import { readReviewsPrefs, writeReviewsPrefs, DEFAULT_REVIEWS_PREFS, reviewsPrefsKey } from '../../src/ui/reviews-prefs.js';

test('Reviews filters and range are remembered per folder and profile', () => {
  const s = new MemoryStorage();
  const key = reviewsPrefsKey('Pivot data', 'u1');
  assert.deepEqual(readReviewsPrefs(s, key), DEFAULT_REVIEWS_PREFS);
  const mine = { ...DEFAULT_REVIEWS_PREFS, owner: 'everyone', length: 60, start: '2026-01', past: true };
  writeReviewsPrefs(s, key, mine);
  assert.deepEqual(readReviewsPrefs(s, key), mine);
  assert.deepEqual(readReviewsPrefs(s, reviewsPrefsKey('Pivot data', 'u2')), DEFAULT_REVIEWS_PREFS, 'another profile starts afresh');
});

test('anything odd or refused reads as the defaults; a refused write is ignored', () => {
  const s = new MemoryStorage();
  const key = reviewsPrefsKey('Pivot data', 'u1');
  s.setItem(key, '{"length": 7, "start": "nope", "owner": 3}');
  assert.deepEqual(readReviewsPrefs(s, key), DEFAULT_REVIEWS_PREFS);
  s.setItem(key, 'not json');
  assert.deepEqual(readReviewsPrefs(s, key), DEFAULT_REVIEWS_PREFS);
  assert.deepEqual(readReviewsPrefs({ getItem() { throw new Error('refused'); } }, key), DEFAULT_REVIEWS_PREFS);
  assert.doesNotThrow(() => writeReviewsPrefs({ setItem() { throw new Error('full'); } }, key, DEFAULT_REVIEWS_PREFS));
});
