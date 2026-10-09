import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../../src/core/errors.js';
import { entries } from '../../../src/core/history.js';
import { updatePlatform, linkHazard } from '../../../src/core/ops/platforms.js';
import { createPlatformGroup, tagPlatform } from '../../../src/core/ops/platform-groups.js';
import { startOnboarding, startWorkflow, setWorkflowPosition, setStep, cancelWorkflow, completeWorkflow } from '../../../src/core/ops/workflows.js';
import { onboardingOf } from '../../../src/core/workflows.js';
import { act, later, seed, scheduleFixed } from '../../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
const begun = () => startOnboarding(seed(), act, { id: 'w9', platformId: 'p9', name: 'Gamma', ownerId: 'u2' });

/** Gamma with everything onboarding needs on h1. */
function ready() {
  let d = begun();
  d = updatePlatform(d, act, { id: 'p9', description: 'A trailer' });
  d = createPlatformGroup(d, act, { id: 'g1', name: 'Lasers' });
  d = tagPlatform(d, act, { platformId: 'p9', groupId: 'g1' });
  d = linkHazard(d, act, { hazardId: 'h1', platformId: 'p9' });
  for (const check of ['none:failureMode', 'none:systemElement', 'none:affectedGroup', 'none:controls']) d = setStep(d, act, { workflowId: 'w9', hazardId: 'h1', check, checked: true });
  return d;
}

test('onboarding a new platform makes it and the workflow in one change, on Details, owned by its starter', () => {
  const d = begun();
  assert.deepEqual([d.records.platform.p9.name, d.records.platform.p9.ownerId], ['Gamma', 'u2']);
  const w = d.records.workflow.w9;
  assert.deepEqual([w.type, w.platformId, w.ownerId, w.state, w.at.hazardId], ['platformOnboarding', 'p9', 'u1', 'open', '@details']);
  assert.equal(onboardingOf(d, 'p9')?.id, 'w9');
  assert.equal(entries(d).at(-1).action, 'Onboard platform');
  assert.equal(entries(d).length, entries(seed()).length + 1, 'one entry');
});

test('positions include the platform steps; none ticks need the hazard on the platform', () => {
  let d = setWorkflowPosition(begun(), act, { workflowId: 'w9', hazardId: '@groups' });
  assert.equal(d.records.workflow.w9.at.hazardId, '@groups');
  assert.throws(() => setStep(d, act, { workflowId: 'w9', hazardId: 'h1', check: 'none:controls', checked: true }), code('workflow.hazard'));
  d = linkHazard(d, act, { hazardId: 'h1', platformId: 'p9' });
  assert.doesNotThrow(() => setStep(d, act, { workflowId: 'w9', hazardId: 'h1', check: 'none:controls', checked: true }));
  assert.throws(() => setStep(d, act, { workflowId: 'w9', hazardId: 'h1', check: 'sfarp', checked: true }), code('workflow.check'), 'review checks are not onboarding’s');
});

test('complete is strict, writes no review, and ends Onboarding', () => {
  assert.throws(() => completeWorkflow(begun(), act, { workflowId: 'w9' }), (e) => e instanceof PivotError && e.code === 'workflow.unmet' && /3 things are still needed/.test(e.message));
  const d = completeWorkflow(ready(), act, { workflowId: 'w9' });
  assert.equal(d.records.workflow.w9.state, 'completed');
  assert.deepEqual(d.records.workflow.w9.covered, ['h1']);
  assert.equal(onboardingOf(d, 'p9'), null);
  assert.equal(Object.keys(d.records.review).length, 0);
  assert.equal(entries(d).at(-1).action, 'Complete onboarding');
});

test('a cancelled onboarding leaves the platform Onboarding; Onboard again starts another, only one at a time', () => {
  let d = cancelWorkflow(begun(), act, { workflowId: 'w9' });
  assert.equal(onboardingOf(d, 'p9')?.id, 'w9');
  d = startWorkflow(d, later, { id: 'w10', type: 'platformOnboarding', platformId: 'p9' });
  assert.equal(onboardingOf(d, 'p9')?.id, 'w10');
  assert.equal(d.records.workflow.w10.at.hazardId, '@details');
  assert.throws(() => startWorkflow(d, later, { type: 'platformOnboarding', platformId: 'p9' }), code('onboarding.open'));
  assert.throws(() => startWorkflow(seed(), act, { type: 'platformOnboarding', platformId: 'p1' }), code('onboarding.not'), 'a platform not Onboarding');
});

test('a review cannot start while the platform is Onboarding', () => {
  const d = scheduleFixed(begun(), 'p9', 6, '2026-10-30');
  assert.throws(() => startWorkflow(d, act, { type: 'platformReview', platformId: 'p9' }), (e) => e instanceof PivotError && e.code === 'review.onboarding' && /Finish onboarding Gamma first/.test(e.message));
});
