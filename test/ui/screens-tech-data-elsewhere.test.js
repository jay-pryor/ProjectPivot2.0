import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workflowsView } from '../../src/ui/screens/workflows.js';
import { referenceView } from '../../src/ui/screens/references.js';
import { pickerView } from '../../src/ui/screens/picker.js';
import { createReference, setReferenceArchived } from '../../src/core/ops/references.js';
import { state } from './screens-workflows.test.js';
import { seed, act } from '../helpers.js';

test('the dashboard starts New Tech Data with one click: the reference comes in the workflow', () => {
  const d = createReference(seed(), act, { id: 'r1', title: 'Service bulletin 12', url: 'x' });
  const out = workflowsView({ ...state, view: { name: 'workflows' } }, d).toString();
  assert.doesNotMatch(out, /Coming soon/);
  const tile = out.slice(out.indexOf('New Tech Data</h3>'), out.indexOf('</section>', out.indexOf('New Tech Data</h3>')));
  assert.match(tile, /<form class="wf-start" data-action="beginTechData">[\s\S]*?Start/);
  assert.doesNotMatch(tile, /<select|<input|New reference/);
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
