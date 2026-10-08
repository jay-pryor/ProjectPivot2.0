import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, KINDS, NUMBERED, normalizeData, created } from '../../src/core/data.js';
import { ids, workflowLabel } from '../../src/core/ids.js';
import { recordChange, entries } from '../../src/core/history.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { KIND_LABEL } from '../../src/ui/names.js';
import { act } from '../helpers.js';

test('workflows and their steps are record kinds; workflows are numbered WF-001 on save', () => {
  assert.ok(KINDS.includes('workflow') && KINDS.includes('workflowStep'));
  assert.ok(NUMBERED.some((n) => n.kind === 'workflow' && n.counter === 'nextWorkflowNumber'));
  assert.equal(emptyData().nextWorkflowNumber, 1);
  const old = emptyData();
  delete old.nextWorkflowNumber;
  assert.equal(normalizeData(old).nextWorkflowNumber, 1);
  let d = emptyData();
  d = { ...d, records: { ...d.records, workflow: { w1: created(act, 'w1', { number: null, type: 'platformReview' }) } } };
  assert.equal(workflowLabel(d.records.workflow.w1), 'TBC');
  d = assignNumbers(d);
  assert.equal(workflowLabel(d.records.workflow.w1), 'WF-001');
  assert.equal(d.nextWorkflowNumber, 2);
  assert.equal(ids.workflowStep('w1', 'h1', 'sfarp'), 'ws:w1:h1:sfarp');
  assert.equal(ids.workflowReview('w1'), 'wr:w1');
  assert.equal(KIND_LABEL.workflow, 'Workflow');
  assert.equal(KIND_LABEL.workflowStep, 'Workflow check');
});

test('a change made through a workflow carries the workflow; any other does not', () => {
  const rec = created(act, 'h9', { title: 'x' });
  let d = recordChange(emptyData(), { ...act, workflowId: 'w1' }, 'Edit hazard', [{ kind: 'hazard', before: null, after: rec }], []);
  d = recordChange(d, act, 'Edit hazard', [{ kind: 'hazard', before: rec, after: { ...rec, title: 'y' } }], []);
  const [a, b] = entries(d);
  assert.equal(a.workflow, 'w1');
  assert.ok(!('workflow' in b));
});
