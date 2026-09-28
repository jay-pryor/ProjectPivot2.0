/**
 * profiles conformance: invariants (CORE-CON-002). Property-based over seeded random
 * sequences of calls by two copies of Pivot on one folder (CORE-TST-001: the seed is fixed
 * and recorded in harness.js). Each test states the model it checks against and the clause
 * of modules/profiles/CONTRACT.md the model comes from. Written from the contract before
 * any implementation (P8).
 *
 * The null double must fail this file (CORE-TST-002, rung 1): fixed data cannot list what
 * was created, refuse what was already there, or keep a selection.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as profiles from '../contract.js';
import { DuplicateProfileNameError, InvalidProfileNameError, UnknownProfileError } from '../contract.js';
import { userProfileId } from '../../../baseline/types.js';
import {
  MemoryFolder, SEED, foldName, inContractOrder, newProfile, nowAest, openSession, openStore, pick, prng, profilesFileName, withBrowserStorageSpies,
} from './harness.js';
import * as store from '../../store/contract.js';

/** @typedef {import('../../../baseline/types.js').UserProfile} UserProfile */
/** @typedef {import('../../../baseline/types.js').ActiveProfile} ActiveProfile */
/** @typedef {import('../contract.js').ProfileSession} ProfileSession */

/**
 * Names as users type them: a small pool so that duplicates, case clashes, and padding
 * arise often, with a blank or two for C-002's other half.
 */
const TYPED = [
  'Alice', 'alice', 'ALICE', '  Alice  ', 'Bob', 'bob ', 'Carol', 'Übertemperatur', 'übertemperatur', '火災', 'Émile', 'émile',
  'a "quoted" name', 'Dan', 'dan\t', 'Eve', '', '   ', '\n', 'Frances', 'frances', 'Zed', 'zed', 'Åsa', 'åsa', 'Ng', 'ng',
];

/**
 * @param {() => number} random
 * @returns {string}
 */
function typedName(random) {
  return TYPED[pick(random, TYPED.length)];
}

test('model check: a random sequence of creates, selects and lists by two copies matches the model of stored profiles, their order, and each session\'s selection (C-001, C-002, C-004, C-005)', async () => {
  const random = prng(SEED);
  const folder = new MemoryFolder();

  /** @typedef {{ name: string, session: ProfileSession, active: ActiveProfile | null }} Copy */
  /** @type {Copy[]} */
  const copies = [
    { name: 'A', session: await openSession(folder), active: null },
    { name: 'B', session: await openSession(folder), active: null },
  ];
  /** @type {Map<string, UserProfile>} the model: every profile the folder holds, by id */
  const stored = new Map();
  let creates = 0;
  let duplicates = 0;
  let selects = 0;

  for (let step = 0; step < 120; step += 1) {
    const copy = copies[pick(random, copies.length)];
    const r = random();
    const at = `step ${step}: ${copy.name}`;
    if (r < 0.45) {
      const name = typedName(random);
      const trimmed = name.trim();
      const clash = [...stored.values()].find((p) => foldName(p.name) === foldName(name));
      if (trimmed === '') {
        await assert.rejects(() => profiles.createProfile(copy.session, name), (e) => e instanceof InvalidProfileNameError, `${at} create blank`);
      } else if (clash) {
        duplicates += 1;
        /** @type {unknown} */
        let error = null;
        await profiles.createProfile(copy.session, name).then(() => assert.fail(`${at} create ${JSON.stringify(name)} must clash with ${clash.name}`), (e) => { error = e; });
        assert.ok(error instanceof DuplicateProfileNameError, `${at} rejects with DuplicateProfileNameError`);
        assert.deepEqual(error.existing, clash, `${at} carrying ${clash.name}`);
      } else {
        creates += 1;
        const before = nowAest();
        const p = await profiles.createProfile(copy.session, name);
        const after = nowAest();
        assert.equal(p.name, trimmed, `${at} created with the trimmed name`);
        assert.ok(!stored.has(p.id), `${at} the id differs from every id stored before`);
        assert.doesNotThrow(() => userProfileId.parse(p.id), `${at} the id is a UserProfileId`);
        assert.ok(before <= p.createdAtAest && p.createdAtAest <= after, `${at} createdAtAest ${p.createdAtAest} is the clock's now`);
        stored.set(p.id, p);
      }
      assert.deepEqual(copy.session.active, copy.active, `${at} creating did not change the selection`);
    } else if (r < 0.75) {
      const known = [...stored.keys()];
      const useKnown = known.length > 0 && random() < 0.8;
      const id = useKnown ? known[pick(random, known.length)] : userProfileId.fresh();
      if (useKnown) {
        selects += 1;
        const target = /** @type {UserProfile} */ (stored.get(id));
        const active = await profiles.selectProfile(copy.session, id);
        assert.deepEqual(active, { id: target.id, name: target.name }, `${at} selected the stored profile`);
        copy.active = active;
      } else {
        await assert.rejects(() => profiles.selectProfile(copy.session, id), (e) => e instanceof UnknownProfileError, `${at} unknown id refused`);
      }
      assert.deepEqual(copy.session.active, copy.active, `${at} session.active is the last successful selection`);
    } else {
      const listed = await profiles.listProfiles(copy.session);
      assert.deepEqual([...listed], inContractOrder(stored.values()), `${at} lists every stored profile once, in contract order`);
    }
  }

  assert.ok(creates >= 10 && duplicates >= 5 && selects >= 10, `the seed produced ${creates} creates, ${duplicates} duplicates, ${selects} selects; it must exercise each (change it on purpose if this fails)`);
  for (const copy of copies) {
    assert.deepEqual([...(await profiles.listProfiles(copy.session))], inContractOrder(stored.values()), `${copy.name} ends with the whole set`);
    assert.deepEqual(copy.session.active, copy.active);
  }
  assert.deepEqual([...(await profiles.listProfiles(await openSession(folder)))], inContractOrder(stored.values()), 'a third copy reads the same set');
});

test('every open starts with no one selected, whatever earlier sessions on this DataStore or another selected or created (C-003)', async () => {
  const random = prng(SEED + 1);
  const folder = new MemoryFolder();
  const opened = await openStore(folder);
  let session = await profiles.openProfiles(opened);
  /** @type {UserProfile[]} */
  const created = [];
  for (let step = 0; step < 20; step += 1) {
    if (created.length === 0 || random() < 0.4) created.push(await profiles.createProfile(session, `user ${step}`));
    await profiles.selectProfile(session, created[pick(random, created.length)].id);
    assert.notEqual(session.active, null, `step ${step}: something is selected before the reopen`);

    const sameStore = await profiles.openProfiles(opened);
    assert.equal(sameStore.active, null, `step ${step}: a new session on the same DataStore starts with none`);
    const otherStore = await openSession(folder);
    assert.equal(otherStore.active, null, `step ${step}: a new session on another DataStore over the same folder starts with none`);
    assert.deepEqual([...(await profiles.listProfiles(otherStore))], inContractOrder(created), `step ${step}: the profiles are there; the selection is not`);
    session = random() < 0.5 ? sameStore : otherStore;
  }
  assert.deepEqual(folder.list(), [await profilesFileName()], 'the folder holds only what store writes for profiles');
});

test('confinement: after any sequence the folder holds only the file store writes for profiles, and the browser\'s storage is untouched (C-003, C-006)', async () => {
  const random = prng(SEED + 2);
  const folder = new MemoryFolder();
  const { writes } = await withBrowserStorageSpies(async () => {
    const sessions = [await openSession(folder), await openSession(folder)];
    /** @type {UserProfile[]} */
    const created = [];
    const before = folder.snapshot();
    assert.deepEqual(folder.list(), [], 'opening two sessions and listing writes nothing');
    for (const session of sessions) await profiles.listProfiles(session);
    assert.deepEqual(folder.snapshot(), before);

    for (let step = 0; step < 40; step += 1) {
      const session = sessions[pick(random, sessions.length)];
      const r = random();
      if (r < 0.3 || created.length === 0) {
        created.push(await profiles.createProfile(session, `user ${step}`));
      } else if (r < 0.6) {
        const snapshot = folder.snapshot();
        await profiles.selectProfile(session, created[pick(random, created.length)].id);
        assert.deepEqual(folder.snapshot(), snapshot, `step ${step}: selecting wrote nothing`);
      } else if (r < 0.8) {
        const snapshot = folder.snapshot();
        await profiles.listProfiles(session);
        assert.deepEqual(folder.snapshot(), snapshot, `step ${step}: listing wrote nothing`);
      } else {
        const snapshot = folder.snapshot();
        sessions[pick(random, sessions.length)] = await openSession(folder);
        assert.deepEqual(folder.snapshot(), snapshot, `step ${step}: opening wrote nothing`);
      }
      assert.deepEqual(folder.list(), [await profilesFileName()], `step ${step}: only the profiles file store writes`);
    }
  });
  assert.deepEqual(writes, [], 'nothing was written to localStorage or sessionStorage');
});

test('idempotency: selecting the same id twice yields equal values, a later selection replaces the earlier, and listing twice is equal (C-004, C-005)', async () => {
  const random = prng(SEED + 3);
  const folder = new MemoryFolder();
  const session = await openSession(folder);
  const created = [];
  for (const name of ['Alice', 'Bob', 'Carol', 'Dan']) created.push(await profiles.createProfile(session, name));
  for (let step = 0; step < 20; step += 1) {
    const target = created[pick(random, created.length)];
    const first = await profiles.selectProfile(session, target.id);
    const second = await profiles.selectProfile(session, target.id);
    assert.deepEqual(second, first, `step ${step}: the same id twice`);
    assert.deepEqual(session.active, second);
    const other = created[pick(random, created.length)];
    const replaced = await profiles.selectProfile(session, other.id);
    assert.deepEqual(session.active, { id: other.id, name: other.name }, `step ${step}: the later selection replaced the earlier`);
    assert.deepEqual(replaced, session.active);
    assert.deepEqual(await profiles.listProfiles(session), await profiles.listProfiles(session), `step ${step}: listing twice is equal`);
  }
});

test('ordering: profiles planted by other copies, with names clashing in case and script, list by case-folded code point and then by id (C-005)', async () => {
  const random = prng(SEED + 4);
  const folder = new MemoryFolder();
  const other = await openStore(folder);
  const session = await openSession(folder);
  /** @type {UserProfile[]} */
  const planted = [];
  let ties = 0;
  for (let step = 0; step < 30; step += 1) {
    const name = typedName(random).trim() || 'blank';
    if (planted.some((p) => foldName(p.name) === foldName(name))) ties += 1;
    const p = newProfile(name); // store.putProfile enforces no name rule: this is two copies that raced (C-005)
    await store.putProfile(other, p);
    planted.push(p);
    const listed = [...(await profiles.listProfiles(session))];
    assert.deepEqual(listed, inContractOrder(planted), `step ${step}: contract order over ${planted.length} profiles`);
    assert.equal(new Set(listed.map((q) => q.id)).size, planted.length, `step ${step}: each once`);
  }
  assert.ok(ties >= 5, `the seed produced ${ties} case-equal names; the tie-break must be exercised (change it on purpose if this fails)`);
});
