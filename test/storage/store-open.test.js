import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { checkFolder, readProfiles, createProfile, updateProfilePrefs, load, listBackups, FILES } from '../../src/storage/store.js';
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

test('Final review I3: a file the share refuses to read is reported as a read failure naming it, not as a fault', async () => {
  const f = new MemoryFolder();
  f.write('backups/data-20260928-100000.json', 'x');
  f.write(FILES.profiles, 'x');
  f.write(FILES.data, 'x');
  f.denyRead((rel) => rel === 'data.json' || rel === 'profiles.json' || rel === 'backups');
  const isReadFailure = (name) => (e) => e.code === 'read-failed' && e.message.includes(name);
  await assert.rejects(() => load(f.handle), isReadFailure('data.json'));
  await assert.rejects(() => readProfiles(f.handle), isReadFailure('profiles.json'));
  await assert.rejects(() => listBackups(f.handle), isReadFailure('backups'));
});

test('profile preferences: merged into the stored profile, kept for other profiles, and read back', async () => {
  const f = new MemoryFolder();
  const ada = await createProfile(f.handle, 'Ada', clock());
  const grace = await createProfile(f.handle, 'Grace', clock());
  await updateProfilePrefs(f.handle, ada.id, { theme: 'light' }, clock());
  const updated = await updateProfilePrefs(f.handle, ada.id, { columnWidths: { 'hazards.title': 320 } }, clock());
  assert.deepEqual(updated.prefs, { theme: 'light', columnWidths: { 'hazards.title': 320 } });
  const read = await readProfiles(f.handle);
  assert.deepEqual(read.find((p) => p.id === ada.id).prefs, { theme: 'light', columnWidths: { 'hazards.title': 320 } });
  assert.equal(read.find((p) => p.id === grace.id).prefs, undefined, 'another profile is untouched');
  await assert.rejects(() => updateProfilePrefs(f.handle, 'nope', { theme: 'dark' }, clock()), (e) => e.code === 'not-found');
});
