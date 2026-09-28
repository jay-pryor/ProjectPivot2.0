/**
 * views conformance: errors of the register of workflows and a workflow's own screen
 * (CORE-CON-002). Every section 4 row of C-036 to C-038 (SL-07) of modules/views/CONTRACT.md the
 * suite can reach, with C-008. Each refusal is `workflows`' and is carried on the screen as
 * before with nothing stored; criterion 4's sealing (REQ-039) and REQ-077's refusal are asserted
 * as the user sees them. Written from the contract before any implementation (P8). The null
 * double must fail this file (CORE-TST-002, rung 1).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as views from '../contract.js';
import * as workflows from '../../workflows/contract.js';
import { platformId, workflowRecordId } from '../../../baseline/types.js';
import {
  addHazards, buildWorld, expectScreen, heldBody, inBrowser, itemsName, linkControls, loaded, malformed, oneMessage, plain, plantData,
  refusedAsBefore, saveBody, selectedApp, step, toHazards, toPlatform,
} from './harness.js';

/**
 * Start a workflow from the hazards screen and stay on its screen.
 * @param {any} app
 * @param {any} fields
 */
async function start(app, fields) {
  if (app.screen.kind !== 'workflows') await step(app, views.openWorkflows(app), 'workflows');
  return step(app, views.startWorkflow(app, fields), 'workflow');
}

// ------------------------------------------------------------------ C-036 starting

test('startWorkflow with a subject that is not a platform of the screen\'s list leaves the workflows screen as before with one warning naming the ref\'s kind and id, and starts nothing (section 4, C-036)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await step(w.app, views.openWorkflows(w.app), 'workflows');
  const refs = [{ kind: 'platform', id: platformId.fresh() }, { kind: 'hazard', id: w.hazards.fire }, { kind: 'control', id: w.controls.radar }];
  for (const subject of refs) {
    const m = await refusedAsBefore(w, () => views.startWorkflow(w.app, /** @type {any} */ ({ workflowKind: 'review-data', subject })), 'warning', `${subject.kind} subject`);
    itemsName(m, subject.kind, 'the kind');
    itemsName(m, subject.id, 'the id');
  }
}));

test('startWorkflow of a kind outside the five, or with a subject its kind does not take, leaves the workflows screen as before with one warning naming the kind and the value workflows carries (section 4, C-036)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await step(w.app, views.openWorkflows(w.app), 'workflows');
  itemsName(await refusedAsBefore(w, () => views.startWorkflow(w.app, /** @type {any} */ ({ workflowKind: 'audit', subject: null })), 'warning', 'an unknown kind'), 'audit', 'the kind');
  itemsName(await refusedAsBefore(w, () => views.startWorkflow(w.app, /** @type {any} */ ({ workflowKind: 'review-data', subject: null })), 'warning', 'review-data with no subject'), 'review-data', 'the kind');
  itemsName(await refusedAsBefore(w, () => views.startWorkflow(w.app, /** @type {any} */ ({ workflowKind: 'add-data', subject: { kind: 'platform', id: w.platforms.alpha } })), 'warning', 'add-data on a platform'), 'add-data', 'the kind');
}));

// ------------------------------------------------------------------ C-037 opening

test('openWorkflow for an id no workflow record has, or one abandoned, shows the workflows screen re-listed with one warning naming the id (section 4, C-037)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const started = await start(w.app, { workflowKind: 'review-data', subject: { kind: 'platform', id: w.platforms.alpha } });
  const abandoned = started.progress.record.id;
  await step(w.app, views.abandonWorkflow(w.app), 'workflows');
  for (const id of [workflowRecordId.fresh(), abandoned]) {
    const screen = expectScreen(w.app, await views.openWorkflow(w.app, id), 'workflows');
    itemsName(oneMessage(screen, 'warning'), id, 'the id');
    assert.deepEqual(screen.workflows, plain(await workflows.listWorkflows(await heldBody(env, w.folder))).map((/** @type {any} */ r) => ({ workflow: r, subjectName: r.subject ? 'Alpha' : null })));
  }
}));

test('on a body holding a malformed workflow record, openWorkflows shows workflows empty, never a shorter list, with one error naming the entry\'s key (section 4, C-036)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await start(w.app, { workflowKind: 'review-data', subject: { kind: 'platform', id: w.platforms.alpha } });
  await step(w.app, views.back(w.app), 'workflows');
  await start(w.app, { workflowKind: 'add-data', subject: null });
  await toHazards(w.app);
  await step(w.app, views.save(w.app), 'hazards');
  const body = (await loaded(w.folder)).body;
  const key = Object.keys(/** @type {any} */ (body.collections['workflow-record']))[0];
  await saveBody(w.folder, w.alice, malformed(body, 'workflow-record', key, (r) => { r.currentStep = 'daydream'; }));
  const app = await selectedApp(w.folder, 'Alice');
  const screen = expectScreen(app, await views.openWorkflows(app), 'workflows');
  assert.deepEqual(screen.workflows, []);
  itemsName(oneMessage(screen, 'error'), key, 'the entry\'s key');
}));

// ------------------------------------------------------------------ C-038 the four acts

test('a complete workflow refuses every one of the four acts: the workflow screen as before with one warning naming its id, nothing stored (section 4, C-038; REQ-039, SL-07 criterion 4)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const started = await start(w.app, { workflowKind: 'transfer-ownership', subject: { kind: 'platform', id: w.platforms.bravo } });
  await step(w.app, views.submitStep(w.app, /** @type {any} */ ({ step: 'choose-the-owner', ownerProfileId: w.alice.id })), 'workflow');
  await step(w.app, views.advanceStep(w.app), 'workflow');
  const complete = await step(w.app, views.completeWorkflow(w.app, /** @type {any} */ ({ outcome: 'Transferred' })), 'workflow');
  const id = started.progress.record.id;
  const record = plain(complete.progress.record);

  /** @type {[string, () => Promise<any>][]} */
  const acts = [
    ['submitStep', () => views.submitStep(w.app, /** @type {any} */ ({ step: 'choose-the-owner', ownerProfileId: w.bob.id }))],
    ['advanceStep', () => views.advanceStep(w.app)],
    ['completeWorkflow', () => views.completeWorkflow(w.app, /** @type {any} */ ({ outcome: 'Rewritten' }))],
    ['abandonWorkflow', () => views.abandonWorkflow(w.app)],
  ];
  for (const [label, act] of acts) {
    itemsName(await refusedAsBefore(w, act, 'warning', label), id, 'the workflow\'s id');
  }
  assert.deepEqual(plain(await workflows.getWorkflow(await heldBody(env, w.folder), id)), record, 'no field of the record changed');
}));

test('submitStep for a step the workflow is not at, a second submission for a one-record step, a blank note, and a hazard that is not a row each leave the workflow screen as before with one warning naming what workflows carries (section 4, C-038)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await start(w.app, { workflowKind: 'review-data', subject: { kind: 'platform', id: w.platforms.alpha } });
  const wrong = await refusedAsBefore(w, () => views.submitStep(w.app, /** @type {any} */ ({ step: 'choose-the-owner', ownerProfileId: w.bob.id })), 'warning', 'the wrong step');
  itemsName(wrong, 'review-the-hazards', 'the step expected');
  itemsName(wrong, 'choose-the-owner', 'the step given');
  await refusedAsBefore(w, () => views.submitStep(w.app, /** @type {any} */ ({ step: 'review-the-hazards', hazardId: w.hazards.bird, note: '  ' })), 'warning', 'a blank note');
  itemsName(await refusedAsBefore(w, () => views.submitStep(w.app, /** @type {any} */ ({ step: 'review-the-hazards', hazardId: w.hazards.brakes, note: 'Not on alpha' })), 'warning', 'a hazard not in the review'), w.hazards.brakes, 'the hazard');
  await step(w.app, views.submitStep(w.app, /** @type {any} */ ({ step: 'review-the-hazards', hazardId: w.hazards.bird, note: 'Reviewed' })), 'workflow');
  const again = await refusedAsBefore(w, () => views.submitStep(w.app, /** @type {any} */ ({ step: 'review-the-hazards', hazardId: w.hazards.bird, note: 'Again' })), 'warning', 'a second review of one hazard');
  itemsName(again, 'review-the-hazards', 'the step');
  itemsName(again, w.hazards.bird, 'the ref');

  await toHazards(w.app);
  await start(w.app, { workflowKind: 'add-data', subject: null });
  await step(w.app, views.submitStep(w.app, /** @type {any} */ ({ step: 'name-the-hazard', title: 'Once' })), 'workflow');
  const created = /** @type {any} */ (w.app.screen).progress.record.subject;
  const twice = await refusedAsBefore(w, () => views.submitStep(w.app, /** @type {any} */ ({ step: 'name-the-hazard', title: 'Twice' })), 'warning', 'a second name-the-hazard');
  itemsName(twice, 'name-the-hazard', 'the step');
  itemsName(twice, created.id, 'the ref already recorded');
}));

test('advanceStep while the step asks for something names the step and every outstanding ref; at the last step it says so with an info message naming the workflow; completeWorkflow before the last step, or with a blank outcome, is refused (section 4, C-038)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const started = await start(w.app, { workflowKind: 'review-data', subject: { kind: 'platform', id: w.platforms.alpha } });
  const demand = plain(started.demand);
  const incomplete = await refusedAsBefore(w, () => views.advanceStep(w.app), 'warning', 'nothing reviewed');
  itemsName(incomplete, 'review-the-hazards', 'the step');
  for (const ref of demand.outstanding) itemsName(incomplete, ref.id, `outstanding ${ref.kind}`);
  const early = await refusedAsBefore(w, () => views.completeWorkflow(w.app, /** @type {any} */ ({ outcome: 'Too soon' })), 'warning', 'complete before the last step');
  itemsName(early, 'review-the-hazards', 'the step');

  for (const ref of demand.outstanding) await step(w.app, views.submitStep(w.app, /** @type {any} */ ({ step: 'review-the-hazards', hazardId: ref.id, note: 'ok' })), 'workflow');
  await step(w.app, views.advanceStep(w.app), 'workflow');
  itemsName(await refusedAsBefore(w, () => views.advanceStep(w.app), 'info', 'past the last step'), started.progress.record.id, 'the workflow\'s id');
  await refusedAsBefore(w, () => views.completeWorkflow(w.app, /** @type {any} */ ({ outcome: '   ' })), 'warning', 'a blank outcome');
}));

test('a remove-control workflow refuses to advance past settle-the-ratings while any hazard the control is confirmed for on that platform is unsettled, naming each; and refuses a control not confirmed there (section 4, C-038; REQ-077, SL-07 criterion 5)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const [second] = await addHazards(w.app, ['Cargo fire']);
  await linkControls(w.app, second, [[w.controls.bottle, 'preventative']]);
  await toPlatform(w.app, w.platforms.alpha);
  await step(w.app, views.linkHazardToPlatform(w.app, second), 'platform');
  await step(w.app, views.openAssessment(w.app, second), 'assessment');
  await step(w.app, views.confirmControlForPlatform(w.app, /** @type {any} */ (w.controls.bottle)), 'assessment');
  await toHazards(w.app);

  await start(w.app, { workflowKind: 'remove-control', subject: { kind: 'platform', id: w.platforms.alpha } });
  const notOn = await refusedAsBefore(w, () => views.submitStep(w.app, /** @type {any} */ ({ step: 'choose-the-control', controlId: w.controls.radar })), 'warning', 'a control awaiting, not confirmed');
  itemsName(notOn, w.controls.radar, 'the control');
  await step(w.app, views.submitStep(w.app, /** @type {any} */ ({ step: 'choose-the-control', controlId: w.controls.bottle })), 'workflow');
  await step(w.app, views.advanceStep(w.app), 'workflow');
  await step(w.app, views.submitStep(w.app, /** @type {any} */ ({ step: 'settle-the-ratings', hazardId: w.hazards.fire, consequence: 3, likelihood: 'C' })), 'workflow');
  const refused = await refusedAsBefore(w, () => views.advanceStep(w.app), 'warning', 'one hazard unsettled');
  itemsName(refused, 'settle-the-ratings', 'the step');
  itemsName(refused, second, 'the unsettled hazard');
  assert.equal(refused.items.some((/** @type {string} */ i) => i.includes(w.hazards.fire) && !i.includes(second)), false, 'the settled hazard is not named as outstanding');
}));

test('a completion whose acts cannot all be made — the history holds a malformed entry — leaves the workflow screen as before with one error naming the key: no act made, no last reviewed date set, the record still at record-the-outcome (section 4, C-038; workflows C-009)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await step(w.app, views.openPlatforms(w.app), 'platforms');
  await step(w.app, views.setReviewTempo(w.app, /** @type {any} */ ({ ref: { kind: 'platform', id: w.platforms.alpha }, tempoMonths: 12, nextDueAest: '2027-01-01' })), 'platforms');
  await toHazards(w.app);
  const started = await start(w.app, { workflowKind: 'review-data', subject: { kind: 'platform', id: w.platforms.alpha } });
  for (const hazardId of [w.hazards.fire, w.hazards.bird]) await step(w.app, views.submitStep(w.app, /** @type {any} */ ({ step: 'review-the-hazards', hazardId, note: 'ok' })), 'workflow');
  await step(w.app, views.advanceStep(w.app), 'workflow');
  await toHazards(w.app);
  await step(w.app, views.save(w.app), 'hazards');
  const body = (await loaded(w.folder)).body;
  const key = Object.keys(/** @type {any} */ (body.collections['change-log-entry']))[0];
  const broken = malformed(body, 'change-log-entry', key, (r) => { r.items = []; });
  await plantData(w.folder, broken, w.alice);

  const app = await selectedApp(w.folder, 'Alice');
  await step(app, views.openWorkflows(app), 'workflows');
  await step(app, views.openWorkflow(app, started.progress.record.id), 'workflow');
  const m = await refusedAsBefore({ app, folder: w.folder, env }, () => views.completeWorkflow(app, /** @type {any} */ ({ outcome: 'Should not seal' })), 'error', 'a completion that cannot record');
  itemsName(m, key, 'the entry\'s key');
  // the app has told store nothing (refusedAsBefore), so the browser's mirror still holds buildWorld's save (store C-015, C-016)
  // and not this app's body; the body it holds is read back through its own screen
  await step(app, views.back(app), 'workflows');
  const reopened = await step(app, views.openWorkflow(app, started.progress.record.id), 'workflow');
  assert.equal(reopened.progress.record.currentStep, 'record-the-outcome');
  assert.deepEqual(reopened.progress.record, plain(await workflows.getWorkflow(broken, started.progress.record.id)), 'the record as loaded: nothing made');
}));
