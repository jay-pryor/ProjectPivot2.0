import { MM, ASCENT, EPS, textStyle, atomsOf, breakLines, lineItems } from './doc-layout.js';
import { FIGURE_LAYOUTS } from './doc-images.js';

/** The space between two boxes of a grid, in millimetres. */
export const GAP_MM = 4;
const PLACEHOLDER_FILL = '#eeeeee';
const PLACEHOLDER_LINE = '#999999';

/**
 * A figure: one image or a grid of them, with one caption or a caption each. Kept whole on
 * one page (moving to the next, heading and all, when it does not fit); scaled down when even
 * a whole page is too short for it.
 * @param {any} b the figure block
 * @param {{ style: any, ctx: any, left: number, W: number, y: number, page: any, pageH: number, images: Record<string, any>,
 *   newPage: () => void, atTop: () => boolean, room: () => number, mark: (name?: string) => void, carryHeading: () => boolean }} f
 */
export function layoutFigure(b, f) {
  const is = f.style.images;
  const gap = GAP_MM * MM;
  const ts = textStyle(f.style, 'caption');
  const align = is.align === 'left' ? 'left' : 'centre';
  const lines = (/** @type {any} */ cap, /** @type {number} */ w) => (cap ? breakLines(atomsOf(cap.runs, ts, f.ctx), w) : []);
  const capH = (/** @type {any[]} */ ls) => (ls.length ? ls.length * ts.leading + ts.spaceBefore : 0);

  const shape = /** @type {number[][]} */ (/** @type {any} */ (FIGURE_LAYOUTS)[b.layout] ?? FIGURE_LAYOUTS.single);
  let k = 0;
  const rows = shape.map((fr) => fr.map((share) => {
    const cw = share * f.W - (gap * (fr.length - 1)) / fr.length;
    const im = (b.images ?? [])[k++] ?? null;
    if (!im) return { im: null, cw, w: 0, h: 0, cap: [] };
    const info = f.images[im.src];
    const w = Math.min(cw, f.W * (im.width > 0 ? Math.min(1, im.width) : 1));
    const ratio = info && info.width > 0 && info.height > 0 ? info.height / info.width : 0.75;
    return { im, info, cw, w, h: w * ratio, cap: lines(im.caption, cw) };
  }));
  const one = lines(b.caption, f.W);
  const imgH = (/** @type {any[]} */ r, /** @type {number} */ s) => Math.max(0, ...r.map((c) => c.h * s));
  const rowCapH = (/** @type {any[]} */ r) => Math.max(0, ...r.map((c) => capH(c.cap)));
  const height = (/** @type {number} */ s) => rows.reduce((a, r, i) => a + (i ? gap : 0) + imgH(r, s) + rowCapH(r), 0) + capH(one);
  // Scaled so the whole figure fits the space it has when it would not: a page's text area,
  // or what a heading carried over with it leaves of one.
  const fit = (/** @type {number} */ space) => {
    if (height(1) <= space) return 1;
    const fixed = height(0);
    return Math.max(0.05, (space - fixed) / (height(1) - fixed));
  };
  let s = fit(f.pageH);
  if (height(s) > f.room() + EPS && !f.atTop() && !f.carryHeading()) f.newPage();
  if (height(s) > f.room() + EPS) s = Math.min(s, fit(f.room()));

  const above = is.captionPosition === 'above';
  const caption = (/** @type {any[]} */ ls, /** @type {number} */ x, /** @type {number} */ w) => {
    if (!ls.length) return;
    f.y += ts.spaceBefore;
    ls.forEach((ln, i) => {
      f.page.items.push(...lineItems(ln, x, f.y + (ts.leading - ts.size) / 2 + ts.size * ASCENT, w, align, i === ls.length - 1));
      f.y += ts.leading;
    });
  };
  f.mark(b.anchor);
  if (above) caption(one, f.left, f.W);
  rows.forEach((r, i) => {
    if (i) f.y += gap;
    const top = f.y, ih = imgH(r, s), ch = rowCapH(r);
    let x = f.left;
    for (const c of r) {
      if (c.im) {
        const w = c.w * s, h = c.h * s;
        const ix = align === 'centre' ? x + (c.cw - w) / 2 : x;
        f.y = top;
        f.mark(c.im.anchor);
        if (above) { caption(c.cap, x, c.cw); f.y = top + ch; } else f.y = top;
        draw(f, c, ix, f.y, w, h);
        if (!above) { f.y = top + ih; caption(c.cap, x, c.cw); }
      }
      x += c.cw + gap;
    }
    f.y = top + ih + ch;
  });
  if (!above) caption(one, f.left, f.W);
  f.y += 4;
}

/** One image, its border, or its placeholder. @param {any} f @param {any} c @param {number} x @param {number} y @param {number} w @param {number} h */
function draw(f, c, x, y, w, h) {
  const is = f.style.images;
  const box = (/** @type {number} */ width, /** @type {string} */ colour) => {
    f.page.items.push({ kind: 'rule', x1: x, y1: y, x2: x + w, y2: y, width, colour }, { kind: 'rule', x1: x, y1: y + h, x2: x + w, y2: y + h, width, colour },
      { kind: 'rule', x1: x, y1: y, x2: x, y2: y + h, width, colour }, { kind: 'rule', x1: x + w, y1: y, x2: x + w, y2: y + h, width, colour });
  };
  if (c.info && c.info.pending) { f.page.items.push({ kind: 'fill', x, y, w, h, colour: '#f2f2f2' }); return; }
  if (!c.info) {
    f.page.items.push({ kind: 'fill', x, y, w, h, colour: PLACEHOLDER_FILL });
    box(0.5, PLACEHOLDER_LINE);
    const ts = textStyle(f.style, 'caption', { size: 8, italic: false, bold: false, colour: '#555555' });
    const ls = breakLines(atomsOf([{ text: `Image missing: ${c.im.name}` }], ts, f.ctx), Math.max(10, w - 8));
    const startY = y + Math.max(2, (h - ls.length * ts.leading) / 2);
    ls.forEach((ln, i) => {
      if (startY + (i + 1) * ts.leading > y + h) return;
      f.page.items.push(...lineItems(ln, x + 4, startY + i * ts.leading + (ts.leading - ts.size) / 2 + ts.size * ASCENT, w - 8, 'centre', true));
    });
    return;
  }
  f.page.items.push({ kind: 'image', x, y, w, h, src: c.im.src });
  if (is.border === 'line' && c.im.border !== false) box(is.borderWidth, is.borderColour);
}
