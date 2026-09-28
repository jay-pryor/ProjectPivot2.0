/**
 * workflows conformance: operations (CORE-CON-002). Every operation on its happy path, each test
 * naming the clause of modules/workflows/CONTRACT.md it encodes and the SL-07 criterion behind
 * it. Expected values are written out literally where the contract states them. Written from
 * the contract and docs/slices/SL-07.md before any implementation (P8).
 *
 * Criterion 1's "visible" half is a demonstration and a review row (section 2, REQ-037); what is
 * here is the half that is data.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EARLIER, HELD, KIND, LATER, STEPS, actOf, alice, assertRecorded, bob, buildWorld, changeLog, differences, collectionsIn,
  hazardRef, platformRef, registry, removalAtOutcome, reviewAtOutcome, rs, run, scheduled, schema, snapshot, start, wf,
  withClock, withOmittedHazard, workflowRecordId, workflowRow, withWorkflows, orderedUuid, workflowsIn,
} from './harness.js';

/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */

/**
 * The state of one control on one platform for one hazard, read through registry's one query.
 * @param {DataBody} body
 * @param {string} platformId
 * @param {string} hazardId
 * @param {string} controlId
 */
async function controlOn(body, platformId, hazardId, controlId) {
  const { rows } = await registry.listPlatformHazards(body, /** @type {any} */ (platformId));
  const row = rows.find((r) => r.hazard.id === hazardId);
  return row?.controls.find((c) => c.control.id === controlId) ?? null;
}

// ------------------------------------------------------------------ the constants (C-001, C-002)

test('WORKFLOW_KINDS is exactly the five SL-07 names, and WORKFLOW_STEPS gives each its fixed list ending at record-the-outcome (C-001, C-002; SL-07 criterion 1)', () => {
  assert.deepEqual([...wf.WORKFLOW_KINDS], ['add-data', 'onboard-platform', 'review-data', 'remove-control', 'transfer-ownership']);
  assert.deepEqual(Object.keys(wf.WORKFLOW_STEPS).sort(), [...wf.WORKFLOW_KINDS].sort());
  for (const kind of wf.WORKFLOW_KINDS) {
    assert.deepEqual([...wf.WORKFLOW_STEPS[kind]], STEPS[kind], `${kind}: the steps of section 3`);
  }
  assert.deepEqual([...wf.SUBJECT_KINDS].sort(), ['hazard', 'platform']);
});

// ------------------------------------------------------------------ starting (C-001, C-010)

test('startWorkflow on a platform creates one live workflow in progress at its first step, dated today, stamped with the act, with no entries, and records it (C-001, C-002, C-003, C-010; SL-07 criterion 1)', async () => {
  const w = await buildWorld();
  for (const kind of /** @type {const} */ (['review-data', 'remove-control', 'transfer-ownership'])) {
    const act = actOf(alice, w.Q);
    const input = snapshot(w.body);
    const { body: b, workflow } = await start(w.body, act, kind, platformRef(w.P));

    assert.doesNotThrow(() => workflowRecordId.parse(workflow.id), `${kind}: the id is a WorkflowRecordId`);
    assert.deepEqual(workflow, {
      id: workflow.id,
      kind: KIND,
      status: 'live',
      createdBy: alice.id,
      createdAtAest: HELD,
      updatedBy: alice.id,
      updatedAtAest: HELD,
      workflowKind: kind,
      subject: { kind: 'platform', id: w.P },
      state: 'in-progress',
      currentStep: STEPS[kind][0],
      startedOnAest: '2026-09-15',
      completedOnAest: null,
      completedBy: null,
      outcome: null,
      entries: [],
    }, `${kind}: the record C-001 describes`);
    assert.deepEqual(w.body, input, `${kind}: the input body is unchanged`);
    assert.deepEqual(await wf.getWorkflow(b, workflow.id), workflow, `${kind}: getWorkflow reads it back`);
    assert.deepEqual(await wf.listWorkflows(b), [workflow], `${kind}: listWorkflows is the empty list plus it`);
    assert.deepEqual(differences(w.body, b), [`${KIND}/${workflow.id}`], `${kind}: the body differs only by that entry and the log`);
    await assertRecorded(w.body, b, { act, at: HELD, before: null, after: workflow, affected: [w.P], total: 1, what: kind });
  }
});

test('startWorkflow of add-data and onboard-platform takes a null subject and records an entry that reaches no platform (C-001, C-010, DEC-026; SL-07 criterion 1)', async () => {
  const w = await buildWorld();
  for (const kind of /** @type {const} */ (['add-data', 'onboard-platform'])) {
    const act = actOf(bob, null);
    const { body: b, workflow } = await start(w.body, act, kind, null);
    assert.equal(workflow.subject, null, `${kind}: subject is null until its first step`);
    assert.equal(workflow.currentStep, STEPS[kind][0], `${kind}: at its first step`);
    assert.equal(workflow.createdBy, bob.id);
    await assertRecorded(w.body, b, { act, at: HELD, before: null, after: workflow, affected: [], total: 1, what: kind });
  }
});

test('two startWorkflow calls of one kind on one platform give two workflows with distinct ids, both listed (C-001; section 5 idempotency)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  const first = await start(w.body, act, 'review-data', platformRef(w.P));
  const second = await start(first.body, act, 'review-data', platformRef(w.P));
  assert.notEqual(first.workflow.id, second.workflow.id);
  const listed = await wf.listWorkflows(second.body);
  assert.equal(listed.length, 2);
  assert.deepEqual(new Set(listed.map((x) => x.id)), new Set([first.workflow.id, second.workflow.id]));
});

// ------------------------------------------------------------------ progress (C-002)

test('progressOf gives the steps, the step current, the steps done, and the steps remaining, and advanceStep moves one step forward (C-002; SL-07 criterion 1)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  let change = await start(w.body, act, 'remove-control', platformRef(w.P));
  const id = change.workflow.id;

  let p = await wf.progressOf(change.body, id);
  assert.deepEqual(p.record, change.workflow);
  assert.deepEqual([...p.steps], STEPS['remove-control']);
  assert.equal(p.current, 'choose-the-control');
  assert.deepEqual([...p.done], []);
  assert.deepEqual([...p.remaining], ['settle-the-ratings', 'record-the-reason', 'record-the-outcome']);

  const before = change;
  change = await run(change, act, [{ step: 'choose-the-control', controlId: w.C }]);
  const beforeAdvance = change;
  change = await run(change, act, ['advance'], LATER);
  assert.equal(change.workflow.currentStep, 'settle-the-ratings');
  assert.equal(change.workflow.updatedAtAest, LATER);
  assert.deepEqual(change.workflow.entries, beforeAdvance.workflow.entries, 'advancing appends no entry');
  await assertRecorded(beforeAdvance.body, change.body, { act, at: LATER, before: beforeAdvance.workflow, after: change.workflow, affected: [w.P], total: 1, what: 'advanceStep' });
  assert.deepEqual(differences(beforeAdvance.body, change.body), [`${KIND}/${id}`], 'advancing changes the workflow record and nothing else');

  p = await wf.progressOf(change.body, id);
  assert.equal(p.current, 'settle-the-ratings');
  assert.deepEqual([...p.done], ['choose-the-control']);
  assert.deepEqual([...p.remaining], ['record-the-reason', 'record-the-outcome']);
  assert.ok(before);
});

// ------------------------------------------------------------------ review-data (C-006, C-008, C-005)

test('a review workflow takes a decision per row with the note trimmed, its demand names the rows still undecided, and it cannot advance until every row is decided (C-006, C-008; SL-07 criterion 3; REQ-008)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  let change = await start(w.body, act, 'review-data', platformRef(w.P));
  const id = change.workflow.id;

  let demand = await wf.stepDemand(change.body, id);
  assert.deepEqual(demand, { step: 'review-the-hazards', satisfied: false, outstanding: [hazardRef(w.H1), hazardRef(w.H2), hazardRef(w.H3)].sort((a, b) => (a.id < b.id ? -1 : 1)) });
  assert.deepEqual(await wf.reviewOmissions(change.body, id), []);

  const before = change;
  change = await run(change, act, [{ step: 'review-the-hazards', hazardId: w.H2, note: '  still valid after the refit  ' }], LATER);
  assert.equal(change.workflow.currentStep, 'review-the-hazards', 'a submission does not move the step');
  assert.deepEqual(change.workflow.entries, [
    { step: 'review-the-hazards', entryKind: 'decision', text: 'still valid after the refit', ref: hazardRef(w.H2), byProfileId: alice.id, atAest: LATER },
  ]);
  assert.deepEqual(differences(before.body, change.body), [`${KIND}/${id}`], 'a decision changes no record but the workflow record');
  await assertRecorded(before.body, change.body, { act, at: LATER, before: before.workflow, after: change.workflow, affected: [w.P], total: 1, what: 'a decision' });

  demand = await wf.stepDemand(change.body, id);
  assert.equal(demand.satisfied, false);
  assert.deepEqual([...demand.outstanding], [hazardRef(w.H1), hazardRef(w.H3)].sort((a, b) => (a.id < b.id ? -1 : 1)));
  const refused = await assert.rejects(wf.advanceStep(change.body, act, id), wf.StepIncompleteError).then(() => true);
  assert.ok(refused);

  change = await run(change, act, [
    { step: 'review-the-hazards', hazardId: w.H1, note: 'ok' },
    { step: 'review-the-hazards', hazardId: w.H3, note: 'ok' },
  ]);
  demand = await wf.stepDemand(change.body, id);
  assert.deepEqual(demand, { step: 'review-the-hazards', satisfied: true, outstanding: [] });
  change = await run(change, act, ['advance']);
  assert.equal(change.workflow.currentStep, 'record-the-outcome');
  assert.deepEqual(await wf.stepDemand(change.body, id), { step: 'record-the-outcome', satisfied: false, outstanding: [] }, 'record-the-outcome is never satisfied by advancing (C-008)');
});

test('completing a review sets the last reviewed date of the platform and each hazard decided that has a live schedule, platform first then hazards by number, one action entry each, with the act the platforms each reaches (C-006, C-005, C-010; SL-07 criteria 3 and 4; REQ-015 as review-schedule\'s)', async () => {
  const w = await buildWorld();
  let body = await scheduled(w.body, platformRef(w.P));
  body = await scheduled(body, hazardRef(w.H2));
  body = await scheduled(body, hazardRef(w.H3));
  body = await scheduled(body, hazardRef(w.H4));
  const atOutcome = await reviewAtOutcome(w, body);
  const act = actOf(alice, w.P);
  const id = atOutcome.workflow.id;

  const done = await withClock(LATER, () => wf.completeWorkflow(atOutcome.body, act, id, { outcome: '  all three still valid  ' }));

  for (const ref of [platformRef(w.P), hazardRef(w.H2), hazardRef(w.H3)]) {
    const s = await rs.getSchedule(done.body, ref);
    assert.equal(s?.lastReviewedAest, '2026-09-16', `${ref.kind} ${ref.id}: last reviewed today`);
  }
  assert.equal((await rs.getSchedule(done.body, hazardRef(w.H1))), null, 'H1 has no schedule and none is made');
  assert.equal((await rs.getSchedule(done.body, hazardRef(w.H4)))?.lastReviewedAest, null, 'H4 was not reviewed; its date does not move');

  const actions = done.workflow.entries.filter((e) => e.entryKind === 'action');
  assert.deepEqual(actions.map((e) => e.ref), [platformRef(w.P), hazardRef(w.H2), hazardRef(w.H3)], 'one action per ref called for, platform first then hazards ascending by number');
  for (const e of actions) {
    assert.equal(e.step, 'record-the-outcome');
    assert.equal(e.byProfileId, alice.id);
    assert.equal(e.atAest, LATER);
  }
  assert.deepEqual(done.workflow.entries.filter((e) => e.entryKind === 'omission'), [], 'nothing omitted, nothing recorded as omitted');
  assert.deepEqual(done.workflow.entries.at(-1), { step: 'record-the-outcome', entryKind: 'outcome', text: 'all three still valid', ref: null, byProfileId: alice.id, atAest: LATER });

  const others = await assertRecorded(atOutcome.body, done.body, { act, at: LATER, before: atOutcome.workflow, after: done.workflow, affected: [w.P], total: 4, what: 'completeWorkflow' });
  assert.equal(others.length, 3, 'one entry per completeReview');
  for (const entry of others) {
    const schedule = /** @type {any} */ (entry.items[0].ref);
    assert.equal(schedule.kind, 'review-schedule');
    const s = [...(await rs.listSchedules(done.body))].find((x) => x.id === schedule.id);
    assert.ok(s);
    assert.equal(entry.madeForPlatformId, w.P, 'the ScheduleAct carries the act\'s madeForPlatformId');
    assert.deepEqual([...entry.affectedPlatformIds], [...(await registry.platformsAffected(done.body, s.ref))], 'affectedPlatformIds is registry.platformsAffected of the ref reviewed (DEC-026)');
  }
  const h2 = [...(await rs.listSchedules(done.body))].find((x) => x.ref.id === w.H2);
  const h2Entry = others.find((e) => /** @type {any} */ (e.items[0].ref).id === h2?.id);
  assert.deepEqual([...(h2Entry?.affectedPlatformIds ?? [])], [w.P, w.Q].sort(), 'H2 is on P and Q, and its schedule entry reaches both');
});

test('a hazard the query omits is reported by reviewOmissions with registry\'s reason, is not asked for, and is recorded as an omission entry at completion (C-006, C-008; SL-07 criterion 3; HZ-004, REQ-008)', async () => {
  const w = await buildWorld();
  const body = withOmittedHazard(w.body, w.H3);
  const act = actOf(alice, w.P);
  let change = await start(body, act, 'review-data', platformRef(w.P));
  const id = change.workflow.id;

  const query = await registry.listPlatformHazards(change.body, w.P);
  assert.deepEqual(query.omitted.map((o) => o.id), [w.H3], 'the world omits H3');
  const omissions = await wf.reviewOmissions(change.body, id);
  assert.deepEqual(omissions, [{ id: w.H3, reason: query.omitted[0].reason, detail: query.omitted[0].detail }]);

  const demand = await wf.stepDemand(change.body, id);
  assert.deepEqual([...demand.outstanding], [hazardRef(w.H1), hazardRef(w.H2)].sort((a, b) => (a.id < b.id ? -1 : 1)), 'an omitted hazard is not outstanding');

  change = await run(change, act, [
    { step: 'review-the-hazards', hazardId: w.H1, note: 'ok' },
    { step: 'review-the-hazards', hazardId: w.H2, note: 'ok' },
    'advance',
    { outcome: 'two reviewed, one could not be read' },
  ], LATER);
  const recorded = change.workflow.entries.filter((e) => e.entryKind === 'omission');
  assert.equal(recorded.length, 1, 'one omission entry per omitted hazard');
  assert.equal(recorded[0].step, 'record-the-outcome');
  assert.deepEqual(recorded[0].ref, hazardRef(w.H3));
  assert.equal(change.workflow.entries.filter((e) => e.entryKind === 'decision').some((e) => e.ref?.id === w.H3), false, 'the omitted hazard is never marked reviewed');
});

test('completeWorkflow seals the record: complete, no current step, today\'s AEST date, the user, the outcome trimmed, the entries kept, and the header otherwise as it was (C-005, C-011; SL-07 criterion 4; REQ-038)', async () => {
  const w = await buildWorld();
  const atOutcome = await reviewAtOutcome(w);
  const act = actOf(bob, w.P);
  const at = /** @type {any} */ ('2026-09-17T23:59:59+10:00');
  const done = await withClock(at, () => wf.completeWorkflow(atOutcome.body, act, atOutcome.workflow.id, { outcome: '\tno change needed \n' }));
  const before = atOutcome.workflow;

  assert.deepEqual(done.workflow, {
    ...before,
    state: 'complete',
    currentStep: null,
    completedOnAest: '2026-09-17',
    completedBy: bob.id,
    outcome: 'no change needed',
    updatedBy: bob.id,
    updatedAtAest: at,
    entries: [...before.entries, { step: 'record-the-outcome', entryKind: 'outcome', text: 'no change needed', ref: null, byProfileId: bob.id, atAest: at }],
  });
  assert.deepEqual(await wf.getWorkflow(done.body, before.id), done.workflow);
  const p = await wf.progressOf(done.body, before.id);
  assert.equal(p.current, null);
  assert.deepEqual([...p.done], STEPS['review-data']);
  assert.deepEqual([...p.remaining], []);
  assert.deepEqual(await wf.listWorkflows(done.body), [done.workflow], 'a complete workflow is live and listed');
});

// ------------------------------------------------------------------ remove-control (C-007, C-008, C-009)

test('a removal chooses a control confirmed on the platform, demands a settlement for each hazard it is confirmed for, and records a confirmed residual as a decision and a re-entered one through setRating (C-007, C-008, C-010; SL-07 criterion 5; REQ-077, HZ-002)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  let change = await start(w.body, act, 'remove-control', platformRef(w.P));
  const id = change.workflow.id;

  let before = change;
  change = await run(change, act, [{ step: 'choose-the-control', controlId: w.C }]);
  assert.deepEqual(change.workflow.entries.map((e) => [e.step, e.entryKind, e.ref]), [['choose-the-control', 'decision', { kind: 'control', id: w.C }]]);
  assert.deepEqual(differences(before.body, change.body), [`${KIND}/${id}`]);
  assert.deepEqual(await wf.stepDemand(change.body, id), { step: 'choose-the-control', satisfied: true, outstanding: [] });
  change = await run(change, act, ['advance']);

  const hazards = [hazardRef(w.H1), hazardRef(w.H2)].sort((a, b) => (a.id < b.id ? -1 : 1));
  assert.deepEqual(await wf.stepDemand(change.body, id), { step: 'settle-the-ratings', satisfied: false, outstanding: hazards }, 'every hazard C is confirmed for on P, and not H3');
  const refusal = await wf.advanceStep(change.body, act, id).then(() => null, (e) => e);
  assert.ok(refusal instanceof wf.StepIncompleteError, 'no advancing with a residual unsettled (REQ-077)');
  assert.equal(refusal.step, 'settle-the-ratings');
  assert.deepEqual([...refusal.outstanding], hazards);

  before = change;
  change = await run(change, act, [{ step: 'settle-the-ratings', hazardId: w.H1, consequence: 3, likelihood: 'C' }]);
  const confirmed = change.workflow.entries.at(-1);
  assert.equal(confirmed?.entryKind, 'decision', 'values equal to the live residual are a decision');
  assert.deepEqual(confirmed?.ref, hazardRef(w.H1));
  assert.ok(confirmed?.text.includes('3') && confirmed.text.includes('C'), 'the decision carries the two values in its text');
  assert.deepEqual(differences(before.body, change.body), [`${KIND}/${id}`], 'no registry call: the rating is untouched');
  await assertRecorded(before.body, change.body, { act, at: HELD, before: before.workflow, after: change.workflow, affected: [w.P], total: 1, what: 'a confirmed residual' });
  assert.deepEqual([...(await wf.stepDemand(change.body, id)).outstanding], [hazardRef(w.H2)]);

  before = change;
  change = await run(change, act, [{ step: 'settle-the-ratings', hazardId: w.H2, consequence: 2, likelihood: 'D' }], LATER);
  const reentered = change.workflow.entries.at(-1);
  assert.equal(reentered?.entryKind, 'action', 'values that differ are set through registry');
  assert.equal(reentered?.ref?.kind, 'rating', 'the action names the rating the act wrote');
  assert.deepEqual((await registry.getRatings(change.body, w.H2, w.P)).residual, { consequence: 2, likelihood: 'D' });
  assert.deepEqual(collectionsIn(differences(before.body, change.body)), ['rating', KIND]);
  const others = await assertRecorded(before.body, change.body, { act, at: LATER, before: before.workflow, after: change.workflow, affected: [w.P], total: 2, what: 'a re-entered residual' });
  assert.equal(others[0].madeForPlatformId, w.P, 'the act is passed to registry unchanged');
  assert.deepEqual(await wf.stepDemand(change.body, id), { step: 'settle-the-ratings', satisfied: true, outstanding: [] });

  assert.equal((await controlOn(change.body, w.P, w.H1, w.C))?.state, 'confirmed', 'no control comes off before completion');
  assert.equal((await controlOn(change.body, w.P, w.H2, w.C))?.state, 'confirmed');
});

test('completing a removal excludes the chosen control from each settled hazard on that platform with the one reason, one action entry naming each justification, and touches no other platform or control (C-007, C-009, C-010; SL-07 criterion 5; REQ-058, REQ-077)', async () => {
  const w = await buildWorld();
  const atOutcome = await removalAtOutcome(w);
  const reason = atOutcome.workflow.entries.find((e) => e.step === 'record-the-reason');
  assert.deepEqual([reason?.entryKind, reason?.text], ['decision', 'superseded by the new interlock'], 'the reason is a decision carrying the text trimmed');
  assert.equal((await controlOn(atOutcome.body, w.P, w.H1, w.C))?.state, 'confirmed', 'still on before completion');

  const act = actOf(alice, w.P);
  const done = await withClock(LATER, () => wf.completeWorkflow(atOutcome.body, act, atOutcome.workflow.id, { outcome: 'C removed from P' }));

  const ordered = [w.H1, w.H2].sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
  /** @type {string[]} */
  const justifications = [];
  for (const h of ordered) {
    const c = await controlOn(done.body, w.P, h, w.C);
    assert.equal(c?.state, 'excluded', `${h}: C is excluded from P`);
    assert.equal(c?.justification?.text, 'superseded by the new interlock', `${h}: with the one reason`);
    justifications.push(/** @type {string} */ (c?.justification?.id));
  }
  const actions = done.workflow.entries.filter((e) => e.entryKind === 'action' && e.step === 'record-the-outcome');
  assert.deepEqual(actions.map((e) => e.ref), justifications.map((id) => ({ kind: 'justification', id })), 'one action per exclusion, naming its justification, ascending by hazard number');

  assert.equal((await controlOn(done.body, w.Q, w.H1, w.C))?.state, 'confirmed', 'C stays confirmed for H1 on Q');
  assert.equal((await controlOn(done.body, w.Q, w.H2, w.C))?.state, 'awaiting', 'C stays awaiting for H2 on Q');
  assert.equal((await controlOn(done.body, w.P, w.H3, w.D))?.state, 'awaiting', 'D on P is untouched');

  const others = await assertRecorded(atOutcome.body, done.body, { act, at: LATER, before: atOutcome.workflow, after: done.workflow, affected: [w.P], total: 3, what: 'completing a removal' });
  assert.equal(others.length, 2, 'one registry entry per exclusion');
  assert.equal(done.workflow.state, 'complete');
});

// ------------------------------------------------------------------ add-data, onboard-platform, transfer-ownership (C-013)

test('add-data creates the hazard at name-the-hazard and makes it the subject, adds its causal factors and consequences, links library controls on either side, and completes (C-013, C-008, C-010; SL-07 criterion 4; REQ-036 as registry\'s)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  let change = await start(w.body, act, 'add-data', null);
  const id = change.workflow.id;
  assert.deepEqual(await wf.stepDemand(change.body, id), { step: 'name-the-hazard', satisfied: false, outstanding: [] }, 'naming asks for its one entry and names no record');

  let before = change;
  change = await run(change, act, [{ step: 'name-the-hazard', title: '  Dropped load  ' }], LATER);
  const created = (await registry.listHazards(change.body)).filter((h) => !(before.body.collections.hazard ?? {})[h.id]);
  assert.equal(created.length, 1, 'one hazard created');
  const H = created[0];
  assert.equal(H.title, 'Dropped load');
  assert.deepEqual(change.workflow.subject, hazardRef(H.id), 'the subject is the hazard created');
  assert.deepEqual(change.workflow.entries, [{ step: 'name-the-hazard', entryKind: 'action', text: change.workflow.entries[0].text, ref: hazardRef(H.id), byProfileId: alice.id, atAest: LATER }]);
  assert.equal(typeof change.workflow.entries[0].text, 'string');
  const others = await assertRecorded(before.body, change.body, { act, at: LATER, before: before.workflow, after: change.workflow, affected: [], total: 2, what: 'name-the-hazard' });
  assert.equal(others[0].madeForPlatformId, w.P, 'registry\'s entry carries the platform the user was working on');
  assert.deepEqual(await wf.stepDemand(change.body, id), { step: 'name-the-hazard', satisfied: true, outstanding: [] });

  change = await run(change, act, ['advance']);
  assert.deepEqual(await wf.stepDemand(change.body, id), { step: 'describe-the-hazard', satisfied: true, outstanding: [] }, 'describing is always satisfied');
  before = change;
  change = await run(change, act, [
    { step: 'describe-the-hazard', part: 'causal-factor', text: 'sling failure' },
    { step: 'describe-the-hazard', part: 'consequence', text: 'crush injury' },
    'advance',
    { step: 'choose-controls', controlId: w.E, controlKind: 'mitigating' },
    { step: 'choose-controls', controlId: w.C, controlKind: 'preventative' },
  ]);
  const detail = await registry.getHazardDetail(change.body, H.id);
  assert.deepEqual(detail?.causalFactors.map((c) => c.text), ['sling failure']);
  assert.deepEqual(detail?.consequences.map((c) => c.text), ['crush injury']);
  assert.deepEqual(new Set(detail?.controls.map((c) => `${c.control.id}:${c.controlKind}`)), new Set([`${w.E}:mitigating`, `${w.C}:preventative`]));
  const added = change.workflow.entries.slice(before.workflow.entries.length);
  assert.deepEqual(added.map((e) => [e.step, e.entryKind, e.ref?.kind]), [
    ['describe-the-hazard', 'action', 'causal-factor'],
    ['describe-the-hazard', 'action', 'consequence'],
    ['choose-controls', 'action', 'link'],
    ['choose-controls', 'action', 'link'],
  ], 'each act appends one action entry naming the record it wrote');
  assert.deepEqual(added[0].ref?.id, detail?.causalFactors[0].id);
  assert.deepEqual(added[1].ref?.id, detail?.consequences[0].id);

  change = await run(change, act, ['advance', { outcome: 'hazard added' }]);
  assert.equal(change.workflow.state, 'complete');
  assert.deepEqual(change.workflow.subject, hazardRef(H.id));
});

test('describe-the-hazard refuses nothing as a repeat: the same part and text twice are two records and two action entries (C-004; DEC-038)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  const describing = await run(await start(w.body, act, 'add-data', null), act, [{ step: 'name-the-hazard', title: 'Twice described' }, 'advance']);
  const twice = await run(describing, act, [
    { step: 'describe-the-hazard', part: 'consequence', text: 'crush injury' },
    { step: 'describe-the-hazard', part: 'consequence', text: 'crush injury' },
  ]);
  const H = /** @type {any} */ (describing.workflow.subject).id;
  const detail = await registry.getHazardDetail(twice.body, H);
  assert.equal(detail?.consequences.length, 2);
  assert.notEqual(detail?.consequences[0].id, detail?.consequences[1].id);
  const added = twice.workflow.entries.slice(describing.workflow.entries.length);
  assert.deepEqual(added.map((e) => [e.entryKind, e.ref?.kind]), [['action', 'consequence'], ['action', 'consequence']]);
  assert.deepEqual(new Set(added.map((e) => e.ref?.id)), new Set(detail?.consequences.map((c) => c.id)));
});

test('stepDemand at record-the-outcome is never satisfied and names nothing when completion would not refuse (C-008)', async () => {
  const w = await buildWorld();
  const atOutcome = await removalAtOutcome(w);
  assert.deepEqual(await wf.stepDemand(atOutcome.body, atOutcome.workflow.id), { step: 'record-the-outcome', satisfied: false, outstanding: [] });
});

test('onboard-platform creates the platform and makes it the subject, and selecting a hazard links it, bringing its controls across as awaiting and changing no existing record (C-013; SL-07 criterion 2; REQ-036, REQ-035)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, null);
  let change = await start(w.body, act, 'onboard-platform', null);
  const id = change.workflow.id;

  let before = change;
  change = await run(change, act, [{ step: 'name-the-platform', name: '  Platform R  ', ownerProfileId: bob.id }]);
  const R = (await registry.listPlatforms(change.body)).find((p) => p.name === 'Platform R');
  assert.ok(R, 'the platform is created');
  assert.equal(R.ownerProfileId, bob.id);
  assert.deepEqual(change.workflow.subject, platformRef(R.id));
  assert.deepEqual(change.workflow.entries.map((e) => [e.step, e.entryKind, e.ref]), [['name-the-platform', 'action', platformRef(R.id)]]);
  assert.deepEqual(collectionsIn(differences(before.body, change.body)), ['platform', KIND], 'only the new platform and the workflow record');
  await assertRecorded(before.body, change.body, { act, at: HELD, before: before.workflow, after: change.workflow, affected: [R.id], total: 2, what: 'name-the-platform' });

  change = await run(change, act, ['advance']);
  assert.deepEqual(await wf.stepDemand(change.body, id), { step: 'select-hazards', satisfied: true, outstanding: [] }, 'a platform may be onboarded with no hazard');
  before = change;
  change = await run(change, act, [{ step: 'select-hazards', hazardId: w.H1 }, { step: 'select-hazards', hazardId: w.H3 }]);

  const onR = await registry.listPlatformHazards(change.body, R.id);
  assert.deepEqual(onR.rows.map((r) => r.hazard.id).sort(), [w.H1, w.H3].sort());
  for (const row of onR.rows) {
    for (const c of row.controls) assert.equal(c.state, 'awaiting', `${row.hazard.id}: ${c.control.id} arrives awaiting, not confirmed`);
  }
  assert.deepEqual(onR.rows.find((r) => r.hazard.id === w.H1)?.controls.map((c) => c.control.id), [w.C], 'H1\'s control came across without re-entry');
  const diffs = differences(before.body, change.body);
  assert.deepEqual(collectionsIn(diffs), ['link', KIND], 'nothing is copied: only two new links and the workflow record');
  assert.equal(diffs.filter((d) => d.startsWith('link/')).length, 2);
  for (const d of diffs.filter((x) => x.startsWith('link/'))) {
    assert.equal((before.body.collections.link ?? {})[d.slice(5)], undefined, 'no existing link is changed');
  }
  assert.deepEqual(change.workflow.entries.slice(1).map((e) => [e.step, e.entryKind, e.ref?.kind]), [['select-hazards', 'action', 'link'], ['select-hazards', 'action', 'link']]);
});

test('transfer-ownership sets the platform\'s owner through registry, appends one action naming the platform, and completes (C-013; SL-07 criterion 4; REQ-081 as registry\'s)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  let change = await start(w.body, act, 'transfer-ownership', platformRef(w.P));
  assert.deepEqual(await wf.stepDemand(change.body, change.workflow.id), { step: 'choose-the-owner', satisfied: false, outstanding: [] });
  const before = change;
  change = await run(change, act, [{ step: 'choose-the-owner', ownerProfileId: bob.id }]);
  assert.equal((await registry.listPlatforms(change.body)).find((p) => p.id === w.P)?.ownerProfileId, bob.id);
  assert.deepEqual(change.workflow.entries.map((e) => [e.step, e.entryKind, e.ref]), [['choose-the-owner', 'action', platformRef(w.P)]]);
  assert.deepEqual(collectionsIn(differences(before.body, change.body)), ['platform', KIND]);
  await assertRecorded(before.body, change.body, { act, at: HELD, before: before.workflow, after: change.workflow, affected: [w.P], total: 2, what: 'choose-the-owner' });
  change = await run(change, act, ['advance', { outcome: 'handed to Bob' }]);
  assert.equal(change.workflow.state, 'complete');
  assert.equal(change.workflow.completedBy, alice.id);
});

// ------------------------------------------------------------------ abandoning (C-012)

test('abandonWorkflow marks the record deleted and keeps it readable with every entry, drops it from listWorkflows, records it, and undoes no act already made (C-012, C-010; REQ-010)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  const partway = await run(await start(w.body, act, 'add-data', null), act, [
    { step: 'name-the-hazard', title: 'Half-added hazard' },
    'advance',
    { step: 'describe-the-hazard', part: 'causal-factor', text: 'a cause' },
  ]);
  const other = await start(partway.body, act, 'review-data', platformRef(w.P));

  const out = await withClock(LATER, () => wf.abandonWorkflow(other.body, act, partway.workflow.id));
  assert.deepEqual(out.workflow, { ...partway.workflow, status: 'deleted', updatedBy: alice.id, updatedAtAest: LATER });
  assert.deepEqual(await wf.getWorkflow(out.body, partway.workflow.id), out.workflow);
  assert.deepEqual(await wf.listWorkflows(out.body), [other.workflow], 'the abandoned workflow leaves the list');
  assert.deepEqual(differences(other.body, out.body), [`${KIND}/${partway.workflow.id}`], 'nothing else changes: no act is undone');
  const H = /** @type {any} */ (partway.workflow.subject).id;
  assert.equal((await registry.getHazard(out.body, H))?.status, 'live', 'the hazard it created is still there');
  assert.deepEqual((await registry.getHazardDetail(out.body, H))?.causalFactors.map((c) => c.text), ['a cause']);
  await assertRecorded(other.body, out.body, { act, at: LATER, before: partway.workflow, after: out.workflow, affected: [], total: 1, what: 'abandonWorkflow' });
  const p = await wf.progressOf(out.body, partway.workflow.id);
  assert.equal(p.current, 'describe-the-hazard', 'progressOf answers for an abandoned workflow');
});

// ------------------------------------------------------------------ reads (C-001, C-002, C-004, C-006)

test('listWorkflows gives every live workflow, in progress or complete, ascending by createdAtAest then id, and no abandoned one; getWorkflow gives any by id and null for none (C-001, C-012; section 5 ordering)', async () => {
  const a = orderedUuid(1, 0xc);
  const b = orderedUuid(2, 0xc);
  const c = orderedUuid(3, 0xc);
  const d = orderedUuid(4, 0xc);
  const body = withWorkflows(schema.emptyDataBody(), [
    workflowRow(c, { createdAtAest: EARLIER }),
    workflowRow(b, { createdAtAest: HELD }),
    workflowRow(a, { createdAtAest: HELD, ...{ state: 'complete', currentStep: null, completedOnAest: '2026-09-15', completedBy: alice.id, outcome: 'x' } }),
    workflowRow(d, { createdAtAest: EARLIER, status: 'deleted' }),
  ]);
  assert.deepEqual((await wf.listWorkflows(body)).map((x) => x.id), [c, a, b]);
  assert.deepEqual(await wf.getWorkflow(body, /** @type {any} */ (d)), workflowsIn(body)[d]);
  assert.equal(await wf.getWorkflow(body, /** @type {any} */ (orderedUuid(9, 0xc))), null);
});

test('reviewOmissions is empty for a workflow that is not a review (C-006)', async () => {
  const w = await buildWorld();
  const body = withOmittedHazard(w.body, w.H3);
  const act = actOf(alice, w.P);
  const { body: b, workflow } = await start(body, act, 'remove-control', platformRef(w.P));
  assert.deepEqual(await wf.reviewOmissions(b, workflow.id), []);
});

test('the change log reads every step of a workflow back through listHistory of its record, one entry per changing call (C-010; REQ-010, REQ-045 as change-log\'s)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  const change = await run(await start(w.body, act, 'transfer-ownership', platformRef(w.P)), act, [
    { step: 'choose-the-owner', ownerProfileId: bob.id }, 'advance', { outcome: 'done' },
  ]);
  const history = await changeLog.listHistory(change.body, { kind: KIND, id: change.workflow.id });
  assert.equal(history.length, 4, 'start, submit, advance, complete');
});
