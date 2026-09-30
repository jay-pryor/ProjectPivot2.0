import { PivotError } from '../errors.js';
import { newId, ids } from '../ids.js';
import { get, created, changed, need, needText } from '../data.js';
import { commit } from '../apply.js';
import { needFilters } from '../bowtie.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */

/** A view the acting profile owns; anyone else is told to save a copy. @param {Data} data @param {Act} act @param {string} id */
function mine(data, act, id) {
  const v = need(data, 'bowtieView', id);
  if (v.ownerId !== act.by) throw new PivotError('bowtie.not-owner', `Only its owner can change ${v.name}. Save a copy to make your own.`);
  return v;
}

/** The profiles to share with: each once, in order, never the owner. @param {unknown} list @param {string} owner */
function others(list, owner) {
  const ids = Array.isArray(list) ? list.map(String) : [];
  return [...new Set(ids)].filter((p) => p && p !== owner).sort();
}

/** @param {Data} data @param {Act} act @param {{ id?: string, name: string, hazardId: string, platformId: string, filters: unknown }} args */
export function createBowtieView(data, act, { id = newId(), name, hazardId, platformId, filters }) {
  const link = get(data, 'hazardPlatform', ids.hazardPlatform(hazardId, platformId));
  if (!link || link.status !== 'live') throw new PivotError('bowtie.not-on-platform', 'That hazard is not on that platform, so its bow-tie cannot be saved.');
  const rec = created(act, id, {
    name: needText(name, 'A view name'), ownerId: act.by, hazardId, platformId, filters: needFilters(filters), sharedWith: [],
  });
  return commit(data, act, 'Save bow-tie view', [{ kind: 'bowtieView', rec }]);
}

/** Save new filters, rename, or both. @param {Data} data @param {Act} act @param {{ id: string, name?: string, filters?: unknown }} args */
export function updateBowtieView(data, act, { id, name, filters }) {
  const v = mine(data, act, id);
  /** @type {Record<string, any>} */
  const fields = {};
  if (name !== undefined) fields.name = needText(name, 'A view name');
  if (filters !== undefined) fields.filters = needFilters(filters);
  const action = name !== undefined && filters === undefined ? 'Rename bow-tie view' : 'Save bow-tie view';
  return commit(data, act, action, [{ kind: 'bowtieView', rec: changed(v, act, fields) }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string, sharedWith: unknown }} args */
export function setBowtieSharing(data, act, { id, sharedWith }) {
  const v = mine(data, act, id);
  return commit(data, act, 'Share bow-tie view', [{ kind: 'bowtieView', rec: changed(v, act, { sharedWith: others(sharedWith, v.ownerId) }) }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string }} args */
export function deleteBowtieView(data, act, { id }) {
  const v = mine(data, act, id);
  return commit(data, act, 'Delete bow-tie view', [{ kind: 'bowtieView', rec: changed(v, act, { status: 'deleted' }) }]);
}
