import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { KINDS } from '../../src/core/data.js';
import { ids } from '../../src/core/ids.js';
import { entries, historyOf } from '../../src/core/history.js';
import { checkRules } from '../../src/core/rules.js';
import { mergeData } from '../../src/core/merge.js';
import { setControlOwner, OWNERS, linkExistingControl, unlinkControl, deleteControl, linkControl } from '../../src/core/ops/controls.js';
import { unlinkHazard, deletePlatform } from '../../src/core/ops/platforms.js';
import { controlOwner, ownerText, controlOnPlatform, platformsReached } from '../../src/core/queries.js';
import { setControlStatus } from '../../src/core/ops/assessment.js';
import { act, later, seed, asExisting } from '../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;

test('a control has an owner on each platform: us, the customer, or another named party', () => {
  assert.ok(KINDS.includes('controlPlatform'));
  assert.equal(ids.controlPlatform('c1', 'p1'), 'cp:c1:p1');
  assert.deepEqual(OWNERS, ['us', 'customer', 'other']);
  assert.equal(controlOwner(seed(), 'c1', 'p1'), null, 'not set');
  let d = setControlOwner(seed(), act, { controlId: 'c1', platformId: 'p1', owner: 'customer' });
  d = setControlOwner(d, act, { controlId: 'c1', platformId: 'p2', owner: 'other', ownerName: '  Acme Fire  ' });
  assert.equal(entries(d).at(-1).action, 'Set control owner');
  assert.deepEqual(controlOwner(d, 'c1', 'p1'), { owner: 'customer', ownerName: '' });
  assert.deepEqual(controlOwner(d, 'c1', 'p2'), { owner: 'other', ownerName: 'Acme Fire' });
  assert.deepEqual([ownerText(controlOwner(d, 'c1', 'p1')), ownerText(controlOwner(d, 'c1', 'p2')), ownerText(null)], ['Customer', 'Acme Fire', '']);
  d = setControlOwner(d, act, { controlId: 'c1', platformId: 'p2', ownerName: 'Acme Fire Ltd' });
  assert.deepEqual(controlOwner(d, 'c1', 'p2'), { owner: 'other', ownerName: 'Acme Fire Ltd' }, 'a name alone keeps the choice');
  d = setControlOwner(d, act, { controlId: 'c1', platformId: 'p2', owner: 'us' });
  assert.deepEqual(controlOwner(d, 'c1', 'p2'), { owner: 'us', ownerName: '' });
  d = setControlOwner(d, act, { controlId: 'c1', platformId: 'p1', owner: '' });
  assert.equal(controlOwner(d, 'c1', 'p1'), null, 'back to not set');
  assert.throws(() => setControlOwner(seed(), act, { controlId: 'c1', platformId: 'p1', owner: 'nobody' }), code('control.owner'));
  assert.deepEqual(platformsReached(d, 'controlPlatform', d.records.controlPlatform['cp:c1:p2']), ['p2']);
  assert.ok(historyOf(d, 'control', 'c1').some((e) => e.action === 'Set control owner'), 'on the control\'s History');
});

test('a control on a platform lists each hazard there that uses it, as an additional or an existing control', () => {
  let d = setControlStatus(seed(), act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', status: 'planned' });
  d = linkExistingControl(asExisting(d, 'c2'), act, { hazardId: 'h1', platformId: 'p1', controlId: 'c2', kind: 'mitigating' });
  assert.deepEqual(controlOnPlatform(d, 'c1', 'p1').map((u) => [u.hazard.id, u.role, u.state]), [['h1', 'additional', 'planned']]);
  assert.deepEqual(controlOnPlatform(d, 'c2', 'p1').map((u) => [u.hazard.id, u.role, u.kind]), [['h1', 'additional', 'mitigating'], ['h1', 'existing', 'mitigating']]);
});

test('the owner is kept when the control stops reaching a platform, and goes with the control or platform', () => {
  let d = setControlOwner(seed(), act, { controlId: 'c1', platformId: 'p1', owner: 'us' });
  d = unlinkHazard(d, act, { hazardId: 'h1', platformId: 'p1' });
  assert.deepEqual(controlOwner(d, 'c1', 'p1'), { owner: 'us', ownerName: '' });
  assert.deepEqual(checkRules(d), []);
  let gone = deletePlatform(d, act, { id: 'p1' });
  assert.equal(gone.records.controlPlatform['cp:c1:p1'].status, 'deleted');
  assert.deepEqual(checkRules(gone), []);
  let c = unlinkControl(d, act, { hazardId: 'h1', controlId: 'c1' });
  c = deleteControl(c, act, { id: 'c1' });
  assert.equal(c.records.controlPlatform['cp:c1:p1'].status, 'deleted');
  assert.deepEqual(checkRules(c), []);
});

test('two people setting the owner of a control on different platforms both keep theirs', () => {
  const base = seed();
  const mine = setControlOwner(base, act, { controlId: 'c1', platformId: 'p1', owner: 'us' });
  const theirs = setControlOwner(base, later, { controlId: 'c1', platformId: 'p2', owner: 'customer' });
  const { data, conflicts } = mergeData(base, mine, theirs, { by: 'u1', at: '2026-09-28T13:00:00+10:00' });
  assert.deepEqual(conflicts, []);
  assert.deepEqual([controlOwner(data, 'c1', 'p1').owner, controlOwner(data, 'c1', 'p2').owner], ['us', 'customer']);
});
