/**
 * views conformance: operations of the folder, profile, hazards, recover, and restore screens
 * (CORE-CON-002). The happy path of every operation of SL-01 and SL-02 the suite can exercise,
 * from section 2 and C-001, C-003 to C-007, and C-010 to C-014 of modules/views/CONTRACT.md,
 * each screen compared with what the owning module gives. Written from the contract before any
 * implementation (P8). `chooseFolder` and `chooseSaveState` are verified by demonstration
 * (SL-01 criterion 1, SL-02 criterion 4).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as views from '../contract.js';
import * as store from '../../store/contract.js';
import * as registry from '../../registry/contract.js';
import * as schema from '../../../baseline/schema.js';
import { fixClock } from '../../../baseline/clock.js';
import { timestampAest, userProfileId } from '../../../baseline/types.js';
import { arm, disarm_all } from '../../../baseline/faults.js';
import {
  MemoryFolder, anotherCopySaves, backupFiles, bodyWithHazards, dataFileText, everywhere, expectScreen, heldBody, inBrowser,
  itemsName, listedId, listedProfiles, loaded, mirrorText, noMessages, oneMessage, openApp, openStore, plain, plantBackup,
  plantData, plantProfiles, reviewsOf, selectedApp, step, storedHazards, supersededFiles, tamperedText,
} from './harness.js';

/**
 * The change names of section 3 for what `store.unsavedChanges` gives of the body the app holds,
 * on a store of the suite's own that loaded the same folder.
 * @param {MemoryFolder} folder
 * @param {any} body
 * @returns {Promise<string[]>}
 */
async function changeNames(folder, body) {
  const s = await openStore(folder);
  await store.load(s);
  const refs = await store.unsavedChanges(s, body);
  const live = await registry.listHazards(body);
  return refs.map((ref) => {
    const hazard = live.find((h) => h.id === ref.id);
    return hazard ? `${ref.id} ${hazard.title}` : ref.id;
  });
}

// ------------------------------------------------------------------ SL-01: C-001, C-003 to C-007

test('start resolves with an app at the folder screen, both top bar fields null and no messages, having read and written nothing; two starts are independent (C-001)', () => inBrowser(async (env) => {
  const a = await views.start();
  const b = await views.start();
  for (const app of [a, b]) {
    assert.deepEqual(plain(app.screen), { kind: 'folder', topBar: { folderName: null, profileName: null }, messages: [] });
  }
  assert.deepEqual(env.local.writes, [], 'start wrote nothing to the browser\'s storage');

  await views.openFolder(a, new MemoryFolder('Only A').handle);
  assert.equal(a.screen.kind, 'profile');
  assert.deepEqual(plain(b.screen), { kind: 'folder', topBar: { folderName: null, profileName: null }, messages: [] }, 'the second app is still at the folder screen');
}));

test('openFolder shows the profile screen: the handle\'s name, no one selected, the profiles listProfiles gives, no messages, and nothing written anywhere (C-003)', () => inBrowser(async (env) => {
  const folder = new MemoryFolder('Shared Hazards');
  await plantProfiles(folder, ['Zoe', 'alice', 'Bob']);
  const before = everywhere(folder, env);

  const app = await views.start();
  const screen = expectScreen(app, await views.openFolder(app, folder.handle), 'profile');
  assert.deepEqual(screen.topBar, { folderName: 'Shared Hazards', profileName: null });
  assert.deepEqual(screen.profiles, await listedProfiles(folder), 'profiles is what profiles.listProfiles gives, in its order');
  assert.equal(screen.profiles.length, 3);
  noMessages(screen);
  assert.deepEqual(everywhere(folder, env), before, 'opening wrote nothing');
}));

test('createProfile lists the new profile with its name trimmed alongside every profile listed before, and selects no one (C-004)', () => inBrowser(async () => {
  const folder = new MemoryFolder();
  await plantProfiles(folder, ['Bob']);
  const app = await openApp(folder);
  const listedBefore = plain(/** @type {any} */ (app.screen).profiles);

  const screen = expectScreen(app, await views.createProfile(app, '  Alice Smith  '), 'profile');
  assert.equal(screen.topBar.profileName, null, 'creating is not selecting');
  noMessages(screen);
  assert.deepEqual(screen.profiles, await listedProfiles(folder), 'the list is what profiles.listProfiles gives now');
  assert.equal(screen.profiles.length, listedBefore.length + 1);
  for (const p of listedBefore) assert.ok(screen.profiles.some((/** @type {any} */ q) => q.id === p.id && q.name === p.name), `${p.name} is still listed`);
  assert.ok(screen.profiles.some((/** @type {any} */ p) => p.name === 'Alice Smith'), 'the new profile is listed under its trimmed name');
}));

test('selectProfile shows the hazards screen: the name in the top bar, the live hazards registry lists of the loaded body, nothing unsaved, lastSave as loaded, the body\'s review standing, and nothing written (C-004, C-005, C-031)', () => inBrowser(async (env) => {
  const folder = new MemoryFolder('Data');
  const [alice] = await plantProfiles(folder, ['Alice']);
  await anotherCopySaves(folder, { id: alice.id, name: alice.name }, ['Loss of control', 'Runway incursion']);
  const app = await openApp(folder);
  const before = everywhere(folder, env);

  const screen = expectScreen(app, await views.selectProfile(app, listedId(app.screen, 'Alice')), 'hazards');
  assert.deepEqual(screen.topBar, { folderName: 'Data', profileName: 'Alice' });
  assert.deepEqual(screen.hazards, await storedHazards(folder), 'hazards is registry.listHazards of what store.load gives');
  assert.deepEqual(screen.hazards.map((/** @type {any} */ h) => h.title), ['Loss of control', 'Runway incursion']);
  assert.equal(screen.unsaved, false);
  assert.deepEqual(screen.lastSave, (await loaded(folder)).lastSave, 'lastSave is what store.load gave');
  assert.notEqual(screen.lastSave, null);
  assert.deepEqual(screen.reviews, await reviewsOf((await loaded(folder)).body), 'reviews is the two review-schedule lists of the loaded body');
  noMessages(screen);
  assert.deepEqual(everywhere(folder, env), before, 'selecting wrote nothing');
}));

test('addHazard shows the hazard at once under the next id with its title trimmed, marks the screen unsaved, tells store of the body registry returned, and does not write data.json (C-006, C-012)', () => inBrowser(async (env) => {
  const folder = new MemoryFolder();
  const app = await selectedApp(folder, 'Alice');
  const dataBefore = folder.read(schema.DATA_FOLDER.data);

  const first = await step(app, views.addHazard(app, { title: '  Bird strike ' }), 'hazards');
  assert.equal(first.hazards.length, 1);
  assert.equal(first.hazards[0].id, 'H-0001', 'the first id of a folder never saved to');
  assert.equal(first.hazards[0].title, 'Bird strike');
  assert.equal(first.unsaved, true);
  assert.equal(first.topBar.profileName, 'Alice');
  assert.deepEqual(plain(await registry.listHazards(await heldBody(env, folder))), first.hazards, 'the body told to store lists what the screen shows');
  assert.equal(env.local.mirror()?.unsaved, true, 'the working state is mirrored as unsaved (C-012, store C-015)');

  const second = await step(app, views.addHazard(app, { title: 'Icing' }), 'hazards');
  assert.deepEqual(second.hazards.slice(0, 1), first.hazards, 'the list before is kept');
  assert.deepEqual(second.hazards.map((/** @type {any} */ h) => [h.id, h.title]), [['H-0001', 'Bird strike'], ['H-0002', 'Icing']], 'both, in id order');
  assert.equal(second.unsaved, true);
  assert.equal(folder.read(schema.DATA_FOLDER.data), dataBefore, 'an add is not a save: data.json not written');
}));

test('one save carries every hazard added, and the folder opened again in another app shows hazards deep-equal to the saved screen (C-006, C-007)', () => inBrowser(async () => {
  const folder = new MemoryFolder();
  const app = await selectedApp(folder, 'Alice');
  await views.addHazard(app, { title: 'Fuel starvation' });
  await views.addHazard(app, { title: 'Ground collision' });
  const added = plain(/** @type {any} */ (app.screen).hazards);

  const saved = await step(app, views.save(app), 'hazards');
  assert.equal(saved.unsaved, false);
  assert.deepEqual(saved.hazards, added, 'hazards unchanged by the save');
  assert.deepEqual(saved.lastSave, (await loaded(folder)).lastSave, 'lastSave is the stamp the save wrote');
  assert.deepEqual(supersededFiles(folder), [], 'nothing under Superseded Saves');

  const other = await selectedApp(folder, 'Alice');
  assert.deepEqual(plain(/** @type {any} */ (other.screen).hazards), saved.hazards, 'the same ids and the same titles after reopening');
  assert.deepEqual(plain(/** @type {any} */ (other.screen).lastSave), saved.lastSave);
}));

test('when another copy saved between this load and this save, the save warns once naming that user and the kept file; the folder holds this data and the other under Superseded Saves (C-007)', () => inBrowser(async () => {
  const folder = new MemoryFolder();
  await plantProfiles(folder, ['Alice', 'Bob']);
  const b = await selectedApp(folder, 'Bob'); // B loads
  const a = await selectedApp(folder, 'Alice');
  await views.addHazard(a, { title: 'A\'s hazard' });
  await views.save(a); // A saves
  const aHazards = await storedHazards(folder);

  await views.addHazard(b, { title: 'B\'s hazard' });
  const bHazards = plain(/** @type {any} */ (b.screen).hazards);
  const screen = expectScreen(b, await views.save(b), 'hazards'); // B saves

  const warning = oneMessage(screen, 'warning');
  const kept = supersededFiles(folder);
  assert.equal(kept.length, 1, 'the other user\'s data was kept once');
  itemsName(warning, 'Alice', 'the other user');
  itemsName(warning, kept[0], 'the kept file');
  assert.equal(screen.unsaved, false);
  assert.deepEqual(screen.hazards, bHazards, 'hazards unchanged');
  assert.deepEqual(screen.lastSave, (await loaded(folder)).lastSave, 'lastSave is the stamp B wrote');
  assert.deepEqual(await storedHazards(folder), bHazards, 'data.json holds B\'s data');
  assert.notDeepEqual(aHazards, bHazards);
  assert.equal(screen.topBar.profileName, 'Bob');

  const again = expectScreen(b, await views.save(b), 'hazards');
  noMessages(again, 'a second save with no one else in between says nothing');
  assert.deepEqual(supersededFiles(folder), kept, 'and keeps nothing more');
}));

test('after selection the active profile\'s name is in the top bar of every screen, resolved or carrying a message; before it, null on every screen (C-005)', () => inBrowser(async () => {
  const folder = new MemoryFolder();
  await plantProfiles(folder, ['Carol']);
  const app = await views.start();
  /** @type {any[]} */
  const before = [app.screen];
  before.push(await views.openFolder(app, folder.handle));
  before.push(await views.createProfile(app, ''));
  before.push(await views.createProfile(app, 'Dave'));
  for (const s of before) assert.equal(s.topBar.profileName, null, `null on the ${s.kind} screen before selection`);

  /** @type {any[]} */
  const after = [await views.selectProfile(app, listedId(app.screen, 'Carol'))];
  after.push(await views.addHazard(app, { title: '   ' }));
  after.push(await views.addHazard(app, { title: 'Smoke in cabin' }));
  after.push(await views.save(app));
  after.push(await views.openControls(app));
  after.push(await views.createControl(app, { title: '' }));
  after.push(await views.back(app));
  after.push(await views.openHistory(app));
  after.push(await views.back(app));
  after.push(await views.beginRestore(app));
  after.push(await views.cancelRestore(app));
  for (const s of after) assert.equal(s.topBar.profileName, 'Carol', `Carol on every screen after selection (${s.kind}, ${s.messages.length} message(s))`);
  assert.equal(/** @type {any} */ (app.screen).topBar.profileName, 'Carol');
}));

// ------------------------------------------------------------------ SL-02: C-010 opening checks every file

test('a folder whose kept backup and superseded save fail their check opens at the check screen, one error per failure in checkFolder\'s order naming the file and the data affected, nothing from the folder on it; acknowledgeCheck shows the profile screen C-003 gives (C-010)', () => inBrowser(async (env) => {
  const folder = new MemoryFolder('Checked');
  const [alice] = await plantProfiles(folder, ['Alice']);
  await anotherCopySaves(folder, { id: alice.id, name: alice.name }, ['Secret title']);
  const takenAt = timestampAest('2026-09-01T08:30:00+10:00');
  const backup = await plantBackup(folder, takenAt, bodyWithHazards(alice, ['Old']), alice);
  folder.write(backup, tamperedText(/** @type {string} */ (folder.read(backup))));
  const kept = `${schema.DATA_FOLDER.supersededSaves}/${schema.supersededFileName(schema.freshStamp(alice.id))}`;
  folder.write(kept, tamperedText(await dataFileText(bodyWithHazards(alice, ['Kept']), schema.freshStamp(alice.id))));

  const failures = await store.checkFolder(await openStore(folder));
  assert.equal(failures.length, 2, 'store names both files');
  const before = everywhere(folder, env);

  const app = await views.start();
  const check = expectScreen(app, await views.openFolder(app, folder.handle), 'check');
  assert.deepEqual(check.topBar, { folderName: 'Checked', profileName: null });
  assert.equal(check.messages.length, failures.length, 'one message per failure');
  failures.forEach((failure, i) => {
    const m = check.messages[i];
    assert.equal(m.severity, 'error');
    assert.equal(m.items.length, 2, 'exactly two items: the file, then the data it affects');
    assert.ok(m.items[0].includes(failure.file), `item one names ${failure.file}`);
    const affected = failure.affects.kind === 'backup' ? `backup taken ${failure.affects.takenAtAest}` : 'superseded save';
    assert.ok(m.items[1].includes(affected), `item two names ${affected} (got ${m.items[1]})`);
  });
  assert.equal(JSON.stringify(check).includes('Secret title'), false, 'nothing from the folder is on the check screen');

  const profile = await step(app, views.acknowledgeCheck(app), 'profile');
  assert.deepEqual(profile.topBar, { folderName: 'Checked', profileName: null });
  assert.deepEqual(profile.profiles, await listedProfiles(folder));
  const hazards = await step(app, views.selectProfile(app, alice.id), 'hazards');
  assert.deepEqual(hazards.hazards, await storedHazards(folder), 'the stored data is shown after selection');
  assert.deepEqual(everywhere(folder, env), before, 'the check, the acknowledgement, and the selection wrote nothing');

  const again = await views.start();
  expectScreen(again, await views.openFolder(again, folder.handle), 'check');
  assert.deepEqual(/** @type {any} */ (again.screen).messages.map((/** @type {any} */ m) => [m.severity, m.items]), check.messages.map((/** @type {any} */ m) => [m.severity, m.items]), 'the check is made on every open; an acknowledgement is recorded nowhere');
}));

test('a folder with no failure opens straight at the profile screen: no check screen when checkFolder lists nothing (C-010)', () => inBrowser(async () => {
  const folder = new MemoryFolder();
  const [alice] = await plantProfiles(folder, ['Alice']);
  await plantBackup(folder, timestampAest('2026-09-01T08:30:00+10:00'), bodyWithHazards(alice, ['Old']), alice);
  const app = await views.start();
  await step(app, views.openFolder(app, folder.handle), 'profile');
}));

// ------------------------------------------------------------------ SL-02: C-011 a save that did not happen

test('a save that did not happen, by a refused write or a fault point stopping it partway, names each unsaved change as id then title, keeps the working body, and leaves data.json readable and unchanged; the next save carries the same changes (C-011)', () => inBrowser(async (env) => {
  /** @type {[string, (f: MemoryFolder) => void][]} */
  const stops = [
    ['a refused write of data.json', (f) => f.failWrite((rel) => rel === schema.DATA_FOLDER.data)],
    ['store.save.data-staged', () => arm('store.save.data-staged')],
  ];
  for (const [label, stop] of stops) {
    const folder = new MemoryFolder();
    const [alice] = await plantProfiles(folder, ['Alice']);
    await anotherCopySaves(folder, { id: alice.id, name: alice.name }, ['Stored']);
    const app = await selectedApp(folder, 'Alice');
    await views.addHazard(app, { title: 'First unsaved' });
    await views.addHazard(app, { title: 'Second unsaved' });
    const shown = plain(app.screen);
    const stored = await loaded(folder);
    const body = await heldBody(env, folder);
    const names = await changeNames(folder, body);
    assert.ok(names.includes('H-0002 First unsaved') && names.includes('H-0003 Second unsaved'), `${label}: the change names are id then title`);

    stop(folder);
    const screen = expectScreen(app, await views.save(app), 'hazards');
    folder.failWrite(() => false);
    disarm_all();

    assert.deepEqual(oneMessage(screen, 'error').items, names, `${label}: one item per unsaved change, in unsavedChanges' order`);
    assert.deepEqual({ ...plain(screen), messages: [] }, { ...shown, messages: [] }, `${label}: nothing on the screen but messages changed`);
    assert.deepEqual(await loaded(folder), stored, `${label}: data.json is readable and unchanged (store C-010)`);

    const retried = expectScreen(app, await views.save(app), 'hazards');
    assert.equal(retried.unsaved, false, `${label}: the next save happens`);
    const titles = (await storedHazards(folder)).map((h) => h.title);
    assert.ok(titles.includes('First unsaved') && titles.includes('Second unsaved'), `${label}: the working body was kept, so the retry carries the same changes`);
  }
}));

// ------------------------------------------------------------------ SL-02: C-012 every change told to store

test('with the clock fixed, the first change writes a backup and mirrors the body; a change within the hour writes no backup; a change more than an hour later writes one; navigation writes nothing; no message is added (C-012; SL-02 criteria 3 and 5)', () => inBrowser(async (env) => {
  const folder = new MemoryFolder();
  fixClock(timestampAest('2026-09-14T09:00:00+10:00'));
  const app = await selectedApp(folder, 'Alice');
  assert.deepEqual(backupFiles(folder), [], 'opening and selecting write no backup');

  await step(app, views.addHazard(app, { title: 'One' }), 'hazards');
  assert.deepEqual(backupFiles(folder), [`${schema.DATA_FOLDER.backups}/${schema.backupFileName(timestampAest('2026-09-14T09:00:00+10:00'))}`], 'the first change backs up at once');
  assert.deepEqual(plain(await registry.listHazards(/** @type {any} */ (env.local.mirror()).body)), plain(/** @type {any} */ (app.screen).hazards), 'the mirror holds the body the change returned');

  fixClock(timestampAest('2026-09-14T09:40:00+10:00'));
  await step(app, views.addHazard(app, { title: 'Two' }), 'hazards');
  assert.equal(backupFiles(folder).length, 1, 'a change within the hour writes no backup');
  assert.deepEqual((await registry.listHazards(/** @type {any} */ (env.local.mirror()).body)).map((h) => h.title), ['One', 'Two'], 'the mirror follows every change');

  fixClock(timestampAest('2026-09-14T11:00:01+10:00'));
  const before = everywhere(folder, env);
  await step(app, views.openControls(app), 'controls');
  await step(app, views.back(app), 'hazards');
  await step(app, views.openHistory(app), 'history');
  await step(app, views.back(app), 'hazards');
  assert.deepEqual(everywhere(folder, env), before, 'navigation tells store nothing and writes nothing');

  await step(app, views.openControls(app), 'controls');
  await step(app, views.createControl(app, { title: 'Checklist' }), 'controls');
  assert.equal(backupFiles(folder).length, 2, 'a change on any screen more than an hour later backs up');

  await step(app, views.back(app), 'hazards');
  await step(app, views.save(app), 'hazards');
  assert.equal(backupFiles(folder).length, 2, 'a save writes no backup');
  assert.equal(/** @type {any} */ (env.local.mirror()).unsaved, false, 'the mirror is marked saved');
}));

test('a change whose mirror or backup cannot be written is still made, with one warning per error, mirror before backup, each naming the error\'s file (C-012, section 4)', () => inBrowser(async (env) => {
  const now = timestampAest('2026-09-14T09:00:00+10:00');
  fixClock(now);
  const folder = new MemoryFolder();
  const app = await selectedApp(folder, 'Alice');
  const backupName = schema.backupFileName(now);

  env.local.refuseWrites();
  const mirrorOnly = expectScreen(app, await views.addHazard(app, { title: 'Mirror refused' }), 'hazards');
  assert.deepEqual(mirrorOnly.hazards.map((/** @type {any} */ h) => h.title), ['Mirror refused'], 'the change is made');
  assert.equal(mirrorOnly.unsaved, true);
  itemsName(oneMessage(mirrorOnly, 'warning'), schema.BROWSER_STORAGE_KEY, 'the key');

  env.local.setError = null;
  fixClock(timestampAest('2026-09-14T09:00:00+10:00'));
  const fresh = new MemoryFolder();
  const other = await selectedApp(fresh, 'Bob');
  env.local.refuseWrites();
  fresh.failWrite((rel) => rel.startsWith(`${schema.DATA_FOLDER.backups}/`));
  const both = expectScreen(other, await views.addHazard(other, { title: 'Nothing kept' }), 'hazards');
  assert.deepEqual(both.hazards.map((/** @type {any} */ h) => h.title), ['Nothing kept'], 'the change is made');
  assert.equal(both.messages.length, 2, 'one message per error');
  assert.ok(both.messages.every((/** @type {any} */ m) => m.severity === 'warning'));
  itemsName(both.messages[0], schema.BROWSER_STORAGE_KEY, 'the key, first');
  itemsName(both.messages[1], backupName, 'the backup file, second');

  env.local.setError = null;
  fresh.failWrite(() => false);
  const next = expectScreen(other, await views.addHazard(other, { title: 'Kept again' }), 'hazards');
  noMessages(next, 'the warnings did not outlive the operation after them');
}));

// ------------------------------------------------------------------ SL-02: C-013 recovery

test('selecting a profile while the browser holds unsaved working state shows the recover screen: the state\'s time, the stamp it was based on, its hazards and review standing, and nothing written (C-013, C-031)', () => inBrowser(async (env) => {
  const folder = new MemoryFolder();
  const [alice] = await plantProfiles(folder, ['Alice']);
  await anotherCopySaves(folder, { id: alice.id, name: alice.name }, ['Saved']);
  const first = await selectedApp(folder, 'Alice');
  await views.addHazard(first, { title: 'Only in the browser' });

  const state = await store.readRecoverable(await openStore(folder));
  assert.ok(state, 'store offers the state');
  const app = await openApp(folder);
  const before = everywhere(folder, env);
  const screen = await step(app, views.selectProfile(app, alice.id), 'recover');
  assert.equal(screen.topBar.profileName, 'Alice');
  assert.equal(screen.mirroredAtAest, state.mirroredAtAest);
  assert.deepEqual(screen.basedOn, plain(state.loadedStamp));
  assert.deepEqual(screen.hazards, plain(await registry.listHazards(state.body)), 'the hazards of the state, not of the folder');
  assert.deepEqual(screen.hazards.map((/** @type {any} */ h) => h.title), ['Saved', 'Only in the browser']);
  assert.deepEqual(screen.reviews, await reviewsOf(state.body), 'the state\'s review standing');
  assert.deepEqual(everywhere(folder, env), before, 'nothing written anywhere');
}));

test('acceptRecovery shows the hazards of the recovered state, unsaved, with lastSave as loaded, and writes nothing to the folder until the user saves (C-013)', () => inBrowser(async (env) => {
  const folder = new MemoryFolder();
  const [alice] = await plantProfiles(folder, ['Alice']);
  await anotherCopySaves(folder, { id: alice.id, name: alice.name }, ['Saved']);
  const first = await selectedApp(folder, 'Alice');
  await views.addHazard(first, { title: 'Recovered' });
  const state = /** @type {any} */ (await store.readRecoverable(await openStore(folder)));

  const app = await openApp(folder);
  await step(app, views.selectProfile(app, alice.id), 'recover');
  const files = folder.snapshot();
  const screen = await step(app, views.acceptRecovery(app), 'hazards');
  assert.deepEqual(screen.hazards, plain(await registry.listHazards(state.body)));
  assert.equal(screen.unsaved, true);
  assert.deepEqual(screen.lastSave, (await loaded(folder)).lastSave, 'lastSave is what store.load gave');
  assert.deepEqual(screen.reviews, await reviewsOf(state.body));
  assert.deepEqual(folder.snapshot(), files, 'data.json and backups/ unchanged until a save');

  await step(app, views.save(app), 'hazards');
  assert.deepEqual((await storedHazards(folder)).map((h) => h.title), ['Saved', 'Recovered'], 'the save carries the recovered state');
}));

test('declineRecovery shows the hazards screen of the loaded body exactly as selection with no recoverable state gives it, and the offer is not made again (C-013)', () => inBrowser(async (env) => {
  const folder = new MemoryFolder();
  const [alice] = await plantProfiles(folder, ['Alice']);
  await anotherCopySaves(folder, { id: alice.id, name: alice.name }, ['Saved']);
  const first = await selectedApp(folder, 'Alice');
  await views.addHazard(first, { title: 'Declined' });

  const app = await openApp(folder);
  await step(app, views.selectProfile(app, alice.id), 'recover');
  const files = folder.snapshot();
  const screen = await step(app, views.declineRecovery(app), 'hazards');
  assert.deepEqual(screen.hazards, await storedHazards(folder));
  assert.equal(screen.unsaved, false);
  assert.deepEqual(screen.lastSave, (await loaded(folder)).lastSave);
  assert.deepEqual(folder.snapshot(), files, 'the folder is untouched');
  assert.equal(env.local.items.has(schema.BROWSER_STORAGE_KEY), false, 'the browser\'s copy was discarded');

  const later = await selectedApp(folder, 'Alice');
  assert.deepEqual(plain(/** @type {any} */ (later.screen).hazards), screen.hazards, 'the next selection offers nothing');
}));

test('working state another folder left in the browser is offered like any other (C-013; ASM-006, DEC-009)', () => inBrowser(async (env) => {
  const elsewhere = new MemoryFolder('Elsewhere');
  const first = await selectedApp(elsewhere, 'Alice');
  await views.addHazard(first, { title: 'From another folder' });

  const folder = new MemoryFolder('Here');
  const [alice] = await plantProfiles(folder, ['Alice']);
  const app = await openApp(folder);
  const screen = await step(app, views.selectProfile(app, alice.id), 'recover');
  assert.deepEqual(screen.hazards.map((/** @type {any} */ h) => h.title), ['From another folder']);
}));

test('a mirror another copy of Pivot left with unsaved false is not offered (C-013; store C-016)', () => inBrowser(async (env) => {
  const folder = new MemoryFolder();
  const [alice] = await plantProfiles(folder, ['Alice']);
  env.local.items.set(schema.BROWSER_STORAGE_KEY, mirrorText(bodyWithHazards(alice, ['Saved elsewhere']), null, timestampAest('2026-09-10T10:00:00+10:00'), false));
  const app = await openApp(folder);
  await step(app, views.selectProfile(app, alice.id), 'hazards');
}));

// ------------------------------------------------------------------ SL-02: C-014 restore

test('beginRestore lists the kept backups newest first; prepareRestore from a backup shows the confirm-restore screen with the file, its stamp, what it replaces and who saved that, its hazards, and one warning naming the unsaved changes; nothing is written (C-014)', () => inBrowser(async (env) => {
  const folder = new MemoryFolder();
  const [alice] = await plantProfiles(folder, ['Alice']);
  await plantBackup(folder, timestampAest('2026-09-01T08:00:00+10:00'), bodyWithHazards(alice, ['Older']), alice);
  await plantBackup(folder, timestampAest('2026-09-02T08:00:00+10:00'), bodyWithHazards(alice, ['Newer', 'Also newer']), alice);
  const app = await selectedApp(folder, 'Alice');
  await step(app, views.addHazard(app, { title: 'Stored' }), 'hazards');
  await step(app, views.save(app), 'hazards');
  await step(app, views.addHazard(app, { title: 'Not yet saved' }), 'hazards');
  const left = plain(app.screen);
  const names = await changeNames(folder, await heldBody(env, folder));
  const before = everywhere(folder, env);

  const restore = await step(app, views.beginRestore(app), 'restore');
  assert.deepEqual(restore.backups, plain(await store.listBackups(await openStore(folder))), 'backups is what store.listBackups gives');
  assert.ok(restore.backups.length >= 2);

  const newest = restore.backups.find((/** @type {any} */ b) => b.takenAtAest === '2026-09-02T08:00:00+10:00');
  const source = { kind: 'backup', file: newest.file };
  const s = await openStore(folder);
  await store.load(s);
  const plan = await store.prepareRestore(s, /** @type {any} */ (source));
  const confirm = expectScreen(app, await views.prepareRestore(app, /** @type {any} */ (source)), 'confirm-restore');
  assert.equal(confirm.restoring, newest.file);
  assert.deepEqual(confirm.stampInFile, plain(plan.stampInFile));
  assert.deepEqual(confirm.replaces, plain(plan.replaces));
  assert.equal(confirm.replacesSavedBy, 'Alice');
  assert.deepEqual(confirm.hazards, plain(await registry.listHazards(plan.body)));
  assert.deepEqual(confirm.reviews, await reviewsOf(plan.body), 'the review standing of the file\'s body');
  assert.deepEqual(oneMessage(confirm, 'warning').items, names, 'the warning names the unsaved changes, in unsavedChanges\' order');
  assert.deepEqual(everywhere(folder, env), before, 'beginRestore and prepareRestore wrote nothing');

  const back = await step(app, views.cancelRestore(app), 'hazards');
  assert.deepEqual(back, left, 'cancelRestore shows the hazards screen the user left');
  assert.deepEqual(everywhere(folder, env), before, 'cancelling wrote nothing');
}));

test('confirmRestore restores the plan through store, shows its hazards, unsaved false and lastSave the new stamp, and the folder opened again shows them (C-014, C-007)', () => inBrowser(async (env) => {
  const folder = new MemoryFolder();
  const [alice] = await plantProfiles(folder, ['Alice']);
  await plantBackup(folder, timestampAest('2026-09-02T08:00:00+10:00'), bodyWithHazards(alice, ['From the backup']), alice);
  const app = await selectedApp(folder, 'Alice');
  await step(app, views.addHazard(app, { title: 'Discarded' }), 'hazards');
  await step(app, views.beginRestore(app), 'restore');
  const file = `${schema.DATA_FOLDER.backups}/${schema.backupFileName(timestampAest('2026-09-02T08:00:00+10:00'))}`;
  expectScreen(app, await views.prepareRestore(app, /** @type {any} */ ({ kind: 'backup', file })), 'confirm-restore');

  const screen = await step(app, views.confirmRestore(app), 'hazards');
  assert.deepEqual(screen.hazards.map((/** @type {any} */ h) => h.title), ['From the backup']);
  assert.equal(screen.unsaved, false);
  assert.deepEqual(screen.lastSave, (await loaded(folder)).lastSave, 'lastSave is the stamp the restore wrote');
  assert.deepEqual(await storedHazards(folder), screen.hazards);

  const other = await selectedApp(folder, 'Alice');
  assert.deepEqual(plain(/** @type {any} */ (other.screen).hazards), screen.hazards, 'the restored file\'s hazards on the next open');
}));

test('a save state file restores through the same prepareRestore and confirmRestore as a backup, named by the name the browser gave it (C-014)', () => inBrowser(async () => {
  const folder = new MemoryFolder();
  const [alice] = await plantProfiles(folder, ['Alice']);
  const app = await selectedApp(folder, 'Alice');
  const text = await dataFileText(bodyWithHazards(alice, ['Saved elsewhere']), schema.freshStamp(alice.id));
  const source = { kind: 'save-state', saveState: { name: 'hazards export.json', text } };

  await step(app, views.beginRestore(app), 'restore');
  const confirm = expectScreen(app, await views.prepareRestore(app, /** @type {any} */ (source)), 'confirm-restore');
  assert.equal(confirm.restoring, 'hazards export.json');
  assert.equal(confirm.replaces, null, 'a folder never saved to replaces nothing');
  assert.equal(confirm.replacesSavedBy, null);
  assert.deepEqual(oneMessage(confirm, 'warning').items, [], 'nothing unsaved: a warning with no items');
  const screen = await step(app, views.confirmRestore(app), 'hazards');
  assert.deepEqual(screen.hazards.map((/** @type {any} */ h) => h.title), ['Saved elsewhere']);
  assert.deepEqual(await storedHazards(folder), screen.hazards);
}));

test('a restore over data another user saved names that user in replacesSavedBy, or their id when no stored profile has it (C-014)', () => inBrowser(async () => {
  const folder = new MemoryFolder();
  const [alice] = await plantProfiles(folder, ['Alice']);
  const ghost = { id: userProfileId.fresh(), name: 'Ghost' };
  await anotherCopySaves(folder, ghost, ['By a ghost']);
  const app = await selectedApp(folder, 'Alice');
  const text = await dataFileText(bodyWithHazards(alice, ['Replacement']), schema.freshStamp(alice.id));
  await step(app, views.beginRestore(app), 'restore');
  const confirm = expectScreen(app, await views.prepareRestore(app, /** @type {any} */ ({ kind: 'save-state', saveState: { name: 'r.json', text } })), 'confirm-restore');
  assert.equal(confirm.replacesSavedBy, ghost.id);
}));
