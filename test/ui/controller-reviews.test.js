import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController, initialState } from '../../src/ui/controller.js';
import { ids } from '../../src/core/ids.js';
import { scheduleOf } from '../../src/core/schedule.js';
import { CHECKS } from '../../src/core/workflows.js';

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

test('Edit starts a draft of the rule; changing it saves nothing and pops nothing up; Confirm saves it once', async () => {
  const c = await ready();
  await c.dispatch({ type: 'editRule', platformId: 'p1' });
  assert.deepEqual(c.getState().ruleDraft, { platformId: 'p1', kind: 'fixed', value: '1', unit: 'years', policyId: null, start: '2026-09-28' }, 'a first rule starts as yearly, from today');
  const before = W(c);
  await c.dispatch({ type: 'setRuleDraft', platformId: 'p1', value: '6' });
  await c.dispatch({ type: 'setRuleDraft', platformId: 'p1', unit: 'months' });
  await c.dispatch({ type: 'setRuleDraft', platformId: 'p1', start: '2026-06-30' });
  assert.equal(W(c), before, 'nothing saved while editing');
  assert.equal(c.getState().reviewMoved, null, 'and nothing pops up');
  const entries = Object.keys(W(c).history).length;
  await c.dispatch({ type: 'confirmRule', platformId: 'p1' });
  assert.deepEqual([W(c).records.platform.p1.reviewRule, W(c).records.platform.p1.reviewStart], [{ kind: 'fixed', months: 6 }, '2026-06-30']);
  assert.equal(Object.keys(W(c).history).length, entries + 1, 'one change');
  assert.equal(c.getState().ruleDraft, null);
  assert.equal(c.getState().reviewMoved, null, 'a first rule is the date its owner just chose: no pop-up');
});

test('changing a rule pops up once, on Confirm; Cancel discards the draft', async () => {
  const c = await ready();
  await c.dispatch({ type: 'setRule', platformId: 'p1', kind: 'fixed', months: '6', unit: 'months', start: '2026-06-30' });
  await c.dispatch({ type: 'editRule', platformId: 'p1' });
  assert.deepEqual(c.getState().ruleDraft, { platformId: 'p1', kind: 'fixed', value: '6', unit: 'months', policyId: null, start: '2026-06-30' }, 'the draft starts as the rule');
  await c.dispatch({ type: 'setRuleDraft', platformId: 'p1', value: '3' });
  assert.equal(c.getState().reviewMoved, null);
  await c.dispatch({ type: 'confirmRule', platformId: 'p1' });
  assert.deepEqual(W(c).records.platform.p1.reviewRule, { kind: 'fixed', months: 3 });
  assert.equal(c.getState().reviewMoved.length, 1);
  assert.deepEqual([c.getState().reviewMoved[0].from, c.getState().reviewMoved[0].to], ['2026-12-30', '2026-09-30']);
  await c.dispatch({ type: 'dismissReviewMoved' });
  await c.dispatch({ type: 'editRule', platformId: 'p1' });
  await c.dispatch({ type: 'setRuleDraft', platformId: 'p1', kind: 'none' });
  await c.dispatch({ type: 'cancelRule' });
  assert.equal(c.getState().ruleDraft, null);
  assert.deepEqual(W(c).records.platform.p1.reviewRule, { kind: 'fixed', months: 3 }, 'unchanged');
});

test('a bad draft is refused with a message on Confirm and kept to correct; a policy draft uses the first policy; leaving the page drops it', async () => {
  const c = await ready();
  await c.dispatch({ type: 'createReviewPolicy', id: 'pol1', name: 'Standard' });
  await c.dispatch({ type: 'editRule', platformId: 'p1' });
  await c.dispatch({ type: 'setRuleDraft', platformId: 'p1', value: '0' });
  await c.dispatch({ type: 'confirmRule', platformId: 'p1' });
  assert.equal(c.getState().message.kind, 'error');
  assert.equal(W(c).records.platform.p1.reviewRule, null);
  assert.equal(c.getState().ruleDraft.value, '0', 'kept to correct');
  await c.dispatch({ type: 'setRuleDraft', platformId: 'p1', kind: 'policy' });
  assert.equal(c.getState().ruleDraft.policyId, 'pol1');
  await c.dispatch({ type: 'setRuleDraft', platformId: 'p1', start: '' });
  await c.dispatch({ type: 'confirmRule', platformId: 'p1' });
  assert.match(c.getState().message.text, /real date/);
  await c.dispatch({ type: 'setRuleDraft', platformId: 'p1', start: '2026-01-01' });
  await c.dispatch({ type: 'confirmRule', platformId: 'p1' });
  assert.deepEqual(W(c).records.platform.p1.reviewRule, { kind: 'policy', policyId: 'pol1' });
  await c.dispatch({ type: 'editRule', platformId: 'p1' });
  await c.dispatch({ type: 'go', view: 'home' });
  assert.equal(c.getState().ruleDraft, null);
});

test('Start review opens the workflow, and again resumes it; ticking everything and completing moves the date', async () => {
  const c = await ready();
  await c.dispatch({ type: 'setRule', platformId: 'p1', kind: 'fixed', months: '6', unit: 'months', start: '2026-06-30' });
  await c.dispatch({ type: 'beginReview', platformId: 'p1' });
  const w = c.getState().view.id;
  assert.equal(c.getState().view.name, 'workflow');
  await c.dispatch({ type: 'go', view: 'reviews' });
  await c.dispatch({ type: 'beginReview', platformId: 'p1' });
  assert.deepEqual([c.getState().view.name, c.getState().view.id], ['workflow', w]);
  assert.equal(Object.keys(W(c).records.workflow).length, 1);
  await c.dispatch({ type: 'setStep', workflowId: w, hazardId: 'h1', check: 'sfarp', checked: 'true' });
  assert.equal(W(c).records.workflowStep[ids.workflowStep(w, 'h1', 'sfarp')].checked, true, 'a tick arrives as text and is stored as a boolean');
  for (const check of CHECKS) await c.dispatch({ type: 'setStep', workflowId: w, hazardId: 'h1', check, checked: 'true' });
  await c.dispatch({ type: 'setWorkflowOutcome', workflowId: w, outcome: 'Done' });
  await c.dispatch({ type: 'completeWorkflow', workflowId: w });
  assert.equal(scheduleOf(W(c), 'p1', '2026-09-28').due, '2027-06-30');
  assert.equal(W(c).records.review[ids.workflowReview(w)].outcome, 'Done');
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
