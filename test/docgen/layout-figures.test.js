import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, MM } from '../../DocGen/doc-layout.js';
import { normaliseStyle } from '../../DocGen/doc-style.js';
import { GAP_MM } from '../../DocGen/doc-figure.js';

const style = (images = {}) => normaliseStyle({ images, page: { margins: { top: 20, bottom: 20, left: 20, right: 20 } } }).style;
const W = (595.276 - 40 * MM);          // A4 text width in points
const img = (src, o = {}) => ({ src, name: src.split('/').pop(), width: 1, border: true, caption: null, ...o });
const sizes = { 'a.png': { width: 400, height: 200 }, 'b.png': { width: 100, height: 100 }, 'c.png': { width: 300, height: 600 } };
const images = (p) => p.items.filter((it) => it.kind === 'image');
const texts = (p) => p.items.filter((it) => it.kind === 'text').map((t) => t.text).join(' ');

test('a single image fills the text width at its own shape, centred', () => {
  const r = layout({ blocks: [{ kind: 'figure', layout: 'single', caption: null, images: [img('a.png')] }] }, style(), { images: sizes });
  const [im] = images(r.pages[0]);
  assert.equal(Math.round(im.w), Math.round(W));
  assert.equal(Math.round(im.h), Math.round(W / 2));
  assert.equal(im.src, 'a.png');
});

test('the width is a share of the text width, never wider than its box; centre or left', () => {
  const half = layout({ blocks: [{ kind: 'figure', layout: 'single', caption: null, images: [img('b.png', { width: 0.5 })] }] }, style(), { images: sizes });
  const [c] = images(half.pages[0]);
  assert.equal(Math.round(c.w), Math.round(W / 2));
  assert.equal(Math.round(c.x), Math.round(20 * MM + W / 4));
  const left = layout({ blocks: [{ kind: 'figure', layout: 'single', caption: null, images: [img('b.png', { width: 0.5 })] }] }, style({ align: 'left' }), { images: sizes });
  assert.equal(Math.round(images(left.pages[0])[0].x), Math.round(20 * MM));
  const pair = layout({ blocks: [{ kind: 'figure', layout: 'pair', caption: null, images: [img('b.png'), img('b.png')] }] }, style(), { images: sizes });
  const [p1, p2] = images(pair.pages[0]);
  const cell = W / 2 - GAP_MM * MM / 2;
  assert.equal(Math.round(p1.w), Math.round(cell));
  assert.equal(Math.round(p2.x - p1.x), Math.round(cell + GAP_MM * MM));
  assert.equal(p1.y, p2.y);
});

test('each layout places its boxes in rows of its shape; an empty box keeps its place', () => {
  const at = (layoutName, n) => images(layout({ blocks: [{ kind: 'figure', layout: layoutName, caption: null,
    images: Array.from({ length: n }, (_, k) => (k === 1 ? null : img('b.png'))) }] }, style(), { images: sizes }).pages[0]);
  const rows = (items) => [...new Set(items.map((i) => Math.round(i.y)))].length;
  assert.equal(at('grid4', 4).length, 3);                 // box 2 empty
  assert.equal(rows(at('grid4', 4)), 2);
  const g21 = at('grid21', 3);                            // top row: one image (box 2 empty); bottom: full width
  assert.equal(rows(g21), 2);
  assert.equal(Math.round(g21[1].w), Math.round(W));
  const g12 = images(layout({ blocks: [{ kind: 'figure', layout: 'grid12', caption: null, images: [img('b.png'), img('b.png'), img('b.png')] }] }, style(), { images: sizes }).pages[0]);
  assert.equal(Math.round(g12[0].w), Math.round(W));
  assert.ok(g12[1].y > g12[0].y && g12[1].y === g12[2].y);
});

test('one caption under the whole figure, or above it, or a caption under each image', () => {
  const one = { kind: 'figure', layout: 'pair', caption: { runs: [{ text: 'Figure 1: Both' }] }, images: [img('b.png'), img('b.png')] };
  const below = layout({ blocks: [one] }, style(), { images: sizes }).pages[0];
  const capY = below.items.find((it) => it.kind === 'text' && /Figure/.test(it.text)).y;
  assert.ok(capY > images(below)[0].y + images(below)[0].h);
  const above = layout({ blocks: [one] }, style({ captionPosition: 'above' }), { images: sizes }).pages[0];
  assert.ok(above.items.find((it) => it.kind === 'text' && /Figure/.test(it.text)).y < images(above)[0].y);
  const sep = layout({ blocks: [{ kind: 'figure', layout: 'pair', caption: null, images: [
    img('b.png', { caption: { runs: [{ text: 'Figure 1: Left' }] }, anchor: 'fig-l' }), img('b.png', { caption: { runs: [{ text: 'Figure 2: Right' }] }, anchor: 'fig-r' })] }] },
    style(), { images: sizes });
  assert.match(texts(sep.pages[0]), /Figure 1: Left.*Figure 2: Right/);
  assert.ok(sep.anchors['fig-l'] && sep.anchors['fig-r']);
});

test('a border is four lines in the Style\'s weight and colour, unless the image has none', () => {
  const s = style({ border: 'line', borderWidth: 1, borderColour: '#ff0000' });
  const p = layout({ blocks: [{ kind: 'figure', layout: 'pair', caption: null, images: [img('b.png'), img('b.png', { border: false })] }] }, s, { images: sizes }).pages[0];
  const rules = p.items.filter((it) => it.kind === 'rule');
  assert.equal(rules.length, 4);
  assert.ok(rules.every((r) => r.width === 1 && r.colour === '#ff0000'));
  const none = layout({ blocks: [{ kind: 'figure', layout: 'single', caption: null, images: [img('b.png')] }] }, style(), { images: sizes }).pages[0];
  assert.equal(none.items.filter((it) => it.kind === 'rule').length, 0);
});

test('a figure that does not fit moves to the next page with its caption', () => {
  const blocks = [{ kind: 'space', mm: 230 }, { kind: 'figure', layout: 'single', anchor: 'fig-x', caption: { runs: [{ text: 'Figure 1: Wide' }] }, images: [img('a.png')] }];
  const r = layout({ blocks }, style(), { images: sizes });
  assert.equal(r.pages.length, 2);
  assert.equal(images(r.pages[1]).length, 1);
  assert.match(texts(r.pages[1]), /Figure 1: Wide/);
  assert.equal(r.anchors['fig-x'].page, 1);
});

test('a figure taller than the page is scaled to fit on one page', () => {
  const tall = { 'c.png': { width: 100, height: 2000 } };
  const r = layout({ blocks: [{ kind: 'figure', layout: 'grid4', caption: { runs: [{ text: 'Figure 1: Tall' }] }, images: [img('c.png'), img('c.png'), img('c.png'), img('c.png')] }] }, style(), { images: tall });
  assert.equal(r.pages.length, 1);
  const ims = images(r.pages[0]);
  assert.equal(ims.length, 4);
  const textH = 841.89 - 40 * MM;
  assert.ok(Math.max(...ims.map((i) => i.y + i.h)) <= 20 * MM + textH + 0.01);
  assert.match(texts(r.pages[0]), /Figure 1: Tall/);
});

test('a missing image is a grey box with its name; one still loading is a plain box', () => {
  const r = layout({ blocks: [{ kind: 'figure', layout: 'pair', caption: null, images: [img('files/report-images/gone.png'), img('wait.png')] }] }, style(), { images: { 'wait.png': { pending: true } } });
  const p = r.pages[0];
  assert.equal(images(p).length, 0);
  assert.match(texts(p), /Image missing: gone\.png/);
  const fills = p.items.filter((it) => it.kind === 'fill');
  assert.equal(fills.length, 2);
  assert.equal(Math.round(fills[0].h), Math.round(fills[0].w * 0.75));
});

test('a heading just before a figure goes over to the next page with it', () => {
  const blocks = [{ kind: 'space', mm: 225 }, { kind: 'heading', level: 1, runs: [{ text: 'Pictures' }], anchor: 'h' },
    { kind: 'figure', layout: 'single', caption: null, images: [img('a.png')] }];
  const r = layout({ blocks }, style(), { images: sizes });
  assert.equal(r.anchors.h.page, 1);
});
