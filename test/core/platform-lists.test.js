import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addSystemElement, updateSystemElement, deleteSystemElement, addAffectedGroup, addFailureMode } from '../../src/core/ops/hazards.js';
import { unlinkHazard } from '../../src/core/ops/platforms.js';
import { platformListOn, platformListEntries, platformsReached } from '../../src/core/queries.js';
import { checkRules } from '../../src/core/rules.js';
import { put } from '../../src/core/data.js';
import { PivotError } from '../../src/core/errors.js';
import { seed, act } from '../helpers.js';

const texts = (rs) => rs.map((r) => r.text);

test('a hazard\'s systems or elements are its own on each platform, in the order they were added', () => {
  let d = addSystemElement(seed(), act, { id: 's1', hazardId: 'h1', platformId: 'p1', text: '  Engine room ' });
  d = addSystemElement(d, act, { id: 's2', hazardId: 'h1', platformId: 'p1', text: 'Fuel system' });
  d = addSystemElement(d, act, { id: 's3', hazardId: 'h1', platformId: 'p2', text: 'engine room' });
  assert.deepEqual(texts(platformListOn(d, 'systemElement', 'h1', 'p1')), ['Engine room', 'Fuel system']);
  assert.deepEqual(texts(platformListOn(d, 'systemElement', 'h1', 'p2')), ['engine room']);
  assert.deepEqual(platformsReached(d, 'systemElement', d.records.systemElement.s1), ['p1']);
  assert.deepEqual(platformListEntries(d, 'systemElement'), ['Engine room', 'Fuel system'], 'suggested once each, whatever the case');
  assert.deepEqual(platformListEntries(d, 'affectedGroup'), [], 'each list suggests its own');
  assert.throws(() => addSystemElement(d, act, { hazardId: 'h1', platformId: 'p1', text: 'FUEL SYSTEM' }), (e) => e instanceof PivotError && e.code === 'duplicate');
  assert.throws(() => updateSystemElement(d, act, { id: 's2', text: 'engine ROOM' }), (e) => e instanceof PivotError && e.code === 'duplicate');
  assert.throws(() => addSystemElement(d, act, { hazardId: 'h2', platformId: 'p1', text: 'Hull' }), (e) => e instanceof PivotError && e.code === 'not-found', 'only where the hazard is');
  assert.throws(() => addSystemElement(d, act, { hazardId: 'h1', platformId: '', text: 'Hull' }), PivotError);
  d = updateSystemElement(d, act, { id: 's2', text: 'Fuel tanks' });
  d = deleteSystemElement(d, act, { id: 's1' });
  assert.deepEqual(texts(platformListOn(d, 'systemElement', 'h1', 'p1')), ['Fuel tanks']);
  assert.deepEqual(platformListEntries(d, 'systemElement'), ['engine room', 'Fuel tanks']);
});

test('affected groups go with the hazard when it leaves a platform, and the rules catch one left behind', () => {
  let d = addAffectedGroup(seed(), act, { id: 'g1', hazardId: 'h1', platformId: 'p1', text: 'Crew' });
  d = addAffectedGroup(d, act, { id: 'g2', hazardId: 'h1', platformId: 'p2', text: 'Passengers' });
  assert.deepEqual(checkRules(d), []);
  const left = put(d, 'hazardPlatform', { ...d.records.hazardPlatform['hp:h1:p1'], status: 'deleted' });
  assert.deepEqual(checkRules(left).map((v) => v.rule), ['affectedGroup-without-platform-link']);
  d = unlinkHazard(d, act, { hazardId: 'h1', platformId: 'p1' });
  assert.equal(d.records.affectedGroup.g1.status, 'deleted');
  assert.equal(d.records.affectedGroup.g2.status, 'live');
});

test('element failure modes are kept and suggested the same way, apart from the other lists', () => {
  let d = addFailureMode(seed(), act, { id: 'f1', hazardId: 'h1', platformId: 'p1', text: 'Seal rupture' });
  d = addFailureMode(d, act, { id: 'f2', hazardId: 'h1', platformId: 'p2', text: 'Pump seizure' });
  d = addSystemElement(d, act, { id: 's1', hazardId: 'h1', platformId: 'p1', text: 'Hydraulics' });
  assert.deepEqual(texts(platformListOn(d, 'failureMode', 'h1', 'p1')), ['Seal rupture']);
  assert.deepEqual(platformListEntries(d, 'failureMode'), ['Pump seizure', 'Seal rupture']);
  assert.throws(() => addFailureMode(d, act, { hazardId: 'h1', platformId: 'p1', text: 'seal rupture' }), (e) => e instanceof PivotError && e.code === 'duplicate');
  const left = put(d, 'hazardPlatform', { ...d.records.hazardPlatform['hp:h1:p2'], status: 'deleted' });
  assert.deepEqual(checkRules(left).map((v) => v.rule), ['failureMode-without-platform-link']);
  d = unlinkHazard(d, act, { hazardId: 'h1', platformId: 'p2' });
  assert.equal(d.records.failureMode.f2.status, 'deleted');
});

test('one Add puts in what is typed and every entry ticked, once each, in one change; nothing at all is refused', async () => {
  const { addCausalFactor } = await import('../../src/core/ops/hazards.js');
  let d = addSystemElement(seed(), act, { hazardId: 'h1', platformId: 'p1', text: 'Hull', pick: ['Engine room', 'hull', 'Fuel system'] });
  assert.deepEqual(texts(platformListOn(d, 'systemElement', 'h1', 'p1')), ['Hull', 'Engine room', 'Fuel system']);
  assert.equal(Object.values(d.history).at(-1).action, 'Add 3 systems or elements', 'one change');
  d = addSystemElement(d, act, { hazardId: 'h1', platformId: 'p2', text: '', pick: 'Hull' });
  assert.deepEqual(texts(platformListOn(d, 'systemElement', 'h1', 'p2')), ['Hull'], 'ticked alone, the box left empty');
  assert.throws(() => addSystemElement(d, act, { hazardId: 'h1', platformId: 'p1', text: '', pick: ['Galley', 'Hull'] }), (e) => e instanceof PivotError && e.code === 'duplicate', 'all or nothing');
  assert.equal(platformListOn(d, 'systemElement', 'h1', 'p1').length, 3);
  assert.throws(() => addSystemElement(d, act, { hazardId: 'h1', platformId: 'p1', text: '  ' }), PivotError);
  d = addCausalFactor(d, act, { hazardId: 'h1', platformId: 'p1', text: '', pick: ['Fuel leak', 'Static'] });
  assert.deepEqual(Object.values(d.records.causalFactor).filter((r) => r.platformId === 'p1').map((r) => [r.text, r.seq]), [['Fuel leak', 2], ['Static', 3]]);
});

test('a reference can be for a hazard\'s lifecycle phase or a platform\'s own entries; each link goes when what it supports goes', async () => {
  const { createReference, linkReference } = await import('../../src/core/ops/references.js');
  const { createPhase, linkPhase, unlinkPhase } = await import('../../src/core/ops/phases.js');
  const { addCausalFactor, deleteHazard } = await import('../../src/core/ops/hazards.js');
  const { hazardReferences } = await import('../../src/core/queries.js');
  let d = createReference(seed(), act, { id: 'r1', title: 'Manual', url: 'https://example.com/m' });
  d = createPhase(d, act, { id: 'ph1', name: 'Operation' });
  d = linkPhase(d, act, { hazardId: 'h1', phaseId: 'ph1' });
  d = addSystemElement(d, act, { id: 's1', hazardId: 'h1', platformId: 'p1', text: 'Engine room' });
  d = addCausalFactor(d, act, { id: 'cf9', hazardId: 'h1', platformId: 'p1', text: 'Fuel leak' });
  for (const [targetKind, targetId] of [['hazardPhase', 'hph:h1:ph1'], ['systemElement', 's1'], ['causalFactor', 'cf9']]) d = linkReference(d, act, { referenceId: 'r1', targetKind, targetId });
  const fors = (platformId) => hazardReferences(d, 'h1', platformId).map((x) => x.forText);
  assert.deepEqual(fors('p1'), ['Causal factor: Fuel leak', 'Lifecycle phase: Operation', 'System/Element: Engine room']);
  assert.deepEqual(fors('p2'), ['Lifecycle phase: Operation'], 'Alpha\'s own entries are not Bravo\'s');
  assert.deepEqual(fors(null), ['Causal factor: Fuel leak', 'Lifecycle phase: Operation'], 'the Overview: every causal factor, no per-platform lists');
  assert.deepEqual(checkRules(d), []);
  const live = (x) => Object.values(x.records.referenceLink).filter((l) => l.status === 'live').map((l) => l.targetKind).sort();
  assert.deepEqual(live(unlinkPhase(d, act, { hazardId: 'h1', phaseId: 'ph1' })), ['causalFactor', 'systemElement']);
  assert.deepEqual(live(deleteSystemElement(d, act, { id: 's1' })), ['causalFactor', 'hazardPhase']);
  const off = unlinkHazard(d, act, { hazardId: 'h1', platformId: 'p1' });
  assert.deepEqual(live(off), ['hazardPhase'], 'leaving the platform takes its own entries\' links');
  assert.deepEqual(checkRules(off), []);
  assert.deepEqual(live(deleteHazard(unlinkHazard(off, act, { hazardId: 'h1', platformId: 'p2' }), act, { id: 'h1' })), [], 'deleting the hazard takes the rest');
});
