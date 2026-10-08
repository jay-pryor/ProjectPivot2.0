import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workflowView } from '../../src/ui/screens/workflow.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { linkHazard } from '../../src/core/ops/platforms.js';
import { setStep, cancelWorkflow } from '../../src/core/ops/workflows.js';
import { updateHazard } from '../../src/core/ops/hazards.js';
import { state } from './screens-workflows.test.js';
import { seed, act, scheduleFixed, beginPlatformReview, finishPlatformReview } from '../helpers.js';

/** w1 (Ada) on p1 with h1 and h2; h1 has controls ticked with a note. */
function data() {
  let d = linkHazard(scheduleFixed(seed(), 'p1', 6, '2026-10-30'), act, { hazardId: 'h2', platformId: 'p1' });
  d = beginPlatformReview(d, act, { id: 'w1', platformId: 'p1' });
  d = setStep(d, act, { workflowId: 'w1', hazardId: 'h1', check: 'controls', checked: true, note: 'Added C-009' });
  return assignNumbers(d);
}
const on = (extra = {}) => ({ ...state, view: { name: 'workflow', id: 'w1', ...extra } });

test('the owner sees the rail with progress, the six checks on the current hazard, notes and ticks, and Cancel behind a confirm', () => {
  const out = workflowView(on(), data(), 'w1').toString();
  assert.match(out, /WF-001/);
  assert.match(out, /class="wf-rail"/);
  assert.match(out, /Fire[\s\S]*?1\/6/);
  assert.match(out, /Flood[\s\S]*?0\/6/);
  assert.match(out, /Summary &amp; complete|Summary & complete/);
  for (const w of ['Safety reports', 'References', 'Controls', 'Residual risk ratings', 'Residual risk justifications', 'SFARP']) assert.match(out, new RegExp(`wf-check-h[^]*?${w}`));
  assert.match(out, /value="Added C-009"/);
  assert.match(out, /name="checked" checked/);
  assert.match(out, /<details class="confirm"><summary>Cancel workflow…<\/summary>[\s\S]*changes you made to hazards stay/);
  assert.doesNotMatch(out, /<fieldset[^>]*disabled/);
  assert.match(out, /Next hazard →/);
});

test('the rail opens the hazard chosen; the summary shows the grid, outcome, notes and Complete disabled with what is left', () => {
  const flood = workflowView(on({ hazardId: 'h2' }), data(), 'w1').toString();
  assert.match(flood, /class="wf-hazard-h"[\s\S]*Flood/);
  assert.match(flood, /← Previous hazard/);
  const sum = workflowView(on({ hazardId: 'summary' }), data(), 'w1').toString();
  assert.match(sum, /class="wf-grid"/);
  assert.match(sum, /name="outcome"/);
  assert.match(sum, /name="notes"/);
  assert.match(sum, /Complete review — 11 checks not ticked<\/button>/);
  assert.match(sum, /data-action="completeWorkflow"[^>]*disabled/);
});

test('someone else sees it read-only, with the owner named and Take over behind a confirm', () => {
  const out = workflowView({ ...on(), profileId: 'u2' }, data(), 'w1').toString();
  assert.match(out, /Owned by Ada/);
  assert.match(out, /<details class="confirm"><summary>Take over…<\/summary>/);
  assert.match(out, /<fieldset class="wf-fields" disabled>/);
  assert.doesNotMatch(out, /Cancel workflow…/);
});

test('a completed workflow: read-only grid, outcome, and the changes made through it', () => {
  let d = updateHazard(data(), { ...act, workflowId: 'w1' }, { id: 'h1', title: 'Fire on board' });
  d = finishPlatformReview(d, act, { workflowId: 'w1' });
  const out = workflowView(on(), d, 'w1').toString();
  assert.match(out, /tag wf-completed/);
  assert.match(out, /class="wf-grid"/);
  assert.match(out, /Changes made through WF-001/);
  assert.match(out, /Edit hazard/);
  assert.doesNotMatch(out, /class="wf-rail"/);
});

test('a cancelled workflow says so, and keeps its ticks', () => {
  const d = cancelWorkflow(data(), act, { workflowId: 'w1' });
  const out = workflowView(on(), d, 'w1').toString();
  assert.match(out, /tag wf-cancelled/);
  assert.match(out, /Added C-009/);
});

test('an unsaved workflow is named as this workflow in its confirm, never TBC', () => {
  let d = linkHazard(seed(), act, { hazardId: 'h2', platformId: 'p1' });
  d = beginPlatformReview(d, act, { id: 'w1', platformId: 'p1' });
  const out = workflowView(on(), d, 'w1').toString();
  assert.match(out, /Cancel this workflow/);
  assert.doesNotMatch(out, /Cancel TBC/);
});
