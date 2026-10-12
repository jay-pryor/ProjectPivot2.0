import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../../src/core/errors.js';
import { entries } from '../../../src/core/history.js';
import { createReference, setReferenceArchived } from '../../../src/core/ops/references.js';
import { checkRules } from '../../../src/core/rules.js';
import { startWorkflow, setTechDraft, setTechReference, setTechScope, setStep, setWorkflowPosition, completeWorkflow, cancelWorkflow } from '../../../src/core/ops/workflows.js';
import { TECH_CARDS, workflowProgress, openTechData } from '../../../src/core/workflows.js';
import { act, later, seed } from '../../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
const file = { name: 'tr7.pdf', stored: 'files/references/d1/1-tr7.pdf', size: 9, type: 'application/pdf', addedBy: 'u1', addedAt: act.at };
/** New Tech Data n1 started with no reference: a blank draft for a new one. */
const fresh = () => startWorkflow(seed(), act, { id: 'n1', type: 'newTechData' });
const wf = (d) => d.records.workflow.n1;
const draft = (d, fields) => setTechDraft(d, act, { workflowId: 'n1', ...fields });
/** n1 with p1|h1 in scope and every card answered No change. */
function answered(d) {
  d = setTechScope(setTechScope(d, act, { workflowId: 'n1', platformId: 'p1', checked: true }), act, { workflowId: 'n1', platformId: 'p1', hazardId: 'h1', checked: true });
  return TECH_CARDS.reduce((x, c) => setStep(x, act, { workflowId: 'n1', hazardId: 'p1|h1', check: c, answer: 'none' }), d);
}

test('started with no reference, it opens on the Reference step with a blank draft for a new one', () => {
  const w = wf(fresh());
  assert.deepEqual([w.referenceId, w.at.hazardId, w.draft.title, w.draft.url, w.draft.file], [null, '@reference', '', '', null]);
  assert.equal(typeof w.draft.id, 'string');
  assert.deepEqual(checkRules(fresh()), [], 'no reference yet breaks no rule');
});

test('started on a reference, it opens on the scope with that reference chosen', () => {
  const d = startWorkflow(createReference(seed(), act, { id: 'r1', title: 'SB 12', url: 'x' }), act, { id: 'n1', type: 'newTechData', referenceId: 'r1' });
  assert.deepEqual([wf(d).referenceId, wf(d).at.hazardId], ['r1', '@scope']);
});

test('the draft takes a title, doc number, revision, link, path and file; only the owner changes it', () => {
  const d = draft(fresh(), { title: ' Test report 7 ', docNumber: 'TR-7', revision: '1', url: 'https://tr7', path: '', file });
  assert.deepEqual(Object.fromEntries(['title', 'docNumber', 'revision', 'url', 'path'].map((k) => [k, wf(d).draft[k]])), { title: 'Test report 7', docNumber: 'TR-7', revision: '1', url: 'https://tr7', path: '' });
  assert.equal(wf(d).draft.file.name, 'tr7.pdf');
  assert.throws(() => setTechDraft(d, later, { workflowId: 'n1', title: 'X' }), code('workflow.owner'));
});

test('an existing reference can be chosen instead, and the new draft taken back; the draft is kept meanwhile', () => {
  let d = draft(createReference(fresh(), act, { id: 'r1', title: 'SB 12', url: 'x' }), { title: 'Kept' });
  d = setTechReference(d, act, { workflowId: 'n1', referenceId: 'r1' });
  assert.equal(wf(d).referenceId, 'r1');
  assert.equal(openTechData(d, 'r1').id, 'n1');
  d = setTechReference(d, act, { workflowId: 'n1', referenceId: '' });
  assert.deepEqual([wf(d).referenceId, wf(d).draft.title], [null, 'Kept']);
  const archived = setReferenceArchived(d, act, { id: 'r1', archived: true });
  assert.throws(() => setTechReference(archived, act, { workflowId: 'n1', referenceId: 'r1' }), code('reference.archived'));
  const other = startWorkflow(d, act, { id: 'n2', type: 'newTechData', referenceId: 'r1' });
  assert.throws(() => setTechReference(other, act, { workflowId: 'n1', referenceId: 'r1' }), code('techData.open'));
});

test('the Reference step counts towards progress once a title and a file, link or path are given, or a reference is chosen', () => {
  let d = fresh();
  assert.deepEqual([workflowProgress(d, wf(d)).done, workflowProgress(d, wf(d)).total], [0, 2]);
  d = draft(d, { title: 'Test report 7' });
  assert.equal(workflowProgress(d, wf(d)).done, 0, 'a title alone is not enough');
  d = draft(d, { path: '\\\\share\\tr7.pdf' });
  assert.equal(workflowProgress(d, wf(d)).done, 1);
});

test('the position can be the Reference step', () => {
  const d = setWorkflowPosition(setWorkflowPosition(fresh(), act, { workflowId: 'n1', hazardId: '@scope' }), act, { workflowId: 'n1', hazardId: '@reference' });
  assert.equal(wf(d).at.hazardId, '@reference');
});

test('Complete needs the reference; then it makes the new reference and its links in one change, through the workflow', () => {
  let d = answered(fresh());
  assert.throws(() => completeWorkflow(d, act, { workflowId: 'n1' }), code('workflow.unmet'));
  d = draft(d, { title: 'Test report 7', revision: '1', file });
  const rid = wf(d).draft.id;
  assert.equal(d.records.reference[rid], undefined, 'nothing made before Complete');
  d = completeWorkflow(d, { ...act, workflowId: 'n1' }, { workflowId: 'n1' });
  const r = d.records.reference[rid];
  assert.deepEqual([r.title, r.revision, r.file.name], ['Test report 7', '1', 'tr7.pdf']);
  assert.equal(wf(d).referenceId, rid, 'the completed workflow points at the reference it made');
  const e = entries(d).at(-1);
  assert.deepEqual([e.action, e.workflow], ['Work through new tech data', 'n1']);
  assert.deepEqual([...new Set(e.items.map((i) => i.kind))].sort(), ['reference', 'referenceLink', 'workflow']);
  assert.deepEqual(checkRules(d), []);
});

test('cancelling before Complete leaves no reference behind', () => {
  const d = cancelWorkflow(draft(fresh(), { title: 'Test report 7', url: 'https://tr7' }), act, { workflowId: 'n1' });
  assert.deepEqual([wf(d).state, Object.keys(d.records.reference)], ['cancelled', []]);
});
