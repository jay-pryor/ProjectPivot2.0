import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workflowsView } from '../../src/ui/screens/workflows.js';
import { platformView } from '../../src/ui/screens/platforms.js';
import { referenceView } from '../../src/ui/screens/references.js';
import { homeView } from '../../src/ui/screens/home.js';
import { renderApp } from '../../src/ui/render.js';
import { createReference, linkReference } from '../../src/core/ops/references.js';
import { startWorkflow, setTransferRecipient, setStep, completeWorkflow } from '../../src/core/ops/workflows.js';
import { transferGroups } from '../../src/core/workflows.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { state } from './screens-workflows.test.js';
import { seed, act, scheduleFixed } from '../helpers.js';

test('the dashboard starts a transfer by platform and an update by reference', () => {
  const d = createReference(seed(), act, { id: 'r1', title: 'Range manual', url: 'x' });
  const out = workflowsView({ ...state, view: { name: 'workflows' } }, d).toString();
  assert.match(out, /data-action="startTransfer"[\s\S]*?Select platform…/);
  assert.match(out, /data-action="startReferenceUpdate"[\s\S]*?Select reference…[\s\S]*?Range manual/);
  assert.match(out, /New Tech Data[\s\S]*?Coming soon/);
});

test('the platform page has Transfer owner… in place of the owner dropdown; the reference page has Update revision…', () => {
  const d = createReference(seed(), act, { id: 'r1', title: 'Range manual', url: 'x' });
  const p = platformView({ ...state, view: { name: 'platform', id: 'p1' } }, d, 'p1').toString();
  assert.doesNotMatch(p, /data-change="setOwner"/);
  assert.match(p, /Owned by Ada[\s\S]*?data-action="startTransfer"[^>]*>Transfer owner…/);
  assert.match(referenceView({ ...state, view: { name: 'reference', id: 'r1' } }, d, 'r1').toString(), /data-action="startReferenceUpdate"[^>]*>Update revision…/);
});

test('Home tops Needs attention with an urgent row for a transfer the profile received', () => {
  let d = scheduleFixed(seed(), 'p1', 6, '2026-10-30');
  d = startWorkflow(d, act, { id: 't1', type: 'transferOwner', platformId: 'p1' });
  d = setTransferRecipient(d, act, { workflowId: 't1', toOwnerId: 'u2' });
  for (const g of transferGroups(d, 'p1', '2026-09-28', 't1').filter((x) => x.items.length)) d = setStep(d, act, { workflowId: 't1', hazardId: '-', check: `group:${g.key}`, checked: true });
  d = assignNumbers(completeWorkflow(d, act, { workflowId: 't1' }));
  const out = homeView({ ...state, profileId: 'u2', homeOwner: 'me' }, d).toString();
  assert.match(out, /<tbody><tr class="urgent"[\s\S]*?chip-urgent[\s\S]*?Review the transfer of Alpha from Ada[\s\S]*?Review →/);
});

test('a page opened from an update shows the banner back to it', () => {
  let d = createReference(seed(), act, { id: 'r1', title: 'Range manual', url: 'x' });
  d = linkReference(d, act, { referenceId: 'r1', targetKind: 'hazard', targetId: 'h1' });
  d = assignNumbers(startWorkflow(d, act, { id: 'u1', type: 'referenceUpdate', referenceId: 'r1' }));
  const s = { ...state, session: { base: d, working: d }, view: { name: 'hazard', id: 'h1', via: 'u1' } };
  assert.match(renderApp(s).toString(), /class="via-banner"[\s\S]*?Working on WF-001[\s\S]*?← Back to WF-001/);
});
