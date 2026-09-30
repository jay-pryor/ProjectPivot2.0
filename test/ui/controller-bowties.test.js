import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController } from '../../src/ui/controller.js';
import { workspaceKey, emptyWorkspace } from '../../src/ui/workspace.js';
import { myViews, sharedWithMe } from '../../src/core/bowtie.js';

const env = (f, storage) => ({ clock: fixedClock('2026-09-30T10:00:00+10:00'), storage, minSaveMs: 0,
  pickFolder: async () => f.handle, pickSaveFile: async (n) => f.handle.getFileHandle(n, { create: true }), pickOpenFile: async () => null });

/** Open the folder as `name`, creating the profile if it is new. */
async function open(folder, name, storage = new MemoryStorage()) {
  const c = createController(env(folder, storage));
  await c.dispatch({ type: 'chooseFolder' });
  if (!c.getState().profiles.some((p) => p.name === name)) await c.dispatch({ type: 'createProfile', name });
  await c.dispatch({ type: 'selectProfile', id: c.getState().profiles.find((p) => p.name === name).id });
  return c;
}
/** Ben's profile exists; Ada has h1 Fire on p1 Alpha and p2 Bravo with a preventative control, unsaved. */
async function ready() {
  const folder = new MemoryFolder();
  const ben = await open(folder, 'Ben');
  const c = await open(folder, 'Ada');
  const me = c.getState().profileId;
  await c.dispatch({ type: 'createHazard', id: 'h1', title: 'Fire' });
  await c.dispatch({ type: 'createControl', id: 'c1', title: 'Sprinklers' });
  await c.dispatch({ type: 'createPlatform', id: 'p1', name: 'Alpha', ownerId: me });
  await c.dispatch({ type: 'createPlatform', id: 'p2', name: 'Bravo', ownerId: me });
  await c.dispatch({ type: 'linkHazards', platformId: 'p1', hazardId: ['h1'] });
  await c.dispatch({ type: 'linkHazards', platformId: 'p2', hazardId: ['h1'] });
  await c.dispatch({ type: 'linkControls', hazardId: 'h1', controlId: 'c1', 'kind:c1': 'preventative' });
  return { folder, c, me, benId: ben.getState().profileId };
}
const S = (c) => c.getState();
const W = (c) => S(c).session.working;
const panes = (c) => S(c).workspace.panes.map((p) => (p ? `${p.platformId}${p.viewId ? `:${p.viewId}` : ''}` : null));

test('opening diagrams: from a hazard\'s platform tab, from New diagram, and dropped beside one another', async () => {
  const { c } = await ready();
  await c.dispatch({ type: 'openBowtie', hazardId: 'h1', platformId: 'p1' });
  assert.equal(S(c).view.name, 'bowties');
  assert.deepEqual(panes(c), ['p1', null]);
  await c.dispatch({ type: 'newBowtie', pair: 'h1|p2' });
  assert.deepEqual(panes(c), ['p2', null], 'a click replaces the only window');
  await c.dispatch({ type: 'openBowtie', hazardId: 'h1', platformId: 'p1' });
  await c.dispatch({ type: 'saveBowtiePaneAs', side: '0', name: 'Alpha' });
  const v = myViews(W(c), S(c).profileId)[0];
  await c.dispatch({ type: 'dropBowtie', side: '1', viewId: v.id });
  assert.deepEqual(panes(c), [`p1:${v.id}`, `p1:${v.id}`]);
  await c.dispatch({ type: 'setPaneSet', side: '1', value: 'existing' });
  await c.dispatch({ type: 'dropBowtie', side: '0', pane: '1' });
  assert.equal(S(c).workspace.panes[0].filters.set, 'existing', 'dragging a window across swaps the two');
  await c.dispatch({ type: 'swapBowtiePanes' });
  assert.equal(S(c).workspace.panes[1].filters.set, 'existing');
  await c.dispatch({ type: 'closeBowtiePane', side: '0' });
  assert.equal(S(c).workspace.panes[0].filters.set, 'existing');
  assert.equal(S(c).workspace.panes[1], null);
  await c.dispatch({ type: 'newBowtie', pair: 'nonsense' });
  assert.equal(S(c).message.kind, 'error');
});

test('filters change per window; replacing an unsaved window asks first', async () => {
  const { c } = await ready();
  await c.dispatch({ type: 'openBowtie', hazardId: 'h1', platformId: 'p1' });
  await c.dispatch({ type: 'setPaneStatus', side: '0', status: 'rejected', on: 'true' });
  await c.dispatch({ type: 'setPaneStatus', side: '0', status: 'planned', on: 'false' });
  assert.deepEqual(S(c).workspace.panes[0].filters.statuses, ['recommended', 'implemented', 'rejected']);
  await c.dispatch({ type: 'openBowtie', hazardId: 'h1', platformId: 'p2' });
  assert.equal(S(c).bowtieReplace?.index, 0, 'the only window has unsaved filters');
  assert.equal(S(c).workspace.panes[0].platformId, 'p1', 'nothing replaced yet');
  await c.dispatch({ type: 'cancelBowtieReplace' });
  assert.equal(S(c).bowtieReplace, null);
  await c.dispatch({ type: 'openBowtie', hazardId: 'h1', platformId: 'p2' });
  await c.dispatch({ type: 'confirmBowtieReplace' });
  assert.equal(S(c).workspace.panes[0].platformId, 'p2');
  assert.equal(S(c).bowtieReplace, null);
});

test('saving: Save on an unsaved window asks for a name; Save on your own view saves its filters; rename and delete with Undo', async () => {
  const { c } = await ready();
  await c.dispatch({ type: 'openBowtie', hazardId: 'h1', platformId: 'p1' });
  await c.dispatch({ type: 'saveBowtiePane', side: '0' });
  assert.deepEqual(S(c).editing, { kind: 'bowtieName', id: '0' });
  await c.dispatch({ type: 'saveBowtiePaneAs', side: '0', name: 'Alpha now' });
  const id = S(c).workspace.panes[0].viewId;
  assert.equal(W(c).records.bowtieView[id].name, 'Alpha now');
  assert.equal(S(c).editing, null);
  await c.dispatch({ type: 'setPaneSet', side: '0', value: 'additional' });
  await c.dispatch({ type: 'saveBowtiePane', side: '0' });
  assert.equal(W(c).records.bowtieView[id].filters.set, 'additional');
  await c.dispatch({ type: 'renameBowtieView', id, name: 'Alpha later' });
  assert.equal(W(c).records.bowtieView[id].name, 'Alpha later');
  await c.dispatch({ type: 'removeBowtieView', id });
  assert.equal(W(c).records.bowtieView[id].status, 'deleted');
  assert.match(S(c).undo.text, /Deleted Alpha later/);
  await c.dispatch({ type: 'undoDelete' });
  assert.equal(W(c).records.bowtieView[id].status, 'live');
});

test('sharing reaches the chosen profile through Save; they can open and copy it but not change it', async () => {
  const { folder, c, benId } = await ready();
  await c.dispatch({ type: 'openBowtie', hazardId: 'h1', platformId: 'p1' });
  await c.dispatch({ type: 'saveBowtiePaneAs', side: '0', name: 'Fire on Alpha' });
  const id = S(c).workspace.panes[0].viewId;
  await c.dispatch({ type: 'shareBowtieView', id, profileId: benId });
  assert.deepEqual(W(c).records.bowtieView[id].sharedWith, [benId]);
  await c.dispatch({ type: 'save' });
  const ben = await open(folder, 'Ben');
  assert.deepEqual(sharedWithMe(W(ben), benId).map((v) => v.id), [id]);
  await ben.dispatch({ type: 'renameBowtieView', id, name: 'Mine now' });
  assert.equal(S(ben).message.kind, 'error');
  assert.match(S(ben).message.text, /Only its owner can change Fire on Alpha/);
  await ben.dispatch({ type: 'openBowtieView', id });
  await ben.dispatch({ type: 'saveBowtiePane', side: '0' });
  assert.deepEqual(S(ben).editing, { kind: 'bowtieName', id: '0' }, 'not the owner: Save a copy asks for a name');
  await ben.dispatch({ type: 'saveBowtiePaneAs', side: '0', name: 'Ben copy' });
  assert.deepEqual(myViews(W(ben), benId).map((v) => v.name), ['Ben copy']);
  await c.dispatch({ type: 'shareBowtieView', id });
  assert.deepEqual(W(c).records.bowtieView[id].sharedWith, [], 'unticking everyone shares with nobody');
  await ben.dispatch({ type: 'openBowtieView', id: 'not-a-view' });
  assert.equal(S(ben).message.kind, 'error');
});

test('the windows are remembered for the folder and profile, and export writes the drawn SVG', async () => {
  const storage = new MemoryStorage();
  const folder = new MemoryFolder();
  const c = await open(folder, 'Ada', storage);
  await c.dispatch({ type: 'createHazard', id: 'h1', title: 'Fire' });
  await c.dispatch({ type: 'createPlatform', id: 'p1', name: 'Alpha', ownerId: S(c).profileId });
  await c.dispatch({ type: 'linkHazards', platformId: 'p1', hazardId: ['h1'] });
  await c.dispatch({ type: 'openBowtie', hazardId: 'h1', platformId: 'p1' });
  await c.dispatch({ type: 'save' });
  const key = workspaceKey(S(c).folderName, S(c).profileId);
  assert.equal(JSON.parse(storage.getItem(key)).panes[0].platformId, 'p1');
  const again = await open(folder, 'Ada', storage);
  assert.equal(S(again).workspace.panes[0].platformId, 'p1');
  await again.dispatch({ type: 'exportBowtie', side: '0' });
  assert.equal(S(again).message.kind, 'info');
  const name = S(again).message.text.replace(/^Saved (.*)\.$/, '$1');
  assert.match(name, /\.svg$/);
  const file = await (await folder.handle.getFileHandle(name)).getFile();
  assert.match(await file.text(), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[\s\S]*data-bowtie-node="hazard"/);
  storage.setItem(key, '{broken');
  const third = await open(folder, 'Ada', storage);
  assert.deepEqual(S(third).workspace, emptyWorkspace());
});
