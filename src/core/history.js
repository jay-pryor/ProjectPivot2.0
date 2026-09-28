import { newId } from './ids.js';
import { canonicalJson } from './json.js';

/** @typedef {import('./data.js').Data} Data */
/** @typedef {import('./data.js').Rec} Rec */
/** @typedef {import('./data.js').Act} Act */

/** Restamped on every edit, and the entry's own `by` and `at` already say who and when. */
export const RESTAMP = Object.freeze(['updatedBy', 'updatedAt']);

/** @param {Rec | null} before @param {Rec} after */
export function changeOf(before, after) {
  if (!before) return 'created';
  if (after.status !== before.status) {
    if (after.status === 'deleted') return 'deleted';
    if (after.status === 'retired') return 'retired';
    return 'restored';
  }
  return 'edited';
}

/**
 * @param {string} kind @param {Rec | null} before @param {Rec} after
 * @returns {{ kind: string, id: string, change: string, fields: { field: string, before: any, after: any }[] }}
 */
export function itemOf(kind, before, after) {
  const change = changeOf(before, after);
  const b = before ?? /** @type {Record<string, any>} */ ({});
  const names = [...new Set([...Object.keys(b), ...Object.keys(after)])].filter((f) => !RESTAMP.includes(f)).sort();
  const everything = change === 'created' || change === 'deleted';
  const fields = [];
  for (const field of names) {
    if (!everything && canonicalJson(b[field]) === canonicalJson(after[field])) continue;
    fields.push({
      field,
      before: field in b ? structuredClone(b[field]) : null,
      after: field in after ? structuredClone(after[field]) : null,
    });
  }
  return { kind, id: after.id, change, fields };
}

/** @param {Data} data @param {any} entry @returns {Data} */
function append(data, entry) {
  return { ...data, history: { ...data.history, [entry.id]: entry } };
}

/**
 * @param {Data} data @param {Act} act @param {string} action what the user did, e.g. "Edit hazard"
 * @param {{ kind: string, before: Rec | null, after: Rec }[]} pairs
 * @param {string[]} platforms every platform the action reaches
 * @returns {Data}
 */
export function recordChange(data, act, action, pairs, platforms) {
  const items = pairs.map((p) => itemOf(p.kind, p.before, p.after));
  if (items.length === 0) return data;
  return append(data, {
    id: newId(), type: 'change', at: act.at, by: act.by, action, items,
    platforms: [...new Set(platforms)].sort(),
  });
}

/**
 * Every entry, oldest first. Entries made in the same second keep the order they were made in:
 * the history object keeps insertion order, and the sort is stable.
 * @param {Data} data
 */
export function entries(data) {
  return Object.values(data.history).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/** @param {Data} data @param {string} kind @param {string} id */
export function historyOf(data, kind, id) {
  return entries(data).filter((e) => e.type === 'change' && e.items.some((/** @type {any} */ i) => i.kind === kind && i.id === id));
}

/**
 * @param {Data} data @param {Act} act the saving user
 * @param {{ kind: string, id: string, reason: string, overriddenBy: string | null, theirs: any, mine: any }[]} conflicts
 */
export function recordOverride(data, act, conflicts) {
  return append(data, {
    id: newId(), type: 'override', at: act.at, by: act.by,
    items: conflicts.map((c) => ({ kind: c.kind, id: c.id, reason: c.reason, overriddenBy: c.overriddenBy, theirs: c.theirs, mine: c.mine })),
  });
}

/**
 * The override entries naming this profile that it has not yet seen, each cut down to that
 * profile's own items.
 * @param {Data} data @param {string} profileId
 */
export function unseenOverrides(data, profileId) {
  const all = entries(data);
  const seen = new Set(all.filter((e) => e.type === 'noticeSeen' && e.by === profileId).map((e) => e.entryId));
  return all
    .filter((e) => e.type === 'override' && !seen.has(e.id))
    .map((e) => ({ ...e, items: e.items.filter((/** @type {any} */ i) => i.overriddenBy === profileId) }))
    .filter((e) => e.items.length > 0);
}

/** @param {Data} data @param {Act} act @param {string[]} entryIds */
export function markNoticesSeen(data, act, entryIds) {
  let d = data;
  for (const entryId of entryIds) d = append(d, { id: newId(), type: 'noticeSeen', at: act.at, by: act.by, entryId });
  return d;
}
