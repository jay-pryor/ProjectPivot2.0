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
    // A Blob (and so a File) has a `type` too, but it is data, not a write command.
    if (chunk && typeof chunk === 'object' && 'type' in chunk && !(chunk instanceof Blob)) {
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
