/**
 * store conformance: invariants (CORE-CON-002). Property-based over seeded random bodies
 * and seeded random interleavings of two copies of Pivot on one folder (CORE-TST-001: the
 * seed is fixed and recorded in harness.js). Each test states the model it checks against
 * and the clause of modules/store/CONTRACT.md that model comes from. Written from the
 * contract before any implementation (P8).
 *
 * The null double must fail this file (CORE-TST-002, rung 1): fixed data cannot round-trip
 * what was saved, and cannot tell one copy's stamp from another's.
 *
 * Extended from store 2.0 to 4.0 with models of: data.json whole or not at all across every
 * save fault (C-010), the records a body differs by (C-011), what checkFolder lists (C-012),
 * the backup ring against a held clock (C-013, C-014), the browser's copy (C-015, C-016),
 * restore as save (C-017), stored files and their presence (C-018, C-019), the export file
 * (C-020), and confinement over every operation (C-009).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

import * as store from '../contract.js';
import * as schema from '../../../baseline/schema.js';
import { arm, disarm_all } from '../../../baseline/faults.js';
import {
  AWKWARD_FILE_NAMES, MemoryExportFile, MemoryFolder, SAVE_TOKEN_RE, SEED, activeOf, backupPathAt, backupsInFolder, bodyWithHazards,
  carriesInjectedFault, dataFileText, editedBody, holdClock, incomingFile, keptPathFor, newProfile, nowAest, pick, plantBackup, prng,
  randomBody, randomBytes, randomMultiKindBody, tamperedText, timeInBackupName, withBrowserStorage,
} from './harness.js';

/** @typedef {import('../../../baseline/schema.js').SaveStamp} SaveStamp */
/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */
/** @typedef {import('../../../baseline/types.js').UserProfile} UserProfile */

const ROUNDS = 25;

test('round trip: any body saved loads back identical in this store and in another copy (C-001)', async () => {
  const random = prng(SEED);
  const alice = newProfile('Alice');
  for (let i = 0; i < ROUNDS; i += 1) {
    const folder = new MemoryFolder();
    const body = randomBody(random, alice);
    const frozen = JSON.stringify(body);
    const a = await store.openDataFolder(folder.handle);
    await store.load(a);
    const outcome = await store.save(a, activeOf(alice), body);

    const mine = await store.load(a);
    assert.equal(JSON.stringify(mine.body), frozen, `round ${i}: nothing added, dropped, or reordered in this copy`);
    assert.deepEqual(mine.lastSave, outcome.stamp, `round ${i}: lastSave is the stamp save returned`);

    const theirs = await store.load(await store.openDataFolder(folder.handle));
    assert.equal(JSON.stringify(theirs.body), frozen, `round ${i}: identical in another copy`);
    assert.deepEqual(theirs.lastSave, outcome.stamp);
    assert.equal(JSON.stringify(body), frozen, `round ${i}: the body passed in was not mutated`);
  }
});

test('every save carries a fresh token, the active profile id, and the clock now; the store adopts it (C-006)', async () => {
  const random = prng(SEED + 1);
  const folder = new MemoryFolder();
  const users = [newProfile('Alice'), newProfile('Bob'), newProfile('Carol')];
  const opened = await store.openDataFolder(folder.handle);
  await store.load(opened);
  /** @type {Set<string>} */
  const tokens = new Set();
  for (let i = 0; i < ROUNDS; i += 1) {
    const user = users[pick(random, users.length)];
    const before = nowAest();
    const outcome = await store.save(opened, activeOf(user), randomBody(random, user));
    const after = nowAest();
    assert.equal(outcome.stamp.savedByProfileId, user.id, `save ${i}: stamped by the active profile`);
    assert.match(outcome.stamp.token, SAVE_TOKEN_RE, `save ${i}: a 32-hex token`);
    assert.ok(!tokens.has(outcome.stamp.token), `save ${i}: token differs from every stamp this store has written`);
    tokens.add(outcome.stamp.token);
    assert.ok(before <= outcome.stamp.savedAtAest && outcome.stamp.savedAtAest <= after, `save ${i}: savedAtAest is now`);
    assert.equal(outcome.superseded, null, `save ${i}: the store adopted its own last stamp, so no supersession`);
    assert.equal(outcome.keptAs, null);
    assert.deepEqual((await store.load(await store.openDataFolder(folder.handle))).lastSave, outcome.stamp, `save ${i}: another copy loads it as lastSave`);
  }
  assert.deepEqual(folder.list(), [schema.DATA_FOLDER.data], 'one copy saving alone never creates a superseded copy');
});

test('saving the same body twice yields two stamps and the second is not a supersession (C-005, C-006)', async () => {
  const random = prng(SEED + 2);
  const alice = newProfile('Alice');
  for (let i = 0; i < 5; i += 1) {
    const folder = new MemoryFolder();
    const body = randomBody(random, alice);
    const opened = await store.openDataFolder(folder.handle);
    await store.load(opened);
    const first = await store.save(opened, activeOf(alice), body);
    const second = await store.save(opened, activeOf(alice), body);
    assert.notEqual(second.stamp.token, first.stamp.token, `round ${i}: two saves, two stamps`);
    assert.equal(second.superseded, null, `round ${i}: not a supersession`);
    assert.equal(second.keptAs, null);
    assert.deepEqual((await store.load(opened)).lastSave, second.stamp, `round ${i}: the later stamp is the one on disk`);
    assert.deepEqual(folder.list(), [schema.DATA_FOLDER.data]);
  }
});

test('interleaved saves and loads by two copies: a save supersedes exactly when the disk stamp differs from the stamp last loaded or saved, and every superseded save is kept (C-004, C-005, C-006)', async () => {
  const random = prng(SEED + 3);
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const bob = newProfile('Bob');

  /** @typedef {{ name: string, profile: UserProfile, store: import('../contract.js').DataStore, known: SaveStamp | null }} Copy */
  /** @type {Copy[]} */
  const copies = [
    { name: 'A', profile: alice, store: await store.openDataFolder(folder.handle), known: null },
    { name: 'B', profile: bob, store: await store.openDataFolder(folder.handle), known: null },
  ];
  for (const copy of copies) await store.load(copy.store);

  // The model: what data.json holds, and every copy that must exist under Superseded Saves.
  /** @type {SaveStamp | null} */
  let diskStamp = null;
  /** @type {DataBody} */
  let diskBody = schema.emptyDataBody();
  /** @type {string | null} */
  let diskText = null;
  /** @type {Map<string, string>} */
  const kept = new Map();

  for (let step = 0; step < 60; step += 1) {
    const copy = copies[pick(random, copies.length)];
    const op = random() < 0.7 ? 'save' : 'load';
    const at = `step ${step}: ${copy.name} ${op}`;
    if (op === 'load') {
      const loaded = await store.load(copy.store);
      assert.deepEqual(loaded.body, diskBody, `${at}: sees what is on disk`);
      assert.deepEqual(loaded.lastSave, diskStamp, `${at}: sees the stamp on disk`);
      copy.known = diskStamp;
      continue;
    }
    const body = randomBody(random, copy.profile);
    const expectSupersession = !schema.sameStamp(diskStamp, copy.known);
    const outcome = await store.save(copy.store, activeOf(copy.profile), body);
    if (expectSupersession) {
      const stampFound = /** @type {SaveStamp} */ (diskStamp);
      assert.deepEqual(outcome.superseded, stampFound, `${at}: superseded the stamp found on disk`);
      assert.equal(outcome.keptAs, keptPathFor(stampFound), `${at}: kept under the promised name`);
      assert.equal(folder.read(keptPathFor(stampFound)), diskText, `${at}: kept exactly as found`);
      kept.set(keptPathFor(stampFound), /** @type {string} */ (diskText));
    } else {
      assert.equal(outcome.superseded, null, `${at}: no one else saved since ${copy.name} last loaded or saved`);
      assert.equal(outcome.keptAs, null, at);
    }
    assert.ok(!schema.sameStamp(outcome.stamp, diskStamp), `${at}: the new stamp differs from the one it replaced`);
    diskStamp = outcome.stamp;
    diskBody = body;
    diskText = folder.read(schema.DATA_FOLDER.data);
    copy.known = outcome.stamp;
  }

  assert.ok(kept.size >= 3, `the seed produced ${kept.size} supersessions; the interleaving must exercise C-004 (change the seed on purpose if this fails)`);
  const supersededFiles = folder.list().filter((rel) => rel.startsWith(`${schema.DATA_FOLDER.supersededSaves}/`));
  assert.deepEqual(supersededFiles, [...kept.keys()].sort(), 'Superseded Saves holds every superseded save and nothing else');
  for (const [rel, text] of kept) assert.equal(folder.read(rel), text, `${rel} still holds the save it kept`);
  const final = await store.load(await store.openDataFolder(folder.handle));
  assert.deepEqual(final.body, diskBody);
  assert.deepEqual(final.lastSave, diskStamp);
});

test('profiles only grow: a put adds or replaces by id and never removes another (C-008)', async () => {
  const random = prng(SEED + 4);
  const folder = new MemoryFolder();
  const opened = await store.openDataFolder(folder.handle);
  /** @type {Map<string, UserProfile>} */
  const model = new Map();
  const names = ['Alice', 'Bob', 'Carol', 'Dan', 'Eve', 'Frances'];
  for (let step = 0; step < 30; step += 1) {
    const replace = model.size > 0 && random() < 0.4;
    /** @type {UserProfile} */
    let profile;
    if (replace) {
      const existing = [...model.values()][pick(random, model.size)];
      profile = { ...existing, name: `${existing.name} (renamed ${step})` };
    } else {
      profile = newProfile(names[pick(random, names.length)]);
    }
    await store.putProfile(opened, profile);
    model.set(profile.id, profile);
    const listed = [...(await store.readProfiles(opened))].sort((a, b) => a.id.localeCompare(b.id));
    const expected = [...model.values()].sort((a, b) => a.id.localeCompare(b.id));
    assert.deepEqual(listed, expected, `step ${step}: every profile that was there before plus this one`);
  }
  const theirs = [...(await store.readProfiles(await store.openDataFolder(folder.handle)))].sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(theirs, [...model.values()].sort((a, b) => a.id.localeCompare(b.id)), 'another copy reads the same set');
});

test('confinement: after any sequence the folder holds only data.json, profiles.json and files under Superseded Saves (C-009)', async () => {
  const random = prng(SEED + 5);
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const bob = newProfile('Bob');
  const a = await store.openDataFolder(folder.handle);
  const b = await store.openDataFolder(folder.handle);
  await store.load(a);
  await store.load(b);
  let supersessions = 0;
  for (let step = 0; step < 40; step += 1) {
    const r = random();
    if (r < 0.2) await store.putProfile(a, newProfile(`user ${step}`));
    else if (r < 0.4) await store.load(random() < 0.5 ? a : b);
    else {
      const mine = random() < 0.5;
      const outcome = await store.save(mine ? a : b, activeOf(mine ? alice : bob), randomBody(random, mine ? alice : bob));
      if (outcome.superseded !== null) supersessions += 1;
    }
  }
  const files = folder.list();
  const allowed = new RegExp(`^(${schema.DATA_FOLDER.data}|${schema.DATA_FOLDER.profiles}|${schema.DATA_FOLDER.supersededSaves}/data-\\d{8}-\\d{6}-[0-9a-f]{8}\\.json)$`);
  for (const rel of files) assert.match(rel, allowed, `${rel} is not a file this version may create`);
  assert.ok(files.includes(schema.DATA_FOLDER.data) && files.includes(schema.DATA_FOLDER.profiles), 'the sequence wrote both files');
  assert.ok(supersessions > 0, 'the seed produced no supersession; change it on purpose if this fails');
});

test('loading twice is harmless and writes nothing (C-009)', async () => {
  const random = prng(SEED + 6);
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const opened = await store.openDataFolder(folder.handle);
  await store.putProfile(opened, alice);
  await store.load(opened);
  await store.save(opened, activeOf(alice), randomBody(random, alice));
  const before = folder.snapshot();
  const first = await store.load(opened);
  const second = await store.load(opened);
  assert.deepEqual(second, first);
  assert.deepEqual(await store.readProfiles(opened), await store.readProfiles(opened));
  assert.deepEqual(folder.snapshot(), before, 'reads changed nothing');
});

// ------------------------------------------------------------------ store 2.0 to 4.0

/**
 * The records `body` differs from `stored` by, as C-011 defines them, in its order.
 * @param {DataBody} stored
 * @param {DataBody} body
 * @returns {{ kind: string, id: string }[]}
 */
function expectedChanges(stored, body) {
  /** @type {{ kind: string, id: string }[]} */
  const refs = [];
  const collections = (/** @type {DataBody} */ b) => /** @type {Record<string, Record<string, unknown>>} */ (b.collections);
  const kinds = new Set([...Object.keys(stored.collections), ...Object.keys(body.collections)]);
  for (const kind of kinds) {
    const s = collections(stored)[kind] ?? {};
    const b = collections(body)[kind] ?? {};
    for (const id of new Set([...Object.keys(s), ...Object.keys(b)])) {
      if (!(id in s) || !(id in b) || !isDeepStrictEqual(s[id], b[id])) refs.push({ kind, id });
    }
  }
  const cmp = (/** @type {string} */ x, /** @type {string} */ y) => (x < y ? -1 : x > y ? 1 : 0);
  return refs.sort((x, y) => cmp(x.kind, y.kind) || cmp(x.id, y.id));
}

/**
 * @param {unknown} e
 * @param {string} stage
 * @returns {boolean}
 */
function isWriteErrorAt(e, stage) {
  return e instanceof store.StoreWriteError && e.stage === stage;
}

test('whole or not at all: over seeded saves and restores stopped at every save fault point or write failure, data.json is byte-for-byte what it was or the call\'s envelope whole, and always opens (C-010)', async () => {
  const random = prng(SEED + 10);
  const alice = newProfile('Alice');
  const bob = newProfile('Bob');
  const modes = ['none', 'store.save.superseded-copied', 'store.save.data-staged', 'store.save.data-written', 'fail data.json', 'fail superseded copy'];
  for (let round = 0; round < 36; round += 1) {
    const mode = modes[round % modes.length];
    const needsCopy = mode === 'store.save.superseded-copied' || mode === 'fail superseded copy';
    const folder = new MemoryFolder();
    const a = await store.openDataFolder(folder.handle);
    const b = await store.openDataFolder(folder.handle);
    await store.load(a);
    await store.save(a, activeOf(alice), randomBody(random, alice));
    await store.load(b);
    if (needsCopy || random() < 0.5) await store.save(a, activeOf(alice), randomBody(random, alice)); // b is now stale

    const body = randomBody(random, bob);
    const useRestore = random() < 0.5;
    const plan = useRestore
      ? await store.prepareRestore(b, { kind: 'save-state', saveState: { name: 'state.json', text: await dataFileText(body, schema.freshStamp(bob.id)) } })
      : null;
    const before = folder.read(schema.DATA_FOLDER.data);
    const at = `round ${round}: ${useRestore ? 'restore' : 'save'} with ${mode}`;

    if (mode.startsWith('store.')) arm(mode);
    if (mode === 'fail data.json') folder.failWrite((rel) => rel === schema.DATA_FOLDER.data);
    if (mode === 'fail superseded copy') folder.failWrite((rel) => rel.startsWith(`${schema.DATA_FOLDER.supersededSaves}/`));
    /** @type {unknown} */
    let rejection = null;
    try {
      if (plan) await store.restore(b, activeOf(bob), plan);
      else await store.save(b, activeOf(bob), body);
    } catch (e) {
      rejection = e;
    } finally {
      disarm_all();
      folder.failWrite(() => false);
    }

    const text = /** @type {string} */ (folder.read(schema.DATA_FOLDER.data));
    const opened = await schema.open(text);
    assert.ok(opened.ok, `${at}: data.json opens`);
    if (mode === 'none') {
      assert.equal(rejection, null, `${at}: resolves`);
      assert.deepEqual(opened.envelope.body, body, at);
    } else if (mode === 'store.save.data-written') {
      assert.ok(carriesInjectedFault(rejection), `${at}: the fault propagates`);
      assert.deepEqual(opened.envelope.body, body, `${at}: rejected after the commit, so data.json holds this envelope whole`);
    } else {
      if (mode.startsWith('store.')) assert.ok(carriesInjectedFault(rejection), `${at}: the fault propagates`);
      else assert.ok(isWriteErrorAt(rejection, mode === 'fail data.json' ? 'data' : 'superseded-copy'), `${at}: StoreWriteError at the stage`);
      assert.equal(text, before, `${at}: rejected before the commit, so data.json is byte-for-byte what it was`);
    }
  }
});

test('unsaved changes: over seeded edits, saves, and failed saves, unsavedChanges names exactly the records added, changed, or removed against the stored data as last loaded or saved, by kind then id (C-011)', async () => {
  const random = prng(SEED + 11);
  const alice = newProfile('Alice');
  const folder = new MemoryFolder();
  folder.write(schema.DATA_FOLDER.data, await dataFileText(randomMultiKindBody(random, alice), schema.freshStamp(alice.id)));
  const opened = await store.openDataFolder(folder.handle);
  let stored = (await store.load(opened)).body;
  let working = structuredClone(stored);
  let saves = 0;
  let failedSaves = 0;
  let named = 0;
  for (let step = 0; step < 80; step += 1) {
    const r = random();
    if (r < 0.12) {
      await store.save(opened, activeOf(alice), working);
      stored = structuredClone(working);
      saves += 1;
    } else if (r < 0.22) {
      folder.failWrite((rel) => rel === schema.DATA_FOLDER.data);
      try {
        await assert.rejects(() => store.save(opened, activeOf(alice), working));
      } finally {
        folder.failWrite(() => false);
      }
      failedSaves += 1;
    } else {
      working = editedBody(random, working, alice);
    }
    const expected = expectedChanges(stored, working);
    assert.deepEqual([...(await store.unsavedChanges(opened, working))], expected, `step ${step}`);
    if (expected.length > 1) named += 1;
  }
  assert.ok(saves > 0 && failedSaves > 0 && named > 0, `the seed exercised saves (${saves}), failed saves (${failedSaves}), and several changes at once (${named})`);
});

test('checked files: after seeded saves, supersessions, backups, profiles, and stored files, every Pivot file is a sealed envelope of its kind, and altering any one outside Pivot makes checkFolder list exactly that file (C-012)', async () => {
  await withBrowserStorage(async () => {
    const clock = holdClock();
    try {
      const random = prng(SEED + 12);
      const folder = new MemoryFolder();
      const alice = newProfile('Alice');
      const bob = newProfile('Bob');
      const copies = [
        { profile: alice, store: await store.openDataFolder(folder.handle) },
        { profile: bob, store: await store.openDataFolder(folder.handle) },
      ];
      await store.putProfile(copies[0].store, alice);
      await store.putProfile(copies[0].store, bob);
      for (const copy of copies) await store.load(copy.store);
      for (let step = 0; step < 40; step += 1) {
        const copy = copies[pick(random, copies.length)];
        const r = random();
        if (r < 0.3) {
          await store.noteChange(copy.store, activeOf(copy.profile), randomBody(random, copy.profile));
          clock.advance([0, 1800, 3601, 7200][pick(random, 4)]);
        } else if (r < 0.6) await store.save(copy.store, activeOf(copy.profile), randomBody(random, copy.profile));
        else if (r < 0.7) await store.putStoredFile(copy.store, activeOf(copy.profile), incomingFile('looks like Pivot.json', new TextEncoder().encode(tamperedText(await dataFileText(randomBody(random, alice), schema.freshStamp(alice.id))))));
        else if (r < 0.8) await store.putProfile(copy.store, newProfile(`user ${step}`));
        else await store.load(copy.store);
      }

      const opened = copies[0].store;
      assert.deepEqual([...(await store.checkFolder(opened))], [], 'nothing Pivot wrote fails, and a stored file that looks like a failing envelope is not checked');
      const pivotFiles = folder.list().filter((rel) => !rel.startsWith(`${schema.DATA_FOLDER.files}/`));
      assert.ok(pivotFiles.filter((rel) => rel.startsWith(`${schema.DATA_FOLDER.backups}/`)).length > 1, 'the seed wrote several backups');
      assert.ok(pivotFiles.some((rel) => rel.startsWith(`${schema.DATA_FOLDER.supersededSaves}/`)), 'the seed produced a superseded copy');
      assert.ok(folder.listUnder(schema.DATA_FOLDER.files).length > 0, 'the seed stored a file');
      for (const rel of pivotFiles) {
        const envelope = await schema.open(/** @type {string} */ (folder.read(rel)));
        assert.ok(envelope.ok, `${rel} opens`);
        assert.equal(envelope.envelope.kind, rel === schema.DATA_FOLDER.profiles ? 'profiles' : 'data', `${rel} is its kind`);
      }

      /** @param {string} rel */
      const affects = (rel) =>
        rel === schema.DATA_FOLDER.data ? { kind: 'stored-data' }
          : rel === schema.DATA_FOLDER.profiles ? { kind: 'profiles' }
            : rel.startsWith(`${schema.DATA_FOLDER.backups}/`) ? { kind: 'backup', takenAtAest: timeInBackupName(rel) }
              : { kind: 'superseded-save' };
      for (let i = 0; i < 10; i += 1) {
        const rel = i < 2 ? [schema.DATA_FOLDER.data, schema.DATA_FOLDER.profiles][i] : pivotFiles[pick(random, pivotFiles.length)];
        const original = /** @type {string} */ (folder.read(rel));
        folder.write(rel, tamperedText(original));
        const failures = [...(await store.checkFolder(opened))];
        assert.deepEqual(failures.map((f) => [f.file, f.reason, f.affects]), [[rel, 'integrity-failed', affects(rel)]], `${rel} altered outside Pivot`);
        folder.write(rel, original);
      }
    } finally {
      clock.release();
    }
  });
});

test('the backup ring against a held clock: over seeded changes, saves, loads, and clock moves, a backup is written exactly when the working state changed and the newest backup is more than an hour old, and only the 72 newest are kept (C-013, C-014)', async () => {
  await withBrowserStorage(async () => {
    const clock = holdClock();
    try {
      const random = prng(SEED + 13);
      const folder = new MemoryFolder();
      const alice = newProfile('Alice');
      /** @type {string[]} backup paths, oldest first */
      const model = [];
      for (let i = 70; i >= 1; i -= 1) model.push(await plantBackup(folder, clock.offset(-(i + 1) * 3601), bodyWithHazards(alice, [`planted ${i}`]), alice));
      const opened = await store.openDataFolder(folder.handle);
      let held = (await store.load(opened)).body;
      let written = 0;
      let withinHour = 0;
      let unchanged = 0;

      for (let step = 0; step < 150; step += 1) {
        clock.advance([0, 1, 600, 3599, 3600, 3601, 5400, 7200][pick(random, 8)]);
        const r = random();
        const at = `step ${step} at ${clock.now()}`;
        if (r < 0.7) {
          const body = random() < 0.2 ? structuredClone(held) : randomBody(random, alice);
          const changed = !isDeepStrictEqual(body, held);
          const newest = model[model.length - 1];
          const due = changed && (newest === undefined || Date.parse(clock.now()) - Date.parse(timeInBackupName(newest)) > schema.BACKUP_INTERVAL_MS);
          const outcome = await store.noteChange(opened, activeOf(alice), body);
          assert.equal(outcome.changed, changed, `${at}: changed`);
          assert.equal(outcome.backupFile, due ? backupPathAt(clock.now()) : null, `${at}: a backup exactly when due`);
          assert.equal(outcome.backupError, null, at);
          if (changed) held = body;
          if (!changed) unchanged += 1;
          else if (!due) withinHour += 1;
          if (due) {
            written += 1;
            const backup = await schema.open(/** @type {string} */ (folder.read(backupPathAt(clock.now()))));
            assert.ok(backup.ok && backup.envelope.kind === 'data', `${at}: the backup is a sealed data envelope`);
            assert.deepEqual(backup.envelope.body, body, `${at}: of the working state as changed`);
            assert.equal(/** @type {schema.SaveStamp} */ (backup.envelope.stamp).savedByProfileId, alice.id);
            model.push(backupPathAt(clock.now()));
            while (model.length > schema.BACKUP_RING_SIZE) model.shift();
          }
        } else if (r < 0.85) {
          held = randomBody(random, alice);
          await store.save(opened, activeOf(alice), held);
        } else {
          held = (await store.load(opened)).body;
        }
        const expected = [...model].reverse().map((file) => ({ file, takenAtAest: timeInBackupName(file) }));
        assert.deepEqual(backupsInFolder(folder), expected, `${at}: the folder holds the ring the model holds`);
        assert.deepEqual([...(await store.listBackups(opened))], expected, `${at}: listBackups, newest first`);
      }
      assert.ok(written > 3 && withinHour > 0 && unchanged > 0, `the seed wrote ${written} backups past a ring of 70, skipped ${withinHour} within the hour, and saw ${unchanged} unchanged bodies`);
    } finally {
      clock.release();
    }
  });
});

test('the browser\'s copy: over seeded changes, saves, failed saves, loads, and another copy\'s saves, the mirror holds what C-015 says, and a store writes it only once it mirrors (C-015)', async () => {
  await withBrowserStorage(async (env) => {
    const clock = holdClock();
    try {
      const random = prng(SEED + 15);
      const folder = new MemoryFolder();
      const alice = newProfile('Alice');
      const bob = newProfile('Bob');
      const a = await store.openDataFolder(folder.handle);
      const b = await store.openDataFolder(folder.handle);
      let held = (await store.load(a)).body;
      await store.load(b);
      let known = (await store.save(a, activeOf(alice), randomBody(random, alice))).stamp;
      assert.deepEqual(env.local.writes, [], 'a store that has not called noteChange does not write the browser\'s storage');

      /** @type {{ unsaved: boolean, body: DataBody, loadedStamp: schema.SaveStamp | null, mirroredAtAest: string | null } | null} */
      let expected = null;
      let noted = 0;
      let saved = 0;
      for (let step = 0; step < 60; step += 1) {
        clock.advance([0, 1, 61][pick(random, 3)]);
        const r = random();
        const at = `step ${step}`;
        const writesBefore = env.local.writes.length;
        if (r < 0.45) {
          const body = randomBody(random, alice);
          const outcome = await store.noteChange(a, activeOf(alice), body);
          assert.equal(outcome.mirrorError, null, at);
          if (outcome.changed) {
            expected = { unsaved: true, body, loadedStamp: known, mirroredAtAest: clock.now() };
            held = body;
            noted += 1;
          }
        } else if (r < 0.7) {
          const body = randomBody(random, alice);
          const outcome = await store.save(a, activeOf(alice), body);
          known = outcome.stamp;
          held = body;
          if (expected !== null) {
            assert.equal(outcome.mirrorError, null, at);
            expected = { unsaved: false, body, loadedStamp: outcome.stamp, mirroredAtAest: null };
            saved += 1;
          }
        } else if (r < 0.8) {
          folder.failWrite((rel) => rel === schema.DATA_FOLDER.data);
          try {
            await assert.rejects(() => store.save(a, activeOf(alice), randomBody(random, alice)));
          } finally {
            folder.failWrite(() => false);
          }
          assert.equal(env.local.writes.length, writesBefore, `${at}: a save that rejects leaves the mirror as it was`);
        } else if (r < 0.9) {
          await store.save(b, activeOf(bob), randomBody(random, bob));
          assert.equal(env.local.writes.length, writesBefore, `${at}: another copy that never noted a change writes nothing to the browser's storage`);
        } else {
          const loaded = await store.load(a);
          known = /** @type {schema.SaveStamp} */ (loaded.lastSave);
          held = loaded.body;
          assert.equal(env.local.writes.length, writesBefore, `${at}: load writes nothing`);
        }
        if (expected === null) continue;
        const mirror = env.local.mirror();
        assert.ok(mirror, at);
        assert.equal(mirror.unsaved, expected.unsaved, `${at}: unsaved`);
        assert.deepEqual(mirror.body, expected.body, `${at}: body`);
        assert.deepEqual(mirror.loadedStamp, expected.loadedStamp, `${at}: loadedStamp`);
        if (expected.mirroredAtAest !== null) assert.equal(mirror.mirroredAtAest, expected.mirroredAtAest, `${at}: mirroredAtAest is the clock's now`);
      }
      assert.ok(env.local.writes.every((w) => w === `setItem(${schema.BROWSER_STORAGE_KEY})`), 'only the one key is written');
      assert.deepEqual(env.session.writes, []);
      assert.ok(noted > 0 && saved > 0, `the seed noted ${noted} changes and saved ${saved} times while mirroring`);
      void held;
    } finally {
      clock.release();
    }
  });
});

test('recovery across a crash keeps another user\'s save made since the recovered state was changed: the next save compares data.json with the state\'s loadedStamp, not the stamp just loaded (C-016, HZ-008)', async () => {
  await withBrowserStorage(async (env) => {
    const folder = new MemoryFolder();
    const alice = newProfile('Alice');
    const bob = newProfile('Bob');
    const before = await store.openDataFolder(folder.handle);
    await store.load(before);
    const aliceSave = await store.save(before, activeOf(alice), bodyWithHazards(alice, ['saved by Alice']));
    const unsaved = bodyWithHazards(alice, ['saved by Alice', 'changed, then Pivot closed']);
    await store.noteChange(before, activeOf(alice), unsaved);

    const b = await store.openDataFolder(folder.handle); // Bob saves while Alice's Pivot is closed
    await store.load(b);
    const bobSave = await store.save(b, activeOf(bob), bodyWithHazards(bob, ['saved by Bob']));
    const bobText = folder.read(schema.DATA_FOLDER.data);

    const after = await store.openDataFolder(folder.handle); // Alice opens Pivot again
    assert.deepEqual((await store.load(after)).lastSave, bobSave.stamp);
    const state = /** @type {import('../contract.js').RecoverableState} */ (await store.readRecoverable(after));
    assert.deepEqual(state.loadedStamp, aliceSave.stamp);
    const recovered = await store.recoverWorkingState(after, state);
    assert.equal(folder.read(schema.DATA_FOLDER.data), bobText, 'recovering writes nothing to the folder');

    const outcome = await store.save(after, activeOf(alice), recovered);
    assert.deepEqual(outcome.superseded, bobSave.stamp, 'Bob\'s save is found, because the state was changed from Alice\'s');
    assert.equal(outcome.keptAs, keptPathFor(bobSave.stamp));
    assert.equal(folder.read(keptPathFor(bobSave.stamp)), bobText, 'and kept exactly as found');
    const mirror = env.local.mirror();
    assert.equal(mirror?.unsaved, false, 'the store mirrors after recovering: the save marks the browser\'s copy saved');
    assert.deepEqual(mirror?.loadedStamp, outcome.stamp);
  });
});

test('recovery when no one saved since is not a supersession; the recovered body is the working state the store holds; a state from a folder never saved to keeps what this folder holds (C-016)', async () => {
  await withBrowserStorage(async (env) => {
    const alice = newProfile('Alice');
    {
      const folder = new MemoryFolder();
      const first = await store.openDataFolder(folder.handle);
      await store.load(first);
      await store.save(first, activeOf(alice), bodyWithHazards(alice, ['saved']));
      await store.noteChange(first, activeOf(alice), bodyWithHazards(alice, ['saved', 'unsaved']));

      const again = await store.openDataFolder(folder.handle);
      await store.load(again);
      const state = /** @type {import('../contract.js').RecoverableState} */ (await store.readRecoverable(again));
      const recovered = await store.recoverWorkingState(again, state);
      const writes = env.local.writes.length;
      const snapshot = folder.snapshot();
      const noted = await store.noteChange(again, activeOf(alice), structuredClone(recovered));
      assert.equal(noted.changed, false, 'the recovered body is the working state it last held');
      assert.equal(env.local.writes.length, writes, 'and noting it again writes nothing to the browser\'s storage');
      assert.deepEqual(folder.snapshot(), snapshot, 'or to the folder');
      const outcome = await store.save(again, activeOf(alice), recovered);
      assert.equal(outcome.superseded, null, 'no one saved since the state was changed');
      assert.equal(outcome.keptAs, null);
    }
    {
      const elsewhere = new MemoryFolder('Another Folder');
      const other = await store.openDataFolder(elsewhere.handle);
      await store.load(other);
      await store.noteChange(other, activeOf(alice), bodyWithHazards(alice, ['from a folder never saved to']));

      const folder = new MemoryFolder();
      const setup = await store.openDataFolder(folder.handle);
      await store.load(setup);
      const existing = await store.save(setup, activeOf(alice), bodyWithHazards(alice, ['what this folder holds']));
      const existingText = folder.read(schema.DATA_FOLDER.data);

      const opened = await store.openDataFolder(folder.handle);
      await store.load(opened);
      const state = /** @type {import('../contract.js').RecoverableState} */ (await store.readRecoverable(opened));
      assert.equal(state.loadedStamp, null);
      const outcome = await store.save(opened, activeOf(alice), await store.recoverWorkingState(opened, state));
      assert.deepEqual(outcome.superseded, existing.stamp, 'one key per machine: the folder\'s own save is kept, not overwritten (ASM-006)');
      assert.equal(folder.read(keptPathFor(existing.stamp)), existingText);
    }
  });
});

test('restore is save: over seeded backups and save states, prepareRestore writes nothing and names the stamp it replaces, and restore writes the plan\'s body with a fresh stamp and every promise of save (C-017)', async () => {
  await withBrowserStorage(async (env) => {
    const clock = holdClock();
    try {
      const random = prng(SEED + 17);
      const folder = new MemoryFolder();
      const alice = newProfile('Alice');
      const bob = newProfile('Bob');
      const a = await store.openDataFolder(folder.handle);
      const b = await store.openDataFolder(folder.handle);
      await store.load(a);
      await store.load(b);
      /** @type {schema.SaveStamp | null} */
      let known = null;
      /** @type {schema.SaveStamp | null} */
      let onDisk = null;
      let supersessions = 0;
      for (let round = 0; round < 20; round += 1) {
        clock.advance(3601);
        const at = `round ${round}`;
        if (random() < 0.4) onDisk = (await store.save(b, activeOf(bob), randomBody(random, bob))).stamp;

        const body = randomBody(random, bob);
        const stampInFile = schema.freshStamp(bob.id);
        /** @type {import('../contract.js').RestoreSource} */
        let source;
        if (random() < 0.5) {
          const file = backupPathAt(clock.offset(-1));
          folder.write(file, await dataFileText(body, stampInFile));
          source = { kind: 'backup', file };
        } else {
          source = { kind: 'save-state', saveState: { name: `state ${round}.json`, text: await dataFileText(body, stampInFile) } };
        }

        const snapshot = folder.snapshot();
        const writes = env.local.writes.length;
        const plan = await store.prepareRestore(a, source);
        assert.deepEqual(folder.snapshot(), snapshot, `${at}: prepareRestore writes nothing to the folder`);
        assert.equal(env.local.writes.length, writes, `${at}: or to the browser's storage`);
        assert.deepEqual(plan, { source, body, stampInFile, replaces: known }, `${at}: the plan`);

        const diskText = folder.read(schema.DATA_FOLDER.data);
        const expectSupersession = !schema.sameStamp(onDisk, known);
        const outcome = await store.restore(a, activeOf(alice), plan);
        if (expectSupersession) {
          supersessions += 1;
          assert.deepEqual(outcome.superseded, onDisk, `${at}: another copy's save is kept first (C-004)`);
          assert.equal(folder.read(keptPathFor(/** @type {schema.SaveStamp} */ (onDisk))), diskText, at);
        } else {
          assert.equal(outcome.superseded, null, at);
        }
        assert.equal(outcome.stamp.savedByProfileId, alice.id, `${at}: a fresh stamp for the restoring profile (C-006)`);
        assert.equal(outcome.stamp.savedAtAest, clock.now(), at);
        assert.notEqual(outcome.stamp.token, stampInFile.token, `${at}: the file's own stamp is not written back`);
        const loaded = await store.load(await store.openDataFolder(folder.handle));
        assert.deepEqual(loaded.body, body, `${at}: load returns the plan's body`);
        assert.deepEqual(loaded.lastSave, outcome.stamp, at);
        known = outcome.stamp;
        onDisk = outcome.stamp;
        assert.equal((await store.noteChange(a, activeOf(alice), structuredClone(body))).changed, false, `${at}: the restored body is the working state the store holds`);
      }
      assert.ok(supersessions > 0, 'the seed restored over another copy\'s save');
    } finally {
      clock.release();
    }
  });
});

test('stored files: over seeded files with awkward and repeated names and any bytes, from two copies that never loaded, each call resolves with a location under files/ no call returned before, holding the bytes whole, and no earlier file is disturbed (C-018)', async () => {
  await withBrowserStorage(async (env) => {
    const random = prng(SEED + 18);
    const folder = new MemoryFolder();
    const alice = newProfile('Alice');
    const copies = [await store.openDataFolder(folder.handle), await store.openDataFolder(folder.handle)];
    /** @type {Map<string, Uint8Array>} */
    const kept = new Map();
    for (let step = 0; step < 60; step += 1) {
      const name = AWKWARD_FILE_NAMES[pick(random, AWKWARD_FILE_NAMES.length)];
      const bytes = randomBytes(random);
      const given = new Uint8Array(bytes);
      const location = await store.putStoredFile(copies[pick(random, 2)], activeOf(alice), incomingFile(name, given));
      const at = `step ${step}: ${JSON.stringify(name)}`;
      assert.equal(typeof location, 'string', at);
      assert.ok(location.startsWith(`${schema.DATA_FOLDER.files}/`), `${at}: ${location} is under files/`);
      assert.ok(!kept.has(location), `${at}: ${location} was never returned before`);
      assert.deepEqual(given, bytes, `${at}: the bytes handed in are not altered`);
      kept.set(location, bytes);
      for (const [rel, expected] of kept) assert.deepEqual(folder.readBytes(rel), expected, `${at}: ${rel} holds its bytes whole`);
      assert.deepEqual(folder.list(), folder.listUnder(schema.DATA_FOLDER.files), `${at}: nothing outside files/ is written`);
      assert.equal(folder.list().length, kept.size, `${at}: one file per call`);
    }
    assert.deepEqual(env.local.writes, [], 'the browser\'s storage is not written');
    const presence = await store.checkStoredFiles(copies[0], [...kept.keys()]);
    assert.ok(presence.every((p) => p.present), 'every location is reported present');
  });
});

test('presence: over seeded lists of stored, removed, put back, unreadable, and invalid locations with repeats, checkStoredFiles answers one entry per location in order from the folder as it is at the call, and writes nothing (C-019)', async () => {
  const random = prng(SEED + 19);
  const folder = new MemoryFolder();
  const alice = newProfile('Alice');
  const opened = await store.openDataFolder(folder.handle);
  /** @type {Map<string, Uint8Array>} */
  const stored = new Map();
  for (let i = 0; i < 12; i += 1) {
    const bytes = randomBytes(random);
    stored.set(await store.putStoredFile(opened, activeOf(alice), incomingFile(AWKWARD_FILE_NAMES[i], bytes)), bytes);
  }
  const locations = [...stored.keys()];
  const invalid = ['', schema.DATA_FOLDER.data, schema.DATA_FOLDER.profiles, schema.DATA_FOLDER.files, `${schema.DATA_FOLDER.files}/`, `/${locations[0]}`, `../${locations[0]}`, `${schema.DATA_FOLDER.files}/../${schema.DATA_FOLDER.data}`, backupPathAt(nowAest())];
  /** @type {Set<string>} */
  const removed = new Set();
  /** @type {Set<string>} */
  const denied = new Set();
  let answers = { present: 0, missing: 0, inaccessible: 0, invalid: 0 };

  for (let round = 0; round < 30; round += 1) {
    const target = locations[pick(random, locations.length)];
    const action = pick(random, 3);
    if (action === 0 && !removed.has(target)) {
      folder.remove(target);
      removed.add(target);
    } else if (action === 1 && removed.has(target)) {
      folder.writeBytes(target, /** @type {Uint8Array} */ (stored.get(target))); // put back by hand
      removed.delete(target);
    } else if (action === 2) {
      if (denied.has(target)) denied.delete(target);
      else denied.add(target);
    }
    folder.denyRead((rel) => denied.has(rel));

    const pool = [...locations, ...invalid];
    const asked = Array.from({ length: pick(random, 16) }, () => pool[pick(random, pool.length)]);
    const expected = asked.map((location) => {
      if (invalid.includes(location)) return (answers.invalid += 1), { location, present: false, reason: 'not-a-stored-file-location' };
      if (removed.has(location)) return (answers.missing += 1), { location, present: false, reason: 'missing' };
      if (denied.has(location)) return (answers.inaccessible += 1), { location, present: false, reason: 'inaccessible' };
      return (answers.present += 1), { location, present: true, reason: null };
    });
    const snapshot = folder.snapshot();
    assert.deepEqual([...(await store.checkStoredFiles(opened, asked))], expected, `round ${round}`);
    assert.deepEqual(folder.snapshot(), snapshot, `round ${round}: writes nothing`);
  }
  assert.ok(Object.values(answers).every((n) => n > 0), `the seed produced every answer: ${JSON.stringify(answers)}`);
});

test('export: over seeded texts written again and again to two targets, each file holds the UTF-8 of the last text written to it, through one stream per call, and nothing reaches the data folder or the browser\'s storage (C-020, C-009)', async () => {
  await withBrowserStorage(async (env) => {
    const random = prng(SEED + 20);
    const folder = new MemoryFolder();
    const alice = newProfile('Alice');
    const opened = await store.openDataFolder(folder.handle);
    await store.load(opened);
    await store.save(opened, activeOf(alice), bodyWithHazards(alice, ['stored']));
    await store.noteChange(opened, activeOf(alice), bodyWithHazards(alice, ['stored', 'mirrored']));
    const snapshot = folder.snapshot();
    const writes = env.local.writes.length;

    const alphabet = ['a', 'Z', '<', '>', '&', '"', "'", '\n', '\r\n', '\t', ' ', 'é', 'Ü', '火', '🔥', ' ', ' ', '<svg>', '{"pivot":"pivot"}'];
    const targets = [new MemoryExportFile('one.svg', 'held before'), new MemoryExportFile('two.svg')];
    const last = ['held before', ''];
    const calls = [0, 0];
    for (let i = 0; i < 40; i += 1) {
      const which = pick(random, 2);
      const text = Array.from({ length: pick(random, 40) }, () => alphabet[pick(random, alphabet.length)]).join('');
      await store.writeExportFile(targets[which], text);
      last[which] = text;
      calls[which] += 1;
      for (const k of [0, 1]) {
        assert.deepEqual(targets[k].contents(), new TextEncoder().encode(last[k]), `call ${i}: ${targets[k].name} holds the last text written to it`);
        assert.equal(targets[k].opened, calls[k], `call ${i}: one stream per call`);
        assert.equal(targets[k].committed, calls[k]);
      }
    }
    assert.deepEqual(folder.snapshot(), snapshot, 'nothing under the data folder');
    assert.equal(env.local.writes.length, writes, 'nothing in the browser\'s storage');
    assert.deepEqual(env.session.writes, []);
  });
});

test('confinement over every operation: the folder holds only data.json, profiles.json, Superseded Saves copies, backups, and stored files; each is written only by the operation C-009 names; files/ only grows; one key only; the reads write nothing anywhere (C-009)', async () => {
  await withBrowserStorage(async (env) => {
    const clock = holdClock();
    try {
      const random = prng(SEED + 9);
      const folder = new MemoryFolder();
      const alice = newProfile('Alice');
      const bob = newProfile('Bob');
      const copies = [
        { profile: alice, store: await store.openDataFolder(folder.handle), mirrors: false },
        { profile: bob, store: await store.openDataFolder(folder.handle), mirrors: false },
      ];
      await store.putProfile(copies[0].store, alice);
      for (const copy of copies) await store.load(copy.store);
      const target = new MemoryExportFile('export.svg');
      /** @type {Map<string, Uint8Array>} */
      const storedFiles = new Map();
      const ops = ['save', 'noteChange', 'putProfile', 'putStoredFile', 'restore', 'recover', 'discard', 'export',
        'load', 'readProfiles', 'checkFolder', 'checkStoredFiles', 'unsavedChanges', 'readRecoverable', 'listBackups', 'prepareRestore', 'openDataFolder'];
      const reads = new Set(ops.slice(8));
      /** @type {Record<string, number>} */
      const counts = {};
      const allowed = new RegExp(`^(${schema.DATA_FOLDER.data}|${schema.DATA_FOLDER.profiles}|${schema.DATA_FOLDER.supersededSaves}/data-\\d{8}-\\d{6}-[0-9a-f]{8}\\.json|${schema.DATA_FOLDER.backups}/data-\\d{8}-\\d{6}\\.json|${schema.DATA_FOLDER.files}/.+)$`);
      const saveState = async () => ({ kind: /** @type {const} */ ('save-state'), saveState: { name: 'state.json', text: await dataFileText(randomBody(random, bob), schema.freshStamp(bob.id)) } });

      for (let step = 0; step < 160; step += 1) {
        clock.advance([0, 1800, 3601][pick(random, 3)]);
        const copy = copies[pick(random, copies.length)];
        const me = activeOf(copy.profile);
        const op = ops[pick(random, ops.length)];
        const at = `step ${step}: ${op}`;
        counts[op] = (counts[op] ?? 0) + 1;
        const before = folder.snapshot();
        const writesBefore = env.local.writes.length;
        const mirroredBefore = copy.mirrors;

        switch (op) {
          case 'save': await store.save(copy.store, me, randomBody(random, copy.profile)); break;
          case 'noteChange': await store.noteChange(copy.store, me, randomBody(random, copy.profile)); copy.mirrors = true; break;
          case 'putProfile': await store.putProfile(copy.store, newProfile(`user ${step}`)); break;
          case 'putStoredFile': {
            const bytes = randomBytes(random);
            storedFiles.set(await store.putStoredFile(copy.store, me, incomingFile(AWKWARD_FILE_NAMES[pick(random, AWKWARD_FILE_NAMES.length)], bytes)), bytes);
            break;
          }
          case 'restore': await store.restore(copy.store, me, await store.prepareRestore(copy.store, await saveState())); break;
          case 'recover': {
            const state = await store.readRecoverable(copy.store);
            if (state) {
              await store.recoverWorkingState(copy.store, state);
              copy.mirrors = true;
            }
            break;
          }
          case 'discard': await store.discardWorkingState(copy.store); break;
          case 'export': await store.writeExportFile(target, `<svg>${step}</svg>`); break;
          case 'load': await store.load(copy.store); break;
          case 'readProfiles': await store.readProfiles(copy.store); break;
          case 'checkFolder': await store.checkFolder(copy.store); break;
          case 'checkStoredFiles': await store.checkStoredFiles(copy.store, [...storedFiles.keys()]); break;
          case 'unsavedChanges': await store.unsavedChanges(copy.store, randomBody(random, copy.profile)); break;
          case 'readRecoverable': await store.readRecoverable(copy.store); break;
          case 'listBackups': await store.listBackups(copy.store); break;
          case 'prepareRestore': await store.prepareRestore(copy.store, await saveState()); break;
          case 'openDataFolder': await store.openDataFolder(folder.handle); break;
        }

        const after = folder.snapshot();
        const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((rel) => before[rel] !== after[rel]);
        const newWrites = env.local.writes.slice(writesBefore);
        for (const rel of Object.keys(after)) assert.match(rel, allowed, `${at}: ${rel} is not a file the module may create`);
        for (const rel of changed) {
          const created = !(rel in before);
          if (rel === schema.DATA_FOLDER.data) assert.ok(op === 'save' || op === 'restore', `${at}: only save and restore write data.json`);
          else if (rel === schema.DATA_FOLDER.profiles) assert.equal(op, 'putProfile', `${at}: only putProfile writes profiles.json`);
          else if (rel.startsWith(`${schema.DATA_FOLDER.supersededSaves}/`)) assert.ok((op === 'save' || op === 'restore') && created, `${at}: ${rel} is created by save or restore, never rewritten or removed`);
          else if (rel.startsWith(`${schema.DATA_FOLDER.backups}/`)) assert.equal(op, 'noteChange', `${at}: only noteChange writes backups/ (${rel})`);
          else assert.ok(op === 'putStoredFile' && created, `${at}: only putStoredFile writes files/, and only creates (${rel})`);
        }
        if (reads.has(op) || op === 'export') {
          assert.deepEqual(changed, [], `${at}: writes nothing under the data folder`);
          assert.deepEqual(newWrites, [], `${at}: writes nothing to the browser's storage`);
        }
        if (op === 'putStoredFile' || op === 'putProfile') assert.deepEqual(newWrites, [], `${at}: does not write the browser's storage`);
        if ((op === 'save' || op === 'restore') && !mirroredBefore) assert.deepEqual(newWrites, [], `${at}: a store that has never noted a change or recovered does not write the browser's storage`);
        assert.ok(newWrites.every((w) => w.endsWith(`(${schema.BROWSER_STORAGE_KEY})`)), `${at}: only the one key: ${newWrites}`);
        assert.deepEqual(env.session.writes, [], `${at}: sessionStorage untouched`);
        for (const [rel, bytes] of storedFiles) assert.deepEqual(folder.readBytes(rel), bytes, `${at}: files/ only grows; ${rel} is untouched`);
      }
      for (const op of ops) assert.ok((counts[op] ?? 0) > 0, `the seed ran ${op}`);
    } finally {
      clock.release();
    }
  });
});
