import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage } from '../fakes/storage.js';
import { writeMirror, readMirror, clearMirror, hasUnsaved, hasUnsavedRecords, MIRROR_KEY } from '../../src/storage/mirror.js';
import { emptyData } from '../../src/core/data.js';
import { createHazard } from '../../src/core/ops/hazards.js';

const act = { by: 'a', at: '2026-09-28T10:00:00+10:00' };
const base = emptyData();
const working = createHazard(base, act, { id: 'h1', title: 'Fire' });

test('the mirror keeps base, working and stamp for one folder', () => {
  const s = new MemoryStorage();
  assert.equal(writeMirror(s, { folderName: 'Pivot Data', base, working, loadedStamp: null }), null);
  const m = readMirror(s, 'Pivot Data');
  assert.deepEqual(m.working, working);
  assert.deepEqual(m.base, base);
  assert.equal(readMirror(s, 'Other Folder'), null);
  clearMirror(s);
  assert.equal(s.getItem(MIRROR_KEY), null);
});

test('Review focus 3: full or blocked storage gives a warning, never an exception', () => {
  const s = new MemoryStorage();
  s.fill();
  assert.match(writeMirror(s, { folderName: 'x', base, working, loadedStamp: null }), /not being kept/);
  s.refuseReads();
  assert.equal(readMirror(s, 'x'), null);
});

test('hasUnsaved compares working with base; hasUnsavedRecords ignores the report design', () => {
  assert.equal(hasUnsaved({ base, working: base }), false);
  assert.equal(hasUnsaved({ base, working }), true);
  const designed = { ...base, reportDesign: { titleBlock: true } };
  assert.equal(hasUnsaved({ base, working: designed }), true);
  assert.equal(hasUnsavedRecords({ base, working: designed }), false);
  assert.equal(hasUnsavedRecords({ base, working }), true);
});
