/**
 * Contract: change-log, version 1.0. The module's sole import surface (CORE-CON-003). Owns
 * the history of every change to every stored record (DEC-004, DEC-005, DEC-015): one entry
 * per act a person performed, holding each record that act changed with the previous and new
 * value of every field, the platform the act was made for, and every platform it reaches;
 * and, as entries of their own, the acknowledgements that clear an act from one platform
 * (REQ-010, REQ-012, REQ-045, REQ-081; HZ-005, HZ-006). Every operation is a function of the
 * working `DataBody` a consumer holds between `store.load` and `store.save` (DEC-006): this
 * module reads no folder and writes nothing anywhere. Clause IDs (C-nnn) are defined in
 * CONTRACT.md beside this file and cited by the conformance suite.
 *
 * Nothing here knows what a hazard, a control, or a platform is. A record reaches this module
 * as a `StoredRecord` — the baseline header plus whatever fields its owner gives it — so a
 * record kind not yet built is logged without a change to this contract, and no id stored in
 * an entry is ever resolved: this module imports no other module, which is what keeps the
 * graph DEC-004 drew acyclic while `registry` records its own changes here.
 *
 * Every operation delegates to the selected implementation: `src/change-log.js` in
 * production, `null_double.js` when `CHANGE_LOG_IMPL=null` is set in the environment
 * (CORE-TST-002, rung 1). The null double is test-only and never embedded in the built
 * pivot.html, which is why its specifier is held in a variable: the build inlines only
 * quoted import specifiers.
 */

/** @typedef {import('../../baseline/types.js').ChangeLogEntryId} ChangeLogEntryId */
/** @typedef {import('../../baseline/types.js').PlatformId} PlatformId */
/** @typedef {import('../../baseline/types.js').UserProfileId} UserProfileId */
/** @typedef {import('../../baseline/types.js').ActiveProfile} ActiveProfile */
/** @typedef {import('../../baseline/types.js').RecordKind} RecordKind */
/** @typedef {import('../../baseline/types.js').RecordStatus} RecordStatus */
/** @typedef {import('../../baseline/types.js').RecordRef} RecordRef */
/** @typedef {import('../../baseline/types.js').TimestampAest} TimestampAest */
/** @typedef {import('../../baseline/schema.js').DataBody} DataBody */
/** @typedef {import('../../baseline/schema.js').StoredRecord} StoredRecord */

// ------------------------------------------------------------------ values crossing the boundary

/** @typedef {readonly JsonValue[]} JsonArray */
/** @typedef {{ readonly [key: string]: JsonValue }} JsonObject */

/**
 * What a stored record's field may hold. An entry stores field values exactly as it found
 * them, so every one of them is plain data and the entry survives a save and a load
 * unchanged (C-003). The two arms above are named rather than written inline because a
 * JSDoc type alias may not recur through an array or an index signature directly.
 * @typedef {string | number | boolean | null | JsonArray | JsonObject} JsonValue
 */

/**
 * One field of one record, as it was and as it now is, compared deep and stored exactly as
 * found — never trimmed, rounded, summarised, or truncated (C-002). A field present on one
 * side and absent from the other carries null on the side it is absent from.
 * @typedef {object} FieldChange
 * @property {string} field the stored field's name, not a label
 * @property {JsonValue} before
 * @property {JsonValue} after
 */

/**
 * What one act did to one record, derived from its status transition and never given by the
 * caller, so a deletion cannot be recorded as an edit (C-005; HZ-005).
 * @typedef {'created' | 'edited' | 'deleted' | 'retired'} ItemAction
 */

/**
 * One record an act changed. `fields` holds every field that differs for an `edited` item,
 * and every field of the record for a `created`, `deleted`, or `retired` one, which is what
 * REQ-010 means by what a deleted record contained (C-002, C-004).
 * @typedef {object} ChangedItem
 * @property {RecordRef} ref the kind and id of the record, never resolved by this module (C-007)
 * @property {ItemAction} action
 * @property {readonly FieldChange[]} fields ascending by `field`
 */

// ------------------------------------------------------------------ record shapes

/**
 * The fields every entry of this module carries, from the baseline record header (schema.js
 * `RecordHeader`). `createdBy` and `createdAtAest` are who performed the act and when, which
 * is REQ-045's who and when; nothing alters an entry once written, so `updatedBy` and
 * `updatedAtAest` equal them (C-006).
 * @typedef {object} ChangeLogHeader
 * @property {ChangeLogEntryId} id
 * @property {'change-log-entry'} kind
 * @property {RecordStatus} status always `live`: an entry is never deleted or retired (C-006)
 * @property {UserProfileId} createdBy
 * @property {TimestampAest} createdAtAest
 * @property {UserProfileId} updatedBy
 * @property {TimestampAest} updatedAtAest
 */

/**
 * One act: one call, one profile, one instant, and every record it changed (DEC-015). In
 * `collections['change-log-entry']` keyed by its id.
 * @typedef {ChangeLogHeader & {
 *   entryKind: 'record-change',
 *   items: readonly ChangedItem[],
 *   madeForPlatformId: PlatformId | null,
 *   affectedPlatformIds: readonly PlatformId[],
 * }} RecordChangeEntry
 */

/**
 * One platform's acknowledgement of one act. An entry of its own rather than a field of the
 * act it acknowledges, so every row of this collection is written once and never altered
 * (DEC-015, C-006, C-011).
 * @typedef {ChangeLogHeader & {
 *   entryKind: 'acknowledgement',
 *   entryId: ChangeLogEntryId,
 *   platformId: PlatformId,
 * }} AcknowledgementEntry
 */

/**
 * Both shapes share `collections['change-log-entry']` and are told apart by `entryKind`, as
 * a `Link` is told apart by `linkKind` (DEC-013, DEC-015).
 * @typedef {RecordChangeEntry | AcknowledgementEntry} ChangeLogEntry
 */

// ------------------------------------------------------------------ what a consumer supplies

/**
 * One record as it was and as it now is. `after` is never null: a deletion keeps the row
 * with status `deleted` (registry C-005), so there is always a record to point at.
 * @typedef {object} RecordBeforeAfter
 * @property {StoredRecord | null} before null when the act created the record
 * @property {StoredRecord} after
 */

/**
 * One act, as the module that owns the changed records describes it. `affectedPlatformIds`
 * is the caller's statement of every platform the act reaches, computed from the links that
 * module holds: this module cannot ask, and does not check (DEC-015, C-007).
 * @typedef {object} RecordedChange
 * @property {readonly RecordBeforeAfter[]} records at least one (C-001)
 * @property {PlatformId | null} madeForPlatformId the platform the user was working on, or null
 * @property {readonly PlatformId[]} affectedPlatformIds every platform the act reaches
 */

/** @typedef {{ entryId: ChangeLogEntryId, platformId: PlatformId }} AcknowledgementFields the act, and the one platform it is acknowledged for */

// ------------------------------------------------------------------ what a change returns

/**
 * What `recordChange` returns: the body as it now is, and the entry appended to it. The body
 * passed in is untouched (C-003); the consumer replaces its working body with `body` and
 * passes that to `store.save` when the user saves.
 * @typedef {{ body: DataBody, entry: RecordChangeEntry }} EntryChange
 */

/** @typedef {{ body: DataBody, entry: AcknowledgementEntry }} AcknowledgementChange what `acknowledge` returns (C-011) */

// ------------------------------------------------------------------ error conditions

/** C-001: `recordChange` given an act with no records. An entry is a change. */
export class EmptyChangeError extends Error {
  constructor() {
    super('an act recorded in the change log changes at least one record');
    this.name = 'EmptyChangeError';
  }
}

/**
 * C-001, C-008: a `before` that is not null, or an `after`, that is not a `StoredRecord` —
 * a missing or ill-formed header, an id that is not a string, a `kind` outside
 * `RECORD_KINDS`, or a `status` that is not a `RecordStatus`. The body is unchanged.
 */
export class InvalidRecordError extends Error {
  /**
   * @param {number} position the index in `change.records`
   * @param {string} detail one sentence naming the field
   */
  constructor(position, detail) {
    super(`a record given to the change log must carry the stored record header: ${detail}`);
    this.name = 'InvalidRecordError';
    this.position = position;
    this.detail = detail;
  }
}

/** C-013: a record of kind `change-log-entry` handed to `recordChange`. The log never logs itself. */
export class SelfLoggingError extends Error {
  /** @param {string} id the entry's id */
  constructor(id) {
    super('the change log does not record changes to its own entries');
    this.name = 'SelfLoggingError';
    this.given = id;
  }
}

/** C-001: a `before` and an `after` that are not the same record. Two records are two entries of `records`. */
export class MismatchedRecordError extends Error {
  /**
   * @param {RecordRef} before
   * @param {RecordRef} after
   */
  constructor(before, after) {
    super('a recorded change pairs one record with itself, as it was and as it now is');
    this.name = 'MismatchedRecordError';
    this.before = before;
    this.after = after;
  }
}

/** C-002: a `before` deep-equal to its `after`. A change that did not happen is not recorded. */
export class UnchangedRecordError extends Error {
  /** @param {RecordRef} ref */
  constructor(ref) {
    super('a recorded change has at least one field whose value differs');
    this.name = 'UnchangedRecordError';
    this.ref = ref;
  }
}

/**
 * C-001: a `madeForPlatformId` that is neither null nor a platform id, or an entry of
 * `affectedPlatformIds` that is not a platform id. That the id names a stored platform is not
 * checked and is not this module's (C-007).
 */
export class InvalidPlatformError extends Error {
  /** @param {unknown} given */
  constructor(given) {
    super('a platform an act reaches is named by a platform id');
    this.name = 'InvalidPlatformError';
    this.given = given;
  }
}

/** C-011: `acknowledge` given an id no entry of the collection has. */
export class UnknownEntryError extends Error {
  /** @param {string} id */
  constructor(id) {
    super('no change log entry has that id');
    this.name = 'UnknownEntryError';
    this.given = id;
  }
}

/** C-011, C-013: `acknowledge` given an entry that is itself an acknowledgement. */
export class NotAcknowledgeableError extends Error {
  /** @param {string} id */
  constructor(id) {
    super('an acknowledgement is of a recorded change, not of another acknowledgement');
    this.name = 'NotAcknowledgeableError';
    this.given = id;
  }
}

/**
 * C-010, C-011: the platform is not in the entry's `affectedPlatformIds`, or it is the
 * platform the act was made for, so that platform never awaited this change.
 */
export class PlatformNotAwaitingError extends Error {
  /**
   * @param {string} entryId
   * @param {string} platformId
   */
  constructor(entryId, platformId) {
    super('that platform is not awaiting acknowledgement of that change');
    this.name = 'PlatformNotAwaitingError';
    this.entryId = entryId;
    this.platformId = platformId;
  }
}

/** C-011: a live acknowledgement already names that entry and that platform. */
export class AlreadyAcknowledgedError extends Error {
  /** @param {string} acknowledgementId the existing acknowledgement's id */
  constructor(acknowledgementId) {
    super('that change is already acknowledged for that platform');
    this.name = 'AlreadyAcknowledgedError';
    this.acknowledgementId = acknowledgementId;
  }
}

/** C-001, C-011: `profile` missing, or its id not a user profile id. The body is unchanged. */
export class MissingProfileError extends Error {
  /** @param {unknown} given */
  constructor(given) {
    super('an entry in the change log is stamped with the profile that performed the act');
    this.name = 'MissingProfileError';
    this.given = given;
  }
}

/**
 * C-008: an entry of `collections['change-log-entry']` this module cannot read. Every
 * operation rejects, so a history is never shown with an entry silently missing from it and
 * a queue is never shown short.
 */
export class MalformedEntryError extends Error {
  /**
   * @param {string} key the entry's key in the collection
   * @param {string} detail one sentence naming the field
   */
  constructor(key, detail) {
    super(`a change log entry cannot be read: ${detail}`);
    this.name = 'MalformedEntryError';
    this.key = key;
    this.detail = detail;
  }
}

// ------------------------------------------------------------------ operations: recording

/**
 * Append one entry for one act: one call, one profile, one instant, and every record the act
 * changed, each with the previous and new value of every field that differs — or every field
 * it held, for a record created, deleted, or retired (REQ-010, REQ-045). The action of each
 * record is derived from its status transition, never given (C-005). `madeForPlatformId` and
 * `affectedPlatformIds` are the caller's: this module holds no link and cannot compute which
 * platforms an act reaches (DEC-015, C-007). Rejects an empty act, a record that is not a
 * stored record, a record of this module's own kind, a mismatched or unchanged pair, an id
 * that is not a platform id, and a missing profile, changing nothing.
 * C-001, C-002, C-003, C-004, C-005, C-006, C-013.
 * @param {DataBody} body
 * @param {ActiveProfile} profile
 * @param {RecordedChange} change
 * @returns {Promise<EntryChange>}
 */
export async function recordChange(body, profile, change) {
  return (await impl()).recordChange(body, profile, change);
}

/**
 * Acknowledge one recorded change for one platform, which removes it from that platform's
 * queue and from no other's (REQ-012). The acknowledgement is an entry of its own, so the
 * change it names is unchanged and stays in every history (C-006, C-011). Whether the
 * acknowledging profile owns the platform is the consumer's to decide. Rejects an unknown
 * entry, an entry that is an acknowledgement, a platform that was not awaiting the change,
 * one already acknowledged, and a missing profile, changing nothing.
 * C-003, C-006, C-011.
 * @param {DataBody} body
 * @param {ActiveProfile} profile
 * @param {AcknowledgementFields} fields
 * @returns {Promise<AcknowledgementChange>}
 */
export async function acknowledge(body, profile, fields) {
  return (await impl()).acknowledge(body, profile, fields);
}

// ------------------------------------------------------------------ operations: reading the history

/**
 * Every entry of both kinds, once each, in ascending order of `createdAtAest` then id; empty
 * when the body holds none. A read, taking no profile: any user sees the same history
 * (REQ-010, REQ-045). C-008, C-009.
 * @param {DataBody} body
 * @returns {Promise<readonly ChangeLogEntry[]>}
 */
export async function listEntries(body) {
  return (await impl()).listEntries(body);
}

/**
 * The history of one record: every recorded change one of whose items names `ref`, in
 * ascending order of `createdAtAest` then id — or, for a `ref` of kind `change-log-entry`,
 * every acknowledgement of that entry. Empty for a ref no entry names, whether or not a
 * record of that kind and id exists anywhere: this module resolves no id (C-007). Rejects
 * only a malformed entry. C-008, C-009.
 * @param {DataBody} body
 * @param {RecordRef} ref
 * @returns {Promise<readonly ChangeLogEntry[]>}
 */
export async function listHistory(body, ref) {
  return (await impl()).listHistory(body, ref);
}

/**
 * Every recorded change one platform has yet to acknowledge: the act reached it, was not made
 * for it, and no acknowledgement names the two together (REQ-012). In ascending order of
 * `createdAtAest` then id, each entry carrying the whole act — every record it changed with
 * each field's previous and new value. A function of the body and a platform id alone, so a
 * change of the platform's owner carries the queue untouched (REQ-081, C-012). Empty for a
 * platform id nothing names. Rejects only a malformed entry. C-008, C-010, C-012.
 * @param {DataBody} body
 * @param {PlatformId} platformId
 * @returns {Promise<readonly RecordChangeEntry[]>}
 */
export async function listAwaiting(body, platformId) {
  return (await impl()).listAwaiting(body, platformId);
}

// ------------------------------------------------------------------ implementation selection

/**
 * @typedef {object} ChangeLogImplementation
 * @property {(body: DataBody, profile: ActiveProfile, change: RecordedChange) => Promise<EntryChange>} recordChange
 * @property {(body: DataBody, profile: ActiveProfile, fields: AcknowledgementFields) => Promise<AcknowledgementChange>} acknowledge
 * @property {(body: DataBody) => Promise<readonly ChangeLogEntry[]>} listEntries
 * @property {(body: DataBody, ref: RecordRef) => Promise<readonly ChangeLogEntry[]>} listHistory
 * @property {(body: DataBody, platformId: PlatformId) => Promise<readonly RecordChangeEntry[]>} listAwaiting
 */

/** @type {Promise<ChangeLogImplementation> | null} */
let selected = null;

/** @returns {Promise<ChangeLogImplementation>} */
function impl() {
  if (selected === null) {
    const env = /** @type {{ process?: { env?: Record<string, string | undefined> } }} */ (globalThis).process?.env;
    if (env?.CHANGE_LOG_IMPL === 'null') {
      const nullDouble = './null_double.js'; // test-only; not a runtime source, so never inlined by the build
      selected = import(nullDouble);
    } else {
      selected = import('./src/change-log.js');
    }
  }
  return selected;
}
