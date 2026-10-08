import { PivotError } from '../errors.js';
import { newId, ids, workflowLabel, UNNUMBERED } from '../ids.js';
import { get, created, changed, need, put } from '../data.js';
import { commit } from '../apply.js';
import { dueOf } from '../schedule.js';
import { seenRec } from './reviews.js';
import { CHECKS, workflowHazards, workflowProgress, openPlatformReview } from '../workflows.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */
/** @typedef {import('../data.js').Rec} Rec */

/** @param {Rec} wf */
const named = (wf) => (workflowLabel(wf) === UNNUMBERED ? 'This workflow' : workflowLabel(wf));

/**
 * A workflow that is still open and, unless `owner` is false, owned by whoever is acting.
 * @param {Data} data @param {Act} act @param {string} workflowId @param {boolean} [owner]
 */
function needOpen(data, act, workflowId, owner = true) {
  const wf = need(data, 'workflow', workflowId);
  if (wf.state !== 'open') throw new PivotError('workflow.ended', `${named(wf)} is ${wf.state} and can no longer be changed.`);
  if (owner && wf.ownerId !== act.by) throw new PivotError('workflow.owner', `${named(wf)} belongs to someone else. Take it over to work on it.`);
  return wf;
}

/** @param {Data} data @param {Rec} wf @param {unknown} hazardId */
function needHazard(data, wf, hazardId) {
  if (!workflowHazards(data, wf).some((x) => x.hazard.id === hazardId)) throw new PivotError('workflow.hazard', 'That hazard is not on this platform.');
  return /** @type {string} */ (hazardId);
}

/**
 * Start a workflow, owned by whoever starts it. A Platform Review needs a live platform with no
 * review open, and opens on its first hazard (on the summary when it has none).
 * @param {Data} data @param {Act} act @param {{ id?: string, type: string, platformId: string }} args
 */
export function startWorkflow(data, act, { id = newId(), type, platformId }) {
  if (type !== 'platformReview') throw new PivotError('workflow.type', 'That workflow is not available yet.');
  const p = need(data, 'platform', platformId);
  if (p.status !== 'live') throw new PivotError('platform.retired', `${p.name} is retired, so it cannot be reviewed.`);
  if (openPlatformReview(data, platformId)) throw new PivotError('review.open', `${p.name} already has a review in progress.`);
  const first = workflowHazards(data, { platformId })[0]?.hazard.id ?? null;
  const rec = created(act, id, { number: null, type, platformId, ownerId: act.by, state: 'open', at: { hazardId: first }, outcome: '', notes: '', endedBy: null, endedAt: null });
  return commit(data, act, 'Start workflow', [{ kind: 'workflow', rec }]);
}

/** Where the owner is in it, kept for resuming: a hazard, or null for the summary. @param {Data} data @param {Act} act @param {{ workflowId: string, hazardId: string | null }} args */
export function setWorkflowPosition(data, act, { workflowId, hazardId }) {
  const wf = needOpen(data, act, workflowId);
  const to = hazardId ? needHazard(data, wf, hazardId) : null;
  return commit(data, act, 'Move in workflow', [{ kind: 'workflow', rec: changed(wf, act, { at: { hazardId: to } }) }]);
}

/**
 * Tick or untick one check on a hazard, or change its note; either may be left out. A tick may
 * arrive as the text a checkbox sends.
 * @param {Data} data @param {Act} act
 * @param {{ workflowId: string, hazardId: string, check: string, checked?: boolean | string, note?: string }} args
 */
export function setStep(data, act, { workflowId, hazardId, check, checked, note }) {
  const wf = needOpen(data, act, workflowId);
  if (!CHECKS.includes(check)) throw new PivotError('workflow.check', 'That is not one of the review checks.');
  needHazard(data, wf, hazardId);
  const id = ids.workflowStep(workflowId, hazardId, check);
  const fields = {
    ...(checked === undefined ? {} : { checked: checked === true || checked === 'true' }),
    ...(note === undefined ? {} : { note: String(note).trim() }),
  };
  const existing = get(data, 'workflowStep', id);
  const rec = existing && existing.status === 'live'
    ? changed(existing, act, fields)
    : created(act, id, { workflowId, hazardId, check, checked: false, note: '', ...fields });
  return commit(data, act, 'Check workflow step', [{ kind: 'workflowStep', rec }]);
}

/** @param {Data} data @param {Act} act @param {{ workflowId: string, outcome: string }} args */
export function setWorkflowOutcome(data, act, { workflowId, outcome }) {
  const wf = needOpen(data, act, workflowId);
  return commit(data, act, 'Set workflow outcome', [{ kind: 'workflow', rec: changed(wf, act, { outcome: String(outcome ?? '').trim() }) }]);
}

/** @param {Data} data @param {Act} act @param {{ workflowId: string, notes: string }} args */
export function setWorkflowNotes(data, act, { workflowId, notes }) {
  const wf = needOpen(data, act, workflowId);
  return commit(data, act, 'Set workflow notes', [{ kind: 'workflow', rec: changed(wf, act, { notes: String(notes ?? '').trim() }) }]);
}

/** Make whoever is acting its owner. Anyone may, while it is open. @param {Data} data @param {Act} act @param {{ workflowId: string }} args */
export function takeOverWorkflow(data, act, { workflowId }) {
  const wf = needOpen(data, act, workflowId, false);
  if (wf.ownerId === act.by) return data;
  return commit(data, act, 'Take over workflow', [{ kind: 'workflow', rec: changed(wf, act, { ownerId: act.by }) }]);
}

/** The records that cancel an open workflow: it, marked cancelled. Its checks are kept. @param {Data} _data @param {Act} act @param {Rec} wf */
export function cancelRecs(_data, act, wf) {
  return [{ kind: 'workflow', rec: changed(wf, act, { state: 'cancelled', endedBy: act.by, endedAt: act.at }) }];
}

/** @param {Data} data @param {Act} act @param {{ workflowId: string }} args */
export function cancelWorkflow(data, act, { workflowId }) {
  return commit(data, act, 'Cancel workflow', cancelRecs(data, act, needOpen(data, act, workflowId)));
}

/**
 * Complete a Platform Review, once every check on every hazard now on the platform is ticked. It
 * writes the completed review (one id per workflow, so two saves completing it write one record)
 * the way reviews always have: the schedule counts on from the date the review answered, stepping
 * in whole periods past today, and the new date is marked seen.
 * @param {Data} data @param {Act} act @param {{ workflowId: string }} args
 */
export function completeWorkflow(data, act, { workflowId }) {
  const wf = needOpen(data, act, workflowId);
  const p = need(data, 'platform', wf.platformId);
  const { done, total } = workflowProgress(data, wf);
  const left = total - done;
  if (left) throw new PivotError('workflow.unchecked', `${left} check${left === 1 ? ' is' : 's are'} not ticked yet.`);
  const dueBefore = dueOf(data, p.id);
  if (!dueBefore) throw new PivotError('review.no-schedule', `Set a review schedule for ${p.name} first.`);
  const review = created(act, ids.workflowReview(wf.id), {
    platformId: p.id, workflowId: wf.id, state: 'completed', outcome: wf.outcome, notes: wf.notes,
    dueBefore, dueAfter: null, completedBy: act.by, completedAt: act.at,
  });
  const counted = changed(p, act, { reviewStart: dueBefore });
  const dueAfter = /** @type {string} */ (dueOf(put(put(data, 'review', review), 'platform', counted), p.id));
  return commit(data, act, 'Complete review', [
    { kind: 'review', rec: { ...review, dueAfter } },
    { kind: 'platform', rec: counted },
    seenRec(data, act, p.id, dueAfter),
    { kind: 'workflow', rec: changed(wf, act, { state: 'completed', endedBy: act.by, endedAt: act.at }) },
  ]);
}
