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
  assert.deepEqual(docs.host.sections(null).map((s) => s.id), ['hazards', 'controls', 'causes', 'references']);
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
