import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImplementedBy, addControlHere, removeControlHere, createControlOn, unlinkControl, linkControl } from '../../src/core/ops/controls.js';
import { setControlStatus } from '../../src/core/ops/assessment.js';
import { checkRules } from '../../src/core/rules.js';
import { controlsOnPlatform, controlPlatforms, openItems, attentionItems, platformsReached, implementedByOf } from '../../src/core/queries.js';
import { seed, act, later } from '../helpers.js';

test('a control added on one platform is linked to its hazard there alone; taken off a platform it keeps its status for when it comes back', () => {
  let d = createControlOn(seed(), act, { id: 'n1', title: 'Guard', hazardId: 'h1', platformId: 'p2', kind: 'preventative' });
  assert.deepEqual(controlPlatforms(d, 'h1', 'n1'), ['p2']);
  assert.deepEqual(platformsReached(d, 'control', d.records.control.n1), ['p2']);
  d = addControlHere(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'n1' });
  assert.deepEqual(controlPlatforms(d, 'h1', 'n1'), ['p1', 'p2'], 'added on the other too');
  d = setControlStatus(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', status: 'planned' });
  d = removeControlHere(d, later, { hazardId: 'h1', platformId: 'p1', controlId: 'c1' });
  assert.equal(controlsOnPlatform(d, 'h1', 'p1').some((c) => c.control.id === 'c1'), false);
  assert.deepEqual(controlPlatforms(d, 'h1', 'c1'), ['p2'], 'still linked, on the other platform');
  d = addControlHere(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c1' });
  assert.equal(controlsOnPlatform(d, 'h1', 'p1').find((c) => c.control.id === 'c1')?.state, 'planned', 'its status there kept');
  assert.equal(addControlHere(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c1' }), d, 'already on: no change');
  // Unlinked from the hazard and linked again, it is on every platform afresh.
  d = removeControlHere(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c1' });
  d = unlinkControl(d, act, { hazardId: 'h1', controlId: 'c1' });
  d = linkControl(d, act, { hazardId: 'h1', controlId: 'c1', kind: 'preventative' });
  assert.deepEqual(controlPlatforms(d, 'h1', 'c1'), ['p1', 'p2']);
  assert.deepEqual(checkRules(d), []);
});

test('implemented by is OEM, HighCom or the customer; HighCom\'s planned controls are open items', () => {
  let d = setImplementedBy(seed(), act, { controlId: 'c1', platformId: 'p1', implementedBy: 'highcom' });
  d = setControlStatus(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', status: 'planned' });
  d = setImplementedBy(d, act, { controlId: 'c2', platformId: 'p1', implementedBy: 'oem' });
  d = setControlStatus(d, act, { hazardId: 'h1', controlId: 'c2', platformId: 'p1', status: 'planned' });
  assert.throws(() => setImplementedBy(d, act, { controlId: 'c1', platformId: 'p1', implementedBy: 'us' }), /implemented by OEM, HighCom, Customer/);
  const o = openItems(d, '2026-09-28', 'u1');
  assert.deepEqual(o.toImplement.map((x) => x.control.id), ['c1'], 'planned by the OEM is theirs to do');
  assert.ok(attentionItems(o).some((x) => x.type === 'implement'));
  d = setImplementedBy(d, act, { controlId: 'c1', platformId: 'p1', implementedBy: '' });
  assert.equal(implementedByOf(d, 'c1', 'p1'), null);
});
