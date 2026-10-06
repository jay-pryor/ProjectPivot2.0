import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addCausalFactor } from '../../src/core/ops/hazards.js';
import { unlinkHazard } from '../../src/core/ops/platforms.js';
import { causalFactorsOn, platformsReached } from '../../src/core/queries.js';
import { bowtieOf } from '../../src/core/bowtie.js';
import { checkRules } from '../../src/core/rules.js';
import { put } from '../../src/core/data.js';
import { seed, act } from '../helpers.js';

/** Seed's cf1 is for every platform; cf2 is Alpha's alone. */
const data = () => addCausalFactor(seed(), act, { id: 'cf2', hazardId: 'h1', platformId: 'p1', text: 'Fuel leak' });
const texts = (xs) => xs.map((x) => x.text);

test('a causal factor is for every platform of its hazard, or for one of them alone', () => {
  const d = data();
  assert.equal(d.records.causalFactor.cf1.platformId, null);
  assert.deepEqual(texts(causalFactorsOn(d, 'h1', 'p1')), ['Hot works', 'Fuel leak']);
  assert.deepEqual(texts(causalFactorsOn(d, 'h1', 'p2')), ['Hot works']);
  assert.deepEqual(texts(causalFactorsOn(d, 'h1')), ['Hot works', 'Fuel leak'], 'with no platform, every one');
  assert.deepEqual(platformsReached(d, 'causalFactor', d.records.causalFactor.cf2), ['p1']);
  assert.deepEqual(platformsReached(d, 'causalFactor', d.records.causalFactor.cf1), ['p1', 'p2']);
});

test('a causal factor can only be for a platform its hazard is on', () => {
  assert.throws(() => addCausalFactor(seed(), act, { hazardId: 'h2', platformId: 'p1', text: 'x' }), /not on that platform/);
});

test('the bow-tie and unlinking follow a causal factor\'s platform; the rules catch one left behind', () => {
  const d = data();
  assert.deepEqual(texts(/** @type {any} */ (bowtieOf(d, 'h1', 'p2')).causalFactors), ['Hot works']);
  const unlinked = unlinkHazard(d, act, { hazardId: 'h1', platformId: 'p1' });
  assert.equal(unlinked.records.causalFactor.cf2.status, 'deleted', 'Alpha\'s own goes with the link');
  assert.equal(unlinked.records.causalFactor.cf1.status, 'live', 'one for every platform stays');
  const stray = put(unlinked, 'causalFactor', { ...unlinked.records.causalFactor.cf2, status: 'live' });
  assert.ok(checkRules(stray).some((x) => x.rule === 'causalFactor-without-platform-link'));
});

test('causal factors and consequences keep the order they were added, whatever their ids and however the records are stored', () => {
  let d = seed();
  for (const [id, text] of [['zz', 'Second'], ['aa', 'Third'], ['mm', 'Fourth']]) d = addCausalFactor(d, act, { id, hazardId: 'h1', text });
  const shuffled = { ...d, records: { ...d.records, causalFactor: Object.fromEntries(Object.entries(d.records.causalFactor).sort(([a], [b]) => a.localeCompare(b))) } };
  assert.deepEqual(texts(causalFactorsOn(shuffled, 'h1')), ['Hot works', 'Second', 'Third', 'Fourth']);
  assert.deepEqual([d.records.causalFactor.zz.seq, d.records.causalFactor.aa.seq], [2, 3]);
});

test('a phase\'s stats: its hazards, their platforms and controls, the worst residual, and the pairs not fully rated', async () => {
  const { createPhase, linkPhase } = await import('../../src/core/ops/phases.js');
  const { setAssessment } = await import('../../src/core/ops/assessment.js');
  const { phaseStats } = await import('../../src/core/queries.js');
  let d = createPhase(seed(), act, { id: 'ph1', name: 'Operation' });
  d = linkPhase(d, act, { hazardId: 'h1', phaseId: 'ph1' });
  for (const receptor of ['personnel', 'environment', 'capability']) d = setAssessment(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor, likelihood: 'C', consequence: receptor === 'personnel' ? 2 : 4 });
  assert.deepEqual(phaseStats(d, 'ph1'), { hazards: 1, platforms: 2, controls: 2, pairs: 2, unrated: 1, worst: 'Serious' });
});
