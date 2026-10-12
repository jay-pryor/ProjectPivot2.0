import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pagesHtml } from '../../DocGen/doc-preview.js';

const page = { size: [595.28, 841.89], items: [
  { kind: 'fill', x: 10, y: 20, w: 100, h: 30, colour: '#d9e2f3' },
  { kind: 'rule', x1: 10, y1: 50, x2: 110, y2: 50, width: 0.5, colour: '#999999' },
  { kind: 'rule', x1: 10, y1: 20, x2: 10, y2: 50, width: 1, colour: '#000000' },
  { kind: 'text', x: 72, y: 100, font: 'Times-BoldItalic', size: 10, colour: '#112233', text: 'a <b> & ' + String.fromCharCode(147) + 'q' + String.fromCharCode(148) },
  { kind: 'link', x: 72, y: 90, w: 40, h: 12, to: 'sec-"x"' },
] };

test('each page is a box of its size, scaled, numbered from one', () => {
  const h = pagesHtml([page, { size: [100, 200], items: [] }], { scale: 0.5 });
  assert.match(h, /<div class="dp-page" data-page="1" style="width:297.64px;height:420.945px">/);
  assert.match(h, /<div class="dp-page" data-page="2" style="width:50px;height:100px">/);
});

test('fills and rules are placed boxes; a vertical rule is as wide as its weight', () => {
  const h = pagesHtml([page]);
  assert.match(h, /class="dp-fill" style="left:10px;top:20px;width:100px;height:30px;background:#d9e2f3"/);
  assert.match(h, /class="dp-rule" style="left:10px;top:49.75px;width:100px;height:0.5px;background:#999999"/);
  assert.match(h, /class="dp-rule" style="left:9.5px;top:20px;width:1px;height:30px;background:#000000"/);
});

test('text sits on its baseline in its face, escaped, with WinAnsi quotes shown as Unicode', () => {
  const h = pagesHtml([page]);
  assert.match(h, /class="dp-text" style="left:72px;top:92.2px;font-size:10px;line-height:1;color:#112233;font-family:'Times New Roman', Times, serif;font-weight:700;font-style:italic">a &lt;b&gt; &amp; “q”<\/span>/);
});

test('links jump within the preview, their target escaped', () => {
  assert.match(pagesHtml([page]), /<a class="dp-link" data-prv-jump="sec-&quot;x&quot;" style="left:72px;top:90px;width:40px;height:12px"><\/a>/);
});

test('anchors become ids at their place on their page, so the contents can jump to them', () => {
  const h = pagesHtml([page, page], { scale: 2, anchors: { 'sec-a': { page: 1, y: 100 } } });
  const second = h.slice(h.indexOf('data-page="2"'));
  assert.match(second, /<span class="dp-anchor" id="sec-a" style="top:200px"><\/span>/);
  assert.equal((h.match(/dp-anchor/g) ?? []).length, 1);
});
