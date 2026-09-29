import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { entries } from '../../src/core/history.js';
import { linkControl, unlinkControl, setControlAnalysis } from '../../src/core/ops/controls.js';
import { controlsOnPlatform } from '../../src/core/queries.js';
import { act, seed } from '../helpers.js';

const link = (d) => d.records.hazardControl['hc:h1:c1'];

test('an additional control has a shared recommendation and justification', () => {
  let d = setControlAnalysis(seed(), act, { hazardId: 'h1', controlId: 'c1', recommendation: '  Fit sprinklers in bay 2 ' });
  d = setControlAnalysis(d, act, { hazardId: 'h1', controlId: 'c1', justification: 'Cuts fire spread' });
  assert.deepEqual([link(d).recommendation, link(d).justification], ['Fit sprinklers in bay 2', 'Cuts fire spread']);
  assert.equal(entries(d).at(-1).action, 'Edit control analysis');
  const onP2 = controlsOnPlatform(d, 'h1', 'p2').find((c) => c.control.id === 'c1');
  assert.equal(onP2.link.recommendation, 'Fit sprinklers in bay 2', 'the same on every platform');
  assert.throws(() => setControlAnalysis(d, act, { hazardId: 'h2', controlId: 'c1', recommendation: 'x' }), (e) => e instanceof PivotError && e.code === 'not-found');
});

test('re-linking a control starts its analysis empty', () => {
  let d = setControlAnalysis(seed(), act, { hazardId: 'h1', controlId: 'c1', recommendation: 'R', justification: 'J' });
  d = unlinkControl(d, act, { hazardId: 'h1', controlId: 'c1' });
  d = linkControl(d, act, { hazardId: 'h1', controlId: 'c1', kind: 'preventative' });
  assert.deepEqual([link(d).recommendation, link(d).justification], ['', '']);
});

test('a hazard\'s additional controls on a platform come by tier, then number', async () => {
  const { updateControl, createControl, linkControl: link } = await import('../../src/core/ops/controls.js');
  const { assignNumbers } = await import('../../src/core/ops/hazards.js');
  let d = updateControl(seed(), act, { id: 'c1', tier: 'PPE' });
  d = updateControl(d, act, { id: 'c2', tier: 'Engineering' });
  d = createControl(d, act, { id: 'c3', title: 'Guard' });
  d = link(assignNumbers(d), act, { hazardId: 'h1', controlId: 'c3', kind: 'preventative' });
  assert.deepEqual(controlsOnPlatform(d, 'h1', 'p1').map((c) => c.control.id), ['c2', 'c1', 'c3'], 'Engineering, PPE, then no tier');
});
