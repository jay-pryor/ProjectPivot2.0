import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { PivotError } from '../../src/core/errors.js';
import { safeName, storeReferenceFile, openReferenceFile, missingFiles } from '../../src/storage/store.js';

const pdf = (name = 'Safety case.pdf', text = '%PDF-1.4 bytes') => new File([new TextEncoder().encode(text)], name, { type: 'application/pdf' });

test('safeName keeps a file name usable on Windows', () => {
  assert.equal(safeName('Safety case.pdf'), 'Safety case.pdf');
  assert.equal(safeName('a<b>:c"d/e\\f|g?h*.pdf'), 'a-b-c-d-e-f-g-h-.pdf');
  assert.equal(safeName('trailing. '), 'trailing');
  assert.equal(safeName('   '), 'file');
  assert.equal(safeName('x'.repeat(300)).length, 120);
});

test('a stored file is written whole into files/<reference>/, read back as the same bytes', async () => {
  const f = new MemoryFolder();
  const stored = await storeReferenceFile(f.handle, 'r1', 1, pdf());
  assert.equal(stored, 'files/r1/1-Safety case.pdf');
  assert.equal(f.read(stored), '%PDF-1.4 bytes');
  const back = await openReferenceFile(f.handle, stored);
  assert.equal(await back.text(), '%PDF-1.4 bytes');
});

test('a stored path is never written twice: a clash takes the next number', async () => {
  const f = new MemoryFolder();
  const a = await storeReferenceFile(f.handle, 'r1', 1, pdf('spec.pdf', 'first'));
  const b = await storeReferenceFile(f.handle, 'r1', 1, pdf('spec.pdf', 'second'));
  assert.deepEqual([a, b], ['files/r1/1-spec.pdf', 'files/r1/2-spec.pdf']);
  assert.equal(f.read(a), 'first', 'the first is untouched');
});

test('a failed write leaves nothing behind', async () => {
  const f = new MemoryFolder();
  f.failWrite(() => true);
  await assert.rejects(storeReferenceFile(f.handle, 'r1', 1, pdf()), (e) => e instanceof PivotError && e.code === 'write-failed');
  assert.deepEqual(f.listUnder('files'), []);
});

test('missing files are found; opening one says so', async () => {
  const f = new MemoryFolder();
  const a = await storeReferenceFile(f.handle, 'r1', 1, pdf());
  const b = await storeReferenceFile(f.handle, 'r1', 2, pdf('b.pdf'));
  f.remove(b);
  assert.deepEqual(await missingFiles(f.handle, [a, b, 'files/r9/1-x.pdf']), [b, 'files/r9/1-x.pdf']);
  await assert.rejects(openReferenceFile(f.handle, b), (e) => e instanceof PivotError && e.code === 'file-missing');
});
