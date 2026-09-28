/**
 * Test support for the change-log conformance suite (CORE-CON-002). Not a test file: the
 * runner collects `*.test.js` only.
 *
 * Section 2 of modules/change-log/CONTRACT.md: a conformance test starts from
 * `schema.emptyDataBody()` or a body it builds, holds the baseline clock where a clause
 * names it, and needs no folder and no other module. The records handed to `recordChange`
 * are `StoredRecord` values built here from the baseline header. So this file imports only
 * what modules/change-log/manifest.yaml declares (CORE-CON-003, `declared`): baseline/types,
 * baseline/schema, and baseline/clock.
 *
 * Provides: profiles, platform ids, and ids chosen to sort in a known order; stored records
 * of any kind; entries and bodies built directly, so an ordering by id can be tested without
 * assuming what `fresh` returns (DEC-005); the C-002, C-004, C-005 item model, the C-009 and
 * C-010 list models, used by the property tests; the "body is a value" helpers of C-003; a
 * seeded generator (CORE-TST-001: the seed is fixed and recorded); and a spy on the browser's
 * storage for C-007.
 */

import { fixClock, releaseClock } from '../../../baseline/clock.js';
import * as schema from '../../../baseline/schema.js';
import { changeLogEntryId, platformId, timestampAest, userProfileId } from '../../../baseline/types.js';

/** @typedef {import('../../../baseline/types.js').ActiveProfile} ActiveProfile */
/** @typedef {import('../../../baseline/types.js').PlatformId} PlatformId */
/** @typedef {import('../../../baseline/types.js').RecordKind} RecordKind */
/** @typedef {import('../../../baseline/types.js').RecordRef} RecordRef */
/** @typedef {import('../../../baseline/types.js').RecordStatus} RecordStatus */
/** @typedef {import('../../../baseline/types.js').TimestampAest} TimestampAest */
/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */
/** @typedef {import('../../../baseline/schema.js').StoredRecord} StoredRecord */
/** @typedef {import('../contract.js').ChangeLogEntry} ChangeLogEntry */
/** @typedef {import('../contract.js').RecordChangeEntry} RecordChangeEntry */
/** @typedef {import('../contract.js').AcknowledgementEntry} AcknowledgementEntry */
/** @typedef {import('../contract.js').ChangedItem} ChangedItem */
/** @typedef {import('../contract.js').FieldChange} FieldChange */
/** @typedef {import('../contract.js').RecordBeforeAfter} RecordBeforeAfter */
/** @typedef {import('../contract.js').RecordedChange} RecordedChange */

/** The one seed this suite's property tests use (CORE-TST-001); change it only on purpose, and record why. */
export const SEED = 0x43484c47;

export const LOG = /** @type {const} */ ('change-log-entry');

// ------------------------------------------------------------------ profiles, ids, and time

/**
 * The profile a session acts as, as `views` would pass it on (REQ-055).
 * @param {string} name
 * @returns {ActiveProfile}
 */
export function newProfile(name) {
  return { id: userProfileId.fresh(), name };
}

/** @returns {PlatformId} */
export function newPlatform() {
  return platformId.fresh();
}

/**
 * A valid UUID whose string order is the order of `n`, for ids a test needs sorted: any
 * kind's UUID parser accepts it (version 4, variant 8).
 * @param {number} n 0 to 2^32 - 1
 * @returns {string}
 */
export function orderedUuid(n) {
  return `${n.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;
}

/** @type {TimestampAest} a time no test's clock is held at, for records a body starts with */
export const EARLIER = timestampAest('2026-01-05T08:00:00+10:00');

/** @type {TimestampAest} the time most tests hold the clock at */
export const HELD = timestampAest('2026-09-15T10:30:00+10:00');

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

/**
 * `ts` plus `seconds`, as the clock would format it.
 * @param {TimestampAest} ts
 * @param {number} seconds
 * @returns {TimestampAest}
 */
export function plusSeconds(ts, seconds) {
  const shifted = new Date(Date.parse(ts) + seconds * 1000 + 10 * 60 * 60 * 1000).toISOString();
  return timestampAest(`${shifted.slice(0, 19)}+10:00`);
}

// ------------------------------------------------------------------ records handed to recordChange

/**
 * A stored record of any kind as its owning module might hold it: the baseline header plus
 * `fields`. This module knows no kind, so the fields are whatever the test chooses (C-002).
 * @param {RecordKind} kind
 * @param {string} id
 * @param {ActiveProfile} by
 * @param {Record<string, unknown>} fields
 * @param {{ status?: RecordStatus, at?: TimestampAest, updatedBy?: ActiveProfile, updatedAt?: TimestampAest }} [options]
 * @returns {StoredRecord}
 */
export function storedRecord(kind, id, by, fields, options = {}) {
  const at = options.at ?? EARLIER;
  return /** @type {StoredRecord} */ ({
    id,
    kind,
    status: options.status ?? 'live',
    createdBy: by.id,
    createdAtAest: at,
    updatedBy: (options.updatedBy ?? by).id,
    updatedAtAest: options.updatedAt ?? at,
    ...fields,
  });
}

/**
 * `record` as its owner would hand it over after an edit: `changes` applied, `status` if
 * given, and `updatedBy` and `updatedAtAest` restamped.
 * @param {StoredRecord} record
 * @param {Record<string, unknown>} changes
 * @param {ActiveProfile} by
 * @param {TimestampAest} at
 * @returns {StoredRecord}
 */
export function edited(record, changes, by, at) {
  return /** @type {StoredRecord} */ ({ ...record, ...changes, updatedBy: by.id, updatedAtAest: at });
}

/**
 * @param {StoredRecord} record
 * @returns {RecordRef}
 */
export function refOf(record) {
  return { kind: record.kind, id: record.id };
}

/**
 * One act, as `RecordedChange`.
 * @param {RecordBeforeAfter[]} records
 * @param {PlatformId | null} madeForPlatformId
 * @param {PlatformId[]} affectedPlatformIds
 * @returns {RecordedChange}
 */
export function act(records, madeForPlatformId, affectedPlatformIds) {
  return { records, madeForPlatformId, affectedPlatformIds };
}

// ------------------------------------------------------------------ the item model (C-002, C-004, C-005)

/** Fields C-002 keeps out of every item: the entry's own header holds that fact. */
export const RESTAMP_FIELDS = Object.freeze(['updatedBy', 'updatedAtAest']);

/**
 * The action C-005 derives from a pair.
 * @param {StoredRecord | null} before
 * @param {StoredRecord} after
 * @returns {import('../contract.js').ItemAction}
 */
export function actionOf(before, after) {
  if (before === null) return 'created';
  if (after.status === 'deleted' && before.status !== 'deleted') return 'deleted';
  if (after.status === 'retired' && before.status !== 'retired') return 'retired';
  return 'edited';
}

/**
 * The `ChangedItem` C-002, C-004, and C-005 describe for one pair: for `edited`, one
 * `FieldChange` per field whose values are not deep-equal; for the other three, one per field
 * of either side; a side a field is absent from carries null; ascending by field; never the
 * restamp fields.
 * @param {StoredRecord | null} before
 * @param {StoredRecord} after
 * @returns {ChangedItem}
 */
export function expectedItem(before, after) {
  const action = actionOf(before, after);
  const b = /** @type {Record<string, unknown>} */ (before ?? {});
  const a = /** @type {Record<string, unknown>} */ (after);
  const names = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((f) => !RESTAMP_FIELDS.includes(f)).sort();
  /** @type {FieldChange[]} */
  const fields = [];
  for (const field of names) {
    const inB = Object.prototype.hasOwnProperty.call(b, field);
    const inA = Object.prototype.hasOwnProperty.call(a, field);
    if (action === 'edited' && inB === inA && deepEqual(b[field], a[field])) continue;
    fields.push(/** @type {FieldChange} */ ({ field, before: inB ? b[field] : null, after: inA ? a[field] : null }));
  }
  return { ref: refOf(after), action, fields };
}

/**
 * Structural equality of JSON values: key order is not data, array order is (C-002).
 * @param {unknown} x
 * @param {unknown} y
 * @returns {boolean}
 */
export function deepEqual(x, y) {
  if (x === y) return true;
  if (x === null || y === null || typeof x !== 'object' || typeof y !== 'object') return false;
  if (Array.isArray(x) !== Array.isArray(y)) return false;
  if (Array.isArray(x) && Array.isArray(y)) return x.length === y.length && x.every((v, i) => deepEqual(v, y[i]));
  const xo = /** @type {Record<string, unknown>} */ (x);
  const yo = /** @type {Record<string, unknown>} */ (y);
  const xk = Object.keys(xo);
  return xk.length === Object.keys(yo).length && xk.every((k) => Object.prototype.hasOwnProperty.call(yo, k) && deepEqual(xo[k], yo[k]));
}

/**
 * The entry C-001 describes for one call, but for its id, which is the implementation's.
 * @param {string} id
 * @param {ActiveProfile} by
 * @param {TimestampAest} at
 * @param {RecordedChange} change
 * @returns {RecordChangeEntry}
 */
export function expectedEntry(id, by, at, change) {
  return /** @type {RecordChangeEntry} */ ({
    id,
    kind: LOG,
    status: 'live',
    createdBy: by.id,
    createdAtAest: at,
    updatedBy: by.id,
    updatedAtAest: at,
    entryKind: 'record-change',
    items: change.records.map((r) => expectedItem(r.before, r.after)),
    madeForPlatformId: change.madeForPlatformId,
    affectedPlatformIds: [...new Set(change.affectedPlatformIds)].sort(),
  });
}

// ------------------------------------------------------------------ entries and bodies built directly

/**
 * A stored record-change entry, for bodies a test builds rather than records.
 * @param {string} id
 * @param {ActiveProfile} by
 * @param {TimestampAest} at
 * @param {{ items?: ChangedItem[], madeFor?: PlatformId | null, affected?: PlatformId[], status?: RecordStatus }} [options]
 * @returns {RecordChangeEntry}
 */
export function changeRow(id, by, at, options = {}) {
  return /** @type {RecordChangeEntry} */ ({
    id,
    kind: LOG,
    status: options.status ?? 'live',
    createdBy: by.id,
    createdAtAest: at,
    updatedBy: by.id,
    updatedAtAest: at,
    entryKind: 'record-change',
    items: options.items ?? [{ ref: { kind: 'hazard', id: 'H-0001' }, action: 'edited', fields: [{ field: 'title', before: 'a', after: 'b' }] }],
    madeForPlatformId: options.madeFor ?? null,
    affectedPlatformIds: options.affected ?? [],
  });
}

/**
 * A stored acknowledgement entry, for bodies a test builds.
 * @param {string} id
 * @param {ActiveProfile} by
 * @param {TimestampAest} at
 * @param {string} entryId
 * @param {PlatformId} platform
 * @param {{ status?: RecordStatus }} [options]
 * @returns {AcknowledgementEntry}
 */
export function ackRow(id, by, at, entryId, platform, options = {}) {
  return /** @type {AcknowledgementEntry} */ ({
    id,
    kind: LOG,
    status: options.status ?? 'live',
    createdBy: by.id,
    createdAtAest: at,
    updatedBy: by.id,
    updatedAtAest: at,
    entryKind: 'acknowledgement',
    entryId,
    platformId: platform,
  });
}

/**
 * A body holding these entries under their ids, and any other collections as given. No
 * entries gives a body with no change-log collection.
 * @param {ChangeLogEntry[]} entries
 * @param {Record<string, unknown>} [otherCollections]
 * @returns {DataBody}
 */
export function bodyOf(entries, otherCollections = {}) {
  const collections = /** @type {Record<string, unknown>} */ ({ ...otherCollections });
  if (entries.length > 0) collections[LOG] = Object.fromEntries(entries.map((e) => [e.id, e]));
  return /** @type {DataBody} */ ({ collections, sequences: { hazard: 1 } });
}

/**
 * The entries of a body's change-log collection as the suite reads them, whatever their shape.
 * @param {DataBody} body
 * @returns {Record<string, any>}
 */
export function logEntries(body) {
  return /** @type {Record<string, any>} */ (body.collections[LOG] ?? {});
}

// ------------------------------------------------------------------ the list models (C-009, C-010)

/**
 * @param {ChangeLogEntry} a
 * @param {ChangeLogEntry} b
 * @returns {number} ascending `createdAtAest`, then id
 */
export function byTimeThenId(a, b) {
  if (a.createdAtAest !== b.createdAtAest) return a.createdAtAest < b.createdAtAest ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * @param {DataBody} body
 * @returns {ChangeLogEntry[]} what C-009 says `listEntries` gives
 */
export function entriesModel(body) {
  return Object.values(logEntries(body)).sort(byTimeThenId);
}

/**
 * @param {DataBody} body
 * @param {RecordRef} ref
 * @returns {ChangeLogEntry[]} what C-009 says `listHistory` gives
 */
export function historyModel(body, ref) {
  return entriesModel(body).filter((e) => (ref.kind === LOG
    ? e.entryKind === 'acknowledgement' && e.entryId === ref.id
    : e.entryKind === 'record-change' && e.items.some((i) => deepEqual(i.ref, ref))));
}

/**
 * @param {DataBody} body
 * @param {string} platform
 * @returns {RecordChangeEntry[]} what C-010 says `listAwaiting` gives
 */
export function awaitingModel(body, platform) {
  const all = entriesModel(body);
  const acked = new Set(all
    .filter((e) => e.entryKind === 'acknowledgement' && e.status === 'live' && e.platformId === platform)
    .map((e) => /** @type {AcknowledgementEntry} */ (e).entryId));
  return /** @type {RecordChangeEntry[]} */ (all.filter((e) => e.entryKind === 'record-change'
    && e.affectedPlatformIds.includes(/** @type {PlatformId} */ (platform))
    && e.madeForPlatformId !== platform
    && !acked.has(e.id)));
}

// ------------------------------------------------------------------ the body is a value (C-003)

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
 * unseen. Used beside, never instead of, the deep-equal check of C-003.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/**
 * Everything in a body but the change-log collection, for "differs only by one entry of
 * `collections['change-log-entry']`" (C-003).
 * @param {DataBody} body
 * @returns {unknown}
 */
export function withoutLog(body) {
  const { [LOG]: _log, ...collections } = body.collections;
  const { collections: _c, ...rest } = body;
  return { collections, rest };
}

/**
 * The keys a returned body's change-log collection holds that the input's did not.
 * @param {DataBody} input
 * @param {DataBody} output
 * @returns {string[]}
 */
export function addedKeys(input, output) {
  const had = logEntries(input);
  return Object.keys(logEntries(output)).filter((k) => !Object.prototype.hasOwnProperty.call(had, k));
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

/** Field values as owners store them: strings with padding and scripts, fractions, nulls, arrays, nested objects. */
export const FIELD_VALUES = Object.freeze([
  'loss of control', '  padded  ', '火災', '', 0, 1, 0.1 + 0.2, -3.5, true, false, null,
  ['a', 'b'], ['b', 'a'], [], { level: 2, letter: 'C' }, { letter: 'C', level: 2 }, { nested: { list: [1, [2, null]] } },
]);

/** Field names a record of some kind might have, all lowercase ASCII so their order is not a reading of the contract. */
export const FIELD_NAMES = Object.freeze(['title', 'description', 'level', 'letter', 'tags', 'notes', 'reference', 'ownerprofileid', 'x']);

/** The kinds `recordChange` accepts: every baseline kind but the log's own (C-013). */
export const LOGGABLE_KINDS = Object.freeze(/** @type {RecordKind[]} */ ([
  'hazard', 'control', 'platform', 'causal-factor', 'consequence', 'justification', 'rating',
  'reference-entry', 'review-schedule', 'user-profile', 'workflow-record', 'report', 'report-template', 'link',
]));

/**
 * Collections of other kinds, as some other module might store them: deliberately not
 * well-formed records, because C-003 promises this module carries them through unread.
 * @param {() => number} random
 * @returns {Record<string, unknown>}
 */
export function foreignCollections(random) {
  /** @type {Record<string, unknown>} */
  const out = {};
  if (random() < 0.7) out.hazard = { 'H-0001': { id: 'H-0001', kind: 'hazard', title: 'no header at all' }, junk: [1, 2, 3] };
  if (random() < 0.5) out.platform = {};
  return out;
}

// ------------------------------------------------------------------ the browser's storage

/**
 * Run `fn` with `localStorage` and `sessionStorage` present on `globalThis` as spies that
 * record every read and write, for C-007. Node has neither by default; if the runtime ever supplies
 * one, the real object is restored after.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<{ result: T, uses: string[] }>} what fn returned and every read or write made
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

export { changeLogEntryId, schema };
