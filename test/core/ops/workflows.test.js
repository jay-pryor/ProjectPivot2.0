import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../../src/core/errors.js';
import { ids } from '../../../src/core/ids.js';
import { entries } from '../../../src/core/history.js';
import { linkHazard, unlinkHazard, createPlatform, retirePlatform } from '../../../src/core/ops/platforms.js';
import { startWorkflow, setWorkflowPosition, setStep, setWorkflowOutcome, setWorkflowNotes, takeOverWorkflow, cancelWorkflow, completeWorkflow } from '../../../src/core/ops/workflows.js';
import { CHECKS, workflowProgress, openPlatformReview } from '../../../src/core/workflows.js';
import { scheduleOf, seenOf } from '../../../src/core/schedule.js';
import { act, later, seed, scheduleFixed, finishPlatformReview } from '../../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
/** p1 Alpha (h1 on it), every 6 months, next due 2026-10-30. */
const scheduled = () => scheduleFixed(seed(), 'p1', 6, '2026-10-30');
const dueNow = (d, id = 'p1') => scheduleOf(d, id, '2026-09-28').due;
const started = () => startWorkflow(scheduled(), act, { id: 'w1', type: 'platformReview', platformId: 'p1' });
const tickAll = (d, by = act, workflowId = 'w1', hazards = ['h1']) => {
  for (const hazardId of hazards) for (const check of CHECKS) d = setStep(d, by, { workflowId, hazardId, check, checked: true });
  return d;
};

test('starting a Platform Review: open, owned by its starter, on the first hazard, one per live platform', () => {
  const d = started();
  const w = d.records.workflow.w1;
  assert.deepEqual(
    { number: w.number, type: w.type, platformId: w.platformId, ownerId: w.ownerId, state: w.state, at: w.at, outcome: w.outcome, notes: w.notes, endedBy: w.endedBy, endedAt: w.endedAt },
    { number: null, type: 'platformReview', platformId: 'p1', ownerId: 'u1', state: 'open', at: { hazardId: 'h1' }, outcome: '', notes: '', endedBy: null, endedAt: null },
  );
  assert.equal(openPlatformReview(d, 'p1')?.id, 'w1');
  assert.equal(entries(d).at(-1).action, 'Start workflow');
  assert.deepEqual(entries(d).at(-1).platforms, [], 'workflow bookkeeping reaches no platform: no acknowledgement, not in platform History');
  assert.throws(() => startWorkflow(d, later, { type: 'platformReview', platformId: 'p1' }), code('review.open'));
  assert.doesNotThrow(() => startWorkflow(d, later, { type: 'platformReview', platformId: 'p2' }));
  assert.throws(() => startWorkflow(retirePlatform(scheduled(), act, { id: 'p2' }), act, { type: 'platformReview', platformId: 'p2' }), code('platform.retired'));
  assert.throws(() => startWorkflow(scheduled(), act, { type: 'referenceUpdate', platformId: 'p1' }), code('workflow.type'));
});

test('a platform with no hazards opens on the summary at 0 of 0 and can be completed', () => {
  let d = createPlatform(seed(), act, { id: 'p9', name: 'Empty', ownerId: 'u1' });
  d = scheduleFixed(d, 'p9', 12, '2026-12-01');
  d = startWorkflow(d, act, { id: 'w9', type: 'platformReview', platformId: 'p9' });
  assert.deepEqual(d.records.workflow.w9.at, { hazardId: null });
  assert.deepEqual([workflowProgress(d, d.records.workflow.w9).done, workflowProgress(d, d.records.workflow.w9).total], [0, 0]);
  d = completeWorkflow(d, act, { workflowId: 'w9' });
  assert.equal(d.records.workflow.w9.state, 'completed');
  assert.equal(dueNow(d, 'p9'), '2027-12-01');
});

test('ticking and noting a check, which must be one of the six, on a hazard on the platform', () => {
  let d = setStep(started(), act, { workflowId: 'w1', hazardId: 'h1', check: 'controls', checked: 'true' });
  const id = ids.workflowStep('w1', 'h1', 'controls');
  assert.deepEqual([d.records.workflowStep[id].checked, d.records.workflowStep[id].note], [true, '']);
  d = setStep(d, act, { workflowId: 'w1', hazardId: 'h1', check: 'controls', note: '  Added C-004  ' });
  assert.deepEqual([d.records.workflowStep[id].checked, d.records.workflowStep[id].note], [true, 'Added C-004'], 'a note keeps the tick');
  d = setStep(d, act, { workflowId: 'w1', hazardId: 'h1', check: 'controls', checked: 'false' });
  assert.equal(d.records.workflowStep[id].checked, false);
  assert.throws(() => setStep(d, act, { workflowId: 'w1', hazardId: 'h1', check: 'bogus', checked: true }), code('workflow.check'));
  assert.throws(() => setStep(d, act, { workflowId: 'w1', hazardId: 'h2', check: 'sfarp', checked: true }), code('workflow.hazard'));
  assert.equal(workflowProgress(d, d.records.workflow.w1).perHazard.get('h1'), 0);
});

test('only the owner acts on it; anyone can take it over, which is recorded', () => {
  const d = started();
  assert.throws(() => setStep(d, later, { workflowId: 'w1', hazardId: 'h1', check: 'sfarp', checked: true }), code('workflow.owner'));
  assert.throws(() => setWorkflowPosition(d, later, { workflowId: 'w1', hazardId: null }), code('workflow.owner'));
  assert.throws(() => setWorkflowOutcome(d, later, { workflowId: 'w1', outcome: 'x' }), code('workflow.owner'));
  assert.throws(() => cancelWorkflow(d, later, { workflowId: 'w1' }), code('workflow.owner'));
  assert.throws(() => completeWorkflow(d, later, { workflowId: 'w1' }), code('workflow.owner'));
  const taken = takeOverWorkflow(d, later, { workflowId: 'w1' });
  assert.equal(taken.records.workflow.w1.ownerId, 'u2');
  assert.equal(entries(taken).at(-1).action, 'Take over workflow');
  assert.equal(takeOverWorkflow(taken, later, { workflowId: 'w1' }), taken, 'taking over your own changes nothing');
  assert.doesNotThrow(() => setStep(taken, later, { workflowId: 'w1', hazardId: 'h1', check: 'sfarp', checked: true }));
});

test('position, outcome and notes are kept for resuming', () => {
  let d = setWorkflowPosition(started(), act, { workflowId: 'w1', hazardId: null });
  assert.deepEqual(d.records.workflow.w1.at, { hazardId: null });
  d = setWorkflowPosition(d, act, { workflowId: 'w1', hazardId: 'h1' });
  assert.deepEqual(d.records.workflow.w1.at, { hazardId: 'h1' });
  assert.throws(() => setWorkflowPosition(d, act, { workflowId: 'w1', hazardId: 'h2' }), code('workflow.hazard'));
  d = setWorkflowNotes(setWorkflowOutcome(d, act, { workflowId: 'w1', outcome: ' All current ' }), act, { workflowId: 'w1', notes: ' Crew briefed ' });
  assert.deepEqual([d.records.workflow.w1.outcome, d.records.workflow.w1.notes], ['All current', 'Crew briefed']);
});

test('complete is strict: refused while any check is unticked, then writes the review and moves the schedule on', () => {
  let d = setWorkflowOutcome(started(), act, { workflowId: 'w1', outcome: 'All current' });
  d = setStep(d, act, { workflowId: 'w1', hazardId: 'h1', check: 'sfarp', checked: true });
  assert.throws(() => completeWorkflow(d, act, { workflowId: 'w1' }), (e) => e instanceof PivotError && e.code === 'workflow.unchecked' && /5 checks/.test(e.message));
  d = completeWorkflow(tickAll(d), act, { workflowId: 'w1' });
  const r = d.records.review[ids.workflowReview('w1')];
  assert.deepEqual(
    { state: r.state, workflowId: r.workflowId, platformId: r.platformId, outcome: r.outcome, dueBefore: r.dueBefore, dueAfter: r.dueAfter, completedBy: r.completedBy },
    { state: 'completed', workflowId: 'w1', platformId: 'p1', outcome: 'All current', dueBefore: '2026-10-30', dueAfter: '2027-04-30', completedBy: 'u1' },
  );
  assert.deepEqual([d.records.workflow.w1.state, d.records.workflow.w1.endedBy], ['completed', 'u1']);
  assert.equal(dueNow(d), '2027-04-30');
  assert.equal(d.records.platform.p1.reviewStart, '2026-10-30');
  assert.equal(seenOf(d, 'p1'), '2027-04-30');
  assert.equal(entries(d).at(-1).action, 'Complete review');
  assert.equal(openPlatformReview(d, 'p1'), null);
  assert.throws(() => setStep(d, act, { workflowId: 'w1', hazardId: 'h1', check: 'sfarp', checked: false }), code('workflow.ended'));
  assert.throws(() => completeWorkflow(d, act, { workflowId: 'w1' }), code('workflow.ended'));
});

test('completing needs a schedule', () => {
  const d = tickAll(startWorkflow(seed(), act, { id: 'w1', type: 'platformReview', platformId: 'p1' }));
  assert.throws(() => completeWorkflow(d, act, { workflowId: 'w1' }), code('review.no-schedule'));
});

test('a hazard linked mid-review must be checked too; one unlinked mid-review no longer counts or blocks', () => {
  let d = tickAll(started());
  d = linkHazard(d, act, { hazardId: 'h2', platformId: 'p1' });
  assert.deepEqual([workflowProgress(d, d.records.workflow.w1).done, workflowProgress(d, d.records.workflow.w1).total], [6, 12]);
  assert.throws(() => completeWorkflow(d, act, { workflowId: 'w1' }), code('workflow.unchecked'));
  d = tickAll(d, act, 'w1', ['h2']);
  d = unlinkHazard(d, act, { hazardId: 'h1', platformId: 'p1' });
  assert.deepEqual([workflowProgress(d, d.records.workflow.w1).done, workflowProgress(d, d.records.workflow.w1).total], [6, 6]);
  assert.doesNotThrow(() => completeWorkflow(d, act, { workflowId: 'w1' }));
});

test('cancelling keeps the workflow and its ticks as cancelled; another review can then start', () => {
  let d = setStep(started(), act, { workflowId: 'w1', hazardId: 'h1', check: 'sfarp', checked: true, note: 'ok' });
  d = cancelWorkflow(d, act, { workflowId: 'w1' });
  assert.deepEqual([d.records.workflow.w1.status, d.records.workflow.w1.state, d.records.workflow.w1.endedBy], ['live', 'cancelled', 'u1']);
  assert.equal(d.records.workflowStep[ids.workflowStep('w1', 'h1', 'sfarp')].note, 'ok');
  assert.equal(entries(d).at(-1).action, 'Cancel workflow');
  assert.equal(openPlatformReview(d, 'p1'), null);
  assert.doesNotThrow(() => startWorkflow(d, later, { type: 'platformReview', platformId: 'p1' }));
});

test('the schedule rules carried over: early, very late, month-end', () => {
  let d = scheduleFixed(seed(), 'p1', 1, '2027-01-31');
  d = finishPlatformReview(startWorkflow(d, act, { id: 'a', type: 'platformReview', platformId: 'p1' }), act, { workflowId: 'a' });
  assert.equal(dueNow(d), '2027-02-28', 'completed early, still one period on from the due date');
  d = finishPlatformReview(startWorkflow(d, act, { id: 'b', type: 'platformReview', platformId: 'p1' }), act, { workflowId: 'b' });
  assert.equal(dueNow(d), '2027-03-28');
  let e = scheduleFixed(seed(), 'p1', 6, '2025-01-31');
  e = finishPlatformReview(startWorkflow(e, act, { id: 'c', type: 'platformReview', platformId: 'p1' }), act, { workflowId: 'c' });
  assert.equal(dueNow(e), '2027-01-31', 'more than a period late: whole periods until after the completion');
});
