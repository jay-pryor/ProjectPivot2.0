import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../../DocGen/doc-designer.js';
import { createDocHost, reportFileBase } from '../../src/reports/docgen-host.js';
import { fixedClock } from '../../src/core/time.js';
import { assignHazardNumbers, updateHazard } from '../../src/core/ops/hazards.js';
import { confirmControl, setRating } from '../../src/core/ops/assessment.js';
import { setReportDesign } from '../../src/core/ops/reports.js';
import { act, seed } from '../helpers.js';

function setup(mutate = (d) => d) {
  let data = assignHazardNumbers(seed());
  data = confirmControl(data, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1' });
  data = setRating(data, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', consequence: 2, likelihood: 'C' });
  data = mutate(data);
  const box = { data };
  const docs = createDocHost({
    getData: () => box.data,
    setDesign: (design) => { box.data = setReportDesign(box.data, design); },
    clock: fixedClock('2026-09-28T15:00:00+10:00'),
    profileName: (id) => ({ u1: 'Ada', u2: 'Grace' })[id] ?? id,
  });
  App.docHost.set(docs.host);
  return { box, docs };
}

test('the host is a valid DocGen host about platforms, offering Pivot\'s markings', () => {
  const { docs } = setup();
  assert.deepEqual(App.docHost.validate(docs.host), []);
  assert.equal(docs.host.subject.noun, 'platform');
  assert.deepEqual(docs.host.subject.list().map((p) => p.label), ['Alpha', 'Bravo']);
  assert.deepEqual(docs.host.classifications, ['OFFICIAL', 'OFFICIAL: Sensitive', 'PROTECTED']);
  assert.deepEqual(docs.host.sections(null).map((s) => s.id), ['hazards', 'controls', 'existing', 'causes', 'references', 'assessments', 'sfarp', 'safetyReports']);
});

test('design changes made in the designer land in Pivot\'s data', () => {
  const { box } = setup();
  assert.ok(App.docStore.setClassification('PROTECTED').ok);
  assert.equal(box.data.reportDesign.classification, 'PROTECTED');
});

test('produce: a report with its markdown and html, carrying the marking and the platform\'s hazards', () => {
  const { box, docs } = setup();
  App.docStore.setClassification('OFFICIAL: Sensitive');
  const { report, markdownName, htmlName } = docs.produce('p1', { at: '2026-09-28T15:00:00+10:00', by: 'u1', title: 'Alpha hazards' });
  assert.equal(report.classification, 'OFFICIAL: Sensitive');
  assert.equal(report.rows.length, 1);
  for (const text of ['H-0001', 'Fire', 'Sprinklers', '2C = Serious', 'Hot works', 'Burns']) {
    assert.ok(report.markdown.includes(text), `markdown lacks ${text}`);
    assert.ok(report.html.includes(text), `html lacks ${text}`);
  }
  assert.ok(report.markdown.includes('OFFICIAL: Sensitive'), 'the marking reaches the PDF header');
  assert.match(report.html, /class="doc-banner">OFFICIAL: Sensitive</);
  assert.equal(markdownName, 'Alpha-2026-09-28.md');
  assert.equal(htmlName, 'Alpha-2026-09-28.html');
  assert.equal(reportFileBase(report), 'Alpha-2026-09-28');
  assert.ok(box.data, 'data untouched by producing');
});

test('Review focus 4: markup in a hazard title is shown literally in the html, never run', () => {
  const { docs } = setup((d) => updateHazard(d, act, { id: 'h1', title: '<script>alert(1)</script> & "quotes" | *stars*' }));
  const { report } = docs.produce('p1', { at: '2026-09-28T15:00:00+10:00', by: 'u1', title: 'T' });
  assert.equal(report.html.includes('<script>alert(1)</script>'), false);
  assert.ok(report.html.includes('&lt;script&gt;'));
  assert.equal(report.rows[0].title, '<script>alert(1)</script> & "quotes" | *stars*');
});

test('the References section: ID, title, doc number, revision, what it supports', async () => {
  const { createReference, linkReference } = await import('../../src/core/ops/references.js');
  let data = createReference(assignHazardNumbers(seed()), act, { id: 'r1', title: 'Safety case', docNumber: 'SC-1', url: 'https://x' });
  data = assignHazardNumbers(linkReference(data, act, { referenceId: 'r1', targetKind: 'platform', targetId: 'p1' }));
  const docs = createDocHost({ getData: () => data, setDesign: () => {}, clock: fixedClock('2026-09-28T10:00:00+10:00'), profileName: (id) => id });
  const sec = docs.host.sections({ subjectId: 'p1' }).find((s) => s.id === 'references');
  assert.equal(sec.label, 'References');
  assert.deepEqual([sec.keyColumn.label, ...sec.columns.map((c) => c.label)], ['ID', 'Reference', 'Doc number', 'Revision', 'Supports']);
  const [row] = sec.rows();
  assert.deepEqual([sec.keyColumn.get(row), ...sec.columns.map((c) => c.get(row))], ['R-0001', 'Safety case', 'SC-1', '', 'Platform']);
});

test('Hazards has four risk columns; Risk assessments and SFARP sections', async () => {
  const { setAssessment, setSfarp } = await import('../../src/core/ops/assessment.js');
  let data = assignHazardNumbers(seed());
  data = setAssessment(data, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor: 'environment', likelihood: 'C', consequence: 2, consequenceWhy: 'Large spill' });
  data = setSfarp(data, act, { hazardId: 'h1', platformId: 'p1', conclusion: 'SFARP achieved' });
  const docs = createDocHost({ getData: () => data, setDesign: () => {}, clock: fixedClock('2026-09-28T10:00:00+10:00'), profileName: (id) => id });
  const secs = docs.host.sections({ subjectId: 'p1' });
  const hz = secs.find((s) => s.id === 'hazards');
  assert.deepEqual(hz.columns.map((c) => c.id), ['title', 'initialPersonnel', 'initialEnvironment', 'initialCapability', 'residualPersonnel', 'residualEnvironment', 'residualCapability', 'phases', 'description']);
  assert.equal(hz.columns.find((c) => c.id === 'residualEnvironment').get(hz.rows()[0]), '2C = Serious');
  const ra = secs.find((s) => s.id === 'assessments');
  assert.equal(ra.label, 'Risk assessments');
  const envResidual = ra.rows().find((r) => r.stage === 'residual' && r.receptor === 'environment');
  assert.deepEqual(ra.columns.map((c) => c.get(envResidual)), ['Residual', 'Environment', 'C', '', '2', 'Large spill', '2C = Serious']);
  const sf = secs.find((s) => s.id === 'sfarp');
  assert.deepEqual(sf.columns.map((c) => c.label), ['Justification', 'Conclusion', 'Conditions of validity']);
  assert.equal(sf.columns[1].get(sf.rows()[0]), 'SFARP achieved');
});

test('Additional control analysis and Existing controls sections', async () => {
  const { setControlAnalysis, linkExistingControl } = await import('../../src/core/ops/controls.js');
  const { setControlStatus } = await import('../../src/core/ops/assessment.js');
  let data = assignHazardNumbers(seed());
  data = setControlAnalysis(data, act, { hazardId: 'h1', controlId: 'c1', recommendation: 'Fit', justification: 'Because' });
  data = setControlStatus(data, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', status: 'rejected', reason: 'No water' });
  data = linkExistingControl(data, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c2', kind: 'mitigating' });
  const docs = createDocHost({ getData: () => data, setDesign: () => {}, clock: fixedClock('2026-09-28T10:00:00+10:00'), profileName: (id) => id });
  const secs = docs.host.sections({ subjectId: 'p1' });
  const ctl = secs.find((s) => s.id === 'controls');
  assert.equal(ctl.label, 'Additional control analysis');
  assert.deepEqual(ctl.columns.map((c) => c.id), ['number', 'control', 'tier', 'description', 'kind', 'recommendation', 'justification', 'state', 'reason']);
  const sprinklers = ctl.rows().find((r) => r.title === 'Sprinklers');
  assert.deepEqual(['recommendation', 'justification', 'state', 'reason'].map((id) => ctl.columns.find((c) => c.id === id).get(sprinklers)), ['Fit', 'Because', 'Rejected', 'No water']);
  const ex = secs.find((s) => s.id === 'existing');
  assert.equal(ex.label, 'Existing controls');
  assert.deepEqual(ex.columns.map((c) => c.id), ['tier', 'number', 'control', 'description', 'kind']);
  assert.equal(ex.columns.find((c) => c.id === 'control').get(ex.rows()[0]), 'Fire drills');
});

test('Hazards has a Lifecycle phases column; a Safety reports section; markup stays literal in the output', async () => {
  const { createPhase, linkPhase } = await import('../../src/core/ops/phases.js');
  const { createSafetyReport } = await import('../../src/core/ops/safety-reports.js');
  let data = assignHazardNumbers(seed());
  data = createPhase(data, act, { id: 'ph1', name: 'Design' });
  data = createPhase(data, act, { id: 'ph2', name: 'Operation' });
  data = linkPhase(data, act, { hazardId: 'h1', phaseId: 'ph1' });
  data = linkPhase(data, act, { hazardId: 'h1', phaseId: 'ph2' });
  data = createSafetyReport(data, act, { hazardId: 'h1', platformId: 'p1', number: 'SR-7', date: '2026-04-01', summary: 'Spill <b>x</b>' });
  const docs = createDocHost({ getData: () => data, setDesign: () => {}, clock: fixedClock('2026-09-28T10:00:00+10:00'), profileName: (id) => id });
  const secs = docs.host.sections({ subjectId: 'p1' });
  const hz = secs.find((s) => s.id === 'hazards');
  assert.equal(hz.columns.find((c) => c.id === 'phases').get(hz.rows()[0]), 'Design, Operation');
  const sr = secs.find((s) => s.id === 'safetyReports');
  assert.equal(sr.label, 'Safety reports');
  assert.deepEqual(sr.columns.map((c) => c.id), ['number', 'date', 'type', 'summary', 'location', 'parties', 'description']);
  assert.deepEqual(['number', 'date', 'type', 'summary'].map((id) => sr.columns.find((c) => c.id === id).get(sr.rows()[0])), ['SR-7', '2026-04-01', 'Occurrence', 'Spill <b>x</b>']);
});

test('markup in a safety report or a justification is shown literally in the produced report', async () => {
  const { createSafetyReport } = await import('../../src/core/ops/safety-reports.js');
  const { setAssessment } = await import('../../src/core/ops/assessment.js');
  const { docs } = setup((d) => {
    let x = createSafetyReport(d, act, { hazardId: 'h1', platformId: 'p1', number: 'SR-1', summary: 'Spill <b>big</b>' });
    return setAssessment(x, act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', receptor: 'personnel', likelihoodWhy: 'Seen <i>twice</i>' });
  });
  const { report } = docs.produce('p1', { at: '2026-09-28T15:00:00+10:00', by: 'u1', title: 'T' });
  for (const raw of ['<b>big</b>', '<i>twice</i>']) assert.equal(report.html.includes(raw), false, `${raw} ran as markup`);
  assert.ok(report.html.includes('&lt;b&gt;big&lt;/b&gt;'));
  assert.ok(report.markdown.includes('\\<b\\>big\\</b\\>'));
});

test('capability in Hazards and Risk assessments, and its justifications stay literal in the output', async () => {
  const { setAssessment } = await import('../../src/core/ops/assessment.js');
  const { docs } = setup((d) => setAssessment(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor: 'capability', likelihood: 'C', consequence: 2, consequenceWhy: 'Mission <lost>' }));
  const secs = docs.host.sections({ subjectId: 'p1' });
  const hz = secs.find((s) => s.id === 'hazards');
  assert.equal(hz.columns.find((c) => c.id === 'residualCapability').label, 'Residual risk (capability)');
  assert.equal(hz.columns.find((c) => c.id === 'residualCapability').get(hz.rows()[0]), '2C = Serious');
  const ra = secs.find((s) => s.id === 'assessments');
  const cap = ra.rows().find((r) => r.receptor === 'capability' && r.stage === 'residual');
  assert.equal(ra.columns.find((c) => c.id === 'receptor').get(cap), 'Capability');
  const { report } = docs.produce('p1', { at: '2026-09-28T15:00:00+10:00', by: 'u1', title: 'T' });
  assert.ok(report.html.includes('Mission &lt;lost&gt;'));
  assert.equal(report.html.includes('Mission <lost>'), false);
});
