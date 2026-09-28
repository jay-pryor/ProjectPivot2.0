/**
 * Null double of review-schedule, contract version 1.0 (CORE-TST-002, rung 1). Test-only:
 * contract.js selects it when REVIEW_SCHEDULE_IMPL=null through a specifier held in a
 * variable, so it is never built into pivot.html. It returns fixed, valid-looking data of the
 * declared types and enforces nothing: no argument is read or checked, nothing is thrown, no
 * clock is read, no change is recorded, and every body it returns is a fresh empty one.
 * Written from the contract surface alone; the conformance suite must fail against it in every
 * file but operations.
 */

import { emptyDataBody } from '../../baseline/schema.js';
import { dateAest, reviewScheduleId, reviewTempoMonths, timestampAest, userProfileId } from '../../baseline/types.js';

/** @typedef {import('./contract.js').ReviewScheduleImplementation} Impl */
/** @typedef {import('./contract.js').ReviewSchedule} ReviewSchedule */

const PROFILE_ID = userProfileId.parse('00000000-0000-4000-8000-000000000001');
const AT = timestampAest('2026-01-01T09:00:00+10:00');
const TODAY = dateAest('2026-01-01');

/** @returns {ReviewSchedule} */
function schedule() {
  return {
    id: reviewScheduleId.parse('00000000-0000-4000-8000-000000000002'),
    kind: 'review-schedule',
    status: 'live',
    createdBy: PROFILE_ID,
    createdAtAest: AT,
    updatedBy: PROFILE_ID,
    updatedAtAest: AT,
    ref: { kind: 'hazard', id: 'H-0001' },
    tempoMonths: reviewTempoMonths(12),
    nextDueAest: TODAY,
    lastReviewedAest: null,
  };
}

/** @type {Impl['setSchedule']} */
export const setSchedule = async (body, act, fields) => ({ body: emptyDataBody(), schedule: schedule() });

/** @type {Impl['completeReview']} */
export const completeReview = async (body, act, ref) => ({ body: emptyDataBody(), schedule: schedule() });

/** @type {Impl['getSchedule']} */
export const getSchedule = async (body, ref) => null;

/** @type {Impl['listSchedules']} */
export const listSchedules = async (body) => [];

/** @type {Impl['reviewStateOf']} */
export const reviewStateOf = async (body, ref) => ({
  ref: { kind: 'hazard', id: 'H-0001' },
  schedule: null,
  overdue: false,
  asAtAest: TODAY,
});

/** @type {Impl['listOverdue']} */
export const listOverdue = async (body) => [];
