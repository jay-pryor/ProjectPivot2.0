import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profileAssignments } from '../../src/core/queries.js';
import { retirePlatform } from '../../src/core/ops/platforms.js';
import { startWorkflow, setTransferRecipient, setStep, completeWorkflow, cancelWorkflow } from '../../src/core/ops/workflows.js';
import { transferGroups } from '../../src/core/workflows.js';
import { seed, act, later } from '../helpers.js';

const ids = (a) => ({ platforms: a.platforms.map((p) => p.id), workflows: a.workflows.map((w) => w.id), transfers: a.transfers.map((w) => w.id) });

test('what a profile has assigned: the live platforms it owns and its open workflows', () => {
  let d = startWorkflow(seed(), act, { id: 'w1', type: 'platformReview', platformId: 'p1' });
  assert.deepEqual(ids(profileAssignments(d, 'u1')), { platforms: ['p1'], workflows: ['w1'], transfers: [] });
  assert.deepEqual(ids(profileAssignments(d, 'u3')), { platforms: [], workflows: [], transfers: [] });
  d = cancelWorkflow(d, act, { workflowId: 'w1' });
  d = retirePlatform(d, act, { id: 'p1' });
  assert.deepEqual(ids(profileAssignments(d, 'u1')), { platforms: [], workflows: [], transfers: [] }, 'a retired platform and an ended workflow are not assigned');
});

test('a transfer handed to the profile and not yet marked reviewed is assigned to it', () => {
  let d = startWorkflow(seed(), act, { id: 't1', type: 'transferOwner', platformId: 'p1' });
  d = setTransferRecipient(d, act, { workflowId: 't1', toOwnerId: 'u3' });
  for (const g of transferGroups(d, 'p1', '2026-09-28', 't1').filter((g) => g.items.length)) d = setStep(d, act, { workflowId: 't1', hazardId: '-', check: `group:${g.key}`, checked: true });
  d = completeWorkflow(d, act, { workflowId: 't1' });
  assert.deepEqual(ids(profileAssignments(d, 'u3')), { platforms: ['p1'], workflows: [], transfers: ['t1'] });
  void later;
});
