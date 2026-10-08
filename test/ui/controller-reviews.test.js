import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController, initialState } from '../../src/ui/controller.js';
import { ids } from '../../src/core/ids.js';
import { scheduleOf } from '../../src/core/schedule.js';

const env = (f, storage = new MemoryStorage()) => ({ clock: fixedClock('2026-09-28T10:00:00+10:00'), storage, minSaveMs: 0,
  pickFolder: async () => f.handle, pickSaveFile: async (n) => f.handle.getFileHandle(n, { create: true }), pickOpenFile: async () => null });

async function ready(storage = new MemoryStorage()) {
  const c = createController(env(new MemoryFolder(), storage));
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  const u = c.getState().profiles[0].id;
  await c.dispatch({ type: 'selectProfile', id: u });
  await c.dispatch({ type: 'createHazard', id: 'h1', title: 'Fire' });
  await c.dispatch({ type: 'createPlatform', id: 'p1', name: 'Alpha', ownerId: u });
  await c.dispatch({ type: 'linkHazard', hazardId: 'h1', platformId: 'p1' });
  return c;
}
const W = (c) => c.getState().session.working;

test('the Reviews filters and timeline range change in place, shift by a year, and are remembered for the profile', async () => {
  const storage = new MemoryStorage();
  const c = await ready(storage);
  assert.deepEqual(c.getState().reviewsPrefs, { owner: 'me', groupId: null, start: null, length: 36, past: false });
  await c.dispatch({ type: 'setReviewsFilter', owner: 'everyone' });
  await c.dispatch({ type: 'setReviewsFilter', length: '60' });
  await c.dispatch({ type: 'setReviewsFilter', length: '7' });
  await c.dispatch({ type: 'setReviewsFilter', past: 'true' });
  await c.dispatch({ type: 'setReviewsFilter', shift: '12' });
  assert.deepEqual(c.getState().reviewsPrefs, { owner: 'everyone', groupId: null, start: '2027-09', length: 60, past: true }, 'an odd length is ignored; a shift starts from this month');
  await c.dispatch({ type: 'setReviewsFilter', shift: '-24' });
  await c.dispatch({ type: 'setReviewsFilter', start: '2026-01' });
  assert.equal(c.getState().reviewsPrefs.start, '2026-01');
  const kept = JSON.parse(/** @type {string} */ (storage.getItem(`pivot.reviews:${c.getState().folderName}:${c.getState().profileId}`)));
  assert.deepEqual(kept, c.getState().reviewsPrefs, 'written for this folder and profile, for the next time it opens');
});

test('a new policy opens in the menu; a cell takes a value and unit; a bad value is refused with a message', async () => {
  const c = await ready();
  await c.dispatch({ type: 'newReviewPolicy', name: 'Standard' });
  const id = Object.keys(W(c).records.reviewPolicy)[0];
  assert.deepEqual([c.getState().view.name, c.getState().view.tab, c.getState().sections.reviewPolicies], ['reviews', 'policies', id]);
  await c.dispatch({ type: 'setPolicyCell', id, receptor: 'personnel', band: 'Serious', value: '2', unit: 'years' });
  assert.equal(W(c).records.reviewPolicy[id].receptors.personnel.periods.Serious, 24);
  await c.dispatch({ type: 'setPolicyCell', id, receptor: 'personnel', band: 'Serious', unit: 'months' });
  assert.equal(W(c).records.reviewPolicy[id].receptors.personnel.periods.Serious, 2, 'the number stays; the unit changes');
  await c.dispatch({ type: 'setPolicyCell', id, receptor: 'personnel', band: 'Serious', value: '0' });
  assert.equal(c.getState().message.kind, 'error');
  assert.equal(W(c).records.reviewPolicy[id].receptors.personnel.periods.Serious, 2);
  await c.dispatch({ type: 'removeReviewPolicy', id });
  assert.equal(W(c).records.reviewPolicy[id].status, 'deleted');
  assert.deepEqual([c.getState().view.tab, c.getState().sections.reviewPolicies], ['policies', undefined]);
});

test('years chosen on an empty cell are kept on screen, and used when the number is typed', async () => {
  const c = await ready();
  await c.dispatch({ type: 'newReviewPolicy', name: 'Standard' });
  const id = Object.keys(W(c).records.reviewPolicy)[0];
  const before = W(c);
  await c.dispatch({ type: 'setPolicyCell', id, receptor: 'personnel', band: 'High', unit: 'years' });
  assert.equal(W(c), before, 'nothing saved yet: there is no number');
  assert.equal(c.getState().policyUnits[`${id}|personnel|High`], 'years');
  await c.dispatch({ type: 'setPolicyCell', id, receptor: 'personnel', band: 'High', value: '2' });
  assert.equal(W(c).records.reviewPolicy[id].receptors.personnel.periods.High, 24, 'two years, as chosen');
});

test('Edit on a platform’s rule opens its policy in the Policies menu', async () => {
  const c = await ready();
  await c.dispatch({ type: 'createReviewPolicy', id: 'pol1', name: 'A' });
  await c.dispatch({ type: 'createReviewPolicy', id: 'pol2', name: 'B' });
  await c.dispatch({ type: 'showPolicy', id: 'pol2' });
  assert.deepEqual([c.getState().view.name, c.getState().view.tab, c.getState().sections.reviewPolicies], ['reviews', 'policies', 'pol2']);
});

test('opening the data as a profile brings back that profile’s Reviews filters', async () => {
  const storage = new MemoryStorage();
  const c = createController(env(new MemoryFolder(), storage));
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  const u = c.getState().profiles[0].id;
  storage.setItem(`pivot.reviews:${c.getState().folderName}:${u}`, JSON.stringify({ owner: 'everyone', groupId: null, start: '2027-01', length: 12, past: false }));
  await c.dispatch({ type: 'selectProfile', id: u });
  assert.deepEqual(c.getState().reviewsPrefs, { owner: 'everyone', groupId: null, start: '2027-01', length: 12, past: false });
});

test('today comes from the clock', async () => {
  assert.match(initialState().today, /^\d{4}-\d{2}-\d{2}$/);
  const c = await ready();
  assert.equal(c.getState().today, '2026-09-28');
});

test('a rule set from the page, then each part changed in place, keeping the others', async () => {
  const c = await ready();
  const p = () => W(c).records.platform.p1;
  await c.dispatch({ type: 'setRuleField', platformId: 'p1', kind: 'fixed' });
  assert.deepEqual([p().reviewRule, p().reviewStart], [{ kind: 'fixed', months: 12 }, '2026-09-28'], 'a first fixed rule: yearly, counted from today');
  await c.dispatch({ type: 'setRuleField', platformId: 'p1', value: '2' });
  assert.deepEqual(p().reviewRule, { kind: 'fixed', months: 24 }, 'the card shows 1 year, so a new number is in years');
  await c.dispatch({ type: 'setRuleField', platformId: 'p1', unit: 'months' });
  assert.deepEqual(p().reviewRule, { kind: 'fixed', months: 2 }, 'the number stays, read in months');
  await c.dispatch({ type: 'setRuleField', platformId: 'p1', value: '6' });
  await c.dispatch({ type: 'setRuleField', platformId: 'p1', start: '2026-06-30' });
  assert.deepEqual([p().reviewRule, p().reviewStart], [{ kind: 'fixed', months: 6 }, '2026-06-30']);
  await c.dispatch({ type: 'setRuleField', platformId: 'p1', kind: 'none' });
  assert.deepEqual([p().reviewRule, p().reviewStart], [null, null]);
});

test('choosing a policy uses the first one; clearing the start is refused with a message and changes nothing', async () => {
  const c = await ready();
  await c.dispatch({ type: 'createReviewPolicy', id: 'pol1', name: 'Standard' });
  await c.dispatch({ type: 'setRuleField', platformId: 'p1', kind: 'policy' });
  assert.deepEqual(W(c).records.platform.p1.reviewRule, { kind: 'policy', policyId: 'pol1' });
  await c.dispatch({ type: 'setRuleField', platformId: 'p1', start: '' });
  assert.equal(c.getState().message.kind, 'error');
  assert.match(c.getState().message.text, /real date/);
  assert.equal(W(c).records.platform.p1.reviewStart, '2026-09-28');
});

test('starting a review shows the review page; a tick arrives as text and is stored as a boolean; completing moves the date', async () => {
  const c = await ready();
  await c.dispatch({ type: 'setRule', platformId: 'p1', kind: 'fixed', months: '6', unit: 'months', start: '2026-06-30' });
  await c.dispatch({ type: 'beginReview', platformId: 'p1' });
  assert.deepEqual([c.getState().view.name, c.getState().view.id], ['platformReview', 'p1']);
  const review = Object.values(W(c).records.review)[0];
  await c.dispatch({ type: 'tickReviewRow', reviewId: review.id, hazardId: 'h1', reviewed: 'true' });
  assert.equal(W(c).records.reviewRow[ids.reviewRow(review.id, 'h1')].reviewed, true);
  await c.dispatch({ type: 'tickReviewRow', reviewId: review.id, hazardId: 'h1', reviewed: 'false' });
  assert.equal(W(c).records.reviewRow[ids.reviewRow(review.id, 'h1')].reviewed, false);
  await c.dispatch({ type: 'markRow', reviewId: review.id, hazardId: 'h1', note: 'Looked at it' });
  await c.dispatch({ type: 'setReviewOutcome', reviewId: review.id, outcome: 'Done' });
  await c.dispatch({ type: 'completeReview', reviewId: review.id });
  assert.equal(scheduleOf(W(c), 'p1', '2026-09-28').due, '2027-06-30');
  await c.dispatch({ type: 'go', view: 'platformReview', id: 'p1', reviewId: review.id });
  assert.equal(c.getState().view.reviewId, review.id);
});

test('the review schedule panel opens from the platform menu and closes again, or on leaving the page', async () => {
  const c = await ready();
  await c.dispatch({ type: 'go', view: 'platform', id: 'p1' });
  await c.dispatch({ type: 'showReviewPanel', id: 'p1' });
  assert.equal(c.getState().reviewPanel, 'p1');
  await c.dispatch({ type: 'closeReviewPanel' });
  assert.equal(c.getState().reviewPanel, null);
  await c.dispatch({ type: 'showReviewPanel', id: 'p1' });
  await c.dispatch({ type: 'go', view: 'platformReview', id: 'p1' });
  assert.equal(c.getState().reviewPanel, null);
});

test('choosing a platform in the report form is remembered on screen only', async () => {
  const c = await ready();
  assert.equal(c.getState().reportPlatformId, null);
  await c.dispatch({ type: 'chooseReportPlatform', platformId: 'p1' });
  assert.equal(c.getState().reportPlatformId, 'p1');
  assert.equal(c.getState().busy, false);
});
