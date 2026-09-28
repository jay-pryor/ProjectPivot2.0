import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { backupIfDue, listBackups, readBackup, restore, load, save, writeExport, FILES, BACKUP_KEEP } from '../../src/storage/store.js';
import { fixedClock } from '../../src/core/time.js';
import { emptyData } from '../../src/core/data.js';
import { createHazard } from '../../src/core/ops/hazards.js';

const HOUR = 3600_000;
const act = { by: 'a', at: '2026-09-28T10:00:00+10:00' };

test('a backup is written when none exists or the newest is more than an hour old, and not otherwise', async () => {
  const f = new MemoryFolder();
  const clock = fixedClock('2026-09-28T10:00:00+10:00');
  const data = createHazard(emptyData(), act, { id: 'h1', title: 'Fire' });
  assert.equal(await backupIfDue(f.handle, data, clock), 'data-20260928-100000.json');
  clock.advance(HOUR);
  assert.equal(await backupIfDue(f.handle, data, clock), null, 'exactly an hour: not yet');
  clock.advance(1000);
  assert.equal(await backupIfDue(f.handle, data, clock), 'data-20260928-110001.json');
  assert.deepEqual((await readBackup(f.handle, 'data-20260928-100000.json')).records.hazard.h1.title, 'Fire');
});

test('writing the 73rd backup deletes the oldest and only the oldest', async () => {
  const f = new MemoryFolder();
  const clock = fixedClock('2026-09-01T00:00:00+10:00');
  for (let i = 0; i < BACKUP_KEEP + 1; i++) {
    await backupIfDue(f.handle, emptyData(), clock);
    clock.advance(HOUR + 1000);
  }
  const names = f.list().filter((n) => n.startsWith('backups/'));
  assert.equal(names.length, BACKUP_KEEP);
  assert.ok(!names.includes('backups/data-20260901-000000.json'));
  const listed = await listBackups(f.handle);
  assert.equal(listed.length, BACKUP_KEEP);
  assert.ok(listed[0].at > listed[1].at, 'newest first');
});

test('restore replaces the stored data whole, keeps the replaced file, and loads back equal', async () => {
  const f = new MemoryFolder();
  const clock = fixedClock('2026-09-28T10:00:00+10:00');
  let s = { base: emptyData(), working: createHazard(emptyData(), act, { id: 'h1', title: 'Current' }), loadedStamp: null };
  const saved = await save(f.handle, s, 'a', clock);
  const current = f.read(FILES.data);
  const old = createHazard(emptyData(), act, { id: 'h0', title: 'Old' });
  const r = await restore(f.handle, old, 'a', clock);
  assert.equal(f.read(/** @type {string} */ (r.supersededFile)), current);
  assert.ok(r.supersededFile.includes(saved.stamp.token.slice(0, 8)));
  const back = await load(f.handle);
  assert.deepEqual(back.data, old);
  assert.equal(back.stamp.token, r.stamp.token);
});

test('writeExport writes the text to the chosen file', async () => {
  const f = new MemoryFolder();
  const h = await f.handle.getFileHandle('report.md', { create: true });
  await writeExport(h, '# Report\n');
  assert.equal(f.read('report.md'), '# Report\n');
});
