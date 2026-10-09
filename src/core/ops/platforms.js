import { PivotError } from '../errors.js';
import { newId, ids, hazardLabel } from '../ids.js';
import { get, live, created, changed, need, needText } from '../data.js';
import { commit } from '../apply.js';
import { openReview, onboardingOf } from '../queries.js';
import { cancelRecs } from './workflows.js';
import { linksTo } from './references.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */

/** @param {Data} data @param {Act} act @param {{ id?: string, name: string, ownerId: string }} args */
export function createPlatform(data, act, { id = newId(), name, ownerId }) {
  const rec = created(act, id, { number: null, name: needText(name, 'A platform name'), ownerId: needText(ownerId, 'A platform owner'), reviewRule: null, reviewStart: null });
  return commit(data, act, 'Create platform', [{ kind: 'platform', rec }]);
}

/** The records that cancel a platform's open workflows: its review and its onboarding. @param {Data} data @param {Act} act @param {string} platformId */
function openWorkflowsCancelled(data, act, platformId) {
  return [openReview(data, platformId), onboardingOf(data, platformId)].filter((w) => w && w.state === 'open').flatMap((w) => cancelRecs(data, act, /** @type {any} */ (w)));
}

/** @param {Data} data @param {Act} act @param {{ id: string, name?: string, description?: string }} args */
export function updatePlatform(data, act, { id, name, description }) {
  const p = need(data, 'platform', id);
  /** @type {Record<string, string>} */
  const fields = {};
  if (name !== undefined) fields.name = needText(name, 'A platform name');
  if (description !== undefined) fields.description = String(description ?? '').trim();
  return commit(data, act, name !== undefined && description === undefined ? 'Rename platform' : 'Edit platform', [{ kind: 'platform', rec: changed(p, act, fields) }]);
}

/**
 * A platform's picture, shown on its page and its card on Home: the file stored in the folder, or
 * none (null or nothing given takes it away).
 * @param {Data} data @param {Act} act
 * @param {{ id: string, image?: { stored: string, name: string, type: string, addedBy: string, addedAt: string } | null | '' }} args
 */
export function setPlatformImage(data, act, { id, image }) {
  const p = need(data, 'platform', id);
  const next = image && typeof image === 'object' && typeof image.stored === 'string' && image.stored ? image : null;
  if (!next && !p.image) return data;
  const action = !next ? 'Remove platform image' : p.image ? 'Change platform image' : 'Add platform image';
  return commit(data, act, action, [{ kind: 'platform', rec: changed(p, act, { image: next }) }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string, ownerId: string }} args */
export function setOwner(data, act, { id, ownerId }) {
  const p = need(data, 'platform', id);
  return commit(data, act, 'Change platform owner', [{ kind: 'platform', rec: changed(p, act, { ownerId: needText(ownerId, 'A platform owner') }) }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string }} args */
export function retirePlatform(data, act, { id }) {
  const p = need(data, 'platform', id);
  if (p.status === 'retired') return data;
  return commit(data, act, 'Retire platform', [{ kind: 'platform', rec: changed(p, act, { status: 'retired' }) }, ...openWorkflowsCancelled(data, act, id)]);
}

/** @param {Data} data @param {Act} act @param {{ id: string }} args */
export function deletePlatform(data, act, { id }) {
  const p = need(data, 'platform', id);
  const on = live(data, 'hazardPlatform').filter((l) => l.platformId === id);
  if (on.length) {
    throw new PivotError('platform.has-hazards', `${p.name} still has ${on.length === 1 ? 'a hazard' : `${on.length} hazards`} on it. Unlink them first.`, { hazardIds: on.map((l) => l.hazardId) });
  }
  const reports = ['safetyReport', 'implementer', 'platformGroupLink'].flatMap((kind) => live(data, kind).filter((r) => r.platformId === id).map((r) => ({ kind, rec: changed(r, act, { status: 'deleted' }) })));
  return commit(data, act, 'Delete platform', [{ kind: 'platform', rec: changed(p, act, { status: 'deleted' }) }, ...reports, ...openWorkflowsCancelled(data, act, id), ...linksTo(data, act, [{ kind: 'platform', id }])]);
}

/** @param {Data} data @param {Act} act @param {{ hazardId: string, platformId: string }} args */
export function linkHazard(data, act, { hazardId, platformId }) {
  const h = need(data, 'hazard', hazardId);
  if (h.status !== 'live') throw new PivotError('hazard.retired', `${hazardLabel(h)} is retired, so it cannot be linked to a platform.`);
  const p = need(data, 'platform', platformId);
  if (p.status !== 'live') throw new PivotError('platform.retired', `${p.name} is retired, so no hazard can be linked to it.`);
  const id = ids.hazardPlatform(hazardId, platformId);
  const existing = get(data, 'hazardPlatform', id);
  if (existing && existing.status === 'live') return data;
  const rec = existing
    ? changed(existing, act, { status: 'live', reportId: null })
    : created(act, id, { hazardId, platformId, reportId: null });
  return commit(data, act, 'Link hazard to platform', [{ kind: 'hazardPlatform', rec }]);
}

/**
 * Also deletes the hazard's rulings, risk assessments, SFARP and existing controls on that platform, so relinking starts every
 * control at awaiting.
 * @param {Data} data @param {Act} act @param {{ hazardId: string, platformId: string }} args
 */
export function unlinkHazard(data, act, { hazardId, platformId }) {
  const l = need(data, 'hazardPlatform', ids.hazardPlatform(hazardId, platformId));
  const recs = unlinkRecs(data, act, l);
  // What goes with it there (its own causal factors, failure modes…) takes its reference links too.
  const parts = recs.filter((r) => ['causalFactor', 'failureMode', 'systemElement', 'affectedGroup'].includes(r.kind)).map((r) => ({ kind: r.kind, id: r.rec.id }));
  return commit(data, act, 'Unlink hazard from platform', [...recs, ...linksTo(data, act, parts)]);
}

/**
 * What taking a hazard off a platform deletes: the link, and its control statuses, risk
 * assessments, SFARP and existing controls there (safety reports stay; they record events).
 * @param {Data} data @param {Act} act @param {any} link a live hazardPlatform link
 */
export function unlinkRecs(data, act, link) {
  const { hazardId, platformId } = link;
  const recs = [{ kind: 'hazardPlatform', rec: changed(link, act, { status: 'deleted' }) }];
  // Causal factors for this platform alone go with it; those for every platform stay.
  for (const kind of ['ruling', 'implementationStatus', 'controlOn', 'assessment', 'sfarp', 'rating', 'causalFactor', 'failureMode', 'systemElement', 'affectedGroup']) {
    for (const r of live(data, kind)) {
      if (r.hazardId === hazardId && r.platformId === platformId) recs.push({ kind, rec: changed(r, act, { status: 'deleted' }) });
    }
  }
  return recs;
}

/** @param {Data} data @param {Act} act @param {{ hazardId: string, platformId: string, reportId: string | null }} args */
export function setReportId(data, act, { hazardId, platformId, reportId }) {
  const l = need(data, 'hazardPlatform', ids.hazardPlatform(hazardId, platformId));
  const v = String(reportId ?? '').trim();
  return commit(data, act, 'Set report ID', [{ kind: 'hazardPlatform', rec: changed(l, act, { reportId: v === '' ? null : v }) }]);
}
