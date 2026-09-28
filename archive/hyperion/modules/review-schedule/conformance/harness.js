/**
 * Test support for the review-schedule conformance suite (CORE-CON-002). Not a test file: the
 * runner collects `*.test.js` only.
 *
 * Section 2 of modules/review-schedule/CONTRACT.md: a conformance test starts from
 * `schema.emptyDataBody()` or a body it builds, holds the baseline clock where a clause names
 * it, and needs no folder and no module but `change-log`. The refs it schedules are
 * `RecordRef` values built here, and the entries its acts wrote are read back through
 * `change-log`'s own contract and never from `collections['change-log-entry']` directly. So
 * this file imports only what modules/review-schedule/manifest.yaml declares
 * (CORE-CON-003, `declared`): baseline/types, baseline/schema, baseline/clock, and
 * modules/change-log/contract.
 *
 * Provides: profiles, platform ids, refs of each schedulable kind, and ids chosen to sort in a
 * known order; schedules and bodies built directly, so a malformed or retired schedule and an
 * ordering by id can be tested without assuming what `fresh` returns (DEC-005); the DEC-019
 * month model and the C-009 and C-010 overdue models, used by the property tests; the C-012
 * check that an act wrote its one entry; the "body is a value" helpers of C-002; a seeded
 * generator (CORE-TST-001: the seed is fixed and recorded); and a spy on the browser's storage
 * for C-003.
 */

import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

import { fixClock, releaseClock } from '../../../baseline/clock.js';
import * as schema from '../../../baseline/schema.js';
import { RECORD_KINDS, dateAest, platformId, reviewScheduleId, timestampAest, userProfileId } from '../../../baseline/types.js';
import * as changeLog from '../../change-log/contract.js';

/** @typedef {import('../../../baseline/types.js').ActiveProfile} ActiveProfile */
/** @typedef {import('../../../baseline/types.js').PlatformId} PlatformId */
/** @typedef {import('../../../baseline/types.js').RecordKind} RecordKind */
/** @typedef {import('../../../baseline/types.js').RecordRef} RecordRef */
/** @typedef {import('../../../baseline/types.js').RecordStatus} RecordStatus */
/** @typedef {import('../../../baseline/types.js').DateAest} DateAest */
/** @typedef {import('../../../baseline/types.js').TimestampAest} TimestampAest */
/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */
/** @typedef {import('../contract.js').ReviewSchedule} ReviewSchedule */
/** @typedef {import('../contract.js').ReviewState} ReviewState */
/** @typedef {import('../contract.js').ScheduleAct} ScheduleAct */
/** @typedef {import('../../change-log/contract.js').ChangeLogEntry} ChangeLogEntry */
/** @typedef {import('../../change-log/contract.js').RecordChangeEntry} RecordChangeEntry */

/** The one seed this suite's property tests use (CORE-TST-001); change it only on purpose, and record why. */
export const SEED = 0x52565743;

export const KIND = /** @type {const} */ ('review-schedule');
export const LOG = /** @type {const} */ ('change-log-entry');

/** The four kinds C-011 schedules, written out here rather than read from the contract, so the suite checks the constant too. */
export const FOUR_KINDS = Object.freeze(/** @type {RecordKind[]} */ (['hazard', 'control', 'platform', 'reference-entry']));

/** Every baseline kind C-011 refuses. */
export const UNSCHEDULABLE_KINDS = Object.freeze(RECORD_KINDS.filter((k) => !FOUR_KINDS.includes(k)));

// ------------------------------------------------------------------ profiles, ids, refs, and time

/**
 * The profile a session acts as, as `views` would pass it on (REQ-055).
 * @param {string} name
 * @returns {ActiveProfile}
 */
export function newProfile(name) {
  return { id: userProfileId.fresh(), name };
}

/**
 * A valid UUID whose string order is the order of `n`, for ids a test needs sorted; `salt`
 * keeps ids of different uses apart.
 * @param {number} n 0 to 2^32 - 1
 * @param {number} [salt] 0 to 15
 * @returns {string}
 */
export function orderedUuid(n, salt = 0) {
  return `${n.toString(16).padStart(8, '0')}-0000-4000-8000-${salt.toString(16).padStart(12, '0')}`;
}

/**
 * A platform id whose order is the order of `n`.
 * @param {number} n
 * @returns {PlatformId}
 */
export function platformNo(n) {
  return platformId.parse(orderedUuid(n, 0xa));
}

/**
 * A ref of one of the kinds, with an id the owning module might give it: `H-nnnn` for a
 * hazard, a UUID for the rest. Nothing here resolves it (C-011).
 * @param {RecordKind} kind
 * @param {number} n
 * @returns {RecordRef}
 */
export function refTo(kind, n) {
  return { kind, id: kind === 'hazard' ? `H-${String(n).padStart(4, '0')}` : orderedUuid(n, 0xb) };
}

/**
 * One act (section 3). Both platform fields are always given, as C-012 requires.
 * @param {ActiveProfile} profile
 * @param {PlatformId | null} [madeFor]
 * @param {PlatformId[]} [affected]
 * @returns {ScheduleAct}
 */
export function actOf(profile, madeFor = null, affected = []) {
  return { profile, madeForPlatformId: madeFor, affectedPlatformIds: affected };
}

/** @type {TimestampAest} a time no test's clock is held at, for schedules a body starts with */
export const EARLIER = timestampAest('2026-01-05T08:00:00+10:00');

/** @type {TimestampAest} the time most tests hold the clock at */
export const HELD = timestampAest('2026-09-15T10:30:00+10:00');

/**
 * A time on `date`, at noon unless another time of day is given.
 * @param {string} date `YYYY-MM-DD`
 * @param {string} [time] `HH:mm:ss`
 * @returns {TimestampAest}
 */
export function on(date, time = '12:00:00') {
  return timestampAest(`${date}T${time}+10:00`);
}

/**
 * Run `fn` with the baseline clock held at `ts`, releasing it after whatever happens.
 * @template T
 * @param {TimestampAest} ts
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withClock(ts, fn) {
  fixClock(ts);
  try {
    return await fn();
  } finally {
    releaseClock();
  }
}

// ------------------------------------------------------------------ dates (DEC-019, C-009)

/**
 * @param {number} year
 * @param {number} month 1 to 12
 * @returns {number}
 */
function daysIn(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * DEC-019's arithmetic: `n` calendar months later, the same day of the month, or that month's
 * last day when it has fewer. The model the property tests compare against; the operations
 * file writes its cases out literally.
 * @param {string} date `YYYY-MM-DD`
 * @param {number} n
 * @returns {DateAest}
 */
export function plusMonths(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const index = (m - 1) + n;
  const ty = y + Math.floor(index / 12);
  const tm = (index % 12) + 1;
  const day = Math.min(d, daysIn(ty, tm));
  return dateAest(`${String(ty).padStart(4, '0')}-${String(tm).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
}

/**
 * `date` plus `n` days, which may be negative.
 * @param {string} date `YYYY-MM-DD`
 * @param {number} n
 * @returns {DateAest}
 */
export function plusDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return dateAest(new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10));
}

// ------------------------------------------------------------------ schedules and bodies built directly

/**
 * A stored schedule, for bodies a test builds rather than sets.
 * @param {string} id
 * @param {ActiveProfile} by
 * @param {RecordRef} ref
 * @param {number} tempoMonths
 * @param {string} nextDueAest
 * @param {{ status?: RecordStatus, lastReviewedAest?: string | null, at?: TimestampAest }} [options]
 * @returns {ReviewSchedule}
 */
export function scheduleRow(id, by, ref, tempoMonths, nextDueAest, options = {}) {
  const at = options.at ?? EARLIER;
  return /** @type {ReviewSchedule} */ ({
    id,
    kind: KIND,
    status: options.status ?? 'live',
    createdBy: by.id,
    createdAtAest: at,
    updatedBy: by.id,
    updatedAtAest: at,
    ref,
    tempoMonths,
    nextDueAest,
    lastReviewedAest: options.lastReviewedAest ?? null,
  });
}

/**
 * A body holding these schedules under their ids, and any other collections as given. No
 * schedules gives a body with no review-schedule collection.
 * @param {ReviewSchedule[]} schedules
 * @param {Record<string, unknown>} [otherCollections]
 * @returns {DataBody}
 */
export function bodyOf(schedules, otherCollections = {}) {
  const collections = /** @type {Record<string, unknown>} */ ({ ...otherCollections });
  if (schedules.length > 0) collections[KIND] = Object.fromEntries(schedules.map((s) => [s.id, s]));
  return /** @type {DataBody} */ (/** @type {unknown} */ ({ collections, sequences: { hazard: 1 } }));
}

/**
 * The entries of a body's review-schedule collection, whatever their shape. This module's own
 * collection, read directly only to check where and under what key a schedule is stored (C-001).
 * @param {DataBody} body
 * @returns {Record<string, any>}
 */
export function schedulesIn(body) {
  return /** @type {Record<string, any>} */ (/** @type {any} */ (body.collections)[KIND] ?? {});
}

/**
 * A change-log entry `change-log` C-008 refuses — a record change with no items — for the
 * `MalformedEntryError` of section 4.
 * @param {ActiveProfile} by
 * @returns {Record<string, unknown>} the collection holding it, keyed by its id
 */
export function malformedLog(by) {
  const id = orderedUuid(1, 0xe);
  return {
    [id]: {
      id, kind: LOG, status: 'live', createdBy: by.id, createdAtAest: EARLIER, updatedBy: by.id, updatedAtAest: EARLIER,
      entryKind: 'record-change', items: [], madeForPlatformId: null, affectedPlatformIds: [],
    },
  };
}

// ------------------------------------------------------------------ the list models (C-001, C-009, C-010)

/**
 * @param {ReviewSchedule} a
 * @param {ReviewSchedule} b
 * @returns {number} ascending `nextDueAest`, then id
 */
export function byDueThenId(a, b) {
  if (a.nextDueAest !== b.nextDueAest) return a.nextDueAest < b.nextDueAest ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * @param {DataBody} body
 * @returns {ReviewSchedule[]} what C-001 says `listSchedules` gives
 */
export function schedulesModel(body) {
  return Object.values(schedulesIn(body)).filter((s) => s.status === 'live').sort(byDueThenId);
}

/**
 * @param {DataBody} body
 * @param {string} today
 * @returns {ReviewState[]} what C-010 says `listOverdue` gives with the clock at `today`
 */
export function overdueModel(body, today) {
  return schedulesModel(body)
    .filter((s) => s.nextDueAest < today)
    .map((s) => ({ ref: s.ref, schedule: s, overdue: true, asAtAest: /** @type {DateAest} */ (today) }));
}

// ------------------------------------------------------------------ the body is a value (C-002)

/**
 * A deep copy: what a value was, to compare against after a call.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function snapshot(value) {
  return structuredClone(value);
}

/**
 * The body after a JSON serialise and parse, as `store` C-001 carries it.
 * @param {DataBody} body
 * @returns {DataBody}
 */
export function jsonRoundTrip(body) {
  return JSON.parse(JSON.stringify(body));
}

/**
 * Freeze a value and everything reachable from it, so a mutation throws instead of passing
 * unseen. Used beside, never instead of, the deep-equal check of C-002.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/**
 * Where two bodies differ, outside the change-log collection: `collection/key` for an entry
 * added, removed, or changed, the collection's name for a collection that is not a map, and
 * `sequences.name` for a sequence.
 * @param {DataBody} input
 * @param {DataBody} output
 * @returns {string[]}
 */
export function differences(input, output) {
  /** @type {string[]} */
  const out = [];
  const isMap = (/** @type {unknown} */ v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const ic = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (input.collections));
  const oc = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (output.collections ?? {}));
  for (const name of new Set([...Object.keys(ic), ...Object.keys(oc)])) {
    if (name === LOG) continue;
    const a = ic[name];
    const b = oc[name];
    if ((a === undefined || isMap(a)) && (b === undefined || isMap(b))) {
      const am = /** @type {Record<string, unknown>} */ (a ?? {});
      const bm = /** @type {Record<string, unknown>} */ (b ?? {});
      for (const key of new Set([...Object.keys(am), ...Object.keys(bm)])) {
        const inA = Object.prototype.hasOwnProperty.call(am, key);
        const inB = Object.prototype.hasOwnProperty.call(bm, key);
        if (inA !== inB || !isDeepStrictEqual(am[key], bm[key])) out.push(`${name}/${key}`);
      }
    } else if (!isDeepStrictEqual(a, b)) {
      out.push(name);
    }
  }
  const is = /** @type {Record<string, unknown>} */ (input.sequences ?? {});
  const os = /** @type {Record<string, unknown>} */ (output.sequences ?? {});
  for (const name of new Set([...Object.keys(is), ...Object.keys(os)])) if (!isDeepStrictEqual(is[name], os[name])) out.push(`sequences.${name}`);
  return out.sort();
}

// ------------------------------------------------------------------ the entry an act wrote (C-012)

/**
 * The item `change-log` gives for one record handed to it (change-log C-002, C-004, C-005):
 * the action from the status transition; for `edited`, one field change per field whose values
 * differ, for the other three, one per field of either side; ascending by field; never
 * `updatedBy` or `updatedAtAest`.
 * @param {any} before
 * @param {any} after
 * @returns {import('../../change-log/contract.js').ChangedItem}
 */
export function expectedItem(before, after) {
  const action = before === null ? 'created'
    : after.status === 'deleted' && before.status !== 'deleted' ? 'deleted'
      : after.status === 'retired' && before.status !== 'retired' ? 'retired'
        : 'edited';
  const b = before ?? {};
  const names = [...new Set([...Object.keys(b), ...Object.keys(after)])].filter((f) => f !== 'updatedBy' && f !== 'updatedAtAest').sort();
  /** @type {any[]} */
  const fields = [];
  for (const field of names) {
    const inB = Object.prototype.hasOwnProperty.call(b, field);
    const inA = Object.prototype.hasOwnProperty.call(after, field);
    if (action === 'edited' && inB === inA && isDeepStrictEqual(b[field], after[field])) continue;
    fields.push({ field, before: inB ? b[field] : null, after: inA ? after[field] : null });
  }
  return /** @type {any} */ ({ ref: { kind: after.kind, id: after.id }, action, fields });
}

/**
 * The entries of `output` that `input` did not hold, read through `change-log`'s contract
 * (section 2), after checking every entry `input` held is still there as it was.
 * @param {DataBody} input
 * @param {DataBody} output
 * @param {string} what
 * @returns {Promise<ChangeLogEntry[]>}
 */
export async function addedEntries(input, output, what) {
  const had = [...(await changeLog.listEntries(input))];
  const has = [...(await changeLog.listEntries(output))];
  for (const e of had) assert.deepEqual(has.find((x) => x.id === e.id), e, `${what}: entry ${e.id} is still in the log as it was`);
  return has.filter((e) => !had.some((x) => x.id === e.id));
}

/**
 * Check C-012 for one resolved changing call: `output` holds exactly one entry `input` did
 * not, stamped with the act's profile and `at`, whose one item is `before` to `after`, and
 * whose platform fields are the act's (the list as `change-log` C-001 keeps it: duplicates
 * removed, ascending). Returns the entry.
 * @param {DataBody} input
 * @param {DataBody} output
 * @param {{ act: ScheduleAct, at: TimestampAest, before: ReviewSchedule | null, after: ReviewSchedule, what?: string }} expected
 * @returns {Promise<RecordChangeEntry>}
 */
export async function assertRecorded(input, output, expected) {
  const what = expected.what ?? 'the act';
  const added = await addedEntries(input, output, what);
  assert.equal(added.length, 1, `${what}: exactly one entry is added to the log (C-012), got ${added.length}`);
  const entry = /** @type {RecordChangeEntry} */ (added[0]);
  assert.equal(entry.entryKind, 'record-change', `${what}: the entry is a record change`);
  assert.equal(entry.createdBy, expected.act.profile.id, `${what}: the entry is stamped with act.profile`);
  assert.equal(entry.createdAtAest, expected.at, `${what}: the entry is stamped with the clock's now`);
  assert.equal(entry.madeForPlatformId, expected.act.madeForPlatformId, `${what}: madeForPlatformId is act.madeForPlatformId unchanged`);
  assert.deepEqual([...entry.affectedPlatformIds], [...new Set(expected.act.affectedPlatformIds)].sort(), `${what}: affectedPlatformIds is act.affectedPlatformIds, not derived`);
  assert.deepEqual(entry.items, [expectedItem(expected.before, expected.after)], `${what}: the one item is the schedule as it was and as it now is`);
  return entry;
}

/**
 * Check that a call recorded nothing.
 * @param {DataBody} input
 * @param {DataBody} output
 * @param {string} what
 */
export async function assertNothingRecorded(input, output, what) {
  assert.deepEqual(await addedEntries(input, output, what), [], `${what}: no entry was written`);
}

// ------------------------------------------------------------------ rejections

/**
 * The error a call rejects with; fails the test if it resolves.
 * @param {() => Promise<unknown>} call
 * @param {string} [what]
 * @returns {Promise<any>}
 */
export async function rejectionOf(call, what = 'the call') {
  /** @type {unknown} */
  let error = null;
  let rejected = false;
  await call().then(
    (value) => { throw new Error(`${what} resolved with ${JSON.stringify(value)}; a rejection was expected`); },
    (e) => { error = e; rejected = true; },
  );
  if (!rejected) throw new Error(`${what} did not reject`);
  return error;
}

/**
 * Check that a call rejects with `type` and leaves `body` deep-equal to what it was (section 4).
 * @param {() => Promise<unknown>} call
 * @param {Function} type
 * @param {DataBody} body
 * @param {string} what
 * @returns {Promise<any>} the error
 */
export async function assertRefused(call, type, body, what) {
  const before = snapshot(body);
  const e = await rejectionOf(call, what);
  assert.ok(e instanceof type, `${what}: rejects with ${type.name}, got ${String(e)}`);
  assert.deepEqual(body, before, `${what}: body unchanged`);
  return e;
}

// ------------------------------------------------------------------ seeded randomness (CORE-TST-001)

/**
 * mulberry32: small, deterministic, good enough to pick cases with.
 * @param {number} seed
 * @returns {() => number} uniform in [0, 1)
 */
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {() => number} random
 * @param {number} maxExclusive
 * @returns {number}
 */
export function pick(random, maxExclusive) {
  return Math.floor(random() * maxExclusive);
}

/**
 * @template T
 * @param {() => number} random
 * @param {readonly T[]} list
 * @returns {T}
 */
export function oneOf(random, list) {
  return list[pick(random, list.length)];
}

/**
 * A calendar date between 2024 and 2031, with the days a month clamps on (29 to 31) drawn
 * often, since those are where DEC-019 bites.
 * @param {() => number} random
 * @returns {DateAest}
 */
export function randomDate(random) {
  const y = 2024 + pick(random, 8);
  const m = 1 + pick(random, 12);
  const last = daysIn(y, m);
  const d = random() < 0.4 ? last - pick(random, Math.min(3, last - 27)) : 1 + pick(random, last);
  return dateAest(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
}

/**
 * Collections of other kinds, as some other module might store them: deliberately not
 * well-formed records, because C-002 promises this module carries them through unread.
 * @param {() => number} random
 * @returns {Record<string, unknown>}
 */
export function foreignCollections(random) {
  /** @type {Record<string, unknown>} */
  const out = {};
  if (random() < 0.7) out.hazard = { 'H-0001': { id: 'H-0001', kind: 'hazard', title: 'no header at all' }, junk: [1, 2, 3] };
  if (random() < 0.5) out.control = {};
  if (random() < 0.3) out['reference-entry'] = 'not even a map';
  return out;
}

// ------------------------------------------------------------------ the browser's storage

/**
 * Run `fn` with `localStorage` and `sessionStorage` present on `globalThis` as spies that
 * record every read and write, for C-003. Node has neither by default; if the runtime ever
 * supplies one, the real object is restored after.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<{ result: T, uses: string[] }>}
 */
export async function withBrowserStorageSpies(fn) {
  /** @type {string[]} */
  const uses = [];
  /** @param {string} which */
  const spy = (which) => ({
    length: 0,
    /** @param {string} _key */
    getItem: (_key) => { uses.push(`${which}.getItem`); return null; },
    /** @param {string} key @param {string} value */
    setItem: (key, value) => { uses.push(`${which}.setItem(${key}=${value})`); },
    /** @param {string} key */
    removeItem: (key) => { uses.push(`${which}.removeItem(${key})`); },
    clear: () => { uses.push(`${which}.clear()`); },
    /** @param {number} _i */
    key: (_i) => null,
  });
  const g = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (globalThis));
  const saved = { localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), sessionStorage: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage') };
  Object.defineProperty(globalThis, 'localStorage', { value: spy('localStorage'), configurable: true, writable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: spy('sessionStorage'), configurable: true, writable: true });
  try {
    const result = await fn();
    return { result, uses };
  } finally {
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete g[name];
    }
  }
}

export { changeLog, platformId, reviewScheduleId, schema };
