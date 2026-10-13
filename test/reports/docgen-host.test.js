import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../../DocGen/doc-designer.js';
import { createDocHost, reportFileBase } from '../../src/reports/docgen-host.js';
import { fixedClock } from '../../src/core/time.js';
import { assignHazardNumbers, updateHazard } from '../../src/core/ops/hazards.js';
import { confirmControl, setRating } from '../../src/core/ops/assessment.js';
import { setReportDesign } from '../../src/core/ops/reports.js';
import { act, seed } from '../helpers.js';
import { renderHtml } from '../../DocGen/doc-render.js';
import { isStyle } from '../../DocGen/doc-style.js';

/** A produced report's HTML, as its download draws it. */
const htmlOf = (report) => renderHtml(report.document, report.style);
const runText = (runs) => (runs ?? []).map((r) => r.text ?? '').join('');
/** Every word in a produced report's document: headings, paragraphs, captions and cells. */
const textOf = (report) => report.document.blocks.map((b) => [runText(b.runs), runText(b.caption?.runs), runText(b.titleRow),
  ...(b.header ?? []).map(runText), ...(b.rows ?? []).flat().map(runText)].join(' ')).join('\n');

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

test('produce: a report keeps its finished document and Style, carrying the marking and the platform\'s hazards', () => {
  const { box, docs } = setup();
  App.docStore.setClassification('OFFICIAL: Sensitive');
  const { report, baseName } = docs.produce('p1', { at: '2026-09-28T15:00:00+10:00', by: 'u1', title: 'Alpha hazards' });
  assert.equal(report.classification, 'OFFICIAL: Sensitive');
  assert.equal(report.rows.length, 1);
  assert.ok(!('markdown' in report) && !('html' in report), 'the documents are drawn from the document when downloaded');
  assert.ok(Array.isArray(report.document.blocks) && report.document.blocks.length > 0);
  assert.ok(isStyle(report.style));
  assert.equal(report.document.meta.marking, 'OFFICIAL: Sensitive');
  assert.equal(report.document.meta.title, 'Alpha hazards');
  for (const text of ['HAZ-001', 'Fire', 'Sprinklers', 'Serious (2C)', 'Hot works', 'Burns']) {
    assert.ok(textOf(report).includes(text), `document lacks ${text}`);
    assert.ok(htmlOf(report).includes(text), `html lacks ${text}`);
  }
  assert.match(htmlOf(report), /class="marking">OFFICIAL: Sensitive</);
  assert.equal(baseName, 'Alpha-2026-09-28');
  assert.equal(reportFileBase(report), 'Alpha-2026-09-28');
  assert.ok(box.data, 'data untouched by producing');
});

test('Review focus 4: markup in a hazard title is shown literally in the html, never run', () => {
  const { docs } = setup((d) => updateHazard(d, act, { id: 'h1', title: '<script>alert(1)</script> & "quotes" | *stars*' }));
  const { report } = docs.produce('p1', { at: '2026-09-28T15:00:00+10:00', by: 'u1', title: 'T' });
  assert.equal(htmlOf(report).includes('<script>alert(1)</script>'), false);
  assert.ok(htmlOf(report).includes('&lt;script&gt;'));
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
  assert.deepEqual([sec.keyColumn.get(row), ...sec.columns.map((c) => c.get(row))], ['REF-001', 'Safety case', 'SC-1', '', 'Platform']);
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
  assert.equal(hz.columns.find((c) => c.id === 'residualEnvironment').get(hz.rows()[0]), 'Serious (2C)');
  const ra = secs.find((s) => s.id === 'assessments');
  assert.equal(ra.label, 'Risk assessments');
  const envResidual = ra.rows().find((r) => r.stage === 'residual' && r.receptor === 'environment');
  assert.deepEqual(ra.columns.map((c) => c.get(envResidual)), ['Residual', 'Environment', 'C', '', '2', 'Large spill', 'Serious (2C)']);
  const sf = secs.find((s) => s.id === 'sfarp');
  assert.deepEqual(sf.columns.map((c) => c.label), ['Justification', 'Conclusion', 'Conditions of validity']);
  assert.equal(sf.columns[1].get(sf.rows()[0]), 'SFARP achieved');
});

test('Controls and Implemented controls sections', async () => {
  const { setControlAnalysis } = await import('../../src/core/ops/controls.js');
  const { setControlStatus } = await import('../../src/core/ops/assessment.js');
  let data = assignHazardNumbers(seed());
  data = setControlAnalysis(data, act, { hazardId: 'h1', controlId: 'c1', recommendation: 'Fit', justification: 'Because' });
  data = setControlStatus(data, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', status: 'rejected', reason: 'No water' });
  data = setControlStatus(data, act, { hazardId: 'h1', controlId: 'c2', platformId: 'p1', status: 'implemented' });
  const docs = createDocHost({ getData: () => data, setDesign: () => {}, clock: fixedClock('2026-09-28T10:00:00+10:00'), profileName: (id) => id });
  const secs = docs.host.sections({ subjectId: 'p1' });
  const ctl = secs.find((s) => s.id === 'controls');
  assert.equal(ctl.label, 'Controls');
  assert.equal(ctl.keyColumn.label, 'ID');
  assert.deepEqual(ctl.columns.map((c) => c.id), ['control', 'hazards', 'tier', 'description', 'kind', 'recommendation', 'justification', 'state', 'reason', 'owner']);
  const sprinklers = ctl.rows().find((r) => r.title === 'Sprinklers');
  assert.deepEqual(['recommendation', 'justification', 'state', 'reason'].map((id) => ctl.columns.find((c) => c.id === id).get(sprinklers)), ['Fit', 'Because', 'Rejected', 'No water']);
  const ex = secs.find((s) => s.id === 'existing');
  assert.equal(ex.label, 'Implemented controls', 'kept as existing, so saved designs still find it');
  assert.equal(ex.keyColumn.label, 'ID');
  assert.deepEqual(ex.columns.map((c) => c.id), ['control', 'hazards', 'tier', 'description', 'kind', 'owner']);
  assert.deepEqual(ex.rows().map((r) => ex.columns.find((c) => c.id === 'control').get(r)), ['Fire drills'], 'only those implemented on the platform');
});

test('Hazards has a Lifecycle phases column; a Safety reports section; markup stays literal in the output', async () => {
  const { createPhase, linkPhase } = await import('../../src/core/ops/phases.js');
  const { createSafetyReport } = await import('../../src/core/ops/safety-reports.js');
  let data = assignHazardNumbers(seed());
  data = createPhase(data, act, { id: 'ph1', name: 'Design' });
  data = createPhase(data, act, { id: 'ph2', name: 'Operation' });
  data = linkPhase(data, act, { hazardId: 'h1', phaseId: 'ph1' });
  data = linkPhase(data, act, { hazardId: 'h1', phaseId: 'ph2' });
  data = assignHazardNumbers(createSafetyReport(data, act, { hazardId: 'h1', platformId: 'p1', date: '2026-04-01', summary: 'Spill <b>x</b>' }));
  const docs = createDocHost({ getData: () => data, setDesign: () => {}, clock: fixedClock('2026-09-28T10:00:00+10:00'), profileName: (id) => id });
  const secs = docs.host.sections({ subjectId: 'p1' });
  const hz = secs.find((s) => s.id === 'hazards');
  assert.equal(hz.columns.find((c) => c.id === 'phases').get(hz.rows()[0]), 'Design, Operation');
  const sr = secs.find((s) => s.id === 'safetyReports');
  assert.equal(sr.label, 'Safety reports');
  assert.equal(sr.keyColumn.label, 'Report ID');
  assert.deepEqual(sr.columns.map((c) => c.id), ['summary', 'hazards', 'date', 'type', 'location', 'parties', 'description']);
  assert.equal(sr.keyColumn.get(sr.rows()[0]), 'HAZ-001-A-1');
  assert.deepEqual(['summary', 'hazards', 'date', 'type'].map((id) => sr.columns.find((c) => c.id === id).get(sr.rows()[0])), ['Spill <b>x</b>', 'HAZ-001', '2026-04-01', 'Occurrence']);
});

test('markup in a safety report or a justification is shown literally in the produced report', async () => {
  const { createSafetyReport } = await import('../../src/core/ops/safety-reports.js');
  const { setAssessment } = await import('../../src/core/ops/assessment.js');
  const { docs } = setup((d) => {
    let x = createSafetyReport(d, act, { hazardId: 'h1', platformId: 'p1', summary: 'Spill <b>big</b>' });
    return setAssessment(x, act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', receptor: 'personnel', likelihoodWhy: 'Seen <i>twice</i>' });
  });
  const { report } = docs.produce('p1', { at: '2026-09-28T15:00:00+10:00', by: 'u1', title: 'T' });
  for (const raw of ['<b>big</b>', '<i>twice</i>']) assert.equal(htmlOf(report).includes(raw), false, `${raw} ran as markup`);
  assert.ok(htmlOf(report).includes('&lt;b&gt;big&lt;/b&gt;'));
  assert.ok(textOf(report).includes('<b>big</b>'), 'the document holds the words as typed, as text');
});

test('capability in Hazards and Risk assessments, and its justifications stay literal in the output', async () => {
  const { setAssessment } = await import('../../src/core/ops/assessment.js');
  const { docs } = setup((d) => setAssessment(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor: 'capability', likelihood: 'C', consequence: 2, consequenceWhy: 'Mission <lost>' }));
  const secs = docs.host.sections({ subjectId: 'p1' });
  const hz = secs.find((s) => s.id === 'hazards');
  assert.equal(hz.columns.find((c) => c.id === 'residualCapability').label, 'Residual risk (capability)');
  assert.equal(hz.columns.find((c) => c.id === 'residualCapability').get(hz.rows()[0]), 'Serious (2C)');
  const ra = secs.find((s) => s.id === 'assessments');
  const cap = ra.rows().find((r) => r.receptor === 'capability' && r.stage === 'residual');
  assert.equal(ra.columns.find((c) => c.id === 'receptor').get(cap), 'Capability');
  const { report } = docs.produce('p1', { at: '2026-09-28T15:00:00+10:00', by: 'u1', title: 'T' });
  assert.ok(htmlOf(report).includes('Mission &lt;lost&gt;'));
  assert.equal(htmlOf(report).includes('Mission <lost>'), false);
});

test('controls carry who implements them on the platform, as an optional column kept as owner', async () => {
  const { setImplementedBy } = await import('../../src/core/ops/controls.js');
  const { setControlStatus } = await import('../../src/core/ops/assessment.js');
  const { docs } = setup((d) => {
    let x = setImplementedBy(d, act, { controlId: 'c1', platformId: 'p1', implementedBy: 'customer' });
    x = setControlStatus(x, act, { hazardId: 'h1', controlId: 'c2', platformId: 'p1', status: 'implemented' });
    return setImplementedBy(x, act, { controlId: 'c2', platformId: 'p1', implementedBy: 'highcom' });
  });
  const secs = docs.host.sections({ subjectId: 'p1' });
  const ctl = secs.find((s) => s.id === 'controls');
  const by = ctl.columns.find((c) => c.id === 'owner');
  assert.equal(by.label, 'Implemented by');
  assert.equal(by.optional, true);
  assert.equal(by.get(ctl.rows().find((r) => r.title === 'Sprinklers')), 'Customer');
  const ex = secs.find((s) => s.id === 'existing');
  assert.equal(ex.columns.find((c) => c.id === 'owner').label, 'Implemented by');
  assert.equal(ex.columns.find((c) => c.id === 'owner').get(ex.rows().find((r) => r.title === 'Fire drills')), 'HighCom');
});

test('the Implemented by columns start switched off, so saved designs keep their columns and widths', () => {
  const { docs } = setup();
  const secs = docs.host.sections({ subjectId: 'p1' });
  for (const id of ['controls', 'existing']) assert.equal(secs.find((s) => s.id === id).columns.find((c) => c.id === 'owner').defaultOff, true, id);
  const { report } = docs.produce('p1', { at: '2026-09-28T15:00:00+10:00', by: 'u1', title: 'T' });
  const blocks = report.document.blocks;
  const at = blocks.findIndex((b) => b.kind === 'heading' && runText(b.runs) === 'Controls');
  const table = blocks.slice(at).find((b) => b.kind === 'table');
  assert.ok(at >= 0 && table);
  assert.doesNotMatch(table.header.map(runText).join('|'), /Implemented by/, 'no Implemented by column until someone ticks it on');
});

test('Controls has one row per control, its ID first, the hazards it serves listed, and per-hazard values once or per hazard', async () => {
  const { setControlAnalysis, linkControl } = await import('../../src/core/ops/controls.js');
  const { setControlStatus } = await import('../../src/core/ops/assessment.js');
  const { linkHazard } = await import('../../src/core/ops/platforms.js');
  let data = assignHazardNumbers(linkHazard(seed(), act, { hazardId: 'h2', platformId: 'p1' }));
  data = linkControl(data, act, { hazardId: 'h2', controlId: 'c1', kind: 'preventative' });
  data = setControlAnalysis(data, act, { hazardId: 'h1', controlId: 'c1', recommendation: 'Fit', justification: 'Because' });
  data = setControlAnalysis(data, act, { hazardId: 'h2', controlId: 'c1', recommendation: 'Fit', justification: 'Also because' });
  data = setControlStatus(data, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', status: 'implemented' });
  const docs = createDocHost({ getData: () => data, setDesign: () => {}, clock: fixedClock('2026-09-28T10:00:00+10:00'), profileName: (id) => id });
  const ctl = docs.host.sections({ subjectId: 'p1' }).find((s) => s.id === 'controls');
  const rows = ctl.rows();
  assert.deepEqual(rows.map((r) => ctl.keyColumn.get(r)), ['C-001', 'C-002'], 'one row per control, in number order');
  const get = (id, r) => ctl.columns.find((c) => c.id === id).get(r);
  assert.equal(get('control', rows[0]), 'Sprinklers');
  assert.equal(get('hazards', rows[0]), 'HAZ-001, HAZ-002');
  assert.equal(get('kind', rows[0]), 'preventative', 'the same for both hazards: shown once');
  assert.equal(get('recommendation', rows[0]), 'Fit');
  assert.equal(get('justification', rows[0]), 'HAZ-001: Because\nHAZ-002: Also because', 'different: one line per hazard');
  assert.equal(get('state', rows[0]), 'HAZ-001: Implemented\nHAZ-002: Recommended');
  assert.equal(get('hazards', rows[1]), 'HAZ-001');
  assert.equal(get('reason', rows[0]), '', 'nothing recorded for either hazard: blank');
  const data2 = setControlStatus(data, act, { hazardId: 'h2', controlId: 'c1', platformId: 'p1', status: 'rejected', reason: 'No water' });
  const ctl2 = createDocHost({ getData: () => data2, setDesign: () => {}, clock: fixedClock('2026-09-28T10:00:00+10:00'), profileName: (id) => id })
    .host.sections({ subjectId: 'p1' }).find((s) => s.id === 'controls');
  assert.equal(ctl2.columns.find((c) => c.id === 'reason').get(ctl2.rows()[0]), 'HAZ-002: No water', 'a hazard with nothing recorded is left out');
});

test('Implemented controls: one row per control, its ID first; a safety report on two hazards is one row', async () => {
  const { setControlStatus } = await import('../../src/core/ops/assessment.js');
  const { linkControl } = await import('../../src/core/ops/controls.js');
  const { linkHazard } = await import('../../src/core/ops/platforms.js');
  let data = assignHazardNumbers(linkHazard(seed(), act, { hazardId: 'h2', platformId: 'p1' }));
  data = linkControl(data, act, { hazardId: 'h2', controlId: 'c2', kind: 'mitigating' });
  data = setControlStatus(data, act, { hazardId: 'h1', controlId: 'c2', platformId: 'p1', status: 'implemented' });
  data = setControlStatus(data, act, { hazardId: 'h2', controlId: 'c2', platformId: 'p1', status: 'implemented' });
  const docs = createDocHost({ getData: () => data, setDesign: () => {}, clock: fixedClock('2026-09-28T10:00:00+10:00'), profileName: (id) => id });
  const ex = docs.host.sections({ subjectId: 'p1' }).find((s) => s.id === 'existing');
  const rows = ex.rows();
  assert.equal(rows.length, 1);
  assert.equal(ex.keyColumn.get(rows[0]), 'C-002');
  assert.equal(ex.columns.find((c) => c.id === 'hazards').get(rows[0]), 'HAZ-001, HAZ-002');
});

test('tables whose rows have no ID of their own keep the hazard first', () => {
  const { docs } = setup();
  const secs = docs.host.sections({ subjectId: 'p1' });
  for (const id of ['causes', 'assessments', 'sfarp']) assert.equal(secs.find((s) => s.id === id).keyColumn.label, 'Hazard', id);
  for (const id of ['hazards', 'references']) assert.equal(secs.find((s) => s.id === id).keyColumn.label, 'ID', id);
});

test('Register Numbering off: hazards, controls and references numbered from 1 in the document, everywhere they are named', async () => {
  const { renumbered } = await import('../../src/reports/docgen-host.js');
  const snap = {
    rows: [
      { reportId: 'HAZ-004', controls: [{ number: 'C-007' }, { number: 'C-002' }], safetyReports: [{ number: 'HAZ-004-A-1' }] },
      { reportId: 'HAZ-017', controls: [{ number: 'C-007' }], safetyReports: [] },
    ],
    references: [{ number: 'REF-012', supports: 'HAZ-004, HAZ-017 causal factor' }, { number: 'REF-030', supports: 'Platform' }],
  };
  const all = renumbered(snap, {});
  assert.deepEqual(all.rows.map((r) => r.reportId), ['HAZ-001', 'HAZ-002']);
  assert.deepEqual(all.rows[0].controls.map((c) => c.number), ['C-002', 'C-001'], 'controls in their register order: C-002 → C-001, C-007 → C-002');
  assert.equal(all.rows[1].controls[0].number, 'C-002');
  assert.equal(all.rows[0].safetyReports[0].number, 'HAZ-001-A-1', 'a safety report follows its hazard');
  assert.deepEqual(all.references.map((r) => [r.number, r.supports]), [['REF-001', 'HAZ-001, HAZ-002 causal factor'], ['REF-002', 'Platform']]);
  const hazardsOnly = renumbered(snap, { registerControls: true, registerReferences: true });
  assert.deepEqual([hazardsOnly.rows[0].reportId, hazardsOnly.rows[0].controls[0].number, hazardsOnly.references[0].number], ['HAZ-001', 'C-007', 'REF-012']);
  assert.equal(renumbered(snap, { registerHazards: true, registerControls: true, registerReferences: true }), snap, 'register numbers throughout: the snapshot as it is');
  assert.equal(renumbered(snap, null), snap, 'no Style given (a column list, say): the snapshot as it is');
});

test('a report shows the document\'s own numbers unless its Style uses the register\'s', async () => {
  const { createPlatform, linkHazard } = await import('../../src/core/ops/platforms.js');
  const { docs } = setup((d) => {
    let x = createPlatform(d, act, { id: 'p3', name: 'Charlie', ownerId: 'u1' });
    x = linkHazard(x, act, { hazardId: 'h2', platformId: 'p3' });
    return setReportDesign(x, { formats: [{ id: 'cust', name: 'Customer', page: { margins: {} }, text: {} }], formatId: 'cust' });
  });
  const key = (run) => { const hz = docs.host.sections(run).find((s) => s.id === 'hazards'); return hz.keyColumn.get(hz.rows()[0]); };
  assert.equal(key({ subjectId: 'p3' }), 'HAZ-002', 'no Style given: the register number');
  assert.equal(key({ subjectId: 'p3', numbering: { registerHazards: false } }), 'HAZ-001');
  assert.equal(key({ subjectId: 'p3', numbering: { registerHazards: true } }), 'HAZ-002');
  const { report } = docs.produce('p3', { at: '2026-09-28T15:00:00+10:00', by: 'u1', title: 'T' });
  assert.ok(textOf(report).includes('HAZ-001'), 'by default the produced report numbers its own hazards');
  assert.ok(!textOf(report).includes('HAZ-002'));
});

import { imagesInUse } from '../../src/reports/docgen-host.js';
import { makePng, makeJpeg } from '../docgen/image-fixtures.js';

function memFiles() {
  const files = new Map();
  return { files, api: {
    read: async (p) => files.get(p) ?? null,
    write: async (p, blob) => { files.set(p, new Uint8Array(await blob.arrayBuffer())); },
    exists: async (p) => files.has(p),
    remove: async (p) => { files.delete(p); },
  } };
}
const fileOf = (bytes, name) => new File([bytes], name);

test('the host stores a PNG or JPEG under its folder with a new name, and reads it back', async () => {
  const m = memFiles();
  const { host } = createDocHost({ ...ctxFor(), files: m.api });
  const png = await makePng({ width: 3, height: 2, sample: () => [1, 2, 3] });
  const r = await host.images.store('report', fileOf(png, 'site.png'));
  assert.match(r.file, /^[0-9a-f]{8}\.png$/);
  assert.deepEqual([r.width, r.height], [3, 2]);
  assert.deepEqual([...await host.images.read(`files/report-images/${r.file}`)], [...png]);
  const j = await host.images.store('standard', fileOf(makeJpeg(10, 5), 'logo.jpeg'));
  assert.match(j.file, /^[0-9a-f]{8}\.jpg$/);
  assert.ok(m.files.has(`files/standard-images/${j.file}`));
  await host.images.remove('standard', j.file);
  assert.equal(m.files.has(`files/standard-images/${j.file}`), false);
});

test('other files, and files over 20 MB, are refused with a reason', async () => {
  const { host } = createDocHost({ ...ctxFor(), files: memFiles().api });
  await assert.rejects(host.images.store('report', fileOf(new TextEncoder().encode('GIF89a'), 'a.gif')), /Only PNG and JPEG images can be used/);
  const big = { name: 'huge.png', size: 21 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(0) };
  await assert.rejects(host.images.store('report', big), /huge\.png is 21 MB; an image can be at most 20 MB/);
  const { host: none } = createDocHost(ctxFor());
  await assert.rejects(none.images.store('report', fileOf(makeJpeg(1, 1), 'a.jpg')), /Open the data folder first/);
  assert.equal(await none.images.read('files/report-images/a.png'), null);
});

test('the report images in use: in sections, templates and produced reports', () => {
  const img = (file, source = 'report') => ({ kind: 'image', images: [{ source, file }, null] });
  const data = { reportDesign: { sections: [{ parts: [img('a.png'), img('s.png', 'standard')] }], sectionTemplates: [{ parts: [img('b.png')] }],
    reportTemplates: [{ sections: [{ parts: [img('c.png')] }] }] },
    records: { report: { r1: { document: { blocks: [{ kind: 'figure', images: [{ src: 'files/report-images/d.png' }, { src: 'files/standard-images/s.png' }, null] }] } } } } };
  assert.deepEqual([...imagesInUse(data)].sort(), ['a.png', 'b.png', 'c.png', 'd.png']);
});
const ctxFor = () => ({ getData: () => seed(), setDesign: () => {}, clock: fixedClock('2026-09-28T10:00:00+10:00'), profileName: (/** @type {string} */ id) => id });

test('the host refuses an image over 50 megapixels with its size', async () => {
  const { host } = createDocHost({ ...ctxFor(), files: memFiles().api });
  await assert.rejects(host.images.store('report', fileOf(makeJpeg(10000, 6000), 'scan.jpg')), /scan\.jpg is 10000 × 6000 pixels; an image can be at most 50 megapixels/);
});

import { startReport, setOwnReportDesign } from '../../src/core/ops/reports.js';
import { LIBRARY_KEYS } from '../../src/reports/docgen-host.js';

/** A host whose data holds a report r1 with its own design, and the shared design with a library. */
function withReport(own) {
  const box = { data: setReportDesign(seed(), { order: ['hazards', 'controls'], formats: [{ id: 'house', name: 'House', page: { margins: {} }, text: {} }], formatId: 'house', sectionTemplates: [{ id: 't1', name: 'T', parts: [] }] }) };
  box.data = startReport(box.data, act, { id: 'r1', title: 'Customer pack', design: own });
  const docs = createDocHost({
    getData: () => box.data,
    setDesign: (design) => { box.data = setReportDesign(box.data, design); },
    setReportDesign: (id, design, platformId) => { box.data = setOwnReportDesign(box.data, act, { id, design, platformId }); },
    clock: fixedClock('2026-09-28T15:00:00+10:00'),
    profileName: (id) => id,
  });
  return { box, docs };
}

test('a report host shows its own arrangement over the shared library, and writes each back where it belongs', () => {
  assert.deepEqual(LIBRARY_KEYS, ['formats', 'sectionTemplates', 'reportTemplates', 'standardImages']);
  const { box, docs } = withReport({ order: ['controls'], formatId: 'house' });
  const h = docs.hostFor('r1');
  const st = h.getState().report;
  assert.deepEqual(st.order, ['controls']);
  assert.equal(st.formats[0].id, 'house', 'the library is there to use');
  assert.deepEqual(h.heading, { title: 'Customer pack', tag: 'In-Progress' });
  h.commit((s) => { s.report.order = ['hazards']; s.report.formats.push({ id: 'new', name: 'New', page: { margins: {} }, text: {} }); });
  assert.deepEqual(box.data.records.report.r1.design.order, ['hazards']);
  assert.equal(box.data.records.report.r1.design.formats, undefined, 'the library is not copied into the report');
  assert.deepEqual(box.data.reportDesign.order, ['hazards', 'controls'], 'the shared arrangement is untouched');
  assert.deepEqual(box.data.reportDesign.formats.map((f) => f.id), ['house', 'new'], 'a Style made in a report joins the shared Styles');
  assert.deepEqual(docs.host.heading, { title: 'Default for new reports' });
});

test('a report with no design of its own opens on a copy of the shared one', () => {
  const { box, docs } = withReport({});
  box.data = { ...box.data, records: { ...box.data.records, report: { ...box.data.records.report, r1: { ...box.data.records.report.r1, design: undefined, stage: undefined } } } };
  const h = docs.hostFor('r1');
  assert.deepEqual(h.getState().report.order, ['hazards', 'controls']);
  assert.equal(h.heading.tag, 'For Review');
});

test('a new report\'s design: the shared arrangement, or a template applied to it', () => {
  const { box, docs } = withReport({});
  box.data = setReportDesign(box.data, { ...box.data.reportDesign, reportTemplates: [{ id: 'rpt1', name: 'Pack', order: ['controls'], sections: [] }] });
  const shared = docs.newDesign('');
  assert.deepEqual(shared.design.order, ['hazards', 'controls']);
  assert.equal(shared.design.formats, undefined);
  const fromT = docs.newDesign('rpt1');
  assert.deepEqual(fromT.design.order, ['controls']);
  assert.ok(Array.isArray(fromT.library.reportTemplates));
});

test('the report host remembers the platform chosen for it', () => {
  const { box, docs } = withReport({});
  docs.hostFor('r1').rememberSubject('p2');
  assert.equal(box.data.records.report.r1.platformId, 'p2');
});

test('producing a report keeps the designer on that report\'s host', () => {
  const { docs } = withReport({ order: ['hazards'] });
  const { report } = docs.produce('p1', { at: '2026-09-28T15:00:00+10:00', by: 'u1', title: 'Customer pack', reportId: 'r1' });
  assert.ok(report.document);
  assert.deepEqual(App.docHost.get().heading, { title: 'Customer pack', tag: 'In-Progress' });
});

test('images in a report\'s own design are in use', () => {
  const data = { reportDesign: {}, records: { report: { r1: { status: 'live', design: { sections: [{ parts: [{ kind: 'image', images: [{ source: 'report', file: 'x.png' }] }] }] } } } } };
  assert.deepEqual([...imagesInUse(data)], ['x.png']);
});
