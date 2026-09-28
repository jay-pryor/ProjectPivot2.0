import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ids } from '../../../src/core/ids.js';
import { entries } from '../../../src/core/history.js';
import { confirmControl, excludeControl, resetControl, setRating } from '../../../src/core/ops/assessment.js';
import { act, later, seed } from '../../helpers.js';

const code = (c) => (e) => e.code === c;
const triple = { hazardId: 'h1', controlId: 'c1', platformId: 'p1' };

test('confirm records who and when; exclude needs a reason; each replaces the other; reset returns to awaiting', () => {
  let d = confirmControl(seed(), later, triple);
  const id = ids.ruling('h1', 'c1', 'p1');
  assert.equal(d.records.ruling[id].state, 'confirmed');
  assert.equal(d.records.ruling[id].updatedBy, 'u2');
  assert.throws(() => excludeControl(d, later, { ...triple, reason: '  ' }), code('empty'));
  d = excludeControl(d, act, { ...triple, reason: ' Not fitted on this hull ' });
  assert.equal(d.records.ruling[id].state, 'excluded');
  assert.equal(d.records.ruling[id].reason, 'Not fitted on this hull');
  d = confirmControl(d, later, triple);
  assert.equal(d.records.ruling[id].reason, '');
  d = resetControl(d, later, triple);
  assert.equal(d.records.ruling[id].status, 'deleted');
  assert.equal(resetControl(d, later, triple), d, 'resetting an awaiting control changes nothing');
});

test('a ruling needs both links: the control on the hazard and the hazard on the platform', () => {
  assert.throws(() => confirmControl(seed(), act, { hazardId: 'h2', controlId: 'c1', platformId: 'p1' }), code('not-found'));
  assert.throws(() => confirmControl(seed(), act, { hazardId: 'h1', controlId: 'c1', platformId: 'nope' }), code('not-found'));
});

test('a ruling on one platform reaches that platform only', () => {
  const d = confirmControl(seed(), act, triple);
  assert.deepEqual(entries(d).at(-1).platforms, ['p1']);
});

test('setRating stores each stage exactly as entered, form strings included', () => {
  let d = setRating(seed(), act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', consequence: '2', likelihood: 'C' });
  d = setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', consequence: 3, likelihood: 'D' });
  const r = d.records.rating[ids.rating('h1', 'p1')];
  assert.deepEqual(r.initial, { consequence: 2, likelihood: 'C' });
  assert.deepEqual(r.residual, { consequence: 3, likelihood: 'D' });
  d = setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', consequence: '', likelihood: '' });
  assert.equal(d.records.rating[ids.rating('h1', 'p1')].residual, null);
  d = setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', consequence: '4', likelihood: '' });
  assert.deepEqual(d.records.rating[ids.rating('h1', 'p1')].residual, { consequence: 4, likelihood: null });
});

test('setRating refuses values off the scales, an unknown stage, or a hazard not on the platform', () => {
  const d = seed();
  assert.throws(() => setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', consequence: '6', likelihood: 'A' }), code('rating.consequence'));
  assert.throws(() => setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', consequence: '2.5', likelihood: 'A' }), code('rating.consequence'));
  assert.throws(() => setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', consequence: '2', likelihood: 'Z' }), code('rating.likelihood'));
  assert.throws(() => setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'final', consequence: '2', likelihood: 'A' }), code('rating.stage'));
  assert.throws(() => setRating(d, act, { hazardId: 'h2', platformId: 'p1', stage: 'initial', consequence: '2', likelihood: 'A' }), code('not-found'));
});
