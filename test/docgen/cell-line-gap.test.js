import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, MM } from '../../DocGen/doc-layout.js';
import { normaliseStyle } from '../../DocGen/doc-style.js';
import { renderHtml } from '../../DocGen/doc-html.js';

const style = (tables = {}) => normaliseStyle({ tables, headerFooter: { footer: { centre: '' } } }).style;
const list = [{ text: '• First' }, { br: true }, { text: '• Second' }, { br: true }, { text: '• Third' }];
const doc = { title: 'T', meta: { title: 'T' }, blocks: [{ kind: 'table', anchor: 'tbl-t', columns: [{}, {}],
  header: [[{ text: 'A' }], [{ text: 'B' }]], rows: [[list, [{ text: 'x' }]]] }] };
const ys = (r) => Object.fromEntries(r.pages[0].items.filter((i) => i.kind === 'text').map((t) => [t.text, t.y]));

test('the Style\'s space between lines in a cell defaults to none and is checked', () => {
  assert.equal(style().tables.lineGap, 0);
  assert.equal(style({ lineGap: 4 }).tables.lineGap, 4);
  const bad = normaliseStyle({ tables: { lineGap: 99 } });
  assert.equal(bad.style.tables.lineGap, 24, 'held at the limit, like every other number');
  assert.ok(bad.held.some((h) => /Space between lines in a cell/.test(h)), 'and said so');
});

test('PDF: each line ended by a break in a cell is followed by the gap, and the row grows to hold it', () => {
  const a = ys(layout(doc, style())), b = ys(layout(doc, style({ lineGap: 6 })));
  assert.ok(Math.abs((b.Second - b.First) - (a.Second - a.First) - 6) < 0.01);
  assert.ok(Math.abs((b.Third - b.Second) - (a.Third - a.Second) - 6) < 0.01);
  const bottom = (r) => Math.max(...r.pages[0].items.filter((i) => i.kind === 'rule' && i.y1 === i.y2).map((i) => i.y1));
  assert.ok(Math.abs(bottom(layout(doc, style({ lineGap: 6 }))) - bottom(layout(doc, style())) - 12) < 0.01, 'two gaps, none after the last line');
});

test('PDF: a line that only wraps takes no gap', () => {
  const long = { ...doc, blocks: [{ ...doc.blocks[0], columns: [{ width: 0.2 }, { width: 0.8 }],
    rows: [[[{ text: 'one two three four five six seven eight nine ten eleven twelve' }], [{ text: 'x' }]]] }] };
  const r0 = layout(long, style()), r1 = layout(long, style({ lineGap: 6 }));
  const bottom = (r) => Math.max(...r.pages[0].items.filter((i) => i.kind === 'rule' && i.y1 === i.y2).map((i) => i.y1));
  assert.equal(bottom(r1), bottom(r0));
});

test('HTML: with a gap, a break in a body cell becomes a spacer of that height', () => {
  assert.ok(!renderHtml(doc, style()).includes('cell-gap'));
  const h = renderHtml(doc, style({ lineGap: 6 }));
  assert.match(h, /\.doc-table td \.cell-gap \{ display: block; height: 6pt; \}/);
  assert.match(h, /• First<span class="cell-gap"><\/span>• Second/);
});
