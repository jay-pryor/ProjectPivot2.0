import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeData } from '../../src/core/data.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { createControl, copyControlAs, updateControl, linkControl, linkExistingControl, setControlOwner } from '../../src/core/ops/controls.js';
import { setControlStatus } from '../../src/core/ops/assessment.js';
import { controlLabel } from '../../src/core/ids.js';
import { openItems, attentionItems, controlOrigins } from '../../src/core/queries.js';
import { mergeData } from '../../src/core/merge.js';
import { seed, act, later, asExisting } from '../helpers.js';

test('additional and existing controls are numbered apart: C-001 and EC-001', () => {
  let d = createControl(seed(), act, { id: 'e1', title: 'Fire wall', category: 'existing' });
  d = createControl(d, act, { id: 'e2', title: 'Bund', category: 'existing' });
  d = assignNumbers(d);
  assert.deepEqual(['c1', 'c2', 'e1', 'e2'].map((id) => controlLabel(d.records.control[id])), ['C-001', 'C-002', 'EC-001', 'EC-002']);
  assert.equal(d.nextExistingControlNumber, 3);
  assert.equal(d.nextControlNumber, 3);
});

test('an additional control links to hazards, an existing control goes on a platform, never the other way', () => {
  const d = createControl(seed(), act, { id: 'e1', title: 'Fire wall', category: 'existing' });
  assert.throws(() => linkControl(d, act, { hazardId: 'h1', controlId: 'e1', kind: 'preventative' }), /is an existing control/);
  assert.throws(() => linkExistingControl(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c1', kind: 'preventative' }), /is an additional control/);
  assert.equal(linkExistingControl(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'e1', kind: 'preventative' }).records.existingControl['ec:h1:p1:e1'].status, 'live');
});

test('Create as: a control of the other kind with the same title, description and tier', () => {
  let d = createControl(seed(), act, { id: 'c3', title: 'Hot work permit', description: 'Signed off', tier: 'Administrative' });
  d = copyControlAs(d, act, { id: 'e1', from: 'c3', category: 'existing' });
  assert.deepEqual(['category', 'title', 'description', 'tier', 'number'].map((k) => d.records.control.e1[k]), ['existing', 'Hot work permit', 'Signed off', 'Administrative', null]);
  assert.equal(d.records.control.c3.category, 'additional', 'the original is untouched');
  assert.throws(() => copyControlAs(d, act, { from: 'e1', category: 'existing' }), /already an existing control/);
});

test('opening older data sorts its controls: used only as existing becomes existing; used both ways splits, keeping every link', () => {
  // c1 additional (linked to h1) and existing on p1, with an owner there; c2 additional only; c3 existing only.
  let d = createControl(asExisting(seed(), 'c1'), act, { id: 'c3', title: 'Fire wall', category: 'existing' });
  d = linkExistingControl(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c1', kind: 'preventative' });
  d = linkExistingControl(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c3', kind: 'mitigating' });
  d = setControlOwner(d, act, { controlId: 'c1', platformId: 'p1', owner: 'us' });
  d = assignNumbers(d);
  const old = structuredClone(d);
  for (const c of Object.values(old.records.control)) delete c.category;
  delete old.nextExistingControlNumber;
  const n = normalizeData(old);
  assert.deepEqual(['c1', 'c2', 'c3'].map((id) => n.records.control[id].category), ['additional', 'additional', 'existing']);
  assert.equal(n.records.control.c3.number, null, 'numbered afresh as EC- when saved');
  const copy = n.records.control['c1~existing'];
  assert.deepEqual([copy.category, copy.title, copy.number], ['existing', 'Sprinklers', null]);
  assert.equal(n.records.existingControl['ec:h1:p1:c1'].status, 'deleted');
  assert.deepEqual([n.records.existingControl['ec:h1:p1:c1~existing'].status, n.records.existingControl['ec:h1:p1:c1~existing'].kind], ['live', 'preventative']);
  assert.equal(n.records.controlPlatform['cp:c1~existing:p1'].owner, 'us', 'its owner there comes too');
  assert.equal(n.records.hazardControl['hc:h1:c1'].status, 'live', 'still an additional control for h1');
  assert.deepEqual(normalizeData(structuredClone(old)), n, 'the same file always converts the same way');
  const saved = assignNumbers(n);
  assert.deepEqual([controlLabel(saved.records.control.c3), controlLabel(saved.records.control['c1~existing'])].sort(), ['EC-001', 'EC-002']);
});

test('merging keeps the two counters apart', () => {
  const base = assignNumbers(seed());
  const mine = assignNumbers(createControl(base, act, { id: 'e1', title: 'Fire wall', category: 'existing' }));
  const theirs = assignNumbers(createControl(base, later, { id: 'c9', title: 'Alarm' }));
  const m = mergeData(base, mine, theirs, act).data;
  assert.equal(m.nextExistingControlNumber, 2);
  assert.equal(m.nextControlNumber, 4);
});

test('open items: controls we own and have planned, and platforms with no review schedule', () => {
  let d = setControlOwner(seed(), act, { controlId: 'c1', platformId: 'p1', owner: 'us' });
  d = setControlStatus(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', status: 'planned' });
  d = setControlOwner(d, act, { controlId: 'c2', platformId: 'p1', owner: 'customer' });
  d = setControlStatus(d, act, { hazardId: 'h1', controlId: 'c2', platformId: 'p1', status: 'planned' });
  const o = openItems(d, '2026-09-28', 'u1');
  assert.deepEqual(o.toImplement.map((x) => x.control.id), ['c1'], 'planned by the customer is theirs to do');
  assert.deepEqual(o.reviews.map((r) => [r.platform.id, r.state]), [['p1', 'none']]);
  const types = attentionItems(o).map((x) => x.type);
  assert.ok(types.includes('implement') && types.includes('schedule'));
  assert.equal(types.at(-1), 'schedule', 'least urgent last');
});

test('an existing control has a typed origin, and the origins already given are suggested once each, in order', () => {
  let d = createControl(seed(), act, { id: 'e1', title: 'Fire wall', category: 'existing' });
  d = createControl(d, act, { id: 'e2', title: 'Bund', category: 'existing' });
  d = createControl(d, act, { id: 'e3', title: 'Alarm', category: 'existing' });
  d = updateControl(d, act, { id: 'e1', origin: '  Original build ' });
  assert.equal(d.records.control.e1.origin, 'Original build', 'trimmed');
  d = updateControl(d, act, { id: 'e2', origin: 'original build' });
  d = updateControl(d, act, { id: 'e3', origin: 'Class rules' });
  d = updateControl(d, act, { id: 'c1', origin: 'Not shown' });
  assert.deepEqual(controlOrigins(d), ['Class rules', 'Original build'], 'existing controls only; the same origin in another case once');
  d = updateControl(d, act, { id: 'e3', origin: '' });
  assert.deepEqual(controlOrigins(d), ['Original build'], 'blank clears it');
});
