/**
 * Contract: reference-register, version 1.0. The module's sole import surface
 * (CORE-CON-003). Owns the record kind `reference-entry` (DEC-004, DEC-005): one entry per
 * reference a user keeps, holding any combination of a name, a link, a path, and a file, and
 * the records it is linked to (REQ-028, REQ-029, REQ-030, REQ-031, REQ-078). Clause IDs
 * (C-nnn) are defined in CONTRACT.md beside this file and cited by the conformance suite.
 *
 * Every operation that does not touch a file is a function of the working `DataBody` a
 * consumer holds between `store.load` and `store.save` (DEC-006). The two that do touch one
 * take a `DataStore` and reach the folder only through `store.putStoredFile` and
 * `store.checkStoredFiles`: this is DEC-006's single carve-out, "a record module whose records
 * include files in the folder (reference-register, REQ-029) imports store for the file
 * operation and nothing else" (C-007).
 *
 * Nothing here knows what a hazard, a control, or a platform is. An entry names what it is
 * linked to by a baseline `RecordRef` and this module resolves no id and imports no module
 * that could (C-008), so an entry may be linked to a `report` at 1.0 although no module owns
 * that kind until SL-09 — the same shape review-schedule 1.0 has for `reference-entry`
 * (review-schedule C-011). For the same reason the platforms a change to an entry reaches are
 * named by the caller and never derived here (DEC-020), as they are for `change-log`
 * (DEC-015).
 *
 * Every operation delegates to the selected implementation: `src/reference-register.js` in
 * production, `null_double.js` when `REFERENCE_REGISTER_IMPL=null` is set in the environment
 * (CORE-TST-002, rung 1). The null double is test-only and never embedded in the built
 * pivot.html, which is why its specifier is held in a variable: the build inlines only quoted
 * import specifiers.
 */

/** @typedef {import('../../baseline/types.js').ReferenceEntryId} ReferenceEntryId */
/** @typedef {import('../../baseline/types.js').PlatformId} PlatformId */
/** @typedef {import('../../baseline/types.js').UserProfileId} UserProfileId */
/** @typedef {import('../../baseline/types.js').ActiveProfile} ActiveProfile */
/** @typedef {import('../../baseline/types.js').RecordKind} RecordKind */
/** @typedef {import('../../baseline/types.js').RecordStatus} RecordStatus */
/** @typedef {import('../../baseline/types.js').RecordRef} RecordRef */
/** @typedef {import('../../baseline/types.js').TimestampAest} TimestampAest */
/** @typedef {import('../../baseline/schema.js').DataBody} DataBody */
/** @typedef {import('../store/contract.js').DataStore} DataStore */
/** @typedef {import('../store/contract.js').IncomingFile} IncomingFile */
/** @typedef {import('../store/contract.js').StoredFileLocation} StoredFileLocation */

// ------------------------------------------------------------------ what may be linked

/**
 * The six `RecordKind` values SL-10 criterion 3 and REQ-030 name: what an entry may be linked
 * to. A `ref` of any other kind is refused (C-008). `report` is here although no module owns
 * that kind until SL-09, because this module resolves no id and so has nothing to wait for —
 * review-schedule 1.0 carries `reference-entry` the same way (review-schedule C-011).
 * `reference-entry` is deliberately absent: an entry is not linked to another entry at 1.0
 * (CONTRACT.md, *Explicitly not promised*).
 */
export const LINKABLE_KINDS = Object.freeze(
  /** @type {readonly RecordKind[]} */ ([
    'hazard', 'causal-factor', 'consequence', 'platform', 'control', 'report',
  ]),
);

// ------------------------------------------------------------------ the two text kinds

/**
 * A link the user typed: an address of something somewhere else — a web page, an intranet
 * location, a document management system. Stored exactly as typed once trimmed; never opened,
 * fetched, resolved, or checked (C-001).
 *
 * Branded rather than left a bare string so that a link and a path cannot be assigned to one
 * another's field (IMP-05). The two are the confusable pair of this contract: both are text a
 * user types into a form, both name something outside Pivot, and swapping them is invisible in
 * a diff and in a rendered screen. The brand is what makes `check_units.py`'s confusion probe
 * able to reject the swap; without it the type check would accept it and the distinction would
 * carry exactly the durability of the comment it replaced (CORE-CON-001, *Units and frames*).
 * @typedef {string & { readonly __unit: 'ExternalLinkText' }} ExternalLinkText
 */

/**
 * A path the user typed: a place on some machine's filesystem. Stored exactly as typed once
 * trimmed; never opened, resolved, or checked — under DEC-003 a browser page was never handed
 * a handle for it and cannot stat it, which is why C-010 answers for a stored file and not for
 * a path (store 3.0, *Explicitly not promised*; DEC-022).
 *
 * Branded for the reason `ExternalLinkText` is, and distinct from `StoredFileLocation`, which
 * is neither of these: a location is Pivot's own, relative to the data folder, and is produced
 * by `store.putStoredFile` and never typed (store C-018).
 * @typedef {string & { readonly __unit: 'FilesystemPathText' }} FilesystemPathText
 */

// ------------------------------------------------------------------ the record

/**
 * One reference a user keeps, in `collections['reference-entry']` keyed by its id: the
 * baseline record header narrowed to this kind and id (DEC-005), plus any combination of the
 * four things SL-10 criterion 1 names and the records it is linked to.
 *
 * At least one of `name`, `link`, `path`, and `fileLocation` is not null (C-001): an entry
 * with none of the four refers to nothing. Each is null exactly when the user did not give it;
 * a field given blank is refused rather than stored as an absence (C-001).
 *
 * `fileLocation` is where `store.putStoredFile` put the file, and is the whole of what the
 * entry holds about it. The file's contents are never on the record and never in `DataBody`,
 * which is REQ-029's half of this contract (C-003).
 * @typedef {object} ReferenceEntry
 * @property {ReferenceEntryId} id
 * @property {'reference-entry'} kind
 * @property {RecordStatus} status
 * @property {UserProfileId} createdBy
 * @property {TimestampAest} createdAtAest
 * @property {UserProfileId} updatedBy
 * @property {TimestampAest} updatedAtAest
 * @property {string | null} name what the user called it, trimmed
 * @property {ExternalLinkText | null} link
 * @property {FilesystemPathText | null} path
 * @property {StoredFileLocation | null} fileLocation the file's place in the data folder, never its contents
 * @property {readonly RecordRef[]} links everything the entry is linked to, ascending by kind then id (C-008, C-009)
 */

// ------------------------------------------------------------------ what a consumer supplies

/**
 * The act a changing operation is performed under: registry's `Act` (registry section 3) plus
 * the platforms the act reaches, which is review-schedule's `ScheduleAct` (DEC-020). None of
 * the three is stored on an entry; all three are passed through to the entry C-011 writes,
 * where `madeForPlatformId` and `affectedPlatformIds` decide which platforms await the act
 * (`change-log` C-010). All three are required and never defaulted (C-011).
 *
 * `affectedPlatformIds` is the caller's statement, computed from `registry.platformsAffected`
 * over the records this entry is linked to. This module holds no link to a platform and cannot
 * compute it: importing `registry` to ask is the edge DEC-004 decomposed the modules to avoid
 * and DEC-018's reversal trigger names as a STOP (DEC-020).
 * @typedef {object} EntryAct
 * @property {ActiveProfile} profile who is performing the act; stamps the header
 * @property {PlatformId | null} madeForPlatformId the platform the user was working on, or null
 * @property {readonly PlatformId[]} affectedPlatformIds every platform the act reaches
 */

/**
 * What a consumer supplies to `createEntry`: any combination of the four, at least one of them
 * not null (C-001). `file` is the user's file as chosen; it is handed to `store.putStoredFile`
 * and never stored on the entry, which holds the location that call returns (C-003).
 * @typedef {object} EntryFields
 * @property {string | null} name
 * @property {string | null} link as the user typed it; branded on the way in (C-001)
 * @property {string | null} path as the user typed it; branded on the way in (C-001)
 * @property {IncomingFile | null} file
 */

/**
 * What a consumer supplies to `linkEntry`: the entry, and the one record to link it to. One
 * call, one link (C-008).
 * @typedef {object} EntryLinkFields
 * @property {ReferenceEntryId} entryId
 * @property {RecordRef} ref its `kind` is one of `LINKABLE_KINDS`
 */

// ------------------------------------------------------------------ what a change returns

/**
 * What a changing operation returns: the body as it now is, and the entry as it now is. The
 * body passed in is untouched (C-002); the consumer replaces its working body with `body` and
 * passes that to `store.save` when the user saves.
 * @typedef {{ body: DataBody, entry: ReferenceEntry }} EntryChange
 */

// ------------------------------------------------------------------ what a read returns

/**
 * Whether one entry's file is there to be opened, so the entry can be flagged wherever it is
 * listed (REQ-078, SL-10 criterion 4). `flagged` is true exactly when the entry has a
 * `fileLocation` whose file `store.checkStoredFiles` could not open, and `reason` is then that
 * call's reason; both are false and null for an entry with no file (C-010).
 *
 * This answers for a stored **file** and not for a `path`. A path is a place on some machine's
 * filesystem that no module can stat under DEC-003, so the path half of criterion 4 has no
 * mechanism here and none is promised; what it means is an open GATE ruling (DEC-022,
 * Consequences; SL-10 *Contracts touched*).
 * @typedef {object} EntryFileState
 * @property {ReferenceEntryId} entryId
 * @property {StoredFileLocation | null} location null when the entry carries no file
 * @property {boolean} flagged
 * @property {'missing' | 'inaccessible' | 'not-a-stored-file-location' | null} reason store's, unchanged (store C-019)
 */

// ------------------------------------------------------------------ error conditions

/**
 * C-001: `createEntry` given all four of `name`, `link`, `path`, and `file` absent. An entry
 * with none of them refers to nothing. The body is unchanged and no file is written.
 */
export class EmptyEntryError extends Error {
  constructor() {
    super('a reference entry carries at least one of a name, a link, a path, and a file');
    this.name = 'EmptyEntryError';
  }
}

/**
 * C-001: a `name`, `link`, or `path` given but empty once trimmed. A field the user left out
 * is null; a field they typed blank is refused rather than stored as an absence, so nothing
 * turns a typed value into a missing one. The body is unchanged and no file is written.
 */
export class InvalidFieldError extends Error {
  /** @param {'name' | 'link' | 'path'} field */
  constructor(field) {
    super(`a reference entry's ${field} is either absent or has something in it`);
    this.name = 'InvalidFieldError';
    this.field = field;
  }
}

/** C-008: `linkEntry` given an id no entry of the collection has, live or otherwise. */
export class UnknownEntryError extends Error {
  /** @param {string} id */
  constructor(id) {
    super('no reference entry has that id');
    this.name = 'UnknownEntryError';
    this.given = id;
  }
}

/** C-008: the entry has a status other than `live`. It is deleted, or retired by a later version. */
export class EntryNotLiveError extends Error {
  /** @param {RecordStatus} status */
  constructor(status) {
    super('a reference entry that is not live is not linked to anything further');
    this.name = 'EntryNotLiveError';
    this.status = status;
  }
}

/**
 * C-008: a `ref` whose `kind` is a `RecordKind` outside `LINKABLE_KINDS`. That the kind exists
 * is baseline's; that an entry may be linked to it is this contract's (REQ-030).
 */
export class UnlinkableKindError extends Error {
  /** @param {string} kind */
  constructor(kind) {
    super('a reference entry is linked to a hazard, causal factor, consequence, platform, control, or report');
    this.name = 'UnlinkableKindError';
    this.kind = kind;
  }
}

/** C-008: a `ref` that is not a kind and an id together. Whether the id names a record is not checked (C-008). */
export class InvalidRefError extends Error {
  /** @param {unknown} given */
  constructor(given) {
    super('a record is named by its kind and its id together');
    this.name = 'InvalidRefError';
    this.given = given;
  }
}

/** C-008: the entry's `links` already holds a ref deep-equal to this one. Linking twice is one link. */
export class DuplicateLinkError extends Error {
  /** @param {RecordRef} ref */
  constructor(ref) {
    super('that reference entry is already linked to that record');
    this.name = 'DuplicateLinkError';
    this.ref = ref;
  }
}

/** C-001, C-008: `act` missing, or `act.profile` missing or its id not a user profile id. */
export class MissingProfileError extends Error {
  /** @param {unknown} given */
  constructor(given) {
    super('a reference entry is stamped with the profile that performed the act');
    this.name = 'MissingProfileError';
    this.given = given;
  }
}

/**
 * C-011: `act.madeForPlatformId` absent or neither null nor a platform id, or
 * `act.affectedPlatformIds` absent or not a list of platform ids. Required and never
 * defaulted: the value that decides whose queue a change lands in is the one a caller must not
 * be able to forget (DEC-016, DEC-020).
 */
export class InvalidActError extends Error {
  /** @param {unknown} given */
  constructor(given) {
    super('an act names the platform it was made for and every platform it reaches');
    this.name = 'InvalidActError';
    this.given = given;
  }
}

/**
 * C-006: an entry of `collections['reference-entry']` this module cannot read. Every operation
 * rejects, so a register is never shown with an entry silently missing from it.
 */
export class MalformedEntryError extends Error {
  /**
   * @param {string} key the entry's key in the collection
   * @param {string} detail one sentence naming the field
   */
  constructor(key, detail) {
    super(`a reference entry cannot be read: ${detail}`);
    this.name = 'MalformedEntryError';
    this.key = key;
    this.detail = detail;
  }
}

// ------------------------------------------------------------------ operations: changing

/**
 * Create one entry from any combination of a name, a link, a path, and a file, at least one of
 * them given (REQ-028). When `fields.file` is not null it is kept in the data folder by
 * `store.putStoredFile` and the entry holds the location that call returned and nothing of the
 * contents (REQ-029). The fields are accepted before the file is written, so a rejected create
 * leaves no file behind (C-004). Rejects an entry with none of the four, a field given blank,
 * a missing profile, and an ill-formed act, changing nothing; a file that cannot be kept
 * rejects with store's own error and no entry is created (section 4 of CONTRACT.md).
 * C-001, C-002, C-003, C-004, C-007, C-011.
 * @param {DataBody} body
 * @param {EntryAct} act
 * @param {DataStore} store read and written only when `fields.file` is not null (C-007)
 * @param {EntryFields} fields
 * @returns {Promise<EntryChange>}
 */
export async function createEntry(body, act, store, fields) {
  return (await impl()).createEntry(body, act, store, fields);
}

/**
 * Link one entry to one hazard, causal factor, consequence, platform, control, or report
 * (REQ-030). The ref is stored on the entry and never resolved: this module does not ask
 * whether a record of that kind and id exists, is live, or is on a platform, and imports no
 * module that could tell it (C-008). Rejects an unknown or not-live entry, a ref that is not a
 * kind and an id, a kind outside `LINKABLE_KINDS`, a link the entry already holds, a missing
 * profile, and an ill-formed act, changing nothing.
 * C-002, C-007, C-008, C-009, C-011.
 * @param {DataBody} body
 * @param {EntryAct} act
 * @param {EntryLinkFields} fields
 * @returns {Promise<EntryChange>}
 */
export async function linkEntry(body, act, fields) {
  return (await impl()).linkEntry(body, act, fields);
}

// ------------------------------------------------------------------ operations: reading

/**
 * Every live entry, once each, in ascending order of `createdAtAest` then id, and nothing
 * else; empty when the body holds no such collection. Each entry carries what was entered,
 * exactly as stored, and everything it is linked to (C-005, C-009). Rejects only a malformed
 * entry. C-005, C-006, C-009.
 * @param {DataBody} body
 * @returns {Promise<readonly ReferenceEntry[]>}
 */
export async function listEntries(body) {
  return (await impl()).listEntries(body);
}

/**
 * One entry whatever its status, or null when no entry has the id — a read, so an id nothing
 * has is not an error (C-005). Its `links` are everything it is linked to, which is REQ-031's
 * half of this contract; resolving each ref to something a user can read is `views`' (C-009).
 * Rejects only a malformed entry. C-005, C-006, C-009.
 * @param {DataBody} body
 * @param {ReferenceEntryId} id
 * @returns {Promise<ReferenceEntry | null>}
 */
export async function getEntry(body, id) {
  return (await impl()).getEntry(body, id);
}

/**
 * Whether each live entry's file is still there, in `listEntries`' order, one result per entry
 * including those with no file (REQ-078). One call for the whole register, so every list is
 * flagged from one read of the folder rather than one read per row (store C-019). A file that
 * is not there is a value and never a rejection; only the data folder itself being unreadable
 * rejects, with store's own error. Answers for a stored file and not for a `path` (C-010).
 * C-006, C-007, C-010.
 * @param {DataBody} body
 * @param {DataStore} store
 * @returns {Promise<readonly EntryFileState[]>}
 */
export async function checkEntryFiles(body, store) {
  return (await impl()).checkEntryFiles(body, store);
}

// ------------------------------------------------------------------ implementation selection

/**
 * @typedef {object} ReferenceRegisterImplementation
 * @property {(body: DataBody, act: EntryAct, store: DataStore, fields: EntryFields) => Promise<EntryChange>} createEntry
 * @property {(body: DataBody, act: EntryAct, fields: EntryLinkFields) => Promise<EntryChange>} linkEntry
 * @property {(body: DataBody) => Promise<readonly ReferenceEntry[]>} listEntries
 * @property {(body: DataBody, id: ReferenceEntryId) => Promise<ReferenceEntry | null>} getEntry
 * @property {(body: DataBody, store: DataStore) => Promise<readonly EntryFileState[]>} checkEntryFiles
 */

/** @type {Promise<ReferenceRegisterImplementation> | null} */
let selected = null;

/** @returns {Promise<ReferenceRegisterImplementation>} */
function impl() {
  if (selected === null) {
    const env = /** @type {{ process?: { env?: Record<string, string | undefined> } }} */ (globalThis).process?.env;
    if (env?.REFERENCE_REGISTER_IMPL === 'null') {
      const nullDouble = './null_double.js'; // test-only; not a runtime source, so never inlined by the build
      selected = import(nullDouble);
    } else {
      selected = import('./src/reference-register.js');
    }
  }
  return selected;
}
