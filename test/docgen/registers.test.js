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
