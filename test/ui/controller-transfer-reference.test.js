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
  await c.dispatch({ type: 'createReference', id: 'r1', title: 'Manual', revision: 'B', url: 'https://old' });
  await c.dispatch({ type: 'linkReference', referenceId: 'r1', targetKind: 'hazard', targetId: 'h1' });
  return c;
}

test('Update revision starts an update or opens the one under way', async () => {
  const c = await ready();
  await c.dispatch({ type: 'startReferenceUpdate', referenceId: 'r1' });
  const id = c.getState().view.id;
  assert.equal(W(c).records.workflow[id].type, 'referenceUpdate');
  await c.dispatch({ type: 'go', view: 'references' });
  await c.dispatch({ type: 'startReferenceUpdate', referenceId: 'r1' });
  assert.equal(c.getState().view.id, id);
});

test('an item opened from the update carries it: edits there are made through it, until leaving that page', async () => {
  const c = await ready();
  await c.dispatch({ type: 'startReferenceUpdate', referenceId: 'r1' });
  const id = c.getState().view.id;
  await c.dispatch({ type: 'go', view: 'hazard', id: 'h1', via: id });
  assert.equal(c.getState().view.via, id);
  await c.dispatch({ type: 'updateHazard', id: 'h1', title: 'Fire on the range' });
  assert.equal(entries(W(c)).at(-1).workflow, id);
  await c.dispatch({ type: 'go', view: 'hazards' });
  assert.equal(c.getState().view.via, undefined);
  await c.dispatch({ type: 'updateHazard', id: 'h1', title: 'Fire' });
  assert.ok(!('workflow' in entries(W(c)).at(-1)));
});

test('a file uploaded for an update is stored, held by the update, and not given to the reference until confirmed', async () => {
  const c = await ready();
  await c.dispatch({ type: 'startReferenceUpdate', referenceId: 'r1' });
  const id = c.getState().view.id;
  await c.dispatch({ type: 'uploadUpdateFile', workflowId: id, file: new File(['rev C'], 'manual-C.pdf', { type: 'application/pdf' }) });
  assert.equal(W(c).records.workflow[id].file.name, 'manual-C.pdf');
  assert.match(W(c).records.workflow[id].file.stored, /^files\/r1\//);
  assert.equal(W(c).records.reference.r1.file, null);
});
