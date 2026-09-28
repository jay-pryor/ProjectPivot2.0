import { KINDS, put } from './data.js';
import { PivotError } from './errors.js';
import { sameJson } from './json.js';
import { checkRules } from './rules.js';

/** @typedef {import('./data.js').Data} Data */
/** @typedef {import('./data.js').Act} Act */
/**
 * @typedef {{ kind: string, id: string, reason: string, mine: any, theirs: any, overriddenBy: string | null }} Conflict
 */

/**
 * @template T
 * @param {T} b base @param {T} m mine @param {T} t theirs
 * @param {() => void} onConflict called when both sides changed it differently
 * @returns {T}
 */
function choose(b, m, t, onConflict) {
  const iChanged = !sameJson(b, m);
  const theyChanged = !sameJson(b, t);
  if (!iChanged) return t;
  if (!theyChanged || sameJson(m, t)) return m;
  onConflict();
  return m;
}

/**
 * Merge my working data with what another save put on disk since I loaded `base`. The
 * current save (mine) wins every conflict.
 * @param {Data} base the data as I loaded it @param {Data} mine my working data
 * @param {Data} theirs the data now on disk @param {Act} act the save being made
 * @returns {{ data: Data, conflicts: Conflict[], missingFromDisk: number }}
 */
export function mergeData(base, mine, theirs, act) {
  /** @type {Map<string, Conflict>} */
  const conflicts = new Map();
  /** @type {Data['records']} */
  const records = {};
  // Nothing is ever removed from data.json, so a record I loaded that is missing from disk
  // means the file was replaced (moved away and recreated), not that they deleted it.
  let missingFromDisk = 0;
  for (const kind of KINDS) {
    const b = base.records[kind];
    const m = mine.records[kind];
    const t = theirs.records[kind];
    /** @type {Record<string, any>} */
    const out = {};
    for (const id of new Set([...Object.keys(b), ...Object.keys(m), ...Object.keys(t)])) {
      if (b[id] !== undefined && t[id] === undefined) {
        missingFromDisk += 1;
        out[id] = m[id];
        continue;
      }
      const picked = choose(b[id], m[id], t[id], () => conflicts.set(`${kind}:${id}`, {
        kind, id, reason: 'both-changed', mine: m[id] ?? null, theirs: t[id] ?? null, overriddenBy: t[id]?.updatedBy ?? null,
      }));
      if (picked !== undefined) out[id] = picked;
    }
    records[kind] = out;
  }
  const reportDesign = choose(base.reportDesign, mine.reportDesign, theirs.reportDesign, () => conflicts.set('reportDesign:reportDesign', {
    kind: 'reportDesign', id: 'reportDesign', reason: 'both-changed', mine: mine.reportDesign, theirs: theirs.reportDesign, overriddenBy: null,
  }));

  // A replaced file restarts hazard numbering; a number the other file gave that one of my
  // loaded hazards already holds is cleared, so the save numbers that hazard afresh.
  if (missingFromDisk > 0) {
    const held = new Set(Object.values(records.hazard).filter((h) => base.records.hazard[h.id] !== undefined && h.number != null).map((h) => h.number));
    for (const h of Object.values(records.hazard)) {
      if (base.records.hazard[h.id] === undefined && mine.records.hazard[h.id] === undefined && h.number != null && held.has(h.number)) {
        records.hazard[h.id] = { ...h, number: null };
        conflicts.set(`hazard:${h.id}`, { kind: 'hazard', id: h.id, reason: 'renumbered', mine: records.hazard[h.id], theirs: h, overriddenBy: h.updatedBy });
      }
    }
  }
  const highest = Math.max(0, ...Object.values(records.hazard).map((h) => h.number ?? 0));

  /** @type {Data} */
  let data = {
    records,
    nextHazardNumber: Math.max(theirs.nextHazardNumber, mine.nextHazardNumber, highest + 1),
    history: { ...theirs.history, ...mine.history },
    reportDesign: reportDesign ?? {},
  };

  // Two changes that were each fine can break a rule together. Each record in a broken rule
  // takes my version; a record I do not have is marked deleted. Repeat, since one fix can
  // expose another (a deleted hazard, then its causal factor).
  for (let pass = 0; pass < 10; pass++) {
    const violations = checkRules(data);
    if (violations.length === 0) return { data, conflicts: [...conflicts.values()], missingFromDisk };
    for (const v of violations) {
      for (const { kind, id } of v.records) {
        const m = mine.records[kind][id];
        const cur = data.records[kind][id];
        if (sameJson(m, cur)) continue;
        if (!m && (!cur || cur.status === 'deleted')) continue;
        const key = `${kind}:${id}`;
        if (!conflicts.has(key)) {
          conflicts.set(key, { kind, id, reason: `rule:${v.rule}`, mine: m ?? null, theirs: cur ?? null, overriddenBy: cur?.updatedBy ?? null });
        }
        data = put(data, kind, m ?? { ...cur, status: 'deleted', updatedBy: act.by, updatedAt: act.at });
      }
    }
  }
  throw new PivotError('merge.rules', 'Your changes and the other saves could not be combined without breaking a rule. Nothing was saved.', { violations: checkRules(data) });
}
