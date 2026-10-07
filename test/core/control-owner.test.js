import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { KINDS } from '../../src/core/data.js';
import { ids } from '../../src/core/ids.js';
import { entries, historyOf } from '../../src/core/history.js';
import { checkRules } from '../../src/core/rules.js';
import { mergeData } from '../../src/core/merge.js';
import { setImplementedBy, IMPLEMENTERS, IMPLEMENTER_WORD, unlinkControl, deleteControl, removeControlHere, setControlKindOnPlatform } from '../../src/core/ops/controls.js';
import { unlinkHazard, deletePlatform } from '../../src/core/ops/platforms.js';
import { implementedByOf, implementedByText, controlOnPlatform, platformsReached, openItems } from '../../src/core/queries.js';
import { setControlStatus } from '../../src/core/ops/assessment.js';
import { act, later, seed } from '../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;

test('a control is implemented by someone on each platform: the OEM, HighCom or the customer', () => {
  assert.ok(KINDS.includes('implementer'));
  assert.equal(ids.implementer('c1', 'p1'), 'im:c1:p1');
  assert.deepEqual(IMPLEMENTERS, ['oem', 'highcom', 'customer']);
  assert.deepEqual(IMPLEMENTER_WORD, { oem: 'OEM', highcom: 'HighCom', customer: 'Customer' });
  assert.equal(implementedByOf(seed(), 'c1', 'p1'), null, 'not set');
  let d = setImplementedBy(seed(), act, { controlId: 'c1', platformId: 'p1', implementedBy: 'customer' });
  d = setImplementedBy(d, act, { controlId: 'c1', platformId: 'p2', implementedBy: 'oem' });
  assert.equal(entries(d).at(-1).action, 'Set implemented by');
  assert.deepEqual([implementedByOf(d, 'c1', 'p1'), implementedByOf(d, 'c1', 'p2')], ['customer', 'oem']);
  assert.deepEqual([implementedByText('customer'), implementedByText('oem'), implementedByText('highcom'), implementedByText(null)], ['Customer', 'OEM', 'HighCom', '']);
  d = setImplementedBy(d, act, { controlId: 'c1', platformId: 'p2', implementedBy: 'highcom' });
  assert.equal(implementedByOf(d, 'c1', 'p2'), 'highcom');
  d = setImplementedBy(d, act, { controlId: 'c1', platformId: 'p1', implementedBy: '' });
  assert.equal(implementedByOf(d, 'c1', 'p1'), null, 'back to not set');
  assert.equal(setImplementedBy(d, act, { controlId: 'c1', platformId: 'p1', implementedBy: '' }), d, 'already not set');
  assert.throws(() => setImplementedBy(seed(), act, { controlId: 'c1', platformId: 'p1', implementedBy: 'us' }), code('control.implementedBy'));
  assert.deepEqual(platformsReached(d, 'implementer', d.records.implementer['im:c1:p2']), ['p2']);
  assert.ok(historyOf(d, 'control', 'c1').some((e) => e.action === 'Set implemented by'), 'on the control\'s History');
});

test('a planned control HighCom implements is one of our controls to implement', () => {
  let d = setControlStatus(seed(), act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', status: 'planned' });
  const toDo = (x) => openItems(x, '2026-09-28', null).toImplement.map((i) => `${i.control.id}@${i.platform.id}`);
  assert.deepEqual(toDo(d), [], 'not set: nobody to do it');
  assert.deepEqual(toDo(setImplementedBy(d, act, { controlId: 'c1', platformId: 'p1', implementedBy: 'customer' })), []);
  assert.deepEqual(toDo(setImplementedBy(d, act, { controlId: 'c1', platformId: 'p1', implementedBy: 'highcom' })), ['c1@p1']);
});

test('a control on a platform lists each hazard there it is on for, with its kind and status there', () => {
  let d = setControlStatus(seed(), act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', status: 'planned' });
  d = setControlKindOnPlatform(d, act, { hazardId: 'h1', controlId: 'c2', platformId: 'p1', kind: 'preventative' });
  assert.deepEqual(controlOnPlatform(d, 'c1', 'p1').map((u) => [u.hazard.id, u.kind, u.state]), [['h1', 'preventative', 'planned']]);
  assert.deepEqual(controlOnPlatform(d, 'c2', 'p1').map((u) => [u.hazard.id, u.kind, u.state]), [['h1', 'preventative', 'recommended']], 'its kind on this platform');
  assert.deepEqual(controlOnPlatform(removeControlHere(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c1' }), 'c1', 'p1'), [], 'taken off the platform');
});

test('who implements it is kept when the control stops reaching a platform, and goes with the control or platform', () => {
  let d = setImplementedBy(seed(), act, { controlId: 'c1', platformId: 'p1', implementedBy: 'highcom' });
  d = unlinkHazard(d, act, { hazardId: 'h1', platformId: 'p1' });
  assert.equal(implementedByOf(d, 'c1', 'p1'), 'highcom');
  assert.deepEqual(checkRules(d), []);
  const gone = deletePlatform(d, act, { id: 'p1' });
  assert.equal(gone.records.implementer['im:c1:p1'].status, 'deleted');
  assert.deepEqual(checkRules(gone), []);
  let c = unlinkControl(d, act, { hazardId: 'h1', controlId: 'c1' });
  c = deleteControl(c, act, { id: 'c1' });
  assert.equal(c.records.implementer['im:c1:p1'].status, 'deleted');
  assert.deepEqual(checkRules(c), []);
});

test('two people setting who implements a control on different platforms both keep theirs', () => {
  const base = seed();
  const mine = setImplementedBy(base, act, { controlId: 'c1', platformId: 'p1', implementedBy: 'highcom' });
  const theirs = setImplementedBy(base, later, { controlId: 'c1', platformId: 'p2', implementedBy: 'customer' });
  const { data, conflicts } = mergeData(base, mine, theirs, { by: 'u1', at: '2026-09-28T13:00:00+10:00' });
  assert.deepEqual(conflicts, []);
  assert.deepEqual([implementedByOf(data, 'c1', 'p1'), implementedByOf(data, 'c1', 'p2')], ['highcom', 'customer']);
});
