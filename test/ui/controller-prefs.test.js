import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController } from '../../src/ui/controller.js';
import { themeOf, columnWidth, favouritesOf, isFavourite, favouriteLayout, comingUpDays } from '../../src/ui/prefs.js';
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
  await c.dispatch({ type: 'resetColumnWidth', table: 'hazards', column: 'title' });
  assert.equal(columnWidth(c.getState(), 'hazards', 'title'), null, 'double-clicking the handle forgets the width');
  assert.deepEqual((await readProfiles(f.handle))[0].prefs.columnWidths, { 'hazards.id': 40 });
  assert.equal(c.getState().busy, false);
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

test('a dragged column width is applied at once, before profiles.json is written (no snap back)', async () => {
  const f = new MemoryFolder();
  const c = createController(env(f));
  await openAs(c, 'Ada');
  const seen = [];
  c.subscribe((s) => seen.push(columnWidth(s, 'hazards', 'title')));
  await c.dispatch({ type: 'setColumnWidth', table: 'hazards', column: 'title', width: '300' });
  assert.equal(seen[0], 300, 'the very first redraw already has the new width');
  assert.ok(seen.every((w) => w === 300), `never shown at the old width: ${seen}`);
});

test('favourite pages are each profile\'s own: a page or a page within it, starred in order, reordered, unstarred, laid out, and back on the next open', async () => {
  const f = new MemoryFolder();
  const c = createController(env(f));
  await openAs(c, 'Ada');
  await c.dispatch({ type: 'toggleFavourite', page: 'hazards', id: '', tab: '' });
  await c.dispatch({ type: 'toggleFavourite', page: 'hazard', id: 'h1', tab: '' });
  await c.dispatch({ type: 'toggleFavourite', page: 'hazard', id: 'h1', tab: 'p:p1' });
  await c.dispatch({ type: 'toggleFavourite', page: 'platform', id: 'p1', tab: 'details' });
  assert.deepEqual(favouritesOf(c.getState()), [{ name: 'hazards', id: null, tab: null }, { name: 'hazard', id: 'h1', tab: null }, { name: 'hazard', id: 'h1', tab: 'p:p1' }, { name: 'platform', id: 'p1', tab: null }]);
  assert.ok(isFavourite(c.getState(), { name: 'hazard', id: 'h1', tab: 'p:p1' }), 'a hazard on one platform is a page of its own');
  assert.ok(!isFavourite(c.getState(), { name: 'hazard', id: 'h1', tab: 'history' }));
  await c.dispatch({ type: 'moveFavourite', from: '3', to: '0' });
  assert.deepEqual(favouritesOf(c.getState()).map((x) => x.name), ['platform', 'hazards', 'hazard', 'hazard']);
  await c.dispatch({ type: 'moveFavourite', from: '0', to: '9' });
  assert.equal(favouritesOf(c.getState())[0].name, 'platform', 'nowhere to go: left as it is');
  await c.dispatch({ type: 'toggleFavourite', page: 'hazard', id: 'h1' });
  assert.deepEqual(favouritesOf(c.getState()).map((x) => `${x.name}${x.tab ? `:${x.tab}` : ''}`), ['platform', 'hazards', 'hazard:p:p1']);
  assert.equal(favouriteLayout(c.getState()), 'table');
  await c.dispatch({ type: 'setFavouriteLayout', layout: 'large' });
  await c.dispatch({ type: 'setFavouriteLayout', layout: 'bogus' });
  await c.dispatch({ type: 'setComingUpDays', days: '30' });
  await c.dispatch({ type: 'setComingUpDays', days: '31' });
  await c.dispatch({ type: 'toggleFavouriteEdit' });
  assert.equal(c.getState().favouritesEditing, true);
  await c.dispatch({ type: 'go', view: 'hazards' });
  assert.equal(c.getState().favouritesEditing, false, 'leaving the page ends editing');
  const again = createController(env(f));
  await openAs(again, 'Ada');
  assert.deepEqual(favouritesOf(again.getState()).map((x) => x.name), ['platform', 'hazards', 'hazard']);
  assert.equal(favouriteLayout(again.getState()), 'large');
  assert.equal(comingUpDays(again.getState()), 30, 'the Coming up window is kept on the profile; one not on the menu is ignored');
  const grace = createController(env(f));
  await openAs(grace, 'Grace');
  assert.deepEqual(favouritesOf(grace.getState()), [], 'not Ada\'s');
});
