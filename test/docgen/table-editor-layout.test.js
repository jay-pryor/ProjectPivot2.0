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
  Object.assign(RD._rd, { selected: 'sec1', secCat: 'content', tableLayout: {} }, set);
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
