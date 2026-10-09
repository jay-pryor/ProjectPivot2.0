import { get, live } from './data.js';
import { hazardLabel } from './ids.js';
import { platformHazards, byNumber, causalFactorsOn, platformListOn, controlsOnPlatform, implementedByOf, assessmentOf, sfarpOf } from './queries.js';
import { RECEPTORS } from './receptors.js';
import { entries, deletedEntries } from './history.js';

/** @typedef {import('./data.js').Data} Data */
/** @typedef {import('./data.js').Rec} Rec */

/** The workflows, in the order the dashboard offers them; only those ready can be started. */
export const WORKFLOW_TYPES = Object.freeze([
  { type: 'platformReview', name: 'Platform Review', blurb: 'Walk each hazard on a platform through six checks, then complete its review.', ready: true },
  { type: 'platformOnboarding', name: 'Platform Onboarding', blurb: 'Set up a new platform: its groups, hazards, facets and controls.', ready: true },
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
  if (wf.type === 'platformOnboarding') {
    const o = onboardingProgress(data, wf);
    /** @type {Map<string, number>} */
    const perHazard = new Map([...o.perHazard].map(([id, x]) => [id, x.required]));
    const done = Number(o.details) + Number(o.groups) + Number(o.hazards) + [...perHazard.values()].reduce((a, b) => a + b, 0);
    return { perHazard, done, total: 3 + perHazard.size * 2 };
  }
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

/** The per-platform facets onboarding asks for on each hazard. */
export const FACET_KINDS = Object.freeze(['failureMode', 'systemElement', 'affectedGroup', 'causalFactor']);

/** Onboarding's "none applies" ticks: one per facet, and one for implemented controls. */
export const NONE_CHECKS = Object.freeze([...FACET_KINDS.map((f) => `none:${f}`), 'none:controls']);

/** Where onboarding can stand besides a hazard or the summary. */
export const ONBOARDING_POSITIONS = Object.freeze(['@details', '@groups', '@hazards']);

/** How many required things each hazard has in a workflow of this type. @param {{ type: string }} wf */
export const requiredOf = (wf) => (wf.type === 'platformOnboarding' ? 2 : CHECKS.length);

/**
 * The onboarding a platform is under: its most recently started onboarding workflow, unless that
 * one was completed. A platform never onboarded is under none.
 * @param {Data} data @param {string} platformId @returns {Rec | null}
 */
export function onboardingOf(data, platformId) {
  const latest = live(data, 'workflow').filter((w) => w.type === 'platformOnboarding' && w.platformId === platformId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))[0];
  return latest && latest.state !== 'completed' ? latest : null;
}

/** @param {Data} data @param {string} workflowId @param {string} hazardId @param {string} check */
const ticked = (data, workflowId, hazardId, check) => Boolean(stepOf(data, workflowId, hazardId, check)?.checked);

/** The words for each requirement, as the summary lists them. */
const FACET_NAME = Object.freeze({ failureMode: 'element failure modes', systemElement: 'systems or elements', affectedGroup: 'affected groups', causalFactor: 'causal factors' });

/**
 * What an onboarding still needs, worked out from the data: the platform's description, a group
 * and a hazard; on each hazard each facet (an entry, or None applies) and its implemented controls
 * (one Implemented with tier, origin, description and implemented-by here, or No controls
 * implemented); and whether each optional card has anything in it.
 * @param {Data} data @param {Rec} wf
 */
export function onboardingProgress(data, wf) {
  const pid = wf.platformId;
  const p = get(data, 'platform', pid);
  const details = Boolean(p && String(p.name ?? '').trim() && String(p.description ?? '').trim());
  const groups = live(data, 'platformGroupLink').some((l) => l.platformId === pid && get(data, 'platformGroup', l.groupId)?.status !== 'deleted');
  const hz = workflowHazards(data, wf);
  /** @type {{ hazardId: string | null, what: string }[]} */
  const unmet = [];
  if (!details) unmet.push({ hazardId: null, what: 'A description of the platform' });
  if (!groups) unmet.push({ hazardId: null, what: 'At least one platform group' });
  if (!hz.length) unmet.push({ hazardId: null, what: 'At least one hazard' });
  /** @type {Map<string, any>} */
  const perHazard = new Map();
  for (const { hazard } of hz) {
    const hid = hazard.id;
    /** @type {Record<string, boolean>} */
    const facets = {};
    for (const f of FACET_KINDS) {
      const entries = f === 'causalFactor' ? causalFactorsOn(data, hid, pid) : platformListOn(data, /** @type {any} */ (f), hid, pid);
      facets[f] = entries.length > 0 || ticked(data, wf.id, hid, `none:${f}`);
    }
    const controls = controlsOnPlatform(data, hid, pid);
    const complete = (/** @type {Rec} */ c) => Boolean(c.tier && String(c.origin ?? '').trim() && String(c.description ?? '').trim() && implementedByOf(data, c.id, pid));
    const implemented = controls.some((c) => c.state === 'implemented') && controls.filter((c) => c.state === 'implemented').every((c) => complete(c.control))
      || (ticked(data, wf.id, hid, 'none:controls') && !controls.some((c) => c.state === 'implemented'));
    const rated = (/** @type {string} */ stage) => RECEPTORS.some((r) => { const a = assessmentOf(data, hid, pid, stage, r); return a && (a.likelihood != null || a.consequence != null); });
    const why = (/** @type {string} */ stage) => RECEPTORS.some((r) => { const a = assessmentOf(data, hid, pid, stage, r); return a && (String(a.likelihoodWhy ?? '').trim() || String(a.consequenceWhy ?? '').trim()); });
    const sf = sfarpOf(data, hid, pid);
    const optional = {
      otherControls: controls.some((c) => c.state !== 'implemented'),
      ratings: rated('initial') || rated('residual'),
      justifications: why('initial') || why('residual'),
      sfarp: ['justification', 'conclusion', 'conditions'].some((f) => String(sf[f] ?? '').trim()),
    };
    const facetsMet = FACET_KINDS.every((f) => facets[f]);
    for (const f of FACET_KINDS) if (!facets[f]) unmet.push({ hazardId: hid, what: `${hazardLabel(hazard)}: ${FACET_NAME[/** @type {'failureMode'} */ (f)]}, or None applies` });
    if (!implemented) unmet.push({ hazardId: hid, what: `${hazardLabel(hazard)}: implemented controls with tier, origin, description and implemented by, or No controls implemented` });
    perHazard.set(hid, { facets, implemented, optional, required: Number(facetsMet) + Number(implemented) });
  }
  return { details, groups, hazards: hz.length > 0, perHazard, unmet };
}
