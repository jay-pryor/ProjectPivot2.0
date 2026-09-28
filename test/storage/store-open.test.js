import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { checkFolder, readProfiles, createProfile, load, FILES } from '../../src/storage/store.js';
import { seal, serialize, newStamp } from '../../src/storage/envelope.js';
import { emptyData } from '../../src/core/data.js';
import { fixedClock } from '../../src/core/time.js';

const at = '2026-09-28T10:00:00+10:00';
const clock = () => fixedClock(at);

test('an empty folder passes the check and loads as empty data with no stamp', async () => {
  const f = new MemoryFolder();
  assert.deepEqual(await checkFolder(f.handle), { failed: [] });
  const { data, stamp } = await load(f.handle);
  assert.deepEqual(data, emptyData());
  assert.equal(stamp, null);
});

test('the check names each file that fails, and why', async () => {
  const f = new MemoryFolder();
  f.write(FILES.data, serialize(await seal('data', { ...emptyData(), nextHazardNumber: 0 }, newStamp('u1', at), at)));
  f.write(FILES.profiles, '{ broken');
  const { failed } = await checkFolder(f.handle);
  assert.deepEqual(failed.map((x) => `${x.file}:${x.reason}`), ['data.json:invalid', 'profiles.json:unreadable']);
  await assert.rejects(() => load(f.handle), (e) => e.code === 'data.invalid');
});

test('load gives back the stored data and its stamp', async () => {
  const f = new MemoryFolder();
  const stamp = newStamp('u1', at);
  const body = { ...emptyData(), nextHazardNumber: 5 };
  f.write(FILES.data, serialize(await seal('data', body, stamp, at)));
  assert.deepEqual(await load(f.handle), { data: body, stamp });
});

test('profiles: created, listed by name, duplicates refused ignoring case, blank refused', async () => {
  const f = new MemoryFolder();
  assert.deepEqual(await readProfiles(f.handle), []);
  const zoe = await createProfile(f.handle, '  Zoe ', clock());
  await createProfile(f.handle, 'adam', clock());
  assert.equal(zoe.name, 'Zoe');
  assert.equal(zoe.createdAt, at);
  assert.deepEqual((await readProfiles(f.handle)).map((p) => p.name), ['adam', 'Zoe']);
  await assert.rejects(() => createProfile(f.handle, 'ZOE', clock()), (e) => e.code === 'profile.duplicate');
  await assert.rejects(() => createProfile(f.handle, '  ', clock()), (e) => e.code === 'empty');
});

test('a profile created by another copy since this one read the list is kept', async () => {
  const f = new MemoryFolder();
  await createProfile(f.handle, 'A', clock());
  const seenByB = await readProfiles(f.handle);
  await createProfile(f.handle, 'C', clock()); // another copy of Pivot, after B read the list
  await createProfile(f.handle, 'B', clock()); // B's create re-reads, so C survives
  assert.equal(seenByB.length, 1);
  assert.deepEqual((await readProfiles(f.handle)).map((p) => p.name), ['A', 'B', 'C']);
});
