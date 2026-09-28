/**
 * views conformance: operations of the record screens (CORE-CON-002). The happy path of the
 * hazard, controls, platforms, platform, assessment, confirm-edit, history, and acknowledgement
 * screens, from C-015 to C-030 of modules/views/CONTRACT.md (SL-03, SL-04, SL-05), each screen
 * compared with what `registry`, `rating`, `profiles`, and `change-log` give for the body it is
 * built from. Written from the contract before any implementation (P8).
 *
 * C-019 and C-025 say a hazard's own screen is deep-equal to what it was after a link or a
 * confirmation; at 10.0 C-044 gave that screen `platforms`, which those acts change. The suite
 * asserts C-016's fields of the screen and records the contradiction in trace/findings.yaml.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as views from '../contract.js';
import * as registry from '../../registry/contract.js';
import * as rating from '../../rating/contract.js';
import * as changeLog from '../../change-log/contract.js';
import {
  actOf, addControls, buildWorld, byId, controlIn, everywhere, expectScreen, heldBody, inBrowser, keyOf, listedProfiles, loaded,
  malformed, newEntry, noMessages, plain, plantData, platformName, platformView, rejectionOf, reviewsOf, selectedApp, step, toAssessment,
  toHazard, toHazards, toPlatform, withoutMessages,
} from './harness.js';

/**
 * The fields C-016 gives a hazard screen, without C-044's two and without messages.
 * @param {any} screen
 */
function detailFields(screen) {
  const { hazard, causalFactors, consequences, controls, linkableControls } = plain(screen);
  return { hazard, causalFactors, consequences, controls, linkableControls };
}

// ------------------------------------------------------------------ C-015 navigation

test('every edge of C-015 leads from the hazards screen and back along the same edge, writing nothing and saying nothing, and back rebuilds each screen from the working body (C-015)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const { app, folder } = w;
  const before = everywhere(folder, env);

  /** @type {[() => Promise<any>, string, string][]} */
  const edges = [
    [() => views.openHazard(app, /** @type {any} */ (w.hazards.brakes)), 'hazard', 'hazards'],
    [() => views.openControls(app), 'controls', 'hazards'],
    [() => views.openPlatforms(app), 'platforms', 'hazards'],
    [() => views.openHistory(app), 'history', 'hazards'],
    [() => views.openAcknowledgements(app), 'acknowledge', 'hazards'],
    [() => views.openReferences(app), 'references', 'hazards'],
    [() => views.openWorkflows(app), 'workflows', 'hazards'],
    [() => views.openReports(app), 'reports', 'hazards'],
    [() => views.openFilter(app), 'filter', 'hazards'],
    [() => views.openDashboard(app), 'dashboard', 'hazards'],
    [() => views.openOpenItems(app), 'open-items', 'hazards'],
  ];
  const hazards = plain(app.screen);
  for (const [open, kind, backTo] of edges) {
    await step(app, open(), /** @type {any} */ (kind));
    const returned = await step(app, views.back(app), /** @type {any} */ (backTo));
    assert.deepEqual(returned, hazards, `back from ${kind} rebuilds the hazards screen as it was`);
  }

  await step(app, views.openPlatforms(app), 'platforms');
  const platforms = plain(app.screen);
  expectScreen(app, await views.openPlatform(app, /** @type {any} */ (w.platforms.alpha)), 'platform');
  const platform = plain(app.screen);
  await step(app, views.openAssessment(app, /** @type {any} */ (w.hazards.fire)), 'assessment');
  const assessment = plain(app.screen);
  await step(app, views.openBowtie(app), 'bowtie');
  assert.deepEqual(await step(app, views.back(app), 'assessment'), assessment, 'bow-tie back to its assessment');
  assert.deepEqual(expectScreen(app, await views.back(app), 'platform'), platform, 'assessment back to its platform');
  assert.deepEqual(await step(app, views.back(app), 'platforms'), platforms, 'platform back to platforms');
  assert.deepEqual(await step(app, views.back(app), 'hazards'), hazards, 'platforms back to hazards');
  assert.deepEqual(everywhere(folder, env), before, 'no navigation wrote anything anywhere');
}));

test('a change made on one screen is on every screen built after it, and the hazards screen back resolves with is unsaved when any screen changed the body since the last save (C-015)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const { app } = w;
  assert.equal(/** @type {any} */ (app.screen).unsaved, false);

  await toPlatform(app, w.platforms.alpha);
  await step(app, views.openAssessment(app, /** @type {any} */ (w.hazards.bird)), 'assessment');
  await step(app, views.enterRating(app, 'residual', /** @type {any} */ ({ consequence: 3, likelihood: 'C' })), 'assessment');
  const platform = expectScreen(app, await views.back(app), 'platform');
  assert.deepEqual(byId(platform.rows.map((/** @type {any} */ r) => ({ ...r, id: r.hazard.id })), w.hazards.bird).residual, { consequence: 3, likelihood: 'C' }, 'the platform screen built after shows the rating');
  await views.back(app);
  const hazards = await step(app, views.back(app), 'hazards');
  assert.equal(hazards.unsaved, true, 'a change on the assessment screen makes the hazards screen unsaved');
  assert.deepEqual(hazards.lastSave, (await loaded(w.folder)).lastSave, 'lastSave unchanged');

  await step(app, views.save(app), 'hazards');
  await step(app, views.openHistory(app), 'history');
  assert.equal((await step(app, views.back(app), 'hazards')).unsaved, false, 'nothing changed since the save');

  await toHazard(app, w.hazards.brakes);
  const first = plain(app.screen);
  await toHazards(app);
  await step(app, views.addHazard(app, { title: 'Later' }), 'hazards');
  await toHazard(app, w.hazards.brakes);
  assert.deepEqual(detailFields(app.screen), detailFields(first), 'a second openHazard is a fresh read of the same hazard');
}));

// ------------------------------------------------------------------ C-016 a hazard's screen

test('openHazard shows exactly getHazardDetail\'s hazard, causal factors, consequences, and controls, the live library less the hazard\'s controls as linkableControls, the review standing, and no message (C-016, C-031)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const body = await heldBody(env, w.folder);
  for (const id of Object.values(w.hazards)) {
    const screen = await toHazard(w.app, id);
    const detail = plain(await registry.getHazardDetail(body, /** @type {any} */ (id)));
    assert.deepEqual(screen.hazard, detail.hazard);
    assert.deepEqual(screen.causalFactors, detail.causalFactors);
    assert.deepEqual(screen.consequences, detail.consequences);
    assert.deepEqual(screen.controls, detail.controls);
    const mine = detail.controls.map((/** @type {any} */ c) => c.control.id);
    assert.deepEqual(screen.linkableControls, plain(await registry.listControls(body)).filter((/** @type {any} */ c) => !mine.includes(c.id)), 'linkableControls is the library less the hazard\'s own, in its order');
    assert.deepEqual(screen.reviews, await reviewsOf(body));
    await toHazards(w.app);
  }
}));

test('renameHazard on a hazard on one platform or none changes the one record: its title trimmed, its id unchanged, nothing else on the screen, and every platform row shows the new title (C-016, C-019)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const before = await toHazard(w.app, w.hazards.bird);
  const screen = await step(w.app, views.renameHazard(w.app, { title: '  Bird ingestion  ' }), 'hazard');
  assert.equal(screen.hazard.title, 'Bird ingestion');
  assert.equal(screen.hazard.id, w.hazards.bird);
  const body = await heldBody(env, w.folder);
  assert.deepEqual(screen.hazard, plain(await registry.getHazard(body, /** @type {any} */ (w.hazards.bird))), 'the hazard is what registry returned');
  assert.deepEqual({ ...detailFields(screen), hazard: null }, { ...detailFields(before), hazard: null }, 'nothing else changed');

  await toHazards(w.app);
  const platform = await toPlatform(w.app, w.platforms.alpha);
  const row = platform.rows.find((/** @type {any} */ r) => r.hazard.id === w.hazards.bird);
  assert.equal(row.hazard.title, 'Bird ingestion', 'the row reads the one record');
}));

test('addCausalFactor and addConsequence each add one record, last in its list, its text as stored, and tell store (C-016, C-012)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const before = await toHazard(w.app, w.hazards.brakes);
  const cf = await step(w.app, views.addCausalFactor(w.app, { text: '  Worn pads ' }), 'hazard');
  assert.equal(cf.causalFactors.length, before.causalFactors.length + 1);
  assert.equal(cf.causalFactors[cf.causalFactors.length - 1].text, 'Worn pads');
  const co = await step(w.app, views.addConsequence(w.app, { text: 'Runway excursion' }), 'hazard');
  assert.equal(co.consequences[co.consequences.length - 1].text, 'Runway excursion');
  const detail = plain(await registry.getHazardDetail(await heldBody(env, w.folder), /** @type {any} */ (w.hazards.brakes)));
  assert.deepEqual(co.causalFactors, detail.causalFactors, 'the body told to store holds them');
  assert.deepEqual(co.consequences, detail.consequences);
  assert.equal(env.local.mirror()?.unsaved, true);
}));

// ------------------------------------------------------------------ C-017 the control library

test('openControls lists every live control once; createControl adds one with its title trimmed; a control linked to two hazards is one entry in the library, unchanged by the links (C-017)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const opened = await step(w.app, views.openControls(w.app), 'controls');
  const body = await heldBody(env, w.folder);
  assert.deepEqual(opened.controls, plain(await registry.listControls(body)));
  assert.deepEqual(opened.reviews, await reviewsOf(body));
  const created = await step(w.app, views.createControl(w.app, { title: '  Engine monitoring ' }), 'controls');
  assert.equal(created.controls.length, opened.controls.length + 1);
  // controls made in one second are ordered by a fresh id, which a test must not assume (DEC-005): the one added is found by id
  const openedIds = opened.controls.map((/** @type {any} */ c) => c.id);
  const [added] = created.controls.filter((/** @type {any} */ c) => !openedIds.includes(c.id));
  assert.deepEqual(created.controls.filter((/** @type {any} */ c) => c.id !== added.id), opened.controls, 'the list before is kept');
  assert.deepEqual(created.controls, plain(await registry.listControls(await heldBody(env, w.folder))), 'in listControls\' order');
  assert.equal(added.title, 'Engine monitoring');
  await toHazards(w.app);

  const hazard = await toHazard(w.app, w.hazards.brakes);
  assert.ok(hazard.linkableControls.some((/** @type {any} */ c) => c.id === w.controls.bottle));
  const linked = await step(w.app, views.linkControlToHazard(w.app, /** @type {any} */ (w.controls.bottle), 'mitigating'), 'hazard');
  assert.deepEqual(controlIn(linked.controls, w.controls.bottle).controlKind, 'mitigating', 'the control with that kind');
  assert.equal(linked.linkableControls.some((/** @type {any} */ c) => c.id === w.controls.bottle), false, 'no longer linkable');
  await toHazards(w.app);
  const library = await step(w.app, views.openControls(w.app), 'controls');
  assert.equal(library.controls.filter((/** @type {any} */ c) => c.id === w.controls.bottle).length, 1, 'once in the library');
  assert.deepEqual(byId(library.controls, w.controls.bottle), byId(created.controls, w.controls.bottle), 'its library entry is unchanged by linking it to a second hazard');
  assert.equal(JSON.stringify(library.controls).includes(w.hazards.fire), false, 'the library names no hazard');
  assert.equal(JSON.stringify(library.controls).includes(w.platforms.alpha), false, 'and no platform');
}));

// ------------------------------------------------------------------ C-018 platforms and their owners

test('openPlatforms lists the live platforms and every stored profile; createPlatform adds one with its name trimmed and exactly the owner given (C-018)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const opened = await step(w.app, views.openPlatforms(w.app), 'platforms');
  const body = await heldBody(env, w.folder);
  assert.deepEqual(opened.platforms, plain(await registry.listPlatforms(body)));
  assert.deepEqual(opened.profiles, await listedProfiles(w.folder));
  assert.deepEqual(opened.reviews, await reviewsOf(body));
  const created = await step(w.app, views.createPlatform(w.app, /** @type {any} */ ({ name: '  Charlie ', ownerProfileId: w.bob.id })), 'platforms');
  // platforms made in one second are ordered by a fresh id, which a test must not assume (DEC-005): the one added is found by id
  const openedIds = opened.platforms.map((/** @type {any} */ p) => p.id);
  const [added] = created.platforms.filter((/** @type {any} */ p) => !openedIds.includes(p.id));
  assert.equal(created.platforms.length, opened.platforms.length + 1);
  assert.deepEqual(created.platforms.filter((/** @type {any} */ p) => p.id !== added.id), opened.platforms, 'the list before is kept');
  assert.deepEqual(created.platforms, plain(await registry.listPlatforms(await heldBody(env, w.folder))), 'in listPlatforms\' order');
  assert.equal(added.name, 'Charlie');
  assert.equal(added.ownerProfileId, w.bob.id, 'exactly the one owner given');
}));

test('setPlatformOwner changes that platform\'s owner and nothing else: every other platform, the hazards, every hazard\'s detail, and the library are as they were (C-018)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const hazards = plain(w.app.screen);
  const details = [];
  for (const id of Object.values(w.hazards)) { details.push(detailFields(await toHazard(w.app, id))); await toHazards(w.app); }
  const library = plain(await step(w.app, views.openControls(w.app), 'controls'));
  await toHazards(w.app);
  const bravoBefore = await toPlatform(w.app, w.platforms.bravo);
  await toHazards(w.app);

  const before = await step(w.app, views.openPlatforms(w.app), 'platforms');
  const screen = await step(w.app, views.setPlatformOwner(w.app, /** @type {any} */ (w.platforms.alpha), /** @type {any} */ (w.bob.id)), 'platforms');
  const alpha = byId(screen.platforms, w.platforms.alpha);
  assert.equal(alpha.ownerProfileId, w.bob.id);
  const { ownerProfileId: _o, updatedAtAest: _u, updatedBy: _b, ...rest } = byId(before.platforms, w.platforms.alpha);
  const { ownerProfileId: _o2, updatedAtAest: _u2, updatedBy: _b2, ...restAfter } = alpha;
  assert.deepEqual(restAfter, rest, 'every other field of it is as it was but the header stamps');
  assert.deepEqual(byId(screen.platforms, w.platforms.bravo), byId(before.platforms, w.platforms.bravo), 'the other platform is deep-equal');
  assert.deepEqual(screen.profiles, await listedProfiles(w.folder), 'profiles re-read');

  const back = await step(w.app, views.back(w.app), 'hazards');
  assert.deepEqual(back.hazards, hazards.hazards);
  let i = 0;
  for (const id of Object.values(w.hazards)) { assert.deepEqual(detailFields(await toHazard(w.app, id)), details[i], `hazard ${id} detail`); i += 1; await toHazards(w.app); }
  assert.deepEqual(plain(await step(w.app, views.openControls(w.app), 'controls')).controls, library.controls);
  await toHazards(w.app);
  assert.deepEqual(plain((await toPlatform(w.app, w.platforms.bravo)).rows), plain(bravoBefore.rows), 'the other platform\'s screen');
}));

// ------------------------------------------------------------------ C-019 and C-020 a platform's hazards

test('openPlatform shows exactly the one listPlatformHazards: the platform, each row with the band rating gives for its residual, the omitted, and as linkable every live hazard in neither (C-020, C-021)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const body = await heldBody(env, w.folder);
  for (const id of Object.values(w.platforms)) {
    const screen = await toPlatform(w.app, id);
    noMessages(screen);
    const view = await platformView(body, id);
    assert.deepEqual(screen.platform, view.platform);
    assert.deepEqual(screen.rows, view.rows, 'each row unchanged plus residualRating');
    assert.deepEqual(screen.omitted, view.omitted);
    const named = [...view.rows.map((r) => r.hazard.id), ...view.omitted.map((o) => o.id)];
    assert.deepEqual(screen.linkableHazards, plain(await registry.listHazards(body)).filter((/** @type {any} */ h) => !named.includes(h.id)));
    assert.deepEqual(screen.reviews, await reviewsOf(body));
    await toHazards(w.app);
  }
}));

test('linkHazardToPlatform adds one row for the hazard as stored, with its global id as the report id, every control awaiting, and both residual values null; it is no longer linkable, and its detail is as it was (C-019, C-024)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const detail = detailFields(await toHazard(w.app, w.hazards.bird));
  await toHazards(w.app);
  const before = await toPlatform(w.app, w.platforms.bravo);
  const screen = expectScreen(w.app, await views.linkHazardToPlatform(w.app, /** @type {any} */ (w.hazards.bird)), 'platform');
  noMessages(screen);
  assert.equal(screen.rows.length, before.rows.length + 1);
  const row = screen.rows.find((/** @type {any} */ r) => r.hazard.id === w.hazards.bird);
  assert.equal(row.reportId, w.hazards.bird, 'the hazard\'s global id');
  assert.deepEqual(row.residual, { consequence: null, likelihood: null });
  assert.ok(row.controls.length > 0);
  for (const c of row.controls) assert.deepEqual([c.state, c.confirmation, c.justification], ['awaiting', null, null], 'every control awaiting');
  assert.equal(screen.linkableHazards.some((/** @type {any} */ h) => h.id === w.hazards.bird), false);
  assert.deepEqual(screen.rows, (await platformView(await heldBody(env, w.folder), w.platforms.bravo)).rows);
  await toHazards(w.app);
  assert.deepEqual(detailFields(await toHazard(w.app, w.hazards.bird)), detail, 'linking copied nothing: the detail is as it was');
}));

test('a body whose rating record is malformed shows the hazard in omitted, not in rows, with one error naming its id and the omitting record\'s key (C-020; HZ-004)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const body = await heldBody(env, w.folder);
  const key = keyOf(body, 'rating', (r) => r.hazardId === w.hazards.fire && r.stage === 'residual');
  await plantData(w.folder, malformed(body, 'rating', key, (r) => { r.consequence = 9; }), w.alice);

  const app = await selectedApp(w.folder, 'Alice');
  const screen = await toPlatform(app, w.platforms.alpha);
  const view = await platformView((await loaded(w.folder)).body, w.platforms.alpha);
  assert.deepEqual(screen.omitted, view.omitted);
  assert.deepEqual(screen.omitted.map((/** @type {any} */ o) => o.id), [w.hazards.fire]);
  assert.equal(screen.rows.some((/** @type {any} */ r) => r.hazard.id === w.hazards.fire), false, 'never in both');
  assert.equal(screen.messages.length, 1);
  assert.equal(screen.messages[0].severity, 'error');
  assert.ok(screen.messages[0].items.some((/** @type {string} */ i) => i.includes(w.hazards.fire)), 'names the hazard');
  assert.ok(screen.messages[0].items.some((/** @type {string} */ i) => i.includes(view.omitted[0].key)), 'names the record\'s key');
  assert.equal(screen.linkableHazards.some((/** @type {any} */ h) => h.id === w.hazards.fire), false, 'an omitted hazard is not offered to link again');
}));

// ------------------------------------------------------------------ C-021 to C-023 the assessment

test('openAssessment shows the row\'s report id and controls, every stored profile, the two ratings as getRatings gives them, and each band as rating.ratingFor gives it; nothing entered is Uncategorised (C-021, C-022)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const body = await heldBody(env, w.folder);
  for (const [platformId, hazardId] of [[w.platforms.alpha, w.hazards.fire], [w.platforms.bravo, w.hazards.fire], [w.platforms.alpha, w.hazards.bird]]) {
    const screen = await toAssessment(w.app, platformId, hazardId);
    noMessages(screen);
    const view = await platformView(body, platformId);
    const row = view.rows.find((r) => r.hazard.id === hazardId);
    const ratings = plain(await registry.getRatings(body, /** @type {any} */ (hazardId), /** @type {any} */ (platformId)));
    assert.deepEqual(screen.platform, view.platform);
    assert.deepEqual(screen.hazard, row.hazard);
    assert.equal(screen.reportId, row.reportId);
    assert.deepEqual(screen.controls, row.controls);
    assert.deepEqual(screen.profiles, await listedProfiles(w.folder));
    assert.deepEqual(screen.initial, ratings.initial);
    assert.deepEqual(screen.residual, ratings.residual);
    assert.deepEqual(screen.initialRating, plain(await rating.ratingFor(ratings.initial.consequence, ratings.initial.likelihood)));
    assert.deepEqual(screen.residualRating, plain(await rating.ratingFor(ratings.residual.consequence, ratings.residual.likelihood)));
    assert.deepEqual(screen.reviews, await reviewsOf(body));
    await toHazards(w.app);
  }
  const unrated = await toAssessment(w.app, w.platforms.bravo, w.hazards.fire);
  assert.equal(unrated.initialRating.band, 'Uncategorised');
  assert.equal(unrated.residualRating.band, 'Uncategorised');
  assert.deepEqual(unrated.initial, { consequence: null, likelihood: null });
}));

test('enterRating stores and shows exactly the values given for that stage, null where null was given, with the band ratingFor gives; the other stage, the same hazard on another platform, and the platform row\'s band follow the values (C-021, C-022)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const before = await toAssessment(w.app, w.platforms.alpha, w.hazards.fire);
  const residual = await step(w.app, views.enterRating(w.app, 'residual', /** @type {any} */ ({ consequence: 5, likelihood: 'A' })), 'assessment');
  assert.deepEqual(residual.residual, { consequence: 5, likelihood: 'A' });
  assert.deepEqual(residual.residualRating, plain(await rating.ratingFor(5, 'A')));
  assert.deepEqual(residual.initial, before.initial, 'the other stage unchanged');
  assert.deepEqual(residual.initialRating, before.initialRating);
  assert.deepEqual(residual.controls, before.controls);

  const partial = await step(w.app, views.enterRating(w.app, 'initial', /** @type {any} */ ({ consequence: 3, likelihood: null })), 'assessment');
  assert.deepEqual(partial.initial, { consequence: 3, likelihood: null });
  assert.equal(partial.initialRating.band, 'Uncategorised', 'either value null is Uncategorised');
  assert.deepEqual(partial.residual, residual.residual);

  const platform = expectScreen(w.app, await views.back(w.app), 'platform');
  const row = platform.rows.find((/** @type {any} */ r) => r.hazard.id === w.hazards.fire);
  assert.deepEqual(row.residual, { consequence: 5, likelihood: 'A' });
  assert.deepEqual(row.residualRating, plain(await rating.ratingFor(5, 'A')), 'the row\'s band is ratingFor of its residual');
  await toHazards(w.app);
  const other = await toAssessment(w.app, w.platforms.bravo, w.hazards.fire);
  assert.deepEqual([other.initial, other.residual], [{ consequence: null, likelihood: null }, { consequence: null, likelihood: null }], 'the same hazard on another platform has its own ratings');
}));

test('setReportId shows the value given on that assessment and that platform\'s row; the hazard\'s global id, its detail, and its report id on the other platform are unchanged (C-023)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const detail = detailFields(await toHazard(w.app, w.hazards.fire));
  await toHazards(w.app);
  await toAssessment(w.app, w.platforms.alpha, w.hazards.fire);
  const screen = await step(w.app, views.setReportId(w.app, /** @type {any} */ ('ALPHA-7')), 'assessment');
  assert.equal(screen.reportId, 'ALPHA-7');
  assert.equal(screen.hazard.id, w.hazards.fire);
  const platform = expectScreen(w.app, await views.back(w.app), 'platform');
  assert.equal(platform.rows.find((/** @type {any} */ r) => r.hazard.id === w.hazards.fire).reportId, 'ALPHA-7');
  await toHazards(w.app);
  assert.equal((await toAssessment(w.app, w.platforms.bravo, w.hazards.fire)).reportId, w.hazards.fire, 'the other platform keeps the global id');
  await toHazards(w.app);
  assert.deepEqual(detailFields(await toHazard(w.app, w.hazards.fire)), detail);
}));

// ------------------------------------------------------------------ C-024 and C-025 control states

test('every one of a hazard\'s controls is shown on the assessment and the platform row in the state registry gives it: confirmed with who and when, excluded with the reason stored, awaiting with neither, each with the hazard\'s own control kind (C-024)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const screen = await toAssessment(w.app, w.platforms.alpha, w.hazards.fire);
  assert.equal(screen.controls.length, 2, 'every one of the hazard\'s controls, once');
  const bottle = controlIn(screen.controls, w.controls.bottle);
  assert.equal(bottle.state, 'confirmed');
  assert.equal(bottle.confirmation.byProfileId, w.alice.id, 'confirmed by the active profile');
  assert.equal(bottle.justification, null);
  assert.equal(bottle.controlKind, 'preventative');
  const drill = controlIn(screen.controls, w.controls.drill);
  assert.equal(drill.state, 'excluded');
  assert.equal(drill.justification.text, 'Not fitted');
  assert.equal(drill.confirmation, null);
  assert.equal(drill.controlKind, 'mitigating');
  await toHazards(w.app);
  const bird = await toAssessment(w.app, w.platforms.alpha, w.hazards.bird);
  assert.deepEqual(plain([controlIn(bird.controls, w.controls.radar)].map((c) => [c.state, c.confirmation, c.justification])), [['awaiting', null, null]]);
  const hazard = await (async () => { await toHazards(w.app); return toHazard(w.app, w.hazards.fire); })();
  assert.equal(hazard.controls.length, 2, 'an excluded control is still one of the hazard\'s own');
}));

test('confirmControlForPlatform and excludeControlFromPlatform each move exactly one control: confirmed by the active profile, or excluded with the reason trimmed; every other control, both ratings, the same control on another platform, and the hazard\'s detail are as they were (C-025, C-022)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const detail = detailFields(await toHazard(w.app, w.hazards.fire));
  await toHazards(w.app);
  const otherBefore = plain((await toAssessment(w.app, w.platforms.bravo, w.hazards.fire)).controls);
  await toHazards(w.app);
  const birdBefore = plain((await toAssessment(w.app, w.platforms.alpha, w.hazards.bird)).controls);
  await toHazards(w.app);

  const before = await toAssessment(w.app, w.platforms.alpha, w.hazards.fire);
  const confirmed = await step(w.app, views.confirmControlForPlatform(w.app, /** @type {any} */ (w.controls.drill)), 'assessment');
  const drill = controlIn(confirmed.controls, w.controls.drill);
  assert.deepEqual([drill.state, drill.confirmation.byProfileId, drill.justification], ['confirmed', w.alice.id, null], 'excluded to confirmed');
  assert.deepEqual(controlIn(confirmed.controls, w.controls.bottle), controlIn(before.controls, w.controls.bottle), 'the other control is deep-equal');
  assert.deepEqual([confirmed.initial, confirmed.residual, confirmed.initialRating, confirmed.residualRating], [before.initial, before.residual, before.initialRating, before.residualRating], 'ratings unchanged');

  const excluded = await step(w.app, views.excludeControlFromPlatform(w.app, /** @type {any} */ (w.controls.bottle), '  Removed at overhaul '), 'assessment');
  const bottle = controlIn(excluded.controls, w.controls.bottle);
  assert.deepEqual([bottle.state, bottle.justification.text, bottle.confirmation], ['excluded', 'Removed at overhaul', null], 'confirmed to excluded');
  assert.deepEqual(controlIn(excluded.controls, w.controls.drill), drill);
  assert.deepEqual([excluded.initial, excluded.residual], [before.initial, before.residual]);

  await toHazards(w.app);
  assert.deepEqual(plain((await toAssessment(w.app, w.platforms.bravo, w.hazards.fire)).controls), otherBefore, 'the same hazard on another platform');
  await toHazards(w.app);
  assert.deepEqual(plain((await toAssessment(w.app, w.platforms.alpha, w.hazards.bird)).controls), birdBefore, 'another hazard on this platform');
  await toHazards(w.app);
  assert.deepEqual(detailFields(await toHazard(w.app, w.hazards.fire)), detail, 'the hazard\'s own detail');
}));

// ------------------------------------------------------------------ C-026 the act

test('the act carries the selected profile and the platform the screen holds: an act on the assessment or platform screen is made for that platform and does not await it; one on a hazard, controls, or platforms screen is made for none (C-026)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const held = () => heldBody(env, w.folder);
  await toAssessment(w.app, w.platforms.alpha, w.hazards.bird);
  let prior = await held();
  await step(w.app, views.confirmControlForPlatform(w.app, /** @type {any} */ (w.controls.radar)), 'assessment');
  let entry = await newEntry(prior, await held());
  assert.equal(entry.createdBy, w.alice.id, 'the selected profile');
  assert.equal(entry.madeForPlatformId, w.platforms.alpha, 'made for the assessment\'s platform');
  assert.equal((await changeLog.listAwaiting(await held(), /** @type {any} */ (w.platforms.alpha))).some((e) => e.id === entry.id), false, 'it does not await that platform\'s own owner');

  await views.back(w.app);
  prior = await held();
  await step(w.app, views.linkHazardToPlatform(w.app, /** @type {any} */ (w.hazards.brakes)), 'platform');
  assert.equal((await newEntry(prior, await held())).madeForPlatformId, w.platforms.alpha, 'made for the platform screen\'s platform');

  await toHazards(w.app);
  await toHazard(w.app, w.hazards.bird);
  prior = await held();
  await step(w.app, views.addConsequence(w.app, { text: 'Windscreen damage' }), 'hazard');
  entry = await newEntry(prior, await held());
  assert.equal(entry.madeForPlatformId, null, 'a hazard\'s own screen holds no platform');
  assert.deepEqual(entry.affectedPlatformIds, [w.platforms.alpha]);
  assert.ok((await changeLog.listAwaiting(await held(), /** @type {any} */ (w.platforms.alpha))).some((e) => e.id === entry.id), 'so it awaits every platform it reaches');

  await toHazards(w.app);
  await step(w.app, views.openControls(w.app), 'controls');
  prior = await held();
  await step(w.app, views.createControl(w.app, { title: 'New control' }), 'controls');
  assert.equal((await newEntry(prior, await held())).madeForPlatformId, null);
  await toHazards(w.app);
  await step(w.app, views.openPlatforms(w.app), 'platforms');
  prior = await held();
  await step(w.app, views.setPlatformOwner(w.app, /** @type {any} */ (w.platforms.bravo), /** @type {any} */ (w.alice.id)), 'platforms');
  assert.equal((await newEntry(prior, await held())).madeForPlatformId, null);
}));

// ------------------------------------------------------------------ C-027 the gate

test('each of the four changing operations of the hazard screen, on a hazard on two platforms, shows the confirm-edit screen: the pending edit untrimmed, every platform platformsAffected gives named, and nothing changed, told, or written (C-027)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const body = await heldBody(env, w.folder);
  const affectedIds = plain(await registry.platformsAffected(body, { kind: 'hazard', id: /** @type {any} */ (w.hazards.fire) }));
  assert.equal(affectedIds.length, 2);
  const affected = [];
  for (const id of affectedIds) affected.push({ id, name: await platformName(body, id) });

  const hazardScreen = await toHazard(w.app, w.hazards.fire);
  const [extra] = await (async () => { await toHazards(w.app); const ids = await addControls(w.app, ['Spare control']); await toHazard(w.app, w.hazards.fire); return ids; })();
  const shown = withoutMessages(w.app.screen);
  const held = await heldBody(env, w.folder);
  const before = everywhere(w.folder, env);
  const linkable = (/** @type {any} */ (w.app.screen)).linkableControls;

  /** @type {[string, () => Promise<any>, any][]} */
  const cases = [
    ['renameHazard', () => views.renameHazard(w.app, { title: '  Engine fire (APU) ' }), { operation: 'renameHazard', hazard: hazardScreen.hazard, title: '  Engine fire (APU) ' }],
    ['addCausalFactor', () => views.addCausalFactor(w.app, { text: ' Chafed wiring' }), { operation: 'addCausalFactor', hazard: hazardScreen.hazard, text: ' Chafed wiring' }],
    ['addConsequence', () => views.addConsequence(w.app, { text: 'Evacuation ' }), { operation: 'addConsequence', hazard: hazardScreen.hazard, text: 'Evacuation ' }],
    ['linkControlToHazard', () => views.linkControlToHazard(w.app, /** @type {any} */ (extra), 'preventative'), { operation: 'linkControlToHazard', hazard: hazardScreen.hazard, control: byId(linkable, extra), controlId: extra, controlKind: 'preventative' }],
  ];
  for (const [operation, call, editing] of cases) {
    const screen = await step(w.app, call(), 'confirm-edit');
    assert.deepEqual(screen.editing, plain(editing), `${operation}: the pending edit as given`);
    assert.deepEqual(screen.affected, affected, `${operation}: every platform, in platformsAffected's order, named`);
    assert.deepEqual(screen.reviews, await reviewsOf(held));
    assert.deepEqual(everywhere(w.folder, env), before, `${operation}: nothing told to store or written`);
    const cancelled = await step(w.app, views.cancelEdit(w.app), 'hazard');
    assert.deepEqual(withoutMessages(cancelled), shown, `${operation}: cancel shows the hazard screen rebuilt, nothing changed`);
    assert.deepEqual(everywhere(w.folder, env), before, `${operation}: cancelling wrote nothing`);
  }
}));

test('confirmEdit makes exactly the call the gated operation would have made, tells store, and shows that operation\'s screen; the entry it appends awaits exactly the platforms the confirm-edit screen listed (C-027, C-026, C-012)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await toHazard(w.app, w.hazards.fire);
  const gate = await step(w.app, views.renameHazard(w.app, { title: '  Engine fire (APU) ' }), 'confirm-edit');
  const prior = await heldBody(env, w.folder);
  const screen = await step(w.app, views.confirmEdit(w.app), 'hazard');
  assert.equal(screen.hazard.title, 'Engine fire (APU)', 'renamed, trimmed as registry trims it');
  const body = await heldBody(env, w.folder);
  const entry = await newEntry(prior, body);
  assert.deepEqual(entry.affectedPlatformIds, gate.affected.map((/** @type {any} */ a) => a.id), 'what the user was warned about is what the entry reaches');
  assert.equal(entry.madeForPlatformId, null);
  for (const a of gate.affected) {
    assert.ok((await changeLog.listAwaiting(body, a.id)).some((e) => e.id === entry.id), `it awaits ${a.name}`);
  }
  const platform = (await (async () => { await toHazards(w.app); return toPlatform(w.app, w.platforms.bravo); })());
  assert.equal(platform.rows[0].hazard.title, 'Engine fire (APU)', 'both platforms read the one record');
}));

test('an operation on a hazard on one platform or none, and every other changing operation, is not gated: it proceeds as its own clause says (C-027)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await toHazard(w.app, w.hazards.bird);
  await step(w.app, views.renameHazard(w.app, { title: 'Bird strike on approach' }), 'hazard');
  await step(w.app, views.addCausalFactor(w.app, { text: 'Migration season' }), 'hazard');
  await toHazards(w.app);
  await toHazard(w.app, w.hazards.brakes);
  await step(w.app, views.addConsequence(w.app, { text: 'Tyre fire' }), 'hazard');
  await toHazards(w.app);
  await step(w.app, views.openControls(w.app), 'controls');
  await step(w.app, views.retireControl(w.app, /** @type {any} */ (w.controls.radar)), 'controls');
  await toHazards(w.app);
  await step(w.app, views.openPlatforms(w.app), 'platforms');
  await step(w.app, views.createPlatform(w.app, /** @type {any} */ ({ name: 'Delta', ownerProfileId: w.alice.id })), 'platforms');
  await toHazards(w.app);
  await toAssessment(w.app, w.platforms.bravo, w.hazards.fire);
  await step(w.app, views.confirmControlForPlatform(w.app, /** @type {any} */ (w.controls.bottle)), 'assessment');
  await step(w.app, views.setReportId(w.app, /** @type {any} */ ('B-1')), 'assessment');
}));

test('retireControl of a control on hazards that reach two platforms is gated on the control\'s own ref; confirmEdit retires it (C-027, C-030)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const body = await heldBody(env, w.folder);
  const reach = plain(await registry.platformsAffected(body, { kind: 'control', id: /** @type {any} */ (w.controls.bottle) }));
  assert.equal(reach.length, 2, 'the bottle reaches alpha and bravo through the fire');
  const library = await step(w.app, views.openControls(w.app), 'controls');
  const gate = await step(w.app, views.retireControl(w.app, /** @type {any} */ (w.controls.bottle)), 'confirm-edit');
  assert.deepEqual(gate.editing, { operation: 'retireControl', control: byId(library.controls, w.controls.bottle), controlId: w.controls.bottle });
  assert.deepEqual(gate.affected.map((/** @type {any} */ a) => a.id), reach);
  const screen = await step(w.app, views.confirmEdit(w.app), 'controls');
  assert.equal(screen.controls.some((/** @type {any} */ c) => c.id === w.controls.bottle), false, 'retired');
}));

// ------------------------------------------------------------------ C-028 history

test('openHistory shows exactly change-log.listEntries of the working body, every stored profile, no message, and is the same screen for any user reading the same body (C-028)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const before = everywhere(w.folder, env);
  const screen = await step(w.app, views.openHistory(w.app), 'history');
  const body = await heldBody(env, w.folder);
  assert.deepEqual(screen.entries, plain(await changeLog.listEntries(body)));
  assert.ok(screen.entries.length > 10, 'every act the world made is there');
  assert.deepEqual(screen.profiles, await listedProfiles(w.folder));
  assert.equal('reviews' in screen, false, 'the history carries no review standing (C-031)');
  assert.deepEqual(everywhere(w.folder, env), before, 'nothing written');

  const bob = await selectedApp(w.folder, 'Bob');
  const bobs = await step(bob, views.openHistory(bob), 'history');
  assert.deepEqual({ ...bobs, topBar: null }, { ...plain(screen), topBar: null }, 'the same screen for another user');
}));

test('every act this module performs is on the history once it is in the working body, a retirement and an acknowledgement included (C-028)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await toHazard(w.app, w.hazards.bird);
  await step(w.app, views.renameHazard(w.app, { title: 'Bird strike, renamed' }), 'hazard');
  await toHazards(w.app);
  await toHazard(w.app, w.hazards.brakes);
  await step(w.app, views.retireHazard(w.app), 'hazards');
  await step(w.app, views.openAcknowledgements(w.app), 'acknowledge');
  const queue = /** @type {any} */ (w.app.screen).queues.find((/** @type {any} */ q) => q.entries.length > 0);
  assert.ok(queue, 'Alice has something to acknowledge');
  await step(w.app, views.acknowledgeChange(w.app, queue.entries[0].id, queue.platform.id), 'acknowledge');
  await toHazards(w.app);
  const history = await step(w.app, views.openHistory(w.app), 'history');
  assert.ok(history.entries.some((/** @type {any} */ e) => e.entryKind === 'record-change' && e.items.some((/** @type {any} */ i) => i.ref.id === w.hazards.brakes && i.action === 'retired')), 'the retirement');
  assert.ok(history.entries.some((/** @type {any} */ e) => e.entryKind === 'acknowledgement' && e.entryId === queue.entries[0].id), 'the acknowledgement');
  assert.ok(history.entries.some((/** @type {any} */ e) => e.id === queue.entries[0].id), 'the acknowledged entry is still there');
}));

// ------------------------------------------------------------------ C-029 the acknowledgement queue

test('openAcknowledgements shows one queue per platform the active profile owns, in registry order, each exactly listAwaiting for it, and none for a platform another owns (C-029)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await toHazard(w.app, w.hazards.fire);
  await step(w.app, views.renameHazard(w.app, { title: 'Engine fire, gated' }), 'confirm-edit');
  await step(w.app, views.confirmEdit(w.app), 'hazard');
  await toHazards(w.app);
  const before = everywhere(w.folder, env);

  const screen = await step(w.app, views.openAcknowledgements(w.app), 'acknowledge');
  const body = await heldBody(env, w.folder);
  const owned = plain(await registry.listPlatforms(body)).filter((/** @type {any} */ p) => p.ownerProfileId === w.alice.id);
  assert.deepEqual(screen.queues.map((/** @type {any} */ q) => q.platform), owned);
  for (const q of screen.queues) assert.deepEqual(q.entries, plain(await changeLog.listAwaiting(body, q.platform.id)));
  assert.equal(screen.queues.some((/** @type {any} */ q) => q.platform.id === w.platforms.bravo), false, 'no queue for Bob\'s platform');
  assert.deepEqual(screen.profiles, await listedProfiles(w.folder));
  assert.deepEqual(screen.reviews, await reviewsOf(body));
  assert.deepEqual(everywhere(w.folder, env), before, 'nothing written');

  const bob = await (async () => { await step(w.app, views.back(w.app), 'hazards'); await step(w.app, views.save(w.app), 'hazards'); return selectedApp(w.folder, 'Bob'); })();
  const bobs = await step(bob, views.openAcknowledgements(bob), 'acknowledge');
  assert.deepEqual(bobs.queues.map((/** @type {any} */ q) => q.platform.id), [w.platforms.bravo]);
  assert.ok(bobs.queues[0].entries.some((/** @type {any} */ e) => e.items.some((/** @type {any} */ i) => i.ref.id === w.hazards.fire)), 'the rename awaits Bob on bravo');
}));

test('acknowledgeChange removes that entry from that platform\'s queue and from nobody else\'s, leaves the entry in the history, and tells store (C-029, C-012)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await toHazard(w.app, w.hazards.fire);
  await step(w.app, views.renameHazard(w.app, { title: 'Engine fire, gated' }), 'confirm-edit');
  await step(w.app, views.confirmEdit(w.app), 'hazard');
  await toHazards(w.app);
  await step(w.app, views.openPlatforms(w.app), 'platforms');
  await step(w.app, views.setPlatformOwner(w.app, /** @type {any} */ (w.platforms.bravo), /** @type {any} */ (w.alice.id)), 'platforms');
  await toHazards(w.app);

  const before = await step(w.app, views.openAcknowledgements(w.app), 'acknowledge');
  assert.equal(before.queues.length, 2, 'Alice owns both now');
  const alpha = before.queues.find((/** @type {any} */ q) => q.platform.id === w.platforms.alpha);
  const bravo = before.queues.find((/** @type {any} */ q) => q.platform.id === w.platforms.bravo);
  const rename = alpha.entries.find((/** @type {any} */ e) => bravo.entries.some((/** @type {any} */ b) => b.id === e.id));
  assert.ok(rename, 'one entry awaits both platforms');

  const screen = await step(w.app, views.acknowledgeChange(w.app, rename.id, /** @type {any} */ (w.platforms.alpha)), 'acknowledge');
  const alphaAfter = screen.queues.find((/** @type {any} */ q) => q.platform.id === w.platforms.alpha);
  assert.deepEqual(alphaAfter.entries, alpha.entries.filter((/** @type {any} */ e) => e.id !== rename.id), 'gone from that queue, the rest in order');
  assert.deepEqual(screen.queues.find((/** @type {any} */ q) => q.platform.id === w.platforms.bravo), bravo, 'the other queue deep-equal');
  const body = await heldBody(env, w.folder);
  assert.ok((await changeLog.listEntries(body)).some((e) => e.id === rename.id), 'still in the history');
}));

test('after setPlatformOwner the incoming owner\'s screen carries every entry the outgoing owner had not acknowledged, in order, and the outgoing owner\'s none; what was acknowledged stays cleared (C-029, C-018; SL-05 criterion 5)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await toHazard(w.app, w.hazards.fire);
  await step(w.app, views.addCausalFactor(w.app, { text: 'Hot section crack' }), 'confirm-edit');
  await step(w.app, views.confirmEdit(w.app), 'hazard');
  await step(w.app, views.addConsequence(w.app, { text: 'Engine shutdown' }), 'confirm-edit');
  await step(w.app, views.confirmEdit(w.app), 'hazard');
  await toHazards(w.app);
  const mine = await step(w.app, views.openAcknowledgements(w.app), 'acknowledge');
  const alpha = mine.queues.find((/** @type {any} */ q) => q.platform.id === w.platforms.alpha);
  await step(w.app, views.acknowledgeChange(w.app, alpha.entries[0].id, /** @type {any} */ (w.platforms.alpha)), 'acknowledge');
  const remaining = plain(/** @type {any} */ (w.app.screen).queues.find((/** @type {any} */ q) => q.platform.id === w.platforms.alpha).entries);
  await toHazards(w.app);
  await step(w.app, views.openPlatforms(w.app), 'platforms');
  await step(w.app, views.setPlatformOwner(w.app, /** @type {any} */ (w.platforms.alpha), /** @type {any} */ (w.bob.id)), 'platforms');
  await toHazards(w.app);
  const outgoing = await step(w.app, views.openAcknowledgements(w.app), 'acknowledge');
  assert.equal(outgoing.queues.some((/** @type {any} */ q) => q.platform.id === w.platforms.alpha), false, 'the outgoing owner has no queue for it');
  await toHazards(w.app);
  await step(w.app, views.save(w.app), 'hazards');

  const bob = await selectedApp(w.folder, 'Bob');
  const incoming = await step(bob, views.openAcknowledgements(bob), 'acknowledge');
  const q = incoming.queues.find((/** @type {any} */ x) => x.platform.id === w.platforms.alpha);
  // an entry appended since may share the second and sort among them by a fresh id (DEC-005), so they are compared as a subsequence
  const remainingIds = remaining.map((/** @type {any} */ e) => e.id);
  assert.deepEqual(q.entries.filter((/** @type {any} */ e) => remainingIds.includes(e.id)), remaining, 'every entry not acknowledged, in the same order, unchanged');
  assert.equal(q.entries.some((/** @type {any} */ e) => e.id === alpha.entries[0].id), false, 'the acknowledged one stays cleared');
}));

// ------------------------------------------------------------------ C-030 retirement

test('retireHazard of a hazard on no platform shows the hazards screen without it, unsaved, lastSave unchanged; retireControl and retirePlatform take the record off their lists and off nothing else (C-030)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const lastSave = plain(/** @type {any} */ (w.app.screen).lastSave);
  await toHazard(w.app, w.hazards.brakes);
  const hazards = await step(w.app, views.retireHazard(w.app), 'hazards');
  assert.equal(hazards.hazards.some((/** @type {any} */ h) => h.id === w.hazards.brakes), false);
  assert.equal(hazards.unsaved, true);
  assert.deepEqual(hazards.lastSave, lastSave);

  const birdDetail = detailFields(await toHazard(w.app, w.hazards.bird));
  await toHazards(w.app);
  const alphaBefore = await toPlatform(w.app, w.platforms.alpha);
  await toHazards(w.app);
  await step(w.app, views.openControls(w.app), 'controls');
  const controls = await step(w.app, views.retireControl(w.app, /** @type {any} */ (w.controls.radar)), 'controls');
  assert.equal(controls.controls.some((/** @type {any} */ c) => c.id === w.controls.radar), false, 'off the library');
  await toHazards(w.app);
  const bird = await toHazard(w.app, w.hazards.bird);
  assert.equal(bird.linkableControls.some((/** @type {any} */ c) => c.id === w.controls.radar), false, 'off every linkableControls');
  assert.deepEqual(bird.controls.map((/** @type {any} */ c) => [c.control.id, c.controlKind]), birdDetail.controls.map((/** @type {any} */ c) => [c.control.id, c.controlKind]), 'still one of the hazard\'s controls, same kind');
  await toHazards(w.app);
  const alpha = await toPlatform(w.app, w.platforms.alpha);
  const row = alpha.rows.find((/** @type {any} */ r) => r.hazard.id === w.hazards.bird);
  const rowBefore = alphaBefore.rows.find((/** @type {any} */ r) => r.hazard.id === w.hazards.bird);
  assert.deepEqual(controlIn(row.controls, w.controls.radar).state, controlIn(rowBefore.controls, w.controls.radar).state, 'the same state on the platform');

  await toHazards(w.app);
  const bravoRows = plain((await toPlatform(w.app, w.platforms.bravo)).rows);
  const bravoQueue = plain(await changeLog.listAwaiting(await heldBody(env, w.folder), /** @type {any} */ (w.platforms.bravo)));
  await views.back(w.app);
  const platforms = await step(w.app, views.retirePlatform(w.app, /** @type {any} */ (w.platforms.bravo)), 'platforms');
  assert.equal(platforms.platforms.some((/** @type {any} */ p) => p.id === w.platforms.bravo), false);
  const body = await heldBody(env, w.folder);
  assert.deepEqual(plain(await registry.listPlatformHazards(body, /** @type {any} */ (w.platforms.bravo))).rows.map((/** @type {any} */ r) => r.hazard.id), bravoRows.map((/** @type {any} */ r) => r.hazard.id), 'every row of it as it was');
  const queueAfter = plain(await changeLog.listAwaiting(body, /** @type {any} */ (w.platforms.bravo)));
  // the retirement's own entry may share the second and sort among them by a fresh id (DEC-005), so they are compared as a subsequence
  const bravoIds = bravoQueue.map((/** @type {any} */ e) => e.id);
  assert.deepEqual(queueAfter.filter((/** @type {any} */ e) => bravoIds.includes(e.id)), bravoQueue, 'its queue is still its own');
}));

test('a hazard linked to platforms cannot be retired: the hazard screen as before with one warning naming every platform (C-030; SL-05 criterion 6)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const before = await toHazard(w.app, w.hazards.fire);
  const heldBefore = await heldBody(env, w.folder);
  const refusal = await rejectionOf(() => registry.retireHazard(heldBefore, actOf(w.alice), /** @type {any} */ (w.hazards.fire)));
  assert.ok(refusal instanceof registry.HazardOnPlatformsError);
  const names = [];
  for (const id of refusal.platformIds) names.push(await platformName(heldBefore, id));
  const screen = expectScreen(w.app, await views.retireHazard(w.app), 'hazard');
  assert.equal(screen.messages.length, 1);
  assert.equal(screen.messages[0].severity, 'warning');
  assert.deepEqual(screen.messages[0].items, names, 'the platform names, in the order the error carries the ids');
  assert.deepEqual([...names].sort(), ['Alpha', 'Bravo']);
  assert.deepEqual({ ...plain(screen), messages: [] }, { ...plain(before), messages: [] }, 'nothing on the screen but messages changed');
  assert.deepEqual(await heldBody(env, w.folder), heldBefore, 'nothing stored');
}));
