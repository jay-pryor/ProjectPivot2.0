import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../../DocGen/doc-designer.js';

const RD = App.ui.views.reportDesign;
const COLLS = {
  platform: { label: 'Platform', fields: [{ id: 'name', label: 'Name', type: 'text' }], children: ['hazard'] },
  hazard: { label: 'Hazard', plural: 'Hazards', fields: [{ id: 'id', label: 'ID', type: 'text' }], children: ['control'] },
  control: { label: 'Control', plural: 'Controls', fields: [{ id: 'id', label: 'ID', type: 'text' }], children: [] },
};
const ctl = (key, id) => ({ key, values: { id }, children: {} });
const DATA = { key: 'p1', values: { name: 'Ship' }, children: { hazard: [
  { key: 'h1', values: { id: 'HAZ-001' }, children: { control: [ctl('c1', 'C-001'), ctl('c2', 'C-002')] } },
  { key: 'h2', values: { id: 'HAZ-002' }, children: { control: [] } }] } };
const FILL = '{{fill:fill1?label=Rationale}}';

function host(extra = {}) {
  const state = { report: {
    sections: [
      { id: 'sec1', title: '{{f:hazard.id}}', repeat: { each: 'hazard' }, parts: [
        { id: 'rp1', kind: 'repeat', repeat: { each: 'control' }, parts: [{ id: 'pa1', kind: 'para', text: '{{f:control.id}}: ' + FILL }] }] },
      { id: 'sec2', title: 'Summary', parts: [{ id: 'pa2', kind: 'para', text: '{{fill:fill2?label=Overall}}' }] }],
    levels: { sec1: 1, sec2: 1 }, options: { sections: { toc: false, meta: false } },
    fills: { fill1: { 'hazard:h1/control:c1': 'Because {{b}}reasons{{/b}}' } },
    ...extra } };
  const h = {
    getState: () => state, commit: (m) => m(state), clock: { nowIso: () => '2026-10-14T00:00:00.000Z' },
    subject: { list: () => [{ id: 'p1', label: 'Ship' }], ready: () => true, meta: () => [] },
    sections: () => [],
    catalogue: (run) => ({ root: 'platform', collections: COLLS, data: run && run.subjectId ? DATA : null }),
  };
  App.docHost.set(h);
  return h;
}
const text = (rs) => (rs || []).map((r) => (r.br ? '\n' : r.text)).join('');
const opts = (h) => ({ ...App.docSession.options(h.getState()), subjectId: 'p1' });
const paras = (h) => App.docGen.documentFor(h, opts(h), { utc: '2026-10-14T00:00:00Z' }).document.blocks.filter((b) => b.kind === 'paragraph');

test('a fill prints the text written for its entry, and a marker where none is', () => {
  const ps = paras(host());
  assert.deepEqual(ps.map((b) => text(b.runs)), ['C-001: Because reasons', 'C-002: [To fill in: Rationale]', '[To fill in: Overall]']);
  assert.equal(ps[0].runs.find((r) => r.text === 'reasons').bold, true, 'the written text keeps its emphasis');
  assert.equal(ps[1].runs.find((r) => /To fill in/.test(r.text)).bold, true);
});

test('every fill in the document is listed with its entry, and what is left over is counted', () => {
  const h = host({ fills: { fill1: { 'hazard:h1/control:c1': 'x', 'hazard:h9/control:c9': 'gone' }, fill7: { '': 'orphan' } } });
  const f = App.docGen.fillsIn(h, opts(h));
  assert.deepEqual(f.items.map((i) => [i.id, i.key, i.where, i.sectionId, i.value]), [
    ['fill1', 'hazard:h1/control:c1', 'HAZ-001 › C-001', 'sec1', 'x'],
    ['fill1', 'hazard:h1/control:c2', 'HAZ-001 › C-002', 'sec1', ''],
    ['fill2', '', '', 'sec2', ''],
  ]);
  assert.equal(f.items[0].label, 'Rationale');
  assert.deepEqual(f.leftovers, { fill1: 1, fill7: 1 });
  assert.equal(App.docStore.pruneFills(f.live).ok, true);
  assert.deepEqual(h.getState().report.fills, { fill1: { 'hazard:h1/control:c1': 'x' } });
});

test('a fill is written per entry, and an empty one is removed', () => {
  const h = host({ fills: undefined });
  App.docStore.setFill('fill1', 'hazard:h1/control:c2', 'Done');
  assert.deepEqual(h.getState().report.fills, { fill1: { 'hazard:h1/control:c2': 'Done' } });
  App.docStore.setFill('fill1', 'hazard:h1/control:c2', '  ');
  assert.equal('fills' in h.getState().report, false);
});

test('a new fill takes an id no section or template uses', () => {
  host({ sectionTemplates: [{ id: 'tpl1', name: 'T', parts: [{ id: 'q', kind: 'para', text: '{{fill:fill9?label=x}}' }] }] });
  assert.equal(App.docStore.nextFillId(), 'fill10');
});

test('fills are the report\'s: a report template does not carry them', () => {
  const h = host();
  App.docStore.saveReportTemplate('SSRA');
  assert.equal('fills' in h.getState().report.reportTemplates[0], false);
});

test('deleting a section takes the fills only it held', () => {
  const h = host({ fills: { fill1: { a: 'x' }, fill2: { '': 'y' } } });
  App.docStore.removeSection('sec2');
  assert.deepEqual(Object.keys(h.getState().report.fills), ['fill1']);
});

function render(h, set) {
  RD.open(); RD.pane(set.pane || 'section');
  Object.assign(RD._rd, { selected: null, secCat: null, fieldFor: null }, set);
  const html = RD.render(h.getState());
  RD.close(); Object.assign(RD._rd, { selected: null, secCat: null, fieldFor: null }); RD.pane('section');
  return html;
}

test('a section with blanks has a Fill in category: a box per entry, under the entry\'s name', () => {
  const html = render(host(), { selected: 'sec1', secCat: 'fill' });
  assert.match(html, /data-rd-sec-cat="fill"/);
  assert.match(html, /HAZ-001 › C-002[\s\S]*?data-rd-fill="fill1" data-rd-fill-key="hazard:h1\/control:c2"/);
  assert.match(html, /data-rd-fill="fill1" data-rd-fill-key="hazard:h1\/control:c1"[^>]*>Because <strong>reasons<\/strong>/);
});

test('the Sections list and the Generate tab say what is still to fill in', () => {
  const h = host();
  assert.match(render(h, {}), /<span class="rd-kind rd-tofill"[^>]*>1 to fill in<\/span>[\s\S]*<span class="rd-kind rd-tofill"[^>]*>1 to fill in<\/span>/);
  assert.match(render(h, { pane: 'generate' }), /2<\/strong> blanks still to fill in/);
});

test('the Field menu offers a new blank in text, not in a heading', () => {
  const h = host();
  assert.match(render(h, { selected: 'sec2', secCat: 'content', fieldFor: 'pa2' }), /data-rd-fill-new/);
  assert.doesNotMatch(render(h, { selected: 'sec2', secCat: 'heading', fieldFor: 'head:sec2' }), /data-rd-fill-new/);
});
