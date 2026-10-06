import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderApp } from '../../src/ui/render.js';
import { reportsView, backupsView } from '../../src/ui/screens/reports.js';
import { initialState } from '../../src/ui/controller.js';
import { emptyData } from '../../src/core/data.js';
import { createReport } from '../../src/core/ops/reports.js';
import { assignHazardNumbers } from '../../src/core/ops/hazards.js';
import { seed, act } from '../helpers.js';

const main = (data, extra = {}) => ({
  ...initialState(), screen: 'main', folderName: 'Pivot Data', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }], profileId: 'u1',
  session: { base: data, working: data, loadedStamp: null }, ...extra,
});

test('renderApp routes each screen and view', () => {
  assert.match(renderApp(initialState()), /chooseFolder/);
  const d = assignHazardNumbers(seed());
  assert.match(renderApp(main(d)), /<h1>Hazards<\/h1>/);
  assert.match(renderApp(main(d, { view: { name: 'controls' } })), /<h1>Controls<\/h1>/);
  assert.match(renderApp(main(d, { view: { name: 'platform', id: 'p1' } })), /class="doc-title small" name="name" value="Alpha"/);
  assert.match(renderApp(main(d, { view: { name: 'reports' } })), /<h1>Reports<\/h1>/);
  assert.match(renderApp(main(null, { session: null, view: { name: 'hazards' } })), /<h1>Backups<\/h1>/, 'no data: only backups');
});

test('the reports view: produce form (disabled while unsaved), designer button, and produced reports with downloads', () => {
  const d = createReport(assignHazardNumbers(seed()), act, { id: 'r1', report: { platformId: 'p1', platformName: 'Alpha', producedAt: '2026-09-28T15:00:00+10:00', producedBy: 'u1', title: 'Alpha hazards', classification: 'PROTECTED', rows: [], markdown: '', html: '' } });
  const clean = reportsView(main(d), d).toString();
  assert.match(clean, /<form data-action="produceReport"/);
  assert.match(clean, /data-action="openDesigner"/);
  assert.match(clean, /data-action="downloadReport" data-id="r1" data-format="md"/);
  assert.match(clean, /data-action="downloadReport" data-id="r1" data-format="html"/);
  assert.match(clean, /PROTECTED/);
  assert.doesNotMatch(clean, /Save your changes first/);
  const dirty = reportsView({ ...main(d), session: { base: emptyData(), working: d, loadedStamp: null } }, d).toString();
  assert.match(dirty, /Save your changes first/);
  assert.match(dirty, /type="submit" class="primary" disabled/);
});

test('the backups view warns before a restore, listing the changes that would be lost', () => {
  const s = main(emptyData(), {
    backups: [{ name: 'data-20260928-100000.json', at: '2026-09-28T10:00:00+10:00' }],
    pendingRestore: { label: 'the backup from 2026-09-28 10:00', data: emptyData(), lost: ['Create hazard'] },
  });
  const out = backupsView(s).toString();
  assert.match(out, /replaces the stored data for everyone/);
  assert.match(out, /<li>Create hazard<\/li>/);
  assert.match(out, /data-action="confirmRestore"/);
  assert.match(out, /data-action="prepareRestore" data-name="data-20260928-100000.json"/);
  assert.match(out, /data-action="prepareRestoreFromFile"/);
});
