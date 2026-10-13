import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { load, save, restore, backupIfDue, readBackup, listBackups, FILES } from '../../src/storage/store.js';
import { openEnvelope } from '../../src/storage/envelope.js';
import { fixedClock } from '../../src/core/time.js';
import { startReport, setOwnReportDesign, deleteReport } from '../../src/core/ops/reports.js';
import { SCHEMA_VERSION } from '../../src/core/data.js';

const clock = () => fixedClock('2026-10-14T10:00:00+10:00');
const act = { by: 'a', at: '2026-10-14T10:00:00+10:00' };
const open = async (f) => { const { data, stamp, missingDesigns } = await load(f.handle); return { s: { base: data, working: data, loadedStamp: stamp }, missingDesigns }; };
const after = (r) => ({ base: r.data, working: r.data, loadedStamp: r.stamp });
const design = { order: ['hazards'], levels: { hazards: 2 } };
const diskBody = async (f) => (await openEnvelope(f.read(FILES.data), 'data')).envelope.body;

test('the schema is 7', () => { assert.equal(SCHEMA_VERSION, 7); });

test('a save writes each report\'s design to its own file and keeps it out of data.json', async () => {
  const f = new MemoryFolder();
  const { s } = await open(f);
  s.working = startReport(s.working, act, { id: 'r1', title: 'Pack', design });
  const r = await save(f.handle, s, 'a', clock());
  const file = JSON.parse(f.read('files/reports/r1.json'));
  assert.deepEqual(file, { format: 'pivot-report-design', version: 1, reportId: 'r1', design });
  assert.equal((await diskBody(f)).records.report.r1.design, undefined);
  assert.deepEqual(r.data.records.report.r1.design, design, 'in memory the design stays with the report');
});

test('a load attaches each design, and lists a live report whose file is missing or unreadable', async () => {
  const f = new MemoryFolder();
  let { s } = await open(f);
  s.working = startReport(s.working, act, { id: 'r1', title: 'One', design });
  s.working = startReport(s.working, act, { id: 'r2', title: 'Two', design });
  s.working = startReport(s.working, act, { id: 'r3', title: 'Three', design });
  await save(f.handle, s, 'a', clock());
  f.write('files/reports/r2.json', 'not json');
  const at = f.locate('files/reports/r3.json', false); at.dir.entries.delete(at.name);
  const back = await open(f);
  assert.deepEqual(back.s.base.records.report.r1.design, design);
  assert.equal(back.s.base.records.report.r2.design, undefined);
  assert.deepEqual(back.missingDesigns.sort(), ['r2', 'r3']);
});

test('only changed designs are written; a deleted report\'s file is left alone and not rewritten', async () => {
  const f = new MemoryFolder();
  let { s } = await open(f);
  s.working = startReport(s.working, act, { id: 'r1', title: 'One', design });
  s.working = startReport(s.working, act, { id: 'r2', title: 'Two', design });
  let r = await save(f.handle, s, 'a', clock());
  const r2Node = () => { const at = f.locate('files/reports/r2.json', false); return at.dir.entries.get(at.name); };
  const before = r2Node();
  s = after(r);
  s.working = setOwnReportDesign(s.working, act, { id: 'r1', design: { order: ['controls'] } });
  s.working = deleteReport(s.working, act, { id: 'r2' });
  r = await save(f.handle, s, 'a', clock());
  assert.deepEqual(JSON.parse(f.read('files/reports/r1.json')).design, { order: ['controls'] });
  assert.equal(r2Node(), before, 'the deleted report\'s file is untouched');
});

test('two people: designs of different reports both survive the merge', async () => {
  const f = new MemoryFolder();
  let { s: a } = await open(f);
  a.working = startReport(a.working, act, { id: 'r1', title: 'One', design });
  a.working = startReport(a.working, act, { id: 'r2', title: 'Two', design });
  a = after(await save(f.handle, a, 'a', clock()));
  const { s: b0 } = await open(f);
  const b = { ...b0, working: setOwnReportDesign(b0.working, { by: 'b', at: act.at }, { id: 'r2', design: { order: ['b'] } }) };
  a.working = setOwnReportDesign(a.working, act, { id: 'r1', design: { order: ['a'] } });
  await save(f.handle, b, 'b', clock());
  const r = await save(f.handle, a, 'a', clock());
  assert.equal(r.merged, true);
  assert.deepEqual(JSON.parse(f.read('files/reports/r1.json')).design, { order: ['a'] });
  assert.deepEqual(JSON.parse(f.read('files/reports/r2.json')).design, { order: ['b'] });
});

test('a save writes designs only once it is going ahead', async () => {
  const f = new MemoryFolder();
  const { s } = await open(f);
  s.working = startReport(s.working, act, { id: 'r1', title: 'One', design });
  let calls = 0;
  const hooks = { beforeWrite: async () => { calls++; assert.equal(f.read('files/reports/r1.json'), null, 'nothing written before the final check'); } };
  await save(f.handle, s, 'a', clock(), hooks);
  assert.equal(calls, 1);
  assert.ok(f.read('files/reports/r1.json'));
});

test('a backup carries the designs; restoring it writes them back and leaves other design files alone', async () => {
  const f = new MemoryFolder();
  const { s } = await open(f);
  s.working = startReport(s.working, act, { id: 'r1', title: 'One', design });
  const r = await save(f.handle, s, 'a', clock());
  await backupIfDue(f.handle, r.data, clock());
  const [b] = await listBackups(f.handle);
  const data = await readBackup(f.handle, b.name);
  assert.deepEqual(data.records.report.r1.design, design);
  f.write('files/reports/r1.json', 'changed by hand');
  f.write('files/reports/other.json', JSON.stringify({ format: 'pivot-report-design', version: 1, reportId: 'other', design: {} }));
  await restore(f.handle, data, 'a', clock());
  assert.deepEqual(JSON.parse(f.read('files/reports/r1.json')).design, design);
  assert.ok(f.read('files/reports/other.json'));
  assert.equal((await diskBody(f)).records.report.r1.design, undefined);
});
