import { PivotError } from '../errors.js';
import { newId, ids, hazardLabel } from '../ids.js';
import { get, live, created, changed, need, needText } from '../data.js';
import { commit } from '../apply.js';
import { openReview } from '../queries.js';
import { abandonRecs } from './reviews.js';
import { linksTo } from './references.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */

/** @param {Data} data @param {Act} act @param {{ id?: string, name: string, ownerId: string }} args */
export function createPlatform(data, act, { id = newId(), name, ownerId }) {
  const rec = created(act, id, { number: null, name: needText(name, 'A platform name'), ownerId: needText(ownerId, 'A platform owner'), reviewMonths: null, reviewDue: null });
  return commit(data, act, 'Create platform', [{ kind: 'platform', rec }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string, name: string }} args */
export function updatePlatform(data, act, { id, name }) {
  const p = need(data, 'platform', id);
  return commit(data, act, 'Rename platform', [{ kind: 'platform', rec: changed(p, act, { name: needText(name, 'A platform name') }) }]);
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
  const open = openReview(data, id);
  return commit(data, act, 'Retire platform', [{ kind: 'platform', rec: changed(p, act, { status: 'retired' }) }, ...(open ? abandonRecs(data, act, open) : [])]);
}

/** @param {Data} data @param {Act} act @param {{ id: string }} args */
export function deletePlatform(data, act, { id }) {
  const p = need(data, 'platform', id);
  const on = live(data, 'hazardPlatform').filter((l) => l.platformId === id);
  if (on.length) {
    throw new PivotError('platform.has-hazards', `${p.name} still has ${on.length === 1 ? 'a hazard' : `${on.length} hazards`} on it. Unlink them first.`, { hazardIds: on.map((l) => l.hazardId) });
  }
  const open = openReview(data, id);
  const reports = live(data, 'safetyReport').filter((r) => r.platformId === id).map((r) => ({ kind: 'safetyReport', rec: changed(r, act, { status: 'deleted' }) }));
  return commit(data, act, 'Delete platform', [{ kind: 'platform', rec: changed(p, act, { status: 'deleted' }) }, ...reports, ...(open ? abandonRecs(data, act, open) : []), ...linksTo(data, act, [{ kind: 'platform', id }])]);
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
  const recs = [{ kind: 'hazardPlatform', rec: changed(l, act, { status: 'deleted' }) }];
  for (const r of live(data, 'ruling')) {
    if (r.hazardId === hazardId && r.platformId === platformId) recs.push({ kind: 'ruling', rec: changed(r, act, { status: 'deleted' }) });
  }
  for (const kind of ['assessment', 'sfarp', 'rating', 'existingControl']) {
    for (const r of live(data, kind)) {
      if (r.hazardId === hazardId && r.platformId === platformId) recs.push({ kind, rec: changed(r, act, { status: 'deleted' }) });
    }
  }
  return commit(data, act, 'Unlink hazard from platform', recs);
}

/** @param {Data} data @param {Act} act @param {{ hazardId: string, platformId: string, reportId: string | null }} args */
export function setReportId(data, act, { hazardId, platformId, reportId }) {
  const l = need(data, 'hazardPlatform', ids.hazardPlatform(hazardId, platformId));
  const v = String(reportId ?? '').trim();
  return commit(data, act, 'Set report ID', [{ kind: 'hazardPlatform', rec: changed(l, act, { reportId: v === '' ? null : v }) }]);
}
