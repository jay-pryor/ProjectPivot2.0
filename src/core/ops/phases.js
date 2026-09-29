import { PivotError } from '../errors.js';
import { newId, ids } from '../ids.js';
import { get, all, live, created, changed, need, needText } from '../data.js';
import { commit } from '../apply.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */

/** A phase name, trimmed, not blank, and not another phase's (ignoring case). @param {Data} data @param {unknown} name @param {string | null} self */
function needName(data, name, self) {
  const n = needText(name, 'A phase name');
  const clash = all(data, 'phase').find((p) => p.status !== 'deleted' && p.id !== self && String(p.name).toLowerCase() === n.toLowerCase());
  if (clash) throw new PivotError('phase.duplicate', `There is already a phase called ${clash.name}.`);
  return n;
}

/** @param {Data} data @param {Act} act @param {{ id?: string, name: string }} args */
export function createPhase(data, act, { id = newId(), name }) {
  return commit(data, act, 'Create phase', [{ kind: 'phase', rec: created(act, id, { name: needName(data, name, null) }) }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string, name: string }} args */
export function renamePhase(data, act, { id, name }) {
  const p = need(data, 'phase', id);
  return commit(data, act, 'Rename phase', [{ kind: 'phase', rec: changed(p, act, { name: needName(data, name, id) }) }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string }} args */
export function retirePhase(data, act, { id }) {
  const p = need(data, 'phase', id);
  if (p.status === 'retired') return data;
  return commit(data, act, 'Retire phase', [{ kind: 'phase', rec: changed(p, act, { status: 'retired' }) }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string }} args */
export function deletePhase(data, act, { id }) {
  const p = need(data, 'phase', id);
  const uses = live(data, 'hazardPhase').filter((l) => l.phaseId === id);
  if (uses.length) {
    throw new PivotError('phase.in-use', `${p.name} is ticked on ${uses.length === 1 ? 'a hazard' : `${uses.length} hazards`}. Remove it there first, or retire it.`, { hazardIds: uses.map((u) => u.hazardId) });
  }
  return commit(data, act, 'Delete phase', [{ kind: 'phase', rec: changed(p, act, { status: 'deleted' }) }]);
}

/** @param {Data} data @param {Act} act @param {{ hazardId: string, phaseId: string }} args */
export function linkPhase(data, act, { hazardId, phaseId }) {
  need(data, 'hazard', hazardId);
  const p = need(data, 'phase', phaseId);
  if (p.status !== 'live') throw new PivotError('phase.retired', `${p.name} is retired, so it cannot be added to a hazard.`);
  const id = ids.hazardPhase(hazardId, phaseId);
  const existing = get(data, 'hazardPhase', id);
  if (existing && existing.status === 'live') return data;
  const rec = existing ? changed(existing, act, { status: 'live' }) : created(act, id, { hazardId, phaseId });
  return commit(data, act, 'Add lifecycle phase', [{ kind: 'hazardPhase', rec }]);
}

/** @param {Data} data @param {Act} act @param {{ hazardId: string, phaseId: string }} args */
export function unlinkPhase(data, act, { hazardId, phaseId }) {
  const l = need(data, 'hazardPhase', ids.hazardPhase(hazardId, phaseId));
  return commit(data, act, 'Remove lifecycle phase', [{ kind: 'hazardPhase', rec: changed(l, act, { status: 'deleted' }) }]);
}
