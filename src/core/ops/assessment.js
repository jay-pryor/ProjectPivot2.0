import { PivotError } from '../errors.js';
import { ids } from '../ids.js';
import { get, created, changed, need, needText } from '../data.js';
import { commit } from '../apply.js';
import { ratingFor } from '../matrix.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */
/** @typedef {{ hazardId: string, controlId: string, platformId: string }} Triple */

/** @param {Data} data @param {Triple} t @returns {string} the ruling id */
function needTriple(data, t) {
  need(data, 'hazardControl', ids.hazardControl(t.hazardId, t.controlId));
  need(data, 'hazardPlatform', ids.hazardPlatform(t.hazardId, t.platformId));
  return ids.ruling(t.hazardId, t.controlId, t.platformId);
}

/** @param {Data} data @param {Act} act @param {Triple} t @param {'confirmed' | 'excluded'} state @param {string} reason @param {string} action */
function rule(data, act, t, state, reason, action) {
  const id = needTriple(data, t);
  const existing = get(data, 'ruling', id);
  const fields = { hazardId: t.hazardId, controlId: t.controlId, platformId: t.platformId, state, reason };
  const rec = existing ? changed(existing, act, { ...fields, status: 'live' }) : created(act, id, fields);
  return commit(data, act, action, [{ kind: 'ruling', rec }]);
}

/** @param {Data} data @param {Act} act @param {Triple} t */
export function confirmControl(data, act, t) {
  return rule(data, act, t, 'confirmed', '', 'Confirm control on platform');
}

/** @param {Data} data @param {Act} act @param {Triple & { reason: string }} t */
export function excludeControl(data, act, t) {
  return rule(data, act, t, 'excluded', needText(t.reason, 'A reason for excluding the control'), 'Exclude control from platform');
}

/** @param {Data} data @param {Act} act @param {Triple} t */
export function resetControl(data, act, t) {
  const id = needTriple(data, t);
  const r = get(data, 'ruling', id);
  if (!r || r.status !== 'live') return data;
  return commit(data, act, 'Reset control to awaiting', [{ kind: 'ruling', rec: changed(r, act, { status: 'deleted' }) }]);
}

export const STAGES = Object.freeze(['initial', 'residual']);

/** @param {unknown} consequence @param {unknown} likelihood */
function readPair(consequence, likelihood) {
  const c = consequence === '' || consequence == null ? null : Number(consequence);
  const l = likelihood === '' || likelihood == null ? null : String(likelihood);
  ratingFor(c, l); // throws when either is off its scale
  return c === null && l === null ? null : { consequence: c, likelihood: l };
}

/**
 * @param {Data} data @param {Act} act
 * @param {{ hazardId: string, platformId: string, stage: string, consequence: unknown, likelihood: unknown }} args
 */
export function setRating(data, act, { hazardId, platformId, stage, consequence, likelihood }) {
  if (!STAGES.includes(stage)) throw new PivotError('rating.stage', 'A rating is either initial or residual.');
  need(data, 'hazardPlatform', ids.hazardPlatform(hazardId, platformId));
  const value = readPair(consequence, likelihood);
  const id = ids.rating(hazardId, platformId);
  const existing = get(data, 'rating', id);
  let rec;
  if (existing && existing.status === 'live') rec = changed(existing, act, { [stage]: value });
  else if (existing) rec = changed(existing, act, { status: 'live', initial: null, residual: null, [stage]: value });
  else rec = created(act, id, { hazardId, platformId, initial: null, residual: null, [stage]: value });
  return commit(data, act, stage === 'initial' ? 'Set initial rating' : 'Set residual rating', [{ kind: 'rating', rec }]);
}

/**
 * Set one stage's rating from a matrix cell as a single dropdown gives it: `2C`, or blank for
 * not entered.
 * @param {Data} data @param {Act} act
 * @param {{ hazardId: string, platformId: string, stage: string, value: string }} args
 */
export function setRatingCell(data, act, { hazardId, platformId, stage, value }) {
  const v = String(value ?? '').trim();
  if (v === '') return setRating(data, act, { hazardId, platformId, stage, consequence: null, likelihood: null });
  const m = /^([1-5])([A-G])$/.exec(v);
  if (!m) throw new PivotError('rating.cell', `${v} is not a cell of the risk matrix.`);
  return setRating(data, act, { hazardId, platformId, stage, consequence: Number(m[1]), likelihood: m[2] });
}
