import { PivotError } from '../errors.js';
import { newId, ids, workflowLabel, UNNUMBERED } from '../ids.js';
import { get, live, created, changed, need, put } from '../data.js';
import { aestDate } from '../time.js';
import { commit } from '../apply.js';
import { dueOf } from '../schedule.js';
import { seenRec } from './reviews.js';
import { CHECKS, NONE_CHECKS, ONBOARDING_POSITIONS, workflowHazards, workflowProgress, openPlatformReview, onboardingOf, onboardingProgress, stepOf, TRANSFER_GROUPS, transferGroups, openTransfer, referenceItems, openReferenceUpdate, openTechData, techPairs, pairKey, TECH_CARDS, techLinks } from '../workflows.js';
import { createPlatform, linkHazard } from './platforms.js';
import { createHazard } from './hazards.js';
import { createReference } from './references.js';

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

/** Where New Tech Data can stand: its scope, or a pair in scope. @param {Data} data @param {Rec} wf @param {string} at */
function needPosition(data, wf, at) {
  if (at !== '@scope' && !techPairs(data, wf).some((x) => x.key === at)) throw new PivotError('workflow.hazard', 'That hazard is not in this workflow’s scope.');
  return at;
}

/** An open New Tech Data its owner is working on. @param {Data} data @param {Act} act @param {string} workflowId */
function needTech(data, act, workflowId) {
  const wf = needOpen(data, act, workflowId);
  if (wf.type !== 'newTechData') throw new PivotError('workflow.type', 'That is not New Tech Data.');
  return wf;
}

/** A step record, new or changed. @param {Data} data @param {Act} act @param {string} workflowId @param {string} hazardId @param {string} check @param {Record<string, any>} fields */
function stepRec(data, act, workflowId, hazardId, check, fields) {
  const id = ids.workflowStep(workflowId, hazardId, check);
  const existing = get(data, 'workflowStep', id);
  return existing && existing.status === 'live'
    ? changed(existing, act, fields)
    : created(act, id, { workflowId, hazardId, check, checked: false, note: '', ...fields });
}

/** A workflow's opening record. @param {Act} act @param {string} id @param {string} type @param {string | null} platformId @param {string | null} at */
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
 * @param {Data} data @param {Act} act @param {{ id?: string, type: string, platformId?: string, referenceId?: string }} args
 */
export function startWorkflow(data, act, { id = newId(), type, platformId, referenceId }) {
  if (type === 'newTechData') {
    const r = need(data, 'reference', /** @type {string} */ (referenceId));
    if (r.status !== 'live') throw new PivotError('reference.retired', `${r.title} is retired.`);
    if (r.archived) throw new PivotError('reference.archived', `${r.title} is archived.`);
    if (openTechData(data, r.id)) throw new PivotError('techData.open', `${r.title} is being worked through already.`);
    return commit(data, act, 'Start workflow', [{ kind: 'workflow', rec: { ...opening(act, id, type, null, '@scope'), referenceId: r.id, linked: null } }]);
  }
  if (type === 'referenceUpdate') {
    const r = need(data, 'reference', /** @type {string} */ (referenceId));
    if (r.status !== 'live') throw new PivotError('reference.retired', `${r.title} is retired.`);
    if (r.archived) throw new PivotError('reference.archived', `${r.title} is archived.`);
    if (openReferenceUpdate(data, r.id)) throw new PivotError('update.open', `${r.title} is being updated already.`);
    const rec = { ...opening(act, id, type, /** @type {any} */ (null), null), referenceId: r.id, revision: '', file: null, url: null, path: null };
    return commit(data, act, 'Start workflow', [{ kind: 'workflow', rec }]);
  }
  if (type === 'transferOwner') {
    const p = need(data, 'platform', platformId);
    if (p.status !== 'live') throw new PivotError('platform.retired', `${p.name} is retired.`);
    if (onboardingOf(data, platformId)) throw new PivotError('transfer.onboarding', `Finish onboarding ${p.name} first.`);
    if (openTransfer(data, platformId)) throw new PivotError('transfer.open', `${p.name} is being transferred already.`);
    const rec = { ...opening(act, id, type, platformId, null), toOwnerId: null, fromOwnerId: null, reviewed: null };
    return commit(data, act, 'Start workflow', [{ kind: 'workflow', rec }]);
  }
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

/**
 * New Tech Data on a new reference: the reference and the workflow made together, the reference
 * made through the workflow.
 * @param {Data} data @param {Act} act
 * @param {{ id?: string, referenceId?: string, title: string, docNumber?: string, revision?: string, url?: string, path?: string }} args
 */
export function startTechData(data, act, { id = newId(), referenceId = newId(), title, docNumber, revision, url, path }) {
  const withRef = createReference(data, act, { id: referenceId, title, docNumber, revision, url, path });
  return commit(data, { ...act, workflowId: id }, 'Start new tech data', [
    { kind: 'reference', rec: withRef.records.reference[referenceId] },
    { kind: 'workflow', rec: { ...opening(act, id, 'newTechData', null, '@scope'), referenceId, linked: null } },
  ]);
}

/**
 * Tick or untick a platform, or a hazard on a ticked platform, as something the data affects.
 * Unticked, its answers are kept for if it is ticked again.
 * @param {Data} data @param {Act} act @param {{ workflowId: string, platformId: string, hazardId?: string, checked: boolean | string }} args
 */
export function setTechScope(data, act, { workflowId, platformId, hazardId, checked }) {
  const wf = needTech(data, act, workflowId);
  const on = checked === true || checked === 'true';
  const p = need(data, 'platform', platformId);
  let key = `p:${p.id}`;
  if (hazardId) {
    if (on && !stepOf(data, wf.id, key, 'scope')?.checked) throw new PivotError('techData.scope', `Tick ${p.name} first.`);
    if (on && get(data, 'hazardPlatform', ids.hazardPlatform(hazardId, p.id))?.status !== 'live') throw new PivotError('workflow.hazard', 'That hazard is not on this platform.');
    key = pairKey(p.id, hazardId);
  } else if (on) {
    if (p.status !== 'live') throw new PivotError('platform.retired', `${p.name} is retired.`);
    if (onboardingOf(data, p.id)) throw new PivotError('techData.onboarding', `${p.name} is still being onboarded.`);
  }
  return commit(data, act, 'Scope new tech data', [{ kind: 'workflowStep', rec: stepRec(data, act, wf.id, key, 'scope', { checked: on }) }]);
}

/**
 * A hazard the data brings to a ticked platform: an existing one linked to it, or a new one made
 * from a title, and scoped, all in one change. One the workflow linked or made is marked added.
 * @param {Data} data @param {Act} act @param {{ workflowId: string, platformId: string, hazardId?: string, title?: string }} args
 */
export function addTechHazard(data, act, { workflowId, platformId, hazardId, title }) {
  const wf = needTech(data, act, workflowId);
  const p = need(data, 'platform', platformId);
  if (!stepOf(data, wf.id, `p:${p.id}`, 'scope')?.checked) throw new PivotError('techData.scope', `Tick ${p.name} first.`);
  const hid = hazardId || newId();
  let d = hazardId ? data : createHazard(data, act, { id: hid, title: /** @type {string} */ (title) });
  const linkId = ids.hazardPlatform(hid, p.id);
  const already = get(d, 'hazardPlatform', linkId)?.status === 'live';
  d = linkHazard(d, act, { hazardId: hid, platformId: p.id });
  /** @type {{ kind: string, rec: Rec }[]} */
  const recs = [];
  if (!hazardId) recs.push({ kind: 'hazard', rec: d.records.hazard[hid] });
  if (!already) recs.push({ kind: 'hazardPlatform', rec: d.records.hazardPlatform[linkId] });
  recs.push({ kind: 'workflowStep', rec: stepRec(data, act, wf.id, pairKey(p.id, hid), 'scope', { checked: true, ...(already ? {} : { added: true }) }) });
  return commit(data, act, hazardId ? 'Link hazard to platform' : 'Create hazard on platform', recs);
}

/** Where the owner is in it, kept for resuming: a hazard, or null for the summary. @param {Data} data @param {Act} act @param {{ workflowId: string, hazardId: string | null }} args */
export function setWorkflowPosition(data, act, { workflowId, hazardId }) {
  const wf = needOpen(data, act, workflowId);
  const to = !hazardId ? null
    : wf.type === 'platformOnboarding' && ONBOARDING_POSITIONS.includes(hazardId) ? hazardId
    : wf.type === 'newTechData' ? needPosition(data, wf, hazardId)
    : needHazard(data, wf, hazardId);
  return commit(data, act, 'Move in workflow', [{ kind: 'workflow', rec: changed(wf, act, { at: { hazardId: to } }) }]);
}

/**
 * Tick or untick one check, or change its note or (New Tech Data) its answer; any may be left
 * out. A tick may arrive as the text a checkbox sends; a blank answer clears it.
 * @param {Data} data @param {Act} act
 * @param {{ workflowId: string, hazardId: string, check: string, checked?: boolean | string, note?: string, answer?: string }} args
 */
export function setStep(data, act, { workflowId, hazardId, check, checked, note, answer }) {
  const wf = needOpen(data, act, workflowId);
  if (wf.type === 'transferOwner') {
    if (hazardId !== '-' || !TRANSFER_GROUPS.some(([k]) => `group:${k}` === check)) throw new PivotError('workflow.check', 'That is not one of this transfer’s groups.');
  } else if (wf.type === 'referenceUpdate') {
    if (check !== 'item' || !referenceItems(data, wf.referenceId).some((i) => i.key === hazardId)) throw new PivotError('workflow.check', 'That is not one of the items this reference informs.');
  } else if (wf.type === 'newTechData') {
    if (!TECH_CARDS.includes(check) || !techPairs(data, wf).some((x) => x.key === hazardId)) throw new PivotError('workflow.check', 'That is not in this workflow’s scope.');
  } else {
    const allowed = wf.type === 'platformOnboarding' ? NONE_CHECKS : CHECKS;
    if (!allowed.includes(check)) throw new PivotError('workflow.check', 'That is not one of this workflow’s checks.');
    needHazard(data, wf, hazardId);
  }
  if (answer !== undefined && answer !== '' && answer !== 'changed' && answer !== 'none') throw new PivotError('workflow.answer', 'An answer is Changed or No change.');
  const fields = {
    ...(checked === undefined ? {} : { checked: checked === true || checked === 'true' }),
    ...(note === undefined ? {} : { note: String(note).trim() }),
    ...(answer === undefined ? {} : { answer: answer || null }),
  };
  return commit(data, act, 'Check workflow step', [{ kind: 'workflowStep', rec: stepRec(data, act, workflowId, hazardId, check, fields) }]);
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

/** Who a transfer hands the platform to: anyone but its owner now. @param {Data} data @param {Act} act @param {{ workflowId: string, toOwnerId: string }} args */
export function setTransferRecipient(data, act, { workflowId, toOwnerId }) {
  const wf = needOpen(data, act, workflowId);
  if (wf.type !== 'transferOwner') throw new PivotError('workflow.type', 'That is not a transfer.');
  const p = need(data, 'platform', wf.platformId);
  const to = String(toOwnerId ?? '').trim() || null;
  if (to === p.ownerId) throw new PivotError('transfer.same', `${p.name} is theirs already.`);
  return commit(data, act, 'Choose new owner', [{ kind: 'workflow', rec: changed(wf, act, { toOwnerId: to }) }]);
}

/** The recipient has looked over what they took on. @param {Data} data @param {Act} act @param {{ workflowId: string }} args */
export function markTransferReviewed(data, act, { workflowId }) {
  const wf = need(data, 'workflow', workflowId);
  if (wf.type !== 'transferOwner' || wf.state !== 'completed') throw new PivotError('transfer.not-done', 'Only a completed transfer can be marked reviewed.');
  if (wf.toOwnerId !== act.by) throw new PivotError('transfer.recipient', 'Only the new owner can mark the transfer reviewed.');
  if (wf.reviewed) return data;
  return commit(data, act, 'Review transfer', [{ kind: 'workflow', rec: changed(wf, act, { reviewed: { by: act.by, at: act.at } }) }]);
}

/**
 * What a reference update will give the reference: its revision, and a new file, link or path. Left
 * out, a field keeps its draft value; given blank, a link or path is not to change.
 * @param {Data} data @param {Act} act
 * @param {{ workflowId: string, revision?: string, url?: string, path?: string, file?: any }} args
 */
export function setReferenceDraft(data, act, { workflowId, revision, url, path, file }) {
  const wf = needOpen(data, act, workflowId);
  if (wf.type !== 'referenceUpdate') throw new PivotError('workflow.type', 'That is not a reference update.');
  /** @type {Record<string, any>} */
  const fields = {};
  if (revision !== undefined) fields.revision = String(revision ?? '').trim();
  if (url !== undefined) fields.url = String(url ?? '').trim() || null;
  if (path !== undefined) fields.path = String(path ?? '').trim() || null;
  if (file !== undefined) {
    if (file && !file.stored) throw new PivotError('reference.file', 'Choose a file to store.');
    fields.file = file || null;
  }
  return commit(data, act, 'Draft reference update', [{ kind: 'workflow', rec: changed(wf, act, fields) }]);
}

/** What an open workflow covers as it ends, kept with it so its record does not change as the platforms do. @param {Data} data @param {Rec} wf */
const covered = (data, wf) => (wf.type === 'newTechData' ? techPairs(data, wf).map((x) => x.key) : workflowHazards(data, wf).map((x) => x.hazard.id));

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
  if (wf.type === 'newTechData') {
    const r = need(data, 'reference', wf.referenceId);
    const { done, total } = workflowProgress(data, wf);
    const left = total - done;
    if (left) throw new PivotError('workflow.unmet', `${left} thing${left === 1 ? ' is' : 's are'} still needed.`);
    const links = techLinks(data, wf);
    const recs = links.map((t) => {
      const lid = ids.referenceLink(r.id, t.targetKind, t.targetId);
      const was = get(data, 'referenceLink', lid);
      return { kind: 'referenceLink', rec: was ? changed(was, act, { status: 'live' }) : created(act, lid, { referenceId: r.id, targetKind: t.targetKind, targetId: t.targetId }) };
    });
    return commit(data, act, 'Work through new tech data', [
      ...recs,
      { kind: 'workflow', rec: changed(wf, act, { state: 'completed', endedBy: act.by, endedAt: act.at, covered: covered(data, wf), linked: links }) },
    ]);
  }
  if (wf.type === 'transferOwner') {
    const p = need(data, 'platform', wf.platformId);
    const today = aestDate(act.at);
    const groups = transferGroups(data, p.id, today, wf.id).filter((g) => g.items.length);
    const left = groups.filter((g) => !stepOf(data, wf.id, '-', `group:${g.key}`)?.checked).length + Number(!wf.toOwnerId);
    if (left) throw new PivotError('workflow.unmet', `${left} thing${left === 1 ? ' is' : 's are'} still needed.`);
    const from = p.ownerId;
    const handed = live(data, 'workflow').filter((w) => w.platformId === p.id && w.state === 'open' && w.id !== wf.id && w.ownerId === from)
      .map((w) => ({ kind: 'workflow', rec: changed(w, act, { ownerId: wf.toOwnerId }) }));
    return commit(data, act, 'Transfer platform owner', [
      { kind: 'platform', rec: changed(p, act, { ownerId: wf.toOwnerId }) },
      ...handed,
      { kind: 'workflow', rec: changed(wf, act, { state: 'completed', endedBy: act.by, endedAt: act.at, fromOwnerId: from }) },
    ]);
  }
  if (wf.type === 'referenceUpdate') {
    const r = need(data, 'reference', wf.referenceId);
    const unmet = [];
    if (!wf.revision) unmet.push('a new revision');
    else if (wf.revision === String(r.revision ?? '').trim()) unmet.push('a revision different from the current one');
    if (!wf.file && !wf.url && !wf.path) unmet.push('a new file, link or path');
    const items = referenceItems(data, r.id);
    const left = items.filter((i) => !stepOf(data, wf.id, i.key, 'item')?.checked).length;
    if (left) unmet.push(`${left} item${left === 1 ? '' : 's'} to check`);
    if (unmet.length) throw new PivotError('workflow.unmet', `Still needed: ${unmet.join(', ')}.`);
    /** @type {Record<string, any>} */
    const fields = { revision: wf.revision };
    if (wf.file) { fields.file = wf.file; fields.pastFiles = r.file ? [r.file, ...(r.pastFiles ?? [])] : (r.pastFiles ?? []); }
    if (wf.url) fields.url = wf.url;
    if (wf.path) fields.path = wf.path;
    return commit(data, act, `Update reference to rev ${wf.revision}`, [
      { kind: 'reference', rec: changed(r, act, fields) },
      { kind: 'workflow', rec: changed(wf, act, { state: 'completed', endedBy: act.by, endedAt: act.at, before: String(r.revision ?? ''), covered: items.map((i) => i.key), coveredLabels: items.map((i) => i.label) }) },
    ]);
  }
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
