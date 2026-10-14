import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../../DocGen/doc-designer.js';

function host() {
  const state = { report: { sections: [{ id: 'sec1', title: 'Per hazard', parts: [{ id: 'part1', kind: 'para', text: '{{f:hazard.id}}' }] }] } };
  const h = { getState: () => state, commit: (m) => m(state), clock: { nowIso: () => '2026-10-14T00:00:00Z' }, sections: [] };
  App.docHost.set(h);
  return state;
}

test('a section is set to repeat, normalised, and cleared', () => {
  const st = host();
  const res = App.docStore.setSectionRepeat('sec1', { each: 'hazard', where: { field: 'risk', op: 'gte', value: 3 }, sort: { field: 'id', dir: 'sideways' } });
  assert.equal(res.ok, true);
  assert.deepEqual(st.report.sections[0].repeat, { each: 'hazard', where: { field: 'risk', op: 'gte', value: '3' }, sort: { field: 'id', dir: 'asc' } });
  App.docStore.setSectionRepeat('sec1', { each: 'hazard', where: { field: '', op: 'is', value: 'x' }, sort: { field: '' } });
  assert.deepEqual(st.report.sections[0].repeat, { each: 'hazard' }, 'a filter or sort with no field is dropped');
  App.docStore.setSectionRepeat('sec1', null);
  assert.equal('repeat' in st.report.sections[0], false);
});

test('a bad repeat is refused and changes nothing', () => {
  const st = host();
  assert.equal(App.docStore.setSectionRepeat('sec1', { each: 'hazard', where: { field: 'id', op: 'like', value: 'x' } }).ok, false);
  assert.equal(App.docStore.setSectionRepeat('sec1', { each: 'no spaces' }).ok, false);
  assert.equal(App.docStore.setSectionRepeat('nope', { each: 'hazard' }).ok, false);
  assert.equal('repeat' in st.report.sections[0], false);
});

test('a section template carries the repeat, and a section made from it gets it back', () => {
  const st = host();
  App.docStore.setSectionRepeat('sec1', { each: 'hazard', sort: { field: 'id', dir: 'desc' } });
  const t = App.docStore.saveSectionTemplate('sec1', 'Per hazard');
  assert.deepEqual(st.report.sectionTemplates[0].repeat, { each: 'hazard', sort: { field: 'id', dir: 'desc' } });
  const made = App.docStore.useSectionTemplate(t.id);
  assert.deepEqual(st.report.sections.find((s) => s.id === made.id).repeat, { each: 'hazard', sort: { field: 'id', dir: 'desc' } });
});

test('importing: a section template\'s repeat is checked and kept', () => {
  const file = (repeat) => JSON.stringify({ kind: App.docTemplates.KINDS.sections.kind, items: [{ name: 'T', title: 'x', parts: [], repeat }] });
  const ok = App.docTemplates.parseImport(file({ each: 'hazard', where: { field: 'id', op: 'is', value: 'a' } }), 'sections');
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.items[0].repeat, { each: 'hazard', where: { field: 'id', op: 'is', value: 'a' } });
  const bad = App.docTemplates.parseImport(file({ each: 'hazard', where: { field: 'id', op: 'like' } }), 'sections');
  assert.equal(bad.ok, false);
  const rep = App.docTemplates.parseImport(JSON.stringify({ kind: App.docTemplates.KINDS.reports.kind, items: [{ name: 'R', sections: [{ id: 's', title: 'x', parts: [], repeat: { each: 7 } }] }] }), 'reports');
  assert.equal(rep.ok, false, 'a report template\'s sections are checked too');
});
