import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController } from '../../src/ui/controller.js';
import { App as DocGen } from '../../DocGen/doc-designer.js';

async function setup() {
  const f = new MemoryFolder();
  const c = createController({ clock: fixedClock('2026-10-12T10:00:00+10:00'), storage: new MemoryStorage(), minSaveMs: 0,
    pickFolder: async () => f.handle, pickSaveFile: async (n) => f.handle.getFileHandle(n, { create: true }), pickOpenFile: async () => null });
  const go = async (a) => { await c.dispatch(a); const m = c.getState().message; if (m?.kind === 'error') throw new Error(`${a.type}: ${m.text}`); };
  await go({ type: 'chooseFolder' });
  await go({ type: 'createProfile', name: 'Ada' });
  await go({ type: 'selectProfile', id: c.getState().profiles[0].id });
  await go({ type: 'createPlatform', id: 'p1', name: 'Boat', ownerId: c.getState().profiles[0].id });
  await go({ type: 'save' });
  return { f, c, go };
}
const reports = (c) => Object.values(c.getState().session.working.records.report).filter((r) => r.status !== 'deleted');

test('starting a report adds it In-Progress with a copy of the shared design and opens the designer on it', async () => {
  const { c, go } = await setup();
  await go({ type: 'openDesigner' });
  DocGen.docHost.get().commit((s) => { s.report = { ...s.report, levels: { hazards: 2 } }; });
  await go({ type: 'startReport', title: 'Customer pack', from: '' });
  const [r] = reports(c);
  assert.deepEqual([r.title, r.stage, r.design.levels], ['Customer pack', 'in-progress', { hazards: 2 }]);
  assert.equal(c.getState().designerReportId, r.id);
  assert.equal(DocGen.docHost.get().heading.title, 'Customer pack');
  assert.ok(DocGen.ui.views.reportDesign.isOpen());
});

test('making from the designer puts the document on the open report and sets For Review; an edit sets In-Progress again', async () => {
  const { c, go, f } = await setup();
  await go({ type: 'startReport', title: 'Customer pack', from: '' });
  await go({ type: 'generateFromDesigner', format: 'pdf' });
  let [r] = reports(c);
  assert.equal(reports(c).length, 1, 'no second report');
  assert.deepEqual([r.stage, r.platformId, r.title], ['for-review', 'p1', 'Customer pack']);
  assert.ok(r.document);
  assert.ok(f.list().some((p) => p.endsWith('.pdf')));
  DocGen.docHost.get().commit((s) => { s.report = { ...s.report, levels: { hazards: 3 } }; });
  [r] = reports(c);
  assert.equal(r.stage, 'in-progress');
  assert.equal(c.getState().session.working.reportDesign.levels, undefined, 'the shared design is untouched');
});

test('opening a report from the list puts the designer on it without changing its stage; the plain button opens the shared design', async () => {
  const { c, go } = await setup();
  await go({ type: 'startReport', title: 'A', from: '' });
  await go({ type: 'generateFromDesigner', format: 'html' });
  const [r] = reports(c);
  await go({ type: 'openDesigner' });
  assert.equal(c.getState().designerReportId, null);
  assert.equal(DocGen.docHost.get().heading.title, 'Default for new reports');
  await go({ type: 'openReportDesigner', id: r.id });
  assert.equal(DocGen.docHost.get().heading.title, 'A');
  assert.equal(reports(c)[0].stage, 'for-review');
  assert.equal(DocGen.docSession.selectedSubjectId(), 'p1', 'the report\'s platform is chosen again');
});

test('a blank name starts nothing', async () => {
  const { c } = await setup();
  await c.dispatch({ type: 'startReport', title: '   ', from: '' });
  assert.equal(c.getState().message?.kind, 'error');
  assert.equal(reports(c).length, 0);
});

test('making a report redraws the designer, so its header shows For Review', async () => {
  const { c, go } = await setup();
  await go({ type: 'startReport', title: 'A', from: '' });
  const rev = c.getState().designerRevision;
  await go({ type: 'generateFromDesigner', format: 'html' });
  assert.ok(c.getState().designerRevision > rev);
  assert.equal(DocGen.docHost.get().heading.tag, 'For Review');
});

test('a report made from the shared design keeps that design and is For Review', async () => {
  const { c, go } = await setup();
  await go({ type: 'openDesigner' });
  DocGen.docHost.get().commit((s) => { s.report = { ...s.report, levels: { hazards: 2 } }; });
  await go({ type: 'generateFromDesigner', format: 'html' });
  const [r] = reports(c);
  assert.equal(r.stage, 'for-review');
  assert.deepEqual(r.design.levels, { hazards: 2 });
});
