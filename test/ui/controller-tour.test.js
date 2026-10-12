import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController } from '../../src/ui/controller.js';
import { readProfiles } from '../../src/storage/store.js';
import { readMirror } from '../../src/storage/mirror.js';

const env = (f, storage = new MemoryStorage()) => ({ clock: fixedClock('2026-10-12T10:00:00+10:00'), storage, minSaveMs: 0,
  pickFolder: async () => f.handle, pickSaveFile: async (n) => f.handle.getFileHandle(n, { create: true }), pickOpenFile: async () => null });

/** Every file in the folder with its size and time, to see that nothing was written. @param {any} dir */
async function snapshot(dir, at = '') {
  const out = [];
  for await (const [name, h] of dir.entries()) {
    if (h.kind === 'directory') out.push(...await snapshot(h, `${at}${name}/`));
    else { const f = await h.getFile(); out.push(`${at}${name}:${f.size}:${f.lastModified}`); }
  }
  return out.sort();
}

async function ready(f = new MemoryFolder(), storage = new MemoryStorage()) {
  const c = createController(env(f, storage));
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  await c.dispatch({ type: 'selectProfile', id: c.getState().profiles[0].id });
  await c.dispatch({ type: 'createHazard', id: 'h1', title: 'Real hazard' }); // an unsaved real edit
  return { c, f, storage };
}

test('starting sets the real session aside and loads the sample, with Sam among the profiles', async () => {
  const { c } = await ready();
  const real = c.getState().session;
  await c.dispatch({ type: 'startTour' });
  const s = c.getState();
  assert.equal(s.tour.real.session, real);
  assert.ok(s.session.working.records.platform['tour-p1']);
  assert.equal(s.session.working.records.hazard.h1, undefined);
  assert.ok(s.profiles.some((p) => p.id === 'sample-sam'));
  assert.equal(s.tour.step, 0);
});

test('leaving by any route brings the real session back exactly, and lands on Getting started', async () => {
  for (const leave of ['endTour', 'tourSkip']) {
    const { c } = await ready();
    await c.dispatch({ type: 'dismissTourInvite' }); // starting would mark the invitation used, changing the profiles
    const real = c.getState().session;
    const profiles = c.getState().profiles;
    const history = [...c.getState().viewHistory, c.getState().view];
    await c.dispatch({ type: 'startTour' });
    await c.dispatch({ type: 'go', view: 'hazards' });
    await c.dispatch({ type: leave });
    const s = c.getState();
    assert.equal(s.session, real, leave);
    assert.equal(s.profiles, profiles);
    assert.deepEqual(s.viewHistory.slice(-history.length), history, 'Back returns to where you were before, never into sample pages');
    assert.equal(s.tour, null);
    assert.deepEqual([s.view.name, s.view.topic], ['help', 'getting-started']);
  }
});

test('finishing the last step ends the tutorial too', async () => {
  const { c } = await ready();
  const real = c.getState().session;
  await c.dispatch({ type: 'startTour' });
  const { TOUR_STEPS } = await import('../../src/ui/tour/steps.js');
  await c.dispatch({ type: 'tourTo', step: TOUR_STEPS.length - 1 });
  await c.dispatch({ type: 'tourNext' });
  assert.equal(c.getState().tour, null);
  assert.equal(c.getState().session, real);
});

test('nothing reaches the folder while it runs: save and the rest are refused, files are not stored', async () => {
  const { c, f } = await ready();
  await c.dispatch({ type: 'startTour' });
  const before = await snapshot(f.handle);
  for (const type of ['save', 'changeFolder', 'chooseFolder', 'recallFolder', 'confirmRestore', 'produceReport', 'addReference', 'uploadReferenceFile', 'uploadTechFile', 'uploadUpdateFile', 'addPlatformImage', 'prepareRestore', 'prepareRestoreFromFile', 'selectProfile']) {
    await c.dispatch({ type, platformId: 'tour-p1', title: 'x', id: 'tour-r1', workflowId: 'x', file: new File(['x'], 'x.pdf') });
    assert.match(c.getState().message?.text ?? '', /tutorial/, type);
  }
  assert.deepEqual(await snapshot(f.handle), before);
  assert.ok(c.getState().tour, 'still in the tutorial');
});

test('the browser’s copy of real unsaved work is not overwritten, and settings are not written to the profile', async () => {
  const { c, f, storage } = await ready();
  await c.dispatch({ type: 'dismissTourInvite' });
  const mirrorBefore = JSON.stringify(readMirror(storage, c.getState().folderName));
  const prefsBefore = JSON.stringify((await readProfiles(f.handle))[0].prefs);
  await c.dispatch({ type: 'startTour' });
  await c.dispatch({ type: 'updateHazard', id: 'tour-h1', title: 'Changed in the tutorial' });
  await c.dispatch({ type: 'setTheme', theme: 'light' });
  assert.equal(JSON.stringify(readMirror(storage, c.getState().folderName)), mirrorBefore);
  assert.equal(JSON.stringify((await readProfiles(f.handle))[0].prefs), prefsBefore);
});

test('Next and Back move through the steps and go to each step’s page', async () => {
  const { c } = await ready();
  const { TOUR_STEPS } = await import('../../src/ui/tour/steps.js');
  await c.dispatch({ type: 'startTour' });
  await c.dispatch({ type: 'tourNext' });
  assert.equal(c.getState().tour.step, 1);
  assert.equal(c.getState().view.name, TOUR_STEPS[1].view.name);
  await c.dispatch({ type: 'tourBack' });
  assert.equal(c.getState().tour.step, 0);
  await c.dispatch({ type: 'tourBack' });
  assert.equal(c.getState().tour.step, 0, 'no step before the first');
});

test('a new profile is invited once: Start or Not now clears it; profiles made before are never invited', async () => {
  const { c, f } = await ready();
  assert.equal((await readProfiles(f.handle))[0].prefs.tutorialOffered, false);
  await c.dispatch({ type: 'dismissTourInvite' });
  assert.equal((await readProfiles(f.handle))[0].prefs.tutorialOffered, true);
  const { c: c2, f: f2 } = await ready();
  await c2.dispatch({ type: 'startTour' });
  assert.equal((await readProfiles(f2.handle))[0].prefs.tutorialOffered, true, 'starting counts as offered');
});

test('an edit in the tutorial takes no backup of the sample', async () => {
  const { c, f } = await ready();
  await c.dispatch({ type: 'startTour' });
  const before = await snapshot(f.handle);
  await c.dispatch({ type: 'updateHazard', id: 'tour-h2', title: 'Edited in the tutorial' });
  assert.deepEqual(await snapshot(f.handle), before);
});

test('a try step moves on with its own action only: not with going somewhere, nor another action', async () => {
  const { c } = await ready();
  const { TOUR_STEPS } = await import('../../src/ui/tour/steps.js');
  const n = TOUR_STEPS.findIndex((s) => s.id === 'try-check');
  await c.dispatch({ type: 'startTour' });
  await c.dispatch({ type: 'tourTo', step: n });
  await c.dispatch({ type: 'go', view: 'workflow', id: 'tour-w1', hazardId: 'tour-h1' });
  await c.dispatch({ type: 'setWorkflowNotes', workflowId: 'tour-w1', notes: 'Not a tick' });
  assert.equal(c.getState().tour.step, n);
  await c.dispatch({ type: 'setStep', workflowId: 'tour-w1', hazardId: 'tour-h1', check: 'references', checked: 'true' });
  assert.equal(c.getState().tour.step, n + 1);
});

test('nothing from the tutorial is left behind: browser-kept settings, filters and windows are as before', async () => {
  const { c, storage } = await ready();
  await c.dispatch({ type: 'dismissTourInvite' });
  const kept = JSON.stringify([...storage.items].sort());
  const before = c.getState();
  await c.dispatch({ type: 'startTour' });
  await c.dispatch({ type: 'setReviewsFilter', owner: 'sample-sam', groupId: 'tour-g1' });
  await c.dispatch({ type: 'setWorkflowsFilter', owner: 'sample-sam' });
  await c.dispatch({ type: 'openBowtieView', id: 'tour-bv1' });
  await c.dispatch({ type: 'setHomeOwner', ownerId: 'sample-sam' });
  await c.dispatch({ type: 'filterTable', table: 'hazards', key: 'title', value: 'Person' });
  await c.dispatch({ type: 'endTour' });
  const after = c.getState();
  assert.equal(JSON.stringify([...storage.items].sort()), kept, 'nothing written to the browser');
  for (const k of ['workspace', 'reviewsPrefs', 'workflowsPrefs', 'homeOwner', 'tables']) assert.deepEqual(after[k], before[k], k);
});

test('a dialog or half-done edit from the tutorial does not follow you out', async () => {
  const { c } = await ready();
  await c.dispatch({ type: 'startTour' });
  await c.dispatch({ type: 'go', view: 'bowties' });
  await c.dispatch({ type: 'askConfirm', run: 'deleteHazard', id: 'tour-h4', title: 'Delete?', text: 'Sure?' });
  await c.dispatch({ type: 'endTour' });
  assert.equal(c.getState().confirm, null);
});

test('the tutorial waits for a save in progress: it cannot start until the save is done', async () => {
  const f = new MemoryFolder();
  const c = createController({ ...env(f), minSaveMs: 60 });
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  await c.dispatch({ type: 'selectProfile', id: c.getState().profiles[0].id });
  await c.dispatch({ type: 'createHazard', id: 'h1', title: 'Real hazard' });
  const saving = c.dispatch({ type: 'save' });
  await c.dispatch({ type: 'startTour' });
  assert.equal(c.getState().tour, null, 'not started mid-save');
  assert.match(c.getState().message?.text ?? '', /save/i);
  await saving;
  assert.equal(c.getState().session.base.records.hazard.h1?.title, 'Real hazard', 'the save landed on the real data');
});
