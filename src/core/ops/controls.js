import { PivotError } from '../errors.js';
import { newId, ids } from '../ids.js';
import { get, live, created, changed, need, needText } from '../data.js';
import { commit } from '../apply.js';
import { linksTo } from './references.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */

export const CONTROL_KINDS = Object.freeze(['preventative', 'mitigating']);

/** Who owns a control on a platform: us, the platform's customer, or another named party. */
export const OWNERS = Object.freeze(['us', 'customer', 'other']);

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

/** Additional controls are proposed for a hazard; existing controls are already in place on a platform. */
export const CONTROL_CATEGORIES = Object.freeze(['additional', 'existing']);

/** @param {unknown} category @returns {'additional' | 'existing'} */
function needCategory(category) {
  if (category === undefined || category === null || category === '') return 'additional';
  if (category !== 'additional' && category !== 'existing') throw new PivotError('control.category', 'A control is either an additional control or an existing control.');
  return category;
}

/** @param {Data} data @param {Act} act @param {{ id?: string, title: string, description?: string, tier?: string | null, category?: string }} args */
export function createControl(data, act, { id = newId(), title, description = '', tier = null, category }) {
  const cat = needCategory(category);
  const rec = created(act, id, { number: null, category: cat, title: needText(title, 'A control title'), description: String(description ?? '').trim(), tier: needTier(tier) });
  return commit(data, act, cat === 'existing' ? 'Create existing control' : 'Create control', [{ kind: 'control', rec }]);
}

/**
 * Make a control of the other category from one: the same title, description and tier, as a new
 * additional or existing control with its own number. The original is untouched.
 * @param {Data} data @param {Act} act @param {{ id?: string, from: string, category: string }} args
 */
export function copyControlAs(data, act, { id = newId(), from, category }) {
  const c = need(data, 'control', from);
  const cat = needCategory(category);
  if ((c.category ?? 'additional') === cat) throw new PivotError('control.category', `${c.title} is already ${cat === 'existing' ? 'an existing' : 'an additional'} control.`);
  return createControl(data, act, { id, title: c.title, description: c.description ?? '', tier: c.tier ?? null, category: cat });
}

/**
 * @param {Data} data @param {Act} act
 * @param {{ id: string, title?: string, description?: string, tier?: string | null, origin?: string }} args
 *   origin: where an existing control came from (free text; blank clears it)
 */
export function updateControl(data, act, { id, title, description, tier, origin }) {
  const c = need(data, 'control', id);
  /** @type {Record<string, string | null>} */
  const fields = {};
  if (title !== undefined) fields.title = needText(title, 'A control title');
  if (description !== undefined) fields.description = String(description).trim();
  if (tier !== undefined) fields.tier = needTier(tier);
  if (origin !== undefined) fields.origin = String(origin ?? '').trim();
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
  const owners = live(data, 'controlPlatform').filter((r) => r.controlId === id).map((r) => ({ kind: 'controlPlatform', rec: changed(r, act, { status: 'deleted' }) }));
  return commit(data, act, 'Delete control', [{ kind: 'control', rec: changed(c, act, { status: 'deleted' }) }, ...owners, ...linksTo(data, act, [{ kind: 'control', id }])]);
}

/** @param {Data} data @param {Act} act @param {{ hazardId: string, controlId: string, kind: string }} args */
export function linkControl(data, act, { hazardId, controlId, kind }) {
  need(data, 'hazard', hazardId);
  const c = need(data, 'control', controlId);
  if (c.status !== 'live') throw new PivotError('control.retired', `${c.title} is retired, so it cannot be linked to a hazard.`);
  if (c.category === 'existing') throw new PivotError('control.category', `${c.title} is an existing control. Add it on a platform's SSRA, under Existing controls.`);
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
  if (c.category !== 'existing') throw new PivotError('control.category', `${c.title} is an additional control. Link it from the hazard's Overview.`);
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

/**
 * Who owns a control on a platform. Fields left out keep their value; an empty owner clears it.
 * A name is kept only for another party.
 * @param {Data} data @param {Act} act @param {{ controlId: string, platformId: string, owner?: string, ownerName?: string }} args
 */
export function setControlOwner(data, act, { controlId, platformId, owner, ownerName }) {
  need(data, 'control', controlId);
  need(data, 'platform', platformId);
  const id = ids.controlPlatform(controlId, platformId);
  const existing = get(data, 'controlPlatform', id);
  const cur = existing && existing.status === 'live' ? existing : { owner: null, ownerName: '' };
  const o = owner === undefined ? cur.owner : owner === '' || owner === null ? null : String(owner);
  if (o !== null && !OWNERS.includes(o)) throw new PivotError('control.owner', `A control's owner is ${OWNERS.join(', ')}, or not set.`);
  const name = o === 'other' ? String(ownerName === undefined ? cur.ownerName : ownerName ?? '').trim() : '';
  if (o === null) {
    if (!existing || existing.status !== 'live') return data;
    return commit(data, act, 'Set control owner', [{ kind: 'controlPlatform', rec: changed(existing, act, { status: 'deleted' }) }]);
  }
  const fields = { owner: o, ownerName: name };
  const rec = existing ? changed(existing, act, { ...fields, status: 'live' }) : created(act, id, { controlId, platformId, ...fields });
  return commit(data, act, 'Set control owner', [{ kind: 'controlPlatform', rec }]);
}
