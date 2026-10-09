import { test } from 'node:test';
import assert from 'node:assert/strict';
import { created, put } from '../../src/core/data.js';
import { createReference, linkReference, unlinkReference } from '../../src/core/ops/references.js';
import { transferGroups, referenceItems, workflowProgress, TRANSFER_GROUPS, openTransfer, openReferenceUpdate } from '../../src/core/workflows.js';
import { checkRules } from '../../src/core/rules.js';
import { act, seed, scheduleFixed, beginPlatformReview } from '../helpers.js';

const wf = (d, id, fields) => put(d, 'workflow', created(act, id, { number: null, ownerId: 'u1', state: 'open', at: { hazardId: null }, outcome: '', notes: '', endedBy: null, endedAt: null, ...fields }));

test('transfer groups: every group in order, the review schedule always there, the platform’s other open workflows listed', () => {
  let d = scheduleFixed(seed(), 'p1', 6, '2026-10-30');
  d = beginPlatformReview(d, act, { id: 'w1', platformId: 'p1' });
  d = wf(d, 't1', { type: 'transferOwner', platformId: 'p1', toOwnerId: null, fromOwnerId: null, reviewed: null });
  const g = transferGroups(d, 'p1', '2026-09-28', 't1');
  assert.deepEqual(g.map((x) => x.key), TRANSFER_GROUPS.map(([k]) => k));
  assert.deepEqual(g.map((x) => x.key), ['acks', 'review', 'workflows', 'awaiting', 'toImplement', 'controlGaps', 'hazardGaps']);
  assert.equal(g.find((x) => x.key === 'review').items.length, 1);
  assert.match(g.find((x) => x.key === 'review').items[0].text, /30 Oct 2026|2026-10-30/);
  assert.deepEqual(g.find((x) => x.key === 'workflows').items.map((i) => i.id), ['w1'], 'not the transfer itself');
  assert.ok(g.find((x) => x.key === 'awaiting').items.length >= 1, 'seed controls are recommended on p1');
  assert.equal(openTransfer(d, 'p1')?.id, 't1');
});

test('reference items: each live link with its platforms and where it opens; unlinked ones drop out', () => {
  let d = createReference(seed(), act, { id: 'r1', title: 'Range manual', revision: 'B', url: 'https://x' });
  d = linkReference(d, act, { referenceId: 'r1', targetKind: 'hazard', targetId: 'h1' });
  d = linkReference(d, act, { referenceId: 'r1', targetKind: 'control', targetId: 'c1' });
  d = linkReference(d, act, { referenceId: 'r1', targetKind: 'causalFactor', targetId: 'cf1' });
  const items = referenceItems(d, 'r1');
  assert.deepEqual(items.map((i) => i.key).sort(), ['causalFactor:cf1', 'control:c1', 'hazard:h1']);
  const h = items.find((i) => i.key === 'hazard:h1');
  assert.deepEqual([h.kind, h.platforms.sort(), h.open.view, h.open.id], ['hazard', ['Alpha', 'Bravo'], 'hazard', 'h1']);
  assert.deepEqual([items.find((i) => i.key === 'causalFactor:cf1').open.view, items.find((i) => i.key === 'causalFactor:cf1').open.id], ['hazard', 'h1'], 'a causal factor opens its hazard');
  d = unlinkReference(d, act, { referenceId: 'r1', targetKind: 'control', targetId: 'c1' });
  assert.ok(!referenceItems(d, 'r1').some((i) => i.key === 'control:c1'));
});

test('progress for a transfer counts the recipient and ticked non-empty groups; for an update the draft and ticked items', () => {
  let d = wf(seed(), 't1', { type: 'transferOwner', platformId: 'p1', toOwnerId: null, fromOwnerId: null, reviewed: null });
  const nonEmpty = transferGroups(d, 'p1', '2026-09-28', 't1').filter((g) => g.items.length).length;
  assert.deepEqual([workflowProgress(d, d.records.workflow.t1).done, workflowProgress(d, d.records.workflow.t1).total], [0, nonEmpty + 1]);
  d = createReference(d, act, { id: 'r1', title: 'Manual', revision: 'B', url: 'https://x' });
  d = linkReference(d, act, { referenceId: 'r1', targetKind: 'hazard', targetId: 'h1' });
  d = wf(d, 'u1', { type: 'referenceUpdate', platformId: null, referenceId: 'r1', revision: '', file: null, url: null, path: null });
  assert.deepEqual([workflowProgress(d, d.records.workflow.u1).done, workflowProgress(d, d.records.workflow.u1).total], [0, 2]);
  assert.equal(openReferenceUpdate(d, 'r1')?.id, 'u1');
});

test('rules: a reference update needs a live reference; one open transfer per platform and one open update per reference', () => {
  let d = createReference(seed(), act, { id: 'r1', title: 'Manual', revision: 'B', url: 'https://x' });
  d = wf(d, 'u1', { type: 'referenceUpdate', platformId: null, referenceId: 'r1', revision: '', file: null, url: null, path: null });
  assert.deepEqual(checkRules(d), [], 'no platform needed');
  assert.ok(checkRules(put(d, 'reference', { ...d.records.reference.r1, status: 'deleted' })).some((v) => v.rule === 'workflow-subject-not-live'));
  const two = wf(d, 'u2', { type: 'referenceUpdate', platformId: null, referenceId: 'r1', revision: '', file: null, url: null, path: null });
  assert.ok(checkRules(two).some((v) => v.rule === 'two-open-updates'));
  let t = wf(seed(), 't1', { type: 'transferOwner', platformId: 'p1', toOwnerId: null, fromOwnerId: null, reviewed: null });
  t = wf(t, 't2', { type: 'transferOwner', platformId: 'p1', toOwnerId: null, fromOwnerId: null, reviewed: null });
  assert.ok(checkRules(t).some((v) => v.rule === 'two-open-transfers'));
});
