/**
 * Test support for the reference-register conformance suite (CORE-CON-002). Not a test file:
 * the runner collects `*.test.js` only.
 *
 * Section 2 of modules/reference-register/CONTRACT.md: a conformance test starts from
 * `schema.emptyDataBody()` or a body it builds, holds the baseline clock where a clause names
 * it, and opens a `DataStore` on `store`'s in-memory folder through
 * `modules/store/conformance/harness` rather than writing a second one. The refs it links are
 * `RecordRef` values built here, and the entries its acts wrote are read back through
 * `change-log`'s own contract and never from `collections['change-log-entry']` directly. So
 * this file imports only what modules/reference-register/manifest.yaml declares
 * (CORE-CON-003, `declared`): baseline/types, baseline/schema, baseline/clock,
 * modules/change-log/contract, modules/store/contract, and, from test code alone,
 * modules/store/conformance/harness.
 *
 * That manifest does not list baseline/faults, so a `putStoredFile` that does not complete is
 * forced through the folder itself (`MemoryFolder.failWrite` under `files/`), which section 4
 * of store 3.0 names as the same rejection an armed fault point gives.
 *
 * "store.putStoredFile was called exactly once / not at all" (C-003, C-007) is observed where
 * that call leaves a trace: the files under `files/`, compared before and after. A call that
 * must not reach the folder is also run on a folder that refuses every read and write, so a
 * call that reached it would reject.
 *
 * Provides: profiles, platform ids, refs of each linkable kind, and ids chosen to sort in a
 * known order; entries and bodies built directly, so a malformed or deleted entry and an
 * ordering by id can be tested without assuming what `fresh` returns (DEC-005); an open store
 * on an in-memory folder; the C-011 check that an act wrote its one entry; the "body is a
 * value" helpers of C-002; a seeded generator (CORE-TST-001: the seed is fixed and recorded);
 * and a spy on the browser's storage for C-007.
 */

import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

import { fixClock, releaseClock } from '../../../baseline/clock.js';
import * as schema from '../../../baseline/schema.js';
import { RECORD_KINDS, platformId, referenceEntryId, timestampAest, userProfileId } from '../../../baseline/types.js';
import * as changeLog from '../../change-log/contract.js';
import * as store from '../../store/contract.js';
import { AWKWARD_FILE_NAMES, MemoryFolder, incomingFile } from '../../store/conformance/harness.js';

/** @typedef {import('../../../baseline/types.js').ActiveProfile} ActiveProfile */
/** @typedef {import('../../../baseline/types.js').PlatformId} PlatformId */
/** @typedef {import('../../../baseline/types.js').RecordKind} RecordKind */
/** @typedef {import('../../../baseline/types.js').RecordRef} RecordRef */
/** @typedef {import('../../../baseline/types.js').RecordStatus} RecordStatus */
/** @typedef {import('../../../baseline/types.js').TimestampAest} TimestampAest */
/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */
/** @typedef {import('../../store/contract.js').DataStore} DataStore */
/** @typedef {import('../contract.js').ReferenceEntry} ReferenceEntry */
/** @typedef {import('../contract.js').EntryAct} EntryAct */
/** @typedef {import('../contract.js').EntryFields} EntryFields */
/** @typedef {import('../../change-log/contract.js').ChangeLogEntry} ChangeLogEntry */
/** @typedef {import('../../change-log/contract.js').RecordChangeEntry} RecordChangeEntry */

/** The one seed this suite's property tests use (CORE-TST-001); change it only on purpose, and record why. */
export const SEED = 0x52454652;

export const KIND = /** @type {const} */ ('reference-entry');
export const LOG = /** @type {const} */ ('change-log-entry');
export const FILES = schema.DATA_FOLDER.files;

/** The six kinds C-008 links, written out here rather than read from the contract, so the suite checks the constant too. */
export const SIX_KINDS = Object.freeze(/** @type {RecordKind[]} */ (['hazard', 'causal-factor', 'consequence', 'platform', 'control', 'report']));

/** Every baseline kind C-008 refuses. */
export const UNLINKABLE_KINDS = Object.freeze(RECORD_KINDS.filter((k) => !SIX_KINDS.includes(k)));

/** The four content fields of C-001, in the order section 4 names blanks. */
export const CONTENT_FIELDS = Object.freeze(/** @type {const} */ (['name', 'link', 'path', 'fileLocation']));

/** Every field a `ReferenceEntry` has (section 3), and nothing else (C-003). */
export const ENTRY_FIELDS = Object.freeze([
  'createdAtAest', 'createdBy', 'fileLocation', 'id', 'kind', 'link', 'links', 'name', 'path', 'status', 'updatedAtAest', 'updatedBy',
]);

// ------------------------------------------------------------------ profiles, ids, refs, and time

/**
 * The profile a session acts as, as `views` would pass it on (REQ-055).
 * @param {string} name
 * @returns {ActiveProfile}
 */
export function newProfile(name) {
  return { id: userProfileId.fresh(), name };
}

/**
 * A valid UUID whose string order is the order of `n`, for ids a test needs sorted; `salt`
 * keeps ids of different uses apart.
 * @param {number} n 0 to 2^32 - 1
 * @param {number} [salt] 0 to 15
 * @returns {string}
 */
export function orderedUuid(n, salt = 0) {
  return `${n.toString(16).padStart(8, '0')}-0000-4000-8000-${salt.toString(16).padStart(12, '0')}`;
}

/**
 * A platform id whose order is the order of `n`.
 * @param {number} n
 * @returns {PlatformId}
 */
export function platformNo(n) {
  return platformId.parse(orderedUuid(n, 0xa));
}

/**
 * A ref of one of the kinds, with an id the owning module might give it: `H-nnnn` for a
 * hazard, a UUID for the rest. Nothing here resolves it (C-008).
 * @param {RecordKind} kind
 * @param {number} n
 * @returns {RecordRef}
 */
export function refTo(kind, n) {
  return { kind, id: kind === 'hazard' ? `H-${String(n).padStart(4, '0')}` : orderedUuid(n, 0xb) };
}

/**
 * One act (section 3). Both platform fields are always given, as C-011 requires.
 * @param {ActiveProfile} profile
 * @param {PlatformId | null} [madeFor]
 * @param {PlatformId[]} [affected]
 * @returns {EntryAct}
 */
export function actOf(profile, madeFor = null, affected = []) {
  return { profile, madeForPlatformId: madeFor, affectedPlatformIds: affected };
}

/**
 * The fields of a `createEntry`, every one null unless given.
 * @param {Partial<EntryFields>} [given]
 * @returns {EntryFields}
 */
export function fieldsOf(given = {}) {
  return { name: null, link: null, path: null, file: null, ...given };
}

export { AWKWARD_FILE_NAMES, incomingFile };

/** @type {TimestampAest} a time no test's clock is held at, for entries a body starts with */
export const EARLIER = timestampAest('2026-01-05T08:00:00+10:00');

/** @type {TimestampAest} the time most tests hold the clock at */
export const HELD = timestampAest('2026-09-15T10:30:00+10:00');

/** @type {TimestampAest} a time after HELD, for a later act */
export const LATER = timestampAest('2026-09-16T14:05:09+10:00');

/**
 * Run `fn` with the baseline clock held at `ts`, releasing it after whatever happens.
 * @template T
 * @param {TimestampAest} ts
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withClock(ts, fn) {
  fixClock(ts);
  try {
    return await fn();
  } finally {
    releaseClock();
  }
}

// ------------------------------------------------------------------ the folder

/**
 * A `DataStore` open on a fresh in-memory folder, never loaded: neither file operation needs a
 * load (store C-018, C-019).
 * @returns {Promise<{ folder: MemoryFolder, opened: DataStore }>}
 */
export async function openFolder() {
  const folder = new MemoryFolder();
  const opened = await store.openDataFolder(folder.handle);
  return { folder, opened };
}

/**
 * A `DataStore` whose folder refuses every read and every write once opened: a call that
 * reaches it rejects, so a call that resolves did not.
 * @returns {Promise<{ folder: MemoryFolder, opened: DataStore }>}
 */
export async function sealedFolder() {
  const { folder, opened } = await openFolder();
  folder.denyRead(() => true);
  folder.failWrite(() => true);
  return { folder, opened };
}

/**
 * The files under `files/`.
 * @param {MemoryFolder} folder
 * @returns {string[]}
 */
export function storedFiles(folder) {
  return folder.listUnder(FILES);
}

// ------------------------------------------------------------------ entries and bodies built directly

/**
 * A stored entry, for bodies a test builds rather than creates.
 * @param {string} id
 * @param {ActiveProfile} by
 * @param {{ name?: string | null, link?: string | null, path?: string | null, fileLocation?: string | null,
 *   links?: RecordRef[], status?: RecordStatus, at?: TimestampAest }} [options] a name `Entry <id>` unless another content field or `name` is given
 * @returns {ReferenceEntry}
 */
export function entryRow(id, by, options = {}) {
  const at = options.at ?? EARLIER;
  const anyContent = ['name', 'link', 'path', 'fileLocation'].some((f) => Object.prototype.hasOwnProperty.call(options, f));
  return /** @type {ReferenceEntry} */ (/** @type {unknown} */ ({
    id,
    kind: KIND,
    status: options.status ?? 'live',
    createdBy: by.id,
    createdAtAest: at,
    updatedBy: by.id,
    updatedAtAest: at,
    name: options.name ?? (anyContent ? null : `Entry ${id.slice(0, 8)}`),
    link: options.link ?? null,
    path: options.path ?? null,
    fileLocation: options.fileLocation ?? null,
    links: options.links ?? [],
  }));
}

/**
 * A body holding these entries under their ids, and any other collections as given. No
 * entries gives a body with no reference-entry collection.
 * @param {ReferenceEntry[]} entries
 * @param {Record<string, unknown>} [otherCollections]
 * @returns {DataBody}
 */
export function bodyOf(entries, otherCollections = {}) {
  const collections = /** @type {Record<string, unknown>} */ ({ ...otherCollections });
  if (entries.length > 0) collections[KIND] = Object.fromEntries(entries.map((e) => [e.id, e]));
  return /** @type {DataBody} */ (/** @type {unknown} */ ({ collections, sequences: { hazard: 1 } }));
}

/**
 * The entries of a body's reference-entry collection, whatever their shape. This module's own
 * collection, read directly only to check where and under what key an entry is stored, and what
 * the stored record holds (C-001, C-003).
 * @param {DataBody} body
 * @returns {Record<string, any>}
 */
export function entriesIn(body) {
  return /** @type {Record<string, any>} */ (/** @type {any} */ (body.collections)[KIND] ?? {});
}

/**
 * A change-log entry `change-log` C-008 refuses — a record change with no items — for the
 * history that cannot be read (section 4, C-004).
 * @param {ActiveProfile} by
 * @returns {Record<string, unknown>} the collection holding it, keyed by its id
 */
export function malformedLog(by) {
  const id = orderedUuid(1, 0xe);
  return {
    [id]: {
      id, kind: LOG, status: 'live', createdBy: by.id, createdAtAest: EARLIER, updatedBy: by.id, updatedAtAest: EARLIER,
      entryKind: 'record-change', items: [], madeForPlatformId: null, affectedPlatformIds: [],
    },
  };
}

// ------------------------------------------------------------------ the list model (C-005)

/**
 * @param {ReferenceEntry} a
 * @param {ReferenceEntry} b
 * @returns {number} ascending `createdAtAest`, then id
 */
export function byCreatedThenId(a, b) {
  if (a.createdAtAest !== b.createdAtAest) return a.createdAtAest < b.createdAtAest ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * @param {RecordRef} a
 * @param {RecordRef} b
 * @returns {number} ascending kind, then id, as strings (C-008)
 */
export function byKindThenId(a, b) {
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * @param {DataBody} body
 * @returns {ReferenceEntry[]} what C-005 says `listEntries` gives
 */
export function entriesModel(body) {
  return Object.values(entriesIn(body)).filter((e) => e.status === 'live').sort(byCreatedThenId);
}

// ------------------------------------------------------------------ the body is a value (C-002)

/**
 * A deep copy: what a value was, to compare against after a call.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function snapshot(value) {
  return structuredClone(value);
}

/**
 * The body after a JSON serialise and parse, as `store` C-001 carries it.
 * @param {DataBody} body
 * @returns {DataBody}
 */
export function jsonRoundTrip(body) {
  return JSON.parse(JSON.stringify(body));
}

/**
 * Freeze a value and everything reachable from it, so a mutation throws instead of passing
 * unseen. Used beside, never instead of, the deep-equal check of C-002.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value) && !ArrayBuffer.isView(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/**
 * Where two bodies differ, outside the change-log collection: `collection/key` for an entry
 * added, removed, or changed, the collection's name for a collection that is not a map, and
 * `sequences.name` for a sequence.
 * @param {DataBody} input
 * @param {DataBody} output
 * @returns {string[]}
 */
export function differences(input, output) {
  /** @type {string[]} */
  const out = [];
  const isMap = (/** @type {unknown} */ v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const ic = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (input.collections));
  const oc = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (output.collections ?? {}));
  for (const name of new Set([...Object.keys(ic), ...Object.keys(oc)])) {
    if (name === LOG) continue;
    const a = ic[name];
    const b = oc[name];
    if ((a === undefined || isMap(a)) && (b === undefined || isMap(b))) {
      const am = /** @type {Record<string, unknown>} */ (a ?? {});
      const bm = /** @type {Record<string, unknown>} */ (b ?? {});
      for (const key of new Set([...Object.keys(am), ...Object.keys(bm)])) {
        const inA = Object.prototype.hasOwnProperty.call(am, key);
        const inB = Object.prototype.hasOwnProperty.call(bm, key);
        if (inA !== inB || !isDeepStrictEqual(am[key], bm[key])) out.push(`${name}/${key}`);
      }
    } else if (!isDeepStrictEqual(a, b)) {
      out.push(name);
    }
  }
  const is = /** @type {Record<string, unknown>} */ (input.sequences ?? {});
  const os = /** @type {Record<string, unknown>} */ (output.sequences ?? {});
  for (const name of new Set([...Object.keys(is), ...Object.keys(os)])) if (!isDeepStrictEqual(is[name], os[name])) out.push(`sequences.${name}`);
  return out.sort();
}

// ------------------------------------------------------------------ the entry an act wrote (C-011)

/**
 * The item `change-log` gives for one record handed to it (change-log C-002, C-004, C-005):
 * the action from the status transition; for `edited`, one field change per field whose values
 * differ, for the other three, one per field of either side; ascending by field; never
 * `updatedBy` or `updatedAtAest`.
 * @param {any} before
 * @param {any} after
 * @returns {import('../../change-log/contract.js').ChangedItem}
 */
export function expectedItem(before, after) {
  const action = before === null ? 'created'
    : after.status === 'deleted' && before.status !== 'deleted' ? 'deleted'
      : after.status === 'retired' && before.status !== 'retired' ? 'retired'
        : 'edited';
  const b = before ?? {};
  const names = [...new Set([...Object.keys(b), ...Object.keys(after)])].filter((f) => f !== 'updatedBy' && f !== 'updatedAtAest').sort();
  /** @type {any[]} */
  const fields = [];
  for (const field of names) {
    const inB = Object.prototype.hasOwnProperty.call(b, field);
    const inA = Object.prototype.hasOwnProperty.call(after, field);
    if (action === 'edited' && inB === inA && isDeepStrictEqual(b[field], after[field])) continue;
    fields.push({ field, before: inB ? b[field] : null, after: inA ? after[field] : null });
  }
  return /** @type {any} */ ({ ref: { kind: after.kind, id: after.id }, action, fields });
}

/**
 * The entries of `output` that `input` did not hold, read through `change-log`'s contract
 * (section 2), after checking every entry `input` held is still there as it was.
 * @param {DataBody} input
 * @param {DataBody} output
 * @param {string} what
 * @returns {Promise<ChangeLogEntry[]>}
 */
export async function addedEntries(input, output, what) {
  const had = [...(await changeLog.listEntries(input))];
  const has = [...(await changeLog.listEntries(output))];
  for (const e of had) assert.deepEqual(has.find((x) => x.id === e.id), e, `${what}: entry ${e.id} is still in the log as it was`);
  return has.filter((e) => !had.some((x) => x.id === e.id));
}

/**
 * Check C-011 for one resolved changing call: `output` holds exactly one entry `input` did
 * not, stamped with the act's profile and `at`, whose one item is `before` to `after`, and
 * whose platform fields are the act's (the list as `change-log` C-001 keeps it: duplicates
 * removed, ascending). Returns the entry.
 * @param {DataBody} input
 * @param {DataBody} output
 * @param {{ act: EntryAct, at: TimestampAest, before: ReferenceEntry | null, after: ReferenceEntry, what?: string }} expected
 * @returns {Promise<RecordChangeEntry>}
 */
export async function assertRecorded(input, output, expected) {
  const what = expected.what ?? 'the act';
  const added = await addedEntries(input, output, what);
  assert.equal(added.length, 1, `${what}: exactly one entry is added to the log (C-011), got ${added.length}`);
  const entry = /** @type {RecordChangeEntry} */ (added[0]);
  assert.equal(entry.entryKind, 'record-change', `${what}: the entry is a record change`);
  assert.equal(entry.createdBy, expected.act.profile.id, `${what}: the entry is stamped with act.profile`);
  assert.equal(entry.createdAtAest, expected.at, `${what}: the entry is stamped with the clock's now`);
  assert.equal(entry.madeForPlatformId, expected.act.madeForPlatformId, `${what}: madeForPlatformId is act.madeForPlatformId unchanged`);
  assert.deepEqual([...entry.affectedPlatformIds], [...new Set(expected.act.affectedPlatformIds)].sort(), `${what}: affectedPlatformIds is act.affectedPlatformIds, not derived`);
  assert.deepEqual(entry.items, [expectedItem(expected.before, expected.after)], `${what}: the one item is the entry as it was and as it now is`);
  return entry;
}

// ------------------------------------------------------------------ rejections

/**
 * The error a call rejects with; fails the test if it resolves.
 * @param {() => Promise<unknown>} call
 * @param {string} [what]
 * @returns {Promise<any>}
 */
export async function rejectionOf(call, what = 'the call') {
  /** @type {unknown} */
  let error = null;
  let rejected = false;
  await call().then(
    (value) => { throw new Error(`${what} resolved with ${JSON.stringify(value)}; a rejection was expected`); },
    (e) => { error = e; rejected = true; },
  );
  if (!rejected) throw new Error(`${what} did not reject`);
  return error;
}

/**
 * Check that a call rejects with `type`, leaves `body` deep-equal to what it was, and, when a
 * folder is given, leaves every file in it as it was, so no file was written (section 4).
 * @param {() => Promise<unknown>} call
 * @param {Function} type
 * @param {DataBody} body
 * @param {string} what
 * @param {MemoryFolder} [folder]
 * @returns {Promise<any>} the error
 */
export async function assertRefused(call, type, body, what, folder) {
  const before = snapshot(body);
  const files = folder ? folder.snapshot() : null;
  const e = await rejectionOf(call, what);
  assert.ok(e instanceof type, `${what}: rejects with ${type.name}, got ${String(e)}`);
  assert.deepEqual(body, before, `${what}: body unchanged`);
  if (folder) assert.deepEqual(folder.snapshot(), files, `${what}: no file written`);
  return e;
}

// ------------------------------------------------------------------ seeded randomness (CORE-TST-001)

/**
 * mulberry32: small, deterministic, good enough to pick cases with.
 * @param {number} seed
 * @returns {() => number} uniform in [0, 1)
 */
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {() => number} random
 * @param {number} maxExclusive
 * @returns {number}
 */
export function pick(random, maxExclusive) {
  return Math.floor(random() * maxExclusive);
}

/**
 * @template T
 * @param {() => number} random
 * @param {readonly T[]} list
 * @returns {T}
 */
export function oneOf(random, list) {
  return list[pick(random, list.length)];
}

/**
 * Text a user might type, with whitespace around it half the time; never blank once trimmed.
 * @param {() => number} random
 * @param {string} stem
 * @returns {string}
 */
export function randomText(random, stem) {
  const pad = ['', ' ', '  ', '\t', '\n '];
  return `${oneOf(random, pad)}${stem} ${pick(random, 1000)}${oneOf(random, pad)}`;
}

/**
 * Random bytes of a random length, zero included, over every byte value.
 * @param {() => number} random
 * @returns {Uint8Array}
 */
export function randomBytes(random) {
  const length = [0, 1, 7, 300][pick(random, 4)];
  return Uint8Array.from({ length }, () => pick(random, 256));
}

/**
 * Collections of other kinds, as some other module might store them: deliberately not
 * well-formed records, because C-002 promises this module carries them through unread.
 * @param {() => number} random
 * @returns {Record<string, unknown>}
 */
export function foreignCollections(random) {
  /** @type {Record<string, unknown>} */
  const out = {};
  if (random() < 0.7) out.hazard = { 'H-0001': { id: 'H-0001', kind: 'hazard', title: 'no header at all' }, junk: [1, 2, 3] };
  if (random() < 0.5) out.control = {};
  if (random() < 0.3) out['review-schedule'] = 'not even a map';
  return out;
}

// ------------------------------------------------------------------ the browser's storage

/**
 * Run `fn` with `localStorage` and `sessionStorage` present on `globalThis` as spies that
 * record every read and write, for C-007. Node has neither by default; if the runtime ever
 * supplies one, the real object is restored after.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<{ result: T, uses: string[] }>}
 */
export async function withBrowserStorageSpies(fn) {
  /** @type {string[]} */
  const uses = [];
  /** @param {string} which */
  const spy = (which) => ({
    length: 0,
    /** @param {string} _key */
    getItem: (_key) => { uses.push(`${which}.getItem`); return null; },
    /** @param {string} key @param {string} value */
    setItem: (key, value) => { uses.push(`${which}.setItem(${key}=${value})`); },
    /** @param {string} key */
    removeItem: (key) => { uses.push(`${which}.removeItem(${key})`); },
    clear: () => { uses.push(`${which}.clear()`); },
    /** @param {number} _i */
    key: (_i) => null,
  });
  const g = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (globalThis));
  const saved = { localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), sessionStorage: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage') };
  Object.defineProperty(globalThis, 'localStorage', { value: spy('localStorage'), configurable: true, writable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: spy('sessionStorage'), configurable: true, writable: true });
  try {
    const result = await fn();
    return { result, uses };
  } finally {
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete g[name];
    }
  }
}

export { MemoryFolder, changeLog, platformId, referenceEntryId, schema, store };
