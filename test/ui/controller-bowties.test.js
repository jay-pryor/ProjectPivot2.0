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
  await c.dispatch({ type: 'startEdit', kind: 'bowtieNew', id: '' });
  await c.dispatch({ type: 'newBowtie', pair: 'h1|p2' });
  assert.deepEqual(panes(c), ['p2', null], 'a click replaces the only window');
  assert.equal(S(c).editing, null, 'the hazard and platform choice closes once a diagram opens');
  await c.dispatch({ type: 'openBowtie', hazardId: 'h1', platformId: 'p1' });
  await c.dispatch({ type: 'saveBowtiePaneAs', side: '0', name: 'Alpha' });
  const v = myViews(W(c), S(c).profileId)[0];
  await c.dispatch({ type: 'dropBowtie', side: '1', viewId: v.id });
  assert.deepEqual(panes(c), [`p1:${v.id}`, `p1:${v.id}`]);
  await c.dispatch({ type: 'setPaneStatus', side: '1', status: 'recommended', on: 'false' });
  const changed = ['planned', 'implemented'];
  await c.dispatch({ type: 'dropBowtie', side: '0', pane: '1' });
  assert.deepEqual(S(c).workspace.panes[0].filters.statuses, changed, 'dragging a window across swaps the two');
  await c.dispatch({ type: 'swapBowtiePanes' });
  assert.deepEqual(S(c).workspace.panes[1].filters.statuses, changed);
  await c.dispatch({ type: 'closeBowtiePane', side: '0' });
  assert.deepEqual(S(c).workspace.panes[0].filters.statuses, changed);
  assert.equal(S(c).workspace.panes[1], null);
  await c.dispatch({ type: 'newBowtie', pair: 'nonsense' });
  assert.equal(S(c).message.kind, 'error');
});

test('a saved view\'s hazard and platform show and hide with its arrow', async () => {
  const { c } = await ready();
  await c.dispatch({ type: 'toggleBowtieDetails', id: 'v1' });
  await c.dispatch({ type: 'toggleBowtieDetails', id: 'v2' });
  assert.deepEqual(S(c).bowtieDetails, ['v1', 'v2']);
  await c.dispatch({ type: 'toggleBowtieDetails', id: 'v1' });
  assert.deepEqual(S(c).bowtieDetails, ['v2']);
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
  await c.dispatch({ type: 'setPaneStatus', side: '0', status: 'rejected', on: 'true' });
  await c.dispatch({ type: 'saveBowtiePane', side: '0' });
  assert.deepEqual(W(c).records.bowtieView[id].filters.statuses, ['recommended', 'planned', 'implemented', 'rejected']);
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

test('a page\'s rail opens one section at a time, the open one closing when clicked again; causal factors are added for a platform', async () => {
  const { c } = await ready();
  await c.dispatch({ type: 'showSection', page: 'ssra', section: 'sfarp' });
  assert.equal(S(c).sections.ssra, 'sfarp');
  await c.dispatch({ type: 'showSection', page: 'ssra', section: 'sfarp' });
  assert.equal(S(c).sections.ssra, null);
  await c.dispatch({ type: 'showSection', page: 'ssra', section: 'initial' });
  assert.equal(S(c).sections.ssra, 'initial');
  await c.dispatch({ type: 'showSection', page: 'hazard', section: 'controls' });
  assert.equal(S(c).sections.hazard, null, 'the section open by default closes too');
  await c.dispatch({ type: 'addCausalFactor', hazardId: 'h1', text: 'Fuel leak', platformId: 'p2' });
  const cf = Object.values(W(c).records.causalFactor)[0];
  assert.equal(cf.platformId, 'p2');
});

test('Back steps through the pages opened, tabs included, and never past the first', async () => {
  const { c } = await ready();
  await c.dispatch({ type: 'go', view: 'hazards' });
  await c.dispatch({ type: 'go', view: 'hazard', id: 'h1' });
  await c.dispatch({ type: 'go', view: 'hazard', id: 'h1', tab: 'p:p1' });
  await c.dispatch({ type: 'go', view: 'platform', id: 'p1' });
  await c.dispatch({ type: 'goBack' });
  assert.deepEqual([S(c).view.name, S(c).view.tab], ['hazard', 'p:p1']);
  await c.dispatch({ type: 'goBack' });
  assert.deepEqual([S(c).view.name, S(c).view.tab], ['hazard', undefined]);
  await c.dispatch({ type: 'goBack' });
  assert.equal(S(c).view.name, 'hazards');
  const depth = S(c).viewHistory.length;
  await c.dispatch({ type: 'go', view: 'hazards' });
  assert.equal(S(c).viewHistory.length, depth, 'opening the page already open is not a step');
  while (S(c).viewHistory.length) await c.dispatch({ type: 'goBack' });
  const at = S(c).view;
  await c.dispatch({ type: 'goBack' });
  assert.equal(S(c).view, at, 'nothing left to go back to');
});

test('unlinking a control asks first in a pop-up: Cancel keeps it, Continue unlinks', async () => {
  const { c } = await ready();
  const ask = { type: 'askConfirm', action: 'askConfirm', run: 'unlinkControl', hazardId: 'h1', controlId: 'c1', title: 'Unlink Sprinklers?', text: 'It goes.' };
  await c.dispatch(ask);
  assert.deepEqual(S(c).confirm, { title: 'Unlink Sprinklers?', text: 'It goes.', action: { type: 'unlinkControl', hazardId: 'h1', controlId: 'c1' } });
  await c.dispatch({ type: 'confirmCancel' });
  assert.equal(S(c).confirm, null);
  assert.equal(W(c).records.hazardControl['hc:h1:c1'].status, 'live');
  await c.dispatch(ask);
  await c.dispatch({ type: 'confirmContinue' });
  assert.equal(S(c).confirm, null);
  assert.equal(W(c).records.hazardControl['hc:h1:c1'].status, 'deleted');
});

test('a bow-tie window keeps where it was zoomed and moved to, within limits, fitted leaving nothing behind', async () => {
  const { c } = await ready();
  await c.dispatch({ type: 'openBowtie', hazardId: 'h1', platformId: 'p1' });
  await c.dispatch({ type: 'viewBowtie', side: '0', zoom: 1.7321, x: -120.4, y: 33.6 });
  assert.deepEqual(S(c).workspace.panes[0].zoom, 1.732);
  assert.deepEqual(S(c).workspace.panes[0].pan, { x: -120, y: 34 });
  await c.dispatch({ type: 'setPaneStatus', side: '0', status: 'planned', on: 'false' });
  assert.equal(S(c).workspace.panes[0].zoom, 1.732, 'changing its filters keeps the view');
  await c.dispatch({ type: 'viewBowtie', side: '0', zoom: 99, x: 0, y: 0 });
  assert.equal(S(c).workspace.panes[0].zoom, 6, 'never past the largest zoom');
  assert.equal(S(c).workspace.panes[0].pan, undefined);
  await c.dispatch({ type: 'viewBowtie', side: '0', zoom: 1, x: 0, y: 0 });
  assert.ok(!('zoom' in S(c).workspace.panes[0]) && !('pan' in S(c).workspace.panes[0]), 'fitted');
});

test('a control links to hazards from its own side; from a platform tab, controls are added there alone, a new one with them', async () => {
  const { c } = await ready();
  await c.dispatch({ type: 'createHazard', id: 'h2', title: 'Flood' });
  await c.dispatch({ type: 'linkControlToHazards', controlId: 'c1', hazardId: ['h2'], 'kind:h2': 'mitigating' });
  assert.equal(W(c).records.hazardControl['hc:h2:c1'].kind, 'mitigating');
  await c.dispatch({ type: 'createControl', id: 'e1', title: 'Fire wall' });
  await c.dispatch({ type: 'openPicker', picker: 'addControlsHere', hazardId: 'h1', platformId: 'p1' });
  await c.dispatch({ type: 'addControlsHere', hazardId: 'h1', platformId: 'p1', controlId: ['e1'], 'kind:e1': 'mitigating', newTitle: 'Fire watch', newKind: 'preventative' });
  assert.equal(W(c).records.hazardControl['hc:h1:e1'].kind, 'mitigating');
  assert.equal(W(c).records.controlOn['on:h1:e1:p2'].off, true, 'on Alpha alone');
  const made = Object.values(W(c).records.control).find((x) => x.title === 'Fire watch');
  assert.ok(made && W(c).records.hazardControl[`hc:h1:${made.id}`]?.status === 'live', 'the new one is made and added with them');
  assert.equal(W(c).records.controlOn[`on:h1:${made.id}:p2`].off, true);
  assert.equal(S(c).picker, null);
});

test('Show tags: a window\'s control boxes drawn with their badges, or without, remembered for that window', async () => {
  const { bowtieSvg } = await import('../../src/ui/bowtie-svg.js');
  const { bowtieOf, DEFAULT_FILTERS } = await import('../../src/core/bowtie.js');
  const { c } = await ready();
  await c.dispatch({ type: 'openBowtie', hazardId: 'h1', platformId: 'p1' });
  assert.equal(S(c).workspace.panes[0].showTags, undefined, 'off to begin with');
  await c.dispatch({ type: 'toggleBowtieTags', side: '0' });
  assert.equal(S(c).workspace.panes[0].showTags, true);
  const b = bowtieOf(W(c), 'h1', 'p1', DEFAULT_FILTERS);
  assert.match(bowtieSvg(b), /data-bowtie-tag=/);
  assert.doesNotMatch(bowtieSvg(b, { tags: false }), /data-bowtie-tag=/, 'no badges');
  await c.dispatch({ type: 'toggleBowtieTags', side: '0' });
  assert.ok(!('showTags' in S(c).workspace.panes[0]), 'off again');
});

test('Show gaps: a window marks causal factors and consequences no control stands against, or not, remembered for that window', async () => {
  const { bowtieSvg } = await import('../../src/ui/bowtie-svg.js');
  const { bowtieOf, DEFAULT_FILTERS } = await import('../../src/core/bowtie.js');
  const { bowtiesView } = await import('../../src/ui/screens/bowties.js');
  const { c } = await ready();
  await c.dispatch({ type: 'addCausalFactor', hazardId: 'h1', platformId: 'p1', text: 'Lightning' });
  await c.dispatch({ type: 'openBowtie', hazardId: 'h1', platformId: 'p1' });
  const screen = () => bowtiesView(S(c), W(c)).toString();
  assert.match(screen(), /role="switch" aria-checked="false"[^>]*data-action="toggleBowtieGaps" data-side="0">[\s\S]*?Show gaps<\/button>/, 'off to begin with, beside Show tags');
  assert.doesNotMatch(screen(), /data-bowtie-unguarded|no control stands against it/);
  await c.dispatch({ type: 'toggleBowtieGaps', side: '0' });
  assert.equal(S(c).workspace.panes[0].showGaps, true);
  assert.equal(S(c).workspace.panes[0].showTags, undefined, 'tags left as they were');
  assert.match(screen(), /data-bowtie-unguarded/);
  assert.match(screen(), /aria-checked="true"[^>]*data-action="toggleBowtieGaps"/);
  const b = bowtieOf(W(c), 'h1', 'p1', DEFAULT_FILTERS);
  assert.doesNotMatch(bowtieSvg(b, { gaps: false }), /data-bowtie-unguarded/);
  await c.dispatch({ type: 'toggleBowtieGaps', side: '0' });
  assert.ok(!('showGaps' in S(c).workspace.panes[0]), 'off again');
});

test('Fit never enlarges a drawing past its own size: the window holds it no bigger than its viewBox', async () => {
  const { bowtiesView } = await import('../../src/ui/screens/bowties.js');
  const { c } = await ready();
  await c.dispatch({ type: 'openBowtie', hazardId: 'h1', platformId: 'p1' });
  const out = bowtiesView(S(c), W(c)).toString();
  const [, w, h] = /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 (\d+) (\d+)"/.exec(out) ?? [];
  assert.match(out, new RegExp(`<div class="bt-canvas"[^>]*style="max-width: ${w}px; max-height: ${h}px; transform: translate\\(0px, 0px\\) scale\\(1\\)">`));
});

test('Traditional or focus: a window opens in traditional, can switch, and draws what it shows', async () => {
  const { bowtiesView } = await import('../../src/ui/screens/bowties.js');
  const { c } = await ready();
  await c.dispatch({ type: 'openBowtie', hazardId: 'h1', platformId: 'p1' });
  const screen = () => bowtiesView(S(c), W(c)).toString();
  assert.equal(S(c).workspace.panes[0].layout, undefined, 'traditional to begin with');
  assert.match(screen(), /aria-pressed="true"[^>]*data-layout="traditional">Traditional</);
  assert.match(screen(), /data-bowtie-layout="traditional"/);
  await c.dispatch({ type: 'setBowtieLayout', side: '0', layout: 'focus' });
  assert.equal(S(c).workspace.panes[0].layout, 'focus');
  assert.match(screen(), /aria-pressed="true"[^>]*data-layout="focus">Focus</);
  assert.match(screen(), /data-bowtie-layout="focus"/);
  await c.dispatch({ type: 'setBowtieLayout', side: '0', layout: 'traditional' });
  assert.ok(!('layout' in S(c).workspace.panes[0]), 'back to traditional');
});

test('Show numbers: on to begin with, off and on again for that window', async () => {
  const { bowtiesView } = await import('../../src/ui/screens/bowties.js');
  const { c } = await ready();
  await c.dispatch({ type: 'addCausalFactor', hazardId: 'h1', platformId: 'p1', text: 'Lightning' });
  await c.dispatch({ type: 'openBowtie', hazardId: 'h1', platformId: 'p1' });
  const screen = () => bowtiesView(S(c), W(c)).toString();
  assert.match(screen(), /aria-checked="true"[^>]*data-action="toggleBowtieNumbers"/);
  assert.match(screen(), /data-bowtie-num=/);
  await c.dispatch({ type: 'toggleBowtieNumbers', side: '0' });
  assert.equal(S(c).workspace.panes[0].hideNumbers, true);
  assert.doesNotMatch(screen(), /data-bowtie-num=/);
  await c.dispatch({ type: 'toggleBowtieNumbers', side: '0' });
  assert.ok(!('hideNumbers' in S(c).workspace.panes[0]));
});

test('View setup: tiers filter the controls, and Reset view takes every filter off', async () => {
  const { c } = await ready();
  await c.dispatch({ type: 'openBowtie', hazardId: 'h1', platformId: 'p1' });
  await c.dispatch({ type: 'setPaneTier', side: '0', tier: 'PPE', on: 'false' });
  await c.dispatch({ type: 'setPaneTier', side: '0', tier: 'none', on: 'false' });
  assert.deepEqual(S(c).workspace.panes[0].filters.tiers, ['Elimination', 'Substitution', 'Isolation', 'Engineering', 'Administrative']);
  await c.dispatch({ type: 'setPaneTier', side: '0', tier: 'none', on: 'true' });
  assert.ok(S(c).workspace.panes[0].filters.tiers.includes('none'));
  await c.dispatch({ type: 'viewBowtie', side: '0', zoom: 2.5, x: 40, y: -30 });
  assert.equal(S(c).workspace.panes[0].zoom, 2.5);
  await c.dispatch({ type: 'resetBowtieView', side: '0' });
  assert.ok(!('zoom' in S(c).workspace.panes[0]) && !('pan' in S(c).workspace.panes[0]), 'fitted again');
  assert.deepEqual(S(c).workspace.panes[0].filters, {
    statuses: ['recommended', 'planned', 'implemented', 'rejected'],
    tiers: ['Elimination', 'Substitution', 'Isolation', 'Engineering', 'Administrative', 'PPE', 'none'],
  }, 'rejected shown too, and every tier');
});

test('Go to hazard platform page: from a window to its hazard on its platform, open at Controls, and Back again', async () => {
  const { bowtiesView } = await import('../../src/ui/screens/bowties.js');
  const { c } = await ready();
  await c.dispatch({ type: 'go', view: 'bowties' });
  await c.dispatch({ type: 'openBowtie', hazardId: 'h1', platformId: 'p1' });
  assert.match(bowtiesView(S(c), W(c)).toString(), /data-action="openBowtieHazard" data-side="0">Go to hazard platform page</);
  await c.dispatch({ type: 'openBowtieHazard', side: '0' });
  assert.equal(S(c).view.name, 'hazard');
  assert.equal(S(c).view.id, 'h1');
  assert.equal(S(c).view.tab, 'p:p1');
  assert.equal(S(c).sections.ssra, 'controls');
  await c.dispatch({ type: 'goBack' });
  assert.equal(S(c).view.name, 'bowties');
});
