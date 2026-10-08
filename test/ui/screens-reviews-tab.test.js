import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewsView } from '../../src/ui/screens/reviews.js';
import { shell } from '../../src/ui/screens/common.js';
import { periodWord } from '../../src/ui/names.js';
import { ruleWord, driverWord } from '../../src/ui/review-words.js';
import { initialState } from '../../src/ui/controller.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { createReviewPolicy, updateReviewPolicy, setRule } from '../../src/core/ops/reviews.js';
import { createPlatformGroup, tagPlatform } from '../../src/core/ops/platform-groups.js';
import { setRating } from '../../src/core/ops/assessment.js';
import { scheduleOf } from '../../src/core/schedule.js';
import { DEFAULT_REVIEWS_PREFS } from '../../src/ui/reviews-prefs.js';
import { seed, act, scheduleFixed } from '../helpers.js';

export const state = { ...initialState(), screen: 'main', today: '2026-09-28', view: { name: 'reviews' }, reviewsPrefs: { ...DEFAULT_REVIEWS_PREFS, owner: 'everyone' },
  profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }, { id: 'u2', name: 'Grace', createdAt: '' }], profileId: 'u1' };
/** p1 (Ada) every 6 months, overdue (due 2026-09-01); p2 (Grace) no schedule. */
export const data = () => scheduleFixed(assignNumbers(seed()), 'p1', 6, '2026-09-01');
/** p1 on policy Standard (personnel Serious 6 months), with h1 residual personnel Serious. */
export function policyData() {
  let d = createReviewPolicy(assignNumbers(seed()), act, { id: 'pol1', name: 'Standard' });
  d = updateReviewPolicy(d, act, { id: 'pol1', receptor: 'personnel', band: 'Serious', months: '6', unit: 'months' });
  d = setRule(d, act, { platformId: 'p1', kind: 'policy', policyId: 'pol1', start: '2026-06-01' });
  return setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor: 'personnel', consequence: 2, likelihood: 'C' });
}

test('periods read in years when they are whole years', () => {
  assert.deepEqual([1, 6, 12, 18, 24, 120].map(periodWord), ['1 month', '6 months', '1 year', '18 months', '2 years', '10 years']);
});

test('a rule and what sets its period, in words', () => {
  const d = policyData();
  assert.equal(ruleWord(data(), data().records.platform.p1), 'Fixed · 6 months');
  assert.equal(ruleWord(data(), data().records.platform.p2), 'None');
  assert.equal(ruleWord(d, d.records.platform.p1), 'Standard (policy)');
  assert.match(driverWord(d, scheduleOf(d, 'p1', '2026-09-28').driver), /^HAZ-\d+ residual personnel: Serious$/);
  const unsaved = { ...d, records: { ...d.records, hazard: { ...d.records.hazard, h1: { ...d.records.hazard.h1, number: null } } } };
  assert.equal(driverWord(unsaved, { kind: 'hazard', hazardId: 'h1', receptor: 'personnel', band: 'Serious' }), 'Fire residual personnel: Serious', 'a hazard not yet numbered goes by its title');
  assert.equal(driverWord(d, { kind: 'fixed' }), '');
});

test('Reviews is in the top bar, between Workflows and Bow-ties; Workflows follows Platforms', () => {
  const out = shell({ ...state, session: { working: data(), base: data() } }, /** @type {any} */ ('')).toString();
  assert.match(out, /data-view="platforms">Platforms<\/button>\s*<button[^>]*data-view="workflows">Workflows<\/button>\s*<button[^>]*data-view="reviews">Reviews<\/button>\s*<button[^>]*data-view="bowties"/);
  assert.match(out, /class="nav on"[^>]*data-view="reviews"/);
});

test('the Schedule sub-tab lists every platform: rule, period, next due with its state, last reviewed; overdue first, none last', () => {
  const out = reviewsView(state, data()).toString();
  assert.match(out, /<nav class="tabs">[\s\S]*Schedule[\s\S]*Timeline[\s\S]*Policies/);
  assert.match(out, /data-row="p1"[\s\S]*Fixed · 6 months[\s\S]*1 Sep 2026[\s\S]*review-overdue[\s\S]*data-row="p2"[\s\S]*None/);
  assert.match(out, /data-row="p1"[^>]*data-dblclick="go" data-view="platformReview" data-id="p1"/);
});

test('the owner filter narrows the list to that owner’s platforms', () => {
  const mine = reviewsView({ ...state, reviewsPrefs: { ...DEFAULT_REVIEWS_PREFS, owner: 'me' } }, data()).toString();
  assert.match(mine, /data-row="p1"/);
  assert.doesNotMatch(mine, /data-row="p2"/);
  assert.match(mine, /<select name="owner"[^>]*data-change="setReviewsFilter"/);
});

test('the group filter, shown once there are groups, narrows the list to that group', () => {
  let d = createPlatformGroup(data(), act, { id: 'g1', name: 'UAS' });
  d = tagPlatform(d, act, { platformId: 'p2', groupId: 'g1' });
  const out = reviewsView({ ...state, reviewsPrefs: { ...state.reviewsPrefs, groupId: 'g1' } }, d).toString();
  assert.match(out, /<select name="groupId"[^>]*data-change="setReviewsFilter"/);
  assert.match(out, /data-row="p2"/);
  assert.doesNotMatch(out, /data-row="p1"/);
  assert.doesNotMatch(reviewsView(state, data()).toString(), /name="groupId"/, 'no groups, no chooser');
});
