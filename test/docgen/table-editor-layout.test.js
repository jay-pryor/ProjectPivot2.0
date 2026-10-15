import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../../DocGen/doc-designer.js';

const RD = App.ui.views.reportDesign;

function host() {
  const state = { report: { sections: [{ id: 'sec1', title: 'Sign-off', parts: [{ id: 'part1', kind: 'table', caption: '', align: ['l', 'l'],
    header: ['Name', 'Signature'], rows: [['', ''], ['', '']], rowHeight: 10 }] }] } };
  return { getState: () => state, commit: (m) => m(state), clock: { nowIso: () => '2026-10-15T00:00:00Z' }, sections: () => [] };
}
function render(set) {
  const h = host();
  App.docHost.set(h);
  RD.open();
  Object.assign(RD._rd, { selected: 'sec1', secCat: 'content', tableLayout: {}, lookOpen: {} }, set);
  const html = RD.render(h.getState());
  RD.close();
  return html;
}
const LAYOUT = ['data-rd-delcol=', 'data-rd-delrow=', 'data-rd-align=', 'data-rd-addcol=', 'data-rd-colresize', 'data-rd-rowheight=', 'data-rd-tallrow=', 'class="rd-colpct', 'data-rd-autowidth='];

test('a table shows just its cells, its caption and its settings until its layout is being edited', () => {
  const html = render();
  for (const a of LAYOUT) assert.ok(!html.includes(a), a + ' is hidden');
  assert.match(html, /data-rd-tlayout="part1"[^>]*aria-pressed="false"[^>]*>[^<]*Edit table layout/);
  assert.match(html, /data-rd-addrow="part1"/, 'adding a row is writing, not layout');
  assert.match(html, /class="rd-tsettings"[\s\S]*Caption[\s\S]*data-rd-caption-rich="part1"[\s\S]*No caption[\s\S]*Centre/);
  assert.match(html, /data-rd-cell="part1"[^>]*data-rd-row="1" data-rd-col="1"/);
});

test('with Edit table layout on, the column, row and width controls come back', () => {
  const html = render({ tableLayout: { part1: true } });
  for (const a of LAYOUT) assert.ok(html.includes(a), a + ' is shown');
  assert.match(html, /data-rd-tlayout="part1"[^>]*aria-pressed="true"/);
  assert.match(html, /class="rd-part rd-tpart rd-tlayout-on"/);
});

function state0() {
  return { report: { sections: [{ id: 'sec1', title: 'S', parts: [{ id: 'part1', kind: 'table', header: ['A', 'B'], rows: [['x', 'y']] }] }],
    options: { sections: { toc: false, meta: false } } } };
}
function host2(state) {
  return { getState: () => state, commit: (m) => m(state), clock: { nowIso: () => '2026-10-15T00:00:00Z' },
    subject: { list: () => [{ id: 'p1', label: 'Ship' }], ready: () => true, meta: () => [] },
    sections: () => [{ id: 'things', label: 'Things', keyColumn: { id: '_key', label: 'ID', get: (r) => r.id }, columns: [{ id: 'v', label: 'Value', get: (r) => r.v }],
      rows: () => [{ id: 'T-1', v: 'x' }] }] };
}
const tablesOf = (h) => App.docGen.documentFor(h, { ...App.docSession.options(h.getState()), subjectId: 'p1' }, { utc: '2026-10-15T00:00:00Z' })
  .document.blocks.filter((b) => b.kind === 'table');

test('a designer table keeps only the formatting that differs, and Back to Style clears it', () => {
  const st = state0(); App.docHost.set(host2(st));
  App.docStore.setPartLook('sec1', 'part1', 'header.fill', '#ff0000');
  App.docStore.setPartLook('sec1', 'part1', 'borders', 'none');
  App.docStore.setPartLook('sec1', 'part1', 'nonsense.key', 1);
  assert.deepEqual(st.report.sections[0].parts[0].look, { header: { fill: '#ff0000' }, borders: 'none' });
  App.docStore.setPartLook('sec1', 'part1', 'header.fill', undefined);
  assert.deepEqual(st.report.sections[0].parts[0].look, { borders: 'none' });
  App.docStore.setPartLook('sec1', 'part1', null);
  assert.equal('look' in st.report.sections[0].parts[0], false);
});

test('a designer table\'s look and title row reach the document', () => {
  const st = state0(); App.docHost.set(host2(st));
  App.docStore.setPartLook('sec1', 'part1', 'banding.on', true);
  App.docStore.updatePart('sec1', 'part1', { titleRowOn: true, titleRow: '{{b}}Sign-off{{/b}}' });
  const t = tablesOf(host2(st)).find((x) => x.anchor === 'tbl-part1');
  assert.deepEqual(t.look, { banding: { on: true } });
  assert.deepEqual(t.titleRow, [{ text: 'Sign-off', bold: true }]);
  App.docStore.updatePart('sec1', 'part1', { titleRowOn: false });
  assert.equal(tablesOf(host2(st)).find((x) => x.anchor === 'tbl-part1').titleRow, null, 'switched off, the words are kept but not printed');
});

test('a generated table\'s look is kept by its section, reaches the document, and goes with the section', () => {
  const st = state0(); st.report.registers = ['things']; App.docHost.set(host2(st));
  App.docStore.setBlockLook('things', 'firstColumn.on', true);
  assert.deepEqual(st.report.tableLooks, { things: { firstColumn: { on: true } } });
  assert.ok(tablesOf(host2(st)).some((t) => t.look && t.look.firstColumn.on === true));
  App.docStore.setBlockLook('things', null);
  assert.equal('tableLooks' in st.report, false);
});

test('the Formatting panel shows the Style\'s values until the table changes one, and marks the change', () => {
  const html = render({ lookOpen: { 'p|sec1|part1': true } });
  assert.match(html, /data-rd-look-open="p\|sec1\|part1"[^>]*>▾ Formatting <span class="rd-state">Follows the Style/);
  assert.match(html, /data-rd-look="header.fill"[^>]*value="#d9e2f3"/);
  assert.match(html, /data-rd-look-reset[^>]* disabled/);
  assert.doesNotMatch(render(), /data-rd-look="header.fill"/, 'shut until opened');
});

test('layout mode: column deletes in a strip above the table, not in the width bar', () => {
  const html = render({ tableLayout: { part1: true } });
  assert.match(html, /<tr class="rd-colctl"><th><button[^>]*data-rd-delcol="part1"/);
  assert.doesNotMatch(html, /class="rd-colbar">(?:(?!<\/span>)[\s\S])*data-rd-delcol/);
});

test('a title row ticked shows a merged cell box above the headings', () => {
  const h = host(); h.getState().report.sections[0].parts[0].titleRowOn = true;
  App.docHost.set(h); RD.open();
  Object.assign(RD._rd, { selected: 'sec1', secCat: 'content', tableLayout: {} });
  const html = RD.render(h.getState()); RD.close();
  assert.match(html, /<tr class="rd-titlerow"><th colspan="2">[\s\S]*data-rd-titlerow-rich="part1"/);
});

test('Rows reads Custom; Filter (No filter) and Sort by sit on rows of their own', () => {
  const COLLS = { platform: { label: 'Platform', fields: [], children: ['hazard'] }, hazard: { label: 'Hazard', plural: 'Hazards', fields: [{ id: 'id', label: 'ID', type: 'text' }], children: [] } };
  const h = host();
  h.catalogue = () => ({ root: 'platform', collections: COLLS, data: null });
  App.docHost.set(h); RD.open();
  Object.assign(RD._rd, { selected: 'sec1', secCat: 'content', tableLayout: {}, lookOpen: {}, cat: null });
  const plain = RD.render(h.getState());
  h.getState().report.sections[0].parts[0].repeat = { each: 'hazard' };
  RD._rd.cat = null;
  const rep = RD.render(h.getState()); RD.close();
  assert.match(plain, /<option value="" selected>Custom<\/option>/);
  assert.match(rep, /<div class="rd-filtsort"><div class="rd-fs-row"><span class="rd-fs-lab">Filter<\/span><select[^>]*><option value="">No filter<\/option>/);
  assert.match(rep, /<div class="rd-fs-row rd-fs-sort"><span class="rd-fs-lab">Sort by<\/span>/);
  assert.doesNotMatch(rep, /Only where|Every one|As written/);
});
