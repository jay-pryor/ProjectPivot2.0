import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../../src/core/errors.js';
import { entries } from '../../../src/core/history.js';
import { createReference, linkReference, unlinkReference, setReferenceArchived, retireReference, deleteReference } from '../../../src/core/ops/references.js';
import { checkRules } from '../../../src/core/rules.js';
import { startWorkflow, setReferenceDraft, setStep, completeWorkflow, cancelWorkflow } from '../../../src/core/ops/workflows.js';
import { act, later, seed } from '../../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;
const oldFile = { name: 'manual-B.pdf', stored: 'files/references/r1/1-manual-B.pdf', size: 10, type: 'application/pdf', addedBy: 'u1', addedAt: act.at };
const newFile = { name: 'manual-C.pdf', stored: 'files/references/r1/2-manual-C.pdf', size: 12, type: 'application/pdf', addedBy: 'u1', addedAt: act.at };
/** Reference r1 (rev B, a file and a link) informing h1 and c1; update u1 started. */
function started() {
  let d = createReference(seed(), act, { id: 'r1', title: 'Range manual', revision: 'B', url: 'https://old', file: oldFile });
  d = linkReference(d, act, { referenceId: 'r1', targetKind: 'hazard', targetId: 'h1' });
  d = linkReference(d, act, { referenceId: 'r1', targetKind: 'control', targetId: 'c1' });
  return startWorkflow(d, act, { id: 'u1', type: 'referenceUpdate', referenceId: 'r1' });
}
const tick = (d, key) => setStep(d, act, { workflowId: 'u1', hazardId: key, check: 'item', checked: true });

test('an update starts on a live, unarchived reference, one at a time', () => {
  const d = started();
  const w = d.records.workflow.u1;
  assert.deepEqual([w.type, w.referenceId, w.platformId, w.revision, w.file, w.url, w.path], ['referenceUpdate', 'r1', null, '', null, null, null]);
  assert.throws(() => startWorkflow(d, act, { type: 'referenceUpdate', referenceId: 'r1' }), code('update.open'));
  const archived = setReferenceArchived(createReference(seed(), act, { id: 'r2', title: 'Old', url: 'x' }), act, { id: 'r2', archived: true });
  assert.throws(() => startWorkflow(archived, act, { type: 'referenceUpdate', referenceId: 'r2' }), code('reference.archived'));
});

test('confirm needs a new revision, a file, link or path given here, and every linked item ticked', () => {
  let d = started();
  assert.throws(() => completeWorkflow(d, act, { workflowId: 'u1' }), code('workflow.unmet'));
  d = setReferenceDraft(d, act, { workflowId: 'u1', revision: 'B' });
  d = tick(tick(d, 'hazard:h1'), 'control:c1');
  assert.throws(() => completeWorkflow(d, act, { workflowId: 'u1' }), (e) => e.code === 'workflow.unmet', 'B is the current revision, and nothing new given');
  d = setReferenceDraft(d, act, { workflowId: 'u1', revision: ' C ', url: 'https://new' });
  assert.deepEqual([d.records.workflow.u1.revision, d.records.workflow.u1.url], ['C', 'https://new']);
  assert.doesNotThrow(() => completeWorkflow(d, act, { workflowId: 'u1' }));
});

test('an item linked mid-way must be ticked; one unlinked after its tick no longer counts', () => {
  let d = setReferenceDraft(started(), act, { workflowId: 'u1', revision: 'C', url: 'https://new' });
  d = tick(tick(d, 'hazard:h1'), 'control:c1');
  d = linkReference(d, act, { referenceId: 'r1', targetKind: 'platform', targetId: 'p1' });
  assert.throws(() => completeWorkflow(d, act, { workflowId: 'u1' }), code('workflow.unmet'));
  d = unlinkReference(d, act, { referenceId: 'r1', targetKind: 'platform', targetId: 'p1' });
  d = unlinkReference(d, act, { referenceId: 'r1', targetKind: 'control', targetId: 'c1' });
  assert.doesNotThrow(() => completeWorkflow(d, act, { workflowId: 'u1' }));
});

test('nothing reaches the reference until confirm: then the revision, file (old one kept), link and path', () => {
  let d = setReferenceDraft(started(), act, { workflowId: 'u1', revision: 'C', file: newFile, path: '\\\\share\\manual-C.pdf' });
  assert.deepEqual([d.records.reference.r1.revision, d.records.reference.r1.file.name], ['B', 'manual-B.pdf'], 'unchanged while drafting');
  d = completeWorkflow(tick(tick(d, 'hazard:h1'), 'control:c1'), act, { workflowId: 'u1' });
  const r = d.records.reference.r1;
  assert.deepEqual([r.revision, r.file.name, r.pastFiles.map((f) => f.name), r.url, r.path], ['C', 'manual-C.pdf', ['manual-B.pdf'], 'https://old', '\\\\share\\manual-C.pdf']);
  assert.equal(entries(d).at(-1).action, 'Update reference to rev C');
});

test('cancelling leaves the reference untouched, even after a file was given', () => {
  let d = setReferenceDraft(started(), act, { workflowId: 'u1', revision: 'C', file: newFile });
  d = cancelWorkflow(d, act, { workflowId: 'u1' });
  assert.deepEqual([d.records.reference.r1.revision, d.records.reference.r1.file.name, d.records.reference.r1.pastFiles], ['B', 'manual-B.pdf', []]);
});

test('only the owner drafts the update', () => {
  assert.throws(() => setReferenceDraft(started(), later, { workflowId: 'u1', revision: 'C' }), code('workflow.owner'));
});

test('retiring, archiving or deleting a reference cancels its open update, so the rules still hold', () => {
  for (const end of [(d) => retireReference(d, act, { id: 'r1' }), (d) => setReferenceArchived(d, act, { id: 'r1', archived: true })]) {
    const d = end(started());
    assert.equal(d.records.workflow.u1.state, 'cancelled');
    assert.deepEqual(checkRules(d), []);
  }
  let e = createReference(seed(), act, { id: 'r5', title: 'Loose', url: 'x' });
  e = deleteReference(startWorkflow(e, act, { id: 'u5', type: 'referenceUpdate', referenceId: 'r5' }), act, { id: 'r5' });
  assert.equal(e.records.workflow.u5.state, 'cancelled');
  assert.deepEqual(checkRules(e), []);
});
