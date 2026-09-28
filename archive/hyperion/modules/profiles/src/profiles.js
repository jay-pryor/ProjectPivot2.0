/**
 * profiles, implementing contract version 1.0 (modules/profiles/CONTRACT.md). Selected by
 * contract.js unless PROFILES_IMPL=null. Clause IDs (C-nnn) cite the contract.
 *
 * The folder is reached only through `store.readProfiles` and `store.putProfile`, and the
 * folder is read afresh on every call (section 6: no caching). A session holds its
 * `DataStore` outside the object consumers see, so `active` is its only visible field, and
 * nothing here touches the browser's storage (C-003, C-006).
 */

import { readProfiles, putProfile } from '../../store/contract.js';
import { userProfileId } from '../../../baseline/types.js';
import { nowAest } from '../../../baseline/clock.js';
import { DuplicateProfileNameError, InvalidProfileNameError, UnknownProfileError } from '../contract.js';

/** @typedef {import('../contract.js').ProfilesImplementation} Impl */
/** @typedef {import('../contract.js').ProfileSession} ProfileSession */
/** @typedef {import('../../store/contract.js').DataStore} DataStore */
/** @typedef {import('../../../baseline/types.js').UserProfile} UserProfile */
/** @typedef {import('../../../baseline/types.js').UserProfileId} UserProfileId */
/** @typedef {import('../../../baseline/types.js').ActiveProfile} ActiveProfile */

/** @type {WeakMap<ProfileSession, DataStore>} */
const storeOf = new WeakMap();

/**
 * @param {ProfileSession} session
 * @returns {DataStore}
 */
function storeFor(session) {
  const store = storeOf.get(session);
  if (store === undefined) throw new TypeError('not a ProfileSession from openProfiles');
  return store;
}

/**
 * A name as C-002 and C-005 compare it: trimmed and without regard to case.
 * @param {string} name
 * @returns {string}
 */
function fold(name) {
  return name.trim().toLowerCase();
}

/**
 * Compare by code point, not by UTF-16 code unit and not by locale (C-005).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function byCodePoint(a, b) {
  const as = [...a];
  const bs = [...b];
  const n = Math.min(as.length, bs.length);
  for (let i = 0; i < n; i += 1) {
    const d = /** @type {number} */ (as[i].codePointAt(0)) - /** @type {number} */ (bs[i].codePointAt(0));
    if (d !== 0) return d;
  }
  return as.length - bs.length;
}

/** @type {Impl['openProfiles']} */
async function openProfiles(store) {
  /** @type {ProfileSession} */
  const session = { active: null };
  storeOf.set(session, store);
  return session;
}

/** @type {Impl['listProfiles']} */
async function listProfiles(session) {
  const stored = await readProfiles(storeFor(session));
  return [...stored].sort((a, b) => byCodePoint(fold(a.name), fold(b.name)) || byCodePoint(a.id, b.id));
}

/** @type {Impl['createProfile']} */
async function createProfile(session, name) {
  const store = storeFor(session);
  const trimmed = String(name).trim();
  if (trimmed === '') throw new InvalidProfileNameError(name);
  const stored = await readProfiles(store);
  const clash = stored.find((p) => fold(p.name) === fold(trimmed));
  if (clash !== undefined) throw new DuplicateProfileNameError(clash);
  const taken = new Set(stored.map((p) => p.id));
  let id = userProfileId.fresh();
  while (taken.has(id)) id = userProfileId.fresh();
  /** @type {UserProfile} */
  const profile = { id, name: trimmed, createdAtAest: nowAest() };
  await putProfile(store, profile);
  return profile;
}

/** @type {Impl['selectProfile']} */
async function selectProfile(session, id) {
  const stored = await readProfiles(storeFor(session));
  const found = stored.find((p) => p.id === id);
  if (found === undefined) throw new UnknownProfileError(id);
  /** @type {ActiveProfile} */
  const active = { id: found.id, name: found.name };
  session.active = active;
  return active;
}

export { openProfiles, listProfiles, createProfile, selectProfile };
