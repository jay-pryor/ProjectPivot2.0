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
export const NOT_ACKNOWLEDGED = Object.freeze(['Mark review row', 'Set review outcome', 'Produce report']);

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

/**
 * A platform's owner over time, from its history's ownerId changes: at `t`, the owner set by the
 * last change at or before `t`; before the first change, that change's `before`; with none, the
 * current owner.
 * @param {Data} data @param {string} platformId @returns {(t: string) => string | null}
 */
function ownerTimeline(data, platformId) {
  const current = get(data, 'platform', platformId)?.ownerId ?? null;
  const changes = entries(data).filter((e) => e.type === 'change').flatMap((e) => e.items
    .filter((/** @type {any} */ i) => i.kind === 'platform' && i.id === platformId)
    .flatMap((/** @type {any} */ i) => i.fields.filter((/** @type {any} */ f) => f.field === 'ownerId').map((/** @type {any} */ f) => ({ at: e.at, before: f.before, after: f.after }))));
  return (t) => {
    const upTo = changes.filter((c) => c.at <= t);
    if (upTo.length) return upTo[upTo.length - 1].after;
    return changes.length ? changes[0].before : current;
  };
}

/** @param {Data} data @param {string} platformId @param {string} at @returns {string | null} */
export function ownerAt(data, platformId, at) {
  return ownerTimeline(data, platformId)(at);
}

/** @param {Data} data @returns {Set<string>} `entryId|platformId` for every ack */
function acked(data) {
  return new Set(Object.values(data.history).filter((e) => e.type === 'ack').map((e) => `${e.entryId}|${e.platformId}`));
}

/**
 * The changes waiting for acknowledgement on a platform, oldest first: made since the start, by
 * someone other than the platform's owner at the time, and not yet acknowledged for it.
 * @param {Data} data @param {string} platformId
 */
export function waitingChanges(data, platformId) {
  const p = get(data, 'platform', platformId);
  const start = ackStart(data);
  if (!p || p.status !== 'live' || start === null) return [];
  const done = acked(data);
  const owner = ownerTimeline(data, platformId);
  return entries(data).filter((e) => e.type === 'change' && e.platforms.includes(platformId) && e.at >= start
    && !NOT_ACKNOWLEDGED.includes(e.action) && !done.has(`${e.id}|${platformId}`) && e.by !== owner(e.at));
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
 * @param {Data} data @param {Act} act
 * @param {{ keys: string[] | string }} args `entryId|platformId` pairs, a list or comma-separated
 */
export function acknowledgeAll(data, act, { keys }) {
  const list = Array.isArray(keys) ? keys : String(keys ?? '').split(',').filter(Boolean);
  let d = data;
  for (const k of list) {
    const [entryId, platformId] = k.split('|');
    d = acknowledge(d, act, { entryId, platformId });
  }
  return d;
}
