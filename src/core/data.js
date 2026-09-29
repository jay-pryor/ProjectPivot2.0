import { PivotError } from './errors.js';

export const SCHEMA_VERSION = 2;

export const KINDS = Object.freeze([
  'hazard', 'causalFactor', 'consequence', 'control', 'platform',
  'hazardControl', 'hazardPlatform', 'ruling', 'rating', 'report',
  'review', 'reviewRow',
  'reference', 'referenceLink',
  'assessment', 'sfarp', 'existingControl',
]);

export const STATUSES = Object.freeze(['live', 'retired', 'deleted']);

const HEADER_TEXT = ['createdBy', 'createdAt', 'updatedBy', 'updatedAt'];

/** The kinds that get a number a person reads, and the counter that only counts up for each. */
export const NUMBERED = Object.freeze([
  { kind: 'hazard', counter: 'nextHazardNumber' },
  { kind: 'control', counter: 'nextControlNumber' },
  { kind: 'platform', counter: 'nextPlatformNumber' },
  { kind: 'reference', counter: 'nextReferenceNumber' },
]);

/**
 * Bring data written by an earlier version up to date: a kind it has no collection for gets an
 * empty one, and a counter it lacks starts above every number already in use.
 * @param {any} value @returns {any}
 */
export function normalizeData(value) {
  if (!isObject(value) || !isObject(value.records)) return value;
  const records = { ...value.records };
  for (const k of KINDS) if (!isObject(records[k])) records[k] = {};
  // Controls written before tiers existed have none.
  records.control = Object.fromEntries(Object.entries(records.control).map(([id, c]) => [
    id, isObject(c) && !('tier' in c) ? { ...c, tier: null } : c,
  ]));
  // Ratings written before assessments existed become four assessments, personnel and
  // environment alike, and the rating is retired. The same file always converts the same way,
  // so two people opening it write identical records.
  const assessment = { ...records.assessment };
  const rating = { ...records.rating };
  for (const [rid, r] of Object.entries(rating)) {
    if (!isObject(r) || r.status === 'deleted') continue;
    for (const stage of ['initial', 'residual']) {
      for (const receptor of ['personnel', 'environment']) {
        const id = `ra:${r.hazardId}:${r.platformId}:${stage}:${receptor}`;
        if (assessment[id]) continue;
        const pair = isObject(r[stage]) ? r[stage] : null;
        assessment[id] = {
          id, status: r.status, createdBy: r.createdBy, createdAt: r.createdAt, updatedBy: r.updatedBy, updatedAt: r.updatedAt,
          hazardId: r.hazardId, platformId: r.platformId, stage, receptor,
          likelihood: pair?.likelihood ?? null, consequence: pair?.consequence ?? null, likelihoodWhy: '', consequenceWhy: '',
        };
      }
    }
    rating[rid] = { ...r, status: 'deleted' };
  }
  records.assessment = assessment;
  records.rating = rating;
  // Control decisions written before statuses: confirmed is implemented, excluded is rejected.
  const OLD_STATE = { confirmed: 'implemented', excluded: 'rejected' };
  records.ruling = Object.fromEntries(Object.entries(records.ruling).map(([id, r]) => [
    id, isObject(r) && r.state in OLD_STATE ? { ...r, state: OLD_STATE[/** @type {'confirmed'} */ (r.state)] } : r,
  ]));
  // Platforms written before reviews existed have no schedule.
  records.platform = Object.fromEntries(Object.entries(records.platform).map(([id, p]) => [
    id, isObject(p) && !('reviewDue' in p) ? { ...p, reviewMonths: null, reviewDue: null } : p,
  ]));
  const out = { ...value, records };
  for (const { kind, counter } of NUMBERED) {
    if (!Number.isInteger(out[counter])) {
      const used = Object.values(records[kind]).map((r) => (isObject(r) && Number.isInteger(r.number) ? r.number : 0));
      out[counter] = Math.max(0, ...used) + 1;
    }
  }
  return out;
}

/** @typedef {{ by: string, at: string }} Act who is acting, and when (AEST) */
/**
 * @typedef {{ id: string, status: 'live' | 'retired' | 'deleted', createdBy: string, createdAt: string,
 *   updatedBy: string, updatedAt: string, [field: string]: any }} Rec
 */
/**
 * @typedef {{ records: Record<string, Record<string, Rec>>, nextHazardNumber: number, nextControlNumber: number, nextPlatformNumber: number, nextReferenceNumber: number,
 *   history: Record<string, any>, reportDesign: Record<string, any> }} Data
 */

/** @returns {Data} */
export function emptyData() {
  /** @type {Record<string, Record<string, Rec>>} */
  const records = {};
  for (const k of KINDS) records[k] = {};
  return { records, nextHazardNumber: 1, nextControlNumber: 1, nextPlatformNumber: 1, nextReferenceNumber: 1, history: {}, reportDesign: {} };
}

/** @param {unknown} v @returns {v is Record<string, any>} */
export function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Checked once, when a file is opened. After that, ops trust the data they are given.
 * @param {unknown} value
 * @returns {string[]} one line per problem; empty means the data is sound
 */
export function validateData(value) {
  if (!isObject(value)) return ['the data is not an object'];
  const problems = [];
  if (!isObject(value.records)) {
    problems.push('records is missing');
  } else {
    for (const kind of KINDS) {
      const coll = value.records[kind];
      if (!isObject(coll)) { problems.push(`records.${kind} is missing`); continue; }
      for (const [id, rec] of Object.entries(coll)) {
        if (!isObject(rec) || rec.id !== id) { problems.push(`${kind} ${id}: its id does not match its key`); continue; }
        if (!STATUSES.includes(rec.status)) problems.push(`${kind} ${id}: unknown status ${String(rec.status)}`);
        for (const f of HEADER_TEXT) if (typeof rec[f] !== 'string') problems.push(`${kind} ${id}: ${f} is missing`);
      }
    }
    for (const k of Object.keys(value.records)) if (!KINDS.includes(k)) problems.push(`records.${k} is not a record kind`);
  }
  for (const counter of NUMBERED.map((n) => n.counter)) {
    if (!Number.isInteger(value[counter]) || value[counter] < 1) problems.push(`${counter} is not a whole number from 1`);
  }
  if (!isObject(value.history)) problems.push('history is missing');
  if (!isObject(value.reportDesign)) problems.push('reportDesign is missing');
  return problems;
}

/** @param {Data} data @param {string} kind @param {string} id @returns {Rec | undefined} */
export function get(data, kind, id) {
  return data.records[kind][id];
}

/** @param {Rec} a @param {Rec} b */
export function byCreated(a, b) {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Every record of a kind, whatever its status, oldest first. @param {Data} data @param {string} kind */
export function all(data, kind) {
  return Object.values(data.records[kind]).sort(byCreated);
}

/** @param {Data} data @param {string} kind */
export function live(data, kind) {
  return all(data, kind).filter((r) => r.status === 'live');
}

/** @param {Data} data @param {string} kind @param {Rec} rec @returns {Data} */
export function put(data, kind, rec) {
  return { ...data, records: { ...data.records, [kind]: { ...data.records[kind], [rec.id]: rec } } };
}

/** @param {Act} act @param {string} id @param {Record<string, any>} fields @returns {Rec} */
export function created(act, id, fields) {
  return { id, status: 'live', createdBy: act.by, createdAt: act.at, updatedBy: act.by, updatedAt: act.at, ...fields };
}

/** @param {Rec} rec @param {Act} act @param {Record<string, any>} fields @returns {Rec} */
export function changed(rec, act, fields) {
  return { ...rec, ...fields, updatedBy: act.by, updatedAt: act.at };
}

/** @param {Data} data @param {string} kind @param {string} id @returns {Rec} */
export function need(data, kind, id) {
  const r = get(data, kind, id);
  if (!r || r.status === 'deleted') throw new PivotError('not-found', `That ${kind} no longer exists.`, { kind, id });
  return r;
}

/** @param {unknown} value @param {string} what e.g. "A hazard title" @returns {string} */
export function needText(value, what) {
  const t = typeof value === 'string' ? value.trim() : '';
  if (!t) throw new PivotError('empty', `${what} cannot be empty.`);
  return t;
}
