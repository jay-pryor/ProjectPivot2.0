/**
 * profiles conformance: boundaries (CORE-CON-002). Empty, degenerate, and edge cases of
 * modules/profiles/CONTRACT.md: what trimming removes and keeps, names that only nearly
 * clash, a folder with no profiles, a profiles file with none, a profile renamed or
 * removed by another copy between calls, and the selection as a value that later calls do
 * not touch. Written from the contract before any implementation (P8).
 *
 * The null double must fail this file (CORE-TST-002, rung 1).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as profiles from '../contract.js';
import { DuplicateProfileNameError, UnknownProfileError } from '../contract.js';
import * as store from '../../store/contract.js';
import { MemoryFolder, newProfile, openSession, openStore, plantProfilesFile, profilesFileFor } from './harness.js';

test('a name is trimmed of leading and trailing whitespace and nothing else: internal spacing, case, and script are kept (C-001, section 3)', async () => {
  const folder = new MemoryFolder();
  const session = await openSession(folder);
  const cases = [
    [' \t Ada  Lovelace \n', 'Ada  Lovelace'],
    ['Übertemperatur 火災', 'Übertemperatur 火災'],
    ['A', 'A'],
    ['a "quoted" \\ back\\slash', 'a "quoted" \\ back\\slash'],
    [`${'long '.repeat(40)}name`, `${'long '.repeat(40)}name`],
  ];
  for (const [typed, expected] of cases) {
    const p = await profiles.createProfile(session, typed);
    assert.equal(p.name, expected, `createProfile(${JSON.stringify(typed)})`);
    const listed = (await profiles.listProfiles(session)).find((q) => q.id === p.id);
    assert.deepEqual(listed, p, 'stored as returned');
  }
});

test('names that differ only inside are distinct: internal spacing or one extra character avoids the duplicate rule (C-002)', async () => {
  const folder = new MemoryFolder();
  const session = await openSession(folder);
  const ab = await profiles.createProfile(session, 'A B');
  const aab = await profiles.createProfile(session, 'A  B');
  const alice = await profiles.createProfile(session, 'Alice');
  const alice2 = await profiles.createProfile(session, 'Alice2');
  assert.equal(new Set([ab, aab, alice, alice2].map((p) => p.id)).size, 4);
  assert.deepEqual((await profiles.listProfiles(session)).map((p) => p.name), ['A  B', 'A B', 'Alice', 'Alice2']);
  await assert.rejects(() => profiles.createProfile(session, 'a  b'), (e) => e instanceof DuplicateProfileNameError, 'the inner spacing is part of the name');
});

test('selectProfile on a folder with no profiles rejects with UnknownProfileError and writes nothing (C-004, C-005)', async () => {
  const folder = new MemoryFolder();
  const session = await openSession(folder);
  const ghost = await profiles.createProfile(await openSession(new MemoryFolder()), 'Ghost');
  await assert.rejects(() => profiles.selectProfile(session, ghost.id), (e) => e instanceof UnknownProfileError);
  assert.equal(session.active, null);
  assert.deepEqual(folder.list(), []);
});

test('a profiles file another copy wrote with no profiles in it lists as empty, and the first create adds to it (C-001, C-005)', async () => {
  const folder = new MemoryFolder();
  await plantProfilesFile(folder, await profilesFileFor([]));
  const session = await openSession(folder);
  assert.deepEqual([...(await profiles.listProfiles(session))], []);
  const alice = await profiles.createProfile(session, 'Alice');
  assert.deepEqual([...(await profiles.listProfiles(await openSession(folder)))], [alice]);
});

test('selectProfile takes the stored name at the time of the call: a profile another copy renamed is selected under its new name, and a selection made before keeps its value (C-004)', async () => {
  const folder = new MemoryFolder();
  const session = await openSession(folder);
  const alice = await profiles.createProfile(session, 'Alice');
  const earlier = await profiles.selectProfile(session, alice.id);

  const renamed = { ...alice, name: 'Alice Renamed' };
  await store.putProfile(await openStore(folder), renamed); // store C-008: replaced by id, in another copy
  assert.deepEqual([...(await profiles.listProfiles(session))], [renamed], 'the list is the folder now');
  assert.deepEqual(session.active, earlier, 'the selection is a value: nothing but selectProfile changes it');

  const later = await profiles.selectProfile(session, alice.id);
  assert.deepEqual(later, { id: alice.id, name: 'Alice Renamed' });
  assert.deepEqual(session.active, later);
  await assert.rejects(() => profiles.createProfile(session, 'alice renamed'), (e) => e instanceof DuplicateProfileNameError, 'the new name is the one that clashes');
  const again = await profiles.createProfile(session, 'Alice');
  assert.notEqual(again.id, alice.id, 'the old name is free, under a fresh id');
});

test('selectProfile checks the folder at the time of the call: a profile no longer stored cannot be selected, one stored since can (C-004)', async () => {
  const folder = new MemoryFolder();
  const session = await openSession(folder);
  const alice = await profiles.createProfile(session, 'Alice');
  const active = await profiles.selectProfile(session, alice.id);

  await plantProfilesFile(folder, await profilesFileFor([])); // something other than Pivot emptied the file
  await assert.rejects(() => profiles.selectProfile(session, alice.id), (e) => e instanceof UnknownProfileError);
  assert.deepEqual(session.active, active, 'the earlier selection is unchanged');
  assert.deepEqual([...(await profiles.listProfiles(session))], []);

  const bob = newProfile('Bob');
  await store.putProfile(await openStore(folder), bob);
  assert.deepEqual(await profiles.selectProfile(session, bob.id), { id: bob.id, name: 'Bob' });
});

test('the duplicate rule sees a profile another copy created since this session last listed (C-002, C-005)', async () => {
  const folder = new MemoryFolder();
  const mine = await openSession(folder);
  assert.deepEqual([...(await profiles.listProfiles(mine))], []);
  const bob = await profiles.createProfile(await openSession(folder), 'Bob');
  await assert.rejects(
    () => profiles.createProfile(mine, 'bob'),
    (e) => e instanceof DuplicateProfileNameError && e.existing.id === bob.id,
    'a name another copy took since is refused, carrying their profile',
  );
  assert.deepEqual([...(await profiles.listProfiles(mine))], [bob], 'nothing was added');
});
