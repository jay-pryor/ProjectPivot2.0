/**
 * store, implementing contract version 4.0 (modules/store/CONTRACT.md). Selected by
 * contract.js unless STORE_IMPL=null. Clause IDs (C-nnn) cite the contract.
 *
 * The data folder is reached only through the three members of the directory handle the
 * contract names (`name`, `getFileHandle`, `getDirectoryHandle`); a subfolder's handle is a
 * whole directory handle and is listed with `values()`. Every write goes through one
 * `createWritable` stream, which the File System Access API commits on `close` and discards
 * on `abort` (DEC-003), so a file is written whole or not at all. The browser's storage is
 * `globalThis.localStorage` as found at the call (DEC-009).
 */

import {
  BACKUP_FILE_RE, BACKUP_INTERVAL_MS, BACKUP_RING_SIZE, BROWSER_STORAGE_KEY, DATA_FOLDER, SCHEMA_VERSION,
  backupFileName, canonicalJson, emptyDataBody, freshStamp, open, sameStamp, seal, serialize, supersededFileName,
} from '../../../baseline/schema.js';
import { timestampAest, userProfileId } from '../../../baseline/types.js';
import { epochMsOf, nowAest } from '../../../baseline/clock.js';
import { fault_point } from '../../../baseline/faults.js';
import { NoActiveProfileError, NotLoadedError, StoreReadError, StoreWriteError } from '../contract.js';

/** @typedef {import('../contract.js').StoreImplementation} Impl */
/** @typedef {import('../contract.js').DataStore} DataStore */
/** @typedef {import('../contract.js').DataFolderHandle} DataFolderHandle */
/** @typedef {import('../contract.js').SaveOutcome} SaveOutcome */
/** @typedef {import('../contract.js').FileCheckFailure} FileCheckFailure */
/** @typedef {import('../contract.js').AffectedData} AffectedData */
/** @typedef {import('../contract.js').StoredFilePresence} StoredFilePresence */
/** @typedef {import('../contract.js').ExportFileHandle} ExportFileHandle */
/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */
/** @typedef {import('../../../baseline/schema.js').ProfilesBody} ProfilesBody */
/** @typedef {import('../../../baseline/schema.js').SaveStamp} SaveStamp */
/** @typedef {import('../../../baseline/schema.js').EnvelopeKind} EnvelopeKind */
/** @typedef {import('../../../baseline/schema.js').WorkingStateMirror} WorkingStateMirror */
/** @typedef {import('../../../baseline/types.js').ActiveProfile} ActiveProfile */
/** @typedef {import('../../../baseline/types.js').UserProfile} UserProfile */
/** @typedef {import('../../../baseline/types.js').RecordRef} RecordRef */
/** @typedef {import('../../../baseline/types.js').RecordKind} RecordKind */
/** @typedef {import('../../../baseline/types.js').TimestampAest} TimestampAest */
/** @typedef {ConstructorParameters<typeof StoreWriteError>[1]} WriteStage */

/**
 * The part of a directory handle this module writes through. A subfolder handle from
 * `getDirectoryHandle` is a whole `FileSystemDirectoryHandle`; the data folder itself is only
 * `DataFolderHandle` (section 3), so `removeEntry` and listing are used on subfolders alone.
 * @typedef {Pick<FileSystemDirectoryHandle, 'getFileHandle' | 'removeEntry'>} WritableDir
 */

/**
 * Listing a subfolder. The async iterators are in the DOM's asynciterable library, which the
 * type check does not load, so the one member used is declared here.
 * @typedef {{ values(): AsyncIterable<{ kind: 'file' | 'directory', name: string }> }} ListableDir
 */

/**
 * What this copy of Pivot last loaded, saved, restored, recovered, or was told of.
 * @typedef {object} StoreState
 * @property {DataFolderHandle} handle
 * @property {boolean} loaded a `load` has completed (C-003)
 * @property {SaveStamp | null} recordStamp the stamp last loaded, saved, or restored: what a restore replaces (C-017)
 * @property {SaveStamp | null} compareStamp that, or the stamp recovered working state was changed from: what the next save compares (C-004, C-005, C-016)
 * @property {DataBody | null} stored the stored data as last loaded, saved, or restored (C-011)
 * @property {DataBody | null} working the working state last held (C-013)
 * @property {boolean} mirrors this store has noted a change or recovered, so its saves mark the browser's copy (C-015)
 */

/** @type {WeakMap<DataStore, StoreState>} */
const states = new WeakMap();

const BACKUPS = DATA_FOLDER.backups;
const SUPERSEDED = DATA_FOLDER.supersededSaves;
const FILES = DATA_FOLDER.files;
const SUPERSEDED_FILE_RE = /^data-\d{8}-\d{6}-[0-9a-f]{8}\.json$/;
const BACKUP_NAME_TIME_RE = /^data-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.json$/;

// ------------------------------------------------------------------ small helpers

/**
 * @param {DataStore} store
 * @returns {StoreState}
 */
function stateOf(store) {
  const state = states.get(store);
  if (state === undefined) throw new TypeError('not a DataStore opened by openDataFolder');
  return state;
}

/**
 * @param {unknown} e
 * @returns {string}
 */
function errorName(e) {
  return e !== null && typeof e === 'object' && 'name' in e ? String(e.name) : '';
}

/**
 * @param {unknown} e
 * @returns {string}
 */
function detailOf(e) {
  return e instanceof Error ? e.message : String(e);
}

/**
 * A copy as it would come back from the folder: JSON in, JSON out.
 * @template T
 * @param {T} value
 * @returns {T}
 */
function copyOf(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Deep equality as the folder sees it: key order ignored, array order kept.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function sameData(a, b) {
  return canonicalJson(a) === canonicalJson(b);
}

/**
 * @param {string} text
 * @returns {Uint8Array}
 */
function utf8(text) {
  return new TextEncoder().encode(text);
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {value is SaveStamp}
 */
function isStamp(value) {
  return isPlainObject(value)
    && typeof value.savedByProfileId === 'string'
    && typeof value.savedAtAest === 'string'
    && typeof value.token === 'string';
}

/**
 * @param {unknown} value
 * @returns {value is DataBody}
 */
function isDataBody(value) {
  return isPlainObject(value)
    && isPlainObject(value.collections)
    && isPlainObject(value.sequences)
    && typeof value.sequences.hazard === 'number';
}

/**
 * @param {unknown} value
 * @returns {value is ProfilesBody}
 */
function isProfilesBody(value) {
  return isPlainObject(value) && isPlainObject(value.profiles);
}

/**
 * C-002: an `ActiveProfile` with a valid user profile id, or nothing may be written.
 * @param {unknown} profile
 * @returns {asserts profile is ActiveProfile}
 */
function requireProfile(profile) {
  if (!isPlainObject(profile)) throw new NoActiveProfileError();
  try {
    userProfileId.parse(/** @type {string} */ (profile.id));
  } catch {
    throw new NoActiveProfileError();
  }
}

/**
 * @param {StoreState} state
 */
function requireLoaded(state) {
  if (!state.loaded) throw new NotLoadedError();
}

/**
 * The time in a backup's name, or null when the name is not a kept backup's.
 * @param {string} name a file name under backups/
 * @returns {TimestampAest | null}
 */
function backupTime(name) {
  if (!BACKUP_FILE_RE.test(name)) return null;
  const m = /** @type {RegExpExecArray} */ (BACKUP_NAME_TIME_RE.exec(name));
  try {
    return timestampAest(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+10:00`);
  } catch {
    return null;
  }
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isEntryName(name) {
  return name !== '' && name !== '.' && name !== '..' && !name.includes('/') && !name.includes('\\');
}

// ------------------------------------------------------------------ the folder

/**
 * A subfolder of the data folder, or null when it is not there. Any other failure is thrown.
 * @param {DataFolderHandle} root
 * @param {string} name
 * @returns {Promise<FileSystemDirectoryHandle | null>}
 */
async function subfolder(root, name) {
  try {
    return await root.getDirectoryHandle(name);
  } catch (e) {
    if (errorName(e) === 'NotFoundError') return null;
    throw e;
  }
}

/**
 * The names of the files directly in a subfolder, sorted.
 * @param {FileSystemDirectoryHandle} dir
 * @returns {Promise<string[]>}
 */
async function fileNamesIn(dir) {
  /** @type {string[]} */
  const names = [];
  for await (const entry of /** @type {ListableDir} */ (/** @type {unknown} */ (dir)).values()) {
    if (entry.kind === 'file') names.push(entry.name);
  }
  return names.sort();
}

/**
 * Whether the data folder itself cannot be read (section 4: the only failure `checkFolder` and
 * `checkStoredFiles` reject for). The data folder's handle has no listing (section 3), so it is
 * probed by look-up: any look-up that finds an entry or reports it absent shows the folder
 * answers; only when every one is refused is the folder itself unreadable.
 * @param {DataFolderHandle} root
 * @returns {Promise<boolean>}
 */
async function folderUnreadable(root) {
  /** @type {(() => Promise<unknown>)[]} */
  const probes = [
    () => root.getFileHandle(DATA_FOLDER.data),
    () => root.getFileHandle(DATA_FOLDER.profiles),
    () => root.getDirectoryHandle(BACKUPS),
    () => root.getDirectoryHandle(SUPERSEDED),
    () => root.getDirectoryHandle(FILES),
  ];
  for (const probe of probes) {
    try {
      await probe();
      return false;
    } catch (e) {
      const name = errorName(e);
      if (name === 'NotFoundError' || name === 'TypeMismatchError') return false;
    }
  }
  return true;
}

/**
 * A file's bytes, or null when it is not there.
 * @param {Pick<FileSystemDirectoryHandle, 'getFileHandle'>} dir
 * @param {string} name
 * @param {string} rel the file relative to the data folder, for the error
 * @returns {Promise<Uint8Array | null>}
 */
async function readBytes(dir, name, rel) {
  /** @type {FileSystemFileHandle} */
  let handle;
  try {
    handle = await dir.getFileHandle(name);
  } catch (e) {
    if (errorName(e) === 'NotFoundError') return null;
    throw new StoreReadError(rel, 'inaccessible', detailOf(e));
  }
  try {
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch (e) {
    throw new StoreReadError(rel, 'inaccessible', detailOf(e));
  }
}

/**
 * Open a file's text as the envelope kind its name calls for (C-007, C-008, C-012, C-017).
 * @param {string} text
 * @param {string} file named in the error
 * @param {EnvelopeKind} kind
 * @returns {Promise<import('../../../baseline/schema.js').Envelope<unknown>>}
 */
async function openAs(text, file, kind) {
  const result = await open(text);
  if (!result.ok) throw new StoreReadError(file, result.reason, result.detail);
  const envelope = result.envelope;
  if (envelope.kind !== kind) {
    throw new StoreReadError(file, 'not-a-pivot-file', `the file holds Pivot ${String(envelope.kind)} data, not ${kind} data`);
  }
  if (kind === 'data' && !(isStamp(envelope.stamp) && isDataBody(envelope.body))) {
    throw new StoreReadError(file, 'not-a-pivot-file', 'the file is not stored data with a save stamp');
  }
  if (kind === 'profiles' && !isProfilesBody(envelope.body)) {
    throw new StoreReadError(file, 'not-a-pivot-file', 'the file does not hold user profiles');
  }
  return envelope;
}

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function textOf(bytes) {
  return new TextDecoder().decode(bytes);
}

/**
 * Write one file whole through one stream, committed on close (C-004, C-010, C-018 ordering).
 * On any failure the stream is aborted and a file this call created is removed, so nothing is
 * left half written or empty. A fault point armed at `point` fires after the bytes are staged
 * and before the commit, and its error propagates as armed.
 * @param {WritableDir} dir
 * @param {string} name
 * @param {Uint8Array} bytes
 * @param {string} rel relative to the data folder, for the error
 * @param {WriteStage} stage
 * @param {string | null} point
 */
async function writeWhole(dir, name, bytes, rel, stage, point) {
  let existed = true;
  try {
    await dir.getFileHandle(name);
  } catch (e) {
    if (errorName(e) === 'NotFoundError') existed = false;
  }
  /** @type {FileSystemWritableFileStream | null} */
  let writable = null;
  const undo = async () => {
    if (writable !== null) {
      try {
        await writable.abort();
      } catch {
        // already closed or errored; nothing was committed
      }
    }
    if (!existed) {
      try {
        await dir.removeEntry(name);
      } catch {
        // the entry the look-up created could not be removed; the caller is told the write failed
      }
    }
  };
  try {
    const handle = await dir.getFileHandle(name, { create: true });
    writable = await handle.createWritable();
    await writable.write(/** @type {BufferSource} */ (bytes));
  } catch (e) {
    await undo();
    throw new StoreWriteError(rel, stage, e);
  }
  if (point !== null) {
    try {
      fault_point(point);
    } catch (e) {
      await undo();
      throw e;
    }
  }
  try {
    await writable.close();
  } catch (e) {
    writable = null;
    await undo();
    throw new StoreWriteError(rel, stage, e);
  }
}

// ------------------------------------------------------------------ the browser's storage

/**
 * @returns {Storage | null} the browser's storage as found at the call, or null when absent
 */
function browserStorage() {
  const found = /** @type {{ localStorage?: Storage | null }} */ (globalThis).localStorage;
  return found ?? null;
}

/**
 * Write the mirror (C-015). Never throws: a failure is the outcome's `mirrorError`.
 * @param {WorkingStateMirror} mirror
 * @returns {StoreWriteError | null}
 */
function writeMirror(mirror) {
  try {
    const storage = browserStorage();
    if (storage === null) throw new Error('the browser\'s storage is not available');
    storage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(mirror));
    return null;
  } catch (e) {
    return new StoreWriteError(BROWSER_STORAGE_KEY, 'mirror', e);
  }
}

/**
 * The mirror under the key, or null when there is none (C-016, section 4).
 * @returns {WorkingStateMirror | null}
 */
function readMirror() {
  /** @type {string | null} */
  let text;
  try {
    const storage = browserStorage();
    if (storage === null) throw new Error('the browser\'s storage is not available');
    text = storage.getItem(BROWSER_STORAGE_KEY);
  } catch (e) {
    throw new StoreReadError(BROWSER_STORAGE_KEY, 'inaccessible', detailOf(e));
  }
  if (text === null) return null;
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new StoreReadError(BROWSER_STORAGE_KEY, 'unreadable', detailOf(e));
  }
  if (!isPlainObject(parsed) || typeof parsed.schemaVersion !== 'number') {
    throw new StoreReadError(BROWSER_STORAGE_KEY, 'not-a-pivot-file', 'the value is not Pivot\'s working state');
  }
  if (parsed.schemaVersion > SCHEMA_VERSION) {
    throw new StoreReadError(BROWSER_STORAGE_KEY, 'newer-schema', `written by a newer Pivot (schema ${parsed.schemaVersion}; this one reads up to ${SCHEMA_VERSION})`);
  }
  let timed = false;
  try {
    timestampAest(/** @type {string} */ (parsed.mirroredAtAest));
    timed = true;
  } catch {
    timed = false;
  }
  const shaped = timed
    && typeof parsed.unsaved === 'boolean'
    && (parsed.loadedStamp === null || isStamp(parsed.loadedStamp))
    && isDataBody(parsed.body);
  if (!shaped) throw new StoreReadError(BROWSER_STORAGE_KEY, 'not-a-pivot-file', 'the value is not Pivot\'s working state');
  return /** @type {WorkingStateMirror} */ (/** @type {unknown} */ (parsed));
}

// ------------------------------------------------------------------ saving

/**
 * Keep the data file as found under Superseded Saves before it is overwritten (C-004). A copy
 * already there with the same bytes (a retry after an interrupted save) is left as it is.
 * @param {DataFolderHandle} root
 * @param {Uint8Array} found
 * @param {SaveStamp} stampFound
 * @returns {Promise<string>} the copy, relative to the data folder
 */
async function keepSuperseded(root, found, stampFound) {
  const name = supersededFileName(stampFound);
  const rel = `${SUPERSEDED}/${name}`;
  /** @type {FileSystemDirectoryHandle} */
  let dir;
  try {
    dir = await root.getDirectoryHandle(SUPERSEDED, { create: true });
  } catch (e) {
    throw new StoreWriteError(rel, 'superseded-copy', e);
  }
  try {
    const already = await readBytes(dir, name, rel);
    if (already !== null && already.length === found.length && already.every((b, i) => b === found[i])) return rel;
  } catch {
    // unreadable: write the copy
  }
  await writeWhole(dir, name, found, rel, 'superseded-copy', null);
  return rel;
}

/**
 * `save` and `restore` alike (C-001 to C-006, C-010, C-015, C-017).
 * @param {DataStore} store
 * @param {ActiveProfile} profile
 * @param {DataBody} body
 * @returns {Promise<SaveOutcome>}
 */
async function writeStoredData(store, profile, body) {
  requireProfile(profile);
  const state = stateOf(store);
  requireLoaded(state);
  const root = state.handle;

  /** @type {SaveStamp | null} */
  let superseded = null;
  /** @type {string | null} */
  let keptAs = null;
  const found = await readBytes(root, DATA_FOLDER.data, DATA_FOLDER.data);
  if (found !== null) {
    // A data.json that does not open is refused rather than overwritten: nothing could be kept of it.
    const onDisk = /** @type {SaveStamp} */ ((await openAs(textOf(found), DATA_FOLDER.data, 'data')).stamp);
    if (!sameStamp(onDisk, state.compareStamp)) {
      keptAs = await keepSuperseded(root, found, onDisk);
      superseded = onDisk;
      fault_point('store.save.superseded-copied');
    }
  }

  const stamp = freshStamp(profile.id);
  const envelope = await seal('data', body, stamp);
  await writeWhole(/** @type {WritableDir} */ (/** @type {unknown} */ (root)), DATA_FOLDER.data, utf8(serialize(envelope)), DATA_FOLDER.data, 'data', 'store.save.data-staged');
  fault_point('store.save.data-written');

  state.recordStamp = stamp;
  state.compareStamp = stamp;
  state.stored = copyOf(body);
  state.working = copyOf(body);

  const mirrorError = state.mirrors
    ? writeMirror({ schemaVersion: SCHEMA_VERSION, mirroredAtAest: nowAest(), unsaved: false, loadedStamp: stamp, body })
    : null;
  return { stamp: copyOf(stamp), superseded, keptAs, mirrorError };
}

// ------------------------------------------------------------------ backups

/**
 * Every kept backup's name under backups/, oldest first. Empty when the subfolder is absent.
 * @param {DataFolderHandle} root
 * @returns {Promise<string[]>}
 */
async function backupNames(root) {
  const dir = await subfolder(root, BACKUPS);
  if (dir === null) return [];
  return (await fileNamesIn(dir)).filter((name) => backupTime(name) !== null);
}

/**
 * Remove the oldest backups until the ring holds at most 72 (C-014), stopping at the first
 * removal that fails so that no backup newer than one kept is removed.
 * @param {DataFolderHandle} root
 * @param {string} justWritten the new backup's name, never removed
 * @returns {Promise<StoreWriteError | null>}
 */
async function pruneRing(root, justWritten) {
  /** @type {string[]} */
  let names;
  /** @type {FileSystemDirectoryHandle | null} */
  let dir;
  try {
    dir = await subfolder(root, BACKUPS);
    names = dir === null ? [] : (await fileNamesIn(dir)).filter((name) => backupTime(name) !== null);
  } catch (e) {
    return new StoreWriteError(BACKUPS, 'backup-prune', e);
  }
  while (dir !== null && names.length > BACKUP_RING_SIZE) {
    const oldest = /** @type {string} */ (names.shift());
    if (oldest === justWritten) break;
    try {
      await dir.removeEntry(oldest);
    } catch (e) {
      return new StoreWriteError(`${BACKUPS}/${oldest}`, 'backup-prune', e);
    }
  }
  return null;
}

// ------------------------------------------------------------------ checks

/**
 * One Pivot file's check (C-012): null when it passes or is not there.
 * @param {Pick<FileSystemDirectoryHandle, 'getFileHandle'>} dir
 * @param {string} name
 * @param {string} rel
 * @param {EnvelopeKind} kind
 * @param {AffectedData} affects
 * @returns {Promise<FileCheckFailure | null>}
 */
async function checkOne(dir, name, rel, kind, affects) {
  try {
    const bytes = await readBytes(dir, name, rel);
    if (bytes === null) return null;
    await openAs(textOf(bytes), rel, kind);
    return null;
  } catch (e) {
    if (e instanceof StoreReadError) return { file: rel, reason: e.reason, detail: e.detail, affects };
    throw e;
  }
}

// ------------------------------------------------------------------ the implementation

/** @type {Impl['chooseDataFolder']} */
export async function chooseDataFolder() {
  const picker = /** @type {{ showDirectoryPicker: (options: object) => Promise<DataFolderHandle> }} */ (/** @type {unknown} */ (globalThis));
  return openDataFolder(await picker.showDirectoryPicker({ mode: 'readwrite', id: 'pivot-data' }));
}

/** @type {Impl['openDataFolder']} */
export async function openDataFolder(handle) {
  /** @type {DataStore} */
  const store = { folderName: handle.name };
  states.set(store, {
    handle, loaded: false, recordStamp: null, compareStamp: null, stored: null, working: null, mirrors: false,
  });
  return store;
}

/** @type {Impl['readProfiles']} */
export async function readProfiles(store) {
  const { handle } = stateOf(store);
  const bytes = await readBytes(handle, DATA_FOLDER.profiles, DATA_FOLDER.profiles);
  if (bytes === null) return [];
  const envelope = await openAs(textOf(bytes), DATA_FOLDER.profiles, 'profiles');
  return copyOf(Object.values(/** @type {ProfilesBody} */ (envelope.body).profiles));
}

/** @type {Impl['putProfile']} */
export async function putProfile(store, profile) {
  const { handle } = stateOf(store);
  const bytes = await readBytes(handle, DATA_FOLDER.profiles, DATA_FOLDER.profiles);
  // A profiles.json that does not open is refused rather than overwritten (C-008: the set only grows).
  const body = bytes === null
    ? { profiles: {} }
    : /** @type {ProfilesBody} */ ((await openAs(textOf(bytes), DATA_FOLDER.profiles, 'profiles')).body);
  body.profiles[profile.id] = copyOf(profile);
  const envelope = await seal('profiles', body, null);
  await writeWhole(/** @type {WritableDir} */ (/** @type {unknown} */ (handle)), DATA_FOLDER.profiles, utf8(serialize(envelope)), DATA_FOLDER.profiles, 'profiles', null);
}

/** @type {Impl['load']} */
export async function load(store) {
  const state = stateOf(store);
  const bytes = await readBytes(state.handle, DATA_FOLDER.data, DATA_FOLDER.data);
  /** @type {DataBody} */
  let body = emptyDataBody();
  /** @type {SaveStamp | null} */
  let stamp = null;
  if (bytes !== null) {
    const envelope = await openAs(textOf(bytes), DATA_FOLDER.data, 'data');
    body = /** @type {DataBody} */ (envelope.body);
    stamp = /** @type {SaveStamp} */ (envelope.stamp);
  }
  state.loaded = true;
  state.recordStamp = stamp;
  state.compareStamp = stamp;
  state.stored = copyOf(body);
  state.working = copyOf(body);
  return { body: copyOf(body), lastSave: stamp === null ? null : copyOf(stamp) };
}

/** @type {Impl['checkFolder']} */
export async function checkFolder(store) {
  const { handle } = stateOf(store);
  if (await folderUnreadable(handle)) throw new StoreReadError('', 'inaccessible', 'the data folder cannot be read');
  /** @type {(FileCheckFailure | null)[]} */
  const results = [
    await checkOne(handle, DATA_FOLDER.data, DATA_FOLDER.data, 'data', { kind: 'stored-data' }),
    await checkOne(handle, DATA_FOLDER.profiles, DATA_FOLDER.profiles, 'profiles', { kind: 'profiles' }),
  ];
  // A subfolder that cannot be listed is passed over: section 4 lets checkFolder reject only
  // when the data folder itself cannot be read, and a failure needs a file to name.
  try {
    const backups = await subfolder(handle, BACKUPS);
    if (backups !== null) {
      for (const name of await fileNamesIn(backups)) {
        const takenAtAest = backupTime(name);
        if (takenAtAest !== null) results.push(await checkOne(backups, name, `${BACKUPS}/${name}`, 'data', { kind: 'backup', takenAtAest }));
      }
    }
  } catch {
    // passed over, as above
  }
  try {
    const superseded = await subfolder(handle, SUPERSEDED);
    if (superseded !== null) {
      for (const name of await fileNamesIn(superseded)) {
        if (SUPERSEDED_FILE_RE.test(name)) results.push(await checkOne(superseded, name, `${SUPERSEDED}/${name}`, 'data', { kind: 'superseded-save' }));
      }
    }
  } catch {
    // passed over, as above
  }
  const failures = /** @type {FileCheckFailure[]} */ (results.filter((f) => f !== null));
  return failures.sort((x, y) => (x.file < y.file ? -1 : x.file > y.file ? 1 : 0));
}

/** @type {Impl['save']} */
export async function save(store, profile, body) {
  return writeStoredData(store, profile, body);
}

/** @type {Impl['unsavedChanges']} */
export async function unsavedChanges(store, body) {
  const state = stateOf(store);
  requireLoaded(state);
  const stored = /** @type {Record<string, Record<string, unknown>>} */ (/** @type {DataBody} */ (state.stored).collections);
  const working = /** @type {Record<string, Record<string, unknown>>} */ (body.collections);
  /** @type {RecordRef[]} */
  const refs = [];
  for (const kind of new Set([...Object.keys(stored), ...Object.keys(working)])) {
    const before = stored[kind] ?? {};
    const after = working[kind] ?? {};
    for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const differs = !Object.hasOwn(before, id) || !Object.hasOwn(after, id) || !sameData(before[id], after[id]);
      if (differs) refs.push({ kind: /** @type {RecordKind} */ (kind), id });
    }
  }
  const cmp = (/** @type {string} */ x, /** @type {string} */ y) => (x < y ? -1 : x > y ? 1 : 0);
  return refs.sort((x, y) => cmp(x.kind, y.kind) || cmp(x.id, y.id));
}

/** @type {Impl['putStoredFile']} */
export async function putStoredFile(store, profile, file) {
  requireProfile(profile);
  const { handle } = stateOf(store);
  const given = /** @type {unknown} */ (file);
  if (!isPlainObject(given) || typeof given.name !== 'string' || given.name === '' || !(given.bytes instanceof Uint8Array)) {
    throw new StoreWriteError(FILES, 'stored-file', new TypeError('a stored file needs a name and its bytes as a Uint8Array'));
  }
  /** @type {FileSystemDirectoryHandle} */
  let dir;
  try {
    dir = await handle.getDirectoryHandle(FILES, { create: true });
  } catch (e) {
    throw new StoreWriteError(FILES, 'stored-file', e);
  }
  // A fresh name every call (C-018): a random UUID, never one already in the folder, keeping
  // only a plain extension from the user's name so the file still opens by type.
  const extension = /\.[A-Za-z0-9]{1,10}$/.exec(file.name)?.[0] ?? '';
  /** @type {string} */
  let name;
  for (;;) {
    name = `${globalThis.crypto.randomUUID()}${extension}`;
    try {
      await dir.getFileHandle(name);
    } catch (e) {
      if (errorName(e) === 'NotFoundError') break;
      throw new StoreWriteError(`${FILES}/${name}`, 'stored-file', e);
    }
  }
  const location = `${FILES}/${name}`;
  await writeWhole(dir, name, file.bytes, location, 'stored-file', 'store.stored-file.staged');
  return location;
}

/** @type {Impl['checkStoredFiles']} */
export async function checkStoredFiles(store, locations) {
  const { handle } = stateOf(store);
  if (locations.length === 0) return [];
  const nameOf = (/** @type {unknown} */ location) =>
    typeof location === 'string' && location.startsWith(`${FILES}/`) && isEntryName(location.slice(FILES.length + 1))
      ? location.slice(FILES.length + 1)
      : null;

  /** @type {FileSystemDirectoryHandle | null} */
  let dir = null;
  /** @type {Set<string>} */
  let listed = new Set();
  let unreadable = false;
  if (locations.some((location) => nameOf(location) !== null)) {
    try {
      dir = await subfolder(handle, FILES);
      if (dir !== null) listed = new Set(await fileNamesIn(dir));
    } catch (e) {
      if (await folderUnreadable(handle)) throw new StoreReadError('', 'inaccessible', detailOf(e));
      unreadable = true;
    }
  }

  /** @type {Map<string, StoredFilePresence['reason']>} */
  const answered = new Map();
  /** @type {StoredFilePresence[]} */
  const presence = [];
  for (const location of locations) {
    const name = nameOf(location);
    /** @type {StoredFilePresence['reason']} */
    let reason;
    if (name === null) reason = 'not-a-stored-file-location';
    else if (unreadable) reason = 'inaccessible';
    else if (dir === null || !listed.has(name)) reason = 'missing';
    else if (answered.has(name)) reason = /** @type {StoredFilePresence['reason']} */ (answered.get(name));
    else {
      try {
        await (await dir.getFileHandle(name)).getFile();
        reason = null;
      } catch (e) {
        reason = errorName(e) === 'NotFoundError' ? 'missing' : 'inaccessible';
      }
      answered.set(name, reason);
    }
    presence.push({ location, present: reason === null, reason });
  }
  return presence;
}

/** @type {Impl['noteChange']} */
export async function noteChange(store, profile, body) {
  requireProfile(profile);
  const state = stateOf(store);
  requireLoaded(state);
  if (sameData(body, state.working)) return { changed: false, backupFile: null, backupError: null, mirrorError: null };

  state.working = copyOf(body);
  state.mirrors = true;
  const now = nowAest();
  const mirrorError = writeMirror({ schemaVersion: SCHEMA_VERSION, mirroredAtAest: now, unsaved: true, loadedStamp: state.compareStamp, body });

  /** @type {string | null} */
  let backupFile = null;
  /** @type {StoreWriteError | null} */
  let backupError = null;
  let due = false;
  try {
    const newest = (await backupNames(state.handle)).at(-1);
    due = newest === undefined || epochMsOf(now) - epochMsOf(/** @type {TimestampAest} */ (backupTime(newest))) > BACKUP_INTERVAL_MS;
  } catch (e) {
    backupError = new StoreWriteError(BACKUPS, 'backup', e);
  }
  if (!due) return { changed: true, backupFile, backupError, mirrorError };

  const name = backupFileName(now);
  const rel = `${BACKUPS}/${name}`;
  try {
    const dir = await state.handle.getDirectoryHandle(BACKUPS, { create: true });
    const envelope = await seal('data', body, freshStamp(profile.id));
    await writeWhole(dir, name, utf8(serialize(envelope)), rel, 'backup', null);
  } catch (e) {
    return { changed: true, backupFile: null, backupError: e instanceof StoreWriteError ? e : new StoreWriteError(rel, 'backup', e), mirrorError };
  }
  backupFile = rel;
  fault_point('store.backup.written');
  backupError = await pruneRing(state.handle, name);
  return { changed: true, backupFile, backupError, mirrorError };
}

/** @type {Impl['readRecoverable']} */
export async function readRecoverable(store) {
  stateOf(store);
  const mirror = readMirror();
  if (mirror === null || !mirror.unsaved) return null;
  return { body: mirror.body, mirroredAtAest: mirror.mirroredAtAest, loadedStamp: mirror.loadedStamp };
}

/** @type {Impl['recoverWorkingState']} */
export async function recoverWorkingState(store, state) {
  const own = stateOf(store);
  requireLoaded(own);
  readMirror(); // section 4: the browser's storage must be readable and hold a mirror this Pivot can read
  own.compareStamp = state.loadedStamp === null ? null : copyOf(state.loadedStamp);
  own.working = copyOf(state.body);
  own.mirrors = true;
  return copyOf(state.body);
}

/** @type {Impl['discardWorkingState']} */
export async function discardWorkingState(store) {
  stateOf(store);
  try {
    const storage = browserStorage();
    if (storage === null) return;
    /** @type {string | null} */
    let held = '';
    try {
      held = storage.getItem(BROWSER_STORAGE_KEY);
    } catch {
      held = ''; // cannot tell; remove anyway
    }
    if (held !== null) storage.removeItem(BROWSER_STORAGE_KEY);
  } catch (e) {
    throw new StoreWriteError(BROWSER_STORAGE_KEY, 'mirror', e);
  }
}

/** @type {Impl['listBackups']} */
export async function listBackups(store) {
  const { handle } = stateOf(store);
  /** @type {string[]} */
  let names;
  try {
    names = await backupNames(handle);
  } catch (e) {
    throw new StoreReadError(BACKUPS, 'inaccessible', detailOf(e));
  }
  return names.reverse().map((name) => ({ file: `${BACKUPS}/${name}`, takenAtAest: /** @type {TimestampAest} */ (backupTime(name)) }));
}

/** @type {Impl['chooseSaveStateFile']} */
export async function chooseSaveStateFile() {
  const picker = /** @type {{ showOpenFilePicker: (options: object) => Promise<FileSystemFileHandle[]> }} */ (/** @type {unknown} */ (globalThis));
  const [chosen] = await picker.showOpenFilePicker({
    multiple: false,
    types: [{ description: 'Pivot save state', accept: { 'application/json': ['.json'] } }],
  });
  const file = await chosen.getFile();
  return { name: file.name, text: await file.text() };
}

/** @type {Impl['prepareRestore']} */
export async function prepareRestore(store, source) {
  const state = stateOf(store);
  /** @type {string} */
  let file;
  /** @type {string} */
  let text;
  if (source.kind === 'backup') {
    file = source.file;
    const name = typeof file === 'string' && file.startsWith(`${BACKUPS}/`) ? file.slice(BACKUPS.length + 1) : '';
    if (backupTime(name) === null) throw new StoreReadError(String(file), 'not-a-pivot-file', 'it is not a backup kept under backups/');
    /** @type {FileSystemDirectoryHandle | null} */
    let dir;
    try {
      dir = await subfolder(state.handle, BACKUPS);
    } catch (e) {
      throw new StoreReadError(file, 'inaccessible', detailOf(e));
    }
    const bytes = dir === null ? null : await readBytes(dir, name, file);
    if (bytes === null) throw new StoreReadError(file, 'inaccessible', 'there is no such backup');
    text = textOf(bytes);
  } else {
    file = source.saveState.name;
    text = source.saveState.text;
  }
  const envelope = await openAs(text, file, 'data');
  return {
    source,
    body: /** @type {DataBody} */ (envelope.body),
    stampInFile: /** @type {SaveStamp} */ (envelope.stamp),
    replaces: state.recordStamp === null ? null : copyOf(state.recordStamp),
  };
}

/** @type {Impl['restore']} */
export async function restore(store, profile, plan) {
  requireProfile(profile);
  return writeStoredData(store, profile, plan.body);
}

/** @type {Impl['chooseExportFile']} */
export async function chooseExportFile(suggestedName) {
  const picker = /** @type {{ showSaveFilePicker: (options: object) => Promise<ExportFileHandle> }} */ (/** @type {unknown} */ (globalThis));
  return picker.showSaveFilePicker({ suggestedName });
}

/** @type {Impl['writeExportFile']} */
export async function writeExportFile(target, text) {
  const given = /** @type {unknown} */ (target);
  const name = isPlainObject(given) && typeof given.name === 'string' ? given.name : '';
  if (!isPlainObject(given) || typeof given.createWritable !== 'function') {
    throw new StoreWriteError(name, 'export', new TypeError('the export target is not a file handle'));
  }
  if (typeof text !== 'string') throw new StoreWriteError(name, 'export', new TypeError('the export text is not a string'));

  /** @type {FileSystemWritableFileStream} */
  let writable;
  try {
    writable = await target.createWritable();
  } catch (e) {
    throw new StoreWriteError(name, 'export', e);
  }
  const abort = async () => {
    try {
      await writable.abort();
    } catch {
      // nothing was committed
    }
  };
  try {
    await writable.write(/** @type {BufferSource} */ (utf8(text)));
  } catch (e) {
    await abort();
    throw new StoreWriteError(name, 'export', e);
  }
  try {
    fault_point('store.export.staged');
  } catch (e) {
    await abort();
    throw e;
  }
  try {
    await writable.close();
  } catch (e) {
    throw new StoreWriteError(name, 'export', e);
  }
}
