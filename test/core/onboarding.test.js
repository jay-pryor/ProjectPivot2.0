import { test } from 'node:test';
import assert from 'node:assert/strict';
import { created, put } from '../../src/core/data.js';
import { updatePlatform, linkHazard } from '../../src/core/ops/platforms.js';
import { tagPlatform, createPlatformGroup } from '../../src/core/ops/platform-groups.js';
import { addFailureMode, addAffectedGroup, addConsequence, deleteConsequence } from '../../src/core/ops/hazards.js';
import { setSfarp } from '../../src/core/ops/assessment.js';
import { onboardingOf, onboardingProgress, workflowProgress } from '../../src/core/workflows.js';
import { act, seed } from '../helpers.js';

/** p1 Alpha with h1; an open onboarding w1 on it (made directly, so this test needs no ops from Task 3). */
export function onboarding(d = seed(), state = 'open') {
  return put(d, 'workflow', created(act, 'w1', { number: null, type: 'platformOnboarding', platformId: 'p1', ownerId: 'u1', state, at: { hazardId: '@details' }, outcome: '', notes: '', endedBy: null, endedAt: null }));
}
const step = (d, hazardId, check, checked = true) => put(d, 'workflowStep', created(act, `ws:w1:${hazardId}:${check}`, { workflowId: 'w1', hazardId, check, checked, note: '' }));
const prog = (d) => onboardingProgress(d, d.records.workflow.w1);

test('a platform is Onboarding while its latest onboarding is not completed', () => {
  assert.equal(onboardingOf(seed(), 'p1'), null, 'never onboarded: a normal platform');
  assert.equal(onboardingOf(onboarding(), 'p1')?.id, 'w1');
  assert.equal(onboardingOf(onboarding(seed(), 'cancelled'), 'p1')?.id, 'w1', 'cancelled stays Onboarding');
  assert.equal(onboardingOf(onboarding(seed(), 'completed'), 'p1'), null);
});

test('a platform has a description', () => {
  const d = updatePlatform(seed(), act, { id: 'p1', description: '  A laser trailer  ' });
  assert.deepEqual([d.records.platform.p1.name, d.records.platform.p1.description], ['Alpha', 'A laser trailer']);
  assert.equal(updatePlatform(d, act, { id: 'p1', name: 'Alpha 2' }).records.platform.p1.description, 'A laser trailer');
});

test('platform requirements: details need a description, groups at least one, hazards at least one', () => {
  let d = onboarding();
  assert.deepEqual([prog(d).details, prog(d).groups, prog(d).hazards], [false, false, true]);
  d = updatePlatform(d, act, { id: 'p1', description: 'Trailer' });
  d = createPlatformGroup(d, act, { id: 'g1', name: 'Lasers' });
  d = tagPlatform(d, act, { platformId: 'p1', groupId: 'g1' });
  assert.deepEqual([prog(d).details, prog(d).groups], [true, true]);
  assert.ok(prog(d).unmet.some((u) => u.hazardId === 'h1'));
  assert.ok(!prog(d).unmet.some((u) => u.hazardId === null));
});

test('facets: each of the five needs an entry or its none tick; a tick plus an entry still counts', () => {
  let d = onboarding();
  assert.deepEqual(prog(d).perHazard.get('h1').facets, { causalFactor: true, systemElement: false, failureMode: false, consequence: true, affectedGroup: false }, 'seed h1 has a causal factor for every platform, and a consequence');
  d = addFailureMode(d, act, { hazardId: 'h1', platformId: 'p1', text: 'Beam misaligned' });
  d = step(d, 'h1', 'none:systemElement');
  d = step(d, 'h1', 'none:affectedGroup');
  d = addAffectedGroup(d, act, { hazardId: 'h1', platformId: 'p1', text: 'Crew' });
  assert.deepEqual(prog(d).perHazard.get('h1').facets, { causalFactor: true, systemElement: true, failureMode: true, consequence: true, affectedGroup: true });
  assert.equal(prog(d).perHazard.get('h1').required, 1, 'facets are all a hazard needs');
  d = step(d, 'h1', 'none:systemElement', false);
  assert.equal(prog(d).perHazard.get('h1').facets.systemElement, false, 'an unticked none counts as not ticked');
});

test('consequences are the hazard\'s: met by one on the hazard, or by None applies', () => {
  let d = onboarding();
  d = deleteConsequence(d, act, { id: 'cq1' });
  assert.equal(prog(d).perHazard.get('h1').facets.consequence, false);
  assert.ok(prog(d).unmet.some((u) => u.hazardId === 'h1' && u.what.includes('consequences')));
  assert.equal(prog(step(d, 'h1', 'none:consequence')).perHazard.get('h1').facets.consequence, true);
  assert.equal(prog(addConsequence(d, act, { hazardId: 'h1', text: 'Smoke inhalation' })).perHazard.get('h1').facets.consequence, true);
});

test('controls are not required: none on the hazard here leaves nothing unmet for them', () => {
  const d = onboarding();
  assert.ok(!prog(d).unmet.some((u) => /control/i.test(u.what)));
  assert.equal('implemented' in prog(d).perHazard.get('h1'), false);
});

test('optional cards say whether they have anything; progress counts requirements met', () => {
  let d = onboarding();
  assert.deepEqual(prog(d).perHazard.get('h1').optional, { controls: true, ratings: false, justifications: false, sfarp: false }, 'c1 and c2 are on h1 as recommended');
  d = setSfarp(d, act, { hazardId: 'h1', platformId: 'p1', conclusion: 'Tolerable' });
  assert.equal(prog(d).perHazard.get('h1').optional.sfarp, true);
  const p = workflowProgress(d, d.records.workflow.w1);
  assert.deepEqual([p.done, p.total, p.perHazard.get('h1')], [1, 4, 0], 'hazards met; details and groups not; h1 has 0 of 1');
});
