/**
 * Contract: review-schedule, version 1.0. The module's sole import surface (CORE-CON-003).
 * Owns the record kind `review-schedule` (DEC-004, DEC-005, DEC-018): one record per
 * scheduled record, holding the tempo a user set, the date the schedule next falls due, and
 * the date a review was last completed (REQ-015, REQ-019, REQ-020, REQ-021, REQ-022,
 * REQ-023, REQ-072; HZ-009, HZ-012). Every operation is a function of the working `DataBody`
 * a consumer holds between `store.load` and `store.save` (DEC-006): this module reads no
 * folder and writes nothing anywhere. Clause IDs (C-nnn) are defined in CONTRACT.md beside
 * this file and cited by the conformance suite.
 *
 * The due date is stored, never computed from the last reviewed date (C-006): that is the
 * whole of REQ-021's "and shall never derive it from the last reviewed date", and it is why
 * the two dates are separate fields rather than one plus a rule. The last reviewed date moves
 * only in `completeReview` (C-007), which is REQ-015's "only when a review workflow on it is
 * completed"; `workflows` calls it at SL-07 and nothing else sets the field.
 *
 * Nothing here knows what a hazard, a control, or a platform is. A schedule names its record
 * by a baseline `RecordRef` and this module resolves no id and imports no module that could
 * (C-003, C-011), so the platforms a schedule change reaches are named by the caller, as they
 * are for `change-log` (DEC-015, DEC-020).
 *
 * Every operation delegates to the selected implementation: `src/review-schedule.js` in
 * production, `null_double.js` when `REVIEW_SCHEDULE_IMPL=null` is set in the environment
 * (CORE-TST-002, rung 1). The null double is test-only and never embedded in the built
 * pivot.html, which is why its specifier is held in a variable: the build inlines only
 * quoted import specifiers.
 */

/** @typedef {import('../../baseline/types.js').ReviewScheduleId} ReviewScheduleId */
/** @typedef {import('../../baseline/types.js').ReviewTempoMonths} ReviewTempoMonths */
/** @typedef {import('../../baseline/types.js').DateAest} DateAest */
/** @typedef {import('../../baseline/types.js').PlatformId} PlatformId */
/** @typedef {import('../../baseline/types.js').UserProfileId} UserProfileId */
/** @typedef {import('../../baseline/types.js').ActiveProfile} ActiveProfile */
/** @typedef {import('../../baseline/types.js').RecordKind} RecordKind */
/** @typedef {import('../../baseline/types.js').RecordStatus} RecordStatus */
/** @typedef {import('../../baseline/types.js').RecordRef} RecordRef */
/** @typedef {import('../../baseline/types.js').TimestampAest} TimestampAest */
/** @typedef {import('../../baseline/schema.js').DataBody} DataBody */

// ------------------------------------------------------------------ what may be scheduled

/**
 * The record kinds a schedule may be set for at 1.0: the four SL-06 criterion 1 names, which
 * are the four REQ-021, REQ-022, and REQ-072 name (C-011). `reference-entry` is here although
 * no module owns that kind until SL-10, because this module resolves no id: a schedule for a
 * reference entry is stored, listed, and flagged overdue by this version, and the entry it
 * points at arrives later.
 *
 * REQ-015 names six further kinds — causal factor, consequence, justification, rating, report,
 * workflow record — which carry no schedule at 1.0 and so have no last reviewed date to set.
 * Widening this set is an Interface change and is expected at SL-07 or SL-09 (section 7).
 * @type {readonly RecordKind[]}
 */
export const SCHEDULABLE_KINDS = Object.freeze(
  /** @type {readonly RecordKind[]} */ (['hazard', 'control', 'platform', 'reference-entry']),
);

// ------------------------------------------------------------------ record shape

/**
 * The fields every schedule carries, from the baseline record header (schema.js
 * `RecordHeader`). `createdBy` and `createdAtAest` are who first set a tempo for the record
 * and when; `updatedBy` and `updatedAtAest` are the last act that changed the schedule, which
 * is a `setSchedule` or a `completeReview` and nothing else (C-005, C-007).
 * @typedef {object} ReviewScheduleHeader
 * @property {ReviewScheduleId} id
 * @property {'review-schedule'} kind
 * @property {RecordStatus} status
 * @property {UserProfileId} createdBy
 * @property {TimestampAest} createdAtAest
 * @property {UserProfileId} updatedBy
 * @property {TimestampAest} updatedAtAest
 */

/**
 * One record's review schedule, in `collections['review-schedule']` keyed by its id. At most
 * one live schedule exists per `ref` (C-001).
 *
 * `nextDueAest` is the stored due date and is never a function of `lastReviewedAest`: it is
 * the date the user set, advanced one `tempoMonths` by each completed review and by nothing
 * else (C-006, C-008). `lastReviewedAest` is null until a review is completed and records
 * only that (C-007).
 * @typedef {ReviewScheduleHeader & {
 *   ref: RecordRef,
 *   tempoMonths: ReviewTempoMonths,
 *   nextDueAest: DateAest,
 *   lastReviewedAest: DateAest | null,
 * }} ReviewSchedule
 */

// ------------------------------------------------------------------ what a consumer supplies

/**
 * One act, as registry's `Act` is (DEC-016), plus the platforms the act reaches. This module
 * holds no link and cannot compute them, so the caller names them, from
 * `registry.platformsAffected` for a hazard, a control, or a platform (DEC-015, DEC-020);
 * they are stored as given and never checked against anything (C-003).
 * @typedef {object} ScheduleAct
 * @property {ActiveProfile} profile who is performing the act
 * @property {PlatformId | null} madeForPlatformId the platform the user was working on, or null
 * @property {readonly PlatformId[]} affectedPlatformIds every platform the act reaches
 */

/**
 * What a user sets: the record scheduled, the tempo, and the date the schedule next falls
 * due. Both values are given together, so a tempo is never stored without a due date to
 * apply it to (C-005, C-006).
 * @typedef {object} ScheduleFields
 * @property {RecordRef} ref the record scheduled; its `kind` is one of `SCHEDULABLE_KINDS`
 * @property {ReviewTempoMonths} tempoMonths a whole number of calendar months, at least one
 * @property {DateAest} nextDueAest the date the schedule next falls due, as the user set it
 */

// ------------------------------------------------------------------ what a read returns

/**
 * A record's review standing as at one date: the schedule, whether it is overdue, and the
 * date the flag was decided at, so the flag is auditable and no consumer has to know which
 * clock it came from (C-009).
 *
 * `overdue` is true exactly when a live schedule's `nextDueAest` is strictly earlier than
 * `asAtAest` — the day after the due date, ruled at G3 — so a review completed on the due
 * date is on time. A record with no live schedule has `schedule` null and `overdue` false:
 * nothing is due, so nothing has fallen overdue.
 * @typedef {object} ReviewState
 * @property {RecordRef} ref
 * @property {ReviewSchedule | null} schedule null when no live schedule names `ref`
 * @property {boolean} overdue
 * @property {DateAest} asAtAest the baseline clock's today, at the moment of the call
 */

// ------------------------------------------------------------------ what a change returns

/**
 * What `setSchedule` and `completeReview` return: the body as it now is, and the schedule as
 * it now is. The body passed in is untouched (C-002); the consumer replaces its working body
 * with `body` and passes that to `store.save` when the user saves.
 * @typedef {{ body: DataBody, schedule: ReviewSchedule }} ScheduleChange
 */

// ------------------------------------------------------------------ error conditions

/** C-011: `ref` missing, or not a record kind and a string id. The body is unchanged. */
export class InvalidRefError extends Error {
  /** @param {unknown} given */
  constructor(given) {
    super('a review schedule names the record it schedules by its kind and its id');
    this.name = 'InvalidRefError';
    this.given = given;
  }
}

/**
 * C-011: `ref.kind` is a record kind that carries no schedule at this version. Rejected
 * rather than stored, so no schedule exists for a kind no clause of this contract covers.
 */
export class UnschedulableKindError extends Error {
  /** @param {string} kind */
  constructor(kind) {
    super('a review schedule is set for a hazard, a control, a platform, or a reference entry');
    this.name = 'UnschedulableKindError';
    this.kind = kind;
  }
}

/** C-005: a tempo that is not a whole number of calendar months of at least one. */
export class InvalidTempoError extends Error {
  /** @param {unknown} given */
  constructor(given) {
    super('a review tempo is a whole number of calendar months, at least one');
    this.name = 'InvalidTempoError';
    this.given = given;
  }
}

/** C-006: a due date that is not a real calendar date in AEST as `YYYY-MM-DD`. */
export class InvalidDueDateError extends Error {
  /** @param {unknown} given */
  constructor(given) {
    super('a review due date is a real calendar date in AEST as YYYY-MM-DD');
    this.name = 'InvalidDueDateError';
    this.given = given;
  }
}

/** C-007: `completeReview` for a `ref` no live schedule names. A review is completed against a schedule. */
export class UnknownScheduleError extends Error {
  /** @param {RecordRef} ref */
  constructor(ref) {
    super('no live review schedule names that record');
    this.name = 'UnknownScheduleError';
    this.ref = ref;
  }
}

/** C-004, C-013: a schedule whose status is not `live`. Said apart from an unknown one, so a consumer can tell them. */
export class ScheduleNotLiveError extends Error {
  /**
   * @param {RecordRef} ref
   * @param {RecordStatus} status
   */
  constructor(ref, status) {
    super('that record’s review schedule is deleted or retired');
    this.name = 'ScheduleNotLiveError';
    this.ref = ref;
    this.status = status;
  }
}

/**
 * C-013: `setSchedule` given the tempo and the due date the live schedule already holds.
 * Refused rather than restamped, so every entry this module causes is an act that changed
 * something and `change-log`'s `UnchangedRecordError` is unreachable from here (registry
 * C-029 for the same reason).
 */
export class NoChangeError extends Error {
  /**
   * @param {RecordRef} ref
   * @param {string} detail one sentence naming what already holds the value given
   */
  constructor(ref, detail) {
    super(`that review schedule already holds what was given: ${detail}`);
    this.name = 'NoChangeError';
    this.ref = ref;
    this.detail = detail;
  }
}

/** C-012: `act` missing, or `act.profile` missing, or its id not a user profile id. */
export class MissingProfileError extends Error {
  /** @param {unknown} given */
  constructor(given) {
    super('a review schedule is stamped with the profile that changed it');
    this.name = 'MissingProfileError';
    this.given = given;
  }
}

/**
 * C-012: `act.madeForPlatformId` absent, or neither null nor a platform id, or an entry of
 * `act.affectedPlatformIds` that is not a platform id. Required and never defaulted: the
 * value that decides whose queue a change lands in is the one a caller must not forget
 * (DEC-016, DEC-020).
 */
export class InvalidActError extends Error {
  /** @param {unknown} given */
  constructor(given) {
    super('an act names the platform it was made for, or null, and the platforms it reaches');
    this.name = 'InvalidActError';
    this.given = given;
  }
}

/**
 * C-004: an entry of `collections['review-schedule']` this module cannot read. Every
 * operation rejects, so a list of schedules is never shown with one silently missing from it
 * and no record is shown as not overdue because its schedule could not be read (HZ-012).
 */
export class MalformedScheduleError extends Error {
  /**
   * @param {string} key the entry's key in the collection
   * @param {string} detail one sentence naming the field
   */
  constructor(key, detail) {
    super(`a review schedule cannot be read: ${detail}`);
    this.name = 'MalformedScheduleError';
    this.key = key;
    this.detail = detail;
  }
}

// ------------------------------------------------------------------ operations: setting a schedule

/**
 * Set the review tempo and the due date of one record, creating its schedule or replacing
 * both values on the one it has (REQ-020, REQ-022, REQ-072). The due date is stored as given
 * and is never derived from the last reviewed date, which this call does not touch (C-005,
 * C-006, C-007). Records the act through `change-log` in the same call (C-012). Rejects an
 * ill-formed or unschedulable ref, a tempo that is not a whole number of months, a due date
 * that is not a calendar date, a schedule that is not live, a call that would store what is
 * already stored, a missing profile, and an ill-formed act, changing nothing.
 * C-001, C-002, C-003, C-004, C-005, C-006, C-011, C-012, C-013.
 * @param {DataBody} body
 * @param {ScheduleAct} act
 * @param {ScheduleFields} fields
 * @returns {Promise<ScheduleChange>}
 */
export async function setSchedule(body, act, fields) {
  return (await impl()).setSchedule(body, act, fields);
}

/**
 * Record that a review workflow on one record has been completed: its last reviewed date
 * becomes the baseline clock's today, and its due date advances one tempo from the due date
 * it held — never from today and never from the last reviewed date (REQ-015, REQ-021; C-007,
 * C-008). This is the only operation of any contract that sets a last reviewed date; a test
 * calls it at SL-06 and `workflows` calls it at SL-07. Records the act through `change-log` in
 * the same call (C-012). Rejects a ref with no live schedule, a schedule that is not live, a
 * missing profile, and an ill-formed act, changing nothing.
 * C-002, C-003, C-004, C-007, C-008, C-011, C-012.
 * @param {DataBody} body
 * @param {ScheduleAct} act
 * @param {RecordRef} ref
 * @returns {Promise<ScheduleChange>}
 */
export async function completeReview(body, act, ref) {
  return (await impl()).completeReview(body, act, ref);
}

// ------------------------------------------------------------------ operations: reading

/**
 * The live schedule of one record, or null when none names it. A read: an id nothing has is
 * null rather than a rejection, and no clock is consulted. Rejects only a malformed schedule.
 * C-001, C-004, C-011.
 * @param {DataBody} body
 * @param {RecordRef} ref
 * @returns {Promise<ReviewSchedule | null>}
 */
export async function getSchedule(body, ref) {
  return (await impl()).getSchedule(body, ref);
}

/**
 * Every live schedule, once each, in ascending order of `nextDueAest` then id; empty when the
 * body holds none. Rejects only a malformed schedule. C-001, C-004.
 * @param {DataBody} body
 * @returns {Promise<readonly ReviewSchedule[]>}
 */
export async function listSchedules(body) {
  return (await impl()).listSchedules(body);
}

/**
 * One record's review standing as at the baseline clock's today: its schedule, whether it is
 * overdue, and the date that was decided at (REQ-019, REQ-023). Overdue from the day after
 * the due date, so a review done on the due date is on time (C-009). A record with no live
 * schedule is not overdue. Rejects only a malformed schedule.
 * C-004, C-009, C-011.
 * @param {DataBody} body
 * @param {RecordRef} ref
 * @returns {Promise<ReviewState>}
 */
export async function reviewStateOf(body, ref) {
  return (await impl()).reviewStateOf(body, ref);
}

/**
 * Every record whose review is overdue as at the baseline clock's today, once each, in
 * ascending order of `nextDueAest` then the schedule's id, and with nothing else. One call, so
 * a list of any length is flagged from one pass and no consumer decides for itself what
 * overdue means (C-009, C-010; HZ-012). Every `ReviewState` it gives has `overdue` true and a
 * `schedule` that is not null. Empty when nothing is overdue. Rejects only a malformed
 * schedule. C-004, C-009, C-010.
 * @param {DataBody} body
 * @returns {Promise<readonly ReviewState[]>}
 */
export async function listOverdue(body) {
  return (await impl()).listOverdue(body);
}

// ------------------------------------------------------------------ implementation selection

/**
 * @typedef {object} ReviewScheduleImplementation
 * @property {(body: DataBody, act: ScheduleAct, fields: ScheduleFields) => Promise<ScheduleChange>} setSchedule
 * @property {(body: DataBody, act: ScheduleAct, ref: RecordRef) => Promise<ScheduleChange>} completeReview
 * @property {(body: DataBody, ref: RecordRef) => Promise<ReviewSchedule | null>} getSchedule
 * @property {(body: DataBody) => Promise<readonly ReviewSchedule[]>} listSchedules
 * @property {(body: DataBody, ref: RecordRef) => Promise<ReviewState>} reviewStateOf
 * @property {(body: DataBody) => Promise<readonly ReviewState[]>} listOverdue
 */

/** @type {Promise<ReviewScheduleImplementation> | null} */
let selected = null;

/** @returns {Promise<ReviewScheduleImplementation>} */
function impl() {
  if (selected === null) {
    const env = /** @type {{ process?: { env?: Record<string, string | undefined> } }} */ (globalThis).process?.env;
    if (env?.REVIEW_SCHEDULE_IMPL === 'null') {
      const nullDouble = './null_double.js'; // test-only; not a runtime source, so never inlined by the build
      selected = import(nullDouble);
    } else {
      selected = import('./src/review-schedule.js');
    }
  }
  return selected;
}
