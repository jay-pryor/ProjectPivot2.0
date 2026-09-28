import { newId } from '../ids.js';
import { created } from '../data.js';
import { commit } from '../apply.js';
import { sameJson } from '../json.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */

/** @param {Data} data @param {Act} act @param {{ id?: string, report: Record<string, any> }} args */
export function createReport(data, act, { id = newId(), report }) {
  return commit(data, act, 'Produce report', [{ kind: 'report', rec: created(act, id, structuredClone(report)) }]);
}

/**
 * The DocGen design everyone shares. Not a record: saved, merged and backed up with the data,
 * but its edits (every tick in the designer) are not written to the history.
 * @param {Data} data @param {Record<string, any>} design
 */
export function setReportDesign(data, design) {
  const next = structuredClone(design ?? {});
  return sameJson(data.reportDesign, next) ? data : { ...data, reportDesign: next };
}
