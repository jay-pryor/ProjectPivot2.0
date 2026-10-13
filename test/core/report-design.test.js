import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startReport, setOwnReportDesign, makeReport, stageOf, createReport } from '../../src/core/ops/reports.js';
import { historyOf } from '../../src/core/history.js';
import { act, seed } from '../helpers.js';

const design = { order: ['hazards'], levels: { hazards: 1 } };

test('a report starts In-Progress with its own copy of a design, and says so in the history', () => {
  const d = startReport(seed(), act, { id: 'r1', title: 'Customer pack', design });
  const r = d.records.report.r1;
  assert.deepEqual([r.title, r.stage, r.status, r.design], ['Customer pack', 'in-progress', 'live', design]);
  assert.notEqual(r.design, design, 'a copy, not the same object');
  assert.equal(stageOf(r), 'in-progress');
  assert.ok(historyOf(d, 'report', 'r1').some((e) => e.action === 'Start report'));
});

test('a report made before stages counts as For Review', () => {
  const d = createReport(seed(), act, { id: 'r0', report: { title: 'Old', document: { blocks: [] }, style: {} } });
  assert.equal(stageOf(d.records.report.r0), 'for-review');
});

test('editing a report\'s design writes no history and sends a For Review report back to In-Progress', () => {
  let d = startReport(seed(), act, { id: 'r1', title: 'T', design });
  d = makeReport(d, act, { id: 'r1', report: { platformId: 'p1', platformName: 'Alpha', producedAt: act.at, producedBy: act.by, document: { blocks: [] }, style: {} } });
  assert.equal(d.records.report.r1.stage, 'for-review');
  const before = historyOf(d, 'report', 'r1').length;
  const same = setOwnReportDesign(d, act, { id: 'r1', design });
  assert.equal(same, d, 'no change, no new data');
  const e = setOwnReportDesign(d, act, { id: 'r1', design: { ...design, levels: { hazards: 2 } } });
  assert.equal(e.records.report.r1.stage, 'in-progress');
  assert.deepEqual(e.records.report.r1.design.levels, { hazards: 2 });
  assert.equal(historyOf(e, 'report', 'r1').length, before, 'no history entry for a design edit');
  const p = setOwnReportDesign(e, act, { id: 'r1', design: e.records.report.r1.design, platformId: 'p2' });
  assert.equal(p.records.report.r1.platformId, 'p2');
});

test('making a report puts the document on the same record and sets For Review', () => {
  let d = startReport(seed(), act, { id: 'r1', title: 'T', design });
  d = makeReport(d, act, { id: 'r1', report: { platformId: 'p1', platformName: 'Alpha', producedAt: act.at, producedBy: act.by, classification: 'OFFICIAL', document: { blocks: [1] }, style: { s: 1 } } });
  const r = d.records.report.r1;
  assert.deepEqual([r.stage, r.platformName, r.document.blocks[0], r.title, r.design.order[0]], ['for-review', 'Alpha', 1, 'T', 'hazards']);
  assert.equal(Object.keys(d.records.report).length, 1, 'no new report');
  const made = historyOf(d, 'report', 'r1').find((x) => x.action === 'Make report');
  assert.ok(made);
  assert.ok(!JSON.stringify(made).includes('"design"'), 'the design is not in the history');
});

// ---- final review fixes ----------------------------------------------------
import { NOT_ACKNOWLEDGED } from '../../src/core/acks.js';
import { recordOverride } from '../../src/core/history.js';

test('starting or making a report asks no one to acknowledge anything, as producing one never did', () => {
  for (const a of ['Produce report', 'Start report', 'Make report']) assert.ok(NOT_ACKNOWLEDGED.includes(a), a);
});

test('a report started before it has a platform records no platform in the history', () => {
  const d = startReport(seed(), act, { id: 'r1', title: 'T', design });
  assert.deepEqual(historyOf(d, 'report', 'r1')[0].platforms, []);
});

test('a conflict over a report keeps its documents and design out of the history', () => {
  const big = { title: 'T', design: { order: ['x'] }, document: { blocks: [1] }, style: {}, html: '<p>' };
  const d = recordOverride(seed(), act, [{ kind: 'report', id: 'r1', reason: 'both-changed', overriddenBy: 'u2', mine: big, theirs: big }]);
  const e = Object.values(d.history).find((x) => x.type === 'override');
  for (const side of ['mine', 'theirs']) {
    assert.deepEqual(Object.keys(e.items[0][side]).sort(), ['title'], side);
  }
});

test('the platform chosen for a report is shown by name; choosing one does not change an old report\'s stage', () => {
  let d = startReport(seed(), act, { id: 'r1', title: 'T', design });
  d = setOwnReportDesign(d, act, { id: 'r1', design, platformId: 'p1' });
  assert.equal(d.records.report.r1.platformName, d.records.platform.p1.name);
  d = makeReport(d, act, { id: 'r1', report: { platformId: 'p1', platformName: 'Alpha', producedAt: act.at, producedBy: act.by, document: { blocks: [] }, style: {} } });
  const old = createReport(seed(), act, { id: 'r0', report: { title: 'Old', document: { blocks: [] }, style: {} } });
  const chose = setOwnReportDesign(old, act, { id: 'r0', design: undefined, platformId: 'p1' });
  assert.equal(stageOf(chose.records.report.r0), 'for-review', 'a platform choice alone is not an edit');
  assert.equal(chose.records.report.r0.design, undefined);
  assert.equal(stageOf(setOwnReportDesign(d, act, { id: 'r1', design, platformId: 'p2' }).records.report.r1), 'for-review');
});
