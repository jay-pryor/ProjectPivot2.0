/**
 * views conformance: errors of the record screens (CORE-CON-002). Every section 4 row of the
 * hazard, controls, platforms, platform, assessment, confirm-edit, history, and acknowledgement
 * screens (SL-03 to SL-05) of modules/views/CONTRACT.md the suite can reach, with C-008: the
 * screen named, the one message named with the items named, nothing on it but `messages`
 * changed where the row says so, nothing told to `store`, and the working body kept. Each
 * refusal is first asked of the owning module on the same body, so the items a message must
 * carry come from the error that module gives. Written from the contract before any
 * implementation (P8). The null double must fail this file (CORE-TST-002, rung 1).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as views from '../contract.js';
import * as registry from '../../registry/contract.js';
import * as schema from '../../../baseline/schema.js';
import { controlId, hazardId, platformId } from '../../../baseline/types.js';
import {
  actOf, buildWorld, byId, everywhere, expectScreen, heldBody, inBrowser, itemsName, keyOf, loaded, malformed, oneMessage, plain,
  plantData, platformView, refusedAsBefore, rejectionOf, selectedApp, step, toAssessment, toHazard, toHazards, toPlatform,
  withoutMessages,
} from './harness.js';

// ------------------------------------------------------------------ the hazard screen

test('openHazard for an id the body has no live hazard for shows the hazards screen re-listed with one warning naming the id (C-016, section 4)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  for (const id of [hazardId.fromSequence(999), 'not-an-id']) {
    const screen = expectScreen(w.app, await views.openHazard(w.app, /** @type {any} */ (id)), 'hazards');
    itemsName(oneMessage(screen, 'warning'), id, 'the id');
    assert.deepEqual(screen.hazards, plain(await registry.listHazards(await heldBody(env, w.folder))));
  }
}));

test('renameHazard, addCausalFactor, and addConsequence with a blank value leave the hazard screen as before with one warning, and tell store nothing (section 4)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await toHazard(w.app, w.hazards.bird);
  await refusedAsBefore(w, () => views.renameHazard(w.app, { title: '   ' }), 'warning', 'blank title');
  await refusedAsBefore(w, () => views.addCausalFactor(w.app, { text: '' }), 'warning', 'blank causal factor');
  await refusedAsBefore(w, () => views.addConsequence(w.app, { text: '\t' }), 'warning', 'blank consequence');
}));

test('renameHazard with the title already stored leaves the screen as before with one info message naming the field registry names, and stores nothing (section 4; registry C-029)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const screen = await toHazard(w.app, w.hazards.bird);
  const body = await heldBody(env, w.folder);
  const noChange = await rejectionOf(() => registry.updateHazard(body, actOf(w.alice), /** @type {any} */ (w.hazards.bird), { title: ` ${screen.hazard.title} ` }));
  assert.ok(noChange instanceof registry.NoChangeError);
  const m = await refusedAsBefore(w, () => views.renameHazard(w.app, { title: ` ${screen.hazard.title} ` }), 'info', 'the same title');
  itemsName(m, noChange.field, 'the field');
}));

test('linkControlToHazard with a kind that is neither side, an unknown control, or a control already the hazard\'s leaves the screen as before with one warning naming the kind, the control\'s id, or the existing link\'s id (section 4)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await toHazard(w.app, w.hazards.bird);
  await refusedAsBefore(w, () => views.linkControlToHazard(w.app, /** @type {any} */ (w.controls.bottle), /** @type {any} */ ('sideways')), 'warning', 'an invalid kind');
  const unknown = controlId.fresh();
  itemsName(await refusedAsBefore(w, () => views.linkControlToHazard(w.app, unknown, 'preventative'), 'warning', 'an unknown control'), unknown, 'the control\'s id');
  const body = await heldBody(env, w.folder);
  const duplicate = await rejectionOf(() => registry.linkControlToHazard(body, actOf(w.alice), /** @type {any} */ ({ hazardId: w.hazards.bird, controlId: w.controls.radar, controlKind: 'preventative' })));
  assert.ok(duplicate instanceof registry.DuplicateLinkError);
  itemsName(await refusedAsBefore(w, () => views.linkControlToHazard(w.app, /** @type {any} */ (w.controls.radar), 'preventative'), 'warning', 'a second link'), duplicate.existing, 'the existing link\'s id');
}));

test('a gated edit whose pending call registry refuses shows, after confirmEdit, the hazard screen rebuilt with that call\'s message; nothing is stored, and the edit may be made again (C-027, section 4)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const shown = await toHazard(w.app, w.hazards.fire);
  const written = everywhere(w.folder, env);
  await step(w.app, views.renameHazard(w.app, { title: '  ' }), 'confirm-edit');
  const screen = expectScreen(w.app, await views.confirmEdit(w.app), 'hazard');
  oneMessage(screen, 'warning');
  assert.deepEqual(withoutMessages(screen), withoutMessages(shown));
  assert.deepEqual(everywhere(w.folder, env), written, 'nothing stored, noteChange not called');

  await step(w.app, views.renameHazard(w.app, { title: shown.hazard.title }), 'confirm-edit');
  const same = expectScreen(w.app, await views.confirmEdit(w.app), 'hazard');
  oneMessage(same, 'info');
  await step(w.app, views.renameHazard(w.app, { title: 'Engine fire, again' }), 'confirm-edit');
  assert.equal((await step(w.app, views.confirmEdit(w.app), 'hazard')).hazard.title, 'Engine fire, again');
}));

// ------------------------------------------------------------------ the controls and platforms screens

test('createControl with a blank title, and retireControl of an unknown or already retired control, leave the controls screen as before with one warning, naming the id for a retirement (section 4)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await step(w.app, views.openControls(w.app), 'controls');
  await refusedAsBefore(w, () => views.createControl(w.app, { title: ' ' }), 'warning', 'blank title');
  const unknown = controlId.fresh();
  itemsName(await refusedAsBefore(w, () => views.retireControl(w.app, unknown), 'warning', 'an unknown control'), unknown, 'the id');
  await step(w.app, views.retireControl(w.app, /** @type {any} */ (w.controls.radar)), 'controls');
  itemsName(await refusedAsBefore(w, () => views.retireControl(w.app, /** @type {any} */ (w.controls.radar)), 'warning', 'a second retirement'), w.controls.radar, 'the id');
}));

test('createPlatform with a blank name or an owner that is not a profile id, setPlatformOwner with such an owner or the owner already stored, and retirePlatform or setPlatformOwner of an unknown or retired platform leave the platforms screen as before with one message (section 4)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await step(w.app, views.openPlatforms(w.app), 'platforms');
  await refusedAsBefore(w, () => views.createPlatform(w.app, /** @type {any} */ ({ name: '', ownerProfileId: w.alice.id })), 'warning', 'blank name');
  await refusedAsBefore(w, () => views.createPlatform(w.app, /** @type {any} */ ({ name: 'Nobody\'s', ownerProfileId: 'nobody' })), 'warning', 'an owner that is not a profile id');
  await refusedAsBefore(w, () => views.setPlatformOwner(w.app, /** @type {any} */ (w.platforms.alpha), /** @type {any} */ ('nobody')), 'warning', 'setPlatformOwner to no profile');
  const body = await heldBody(env, w.folder);
  const same = await rejectionOf(() => registry.setPlatformOwner(body, actOf(w.alice), /** @type {any} */ ({ platformId: w.platforms.alpha, ownerProfileId: w.alice.id })));
  assert.ok(same instanceof registry.NoChangeError);
  itemsName(await refusedAsBefore(w, () => views.setPlatformOwner(w.app, /** @type {any} */ (w.platforms.alpha), /** @type {any} */ (w.alice.id)), 'info', 'the same owner'), same.field, 'the field');
  const unknown = platformId.fresh();
  itemsName(await refusedAsBefore(w, () => views.retirePlatform(w.app, unknown), 'warning', 'retire an unknown platform'), unknown, 'the id');
  itemsName(await refusedAsBefore(w, () => views.setPlatformOwner(w.app, unknown, /** @type {any} */ (w.bob.id)), 'warning', 'transfer an unknown platform'), unknown, 'the id');
  await step(w.app, views.retirePlatform(w.app, /** @type {any} */ (w.platforms.bravo)), 'platforms');
  itemsName(await refusedAsBefore(w, () => views.retirePlatform(w.app, /** @type {any} */ (w.platforms.bravo)), 'warning', 'a second retirement'), w.platforms.bravo, 'the id');
}));

test('openPlatforms, openAssessment, openHistory, and openAcknowledgements when the profile names cannot be read show their screen with profiles empty and one warning naming the file; every other field as its clause says (section 4)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const body = await heldBody(env, w.folder);
  w.folder.denyRead((rel) => rel === schema.DATA_FOLDER.profiles);
  /** @type {[string, () => Promise<any>, string][]} */
  const cases = [
    ['platforms', () => views.openPlatforms(w.app), 'platforms'],
    ['history', () => views.openHistory(w.app), 'history'],
    ['acknowledge', () => views.openAcknowledgements(w.app), 'acknowledge'],
  ];
  for (const [label, open, kind] of cases) {
    const screen = expectScreen(w.app, await open(), /** @type {any} */ (kind));
    assert.deepEqual(screen.profiles, [], `${label}: profiles empty`);
    itemsName(oneMessage(screen, 'warning'), schema.DATA_FOLDER.profiles, `${label}: the file`);
    await toHazards(w.app);
  }
  const platforms = expectScreen(w.app, await views.openPlatforms(w.app), 'platforms');
  assert.deepEqual(platforms.platforms, plain(await registry.listPlatforms(body)), 'the platforms as their clause says');
  expectScreen(w.app, await views.openPlatform(w.app, /** @type {any} */ (w.platforms.alpha)), 'platform');
  const assessment = expectScreen(w.app, await views.openAssessment(w.app, /** @type {any} */ (w.hazards.fire)), 'assessment');
  assert.deepEqual(assessment.profiles, []);
  itemsName(oneMessage(assessment, 'warning'), schema.DATA_FOLDER.profiles, 'the file');
  assert.equal(controlIn(assessment.controls, w.controls.bottle).confirmation.byProfileId, w.alice.id, 'the confirmation still carries its id');
}));

/**
 * @param {readonly any[]} controls
 * @param {string} id
 */
function controlIn(controls, id) {
  return byId(controls.map((c) => ({ ...c, id: c.control.id })), id);
}

// ------------------------------------------------------------------ the platform and assessment screens

test('openAssessment and linkHazardToPlatform for an unknown hazard, or one already on the platform, leave the platform screen with one warning naming the hazard\'s id or the existing link\'s id (section 4)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await toPlatform(w.app, w.platforms.alpha);
  const unknown = hazardId.fromSequence(500);
  for (const call of [() => views.openAssessment(w.app, unknown), () => views.linkHazardToPlatform(w.app, unknown)]) {
    itemsName(await refusedAsBefore(w, call, 'warning', 'an unknown hazard'), unknown, 'the id');
  }
  const body = await heldBody(env, w.folder);
  const duplicate = await rejectionOf(() => registry.linkHazardToPlatform(body, actOf(w.alice, w.platforms.alpha), /** @type {any} */ ({ hazardId: w.hazards.fire, platformId: w.platforms.alpha })));
  assert.ok(duplicate instanceof registry.DuplicateLinkError);
  itemsName(await refusedAsBefore(w, () => views.linkHazardToPlatform(w.app, /** @type {any} */ (w.hazards.fire)), 'warning', 'a second link'), duplicate.existing, 'the existing link\'s id');
}));

test('openAssessment for a hazard the query omits shows the platform screen as openPlatform gives it, with its omitted messages, and no assessment screen (section 4; HZ-004)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const body = await heldBody(env, w.folder);
  const key = keyOf(body, 'rating', (r) => r.hazardId === w.hazards.fire && r.platformId === w.platforms.alpha && r.stage === 'residual');
  await plantData(w.folder, malformed(body, 'rating', key, (r) => { r.likelihood = 'H'; }), w.alice);
  const app = await selectedApp(w.folder, 'Alice');
  const opened = await toPlatform(app, w.platforms.alpha);
  const screen = expectScreen(app, await views.openAssessment(app, /** @type {any} */ (w.hazards.fire)), 'platform');
  assert.deepEqual(screen, plain(opened), 'the platform screen as openPlatform gives it');
  const view = await platformView((await loaded(w.folder)).body, w.platforms.alpha);
  assert.deepEqual(screen.omitted, view.omitted);
  assert.equal(screen.messages.length, view.omitted.length);
}));

test('setReportId blank or space-padded, or the id already stored, and enterRating out of scale, of an unknown stage, or the pair already stored, leave the assessment as before with one message naming what registry names; no rating shown for a refused value (section 4; SL-03 criterion 6)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const shown = await toAssessment(w.app, w.platforms.alpha, w.hazards.fire);
  const body = await heldBody(env, w.folder);
  for (const given of ['', ' FIRE-1', 'FIRE-1 ']) {
    itemsName(await refusedAsBefore(w, () => views.setReportId(w.app, /** @type {any} */ (given)), 'warning', `report id ${JSON.stringify(given)}`), given, 'what was given');
  }
  const sameId = await rejectionOf(() => registry.setPlatformReportId(body, actOf(w.alice, w.platforms.alpha), /** @type {any} */ ({ hazardId: w.hazards.fire, platformId: w.platforms.alpha, reportId: shown.reportId })));
  itemsName(await refusedAsBefore(w, () => views.setReportId(w.app, shown.reportId), 'info', 'the same report id'), sameId.field, 'the field');

  /** @type {[any, string, string][]} */
  const values = [[{ consequence: 6, likelihood: 'A' }, 'consequence', '6'], [{ consequence: 0, likelihood: null }, 'consequence', '0'], [{ consequence: 2, likelihood: 'H' }, 'likelihood', 'H'], [{ consequence: 2.5, likelihood: 'B' }, 'consequence', '2.5']];
  for (const [value, field, given] of values) {
    const m = await refusedAsBefore(w, () => views.enterRating(w.app, 'residual', value), 'warning', `rating ${JSON.stringify(value)}`);
    itemsName(m, field, 'the field');
    itemsName(m, given, 'the value');
  }
  await refusedAsBefore(w, () => views.enterRating(w.app, /** @type {any} */ ('final'), /** @type {any} */ ({ consequence: 1, likelihood: 'A' })), 'warning', 'an unknown stage');
  const samePair = await rejectionOf(() => registry.setRating(body, actOf(w.alice, w.platforms.alpha), /** @type {any} */ ({ hazardId: w.hazards.fire, platformId: w.platforms.alpha, stage: 'residual', ...shown.residual })));
  itemsName(await refusedAsBefore(w, () => views.enterRating(w.app, 'residual', shown.residual), 'info', 'the same pair'), samePair.field, 'the field');
}));

test('confirmControlForPlatform of a control already confirmed, of an unknown control, and excludeControlFromPlatform with a blank reason or of a control already excluded leave the assessment as before with one warning naming what registry names (section 4; REQ-058, SL-04 criterion 3)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await toAssessment(w.app, w.platforms.alpha, w.hazards.fire);
  const body = await heldBody(env, w.folder);
  const act = actOf(w.alice, w.platforms.alpha);
  const confirmed = await rejectionOf(() => registry.confirmControlForPlatform(body, act, /** @type {any} */ ({ hazardId: w.hazards.fire, controlId: w.controls.bottle, platformId: w.platforms.alpha })));
  assert.ok(confirmed instanceof registry.DuplicateLinkError);
  itemsName(await refusedAsBefore(w, () => views.confirmControlForPlatform(w.app, /** @type {any} */ (w.controls.bottle)), 'warning', 'confirmed twice'), confirmed.existing, 'the existing link\'s id');
  const unknown = controlId.fresh();
  itemsName(await refusedAsBefore(w, () => views.confirmControlForPlatform(w.app, unknown), 'warning', 'an unknown control'), unknown, 'the id');
  for (const blank of ['', '   ']) {
    itemsName(await refusedAsBefore(w, () => views.excludeControlFromPlatform(w.app, /** @type {any} */ (w.controls.bottle), blank), 'warning', 'no reason'), w.controls.bottle, 'the control\'s id');
  }
  const excluded = await rejectionOf(() => registry.excludeControlFromPlatform(body, act, /** @type {any} */ ({ hazardId: w.hazards.fire, controlId: w.controls.drill, platformId: w.platforms.alpha, text: 'Again' })));
  assert.ok(excluded instanceof registry.AlreadyExcludedError);
  itemsName(await refusedAsBefore(w, () => views.excludeControlFromPlatform(w.app, /** @type {any} */ (w.controls.drill), 'Again'), 'warning', 'excluded twice'), excluded.existing, 'the live justification\'s id');
}));

// ------------------------------------------------------------------ malformed records and a history that cannot be read

test('openControls, openPlatforms, and openHazard on a body with a malformed control or platform record show their screen with the lists that collection feeds empty and one error naming the record\'s key and its kind (section 4)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const body = await heldBody(env, w.folder);
  await plantData(w.folder, malformed(malformed(body, 'control', w.controls.radar, (r) => { r.title = 7; }), 'platform', w.platforms.bravo, (r) => { r.ownerProfileId = 'nobody'; }), w.alice);
  const app = await selectedApp(w.folder, 'Alice');
  const controls = expectScreen(app, await views.openControls(app), 'controls');
  assert.deepEqual(controls.controls, []);
  const cm = oneMessage(controls, 'error');
  itemsName(cm, w.controls.radar, 'the key');
  itemsName(cm, 'control', 'the kind');
  await toHazards(app);
  const platforms = expectScreen(app, await views.openPlatforms(app), 'platforms');
  assert.deepEqual(platforms.platforms, []);
  itemsName(oneMessage(platforms, 'error'), w.platforms.bravo, 'the key');
  await toHazards(app);
  const hazard = expectScreen(app, await views.openHazard(app, /** @type {any} */ (w.hazards.brakes)), 'hazard');
  assert.deepEqual(hazard.linkableControls, [], 'the list the malformed collection feeds is empty');
  assert.ok(hazard.messages.some((/** @type {any} */ m) => m.severity === 'error' && m.items.some((/** @type {string} */ i) => i.includes(w.controls.radar))), 'an error naming the key');
}));

test('every changing operation on a body whose history holds a malformed entry leaves its screen as before with one error naming the entry\'s key; nothing changed, told, or written; openHistory and openAcknowledgements show entries and queues empty with that error (section 4; HZ-005)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const body = await heldBody(env, w.folder);
  const key = Object.keys(/** @type {any} */ (body.collections['change-log-entry']))[0];
  await plantData(w.folder, malformed(body, 'change-log-entry', key, (r) => { r.entryKind = 'gossip'; }), w.alice);
  const app = await selectedApp(w.folder, 'Alice');
  const world = { ...w, app };

  itemsName(await refusedAsBefore(world, () => views.addHazard(app, { title: 'Blocked' }), 'error', 'addHazard'), key, 'the entry\'s key');
  await toHazard(app, w.hazards.bird);
  itemsName(await refusedAsBefore(world, () => views.addCausalFactor(app, { text: 'Blocked' }), 'error', 'addCausalFactor'), key, 'the entry\'s key');
  await toHazards(app);
  await step(app, views.openControls(app), 'controls');
  itemsName(await refusedAsBefore(world, () => views.createControl(app, { title: 'Blocked' }), 'error', 'createControl'), key, 'the entry\'s key');
  await toHazards(app);
  await toAssessment(app, w.platforms.alpha, w.hazards.bird);
  itemsName(await refusedAsBefore(world, () => views.confirmControlForPlatform(app, /** @type {any} */ (w.controls.radar)), 'error', 'confirm'), key, 'the entry\'s key');
  await toHazards(app);

  const history = expectScreen(app, await views.openHistory(app), 'history');
  assert.deepEqual(history.entries, []);
  itemsName(oneMessage(history, 'error'), key, 'the entry\'s key');
  await toHazards(app);
  const queue = expectScreen(app, await views.openAcknowledgements(app), 'acknowledge');
  assert.deepEqual(queue.queues, []);
  itemsName(oneMessage(queue, 'error'), key, 'the entry\'s key');
}));

// ------------------------------------------------------------------ the acknowledgement screen

test('acknowledgeChange for a platform the screen has no queue for, or an entry its queue does not hold, rebuilds the acknowledgement screen with one warning naming the two ids and acknowledges nothing (section 4, C-029)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await toHazard(w.app, w.hazards.fire);
  await step(w.app, views.renameHazard(w.app, { title: 'Awaits both' }), 'confirm-edit');
  await step(w.app, views.confirmEdit(w.app), 'hazard');
  await toHazards(w.app);
  const screen = await step(w.app, views.openAcknowledgements(w.app), 'acknowledge');
  const entry = screen.queues[0].entries[screen.queues[0].entries.length - 1];
  const written = everywhere(w.folder, env);

  /** @type {[string, string][]} */
  const pairs = [[entry.id, w.platforms.bravo], [/** @type {any} */ ('00000000-0000-4000-8000-000000000000'), w.platforms.alpha]];
  for (const [entryId, platform] of pairs) {
    const refused = expectScreen(w.app, await views.acknowledgeChange(w.app, /** @type {any} */ (entryId), /** @type {any} */ (platform)), 'acknowledge');
    const m = oneMessage(refused, 'warning');
    itemsName(m, entryId, 'the entry id');
    itemsName(m, platform, 'the platform id');
    assert.deepEqual(withoutMessages(refused), withoutMessages(screen));
    assert.deepEqual(everywhere(w.folder, env), written, 'change-log.acknowledge not called, nothing written');
  }
  await step(w.app, views.acknowledgeChange(w.app, entry.id, /** @type {any} */ (w.platforms.alpha)), 'acknowledge');
  const again = expectScreen(w.app, await views.acknowledgeChange(w.app, entry.id, /** @type {any} */ (w.platforms.alpha)), 'acknowledge');
  oneMessage(again, 'warning');
}));

test('a gated operation repeated on the confirm-edit screen, and a confirmEdit or cancelEdit after the first, reject with WrongScreenError (section 5 idempotency, C-002, C-027)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await toHazard(w.app, w.hazards.fire);
  await step(w.app, views.renameHazard(w.app, { title: 'Once' }), 'confirm-edit');
  const error = await rejectionOf(() => views.renameHazard(w.app, { title: 'Twice' }));
  assert.ok(error instanceof views.WrongScreenError);
  await step(w.app, views.confirmEdit(w.app), 'hazard');
  assert.ok((await rejectionOf(() => views.confirmEdit(w.app))) instanceof views.WrongScreenError);
  assert.ok((await rejectionOf(() => views.cancelEdit(w.app))) instanceof views.WrongScreenError);
}));
