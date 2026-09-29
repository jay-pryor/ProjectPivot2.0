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
export const RECEPTORS = Object.freeze(['personnel', 'environment']);

/** @param {unknown} v */
const blank = (v) => v === '' || v == null;

/** @param {unknown} consequence @param {unknown} likelihood */
function readPair(consequence, likelihood) {
  const c = blank(consequence) ? null : Number(consequence);
  const l = blank(likelihood) ? null : String(likelihood);
  ratingFor(c, l); // throws rating.consequence or rating.likelihood when either is off its scale
  return { consequence: c, likelihood: l };
}

/** @param {string} stage @param {string} receptor */
function needScope(stage, receptor) {
  if (!STAGES.includes(stage)) throw new PivotError('rating.stage', 'A risk assessment is initial or residual.');
  if (!RECEPTORS.includes(receptor)) throw new PivotError('rating.receptor', 'A risk assessment is for personnel or the environment.');
}

/**
 * The record one assessment becomes after a change; fields left out keep their value.
 * @param {Data} data @param {Act} act
 * @param {{ hazardId: string, platformId: string, stage: string, receptor: string, likelihood?: unknown, consequence?: unknown, likelihoodWhy?: unknown, consequenceWhy?: unknown }} a
 */
function assessmentRec(data, act, a) {
  needScope(a.stage, a.receptor);
  need(data, 'hazardPlatform', ids.hazardPlatform(a.hazardId, a.platformId));
  const id = ids.assessment(a.hazardId, a.platformId, a.stage, a.receptor);
  const existing = get(data, 'assessment', id);
  const cur = existing && existing.status === 'live' ? existing : { likelihood: null, consequence: null, likelihoodWhy: '', consequenceWhy: '' };
  const pair = readPair(a.consequence === undefined ? cur.consequence : a.consequence, a.likelihood === undefined ? cur.likelihood : a.likelihood);
  const fields = {
    likelihood: pair.likelihood, consequence: pair.consequence,
    likelihoodWhy: a.likelihoodWhy === undefined ? cur.likelihoodWhy : String(a.likelihoodWhy ?? '').trim(),
    consequenceWhy: a.consequenceWhy === undefined ? cur.consequenceWhy : String(a.consequenceWhy ?? '').trim(),
  };
  if (!existing) return created(act, id, { hazardId: a.hazardId, platformId: a.platformId, stage: a.stage, receptor: a.receptor, ...fields });
  return changed(existing, act, { ...fields, status: 'live' });
}

/**
 * One of the four risk assessments of a hazard on a platform.
 * @param {Data} data @param {Act} act
 * @param {{ hazardId: string, platformId: string, stage: string, receptor: string, likelihood?: unknown, consequence?: unknown, likelihoodWhy?: unknown, consequenceWhy?: unknown }} args
 */
export function setAssessment(data, act, args) {
  return commit(data, act, `Set ${args.stage} ${args.receptor} risk`, [{ kind: 'assessment', rec: assessmentRec(data, act, args) }]);
}

/**
 * A stage's likelihood and consequence for one receptor, or for both when none is named.
 * @param {Data} data @param {Act} act
 * @param {{ hazardId: string, platformId: string, stage: string, consequence: unknown, likelihood: unknown, receptor?: string }} args
 */
export function setRating(data, act, { hazardId, platformId, stage, consequence, likelihood, receptor }) {
  const receptors = receptor ? [receptor] : RECEPTORS;
  const recs = receptors.map((r) => ({ kind: 'assessment', rec: assessmentRec(data, act, { hazardId, platformId, stage, receptor: r, consequence, likelihood }) }));
  const action = receptor ? `Set ${stage} ${receptor} risk` : stage === 'initial' ? 'Set initial rating' : 'Set residual rating';
  return commit(data, act, action, recs);
}

/**
 * A stage's rating from a matrix cell as a single dropdown gives it: `2C`, or blank.
 * @param {Data} data @param {Act} act
 * @param {{ hazardId: string, platformId: string, stage: string, receptor?: string, value: string }} args
 */
export function setRatingCell(data, act, { hazardId, platformId, stage, receptor, value }) {
  const v = String(value ?? '').trim();
  if (v === '') return setRating(data, act, { hazardId, platformId, stage, receptor, consequence: null, likelihood: null });
  const m = /^([1-5])([A-G])$/.exec(v);
  if (!m) throw new PivotError('rating.cell', `${v} is not a cell of the risk matrix.`);
  return setRating(data, act, { hazardId, platformId, stage, receptor, consequence: Number(m[1]), likelihood: m[2] });
}

/**
 * SFARP considerations for a hazard on a platform; fields left out keep their value.
 * @param {Data} data @param {Act} act
 * @param {{ hazardId: string, platformId: string, justification?: unknown, conclusion?: unknown, conditions?: unknown }} args
 */
export function setSfarp(data, act, { hazardId, platformId, justification, conclusion, conditions }) {
  need(data, 'hazardPlatform', ids.hazardPlatform(hazardId, platformId));
  const id = ids.sfarp(hazardId, platformId);
  const existing = get(data, 'sfarp', id);
  const cur = existing && existing.status === 'live' ? existing : { justification: '', conclusion: '', conditions: '' };
  const text = (/** @type {unknown} */ v, /** @type {string} */ was) => (v === undefined ? was : String(v ?? '').trim());
  const fields = { justification: text(justification, cur.justification), conclusion: text(conclusion, cur.conclusion), conditions: text(conditions, cur.conditions) };
  const rec = existing ? changed(existing, act, { ...fields, status: 'live' }) : created(act, id, { hazardId, platformId, ...fields });
  return commit(data, act, 'Edit SFARP considerations', [{ kind: 'sfarp', rec }]);
}
