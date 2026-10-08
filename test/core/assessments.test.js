import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { KINDS, put, created } from '../../src/core/data.js';
import { ids } from '../../src/core/ids.js';
import { entries } from '../../src/core/history.js';
import { checkRules } from '../../src/core/rules.js';
import { RECEPTORS, STAGES, setAssessment, setRating, setSfarp } from '../../src/core/ops/assessment.js';
import { unlinkHazard, linkHazard } from '../../src/core/ops/platforms.js';
import { assessmentOf, ratingsOf, ratingOf, sfarpOf, platformsReached, bandOf, platformHazards, hazardRows, openItems, platformCards, worseBand, filterHazards } from '../../src/core/queries.js';
import { act, later, seed } from '../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
const A = (d, stage, receptor) => assessmentOf(d, 'h1', 'p1', stage, receptor);

test('four assessments per hazard on a platform, and SFARP, are records built from what they join', () => {
  assert.ok(KINDS.includes('assessment') && KINDS.includes('sfarp'));
  assert.deepEqual([STAGES, RECEPTORS], [['initial', 'residual'], ['personnel', 'environment', 'capability']]);
  assert.equal(ids.assessment('h1', 'p1', 'initial', 'personnel'), 'ra:h1:p1:initial:personnel');
  assert.equal(ids.sfarp('h1', 'p1'), 'sf:h1:p1');
});

test('an assessment: likelihood and consequence with their justifications; each part kept when another changes', () => {
  let d = setAssessment(seed(), act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', receptor: 'personnel', likelihood: 'C' });
  assert.deepEqual([A(d, 'initial', 'personnel').likelihood, A(d, 'initial', 'personnel').consequence], ['C', null]);
  assert.equal(bandOf(ratingsOf(d, 'h1', 'p1').initial.personnel), 'Uncategorised', 'half an assessment has no level yet');
  d = setAssessment(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', receptor: 'personnel', consequence: '2', likelihoodWhy: '  Seen twice a year  ' });
  const a = A(d, 'initial', 'personnel');
  assert.deepEqual([a.likelihood, a.consequence, a.likelihoodWhy, a.consequenceWhy], ['C', 2, 'Seen twice a year', '']);
  assert.equal(bandOf(ratingsOf(d, 'h1', 'p1').initial.personnel), 'Serious');
  assert.equal(entries(d).at(-1).action, 'Set initial personnel risk');
  assert.equal(A(d, 'initial', 'environment'), null, 'environment is its own record');
  assert.equal(setAssessment(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', receptor: 'personnel', likelihood: '' }).records.assessment['ra:h1:p1:initial:personnel'].likelihood, null);
  assert.throws(() => setAssessment(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'final', receptor: 'personnel' }), code('rating.stage'));
  assert.throws(() => setAssessment(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', receptor: 'plants' }), code('rating.receptor'));
  assert.throws(() => setAssessment(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', receptor: 'personnel', likelihood: 'Z' }), code('rating.likelihood'));
  assert.throws(() => setAssessment(d, act, { hazardId: 'h2', platformId: 'p1', stage: 'initial', receptor: 'personnel', likelihood: 'A' }), code('not-found'));
});

test('setRating sets every receptor unless one is named', () => {
  let d = setRating(seed(), act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', consequence: 2, likelihood: 'C' });
  assert.deepEqual(ratingsOf(d, 'h1', 'p1').residual, { personnel: { consequence: 2, likelihood: 'C' }, environment: { consequence: 2, likelihood: 'C' }, capability: { consequence: 2, likelihood: 'C' } });
  assert.equal(entries(d).at(-1).action, 'Set residual rating');
  assert.deepEqual(ratingOf(d, 'h1', 'p1'), { initial: null, residual: { consequence: 2, likelihood: 'C' } });
  d = setAssessment(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor: 'environment', consequence: 4, likelihood: 'D' });
  assert.deepEqual(ratingOf(d, 'h1', 'p1', 'environment').residual, { consequence: 4, likelihood: 'D' });
  assert.deepEqual(ratingOf(d, 'h1', 'p1').residual, { consequence: 2, likelihood: 'C' });
  assert.equal(entries(d).at(-1).action, 'Set residual environment risk');
});

test('SFARP considerations per hazard on a platform', () => {
  assert.deepEqual(sfarpOf(seed(), 'h1', 'p1'), { justification: '', conclusion: '', conditions: '' });
  let d = setSfarp(seed(), act, { hazardId: 'h1', platformId: 'p1', justification: 'All reasonable controls in place', conclusion: 'SFARP' });
  d = setSfarp(d, act, { hazardId: 'h1', platformId: 'p1', conditions: 'Valid while crew trained' });
  assert.deepEqual(sfarpOf(d, 'h1', 'p1'), { justification: 'All reasonable controls in place', conclusion: 'SFARP', conditions: 'Valid while crew trained' });
  assert.equal(entries(d).at(-1).action, 'Edit SFARP considerations');
  assert.deepEqual(sfarpOf(d, 'h1', 'p2'), { justification: '', conclusion: '', conditions: '' });
});

test('unlinking clears assessments and SFARP; linking back starts empty; the rules hold', () => {
  let d = setRating(seed(), act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', consequence: 1, likelihood: 'A' });
  d = setSfarp(d, act, { hazardId: 'h1', platformId: 'p1', conclusion: 'x' });
  assert.deepEqual(platformsReached(d, 'assessment', d.records.assessment['ra:h1:p1:initial:personnel']), ['p1']);
  assert.deepEqual(platformsReached(d, 'sfarp', d.records.sfarp['sf:h1:p1']), ['p1']);
  d = unlinkHazard(d, later, { hazardId: 'h1', platformId: 'p1' });
  assert.equal(d.records.assessment['ra:h1:p1:initial:personnel'].status, 'deleted');
  assert.equal(d.records.sfarp['sf:h1:p1'].status, 'deleted');
  assert.deepEqual(checkRules(d), []);
  d = linkHazard(d, later, { hazardId: 'h1', platformId: 'p1' });
  assert.deepEqual(ratingsOf(d, 'h1', 'p1').initial, { personnel: null, environment: null, capability: null });
  assert.deepEqual(sfarpOf(d, 'h1', 'p1').conclusion, '');
  const orphan = put(seed(), 'assessment', created(act, 'ra:h2:p1:initial:personnel', { hazardId: 'h2', platformId: 'p1', stage: 'initial', receptor: 'personnel', likelihood: 'A', consequence: 1, likelihoodWhy: '', consequenceWhy: '' }));
  assert.deepEqual(checkRules(orphan).map((v) => v.rule), ['assessment-without-platform-link']);
});

test('derived views carry personnel and environment separately; one-value views take the worse', () => {
  let d = setAssessment(seed(), act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor: 'personnel', consequence: 4, likelihood: 'D' });
  d = setAssessment(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor: 'environment', consequence: 2, likelihood: 'C' });
  assert.equal(worseBand('Low', 'Serious'), 'Serious');
  assert.deepEqual(platformHazards(d, 'p1')[0].ratings.residual, { personnel: { consequence: 4, likelihood: 'D' }, environment: { consequence: 2, likelihood: 'C' }, capability: null });
  const row = hazardRows(d).find((r) => r.hazard.id === 'h1');
  const p1 = row.platforms.find((p) => p.platform.id === 'p1');
  assert.deepEqual([p1.personnel, p1.environment, p1.band], ['Low', 'Serious', 'Serious']);
  assert.deepEqual([row.worstPersonnel, row.worstEnvironment, row.worst], ['Low', 'Serious', 'Serious']);
  assert.deepEqual(filterHazards(d, { band: 'Serious' }).map((r) => r.platform.id), ['p1']);
  const u = openItems(d, '2026-09-28', 'u1').unrated;
  assert.deepEqual(u.map((x) => x.missing), [['initial personnel', 'initial environment', 'initial capability', 'residual capability']]);
  const half = setAssessment(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', receptor: 'personnel', likelihood: 'B' });
  assert.deepEqual(openItems(half, '2026-09-28', 'u1').unrated[0].missing, ['initial personnel', 'initial environment', 'initial capability', 'residual capability'], 'a likelihood alone is not complete');
  assert.deepEqual(platformCards(d, '2026-09-28', 'u1')[0].bands, { personnel: { Low: 1 }, environment: { Serious: 1 }, capability: { Uncategorised: 1 } });
});

test('a risk rated with no justification at all, of either the likelihood or the consequence, is an open item', () => {
  const at = (d) => openItems(d, '2026-09-28', 'u1').unjustified.map((x) => [x.platform.id, x.hazard.id, x.missing]);
  let d = setAssessment(seed(), act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', receptor: 'personnel', consequence: 4, likelihood: 'D' });
  d = setAssessment(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor: 'environment', likelihood: 'C' });
  assert.deepEqual(at(d), [['p1', 'h1', ['initial personnel', 'residual environment']]], 'a likelihood alone counts as rated');
  d = setAssessment(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', receptor: 'personnel', consequenceWhy: 'Burns to one person' });
  assert.deepEqual(at(d), [['p1', 'h1', ['residual environment']]], 'one justification is enough');
  d = setAssessment(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor: 'environment', likelihood: '' });
  assert.deepEqual(at(d), [], 'not rated, nothing to justify');
  d = setAssessment(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'initial', receptor: 'personnel', consequenceWhy: '' });
  assert.deepEqual(at(d), [['p1', 'h1', ['initial personnel']]], 'a justification cleared');
});
