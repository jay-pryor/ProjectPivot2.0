import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyTable } from '../../src/ui/screens/common.js';
import { updateHazard, assignNumbers } from '../../src/core/ops/hazards.js';
import { initialState } from '../../src/ui/controller.js';
import { seed, act, beginPlatformReview } from '../helpers.js';

test('a change made through a workflow shows a via WF chip linking to it', () => {
  let d = assignNumbers(beginPlatformReview(seed(), act, { id: 'w1', platformId: 'p1' }));
  d = updateHazard(d, { ...act, workflowId: 'w1' }, { id: 'h1', title: 'Fire on board' });
  const state = { ...initialState(), screen: 'main', profileId: 'u1', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }], view: { name: 'hazard', id: 'h1', tab: 'history' } };
  const out = historyTable(state, d, 'hazard', 'h1').toString();
  assert.match(out, /class="tag wf-chip"[^>]*>via WF-001/);
  assert.match(out, /data-view="workflow"/);
});
