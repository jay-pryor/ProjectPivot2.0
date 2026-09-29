import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController, initialState } from '../../src/ui/controller.js';
import { hazardView } from '../../src/ui/screens/hazards.js';
import { platformView } from '../../src/ui/screens/platforms.js';
import { messages } from '../../src/ui/screens/common.js';
import { seed } from '../helpers.js';

const env = (f) => ({ clock: fixedClock('2026-09-28T10:00:00+10:00'), storage: new MemoryStorage(), minSaveMs: 0,
  pickFolder: async () => f.handle, pickSaveFile: async (n) => f.handle.getFileHandle(n, { create: true }), pickOpenFile: async () => null });

async function ready() {
  const c = createController(env(new MemoryFolder()));
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  await c.dispatch({ type: 'selectProfile', id: c.getState().profiles[0].id });
  await c.dispatch({ type: 'createHazard', id: 'h1', title: 'Fire' });
  await c.dispatch({ type: 'createPlatform', id: 'p1', name: 'Alpha', ownerId: c.getState().profileId });
  return c;
}
const W = (c) => c.getState().session.working;
const state = { ...initialState(), screen: 'main', today: '2026-09-28', profileId: 'u1', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }] };

test('the second click only asks; the third deletes; Undo puts it back', async () => {
  const c = await ready();
  await c.dispatch({ type: 'askDelete', kind: 'hazard', id: 'h1' });
  assert.deepEqual(c.getState().confirmDelete, { kind: 'hazard', id: 'h1' });
  assert.equal(W(c).records.hazard.h1.status, 'live', 'nothing deleted yet');
  await c.dispatch({ type: 'cancelDelete' });
  assert.equal(c.getState().confirmDelete, null);
  await c.dispatch({ type: 'askDelete', kind: 'hazard', id: 'h1' });
  const before = W(c);
  await c.dispatch({ type: 'confirmDelete', kind: 'hazard', id: 'h1' });
  assert.equal(W(c).records.hazard.h1.status, 'deleted');
  assert.equal(c.getState().view.name, 'hazards');
  assert.equal(c.getState().confirmDelete, null);
  assert.match(messages(c.getState()).toString(), /Deleted Fire\.[\s\S]*?data-action="undoDelete"/);
  await c.dispatch({ type: 'undoDelete' });
  assert.equal(W(c), before, 'exactly as before the delete');
  assert.equal(W(c).records.hazard.h1.status, 'live');
  assert.doesNotMatch(messages(c.getState()).toString(), /undoDelete/);
  assert.match(c.getState().message.text, /Restored Fire/);
});

test('Undo is offered only until the next change', async () => {
  const c = await ready();
  await c.dispatch({ type: 'askDelete', kind: 'platform', id: 'p1' });
  await c.dispatch({ type: 'confirmDelete', kind: 'platform', id: 'p1' });
  assert.equal(c.getState().view.name, 'platforms');
  assert.match(messages(c.getState()).toString(), /Deleted Alpha\./);
  await c.dispatch({ type: 'createHazard', id: 'h9', title: 'Later' });
  assert.doesNotMatch(messages(c.getState()).toString(), /undoDelete/);
  await c.dispatch({ type: 'undoDelete' });
  assert.equal(W(c).records.platform.p1.status, 'deleted', 'too late: nothing is undone');
  assert.ok(W(c).records.hazard.h9);
});

test('the pages ask before deleting: the red button asks, and the final panel deletes or keeps', () => {
  const d = seed();
  const h = hazardView({ ...state, view: { name: 'hazard', id: 'h2' } }, d, 'h2').toString();
  assert.match(h, /<summary>Delete…<\/summary><button type="button" class="danger" data-action="askDelete" data-kind="hazard" data-id="h2">/);
  assert.doesNotMatch(h, /data-action="deleteHazard"/);
  const asking = hazardView({ ...state, view: { name: 'hazard', id: 'h2' }, confirmDelete: { kind: 'hazard', id: 'h2' } }, d, 'h2').toString();
  assert.match(asking, /class="delete-panel"[\s\S]*?data-action="confirmDelete" data-kind="hazard" data-id="h2"[^>]*>Yes, delete Flood<\/button>[\s\S]*?data-action="cancelDelete"[^>]*>Keep it</);
  const p = platformView({ ...state, confirmDelete: { kind: 'platform', id: 'p3' } }, (() => { const x = structuredClone(d); x.records.platform.p3 = { ...x.records.platform.p1, id: 'p3', name: 'Charlie' }; return x; })(), 'p3').toString();
  assert.match(p, /data-action="confirmDelete" data-kind="platform" data-id="p3"[^>]*>Yes, delete Charlie</);
});
