import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, put, created } from '../../../src/core/data.js';
import { ids } from '../../../src/core/ids.js';
import { createHazard } from '../../../src/core/ops/hazards.js';
import {
  createControl, updateControl, retireControl, deleteControl, linkControl, setControlKind, unlinkControl,
} from '../../../src/core/ops/controls.js';

const act = { by: 'u1', at: '2026-09-28T10:00:00+10:00' };
const later = { by: 'u2', at: '2026-09-28T11:00:00+10:00' };
const code = (c) => (e) => e.code === c;

function base() {
  let d = createHazard(emptyData(), act, { id: 'h1', title: 'Fire' });
  d = createControl(d, act, { id: 'c1', title: ' Sprinklers ', description: 'wet pipe' });
  return d;
}

test('createControl stores one library control with no hazard, platform or kind', () => {
  const c = base().records.control.c1;
  assert.equal(c.title, 'Sprinklers');
  assert.equal(c.description, 'wet pipe');
  assert.equal('kind' in c, false);
  assert.equal('hazardId' in c, false);
});

test('updateControl renames; blank refused', () => {
  const d = updateControl(base(), later, { id: 'c1', title: 'Deluge' });
  assert.equal(d.records.control.c1.title, 'Deluge');
  assert.throws(() => updateControl(d, later, { id: 'c1', title: ' ' }), code('empty'));
});

test('linkControl links as preventative or mitigating, one link id per pair, and relinking revives it', () => {
  let d = linkControl(base(), act, { hazardId: 'h1', controlId: 'c1', kind: 'preventative' });
  const id = ids.hazardControl('h1', 'c1');
  assert.equal(d.records.hazardControl[id].kind, 'preventative');
  assert.throws(() => linkControl(base(), act, { hazardId: 'h1', controlId: 'c1', kind: 'both' }), code('control.kind'));
  d = setControlKind(d, later, { hazardId: 'h1', controlId: 'c1', kind: 'mitigating' });
  assert.equal(d.records.hazardControl[id].kind, 'mitigating');
  d = unlinkControl(d, later, { hazardId: 'h1', controlId: 'c1' });
  assert.equal(d.records.hazardControl[id].status, 'deleted');
  d = linkControl(d, later, { hazardId: 'h1', controlId: 'c1', kind: 'preventative' });
  assert.equal(d.records.hazardControl[id].status, 'live');
  assert.equal(d.records.hazardControl[id].createdBy, 'u1', 'the same record, revived');
});

test('unlinking a control from a hazard deletes its rulings for that hazard on every platform', () => {
  let d = linkControl(base(), act, { hazardId: 'h1', controlId: 'c1', kind: 'preventative' });
  for (const p of ['p1', 'p2']) {
    d = put(d, 'ruling', created(act, ids.ruling('h1', 'c1', p), { hazardId: 'h1', controlId: 'c1', platformId: p, state: 'confirmed', reason: '' }));
  }
  d = unlinkControl(d, later, { hazardId: 'h1', controlId: 'c1' });
  assert.equal(d.records.ruling['ru:h1:c1:p1'].status, 'deleted');
  assert.equal(d.records.ruling['ru:h1:c1:p2'].status, 'deleted');
});

test('a control linked to a hazard cannot be deleted; retiring it keeps its links', () => {
  let d = linkControl(base(), act, { hazardId: 'h1', controlId: 'c1', kind: 'preventative' });
  assert.throws(() => deleteControl(d, later, { id: 'c1' }), (e) => e.code === 'control.in-use' && e.details.hazardIds[0] === 'h1');
  d = retireControl(d, later, { id: 'c1' });
  assert.equal(d.records.control.c1.status, 'retired');
  assert.equal(d.records.hazardControl['hc:h1:c1'].status, 'live');
  assert.throws(() => linkControl(d, later, { hazardId: 'h1', controlId: 'c1', kind: 'mitigating' }), code('control.retired'));
});

test('an unlinked control can be deleted', () => {
  const d = deleteControl(base(), later, { id: 'c1' });
  assert.equal(d.records.control.c1.status, 'deleted');
});
