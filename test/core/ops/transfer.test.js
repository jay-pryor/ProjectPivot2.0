import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../../src/core/errors.js';
import { entries } from '../../../src/core/history.js';
import { mergeData } from '../../../src/core/merge.js';
import { checkRules } from '../../../src/core/rules.js';
import { retirePlatform, deletePlatform, createPlatform } from '../../../src/core/ops/platforms.js';
import { startWorkflow, setTransferRecipient, setStep, completeWorkflow, markTransferReviewed, takeOverWorkflow } from '../../../src/core/ops/workflows.js';
import { transferGroups } from '../../../src/core/workflows.js';
import { openItems, attentionItems } from '../../../src/core/queries.js';
import { act, later, seed, scheduleFixed, beginPlatformReview, beginOnboarding } from '../../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
const today = '2026-09-28';
/** p1 Alpha (owner u1), scheduled, with Ada’s review w1 open; transfer t1 started by u1. */
function started() {
  let d = scheduleFixed(seed(), 'p1', 6, '2026-10-30');
  d = beginPlatformReview(d, act, { id: 'w1', platformId: 'p1' });
  return startWorkflow(d, act, { id: 't1', type: 'transferOwner', platformId: 'p1' });
}
const tickAll = (d) => {
  for (const g of transferGroups(d, 'p1', today, 't1').filter((x) => x.items.length)) d = setStep(d, act, { workflowId: 't1', hazardId: '-', check: `group:${g.key}`, checked: true, note: g.key === 'review' ? 'Due end of October' : '' });
  return d;
};

test('a transfer starts on a live, onboarded platform, one at a time', () => {
  const d = started();
  assert.deepEqual([d.records.workflow.t1.type, d.records.workflow.t1.toOwnerId, d.records.workflow.t1.reviewed], ['transferOwner', null, null]);
  assert.throws(() => startWorkflow(d, act, { type: 'transferOwner', platformId: 'p1' }), code('transfer.open'));
  const o = beginOnboarding(seed(), act, { id: 'o1', platformId: 'p9', name: 'Gamma', ownerId: 'u1' });
  assert.throws(() => startWorkflow(o, act, { type: 'transferOwner', platformId: 'p9' }), code('transfer.onboarding'));
});

test('the recipient is anyone but the current owner; groups are ticked like checks; confirm is strict', () => {
  let d = started();
  assert.throws(() => setTransferRecipient(d, act, { workflowId: 't1', toOwnerId: 'u1' }), code('transfer.same'));
  assert.throws(() => completeWorkflow(d, act, { workflowId: 't1' }), code('workflow.unmet'));
  d = setTransferRecipient(d, act, { workflowId: 't1', toOwnerId: 'u2' });
  assert.throws(() => completeWorkflow(d, act, { workflowId: 't1' }), code('workflow.unmet'), 'groups not ticked');
  assert.throws(() => setStep(d, act, { workflowId: 't1', hazardId: '-', check: 'group:nonsense', checked: true }), code('workflow.check'));
  d = tickAll(d);
  assert.doesNotThrow(() => completeWorkflow(d, act, { workflowId: 't1' }));
});

test('confirming changes the owner and hands over the old owner’s open workflows on the platform, not other people’s', () => {
  let d = started();
  d = setTransferRecipient(d, act, { workflowId: 't1', toOwnerId: 'u2' });
  d = startWorkflow(d, { by: 'u3', at: act.at }, { id: 'x1', type: 'platformReview', platformId: 'p2' });
  d = tickAll(d);
  d = completeWorkflow(d, act, { workflowId: 't1' });
  assert.equal(d.records.platform.p1.ownerId, 'u2');
  assert.equal(d.records.workflow.w1.ownerId, 'u2', 'Ada’s open review on Alpha goes with it');
  assert.equal(d.records.workflow.x1.ownerId, 'u3', 'another platform’s, another person’s: untouched');
  assert.deepEqual([d.records.workflow.t1.state, d.records.workflow.t1.fromOwnerId], ['completed', 'u1']);
  assert.equal(entries(d).at(-1).action, 'Transfer platform owner');
});

test('a review owned by someone else on the platform stays theirs', () => {
  let d = scheduleFixed(seed(), 'p1', 6, '2026-10-30');
  d = beginPlatformReview(d, later, { id: 'w1', platformId: 'p1' });
  d = startWorkflow(d, act, { id: 't1', type: 'transferOwner', platformId: 'p1' });
  d = setTransferRecipient(d, act, { workflowId: 't1', toOwnerId: 'u3' });
  d = completeWorkflow(tickAll(d), act, { workflowId: 't1' });
  assert.equal(d.records.workflow.w1.ownerId, 'u2');
});

test('the recipient gets an urgent item until they mark the transfer reviewed; only they can', () => {
  let d = setTransferRecipient(started(), act, { workflowId: 't1', toOwnerId: 'u2' });
  d = completeWorkflow(tickAll(d), act, { workflowId: 't1' });
  const items = openItems(d, today, 'u2');
  assert.deepEqual(items.transfers.map((t) => [t.workflow.id, t.platform.id, t.from]), [['t1', 'p1', 'u1']]);
  assert.equal(attentionItems(items)[0].type, 'transfer', 'first, before everything else');
  assert.deepEqual(openItems(d, today, 'u1').transfers, []);
  assert.throws(() => markTransferReviewed(d, act, { workflowId: 't1' }), code('transfer.recipient'));
  d = markTransferReviewed(d, later, { workflowId: 't1' });
  assert.deepEqual(d.records.workflow.t1.reviewed, { by: 'u2', at: later.at });
  assert.deepEqual(openItems(d, today, 'u2').transfers, []);
});

test('two people starting a transfer of the same platform: mine is kept', () => {
  const base = scheduleFixed(seed(), 'p1', 6, '2026-10-30');
  const mine = startWorkflow(base, act, { id: 'mine', type: 'transferOwner', platformId: 'p1' });
  const theirs = startWorkflow(base, later, { id: 'theirs', type: 'transferOwner', platformId: 'p1' });
  const { data } = mergeData(base, mine, theirs, { by: 'u1', at: '2026-09-28T13:00:00+10:00' });
  assert.equal(data.records.workflow.mine.state, 'open');
  assert.equal(data.records.workflow.theirs.status, 'deleted');
});

test('retiring or deleting a platform cancels its open transfer, so the rules still hold', () => {
  const ret = retirePlatform(started(), act, { id: 'p1' });
  assert.equal(ret.records.workflow.t1.state, 'cancelled');
  assert.deepEqual(checkRules(ret), []);
  let e = createPlatform(seed(), act, { id: 'p9', name: 'Empty', ownerId: 'u1' });
  e = deletePlatform(startWorkflow(e, act, { id: 't9', type: 'transferOwner', platformId: 'p9' }), act, { id: 'p9' });
  assert.equal(e.records.workflow.t9.state, 'cancelled');
  assert.deepEqual(checkRules(e), []);
});

test('the urgent item goes once the platform is no longer theirs or no longer live', () => {
  let d = setTransferRecipient(started(), act, { workflowId: 't1', toOwnerId: 'u2' });
  d = completeWorkflow(tickAll(d), act, { workflowId: 't1' });
  assert.equal(openItems(d, today, 'u2').transfers.length, 1);
  assert.deepEqual(openItems(retirePlatform(d, act, { id: 'p1' }), today, 'u2').transfers, [], 'retired');
  let back = startWorkflow(d, later, { id: 't2', type: 'transferOwner', platformId: 'p1' });
  back = setTransferRecipient(back, later, { workflowId: 't2', toOwnerId: 'u1' });
  for (const g of transferGroups(back, 'p1', today, 't2').filter((x) => x.items.length)) back = setStep(back, later, { workflowId: 't2', hazardId: '-', check: `group:${g.key}`, checked: true });
  back = completeWorkflow(back, later, { workflowId: 't2' });
  assert.deepEqual(openItems(back, today, 'u2').transfers, [], 'handed back: no longer Grace’s');
});
