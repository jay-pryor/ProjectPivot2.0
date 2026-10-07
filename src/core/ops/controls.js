import { PivotError } from '../errors.js';
import { newId, ids } from '../ids.js';
import { get, live, created, changed, need, needText } from '../data.js';
import { commit } from '../apply.js';
import { linksTo } from './references.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */

export const CONTROL_KINDS = Object.freeze(['preventative', 'mitigating']);

/** Who implements a control on a platform: the platform's maker, HighCom, or the customer. */
export const IMPLEMENTERS = Object.freeze(['oem', 'highcom', 'customer']);

/** Each implementer as a person reads it. */
export const IMPLEMENTER_WORD = Object.freeze({ oem: 'OEM', highcom: 'HighCom', customer: 'Customer' });

/** The hierarchy of controls, most effective first. */
export const CONTROL_TIERS = Object.freeze(['Elimination', 'Substitution', 'Isolation', 'Engineering', 'Administrative', 'PPE']);

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

/**
 * @param {Data} data @param {Act} act
 * @param {{ id?: string, title: string, description?: string, tier?: string | null, kind?: string, origin?: string }} args
 *   kind: its usual kind, preventative or mitigating, which linking it to a hazard starts from
 */
export function createControl(data, act, { id = newId(), title, description = '', tier = null, kind, origin }) {
  const o = String(origin ?? '').trim();
  const rec = created(act, id, { number: null, title: needText(title, 'A control title'), description: String(description ?? '').trim(), tier: needTier(tier),
    kind: kind ? needKind(kind) : 'preventative', ...(o ? { origin: o } : {}) });
  return commit(data, act, 'Create control', [{ kind: 'control', rec }]);
}

/**
 * @param {Data} data @param {Act} act
 * @param {{ id: string, title?: string, description?: string, tier?: string | null, origin?: string, kind?: string }} args
 *   origin: where the control came from (free text; blank clears it); kind: its usual kind
 */
export function updateControl(data, act, { id, title, description, tier, origin, kind }) {
  const c = need(data, 'control', id);
  /** @type {Record<string, string | null>} */
  const fields = {};
  if (title !== undefined) fields.title = needText(title, 'A control title');
  if (description !== undefined) fields.description = String(description).trim();
  if (tier !== undefined) fields.tier = needTier(tier);
  if (origin !== undefined) fields.origin = String(origin ?? '').trim();
  if (kind !== undefined) fields.kind = needKind(kind);
  return commit(data, act, 'Edit control', [{ kind: 'control', rec: changed(c, act, fields) }]);
}

/**
 * A new control, made where it is needed: created (C-…, numbered at save) and added for a hazard
 * on one platform, as its kind there, in one step.
 * @param {Data} data @param {Act} act
 * @param {{ id?: string, title: string, hazardId: string, platformId: string, kind?: string }} args
 */
export function createControlOn(data, act, { id = newId(), title, hazardId, platformId, kind }) {
  const made = createControl(data, act, { id, title, kind: kind || 'preventative' });
  return addControlHere(made, act, { hazardId, platformId, controlId: id, kind: kind || 'preventative' });
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
  const owners = live(data, 'implementer').filter((r) => r.controlId === id).map((r) => ({ kind: 'implementer', rec: changed(r, act, { status: 'deleted' }) }));
  return commit(data, act, 'Delete control', [{ kind: 'control', rec: changed(c, act, { status: 'deleted' }) }, ...owners, ...linksTo(data, act, [{ kind: 'control', id }])]);
}

/**
 * Link a control to a hazard, on every platform the hazard is on (each starts Recommended).
 * @param {Data} data @param {Act} act @param {{ hazardId: string, controlId: string, kind: string }} args
 */
export function linkControl(data, act, { hazardId, controlId, kind }) {
  need(data, 'hazard', hazardId);
  const c = need(data, 'control', controlId);
  if (c.status !== 'live') throw new PivotError('control.retired', `${c.title} is retired, so it cannot be linked to a hazard.`);
  const k = needKind(kind || c.kind || 'preventative');
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
 * The control analysis for a control on a hazard, shared by every platform; fields
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
  for (const kind of ['ruling', 'implementationStatus', 'controlOn']) {
    for (const r of live(data, kind)) {
      if (r.hazardId === hazardId && r.controlId === controlId) recs.push({ kind, rec: changed(r, act, { status: 'deleted' }) });
    }
  }
  return commit(data, act, 'Unlink control from hazard', recs);
}

/**
 * Add a control for a hazard on one platform. Not yet linked to the hazard, it is linked and
 * added here alone (taken off the hazard's other platforms); linked but taken off here, it is
 * put back. Its status here starts Recommended.
 * @param {Data} data @param {Act} act @param {{ hazardId: string, platformId: string, controlId: string, kind?: string }} args
 */
export function addControlHere(data, act, { hazardId, platformId, controlId, kind }) {
  need(data, 'hazardPlatform', ids.hazardPlatform(hazardId, platformId));
  const c = need(data, 'control', controlId);
  if (c.status !== 'live') throw new PivotError('control.retired', `${c.title} is retired, so it cannot be added to a hazard.`);
  const link = get(data, 'hazardControl', ids.hazardControl(hazardId, controlId));
  /** @type {{ kind: string, rec: import('../data.js').Rec }[]} */
  const recs = [];
  const onHere = (/** @type {string} */ p, /** @type {boolean} */ off) => {
    const id = ids.controlOn(hazardId, controlId, p);
    const was = get(data, 'controlOn', id);
    if (was && was.status === 'live' && Boolean(was.off) === off) return;
    if (!was && !off) return;
    recs.push({ kind: 'controlOn', rec: was ? changed(was, act, { status: 'live', off, ...(was.status === 'live' ? {} : { kind: null, targets: [] }) }) : created(act, id, { hazardId, controlId, platformId: p, kind: null, targets: [], off }) });
  };
  if (!link || link.status !== 'live') {
    const k = needKind(kind || c.kind || 'preventative');
    const fields = { kind: k, recommendation: '', justification: '' };
    recs.push({ kind: 'hazardControl', rec: link ? changed(link, act, { status: 'live', ...fields }) : created(act, ids.hazardControl(hazardId, controlId), { hazardId, controlId, ...fields }) });
    for (const hp of live(data, 'hazardPlatform')) if (hp.hazardId === hazardId) onHere(hp.platformId, hp.platformId !== platformId);
  } else {
    onHere(platformId, false);
  }
  if (!recs.length) return data;
  return commit(data, act, 'Add control to platform', recs);
}

/**
 * Take a control off one platform of its hazard: it stays linked to the hazard, and its status,
 * kind and notes here are kept for if it is added back.
 * @param {Data} data @param {Act} act @param {{ hazardId: string, platformId: string, controlId: string }} args
 */
export function removeControlHere(data, act, { hazardId, platformId, controlId }) {
  need(data, 'hazardControl', ids.hazardControl(hazardId, controlId));
  need(data, 'hazardPlatform', ids.hazardPlatform(hazardId, platformId));
  const id = ids.controlOn(hazardId, controlId, platformId);
  const was = get(data, 'controlOn', id);
  if (was && was.status === 'live' && was.off) return data;
  const rec = was ? changed(was, act, { status: 'live', off: true, ...(was.status === 'live' ? {} : { kind: null, targets: [] }) }) : created(act, id, { hazardId, controlId, platformId, kind: null, targets: [], off: true });
  return commit(data, act, 'Remove control from platform', [{ kind: 'controlOn', rec }]);
}

/**
 * A control's kind on one platform of the hazard, which may differ from the hazard's
 * (the kind it starts from). What it prevents or mitigates there starts again with a new kind.
 * @param {Data} data @param {Act} act @param {{ hazardId: string, controlId: string, platformId: string, kind: string }} args
 */
export function setControlKindOnPlatform(data, act, { hazardId, controlId, platformId, kind }) {
  const link = need(data, 'hazardControl', ids.hazardControl(hazardId, controlId));
  need(data, 'hazardPlatform', ids.hazardPlatform(hazardId, platformId));
  const k = needKind(kind);
  const id = ids.controlOn(hazardId, controlId, platformId);
  const existing = get(data, 'controlOn', id);
  const live = existing && existing.status === 'live' ? existing : null;
  if ((live?.kind || link.kind) === k) return data;
  const fields = { kind: k === link.kind ? null : k, targets: [], off: Boolean(live?.off) };
  const rec = existing ? changed(existing, act, { ...fields, status: 'live' }) : created(act, id, { hazardId, controlId, platformId, ...fields });
  return commit(data, act, 'Change control kind on platform', [{ kind: 'controlOn', rec }]);
}

/**
 * The causal factors a preventative control prevents, or the consequences a mitigating one
 * mitigates, for a hazard on a platform. Only that platform's causal factors, or the hazard's
 * consequences, may be chosen.
 * @param {Data} data @param {Act} act
 * @param {{ hazardId: string, controlId: string, platformId: string, targets?: string | string[] }} args
 */
export function setControlTargets(data, act, { hazardId, controlId, platformId, targets }) {
  const wanted = [...new Set((Array.isArray(targets) ? targets : String(targets ?? '').split(',')).filter(Boolean))];
  const link = need(data, 'hazardControl', ids.hazardControl(hazardId, controlId));
  need(data, 'hazardPlatform', ids.hazardPlatform(hazardId, platformId));
  const id = ids.controlOn(hazardId, controlId, platformId);
  const on = get(data, 'controlOn', id);
  const base = on ?? created(act, id, { hazardId, controlId, platformId, kind: null, targets: [], off: false });
  const kind = String((on && on.status === 'live' && on.kind) || link.kind);
  const recKind = 'controlOn';
  const pool = kind === 'mitigating'
    ? live(data, 'consequence').filter((r) => r.hazardId === hazardId)
    : live(data, 'causalFactor').filter((r) => r.hazardId === hazardId && (!r.platformId || r.platformId === platformId));
  const allowed = new Set(pool.map((r) => r.id));
  const bad = wanted.find((t) => !allowed.has(t));
  if (bad) throw new PivotError('control.target', kind === 'mitigating' ? 'A mitigating control is linked to the hazard\'s consequences.' : 'A preventative control is linked to this platform\'s causal factors.');
  const was = base.status === 'live' && Array.isArray(base.targets) ? base.targets : [];
  if (was.length === wanted.length && was.every((t) => wanted.includes(t))) return data;
  const rec = data.records[recKind]?.[base.id] ? changed(base, act, { targets: wanted, status: 'live' }) : { ...base, targets: wanted };
  return commit(data, act, kind === 'mitigating' ? 'Set what a control mitigates' : 'Set what a control prevents', [{ kind: recKind, rec }]);
}

/**
 * Who implements a control on a platform: OEM, HighCom or the customer; empty clears it.
 * @param {Data} data @param {Act} act @param {{ controlId: string, platformId: string, implementedBy?: string | null }} args
 */
export function setImplementedBy(data, act, { controlId, platformId, implementedBy }) {
  need(data, 'control', controlId);
  need(data, 'platform', platformId);
  const id = ids.implementer(controlId, platformId);
  const existing = get(data, 'implementer', id);
  const by = implementedBy === '' || implementedBy == null ? null : String(implementedBy);
  if (by !== null && !IMPLEMENTERS.includes(by)) throw new PivotError('control.implementedBy', `A control is implemented by ${Object.values(IMPLEMENTER_WORD).join(', ')}, or not set.`);
  if (by === null) {
    if (!existing || existing.status !== 'live') return data;
    return commit(data, act, 'Set implemented by', [{ kind: 'implementer', rec: changed(existing, act, { status: 'deleted' }) }]);
  }
  const rec = existing ? changed(existing, act, { implementedBy: by, status: 'live' }) : created(act, id, { controlId, platformId, implementedBy: by });
  return commit(data, act, 'Set implemented by', [{ kind: 'implementer', rec }]);
}
