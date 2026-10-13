import { sameJson } from '../core/json.js';
import { REPORT_DOCUMENTS } from '../core/data.js';

/** One key per machine: one person uses Pivot per machine. */
export const MIRROR_KEY = 'pivot.unsaved.v2';

/**
 * @typedef {{ folderName: string, base: import('../core/data.js').Data, working: import('../core/data.js').Data,
 *   loadedStamp: import('./envelope.js').SaveStamp | null }} Mirror
 */

/**
 * A saved report is already in the folder, and its documents can be large, so the mirror leaves
 * them out; `restoreReportDocuments` puts them back from the folder on recovery. A report made
 * again since it was saved (its producedAt differs) keeps its new documents here.
 * @param {import('../core/data.js').Data} data @param {Record<string, any>} saved the saved reports, by id
 */
function withoutSavedDocuments(data, saved) {
  /** @type {Record<string, any>} */
  const reports = {};
  for (const [id, r] of Object.entries(data.records.report)) {
    const s = saved[id];
    if (s && s.producedAt === r.producedAt) {
      const rest = { ...r };
      for (const k of REPORT_DOCUMENTS) delete rest[k];
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
    const saved = mirror.base.records.report;
    const compact = { ...mirror, base: withoutSavedDocuments(mirror.base, saved), working: withoutSavedDocuments(mirror.working, saved) };
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
      const stored = /** @type {Record<string, any> | undefined} */ (loaded.records.report[id]);
      if (REPORT_DOCUMENTS.some((k) => k in r) || !stored) { reports[id] = r; continue; }
      reports[id] = { ...r, ...Object.fromEntries(REPORT_DOCUMENTS.filter((k) => k in stored).map((k) => [k, stored[k]])) };
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
 * Whether any record a report is produced FROM differs from what is stored. Left out: the
 * report design (a design change does not make a report differ from the stored data) and
 * the produced reports themselves, so making a PDF and then the HTML does not ask for a save
 * in between.
 * @param {{ base: { records: Record<string, unknown> }, working: { records: Record<string, unknown> } }} session
 */
export function hasUnsavedRecords(session) {
  const { report: _b, ...base } = session.base.records;
  const { report: _w, ...working } = session.working.records;
  return !sameJson(base, working);
}
