/**
 * Contract: store, version 4.0. The module's sole import surface (CORE-CON-003): every
 * other module reaches the data folder, and the browser's copy of the working state, through
 * the operations below and never through a handle of its own (DEC-004, DEC-005). Clause IDs
 * (C-nnn) are defined in CONTRACT.md beside this file and cited by the conformance suite.
 *
 * Every operation delegates to the selected implementation: `src/store.js` in production,
 * `null_double.js` when `STORE_IMPL=null` is set in the environment (CORE-TST-002, rung 1).
 * The null double is test-only and is never embedded in the built pivot.html, which is why
 * its specifier is held in a variable: the build inlines only quoted import specifiers.
 */

/** @typedef {import('../../baseline/schema.js').DataBody} DataBody */
/** @typedef {import('../../baseline/schema.js').SaveStamp} SaveStamp */
/** @typedef {import('../../baseline/schema.js').OpenFailure} OpenFailure */
/** @typedef {import('../../baseline/types.js').UserProfile} UserProfile */
/** @typedef {import('../../baseline/types.js').ActiveProfile} ActiveProfile */
/** @typedef {import('../../baseline/types.js').RecordRef} RecordRef */
/** @typedef {import('../../baseline/types.js').TimestampAest} TimestampAest */

// ------------------------------------------------------------------ data shapes

/**
 * The part of the browser's directory handle that `store` uses (DEC-003: the File System
 * Access API is the whole substrate). A real `FileSystemDirectoryHandle` satisfies it; a
 * conformance test supplies an in-memory one.
 * @typedef {Pick<FileSystemDirectoryHandle, 'name' | 'getFileHandle' | 'getDirectoryHandle'>} DataFolderHandle
 */

/**
 * An open data folder together with what this copy of Pivot last loaded, saved, restored,
 * recovered, or was told of (C-006, C-011, C-013, C-016). Opaque beyond `folderName`:
 * consumers hold it and pass it back, nothing more.
 * @typedef {object} DataStore
 * @property {string} folderName the chosen folder's name, for the screen that confirms the choice
 */

/**
 * What `load` returns: the stored data and the stamp of the save that wrote it, null when
 * the folder has never been saved to (C-007).
 * @typedef {object} LoadedData
 * @property {DataBody} body
 * @property {SaveStamp | null} lastSave
 */

/**
 * What `save` and `restore` return. `superseded` is the stamp found on disk when it differed
 * from the one this store last loaded, saved, or recovered, and `keptAs` is where that data
 * now lives, relative to the data folder (C-004); both are null when no other copy saved in
 * between (C-005). `mirrorError` is set when this store mirrors the working state and the
 * browser's copy could not be marked saved (C-015); the save itself completed.
 * @typedef {object} SaveOutcome
 * @property {SaveStamp} stamp the stamp written with this save
 * @property {SaveStamp | null} superseded
 * @property {string | null} keptAs
 * @property {StoreWriteError | null} mirrorError
 */

/**
 * Which data a file that failed its check stands for (C-012), so the message can say what
 * the user cannot rely on (REQ-006). A backup is told apart by the time in its name; a
 * superseded save by its file name.
 * @typedef {{ kind: 'stored-data' }
 *   | { kind: 'profiles' }
 *   | { kind: 'backup', takenAtAest: TimestampAest }
 *   | { kind: 'superseded-save' }} AffectedData
 */

/**
 * One file in the data folder that did not pass `checkFolder` (C-012).
 * @typedef {object} FileCheckFailure
 * @property {string} file path relative to the data folder
 * @property {OpenFailure | 'inaccessible'} reason
 * @property {string} detail one sentence
 * @property {AffectedData} affects
 */

/**
 * What `noteChange` did (C-013 to C-015). `changed` is false when the body equals the one
 * this store last held, and then nothing else happened. `backupFile` names the backup written,
 * relative to the data folder. The two errors are reported rather than thrown because the
 * change is already on screen and each write is independent of the other.
 * @typedef {object} ChangeOutcome
 * @property {boolean} changed
 * @property {string | null} backupFile
 * @property {StoreWriteError | null} backupError
 * @property {StoreWriteError | null} mirrorError
 */

/**
 * A kept backup, by name (C-014, C-017). Newest first in `listBackups`.
 * @typedef {object} BackupEntry
 * @property {string} file path relative to the data folder
 * @property {TimestampAest} takenAtAest from the file name
 */

/**
 * A save state file the user chose from outside the data folder (REQ-064): its name as the
 * browser gave it and its whole text. `chooseSaveStateFile` makes one; a test constructs one.
 * @typedef {object} SaveStateFile
 * @property {string} name
 * @property {string} text
 */

/**
 * Where a restore comes from (C-017). A backup by its path relative to the data folder, as
 * `listBackups` gives it, or a save state file already read.
 * @typedef {{ kind: 'backup', file: string } | { kind: 'save-state', saveState: SaveStateFile }} RestoreSource
 */

/**
 * What a restore will write, read and checked but not yet written (C-017): the pause in which
 * the caller warns the user and waits for confirmation (REQ-075).
 * @typedef {object} RestorePlan
 * @property {RestoreSource} source
 * @property {DataBody} body the data the restore will write
 * @property {SaveStamp} stampInFile the stamp the file was sealed with
 * @property {SaveStamp | null} replaces the stamp of the stored data this store last loaded or saved
 */

/**
 * Working state the browser's storage holds that the folder never received (C-016).
 * @typedef {object} RecoverableState
 * @property {DataBody} body
 * @property {TimestampAest} mirroredAtAest when the last change to it was mirrored
 * @property {SaveStamp | null} loadedStamp the stamp of the stored data it was changed from
 */

/**
 * A file handed to `putStoredFile` to be kept in the data folder (C-018, REQ-029): the name
 * the user's file had, and its bytes. A browser `File` supplies both; a conformance test
 * constructs one. The bytes are the file exactly as the user chose it, not an envelope.
 * @typedef {object} IncomingFile
 * @property {string} name the file's name as the user's machine gave it
 * @property {Uint8Array} bytes the whole file
 */

/**
 * Where a stored file lives, as `putStoredFile` returned it: a path relative to the data
 * folder, under `schema.DATA_FOLDER.files`. Opaque to consumers - a record field holds it
 * and hands it back to `checkStoredFiles`, and nothing else may be read from or built into
 * it (C-018). The folder's layout is not promised.
 * @typedef {string} StoredFileLocation
 */

/**
 * Whether one stored file is there to be opened (C-019), so an entry that has lost its file
 * can be flagged wherever it is listed (REQ-078). `present: false` is an answer, never an
 * error. `reason` is null exactly when `present` is true.
 * @typedef {object} StoredFilePresence
 * @property {StoredFileLocation} location as it was given, unchanged
 * @property {boolean} present
 * @property {'missing' | 'inaccessible' | 'not-a-stored-file-location' | null} reason
 */

/**
 * The part of the browser's file handle that `store` uses to write an export: a file outside
 * the data folder that the user chose (C-020, DEC-030). A real `FileSystemFileHandle` from
 * `chooseExportFile` satisfies it; a conformance test supplies an in-memory one. What is
 * written through it is text the caller gives; this module does not know what the text is.
 * @typedef {Pick<FileSystemFileHandle, 'name' | 'createWritable'>} ExportFileHandle
 */

// ------------------------------------------------------------------ error conditions

/** C-002, C-013: `save`, `restore`, or `noteChange` called with no active profile. Nothing was written. */
export class NoActiveProfileError extends Error {
  constructor() {
    super('no user profile is selected; nothing can be saved until one is');
    this.name = 'NoActiveProfileError';
  }
}

/** C-003: an operation that needs a loaded store was called before `load` completed. Nothing was written. */
export class NotLoadedError extends Error {
  constructor() {
    super('the data folder has not been loaded by this copy of Pivot; load before saving');
    this.name = 'NotLoadedError';
  }
}

/**
 * C-007, C-008, C-016, C-017: a file exists but could not be read as Pivot data, or the
 * folder or the browser's storage could not be read. Nothing from the file is returned.
 * `file` is relative to the data folder, or the save state file's name, or the browser
 * storage key (section 3).
 */
export class StoreReadError extends Error {
  /**
   * @param {string} file
   * @param {OpenFailure | 'inaccessible'} reason
   * @param {string} detail one sentence
   */
  constructor(file, reason, detail) {
    super(`${file}: ${reason}: ${detail}`);
    this.name = 'StoreReadError';
    this.file = file;
    this.reason = reason;
    this.detail = detail;
  }
}

/**
 * C-004, C-009, C-010, C-013 to C-016, C-018, C-020: a write did not complete. `stage` says
 * which write; a failure at `superseded-copy` or `data` leaves `data.json` as it was (C-004,
 * C-010), one at `stored-file` leaves no file under `files/` (C-018), and one at `export`
 * leaves the export file as it was (C-020). `file` is relative to the data folder, or the
 * browser storage key at stage `mirror`, or the export handle's `name` at stage `export`.
 */
export class StoreWriteError extends Error {
  /**
   * @param {string} file
   * @param {'superseded-copy' | 'data' | 'profiles' | 'backup' | 'backup-prune' | 'mirror' | 'stored-file' | 'export'} stage
   * @param {unknown} cause
   */
  constructor(file, stage, cause) {
    super(`${file}: the ${stage} write did not complete`, { cause });
    this.name = 'StoreWriteError';
    this.file = file;
    this.stage = stage;
  }
}

// ------------------------------------------------------------------ operations: folder and profiles

/**
 * Ask the user for the data folder (REQ-069) and open it. Browser only: shows the
 * directory picker with read and write access. Rejects when the user cancels, or when the
 * browser denies access to the folder (ASM-001; DEC-003 reversal trigger). Verified by
 * demonstration on a target machine (SL-01 criterion 1), not by the conformance suite.
 * @returns {Promise<DataStore>}
 */
export async function chooseDataFolder() {
  return (await impl()).chooseDataFolder();
}

/**
 * Open a folder already in hand. Reads nothing that needs a profile and writes nothing
 * (C-002, C-009).
 * @param {DataFolderHandle} handle
 * @returns {Promise<DataStore>}
 */
export async function openDataFolder(handle) {
  return (await impl()).openDataFolder(handle);
}

/**
 * Every profile stored in the folder, in no promised order; empty when none has been
 * created. Needs no active profile. C-008.
 * @param {DataStore} store
 * @returns {Promise<readonly UserProfile[]>}
 */
export async function readProfiles(store) {
  return (await impl()).readProfiles(store);
}

/**
 * Add a profile, or replace the stored profile with the same id. Never removes another.
 * Needs no active profile. C-008, C-009.
 * @param {DataStore} store
 * @param {UserProfile} profile
 * @returns {Promise<void>}
 */
export async function putProfile(store, profile) {
  return (await impl()).putProfile(store, profile);
}

// ------------------------------------------------------------------ operations: stored data

/**
 * The stored data, or the empty body when the folder has never been saved to. Remembers
 * the stamp and body it read for the next `save`, `unsavedChanges`, and `noteChange`.
 * C-001, C-006, C-007.
 * @param {DataStore} store
 * @returns {Promise<LoadedData>}
 */
export async function load(store) {
  return (await impl()).load(store);
}

/**
 * Check every file Pivot wrote in the folder against the integrity check written with it,
 * and list those that fail with the data each stands for; empty when all pass. Writes
 * nothing. C-012.
 * @param {DataStore} store
 * @returns {Promise<readonly FileCheckFailure[]>}
 */
export async function checkFolder(store) {
  return (await impl()).checkFolder(store);
}

/**
 * Write `body` as the stored data, whole or not at all, keeping another user's save first
 * when one has happened since this store last loaded, saved, or recovered.
 * C-001 to C-006, C-009, C-010, C-015.
 * @param {DataStore} store
 * @param {ActiveProfile} profile the profile this session acts as (REQ-055)
 * @param {DataBody} body
 * @returns {Promise<SaveOutcome>}
 */
export async function save(store, profile, body) {
  return (await impl()).save(store, profile, body);
}

/**
 * The records whose content in `body` differs from the stored data as this store last
 * loaded or saved it: added, changed, or removed, by kind and id. Reads and writes nothing.
 * C-011.
 * @param {DataStore} store
 * @param {DataBody} body
 * @returns {Promise<readonly RecordRef[]>}
 */
export async function unsavedChanges(store, body) {
  return (await impl()).unsavedChanges(store, body);
}

// ------------------------------------------------------------------ operations: stored files

/**
 * Keep `file` in the data folder and return where it was put, so the record that carries it
 * holds the location and never the contents (REQ-029). The file is there whole when this
 * resolves and not there at all when it rejects; nothing already under `files/` is replaced
 * or removed, so each call returns a location no earlier call returned. Needs an active
 * profile, not a load. C-009, C-018.
 * @param {DataStore} store
 * @param {ActiveProfile} profile the profile this session acts as (REQ-055)
 * @param {IncomingFile} file
 * @returns {Promise<StoredFileLocation>}
 */
export async function putStoredFile(store, profile, file) {
  return (await impl()).putStoredFile(store, profile, file);
}

/**
 * Whether each of `locations` is there to be opened, in the order given, one result per
 * location including repeats. A file that is not there is `present: false`, never a
 * rejection, so a list can be flagged row by row without a failure path per row (REQ-078).
 * Reads names only; writes nothing. C-019.
 * @param {DataStore} store
 * @param {readonly StoredFileLocation[]} locations
 * @returns {Promise<readonly StoredFilePresence[]>}
 */
export async function checkStoredFiles(store, locations) {
  return (await impl()).checkStoredFiles(store, locations);
}

// ------------------------------------------------------------------ operations: working state

/**
 * Tell the store the working state has changed to `body`: mirror it to the browser's storage,
 * and write a backup of it when more than an hour has passed since the newest kept backup.
 * C-013, C-014, C-015.
 * @param {DataStore} store
 * @param {ActiveProfile} profile
 * @param {DataBody} body
 * @returns {Promise<ChangeOutcome>}
 */
export async function noteChange(store, profile, body) {
  return (await impl()).noteChange(store, profile, body);
}

/**
 * Working state in the browser's storage that was never saved to a folder, or null. Reads
 * the browser's storage only; writes nothing. C-016.
 * @param {DataStore} store
 * @returns {Promise<RecoverableState | null>}
 */
export async function readRecoverable(store) {
  return (await impl()).readRecoverable(store);
}

/**
 * Take up recoverable working state: the store compares its next save against the stamp that
 * state was changed from, and treats `state.body` as the working state it last held. Writes
 * nothing to the folder. C-016.
 * @param {DataStore} store
 * @param {RecoverableState} state as `readRecoverable` gave it
 * @returns {Promise<DataBody>} the recovered body
 */
export async function recoverWorkingState(store, state) {
  return (await impl()).recoverWorkingState(store, state);
}

/**
 * Remove the working state from the browser's storage. Writes nothing to the folder. C-016.
 * @param {DataStore} store
 * @returns {Promise<void>}
 */
export async function discardWorkingState(store) {
  return (await impl()).discardWorkingState(store);
}

// ------------------------------------------------------------------ operations: restore

/**
 * Every kept backup in the folder, newest first. Reads names only. C-014, C-017.
 * @param {DataStore} store
 * @returns {Promise<readonly BackupEntry[]>}
 */
export async function listBackups(store) {
  return (await impl()).listBackups(store);
}

/**
 * Ask the user for a save state file (REQ-064). Browser only: shows the file picker and reads
 * the chosen file. Rejects when the user cancels. Verified by demonstration, not by the
 * conformance suite.
 * @returns {Promise<SaveStateFile>}
 */
export async function chooseSaveStateFile() {
  return (await impl()).chooseSaveStateFile();
}

/**
 * Read and check what a restore would write, and write nothing. C-017.
 * @param {DataStore} store
 * @param {RestoreSource} source
 * @returns {Promise<RestorePlan>}
 */
export async function prepareRestore(store, source) {
  return (await impl()).prepareRestore(store, source);
}

/**
 * Write a prepared restore's body as the stored data, exactly as `save` writes a body.
 * C-017, and through it C-001 to C-006, C-010, C-015.
 * @param {DataStore} store
 * @param {ActiveProfile} profile
 * @param {RestorePlan} plan
 * @returns {Promise<SaveOutcome>}
 */
export async function restore(store, profile, plan) {
  return (await impl()).restore(store, profile, plan);
}

// ------------------------------------------------------------------ operations: export

/**
 * Ask the user where to write an exported file (SL-08 criterion 3). Browser only: shows the
 * save file picker with `suggestedName` offered, and resolves with the chosen file's handle.
 * Writes nothing itself (C-009). Rejects when the user cancels or the browser denies access,
 * with the browser's error. Verified by demonstration, not by the conformance suite.
 * @param {string} suggestedName the name the picker offers first; the user may change it
 * @returns {Promise<ExportFileHandle>}
 */
export async function chooseExportFile(suggestedName) {
  return (await impl()).chooseExportFile(suggestedName);
}

/**
 * Write `text` to the file the user chose, replacing what it held: whole when this resolves,
 * as it was when this rejects. Touches nothing in the data folder or the browser's storage,
 * needs no store and no profile, and keeps nothing of the text or the handle. C-009, C-020.
 * @param {ExportFileHandle} target as `chooseExportFile` resolved with it
 * @param {string} text written as UTF-8, exactly as given
 * @returns {Promise<void>}
 */
export async function writeExportFile(target, text) {
  return (await impl()).writeExportFile(target, text);
}

// ------------------------------------------------------------------ implementation selection

/**
 * @typedef {object} StoreImplementation
 * @property {() => Promise<DataStore>} chooseDataFolder
 * @property {(handle: DataFolderHandle) => Promise<DataStore>} openDataFolder
 * @property {(store: DataStore) => Promise<readonly UserProfile[]>} readProfiles
 * @property {(store: DataStore, profile: UserProfile) => Promise<void>} putProfile
 * @property {(store: DataStore) => Promise<LoadedData>} load
 * @property {(store: DataStore) => Promise<readonly FileCheckFailure[]>} checkFolder
 * @property {(store: DataStore, profile: ActiveProfile, body: DataBody) => Promise<SaveOutcome>} save
 * @property {(store: DataStore, body: DataBody) => Promise<readonly RecordRef[]>} unsavedChanges
 * @property {(store: DataStore, profile: ActiveProfile, file: IncomingFile) => Promise<StoredFileLocation>} putStoredFile
 * @property {(store: DataStore, locations: readonly StoredFileLocation[]) => Promise<readonly StoredFilePresence[]>} checkStoredFiles
 * @property {(store: DataStore, profile: ActiveProfile, body: DataBody) => Promise<ChangeOutcome>} noteChange
 * @property {(store: DataStore) => Promise<RecoverableState | null>} readRecoverable
 * @property {(store: DataStore, state: RecoverableState) => Promise<DataBody>} recoverWorkingState
 * @property {(store: DataStore) => Promise<void>} discardWorkingState
 * @property {(store: DataStore) => Promise<readonly BackupEntry[]>} listBackups
 * @property {() => Promise<SaveStateFile>} chooseSaveStateFile
 * @property {(store: DataStore, source: RestoreSource) => Promise<RestorePlan>} prepareRestore
 * @property {(store: DataStore, profile: ActiveProfile, plan: RestorePlan) => Promise<SaveOutcome>} restore
 * @property {(suggestedName: string) => Promise<ExportFileHandle>} chooseExportFile
 * @property {(target: ExportFileHandle, text: string) => Promise<void>} writeExportFile
 */

/** @type {Promise<StoreImplementation> | null} */
let selected = null;

/** @returns {Promise<StoreImplementation>} */
function impl() {
  if (selected === null) {
    const env = /** @type {{ process?: { env?: Record<string, string | undefined> } }} */ (globalThis).process?.env;
    if (env?.STORE_IMPL === 'null') {
      const nullDouble = './null_double.js'; // test-only; not a runtime source, so never inlined by the build
      selected = import(nullDouble);
    } else {
      selected = import('./src/store.js');
    }
  }
  return selected;
}
