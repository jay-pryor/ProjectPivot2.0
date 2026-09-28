import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController } from '../../src/ui/controller.js';
import { load, FILES } from '../../src/storage/store.js';
import { App as DocGen } from '../../DocGen/doc-designer.js';

const HOUR = 3600_000;

function env(folder, clock = fixedClock('2026-09-28T10:00:00+10:00'), openText = null) {
  return {
    clock, storage: new MemoryStorage(),
    pickFolder: async () => folder.handle,
    pickSaveFile: async (name) => folder.handle.getFileHandle(name, { create: true }),
    pickOpenFile: async () => openText,
  };
}

async function ready(c) {
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  const id = c.getState().profiles[0].id;
  await c.dispatch({ type: 'selectProfile', id });
  await c.dispatch({ type: 'createHazard', id: 'h1', title: 'Fire' });
  await c.dispatch({ type: 'createPlatform', id: 'p1', name: 'Alpha', ownerId: id });
  await c.dispatch({ type: 'linkHazard', hazardId: 'h1', platformId: 'p1' });
  return id;
}

test('a report cannot be produced over unsaved changes', async () => {
  const c = createController(env(new MemoryFolder()));
  await ready(c);
  await c.dispatch({ type: 'produceReport', platformId: 'p1' });
  assert.match(c.getState().message.text, /Save your changes before producing a report/);
});

test('produce a report, save it, and download it as .md and .html', async () => {
  const f = new MemoryFolder();
  const c = createController(env(f));
  await ready(c);
  await c.dispatch({ type: 'save' });
  await c.dispatch({ type: 'produceReport', platformId: 'p1' });
  const reports = Object.values(c.getState().session.working.records.report);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].title, 'Alpha hazard report');
  assert.ok(reports[0].markdown.includes('Fire'));
  assert.equal(c.getState().view.name, 'reports');
  await c.dispatch({ type: 'save' });
  await c.dispatch({ type: 'downloadReport', id: reports[0].id, format: 'md' });
  await c.dispatch({ type: 'downloadReport', id: reports[0].id, format: 'html' });
  assert.equal(f.read('Alpha-2026-09-28.md'), reports[0].markdown);
  assert.equal(f.read('Alpha-2026-09-28.html'), reports[0].html);
  assert.equal((await load(f.handle)).data.records.report[reports[0].id].title, 'Alpha hazard report');
});

test('the designer\'s Generate buttons produce and download for the designer\'s platform', async () => {
  const f = new MemoryFolder();
  const c = createController(env(f));
  await ready(c);
  await c.dispatch({ type: 'save' });
  await c.dispatch({ type: 'openDesigner' });
  assert.equal(c.getState().designerRevision, 1);
  assert.ok(DocGen.ui.views.reportDesign.isOpen());
  await c.dispatch({ type: 'generateFromDesigner', format: 'html' });
  assert.ok(f.read('Alpha-2026-09-28.html').includes('Fire'));
  DocGen.ui.views.reportDesign.close();
});

test('a design change is an unsaved change of the data, but does not block producing a report', async () => {
  const f = new MemoryFolder();
  const c = createController(env(f));
  await ready(c);
  await c.dispatch({ type: 'save' });
  DocGen.docStore.setClassification('PROTECTED');
  assert.equal(c.getState().session.working.reportDesign.classification, 'PROTECTED');
  assert.notEqual(c.getState().session.working, c.getState().session.base);
  await c.dispatch({ type: 'generateFromDesigner', format: 'html' });
  assert.match(f.read('Alpha-2026-09-28.html'), /class="doc-banner">PROTECTED</);
});

test('restore from a backup warns with the unsaved changes it would discard, then replaces the data', async () => {
  const f = new MemoryFolder();
  const clock = fixedClock('2026-09-28T10:00:00+10:00');
  const c = createController(env(f, clock));
  await ready(c);
  await c.dispatch({ type: 'save' });
  clock.advance(2 * HOUR);
  await c.dispatch({ type: 'createHazard', id: 'h2', title: 'Flood' });
  await c.dispatch({ type: 'showBackups' });
  const backups = c.getState().backups;
  assert.equal(backups.length, 2);
  const oldest = backups.at(-1).name;
  await c.dispatch({ type: 'prepareRestore', name: oldest });
  const pending = c.getState().pendingRestore;
  assert.deepEqual(pending.lost, ['Create hazard']);
  await c.dispatch({ type: 'confirmRestore' });
  assert.equal(c.getState().pendingRestore, null);
  assert.equal(c.getState().session.working.records.hazard.h2, undefined);
  assert.match(c.getState().message.text, /Restored/);
  assert.ok(f.list().some((p) => p.startsWith('Superseded Saves/')));
});

test('restore from a chosen file goes through the same check; a bad file is refused', async () => {
  const f = new MemoryFolder();
  const c = createController(env(f, undefined, '{ not a data file'));
  await ready(c);
  await c.dispatch({ type: 'prepareRestoreFromFile' });
  assert.match(c.getState().message.text, /cannot be used/);
  assert.equal(c.getState().pendingRestore, null);
});

test('a data folder whose data.json fails is recovered by restoring a backup', async () => {
  const f = new MemoryFolder();
  const clock = fixedClock('2026-09-28T10:00:00+10:00');
  const a = createController(env(f, clock));
  await ready(a);
  await a.dispatch({ type: 'save' });
  f.write(FILES.data, 'garbage');
  const b = createController(env(f, clock));
  await b.dispatch({ type: 'chooseFolder' });
  await b.dispatch({ type: 'continueFromCheck' });
  await b.dispatch({ type: 'selectProfile', id: b.getState().profiles[0].id });
  await b.dispatch({ type: 'prepareRestore', name: b.getState().backups[0].name });
  await b.dispatch({ type: 'confirmRestore' });
  assert.equal(b.getState().session.working.records.hazard.h1.title, 'Fire');
  assert.equal(b.getState().dataBlocked, false);
});
