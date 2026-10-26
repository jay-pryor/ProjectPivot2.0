import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workflowView } from '../../src/ui/screens/workflow.js';
import { updatePlatform, linkHazard } from '../../src/core/ops/platforms.js';
import { createPlatformGroup, tagPlatform } from '../../src/core/ops/platform-groups.js';
import { setOptionGroup, createFacetOption } from '../../src/core/ops/facets.js';
import { createControl } from '../../src/core/ops/controls.js';
import { cancelWorkflow } from '../../src/core/ops/workflows.js';
import { assignNumbers, addCausalFactor } from '../../src/core/ops/hazards.js';
import { setRating } from '../../src/core/ops/assessment.js';
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
test('a hazard’s cards: the five facets in order with group suggestions and None applies, then the optional cards', () => {
  let d = linkHazard(onboardingData(), act, { hazardId: 'h1', platformId: 'p9' });
  d = createFacetOption(d, act, { id: 'fL', facet: 'failureMode', name: 'Beam misaligned' });
  d = setOptionGroup(d, act, { facet: 'failureMode', optionId: 'fL', groupId: 'g1', on: true });
  d = createControl(d, act, { id: 'c3', title: 'Beam stop' });
  d = setOptionGroup(d, act, { facet: 'control', optionId: 'c3', groupId: 'g1', on: true });
  const s = { ...on({ hazardId: 'h1' }), editing: { kind: 'newFailureMode', id: 'h1:p9' } };
  const out = workflowView(s, d, 'w9').toString();
  assert.match(out, /1<\/span> Facets[\s\S]*Needed/);
  assert.match(out, /aria-label="Causal factors"[\s\S]*aria-label="System\/Element"[\s\S]*aria-label="Element failure modes"[\s\S]*aria-label="Consequences"[\s\S]*aria-label="Affected groups"/);
  assert.match(out, /Suggested from your groups[\s\S]*Beam misaligned[\s\S]*Lasers/);
  for (const f of ['causalFactor', 'systemElement', 'failureMode', 'consequence', 'affectedGroup']) assert.ok(out.includes(`data-check="none:${f}"`), f);
  assert.match(out, /data-action="startEdit" data-kind="newConsequence"/, 'consequences can be added here');
  assert.match(out, /2<\/span> Controls <span class="tag wf-badge filled|2<\/span> Controls <span class="tag wf-badge met/, 'controls are optional');
  assert.match(out, /2<\/span> Controls[\s\S]*Suggested from your groups[\s\S]*value="c3"[\s\S]*Beam stop[\s\S]*Add ticked controls/);
  assert.ok(!out.includes('Implemented controls') && !out.includes('none:controls') && !out.includes('Other controls'));
  for (const card of ['3</span> Risk ratings', '4</span> Risk justifications', '5</span> SFARP']) assert.ok(out.includes(card), card);
  assert.match(out, /0\/1 required/);
});

test('adding a causal factor offers the hazard’s from other platforms, and every other one under a closed Other list', () => {
  let d = linkHazard(onboardingData(), act, { hazardId: 'h1', platformId: 'p9' });
  d = createFacetOption(d, act, { id: 'o1', facet: 'causalFactor', name: 'Fuel leak' });
  d = addCausalFactor(d, act, { hazardId: 'h1', platformId: 'p1', text: 'Battery fire' });
  const out = workflowView({ ...on({ hazardId: 'h1' }), editing: { kind: 'newCausalFactor', id: 'h1' } }, d, 'w9').toString();
  assert.match(out, /other platforms<\/p>[\s\S]*value="Battery fire"[\s\S]*Alpha/);
  assert.match(out, /<details class="suggest suggest-more"><summary class="suggest-h">Other causal factors <span class="count">1<\/span><\/summary>[\s\S]*name="pick" value="Fuel leak"/);
  assert.ok(!/<details class="suggest suggest-more" open/.test(out), 'closed to begin with');
});

test('None applies is disabled while a facet has entries', () => {
  const d = linkHazard(onboardingData(), act, { hazardId: 'h1', platformId: 'p9' });
  const out = workflowView(on({ hazardId: 'h1' }), d, 'w9').toString();
  assert.match(out, /data-check="none:causalFactor"[^>]*disabled|disabled[^>]*data-check="none:causalFactor"/, 'h1 has a causal factor');
  assert.match(out, /data-check="none:consequence"[^>]*disabled|disabled[^>]*data-check="none:consequence"/, 'h1 has a consequence');
});

test('an onboarding left on its summary reopens on the summary', () => {
  const d = onboardingData();
  const w = { ...d.records.workflow.w9, at: { hazardId: null } };
  const out = workflowView(on(), { ...d, records: { ...d.records, workflow: { ...d.records.workflow, w9: w } } }, 'w9').toString();
  assert.match(out, /<h2>Summary<\/h2>/);
});

test('the Risk ratings card offers Copy from… for a stage another platform has rated', () => {
  let d = linkHazard(onboardingData(), act, { hazardId: 'h1', platformId: 'p9' });
  const card = (/** @type {any} */ x) => /3<\/span> Risk ratings[\s\S]*?4<\/span> Risk justifications/.exec(workflowView(on({ hazardId: 'h1' }), x, 'w9').toString())?.[0] ?? '';
  assert.ok(!card(d).includes('data-picker="copyStage"'), 'nothing to copy yet');
  d = setRating(d, act, { hazardId: 'h1', platformId: 'p1', stage: 'residual', likelihood: 'C', consequence: 2 });
  assert.match(card(d), /<h4>Initial<\/h4>[\s\S]*<h4>Residual<button type="button" class="copy-stage" data-action="openPicker" data-picker="copyStage" data-hazard-id="h1" data-platform-id="p9" data-stage="residual"/);
});

test('a facet list with two or more entries can be reordered: a drag handle and ↑ ↓ on each row', () => {
  let d = linkHazard(onboardingData(), act, { hazardId: 'h1', platformId: 'p9' });
  d = addCausalFactor(d, act, { hazardId: 'h1', platformId: 'p9', text: 'Laser strike' });
  const out = workflowView(on({ hazardId: 'h1' }), d, 'w9').toString();
  assert.match(out, /class="nl-grip" draggable="true"[^>]*data-move-action="moveCausalFactor" data-move-id="cf1" data-move-index="0" data-move-platform-id="p9"/);
  assert.match(out, /aria-label="Move causal factor 1 up" disabled data-action="moveCausalFactor" data-id="cf1" data-to="-1"/);
  assert.match(out, /aria-label="Move causal factor 1 down" data-action="moveCausalFactor" data-id="cf1" data-to="1" data-platform-id="p9"/);
  assert.ok(!out.includes('data-move-action="moveConsequence"'), 'one consequence: nothing to reorder');
});
