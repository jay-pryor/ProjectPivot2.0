import { newId } from '../ids.js';
import { created, changed, need } from '../data.js';
import { commit } from '../apply.js';
import { sameJson } from '../json.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */

/** @param {Data} data @param {Act} act @param {{ id?: string, report: Record<string, any> }} args */
export function createReport(data, act, { id = newId(), report }) {
  return commit(data, act, 'Produce report', [{ kind: 'report', rec: created(act, id, structuredClone(report)) }]);
}

/** Delete a produced report: it leaves the list, and its record stays in the history as deleted. @param {Data} data @param {Act} act @param {{ id: string }} args */
export function deleteReport(data, act, { id }) {
  const r = need(data, 'report', id);
  if (r.status === 'deleted') return data;
  return commit(data, act, 'Delete report', [{ kind: 'report', rec: changed(r, act, { status: 'deleted' }) }]);
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

/** A report's stage: being worked on, or made and waiting for review. */
export const STAGES = Object.freeze({ inProgress: 'in-progress', forReview: 'for-review' });
/** A report made before stages existed has been made, so it is For Review. @param {Record<string, any>} r */
export const stageOf = (r) => (r && r.stage === STAGES.inProgress ? STAGES.inProgress : STAGES.forReview);

/**
 * Start a report: a name, its own copy of a design, In-Progress.
 * @param {Data} data @param {Act} act @param {{ id?: string, title: string, design: Record<string, any> }} args
 */
export function startReport(data, act, { id = newId(), title, design }) {
  return commit(data, act, 'Start report', [{ kind: 'report', rec: created(act, id, {
    title: String(title).trim(), stage: STAGES.inProgress, design: structuredClone(design ?? {}),
    platformId: null, platformName: '', producedAt: null, producedBy: null, classification: '',
  }) }]);
}

/**
 * A report's own design, as the designer edits it. Not in the history (every tick would be an
 * entry), like the shared design. A change sends a For Review report back to In-Progress.
 * @param {Data} data @param {Act} act @param {{ id: string, design: Record<string, any>, platformId?: string | null }} args
 */
export function setOwnReportDesign(data, act, { id, design, platformId }) {
  const r = need(data, 'report', id);
  const next = structuredClone(design ?? {});
  const designChanged = !sameJson(r.design, next);
  const platformChanged = platformId !== undefined && platformId !== r.platformId;
  if (!designChanged && !platformChanged) return data;
  const rec = changed(r, act, {
    design: next,
    ...(platformChanged ? { platformId } : {}),
    ...(designChanged ? { stage: STAGES.inProgress } : {}),
  });
  return { ...data, records: { ...data.records, report: { ...data.records.report, [id]: rec } } };
}

/**
 * Make a report: its document onto its own record, and For Review.
 * @param {Data} data @param {Act} act @param {{ id: string, report: Record<string, any> }} args
 */
export function makeReport(data, act, { id, report }) {
  const r = need(data, 'report', id);
  const { title: _t, design: _d, ...made } = structuredClone(report);
  return commit(data, act, 'Make report', [{ kind: 'report', rec: changed(r, act, { ...made, stage: STAGES.forReview }) }]);
}
