/**
 * change-log conformance: boundaries (CORE-CON-002). Empty, degenerate, and edge cases of
 * modules/change-log/CONTRACT.md: a body with no change-log collection, collections of other
 * kinds however they are shaped, null against absence, what deep and exact comparison keeps,
 * every status transition, empty and self-referring platform lists, ids nothing names, an
 * acknowledgement naming an entry the body lacks or not live, and ties in time broken by id.
 * Written from the contract before any implementation (P8).
 *
 * The null double must fail this file (CORE-TST-002, rung 1).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as log from '../contract.js';
import { AlreadyAcknowledgedError } from '../contract.js';
import {
  EARLIER, HELD, LOG, ackRow, act, addedKeys, bodyOf, changeRow, edited, jsonRoundTrip, logEntries, newPlatform, newProfile, orderedUuid,
  plusSeconds, refOf, rejectionOf, schema, snapshot, storedRecord, withClock, withoutLog,
} from './harness.js';

const alice = newProfile('Alice');

/**
 * The one item `recordChange` gives for a single pair.
 * @param {import('../../../baseline/schema.js').StoredRecord | null} before
 * @param {import('../../../baseline/schema.js').StoredRecord} after
 */
async function itemFor(before, after) {
  const { entry } = await withClock(HELD, () => log.recordChange(schema.emptyDataBody(), alice, act([{ before, after }], null, [])));
  assert.equal(entry.items.length, 1);
  return entry.items[0];
}

test('a body with no change-log collection and collections of other kinds, however shaped: reads resolve empty, and the first recordChange adds the collection with one entry and carries every other collection through untouched (C-003, C-006)', async () => {
  const body = /** @type {import('../../../baseline/schema.js').DataBody} */ (/** @type {unknown} */ ({
    collections: {
      hazard: { 'H-0001': { title: 'no header at all' }, junk: [1, 2, 3], nothing: null },
      platform: 'not even an object of records',
    },
    sequences: { hazard: 12 },
  }));
  const before = snapshot(body);

  assert.deepEqual([...(await log.listEntries(body))], [], 'a malformed record of another kind is not a malformed entry');
  assert.deepEqual([...(await log.listHistory(body, { kind: 'hazard', id: 'H-0001' }))], [], 'a record existing is not history');
  assert.deepEqual([...(await log.listAwaiting(body, newPlatform()))], []);

  const h = storedRecord('hazard', 'H-0002', alice, { title: 'two' }, { at: HELD });
  const { body: b, entry: e } = await withClock(HELD, () => log.recordChange(body, alice, act([{ before: null, after: h }], null, [])));
  assert.deepEqual(Object.keys(logEntries(b)), [e.id], 'the collection now holds exactly the one entry');
  assert.deepEqual(withoutLog(b), withoutLog(body), 'every other collection and the sequences are carried through as they were');
  assert.deepEqual(body, before);
});

test('an empty change-log collection behaves as none (C-006, C-009, C-010)', async () => {
  const body = /** @type {any} */ ({ collections: { [LOG]: {} }, sequences: { hazard: 1 } });
  assert.deepEqual([...(await log.listEntries(body))], []);
  assert.deepEqual([...(await log.listAwaiting(body, newPlatform()))], []);
  const h = storedRecord('hazard', 'H-0001', alice, { title: 'one' }, { at: HELD });
  const { body: b, entry: e } = await withClock(HELD, () => log.recordChange(body, alice, act([{ before: null, after: h }], null, [])));
  assert.deepEqual(Object.keys(logEntries(b)), [e.id]);
});

test('a field whose value is null is a value, not an absence: null against absent, absent against a value, and null against a value are each a change, carrying null on the side a field is absent from (C-002)', async () => {
  const base = storedRecord('hazard', 'H-0001', alice, { title: 't', note: null });
  const withoutNote = /** @type {any} */ ({ ...edited(base, {}, alice, HELD) });
  delete withoutNote.note;

  assert.deepEqual((await itemFor(base, withoutNote)).fields, [{ field: 'note', before: null, after: null }], 'null removed: present on one side only, so a change');
  assert.deepEqual((await itemFor(withoutNote, edited(withoutNote, { owner: 'x' }, alice, HELD))).fields, [{ field: 'owner', before: null, after: 'x' }], 'a field added');
  assert.deepEqual((await itemFor(base, edited(base, { note: 'now written' }, alice, HELD))).fields, [{ field: 'note', before: null, after: 'now written' }], 'null to a value');
  assert.deepEqual((await itemFor(base, edited(base, { title: null }, alice, HELD))).fields, [{ field: 'title', before: 't', after: null }], 'a value to null');
});

test('comparison is deep and exact: a reordered array is a change, reordered object keys are not, a string is not the number it spells, and values are kept exactly as stored (C-002)', async () => {
  const long = 'x'.repeat(20000);
  const base = storedRecord('rating', orderedUuid(1), alice, {
    tags: ['a', 'b'], cell: { level: 2, letter: 'C' }, score: 1, text: 'short', ratio: 0.5, flag: false,
  });
  const after = edited(base, {
    tags: ['b', 'a'], cell: { letter: 'C', level: 2 }, score: '1', text: `  ${long}\n`, ratio: 0.1 + 0.2, flag: 0,
  }, alice, HELD);

  assert.deepEqual((await itemFor(base, after)).fields, [
    { field: 'flag', before: false, after: 0 },
    { field: 'ratio', before: 0.5, after: 0.1 + 0.2 },
    { field: 'score', before: 1, after: '1' },
    { field: 'tags', before: ['a', 'b'], after: ['b', 'a'] },
    { field: 'text', before: 'short', after: `  ${long}\n` },
  ], 'cell is structurally equal and absent; everything else is stored neither trimmed, rounded, nor truncated');
});

test('a nested value that differs deep inside is a change of the whole field, carried whole on both sides (C-002)', async () => {
  const base = storedRecord('workflow-record', orderedUuid(2), alice, { steps: [{ name: 'a', done: false, notes: ['x'] }, { name: 'b', done: false, notes: [] }] });
  const after = edited(base, { steps: [{ name: 'a', done: false, notes: ['x'] }, { name: 'b', done: true, notes: [] }] }, alice, HELD);
  assert.deepEqual((await itemFor(base, after)).fields, [{ field: 'steps', before: base.steps, after: after.steps }]);
});

test('every status transition gives the action C-005 derives, and a deleted or retired item carries every field while an edited one carries only what differs (C-004, C-005)', async () => {
  /** @type {[import('../../../baseline/types.js').RecordStatus, import('../../../baseline/types.js').RecordStatus, string][]} */
  const transitions = [
    ['live', 'deleted', 'deleted'], ['live', 'retired', 'retired'], ['retired', 'deleted', 'deleted'], ['deleted', 'retired', 'retired'],
    ['retired', 'live', 'edited'], ['deleted', 'live', 'edited'], ['live', 'live', 'edited'], ['deleted', 'deleted', 'edited'], ['retired', 'retired', 'edited'],
  ];
  for (const [from, to, action] of transitions) {
    const before = storedRecord('control', orderedUuid(3), alice, { title: 'same', level: 1 }, { status: from });
    const after = edited(before, { status: to, level: 2 }, alice, HELD);
    const item = await itemFor(before, after);
    assert.equal(item.action, action, `${from} to ${to} is ${action}`);
    const names = item.fields.map((f) => f.field);
    if (action === 'edited') {
      assert.deepEqual(names, from === to ? ['level'] : ['level', 'status'], `${from} to ${to}: only what differs`);
    } else {
      assert.deepEqual(names, ['createdAtAest', 'createdBy', 'id', 'kind', 'level', 'status', 'title'], `${from} to ${to}: every field`);
    }
  }
  const createdDeleted = await itemFor(null, storedRecord('link', orderedUuid(4), alice, { linkKind: 'hazard-platform' }, { status: 'deleted' }));
  assert.equal(createdDeleted.action, 'created', 'a null before is created whatever the after\'s status');
});

test('an item whose before lacks a field its after has, on deletion, carries that field with before null, and one the after lacks with after null (C-004)', async () => {
  const before = storedRecord('reference-entry', orderedUuid(5), alice, { title: 'AC 25-1', location: 'files/a.pdf' });
  const after = /** @type {any} */ ({ ...edited(before, { status: 'deleted', supersededBy: 'AC 25-2' }, alice, HELD) });
  delete after.location;
  const item = await itemFor(before, after);
  assert.equal(item.action, 'deleted');
  assert.deepEqual(item.fields.filter((f) => ['location', 'supersededBy'].includes(f.field)), [
    { field: 'location', before: 'files/a.pdf', after: null },
    { field: 'supersededBy', before: null, after: 'AC 25-2' },
  ]);
});

test('an empty affectedPlatformIds is stored as given and nobody awaits the act; a madeForPlatformId outside affectedPlatformIds is stored as given and not checked (C-010, section 5 null and empty semantics)', async () => {
  const [p, q] = [newPlatform(), newPlatform()];
  const h = storedRecord('hazard', 'H-0001', alice, { title: 'one' }, { at: HELD });
  const none = await withClock(HELD, () => log.recordChange(schema.emptyDataBody(), alice, act([{ before: null, after: h }], p, [])));
  assert.deepEqual(none.entry.affectedPlatformIds, []);
  for (const x of [p, q]) assert.deepEqual([...(await log.listAwaiting(none.body, x))], [], 'nobody awaits an act that reaches no platform');

  const outside = await withClock(HELD, () => log.recordChange(schema.emptyDataBody(), alice, act([{ before: null, after: h }], p, [q])));
  assert.equal(outside.entry.madeForPlatformId, p);
  assert.deepEqual(outside.entry.affectedPlatformIds, [q]);
  assert.deepEqual([...(await log.listAwaiting(outside.body, q))], [outside.entry]);
  assert.deepEqual([...(await log.listAwaiting(outside.body, p))], []);
});

test('reads never reject for an id nothing names, whatever its shape: listHistory and listAwaiting resolve empty (section 4, C-009, C-010)', async () => {
  const body = bodyOf([changeRow(orderedUuid(1), alice, EARLIER, { affected: [newPlatform()] })]);
  for (const ref of [{ kind: 'hazard', id: 'H-9999' }, { kind: 'control', id: '' }, { kind: LOG, id: orderedUuid(42) }, { kind: 'aircraft', id: 'x' }]) {
    assert.deepEqual([...(await log.listHistory(body, /** @type {any} */ (ref)))], [], `listHistory(${JSON.stringify(ref)})`);
  }
  for (const platform of [newPlatform(), 'P-8', '']) {
    assert.deepEqual([...(await log.listAwaiting(body, /** @type {any} */ (platform)))], [], `listAwaiting(${JSON.stringify(platform)})`);
  }
});

test('listHistory matches a ref by kind and id together: the same id under another kind is another record (C-009)', async () => {
  const id = orderedUuid(6);
  const asControl = changeRow(orderedUuid(10), alice, EARLIER, { items: [{ ref: { kind: 'control', id }, action: 'created', fields: [] }] });
  const asRating = changeRow(orderedUuid(11), alice, EARLIER, { items: [{ ref: { kind: 'rating', id }, action: 'created', fields: [] }] });
  const body = bodyOf([asControl, asRating]);
  assert.deepEqual([...(await log.listHistory(body, { kind: 'control', id }))], [asControl]);
  assert.deepEqual([...(await log.listHistory(body, { kind: 'rating', id }))], [asRating]);
});

test('an acknowledgement naming an entry the body does not hold is not malformed: it is listed, is that id\'s history, and clears nothing (C-008)', async () => {
  const p = newPlatform();
  const change = changeRow(orderedUuid(1), alice, EARLIER, { affected: [p] });
  const orphan = ackRow(orderedUuid(2), alice, plusSeconds(EARLIER, 1), orderedUuid(99), p);
  const body = bodyOf([change, orphan]);
  assert.deepEqual([...(await log.listEntries(body))], [change, orphan]);
  assert.deepEqual([...(await log.listHistory(body, { kind: LOG, id: orderedUuid(99) }))], [orphan]);
  assert.deepEqual([...(await log.listAwaiting(body, p))], [change], 'it clears nothing');
});

test('an acknowledgement that is not live clears nothing and does not make a new acknowledgement a repeat (C-010, section 4)', async () => {
  const p = newPlatform();
  const change = changeRow(orderedUuid(1), alice, EARLIER, { affected: [p] });
  for (const status of /** @type {const} */ (['deleted', 'retired'])) {
    const dead = ackRow(orderedUuid(2), alice, plusSeconds(EARLIER, 1), change.id, p, { status });
    const body = bodyOf([change, dead]);
    assert.deepEqual([...(await log.listAwaiting(body, p))], [change], `a ${status} acknowledgement clears nothing`);
    assert.deepEqual([...(await log.listEntries(body))], [change, dead], 'and is listed');
    const { body: b } = await withClock(HELD, () => log.acknowledge(body, alice, { entryId: change.id, platformId: p }));
    assert.deepEqual([...(await log.listAwaiting(b, p))], [], 'a live acknowledgement then clears it');
  }
});

test('entries recorded in the same second are ordered by id in every list, whatever order the collection holds them in (C-009, C-010)', async () => {
  const p = newPlatform();
  const ref = { kind: /** @type {const} */ ('hazard'), id: 'H-0001' };
  const items = [{ ref, action: /** @type {const} */ ('edited'), fields: [{ field: 'title', before: 'a', after: 'b' }] }];
  const c3 = changeRow(orderedUuid(3), alice, HELD, { items, affected: [p] });
  const c1 = changeRow(orderedUuid(1), alice, HELD, { items, affected: [p] });
  const c2 = changeRow(orderedUuid(2), alice, plusSeconds(HELD, -1), { items, affected: [p] });
  const a5 = ackRow(orderedUuid(5), alice, HELD, c2.id, newPlatform());
  const a4 = ackRow(orderedUuid(4), alice, HELD, c2.id, newPlatform());
  const body = bodyOf([a5, c3, a4, c1, c2]);

  assert.deepEqual((await log.listEntries(body)).map((e) => e.id), [c2.id, c1.id, c3.id, a4.id, a5.id], 'time first, then id');
  assert.deepEqual((await log.listHistory(body, ref)).map((e) => e.id), [c2.id, c1.id, c3.id]);
  assert.deepEqual((await log.listHistory(body, { kind: LOG, id: c2.id })).map((e) => e.id), [a4.id, a5.id]);
  assert.deepEqual((await log.listAwaiting(body, p)).map((e) => e.id), [c2.id, c1.id, c3.id]);
});

test('the same RecordedChange recorded twice at the same instant is two acts: two entries, two ids (section 5 idempotency)', async () => {
  const h = storedRecord('hazard', 'H-0001', alice, { title: 'one' });
  const change = act([{ before: h, after: edited(h, { title: 'two' }, alice, HELD) }], null, [newPlatform()]);
  const first = await withClock(HELD, () => log.recordChange(schema.emptyDataBody(), alice, change));
  const second = await withClock(HELD, () => log.recordChange(first.body, alice, change));
  assert.notEqual(second.entry.id, first.entry.id);
  assert.deepEqual({ ...second.entry, id: first.entry.id }, first.entry, 'the same entry but for its id');
  assert.deepEqual(addedKeys(first.body, second.body), [second.entry.id]);
  assert.equal((await log.listHistory(second.body, refOf(h))).length, 2);
});

test('nothing of a stored entry is the same object as anything passed in: mutating the change after the call leaves the returned body as it was (C-003)', async () => {
  const p = newPlatform();
  const before = storedRecord('consequence',orderedUuid(7), alice, { text: 'fire', effects: ['smoke', { crew: ['injury'] }] });
  const after = edited(before, { effects: ['smoke', { crew: ['injury', 'burns'] }] }, alice, HELD);
  const affected = [p];
  const change = act([{ before, after }], null, affected);

  const { body: b, entry: e } = await withClock(HELD, () => log.recordChange(schema.emptyDataBody(), alice, change));
  const kept = snapshot(b);
  /** @type {any} */ (after.effects)[1].crew.push('mutated');
  /** @type {any} */ (before.effects).push('mutated');
  after.text = 'mutated';
  affected.push(newPlatform());
  change.records.push({ before: null, after: before });

  assert.deepEqual(b, kept, 'the returned body did not move with the objects passed in');
  assert.deepEqual(logEntries(b)[e.id], kept.collections[LOG]?.[e.id]);
  assert.deepEqual(jsonRoundTrip(b), b, 'the body survives JSON serialisation and parsing');
});

test('acknowledge is not refused for who acknowledges: any profile may, and the stamp is that profile (C-012, explicitly not promised: entitlement)', async () => {
  const p = newPlatform();
  const change = changeRow(orderedUuid(1), alice, EARLIER, { affected: [p] });
  const stranger = newProfile('Not the owner');
  const { entry } = await withClock(HELD, () => log.acknowledge(bodyOf([change]), stranger, { entryId: change.id, platformId: p }));
  assert.equal(entry.createdBy, stranger.id);
  const again = await rejectionOf(() => withClock(HELD, () => log.acknowledge(bodyOf([change, entry]), alice, { entryId: change.id, platformId: p })));
  assert.ok(again instanceof AlreadyAcknowledgedError, 'and it counts for whoever owns the platform');
});
