import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewsView } from '../../src/ui/screens/reviews.js';
import { createPlatformGroup, tagPlatform } from '../../src/core/ops/platform-groups.js';
import { state as base, data } from './screens-reviews-tab.test.js';
import { act } from '../helpers.js';

// p1 (Ada) every 6 months, overdue since 1 Sep 2026; p2 (Grace) no schedule; today 28 Sep 2026.
const state = { ...base, view: { name: 'reviews', tab: 'timeline' }, reviewsPrefs: { ...base.reviewsPrefs, start: '2026-07', length: 12 } };

test('the timeline has a column per month under year bands, a row per platform, and this month marked', () => {
  const out = reviewsView(state, data()).toString();
  assert.match(out, /<table class="timeline">/);
  assert.match(out, /<th colspan="6" class="tl-year">2026<\/th><th colspan="6" class="tl-year">2027<\/th>/);
  assert.equal((out.match(/<th class="tl-month/g) ?? []).length, 12);
  assert.match(out, /<th class="tl-month today" scope="col">Sep<\/th>/);
  assert.match(out, /<tr data-row="p1"[\s\S]*?class="tl-mark overdue" title="Overdue since 1 Sep 2026"/);
  assert.match(out, /<tr data-row="p1"[\s\S]*?class="tl-mark projected" title="Then due 1 Mar 2027 · every 6 months"/, 'the next after an overdue one');
  assert.match(out, /<tr data-row="p2" class="tl-none">[\s\S]*?No schedule/);
  assert.match(out, /<tr data-row="p1" data-dblclick="go" data-view="platformReview" data-id="p1">/);
});

test('the range controls send the start, length and shifts; the year before can be shown', () => {
  const out = reviewsView(state, data()).toString();
  assert.match(out, /<select name="length" data-change="setReviewsFilter">[\s\S]*?<option value="12" selected>1 year<\/option>/);
  assert.match(out, /<option value="120">10 years<\/option>/);
  assert.match(out, /data-action="setReviewsFilter" data-shift="-12"/);
  assert.match(out, /data-action="setReviewsFilter" data-shift="12"/);
  assert.match(out, /<input type="month" name="start" value="2026-07" data-change="setReviewsFilter">/);
  assert.match(out, /<input type="checkbox" name="past" data-change="setReviewsFilter">/);
  const past = reviewsView({ ...state, reviewsPrefs: { ...state.reviewsPrefs, past: true } }, data()).toString();
  assert.match(past, /<th colspan="6" class="tl-year">2025<\/th><th colspan="6" class="tl-year">2026<\/th>/, 'Jul 2025 to Jun 2026: the same length, a year earlier');
});

test('the default range is the next three years from this month', () => {
  const out = reviewsView({ ...state, reviewsPrefs: { ...state.reviewsPrefs, start: null, length: 36 } }, data()).toString();
  assert.equal((out.match(/<th class="tl-month/g) ?? []).length, 36);
  assert.match(out, /<th colspan="4" class="tl-year">2026<\/th>/, 'Sep to Dec 2026');
});

test('with platform groups, rows sit under their first group, ungrouped last', () => {
  let d = createPlatformGroup(data(), act, { id: 'g1', name: 'UAS' });
  d = tagPlatform(d, act, { platformId: 'p2', groupId: 'g1' });
  const out = reviewsView(state, d).toString();
  assert.match(out, /<tr class="tl-group"><th[^>]*>UAS<\/th><\/tr>\s*<tr data-row="p2"[\s\S]*<tr class="tl-group"><th[^>]*>No group<\/th><\/tr>\s*<tr data-row="p1"/);
  assert.doesNotMatch(reviewsView(state, data()).toString(), /tl-group/, 'no groups, no group rows');
});

test('the owner filter applies to the timeline too', () => {
  const out = reviewsView({ ...state, reviewsPrefs: { ...state.reviewsPrefs, owner: 'me' } }, data()).toString();
  assert.match(out, /data-row="p1"/);
  assert.doesNotMatch(out, /data-row="p2"/);
});
