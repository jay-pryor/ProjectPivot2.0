import { PivotError } from '../errors.js';
import { newId, hazardLabel } from '../ids.js';
import { get, put, all, live, created, changed, need, needText, NUMBERED } from '../data.js';
import { commit } from '../apply.js';
import { linksTo } from './references.js';
import { platformsOfHazard } from '../queries.js';
import { ids } from '../ids.js';
import { unlinkRecs } from './platforms.js';
import { assignPlatformLetters, assignReportIds } from './report-ids.js';

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

/** The parts of a hazard a reference can support, which take their reference links with them when they go. */
export const LINKABLE_PARTS = Object.freeze(['causalFactor', 'consequence', 'hazardPhase', 'failureMode', 'systemElement', 'affectedGroup']);

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
  // Implementation statuses go with the platform links above (and so are already listed).
  for (const l of live(data, 'hazardPhase')) if (l.hazardId === id) recs.push({ kind: 'hazardPhase', rec: changed(l, act, { status: 'deleted' }) });
  for (const l of live(data, 'optionGroup')) if (l.optionKind === 'hazard' && l.optionId === id) recs.push({ kind: 'optionGroup', rec: changed(l, act, { status: 'deleted' }) });
  for (const r of live(data, 'safetyReport')) if (r.hazardId === id) recs.push({ kind: 'safetyReport', rec: changed(r, act, { status: 'deleted' }) });
  // Every reference link to what goes with it goes too, once each.
  const gone = [{ kind: 'hazard', id }, ...recs.filter((r) => LINKABLE_PARTS.includes(r.kind)).map((r) => ({ kind: r.kind, id: r.rec.id }))];
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
  const plural = kind === 'causalFactor' ? 'causal factors' : 'consequences';
  return {
    /**
     * The text typed, and any entries ticked from those offered (`pick`), added at once.
     * @param {Data} data @param {Act} act
     * @param {{ id?: string, hazardId: string, text?: string, pick?: string | string[], platformId?: string | null }} args
     */
    add(data, act, { id, hazardId, text, pick, platformId }) {
      need(data, 'hazard', hazardId);
      const own = kind === 'causalFactor' ? { platformId: onePlatform(data, hazardId, platformId) } : {};
      const texts = entriesOf(text, pick, `${label} text`);
      let next = data;
      /** @type {{ kind: string, rec: import('../data.js').Rec }[]} */
      const recs = [];
      for (const [n, t] of texts.entries()) {
        // Numbered in the order they are added (CF1, CF2…), which neither the time to the second nor the ids keep.
        const seq = Math.max(0, ...all(next, kind).filter((r) => r.hazardId === hazardId).map((r) => r.seq ?? 0)) + 1;
        const rec = created(act, n === 0 && id ? id : newId(), { hazardId, text: t, seq, ...own });
        next = put(next, kind, rec);
        recs.push({ kind, rec });
      }
      return commit(data, act, texts.length === 1 ? `Add ${lower}` : `Add ${texts.length} ${plural}`, recs);
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
 * What one Add puts in: the text typed, if any, then each entry ticked, trimmed and once each
 * whatever the case. Nothing at all is refused as a missing text.
 * @param {unknown} text @param {unknown} pick one ticked entry, or a list of them @param {string} what e.g. "Causal factor text"
 * @returns {string[]}
 */
function entriesOf(text, pick, what) {
  const picks = Array.isArray(pick) ? pick : pick == null ? [] : [pick];
  /** @type {Map<string, string>} */
  const seen = new Map();
  for (const t of [text, ...picks].map((x) => String(x ?? '').trim())) if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  return seen.size ? [...seen.values()] : [needText('', what)];
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
 * A hazard's entries on one platform, typed freely, kept in the order they were added: how its
 * elements fail, its systems or elements, and the groups it affects. The same entry twice on one platform (in any
 * case) is refused.
 * @param {'failureMode' | 'systemElement' | 'affectedGroup'} kind
 * @param {string} label e.g. "System or element" @param {string} plural e.g. "systems or elements"
 */
function platformListOps(kind, label, plural) {
  const lower = label.toLowerCase();
  /** @param {Data} data @param {Record<string, any>} except @param {string} text */
  const refuseTwice = (data, except, text) => {
    const same = live(data, kind).find((r) => r.id !== except.id && r.hazardId === except.hazardId && r.platformId === except.platformId
      && String(r.text).trim().toLowerCase() === text.toLowerCase());
    if (same) throw new PivotError('duplicate', `“${same.text}” is already here.`);
  };
  return {
    /**
     * The text typed, and any entries ticked from those offered (`pick`), added at once.
     * @param {Data} data @param {Act} act
     * @param {{ id?: string, hazardId: string, platformId: string, text?: string, pick?: string | string[] }} args
     */
    add(data, act, { id, hazardId, platformId, text, pick }) {
      need(data, 'hazard', hazardId);
      const on = onePlatform(data, hazardId, platformId);
      if (!on) throw new PivotError('not-found', 'Choose the platform it is for.');
      const texts = entriesOf(text, pick, `${label} text`);
      let next = data;
      /** @type {{ kind: string, rec: import('../data.js').Rec }[]} */
      const recs = [];
      for (const [n, t] of texts.entries()) {
        const rid = n === 0 && id ? id : newId();
        refuseTwice(next, { id: rid, hazardId, platformId: on }, t);
        const seq = Math.max(0, ...all(next, kind).filter((r) => r.hazardId === hazardId && r.platformId === on).map((r) => r.seq ?? 0)) + 1;
        const rec = created(act, rid, { hazardId, platformId: on, text: t, seq });
        next = put(next, kind, rec);
        recs.push({ kind, rec });
      }
      return commit(data, act, texts.length === 1 ? `Add ${lower}` : `Add ${texts.length} ${plural}`, recs);
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
      return commit(data, act, `Delete ${lower}`, [{ kind, rec: changed(r, act, { status: 'deleted' }) }, ...linksTo(data, act, [{ kind, id }])]);
    },
  };
}

const failures = platformListOps('failureMode', 'Element failure mode', 'element failure modes');
export const addFailureMode = failures.add;
export const updateFailureMode = failures.update;
export const deleteFailureMode = failures.remove;

const systems = platformListOps('systemElement', 'System or element', 'systems or elements');
export const addSystemElement = systems.add;
export const updateSystemElement = systems.update;
export const deleteSystemElement = systems.remove;

const groups = platformListOps('affectedGroup', 'Affected group', 'affected groups');
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
    const fresh = all(d, kind).filter((r) => r.number == null && r.status !== 'deleted');
    if (fresh.length === 0) continue;
    let n = /** @type {number} */ (/** @type {any} */ (d)[counter]);
    for (const r of fresh) d = put(d, kind, { ...r, number: n++ });
    d = { ...d, [counter]: n };
  }
  // Then each hazard's platforms their letters, and safety reports their IDs, which are built from both.
  return assignReportIds(assignPlatformLetters(d));
}

export const assignHazardNumbers = assignNumbers;
