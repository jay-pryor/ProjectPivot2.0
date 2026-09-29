import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { KINDS, put, created } from '../../src/core/data.js';
import { ids } from '../../src/core/ids.js';
import { entries } from '../../src/core/history.js';
import { checkRules } from '../../src/core/rules.js';
import { mergeData } from '../../src/core/merge.js';
import { createControl, updateControl, retireControl, deleteControl, linkExistingControl, unlinkExistingControl, setExistingControlKind } from '../../src/core/ops/controls.js';
import { unlinkHazard, linkHazard } from '../../src/core/ops/platforms.js';
import { existingControlsOn, existingUsage, platformsReached } from '../../src/core/queries.js';
import { act, later, seed } from '../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
const on = (d, p = 'p1') => existingControlsOn(d, 'h1', p).map((x) => x.control.id);

test('existing controls are chosen per hazard on a platform, listed by tier', () => {
  assert.ok(KINDS.includes('existingControl'));
  assert.equal(ids.existingControl('h1', 'p1', 'c1'), 'ec:h1:p1:c1');
  let d = updateControl(seed(), act, { id: 'c1', tier: 'Administrative' });
  d = updateControl(d, act, { id: 'c2', tier: 'Engineering' });
  d = linkExistingControl(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c1', kind: 'mitigating' });
  d = linkExistingControl(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c2', kind: 'preventative' });
  assert.equal(entries(d).at(-1).action, 'Link existing control');
  assert.deepEqual(on(d), ['c2', 'c1'], 'Engineering before Administrative');
  assert.deepEqual(on(d, 'p2'), [], 'another platform has its own');
  d = setExistingControlKind(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c1', kind: 'preventative' });
  assert.equal(existingControlsOn(d, 'h1', 'p1')[1].kind, 'preventative');
  assert.deepEqual(existingUsage(d, 'c1').map((u) => [u.hazard.id, u.platform.id, u.kind]), [['h1', 'p1', 'preventative']]);
  assert.deepEqual(platformsReached(d, 'existingControl', d.records.existingControl['ec:h1:p1:c1']), ['p1']);
  d = unlinkExistingControl(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c1' });
  assert.deepEqual(on(d), ['c2']);
  assert.throws(() => linkExistingControl(d, act, { hazardId: 'h2', platformId: 'p1', controlId: 'c1', kind: 'preventative' }), code('not-found'));
  assert.throws(() => linkExistingControl(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c1', kind: 'sideways' }), code('control.kind'));
});

test('a control used only as an existing control reaches that platform, cannot be deleted, and when retired stays listed but cannot be newly linked', () => {
  let d = createControl(seed(), act, { id: 'c9', title: 'Hot work permit' });
  d = linkExistingControl(d, act, { hazardId: 'h1', platformId: 'p2', controlId: 'c9', kind: 'preventative' });
  assert.deepEqual(platformsReached(d, 'control', d.records.control.c9), ['p2']);
  assert.throws(() => deleteControl(d, act, { id: 'c9' }), code('control.in-use'));
  d = retireControl(d, act, { id: 'c9' });
  assert.deepEqual(on(d, 'p2'), ['c9']);
  assert.throws(() => linkExistingControl(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c9', kind: 'preventative' }), code('control.retired'));
});

test('unlinking the hazard clears its existing controls there; linking back starts empty; the rules hold', () => {
  let d = linkExistingControl(seed(), act, { hazardId: 'h1', platformId: 'p1', controlId: 'c1', kind: 'preventative' });
  d = unlinkHazard(d, later, { hazardId: 'h1', platformId: 'p1' });
  assert.equal(d.records.existingControl['ec:h1:p1:c1'].status, 'deleted');
  assert.deepEqual(checkRules(d), []);
  d = linkHazard(d, later, { hazardId: 'h1', platformId: 'p1' });
  assert.deepEqual(on(d), []);
  const orphan = put(seed(), 'existingControl', created(act, 'ec:h2:p1:c1', { hazardId: 'h2', platformId: 'p1', controlId: 'c1', kind: 'preventative' }));
  assert.deepEqual(checkRules(orphan).map((v) => v.rule), ['existingControl-without-platform-link']);
});

test('two people adding different existing controls to the same hazard on a platform both keep theirs', () => {
  const base = seed();
  const mine = linkExistingControl(base, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c1', kind: 'preventative' });
  const theirs = linkExistingControl(base, later, { hazardId: 'h1', platformId: 'p1', controlId: 'c2', kind: 'mitigating' });
  const { data, conflicts } = mergeData(base, mine, theirs, { by: 'u1', at: '2026-09-28T13:00:00+10:00' });
  assert.deepEqual(conflicts, []);
  assert.deepEqual(on(data).sort(), ['c1', 'c2']);
});
