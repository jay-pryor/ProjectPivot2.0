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

test('the reports view: the designer button, a note while unsaved, and produced reports with downloads', () => {
  const d = createReport(assignHazardNumbers(seed()), act, { id: 'r1', report: { platformId: 'p1', platformName: 'Alpha', producedAt: '2026-09-28T15:00:00+10:00', producedBy: 'u1', title: 'Alpha hazards', classification: 'PROTECTED', rows: [], document: { blocks: [] }, style: {} } });
  const clean = reportsView(main(d), d).toString();
  assert.doesNotMatch(clean, /produceReport|Produce a report/, 'reports are made in the designer');
  assert.match(clean, /data-action="openDesigner"/);
  assert.match(clean, /data-action="downloadReport" data-id="r1" data-format="pdf">PDF</);
  assert.match(clean, /data-action="downloadReport" data-id="r1" data-format="html">HTML</);
  assert.doesNotMatch(clean, /data-format="md"/);
  const legacy = createReport(d, act, { id: 'r0', report: { platformId: 'p1', platformName: 'Alpha', producedAt: '2026-09-01T15:00:00+10:00', producedBy: 'u1', title: 'Old', classification: '', rows: [], html: '<p>x</p>' } });
  const old = reportsView(main(legacy), legacy).toString();
  assert.doesNotMatch(old, /data-id="r0" data-format="pdf"/, 'a report made before PDF offers HTML only');
  assert.match(old, /data-id="r0" data-format="html"/);
  assert.match(clean, /PROTECTED/);
  assert.doesNotMatch(clean, /Save your changes first/);
  const dirty = reportsView({ ...main(d), session: { base: emptyData(), working: d, loadedStamp: null } }, d).toString();
  assert.match(dirty, /Save your changes first/);
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

import { startReport, setReportDesign } from '../../src/core/ops/reports.js';

test('the reports view: a name and a starting point open a new report; Status; downloads once made; an Open icon on every row', () => {
  let d = setReportDesign(assignHazardNumbers(seed()), { reportTemplates: [{ id: 'rpt1', name: 'Customer pack' }] });
  d = createReport(d, act, { id: 'r0', report: { platformId: 'p1', platformName: 'Alpha', producedAt: '2026-09-28T15:00:00+10:00', producedBy: 'u1', title: 'Made', classification: '', document: { blocks: [] }, style: {} } });
  d = startReport(d, act, { id: 'r1', title: 'Draft one', design: {} });
  const h = reportsView(main(d), d).toString();
  assert.match(h, /<form data-action="startReport" class="report-start">[\s\S]*?<input name="title" required[^>]*placeholder="Report name"[\s\S]*?<select name="from"[^>]*><option value="">The shared design<\/option><option value="rpt1">Customer pack<\/option><\/select>[\s\S]*?<button type="submit" class="primary">Open in Report Designer<\/button><\/form>/);
  assert.match(h, /<th[^>]*>[\s\S]*?Status/);
  assert.match(h, /data-id="r1"[\s\S]*?In-Progress|In-Progress[\s\S]*?data-id="r1"/);
  assert.match(h, /For Review/);
  assert.doesNotMatch(h, /data-action="downloadReport" data-id="r1"/, 'nothing to download before it is made');
  assert.match(h, /data-action="downloadReport" data-id="r0" data-format="pdf"/);
  for (const id of ['r0', 'r1']) assert.match(h, new RegExp(`data-action="openReportDesigner" data-id="${id}"[^>]*title="Open in Report Designer"[^>]*aria-label="Open in Report Designer"`));
});

import { saveButton } from '../../src/ui/screens/common.js';

test('the Save button on its own: Unsaved, Saving…, Saved', () => {
  const d = assignHazardNumbers(seed());
  assert.match(saveButton(main(d)).toString(), /class="save saved"[^>]*>Saved</);
  assert.match(saveButton({ ...main(d), saving: true }).toString(), /class="save saving"[^>]*disabled>Saving…</);
  assert.match(saveButton({ ...main(d), session: { base: emptyData(), working: d, loadedStamp: null } }).toString(), /class="save unsaved"[^>]*>Unsaved</);
});
