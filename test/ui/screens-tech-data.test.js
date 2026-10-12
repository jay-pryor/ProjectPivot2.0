import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workflowView } from '../../src/ui/screens/workflow.js';
import { createReference } from '../../src/core/ops/references.js';
import { startWorkflow, setTechScope, setStep, completeWorkflow, addTechHazard, setTechDraft } from '../../src/core/ops/workflows.js';
import { setSfarp } from '../../src/core/ops/assessment.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { TECH_CARDS } from '../../src/core/workflows.js';
import { state } from './screens-workflows.test.js';
import { seed, act } from '../helpers.js';

const at = (hazardId) => ({ ...state, view: { name: 'workflow', id: 't1', ...(hazardId === undefined ? {} : { hazardId }) } });
const scope = (d, platformId, hazardId) => setTechScope(d, act, { workflowId: 't1', platformId, hazardId, checked: true });
function started() {
  const d = createReference(seed(), act, { id: 'r1', title: 'Service bulletin 12', revision: 'A', url: 'https://sb12' });
  return assignNumbers(startWorkflow(d, act, { id: 't1', type: 'newTechData', referenceId: 'r1' }));
}
const scoped = () => assignNumbers(scope(scope(started(), 'p1'), 'p1', 'h1'));
const answerAll = (d, key, a = 'none') => TECH_CARDS.reduce((x, c) => setStep(x, act, { workflowId: 't1', hazardId: key, check: c, answer: a }), d);

test('it opens on the scope: every platform as a tick, a ticked one with its hazards, Add hazard… and a new hazard title', () => {
  const out = workflowView(at(), scoped(), 't1').toString();
  assert.match(out, /New Tech Data · <button[^>]*data-view="reference"[^>]*>Service bulletin 12/);
  assert.match(out, /<h2>Scope<\/h2>/);
  assert.match(out, /data-change="setTechScope"[^>]*data-platform-id="p1"/);
  assert.match(out, /data-change="setTechScope"[^>]*data-platform-id="p2"/);
  assert.match(out, /data-hazard-id="h1"[^>]*>[^<]*HAZ-001[^<]*Fire|HAZ-001<\/span> Fire/);
  assert.match(out, /data-picker="linkHazards"[^>]*data-workflow-id="t1"|data-workflow-id="t1"[^>]*data-picker="linkHazards"/);
  assert.match(out, /data-action="addTechHazard"[\s\S]*?name="title"/);
  assert.ok(out.indexOf('data-platform-id="p1"') < out.indexOf('data-platform-id="p2"'), 'the ticked platform first');
});

test('the rail: Scope, each platform with its hazards and their answers out of 4, then the summary', () => {
  const d = setStep(scoped(), act, { workflowId: 't1', hazardId: 'p1|h1', check: 'controls', answer: 'none' });
  const out = workflowView(at(), d, 't1').toString();
  assert.match(out, /class="wf-rail"[\s\S]*?Scope[\s\S]*?Alpha[\s\S]*?Fire[\s\S]*?1\/4[\s\S]*?Summary &amp; complete/);
  assert.match(out, /data-hazard-id="p1\|h1"/);
});

test('a pair page: four cards, each with its editor, Changed / No change in its own form, and a note', () => {
  const d = setStep(scoped(), act, { workflowId: 't1', hazardId: 'p1|h1', check: 'sfarp', answer: 'changed' });
  const out = workflowView(at('p1|h1'), d, 't1').toString();
  for (const w of ['Controls', 'Safety reports', 'Residual rating &amp; justification', 'SFARP']) assert.match(out, new RegExp(`aria-label="${w}"`));
  assert.equal((out.match(/<form class="wf-answer"/g) ?? []).length, 4, 'each card’s radios are their own group');
  assert.match(out, /type="radio" name="answer" value="changed" checked[^>]*data-check="sfarp"/);
  assert.match(out, /No changes recorded here yet/, 'Changed, with nothing made through it on SFARP');
  assert.match(out, /← Scope[\s\S]*?Summary &amp; complete →/);
});

test('the soft warning goes once a change made through it touches the card', () => {
  let d = setStep(scoped(), act, { workflowId: 't1', hazardId: 'p1|h1', check: 'sfarp', answer: 'changed' });
  d = setSfarp(d, { ...act, workflowId: 't1' }, { hazardId: 'h1', platformId: 'p1', justification: 'Per SB12' });
  const out = workflowView(at('p1|h1'), d, 't1').toString();
  assert.match(out, /aria-label="SFARP"/, 'on the pair page');
  assert.doesNotMatch(out, /No changes recorded here yet/);
});

test('the summary: the grid, what Complete will link, the outcome, and Complete held until all is answered', () => {
  let d = scoped();
  let out = workflowView(at('summary'), d, 't1').toString();
  assert.match(out, /Complete — 4 still needed/);
  assert.match(out, /Platform: Alpha/);
  d = answerAll(d, 'p1|h1');
  d = setStep(d, act, { workflowId: 't1', hazardId: 'p1|h1', check: 'residual', answer: 'changed' });
  out = workflowView(at('summary'), d, 't1').toString();
  assert.match(out, /Hazard: HAZ-001 Fire/);
  assert.match(out, /data-change="setWorkflowOutcome"/);
  assert.match(out, /data-action="completeWorkflow"[^>]*>Complete</);
  assert.match(out, /<td class="yes">Changed/);
});

test('someone else sees it read-only: no add-hazard forms, every input disabled', () => {
  const out = workflowView({ ...at(), profileId: 'u2' }, scoped(), 't1').toString();
  assert.match(out, /<h2>Scope<\/h2>/);
  assert.doesNotMatch(out, /data-action="addTechHazard"/);
  assert.match(out, /<fieldset class="wf-fields" disabled>/);
  assert.match(out, /Take over…/);
});

test('completed: the grid, what it linked, the outcome and the changes made through it; an added hazard is tagged in the scope', () => {
  let d = addTechHazard(scoped(), act, { workflowId: 't1', platformId: 'p1', hazardId: 'h2' });
  assert.match(workflowView(at('@scope'), assignNumbers(d), 't1').toString(), /Flood<\/label> <span class="tag">Added<\/span>/);
  d = answerAll(answerAll(d, 'p1|h1'), 'p1|h2');
  d = setStep(d, act, { workflowId: 't1', hazardId: 'p1|h1', check: 'controls', answer: 'none', note: 'Nothing for us' });
  d = completeWorkflow(assignNumbers(d), { ...act, workflowId: 't1' }, { workflowId: 't1' });
  const out = workflowView(at(), d, 't1').toString();
  assert.match(out, /tag wf-completed/);
  assert.match(out, /Linked to[\s\S]*?Platform: Alpha[\s\S]*?Hazard: HAZ-002 Flood/);
  assert.match(out, /Nothing for us/);
  assert.match(out, /Changes made through WF-/);
});

test('started with no reference, it opens on the Reference step: a new reference to fill in, or an existing one to choose', () => {
  const d = startWorkflow(createReference(seed(), act, { id: 'r1', title: 'Service bulletin 12', url: 'x' }), act, { id: 't1', type: 'newTechData' });
  const out = workflowView(at(), d, 't1').toString();
  assert.match(out, /New Tech Data · New tech data, no reference yet/);
  assert.match(out, /class="wf-rail"[\s\S]*?data-hazard-id="@reference"[\s\S]*?Reference[\s\S]*?data-hazard-id="@scope"/);
  assert.match(out, /<h2>Reference<\/h2>/);
  for (const f of ['title', 'docNumber', 'revision', 'url', 'path']) assert.match(out, new RegExp(`name="${f}"[^>]*data-change="setTechDraft"`));
  assert.match(out, /data-action="uploadTechFile"/);
  assert.match(out, /data-change="setTechReference"[\s\S]*?Service bulletin 12/);
});

test('a drafted reference names the workflow, and the summary says Complete will make it', () => {
  const d = setTechDraft(startWorkflow(seed(), act, { id: 't1', type: 'newTechData' }), act, { workflowId: 't1', title: 'Test report 7', url: 'https://tr7' });
  assert.match(workflowView(at(), d, 't1').toString(), /New Tech Data · Test report 7/);
  assert.match(workflowView(at('summary'), d, 't1').toString(), /Completing makes the new reference Test report 7 and links it to/);
});

test('with an existing reference chosen, the Reference step says so and offers the new one back', () => {
  const out = workflowView(at('@reference'), scoped(), 't1').toString();
  assert.match(out, /Using[\s\S]*?Service bulletin 12/);
  assert.match(out, /data-action="setTechReference"[^>]*>Use a new reference instead/);
});
