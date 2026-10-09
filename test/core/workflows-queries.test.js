import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startWorkflow, setStep, cancelWorkflow } from '../../src/core/ops/workflows.js';
import { updateHazard } from '../../src/core/ops/hazards.js';
import { linkHazard, unlinkHazard } from '../../src/core/ops/platforms.js';
import { hazardLastReviewed } from '../../src/core/queries.js';
import { openWorkflows, endedWorkflows, workflowChanges, workflowHazards, lastActivity, WORKFLOW_TYPES, CHECKS } from '../../src/core/workflows.js';
import { act, later, seed, scheduleFixed, finishPlatformReview } from '../helpers.js';

const at = (iso) => ({ by: 'u1', at: iso });

test('open workflows, newest activity first, filtered by owner', () => {
  let d = startWorkflow(seed(), act, { id: 'w1', type: 'platformReview', platformId: 'p1' });
  d = startWorkflow(d, later, { id: 'w2', type: 'platformReview', platformId: 'p2' });
  assert.deepEqual(openWorkflows(d, null).map((w) => w.id), ['w2', 'w1']);
  assert.deepEqual(openWorkflows(d, 'u1').map((w) => w.id), ['w1']);
  d = setStep(d, at('2026-09-28T12:00:00+10:00'), { workflowId: 'w1', hazardId: 'h1', check: 'sfarp', checked: true });
  assert.equal(lastActivity(d, d.records.workflow.w1), '2026-09-28T12:00:00+10:00');
  assert.deepEqual(openWorkflows(d, null).map((w) => w.id), ['w1', 'w2'], 'a tick is activity');
});

test('ended workflows: completed and cancelled, newest first, since a date and by owner', () => {
  let d = scheduleFixed(seed(), 'p1', 6, '2026-10-30');
  d = startWorkflow(d, act, { id: 'w1', type: 'platformReview', platformId: 'p1' });
  d = finishPlatformReview(d, at('2026-09-01T10:00:00+10:00'), { workflowId: 'w1' });
  d = startWorkflow(d, later, { id: 'w2', type: 'platformReview', platformId: 'p2' });
  d = cancelWorkflow(d, { by: 'u2', at: '2026-09-20T10:00:00+10:00' }, { workflowId: 'w2' });
  assert.deepEqual(endedWorkflows(d, {}).map((w) => w.id), ['w2', 'w1']);
  assert.deepEqual(endedWorkflows(d, { since: '2026-09-10' }).map((w) => w.id), ['w2']);
  assert.deepEqual(endedWorkflows(d, { ownerId: 'u1' }).map((w) => w.id), ['w1']);
});

test('the changes made through a workflow leave out its own bookkeeping', () => {
  let d = startWorkflow(seed(), act, { id: 'w1', type: 'platformReview', platformId: 'p1' });
  d = setStep(d, { ...act, workflowId: 'w1' }, { workflowId: 'w1', hazardId: 'h1', check: 'sfarp', checked: true });
  d = updateHazard(d, { ...act, workflowId: 'w1' }, { id: 'h1', title: 'Fire on board' });
  d = updateHazard(d, act, { id: 'h1', title: 'Fire' });
  assert.deepEqual(workflowChanges(d, 'w1').map((e) => e.action), ['Edit hazard']);
});

test('a finished workflow lists the hazards it checked, even after they leave the platform', () => {
  let d = scheduleFixed(seed(), 'p1', 6, '2026-10-30');
  d = finishPlatformReview(startWorkflow(d, act, { id: 'w1', type: 'platformReview', platformId: 'p1' }), act, { workflowId: 'w1' });
  assert.deepEqual(workflowHazards(d, d.records.workflow.w1).map((x) => x.hazard.id), ['h1']);
  assert.equal(CHECKS.length, 6);
  assert.deepEqual(WORKFLOW_TYPES.map((t) => [t.type, t.ready]), [['platformReview', true], ['platformOnboarding', false], ['newTechData', false], ['transferOwner', false], ['referenceUpdate', false]]);
});

test('a finished workflow lists the hazards on the platform when it ended, not one unlinked partway through', () => {
  let d = scheduleFixed(seed(), 'p1', 6, '2026-10-30');
  d = startWorkflow(d, act, { id: 'w1', type: 'platformReview', platformId: 'p1' });
  for (const check of ['safetyReports', 'references', 'controls']) d = setStep(d, act, { workflowId: 'w1', hazardId: 'h1', check, checked: true });
  d = linkHazard(d, act, { hazardId: 'h2', platformId: 'p1' });
  d = unlinkHazard(d, act, { hazardId: 'h1', platformId: 'p1' });
  d = finishPlatformReview(d, act, { workflowId: 'w1' });
  assert.deepEqual(workflowHazards(d, d.records.workflow.w1).map((x) => x.hazard.id), ['h2']);
  assert.equal(hazardLastReviewed(d, 'h1', 'p1'), null, 'h1 left before the review was completed');
  assert.equal(hazardLastReviewed(d, 'h2', 'p1'), act.at);
});

test('a cancelled workflow lists every hazard that was in it, ticked or not', () => {
  let d = linkHazard(seed(), act, { hazardId: 'h2', platformId: 'p1' });
  d = startWorkflow(d, act, { id: 'w1', type: 'platformReview', platformId: 'p1' });
  d = setStep(d, act, { workflowId: 'w1', hazardId: 'h1', check: 'sfarp', checked: true });
  d = cancelWorkflow(d, act, { workflowId: 'w1' });
  assert.deepEqual(workflowHazards(d, d.records.workflow.w1).map((x) => x.hazard.id), ['h1', 'h2']);
});
