/**
 * views conformance: the review standing, the review tempo, and the reference register
 * (CORE-CON-002). The happy path of C-031 and C-032 (SL-06) and C-033 to C-035 (SL-10) of
 * modules/views/CONTRACT.md, each screen compared with what `review-schedule`,
 * `reference-register`, `registry`, and `change-log` give for the body it is built from.
 * Written from the contract before any implementation (P8).
 *
 * The clock is fixed through `baseline/clock.js` either side of a due date, the one place this
 * suite touches the clock (section 5). A reference entry's tempo, and a completed review, are
 * set over `review-schedule`'s own surface on a body this suite saves to the folder, as section
 * 5 says, because no screen of this contract offers either.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as views from '../contract.js';
import * as registry from '../../registry/contract.js';
import * as reviewSchedule from '../../review-schedule/contract.js';
import * as referenceRegister from '../../reference-register/contract.js';
import * as schema from '../../../baseline/schema.js';
import {
  MemoryFolder, buildWorld, byId, clockOn, day, everywhere, expectScreen, filesOf, heldBody, inBrowser, incomingFile, loaded, noMessages,
  newEntry, plain, platformName, reviewsOf, saveBody, scheduleActOf, selectedApp, step, toAssessment, toHazard, toHazards, toPlatform,
  withoutMessages,
} from './harness.js';

/**
 * The schedule of `reviews.schedules` for a ref, or null.
 * @param {any} reviews
 * @param {{ kind: string, id: string }} ref
 */
function scheduleFor(reviews, ref) {
  return reviews.schedules.find((/** @type {any} */ s) => s.ref.kind === ref.kind && s.ref.id === ref.id) ?? null;
}

/**
 * Whether `reviews.overdue` flags a ref.
 * @param {any} reviews
 * @param {{ kind: string, id: string }} ref
 */
function flagged(reviews, ref) {
  return reviews.overdue.some((/** @type {any} */ s) => s.ref.kind === ref.kind && s.ref.id === ref.id);
}

/**
 * Create a reference entry from the hazards screen and come back to the references screen;
 * the entry created.
 * @param {any} app
 * @param {any} fields
 * @returns {Promise<any>}
 */
async function createEntry(app, fields) {
  if (app.screen.kind !== 'references') await step(app, views.openReferences(app), 'references');
  const before = app.screen.entries.map((/** @type {any} */ e) => e.id);
  const screen = await step(app, views.createReference(app, fields), 'references');
  const added = screen.entries.filter((/** @type {any} */ e) => !before.includes(e.id));
  assert.equal(added.length, 1, 'one entry created');
  return added[0];
}

// ------------------------------------------------------------------ C-031 the review standing on every screen

test('with the clock fixed on the due date nothing is overdue, and the day after a hazard, a control, and a platform are each flagged in the reviews of every screen that carries them, each exactly the two review-schedule lists of that body (C-031; SL-06 criterion 4)', () => inBrowser(async (env) => {
  clockOn('2026-10-01');
  const w = await buildWorld(env);
  const ref = { kind: 'hazard', id: w.hazards.bird };
  const refs = [ref, { kind: 'control', id: w.controls.radar }, { kind: 'platform', id: w.platforms.alpha }];
  await toHazard(w.app, w.hazards.bird);
  await step(w.app, views.setReviewTempo(w.app, /** @type {any} */ ({ ref, tempoMonths: 6, nextDueAest: day('2026-10-01') })), 'hazard');
  await toHazards(w.app);
  await step(w.app, views.openControls(w.app), 'controls');
  await step(w.app, views.setReviewTempo(w.app, /** @type {any} */ ({ ref: refs[1], tempoMonths: 3, nextDueAest: day('2026-10-01') })), 'controls');
  await toHazards(w.app);
  await step(w.app, views.openPlatforms(w.app), 'platforms');
  await step(w.app, views.setReviewTempo(w.app, /** @type {any} */ ({ ref: refs[2], tempoMonths: 12, nextDueAest: day('2026-10-01') })), 'platforms');
  await toHazards(w.app);
  await step(w.app, views.openReports(w.app), 'reports');
  await step(w.app, views.createTemplate(w.app, /** @type {any} */ ({ name: 'Safety case', title: 'Hazard log', sections: [{ sectionKind: 'hazards' }] })), 'reports');
  await toHazards(w.app);
  await step(w.app, views.save(w.app), 'hazards');

  /**
   * Every screen of C-031 the world reaches, each checked against the body it is built from.
   * @param {boolean} overdue
   */
  const visitAll = async (overdue) => {
    const body = await heldBody(env, w.folder);
    const expected = await reviewsOf(body);
    assert.equal(flagged(expected, ref), overdue, `review-schedule flags the hazard: ${overdue}`);
    /** @type {any[]} */
    const seen = [];
    const app = w.app;
    await step(app, views.openControls(app), 'controls');
    seen.push(await step(app, views.back(app), 'hazards'));
    seen.push(await toHazard(app, w.hazards.bird)); await toHazards(app);
    seen.push(await step(app, views.openControls(app), 'controls')); await toHazards(app);
    seen.push(await step(app, views.openPlatforms(app), 'platforms'));
    seen.push(expectScreen(app, await views.openPlatform(app, /** @type {any} */ (w.platforms.alpha)), 'platform'));
    seen.push(await step(app, views.openAssessment(app, /** @type {any} */ (w.hazards.bird)), 'assessment'));
    seen.push(await step(app, views.openBowtie(app), 'bowtie')); await toHazards(app);
    seen.push(await step(app, views.openAcknowledgements(app), 'acknowledge')); await toHazards(app);
    seen.push(await step(app, views.openReferences(app), 'references')); await toHazards(app);
    seen.push(await step(app, views.openWorkflows(app), 'workflows')); await toHazards(app);
    const reports = await step(app, views.openReports(app), 'reports');
    seen.push(reports);
    seen.push(expectScreen(app, await views.beginReport(app, /** @type {any} */ ({ templateId: reports.templates[0].id, platformId: w.platforms.alpha })), 'prepare-report'));
    await toHazards(app);
    seen.push(await step(app, views.openFilter(app), 'filter')); await toHazards(app);
    seen.push(await step(app, views.openDashboard(app), 'dashboard')); await toHazards(app);
    seen.push(await step(app, views.openOpenItems(app), 'open-items')); await toHazards(app);
    await toHazard(app, w.hazards.fire);
    seen.push(await step(app, views.renameHazard(app, { title: 'Gated' }), 'confirm-edit'));
    await step(app, views.cancelEdit(app), 'hazard'); await toHazards(app);
    for (const s of seen) {
      assert.deepEqual(s.reviews, expected, `the ${s.kind} screen carries exactly the two lists of its body`);
      for (const r of refs) assert.equal(flagged(s.reviews, r), overdue, `the ${s.kind} screen flags the ${r.kind}: ${overdue}`);
    }
    assert.deepEqual(scheduleFor(expected, ref).nextDueAest, '2026-10-01');
  };

  await visitAll(false);
  clockOn('2026-10-02');
  await visitAll(true);
  clockOn('2026-09-30');
  await visitAll(false);
}));

test('the screens that show no record carry no reviews: folder, check, profile, restore, history, and report (C-031)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const app = await views.start();
  assert.equal('reviews' in app.screen, false, 'folder');
  await views.openFolder(app, w.folder.handle);
  assert.equal('reviews' in app.screen, false, 'profile');
  await step(w.app, views.beginRestore(w.app), 'restore');
  assert.equal('reviews' in w.app.screen, false, 'restore');
  await step(w.app, views.cancelRestore(w.app), 'hazards');
  await step(w.app, views.openHistory(w.app), 'history');
  assert.equal('reviews' in w.app.screen, false, 'history');
  await toHazards(w.app);
  await step(w.app, views.openReports(w.app), 'reports');
  await step(w.app, views.createTemplate(w.app, /** @type {any} */ ({ name: 'T', title: 'T', sections: [{ sectionKind: 'hazards' }] })), 'reports');
  const reports = /** @type {any} */ (w.app.screen);
  expectScreen(w.app, await views.beginReport(w.app, /** @type {any} */ ({ templateId: reports.templates[0].id, platformId: w.platforms.bravo })), 'prepare-report');
  const report = expectScreen(w.app, await views.produceReport(w.app, []), 'report');
  assert.equal('reviews' in report, false, 'report');
}));

test('a body in which no tempo has been set carries reviews with both lists empty, never null (C-031)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  assert.deepEqual(/** @type {any} */ (w.app.screen).reviews, { schedules: [], overdue: [] });
}));

test('a reference entry scheduled over review-schedule\'s own surface is flagged overdue on both register screens exactly when review-schedule flags it (C-031; REQ-023\'s reference-document half)', () => inBrowser(async (env) => {
  clockOn('2026-10-01');
  const w = await buildWorld(env);
  const entry = await createEntry(w.app, { name: 'Maintenance manual', link: null, path: null, file: null });
  await toHazards(w.app);
  await step(w.app, views.save(w.app), 'hazards');
  const { body } = await loaded(w.folder);
  const ref = { kind: 'reference-entry', id: entry.id };
  const scheduled = (await reviewSchedule.setSchedule(body, await scheduleActOf(body, w.alice, /** @type {any} */ (ref)), /** @type {any} */ ({ ref, tempoMonths: 12, nextDueAest: day('2026-10-01') }))).body;
  await saveBody(w.folder, w.alice, scheduled);

  for (const [date, overdue] of [['2026-10-01', false], ['2026-10-02', true]]) {
    clockOn(/** @type {string} */ (date));
    const app = await selectedApp(w.folder, 'Alice');
    const register = await step(app, views.openReferences(app), 'references');
    assert.deepEqual(register.reviews, await reviewsOf(scheduled));
    assert.equal(flagged(register.reviews, ref), overdue, `the register on ${date}`);
    assert.equal(scheduleFor(register.reviews, ref).tempoMonths, 12);
    const own = await step(app, views.openReference(app, entry.id), 'reference');
    assert.equal(flagged(own.reviews, ref), overdue, `the entry's own screen on ${date}`);
  }
}));

// ------------------------------------------------------------------ C-032 setting a tempo

test('setReviewTempo on each of its three screens sets one schedule for the record named with the tempo and due date given, leaves every other schedule and every other field of the screen as it was, and is carried by a save (C-032)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  /** @type {[string, () => Promise<any>, { kind: string, id: string }, string][]} */
  const cases = [
    ['hazard', () => toHazard(w.app, w.hazards.bird), { kind: 'hazard', id: w.hazards.bird }, '2027-01-15'],
    ['controls', () => step(w.app, views.openControls(w.app), 'controls'), { kind: 'control', id: w.controls.radar }, '2027-02-28'],
    ['platforms', () => step(w.app, views.openPlatforms(w.app), 'platforms'), { kind: 'platform', id: w.platforms.alpha }, '2027-03-31'],
  ];
  for (const [kind, open, ref, due] of cases) {
    const before = await open();
    const prior = await heldBody(env, w.folder);
    const screen = await step(w.app, views.setReviewTempo(w.app, /** @type {any} */ ({ ref, tempoMonths: 3, nextDueAest: day(due) })), /** @type {any} */ (kind));
    const schedule = scheduleFor(screen.reviews, ref);
    assert.ok(schedule, `${kind}: one schedule for the record`);
    assert.equal(schedule.tempoMonths, 3);
    assert.equal(schedule.nextDueAest, due);
    assert.equal(schedule.lastReviewedAest, null, 'setting a tempo sets no last reviewed date');
    assert.equal(screen.reviews.schedules.filter((/** @type {any} */ s) => s.ref.kind === ref.kind && s.ref.id === ref.id).length, 1);
    const others = screen.reviews.schedules.filter((/** @type {any} */ s) => !(s.ref.kind === ref.kind && s.ref.id === ref.id));
    assert.deepEqual(others, before.reviews.schedules, `${kind}: every other schedule as it was`);
    const { reviews: _a, ...rest } = withoutMessages(screen);
    const { reviews: _b, ...restBefore } = withoutMessages(before);
    assert.deepEqual(rest, restBefore, `${kind}: every other field of the screen as it was`);
    const body = await heldBody(env, w.folder);
    assert.deepEqual(screen.reviews, await reviewsOf(body), `${kind}: the body told to store`);
    const entry = await newEntry(prior, body);
    assert.equal(entry.madeForPlatformId, null, `${kind}: none of the three screens holds a platform`);
    assert.deepEqual(entry.affectedPlatformIds, plain(await registry.platformsAffected(body, /** @type {any} */ (ref))), `${kind}: the act reaches exactly what platformsAffected gave`);
    await toHazards(w.app);
  }
  await step(w.app, views.save(w.app), 'hazards');
  const other = await selectedApp(w.folder, 'Alice');
  assert.deepEqual(/** @type {any} */ (other.screen).reviews, /** @type {any} */ (w.app.screen).reviews, 'the same tempos and due dates after a save and a load');
}));

test('setReviewTempo for a hazard on two platforms is gated: the confirm-edit screen lists them with the fields pending untouched, and confirmEdit sets the schedule whose entry reaches exactly those platforms (C-032, C-027, C-026)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const ref = { kind: 'hazard', id: w.hazards.fire };
  await toHazard(w.app, w.hazards.fire);
  const fields = { ref, tempoMonths: 1, nextDueAest: day('2026-12-01') };
  const before = everywhere(w.folder, env);
  const gate = await step(w.app, views.setReviewTempo(w.app, /** @type {any} */ (fields)), 'confirm-edit');
  assert.deepEqual(gate.editing, { operation: 'setReviewTempo', fields });
  const body = await heldBody(env, w.folder);
  const ids = plain(await registry.platformsAffected(body, /** @type {any} */ (ref)));
  const affected = [];
  for (const id of ids) affected.push({ id, name: await platformName(body, id) });
  assert.deepEqual(gate.affected, affected);
  assert.deepEqual(everywhere(w.folder, env), before, 'nothing written while the list is shown');

  const screen = await step(w.app, views.confirmEdit(w.app), 'hazard');
  assert.equal(scheduleFor(screen.reviews, ref).tempoMonths, 1);
  const entry = await newEntry(body, await heldBody(env, w.folder));
  assert.deepEqual(entry.affectedPlatformIds, ids, 'the ScheduleAct carried exactly the list shown');
}));

test('a platform\'s tempo is never gated, and the platforms screen never leads to the confirm-edit screen (C-032, C-027)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await step(w.app, views.openPlatforms(w.app), 'platforms');
  for (const id of Object.values(w.platforms)) {
    await step(w.app, views.setReviewTempo(w.app, /** @type {any} */ ({ ref: { kind: 'platform', id }, tempoMonths: 24, nextDueAest: day('2028-01-01') })), 'platforms');
  }
}));

test('editing, rating, confirming, excluding, retiring, saving, and setting a tempo leave a record\'s last reviewed date as it was; a review completed over review-schedule\'s surface is shown as it set it (C-032; SL-06 criterion 3)', () => inBrowser(async (env) => {
  clockOn('2026-09-20');
  const w = await buildWorld(env);
  await toHazard(w.app, w.hazards.bird);
  const ref = { kind: 'hazard', id: w.hazards.bird };
  await step(w.app, views.setReviewTempo(w.app, /** @type {any} */ ({ ref, tempoMonths: 6, nextDueAest: day('2026-10-01') })), 'hazard');
  await toHazards(w.app);
  await step(w.app, views.save(w.app), 'hazards');
  const { body } = await loaded(w.folder);
  const reviewed = (await reviewSchedule.completeReview(body, await scheduleActOf(body, w.alice, /** @type {any} */ (ref)), /** @type {any} */ (ref))).body;
  await saveBody(w.folder, w.alice, reviewed);
  const lastReviewed = plain(await reviewSchedule.getSchedule(reviewed, /** @type {any} */ (ref))).lastReviewedAest;
  assert.equal(lastReviewed, '2026-09-20');

  clockOn('2026-09-25');
  const app = await selectedApp(w.folder, 'Alice');
  assert.equal(scheduleFor(/** @type {any} */ (app.screen).reviews, ref).lastReviewedAest, lastReviewed, 'shown as completed');
  await toHazard(app, w.hazards.bird);
  await step(app, views.renameHazard(app, { title: 'Bird strike, edited' }), 'hazard');
  await step(app, views.addCausalFactor(app, { text: 'Gulls' }), 'hazard');
  await step(app, views.setReviewTempo(app, /** @type {any} */ ({ ref, tempoMonths: 9, nextDueAest: day('2027-01-01') })), 'hazard');
  await toHazards(app);
  await toAssessment(app, w.platforms.alpha, w.hazards.bird);
  await step(app, views.enterRating(app, 'residual', /** @type {any} */ ({ consequence: 1, likelihood: 'E' })), 'assessment');
  await step(app, views.confirmControlForPlatform(app, /** @type {any} */ (w.controls.radar)), 'assessment');
  await step(app, views.excludeControlFromPlatform(app, /** @type {any} */ (w.controls.radar), 'Not carried'), 'assessment');
  await toHazards(app);
  const saved = await step(app, views.save(app), 'hazards');
  assert.equal(scheduleFor(saved.reviews, ref).lastReviewedAest, lastReviewed, 'no edit set it');
  assert.equal(plain(await reviewSchedule.getSchedule(await heldBody(env, w.folder), /** @type {any} */ (ref))).lastReviewedAest, lastReviewed);
}));

// ------------------------------------------------------------------ C-033 the register

test('openReferences on a body with no entries shows entries and files both empty, the review standing, and no message; nothing written (C-033, C-035)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const before = everywhere(w.folder, env);
  const screen = await step(w.app, views.openReferences(w.app), 'references');
  assert.deepEqual(screen.entries, []);
  assert.deepEqual(screen.files, []);
  assert.deepEqual(screen.reviews, await reviewsOf(await heldBody(env, w.folder)));
  assert.deepEqual(everywhere(w.folder, env), before);
}));

test('createReference with any one of a name, a link, a path, and a file, or all four, shows the entry back with the values given trimmed and null where null was given; the register lists it with the entries before, in listEntries\' order (C-033; SL-10 criterion 1)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const bytes = Uint8Array.from([0, 1, 2, 254, 255]);
  /** @type {[string, any, any][]} */
  const cases = [
    ['a name alone', { name: '  Flight manual ', link: null, path: null, file: null }, { name: 'Flight manual', link: null, path: null }],
    ['a link alone', { name: null, link: ' https://example.test/amm ', path: null, file: null }, { name: null, link: 'https://example.test/amm', path: null }],
    ['a path alone', { name: null, link: null, path: ' S:\\Engineering\\SMS\\log.xlsx ', file: null }, { name: null, link: null, path: 'S:\\Engineering\\SMS\\log.xlsx' }],
    ['a file alone', { name: null, link: null, path: null, file: incomingFile('drawing.pdf', bytes) }, { name: null, link: null, path: null }],
    ['all four', { name: 'Everything', link: 'https://example.test/x', path: 'C:\\x', file: incomingFile('all.bin', bytes) }, { name: 'Everything', link: 'https://example.test/x', path: 'C:\\x' }],
  ];
  await step(w.app, views.openReferences(w.app), 'references');
  for (const [label, fields, shown] of cases) {
    const listed = plain(/** @type {any} */ (w.app.screen).entries);
    const filesBefore = w.folder.listUnder(schema.DATA_FOLDER.files);
    const prior = await heldBody(env, w.folder);
    const entry = await createEntry(w.app, fields);
    const screen = /** @type {any} */ (w.app.screen);
    // entries made in one second are ordered by a fresh id, which a test must not assume (DEC-005); the order is listEntries' below
    assert.deepEqual(screen.entries.filter((/** @type {any} */ e) => e.id !== entry.id), listed, `${label}: the entries before are kept`);
    assert.deepEqual({ name: entry.name, link: entry.link, path: entry.path }, shown, `${label}: shown back as given`);
    const body = await heldBody(env, w.folder);
    assert.deepEqual(screen.entries, plain(await referenceRegister.listEntries(body)), `${label}: the register is listEntries of the body told to store`);
    assert.deepEqual(screen.files, await filesOf(body, w.folder), `${label}: files is checkEntryFiles of that body and folder`);
    if (fields.file === null) {
      assert.equal(entry.fileLocation, null, `${label}: no file, no location`);
      assert.deepEqual(w.folder.listUnder(schema.DATA_FOLDER.files), filesBefore, `${label}: nothing written under files/`);
    } else {
      assert.equal(typeof entry.fileLocation, 'string');
      assert.deepEqual(w.folder.readBytes(entry.fileLocation), bytes, `${label}: the file kept whole where the entry says`);
      assert.deepEqual(Object.keys(entry).sort(), Object.keys(/** @type {any} */ (body.collections['reference-entry'])[entry.id]).sort(), `${label}: the entry on the screen is the record as stored, and nothing of the file but its location`);
      const stored = /** @type {any} */ (body.collections['reference-entry'])[entry.id];
      assert.deepEqual(Object.keys(stored).filter((k) => !['id', 'kind', 'status', 'createdBy', 'createdAtAest', 'updatedBy', 'updatedAtAest', 'name', 'link', 'path', 'fileLocation', 'links'].includes(k)), [], `${label}: the stored record holds no file contents (SL-10 criterion 2)`);
    }
    const act = await newEntry(prior, body);
    assert.equal(act.madeForPlatformId, null, `${label}: the register holds no platform`);
    assert.deepEqual(act.affectedPlatformIds, [], `${label}: a new entry has no links and reaches no platform`);
  }
}));

test('createReference is not idempotent: two calls with equal fields give two entries and, with a file, two locations (C-033, section 5 idempotency)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const fields = { name: 'Twice', link: null, path: null, file: incomingFile('twice.txt', [1, 2, 3]) };
  const a = await createEntry(w.app, fields);
  const b = await createEntry(w.app, fields);
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.fileLocation, b.fileLocation);
}));

// ------------------------------------------------------------------ C-034 an entry's own screen

test('openReference shows the entry as getEntry gives it, one linked record per ref with the name the live lists give, the three pickers less what it links, its file standing and review standing (C-034, C-035)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const entry = await createEntry(w.app, { name: 'Checklist', link: null, path: null, file: null });
  await step(w.app, views.openReference(w.app, entry.id), 'reference');
  await step(w.app, views.linkReference(w.app, /** @type {any} */ ({ kind: 'hazard', id: w.hazards.bird })), 'reference');
  await step(w.app, views.linkReference(w.app, /** @type {any} */ ({ kind: 'control', id: w.controls.radar })), 'reference');
  await step(w.app, views.linkReference(w.app, /** @type {any} */ ({ kind: 'platform', id: w.platforms.alpha })), 'reference');
  await step(w.app, views.back(w.app), 'references');
  const before = everywhere(w.folder, env);

  const screen = await step(w.app, views.openReference(w.app, entry.id), 'reference');
  const body = await heldBody(env, w.folder);
  const stored = plain(await referenceRegister.getEntry(body, entry.id));
  assert.deepEqual(screen.entry, stored);
  const hazards = plain(await registry.listHazards(body));
  const controls = plain(await registry.listControls(body));
  const platforms = plain(await registry.listPlatforms(body));
  const nameOf = (/** @type {any} */ ref) => (ref.kind === 'hazard' ? hazards.find((/** @type {any} */ h) => h.id === ref.id)?.title
    : ref.kind === 'control' ? controls.find((/** @type {any} */ c) => c.id === ref.id)?.title
      : ref.kind === 'platform' ? platforms.find((/** @type {any} */ p) => p.id === ref.id)?.name : null) ?? null;
  assert.deepEqual(screen.links, stored.links.map((/** @type {any} */ ref) => ({ ref, name: nameOf(ref) })), 'every ref, in the entry\'s order, named');
  assert.deepEqual(screen.links.map((/** @type {any} */ l) => l.name).sort(), ['Alpha', 'Bird strike', 'Weather radar']);
  const named = (/** @type {string} */ kind) => stored.links.filter((/** @type {any} */ r) => r.kind === kind).map((/** @type {any} */ r) => r.id);
  assert.deepEqual(screen.linkableHazards, hazards.filter((/** @type {any} */ h) => !named('hazard').includes(h.id)));
  assert.deepEqual(screen.linkableControls, controls.filter((/** @type {any} */ c) => !named('control').includes(c.id)));
  assert.deepEqual(screen.linkablePlatforms, platforms.filter((/** @type {any} */ p) => !named('platform').includes(p.id)));
  assert.deepEqual(screen.files, await filesOf(body, w.folder));
  assert.deepEqual(screen.reviews, await reviewsOf(body));
  assert.deepEqual(everywhere(w.folder, env), before, 'nothing written');
}));

test('linkReference adds exactly the one ref to the entry\'s links, takes that record off its picker, leaves the entry\'s own fields and the linked record\'s screens as they were, and the act reaches the union of platformsAffected over the links (C-034, C-026)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const entry = await createEntry(w.app, { name: 'Bulletin', link: 'https://example.test/sb', path: null, file: null });
  await toHazards(w.app); // createEntry ends on the references screen, which offers no openHazard (C-002)
  const birdDetail = plain(await toHazard(w.app, w.hazards.bird)); await toHazards(w.app);
  const library = plain(await step(w.app, views.openControls(w.app), 'controls')); await toHazards(w.app);
  const platformsScreen = plain(await step(w.app, views.openPlatforms(w.app), 'platforms')); await toHazards(w.app);

  await step(w.app, views.openReferences(w.app), 'references');
  const before = await step(w.app, views.openReference(w.app, entry.id), 'reference');
  let prior = await heldBody(env, w.folder);
  const linkedBird = await step(w.app, views.linkReference(w.app, /** @type {any} */ ({ kind: 'hazard', id: w.hazards.bird })), 'reference');
  assert.deepEqual(linkedBird.links, [{ ref: { kind: 'hazard', id: w.hazards.bird }, name: 'Bird strike' }]);
  assert.equal(linkedBird.linkableHazards.some((/** @type {any} */ h) => h.id === w.hazards.bird), false);
  for (const field of ['name', 'link', 'path', 'fileLocation']) assert.deepEqual(linkedBird.entry[field], before.entry[field], `${field} unchanged`);
  let body = await heldBody(env, w.folder);
  let act = await newEntry(prior, body);
  assert.deepEqual(act.affectedPlatformIds, plain(await registry.platformsAffected(body, /** @type {any} */ ({ kind: 'hazard', id: w.hazards.bird }))), 'the union over the one link');
  assert.equal(act.madeForPlatformId, null);

  prior = body;
  const linkedControl = await step(w.app, views.linkReference(w.app, /** @type {any} */ ({ kind: 'control', id: w.controls.radar })), 'reference');
  assert.equal(linkedControl.links.length, 2);
  body = await heldBody(env, w.folder);
  assert.deepEqual((await newEntry(prior, body)).affectedPlatformIds, [w.platforms.alpha], 'the union of alpha and alpha is alpha, once');

  const union = [w.platforms.alpha, w.platforms.bravo].sort();
  prior = body;
  const gate = await step(w.app, views.linkReference(w.app, /** @type {any} */ ({ kind: 'platform', id: w.platforms.bravo })), 'confirm-edit');
  assert.deepEqual(gate.affected.map((/** @type {any} */ a) => a.id), union, 'a link that makes the union two platforms is gated on the union after the act');
  const linkedPlatform = await step(w.app, views.confirmEdit(w.app), 'reference');
  assert.equal(linkedPlatform.links.length, 3);
  body = await heldBody(env, w.folder);
  act = await newEntry(prior, body);
  assert.deepEqual(act.affectedPlatformIds, union, 'the union over every link the entry holds, ascending, each once');

  await toHazards(w.app);
  const { messages: _m, platforms: _p, reports: _r, reviews: _v, ...bird } = plain(await toHazard(w.app, w.hazards.bird));
  const { messages: _m2, platforms: _p2, reports: _r2, reviews: _v2, ...birdBefore } = birdDetail;
  assert.deepEqual(bird, birdBefore, 'linking copies nothing onto the hazard');
  await toHazards(w.app);
  assert.deepEqual(plain(await step(w.app, views.openControls(w.app), 'controls')).controls, library.controls);
  await toHazards(w.app);
  assert.deepEqual(plain(await step(w.app, views.openPlatforms(w.app), 'platforms')).platforms, platformsScreen.platforms);

  await toHazards(w.app);
  await toHazard(w.app, w.hazards.bird);
  await step(w.app, views.renameHazard(w.app, { title: 'Bird strike, renamed' }), 'hazard');
  await toHazards(w.app);
  await step(w.app, views.openReferences(w.app), 'references');
  const renamed = await step(w.app, views.openReference(w.app, entry.id), 'reference');
  assert.equal(renamed.links.find((/** @type {any} */ l) => l.ref.kind === 'hazard').name, 'Bird strike, renamed', 'the name is read from the one record');
}));

test('linkReference to a hazard on two platforms is gated with the entry and the ref pending; confirmEdit links it and the entry reaches the union the screen listed (C-034, C-027)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const entry = await createEntry(w.app, { name: 'Fire procedure', link: null, path: null, file: null });
  const own = await step(w.app, views.openReference(w.app, entry.id), 'reference');
  const ref = { kind: 'hazard', id: w.hazards.fire };
  const before = everywhere(w.folder, env);
  const gate = await step(w.app, views.linkReference(w.app, /** @type {any} */ (ref)), 'confirm-edit');
  assert.deepEqual(gate.editing, { operation: 'linkReference', entry: own.entry, ref });
  assert.equal('files' in gate, false, 'the confirm-edit screen carries no files');
  assert.deepEqual(gate.affected.map((/** @type {any} */ a) => a.id), [w.platforms.alpha, w.platforms.bravo].sort());
  assert.deepEqual(everywhere(w.folder, env), before);
  const prior = await heldBody(env, w.folder);
  const screen = await step(w.app, views.confirmEdit(w.app), 'reference');
  assert.deepEqual(screen.links.map((/** @type {any} */ l) => l.ref), [ref]);
  assert.deepEqual((await newEntry(prior, await heldBody(env, w.folder))).affectedPlatformIds, gate.affected.map((/** @type {any} */ a) => a.id));
}));

test('a linked record no longer live keeps its ref on the entry\'s screen with a null name, never dropped (C-034)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const entry = await createEntry(w.app, { name: 'Brake wear limits', link: null, path: null, file: null });
  await step(w.app, views.openReference(w.app, entry.id), 'reference');
  await step(w.app, views.linkReference(w.app, /** @type {any} */ ({ kind: 'hazard', id: w.hazards.brakes })), 'reference');
  await toHazards(w.app);
  await toHazard(w.app, w.hazards.brakes);
  await step(w.app, views.retireHazard(w.app), 'hazards');
  await step(w.app, views.openReferences(w.app), 'references');
  const screen = await step(w.app, views.openReference(w.app, entry.id), 'reference');
  assert.deepEqual(screen.links, [{ ref: { kind: 'hazard', id: w.hazards.brakes }, name: null }]);
}));

// ------------------------------------------------------------------ C-035 file standing

test('an entry whose stored file is removed from the folder is flagged on both register screens, one whose file is there is not, one with no file is unflagged with no reason, and a file put back is unflagged on the next screen (C-035; SL-10 criterion 4)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const withFile = await createEntry(w.app, { name: 'Has a file', link: null, path: null, file: incomingFile('a.pdf', [7, 7, 7]) });
  const kept = await createEntry(w.app, { name: 'Keeps its file', link: null, path: null, file: incomingFile('b.pdf', [8]) });
  const noFile = await createEntry(w.app, { name: 'No file', link: null, path: null, file: null });
  const bytes = /** @type {Uint8Array} */ (w.folder.readBytes(withFile.fileLocation));

  const standing = (/** @type {any} */ screen, /** @type {string} */ id) => byId(screen.files.map((/** @type {any} */ f) => ({ ...f, id: f.entryId })), id);
  let register = await step(w.app, views.back(w.app).then(() => views.openReferences(w.app)), 'references');
  assert.deepEqual([standing(register, withFile.id).flagged, standing(register, kept.id).flagged], [false, false]);
  assert.deepEqual([standing(register, noFile.id).flagged, standing(register, noFile.id).reason], [false, null]);

  w.folder.remove(withFile.fileLocation);
  const writes = everywhere(w.folder, env);
  await toHazards(w.app);
  register = await step(w.app, views.openReferences(w.app), 'references');
  const body = await heldBody(env, w.folder);
  assert.deepEqual(register.files, await filesOf(body, w.folder), 'exactly checkEntryFiles of that body and folder');
  assert.equal(standing(register, withFile.id).flagged, true, 'flagged on the register');
  assert.equal(standing(register, withFile.id).reason, 'missing');
  assert.equal(standing(register, kept.id).flagged, false, 'the other entry is not');
  const own = await step(w.app, views.openReference(w.app, withFile.id), 'reference');
  assert.equal(standing(own, withFile.id).flagged, true, 'flagged on its own screen');
  assert.deepEqual(everywhere(w.folder, env), writes, 'checking the files wrote nothing');

  w.folder.writeBytes(withFile.fileLocation, bytes);
  await step(w.app, views.back(w.app), 'references');
  assert.equal(standing(w.app.screen, withFile.id).flagged, false, 'put back by hand: unflagged on the next screen');
}));
