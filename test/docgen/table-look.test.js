import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout } from '../../DocGen/doc-layout.js';
import { normaliseStyle, applyLook } from '../../DocGen/doc-style.js';
import { renderHtml } from '../../DocGen/doc-html.js';

const style = (tables = {}) => normaliseStyle({ tables, headerFooter: { footer: { centre: '' } } }).style;
const tbl = (extra = {}) => ({ kind: 'table', anchor: 'tbl-t', columns: [{}, {}], header: [[{ text: 'Head1' }], [{ text: 'Head2' }]],
  rows: [[[{ text: 'a1' }], [{ text: 'b1' }]], [[{ text: 'a2' }], [{ text: 'b2' }]]], ...extra });
const doc = (...blocks) => ({ title: 'T', meta: { title: 'T' }, blocks });
const fills = (r) => r.pages[0].items.filter((i) => i.kind === 'fill').map((f) => f.colour);
const texts = (r) => r.pages[0].items.filter((i) => i.kind === 'text').map((t) => t.text);

test('a table\'s look overrides only what it names; the rest follows the Style, and bad values are held', () => {
  const tb = style({ banding: { on: true, fill: '#eeeeee' } }).tables;
  const m = applyLook(tb, { header: { fill: '#ff0000', show: false }, firstColumn: { on: true }, borders: 'outer' });
  assert.equal(m.header.fill, '#ff0000');
  assert.equal(m.header.show, false);
  assert.equal(m.header.bold, tb.header.bold, 'not named: the Style\'s');
  assert.equal(m.firstColumn.on, true);
  assert.equal(m.firstColumn.fill, tb.firstColumn.fill);
  assert.equal(m.banding.on, true);
  assert.equal(m.borders, 'outer');
  assert.equal(applyLook(tb, { header: { fill: 'red!' }, borders: 'zigzag' }).header.fill, tb.header.fill);
  assert.equal(applyLook(tb, { borders: 'zigzag' }).borders, tb.borders);
  assert.equal(applyLook(tb, null), tb);
});

test('the Style can hide the header row; it shows by default', () => {
  assert.equal(style().tables.header.show, true);
  assert.equal(style({ header: { show: false } }).tables.header.show, false);
});

test('PDF: a table with its own look draws with it, the next table still with the Style\'s', () => {
  const r = layout(doc(tbl({ look: { header: { fill: '#ff0000' }, banding: { on: true, fill: '#00ff00' } } }), tbl({ anchor: 'tbl-u' })), style());
  const f = fills(r);
  assert.ok(f.includes('#ff0000') && f.includes('#00ff00'));
  assert.ok(f.includes(style().tables.header.fill), 'the second table has the Style\'s header fill');
});

test('PDF: a hidden header row is not drawn; a title row spans the table above it', () => {
  const r = layout(doc(tbl({ look: { header: { show: false } }, titleRow: [{ text: 'Sign-off' }] })), style());
  const t = texts(r);
  assert.ok(!t.includes('Head1'));
  assert.ok(t.includes('Sign-off'));
  const y = Object.fromEntries(r.pages[0].items.filter((i) => i.kind === 'text').map((x) => [x.text, x.y]));
  assert.ok(y['Sign-off'] < y.a1);
});

test('PDF: borders none draws no table lines', () => {
  const r = layout(doc(tbl({ look: { borders: 'none' } })), style());
  assert.equal(r.pages[0].items.filter((i) => i.kind === 'rule').length, 0);
});

test('HTML: a table with its own look gets its own rules, and the Style\'s rules skip it', () => {
  const h = renderHtml(doc(tbl({ look: { header: { fill: '#ff0000', show: false }, borders: 'none' } }), tbl({ anchor: 'tbl-u' })), style());
  assert.match(h, /\.doc-table:not\(\.own\) thead th \{ background: #d9e2f3;/);
  assert.match(h, /<table class="doc-table own lk1" id="tbl-t">/);
  assert.match(h, /\.doc-table\.own\.lk1 thead th \{ background: #ff0000;/);
  assert.match(h, /\.doc-table\.own\.lk1 th, \.doc-table\.own\.lk1 td \{ border: none;/);
  assert.match(h, /<table class="doc-table" id="tbl-u">/);
  const own = h.slice(h.indexOf('id="tbl-t"'), h.indexOf('id="tbl-u"'));
  assert.ok(!own.includes('Head1'), 'the hidden header row is left out');
});

test('HTML: a title row spans every column', () => {
  const h = renderHtml(doc(tbl({ titleRow: [{ text: 'Sign-off' }] })), style());
  assert.match(h, /<tr><th colspan="2" class="centre">Sign-off<\/th><\/tr>/);
});
