/**
 * review-schedule conformance: operations (CORE-CON-002). Every signature on its happy path,
 * each test naming the clause of modules/review-schedule/CONTRACT.md it encodes and the SL-06
 * criterion behind it. Expected values are written out literally here, not from the harness's
 * models, so this file reads as the contract does. Written from the contract and
 * docs/slices/SL-06.md before any implementation (P8).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as rs from '../contract.js';
import {
  FOUR_KINDS, HELD, KIND, actOf, assertRecorded, bodyOf, changeLog, differences, jsonRoundTrip, newProfile, on, orderedUuid,
  platformNo, refTo, reviewScheduleId, scheduleRow, schedulesIn, schema, snapshot, withClock,
} from './harness.js';

test('SCHEDULABLE_KINDS is exactly hazard, control, platform, and reference-entry (C-011; SL-06 criterion 1)', () => {
  assert.deepEqual([...rs.SCHEDULABLE_KINDS].sort(), ['control', 'hazard', 'platform', 'reference-entry']);
});

test('setSchedule on an empty body creates one live schedule under a fresh id, as given, with no last reviewed date, stamped with the act and the clock, records it, and leaves the input body as it was (C-001, C-002, C-005, C-012; SL-06 criterion 1)', async () => {
  const body = schema.emptyDataBody();
  const before = snapshot(body);
  const alice = newProfile('Alice');
  const act = actOf(alice, platformNo(1), [platformNo(2), platformNo(1)]);
  const ref = refTo('hazard', 7);

  const { body: b, schedule: s } = await withClock(HELD, () => rs.setSchedule(body, act, { ref, tempoMonths: 6, nextDueAest: '2026-12-01' }));

  assert.doesNotThrow(() => reviewScheduleId.parse(s.id), 'the id is a ReviewScheduleId');
  assert.deepEqual(s, {
    id: s.id,
    kind: KIND,
    status: 'live',
    createdBy: alice.id,
    createdAtAest: HELD,
    updatedBy: alice.id,
    updatedAtAest: HELD,
    ref: { kind: 'hazard', id: 'H-0007' },
    tempoMonths: 6,
    nextDueAest: '2026-12-01',
    lastReviewedAest: null,
  }, 'the schedule as C-001 describes it, and nothing else');
  assert.deepEqual(Object.keys(schedulesIn(b)), [s.id], 'the collection holds the one schedule, under its id');
  assert.deepEqual(schedulesIn(b)[s.id], s, 'the stored schedule is the schedule returned');
  assert.deepEqual(await rs.getSchedule(b, ref), s);
  assert.deepEqual([...(await rs.listSchedules(b))], [s]);
  assert.deepEqual(differences(body, b), [`${KIND}/${s.id}`], 'the body differs by the one schedule and the log');
  await assertRecorded(body, b, { act, at: HELD, before: null, after: s, what: 'setSchedule' });
  assert.deepEqual(body, before, 'the body passed in is unchanged');
});

test('the entry setSchedule writes is created, holds every field of the schedule with its value, and is the history of the schedule (C-012; change-log C-004, C-005, C-009)', async () => {
  const alice = newProfile('Alice');
  const { body: b, schedule: s } = await withClock(HELD, () => rs.setSchedule(schema.emptyDataBody(), actOf(alice), { ref: refTo('control', 1), tempoMonths: 3, nextDueAest: '2027-01-31' }));
  const history = await changeLog.listHistory(b, { kind: KIND, id: s.id });
  assert.equal(history.length, 1);
  assert.deepEqual(/** @type {any} */ (history[0]).items, [{
    ref: { kind: KIND, id: s.id },
    action: 'created',
    fields: [
      { field: 'createdAtAest', before: null, after: HELD },
      { field: 'createdBy', before: null, after: alice.id },
      { field: 'id', before: null, after: s.id },
      { field: 'kind', before: null, after: KIND },
      { field: 'lastReviewedAest', before: null, after: null },
      { field: 'nextDueAest', before: null, after: '2027-01-31' },
      { field: 'ref', before: null, after: { kind: 'control', id: refTo('control', 1).id } },
      { field: 'status', before: null, after: 'live' },
      { field: 'tempoMonths', before: null, after: 3 },
    ],
  }]);
});

test('a tempo can be set for each of the four kinds, one record at a time, by the same operation, and each is stored as given (C-005, C-011; SL-06 criterion 1; REQ-020, REQ-022, REQ-072)', async () => {
  const alice = newProfile('Alice');
  let body = schema.emptyDataBody();
  const tempos = { hazard: 1, control: 4, platform: 12, 'reference-entry': 36 };
  for (const kind of FOUR_KINDS) {
    ({ body } = await withClock(HELD, () => rs.setSchedule(body, actOf(alice), { ref: refTo(kind, 3), tempoMonths: tempos[/** @type {keyof typeof tempos} */ (kind)], nextDueAest: '2027-03-15' })));
  }
  for (const kind of FOUR_KINDS) {
    const s = await rs.getSchedule(body, refTo(kind, 3));
    assert.ok(s, `the ${kind} has a schedule`);
    assert.equal(s.tempoMonths, tempos[/** @type {keyof typeof tempos} */ (kind)], `the ${kind}'s tempo is the one set for it`);
    assert.deepEqual(s.ref, refTo(kind, 3));
  }
  assert.equal((await rs.listSchedules(body)).length, 4, 'four records, four schedules; no tempo was set by kind or by default');
  assert.equal(await rs.getSchedule(body, refTo('hazard', 4)), null, 'a hazard nobody set a tempo for has no schedule');
});

test('the tempo and due date survive a save and a load: the body after setSchedule and completeReview is deep-equal to itself after JSON serialisation, and reads back the same (section 3; SL-06 criterion 1; REQ-072)', async () => {
  const alice = newProfile('Alice');
  const ref = refTo('platform', 2);
  const { body: b1 } = await withClock(HELD, () => rs.setSchedule(schema.emptyDataBody(), actOf(alice), { ref, tempoMonths: 12, nextDueAest: '2026-10-01' }));
  const { body: b2, schedule: s } = await withClock(on('2026-10-03'), () => rs.completeReview(b1, actOf(alice), ref));
  const reloaded = jsonRoundTrip(b2);
  assert.deepEqual(reloaded, b2);
  assert.deepEqual(await rs.getSchedule(reloaded, ref), s);
  assert.deepEqual([...(await rs.listSchedules(reloaded))], [s]);
});

test('setSchedule for a record that has a live schedule updates that one record: same id, creator, creation time, and last reviewed date; new tempo, due date, and update stamp; one entry, edited, of the fields that changed (C-001, C-007, C-012)', async () => {
  const alice = newProfile('Alice');
  const bob = newProfile('Bob');
  const ref = refTo('hazard', 1);
  const s0 = scheduleRow(orderedUuid(1), alice, ref, 6, '2026-11-01', { lastReviewedAest: '2026-05-01' });
  const body = bodyOf([s0]);
  const act = actOf(bob, null, [platformNo(3)]);

  const { body: b, schedule: s } = await withClock(HELD, () => rs.setSchedule(body, act, { ref, tempoMonths: 3, nextDueAest: '2026-10-15' }));

  assert.deepEqual(s, { ...s0, tempoMonths: 3, nextDueAest: '2026-10-15', updatedBy: bob.id, updatedAtAest: HELD });
  assert.deepEqual(differences(body, b), [`${KIND}/${s0.id}`], 'only that schedule changed');
  assert.deepEqual([...(await rs.listSchedules(b))], [s], 'still one schedule for the record');
  const entry = await assertRecorded(body, b, { act, at: HELD, before: s0, after: s, what: 'setSchedule over an existing schedule' });
  assert.deepEqual(entry.items, [{
    ref: { kind: KIND, id: s0.id },
    action: 'edited',
    fields: [
      { field: 'nextDueAest', before: '2026-11-01', after: '2026-10-15' },
      { field: 'tempoMonths', before: 6, after: 3 },
    ],
  }], 'the previous and new value of each field that changed');
});

test('setSchedule that changes only the due date, or only the tempo, is a change and is stored (C-013)', async () => {
  const alice = newProfile('Alice');
  const ref = refTo('control', 5);
  const body = bodyOf([scheduleRow(orderedUuid(1), alice, ref, 6, '2026-11-01')]);
  const { schedule: a } = await withClock(HELD, () => rs.setSchedule(body, actOf(alice), { ref, tempoMonths: 6, nextDueAest: '2026-11-02' }));
  assert.equal(a.nextDueAest, '2026-11-02');
  const { schedule: t } = await withClock(HELD, () => rs.setSchedule(body, actOf(alice), { ref, tempoMonths: 7, nextDueAest: '2026-11-01' }));
  assert.equal(t.tempoMonths, 7);
});

test('completeReview stamps today as the last reviewed date and advances the due date one tempo from the due date, keeping everything else, and records it as an edit (C-007, C-008, C-012; SL-06 criteria 2 and 3; REQ-015, REQ-021)', async () => {
  const alice = newProfile('Alice');
  const bob = newProfile('Bob');
  const ref = refTo('hazard', 2);
  const s0 = scheduleRow(orderedUuid(1), alice, ref, 3, '2026-09-30');
  const body = bodyOf([s0]);
  const before = snapshot(body);
  const act = actOf(bob, platformNo(1), [platformNo(1), platformNo(2)]);
  const at = on('2026-09-20', '16:45:10');

  const { body: b, schedule: s } = await withClock(at, () => rs.completeReview(body, act, ref));

  assert.deepEqual(s, { ...s0, lastReviewedAest: '2026-09-20', nextDueAest: '2026-12-30', updatedBy: bob.id, updatedAtAest: at });
  assert.deepEqual(await rs.getSchedule(b, ref), s);
  assert.deepEqual(differences(body, b), [`${KIND}/${s0.id}`]);
  const entry = await assertRecorded(body, b, { act, at, before: s0, after: s, what: 'completeReview' });
  assert.deepEqual(entry.items, [{
    ref: { kind: KIND, id: s0.id },
    action: 'edited',
    fields: [
      { field: 'lastReviewedAest', before: null, after: '2026-09-20' },
      { field: 'nextDueAest', before: '2026-09-30', after: '2026-12-30' },
    ],
  }]);
  assert.deepEqual(body, before, 'the body passed in is unchanged');
});

test('completeReview late does not pull the schedule forward to today, and early does not push it beyond one tempo: the due date is the old due date plus the tempo whatever the clock (C-006, C-008; SL-06 criterion 2)', async () => {
  const alice = newProfile('Alice');
  const ref = refTo('platform', 4);
  const body = bodyOf([scheduleRow(orderedUuid(1), alice, ref, 1, '2026-06-10', { lastReviewedAest: '2026-01-02' })]);
  for (const today of ['2026-03-01', '2026-06-10', '2026-06-11', '2027-02-14']) {
    const { schedule: s } = await withClock(on(today), () => rs.completeReview(body, actOf(alice), ref));
    assert.equal(s.nextDueAest, '2026-07-10', `completed on ${today}: one month after the due date`);
    assert.equal(s.lastReviewedAest, today, `completed on ${today}: the last reviewed date is that day`);
  }
});

test('completeReview month arithmetic, the four cases DEC-019 fixes (C-008)', async () => {
  const alice = newProfile('Alice');
  const cases = [
    { due: '2027-01-31', tempo: 1, next: '2027-02-28', why: '31 January, tempo 1, clamps to 28 February' },
    { due: '2028-01-31', tempo: 1, next: '2028-02-29', why: '31 January, tempo 1, in a leap year gives 29 February' },
    { due: '2026-03-31', tempo: 1, next: '2026-04-30', why: '31 March, tempo 1, clamps to 30 April' },
    { due: '2026-06-15', tempo: 12, next: '2027-06-15', why: '15 June, tempo 12, is 15 June the next year' },
    { due: '2028-02-29', tempo: 12, next: '2029-02-28', why: '29 February, tempo 12, clamps to 28 February' },
  ];
  for (const c of cases) {
    const ref = refTo('control', 9);
    const body = bodyOf([scheduleRow(orderedUuid(1), alice, ref, c.tempo, c.due)]);
    const { schedule: s } = await withClock(HELD, () => rs.completeReview(body, actOf(alice), ref));
    assert.equal(s.nextDueAest, c.next, c.why);
  }
});

test('the day of the month does not recover: 31 January with a tempo of 1, completed twice, is 28 February then 28 March (C-008; explicitly not promised)', async () => {
  const alice = newProfile('Alice');
  const ref = refTo('hazard', 3);
  const { body: b1, schedule: s1 } = await withClock(HELD, () => rs.completeReview(bodyOf([scheduleRow(orderedUuid(1), alice, ref, 1, '2027-01-31')]), actOf(alice), ref));
  assert.equal(s1.nextDueAest, '2027-02-28');
  const { schedule: s2 } = await withClock(HELD, () => rs.completeReview(b1, actOf(alice), ref));
  assert.equal(s2.nextDueAest, '2027-03-28');
});

test('completeReview twice advances the due date two tempos and records two entries (section 5, idempotency)', async () => {
  const alice = newProfile('Alice');
  const ref = refTo('reference-entry', 1);
  const body = bodyOf([scheduleRow(orderedUuid(1), alice, ref, 2, '2026-10-05')]);
  const { body: b1 } = await withClock(HELD, () => rs.completeReview(body, actOf(alice), ref));
  const { body: b2, schedule: s } = await withClock(HELD, () => rs.completeReview(b1, actOf(alice), ref));
  assert.equal(s.nextDueAest, '2027-02-05');
  assert.equal(s.lastReviewedAest, '2026-09-15');
  assert.equal((await changeLog.listEntries(b2)).length, 2);
});

test('reviewStateOf: on the due date not overdue, the day after overdue, the day before not overdue, with asAtAest the clock\'s today (C-009; SL-06 criterion 4; HZ-012)', async () => {
  const alice = newProfile('Alice');
  const ref = refTo('hazard', 1);
  const s = scheduleRow(orderedUuid(1), alice, ref, 12, '2026-09-15');
  const body = bodyOf([s]);
  assert.deepEqual(await withClock(on('2026-09-14'), () => rs.reviewStateOf(body, ref)), { ref, schedule: s, overdue: false, asAtAest: '2026-09-14' }, 'the day before');
  assert.deepEqual(await withClock(on('2026-09-15'), () => rs.reviewStateOf(body, ref)), { ref, schedule: s, overdue: false, asAtAest: '2026-09-15' }, 'on the due date');
  assert.deepEqual(await withClock(on('2026-09-16'), () => rs.reviewStateOf(body, ref)), { ref, schedule: s, overdue: true, asAtAest: '2026-09-16' }, 'the day after');
});

test('the overdue flag turns over at midnight AEST and not at an hour of the day: the last second of the due date is on time, the first second of the next day is overdue (C-009)', async () => {
  const alice = newProfile('Alice');
  const ref = refTo('control', 1);
  const body = bodyOf([scheduleRow(orderedUuid(1), alice, ref, 1, '2026-09-15')]);
  assert.equal((await withClock(on('2026-09-15', '23:59:59'), () => rs.reviewStateOf(body, ref))).overdue, false);
  assert.equal((await withClock(on('2026-09-16', '00:00:00'), () => rs.reviewStateOf(body, ref))).overdue, true);
  assert.equal((await withClock(on('2026-09-15', '00:00:00'), () => rs.reviewStateOf(body, ref))).overdue, false);
});

test('reviewStateOf a record with no schedule: schedule null, not overdue, whatever the clock (C-009, section 4)', async () => {
  const ref = refTo('platform', 8);
  assert.deepEqual(await withClock(on('2099-01-01'), () => rs.reviewStateOf(schema.emptyDataBody(), ref)), { ref, schedule: null, overdue: false, asAtAest: '2099-01-01' });
});

test('listOverdue gives a state for every live schedule past its due date, in ascending due date then id, all with one asAtAest, and nothing else (C-010; SL-06 criterion 4; HZ-012)', async () => {
  const alice = newProfile('Alice');
  const today = '2026-09-15';
  const a = scheduleRow(orderedUuid(3), alice, refTo('hazard', 1), 1, '2026-09-14');
  const b = scheduleRow(orderedUuid(2), alice, refTo('control', 1), 1, '2026-01-01');
  const c = scheduleRow(orderedUuid(1), alice, refTo('platform', 1), 1, '2026-09-14');
  const due = scheduleRow(orderedUuid(4), alice, refTo('reference-entry', 1), 1, today);
  const later = scheduleRow(orderedUuid(5), alice, refTo('hazard', 2), 1, '2026-12-01');
  const retired = scheduleRow(orderedUuid(6), alice, refTo('hazard', 3), 1, '2025-01-01', { status: 'retired' });
  const deleted = scheduleRow(orderedUuid(7), alice, refTo('hazard', 4), 1, '2025-01-01', { status: 'deleted' });
  const body = bodyOf([a, b, c, due, later, retired, deleted]);

  const list = await withClock(on(today), () => rs.listOverdue(body));

  assert.deepEqual([...list], [
    { ref: b.ref, schedule: b, overdue: true, asAtAest: today },
    { ref: c.ref, schedule: c, overdue: true, asAtAest: today },
    { ref: a.ref, schedule: a, overdue: true, asAtAest: today },
  ], 'the three past due, by due date then id; not the one due today, not the one due later, not the retired or deleted');
});

test('listSchedules gives every live schedule once, in ascending due date then id, and no retired or deleted one (C-001, section 5 ordering)', async () => {
  const alice = newProfile('Alice');
  const x = scheduleRow(orderedUuid(2), alice, refTo('hazard', 1), 1, '2026-10-01');
  const y = scheduleRow(orderedUuid(1), alice, refTo('hazard', 2), 1, '2026-10-01');
  const z = scheduleRow(orderedUuid(3), alice, refTo('hazard', 3), 1, '2026-01-01');
  const gone = scheduleRow(orderedUuid(4), alice, refTo('hazard', 4), 1, '2025-01-01', { status: 'deleted' });
  assert.deepEqual([...(await rs.listSchedules(bodyOf([x, y, z, gone])))], [z, y, x]);
});

test('getSchedule gives the live schedule of the ref, matching kind and id together: a hazard and a control sharing an id string are two records (C-001, C-011)', async () => {
  const alice = newProfile('Alice');
  const id = orderedUuid(9, 0xb);
  const onControl = scheduleRow(orderedUuid(1), alice, { kind: 'control', id }, 2, '2026-10-01');
  const onPlatform = scheduleRow(orderedUuid(2), alice, { kind: 'platform', id }, 5, '2026-11-01');
  const body = bodyOf([onControl, onPlatform]);
  assert.deepEqual(await rs.getSchedule(body, { kind: 'control', id }), onControl);
  assert.deepEqual(await rs.getSchedule(body, { kind: 'platform', id }), onPlatform);
  assert.equal(await rs.getSchedule(body, { kind: 'reference-entry', id }), null);
});

test('a schedule is set for a reference entry although no module owns that kind, and it is listed and flagged overdue (C-011)', async () => {
  const alice = newProfile('Alice');
  const ref = refTo('reference-entry', 4);
  const { body, schedule: s } = await withClock(HELD, () => rs.setSchedule(schema.emptyDataBody(), actOf(alice), { ref, tempoMonths: 24, nextDueAest: '2026-09-01' }));
  assert.deepEqual([...(await rs.listSchedules(body))], [s]);
  assert.deepEqual([...(await withClock(HELD, () => rs.listOverdue(body)))], [{ ref, schedule: s, overdue: true, asAtAest: '2026-09-15' }]);
});
