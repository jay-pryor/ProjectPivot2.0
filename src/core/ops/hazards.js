import { PivotError } from '../errors.js';
import { newId, hazardLabel } from '../ids.js';
import { get, put, all, live, created, changed, need, needText, NUMBERED, inGroup } from '../data.js';
import { commit } from '../apply.js';
import { linksTo } from './references.js';
import { platformsOfHazard } from '../queries.js';
import { ids } from '../ids.js';
import { unlinkRecs } from './platforms.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */

/** @param {Data} data @param {Act} act @param {{ id?: string, title: string, description?: string }} args */
export function createHazard(data, act, { id = newId(), title, description = '' }) {
  const rec = created(act, id, { number: null, title: needText(title, 'A hazard title'), description: String(description ?? '').trim() });
  return commit(data, act, 'Create hazard', [{ kind: 'hazard', rec }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string, title?: string, description?: string }} args */
export function updateHazard(data, act, { id, title, description }) {
  const h = need(data, 'hazard', id);
  /** @type {Record<string, string>} */
  const fields = {};
  if (title !== undefined) fields.title = needText(title, 'A hazard title');
  if (description !== undefined) fields.description = String(description).trim();
  return commit(data, act, 'Edit hazard', [{ kind: 'hazard', rec: changed(h, act, fields) }]);
}

/** @param {Data} data @param {import('../data.js').Rec} hazard @param {string} verb @param {boolean} [liveOnly] only live platforms stand in the way */
function refuseOnPlatforms(data, hazard, verb, liveOnly = false) {
  const on = platformsOfHazard(data, hazard.id).filter((p) => !liveOnly || get(data, 'platform', p)?.status === 'live');
  if (on.length === 0) return;
  const names = on.map((p) => get(data, 'platform', p)?.name ?? p).join(', ');
  throw new PivotError(
    'hazard.on-platforms',
    liveOnly
      ? `${hazardLabel(hazard)} is still on ${names}. Unlink it from ${on.length === 1 ? 'that platform or retire it' : 'those platforms or retire them'} before you ${verb} it.`
      : `${hazardLabel(hazard)} is still on ${names}. Unlink it from ${on.length === 1 ? 'that platform' : 'those platforms'} before you ${verb} it.`,
    { platformIds: on },
  );
}

/** @param {Data} data @param {Act} act @param {{ id: string }} args */
export function retireHazard(data, act, { id }) {
  const h = need(data, 'hazard', id);
  if (h.status === 'retired') return data;
  refuseOnPlatforms(data, h, 'retire');
  return commit(data, act, 'Retire hazard', [{ kind: 'hazard', rec: changed(h, act, { status: 'retired' }) }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string }} args */
export function deleteHazard(data, act, { id }) {
  const h = need(data, 'hazard', id);
  // A hazard left only on retired platforms can go: it leaves them as unlinking would.
  refuseOnPlatforms(data, h, 'delete', true);
  const recs = [{ kind: 'hazard', rec: changed(h, act, { status: 'deleted' }) }];
  for (const l of live(data, 'hazardPlatform')) if (l.hazardId === id) recs.push(...unlinkRecs(data, act, l));
  for (const kind of ['causalFactor', 'consequence']) {
    for (const r of live(data, kind)) if (r.hazardId === id) recs.push({ kind, rec: changed(r, act, { status: 'deleted' }) });
  }
  for (const l of live(data, 'hazardControl')) if (l.hazardId === id) recs.push({ kind: 'hazardControl', rec: changed(l, act, { status: 'deleted' }) });
  for (const l of live(data, 'hazardPhase')) if (l.hazardId === id) recs.push({ kind: 'hazardPhase', rec: changed(l, act, { status: 'deleted' }) });
  for (const r of live(data, 'safetyReport')) if (r.hazardId === id) recs.push({ kind: 'safetyReport', rec: changed(r, act, { status: 'deleted' }) });
  const gone = [{ kind: 'hazard', id }, ...recs.filter((r) => r.kind === 'causalFactor' || r.kind === 'consequence').map((r) => ({ kind: r.kind, id: r.rec.id }))];
  recs.push(...linksTo(data, act, gone));
  return commit(data, act, 'Delete hazard', recs);
}

const RESTORABLE = { hazard: 'hazard', control: 'control', platform: 'platform', reference: 'reference', phase: 'phase' };

/** @param {Data} data @param {Act} act @param {{ kind: string, id: string }} args */
export function restoreRecord(data, act, { kind, id }) {
  if (!(kind in RESTORABLE)) throw new PivotError('not-retired', `A ${kind} cannot be restored.`);
  const r = need(data, kind, id);
  if (r.status !== 'retired') throw new PivotError('not-retired', `That ${kind} is not retired.`);
  return commit(data, act, `Restore ${kind}`, [{ kind, rec: changed(r, act, { status: 'live' }) }]);
}

/**
 * @param {'causalFactor' | 'consequence'} kind
 * @param {string} label e.g. "Causal factor"
 */
function childOps(kind, label) {
  const lower = label.toLowerCase();
  return {
    /** @param {Data} data @param {Act} act @param {{ id?: string, hazardId: string, text: string, platformId?: string | null }} args */
    add(data, act, { id = newId(), hazardId, text, platformId }) {
      need(data, 'hazard', hazardId);
      const own = kind === 'causalFactor' ? { platformId: onePlatform(data, hazardId, platformId) } : {};
      // Numbered in the order they are added (CF1, CF2…), which neither the time to the second nor the ids keep.
      const seq = Math.max(0, ...all(data, kind).filter((r) => r.hazardId === hazardId).map((r) => r.seq ?? 0)) + 1;
      const rec = created(act, id, { hazardId, text: needText(text, `${label} text`), seq, ...own });
      return commit(data, act, `Add ${lower}`, [{ kind, rec }]);
    },
    /** @param {Data} data @param {Act} act @param {{ id: string, text: string }} args */
    update(data, act, { id, text }) {
      const r = need(data, kind, id);
      return commit(data, act, `Edit ${lower}`, [{ kind, rec: changed(r, act, { text: needText(text, `${label} text`) }) }]);
    },
    /** @param {Data} data @param {Act} act @param {{ id: string }} args */
    remove(data, act, { id }) {
      const r = need(data, kind, id);
      return commit(data, act, `Delete ${lower}`, [{ kind, rec: changed(r, act, { status: 'deleted' }) }, ...linksTo(data, act, [{ kind, id }])]);
    },
  };
}

/**
 * A causal factor's platform: none (every platform of the hazard), or one the hazard is on.
 * @param {Data} data @param {string} hazardId @param {string | null | undefined} platformId
 */
function onePlatform(data, hazardId, platformId) {
  if (!platformId) return null;
  if (get(data, 'hazardPlatform', ids.hazardPlatform(hazardId, platformId))?.status !== 'live') {
    throw new PivotError('not-found', 'That hazard is not on that platform.');
  }
  return platformId;
}

const causal = childOps('causalFactor', 'Causal factor');
export const addCausalFactor = causal.add;
export const updateCausalFactor = causal.update;
export const deleteCausalFactor = causal.remove;

const conseq = childOps('consequence', 'Consequence');
export const addConsequence = conseq.add;
export const updateConsequence = conseq.update;
export const deleteConsequence = conseq.remove;

/**
 * A hazard's entries on one platform, typed freely, kept in the order they were added: its
 * systems or elements, and the groups it affects. The same entry twice on one platform (in any
 * case) is refused.
 * @param {'systemElement' | 'affectedGroup'} kind
 * @param {string} label e.g. "System or element"
 */
function platformListOps(kind, label) {
  const lower = label.toLowerCase();
  /** @param {Data} data @param {Record<string, any>} except @param {string} text */
  const refuseTwice = (data, except, text) => {
    const same = live(data, kind).find((r) => r.id !== except.id && r.hazardId === except.hazardId && r.platformId === except.platformId
      && String(r.text).trim().toLowerCase() === text.toLowerCase());
    if (same) throw new PivotError('duplicate', `“${same.text}” is already here.`);
  };
  return {
    /** @param {Data} data @param {Act} act @param {{ id?: string, hazardId: string, platformId: string, text: string }} args */
    add(data, act, { id = newId(), hazardId, platformId, text }) {
      need(data, 'hazard', hazardId);
      const on = onePlatform(data, hazardId, platformId);
      if (!on) throw new PivotError('not-found', 'Choose the platform it is for.');
      const t = needText(text, `${label} text`);
      refuseTwice(data, { id, hazardId, platformId: on }, t);
      const seq = Math.max(0, ...all(data, kind).filter((r) => r.hazardId === hazardId && r.platformId === on).map((r) => r.seq ?? 0)) + 1;
      return commit(data, act, `Add ${lower}`, [{ kind, rec: created(act, id, { hazardId, platformId: on, text: t, seq }) }]);
    },
    /** @param {Data} data @param {Act} act @param {{ id: string, text: string }} args */
    update(data, act, { id, text }) {
      const r = need(data, kind, id);
      const t = needText(text, `${label} text`);
      refuseTwice(data, r, t);
      return commit(data, act, `Edit ${lower}`, [{ kind, rec: changed(r, act, { text: t }) }]);
    },
    /** @param {Data} data @param {Act} act @param {{ id: string }} args */
    remove(data, act, { id }) {
      const r = need(data, kind, id);
      return commit(data, act, `Delete ${lower}`, [{ kind, rec: changed(r, act, { status: 'deleted' }) }]);
    },
  };
}

const systems = platformListOps('systemElement', 'System or element');
export const addSystemElement = systems.add;
export const updateSystemElement = systems.update;
export const deleteSystemElement = systems.remove;

const groups = platformListOps('affectedGroup', 'Affected group');
export const addAffectedGroup = groups.add;
export const updateAffectedGroup = groups.update;
export const deleteAffectedGroup = groups.remove;

/**
 * Give each hazard, control and platform that has no number the next one of its kind, oldest
 * first. Run at save time, after the merge, so two users creating records at once never take the
 * same number; each kind's counter only counts up, so a number is never reused.
 * @param {Data} data
 * @returns {Data}
 */
export function assignNumbers(data) {
  let d = data;
  for (const group of NUMBERED) {
    const { kind, counter } = group;
    const fresh = all(d, kind).filter((r) => inGroup(group, r) && r.number == null && r.status !== 'deleted');
    if (fresh.length === 0) continue;
    let n = /** @type {number} */ (/** @type {any} */ (d)[counter]);
    for (const r of fresh) d = put(d, kind, { ...r, number: n++ });
    d = { ...d, [counter]: n };
  }
  return d;
}

export const assignHazardNumbers = assignNumbers;
