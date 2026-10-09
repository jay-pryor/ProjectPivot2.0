import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workflowsView } from '../../src/ui/screens/workflows.js';
import { initialState } from '../../src/ui/controller.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { cancelWorkflow, setStep } from '../../src/core/ops/workflows.js';
import { seed, act, later, scheduleFixed, beginPlatformReview, finishPlatformReview } from '../helpers.js';

export const state = { ...initialState(), screen: 'main', today: '2026-09-28', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }, { id: 'u2', name: 'Grace', createdAt: '' }], profileId: 'u1', view: { name: 'workflows' } };

/** w1 open on p1 (Ada, 1 of 6 ticked), w2 open on p2 (Grace); p1 every 6 months due 2026-09-01 (overdue). */
export function data() {
  let d = scheduleFixed(seed(), 'p1', 6, '2026-09-01');
  d = beginPlatformReview(d, act, { id: 'w1', platformId: 'p1' });
  d = setStep(d, act, { workflowId: 'w1', hazardId: 'h1', check: 'sfarp', checked: true });
  d = beginPlatformReview(d, later, { id: 'w2', platformId: 'p2' });
  return assignNumbers(d);
}

test('in progress: every owner by default, with number, workflow, subject, owner, progress and Resume', () => {
  const out = workflowsView(state, data()).toString();
  assert.match(out, /<h2>In progress<\/h2>/);
  assert.match(out, /WF-001/);
  assert.match(out, /WF-002/);
  assert.match(out, /Platform Review/);
  assert.match(out, /Alpha/);
  assert.match(out, /Grace/);
  assert.match(out, /1\/6/);
  assert.match(out, /data-view="workflow"[^>]*data-id="w1"|data-id="w1"[^>]*data-view="workflow"/);
  assert.match(out, /<option value="everyone" selected>Everyone<\/option>/);
});

test('the owner filter narrows In progress', () => {
  const out = workflowsView({ ...state, workflowsPrefs: { owner: 'me', days: 30 } }, data()).toString().split('Start a workflow')[0];
  assert.match(out, /WF-001/);
  assert.doesNotMatch(out, /WF-002/);
});

test('start a workflow: Platform Review with a platform picker, overdue first; the rest Coming soon', () => {
  const out = workflowsView(state, data()).toString();
  assert.match(out, /data-action="beginReview"/);
  assert.match(out, /Alpha — WF-001 in progress/);
  for (const name of ['Platform Onboarding', 'New Tech Data', 'Transfer Platform Owner', 'Reference Update']) assert.match(out, new RegExp(`${name}[\\s\\S]*?Coming soon`));
});

test('recently completed within the chosen range, with All history; History lists completed and cancelled', () => {
  let d = finishPlatformReview(data(), act, { workflowId: 'w1' });
  d = cancelWorkflow(d, { by: 'u2', at: '2026-06-01T10:00:00+10:00' }, { workflowId: 'w2' });
  const out = workflowsView(state, d).toString();
  assert.match(out, /Recently completed/);
  assert.match(out, /<option value="30" selected>Last 30 days<\/option>/);
  assert.match(out, /WF-001[\s\S]*Completed/);
  assert.doesNotMatch(out.split('Recently completed')[1], /WF-002/, 'cancelled in June: outside 30 days');
  assert.match(out, /All history →/);
  const hist = workflowsView({ ...state, view: { name: 'workflows', tab: 'history' } }, d).toString();
  assert.match(hist, /WF-001[\s\S]*Completed/);
  assert.match(hist, /WF-002[\s\S]*Cancelled/);
});

test('a workflow not yet saved shows a TBC tag', () => {
  const d = beginPlatformReview(seed(), act, { id: 'w9', platformId: 'p1' });
  assert.match(workflowsView(state, d).toString(), /tag-tbc/);
});

test('each start tile has its fields one per line and a Start button in the same place', () => {
  const out = workflowsView(state, data()).toString();
  assert.match(out, /data-action="beginReview"><div class="wf-fields-col">[\s\S]*?<\/div><button type="submit" class="primary small wf-go">Start<\/button>/);
  assert.match(out, /data-action="onboardPlatform"><div class="wf-fields-col"><input name="name"[^>]*><select name="ownerId"[\s\S]*?<\/div><button type="submit" class="primary small wf-go">Start<\/button>/);
  assert.doesNotMatch(out, /Start or resume/);
});
