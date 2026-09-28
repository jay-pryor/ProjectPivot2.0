import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, put, created } from '../../../src/core/data.js';
import { entries } from '../../../src/core/history.js';
import { ids } from '../../../src/core/ids.js';
import {
  createHazard, updateHazard, retireHazard, deleteHazard, restoreRecord, assignHazardNumbers,
  addCausalFactor, updateCausalFactor, deleteCausalFactor, addConsequence,
} from '../../../src/core/ops/hazards.js';

const act = { by: 'u1', at: '2026-09-28T10:00:00+10:00' };
const later = { by: 'u2', at: '2026-09-28T11:00:00+10:00' };
const code = (c) => (e) => e.code === c;

test('createHazard stores the trimmed title with no number yet, and records it', () => {
  const d = createHazard(emptyData(), act, { id: 'h1', title: '  Fire  ', description: ' hot ' });
  assert.deepEqual(d.records.hazard.h1, { ...created(act, 'h1', {}), number: null, title: 'Fire', description: 'hot' });
  assert.equal(entries(d)[0].action, 'Create hazard');
  assert.throws(() => createHazard(emptyData(), act, { title: '  ' }), code('empty'));
});

test('updateHazard changes only what is given; the same title writes nothing', () => {
  const d = createHazard(emptyData(), act, { id: 'h1', title: 'Fire', description: 'a' });
  const d2 = updateHazard(d, later, { id: 'h1', title: 'Big fire' });
  assert.equal(d2.records.hazard.h1.title, 'Big fire');
  assert.equal(d2.records.hazard.h1.description, 'a');
  assert.equal(d2.records.hazard.h1.updatedBy, 'u2');
  assert.equal(updateHazard(d, later, { id: 'h1', title: 'Fire' }), d);
});

test('a hazard on a platform cannot be retired or deleted; the refusal names the platforms', () => {
  let d = createHazard(emptyData(), act, { id: 'h1', title: 'Fire' });
  d = put(d, 'platform', created(act, 'p1', { name: 'Alpha', ownerId: 'u1' }));
  d = put(d, 'hazardPlatform', created(act, ids.hazardPlatform('h1', 'p1'), { hazardId: 'h1', platformId: 'p1', reportId: null }));
  for (const op of [retireHazard, deleteHazard]) {
    assert.throws(() => op(d, act, { id: 'h1' }), (e) => e.code === 'hazard.on-platforms' && /Alpha/.test(e.message) && e.details.platformIds[0] === 'p1');
  }
});

test('retire and restore', () => {
  const d = retireHazard(createHazard(emptyData(), act, { id: 'h1', title: 'Fire' }), act, { id: 'h1' });
  assert.equal(d.records.hazard.h1.status, 'retired');
  const back = restoreRecord(d, later, { kind: 'hazard', id: 'h1' });
  assert.equal(back.records.hazard.h1.status, 'live');
  assert.throws(() => restoreRecord(back, later, { kind: 'hazard', id: 'h1' }), code('not-retired'));
});

test('deleting a hazard deletes its causal factors, consequences and control links with it', () => {
  let d = createHazard(emptyData(), act, { id: 'h1', title: 'Fire' });
  d = addCausalFactor(d, act, { id: 'cf1', hazardId: 'h1', text: 'Hot works' });
  d = addConsequence(d, act, { id: 'cq1', hazardId: 'h1', text: 'Burns' });
  d = put(d, 'hazardControl', created(act, ids.hazardControl('h1', 'c1'), { hazardId: 'h1', controlId: 'c1', kind: 'preventative' }));
  d = deleteHazard(d, later, { id: 'h1' });
  assert.equal(d.records.hazard.h1.status, 'deleted');
  assert.equal(d.records.causalFactor.cf1.status, 'deleted');
  assert.equal(d.records.consequence.cq1.status, 'deleted');
  assert.equal(d.records.hazardControl['hc:h1:c1'].status, 'deleted');
  const last = entries(d).at(-1);
  assert.equal(last.action, 'Delete hazard');
  assert.equal(last.items.length, 4, 'one entry for the whole delete');
});

test('causal factors: add, edit, delete; blank text refused; a missing hazard refused', () => {
  let d = createHazard(emptyData(), act, { id: 'h1', title: 'Fire' });
  d = addCausalFactor(d, act, { id: 'cf1', hazardId: 'h1', text: ' Hot works ' });
  assert.equal(d.records.causalFactor.cf1.text, 'Hot works');
  d = updateCausalFactor(d, later, { id: 'cf1', text: 'Welding' });
  assert.equal(d.records.causalFactor.cf1.text, 'Welding');
  d = deleteCausalFactor(d, later, { id: 'cf1' });
  assert.equal(d.records.causalFactor.cf1.status, 'deleted');
  assert.throws(() => addCausalFactor(d, act, { hazardId: 'h1', text: ' ' }), code('empty'));
  assert.throws(() => addCausalFactor(d, act, { hazardId: 'nope', text: 'x' }), code('not-found'));
});

test('assignHazardNumbers numbers unnumbered hazards in creation order and never reuses a number', () => {
  let d = emptyData();
  d = createHazard(d, { by: 'u1', at: '2026-09-28T10:00:02+10:00' }, { id: 'b', title: 'B' });
  d = createHazard(d, { by: 'u1', at: '2026-09-28T10:00:01+10:00' }, { id: 'a', title: 'A' });
  d = createHazard(d, act, { id: 'gone', title: 'Gone' });
  d = deleteHazard(d, act, { id: 'gone' });
  const before = Object.keys(d.history).length;
  d = { ...d, nextHazardNumber: 41 };
  d = assignHazardNumbers(d);
  assert.equal(d.records.hazard.a.number, 41);
  assert.equal(d.records.hazard.b.number, 42);
  assert.equal(d.records.hazard.gone.number, null, 'a hazard deleted before its first save gets no number');
  assert.equal(d.nextHazardNumber, 43);
  assert.equal(Object.keys(d.history).length, before, 'numbering is not a user action');
  assert.equal(assignHazardNumbers(d), d, 'nothing to number: the same data back');
});
