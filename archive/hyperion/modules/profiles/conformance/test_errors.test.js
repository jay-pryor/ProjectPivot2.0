/**
 * profiles conformance: errors (CORE-CON-002). Every condition in section 4 of
 * modules/profiles/CONTRACT.md, signalled as the named rejected promise, with the folder
 * and `active` as the clause promises afterwards. Written from the contract before any
 * implementation (P8).
 *
 * The null double must fail this file (CORE-TST-002, rung 1): an implementation that
 * enforces nothing resolves where every test below expects a rejection.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as profiles from '../contract.js';
import { DuplicateProfileNameError, InvalidProfileNameError, UnknownProfileError } from '../contract.js';
import * as store from '../../store/contract.js';
import { StoreReadError, StoreWriteError } from '../../store/contract.js';
import { userProfileId } from '../../../baseline/types.js';
import { MemoryFolder, newProfile, openSession, openStore, plantProfilesFile, profilesFileFor } from './harness.js';

/**
 * The error a call rejects with; fails the test if it resolves.
 * @param {() => Promise<unknown>} call
 * @returns {Promise<unknown>}
 */
async function rejectionOf(call) {
  try {
    await call();
  } catch (e) {
    return e;
  }
  assert.fail('expected a rejection');
}

test('createProfile with a name that is empty once trimmed rejects with InvalidProfileNameError; folder and active unchanged (C-002)', async () => {
  const folder = new MemoryFolder();
  const session = await openSession(folder);
  const alice = await profiles.createProfile(session, 'Alice');
  const active = await profiles.selectProfile(session, alice.id);
  const before = folder.snapshot();

  for (const blank of ['', ' ', '   ', '\t', '\n', ' \t\n ']) {
    await assert.rejects(
      () => profiles.createProfile(session, blank),
      (e) => e instanceof InvalidProfileNameError,
      `createProfile(${JSON.stringify(blank)}) rejects with InvalidProfileNameError`,
    );
  }
  assert.deepEqual(folder.snapshot(), before, 'nothing under the folder was created, written, or removed');
  assert.deepEqual(session.active, active, 'the selection is what it was');
  assert.deepEqual([...(await profiles.listProfiles(session))], [alice]);
});

test('createProfile with a name a stored profile has, compared trimmed and without regard to case, rejects with DuplicateProfileNameError carrying that profile; folder and active unchanged (C-002)', async () => {
  const folder = new MemoryFolder();
  const session = await openSession(folder);
  const alice = await profiles.createProfile(session, 'Alice Smith');
  const bob = newProfile('Bob');
  await store.putProfile(await openStore(folder), bob); // created by another copy of Pivot
  const active = await profiles.selectProfile(session, alice.id);
  const before = folder.snapshot();

  /** @type {[string, import('../../../baseline/types.js').UserProfile][]} */
  const clashes = [
    ['Alice Smith', alice],
    ['alice smith', alice],
    ['ALICE SMITH', alice],
    ['  Alice Smith  ', alice],
    ['\talice SMITH\n', alice],
    ['Bob', bob],
    [' bob ', bob],
  ];
  for (const [name, existing] of clashes) {
    const error = await rejectionOf(() => profiles.createProfile(session, name));
    assert.ok(error instanceof DuplicateProfileNameError, `createProfile(${JSON.stringify(name)}) rejects with DuplicateProfileNameError`);
    assert.deepEqual(error.existing, existing, `carrying ${existing.name}`);
  }
  assert.deepEqual(folder.snapshot(), before, 'nothing under the folder was created, written, or removed');
  assert.deepEqual(session.active, active, 'the selection is what it was');
  assert.deepEqual([...(await profiles.listProfiles(session))], [alice, bob]);
});

test('createProfile whose profiles write does not complete rejects with StoreWriteError passed through from store; active unchanged, and the session still serves its contract (section 4)', async () => {
  const folder = new MemoryFolder();
  const session = await openSession(folder);
  const alice = await profiles.createProfile(session, 'Alice');
  const active = await profiles.selectProfile(session, alice.id);

  folder.failWrite(() => true);
  await assert.rejects(
    () => profiles.createProfile(session, 'Bob'),
    (e) => e instanceof StoreWriteError && e.stage === 'profiles',
    'the store error is passed through, not wrapped',
  );
  assert.deepEqual(session.active, active, 'the selection is what it was');

  folder.failWrite(() => false);
  const bob = await profiles.createProfile(session, 'Bob');
  assert.deepEqual([...(await profiles.listProfiles(session))], [alice, bob], 'after the folder recovers, the same name is created once');
  assert.deepEqual(session.active, active);
});

test('selectProfile with an id no stored profile has rejects with UnknownProfileError; folder and active unchanged (C-004)', async () => {
  const folder = new MemoryFolder();
  const session = await openSession(folder);
  const alice = await profiles.createProfile(session, 'Alice');
  const elsewhere = await profiles.createProfile(await openSession(new MemoryFolder()), 'Elsewhere');
  const unknown = [userProfileId.fresh(), elsewhere.id];
  const before = folder.snapshot();

  for (const id of unknown) {
    await assert.rejects(() => profiles.selectProfile(session, id), (e) => e instanceof UnknownProfileError, `with nothing selected, ${id} is refused`);
    assert.equal(session.active, null, 'still nothing selected');
  }

  const active = await profiles.selectProfile(session, alice.id);
  for (const id of unknown) {
    await assert.rejects(() => profiles.selectProfile(session, id), (e) => e instanceof UnknownProfileError, `with Alice selected, ${id} is refused`);
    assert.deepEqual(session.active, active, 'Alice is still selected');
  }
  assert.deepEqual(folder.snapshot(), before, 'nothing under the folder was created, written, or removed');
});

test('when the profiles file fails to open, listProfiles, createProfile and selectProfile reject with StoreReadError passed through from store; folder and active unchanged (section 4)', async () => {
  const good = await profilesFileFor([newProfile('Alice')]);
  const tampered = JSON.parse(good);
  tampered.body.profiles[Object.keys(tampered.body.profiles)[0]].name = 'Mallory';

  /** @type {[string, string][]} reason as store names it, then the file text */
  const cases = [
    ['unreadable', 'this is not JSON {'],
    ['not-a-pivot-file', '[]'],
    ['integrity-failed', JSON.stringify(tampered, null, 2)],
  ];
  for (const [reason, text] of cases) {
    const folder = new MemoryFolder();
    const session = await openSession(folder);
    const alice = await profiles.createProfile(session, 'Alice');
    const active = await profiles.selectProfile(session, alice.id);
    await plantProfilesFile(folder, text);
    const before = folder.snapshot();

    const isReadError = (/** @type {unknown} */ e) => e instanceof StoreReadError && e.reason === reason;
    await assert.rejects(() => profiles.listProfiles(session), isReadError, `listProfiles rejects with reason ${reason}`);
    await assert.rejects(() => profiles.createProfile(session, 'Bob'), isReadError, `createProfile rejects with reason ${reason}`);
    await assert.rejects(() => profiles.selectProfile(session, alice.id), isReadError, `selectProfile rejects with reason ${reason}`);
    assert.deepEqual(folder.snapshot(), before, `the refused file is left as it was (${reason})`);
    assert.deepEqual(session.active, active, `the selection is what it was (${reason})`);
  }
});

test('when the folder cannot be read, listProfiles, createProfile and selectProfile reject with StoreReadError reason inaccessible; folder and active unchanged, and the session serves its contract once the folder is back (section 4)', async () => {
  const folder = new MemoryFolder();
  const session = await openSession(folder);
  const alice = await profiles.createProfile(session, 'Alice');
  const active = await profiles.selectProfile(session, alice.id);
  const before = folder.snapshot();

  folder.denyRead(() => true);
  const inaccessible = (/** @type {unknown} */ e) => e instanceof StoreReadError && e.reason === 'inaccessible';
  await assert.rejects(() => profiles.listProfiles(session), inaccessible);
  await assert.rejects(() => profiles.createProfile(session, 'Bob'), inaccessible);
  await assert.rejects(() => profiles.selectProfile(session, alice.id), inaccessible);
  assert.deepEqual(session.active, active);

  folder.denyRead(() => false);
  assert.deepEqual(folder.snapshot(), before, 'nothing under the folder was created, written, or removed');
  assert.deepEqual([...(await profiles.listProfiles(session))], [alice]);
  assert.deepEqual(await profiles.selectProfile(session, alice.id), active);
});
