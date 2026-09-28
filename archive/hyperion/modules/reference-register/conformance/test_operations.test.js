/**
 * reference-register conformance: operations (CORE-CON-002). Every signature on its happy path,
 * each test naming the clause of modules/reference-register/CONTRACT.md it encodes and the
 * SL-10 criterion behind it. Expected values are written out literally here, not from the
 * harness's models, so this file reads as the contract does. Written from the contract and
 * docs/slices/SL-10.md before any implementation (P8).
 *
 * Criterion 4 is encoded for the file half only: the path half is DEC-022's open GATE ruling
 * and no clause promises it (C-010).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as rr from '../contract.js';
import {
  ENTRY_FIELDS, HELD, KIND, LATER, SIX_KINDS, actOf, assertRecorded, bodyOf, changeLog, differences, entriesIn, entryRow,
  fieldsOf, incomingFile, jsonRoundTrip, newProfile, openFolder, orderedUuid, platformNo, referenceEntryId, refTo, schema, snapshot,
  storedFiles, withClock,
} from './harness.js';

test('LINKABLE_KINDS is exactly hazard, causal-factor, consequence, platform, control, and report (C-008; SL-10 criterion 3; REQ-030)', () => {
  assert.deepEqual([...rr.LINKABLE_KINDS].sort(), [...SIX_KINDS].sort());
});

test('createEntry with a name, a link, and a path on an empty body creates one live entry under a fresh id, as entered and trimmed, with no file and no links, stamped with the act and the clock, records it, and leaves the input body as it was (C-001, C-002, C-011; SL-10 criterion 1; REQ-028)', async () => {
  const body = schema.emptyDataBody();
  const before = snapshot(body);
  const alice = newProfile('Alice');
  const act = actOf(alice, platformNo(1), [platformNo(2), platformNo(1)]);
  const { folder, opened } = await openFolder();

  const { body: b, entry: e } = await withClock(HELD, () => rr.createEntry(body, act, opened, fieldsOf({
    name: '  MIL-STD-882E  ', link: ' https://example.org/882e ', path: '\t\\\\share\\standards\\882E.pdf\n',
  })));

  assert.doesNotThrow(() => referenceEntryId.parse(e.id), 'the id is a ReferenceEntryId');
  assert.deepEqual(e, {
    id: e.id,
    kind: KIND,
    status: 'live',
    createdBy: alice.id,
    createdAtAest: HELD,
    updatedBy: alice.id,
    updatedAtAest: HELD,
    name: 'MIL-STD-882E',
    link: 'https://example.org/882e',
    path: '\\\\share\\standards\\882E.pdf',
    fileLocation: null,
    links: [],
  }, 'the entry as C-001 describes it, and nothing else');
  assert.deepEqual(Object.keys(entriesIn(b)), [e.id], 'the collection holds the one entry, under its id');
  assert.deepEqual(entriesIn(b)[e.id], e, 'the stored entry is the entry returned');
  assert.deepEqual(await rr.getEntry(b, e.id), e, 'getEntry gives it back as entered');
  assert.deepEqual([...(await rr.listEntries(b))], [e]);
  assert.deepEqual(differences(body, b), [`${KIND}/${e.id}`], 'the body differs by the one entry and the log');
  assert.deepEqual(storedFiles(folder), [], 'no file is written when none is given');
  await assertRecorded(body, b, { act, at: HELD, before: null, after: e, what: 'createEntry' });
  assert.deepEqual(body, before, 'the body passed in is unchanged');
});

test('each of the four alone creates an entry holding that one and three nulls, shown back as entered (C-001; SL-10 criterion 1)', async () => {
  const alice = newProfile('Alice');
  const { folder, opened } = await openFolder();
  const bytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]);
  /** @type {[string, any, (e: any) => void][]} */
  const cases = [
    ['a name alone', { name: 'Hazard log procedure' }, (e) => assert.deepEqual([e.name, e.link, e.path, e.fileLocation], ['Hazard log procedure', null, null, null])],
    ['a link alone', { link: 'https://intranet/doc/42' }, (e) => assert.deepEqual([e.name, e.link, e.path, e.fileLocation], [null, 'https://intranet/doc/42', null, null])],
    ['a path alone', { path: 'C:\\Safety\\case.docx' }, (e) => assert.deepEqual([e.name, e.link, e.path, e.fileLocation], [null, null, 'C:\\Safety\\case.docx', null])],
    ['a file alone', { file: incomingFile('case.pdf', bytes) }, (e) => {
      assert.deepEqual([e.name, e.link, e.path], [null, null, null]);
      assert.equal(typeof e.fileLocation, 'string', 'the file alone gives an entry with a location');
    }],
  ];
  let body = schema.emptyDataBody();
  for (const [what, given, check] of cases) {
    const { body: b, entry: e } = await withClock(HELD, () => rr.createEntry(body, actOf(alice), opened, fieldsOf(given)));
    check(e);
    assert.deepEqual(await rr.getEntry(b, e.id), e, `${what}: shown back as entered`);
    body = b;
  }
  assert.equal((await rr.listEntries(body)).length, 4);
  assert.equal(storedFiles(folder).length, 1, 'only the entry with a file wrote one');
});

test('createEntry with a file keeps it in the data folder byte-for-byte through store, and the entry holds the location and nothing of the contents (C-003; SL-10 criterion 2; REQ-029)', async () => {
  const alice = newProfile('Alice');
  const { folder, opened } = await openFolder();
  const bytes = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x80, 0xfe, 0x0a, 0x41, 0x42]);
  const body = schema.emptyDataBody();

  const { body: b, entry: e } = await withClock(HELD, () => rr.createEntry(body, actOf(alice), opened, fieldsOf({ name: 'Bow-tie workshop', file: incomingFile('Bow-tie workshop.xlsx', bytes) })));

  assert.equal(typeof e.fileLocation, 'string');
  assert.deepEqual(storedFiles(folder), [e.fileLocation], 'exactly one file was kept, at the location the entry holds');
  assert.deepEqual(folder.readBytes(/** @type {string} */ (e.fileLocation)), bytes, 'the location opens and yields the bytes');
  assert.deepEqual(folder.list(), [e.fileLocation], 'nothing else in the folder is written: no data.json');
  assert.deepEqual([...(await rr.checkEntryFiles(b, opened))], [{ entryId: e.id, location: e.fileLocation, flagged: false, reason: null }]);

  const stored = entriesIn(b)[e.id];
  assert.deepEqual(Object.keys(stored).sort(), ENTRY_FIELDS, 'the stored record has the fields of section 3 and no other: no bytes, size, type, or hash');
  assert.deepEqual(stored, e);
  assert.deepEqual(differences(body, b), [`${KIND}/${e.id}`], 'the file crosses into the body as the one entry and nothing else');
});

test('linkEntry adds one ref to a live entry, restamps updatedBy and updatedAtAest only, records an edit of links, and leaves the input body as it was (C-008, C-002, C-011; SL-10 criterion 3; REQ-030)', async () => {
  const alice = newProfile('Alice');
  const bob = newProfile('Bob');
  const { opened } = await openFolder();
  const { body: b1, entry: e1 } = await withClock(HELD, () => rr.createEntry(schema.emptyDataBody(), actOf(alice), opened, fieldsOf({ name: 'Hazard analysis' })));
  const before = snapshot(b1);
  const act = actOf(bob, platformNo(3), [platformNo(3), platformNo(4)]);

  const { body: b2, entry: e2 } = await withClock(LATER, () => rr.linkEntry(b1, act, { entryId: e1.id, ref: { kind: 'hazard', id: 'H-0007' } }));

  assert.deepEqual(e2, { ...e1, updatedBy: bob.id, updatedAtAest: LATER, links: [{ kind: 'hazard', id: 'H-0007' }] });
  assert.deepEqual(await rr.getEntry(b2, e1.id), e2);
  assert.deepEqual(differences(b1, b2), [`${KIND}/${e1.id}`]);
  const logged = await assertRecorded(b1, b2, { act, at: LATER, before: e1, after: e2, what: 'linkEntry' });
  assert.equal(/** @type {any} */ (logged.items[0]).action, 'edited', 'a link added is an edit');
  assert.deepEqual(/** @type {any} */ (logged.items[0]).fields, [{ field: 'links', before: [], after: [{ kind: 'hazard', id: 'H-0007' }] }], 'carrying links as it was and as it now is');
  assert.deepEqual(b1, before, 'the body passed in is unchanged');
});

test('an entry can be linked to one of each of the six kinds, the refs are kept ascending by kind then id, and the entry lists everything it is linked to (C-008, C-009; SL-10 criterion 3; REQ-030, REQ-031)', async () => {
  const alice = newProfile('Alice');
  const { opened } = await openFolder();
  let { body, entry } = await withClock(HELD, () => rr.createEntry(schema.emptyDataBody(), actOf(alice), opened, fieldsOf({ link: 'https://example.org/sms' })));
  const order = ['report', 'control', 'hazard', 'platform', 'consequence', 'causal-factor'];
  for (const kind of order) {
    ({ body, entry } = await withClock(HELD, () => rr.linkEntry(body, actOf(alice), { entryId: entry.id, ref: refTo(/** @type {any} */ (kind), 1) })));
  }
  const expected = [
    refTo('causal-factor', 1), refTo('consequence', 1), refTo('control', 1), refTo('hazard', 1), refTo('platform', 1), refTo('report', 1),
  ];
  assert.deepEqual([...entry.links], expected);
  assert.deepEqual([...(/** @type {any} */ (await rr.getEntry(body, entry.id))).links], expected, 'getEntry lists them');
  assert.deepEqual([...(await rr.listEntries(body))[0].links], expected, 'listEntries lists the same');
  assert.equal((await changeLog.listHistory(body, { kind: KIND, id: entry.id })).length, 7, 'one creation and six links, each in the history');
});

test('linkEntry resolves no id: a ref to a record no body holds, of any of the six kinds, is linked (C-008)', async () => {
  const alice = newProfile('Alice');
  for (const kind of SIX_KINDS) {
    const body = bodyOf([entryRow(orderedUuid(1), alice)]);
    const { entry } = await withClock(HELD, () => rr.linkEntry(body, actOf(alice), { entryId: orderedUuid(1), ref: refTo(kind, 9999) }));
    assert.deepEqual([...entry.links], [refTo(kind, 9999)], `a ${kind} nobody holds is linked`);
  }
});

test('listEntries gives every live entry once, ascending by createdAtAest then id, and no deleted or retired one; getEntry gives any entry whatever its status (C-005; SL-10 criterion 1)', async () => {
  const alice = newProfile('Alice');
  const t1 = /** @type {any} */ ('2026-02-01T09:00:00+10:00');
  const t2 = /** @type {any} */ ('2026-03-01T09:00:00+10:00');
  const late = entryRow(orderedUuid(1), alice, { at: t2 });
  const earlyB = entryRow(orderedUuid(3), alice, { at: t1 });
  const earlyA = entryRow(orderedUuid(2), alice, { at: t1 });
  const deleted = entryRow(orderedUuid(0), alice, { at: t1, status: 'deleted' });
  const retired = entryRow(orderedUuid(4), alice, { at: t1, status: 'retired' });
  const body = bodyOf([late, deleted, earlyB, retired, earlyA]);

  assert.deepEqual([...(await rr.listEntries(body))].map((e) => e.id), [earlyA.id, earlyB.id, late.id]);
  assert.deepEqual(await rr.getEntry(body, deleted.id), deleted, 'a deleted entry is still given by id');
  assert.deepEqual(await rr.getEntry(body, retired.id), retired);
  assert.equal(await rr.getEntry(body, orderedUuid(99)), null, 'an id nothing has is null');
});

test('checkEntryFiles gives one state per live entry in listEntries order: no file is never flagged, a file that is there is not flagged, a file that has gone is flagged missing (C-010; SL-10 criterion 4, file half; REQ-078)', async () => {
  const alice = newProfile('Alice');
  const { folder, opened } = await openFolder();
  let body = schema.emptyDataBody();
  const made = [];
  for (const [at, given] of /** @type {[any, any][]} */ ([
    ['2026-09-01T09:00:00+10:00', { name: 'no file' }],
    ['2026-09-02T09:00:00+10:00', { file: incomingFile('kept.pdf', [1, 2, 3]) }],
    ['2026-09-03T09:00:00+10:00', { name: 'gone', file: incomingFile('gone.pdf', [4, 5]) }],
  ])) {
    const r = await withClock(at, () => rr.createEntry(body, actOf(alice), opened, fieldsOf(given)));
    body = r.body;
    made.push(r.entry);
  }
  folder.remove(/** @type {string} */ (made[2].fileLocation));

  assert.deepEqual([...(await rr.checkEntryFiles(body, opened))], [
    { entryId: made[0].id, location: null, flagged: false, reason: null },
    { entryId: made[1].id, location: made[1].fileLocation, flagged: false, reason: null },
    { entryId: made[2].id, location: made[2].fileLocation, flagged: true, reason: 'missing' },
  ]);
});

test('a file put back by hand is unflagged on the next call (C-010)', async () => {
  const alice = newProfile('Alice');
  const { folder, opened } = await openFolder();
  const { body, entry } = await withClock(HELD, () => rr.createEntry(schema.emptyDataBody(), actOf(alice), opened, fieldsOf({ file: incomingFile('a.txt', [9]) })));
  const location = /** @type {string} */ (entry.fileLocation);
  folder.remove(location);
  assert.equal((await rr.checkEntryFiles(body, opened))[0].flagged, true);
  folder.writeBytes(location, Uint8Array.from([9]));
  assert.deepEqual([...(await rr.checkEntryFiles(body, opened))], [{ entryId: entry.id, location, flagged: false, reason: null }]);
});

test('the act a reference change reaches is in the queue of the platforms the caller named and not of the one it was made for (C-011; change-log C-010)', async () => {
  const alice = newProfile('Alice');
  const { opened } = await openFolder();
  const act = actOf(alice, platformNo(1), [platformNo(1), platformNo(2)]);
  const { body, entry } = await withClock(HELD, () => rr.createEntry(schema.emptyDataBody(), act, opened, fieldsOf({ name: 'Standard' })));
  const awaiting = await changeLog.listAwaiting(body, platformNo(2));
  assert.equal(awaiting.length, 1);
  assert.deepEqual(/** @type {any} */ (awaiting[0]).items[0].ref, { kind: KIND, id: entry.id });
  assert.deepEqual([...(await changeLog.listAwaiting(body, platformNo(1)))], [], 'not the platform it was made for');
});

test('what createEntry stores survives a JSON round trip unchanged (C-002)', async () => {
  const alice = newProfile('Alice');
  const { opened } = await openFolder();
  const { body: b1, entry } = await withClock(HELD, () => rr.createEntry(schema.emptyDataBody(), actOf(alice), opened, fieldsOf({ name: 'x', file: incomingFile('x.bin', [0, 255]) })));
  const { body: b2 } = await withClock(LATER, () => rr.linkEntry(b1, actOf(alice), { entryId: entry.id, ref: refTo('control', 2) }));
  assert.deepEqual(jsonRoundTrip(b2), b2);
});
