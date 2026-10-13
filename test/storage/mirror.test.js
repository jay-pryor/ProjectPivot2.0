import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage } from '../fakes/storage.js';
import { writeMirror, readMirror, clearMirror, hasUnsaved, hasUnsavedRecords, restoreReportDocuments, MIRROR_KEY } from '../../src/storage/mirror.js';
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

test('Final review I4: saved reports\' documents are left out of the mirror and put back from the folder on recovery', async () => {
  const { createReport } = await import('../../src/core/ops/reports.js');
  const big = 'x'.repeat(500_000);
  const doc = { title: 'Old', meta: {}, blocks: [{ kind: 'paragraph', style: 'body', runs: [{ text: big }] }] };
  const saved = createReport(base, act, { id: 'r1', report: { platformId: 'p1', title: 'Old', document: doc, style: { id: 'standard' } } });
  const legacy = createReport(saved, act, { id: 'r0', report: { platformId: 'p1', title: 'Older', html: big } });
  const edited = createReport(legacy, act, { id: 'r2', report: { platformId: 'p1', title: 'New', document: { blocks: [] }, style: { id: 's' } } });
  const s = new MemoryStorage();
  assert.equal(writeMirror(s, { folderName: 'x', base: legacy, working: edited, loadedStamp: null }), null);
  assert.ok(s.getItem(MIRROR_KEY).length < 50_000, `mirror is ${s.getItem(MIRROR_KEY).length} characters`);
  const m = restoreReportDocuments(readMirror(s, 'x'), legacy);
  assert.equal(m.base.records.report.r1.document.blocks[0].runs[0].text, big);
  assert.deepEqual(m.working.records.report.r1.style, { id: 'standard' });
  assert.equal(m.working.records.report.r0.html, big, 'a report made before PDF keeps its HTML');
  assert.ok(!('document' in m.working.records.report.r0), 'and gains no document');
  assert.deepEqual(m.working.records.report.r2.style, { id: 's' }, 'an unsaved report keeps its documents in the mirror');
  assert.deepEqual(m.base, legacy);
});

test('a saved report made again since the save keeps its new document in the browser copy', () => {
  const s = new MemoryStorage();
  const rep = (at, blocks) => ({ id: 'r1', status: 'live', title: 'T', producedAt: at, document: { blocks }, style: {} });
  const base = { ...emptyData(), records: { ...emptyData().records, report: { r1: rep('2026-10-13T09:00:00+10:00', ['old']) } } };
  const working = { ...base, records: { ...base.records, report: { r1: rep('2026-10-13T10:00:00+10:00', ['new']) } } };
  assert.equal(writeMirror(s, { folderName: 'x', base, working, loadedStamp: null }), null);
  const back = restoreReportDocuments(readMirror(s, 'x'), base);
  assert.deepEqual(back.working.records.report.r1.document.blocks, ['new']);
  assert.deepEqual(back.base.records.report.r1.document.blocks, ['old']);
});
