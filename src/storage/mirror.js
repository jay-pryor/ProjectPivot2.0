import { sameJson } from '../core/json.js';

/** One key per machine: one person uses Pivot per machine. */
export const MIRROR_KEY = 'pivot.unsaved.v2';

/**
 * @typedef {{ folderName: string, base: import('../core/data.js').Data, working: import('../core/data.js').Data,
 *   loadedStamp: import('./envelope.js').SaveStamp | null }} Mirror
 */

/**
 * A saved report is already in the folder, and its documents can be large, so the mirror leaves
 * them out; `restoreReportDocuments` puts them back from the folder on recovery. Reports are never
 * edited after they are produced, so the working copy of a saved report is the saved one.
 * @param {import('../core/data.js').Data} data @param {Set<string>} savedIds
 */
function withoutSavedDocuments(data, savedIds) {
  /** @type {Record<string, any>} */
  const reports = {};
  for (const [id, r] of Object.entries(data.records.report)) {
    if (savedIds.has(id)) {
      const { markdown: _m, html: _h, ...rest } = r;
      reports[id] = rest;
    } else {
      reports[id] = r;
    }
  }
  return { ...data, records: { ...data.records, report: reports } };
}

/** @param {Storage} storage @param {Mirror} mirror @returns {string | null} a warning, or null */
export function writeMirror(storage, mirror) {
  try {
    const savedIds = new Set(Object.keys(mirror.base.records.report));
    const compact = { ...mirror, base: withoutSavedDocuments(mirror.base, savedIds), working: withoutSavedDocuments(mirror.working, savedIds) };
    storage.setItem(MIRROR_KEY, JSON.stringify(compact));
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

/**
 * Put back the documents `writeMirror` left out, from the data just loaded from the folder.
 * @param {Mirror} mirror @param {import('../core/data.js').Data} loaded
 * @returns {Mirror}
 */
export function restoreReportDocuments(mirror, loaded) {
  /** @param {import('../core/data.js').Data} data */
  const fill = (data) => {
    /** @type {Record<string, any>} */
    const reports = {};
    for (const [id, r] of Object.entries(data.records.report)) {
      const stored = loaded.records.report[id];
      reports[id] = 'markdown' in r ? r : { ...r, markdown: stored?.markdown ?? '', html: stored?.html ?? '' };
    }
    return { ...data, records: { ...data.records, report: reports } };
  };
  return { ...mirror, base: fill(mirror.base), working: fill(mirror.working) };
}

/** @param {Storage} storage */
export function clearMirror(storage) {
  try { storage.removeItem(MIRROR_KEY); } catch { /* nothing to clear */ }
}

/** Last answer per working data, so a redraw does not compare the whole data again. */
const unsavedCache = new WeakMap();

/** @param {{ base: unknown, working: unknown }} session */
export function hasUnsaved(session) {
  const w = session.working;
  const cached = w && typeof w === 'object' ? unsavedCache.get(w) : undefined;
  if (cached && cached.base === session.base) return cached.result;
  const result = !sameJson(session.base, w);
  if (w && typeof w === 'object') unsavedCache.set(w, { base: session.base, result });
  return result;
}

/**
 * Whether any record differs from what is stored, leaving out the report design (a design
 * change does not make a report differ from the stored data it is produced from).
 * @param {{ base: { records: unknown }, working: { records: unknown } }} session
 */
export function hasUnsavedRecords(session) {
  return !sameJson(session.base.records, session.working.records);
}
