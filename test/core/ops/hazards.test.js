import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, put, created } from '../../../src/core/data.js';
import { entries } from '../../../src/core/history.js';
import { ids } from '../../../src/core/ids.js';
import {
  createHazard, updateHazard, retireHazard, deleteHazard, restoreRecord, assignHazardNumbers,
  addCausalFactor, updateCausalFactor, deleteCausalFactor, addConsequence,
  moveCausalFactor, moveConsequence, addFailureMode, moveFailureMode,
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

/** A hazard on platforms p1 and p2. */
function onTwo() {
  let d = createHazard(emptyData(), act, { id: 'h1', title: 'Fire' });
  for (const p of ['p1', 'p2']) {
    d = put(d, 'platform', created(act, p, { name: p, ownerId: 'u1' }));
    d = put(d, 'hazardPlatform', created(act, ids.hazardPlatform('h1', p), { hazardId: 'h1', platformId: p, reportId: null }));
  }
  return d;
}

test('a consequence moves to another place; the order is kept in seq, and one move is one history entry', async () => {
  const { childrenOf } = await import('../../../src/core/queries.js');
  let d = addConsequence(onTwo(), act, { hazardId: 'h1', pick: ['A', 'B', 'C'] });
  const [a, , c] = childrenOf(d, 'consequence', 'h1');
  const n = entries(d).length;
  d = moveConsequence(d, later, { id: c.id, to: '0' });
  assert.deepEqual(childrenOf(d, 'consequence', 'h1').map((r) => r.text), ['C', 'A', 'B']);
  assert.equal(entries(d).length, n + 1);
  assert.equal(entries(d).at(-1).action, 'Move consequence');
  assert.equal(moveConsequence(d, later, { id: c.id, to: 0 }), d, 'where it is already: nothing written');
  assert.throws(() => moveConsequence(d, later, { id: a.id, to: 3 }), code('move'));
});

test('a causal factor moves among those shown on a platform; those on other platforms alone keep their places', async () => {
  const { causalFactorsOn } = await import('../../../src/core/queries.js');
  let d = addCausalFactor(onTwo(), act, { hazardId: 'h1', text: 'All1' });
  d = addCausalFactor(d, act, { hazardId: 'h1', text: 'P2only', platformId: 'p2' });
  d = addCausalFactor(d, act, { hazardId: 'h1', text: 'P1a', platformId: 'p1' });
  d = addCausalFactor(d, act, { hazardId: 'h1', text: 'P1b', platformId: 'p1' });
  const p1b = causalFactorsOn(d, 'h1', 'p1').at(-1);
  d = moveCausalFactor(d, later, { id: p1b.id, to: '0', platformId: 'p1' });
  assert.deepEqual(causalFactorsOn(d, 'h1', 'p1').map((r) => r.text), ['P1b', 'All1', 'P1a']);
  // All1 is every platform's, so moving it on p1 moves it on p2 too.
  assert.deepEqual(causalFactorsOn(d, 'h1', 'p2').map((r) => r.text), ['P2only', 'All1']);
  assert.deepEqual(causalFactorsOn(d, 'h1').map((r) => r.text), ['P1b', 'P2only', 'All1', 'P1a']);
});

test('an element failure mode moves within its platform list', async () => {
  const { platformListOn } = await import('../../../src/core/queries.js');
  let d = addFailureMode(onTwo(), act, { hazardId: 'h1', platformId: 'p1', pick: ['X', 'Y', 'Z'] });
  d = addFailureMode(d, act, { hazardId: 'h1', platformId: 'p2', text: 'Other' });
  const [x] = platformListOn(d, 'failureMode', 'h1', 'p1');
  d = moveFailureMode(d, later, { id: x.id, to: '2' });
  assert.deepEqual(platformListOn(d, 'failureMode', 'h1', 'p1').map((r) => r.text), ['Y', 'Z', 'X']);
  assert.deepEqual(platformListOn(d, 'failureMode', 'h1', 'p2').map((r) => r.text), ['Other']);
});
