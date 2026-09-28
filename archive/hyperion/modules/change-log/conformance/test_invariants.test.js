/**
 * change-log conformance: invariants (CORE-CON-002). Property-based over seeded random acts
 * on records of every kind, acknowledgements, and reads (CORE-TST-001: the seed is fixed and
 * recorded in harness.js). Each test states the model it checks against and the clauses of
 * modules/change-log/CONTRACT.md the model comes from. Written from the contract before any
 * implementation (P8).
 *
 * The null double must fail this file (CORE-TST-002, rung 1): fixed data cannot hold what
 * was recorded, derive each item from its pair, or keep a queue per platform.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as log from '../contract.js';
import {
  AlreadyAcknowledgedError, MissingProfileError, PlatformNotAwaitingError, UnchangedRecordError,
} from '../contract.js';
import {
  EARLIER, FIELD_NAMES, FIELD_VALUES, HELD, LOG, LOGGABLE_KINDS, SEED, act, addedKeys, awaitingModel, changeLogEntryId, deepFreeze,
  edited, entriesModel, expectedEntry, foreignCollections, historyModel, jsonRoundTrip, logEntries, newPlatform, newProfile, orderedUuid,
  pick, plusSeconds, prng, refOf, schema, snapshot, storedRecord, withBrowserStorageSpies, withClock, withoutLog,
} from './harness.js';

/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */
/** @typedef {import('../../../baseline/schema.js').StoredRecord} StoredRecord */
/** @typedef {import('../../../baseline/types.js').PlatformId} PlatformId */
/** @typedef {import('../contract.js').ChangeLogEntry} ChangeLogEntry */

/**
 * @template T
 * @param {() => number} random
 * @param {readonly T[]} list
 * @returns {T}
 */
function choose(random, list) {
  return list[pick(random, list.length)];
}

/**
 * A random value for a field, sometimes a fresh string so an edit is sure to differ.
 * @param {() => number} random
 * @param {number} n
 * @returns {unknown}
 */
function fieldValue(random, n) {
  return random() < 0.3 ? `value ${n}` : structuredClone(choose(random, FIELD_VALUES));
}

/**
 * A new record of a random loggable kind with a few random fields.
 * @param {() => number} random
 * @param {import('../../../baseline/types.js').ActiveProfile} by
 * @param {number} n
 * @returns {StoredRecord}
 */
function randomRecord(random, by, n) {
  const kind = choose(random, LOGGABLE_KINDS);
  /** @type {Record<string, unknown>} */
  const fields = {};
  for (let i = 0, count = 1 + pick(random, 4); i < count; i += 1) fields[choose(random, FIELD_NAMES)] = fieldValue(random, n * 10 + i);
  return storedRecord(kind, kind === 'hazard' ? `H-${String(n).padStart(4, '0')}` : orderedUuid(n), by, fields, { at: plusSeconds(EARLIER, n) });
}

/**
 * The record after a random act on it, sure to differ from `record`: a field changed, added,
 * or removed, and sometimes a status transition.
 * @param {() => number} random
 * @param {StoredRecord} record
 * @param {import('../../../baseline/types.js').ActiveProfile} by
 * @param {import('../../../baseline/types.js').TimestampAest} at
 * @param {number} n
 * @returns {StoredRecord}
 */
function randomEdit(random, record, by, at, n) {
  const r = random();
  /** @type {Record<string, unknown>} */
  const changes = { [choose(random, FIELD_NAMES)]: `edit ${n}` };
  if (r < 0.2) changes.status = 'deleted';
  else if (r < 0.35) changes.status = 'retired';
  else if (r < 0.42) changes.status = 'live';
  const next = /** @type {Record<string, unknown>} */ (edited(record, changes, by, at));
  if (random() < 0.2) {
    const removable = Object.keys(next).filter((k) => FIELD_NAMES.includes(k) && !(k in changes));
    if (removable.length > 0) delete next[choose(random, removable)];
  }
  return /** @type {StoredRecord} */ (next);
}

test('model check: a random sequence of acts, acknowledgements, and reads on bodies with foreign collections matches the model of entries, histories, and queues; entries only ever append, and every input body is left as it was (C-001 to C-006, C-009 to C-011, C-013)', async () => {
  const random = prng(SEED);
  const profiles = [newProfile('Alice'), newProfile('Bob'), newProfile('Carol')];
  const counts = { acts: 0, items: 0, deleted: 0, retired: 0, created: 0, edited: 0, acks: 0, notAwaiting: 0, already: 0, unchanged: 0, missing: 0, reads: 0 };

  for (let run = 0; run < 8; run += 1) {
    const platforms = /** @type {PlatformId[]} */ ([newPlatform(), newPlatform(), newPlatform(), newPlatform()]);
    let body = /** @type {DataBody} */ ({ collections: /** @type {any} */ (foreignCollections(random)), sequences: { hazard: 1 + pick(random, 9) } });
    const foreign = withoutLog(body);
    /** @type {Map<string, StoredRecord>} what each record is now, by kind and id */
    const records = new Map();
    /** @type {Map<string, ChangeLogEntry>} the model: every entry recorded, by id */
    const model = new Map();
    let clock = plusSeconds(HELD, run * 100000);
    let n = run * 1000;

    for (let step = 0; step < 45; step += 1) {
      const at = `run ${run} step ${step}`;
      const p = choose(random, profiles);
      const advanced = random() < 0.7; // otherwise the same second as the last call
      if (advanced) clock = plusSeconds(clock, 1 + pick(random, 90));
      n += 1;
      const input = body;
      const before = snapshot(input);
      const historiesBefore = new Map([...records.keys()].map((k) => [k, historyModel(input, /** @type {any} */ (JSON.parse(k)))]));
      const r = random();

      if (r < 0.45) {
        /** @type {import('../contract.js').RecordBeforeAfter[]} */
        const pairs = [];
        const used = new Set();
        for (let i = 0, count = 1 + pick(random, 3); i < count; i += 1) {
          const known = [...records.keys()].filter((k) => !used.has(k));
          if (known.length > 0 && random() < 0.65) {
            const key = choose(random, known);
            const current = /** @type {StoredRecord} */ (records.get(key));
            pairs.push({ before: current, after: randomEdit(random, current, p, clock, n * 10 + i) });
            used.add(key);
          } else {
            const created = randomRecord(random, p, n * 10 + i);
            pairs.push({ before: null, after: created });
            used.add(JSON.stringify(refOf(created)));
          }
        }
        const madeFor = random() < 0.3 ? null : choose(random, platforms);
        const affected = [];
        for (let i = 0, count = pick(random, 5); i < count; i += 1) affected.push(choose(random, platforms));
        if (madeFor !== null && random() < 0.6) affected.push(madeFor);
        const change = act(pairs, madeFor, affected);

        const { body: b, entry: e } = await withClock(clock, () => log.recordChange(body, p, change));
        assert.doesNotThrow(() => changeLogEntryId.parse(e.id), `${at}: a ChangeLogEntryId`);
        assert.ok(!model.has(e.id), `${at}: a fresh id`);
        assert.deepEqual(e, expectedEntry(e.id, p, clock, change), `${at}: the entry as C-001, C-002, C-004, C-005 describe it`);
        assert.deepEqual(addedKeys(body, b), [e.id], `${at}: exactly one entry added`);
        assert.deepEqual(logEntries(b)[e.id], e, `${at}: stored under its id`);
        model.set(e.id, e);
        for (const pair of pairs) records.set(JSON.stringify(refOf(pair.after)), pair.after);
        counts.acts += 1;
        counts.items += e.items.length;
        for (const item of e.items) counts[item.action] += 1;
        body = b;
      } else if (r < 0.52 && records.size > 0) {
        const current = /** @type {StoredRecord} */ (records.get(choose(random, [...records.keys()])));
        const e = await withClock(clock, () => log.recordChange(body, p, act([{ before: current, after: structuredClone(current) }], null, platforms))).then(() => null, (err) => err);
        assert.ok(e instanceof UnchangedRecordError, `${at}: an unchanged pair is refused`);
        counts.unchanged += 1;
      } else if (r < 0.56) {
        const e = await withClock(clock, () => log.recordChange(body, /** @type {any} */ (random() < 0.5 ? null : { id: 'nobody', name: 'x' }), act([{ before: null, after: randomRecord(random, p, n) }], null, []))).then(() => null, (err) => err);
        assert.ok(e instanceof MissingProfileError, `${at}: an act with no usable profile is refused`);
        counts.missing += 1;
      } else if (r < 0.78) {
        const platform = choose(random, platforms);
        const awaiting = awaitingModel(body, platform);
        const changes = [...model.values()].filter((x) => x.entryKind === 'record-change');
        if (awaiting.length > 0 && random() < 0.75) {
          const target = choose(random, awaiting);
          const listedBefore = new Map(platforms.map((q) => [q, awaitingModel(body, q)]));
          const { body: b, entry: a } = await withClock(clock, () => log.acknowledge(body, p, { entryId: target.id, platformId: platform }));
          assert.deepEqual(a, {
            id: a.id, kind: LOG, status: 'live', createdBy: p.id, createdAtAest: clock, updatedBy: p.id, updatedAtAest: clock,
            entryKind: 'acknowledgement', entryId: target.id, platformId: platform,
          }, `${at}: the acknowledgement as C-011 describes it`);
          assert.ok(!model.has(a.id), `${at}: a fresh id`);
          assert.deepEqual(addedKeys(body, b), [a.id], `${at}: exactly one entry added`);
          model.set(a.id, a);
          body = b;
          for (const q of platforms) {
            const expected = q === platform ? /** @type {any[]} */ (listedBefore.get(q)).filter((x) => x.id !== target.id) : listedBefore.get(q);
            assert.deepEqual([...(await log.listAwaiting(body, q))], expected, `${at}: acknowledging for one platform clears it there and nowhere else`);
          }
          counts.acks += 1;
          // The chance branch below reaches an already-acknowledged pair only when a random earlier entry happens to
          // reach this platform and be cleared for it, which the recorded seed never did (already: 0). So every
          // acknowledgement is deliberately repeated here, which C-011 and section 4 promise is refused, carrying
          // the acknowledgement's id and leaving the body as it was; the seed stays (CORE-TST-001). No randomness is
          // drawn, so the rest of the recorded sequence is unchanged.
          const acknowledged = snapshot(body);
          const again = await withClock(clock, () => log.acknowledge(body, p, { entryId: target.id, platformId: platform })).then(() => null, (err) => err);
          assert.ok(again instanceof AlreadyAcknowledgedError, `${at}: acknowledging the same entry for the same platform twice is refused, got ${String(again)}`);
          assert.equal(again.acknowledgementId, a.id, `${at}: carrying the acknowledgement's id`);
          assert.deepEqual(body, acknowledged, `${at}: the body is unchanged by the refusal`);
          counts.already += 1;
        } else if (changes.length > 0) {
          const target = /** @type {import('../contract.js').RecordChangeEntry} */ (choose(random, changes));
          const reaches = target.affectedPlatformIds.includes(platform) && target.madeForPlatformId !== platform;
          const e = await withClock(clock, () => log.acknowledge(body, p, { entryId: target.id, platformId: platform })).then((ok) => ok, (err) => err);
          if (!reaches) {
            assert.ok(e instanceof PlatformNotAwaitingError, `${at}: a platform the act did not await is refused`);
            counts.notAwaiting += 1;
          } else if (!awaitingModel(body, platform).some((x) => x.id === target.id)) {
            assert.ok(e instanceof AlreadyAcknowledgedError, `${at}: a second acknowledgement is refused`);
            counts.already += 1;
          } else {
            assert.ok(!(e instanceof Error), `${at}: an awaited change is acknowledged`);
            model.set(e.entry.id, e.entry);
            body = e.body;
            counts.acks += 1;
          }
        }
      } else {
        counts.reads += 1;
        assert.deepEqual([...(await log.listEntries(body))], entriesModel(body), `${at}: listEntries`);
        for (const q of platforms) assert.deepEqual([...(await log.listAwaiting(body, q))], awaitingModel(body, q), `${at}: listAwaiting`);
        if (records.size > 0) {
          const ref = JSON.parse(choose(random, [...records.keys()]));
          assert.deepEqual([...(await log.listHistory(body, ref))], historyModel(body, ref), `${at}: listHistory of a record`);
        }
        if (model.size > 0) {
          const ref = { kind: LOG, id: choose(random, [...model.keys()]) };
          assert.deepEqual([...(await log.listHistory(body, /** @type {any} */ (ref)))], historyModel(body, /** @type {any} */ (ref)), `${at}: listHistory of an entry`);
        }
      }

      assert.deepEqual(input, before, `${at}: the body passed in is deep-equal to what it was`);
      assert.deepEqual(withoutLog(body), foreign, `${at}: nothing but the change-log collection ever changes`);
      assert.deepEqual(new Map(Object.entries(logEntries(body))), model, `${at}: the collection is exactly the entries recorded, each unaltered`);
      for (const entry of model.values()) assert.equal(entry.status, 'live', `${at}: every entry stays live`);
      // Only when this call's time is later than every earlier entry's: in the same second C-009 orders by id, which a
      // fresh random id may put before an earlier entry, and C-006's prefix sentence does not say what happens then.
      for (const [key, earlier] of advanced ? historiesBefore : []) {
        assert.deepEqual(historyModel(body, JSON.parse(key)).slice(0, earlier.length), earlier, `${at}: a history only grows at its end in time order`);
      }
      assert.deepEqual(jsonRoundTrip(body), body, `${at}: the body survives JSON serialisation and parsing`);
    }

    assert.deepEqual([...(await log.listEntries(body))], entriesModel(body), `run ${run} ends with the model`);
    assert.deepEqual([...(await log.listEntries(jsonRoundTrip(body)))], entriesModel(body), `run ${run}: and reads the same after a JSON round trip`);
  }
  assert.ok(counts.acts >= 120 && counts.deleted >= 20 && counts.retired >= 15 && counts.created >= 80 && counts.edited >= 40
    && counts.acks >= 25 && counts.notAwaiting >= 5 && counts.already >= 3 && counts.unchanged >= 5 && counts.missing >= 5 && counts.reads >= 30,
  `the seed produced ${JSON.stringify(counts)}; it must exercise each (change it on purpose if this fails)`);
});

test('the queue is keyed by platform alone: any change to other collections, a platform\'s owner included, leaves every queue as it was, and an acknowledgement made before the change still clears (C-012; SL-05 criterion 5)', async () => {
  const random = prng(SEED + 1);
  const profiles = [newProfile('Outgoing'), newProfile('Incoming'), newProfile('Editor')];
  for (let run = 0; run < 10; run += 1) {
    const platforms = /** @type {PlatformId[]} */ ([newPlatform(), newPlatform(), newPlatform()]);
    let body = schema.emptyDataBody();
    let clock = plusSeconds(HELD, run * 1000);
    for (let i = 0; i < 8; i += 1) {
      clock = plusSeconds(clock, 1 + pick(random, 30));
      const h = randomRecord(random, profiles[2], run * 100 + i);
      const change = act([{ before: null, after: h }], random() < 0.5 ? null : choose(random, platforms), [choose(random, platforms), choose(random, platforms)]);
      body = (await withClock(clock, () => log.recordChange(body, profiles[2], change))).body;
      const awaiting = awaitingModel(body, platforms[0]);
      if (awaiting.length > 0 && random() < 0.4) {
        body = (await withClock(clock, () => log.acknowledge(body, profiles[0], { entryId: choose(random, awaiting).id, platformId: platforms[0] }))).body;
      }
    }
    const queues = await Promise.all(platforms.map((q) => log.listAwaiting(body, q)));

    const transferred = snapshot(body);
    /** @type {any} */ (transferred.collections).platform = Object.fromEntries(platforms.map((q, i) => [q, storedRecord('platform', q, profiles[0], { name: `P${i}`, ownerProfileId: profiles[1].id })]));
    /** @type {any} */ (transferred.collections).hazard = { 'H-0001': { anything: true } };
    const after = await Promise.all(platforms.map((q) => log.listAwaiting(transferred, q)));

    assert.deepEqual(after, queues, `run ${run}: every queue as it was, in the same order`);
    for (const entry of Object.values(logEntries(body))) {
      assert.ok(!JSON.stringify(entry).includes('"ownerProfileId"'), `run ${run}: no entry this module wrote names an owner field`);
    }
  }
});

test('the body is a value: every operation given a deeply frozen body and change neither throws for it nor changes it, resolved or rejected (C-003)', async () => {
  const random = prng(SEED + 2);
  const alice = newProfile('Alice');
  for (let run = 0; run < 10; run += 1) {
    const platforms = /** @type {PlatformId[]} */ ([newPlatform(), newPlatform()]);
    let body = /** @type {DataBody} */ ({ collections: /** @type {any} */ (foreignCollections(random)), sequences: { hazard: 1 } });
    const h = randomRecord(random, alice, run + 1);
    const recorded = await withClock(HELD, () => log.recordChange(body, alice, act([{ before: null, after: h }], null, platforms)));
    body = deepFreeze(recorded.body);
    const before = snapshot(body);
    const edit = deepFreeze(act([{ before: h, after: randomEdit(random, h, alice, HELD, run) }], platforms[0], platforms));

    /** @type {(() => Promise<unknown>)[]} */
    const calls = [
      () => withClock(HELD, () => log.recordChange(body, alice, edit)),
      () => withClock(HELD, () => log.recordChange(body, alice, deepFreeze(act([{ before: h, after: h }], null, [])))),
      () => withClock(HELD, () => log.acknowledge(body, alice, { entryId: recorded.entry.id, platformId: platforms[1] })),
      () => withClock(HELD, () => log.acknowledge(body, alice, { entryId: recorded.entry.id, platformId: newPlatform() })),
      () => log.listEntries(body),
      () => log.listHistory(body, refOf(h)),
      () => log.listAwaiting(body, platforms[0]),
    ];
    for (const [i, call] of calls.entries()) {
      const outcome = await call().then((v) => v, (e) => e);
      assert.ok(!(outcome instanceof TypeError), `run ${run} call ${i}: no TypeError from writing to a frozen input, got ${String(outcome)}`);
      assert.deepEqual(body, before, `run ${run} call ${i}: body unchanged`);
    }
  }
});

test('reads are harmless and deterministic: on the same body, or a deep-equal copy, or one after a JSON round trip, and whatever the clock, every read resolves with deep-equal results (section 5 idempotency, C-003, C-007)', async () => {
  const random = prng(SEED + 3);
  const alice = newProfile('Alice');
  for (let run = 0; run < 6; run += 1) {
    const platforms = /** @type {PlatformId[]} */ ([newPlatform(), newPlatform(), newPlatform()]);
    let body = schema.emptyDataBody();
    /** @type {StoredRecord[]} */
    const made = [];
    for (let i = 0; i < 10; i += 1) {
      const rec = randomRecord(random, alice, run * 100 + i);
      made.push(rec);
      body = (await withClock(plusSeconds(HELD, pick(random, 5)), () => log.recordChange(body, alice, act([{ before: null, after: rec }], choose(random, platforms), [choose(random, platforms), choose(random, platforms)])))).body;
    }
    const read = async (/** @type {DataBody} */ b) => ({
      entries: await log.listEntries(b),
      histories: await Promise.all(made.map((m) => log.listHistory(b, refOf(m)))),
      queues: await Promise.all(platforms.map((q) => log.listAwaiting(b, q))),
    });
    const first = await read(body);
    assert.deepEqual(await read(body), first, `run ${run}: again on the same body`);
    assert.deepEqual(await read(snapshot(body)), first, `run ${run}: on a deep-equal copy`);
    assert.deepEqual(await read(jsonRoundTrip(body)), first, `run ${run}: after a JSON round trip`);
    assert.deepEqual(await withClock(plusSeconds(HELD, 86400 * 400), () => read(body)), first, `run ${run}: whatever the clock says: no passage of time removes a change`);
  }
});

test('confinement: no operation reads or writes the browser\'s storage (C-007)', async () => {
  const random = prng(SEED + 4);
  const alice = newProfile('Alice');
  const { uses } = await withBrowserStorageSpies(async () => {
    const platforms = /** @type {PlatformId[]} */ ([newPlatform(), newPlatform()]);
    let body = schema.emptyDataBody();
    for (let i = 0; i < 6; i += 1) {
      const rec = randomRecord(random, alice, i + 1);
      const r = await withClock(plusSeconds(HELD, i), () => log.recordChange(body, alice, act([{ before: null, after: rec }], platforms[0], platforms)));
      body = r.body;
      await withClock(plusSeconds(HELD, i), () => log.acknowledge(body, alice, { entryId: r.entry.id, platformId: platforms[1] })).then((a) => { body = a.body; });
      await log.listEntries(body);
      await log.listHistory(body, refOf(rec));
      await log.listAwaiting(body, platforms[1]);
      await withClock(HELD, () => log.recordChange(body, alice, act([], null, []))).catch(() => null);
    }
  });
  assert.deepEqual(uses, [], 'localStorage and sessionStorage untouched');
});
