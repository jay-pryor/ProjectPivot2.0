import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController } from '../../src/ui/controller.js';
import { themeOf, columnWidth } from '../../src/ui/prefs.js';
import { readProfiles } from '../../src/storage/store.js';

function env(folder, extra = {}) {
  return {
    clock: fixedClock('2026-09-28T10:00:00+10:00'), storage: new MemoryStorage(), minSaveMs: 0,
    pickFolder: async () => folder.handle,
    pickSaveFile: async (name) => folder.handle.getFileHandle(name, { create: true }),
    pickOpenFile: async () => null,
    ...extra,
  };
}
async function openAs(c, name) {
  await c.dispatch({ type: 'chooseFolder' });
  if (!c.getState().profiles.some((p) => p.name === name)) await c.dispatch({ type: 'createProfile', name });
  await c.dispatch({ type: 'selectProfile', id: c.getState().profiles.find((p) => p.name === name).id });
}

test('dark is the default theme, before and after picking a profile', async () => {
  const c = createController(env(new MemoryFolder()));
  assert.equal(themeOf(c.getState()), 'dark');
  await openAs(c, 'Ada');
  assert.equal(themeOf(c.getState()), 'dark');
});

test('a theme chosen is kept on the profile and comes back on the next open', async () => {
  const f = new MemoryFolder();
  const c = createController(env(f));
  await openAs(c, 'Ada');
  await c.dispatch({ type: 'setTheme', theme: 'light' });
  assert.equal(themeOf(c.getState()), 'light');
  assert.equal((await readProfiles(f.handle))[0].prefs.theme, 'light');
  const c2 = createController(env(f));
  await openAs(c2, 'Ada');
  assert.equal(themeOf(c2.getState()), 'light');
  await c2.dispatch({ type: 'setTheme', theme: 'purple' });
  assert.equal(c2.getState().message.kind, 'error');
});

test('column widths dragged are kept on the profile', async () => {
  const f = new MemoryFolder();
  const c = createController(env(f));
  await openAs(c, 'Ada');
  assert.equal(columnWidth(c.getState(), 'hazards', 'title'), null);
  await c.dispatch({ type: 'setColumnWidth', table: 'hazards', column: 'title', width: '287.6' });
  assert.equal(columnWidth(c.getState(), 'hazards', 'title'), 288);
  assert.deepEqual((await readProfiles(f.handle))[0].prefs.columnWidths, { 'hazards.title': 288 });
  await c.dispatch({ type: 'setColumnWidth', table: 'hazards', column: 'id', width: '10' });
  assert.equal(columnWidth(c.getState(), 'hazards', 'id'), 40, 'a column is never narrower than 40px');
});

test('sorting cycles ascending, descending, off; filters set and clear; neither is kept on the profile', async () => {
  const f = new MemoryFolder();
  const c = createController(env(f));
  await openAs(c, 'Ada');
  await c.dispatch({ type: 'sortTable', table: 'hazards', key: 'title' });
  assert.deepEqual(c.getState().tables.hazards.sort, { key: 'title', dir: 'asc' });
  await c.dispatch({ type: 'sortTable', table: 'hazards', key: 'title' });
  assert.deepEqual(c.getState().tables.hazards.sort, { key: 'title', dir: 'desc' });
  await c.dispatch({ type: 'sortTable', table: 'hazards', key: 'title' });
  assert.equal(c.getState().tables.hazards.sort, null, 'a third click turns sorting off');
  await c.dispatch({ type: 'sortTable', table: 'hazards', key: 'id' });
  assert.deepEqual(c.getState().tables.hazards.sort, { key: 'id', dir: 'asc' });
  await c.dispatch({ type: 'filterTable', table: 'hazards', key: 'title', value: 'fire' });
  assert.deepEqual(c.getState().tables.hazards.filters, { title: 'fire' });
  await c.dispatch({ type: 'filterTable', table: 'hazards', key: 'title', value: '' });
  assert.deepEqual(c.getState().tables.hazards.filters, {});
  assert.equal((await readProfiles(f.handle))[0].prefs, undefined);
});

test('a row being edited in place: start, cancel, and cleared once the edit is applied', async () => {
  const c = createController(env(new MemoryFolder()));
  await openAs(c, 'Ada');
  await c.dispatch({ type: 'createHazard', id: 'h1', title: 'Fire' });
  await c.dispatch({ type: 'addCausalFactor', id: 'cf1', hazardId: 'h1', text: 'Heat' });
  await c.dispatch({ type: 'startEdit', kind: 'causalFactor', id: 'cf1' });
  assert.deepEqual(c.getState().editing, { kind: 'causalFactor', id: 'cf1' });
  await c.dispatch({ type: 'cancelEdit' });
  assert.equal(c.getState().editing, null);
  await c.dispatch({ type: 'startEdit', kind: 'causalFactor', id: 'cf1' });
  await c.dispatch({ type: 'updateCausalFactor', id: 'cf1', text: 'Hot works' });
  assert.equal(c.getState().editing, null);
  assert.equal(c.getState().session.working.records.causalFactor.cf1.text, 'Hot works');
});

test('saving: shown as saving for at least the minimum time, and a plain save shows no message', async () => {
  const f = new MemoryFolder();
  const c = createController(env(f, { minSaveMs: 60 }));
  await openAs(c, 'Ada');
  await c.dispatch({ type: 'createHazard', title: 'Fire' });
  const seen = [];
  c.subscribe((s) => seen.push(s.saving));
  const t0 = Date.now();
  await c.dispatch({ type: 'save' });
  assert.ok(Date.now() - t0 >= 55, 'the save took at least the minimum time');
  assert.ok(seen.includes(true), 'saving was shown');
  assert.equal(c.getState().saving, false);
  assert.equal(c.getState().message, null, 'no pop-up for a plain save');
});
