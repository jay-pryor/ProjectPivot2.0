import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController } from '../../src/ui/controller.js';
import { readProfiles, updateProfilePrefs } from '../../src/storage/store.js';

const env = (f, storage = new MemoryStorage()) => ({ clock: fixedClock('2026-09-28T10:00:00+10:00'), storage, minSaveMs: 0,
  pickFolder: async () => f.handle, pickSaveFile: async (n) => f.handle.getFileHandle(n, { create: true }), pickOpenFile: async () => null });

test('a new profile, used for the first time, opens on Help: Getting started; after that, on Home', async () => {
  const f = new MemoryFolder();
  const c = createController(env(f));
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  const ada = c.getState().profiles[0].id;
  await c.dispatch({ type: 'selectProfile', id: ada });
  assert.deepEqual([c.getState().view.name, c.getState().view.topic], ['help', 'getting-started']);
  assert.equal((await readProfiles(f.handle))[0].prefs.helpSeen, true, 'kept on the profile, so it happens once wherever they open it');
  const again = createController(env(f));
  await again.dispatch({ type: 'chooseFolder' });
  await again.dispatch({ type: 'selectProfile', id: ada });
  assert.equal(again.getState().view.name, 'home');
});

test('a profile made before Help existed (no helpSeen on it) opens on Home as before', async () => {
  const f = new MemoryFolder();
  const c = createController(env(f));
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  const ada = c.getState().profiles[0].id;
  // Written as JSON, an undefined setting is left out: as profiles were stored before.
  await updateProfilePrefs(f.handle, ada, { helpSeen: undefined }, fixedClock('2026-09-28T10:00:00+10:00'));
  assert.ok(!('helpSeen' in ((await readProfiles(f.handle))[0].prefs ?? {})));
  const d = createController(env(f));
  await d.dispatch({ type: 'chooseFolder' });
  await d.dispatch({ type: 'selectProfile', id: ada });
  assert.equal(d.getState().view.name, 'home');
});
