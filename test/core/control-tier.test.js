import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { emptyData } from '../../src/core/data.js';
import { entries } from '../../src/core/history.js';
import { CONTROL_TIERS, tierRank, createControl, updateControl } from '../../src/core/ops/controls.js';
import { assignHazardNumbers } from '../../src/core/ops/hazards.js';
import { buildSnapshot } from '../../src/reports/snapshot.js';
import { createDocHost } from '../../src/reports/docgen-host.js';
import { fixedClock } from '../../src/core/time.js';
import { act, seed } from '../helpers.js';

const code = (c) => (e) => e instanceof PivotError && e.code === c;

test('the hierarchy of controls, most effective first; not set sorts last', () => {
  assert.deepEqual(CONTROL_TIERS, ['Elimination', 'Substitution', 'Isolation', 'Engineering', 'Administrative', 'PPE']);
  assert.deepEqual(['PPE', null, 'Elimination', 'Engineering'].sort((a, b) => tierRank(a) - tierRank(b)), ['Elimination', 'Engineering', 'PPE', null]);
});

test('a control starts with no tier; its tier is set, changed and cleared, and logged', () => {
  let d = createControl(emptyData(), act, { id: 'c1', title: 'Guard rail' });
  assert.equal(d.records.control.c1.tier, null);
  d = updateControl(d, act, { id: 'c1', tier: 'Engineering' });
  assert.equal(d.records.control.c1.tier, 'Engineering');
  assert.deepEqual(entries(d).at(-1).items[0].fields.map((f) => [f.field, f.before, f.after]), [['tier', null, 'Engineering']]);
  assert.equal(updateControl(d, act, { id: 'c1', tier: '' }).records.control.c1.tier, null, 'blank clears it');
  assert.throws(() => updateControl(d, act, { id: 'c1', tier: 'Magic' }), code('control.tier'));
  assert.equal(createControl(emptyData(), act, { id: 'c2', title: 'Gloves', tier: 'PPE' }).records.control.c2.tier, 'PPE');
});

test('reports: each control carries its tier, and the Controls section has an optional Tier column', () => {
  const d = assignHazardNumbers(updateControl(seed(), act, { id: 'c1', tier: 'Engineering' }));
  const s = buildSnapshot(d, 'p1', { profileName: (id) => id, at: act.at, by: 'u1', title: 'T', classification: '' });
  assert.deepEqual(s.rows[0].controls.map((c) => [c.title, c.tier]), [['Sprinklers', 'Engineering'], ['Fire drills', '']]);
  const docs = createDocHost({ getData: () => d, setDesign: () => {}, clock: fixedClock(act.at), profileName: (id) => id });
  const sec = docs.host.sections({ subjectId: 'p1' }).find((x) => x.id === 'controls');
  const tier = sec.columns.find((c) => c.id === 'tier');
  assert.deepEqual([tier.label, tier.optional], ['Tier', true]);
  assert.equal(tier.get(sec.rows()[0]), 'Engineering');
});
