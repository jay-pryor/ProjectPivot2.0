/**
 * Contract: profiles, version 1.0. The module's sole import surface (CORE-CON-003). Creates
 * user profiles and selects the one this open of Pivot acts as (DEC-004): the selection is
 * a value, `ProfileSession.active`, that `views` passes into every call that changes data
 * (REQ-055), never an import, so only `views` depends on this module. Clause IDs (C-nnn)
 * are defined in CONTRACT.md beside this file and cited by the conformance suite.
 *
 * Every operation delegates to the selected implementation: `src/profiles.js` in
 * production, `null_double.js` when `PROFILES_IMPL=null` is set in the environment
 * (CORE-TST-002, rung 1). The null double is test-only and never embedded in the built
 * pivot.html, which is why its specifier is held in a variable: the build inlines only
 * quoted import specifiers.
 */

/** @typedef {import('../../baseline/types.js').UserProfile} UserProfile */
/** @typedef {import('../../baseline/types.js').UserProfileId} UserProfileId */
/** @typedef {import('../../baseline/types.js').ActiveProfile} ActiveProfile */
/** @typedef {import('../store/contract.js').DataStore} DataStore */

// ------------------------------------------------------------------ data shapes

/**
 * One open of Pivot's choice of user, over one data folder. `active` is null from
 * `openProfiles` until `selectProfile` resolves (C-003), and is the value consumers pass
 * as the `profile` argument of every data-changing call. Opaque beyond `active`: consumers
 * hold it and pass it back, nothing more. Nothing in it survives the page; a new open is
 * a new session with no memory of the last (C-003).
 * @typedef {object} ProfileSession
 * @property {ActiveProfile | null} active
 */

// ------------------------------------------------------------------ error conditions

/** C-002: `createProfile` given a name that is empty once trimmed. Nothing was written. */
export class InvalidProfileNameError extends Error {
  /** @param {string} name what was given */
  constructor(name) {
    super('a profile name must have at least one character that is not a space');
    this.name = 'InvalidProfileNameError';
    this.given = name;
  }
}

/**
 * C-002: `createProfile` given a name a stored profile already has, compared trimmed and
 * without regard to case. Nothing was written; `existing` is that profile.
 */
export class DuplicateProfileNameError extends Error {
  /** @param {UserProfile} existing */
  constructor(existing) {
    super(`a profile named ${JSON.stringify(existing.name)} already exists`);
    this.name = 'DuplicateProfileNameError';
    this.existing = existing;
  }
}

/** C-004: `selectProfile` given an id no profile in the folder has. `active` is unchanged. */
export class UnknownProfileError extends Error {
  /** @param {UserProfileId} id */
  constructor(id) {
    super(`no stored profile has the id ${String(id)}`);
    this.name = 'UnknownProfileError';
    this.id = id;
  }
}

// ------------------------------------------------------------------ operations

/**
 * Begin choosing a user for this open of Pivot over `store`'s folder. Resolves with a
 * session whose `active` is null, whatever any earlier session selected or created, and
 * reads and writes nothing (C-003, C-006).
 * @param {DataStore} store an open data folder, from `modules/store/contract.js`
 * @returns {Promise<ProfileSession>}
 */
export async function openProfiles(store) {
  return (await impl()).openProfiles(store);
}

/**
 * Every profile stored in the folder, in name order, empty when none has been created.
 * Reads the folder on every call and never marks one as selected. C-005, C-006.
 * @param {ProfileSession} session
 * @returns {Promise<readonly UserProfile[]>}
 */
export async function listProfiles(session) {
  return (await impl()).listProfiles(session);
}

/**
 * Create a profile with a fresh id and `name` trimmed, stamped with the baseline clock's
 * now, and store it in the folder. Does not select it: `active` is unchanged. Rejects a
 * blank name and a name a stored profile already has, writing nothing. C-001, C-002.
 * @param {ProfileSession} session
 * @param {string} name what the user typed (REQ-056)
 * @returns {Promise<UserProfile>} the profile as stored
 */
export async function createProfile(session, name) {
  return (await impl()).createProfile(session, name);
}

/**
 * Act as the stored profile with this id for the rest of the session. Checks the id
 * against the folder at the time of the call, sets `session.active`, and resolves with it;
 * an id no stored profile has rejects and leaves `active` unchanged. Writes nothing.
 * C-004, C-006.
 * @param {ProfileSession} session
 * @param {UserProfileId} id
 * @returns {Promise<ActiveProfile>} the value to pass into every data-changing call
 */
export async function selectProfile(session, id) {
  return (await impl()).selectProfile(session, id);
}

// ------------------------------------------------------------------ implementation selection

/**
 * @typedef {object} ProfilesImplementation
 * @property {(store: DataStore) => Promise<ProfileSession>} openProfiles
 * @property {(session: ProfileSession) => Promise<readonly UserProfile[]>} listProfiles
 * @property {(session: ProfileSession, name: string) => Promise<UserProfile>} createProfile
 * @property {(session: ProfileSession, id: UserProfileId) => Promise<ActiveProfile>} selectProfile
 */

/** @type {Promise<ProfilesImplementation> | null} */
let selected = null;

/** @returns {Promise<ProfilesImplementation>} */
function impl() {
  if (selected === null) {
    const env = /** @type {{ process?: { env?: Record<string, string | undefined> } }} */ (globalThis).process?.env;
    if (env?.PROFILES_IMPL === 'null') {
      const nullDouble = './null_double.js'; // test-only; not a runtime source, so never inlined by the build
      selected = import(nullDouble);
    } else {
      selected = import('./src/profiles.js');
    }
  }
  return selected;
}
