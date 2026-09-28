import { test } from 'node:test';
import assert from 'node:assert/strict';
import { put, created, changed } from '../../src/core/data.js';
import { ids } from '../../src/core/ids.js';
import { checkRules } from '../../src/core/rules.js';
import { confirmControl, excludeControl, setRating } from '../../src/core/ops/assessment.js';
import { act, seed } from '../helpers.js';

const rulesOf = (d) => checkRules(d).map((v) => v.rule).sort();

test('data built through the ops keeps every rule', () => {
  let d = seed();
  d = confirmControl(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1' });
  d = excludeControl(d, act, { hazardId: 'h1', controlId: 'c2', platformId: 'p1', reason: 'n/a' });
  d = setRating(d, act, { hazardId: 'h1', platformId: 'p2', stage: 'residual', consequence: 2, likelihood: 'C' });
  assert.deepEqual(checkRules(d), []);
});

test('each broken rule is found and names the records involved', () => {
  let d = seed();
  d = put(d, 'hazard', changed(d.records.hazard.h1, act, { status: 'retired' }));
  let v = checkRules(d).find((x) => x.rule === 'hazard-not-live-on-platform');
  assert.ok(v);
  assert.deepEqual(v.records.map((r) => r.kind).sort(), ['hazard', 'hazardPlatform']);

  d = seed();
  d = put(d, 'platform', changed(d.records.platform.p1, act, { status: 'deleted' }));
  assert.deepEqual(rulesOf(d), ['platform-deleted']);

  d = seed();
  d = put(d, 'control', changed(d.records.control.c1, act, { status: 'deleted' }));
  assert.deepEqual(rulesOf(d), ['control-deleted']);

  d = seed();
  d = put(d, 'hazard', changed(d.records.hazard.h2, act, { status: 'deleted' }));
  d = put(d, 'causalFactor', created(act, 'cfx', { hazardId: 'h2', text: 'x' }));
  assert.deepEqual(rulesOf(d), ['parent-deleted']);

  d = seed();
  d = put(d, 'ruling', created(act, ids.ruling('h2', 'c1', 'p1'), { hazardId: 'h2', controlId: 'c1', platformId: 'p1', state: 'confirmed', reason: '' }));
  assert.deepEqual(rulesOf(d), ['ruling-without-control-link', 'ruling-without-platform-link']);

  d = seed();
  d = put(d, 'ruling', created(act, ids.ruling('h1', 'c1', 'p1'), { hazardId: 'h1', controlId: 'c1', platformId: 'p1', state: 'excluded', reason: ' ' }));
  assert.deepEqual(rulesOf(d), ['exclusion-without-reason']);

  d = seed();
  d = put(d, 'rating', created(act, ids.rating('h2', 'p1'), { hazardId: 'h2', platformId: 'p1', initial: null, residual: null }));
  assert.deepEqual(rulesOf(d), ['rating-without-platform-link']);
});
