import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workflowsView } from '../../src/ui/screens/workflows.js';
import { referenceView } from '../../src/ui/screens/references.js';
import { pickerView } from '../../src/ui/screens/picker.js';
import { createReference, setReferenceArchived } from '../../src/core/ops/references.js';
import { state } from './screens-workflows.test.js';
import { seed, act } from '../helpers.js';

test('the dashboard starts New Tech Data on a reference, or on a new one', () => {
  const d = createReference(seed(), act, { id: 'r1', title: 'Service bulletin 12', url: 'x' });
  const out = workflowsView({ ...state, view: { name: 'workflows' } }, d).toString();
  assert.doesNotMatch(out, /Coming soon/);
  assert.match(out, /data-action="beginTechData"[\s\S]*?Select reference…[\s\S]*?Service bulletin 12/);
  assert.match(out, /<summary>New reference…<\/summary>[\s\S]*?data-action="beginTechDataNew"[\s\S]*?name="title"[\s\S]*?name="docNumber"[\s\S]*?name="revision"[\s\S]*?name="url"[\s\S]*?name="path"/);
});

test('the reference page offers Work through as new tech data… while it is live and not archived', () => {
  const d = createReference(seed(), act, { id: 'r1', title: 'Service bulletin 12', url: 'x' });
  const view = (x) => referenceView({ ...state, view: { name: 'reference', id: 'r1' } }, x, 'r1').toString();
  assert.match(view(d), /data-action="beginTechData"[^>]*>Work through as new tech data…/);
  assert.doesNotMatch(view(setReferenceArchived(d, act, { id: 'r1', archived: true })), /beginTechData/);
});

test('the link-hazards picker carries the workflow it was opened from', () => {
  const out = pickerView({ ...state, picker: { picker: 'linkHazards', platformId: 'p1', workflowId: 't1' } }, seed()).toString();
  assert.match(out, /data-action="linkHazards"[^>]*data-workflow-id="t1"|data-workflow-id="t1"[^>]*data-action="linkHazards"/);
});
