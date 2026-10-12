import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHtml } from '../../DocGen/doc-html.js';
import { normaliseStyle } from '../../DocGen/doc-style.js';

const style = (o = {}) => normaliseStyle(o).style;
const doc = {
  title: 'Alpha <safety>', meta: { title: 'Alpha <safety>', platform: 'Alpha', date: '2026-10-12', marking: 'OFFICIAL' },
  blocks: [
    { kind: 'heading', level: 1, number: '1', anchor: 'sec-a', runs: [{ text: 'Scope & aims' }] },
    { kind: 'paragraph', style: 'body', runs: [{ text: 'See ' }, { text: 'Table 1', ref: { anchor: 'tbl-x' } }, { text: ' and ' }, { text: 'bold', bold: true }, { br: true }, { text: 'code', code: true }] },
    { kind: 'table', anchor: 'tbl-x', caption: { runs: [{ text: 'Table 1: Things' }] }, columns: [{ width: 0.3 }, { width: 0.7 }], header: [[{ text: 'ID' }], [{ text: 'Name' }]], rows: [[[{ text: 'H-1' }], [{ text: '<b>x</b>' }]]] },
    { kind: 'toc' }, { kind: 'pageBreak' }, { kind: 'space', mm: 10 }, { kind: 'rule' },
  ],
};

test('one escaped, standalone page: title, marking above and below, headings with numbers and anchors', () => {
  const h = renderHtml(doc, style());
  assert.match(h, /^<!doctype html>/);
  assert.match(h, /<title>Alpha &lt;safety&gt;<\/title>/);
  assert.equal((h.match(/class="marking">OFFICIAL</g) ?? []).length, 2);
  assert.match(h, /<h2 class="h1" id="sec-a"><span class="num">1<\/span> Scope &amp; aims<\/h2>/);
  assert.doesNotMatch(h, /<b>x<\/b>/);
  assert.match(h, /&lt;b&gt;x&lt;\/b&gt;/);
});

test('runs: references are links (no page numbers), bold, line breaks and code', () => {
  const h = renderHtml(doc, style());
  assert.match(h, /See <a href="#tbl-x">Table 1<\/a> and <strong>bold<\/strong><br><code>code<\/code>/);
  assert.doesNotMatch(h, /\(page/);
});

test('a table with its caption, widths and header; the contents links to the headings', () => {
  const h = renderHtml(doc, style());
  assert.match(h, /<table class="doc-table" id="tbl-x">/);
  assert.match(h, /<col style="width:30%">/);
  assert.match(h, /<caption>Table 1: Things<\/caption>/);
  assert.match(h, /<th>ID<\/th>/);
  assert.match(h, /<nav class="toc">[\s\S]*<a href="#sec-a">1 Scope &amp; aims<\/a>/);
});

test('CSS comes from the style: fonts, sizes, colours, table header fill, page size and margins', () => {
  const h = renderHtml(doc, style({ page: { paper: 'letter', margins: { top: 20 } }, text: { body: { family: 'times', size: 12, colour: '#112233' } }, tables: { header: { fill: '#abcdef' } } }));
  assert.match(h, /@page \{ size: letter portrait; margin: 20mm 25mm 25mm 25mm; \}/);
  assert.match(h, /p\.body \{[^}]*font-family: "Times New Roman"[^}]*font-size: 12pt[^}]*color: #112233/);
  assert.match(h, /\.doc-table thead th \{[^}]*background: #abcdef/);
});
