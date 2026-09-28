/**
 * Null double of reference-register, contract version 1.0 (CORE-TST-002, rung 1). Test-only:
 * contract.js selects it when REFERENCE_REGISTER_IMPL=null through a specifier held in a
 * variable, so it is never built into pivot.html. It returns fixed, valid-looking data of the
 * declared types and enforces nothing: no argument is read or checked, nothing is thrown, no
 * file is kept or looked for, no change is recorded, and every body it returns is a fresh
 * empty one. Written from the contract surface alone; the conformance suite must fail against
 * it in every file but operations.
 */

import { emptyDataBody } from '../../baseline/schema.js';
import { referenceEntryId, timestampAest, userProfileId } from '../../baseline/types.js';

/** @typedef {import('./contract.js').ReferenceRegisterImplementation} Impl */
/** @typedef {import('./contract.js').ReferenceEntry} ReferenceEntry */

const PROFILE_ID = userProfileId.parse('00000000-0000-4000-8000-000000000001');
const AT = timestampAest('2026-01-01T09:00:00+10:00');

/** @returns {ReferenceEntry} */
function entry() {
  return {
    id: referenceEntryId.parse('00000000-0000-4000-8000-000000000002'),
    kind: 'reference-entry',
    status: 'live',
    createdBy: PROFILE_ID,
    createdAtAest: AT,
    updatedBy: PROFILE_ID,
    updatedAtAest: AT,
    name: 'Reference',
    link: null,
    path: null,
    fileLocation: null,
    links: [],
  };
}

/** @type {Impl['createEntry']} */
export const createEntry = async (body, act, store, fields) => ({ body: emptyDataBody(), entry: entry() });

/** @type {Impl['linkEntry']} */
export const linkEntry = async (body, act, fields) => ({ body: emptyDataBody(), entry: entry() });

/** @type {Impl['listEntries']} */
export const listEntries = async (body) => [];

/** @type {Impl['getEntry']} */
export const getEntry = async (body, id) => null;

/** @type {Impl['checkEntryFiles']} */
export const checkEntryFiles = async (body, store) => [];
