/**
 * store conformance: boundaries (CORE-CON-002). Empty, null, degenerate, and edge cases of
 * modules/store/CONTRACT.md: a folder never saved to, a null last save against a stamp on
 * disk, a data.json that disappeared, two supersessions in one second, a zero-byte file,
 * and the relative-path promise of section 3. Written from the contract before any
 * implementation (P8). Extended from store 2.0 to 4.0: the hour exactly and a second past it,
 * a ring of exactly 72, files checkFolder must pass over, an unchanged body, empty mirrors and
 * lists, a zero-byte stored file, invalid locations, an empty export, a restore into a folder
 * never saved to, and the names section 3 promises are relative or as given.
 *
 * The null double must fail this file (CORE-TST-002, rung 1).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as store from '../contract.js';
import { StoreReadError } from '../contract.js';
import * as schema from '../../../baseline/schema.js';
import {
  MemoryExportFile, MemoryFolder, activeOf, backupPathAt, backupsInFolder, bodyWithHazards, dataFileText, hazardRecord, holdClock,
  incomingFile, keptPathFor, mirrorText, newProfile, nowAest, plantBackup, tamperedText, withBrowserStorage,
} from './harness.js';

/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */

test('an empty collections body and a bare sequence counter save and load unchanged (C-001, C-007)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const opened = await store.openDataFolder(folder.handle);
  const empty = await store.load(opened);
  assert.deepEqual(empty, { body: { collections: {}, sequences: { hazard: 1 } }, lastSave: null });

  const counted = await store.save(opened, activeOf(alice), { collections: {}, sequences: { hazard: 42 } });
  assert.equal(counted.superseded, null, 'the first save into a never-saved folder is not a supersession');
  const loaded = await store.load(await store.openDataFolder(folder.handle));
  assert.deepEqual(loaded.body, { collections: {}, sequences: { hazard: 42 } }, 'a counter with no records is data (REQ-050)');
  assert.deepEqual(loaded.lastSave, counted.stamp);
});

test('degenerate field values survive a round trip: empty string, zero, false, null, empty array, unicode (C-001)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const record = hazardRecord(1, alice, '');
  Object.assign(record, { zero: 0, no: false, nothing: null, none: [], nested: { deeper: [[], {}, ''] }, text: 'Übertemperatur 火災 "quoted" \\ back\nslash', big: 9007199254740991 });
  /** @type {DataBody} */
  const body = { collections: { hazard: { [record.id]: record } }, sequences: { hazard: 2 } };
  const frozen = JSON.stringify(body);
  const opened = await store.openDataFolder(folder.handle);
  await store.load(opened);
  await store.save(opened, activeOf(alice), body);
  const loaded = await store.load(await store.openDataFolder(folder.handle));
  assert.equal(JSON.stringify(loaded.body), frozen);
  assert.deepEqual(loaded.body, body);
});

test('the first save into a folder another copy saved to first is a supersession of a null last save (C-004, C-007)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const bob = newProfile('Bob');
  const a = await store.openDataFolder(folder.handle);
  const b = await store.openDataFolder(folder.handle);
  assert.equal((await store.load(a)).lastSave, null);
  assert.equal((await store.load(b)).lastSave, null);
  const saveA = await store.save(a, activeOf(alice), bodyWithHazards(alice, ['first in']));
  const aliceText = folder.read(schema.DATA_FOLDER.data);
  const saveB = await store.save(b, activeOf(bob), bodyWithHazards(bob, ['second in']));
  assert.deepEqual(saveB.superseded, saveA.stamp);
  assert.equal(saveB.keptAs, keptPathFor(saveA.stamp));
  assert.equal(folder.read(keptPathFor(saveA.stamp)), aliceText);
});

test('a data.json deleted since this load is treated as never saved to: the save proceeds and nothing is kept (C-007)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const opened = await store.openDataFolder(folder.handle);
  await store.load(opened);
  await store.save(opened, activeOf(alice), bodyWithHazards(alice, ['before deletion']));
  folder.remove(schema.DATA_FOLDER.data);

  const after = bodyWithHazards(alice, ['after deletion']);
  const outcome = await store.save(opened, activeOf(alice), after);
  assert.equal(outcome.superseded, null);
  assert.equal(outcome.keptAs, null);
  assert.deepEqual(folder.list(), [schema.DATA_FOLDER.data], 'nothing under Superseded Saves');
  const loaded = await store.load(await store.openDataFolder(folder.handle));
  assert.deepEqual(loaded.body, after);
  assert.deepEqual(loaded.lastSave, outcome.stamp);
});

test('two supersessions with the same second keep two files told apart by token (C-004)', async () => {
  const folder = new MemoryFolder();
  const users = [newProfile('Alice'), newProfile('Bob'), newProfile('Carol')];
  const copies = [];
  for (const user of users) {
    const opened = await store.openDataFolder(folder.handle);
    await store.load(opened);
    copies.push({ user, opened });
  }
  const outcomes = [];
  for (const { user, opened } of copies) outcomes.push(await store.save(opened, activeOf(user), bodyWithHazards(user, [user.name])));

  const [first, second, third] = outcomes;
  assert.equal(first.superseded, null);
  assert.deepEqual(second.superseded, first.stamp);
  assert.deepEqual(third.superseded, second.stamp);
  assert.notEqual(second.keptAs, third.keptAs, 'names differ even when the two superseded stamps share a second');
  assert.deepEqual(folder.list(), [schema.DATA_FOLDER.data, second.keptAs, third.keptAs].sort());
  const keptFirst = await schema.open(/** @type {string} */ (folder.read(/** @type {string} */ (second.keptAs))));
  const keptSecond = await schema.open(/** @type {string} */ (folder.read(/** @type {string} */ (third.keptAs))));
  assert.ok(keptFirst.ok && keptSecond.ok);
  assert.deepEqual(keptFirst.envelope.stamp, first.stamp);
  assert.deepEqual(keptSecond.envelope.stamp, second.stamp);
});

test('putProfile with an existing id replaces that profile and leaves the count unchanged (C-008)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const bob = newProfile('Bob');
  const opened = await store.openDataFolder(folder.handle);
  await store.putProfile(opened, alice);
  await store.putProfile(opened, bob);
  const renamed = { ...alice, name: 'Alice Renamed' };
  await store.putProfile(opened, renamed);
  const listed = [...(await store.readProfiles(opened))].sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(listed, [renamed, bob].sort((a, b) => a.id.localeCompare(b.id)));
  await store.putProfile(opened, renamed);
  assert.equal((await store.readProfiles(opened)).length, 2, 'putting the same profile again adds nothing');
});

test('readProfiles and load write nothing, and the first putProfile creates only profiles.json (C-009)', async () => {
  const folder = new MemoryFolder();
  const opened = await store.openDataFolder(folder.handle);
  await store.readProfiles(opened);
  await store.load(opened);
  assert.deepEqual(folder.list(), []);
  await store.putProfile(opened, newProfile('Alice'));
  assert.deepEqual(folder.list(), [schema.DATA_FOLDER.profiles]);
  const opened2 = await store.openDataFolder(folder.handle);
  await store.readProfiles(opened2);
  await store.load(opened2);
  assert.deepEqual(folder.list(), [schema.DATA_FOLDER.profiles]);
});

test('an empty data.json is refused as unreadable (C-007)', async () => {
  const folder = new MemoryFolder();
  folder.write(schema.DATA_FOLDER.data, '');
  const opened = await store.openDataFolder(folder.handle);
  await assert.rejects(() => store.load(opened), (e) => e instanceof StoreReadError && e.file === schema.DATA_FOLDER.data && e.reason === 'unreadable');
  assert.equal(folder.read(schema.DATA_FOLDER.data), '', 'left as found');
});

test('keptAs and error file names are relative to the data folder (section 3)', async () => {
  const folder = new MemoryFolder('Shared Folder');
  const alice = newProfile('Alice');
  const bob = newProfile('Bob');
  const a = await store.openDataFolder(folder.handle);
  const b = await store.openDataFolder(folder.handle);
  await store.load(a);
  await store.load(b);
  await store.save(a, activeOf(alice), bodyWithHazards(alice, ['A']));
  const saveB = await store.save(b, activeOf(bob), bodyWithHazards(bob, ['B']));
  const keptAs = /** @type {string} */ (saveB.keptAs);
  assert.ok(!keptAs.startsWith('/') && !keptAs.includes('Shared Folder'), `${keptAs} is relative to the data folder`);
  assert.equal(keptAs.split('/')[0], schema.DATA_FOLDER.supersededSaves);
  assert.ok(folder.exists(keptAs), 'the relative path resolves inside the folder');

  folder.write(schema.DATA_FOLDER.data, 'broken');
  const reopened = await store.openDataFolder(folder.handle);
  await assert.rejects(() => store.load(reopened), (e) => e instanceof StoreReadError && e.file === schema.DATA_FOLDER.data);
});

// ------------------------------------------------------------------ store 2.0 to 4.0

test('checkFolder on an empty folder resolves empty; files that are not Pivot file names, and anything under files/, are neither checked nor listed; a missing file is not a failure (C-012)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const opened = await store.openDataFolder(folder.handle);
  assert.deepEqual([...(await store.checkFolder(opened))], [], 'an empty folder');

  const altered = tamperedText(await dataFileText(bodyWithHazards(alice, ['x']), schema.freshStamp(alice.id)));
  folder.write('stray.txt', 'not JSON {');
  folder.write('data.json.old', altered);
  folder.write('notes/data.json', altered);
  folder.writeBytes(`${schema.DATA_FOLDER.files}/looks like Pivot.json`, new TextEncoder().encode(altered));
  folder.writeBytes(`${schema.DATA_FOLDER.files}/binary.bin`, Uint8Array.from([0xff, 0x00, 0xfe]));
  folder.write(schema.DATA_FOLDER.profiles, await (async () => schema.serialize(await schema.seal('profiles', { profiles: {} }, null)))());
  assert.deepEqual([...(await store.checkFolder(opened))], [], 'only Pivot file names are checked, and data.json being absent is not a failure');
});

test('noteChange at exactly an hour since the newest backup writes none; a second later it writes one (C-013)', async () => {
  await withBrowserStorage(async () => {
    const clock = holdClock();
    try {
      const folder = new MemoryFolder();
      const alice = newProfile('Alice');
      await plantBackup(folder, clock.offset(-3600), bodyWithHazards(alice, ['an hour ago']), alice);
      const opened = await store.openDataFolder(folder.handle);
      await store.load(opened);

      const atTheHour = await store.noteChange(opened, activeOf(alice), bodyWithHazards(alice, ['at the hour']));
      assert.equal(atTheHour.changed, true);
      assert.equal(atTheHour.backupFile, null, 'an hour old is not more than an hour');
      assert.equal(backupsInFolder(folder).length, 1);

      clock.advance(1);
      const pastTheHour = await store.noteChange(opened, activeOf(alice), bodyWithHazards(alice, ['a second past']));
      assert.equal(pastTheHour.backupFile, backupPathAt(clock.now()));
      assert.equal(backupsInFolder(folder).length, 2);
    } finally {
      clock.release();
    }
  });
});

test('the newest backup is by name time across every copy: a backup another copy wrote half an hour ago means none is due (C-013)', async () => {
  await withBrowserStorage(async () => {
    const clock = holdClock();
    try {
      const folder = new MemoryFolder();
      const alice = newProfile('Alice');
      const bob = newProfile('Bob');
      const opened = await store.openDataFolder(folder.handle);
      await store.load(opened);
      await plantBackup(folder, clock.offset(-5 * 3600), bodyWithHazards(alice, ['old']), alice);
      await plantBackup(folder, clock.offset(-1800), bodyWithHazards(bob, ['Bob\'s copy, half an hour ago']), bob);
      await plantBackup(folder, clock.offset(-3 * 3600), bodyWithHazards(alice, ['older, written last']), alice);
      const outcome = await store.noteChange(opened, activeOf(alice), bodyWithHazards(alice, ['changed']));
      assert.equal(outcome.backupFile, null);
      assert.equal(backupsInFolder(folder).length, 3);
    } finally {
      clock.release();
    }
  });
});

test('noteChange with the body the store last held resolves changed false and writes nothing anywhere, even when a backup would be due (C-013, C-015)', async () => {
  await withBrowserStorage(async (env) => {
    const clock = holdClock();
    try {
      const folder = new MemoryFolder();
      const alice = newProfile('Alice');
      const stored = bodyWithHazards(alice, ['stored']);
      folder.write(schema.DATA_FOLDER.data, await dataFileText(stored, schema.freshStamp(alice.id)));
      await plantBackup(folder, clock.offset(-10 * 3600), stored, alice);
      const opened = await store.openDataFolder(folder.handle);
      const loaded = await store.load(opened);
      const before = folder.snapshot();

      const outcome = await store.noteChange(opened, activeOf(alice), structuredClone(loaded.body));
      assert.deepEqual(outcome, { changed: false, backupFile: null, backupError: null, mirrorError: null });
      assert.deepEqual(folder.snapshot(), before);
      assert.deepEqual(env.local.writes, []);
    } finally {
      clock.release();
    }
  });
});

test('with exactly 72 backups the next removes only the oldest; with 71 it removes none (C-014)', async () => {
  await withBrowserStorage(async () => {
    for (const planted of [schema.BACKUP_RING_SIZE, schema.BACKUP_RING_SIZE - 1]) {
      const clock = holdClock();
      try {
        const folder = new MemoryFolder();
        const alice = newProfile('Alice');
        /** @type {string[]} */
        const paths = [];
        for (let i = planted; i >= 1; i -= 1) paths.push(await plantBackup(folder, clock.offset(-(i + 1) * 3601), bodyWithHazards(alice, [`${i}`]), alice));
        const opened = await store.openDataFolder(folder.handle);
        await store.load(opened);
        const outcome = await store.noteChange(opened, activeOf(alice), bodyWithHazards(alice, ['changed']));
        assert.equal(outcome.backupError, null);
        const remaining = backupsInFolder(folder).map((entry) => entry.file);
        const expected = [backupPathAt(clock.now()), ...[...paths].reverse()].slice(0, schema.BACKUP_RING_SIZE);
        assert.deepEqual(remaining, expected, `with ${planted} planted`);
      } finally {
        clock.release();
      }
    }
  });
});

test('listBackups on a folder with no backups/ resolves empty (C-014)', async () => {
  const folder = new MemoryFolder();
  const opened = await store.openDataFolder(folder.handle);
  assert.deepEqual([...(await store.listBackups(opened))], []);
  assert.deepEqual(folder.list(), []);
});

test('readRecoverable resolves null with no mirror and with a mirror marked saved; discardWorkingState with no mirror resolves (C-016)', async () => {
  await withBrowserStorage(async (env) => {
    const folder = new MemoryFolder();
    const alice = newProfile('Alice');
    const opened = await store.openDataFolder(folder.handle);
    await store.load(opened);
    assert.equal(await store.readRecoverable(opened), null, 'no mirror');
    await store.discardWorkingState(opened);
    env.local.items.set(schema.BROWSER_STORAGE_KEY, mirrorText(bodyWithHazards(alice, ['saved']), schema.freshStamp(alice.id), nowAest(), false));
    assert.equal(await store.readRecoverable(opened), null, 'a mirror marked saved offers nothing');
    assert.deepEqual(folder.list(), []);
  });
});

test('working state mirrored from a folder never saved to is offered with loadedStamp null (C-015, C-016)', async () => {
  await withBrowserStorage(async () => {
    const folder = new MemoryFolder();
    const alice = newProfile('Alice');
    const opened = await store.openDataFolder(folder.handle);
    await store.load(opened);
    const body = { collections: {}, sequences: { hazard: 5 } };
    await store.noteChange(opened, activeOf(alice), body);
    const state = await store.readRecoverable(await store.openDataFolder(folder.handle));
    assert.ok(state);
    assert.deepEqual(state.body, body, 'an empty collections body mirrors as empty');
    assert.equal(state.loadedStamp, null);
  });
});

test('unsavedChanges names nothing for a change to sequences alone, or for an equal body that is a different object (C-011)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  folder.write(schema.DATA_FOLDER.data, await dataFileText(bodyWithHazards(alice, ['one', 'two']), schema.freshStamp(alice.id)));
  const opened = await store.openDataFolder(folder.handle);
  const { body } = await store.load(opened);
  assert.deepEqual([...(await store.unsavedChanges(opened, structuredClone(body)))], []);
  const moved = structuredClone(body);
  moved.sequences.hazard += 10;
  assert.deepEqual([...(await store.unsavedChanges(opened, moved))], [], 'a change to sequences alone names no record');
});

test('a zero-byte file is stored, resolves with a location, and is reported present; putStoredFile needs no load (C-018, C-019)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const opened = await store.openDataFolder(folder.handle); // never loaded
  const location = await store.putStoredFile(opened, activeOf(alice), incomingFile('empty.txt', []));
  assert.deepEqual(folder.readBytes(location), new Uint8Array(0));
  assert.deepEqual([...(await store.checkStoredFiles(opened, [location]))], [{ location, present: true, reason: null }]);
});

test('the same name and the same bytes twice are two files at two locations (C-018)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const opened = await store.openDataFolder(folder.handle);
  const first = await store.putStoredFile(opened, activeOf(alice), incomingFile('same.pdf', [7, 7, 7]));
  const second = await store.putStoredFile(opened, activeOf(alice), incomingFile('same.pdf', [7, 7, 7]));
  assert.notEqual(first, second);
  assert.equal(folder.listUnder(schema.DATA_FOLDER.files).length, 2);
});

test('checkStoredFiles with an empty list resolves empty and reads nothing, even when the folder cannot be read (C-019)', async () => {
  const folder = new MemoryFolder();
  const opened = await store.openDataFolder(folder.handle);
  folder.denyRead(() => true);
  assert.deepEqual([...(await store.checkStoredFiles(opened, []))], []);
});

test('a location whose files/ folder has gone is missing; strings that are not stored-file locations say so; repeats answer twice; none rejects (C-019)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const opened = await store.openDataFolder(folder.handle);
  const location = await store.putStoredFile(opened, activeOf(alice), incomingFile('evidence.pdf', [1, 2]));
  const notLocations = ['', schema.DATA_FOLDER.data, schema.DATA_FOLDER.files, `${schema.DATA_FOLDER.files}/`, `/${location}`, `../${location}`, 'C:\\Evidence\\evidence.pdf', 'https://example.org/evidence.pdf'];
  const answer = await store.checkStoredFiles(opened, [location, ...notLocations, location]);
  assert.deepEqual([...answer], [
    { location, present: true, reason: null },
    ...notLocations.map((l) => ({ location: l, present: false, reason: 'not-a-stored-file-location' })),
    { location, present: true, reason: null },
  ]);

  folder.remove(schema.DATA_FOLDER.files);
  assert.deepEqual([...(await store.checkStoredFiles(opened, [location]))], [{ location, present: false, reason: 'missing' }], 'files/ itself is gone');
});

test('an empty export text writes an empty file over what the file held; writeExportFile needs no DataStore (C-020)', async () => {
  const target = new MemoryExportFile('empty.svg', 'held before');
  await store.writeExportFile(target, '');
  assert.deepEqual(target.contents(), new Uint8Array(0));
  assert.equal(target.committed, 1);
});

test('prepareRestore on a loaded folder never saved to replaces null, and the restore into it is not a supersession (C-017)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const body = bodyWithHazards(alice, ['restored into an empty folder']);
  const opened = await store.openDataFolder(folder.handle);
  await store.load(opened);
  const plan = await store.prepareRestore(opened, { kind: 'save-state', saveState: { name: 'state.json', text: await dataFileText(body, schema.freshStamp(alice.id)) } });
  assert.equal(plan.replaces, null);
  const outcome = await store.restore(opened, activeOf(alice), plan);
  assert.equal(outcome.superseded, null);
  assert.deepEqual(folder.list(), [schema.DATA_FOLDER.data]);
});

test('restoring the save state of the data already stored writes a fresh stamp, not the file\'s own (C-017)', async () => {
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const opened = await store.openDataFolder(folder.handle);
  await store.load(opened);
  const saved = await store.save(opened, activeOf(alice), bodyWithHazards(alice, ['stored']));
  const plan = await store.prepareRestore(opened, { kind: 'save-state', saveState: { name: 'the same data.json', text: /** @type {string} */ (folder.read(schema.DATA_FOLDER.data)) } });
  assert.deepEqual(plan.stampInFile, saved.stamp);
  assert.deepEqual(plan.replaces, saved.stamp);
  const outcome = await store.restore(opened, activeOf(alice), plan);
  assert.equal(outcome.superseded, null);
  assert.notEqual(outcome.stamp.token, saved.stamp.token);
  assert.deepEqual((await store.load(await store.openDataFolder(folder.handle))).lastSave, outcome.stamp);
});

test('backupFile, BackupEntry.file, and StoredFileLocation are relative to the data folder; an error about a save state names it as given, and one about an export names the handle (section 3)', async () => {
  await withBrowserStorage(async () => {
    const folder = new MemoryFolder('Shared Folder');
    const alice = newProfile('Alice');
    const opened = await store.openDataFolder(folder.handle);
    await store.load(opened);
    const { backupFile } = await store.noteChange(opened, activeOf(alice), bodyWithHazards(alice, ['changed']));
    const [entry] = await store.listBackups(opened);
    const location = await store.putStoredFile(opened, activeOf(alice), incomingFile('evidence.pdf', [1]));
    for (const rel of [/** @type {string} */ (backupFile), entry.file, location]) {
      assert.ok(!rel.startsWith('/') && !rel.includes('Shared Folder'), `${rel} is relative to the data folder`);
      assert.ok(folder.exists(rel), `${rel} resolves inside the folder`);
    }
    assert.equal(entry.file, backupFile);

    const name = 'Pivot save state (copy).json';
    await assert.rejects(() => store.prepareRestore(opened, { kind: 'save-state', saveState: { name, text: 'not JSON' } }), (e) => e instanceof StoreReadError && e.file === name);
    const target = new MemoryExportFile('Hazard H-0001.svg');
    target.failCreate = new DOMException('denied', 'NotAllowedError');
    await assert.rejects(() => store.writeExportFile(target, '<svg/>'), (e) => e instanceof store.StoreWriteError && e.file === 'Hazard H-0001.svg');
  });
});
