import { get, put } from './data.js';
import { recordChange, RESTAMP } from './history.js';
import { canonicalJson } from './json.js';
import { platformsReached } from './queries.js';

/** @typedef {import('./data.js').Data} Data */
/** @typedef {import('./data.js').Rec} Rec */
/** @typedef {import('./data.js').Act} Act */

/** @param {Rec} r */
function withoutStamp(r) {
  const copy = { ...r };
  for (const f of RESTAMP) delete copy[f];
  return canonicalJson(copy);
}

/**
 * Put the records one user action changed, and record that action in the history. A record
 * whose only difference is its restamp is left as it was; if none changed, `data` comes back.
 * @param {Data} data @param {Act} act @param {string} action
 * @param {{ kind: string, rec: Rec }[]} recs
 * @returns {Data}
 */
export function commit(data, act, action, recs) {
  let next = data;
  /** @type {{ kind: string, before: Rec | null, after: Rec }[]} */
  const pairs = [];
  for (const { kind, rec } of recs) {
    const before = get(data, kind, rec.id) ?? null;
    if (before && withoutStamp(before) === withoutStamp(rec)) continue;
    pairs.push({ kind, before, after: rec });
    next = put(next, kind, rec);
  }
  if (pairs.length === 0) return data;
  const platforms = new Set();
  for (const p of pairs) {
    for (const pl of platformsReached(data, p.kind, p.before ?? p.after)) platforms.add(pl);
    for (const pl of platformsReached(next, p.kind, p.after)) platforms.add(pl);
  }
  return recordChange(next, act, action, pairs, [...platforms]);
}
