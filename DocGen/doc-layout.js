import { layoutFigure } from './doc-figure.js';
import { fontName, toWinAnsi, textWidth } from './doc-fonts.js';
import { PAPER_MM } from './doc-style.js';

/** Points per millimetre. */
export const MM = 72 / 25.4;
export const ASCENT = 0.78;   // of the size: where the baseline sits in a line box
export const EPS = 0.01;

/**
 * A text style resolved for setting: its fonts and leading.
 * @param {any} style @param {string} key @param {Record<string, any>} [over]
 */
export function textStyle(style, key, over = {}) {
  const t = { ...style.text[key], ...over };
  return { family: t.family, size: t.size, bold: !!t.bold, italic: !!t.italic, underline: !!t.underline, colour: t.colour, align: t.align,
    leading: t.size * 1.2 * (t.lineSpacing || 1), spaceBefore: t.spaceBefore || 0, spaceAfter: t.spaceAfter || 0,
    keepWithNext: !!t.keepWithNext, pageBreakBefore: !!t.pageBreakBefore };
}

/**
 * Runs to atoms: words and single spaces, each with its font, size, width and link.
 * @param {any[]} runs @param {ReturnType<typeof textStyle>} ts
 * @param {{ encode: (s: string) => string, refSuffix: (anchor: string) => string }} ctx
 */
export function atomsOf(runs, ts, ctx) {
  /** @type {any[]} */
  const out = [];
  for (const r of runs ?? []) {
    if (r.br) { out.push({ br: true }); continue; }
    const link = r.ref?.anchor ?? null;
    const raw = String(r.text ?? '') + (link ? ctx.refSuffix(link) : '');
    const font = fontName(r.code ? 'courier' : ts.family, ts.bold || !!r.bold, ts.italic || !!r.italic);
    const text = ctx.encode(raw);
    for (const piece of text.split(/( )/)) {
      if (!piece) continue;
      out.push({ text: piece, space: piece === ' ', font, size: ts.size, colour: r.colour ?? ts.colour,
        underline: ts.underline || !!r.underline, link, width: textWidth(font, ts.size, piece) });
    }
  }
  return out;
}

/**
 * Atoms into lines no wider than `width`: greedy, breaking at spaces; a word wider than a
 * line is broken by characters. `hard` marks a line ended by a line break (or the last).
 * @param {any[]} atoms @param {number} width
 * @returns {{ atoms: any[], width: number, hard: boolean }[]}
 */
export function breakLines(atoms, width) {
  /** @type {{ atoms: any[], width: number, hard: boolean }[]} */
  const lines = [];
  /** @type {any[]} */
  let line = [];
  let w = 0;
  const push = (/** @type {boolean} */ hard) => {
    while (line.length && line[line.length - 1].space) w -= line.pop().width;
    lines.push({ atoms: line, width: w, hard });
    line = []; w = 0;
  };
  for (const a of atoms) {
    if (a.br) { push(true); continue; }
    if (a.space && !line.length) continue;
    if (w + a.width <= width + EPS) { line.push(a); w += a.width; continue; }
    if (a.space) { push(false); continue; }
    if (line.length) push(false);
    if (a.width <= width + EPS) { line = [a]; w = a.width; continue; }
    // Broken by characters, measured once each as it goes (linear in the word's length).
    let from = 0, acc = 0;
    for (let i = 0; i < a.text.length; i++) {
      const cw = textWidth(a.font, a.size, a.text[i]);
      if (i > from && acc + cw > width + EPS) {
        lines.push({ atoms: [{ ...a, text: a.text.slice(from, i), width: textWidth(a.font, a.size, a.text.slice(from, i)) }], width: acc, hard: false });
        from = i; acc = 0;
      }
      acc += cw;
    }
    const tail = { ...a, text: a.text.slice(from), width: textWidth(a.font, a.size, a.text.slice(from)) };
    line = [tail]; w = tail.width;
  }
  if (line.length || !lines.length) push(true);
  return lines;
}

/**
 * One line's items, its baseline at `base`.
 * @param {{ atoms: any[], width: number, hard: boolean }} line @param {number} x @param {number} base
 * @param {number} width @param {string} align @param {boolean} last
 */
export function lineItems(line, x, base, width, align, last) {
  const extra = width - line.width;
  let start = x, gap = 0;
  if (align === 'centre') start += extra / 2;
  else if (align === 'right') start += extra;
  else if (align === 'justify' && !last && !line.hard) {
    const spaces = line.atoms.filter((a) => a.space).length;
    if (spaces) gap = extra / spaces;
  }
  /** @type {any[]} */
  const items = [];
  let cx = start;
  for (const a of line.atoms) {
    if (!a.space) {
      items.push({ kind: 'text', x: cx, y: base, font: a.font, size: a.size, colour: a.colour, text: a.text });
      if (a.underline) items.push({ kind: 'rule', x1: cx, y1: base + a.size * 0.12, x2: cx + a.width, y2: base + a.size * 0.12, width: a.size * 0.05, colour: a.colour });
      if (a.link) items.push({ kind: 'link', x: cx, y: base - a.size * ASCENT, w: a.width, h: a.size, to: a.link });
    }
    cx += a.width + (a.space ? gap : 0);
  }
  return items;
}

/** Page size in points for a style. @param {any} style @returns {[number, number]} */
function pageSize(style) {
  const [w, h] = PAPER_MM[/** @type {'a4'} */ (style.page.paper)] ?? PAPER_MM.a4;
  const pw = Math.round(w * MM * 100) / 100, ph = Math.round(h * MM * 100) / 100;
  return style.page.orientation === 'landscape' ? [ph, pw] : [pw, ph];
}

/** The plain text of runs. @param {any[]} runs */
const plain = (runs) => (runs ?? []).map((r) => (r.br ? ' ' : r.text ?? '')).join('');

/**
 * The document laid out on pages. Two or three passes: each pass sets the page numbers
 * the previous one found (contents, "(page N)" references), until they stop moving.
 * @param {any} doc @param {any} style a normalised Style
 * @param {{ images?: Record<string, any> }} [assets] the size of each image a figure shows, by source; one not here is missing
 */
export function layout(doc, style, assets = {}) {
  /** @type {Record<string, number> | null} */
  let pageOf = null;
  /** @type {any} */
  let res = null;
  let passes = 0;
  for (; passes < 3; passes++) {
    res = flow(doc, style, pageOf, assets);
    /** @type {Record<string, number>} */
    const now = {};
    for (const [k, v] of Object.entries(res.anchors)) now[k] = /** @type {any} */ (v).page;
    const settled = pageOf && Object.keys(now).every((k) => now[k] === /** @type {any} */ (pageOf)[k]);
    pageOf = now;
    if (settled) break;
  }
  decorate(res.pages, doc, style);
  return { ...res, passes: Math.min(passes + 1, 3) };
}

/**
 * One pass.
 * @param {any} doc @param {any} style @param {Record<string, number> | null} pageOf
 * @param {{ images?: Record<string, any> }} assets
 */
function flow(doc, style, pageOf, assets) {
  const [pw, ph] = pageSize(style);
  const m = style.page.margins;
  const left = m.left * MM, top = m.top * MM, bottom = ph - m.bottom * MM, W = pw - (m.left + m.right) * MM;
  /** @type {any[]} */
  const pages = [];
  /** @type {any} */
  let page = null;
  let y = 0;
  /** @type {{ page: any, from: number, y: number, anchor: string } | null} the heading just placed, while nothing follows it */
  let lastHeading = null;
  /** @type {Record<string, { page: number, y: number }>} */
  const anchors = {};
  /** @type {{ title: string, anchor: string, level: number }[]} */
  const headings = [];
  /** @type {string[]} */
  const replaced = [];
  const ctx = {
    encode: (/** @type {string} */ s) => { const r = toWinAnsi(s); for (const c of r.replaced) if (!replaced.includes(c)) replaced.push(c); return r.text; },
    // The first pass has no pages yet, so it holds the place with '00'; after that a target
    // that never landed gets no page at all rather than a wrong one.
    refSuffix: (/** @type {string} */ anchor) => (!style.refs.pageInPdf ? '' : !pageOf ? ' (page 00)'
      : pageOf[anchor] !== undefined ? ` (page ${pageOf[anchor] + 1})` : ''),
  };
  const newPage = () => { page = { size: [pw, ph], items: [] }; pages.push(page); y = top; };
  const atTop = () => y <= top + EPS;
  const room = () => bottom - y;
  const mark = (/** @type {string | undefined} */ name) => { if (name) anchors[name] = { page: pages.length - 1, y }; };
  newPage();

  /** Lines of text placed from y, splitting across pages (at least two lines each side when it can). */
  const setLines = (/** @type {any[]} */ lines, /** @type {any} */ ts, /** @type {number} */ x, /** @type {number} */ width, /** @type {string} */ align, /** @type {string | undefined} */ anchor) => {
    let i = 0, marked = false;
    while (i < lines.length) {
      const fit = Math.floor((room() + EPS) / ts.leading);
      const left = lines.length - i;
      let take = Math.min(fit, left);
      if (take < left) {
        if (lines.length < 4 || take < 2) take = 0;
        else if (left - take < 2) take = left - 2;
      }
      if (take <= 0) {
        if (atTop()) take = Math.max(1, Math.min(fit, left));
        else { newPage(); continue; }
      }
      if (!marked) { mark(anchor); marked = true; }
      for (let k = 0; k < take; k++) {
        const line = lines[i + k];
        page.items.push(...lineItems(line, x, y + (ts.leading - ts.size) / 2 + ts.size * ASCENT, width, align, i + k === lines.length - 1));
        y += ts.leading;
      }
      i += take;
      if (i < lines.length) newPage();
    }
  };

  /** How much of the next block a heading must keep with it. @param {any} next */
  const keepNeed = (next) => {
    if (!next) return 0;
    if (next.kind === 'paragraph') return 2 * textStyle(style, next.style === 'caption' ? 'caption' : next.style === 'code' ? 'code' : 'body').leading;
    if (next.kind === 'table') return 3 * textStyle(style, 'body', { size: style.tables.fontSize }).leading + 4 * style.tables.padding * MM;
    if (next.kind === 'heading') return textStyle(style, next.level === 0 ? 'title' : `h${next.level}`).leading;
    return 0;
  };

  const heading = (/** @type {any} */ b, /** @type {any} */ next) => {
    const ts = textStyle(style, b.level === 0 ? 'title' : `h${Math.min(4, b.level)}`);
    if ((b.pageBreakBefore || ts.pageBreakBefore) && !atTop()) newPage();
    if (b.spaceBefore) y += b.spaceBefore * MM;
    const runs = b.number ? [{ text: `${b.number}  ` }, ...b.runs] : b.runs;
    const lines = breakLines(atomsOf(runs, ts, ctx), W);
    const before = atTop() ? 0 : ts.spaceBefore;
    if (before + lines.length * ts.leading + (ts.keepWithNext ? ts.spaceAfter + keepNeed(next) : 0) > room() && !atTop()) newPage();
    if (!atTop()) y += ts.spaceBefore;
    headings.push({ title: plain(runs).replace(/\s+/g, ' ').trim(), anchor: b.anchor, level: b.level });
    const start = { page, from: page.items.length, y, anchor: b.anchor };
    setLines(lines, ts, left, W, b.centre ? 'centre' : ts.align, b.anchor);
    y += ts.spaceAfter;
    // Kept, so a table that has to start overleaf can take its heading with it.
    lastHeading = start.page === page ? start : null;
  };

  /** Move the heading just placed (if it is the last thing on this page) to the top of a new page. */
  const carryHeading = () => {
    const h = lastHeading;
    if (!h || h.page !== page || atTop()) return false;
    const moved = page.items.splice(h.from);
    const end = y;                       // where the heading ended, space after it included
    newPage();
    const dy = y - h.y;                  // the heading's top goes to the new page's top
    for (const it of moved) {
      if (it.kind === 'rule') { it.y1 += dy; it.y2 += dy; } else it.y += dy;
      page.items.push(it);
    }
    if (h.anchor && anchors[h.anchor]) anchors[h.anchor] = { page: pages.length - 1, y: anchors[h.anchor].y + dy };
    y = end + dy;
    lastHeading = null;
    return true;
  };

  const paragraph = (/** @type {any} */ b) => {
    const key = b.style === 'caption' ? 'caption' : b.style === 'code' ? 'code' : 'body';
    const ts = textStyle(style, key);
    if (!atTop()) y += ts.spaceBefore;
    setLines(breakLines(atomsOf(b.runs, ts, ctx), W), ts, left, W, b.centre ? 'centre' : ts.align, b.anchor);
    y += ts.spaceAfter;
  };

  /** The contents entries, from the document's own headings. */
  const tocEntries = () => (doc.blocks ?? []).filter((b) => b.kind === 'heading' && !b.noToc && b.level <= style.toc.depth)
    .map((b) => ({ level: Math.max(1, b.level), anchor: b.anchor, text: ((style.numbering.inToc && b.number) ? `${b.number}  ` : '') + plain(b.runs) }));

  const toc = () => {
    for (const e of tocEntries()) {
      const ts = textStyle(style, `toc${Math.min(3, e.level)}`);
      const indent = (e.level - 1) * 14;
      const pageText = ctx.encode(pageOf && pageOf[e.anchor] !== undefined ? String(pageOf[e.anchor] + 1) : '00');
      const font = fontName(ts.family, ts.bold, ts.italic);
      const pageW = style.toc.pageNumbers ? textWidth(font, ts.size, pageText) : 0;
      const textW = W - indent - (style.toc.pageNumbers ? 36 : 0);
      const lines = breakLines(atomsOf([{ text: e.text }], ts, ctx), textW);
      const need = lines.length * ts.leading;
      if (need > room() && !atTop()) newPage();
      if (!atTop()) y += ts.spaceBefore;
      const startY = y, startPage = page;
      setLines(lines, ts, left + indent, textW, 'left', undefined);
      const base = y - ts.leading + (ts.leading - ts.size) / 2 + ts.size * ASCENT;
      if (style.toc.pageNumbers) {
        const px = left + W - pageW;
        page.items.push({ kind: 'text', x: px, y: base, font, size: ts.size, colour: ts.colour, text: pageText });
        if (style.toc.leaders) {
          const end = left + indent + lines[lines.length - 1].width + 4;
          const dot = textWidth(font, ts.size, ' .');
          const n = Math.floor((px - 4 - end) / dot);
          if (n > 0) page.items.push({ kind: 'text', x: px - 4 - n * dot, y: base, font, size: ts.size, colour: ts.colour, text: ' .'.repeat(n) });
        }
      }
      if (page === startPage) page.items.push({ kind: 'link', x: left + indent, y: startY, w: W - indent, h: y - startY, to: e.anchor });
      y += ts.spaceAfter;
    }
  };

  const blocks = doc.blocks ?? [];
  blocks.forEach((/** @type {any} */ b, /** @type {number} */ i) => {
    if (i > 0 && blocks[i - 1].kind !== 'heading') lastHeading = null;   // something else came between
    if (b.kind === 'heading') heading(b, blocks[i + 1]);
    else if (b.kind === 'paragraph') paragraph(b);
    else if (b.kind === 'table') layoutTable(b, { style, ctx, left, W, get y() { return y; }, set y(v) { y = v; }, get page() { return page; }, newPage, atTop, room, mark, carryHeading });
    else if (b.kind === 'figure') layoutFigure(b, { style, ctx, left, W, get y() { return y; }, set y(v) { y = v; }, get page() { return page; },
      pageH: bottom - top, images: assets.images ?? {}, newPage, atTop, room, mark, carryHeading });
    else if (b.kind === 'toc') toc();
    else if (b.kind === 'pageBreak') { if (!atTop()) newPage(); }
    else if (b.kind === 'space') { mark(b.anchor); y += (Number(b.mm) || 0) * MM; if (y > bottom) newPage(); }
    else if (b.kind === 'rule') {
      if (room() < 12) newPage();
      y += 6;
      page.items.push({ kind: 'rule', x1: left, y1: y, x2: left + W, y2: y, width: 0.5, colour: '#999999' });
      y += 6;
    }
  });
  return { pages, anchors, headings, replaced };
}

/**
 * Column widths in points. Given fractions are kept (scaled down if they add to more than
 * one); otherwise each column gets at least its longest word and the table is filled to
 * the text width in proportion to how much more each column would like. When not every
 * word fits, the body's words keep their room and the headings wrap.
 * @param {any} b @param {number} n @param {number} W @param {number} pad @param {any} body @param {any} head @param {any} ctx
 */
export function columnWidths(b, n, W, pad, body, head, ctx) {
  const given = (b.columns ?? []).map((/** @type {any} */ c) => Number(c?.width));
  if (given.length === n && given.every((w) => w > 0)) {
    const sum = given.reduce((a, c) => a + c, 0);
    const k = sum > 1 ? 1 / sum : 1;
    return given.map((w) => w * k * W);
  }
  const floor = 2 * pad + 6;
  // The longest word in each column's body and in its heading, kept apart: when a table
  // cannot give every word its room, the data keeps its words and the headings wrap.
  const bodyMin = Array(n).fill(floor), headMin = Array(n).fill(floor), prefW = Array(n).fill(floor);
  const measure = (/** @type {any[]} */ runs, /** @type {any} */ ts, /** @type {number} */ k, /** @type {number[]} */ mins) => {
    let line = 0, longest = 0, max = 0;
    for (const a of atomsOf(runs ?? [], ts, ctx)) {
      if (a.br) { max = Math.max(max, line); line = 0; continue; }
      line += a.width;
      if (!a.space) longest = Math.max(longest, a.width);
    }
    max = Math.max(max, line);
    mins[k] = Math.max(mins[k], Math.min(longest, W * 0.5) + 2 * pad);
    prefW[k] = Math.max(prefW[k], max + 2 * pad);
  };
  (b.header ?? []).forEach((/** @type {any} */ c, /** @type {number} */ k) => measure(c, head, k, headMin));
  (b.rows ?? []).forEach((/** @type {any[]} */ r) => r.forEach((c, k) => { if (k < n) measure(c, body, k, bodyMin); }));
  const sum = (/** @type {number[]} */ xs) => xs.reduce((a, c) => a + c, 0);
  const minW = bodyMin.map((m, k) => Math.max(m, headMin[k]));
  const sumPref = sum(prefW), sumMin = sum(minW), sumBody = sum(bodyMin);
  if (sumPref <= W) return prefW.map((p) => p + (W - sumPref) * (p / sumPref));
  if (sumMin > W) {
    // Not every word fits: the body's words first, then what is left shared towards the
    // headings' longest words; past that, everything is squeezed alike.
    // However hard a table is squeezed, a column keeps room for about four letters of
    // its heading, so a heading wraps rather than standing one letter to a line.
    const least = headMin.map((h) => Math.min(h, 2 * pad + 2.2 * head.size));
    for (let k = 0; k < n; k++) bodyMin[k] = Math.max(bodyMin[k], least[k]);
    const sumBody2 = sum(bodyMin);
    if (sumBody2 >= W) {
      // Even the data's words do not all fit: the widest columns are cut down to one
      // common width, so the short words (an id, a one-word title) stay whole.
      let lo = 0, hi = Math.max(...bodyMin);
      for (let i = 0; i < 40; i++) { const c = (lo + hi) / 2; if (sum(bodyMin.map((x) => Math.min(x, c))) > W) hi = c; else lo = c; }
      const capped = bodyMin.map((x) => Math.min(x, lo));
      const spare = W - sum(capped);
      const cut = capped.filter((x, k) => x < bodyMin[k]).length;
      return capped.map((x, k) => x + (x < bodyMin[k] && cut ? spare / cut : 0));
    }
    const want = minW.map((m, k) => m - bodyMin[k]);
    const k2 = (W - sumBody2) / sum(want);
    return bodyMin.map((x, k) => x + want[k] * k2);
  }
  const slack = prefW.map((p, k) => Math.max(0, p - minW[k]));
  const sumSlack = sum(slack);
  return minW.map((x, k) => x + (W - sumMin) * (sumSlack ? slack[k] / sumSlack : 1 / n));
}

const ALIGN = { l: 'left', c: 'centre', r: 'right', left: 'left', centre: 'centre', center: 'centre', right: 'right' };

/**
 * A table: caption, optional title row, header row (repeated on each page if the style
 * says), body rows that never split unless taller than a page (then cut, and said so),
 * fills for the header, banding and first column, and borders as the style asks.
 * @param {any} b @param {any} f the flow's state
 */
export function layoutTable(b, f) {
  const st = f.style, tb = st.tables;
  const n = Math.max(b.header?.length ?? 0, ...(b.rows ?? []).map((/** @type {any[]} */ r) => r.length), 0);
  if (!n) return;
  const pad = tb.padding * MM;
  const body = textStyle(st, 'body', { size: tb.fontSize, lineSpacing: 1, align: 'left' });
  const head = { ...body, size: tb.header.size, bold: tb.header.bold, italic: tb.header.italic, colour: tb.header.colour, leading: tb.header.size * 1.2 };
  const firstCol = tb.firstColumn.on && tb.firstColumn.bold ? { ...body, bold: true } : body;
  const widths = columnWidths(b, n, f.W, pad, body, head, f.ctx);
  const total = widths.reduce((a, c) => a + c, 0);
  const x0 = f.left + ((tb.align === 'centre' || b.centre) && total < f.W - EPS ? (f.W - total) / 2 : 0);
  const pageH = (f.style.page.margins ? (/** @type {any} */ (f.page).size[1] - (st.page.margins.top + st.page.margins.bottom) * MM) : 700);

  /** @typedef {{ cells: { lines: any[], ts: any, align: string, fill?: string }[], h: number, kind: string, span?: boolean }} Row */
  /** A row laid out: each cell's lines, and the row's height (cut to the page if it must be). */
  const rowOf = (/** @type {any[][]} */ cells, /** @type {string} */ kind, /** @type {number} */ idx, limit = pageH) => {
    /** @type {Row} */
    const row = { cells: [], h: 0, kind };
    for (let k = 0; k < n; k++) {
      const ts = kind === 'head' ? head : k === 0 ? firstCol : body;
      const align = /** @type {any} */ (ALIGN)[b.columns?.[k]?.align ?? 'l'] ?? 'left';
      const lines = breakLines(atomsOf(cells[k] ?? [], ts, f.ctx), Math.max(1, widths[k] - 2 * pad));
      row.cells.push({ lines, ts, align, fill: kind === 'body' && k === 0 && tb.firstColumn.on ? tb.firstColumn.fill : undefined });
      row.h = Math.max(row.h, lines.length * ts.leading);
    }
    const extra = kind === 'body' && b.rowHeight > 0 && (!b.tallRows || b.tallRows[idx]) ? b.rowHeight * MM : 0;
    row.h += 2 * pad + extra;
    if (row.h > limit) {
      for (const c of row.cells) {
        const keep = Math.max(1, Math.floor((limit - 2 * pad) / c.ts.leading) - 1);
        if (c.lines.length > keep) {
          c.lines = c.lines.slice(0, keep);
          c.lines.push(breakLines(atomsOf([{ text: '[this cell continues beyond the page]', italic: true }], c.ts, f.ctx), Math.max(1, widths[0] * 4))[0]);
        }
      }
      row.h = limit;
    }
    return row;
  };
  const titleRow = b.titleRow ? (() => {
    const ts = { ...head, align: 'centre' };
    const lines = breakLines(atomsOf(b.titleRow, ts, f.ctx), Math.max(1, total - 2 * pad));
    return /** @type {Row} */ ({ cells: [{ lines, ts, align: 'centre' }], h: lines.length * ts.leading + 2 * pad, kind: 'title', span: true });
  })() : null;
  const headRow = rowOf(b.header ?? [], 'head', 0);
  const heads = /** @type {Row[]} */ ([titleRow, headRow].filter(Boolean));
  const headsH = heads.reduce((a, r) => a + r.h, 0);
  // A row taller than a page is cut to what fits UNDER the header rows, which sit above it
  // on its page — so it never runs into the footer, and never leaves the header alone.
  const bodyRows = (b.rows ?? []).map((/** @type {any[][]} */ r, /** @type {number} */ i) => rowOf(r, 'body', i, Math.max(pageH / 4, pageH - headsH)));

  const lw = tb.borders === 'none' ? 0 : tb.borderWidth;
  const line = (/** @type {number} */ x1, /** @type {number} */ y1, /** @type {number} */ x2, /** @type {number} */ y2) => {
    if (lw > 0) f.page.items.push({ kind: 'rule', x1, y1, x2, y2, width: lw, colour: tb.borderColour });
  };
  let segTop = 0, drawn = 0;
  const drawRow = (/** @type {Row} */ row, /** @type {number} */ bodyIdx) => {
    const top = f.y;
    if (!drawn) segTop = top;
    const fill = row.kind === 'head' || row.kind === 'title' ? tb.header.fill : (tb.banding.on && bodyIdx % 2 === 1 ? tb.banding.fill : null);
    if (fill) f.page.items.push({ kind: 'fill', x: x0, y: top, w: total, h: row.h, colour: fill });
    let x = x0;
    row.cells.forEach((c, k) => {
      const w = row.span ? total : widths[k];
      if (c.fill && !(row.kind === 'body' && fill && false)) f.page.items.push({ kind: 'fill', x, y: top, w, h: row.h, colour: c.fill });
      let ly = top + pad;
      c.lines.forEach((ln, i) => {
        f.page.items.push(...lineItems(ln, x + pad, ly + (c.ts.leading - c.ts.size) / 2 + c.ts.size * ASCENT, w - 2 * pad, c.align, i === c.lines.length - 1));
        ly += c.ts.leading;
      });
      x += w;
    });
    if (tb.borders === 'all' || tb.borders === 'horizontal') { line(x0, top, x0 + total, top); line(x0, top + row.h, x0 + total, top + row.h); }
    if (tb.borders === 'outer' && !drawn) line(x0, top, x0 + total, top);
    if (tb.borders === 'all') {
      let vx = x0;
      line(vx, top, vx, top + row.h);
      for (const w of row.span ? [total] : widths) { vx += w; line(vx, top, vx, top + row.h); }
    }
    f.y = top + row.h;
    drawn++;
  };
  const closeSegment = () => {
    if (!drawn) return;
    if (tb.borders === 'outer') {
      line(x0, f.y, x0 + total, f.y);
      line(x0, segTop, x0, f.y);
      line(x0 + total, segTop, x0 + total, f.y);
    }
    drawn = 0;
  };
  const caption = () => {
    if (!b.caption) return;
    const ts = textStyle(st, 'caption');
    const lines = breakLines(atomsOf(b.caption.runs, ts, f.ctx), f.W);
    if (tb.captionPosition === 'below' && lines.length * ts.leading + ts.spaceBefore > f.room() && !f.atTop()) f.newPage();
    if (!f.atTop()) f.y += ts.spaceBefore;
    lines.forEach((ln, i) => {
      f.page.items.push(...lineItems(ln, f.left, f.y + (ts.leading - ts.size) / 2 + ts.size * ASCENT, f.W, b.centre ? 'centre' : ts.align, i === lines.length - 1));
      f.y += ts.leading;
    });
    f.y += ts.spaceAfter;
  };

  const capAbove = tb.captionPosition === 'above';
  const firstH = headsH + (bodyRows[0]?.h ?? 0) + (capAbove && b.caption ? 3 * textStyle(st, 'caption').leading : 0);
  if (firstH > f.room() && !f.atTop() && !f.carryHeading()) f.newPage();
  f.mark(b.anchor);
  if (capAbove) caption();
  heads.forEach((r) => drawRow(r, -1));
  bodyRows.forEach((row, i) => {
    if (row.h > f.room() + EPS) {
      closeSegment();
      f.newPage();
      if (tb.header.repeat) heads.forEach((r) => drawRow(r, -1));
    }
    drawRow(row, i);
  });
  closeSegment();
  if (!capAbove) caption();
  else f.y += 4;
}

/** Header, footer and marking on every page, now the page count is known. @param {any[]} pages @param {any} doc @param {any} style */
function decorate(pages, doc, style) {
  const hf = style.headerFooter;
  const m = style.page.margins;
  const meta = doc.meta ?? {};
  const ts = textStyle(style, 'headerFooter');
  const ms = textStyle(style, 'marking');
  const enc = (/** @type {string} */ s) => toWinAnsi(s).text;
  pages.forEach((p, i) => {
    const [pw, ph] = p.size;
    const left = m.left * MM, right = pw - m.right * MM, W = right - left;
    const first = i === 0 && hf.firstDifferent;
    const fill = (/** @type {string} */ s) => String(s ?? '').replace(/#pages\b/g, String(pages.length)).replace(/#page\b/g, String(i + 1))
      .replace(/#title\b/g, meta.title ?? '').replace(/#platform\b/g, meta.platform ?? '').replace(/#date\b/g, meta.date ?? '').replace(/#marking\b/g, meta.marking ?? '');
    const slots = (/** @type {any} */ set, /** @type {number} */ base) => {
      for (const [slot, align] of /** @type {const} */ ([['left', 'left'], ['centre', 'centre'], ['right', 'right']])) {
        const text = fill(set[slot]);
        if (!text.trim()) continue;
        const line = breakLines(atomsOf([{ text }], ts, { encode: enc, refSuffix: () => '' }), 1e6)[0];
        p.items.push(...lineItems(line, left, base, W, align, true));
      }
    };
    const headBase = (m.top * MM) / 2 + ts.size / 2;
    const footBase = ph - (m.bottom * MM) / 2 + ts.size / 2;
    slots(first ? hf.firstHeader : hf.header, headBase);
    slots(first ? hf.firstFooter : hf.footer, footBase);
    if (hf.ruleUnderHeader) p.items.push({ kind: 'rule', x1: left, y1: headBase + 4, x2: right, y2: headBase + 4, width: 0.5, colour: ts.colour });
    if (hf.ruleOverFooter) p.items.push({ kind: 'rule', x1: left, y1: footBase - ts.size - 2, x2: right, y2: footBase - ts.size - 2, width: 0.5, colour: ts.colour });
    if (meta.marking && style.marking.show) {
      const line = breakLines(atomsOf([{ text: meta.marking }], ms, { encode: enc, refSuffix: () => '' }), 1e6)[0];
      p.items.push(...lineItems(line, 0, ms.size + 6, pw, 'centre', true));
      p.items.push(...lineItems(line, 0, ph - 8, pw, 'centre', true));
    }
  });
}
