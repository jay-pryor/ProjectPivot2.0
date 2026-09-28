/**
 * views conformance: errors of the folder, profile, hazards, recover, and restore screens, and
 * the C-002 table (CORE-CON-002). Every operation called on every one of the twenty-six screen
 * kinds it does not belong to, and every section 4 row of SL-01 and SL-02 in
 * modules/views/CONTRACT.md the suite can reach, with C-008: a `WrongScreenError` rejection
 * with the app unchanged and nothing reaching the folder or the browser's storage, and every
 * failure a module signals resolved as a screen of the kind named, carrying the messages named,
 * with everything else as it was and the app still usable. Written from the contract before any
 * implementation (P8). The cancelled and denied picker rows are the pickers' and are verified by
 * demonstration.
 *
 * The null double must fail this file (CORE-TST-002, rung 1).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as views from '../contract.js';
import { WrongScreenError } from '../contract.js';
import * as store from '../../store/contract.js';
import * as registry from '../../registry/contract.js';
import * as changeLog from '../../change-log/contract.js';
import * as schema from '../../../baseline/schema.js';
import { timestampAest, userProfileId } from '../../../baseline/types.js';
import {
  ALL_OPERATIONS, MemoryExportFile, MemoryFolder, OPERATIONS_OF, anotherCopySaves, badDataTexts, bodyWithHazards, buildWorld,
  callOperation, dataFileText, day, everywhere, expectScreen, heldBody, inBrowser, itemsName, listedId, listedProfiles, loaded,
  newProfile, oneMessage, openApp, openStore, plain, plantBackup, plantData, plantProfiles, profilesFileText, recordAccess,
  rejectionOf, selectedApp, step, storeReadErrorOf, storedHazards, supersededFiles, tamperedText, toAssessment, toHazard, toHazards,
  toPlatform, withoutMessages,
} from './harness.js';

// ------------------------------------------------------------------ C-002: every operation on every screen it does not belong to

/**
 * The world with one of everything a screen can hold, saved, and one app on each of the
 * twenty-six screen kinds.
 * @param {any} env
 */
async function appsOnEveryScreen(env) {
  const w = await buildWorld(env);
  const { app, folder } = w;
  await step(app, views.openReferences(app), 'references');
  const entryId = (await step(app, views.createReference(app, /** @type {any} */ ({ name: 'Entry', link: null, path: null, file: null })), 'references')).entries[0].id;
  await toHazards(app);
  await step(app, views.openWorkflows(app), 'workflows');
  const workflowId = (await step(app, views.startWorkflow(app, /** @type {any} */ ({ workflowKind: 'review-data', subject: { kind: 'platform', id: w.platforms.alpha } })), 'workflow')).progress.record.id;
  await toHazards(app);
  await step(app, views.openReports(app), 'reports');
  const templateId = (await step(app, views.createTemplate(app, /** @type {any} */ ({ name: 'T', title: 'T', sections: [{ sectionKind: 'hazards' }] })), 'reports')).templates[0].id;
  await step(app, views.beginReport(app, /** @type {any} */ ({ templateId, platformId: w.platforms.alpha })), 'prepare-report');
  const reportId = (await step(app, views.produceReport(app, []), 'report')).report.id;
  await toHazards(app);
  await step(app, views.save(app), 'hazards');
  const backups = await store.listBackups(await openStore(folder));

  const checkFolder = new MemoryFolder('Check');
  const [carol] = await plantProfiles(checkFolder, ['Carol']);
  const bad = await plantBackup(checkFolder, timestampAest('2026-09-01T08:00:00+10:00'), bodyWithHazards(carol, ['x']), carol);
  checkFolder.write(bad, tamperedText(/** @type {string} */ (checkFolder.read(bad))));

  /** @type {Record<string, any>} */
  const apps = {};
  apps.folder = await views.start();
  apps.check = await views.start();
  expectScreen(apps.check, await views.openFolder(apps.check, checkFolder.handle), 'check');
  apps.profile = await openApp(folder);
  apps.hazards = await selectedApp(folder, 'Alice');
  apps.restore = await selectedApp(folder, 'Alice');
  await step(apps.restore, views.beginRestore(apps.restore), 'restore');
  apps['confirm-restore'] = await selectedApp(folder, 'Alice');
  await step(apps['confirm-restore'], views.beginRestore(apps['confirm-restore']), 'restore');
  expectScreen(apps['confirm-restore'], await views.prepareRestore(apps['confirm-restore'], /** @type {any} */ ({ kind: 'backup', file: backups[0].file })), 'confirm-restore');
  apps.hazard = await selectedApp(folder, 'Alice');
  await toHazard(apps.hazard, w.hazards.bird);
  apps.controls = await selectedApp(folder, 'Alice');
  await step(apps.controls, views.openControls(apps.controls), 'controls');
  apps.platforms = await selectedApp(folder, 'Alice');
  await step(apps.platforms, views.openPlatforms(apps.platforms), 'platforms');
  apps.platform = await selectedApp(folder, 'Alice');
  await toPlatform(apps.platform, w.platforms.alpha);
  apps.assessment = await selectedApp(folder, 'Alice');
  await toAssessment(apps.assessment, w.platforms.alpha, w.hazards.fire);
  apps.bowtie = await selectedApp(folder, 'Alice');
  await toAssessment(apps.bowtie, w.platforms.alpha, w.hazards.fire);
  await step(apps.bowtie, views.openBowtie(apps.bowtie), 'bowtie');
  for (const [kind, open] of /** @type {[string, (a: any) => Promise<any>][]} */ ([
    ['history', (a) => views.openHistory(a)], ['acknowledge', (a) => views.openAcknowledgements(a)], ['references', (a) => views.openReferences(a)],
    ['workflows', (a) => views.openWorkflows(a)], ['reports', (a) => views.openReports(a)], ['filter', (a) => views.openFilter(a)],
    ['dashboard', (a) => views.openDashboard(a)], ['open-items', (a) => views.openOpenItems(a)],
  ])) {
    apps[kind] = await selectedApp(folder, 'Alice');
    expectScreen(apps[kind], await open(apps[kind]), /** @type {any} */ (kind));
  }
  apps.reference = await selectedApp(folder, 'Alice');
  await step(apps.reference, views.openReferences(apps.reference), 'references');
  await step(apps.reference, views.openReference(apps.reference, entryId), 'reference');
  apps.workflow = await selectedApp(folder, 'Alice');
  await step(apps.workflow, views.openWorkflows(apps.workflow), 'workflows');
  expectScreen(apps.workflow, await views.openWorkflow(apps.workflow, workflowId), 'workflow');
  apps['prepare-report'] = await selectedApp(folder, 'Alice');
  await step(apps['prepare-report'], views.openReports(apps['prepare-report']), 'reports');
  expectScreen(apps['prepare-report'], await views.beginReport(apps['prepare-report'], /** @type {any} */ ({ templateId, platformId: w.platforms.alpha })), 'prepare-report');
  apps.report = await selectedApp(folder, 'Alice');
  await step(apps.report, views.openReports(apps.report), 'reports');
  await step(apps.report, views.openReport(apps.report, reportId), 'report');
  apps['confirm-edit'] = await selectedApp(folder, 'Alice');
  await toHazard(apps['confirm-edit'], w.hazards.fire);
  await step(apps['confirm-edit'], views.renameHazard(apps['confirm-edit'], { title: 'Gated' }), 'confirm-edit');
  const changer = await selectedApp(folder, 'Alice');
  await step(changer, views.addHazard(changer, { title: 'Unsaved in another app' }), 'hazards');
  apps.recover = await openApp(folder);
  await step(apps.recover, views.selectProfile(apps.recover, w.alice.id), 'recover');

  assert.deepEqual(Object.keys(apps).sort(), Object.keys(OPERATIONS_OF).sort(), 'an app on every screen kind');
  const elsewhere = new MemoryFolder('Elsewhere');
  const args = {
    handle: elsewhere.handle, name: 'Zed', profileId: w.alice.id, title: 'Should not exist', text: 'Should not exist',
    hazardId: w.hazards.bird, controlId: w.controls.radar, controlKind: 'preventative', platformId: w.platforms.alpha,
    platformReportId: 'X-1', stage: 'residual', values: { consequence: 1, likelihood: 'A' }, source: { kind: 'backup', file: backups[0].file },
    target: new MemoryExportFile('never.svg'), templateFields: { name: 'N', title: 'T', sections: [{ sectionKind: 'hazards' }] },
    beginFields: { templateId, platformId: w.platforms.alpha }, bowtieHazardIds: [], reportId, format: 'html',
    filter: { platformId: null, band: null, recordStatus: null, controlState: null, referenceEntryId: null },
    entryId: (await changeLog.listEntries((await loaded(folder)).body))[0].id,
    scheduleFields: { ref: { kind: 'hazard', id: w.hazards.bird }, tempoMonths: 1, nextDueAest: day('2027-01-01') },
    entryFields: { name: 'Should not exist', link: null, path: null, file: null }, referenceId: entryId,
    ref: { kind: 'hazard', id: w.hazards.bird }, startFields: { workflowKind: 'review-data', subject: { kind: 'platform', id: w.platforms.alpha } },
    workflowId, submission: { step: 'review-the-hazards', hazardId: w.hazards.bird, note: 'x' }, completionFields: { outcome: 'x' },
  };
  return { w, folder, checkFolder, elsewhere, apps, args };
}

test('every operation called on a screen kind it does not belong to rejects with WrongScreenError naming the operation and the screen; the app is unchanged and nothing reached the folder or the browser\'s storage (C-002)', () => inBrowser(async (env) => {
  const { folder, checkFolder, elsewhere, apps, args } = await appsOnEveryScreen(env);
  let refused = 0;
  for (const [kind, app] of Object.entries(apps)) {
    for (const operation of ALL_OPERATIONS.filter((op) => !OPERATIONS_OF[/** @type {'folder'} */ (kind)].includes(op))) {
      const screenBefore = plain(app.screen);
      const before = everywhere(folder, env);
      const watch = recordAccess(folder);
      const watchCheck = recordAccess(checkFolder);
      const watchElsewhere = recordAccess(elsewhere);
      const error = await rejectionOf(() => callOperation(app, operation, args));
      watch.stop();
      watchCheck.stop();
      watchElsewhere.stop();
      assert.ok(error instanceof WrongScreenError, `${operation} on the ${kind} screen rejects with WrongScreenError (got ${String(error)})`);
      assert.equal(error.operation, operation, 'the error names the operation');
      assert.equal(error.screen, kind, 'the error names the screen kind');
      assert.deepEqual(plain(app.screen), screenBefore, `${operation} on the ${kind} screen left app.screen as it was`);
      assert.deepEqual(everywhere(folder, env), before, `${operation} on the ${kind} screen wrote nothing anywhere`);
      assert.deepEqual([...watch.touched, ...watchCheck.touched, ...watchElsewhere.touched], [], `${operation} on the ${kind} screen reached a folder: no module operation may be called`);
      assert.equal(args.target.opened, 0, 'the export file was not opened');
      refused += 1;
    }
  }
  assert.ok(refused > 26 * 50, `every refusal was reached (${refused})`);
}));

test('after WrongScreenErrors every app serves its contract: nothing the refused calls named was created, and the next offered operation proceeds as if they had not been called (C-002, C-008)', () => inBrowser(async (env) => {
  const { w, folder, apps, args } = await appsOnEveryScreen(env);
  for (const [kind, app] of Object.entries(apps)) {
    for (const operation of ALL_OPERATIONS.filter((op) => !OPERATIONS_OF[/** @type {'folder'} */ (kind)].includes(op))) {
      await rejectionOf(() => callOperation(app, operation, args));
    }
  }
  assert.deepEqual((await listedProfiles(folder)).map((p) => p.name), ['Alice', 'Bob'], 'no profile Zed');
  assert.equal((await storedHazards(folder)).some((h) => h.title === 'Should not exist'), false);
  const hazards = await step(apps.hazards, views.openControls(apps.hazards), 'controls');
  assert.equal(hazards.controls.some((/** @type {any} */ c) => c.title === 'Should not exist'), false);
  await step(apps.profile, views.selectProfile(apps.profile, w.alice.id), 'recover');
  expectScreen(apps.folder, await views.openFolder(apps.folder, folder.handle), 'profile');
  await step(apps['confirm-edit'], views.cancelEdit(apps['confirm-edit']), 'hazard');
}));

// ------------------------------------------------------------------ SL-01: the folder and the profiles

test('openFolder on a folder whose data.json or profiles.json fails to open resolves with the folder screen, folderName null, one error per failure naming the file and the data affected, and nothing kept (section 4, C-010, C-008)', () => inBrowser(async (env) => {
  const by = newProfile('Alice');
  const texts = await badDataTexts(bodyWithHazards(by, ['Secret']), by);
  /** @type {[string, (f: MemoryFolder, text: string) => Promise<void>, string][]} */
  const files = [
    ['data.json', async (f, text) => { await plantProfiles(f, ['Alice']); f.write(schema.DATA_FOLDER.data, text); }, 'stored data'],
    ['profiles.json', async (f, text) => { await plantData(f, bodyWithHazards(by, ['Secret']), by); f.write(schema.DATA_FOLDER.profiles, text); }, 'profiles'],
  ];
  for (const [label, plant, affected] of files) {
    for (const [reason, text] of texts) {
      const folder = new MemoryFolder();
      await plant(folder, text);
      const failures = await store.checkFolder(await openStore(folder));
      const before = everywhere(folder, env);

      const app = await views.start();
      const screen = expectScreen(app, await views.openFolder(app, folder.handle), 'folder');
      assert.deepEqual(screen.topBar, { folderName: null, profileName: null }, `${label} ${reason}: nothing opened`);
      assert.equal(screen.messages.length, failures.length, `${label} ${reason}: one message per failure`);
      assert.ok(failures.length >= 1);
      const m = screen.messages[0];
      assert.equal(m.severity, 'error');
      assert.equal(m.items.length, 2, 'the file, then the data affected');
      assert.ok(m.items[0].includes(failures[0].file), `names ${failures[0].file}`);
      assert.ok(m.items[1].includes(affected), `names ${affected}`);
      assert.equal(JSON.stringify(screen).includes('Secret'), false, 'nothing from the folder is shown');
      assert.deepEqual(everywhere(folder, env), before, 'nothing written');
    }
  }
}));

test('openFolder on a folder whose data.json or profiles.json cannot be read resolves with the folder screen and one error naming the file; once the folder is back the same app opens it (section 4, C-008)', () => inBrowser(async () => {
  for (const denied of [schema.DATA_FOLDER.data, schema.DATA_FOLDER.profiles]) {
    const folder = new MemoryFolder();
    const [alice] = await plantProfiles(folder, ['Alice']);
    await anotherCopySaves(folder, { id: alice.id, name: alice.name }, ['Stored']);
    folder.denyRead((rel) => rel === denied);
    const expected = await storeReadErrorOf(folder, denied === schema.DATA_FOLDER.data ? 'load' : 'readProfiles');

    const app = await views.start();
    const screen = expectScreen(app, await views.openFolder(app, folder.handle), 'folder');
    assert.deepEqual(screen.topBar, { folderName: null, profileName: null });
    assert.ok(screen.messages.length >= 1 && screen.messages.every((/** @type {any} */ m) => m.severity === 'error'), 'an error');
    assert.ok(screen.messages.some((/** @type {any} */ m) => m.items.some((/** @type {string} */ i) => i.includes(expected.file))), `a message names ${expected.file}`);

    folder.denyRead(() => false);
    const reopened = expectScreen(app, await views.openFolder(app, folder.handle), 'profile');
    assert.deepEqual(reopened.messages, [], 'the message did not outlive the operation after it');
    assert.deepEqual(reopened.profiles, await listedProfiles(folder));
    const selected = expectScreen(app, await views.selectProfile(app, alice.id), 'hazards');
    assert.deepEqual(selected.hazards, await storedHazards(folder), 'the folder read afresh, nothing kept from the failed open');
  }
}));

test('createProfile with a name empty once trimmed resolves with the profile screen, one warning, the list re-read, and nothing written (section 4)', () => inBrowser(async (env) => {
  const folder = new MemoryFolder();
  const app = await openApp(folder);
  await plantProfiles(folder, ['Created elsewhere']);
  const before = everywhere(folder, env);

  for (const blank of ['', '   ', '\t\n']) {
    const screen = expectScreen(app, await views.createProfile(app, blank), 'profile');
    oneMessage(screen, 'warning');
    assert.equal(screen.topBar.profileName, null);
    assert.deepEqual(screen.profiles, await listedProfiles(folder), 'the list is re-read from the folder');
    assert.deepEqual(screen.profiles.map((/** @type {any} */ p) => p.name), ['Created elsewhere']);
  }
  assert.deepEqual(everywhere(folder, env), before, 'nothing written');
}));

test('createProfile with a name a stored profile has resolves with the profile screen, one warning naming the existing profile, the list re-read, and nothing written (section 4)', () => inBrowser(async (env) => {
  const folder = new MemoryFolder();
  await plantProfiles(folder, ['Alice Smith']);
  const app = await openApp(folder);
  await plantProfiles(folder, ['Bob']); // another copy, after this open
  const before = everywhere(folder, env);

  for (const [name, existing] of [['alice smith', 'Alice Smith'], ['  ALICE SMITH ', 'Alice Smith'], ['bob', 'Bob']]) {
    const screen = expectScreen(app, await views.createProfile(app, name), 'profile');
    itemsName(oneMessage(screen, 'warning'), existing, 'the existing profile');
    assert.deepEqual(screen.profiles, await listedProfiles(folder), 'the list is re-read from the folder');
    assert.equal(screen.profiles.length, 2);
    assert.equal(screen.topBar.profileName, null);
  }
  assert.deepEqual(everywhere(folder, env), before, 'nothing written');
}));

test('createProfile whose write does not complete resolves with the profile screen, one error naming the name given, and the list re-read; the app creates it once the folder recovers (section 4, C-008)', () => inBrowser(async () => {
  const folder = new MemoryFolder();
  await plantProfiles(folder, ['Alice']);
  const app = await openApp(folder);

  folder.failWrite(() => true);
  const screen = expectScreen(app, await views.createProfile(app, 'Bob'), 'profile');
  itemsName(oneMessage(screen, 'error'), 'Bob', 'the profile name given');
  assert.deepEqual(screen.profiles, await listedProfiles(folder));
  assert.deepEqual(screen.profiles.map((/** @type {any} */ p) => p.name), ['Alice'], 'Bob was not saved');
  assert.equal(screen.topBar.profileName, null);

  folder.failWrite(() => false);
  const retried = expectScreen(app, await views.createProfile(app, 'Bob'), 'profile');
  assert.deepEqual(retried.messages, []);
  assert.deepEqual(retried.profiles.map((/** @type {any} */ p) => p.name), ['Alice', 'Bob']);
}));

test('selectProfile with an id no stored profile has resolves with the profile screen, one warning, the list re-read, and no one selected (section 4)', () => inBrowser(async (env) => {
  const folder = new MemoryFolder();
  await plantProfiles(folder, ['Alice']);
  const app = await openApp(folder);
  const fromElsewhere = (await plantProfiles(new MemoryFolder(), ['Alice']))[0].id;
  await plantProfiles(folder, ['Bob']);
  const before = everywhere(folder, env);

  for (const id of [userProfileId.fresh(), fromElsewhere]) {
    const screen = expectScreen(app, await views.selectProfile(app, id), 'profile');
    oneMessage(screen, 'warning');
    assert.equal(screen.topBar.profileName, null, 'still no one selected');
    assert.deepEqual(screen.profiles, await listedProfiles(folder), 'the list is re-read from the folder');
    assert.equal(screen.profiles.length, 2);
  }
  assert.deepEqual(everywhere(folder, env), before, 'nothing written');
  const selected = expectScreen(app, await views.selectProfile(app, listedId(app.screen, 'Bob')), 'hazards');
  assert.equal(selected.topBar.profileName, 'Bob', 'the app is still usable');
  assert.deepEqual(selected.messages, []);
}));

test('createProfile and selectProfile when the profiles file fails to open resolve with the folder screen, folderName null, and one error naming the file; nothing from the folder kept (section 4)', () => inBrowser(async (env) => {
  const by = newProfile('Alice');
  const good = await profilesFileText({ [by.id]: by });
  const tampered = JSON.parse(good);
  tampered.body.profiles[by.id].name = 'Mallory';
  const texts = [['unreadable', 'not JSON {'], ['not-a-pivot-file', '[]'], ['integrity-failed', JSON.stringify(tampered, null, 2)]];

  for (const operation of ['createProfile', 'selectProfile']) {
    for (const [reason, text] of texts) {
      const folder = new MemoryFolder();
      folder.write(schema.DATA_FOLDER.profiles, good);
      const app = await openApp(folder);
      folder.write(schema.DATA_FOLDER.profiles, text);
      const expected = await storeReadErrorOf(folder, 'readProfiles');
      const before = everywhere(folder, env);

      const screen = expectScreen(app, operation === 'createProfile' ? await views.createProfile(app, 'Bob') : await views.selectProfile(app, by.id), 'folder');
      assert.deepEqual(screen.topBar, { folderName: null, profileName: null }, `${operation} ${reason}`);
      itemsName(oneMessage(screen, 'error'), expected.file, `the file (${operation} ${reason})`);
      assert.deepEqual(everywhere(folder, env), before, 'nothing written');
      assert.equal(JSON.stringify(screen).includes('Mallory'), false, 'nothing from the file is shown');

      folder.write(schema.DATA_FOLDER.profiles, good);
      const reopened = expectScreen(app, await views.openFolder(app, folder.handle), 'profile');
      assert.deepEqual(reopened.profiles, await listedProfiles(folder), 'the app opens the folder again once it is readable');
    }
  }
}));

test('selectProfile on a body holding a malformed hazard record resolves with the hazards screen, no hazards, one error naming the record\'s key; the body is kept and saved as it was (section 4, C-008)', () => inBrowser(async () => {
  const folder = new MemoryFolder();
  const [alice] = await plantProfiles(folder, ['Alice']);
  const body = bodyWithHazards(alice, ['Good one', 'Bad one']);
  /** @type {any} */ (body.collections.hazard)['H-0002'].title = 42;
  await plantData(folder, body, alice);

  const app = await openApp(folder);
  const screen = expectScreen(app, await views.selectProfile(app, alice.id), 'hazards');
  assert.deepEqual(screen.hazards, [], 'nothing from the collection is shown as hazards');
  itemsName(oneMessage(screen, 'error'), 'H-0002', 'the record\'s key');
  assert.equal(screen.topBar.profileName, 'Alice');
  assert.equal(screen.unsaved, false);
  assert.deepEqual(screen.lastSave, (await loaded(folder)).lastSave);

  const saved = expectScreen(app, await views.save(app), 'hazards');
  assert.deepEqual(saved.messages, [], 'the body kept is still this user\'s to save');
  assert.deepEqual((await loaded(folder)).body, plain(body), 'what was saved is the body held, unchanged');
}));

test('addHazard on a body holding a malformed hazard record resolves with the hazards screen, no hazards, one error naming the key, and the body kept (section 4, C-008)', () => inBrowser(async (env) => {
  const folder = new MemoryFolder();
  const [alice] = await plantProfiles(folder, ['Alice']);
  const body = bodyWithHazards(alice, ['Only']);
  /** @type {any} */ (body.collections.hazard)['H-0001'].status = 'lost';
  await plantData(folder, body, alice);
  const app = await openApp(folder);
  await views.selectProfile(app, alice.id);
  const before = everywhere(folder, env);

  const screen = expectScreen(app, await views.addHazard(app, { title: 'New' }), 'hazards');
  assert.deepEqual(screen.hazards, []);
  itemsName(oneMessage(screen, 'error'), 'H-0001', 'the record\'s key');
  assert.equal(screen.unsaved, false, 'unsaved as before: nothing was added');
  assert.deepEqual(everywhere(folder, env), before, 'nothing told to store');
  await views.save(app);
  assert.deepEqual((await loaded(folder)).body, plain(body), 'the body kept is the one loaded, with nothing added');
}));

test('addHazard with a title empty once trimmed resolves with the hazards screen and one warning; nothing on the screen but messages changed, and noteChange not called (section 4, C-008)', () => inBrowser(async (env) => {
  const folder = new MemoryFolder();
  const app = await selectedApp(folder, 'Alice');
  await views.addHazard(app, { title: 'Kept' });
  const before = plain(app.screen);
  const written = everywhere(folder, env);

  for (const blank of ['', ' ', '\t \n']) {
    const screen = expectScreen(app, await views.addHazard(app, { title: blank }), 'hazards');
    oneMessage(screen, 'warning');
    assert.deepEqual(withoutMessages(screen), withoutMessages(before));
  }
  assert.deepEqual(everywhere(folder, env), written, 'no noteChange: no mirror and no backup written');
  const next = expectScreen(app, await views.addHazard(app, { title: 'Next' }), 'hazards');
  assert.deepEqual(next.messages, [], 'the warning did not outlive the operation after it');
  assert.deepEqual(next.hazards.map((/** @type {any} */ h) => h.id), ['H-0001', 'H-0002'], 'no id was spent on the refused titles');
}));

test('addHazard when the sequence would reuse a held id resolves with the hazards screen and one error naming the id; hazards, unsaved, and the body unchanged (section 4)', () => inBrowser(async () => {
  const folder = new MemoryFolder();
  const [alice] = await plantProfiles(folder, ['Alice']);
  const body = bodyWithHazards(alice, ['First', 'Second']);
  body.sequences.hazard = 2;
  await plantData(folder, body, alice);
  const app = await openApp(folder);
  const selected = plain(await views.selectProfile(app, alice.id));

  const screen = expectScreen(app, await views.addHazard(app, { title: 'Third' }), 'hazards');
  itemsName(oneMessage(screen, 'error'), 'H-0002', 'the id');
  assert.deepEqual(screen.hazards, selected.hazards);
  assert.equal(screen.unsaved, false);
  await views.save(app);
  assert.deepEqual((await loaded(folder)).body, plain(body), 'the sequence was not adjusted to get past this');
}));

test('save whose data write, superseded copy, or read of the folder fails resolves with the hazards screen and one error; unsaved, lastSave, hazards, and the body unchanged, and the next save carries the body (section 4, C-011, C-008)', () => inBrowser(async () => {
  /** @type {[string, (f: MemoryFolder) => void, boolean][]} label, the break, whether another copy saves first */
  const cases = [
    ['data write', (f) => f.failWrite((rel) => rel === schema.DATA_FOLDER.data), false],
    ['superseded copy', (f) => f.failWrite((rel) => rel.startsWith(`${schema.DATA_FOLDER.supersededSaves}/`)), true],
    ['read', (f) => f.denyRead((rel) => rel === schema.DATA_FOLDER.data), false],
  ];
  for (const [label, breakIt, supersede] of cases) {
    const folder = new MemoryFolder();
    const [alice, bob] = await plantProfiles(folder, ['Alice', 'Bob']);
    await anotherCopySaves(folder, { id: alice.id, name: alice.name }, ['Stored']);
    const app = await selectedApp(folder, 'Alice');
    await views.addHazard(app, { title: 'Unsaved' });
    if (supersede) await anotherCopySaves(folder, { id: bob.id, name: bob.name }, ['Bob\'s']);
    const before = plain(app.screen);
    const stored = await loaded(folder);

    breakIt(folder);
    const screen = expectScreen(app, await views.save(app), 'hazards');
    oneMessage(screen, 'error');
    assert.deepEqual(withoutMessages(screen), withoutMessages(before), `${label}: nothing on the screen but messages changed`);
    folder.failWrite(() => false);
    folder.denyRead(() => false);
    assert.deepEqual(await loaded(folder), stored, `${label}: data.json is as it was`);

    const retried = expectScreen(app, await views.save(app), 'hazards');
    assert.equal(retried.unsaved, false, `${label}: the next save happens`);
    if (supersede) itemsName(oneMessage(retried, 'warning'), 'Bob', 'the other user, still unkept before the retry');
    else assert.deepEqual(retried.messages, []);
    assert.deepEqual(await storedHazards(folder), before.hazards, `${label}: the body kept is what the retry wrote`);
    assert.equal(supersededFiles(folder).length, supersede ? 1 : 0);
  }
}));

test('a save whose outcome carries a mirror error shows the screen C-007 gives with one more warning, last, naming the key; after a supersession it follows the supersession\'s warning (section 4, C-007)', () => inBrowser(async (env) => {
  const folder = new MemoryFolder();
  const [, bob] = await plantProfiles(folder, ['Alice', 'Bob']);
  const app = await selectedApp(folder, 'Alice');
  await step(app, views.addHazard(app, { title: 'Mirrored' }), 'hazards');
  env.local.refuseWrites();
  const plainSave = expectScreen(app, await views.save(app), 'hazards');
  assert.equal(plainSave.unsaved, false, 'the save happened');
  itemsName(oneMessage(plainSave, 'warning'), schema.BROWSER_STORAGE_KEY, 'the key');

  env.local.setError = null;
  await step(app, views.addHazard(app, { title: 'Again' }), 'hazards');
  await anotherCopySaves(folder, { id: bob.id, name: bob.name }, ['Bob\'s']);
  env.local.refuseWrites();
  const both = expectScreen(app, await views.save(app), 'hazards');
  assert.equal(both.messages.length, 2);
  itemsName(both.messages[0], 'Bob', 'the supersession first');
  itemsName(both.messages[1], schema.BROWSER_STORAGE_KEY, 'the mirror error last');
}));

// ------------------------------------------------------------------ SL-02: recovery and restore

test('selectProfile when the browser\'s storage cannot be read shows the hazards screen as with no recoverable state and one warning naming the key; nothing written (section 4, C-013)', () => inBrowser(async (env) => {
  const folder = new MemoryFolder();
  const [alice] = await plantProfiles(folder, ['Alice']);
  await anotherCopySaves(folder, { id: alice.id, name: alice.name }, ['Stored']);
  const app = await openApp(folder);
  env.local.refuseReads();
  const before = everywhere(folder, env);
  const screen = expectScreen(app, await views.selectProfile(app, alice.id), 'hazards');
  itemsName(oneMessage(screen, 'warning'), schema.BROWSER_STORAGE_KEY, 'the key');
  assert.deepEqual(screen.hazards, await storedHazards(folder));
  assert.equal(screen.unsaved, false);
  assert.deepEqual(everywhere(folder, env), before);
}));

test('a recoverable state holding a malformed hazard shows the recover screen with no hazards and one error naming the key; accepting it shows the hazards screen with no hazards and the error (section 4, C-013)', () => inBrowser(async (env) => {
  const folder = new MemoryFolder();
  const [alice] = await plantProfiles(folder, ['Alice']);
  const body = bodyWithHazards(alice, ['Fine', 'Broken']);
  /** @type {any} */ (body.collections.hazard)['H-0002'].title = null;
  env.local.items.set(schema.BROWSER_STORAGE_KEY, JSON.stringify({ schemaVersion: schema.SCHEMA_VERSION, mirroredAtAest: '2026-09-10T10:00:00+10:00', unsaved: true, loadedStamp: null, body }));
  const app = await openApp(folder);
  const recover = expectScreen(app, await views.selectProfile(app, alice.id), 'recover');
  assert.deepEqual(recover.hazards, []);
  itemsName(oneMessage(recover, 'error'), 'H-0002', 'the record\'s key');
  const accepted = expectScreen(app, await views.acceptRecovery(app), 'hazards');
  assert.deepEqual(accepted.hazards, []);
  itemsName(oneMessage(accepted, 'error'), 'H-0002', 'the record\'s key');
}));

test('acceptRecovery when the state cannot be read shows the loaded body\'s hazards screen, unsaved false, one error naming the key; declineRecovery when the key cannot be removed shows it with one warning naming the key (section 4, C-013)', () => inBrowser(async (env) => {
  for (const operation of ['acceptRecovery', 'declineRecovery']) {
    const folder = new MemoryFolder();
    const [alice] = await plantProfiles(folder, ['Alice']);
    await anotherCopySaves(folder, { id: alice.id, name: alice.name }, ['Stored']);
    const first = await selectedApp(folder, 'Alice');
    await views.addHazard(first, { title: `Unsaved for ${operation}` });
    const app = await openApp(folder);
    await step(app, views.selectProfile(app, alice.id), 'recover');
    const files = folder.snapshot();
    if (operation === 'acceptRecovery') env.local.refuseReads();
    else env.local.refuseRemoval();
    const screen = expectScreen(app, operation === 'acceptRecovery' ? await views.acceptRecovery(app) : await views.declineRecovery(app), 'hazards');
    itemsName(oneMessage(screen, operation === 'acceptRecovery' ? 'error' : 'warning'), schema.BROWSER_STORAGE_KEY, 'the key');
    assert.deepEqual(screen.hazards, await storedHazards(folder), `${operation}: the loaded body`);
    assert.equal(screen.unsaved, false);
    assert.deepEqual(folder.snapshot(), files, `${operation}: nothing written to the folder`);
    env.local.getError = null;
    env.local.removeError = null;
    env.local.items.delete(schema.BROWSER_STORAGE_KEY);
  }
}));

test('beginRestore when the backups cannot be listed shows the hazards screen as before with one error naming the file (section 4, C-014)', () => inBrowser(async (env) => {
  const folder = new MemoryFolder();
  const app = await selectedApp(folder, 'Alice');
  await step(app, views.addHazard(app, { title: 'Held' }), 'hazards');
  const before = plain(app.screen);
  folder.denyRead((rel) => rel === schema.DATA_FOLDER.backups || rel.startsWith(`${schema.DATA_FOLDER.backups}/`));
  const expected = await rejectionOf(async () => store.listBackups(await openStore(folder)));
  const screen = expectScreen(app, await views.beginRestore(app), 'hazards');
  itemsName(oneMessage(screen, 'error'), expected.file, 'the file');
  assert.deepEqual(withoutMessages(screen), withoutMessages(before));
}));

test('prepareRestore from a backup that fails its check or a save state that is not Pivot data shows the restore screen as before with one error naming the file, and writes nothing (section 4, C-014)', () => inBrowser(async (env) => {
  const folder = new MemoryFolder();
  const [alice] = await plantProfiles(folder, ['Alice']);
  const bad = await plantBackup(folder, timestampAest('2026-09-01T08:00:00+10:00'), bodyWithHazards(alice, ['Old']), alice);
  folder.write(bad, tamperedText(/** @type {string} */ (folder.read(bad))));
  // a backup failing its check opens to the check screen, not the profile screen (C-010)
  const app = await views.start();
  expectScreen(app, await views.openFolder(app, folder.handle), 'check');
  expectScreen(app, await views.acknowledgeCheck(app), 'profile');
  await step(app, views.selectProfile(app, alice.id), 'hazards');
  const restore = await step(app, views.beginRestore(app), 'restore');
  const before = everywhere(folder, env);

  /** @type {[any, string][]} */
  const sources = [
    [{ kind: 'backup', file: bad }, bad],
    [{ kind: 'save-state', saveState: { name: 'not pivot.json', text: '{"hello": 1}' } }, 'not pivot.json'],
  ];
  for (const [source, file] of sources) {
    const screen = expectScreen(app, await views.prepareRestore(app, source), 'restore');
    itemsName(oneMessage(screen, 'error'), file, 'the file');
    assert.deepEqual(withoutMessages(screen), withoutMessages(restore));
  }
  assert.deepEqual(everywhere(folder, env), before, 'nothing written');
}));

test('prepareRestore from a file whose body holds a malformed hazard shows the restore screen as before with one error naming the record\'s key (section 4, C-014)', () => inBrowser(async () => {
  const folder = new MemoryFolder();
  const [alice] = await plantProfiles(folder, ['Alice']);
  const app = await selectedApp(folder, 'Alice');
  await step(app, views.beginRestore(app), 'restore');
  const body = bodyWithHazards(alice, ['Fine', 'Broken']);
  /** @type {any} */ (body.collections.hazard)['H-0002'].kind = 'control';
  const text = await dataFileText(body, schema.freshStamp(alice.id));
  const screen = expectScreen(app, await views.prepareRestore(app, /** @type {any} */ ({ kind: 'save-state', saveState: { name: 'broken.json', text } })), 'restore');
  itemsName(oneMessage(screen, 'error'), 'H-0002', 'the record\'s key');
}));

test('confirmRestore whose restore does not happen shows the hazards screen beginRestore was called on, with one error naming the file being restored; the working body is kept and the folder\'s data is as it was (section 4, C-014)', () => inBrowser(async (env) => {
  const folder = new MemoryFolder();
  const [alice] = await plantProfiles(folder, ['Alice']);
  await anotherCopySaves(folder, { id: alice.id, name: alice.name }, ['Stored']);
  const app = await selectedApp(folder, 'Alice');
  await step(app, views.addHazard(app, { title: 'Held, unsaved' }), 'hazards');
  const left = plain(app.screen);
  const held = await heldBody(env, folder);
  const stored = await loaded(folder);
  await step(app, views.beginRestore(app), 'restore');
  const text = await dataFileText(bodyWithHazards(alice, ['From file']), schema.freshStamp(alice.id));
  expectScreen(app, await views.prepareRestore(app, /** @type {any} */ ({ kind: 'save-state', saveState: { name: 'restore me.json', text } })), 'confirm-restore');
  folder.failWrite((rel) => rel === schema.DATA_FOLDER.data);
  const screen = expectScreen(app, await views.confirmRestore(app), 'hazards');
  folder.failWrite(() => false);
  itemsName(oneMessage(screen, 'error'), 'restore me.json', 'what was being restored');
  assert.deepEqual(withoutMessages(screen), withoutMessages(left));
  assert.deepEqual(await loaded(folder), stored, 'the folder\'s data is as it was');
  await step(app, views.save(app), 'hazards');
  assert.deepEqual((await loaded(folder)).body, held, 'the working body was kept');
  assert.deepEqual((await registry.listHazards(held)).map((h) => h.title), ['Stored', 'Held, unsaved']);
}));
