import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../../DocGen/doc-designer.js';

const prov = (id, label) => ({ id, label, keyColumn: { id: '_key', label: 'ID', get: (r) => r.id }, columns: [{ id: 'v', label: 'V', get: (r) => r.v }], rows: () => [{ id: 'X-1', v: 'x' }] });
function host(report = {}) {
  const state = { report };
  const h = {
    getState: () => state, commit: (m) => m(state), clock: { nowIso: () => '2026-10-14T00:00:00.000Z' },
    sections: () => [prov('hazards', 'Hazards'), prov('sfarp', 'SFARP')],
  };
  App.docHost.set(h);
  return h;
}
const ids = (h) => App.docGen.reportBlocks(h, {}).map((b) => b.id);

test('a design that lists register tables holds those; one that never chose holds them all', () => {
  assert.deepEqual(ids(host()), ['toc', 'hazards', 'sfarp']);
  assert.deepEqual(ids(host({ registers: [] })), ['toc'], 'an empty list is none');
  assert.deepEqual(ids(host({ registers: ['sfarp'] })), ['toc', 'sfarp']);
  assert.deepEqual(ids(host({ registers: ['sfarp', 'nope'] })), ['toc', 'sfarp'], 'one the host does not declare is ignored');
});

test('removing a register table takes it and its settings; adding one back puts it at the end', () => {
  const h = host({ order: ['toc', 'sfarp', 'hazards'], intros: { sfarp: 'x' }, pageBreak: { sfarp: false } });
  App.docStore.removeRegister('sfarp');
  assert.deepEqual(h.getState().report, { order: ['toc', 'hazards'], registers: ['hazards'] }, 'it held them all: now the rest');
  App.docStore.removeRegister('hazards');
  assert.deepEqual(h.getState().report.registers, [], 'none is kept as none');
  assert.equal(App.docStore.addRegister('sfarp').ok, true);
  assert.equal(App.docStore.addRegister('sfarp').ok, true, 'twice is once');
  assert.deepEqual(h.getState().report.registers, ['sfarp']);
  assert.deepEqual(h.getState().report.order, ['toc', 'sfarp']);
  assert.equal(App.docStore.addRegister('nope').ok, false);
});

test('a report template carries the register tables, and applying it brings them', () => {
  const h = host({ registers: ['hazards'] });
  App.docStore.saveReportTemplate('With hazards');
  const t = h.getState().report.reportTemplates[0];
  assert.deepEqual(t.registers, ['hazards']);
  const applied = App.docStore.applyReportTemplate({ registers: ['sfarp'] }, t, true);
  assert.deepEqual(applied.registers, ['hazards']);
  const all = App.docStore.applyReportTemplate({ registers: ['sfarp'] }, { ...t, registers: undefined }, true);
  assert.equal('registers' in all, false, 'a template that never chose holds them all');
});

const RD = App.ui.views.reportDesign;
function draw(h, set = {}) {
  RD.open(); RD.pane('section');
  Object.assign(RD._rd, { addMenu: false }, set);
  const html = RD.render(h.getState());
  RD.close(); RD._rd.addMenu = false;
  return html;
}
const withCatalogue = (h) => Object.assign(h, { catalogue: () => ({ root: 'platform', data: null, collections: {
  platform: { label: 'Platform', fields: [], children: ['hazard'] }, hazard: { label: 'Hazard', plural: 'Hazards', fields: [{ id: 'id', label: 'ID', type: 'text' }], children: [] } } }) });

test('+ Add section opens a menu: blank, repeating, a register table not in the document, or a template', () => {
  const h = withCatalogue(host({ registers: ['hazards'], sectionTemplates: [{ id: 'tpl1', name: 'Sign-off', title: 'Sign-off', parts: [] }] }));
  assert.match(draw(h), /<button type="button" class="primary" data-rd-add-menu aria-expanded="false">\+ Add section<\/button>/);
  assert.doesNotMatch(draw(h), /data-rd-use-template[^-]/, 'the separate template select has gone');
  const html = draw(h, { addMenu: true });
  assert.match(html, /class="rd-addmenu"/);
  assert.match(html, /data-rd-add-section[^>]*>Blank section/);
  assert.match(html, /data-rd-add-repeat="hazard"[^>]*>Hazard/);
  assert.match(html, /data-rd-add-register="sfarp"[^>]*>SFARP/);
  assert.doesNotMatch(html, /data-rd-add-register="hazards"/, 'one already in is not offered');
  assert.match(html, /data-rd-use-template-id="tpl1"[^>]*>Sign-off/);
});

test('a register table\'s row has a ✕ to take it out; your own sections and Contents do not', () => {
  const h = host({ sections: [{ id: 'sec1', title: 'Mine', parts: [] }] });
  const html = draw(h);
  assert.match(html, /data-rd-del-register="hazards"/);
  assert.match(html, /data-rd-del-register="sfarp"/);
  assert.doesNotMatch(html, /data-rd-del-register="(toc|sec1)"/);
});
