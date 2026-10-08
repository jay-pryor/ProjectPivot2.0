import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController } from '../../src/ui/controller.js';
import { renderApp } from '../../src/ui/render.js';

const env = (f) => ({ clock: fixedClock('2026-09-28T10:00:00+10:00'), storage: new MemoryStorage(), minSaveMs: 0,
  pickFolder: async () => f.handle, pickSaveFile: async (n) => f.handle.getFileHandle(n, { create: true }), pickOpenFile: async () => null });

/**
 * Ada is active. p1 Alpha (owned by Ada, or by Grace when asked) with h1 on it, on policy Standard:
 * personnel Serious every 6 months, unrated (Uncategorised) every 3 years, counted from 2026-01-01.
 * @param {'ada' | 'grace'} [owner]
 */
async function ready(owner = 'ada') {
  const c = createController(env(new MemoryFolder()));
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  await c.dispatch({ type: 'createProfile', name: 'Grace' });
  const ids = Object.fromEntries(c.getState().profiles.map((p) => [p.name.toLowerCase(), p.id]));
  await c.dispatch({ type: 'selectProfile', id: ids.ada });
  await c.dispatch({ type: 'createHazard', id: 'h1', title: 'Fire' });
  await c.dispatch({ type: 'createPlatform', id: 'p1', name: 'Alpha', ownerId: ids[owner] });
  await c.dispatch({ type: 'linkHazard', hazardId: 'h1', platformId: 'p1' });
  await c.dispatch({ type: 'createReviewPolicy', id: 'pol1', name: 'Standard' });
  await c.dispatch({ type: 'updateReviewPolicy', id: 'pol1', receptor: 'personnel', band: 'Serious', months: '6', unit: 'months' });
  await c.dispatch({ type: 'updateReviewPolicy', id: 'pol1', receptor: 'personnel', band: 'Uncategorised', months: '3', unit: 'years' });
  await c.dispatch({ type: 'setRule', platformId: 'p1', kind: 'policy', policyId: 'pol1', start: '2026-01-01' });
  await c.dispatch({ type: 'dismissReviewMoved' });
  return c;
}
const serious = { type: 'setAssessment', hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor: 'personnel', consequence: 2, likelihood: 'C' };

test('an edit that moves a review date opens the pop-up, urgent when the new date has passed; the owner is told to check it', async () => {
  const c = await ready();
  await c.dispatch(serious); // 3 years → 6 months: due 2026-07-01, passed
  const m = c.getState().reviewMoved;
  assert.equal(m.length, 1);
  assert.deepEqual([m[0].platformId, m[0].from, m[0].to, m[0].urgent], ['p1', '2029-01-01', '2026-07-01', true]);
  const out = renderApp(c.getState());
  assert.match(out, /role="alertdialog" aria-modal="true" aria-label="Review date moved"[\s\S]*class="urgent-banner"[\s\S]*Alpha<\/strong>: 1 Jan 2029 → 1 Jul 2026[\s\S]*Now overdue[\s\S]*Fire residual personnel: Serious[\s\S]*You own Alpha: check its review date\./);
  await c.dispatch({ type: 'dismissReviewMoved' });
  assert.equal(c.getState().reviewMoved, null);
  assert.doesNotMatch(renderApp(c.getState()), /aria-label="Review date moved"/);
});

test('a move further off is not urgent; someone else’s platform names its owner', async () => {
  const c = await ready('grace');
  await c.dispatch({ type: 'updateReviewPolicy', id: 'pol1', receptor: 'personnel', band: 'Uncategorised', months: '2', unit: 'years' }); // 2029-01-01 → 2028-01-01
  const m = c.getState().reviewMoved;
  assert.deepEqual([m[0].to, m[0].urgent], ['2028-01-01', false]);
  const out = renderApp(c.getState());
  assert.doesNotMatch(out, /urgent-banner/);
  assert.match(out, /Alpha is owned by Grace: they have been asked to check its review date\./);
});

test('an edit that moves nothing opens nothing; completing or acknowledging is not reported', async () => {
  const c = await ready();
  await c.dispatch({ type: 'updateHazard', id: 'h1', title: 'Big fire' });
  assert.equal(c.getState().reviewMoved, null);
  await c.dispatch({ type: 'beginReview', platformId: 'p1' });
  const review = Object.values(c.getState().session.working.records.review)[0];
  await c.dispatch({ type: 'completeReview', reviewId: review.id });
  assert.equal(c.getState().reviewMoved, null, 'the date moving is the point of completing');
});
