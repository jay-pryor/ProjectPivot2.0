import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { entries, historyOf } from '../../src/core/history.js';
import { checkRules } from '../../src/core/rules.js';
import { SAFETY_REPORT_TYPES, createSafetyReport, updateSafetyReport, deleteSafetyReport, moveSafetyReport } from '../../src/core/ops/safety-reports.js';
import { unlinkHazard, linkHazard, deletePlatform } from '../../src/core/ops/platforms.js';
import { deleteHazard } from '../../src/core/ops/hazards.js';
import { createPhase, linkPhase } from '../../src/core/ops/phases.js';
import { safetyReportsOn, platformsReached } from '../../src/core/queries.js';
import { act, later, seed } from '../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
const base = { hazardId: 'h1', platformId: 'p1' };
const two = () => {
  let d = createSafetyReport(seed(), act, { ...base, id: 'sr1', date: '2026-03-04', reportType: 'Near miss', summary: 'Rotor <b>strike</b>', location: 'Hangar 3', parties: 'Crew A' });
  return createSafetyReport(d, act, { ...base, id: 'sr2', date: '2026-05-01', summary: 'Fuel spill' });
};

test('a safety report records an event for a hazard on a platform', () => {
  assert.deepEqual(SAFETY_REPORT_TYPES, ['Occurrence', 'Near miss', 'Hazard report', 'Field Service Bulletin', 'Other']);
  let d = two();
  assert.equal(entries(d).at(-1).action, 'Add safety report');
  const r = d.records.safetyReport.sr1;
  assert.deepEqual([r.date, r.type, r.summary, r.description, r.location, r.parties], ['2026-03-04', 'Near miss', 'Rotor <b>strike</b>', '', 'Hangar 3', 'Crew A']);
  assert.equal(d.records.safetyReport.sr2.type, 'Occurrence', 'the default type');
  assert.deepEqual(safetyReportsOn(d, 'h1', 'p1').map((x) => x.id), ['sr2', 'sr1'], 'newest first');
  assert.deepEqual(safetyReportsOn(d, 'h1', 'p2'), []);
  assert.deepEqual(platformsReached(d, 'safetyReport', r), ['p1']);
  d = updateSafetyReport(d, later, { id: 'sr1', description: 'Blade tip hit a stand', date: '' });
  assert.deepEqual([d.records.safetyReport.sr1.description, d.records.safetyReport.sr1.date, d.records.safetyReport.sr1.summary], ['Blade tip hit a stand', null, 'Rotor <b>strike</b>']);
  assert.equal(entries(d).at(-1).action, 'Edit safety report');
  assert.deepEqual(safetyReportsOn(d, 'h1', 'p1').map((x) => x.id), ['sr2', 'sr1'], 'undated last');
  assert.throws(() => createSafetyReport(seed(), act, { ...base, summary: ' ' }), code('empty'));
  assert.throws(() => createSafetyReport(seed(), act, { ...base, summary: 'x', date: '2026-02-30' }), code('safetyReport.date'));
  assert.throws(() => createSafetyReport(seed(), act, { ...base, summary: 'x', reportType: 'Rumour' }), code('safetyReport.type'));
  assert.throws(() => createSafetyReport(seed(), act, { hazardId: 'h2', platformId: 'p1', summary: 'x' }), code('not-found'));
  d = deleteSafetyReport(d, act, { id: 'sr2' });
  assert.deepEqual(safetyReportsOn(d, 'h1', 'p1').map((x) => x.id), ['sr1']);
});

test('unlinking keeps safety reports and they show again on relinking; deleting the hazard or platform removes them', () => {
  let d = unlinkHazard(two(), later, { hazardId: 'h1', platformId: 'p1' });
  assert.equal(d.records.safetyReport.sr1.status, 'live');
  assert.deepEqual(checkRules(d), []);
  d = linkHazard(d, later, { hazardId: 'h1', platformId: 'p1' });
  assert.deepEqual(safetyReportsOn(d, 'h1', 'p1').map((x) => x.id), ['sr2', 'sr1']);
  let gone = unlinkHazard(two(), later, { hazardId: 'h1', platformId: 'p1' });
  gone = deletePlatform(gone, later, { id: 'p1' });
  assert.equal(gone.records.safetyReport.sr1.status, 'deleted');
  assert.deepEqual(checkRules(gone), []);
  let noHazard = unlinkHazard(two(), later, { hazardId: 'h1', platformId: 'p1' });
  noHazard = unlinkHazard(noHazard, later, { hazardId: 'h1', platformId: 'p2' });
  noHazard = deleteHazard(noHazard, later, { id: 'h1' });
  assert.equal(noHazard.records.safetyReport.sr2.status, 'deleted');
  assert.deepEqual(checkRules(noHazard), []);
});

test('a hazard\'s History includes its phase links and safety reports', () => {
  let d = createPhase(two(), act, { id: 'ph1', name: 'Operation' });
  d = linkPhase(d, act, { hazardId: 'h1', phaseId: 'ph1' });
  const actions = historyOf(d, 'hazard', 'h1').map((e) => e.action);
  assert.ok(actions.includes('Add safety report'));
  assert.ok(actions.includes('Add lifecycle phase'));
  assert.ok(!historyOf(d, 'hazard', 'h2').some((e) => e.action === 'Add safety report'));
});

test('a safety report moves to another platform the hazard is on, and both platforms see the move', () => {
  let d = createSafetyReport(seed(), act, { ...base, id: 'sr1', summary: 'Rotor strike' });
  d = moveSafetyReport(d, later, { id: 'sr1', platformId: 'p2' });
  assert.deepEqual(safetyReportsOn(d, 'h1', 'p1'), []);
  assert.deepEqual(safetyReportsOn(d, 'h1', 'p2').map((r) => r.id), ['sr1']);
  const e = entries(d).at(-1);
  assert.equal(e.action, 'Move safety report');
  assert.deepEqual(e.platforms, ['p1', 'p2'], 'both platforms see it');
  assert.equal(moveSafetyReport(d, later, { id: 'sr1', platformId: 'p2' }), d, 'already there: nothing recorded');
  assert.throws(() => moveSafetyReport(d, later, { id: 'sr1', platformId: 'nowhere' }), code('not-found'));
  assert.deepEqual(checkRules(d), []);
});
