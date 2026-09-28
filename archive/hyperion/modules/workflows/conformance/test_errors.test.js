/**
 * workflows conformance: errors (CORE-CON-002). Every row of section 4 of
 * modules/workflows/CONTRACT.md, each asserting the named error class, what it carries where the
 * row names it, and that the body passed in is unchanged; C-009's all-or-nothing completion; then
 * the order section 4 gives when two conditions hold at once, using only pairs whose order the
 * contract states. Written from the contract before any implementation (P8).
 *
 * The null double must fail this file (CORE-TST-002, rung 1).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  COMPLETE, HELD, KIND, actOf, alice, assertRefused, bob, buildWorld, changeLog, hazardRef, orderedUuid, platformRef, registry,
  removalAtOutcome, reviewAtOutcome, rs, run, scheduled, schema, snapshot, start, wf, withClock, withOmittedHazard,
  withUnreadableLog, withUnreadableSchedules, withWorkflows, workflowRow,
} from './harness.js';

/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */

const P0 = orderedUuid(1, 0xa);

/**
 * Every operation of section 2, with well-formed arguments for workflow `id` on `body`.
 * @param {DataBody} body
 * @param {string} id
 * @param {import('../../registry/contract.js').Act} [act]
 * @returns {[string, () => Promise<unknown>][]}
 */
function everyOperation(body, id, act = actOf(alice)) {
  const i = /** @type {any} */ (id);
  return [
    ['startWorkflow', () => withClock(HELD, () => wf.startWorkflow(body, act, { workflowKind: 'add-data', subject: null }))],
    ['submitStep', () => withClock(HELD, () => wf.submitStep(body, act, i, { step: 'review-the-hazards', hazardId: /** @type {any} */ ('H-0001'), note: 'ok' }))],
    ['advanceStep', () => withClock(HELD, () => wf.advanceStep(body, act, i))],
    ['completeWorkflow', () => withClock(HELD, () => wf.completeWorkflow(body, act, i, { outcome: 'done' }))],
    ['abandonWorkflow', () => withClock(HELD, () => wf.abandonWorkflow(body, act, i))],
    ['getWorkflow', () => wf.getWorkflow(body, i)],
    ['listWorkflows', () => wf.listWorkflows(body)],
    ['progressOf', () => wf.progressOf(body, i)],
    ['stepDemand', () => wf.stepDemand(body, i)],
    ['reviewOmissions', () => wf.reviewOmissions(body, i)],
  ];
}

/**
 * The five changing operations for workflow `id`, called with `act`.
 * @param {DataBody} body
 * @param {string} id
 * @param {unknown} act
 * @returns {[string, () => Promise<unknown>][]}
 */
function everyChange(body, id, act) {
  const a = /** @type {any} */ (act);
  const i = /** @type {any} */ (id);
  return [
    ['startWorkflow', () => withClock(HELD, () => wf.startWorkflow(body, a, { workflowKind: 'add-data', subject: null }))],
    ['submitStep', () => withClock(HELD, () => wf.submitStep(body, a, i, { step: 'name-the-hazard', title: 'A hazard' }))],
    ['advanceStep', () => withClock(HELD, () => wf.advanceStep(body, a, i))],
    ['completeWorkflow', () => withClock(HELD, () => wf.completeWorkflow(body, a, i, { outcome: 'done' }))],
    ['abandonWorkflow', () => withClock(HELD, () => wf.abandonWorkflow(body, a, i))],
  ];
}

// ------------------------------------------------------------------ malformed workflow record (C-004)

/** @type {[string, Record<string, unknown> | ((row: any) => void)][]} each way C-004 names a record malformed */
const MALFORMED = [
  ['its id is not a WorkflowRecordId', { id: 'W-1' }],
  ['its kind is not workflow-record', { kind: 'hazard' }],
  ['its status is not a RecordStatus', { status: 'archived' }],
  ['createdBy is not a user profile id', { createdBy: 'alice' }],
  ['updatedBy is not a user profile id', { updatedBy: null }],
  ['createdAtAest is not a TimestampAest', { createdAtAest: '2026-09-01T08:00:00Z' }],
  ['updatedAtAest is not a TimestampAest', { updatedAtAest: 20260901 }],
  ['workflowKind is outside WORKFLOW_KINDS', { workflowKind: 'audit' }],
  ['subject is neither null nor a record kind and a string id', { subject: { kind: 'widget', id: 'x' } }],
  ['subject has an id that is not a string', { subject: { kind: 'platform', id: 7 } }],
  ['state is outside the two', { state: 'paused' }],
  ['currentStep is not a step of its kind\'s list', { currentStep: 'choose-the-owner' }],
  ['currentStep is null while in progress', { currentStep: null }],
  ['currentStep is not null while complete', { ...COMPLETE, currentStep: 'record-the-outcome' }],
  ['startedOnAest is not a DateAest', { startedOnAest: '2026-02-30' }],
  ['completedOnAest is neither null nor a DateAest', { ...COMPLETE, completedOnAest: '17/09/2026' }],
  ['completedBy is neither null nor a user profile id', { ...COMPLETE, completedBy: 'bob' }],
  ['outcome is neither null nor a string', { ...COMPLETE, outcome: 42 }],
  ['entries holds an entry that is not a WorkflowEntry', { entries: [{ step: 'review-the-hazards', entryKind: 'remark', text: 'x', ref: null, byProfileId: alice.id, atAest: HELD }] }],
  ['entries holds an entry with no byProfileId', (row) => { row.entries = [{ step: 'review-the-hazards', entryKind: 'decision', text: 'x', ref: null, atAest: HELD }]; }],
  ['entries is not an array', { entries: 'none' }],
];

test('a malformed workflow record makes every operation reject with MalformedWorkflowError naming its key, whichever record is asked about (C-004, section 4)', async () => {
  const good = orderedUuid(1, 0xc);
  const bad = orderedUuid(2, 0xc);
  for (const [what, change] of MALFORMED) {
    const row = /** @type {any} */ (workflowRow(bad));
    if (typeof change === 'function') change(row);
    else Object.assign(row, change);
    const body = withWorkflows(schema.emptyDataBody(), [workflowRow(good), [bad, row]]);
    for (const [name, call] of everyOperation(body, good)) {
      const e = await assertRefused(call, wf.MalformedWorkflowError, body, `${what}: ${name}`);
      assert.equal(e.key, bad, `${what}: ${name} names the entry's key`);
      assert.equal(typeof e.detail, 'string');
    }
  }
});

test('an entry whose key differs from its id is malformed (C-004)', async () => {
  const key = orderedUuid(3, 0xc);
  const body = withWorkflows(schema.emptyDataBody(), [[key, workflowRow(orderedUuid(4, 0xc))]]);
  const e = await assertRefused(() => wf.listWorkflows(body), wf.MalformedWorkflowError, body, 'key and id differ');
  assert.equal(e.key, key);
});

// ------------------------------------------------------------------ unknown, complete, not live (C-004, C-011, C-012)

test('every operation but startWorkflow, getWorkflow, and listWorkflows rejects an id no record has with UnknownWorkflowError; getWorkflow resolves with null (section 4)', async () => {
  const w = await buildWorld();
  const { body } = await start(w.body, actOf(alice), 'review-data', platformRef(w.P));
  const missing = orderedUuid(99, 0xc);
  for (const [name, call] of everyOperation(body, missing)) {
    if (name === 'startWorkflow' || name === 'listWorkflows') continue;
    if (name === 'getWorkflow') {
      assert.equal(await call(), null, 'getWorkflow of an id nothing has is null');
      continue;
    }
    const e = await assertRefused(call, wf.UnknownWorkflowError, body, name);
    assert.equal(e.given, missing, `${name} names the value`);
  }
});

test('every changing operation and stepDemand refuse a complete workflow with WorkflowCompleteError carrying its id, changing nothing (C-011, section 4; SL-07 criterion 4; REQ-039)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  const done = await run(await reviewAtOutcome(w), act, [{ outcome: 'done' }]);
  const id = done.workflow.id;
  /** @type {[string, () => Promise<unknown>][]} */
  const calls = [
    ['submitStep', () => withClock(HELD, () => wf.submitStep(done.body, act, id, { step: 'review-the-hazards', hazardId: w.H1, note: 'again' }))],
    ['advanceStep', () => withClock(HELD, () => wf.advanceStep(done.body, act, id))],
    ['completeWorkflow', () => withClock(HELD, () => wf.completeWorkflow(done.body, act, id, { outcome: 'rewritten' }))],
    ['abandonWorkflow', () => withClock(HELD, () => wf.abandonWorkflow(done.body, actOf(bob, null), id))],
    ['stepDemand', () => wf.stepDemand(done.body, id)],
  ];
  for (const [name, call] of calls) {
    const e = await assertRefused(call, wf.WorkflowCompleteError, done.body, name);
    assert.equal(e.id, id, `${name} carries the id`);
  }
});

test('every changing operation but startWorkflow, and stepDemand, refuse an abandoned workflow with WorkflowNotLiveError carrying the id and the status (C-012, section 4)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  const started = await start(w.body, act, 'review-data', platformRef(w.P));
  const gone = await withClock(HELD, () => wf.abandonWorkflow(started.body, act, started.workflow.id));
  const id = gone.workflow.id;
  /** @type {[string, () => Promise<unknown>][]} */
  const calls = [
    ['submitStep', () => withClock(HELD, () => wf.submitStep(gone.body, act, id, { step: 'review-the-hazards', hazardId: w.H1, note: 'ok' }))],
    ['advanceStep', () => withClock(HELD, () => wf.advanceStep(gone.body, act, id))],
    ['completeWorkflow', () => withClock(HELD, () => wf.completeWorkflow(gone.body, act, id, { outcome: 'done' }))],
    ['abandonWorkflow', () => withClock(HELD, () => wf.abandonWorkflow(gone.body, act, id))],
    ['stepDemand', () => wf.stepDemand(gone.body, id)],
  ];
  for (const [name, call] of calls) {
    const e = await assertRefused(call, wf.WorkflowNotLiveError, gone.body, name);
    assert.equal(e.id, id);
    assert.equal(e.status, 'deleted');
  }
});

// ------------------------------------------------------------------ the act (C-010, DEC-016)

test('every changing operation refuses a missing act, a missing profile, or a profile id that is not a user profile id with MissingProfileError (section 4; REQ-055)', async () => {
  const w = await buildWorld();
  const { body, workflow } = await start(w.body, actOf(alice), 'add-data', null);
  const acts = [undefined, null, { madeForPlatformId: null }, { profile: null, madeForPlatformId: null }, { profile: { id: 'alice', name: 'Alice' }, madeForPlatformId: null }, { profile: { name: 'Alice' }, madeForPlatformId: null }];
  for (const act of acts) {
    for (const [name, call] of everyChange(body, workflow.id, act)) {
      await assertRefused(call, wf.MissingProfileError, body, `${name} with act ${JSON.stringify(act)}`);
    }
  }
});

test('every changing operation refuses an act whose madeForPlatformId is absent or is neither null nor a platform id with InvalidActError naming the value (section 4; DEC-016)', async () => {
  const w = await buildWorld();
  const { body, workflow } = await start(w.body, actOf(alice), 'add-data', null);
  for (const act of [{ profile: alice }, { profile: alice, madeForPlatformId: undefined }, { profile: alice, madeForPlatformId: 'P' }, { profile: alice, madeForPlatformId: 3 }]) {
    for (const [name, call] of everyChange(body, workflow.id, act)) {
      await assertRefused(call, wf.InvalidActError, body, `${name} with act ${JSON.stringify(act)}`);
    }
  }
});

// ------------------------------------------------------------------ startWorkflow (C-001)

test('startWorkflow refuses a kind outside WORKFLOW_KINDS with UnknownWorkflowKindError naming the value (C-001, section 4; REQ-037)', async () => {
  const w = await buildWorld();
  for (const kind of ['audit', 'Review-Data', '', null, undefined]) {
    const e = await assertRefused(() => withClock(HELD, () => wf.startWorkflow(w.body, actOf(alice), { workflowKind: /** @type {any} */ (kind), subject: null })), wf.UnknownWorkflowKindError, w.body, `kind ${String(kind)}`);
    assert.equal(e.given, kind);
  }
});

test('startWorkflow refuses a subject the kind does not take with InvalidSubjectError carrying the kind and the value (C-001, section 4)', async () => {
  const w = await buildWorld();
  const retired = await withClock(HELD, async () => {
    const made = await registry.createPlatform(w.body, actOf(alice), { name: 'Old', ownerProfileId: alice.id });
    const gone = await registry.retirePlatform(made.body, actOf(alice), made.platform.id);
    return { body: gone.body, id: made.platform.id };
  });
  /** @type {[string, DataBody, string, unknown][]} */
  const cases = [
    ['subject absent', w.body, 'review-data', undefined],
    ['null for review-data', w.body, 'review-data', null],
    ['null for remove-control', w.body, 'remove-control', null],
    ['null for transfer-ownership', w.body, 'transfer-ownership', null],
    ['a platform for add-data', w.body, 'add-data', platformRef(w.P)],
    ['a hazard for onboard-platform', w.body, 'onboard-platform', hazardRef(w.H1)],
    ['a hazard for review-data', w.body, 'review-data', hazardRef(w.H1)],
    ['a kind outside SUBJECT_KINDS', w.body, 'review-data', { kind: 'control', id: w.C }],
    ['a platform id nothing has', w.body, 'review-data', platformRef(P0)],
    ['a retired platform', retired.body, 'transfer-ownership', platformRef(retired.id)],
  ];
  for (const [what, body, workflowKind, subject] of cases) {
    const fields = /** @type {any} */ (subject === undefined ? { workflowKind } : { workflowKind, subject });
    const e = await assertRefused(() => withClock(HELD, () => wf.startWorkflow(body, actOf(alice), fields)), wf.InvalidSubjectError, body, what);
    assert.equal(e.workflowKind, workflowKind, `${what}: carries the kind`);
    assert.deepEqual(e.given, subject, `${what}: carries the value`);
  }
});

// ------------------------------------------------------------------ submitStep (C-004, C-006, C-007)

test('submitStep refuses a submission for a step the workflow is not at with WrongStepError carrying the expected step and the value (C-004, section 4)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  const { body, workflow } = await start(w.body, act, 'remove-control', platformRef(w.P));
  for (const submission of [{ step: 'settle-the-ratings', hazardId: w.H1, consequence: 3, likelihood: 'C' }, { step: 'record-the-reason', text: 'x' }, { step: 'record-the-outcome' }, { step: 'review-the-hazards', hazardId: w.H1, note: 'x' }]) {
    const e = await assertRefused(() => withClock(HELD, () => wf.submitStep(body, act, workflow.id, /** @type {any} */ (submission))), wf.WrongStepError, body, submission.step);
    assert.equal(e.expected, 'choose-the-control');
    assert.equal(e.given, submission.step);
  }
});

test('a second submission for a record a step has already recorded is refused with AlreadyRecordedError carrying the step and the ref, at every step that names a record (C-004, section 4; SL-07 criterion 4)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);

  const review = await run(await start(w.body, act, 'review-data', platformRef(w.P)), act, [{ step: 'review-the-hazards', hazardId: w.H1, note: 'ok' }]);
  let e = await assertRefused(() => withClock(HELD, () => wf.submitStep(review.body, act, review.workflow.id, { step: 'review-the-hazards', hazardId: w.H1, note: 'a second opinion' })), wf.AlreadyRecordedError, review.body, 'a hazard reviewed twice');
  assert.equal(e.step, 'review-the-hazards');
  assert.deepEqual(e.ref, hazardRef(w.H1));

  const removal = await run(await start(w.body, act, 'remove-control', platformRef(w.P)), act, [{ step: 'choose-the-control', controlId: w.C }]);
  e = await assertRefused(() => withClock(HELD, () => wf.submitStep(removal.body, act, removal.workflow.id, { step: 'choose-the-control', controlId: w.C })), wf.AlreadyRecordedError, removal.body, 'a control chosen twice');
  assert.equal(e.step, 'choose-the-control');

  const settling = await run(removal, act, ['advance', { step: 'settle-the-ratings', hazardId: w.H2, consequence: 4, likelihood: 'E' }]);
  e = await assertRefused(() => withClock(HELD, () => wf.submitStep(settling.body, act, settling.workflow.id, { step: 'settle-the-ratings', hazardId: w.H2, consequence: 4, likelihood: 'E' })), wf.AlreadyRecordedError, settling.body, 'a residual settled twice');
  assert.deepEqual(e.ref, hazardRef(w.H2));

  const reasoned = await run(settling, act, [{ step: 'settle-the-ratings', hazardId: w.H1, consequence: 3, likelihood: 'C' }, 'advance', { step: 'record-the-reason', text: 'first reason' }]);
  e = await assertRefused(() => withClock(HELD, () => wf.submitStep(reasoned.body, act, reasoned.workflow.id, { step: 'record-the-reason', text: 'second reason' })), wf.AlreadyRecordedError, reasoned.body, 'a reason written twice');
  assert.equal(e.step, 'record-the-reason');

  const transfer = await run(await start(w.body, act, 'transfer-ownership', platformRef(w.P)), act, [{ step: 'choose-the-owner', ownerProfileId: bob.id }]);
  e = await assertRefused(() => withClock(HELD, () => wf.submitStep(transfer.body, act, transfer.workflow.id, { step: 'choose-the-owner', ownerProfileId: bob.id })), wf.AlreadyRecordedError, transfer.body, 'an owner chosen twice, before registry\'s NoChangeError');
  assert.equal(e.step, 'choose-the-owner');

  const onboard = await run(await start(w.body, actOf(alice), 'onboard-platform', null), actOf(alice), [{ step: 'name-the-platform', name: 'R', ownerProfileId: alice.id }, 'advance', { step: 'select-hazards', hazardId: w.H1 }]);
  e = await assertRefused(() => withClock(HELD, () => wf.submitStep(onboard.body, actOf(alice), onboard.workflow.id, { step: 'select-hazards', hazardId: w.H1 })), wf.AlreadyRecordedError, onboard.body, 'a hazard selected twice, before registry\'s DuplicateLinkError');
  assert.deepEqual(e.ref, hazardRef(w.H1));

  const adding = await run(await start(w.body, act, 'add-data', null), act, [{ step: 'name-the-hazard', title: 'New' }, 'advance', 'advance', { step: 'choose-controls', controlId: w.E, controlKind: 'preventative' }]);
  e = await assertRefused(() => withClock(HELD, () => wf.submitStep(adding.body, act, adding.workflow.id, { step: 'choose-controls', controlId: w.E, controlKind: 'preventative' })), wf.AlreadyRecordedError, adding.body, 'a control chosen twice for the new hazard, before registry\'s DuplicateLinkError');
  assert.equal(e.step, 'choose-controls');
});

test('a step that takes one record refuses any second submission, whatever record or text it names, with AlreadyRecordedError carrying the ref already recorded, null for record-the-reason; no second hazard or platform is created and the subject does not move (C-004, section 4; DEC-038)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);

  const named = await run(await start(w.body, act, 'add-data', null), act, [{ step: 'name-the-hazard', title: 'First' }]);
  let e = await assertRefused(() => withClock(HELD, () => wf.submitStep(named.body, act, named.workflow.id, { step: 'name-the-hazard', title: 'Second' })), wf.AlreadyRecordedError, named.body, 'a second hazard named');
  assert.equal(e.step, 'name-the-hazard');
  assert.deepEqual(e.ref, named.workflow.subject, 'carries the hazard already recorded');

  const platform = await run(await start(w.body, actOf(alice), 'onboard-platform', null), actOf(alice), [{ step: 'name-the-platform', name: 'R', ownerProfileId: alice.id }]);
  e = await assertRefused(() => withClock(HELD, () => wf.submitStep(platform.body, actOf(alice), platform.workflow.id, { step: 'name-the-platform', name: 'S', ownerProfileId: bob.id })), wf.AlreadyRecordedError, platform.body, 'a second platform named');
  assert.equal(e.step, 'name-the-platform');
  assert.deepEqual(e.ref, platform.workflow.subject);

  const dConfirmed = (await withClock(HELD, () => registry.confirmControlForPlatform(w.body, act, { hazardId: w.H3, controlId: w.D, platformId: w.P }))).body;
  const chosen = await run(await start(dConfirmed, act, 'remove-control', platformRef(w.P)), act, [{ step: 'choose-the-control', controlId: w.C }]);
  e = await assertRefused(() => withClock(HELD, () => wf.submitStep(chosen.body, act, chosen.workflow.id, { step: 'choose-the-control', controlId: w.D })), wf.AlreadyRecordedError, chosen.body, 'a different control chosen, though D is confirmed on P');
  assert.equal(e.step, 'choose-the-control');
  assert.deepEqual(e.ref, { kind: 'control', id: w.C });

  const owner = await run(await start(w.body, act, 'transfer-ownership', platformRef(w.P)), act, [{ step: 'choose-the-owner', ownerProfileId: bob.id }]);
  e = await assertRefused(() => withClock(HELD, () => wf.submitStep(owner.body, act, owner.workflow.id, { step: 'choose-the-owner', ownerProfileId: alice.id })), wf.AlreadyRecordedError, owner.body, 'a different owner chosen');
  assert.equal(e.step, 'choose-the-owner');
  assert.deepEqual(e.ref, owner.workflow.entries[0].ref);

  const reasoned = await run(chosen, act, [
    'advance', { step: 'settle-the-ratings', hazardId: w.H1, consequence: 3, likelihood: 'C' }, { step: 'settle-the-ratings', hazardId: w.H2, consequence: 3, likelihood: 'C' }, 'advance',
    { step: 'record-the-reason', text: 'first' },
  ]);
  e = await assertRefused(() => withClock(HELD, () => wf.submitStep(reasoned.body, act, reasoned.workflow.id, { step: 'record-the-reason', text: 'a different reason' })), wf.AlreadyRecordedError, reasoned.body, 'a different reason written');
  assert.equal(e.ref, null, 'null for record-the-reason');
});

test('completing a removal while a hazard carries the chosen control confirmed on the platform with no settlement rejects with StepIncompleteError for settle-the-ratings carrying every such ref, makes no exclusion, and stepDemand names the same refs (C-007, C-008, section 4; REQ-077, DEC-038)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  const atOutcome = await removalAtOutcome(w);
  let body = atOutcome.body;
  body = await withClock(HELD, async () => {
    let b = body;
    for (const h of [w.H4, w.H3]) {
      if (h === w.H4) b = (await registry.linkHazardToPlatform(b, act, { hazardId: h, platformId: w.P })).body;
      b = (await registry.linkControlToHazard(b, act, { hazardId: h, controlId: w.C, controlKind: 'mitigating' })).body;
      b = (await registry.confirmControlForPlatform(b, act, { hazardId: h, controlId: w.C, platformId: w.P })).body;
    }
    return b;
  });
  const unsettled = [hazardRef(w.H3), hazardRef(w.H4)].sort((a, b) => (a.id < b.id ? -1 : 1));

  assert.deepEqual(await wf.stepDemand(body, atOutcome.workflow.id), { step: 'record-the-outcome', satisfied: false, outstanding: unsettled }, 'the demand at record-the-outcome names what completion would refuse');
  const e = await assertRefused(() => withClock(HELD, () => wf.completeWorkflow(body, act, atOutcome.workflow.id, { outcome: 'removed' })), wf.StepIncompleteError, body, 'a confirmed hazard with no settlement');
  assert.equal(e.step, 'settle-the-ratings');
  assert.deepEqual([...e.outstanding], unsettled);
  const { rows } = await registry.listPlatformHazards(body, w.P);
  for (const row of rows) {
    const c = row.controls.find((x) => x.control.id === w.C);
    if (c) assert.equal(c.state, 'confirmed', `${row.hazard.id}: no exclusion was made`);
  }
  assert.equal((await wf.getWorkflow(body, atOutcome.workflow.id))?.currentStep, 'record-the-outcome');
});

test('review-the-hazards refuses a hazard that is not a row of the platform\'s query — not linked, not live, or omitted — with HazardNotInReviewError carrying both ids (C-006, section 4; HZ-004)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  const deleted = await withClock(HELD, () => registry.deleteHazard(w.body, act, w.H2));
  /** @type {[string, DataBody, string][]} */
  const cases = [
    ['a hazard on no platform', w.body, w.H4],
    ['a hazard nothing has', w.body, 'H-9999'],
    ['a deleted hazard', deleted.body, w.H2],
    ['an omitted hazard', withOmittedHazard(w.body, w.H3), w.H3],
  ];
  for (const [what, base, hazardId] of cases) {
    const { body, workflow } = await start(base, act, 'review-data', platformRef(w.P));
    const e = await assertRefused(() => withClock(HELD, () => wf.submitStep(body, act, workflow.id, { step: 'review-the-hazards', hazardId: /** @type {any} */ (hazardId), note: 'ok' })), wf.HazardNotInReviewError, body, what);
    assert.equal(e.hazardId, hazardId);
    assert.equal(e.platformId, w.P);
  }
});

test('review-the-hazards refuses a note that is empty once trimmed with InvalidNoteError naming the value (C-006, section 4)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  const { body, workflow } = await start(w.body, act, 'review-data', platformRef(w.P));
  for (const note of ['', '   ', '\n\t']) {
    const e = await assertRefused(() => withClock(HELD, () => wf.submitStep(body, act, workflow.id, { step: 'review-the-hazards', hazardId: w.H1, note })), wf.InvalidNoteError, body, JSON.stringify(note));
    assert.equal(e.given, note);
  }
});

test('choose-the-control refuses a control no row of the platform carries confirmed — awaiting, on no hazard, or unknown — with ControlNotOnPlatformError carrying both ids (C-007, section 4; registry C-021)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  const onQ = await start(w.body, act, 'remove-control', platformRef(w.Q));
  const excluded = await withClock(HELD, () => registry.excludeControlFromPlatform(w.body, act, { hazardId: w.H1, controlId: w.C, platformId: w.P, text: 'gone' }));
  const onlyH2 = await start(excluded.body, act, 'remove-control', platformRef(w.P));
  const onP = await start(w.body, act, 'remove-control', platformRef(w.P));
  /** @type {[string, { body: DataBody, workflow: any }, string, string][]} */
  const cases = [
    ['D is awaiting on P', onP, w.D, w.P],
    ['E is on no hazard', onP, w.E, w.P],
    ['an unknown control', onP, orderedUuid(7, 0xd), w.P],
  ];
  for (const [what, change, controlId, platformId] of cases) {
    const e = await assertRefused(() => withClock(HELD, () => wf.submitStep(change.body, act, change.workflow.id, { step: 'choose-the-control', controlId: /** @type {any} */ (controlId) })), wf.ControlNotOnPlatformError, change.body, what);
    assert.equal(e.controlId, controlId);
    assert.equal(e.platformId, platformId);
  }
  const fine = await run(onlyH2, act, [{ step: 'choose-the-control', controlId: w.C }]);
  assert.ok(fine, 'C still confirmed for H2 on P is a control that may be chosen');
  const fineOnQ = await run(onQ, act, [{ step: 'choose-the-control', controlId: w.C }]);
  assert.ok(fineOnQ, 'C confirmed for H1 on Q may be chosen on Q');
});

test('record-the-reason refuses a text that is empty once trimmed with InvalidReasonError naming the value (C-007, section 4; REQ-058)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  const atReason = await run(await start(w.body, act, 'remove-control', platformRef(w.P)), act, [
    { step: 'choose-the-control', controlId: w.C }, 'advance',
    { step: 'settle-the-ratings', hazardId: w.H1, consequence: 3, likelihood: 'C' },
    { step: 'settle-the-ratings', hazardId: w.H2, consequence: 3, likelihood: 'C' }, 'advance',
  ]);
  for (const text of ['', '  ']) {
    const e = await assertRefused(() => withClock(HELD, () => wf.submitStep(atReason.body, act, atReason.workflow.id, { step: 'record-the-reason', text })), wf.InvalidReasonError, atReason.body, JSON.stringify(text));
    assert.equal(e.given, text);
  }
});

test('when the registry operation a step names rejects, submitStep rejects with that error unchanged and writes nothing of its own (C-009, C-013, section 4)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  const adding = await start(w.body, act, 'add-data', null);
  await assertRefused(() => withClock(HELD, () => wf.submitStep(adding.body, act, adding.workflow.id, { step: 'name-the-hazard', title: '   ' })), registry.InvalidHazardTitleError, adding.body, 'a blank hazard title');

  const describing = await run(adding, act, [{ step: 'name-the-hazard', title: 'New' }, 'advance']);
  await assertRefused(() => withClock(HELD, () => wf.submitStep(describing.body, act, describing.workflow.id, { step: 'describe-the-hazard', part: 'causal-factor', text: '' })), registry.InvalidCausalFactorTextError, describing.body, 'a blank causal factor');
  await assertRefused(() => withClock(HELD, () => wf.submitStep(describing.body, act, describing.workflow.id, { step: 'describe-the-hazard', part: 'consequence', text: ' ' })), registry.InvalidConsequenceTextError, describing.body, 'a blank consequence');

  const choosing = await run(describing, act, ['advance']);
  await assertRefused(() => withClock(HELD, () => wf.submitStep(choosing.body, act, choosing.workflow.id, { step: 'choose-controls', controlId: w.E, controlKind: /** @type {any} */ ('corrective') })), registry.InvalidControlKindError, choosing.body, 'a control kind outside the two');

  const transfer = await start(w.body, act, 'transfer-ownership', platformRef(w.P));
  await assertRefused(() => withClock(HELD, () => wf.submitStep(transfer.body, act, transfer.workflow.id, { step: 'choose-the-owner', ownerProfileId: alice.id })), registry.NoChangeError, transfer.body, 'the owner the platform already has');

  const removal = await run(await start(w.body, act, 'remove-control', platformRef(w.P)), act, [{ step: 'choose-the-control', controlId: w.C }, 'advance']);
  await assertRefused(() => withClock(HELD, () => wf.submitStep(removal.body, act, removal.workflow.id, { step: 'settle-the-ratings', hazardId: w.H2, consequence: /** @type {any} */ (6), likelihood: 'A' })), registry.InvalidRatingValueError, removal.body, 'a consequence off the scale');
});

// ------------------------------------------------------------------ advanceStep, completeWorkflow (C-002, C-005, C-008)

test('advanceStep refuses an unmet demand with StepIncompleteError carrying the step and the outstanding refs (C-008, section 4; REQ-077)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  for (const [kind, subject, step] of /** @type {const} */ ([['add-data', null, 'name-the-hazard'], ['onboard-platform', null, 'name-the-platform'], ['remove-control', 'P', 'choose-the-control'], ['transfer-ownership', 'P', 'choose-the-owner']])) {
    const { body, workflow } = await start(w.body, act, kind, subject ? platformRef(w.P) : null);
    const e = await assertRefused(() => withClock(HELD, () => wf.advanceStep(body, act, workflow.id)), wf.StepIncompleteError, body, step);
    assert.equal(e.step, step);
    assert.deepEqual([...e.outstanding], [], `${step} names no record`);
  }
  const reason = await run(await start(w.body, act, 'remove-control', platformRef(w.P)), act, [
    { step: 'choose-the-control', controlId: w.C }, 'advance',
    { step: 'settle-the-ratings', hazardId: w.H1, consequence: 1, likelihood: 'A' },
    { step: 'settle-the-ratings', hazardId: w.H2, consequence: 1, likelihood: 'A' }, 'advance',
  ]);
  const e = await assertRefused(() => withClock(HELD, () => wf.advanceStep(reason.body, act, reason.workflow.id)), wf.StepIncompleteError, reason.body, 'record-the-reason');
  assert.equal(e.step, 'record-the-reason');
});

test('advanceStep at record-the-outcome rejects with LastStepError carrying the id (C-002, section 4)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  const atOutcome = await reviewAtOutcome(w);
  const e = await assertRefused(() => withClock(HELD, () => wf.advanceStep(atOutcome.body, act, atOutcome.workflow.id)), wf.LastStepError, atOutcome.body, 'advance past the last step');
  assert.equal(e.id, atOutcome.workflow.id);
});

test('completeWorkflow before record-the-outcome rejects with NotAtOutcomeError carrying the id and the step (C-005, section 4)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  const started = await start(w.body, act, 'review-data', platformRef(w.P));
  const decided = await run(started, act, [
    { step: 'review-the-hazards', hazardId: w.H1, note: 'ok' }, { step: 'review-the-hazards', hazardId: w.H2, note: 'ok' }, { step: 'review-the-hazards', hazardId: w.H3, note: 'ok' },
  ]);
  const e = await assertRefused(() => withClock(HELD, () => wf.completeWorkflow(decided.body, act, decided.workflow.id, { outcome: 'done' })), wf.NotAtOutcomeError, decided.body, 'every row decided but not advanced');
  assert.equal(e.id, decided.workflow.id);
  assert.equal(e.currentStep, 'review-the-hazards');
});

test('completeWorkflow refuses an outcome that is empty once trimmed with InvalidOutcomeError naming the value (C-005, section 4; REQ-038)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  const atOutcome = await reviewAtOutcome(w);
  for (const outcome of ['', '   ', '\n']) {
    const e = await assertRefused(() => withClock(HELD, () => wf.completeWorkflow(atOutcome.body, act, atOutcome.workflow.id, { outcome })), wf.InvalidOutcomeError, atOutcome.body, JSON.stringify(outcome));
    assert.equal(e.given, outcome);
  }
});

// ------------------------------------------------------------------ all or nothing (C-009, C-010)

test('a completion whose review-schedule act rejects rejects with that error, sets no date, writes no entry, and leaves the workflow at record-the-outcome, completable once the cause is cleared (C-009; SL-07 criterion 3)', async () => {
  const w = await buildWorld();
  let body = await scheduled(w.body, platformRef(w.P));
  body = await scheduled(body, hazardRef(w.H2));
  const atOutcome = await reviewAtOutcome(w, body);
  const act = actOf(alice, w.P);
  const spoiled = withUnreadableSchedules(atOutcome.body);

  await assertRefused(() => withClock(HELD, () => wf.completeWorkflow(spoiled, act, atOutcome.workflow.id, { outcome: 'done' })), rs.MalformedScheduleError, spoiled, 'a schedule review-schedule cannot read');
  const still = await wf.getWorkflow(spoiled, atOutcome.workflow.id);
  assert.equal(still?.currentStep, 'record-the-outcome');
  assert.equal(still?.state, 'in-progress');

  const done = await withClock(HELD, () => wf.completeWorkflow(atOutcome.body, act, atOutcome.workflow.id, { outcome: 'done' }));
  assert.equal(done.workflow.state, 'complete', 'the same workflow completes on the body without the cause');
});

test('a completion or any changing operation whose change-log write rejects rejects with MalformedEntryError and changes nothing (C-009, C-010, section 4; HZ-005)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);

  const removal = withUnreadableLog((await removalAtOutcome(w)).body);
  const removalId = (await wf.listWorkflows(removal))[0].id;
  await assertRefused(() => withClock(HELD, () => wf.completeWorkflow(removal, act, removalId, { outcome: 'removed' })), changeLog.MalformedEntryError, removal, 'completing a removal');

  const review = withUnreadableLog((await reviewAtOutcome(w, await scheduled(w.body, platformRef(w.P)))).body);
  const reviewId = (await wf.listWorkflows(review))[0].id;
  await assertRefused(() => withClock(HELD, () => wf.completeWorkflow(review, act, reviewId, { outcome: 'reviewed' })), changeLog.MalformedEntryError, review, 'completing a review');

  const empty = withUnreadableLog(w.body);
  await assertRefused(() => withClock(HELD, () => wf.startWorkflow(empty, act, { workflowKind: 'review-data', subject: platformRef(w.P) })), changeLog.MalformedEntryError, empty, 'startWorkflow');

  const started = await start(w.body, act, 'review-data', platformRef(w.P));
  const decided = await run(started, act, [{ step: 'review-the-hazards', hazardId: w.H1, note: 'ok' }]);
  const s1 = withUnreadableLog(started.body);
  await assertRefused(() => withClock(HELD, () => wf.submitStep(s1, act, started.workflow.id, { step: 'review-the-hazards', hazardId: w.H1, note: 'ok' })), changeLog.MalformedEntryError, s1, 'submitStep');
  const s2 = withUnreadableLog(await (async () => (await run(decided, act, [{ step: 'review-the-hazards', hazardId: w.H2, note: 'ok' }, { step: 'review-the-hazards', hazardId: w.H3, note: 'ok' }])).body)());
  await assertRefused(() => withClock(HELD, () => wf.advanceStep(s2, act, started.workflow.id)), changeLog.MalformedEntryError, s2, 'advanceStep');
  await assertRefused(() => withClock(HELD, () => wf.abandonWorkflow(s1, act, started.workflow.id)), changeLog.MalformedEntryError, s1, 'abandonWorkflow');

  const adding = await start(w.body, act, 'add-data', null);
  const s3 = withUnreadableLog(adding.body);
  await assertRefused(() => withClock(HELD, () => wf.submitStep(s3, act, adding.workflow.id, { step: 'name-the-hazard', title: 'x' })), changeLog.MalformedEntryError, s3, 'a step that makes a registry act');
});

// ------------------------------------------------------------------ precedence (section 4)

test('when two conditions hold, the one section 4 lists first is signalled (section 4)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  const bad = orderedUuid(5, 0xc);
  const started = await start(w.body, act, 'review-data', platformRef(w.P));

  const malformedAndNoProfile = withWorkflows(started.body, [[bad, { id: bad }]]);
  await assertRefused(() => withClock(HELD, () => wf.advanceStep(malformedAndNoProfile, /** @type {any} */ ({ madeForPlatformId: null }), started.workflow.id)), wf.MalformedWorkflowError, malformedAndNoProfile, 'a malformed record before a missing profile');

  await assertRefused(() => withClock(HELD, () => wf.advanceStep(started.body, /** @type {any} */ ({ profile: null }), started.workflow.id)), wf.MissingProfileError, started.body, 'a missing profile before an ill-formed act');

  await assertRefused(() => withClock(HELD, () => wf.advanceStep(started.body, /** @type {any} */ ({ profile: alice }), orderedUuid(99, 0xc))), wf.InvalidActError, started.body, 'an ill-formed act before an unknown workflow');

  const completeAndDeleted = withWorkflows(started.body, [workflowRow(orderedUuid(6, 0xc), { ...COMPLETE, status: 'deleted' })]);
  await assertRefused(() => withClock(HELD, () => wf.abandonWorkflow(completeAndDeleted, act, orderedUuid(6, 0xc))), wf.WorkflowCompleteError, completeAndDeleted, 'a complete workflow before one that is not live');

  const done = await run(await reviewAtOutcome(w), act, [{ outcome: 'done' }]);
  await assertRefused(() => withClock(HELD, () => wf.advanceStep(done.body, act, done.workflow.id)), wf.WorkflowCompleteError, done.body, 'advanceStep on a complete workflow is WorkflowCompleteError, not LastStepError');
  await assertRefused(() => withClock(HELD, () => wf.submitStep(done.body, act, done.workflow.id, { step: 'choose-the-owner', ownerProfileId: bob.id })), wf.WorkflowCompleteError, done.body, 'a complete workflow before a wrong step');

  await assertRefused(() => withClock(HELD, () => wf.submitStep(started.body, act, started.workflow.id, { step: 'record-the-reason', text: '' })), wf.WrongStepError, started.body, 'a wrong step before a field value');

  await assertRefused(() => withClock(HELD, () => wf.submitStep(started.body, act, started.workflow.id, { step: 'review-the-hazards', hazardId: w.H4, note: '  ' })), wf.InvalidNoteError, started.body, 'a blank note for a hazard not on the platform is InvalidNoteError');

  const decided = await run(started, act, [{ step: 'review-the-hazards', hazardId: w.H1, note: 'ok' }]);
  await assertRefused(() => withClock(HELD, () => wf.submitStep(decided.body, act, decided.workflow.id, { step: 'review-the-hazards', hazardId: w.H1, note: '' })), wf.InvalidNoteError, decided.body, 'a field value before a record already recorded');
  const h1Deleted = (await withClock(HELD, () => registry.deleteHazard(decided.body, act, w.H1))).body;
  await assertRefused(() => withClock(HELD, () => wf.submitStep(h1Deleted, act, decided.workflow.id, { step: 'review-the-hazards', hazardId: w.H1, note: 'again' })), wf.AlreadyRecordedError, h1Deleted, 'a record already recorded before a record the step will not take');

  const atOutcome = await reviewAtOutcome(w);
  const spoiled = withUnreadableLog(atOutcome.body);
  await assertRefused(() => withClock(HELD, () => wf.completeWorkflow(spoiled, act, atOutcome.workflow.id, { outcome: ' ' })), wf.InvalidOutcomeError, spoiled, 'a field value before whatever change-log rejects with');

  const removal = await removalAtOutcome(w);
  const unsettled = await withClock(HELD, async () => {
    let b = (await registry.linkHazardToPlatform(removal.body, act, { hazardId: w.H4, platformId: w.P })).body;
    b = (await registry.linkControlToHazard(b, act, { hazardId: w.H4, controlId: w.C, controlKind: 'preventative' })).body;
    return (await registry.confirmControlForPlatform(b, act, { hazardId: w.H4, controlId: w.C, platformId: w.P })).body;
  });
  await assertRefused(() => withClock(HELD, () => wf.completeWorkflow(unsettled, act, removal.workflow.id, { outcome: '' })), wf.InvalidOutcomeError, unsettled, 'a blank outcome on a removal with an unsettled hazard is InvalidOutcomeError, not StepIncompleteError');
  const unsettledAndUnreadable = withUnreadableLog(unsettled);
  await assertRefused(() => withClock(HELD, () => wf.completeWorkflow(unsettledAndUnreadable, act, removal.workflow.id, { outcome: 'removed' })), wf.StepIncompleteError, unsettledAndUnreadable, 'an unmet demand before whatever change-log rejects with');

  const noKind = snapshot(w.body);
  await assertRefused(() => withClock(HELD, () => wf.startWorkflow(noKind, /** @type {any} */ ({ profile: alice }), { workflowKind: /** @type {any} */ ('audit'), subject: null })), wf.InvalidActError, noKind, 'an ill-formed act before an unknown kind');
});
