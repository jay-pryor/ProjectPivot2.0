/**
 * profiles conformance: operations (CORE-CON-002). Every signature on its happy path, each
 * test naming the clause of modules/profiles/CONTRACT.md it encodes. Written from the
 * contract and SL-01 criterion 2, before any implementation (P8).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as profiles from '../contract.js';
import * as store from '../../store/contract.js';
import { fixClock, releaseClock } from '../../../baseline/clock.js';
import { timestampAest, userProfileId } from '../../../baseline/types.js';
import { MemoryFolder, inContractOrder, newProfile, openSession, openStore, profilesFileName } from './harness.js';

test('openProfiles resolves with a session whose active is null and writes nothing (C-003, C-006)', async () => {
  const folder = new MemoryFolder();
  const session = await profiles.openProfiles(await openStore(folder));
  assert.equal(session.active, null);
  assert.deepEqual(folder.list(), [], 'opening writes nothing');
});

test('listProfiles on a folder with no profiles resolves with an empty list and writes nothing (C-005, C-006)', async () => {
  const folder = new MemoryFolder();
  const session = await openSession(folder);
  assert.deepEqual([...(await profiles.listProfiles(session))], []);
  assert.deepEqual(folder.list(), []);
  assert.equal(session.active, null);
});

test('createProfile stores the trimmed name with a fresh id and the clock now, lists it here and in another copy, and selects nothing (C-001)', async () => {
  const folder = new MemoryFolder();
  const opened = await openStore(folder);
  const session = await profiles.openProfiles(opened);
  const held = timestampAest('2026-09-15T09:30:00+10:00');

  fixClock(held);
  /** @type {import('../../../baseline/types.js').UserProfile} */
  let alice;
  try {
    alice = await profiles.createProfile(session, '  Alice Smith  ');
  } finally {
    releaseClock();
  }

  assert.deepEqual(alice, { id: alice.id, name: 'Alice Smith', createdAtAest: held }, 'name trimmed, stamped with the held clock, nothing else');
  assert.doesNotThrow(() => userProfileId.parse(alice.id), 'the id is a UserProfileId');
  assert.equal(session.active, null, 'creating is not selecting');

  assert.deepEqual([...(await profiles.listProfiles(session))], [alice], 'listed in this session');
  assert.deepEqual([...(await profiles.listProfiles(await openSession(folder)))], [alice], 'listed in a session on another DataStore over the same folder');
  assert.deepEqual([...(await store.readProfiles(await openStore(folder)))], [alice], 'stored in the folder as store reads it (REQ-053)');
  assert.deepEqual(folder.list(), [await profilesFileName()], 'the only file is the one store writes for profiles');
});

test('a second createProfile keeps the first, gives a different id, and both are listed (C-001)', async () => {
  const folder = new MemoryFolder();
  const session = await openSession(folder);
  const alice = await profiles.createProfile(session, 'Alice');
  const bob = await profiles.createProfile(session, 'Bob');
  assert.notEqual(bob.id, alice.id, 'the id differs from every id stored before the call');
  assert.deepEqual([...(await profiles.listProfiles(session))], [alice, bob]);
  assert.deepEqual([...(await profiles.listProfiles(await openSession(folder)))], [alice, bob], 'another copy sees both');
});

test('selectProfile resolves with the stored id and name and sets session.active to that value; nothing is written (C-004, C-006)', async () => {
  const folder = new MemoryFolder();
  const session = await openSession(folder);
  const alice = await profiles.createProfile(session, 'Alice');
  const bob = await profiles.createProfile(session, 'Bob');
  const before = folder.snapshot();

  const active = await profiles.selectProfile(session, bob.id);
  assert.deepEqual(active, { id: bob.id, name: 'Bob' });
  assert.deepEqual(session.active, active, 'afterwards session.active is that value');
  assert.deepEqual(folder.snapshot(), before, 'selecting writes nothing');
  assert.deepEqual([...(await profiles.listProfiles(session))], [alice, bob], 'the list says nothing about which is active (C-005)');
});

test('createProfile after a selection leaves active as it was (C-001)', async () => {
  const folder = new MemoryFolder();
  const session = await openSession(folder);
  const alice = await profiles.createProfile(session, 'Alice');
  const active = await profiles.selectProfile(session, alice.id);
  const carol = await profiles.createProfile(session, 'Carol');
  assert.deepEqual(session.active, active, 'still Alice');
  assert.deepEqual([...(await profiles.listProfiles(session))], [alice, carol]);
});

test('listProfiles is ordered by name compared without regard to case (C-005)', async () => {
  const folder = new MemoryFolder();
  const session = await openSession(folder);
  const created = [];
  for (const name of ['dave', 'Alice', 'carol', 'Bob', 'Émile', 'zed']) created.push(await profiles.createProfile(session, name));
  const listed = [...(await profiles.listProfiles(session))];
  assert.deepEqual(listed.map((p) => p.name), ['Alice', 'Bob', 'carol', 'dave', 'zed', 'Émile'], 'case ignored, then by code point');
  assert.deepEqual(listed, inContractOrder(created));
});

test('listProfiles reads the folder on every call: a profile another copy created since the last call appears (C-005)', async () => {
  const folder = new MemoryFolder();
  const mine = await openSession(folder);
  assert.deepEqual([...(await profiles.listProfiles(mine))], []);

  const theirs = await openSession(folder);
  const bob = await profiles.createProfile(theirs, 'Bob');
  assert.deepEqual([...(await profiles.listProfiles(mine))], [bob], 'created through profiles in another copy');

  const alice = newProfile('Alice');
  await store.putProfile(await openStore(folder), alice);
  assert.deepEqual([...(await profiles.listProfiles(mine))], [alice, bob], 'created through store in another copy');
});
