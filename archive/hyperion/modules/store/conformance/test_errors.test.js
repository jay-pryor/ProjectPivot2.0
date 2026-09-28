/**
 * store conformance: errors (CORE-CON-002). Every condition in section 4 of
 * modules/store/CONTRACT.md, signalled as the named rejected promise, with the folder
 * state the clause promises afterwards. Written from the contract before any
 * implementation (P8). Every fault point section 5 names is armed here (CORE-TST-002, rung 3;
 * CORE-TRC-003, Fault points). Extended from store 2.0 to 4.0: the rows for restore,
 * noteChange, checkFolder, the browser's storage, putStoredFile, checkStoredFiles,
 * prepareRestore, and writeExportFile, and the save, backup, stored-file, and export points.
 *
 * Where section 4 names an error's condition but not its `reason` or `file` (a file of the
 * wrong envelope kind, a backup that is not a kept one), the tests hold the implementation to
 * what the row does say and no further.
 *
 * The null double must fail this file (CORE-TST-002, rung 1): an implementation that
 * enforces nothing resolves where every test below expects a rejection.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as store from '../contract.js';
import { NoActiveProfileError, NotLoadedError, StoreReadError, StoreWriteError } from '../contract.js';
import * as schema from '../../../baseline/schema.js';
import { InjectedFault, arm, disarm_all } from '../../../baseline/faults.js';
import {
  MemoryExportFile, MemoryFolder, activeOf, backupPathAt, backupsInFolder, bodyWithHazards, dataFileText, diskFull, holdClock,
  incomingFile, keptPathFor, mirrorText, newProfile, nowAest, permissionRefused, plantBackup, profilesFileText, tamperedText, withBrowserStorage,
} from './harness.js';

const OPEN_FAILURES = ['unreadable', 'not-a-pivot-file', 'newer-schema', 'integrity-failed'];

/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */
/** @typedef {import('../../../baseline/schema.js').OpenFailure} OpenFailure */

/**
 * @param {unknown} e
 * @param {'superseded-copy' | 'data' | 'profiles' | 'backup' | 'backup-prune' | 'mirror' | 'stored-file' | 'export'} stage
 * @param {(file: string) => boolean} fileIs
 * @returns {boolean}
 */
function isWriteError(e, stage, fileIs) {
  return e instanceof StoreWriteError && e.stage === stage && typeof e.file === 'string' && fileIs(e.file);
}

/**
 * @param {unknown} e
 * @param {string} file
 * @param {OpenFailure | 'inaccessible'} reason
 * @returns {boolean}
 */
function isReadError(e, file, reason) {
  return e instanceof StoreReadError && e.file === file && e.reason === reason;
}

/**
 * A fault armed through the harness "propagates cleanly": the rejection is the injected
 * error itself, or a store error that carries it as `cause`; never a resolution and never
 * an unrelated error.
 * @param {unknown} e
 * @returns {boolean}
 */
function carriesInjectedFault(e) {
  return e instanceof InjectedFault || (e instanceof Error && e.cause instanceof InjectedFault);
}

test('save with no active profile rejects with NoActiveProfileError and the folder is unchanged (C-002)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const opened = await store.openDataFolder(folder.handle);
  await store.putProfile(opened, alice);
  await store.load(opened);
  const before = folder.snapshot();
  const body = bodyWithHazards(alice, ['unsaveable without a profile']);

  const notProfiles = [
    ['undefined', undefined],
    ['null', null],
    ['an object with no id', { name: 'Nobody' }],
    ['an id that is not a user profile id', { id: 'not-a-uuid', name: 'Nobody' }],
  ];
  for (const [label, profile] of notProfiles) {
    await assert.rejects(
      () => store.save(opened, /** @type {any} */ (profile), body),
      (e) => e instanceof NoActiveProfileError,
      `save with ${label} rejects with NoActiveProfileError`,
    );
  }
  assert.deepEqual(folder.snapshot(), before, 'nothing under the folder was created, written, or removed');
});

test('save before load rejects with NotLoadedError and the folder is unchanged (C-003)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const body = bodyWithHazards(alice, ['premature']);

  const fresh = await store.openDataFolder(folder.handle);
  await assert.rejects(() => store.save(fresh, activeOf(alice), body), (e) => e instanceof NotLoadedError);
  assert.deepEqual(folder.list(), []);

  const other = await store.openDataFolder(folder.handle); // someone else has saved; this store still has not loaded
  await store.load(other);
  await store.save(other, activeOf(alice), body);
  const before = folder.snapshot();
  await assert.rejects(() => store.save(fresh, activeOf(alice), body), (e) => e instanceof NotLoadedError);
  assert.deepEqual(folder.snapshot(), before);
});

test('when the superseded copy cannot be written, save rejects at stage superseded-copy and data.json is unchanged (C-004)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const bob = newProfile('Bob');
  const a = await store.openDataFolder(folder.handle);
  const b = await store.openDataFolder(folder.handle);
  await store.load(a);
  await store.load(b);
  await store.save(a, activeOf(alice), bodyWithHazards(alice, ['Alice']));
  const dataAsAliceLeftIt = folder.read(schema.DATA_FOLDER.data);

  folder.failWrite((rel) => rel.startsWith(`${schema.DATA_FOLDER.supersededSaves}/`));
  await assert.rejects(
    () => store.save(b, activeOf(bob), bodyWithHazards(bob, ['Bob'])),
    (e) => isWriteError(e, 'superseded-copy', (file) => file.startsWith(`${schema.DATA_FOLDER.supersededSaves}/`)),
  );
  assert.equal(folder.read(schema.DATA_FOLDER.data), dataAsAliceLeftIt, 'data.json was not written');
});

test('when data.json cannot be written, save rejects with StoreWriteError at stage data (section 4)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const opened = await store.openDataFolder(folder.handle);
  await store.load(opened);
  folder.failWrite((rel) => rel === schema.DATA_FOLDER.data);
  await assert.rejects(
    () => store.save(opened, activeOf(alice), bodyWithHazards(alice, ['unwritable'])),
    (e) => isWriteError(e, 'data', (file) => file === schema.DATA_FOLDER.data),
  );
});

test('when profiles.json cannot be written, putProfile rejects with StoreWriteError at stage profiles (section 4)', async () => {
  const folder = new MemoryFolder();
  const opened = await store.openDataFolder(folder.handle);
  folder.failWrite((rel) => rel === schema.DATA_FOLDER.profiles);
  await assert.rejects(
    () => store.putProfile(opened, newProfile('Alice')),
    (e) => isWriteError(e, 'profiles', (file) => file === schema.DATA_FOLDER.profiles),
  );
});

test('load on a data.json that fails schema.open rejects with StoreReadError naming the file and reason, and nothing is kept (C-007)', async () => {
  const alice = newProfile('Alice');
  const body = bodyWithHazards(alice, ['planted']);
  const stamp = schema.freshStamp(alice.id);
  const newer = await schema.seal('data', body, stamp);
  newer.schemaVersion = schema.SCHEMA_VERSION + 1;
  const tampered = await schema.seal('data', body, stamp);
  /** @type {DataBody} */ (tampered.body).sequences.hazard += 1;

  /** @type {[OpenFailure, string][]} */
  const cases = [
    ['unreadable', 'this is not JSON {'],
    ['not-a-pivot-file', JSON.stringify({ hello: 'world' })],
    ['newer-schema', schema.serialize(newer)],
    ['integrity-failed', schema.serialize(tampered)],
  ];
  for (const [reason, text] of cases) {
    const folder = new MemoryFolder();
    folder.write(schema.DATA_FOLDER.data, text);
    const opened = await store.openDataFolder(folder.handle);
    await assert.rejects(() => store.load(opened), (e) => isReadError(e, schema.DATA_FOLDER.data, reason), `load rejects with reason ${reason}`);
    await assert.rejects(
      () => store.save(opened, activeOf(alice), body),
      (e) => e instanceof NotLoadedError,
      `after a refused load the store has not loaded (${reason}); nothing from the file was kept`,
    );
    assert.equal(folder.read(schema.DATA_FOLDER.data), text, 'the refused file is left as it was');
  }
});

test('readProfiles on a profiles.json that fails schema.open rejects with StoreReadError naming the file (C-008)', async () => {
  const alice = newProfile('Alice');
  const tampered = await schema.seal('profiles', { profiles: { [alice.id]: alice } }, null);
  /** @type {{ profiles: Record<string, unknown> }} */ (tampered.body).profiles[alice.id] = { ...alice, name: 'Mallory' };

  /** @type {[OpenFailure, string][]} */
  const cases = [
    ['unreadable', ''],
    ['not-a-pivot-file', '[]'],
    ['integrity-failed', schema.serialize(tampered)],
  ];
  for (const [reason, text] of cases) {
    const folder = new MemoryFolder();
    folder.write(schema.DATA_FOLDER.profiles, text);
    const opened = await store.openDataFolder(folder.handle);
    await assert.rejects(() => store.readProfiles(opened), (e) => isReadError(e, schema.DATA_FOLDER.profiles, reason), `readProfiles rejects with reason ${reason}`);
  }
});

test('when the folder cannot be read, load and readProfiles reject with StoreReadError reason inaccessible (section 4)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  folder.write(schema.DATA_FOLDER.data, await dataFileText(bodyWithHazards(alice, ['unreachable']), schema.freshStamp(alice.id)));
  folder.write(schema.DATA_FOLDER.profiles, await profilesFileText({ [alice.id]: alice }));
  const opened = await store.openDataFolder(folder.handle);
  folder.denyRead(() => true);
  await assert.rejects(() => store.load(opened), (e) => isReadError(e, schema.DATA_FOLDER.data, 'inaccessible'));
  await assert.rejects(() => store.readProfiles(opened), (e) => isReadError(e, schema.DATA_FOLDER.profiles, 'inaccessible'));
});

test('a failure after the superseded copy and before data.json propagates, leaves data.json as found, and the store still serves its contract (C-004 fault point store.save.superseded-copied)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const bob = newProfile('Bob');
  const a = await store.openDataFolder(folder.handle);
  const b = await store.openDataFolder(folder.handle);
  await store.load(a);
  await store.load(b);
  const saveA = await store.save(a, activeOf(alice), bodyWithHazards(alice, ['Alice']));
  const dataAsAliceLeftIt = folder.read(schema.DATA_FOLDER.data);
  const bodyB = bodyWithHazards(bob, ['Bob']);

  arm('store.save.superseded-copied');
  try {
    await assert.rejects(() => store.save(b, activeOf(bob), bodyB), carriesInjectedFault);
  } finally {
    disarm_all();
  }
  assert.equal(folder.read(schema.DATA_FOLDER.data), dataAsAliceLeftIt, 'data.json is untouched until the copy is complete');
  assert.equal(folder.read(keptPathFor(saveA.stamp)), dataAsAliceLeftIt, 'the copy was complete when the fault fired');

  const retry = await store.save(b, activeOf(bob), bodyB);
  assert.deepEqual(retry.superseded, saveA.stamp, 'the interrupted save adopted nothing; the retry still finds Alice\'s stamp');
  assert.equal(retry.keptAs, keptPathFor(saveA.stamp));
  assert.equal(folder.read(keptPathFor(saveA.stamp)), dataAsAliceLeftIt);
  const afterwards = await store.load(await store.openDataFolder(folder.handle));
  assert.deepEqual(afterwards.body, bodyB);
  assert.deepEqual(afterwards.lastSave, retry.stamp);
});

test('a failure after data.json is written and before the stamp is adopted propagates, and the store still serves its contract (C-006 fault point store.save.data-written)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const opened = await store.openDataFolder(folder.handle);
  await store.load(opened);
  const first = bodyWithHazards(alice, ['written but not adopted']);

  arm('store.save.data-written');
  try {
    await assert.rejects(() => store.save(opened, activeOf(alice), first), carriesInjectedFault);
  } finally {
    disarm_all();
  }
  const onDisk = await store.load(await store.openDataFolder(folder.handle));
  assert.deepEqual(onDisk.body, first, 'data.json was written before the fault fired');

  const second = bodyWithHazards(alice, ['after the fault']);
  const retry = await store.save(opened, activeOf(alice), second);
  const afterwards = await store.load(await store.openDataFolder(folder.handle));
  assert.deepEqual(afterwards.body, second);
  assert.deepEqual(afterwards.lastSave, retry.stamp);
});

// ------------------------------------------------------------------ store 2.0 to 4.0

const NOT_ACTIVE_PROFILES = [
  ['undefined', undefined],
  ['null', null],
  ['an object with no id', { name: 'Nobody' }],
  ['an id that is not a user profile id', { id: 'not-a-uuid', name: 'Nobody' }],
];

/**
 * A save state file holding `body`, as another machine's Pivot wrote it.
 * @param {DataBody} body
 * @param {import('../../../baseline/types.js').UserProfile} by
 * @returns {Promise<import('../contract.js').SaveStateFile>}
 */
async function saveStateOf(body, by) {
  return { name: 'save state.json', text: await dataFileText(body, schema.freshStamp(by.id)) };
}

test('restore, noteChange, and putStoredFile with no active profile reject with NoActiveProfileError; the folder and the browser\'s storage are unchanged (section 4, C-002)', async () => {
  await withBrowserStorage(async (env) => {
    const folder = new MemoryFolder();
    const alice = newProfile('Alice');
    const opened = await store.openDataFolder(folder.handle);
    await store.load(opened);
    await store.save(opened, activeOf(alice), bodyWithHazards(alice, ['stored']));
    const plan = await store.prepareRestore(opened, { kind: 'save-state', saveState: await saveStateOf(bodyWithHazards(alice, ['restorable']), alice) });
    const before = folder.snapshot();

    for (const [label, profile] of NOT_ACTIVE_PROFILES) {
      const p = /** @type {any} */ (profile);
      await assert.rejects(() => store.restore(opened, p, plan), (e) => e instanceof NoActiveProfileError, `restore with ${label}`);
      await assert.rejects(() => store.noteChange(opened, p, bodyWithHazards(alice, ['changed'])), (e) => e instanceof NoActiveProfileError, `noteChange with ${label}`);
      await assert.rejects(() => store.putStoredFile(opened, p, incomingFile('evidence.pdf', [1, 2, 3])), (e) => e instanceof NoActiveProfileError, `putStoredFile with ${label}`);
    }
    assert.deepEqual(folder.snapshot(), before, 'folder unchanged');
    assert.deepEqual(env.local.writes, [], 'storage untouched');
    assert.deepEqual(env.session.writes, []);
  });
});

test('restore, noteChange, unsavedChanges, and recoverWorkingState before a load reject with NotLoadedError; the folder and the browser\'s storage are unchanged (section 4, C-003)', async () => {
  await withBrowserStorage(async (env) => {
    const folder = new MemoryFolder();
    const alice = newProfile('Alice');
    const other = await store.openDataFolder(folder.handle);
    await store.load(other);
    await store.save(other, activeOf(alice), bodyWithHazards(alice, ['stored by another copy']));
    const unsaved = bodyWithHazards(alice, ['in the browser']);
    env.local.items.set(schema.BROWSER_STORAGE_KEY, mirrorText(unsaved, null, nowAest(), true));
    const plan = await store.prepareRestore(other, { kind: 'save-state', saveState: await saveStateOf(bodyWithHazards(alice, ['restorable']), alice) });

    const fresh = await store.openDataFolder(folder.handle);
    const before = folder.snapshot();
    const me = activeOf(alice);
    await assert.rejects(() => store.restore(fresh, me, plan), (e) => e instanceof NotLoadedError, 'restore');
    await assert.rejects(() => store.noteChange(fresh, me, unsaved), (e) => e instanceof NotLoadedError, 'noteChange');
    await assert.rejects(() => store.unsavedChanges(fresh, unsaved), (e) => e instanceof NotLoadedError, 'unsavedChanges');
    await assert.rejects(
      () => store.recoverWorkingState(fresh, { body: unsaved, mirroredAtAest: nowAest(), loadedStamp: null }),
      (e) => e instanceof NotLoadedError,
      'recoverWorkingState',
    );
    assert.deepEqual(folder.snapshot(), before, 'folder unchanged');
    assert.deepEqual(env.local.writes, [], 'storage untouched');
    assert.deepEqual(env.session.writes, []);
  });
});

test('when the superseded copy or data.json cannot be written, restore rejects at that stage and data.json is unchanged (section 4, C-010, C-017)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const bob = newProfile('Bob');
  const a = await store.openDataFolder(folder.handle);
  const b = await store.openDataFolder(folder.handle);
  await store.load(a);
  await store.load(b);
  const planB = await store.prepareRestore(b, { kind: 'save-state', saveState: await saveStateOf(bodyWithHazards(bob, ['Bob restores']), bob) });
  await store.save(a, activeOf(alice), bodyWithHazards(alice, ['Alice saved']));
  const dataAsAliceLeftIt = folder.read(schema.DATA_FOLDER.data);

  folder.failWrite((rel) => rel.startsWith(`${schema.DATA_FOLDER.supersededSaves}/`));
  await assert.rejects(
    () => store.restore(b, activeOf(bob), planB),
    (e) => isWriteError(e, 'superseded-copy', (file) => file.startsWith(`${schema.DATA_FOLDER.supersededSaves}/`)),
  );
  assert.equal(folder.read(schema.DATA_FOLDER.data), dataAsAliceLeftIt, 'data.json was not written');

  folder.failWrite((rel) => rel === schema.DATA_FOLDER.data);
  const planA = await store.prepareRestore(a, { kind: 'save-state', saveState: await saveStateOf(bodyWithHazards(alice, ['Alice restores']), alice) });
  await assert.rejects(() => store.restore(a, activeOf(alice), planA), (e) => isWriteError(e, 'data', (file) => file === schema.DATA_FOLDER.data));
  assert.equal(folder.read(schema.DATA_FOLDER.data), dataAsAliceLeftIt, 'data.json unchanged');
});

test('when a store that mirrors saves or restores and the browser\'s copy cannot be marked saved, the write completes and the outcome carries mirrorError at stage mirror naming the key (section 4, C-015)', async () => {
  await withBrowserStorage(async (env) => {
    const folder = new MemoryFolder();
    const alice = newProfile('Alice');
    const opened = await store.openDataFolder(folder.handle);
    await store.load(opened);
    const changed = bodyWithHazards(alice, ['changed']);
    assert.equal((await store.noteChange(opened, activeOf(alice), changed)).mirrorError, null, 'the store now mirrors');

    env.local.fill();
    const saved = await store.save(opened, activeOf(alice), changed);
    assert.ok(isWriteError(saved.mirrorError, 'mirror', (file) => file === schema.BROWSER_STORAGE_KEY), 'save: mirrorError at stage mirror, naming the key');
    const afterSave = await store.load(await store.openDataFolder(folder.handle));
    assert.deepEqual(afterSave.body, changed, 'the save completed');
    assert.deepEqual(afterSave.lastSave, saved.stamp);

    env.local.setError = null;
    env.local.refuseWrites();
    const plan = await store.prepareRestore(opened, { kind: 'save-state', saveState: await saveStateOf(bodyWithHazards(alice, ['restored']), alice) });
    const restored = await store.restore(opened, activeOf(alice), plan);
    assert.ok(isWriteError(restored.mirrorError, 'mirror', (file) => file === schema.BROWSER_STORAGE_KEY), 'restore: mirrorError at stage mirror, naming the key');
    const afterRestore = await store.load(await store.openDataFolder(folder.handle));
    assert.deepEqual(afterRestore.body, plan.body, 'the restore completed');
    assert.deepEqual(afterRestore.lastSave, restored.stamp);
  });
});

test('load and readProfiles refuse a file that is not the envelope kind its name calls for, with StoreReadError naming the file (section 4)', async () => {
  const alice = newProfile('Alice');
  const folder = new MemoryFolder();
  folder.write(schema.DATA_FOLDER.data, await profilesFileText({ [alice.id]: alice }));
  folder.write(schema.DATA_FOLDER.profiles, await dataFileText(bodyWithHazards(alice, ['in the wrong file']), schema.freshStamp(alice.id)));
  const opened = await store.openDataFolder(folder.handle);
  await assert.rejects(() => store.load(opened), (e) => e instanceof StoreReadError && e.file === schema.DATA_FOLDER.data && OPEN_FAILURES.includes(e.reason));
  await assert.rejects(() => store.readProfiles(opened), (e) => e instanceof StoreReadError && e.file === schema.DATA_FOLDER.profiles && OPEN_FAILURES.includes(e.reason));
});

test('checkFolder lists each Pivot file that fails its check, cannot be read, or is not the kind its name calls for, with the data it affects, sorted by file, and does not reject (C-012, section 4)', async () => {
  const clock = holdClock();
  try {
    const folder = new MemoryFolder();
    const alice = newProfile('Alice');
    const body = bodyWithHazards(alice, ['stored']);
    const t = (/** @type {number} */ hoursAgo) => clock.offset(-hoursAgo * 3600);
    folder.write(schema.DATA_FOLDER.data, tamperedText(await dataFileText(body, schema.freshStamp(alice.id))));
    folder.write(schema.DATA_FOLDER.profiles, tamperedText(await profilesFileText({ [alice.id]: alice })));
    await plantBackup(folder, t(2), body, alice);
    const tampered = backupPathAt(t(3));
    folder.write(tampered, tamperedText(await dataFileText(body, schema.freshStamp(alice.id))));
    const unreadable = await plantBackup(folder, t(4), body, alice);
    const wrongKind = backupPathAt(t(5));
    folder.write(wrongKind, await profilesFileText({ [alice.id]: alice }));
    const brokenCopy = keptPathFor(schema.freshStamp(alice.id));
    folder.write(brokenCopy, 'not JSON {');
    folder.write(keptPathFor(schema.freshStamp(alice.id)), await dataFileText(body, schema.freshStamp(alice.id)));
    folder.denyRead((rel) => rel === unreadable);

    const opened = await store.openDataFolder(folder.handle);
    const failures = [...(await store.checkFolder(opened))];
    const expectedOrder = [schema.DATA_FOLDER.data, schema.DATA_FOLDER.profiles, tampered, unreadable, wrongKind, brokenCopy].sort();
    assert.deepEqual(failures.map((f) => f.file), expectedOrder, 'one failure per failing file, sorted by file; passing files are not listed');
    const by = new Map(failures.map((f) => [f.file, f]));
    const at = (/** @type {string} */ file) => /** @type {import('../contract.js').FileCheckFailure} */ (by.get(file));

    assert.equal(at(schema.DATA_FOLDER.data).reason, 'integrity-failed');
    assert.deepEqual(at(schema.DATA_FOLDER.data).affects, { kind: 'stored-data' });
    assert.equal(at(schema.DATA_FOLDER.profiles).reason, 'integrity-failed');
    assert.deepEqual(at(schema.DATA_FOLDER.profiles).affects, { kind: 'profiles' });
    assert.equal(at(tampered).reason, 'integrity-failed');
    assert.deepEqual(at(tampered).affects, { kind: 'backup', takenAtAest: t(3) });
    assert.equal(at(unreadable).reason, 'inaccessible');
    assert.deepEqual(at(unreadable).affects, { kind: 'backup', takenAtAest: t(4) });
    assert.ok(OPEN_FAILURES.includes(at(wrongKind).reason), 'a backup holding a profiles envelope fails with an OpenFailure reason');
    assert.deepEqual(at(wrongKind).affects, { kind: 'backup', takenAtAest: t(5) });
    assert.equal(at(brokenCopy).reason, 'unreadable');
    assert.deepEqual(at(brokenCopy).affects, { kind: 'superseded-save' });
    for (const f of failures) assert.ok(typeof f.detail === 'string' && f.detail.length > 0, `${f.file} carries a detail`);
  } finally {
    clock.release();
  }
});

test('a failed backup or superseded copy is reported by checkFolder and does not stop load (C-012)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const body = bodyWithHazards(alice, ['still shown']);
  const stamp = schema.freshStamp(alice.id);
  folder.write(schema.DATA_FOLDER.data, await dataFileText(body, stamp));
  const badBackup = backupPathAt(nowAest());
  folder.write(badBackup, tamperedText(await dataFileText(body, schema.freshStamp(alice.id))));
  const badCopy = keptPathFor(schema.freshStamp(alice.id));
  folder.write(badCopy, '');

  const opened = await store.openDataFolder(folder.handle);
  assert.deepEqual((await store.checkFolder(opened)).map((f) => f.file), [badBackup, badCopy].sort());
  const loaded = await store.load(opened);
  assert.deepEqual(loaded.body, body);
  assert.deepEqual(loaded.lastSave, stamp);
});

test('when the data folder itself cannot be read, checkFolder rejects with StoreReadError reason inaccessible (section 4)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  folder.write(schema.DATA_FOLDER.data, await dataFileText(bodyWithHazards(alice, ['x']), schema.freshStamp(alice.id)));
  const opened = await store.openDataFolder(folder.handle);
  folder.denyRead(() => true);
  await assert.rejects(() => store.checkFolder(opened), (e) => e instanceof StoreReadError && e.reason === 'inaccessible');
});

/**
 * Plant `count` complete backups, each more than an hour older than the one after it, the
 * newest more than an hour before the held now.
 * @param {MemoryFolder} folder
 * @param {ReturnType<typeof holdClock>} clock
 * @param {number} count
 * @param {import('../../../baseline/types.js').UserProfile} by
 * @returns {Promise<string[]>} their paths, oldest first
 */
async function plantRing(folder, clock, count, by) {
  /** @type {string[]} */
  const paths = [];
  for (let i = count; i >= 1; i -= 1) paths.push(await plantBackup(folder, clock.offset(-i * 3601), bodyWithHazards(by, [`backup ${i}`]), by));
  return paths;
}

test('when the backup cannot be written, noteChange resolves with backupError at stage backup, removes no backup, and still mirrors (section 4, C-014, section 5 ordering)', async () => {
  await withBrowserStorage(async (env) => {
    const clock = holdClock();
    try {
      const folder = new MemoryFolder();
      const alice = newProfile('Alice');
      const planted = await plantRing(folder, clock, schema.BACKUP_RING_SIZE, alice);
      const before = folder.snapshot();
      const opened = await store.openDataFolder(folder.handle);
      await store.load(opened);
      folder.failWrite((rel) => rel.startsWith(`${schema.DATA_FOLDER.backups}/`));

      const changed = bodyWithHazards(alice, ['changed']);
      const outcome = await store.noteChange(opened, activeOf(alice), changed);
      assert.equal(outcome.changed, true);
      assert.ok(isWriteError(outcome.backupError, 'backup', () => true), 'backupError at stage backup');
      for (const rel of planted) assert.equal(folder.read(rel), before[rel], `${rel} was not removed or altered`);
      assert.equal(outcome.mirrorError, null, 'the mirror is not skipped when the backup fails');
      assert.deepEqual(env.local.mirror()?.body, changed);
    } finally {
      clock.release();
    }
  });
});

test('when the backup is written and removing an older one fails, noteChange resolves with backupError at stage backup-prune, keeps the new backup, and the next backup removes it (section 4, C-014)', async () => {
  await withBrowserStorage(async () => {
    const clock = holdClock();
    try {
      const folder = new MemoryFolder();
      const alice = newProfile('Alice');
      await plantRing(folder, clock, schema.BACKUP_RING_SIZE, alice);
      const opened = await store.openDataFolder(folder.handle);
      await store.load(opened);
      folder.failRemove((rel) => rel.startsWith(`${schema.DATA_FOLDER.backups}/`));

      const first = bodyWithHazards(alice, ['first change']);
      const outcome = await store.noteChange(opened, activeOf(alice), first);
      assert.equal(outcome.backupFile, backupPathAt(clock.now()));
      assert.ok(isWriteError(outcome.backupError, 'backup-prune', () => true), 'backupError at stage backup-prune');
      const kept = await schema.open(/** @type {string} */ (folder.read(backupPathAt(clock.now()))));
      assert.ok(kept.ok && kept.envelope.kind === 'data', 'the new backup is kept, whole');
      assert.deepEqual(kept.envelope.body, first);
      assert.equal(backupsInFolder(folder).length, schema.BACKUP_RING_SIZE + 1);

      folder.failRemove(() => false);
      const firstPath = backupPathAt(clock.now());
      clock.advance(3601);
      const next = await store.noteChange(opened, activeOf(alice), bodyWithHazards(alice, ['second change']));
      assert.equal(next.backupFile, backupPathAt(clock.now()));
      assert.equal(next.backupError, null);
      const remaining = backupsInFolder(folder).map((entry) => entry.file);
      assert.equal(remaining.length, schema.BACKUP_RING_SIZE, 'the next backup brought the ring back to 72');
      assert.deepEqual(remaining.slice(0, 2), [backupPathAt(clock.now()), firstPath], 'the two newest are kept');
    } finally {
      clock.release();
    }
  });
});

test('when the browser\'s storage is absent, refuses the write, or is full, noteChange resolves with mirrorError at stage mirror naming the key, and still takes the backup (section 4, C-015, section 5 ordering)', async () => {
  await withBrowserStorage(async (env) => {
    const clock = holdClock();
    try {
      const alice = newProfile('Alice');
      /** @type {[string, () => void][]} */
      const cases = [
        ['absent', () => env.absent()],
        ['refusing writes', () => { env.present(); env.local.setError = null; env.local.refuseWrites(); }],
        ['full', () => { env.present(); env.local.setError = null; env.local.fill(); }],
      ];
      for (const [label, breakStorage] of cases) {
        const folder = new MemoryFolder();
        const opened = await store.openDataFolder(folder.handle);
        await store.load(opened);
        breakStorage();
        const outcome = await store.noteChange(opened, activeOf(alice), bodyWithHazards(alice, [label]));
        assert.equal(outcome.changed, true, label);
        assert.ok(isWriteError(outcome.mirrorError, 'mirror', (file) => file === schema.BROWSER_STORAGE_KEY), `${label}: mirrorError at stage mirror naming the key`);
        assert.equal(outcome.backupFile, backupPathAt(clock.now()), `${label}: the backup is not skipped when the mirror fails`);
        assert.equal(outcome.backupError, null, label);
      }
    } finally {
      clock.release();
    }
  });
});

test('readRecoverable and recoverWorkingState reject with StoreReadError naming the key, reason inaccessible, when the browser\'s storage is absent or cannot be read (section 4)', async () => {
  await withBrowserStorage(async (env) => {
    const folder = new MemoryFolder();
    const alice = newProfile('Alice');
    const opened = await store.openDataFolder(folder.handle);
    await store.load(opened);
    const body = bodyWithHazards(alice, ['in the browser']);
    const state = { body, mirroredAtAest: nowAest(), loadedStamp: null };
    env.local.items.set(schema.BROWSER_STORAGE_KEY, mirrorText(body, null, state.mirroredAtAest, true));

    env.absent();
    await assert.rejects(() => store.readRecoverable(opened), (e) => isReadError(e, schema.BROWSER_STORAGE_KEY, 'inaccessible'), 'readRecoverable, storage absent');
    await assert.rejects(() => store.recoverWorkingState(opened, state), (e) => isReadError(e, schema.BROWSER_STORAGE_KEY, 'inaccessible'), 'recoverWorkingState, storage absent');
    env.present();
    env.local.refuseReads();
    await assert.rejects(() => store.readRecoverable(opened), (e) => isReadError(e, schema.BROWSER_STORAGE_KEY, 'inaccessible'), 'readRecoverable, storage unreadable');
    await assert.rejects(() => store.recoverWorkingState(opened, state), (e) => isReadError(e, schema.BROWSER_STORAGE_KEY, 'inaccessible'), 'recoverWorkingState, storage unreadable');
  });
});

test('readRecoverable and recoverWorkingState reject with StoreReadError naming the key when the value is not JSON, not a mirror, or of a newer schema, and return nothing (section 4)', async () => {
  await withBrowserStorage(async (env) => {
    const folder = new MemoryFolder();
    const alice = newProfile('Alice');
    const opened = await store.openDataFolder(folder.handle);
    await store.load(opened);
    const body = bodyWithHazards(alice, ['in the browser']);
    const state = { body, mirroredAtAest: nowAest(), loadedStamp: null };
    const newer = JSON.parse(mirrorText(body, null, state.mirroredAtAest, true));
    newer.schemaVersion = schema.SCHEMA_VERSION + 1;

    /** @type {[OpenFailure, string][]} */
    const cases = [
      ['unreadable', 'this is not JSON {'],
      ['not-a-pivot-file', JSON.stringify({ hello: 'world' })],
      ['newer-schema', JSON.stringify(newer)],
    ];
    for (const [reason, value] of cases) {
      env.local.items.set(schema.BROWSER_STORAGE_KEY, value);
      await assert.rejects(() => store.readRecoverable(opened), (e) => isReadError(e, schema.BROWSER_STORAGE_KEY, reason), `readRecoverable: ${reason}`);
      await assert.rejects(() => store.recoverWorkingState(opened, state), (e) => isReadError(e, schema.BROWSER_STORAGE_KEY, reason), `recoverWorkingState: ${reason}`);
    }
  });
});

test('when the browser\'s storage refuses the removal, discardWorkingState rejects with StoreWriteError naming the key at stage mirror (section 4)', async () => {
  await withBrowserStorage(async (env) => {
    const folder = new MemoryFolder();
    const alice = newProfile('Alice');
    const opened = await store.openDataFolder(folder.handle);
    await store.load(opened);
    env.local.items.set(schema.BROWSER_STORAGE_KEY, mirrorText(bodyWithHazards(alice, ['x']), null, nowAest(), true));
    env.local.refuseRemoval();
    await assert.rejects(() => store.discardWorkingState(opened), (e) => isWriteError(e, 'mirror', (file) => file === schema.BROWSER_STORAGE_KEY));
  });
});

test('putStoredFile with a missing file, an empty name, or bytes that are not a Uint8Array rejects at stage stored-file naming files/, and the folder is unchanged (section 4)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const opened = await store.openDataFolder(folder.handle);
  const bad = [
    ['undefined', undefined],
    ['null', null],
    ['an empty name', { name: '', bytes: Uint8Array.from([1]) }],
    ['bytes as an array of numbers', { name: 'evidence.pdf', bytes: [1, 2, 3] }],
    ['bytes as a string', { name: 'evidence.pdf', bytes: 'abc' }],
    ['bytes as an ArrayBuffer', { name: 'evidence.pdf', bytes: new ArrayBuffer(3) }],
    ['no bytes', { name: 'evidence.pdf' }],
  ];
  for (const [label, file] of bad) {
    await assert.rejects(
      () => store.putStoredFile(opened, activeOf(alice), /** @type {any} */ (file)),
      (e) => isWriteError(e, 'stored-file', (name) => name === schema.DATA_FOLDER.files || name === `${schema.DATA_FOLDER.files}/`),
      label,
    );
  }
  assert.deepEqual(folder.list(), [], 'folder unchanged');
});

test('when the write under files/ cannot complete, putStoredFile rejects at stage stored-file naming the location it was writing, and leaves no file there or anywhere else under files/ (section 4, C-018)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const opened = await store.openDataFolder(folder.handle);
  const existing = await store.putStoredFile(opened, activeOf(alice), incomingFile('first.pdf', [1, 2, 3]));
  const before = folder.snapshot();

  folder.failWrite((rel) => rel.startsWith(`${schema.DATA_FOLDER.files}/`));
  /** @type {unknown} */
  let rejection = null;
  await assert.rejects(async () => {
    try {
      await store.putStoredFile(opened, activeOf(alice), incomingFile('second.pdf', [4, 5, 6]));
    } catch (e) {
      rejection = e;
      throw e;
    }
  }, (e) => isWriteError(e, 'stored-file', (file) => file.startsWith(`${schema.DATA_FOLDER.files}/`)));
  const location = /** @type {StoreWriteError} */ (rejection).file;
  assert.notEqual(location, existing, 'it was writing a fresh location');
  assert.equal(folder.exists(location), false, 'no file remains at the location it was writing');
  assert.deepEqual(folder.snapshot(), before, 'no other file under files/ was created, replaced, or removed');
});

test('a putStoredFile stopped at store.stored-file.staged propagates, leaves nothing new under files/, and the store still serves its contract (C-018 fault point)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const opened = await store.openDataFolder(folder.handle);
  const existing = await store.putStoredFile(opened, activeOf(alice), incomingFile('first.pdf', [1, 2, 3]));
  const before = folder.snapshot();

  arm('store.stored-file.staged');
  try {
    await assert.rejects(() => store.putStoredFile(opened, activeOf(alice), incomingFile('second.pdf', [4, 5, 6])), carriesInjectedFault);
  } finally {
    disarm_all();
  }
  assert.deepEqual(folder.snapshot(), before, 'the staged bytes were not committed and nothing else changed');

  const retry = await store.putStoredFile(opened, activeOf(alice), incomingFile('second.pdf', [4, 5, 6]));
  assert.notEqual(retry, existing);
  assert.deepEqual(folder.readBytes(retry), Uint8Array.from([4, 5, 6]));
  assert.deepEqual((await store.checkStoredFiles(opened, [existing, retry])).map((p) => p.present), [true, true]);
});

test('checkStoredFiles rejects with StoreReadError reason inaccessible when the data folder itself cannot be read (section 4, C-019)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const opened = await store.openDataFolder(folder.handle);
  const location = await store.putStoredFile(opened, activeOf(alice), incomingFile('evidence.pdf', [1]));
  folder.denyRead(() => true);
  await assert.rejects(() => store.checkStoredFiles(opened, [location]), (e) => e instanceof StoreReadError && e.reason === 'inaccessible');
});

test('prepareRestore of a file that is not a kept backup, or that fails schema.open, or is not a data envelope, rejects with StoreReadError naming it and writes nothing (section 4, C-017)', async () => {
  await withBrowserStorage(async (env) => {
    const clock = holdClock();
    try {
      const folder = new MemoryFolder();
      const alice = newProfile('Alice');
      const bob = newProfile('Bob');
      const body = bodyWithHazards(alice, ['stored']);
      const a = await store.openDataFolder(folder.handle);
      const b = await store.openDataFolder(folder.handle);
      await store.putProfile(a, alice);
      await store.load(a);
      await store.load(b);
      await store.save(a, activeOf(alice), body);
      const keptAs = /** @type {string} */ ((await store.save(b, activeOf(bob), bodyWithHazards(bob, ['Bob']))).keptAs);
      const tampered = backupPathAt(clock.offset(-3600));
      folder.write(tampered, tamperedText(await dataFileText(body, schema.freshStamp(alice.id))));
      const wrongKind = backupPathAt(clock.offset(-7200));
      folder.write(wrongKind, await profilesFileText({ [alice.id]: alice }));
      const before = folder.snapshot();

      const notKept = [schema.DATA_FOLDER.data, schema.DATA_FOLDER.profiles, keptAs, backupPathAt(clock.offset(-10800)), '../data.json'];
      for (const file of notKept) {
        await assert.rejects(() => store.prepareRestore(b, { kind: 'backup', file }), (e) => e instanceof StoreReadError && e.file === file, `${file} is not a kept backup`);
      }
      await assert.rejects(() => store.prepareRestore(b, { kind: 'backup', file: tampered }), (e) => isReadError(e, tampered, 'integrity-failed'));
      await assert.rejects(() => store.prepareRestore(b, { kind: 'backup', file: wrongKind }), (e) => e instanceof StoreReadError && e.file === wrongKind && OPEN_FAILURES.includes(e.reason));

      const newer = await schema.seal('data', body, schema.freshStamp(alice.id));
      newer.schemaVersion = schema.SCHEMA_VERSION + 1;
      /** @type {[string, string, (e: unknown) => boolean][]} */
      const saveStates = [
        ['not JSON.json', 'not JSON {', (e) => isReadError(e, 'not JSON.json', 'unreadable')],
        ['stray.json', JSON.stringify({ hello: 'world' }), (e) => isReadError(e, 'stray.json', 'not-a-pivot-file')],
        ['newer.json', schema.serialize(newer), (e) => isReadError(e, 'newer.json', 'newer-schema')],
        ['altered.json', tamperedText(await dataFileText(body, schema.freshStamp(alice.id))), (e) => isReadError(e, 'altered.json', 'integrity-failed')],
        ['profiles.json', await profilesFileText({ [alice.id]: alice }), (e) => e instanceof StoreReadError && e.file === 'profiles.json' && OPEN_FAILURES.includes(e.reason)],
      ];
      for (const [name, text, check] of saveStates) {
        await assert.rejects(() => store.prepareRestore(b, { kind: 'save-state', saveState: { name, text } }), check, `save state ${name}`);
      }
      assert.deepEqual(folder.snapshot(), before, 'folder unchanged');
      assert.deepEqual(env.local.writes, [], 'storage untouched');
    } finally {
      clock.release();
    }
  });
});

test('restore passes through the three save fault points: before the commit data.json is byte-for-byte as it was, after it data.json holds the restore whole (C-010, C-017)', async () => {
  for (const point of ['store.save.superseded-copied', 'store.save.data-staged', 'store.save.data-written']) {
    const folder = new MemoryFolder();
    const alice = newProfile('Alice');
    const bob = newProfile('Bob');
    const a = await store.openDataFolder(folder.handle);
    const b = await store.openDataFolder(folder.handle);
    await store.load(a);
    await store.load(b);
    const plan = await store.prepareRestore(b, { kind: 'save-state', saveState: await saveStateOf(bodyWithHazards(bob, ['restored by Bob']), bob) });
    await store.save(a, activeOf(alice), bodyWithHazards(alice, ['saved by Alice'])); // so Bob's restore passes the copy
    const dataBefore = folder.read(schema.DATA_FOLDER.data);

    arm(point);
    try {
      await assert.rejects(() => store.restore(b, activeOf(bob), plan), carriesInjectedFault, point);
    } finally {
      disarm_all();
    }
    const opened = await schema.open(/** @type {string} */ (folder.read(schema.DATA_FOLDER.data)));
    assert.ok(opened.ok, `${point}: data.json still opens`);
    if (point === 'store.save.data-written') assert.deepEqual(opened.envelope.body, plan.body, `${point}: the restore's envelope, whole`);
    else assert.equal(folder.read(schema.DATA_FOLDER.data), dataBefore, `${point}: byte-for-byte as before`);
  }
});

test('a save stopped at store.save.data-staged leaves data.json byte-for-byte as it was and readable, unsavedChanges names what was not stored, and a retry saves (C-010, C-011 fault point)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const opened = await store.openDataFolder(folder.handle);
  await store.load(opened);
  const first = bodyWithHazards(alice, ['saved']);
  await store.save(opened, activeOf(alice), first);
  const dataBefore = folder.read(schema.DATA_FOLDER.data);
  const second = structuredClone(first);
  second.collections.hazard = { ...second.collections.hazard, 'H-0002': { .../** @type {any} */ (first.collections.hazard)['H-0001'], id: 'H-0002', title: 'not saved' } };
  second.sequences.hazard = 3;

  arm('store.save.data-staged');
  try {
    await assert.rejects(() => store.save(opened, activeOf(alice), second), carriesInjectedFault);
  } finally {
    disarm_all();
  }
  assert.equal(folder.read(schema.DATA_FOLDER.data), dataBefore, 'byte-for-byte what it was');
  assert.ok((await schema.open(/** @type {string} */ (dataBefore))).ok, 'and it still opens');
  assert.deepEqual([...(await store.unsavedChanges(opened, second))], [{ kind: 'hazard', id: 'H-0002' }], 'the change that is not in the folder is named');

  const retry = await store.save(opened, activeOf(alice), second);
  assert.equal(retry.superseded, null, 'the interrupted save adopted nothing and was not another user\'s');
  const afterwards = await store.load(await store.openDataFolder(folder.handle));
  assert.deepEqual(afterwards.body, second);
});

test('a noteChange stopped at store.backup.written propagates with the new backup complete and no older one removed; the next backup prunes the ring (C-014 fault point)', async () => {
  await withBrowserStorage(async () => {
    const clock = holdClock();
    try {
      const folder = new MemoryFolder();
      const alice = newProfile('Alice');
      const planted = await plantRing(folder, clock, schema.BACKUP_RING_SIZE, alice);
      const opened = await store.openDataFolder(folder.handle);
      await store.load(opened);
      const changed = bodyWithHazards(alice, ['backed up, then the fault']);

      arm('store.backup.written');
      try {
        await assert.rejects(() => store.noteChange(opened, activeOf(alice), changed), carriesInjectedFault);
      } finally {
        disarm_all();
      }
      const written = backupPathAt(clock.now());
      const openedBackup = await schema.open(/** @type {string} */ (folder.read(written)));
      assert.ok(openedBackup.ok, 'the new backup is complete');
      assert.deepEqual(openedBackup.envelope.body, changed);
      for (const rel of planted) assert.ok(folder.exists(rel), `${rel} was not removed`);
      assert.equal(backupsInFolder(folder).length, schema.BACKUP_RING_SIZE + 1);

      clock.advance(3601);
      const next = await store.noteChange(opened, activeOf(alice), bodyWithHazards(alice, ['the next change']));
      assert.equal(next.backupError, null);
      const remaining = backupsInFolder(folder).map((entry) => entry.file);
      assert.equal(remaining.length, schema.BACKUP_RING_SIZE);
      assert.deepEqual(remaining.slice(0, 2), [backupPathAt(clock.now()), written]);
      assert.equal(folder.exists(planted[0]) || folder.exists(planted[1]), false, 'the two oldest went');
    } finally {
      clock.release();
    }
  });
});

test('writeExportFile with a missing target, a target with no createWritable, or text that is not a string rejects at stage export naming the target, and writes nothing (section 4, C-020)', async () => {
  /** @type {[string, unknown, unknown, string][]} */
  const detached = [
    ['no target', undefined, '<svg/>', ''],
    ['a null target', null, '<svg/>', ''],
    ['a target with no name and no createWritable', {}, '<svg/>', ''],
    ['a target with no createWritable', { name: 'plain.svg' }, '<svg/>', 'plain.svg'],
  ];
  for (const [label, target, text, name] of detached) {
    await assert.rejects(() => store.writeExportFile(/** @type {any} */ (target), /** @type {any} */ (text)), (e) => isWriteError(e, 'export', (file) => file === name), label);
  }
  for (const [label, text] of [['a number', 42], ['null', null], ['undefined', undefined], ['bytes', new TextEncoder().encode('<svg/>')]]) {
    const target = new MemoryExportFile('held.svg', 'held before');
    await assert.rejects(() => store.writeExportFile(target, /** @type {any} */ (text)), (e) => isWriteError(e, 'export', (file) => file === 'held.svg'), `text as ${label}`);
    assert.deepEqual(target.contents(), new TextEncoder().encode('held before'), `text as ${label}: nothing written`);
    assert.equal(target.committed, 0);
  }
});

test('when the export write does not complete, writeExportFile rejects at stage export naming the target with the browser\'s error as cause, and the file holds what it held (section 4, C-020)', async () => {
  const held = 'what the file held before';
  const refused = permissionRefused();
  const onCreate = new MemoryExportFile('refused.svg', held);
  onCreate.failCreate = refused;
  await assert.rejects(() => store.writeExportFile(onCreate, '<svg/>'), (e) => isWriteError(e, 'export', (f) => f === 'refused.svg') && /** @type {Error} */ (e).cause === refused, 'permission refused');
  assert.deepEqual(onCreate.contents(), new TextEncoder().encode(held));

  const full = diskFull();
  const onWrite = new MemoryExportFile('full.svg', held);
  onWrite.failWrite = full;
  await assert.rejects(() => store.writeExportFile(onWrite, '<svg/>'), (e) => isWriteError(e, 'export', (f) => f === 'full.svg') && /** @type {Error} */ (e).cause === full, 'disk full on write');
  assert.deepEqual(onWrite.contents(), new TextEncoder().encode(held));
  assert.equal(onWrite.committed, 0, 'not committed');
  assert.equal(onWrite.aborted, 1, 'the stream is aborted');

  const onClose = new MemoryExportFile('full at close.svg', held);
  onClose.failClose = full;
  await assert.rejects(() => store.writeExportFile(onClose, '<svg/>'), (e) => isWriteError(e, 'export', (f) => f === 'full at close.svg') && /** @type {Error} */ (e).cause === full, 'disk full on close');
  assert.deepEqual(onClose.contents(), new TextEncoder().encode(held));
});

test('an export stopped at store.export.staged propagates, the stream is aborted and not committed, the file holds what it held, and a retry writes (C-020 fault point)', async () => {
  const held = 'held before';
  const target = new MemoryExportFile('diagram.svg', held);
  arm('store.export.staged');
  try {
    await assert.rejects(() => store.writeExportFile(target, '<svg>new</svg>'), carriesInjectedFault);
  } finally {
    disarm_all();
  }
  assert.deepEqual(target.contents(), new TextEncoder().encode(held));
  assert.equal(target.committed, 0);
  assert.equal(target.aborted, 1);

  await store.writeExportFile(target, '<svg>new</svg>');
  assert.deepEqual(target.contents(), new TextEncoder().encode('<svg>new</svg>'));
});
