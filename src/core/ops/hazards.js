import { PivotError } from '../errors.js';
import { newId, hazardLabel } from '../ids.js';
import { get, put, all, live, created, changed, need, needText, NUMBERED } from '../data.js';
import { commit } from '../apply.js';
import { platformsOfHazard } from '../queries.js';

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

/** @param {Data} data @param {import('../data.js').Rec} hazard @param {string} verb */
function refuseOnPlatforms(data, hazard, verb) {
  const on = platformsOfHazard(data, hazard.id);
  if (on.length === 0) return;
  const names = on.map((p) => get(data, 'platform', p)?.name ?? p).join(', ');
  throw new PivotError(
    'hazard.on-platforms',
    `${hazardLabel(hazard)} is still on ${names}. Unlink it from ${on.length === 1 ? 'that platform' : 'those platforms'} before you ${verb} it.`,
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
  refuseOnPlatforms(data, h, 'delete');
  const recs = [{ kind: 'hazard', rec: changed(h, act, { status: 'deleted' }) }];
  for (const kind of ['causalFactor', 'consequence']) {
    for (const r of live(data, kind)) if (r.hazardId === id) recs.push({ kind, rec: changed(r, act, { status: 'deleted' }) });
  }
  for (const l of live(data, 'hazardControl')) if (l.hazardId === id) recs.push({ kind: 'hazardControl', rec: changed(l, act, { status: 'deleted' }) });
  return commit(data, act, 'Delete hazard', recs);
}

const RESTORABLE = { hazard: 'hazard', control: 'control', platform: 'platform' };

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
    /** @param {Data} data @param {Act} act @param {{ id?: string, hazardId: string, text: string }} args */
    add(data, act, { id = newId(), hazardId, text }) {
      need(data, 'hazard', hazardId);
      const rec = created(act, id, { hazardId, text: needText(text, `${label} text`) });
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
      return commit(data, act, `Delete ${lower}`, [{ kind, rec: changed(r, act, { status: 'deleted' }) }]);
    },
  };
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
 * Give each hazard, control and platform that has no number the next one of its kind, oldest
 * first. Run at save time, after the merge, so two users creating records at once never take the
 * same number; each kind's counter only counts up, so a number is never reused.
 * @param {Data} data
 * @returns {Data}
 */
export function assignNumbers(data) {
  let d = data;
  for (const { kind, counter } of NUMBERED) {
    const fresh = all(d, kind).filter((r) => r.number == null && r.status !== 'deleted');
    if (fresh.length === 0) continue;
    let n = /** @type {number} */ (/** @type {any} */ (d)[counter]);
    for (const r of fresh) d = put(d, kind, { ...r, number: n++ });
    d = { ...d, [counter]: n };
  }
  return d;
}

export const assignHazardNumbers = assignNumbers;
