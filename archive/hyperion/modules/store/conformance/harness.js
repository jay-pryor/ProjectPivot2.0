/**
 * Test support for the store conformance suite (CORE-CON-002). Not a test file: the
 * runner collects `*.test.js` only.
 *
 * Provides the in-memory `DataFolderHandle` the contract says a test supplies (section 3),
 * shaped like the File System Access API so that whatever the implementation does with a
 * real `FileSystemDirectoryHandle` it can do with this one: `getFileHandle`,
 * `getDirectoryHandle`, `getFile().text()`, `createWritable()` with `write`/`close`
 * (committed on close, discarded on abort, as the real API does), `removeEntry`, and the
 * entry iterators. Three knobs let a test make the folder misbehave through the handle alone:
 * `failWrite(rel)` makes `createWritable` reject for matching paths, `denyRead(rel)` makes
 * look-ups, listings, and `getFile` reject with NotAllowedError (the data folder itself is
 * `''`), and `failRemove(rel)` makes `removeEntry` reject. Missing entries reject with
 * NotFoundError, which the contract says is not an error (C-007, C-008).
 *
 * Also: profile fixtures, a seeded generator of data bodies for the property tests
 * (CORE-TST-001: seeds are fixed and recorded), and a way to write files the way another
 * Pivot would, for the bad-file cases of C-007, C-008, C-012, and C-017. For store 2.0 to
 * 4.0: the browser's storage as an in-memory `localStorage` that records every write and can
 * be made absent, full, or unreadable (C-009, C-015, C-016, DEC-009); the baseline clock held
 * and moved (C-013, C-015); and an in-memory `ExportFileHandle` (C-020).
 *
 * Imports only what modules/store/manifest.yaml declares (CORE-CON-003, `declared`). At 1.0
 * that excluded baseline/clock, so "the baseline clock's now" (C-006) is checked as a window
 * at second resolution by `nowAest` below; the manifest lists the clock since 2.0, and the
 * tests of C-013 and C-015 hold it with `holdClock`.
 */

import { timestampAest, userProfileId } from '../../../baseline/types.js';
import * as schema from '../../../baseline/schema.js';
import { epochMsOf, fixClock, releaseClock } from '../../../baseline/clock.js';
import { InjectedFault } from '../../../baseline/faults.js';

/** @typedef {import('../../../baseline/types.js').UserProfile} UserProfile */
/** @typedef {import('../../../baseline/types.js').ActiveProfile} ActiveProfile */
/** @typedef {import('../../../baseline/types.js').TimestampAest} TimestampAest */
/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */
/** @typedef {import('../../../baseline/schema.js').SaveStamp} SaveStamp */
/** @typedef {import('../../../baseline/schema.js').StoredRecord} StoredRecord */

// ------------------------------------------------------------------ time, without the clock

const AEST_OFFSET_MS = 10 * 60 * 60 * 1000;

/**
 * The AEST timestamp for an instant, by the baseline's formula (clock.js `formatTimestampAest`).
 * @param {number} epochMs
 * @returns {TimestampAest}
 */
export function aestAt(epochMs) {
  const shifted = new Date(epochMs + AEST_OFFSET_MS).toISOString();
  return timestampAest(`${shifted.slice(0, 19)}+10:00`);
}

/** @returns {TimestampAest} now, as the baseline clock would give it */
export function nowAest() {
  return aestAt(Date.now());
}

// ------------------------------------------------------------------ in-memory folder

/**
 * @param {string} message
 * @param {string} name a DOMException name the real API uses
 * @returns {DOMException}
 */
function domError(message, name) {
  return new DOMException(message, name);
}

/** @param {string} name */
function checkEntryName(name) {
  if (typeof name !== 'string' || name === '' || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
    throw new TypeError(`not a valid entry name: ${String(name)}`);
  }
}

class FileNode {
  /** @param {string} name */
  constructor(name) {
    this.name = name;
    this.bytes = new Uint8Array(0);
    this.lastModified = Date.now();
  }
}

class DirNode {
  /** @param {string} name */
  constructor(name) {
    this.name = name;
    /** @type {Map<string, FileNode | DirNode>} */
    this.entries = new Map();
  }
}

/**
 * What the folder does when the implementation reaches it. Both default to "nothing fails".
 * @typedef {object} FolderControl
 * @property {(rel: string) => Error | null} failWrite error `createWritable` rejects with for this path, or null
 * @property {(rel: string) => Error | null} denyRead error look-ups, listings, and `getFile` reject with for this path, or null
 * @property {(rel: string) => Error | null} failRemove error `removeEntry` rejects with for this path, or null
 */

/**
 * The `FileSystemWritableFileStream` surface the implementation may use. Bytes are
 * buffered and committed to the file on `close`, discarded on `abort`.
 */
class WritableFileStream {
  /**
   * @param {FileNode} node
   * @param {Uint8Array} initial
   */
  constructor(node, initial) {
    this.node = node;
    this.buffer = new Uint8Array(initial);
    this.position = 0;
    this.done = false;
    this.locked = false;
  }

  /**
   * @param {string | ArrayBuffer | ArrayBufferView | Blob | { type: 'write', data: unknown, position?: number } | { type: 'seek', position: number } | { type: 'truncate', size: number }} chunk
   */
  async write(chunk) {
    this.assertOpen();
    if (chunk && typeof chunk === 'object' && 'type' in chunk) {
      if (chunk.type === 'seek') return this.seek(chunk.position);
      if (chunk.type === 'truncate') return this.truncate(chunk.size);
      if (chunk.type === 'write') {
        if (chunk.position !== undefined) await this.seek(chunk.position);
        return this.writeBytes(await toBytes(chunk.data));
      }
      throw new TypeError(`unknown write command ${String(chunk.type)}`);
    }
    return this.writeBytes(await toBytes(chunk));
  }

  /** @param {Uint8Array} bytes */
  writeBytes(bytes) {
    const end = this.position + bytes.length;
    if (end > this.buffer.length) {
      const grown = new Uint8Array(end);
      grown.set(this.buffer);
      this.buffer = grown;
    }
    this.buffer.set(bytes, this.position);
    this.position = end;
  }

  /** @param {number} position */
  async seek(position) {
    this.assertOpen();
    this.position = position;
  }

  /** @param {number} size */
  async truncate(size) {
    this.assertOpen();
    const shrunk = new Uint8Array(size);
    shrunk.set(this.buffer.subarray(0, Math.min(size, this.buffer.length)));
    this.buffer = shrunk;
    if (this.position > size) this.position = size;
  }

  async close() {
    this.assertOpen();
    this.done = true;
    this.node.bytes = this.buffer;
    this.node.lastModified = Date.now();
  }

  /** @param {unknown} [_reason] */
  async abort(_reason) {
    this.done = true;
  }

  assertOpen() {
    if (this.done) throw new TypeError('the writable stream is closed');
  }
}

/**
 * @param {unknown} data
 * @returns {Promise<Uint8Array>}
 */
async function toBytes(data) {
  if (typeof data === 'string') return new TextEncoder().encode(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  throw new TypeError('unsupported write data');
}

class FileHandle {
  /**
   * @param {FolderControl} control
   * @param {FileNode} node
   * @param {string} rel path relative to the data folder
   */
  constructor(control, node, rel) {
    /** @type {'file'} */
    this.kind = 'file';
    this.control = control;
    this.node = node;
    this.rel = rel;
  }

  get name() {
    return this.node.name;
  }

  async getFile() {
    const denied = this.control.denyRead(this.rel);
    if (denied) throw denied;
    return new File([this.node.bytes], this.node.name, { lastModified: this.node.lastModified });
  }

  /** @param {{ keepExistingData?: boolean }} [options] */
  async createWritable(options = {}) {
    const failed = this.control.failWrite(this.rel);
    if (failed) throw failed;
    return new WritableFileStream(this.node, options.keepExistingData ? this.node.bytes : new Uint8Array(0));
  }

  /** @param {unknown} other */
  async isSameEntry(other) {
    return other instanceof FileHandle && other.node === this.node;
  }
}

class DirectoryHandle {
  /**
   * @param {FolderControl} control
   * @param {DirNode} node
   * @param {string} rel '' for the data folder itself
   */
  constructor(control, node, rel) {
    /** @type {'directory'} */
    this.kind = 'directory';
    this.control = control;
    this.node = node;
    this.rel = rel;
  }

  get name() {
    return this.node.name;
  }

  /** @param {string} name */
  childPath(name) {
    return this.rel === '' ? name : `${this.rel}/${name}`;
  }

  /**
   * @param {string} name
   * @param {{ create?: boolean }} [options]
   */
  async getFileHandle(name, options = {}) {
    checkEntryName(name);
    const rel = this.childPath(name);
    const existing = this.node.entries.get(name);
    if (!options.create) {
      const denied = this.control.denyRead(rel);
      if (denied) throw denied;
    }
    if (existing instanceof DirNode) throw domError(`${rel} is a directory`, 'TypeMismatchError');
    if (existing) return new FileHandle(this.control, existing, rel);
    if (!options.create) throw domError(`${rel} not found`, 'NotFoundError');
    const node = new FileNode(name);
    this.node.entries.set(name, node);
    return new FileHandle(this.control, node, rel);
  }

  /**
   * @param {string} name
   * @param {{ create?: boolean }} [options]
   */
  async getDirectoryHandle(name, options = {}) {
    checkEntryName(name);
    const rel = this.childPath(name);
    const existing = this.node.entries.get(name);
    if (!options.create) {
      const denied = this.control.denyRead(rel);
      if (denied) throw denied;
    }
    if (existing instanceof FileNode) throw domError(`${rel} is a file`, 'TypeMismatchError');
    if (existing) return new DirectoryHandle(this.control, existing, rel);
    if (!options.create) throw domError(`${rel} not found`, 'NotFoundError');
    const node = new DirNode(name);
    this.node.entries.set(name, node);
    return new DirectoryHandle(this.control, node, rel);
  }

  /**
   * @param {string} name
   * @param {{ recursive?: boolean }} [options]
   */
  async removeEntry(name, options = {}) {
    checkEntryName(name);
    const refused = this.control.failRemove(this.childPath(name));
    if (refused) throw refused;
    const existing = this.node.entries.get(name);
    if (!existing) throw domError(`${this.childPath(name)} not found`, 'NotFoundError');
    if (existing instanceof DirNode && existing.entries.size > 0 && !options.recursive) {
      throw domError(`${this.childPath(name)} is not empty`, 'InvalidModificationError');
    }
    this.node.entries.delete(name);
  }

  assertListable() {
    const denied = this.control.denyRead(this.rel);
    if (denied) throw denied;
  }

  async *keys() {
    this.assertListable();
    for (const name of [...this.node.entries.keys()].sort()) yield name;
  }

  async *values() {
    this.assertListable();
    for (const [name] of [...this.node.entries].sort()) yield this.child(name);
  }

  async *entries() {
    this.assertListable();
    for (const [name] of [...this.node.entries].sort()) yield [name, this.child(name)];
  }

  [Symbol.asyncIterator]() {
    return this.entries();
  }

  /** @param {string} name */
  child(name) {
    const node = /** @type {FileNode | DirNode} */ (this.node.entries.get(name));
    return node instanceof DirNode
      ? new DirectoryHandle(this.control, node, this.childPath(name))
      : new FileHandle(this.control, node, this.childPath(name));
  }

  async queryPermission() {
    return 'granted';
  }

  async requestPermission() {
    return 'granted';
  }

  /** @param {unknown} other */
  async isSameEntry(other) {
    return other instanceof DirectoryHandle && other.node === this.node;
  }
}

/**
 * An in-memory data folder: the handle the implementation gets, and the back door the test
 * uses to look at, plant, and break files.
 */
export class MemoryFolder {
  /** @param {string} [name] */
  constructor(name = 'Pivot Data') {
    this.root = new DirNode(name);
    /** @type {FolderControl} */
    this.control = { failWrite: () => null, denyRead: () => null, failRemove: () => null };
    /** The `DataFolderHandle` to pass to `openDataFolder`. */
    this.handle = new DirectoryHandle(this.control, this.root, '');
  }

  /**
   * Make `createWritable` reject for every path `matches` accepts, with a DOMException the
   * real API could raise. Pass `() => false` to clear.
   * @param {(rel: string) => boolean} matches
   */
  failWrite(matches) {
    this.control.failWrite = (rel) => (matches(rel) ? domError(`${rel}: cannot be written`, 'NoModificationAllowedError') : null);
  }

  /**
   * Make every look-up and `getFile` reject for paths `matches` accepts, as a folder the
   * browser no longer grants access to does.
   * @param {(rel: string) => boolean} matches
   */
  denyRead(matches) {
    this.control.denyRead = (rel) => (matches(rel) ? domError(`${rel}: access denied`, 'NotAllowedError') : null);
  }

  /**
   * Make `removeEntry` reject for every path `matches` accepts, as a file held open by another
   * program on a shared folder does. Pass `() => false` to clear.
   * @param {(rel: string) => boolean} matches
   */
  failRemove(matches) {
    this.control.failRemove = (rel) => (matches(rel) ? domError(`${rel}: cannot be removed`, 'NoModificationAllowedError') : null);
  }

  /**
   * @param {string} rel
   * @param {boolean} create
   * @returns {{ dir: DirNode, name: string } | null}
   */
  locate(rel, create) {
    const parts = rel.split('/');
    let dir = this.root;
    for (const part of parts.slice(0, -1)) {
      let next = dir.entries.get(part);
      if (next === undefined) {
        if (!create) return null;
        next = new DirNode(part);
        dir.entries.set(part, next);
      }
      if (!(next instanceof DirNode)) return null;
      dir = next;
    }
    return { dir, name: parts[parts.length - 1] };
  }

  /**
   * @param {string} rel
   * @returns {boolean}
   */
  exists(rel) {
    const at = this.locate(rel, false);
    return at !== null && at.dir.entries.has(at.name);
  }

  /**
   * The file's text, or null when there is no such file.
   * @param {string} rel
   * @returns {string | null}
   */
  read(rel) {
    const at = this.locate(rel, false);
    const node = at && at.dir.entries.get(at.name);
    return node instanceof FileNode ? new TextDecoder().decode(node.bytes) : null;
  }

  /**
   * Write a file as some other program would, creating folders on the way.
   * @param {string} rel
   * @param {string} text
   */
  write(rel, text) {
    const at = /** @type {{ dir: DirNode, name: string }} */ (this.locate(rel, true));
    const node = new FileNode(at.name);
    node.bytes = new TextEncoder().encode(text);
    at.dir.entries.set(at.name, node);
  }

  /**
   * The file's bytes, or null when there is no such file.
   * @param {string} rel
   * @returns {Uint8Array | null}
   */
  readBytes(rel) {
    const at = this.locate(rel, false);
    const node = at && at.dir.entries.get(at.name);
    return node instanceof FileNode ? new Uint8Array(node.bytes) : null;
  }

  /**
   * Put bytes at a path as some other program would, creating folders on the way.
   * @param {string} rel
   * @param {Uint8Array} bytes
   */
  writeBytes(rel, bytes) {
    const at = /** @type {{ dir: DirNode, name: string }} */ (this.locate(rel, true));
    const node = new FileNode(at.name);
    node.bytes = new Uint8Array(bytes);
    at.dir.entries.set(at.name, node);
  }

  /**
   * Every file under a folder of the data folder, as sorted paths relative to the data folder.
   * @param {string} dir e.g. `schema.DATA_FOLDER.files`
   * @returns {string[]}
   */
  listUnder(dir) {
    return this.list().filter((rel) => rel.startsWith(`${dir}/`));
  }

  /** @param {string} rel */
  remove(rel) {
    const at = this.locate(rel, false);
    if (at) at.dir.entries.delete(at.name);
  }

  /**
   * Every file in the folder, as sorted paths relative to it.
   * @returns {string[]}
   */
  list() {
    /** @type {string[]} */
    const out = [];
    /** @param {DirNode} dir @param {string} prefix */
    const walk = (dir, prefix) => {
      for (const [name, node] of dir.entries) {
        const rel = prefix === '' ? name : `${prefix}/${name}`;
        if (node instanceof DirNode) walk(node, rel);
        else out.push(rel);
      }
    };
    walk(this.root, '');
    return out.sort();
  }

  /**
   * Every file's bytes keyed by its path, one character per byte so that a stored file that is
   * not UTF-8 compares exactly, for "the folder is unchanged" assertions.
   * @returns {Record<string, string>}
   */
  snapshot() {
    /** @type {Record<string, string>} */
    const out = {};
    for (const rel of this.list()) out[rel] = Array.from(/** @type {Uint8Array} */ (this.readBytes(rel)), (b) => String.fromCharCode(b)).join('');
    return out;
  }
}

// ------------------------------------------------------------------ files as another Pivot writes them

/**
 * The text of a data.json another copy of Pivot would write: a sealed envelope.
 * @param {DataBody} body
 * @param {SaveStamp} stamp
 * @returns {Promise<string>}
 */
export async function dataFileText(body, stamp) {
  return schema.serialize(await schema.seal('data', body, stamp));
}

/**
 * @param {Record<string, UserProfile>} profiles keyed by id
 * @returns {Promise<string>}
 */
export async function profilesFileText(profiles) {
  return schema.serialize(await schema.seal('profiles', { profiles }, null));
}

/**
 * A Pivot file's text altered outside Pivot: the body changed and the integrity check left as
 * it was, still valid JSON with the marker, so only the check can catch it (C-012).
 * @param {string} text a sealed envelope's text
 * @returns {string}
 */
export function tamperedText(text) {
  const envelope = JSON.parse(text);
  if (envelope.kind === 'profiles') envelope.body.profiles['00000000-0000-4000-8000-000000000000'] = { name: 'Mallory' };
  else envelope.body.sequences.hazard += 1;
  return JSON.stringify(envelope, null, 2) + '\n';
}

/**
 * A fault armed through the harness "propagates cleanly": the rejection is the injected
 * error itself, or a store error that carries it as `cause`; never a resolution and never
 * an unrelated error.
 * @param {unknown} e
 * @returns {boolean}
 */
export function carriesInjectedFault(e) {
  return e instanceof InjectedFault || (e instanceof Error && e.cause instanceof InjectedFault);
}

/**
 * The relative path C-004 promises for a superseded save's copy.
 * @param {SaveStamp} superseded
 * @returns {string}
 */
export function keptPathFor(superseded) {
  return `${schema.DATA_FOLDER.supersededSaves}/${schema.supersededFileName(superseded)}`;
}

export const SAVE_TOKEN_RE = /^[0-9a-f]{32}$/;

// ------------------------------------------------------------------ fixtures

/**
 * @param {string} name
 * @returns {UserProfile}
 */
export function newProfile(name) {
  return { id: userProfileId.fresh(), name, createdAtAest: nowAest() };
}

/**
 * @param {UserProfile} profile
 * @returns {ActiveProfile}
 */
export function activeOf(profile) {
  return { id: profile.id, name: profile.name };
}

/**
 * A stored hazard record with the header every record carries and one field of its own.
 * @param {number} sequence
 * @param {UserProfile} by
 * @param {string} title
 * @returns {StoredRecord}
 */
export function hazardRecord(sequence, by, title) {
  const at = nowAest();
  return {
    id: `H-${String(sequence).padStart(4, '0')}`,
    kind: 'hazard',
    status: 'live',
    createdBy: by.id,
    createdAtAest: at,
    updatedBy: by.id,
    updatedAtAest: at,
    title,
  };
}

/**
 * A body holding `titles.length` hazards numbered from 1, with the sequence advanced past them.
 * @param {UserProfile} by
 * @param {string[]} titles
 * @returns {DataBody}
 */
export function bodyWithHazards(by, titles) {
  /** @type {Record<string, StoredRecord>} */
  const hazard = {};
  titles.forEach((title, i) => {
    const record = hazardRecord(i + 1, by, title);
    hazard[record.id] = record;
  });
  return { collections: titles.length === 0 ? {} : { hazard }, sequences: { hazard: titles.length + 1 } };
}

// ------------------------------------------------------------------ seeded randomness (CORE-TST-001)

/** The one seed the property tests use; change it only on purpose, and record why. */
export const SEED = 0x50495654;

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

const WORDS = ['loss of control', 'runway incursion', 'Übertemperatur', '火災', 'ground collision', '', 'fuel starvation', 'icing — pitot', 'bird strike', 'a "quoted" title'];

/**
 * @param {() => number} random
 * @param {number} maxExclusive
 * @returns {number}
 */
export function pick(random, maxExclusive) {
  return Math.floor(random() * maxExclusive);
}

/**
 * A random but JSON-clean value, for fields a record kind might carry.
 * @param {() => number} random
 * @param {number} depth
 * @returns {unknown}
 */
function randomValue(random, depth) {
  const kind = pick(random, depth > 1 ? 6 : 8);
  switch (kind) {
    case 0: return WORDS[pick(random, WORDS.length)];
    case 1: return pick(random, 1000) - 500;
    case 2: return random() < 0.5;
    case 3: return null;
    case 4: return pick(random, 100000) / 100;
    case 5: return '';
    case 6: return Array.from({ length: pick(random, 4) }, () => randomValue(random, depth + 1));
    default: {
      /** @type {Record<string, unknown>} */
      const o = {};
      for (let i = 0, n = pick(random, 4); i < n; i += 1) o[`f${pick(random, 20)}`] = randomValue(random, depth + 1);
      return o;
    }
  }
}

/**
 * A random data body: some hazards, each with extra fields of varied shape, and a
 * sequence at or beyond the highest number used.
 * @param {() => number} random
 * @param {UserProfile} by
 * @returns {DataBody}
 */
export function randomBody(random, by) {
  const count = pick(random, 6);
  const body = bodyWithHazards(by, Array.from({ length: count }, () => WORDS[pick(random, WORDS.length)]));
  for (const record of Object.values(body.collections.hazard ?? {})) {
    for (let i = 0, n = pick(random, 4); i < n; i += 1) record[`field${pick(random, 10)}`] = randomValue(random, 0);
  }
  body.sequences.hazard = count + 1 + pick(random, 50);
  return body;
}

/** Kinds the multi-kind bodies use; any `RecordKind` would do, since `store` does not read records. */
const BODY_KINDS = /** @type {const} */ (['hazard', 'control', 'platform', 'causal-factor', 'link']);
const ID_PREFIX = { hazard: 'H', control: 'C', platform: 'P', 'causal-factor': 'CF', link: 'L' };

/**
 * A record of any kind, with the header every record carries.
 * @param {import('../../../baseline/types.js').RecordKind} kind
 * @param {string} id
 * @param {UserProfile} by
 * @param {unknown} value
 * @returns {StoredRecord}
 */
export function recordOf(kind, id, by, value) {
  const at = nowAest();
  return { id, kind, status: 'live', createdBy: by.id, createdAtAest: at, updatedBy: by.id, updatedAtAest: at, value };
}

/**
 * A random body over several kinds, with ids whose string order differs from their number
 * order (`H-10` before `H-9`), and no kind whose collection is empty.
 * @param {() => number} random
 * @param {UserProfile} by
 * @returns {DataBody}
 */
export function randomMultiKindBody(random, by) {
  /** @type {DataBody} */
  const body = { collections: {}, sequences: { hazard: 1 + pick(random, 30) } };
  for (const kind of BODY_KINDS) {
    const n = pick(random, 4);
    if (n === 0) continue;
    /** @type {Record<string, StoredRecord>} */
    const collection = {};
    for (let i = 0; i < n; i += 1) {
      const id = `${ID_PREFIX[kind]}-${1 + pick(random, 12)}`;
      collection[id] = recordOf(kind, id, by, randomValue(random, 0));
    }
    body.collections[kind] = collection;
  }
  return body;
}

/**
 * Apply one random edit to a copy of `body`: add a record, change one, or remove one, or move
 * only the sequence. Never leaves a kind's collection empty: a kind whose last record is
 * removed is dropped, so "every collection deep-equal" and "no record differs" coincide.
 * @param {() => number} random
 * @param {DataBody} body
 * @param {UserProfile} by
 * @returns {DataBody}
 */
export function editedBody(random, body, by) {
  /** @type {DataBody} */
  const next = structuredClone(body);
  const present = BODY_KINDS.filter((k) => next.collections[k] !== undefined);
  const edit = pick(random, 4);
  if (edit === 0 || present.length === 0) {
    const kind = BODY_KINDS[pick(random, BODY_KINDS.length)];
    const id = `${ID_PREFIX[kind]}-${13 + pick(random, 90)}`;
    next.collections[kind] = { ...(next.collections[kind] ?? {}), [id]: recordOf(kind, id, by, randomValue(random, 0)) };
  } else if (edit === 1) {
    const kind = present[pick(random, present.length)];
    const collection = /** @type {Record<string, StoredRecord>} */ (next.collections[kind]);
    const ids = Object.keys(collection);
    const id = ids[pick(random, ids.length)];
    collection[id] = { ...collection[id], value: `changed ${random()}` };
  } else if (edit === 2) {
    const kind = present[pick(random, present.length)];
    const collection = /** @type {Record<string, StoredRecord>} */ (next.collections[kind]);
    const ids = Object.keys(collection);
    delete collection[ids[pick(random, ids.length)]];
    if (Object.keys(collection).length === 0) delete next.collections[kind];
  } else {
    next.sequences.hazard += 1 + pick(random, 3);
  }
  return next;
}

// ------------------------------------------------------------------ the baseline clock, held (C-013, C-015)

/** Where a held clock starts: a fixed instant, so backup names are the same in every run. */
export const CLOCK_START = timestampAest('2026-09-14T09:00:00+10:00');

/**
 * Hold the baseline clock at `start` and move it forward on demand. Call `release()` in a
 * finally block.
 * @param {TimestampAest} [start]
 */
export function holdClock(start = CLOCK_START) {
  let epochMs = epochMsOf(start);
  fixClock(start);
  return {
    /** @returns {TimestampAest} the held now */
    now: () => aestAt(epochMs),
    /** @param {number} seconds */
    advance(seconds) {
      epochMs += seconds * 1000;
      fixClock(aestAt(epochMs));
    },
    /** @param {number} seconds @returns {TimestampAest} the held now moved by `seconds`, without moving the clock */
    offset: (seconds) => aestAt(epochMs + seconds * 1000),
    release: releaseClock,
  };
}

// ------------------------------------------------------------------ backups as Pivot writes them (C-013, C-014, C-017)

/**
 * The relative path C-013 promises for a backup taken at `takenAtAest`.
 * @param {TimestampAest} takenAtAest
 * @returns {string}
 */
export function backupPathAt(takenAtAest) {
  return `${schema.DATA_FOLDER.backups}/${schema.backupFileName(takenAtAest)}`;
}

/**
 * Put a complete backup in the folder as another copy of Pivot would have written it.
 * @param {MemoryFolder} folder
 * @param {TimestampAest} takenAtAest
 * @param {DataBody} body
 * @param {UserProfile} by
 * @returns {Promise<string>} its path
 */
export async function plantBackup(folder, takenAtAest, body, by) {
  const rel = backupPathAt(takenAtAest);
  folder.write(rel, await dataFileText(body, schema.freshStamp(by.id)));
  return rel;
}

/**
 * Every backup in the folder as `listBackups` must give it: newest first, time from the name.
 * @param {MemoryFolder} folder
 * @returns {{ file: string, takenAtAest: TimestampAest }[]}
 */
export function backupsInFolder(folder) {
  return folder
    .listUnder(schema.DATA_FOLDER.backups)
    .filter((rel) => schema.BACKUP_FILE_RE.test(rel.slice(schema.DATA_FOLDER.backups.length + 1)))
    .sort()
    .reverse()
    .map((file) => ({ file, takenAtAest: timeInBackupName(file) }));
}

/**
 * @param {string} rel a backup path
 * @returns {TimestampAest}
 */
export function timeInBackupName(rel) {
  const m = /data-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.json$/.exec(rel);
  if (!m) throw new RangeError(`${rel} is not a backup name`);
  return timestampAest(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+10:00`);
}

// ------------------------------------------------------------------ the browser's storage (C-009, C-015, C-016)

/**
 * An in-memory `Storage` that records every write, and can be made to refuse writes (a full
 * quota, or a policy), refuse reads, or refuse removal, as a real `localStorage` can.
 */
export class MemoryStorage {
  constructor() {
    /** @type {Map<string, string>} */
    this.items = new Map();
    /** @type {string[]} every setItem, removeItem, and clear, in order */
    this.writes = [];
    /** @type {Error | null} */
    this.setError = null;
    /** @type {Error | null} */
    this.getError = null;
    /** @type {Error | null} */
    this.removeError = null;
  }

  get length() {
    return this.items.size;
  }

  /** @param {number} index */
  key(index) {
    return [...this.items.keys()][index] ?? null;
  }

  /** @param {string} key */
  getItem(key) {
    if (this.getError) throw this.getError;
    return this.items.has(key) ? /** @type {string} */ (this.items.get(key)) : null;
  }

  /** @param {string} key @param {string} value */
  setItem(key, value) {
    if (this.setError) throw this.setError;
    this.writes.push(`setItem(${key})`);
    this.items.set(key, String(value));
  }

  /** @param {string} key */
  removeItem(key) {
    if (this.removeError) throw this.removeError;
    this.writes.push(`removeItem(${key})`);
    this.items.delete(key);
  }

  clear() {
    this.writes.push('clear()');
    this.items.clear();
  }

  /** Make every setItem throw as a full quota does. */
  fill() {
    this.setError = new DOMException('the quota has been exceeded', 'QuotaExceededError');
  }

  /** Make every setItem throw as a storage the browser's policy forbids does. */
  refuseWrites() {
    this.setError = new DOMException('access to storage is denied', 'SecurityError');
  }

  /** Make every getItem throw. */
  refuseReads() {
    this.getError = new DOMException('access to storage is denied', 'SecurityError');
  }

  /** Make every removeItem throw. */
  refuseRemoval() {
    this.removeError = new DOMException('access to storage is denied', 'SecurityError');
  }

  /**
   * The mirror under the key, parsed, or null when there is none.
   * @returns {import('../../../baseline/schema.js').WorkingStateMirror | null}
   */
  mirror() {
    const text = this.items.get(schema.BROWSER_STORAGE_KEY);
    return text === undefined ? null : JSON.parse(text);
  }
}

/**
 * Run `fn` with an in-memory `localStorage` and `sessionStorage` on `globalThis`, restoring
 * whatever was there afterwards. `env.absent()` takes `localStorage` away, as a browser with
 * storage disabled does; `env.present()` puts it back. The contract reads the browser's storage
 * "as found at the call" (DEC-009), so a test may change it between calls.
 * @template T
 * @param {(env: { local: MemoryStorage, session: MemoryStorage, absent: () => void, present: () => void }) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withBrowserStorage(fn) {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  const saved = {
    localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
    sessionStorage: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'),
  };
  /** @param {string} name @param {unknown} value */
  const install = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  install('localStorage', local);
  install('sessionStorage', session);
  try {
    return await fn({ local, session, absent: () => install('localStorage', undefined), present: () => install('localStorage', local) });
  } finally {
    const g = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (globalThis));
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete g[name];
    }
  }
}

/**
 * A mirror as another copy of Pivot on this machine would have left it, for C-016's cases.
 * @param {DataBody} body
 * @param {SaveStamp | null} loadedStamp
 * @param {TimestampAest} mirroredAtAest
 * @param {boolean} unsaved
 * @returns {string}
 */
export function mirrorText(body, loadedStamp, mirroredAtAest, unsaved) {
  return JSON.stringify({ schemaVersion: schema.SCHEMA_VERSION, mirroredAtAest, unsaved, loadedStamp, body });
}

// ------------------------------------------------------------------ the export file (C-020)

/**
 * An in-memory `ExportFileHandle`: a file outside the data folder the user chose. Its stream
 * commits on `close` and discards on `abort`, as `createWritable` does. Knobs: `failCreate`
 * (createWritable rejects), `failWrite` (the stream's write rejects), `failClose` (close
 * rejects and commits nothing). Counts how many streams were opened, committed, and aborted.
 */
export class MemoryExportFile {
  /**
   * @param {string} name
   * @param {string | null} [initialText] what the file held before; null for a new empty file
   */
  constructor(name = 'bow-tie.svg', initialText = null) {
    this.name = name;
    this.bytes = initialText === null ? new Uint8Array(0) : new TextEncoder().encode(initialText);
    this.lastModified = Date.now();
    this.opened = 0;
    this.committed = 0;
    this.aborted = 0;
    /** @type {Error | null} */
    this.failCreate = null;
    /** @type {Error | null} */
    this.failWrite = null;
    /** @type {Error | null} */
    this.failClose = null;
  }

  /** @param {{ keepExistingData?: boolean }} [options] */
  async createWritable(options = {}) {
    if (this.failCreate) throw this.failCreate;
    this.opened += 1;
    const file = this;
    const stream = new WritableFileStream(/** @type {any} */ (this), options.keepExistingData ? this.bytes : new Uint8Array(0));
    const write = stream.write.bind(stream);
    const close = stream.close.bind(stream);
    const abort = stream.abort.bind(stream);
    /** @param {Parameters<WritableFileStream['write']>[0]} chunk */
    stream.write = async (chunk) => {
      if (file.failWrite) throw file.failWrite;
      return write(chunk);
    };
    stream.close = async () => {
      if (file.failClose) {
        stream.done = true;
        throw file.failClose;
      }
      await close();
      file.committed += 1;
    };
    /** @param {unknown} [reason] */
    stream.abort = async (reason) => {
      file.aborted += 1;
      return abort(reason);
    };
    return stream;
  }

  /** @returns {Uint8Array} what the file holds now */
  contents() {
    return new Uint8Array(this.bytes);
  }
}

/**
 * The browser's error a failed export write carries (C-020): a refused permission.
 * @returns {DOMException}
 */
export function permissionRefused() {
  return new DOMException('the user did not grant write permission', 'NotAllowedError');
}

/** @returns {DOMException} a full disk, as the browser reports it */
export function diskFull() {
  return new DOMException('there is not enough space on the disk', 'QuotaExceededError');
}

// ------------------------------------------------------------------ stored files (C-018, C-019)

/**
 * @param {string} name
 * @param {Uint8Array | number[]} bytes
 * @returns {import('../contract.js').IncomingFile}
 */
export function incomingFile(name, bytes) {
  return { name, bytes: bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes) };
}

/**
 * Random bytes of a random length, zero included, over every byte value (not UTF-8).
 * @param {() => number} random
 * @returns {Uint8Array}
 */
export function randomBytes(random) {
  const length = [0, 1, 3, 255, 1024][pick(random, 5)] + pick(random, 3);
  return Uint8Array.from({ length }, () => pick(random, 256));
}

/**
 * File names a user's machine can hand over, including ones that are not safe as paths.
 * `putStoredFile` rejects only an empty name (section 4); every one of these is stored.
 */
export const AWKWARD_FILE_NAMES = Object.freeze([
  'report.pdf', 'report.pdf', 'Hazard Log (final).xlsx', 'Übersicht 火災.docx', '.hidden', 'no-extension',
  'a/b.txt', '..', '../escape.txt', 'data.json', 'profiles.json', 'CON', 'trailing dot.', ' leading space',
]);
