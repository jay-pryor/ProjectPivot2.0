import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController } from '../../src/ui/controller.js';

const env = (f, storage = new MemoryStorage()) => ({ clock: fixedClock('2026-09-28T10:00:00+10:00'), storage, minSaveMs: 0,
  pickFolder: async () => f.handle, pickSaveFile: async (n) => f.handle.getFileHandle(n, { create: true }), pickOpenFile: async () => null });

test('New platform onboards it: the platform and its workflow are made and the workflow opens; it survives a save', async () => {
  const f = new MemoryFolder();
  const storage = new MemoryStorage();
  const c = createController(env(f, storage));
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  const ada = c.getState().profiles[0].id;
  await c.dispatch({ type: 'selectProfile', id: ada });
  await c.dispatch({ type: 'onboardPlatform', name: 'Gamma', ownerId: ada });
  const v = c.getState().view;
  const w = c.getState().session.working;
  assert.equal(v.name, 'workflow');
  assert.equal(w.records.workflow[v.id].type, 'platformOnboarding');
  assert.equal(w.records.platform[w.records.workflow[v.id].platformId].name, 'Gamma');
  await c.dispatch({ type: 'updatePlatform', id: w.records.workflow[v.id].platformId, description: 'A trailer' });
  await c.dispatch({ type: 'save' });
  const again = createController(env(f, storage));
  await again.dispatch({ type: 'chooseFolder' });
  await again.dispatch({ type: 'selectProfile', id: ada });
  const saved = again.getState().session.working;
  assert.equal(saved.records.platform[saved.records.workflow[v.id].platformId].description, 'A trailer');
});
test('ticked suggested controls are added to the hazard here and set Implemented', async () => {
  const f = new MemoryFolder();
  const c = createController(env(f));
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  const ada = c.getState().profiles[0].id;
  await c.dispatch({ type: 'selectProfile', id: ada });
  await c.dispatch({ type: 'createHazard', id: 'h1', title: 'Fire' });
  await c.dispatch({ type: 'createControl', id: 'c1', title: 'Sprinklers' });
  await c.dispatch({ type: 'onboardPlatform', name: 'Gamma', ownerId: ada });
  const w = c.getState().session.working;
  const pid = w.records.workflow[c.getState().view.id].platformId;
  await c.dispatch({ type: 'linkHazards', hazardId: 'h1', platformId: pid });
  await c.dispatch({ type: 'addSuggestedControls', hazardId: 'h1', platformId: pid, controlId: ['c1'] });
  const after = c.getState().session.working;
  assert.equal(after.records.ruling[`ru:h1:c1:${pid}`].state, 'implemented');
});
