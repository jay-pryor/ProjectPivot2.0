import { newId } from './ids.js';
import { get } from './data.js';
import { entries } from './history.js';

/** @typedef {import('./data.js').Data} Data */
/** @typedef {import('./data.js').Act} Act */

/**
 * Actions that never wait for acknowledgement: a review's row-level edits (its start and
 * completion do wait) and producing a report. Written out rather than imported from
 * ops/reviews.js, which would make an import cycle through queries.js.
 */
export const NOT_ACKNOWLEDGED = Object.freeze(['Mark review row', 'Set review outcome', 'Set review notes', 'Produce report']);

/** @param {Data} data @param {any} entry @returns {Data} */
const append = (data, entry) => ({ ...data, history: { ...data.history, [entry.id]: entry } });

/** When acknowledgement started on this data: the earliest start entry. @param {Data} data @returns {string | null} */
export function ackStart(data) {
  let first = null;
  for (const e of Object.values(data.history)) if (e.type === 'acksStarted' && (first === null || e.at < first)) first = e.at;
  return first;
}

/** @param {Data} data @param {Act} act @returns {Data} */
export function startAcks(data, act) {
  if (ackStart(data) !== null) return data;
  return append(data, { id: newId(), type: 'acksStarted', at: act.at, by: act.by });
}

/** @param {any} e a change entry @returns {{ platformId: string, before: any, after: any }[]} its ownerId changes */
function ownerChanges(e) {
  return e.items.filter((/** @type {any} */ i) => i.kind === 'platform').flatMap((/** @type {any} */ i) => i.fields
    .filter((/** @type {any} */ f) => f.field === 'ownerId').map((/** @type {any} */ f) => ({ platformId: i.id, before: f.before, after: f.after })));
}

/**
 * A platform's owner at time `t`: the owner set by its last ownerId change at or before `t`, and the
 * platform's own ownerId from its last change on (a merge may have kept a different transfer than
 * the history's last one); before its first change, that change's `before`; with none, the current
 * owner.
 * @param {Data} data @param {string} platformId @param {string} at @returns {string | null}
 */
export function ownerAt(data, platformId, at) {
  const current = get(data, 'platform', platformId)?.ownerId ?? null;
  const changes = entries(data).filter((e) => e.type === 'change')
    .flatMap((e) => ownerChanges(e).filter((c) => c.platformId === platformId).map((c) => ({ ...c, at: e.at })));
  if (!changes.length) return current;
  const upTo = changes.filter((c) => c.at <= at);
  if (!upTo.length) return changes[0].before;
  return upTo.length === changes.length ? current : upTo[upTo.length - 1].after;
}

/** What waits on every platform, worked out once per version of the data. @type {WeakMap<Data, Map<string, any[]>>} */
const waitingIndex = new WeakMap();

/**
 * One pass over the history, in order: each entry's owner changes apply first (so a transfer
 * waits for the new owner, and an edit after it in the same second is judged by the new owner);
 * a platform's last owner change sets the owner it actually has.
 * @param {Data} data @returns {Map<string, any[]>} platform id → changes waiting there, oldest first
 */
function waitingByPlatform(data) {
  const cached = waitingIndex.get(data);
  if (cached) return cached;
  /** @type {Map<string, any[]>} */
  const out = new Map();
  const start = ackStart(data);
  if (start !== null) {
    const done = new Set(Object.values(data.history).filter((e) => e.type === 'ack').map((e) => `${e.entryId}|${e.platformId}`));
    const changes = entries(data).filter((e) => e.type === 'change');
    /** @type {Map<string, any>} the last entry that changed each platform's owner */
    const last = new Map();
    /** @type {Map<string, string | null>} each platform's owner as the pass goes */
    const owner = new Map();
    for (const e of changes) {
      for (const c of ownerChanges(e)) {
        if (!owner.has(c.platformId)) owner.set(c.platformId, c.before);
        last.set(c.platformId, e);
      }
    }
    const ownerNow = (/** @type {string} */ pid) => (owner.has(pid) ? owner.get(pid) : get(data, 'platform', pid)?.ownerId ?? null);
    for (const e of changes) {
      for (const c of ownerChanges(e)) owner.set(c.platformId, last.get(c.platformId) === e ? get(data, 'platform', c.platformId)?.ownerId ?? c.after : c.after);
      if (e.at < start || NOT_ACKNOWLEDGED.includes(e.action)) continue;
      for (const pid of e.platforms) {
        if (done.has(`${e.id}|${pid}`) || e.by === ownerNow(pid)) continue;
        if (!out.has(pid)) out.set(pid, []);
        /** @type {any[]} */ (out.get(pid)).push(e);
      }
    }
  }
  waitingIndex.set(data, out);
  return out;
}

/** @type {any[]} */
const NONE = /** @type {any[]} */ (Object.freeze([]));

/**
 * The changes waiting for acknowledgement on a platform, oldest first: made since the start, by
 * someone other than the platform's owner at the time, and not yet acknowledged for it.
 * @param {Data} data @param {string} platformId
 */
export function waitingChanges(data, platformId) {
  const p = get(data, 'platform', platformId);
  if (!p || p.status !== 'live') return NONE;
  return waitingByPlatform(data).get(platformId) ?? NONE;
}

/**
 * Acknowledge one change for one platform. Nothing happens when it is not waiting there.
 * @param {Data} data @param {Act} act @param {{ entryId: string, platformId: string }} args
 */
export function acknowledge(data, act, { entryId, platformId }) {
  if (!waitingChanges(data, platformId).some((e) => e.id === entryId)) return data;
  return append(data, { id: newId(), type: 'ack', at: act.at, by: act.by, entryId, platformId });
}

/**
 * Acknowledge several changes at once: every pair still waiting is acknowledged, in one step.
 * @param {Data} data @param {Act} act
 * @param {{ keys: string[] | string }} args `entryId|platformId` pairs, a list or comma-separated
 */
export function acknowledgeAll(data, act, { keys }) {
  const list = Array.isArray(keys) ? keys : String(keys ?? '').split(',').filter(Boolean);
  const history = { ...data.history };
  let added = 0;
  const seen = new Set();
  for (const k of list) {
    const [entryId, platformId] = k.split('|');
    if (seen.has(k) || !waitingChanges(data, platformId).some((e) => e.id === entryId)) continue;
    seen.add(k);
    const id = newId();
    history[id] = { id, type: 'ack', at: act.at, by: act.by, entryId, platformId };
    added += 1;
  }
  return added ? { ...data, history } : data;
}
