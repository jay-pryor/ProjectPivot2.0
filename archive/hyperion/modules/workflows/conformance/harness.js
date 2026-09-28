/**
 * Test support for the workflows conformance suite (CORE-CON-002). Not a test file: the runner
 * collects `*.test.js` only.
 *
 * Section 2 of modules/workflows/CONTRACT.md: a conformance test starts from
 * `schema.emptyDataBody()` or a body it builds with `registry`'s own operations, holds the
 * baseline clock where a clause names it, and needs no folder. The records a workflow acts on
 * are made through `registry` and read back through it, the entries its acts wrote through
 * `change-log.listEntries` and `listHistory`, and the last reviewed dates a completed review set
 * through `review-schedule.getSchedule`. So this file imports only what
 * modules/workflows/manifest.yaml declares (CORE-CON-003, `declared`): baseline/types,
 * baseline/schema, baseline/clock, and the registry, review-schedule, and change-log contracts.
 *
 * Provides: profiles, acts, and held times; a world of one platform, three hazards, and a
 * control confirmed for two of them, built through `registry`; the runs of each workflow up to a
 * given step; workflow records built directly, for malformed records and orderings that must not
 * assume what `fresh` returns (DEC-005); bodies made unreadable to `change-log`, to
 * `review-schedule`, and to `registry`'s one query, for section 4 and C-009; the C-010 check that
 * an act wrote the workflow record's one entry; the "body is a value" helpers of C-003; a seeded
 * generator (CORE-TST-001: the seed is fixed and recorded); and a spy on the browser's storage.
 */

import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

import { fixClock, releaseClock } from '../../../baseline/clock.js';
import * as schema from '../../../baseline/schema.js';
import { timestampAest, userProfileId, workflowRecordId } from '../../../baseline/types.js';
import * as changeLog from '../../change-log/contract.js';
import * as registry from '../../registry/contract.js';
import * as rs from '../../review-schedule/contract.js';
import * as wf from '../contract.js';

/** @typedef {import('../../../baseline/types.js').ActiveProfile} ActiveProfile */
/** @typedef {import('../../../baseline/types.js').PlatformId} PlatformId */
/** @typedef {import('../../../baseline/types.js').HazardId} HazardId */
/** @typedef {import('../../../baseline/types.js').ControlId} ControlId */
/** @typedef {import('../../../baseline/types.js').RecordRef} RecordRef */
/** @typedef {import('../../../baseline/types.js').TimestampAest} TimestampAest */
/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */
/** @typedef {import('../contract.js').WorkflowRecord} WorkflowRecord */
/** @typedef {import('../contract.js').WorkflowKind} WorkflowKind */
/** @typedef {import('../contract.js').StepSubmission} StepSubmission */
/** @typedef {import('../../registry/contract.js').Act} Act */
/** @typedef {import('../../change-log/contract.js').ChangeLogEntry} ChangeLogEntry */
/** @typedef {import('../../change-log/contract.js').RecordChangeEntry} RecordChangeEntry */

/** The one seed this suite's property tests use (CORE-TST-001); change it only on purpose, and record why. */
export const SEED = 0x57464c57;

export const KIND = /** @type {const} */ ('workflow-record');
export const LOG = /** @type {const} */ ('change-log-entry');

/** The five kinds and their steps as SL-07 and section 3 name them, written out here rather than read from the contract, so the suite checks the constants too. */
export const STEPS = Object.freeze({
  'add-data': ['name-the-hazard', 'describe-the-hazard', 'choose-controls', 'record-the-outcome'],
  'onboard-platform': ['name-the-platform', 'select-hazards', 'record-the-outcome'],
  'review-data': ['review-the-hazards', 'record-the-outcome'],
  'remove-control': ['choose-the-control', 'settle-the-ratings', 'record-the-reason', 'record-the-outcome'],
  'transfer-ownership': ['choose-the-owner', 'record-the-outcome'],
});

/** The three kinds performed on a platform, and the two that create their own subject (C-001). */
export const ON_A_PLATFORM = Object.freeze(/** @type {WorkflowKind[]} */ (['review-data', 'remove-control', 'transfer-ownership']));
export const CREATES_ITS_SUBJECT = Object.freeze(/** @type {WorkflowKind[]} */ (['add-data', 'onboard-platform']));

// ------------------------------------------------------------------ profiles, acts, and time

/**
 * The profile a session acts as, as `views` would pass it on (REQ-055).
 * @param {string} name
 * @returns {ActiveProfile}
 */
export function newProfile(name) {
  return { id: userProfileId.fresh(), name };
}

export const alice = newProfile('Alice');
export const bob = newProfile('Bob');

/**
 * One act (section 3). Both properties are always given, as DEC-016 requires.
 * @param {ActiveProfile} profile
 * @param {PlatformId | null} [madeFor]
 * @returns {Act}
 */
export function actOf(profile, madeFor = null) {
  return { profile, madeForPlatformId: madeFor };
}

/**
 * A valid UUID whose string order is the order of `n`, for ids a test needs sorted; `salt`
 * keeps ids of different uses apart.
 * @param {number} n
 * @param {number} [salt]
 * @returns {string}
 */
export function orderedUuid(n, salt = 0) {
  return `${n.toString(16).padStart(8, '0')}-0000-4000-8000-${salt.toString(16).padStart(12, '0')}`;
}

/** @type {TimestampAest} the time a world is built at, and a body's direct records are stamped with */
export const EARLIER = timestampAest('2026-09-01T08:00:00+10:00');

/** @type {TimestampAest} the time most tests hold the clock at */
export const HELD = timestampAest('2026-09-15T10:30:00+10:00');

/** @type {TimestampAest} a later time, for an act that must be told apart from one at HELD */
export const LATER = timestampAest('2026-09-16T14:05:00+10:00');

/**
 * Run `fn` with the baseline clock held at `ts`, releasing it after whatever happens.
 * @template T
 * @param {TimestampAest} ts
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withClock(ts, fn) {
  fixClock(ts);
  try {
    return await fn();
  } finally {
    releaseClock();
  }
}

/**
 * @param {string} id
 * @returns {RecordRef}
 */
export const hazardRef = (id) => ({ kind: 'hazard', id });
/**
 * @param {string} id
 * @returns {RecordRef}
 */
export const platformRef = (id) => ({ kind: 'platform', id });

// ------------------------------------------------------------------ a world built through registry

/**
 * @typedef {object} World
 * @property {DataBody} body
 * @property {PlatformId} P the platform the workflows are run on, owned by alice
 * @property {PlatformId} Q a second platform, owned by bob, with H1 on it and C confirmed there for H1
 * @property {HazardId} H1 on P and Q; C confirmed for it on P and on Q; residual on P entered as 3 C
 * @property {HazardId} H2 on P and Q; C confirmed for it on P and awaiting on Q; no residual
 * @property {HazardId} H3 on P only; C not one of its controls; residual on P entered as 2 B
 * @property {HazardId} H4 on no platform
 * @property {ControlId} C preventative on H1 and H2
 * @property {ControlId} D mitigating on H3, awaiting on P
 * @property {ControlId} E in the library and on no hazard
 */

/**
 * The world most tests start from, built through `registry` with the clock at EARLIER.
 * @returns {Promise<World>}
 */
export async function buildWorld() {
  return withClock(EARLIER, async () => {
    const act = actOf(alice);
    let body = schema.emptyDataBody();
    const P = (await registry.createPlatform(body, act, { name: 'Platform P', ownerProfileId: alice.id }));
    body = P.body;
    const Q = await registry.createPlatform(body, act, { name: 'Platform Q', ownerProfileId: bob.id });
    body = Q.body;
    /** @type {HazardId[]} */
    const hazards = [];
    for (const title of ['Hazard one', 'Hazard two', 'Hazard three', 'Hazard four']) {
      const h = await registry.createHazard(body, act, { title });
      body = h.body;
      hazards.push(h.hazard.id);
    }
    const [H1, H2, H3, H4] = hazards;
    /** @type {ControlId[]} */
    const controls = [];
    for (const title of ['Control C', 'Control D', 'Control E']) {
      const c = await registry.createControl(body, act, { title });
      body = c.body;
      controls.push(c.control.id);
    }
    const [C, D, E] = controls;
    const p = P.platform.id;
    const q = Q.platform.id;
    for (const [hazardId, platformId] of [[H1, p], [H2, p], [H3, p], [H1, q], [H2, q]]) {
      body = (await registry.linkHazardToPlatform(body, act, { hazardId, platformId })).body;
    }
    body = (await registry.linkControlToHazard(body, act, { hazardId: H1, controlId: C, controlKind: 'preventative' })).body;
    body = (await registry.linkControlToHazard(body, act, { hazardId: H2, controlId: C, controlKind: 'preventative' })).body;
    body = (await registry.linkControlToHazard(body, act, { hazardId: H3, controlId: D, controlKind: 'mitigating' })).body;
    body = (await registry.confirmControlForPlatform(body, act, { hazardId: H1, controlId: C, platformId: p })).body;
    body = (await registry.confirmControlForPlatform(body, act, { hazardId: H2, controlId: C, platformId: p })).body;
    body = (await registry.confirmControlForPlatform(body, act, { hazardId: H1, controlId: C, platformId: q })).body;
    body = (await registry.setRating(body, act, { hazardId: H1, platformId: p, stage: 'residual', consequence: 3, likelihood: 'C' })).body;
    body = (await registry.setRating(body, act, { hazardId: H3, platformId: p, stage: 'residual', consequence: 2, likelihood: 'B' })).body;
    return { body, P: p, Q: q, H1, H2, H3, H4, C, D, E };
  });
}

/**
 * Give `ref` a live review schedule, through `review-schedule`'s own contract.
 * @param {DataBody} body
 * @param {RecordRef} ref
 * @param {string} [nextDueAest]
 * @returns {Promise<DataBody>}
 */
export async function scheduled(body, ref, nextDueAest = '2026-10-01') {
  return withClock(EARLIER, async () => {
    const affectedPlatformIds = [...(await registry.platformsAffected(body, ref))];
    const act = { profile: alice, madeForPlatformId: null, affectedPlatformIds };
    return (await rs.setSchedule(body, act, { ref, tempoMonths: 12, nextDueAest: /** @type {any} */ (nextDueAest) })).body;
  });
}

// ------------------------------------------------------------------ running workflows

/**
 * @typedef {{ body: DataBody, workflow: WorkflowRecord }} Change
 */

/**
 * Start a workflow with the clock at `at`.
 * @param {DataBody} body
 * @param {Act} act
 * @param {WorkflowKind} workflowKind
 * @param {RecordRef | null} subject
 * @param {TimestampAest} [at]
 * @returns {Promise<Change>}
 */
export function start(body, act, workflowKind, subject, at = HELD) {
  return withClock(at, () => wf.startWorkflow(body, act, { workflowKind, subject }));
}

/**
 * Apply each call in turn to the body the last returned, with the clock at `at`.
 * @param {Change} change
 * @param {Act} act
 * @param {(StepSubmission | 'advance' | { outcome: string })[]} calls
 * @param {TimestampAest} [at]
 * @returns {Promise<Change>}
 */
export async function run(change, act, calls, at = HELD) {
  let current = change;
  for (const call of calls) {
    const { body, workflow } = current;
    current = await withClock(at, () => (call === 'advance'
      ? wf.advanceStep(body, act, workflow.id)
      : 'outcome' in call
        ? wf.completeWorkflow(body, act, workflow.id, call)
        : wf.submitStep(body, act, workflow.id, call)));
  }
  return current;
}

/**
 * A review-data workflow on P with every row decided and the step advanced: at `record-the-outcome`.
 * @param {World} w
 * @param {DataBody} [body]
 * @returns {Promise<Change>}
 */
export async function reviewAtOutcome(w, body = w.body) {
  const act = actOf(alice, w.P);
  const started = await start(body, act, 'review-data', platformRef(w.P));
  return run(started, act, [
    { step: 'review-the-hazards', hazardId: w.H1, note: 'still valid' },
    { step: 'review-the-hazards', hazardId: w.H2, note: 'still valid' },
    { step: 'review-the-hazards', hazardId: w.H3, note: 'still valid' },
    'advance',
  ]);
}

/**
 * A remove-control workflow on P for C, both residuals settled — H1 confirmed as it stands, H2
 * re-entered — the reason recorded, and the step advanced: at `record-the-outcome`.
 * @param {World} w
 * @param {DataBody} [body]
 * @returns {Promise<Change>}
 */
export async function removalAtOutcome(w, body = w.body) {
  const act = actOf(alice, w.P);
  const started = await start(body, act, 'remove-control', platformRef(w.P));
  return run(started, act, [
    { step: 'choose-the-control', controlId: w.C },
    'advance',
    { step: 'settle-the-ratings', hazardId: w.H1, consequence: 3, likelihood: 'C' },
    { step: 'settle-the-ratings', hazardId: w.H2, consequence: 2, likelihood: 'D' },
    'advance',
    { step: 'record-the-reason', text: '  superseded by the new interlock  ' },
    'advance',
  ]);
}

// ------------------------------------------------------------------ records and bodies built directly

/**
 * A stored workflow record, well-formed unless `overrides` makes it otherwise: by default a
 * review-data workflow in progress on a platform id nothing has, at its first step, with no entries.
 * @param {string} id
 * @param {Record<string, unknown>} [overrides]
 * @returns {WorkflowRecord}
 */
export function workflowRow(id, overrides = {}) {
  return /** @type {WorkflowRecord} */ (/** @type {unknown} */ ({
    id,
    kind: KIND,
    status: 'live',
    createdBy: alice.id,
    createdAtAest: EARLIER,
    updatedBy: alice.id,
    updatedAtAest: EARLIER,
    workflowKind: 'review-data',
    subject: { kind: 'platform', id: orderedUuid(1, 0xa) },
    state: 'in-progress',
    currentStep: 'review-the-hazards',
    startedOnAest: '2026-09-01',
    completedOnAest: null,
    completedBy: null,
    outcome: null,
    entries: [],
    ...overrides,
  }));
}

/** Overrides that make a `workflowRow` a complete one. */
export const COMPLETE = Object.freeze({
  state: 'complete', currentStep: null, completedOnAest: '2026-09-02', completedBy: alice.id, outcome: 'done',
  entries: [{ step: 'record-the-outcome', entryKind: 'outcome', text: 'done', ref: null, byProfileId: alice.id, atAest: EARLIER }],
});

/**
 * `body` with these workflow records added to its collection under their ids (or under `key`
 * where a pair is given), leaving the input untouched.
 * @param {DataBody} body
 * @param {(WorkflowRecord | [string, unknown])[]} rows
 * @returns {DataBody}
 */
export function withWorkflows(body, rows) {
  const copy = structuredClone(body);
  const collections = /** @type {Record<string, any>} */ (/** @type {unknown} */ (copy.collections));
  collections[KIND] = { ...(collections[KIND] ?? {}) };
  for (const row of rows) {
    if (Array.isArray(row)) collections[KIND][row[0]] = row[1];
    else collections[KIND][row.id] = row;
  }
  return copy;
}

/**
 * The entries of a body's workflow-record collection, whatever their shape: this module's own
 * collection, read directly only to check where and under what key a record is stored.
 * @param {DataBody} body
 * @returns {Record<string, any>}
 */
export function workflowsIn(body) {
  return /** @type {Record<string, any>} */ (/** @type {any} */ (body.collections)[KIND] ?? {});
}

/**
 * `body` with a change-log entry `change-log` C-008 refuses — a record change with no items —
 * so that `recordChange`, and every act that calls it, rejects with `MalformedEntryError`.
 * @param {DataBody} body
 * @returns {DataBody}
 */
export function withUnreadableLog(body) {
  const copy = structuredClone(body);
  const id = orderedUuid(1, 0xe);
  const collections = /** @type {Record<string, any>} */ (/** @type {unknown} */ (copy.collections));
  collections[LOG] = {
    ...(collections[LOG] ?? {}),
    [id]: {
      id, kind: LOG, status: 'live', createdBy: alice.id, createdAtAest: EARLIER, updatedBy: alice.id, updatedAtAest: EARLIER,
      entryKind: 'record-change', items: [], madeForPlatformId: null, affectedPlatformIds: [],
    },
  };
  return copy;
}

/**
 * `body` with every review schedule's tempo made zero, which `review-schedule` C-004 refuses, so
 * every operation of that contract rejects with `MalformedScheduleError`. The body must hold one.
 * @param {DataBody} body
 * @returns {DataBody}
 */
export function withUnreadableSchedules(body) {
  const copy = structuredClone(body);
  const schedules = /** @type {Record<string, any>} */ (/** @type {any} */ (copy.collections)['review-schedule']);
  assert.ok(schedules && Object.keys(schedules).length > 0, 'the body holds a schedule to spoil');
  for (const s of Object.values(schedules)) s.tempoMonths = 0;
  return copy;
}

/**
 * `body` with the live residual rating of `hazardId` made unreadable (a consequence of 9), so
 * `registry.listPlatformHazards` names that hazard in `omitted` rather than as a row (registry
 * C-008, C-019).
 * @param {DataBody} body
 * @param {HazardId} hazardId
 * @returns {DataBody}
 */
export function withOmittedHazard(body, hazardId) {
  const copy = structuredClone(body);
  const ratings = /** @type {Record<string, any>} */ (/** @type {any} */ (copy.collections).rating);
  const rating = Object.values(ratings).find((r) => r.hazardId === hazardId && r.stage === 'residual' && r.status === 'live');
  assert.ok(rating, `hazard ${hazardId} has a residual rating to spoil`);
  rating.consequence = 9;
  return copy;
}

// ------------------------------------------------------------------ the body is a value (C-003)

/**
 * A deep copy: what a value was, to compare against after a call.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function snapshot(value) {
  return structuredClone(value);
}

/**
 * The body after a JSON serialise and parse, as `store` C-001 carries it.
 * @param {DataBody} body
 * @returns {DataBody}
 */
export function jsonRoundTrip(body) {
  return JSON.parse(JSON.stringify(body));
}

/**
 * Freeze a value and everything reachable from it, so a mutation throws instead of passing unseen.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/**
 * Where two bodies differ, outside the change-log collection: `collection/key` for an entry
 * added, removed, or changed, the collection's name for one that is not a map, and
 * `sequences.name` for a sequence.
 * @param {DataBody} input
 * @param {DataBody} output
 * @returns {string[]}
 */
export function differences(input, output) {
  /** @type {string[]} */
  const out = [];
  const isMap = (/** @type {unknown} */ v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const ic = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (input.collections));
  const oc = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (output.collections ?? {}));
  for (const name of new Set([...Object.keys(ic), ...Object.keys(oc)])) {
    if (name === LOG) continue;
    const a = ic[name];
    const b = oc[name];
    if ((a === undefined || isMap(a)) && (b === undefined || isMap(b))) {
      const am = /** @type {Record<string, unknown>} */ (a ?? {});
      const bm = /** @type {Record<string, unknown>} */ (b ?? {});
      for (const key of new Set([...Object.keys(am), ...Object.keys(bm)])) {
        const inA = Object.prototype.hasOwnProperty.call(am, key);
        const inB = Object.prototype.hasOwnProperty.call(bm, key);
        if (inA !== inB || !isDeepStrictEqual(am[key], bm[key])) out.push(`${name}/${key}`);
      }
    } else if (!isDeepStrictEqual(a, b)) {
      out.push(name);
    }
  }
  const is = /** @type {Record<string, unknown>} */ (input.sequences ?? {});
  const os = /** @type {Record<string, unknown>} */ (output.sequences ?? {});
  for (const name of new Set([...Object.keys(is), ...Object.keys(os)])) if (!isDeepStrictEqual(is[name], os[name])) out.push(`sequences.${name}`);
  return out.sort();
}

/**
 * The collections `differences` names, without their keys.
 * @param {string[]} diffs
 * @returns {string[]}
 */
export function collectionsIn(diffs) {
  return [...new Set(diffs.map((d) => d.split('/')[0]))].sort();
}

// ------------------------------------------------------------------ the entries an act wrote (C-010)

/**
 * The item `change-log` gives for one record handed to it (change-log C-002, C-004, C-005):
 * the action from the status transition; for `edited`, one field change per field whose values
 * differ, for the others, one per field of either side; ascending by field; never `updatedBy`
 * or `updatedAtAest`.
 * @param {any} before
 * @param {any} after
 * @returns {any}
 */
export function expectedItem(before, after) {
  const action = before === null ? 'created'
    : after.status === 'deleted' && before.status !== 'deleted' ? 'deleted'
      : after.status === 'retired' && before.status !== 'retired' ? 'retired'
        : 'edited';
  const b = before ?? {};
  const names = [...new Set([...Object.keys(b), ...Object.keys(after)])].filter((f) => f !== 'updatedBy' && f !== 'updatedAtAest').sort();
  /** @type {any[]} */
  const fields = [];
  for (const field of names) {
    const inB = Object.prototype.hasOwnProperty.call(b, field);
    const inA = Object.prototype.hasOwnProperty.call(after, field);
    if (action === 'edited' && inB === inA && isDeepStrictEqual(b[field], after[field])) continue;
    fields.push({ field, before: inB ? b[field] : null, after: inA ? after[field] : null });
  }
  return { ref: { kind: after.kind, id: after.id }, action, fields };
}

/**
 * The entries of `output` that `input` did not hold, read through `change-log`'s contract,
 * after checking every entry `input` held is still there as it was.
 * @param {DataBody} input
 * @param {DataBody} output
 * @param {string} what
 * @returns {Promise<ChangeLogEntry[]>}
 */
export async function addedEntries(input, output, what) {
  const had = [...(await changeLog.listEntries(input))];
  const has = [...(await changeLog.listEntries(output))];
  for (const e of had) assert.deepEqual(has.find((x) => x.id === e.id), e, `${what}: entry ${e.id} is still in the log as it was`);
  return has.filter((e) => !had.some((x) => x.id === e.id));
}

/**
 * @param {ChangeLogEntry} entry
 * @returns {boolean} whether the entry holds an item for a workflow record
 */
export function isWorkflowEntry(entry) {
  return entry.entryKind === 'record-change' && /** @type {RecordChangeEntry} */ (entry).items.some((i) => i.ref.kind === KIND);
}

/**
 * Check C-010 for one resolved changing call: `output` holds exactly `total` entries `input` did
 * not, exactly one of which holds an item for a workflow record; that entry's one item is the
 * record `before` to `after`, it is stamped with the act's profile and `at`, its
 * `madeForPlatformId` is the act's unchanged, and its `affectedPlatformIds` are `affected`.
 * Returns the added entries that are not the workflow record's, in log order.
 * @param {DataBody} input
 * @param {DataBody} output
 * @param {{ act: Act, at: TimestampAest, before: WorkflowRecord | null, after: WorkflowRecord, affected: readonly string[], total: number, what: string }} expected
 * @returns {Promise<RecordChangeEntry[]>}
 */
export async function assertRecorded(input, output, expected) {
  const { what } = expected;
  const added = await addedEntries(input, output, what);
  assert.equal(added.length, expected.total, `${what}: ${expected.total} entr(ies) added to the log (C-010), got ${added.length}`);
  const mine = added.filter(isWorkflowEntry);
  assert.equal(mine.length, 1, `${what}: exactly one entry records the workflow record (C-010), got ${mine.length}`);
  const entry = /** @type {RecordChangeEntry} */ (mine[0]);
  assert.equal(entry.createdBy, expected.act.profile.id, `${what}: the workflow record's entry is stamped with act.profile`);
  assert.equal(entry.createdAtAest, expected.at, `${what}: the workflow record's entry is stamped with the clock's now`);
  assert.equal(entry.madeForPlatformId, expected.act.madeForPlatformId, `${what}: madeForPlatformId is act.madeForPlatformId unchanged`);
  assert.deepEqual([...entry.affectedPlatformIds], [...expected.affected], `${what}: affectedPlatformIds is registry.platformsAffected of the subject (DEC-026)`);
  assert.deepEqual(entry.items, [expectedItem(expected.before, expected.after)], `${what}: the one item is the workflow record as it was and as it now is`);
  return /** @type {RecordChangeEntry[]} */ (added.filter((e) => !isWorkflowEntry(e)));
}

// ------------------------------------------------------------------ rejections

/**
 * The error a call rejects with; fails the test if it resolves.
 * @param {() => Promise<unknown>} call
 * @param {string} [what]
 * @returns {Promise<any>}
 */
export async function rejectionOf(call, what = 'the call') {
  /** @type {unknown} */
  let error = null;
  let rejected = false;
  await call().then(
    () => { throw new Error(`${what} resolved; a rejection was expected`); },
    (e) => { error = e; rejected = true; },
  );
  if (!rejected) throw new Error(`${what} did not reject`);
  return error;
}

/**
 * Check that a call rejects with `type` and leaves `body` deep-equal to what it was (section 4).
 * @param {() => Promise<unknown>} call
 * @param {Function} type
 * @param {DataBody} body
 * @param {string} what
 * @returns {Promise<any>} the error
 */
export async function assertRefused(call, type, body, what) {
  const before = snapshot(body);
  const e = await rejectionOf(call, what);
  assert.ok(e instanceof type, `${what}: rejects with ${type.name}, got ${e && e.name}: ${String(e && e.message)}`);
  assert.deepEqual(body, before, `${what}: body unchanged`);
  return e;
}

// ------------------------------------------------------------------ seeded randomness (CORE-TST-001)

/**
 * mulberry32: small, deterministic, good enough to pick cases with.
 * @param {number} seed
 * @returns {() => number} uniform in [0, 1)
 */
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @template T
 * @param {() => number} random
 * @param {readonly T[]} list
 * @returns {T}
 */
export function oneOf(random, list) {
  return list[Math.floor(random() * list.length)];
}

// ------------------------------------------------------------------ the browser's storage

/**
 * Run `fn` with `localStorage` and `sessionStorage` present on `globalThis` as spies that record
 * every use, for C-003. The real objects, if the runtime has them, are restored after.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<{ result: T, uses: string[] }>}
 */
export async function withBrowserStorageSpies(fn) {
  /** @type {string[]} */
  const uses = [];
  /** @param {string} which */
  const spy = (which) => ({
    length: 0,
    getItem: () => { uses.push(`${which}.getItem`); return null; },
    setItem: (/** @type {string} */ key) => { uses.push(`${which}.setItem(${key})`); },
    removeItem: (/** @type {string} */ key) => { uses.push(`${which}.removeItem(${key})`); },
    clear: () => { uses.push(`${which}.clear()`); },
    key: () => null,
  });
  const g = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (globalThis));
  const saved = { localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), sessionStorage: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage') };
  Object.defineProperty(globalThis, 'localStorage', { value: spy('localStorage'), configurable: true, writable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: spy('sessionStorage'), configurable: true, writable: true });
  try {
    const result = await fn();
    return { result, uses };
  } finally {
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete g[name];
    }
  }
}

export { changeLog, registry, rs, schema, wf, workflowRecordId };
