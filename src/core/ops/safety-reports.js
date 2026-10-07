import { PivotError } from '../errors.js';
import { newId, ids } from '../ids.js';
import { get, all, created, changed, need, needText } from '../data.js';
import { commit } from '../apply.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */
/**
 * @typedef {{ number?: unknown, date?: unknown, reportType?: unknown, summary?: unknown, description?: unknown,
 *   location?: unknown, parties?: unknown }} ReportFields
 */

export const SAFETY_REPORT_TYPES = Object.freeze(['Occurrence', 'Near miss', 'Hazard report', 'Field Service Bulletin', 'Other']);

const BLANK = { date: null, type: 'Occurrence', summary: '', description: '', location: '', parties: '' };

/** @param {string} s */
function isDay(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** A report's fields after a change; any left out keep their value. @param {ReportFields} a @param {any} cur */
function fieldsOf(a, cur) {
  const text = (/** @type {unknown} */ v, /** @type {string} */ was) => (v === undefined ? was : String(v ?? '').trim());
  const date = a.date === undefined ? cur.date : String(a.date ?? '').trim() || null;
  if (date !== null && !isDay(date)) throw new PivotError('safetyReport.date', `${date} is not a date (YYYY-MM-DD).`);
  const type = a.reportType === undefined ? cur.type : String(a.reportType);
  if (!SAFETY_REPORT_TYPES.includes(type)) throw new PivotError('safetyReport.type', `A safety report is one of ${SAFETY_REPORT_TYPES.join(', ')}.`);
  return {
    date, type,
    summary: needText(a.summary === undefined ? cur.summary : a.summary, 'A safety report summary'),
    description: text(a.description, cur.description), location: text(a.location, cur.location), parties: text(a.parties, cur.parties),
  };
}

/** @param {Data} data @param {Act} act @param {ReportFields & { id?: string, hazardId: string, platformId: string }} args */
export function createSafetyReport(data, act, { id = newId(), hazardId, platformId, ...rest }) {
  need(data, 'hazardPlatform', ids.hazardPlatform(hazardId, platformId));
  // Kept in the order added, which the time to the second does not keep, so Report IDs follow it.
  const seq = Math.max(0, ...all(data, 'safetyReport').map((r) => r.seq ?? 0)) + 1;
  const rec = created(act, id, { hazardId, platformId, seq, ...fieldsOf(rest, BLANK) });
  return commit(data, act, 'Add safety report', [{ kind: 'safetyReport', rec }]);
}

/** @param {Data} data @param {Act} act @param {ReportFields & { id: string }} args */
export function updateSafetyReport(data, act, { id, ...rest }) {
  const r = need(data, 'safetyReport', id);
  return commit(data, act, 'Edit safety report', [{ kind: 'safetyReport', rec: changed(r, act, fieldsOf(rest, r)) }]);
}

/**
 * Move a safety report to another platform the same hazard is on: it was filed against the wrong
 * one. Both platforms see the change.
 * @param {Data} data @param {Act} act @param {{ id: string, platformId: string }} args
 */
export function moveSafetyReport(data, act, { id, platformId }) {
  const r = need(data, 'safetyReport', id);
  if (r.platformId === platformId) return data;
  if (get(data, 'hazardPlatform', ids.hazardPlatform(r.hazardId, platformId))?.status !== 'live') {
    throw new PivotError('not-found', 'The hazard is not on that platform.');
  }
  return commit(data, act, 'Move safety report', [{ kind: 'safetyReport', rec: changed(r, act, { platformId }) }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string }} args */
export function deleteSafetyReport(data, act, { id }) {
  const r = need(data, 'safetyReport', id);
  return commit(data, act, 'Delete safety report', [{ kind: 'safetyReport', rec: changed(r, act, { status: 'deleted' }) }]);
}
