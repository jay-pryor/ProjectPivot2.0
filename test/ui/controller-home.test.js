import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController, initialState } from '../../src/ui/controller.js';
import { hasUnsaved } from '../../src/storage/mirror.js';
import { ackStart, waitingChanges } from '../../src/core/acks.js';

const env = (f, clock = fixedClock('2026-09-28T10:00:00+10:00')) => ({ clock, storage: new MemoryStorage(), minSaveMs: 0,
  pickFolder: async () => f.handle, pickSaveFile: async (n) => f.handle.getFileHandle(n, { create: true }), pickOpenFile: async () => null });

async function openAs(c, name) {
  await c.dispatch({ type: 'chooseFolder' });
  let p = c.getState().profiles.find((x) => x.name === name);
  if (!p) { await c.dispatch({ type: 'createProfile', name }); p = c.getState().profiles.find((x) => x.name === name); }
  await c.dispatch({ type: 'selectProfile', id: p.id });
  return p.id;
}
const W = (c) => c.getState().session.working;

test('Pivot opens on Home, showing my items; opening alone leaves nothing unsaved', async () => {
  assert.equal(initialState().homeOwner, 'me');
  const c = createController(env(new MemoryFolder()));
  await openAs(c, 'Ada');
  assert.equal(c.getState().view.name, 'home');
  assert.equal(hasUnsaved(c.getState().session), false);
  assert.equal(ackStart(W(c)), null);
});

test('the start is written with the first real edit, dated when the session opened, and only once', async () => {
  const clock = fixedClock('2026-09-28T10:00:00+10:00');
  const c = createController(env(new MemoryFolder(), clock));
  const ada = await openAs(c, 'Ada');
  clock.advance(60_000);
  await c.dispatch({ type: 'setHomeOwner', ownerId: 'everyone' });
  assert.equal(ackStart(W(c)), null, 'a quiet action is not an edit');
  await c.dispatch({ type: 'createPlatform', id: 'p1', name: 'Alpha', ownerId: ada });
  assert.equal(ackStart(W(c)), '2026-09-28T10:00:00+10:00');
  await c.dispatch({ type: 'updatePlatform', id: 'p1', name: 'Alpha' });
  assert.equal(Object.values(W(c).history).filter((e) => e.type === 'acksStarted').length, 1);
});

test('a no-op edit writes no start', async () => {
  const c = createController(env(new MemoryFolder()));
  await openAs(c, 'Ada');
  await c.dispatch({ type: 'acknowledge', entryId: 'nope', platformId: 'nope' });
  assert.equal(hasUnsaved(c.getState().session), false);
});

test('another person\'s change waits for me; I acknowledge one, or all shown', async () => {
  const f = new MemoryFolder();
  const a = createController(env(f));
  const ada = await openAs(a, 'Ada');
  await a.dispatch({ type: 'createPlatform', id: 'p1', name: 'Alpha', ownerId: ada });
  await a.dispatch({ type: 'createPlatform', id: 'p2', name: 'Bravo', ownerId: ada });
  await a.dispatch({ type: 'save' });
  const g = createController(env(f));
  await openAs(g, 'Grace');
  await g.dispatch({ type: 'updatePlatform', id: 'p1', name: 'Alpha 1' });
  await g.dispatch({ type: 'updatePlatform', id: 'p2', name: 'Bravo 1' });
  await g.dispatch({ type: 'save' });
  await a.dispatch({ type: 'save' });
  const [one] = waitingChanges(W(a), 'p1');
  assert.ok(one, 'Grace\'s rename waits on Alpha');
  await a.dispatch({ type: 'acknowledge', entryId: one.id, platformId: 'p1' });
  assert.deepEqual(waitingChanges(W(a), 'p1'), []);
  const [two] = waitingChanges(W(a), 'p2');
  await a.dispatch({ type: 'acknowledgeAll', keys: `${two.id}|p2` });
  assert.deepEqual(waitingChanges(W(a), 'p2'), []);
});

test('setHomeOwner changes whose items Home shows, and can show Home', async () => {
  const c = createController(env(new MemoryFolder()));
  await openAs(c, 'Ada');
  await c.dispatch({ type: 'go', view: 'platforms' });
  await c.dispatch({ type: 'setHomeOwner', ownerId: 'u9', show: 'home' });
  assert.deepEqual([c.getState().homeOwner, c.getState().view.name], ['u9', 'home']);
  await c.dispatch({ type: 'setHomeOwner', ownerId: '' });
  assert.equal(c.getState().homeOwner, 'me');
  assert.equal(c.getState().busy, false);
});
