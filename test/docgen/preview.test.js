import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pagesHtml, cropPage } from '../../DocGen/doc-preview.js';

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

test('a page cropped to a band keeps only what lies in it, moved up to its top', () => {
  const p = { size: [100, 300], items: [
    { kind: 'text', x: 1, y: 50, font: 'Helvetica', size: 10, colour: '#000000', text: 'above' },
    { kind: 'text', x: 1, y: 120, font: 'Helvetica', size: 10, colour: '#000000', text: 'inside' },
    { kind: 'fill', x: 0, y: 90, w: 10, h: 40, colour: '#eeeeee' },
    { kind: 'rule', x1: 5, y1: 80, x2: 5, y2: 250, width: 1, colour: '#000000' },
    { kind: 'text', x: 1, y: 260, font: 'Helvetica', size: 10, colour: '#000000', text: 'below' },
  ] };
  const c = cropPage(p, 100, 200);
  assert.deepEqual(c.size, [100, 100]);
  assert.deepEqual(c.items.filter((i) => i.kind === 'text').map((t) => [t.text, t.y]), [['inside', 20]]);
  assert.deepEqual(c.items.find((i) => i.kind === 'fill'), { kind: 'fill', x: 0, y: 0, w: 10, h: 30, colour: '#eeeeee' });
  const r = c.items.find((i) => i.kind === 'rule');
  assert.deepEqual([r.y1, r.y2], [0, 100]);
});

test('an image is drawn from the URL the designer gives, or as a grey box', () => {
  const page = { size: [100, 100], items: [{ kind: 'image', x: 10, y: 20, w: 30, h: 15, src: 'files/report-images/a.png' }] };
  assert.match(pagesHtml([page], { imageUrl: () => 'blob:x' }), /<img class="dp-image" src="blob:x" alt="" style="left:10px;top:20px;width:30px;height:15px">/);
  assert.match(pagesHtml([page], { scale: 2 }), /class="dp-fill" style="left:20px;top:40px;width:60px;height:30px;background:#eeeeee"/);
});

test('a band keeps the images that overlap it', () => {
  const page = { size: [100, 300], items: [{ kind: 'image', x: 0, y: 50, w: 10, h: 40, src: 'a' }, { kind: 'image', x: 0, y: 200, w: 10, h: 10, src: 'b' }] };
  const band = cropPage(page, 60, 150);
  assert.deepEqual(band.items, [{ kind: 'image', x: 0, y: -10, w: 10, h: 40, src: 'a' }]);
});
