import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { normalizeData, created } from '../../src/core/data.js';
import { entries } from '../../src/core/history.js';
import { checkRules } from '../../src/core/rules.js';
import { mergeData } from '../../src/core/merge.js';
import { CONTROL_STATUSES, setControlStatus } from '../../src/core/ops/assessment.js';
import { controlState, openItems } from '../../src/core/queries.js';
import { act, later, seed } from '../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
const t = { hazardId: 'h1', controlId: 'c1', platformId: 'p1' };
const state = (d) => controlState(d, 'h1', 'c1', 'p1').state;

test('a control on a platform is recommended, planned, implemented or rejected (with a reason)', () => {
  assert.deepEqual(CONTROL_STATUSES, ['recommended', 'planned', 'implemented', 'rejected']);
  assert.equal(state(seed()), 'recommended', 'no decision yet means recommended');
  let d = setControlStatus(seed(), act, { ...t, status: 'planned' });
  assert.equal(state(d), 'planned');
  assert.equal(entries(d).at(-1).action, 'Set control to planned');
  d = setControlStatus(d, act, { ...t, status: 'rejected', reason: '  No crew  ' });
  assert.deepEqual([state(d), controlState(d, 'h1', 'c1', 'p1').ruling.reason], ['rejected', 'No crew']);
  d = setControlStatus(d, act, { ...t, status: 'implemented' });
  assert.deepEqual([state(d), controlState(d, 'h1', 'c1', 'p1').ruling.reason], ['implemented', '']);
  d = setControlStatus(d, act, { ...t, status: 'recommended' });
  assert.equal(state(d), 'recommended');
  assert.equal(d.records.ruling['ru:h1:c1:p1'].status, 'deleted');
  assert.equal(setControlStatus(d, act, { ...t, status: 'recommended' }), d, 'already recommended: nothing to do');
  assert.throws(() => setControlStatus(seed(), act, { ...t, status: 'rejected', reason: ' ' }), code('empty'));
  assert.throws(() => setControlStatus(seed(), act, { ...t, status: 'confirmed' }), code('control.status'));
});

test('controls awaiting a decision are the recommended ones', () => {
  let d = setControlStatus(seed(), act, { ...t, status: 'planned' });
  assert.deepEqual(openItems(d, '2026-09-28', 'u1').awaiting.map((x) => x.control.id), ['c2']);
});

test('old decisions convert on load, the same each time, and merge cleanly', () => {
  const old = seed();
  old.records.ruling['ru:h1:c1:p1'] = created(act, 'ru:h1:c1:p1', { ...t, state: 'confirmed', reason: '' });
  old.records.ruling['ru:h1:c2:p1'] = created(act, 'ru:h1:c2:p1', { hazardId: 'h1', controlId: 'c2', platformId: 'p1', state: 'excluded', reason: 'No crew' });
  const d = normalizeData(old);
  assert.equal(state(d), 'implemented');
  assert.deepEqual([controlState(d, 'h1', 'c2', 'p1').state, controlState(d, 'h1', 'c2', 'p1').ruling.reason], ['rejected', 'No crew']);
  assert.equal(d.records.ruling['ru:h1:c1:p1'].updatedAt, act.at, 'headers unchanged');
  assert.deepEqual(normalizeData(structuredClone(old)), d);
  assert.deepEqual(normalizeData(d), d);
  assert.deepEqual(checkRules(d), []);
  const mine = setControlStatus(d, act, { ...t, status: 'planned' });
  const theirs = setControlStatus(normalizeData(structuredClone(old)), later, { hazardId: 'h1', controlId: 'c2', platformId: 'p2', status: 'implemented' });
  const { data, conflicts } = mergeData(d, mine, theirs, { by: 'u1', at: '2026-09-28T13:00:00+10:00' });
  assert.deepEqual(conflicts, []);
  assert.equal(controlState(data, 'h1', 'c1', 'p1').state, 'planned');
  assert.equal(controlState(data, 'h1', 'c2', 'p2').state, 'implemented');
});

test('a rejection with no reason breaks a rule', () => {
  const d = seed();
  d.records.ruling['ru:h1:c1:p1'] = created(act, 'ru:h1:c1:p1', { ...t, state: 'rejected', reason: '' });
  assert.deepEqual(checkRules(d).map((v) => v.rule), ['rejection-without-reason']);
});
