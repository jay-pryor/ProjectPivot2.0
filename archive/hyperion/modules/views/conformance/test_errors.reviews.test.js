/**
 * views conformance: errors of the review standing, the review tempo, and the reference register
 * (CORE-CON-002). Every section 4 row of C-031 to C-035 (SL-06, SL-10) of
 * modules/views/CONTRACT.md the suite can reach, with C-008. A standing that could not be read is
 * `null` and never an empty list (HZ-012's shape), so each of those rows is asserted as null.
 * Written from the contract before any implementation (P8). The null double must fail this file
 * (CORE-TST-002, rung 1).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as views from '../contract.js';
import * as registry from '../../registry/contract.js';
import * as reviewSchedule from '../../review-schedule/contract.js';
import * as referenceRegister from '../../reference-register/contract.js';
import * as schema from '../../../baseline/schema.js';
import { arm } from '../../../baseline/faults.js';
import { referenceEntryId } from '../../../baseline/types.js';
import {
  buildWorld, day, everywhere, expectScreen, heldBody, inBrowser, incomingFile, itemsName, loaded, malformed, oneMessage,
  openStore, plain, plantData, refusedAsBefore, rejectionOf, reviewsOf, saveBody, scheduleActOf, selectedApp, step, toAssessment,
  toHazard, toHazards, withoutMessages,
} from './harness.js';

// ------------------------------------------------------------------ C-031 a standing that cannot be read

test('on a body holding a malformed schedule every screen that carries reviews shows reviews null, never an empty Reviews, with one error naming the entry\'s key, and every other field as its clause says; a change is still made and told to store (section 4, C-031; HZ-012)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await toHazard(w.app, w.hazards.bird);
  await step(w.app, views.setReviewTempo(w.app, /** @type {any} */ ({ ref: { kind: 'hazard', id: w.hazards.bird }, tempoMonths: 6, nextDueAest: day('2026-01-01') })), 'hazard');
  await toHazards(w.app);
  await step(w.app, views.save(w.app), 'hazards');
  const body = await heldBody(env, w.folder);
  const key = Object.keys(/** @type {any} */ (body.collections['review-schedule']))[0];
  const broken = malformed(body, 'review-schedule', key, (r) => { r.tempoMonths = 0; });
  const expected = await rejectionOf(() => reviewSchedule.listOverdue(broken));
  assert.ok(expected instanceof reviewSchedule.MalformedScheduleError);
  await plantData(w.folder, broken, w.alice);

  const app = await selectedApp(w.folder, 'Alice');
  /** @param {any} screen @param {string} label */
  const unread = (screen, label) => {
    assert.equal(screen.reviews, null, `${label}: reviews null`);
    const errors = screen.messages.filter((/** @type {any} */ m) => m.severity === 'error' && m.items.some((/** @type {string} */ i) => i.includes(key)));
    assert.equal(errors.length, 1, `${label}: one error naming the entry's key`);
  };
  unread(app.screen, 'hazards at selection');
  assert.deepEqual(/** @type {any} */ (app.screen).hazards, plain(await registry.listHazards(broken)), 'hazards as C-004 says');

  unread(expectScreen(app, await views.openHazard(app, /** @type {any} */ (w.hazards.bird)), 'hazard'), 'hazard');
  await toHazards(app);
  unread(expectScreen(app, await views.openControls(app), 'controls'), 'controls');
  await toHazards(app);
  unread(expectScreen(app, await views.openPlatforms(app), 'platforms'), 'platforms');
  unread(expectScreen(app, await views.openPlatform(app, /** @type {any} */ (w.platforms.alpha)), 'platform'), 'platform');
  unread(expectScreen(app, await views.openAssessment(app, /** @type {any} */ (w.hazards.bird)), 'assessment'), 'assessment');
  await toHazards(app);
  unread(expectScreen(app, await views.openReferences(app), 'references'), 'references');
  await toHazards(app);
  unread(expectScreen(app, await views.openWorkflows(app), 'workflows'), 'workflows');
  await toHazards(app);

  const changed = expectScreen(app, await views.addHazard(app, { title: 'Still added' }), 'hazards');
  unread(changed, 'a change');
  assert.ok(changed.hazards.some((/** @type {any} */ h) => h.title === 'Still added'), 'the change is made');
  assert.equal(changed.unsaved, true);
  assert.ok((await registry.listHazards(/** @type {any} */ (env.local.mirror()).body)).some((h) => h.title === 'Still added'), 'and told to store');
}));

// ------------------------------------------------------------------ C-032 setting a tempo

test('setReviewTempo with a tempo that is not a whole number of at least one, or a due date that is not a calendar date, leaves its screen as before with one warning naming what was given; nothing stored (section 4, C-032)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await toHazard(w.app, w.hazards.bird);
  const ref = { kind: 'hazard', id: w.hazards.bird };
  for (const tempo of [0, -1, 1.5]) {
    itemsName(await refusedAsBefore(w, () => views.setReviewTempo(w.app, /** @type {any} */ ({ ref, tempoMonths: tempo, nextDueAest: '2027-01-01' })), 'warning', `tempo ${tempo}`), String(tempo), 'the tempo given');
  }
  for (const due of ['2027-02-30', '01/01/2027', '']) {
    itemsName(await refusedAsBefore(w, () => views.setReviewTempo(w.app, /** @type {any} */ ({ ref, tempoMonths: 3, nextDueAest: due })), 'warning', `due ${JSON.stringify(due)}`), due, 'the date given');
  }
}));

test('setReviewTempo for a ref its screen does not offer a tempo for — another kind, or an id the screen does not hold or list — leaves the screen as before with one warning naming the ref\'s kind and id, and writes nothing (section 4, C-032)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  /** @type {[string, () => Promise<any>, any[]][]} */
  const cases = [
    ['hazard', () => toHazard(w.app, w.hazards.bird), [{ kind: 'hazard', id: w.hazards.brakes }, { kind: 'control', id: w.controls.radar }, { kind: 'platform', id: w.platforms.alpha }]],
    ['controls', () => step(w.app, views.openControls(w.app), 'controls'), [{ kind: 'hazard', id: w.hazards.bird }, { kind: 'control', id: '00000000-0000-4000-8000-00000000000c' }]],
    ['platforms', () => step(w.app, views.openPlatforms(w.app), 'platforms'), [{ kind: 'control', id: w.controls.radar }, { kind: 'reference-entry', id: referenceEntryId.fresh() }]],
  ];
  for (const [kind, open, refs] of cases) {
    await open();
    for (const ref of refs) {
      const m = await refusedAsBefore(w, () => views.setReviewTempo(w.app, /** @type {any} */ ({ ref, tempoMonths: 1, nextDueAest: day('2027-01-01') })), 'warning', `${ref.kind} on the ${kind} screen`);
      itemsName(m, ref.kind, 'the kind');
      itemsName(m, ref.id, 'the id');
    }
    await toHazards(w.app);
  }
}));

test('setReviewTempo with the tempo and due date already stored leaves the screen as before with one info message naming the record review-schedule names, and stores nothing (section 4; review-schedule C-013)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await step(w.app, views.openPlatforms(w.app), 'platforms');
  const fields = { ref: { kind: 'platform', id: w.platforms.alpha }, tempoMonths: 12, nextDueAest: day('2027-06-30') };
  await step(w.app, views.setReviewTempo(w.app, /** @type {any} */ (fields)), 'platforms');
  const body = await heldBody(env, w.folder);
  const same = await rejectionOf(async () => reviewSchedule.setSchedule(body, await scheduleActOf(body, w.alice, /** @type {any} */ (fields.ref)), /** @type {any} */ (fields)));
  assert.ok(same instanceof reviewSchedule.NoChangeError);
  // review-schedule's contract.js gives NoChangeError a ref and a detail and no field, though its CONTRACT.md says "the ref and the field";
  // both halves agree on the ref, so that is what the message is held to
  itemsName(await refusedAsBefore(w, () => views.setReviewTempo(w.app, /** @type {any} */ (fields)), 'info', 'the same schedule'), same.ref.id, 'the record');
}));

test('a gated setReviewTempo whose tempo the scales do not carry is told after the list: confirmEdit shows the hazard screen rebuilt with the warning, and nothing is stored (section 4, C-027)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const shown = await toHazard(w.app, w.hazards.fire);
  const written = everywhere(w.folder, env);
  await step(w.app, views.setReviewTempo(w.app, /** @type {any} */ ({ ref: { kind: 'hazard', id: w.hazards.fire }, tempoMonths: 0, nextDueAest: day('2027-01-01') })), 'confirm-edit');
  const screen = expectScreen(w.app, await views.confirmEdit(w.app), 'hazard');
  itemsName(oneMessage(screen, 'warning'), '0', 'what was given');
  assert.deepEqual(withoutMessages(screen), withoutMessages(shown));
  assert.deepEqual(everywhere(w.folder, env), written);
}));

// ------------------------------------------------------------------ C-033 to C-035 the register

test('createReference with a blank field, or with none of the four, leaves the references screen as before with one warning, naming the field for a blank; nothing stored and no file kept (section 4, C-033)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await step(w.app, views.openReferences(w.app), 'references');
  for (const field of ['name', 'link', 'path']) {
    const fields = { name: null, link: null, path: null, file: incomingFile('kept?.txt', [1]), [field]: '   ' };
    itemsName(await refusedAsBefore(w, () => views.createReference(w.app, /** @type {any} */ (fields)), 'warning', `a blank ${field}`), field, 'the field');
    assert.deepEqual(w.folder.listUnder(schema.DATA_FOLDER.files), [], 'no file kept');
  }
  await refusedAsBefore(w, () => views.createReference(w.app, /** @type {any} */ ({ name: null, link: null, path: null, file: null })), 'warning', 'an empty entry');
}));

test('createReference whose file cannot be kept, stopped at store\'s fault point, leaves the references screen as before with one error naming the file\'s name; no entry, no location, and no file under files/ (section 4, C-033; store C-018)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await step(w.app, views.openReferences(w.app), 'references');
  arm('store.stored-file.staged');
  itemsName(await refusedAsBefore(w, () => views.createReference(w.app, /** @type {any} */ ({ name: 'Drawing', link: null, path: null, file: incomingFile('wing root.pdf', [1, 2, 3]) })), 'error', 'a file not kept'), 'wing root.pdf', 'the file\'s name');
  assert.deepEqual(w.folder.listUnder(schema.DATA_FOLDER.files), []);
}));

test('linkReference to a ref the entry screen does not offer — a kind its lists do not carry, an id not in its list, or a record already linked — leaves the screen as before with one warning naming the kind and id, and writes nothing (section 4, C-034)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await step(w.app, views.openReferences(w.app), 'references');
  const entryId = (await step(w.app, views.createReference(w.app, /** @type {any} */ ({ name: 'Note', link: null, path: null, file: null })), 'references')).entries[0].id;
  await step(w.app, views.openReference(w.app, entryId), 'reference');
  await step(w.app, views.linkReference(w.app, /** @type {any} */ ({ kind: 'hazard', id: w.hazards.bird })), 'reference');
  const refs = [
    { kind: 'hazard', id: w.hazards.bird },
    { kind: 'report', id: '00000000-0000-4000-8000-0000000000aa' },
    { kind: 'causal-factor', id: '00000000-0000-4000-8000-0000000000bb' },
    { kind: 'reference-entry', id: entryId },
    { kind: 'platform', id: '00000000-0000-4000-8000-0000000000cc' },
  ];
  for (const ref of refs) {
    const m = await refusedAsBefore(w, () => views.linkReference(w.app, /** @type {any} */ (ref)), 'warning', `${ref.kind} ${ref.id}`);
    itemsName(m, ref.kind, 'the kind');
    itemsName(m, ref.id, 'the id');
  }
}));

test('openReference for an id the body has no live entry for shows the references screen re-listed with one warning naming the id (section 4, C-034)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await step(w.app, views.openReferences(w.app), 'references');
  const id = referenceEntryId.fresh();
  const screen = expectScreen(w.app, await views.openReference(w.app, id), 'references');
  itemsName(oneMessage(screen, 'warning'), id, 'the id');
}));

test('the register screens on a body holding a malformed entry show entries or links empty and files null with one error naming the entry\'s key; createReference is refused with it too (section 4, C-033, C-035)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await step(w.app, views.openReferences(w.app), 'references');
  await step(w.app, views.createReference(w.app, /** @type {any} */ ({ name: 'Good', link: null, path: null, file: null })), 'references');
  await toHazards(w.app);
  await step(w.app, views.save(w.app), 'hazards');
  const body = (await loaded(w.folder)).body;
  const key = Object.keys(/** @type {any} */ (body.collections['reference-entry']))[0];
  await saveBody(w.folder, w.alice, malformed(body, 'reference-entry', key, (r) => { r.links = 'everything'; }));
  const app = await selectedApp(w.folder, 'Alice');
  const screen = expectScreen(app, await views.openReferences(app), 'references');
  assert.deepEqual(screen.entries, []);
  assert.equal(screen.files, null, 'files null, never an empty list');
  itemsName(oneMessage(screen, 'error'), key, 'the entry\'s key');
  const refused = await refusedAsBefore({ app, folder: w.folder, env }, () => views.createReference(app, /** @type {any} */ ({ name: 'Blocked', link: null, path: null, file: null })), 'error', 'createReference');
  itemsName(refused, key, 'the entry\'s key');
}));

test('the register screens when the data folder cannot be read show files null, never unflagged, with one error naming the folder; every other field as its clause says (section 4, C-035; store C-019)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await step(w.app, views.openReferences(w.app), 'references');
  const entry = (await step(w.app, views.createReference(w.app, /** @type {any} */ ({ name: 'With a file', link: null, path: null, file: incomingFile('f.bin', [9]) })), 'references')).entries[0];
  const body = await heldBody(env, w.folder);
  // the data folder itself unreadable, as store's own suite makes it for C-019's one rejection; a denied files/ alone is a
  // per-location reason, not an error (store C-019)
  w.folder.denyRead(() => true);
  const expected = await rejectionOf(async () => referenceRegister.checkEntryFiles(body, await openStore(w.folder)));
  await toHazards(w.app);
  const screen = expectScreen(w.app, await views.openReferences(w.app), 'references');
  assert.equal(screen.files, null);
  assert.deepEqual(screen.entries, plain(await referenceRegister.listEntries(body)), 'entries as C-033 says');
  itemsName(oneMessage(screen, 'error'), expected.file, 'the folder');
  const own = expectScreen(w.app, await views.openReference(w.app, entry.id), 'reference');
  assert.equal(own.files, null);
  assert.deepEqual(own.entry, plain(await referenceRegister.getEntry(body, entry.id)));
}));
