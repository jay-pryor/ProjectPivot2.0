import { PivotError } from '../core/errors.js';

/** @typedef {FileSystemDirectoryHandle} Dir */

/** @param {unknown} e */
export function isNotFound(e) {
  return Boolean(e && typeof e === 'object' && /** @type {{ name?: string }} */ (e).name === 'NotFoundError');
}

/** @param {string} path */
function split(path) {
  const parts = path.split('/');
  return { dirs: parts.slice(0, -1), name: /** @type {string} */ (parts.at(-1)) };
}

/** @param {Dir} root @param {string[]} dirs @param {boolean} create @returns {Promise<Dir>} */
async function dirFor(root, dirs, create) {
  let d = root;
  for (const n of dirs) d = await d.getDirectoryHandle(n, { create });
  return d;
}

/** @param {Dir} root @param {string} path @returns {Promise<string | null>} null when there is no such file */
export async function readText(root, path) {
  const { dirs, name } = split(path);
  try {
    const d = await dirFor(root, dirs, false);
    const h = await d.getFileHandle(name);
    return await (await h.getFile()).text();
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

/**
 * Replace a file whole or not at all: the browser commits a writable stream on `close` and
 * discards it on `abort`. A file this call created is removed again if the write fails.
 * @param {Dir} root @param {string} path @param {string} text
 */
export async function writeWhole(root, path, text) {
  const { dirs, name } = split(path);
  /** @type {FileSystemWritableFileStream | null} */
  let w = null;
  let existed = true;
  /** @type {Dir | null} */
  let d = null;
  try {
    d = await dirFor(root, dirs, true);
    try {
      await d.getFileHandle(name);
    } catch (e) {
      if (!isNotFound(e)) throw e;
      existed = false;
    }
    const h = await d.getFileHandle(name, { create: true });
    w = await h.createWritable();
    await w.write(text);
    await w.close();
  } catch (e) {
    if (w) {
      try { await w.abort(); } catch { /* already closed or failed; nothing was committed */ }
    }
    if (d && !existed) {
      try { await d.removeEntry(name); } catch { /* the caller is told the write failed either way */ }
    }
    throw new PivotError('write-failed', `${path} could not be written.`, { path, cause: e instanceof Error ? e.message : String(e) });
  }
}

/** @param {Dir} root @param {string} dirPath @returns {Promise<string[]>} file names, sorted */
export async function listNames(root, dirPath) {
  try {
    const d = await dirFor(root, dirPath.split('/'), false);
    const out = [];
    for await (const [name, h] of /** @type {any} */ (d).entries()) if (h.kind === 'file') out.push(name);
    return out.sort();
  } catch (e) {
    if (isNotFound(e)) return [];
    throw e;
  }
}

/** @param {Dir} root @param {string} path */
export async function removeFile(root, path) {
  const { dirs, name } = split(path);
  const d = await dirFor(root, dirs, false);
  await d.removeEntry(name);
}
