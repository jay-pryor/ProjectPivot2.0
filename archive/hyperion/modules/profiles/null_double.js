/**
 * Null double of profiles, contract version 1.0 (CORE-TST-002, rung 1). Test-only: contract.js
 * selects it when PROFILES_IMPL=null through a specifier held in a variable, so it is never
 * built into pivot.html. It returns fixed, valid-looking data of the declared types and
 * enforces nothing: no argument is read or checked, nothing is thrown, and no folder is read
 * or written. Written from the contract surface alone; the conformance suite must fail against
 * it in every file but operations.
 */

import { timestampAest, userProfileId } from '../../baseline/types.js';

/** @typedef {import('./contract.js').ProfilesImplementation} Impl */

const PROFILE_ID = userProfileId.parse('00000000-0000-4000-8000-000000000001');
const CREATED_AT = timestampAest('2026-01-01T09:00:00+10:00');

/** @type {Impl['openProfiles']} */
export const openProfiles = async (store) => ({ active: null });

/** @type {Impl['listProfiles']} */
export const listProfiles = async (session) => [];

/** @type {Impl['createProfile']} */
export const createProfile = async (session, name) => ({ id: PROFILE_ID, name: 'Profile', createdAtAest: CREATED_AT });

/** @type {Impl['selectProfile']} */
export const selectProfile = async (session, id) => ({ id: PROFILE_ID, name: 'Profile' });
