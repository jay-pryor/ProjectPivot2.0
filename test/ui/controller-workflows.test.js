import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController } from '../../src/ui/controller.js';
import { entries } from '../../src/core/history.js';
import { hasUnsaved } from '../../src/storage/mirror.js';

const env = (f, storage = new MemoryStorage()) => ({ clock: fixedClock('2026-09-28T10:00:00+10:00'), storage, minSaveMs: 0,
  pickFolder: async () => f.handle, pickSaveFile: async (n) => f.handle.getFileHandle(n, { create: true }), pickOpenFile: async () => null });

/** Ada owns p1 (h1, h2 on it); Grace exists. Signed in as Ada. */
async function ready(folder = new MemoryFolder(), storage = new MemoryStorage()) {
  const c = createController(env(folder, storage));
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  await c.dispatch({ type: 'createProfile', name: 'Grace' });
  const [ada, grace] = c.getState().profiles.map((p) => p.id);
  await c.dispatch({ type: 'selectProfile', id: ada });
  await c.dispatch({ type: 'createHazard', id: 'h1', title: 'Fire' });
  await c.dispatch({ type: 'createHazard', id: 'h2', title: 'Flood' });
  await c.dispatch({ type: 'createPlatform', id: 'p1', name: 'Alpha', ownerId: ada });
  await c.dispatch({ type: 'linkHazard', hazardId: 'h1', platformId: 'p1' });
  await c.dispatch({ type: 'linkHazard', hazardId: 'h2', platformId: 'p1' });
  return { c, ada, grace, folder, storage };
}
const W = (c) => c.getState().session.working;

test('Workflows sits between Platforms and Reviews and opens on the dashboard', async () => {
  const { c } = await ready();
  await c.dispatch({ type: 'go', view: 'workflows' });
  assert.equal(c.getState().view.name, 'workflows');
});

test('edits made on a workflow page I own carry the workflow; edits elsewhere do not', async () => {
  const { c } = await ready();
  await c.dispatch({ type: 'beginReview', platformId: 'p1' });
  const id = c.getState().view.id;
  await c.dispatch({ type: 'setSfarp', hazardId: 'h1', platformId: 'p1', conclusion: 'Tolerable' });
  assert.equal(entries(W(c)).at(-1).workflow, id);
  await c.dispatch({ type: 'go', view: 'hazards' });
  await c.dispatch({ type: 'setSfarp', hazardId: 'h1', platformId: 'p1', conclusion: 'Tolerable now' });
  assert.ok(!('workflow' in entries(W(c)).at(-1)));
});

test('moving between hazards remembers the place for the owner; the summary is null', async () => {
  const { c } = await ready();
  await c.dispatch({ type: 'beginReview', platformId: 'p1' });
  const id = c.getState().view.id;
  assert.deepEqual(W(c).records.workflow[id].at, { hazardId: 'h1' });
  await c.dispatch({ type: 'showWorkflowHazard', workflowId: id, hazardId: 'h2' });
  assert.deepEqual([c.getState().view.hazardId, W(c).records.workflow[id].at.hazardId], ['h2', 'h2']);
  await c.dispatch({ type: 'showWorkflowHazard', workflowId: id, hazardId: '' });
  assert.deepEqual([c.getState().view.hazardId, W(c).records.workflow[id].at.hazardId], ['summary', null]);
});

test('someone else browsing my workflow moves around without writing anything, and their edits are not stamped', async () => {
  const { c, grace, folder, storage } = await ready();
  await c.dispatch({ type: 'beginReview', platformId: 'p1' });
  const id = c.getState().view.id;
  await c.dispatch({ type: 'save' });
  const g = createController(env(folder, storage));
  await g.dispatch({ type: 'chooseFolder' });
  await g.dispatch({ type: 'selectProfile', id: grace });
  await g.dispatch({ type: 'go', view: 'workflow', id });
  await g.dispatch({ type: 'showWorkflowHazard', workflowId: id, hazardId: 'h2' });
  assert.equal(g.getState().view.hazardId, 'h2');
  assert.equal(W(g).records.workflow[id].at.hazardId, 'h1', 'the owner’s place is untouched');
  assert.equal(hasUnsaved(g.getState().session), false);
  await g.dispatch({ type: 'setSfarp', hazardId: 'h1', platformId: 'p1', conclusion: 'x' });
  assert.ok(!('workflow' in entries(W(g)).at(-1)));
  await g.dispatch({ type: 'setStep', workflowId: id, hazardId: 'h1', check: 'sfarp', checked: 'true' });
  assert.equal(g.getState().message.kind, 'error', 'only the owner ticks');
});

test('a workflow survives saving and opening the folder again, where it left off', async () => {
  const { c, ada, folder, storage } = await ready();
  await c.dispatch({ type: 'beginReview', platformId: 'p1' });
  const id = c.getState().view.id;
  await c.dispatch({ type: 'setStep', workflowId: id, hazardId: 'h1', check: 'controls', checked: 'true', note: 'Added C-001' });
  await c.dispatch({ type: 'showWorkflowHazard', workflowId: id, hazardId: 'h2' });
  await c.dispatch({ type: 'save' });
  const again = createController(env(folder, storage));
  await again.dispatch({ type: 'chooseFolder' });
  await again.dispatch({ type: 'selectProfile', id: ada });
  const w = W(again).records.workflow[id];
  assert.deepEqual([w.state, w.at.hazardId, w.number], ['open', 'h2', 1]);
  assert.equal(Object.values(W(again).records.workflowStep)[0].note, 'Added C-001');
});

test('the Workflows owner filter and range are kept for the profile', async () => {
  const { c, storage } = await ready();
  assert.deepEqual(c.getState().workflowsPrefs, { owner: 'everyone', days: 30 });
  await c.dispatch({ type: 'setWorkflowsFilter', owner: 'me' });
  await c.dispatch({ type: 'setWorkflowsFilter', days: '90' });
  await c.dispatch({ type: 'setWorkflowsFilter', days: '11' });
  assert.deepEqual(c.getState().workflowsPrefs, { owner: 'me', days: 90 });
  assert.deepEqual(JSON.parse(storage.getItem(`pivot.workflows:${c.getState().folderName}:${c.getState().profileId}`)), { owner: 'me', days: 90 });
});
