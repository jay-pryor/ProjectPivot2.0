import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openItems, upcomingReviews } from '../../src/core/queries.js';
import { reviewsPlatforms } from '../../src/ui/screens/reviews.js';
import { linkHazard } from '../../src/core/ops/platforms.js';
import { act, seed, scheduleFixed, beginOnboarding } from '../helpers.js';

test('an Onboarding platform has no open items, nothing coming up, and no timeline row', () => {
  let d = beginOnboarding(seed(), act, { id: 'w9', platformId: 'p9', name: 'Gamma', ownerId: 'u1' });
  d = linkHazard(d, act, { hazardId: 'h1', platformId: 'p9' });
  d = scheduleFixed(d, 'p9', 1, '2026-10-15');
  const items = openItems(d, '2026-09-28', null);
  for (const [k, list] of Object.entries(items)) assert.ok(!list.some((x) => x.platform?.id === 'p9'), `${k} leaves out Gamma`);
  assert.ok(!upcomingReviews(d, '2026-09-28', null, 90).some((r) => r.platform.id === 'p9'));
  const state = { profileId: 'u1', reviewsPrefs: { owner: 'everyone', groupId: null } };
  assert.ok(!reviewsPlatforms(state, d).some((p) => p.id === 'p9'));
  assert.ok(reviewsPlatforms(state, d).some((p) => p.id === 'p1'));
});
