import { PivotError } from '../errors.js';
import { newId, ids } from '../ids.js';
import { get, live, created, changed, need, needText } from '../data.js';
import { commit } from '../apply.js';
import { linksTo } from './references.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */

export const CONTROL_KINDS = Object.freeze(['preventative', 'mitigating']);

/** The hierarchy of controls, most effective first. */
export const CONTROL_TIERS = Object.freeze(['Elimination', 'Substitution', 'Engineering', 'Administrative', 'PPE']);

/** A tier's place in the hierarchy, for sorting; a control with none sorts last. @param {string | null | undefined} tier */
export function tierRank(tier) {
  const i = CONTROL_TIERS.indexOf(/** @type {string} */ (tier));
  return i < 0 ? CONTROL_TIERS.length : i;
}

/** @param {unknown} tier @returns {string | null} */
function needTier(tier) {
  if (tier === null || tier === undefined || tier === '') return null;
  if (typeof tier !== 'string' || !CONTROL_TIERS.includes(tier)) {
    throw new PivotError('control.tier', `A control's tier is one of ${CONTROL_TIERS.join(', ')}, or not set.`);
  }
  return tier;
}

/** @param {unknown} kind @returns {string} */
function needKind(kind) {
  if (typeof kind !== 'string' || !CONTROL_KINDS.includes(kind)) {
    throw new PivotError('control.kind', 'A control is linked to a hazard as either preventative or mitigating.');
  }
  return kind;
}

/** @param {Data} data @param {Act} act @param {{ id?: string, title: string, description?: string, tier?: string | null }} args */
export function createControl(data, act, { id = newId(), title, description = '', tier = null }) {
  const rec = created(act, id, { number: null, title: needText(title, 'A control title'), description: String(description ?? '').trim(), tier: needTier(tier) });
  return commit(data, act, 'Create control', [{ kind: 'control', rec }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string, title?: string, description?: string, tier?: string | null }} args */
export function updateControl(data, act, { id, title, description, tier }) {
  const c = need(data, 'control', id);
  /** @type {Record<string, string | null>} */
  const fields = {};
  if (title !== undefined) fields.title = needText(title, 'A control title');
  if (description !== undefined) fields.description = String(description).trim();
  if (tier !== undefined) fields.tier = needTier(tier);
  return commit(data, act, 'Edit control', [{ kind: 'control', rec: changed(c, act, fields) }]);
}

/** Takes the control out of the library and off nothing. @param {Data} data @param {Act} act @param {{ id: string }} args */
export function retireControl(data, act, { id }) {
  const c = need(data, 'control', id);
  if (c.status === 'retired') return data;
  return commit(data, act, 'Retire control', [{ kind: 'control', rec: changed(c, act, { status: 'retired' }) }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string }} args */
export function deleteControl(data, act, { id }) {
  const c = need(data, 'control', id);
  const uses = live(data, 'hazardControl').filter((l) => l.controlId === id);
  if (uses.length) {
    throw new PivotError('control.in-use', `${c.title} is still linked to ${uses.length === 1 ? 'a hazard' : `${uses.length} hazards`}. Unlink it first.`, { hazardIds: uses.map((u) => u.hazardId) });
  }
  const existingUses = live(data, 'existingControl').filter((l) => l.controlId === id);
  if (existingUses.length) {
    throw new PivotError('control.in-use', `${c.title} is an existing control on ${existingUses.length === 1 ? 'a hazard' : `${existingUses.length} hazards`}. Remove it there first.`, { hazardIds: existingUses.map((u) => u.hazardId) });
  }
  return commit(data, act, 'Delete control', [{ kind: 'control', rec: changed(c, act, { status: 'deleted' }) }, ...linksTo(data, act, [{ kind: 'control', id }])]);
}

/** @param {Data} data @param {Act} act @param {{ hazardId: string, controlId: string, kind: string }} args */
export function linkControl(data, act, { hazardId, controlId, kind }) {
  need(data, 'hazard', hazardId);
  const c = need(data, 'control', controlId);
  if (c.status !== 'live') throw new PivotError('control.retired', `${c.title} is retired, so it cannot be linked to a hazard.`);
  const k = needKind(kind);
  const id = ids.hazardControl(hazardId, controlId);
  const existing = get(data, 'hazardControl', id);
  const fields = { kind: k, recommendation: '', justification: '' };
  const rec = existing ? changed(existing, act, { status: 'live', ...fields }) : created(act, id, { hazardId, controlId, ...fields });
  return commit(data, act, 'Link control to hazard', [{ kind: 'hazardControl', rec }]);
}

/** @param {Data} data @param {Act} act @param {{ hazardId: string, controlId: string, kind: string }} args */
export function setControlKind(data, act, { hazardId, controlId, kind }) {
  const l = need(data, 'hazardControl', ids.hazardControl(hazardId, controlId));
  return commit(data, act, 'Change control kind', [{ kind: 'hazardControl', rec: changed(l, act, { kind: needKind(kind) }) }]);
}

/**
 * The additional control analysis for a control on a hazard, shared by every platform; fields
 * left out keep their value.
 * @param {Data} data @param {Act} act @param {{ hazardId: string, controlId: string, recommendation?: unknown, justification?: unknown }} args
 */
export function setControlAnalysis(data, act, { hazardId, controlId, recommendation, justification }) {
  const l = need(data, 'hazardControl', ids.hazardControl(hazardId, controlId));
  /** @type {Record<string, string>} */
  const fields = {};
  if (recommendation !== undefined) fields.recommendation = String(recommendation ?? '').trim();
  if (justification !== undefined) fields.justification = String(justification ?? '').trim();
  return commit(data, act, 'Edit control analysis', [{ kind: 'hazardControl', rec: changed(l, act, fields) }]);
}

/** @param {Data} data @param {Act} act @param {{ hazardId: string, controlId: string }} args */
export function unlinkControl(data, act, { hazardId, controlId }) {
  const l = need(data, 'hazardControl', ids.hazardControl(hazardId, controlId));
  const recs = [{ kind: 'hazardControl', rec: changed(l, act, { status: 'deleted' }) }];
  for (const r of live(data, 'ruling')) {
    if (r.hazardId === hazardId && r.controlId === controlId) recs.push({ kind: 'ruling', rec: changed(r, act, { status: 'deleted' }) });
  }
  return commit(data, act, 'Unlink control from hazard', recs);
}

/** @param {Data} data @param {Act} act @param {{ hazardId: string, platformId: string, controlId: string, kind: string }} args */
export function linkExistingControl(data, act, { hazardId, platformId, controlId, kind }) {
  need(data, 'hazardPlatform', ids.hazardPlatform(hazardId, platformId));
  const c = need(data, 'control', controlId);
  if (c.status !== 'live') throw new PivotError('control.retired', `${c.title} is retired, so it cannot be linked to a hazard.`);
  const k = needKind(kind);
  const id = ids.existingControl(hazardId, platformId, controlId);
  const existing = get(data, 'existingControl', id);
  const rec = existing ? changed(existing, act, { status: 'live', kind: k }) : created(act, id, { hazardId, platformId, controlId, kind: k });
  return commit(data, act, 'Link existing control', [{ kind: 'existingControl', rec }]);
}

/** @param {Data} data @param {Act} act @param {{ hazardId: string, platformId: string, controlId: string }} args */
export function unlinkExistingControl(data, act, { hazardId, platformId, controlId }) {
  const l = need(data, 'existingControl', ids.existingControl(hazardId, platformId, controlId));
  return commit(data, act, 'Unlink existing control', [{ kind: 'existingControl', rec: changed(l, act, { status: 'deleted' }) }]);
}

/** @param {Data} data @param {Act} act @param {{ hazardId: string, platformId: string, controlId: string, kind: string }} args */
export function setExistingControlKind(data, act, { hazardId, platformId, controlId, kind }) {
  const l = need(data, 'existingControl', ids.existingControl(hazardId, platformId, controlId));
  return commit(data, act, 'Change existing control kind', [{ kind: 'existingControl', rec: changed(l, act, { kind: needKind(kind) }) }]);
}
