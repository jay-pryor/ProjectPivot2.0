import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../../DocGen/doc-designer.js';

function host() {
  const state = { report: { sections: [{ id: 'sec1', title: 'Issued /[Date] by /[Author]', parts: [] }], options: { sections: { toc: false, meta: false } } } };
  const h = {
    getState: () => state, commit: (m) => m(state), clock: { nowIso: () => '2026-10-15T00:00:00.000Z' },
    subject: { list: () => [{ id: 'p1', label: 'Ship' }], ready: () => true, meta: () => [] },
    sections: () => [],
  };
  App.docHost.set(h);
  return h;
}

test('placeholder answers are stored with the design, so a saved draft keeps them', () => {
  const h = host();
  assert.equal(App.docStore.setTag('Date', '15 October 2026').ok, true);
  App.docStore.setTag('Author', 'J. Pryor');
  assert.deepEqual(h.getState().report.tags, { Date: '15 October 2026', Author: 'J. Pryor' });
  // What the generator is told reads them from the design.
  assert.deepEqual(App.docSession.options(h.getState()).tags, { Date: '15 October 2026', Author: 'J. Pryor' });
  const doc = App.docGen.documentFor(h, { ...App.docSession.options(h.getState()), subjectId: 'p1' }, { utc: '2026-10-15T00:00:00Z' }).document;
  const heading = doc.blocks.find((b) => b.kind === 'heading');
  assert.equal(heading.runs.map((r) => r.text).join(''), 'Issued 15 October 2026 by J. Pryor');
  // Blank removes an answer; none left removes the key.
  App.docStore.setTag('Date', '  ');
  assert.deepEqual(h.getState().report.tags, { Author: 'J. Pryor' });
  App.docStore.setTag('Author', '');
  assert.equal('tags' in h.getState().report, false);
});

test('a report template does not carry the placeholder answers', () => {
  const h = host();
  App.docStore.setTag('Date', 'today');
  App.docStore.saveReportTemplate('T');
  assert.equal('tags' in h.getState().report.reportTemplates[0], false);
});

test('Generate: the Make buttons are locked, saying why, until every placeholder has an answer', () => {
  const h = host();
  const RD = App.ui.views.reportDesign;
  const pane = () => { RD.open(); RD.pane('generate'); const html = RD.render(h.getState()); RD.close(); return html; };
  const makes = (html) => [...html.matchAll(/(<button type="button" class="rd-make[^>]*>)(Make [A-Z]+)</g)].map((m) => m[2] + (/ disabled/.test(m[1]) ? ':locked' : ''));
  let html = pane();
  assert.deepEqual(makes(html), ['Make HTML:locked', 'Make PDF:locked']);
  assert.match(html, /Not yet: 2 placeholders to fill in\./);
  App.docStore.setTag('Date', 'today'); App.docStore.setTag('Author', 'me');
  html = pane();
  assert.deepEqual(makes(html), ['Make HTML', 'Make PDF']);
  assert.doesNotMatch(html, /Not yet/);
});
