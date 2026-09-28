/**
 * change-log conformance: errors (CORE-CON-002). Every condition in section 4 of
 * modules/change-log/CONTRACT.md, signalled as the named rejected promise carrying what the
 * contract says it names, with the body passed in deep-equal to what it was afterwards, and
 * section 4's precedence when two conditions hold at once. Written from the contract before
 * any implementation (P8).
 *
 * The null double must fail this file (CORE-TST-002, rung 1): an implementation that
 * enforces nothing resolves where every test below expects a rejection.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as log from '../contract.js';
import {
  AlreadyAcknowledgedError, EmptyChangeError, InvalidPlatformError, InvalidRecordError, MalformedEntryError, MismatchedRecordError,
  MissingProfileError, NotAcknowledgeableError, PlatformNotAwaitingError, SelfLoggingError, UnchangedRecordError, UnknownEntryError,
} from '../contract.js';
import {
  EARLIER, HELD, LOG, ackRow, act, bodyOf, changeRow, edited, newPlatform, newProfile, orderedUuid, plusSeconds, refOf, rejectionOf, schema,
  snapshot, storedRecord, withClock,
} from './harness.js';

const alice = newProfile('Alice');
const hazard = storedRecord('hazard', 'H-0001', alice, { title: 'loss of control' });
const hazardEdited = edited(hazard, { title: 'loss of control on approach' }, alice, HELD);
const goodPair = { before: hazard, after: hazardEdited };

/** Profiles section 4 calls missing: absent, or an id that is not a user profile id. */
const MISSING_PROFILES = /** @type {unknown[]} */ ([undefined, null, {}, { name: 'no id' }, { id: 'alice', name: 'x' }, { id: '', name: 'x' }, { id: 42, name: 'x' }, { id: 'H-0001', name: 'a hazard id' }]);

/**
 * A body with one record-change entry reaching `p1` and `p2`, made for `p0`, and an
 * acknowledgement of it for `p1`.
 */
function queueFixture() {
  const [p0, p1, p2, p3] = [newPlatform(), newPlatform(), newPlatform(), newPlatform()];
  const change = changeRow(orderedUuid(1), alice, EARLIER, { madeFor: p0, affected: [p0, p1, p2] });
  const ack = ackRow(orderedUuid(2), alice, plusSeconds(EARLIER, 1), change.id, p1);
  return { p0, p1, p2, p3, change, ack, body: bodyOf([change, ack]) };
}

// ------------------------------------------------------------------ recordChange

test('recordChange with no profile, or one whose id is not a user profile id, rejects with MissingProfileError; body unchanged (section 4)', async () => {
  const body = bodyOf([changeRow(orderedUuid(1), alice, EARLIER)]);
  const before = snapshot(body);
  for (const profile of MISSING_PROFILES) {
    const e = await rejectionOf(() => withClock(HELD, () => log.recordChange(body, /** @type {any} */ (profile), act([goodPair], null, []))), `profile ${JSON.stringify(profile)}`);
    assert.ok(e instanceof MissingProfileError, `profile ${JSON.stringify(profile)} rejects with MissingProfileError, got ${String(e)}`);
  }
  assert.deepEqual(body, before, 'the body is unchanged');
});

test('recordChange with no records rejects with EmptyChangeError; body unchanged (section 4, C-001)', async () => {
  for (const body of [schema.emptyDataBody(), bodyOf([changeRow(orderedUuid(1), alice, EARLIER)])]) {
    const before = snapshot(body);
    const e = await rejectionOf(() => withClock(HELD, () => log.recordChange(body, alice, act([], null, [newPlatform()]))));
    assert.ok(e instanceof EmptyChangeError, `rejects with EmptyChangeError, got ${String(e)}`);
    assert.deepEqual(body, before, 'the body is unchanged: no collection created, no entry added');
  }
});

/**
 * Ways section 4 says a `before` or an `after` is not a `StoredRecord`, each a function of a
 * good record: a non-object, an id that is not a string, a kind outside RECORD_KINDS, a status
 * that is not a RecordStatus.
 * @type {[string, (r: Record<string, unknown>) => unknown][]}
 */
const NOT_STORED_RECORDS = [
  ['null', () => null],
  ['a string', () => 'H-0001'],
  ['an array', (r) => [r]],
  ['its id is a number', (r) => ({ ...r, id: 1 })],
  ['its id is missing', (r) => { const { id: _i, ...rest } = r; return rest; }],
  ['its id is null', (r) => ({ ...r, id: null })],
  ['its kind is outside RECORD_KINDS', (r) => ({ ...r, kind: 'aircraft' })],
  ['its kind is missing', (r) => { const { kind: _k, ...rest } = r; return rest; }],
  ['its status is not a RecordStatus', (r) => ({ ...r, status: 'archived' })],
  ['its status is missing', (r) => { const { status: _s, ...rest } = r; return rest; }],
];

test('recordChange with an after, or a non-null before, that is not a StoredRecord rejects with InvalidRecordError naming its position in records; body unchanged (section 4)', async () => {
  const body = schema.emptyDataBody();
  const before = snapshot(body);
  const control = storedRecord('control', orderedUuid(7), alice, { title: 'crew brief' });
  for (const [why, make] of NOT_STORED_RECORDS) {
    const badAfter = make(/** @type {any} */ (hazardEdited));
    const e1 = await rejectionOf(() => withClock(HELD, () => log.recordChange(body, alice, act([{ before: null, after: control }, { before: hazard, after: /** @type {any} */ (badAfter) }], null, []))), `after ${why}`);
    assert.ok(e1 instanceof InvalidRecordError, `an after where ${why} rejects with InvalidRecordError, got ${String(e1)}`);
    assert.equal(e1.position, 1, `an after where ${why}: names position 1`);

    // A null `before` is not an invalid record: section 4 refuses only "a `before` that is not null", and C-005
    // makes the pair a creation. The `after` half above still covers null (and e3 below covers it alone).
    if (why === 'null') continue;
    const badBefore = make(/** @type {any} */ (hazard));
    const e2 = await rejectionOf(() => withClock(HELD, () => log.recordChange(body, alice, act([{ before: /** @type {any} */ (badBefore), after: hazardEdited }], null, []))), `before ${why}`);
    assert.ok(e2 instanceof InvalidRecordError, `a before where ${why} rejects with InvalidRecordError, got ${String(e2)}`);
    assert.equal(e2.position, 0, `a before where ${why}: names position 0`);
  }
  const e3 = await rejectionOf(() => withClock(HELD, () => log.recordChange(body, alice, act([{ before: null, after: /** @type {any} */ (null) }], null, []))), 'a null after');
  assert.ok(e3 instanceof InvalidRecordError, 'after is never null: a deletion keeps the row');
  assert.equal(e3.position, 0);
  assert.deepEqual(body, before, 'the body is unchanged');
});

test('recordChange of a record whose kind is change-log-entry rejects with SelfLoggingError; body unchanged (section 4, C-013)', async () => {
  const entry = /** @type {any} */ (changeRow(orderedUuid(3), alice, EARLIER));
  const body = bodyOf([entry]);
  const before = snapshot(body);
  const cases = [
    ['a created entry', { before: null, after: entry }],
    ['an edited entry', { before: entry, after: { ...entry, status: 'deleted', updatedAtAest: HELD } }],
  ];
  for (const [why, pair] of cases) {
    const e = await rejectionOf(() => withClock(HELD, () => log.recordChange(body, alice, act([goodPair, /** @type {any} */ (pair)], null, []))), String(why));
    assert.ok(e instanceof SelfLoggingError, `${why} rejects with SelfLoggingError, got ${String(e)}`);
  }
  assert.deepEqual(body, before, 'the body is unchanged');
});

test('recordChange of a before whose id or kind differs from its after rejects with MismatchedRecordError naming both refs; body unchanged (section 4)', async () => {
  const body = schema.emptyDataBody();
  const before = snapshot(body);
  const otherHazard = storedRecord('hazard', 'H-0002', alice, { title: 'loss of control on approach' });
  const sameIdOtherKind = storedRecord('control', 'H-0001', alice, { title: 'loss of control on approach' });
  for (const after of [otherHazard, sameIdOtherKind]) {
    const e = await rejectionOf(() => withClock(HELD, () => log.recordChange(body, alice, act([{ before: hazard, after }], null, []))), `hazard paired with ${after.kind} ${after.id}`);
    assert.ok(e instanceof MismatchedRecordError, `rejects with MismatchedRecordError, got ${String(e)}`);
    assert.deepEqual(e.before, refOf(hazard), 'naming the before\'s ref');
    assert.deepEqual(e.after, refOf(after), 'and the after\'s');
  }
  assert.deepEqual(body, before);
});

test('recordChange of a before deep-equal to its after rejects with UnchangedRecordError naming the ref, including when only key order differs; body unchanged (section 4, C-002)', async () => {
  const body = schema.emptyDataBody();
  const before = snapshot(body);
  const reordered = /** @type {any} */ (Object.fromEntries(Object.entries(hazard).reverse()));
  for (const [why, after] of [['the same object', hazard], ['a copy', structuredClone(hazard)], ['a copy with its keys in another order', reordered]]) {
    const e = await rejectionOf(() => withClock(HELD, () => log.recordChange(body, alice, act([goodPair, { before: hazard, after: /** @type {any} */ (after) }], null, []))), String(why));
    assert.ok(e instanceof UnchangedRecordError, `${why}: rejects with UnchangedRecordError, got ${String(e)}`);
    assert.deepEqual(e.ref, refOf(hazard), `${why}: naming the ref`);
  }
  assert.deepEqual(body, before);
});

test('recordChange with a madeForPlatformId that is neither null nor a platform id, or an affectedPlatformIds entry that is not a platform id, rejects with InvalidPlatformError naming the value; body unchanged (section 4)', async () => {
  const body = schema.emptyDataBody();
  const before = snapshot(body);
  const good = newPlatform();
  for (const bad of ['', 'P-8', 'H-0001', 42, undefined, {}]) {
    const e1 = await rejectionOf(() => withClock(HELD, () => log.recordChange(body, alice, act([goodPair], /** @type {any} */ (bad), [good]))), `madeForPlatformId ${String(bad)}`);
    assert.ok(e1 instanceof InvalidPlatformError, `madeForPlatformId ${JSON.stringify(bad)} rejects with InvalidPlatformError, got ${String(e1)}`);
    assert.deepEqual(e1.given, bad, 'naming the value');
    if (bad === undefined) continue;
    const e2 = await rejectionOf(() => withClock(HELD, () => log.recordChange(body, alice, act([goodPair], good, /** @type {any} */ ([good, bad])))), `affectedPlatformIds holding ${String(bad)}`);
    assert.ok(e2 instanceof InvalidPlatformError, `affectedPlatformIds holding ${JSON.stringify(bad)} rejects with InvalidPlatformError, got ${String(e2)}`);
    assert.deepEqual(e2.given, bad, 'naming the value');
  }
  const e3 = await rejectionOf(() => withClock(HELD, () => log.recordChange(body, alice, act([goodPair], good, /** @type {any} */ ([null])))), 'a null in affectedPlatformIds');
  assert.ok(e3 instanceof InvalidPlatformError, 'null is allowed for madeForPlatformId only');
  assert.deepEqual(body, before);
});

test('recordChange signals the first applicable condition in section 4\'s order, whatever position in records each is at; body unchanged', async () => {
  const body = schema.emptyDataBody();
  const before = snapshot(body);
  const p = newPlatform();
  const mismatched = { before: hazard, after: storedRecord('hazard', 'H-0002', alice, { title: 'x' }) };
  const unchanged = { before: hazard, after: hazard };
  const invalid = { before: null, after: /** @type {any} */ ({ ...hazard, kind: 'aircraft' }) };
  const selfLog = { before: null, after: /** @type {any} */ (changeRow(orderedUuid(5), alice, EARLIER)) };

  /** @type {[string, () => Promise<unknown>, Function][]} */
  const cases = [
    ['missing profile before empty records', () => log.recordChange(body, /** @type {any} */ (null), act([], null, [])), MissingProfileError],
    ['empty records before an invalid platform', () => log.recordChange(body, alice, act([], /** @type {any} */ ('bad'), [])), EmptyChangeError],
    ['an invalid record at position 1 before a mismatched pair at 0', () => log.recordChange(body, alice, act([mismatched, invalid], p, [])), InvalidRecordError],
    ['a change-log-entry record at 1 before a mismatched pair at 0', () => log.recordChange(body, alice, act([mismatched, selfLog], p, [])), SelfLoggingError],
    ['a mismatched pair at 1 before an unchanged pair at 0', () => log.recordChange(body, alice, act([unchanged, mismatched], p, [])), MismatchedRecordError],
    ['an unchanged pair before an invalid platform', () => log.recordChange(body, alice, act([unchanged], /** @type {any} */ ('bad'), [])), UnchangedRecordError],
    ['a missing profile before an invalid record', () => log.recordChange(body, /** @type {any} */ ({}), act([invalid], null, [])), MissingProfileError],
  ];
  for (const [why, call, expected] of cases) {
    const e = await rejectionOf(() => withClock(HELD, call), why);
    assert.ok(e instanceof expected, `${why}: rejects with ${expected.name}, got ${String(e)}`);
  }
  assert.deepEqual(body, before);
});

// ------------------------------------------------------------------ acknowledge

test('acknowledge with no profile, or one whose id is not a user profile id, rejects with MissingProfileError; body unchanged and the change still awaiting (section 4)', async () => {
  const { body, change, p2 } = queueFixture();
  const before = snapshot(body);
  for (const profile of MISSING_PROFILES) {
    const e = await rejectionOf(() => withClock(HELD, () => log.acknowledge(body, /** @type {any} */ (profile), { entryId: change.id, platformId: p2 })), `profile ${JSON.stringify(profile)}`);
    assert.ok(e instanceof MissingProfileError, `profile ${JSON.stringify(profile)} rejects with MissingProfileError, got ${String(e)}`);
  }
  assert.deepEqual(body, before);
  assert.deepEqual([...(await log.listAwaiting(body, p2))], [change]);
});

test('acknowledge of an id no entry has rejects with UnknownEntryError; body unchanged (section 4)', async () => {
  const { body, p2 } = queueFixture();
  const before = snapshot(body);
  for (const id of [orderedUuid(99), 'not-an-id', '']) {
    const e = await rejectionOf(() => withClock(HELD, () => log.acknowledge(body, alice, { entryId: /** @type {any} */ (id), platformId: p2 })), `entryId ${id}`);
    assert.ok(e instanceof UnknownEntryError, `entryId ${JSON.stringify(id)} rejects with UnknownEntryError, got ${String(e)}`);
  }
  const e = await rejectionOf(() => withClock(HELD, () => log.acknowledge(schema.emptyDataBody(), alice, { entryId: /** @type {any} */ (orderedUuid(1)), platformId: p2 })), 'a body with no collection');
  assert.ok(e instanceof UnknownEntryError, 'a body with no change-log collection has no entries');
  assert.deepEqual(body, before);
});

test('acknowledge of an acknowledgement entry rejects with NotAcknowledgeableError; body unchanged (section 4)', async () => {
  const { body, ack, p1, p2 } = queueFixture();
  const before = snapshot(body);
  for (const platformId of [p1, p2]) {
    const e = await rejectionOf(() => withClock(HELD, () => log.acknowledge(body, alice, { entryId: ack.id, platformId })));
    assert.ok(e instanceof NotAcknowledgeableError, `rejects with NotAcknowledgeableError, got ${String(e)}`);
  }
  assert.deepEqual(body, before);
});

test('acknowledge for a platform not in the entry\'s affectedPlatformIds, or its madeForPlatformId, rejects with PlatformNotAwaitingError naming both ids; body unchanged (section 4, C-010)', async () => {
  const { body, change, p0, p3 } = queueFixture();
  const before = snapshot(body);
  for (const [why, platformId] of [['the platform it was made for', p0], ['a platform it does not reach', p3], ['a value that is not a platform id', 'P-8']]) {
    const e = await rejectionOf(() => withClock(HELD, () => log.acknowledge(body, alice, { entryId: change.id, platformId: /** @type {any} */ (platformId) })), why);
    assert.ok(e instanceof PlatformNotAwaitingError, `${why}: rejects with PlatformNotAwaitingError, got ${String(e)}`);
    assert.equal(e.entryId, change.id, `${why}: names the entry`);
    assert.equal(e.platformId, platformId, `${why}: names the platform`);
  }
  assert.deepEqual(body, before);
});

test('acknowledge of a change already acknowledged for that platform rejects with AlreadyAcknowledgedError carrying the acknowledgement\'s id; body unchanged (section 4, C-011)', async () => {
  const { body, change, ack, p1, p2 } = queueFixture();
  const before = snapshot(body);
  const e = await rejectionOf(() => withClock(HELD, () => log.acknowledge(body, newProfile('Bob'), { entryId: change.id, platformId: p1 })), 'the fixture\'s acknowledgement');
  assert.ok(e instanceof AlreadyAcknowledgedError, `rejects with AlreadyAcknowledgedError, got ${String(e)}`);
  assert.equal(e.acknowledgementId, ack.id);
  assert.deepEqual(body, before);

  const once = await withClock(HELD, () => log.acknowledge(body, alice, { entryId: change.id, platformId: p2 }));
  const twice = await rejectionOf(() => withClock(plusSeconds(HELD, 1), () => log.acknowledge(once.body, alice, { entryId: change.id, platformId: p2 })), 'acknowledging twice');
  assert.ok(twice instanceof AlreadyAcknowledgedError, 'acknowledging twice fails the second time');
  assert.equal(twice.acknowledgementId, once.entry.id);
});

test('acknowledge signals the first applicable condition in section 4\'s order; body unchanged', async () => {
  const { body, change, ack, p1, p3 } = queueFixture();
  const before = snapshot(body);
  /** @type {[string, () => Promise<unknown>, Function][]} */
  const cases = [
    ['missing profile before an unknown entry', () => log.acknowledge(body, /** @type {any} */ (undefined), { entryId: /** @type {any} */ (orderedUuid(99)), platformId: p3 }), MissingProfileError],
    ['an acknowledgement entry before a platform not awaiting', () => log.acknowledge(body, alice, { entryId: ack.id, platformId: p3 }), NotAcknowledgeableError],
    ['a platform not awaiting before already acknowledged: the made-for platform is never acknowledged', () => log.acknowledge(bodyOf([change, ackRow(orderedUuid(8), alice, EARLIER, change.id, /** @type {any} */ (change.madeForPlatformId))]), alice, { entryId: change.id, platformId: /** @type {any} */ (change.madeForPlatformId) }), PlatformNotAwaitingError],
    ['already acknowledged, when nothing earlier applies', () => log.acknowledge(body, alice, { entryId: change.id, platformId: p1 }), AlreadyAcknowledgedError],
  ];
  for (const [why, call, expected] of cases) {
    const e = await rejectionOf(() => withClock(HELD, call), why);
    assert.ok(e instanceof expected, `${why}: rejects with ${expected.name}, got ${String(e)}`);
  }
  assert.deepEqual(body, before);
});

// ------------------------------------------------------------------ a malformed entry (C-008)

/**
 * Every way C-008 says an entry of the collection is malformed, each a function from a good
 * record-change entry and a good acknowledgement to the bad entry and the key it sits under.
 * @type {[string, (change: Record<string, any>, ack: Record<string, any>) => { key: string, entry: unknown }][]}
 */
const MALFORMED = [
  ['its key differs from its id', (c) => ({ key: orderedUuid(50), entry: c })],
  ['its key is not an id at all', (c) => ({ key: 'first', entry: c })],
  ['its id is not a ChangeLogEntryId', (c) => ({ key: 'e-1', entry: { ...c, id: 'e-1' } })],
  ['its id is missing', (c) => { const { id: _i, ...rest } = c; return { key: c.id, entry: rest }; }],
  ['its kind is not change-log-entry', (c) => ({ key: c.id, entry: { ...c, kind: 'hazard' } })],
  ['its status is not a RecordStatus', (c) => ({ key: c.id, entry: { ...c, status: 'archived' } })],
  ['createdBy is not a user profile id', (c) => ({ key: c.id, entry: { ...c, createdBy: 'alice' } })],
  ['updatedBy is missing', (c) => { const { updatedBy: _u, ...rest } = c; return { key: c.id, entry: rest }; }],
  ['createdAtAest is not a TimestampAest (UTC)', (c) => ({ key: c.id, entry: { ...c, createdAtAest: '2026-01-05T08:00:00Z' } })],
  ['updatedAtAest is not a TimestampAest (a date)', (c) => ({ key: c.id, entry: { ...c, updatedAtAest: '2026-01-05' } })],
  ['its entryKind is outside the two', (c) => ({ key: c.id, entry: { ...c, entryKind: 'note' } })],
  ['its entryKind is missing', (c) => { const { entryKind: _k, ...rest } = c; return { key: c.id, entry: rest }; }],
  ['a record-change entry with empty items', (c) => ({ key: c.id, entry: { ...c, items: [] } })],
  ['a record-change entry with no items', (c) => { const { items: _i, ...rest } = c; return { key: c.id, entry: rest }; }],
  ['an item whose ref has a kind outside RECORD_KINDS', (c) => ({ key: c.id, entry: { ...c, items: [{ ...c.items[0], ref: { kind: 'aircraft', id: 'x' } }] } })],
  ['an item whose ref has no id', (c) => ({ key: c.id, entry: { ...c, items: [{ ...c.items[0], ref: { kind: 'hazard' } }] } })],
  ['an item whose action is outside the four', (c) => ({ key: c.id, entry: { ...c, items: [{ ...c.items[0], action: 'moved' }] } })],
  ['an item whose fields is not a list', (c) => ({ key: c.id, entry: { ...c, items: [{ ...c.items[0], fields: { title: 'a' } }] } })],
  ['an item whose fields holds something not a FieldChange', (c) => ({ key: c.id, entry: { ...c, items: [{ ...c.items[0], fields: [{ before: 'a', after: 'b' }] }] } })],
  ['a madeForPlatformId that is neither null nor a platform id', (c) => ({ key: c.id, entry: { ...c, madeForPlatformId: 'P-8' } })],
  ['a madeForPlatformId that is missing', (c) => { const { madeForPlatformId: _m, ...rest } = c; return { key: c.id, entry: rest }; }],
  ['an affectedPlatformIds that is not a list', (c) => ({ key: c.id, entry: { ...c, affectedPlatformIds: c.affectedPlatformIds[0] } })],
  ['an affectedPlatformIds holding a value that is not a platform id', (c) => ({ key: c.id, entry: { ...c, affectedPlatformIds: [...c.affectedPlatformIds, 'P-8'] } })],
  ['an acknowledgement whose entryId is not a ChangeLogEntryId', (_c, a) => ({ key: a.id, entry: { ...a, entryId: 'e-1' } })],
  ['an acknowledgement with no platformId', (_c, a) => { const { platformId: _p, ...rest } = a; return { key: a.id, entry: rest }; }],
  ['an acknowledgement whose platformId is not a platform id', (_c, a) => ({ key: a.id, entry: { ...a, platformId: 42 } })],
  ['the entry is not an object', (c) => ({ key: c.id, entry: 'an entry' })],
  ['the entry is null', (c) => ({ key: c.id, entry: null })],
];

test('when any entry of the change-log collection is malformed, every operation rejects with MalformedEntryError naming the entry\'s key before any other condition; body unchanged (C-008, section 4)', async () => {
  const [p0, p1] = [newPlatform(), newPlatform()];
  for (const [why, make] of MALFORMED) {
    const good = changeRow(orderedUuid(1), alice, EARLIER, { madeFor: p0, affected: [p0, p1] });
    const goodAck = ackRow(orderedUuid(2), alice, EARLIER, orderedUuid(1), p1);
    const neighbour = changeRow(orderedUuid(3), alice, EARLIER, { madeFor: null, affected: [p1] });
    const bad = make(structuredClone(good), structuredClone(goodAck));
    const body = bodyOf([neighbour]);
    /** @type {Record<string, unknown>} */ (body.collections[LOG])[bad.key] = bad.entry;
    const before = snapshot(body);

    /** @type {[string, () => Promise<unknown>][]} */
    const calls = [
      ['recordChange', () => withClock(HELD, () => log.recordChange(body, alice, act([goodPair], null, [])))],
      ['recordChange with a missing profile', () => withClock(HELD, () => log.recordChange(body, /** @type {any} */ (null), act([], null, [])))],
      ['acknowledge of the good neighbour', () => withClock(HELD, () => log.acknowledge(body, alice, { entryId: neighbour.id, platformId: p1 }))],
      ['acknowledge of an unknown entry with a missing profile', () => withClock(HELD, () => log.acknowledge(body, /** @type {any} */ (null), { entryId: /** @type {any} */ (orderedUuid(77)), platformId: p1 }))],
      ['listEntries', () => log.listEntries(body)],
      ['listHistory of a ref the good neighbour names', () => log.listHistory(body, { kind: 'hazard', id: 'H-0001' })],
      ['listHistory of a ref nothing names', () => log.listHistory(body, { kind: 'control', id: orderedUuid(88) })],
      ['listAwaiting of a platform the neighbour reaches', () => log.listAwaiting(body, p1)],
      ['listAwaiting of a platform nothing names', () => log.listAwaiting(body, newPlatform())],
    ];
    for (const [name, call] of calls) {
      const e = await rejectionOf(call, `${name} when ${why}`);
      assert.ok(e instanceof MalformedEntryError, `${name} when ${why}: rejects with MalformedEntryError, got ${String(e)}`);
      assert.equal(e.key, bad.key, `${name} when ${why}: names the entry's key`);
    }
    assert.deepEqual(body, before, `body unchanged when ${why}`);
  }
});
