import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workflowView } from '../../src/ui/screens/workflow.js';
import { startWorkflow, setTransferRecipient, setStep, completeWorkflow } from '../../src/core/ops/workflows.js';
import { transferGroups } from '../../src/core/workflows.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { state } from './screens-workflows.test.js';
import { seed, act, later, scheduleFixed } from '../helpers.js';

const on = (extra = {}) => ({ ...state, profiles: [...state.profiles, { id: 'u3', name: 'Lin', createdAt: '' }], view: { name: 'workflow', id: 't1', ...extra } });
function started() {
  const d = scheduleFixed(seed(), 'p1', 6, '2026-10-30');
  return assignNumbers(startWorkflow(d, act, { id: 't1', type: 'transferOwner', platformId: 'p1' }));
}
const done = () => {
  let d = setTransferRecipient(started(), act, { workflowId: 't1', toOwnerId: 'u2' });
  for (const g of transferGroups(d, 'p1', '2026-09-28', 't1').filter((x) => x.items.length)) d = setStep(d, act, { workflowId: 't1', hazardId: '-', check: `group:${g.key}`, checked: true, note: g.key === 'review' ? 'Due soon, warned Grace' : '' });
  return completeWorkflow(d, act, { workflowId: 't1' });
};

test('an open transfer: the new owner choice, a card per group with its count, items, note and tick; empty groups say None', () => {
  const out = workflowView(on(), started(), 't1').toString();
  assert.match(out, /<select name="toOwnerId"[^>]*required[^>]*>\s*<option value="" disabled selected>Select new owner…<\/option>/);
  assert.doesNotMatch(out, /<option value="u1"/, 'not the current owner');
  assert.match(out, /Controls awaiting a decision[\s\S]*?Sprinklers/);
  assert.match(out, /Changes waiting acknowledgement[\s\S]*?None/);
  assert.match(out, /data-check="group:review"/);
  assert.match(out, /Confirm transfer — \d+ still needed<\/button>/);
});

test('a completed transfer shows from and to, the ticks and notes; Mark as reviewed for the new owner only', () => {
  const d = done();
  const theirs = workflowView({ ...on(), profileId: 'u2' }, d, 't1').toString();
  assert.match(theirs, /Transferred from Ada to Grace/);
  assert.match(theirs, /Due soon, warned Grace/);
  assert.match(theirs, /data-action="markTransferReviewed"/);
  assert.doesNotMatch(workflowView(on(), d, 't1').toString(), /data-action="markTransferReviewed"/);
});
