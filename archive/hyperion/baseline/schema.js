/**
 * The persisted data schema: what the data folder holds and the shape of every file Pivot
 * writes (docs/module-map.md "Baseline"; SL-01 and SL-02 decisions at G3; DEC-005). Any
 * change to a shape here is a stop condition outside a BASELINE session, because data
 * already exists in the old shape (CORE-CHG-002).
 *
 * The baseline fixes the folder layout, the file envelope, the save stamp, the integrity
 * check, and the header every record carries. The fields of each record kind are declared
 * by the module that owns the kind, in its contract (DEC-005).
 *
 * `store` is the only module that reads or writes the folder (DEC-004); every other module
 * sees these shapes only through `store`'s contract.
 */

import { nowAest } from './clock.js';
import { saveToken, sha256Hex, timestampAest, userProfileId } from './types.js';

/** @typedef {import('./types.js').RecordKind} RecordKind */
/** @typedef {import('./types.js').RecordStatus} RecordStatus */
/** @typedef {import('./types.js').Sha256Hex} Sha256Hex */
/** @typedef {import('./types.js').SaveToken} SaveToken */
/** @typedef {import('./types.js').TimestampAest} TimestampAest */
/** @typedef {import('./types.js').UserProfile} UserProfile */
/** @typedef {import('./types.js').UserProfileId} UserProfileId */

// ------------------------------------------------------------------ the data folder

/**
 * Bumped only when an envelope or header shape changes; a file with a higher version than
 * this build knows is refused rather than misread (DEC-003 consequence: an old pivot.html
 * against data written by a newer one).
 */
export const SCHEMA_VERSION = 1;

/** The first field of every file Pivot writes, so a stray file is told from a Pivot one. */
export const FILE_MARKER = 'pivot';

/**
 * Layout of the one data folder the user chooses (REQ-069). Every path is relative to it.
 */
export const DATA_FOLDER = Object.freeze({
  /** Every record of every kind: the stored data. Also the save-state format (REQ-064). */
  data: 'data.json',
  /** User profiles (REQ-053), readable before a profile is selected (REQ-054, REQ-055). */
  profiles: 'profiles.json',
  /** Files a reference entry carries; the entry holds only the location (REQ-029). */
  files: 'files',
  /** The backup ring, each file in the data.json format (REQ-062, REQ-063, REQ-064). */
  backups: 'backups',
  /** Another user's save, kept before it is overwritten (REQ-014). Name fixed by the requirement. */
  supersededSaves: 'Superseded Saves',
});

export const BACKUP_RING_SIZE = 72;                 // REQ-063
export const BACKUP_INTERVAL_MS = 60 * 60 * 1000;   // REQ-062: more than an hour since the last backup's stamp

/** Key under which the working state is mirrored in the browser's storage (REQ-079, REQ-080). */
export const BROWSER_STORAGE_KEY = 'pivot.working-state.v1';

// ------------------------------------------------------------------ shapes

/** @typedef {'data' | 'profiles'} EnvelopeKind */

/**
 * Written with the data on every save and compared on the next (SL-01, decided at G3):
 * a save whose loaded stamp differs from the stamp on disk is a save over another user's
 * work (REQ-014, REQ-071).
 * @typedef {object} SaveStamp
 * @property {UserProfileId} savedByProfileId
 * @property {TimestampAest} savedAtAest
 * @property {SaveToken} token
 */

/**
 * Every JSON file Pivot writes. `integrity` is the SHA-256 of `canonicalJson(body)`,
 * checked on load (REQ-074). `stamp` is present on `data` files and null on `profiles`,
 * which a user writes before any profile is selected.
 * @template B
 * @typedef {object} Envelope
 * @property {typeof FILE_MARKER} pivot
 * @property {number} schemaVersion
 * @property {EnvelopeKind} kind
 * @property {TimestampAest} writtenAtAest
 * @property {SaveStamp | null} stamp
 * @property {Sha256Hex} integrity
 * @property {B} body
 */

/**
 * The fields every stored record carries, whatever its kind. A module's contract adds the
 * kind's own fields (DEC-005). Who and when are REQ-045's; status is REQ-007's and REQ-067's.
 * @typedef {object} RecordHeader
 * @property {string} id
 * @property {RecordKind} kind
 * @property {RecordStatus} status
 * @property {UserProfileId} createdBy
 * @property {TimestampAest} createdAtAest
 * @property {UserProfileId} updatedBy
 * @property {TimestampAest} updatedAtAest
 */

/** @typedef {RecordHeader & { [field: string]: unknown }} StoredRecord */

/**
 * The body of data.json: one collection per record kind, keyed by id, and the sequences
 * that only count up (REQ-050: a hazard's number is never reused, so the counter is data).
 * @typedef {object} DataBody
 * @property {Partial<Record<RecordKind, Record<string, StoredRecord>>>} collections
 * @property {{ hazard: number }} sequences the next hazard number
 */

/**
 * The body of profiles.json.
 * @typedef {object} ProfilesBody
 * @property {Record<string, UserProfile>} profiles keyed by id
 */

/**
 * What the browser's storage holds (REQ-079): the working state as it would be saved,
 * and whether the folder has it yet (REQ-080).
 * @typedef {object} WorkingStateMirror
 * @property {number} schemaVersion
 * @property {TimestampAest} mirroredAtAest
 * @property {boolean} unsaved true when the folder does not yet hold this state
 * @property {SaveStamp | null} loadedStamp the stamp of the data this state was loaded from
 * @property {DataBody} body
 */

/** @returns {DataBody} the body of a data folder with nothing in it yet */
export function emptyDataBody() {
  return { collections: {}, sequences: { hazard: 1 } };
}

/** @returns {ProfilesBody} */
export function emptyProfilesBody() {
  return { profiles: {} };
}

// ------------------------------------------------------------------ integrity

/**
 * JSON with object keys sorted at every level and no whitespace, so the same body always
 * hashes the same. Arrays keep their order, which is part of the data.
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalJson(value) {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      /** @type {Record<string, unknown>} */
      const sorted = {};
      for (const k of Object.keys(v).sort()) sorted[k] = /** @type {Record<string, unknown>} */ (v)[k];
      return sorted;
    }
    return v;
  });
}

/**
 * @param {string} text
 * @returns {Promise<Sha256Hex>}
 */
export async function digestSha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return sha256Hex([...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join(''));
}

/**
 * @param {UserProfileId} savedByProfileId
 * @returns {SaveStamp}
 */
export function freshStamp(savedByProfileId) {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return {
    savedByProfileId: userProfileId.parse(savedByProfileId),
    savedAtAest: nowAest(),
    token: saveToken([...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')),
  };
}

/**
 * @param {SaveStamp | null} a
 * @param {SaveStamp | null} b
 * @returns {boolean}
 */
export function sameStamp(a, b) {
  if (a === null || b === null) return a === b;
  return a.token === b.token && a.savedAtAest === b.savedAtAest && a.savedByProfileId === b.savedByProfileId;
}

/**
 * Wrap a body for writing: the envelope with its integrity check computed.
 * @template B
 * @param {EnvelopeKind} kind
 * @param {B} body
 * @param {SaveStamp | null} stamp required for `data`, null for `profiles`
 * @returns {Promise<Envelope<B>>}
 */
export async function seal(kind, body, stamp) {
  if (kind === 'data' && stamp === null) throw new TypeError('a data file is sealed with a save stamp');
  return {
    pivot: FILE_MARKER,
    schemaVersion: SCHEMA_VERSION,
    kind,
    writtenAtAest: nowAest(),
    stamp,
    integrity: await digestSha256Hex(canonicalJson(body)),
    body,
  };
}

/**
 * @param {Envelope<unknown>} envelope
 * @returns {string} the file's text, as written
 */
export function serialize(envelope) {
  return JSON.stringify(envelope, null, 2) + '\n';
}

/**
 * Why a file could not be opened, for the message that names it (REQ-006, REQ-074).
 * @typedef {'unreadable' | 'not-a-pivot-file' | 'newer-schema' | 'integrity-failed'} OpenFailure
 */

/**
 * @typedef {{ ok: true, envelope: Envelope<unknown> }
 *   | { ok: false, reason: OpenFailure, detail: string }} OpenResult
 */

/**
 * Read a file's text back into its envelope, checking the marker, the schema version, and
 * the integrity check. Never throws for bad content: the caller names the file to the user.
 * @param {string} text
 * @returns {Promise<OpenResult>}
 */
export async function open(text) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: 'unreadable', detail: e instanceof Error ? e.message : String(e) };
  }
  if (!parsed || typeof parsed !== 'object' || /** @type {{ pivot?: unknown }} */ (parsed).pivot !== FILE_MARKER) {
    return { ok: false, reason: 'not-a-pivot-file', detail: 'the file does not start with the Pivot marker' };
  }
  const env = /** @type {Envelope<unknown>} */ (parsed);
  if (typeof env.schemaVersion !== 'number' || env.schemaVersion > SCHEMA_VERSION) {
    return {
      ok: false,
      reason: 'newer-schema',
      detail: `written by a newer Pivot (schema ${String(env.schemaVersion)}; this one reads up to ${SCHEMA_VERSION})`,
    };
  }
  if (!('body' in env) || typeof env.integrity !== 'string') {
    return { ok: false, reason: 'integrity-failed', detail: 'the file carries no integrity check' };
  }
  const expected = await digestSha256Hex(canonicalJson(env.body));
  if (expected !== env.integrity) {
    return { ok: false, reason: 'integrity-failed', detail: 'the contents do not match the integrity check written with them' };
  }
  try {
    timestampAest(env.writtenAtAest);
  } catch {
    return { ok: false, reason: 'not-a-pivot-file', detail: 'the file carries no AEST write time' };
  }
  return { ok: true, envelope: env };
}

// ------------------------------------------------------------------ file names

const COMPACT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\+10:00$/;

/**
 * `20260914-181951` from an AEST timestamp: sortable, and legal on Windows, which
 * forbids `:` in a file name.
 * @param {TimestampAest} ts
 * @returns {string}
 */
export function compactTimestamp(ts) {
  const m = COMPACT_RE.exec(timestampAest(ts));
  if (!m) throw new RangeError('not an AEST timestamp');
  return `${m[1]}${m[2]}${m[3]}-${m[4]}${m[5]}${m[6]}`;
}

/**
 * A backup's name from the stamp it was taken at. Sorting names sorts backups by time,
 * so the oldest of 73 is the first (REQ-063).
 * @param {TimestampAest} takenAtAest
 * @returns {string}
 */
export function backupFileName(takenAtAest) {
  return `data-${compactTimestamp(takenAtAest)}.json`;
}

export const BACKUP_FILE_RE = /^data-\d{8}-\d{6}\.json$/;

/**
 * The name under which another user's superseded save is kept (REQ-014): their save time
 * and token, so two supersessions in one second do not collide.
 * @param {SaveStamp} superseded the stamp found on disk, not the saving user's
 * @returns {string}
 */
export function supersededFileName(superseded) {
  return `data-${compactTimestamp(superseded.savedAtAest)}-${superseded.token.slice(0, 8)}.json`;
}
