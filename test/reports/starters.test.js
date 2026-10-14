import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../../DocGen/doc-designer.js';
import * as D from '../../DocGen/doc-data.js';
import { STARTERS, SSRA } from '../../src/reports/starters.js';
import { catalogueFor } from '../../src/reports/catalogue.js';
import { createDocHost } from '../../src/reports/docgen-host.js';
import { reportsView } from '../../src/ui/screens/reports.js';
import { initialState } from '../../src/ui/controller.js';
import { fixedClock } from '../../src/core/time.js';
import { assignHazardNumbers } from '../../src/core/ops/hazards.js';
import { confirmControl } from '../../src/core/ops/assessment.js';
import { startReport } from '../../src/core/ops/reports.js';
import { act, seed } from '../helpers.js';

const text = (rs) => (rs ?? []).map((r) => (r.br ? '\n' : r.text ?? '')).join('');

test('every field in the SSRA starter is one the register catalogue has', () => {
  const cat = catalogueFor(null);
  const tags = [...JSON.stringify(SSRA).matchAll(/\{\{(f:[^}]+)\}\}/g)].map((m) => m[1]);
  assert.ok(tags.length > 20);
  for (const t of tags) {
    const p = D.parseFieldTag(t);
    assert.ok(p && D.fieldDef(cat, p.coll, p.field), t);
  }
  for (const s of SSRA.sections) assert.equal(App.docStore.normRepeat(s.repeat).error, null, s.id);
  assert.equal(STARTERS[SSRA.id], SSRA);
});

test('a report started from the SSRA starter has a section per hazard, with its tables and the rationale blank', () => {
  let data = assignHazardNumbers(seed());
  data = confirmControl(data, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1' });
  const box = { data };
  const docs = createDocHost({ getData: () => box.data, setDesign: () => {}, clock: fixedClock('2026-09-28T15:00:00+10:00'), profileName: (id) => id });
  const { design } = docs.newDesign(SSRA.id);
  assert.deepEqual(design.registers, [], 'no whole-register tables');
  box.data = startReport(box.data, act, { id: 'r1', title: 'SSRA', design });
  App.docHost.set(docs.hostFor('r1'));
  const { report } = docs.produce('p1', { at: '2026-09-28T15:00:00+10:00', by: 'u1', title: 'SSRA', reportId: 'r1' });
  const heads = report.document.blocks.filter((b) => b.kind === 'heading').map((b) => text(b.runs));
  assert.ok(heads.includes('HAZ-001 Fire'), heads.join(' | '));
  const all = report.document.blocks.map((b) => [text(b.runs), ...(b.rows ?? []).flat().map(text)].join(' ')).join('\n');
  for (const s of ['Hot works', 'Sprinklers', '[To fill in: Control rationale]', 'Personnel']) assert.ok(all.includes(s), s);
  assert.doesNotMatch(all, /\[unknown field\]/);
});

test('Start from offers the SSRA starter', () => {
  const d = assignHazardNumbers(seed());
  const st = { ...initialState(), screen: 'main', profileId: 'u1', session: { base: d, working: d, loadedStamp: null } };
  assert.match(reportsView(st, d).toString(), /<option value="starter:ssra">SSRA \(by hazard\)<\/option>/);
});
