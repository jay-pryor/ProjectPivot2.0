import { KINDS, NUMBERED, put } from './data.js';
import { PivotError } from './errors.js';
import { sameJson } from './json.js';
import { checkRules } from './rules.js';
import { ids } from './ids.js';

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

  // A replaced file restarts numbering; a number the other file gave that one of my loaded
  // records already holds is cleared, so the save numbers that record afresh.
  if (missingFromDisk > 0) {
    for (const { kind } of NUMBERED) {
      const held = new Set(Object.values(records[kind]).filter((r) => base.records[kind][r.id] !== undefined && r.number != null).map((r) => r.number));
      for (const r of Object.values(records[kind])) {
        if (base.records[kind][r.id] === undefined && mine.records[kind][r.id] === undefined && r.number != null && held.has(r.number)) {
          records[kind][r.id] = { ...r, number: null };
          conflicts.set(`${kind}:${r.id}`, { kind, id: r.id, reason: 'renumbered', mine: records[kind][r.id], theirs: r, overriddenBy: r.updatedBy });
        }
      }
    }
  }
  keepEndedWorkflows(records, mine, theirs, act, conflicts);

  /** @type {Record<string, number>} */
  const counters = {};
  for (const { kind, counter } of NUMBERED) {
    const highest = Math.max(0, ...Object.values(records[kind]).map((r) => r.number ?? 0));
    counters[counter] = Math.max(/** @type {any} */ (theirs)[counter] ?? 1, /** @type {any} */ (mine)[counter] ?? 1, highest + 1);
  }

  /** @type {Data} */
  let data = {
    records,
    nextHazardNumber: counters.nextHazardNumber,
    nextControlNumber: counters.nextControlNumber,
    nextPlatformNumber: counters.nextPlatformNumber,
    nextReferenceNumber: counters.nextReferenceNumber,
    nextWorkflowNumber: counters.nextWorkflowNumber,
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

/**
 * An ended workflow is never changed again, whichever side saved last. If either side completed it,
 * that side's workflow, its checks and the review it wrote are kept (mine, if both did); failing
 * that, a side that cancelled it. A check only the other side has is dropped. Each record this
 * replaces is a conflict naming whose edit was lost.
 * @param {Data['records']} records the merged records, changed in place
 * @param {Data} mine @param {Data} theirs @param {Act} act
 * @param {Map<string, Conflict>} conflicts
 */
function keepEndedWorkflows(records, mine, theirs, act, conflicts) {
  const is = (/** @type {any} */ w, /** @type {string} */ state) => Boolean(w && w.status === 'live' && w.state === state);
  for (const id of new Set([...Object.keys(mine.records.workflow), ...Object.keys(theirs.records.workflow)])) {
    const m = mine.records.workflow[id];
    const t = theirs.records.workflow[id];
    const src = is(m, 'completed') ? mine : is(t, 'completed') ? theirs : is(m, 'cancelled') ? mine : is(t, 'cancelled') ? theirs : null;
    if (!src) continue;
    const loser = src === mine ? t?.updatedBy ?? null : act.by;
    /** @param {string} kind @param {string} rid @param {any} want */
    const keep = (kind, rid, want) => {
      const cur = records[kind][rid];
      if (sameJson(cur, want)) return;
      records[kind][rid] = want;
      conflicts.set(`${kind}:${rid}`, { kind, id: rid, reason: 'workflow-ended', overriddenBy: loser, mine: mine.records[kind][rid] ?? null, theirs: theirs.records[kind][rid] ?? null });
    };
    keep('workflow', id, src.records.workflow[id]);
    const rid = ids.workflowReview(id);
    if (src.records.review[rid]) keep('review', rid, src.records.review[rid]);
    const stepIds = new Set([...Object.keys(mine.records.workflowStep), ...Object.keys(theirs.records.workflowStep)]
      .filter((sid) => (mine.records.workflowStep[sid] ?? theirs.records.workflowStep[sid]).workflowId === id));
    for (const sid of stepIds) {
      const want = src.records.workflowStep[sid];
      const cur = records.workflowStep[sid];
      if (want) keep('workflowStep', sid, want);
      else if (cur && cur.status !== 'deleted') keep('workflowStep', sid, { ...cur, status: 'deleted', updatedBy: act.by, updatedAt: act.at });
    }
  }
}
