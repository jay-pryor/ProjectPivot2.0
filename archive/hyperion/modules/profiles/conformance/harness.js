/**
 * Test support for the profiles conformance suite (CORE-CON-002). Not a test file: the
 * runner collects `*.test.js` only.
 *
 * Section 2 of modules/profiles/CONTRACT.md: a conformance test opens a `DataStore` on an
 * in-memory folder the same way the store suite does, and holds the baseline clock where a
 * clause names it. So this file imports only what modules/profiles/manifest.yaml declares
 * (CORE-CON-003, `declared`): baseline/types, baseline/clock, modules/store/contract, and,
 * from test code alone, modules/store/conformance/harness for the in-memory folder and its
 * fixtures.
 *
 * The folder's layout is store's and is explicitly not promised by profiles, so the one
 * file store writes for profiles is learned by asking store (`profilesFileName`), never
 * named here. Another copy of Pivot creating a profile is played by `store.putProfile` on a
 * second `DataStore` over the same folder; a file written by something other than Pivot is
 * planted through the folder's back door.
 */

import * as store from '../../store/contract.js';
import * as profiles from '../contract.js';
import { MemoryFolder, newProfile, profilesFileText } from '../../store/conformance/harness.js';

export { MemoryFolder, newProfile, nowAest, pick, prng, profilesFileText } from '../../store/conformance/harness.js';

/** @typedef {import('../../../baseline/types.js').UserProfile} UserProfile */
/** @typedef {import('../../store/contract.js').DataStore} DataStore */
/** @typedef {import('../contract.js').ProfileSession} ProfileSession */

/** The one seed this suite's property tests use (CORE-TST-001); change it only on purpose, and record why. */
export const SEED = 0x50524f46;

// ------------------------------------------------------------------ opening

/**
 * @param {MemoryFolder} folder
 * @returns {Promise<DataStore>} one copy of Pivot's open of the folder
 */
export function openStore(folder) {
  return store.openDataFolder(folder.handle);
}

/**
 * A session on a fresh `DataStore` over `folder`: one open of Pivot.
 * @param {MemoryFolder} folder
 * @returns {Promise<ProfileSession>}
 */
export async function openSession(folder) {
  return profiles.openProfiles(await openStore(folder));
}

/** @type {Promise<string> | null} */
let profilesFile = null;

/**
 * The path, relative to the data folder, of the file store writes profiles to: learned by
 * watching store write one into a scratch folder, so the suite never names the layout.
 * @returns {Promise<string>}
 */
export function profilesFileName() {
  if (profilesFile === null) {
    profilesFile = (async () => {
      const scratch = new MemoryFolder();
      await store.putProfile(await openStore(scratch), newProfile('probe'));
      const files = scratch.list();
      if (files.length !== 1) throw new Error(`store wrote ${files.length} files for one profile; the suite expected one`);
      return files[0];
    })();
  }
  return profilesFile;
}

/**
 * Overwrite the profiles file as some program other than Pivot would, with `text`.
 * @param {MemoryFolder} folder
 * @param {string} text
 */
export async function plantProfilesFile(folder, text) {
  folder.write(await profilesFileName(), text);
}

/**
 * The text of a profiles file another copy of Pivot would write for these profiles.
 * @param {UserProfile[]} list
 * @returns {Promise<string>}
 */
export function profilesFileFor(list) {
  /** @type {Record<string, UserProfile>} */
  const keyed = {};
  for (const p of list) keyed[p.id] = p;
  return profilesFileText(keyed);
}

// ------------------------------------------------------------------ the C-005 order

/**
 * Compare two strings by code point, not by UTF-16 code unit and not by locale.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function codePointCompare(a, b) {
  const as = [...a];
  const bs = [...b];
  const n = Math.min(as.length, bs.length);
  for (let i = 0; i < n; i += 1) {
    const d = /** @type {number} */ (as[i].codePointAt(0)) - /** @type {number} */ (bs[i].codePointAt(0));
    if (d !== 0) return d;
  }
  return as.length - bs.length;
}

/**
 * A name as C-002 and C-005 compare it: trimmed and without regard to case. The names
 * this suite uses fold the same way upward and downward, so the direction is not a
 * reading the suite takes.
 * @param {string} name
 * @returns {string}
 */
export function foldName(name) {
  return name.trim().toLowerCase();
}

/**
 * The order C-005 promises: by name compared without regard to case by code point, then
 * by id where the folded names are equal.
 * @param {Iterable<UserProfile>} list
 * @returns {UserProfile[]}
 */
export function inContractOrder(list) {
  return [...list].sort((a, b) => codePointCompare(foldName(a.name), foldName(b.name)) || codePointCompare(a.id, b.id));
}

// ------------------------------------------------------------------ the browser's storage

/**
 * Run `fn` with `localStorage` and `sessionStorage` present on `globalThis` as spies that
 * record every write, for C-003 and C-006 ("the browser's storage is untouched"). Node has
 * neither by default; if the runtime ever supplies one, the real object is restored after.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<{ result: T, writes: string[] }>} what fn returned and every write made
 */
export async function withBrowserStorageSpies(fn) {
  /** @type {string[]} */
  const writes = [];
  /** @param {string} which */
  const spy = (which) => ({
    length: 0,
    /** @param {string} key */
    getItem: (key) => (writes.push(`${which}.getItem(${key})`), null), // a read is not a write, but recorded so a test can see it
    /** @param {string} key @param {string} value */
    setItem: (key, value) => { writes.push(`${which}.setItem(${key}=${value})`); },
    /** @param {string} key */
    removeItem: (key) => { writes.push(`${which}.removeItem(${key})`); },
    clear: () => { writes.push(`${which}.clear()`); },
    /** @param {number} _i */
    key: (_i) => null,
  });
  const g = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (globalThis));
  const saved = { localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), sessionStorage: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage') };
  Object.defineProperty(globalThis, 'localStorage', { value: spy('localStorage'), configurable: true, writable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: spy('sessionStorage'), configurable: true, writable: true });
  try {
    const result = await fn();
    return { result, writes: writes.filter((w) => !w.includes('.getItem(')) };
  } finally {
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete g[name];
    }
  }
}
