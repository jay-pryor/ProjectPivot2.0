/**
 * reference-register, implementing contract version 1.0 (modules/reference-register/CONTRACT.md).
 * Selected by contract.js unless REFERENCE_REGISTER_IMPL=null. Clause IDs (C-nnn) cite the
 * contract.
 *
 * Every operation first reads `collections['reference-entry']` whole and rejects a malformed
 * entry (C-006), so no list is given with an entry missing from it. The folder is reached only
 * by `store.putStoredFile` in `createEntry` and `store.checkStoredFiles` in `checkEntryFiles`
 * (C-007). `createEntry` reads the history through `change-log` before it keeps a file, so the
 * one cause of a later `recordChange` rejection a body can carry is refused with no file
 * written (C-004).
 */

import { RECORD_KINDS, platformId, referenceEntryId, timestampAest, userProfileId } from '../../../baseline/types.js';
import { nowAest } from '../../../baseline/clock.js';
import * as changeLog from '../../change-log/contract.js';
import * as store from '../../store/contract.js';
import {
  DuplicateLinkError, EmptyEntryError, EntryNotLiveError, InvalidActError, InvalidFieldError, InvalidRefError, LINKABLE_KINDS,
  MalformedEntryError, MissingProfileError, UnknownEntryError, UnlinkableKindError,
} from '../contract.js';

/** @typedef {import('../contract.js').ReferenceRegisterImplementation} Impl */
/** @typedef {import('../contract.js').ReferenceEntry} ReferenceEntry */
/** @typedef {import('../contract.js').EntryAct} EntryAct */
/** @typedef {import('../contract.js').ExternalLinkText} ExternalLinkText */
/** @typedef {import('../contract.js').FilesystemPathText} FilesystemPathText */
/** @typedef {import('../../../baseline/types.js').RecordRef} RecordRef */
/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */
/** @typedef {import('../../../baseline/schema.js').StoredRecord} StoredRecord */

const KIND = 'reference-entry';
const STATUSES = Object.freeze(['live', 'retired', 'deleted']);
const TEXT_FIELDS = Object.freeze(/** @type {const} */ (['name', 'link', 'path']));

// ------------------------------------------------------------------ value checks

/**
 * @param {unknown} v
 * @returns {v is Record<string, any>}
 */
function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * @param {object} o
 * @param {string} key
 */
function has(o, key) {
  return Object.prototype.hasOwnProperty.call(o, key);
}

/**
 * @param {unknown} v
 * @param {(s: string) => unknown} parse a baseline parser, which throws on a bad value
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
const isProfileId = (v) => parses(v, userProfileId.parse);
/** @param {unknown} v */
const isPlatformId = (v) => parses(v, platformId.parse);
/** @param {unknown} v */
const isEntryId = (v) => parses(v, referenceEntryId.parse);
/** @param {unknown} v */
const isTimestamp = (v) => parses(v, timestampAest);
/** @param {unknown} v */
const isTextOrNull = (v) => v === null || typeof v === 'string';

/**
 * A record kind and a string id (section 4).
 * @param {unknown} ref
 * @returns {ref is RecordRef}
 */
function isRef(ref) {
  return isObject(ref) && typeof ref.kind === 'string' && RECORD_KINDS.includes(/** @type {any} */ (ref.kind))
    && typeof ref.id === 'string';
}

/**
 * @param {RecordRef} a
 * @param {RecordRef} b
 */
function sameRef(a, b) {
  return a.kind === b.kind && a.id === b.id;
}

/**
 * @param {RecordRef} a
 * @param {RecordRef} b
 * @returns {number} ascending kind, then id, as strings (C-008)
 */
function byKindThenId(a, b) {
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * @param {ReferenceEntry} a
 * @param {ReferenceEntry} b
 * @returns {number} ascending `createdAtAest`, then id (C-005)
 */
function byCreatedThenId(a, b) {
  if (a.createdAtAest !== b.createdAtAest) return a.createdAtAest < b.createdAtAest ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// ------------------------------------------------------------------ the collection (C-006)

/**
 * One sentence naming what is wrong with an entry, or null when it is a `ReferenceEntry`.
 * A blank stored name, link, or path is not malformed: it is listed, not refused (C-006).
 * @param {string} key
 * @param {unknown} e
 * @returns {string | null}
 */
function malformation(key, e) {
  if (!isObject(e)) return 'the entry is not a record';
  if (e.id !== key) return 'its id differs from its key';
  if (!isEntryId(e.id)) return 'its id is not a reference entry id';
  if (e.kind !== KIND) return 'its kind is not reference-entry';
  if (!STATUSES.includes(e.status)) return 'its status is not a record status';
  if (!isProfileId(e.createdBy)) return 'its createdBy is not a user profile id';
  if (!isProfileId(e.updatedBy)) return 'its updatedBy is not a user profile id';
  if (!isTimestamp(e.createdAtAest)) return 'its createdAtAest is not an AEST timestamp';
  if (!isTimestamp(e.updatedAtAest)) return 'its updatedAtAest is not an AEST timestamp';
  for (const field of ['name', 'link', 'path', 'fileLocation']) {
    if (!has(e, field) || !isTextOrNull(e[field])) return `its ${field} is neither a string nor null`;
  }
  if (e.name === null && e.link === null && e.path === null && e.fileLocation === null) {
    return 'it has none of a name, a link, a path, and a file';
  }
  if (!Array.isArray(e.links)) return 'its links is not a list';
  for (const ref of e.links) {
    if (!isRef(ref)) return 'its links hold something that is not a record kind and a string id';
    if (!LINKABLE_KINDS.includes(ref.kind)) return 'its links name a kind a reference entry is not linked to';
  }
  return null;
}

/**
 * Every entry of the collection, each checked; a missing collection is empty (C-005).
 * @param {DataBody} body
 * @returns {ReferenceEntry[]}
 */
function readEntries(body) {
  const rows = /** @type {any} */ (body?.collections)?.[KIND];
  if (rows === undefined) return [];
  if (!isObject(rows)) throw new MalformedEntryError(KIND, 'the reference-entry collection is not keyed records');
  return Object.keys(rows).map((key) => {
    const detail = malformation(key, rows[key]);
    if (detail !== null) throw new MalformedEntryError(key, detail);
    return /** @type {ReferenceEntry} */ (rows[key]);
  });
}

/**
 * Section 4's profile and act conditions, in their order.
 * @param {unknown} act
 * @returns {EntryAct}
 */
function requireAct(act) {
  if (!isObject(act) || !isObject(act.profile) || !isProfileId(act.profile.id)) throw new MissingProfileError(act);
  if (!has(act, 'madeForPlatformId')) throw new InvalidActError(undefined);
  const madeFor = act.madeForPlatformId;
  if (madeFor !== null && !isPlatformId(madeFor)) throw new InvalidActError(madeFor);
  const affected = act.affectedPlatformIds;
  if (!Array.isArray(affected)) throw new InvalidActError(affected);
  for (const id of affected) if (!isPlatformId(id)) throw new InvalidActError(id);
  return /** @type {EntryAct} */ (act);
}

// ------------------------------------------------------------------ writing (C-002, C-011)

/**
 * The body with the one entry put, then the act recorded through `change-log`.
 * @param {DataBody} body
 * @param {EntryAct} act
 * @param {ReferenceEntry | null} before
 * @param {ReferenceEntry} after
 */
async function write(body, act, before, after) {
  const withEntry = {
    ...body,
    collections: { ...body.collections, [KIND]: { .../** @type {any} */ (body.collections)?.[KIND], [after.id]: after } },
  };
  const recorded = await changeLog.recordChange(/** @type {DataBody} */ (withEntry), act.profile, {
    records: [{
      before: /** @type {StoredRecord | null} */ (/** @type {unknown} */ (before)),
      after: /** @type {StoredRecord} */ (/** @type {unknown} */ (after)),
    }],
    madeForPlatformId: act.madeForPlatformId,
    affectedPlatformIds: act.affectedPlatformIds,
  });
  return { body: recorded.body, entry: after };
}

// ------------------------------------------------------------------ operations

/** @type {Impl['createEntry']} */
export async function createEntry(body, act, dataStore, fields) {
  const entries = readEntries(body);
  const a = requireAct(act);
  const given = /** @type {Record<string, any>} */ (isObject(fields) ? fields : {});
  /** @type {Record<'name' | 'link' | 'path', string | null>} */
  const text = { name: null, link: null, path: null };
  for (const field of TEXT_FIELDS) {
    const value = given[field];
    if (value === null || value === undefined) continue;
    const trimmed = String(value).trim();
    if (trimmed === '') throw new InvalidFieldError(field);
    text[field] = trimmed;
  }
  const file = given.file ?? null;
  if (text.name === null && text.link === null && text.path === null && file === null) throw new EmptyEntryError();
  // C-004: the history is read before a file is kept, so an unreadable one leaves no file.
  await changeLog.listEntries(body);
  const fileLocation = file === null ? null : await store.putStoredFile(dataStore, a.profile, file);
  const ids = new Set(entries.map((e) => e.id));
  let id = referenceEntryId.fresh();
  while (ids.has(id)) id = referenceEntryId.fresh();
  const at = nowAest();
  const by = a.profile.id;
  /** @type {ReferenceEntry} */
  const created = {
    id, kind: KIND, status: 'live', createdBy: by, createdAtAest: at, updatedBy: by, updatedAtAest: at,
    name: text.name,
    link: /** @type {ExternalLinkText | null} */ (text.link),
    path: /** @type {FilesystemPathText | null} */ (text.path),
    fileLocation,
    links: [],
  };
  return write(body, a, null, created);
}

/** @type {Impl['linkEntry']} */
export async function linkEntry(body, act, fields) {
  const entries = readEntries(body);
  const a = requireAct(act);
  const given = /** @type {Record<string, any>} */ (isObject(fields) ? fields : {});
  const existing = entries.find((e) => e.id === given.entryId);
  if (existing === undefined) throw new UnknownEntryError(given.entryId);
  if (existing.status !== 'live') throw new EntryNotLiveError(existing.status);
  const ref = given.ref;
  if (!isRef(ref)) throw new InvalidRefError(ref);
  if (!LINKABLE_KINDS.includes(ref.kind)) throw new UnlinkableKindError(ref.kind);
  if (existing.links.some((l) => sameRef(l, ref))) throw new DuplicateLinkError(ref);
  const links = [...existing.links, { kind: ref.kind, id: ref.id }].sort(byKindThenId);
  return write(body, a, existing, { ...existing, links, updatedBy: a.profile.id, updatedAtAest: nowAest() });
}

/** @type {Impl['listEntries']} */
export async function listEntries(body) {
  return readEntries(body).filter((e) => e.status === 'live').sort(byCreatedThenId);
}

/** @type {Impl['getEntry']} */
export async function getEntry(body, id) {
  return readEntries(body).find((e) => e.id === id) ?? null;
}

/** @type {Impl['checkEntryFiles']} */
export async function checkEntryFiles(body, dataStore) {
  const live = await listEntries(body);
  const carrying = live.filter((e) => e.fileLocation !== null);
  const presences = await store.checkStoredFiles(dataStore, carrying.map((e) => /** @type {any} */ (e.fileLocation)));
  let next = 0;
  return live.map((e) => {
    if (e.fileLocation === null) return { entryId: e.id, location: null, flagged: false, reason: null };
    const p = presences[next++];
    return { entryId: e.id, location: e.fileLocation, flagged: !p.present, reason: p.present ? null : p.reason };
  });
}
