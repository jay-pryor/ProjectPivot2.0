/**
 * workflows conformance: invariants (CORE-CON-002). Property-based, seeded (CORE-TST-001: the
 * seed is harness.SEED, fixed and recorded). Random runs of the five workflows over the world the
 * harness builds, checking after every call what modules/workflows/CONTRACT.md promises of every
 * call: the body is a value (C-003); a changing call writes only the collections its clause names
 * and exactly one entry for the workflow record (C-010); entries are only appended and a complete
 * record never changes (C-011); progress partitions the steps (C-002); a step's demand and its
 * refusal agree (C-008); and a completion whose acts cannot all be made makes none (C-009).
 * Written from the contract before any implementation (P8).
 *
 * The null double must fail this file (CORE-TST-002, rung 1).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

import {
  HELD, KIND, SEED, STEPS, actOf, alice, bob, buildWorld, changeLog, collectionsIn, differences, hazardRef, isWorkflowEntry, jsonRoundTrip,
  oneOf, platformRef, prng, registry, rs, scheduled, snapshot, wf, withClock, withUnreadableLog,
} from './harness.js';

/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */
/** @typedef {import('../contract.js').WorkflowRecord} WorkflowRecord */
/** @typedef {import('../contract.js').StepSubmission} StepSubmission */

/** The collections an act of each step may write besides the workflow record (C-003, C-013, C-006, C-007, C-008). */
const MAY_WRITE = {
  'name-the-hazard': ['hazard', 'sequences.hazard'],
  'describe-the-hazard': ['causal-factor', 'consequence'],
  'choose-controls': ['link'],
  'name-the-platform': ['platform'],
  'select-hazards': ['link'],
  'review-the-hazards': [],
  'choose-the-control': [],
  'settle-the-ratings': ['rating'],
  'record-the-reason': [],
  'choose-the-owner': ['platform'],
};

/**
 * A plausible submission for the step `record` is at, chosen from what the body offers; sometimes
 * one the contract refuses, so refusals are exercised by the same checks.
 * @param {() => number} random
 * @param {DataBody} body
 * @param {WorkflowRecord} record
 * @returns {Promise<any>}
 */
async function submissionFor(random, body, record) {
  const step = /** @type {string} */ (record.currentStep);
  const platform = record.subject?.kind === 'platform' ? record.subject.id : null;
  switch (step) {
    case 'name-the-hazard': return { step, title: random() < 0.1 ? ' ' : `Hazard ${Math.floor(random() * 1000)}` };
    case 'describe-the-hazard': return { step, part: oneOf(random, ['causal-factor', 'consequence']), text: `text ${Math.floor(random() * 1000)}` };
    case 'choose-controls': return { step, controlId: oneOf(random, (await registry.listControls(body)).map((c) => c.id)), controlKind: oneOf(random, ['preventative', 'mitigating']) };
    case 'name-the-platform': return { step, name: `Platform ${Math.floor(random() * 1000)}`, ownerProfileId: oneOf(random, [alice.id, bob.id]) };
    case 'select-hazards': return { step, hazardId: oneOf(random, (await registry.listHazards(body)).map((h) => h.id)) };
    case 'review-the-hazards': {
      const { rows } = await registry.listPlatformHazards(body, /** @type {any} */ (platform));
      const ids = rows.map((r) => r.hazard.id);
      return { step, hazardId: ids.length && random() < 0.9 ? oneOf(random, ids) : 'H-0004', note: random() < 0.1 ? '' : 'reviewed' };
    }
    case 'choose-the-control': {
      const { rows } = await registry.listPlatformHazards(body, /** @type {any} */ (platform));
      const confirmed = rows.flatMap((r) => r.controls.filter((c) => c.state === 'confirmed').map((c) => c.control.id));
      const all = (await registry.listControls(body)).map((c) => c.id);
      return { step, controlId: confirmed.length && random() < 0.85 ? oneOf(random, confirmed) : oneOf(random, all) };
    }
    case 'settle-the-ratings': {
      const demand = await wf.stepDemand(body, record.id);
      const hazardId = demand.outstanding.length && random() < 0.9 ? oneOf(random, demand.outstanding).id : oneOf(random, (await registry.listHazards(body)).map((h) => h.id));
      const current = (await registry.getRatings(body, /** @type {any} */ (hazardId), /** @type {any} */ (platform))).residual;
      if (random() < 0.4 && current.consequence !== null) return { step, hazardId, ...current };
      return { step, hazardId, consequence: oneOf(random, [1, 2, 3, 4, 5]), likelihood: oneOf(random, ['A', 'B', 'C', 'D', 'E', 'F', 'G']) };
    }
    case 'record-the-reason': return { step, text: random() < 0.1 ? '  ' : 'no longer fitted' };
    case 'choose-the-owner': return { step, ownerProfileId: oneOf(random, [alice.id, bob.id]) };
    default: return { step };
  }
}

/**
 * The checks every call is held to, resolved or rejected.
 * @param {DataBody} input the body the call was given
 * @param {DataBody} inputCopy what it was before the call
 * @param {{ ok: true, value: { body: DataBody, workflow: WorkflowRecord } } | { ok: false, error: unknown }} outcome
 * @param {{ what: string, id: string, step: string | null, op: string }} call
 */
async function checkCall(input, inputCopy, outcome, call) {
  const { what } = call;
  assert.deepEqual(input, inputCopy, `${what}: the input body is unchanged (C-003)`);
  if (!outcome.ok) return;
  const { body: b, workflow } = outcome.value;
  const before = (await wf.getWorkflow(input, /** @type {any} */ (call.id)));
  assert.deepEqual(await wf.getWorkflow(b, workflow.id), workflow, `${what}: the returned record is the one in the returned body`);
  assert.deepEqual(jsonRoundTrip(b), b, `${what}: the body survives a JSON round trip (C-003)`);
  if (before) {
    assert.notEqual(before.state, 'complete', `${what}: a complete record is never changed (C-011)`);
    assert.deepEqual(workflow.entries.slice(0, before.entries.length), before.entries, `${what}: entries are only appended (C-011)`);
    for (const f of ['id', 'kind', 'workflowKind', 'startedOnAest', 'createdBy', 'createdAtAest']) {
      assert.deepEqual(/** @type {any} */ (workflow)[f], /** @type {any} */ (before)[f], `${what}: ${f} is written once (C-011)`);
    }
  }
  const diffs = differences(input, b);
  const others = diffs.filter((d) => !d.startsWith(`${KIND}/`));
  assert.deepEqual(diffs.filter((d) => d.startsWith(`${KIND}/`)), [`${KIND}/${workflow.id}`], `${what}: exactly one workflow record changes (C-003)`);
  /** @type {string[]} */
  let allowed = [];
  if (call.op === 'submit' && call.step) allowed = MAY_WRITE[/** @type {keyof typeof MAY_WRITE} */ (call.step)];
  if (call.op === 'complete') allowed = before?.workflowKind === 'review-data' ? ['review-schedule'] : before?.workflowKind === 'remove-control' ? ['justification', 'link'] : [];
  for (const c of collectionsIn(others)) assert.ok(allowed.includes(c), `${what}: ${c} is not a collection this call's clause names (C-003); allowed ${JSON.stringify(allowed)}`);
  const added = (await changeLog.listEntries(b)).filter((e) => !(/** @type {any} */ (input.collections)['change-log-entry'] ?? {})[e.id]);
  assert.equal(added.filter(isWorkflowEntry).length, 1, `${what}: exactly one entry records the workflow record (C-010)`);
  if (call.op === 'advance' || call.op === 'abandon' || call.op === 'start') assert.equal(added.length, 1, `${what}: no act but the workflow record's (C-010)`);
}

/**
 * The checks every workflow in a body is held to between calls.
 * @param {DataBody} body
 * @param {string} what
 */
async function checkBody(body, what) {
  const all = Object.values(/** @type {Record<string, WorkflowRecord>} */ (/** @type {any} */ (body.collections)[KIND] ?? {}));
  assert.deepEqual(await wf.listWorkflows(body), await wf.listWorkflows(body), `${what}: reads are repeatable`);
  for (const r of all) {
    const p = await wf.progressOf(body, r.id);
    const steps = STEPS[r.workflowKind];
    assert.deepEqual([...p.steps], steps, `${what}: steps are the kind's list (C-002)`);
    assert.deepEqual([...p.done, ...(p.current === null ? [] : [p.current]), ...p.remaining], steps, `${what}: done, current, remaining partition the steps (C-002)`);
    assert.equal(p.current, r.currentStep);
    assert.equal(r.state === 'complete', r.currentStep === null, `${what}: currentStep is null exactly when complete`);
    if (r.state === 'complete') {
      assert.ok(r.completedOnAest !== null && r.completedBy !== null && typeof r.outcome === 'string' && r.outcome.trim() === r.outcome && r.outcome !== '', `${what}: a complete record holds the date, the user, and the outcome (C-005)`);
      assert.equal(r.entries.at(-1)?.entryKind, 'outcome', `${what}: the outcome is the last entry (C-005)`);
    } else {
      assert.deepEqual([r.completedOnAest, r.completedBy, r.outcome], [null, null, null], `${what}: in progress holds none of them`);
    }
    if (r.status === 'live' && r.state === 'in-progress' && r.currentStep !== 'record-the-outcome') {
      const demand = await wf.stepDemand(body, r.id);
      const refusal = await withClock(HELD, () => wf.advanceStep(body, actOf(alice), r.id)).then(() => null, (e) => e);
      assert.equal(demand.satisfied, !(refusal instanceof wf.StepIncompleteError), `${what}: stepDemand.satisfied is false exactly when advanceStep refuses with StepIncompleteError (C-008)`);
      if (demand.satisfied) assert.equal(refusal, null, `${what}: nothing else refuses an advance on a well-formed live workflow in progress whose demand is met`);
      else assert.deepEqual([...refusal.outstanding], [...demand.outstanding], `${what}: the refusal names what the demand names`);
    }
    if (r.status === 'live' && r.state === 'in-progress' && r.currentStep === 'record-the-outcome') {
      const demand = await wf.stepDemand(body, r.id);
      assert.equal(demand.satisfied, false, `${what}: record-the-outcome is never satisfied (C-008)`);
      const refusal = await withClock(HELD, () => wf.completeWorkflow(body, actOf(alice), r.id, { outcome: 'probe' })).then(() => null, (e) => e);
      if (demand.outstanding.length === 0) assert.equal(refusal, null, `${what}: completion is not refused when the demand names nothing`);
      else {
        assert.ok(refusal instanceof wf.StepIncompleteError && refusal.step === 'settle-the-ratings', `${what}: completion refuses what the demand names (C-007, C-008)`);
        assert.deepEqual([...refusal.outstanding], [...demand.outstanding]);
      }
    }
  }
}

test(`model check (seed ${SEED}): random runs of the five workflows keep the body a value, write only what each clause names, append only, seal complete records, partition progress, and agree demand with refusal (C-002, C-003, C-005, C-008, C-010, C-011)`, async () => {
  const random = prng(SEED);
  const w = await buildWorld();
  let body = await scheduled(w.body, platformRef(w.P));
  body = await scheduled(body, hazardRef(w.H1));
  const platforms = [w.P, w.Q];
  let seconds = 0;
  const tick = () => /** @type {any} */ (`2026-09-15T${String(10 + Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String((seconds++) % 60).padStart(2, '0')}+10:00`);

  for (let i = 0; i < 160; i += 1) {
    const act = actOf(oneOf(random, [alice, bob]), oneOf(random, [null, ...platforms]));
    if (random() < 0.08) {
      // A person acting outside any workflow: a control confirmed on a platform, so a removal's set can grow after its settlements (C-007).
      const hazardId = oneOf(random, (await registry.listHazards(body)).map((h) => h.id));
      const controlId = oneOf(random, (await registry.listControls(body)).map((c) => c.id));
      const platformId = oneOf(random, platforms);
      body = await withClock(tick(), async () => {
        let b = body;
        for (const step of [
          (/** @type {any} */ x) => registry.linkHazardToPlatform(x, act, { hazardId, platformId }),
          (/** @type {any} */ x) => registry.linkControlToHazard(x, act, { hazardId, controlId, controlKind: 'preventative' }),
          (/** @type {any} */ x) => registry.confirmControlForPlatform(x, act, { hazardId, controlId, platformId }),
        ]) b = await step(b).then((c) => c.body, () => b);
        return b;
      });
      continue;
    }
    const listed = [...(await wf.listWorkflows(body))];
    const inProgress = listed.filter((r) => r.state === 'in-progress');
    const complete = listed.filter((r) => r.state === 'complete');
    const roll = random();
    /** @type {{ op: string, id: string, step: string | null, run: () => Promise<any> }} */
    let call;
    if (inProgress.length === 0 || roll < 0.12) {
      const kind = oneOf(random, wf.WORKFLOW_KINDS);
      const subject = ['add-data', 'onboard-platform'].includes(kind) ? null : platformRef(oneOf(random, platforms));
      call = { op: 'start', id: '', step: null, run: () => wf.startWorkflow(body, act, { workflowKind: kind, subject }) };
    } else if (complete.length && roll < 0.18) {
      const r = oneOf(random, complete);
      const op = oneOf(random, ['submit', 'advance', 'complete', 'abandon']);
      call = { op, id: r.id, step: null, run: () => (op === 'advance' ? wf.advanceStep(body, act, r.id) : op === 'abandon' ? wf.abandonWorkflow(body, act, r.id) : op === 'complete' ? wf.completeWorkflow(body, act, r.id, { outcome: 'again' }) : wf.submitStep(body, act, r.id, /** @type {any} */ ({ step: 'record-the-reason', text: 'x' }))) };
    } else {
      const r = oneOf(random, inProgress);
      if (random() < 0.05) {
        call = { op: 'abandon', id: r.id, step: null, run: () => wf.abandonWorkflow(body, act, r.id) };
      } else if (r.currentStep === 'record-the-outcome') {
        const outcome = random() < 0.1 ? ' ' : 'finished';
        call = { op: 'complete', id: r.id, step: null, run: () => wf.completeWorkflow(body, act, r.id, { outcome }) };
      } else if (random() < 0.45) {
        call = { op: 'advance', id: r.id, step: r.currentStep, run: () => wf.advanceStep(body, act, r.id) };
      } else {
        const submission = await submissionFor(random, body, r);
        call = { op: 'submit', id: r.id, step: r.currentStep, run: () => wf.submitStep(body, act, r.id, submission) };
      }
    }
    const input = body;
    const inputCopy = snapshot(input);
    const at = tick();
    const outcome = await withClock(at, call.run).then((value) => ({ ok: /** @type {const} */ (true), value }), (error) => ({ ok: /** @type {const} */ (false), error }));
    const what = `step ${i} (${call.op} ${call.step ?? ''})`;
    if (!outcome.ok && !(outcome.error instanceof Error && /Error$/.test(outcome.error.name))) throw outcome.error;
    await checkCall(input, inputCopy, outcome, { ...call, what });
    if (call.op === 'complete' && complete.some((r) => r.id === call.id)) assert.ok(!outcome.ok && outcome.error instanceof wf.WorkflowCompleteError, `${what}: a complete record refuses (C-011)`);
    if (outcome.ok) body = outcome.value.body;
    if (i % 8 === 0) await checkBody(body, what);
  }
  await checkBody(body, 'at the end');
  assert.ok((await wf.listWorkflows(body)).some((r) => r.state === 'complete'), 'the run completed at least one workflow, so the checks on complete records ran');
});

test(`completion is all or nothing (seed ${SEED}): with the history unreadable, completing any workflow at its outcome step rejects with that error and the body is unchanged; on the readable body it completes (C-009, C-010)`, async () => {
  const random = prng(SEED + 1);
  const w = await buildWorld();
  let base = await scheduled(w.body, platformRef(w.P));
  base = await scheduled(base, hazardRef(w.H2));
  for (let i = 0; i < 10; i += 1) {
    const kind = oneOf(random, wf.WORKFLOW_KINDS);
    const act = actOf(alice, oneOf(random, [null, w.P]));
    /** @type {{ body: DataBody, workflow: WorkflowRecord }} */
    let change = await withClock(HELD, () => wf.startWorkflow(base, act, { workflowKind: kind, subject: ['add-data', 'onboard-platform'].includes(kind) ? null : platformRef(w.P) }));
    const scripts = {
      'add-data': [{ step: 'name-the-hazard', title: 'New' }, 'advance', 'advance', 'advance'],
      'onboard-platform': [{ step: 'name-the-platform', name: 'R', ownerProfileId: bob.id }, 'advance', { step: 'select-hazards', hazardId: w.H1 }, 'advance'],
      'review-data': [{ step: 'review-the-hazards', hazardId: w.H1, note: 'a' }, { step: 'review-the-hazards', hazardId: w.H2, note: 'b' }, { step: 'review-the-hazards', hazardId: w.H3, note: 'c' }, 'advance'],
      'remove-control': [{ step: 'choose-the-control', controlId: w.C }, 'advance', { step: 'settle-the-ratings', hazardId: w.H1, consequence: 1, likelihood: 'B' }, { step: 'settle-the-ratings', hazardId: w.H2, consequence: 2, likelihood: 'A' }, 'advance', { step: 'record-the-reason', text: 'r' }, 'advance'],
      'transfer-ownership': [{ step: 'choose-the-owner', ownerProfileId: bob.id }, 'advance'],
    };
    for (const s of scripts[kind]) {
      const { body, workflow } = change;
      change = await withClock(HELD, () => (s === 'advance' ? wf.advanceStep(body, act, workflow.id) : wf.submitStep(body, act, workflow.id, /** @type {any} */ (s))));
    }
    const spoiled = withUnreadableLog(change.body);
    const copy = snapshot(spoiled);
    const e = await withClock(HELD, () => wf.completeWorkflow(spoiled, act, change.workflow.id, { outcome: 'done' })).then(() => null, (x) => x);
    assert.ok(e instanceof changeLog.MalformedEntryError, `${kind}: rejects with change-log's error`);
    assert.deepEqual(spoiled, copy, `${kind}: body unchanged`);
    assert.equal((await wf.getWorkflow(spoiled, change.workflow.id))?.currentStep, 'record-the-outcome', `${kind}: still at record-the-outcome`);
    const done = await withClock(HELD, () => wf.completeWorkflow(change.body, act, change.workflow.id, { outcome: 'done' }));
    assert.equal(done.workflow.state, 'complete', `${kind}: completes once the cause is cleared`);
    if (kind === 'review-data') assert.equal((await rs.getSchedule(done.body, hazardRef(w.H2)))?.lastReviewedAest, '2026-09-15');
    assert.ok(isDeepStrictEqual(done.workflow.entries.slice(0, change.workflow.entries.length), change.workflow.entries));
  }
});
