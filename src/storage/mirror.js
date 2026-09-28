import { sameJson } from '../core/json.js';

/** One key per machine: one person uses Pivot per machine. */
export const MIRROR_KEY = 'pivot.unsaved.v2';

/**
 * @typedef {{ folderName: string, base: import('../core/data.js').Data, working: import('../core/data.js').Data,
 *   loadedStamp: import('./envelope.js').SaveStamp | null }} Mirror
 */

/** @param {Storage} storage @param {Mirror} mirror @returns {string | null} a warning, or null */
export function writeMirror(storage, mirror) {
  try {
    storage.setItem(MIRROR_KEY, JSON.stringify(mirror));
    return null;
  } catch (e) {
    return `Unsaved changes are not being kept in the browser (${e instanceof Error ? e.message : String(e)}). Save often.`;
  }
}

/** @param {Storage} storage @param {string} folderName @returns {Mirror | null} */
export function readMirror(storage, folderName) {
  try {
    const text = storage.getItem(MIRROR_KEY);
    if (!text) return null;
    const m = JSON.parse(text);
    return m && m.folderName === folderName ? m : null;
  } catch {
    return null;
  }
}

/** @param {Storage} storage */
export function clearMirror(storage) {
  try { storage.removeItem(MIRROR_KEY); } catch { /* nothing to clear */ }
}

/** @param {{ base: unknown, working: unknown }} session */
export function hasUnsaved(session) {
  return !sameJson(session.base, session.working);
}

/**
 * Whether any record differs from what is stored, leaving out the report design (a design
 * change does not make a report differ from the stored data it is produced from).
 * @param {{ base: { records: unknown }, working: { records: unknown } }} session
 */
export function hasUnsavedRecords(session) {
  return !sameJson(session.base.records, session.working.records);
}
