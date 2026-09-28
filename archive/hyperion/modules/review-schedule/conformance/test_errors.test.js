/**
 * review-schedule conformance: errors (CORE-CON-002). Every row of section 4 of
 * modules/review-schedule/CONTRACT.md, each asserting the named error class, what it carries
 * where the row names it, and that the body passed in is unchanged; then the order section 4
 * gives when two conditions hold at once, using only pairs whose order the contract states.
 * Written from the contract before any implementation (P8).
 *
 * The null double must fail this file (CORE-TST-002, rung 1).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as rs from '../contract.js';
import {
  HELD, UNSCHEDULABLE_KINDS, actOf, assertRefused, bodyOf, changeLog, malformedLog, newProfile, orderedUuid, platformNo,
  refTo, scheduleRow, schema, withClock,
} from './harness.js';

/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */

const alice = newProfile('Alice');
const REF = refTo('hazard', 1);

/**
 * Every operation of section 2, called with well-formed arguments on `body` for `ref`.
 * @param {DataBody} body
 * @param {import('../../../baseline/types.js').RecordRef} ref
 * @returns {[string, () => Promise<unknown>][]}
 */
function everyOperation(body, ref) {
  return [
    ['setSchedule', () => withClock(HELD, () => rs.setSchedule(body, actOf(alice), { ref, tempoMonths: 2, nextDueAest: '2027-01-01' }))],
    ['completeReview', () => withClock(HELD, () => rs.completeReview(body, actOf(alice), ref))],
    ['getSchedule', () => rs.getSchedule(body, ref)],
    ['listSchedules', () => rs.listSchedules(body)],
    ['reviewStateOf', () => withClock(HELD, () => rs.reviewStateOf(body, ref))],
    ['listOverdue', () => withClock(HELD, () => rs.listOverdue(body))],
  ];
}

/**
 * The operations that take a ref, called with `ref` on a body that holds a live schedule for REF.
 * @param {unknown} ref
 * @returns {[string, DataBody, () => Promise<unknown>][]}
 */
function everyRefOperation(ref) {
  const body = bodyOf([scheduleRow(orderedUuid(1), alice, REF, 1, '2026-01-01')]);
  const r = /** @type {any} */ (ref);
  return [
    ['setSchedule', body, () => withClock(HELD, () => rs.setSchedule(body, actOf(alice), { ref: r, tempoMonths: 2, nextDueAest: '2027-01-01' }))],
    ['completeReview', body, () => withClock(HELD, () => rs.completeReview(body, actOf(alice), r))],
    ['getSchedule', body, () => rs.getSchedule(body, r)],
    ['reviewStateOf', body, () => withClock(HELD, () => rs.reviewStateOf(body, r))],
  ];
}

// ------------------------------------------------------------------ malformed schedule (C-004)

/** @type {[string, (s: any) => void, string?][]} each way C-004 names a schedule malformed, applied to a well-formed one */
const MALFORMATIONS = [
  ['its key differs from its id', () => {}, orderedUuid(99)],
  ['its id is not a ReviewScheduleId', (s) => { s.id = 'RS-1'; }, 'RS-1'],
  ['its kind is not review-schedule', (s) => { s.kind = 'hazard'; }],
  ['its status is not a RecordStatus', (s) => { s.status = 'archived'; }],
  ['createdBy is not a user profile id', (s) => { s.createdBy = 'alice'; }],
  ['updatedBy is not a user profile id', (s) => { s.updatedBy = null; }],
  ['createdAtAest is not a TimestampAest', (s) => { s.createdAtAest = '2026-01-05T08:00:00Z'; }],
  ['updatedAtAest is not a TimestampAest', (s) => { s.updatedAtAest = '2026-01-05'; }],
  ['its ref is missing', (s) => { delete s.ref; }],
  ['its ref has no id', (s) => { s.ref = { kind: 'hazard' }; }],
  ['its ref id is not a string', (s) => { s.ref = { kind: 'hazard', id: 7 }; }],
  ['its ref kind is not a record kind', (s) => { s.ref = { kind: 'widget', id: 'W-1' }; }],
  ['its ref kind is outside SCHEDULABLE_KINDS', (s) => { s.ref = { kind: 'rating', id: orderedUuid(3) }; }],
  ['its tempoMonths is zero', (s) => { s.tempoMonths = 0; }],
  ['its tempoMonths is a fraction', (s) => { s.tempoMonths = 1.5; }],
  ['its tempoMonths is a string', (s) => { s.tempoMonths = '3'; }],
  ['its nextDueAest is not a real calendar date', (s) => { s.nextDueAest = '2026-02-30'; }],
  ['its nextDueAest is a timestamp', (s) => { s.nextDueAest = '2026-10-01T00:00:00+10:00'; }],
  ['its nextDueAest is null', (s) => { s.nextDueAest = null; }],
  ['its lastReviewedAest is neither null nor a date', (s) => { s.lastReviewedAest = ''; }],
  ['its lastReviewedAest is absent', (s) => { delete s.lastReviewedAest; }],
];

test('every operation rejects with MalformedScheduleError naming the key, for each way C-004 names a schedule malformed, even when the call is about another record, and the body is unchanged (C-004, section 4; HZ-012)', async () => {
  for (const [how, spoil, keyOverride] of MALFORMATIONS) {
    const bad = /** @type {any} */ (structuredClone(scheduleRow(orderedUuid(2), alice, refTo('control', 2), 3, '2026-08-01')));
    spoil(bad);
    const key = keyOverride ?? bad.id ?? orderedUuid(2);
    const good = scheduleRow(orderedUuid(1), alice, REF, 1, '2026-01-01');
    const body = bodyOf([good]);
    /** @type {any} */ (body.collections)['review-schedule'][key] = bad;
    for (const [name, call] of everyOperation(body, REF)) {
      const e = await assertRefused(call, rs.MalformedScheduleError, body, `${name} when a schedule's ${how}`);
      assert.equal(e.key, key, `${name} when a schedule's ${how}: names the entry's key`);
    }
  }
});

test('a schedule whose due date is far in the past or the future is not malformed (C-004)', async () => {
  const body = bodyOf([
    scheduleRow(orderedUuid(1), alice, REF, 1, '1900-01-01'),
    scheduleRow(orderedUuid(2), alice, refTo('control', 1), 1, '2999-12-31'),
  ]);
  const list = await withClock(HELD, () => rs.listOverdue(body));
  assert.deepEqual(list.map((s) => s.ref), [REF]);
});

// ------------------------------------------------------------------ the ref (C-011)

test('an ill-formed ref is refused with InvalidRefError naming the value, on a read as on a change (section 4, C-011)', async () => {
  for (const bad of [undefined, null, 'H-0001', {}, { kind: 'hazard' }, { id: 'H-0001' }, { kind: 'hazard', id: 1 }, { kind: 'widget', id: 'W-1' }]) {
    for (const [name, body, call] of everyRefOperation(bad)) {
      const e = await assertRefused(call, rs.InvalidRefError, body, `${name} with ref ${JSON.stringify(bad)}`);
      assert.deepEqual(e.given, bad, `${name} with ref ${JSON.stringify(bad)}: names the value`);
    }
  }
});

test('setSchedule with no fields at all is refused as a missing ref (section 4)', async () => {
  const body = schema.emptyDataBody();
  await assertRefused(() => withClock(HELD, () => rs.setSchedule(body, actOf(alice), /** @type {any} */ (undefined))), rs.InvalidRefError, body, 'setSchedule with no fields');
});

test('a ref of every record kind outside the four is refused with UnschedulableKindError carrying the kind, on a read as on a change, and no schedule for it is created (C-011)', async () => {
  for (const kind of UNSCHEDULABLE_KINDS) {
    for (const [name, body, call] of everyRefOperation({ kind, id: orderedUuid(5) })) {
      const e = await assertRefused(call, rs.UnschedulableKindError, body, `${name} for a ${kind}`);
      assert.equal(e.kind, kind);
    }
  }
});

// ------------------------------------------------------------------ the act (C-012)

test('setSchedule and completeReview refuse a missing act, a missing profile, or a profile id that is not a user profile id with MissingProfileError (section 4)', async () => {
  const body = bodyOf([scheduleRow(orderedUuid(1), alice, REF, 1, '2026-01-01')]);
  const acts = [undefined, null, { madeForPlatformId: null, affectedPlatformIds: [] }, actOf(/** @type {any} */ ({ name: 'nobody' })), actOf(/** @type {any} */ ({ id: 'alice', name: 'Alice' }))];
  for (const act of acts) {
    const a = /** @type {any} */ (act);
    await assertRefused(() => withClock(HELD, () => rs.setSchedule(body, a, { ref: REF, tempoMonths: 2, nextDueAest: '2027-01-01' })), rs.MissingProfileError, body, `setSchedule with act ${JSON.stringify(act)}`);
    await assertRefused(() => withClock(HELD, () => rs.completeReview(body, a, REF)), rs.MissingProfileError, body, `completeReview with act ${JSON.stringify(act)}`);
  }
});

test('setSchedule and completeReview refuse an act whose platform fields are absent or not platform ids with InvalidActError; neither is defaulted (section 4, C-012; DEC-016, DEC-020)', async () => {
  const body = bodyOf([scheduleRow(orderedUuid(1), alice, REF, 1, '2026-01-01')]);
  const acts = [
    { profile: alice, affectedPlatformIds: [] },
    { profile: alice, madeForPlatformId: undefined, affectedPlatformIds: [] },
    { profile: alice, madeForPlatformId: 'platform one', affectedPlatformIds: [] },
    { profile: alice, madeForPlatformId: null },
    { profile: alice, madeForPlatformId: null, affectedPlatformIds: undefined },
    { profile: alice, madeForPlatformId: null, affectedPlatformIds: [platformNo(1), 'not a platform'] },
    { profile: alice, madeForPlatformId: null, affectedPlatformIds: [null] },
  ];
  for (const act of acts) {
    const a = /** @type {any} */ (act);
    await assertRefused(() => withClock(HELD, () => rs.setSchedule(body, a, { ref: REF, tempoMonths: 2, nextDueAest: '2027-01-01' })), rs.InvalidActError, body, `setSchedule with act ${JSON.stringify(act)}`);
    await assertRefused(() => withClock(HELD, () => rs.completeReview(body, a, REF)), rs.InvalidActError, body, `completeReview with act ${JSON.stringify(act)}`);
  }
});

// ------------------------------------------------------------------ field values (C-005, C-006)

test('setSchedule refuses a tempo that is not a whole number of at least one with InvalidTempoError naming the value, for a new schedule and for an existing one (C-005, section 4)', async () => {
  for (const body of [schema.emptyDataBody(), bodyOf([scheduleRow(orderedUuid(1), alice, REF, 1, '2026-01-01')])]) {
    for (const tempo of [0, -1, 1.5, 0.999, Number.NaN, Number.POSITIVE_INFINITY, '3', null, undefined]) {
      const e = await assertRefused(() => withClock(HELD, () => rs.setSchedule(body, actOf(alice), { ref: REF, tempoMonths: /** @type {any} */ (tempo), nextDueAest: '2027-01-01' })), rs.InvalidTempoError, body, `tempo ${String(tempo)}`);
      assert.ok(Object.is(e.given, tempo), `tempo ${String(tempo)}: names the value`);
    }
  }
});

test('setSchedule refuses a due date that is not a real calendar date as YYYY-MM-DD with InvalidDueDateError naming the value (C-006, section 4)', async () => {
  const body = schema.emptyDataBody();
  for (const due of ['2026-02-29', '2026-13-01', '2026-04-31', '2026-9-15', '15/09/2026', '2026-09-15T00:00:00+10:00', '', null, undefined, 20260915]) {
    const e = await assertRefused(() => withClock(HELD, () => rs.setSchedule(body, actOf(alice), { ref: REF, tempoMonths: 1, nextDueAest: /** @type {any} */ (due) })), rs.InvalidDueDateError, body, `due date ${String(due)}`);
    assert.equal(e.given, due, `due date ${String(due)}: names the value`);
  }
});

// ------------------------------------------------------------------ the schedule's standing

test('completeReview for a ref no schedule names is refused with UnknownScheduleError carrying the ref, and a review is not a way to create a schedule (section 4)', async () => {
  const other = refTo('platform', 1);
  const body = bodyOf([scheduleRow(orderedUuid(1), alice, REF, 1, '2026-01-01')]);
  for (const b of [schema.emptyDataBody(), body]) {
    const e = await assertRefused(() => withClock(HELD, () => rs.completeReview(b, actOf(alice), other)), rs.UnknownScheduleError, b, 'completeReview of an unscheduled record');
    assert.deepEqual(e.ref, other);
  }
  const sameIdOtherKind = { kind: 'control', id: REF.id };
  await assertRefused(() => withClock(HELD, () => rs.completeReview(body, actOf(alice), /** @type {any} */ (sameIdOtherKind))), rs.UnknownScheduleError, body, 'a ref is a kind and an id together');
});

test('setSchedule and completeReview on a record whose schedule is retired or deleted are refused with ScheduleNotLiveError carrying the ref and the status (section 4)', async () => {
  for (const status of /** @type {const} */ (['retired', 'deleted'])) {
    const body = bodyOf([scheduleRow(orderedUuid(1), alice, REF, 1, '2026-01-01', { status })]);
    const e1 = await assertRefused(() => withClock(HELD, () => rs.setSchedule(body, actOf(alice), { ref: REF, tempoMonths: 4, nextDueAest: '2027-01-01' })), rs.ScheduleNotLiveError, body, `setSchedule on a ${status} schedule`);
    assert.deepEqual([e1.ref, e1.status], [REF, status]);
    const e2 = await assertRefused(() => withClock(HELD, () => rs.completeReview(body, actOf(alice), REF)), rs.ScheduleNotLiveError, body, `completeReview on a ${status} schedule`);
    assert.deepEqual([e2.ref, e2.status], [REF, status]);
  }
});

test('setSchedule with the tempo and due date the live schedule already holds is refused with NoChangeError carrying the ref; nothing is restamped and no entry is written (C-013)', async () => {
  const bob = newProfile('Bob');
  const { body } = await withClock(HELD, () => rs.setSchedule(schema.emptyDataBody(), actOf(alice), { ref: REF, tempoMonths: 6, nextDueAest: '2027-01-01' }));
  const e = await assertRefused(() => withClock(HELD, () => rs.setSchedule(body, actOf(bob, platformNo(1), [platformNo(2)]), { ref: REF, tempoMonths: 6, nextDueAest: '2027-01-01' })), rs.NoChangeError, body, 'setSchedule with what is stored');
  assert.deepEqual(e.ref, REF);
  assert.equal((await changeLog.listEntries(body)).length, 1, 'still only the entry of the first call');
});

test('when change-log.recordChange rejects, setSchedule and completeReview reject with that error, MalformedEntryError, and store nothing (section 4, C-012)', async () => {
  const s = scheduleRow(orderedUuid(1), alice, REF, 1, '2026-01-01');
  const log = malformedLog(alice);
  for (const body of [bodyOf([s], { 'change-log-entry': log }), bodyOf([], { 'change-log-entry': log })]) {
    await assertRefused(() => withClock(HELD, () => rs.setSchedule(body, actOf(alice), { ref: refTo('control', 4), tempoMonths: 2, nextDueAest: '2027-01-01' })), changeLog.MalformedEntryError, body, 'setSchedule creating a schedule');
  }
  const body = bodyOf([s], { 'change-log-entry': log });
  await assertRefused(() => withClock(HELD, () => rs.setSchedule(body, actOf(alice), { ref: REF, tempoMonths: 2, nextDueAest: '2027-01-01' })), changeLog.MalformedEntryError, body, 'setSchedule updating a schedule');
  await assertRefused(() => withClock(HELD, () => rs.completeReview(body, actOf(alice), REF)), changeLog.MalformedEntryError, body, 'completeReview');
});

// ------------------------------------------------------------------ which fires first (section 4)

test('the order section 4 gives, pair by pair: malformed schedule, missing profile, ill-formed act, ill-formed ref, unschedulable kind, unknown schedule, not live, field value, no change, and last change-log\'s rejection', async () => {
  const good = scheduleRow(orderedUuid(1), alice, REF, 6, '2027-01-01');
  const retired = scheduleRow(orderedUuid(1), alice, REF, 6, '2027-01-01', { status: 'retired' });
  const spoilt = /** @type {any} */ (scheduleRow(orderedUuid(2), alice, refTo('control', 1), 1, '2026-01-01'));
  spoilt.tempoMonths = 0;
  const withSpoilt = bodyOf([good, spoilt]);
  const noProfile = /** @type {any} */ ({ madeForPlatformId: 'bad', affectedPlatformIds: 'bad' });
  const badAct = /** @type {any} */ ({ profile: alice, madeForPlatformId: 'bad', affectedPlatformIds: [] });
  const log = { 'change-log-entry': malformedLog(alice) };

  /** @type {[string, DataBody, () => Promise<unknown>, Function][]} */
  const cases = [
    ['malformed schedule before missing profile', withSpoilt, () => rs.setSchedule(withSpoilt, noProfile, { ref: REF, tempoMonths: 1, nextDueAest: '2027-01-01' }), rs.MalformedScheduleError],
    ['malformed schedule before an ill-formed ref, on a read', withSpoilt, () => rs.getSchedule(withSpoilt, /** @type {any} */ (null)), rs.MalformedScheduleError],
    ['missing profile before an ill-formed act', bodyOf([good]), () => rs.completeReview(bodyOf([good]), noProfile, REF), rs.MissingProfileError],
    ['ill-formed act before an ill-formed ref', bodyOf([good]), () => rs.completeReview(bodyOf([good]), badAct, /** @type {any} */ ({ kind: 'hazard' })), rs.InvalidActError],
    ['ill-formed act before an ill-formed ref, on setSchedule', bodyOf([good]), () => rs.setSchedule(bodyOf([good]), badAct, { ref: /** @type {any} */ ({ kind: 'hazard' }), tempoMonths: 1, nextDueAest: '2027-01-01' }), rs.InvalidActError],
    ['missing profile before an unschedulable kind, on setSchedule', bodyOf([good]), () => rs.setSchedule(bodyOf([good]), noProfile, { ref: { kind: 'link', id: orderedUuid(3) }, tempoMonths: 1, nextDueAest: '2027-01-01' }), rs.MissingProfileError],
    ['ill-formed ref before a bad tempo', bodyOf([good]), () => rs.setSchedule(bodyOf([good]), actOf(alice), { ref: /** @type {any} */ ({ id: 'x' }), tempoMonths: 0, nextDueAest: 'never' }), rs.InvalidRefError],
    ['unschedulable kind before a bad tempo: a tempo of zero for a rating', bodyOf([good]), () => rs.setSchedule(bodyOf([good]), actOf(alice), { ref: { kind: 'rating', id: orderedUuid(3) }, tempoMonths: 0, nextDueAest: '2027-01-01' }), rs.UnschedulableKindError],
    ['unschedulable kind before an unknown schedule', bodyOf([good]), () => rs.completeReview(bodyOf([good]), actOf(alice), { kind: 'report', id: orderedUuid(3) }), rs.UnschedulableKindError],
    ['not live before a bad due date', bodyOf([retired]), () => rs.setSchedule(bodyOf([retired]), actOf(alice), { ref: REF, tempoMonths: 6, nextDueAest: '2027-02-30' }), rs.ScheduleNotLiveError],
    ['not live before no change: an unchanged tempo on a retired schedule', bodyOf([retired]), () => rs.setSchedule(bodyOf([retired]), actOf(alice), { ref: REF, tempoMonths: 6, nextDueAest: '2027-01-01' }), rs.ScheduleNotLiveError],
    ['not live before change-log\'s rejection', bodyOf([retired], log), () => rs.completeReview(bodyOf([retired], log), actOf(alice), REF), rs.ScheduleNotLiveError],
    ['unknown schedule before change-log\'s rejection', bodyOf([], log), () => rs.completeReview(bodyOf([], log), actOf(alice), REF), rs.UnknownScheduleError],
    ['a bad tempo before change-log\'s rejection', bodyOf([good], log), () => rs.setSchedule(bodyOf([good], log), actOf(alice), { ref: REF, tempoMonths: -2, nextDueAest: '2027-01-01' }), rs.InvalidTempoError],
    ['no change before change-log\'s rejection', bodyOf([good], log), () => rs.setSchedule(bodyOf([good], log), actOf(alice), { ref: REF, tempoMonths: 6, nextDueAest: '2027-01-01' }), rs.NoChangeError],
  ];
  for (const [what, body, call, type] of cases) {
    await assertRefused(() => withClock(HELD, call), type, body, what);
  }
});
