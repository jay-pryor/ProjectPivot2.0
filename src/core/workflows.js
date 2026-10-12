import { get, live } from './data.js';
import { hazardLabel, controlLabel, workflowLabel, ids } from './ids.js';
import { platformHazards, byNumber, causalFactorsOn, platformListOn, controlsOnPlatform, implementedByOf, assessmentOf, sfarpOf, groupsOf, openItems, referenceTargets, targetPlatforms, onboardingOf } from './queries.js';
import { scheduleOf } from './schedule.js';
import { RECEPTORS } from './receptors.js';
import { entries, deletedEntries } from './history.js';

/** @typedef {import('./data.js').Data} Data */
/** @typedef {import('./data.js').Rec} Rec */

/** The workflows, in the order the dashboard offers them; only those ready can be started. */
export const WORKFLOW_TYPES = Object.freeze([
  { type: 'platformReview', name: 'Platform Review', blurb: 'Walk each hazard on a platform through six checks, then complete its review.', ready: true },
  { type: 'platformOnboarding', name: 'Platform Onboarding', blurb: 'Set up a new platform: its groups, hazards, facets and controls.', ready: true },
  { type: 'newTechData', name: 'New Tech Data', blurb: 'Work new technical data through the platforms, controls and ratings it affects.', ready: true },
  { type: 'transferOwner', name: 'Transfer Platform Owner', blurb: 'Hand a platform and everything open on it to a new owner.', ready: true },
  { type: 'referenceUpdate', name: 'Reference Update', blurb: 'Take a reference to a new revision and check everything that cites it.', ready: true },
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
  if (wf.type === 'newTechData') return techProgress(data, wf);
  if (wf.type === 'transferOwner') {
    const groups = transferGroups(data, wf.platformId, String(wf.updatedAt).slice(0, 10), wf.id).filter((g) => g.items.length);
    const done = Number(Boolean(wf.toOwnerId)) + groups.filter((g) => stepOf(data, wf.id, '-', `group:${g.key}`)?.checked).length;
    return { perHazard: new Map(), done, total: groups.length + 1 };
  }
  if (wf.type === 'referenceUpdate') {
    const items = referenceItems(data, wf.referenceId);
    const drafted = Boolean(String(wf.revision ?? '').trim() && (wf.file || String(wf.url ?? '').trim() || String(wf.path ?? '').trim()));
    const done = Number(drafted) + items.filter((i) => stepOf(data, wf.id, i.key, 'item')?.checked).length;
    return { perHazard: new Map(), done, total: items.length + 1 };
  }
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

export { onboardingOf } from './queries.js';

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

/** @param {Data} data @param {string} kind 'hazard', 'control', or 'facetOption' @param {string} id @returns {Set<string>} */
const assignedGroups = (data, kind, id) => new Set(live(data, 'optionGroup').filter((l) => l.optionKind === kind && l.optionId === id).map((l) => /** @type {string} */ (l.groupId)));

/** @param {Data} data @param {string} groupId */
const groupName = (data, groupId) => (groupId === 'all' ? 'All platforms' : get(data, 'platformGroup', groupId)?.name ?? '');

/**
 * The groups a hazard on a platform takes suggestions from: those the platform is in that the
 * hazard is assigned to, and All platforms when the hazard is assigned to it.
 * @param {Data} data @param {string} platformId @param {string} hazardId @returns {string[]}
 */
export function sharedGroups(data, platformId, hazardId) {
  const mine = new Set(groupsOf(data, platformId).map((g) => g.id));
  return [...assignedGroups(data, 'hazard', hazardId)].filter((g) => g === 'all' || mine.has(g));
}

/**
 * What onboarding suggests, from platform groups: hazards assigned to the platform's groups (or
 * All platforms) not on it yet; and, for a hazard there, facet options or controls assigned to the
 * groups it shares with the platform, not there yet (a control: not Implemented there yet). Each
 * says which groups it came from.
 * @param {Data} data @param {{ kind: string, platformId: string, hazardId?: string }} o
 * @returns {{ id: string, text: string, from: string }[]}
 */
export function groupSuggestions(data, { kind, platformId, hazardId }) {
  // What is assigned to All platforms applies to every platform, so it is always offered.
  const groups = ['all', ...(kind === 'hazard' ? groupsOf(data, platformId).map((g) => g.id) : sharedGroups(data, platformId, /** @type {string} */ (hazardId)))];
  const want = new Set(groups);
  const from = (/** @type {string} */ k, /** @type {string} */ id) => [...assignedGroups(data, k, id)].filter((g) => want.has(g)).map((g) => groupName(data, g)).join(', ');
  if (kind === 'hazard') {
    const on = new Set(live(data, 'hazardPlatform').filter((l) => l.platformId === platformId).map((l) => l.hazardId));
    return live(data, 'hazard').filter((h) => !on.has(h.id)).sort(byNumber)
      .map((h) => ({ id: h.id, text: `${hazardLabel(h)} ${h.title}`, from: from('hazard', h.id) })).filter((s) => s.from);
  }
  if (kind === 'control') {
    // A hazard's controls come onto each of its platforms as Recommended, so only those already
    // Implemented here are left out: the rest are what onboarding asks about.
    const here = new Set(controlsOnPlatform(data, /** @type {string} */ (hazardId), platformId).filter((c) => c.state === 'implemented').map((c) => c.control.id));
    return live(data, 'control').filter((c) => !here.has(c.id)).sort(byNumber)
      .map((c) => ({ id: c.id, text: c.title, from: from('control', c.id) })).filter((s) => s.from);
  }
  const entries = kind === 'causalFactor' ? causalFactorsOn(data, /** @type {string} */ (hazardId), platformId) : platformListOn(data, /** @type {any} */ (kind), /** @type {string} */ (hazardId), platformId);
  const have = new Set(entries.map((e) => String(e.text).trim().toLowerCase()));
  return live(data, 'facetOption').filter((o) => o.facet === kind && !have.has(String(o.name).trim().toLowerCase()))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((o) => ({ id: o.id, text: o.name, from: from('facetOption', o.id) })).filter((s) => s.from);
}

/** A linked record as a person reads it. @param {Data} data @param {string} kind @param {any} r */
function linkedLabel(data, kind, r) {
  if (kind === 'hazard') return `${hazardLabel(r)} ${r.title}`;
  if (kind === 'control') return `${controlLabel(r)} ${r.title}`;
  if (kind === 'platform') return r.name;
  if (kind === 'hazardPhase') return get(data, 'phase', r.phaseId)?.name ?? 'Lifecycle phase';
  return String(r.text ?? '');
}

/** A transfer's responsibility groups: their keys and titles, in order. */
export const TRANSFER_GROUPS = Object.freeze([
  ['acks', 'Changes waiting acknowledgement'], ['review', 'Review schedule'], ['workflows', 'Workflows on this platform'],
  ['awaiting', 'Controls awaiting a decision'], ['toImplement', 'Controls to implement'], ['controlGaps', 'Controls incomplete'],
  ['hazardGaps', 'Hazards unrated, unjustified or SFARP incomplete'],
]);

/** The open transfer of a platform, if any. @param {Data} data @param {string} platformId */
export function openTransfer(data, platformId) {
  return live(data, 'workflow').find((w) => w.type === 'transferOwner' && w.platformId === platformId && w.state === 'open') ?? null;
}

/** The open update of a reference, if any. @param {Data} data @param {string} referenceId */
export function openReferenceUpdate(data, referenceId) {
  return live(data, 'workflow').find((w) => w.type === 'referenceUpdate' && w.referenceId === referenceId && w.state === 'open') ?? null;
}

/**
 * What the owner of a platform answers for, as a transfer lists it: one group per kind, each with
 * its items (what they say, and where to see them).
 * @param {Data} data @param {string} platformId @param {string} today @param {string | null} [selfId] the transfer itself, left out of the platform's workflows
 */
export function transferGroups(data, platformId, today, selfId = null) {
  const items = openItems(data, today, null);
  const here = (/** @type {any[]} */ xs) => xs.filter((x) => x.platform.id === platformId);
  const s = scheduleOf(data, platformId, today);
  /** @type {Record<string, { text: string, view?: string, id?: string, tab?: string }[]>} */
  const by = {
    acks: here(items.acks).map((x) => ({ text: x.entry.action, view: 'platform', id: platformId, tab: 'history' })),
    review: [{ text: s.due ? `Next review ${s.due}${s.state === 'overdue' ? ' (overdue)' : s.state === 'dueSoon' ? ' (due soon)' : ''}${s.moved ? `, moved from ${s.seen}` : ''}` : 'No review schedule', view: 'platformReview', id: platformId }],
    workflows: live(data, 'workflow').filter((w) => w.platformId === platformId && w.state === 'open' && w.id !== selfId)
      .map((w) => ({ text: `${workflowLabel(w)} ${typeName(w.type)}`, view: 'workflow', id: w.id })),
    awaiting: here(items.awaiting).map((x) => ({ text: `${controlLabel(x.control)} ${x.control.title} on ${hazardLabel(x.hazard)} ${x.hazard.title}`, view: 'control', id: x.control.id, tab: `p:${platformId}` })),
    toImplement: here(items.toImplement).map((x) => ({ text: `${controlLabel(x.control)} ${x.control.title} on ${hazardLabel(x.hazard)} ${x.hazard.title}`, view: 'control', id: x.control.id, tab: `p:${platformId}` })),
    controlGaps: here(items.controlGaps ?? []).map((x) => ({ text: `${controlLabel(x.control)} ${x.control.title}: no ${x.missing.join(', ')}`, view: 'control', id: x.control.id, tab: `p:${platformId}` })),
    hazardGaps: [...here(items.unrated), ...here(items.unjustified ?? []), ...here(items.sfarpGaps ?? [])]
      .map((x) => ({ text: `${hazardLabel(x.hazard)} ${x.hazard.title}: ${x.missing.join(', ')}`, view: 'hazard', id: x.hazard.id, tab: `p:${platformId}` })),
  };
  return TRANSFER_GROUPS.map(([key, title]) => ({ key, title, items: by[key] }));
}

/** Where each kind of linked record is opened: its own page, or the page that holds it. */
const OPEN_AT = Object.freeze({
  hazard: (/** @type {any} */ r) => ({ view: 'hazard', id: r.id }),
  control: (/** @type {any} */ r) => ({ view: 'control', id: r.id }),
  platform: (/** @type {any} */ r) => ({ view: 'platform', id: r.id }),
  consequence: (/** @type {any} */ r) => ({ view: 'hazard', id: r.hazardId }),
  hazardPhase: (/** @type {any} */ r) => ({ view: 'hazard', id: r.hazardId }),
  causalFactor: (/** @type {any} */ r) => ({ view: 'hazard', id: r.hazardId, ...(r.platformId ? { tab: `p:${r.platformId}` } : {}) }),
  failureMode: (/** @type {any} */ r) => ({ view: 'hazard', id: r.hazardId, tab: `p:${r.platformId}` }),
  systemElement: (/** @type {any} */ r) => ({ view: 'hazard', id: r.hazardId, tab: `p:${r.platformId}` }),
  affectedGroup: (/** @type {any} */ r) => ({ view: 'hazard', id: r.hazardId, tab: `p:${r.platformId}` }),
});

/**
 * What a reference informs, as an update lists it: each live link to a live record, with the
 * platforms it reaches and where to open it.
 * @param {Data} data @param {string} referenceId
 */
export function referenceItems(data, referenceId) {
  return referenceTargets(data, referenceId).map(({ link, target }) => {
    const kind = link.targetKind;
    const platforms = targetPlatforms(data, kind, target.id).map((pid) => get(data, 'platform', pid)?.name ?? '').filter(Boolean);
    return { key: `${kind}:${target.id}`, kind, label: linkedLabel(data, kind, target), platforms, open: OPEN_AT[/** @type {keyof typeof OPEN_AT} */ (kind)](target) };
  });
}

/** A platform-hazard as New Tech Data keys it. @param {string} platformId @param {string} hazardId */
export const pairKey = (platformId, hazardId) => `${platformId}|${hazardId}`;

/** The open New Tech Data on a reference, if any. @param {Data} data @param {string} referenceId */
export function openTechData(data, referenceId) {
  return live(data, 'workflow').find((w) => w.type === 'newTechData' && w.referenceId === referenceId && w.state === 'open') ?? null;
}

/** The platforms New Tech Data can take in: live ones not being onboarded, by name. @param {Data} data */
export function techPlatforms(data) {
  return live(data, 'platform').filter((p) => !onboardingOf(data, p.id)).sort((a, b) => String(a.name).localeCompare(b.name));
}

/**
 * What a New Tech Data covers now: each platform ticked that can still be taken in, with the
 * hazards ticked on it that are still live and on it, in number order. A hazard the workflow
 * linked or made is marked added.
 * @param {Data} data @param {Rec} wf
 * @returns {{ platform: Rec, hazards: { hazard: Rec, reportId: string, key: string, added: boolean }[] }[]}
 */
export function techScope(data, wf) {
  const step = (/** @type {string} */ key) => stepOf(data, wf.id, key, 'scope');
  return techPlatforms(data).filter((p) => step(`p:${p.id}`)?.checked).map((platform) => ({
    platform,
    hazards: platformHazards(data, platform.id).filter((ph) => ph.hazard.status === 'live' && step(pairKey(platform.id, ph.hazard.id))?.checked)
      .sort((a, b) => byNumber(a.hazard, b.hazard))
      .map((ph) => {
        const key = pairKey(platform.id, ph.hazard.id);
        return { hazard: ph.hazard, reportId: ph.reportId, key, added: Boolean(step(key)?.added) };
      }),
  }));
}

/** Every platform-hazard in a New Tech Data's scope now, platform by platform. @param {Data} data @param {Rec} wf */
export function techPairs(data, wf) {
  return techScope(data, wf).flatMap((s) => s.hazards.map((x) => ({ platform: s.platform, ...x })));
}

/** New Tech Data's four cards on each platform-hazard, in order. */
export const TECH_CARDS = Object.freeze(['controls', 'safetyReports', 'residual', 'sfarp']);

/** @type {Readonly<Record<string, string>>} */
export const TECH_WORDS = Object.freeze({ controls: 'Controls', safetyReports: 'Safety reports', residual: 'Residual rating & justification', sfarp: 'SFARP' });

/** @type {Readonly<Record<string, string>>} */
export const TECH_QUESTIONS = Object.freeze({
  controls: 'Does it add, change or remove a control?',
  safetyReports: 'Does it report a safety occurrence?',
  residual: 'Does it change the residual rating or its justification?',
  sfarp: 'Does it change the SFARP?',
});

/**
 * What the changes made through a New Tech Data touched: for each pair in scope, the cards whose
 * records changed, and every control changed (the control itself, its link to a hazard, its kind
 * or status on a platform, how it is implemented, or who implements it).
 * @param {Data} data @param {Rec} wf
 * @returns {{ cards: Map<string, Set<string>>, controls: Set<string> }}
 */
export function techTouched(data, wf) {
  const pairs = techPairs(data, wf);
  const keys = new Set(pairs.map((x) => x.key));
  /** @type {Map<string, Set<string>>} */
  const cards = new Map();
  /** @type {Set<string>} */
  const controls = new Set();
  const mark = (/** @type {string} */ key, /** @type {string} */ card) => {
    if (!keys.has(key)) return;
    if (!cards.has(key)) cards.set(key, new Set());
    /** @type {Set<string>} */ (cards.get(key)).add(card);
  };
  /** A field's value as the change left it, not as it is now. @param {any} i @param {string} f */
  const afterOf = (i, f) => i.fields?.find((/** @type {any} */ x) => x.field === f)?.after;
  /** Whether a change also linked the record's control to its hazard. @param {any} e @param {Rec} r */
  const linkedIn = (e, r) => e.items.some((/** @type {any} */ j) => j.kind === 'hazardControl' && (j.change === 'created' || j.change === 'restored') && j.id === ids.hazardControl(r.hazardId, r.controlId));
  const on = (/** @type {any} */ x, /** @type {string} */ controlId) => controlsOnPlatform(data, x.hazard.id, x.platform.id).some((c) => c.control.id === controlId);
  for (const e of workflowChanges(data, wf.id)) {
    for (const i of e.items) {
      const r = get(data, i.kind, i.id);
      if (!r) continue;
      switch (i.kind) {
        case 'safetyReport': mark(pairKey(r.platformId, r.hazardId), 'safetyReports'); break;
        case 'sfarp': mark(pairKey(r.platformId, r.hazardId), 'sfarp'); break;
        case 'assessment': if (r.stage === 'residual') mark(pairKey(r.platformId, r.hazardId), 'residual'); break;
        case 'ruling': case 'controlOn': case 'implementationStatus':
          // Adding a control new to the hazard on one platform turns it off on the hazard's others,
          // in the same change: not a change there. (Taking it off one platform is.)
          if (!(i.kind === 'controlOn' && i.change === 'created' && afterOf(i, 'off') && linkedIn(e, r))) mark(pairKey(r.platformId, r.hazardId), 'controls');
          controls.add(r.controlId); break;
        case 'hazardControl':
          // Unlinked, the control is on none of the hazard's platforms now, so every pair on the hazard counts.
          for (const x of pairs) if (x.hazard.id === r.hazardId && (i.change === 'deleted' || on(x, r.controlId))) mark(x.key, 'controls');
          controls.add(r.controlId); break;
        case 'implementer': for (const x of pairs) if (x.platform.id === r.platformId && on(x, r.controlId)) mark(x.key, 'controls'); controls.add(r.controlId); break;
        case 'control': for (const x of pairs) if (on(x, r.id)) mark(x.key, 'controls'); controls.add(r.id); break;
        default: break;
      }
    }
  }
  return { cards, controls };
}

/**
 * The links Complete gives the reference: each scoped platform, each scoped hazard answered
 * Changed somewhere or added through the workflow, and each live control touched. Links already
 * there are left out.
 * @param {Data} data @param {Rec} wf
 * @returns {{ targetKind: string, targetId: string }[]}
 */
export function techLinks(data, wf) {
  const scope = techScope(data, wf);
  const changedHazards = new Set(scope.flatMap((s) => s.hazards.filter((x) => x.added || TECH_CARDS.some((c) => stepOf(data, wf.id, x.key, c)?.answer === 'changed')).map((x) => x.hazard.id)));
  const hazards = live(data, 'hazard').filter((h) => changedHazards.has(h.id)).sort(byNumber);
  const controls = [...techTouched(data, wf).controls].map((id) => get(data, 'control', id)).filter((c) => c && c.status === 'live').sort((a, b) => byNumber(/** @type {Rec} */ (a), /** @type {Rec} */ (b)));
  const want = [
    ...scope.map((s) => ({ targetKind: 'platform', targetId: s.platform.id })),
    ...hazards.map((h) => ({ targetKind: 'hazard', targetId: h.id })),
    ...controls.map((c) => ({ targetKind: 'control', targetId: /** @type {Rec} */ (c).id })),
  ];
  return want.filter((t) => get(data, 'referenceLink', ids.referenceLink(wf.referenceId, t.targetKind, t.targetId))?.status !== 'live');
}

/** How far a New Tech Data is: one for having a scope, then each card answered on each pair. @param {Data} data @param {Rec} wf */
export function techProgress(data, wf) {
  const pairs = techPairs(data, wf);
  /** @type {Map<string, number>} */
  const perHazard = new Map(pairs.map((x) => [x.key, TECH_CARDS.filter((c) => stepOf(data, wf.id, x.key, c)?.answer).length]));
  const done = Number(pairs.length > 0) + [...perHazard.values()].reduce((a, b) => a + b, 0);
  return { perHazard, done, total: pairs.length * TECH_CARDS.length + 1 };
}
