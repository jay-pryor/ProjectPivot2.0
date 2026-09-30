import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { entries } from '../../src/core/history.js';
import { setAssessment, copyStageRisk } from '../../src/core/ops/assessment.js';
import { ratingsOf, stageCopySources, assessmentOf } from '../../src/core/queries.js';
import { act, seed } from '../helpers.js';

const set = (d, platformId, receptor, likelihood, consequence, extra = {}) => setAssessment(d, act, { hazardId: 'h1', platformId, stage: 'initial', receptor, likelihood, consequence, ...extra });

test('a stage\'s likelihoods and consequences, for every risk type, copy from another platform in one change', () => {
  let d = set(seed(), 'p2', 'personnel', 'B', 1);
  d = set(d, 'p2', 'capability', 'D', 3);
  d = set(d, 'p1', 'environment', 'A', 1, { likelihoodWhy: 'Kept' });
  assert.deepEqual(stageCopySources(d, 'h1', 'p1', 'initial').map((x) => x.platform.id), ['p2']);
  assert.deepEqual(stageCopySources(d, 'h1', 'p1', 'residual'), [], 'nothing to copy at residual');
  d = copyStageRisk(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', from: 'p2' });
  assert.equal(entries(d).at(-1).action, 'Copy initial risk from Bravo');
  assert.deepEqual(ratingsOf(d, 'h1', 'p1').initial, {
    personnel: { consequence: 1, likelihood: 'B' }, environment: null, capability: { consequence: 3, likelihood: 'D' },
  }, 'environment becomes unset, as on Bravo');
  assert.equal(assessmentOf(d, 'h1', 'p1', 'initial', 'environment').likelihoodWhy, 'Kept', 'justifications are left alone');
  assert.throws(() => copyStageRisk(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'final', from: 'p2' }), (e) => e instanceof PivotError && e.code === 'rating.stage');
  assert.throws(() => copyStageRisk(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', from: 'p1' }), (e) => e instanceof PivotError);
});
