import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workflowView } from '../../src/ui/screens/workflow.js';
import { updatePlatform, linkHazard } from '../../src/core/ops/platforms.js';
import { createPlatformGroup, tagPlatform } from '../../src/core/ops/platform-groups.js';
import { setOptionGroup, createFacetOption } from '../../src/core/ops/facets.js';
import { setControlStatus } from '../../src/core/ops/assessment.js';
import { cancelWorkflow } from '../../src/core/ops/workflows.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { state } from './screens-workflows.test.js';
import { seed, act, beginOnboarding } from '../helpers.js';

/** Gamma being onboarded by Ada (w9), in group Lasers, with h1 suggested from Lasers. */
export function onboardingData() {
  let d = beginOnboarding(seed(), act, { id: 'w9', platformId: 'p9', name: 'Gamma', ownerId: 'u1' });
  d = createPlatformGroup(d, act, { id: 'g1', name: 'Lasers' });
  d = tagPlatform(d, act, { platformId: 'p9', groupId: 'g1' });
  d = setOptionGroup(d, act, { facet: 'hazard', optionId: 'h1', groupId: 'g1', on: true });
  return assignNumbers(d);
}
export const on = (extra = {}) => ({ ...state, view: { name: 'workflow', id: 'w9', ...extra } });

test('the rail has the platform steps with their state, the hazards, and the summary; it opens on Details', () => {
  const out = workflowView(on(), onboardingData(), 'w9').toString();
  assert.match(out, /WF-001[\s\S]*Platform Onboarding[\s\S]*Gamma/);
  assert.match(out, /class="wf-rail"[\s\S]*Details[\s\S]*Groups[\s\S]*Hazards[\s\S]*Summary &amp; complete|Summary & complete/);
  assert.match(out, /wf-rail-item on[^>]*>[\s\S]*?Details/);
  assert.match(out, /name="description"[^>]*data-change="updatePlatform"/);
  assert.match(out, /name="ownerId"[^>]*data-change="setOwner"/);
  assert.match(out, /Add image/);
});

test('the Groups step lists the tags with a + for more; the Hazards step suggests from the groups', () => {
  const d = onboardingData();
  const gs = workflowView(on({ hazardId: '@groups' }), d, 'w9').toString();
  assert.match(gs, /group-tag">Lasers/);
  assert.match(gs, /data-picker="tagPlatforms"/);
  const hz = workflowView(on({ hazardId: '@hazards' }), d, 'w9').toString();
  assert.match(hz, /Suggested from your groups[\s\S]*name="hazardId" value="h1"[\s\S]*HAZ-001 Fire[\s\S]*Lasers/);
  assert.match(hz, /data-action="linkHazards"/);
  assert.match(hz, /data-picker="linkHazards"/);
});

test('the summary lists what is still needed and keeps Complete disabled', () => {
  const sum = workflowView(on({ hazardId: 'summary' }), onboardingData(), 'w9').toString();
  assert.match(sum, /A description of the platform/);
  assert.match(sum, /At least one hazard/);
  assert.match(sum, /Complete onboarding — 2 still needed<\/button>/);
  assert.match(sum, /data-action="completeWorkflow"[^>]*disabled/);
  const done = updatePlatform(onboardingData(), act, { id: 'p9', description: 'x' });
  assert.match(workflowView(on({ hazardId: 'summary' }), done, 'w9').toString(), /At least one hazard/);
});

test('a cancelled onboarding shows its requirements grid', () => {
  const d = cancelWorkflow(linkHazard(onboardingData(), act, { hazardId: 'h1', platformId: 'p9' }), act, { workflowId: 'w9' });
  const out = workflowView(on(), d, 'w9').toString();
  assert.match(out, /tag wf-cancelled/);
  assert.match(out, /class="wf-grid"/);
});
test('a hazard’s cards: facets with group suggestions and None applies, implemented controls with what is missing, the optional cards', () => {
  let d = linkHazard(onboardingData(), act, { hazardId: 'h1', platformId: 'p9' });
  d = createFacetOption(d, act, { id: 'fL', facet: 'failureMode', name: 'Beam misaligned' });
  d = setOptionGroup(d, act, { facet: 'failureMode', optionId: 'fL', groupId: 'g1', on: true });
  d = setOptionGroup(d, act, { facet: 'control', optionId: 'c1', groupId: 'g1', on: true });
  const s = { ...on({ hazardId: 'h1' }), editing: { kind: 'newFailureMode', id: 'h1:p9' } };
  const out = workflowView(s, d, 'w9').toString();
  assert.match(out, /1<\/span> Facets[\s\S]*Needed/);
  assert.match(out, /Suggested from your groups[\s\S]*Beam misaligned[\s\S]*Lasers/);
  assert.match(out, /name="checked"[^>]*data-check="none:failureMode"|data-check="none:failureMode"[^>]*name="checked"/);
  assert.match(out, /2<\/span> Implemented controls[\s\S]*Suggested from your groups[\s\S]*value="c1"[\s\S]*Sprinklers/);
  assert.match(out, /data-action="addSuggestedControls"/);
  assert.match(out, /data-check="none:controls"/);
  for (const card of ['3</span> Other controls', '4</span> Risk ratings', '5</span> Risk justifications', '6</span> SFARP']) assert.ok(out.includes(card), card);
  assert.match(out, /Consequences/);
});

test('an implemented control shows its missing properties; None applies is disabled while a facet has entries', () => {
  let d = linkHazard(onboardingData(), act, { hazardId: 'h1', platformId: 'p9' });
  d = setControlStatus(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p9', status: 'implemented' });
  const out = workflowView(on({ hazardId: 'h1' }), d, 'w9').toString();
  assert.match(out, /class="wf-missing"[^>]*>Missing: tier, origin, description, implemented by/);
  assert.match(out, /data-check="none:causalFactor"[^>]*disabled|disabled[^>]*data-check="none:causalFactor"/, 'h1 has a causal factor');
});
