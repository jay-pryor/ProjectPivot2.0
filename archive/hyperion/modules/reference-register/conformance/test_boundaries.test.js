/**
 * reference-register conformance: boundaries (CORE-CON-002). Empty, absent, degenerate, and
 * awkward inputs for every operation of modules/reference-register/CONTRACT.md: a body with no
 * register, an id nothing has, a zero-byte file, file names that are not safe as paths, a folder
 * that refuses every read and write where no operation should reach it, and the null and empty
 * semantics of section 5. Written from the contract before any implementation (P8).
 *
 * The null double must fail this file (CORE-TST-002, rung 1).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as rr from '../contract.js';
import {
  AWKWARD_FILE_NAMES, FILES, HELD, KIND, LATER, actOf, bodyOf, changeLog, entriesIn, entryRow, fieldsOf, incomingFile, newProfile,
  openFolder, orderedUuid, platformNo, refTo, schema, sealedFolder, snapshot, storedFiles, withBrowserStorageSpies, withClock,
} from './harness.js';

const alice = newProfile('Alice');

// ------------------------------------------------------------------ an empty register (C-005)

test('a body with no reference-entry collection has no entries: listEntries and checkEntryFiles resolve empty and getEntry null, without reaching the folder (C-005, C-010, section 4)', async () => {
  const { folder, opened } = await sealedFolder();
  for (const body of [schema.emptyDataBody(), bodyOf([], { hazard: {} }), /** @type {any} */ ({ collections: { [KIND]: {} }, sequences: { hazard: 1 } })]) {
    assert.deepEqual([...(await rr.listEntries(body))], []);
    assert.equal(await rr.getEntry(body, /** @type {any} */ (orderedUuid(1))), null);
    assert.deepEqual([...(await rr.checkEntryFiles(body, opened))], []);
  }
  assert.deepEqual(folder.list(), []);
});

test('the first createEntry creates the collection (C-005)', async () => {
  const { opened } = await openFolder();
  const body = schema.emptyDataBody();
  const { body: b, entry } = await withClock(HELD, () => rr.createEntry(body, actOf(alice), opened, fieldsOf({ name: 'first' })));
  assert.deepEqual(Object.keys(entriesIn(b)), [entry.id]);
  assert.equal(/** @type {any} */ (body.collections)[KIND], undefined, 'the input still has none');
});

test('getEntry resolves with null, never a rejection, for an id nothing has: a UUID, a string that is not one, and an id of an entry that exists under another kind (C-005)', async () => {
  const body = bodyOf([entryRow(orderedUuid(1), alice)], { control: { [orderedUuid(2)]: { id: orderedUuid(2), kind: 'control' } } });
  for (const id of [orderedUuid(9), 'not-an-id', '', orderedUuid(2)]) {
    assert.equal(await rr.getEntry(body, /** @type {any} */ (id)), null, `getEntry(${JSON.stringify(id)})`);
  }
});

// ------------------------------------------------------------------ what is entered (C-001, C-005)

test('trimming removes leading and trailing whitespace only: whitespace inside a name, link, or path is kept, and nothing else is normalised (C-001, C-005)', async () => {
  const { opened } = await openFolder();
  const { entry } = await withClock(HELD, () => rr.createEntry(schema.emptyDataBody(), actOf(alice), opened, fieldsOf({
    name: '\n  Safety  Case\tPart 2 ', link: ' HTTPS://Example.org/a b?c=d#E ', path: '  /mnt/Share/My  Docs/../x.pdf  ',
  })));
  assert.deepEqual([entry.name, entry.link, entry.path], ['Safety  Case\tPart 2', 'HTTPS://Example.org/a b?c=d#E', '/mnt/Share/My  Docs/../x.pdf']);
});

test('a link and a path are stored as text whatever they hold: a link that is not a URL and a path that is not a path are neither checked nor refused (C-001; Explicitly not promised)', async () => {
  const { opened } = await openFolder();
  const { entry } = await withClock(HELD, () => rr.createEntry(schema.emptyDataBody(), actOf(alice), opened, fieldsOf({ link: 'see Bob', path: 'https://example.org/not-a-path' })));
  assert.deepEqual([entry.link, entry.path], ['see Bob', 'https://example.org/not-a-path']);
});

test('a stored entry is given back exactly as stored: a name with whitespace around it is not re-trimmed, and a blank stored name is listed rather than refused (C-005, C-006)', async () => {
  const padded = entryRow(orderedUuid(1), alice, { name: '  padded  ' });
  const blank = entryRow(orderedUuid(2), alice, { name: '', link: ' ' });
  const body = bodyOf([padded, blank]);
  assert.deepEqual([...(await rr.listEntries(body))], [padded, blank]);
  assert.deepEqual(await rr.getEntry(body, /** @type {any} */ (orderedUuid(1))), padded);
});

test('createEntry twice with equal fields and an equal file gives two entries, two ids, and two files at two locations (section 5, Idempotency)', async () => {
  const { folder, opened } = await openFolder();
  const given = () => fieldsOf({ name: 'same', file: incomingFile('same.pdf', [1, 2, 3]) });
  const first = await withClock(HELD, () => rr.createEntry(schema.emptyDataBody(), actOf(alice), opened, given()));
  const second = await withClock(HELD, () => rr.createEntry(first.body, actOf(alice), opened, given()));
  assert.notEqual(first.entry.id, second.entry.id);
  assert.notEqual(first.entry.fileLocation, second.entry.fileLocation);
  assert.equal(storedFiles(folder).length, 2);
  assert.equal((await rr.listEntries(second.body)).length, 2);
});

// ------------------------------------------------------------------ the file (C-003, C-007)

test('a zero-byte file is kept, and the entry holds its location (C-003)', async () => {
  const { folder, opened } = await openFolder();
  const { body, entry } = await withClock(HELD, () => rr.createEntry(schema.emptyDataBody(), actOf(alice), opened, fieldsOf({ file: incomingFile('empty.txt', []) })));
  assert.deepEqual(folder.readBytes(/** @type {string} */ (entry.fileLocation)), new Uint8Array(0));
  assert.deepEqual([...(await rr.checkEntryFiles(body, opened))], [{ entryId: entry.id, location: entry.fileLocation, flagged: false, reason: null }]);
});

test('files whose names are not safe as paths are each kept at a fresh location under files/, and every one opens with its bytes (C-003; store C-018)', async () => {
  const { folder, opened } = await openFolder();
  let body = schema.emptyDataBody();
  /** @type {string[]} */
  const locations = [];
  for (const [i, name] of AWKWARD_FILE_NAMES.entries()) {
    const r = await withClock(HELD, () => rr.createEntry(body, actOf(alice), opened, fieldsOf({ file: incomingFile(name, [i, 255 - i]) })));
    body = r.body;
    const location = /** @type {string} */ (r.entry.fileLocation);
    assert.deepEqual(folder.readBytes(location), Uint8Array.from([i, 255 - i]), `${JSON.stringify(name)} opens with its bytes`);
    locations.push(location);
  }
  assert.equal(new Set(locations).size, AWKWARD_FILE_NAMES.length, 'every location is fresh');
  assert.deepEqual(folder.list().filter((rel) => !rel.startsWith(`${FILES}/`)), [], 'nothing outside files/ is written');
  assert.ok((await rr.checkEntryFiles(body, opened)).every((s) => !s.flagged));
});

test('createEntry with no file, and linkEntry, listEntries, and getEntry, do not reach the folder: they resolve on a folder that refuses every read and write (C-007)', async () => {
  const { folder, opened } = await sealedFolder();
  const { body, entry } = await withClock(HELD, () => rr.createEntry(schema.emptyDataBody(), actOf(alice), opened, fieldsOf({ name: 'n', link: 'l', path: 'p' })));
  const linked = await withClock(LATER, () => rr.linkEntry(body, actOf(alice), { entryId: entry.id, ref: refTo('platform', 1) }));
  assert.equal((await rr.listEntries(linked.body)).length, 1);
  assert.notEqual(await rr.getEntry(linked.body, entry.id), null);
  assert.deepEqual([...(await rr.checkEntryFiles(linked.body, opened))], [{ entryId: entry.id, location: null, flagged: false, reason: null }], 'an entry with no file asks nothing of the folder');
  assert.deepEqual(folder.list(), []);
});

test('no operation reads or writes the browser\'s storage (C-007)', async () => {
  const { folder, opened } = await openFolder();
  const { uses } = await withBrowserStorageSpies(async () => {
    const { body, entry } = await withClock(HELD, () => rr.createEntry(schema.emptyDataBody(), actOf(alice), opened, fieldsOf({ name: 'n', file: incomingFile('f.pdf', [1]) })));
    const { body: b } = await withClock(LATER, () => rr.linkEntry(body, actOf(alice), { entryId: entry.id, ref: refTo('hazard', 1) }));
    await rr.listEntries(b);
    await rr.getEntry(b, entry.id);
    folder.remove(/** @type {string} */ (entry.fileLocation));
    await rr.checkEntryFiles(b, opened);
  });
  assert.deepEqual(uses, []);
});

// ------------------------------------------------------------------ the flag (C-010)

test('a file that cannot be opened is flagged inaccessible, a location that is not a stored-file location is flagged so, and a files/ folder that has gone flags every file missing; none rejects (C-010; store C-019)', async () => {
  const { folder, opened } = await openFolder();
  const a = await withClock(HELD, () => rr.createEntry(schema.emptyDataBody(), actOf(alice), opened, fieldsOf({ file: incomingFile('a.pdf', [1]) })));
  const b = await withClock(LATER, () => rr.createEntry(a.body, actOf(alice), opened, fieldsOf({ file: incomingFile('b.pdf', [2]) })));
  const locA = /** @type {string} */ (a.entry.fileLocation);
  const locB = /** @type {string} */ (b.entry.fileLocation);
  folder.denyRead((rel) => rel === locA);
  assert.deepEqual([...(await rr.checkEntryFiles(b.body, opened))], [
    { entryId: a.entry.id, location: locA, flagged: true, reason: 'inaccessible' },
    { entryId: b.entry.id, location: locB, flagged: false, reason: null },
  ]);
  folder.denyRead(() => false);

  const odd = entryRow(orderedUuid(1), alice, { name: 'typed by hand', fileLocation: 'C:\\Evidence\\a.pdf', at: /** @type {any} */ ('2027-01-01T00:00:00+10:00') });
  const withOdd = /** @type {any} */ (snapshot(b.body));
  withOdd.collections[KIND][odd.id] = odd;
  assert.deepEqual((await rr.checkEntryFiles(withOdd, opened)).at(-1), { entryId: odd.id, location: 'C:\\Evidence\\a.pdf', flagged: true, reason: 'not-a-stored-file-location' });

  folder.remove(FILES);
  assert.deepEqual([...(await rr.checkEntryFiles(b.body, opened))].map((s) => [s.flagged, s.reason]), [[true, 'missing'], [true, 'missing']]);
});

test('a deleted entry whose file has gone is not in checkEntryFiles; the result follows listEntries (C-010)', async () => {
  const { folder, opened } = await openFolder();
  const { entry } = await withClock(HELD, () => rr.createEntry(schema.emptyDataBody(), actOf(alice), opened, fieldsOf({ file: incomingFile('a.pdf', [1]) })));
  const body = bodyOf([{ ...entry, status: 'deleted' }, entryRow(orderedUuid(1), alice)]);
  folder.remove(/** @type {string} */ (entry.fileLocation));
  assert.deepEqual([...(await rr.checkEntryFiles(body, opened))], [{ entryId: orderedUuid(1), location: null, flagged: false, reason: null }]);
});

test('an entry\'s path is never part of the flag: an entry with only a path that exists nowhere is not flagged (C-010; DEC-022)', async () => {
  const { opened } = await openFolder();
  const { body, entry } = await withClock(HELD, () => rr.createEntry(schema.emptyDataBody(), actOf(alice), opened, fieldsOf({ path: 'Z:\\does\\not\\exist.pdf' })));
  assert.deepEqual([...(await rr.checkEntryFiles(body, opened))], [{ entryId: entry.id, location: null, flagged: false, reason: null }]);
});

// ------------------------------------------------------------------ links (C-008, C-009)

test('two refs sharing an id string across two kinds are two links (C-008)', async () => {
  const id = orderedUuid(5, 0xb);
  let body = bodyOf([entryRow(orderedUuid(1), alice)]);
  for (const kind of /** @type {const} */ (['platform', 'control'])) {
    ({ body } = await withClock(HELD, () => rr.linkEntry(body, actOf(alice), { entryId: /** @type {any} */ (orderedUuid(1)), ref: { kind, id } })));
  }
  assert.deepEqual([.../** @type {any} */ (await rr.getEntry(body, /** @type {any} */ (orderedUuid(1)))).links], [{ kind: 'control', id }, { kind: 'platform', id }]);
});

test('ids are ordered as strings within a kind: H-10000 before H-9999, and a hazard before a platform (C-008)', async () => {
  let body = bodyOf([entryRow(orderedUuid(1), alice)]);
  for (const ref of [{ kind: 'platform', id: orderedUuid(1, 0xb) }, { kind: 'hazard', id: 'H-9999' }, { kind: 'hazard', id: 'H-10000' }]) {
    ({ body } = await withClock(HELD, () => rr.linkEntry(body, actOf(alice), { entryId: /** @type {any} */ (orderedUuid(1)), ref: /** @type {any} */ (ref) })));
  }
  assert.deepEqual([.../** @type {any} */ (await rr.getEntry(body, /** @type {any} */ (orderedUuid(1)))).links].map((r) => r.id), ['H-10000', 'H-9999', orderedUuid(1, 0xb)]);
});

test('an entry linked to many records keeps every ref once, in order, and an entry with no links is not an error (C-008, C-009, section 5)', async () => {
  let body = bodyOf([entryRow(orderedUuid(1), alice), entryRow(orderedUuid(2), alice)]);
  const refs = [];
  for (let n = 60; n > 0; n -= 1) refs.push(refTo(/** @type {any} */ (['hazard', 'control', 'report'][n % 3]), n));
  for (const ref of refs) ({ body } = await withClock(HELD, () => rr.linkEntry(body, actOf(alice), { entryId: /** @type {any} */ (orderedUuid(1)), ref })));
  const [many, none] = await rr.listEntries(body);
  assert.equal(many.links.length, 60);
  assert.deepEqual([...many.links], [...refs].sort((a, b) => (a.kind !== b.kind ? (a.kind < b.kind ? -1 : 1) : a.id < b.id ? -1 : 1)));
  assert.deepEqual([...none.links], []);
});

// ------------------------------------------------------------------ the act (C-011)

test('an empty affectedPlatformIds is passed through as given: the act is recorded and awaits no platform (C-011, section 5)', async () => {
  const { opened } = await openFolder();
  const { body } = await withClock(HELD, () => rr.createEntry(schema.emptyDataBody(), actOf(alice, platformNo(1), []), opened, fieldsOf({ name: 'n' })));
  const [logged] = await changeLog.listEntries(body);
  assert.deepEqual([.../** @type {any} */ (logged).affectedPlatformIds], []);
  assert.equal(/** @type {any} */ (logged).madeForPlatformId, platformNo(1));
  for (const p of [platformNo(1), platformNo(2)]) assert.deepEqual([...(await changeLog.listAwaiting(body, p))], []);
});

test('collections of kinds this module does not own are carried through untouched however they are shaped (C-002)', async () => {
  const { opened } = await openFolder();
  const foreign = { hazard: { junk: [1, { deep: true }] }, 'review-schedule': 'not even a map', control: {} };
  const body = bodyOf([entryRow(orderedUuid(1), alice)], snapshot(foreign));
  const created = await withClock(HELD, () => rr.createEntry(body, actOf(alice), opened, fieldsOf({ name: 'n' })));
  const linked = await withClock(LATER, () => rr.linkEntry(created.body, actOf(alice), { entryId: /** @type {any} */ (orderedUuid(1)), ref: refTo('report', 1) }));
  for (const [name, value] of Object.entries(foreign)) {
    assert.deepEqual(/** @type {any} */ (linked.body.collections)[name], value, `${name} carried through`);
  }
  assert.deepEqual(linked.body.sequences, body.sequences, 'sequences untouched');
});
