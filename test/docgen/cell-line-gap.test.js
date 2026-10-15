import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout } from '../../DocGen/doc-layout.js';
import { normaliseStyle } from '../../DocGen/doc-style.js';
import { renderHtml } from '../../DocGen/doc-html.js';
import * as D from '../../DocGen/doc-data.js';

const style = (tables = {}) => normaliseStyle({ tables, headerFooter: { footer: { centre: '' } } }).style;
// A list's entries are broken with `item` breaks; the second entry runs over two lines of its own.
const list = [{ text: '• First' }, { br: true, item: true }, { text: '• Second' }, { br: true }, { text: 'more' }, { br: true, item: true }, { text: '• Third' }];
const docOf = (cell) => ({ title: 'T', meta: { title: 'T' }, blocks: [{ kind: 'table', anchor: 'tbl-t', columns: [{}, {}],
  header: [[{ text: 'A' }], [{ text: 'B' }]], rows: [[cell, [{ text: 'x' }]]] }] });
const doc = docOf(list);
const ys = (r) => Object.fromEntries(r.pages[0].items.filter((i) => i.kind === 'text').map((t) => [t.text, t.y]));
const bottom = (r) => Math.max(...r.pages[0].items.filter((i) => i.kind === 'rule' && i.y1 === i.y2).map((i) => i.y1));

test('the Style\'s space between list entries in a cell defaults to none and is checked', () => {
  assert.equal(style().tables.listGap, 0);
  assert.equal(style({ listGap: 4 }).tables.listGap, 4);
  const bad = normaliseStyle({ tables: { listGap: 99 } });
  assert.equal(bad.style.tables.listGap, 24, 'held at the limit, like every other number');
  assert.ok(bad.held.some((h) => /Space between list entries/.test(h)), 'and said so');
});

test('PDF: the gap falls between list entries only, not at a line break inside an entry', () => {
  const a = ys(layout(doc, style())), b = ys(layout(doc, style({ listGap: 6 })));
  assert.ok(Math.abs((b.Second - b.First) - (a.Second - a.First) - 6) < 0.01, 'between entries');
  assert.ok(Math.abs((b.more - b.Second) - (a.more - a.Second)) < 0.01, 'not inside an entry');
  assert.ok(Math.abs((b.Third - b.more) - (a.Third - a.more) - 6) < 0.01);
  assert.ok(Math.abs(bottom(layout(doc, style({ listGap: 6 }))) - bottom(layout(doc, style())) - 12) < 0.01, 'the row grows by the two gaps');
});

test('PDF: plain line breaks and wrapped lines take no gap', () => {
  const plain = docOf([{ text: 'one' }, { br: true }, { text: 'two' }, { br: true }, { text: 'three four five six seven eight nine ten eleven twelve thirteen' }]);
  assert.equal(bottom(layout(plain, style({ listGap: 6 }))), bottom(layout(plain, style())));
});

test('HTML: a spacer of the gap\'s height between list entries; a plain break stays a break', () => {
  assert.ok(!renderHtml(doc, style()).includes('cell-gap'));
  const h = renderHtml(doc, style({ listGap: 6 }));
  assert.match(h, /\.doc-table:not\(\.own\) td \.cell-gap \{ display: block; height: 6pt; \}/);
  assert.match(h, /• First<span class="cell-gap"><\/span>• Second<br>more<span class="cell-gap"><\/span>• Third/);
});

test('a field list shown one per line, numbered or bulleted breaks between entries as list entries; a value\'s own lines do not', () => {
  const list2 = { kind: 'list', items: ['Alpha', 'Beta\nsecond line'] };
  assert.deepEqual(D.fieldItems(list2, { list: 'bullet' }), ['• Alpha', '• Beta\nsecond line']);
  assert.deepEqual(D.fieldItems(list2, { list: 'num' }), ['1. Alpha', '2. Beta\nsecond line']);
  assert.deepEqual(D.fieldItems(list2, {}), ['Alpha', 'Beta\nsecond line']);
  assert.equal(D.fieldItems(list2, { list: 'comma' }), null, 'a comma list is one line');
  assert.equal(D.fieldItems({ kind: 'value', text: 'a\nb' }, {}), null, 'a value is not a list');
  assert.equal(D.fieldItems({ kind: 'list', items: [] }, {}), null, 'an empty list prints its empty wording');
});

test('a field\'s list-entry breaks survive the rich-text runs a cell is built from', async () => {
  const { App } = await import('../../DocGen/doc-designer.js');
  const got = App.md.runs('Before {{f:x.y}} after', { resolveField: () => [{ text: '• A' }, { br: true, item: true }, { text: '• B' }, { br: true }, { text: 'b2' }] });
  const flat = [].concat(...got);
  assert.deepEqual(flat.filter((r) => r.br), [{ br: true, item: true }, { br: true }]);
});
