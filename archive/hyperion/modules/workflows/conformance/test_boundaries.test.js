/**
 * workflows conformance: boundaries (CORE-CON-002). Empty, degenerate, and edge cases of
 * modules/workflows/CONTRACT.md: a body with no workflow collection, a review of a platform with
 * no hazards, a step that takes nothing, a hazard linked after a review began, a day boundary, a
 * frozen input, a save and a load mid-workflow, and the browser's storage. Written from the
 * contract before any implementation (P8).
 *
 * The null double must fail this file (CORE-TST-002, rung 1).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  HELD, KIND, actOf, alice, assertRefused, bob, buildWorld, deepFreeze, differences, hazardRef, jsonRoundTrip, orderedUuid, platformRef,
  registry, removalAtOutcome, reviewAtOutcome, rs, run, scheduled, schema, snapshot, start, wf, withBrowserStorageSpies, withClock, workflowsIn,
} from './harness.js';

test('a body with no workflow-record collection holds no workflow: getWorkflow is null, listWorkflows is empty, and the first startWorkflow creates the collection (section 4, C-001)', async () => {
  const w = await buildWorld();
  assert.equal(/** @type {any} */ (w.body.collections)[KIND], undefined, 'the world has no workflow collection');
  assert.equal(await wf.getWorkflow(w.body, /** @type {any} */ (orderedUuid(1, 0xc))), null);
  assert.deepEqual(await wf.listWorkflows(w.body), []);
  const { body, workflow } = await start(w.body, actOf(alice), 'onboard-platform', null);
  assert.deepEqual(Object.keys(workflowsIn(body)), [workflow.id]);
  assert.equal(/** @type {any} */ (w.body.collections)[KIND], undefined, 'the input still has none');
});

test('an empty collection lists nothing, and reads on an empty body with a missing collection resolve the same as on an empty map (section 4)', async () => {
  const empty = schema.emptyDataBody();
  const withMap = /** @type {any} */ ({ collections: { [KIND]: {} }, sequences: { hazard: 1 } });
  assert.deepEqual(await wf.listWorkflows(empty), []);
  assert.deepEqual(await wf.listWorkflows(withMap), []);
  assert.equal(await wf.getWorkflow(withMap, /** @type {any} */ (orderedUuid(1, 0xc))), null);
});

test('a review of a platform with no hazards asks for nothing, advances at once, and completes, setting the platform\'s date when it has a schedule (C-006, C-008)', async () => {
  const w = await buildWorld();
  const empty = await withClock(HELD, () => registry.createPlatform(w.body, actOf(alice), { name: 'Empty', ownerProfileId: alice.id }));
  const E = empty.platform.id;
  const body = await scheduled(empty.body, platformRef(E));
  const act = actOf(alice, E);
  const change = await start(body, act, 'review-data', platformRef(E));
  assert.deepEqual(await wf.stepDemand(change.body, change.workflow.id), { step: 'review-the-hazards', satisfied: true, outstanding: [] });
  assert.deepEqual(await wf.reviewOmissions(change.body, change.workflow.id), []);
  const done = await run(change, act, ['advance', { outcome: 'nothing on it yet' }]);
  assert.equal((await rs.getSchedule(done.body, platformRef(E)))?.lastReviewedAest, '2026-09-15');
  assert.deepEqual(done.workflow.entries.map((e) => [e.entryKind, e.ref]), [['action', platformRef(E)], ['outcome', null]]);
});

test('a review whose platform and hazards have no schedule completes with no action entries and sets no date (C-006)', async () => {
  const w = await buildWorld();
  const atOutcome = await reviewAtOutcome(w);
  const done = await run(atOutcome, actOf(alice, w.P), [{ outcome: 'reviewed' }]);
  assert.deepEqual(done.workflow.entries.filter((e) => e.entryKind === 'action'), []);
  assert.deepEqual(await rs.listSchedules(done.body), []);
  assert.deepEqual(differences(atOutcome.body, done.body), [`${KIND}/${done.workflow.id}`], 'only the workflow record changes');
});

test('a hazard linked to the platform after a review began is outstanding, and one deleted after is no longer asked for (C-008)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  const decided = await run(await start(w.body, act, 'review-data', platformRef(w.P)), act, [
    { step: 'review-the-hazards', hazardId: w.H1, note: 'ok' },
    { step: 'review-the-hazards', hazardId: w.H2, note: 'ok' },
    { step: 'review-the-hazards', hazardId: w.H3, note: 'ok' },
  ]);
  assert.equal((await wf.stepDemand(decided.body, decided.workflow.id)).satisfied, true);

  const linked = (await withClock(HELD, () => registry.linkHazardToPlatform(decided.body, act, { hazardId: w.H4, platformId: w.P }))).body;
  const demand = await wf.stepDemand(linked, decided.workflow.id);
  assert.deepEqual(demand, { step: 'review-the-hazards', satisfied: false, outstanding: [hazardRef(w.H4)] });
  await assertRefused(() => withClock(HELD, () => wf.advanceStep(linked, act, decided.workflow.id)), wf.StepIncompleteError, linked, 'the new hazard is outstanding');

  const started = await start(w.body, act, 'review-data', platformRef(w.P));
  const deleted = (await withClock(HELD, () => registry.deleteHazard(started.body, act, w.H3))).body;
  assert.deepEqual([...(await wf.stepDemand(deleted, started.workflow.id)).outstanding], [hazardRef(w.H1), hazardRef(w.H2)].sort((a, b) => (a.id < b.id ? -1 : 1)));
});

test('add-data completes with no causal factor, consequence, or control, and onboard-platform with no hazard (C-008)', async () => {
  const w = await buildWorld();
  const act = actOf(bob, null);
  const added = await run(await start(w.body, act, 'add-data', null), act, [{ step: 'name-the-hazard', title: 'Bare' }, 'advance', 'advance', 'advance', { outcome: 'a bare hazard' }]);
  assert.equal(added.workflow.state, 'complete');
  assert.equal(added.workflow.entries.length, 2);
  const onboarded = await run(await start(w.body, act, 'onboard-platform', null), act, [{ step: 'name-the-platform', name: 'Bare', ownerProfileId: bob.id }, 'advance', 'advance', { outcome: 'no hazards yet' }]);
  assert.equal(onboarded.workflow.state, 'complete');
});

test('a removal of a control confirmed for one hazard only demands that one settlement and makes one exclusion (C-007, C-008)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.Q);
  const change = await run(await start(w.body, act, 'remove-control', platformRef(w.Q)), act, [{ step: 'choose-the-control', controlId: w.C }, 'advance']);
  assert.deepEqual(await wf.stepDemand(change.body, change.workflow.id), { step: 'settle-the-ratings', satisfied: false, outstanding: [hazardRef(w.H1)] }, 'H2 is on Q but C only awaits there');
  const done = await run(change, act, [
    { step: 'settle-the-ratings', hazardId: w.H1, consequence: 5, likelihood: 'G' }, 'advance',
    { step: 'record-the-reason', text: 'not fitted on Q' }, 'advance', { outcome: 'removed' },
  ]);
  const { rows } = await registry.listPlatformHazards(done.body, w.Q);
  assert.equal(rows.find((r) => r.hazard.id === w.H1)?.controls.find((c) => c.control.id === w.C)?.state, 'excluded');
  assert.equal(done.workflow.entries.filter((e) => e.entryKind === 'action' && e.step === 'record-the-outcome').length, 1);
});

test('a settled hazard no longer carrying the control confirmed at completion — excluded since, or deleted since — is not excluded from and gets no action entry, and its settlement stands (C-007, C-011; DEC-038)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  for (const [what, change] of /** @type {const} */ ([
    ['excluded since', (/** @type {any} */ b) => registry.excludeControlFromPlatform(b, act, { hazardId: w.H2, controlId: w.C, platformId: w.P, text: 'taken off directly' })],
    ['deleted since', (/** @type {any} */ b) => registry.deleteHazard(b, act, w.H2)],
  ])) {
    const atOutcome = await removalAtOutcome(w);
    const body = (await withClock(HELD, () => change(atOutcome.body))).body;
    assert.deepEqual(await wf.stepDemand(body, atOutcome.workflow.id), { step: 'record-the-outcome', satisfied: false, outstanding: [] }, `${what}: nothing outstanding`);
    const done = await withClock(HELD, () => wf.completeWorkflow(body, act, atOutcome.workflow.id, { outcome: 'removed' }));
    const actions = done.workflow.entries.filter((e) => e.entryKind === 'action' && e.step === 'record-the-outcome');
    assert.equal(actions.length, 1, `${what}: one exclusion, for H1 only`);
    const { rows } = await registry.listPlatformHazards(done.body, w.P);
    const h1 = rows.find((r) => r.hazard.id === w.H1)?.controls.find((c) => c.control.id === w.C);
    assert.equal(h1?.state, 'excluded', `${what}: H1 is excluded`);
    assert.deepEqual(actions[0].ref, { kind: 'justification', id: h1?.justification?.id });
    assert.deepEqual(done.workflow.entries.slice(0, atOutcome.workflow.entries.length), atOutcome.workflow.entries, `${what}: every earlier entry, H2's settlement among them, stands`);
  }
});

test('a removal whose control is on no hazard of the platform at completion makes no exclusion and completes with no exclusion action entry (C-007; DEC-038)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  const atOutcome = await removalAtOutcome(w);
  let body = atOutcome.body;
  for (const h of [w.H1, w.H2]) body = (await withClock(HELD, () => registry.excludeControlFromPlatform(body, act, { hazardId: h, controlId: w.C, platformId: w.P, text: 'gone' }))).body;
  const done = await withClock(HELD, () => wf.completeWorkflow(body, act, atOutcome.workflow.id, { outcome: 'nothing left to remove' }));
  assert.equal(done.workflow.state, 'complete');
  assert.deepEqual(done.workflow.entries.filter((e) => e.entryKind === 'action' && e.step === 'record-the-outcome'), []);
  assert.deepEqual(differences(body, done.body), [`${KIND}/${done.workflow.id}`], 'only the workflow record changes');
});

test('completedOnAest is the AEST calendar date at the last second of a day and the first second of the next (C-005; SL-07 criterion 4; ASM-005)', async () => {
  const w = await buildWorld();
  const atOutcome = await reviewAtOutcome(w);
  const act = actOf(alice, w.P);
  for (const [at, date] of [['2026-12-31T23:59:59+10:00', '2026-12-31'], ['2027-01-01T00:00:00+10:00', '2027-01-01']]) {
    const done = await withClock(/** @type {any} */ (at), () => wf.completeWorkflow(atOutcome.body, act, atOutcome.workflow.id, { outcome: 'x' }));
    assert.equal(done.workflow.completedOnAest, date, at);
    assert.equal(done.workflow.startedOnAest, '2026-09-15', 'startedOnAest is not moved by completion');
  }
});

test('a one-character outcome, and an outcome with inner whitespace kept, are accepted and stored trimmed (C-005)', async () => {
  const w = await buildWorld();
  const atOutcome = await reviewAtOutcome(w);
  const act = actOf(alice, w.P);
  const one = await withClock(HELD, () => wf.completeWorkflow(atOutcome.body, act, atOutcome.workflow.id, { outcome: ' x ' }));
  assert.equal(one.workflow.outcome, 'x');
  const inner = await withClock(HELD, () => wf.completeWorkflow(atOutcome.body, act, atOutcome.workflow.id, { outcome: '  two\n lines ' }));
  assert.equal(inner.workflow.outcome, 'two\n lines');
});

test('every operation accepts a deeply frozen body and leaves it deep-equal; the returned body survives a JSON round trip unchanged (C-003)', async () => {
  const w = await buildWorld();
  let body = await scheduled(w.body, platformRef(w.P));
  const act = actOf(alice, w.P);
  const started = await start(body, act, 'review-data', platformRef(w.P));
  body = deepFreeze(started.body);
  const before = snapshot(body);
  const id = started.workflow.id;
  let b = (await withClock(HELD, () => wf.submitStep(body, act, id, { step: 'review-the-hazards', hazardId: w.H1, note: 'ok' }))).body;
  for (const h of [w.H2, w.H3]) b = (await withClock(HELD, () => wf.submitStep(deepFreeze(b), act, id, { step: 'review-the-hazards', hazardId: h, note: 'ok' }))).body;
  b = (await withClock(HELD, () => wf.advanceStep(deepFreeze(b), act, id))).body;
  await wf.progressOf(deepFreeze(b), id);
  await wf.stepDemand(b, id);
  await wf.reviewOmissions(b, id);
  await wf.listWorkflows(b);
  const done = await withClock(HELD, () => wf.completeWorkflow(deepFreeze(b), act, id, { outcome: 'done' }));
  assert.deepEqual(body, before);
  assert.deepEqual(jsonRoundTrip(done.body), done.body, 'the body carries across a save and a load (store C-001)');
  const abandoned = await withClock(HELD, () => wf.abandonWorkflow(deepFreeze(started.body), act, id));
  assert.deepEqual(jsonRoundTrip(abandoned.body), abandoned.body);
});

test('a workflow in progress continues after its body is saved and loaded as JSON (C-003; store C-001)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  const partway = await run(await start(w.body, act, 'remove-control', platformRef(w.P)), act, [{ step: 'choose-the-control', controlId: w.C }, 'advance']);
  const loaded = jsonRoundTrip(partway.body);
  const done = await run({ body: loaded, workflow: partway.workflow }, act, [
    { step: 'settle-the-ratings', hazardId: w.H1, consequence: 3, likelihood: 'C' },
    { step: 'settle-the-ratings', hazardId: w.H2, consequence: 1, likelihood: 'A' }, 'advance',
    { step: 'record-the-reason', text: 'why' }, 'advance', { outcome: 'done' },
  ]);
  assert.equal(done.workflow.state, 'complete');
});

test('no operation reads or writes the browser\'s storage (C-003; DEC-006)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  const { uses } = await withBrowserStorageSpies(async () => {
    const done = await run(await reviewAtOutcome(w), act, [{ outcome: 'done' }]);
    await wf.listWorkflows(done.body);
    await wf.getWorkflow(done.body, done.workflow.id);
    await wf.progressOf(done.body, done.workflow.id);
    await wf.reviewOmissions(done.body, done.workflow.id);
    const other = await start(done.body, act, 'transfer-ownership', platformRef(w.P));
    await wf.stepDemand(other.body, other.workflow.id);
    await withClock(HELD, () => wf.abandonWorkflow(other.body, act, other.workflow.id));
  });
  assert.deepEqual(uses, []);
});

test('WORKFLOW_KINDS, WORKFLOW_STEPS and its lists, and SUBJECT_KINDS are frozen, so no caller can add a kind or a step (C-001, C-002)', () => {
  assert.ok(Object.isFrozen(wf.WORKFLOW_KINDS));
  assert.ok(Object.isFrozen(wf.WORKFLOW_STEPS));
  for (const kind of wf.WORKFLOW_KINDS) assert.ok(Object.isFrozen(wf.WORKFLOW_STEPS[kind]), kind);
  assert.ok(Object.isFrozen(wf.SUBJECT_KINDS));
});

test('a review\'s act is passed to review-schedule with madeForPlatformId null when the act was made for no platform (C-006, DEC-016)', async () => {
  const w = await buildWorld();
  const body = await scheduled(w.body, platformRef(w.P));
  const act = actOf(alice, null);
  const atOutcome = await run(await start(body, act, 'review-data', platformRef(w.P)), act, [
    { step: 'review-the-hazards', hazardId: w.H1, note: 'ok' }, { step: 'review-the-hazards', hazardId: w.H2, note: 'ok' }, { step: 'review-the-hazards', hazardId: w.H3, note: 'ok' }, 'advance',
  ]);
  const done = await run(atOutcome, act, [{ outcome: 'done' }]);
  const schedule = await rs.getSchedule(done.body, platformRef(w.P));
  assert.equal(schedule?.lastReviewedAest, '2026-09-15');
  const { changeLog } = await import('./harness.js');
  const history = await changeLog.listHistory(done.body, { kind: 'review-schedule', id: /** @type {string} */ (schedule?.id) });
  assert.equal(history.at(-1)?.entryKind, 'record-change');
  assert.equal(/** @type {any} */ (history.at(-1)).madeForPlatformId, null);
});
