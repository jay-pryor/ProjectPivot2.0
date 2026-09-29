import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { KINDS, put, created } from '../../src/core/data.js';
import { ids } from '../../src/core/ids.js';
import { entries } from '../../src/core/history.js';
import { checkRules } from '../../src/core/rules.js';
import { mergeData } from '../../src/core/merge.js';
import { createPhase, renamePhase, retirePhase, deletePhase, linkPhase, unlinkPhase } from '../../src/core/ops/phases.js';
import { restoreRecord, deleteHazard } from '../../src/core/ops/hazards.js';
import { unlinkHazard } from '../../src/core/ops/platforms.js';
import { listPhases, phasesOf, phaseUsage, platformsReached } from '../../src/core/queries.js';
import { act, later, seed } from '../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
const withPhases = () => {
  let d = createPhase(seed(), act, { id: 'ph1', name: 'Design' });
  d = createPhase(d, act, { id: 'ph2', name: 'Operation' });
  return d;
};
const names = (d, h = 'h1') => phasesOf(d, h).map((x) => x.phase.name);

test('phases are a managed list: named, unique, renamed, retired, restored, deleted when unused', () => {
  assert.ok(['phase', 'hazardPhase', 'safetyReport'].every((k) => KINDS.includes(k)));
  assert.equal(ids.hazardPhase('h1', 'ph1'), 'hph:h1:ph1');
  let d = withPhases();
  assert.deepEqual(listPhases(d).map((p) => p.name), ['Design', 'Operation']);
  assert.equal(entries(d).at(-1).action, 'Create phase');
  assert.throws(() => createPhase(d, act, { name: ' design ' }), code('phase.duplicate'));
  assert.throws(() => createPhase(d, act, { name: ' ' }), code('empty'));
  d = renamePhase(d, act, { id: 'ph2', name: 'In service' });
  assert.equal(d.records.phase.ph2.name, 'In service');
  assert.throws(() => renamePhase(d, act, { id: 'ph2', name: 'DESIGN' }), code('phase.duplicate'));
  d = retirePhase(d, act, { id: 'ph2' });
  assert.equal(d.records.phase.ph2.status, 'retired');
  d = restoreRecord(d, act, { kind: 'phase', id: 'ph2' });
  assert.equal(d.records.phase.ph2.status, 'live');
  d = deletePhase(d, act, { id: 'ph1' });
  assert.deepEqual(listPhases(d).map((p) => p.id), ['ph2']);
  d = createPhase(d, act, { name: 'Design' });
  assert.equal(listPhases(d).length, 2, 'a deleted name can be used again');
});

test('a hazard ticks phases; a retired phase stays on it but cannot be newly ticked; a phase in use cannot be deleted', () => {
  let d = linkPhase(withPhases(), act, { hazardId: 'h1', phaseId: 'ph2' });
  d = linkPhase(d, act, { hazardId: 'h1', phaseId: 'ph1' });
  assert.equal(entries(d).at(-1).action, 'Add lifecycle phase');
  assert.deepEqual(names(d), ['Design', 'Operation'], 'in the list\'s order');
  assert.deepEqual(phaseUsage(d, 'ph1').map((h) => h.id), ['h1']);
  assert.deepEqual(platformsReached(d, 'hazardPhase', d.records.hazardPhase['hph:h1:ph1']), ['p1', 'p2']);
  assert.deepEqual(platformsReached(d, 'phase', d.records.phase.ph1), ['p1', 'p2']);
  assert.throws(() => deletePhase(d, act, { id: 'ph1' }), code('phase.in-use'));
  d = retirePhase(d, act, { id: 'ph1' });
  assert.deepEqual(names(d), ['Design', 'Operation']);
  assert.throws(() => linkPhase(d, act, { hazardId: 'h2', phaseId: 'ph1' }), code('phase.retired'));
  d = unlinkPhase(d, act, { hazardId: 'h1', phaseId: 'ph2' });
  assert.equal(entries(d).at(-1).action, 'Remove lifecycle phase');
  assert.deepEqual(names(d), ['Design']);
  assert.deepEqual(checkRules(d), []);
});

test('deleting a hazard removes its phase links; a link to a deleted phase breaks a rule', () => {
  let d = linkPhase(withPhases(), act, { hazardId: 'h2', phaseId: 'ph1' });
  d = deleteHazard(d, act, { id: 'h2' });
  assert.equal(d.records.hazardPhase['hph:h2:ph1'].status, 'deleted');
  assert.deepEqual(checkRules(d), []);
  const bad = put(withPhases(), 'hazardPhase', created(act, 'hph:h1:gone', { hazardId: 'h1', phaseId: 'gone' }));
  assert.deepEqual(checkRules(bad).map((v) => v.rule), ['hazardPhase-phase-deleted']);
});

test('one person deletes an unused phase while another ticks it: the merge settles', () => {
  const base = withPhases();
  const mine = deletePhase(base, act, { id: 'ph1' });
  const theirs = linkPhase(base, later, { hazardId: 'h1', phaseId: 'ph1' });
  const { data } = mergeData(base, mine, theirs, { by: 'u1', at: '2026-09-28T13:00:00+10:00' });
  assert.deepEqual(checkRules(data), []);
});
