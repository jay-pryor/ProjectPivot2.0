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
  assert.match(h, /\.doc-table:not\(\.own\) thead th \{[^}]*background: #abcdef/);
});

import { prepareImage } from '../../DocGen/doc-images.js';
import { makePng } from './image-fixtures.js';

test('figures are embedded images in grid rows, with figcaptions, anchors and the Style\'s border', async () => {
  const style = normaliseStyle({ images: { border: 'line', borderWidth: 1, borderColour: '#ff0000', captionPosition: 'above', align: 'left' } }).style;
  const a = await prepareImage(await makePng({ width: 2, height: 2, sample: () => [1, 2, 3] }));
  const doc = { blocks: [
    { kind: 'figure', layout: 'grid21', anchor: 'fig-p1', caption: { runs: [{ text: 'Figure 1: All' }] }, images: [
      { src: 'a', name: 'a.png', width: 0.25, border: true, caption: null }, null, { src: 'gone', name: 'gone.png', width: 1, border: false, caption: null }] },
    { kind: 'figure', layout: 'single', caption: null, images: [{ src: 'a', name: 'a.png', width: 1, border: false, caption: { runs: [{ text: 'Figure 2: Own' }] }, anchor: 'fig-p2-1' }] }] };
  const html = renderHtml(doc, style, { images: { a, gone: null } });
  assert.match(html, /<div class="figure" id="fig-p1"><p class="caption fig-caption">Figure 1: All<\/p><div class="fig-row" style="grid-template-columns:1fr 1fr">/);
  assert.match(html, /<img class="bordered" src="data:image\/png;base64,[A-Za-z0-9+/=]+" alt="a\.png" style="width:50%">/);
  assert.match(html, /<div class="fig-cell"><\/div>/);
  assert.match(html, /<div class="fig-missing">Image missing: gone\.png<\/div>/);
  assert.match(html, /<figure class="fig-cell" id="fig-p2-1"><figcaption class="caption">Figure 2: Own<\/figcaption><img src="data:image\/png/);
  assert.match(html, /\.fig-cell img\.bordered \{ border: 1pt solid #ff0000; \}/);
  assert.match(html, /\.figure \{[^}]*text-align: left;/);
});

test('an image\'s own caption takes the Caption text style, like any other caption', () => {
  const html = renderHtml({ blocks: [] }, normaliseStyle({}).style);
  assert.match(html, /p\.caption, caption, figcaption\.caption \{ font-family: Helvetica/);
});

test('with the Style\'s border None, HTML images have no border, as in the PDF', async () => {
  const a = await prepareImage(await makePng({ width: 2, height: 2, sample: () => [1, 2, 3] }));
  const doc = { blocks: [{ kind: 'figure', layout: 'single', caption: null, images: [{ src: 'a', name: 'a.png', width: 1, border: true, caption: null }] }] };
  const html = renderHtml(doc, normaliseStyle({}).style, { images: { a } });
  assert.doesNotMatch(html, /class="bordered"/);
  assert.doesNotMatch(html, /img\.bordered \{ border:/);
});

test('landscape stretches print landscape: a named page and a wrapping div', () => {
  const html = renderHtml({ blocks: [{ kind: 'paragraph', style: 'body', runs: [{ text: 'a' }] }, { kind: 'pageBreak', orientation: 'landscape' },
    { kind: 'paragraph', style: 'body', runs: [{ text: 'wide' }] }, { kind: 'pageBreak', orientation: 'portrait' }, { kind: 'paragraph', style: 'body', runs: [{ text: 'b' }] }] }, normaliseStyle({}).style);
  assert.match(html, /@page landscape \{ size: a4 landscape; \}/);
  assert.match(html, /\.landscape \{ page: landscape; \}/);
  assert.match(html, /<div class="page-break"><\/div>\n?<div class="landscape">[\s\S]*?wide[\s\S]*?<div class="page-break"><\/div><\/div>/);
});

test('the turn back to portrait breaks inside the landscape wrapper, so printing makes no blank page', () => {
  const html = renderHtml({ blocks: [{ kind: 'paragraph', style: 'body', runs: [{ text: 'a' }] }, { kind: 'pageBreak', orientation: 'landscape' },
    { kind: 'paragraph', style: 'body', runs: [{ text: 'wide' }] }, { kind: 'pageBreak', orientation: 'portrait' }, { kind: 'paragraph', style: 'body', runs: [{ text: 'b' }] }] }, normaliseStyle({}).style);
  assert.match(html, /wide[\s\S]*?<div class="page-break"><\/div><\/div>/);
});
