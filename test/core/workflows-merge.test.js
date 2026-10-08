import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeData } from '../../src/core/merge.js';
import { checkRules } from '../../src/core/rules.js';
import { ids } from '../../src/core/ids.js';
import { put, changed } from '../../src/core/data.js';
import { retirePlatform, deletePlatform, linkHazard, createPlatform } from '../../src/core/ops/platforms.js';
import { setStep, cancelWorkflow, takeOverWorkflow } from '../../src/core/ops/workflows.js';
import { openReview } from '../../src/core/queries.js';
import { openWorkflows, endedWorkflows } from '../../src/core/workflows.js';
import { seed, scheduleFixed, beginPlatformReview, finishPlatformReview } from '../helpers.js';
import { scheduleOf } from '../../src/core/schedule.js';

const setup = { by: 'u1', at: '2026-09-28T09:00:00+10:00' };
const me = { by: 'u1', at: '2026-09-28T12:00:00+10:00' };
const them = { by: 'u2', at: '2026-09-28T12:30:00+10:00' };
const saveAct = { by: 'u1', at: '2026-09-28T13:00:00+10:00' };

/** p1 with h1 and h2, 6-monthly due 2026-10-30, and review w1 open, owned by u1. */
function base() {
  let d = linkHazard(seed(), setup, { hazardId: 'h2', platformId: 'p1' });
  d = scheduleFixed(d, 'p1', 6, '2026-10-30', setup);
  return beginPlatformReview(d, setup, { id: 'w1', platformId: 'p1' });
}
const names = (violations) => violations.map((v) => v.rule).sort();

test('the rules: an open review needs a live platform, one per platform, steps follow their workflow', () => {
  const d = base();
  assert.deepEqual(checkRules(d), []);
  assert.deepEqual(names(checkRules(put(d, 'platform', { ...d.records.platform.p1, status: 'retired' }))), ['review-on-platform-not-live']);
  assert.deepEqual(names(checkRules(put(d, 'workflow', { ...d.records.workflow.w1, id: 'w2' }))), ['two-open-reviews']);
  const ticked = setStep(d, me, { workflowId: 'w1', hazardId: 'h1', check: 'sfarp', checked: true });
  assert.deepEqual(names(checkRules(put(ticked, 'workflow', { ...ticked.records.workflow.w1, status: 'deleted' }))), ['workflow-step-orphaned']);
  const done = finishPlatformReview(ticked, me, { workflowId: 'w1' });
  assert.deepEqual(checkRules(done), []);
  const sid = ids.workflowStep('w1', 'h1', 'sfarp');
  assert.deepEqual(names(checkRules(put(done, 'workflowStep', changed(done.records.workflowStep[sid], them, { note: 'after' })))), ['ended-workflow-changed']);
});

test('ticks on different hazards in two saves are both kept', () => {
  const b = base();
  const mine = setStep(b, me, { workflowId: 'w1', hazardId: 'h1', check: 'sfarp', checked: true });
  const theirs = setStep(b, { ...them, by: 'u1' }, { workflowId: 'w1', hazardId: 'h2', check: 'sfarp', checked: true, note: 'Seen' });
  const { data, conflicts } = mergeData(b, mine, theirs, saveAct);
  assert.deepEqual(conflicts, []);
  assert.equal(data.records.workflowStep[ids.workflowStep('w1', 'h1', 'sfarp')].checked, true);
  assert.equal(data.records.workflowStep[ids.workflowStep('w1', 'h2', 'sfarp')].note, 'Seen');
});

test('a take-over in one save and a tick in another both land', () => {
  const b = base();
  const mine = setStep(b, me, { workflowId: 'w1', hazardId: 'h1', check: 'sfarp', checked: true });
  const theirs = takeOverWorkflow(b, them, { workflowId: 'w1' });
  const { data } = mergeData(b, mine, theirs, saveAct);
  assert.equal(data.records.workflow.w1.ownerId, 'u2');
  assert.equal(data.records.workflowStep[ids.workflowStep('w1', 'h1', 'sfarp')].checked, true);
});

test('both completing the same review: one completed review, the date moved on once', () => {
  const b = base();
  const { data } = mergeData(b, finishPlatformReview(b, me, { workflowId: 'w1' }), finishPlatformReview(b, them, { workflowId: 'w1' }), saveAct);
  assert.equal(Object.values(data.records.review).filter((r) => r.status === 'live' && r.state === 'completed').length, 1);
  assert.equal(data.records.review[ids.workflowReview('w1')].completedBy, 'u1', 'mine wins when both completed');
  assert.equal(scheduleOf(data, 'p1', '2026-09-28').due, '2027-04-30');
  assert.deepEqual(checkRules(data), []);
});

test('I cancel a review they completed: it stays completed with all its checks', () => {
  const b = base();
  const { data, conflicts } = mergeData(b, cancelWorkflow(b, me, { workflowId: 'w1' }), finishPlatformReview(b, them, { workflowId: 'w1' }), saveAct);
  assert.equal(data.records.workflow.w1.state, 'completed');
  assert.equal(data.records.review[ids.workflowReview('w1')].state, 'completed');
  assert.ok(conflicts.some((c) => c.kind === 'workflow' && c.reason === 'workflow-ended'));
  assert.deepEqual(checkRules(data), []);
});

test('both starting a review on one platform: mine stays open, theirs is dropped and they are told', () => {
  let b = linkHazard(seed(), setup, { hazardId: 'h2', platformId: 'p1' });
  b = scheduleFixed(b, 'p1', 6, '2026-10-30', setup);
  const { data, conflicts } = mergeData(b, beginPlatformReview(b, me, { id: 'mine', platformId: 'p1' }), beginPlatformReview(b, them, { id: 'theirs', platformId: 'p1' }), saveAct);
  assert.equal(openReview(data, 'p1')?.id, 'mine');
  assert.equal(data.records.workflow.theirs.status, 'deleted');
  assert.ok(conflicts.some((c) => c.id === 'theirs'));
});

test('retiring or deleting a platform cancels its open review, which is then in History, not In progress', () => {
  const d = retirePlatform(setStep(base(), me, { workflowId: 'w1', hazardId: 'h1', check: 'sfarp', checked: true }), me, { id: 'p1' });
  assert.deepEqual([d.records.workflow.w1.status, d.records.workflow.w1.state], ['live', 'cancelled']);
  assert.equal(d.records.workflowStep[ids.workflowStep('w1', 'h1', 'sfarp')].checked, true);
  assert.deepEqual(openWorkflows(d, null), []);
  assert.deepEqual(endedWorkflows(d, {}).map((w) => w.id), ['w1']);
  let e = createPlatform(seed(), setup, { id: 'p9', name: 'Empty', ownerId: 'u1' });
  e = deletePlatform(beginPlatformReview(e, setup, { id: 'w9', platformId: 'p9' }), me, { id: 'p9' });
  assert.equal(e.records.workflow.w9.state, 'cancelled');
  assert.deepEqual(checkRules(e), []);
});
