import { PivotError } from '../errors.js';
import { newId, ids } from '../ids.js';
import { get, all, live, created, changed, need, needText } from '../data.js';
import { commit } from '../apply.js';
import { entries, markDeletionRestored } from '../history.js';
import { createPhase, renamePhase, deletePhase } from './phases.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */

/**
 * The facets of a hazard on a platform, configured on the Info page: each has a list of options,
 * and each option can be assigned to platform groups (its presets for platforms of that kind).
 * Lifecycle phases are their own records (hazards tick them); the rest are facetOption records.
 */
export const FACETS = Object.freeze(['causalFactor', 'consequence', 'failureMode', 'systemElement', 'phase', 'affectedGroup']);

/** What one option of each facet is called. */
export const FACET_WORD = Object.freeze({
  causalFactor: 'causal factor', consequence: 'consequence', failureMode: 'element failure mode',
  systemElement: 'system or element', phase: 'lifecycle phase', affectedGroup: 'affected group',
});

/** What several options of each facet are called. */
export const FACET_PLURAL = Object.freeze({
  causalFactor: 'causal factors', consequence: 'consequences', failureMode: 'element failure modes',
  systemElement: 'systems or elements', phase: 'lifecycle phases', affectedGroup: 'affected groups',
});

/**
 * Built in beside the platform groups: an option assigned to it applies to every platform,
 * whatever its groups. It is not a record, so it can be neither renamed nor deleted.
 */
export const ALL_PLATFORMS = Object.freeze({ id: 'all', name: 'All platforms' });

/** The platform group an option is assigned to, or All platforms. @param {Data} data @param {string} groupId */
function needGroup(data, groupId) {
  return groupId === ALL_PLATFORMS.id ? ALL_PLATFORMS : need(data, 'platformGroup', groupId);
}

/** The record kind holding a facet's options. @param {string} facet */
export const optionKind = (facet) => (facet === 'phase' ? 'phase' : 'facetOption');

/** @param {unknown} facet @returns {string} */
function needFacet(facet) {
  if (!FACETS.includes(/** @type {string} */ (facet))) throw new PivotError('facet.unknown', 'That is not a facet.');
  return /** @type {string} */ (facet);
}

/** An option name, trimmed, not blank, and not another option's of the same facet (ignoring case). @param {Data} data @param {string} facet @param {unknown} name @param {string | null} self */
function needName(data, facet, name, self) {
  const n = needText(name, `A ${FACET_WORD[/** @type {'phase'} */ (facet)]}`);
  const clash = all(data, 'facetOption').find((o) => o.status !== 'deleted' && o.facet === facet && o.id !== self && String(o.name).toLowerCase() === n.toLowerCase());
  if (clash) throw new PivotError('facetOption.duplicate', `There is already a ${FACET_WORD[/** @type {'phase'} */ (facet)]} called ${clash.name}.`);
  return n;
}

/** @param {Data} data @param {Act} act @param {{ id?: string, facet: string, name: string }} args */
export function createFacetOption(data, act, { id = newId(), facet, name }) {
  if (needFacet(facet) === 'phase') return createPhase(data, act, { id, name });
  // A position, so the list keeps the order options were added in even within the same second.
  const order = Math.max(0, ...all(data, 'facetOption').filter((o) => o.facet === facet).map((o) => (Number.isInteger(o.order) ? o.order : 0))) + 1;
  return commit(data, act, 'Create facet option', [{ kind: 'facetOption', rec: created(act, id, { facet, name: needName(data, facet, name, null), order }) }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string, facet: string, name: string }} args */
export function renameFacetOption(data, act, { id, facet, name }) {
  if (needFacet(facet) === 'phase') return renamePhase(data, act, { id, name });
  const o = need(data, 'facetOption', id);
  return commit(data, act, 'Rename facet option', [{ kind: 'facetOption', rec: changed(o, act, { name: needName(data, facet, name, id) }) }]);
}

/**
 * Delete an option and its platform group assignments. A lifecycle phase also comes off every
 * hazard it is ticked on. Listed in Deletion history, where it can be restored.
 * @param {Data} data @param {Act} act @param {{ id: string, facet: string }} args
 */
export function deleteFacetOption(data, act, { id, facet }) {
  if (needFacet(facet) === 'phase') return deletePhase(data, act, { id });
  const o = need(data, 'facetOption', id);
  return commit(data, act, 'Delete facet option', [{ kind: 'facetOption', rec: changed(o, act, { status: 'deleted' }) }, ...optionGroupsGone(data, act, id)]);
}

/** The platform group assignments of an option, deleted. @param {Data} data @param {Act} act @param {string} optionId */
export function optionGroupsGone(data, act, optionId) {
  return live(data, 'optionGroup').filter((l) => l.optionId === optionId).map((l) => ({ kind: 'optionGroup', rec: changed(l, act, { status: 'deleted' }) }));
}

/**
 * Assign an option to a platform group, or take it off (`on` false).
 * @param {Data} data @param {Act} act @param {{ facet: string, optionId: string, groupId: string, on: boolean | string }} args
 */
export function setOptionGroup(data, act, { facet, optionId, groupId, on }) {
  const kind = optionKind(needFacet(facet));
  const o = need(data, kind, optionId);
  const g = needGroup(data, groupId);
  const id = ids.optionGroup(optionId, groupId);
  const existing = get(data, 'optionGroup', id);
  if (on === true || on === 'true') {
    if (existing && existing.status === 'live') return data;
    const rec = existing ? changed(existing, act, { status: 'live' }) : created(act, id, { optionKind: kind, optionId, groupId });
    return commit(data, act, `Add ${o.name} to ${g.name}`, [{ kind: 'optionGroup', rec }]);
  }
  if (!existing || existing.status !== 'live') return data;
  return commit(data, act, `Remove ${o.name} from ${g.name}`, [{ kind: 'optionGroup', rec: changed(existing, act, { status: 'deleted' }) }]);
}

/**
 * Assign several of a facet's options to one platform group, as one change; those already in it
 * are left as they are.
 * @param {Data} data @param {Act} act @param {{ facet: string, optionIds: string | string[], groupId: string }} args
 */
export function assignToGroup(data, act, { facet, optionIds, groupId }) {
  const kind = optionKind(needFacet(facet));
  const g = needGroup(data, groupId);
  const list = [...new Set(Array.isArray(optionIds) ? optionIds : String(optionIds ?? '').split(',').filter(Boolean))];
  if (!list.length) throw new PivotError('empty', 'Choose at least one row to assign.');
  /** @type {{ kind: string, rec: any }[]} */
  const recs = [];
  for (const optionId of list) {
    need(data, kind, optionId);
    const id = ids.optionGroup(optionId, groupId);
    const existing = get(data, 'optionGroup', id);
    if (existing && existing.status === 'live') continue;
    recs.push({ kind: 'optionGroup', rec: existing ? changed(existing, act, { status: 'live' }) : created(act, id, { optionKind: kind, optionId, groupId }) });
  }
  return commit(data, act, `Assign ${recs.length === 1 ? `1 ${FACET_WORD[/** @type {'phase'} */ (facet)]}` : `${recs.length} ${FACET_PLURAL[/** @type {'phase'} */ (facet)]}`} to ${g.name}`, recs);
}

/** The actions on Info whose deletions Deletion history lists. */
export const INFO_DELETIONS = Object.freeze(['Delete facet option', 'Delete phase', 'Delete platform group']);

/**
 * Every option or platform group deleted on Info, newest first: the change that deleted it, the
 * record, what went with it, and whether (and by whom) it was restored.
 * @param {Data} data
 */
export function infoDeletions(data) {
  const all = entries(data);
  /** @type {Map<string, { at: string, by: string }>} */
  const restored = new Map();
  for (const e of all) if (e.type === 'deletionRestore') restored.set(e.entryId, { at: e.at, by: e.by });
  return all.filter((e) => e.type === 'change' && INFO_DELETIONS.includes(e.action)).reverse().map((e) => {
    const main = e.items[0];
    const was = Object.fromEntries(main.fields.map((/** @type {any} */ f) => [f.field, f.before]));
    const count = (/** @type {string} */ kind) => e.items.filter((/** @type {any} */ i) => i.kind === kind).length;
    return {
      id: e.id, at: e.at, by: e.by, kind: main.kind, recordId: main.id, name: String(was.name ?? ''), facet: main.kind === 'phase' ? 'phase' : main.kind === 'facetOption' ? String(was.facet) : null,
      createdBy: String(was.createdBy ?? ''), createdAt: String(was.createdAt ?? ''),
      hazards: count('hazardPhase'), groups: count('optionGroup'), platforms: count('platformGroupLink'),
      restored: restored.get(e.id) ?? null,
    };
  });
}

/**
 * Whether a record a deletion took with it can come back: what it joins is still there, or is the
 * record being restored.
 * @param {Data} data @param {string} kind @param {any} rec @param {string} mainId
 */
function canReturn(data, kind, rec, mainId) {
  const there = (/** @type {string} */ k, /** @type {string} */ id) => {
    if (id === mainId) return true;
    const r = get(data, k, id);
    return Boolean(r && r.status !== 'deleted');
  };
  if (kind === 'hazardPhase') return there('hazard', rec.hazardId);
  if (kind === 'optionGroup') return there(rec.optionKind, rec.optionId) && (rec.groupId === ALL_PLATFORMS.id || there('platformGroup', rec.groupId));
  if (kind === 'platformGroupLink') return there('platform', rec.platformId);
  return true;
}

/**
 * Bring back an option or platform group deleted on Info, with what its deletion took with it
 * (its hazard ticks, group assignments, platform tags) where that is still possible.
 * @param {Data} data @param {Act} act @param {{ entryId: string }} args
 */
export function restoreDeletion(data, act, { entryId }) {
  const d = infoDeletions(data).find((x) => x.id === entryId);
  if (!d) throw new PivotError('not-found', 'That deletion no longer exists.');
  if (d.restored) throw new PivotError('not-found', 'That deletion has already been restored.');
  const main = get(data, d.kind, d.recordId);
  if (!main || main.status !== 'deleted') throw new PivotError('not-found', `${d.name} is no longer deleted.`);
  const sameName = (/** @type {any} */ r) => r.status !== 'deleted' && r.id !== main.id && String(r.name).toLowerCase() === d.name.toLowerCase()
    && (d.kind !== 'facetOption' || r.facet === main.facet);
  const clash = all(data, d.kind).find(sameName);
  if (clash) throw new PivotError('restore.duplicate', `There is already one called ${clash.name}. Rename it first.`);
  /** @type {{ kind: string, rec: any }[]} */
  const recs = [{ kind: d.kind, rec: changed(main, act, { status: 'live' }) }];
  const e = data.history[entryId];
  for (const i of e.items.slice(1)) {
    const r = get(data, i.kind, i.id);
    if (i.change === 'deleted' && r && r.status === 'deleted' && canReturn(data, i.kind, r, main.id)) recs.push({ kind: i.kind, rec: changed(r, act, { status: 'live' }) });
  }
  const next = commit(data, act, `Restore ${d.kind === 'platformGroup' ? 'platform group' : FACET_WORD[/** @type {'phase'} */ (d.facet)]}`, recs);
  return markDeletionRestored(next, act, entryId);
}
