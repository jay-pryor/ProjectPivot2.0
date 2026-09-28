/**
 * views conformance: the register of workflows and a workflow's own screen (CORE-CON-002). The
 * happy path of C-036 to C-038 of modules/views/CONTRACT.md (SL-07), with C-020, C-021, C-024,
 * C-026, and C-027 as they reach a workflow, each screen compared with what `workflows`,
 * `registry`, `rating`, `review-schedule`, and `profiles` give for the body it is built from.
 * Written from the contract before any implementation (P8). That a user can see the steps is
 * verified by demonstration (REQ-037); this file holds that the screen carries them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as views from '../contract.js';
import * as registry from '../../registry/contract.js';
import * as changeLog from '../../change-log/contract.js';
import * as reviewSchedule from '../../review-schedule/contract.js';
import * as workflows from '../../workflows/contract.js';
import {
  buildWorld, byId, clockOn, controlIn, day, everywhere, expectScreen, heldBody, inBrowser, keyOf, listedProfiles, loaded, malformed,
  newEntry, noMessages, plain, plantData, platformView, reviewsOf, selectedApp, step, toAssessment, toHazard, toHazards, toPlatform,
} from './harness.js';

/**
 * The workflow screen C-037 builds for a workflow on a body, less `messages`, `topBar`, and the
 * two pickers, which the tests compare on their own.
 * @param {any} body
 * @param {string} id
 */
async function expectedWorkflow(body, id) {
  const progress = plain(await workflows.progressOf(body, /** @type {any} */ (id)));
  const record = progress.record;
  const live = record.state === 'in-progress' && record.status === 'live';
  const demand = live ? plain(await workflows.stepDemand(body, /** @type {any} */ (id))) : null;
  /** @type {any} */
  const out = { progress, demand, subjectName: null, platform: null, rows: null, omitted: null, hazard: null, causalFactors: null, consequences: null, controls: null, reviews: await reviewsOf(body) };
  const subject = record.subject;
  if (subject?.kind === 'platform' && (await registry.listPlatforms(body)).some((p) => p.id === subject.id)) {
    const view = await platformView(body, subject.id);
    Object.assign(out, { platform: view.platform, rows: view.rows, omitted: view.omitted, subjectName: view.platform.name });
  }
  if (subject?.kind === 'hazard' && (await registry.listHazards(body)).some((h) => h.id === subject.id)) {
    const detail = plain(await registry.getHazardDetail(body, subject.id));
    Object.assign(out, { hazard: detail.hazard, causalFactors: detail.causalFactors, consequences: detail.consequences, controls: detail.controls, subjectName: detail.hazard.title });
  }
  return out;
}

/**
 * Assert a workflow screen is C-037's for the body the app holds.
 * @param {any} env
 * @param {any} w
 * @param {any} screen
 */
async function assertWorkflowScreen(env, w, screen) {
  const body = await heldBody(env, w.folder);
  const expected = await expectedWorkflow(body, screen.progress.record.id);
  for (const [field, value] of Object.entries(expected)) assert.deepEqual(screen[field], value, `the workflow screen's ${field}`);
  assert.deepEqual(screen.profiles, await listedProfiles(w.folder), 'profiles');
  return body;
}

/**
 * Start a workflow from the hazards screen; the workflow screen it resolves with.
 * @param {any} app
 * @param {any} fields
 */
async function start(app, fields) {
  if (app.screen.kind !== 'workflows') await step(app, views.openWorkflows(app), 'workflows');
  return expectScreen(app, await views.startWorkflow(app, fields), 'workflow');
}

// ------------------------------------------------------------------ C-036 the register

test('openWorkflows on a body with none shows workflows empty, every live platform, every stored profile, the review standing, and no message (C-036)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const before = everywhere(w.folder, env);
  const screen = await step(w.app, views.openWorkflows(w.app), 'workflows');
  const body = await heldBody(env, w.folder);
  assert.deepEqual(screen.workflows, []);
  assert.deepEqual(screen.platforms, plain(await registry.listPlatforms(body)));
  assert.deepEqual(screen.profiles, await listedProfiles(w.folder));
  assert.deepEqual(screen.reviews, await reviewsOf(body));
  assert.deepEqual(everywhere(w.folder, env), before);
}));

test('startWorkflow starts each of the five on its subject and shows its own screen at the first step with no entries; the register then lists every live one as listWorkflows gives it, each beside its subject\'s name or null (C-036, C-037)', () => inBrowser(async (env) => {
  clockOn('2026-09-21');
  const w = await buildWorld(env);
  /** @type {[string, any][]} */
  const kinds = [
    ['review-data', { kind: 'platform', id: w.platforms.alpha }],
    ['remove-control', { kind: 'platform', id: w.platforms.alpha }],
    ['transfer-ownership', { kind: 'platform', id: w.platforms.bravo }],
    ['add-data', null],
    ['onboard-platform', null],
  ];
  for (const [workflowKind, subject] of kinds) {
    const prior = await heldBody(env, w.folder);
    const screen = await start(w.app, { workflowKind, subject });
    const record = screen.progress.record;
    assert.equal(record.workflowKind, workflowKind);
    assert.deepEqual(record.subject, subject);
    assert.equal(record.state, 'in-progress');
    assert.equal(record.currentStep, workflows.WORKFLOW_STEPS[/** @type {'add-data'} */ (workflowKind)][0], 'at the first step of its kind');
    assert.deepEqual(record.entries, []);
    assert.equal(record.startedOnAest, '2026-09-21');
    assert.equal(record.createdBy, w.alice.id);
    await assertWorkflowScreen(env, w, screen);
    const body = await heldBody(env, w.folder);
    const act = await newEntry(prior, body);
    assert.equal(act.madeForPlatformId, subject === null ? null : subject.id, `${workflowKind}: made for the platform it is performed on, or none`);
    await step(w.app, views.back(w.app), 'workflows');
  }
  const register = await step(w.app, views.back(w.app).then(() => views.openWorkflows(w.app)), 'workflows');
  const body = await heldBody(env, w.folder);
  const listed = plain(await workflows.listWorkflows(body));
  assert.equal(listed.length, 5);
  const names = { [w.platforms.alpha]: 'Alpha', [w.platforms.bravo]: 'Bravo' };
  assert.deepEqual(register.workflows, listed.map((/** @type {any} */ wf) => ({ workflow: wf, subjectName: wf.subject ? names[wf.subject.id] : null })));
}));

test('startWorkflow twice with equal fields gives two records, two runs and not a repeat (C-036, section 5 idempotency)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const a = await start(w.app, { workflowKind: 'review-data', subject: { kind: 'platform', id: w.platforms.alpha } });
  await step(w.app, views.back(w.app), 'workflows');
  const b = await start(w.app, { workflowKind: 'review-data', subject: { kind: 'platform', id: w.platforms.alpha } });
  assert.notEqual(a.progress.record.id, b.progress.record.id);
  const register = await step(w.app, views.back(w.app), 'workflows');
  assert.equal(register.workflows.length, 2);
}));

// ------------------------------------------------------------------ C-037 a workflow's own screen

test('a review workflow on a platform shows its steps, the demand, and the platform\'s hazards from the one query, each row with its controls in their states and its band; the hazard group is null; the pickers are empty (C-037, C-020, C-021, C-024; SL-07 criterion 3)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const started = await start(w.app, { workflowKind: 'review-data', subject: { kind: 'platform', id: w.platforms.alpha } });
  const id = started.progress.record.id;
  await step(w.app, views.back(w.app), 'workflows');
  const before = everywhere(w.folder, env);
  const screen = await step(w.app, views.openWorkflow(w.app, id), 'workflow');
  const body = await assertWorkflowScreen(env, w, screen);
  assert.deepEqual(screen.progress.done, []);
  assert.equal(screen.progress.current, 'review-the-hazards');
  assert.deepEqual(screen.progress.remaining, ['record-the-outcome']);
  assert.equal(screen.demand.satisfied, false);
  assert.deepEqual(screen.rows.map((/** @type {any} */ r) => r.hazard.id).sort(), [w.hazards.fire, w.hazards.bird].sort());
  assert.equal(controlIn(screen.rows.find((/** @type {any} */ r) => r.hazard.id === w.hazards.fire).controls, w.controls.drill).justification.text, 'Not fitted');
  assert.equal(screen.subjectName, 'Alpha');
  assert.deepEqual([screen.linkableHazards, screen.linkableControls], [[], []], 'no picker at review-the-hazards');
  assert.deepEqual(everywhere(w.folder, env), before, 'opening wrote nothing');
  assert.deepEqual(screen.reviews, await reviewsOf(body));
}));

test('a review workflow on a platform whose rating record is malformed names the hazard in omitted with one error message, never in rows (C-037, C-020; HZ-004)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const started = await start(w.app, { workflowKind: 'review-data', subject: { kind: 'platform', id: w.platforms.alpha } });
  await toHazards(w.app);
  await step(w.app, views.save(w.app), 'hazards');
  const body = await heldBody(env, w.folder);
  const key = keyOf(body, 'rating', (r) => r.hazardId === w.hazards.fire && r.stage === 'residual');
  const broken = malformed(body, 'rating', key, (r) => { r.likelihood = 'Z'; });
  await plantData(w.folder, broken, w.alice);

  const app = await selectedApp(w.folder, 'Alice');
  await step(app, views.openWorkflows(app), 'workflows');
  const screen = expectScreen(app, await views.openWorkflow(app, started.progress.record.id), 'workflow');
  const view = await platformView((await loaded(w.folder)).body, w.platforms.alpha);
  assert.deepEqual(screen.omitted, view.omitted);
  assert.equal(screen.omitted.length, 1);
  assert.equal(screen.rows.some((/** @type {any} */ r) => r.hazard.id === screen.omitted[0].id), false);
  assert.equal(screen.messages.length, 1);
  assert.equal(screen.messages[0].severity, 'error');
  assert.ok(screen.messages[0].items.some((/** @type {string} */ i) => i.includes(screen.omitted[0].id)));
  assert.ok(screen.messages[0].items.some((/** @type {string} */ i) => i.includes(screen.omitted[0].key)));
}));

test('an add-data workflow shows no subject until its first step, then the hazard it created from the one getHazardDetail, and at choose-controls offers the library less the hazard\'s own controls (C-037, C-038)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const started = await start(w.app, { workflowKind: 'add-data', subject: null });
  assert.equal(started.subjectName, null);
  assert.equal(started.hazard, null);
  assert.equal(started.platform, null);

  const named = expectScreen(w.app, await views.submitStep(w.app, /** @type {any} */ ({ step: 'name-the-hazard', title: '  Tail strike ' })), 'workflow');
  noMessages(named);
  await assertWorkflowScreen(env, w, named);
  assert.equal(named.progress.record.subject.kind, 'hazard');
  assert.equal(named.hazard.title, 'Tail strike');
  assert.equal(named.subjectName, 'Tail strike');
  assert.equal(named.progress.record.entries.length, 1, 'the step\'s entry appended');

  const advanced = await step(w.app, views.advanceStep(w.app), 'workflow');
  assert.equal(advanced.progress.current, 'describe-the-hazard');
  const described = await step(w.app, views.submitStep(w.app, /** @type {any} */ ({ step: 'describe-the-hazard', part: 'causal-factor', text: 'Over-rotation' })), 'workflow');
  assert.deepEqual(described.causalFactors.map((/** @type {any} */ c) => c.text), ['Over-rotation']);
  const atControls = await step(w.app, views.advanceStep(w.app), 'workflow');
  assert.equal(atControls.progress.current, 'choose-controls');
  const library = plain(await registry.listControls(await heldBody(env, w.folder)));
  assert.deepEqual(atControls.linkableControls, library, 'every live control, none yet the hazard\'s');
  const chosen = await step(w.app, views.submitStep(w.app, /** @type {any} */ ({ step: 'choose-controls', controlId: w.controls.drill, controlKind: 'mitigating' })), 'workflow');
  assert.deepEqual(chosen.linkableControls, library.filter((/** @type {any} */ c) => c.id !== w.controls.drill));
  assert.deepEqual(chosen.controls.map((/** @type {any} */ c) => [c.control.id, c.controlKind]), [[w.controls.drill, 'mitigating']]);
  await assertWorkflowScreen(env, w, chosen);

  const outcome = await step(w.app, views.advanceStep(w.app), 'workflow');
  assert.equal(outcome.progress.current, 'record-the-outcome');
  assert.deepEqual(outcome.linkableControls, [], 'the picker is at choose-controls only');
}));

test('an onboard-platform workflow names the platform, offers at select-hazards every live hazard not yet on it, and each hazard selected arrives with its controls awaiting, re-entering nothing (C-037, C-038; SL-07 criterion 2)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await start(w.app, { workflowKind: 'onboard-platform', subject: null });
  const named = await step(w.app, views.submitStep(w.app, /** @type {any} */ ({ step: 'name-the-platform', name: 'Charlie', ownerProfileId: w.alice.id })), 'workflow');
  assert.equal(named.progress.record.subject.kind, 'platform');
  assert.equal(named.subjectName, 'Charlie');
  const charlie = named.progress.record.subject.id;
  const at = await step(w.app, views.advanceStep(w.app), 'workflow');
  assert.equal(at.progress.current, 'select-hazards');
  assert.deepEqual(at.linkableHazards, plain(await registry.listHazards(await heldBody(env, w.folder))), 'every live hazard, none yet on the new platform');
  const fireDetail = plain(await registry.getHazardDetail(await heldBody(env, w.folder), /** @type {any} */ (w.hazards.fire)));
  const selected = await step(w.app, views.submitStep(w.app, /** @type {any} */ ({ step: 'select-hazards', hazardId: w.hazards.fire })), 'workflow');
  assert.equal(selected.linkableHazards.some((/** @type {any} */ h) => h.id === w.hazards.fire), false);
  const row = selected.rows.find((/** @type {any} */ r) => r.hazard.id === w.hazards.fire);
  assert.deepEqual(row.controls.map((/** @type {any} */ c) => [c.control.id, c.state]), fireDetail.controls.map((/** @type {any} */ c) => [c.control.id, 'awaiting']), 'every control across, awaiting');
  await step(w.app, views.advanceStep(w.app), 'workflow');
  const complete = await step(w.app, views.completeWorkflow(w.app, /** @type {any} */ ({ outcome: 'Charlie onboarded' })), 'workflow');
  assert.equal(complete.progress.record.state, 'complete');

  await toHazards(w.app);
  const platform = await toPlatform(w.app, charlie);
  assert.deepEqual(controlIn(platform.rows[0].controls, w.controls.bottle).state, 'awaiting', 'awaiting on the platform screen too');
  await toHazards(w.app);
  assert.deepEqual(plain((await toHazard(w.app, w.hazards.fire)).controls), fireDetail.controls, 'nothing of the hazard re-entered or copied');
}));

// ------------------------------------------------------------------ C-038 the four acts

test('a review workflow completed shows every step done, no current step, no demand, the outcome, the date, and the user; the last reviewed date of the platform and each hazard reviewed is set through workflows, and the next screen reads it afresh (C-038, C-037, C-031; SL-07 criteria 3 and 4)', () => inBrowser(async (env) => {
  clockOn('2026-09-22');
  const w = await buildWorld(env);
  await step(w.app, views.openPlatforms(w.app), 'platforms');
  await step(w.app, views.setReviewTempo(w.app, /** @type {any} */ ({ ref: { kind: 'platform', id: w.platforms.alpha }, tempoMonths: 12, nextDueAest: day('2026-09-01') })), 'platforms');
  await toHazards(w.app);
  await toHazard(w.app, w.hazards.bird);
  await step(w.app, views.setReviewTempo(w.app, /** @type {any} */ ({ ref: { kind: 'hazard', id: w.hazards.bird }, tempoMonths: 6, nextDueAest: day('2026-09-10') })), 'hazard');
  await toHazards(w.app);

  const started = await start(w.app, { workflowKind: 'review-data', subject: { kind: 'platform', id: w.platforms.alpha } });
  for (const hazardId of [w.hazards.fire, w.hazards.bird]) {
    const s = await step(w.app, views.submitStep(w.app, /** @type {any} */ ({ step: 'review-the-hazards', hazardId, note: ` Reviewed ${hazardId} ` })), 'workflow');
    await assertWorkflowScreen(env, w, s);
  }
  await step(w.app, views.advanceStep(w.app), 'workflow');
  const done = await step(w.app, views.completeWorkflow(w.app, /** @type {any} */ ({ outcome: '  All current ' })), 'workflow');
  const record = done.progress.record;
  assert.equal(record.state, 'complete');
  assert.equal(record.completedOnAest, '2026-09-22');
  assert.equal(record.completedBy, w.alice.id);
  assert.equal(record.outcome, 'All current');
  assert.equal(done.progress.current, null);
  assert.deepEqual(done.progress.done, workflows.WORKFLOW_STEPS['review-data']);
  assert.deepEqual(done.progress.remaining, []);
  assert.equal(done.demand, null);
  assert.ok(record.entries.some((/** @type {any} */ e) => e.entryKind === 'decision' && e.ref.id === w.hazards.bird));
  const body = await assertWorkflowScreen(env, w, done);
  for (const ref of [{ kind: 'platform', id: w.platforms.alpha }, { kind: 'hazard', id: w.hazards.bird }]) {
    assert.equal(plain(await reviewSchedule.getSchedule(body, /** @type {any} */ (ref))).lastReviewedAest, '2026-09-22', `${ref.kind}'s last reviewed date`);
    assert.equal(done.reviews.schedules.find((/** @type {any} */ s) => s.ref.id === ref.id).lastReviewedAest, '2026-09-22', `the screen after shows ${ref.kind}'s`);
  }
  assert.equal(started.progress.record.id, record.id);

  const register = await step(w.app, views.back(w.app), 'workflows');
  assert.equal(byId(register.workflows.map((/** @type {any} */ r) => ({ ...r, id: r.workflow.id })), record.id).workflow.state, 'complete', 'a complete workflow is still on the register');
}));

test('a remove-control workflow chooses a confirmed control, settles each hazard\'s residual, records the reason, and on completion the control is excluded from that platform with that reason and nowhere else (C-038; SL-07 criterion 5)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const otherBefore = plain((await toAssessment(w.app, w.platforms.bravo, w.hazards.fire)).controls);
  await toHazards(w.app);
  await start(w.app, { workflowKind: 'remove-control', subject: { kind: 'platform', id: w.platforms.alpha } });
  await step(w.app, views.submitStep(w.app, /** @type {any} */ ({ step: 'choose-the-control', controlId: w.controls.bottle })), 'workflow');
  const settle = await step(w.app, views.advanceStep(w.app), 'workflow');
  assert.equal(settle.progress.current, 'settle-the-ratings');
  assert.deepEqual(settle.demand.outstanding, [{ kind: 'hazard', id: w.hazards.fire }], 'what the step still asks, as stepDemand gives it');
  const settled = await step(w.app, views.submitStep(w.app, /** @type {any} */ ({ step: 'settle-the-ratings', hazardId: w.hazards.fire, consequence: 2, likelihood: 'D' })), 'workflow');
  assert.equal(settled.demand.satisfied, true);
  await step(w.app, views.advanceStep(w.app), 'workflow');
  await step(w.app, views.submitStep(w.app, /** @type {any} */ ({ step: 'record-the-reason', text: 'Bottle removed from fleet' })), 'workflow');
  await step(w.app, views.advanceStep(w.app), 'workflow');
  await step(w.app, views.completeWorkflow(w.app, /** @type {any} */ ({ outcome: 'Removed' })), 'workflow');

  await toHazards(w.app);
  const alpha = await toAssessment(w.app, w.platforms.alpha, w.hazards.fire);
  assert.deepEqual([controlIn(alpha.controls, w.controls.bottle).state, controlIn(alpha.controls, w.controls.bottle).justification.text], ['excluded', 'Bottle removed from fleet']);
  await toHazards(w.app);
  assert.deepEqual(plain((await toAssessment(w.app, w.platforms.bravo, w.hazards.fire)).controls), otherBefore, 'no other platform touched');
}));

test('a transfer-ownership workflow sets the platform\'s owner through workflows on completion of its step (C-038)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await start(w.app, { workflowKind: 'transfer-ownership', subject: { kind: 'platform', id: w.platforms.alpha } });
  await step(w.app, views.submitStep(w.app, /** @type {any} */ ({ step: 'choose-the-owner', ownerProfileId: w.bob.id })), 'workflow');
  await toHazards(w.app);
  const platforms = await step(w.app, views.openPlatforms(w.app), 'platforms');
  assert.equal(byId(platforms.platforms, w.platforms.alpha).ownerProfileId, w.bob.id);
}));

test('abandonWorkflow shows the register without that workflow and undoes nothing it did (C-038)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const started = await start(w.app, { workflowKind: 'add-data', subject: null });
  await step(w.app, views.submitStep(w.app, /** @type {any} */ ({ step: 'name-the-hazard', title: 'Half entered' })), 'workflow');
  const hazardId = /** @type {any} */ (w.app.screen).progress.record.subject.id;
  const register = await step(w.app, views.abandonWorkflow(w.app), 'workflows');
  assert.equal(register.workflows.some((/** @type {any} */ r) => r.workflow.id === started.progress.record.id), false);
  const body = await heldBody(env, w.folder);
  assert.equal(plain(await workflows.getWorkflow(body, started.progress.record.id)).status, 'deleted', 'the record stays');
  assert.ok((await registry.listHazards(body)).some((h) => h.id === hazardId), 'the hazard it created is still there');
}));

test('each step of a review workflow on a platform is made for that platform, so it does not await that platform\'s owner (C-026, C-038)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  await start(w.app, { workflowKind: 'review-data', subject: { kind: 'platform', id: w.platforms.alpha } });
  const prior = await heldBody(env, w.folder);
  await step(w.app, views.submitStep(w.app, /** @type {any} */ ({ step: 'review-the-hazards', hazardId: w.hazards.bird, note: 'ok' })), 'workflow');
  const body = await heldBody(env, w.folder);
  const act = await newEntry(prior, body);
  assert.equal(act.madeForPlatformId, w.platforms.alpha);
  assert.equal((await changeLog.listAwaiting(body, /** @type {any} */ (w.platforms.alpha))).some((e) => e.id === act.id), false);
}));

// ------------------------------------------------------------------ C-027's eighth gate

test('an add-data workflow whose hazard is since on two platforms gates every one of its four acts on the confirm-edit screen, with the workflow and the values pending; confirmEdit makes the one workflows call and shows the workflow screen (C-027, C-038)', () => inBrowser(async (env) => {
  const w = await buildWorld(env);
  const started = await start(w.app, { workflowKind: 'add-data', subject: null });
  const named = await step(w.app, views.submitStep(w.app, /** @type {any} */ ({ step: 'name-the-hazard', title: 'Shared hazard' })), 'workflow');
  const hazardId = named.progress.record.subject.id;
  await toHazards(w.app);
  await toPlatform(w.app, w.platforms.alpha);
  await step(w.app, views.linkHazardToPlatform(w.app, hazardId), 'platform');
  await step(w.app, views.back(w.app), 'platforms');
  await step(w.app, views.openPlatform(w.app, /** @type {any} */ (w.platforms.bravo)), 'platform');
  await step(w.app, views.linkHazardToPlatform(w.app, hazardId), 'platform');
  await toHazards(w.app);
  await step(w.app, views.openWorkflows(w.app), 'workflows');
  const shown = await step(w.app, views.openWorkflow(w.app, started.progress.record.id), 'workflow');
  const ids = [w.platforms.alpha, w.platforms.bravo].sort();
  const before = everywhere(w.folder, env);

  const advance = await step(w.app, views.advanceStep(w.app), 'confirm-edit');
  assert.deepEqual(advance.editing, { operation: 'advanceStep', workflow: shown.progress.record });
  assert.deepEqual(advance.affected.map((/** @type {any} */ a) => a.id), ids);
  assert.deepEqual(everywhere(w.folder, env), before, 'nothing written while the list is shown');
  const cancelled = await step(w.app, views.cancelEdit(w.app), 'workflow');
  assert.equal(cancelled.progress.current, 'name-the-hazard', 'cancel: the step is where it was');

  await step(w.app, views.advanceStep(w.app), 'confirm-edit');
  const prior = await heldBody(env, w.folder);
  const moved = await step(w.app, views.confirmEdit(w.app), 'workflow');
  assert.equal(moved.progress.current, 'describe-the-hazard');
  const act = await newEntry(prior, await heldBody(env, w.folder));
  assert.deepEqual(act.affectedPlatformIds, ids, 'the entry reaches exactly the platforms listed');

  const submission = { step: 'describe-the-hazard', part: 'consequence', text: ' Damage ' };
  const submit = await step(w.app, views.submitStep(w.app, /** @type {any} */ (submission)), 'confirm-edit');
  assert.deepEqual(submit.editing, { operation: 'submitStep', workflow: moved.progress.record, submission });
  await step(w.app, views.confirmEdit(w.app), 'workflow');
  await step(w.app, views.advanceStep(w.app), 'confirm-edit');
  await step(w.app, views.confirmEdit(w.app), 'workflow');
  await step(w.app, views.advanceStep(w.app), 'confirm-edit');
  const atOutcome = await step(w.app, views.confirmEdit(w.app), 'workflow');
  const complete = await step(w.app, views.completeWorkflow(w.app, /** @type {any} */ ({ outcome: 'Added' })), 'confirm-edit');
  assert.deepEqual(complete.editing, { operation: 'completeWorkflow', workflow: atOutcome.progress.record, fields: { outcome: 'Added' } });
  await step(w.app, views.cancelEdit(w.app), 'workflow');
  const abandon = await step(w.app, views.abandonWorkflow(w.app), 'confirm-edit');
  assert.deepEqual(abandon.editing, { operation: 'abandonWorkflow', workflow: atOutcome.progress.record });
  await step(w.app, views.confirmEdit(w.app), 'workflows');
}));
