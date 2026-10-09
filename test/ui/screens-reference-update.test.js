import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workflowView } from '../../src/ui/screens/workflow.js';
import { createReference, linkReference } from '../../src/core/ops/references.js';
import { startWorkflow, setReferenceDraft, setStep, completeWorkflow } from '../../src/core/ops/workflows.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { state } from './screens-workflows.test.js';
import { seed, act } from '../helpers.js';

const on = () => ({ ...state, view: { name: 'workflow', id: 'u1' } });
function started() {
  let d = createReference(seed(), act, { id: 'r1', title: 'Range manual', revision: 'B', url: 'https://old' });
  d = linkReference(d, act, { referenceId: 'r1', targetKind: 'hazard', targetId: 'h1' });
  return assignNumbers(startWorkflow(d, act, { id: 'u1', type: 'referenceUpdate', referenceId: 'r1' }));
}

test('an open update: current and new revision, file, link and path, and a row per item with its platforms, note, tick and Open', () => {
  const out = workflowView(on(), started(), 'u1').toString();
  assert.match(out, /Current revision[\s\S]*?B/);
  assert.match(out, /name="revision"[^>]*data-change="setReferenceDraft"/);
  assert.match(out, /name="url"[^>]*placeholder="https:\/\/old"/);
  assert.match(out, /data-action="uploadUpdateFile"/);
  assert.match(out, /HAZ-001 Fire[\s\S]*?Alpha, Bravo/);
  assert.match(out, /data-hazard-id="hazard:h1"/);
  assert.match(out, /data-view="hazard"[^>]*data-id="h1"[^>]*data-via="u1"|data-via="u1"[^>]*data-view="hazard"/);
  assert.match(out, /Confirm update — /);
});

test('a completed update shows the revision change and the items as they were ticked', () => {
  let d = setReferenceDraft(started(), act, { workflowId: 'u1', revision: 'C', url: 'https://new' });
  d = setStep(d, act, { workflowId: 'u1', hazardId: 'hazard:h1', check: 'item', checked: true, note: 'Still right' });
  d = completeWorkflow(d, act, { workflowId: 'u1' });
  const out = workflowView(on(), d, 'u1').toString();
  assert.match(out, /Revision B → C/);
  assert.match(out, /Still right/);
});
