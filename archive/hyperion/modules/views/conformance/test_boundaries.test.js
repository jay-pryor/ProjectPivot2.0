/**
 * views conformance: boundaries (CORE-CON-002). Empty, first, degenerate, and repeated cases from
 * section 4's closing paragraphs and section 5's null and empty semantics and idempotency lines of
 * modules/views/CONTRACT.md: an empty list is a fact and never a standing that could not be read,
 * a platform with nothing open is listed with every list empty rather than left out, and every
 * navigation is harmless and resolves with the same screen while the body is the same. Written
 * from the contract before any implementation (P8). The null double must fail this file
 * (CORE-TST-002, rung 1).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as views from '../contract.js';
import { WrongScreenError } from '../contract.js';
import * as schema from '../../../baseline/schema.js';
import {
  MemoryExportFile, MemoryFolder, addPlatforms, anotherCopySaves, bodyWithHazards, buildWorld, expectScreen, inBrowser, itemsName,
  listedId, loaded, newProfile, noMessages, oneMessage, openApp, plain, plantData, plantProfiles, profileNamed, rejectionOf,
  selectedApp, step, storedHazards, supersededFiles, toAssessment, toHazard, toHazards, toPlatform,
} from './harness.js';

const NO_FILTER = Object.freeze({ platformId: null, band: null, recordStatus: null, controlState: null, referenceEntryId: null });

// ------------------------------------------------------------------ SL-01

test('a folder never saved to opens with no profiles; the first profile created and selected shows no hazards, nothing unsaved, lastSave null, and reviews with both lists empty; only profiles.json is written (C-003, C-004, C-031)', () => inBrowser(async () => {
  const folder = new MemoryFolder();
  const app = await views.start();
  const opened = expectScreen(app, await views.openFolder(app, folder.handle), 'profile');
  assert.deepEqual(opened.profiles, []);
  noMessages(opened);
  assert.deepEqual(folder.list(), [], 'nothing written by opening an empty folder');

  const created = expectScreen(app, await views.createProfile(app, 'First'), 'profile');
  assert.deepEqual(created.profiles.map((/** @type {any} */ p) => p.name), ['First']);
  const selected = expectScreen(app, await views.selectProfile(app, listedId(created, 'First')), 'hazards');
  assert.deepEqual(selected.hazards, []);
  assert.equal(selected.unsaved, false);
  assert.equal(selected.lastSave, null);
  assert.deepEqual(selected.reviews, { schedules: [], overdue: [] }, 'no tempo set is both lists empty, never null');
  assert.deepEqual(folder.list(), [schema.DATA_FOLDER.profiles], 'the profile is the only thing written');
}));

test('saving with no hazards into a folder never saved to says nothing, keeps nothing under Superseded Saves, and sets lastSave (C-007)', () => inBrowser(async () => {
  const folder = new MemoryFolder();
  const app = await selectedApp(folder, 'First');
  const screen = await step(app, views.save(app), 'hazards');
  assert.deepEqual(screen.hazards, []);
  assert.equal(screen.unsaved, false);
  assert.notEqual(screen.lastSave, null);
  assert.deepEqual(screen.lastSave, (await loaded(folder)).lastSave);
  assert.deepEqual(supersededFiles(folder), []);
}));

test('a folder with data.json but no profiles.json opens with no profiles; with profiles.json but no data.json a selection shows no hazards and lastSave null (C-003, C-004; store C-007, C-008)', () => inBrowser(async () => {
  const dataOnly = new MemoryFolder();
  const ghost = newProfile('Ghost');
  await plantData(dataOnly, bodyWithHazards(ghost, ['Orphan']), ghost);
  const a = await views.start();
  const opened = expectScreen(a, await views.openFolder(a, dataOnly.handle), 'profile');
  assert.deepEqual(opened.profiles, []);
  const created = await views.createProfile(a, 'Newcomer');
  const selected = expectScreen(a, await views.selectProfile(a, listedId(created, 'Newcomer')), 'hazards');
  assert.deepEqual(selected.hazards.map((/** @type {any} */ h) => h.title), ['Orphan'], 'the data held before any profile existed is shown after selection');

  const profilesOnly = new MemoryFolder();
  await plantProfiles(profilesOnly, ['Alice']);
  const b = await selectedApp(profilesOnly, 'Alice');
  assert.deepEqual(plain(/** @type {any} */ (b.screen).hazards), []);
  assert.equal(/** @type {any} */ (b.screen).lastSave, null);
}));

test('deleted hazards in the loaded body are not shown, and a new hazard never takes a deleted id (C-004, C-006; registry C-002, C-006)', () => inBrowser(async () => {
  const folder = new MemoryFolder();
  const [alice] = await plantProfiles(folder, ['Alice']);
  const body = bodyWithHazards(alice, ['Live one', 'Deleted one', 'Live two']);
  /** @type {any} */ (body.collections.hazard)['H-0002'].status = 'deleted';
  await plantData(folder, body, alice);

  const app = await openApp(folder);
  const selected = expectScreen(app, await views.selectProfile(app, alice.id), 'hazards');
  assert.deepEqual(selected.hazards.map((/** @type {any} */ h) => h.id), ['H-0001', 'H-0003']);
  const added = expectScreen(app, await views.addHazard(app, { title: 'Fresh' }), 'hazards');
  assert.deepEqual(added.hazards.map((/** @type {any} */ h) => h.id), ['H-0001', 'H-0003', 'H-0004']);
}));

test('names and titles beyond plain ASCII, and with inner spaces, are shown as given once trimmed and survive a save and an open (C-004, C-006)', () => inBrowser(async () => {
  const folder = new MemoryFolder('Données — Pivot');
  const app = await views.start();
  await views.openFolder(app, folder.handle);
  const created = await views.createProfile(app, '\t  Zoë  O\'Brien 田中 ');
  const name = 'Zoë  O\'Brien 田中';
  const selected = expectScreen(app, await views.selectProfile(app, listedId(created, name)), 'hazards');
  assert.deepEqual(selected.topBar, { folderName: 'Données — Pivot', profileName: name });

  const titles = ['Übertemperatur  im Triebwerk', 'a "quoted" title', '火災 — cabin'];
  for (const t of titles) await views.addHazard(app, { title: `  ${t}\n` });
  const saved = expectScreen(app, await views.save(app), 'hazards');
  assert.deepEqual(saved.hazards.map((/** @type {any} */ h) => h.title), titles);
  const other = await selectedApp(folder, name);
  assert.deepEqual(plain(/** @type {any} */ (other.screen).hazards), saved.hazards);
}));

test('openFolder twice on one app rejects the second time with WrongScreenError and leaves the app as the first left it (section 5 idempotency, C-002)', () => inBrowser(async () => {
  const folder = new MemoryFolder();
  const app = await openApp(folder);
  const first = plain(app.screen);
  const error = await rejectionOf(() => views.openFolder(app, folder.handle));
  assert.ok(error instanceof WrongScreenError);
  assert.deepEqual(plain(app.screen), first);
}));

test('a second start in the same page is a new app at the folder screen, whatever the first created and selected, and no open pre-selects (C-001, C-003)', () => inBrowser(async () => {
  const folder = new MemoryFolder();
  const first = await selectedApp(folder, 'Alice');
  await views.addHazard(first, { title: 'Held by the first app' });
  const second = await views.start();
  assert.deepEqual(plain(second.screen), { kind: 'folder', topBar: { folderName: null, profileName: null }, messages: [] });
  const opened = expectScreen(second, await views.openFolder(second, folder.handle), 'profile');
  assert.equal(opened.topBar.profileName, null, 'no open pre-selects');
  assert.equal(/** @type {any} */ (first.screen).topBar.profileName, 'Alice', 'the first app is untouched by the second');
  assert.equal(/** @type {any} */ (first.screen).unsaved, true);
}));

test('a save that supersedes a user no stored profile names warns with that user\'s id in place of a name (C-007)', () => inBrowser(async () => {
  const folder = new MemoryFolder();
  await plantProfiles(folder, ['Alice']);
  const app = await selectedApp(folder, 'Alice');
  const ghost = newProfile('Never stored');
  await anotherCopySaves(folder, { id: ghost.id, name: ghost.name }, ['Ghost\'s hazard']);

  await views.addHazard(app, { title: 'Alice\'s hazard' });
  const screen = expectScreen(app, await views.save(app), 'hazards');
  const warning = oneMessage(screen, 'warning');
  itemsName(warning, ghost.id, 'the other user\'s id');
  const kept = supersededFiles(folder);
  assert.equal(kept.length, 1);
  itemsName(warning, kept[0], 'the kept file');
  assert.deepEqual((await storedHazards(folder)).map((h) => h.title), ['Alice\'s hazard']);
}));

test('a save with nothing added and no one else in between writes again and says nothing, and so does the save after it (section 5 idempotency, C-007)', () => inBrowser(async () => {
  const folder = new MemoryFolder();
  const app = await selectedApp(folder, 'Alice');
  await views.addHazard(app, { title: 'Once' });
  const first = plain(await views.save(app));
  const second = await step(app, views.save(app), 'hazards');
  const third = await step(app, views.save(app), 'hazards');
  for (const s of [second, third]) {
    assert.equal(s.unsaved, false);
    assert.deepEqual(s.hazards, first.hazards);
  }
  assert.notDeepEqual(second.lastSave, first.lastSave, 'the second save wrote a stamp of its own');
  assert.deepEqual(third.lastSave, (await loaded(folder)).lastSave);
  assert.deepEqual(supersededFiles(folder), []);
}));

test('a warning is replaced by the next operation that resolves: no message outlives the operation after it (C-008)', () => inBrowser(async () => {
  const folder = new MemoryFolder();
  await plantProfiles(folder, ['Alice']);
  const app = await openApp(folder);
  assert.equal((await views.createProfile(app, ' ')).messages.length, 1);
  assert.deepEqual((await views.createProfile(app, 'Bob')).messages, []);
  assert.equal((await views.createProfile(app, 'bob')).messages.length, 1);
  assert.deepEqual((await views.selectProfile(app, listedId(app.screen, 'Alice'))).messages, []);
  assert.equal((await views.addHazard(app, { title: '' })).messages.length, 1);
  assert.deepEqual((await views.save(app)).messages, []);
  await step(app, views.openControls(app), 'controls');
  assert.equal((await views.createControl(app, { title: '' })).messages.length, 1);
  assert.deepEqual((await views.back(app)).messages, []);
}));

// ------------------------------------------------------------------ an empty body

test('a body with no controls, platforms, history, entries, workflows, templates, or reports shows every list screen with its lists empty, no message, and nothing null that means could not be read (section 4, section 5 null and empty semantics)', () => inBrowser(async () => {
  const folder = new MemoryFolder();
  const app = await selectedApp(folder, 'Alice');
  const alice = await profileNamed(folder, 'Alice');
  const empty = { schedules: [], overdue: [] };
  /** @type {[string, () => Promise<any>, (s: any) => void][]} */
  const screens = [
    ['controls', () => views.openControls(app), (s) => assert.deepEqual([s.controls, s.reviews], [[], empty])],
    ['platforms', () => views.openPlatforms(app), (s) => { assert.deepEqual(s.platforms, []); assert.deepEqual(s.profiles.map((/** @type {any} */ p) => p.id), [alice.id]); }],
    ['history', () => views.openHistory(app), (s) => assert.deepEqual(s.entries, [])],
    ['acknowledge', () => views.openAcknowledgements(app), (s) => assert.deepEqual(s.queues, [], 'a profile that owns no platform sees no queue')],
    ['references', () => views.openReferences(app), (s) => assert.deepEqual([s.entries, s.files], [[], []], 'files empty, not null')],
    ['workflows', () => views.openWorkflows(app), (s) => assert.deepEqual([s.workflows, s.platforms], [[], []])],
    ['reports', () => views.openReports(app), (s) => assert.deepEqual([s.templates, s.reports, s.platforms], [[], [], []])],
    ['filter', () => views.openFilter(app), (s) => assert.deepEqual([s.filter, s.hazards, s.controls, s.platforms, s.entries, s.files], [NO_FILTER, [], [], [], [], []])],
    ['dashboard', () => views.openDashboard(app), (s) => assert.deepEqual(s.platforms, [])],
    ['open-items', () => views.openOpenItems(app), (s) => assert.deepEqual([s.platforms, s.unplaced, s.unlinked, s.files], [[], { overdue: [], workflows: [] }, [], []], 'unlinked empty, not null')],
  ];
  for (const [kind, open, check] of screens) {
    const screen = await step(app, open(), /** @type {any} */ (kind));
    check(screen);
    await step(app, views.back(app), 'hazards');
  }
  const restore = await step(app, views.beginRestore(app), 'restore');
  assert.deepEqual(restore.backups, [], 'a folder with no backups opens a restore screen with backups empty');
}));

test('a live platform with nothing open is on its owner\'s dashboard as a PlatformItems with every list empty, not left out; and its queue, once acknowledged, is a queue with entries empty (C-029, C-046)', () => inBrowser(async (env) => {
  const folder = new MemoryFolder();
  const app = await selectedApp(folder, 'Alice');
  const alice = await profileNamed(folder, 'Alice');
  const [bare] = await addPlatforms(app, [{ name: 'Bare', ownerProfileId: alice.id }]);
  const ack = await step(app, views.openAcknowledgements(app), 'acknowledge');
  for (const entry of ack.queues[0].entries) await step(app, views.acknowledgeChange(app, entry.id, /** @type {any} */ (bare)), 'acknowledge');
  await step(app, views.back(app), 'hazards');
  const queue = await step(app, views.openAcknowledgements(app), 'acknowledge');
  assert.deepEqual(queue.queues.map((/** @type {any} */ q) => [q.platform.id, q.entries]), [[bare, []]], 'a queue with entries empty rather than an absent one');
  await toHazards(app);
  const dashboard = await step(app, views.openDashboard(app), 'dashboard');
  assert.equal(dashboard.platforms.length, 1);
  const [items] = dashboard.platforms;
  assert.deepEqual([items.overdue, items.unconfirmed, items.omitted, items.workflows, items.awaiting], [[], [], [], [], []]);
  assert.ok(env.local.mirror() !== null, 'the acknowledgements were told to store');
}));

test('a platform with no hazards prepares a report with rows, omitted, and outOfDate empty and no message, and the report holds no hazards (C-042)', () => inBrowser(async () => {
  const folder = new MemoryFolder();
  const app = await selectedApp(folder, 'Alice');
  const alice = await profileNamed(folder, 'Alice');
  const [bare] = await addPlatforms(app, [{ name: 'Bare', ownerProfileId: alice.id }]);
  await step(app, views.openReports(app), 'reports');
  const templateId = (await step(app, views.createTemplate(app, /** @type {any} */ ({ name: 'T', title: 'T', sections: [{ sectionKind: 'hazards' }] })), 'reports')).templates[0].id;
  const prepared = await step(app, views.beginReport(app, /** @type {any} */ ({ templateId, platformId: bare })), 'prepare-report');
  assert.deepEqual([prepared.rows, prepared.omitted, prepared.outOfDate], [[], [], []]);
  const report = await step(app, views.produceReport(app, []), 'report');
  assert.deepEqual([report.report.hazards, report.report.omitted, report.report.bowties], [[], [], []]);
}));

test('a hazard with nothing against it on a platform shows a bow-tie with every list empty; a hazard on no platform and in no report shows platforms and reports empty (C-039, C-044)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const brakes = await toHazard(w.app, w.hazards.brakes);
  assert.deepEqual([brakes.platforms, brakes.reports, brakes.causalFactors, brakes.consequences, brakes.controls], [[], [], [], [], []]);
  await toHazards(w.app);
  await toPlatform(w.app, w.platforms.bravo);
  await step(w.app, views.linkHazardToPlatform(w.app, /** @type {any} */ (w.hazards.brakes)), 'platform');
  await step(w.app, views.openAssessment(w.app, /** @type {any} */ (w.hazards.brakes)), 'assessment');
  const shown = await step(w.app, views.openBowtie(w.app), 'bowtie');
  assert.deepEqual([shown.bowtie.causalFactors, shown.bowtie.consequences, shown.bowtie.preventativeControls, shown.bowtie.mitigatingControls], [[], [], [], []]);
  assert.equal(typeof shown.svg, 'string');
}));

test('an entry with no links shows links empty, and one with no file is unflagged with no reason; a workflow that has recorded nothing shows no entries, no subject group, and no picker (C-034, C-035, C-037)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await step(w.app, views.openReferences(w.app), 'references');
  const entry = (await step(w.app, views.createReference(w.app, /** @type {any} */ ({ name: null, link: 'https://example.test', path: null, file: null })), 'references')).entries[0];
  const own = await step(w.app, views.openReference(w.app, entry.id), 'reference');
  assert.deepEqual(own.links, []);
  assert.deepEqual(own.files, [{ entryId: entry.id, location: null, flagged: false, reason: null }]);
  await toHazards(w.app);
  await step(w.app, views.openWorkflows(w.app), 'workflows');
  const wf = await step(w.app, views.startWorkflow(w.app, /** @type {any} */ ({ workflowKind: 'add-data', subject: null })), 'workflow');
  assert.deepEqual(wf.progress.record.entries, []);
  assert.deepEqual([wf.subjectName, wf.platform, wf.rows, wf.omitted, wf.hazard, wf.causalFactors, wf.consequences, wf.controls], [null, null, null, null, null, null, null, null]);
  assert.deepEqual([wf.linkableHazards, wf.linkableControls], [[], []]);
  assert.equal(wf.demand.satisfied, false);
}));

// ------------------------------------------------------------------ idempotency

test('every navigation is harmless: on the same body, each screen opened twice resolves deep-equal and writes nothing (section 5 idempotency)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await step(w.app, views.openReferences(w.app), 'references');
  const entryId = (await step(w.app, views.createReference(w.app, /** @type {any} */ ({ name: 'E', link: null, path: null, file: null })), 'references')).entries[0].id;
  await toHazards(w.app);
  await step(w.app, views.openWorkflows(w.app), 'workflows');
  const workflowId = (await step(w.app, views.startWorkflow(w.app, /** @type {any} */ ({ workflowKind: 'review-data', subject: { kind: 'platform', id: w.platforms.alpha } })), 'workflow')).progress.record.id;
  await toHazards(w.app);
  await step(w.app, views.openReports(w.app), 'reports');
  const templateId = (await step(w.app, views.createTemplate(w.app, /** @type {any} */ ({ name: 'T', title: 'T', sections: [{ sectionKind: 'hazards' }] })), 'reports')).templates[0].id;
  await step(w.app, views.beginReport(w.app, /** @type {any} */ ({ templateId, platformId: w.platforms.alpha })), 'prepare-report');
  const reportId = (await step(w.app, views.produceReport(w.app, []), 'report')).report.id;
  await toHazards(w.app);
  const files = w.folder.snapshot();
  const writes = env.local.writes.length;

  /** @type {[string, () => Promise<any>, () => Promise<any>][]} */
  const pairs = [
    ['hazard', () => views.openHazard(w.app, /** @type {any} */ (w.hazards.fire)), () => views.back(w.app)],
    ['controls', () => views.openControls(w.app), () => views.back(w.app)],
    ['history', () => views.openHistory(w.app), () => views.back(w.app)],
    ['acknowledge', () => views.openAcknowledgements(w.app), () => views.back(w.app)],
    ['filter', () => views.openFilter(w.app), () => views.back(w.app)],
    ['dashboard', () => views.openDashboard(w.app), () => views.back(w.app)],
    ['open-items', () => views.openOpenItems(w.app), () => views.back(w.app)],
  ];
  for (const [kind, open, close] of pairs) {
    const a = expectScreen(w.app, await open(), /** @type {any} */ (kind));
    await close();
    const b = expectScreen(w.app, await open(), /** @type {any} */ (kind));
    await close();
    assert.deepEqual(b, a, `${kind} twice`);
  }
  /** @type {[string, () => Promise<any>, () => Promise<any>, () => Promise<any>][]} */
  const nested = [
    ['reference', () => views.openReferences(w.app), () => views.openReference(w.app, entryId), () => views.back(w.app)],
    ['workflow', () => views.openWorkflows(w.app), () => views.openWorkflow(w.app, workflowId), () => views.back(w.app)],
    ['report', () => views.openReports(w.app), () => views.openReport(w.app, reportId), () => views.back(w.app)],
    ['prepare-report', () => views.openReports(w.app), () => views.beginReport(w.app, /** @type {any} */ ({ templateId, platformId: w.platforms.alpha })), () => views.back(w.app)],
  ];
  for (const [kind, parent, open, close] of nested) {
    await parent();
    const a = expectScreen(w.app, await open(), /** @type {any} */ (kind));
    await close();
    const b = expectScreen(w.app, await open(), /** @type {any} */ (kind));
    assert.deepEqual(b, a, `${kind} twice`);
    await toHazards(w.app);
  }
  await toAssessment(w.app, w.platforms.alpha, w.hazards.fire);
  const b1 = await step(w.app, views.openBowtie(w.app), 'bowtie');
  await step(w.app, views.back(w.app), 'assessment');
  const b2 = await step(w.app, views.openBowtie(w.app), 'bowtie');
  assert.equal(b2.svg, b1.svg, 'the bow-tie twice: the identical string');
  expectScreen(w.app, await views.back(w.app), 'assessment');
  await toHazards(w.app);
  const f1 = expectScreen(w.app, await views.openFilter(w.app), 'filter');
  const f2 = expectScreen(w.app, await views.applyFilter(w.app, /** @type {any} */ ({ ...NO_FILTER, platformId: w.platforms.alpha })), 'filter');
  const f3 = expectScreen(w.app, await views.applyFilter(w.app, /** @type {any} */ ({ ...NO_FILTER, platformId: w.platforms.alpha })), 'filter');
  assert.deepEqual(f3, f2, 'applyFilter twice');
  const f4 = expectScreen(w.app, await views.applyFilter(w.app, /** @type {any} */ (NO_FILTER)), 'filter');
  assert.deepEqual(f4, f1, 'no filter active is the screen openFilter showed');
  await toHazards(w.app);
  assert.deepEqual(w.folder.snapshot(), files, 'no navigation wrote to the folder');
  assert.equal(env.local.writes.length, writes, 'nor to the browser\'s storage');
}));

test('createTemplate twice with equal fields gives two templates, a second report is a second beginReport, and exportReport twice to one target in one form writes the same text (section 5 idempotency)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await step(w.app, views.openReports(w.app), 'reports');
  const fields = { name: 'Same', title: 'Same', sections: [{ sectionKind: 'hazards' }] };
  await step(w.app, views.createTemplate(w.app, /** @type {any} */ (fields)), 'reports');
  const two = await step(w.app, views.createTemplate(w.app, /** @type {any} */ (fields)), 'reports');
  assert.equal(two.templates.length, 2);
  assert.notEqual(two.templates[0].id, two.templates[1].id);
  await step(w.app, views.beginReport(w.app, /** @type {any} */ ({ templateId: two.templates[0].id, platformId: w.platforms.alpha })), 'prepare-report');
  const first = await step(w.app, views.produceReport(w.app, []), 'report');
  const target = new MemoryExportFile('r.md');
  await step(w.app, views.exportReport(w.app, /** @type {any} */ (target), 'markdown'), 'report');
  const once = new TextDecoder().decode(target.contents());
  await step(w.app, views.exportReport(w.app, /** @type {any} */ (target), 'markdown'), 'report');
  assert.equal(new TextDecoder().decode(target.contents()), once);
  const back = await step(w.app, views.back(w.app), 'reports');
  assert.equal(back.reports.length, 1, 'going back produces nothing');
  await step(w.app, views.beginReport(w.app, /** @type {any} */ ({ templateId: two.templates[0].id, platformId: w.platforms.alpha })), 'prepare-report');
  const second = await step(w.app, views.produceReport(w.app, []), 'report');
  assert.notEqual(second.report.id, first.report.id, 'a second report is a second record');
}));
