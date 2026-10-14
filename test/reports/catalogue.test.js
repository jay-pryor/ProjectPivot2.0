import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot } from '../../src/reports/snapshot.js';
import { renumbered } from '../../src/reports/docgen-host.js';
import { catalogueFor } from '../../src/reports/catalogue.js';
import { assignHazardNumbers } from '../../src/core/ops/hazards.js';
import { confirmControl, excludeControl, setRating, setAssessment } from '../../src/core/ops/assessment.js';
import { createSafetyReport } from '../../src/core/ops/safety-reports.js';
import { createReference, linkReference } from '../../src/core/ops/references.js';
import { act, seed } from '../helpers.js';
import * as D from '../../DocGen/doc-data.js';

const opts = { profileName: (id) => id, at: '2026-09-28T15:00:00+10:00', by: 'u1', title: 'T', classification: 'OFFICIAL' };

function snapshot() {
  let d = assignHazardNumbers(seed());
  d = confirmControl(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1' });
  d = excludeControl(d, act, { hazardId: 'h1', controlId: 'c2', platformId: 'p1', reason: 'No crew' });
  d = setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', consequence: 1, likelihood: 'C' });
  d = setAssessment(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', receptor: 'personnel', likelihoodWhy: 'Often', consequenceWhy: 'Burns' });
  d = createSafetyReport(d, act, { id: 'sr2', hazardId: 'h1', platformId: 'p1', date: '2026-03-04', summary: 'Second', description: 'later one' });
  d = createSafetyReport(d, act, { id: 'sr1', hazardId: 'h1', platformId: 'p1', date: '2026-01-02', summary: 'First', description: 'earlier one' });
  d = createReference(d, act, { id: 'r1', title: 'Safety case', url: 'https://x' });
  d = createReference(d, act, { id: 'r2', title: 'Platform only', url: 'https://y' });
  d = linkReference(d, act, { referenceId: 'r1', targetKind: 'hazard', targetId: 'h1' });
  d = linkReference(d, act, { referenceId: 'r2', targetKind: 'platform', targetId: 'p1' });
  return buildSnapshot(d, 'p1', opts);
}

test('unbound, the catalogue has its collections and no data', () => {
  const c = catalogueFor(null);
  assert.equal(c.root, 'platform');
  assert.equal(c.data, null);
  assert.deepEqual(Object.keys(c.collections), ['platform', 'hazard', 'control', 'assessment', 'safetyReport', 'reference']);
  assert.deepEqual(c.collections.platform.children, ['hazard', 'control', 'safetyReport', 'reference']);
  assert.deepEqual(c.collections.hazard.children, ['control', 'assessment', 'safetyReport', 'reference']);
  for (const [k, def] of Object.entries(c.collections)) {
    assert.ok(def.label && def.fields.length, k);
    for (const f of def.fields) assert.ok(['text', 'date', 'rating', 'list'].includes(f.type), `${k}.${f.id}`);
  }
});

test('bound, hazards are keyed by their record id, not their number', () => {
  const s = snapshot();
  const h = catalogueFor(s).data.children.hazard[0];
  assert.equal(h.key, 'h1');
  assert.equal(h.values.id, 'HAZ-001');
  const again = catalogueFor(renumbered(s, { registerHazards: false })).data.children.hazard[0];
  assert.equal(again.key, 'h1', 'renumbering changes what prints, not the key');
});

test('a hazard carries its fields, lists and ratings with sort keys', () => {
  const h = catalogueFor(snapshot()).data.children.hazard[0];
  assert.equal(h.values.title, 'Fire');
  assert.deepEqual(h.values.causalFactors, ['Hot works']);
  assert.deepEqual(h.values.initialPersonnel, { text: 'High (1C)', sort: 6 });
  assert.equal(typeof h.values.residualPersonnel.sort, 'number');
});

test('a hazard\'s children: its controls, assessments, safety reports and the references supporting it', () => {
  const h = catalogueFor(snapshot()).data.children.hazard[0];
  assert.deepEqual(h.children.control.map((c) => [c.key, c.values.id, c.values.status]), [['c1', 'C-001', 'Implemented'], ['c2', 'C-002', 'Rejected']]);
  assert.equal(h.children.control[1].values.reason, 'No crew');
  const a = h.children.assessment.find((x) => x.key === 'initial:personnel');
  assert.deepEqual([a.values.stage, a.values.receptor, a.values.likelihoodWhy, a.values.consequenceWhy], ['Initial', 'Personnel', 'Often', 'Burns']);
  assert.deepEqual(h.children.safetyReport.map((r) => r.key), ['sr2', 'sr1']);
  assert.deepEqual(h.children.safetyReport[1].values.date, { text: '2026-01-02', sort: '2026-01-02' });
  assert.deepEqual(h.children.reference.map((r) => r.values.title), ['Safety case'], 'the platform-only reference is not this hazard\'s');
});

test('the platform holds every reference, and controls and safety reports gathered once', () => {
  const p = catalogueFor(snapshot()).data;
  assert.equal(p.values.name, 'Alpha');
  assert.deepEqual(p.children.reference.map((r) => r.values.title).sort(), ['Platform only', 'Safety case']);
  assert.deepEqual(p.children.control.map((c) => c.key), ['c1', 'c2']);
  assert.deepEqual(p.children.control[0].values.hazards, ['HAZ-001']);
  assert.deepEqual(p.children.safetyReport.map((r) => r.key).sort(), ['sr1', 'sr2']);
});

test('every field resolves against the catalogue: date-sorted safety report descriptions', () => {
  const c = catalogueFor(snapshot());
  const scope = D.rootScope(c.data).concat([{ coll: 'hazard', entry: c.data.children.hazard[0] }]);
  const res = D.resolveField(scope, D.parseFieldTag('f:safetyReport.description?sort=date'), c);
  assert.deepEqual(res, { kind: 'list', items: ['earlier one', 'later one'] });
});
