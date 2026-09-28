/**
 * store conformance: operations (CORE-CON-002). Every signature on its happy path, each
 * test naming the clause of modules/store/CONTRACT.md it encodes. Written from the
 * contract and SL-01 criteria 2, 4, 5 and 6, before any implementation (P8); extended from
 * store 2.0 to 4.0 and SL-02 criteria 1 to 5, SL-10 criteria 2 and 4, and SL-08 criterion 3.
 *
 * `chooseDataFolder`, `chooseSaveStateFile`, and `chooseExportFile` are verified by
 * demonstration (SL-01 criterion 1, SL-02 criterion 4, SL-08 criterion 3), not here (section 2).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as store from '../contract.js';
import * as schema from '../../../baseline/schema.js';
import {
  MemoryExportFile, MemoryFolder, SAVE_TOKEN_RE, activeOf, backupPathAt, backupsInFolder, bodyWithHazards, dataFileText,
  holdClock, incomingFile, keptPathFor, newProfile, nowAest, plantBackup, recordOf, withBrowserStorage,
} from './harness.js';

test('openDataFolder names the folder and writes nothing (C-009)', async () => {
  const folder = new MemoryFolder('Pivot Data');
  const opened = await store.openDataFolder(folder.handle);
  assert.equal(opened.folderName, 'Pivot Data');
  assert.deepEqual(folder.list(), []);
});

test('readProfiles on a folder with no profiles.json resolves with an empty list (C-008)', async () => {
  const folder = new MemoryFolder();
  const opened = await store.openDataFolder(folder.handle);
  assert.deepEqual([...(await store.readProfiles(opened))], []);
  assert.deepEqual(folder.list(), []);
});

test('putProfile stores a profile that readProfiles then returns, with no active profile (C-008)', async () => {
  const folder = new MemoryFolder();
  const opened = await store.openDataFolder(folder.handle);
  const alice = newProfile('Alice');
  await store.putProfile(opened, alice);
  assert.deepEqual([...(await store.readProfiles(opened))], [alice]);

  const bob = newProfile('Bob');
  await store.putProfile(opened, bob);
  const listed = [...(await store.readProfiles(opened))].sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(listed, [alice, bob].sort((a, b) => a.id.localeCompare(b.id)));

  const other = await store.openDataFolder(folder.handle);
  assert.equal((await store.readProfiles(other)).length, 2, 'another copy on the same folder sees both');
  assert.deepEqual(folder.list(), [schema.DATA_FOLDER.profiles]);
});

test('load on a folder never saved to resolves with the empty body and no last save (C-007)', async () => {
  const folder = new MemoryFolder();
  const opened = await store.openDataFolder(folder.handle);
  const loaded = await store.load(opened);
  assert.deepEqual(loaded.body, schema.emptyDataBody());
  assert.equal(loaded.lastSave, null);
  assert.deepEqual(folder.list(), [], 'a load writes nothing');
});

test('save after load resolves with a fresh stamp and no supersession (C-005, C-006)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const opened = await store.openDataFolder(folder.handle);
  await store.load(opened);

  const before = nowAest();
  const outcome = await store.save(opened, activeOf(alice), bodyWithHazards(alice, ['loss of control']));
  const after = nowAest();

  assert.equal(outcome.superseded, null);
  assert.equal(outcome.keptAs, null);
  assert.equal(outcome.stamp.savedByProfileId, alice.id);
  assert.match(outcome.stamp.token, SAVE_TOKEN_RE);
  assert.ok(before <= outcome.stamp.savedAtAest && outcome.stamp.savedAtAest <= after, `savedAtAest ${outcome.stamp.savedAtAest} is the clock's now`);
  assert.deepEqual(folder.list(), [schema.DATA_FOLDER.data], 'the first save creates data.json and nothing else');
});

test('a saved body loads back deep-equal with the stamp as lastSave, in this copy and another (C-001)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const body = bodyWithHazards(alice, ['loss of control', 'runway incursion']);
  body.sequences.hazard = 7; // the sequence is data (REQ-050) and survives as given

  const a = await store.openDataFolder(folder.handle);
  await store.load(a);
  const outcome = await store.save(a, activeOf(alice), body);

  const again = await store.load(a);
  assert.deepEqual(again.body, body);
  assert.equal(JSON.stringify(again.body), JSON.stringify(body), 'nothing reordered inside the body');
  assert.deepEqual(again.lastSave, outcome.stamp);

  const b = await store.openDataFolder(folder.handle); // another copy of Pivot, same folder
  const theirs = await store.load(b);
  assert.deepEqual(theirs.body, body);
  assert.deepEqual(theirs.lastSave, outcome.stamp);
});

test('a save by another user since this load is kept in Superseded Saves before data.json is overwritten (C-004)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const bob = newProfile('Bob');
  const a = await store.openDataFolder(folder.handle);
  const b = await store.openDataFolder(folder.handle);
  await store.load(a);
  await store.load(b);

  const bodyA = bodyWithHazards(alice, ['as Alice saved it']);
  const saveA = await store.save(a, activeOf(alice), bodyA);
  const dataAsAliceLeftIt = folder.read(schema.DATA_FOLDER.data);

  const bodyB = bodyWithHazards(bob, ['as Bob saved it']);
  const saveB = await store.save(b, activeOf(bob), bodyB);

  assert.deepEqual(saveB.superseded, saveA.stamp, 'B is told whose save it superseded (REQ-071)');
  assert.equal(saveB.keptAs, keptPathFor(saveA.stamp));
  assert.equal(folder.read(/** @type {string} */ (saveB.keptAs)), dataAsAliceLeftIt, 'the copy is the data file exactly as found');
  assert.deepEqual(folder.list(), [schema.DATA_FOLDER.data, saveB.keptAs].sort(), 'nothing else was created');

  const afterwards = await store.load(await store.openDataFolder(folder.handle));
  assert.deepEqual(afterwards.body, bodyB, 'data.json holds B\'s save');
  assert.deepEqual(afterwards.lastSave, saveB.stamp);

  const kept = await schema.open(/** @type {string} */ (folder.read(/** @type {string} */ (saveB.keptAs))));
  assert.ok(kept.ok, 'the kept copy is a readable Pivot data file');
  assert.deepEqual(kept.envelope.body, bodyA);
  assert.deepEqual(kept.envelope.stamp, saveA.stamp);
});

// ------------------------------------------------------------------ store 2.0: integrity, unsaved changes, backups, mirror, restore

test('checkFolder on a folder holding only files Pivot wrote resolves with no failures, and each is a sealed envelope of the kind its name calls for (C-012)', async () => {
  await withBrowserStorage(async () => {
    const clock = holdClock();
    try {
      const folder = new MemoryFolder();
      const alice = newProfile('Alice');
      const bob = newProfile('Bob');
      const a = await store.openDataFolder(folder.handle);
      const b = await store.openDataFolder(folder.handle);
      await store.putProfile(a, alice);
      await store.putProfile(a, bob);
      await store.load(a);
      await store.load(b);
      await store.noteChange(a, activeOf(alice), bodyWithHazards(alice, ['backed up']));
      await store.save(a, activeOf(alice), bodyWithHazards(alice, ['saved by Alice']));
      const saveB = await store.save(b, activeOf(bob), bodyWithHazards(bob, ['saved by Bob']));
      assert.notEqual(saveB.keptAs, null, 'the setup produced a superseded copy');

      const before = folder.snapshot();
      assert.deepEqual([...(await store.checkFolder(a))], []);
      assert.deepEqual(folder.snapshot(), before, 'checkFolder writes nothing');

      const files = folder.list();
      assert.ok(files.includes(schema.DATA_FOLDER.data) && files.includes(schema.DATA_FOLDER.profiles));
      assert.ok(files.some((rel) => rel.startsWith(`${schema.DATA_FOLDER.backups}/`)), 'the setup produced a backup');
      for (const rel of files) {
        const opened = await schema.open(/** @type {string} */ (folder.read(rel)));
        assert.ok(opened.ok, `${rel} is a sealed envelope that passes its check`);
        assert.equal(opened.envelope.kind, rel === schema.DATA_FOLDER.profiles ? 'profiles' : 'data', `${rel} is the kind its name calls for`);
      }
    } finally {
      clock.release();
    }
  });
});

test('unsavedChanges names every record added, changed, or removed since the load, by kind then id, and nothing once saved (C-011)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  /** @type {import('../../../baseline/schema.js').DataBody} */
  const stored = {
    collections: {
      hazard: { 'H-1': recordOf('hazard', 'H-1', alice, 'one'), 'H-2': recordOf('hazard', 'H-2', alice, 'two') },
      control: { 'C-1': recordOf('control', 'C-1', alice, 'kept'), 'C-2': recordOf('control', 'C-2', alice, 'removed') },
    },
    sequences: { hazard: 3 },
  };
  folder.write(schema.DATA_FOLDER.data, await dataFileText(stored, schema.freshStamp(alice.id)));
  const opened = await store.openDataFolder(folder.handle);
  const loaded = await store.load(opened);
  assert.deepEqual([...(await store.unsavedChanges(opened, loaded.body))], [], 'nothing differs from what was loaded');

  const edited = structuredClone(loaded.body);
  edited.collections.platform = { 'P-1': recordOf('platform', 'P-1', alice, 'added') };
  /** @type {Record<string, any>} */ (edited.collections.hazard)['H-2'].value = 'changed';
  delete /** @type {Record<string, any>} */ (edited.collections.control)['C-2'];
  const before = folder.snapshot();
  assert.deepEqual([...(await store.unsavedChanges(opened, edited))], [
    { kind: 'control', id: 'C-2' },
    { kind: 'hazard', id: 'H-2' },
    { kind: 'platform', id: 'P-1' },
  ]);
  assert.deepEqual(folder.snapshot(), before, 'unsavedChanges writes nothing');

  await store.save(opened, activeOf(alice), edited);
  assert.deepEqual([...(await store.unsavedChanges(opened, edited))], [], 'after a save the saved body is the stored data');
});

test('noteChange on a first change writes a backup of the working state under backups at the name for now, and mirrors it (C-013, C-015)', async () => {
  await withBrowserStorage(async (env) => {
    const clock = holdClock();
    try {
      const folder = new MemoryFolder();
      const alice = newProfile('Alice');
      const opened = await store.openDataFolder(folder.handle);
      await store.load(opened);
      const body = bodyWithHazards(alice, ['not yet saved']);

      const outcome = await store.noteChange(opened, activeOf(alice), body);
      assert.deepEqual(outcome, { changed: true, backupFile: backupPathAt(clock.now()), backupError: null, mirrorError: null });
      assert.deepEqual(folder.list(), [backupPathAt(clock.now())], 'a backup and nothing else in the folder: data.json is not written');

      const backup = await schema.open(/** @type {string} */ (folder.read(backupPathAt(clock.now()))));
      assert.ok(backup.ok, 'the backup is a sealed envelope');
      assert.equal(backup.envelope.kind, 'data');
      assert.deepEqual(backup.envelope.body, body, 'it holds the working state as changed');
      const stamp = /** @type {import('../../../baseline/schema.js').SaveStamp} */ (backup.envelope.stamp);
      assert.equal(stamp.savedByProfileId, alice.id, 'sealed with a stamp for the profile');
      assert.match(stamp.token, SAVE_TOKEN_RE);

      assert.deepEqual(env.local.writes, [`setItem(${schema.BROWSER_STORAGE_KEY})`], 'one write, under the one key');
      const mirror = env.local.mirror();
      assert.ok(mirror);
      assert.equal(mirror.unsaved, true);
      assert.deepEqual(mirror.body, body);
      assert.equal(mirror.mirroredAtAest, clock.now());
      assert.equal(mirror.loadedStamp, null, 'the folder had never been saved to');
      assert.deepEqual(env.session.writes, []);
    } finally {
      clock.release();
    }
  });
});

test('listBackups lists every backup in the folder newest first, with the time from its name (C-014)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const clock = holdClock();
  try {
    for (const hoursAgo of [5, 1, 30, 2]) await plantBackup(folder, clock.offset(-hoursAgo * 3600), bodyWithHazards(alice, [`${hoursAgo}h`]), alice);
    const opened = await store.openDataFolder(folder.handle);
    const before = folder.snapshot();
    const listed = [...(await store.listBackups(opened))];
    assert.deepEqual(listed, backupsInFolder(folder));
    assert.deepEqual(listed.map((entry) => entry.takenAtAest), [1, 2, 5, 30].map((h) => clock.offset(-h * 3600)));
    assert.deepEqual(folder.snapshot(), before, 'listBackups writes nothing');
  } finally {
    clock.release();
  }
});

test('readRecoverable offers working state the folder never received; recoverWorkingState returns it; discardWorkingState removes it (C-016)', async () => {
  await withBrowserStorage(async (env) => {
    const folder = new MemoryFolder();
    const alice = newProfile('Alice');
    const crashed = await store.openDataFolder(folder.handle);
    await store.load(crashed);
    const saved = await store.save(crashed, activeOf(alice), bodyWithHazards(alice, ['saved']));
    const unsaved = bodyWithHazards(alice, ['saved', 'changed and never saved']);
    const noted = await store.noteChange(crashed, activeOf(alice), unsaved);
    assert.equal(noted.mirrorError, null);
    const mirroredAt = /** @type {import('../../../baseline/schema.js').WorkingStateMirror} */ (env.local.mirror()).mirroredAtAest;

    const reopened = await store.openDataFolder(folder.handle); // Pivot opened again after the crash
    await store.load(reopened);
    const before = folder.snapshot();
    const state = await store.readRecoverable(reopened);
    assert.deepEqual(state, { body: unsaved, mirroredAtAest: mirroredAt, loadedStamp: saved.stamp });

    const recovered = await store.recoverWorkingState(reopened, /** @type {import('../contract.js').RecoverableState} */ (state));
    assert.deepEqual(recovered, unsaved);
    assert.deepEqual(folder.snapshot(), before, 'neither reading nor recovering writes to the folder');

    await store.discardWorkingState(reopened);
    assert.equal(env.local.items.has(schema.BROWSER_STORAGE_KEY), false, 'the key is removed');
    assert.equal(await store.readRecoverable(reopened), null);
    assert.deepEqual(folder.snapshot(), before, 'discarding writes nothing to the folder');
  });
});

test('a kept backup restores through prepareRestore then restore: the plan names what it replaces, and load afterwards returns the backup\'s body (C-017)', async () => {
  await withBrowserStorage(async (env) => {
    const folder = new MemoryFolder();
    const alice = newProfile('Alice');
    const bob = newProfile('Bob');
    const clock = holdClock();
    try {
      const older = bodyWithHazards(bob, ['as it was an hour ago']);
      const stampInFile = schema.freshStamp(bob.id);
      folder.write(backupPathAt(clock.offset(-3600)), await dataFileText(older, stampInFile));
      const opened = await store.openDataFolder(folder.handle);
      await store.load(opened);
      const current = await store.save(opened, activeOf(alice), bodyWithHazards(alice, ['as it is now']));

      const [newest] = await store.listBackups(opened);
      const before = folder.snapshot();
      const plan = await store.prepareRestore(opened, { kind: 'backup', file: newest.file });
      assert.deepEqual(plan, { source: { kind: 'backup', file: newest.file }, body: older, stampInFile, replaces: current.stamp });
      assert.deepEqual(folder.snapshot(), before, 'nothing is written before restore is called (REQ-075)');
      assert.deepEqual(env.local.writes, []);

      const outcome = await store.restore(opened, activeOf(alice), plan);
      assert.equal(outcome.superseded, null);
      assert.equal(outcome.stamp.savedByProfileId, alice.id, 'the restore carries a fresh stamp for the restoring profile');
      assert.notEqual(outcome.stamp.token, stampInFile.token, 'the file\'s own stamp is not written back');
      const afterwards = await store.load(await store.openDataFolder(folder.handle));
      assert.deepEqual(afterwards.body, older);
      assert.deepEqual(afterwards.lastSave, outcome.stamp);
    } finally {
      clock.release();
    }
  });
});

test('a save state file the user chose restores through the same path as a backup (C-017)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const fromElsewhere = bodyWithHazards(alice, ['from another machine']);
  const stampInFile = schema.freshStamp(alice.id);
  /** @type {import('../contract.js').SaveStateFile} */
  const saveState = { name: 'Pivot save state 2026-09-01.json', text: await dataFileText(fromElsewhere, stampInFile) };

  const opened = await store.openDataFolder(folder.handle);
  await store.load(opened);
  const plan = await store.prepareRestore(opened, { kind: 'save-state', saveState });
  assert.deepEqual(plan, { source: { kind: 'save-state', saveState }, body: fromElsewhere, stampInFile, replaces: null });
  assert.deepEqual(folder.list(), [], 'prepareRestore writes nothing');

  const outcome = await store.restore(opened, activeOf(alice), plan);
  const afterwards = await store.load(await store.openDataFolder(folder.handle));
  assert.deepEqual(afterwards.body, fromElsewhere);
  assert.deepEqual(afterwards.lastSave, outcome.stamp);
  assert.deepEqual(folder.list(), [schema.DATA_FOLDER.data]);
});

// ------------------------------------------------------------------ store 3.0: stored files

test('putStoredFile keeps the bytes under files and resolves with the location; checkStoredFiles reports it present (C-018, C-019)', async () => {
  await withBrowserStorage(async (env) => {
    const folder = new MemoryFolder('Pivot Data');
    const alice = newProfile('Alice');
    const opened = await store.openDataFolder(folder.handle);
    const bytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0x80, 0x0a]);

    const location = await store.putStoredFile(opened, activeOf(alice), incomingFile('Safety Case.pdf', bytes));
    assert.equal(typeof location, 'string');
    assert.ok(location.startsWith(`${schema.DATA_FOLDER.files}/`), `${location} is under files/, relative to the data folder`);
    assert.deepEqual(folder.readBytes(location), bytes, 'the file is there byte-for-byte');
    assert.deepEqual(folder.list(), [location], 'one file, and data.json is not written');
    assert.deepEqual(env.local.writes, [], 'the browser\'s storage is not written');

    const before = folder.snapshot();
    assert.deepEqual([...(await store.checkStoredFiles(opened, [location]))], [{ location, present: true, reason: null }]);
    assert.deepEqual(folder.snapshot(), before, 'checkStoredFiles writes nothing');
  });
});

// ------------------------------------------------------------------ store 4.0: export

test('writeExportFile writes exactly the text given, as UTF-8, to the file the user chose, replacing what it held (C-020)', async () => {
  const target = new MemoryExportFile('Hazard H-0001 on P-1.svg', 'what the file held before, which was longer than what replaces it');
  const text = '<svg xmlns="http://www.w3.org/2000/svg"><text>Übertemperatur 火災 — "quoted" &amp; 🔥</text></svg>\n';

  await store.writeExportFile(target, text);
  assert.deepEqual(target.contents(), new TextEncoder().encode(text), 'the UTF-8 encoding of the text, byte-for-byte, with no byte-order mark');
  assert.equal(target.opened, 1, 'through one createWritable stream');
  assert.equal(target.committed, 1);
});
