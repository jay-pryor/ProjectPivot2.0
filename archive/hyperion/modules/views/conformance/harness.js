/**
 * Test support for the views conformance suite (CORE-CON-002), at contract 11.0. Not a test
 * file: the runner collects `*.test.js` only.
 *
 * Section 2 of modules/views/CONTRACT.md: `openFolder` is the path a conformance test takes,
 * with a handle from `store`'s in-memory folder; `chooseFolder`, `chooseSaveState`,
 * `chooseExportTarget`, and `chooseReportExportTarget` talk to the browser and are verified by
 * demonstration. So this file imports only what modules/views/manifest.yaml declares
 * (CORE-CON-003, `declared`): the baseline types, schema, messages, faults, and clock, the ten
 * contracts views calls, and, from test code alone, modules/store/conformance/harness for the
 * folder, the browser's storage, and the export file.
 *
 * What the suite compares a screen against is asked of the module that owns it, on the body
 * that screen is built from: the profiles `profiles.listProfiles` gives, the hazards
 * `registry.listHazards` gives, the rows `registry.listPlatformHazards` gives, the band
 * `rating.ratingFor` gives, the two lists `review-schedule` gives, and so on. The working body
 * an app holds is read back without reaching inside the app: every change views makes is told
 * to `store.noteChange` with that body (C-012), and store C-015 mirrors it to the browser's
 * storage, so `heldBody` reads the mirror, or the loaded body before any change.
 *
 * Every scenario runs inside `inBrowser`, which puts an in-memory `localStorage` on
 * `globalThis` (store's harness): without one `noteChange` resolves with a `mirrorError`, and
 * every change would carry section 4's warning for it.
 *
 * "No module operation was called" (C-002) is observed where a module operation leaves a
 * trace: every look-up, read, and write reaching the folder, every write to the browser's
 * storage, and the body held, which a registry call that should not have happened would
 * change.
 */

import assert from 'node:assert/strict';

import * as views from '../contract.js';
import * as store from '../../store/contract.js';
import * as profiles from '../../profiles/contract.js';
import * as registry from '../../registry/contract.js';
import * as rating from '../../rating/contract.js';
import * as changeLog from '../../change-log/contract.js';
import * as reviewSchedule from '../../review-schedule/contract.js';
import * as referenceRegister from '../../reference-register/contract.js';
import * as workflows from '../../workflows/contract.js';
import * as bowtie from '../../bowtie/contract.js';
import * as reports from '../../reports/contract.js';
import * as schema from '../../../baseline/schema.js';
import { dateAest, timestampAest } from '../../../baseline/types.js';
import { fixClock, releaseClock } from '../../../baseline/clock.js';
import { disarm_all } from '../../../baseline/faults.js';
import { MemoryFolder, dataFileText, newProfile, withBrowserStorage } from '../../store/conformance/harness.js';

export {
  MemoryExportFile, MemoryFolder, activeOf, bodyWithHazards, dataFileText, hazardRecord, incomingFile, mirrorText, newProfile,
  nowAest, pick, plantBackup, prng, profilesFileText, tamperedText,
} from '../../store/conformance/harness.js';

/** @typedef {import('../../../baseline/types.js').UserProfile} UserProfile */
/** @typedef {import('../../../baseline/types.js').ActiveProfile} ActiveProfile */
/** @typedef {import('../../../baseline/types.js').RecordRef} RecordRef */
/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */
/** @typedef {import('../../../baseline/schema.js').SaveStamp} SaveStamp */
/** @typedef {import('../../store/conformance/harness.js').MemoryStorage} MemoryStorage */
/** @typedef {import('../contract.js').App} App */
/** @typedef {import('../contract.js').Screen} Screen */
/** @typedef {import('../contract.js').ScreenKind} ScreenKind */
/** @typedef {{ local: MemoryStorage, session: MemoryStorage, absent: () => void, present: () => void }} BrowserEnv */

/** The one seed this suite's property tests use (CORE-TST-001); change it only on purpose, and record why. */
export const SEED = 0x56494557;

// ------------------------------------------------------------------ values

/**
 * A value as it is after JSON serialisation and parsing: section 3 promises a `Screen`
 * survives that unchanged, so the suite compares screens in this form.
 * @param {unknown} value
 * @returns {any}
 */
export function plain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * The error a call rejects with; fails the test if it resolves.
 * @param {() => Promise<unknown>} call
 * @returns {Promise<any>}
 */
export async function rejectionOf(call) {
  try {
    await call();
  } catch (e) {
    return e;
  }
  assert.fail('expected a rejection');
}

/**
 * Assert the screen is a `Screen` of this kind, `app.screen` is deep-equal to it (C-001), and
 * it survives JSON unchanged (section 3). Returns it for chaining.
 * @param {App} app
 * @param {Screen} screen what the operation resolved with
 * @param {ScreenKind} kind
 * @returns {any}
 */
export function expectScreen(app, screen, kind) {
  assert.equal(screen.kind, kind, `the screen is the ${kind} screen (got ${screen.kind}${screen.messages?.length ? `, messages ${JSON.stringify(screen.messages)}` : ''})`);
  assert.deepEqual(plain(app.screen), plain(screen), 'app.screen is deep-equal to what the operation resolved with (C-001)');
  assert.deepEqual(plain(screen), screen, 'the screen is plain data that survives JSON unchanged (section 3)');
  assert.ok(Array.isArray(screen.messages), 'messages is a list');
  return screen;
}

/**
 * Assert the screen carries exactly one message, of this severity, and return it.
 * @param {Screen} screen
 * @param {'error' | 'warning' | 'info'} severity
 * @returns {import('../../../baseline/messages.js').UserMessage}
 */
export function oneMessage(screen, severity) {
  assert.equal(screen.messages.length, 1, `exactly one message (got ${JSON.stringify(screen.messages)})`);
  const [m] = screen.messages;
  assert.equal(m.severity, severity, `the message is of severity ${severity}`);
  assert.ok(Array.isArray(m.items), 'the message has items');
  return m;
}

/**
 * Assert some item of the message names `thing`. Section 4 promises the items name it and
 * leaves the wording open, so an item that is the thing and an item that contains it both
 * pass.
 * @param {import('../../../baseline/messages.js').UserMessage} m
 * @param {string} thing
 * @param {string} what for the failure text
 */
export function itemsName(m, thing, what) {
  assert.ok(m.items.some((item) => item.includes(thing)), `the message's items name ${what} ${JSON.stringify(thing)} (got ${JSON.stringify(m.items)})`);
}

/**
 * Assert the screen carries no message.
 * @param {Screen} screen
 * @param {string} [label]
 */
export function noMessages(screen, label = '') {
  assert.deepEqual(plain(screen.messages), [], `${label}${label ? ': ' : ''}no messages`);
}

/**
 * The screen with `messages` taken out, for "nothing on it but `messages` changed" (section 4).
 * @param {Screen} screen
 * @returns {any}
 */
export function withoutMessages(screen) {
  const { messages, ...rest } = plain(screen);
  return rest;
}

// ------------------------------------------------------------------ the browser, the clock, the fault points

/**
 * Run a scenario with an in-memory `localStorage` on `globalThis` (store C-015), the clock
 * released and every fault point disarmed afterwards, whatever happened.
 * @template T
 * @param {(env: BrowserEnv) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export function inBrowser(fn) {
  return withBrowserStorage(async (env) => {
    try {
      return await fn(env);
    } finally {
      releaseClock();
      disarm_all();
    }
  });
}

/**
 * Fix the baseline clock at noon AEST on a calendar date.
 * @param {string} date `YYYY-MM-DD`
 */
export function clockOn(date) {
  fixClock(timestampAest(`${date}T12:00:00+10:00`));
}

/**
 * @param {string} s `YYYY-MM-DD`
 * @returns {import('../../../baseline/types.js').DateAest}
 */
export function day(s) {
  return dateAest(s);
}

// ------------------------------------------------------------------ opening an app

/**
 * An app with the folder open, on the profile screen.
 * @param {MemoryFolder} folder
 * @returns {Promise<App>}
 */
export async function openApp(folder) {
  const app = await views.start();
  const screen = await views.openFolder(app, folder.handle);
  assert.equal(screen.kind, 'profile', `the folder opened to the profile screen (got ${screen.kind}, ${JSON.stringify(screen.messages)})`);
  return app;
}

/**
 * The id of the listed profile with this name on a profile screen.
 * @param {Screen} screen
 * @param {string} name
 * @returns {import('../../../baseline/types.js').UserProfileId}
 */
export function listedId(screen, name) {
  assert.equal(screen.kind, 'profile');
  const found = /** @type {import('../contract.js').ProfileScreen} */ (screen).profiles.find((p) => p.name === name);
  assert.ok(found, `a profile named ${name} is listed`);
  return found.id;
}

/**
 * An app with the folder open and the profile named `name` selected, creating it through
 * the app when the folder does not list it: on the hazards screen. The browser's storage must
 * hold no unsaved working state, or selection shows the recover screen (C-013).
 * @param {MemoryFolder} folder
 * @param {string} name
 * @returns {Promise<App>}
 */
export async function selectedApp(folder, name) {
  const app = await openApp(folder);
  const listed = /** @type {import('../contract.js').ProfileScreen} */ (app.screen).profiles;
  if (!listed.some((p) => p.name === name)) await views.createProfile(app, name);
  const screen = await views.selectProfile(app, listedId(app.screen, name));
  assert.equal(screen.kind, 'hazards', `${name} is selected (got ${screen.kind}, ${JSON.stringify(screen.messages)})`);
  return app;
}

/**
 * Call `back` until the app is on the hazards screen.
 * @param {App} app
 * @returns {Promise<any>}
 */
export async function toHazards(app) {
  for (let i = 0; i < 4 && app.screen.kind !== 'hazards'; i += 1) await views.back(app);
  assert.equal(app.screen.kind, 'hazards', 'back reached the hazards screen');
  return app.screen;
}

/**
 * Assert an operation resolved with a screen of this kind and carrying no message, and return it.
 * @param {App} app
 * @param {Promise<Screen>} call
 * @param {ScreenKind} kind
 * @returns {Promise<any>}
 */
export async function step(app, call, kind) {
  const screen = expectScreen(app, await call, kind);
  noMessages(screen, `the ${kind} screen`);
  return screen;
}

// ------------------------------------------------------------------ asking the owners

/**
 * @param {MemoryFolder} folder
 * @returns {Promise<import('../../store/contract.js').DataStore>}
 */
export function openStore(folder) {
  return store.openDataFolder(folder.handle);
}

/**
 * What `profiles.listProfiles` gives for the folder now, on a session of the suite's own.
 * @param {MemoryFolder} folder
 * @returns {Promise<UserProfile[]>}
 */
export async function listedProfiles(folder) {
  return plain(await profiles.listProfiles(await profiles.openProfiles(await openStore(folder))));
}

/**
 * The stored profile with this name.
 * @param {MemoryFolder} folder
 * @param {string} name
 * @returns {Promise<UserProfile>}
 */
export async function profileNamed(folder, name) {
  const found = (await listedProfiles(folder)).find((p) => p.name === name);
  assert.ok(found, `a stored profile named ${name}`);
  return found;
}

/**
 * What `store.load` gives for the folder now, on a `DataStore` of the suite's own.
 * @param {MemoryFolder} folder
 * @returns {Promise<{ body: DataBody, lastSave: SaveStamp | null }>}
 */
export async function loaded(folder) {
  return plain(await store.load(await openStore(folder)));
}

/**
 * What `registry.listHazards` gives of the body `store.load` gives for the folder now.
 * @param {MemoryFolder} folder
 * @returns {Promise<import('../../registry/contract.js').Hazard[]>}
 */
export async function storedHazards(folder) {
  return plain(await registry.listHazards((await loaded(folder)).body));
}

/**
 * The working body the app last told `store` of: the mirror in the browser's storage (store
 * C-015, views C-012), or, before any change, the body `store.load` gives.
 * @param {BrowserEnv} env
 * @param {MemoryFolder} folder
 * @returns {Promise<DataBody>}
 */
export async function heldBody(env, folder) {
  const mirror = env.local.mirror();
  return mirror === null ? (await loaded(folder)).body : plain(mirror.body);
}

/**
 * The one change-log entry `after` holds that `before` did not: the entry of the act made
 * between them. `listEntries` orders by `createdAtAest` then a fresh id (change-log C-009), and
 * a test must not assume what `fresh` returns (DEC-005), so an act's entry is found by what is
 * new and never by position.
 * @param {DataBody} before
 * @param {DataBody} after
 * @returns {Promise<any>}
 */
export async function newEntry(before, after) {
  const seen = new Set((await changeLog.listEntries(before)).map((e) => e.id));
  const added = plain(await changeLog.listEntries(after)).filter((/** @type {any} */ e) => !seen.has(e.id));
  assert.equal(added.length, 1, `the act appended one entry (got ${added.length})`);
  return added[0];
}

/**
 * The `Reviews` C-031 builds for a body.
 * @param {DataBody} body
 * @returns {Promise<any>}
 */
export async function reviewsOf(body) {
  return { schedules: plain(await reviewSchedule.listSchedules(body)), overdue: plain(await reviewSchedule.listOverdue(body)) };
}

/**
 * The `Files` C-035 builds for a body and a folder.
 * @param {DataBody} body
 * @param {MemoryFolder} folder
 * @returns {Promise<any>}
 */
export async function filesOf(body, folder) {
  return plain(await referenceRegister.checkEntryFiles(body, await openStore(folder)));
}

/**
 * One platform's query as C-020 shows it: the rows each with the band `rating` gives for its
 * residual (C-021), and the omitted hazards.
 * @param {DataBody} body
 * @param {string} platformId
 * @returns {Promise<{ platform: any, rows: any[], omitted: any[] }>}
 */
export async function platformView(body, platformId) {
  const q = plain(await registry.listPlatformHazards(body, /** @type {any} */ (platformId)));
  const rows = [];
  for (const row of q.rows) rows.push({ ...row, residualRating: plain(await rating.ratingFor(row.residual.consequence, row.residual.likelihood)) });
  return { platform: q.platform, rows, omitted: q.omitted };
}

/**
 * Every live hazard, control, and platform of a body, as `registry` lists them.
 * @param {DataBody} body
 */
export async function liveLists(body) {
  return {
    hazards: plain(await registry.listHazards(body)),
    controls: plain(await registry.listControls(body)),
    platforms: plain(await registry.listPlatforms(body)),
  };
}

/**
 * The name of a platform by section 3's rule: the live platform's name, or the id.
 * @param {DataBody} body
 * @param {string} id
 * @returns {Promise<string>}
 */
export async function platformName(body, id) {
  const found = (await registry.listPlatforms(body)).find((p) => p.id === id);
  return found ? found.name : id;
}

/**
 * A registry `Act` for a profile, made for no platform or for one.
 * @param {UserProfile} profile
 * @param {string | null} [platformId]
 * @returns {any}
 */
export function actOf(profile, platformId = null) {
  return { profile: { id: profile.id, name: profile.name }, madeForPlatformId: platformId };
}

/**
 * A `ScheduleAct` for a profile over a body: made for no platform, reaching what
 * `registry.platformsAffected` gives for the ref.
 * @param {DataBody} body
 * @param {UserProfile} profile
 * @param {RecordRef} ref
 * @returns {Promise<any>}
 */
export async function scheduleActOf(body, profile, ref) {
  const affected = ref.kind === 'reference-entry' ? [] : plain(await registry.platformsAffected(body, ref));
  return { ...actOf(profile), affectedPlatformIds: affected };
}

// ------------------------------------------------------------------ files as another program leaves them

/**
 * Write data.json as another copy of Pivot would, holding `body`, whatever it contains.
 * @param {MemoryFolder} folder
 * @param {DataBody} body
 * @param {UserProfile} by whose stamp it carries
 */
export async function plantData(folder, body, by) {
  folder.write(schema.DATA_FOLDER.data, await dataFileText(body, schema.freshStamp(by.id)));
}

/**
 * Store profiles in the folder as another copy of Pivot would.
 * @param {MemoryFolder} folder
 * @param {string[]} names
 * @returns {Promise<UserProfile[]>}
 */
export async function plantProfiles(folder, names) {
  const s = await openStore(folder);
  const out = [];
  for (const name of names) {
    const p = newProfile(name);
    await store.putProfile(s, p);
    out.push(p);
  }
  return out;
}

/**
 * Another copy of Pivot saving, as a user who may or may not be a stored profile: `store`
 * and `registry` called directly, one hazard per title added to what the folder holds.
 * @param {MemoryFolder} folder
 * @param {ActiveProfile} as
 * @param {string[]} titles
 * @returns {Promise<SaveStamp>} the stamp written
 */
export async function anotherCopySaves(folder, as, titles) {
  const s = await openStore(folder);
  let { body } = await store.load(s);
  for (const title of titles) body = (await registry.createHazard(body, { profile: as, madeForPlatformId: null }, { title })).body;
  return plain((await store.save(s, as, body)).stamp);
}

/**
 * Another copy of Pivot saving a body it built: `store` called directly.
 * @param {MemoryFolder} folder
 * @param {UserProfile} as
 * @param {DataBody} body
 */
export async function saveBody(folder, as, body) {
  const s = await openStore(folder);
  await store.load(s);
  await store.save(s, { id: as.id, name: as.name }, body);
}

/**
 * The `StoreReadError` `store` gives for the folder as it is now, from `load` or
 * `readProfiles`, so a test learns the file the message must name from the owner.
 * @param {MemoryFolder} folder
 * @param {'load' | 'readProfiles'} which
 * @returns {Promise<import('../../store/contract.js').StoreReadError>}
 */
export async function storeReadErrorOf(folder, which) {
  const error = await rejectionOf(async () => store[which](await openStore(folder)));
  assert.ok(error instanceof store.StoreReadError, `store.${which} rejects with StoreReadError for this folder`);
  return error;
}

/**
 * Every file under `Superseded Saves`.
 * @param {MemoryFolder} folder
 * @returns {string[]}
 */
export function supersededFiles(folder) {
  return folder.list().filter((rel) => rel.startsWith(`${schema.DATA_FOLDER.supersededSaves}/`));
}

/**
 * Every file under `backups/`.
 * @param {MemoryFolder} folder
 * @returns {string[]}
 */
export function backupFiles(folder) {
  return folder.listUnder(schema.DATA_FOLDER.backups);
}

/**
 * Bad data.json texts: each fails `schema.open` for the reason named.
 * @param {DataBody} body a body to tamper with
 * @param {UserProfile} by
 * @returns {Promise<[string, string][]>}
 */
export async function badDataTexts(body, by) {
  const good = await dataFileText(body, schema.freshStamp(by.id));
  const tampered = JSON.parse(good);
  tampered.body.sequences.hazard += 7;
  return [
    ['unreadable', 'this is not JSON {'],
    ['not-a-pivot-file', '[]'],
    ['integrity-failed', JSON.stringify(tampered, null, 2)],
  ];
}

/**
 * A body with one record of a collection replaced by a value its owner refuses to read, the
 * rest as built. `mutate` changes the copy of the record in place.
 * @param {DataBody} body
 * @param {string} collection
 * @param {string} key
 * @param {(record: any) => void} mutate
 * @returns {DataBody}
 */
export function malformed(body, collection, key, mutate) {
  const copy = plain(body);
  assert.ok(copy.collections[collection]?.[key], `the body holds ${collection} ${key}`);
  mutate(copy.collections[collection][key]);
  return copy;
}

/**
 * The key of the one record of a collection whose fields match.
 * @param {DataBody} body
 * @param {string} collection
 * @param {(record: any) => boolean} matches
 * @returns {string}
 */
export function keyOf(body, collection, matches) {
  const keys = Object.entries(/** @type {Record<string, any>} */ (body.collections[collection] ?? {})).filter(([, r]) => matches(r)).map(([k]) => k);
  assert.equal(keys.length, 1, `exactly one ${collection} record matches (got ${keys.length})`);
  return keys[0];
}

// ------------------------------------------------------------------ watching the folder and the browser

/**
 * Record every look-up, read, and write that reaches the folder until `stop`, keeping
 * whatever `failWrite` or `denyRead` was set.
 * @param {MemoryFolder} folder
 * @returns {{ touched: string[], writes: () => string[], stop: () => void }}
 */
export function recordAccess(folder) {
  /** @type {string[]} */
  const touched = [];
  const { failWrite, denyRead } = folder.control;
  folder.control.failWrite = (rel) => { touched.push(`write ${rel}`); return failWrite(rel); };
  folder.control.denyRead = (rel) => { touched.push(`read ${rel}`); return denyRead(rel); };
  return {
    touched,
    writes: () => touched.filter((t) => t.startsWith('write ')),
    stop() {
      folder.control.failWrite = failWrite;
      folder.control.denyRead = denyRead;
    },
  };
}

/**
 * Call a view operation that section 4 says resolves with the screen as before and one message;
 * assert the severity, that nothing but `messages` changed, and that nothing was told to `store`
 * or written anywhere. Returns the message.
 * @param {{ app: App, folder: MemoryFolder, env: BrowserEnv }} w
 * @param {() => Promise<Screen>} call
 * @param {'error' | 'warning' | 'info'} severity
 * @param {string} label
 */
export async function refusedAsBefore(w, call, severity, label) {
  const before = plain(w.app.screen);
  const written = everywhere(w.folder, w.env);
  const screen = expectScreen(w.app, await call(), before.kind);
  const m = oneMessage(screen, severity);
  assert.deepEqual(withoutMessages(screen), withoutMessages(before), `${label}: nothing on the screen but messages changed`);
  assert.deepEqual(everywhere(w.folder, w.env), written, `${label}: noteChange not called, nothing written`);
  return m;
}

/**
 * Everything written anywhere a view may cause a write: the folder's files and the browser's storage.
 * @param {MemoryFolder} folder
 * @param {BrowserEnv} env
 */
export function everywhere(folder, env) {
  return { files: folder.snapshot(), storage: Object.fromEntries(env.local.items), storageWrites: env.local.writes.length };
}

// ------------------------------------------------------------------ building through the screens

/**
 * Add hazards on the hazards screen; the ids of the hazards added, in order.
 * @param {App} app on the hazards screen
 * @param {string[]} titles
 * @returns {Promise<string[]>}
 */
export async function addHazards(app, titles) {
  const ids = [];
  for (const title of titles) {
    const screen = await step(app, views.addHazard(app, { title }), 'hazards');
    ids.push(screen.hazards[screen.hazards.length - 1].id);
  }
  return ids;
}

/**
 * Create controls in the library from the hazards screen, and come back; their ids, in order.
 * @param {App} app on the hazards screen
 * @param {string[]} titles
 * @returns {Promise<string[]>}
 */
export async function addControls(app, titles) {
  await step(app, views.openControls(app), 'controls');
  const ids = [];
  for (const title of titles) {
    const before = /** @type {any} */ (app.screen).controls.map((/** @type {any} */ c) => c.id);
    const screen = await step(app, views.createControl(app, { title }), 'controls');
    const added = screen.controls.filter((/** @type {any} */ c) => !before.includes(c.id));
    assert.equal(added.length, 1, `one control created for ${title}`);
    ids.push(added[0].id);
  }
  await step(app, views.back(app), 'hazards');
  return ids;
}

/**
 * Create platforms from the hazards screen, each with its owner, and come back; their ids.
 * @param {App} app on the hazards screen
 * @param {{ name: string, ownerProfileId: string }[]} specs
 * @returns {Promise<string[]>}
 */
export async function addPlatforms(app, specs) {
  await step(app, views.openPlatforms(app), 'platforms');
  const ids = [];
  for (const spec of specs) {
    const before = /** @type {any} */ (app.screen).platforms.map((/** @type {any} */ p) => p.id);
    const screen = await step(app, views.createPlatform(app, /** @type {any} */ (spec)), 'platforms');
    const added = screen.platforms.filter((/** @type {any} */ p) => !before.includes(p.id));
    assert.equal(added.length, 1, `one platform created for ${spec.name}`);
    ids.push(added[0].id);
  }
  await step(app, views.back(app), 'hazards');
  return ids;
}

/**
 * From the hazards screen to one hazard's screen.
 * @param {App} app
 * @param {string} hazardId
 * @returns {Promise<any>}
 */
export async function toHazard(app, hazardId) {
  return step(app, views.openHazard(app, /** @type {any} */ (hazardId)), 'hazard');
}

/**
 * From the hazards screen to one platform's screen, through the platforms screen.
 * @param {App} app
 * @param {string} platformId
 * @returns {Promise<any>}
 */
export async function toPlatform(app, platformId) {
  await step(app, views.openPlatforms(app), 'platforms');
  const screen = expectScreen(app, await views.openPlatform(app, /** @type {any} */ (platformId)), 'platform');
  return screen;
}

/**
 * From the hazards screen to one hazard's assessment on one platform.
 * @param {App} app
 * @param {string} platformId
 * @param {string} hazardId
 * @returns {Promise<any>}
 */
export async function toAssessment(app, platformId, hazardId) {
  await toPlatform(app, platformId);
  return expectScreen(app, await views.openAssessment(app, /** @type {any} */ (hazardId)), 'assessment');
}

/**
 * Link hazards to a platform from its screen, starting and ending on the hazards screen.
 * @param {App} app
 * @param {string} platformId
 * @param {string[]} hazardIds
 */
export async function linkHazards(app, platformId, hazardIds) {
  await toPlatform(app, platformId);
  for (const id of hazardIds) expectScreen(app, await views.linkHazardToPlatform(app, /** @type {any} */ (id)), 'platform');
  await toHazards(app);
}

/**
 * Link controls to a hazard from its screen, starting and ending on the hazards screen. Fails
 * if the hazard is already on two platforms, which gates the link (C-027).
 * @param {App} app
 * @param {string} hazardId
 * @param {[string, 'preventative' | 'mitigating'][]} controls
 */
export async function linkControls(app, hazardId, controls) {
  await toHazard(app, hazardId);
  for (const [id, kind] of controls) await step(app, views.linkControlToHazard(app, /** @type {any} */ (id), kind), 'hazard');
  await toHazards(app);
}

/**
 * The entry of a list with this id.
 * @template {{ id: string }} T
 * @param {readonly T[]} list
 * @param {string} id
 * @returns {T}
 */
export function byId(list, id) {
  const found = list.find((x) => x.id === id);
  assert.ok(found, `an entry with id ${id}`);
  return found;
}

/**
 * The `PlatformControl` of a control in a list of them.
 * @param {readonly any[]} controls
 * @param {string} controlId
 * @returns {any}
 */
export function controlIn(controls, controlId) {
  const found = controls.find((c) => c.control.id === controlId);
  assert.ok(found, `control ${controlId} is listed`);
  return found;
}

/**
 * The world most scenarios start from, built through the screens and saved, the app back on
 * the hazards screen:
 *
 * - profiles Alice (selected) and Bob;
 * - hazards `fire` (causal factor "Fuel leak", consequence "Loss of aircraft", control
 *   `bottle` preventative and `drill` mitigating), `bird` (control `radar` preventative), and
 *   `brakes` (nothing against it);
 * - platforms `alpha` owned by Alice and `bravo` owned by Bob;
 * - on alpha: `fire` with `bottle` confirmed, `drill` excluded "Not fitted", initial 4B and
 *   residual 2D; and `bird`, `radar` awaiting;
 * - on bravo: `fire`, every control awaiting, no rating.
 *
 * `fire` is on two platforms, so the four changing operations of its screen are gated (C-027).
 * @param {BrowserEnv} env
 * @param {string} [folderName]
 */
export async function buildWorld(env, folderName = 'World') {
  const folder = new MemoryFolder(folderName);
  const [alice, bob] = await plantProfiles(folder, ['Alice', 'Bob']);
  const app = await selectedApp(folder, 'Alice');
  const [fire, bird, brakes] = await addHazards(app, ['Engine fire', 'Bird strike', 'Hot brakes']);
  const [bottle, drill, radar] = await addControls(app, ['Fire bottle', 'Crew drill', 'Weather radar']);

  await toHazard(app, fire);
  await step(app, views.addCausalFactor(app, { text: 'Fuel leak' }), 'hazard');
  await step(app, views.addConsequence(app, { text: 'Loss of aircraft' }), 'hazard');
  await step(app, views.linkControlToHazard(app, /** @type {any} */ (bottle), 'preventative'), 'hazard');
  await step(app, views.linkControlToHazard(app, /** @type {any} */ (drill), 'mitigating'), 'hazard');
  await toHazards(app);
  await linkControls(app, bird, [[radar, 'preventative']]);

  const [alpha, bravo] = await addPlatforms(app, [{ name: 'Alpha', ownerProfileId: alice.id }, { name: 'Bravo', ownerProfileId: bob.id }]);
  await toPlatform(app, alpha);
  await step(app, views.linkHazardToPlatform(app, /** @type {any} */ (fire)), 'platform');
  await step(app, views.linkHazardToPlatform(app, /** @type {any} */ (bird)), 'platform');
  await step(app, views.openAssessment(app, /** @type {any} */ (fire)), 'assessment');
  await step(app, views.confirmControlForPlatform(app, /** @type {any} */ (bottle)), 'assessment');
  await step(app, views.excludeControlFromPlatform(app, /** @type {any} */ (drill), 'Not fitted'), 'assessment');
  await step(app, views.enterRating(app, 'initial', /** @type {any} */ ({ consequence: 4, likelihood: 'B' })), 'assessment');
  await step(app, views.enterRating(app, 'residual', /** @type {any} */ ({ consequence: 2, likelihood: 'D' })), 'assessment');
  await toHazards(app);
  await linkHazards(app, bravo, [fire]);
  await step(app, views.save(app), 'hazards');

  return {
    env, folder, app, alice, bob,
    hazards: { fire, bird, brakes },
    controls: { bottle, drill, radar },
    platforms: { alpha, bravo },
  };
}

// ------------------------------------------------------------------ the C-002 table

/** @type {Record<ScreenKind, string[]>} */
export const OPERATIONS_OF = Object.freeze({
  folder: ['chooseFolder', 'openFolder'],
  check: ['acknowledgeCheck'],
  profile: ['createProfile', 'selectProfile'],
  recover: ['acceptRecovery', 'declineRecovery'],
  hazards: ['addHazard', 'save', 'beginRestore', 'openHazard', 'openControls', 'openPlatforms', 'openHistory', 'openAcknowledgements', 'openReferences', 'openWorkflows', 'openReports', 'openFilter', 'openDashboard', 'openOpenItems'],
  restore: ['chooseSaveState', 'prepareRestore', 'cancelRestore'],
  'confirm-restore': ['confirmRestore', 'cancelRestore'],
  hazard: ['renameHazard', 'addCausalFactor', 'addConsequence', 'linkControlToHazard', 'retireHazard', 'setReviewTempo', 'back'],
  controls: ['createControl', 'retireControl', 'setReviewTempo', 'back'],
  platforms: ['createPlatform', 'openPlatform', 'retirePlatform', 'setPlatformOwner', 'setReviewTempo', 'back'],
  platform: ['linkHazardToPlatform', 'openAssessment', 'back'],
  assessment: ['setReportId', 'enterRating', 'confirmControlForPlatform', 'excludeControlFromPlatform', 'openBowtie', 'back'],
  bowtie: ['chooseExportTarget', 'exportBowtie', 'back'],
  history: ['back'],
  acknowledge: ['acknowledgeChange', 'back'],
  references: ['createReference', 'openReference', 'back'],
  reference: ['linkReference', 'back'],
  workflows: ['startWorkflow', 'openWorkflow', 'back'],
  workflow: ['submitStep', 'advanceStep', 'completeWorkflow', 'abandonWorkflow', 'back'],
  reports: ['createTemplate', 'beginReport', 'openReport', 'back'],
  'prepare-report': ['produceReport', 'back'],
  report: ['chooseReportExportTarget', 'exportReport', 'back'],
  filter: ['applyFilter', 'back'],
  dashboard: ['back'],
  'open-items': ['back'],
  'confirm-edit': ['confirmEdit', 'cancelEdit'],
});

export const ALL_OPERATIONS = Object.freeze([...new Set(Object.values(OPERATIONS_OF).flat())]);

/** The thirty-two operations C-002 says change the working body, the stored data, the backups, or the browser's storage. */
export const CHANGING_OPERATIONS = Object.freeze([
  'acceptRecovery', 'declineRecovery', 'addHazard', 'save', 'confirmRestore', 'renameHazard', 'addCausalFactor', 'addConsequence',
  'linkControlToHazard', 'retireHazard', 'createControl', 'retireControl', 'createPlatform', 'retirePlatform', 'setPlatformOwner',
  'linkHazardToPlatform', 'setReportId', 'enterRating', 'confirmControlForPlatform', 'excludeControlFromPlatform', 'acknowledgeChange',
  'setReviewTempo', 'createReference', 'linkReference', 'startWorkflow', 'submitStep', 'advanceStep', 'completeWorkflow',
  'abandonWorkflow', 'createTemplate', 'produceReport', 'confirmEdit',
]);

/**
 * Call an operation of the contract by name, with the argument of that name from `a`.
 * @param {App} app
 * @param {string} operation
 * @param {Record<string, any>} a
 * @returns {Promise<Screen>}
 */
export function callOperation(app, operation, a) {
  /** @type {any} */
  const v = views;
  switch (operation) {
    case 'start': return v.start();
    case 'openFolder': return v.openFolder(app, a.handle);
    case 'createProfile': return v.createProfile(app, a.name);
    case 'selectProfile': return v.selectProfile(app, a.profileId);
    case 'addHazard': case 'renameHazard': return v[operation](app, { title: a.title });
    case 'addCausalFactor': case 'addConsequence': return v[operation](app, { text: a.text });
    case 'prepareRestore': return v.prepareRestore(app, a.source);
    case 'openHazard': return v.openHazard(app, a.hazardId);
    case 'linkControlToHazard': return v.linkControlToHazard(app, a.controlId, a.controlKind);
    case 'createControl': return v.createControl(app, { title: a.title });
    case 'retireControl': case 'confirmControlForPlatform': return v[operation](app, a.controlId);
    case 'createPlatform': return v.createPlatform(app, { name: a.name, ownerProfileId: a.profileId });
    case 'retirePlatform': case 'openPlatform': return v[operation](app, a.platformId);
    case 'setPlatformOwner': return v.setPlatformOwner(app, a.platformId, a.profileId);
    case 'linkHazardToPlatform': case 'openAssessment': return v[operation](app, a.hazardId);
    case 'setReportId': return v.setReportId(app, a.platformReportId);
    case 'enterRating': return v.enterRating(app, a.stage, a.values);
    case 'excludeControlFromPlatform': return v.excludeControlFromPlatform(app, a.controlId, a.text);
    case 'exportBowtie': return v.exportBowtie(app, a.target);
    case 'createTemplate': return v.createTemplate(app, a.templateFields);
    case 'beginReport': return v.beginReport(app, a.beginFields);
    case 'produceReport': return v.produceReport(app, a.bowtieHazardIds);
    case 'openReport': return v.openReport(app, a.reportId);
    case 'chooseReportExportTarget': return v.chooseReportExportTarget(app, a.format);
    case 'exportReport': return v.exportReport(app, a.target, a.format);
    case 'applyFilter': return v.applyFilter(app, a.filter);
    case 'acknowledgeChange': return v.acknowledgeChange(app, a.entryId, a.platformId);
    case 'setReviewTempo': return v.setReviewTempo(app, a.scheduleFields);
    case 'createReference': return v.createReference(app, a.entryFields);
    case 'openReference': return v.openReference(app, a.referenceId);
    case 'linkReference': return v.linkReference(app, a.ref);
    case 'startWorkflow': return v.startWorkflow(app, a.startFields);
    case 'openWorkflow': return v.openWorkflow(app, a.workflowId);
    case 'submitStep': return v.submitStep(app, a.submission);
    case 'completeWorkflow': return v.completeWorkflow(app, a.completionFields);
    default:
      if (typeof v[operation] !== 'function') throw new Error(`no operation ${operation}`);
      return v[operation](app);
  }
}
