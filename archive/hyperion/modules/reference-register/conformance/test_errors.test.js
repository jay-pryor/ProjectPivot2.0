/**
 * reference-register conformance: errors (CORE-CON-002). Every row of section 4 of
 * modules/reference-register/CONTRACT.md, each asserting the named error class, what it carries
 * where the row names it, that the body passed in is unchanged, and, for `createEntry`, that no
 * file was written; then the order section 4 gives when two conditions hold at once, using only
 * pairs whose order the contract states. Written from the contract before any implementation (P8).
 *
 * The null double must fail this file (CORE-TST-002, rung 1).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as rr from '../contract.js';
import {
  FILES, HELD, UNLINKABLE_KINDS, actOf, assertRefused, bodyOf, changeLog, entryRow, fieldsOf, incomingFile, malformedLog, newProfile,
  openFolder, orderedUuid, platformNo, refTo, schema, store, storedFiles, withClock,
} from './harness.js';

/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */

const alice = newProfile('Alice');
const GOOD = orderedUuid(1);

/**
 * Every operation of section 2, called with well-formed arguments on `body`; `createEntry`
 * carries a file, so a call that wrote one before rejecting is seen.
 * @param {DataBody} body
 * @param {import('../../store/contract.js').DataStore} opened
 * @returns {[string, () => Promise<unknown>][]}
 */
function everyOperation(body, opened) {
  return [
    ['createEntry', () => withClock(HELD, () => rr.createEntry(body, actOf(alice), opened, fieldsOf({ name: 'n', file: incomingFile('f.pdf', [1, 2]) })))],
    ['linkEntry', () => withClock(HELD, () => rr.linkEntry(body, actOf(alice), { entryId: /** @type {any} */ (GOOD), ref: refTo('hazard', 1) }))],
    ['listEntries', () => rr.listEntries(body)],
    ['getEntry', () => rr.getEntry(body, /** @type {any} */ (GOOD))],
    ['checkEntryFiles', () => rr.checkEntryFiles(body, opened)],
  ];
}

// ------------------------------------------------------------------ malformed entry (C-006)

/** @type {[string, (e: any) => void, string?][]} each way C-006 names an entry malformed, applied to a well-formed one */
const MALFORMATIONS = [
  ['its key differs from its id', () => {}, orderedUuid(99)],
  ['its id is not a ReferenceEntryId', (e) => { e.id = 'RE-1'; }, 'RE-1'],
  ['its kind is not reference-entry', (e) => { e.kind = 'report'; }],
  ['its status is not a RecordStatus', (e) => { e.status = 'archived'; }],
  ['createdBy is not a user profile id', (e) => { e.createdBy = 'alice'; }],
  ['updatedBy is not a user profile id', (e) => { e.updatedBy = null; }],
  ['createdAtAest is not a TimestampAest', (e) => { e.createdAtAest = '2026-01-05T08:00:00Z'; }],
  ['updatedAtAest is not a TimestampAest', (e) => { e.updatedAtAest = '2026-01-05'; }],
  ['its name is absent', (e) => { delete e.name; }],
  ['its name is neither a string nor null', (e) => { e.name = 42; }],
  ['its link is absent', (e) => { delete e.link; }],
  ['its link is neither a string nor null', (e) => { e.link = { href: 'https://example.org' }; }],
  ['its path is absent', (e) => { delete e.path; }],
  ['its path is neither a string nor null', (e) => { e.path = ['C:', 'x']; }],
  ['its fileLocation is absent', (e) => { delete e.fileLocation; }],
  ['its fileLocation is neither a string nor null', (e) => { e.fileLocation = 7; }],
  ['all four content fields are null', (e) => { e.name = null; e.link = null; e.path = null; e.fileLocation = null; }],
  ['its links is absent', (e) => { delete e.links; }],
  ['its links is not a list', (e) => { e.links = { kind: 'hazard', id: 'H-0001' }; }],
  ['its links holds a ref with no id', (e) => { e.links = [{ kind: 'hazard' }]; }],
  ['its links holds a ref whose id is not a string', (e) => { e.links = [{ kind: 'hazard', id: 1 }]; }],
  ['its links holds something that is not a ref', (e) => { e.links = ['H-0001']; }],
  ['its links holds a ref whose kind is not a record kind', (e) => { e.links = [{ kind: 'widget', id: 'W-1' }]; }],
  ['its links holds a ref of a kind outside LINKABLE_KINDS', (e) => { e.links = [{ kind: 'rating', id: orderedUuid(3) }]; }],
];

test('every operation rejects with MalformedEntryError naming the key, for each way C-006 names an entry malformed, even when the call is about another entry; the body is unchanged and no file is written (C-006, section 4)', async () => {
  for (const [how, spoil, keyOverride] of MALFORMATIONS) {
    const bad = /** @type {any} */ (structuredClone(entryRow(orderedUuid(2), alice, { name: 'bad' })));
    spoil(bad);
    const key = keyOverride ?? bad.id ?? orderedUuid(2);
    const body = bodyOf([entryRow(GOOD, alice)]);
    /** @type {any} */ (body.collections)['reference-entry'][key] = bad;
    const { folder, opened } = await openFolder();
    for (const [name, call] of everyOperation(body, opened)) {
      const e = await assertRefused(call, rr.MalformedEntryError, body, `${name} when an entry's ${how}`, folder);
      assert.equal(e.key, key, `${name} when an entry's ${how}: names the entry's key`);
    }
  }
});

test('an entry whose status is deleted or retired, and one that holds only a location, are not malformed (C-006)', async () => {
  const body = bodyOf([
    entryRow(GOOD, alice),
    entryRow(orderedUuid(2), alice, { status: 'deleted' }),
    entryRow(orderedUuid(3), alice, { status: 'retired' }),
    entryRow(orderedUuid(4), alice, { fileLocation: `${FILES}/anything` }),
  ]);
  assert.deepEqual([...(await rr.listEntries(body))].map((e) => e.id), [GOOD, orderedUuid(4)]);
});

// ------------------------------------------------------------------ the act (C-011)

test('createEntry and linkEntry refuse a missing act, a missing profile, or a profile id that is not a user profile id with MissingProfileError; no file written (section 4)', async () => {
  const body = bodyOf([entryRow(GOOD, alice)]);
  const acts = [undefined, null, { madeForPlatformId: null, affectedPlatformIds: [] }, actOf(/** @type {any} */ ({ name: 'nobody' })), actOf(/** @type {any} */ ({ id: 'alice', name: 'Alice' }))];
  for (const act of acts) {
    const a = /** @type {any} */ (act);
    const { folder, opened } = await openFolder();
    await assertRefused(() => withClock(HELD, () => rr.createEntry(body, a, opened, fieldsOf({ file: incomingFile('f.pdf', [1]) }))), rr.MissingProfileError, body, `createEntry with act ${JSON.stringify(act)}`, folder);
    await assertRefused(() => withClock(HELD, () => rr.linkEntry(body, a, { entryId: /** @type {any} */ (GOOD), ref: refTo('hazard', 1) })), rr.MissingProfileError, body, `linkEntry with act ${JSON.stringify(act)}`);
  }
});

test('createEntry and linkEntry refuse an act whose platform fields are absent or not platform ids with InvalidActError; neither is defaulted; no file written (section 4, C-011; DEC-016, DEC-020)', async () => {
  const body = bodyOf([entryRow(GOOD, alice)]);
  const acts = [
    { profile: alice, affectedPlatformIds: [] },
    { profile: alice, madeForPlatformId: undefined, affectedPlatformIds: [] },
    { profile: alice, madeForPlatformId: 'platform one', affectedPlatformIds: [] },
    { profile: alice, madeForPlatformId: null },
    { profile: alice, madeForPlatformId: null, affectedPlatformIds: undefined },
    { profile: alice, madeForPlatformId: null, affectedPlatformIds: platformNo(1) },
    { profile: alice, madeForPlatformId: null, affectedPlatformIds: [platformNo(1), 'not a platform'] },
    { profile: alice, madeForPlatformId: null, affectedPlatformIds: [null] },
  ];
  for (const act of acts) {
    const a = /** @type {any} */ (act);
    const { folder, opened } = await openFolder();
    await assertRefused(() => withClock(HELD, () => rr.createEntry(body, a, opened, fieldsOf({ file: incomingFile('f.pdf', [1]) }))), rr.InvalidActError, body, `createEntry with act ${JSON.stringify(act)}`, folder);
    await assertRefused(() => withClock(HELD, () => rr.linkEntry(body, a, { entryId: /** @type {any} */ (GOOD), ref: refTo('hazard', 1) })), rr.InvalidActError, body, `linkEntry with act ${JSON.stringify(act)}`);
  }
});

// ------------------------------------------------------------------ the fields (C-001)

test('createEntry refuses a name, link, or path given but empty once trimmed with InvalidFieldError naming it; no file written (C-001, section 4)', async () => {
  const body = schema.emptyDataBody();
  for (const field of /** @type {const} */ (['name', 'link', 'path'])) {
    for (const blank of ['', ' ', '\t\n ']) {
      const { folder, opened } = await openFolder();
      const given = fieldsOf({ name: 'kept', file: incomingFile('f.pdf', [1]), [field]: blank });
      const e = await assertRefused(() => withClock(HELD, () => rr.createEntry(body, actOf(alice), opened, given)), rr.InvalidFieldError, body, `a blank ${field} ${JSON.stringify(blank)}`, folder);
      assert.equal(e.field, field, `a blank ${field}: names the field`);
    }
  }
});

test('createEntry with all four absent is refused with EmptyEntryError; nothing written (C-001, section 4)', async () => {
  const body = schema.emptyDataBody();
  const { folder, opened } = await openFolder();
  await assertRefused(() => withClock(HELD, () => rr.createEntry(body, actOf(alice), opened, fieldsOf())), rr.EmptyEntryError, body, 'createEntry with none of the four', folder);
  assert.deepEqual(folder.list(), []);
});

// ------------------------------------------------------------------ the history and the file (C-004)

test('createEntry refuses with change-log\'s MalformedEntryError when the history cannot be read, before any file is written (C-004, section 4)', async () => {
  const body = bodyOf([], { 'change-log-entry': malformedLog(alice) });
  for (const given of [fieldsOf({ name: 'n' }), fieldsOf({ file: incomingFile('f.pdf', [1, 2, 3]) })]) {
    const { folder, opened } = await openFolder();
    const e = await assertRefused(() => withClock(HELD, () => rr.createEntry(body, actOf(alice), opened, given)), changeLog.MalformedEntryError, body, 'createEntry on an unreadable history', folder);
    assert.ok(!(e instanceof rr.MalformedEntryError), 'the error is change-log\'s, unchanged, not this module\'s');
    assert.deepEqual(storedFiles(folder), [], 'no file under files/');
  }
});

test('createEntry passes on store\'s StoreWriteError at stage stored-file when putStoredFile rejects a malformed file or a write that did not complete; no file left, no entry created (C-004, section 4; store C-018)', async () => {
  const body = schema.emptyDataBody();
  {
    const { folder, opened } = await openFolder();
    const e = await assertRefused(() => withClock(HELD, () => rr.createEntry(body, actOf(alice), opened, fieldsOf({ name: 'n', file: incomingFile('', [1]) }))), store.StoreWriteError, body, 'a file with an empty name', folder);
    assert.equal(e.stage, 'stored-file');
  }
  {
    const { folder, opened } = await openFolder();
    const e = await assertRefused(() => withClock(HELD, () => rr.createEntry(body, actOf(alice), opened, fieldsOf({ file: /** @type {any} */ ({ name: 'x.pdf', bytes: [1, 2] }) }))), store.StoreWriteError, body, 'a file whose bytes are not a Uint8Array', folder);
    assert.equal(e.stage, 'stored-file');
  }
  {
    const { folder, opened } = await openFolder();
    folder.failWrite((rel) => rel.startsWith(`${FILES}/`));
    const e = await assertRefused(() => withClock(HELD, () => rr.createEntry(body, actOf(alice), opened, fieldsOf({ name: 'n', file: incomingFile('f.pdf', [1, 2]) }))), store.StoreWriteError, body, 'a write under files/ that did not complete');
    assert.equal(e.stage, 'stored-file');
    assert.deepEqual(storedFiles(folder), [], 'no file left under files/');
  }
});

// ------------------------------------------------------------------ linking (C-008)

test('linkEntry for an id no entry has, on an empty body and on one with entries, is refused with UnknownEntryError (section 4)', async () => {
  for (const body of [schema.emptyDataBody(), bodyOf([entryRow(GOOD, alice)])]) {
    await assertRefused(() => withClock(HELD, () => rr.linkEntry(body, actOf(alice), { entryId: /** @type {any} */ (orderedUuid(50)), ref: refTo('hazard', 1) })), rr.UnknownEntryError, body, 'linkEntry for an unknown entry');
  }
});

test('linkEntry on a deleted or retired entry is refused with EntryNotLiveError carrying the status (section 4)', async () => {
  for (const status of /** @type {const} */ (['deleted', 'retired'])) {
    const body = bodyOf([entryRow(GOOD, alice, { status })]);
    const e = await assertRefused(() => withClock(HELD, () => rr.linkEntry(body, actOf(alice), { entryId: /** @type {any} */ (GOOD), ref: refTo('hazard', 1) })), rr.EntryNotLiveError, body, `linkEntry on a ${status} entry`);
    assert.equal(e.status, status);
  }
});

test('linkEntry refuses a ref that is not a record kind and an id together with InvalidRefError naming the value (section 4)', async () => {
  const body = bodyOf([entryRow(GOOD, alice)]);
  for (const bad of [undefined, null, 'H-0001', {}, { kind: 'hazard' }, { id: 'H-0001' }, { kind: 'hazard', id: 1 }, { kind: 'widget', id: 'W-1' }, { kind: 7, id: 'H-0001' }]) {
    const e = await assertRefused(() => withClock(HELD, () => rr.linkEntry(body, actOf(alice), { entryId: /** @type {any} */ (GOOD), ref: /** @type {any} */ (bad) })), rr.InvalidRefError, body, `linkEntry with ref ${JSON.stringify(bad)}`);
    assert.deepEqual(e.given, bad, `ref ${JSON.stringify(bad)}: names the value`);
  }
});

test('linkEntry refuses a ref of every record kind outside the six with UnlinkableKindError carrying the kind (C-008, section 4)', async () => {
  const body = bodyOf([entryRow(GOOD, alice)]);
  for (const kind of UNLINKABLE_KINDS) {
    const e = await assertRefused(() => withClock(HELD, () => rr.linkEntry(body, actOf(alice), { entryId: /** @type {any} */ (GOOD), ref: { kind, id: orderedUuid(5) } })), rr.UnlinkableKindError, body, `linkEntry to a ${kind}`);
    assert.equal(e.kind, kind);
  }
});

test('linkEntry to a ref the entry already holds is refused with DuplicateLinkError carrying the ref; one link, one history entry (C-008, section 4)', async () => {
  const ref = refTo('control', 3);
  const body = bodyOf([entryRow(GOOD, alice, { links: [refTo('hazard', 1), ref] })]);
  const e = await assertRefused(() => withClock(HELD, () => rr.linkEntry(body, actOf(alice), { entryId: /** @type {any} */ (GOOD), ref: { kind: 'control', id: ref.id } })), rr.DuplicateLinkError, body, 'a second link to the same ref');
  assert.deepEqual(e.ref, ref);
});

test('linkEntry passes on change-log\'s rejection unchanged and stores nothing (section 4, C-011)', async () => {
  const body = bodyOf([entryRow(GOOD, alice)], { 'change-log-entry': malformedLog(alice) });
  const e = await assertRefused(() => withClock(HELD, () => rr.linkEntry(body, actOf(alice), { entryId: /** @type {any} */ (GOOD), ref: refTo('hazard', 1) })), changeLog.MalformedEntryError, body, 'linkEntry on an unreadable history');
  assert.ok(!(e instanceof rr.MalformedEntryError), 'the error is change-log\'s, unchanged');
});

// ------------------------------------------------------------------ the folder (C-010)

test('checkEntryFiles rejects with store\'s StoreReadError reason inaccessible when the data folder itself cannot be read, and writes nothing (section 4, C-010)', async () => {
  const { folder, opened } = await openFolder();
  const { body } = await withClock(HELD, () => rr.createEntry(schema.emptyDataBody(), actOf(alice), opened, fieldsOf({ file: incomingFile('f.pdf', [1]) })));
  folder.denyRead(() => true);
  const e = await assertRefused(() => rr.checkEntryFiles(body, opened), store.StoreReadError, body, 'checkEntryFiles on an unreadable folder', folder);
  assert.equal(e.reason, 'inaccessible');
});

// ------------------------------------------------------------------ which fires first (section 4)

test('the order section 4 gives, pair by pair, for createEntry: malformed entry, missing profile, ill-formed act, blank field, none of the four, unreadable history, store\'s rejection; no file written whichever fires', async () => {
  const spoilt = /** @type {any} */ (entryRow(orderedUuid(2), alice));
  spoilt.links = 'nope';
  const withSpoilt = bodyOf([entryRow(GOOD, alice), spoilt]);
  const noProfile = /** @type {any} */ ({ madeForPlatformId: 'bad', affectedPlatformIds: 'bad' });
  const badAct = /** @type {any} */ ({ profile: alice, madeForPlatformId: 'bad', affectedPlatformIds: [] });
  const logBody = bodyOf([], { 'change-log-entry': malformedLog(alice) });
  const empty = schema.emptyDataBody();
  const badFile = incomingFile('', [1]);

  /** @type {[string, DataBody, any, any, Function][]} */
  const cases = [
    ['malformed entry before missing profile', withSpoilt, noProfile, fieldsOf({ name: 'n' }), rr.MalformedEntryError],
    ['malformed entry before a blank field', withSpoilt, actOf(alice), fieldsOf({ name: ' ' }), rr.MalformedEntryError],
    ['missing profile before an ill-formed act', empty, noProfile, fieldsOf({ name: 'n' }), rr.MissingProfileError],
    ['missing profile before none of the four', empty, /** @type {any} */ (null), fieldsOf(), rr.MissingProfileError],
    ['ill-formed act before a blank field', empty, badAct, fieldsOf({ path: '' }), rr.InvalidActError],
    ['ill-formed act before an unreadable history', logBody, badAct, fieldsOf({ name: 'n' }), rr.InvalidActError],
    ['a blank field before none of the four: a blank name and nothing else', empty, actOf(alice), fieldsOf({ name: '  ' }), rr.InvalidFieldError],
    ['a blank field before an unreadable history', logBody, actOf(alice), fieldsOf({ link: '' }), rr.InvalidFieldError],
    ['a blank field before store\'s rejection', empty, actOf(alice), fieldsOf({ name: '', file: badFile }), rr.InvalidFieldError],
    ['none of the four before an unreadable history', logBody, actOf(alice), fieldsOf(), rr.EmptyEntryError],
    ['an unreadable history before store\'s rejection', logBody, actOf(alice), fieldsOf({ file: badFile }), changeLog.MalformedEntryError],
  ];
  for (const [what, body, act, given, type] of cases) {
    const { folder, opened } = await openFolder();
    await assertRefused(() => withClock(HELD, () => rr.createEntry(body, act, opened, given)), type, body, what, folder);
  }
  const blankName = await rejectionOf2(fieldsOf({ name: '', link: ' ' }));
  assert.equal(blankName.field, 'name', 'name is named before link');
  const blankLink = await rejectionOf2(fieldsOf({ link: '', path: '\t' }));
  assert.equal(blankLink.field, 'link', 'link is named before path');
});

/**
 * The InvalidFieldError createEntry gives for these fields on an empty body.
 * @param {any} given
 * @returns {Promise<any>}
 */
async function rejectionOf2(given) {
  const body = schema.emptyDataBody();
  const { folder, opened } = await openFolder();
  return assertRefused(() => withClock(HELD, () => rr.createEntry(body, actOf(alice), opened, given)), rr.InvalidFieldError, body, `blank fields ${JSON.stringify(given)}`, folder);
}

test('the order section 4 gives, pair by pair, for linkEntry: malformed entry, missing profile, ill-formed act, unknown entry, not live, ill-formed ref, unlinkable kind, duplicate link, and last change-log\'s rejection', async () => {
  const good = entryRow(GOOD, alice, { links: [refTo('hazard', 1)] });
  const deleted = entryRow(GOOD, alice, { status: 'deleted', links: [refTo('hazard', 1)] });
  const spoilt = /** @type {any} */ (entryRow(orderedUuid(2), alice));
  spoilt.kind = 'hazard';
  const withSpoilt = bodyOf([good, spoilt]);
  const noProfile = /** @type {any} */ ({ madeForPlatformId: 'bad', affectedPlatformIds: 'bad' });
  const badAct = /** @type {any} */ ({ profile: alice, madeForPlatformId: null, affectedPlatformIds: ['bad'] });
  const log = { 'change-log-entry': malformedLog(alice) };
  const id = /** @type {any} */ (GOOD);
  const unknown = /** @type {any} */ (orderedUuid(77));

  /** @type {[string, DataBody, any, any, Function][]} */
  const cases = [
    ['malformed entry before missing profile', withSpoilt, noProfile, { entryId: id, ref: refTo('hazard', 2) }, rr.MalformedEntryError],
    ['malformed entry before an unknown entry', withSpoilt, actOf(alice), { entryId: unknown, ref: refTo('hazard', 2) }, rr.MalformedEntryError],
    ['missing profile before an ill-formed act', bodyOf([good]), noProfile, { entryId: id, ref: refTo('hazard', 2) }, rr.MissingProfileError],
    ['missing profile before an unknown entry', bodyOf([good]), noProfile, { entryId: unknown, ref: refTo('hazard', 2) }, rr.MissingProfileError],
    ['ill-formed act before an unknown entry', bodyOf([good]), badAct, { entryId: unknown, ref: refTo('hazard', 2) }, rr.InvalidActError],
    ['ill-formed act before an ill-formed ref', bodyOf([good]), badAct, { entryId: id, ref: { kind: 'hazard' } }, rr.InvalidActError],
    ['unknown entry before an ill-formed ref', bodyOf([good]), actOf(alice), { entryId: unknown, ref: null }, rr.UnknownEntryError],
    ['unknown entry before an unlinkable kind', bodyOf([good]), actOf(alice), { entryId: unknown, ref: { kind: 'rating', id: orderedUuid(3) } }, rr.UnknownEntryError],
    ['not live before an ill-formed ref', bodyOf([deleted]), actOf(alice), { entryId: id, ref: { id: 'x' } }, rr.EntryNotLiveError],
    ['not live before an unlinkable kind', bodyOf([deleted]), actOf(alice), { entryId: id, ref: { kind: 'link', id: orderedUuid(3) } }, rr.EntryNotLiveError],
    ['not live before a duplicate link', bodyOf([deleted]), actOf(alice), { entryId: id, ref: refTo('hazard', 1) }, rr.EntryNotLiveError],
    ['not live before change-log\'s rejection', bodyOf([deleted], log), actOf(alice), { entryId: id, ref: refTo('hazard', 2) }, rr.EntryNotLiveError],
    ['an unlinkable kind before change-log\'s rejection', bodyOf([good], log), actOf(alice), { entryId: id, ref: { kind: 'user-profile', id: orderedUuid(3) } }, rr.UnlinkableKindError],
    ['a duplicate link before change-log\'s rejection', bodyOf([good], log), actOf(alice), { entryId: id, ref: refTo('hazard', 1) }, rr.DuplicateLinkError],
    ['an unknown entry before change-log\'s rejection', bodyOf([good], log), actOf(alice), { entryId: unknown, ref: refTo('hazard', 2) }, rr.UnknownEntryError],
  ];
  for (const [what, body, act, fields, type] of cases) {
    await assertRefused(() => withClock(HELD, () => rr.linkEntry(body, act, fields)), type, body, what);
  }
});
