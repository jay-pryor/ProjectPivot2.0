import { PivotError } from '../errors.js';
import { newId, ids, workflowLabel, UNNUMBERED } from '../ids.js';
import { get, created, changed, need, put } from '../data.js';
import { commit } from '../apply.js';
import { dueOf } from '../schedule.js';
import { seenRec } from './reviews.js';
import { CHECKS, NONE_CHECKS, ONBOARDING_POSITIONS, workflowHazards, workflowProgress, openPlatformReview, onboardingOf, onboardingProgress } from '../workflows.js';
import { createPlatform } from './platforms.js';

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

/** A workflow's opening record. @param {Act} act @param {string} id @param {string} type @param {string} platformId @param {string | null} at */
const opening = (act, id, type, platformId, at) => created(act, id, { number: null, type, platformId, ownerId: act.by, state: 'open', at: { hazardId: at }, outcome: '', notes: '', endedBy: null, endedAt: null });

/**
 * Onboard a new platform: make it and its onboarding together, the onboarding owned by whoever
 * starts it and opening on the platform's details.
 * @param {Data} data @param {Act} act @param {{ id?: string, platformId?: string, name: string, ownerId: string }} args
 */
export function startOnboarding(data, act, { id = newId(), platformId = newId(), name, ownerId }) {
  const withPlatform = createPlatform(data, act, { id: platformId, name, ownerId });
  const platform = withPlatform.records.platform[platformId];
  return commit(data, act, 'Onboard platform', [{ kind: 'platform', rec: platform }, { kind: 'workflow', rec: opening(act, id, 'platformOnboarding', platformId, '@details') }]);
}

/**
 * Start a workflow, owned by whoever starts it. A Platform Review needs a live platform that is not
 * being onboarded and has no review open, and opens on its first hazard (on the summary when it has
 * none). A Platform Onboarding is started again only for a platform whose onboarding was cancelled.
 * @param {Data} data @param {Act} act @param {{ id?: string, type: string, platformId: string }} args
 */
export function startWorkflow(data, act, { id = newId(), type, platformId }) {
  const p = need(data, 'platform', platformId);
  if (type === 'platformOnboarding') {
    const under = onboardingOf(data, platformId);
    if (!under) throw new PivotError('onboarding.not', `${p.name} has been onboarded already.`);
    if (under.state === 'open') throw new PivotError('onboarding.open', `${p.name} is being onboarded already.`);
    if (p.status !== 'live') throw new PivotError('platform.retired', `${p.name} is retired.`);
    return commit(data, act, 'Start workflow', [{ kind: 'workflow', rec: opening(act, id, type, platformId, '@details') }]);
  }
  if (type !== 'platformReview') throw new PivotError('workflow.type', 'That workflow is not available yet.');
  if (p.status !== 'live') throw new PivotError('platform.retired', `${p.name} is retired, so it cannot be reviewed.`);
  if (onboardingOf(data, platformId)) throw new PivotError('review.onboarding', `Finish onboarding ${p.name} first.`);
  if (openPlatformReview(data, platformId)) throw new PivotError('review.open', `${p.name} already has a review in progress.`);
  const first = workflowHazards(data, { platformId })[0]?.hazard.id ?? null;
  return commit(data, act, 'Start workflow', [{ kind: 'workflow', rec: opening(act, id, type, platformId, first) }]);
}

/** Where the owner is in it, kept for resuming: a hazard, or null for the summary. @param {Data} data @param {Act} act @param {{ workflowId: string, hazardId: string | null }} args */
export function setWorkflowPosition(data, act, { workflowId, hazardId }) {
  const wf = needOpen(data, act, workflowId);
  const to = !hazardId ? null : wf.type === 'platformOnboarding' && ONBOARDING_POSITIONS.includes(hazardId) ? hazardId : needHazard(data, wf, hazardId);
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
  const allowed = wf.type === 'platformOnboarding' ? NONE_CHECKS : CHECKS;
  if (!allowed.includes(check)) throw new PivotError('workflow.check', 'That is not one of this workflow’s checks.');
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

/** The hazards an open workflow covers as it ends, kept with it so its record does not change as the platform does. @param {Data} data @param {Rec} wf */
const covered = (data, wf) => workflowHazards(data, wf).map((x) => x.hazard.id);

/** The records that cancel an open workflow: it, marked cancelled, with the hazards it covered. Its checks are kept. @param {Data} data @param {Act} act @param {Rec} wf */
export function cancelRecs(data, act, wf) {
  return [{ kind: 'workflow', rec: changed(wf, act, { state: 'cancelled', endedBy: act.by, endedAt: act.at, covered: covered(data, wf) }) }];
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
  if (wf.type === 'platformOnboarding') {
    const { unmet } = onboardingProgress(data, wf);
    if (unmet.length) throw new PivotError('workflow.unmet', `${unmet.length} thing${unmet.length === 1 ? ' is' : 's are'} still needed.`);
    return commit(data, act, 'Complete onboarding', [{ kind: 'workflow', rec: changed(wf, act, { state: 'completed', endedBy: act.by, endedAt: act.at, covered: covered(data, wf) }) }]);
  }
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
    { kind: 'workflow', rec: changed(wf, act, { state: 'completed', endedBy: act.by, endedAt: act.at, covered: covered(data, wf) }) },
  ]);
}
