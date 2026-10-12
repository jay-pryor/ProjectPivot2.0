import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController } from '../../src/ui/controller.js';
import { readProfiles } from '../../src/storage/store.js';

const env = (f) => ({ clock: fixedClock('2026-10-12T10:00:00+10:00'), storage: new MemoryStorage(), minSaveMs: 0,
  pickFolder: async () => f.handle, pickSaveFile: async (n) => f.handle.getFileHandle(n, { create: true }), pickOpenFile: async () => null });

/** Ada working, with Grace and Sid besides; Grace owns Alpha. */
async function ready() {
  const f = new MemoryFolder();
  const c = createController(env(f));
  await c.dispatch({ type: 'chooseFolder' });
  for (const name of ['Ada', 'Grace', 'Sid']) await c.dispatch({ type: 'createProfile', name });
  const id = (name) => c.getState().profiles.find((p) => p.name === name).id;
  await c.dispatch({ type: 'selectProfile', id: id('Ada') });
  await c.dispatch({ type: 'createPlatform', id: 'p1', name: 'Alpha', ownerId: id('Grace') });
  return { c, f, id };
}

test('a profile with nothing assigned is retired, kept in profiles.json with who and when; Restore brings it back', async () => {
  const { c, f, id } = await ready();
  await c.dispatch({ type: 'retireProfile', id: id('Sid') });
  const sid = (await readProfiles(f.handle)).find((p) => p.name === 'Sid');
  assert.deepEqual(sid.retired, { by: id('Ada'), at: '2026-10-12T10:00:00+10:00' });
  assert.ok(c.getState().profiles.find((p) => p.name === 'Sid').retired);
  await c.dispatch({ type: 'restoreProfile', id: id('Sid') });
  assert.equal((await readProfiles(f.handle)).find((p) => p.name === 'Sid').retired, null);
});

test('a profile that still owns something is not retired, and the message says what', async () => {
  const { c, f, id } = await ready();
  await c.dispatch({ type: 'retireProfile', id: id('Grace') });
  assert.match(c.getState().message.text, /Grace still owns Alpha/);
  assert.ok(!(await readProfiles(f.handle)).find((p) => p.name === 'Grace').retired);
});

test('the profile you are using cannot be retired', async () => {
  const { c, id } = await ready();
  await c.dispatch({ type: 'retireProfile', id: id('Ada') });
  assert.match(c.getState().message.text, /using/);
  assert.ok(!c.getState().profiles.find((p) => p.name === 'Ada').retired);
});

test('the Profiles page is in the ☰ menu', async () => {
  const { c } = await ready();
  await c.dispatch({ type: 'go', view: 'profiles' });
  assert.equal(c.getState().view.name, 'profiles');
});
