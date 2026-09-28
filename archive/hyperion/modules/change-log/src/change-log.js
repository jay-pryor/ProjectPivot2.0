/**
 * change-log, implementing contract version 1.0 (modules/change-log/CONTRACT.md). Selected by
 * contract.js unless CHANGE_LOG_IMPL=null. Clause IDs (C-nnn) cite the contract.
 *
 * Every operation is a function of the body passed in and, for the two that change it, of the
 * baseline clock (C-007). The body is never modified: a changing operation returns a new body
 * whose change-log collection is a new object holding every entry the input held plus one, and
 * every other collection is the input's, carried through by reference and never read (C-003).
 * Every operation first reads the whole collection and refuses a malformed entry, so nothing is
 * listed, recorded, or acknowledged over a history this module cannot read (C-008).
 */

import { nowAest } from '../../../baseline/clock.js';
import { RECORD_KINDS, changeLogEntryId, platformId, timestampAest, userProfileId } from '../../../baseline/types.js';
import {
  AlreadyAcknowledgedError, EmptyChangeError, InvalidPlatformError, InvalidRecordError, MalformedEntryError, MismatchedRecordError,
  MissingProfileError, NotAcknowledgeableError, PlatformNotAwaitingError, SelfLoggingError, UnchangedRecordError, UnknownEntryError,
} from '../contract.js';

/** @typedef {import('../contract.js').ChangeLogImplementation} Impl */
/** @typedef {import('../contract.js').ChangeLogEntry} ChangeLogEntry */
/** @typedef {import('../contract.js').RecordChangeEntry} RecordChangeEntry */
/** @typedef {import('../contract.js').AcknowledgementEntry} AcknowledgementEntry */
/** @typedef {import('../contract.js').ChangedItem} ChangedItem */
/** @typedef {import('../contract.js').FieldChange} FieldChange */
/** @typedef {import('../contract.js').ItemAction} ItemAction */
/** @typedef {import('../contract.js').JsonValue} JsonValue */
/** @typedef {import('../../../baseline/types.js').ActiveProfile} ActiveProfile */
/** @typedef {import('../../../baseline/types.js').ChangeLogEntryId} ChangeLogEntryId */
/** @typedef {import('../../../baseline/types.js').PlatformId} PlatformId */
/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */
/** @typedef {import('../../../baseline/schema.js').StoredRecord} StoredRecord */

const LOG = /** @type {const} */ ('change-log-entry');
const STATUSES = Object.freeze(['live', 'retired', 'deleted']);
const ACTIONS = Object.freeze(['created', 'edited', 'deleted', 'retired']);
const ENTRY_KINDS = Object.freeze(['record-change', 'acknowledgement']);

/** C-002: the entry's own header holds this fact, so no item carries it. */
const RESTAMP_FIELDS = Object.freeze(['updatedBy', 'updatedAtAest']);

// ------------------------------------------------------------------ value checks

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * @param {unknown} v
 * @param {(s: string) => unknown} parse a baseline id or time parser, which throws on a bad value
 * @returns {boolean}
 */
function parses(v, parse) {
  if (typeof v !== 'string') return false;
  try {
    parse(v);
    return true;
  } catch {
    return false;
  }
}

/** @param {unknown} v */
const isPlatformId = (v) => parses(v, platformId.parse);
/** @param {unknown} v */
const isEntryId = (v) => parses(v, changeLogEntryId.parse);
/** @param {unknown} v */
const isProfileId = (v) => parses(v, userProfileId.parse);
/** @param {unknown} v */
const isTimestamp = (v) => parses(v, timestampAest);
/** @param {unknown} v */
const isRecordKind = (v) => typeof v === 'string' && /** @type {readonly string[]} */ (RECORD_KINDS).includes(v);
/** @param {unknown} v */
const isStatus = (v) => typeof v === 'string' && STATUSES.includes(v);

/**
 * @param {Record<string, unknown>} o
 * @param {string} key
 * @returns {boolean}
 */
function has(o, key) {
  return Object.prototype.hasOwnProperty.call(o, key);
}

/**
 * Structural equality of JSON values: key order is not data, array order is (C-002).
 * @param {unknown} x
 * @param {unknown} y
 * @returns {boolean}
 */
function deepEqual(x, y) {
  if (x === y) return true;
  if (x === null || y === null || typeof x !== 'object' || typeof y !== 'object') return false;
  if (Array.isArray(x) !== Array.isArray(y)) return false;
  if (Array.isArray(x) && Array.isArray(y)) return x.length === y.length && x.every((v, i) => deepEqual(v, y[i]));
  const xo = /** @type {Record<string, unknown>} */ (x);
  const yo = /** @type {Record<string, unknown>} */ (y);
  const keys = Object.keys(xo);
  return keys.length === Object.keys(yo).length && keys.every((k) => has(yo, k) && deepEqual(xo[k], yo[k]));
}

/**
 * @param {ChangeLogEntry} a
 * @param {ChangeLogEntry} b
 * @returns {number} ascending `createdAtAest`, then id (C-009, C-010)
 */
function byTimeThenId(a, b) {
  if (a.createdAtAest !== b.createdAtAest) return a.createdAtAest < b.createdAtAest ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// ------------------------------------------------------------------ reading the collection (C-008)

/**
 * Why a stored entry is not a `ChangeLogEntry`, or null when it is one.
 * @param {string} key
 * @param {unknown} entry
 * @returns {string | null} one sentence naming the field
 */
function malformation(key, entry) {
  if (!isObject(entry)) return 'the entry is not an object';
  if (!isEntryId(entry.id)) return 'its id is not a change log entry id';
  if (entry.id !== key) return 'its key differs from its id';
  if (entry.kind !== LOG) return 'its kind is not change-log-entry';
  if (!isStatus(entry.status)) return 'its status is not a record status';
  if (!isProfileId(entry.createdBy)) return 'createdBy is not a user profile id';
  if (!isProfileId(entry.updatedBy)) return 'updatedBy is not a user profile id';
  if (!isTimestamp(entry.createdAtAest)) return 'createdAtAest is not an AEST timestamp';
  if (!isTimestamp(entry.updatedAtAest)) return 'updatedAtAest is not an AEST timestamp';
  if (!ENTRY_KINDS.includes(/** @type {string} */ (entry.entryKind))) return 'its entryKind is neither record-change nor acknowledgement';
  if (entry.entryKind === 'acknowledgement') {
    if (!isEntryId(entry.entryId)) return 'its entryId is not a change log entry id';
    if (!isPlatformId(entry.platformId)) return 'its platformId is not a platform id';
    return null;
  }
  if (!Array.isArray(entry.items) || entry.items.length === 0) return 'its items are not a list of at least one item';
  for (const item of entry.items) {
    if (!isObject(item)) return 'an item is not an object';
    if (!isObject(item.ref) || !isRecordKind(item.ref.kind) || typeof item.ref.id !== 'string') return 'an item\'s ref is not a record kind and an id';
    if (!ACTIONS.includes(/** @type {string} */ (item.action))) return 'an item\'s action is outside the four';
    if (!Array.isArray(item.fields)) return 'an item\'s fields is not a list';
    for (const f of item.fields) {
      if (!isObject(f) || typeof f.field !== 'string' || !has(f, 'before') || !has(f, 'after')) return 'an item\'s fields holds something that is not a field change';
    }
  }
  if (!has(entry, 'madeForPlatformId') || (entry.madeForPlatformId !== null && !isPlatformId(entry.madeForPlatformId))) {
    return 'its madeForPlatformId is neither null nor a platform id';
  }
  if (!Array.isArray(entry.affectedPlatformIds) || !entry.affectedPlatformIds.every(isPlatformId)) {
    return 'its affectedPlatformIds is not a list of platform ids';
  }
  return null;
}

/**
 * Every entry of the collection, checked. Rejects the first malformed entry found, so no
 * operation proceeds over a history it cannot read (C-008).
 * @param {DataBody} body
 * @returns {ChangeLogEntry[]} in no particular order
 */
function readEntries(body) {
  const collection = /** @type {unknown} */ (body.collections[LOG]);
  if (collection === undefined) return [];
  if (!isObject(collection)) throw new MalformedEntryError(LOG, 'the change log collection is not a keyed collection of entries');
  /** @type {ChangeLogEntry[]} */
  const out = [];
  for (const [key, entry] of Object.entries(collection)) {
    const why = malformation(key, entry);
    if (why !== null) throw new MalformedEntryError(key, why);
    out.push(/** @type {ChangeLogEntry} */ (entry));
  }
  return out;
}

/**
 * @param {unknown} profile
 * @returns {ActiveProfile}
 */
function requireProfile(profile) {
  if (!isObject(profile) || !isProfileId(profile.id)) throw new MissingProfileError(profile);
  return /** @type {ActiveProfile} */ (profile);
}

/**
 * A fresh id held by no entry of the collection (C-001, C-011).
 * @param {ChangeLogEntry[]} entries
 * @returns {ChangeLogEntryId}
 */
function freshId(entries) {
  const taken = new Set(entries.map((e) => e.id));
  let id = changeLogEntryId.fresh();
  while (taken.has(id)) id = changeLogEntryId.fresh();
  return id;
}

/**
 * The body with one entry added to the change-log collection and nothing else changed (C-003).
 * @param {DataBody} body
 * @param {ChangeLogEntry} entry
 * @returns {DataBody}
 */
function withEntry(body, entry) {
  const existing = /** @type {Record<string, ChangeLogEntry> | undefined} */ (body.collections[LOG]);
  return {
    ...body,
    collections: { ...body.collections, [LOG]: { ...existing, [entry.id]: entry } },
  };
}

// ------------------------------------------------------------------ the item (C-002, C-004, C-005)

/**
 * @param {StoredRecord | null} before
 * @param {StoredRecord} after
 * @returns {ItemAction}
 */
function actionOf(before, after) {
  if (before === null) return 'created';
  if (after.status === 'deleted' && before.status !== 'deleted') return 'deleted';
  if (after.status === 'retired' && before.status !== 'retired') return 'retired';
  return 'edited';
}

/**
 * One item for one record: for an edit, each field whose value differs; for a creation, a
 * deletion, or a retirement, every field either side holds; never the restamp fields. Values
 * are copied, so nothing of the entry is an object passed in (C-003).
 * @param {StoredRecord | null} before
 * @param {StoredRecord} after
 * @returns {ChangedItem}
 */
function itemOf(before, after) {
  const action = actionOf(before, after);
  const b = /** @type {Record<string, unknown>} */ (before ?? {});
  const a = /** @type {Record<string, unknown>} */ (after);
  const names = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((f) => !RESTAMP_FIELDS.includes(f)).sort();
  /** @type {FieldChange[]} */
  const fields = [];
  for (const field of names) {
    const inB = has(b, field);
    const inA = has(a, field);
    if (action === 'edited' && inB === inA && deepEqual(b[field], a[field])) continue;
    fields.push({
      field,
      before: /** @type {JsonValue} */ (inB ? structuredClone(b[field]) : null),
      after: /** @type {JsonValue} */ (inA ? structuredClone(a[field]) : null),
    });
  }
  return { ref: { kind: after.kind, id: after.id }, action, fields };
}

/**
 * @param {unknown} r
 * @returns {boolean} whether `r` carries the parts of the header section 4 reads
 */
function isStoredRecord(r) {
  return isObject(r) && typeof r.id === 'string' && isRecordKind(r.kind) && isStatus(r.status);
}

// ------------------------------------------------------------------ operations

/** @type {Impl['recordChange']} */
async function recordChange(body, profile, change) {
  const entries = readEntries(body);
  const by = requireProfile(profile);
  const records = /** @type {readonly { before: unknown, after: unknown }[]} */ (change.records);
  if (records.length === 0) throw new EmptyChangeError();

  // Section 4's order holds across the whole act: each condition is checked over every record
  // before the next condition is checked over any.
  records.forEach((r, i) => {
    if (r.before !== null && !isStoredRecord(r.before)) throw new InvalidRecordError(i, 'the before is not a stored record with a string id, a record kind, and a record status');
    if (!isStoredRecord(r.after)) throw new InvalidRecordError(i, 'the after is not a stored record with a string id, a record kind, and a record status');
  });
  const pairs = /** @type {readonly { before: StoredRecord | null, after: StoredRecord }[]} */ (records);
  for (const { before, after } of pairs) {
    if (before !== null && before.kind === LOG) throw new SelfLoggingError(before.id);
    if (after.kind === LOG) throw new SelfLoggingError(after.id);
  }
  for (const { before, after } of pairs) {
    if (before !== null && (before.id !== after.id || before.kind !== after.kind)) {
      throw new MismatchedRecordError({ kind: before.kind, id: before.id }, { kind: after.kind, id: after.id });
    }
  }
  for (const { before, after } of pairs) {
    if (before !== null && deepEqual(before, after)) throw new UnchangedRecordError({ kind: after.kind, id: after.id });
  }
  const madeFor = /** @type {unknown} */ (change.madeForPlatformId);
  if (madeFor !== null && !isPlatformId(madeFor)) throw new InvalidPlatformError(madeFor);
  const affected = /** @type {unknown} */ (change.affectedPlatformIds);
  if (!Array.isArray(affected)) throw new InvalidPlatformError(affected);
  for (const p of affected) if (!isPlatformId(p)) throw new InvalidPlatformError(p);

  const at = nowAest();
  /** @type {RecordChangeEntry} */
  const entry = {
    id: freshId(entries),
    kind: LOG,
    status: 'live',
    createdBy: by.id,
    createdAtAest: at,
    updatedBy: by.id,
    updatedAtAest: at,
    entryKind: 'record-change',
    items: pairs.map(({ before, after }) => itemOf(before, after)),
    madeForPlatformId: /** @type {PlatformId | null} */ (madeFor),
    affectedPlatformIds: [...new Set(/** @type {PlatformId[]} */ (affected))].sort(),
  };
  return { body: withEntry(body, entry), entry };
}

/** @type {Impl['acknowledge']} */
async function acknowledge(body, profile, fields) {
  const entries = readEntries(body);
  const by = requireProfile(profile);
  const { entryId, platformId: platform } = fields;
  const target = entries.find((e) => e.id === entryId);
  if (target === undefined) throw new UnknownEntryError(entryId);
  if (target.entryKind !== 'record-change') throw new NotAcknowledgeableError(entryId);
  if (!target.affectedPlatformIds.includes(platform) || target.madeForPlatformId === platform) {
    throw new PlatformNotAwaitingError(entryId, platform);
  }
  const existing = entries.find((e) => e.entryKind === 'acknowledgement' && e.status === 'live' && e.entryId === entryId && e.platformId === platform);
  if (existing !== undefined) throw new AlreadyAcknowledgedError(existing.id);

  const at = nowAest();
  /** @type {AcknowledgementEntry} */
  const entry = {
    id: freshId(entries),
    kind: LOG,
    status: 'live',
    createdBy: by.id,
    createdAtAest: at,
    updatedBy: by.id,
    updatedAtAest: at,
    entryKind: 'acknowledgement',
    entryId: target.id,
    platformId: platform,
  };
  return { body: withEntry(body, entry), entry };
}

/** @type {Impl['listEntries']} */
async function listEntries(body) {
  return readEntries(body).sort(byTimeThenId);
}

/** @type {Impl['listHistory']} */
async function listHistory(body, ref) {
  const all = readEntries(body).sort(byTimeThenId);
  if (ref.kind === LOG) return all.filter((e) => e.entryKind === 'acknowledgement' && e.entryId === ref.id);
  return all.filter((e) => e.entryKind === 'record-change' && e.items.some((i) => i.ref.kind === ref.kind && i.ref.id === ref.id));
}

/** @type {Impl['listAwaiting']} */
async function listAwaiting(body, platform) {
  const all = readEntries(body).sort(byTimeThenId);
  const acknowledged = new Set();
  for (const e of all) {
    if (e.entryKind === 'acknowledgement' && e.status === 'live' && e.platformId === platform) acknowledged.add(e.entryId);
  }
  return /** @type {RecordChangeEntry[]} */ (all.filter((e) => e.entryKind === 'record-change'
    && e.affectedPlatformIds.includes(platform)
    && e.madeForPlatformId !== platform
    && !acknowledged.has(e.id)));
}

export { recordChange, acknowledge, listEntries, listHistory, listAwaiting };
