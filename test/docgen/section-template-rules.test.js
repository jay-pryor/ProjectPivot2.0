import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../../DocGen/doc-designer.js';

function host() {
  const state = { report: { sections: [{ id: 'sec1', title: 'Annex', parts: [{ id: 'part1', kind: 'para', text: 'x' }] }] } };
  const h = { getState: () => state, commit: (m) => m(state), clock: { nowIso: () => '2026-10-15T00:00:00Z' }, sections: [] };
  App.docHost.set(h);
  return state;
}

test('a section template keeps the section\'s tier, centring, page and contents rules, and a section made from it gets them back', () => {
  const st = host();
  App.docStore.setBlockLevel('sec1', 0);
  App.docStore.setBlockCentrePart('sec1', 'heading', true);
  App.docStore.setBlockCentrePart('sec1', 'content', true);
  App.docStore.setBlockFlag('pageBreak', 'sec1', false);
  App.docStore.setBlockFlag('noToc', 'sec1', true);
  App.docStore.setBlockFlag('landscape', 'sec1', true);
  App.docStore.setBlockSpace('sec1', 40);
  const t = App.docStore.saveSectionTemplate('sec1', 'Annex');
  const made = App.docStore.useSectionTemplate(t.id);
  const r = st.report;
  assert.equal(r.levels[made.id], 0);
  assert.deepEqual(r.centred[made.id], { heading: true, content: true });
  assert.equal(r.pageBreak[made.id], false);
  assert.equal(r.noToc[made.id], true);
  assert.equal(r.landscape[made.id], true);
  assert.equal(r.space[made.id], 40);
  r.centred[made.id].heading = false;
  assert.equal(r.centred.sec1.heading, true, 'the copy shares nothing with the source');
});

test('a section with no rules of its own makes a template that adds none', () => {
  const st = host();
  const t = App.docStore.saveSectionTemplate('sec1', 'Plain');
  assert.equal('rules' in st.report.sectionTemplates[0], false);
  App.docStore.useSectionTemplate(t.id);
  for (const k of ['levels', 'centred', 'pageBreak', 'noToc', 'landscape', 'space']) assert.equal(k in st.report, false, k);
});

test('importing: a section template\'s rules are kept when sound and dropped when not', () => {
  const file = (rules) => JSON.stringify({ kind: App.docTemplates.KINDS.sections.kind, items: [{ name: 'T', title: 'x', parts: [], rules }] });
  const ok = App.docTemplates.parseImport(file({ levels: 2, centred: { heading: true }, noToc: true, space: 12 }), 'sections');
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.items[0].rules, { levels: 2, centred: { heading: true }, noToc: true, space: 12 });
  const odd = App.docTemplates.parseImport(file({ levels: 9, centred: 'yes', landscape: 'no', space: -3, other: 1 }), 'sections');
  assert.equal(odd.ok, true);
  assert.equal('rules' in odd.items[0], false);
});
