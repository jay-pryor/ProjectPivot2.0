import { get, live } from './data.js';
import { hazardLabel } from './ids.js';
import { platformHazards, byNumber } from './queries.js';
import { entries, deletedEntries } from './history.js';

/** @typedef {import('./data.js').Data} Data */
/** @typedef {import('./data.js').Rec} Rec */

/** The workflows, in the order the dashboard offers them; only those ready can be started. */
export const WORKFLOW_TYPES = Object.freeze([
  { type: 'platformReview', name: 'Platform Review', blurb: 'Walk each hazard on a platform through six checks, then complete its review.', ready: true },
  { type: 'platformOnboarding', name: 'Platform Onboarding', blurb: 'Set up a new platform: its groups, hazards, facets and controls.', ready: false },
  { type: 'newTechData', name: 'New Tech Data', blurb: 'Work new technical data through the platforms, controls and ratings it affects.', ready: false },
  { type: 'transferOwner', name: 'Transfer Platform Owner', blurb: 'Hand a platform and everything open on it to a new owner.', ready: false },
  { type: 'referenceUpdate', name: 'Reference Update', blurb: 'Take a reference to a new revision and check everything that cites it.', ready: false },
]);

/** @param {string} type */
export const typeName = (type) => WORKFLOW_TYPES.find((t) => t.type === type)?.name ?? type;

/** A Platform Review's six checks on each hazard, in order. */
export const CHECKS = Object.freeze(['safetyReports', 'references', 'controls', 'residualRatings', 'residualJustifications', 'sfarp']);

/** @type {Readonly<Record<string, string>>} */
export const CHECK_WORDS = Object.freeze({
  safetyReports: 'Safety reports', references: 'References', controls: 'Controls',
  residualRatings: 'Residual risk ratings', residualJustifications: 'Residual risk justifications', sfarp: 'SFARP',
});

/** @type {Readonly<Record<string, string>>} */
export const CHECK_QUESTIONS = Object.freeze({
  safetyReports: 'Any safety reports that fit but are not included?',
  references: 'Any references changed or updated and not represented?',
  controls: 'Any controls implemented that are not included?',
  residualRatings: 'Any changes to the residual ratings because of the above?',
  residualJustifications: 'Do the residual justifications still make sense?',
  sfarp: 'Does the SFARP still make sense?',
});

/** The open Platform Review on a platform, if any. @param {Data} data @param {string} platformId @returns {Rec | null} */
export function openPlatformReview(data, platformId) {
  return live(data, 'workflow').find((w) => w.type === 'platformReview' && w.platformId === platformId && w.state === 'open') ?? null;
}

/**
 * The hazards a workflow covers. Open: those on its platform now, in number order. Ended: those on
 * its platform when it ended (for one ended before that was kept, those it has checks for).
 * @param {Data} data @param {any} wf a workflow, or just `{ platformId }` for one about to start
 * @returns {{ hazard: Rec, reportId: string }[]}
 */
export function workflowHazards(data, wf) {
  const onNow = platformHazards(data, wf.platformId);
  if (!wf.state || wf.state === 'open') return onNow.map((ph) => ({ hazard: ph.hazard, reportId: ph.reportId })).sort((a, b) => byNumber(a.hazard, b.hazard));
  const ids = new Set(Array.isArray(wf.covered) ? wf.covered : live(data, 'workflowStep').filter((s) => s.workflowId === wf.id).map((s) => s.hazardId));
  const reportIds = new Map(onNow.map((ph) => [ph.hazard.id, ph.reportId]));
  return [...ids].map((id) => get(data, 'hazard', id)).filter((h) => h && h.status !== 'deleted')
    .map((h) => ({ hazard: /** @type {Rec} */ (h), reportId: reportIds.get(/** @type {Rec} */ (h).id) ?? hazardLabel(/** @type {Rec} */ (h)) }))
    .sort((a, b) => byNumber(a.hazard, b.hazard));
}

/** @param {Data} data @param {string} workflowId @param {string} hazardId @param {string} check @returns {Rec | null} */
export function stepOf(data, workflowId, hazardId, check) {
  const s = get(data, 'workflowStep', `ws:${workflowId}:${hazardId}:${check}`);
  return s && s.status === 'live' ? s : null;
}

/** How many checks are ticked on each hazard the workflow covers, and in all. @param {Data} data @param {Rec} wf */
export function workflowProgress(data, wf) {
  /** @type {Map<string, number>} */
  const perHazard = new Map();
  for (const { hazard } of workflowHazards(data, wf)) perHazard.set(hazard.id, CHECKS.filter((c) => stepOf(data, wf.id, hazard.id, c)?.checked).length);
  const done = [...perHazard.values()].reduce((a, b) => a + b, 0);
  return { perHazard, done, total: perHazard.size * CHECKS.length };
}

/** When anything last happened to a workflow or its checks. @param {Data} data @param {Rec} wf */
export function lastActivity(data, wf) {
  return live(data, 'workflowStep').filter((s) => s.workflowId === wf.id).reduce((m, s) => (s.updatedAt > m ? s.updatedAt : m), wf.updatedAt);
}

/** Open workflows of one owner (everyone's for null), most recently active first. @param {Data} data @param {string | null} ownerId */
export function openWorkflows(data, ownerId) {
  return live(data, 'workflow').filter((w) => w.state === 'open' && (ownerId == null || w.ownerId === ownerId))
    .map((w) => ({ w, t: lastActivity(data, w) })).sort((a, b) => (a.t < b.t ? 1 : a.t > b.t ? -1 : 0)).map(({ w }) => w);
}

/**
 * Completed and cancelled workflows, most recently ended first; `since` a date (YYYY-MM-DD) keeps
 * those ended on or after it; `ownerId` those owned by that profile.
 * @param {Data} data @param {{ since?: string | null, ownerId?: string | null }} opts
 */
export function endedWorkflows(data, { since = null, ownerId = null }) {
  return live(data, 'workflow').filter((w) => w.state !== 'open' && (ownerId == null || w.ownerId === ownerId) && (!since || String(w.endedAt).slice(0, 10) >= since))
    .sort((a, b) => (a.endedAt < b.endedAt ? 1 : a.endedAt > b.endedAt ? -1 : 0));
}

/** The changes made through a workflow, oldest first, leaving out its own ticks and moves. @param {Data} data @param {string} workflowId */
export function workflowChanges(data, workflowId) {
  const gone = deletedEntries(data);
  return entries(data).filter((e) => e.type === 'change' && e.workflow === workflowId && !gone.has(e.id)
    && e.items.some((/** @type {any} */ i) => i.kind !== 'workflow' && i.kind !== 'workflowStep'));
}
