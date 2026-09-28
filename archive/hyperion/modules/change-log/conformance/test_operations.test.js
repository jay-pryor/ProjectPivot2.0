/**
 * change-log conformance: operations (CORE-CON-002). Every signature on its happy path, each
 * test naming the clause of modules/change-log/CONTRACT.md it encodes and the SL-05
 * criterion behind it. Expected values are written out literally here, not from the
 * harness's model, so this file reads as the contract does. Written from the contract and
 * docs/slices/SL-05.md before any implementation (P8).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as log from '../contract.js';
import {
  EARLIER, HELD, LOG, act, addedKeys, changeLogEntryId, edited, logEntries, newPlatform, newProfile, plusSeconds, refOf, schema, snapshot,
  storedRecord, withClock, withoutLog,
} from './harness.js';

test('recordChange of a created hazard on an empty body appends one entry stamped with the profile and the held clock, holding every field of the record but the restamp fields, and leaves the input body as it was (C-001, C-003, C-004, C-005)', async () => {
  const body = schema.emptyDataBody();
  const before = snapshot(body);
  const alice = newProfile('Alice');
  const hazard = storedRecord('hazard', 'H-0001', alice, { title: 'Loss of control' }, { at: HELD });

  const { body: b, entry: e } = await withClock(HELD, () => log.recordChange(body, alice, act([{ before: null, after: hazard }], null, [])));

  assert.doesNotThrow(() => changeLogEntryId.parse(e.id), 'the id is a ChangeLogEntryId');
  assert.deepEqual(e, {
    id: e.id,
    kind: LOG,
    status: 'live',
    createdBy: alice.id,
    createdAtAest: HELD,
    updatedBy: alice.id,
    updatedAtAest: HELD,
    entryKind: 'record-change',
    items: [{
      ref: { kind: 'hazard', id: 'H-0001' },
      action: 'created',
      fields: [
        { field: 'createdAtAest', before: null, after: HELD },
        { field: 'createdBy', before: null, after: alice.id },
        { field: 'id', before: null, after: 'H-0001' },
        { field: 'kind', before: null, after: 'hazard' },
        { field: 'status', before: null, after: 'live' },
        { field: 'title', before: null, after: 'Loss of control' },
      ],
    }],
    madeForPlatformId: null,
    affectedPlatformIds: [],
  }, 'the entry as C-001 and C-004 describe it, and nothing else');
  assert.deepEqual(Object.keys(logEntries(b)), [e.id], 'the collection now holds the one entry, under its id');
  assert.deepEqual(logEntries(b)[e.id], e, 'the stored entry is the entry returned');
  assert.deepEqual(withoutLog(b), withoutLog(body), 'the new body differs only in the change-log collection');
  assert.deepEqual(body, before, 'the body passed in is unchanged');
});

test('recordChange of an edit holds, for each changed field only, its previous and new value in ascending order of field, and never updatedBy or updatedAtAest (C-002, C-005; SL-05 criterion 2)', async () => {
  const alice = newProfile('Alice');
  const bob = newProfile('Bob');
  const control = storedRecord('control', '00000000-0000-4000-8000-00000000c001', alice, { title: 'Pitot heat', description: 'on before taxi', effectiveness: 3 });
  const after = edited(control, { title: 'Pitot heat check', effectiveness: 4 }, bob, HELD);

  const { entry: e } = await withClock(HELD, () => log.recordChange(schema.emptyDataBody(), bob, act([{ before: control, after }], null, [])));

  assert.equal(e.createdBy, bob.id, 'who did it is the profile passed, not the record\'s createdBy');
  assert.equal(e.createdAtAest, HELD);
  assert.deepEqual(e.items, [{
    ref: { kind: 'control', id: control.id },
    action: 'edited',
    fields: [
      { field: 'effectiveness', before: 3, after: 4 },
      { field: 'title', before: 'Pitot heat', after: 'Pitot heat check' },
    ],
  }], 'description did not change and is absent; the restamp is in no item');
});

test('recordChange of a deletion holds who, the AEST time, and every field the record contained, and listHistory gives it for that record (C-004, C-005, C-009; SL-05 criterion 1)', async () => {
  const alice = newProfile('Alice');
  const bob = newProfile('Bob');
  const cf = storedRecord('causal-factor', '00000000-0000-4000-8000-0000000cf001', alice, { hazardId: 'H-0001', text: 'ice on pitot', tags: ['weather', 'sensor'] });
  const deleted = edited(cf, { status: 'deleted' }, bob, HELD);

  const { body: b, entry: e } = await withClock(HELD, () => log.recordChange(schema.emptyDataBody(), bob, act([{ before: cf, after: deleted }], null, [])));

  assert.equal(e.createdBy, bob.id, 'who deleted it');
  assert.equal(e.createdAtAest, HELD, 'when, in AEST');
  assert.deepEqual(e.items, [{
    ref: refOf(cf),
    action: 'deleted',
    fields: [
      { field: 'createdAtAest', before: EARLIER, after: EARLIER },
      { field: 'createdBy', before: alice.id, after: alice.id },
      { field: 'hazardId', before: 'H-0001', after: 'H-0001' },
      { field: 'id', before: cf.id, after: cf.id },
      { field: 'kind', before: 'causal-factor', after: 'causal-factor' },
      { field: 'status', before: 'live', after: 'deleted' },
      { field: 'tags', before: ['weather', 'sensor'], after: ['weather', 'sensor'] },
      { field: 'text', before: 'ice on pitot', after: 'ice on pitot' },
    ],
  }], 'every field, not only the ones that differ: what it contained');
  assert.deepEqual([...(await log.listHistory(b, refOf(cf)))], [e], 'the history of the deleted record is the entry');
});

test('recordChange of a retirement derives action retired and holds every field (C-004, C-005; SL-05 criterion 6)', async () => {
  const alice = newProfile('Alice');
  const platform = storedRecord('platform', newPlatform(), alice, { name: 'P-8' });
  const retired = edited(platform, { status: 'retired' }, alice, HELD);

  const { entry: e } = await withClock(HELD, () => log.recordChange(schema.emptyDataBody(), alice, act([{ before: platform, after: retired }], platform.id, [platform.id])));

  assert.equal(e.items[0].action, 'retired');
  assert.deepEqual(e.items[0].fields.map((f) => f.field), ['createdAtAest', 'createdBy', 'id', 'kind', 'name', 'status']);
  assert.deepEqual(e.items[0].fields.find((f) => f.field === 'status'), { field: 'status', before: 'live', after: 'retired' });
});

test('one act changing two records is one entry with one item per record in the order given; affectedPlatformIds are deduplicated and ascending, madeForPlatformId as given (C-001; SL-05 criterion 4)', async () => {
  const alice = newProfile('Alice');
  const [p1, p2, p3] = [newPlatform(), newPlatform(), newPlatform()];
  const justification = storedRecord('justification', '00000000-0000-4000-8000-00000000a001', alice, { reason: 'not fitted' }, { at: HELD });
  const link = storedRecord('link', '00000000-0000-4000-8000-00000000b001', alice, { linkKind: 'control-platform', state: 'confirmed' });
  const superseded = edited(link, { status: 'deleted' }, alice, HELD);

  const change = act([{ before: null, after: justification }, { before: link, after: superseded }], p2, [p3, p1, p2, p3, p1]);
  const { body: b, entry: e } = await withClock(HELD, () => log.recordChange(schema.emptyDataBody(), alice, change));

  assert.deepEqual(e.items.map((i) => [i.ref, i.action]), [[refOf(justification), 'created'], [refOf(link), 'deleted']], 'one item per record, in the order given');
  assert.equal(e.madeForPlatformId, p2);
  assert.deepEqual(e.affectedPlatformIds, [...new Set([p1, p2, p3])].sort(), 'duplicates removed, ascending as strings');
  assert.equal(Object.keys(logEntries(b)).length, 1, 'one act is one entry');
  assert.deepEqual([...(await log.listHistory(b, refOf(justification)))], [e]);
  assert.deepEqual([...(await log.listHistory(b, refOf(link)))], [e], 'the same entry is in the history of both records');
});

test('recordChange on a body with entries adds one entry under a fresh id and leaves every existing entry as it was (C-001, C-006)', async () => {
  const alice = newProfile('Alice');
  const h1 = storedRecord('hazard', 'H-0001', alice, { title: 'one' });
  const first = await withClock(HELD, () => log.recordChange(schema.emptyDataBody(), alice, act([{ before: null, after: h1 }], null, [])));
  const snap = snapshot(first.body);
  const later = plusSeconds(HELD, 60);

  const second = await withClock(later, () => log.recordChange(first.body, alice, act([{ before: h1, after: edited(h1, { title: 'two' }, alice, later) }], null, [])));

  assert.notEqual(second.entry.id, first.entry.id, 'a fresh id');
  assert.deepEqual(addedKeys(first.body, second.body), [second.entry.id], 'exactly one entry added');
  assert.deepEqual(logEntries(second.body)[first.entry.id], first.entry, 'the earlier entry unchanged');
  assert.deepEqual(first.body, snap, 'the body passed in is unchanged');
  assert.deepEqual([...(await log.listHistory(second.body, refOf(h1)))], [first.entry, second.entry], 'history in ascending time');
});

test('listEntries, listHistory and listAwaiting resolve empty for a body with no change-log collection (C-006, C-009, C-010)', async () => {
  const body = schema.emptyDataBody();
  assert.deepEqual([...(await log.listEntries(body))], []);
  assert.deepEqual([...(await log.listHistory(body, { kind: 'hazard', id: 'H-0001' }))], []);
  assert.deepEqual([...(await log.listHistory(body, { kind: LOG, id: '00000000-0000-4000-8000-000000000001' }))], []);
  assert.deepEqual([...(await log.listAwaiting(body, newPlatform()))], []);
});

test('an edit made for one platform awaits acknowledgement on every other platform it reaches and not on its own; acknowledging clears it for that platform and no other, and the history keeps it (C-010, C-011; SL-05 criterion 4)', async () => {
  const alice = newProfile('Alice');
  const bob = newProfile('Bob');
  const [mine, theirs, third, untouched] = [newPlatform(), newPlatform(), newPlatform(), newPlatform()];
  const hazard = storedRecord('hazard', 'H-0003', alice, { title: 'bird strike' });
  const change = act([{ before: hazard, after: edited(hazard, { title: 'bird strike on climb' }, alice, HELD) }], mine, [mine, theirs, third]);

  const recorded = await withClock(HELD, () => log.recordChange(schema.emptyDataBody(), alice, change));
  const e = recorded.entry;

  assert.deepEqual([...(await log.listAwaiting(recorded.body, mine))], [], 'not awaited on the platform it was made for');
  assert.deepEqual([...(await log.listAwaiting(recorded.body, theirs))], [e], 'awaited on another platform it reaches, as the whole entry');
  assert.deepEqual([...(await log.listAwaiting(recorded.body, third))], [e]);
  assert.deepEqual([...(await log.listAwaiting(recorded.body, untouched))], [], 'not awaited on a platform it does not reach');

  const acked = await withClock(plusSeconds(HELD, 5), () => log.acknowledge(recorded.body, bob, { entryId: e.id, platformId: theirs }));

  assert.deepEqual(acked.entry, {
    id: acked.entry.id,
    kind: LOG,
    status: 'live',
    createdBy: bob.id,
    createdAtAest: plusSeconds(HELD, 5),
    updatedBy: bob.id,
    updatedAtAest: plusSeconds(HELD, 5),
    entryKind: 'acknowledgement',
    entryId: e.id,
    platformId: theirs,
  }, 'the acknowledgement as C-011 describes it');
  assert.doesNotThrow(() => changeLogEntryId.parse(acked.entry.id));
  assert.notEqual(acked.entry.id, e.id);
  assert.deepEqual(addedKeys(recorded.body, acked.body), [acked.entry.id], 'the body differs only by the acknowledgement');
  assert.deepEqual(logEntries(acked.body)[e.id], e, 'the acknowledged entry is unchanged');
  assert.deepEqual([...(await log.listAwaiting(acked.body, theirs))], [], 'cleared for that platform');
  assert.deepEqual([...(await log.listAwaiting(acked.body, third))], [e], 'and for nobody else');
  assert.deepEqual([...(await log.listHistory(acked.body, refOf(hazard)))], [e], 'the history still gives the change');
  assert.deepEqual([...(await log.listHistory(acked.body, { kind: LOG, id: e.id }))], [acked.entry], 'the history of the entry is who acknowledged it and when');
  assert.deepEqual([...(await log.listEntries(acked.body))], [e, acked.entry], 'listEntries gives both kinds in ascending time');
});

test('an act made for no platform awaits acknowledgement on every platform it reaches; one reaching three platforms is acknowledged three times (C-010, C-011; SL-05 criterion 4)', async () => {
  const alice = newProfile('Alice');
  const platforms = [newPlatform(), newPlatform(), newPlatform()];
  const control = storedRecord('control', '00000000-0000-4000-8000-00000000c002', alice, { title: 'crew briefing' });
  let { body, entry: e } = await withClock(HELD, () => log.recordChange(schema.emptyDataBody(), alice, act([{ before: control, after: edited(control, { title: 'crew brief' }, alice, HELD) }], null, platforms)));

  for (const p of platforms) assert.deepEqual([...(await log.listAwaiting(body, p))], [e], 'awaited on every platform it reaches');
  for (const [i, p] of platforms.entries()) {
    body = (await withClock(plusSeconds(HELD, i + 1), () => log.acknowledge(body, alice, { entryId: e.id, platformId: p }))).body;
    for (const [j, q] of platforms.entries()) {
      assert.deepEqual([...(await log.listAwaiting(body, q))], j <= i ? [] : [e], `after ${i + 1} acknowledgement(s), platform ${j} ${j <= i ? 'is cleared' : 'still awaits'}`);
    }
  }
  assert.equal((await log.listHistory(body, { kind: LOG, id: e.id })).length, 3, 'three acknowledgements in the entry\'s history');
});

test('listAwaiting gives every awaited entry in ascending createdAtAest then id, whatever order the collection holds them in (C-010; SL-05 criterion 4)', async () => {
  const alice = newProfile('Alice');
  const p = newPlatform();
  const other = newPlatform();
  const h = storedRecord('hazard', 'H-0009', alice, { title: 't0' });
  let body = schema.emptyDataBody();
  /** @type {string[]} */
  const ids = [];
  const times = [plusSeconds(HELD, 30), HELD, plusSeconds(HELD, 10)];
  for (const [i, at] of times.entries()) {
    const r = await withClock(at, () => log.recordChange(body, alice, act([{ before: h, after: edited(h, { title: `t${i + 1}` }, alice, at) }], other, [p, other])));
    ids.push(r.entry.id);
    body = r.body;
  }
  assert.deepEqual((await log.listAwaiting(body, p)).map((e) => e.id), [ids[1], ids[2], ids[0]], 'by time, not by the order they were recorded');
  assert.deepEqual((await log.listAwaiting(body, other)).map((e) => e.id), [], 'none awaits the platform each was made for');
});

test('a change of a platform\'s owner leaves every change awaiting that platform awaiting, in the same order, for whoever now owns it; the queue names no owner (C-012; SL-05 criterion 5)', async () => {
  const outgoing = newProfile('Outgoing');
  const incoming = newProfile('Incoming');
  const editor = newProfile('Editor');
  const [p, elsewhere] = [newPlatform(), newPlatform()];
  const platformRow = storedRecord('platform', p, outgoing, { name: 'C-130', ownerProfileId: outgoing.id });
  const hazard = storedRecord('hazard', 'H-0004', editor, { title: 'fuel starvation' });

  let body = schema.emptyDataBody();
  body = (await withClock(HELD, () => log.recordChange(body, editor, act([{ before: hazard, after: edited(hazard, { title: 'fuel starvation in cruise' }, editor, HELD) }], elsewhere, [elsewhere, p])))).body;
  const awaitingBefore = [...(await log.listAwaiting(body, p))];
  assert.equal(awaitingBefore.length, 1);

  const later = plusSeconds(HELD, 3600);
  const transfer = act([{ before: platformRow, after: edited(platformRow, { ownerProfileId: incoming.id }, outgoing, later) }], p, [p]);
  body = (await withClock(later, () => log.recordChange(body, outgoing, transfer))).body;

  assert.deepEqual([...(await log.listAwaiting(body, p))], awaitingBefore, 'the queue is what it was before the owner changed');
  const acked = await withClock(plusSeconds(later, 1), () => log.acknowledge(body, incoming, { entryId: awaitingBefore[0].id, platformId: p }));
  assert.equal(acked.entry.createdBy, incoming.id, 'the incoming owner acknowledges it; nothing asked who owns the platform');
  assert.deepEqual([...(await log.listAwaiting(acked.body, p))], []);
});
