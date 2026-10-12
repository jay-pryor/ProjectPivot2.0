import { fontName, toWinAnsi, textWidth } from './doc-fonts.js';
import { PAPER_MM } from './doc-style.js';

/** Points per millimetre. */
export const MM = 72 / 25.4;
const ASCENT = 0.78;   // of the size: where the baseline sits in a line box
const EPS = 0.01;

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
    let rest = a.text;
    while (rest) {
      let n = rest.length;
      while (n > 1 && textWidth(a.font, a.size, rest.slice(0, n)) > width + EPS) n--;
      const part = { ...a, text: rest.slice(0, n), width: textWidth(a.font, a.size, rest.slice(0, n)) };
      rest = rest.slice(n);
      if (rest) lines.push({ atoms: [part], width: part.width, hard: false });
      else { line = [part]; w = part.width; }
    }
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
 */
export function layout(doc, style) {
  /** @type {Record<string, number> | null} */
  let pageOf = null;
  /** @type {any} */
  let res = null;
  let passes = 0;
  for (; passes < 3; passes++) {
    res = flow(doc, style, pageOf);
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
 */
function flow(doc, style, pageOf) {
  const [pw, ph] = pageSize(style);
  const m = style.page.margins;
  const left = m.left * MM, top = m.top * MM, bottom = ph - m.bottom * MM, W = pw - (m.left + m.right) * MM;
  /** @type {any[]} */
  const pages = [];
  /** @type {any} */
  let page = null;
  let y = 0;
  /** @type {Record<string, { page: number, y: number }>} */
  const anchors = {};
  /** @type {{ title: string, anchor: string, level: number }[]} */
  const headings = [];
  /** @type {string[]} */
  const replaced = [];
  const ctx = {
    encode: (/** @type {string} */ s) => { const r = toWinAnsi(s); for (const c of r.replaced) if (!replaced.includes(c)) replaced.push(c); return r.text; },
    refSuffix: (/** @type {string} */ anchor) => (style.refs.pageInPdf ? ` (page ${pageOf && pageOf[anchor] !== undefined ? pageOf[anchor] + 1 : '00'})` : ''),
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
    setLines(lines, ts, left, W, b.centre ? 'centre' : ts.align, b.anchor);
    y += ts.spaceAfter;
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
    if (b.kind === 'heading') heading(b, blocks[i + 1]);
    else if (b.kind === 'paragraph') paragraph(b);
    else if (b.kind === 'table') layoutTable(b, { style, ctx, left, W, get y() { return y; }, set y(v) { y = v; }, get page() { return page; }, newPage, atTop, room, mark });
    else if (b.kind === 'toc') toc();
    else if (b.kind === 'pageBreak') { if (!atTop()) newPage(); }
    else if (b.kind === 'space') { y += (Number(b.mm) || 0) * MM; if (y > bottom) newPage(); }
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
 * A table — Task 5 replaces this with the full grid. Here, each row is one line of its
 * cells' text, so the flow around tables can be tested first.
 * @param {any} b @param {any} f the flow's state
 */
export function layoutTable(b, f) {
  const ts = textStyle(f.style, 'body', { size: f.style.tables.fontSize, lineSpacing: 1 });
  for (const row of [b.header, ...(b.rows ?? [])]) {
    const runs = row.flatMap((/** @type {any[]} */ cell, /** @type {number} */ k) => (k ? [{ text: ' | ' }, ...cell] : cell));
    const lines = breakLines(atomsOf(runs, ts, f.ctx), f.W);
    for (const line of lines) {
      if (ts.leading > f.room() && !f.atTop()) f.newPage();
      f.mark(b.anchor);
      f.page.items.push(...lineItems(line, f.left, f.y + ts.size, f.W, 'left', true));
      f.y += ts.leading;
    }
  }
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
