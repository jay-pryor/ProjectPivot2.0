import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../../DocGen/doc-designer.js';

const RD = App.ui.views.reportDesign;
const COLLS = {
  platform: { label: 'Platform', fields: [{ id: 'name', label: 'Name', type: 'text' }], children: ['hazard'] },
  hazard: { label: 'Hazard', plural: 'Hazards', fields: [{ id: 'id', label: 'ID', type: 'text' }], children: ['assessment'] },
  assessment: { label: 'Assessment', plural: 'Assessments', fields: [{ id: 'stage', label: 'Stage', type: 'text' }, { id: 'receptor', label: 'Receptor', type: 'text' }, { id: 'why', label: 'Why', type: 'text' }], children: [] },
};
const a = (key, stage, receptor, why) => ({ key, values: { stage, receptor, why }, children: {} });
const DATA = { key: 'p1', values: { name: 'Ship' }, children: { hazard: [
  { key: 'h1', values: { id: 'HAZ-001' }, children: { assessment: [a('i:p', 'Initial', 'Personnel', 'often'), a('r:p', 'Residual', 'Personnel', 'rare'), a('i:e', 'Initial', 'Environment', 'never')] } },
  { key: 'h2', values: { id: 'HAZ-002' }, children: { assessment: [] } }] } };

function host(parts, extra = {}) {
  const state = { report: { sections: [{ id: 'sec1', title: '{{f:hazard.id}}', repeat: { each: 'hazard' }, parts }], options: { sections: { toc: false, meta: false } }, ...extra } };
  return {
    getState: () => state, commit: (m) => m(state), clock: { nowIso: () => '2026-10-14T00:00:00.000Z' },
    subject: { list: () => [{ id: 'p1', label: 'Ship' }], ready: () => true, meta: () => [] },
    sections: () => [],
    catalogue: (run) => ({ root: 'platform', collections: COLLS, data: run && run.subjectId ? DATA : null }),
  };
}
const text = (rs) => (rs || []).map((r) => (r.br ? '\n' : r.text)).join('');
const tables = (h) => App.docGen.documentFor(h, { ...App.docSession.options(h.getState()), subjectId: 'p1' }, { utc: '2026-10-14T00:00:00Z' })
  .document.blocks.filter((b) => b.kind === 'table').map((t) => t.rows.map((r) => r.map(text)));

test('each template row prints once per item, in order, in the item\'s scope', () => {
  const t = { id: 't1', kind: 'table', header: ['Receptor', 'Detail'], rows: [['{{f:assessment.receptor}}', '{{f:assessment.stage}}'], ['', 'Why: {{f:assessment.why}}']],
    repeat: { each: 'assessment', where: { field: 'stage', op: 'is', value: 'Initial' } } };
  assert.deepEqual(tables(host([t]))[0], [['Personnel', 'Initial'], ['', 'Why: often'], ['Environment', 'Initial'], ['', 'Why: never']]);
});

test('a sort orders the rows', () => {
  const t = { id: 't1', kind: 'table', header: ['R'], rows: [['{{f:assessment.receptor}}']], repeat: { each: 'assessment', sort: { field: 'receptor', dir: 'asc' } } };
  assert.deepEqual(tables(host([t]))[0], [['Environment'], ['Personnel'], ['Personnel']]);
});

test('no items: one row saying so', () => {
  const t = { id: 't1', kind: 'table', header: ['A', 'B'], rows: [['{{f:assessment.receptor}}', 'x']], repeat: { each: 'assessment' } };
  assert.deepEqual(tables(host([t]))[1], [['Nil', '']]);
});

test('a table part is set to repeat its rows, and the setting is checked on import', () => {
  const h = host([{ id: 't1', kind: 'table', header: ['A'], rows: [['x']] }]);
  App.docHost.set(h);
  assert.equal(App.docStore.setPartRepeat('sec1', 't1', { each: 'assessment', sort: { field: 'receptor' } }).ok, true);
  assert.deepEqual(h.getState().report.sections[0].parts[0].repeat, { each: 'assessment', sort: { field: 'receptor', dir: 'asc' } });
  assert.equal(App.docStore.setPartRepeat('sec1', 't1', { each: 'assessment', where: { field: 'x', op: 'bad' } }).ok, false);
  App.docStore.setPartRepeat('sec1', 't1', null);
  assert.equal('repeat' in h.getState().report.sections[0].parts[0], false);
  const bad = App.docTemplates.parseImport(JSON.stringify({ kind: App.docTemplates.KINDS.sections.kind, items: [{ name: 'T', parts: [{ id: 'p', kind: 'table', header: ['A'], repeat: { each: 'x y' } }] }] }), 'sections');
  assert.equal(bad.ok, false);
});

test('the table editor offers one row per item of what is reachable, and marks the template rows', () => {
  const h = host([{ id: 't1', kind: 'table', header: ['A'], rows: [['x']], repeat: { each: 'assessment' } }], { levels: { sec1: 1 } });
  App.docHost.set(h);
  RD.open(); RD.pane('section');
  Object.assign(RD._rd, { selected: 'sec1', secCat: 'content' });
  const html = RD.render(h.getState());
  RD.close(); Object.assign(RD._rd, { selected: null, secCat: null });
  assert.match(html, /<select data-rd-rows-each="t1" data-rd-sec="sec1"[^>]*>[\s\S]*?<option value="assessment" selected>Assessment<\/option>/);
  assert.match(html, /data-rd-rows-wfield="t1"/);
  assert.match(html, /<tr class="rd-rowtpl"/);
});
