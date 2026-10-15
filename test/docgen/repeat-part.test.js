import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../../DocGen/doc-designer.js';

const RD = App.ui.views.reportDesign;
const COLLS = {
  platform: { label: 'Platform', fields: [{ id: 'name', label: 'Name', type: 'text' }], children: ['hazard'] },
  hazard: { label: 'Hazard', plural: 'Hazards', fields: [{ id: 'id', label: 'ID', type: 'text' }], children: ['control'] },
  control: { label: 'Control', plural: 'Controls', fields: [{ id: 'id', label: 'ID', type: 'text' }, { id: 'status', label: 'Status', type: 'text' }], children: [] },
};
const ctl = (key, id, status) => ({ key, values: { id, status }, children: {} });
const DATA = { key: 'p1', values: { name: 'Ship' }, children: { hazard: [
  { key: 'h1', values: { id: 'HAZ-001' }, children: { control: [ctl('c1', 'C-001', 'Implemented'), ctl('c2', 'C-002', 'Rejected')] } },
  { key: 'h2', values: { id: 'HAZ-002' }, children: { control: [ctl('c3', 'C-003', 'Implemented')] } }] } };

const nested = () => ({ id: 'rp1', kind: 'repeat', repeat: { each: 'control' }, parts: [
  { id: 'pa1', kind: 'para', text: 'Control {{f:control.id}} of {{f:hazard.id}}' },
  { id: 'tb1', kind: 'table', caption: 'Control {{f:control.id}}', header: ['Field', 'Value'], rows: [['Status', '{{f:control.status}}']] }] });

function host(parts = [nested()]) {
  const state = { report: { sections: [{ id: 'sec1', title: '{{f:hazard.id}}', repeat: { each: 'hazard' }, parts }], levels: { sec1: 1 }, options: { sections: { toc: false, meta: false } } } };
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
const doc = (h) => App.docGen.documentFor(h, { ...App.docSession.options(h.getState()), subjectId: 'p1' }, { utc: '2026-10-14T00:00:00Z' }).document;

test('a Repeat part prints its parts once per item, each in its own scope, numbered as tables', () => {
  const blocks = doc(host()).blocks;
  assert.deepEqual(blocks.filter((b) => b.kind === 'paragraph').map((b) => text(b.runs)), ['Control C-001 of HAZ-001', 'Control C-002 of HAZ-001', 'Control C-003 of HAZ-002']);
  const tables = blocks.filter((b) => b.kind === 'table');
  assert.deepEqual(tables.map((t) => text(t.caption.runs)), ['Table 1: Control C-001', 'Table 2: Control C-002', 'Table 3: Control C-003']);
  assert.deepEqual(tables.map((t) => text(t.rows[0][1])), ['Implemented', 'Rejected', 'Implemented']);
  assert.equal(new Set(tables.map((t) => t.anchor)).size, 3);
});

test('a Repeat part with a filter, and one nested in another', () => {
  const rp = nested();
  rp.repeat.where = { field: 'status', op: 'is', value: 'Implemented' };
  rp.parts = [{ id: 'pa1', kind: 'para', text: '{{f:control.id}}' }];
  assert.deepEqual(doc(host([rp])).blocks.filter((b) => b.kind === 'paragraph').map((b) => text(b.runs)), ['C-001', 'C-003']);
});

test('a part inside a Repeat part is found by every part edit', () => {
  const h = host();
  const st = h.getState().report.sections[0];
  assert.equal(App.docStore.setCell('sec1', 'tb1', 0, 1, 'x').ok, true);
  assert.equal(st.parts[0].parts[1].rows[0][1], 'x');
  assert.equal(App.docStore.updatePart('sec1', 'pa1', { text: 'changed' }).ok, true);
  assert.equal(st.parts[0].parts[0].text, 'changed');
  assert.equal(App.docStore.setParaLevel('sec1', 'pa1', 2).ok, true);
  assert.equal(App.docStore.movePart('sec1', 'tb1', -1).ok, true);
  assert.deepEqual(st.parts[0].parts.map((p) => p.id), ['tb1', 'pa1']);
  assert.equal(App.docStore.removePart('sec1', 'pa1').ok, true);
  assert.deepEqual(st.parts[0].parts.map((p) => p.id), ['tb1']);
});

test('parts are added into a Repeat part, with ids unique across the nesting', () => {
  const h = host();
  const r = App.docStore.addPart('sec1', 'para', null, 'rp1');
  assert.equal(r.ok, true);
  const ids = h.getState().report.sections[0].parts[0].parts.map((p) => p.id);
  assert.deepEqual(ids, ['pa1', 'tb1', r.id]);
  assert.ok(!['rp1', 'pa1', 'tb1'].includes(r.id), 'not an id already used inside the Repeat part');
  const r2 = App.docStore.addPart('sec1', 'repeat');
  assert.equal(h.getState().report.sections[0].parts.find((p) => p.id === r2.id).kind, 'repeat');
  assert.deepEqual(h.getState().report.sections[0].parts.find((p) => p.id === r2.id).parts, []);
});

test('dragging a part moves it between a section and a Repeat part, never into itself', () => {
  const h = host([nested(), { id: 'out1', kind: 'para', text: 'outside' }]);
  const s = h.getState().report.sections[0];
  App.docStore.movePart('sec1', 'out1', 0, 'pa1');
  assert.deepEqual(s.parts[0].parts.map((p) => p.id), ['out1', 'pa1', 'tb1']);
  App.docStore.movePart('sec1', 'rp1', 0, 'tb1');
  assert.deepEqual(s.parts.map((p) => p.id), ['rp1'], 'a Repeat part cannot go inside itself');
});

test('a Repeat part and its parts are checked on import', () => {
  const file = (parts) => JSON.stringify({ kind: App.docTemplates.KINDS.sections.kind, items: [{ name: 'T', parts }] });
  assert.equal(App.docTemplates.parseImport(file([nested()]), 'sections').ok, true);
  assert.equal(App.docTemplates.parseImport(file([{ id: 'r', kind: 'repeat', repeat: { each: 'control' }, parts: [{ id: 'x', kind: 'nope' }] }]), 'sections').ok, false);
});

test('the editor draws a Repeat part with its own parts and add bar, and its fields in scope', () => {
  const h = host();
  RD.open(); RD.pane('section');
  Object.assign(RD._rd, { selected: 'sec1', secCat: 'content' });
  const html = RD.render(h.getState());
  RD.close(); Object.assign(RD._rd, { selected: null, secCat: null });
  assert.match(html, /class="rd-part rd-repeatpart"[^>]*data-rd-partrow="rp1"/);
  assert.match(html, /<select data-rd-rpart-each="rp1" data-rd-sec="sec1"[^>]*>[\s\S]*?<option value="control" selected>Control<\/option>/);
  assert.match(html, /data-rd-addpart="para" data-rd-sec="sec1" data-rd-parent="rp1"/);
  assert.match(html, /data-rd-text="pa1"/);
  assert.match(html, /rd-chip rd-field" contenteditable="false" data-rd-tok="f:control\.id"/, 'a control field is in scope inside the Repeat part');
});

test('"+SPACE" puts a 10mm Space straight after a part, in the same list — inside a Repeat part too', () => {
  const h = host([nested(), { id: 'pa9', kind: 'para', text: 'After' }]);
  const kinds = (list) => list.map((p) => p.kind + (p.kind === 'space' ? ':' + p.height : ''));
  assert.equal(App.docStore.addSpaceAfter('sec1', 'pa1').ok, true);
  const sec = h.getState().report.sections[0];
  assert.deepEqual(kinds(sec.parts[0].parts), ['para', 'space:10', 'table']);
  App.docStore.addSpaceAfter('sec1', 'rp1');
  assert.deepEqual(kinds(sec.parts), ['repeat', 'space:10', 'para']);
  assert.equal(App.docStore.addSpaceAfter('sec1', 'nope').ok, false);
  // Every part but a Space carries the button.
  RD.open(); RD.select('sec1'); RD._rd.secCat = 'content';
  const html = RD.render(h.getState()); RD.close();
  assert.deepEqual([...html.matchAll(/data-rd-space-after="([^"]+)"/g)].map((m) => m[1]).sort(), ['pa1', 'pa9', 'rp1', 'tb1']);
});

test('every printed block says which section it prints for (a copy: the section copied), for the preview to go back to', () => {
  const blocks = doc(host()).blocks.filter((b) => b.kind !== 'pageBreak');
  assert.ok(blocks.length > 0);
  assert.deepEqual([...new Set(blocks.map((b) => b.sec))], ['sec1']);
  // And each category's heading carries the section's go-to.
  const h = host();
  RD.open(); RD.select('sec1'); RD._rd.secCat = 'heading';
  const html = RD.render(h.getState()); RD.close();
  assert.match(html, /<h5 class="rd-sec-title"><span>[^<]*<\/span><button[^>]*data-rd-sec-goto="sec1"/);
});
