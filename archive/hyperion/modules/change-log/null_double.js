/**
 * Null double of change-log, contract version 1.0 (CORE-TST-002, rung 1). Test-only:
 * contract.js selects it when CHANGE_LOG_IMPL=null through a specifier held in a variable, so
 * it is never built into pivot.html. It returns fixed, valid-looking data of the declared
 * types and enforces nothing: no argument is read or checked, nothing is thrown, and every
 * body it returns is a fresh empty one. Written from the contract surface alone; the
 * conformance suite must fail against it in every file but operations.
 */

import { emptyDataBody } from '../../baseline/schema.js';
import { changeLogEntryId, platformId, timestampAest, userProfileId } from '../../baseline/types.js';

/** @typedef {import('./contract.js').ChangeLogImplementation} Impl */
/** @typedef {import('./contract.js').ChangeLogHeader} ChangeLogHeader */

const PROFILE_ID = userProfileId.parse('00000000-0000-4000-8000-000000000001');
const AT = timestampAest('2026-01-01T09:00:00+10:00');
const PLATFORM_ID = platformId.parse('00000000-0000-4000-8000-000000000002');
const ENTRY_ID = changeLogEntryId.parse('00000000-0000-4000-8000-000000000003');
const ACKNOWLEDGEMENT_ID = changeLogEntryId.parse('00000000-0000-4000-8000-000000000004');

/**
 * @param {ChangeLogHeader['id']} id
 * @returns {ChangeLogHeader}
 */
function header(id) {
  return {
    id,
    kind: 'change-log-entry',
    status: 'live',
    createdBy: PROFILE_ID,
    createdAtAest: AT,
    updatedBy: PROFILE_ID,
    updatedAtAest: AT,
  };
}

/** @type {Impl['recordChange']} */
export const recordChange = async (body, profile, change) => ({
  body: emptyDataBody(),
  entry: { ...header(ENTRY_ID), entryKind: 'record-change', items: [], madeForPlatformId: null, affectedPlatformIds: [] },
});

/** @type {Impl['acknowledge']} */
export const acknowledge = async (body, profile, fields) => ({
  body: emptyDataBody(),
  entry: { ...header(ACKNOWLEDGEMENT_ID), entryKind: 'acknowledgement', entryId: ENTRY_ID, platformId: PLATFORM_ID },
});

/** @type {Impl['listEntries']} */
export const listEntries = async (body) => [];

/** @type {Impl['listHistory']} */
export const listHistory = async (body, ref) => [];

/** @type {Impl['listAwaiting']} */
export const listAwaiting = async (body, platformId) => [];
