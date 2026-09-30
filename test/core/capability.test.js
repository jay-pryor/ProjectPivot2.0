import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { RECEPTORS, RECEPTOR_WORD, RECEPTOR_LETTER, stageKey } from '../../src/core/receptors.js';
import { setAssessment } from '../../src/core/ops/assessment.js';
import * as assessmentOps from '../../src/core/ops/assessment.js';
import { mergeData } from '../../src/core/merge.js';
import { ratingsOf, hazardRows, openItems, platformCards, bandOf } from '../../src/core/queries.js';
import { act, later, seed } from '../helpers.js';

const set = (d, stage, receptor, likelihood, consequence, a = act) => setAssessment(d, a, { hazardId: 'h1', platformId: 'p1', stage, receptor, likelihood, consequence });

test('three receptors, one list, named once', () => {
  assert.deepEqual(RECEPTORS, ['personnel', 'environment', 'capability']);
  assert.equal(RECEPTOR_WORD.capability, 'Capability');
  assert.equal(RECEPTOR_LETTER.capability, 'C');
  assert.equal(stageKey('residual', 'capability'), 'residualCapability');
  assert.equal('setRatingCell' in assessmentOps, false, 'no picking a matrix cell');
});

test('capability is assessed like the others; half an assessment is kept but not a level', () => {
  let d = set(seed(), 'initial', 'capability', 'C', null);
  assert.equal(bandOf(ratingsOf(d, 'h1', 'p1').initial.capability), 'Uncategorised');
  d = set(d, 'initial', 'capability', undefined, '2');
  assert.deepEqual(ratingsOf(d, 'h1', 'p1').initial.capability, { consequence: 2, likelihood: 'C' });
  assert.throws(() => set(d, 'initial', 'morale', 'A', 1), (e) => e instanceof PivotError && e.code === 'rating.receptor');
});

test('the worst band is over all three; an unassessed receptor is listed as missing', () => {
  let d = set(seed(), 'residual', 'personnel', 'D', 4);
  d = set(d, 'residual', 'environment', 'E', 4);
  d = set(d, 'residual', 'capability', 'C', 2);
  const row = hazardRows(d).find((r) => r.hazard.id === 'h1');
  const p1 = row.platforms.find((p) => p.platform.id === 'p1');
  assert.deepEqual([p1.personnel, p1.environment, p1.capability, p1.band], ['Low', 'Low', 'Serious', 'Serious']);
  assert.equal(row.worstCapability, 'Serious');
  const u = openItems(d, '2026-09-28', 'u1').unrated.find((x) => x.platform.id === 'p1');
  assert.deepEqual(u.missing, ['initial personnel', 'initial environment', 'initial capability']);
  assert.deepEqual(platformCards(d, '2026-09-28', 'u1')[0].bands.capability, { Serious: 1 });
});

test('two people assessing different receptors of the same hazard on a platform both keep theirs', () => {
  const base = seed();
  const mine = set(base, 'residual', 'personnel', 'D', 4);
  const theirs = set(base, 'residual', 'capability', 'C', 2, later);
  const { data, conflicts } = mergeData(base, mine, theirs, { by: 'u1', at: '2026-09-28T13:00:00+10:00' });
  assert.deepEqual(conflicts, []);
  const r = ratingsOf(data, 'h1', 'p1').residual;
  assert.deepEqual([r.personnel, r.capability], [{ consequence: 4, likelihood: 'D' }, { consequence: 2, likelihood: 'C' }]);
});
