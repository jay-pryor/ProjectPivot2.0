/**
 * review-schedule conformance: boundaries (CORE-CON-002). Empty, degenerate, and edge cases of
 * modules/review-schedule/CONTRACT.md 1.0: a body with no collection or an empty one, the
 * smallest and a very large tempo, month and year ends, a due date already past when it is set,
 * a schedule that is not live, an empty list of platforms, a schedule whose record is gone,
 * collections of other kinds carried through however they are shaped, a history the log cannot
 * read on a read, and the browser's storage left alone. Written from the contract before any
 * implementation (P8).
 *
 * The null double must fail this file (CORE-TST-002, rung 1).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as rs from '../contract.js';
import {
  HELD, KIND, actOf, assertRecorded, bodyOf, changeLog, deepFreeze, differences, malformedLog, newProfile, on, orderedUuid, platformNo, refTo,
  scheduleRow, schedulesIn, schema, snapshot, withBrowserStorageSpies, withClock,
} from './harness.js';

/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */

const alice = newProfile('Alice');
const REF = refTo('hazard', 1);

test('a body with no review-schedule collection, and one with an empty collection: getSchedule is null, both lists are empty, reviewStateOf has no schedule and is not overdue, and completeReview refuses the unknown schedule (section 4, C-001, C-009)', async () => {
  const bodies = [schema.emptyDataBody(), /** @type {DataBody} */ (/** @type {unknown} */ ({ collections: { [KIND]: {} }, sequences: { hazard: 1 } }))];
  for (const body of bodies) {
    assert.equal(await rs.getSchedule(body, REF), null);
    assert.deepEqual([...(await rs.listSchedules(body))], []);
    assert.deepEqual([...(await withClock(HELD, () => rs.listOverdue(body)))], []);
    assert.deepEqual(await withClock(HELD, () => rs.reviewStateOf(body, REF)), { ref: REF, schedule: null, overdue: false, asAtAest: '2026-09-15' });
    await assert.rejects(withClock(HELD, () => rs.completeReview(body, actOf(alice), REF)), rs.UnknownScheduleError);
  }
});

test('the first setSchedule on a body with no collection creates it, holding the one schedule, and the change-log collection with the one entry (C-001, C-012)', async () => {
  const body = schema.emptyDataBody();
  const { body: b, schedule: s } = await withClock(HELD, () => rs.setSchedule(body, actOf(alice), { ref: REF, tempoMonths: 1, nextDueAest: '2026-10-01' }));
  assert.deepEqual(schedulesIn(b), { [s.id]: s });
  assert.equal((await changeLog.listEntries(b)).length, 1);
  assert.deepEqual(body, schema.emptyDataBody());
});

test('a tempo of 1 and a tempo of 1200 months are stored as given and advance by one month and by a hundred years (C-005, C-008)', async () => {
  for (const [tempo, due, next] of /** @type {[number, string, string][]} */ ([[1, '2026-09-15', '2026-10-15'], [1200, '2026-09-15', '2126-09-15']])) {
    const { body, schedule: s } = await withClock(HELD, () => rs.setSchedule(schema.emptyDataBody(), actOf(alice), { ref: REF, tempoMonths: tempo, nextDueAest: due }));
    assert.equal(s.tempoMonths, tempo);
    const { schedule: after } = await withClock(HELD, () => rs.completeReview(body, actOf(alice), REF));
    assert.equal(after.nextDueAest, next, `tempo ${tempo}`);
    assert.equal(after.tempoMonths, tempo, 'the tempo is not changed by a review');
  }
});

test('month arithmetic across a year end and onto short months (C-008; DEC-019)', async () => {
  const cases = [
    ['2026-12-31', 1, '2027-01-31'],
    ['2026-12-15', 3, '2027-03-15'],
    ['2026-11-30', 3, '2027-02-28'],
    ['2027-11-30', 3, '2028-02-29'],
    ['2026-08-31', 6, '2027-02-28'],
    ['2026-05-31', 4, '2026-09-30'],
    ['2026-01-29', 1, '2026-02-28'],
    ['2026-02-28', 1, '2026-03-28'],
    ['2026-10-01', 24, '2028-10-01'],
  ];
  for (const [due, tempo, next] of cases) {
    const body = bodyOf([scheduleRow(orderedUuid(1), alice, REF, /** @type {number} */ (tempo), /** @type {string} */ (due))]);
    const { schedule: s } = await withClock(HELD, () => rs.completeReview(body, actOf(alice), REF));
    assert.equal(s.nextDueAest, next, `${due} plus ${tempo} months`);
  }
});

test('a due date already past when it is set is stored, and the record is overdue from that moment (C-006, C-009)', async () => {
  const { body, schedule: s } = await withClock(HELD, () => rs.setSchedule(schema.emptyDataBody(), actOf(alice), { ref: REF, tempoMonths: 12, nextDueAest: '2020-02-29' }));
  assert.equal(s.nextDueAest, '2020-02-29');
  assert.equal((await withClock(HELD, () => rs.reviewStateOf(body, REF))).overdue, true);
  const { body: reviewed, schedule: after } = await withClock(HELD, () => rs.completeReview(body, actOf(alice), REF));
  assert.equal(after.nextDueAest, '2021-02-28', 'a review long after the due date still advances one tempo from it, not from today');
  assert.equal((await withClock(HELD, () => rs.reviewStateOf(reviewed, REF))).overdue, true, 'and so the record may still be overdue');
});

test('a retired or deleted schedule is not the record\'s schedule on a read: getSchedule is null, reviewStateOf has no schedule and is not overdue, and neither list shows it, however far past due (C-001, C-009, C-010)', async () => {
  for (const status of /** @type {const} */ (['retired', 'deleted'])) {
    const body = bodyOf([scheduleRow(orderedUuid(1), alice, REF, 1, '2000-01-01', { status })]);
    assert.equal(await rs.getSchedule(body, REF), null, status);
    assert.deepEqual(await withClock(HELD, () => rs.reviewStateOf(body, REF)), { ref: REF, schedule: null, overdue: false, asAtAest: '2026-09-15' }, status);
    assert.deepEqual([...(await rs.listSchedules(body))], [], status);
    assert.deepEqual([...(await withClock(HELD, () => rs.listOverdue(body)))], [], status);
  }
});

test('an empty affectedPlatformIds and a null madeForPlatformId are accepted and reach the entry as given (section 5, null and empty semantics; C-012)', async () => {
  const act = actOf(alice, null, []);
  const body = schema.emptyDataBody();
  const { body: b, schedule: s } = await withClock(HELD, () => rs.setSchedule(body, act, { ref: REF, tempoMonths: 2, nextDueAest: '2027-01-01' }));
  const entry = await assertRecorded(body, b, { act, at: HELD, before: null, after: s });
  assert.deepEqual([entry.madeForPlatformId, [...entry.affectedPlatformIds]], [null, []]);
  assert.deepEqual([...(await changeLog.listAwaiting(b, platformNo(1)))], [], 'so no platform awaits it');
});

test('the platforms an act reaches are passed through, not derived: a platform the schedule\'s record has nothing to do with is in the entry, and the entry awaits it (C-012; DEC-020)', async () => {
  const p = platformNo(7);
  const s0 = scheduleRow(orderedUuid(1), alice, REF, 1, '2026-10-01');
  const body = bodyOf([s0]);
  const act = actOf(alice, platformNo(8), [p]);
  const { body: b, schedule: s } = await withClock(HELD, () => rs.completeReview(body, act, REF));
  await assertRecorded(body, b, { act, at: HELD, before: s0, after: s });
  assert.equal((await changeLog.listAwaiting(b, p)).length, 1);
});

test('a schedule survives the record it names being deleted by its owner and goes on falling overdue; a schedule for a record no collection holds is stored (C-011)', async () => {
  const hazards = { hazard: { 'H-0001': { id: 'H-0001', kind: 'hazard', status: 'deleted', title: 'gone' } } };
  const s = scheduleRow(orderedUuid(1), alice, REF, 1, '2026-01-01');
  const body = bodyOf([s], hazards);
  assert.deepEqual([...(await withClock(HELD, () => rs.listOverdue(body)))], [{ ref: REF, schedule: s, overdue: true, asAtAest: '2026-09-15' }]);
  const nobody = refTo('control', 42);
  const { schedule } = await withClock(HELD, () => rs.setSchedule(schema.emptyDataBody(), actOf(alice), { ref: nobody, tempoMonths: 1, nextDueAest: '2027-01-01' }));
  assert.deepEqual(schedule.ref, nobody);
});

test('collections of other kinds, however malformed, are carried through untouched by every operation, and a frozen body is never written to (C-002)', async () => {
  const foreign = {
    hazard: { junk: [1, 2, 3], 'H-0001': { title: 'no header' } },
    control: 'not a map at all',
    'reference-entry': null,
    rating: { x: { kind: 'rating' } },
  };
  const s = scheduleRow(orderedUuid(1), alice, REF, 1, '2026-01-01');
  const body = deepFreeze(bodyOf([s], foreign));
  const before = snapshot(body);
  const { body: b1 } = await withClock(HELD, () => rs.setSchedule(body, actOf(alice), { ref: refTo('platform', 2), tempoMonths: 3, nextDueAest: '2026-12-01' }));
  const { body: b2 } = await withClock(HELD, () => rs.completeReview(body, actOf(alice), REF));
  for (const b of [b1, b2]) {
    for (const [name, value] of Object.entries(foreign)) assert.deepEqual(/** @type {any} */ (b.collections)[name], value, `${name} carried through`);
    assert.equal(differences(body, b).length, 1);
  }
  await rs.getSchedule(body, REF);
  await rs.listSchedules(body);
  await withClock(HELD, () => rs.reviewStateOf(body, REF));
  await withClock(HELD, () => rs.listOverdue(body));
  assert.deepEqual(body, before);
});

test('a read does not touch the history: with a change-log entry change-log cannot read, every read of this module still resolves (C-003, C-012: a read records nothing and calls nothing)', async () => {
  const s = scheduleRow(orderedUuid(1), alice, REF, 1, '2026-01-01');
  const body = bodyOf([s], { 'change-log-entry': malformedLog(alice) });
  assert.deepEqual(await rs.getSchedule(body, REF), s);
  assert.deepEqual([...(await rs.listSchedules(body))], [s]);
  assert.equal((await withClock(HELD, () => rs.reviewStateOf(body, REF))).overdue, true);
  assert.equal((await withClock(HELD, () => rs.listOverdue(body))).length, 1);
});

test('two setSchedule calls in the same second with different values are two changes: both stored, two entries (C-013)', async () => {
  const { body: b1 } = await withClock(HELD, () => rs.setSchedule(schema.emptyDataBody(), actOf(alice), { ref: REF, tempoMonths: 1, nextDueAest: '2027-01-01' }));
  const { body: b2, schedule: s } = await withClock(HELD, () => rs.setSchedule(b1, actOf(alice), { ref: REF, tempoMonths: 2, nextDueAest: '2027-01-01' }));
  assert.equal(s.tempoMonths, 2);
  assert.equal((await changeLog.listEntries(b2)).length, 2);
});

test('no operation reads or writes the browser\'s storage (C-003)', async () => {
  const { uses } = await withBrowserStorageSpies(async () => {
    const { body } = await withClock(HELD, () => rs.setSchedule(schema.emptyDataBody(), actOf(alice), { ref: REF, tempoMonths: 1, nextDueAest: '2026-09-01' }));
    await withClock(on('2026-09-20'), () => rs.completeReview(body, actOf(alice), REF));
    await rs.getSchedule(body, REF);
    await rs.listSchedules(body);
    await withClock(HELD, () => rs.reviewStateOf(body, REF));
    await withClock(HELD, () => rs.listOverdue(body));
  });
  assert.deepEqual(uses, []);
});
