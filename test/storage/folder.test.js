import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { readText, writeWhole, listNames, removeFile } from '../../src/storage/folder.js';
import { PivotError } from '../../src/core/errors.js';

test('writeWhole creates folders as needed; readText reads back; missing is null', async () => {
  const f = new MemoryFolder();
  await writeWhole(f.handle, 'backups/a.json', 'one');
  assert.equal(await readText(f.handle, 'backups/a.json'), 'one');
  assert.equal(await readText(f.handle, 'nope.json'), null);
  assert.equal(await readText(f.handle, 'missing/dir.json'), null);
});

test('a failed write leaves the previous file whole, and no empty new file', async () => {
  const f = new MemoryFolder();
  f.write('data.json', 'before');
  f.failWrite((rel) => rel === 'data.json' || rel === 'new.json');
  await assert.rejects(() => writeWhole(f.handle, 'data.json', 'after'), (e) => e instanceof PivotError && e.code === 'write-failed');
  assert.equal(f.read('data.json'), 'before');
  await assert.rejects(() => writeWhole(f.handle, 'new.json', 'x'), PivotError);
  assert.equal(f.exists('new.json'), false);
});

test('listNames lists files in a folder, sorted; a missing folder is empty; removeFile removes', async () => {
  const f = new MemoryFolder();
  f.write('backups/b.json', '');
  f.write('backups/a.json', '');
  assert.deepEqual(await listNames(f.handle, 'backups'), ['a.json', 'b.json']);
  assert.deepEqual(await listNames(f.handle, 'Superseded Saves'), []);
  await removeFile(f.handle, 'backups/a.json');
  assert.deepEqual(await listNames(f.handle, 'backups'), ['b.json']);
});
