import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController } from '../../src/ui/controller.js';
import { entries } from '../../src/core/history.js';

const env = (f, storage = new MemoryStorage()) => ({ clock: fixedClock('2026-09-28T10:00:00+10:00'), storage, minSaveMs: 0,
  pickFolder: async () => f.handle, pickSaveFile: async (n) => f.handle.getFileHandle(n, { create: true }), pickOpenFile: async () => null });
const W = (c) => c.getState().session.working;

async function ready() {
  const c = createController(env(new MemoryFolder()));
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  const ada = c.getState().profiles[0].id;
  await c.dispatch({ type: 'selectProfile', id: ada });
  await c.dispatch({ type: 'createHazard', id: 'h1', title: 'Fire' });
  await c.dispatch({ type: 'createHazard', id: 'h2', title: 'Flood' });
  await c.dispatch({ type: 'createPlatform', id: 'p1', name: 'Alpha', ownerId: ada });
  await c.dispatch({ type: 'linkHazard', hazardId: 'h1', platformId: 'p1' });
  await c.dispatch({ type: 'createReference', id: 'r1', title: 'Service bulletin 12', url: 'https://sb12' });
  return c;
}

test('Work through as new tech data starts one on the reference, or opens the one under way', async () => {
  const c = await ready();
  await c.dispatch({ type: 'beginTechData', referenceId: 'r1' });
  const id = c.getState().view.id;
  assert.deepEqual([c.getState().view.name, W(c).records.workflow[id].type], ['workflow', 'newTechData']);
  await c.dispatch({ type: 'go', view: 'references' });
  await c.dispatch({ type: 'beginTechData', referenceId: 'r1' });
  assert.equal(c.getState().view.id, id);
});

test('Start on the dashboard opens a New Tech Data on its Reference step; a file uploaded there is stored for the reference it will make', async () => {
  const c = await ready();
  await c.dispatch({ type: 'beginTechData' });
  const id = c.getState().view.id;
  const wf = W(c).records.workflow[id];
  assert.deepEqual([wf.type, wf.referenceId, wf.at.hazardId], ['newTechData', null, '@reference']);
  await c.dispatch({ type: 'beginTechData' });
  assert.notEqual(c.getState().view.id, id, 'each Start begins a new one');
  await c.dispatch({ type: 'go', view: 'workflow', id });
  await c.dispatch({ type: 'uploadTechFile', workflowId: id, file: new File(['tr7'], 'tr7.pdf', { type: 'application/pdf' }) });
  const draft = W(c).records.workflow[id].draft;
  assert.equal(draft.file.name, 'tr7.pdf');
  assert.match(draft.file.stored, new RegExp(`^files/${draft.id}/`));
  assert.equal(W(c).records.reference[draft.id], undefined);
});

test('the picker opened from the scope adds through the workflow; an edit on its page is made through it', async () => {
  const c = await ready();
  await c.dispatch({ type: 'beginTechData', referenceId: 'r1' });
  const id = c.getState().view.id;
  await c.dispatch({ type: 'setTechScope', workflowId: id, platformId: 'p1', checked: 'true' });
  await c.dispatch({ type: 'openPicker', picker: 'linkHazards', platformId: 'p1', workflowId: id });
  assert.equal(c.getState().picker.workflowId, id);
  await c.dispatch({ type: 'linkHazards', platformId: 'p1', workflowId: id, hazardId: 'h2' });
  const step = W(c).records.workflowStep[`ws:${id}:p1|h2:scope`];
  assert.deepEqual([step.checked, step.added, c.getState().picker], [true, true, null]);
  await c.dispatch({ type: 'setSfarp', hazardId: 'h2', platformId: 'p1', justification: 'Per TR-7' });
  assert.equal(entries(W(c)).at(-1).workflow, id);
});
