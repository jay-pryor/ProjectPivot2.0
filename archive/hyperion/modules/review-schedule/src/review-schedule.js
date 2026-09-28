/**
 * review-schedule, implementing contract version 1.0 (modules/review-schedule/CONTRACT.md).
 * Selected by contract.js unless REVIEW_SCHEDULE_IMPL=null. Clause IDs (C-nnn) cite the
 * contract.
 *
 * Every operation is a function of the `DataBody` passed in, of the baseline clock, and, for
 * the two that change it, of `change-log.recordChange` (C-003). Every operation first reads
 * `collections['review-schedule']` whole and rejects a malformed entry (C-004), so no list is
 * given with a schedule missing from it. `lastReviewedAest` is written and never read (C-006).
 */

import { RECORD_KINDS, dateAest, platformId, reviewScheduleId, timestampAest, userProfileId } from '../../../baseline/types.js';
import { nowAest, todayAest } from '../../../baseline/clock.js';
import { recordChange } from '../../change-log/contract.js';
import {
  InvalidActError, InvalidDueDateError, InvalidRefError, InvalidTempoError, MalformedScheduleError, MissingProfileError,
  NoChangeError, SCHEDULABLE_KINDS, ScheduleNotLiveError, UnknownScheduleError, UnschedulableKindError,
} from '../contract.js';

/** @typedef {import('../contract.js').ReviewScheduleImplementation} Impl */
/** @typedef {import('../contract.js').ReviewSchedule} ReviewSchedule */
/** @typedef {import('../contract.js').ReviewState} ReviewState */
/** @typedef {import('../contract.js').ScheduleAct} ScheduleAct */
/** @typedef {import('../../../baseline/types.js').RecordRef} RecordRef */
/** @typedef {import('../../../baseline/types.js').DateAest} DateAest */
/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */
/** @typedef {import('../../../baseline/schema.js').StoredRecord} StoredRecord */

const KIND = 'review-schedule';
const STATUSES = Object.freeze(['live', 'retired', 'deleted']);

// ------------------------------------------------------------------ value checks

/**
 * @param {unknown} v
 * @returns {v is Record<string, any>}
 */
function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * @param {object} o
 * @param {string} key
 */
function has(o, key) {
  return Object.prototype.hasOwnProperty.call(o, key);
}

/**
 * @param {unknown} v
 * @param {(s: string) => unknown} parse a baseline parser, which throws on a bad value
 */
function parses(v, parse) {
  if (typeof v !== 'string') return false;
  try {
    parse(v);
    return true;
  } catch {
    return false;
  }
}

/** @param {unknown} v */
const isProfileId = (v) => parses(v, userProfileId.parse);
/** @param {unknown} v */
const isPlatformId = (v) => parses(v, platformId.parse);
/** @param {unknown} v */
const isScheduleId = (v) => parses(v, reviewScheduleId.parse);
/** @param {unknown} v */
const isTimestamp = (v) => parses(v, timestampAest);
/** @param {unknown} v */
const isDate = (v) => parses(v, dateAest);
/** @param {unknown} v */
const isTempo = (v) => typeof v === 'number' && Number.isInteger(v) && v >= 1;

/**
 * A record kind and a string id (section 4).
 * @param {unknown} ref
 * @returns {ref is RecordRef}
 */
function isRef(ref) {
  return isObject(ref) && typeof ref.kind === 'string' && RECORD_KINDS.includes(/** @type {any} */ (ref.kind))
    && typeof ref.id === 'string';
}

/**
 * @param {RecordRef} a
 * @param {RecordRef} b
 */
function sameRef(a, b) {
  return a.kind === b.kind && a.id === b.id;
}

// ------------------------------------------------------------------ the collection (C-004)

/**
 * One sentence naming what is wrong with an entry, or null when it is a `ReviewSchedule`.
 * @param {string} key
 * @param {unknown} e
 * @returns {string | null}
 */
function malformation(key, e) {
  if (!isObject(e)) return 'the entry is not a record';
  if (e.id !== key) return 'its id differs from its key';
  if (!isScheduleId(e.id)) return 'its id is not a review schedule id';
  if (e.kind !== KIND) return 'its kind is not review-schedule';
  if (!STATUSES.includes(e.status)) return 'its status is not a record status';
  if (!isProfileId(e.createdBy)) return 'its createdBy is not a user profile id';
  if (!isProfileId(e.updatedBy)) return 'its updatedBy is not a user profile id';
  if (!isTimestamp(e.createdAtAest)) return 'its createdAtAest is not an AEST timestamp';
  if (!isTimestamp(e.updatedAtAest)) return 'its updatedAtAest is not an AEST timestamp';
  if (!isRef(e.ref)) return 'its ref is not a record kind and a string id';
  if (!SCHEDULABLE_KINDS.includes(e.ref.kind)) return 'its ref names a kind that carries no schedule';
  if (!isTempo(e.tempoMonths)) return 'its tempoMonths is not a whole number of at least one';
  if (!isDate(e.nextDueAest)) return 'its nextDueAest is not an AEST date';
  if (e.lastReviewedAest !== null && !isDate(e.lastReviewedAest)) return 'its lastReviewedAest is neither null nor an AEST date';
  return null;
}

/**
 * Every entry of the collection, each checked; a missing collection is empty (section 4).
 * @param {DataBody} body
 * @returns {ReviewSchedule[]}
 */
function readSchedules(body) {
  const rows = body?.collections?.[KIND];
  if (rows === undefined) return [];
  if (!isObject(rows)) throw new MalformedScheduleError(KIND, 'the review-schedule collection is not keyed records');
  return Object.keys(rows).map((key) => {
    const detail = malformation(key, rows[key]);
    if (detail !== null) throw new MalformedScheduleError(key, detail);
    return /** @type {ReviewSchedule} */ (/** @type {unknown} */ (rows[key]));
  });
}

/**
 * Section 4's ref conditions, in their order.
 * @param {unknown} ref
 * @returns {RecordRef}
 */
function requireRef(ref) {
  if (!isRef(ref)) throw new InvalidRefError(ref);
  if (!SCHEDULABLE_KINDS.includes(ref.kind)) throw new UnschedulableKindError(ref.kind);
  return ref;
}

/**
 * Section 4's profile and act conditions, in their order.
 * @param {unknown} act
 * @returns {ScheduleAct}
 */
function requireAct(act) {
  if (!isObject(act) || !isObject(act.profile) || !isProfileId(act.profile.id)) throw new MissingProfileError(act);
  if (!has(act, 'madeForPlatformId')) throw new InvalidActError(undefined);
  const madeFor = act.madeForPlatformId;
  if (madeFor !== null && !isPlatformId(madeFor)) throw new InvalidActError(madeFor);
  const affected = act.affectedPlatformIds;
  if (!Array.isArray(affected)) throw new InvalidActError(affected);
  for (const id of affected) if (!isPlatformId(id)) throw new InvalidActError(id);
  return /** @type {ScheduleAct} */ (act);
}

/**
 * @param {ReviewSchedule[]} schedules
 * @param {RecordRef} ref
 * @returns {ReviewSchedule | undefined}
 */
function liveFor(schedules, ref) {
  return schedules.find((s) => s.status === 'live' && sameRef(s.ref, ref));
}

/**
 * The schedule a change applies to: the live one, else a refusal for one that is not live.
 * @param {ReviewSchedule[]} schedules
 * @param {RecordRef} ref
 * @returns {ReviewSchedule | undefined} undefined when no schedule names `ref`
 */
function scheduleToChange(schedules, ref) {
  const live = liveFor(schedules, ref);
  if (live !== undefined) return live;
  const other = schedules.find((s) => sameRef(s.ref, ref));
  if (other !== undefined) throw new ScheduleNotLiveError(ref, other.status);
  return undefined;
}

/**
 * @param {ReviewSchedule} a
 * @param {ReviewSchedule} b
 */
function byDueThenId(a, b) {
  if (a.nextDueAest !== b.nextDueAest) return a.nextDueAest < b.nextDueAest ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// ------------------------------------------------------------------ month arithmetic (DEC-019)

/**
 * `date` plus `months` calendar months: the same day of the month, or the target month's last
 * day when it has fewer (C-008).
 * @param {DateAest} date
 * @param {number} months
 * @returns {DateAest}
 */
function addMonths(date, months) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7)) - 1 + months;
  const day = Number(date.slice(8, 10));
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const pad = (/** @type {number} */ n, /** @type {number} */ w) => String(n).padStart(w, '0');
  return dateAest(`${pad(targetYear, 4)}-${pad(targetMonth + 1, 2)}-${pad(Math.min(day, lastDay), 2)}`);
}

// ------------------------------------------------------------------ writing (C-002, C-012)

/**
 * The body with the one schedule put, then the act recorded through `change-log`.
 * @param {DataBody} body
 * @param {ScheduleAct} act
 * @param {ReviewSchedule | null} before
 * @param {ReviewSchedule} after
 */
async function write(body, act, before, after) {
  const withSchedule = {
    ...body,
    collections: { ...body.collections, [KIND]: { ...body.collections?.[KIND], [after.id]: after } },
  };
  const recorded = await recordChange(/** @type {DataBody} */ (withSchedule), act.profile, {
    records: [{
      before: /** @type {StoredRecord | null} */ (/** @type {unknown} */ (before)),
      after: /** @type {StoredRecord} */ (/** @type {unknown} */ (after)),
    }],
    madeForPlatformId: act.madeForPlatformId,
    affectedPlatformIds: act.affectedPlatformIds,
  });
  return { body: recorded.body, schedule: after };
}

// ------------------------------------------------------------------ operations

/** @type {Impl['setSchedule']} */
export async function setSchedule(body, act, fields) {
  const schedules = readSchedules(body);
  const a = requireAct(act);
  const ref = requireRef(isObject(fields) ? fields.ref : undefined);
  const existing = scheduleToChange(schedules, ref);
  const { tempoMonths, nextDueAest } = /** @type {Record<string, any>} */ (fields);
  if (!isTempo(tempoMonths)) throw new InvalidTempoError(tempoMonths);
  if (!isDate(nextDueAest)) throw new InvalidDueDateError(nextDueAest);
  const at = nowAest();
  const by = a.profile.id;
  if (existing === undefined) {
    const ids = new Set(schedules.map((s) => s.id));
    let id = reviewScheduleId.fresh();
    while (ids.has(id)) id = reviewScheduleId.fresh();
    /** @type {ReviewSchedule} */
    const created = {
      id, kind: KIND, status: 'live', createdBy: by, createdAtAest: at, updatedBy: by, updatedAtAest: at,
      ref: { kind: ref.kind, id: ref.id }, tempoMonths, nextDueAest, lastReviewedAest: null,
    };
    return write(body, a, null, created);
  }
  // C-013: both values as stored is no change, and nothing is restamped or recorded.
  if (existing.tempoMonths === tempoMonths && existing.nextDueAest === nextDueAest) {
    throw new NoChangeError(ref, 'the tempo and the due date given are the ones stored');
  }
  return write(body, a, existing, { ...existing, tempoMonths, nextDueAest, updatedBy: by, updatedAtAest: at });
}

/** @type {Impl['completeReview']} */
export async function completeReview(body, act, ref) {
  const schedules = readSchedules(body);
  const a = requireAct(act);
  const r = requireRef(ref);
  const existing = scheduleToChange(schedules, r);
  if (existing === undefined) throw new UnknownScheduleError(r);
  // C-008: the due date advances from the due date, never from today or the last review.
  return write(body, a, existing, {
    ...existing,
    lastReviewedAest: todayAest(),
    nextDueAest: addMonths(existing.nextDueAest, existing.tempoMonths),
    updatedBy: a.profile.id,
    updatedAtAest: nowAest(),
  });
}

/** @type {Impl['getSchedule']} */
export async function getSchedule(body, ref) {
  const schedules = readSchedules(body);
  return liveFor(schedules, requireRef(ref)) ?? null;
}

/** @type {Impl['listSchedules']} */
export async function listSchedules(body) {
  return readSchedules(body).filter((s) => s.status === 'live').sort(byDueThenId);
}

/** @type {Impl['reviewStateOf']} */
export async function reviewStateOf(body, ref) {
  const schedules = readSchedules(body);
  const r = requireRef(ref);
  const asAtAest = todayAest();
  const schedule = liveFor(schedules, r) ?? null;
  return { ref: r, schedule, overdue: schedule !== null && schedule.nextDueAest < asAtAest, asAtAest };
}

/** @type {Impl['listOverdue']} */
export async function listOverdue(body) {
  const schedules = readSchedules(body);
  const asAtAest = todayAest();
  return schedules
    .filter((s) => s.status === 'live' && s.nextDueAest < asAtAest)
    .sort(byDueThenId)
    .map((s) => ({ ref: s.ref, schedule: s, overdue: true, asAtAest }));
}
