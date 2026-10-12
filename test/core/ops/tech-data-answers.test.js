import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../../src/core/errors.js';
import { entries } from '../../../src/core/history.js';
import { ids } from '../../../src/core/ids.js';
import { linkReference } from '../../../src/core/ops/references.js';
import { unlinkHazard } from '../../../src/core/ops/platforms.js';
import { updateControl, retireControl, removeControlHere, unlinkControl, createControl, addControlHere } from '../../../src/core/ops/controls.js';
import { setSfarp, setRating, setControlStatus } from '../../../src/core/ops/assessment.js';
import { createSafetyReport } from '../../../src/core/ops/safety-reports.js';
import { setStep, setWorkflowPosition, completeWorkflow, cancelWorkflow, addTechHazard } from '../../../src/core/ops/workflows.js';
import { TECH_CARDS, techTouched, techLinks, workflowProgress } from '../../../src/core/workflows.js';
import { act, later } from '../../helpers.js';
import { started, scope, scoped } from './tech-data.test.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
const via = { ...act, workflowId: 't1' };
const answer = (d, key, check, a, note) => setStep(d, act, { workflowId: 't1', hazardId: key, check, answer: a, note });
const answerAll = (d, key, a = 'none') => TECH_CARDS.reduce((x, c) => answer(x, key, c, a), d);
const wf = (d) => d.records.workflow.t1;
const step = (d, key, check) => d.records.workflowStep[ids.workflowStep('t1', key, check)];

test('each card takes Changed or No change and a note, only on a pair in scope; unticked, answers are kept', () => {
  let d = answer(scoped(), 'p1|h1', 'controls', 'changed', ' New interlock ');
  assert.deepEqual([step(d, 'p1|h1', 'controls').answer, step(d, 'p1|h1', 'controls').note], ['changed', 'New interlock']);
  d = answer(d, 'p1|h1', 'controls', '');
  assert.equal(step(d, 'p1|h1', 'controls').answer, null, 'blank clears it');
  assert.throws(() => answer(d, 'p1|h1', 'controls', 'maybe'), code('workflow.answer'));
  assert.throws(() => answer(d, 'p1|h1', 'references', 'none'), code('workflow.check'));
  assert.throws(() => answer(d, 'p1|h2', 'controls', 'none'), code('workflow.check'), 'h2 is not in scope');
  d = answer(d, 'p1|h1', 'sfarp', 'none');
  d = scope(d, 'p1', 'h1', false);
  assert.throws(() => answer(d, 'p1|h1', 'controls', 'none'), code('workflow.check'));
  d = scope(d, 'p1', 'h1');
  assert.equal(step(d, 'p1|h1', 'sfarp').answer, 'none');
  assert.throws(() => setStep(d, later, { workflowId: 't1', hazardId: 'p1|h1', check: 'sfarp', answer: 'changed' }), code('workflow.owner'));
});

test('progress: one for the reference (chosen here), one for having a scope, then four cards on each pair', () => {
  assert.deepEqual((({ done, total }) => ({ done, total }))(workflowProgress(started(), wf(started()))), { done: 1, total: 2 });
  let d = scoped();
  assert.deepEqual([workflowProgress(d, wf(d)).done, workflowProgress(d, wf(d)).total], [2, 10]);
  d = answer(answer(d, 'p1|h1', 'controls', 'none'), 'p1|h1', 'sfarp', 'changed');
  const p = workflowProgress(d, wf(d));
  assert.deepEqual([p.done, p.perHazard.get('p1|h1'), p.perHazard.get('p2|h1')], [4, 2, 0]);
});

test('the position is the scope, a pair in scope, or the summary', () => {
  let d = setWorkflowPosition(scoped(), act, { workflowId: 't1', hazardId: 'p2|h1' });
  assert.equal(wf(d).at.hazardId, 'p2|h1');
  d = setWorkflowPosition(d, act, { workflowId: 't1', hazardId: '@scope' });
  assert.equal(wf(d).at.hazardId, '@scope');
  d = setWorkflowPosition(d, act, { workflowId: 't1', hazardId: null });
  assert.equal(wf(d).at.hazardId, null);
  assert.throws(() => setWorkflowPosition(d, act, { workflowId: 't1', hazardId: 'p1|h2' }), code('workflow.hazard'));
});

test('what changes made through it touched: each by its card and pair, and the controls', () => {
  let d = scoped();
  d = setSfarp(d, via, { hazardId: 'h1', platformId: 'p1', justification: 'Per SB12' });
  d = createSafetyReport(d, via, { id: 's1', hazardId: 'h1', platformId: 'p2', summary: 'Smoke seen', date: '2026-09-01' });
  d = setRating(d, via, { hazardId: 'h1', platformId: 'p1', stage: 'residual', receptor: 'personnel', consequence: 3, likelihood: 'C' });
  d = setRating(d, via, { hazardId: 'h1', platformId: 'p2', stage: 'initial', receptor: 'personnel', consequence: 3, likelihood: 'C' });
  d = setControlStatus(d, via, { hazardId: 'h1', controlId: 'c1', platformId: 'p2', status: 'implemented' });
  d = updateControl(d, via, { id: 'c2', description: 'Twice a year' });
  d = setSfarp(d, act, { hazardId: 'h1', platformId: 'p2', justification: 'Not through the workflow' });
  const { cards, controls } = techTouched(d, wf(d));
  assert.deepEqual([...cards.get('p1|h1')].sort(), ['controls', 'residual', 'sfarp']);
  assert.deepEqual([...cards.get('p2|h1')].sort(), ['controls', 'safetyReports'], 'its initial rating and its SFARP made outside do not count');
  assert.deepEqual([...controls].sort(), ['c1', 'c2']);
});

test('Complete is strict: a scope, and every card on every pair answered', () => {
  assert.throws(() => completeWorkflow(started(), act, { workflowId: 't1' }), code('workflow.unmet'));
  let d = answerAll(scoped(), 'p1|h1');
  assert.throws(() => completeWorkflow(d, act, { workflowId: 't1' }), (e) => e.code === 'workflow.unmet' && /4 things/.test(e.message));
  d = answerAll(d, 'p2|h1');
  assert.doesNotThrow(() => completeWorkflow(d, act, { workflowId: 't1' }));
});

test('Complete links the reference to the scoped platforms, the hazards changed or added, and the controls touched, in one change', () => {
  let d = scope(scoped(), 'p1');
  d = addTechHazard(d, act, { workflowId: 't1', platformId: 'p1', hazardId: 'h2' });
  d = updateControl(d, via, { id: 'c1', description: 'Checked monthly' });
  d = answerAll(answerAll(answerAll(d, 'p1|h1'), 'p2|h1'), 'p1|h2');
  assert.deepEqual(techLinks(d, wf(d)).map((t) => `${t.targetKind}:${t.targetId}`), ['platform:p1', 'platform:p2', 'hazard:h2', 'control:c1'], 'h1 has no Changed answer; h2 was added');
  d = answer(d, 'p2|h1', 'residual', 'changed');
  assert.deepEqual(techLinks(d, wf(d)).map((t) => `${t.targetKind}:${t.targetId}`), ['platform:p1', 'platform:p2', 'hazard:h1', 'hazard:h2', 'control:c1']);
  d = completeWorkflow(d, via, { workflowId: 't1' });
  const e = entries(d).at(-1);
  assert.deepEqual([e.action, e.workflow], ['Work through new tech data', 't1']);
  assert.equal(e.items.filter((i) => i.kind === 'referenceLink').length, 5);
  assert.equal(d.records.referenceLink[ids.referenceLink('r1', 'hazard', 'h1')].status, 'live');
  assert.deepEqual([wf(d).state, wf(d).covered, wf(d).linked.length], ['completed', ['p1|h1', 'p1|h2', 'p2|h1'], 5]);
});

test('Complete leaves alone links already there, and a control retired since it was touched', () => {
  let d = linkReference(scoped(), act, { referenceId: 'r1', targetKind: 'platform', targetId: 'p1' });
  d = updateControl(d, via, { id: 'c2', description: 'Twice a year' });
  d = retireControl(d, act, { id: 'c2' });
  d = answerAll(answerAll(d, 'p1|h1'), 'p2|h1');
  assert.deepEqual(techLinks(d, wf(d)).map((t) => `${t.targetKind}:${t.targetId}`), ['platform:p2']);
  d = completeWorkflow(d, act, { workflowId: 't1' });
  assert.deepEqual(entries(d).at(-1).items.filter((i) => i.kind === 'referenceLink').map((i) => i.id), [ids.referenceLink('r1', 'platform', 'p2')]);
});

test('a Changed answer on a hazard since unlinked from its platform links nothing for it', () => {
  let d = answer(answerAll(answerAll(scoped(), 'p1|h1'), 'p2|h1'), 'p1|h1', 'sfarp', 'changed');
  d = unlinkHazard(d, act, { hazardId: 'h1', platformId: 'p1' });
  assert.deepEqual(techLinks(d, wf(d)).map((t) => `${t.targetKind}:${t.targetId}`), ['platform:p1', 'platform:p2']);
});

test('cancelling keeps its answers and links nothing', () => {
  const d = cancelWorkflow(answerAll(scoped(), 'p1|h1', 'changed'), act, { workflowId: 't1' });
  assert.deepEqual([wf(d).state, wf(d).covered, wf(d).linked], ['cancelled', ['p1|h1', 'p2|h1'], null]);
  assert.equal(Object.values(d.records.referenceLink ?? {}).length, 0);
});

test('taking a control off a pair, or unlinking it from the hazard, is a change to Controls there; adding one to a pair is not one on the others', () => {
  const on = (d, key) => [...(techTouched(d, wf(d)).cards.get(key) ?? [])];
  let d = removeControlHere(scoped(), via, { hazardId: 'h1', platformId: 'p1', controlId: 'c1' });
  assert.deepEqual([on(d, 'p1|h1'), on(d, 'p2|h1')], [['controls'], []]);
  d = unlinkControl(scoped(), via, { hazardId: 'h1', controlId: 'c2' });
  assert.deepEqual([on(d, 'p1|h1'), on(d, 'p2|h1')], [['controls'], ['controls']]);
  d = addControlHere(createControl(scoped(), act, { id: 'c3', title: 'Smoke hoods' }), via, { hazardId: 'h1', platformId: 'p1', controlId: 'c3', kind: 'mitigating' });
  assert.deepEqual([on(d, 'p1|h1'), on(d, 'p2|h1')], [['controls'], []]);
});
