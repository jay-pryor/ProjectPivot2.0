/**
 * Domain types and identifiers every module inherits (docs/module-map.md "Baseline";
 * DEC-003, DEC-004). Units and reference frames are in the type names, never in comments
 * (IMP-05): a consequence is a level 1 to 5, a likelihood a letter A to G, a date or time
 * is in AEST. Each branded type is a JSDoc intersection that the TypeScript checker
 * enforces in CI, and scripts/check_units.js proves the check rejects a unit confusion
 * built from this file. A value is made only through the constructor here, which
 * validates it; a cast anywhere else is a defect.
 *
 * Anything here is baseline: changed only in a BASELINE session (CORE-CHG-002).
 */

// ------------------------------------------------------------------ units and frames

/**
 * Consequence level on the DEC-002 matrix: 1 Catastrophic, 2 Critical, 3 Marginal,
 * 4 Negligible, 5 None.
 * @typedef {number & { readonly __unit: 'ConsequenceLevel1to5' }} ConsequenceLevel1to5
 */

/**
 * Likelihood letter on the DEC-002 matrix: A Frequent to E Improbable, F Eliminated,
 * G Not Credible. Never the DEC-001 integer, which is for trace/ records only.
 * @typedef {string & { readonly __unit: 'LikelihoodLetterAtoG' }} LikelihoodLetterAtoG
 */

/**
 * A DEC-002 matrix cell in the notation the decision locks in: level then letter, `2C`.
 * The rating word for a cell (`Serious`) is the `rating` module's to give, never stored.
 * @typedef {string & { readonly __unit: 'RiskCell' }} RiskCell
 */

/**
 * A calendar date in AEST as `YYYY-MM-DD` (ASM-005). AEST is UTC+10 with no daylight
 * saving, so the same instant is the same date for every user.
 * @typedef {string & { readonly __unit: 'DateAest' }} DateAest
 */

/**
 * An instant in AEST as `YYYY-MM-DDTHH:mm:ss+10:00` (ASM-005), second resolution.
 * @typedef {string & { readonly __unit: 'TimestampAest' }} TimestampAest
 */

/**
 * A review tempo as a whole number of calendar months (SL-06, decided at G3).
 * @typedef {number & { readonly __unit: 'ReviewTempoMonths' }} ReviewTempoMonths
 */

/**
 * A SHA-256 digest as 64 lowercase hex characters: the integrity check written with
 * every file (REQ-074; SL-02, decided at G3).
 * @typedef {string & { readonly __unit: 'Sha256Hex' }} Sha256Hex
 */

/**
 * A random 128-bit token as 32 lowercase hex characters, part of the save stamp that
 * tells one save from another (SL-01, decided at G3).
 * @typedef {string & { readonly __unit: 'SaveToken' }} SaveToken
 */

export const CONSEQUENCE_LEVELS = Object.freeze([1, 2, 3, 4, 5]);
export const LIKELIHOOD_LETTERS = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F', 'G']);

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIMESTAMP_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\+10:00$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const TOKEN_RE = /^[0-9a-f]{32}$/;

/**
 * @param {number} n
 * @returns {ConsequenceLevel1to5}
 */
export function consequenceLevel(n) {
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    throw new RangeError(`consequence level must be a whole number 1 to 5, got ${String(n)}`);
  }
  return /** @type {ConsequenceLevel1to5} */ (n);
}

/**
 * @param {string} s
 * @returns {LikelihoodLetterAtoG}
 */
export function likelihoodLetter(s) {
  if (typeof s !== 'string' || !LIKELIHOOD_LETTERS.includes(s)) {
    throw new RangeError(`likelihood letter must be one of A to G, got ${String(s)}`);
  }
  return /** @type {LikelihoodLetterAtoG} */ (s);
}

/**
 * @param {ConsequenceLevel1to5} level
 * @param {LikelihoodLetterAtoG} letter
 * @returns {RiskCell}
 */
export function riskCell(level, letter) {
  return /** @type {RiskCell} */ (`${consequenceLevel(level)}${likelihoodLetter(letter)}`);
}

/**
 * @param {string} s
 * @returns {RiskCell}
 */
export function parseRiskCell(s) {
  const m = /^([1-5])([A-G])$/.exec(s);
  if (!m) throw new RangeError(`risk cell must be a level 1 to 5 then a letter A to G, got ${String(s)}`);
  return /** @type {RiskCell} */ (s);
}

/**
 * @param {RiskCell} cell
 * @returns {{ level: ConsequenceLevel1to5, letter: LikelihoodLetterAtoG }}
 */
export function splitRiskCell(cell) {
  const c = parseRiskCell(cell);
  return { level: consequenceLevel(Number(c[0])), letter: likelihoodLetter(c[1]) };
}

/**
 * @param {number} year
 * @param {number} month 1 to 12
 * @param {number} day
 * @returns {boolean}
 */
function isCalendarDate(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/**
 * @param {string} s `YYYY-MM-DD`, a real calendar date
 * @returns {DateAest}
 */
export function dateAest(s) {
  const m = typeof s === 'string' ? DATE_RE.exec(s) : null;
  if (!m || !isCalendarDate(Number(m[1]), Number(m[2]), Number(m[3]))) {
    throw new RangeError(`AEST date must be a real calendar date as YYYY-MM-DD, got ${String(s)}`);
  }
  return /** @type {DateAest} */ (s);
}

/**
 * @param {string} s `YYYY-MM-DDTHH:mm:ss+10:00`
 * @returns {TimestampAest}
 */
export function timestampAest(s) {
  const m = typeof s === 'string' ? TIMESTAMP_RE.exec(s) : null;
  const inRange = m && isCalendarDate(Number(m[1]), Number(m[2]), Number(m[3]))
    && Number(m[4]) < 24 && Number(m[5]) < 60 && Number(m[6]) < 60;
  if (!inRange) {
    throw new RangeError(`AEST timestamp must be YYYY-MM-DDTHH:mm:ss+10:00, got ${String(s)}`);
  }
  return /** @type {TimestampAest} */ (s);
}

/**
 * @param {TimestampAest} ts
 * @returns {DateAest}
 */
export function dateOfTimestamp(ts) {
  return dateAest(timestampAest(ts).slice(0, 10));
}

/**
 * @param {number} n
 * @returns {ReviewTempoMonths}
 */
export function reviewTempoMonths(n) {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`review tempo must be a whole number of months, at least 1, got ${String(n)}`);
  }
  return /** @type {ReviewTempoMonths} */ (n);
}

/**
 * @param {string} s
 * @returns {Sha256Hex}
 */
export function sha256Hex(s) {
  if (typeof s !== 'string' || !SHA256_RE.test(s)) {
    throw new RangeError('SHA-256 digest must be 64 lowercase hex characters');
  }
  return /** @type {Sha256Hex} */ (s);
}

/**
 * @param {string} s
 * @returns {SaveToken}
 */
export function saveToken(s) {
  if (typeof s !== 'string' || !TOKEN_RE.test(s)) {
    throw new RangeError('save token must be 32 lowercase hex characters');
  }
  return /** @type {SaveToken} */ (s);
}

// ------------------------------------------------------------------ record kinds

/**
 * Every kind of record the data folder holds. Each kind is owned by one module (DEC-004);
 * the change log names them all (REQ-045), so the list is baseline.
 * @typedef {'hazard' | 'control' | 'platform' | 'causal-factor' | 'consequence'
 *   | 'justification' | 'rating' | 'reference-entry' | 'review-schedule' | 'user-profile'
 *   | 'workflow-record' | 'report' | 'report-template' | 'change-log-entry'
 *   | 'link'} RecordKind
 */
export const RECORD_KINDS = Object.freeze(/** @type {readonly RecordKind[]} */ ([
  'hazard', 'control', 'platform', 'causal-factor', 'consequence', 'justification',
  'rating', 'reference-entry', 'review-schedule', 'user-profile', 'workflow-record',
  'report', 'report-template', 'change-log-entry', 'link',
]));

/** @typedef {'preventative' | 'mitigating'} ControlKind REQ-044 */
/** @typedef {'live' | 'retired' | 'deleted'} RecordStatus REQ-007, REQ-067; a deleted record keeps its row (REQ-010) */
/** @typedef {'initial' | 'residual'} RatingStage REQ-042, REQ-043 */

// ------------------------------------------------------------------ identifiers

/**
 * The global ID of a hazard (REQ-050, STK-028): `H-` then a number from a sequence that
 * only ever counts up, so an ID is never reused, including after deletion. Distinct from
 * the ID the same hazard has in one platform's reports (PlatformReportId).
 * @typedef {string & { readonly __unit: 'HazardId' }} HazardId
 */

/**
 * A hazard's ID in the reports of one platform (REQ-051, REQ-052): set by a user, stable
 * across report versions, and never a HazardId.
 * @typedef {string & { readonly __unit: 'PlatformReportId' }} PlatformReportId
 */

/** @typedef {string & { readonly __unit: 'ControlId' }} ControlId */
/** @typedef {string & { readonly __unit: 'PlatformId' }} PlatformId */
/** @typedef {string & { readonly __unit: 'CausalFactorId' }} CausalFactorId */
/** @typedef {string & { readonly __unit: 'ConsequenceId' }} ConsequenceId */
/** @typedef {string & { readonly __unit: 'JustificationId' }} JustificationId */
/** @typedef {string & { readonly __unit: 'RatingId' }} RatingId */
/** @typedef {string & { readonly __unit: 'ReferenceEntryId' }} ReferenceEntryId */
/** @typedef {string & { readonly __unit: 'ReviewScheduleId' }} ReviewScheduleId DEC-018 */
/** @typedef {string & { readonly __unit: 'UserProfileId' }} UserProfileId */
/** @typedef {string & { readonly __unit: 'WorkflowRecordId' }} WorkflowRecordId */
/** @typedef {string & { readonly __unit: 'ReportId' }} ReportId */
/** @typedef {string & { readonly __unit: 'ReportTemplateId' }} ReportTemplateId */
/** @typedef {string & { readonly __unit: 'ChangeLogEntryId' }} ChangeLogEntryId */
/** @typedef {string & { readonly __unit: 'LinkId' }} LinkId */

const HAZARD_ID_RE = /^H-\d{4,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const hazardId = Object.freeze({
  /** @type {RecordKind} */
  kind: 'hazard',
  /**
   * The ID for the next hazard, from the persisted sequence (schema.js `sequences.hazard`).
   * @param {number} sequence
   * @returns {HazardId}
   */
  fromSequence(sequence) {
    if (!Number.isInteger(sequence) || sequence < 1) {
      throw new RangeError(`hazard sequence must be a whole number from 1, got ${String(sequence)}`);
    }
    return /** @type {HazardId} */ (`H-${String(sequence).padStart(4, '0')}`);
  },
  /**
   * @param {string} s
   * @returns {HazardId}
   */
  parse(s) {
    if (typeof s !== 'string' || !HAZARD_ID_RE.test(s)) {
      throw new TypeError(`hazard id must be H- then at least four digits, got ${String(s)}`);
    }
    return /** @type {HazardId} */ (s);
  },
});

/**
 * @param {string} s what the user typed
 * @returns {PlatformReportId}
 */
export function platformReportId(s) {
  if (typeof s !== 'string' || s.trim() === '' || s !== s.trim()) {
    throw new TypeError('platform report id must be non-empty with no leading or trailing space');
  }
  return /** @type {PlatformReportId} */ (s);
}

/**
 * How one kind of record is identified: a fresh id for a new record, a checked id for a
 * stored one. Every kind but hazard uses a random UUID, which is never reused by
 * construction and needs no counter.
 * @template T
 * @typedef {object} IdKind
 * @property {RecordKind} kind
 * @property {() => T} fresh
 * @property {(s: string) => T} parse
 */

/**
 * @template T
 * @param {RecordKind} kind
 * @returns {IdKind<T>}
 */
function uuidKind(kind) {
  return Object.freeze({
    kind,
    fresh() {
      return /** @type {T} */ (/** @type {unknown} */ (globalThis.crypto.randomUUID()));
    },
    /** @param {string} s */
    parse(s) {
      if (typeof s !== 'string' || !UUID_RE.test(s)) {
        throw new TypeError(`${kind} id must be a UUID, got ${String(s)}`);
      }
      return /** @type {T} */ (/** @type {unknown} */ (s));
    },
  });
}

/** @type {IdKind<ControlId>} */
export const controlId = uuidKind('control');
/** @type {IdKind<PlatformId>} */
export const platformId = uuidKind('platform');
/** @type {IdKind<CausalFactorId>} */
export const causalFactorId = uuidKind('causal-factor');
/** @type {IdKind<ConsequenceId>} */
export const consequenceId = uuidKind('consequence');
/** @type {IdKind<JustificationId>} */
export const justificationId = uuidKind('justification');
/** @type {IdKind<RatingId>} */
export const ratingId = uuidKind('rating');
/** @type {IdKind<ReferenceEntryId>} */
export const referenceEntryId = uuidKind('reference-entry');
/** @type {IdKind<ReviewScheduleId>} */
export const reviewScheduleId = uuidKind('review-schedule');
/** @type {IdKind<UserProfileId>} */
export const userProfileId = uuidKind('user-profile');
/** @type {IdKind<WorkflowRecordId>} */
export const workflowRecordId = uuidKind('workflow-record');
/** @type {IdKind<ReportId>} */
export const reportId = uuidKind('report');
/** @type {IdKind<ReportTemplateId>} */
export const reportTemplateId = uuidKind('report-template');
/** @type {IdKind<ChangeLogEntryId>} */
export const changeLogEntryId = uuidKind('change-log-entry');
/** @type {IdKind<LinkId>} */
export const linkId = uuidKind('link');

/**
 * A reference to any record, for links and log entries that cross record kinds
 * (REQ-010, REQ-030, REQ-045). The id is checked by the owning module's parser.
 * @typedef {object} RecordRef
 * @property {RecordKind} kind
 * @property {string} id
 */

// ------------------------------------------------------------------ users

/**
 * A user profile as stored in the data folder (REQ-053). No password (ASM-002).
 * @typedef {object} UserProfile
 * @property {UserProfileId} id
 * @property {string} name shown in the top bar (REQ-057)
 * @property {TimestampAest} createdAtAest
 */

/**
 * The profile this session acts as, passed into every call that changes data (REQ-055,
 * DEC-004). A value, never an import: only `views` depends on `profiles`.
 * @typedef {object} ActiveProfile
 * @property {UserProfileId} id
 * @property {string} name
 */
