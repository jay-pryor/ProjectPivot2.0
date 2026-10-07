import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { entries } from '../../src/core/history.js';
import { checkRules } from '../../src/core/rules.js';
import { mergeData } from '../../src/core/merge.js';
import { createControl, retireControl, deleteControl, addControlHere, removeControlHere, createControlOn, unlinkControl, linkControl } from '../../src/core/ops/controls.js';
import { setControlStatus } from '../../src/core/ops/assessment.js';
import { unlinkHazard, linkHazard } from '../../src/core/ops/platforms.js';
import { controlsOnPlatform, controlPlatforms, controlOff, openItems, platformsReached } from '../../src/core/queries.js';
import { act, later, seed } from '../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
const on = (d, p = 'p1') => controlsOnPlatform(d, 'h1', p).map((x) => x.control.id);

test('a control added on one platform is linked to the hazard there alone; adding it on another puts it there too', () => {
  let d = createControl(seed(), act, { id: 'c9', title: 'Hot work permit' });
  d = addControlHere(d, act, { hazardId: 'h1', platformId: 'p2', controlId: 'c9', kind: 'mitigating' });
  assert.equal(entries(d).at(-1).action, 'Add control to platform');
  assert.equal(d.records.hazardControl['hc:h1:c9'].kind, 'mitigating');
  assert.ok(on(d, 'p2').includes('c9'));
  assert.ok(!on(d, 'p1').includes('c9'), 'taken off Alpha, where it was not added');
  assert.ok(controlOff(d, 'h1', 'c9', 'p1'));
  assert.deepEqual(controlPlatforms(d, 'h1', 'c9'), ['p2']);
  assert.deepEqual(platformsReached(d, 'control', d.records.control.c9), ['p2']);
  d = addControlHere(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c9' });
  assert.deepEqual(controlPlatforms(d, 'h1', 'c9'), ['p1', 'p2']);
  assert.equal(addControlHere(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c9' }), d, 'already there: no change');
  assert.throws(() => addControlHere(d, act, { hazardId: 'h2', platformId: 'p1', controlId: 'c9' }), code('not-found'), 'Flood is on no platform');
  d = createControl(d, act, { id: 'c8', title: 'Guard' });
  assert.throws(() => addControlHere(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c8', kind: 'sideways' }), code('control.kind'));
  assert.deepEqual(checkRules(d), []);
});

test('taking a control off a platform hides it there (statuses, open items, reach) and keeps its status for when it is added back', () => {
  let d = setControlStatus(seed(), act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', status: 'planned' });
  d = removeControlHere(d, later, { hazardId: 'h1', platformId: 'p1', controlId: 'c1' });
  assert.equal(entries(d).at(-1).action, 'Remove control from platform');
  assert.deepEqual(on(d, 'p1'), ['c2']);
  assert.deepEqual(on(d, 'p2').sort(), ['c1', 'c2'], 'still on Bravo');
  assert.deepEqual(controlPlatforms(d, 'h1', 'c1'), ['p2']);
  assert.ok(!openItems(d, '2026-09-28', null).awaiting.some((x) => x.platform.id === 'p1' && x.control.id === 'c1'));
  assert.equal(removeControlHere(d, later, { hazardId: 'h1', platformId: 'p1', controlId: 'c1' }), d, 'already off');
  d = addControlHere(d, later, { hazardId: 'h1', platformId: 'p1', controlId: 'c1' });
  assert.equal(controlsOnPlatform(d, 'h1', 'p1').find((x) => x.control.id === 'c1').state, 'planned', 'its status kept');
  assert.deepEqual(checkRules(d), []);
});

test('a new control made where it is needed is created and added on that platform alone', () => {
  const d = createControlOn(seed(), act, { id: 'c9', title: 'Spark arrestor', hazardId: 'h1', platformId: 'p1', kind: 'preventative' });
  assert.equal(d.records.control.c9.title, 'Spark arrestor');
  assert.equal(d.records.control.c9.number, null, 'numbered C-… at save');
  assert.deepEqual(controlPlatforms(d, 'h1', 'c9'), ['p1']);
});

test('a control in use cannot be deleted; retired, it stays where it is but cannot be newly added', () => {
  let d = createControl(seed(), act, { id: 'c9', title: 'Hot work permit' });
  d = addControlHere(d, act, { hazardId: 'h1', platformId: 'p2', controlId: 'c9' });
  assert.throws(() => deleteControl(d, act, { id: 'c9' }), code('control.in-use'));
  d = retireControl(d, act, { id: 'c9' });
  assert.ok(on(d, 'p2').includes('c9'));
  assert.throws(() => addControlHere(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c9' }), code('control.retired'));
});

test('unlinking from the hazard clears it on every platform; linking back puts it on all of them', () => {
  let d = createControl(seed(), act, { id: 'c9', title: 'Hot work permit' });
  d = addControlHere(d, act, { hazardId: 'h1', platformId: 'p2', controlId: 'c9' });
  d = setControlStatus(d, act, { hazardId: 'h1', controlId: 'c9', platformId: 'p2', status: 'implemented' });
  d = unlinkControl(d, act, { hazardId: 'h1', controlId: 'c9' });
  assert.equal(d.records.controlOn['on:h1:c9:p1'].status, 'deleted');
  assert.equal(d.records.ruling['ru:h1:c9:p2'].status, 'deleted');
  assert.ok(!on(d, 'p2').includes('c9'));
  d = linkControl(d, act, { hazardId: 'h1', controlId: 'c9', kind: 'preventative' });
  assert.deepEqual(controlPlatforms(d, 'h1', 'c9'), ['p1', 'p2']);
  assert.equal(controlsOnPlatform(d, 'h1', 'p2').find((x) => x.control.id === 'c9').state, 'recommended');
  assert.deepEqual(checkRules(d), []);
});

test('taking the hazard off a platform clears what was kept there; linking it back, its controls start Recommended', () => {
  let d = removeControlHere(seed(), act, { hazardId: 'h1', platformId: 'p1', controlId: 'c1' });
  d = unlinkHazard(d, later, { hazardId: 'h1', platformId: 'p1' });
  assert.equal(d.records.controlOn['on:h1:c1:p1'].status, 'deleted');
  assert.deepEqual(checkRules(d), []);
  d = linkHazard(d, later, { hazardId: 'h1', platformId: 'p1' });
  assert.deepEqual(on(d).sort(), ['c1', 'c2']);
});

test('two people adding different controls to the same hazard on a platform both keep theirs', () => {
  let base = createControl(seed(), act, { id: 'c8', title: 'Guard' });
  base = createControl(base, act, { id: 'c9', title: 'Permit' });
  const mine = addControlHere(base, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c8' });
  const theirs = addControlHere(base, later, { hazardId: 'h1', platformId: 'p1', controlId: 'c9', kind: 'mitigating' });
  const { data, conflicts } = mergeData(base, mine, theirs, { by: 'u1', at: '2026-09-28T13:00:00+10:00' });
  assert.deepEqual(conflicts, []);
  assert.ok(on(data).includes('c8') && on(data).includes('c9'));
  assert.ok(!on(data, 'p2').includes('c8') && !on(data, 'p2').includes('c9'));
});
