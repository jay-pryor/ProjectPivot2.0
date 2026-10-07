import { PivotError } from '../errors.js';
import { newId, ids } from '../ids.js';
import { get, all, live, created, changed, need, needText } from '../data.js';
import { commit } from '../apply.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */

/**
 * Platform groups (e.g. UAS, Ground vehicles) tag platforms of a kind; a platform can be in any
 * number of them. Later they will carry preset facets (causal factors, consequences…) for their platforms.
 */

/** A group name, trimmed, not blank, and not another group's (ignoring case). @param {Data} data @param {unknown} name @param {string | null} self */
function needName(data, name, self) {
  const n = needText(name, 'A group name');
  const clash = all(data, 'platformGroup').find((g) => g.status !== 'deleted' && g.id !== self && String(g.name).toLowerCase() === n.toLowerCase());
  if (clash) throw new PivotError('platformGroup.duplicate', `There is already a group called ${clash.name}.`);
  return n;
}

/** @param {Data} data @param {Act} act @param {{ id?: string, name: string }} args */
export function createPlatformGroup(data, act, { id = newId(), name }) {
  // A position, so the list keeps the order groups were added in even within the same second.
  const order = Math.max(0, ...all(data, 'platformGroup').map((g) => (Number.isInteger(g.order) ? g.order : 0))) + 1;
  return commit(data, act, 'Create platform group', [{ kind: 'platformGroup', rec: created(act, id, { name: needName(data, name, null), order }) }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string, name: string }} args */
export function renamePlatformGroup(data, act, { id, name }) {
  const g = need(data, 'platformGroup', id);
  return commit(data, act, 'Rename platform group', [{ kind: 'platformGroup', rec: changed(g, act, { name: needName(data, name, id) }) }]);
}

/** Deleting a group takes its tag off every platform in it, and its options out of it. @param {Data} data @param {Act} act @param {{ id: string }} args */
export function deletePlatformGroup(data, act, { id }) {
  const g = need(data, 'platformGroup', id);
  const links = ['platformGroupLink', 'optionGroup'].flatMap((kind) => live(data, kind).filter((l) => l.groupId === id).map((l) => ({ kind, rec: changed(l, act, { status: 'deleted' }) })));
  return commit(data, act, 'Delete platform group', [{ kind: 'platformGroup', rec: changed(g, act, { status: 'deleted' }) }, ...links]);
}

/** @param {Data} data @param {Act} act @param {{ platformId: string, groupId: string }} args */
export function tagPlatform(data, act, { platformId, groupId }) {
  need(data, 'platform', platformId);
  need(data, 'platformGroup', groupId);
  const id = ids.platformGroupLink(platformId, groupId);
  const existing = get(data, 'platformGroupLink', id);
  if (existing && existing.status === 'live') return data;
  const rec = existing ? changed(existing, act, { status: 'live' }) : created(act, id, { platformId, groupId });
  return commit(data, act, 'Add to platform group', [{ kind: 'platformGroupLink', rec }]);
}

/** @param {Data} data @param {Act} act @param {{ platformId: string, groupId: string }} args */
export function untagPlatform(data, act, { platformId, groupId }) {
  const l = need(data, 'platformGroupLink', ids.platformGroupLink(platformId, groupId));
  return commit(data, act, 'Remove from platform group', [{ kind: 'platformGroupLink', rec: changed(l, act, { status: 'deleted' }) }]);
}
