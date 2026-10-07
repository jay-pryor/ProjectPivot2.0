import { PivotError } from '../errors.js';
import { ids } from '../ids.js';
import { get, created, changed, need, needText } from '../data.js';
import { commit } from '../apply.js';
import { ratingFor } from '../matrix.js';
import { RECEPTORS } from '../receptors.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */
/** @typedef {{ hazardId: string, controlId: string, platformId: string }} Triple */

/** @param {Data} data @param {Triple} t @returns {string} the ruling id */
function needTriple(data, t) {
  need(data, 'hazardControl', ids.hazardControl(t.hazardId, t.controlId));
  need(data, 'hazardPlatform', ids.hazardPlatform(t.hazardId, t.platformId));
  return ids.ruling(t.hazardId, t.controlId, t.platformId);
}

export const CONTROL_STATUSES = Object.freeze(['recommended', 'planned', 'implemented', 'rejected']);

/**
 * A control's status on a platform. Recommended is the default and is stored as no record.
 * @param {Data} data @param {Act} act @param {Triple & { status: string, reason?: string }} t
 */
export function setControlStatus(data, act, { hazardId, controlId, platformId, status, reason }) {
  if (!CONTROL_STATUSES.includes(status)) throw new PivotError('control.status', `A control's status is one of ${CONTROL_STATUSES.join(', ')}.`);
  const id = needTriple(data, { hazardId, controlId, platformId });
  const existing = get(data, 'ruling', id);
  const action = `Set control to ${status}`;
  if (status === 'recommended') {
    if (!existing || existing.status !== 'live') return data;
    return commit(data, act, action, [{ kind: 'ruling', rec: changed(existing, act, { status: 'deleted' }) }]);
  }
  const why = status === 'rejected' ? needText(reason, 'A reason for rejecting the control') : '';
  const fields = { hazardId, controlId, platformId, state: status, reason: why };
  const rec = existing ? changed(existing, act, { ...fields, status: 'live' }) : created(act, id, fields);
  return commit(data, act, action, [{ kind: 'ruling', rec }]);
}

/** @param {Data} data @param {Act} act @param {Triple} t */
export const confirmControl = (data, act, t) => setControlStatus(data, act, { ...t, status: 'implemented' });
/** @param {Data} data @param {Act} act @param {Triple & { reason: string }} t */
export const excludeControl = (data, act, t) => setControlStatus(data, act, { ...t, status: 'rejected' });
/** @param {Data} data @param {Act} act @param {Triple} t */
export const resetControl = (data, act, t) => setControlStatus(data, act, { ...t, status: 'recommended' });

export const STAGES = Object.freeze(['initial', 'residual']);
export { RECEPTORS };

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
  if (!RECEPTORS.includes(receptor)) throw new PivotError('rating.receptor', 'A risk assessment is for personnel, the environment or capability.');
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
 * A stage's likelihood and consequence for every receptor, copied from another platform of the
 * hazard in one change, with their justifications unless withWhy is false (then those here stay).
 * @param {Data} data @param {Act} act @param {{ hazardId: string, platformId: string, stage: string, from: string, withWhy?: boolean | string }} args
 */
export function copyStageRisk(data, act, { hazardId, platformId, stage, from, withWhy }) {
  if (!STAGES.includes(stage)) throw new PivotError('rating.stage', 'A risk assessment is initial or residual.');
  if (from === platformId) throw new PivotError('rating.copy', 'Choose another platform to copy from.');
  need(data, 'hazardPlatform', ids.hazardPlatform(hazardId, from));
  const recs = RECEPTORS.map((receptor) => {
    const src = get(data, 'assessment', ids.assessment(hazardId, from, stage, receptor));
    const live = src && src.status === 'live' ? src : null;
    // With its justifications too, unless asked for the likelihoods and consequences alone.
    const why = withWhy === false || withWhy === 'false' ? {} : { likelihoodWhy: live?.likelihoodWhy ?? '', consequenceWhy: live?.consequenceWhy ?? '' };
    return { kind: 'assessment', rec: assessmentRec(data, act, { hazardId, platformId, stage, receptor, likelihood: live?.likelihood ?? null, consequence: live?.consequence ?? null, ...why }) };
  });
  const name = get(data, 'platform', from)?.name ?? from;
  return commit(data, act, `Copy ${stage} risk from ${name}`, recs);
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

/** The other platform to copy from, refused if it is this one or the hazard is not on it; and its name. @param {Data} data @param {string} hazardId @param {string} platformId @param {string} from */
function copyFrom(data, hazardId, platformId, from) {
  if (from === platformId) throw new PivotError('rating.copy', 'Choose another platform to copy from.');
  need(data, 'hazardPlatform', ids.hazardPlatform(hazardId, platformId));
  need(data, 'hazardPlatform', ids.hazardPlatform(hazardId, from));
  return String(get(data, 'platform', from)?.name ?? from);
}

/**
 * Make this platform's controls for the hazard match another platform's: each control the hazard
 * has is on here where it is on there (and off where it is off), with the status (and any
 * rejection reason) it has there.
 * @param {Data} data @param {Act} act @param {{ hazardId: string, platformId: string, from: string }} args
 */
export function copyControls(data, act, { hazardId, platformId, from }) {
  const name = copyFrom(data, hazardId, platformId, from);
  const recs = [];
  for (const l of Object.values(data.records.hazardControl ?? {})) {
    if (l.status !== 'live' || l.hazardId !== hazardId) continue;
    // On or off: off there means off here; on there, on here.
    const onThere = get(data, 'controlOn', ids.controlOn(hazardId, l.controlId, from));
    const offThere = Boolean(onThere && onThere.status === 'live' && onThere.off);
    const aoId = ids.controlOn(hazardId, l.controlId, platformId);
    const onHere = get(data, 'controlOn', aoId);
    const offHere = Boolean(onHere && onHere.status === 'live' && onHere.off);
    if (offThere !== offHere) {
      recs.push({ kind: 'controlOn', rec: onHere
        ? changed(onHere, act, { status: 'live', off: offThere, ...(onHere.status === 'live' ? {} : { kind: null, targets: [] }) })
        : created(act, aoId, { hazardId, controlId: l.controlId, platformId, kind: null, targets: [], off: offThere }) });
    }
    if (offThere) continue;
    const src = get(data, 'ruling', ids.ruling(hazardId, l.controlId, from));
    const there = src && src.status === 'live' ? src : null;
    const id = ids.ruling(hazardId, l.controlId, platformId);
    const here = get(data, 'ruling', id);
    const live = here && here.status === 'live' ? here : null;
    if (!there) {
      if (live) recs.push({ kind: 'ruling', rec: changed(live, act, { status: 'deleted' }) });
      continue;
    }
    if (live && live.state === there.state && (live.reason ?? '') === (there.reason ?? '')) continue;
    const fields = { hazardId, controlId: l.controlId, platformId, state: there.state, reason: there.reason ?? '' };
    recs.push({ kind: 'ruling', rec: here ? changed(here, act, { ...fields, status: 'live' }) : created(act, id, fields) });
  }
  return recs.length ? commit(data, act, `Copy controls from ${name}`, recs) : data;
}

/**
 * The SFARP considerations another platform of the hazard has, in place of these.
 * @param {Data} data @param {Act} act @param {{ hazardId: string, platformId: string, from: string }} args
 */
export function copySfarp(data, act, { hazardId, platformId, from }) {
  const name = copyFrom(data, hazardId, platformId, from);
  const src = get(data, 'sfarp', ids.sfarp(hazardId, from));
  const there = src && src.status === 'live' ? src : { justification: '', conclusion: '', conditions: '' };
  const fields = { justification: there.justification ?? '', conclusion: there.conclusion ?? '', conditions: there.conditions ?? '' };
  const id = ids.sfarp(hazardId, platformId);
  const existing = get(data, 'sfarp', id);
  const rec = existing ? changed(existing, act, { ...fields, status: 'live' }) : created(act, id, { hazardId, platformId, ...fields });
  return commit(data, act, `Copy SFARP from ${name}`, [{ kind: 'sfarp', rec }]);
}

/**
 * How far a control has got on a platform, in words: free text, beside its status.
 * Blank clears it.
 * @param {Data} data @param {Act} act @param {Triple & { text?: unknown }} args
 */
export function setImplementationStatus(data, act, { hazardId, controlId, platformId, text }) {
  needTriple(data, { hazardId, controlId, platformId });
  const id = ids.implementationStatus(hazardId, controlId, platformId);
  const t = String(text ?? '').trim();
  const existing = get(data, 'implementationStatus', id);
  const live = existing && existing.status === 'live' ? existing : null;
  if ((live?.text ?? '') === t) return data;
  const rec = existing ? changed(existing, act, { text: t, status: 'live' }) : created(act, id, { hazardId, controlId, platformId, text: t });
  return commit(data, act, t ? 'Set implementation status' : 'Clear implementation status', [{ kind: 'implementationStatus', rec }]);
}
