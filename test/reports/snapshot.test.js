import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot } from '../../src/reports/snapshot.js';
import { CLASSIFICATIONS } from '../../src/reports/classifications.js';
import { createReport, setReportDesign } from '../../src/core/ops/reports.js';
import { assignHazardNumbers, updateHazard } from '../../src/core/ops/hazards.js';
import { confirmControl, excludeControl, setRating, setAssessment, setSfarp, setControlStatus } from '../../src/core/ops/assessment.js';
import { setControlAnalysis, setImplementedBy, removeControlHere, updateControl } from '../../src/core/ops/controls.js';
import { entries } from '../../src/core/history.js';
import { createPhase, linkPhase } from '../../src/core/ops/phases.js';
import { createSafetyReport } from '../../src/core/ops/safety-reports.js';
import { setSchedule, startReview, completeReview } from '../../src/core/ops/reviews.js';
import { createReference, linkReference, retireReference } from '../../src/core/ops/references.js';
import { act, seed } from '../helpers.js';

const names = { u1: 'Ada', u2: 'Grace' };
const opts = { profileName: (id) => names[id] ?? id, at: '2026-09-28T15:00:00+10:00', by: 'u1', title: 'Alpha hazards', classification: 'OFFICIAL' };

function assessed() {
  let d = assignHazardNumbers(seed());
  d = confirmControl(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1' });
  d = excludeControl(d, act, { hazardId: 'h1', controlId: 'c2', platformId: 'p1', reason: 'No crew' });
  d = setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', consequence: 1, likelihood: 'C' });
  d = setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', consequence: 2, likelihood: 'C' });
  return d;
}

test('the marking list', () => {
  assert.deepEqual(CLASSIFICATIONS, ['OFFICIAL', 'OFFICIAL: Sensitive', 'PROTECTED']);
});

test('a snapshot holds the platform, and each of its hazards with everything a report shows', () => {
  const s = buildSnapshot(assessed(), 'p1', opts);
  assert.equal(s.platformName, 'Alpha');
  assert.equal(s.ownerName, 'Ada');
  assert.equal(s.producedAt, opts.at);
  assert.equal(s.classification, 'OFFICIAL');
  assert.equal(s.rows.length, 1);
  const r = s.rows[0];
  assert.deepEqual(
    { reportId: r.reportId, title: r.title, causalFactors: r.causalFactors, consequences: r.consequences, initial: r.initial, residual: r.residual },
    { reportId: 'HAZ-001', title: 'Fire', causalFactors: ['Hot works'], consequences: ['Burns'], initial: { consequence: 1, likelihood: 'C' }, residual: { consequence: 2, likelihood: 'C' } },
  );
  assert.deepEqual(r.controls, [
    { number: 'C-001', title: 'Sprinklers', description: '', implementedBy: '', kind: 'preventative', tier: '', state: 'implemented', reason: '', recommendation: '', justification: '' },
    { number: 'C-002', title: 'Fire drills', description: '', implementedBy: '', kind: 'mitigating', tier: '', state: 'rejected', reason: 'No crew', recommendation: '', justification: '' },
  ]);
});

test('a snapshot does not change when the data does', () => {
  const d = assessed();
  const s = buildSnapshot(d, 'p1', opts);
  const copy = structuredClone(s);
  updateHazard(d, act, { id: 'h1', title: 'Renamed' });
  assert.deepEqual(s, copy);
  assert.notEqual(s.rows[0].controls, undefined);
});

test('a missing or deleted platform is refused', () => {
  assert.throws(() => buildSnapshot(assessed(), 'nope', opts), (e) => e.code === 'not-found');
});

test('createReport stores the report as a record reaching its platform; setReportDesign writes no history', () => {
  const d = assessed();
  const report = { ...buildSnapshot(d, 'p1', opts), markdown: '# x', html: '<p>x</p>' };
  const d2 = createReport(d, act, { id: 'r1', report });
  assert.equal(d2.records.report.r1.markdown, '# x');
  assert.equal(d2.records.report.r1.createdBy, 'u1');
  assert.deepEqual(entries(d2).at(-1).platforms, ['p1']);
  const d3 = setReportDesign(d2, { titleBlock: true });
  assert.deepEqual(d3.reportDesign, { titleBlock: true });
  assert.equal(Object.keys(d3.history).length, Object.keys(d2.history).length);
  assert.equal(setReportDesign(d3, { titleBlock: true }), d3);
});

test('a snapshot records whether the platform was due for review when the report was produced', () => {
  assert.deepEqual(buildSnapshot(assessed(), 'p1', opts).review, { state: 'none', due: null, months: null, lastReviewed: null });
  let d = setSchedule(assessed(), act, { platformId: 'p1', months: 6, due: '2026-09-01' });
  const overdue = buildSnapshot(d, 'p1', opts);
  assert.deepEqual(overdue.review, { state: 'overdue', due: '2026-09-01', months: 6, lastReviewed: null });
  const stored = createReport(d, act, { id: 'rep1', report: overdue });
  d = startReview(stored, act, { id: 'r1', platformId: 'p1' });
  d = completeReview(d, act, { reviewId: 'r1' });
  assert.equal(d.records.report.rep1.review.state, 'overdue', 'a later review does not change a produced report');
  assert.deepEqual(buildSnapshot(d, 'p1', opts).review, { state: 'ok', due: '2027-03-01', months: 6, lastReviewed: act.at });
});

test('a snapshot lists the references supporting the platform, each once, with what it supports', () => {
  let d = assessed();
  d = createReference(d, act, { id: 'r1', title: 'Safety case', docNumber: 'SC-1', revision: 'B', url: 'https://x' });
  d = createReference(d, act, { id: 'r2', title: 'Sprinkler spec', path: '\\\\srv\\s.pdf' });
  d = createReference(d, act, { id: 'r3', title: 'Retired', url: 'https://y' });
  d = createReference(d, act, { id: 'r4', title: 'Elsewhere', url: 'https://z' });
  for (const [r, k, t] of [['r1', 'platform', 'p1'], ['r1', 'hazard', 'h1'], ['r1', 'causalFactor', 'cf1'], ['r2', 'control', 'c1'], ['r3', 'hazard', 'h1'], ['r4', 'platform', 'p2']]) d = linkReference(d, act, { referenceId: r, targetKind: k, targetId: t });
  d = retireReference(d, act, { id: 'r3' });
  d = assignHazardNumbers(d);
  const s = buildSnapshot(d, 'p1', opts);
  assert.deepEqual(s.references, [
    { number: 'REF-001', title: 'Safety case', docNumber: 'SC-1', revision: 'B', supports: 'Platform, HAZ-001, HAZ-001 causal factor' },
    { number: 'REF-002', title: 'Sprinkler spec', docNumber: '', revision: '', supports: 'Sprinklers' },
  ]);
  assert.deepEqual(buildSnapshot(assessed(), 'p1', opts).references, []);
});

test('a snapshot carries the four assessments with their justifications, and SFARP', () => {
  let d = setAssessment(assessed(), act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', receptor: 'environment', likelihood: 'E', consequence: 4, likelihoodWhy: 'Rare <spill>', consequenceWhy: 'Contained' });
  d = setSfarp(d, act, { hazardId: 'h1', platformId: 'p1', justification: 'J', conclusion: 'C', conditions: 'V' });
  const row = buildSnapshot(d, 'p1', opts).rows[0];
  assert.deepEqual(row.ratings.initialEnvironment, { consequence: 4, likelihood: 'E' });
  assert.deepEqual(row.assessments.map((a) => [a.stage, a.receptor]), [['initial', 'personnel'], ['initial', 'environment'], ['initial', 'capability'], ['residual', 'personnel'], ['residual', 'environment'], ['residual', 'capability']]);
  assert.deepEqual(row.assessments[1], { stage: 'initial', receptor: 'environment', likelihood: 'E', likelihoodWhy: 'Rare <spill>', consequence: 4, consequenceWhy: 'Contained', level: '4E = Low' });
  assert.deepEqual(row.sfarp, { justification: 'J', conclusion: 'C', conditions: 'V' });
});

test('a snapshot carries each control on the platform with its analysis, status and who implements it; none taken off the platform', () => {
  let d = assignHazardNumbers(assessed());
  d = setControlAnalysis(d, act, { hazardId: 'h1', controlId: 'c1', recommendation: 'Fit in <bay 2>', justification: 'Cuts spread' });
  d = setControlStatus(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', status: 'planned' });
  d = setImplementedBy(d, act, { controlId: 'c1', platformId: 'p1', implementedBy: 'oem' });
  d = updateControl(d, act, { id: 'c2', tier: 'Administrative', description: 'Twice a year' });
  const row = buildSnapshot(d, 'p1', opts).rows[0];
  const c1 = row.controls.find((c) => c.title === 'Sprinklers');
  assert.deepEqual([c1.state, c1.recommendation, c1.justification, c1.implementedBy], ['planned', 'Fit in <bay 2>', 'Cuts spread', 'OEM']);
  assert.match(c1.number, /^C-\d{3}$/);
  const c2 = row.controls.find((c) => c.title === 'Fire drills');
  assert.deepEqual([c2.description, c2.tier, c2.kind, c2.implementedBy], ['Twice a year', 'Administrative', 'mitigating', '']);
  assert.equal('existingControls' in row, false);
  const off = buildSnapshot(removeControlHere(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c2' }), 'p1', opts).rows[0];
  assert.deepEqual(off.controls.map((c) => c.title), ['Sprinklers']);
});

test('a snapshot carries the hazard\'s lifecycle phases and its safety reports on the platform', () => {
  let d = createPhase(assessed(), act, { id: 'ph1', name: 'Operation' });
  d = linkPhase(d, act, { hazardId: 'h1', phaseId: 'ph1' });
  d = createSafetyReport(d, act, { hazardId: 'h1', platformId: 'p1', date: '2026-03-04', reportType: 'Near miss', summary: 'Rotor <strike>', location: 'Hangar', parties: 'Crew' });
  d = assignHazardNumbers(createSafetyReport(d, act, { hazardId: 'h1', platformId: 'p2', summary: 'Elsewhere' }));
  const row = buildSnapshot(d, 'p1', opts).rows[0];
  assert.deepEqual(row.phases, ['Operation']);
  assert.deepEqual(row.safetyReports, [{ number: 'HAZ-001-A-1', date: '2026-03-04', type: 'Near miss', summary: 'Rotor <strike>', description: '', location: 'Hangar', parties: 'Crew' }]);
});

test('a snapshot carries capability like the other receptors', () => {
  const d = setAssessment(assessed(), act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', receptor: 'capability', likelihood: 'D', consequence: 2, consequenceWhy: 'Mission <lost>' });
  const row = buildSnapshot(d, 'p1', opts).rows[0];
  assert.deepEqual(row.ratings.initialCapability, { consequence: 2, likelihood: 'D' });
  assert.equal(row.assessments.length, 6);
  assert.deepEqual(row.assessments[2], { stage: 'initial', receptor: 'capability', likelihood: 'D', likelihoodWhy: '', consequence: 2, consequenceWhy: 'Mission <lost>', level: '2D = Medium' });
});
