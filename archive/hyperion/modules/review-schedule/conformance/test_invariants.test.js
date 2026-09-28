/**
 * review-schedule conformance: invariants (CORE-CON-002). Property-based over seeded random
 * bodies, clocks, and sequences of acts (CORE-TST-001: SEED is fixed in the harness), each
 * property naming the clause of modules/review-schedule/CONTRACT.md it encodes and comparing
 * against the harness's models of DEC-019 and C-009 and C-010. Written from the contract before
 * any implementation (P8).
 *
 * The null double must fail this file (CORE-TST-002, rung 1).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as rs from '../contract.js';
import {
  FOUR_KINDS, KIND, SEED, actOf, addedEntries, bodyOf, deepFreeze, differences, foreignCollections, jsonRoundTrip, newProfile, on, oneOf,
  orderedUuid, overdueModel, pick, platformNo, plusDays, plusMonths, prng, randomDate, refTo, scheduleRow, schedulesIn, schedulesModel,
  snapshot, withClock,
} from './harness.js';

/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */
/** @typedef {import('../contract.js').ReviewSchedule} ReviewSchedule */

const STATUSES = /** @type {const} */ (['live', 'live', 'live', 'retired', 'deleted']);

/**
 * A body of up to twelve schedules over a small pool of refs, no two for one ref, with random
 * statuses, tempos, due dates, and last reviewed dates, and random collections of other kinds.
 * @param {() => number} random
 * @returns {DataBody}
 */
function randomBody(random) {
  const by = newProfile('Someone');
  const n = pick(random, 13);
  /** @type {ReviewSchedule[]} */
  const rows = [];
  const used = new Set();
  for (let i = 0; i < n; i++) {
    const ref = refTo(oneOf(random, FOUR_KINDS), 1 + pick(random, 6));
    const key = `${ref.kind}/${ref.id}`;
    if (used.has(key)) continue;
    used.add(key);
    rows.push(scheduleRow(orderedUuid(pick(random, 1000), i), by, ref, 1 + pick(random, 36), randomDate(random), {
      status: oneOf(random, STATUSES),
      lastReviewedAest: random() < 0.5 ? null : randomDate(random),
    }));
  }
  return bodyOf(rows, foreignCollections(random));
}

test('HZ-012: over random bodies and clocks, listOverdue is exactly the live schedules strictly past due, in due date then id order, one asAtAest; reviewStateOf of every ref agrees with it; nothing is overdue on its due date (C-009, C-010; SL-06 criterion 4)', async () => {
  const random = prng(SEED);
  for (let round = 0; round < 150; round++) {
    const body = deepFreeze(randomBody(random));
    const live = schedulesModel(body);
    const today = random() < 0.4 && live.length > 0
      ? plusDays(oneOf(random, live).nextDueAest, oneOf(random, [-1, 0, 1]))
      : randomDate(random);
    const at = on(today, oneOf(random, ['00:00:00', '12:00:00', '23:59:59']));

    const list = [...(await withClock(at, () => rs.listOverdue(body)))];
    assert.deepEqual(list, overdueModel(body, today), `round ${round}: listOverdue at ${today}`);

    const refs = Object.values(schedulesIn(body)).map((s) => s.ref);
    for (const ref of [...refs, refTo('hazard', 99)]) {
      const state = await withClock(at, () => rs.reviewStateOf(body, ref));
      const liveOne = live.find((s) => s.ref.kind === ref.kind && s.ref.id === ref.id) ?? null;
      assert.deepEqual(state, { ref, schedule: liveOne, overdue: liveOne !== null && liveOne.nextDueAest < today, asAtAest: today }, `round ${round}: reviewStateOf ${ref.kind} ${ref.id}`);
      const listed = list.find((x) => x.ref.kind === ref.kind && x.ref.id === ref.id);
      if (listed) assert.deepEqual(state, listed, `round ${round}: a listed state is the state reviewStateOf gives`);
      else assert.equal(state.overdue, false, `round ${round}: an unlisted ref is not overdue`);
      if (liveOne && liveOne.nextDueAest === today) assert.equal(state.overdue, false, `round ${round}: on its due date a record is on time`);
    }
  }
});

test('C-006 and C-008: over random schedules and completion dates, the new due date is the old due date plus the tempo by DEC-019, whatever the clock and whatever the last reviewed date held; the last reviewed date is today (SL-06 criteria 2 and 3)', async () => {
  const random = prng(SEED ^ 0x1);
  const by = newProfile('Reviewer');
  for (let round = 0; round < 200; round++) {
    const ref = refTo(oneOf(random, FOUR_KINDS), 1 + pick(random, 9));
    const tempo = 1 + pick(random, 60);
    const due = randomDate(random);
    const s0 = scheduleRow(orderedUuid(round), by, ref, tempo, due, { lastReviewedAest: random() < 0.5 ? null : randomDate(random) });
    const body = deepFreeze(bodyOf([s0]));
    const expected = plusMonths(due, tempo);

    const d1 = randomDate(random);
    const d2 = randomDate(random);
    const { schedule: a } = await withClock(on(d1), () => rs.completeReview(body, actOf(by), ref));
    const { schedule: b } = await withClock(on(d2), () => rs.completeReview(body, actOf(by), ref));
    assert.equal(a.nextDueAest, expected, `round ${round}: ${due} plus ${tempo} months, completed ${d1}`);
    assert.equal(b.nextDueAest, expected, `round ${round}: the same due date completed on ${d2}`);
    assert.equal(a.lastReviewedAest, d1);
    assert.equal(b.lastReviewedAest, d2);

    const altered = bodyOf([{ ...s0, lastReviewedAest: randomDate(random) }]);
    assert.equal((await rs.getSchedule(altered, ref))?.nextDueAest, due, `round ${round}: a last reviewed date changed by other means leaves the due date read back unmoved`);
    const { schedule: c } = await withClock(on(d1), () => rs.completeReview(altered, actOf(by), ref));
    assert.equal(c.nextDueAest, expected, `round ${round}: and leaves the next due date completeReview gives unmoved`);
  }
});

test('C-001, C-002, C-005, C-007, C-012, C-013: over random sequences of setSchedule and completeReview, each accepted act writes one entry and changes one schedule; a record never has two schedules; tempos are stored as given; the last reviewed date moves only on completeReview; inputs are never modified; the body survives JSON', async () => {
  const random = prng(SEED ^ 0x2);
  const people = [newProfile('Alice'), newProfile('Bob')];
  for (let run = 0; run < 25; run++) {
    const foreign = foreignCollections(random);
    let body = deepFreeze(bodyOf([], foreign));
    /** @type {Map<string, { tempo: number, due: string, last: string | null, id: string }>} */
    const model = new Map();
    for (let step = 0; step < 30; step++) {
      const ref = refTo(oneOf(random, FOUR_KINDS), 1 + pick(random, 4));
      const key = `${ref.kind}/${ref.id}`;
      const who = oneOf(random, people);
      const act = actOf(who, random() < 0.5 ? null : platformNo(1 + pick(random, 3)), random() < 0.5 ? [] : [platformNo(1 + pick(random, 3))]);
      const today = randomDate(random);
      const at = on(today, '09:15:00');
      const before = snapshot(body);
      const known = model.get(key);

      if (random() < 0.6 || !known) {
        const tempo = known && random() < 0.3 ? known.tempo : 1 + pick(random, 120);
        const due = known && random() < 0.3 ? known.due : randomDate(random);
        if (known && known.tempo === tempo && known.due === due) {
          await assert.rejects(withClock(at, () => rs.setSchedule(body, act, { ref, tempoMonths: tempo, nextDueAest: due })), rs.NoChangeError, `run ${run} step ${step}: unchanged values are refused`);
          assert.deepEqual(body, before);
          continue;
        }
        const { body: next, schedule: s } = await withClock(at, () => rs.setSchedule(body, act, { ref, tempoMonths: tempo, nextDueAest: due }));
        assert.equal(s.tempoMonths, tempo, `run ${run} step ${step}: the tempo is stored as given`);
        assert.equal(s.nextDueAest, due, `run ${run} step ${step}: the due date is stored as given`);
        assert.equal(s.lastReviewedAest, known ? known.last : null, `run ${run} step ${step}: setSchedule keeps the last reviewed date`);
        if (known) assert.equal(s.id, known.id, `run ${run} step ${step}: the same record keeps its schedule id`);
        model.set(key, { tempo, due, last: known ? known.last : null, id: s.id });
        await checkStep(before, body, next, s, `run ${run} step ${step} setSchedule`);
        body = deepFreeze(next);
      } else {
        const { body: next, schedule: s } = await withClock(at, () => rs.completeReview(body, act, ref));
        const nextDue = plusMonths(known.due, known.tempo);
        assert.equal(s.lastReviewedAest, today, `run ${run} step ${step}: completeReview stamps today`);
        assert.equal(s.nextDueAest, nextDue, `run ${run} step ${step}: and advances one tempo`);
        model.set(key, { ...known, due: nextDue, last: today });
        await checkStep(before, body, next, s, `run ${run} step ${step} completeReview`);
        body = deepFreeze(next);
      }
    }
    const listed = [...(await rs.listSchedules(body))];
    assert.equal(listed.length, model.size, `run ${run}: one schedule per record scheduled`);
    for (const s of listed) {
      const m = model.get(`${s.ref.kind}/${s.ref.id}`);
      assert.deepEqual([s.id, s.tempoMonths, s.nextDueAest, s.lastReviewedAest], [m?.id, m?.tempo, m?.due, m?.last], `run ${run}: ${s.ref.kind} ${s.ref.id} reads back as the acts left it`);
    }
    assert.deepEqual([...(await rs.listSchedules(jsonRoundTrip(body)))], listed, `run ${run}: the body survives a save and a load`);
    for (const [name, value] of Object.entries(foreign)) assert.deepEqual(/** @type {any} */ (body.collections)[name], value, `run ${run}: the ${name} collection is carried through untouched`);
  }

  /**
   * @param {DataBody} snap what the input was
   * @param {DataBody} input
   * @param {DataBody} output
   * @param {ReviewSchedule} s
   * @param {string} what
   */
  async function checkStep(snap, input, output, s, what) {
    assert.deepEqual(input, snap, `${what}: the input body is unchanged`);
    assert.deepEqual(differences(input, output), [`${KIND}/${s.id}`], `${what}: only the one schedule changed`);
    assert.deepEqual(schedulesIn(output)[s.id], s, `${what}: the schedule returned is the one stored`);
    assert.equal((await addedEntries(input, output, what)).length, 1, `${what}: exactly one entry was written`);
    const refs = Object.values(schedulesIn(output)).map((x) => `${x.ref.kind}/${x.ref.id}`);
    assert.equal(new Set(refs).size, refs.length, `${what}: no record has two schedules`);
    assert.deepEqual(jsonRoundTrip(output), output, `${what}: every field is a string, a whole number, or null`);
  }
});

test('reads are harmless and deterministic: on the same body at the same clock every read gives deep-equal results and the body is unchanged (section 5, idempotency; C-002)', async () => {
  const random = prng(SEED ^ 0x3);
  for (let round = 0; round < 60; round++) {
    const body = deepFreeze(randomBody(random));
    const before = snapshot(body);
    const at = on(randomDate(random));
    const ref = refTo(oneOf(random, FOUR_KINDS), 1 + pick(random, 6));
    const once = await withClock(at, async () => [await rs.getSchedule(body, ref), await rs.listSchedules(body), await rs.reviewStateOf(body, ref), await rs.listOverdue(body)]);
    const twice = await withClock(at, async () => [await rs.getSchedule(body, ref), await rs.listSchedules(body), await rs.reviewStateOf(body, ref), await rs.listOverdue(body)]);
    assert.deepEqual(twice, once, `round ${round}`);
    assert.deepEqual(body, before, `round ${round}: the body is unchanged`);
    assert.deepEqual([...(await rs.listSchedules(body))], schedulesModel(body), `round ${round}: listSchedules is every live schedule by due date then id`);
  }
});
