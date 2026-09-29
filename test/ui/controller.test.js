import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController } from '../../src/ui/controller.js';
import { load, FILES } from '../../src/storage/store.js';

/** @param {MemoryFolder} folder @param {MemoryStorage} [storage] */
function env(folder, storage = new MemoryStorage()) {
  return {
    clock: fixedClock('2026-09-28T10:00:00+10:00'), minSaveMs: 0,
    storage,
    pickFolder: async () => folder.handle,
    pickSaveFile: async (name) => folder.handle.getFileHandle(name, { create: true }),
    pickOpenFile: async () => { throw new DOMException('cancelled', 'AbortError'); },
  };
}

/** Open the folder as `name`, creating the profile if needed. */
async function openAs(c, name) {
  await c.dispatch({ type: 'chooseFolder' });
  let p = c.getState().profiles.find((x) => x.name === name);
  if (!p) {
    await c.dispatch({ type: 'createProfile', name });
    p = c.getState().profiles.find((x) => x.name === name);
  }
  await c.dispatch({ type: 'selectProfile', id: p.id });
  return p.id;
}

test('open an empty folder, create a profile, add a hazard, save', async () => {
  const f = new MemoryFolder();
  const c = createController(env(f));
  assert.equal(c.getState().screen, 'open');
  await c.dispatch({ type: 'chooseFolder' });
  assert.equal(c.getState().screen, 'profile');
  assert.equal(c.getState().folderName, 'Pivot Data');
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  const ada = c.getState().profiles[0];
  assert.equal(c.getState().profileId, null, 'creating a profile selects nobody');
  await c.dispatch({ type: 'selectProfile', id: ada.id });
  assert.equal(c.getState().screen, 'main');
  await c.dispatch({ type: 'createHazard', title: 'Fire' });
  const { view, session } = c.getState();
  assert.equal(view.name, 'hazard');
  assert.equal(session.working.records.hazard[view.id].title, 'Fire');
  await c.dispatch({ type: 'save' });
  assert.equal(c.getState().message, null, 'a plain save shows no pop-up; the Save button says Saved');
  assert.equal(c.getState().session.working, c.getState().session.base);
  const stored = await load(f.handle);
  assert.equal(stored.data.records.hazard[view.id].number, 1);
});

test('nothing can be changed before a profile is selected', async () => {
  const f = new MemoryFolder();
  const c = createController(env(f));
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createHazard', title: 'Fire' });
  assert.equal(c.getState().message.kind, 'error');
  assert.equal(f.exists(FILES.data), false);
});

test('a refused edit shows its message and changes nothing', async () => {
  const c = createController(env(new MemoryFolder()));
  await openAs(c, 'Ada');
  const before = c.getState().session.working;
  await c.dispatch({ type: 'createHazard', title: '   ' });
  assert.deepEqual(c.getState().message, { kind: 'error', text: 'A hazard title cannot be empty.' });
  assert.equal(c.getState().session.working, before);
});

test('every change is mirrored to the browser, and an hourly backup is taken', async () => {
  const f = new MemoryFolder();
  const storage = new MemoryStorage();
  const c = createController(env(f, storage));
  await openAs(c, 'Ada');
  await c.dispatch({ type: 'createHazard', title: 'Fire' });
  assert.ok(storage.getItem('pivot.unsaved.v2'));
  assert.deepEqual(f.list().filter((p) => p.startsWith('backups/')), ['backups/data-20260928-100000.json']);
  await c.dispatch({ type: 'save' });
  assert.equal(storage.getItem('pivot.unsaved.v2'), null, 'a save clears the unsaved copy');
});

test('a full browser storage gives a warning, and work carries on', async () => {
  const storage = new MemoryStorage();
  storage.fill();
  const c = createController(env(new MemoryFolder(), storage));
  await openAs(c, 'Ada');
  await c.dispatch({ type: 'createHazard', title: 'Fire' });
  assert.match(c.getState().warnings[0], /not being kept/);
  await c.dispatch({ type: 'save' });
  assert.equal(c.getState().message, null);
  assert.equal(c.getState().session.working, c.getState().session.base, 'saved');
});

test('Review focus 5: recovered work merges with a save made by someone else since', async () => {
  const f = new MemoryFolder();
  const storage = new MemoryStorage();
  const a = createController(env(f, storage));
  await openAs(a, 'Ada');
  await a.dispatch({ type: 'save' });
  await a.dispatch({ type: 'createHazard', id: 'ha', title: 'From Ada' });
  // Ada's browser crashes here. Meanwhile Grace saves a change from her own machine.
  const g = createController(env(f));
  await openAs(g, 'Grace');
  await g.dispatch({ type: 'createControl', id: 'cg', title: 'From Grace' });
  await g.dispatch({ type: 'save' });
  // Ada reopens Pivot on her machine.
  const a2 = createController(env(f, storage));
  await a2.dispatch({ type: 'chooseFolder' });
  await a2.dispatch({ type: 'selectProfile', id: a2.getState().profiles.find((p) => p.name === 'Ada').id });
  assert.equal(a2.getState().screen, 'recover');
  await a2.dispatch({ type: 'recover' });
  assert.equal(a2.getState().screen, 'main');
  await a2.dispatch({ type: 'save' });
  const stored = (await load(f.handle)).data;
  assert.equal(stored.records.hazard.ha.title, 'From Ada');
  assert.equal(stored.records.control.cg.title, 'From Grace');
  assert.match(a2.getState().message.text, /Grace had saved/);
});

test('discarding recovered work leaves the folder as it was', async () => {
  const f = new MemoryFolder();
  const storage = new MemoryStorage();
  const a = createController(env(f, storage));
  await openAs(a, 'Ada');
  await a.dispatch({ type: 'createHazard', title: 'Unsaved' });
  const a2 = createController(env(f, storage));
  await a2.dispatch({ type: 'chooseFolder' });
  await a2.dispatch({ type: 'selectProfile', id: a2.getState().profiles[0].id });
  await a2.dispatch({ type: 'discardRecovery' });
  assert.equal(a2.getState().screen, 'main');
  assert.deepEqual(Object.keys(a2.getState().session.working.records.hazard), []);
  assert.equal(storage.getItem('pivot.unsaved.v2'), null);
});

test('an overridden user is told on their next open, once', async () => {
  const f = new MemoryFolder();
  const a = createController(env(f));
  await openAs(a, 'Ada');
  await a.dispatch({ type: 'createHazard', id: 'h1', title: 'Fire' });
  await a.dispatch({ type: 'save' });
  const g = createController(env(f));
  await openAs(g, 'Grace');
  await g.dispatch({ type: 'updateHazard', id: 'h1', title: 'Grace title' });
  await a.dispatch({ type: 'updateHazard', id: 'h1', title: 'Ada title' });
  await g.dispatch({ type: 'save' });
  await a.dispatch({ type: 'save' });
  assert.equal(a.getState().message.kind, 'warning');
  assert.match(a.getState().message.text, /1 of Grace's changes/);

  const g2 = createController(env(f));
  await openAs(g2, 'Grace');
  assert.equal(g2.getState().screen, 'notices');
  assert.equal(g2.getState().notices[0].items[0].theirs.title, 'Grace title');
  await g2.dispatch({ type: 'dismissNotices' });
  assert.equal(g2.getState().screen, 'main');
  await g2.dispatch({ type: 'save' });
  const g3 = createController(env(f));
  await openAs(g3, 'Grace');
  assert.equal(g3.getState().screen, 'main', 'shown once');
});

test('a folder whose data.json fails its check opens to the backups, with nothing from it shown', async () => {
  const f = new MemoryFolder();
  const a = createController(env(f));
  await openAs(a, 'Ada');
  await a.dispatch({ type: 'createHazard', title: 'Fire' });
  await a.dispatch({ type: 'save' });
  f.write(FILES.data, /** @type {string} */ (f.read(FILES.data)).replace('Fire', 'Flood'));
  const b = createController(env(f));
  await b.dispatch({ type: 'chooseFolder' });
  assert.equal(b.getState().screen, 'check');
  assert.deepEqual(b.getState().check.failed.map((x) => x.file), ['data.json']);
  await b.dispatch({ type: 'continueFromCheck' });
  await b.dispatch({ type: 'selectProfile', id: b.getState().profiles[0].id });
  assert.equal(b.getState().screen, 'main');
  assert.equal(b.getState().session, null);
  assert.equal(b.getState().view.name, 'backups');
});

test('filters and navigation', async () => {
  const c = createController(env(new MemoryFolder()));
  await openAs(c, 'Ada');
  await c.dispatch({ type: 'setFilter', list: 'hazards', field: 'status', value: 'retired' });
  assert.deepEqual(c.getState().filters.hazards, { status: 'retired' });
  await c.dispatch({ type: 'setFilter', list: 'hazards', field: 'status', value: '' });
  assert.deepEqual(c.getState().filters.hazards, {});
  await c.dispatch({ type: 'go', view: 'assessment', hazardId: 'h', platformId: 'p' });
  assert.deepEqual(c.getState().view, { name: 'assessment', id: undefined, hazardId: 'h', platformId: 'p', tab: undefined, reviewId: undefined });
});

test('Final review C1: the saver is told when records were missing from the file on disk and have been kept', async () => {
  const f = new MemoryFolder();
  const a = createController(env(f));
  await openAs(a, 'Ada');
  await a.dispatch({ type: 'createHazard', id: 'h1', title: 'Fire' });
  await a.dispatch({ type: 'save' });
  f.remove(FILES.data);
  const g = createController(env(f));
  await openAs(g, 'Grace');
  await g.dispatch({ type: 'createHazard', id: 'hg', title: 'Grace' });
  await g.dispatch({ type: 'save' });
  await a.dispatch({ type: 'createControl', id: 'c1', title: 'Sprinklers' });
  await a.dispatch({ type: 'save' });
  const m = a.getState().message;
  assert.equal(m.kind, 'warning');
  assert.ok(m.items.some((i) => /1 record was missing from data\.json/.test(i)), JSON.stringify(m));
});

test('Final review I1: an edit made while a save is in progress is kept, not lost', async () => {
  const f = new MemoryFolder();
  const c = createController(env(f));
  await openAs(c, 'Ada');
  await c.dispatch({ type: 'createHazard', id: 'h1', title: 'Fire' });
  const saving = c.dispatch({ type: 'save' });
  await c.dispatch({ type: 'updateHazard', id: 'h1', title: 'Edited during the save' });
  await saving;
  const { session } = c.getState();
  assert.equal(session.working.records.hazard.h1.title, 'Edited during the save');
  assert.equal(session.base.records.hazard.h1.number, 1, 'the save itself went through');
  assert.equal(session.working.records.hazard.h1.number, 1, 'and its numbering is kept under the edit');
  await c.dispatch({ type: 'save' });
  assert.equal((await load(f.handle)).data.records.hazard.h1.title, 'Edited during the save');
});

test('Final review I2: profiles.json unreadable just after a merged save leaves the saved session in place, with a warning', async () => {
  const f = new MemoryFolder();
  const a = createController(env(f));
  await openAs(a, 'Ada');
  await a.dispatch({ type: 'save' });
  const g = createController(env(f));
  await openAs(g, 'Grace');
  await g.dispatch({ type: 'createControl', id: 'cg', title: 'From Grace' });
  await g.dispatch({ type: 'save' });
  await a.dispatch({ type: 'createHazard', id: 'h1', title: 'Fire' });
  f.denyRead((rel) => rel === 'profiles.json');
  await a.dispatch({ type: 'save' });
  const s = a.getState();
  assert.equal((await load(f.handle)).stamp.token, s.session.loadedStamp.token, 'the session knows it saved');
  assert.equal(s.session.working.records.hazard.h1.number, 1, 'new hazards are numbered in the session');
  assert.notEqual(s.message.kind, 'error');
  assert.ok(s.warnings.some((w) => /profiles/.test(w)), JSON.stringify(s.warnings));
});

test('busy stays on until every running action has finished', async () => {
  const f = new MemoryFolder();
  let release;
  const slow = new Promise((r) => { release = r; });
  const e = { ...env(f), pickOpenFile: async () => { await slow; throw new DOMException('cancelled', 'AbortError'); } };
  const c = createController(e);
  await openAs(c, 'Ada');
  const restoring = c.dispatch({ type: 'prepareRestoreFromFile' });
  await c.dispatch({ type: 'dismissMessage' });
  assert.equal(c.getState().busy, true, 'the slower action is still running');
  release();
  await restoring;
  assert.equal(c.getState().busy, false);
});
