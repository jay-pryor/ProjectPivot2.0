import { FAMILIES } from './doc-fonts.js';

export const PAPERS = Object.freeze(['a4', 'letter', 'a5', 'legal']);
/** Millimetre page sizes, portrait. */
export const PAPER_MM = Object.freeze({ a4: [210, 297], letter: [215.9, 279.4], a5: [148, 210], legal: [215.9, 355.6] });
export const TEXT_KEYS = Object.freeze(['title', 'h1', 'h2', 'h3', 'h4', 'body', 'caption', 'code', 'toc1', 'toc2', 'toc3', 'headerFooter', 'marking']);
export const TEXT_LABELS = Object.freeze({
  title: 'Title', h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3', h4: 'Heading 4', body: 'Body', caption: 'Caption', code: 'Code',
  toc1: 'Contents level 1', toc2: 'Contents level 2', toc3: 'Contents level 3', headerFooter: 'Header and footer', marking: 'Classification marking',
});
const ALIGNS = ['left', 'centre', 'right', 'justify'];
const BORDERS = ['all', 'horizontal', 'outer', 'none'];
const FORMATS = ['1', '1.1', '1.1.1'];

/** @param {number} size @param {Record<string, any>} [o] */
const T = (size, o = {}) => ({ family: 'helvetica', size, bold: false, italic: false, underline: false, colour: '#000000', align: 'left',
  lineSpacing: 1.15, spaceBefore: 0, spaceAfter: 6, keepWithNext: false, pageBreakBefore: false, ...o });
const SLOTS = () => ({ left: '', centre: '', right: '' });

/** The built-in style: a known-good baseline every project has. */
export const STANDARD = Object.freeze({
  id: 'standard', name: 'Standard', builtin: true,
  page: { paper: 'a4', orientation: 'portrait', margins: { top: 25, bottom: 25, left: 25, right: 25 } },
  text: {
    title: T(20, { bold: true, spaceAfter: 12, keepWithNext: true }),
    h1: T(16, { bold: true, spaceBefore: 14, spaceAfter: 6, keepWithNext: true }),
    h2: T(13, { bold: true, spaceBefore: 10, spaceAfter: 4, keepWithNext: true }),
    h3: T(11.5, { bold: true, spaceBefore: 8, spaceAfter: 4, keepWithNext: true }),
    h4: T(11, { bold: true, italic: true, spaceBefore: 6, spaceAfter: 3, keepWithNext: true }),
    body: T(10.5, { align: 'justify' }),
    caption: T(9, { italic: true, spaceBefore: 3, spaceAfter: 8 }),
    code: T(9.5, { family: 'courier' }),
    toc1: T(10.5, { bold: true, spaceAfter: 3 }),
    toc2: T(10, { spaceAfter: 2 }),
    toc3: T(9.5, { spaceAfter: 2 }),
    headerFooter: T(8.5, { colour: '#444444', spaceAfter: 0 }),
    marking: T(9, { bold: true, align: 'centre', spaceAfter: 0 }),
  },
  tables: {
    borders: 'all', borderColour: '#999999', borderWidth: 0.5, fontSize: 9, padding: 1.5, align: 'left', captionPosition: 'below',
    header: { fill: '#d9e2f3', bold: true, italic: false, colour: '#000000', size: 9, repeat: true },
    banding: { on: false, fill: '#f2f2f2' },
    firstColumn: { on: false, fill: '#e7e6e6', bold: true },
  },
  headerFooter: { firstDifferent: false, header: SLOTS(), footer: { left: '', centre: 'Page #page of #pages', right: '' },
    firstHeader: SLOTS(), firstFooter: SLOTS(), ruleUnderHeader: false, ruleOverFooter: false },
  marking: { show: true },
  numbering: { on: true, format: '1.1.1', inToc: true },
  toc: { include: true, title: 'Contents', depth: 3, leaders: true, pageNumbers: true },
  refs: { pageInPdf: true },
});

/** Has the Style shape, as opposed to an old formatting profile. @param {any} x */
export const isStyle = (x) => !!(x && typeof x === 'object' && x.text && x.page && x.page.margins);

/**
 * A style with every field present and within its limits. A value that was GIVEN but is
 * unusable is held to the nearest workable one and named in `held`; a value that was
 * simply missing takes the Standard one silently.
 * @param {any} raw
 * @returns {{ style: any, held: string[] }}
 */
export function normaliseStyle(raw) {
  /** @type {string[]} */
  const held = [];
  const r = raw && typeof raw === 'object' ? raw : {};
  const given = (/** @type {any} */ v) => v !== undefined && v !== null && v !== '';
  const num = (/** @type {any} */ v, /** @type {number} */ d, /** @type {number} */ lo, /** @type {number} */ hi, /** @type {string} */ label) => {
    if (!given(v)) return d;
    const n = Number(v);
    if (!Number.isFinite(n)) { held.push(`${label}: "${v}" is not a number, kept at ${d}`); return d; }
    const c = Math.min(hi, Math.max(lo, n));
    if (c !== n) held.push(`${label}: ${n} held at ${c}`);
    return c;
  };
  const pick = (/** @type {any} */ v, /** @type {any} */ d, /** @type {readonly any[]} */ ok, /** @type {string} */ label) => {
    if (!given(v)) return d;
    if (ok.includes(v)) return v;
    held.push(`${label}: "${v}" is not one of ${ok.join(', ')}, kept at ${d}`);
    return d;
  };
  const colour = (/** @type {any} */ v, /** @type {string} */ d, /** @type {string} */ label) => {
    if (!given(v)) return d;
    if (/^#[0-9a-f]{6}$/i.test(String(v))) return String(v).toLowerCase();
    held.push(`${label}: "${v}" is not a colour like #1f4e79, kept at ${d}`);
    return d;
  };
  const bool = (/** @type {any} */ v, /** @type {boolean} */ d) => (v === undefined ? d : v === true || v === 'true');
  const str = (/** @type {any} */ v, /** @type {string} */ d) => (v === undefined || v === null ? d : String(v));
  const S = STANDARD;

  const page = r.page ?? {};
  const paper = pick(page.paper, S.page.paper, PAPERS, 'Paper');
  const orientation = pick(page.orientation, S.page.orientation, ['portrait', 'landscape'], 'Orientation');
  const pm = page.margins ?? {};
  const margins = {
    top: num(pm.top, S.page.margins.top, 5, 60, 'Top margin'), bottom: num(pm.bottom, S.page.margins.bottom, 5, 60, 'Bottom margin'),
    left: num(pm.left, S.page.margins.left, 5, 60, 'Left margin'), right: num(pm.right, S.page.margins.right, 5, 60, 'Right margin'),
  };
  const dims = /** @type {[number, number]} */ (PAPER_MM[/** @type {'a4'} */ (paper)]);
  const pageW = orientation === 'landscape' ? dims[1] : dims[0];
  const pageH = orientation === 'landscape' ? dims[0] : dims[1];
  if (pageW - margins.left - margins.right < 60) {
    const each = (pageW - 60) / 2;
    held.push(`Left and right margins: held at ${each}mm each, to leave 60mm for text`);
    margins.left = each; margins.right = each;
  }
  if (pageH - margins.top - margins.bottom < 60) {
    const each = (pageH - 60) / 2;
    held.push(`Top and bottom margins: held at ${each}mm each, to leave 60mm for text`);
    margins.top = each; margins.bottom = each;
  }

  /** @type {Record<string, any>} */
  const text = {};
  for (const k of TEXT_KEYS) {
    const d = /** @type {any} */ (S.text)[k], v = (r.text ?? {})[k] ?? {}, L = TEXT_LABELS[/** @type {'body'} */ (k)];
    text[k] = {
      family: pick(v.family, d.family, FAMILIES, `${L} font`), size: num(v.size, d.size, 6, 72, `${L} size`),
      bold: bool(v.bold, d.bold), italic: bool(v.italic, d.italic), underline: bool(v.underline, d.underline),
      colour: colour(v.colour, d.colour, `${L} colour`), align: pick(v.align, d.align, ALIGNS, `${L} alignment`),
      lineSpacing: num(v.lineSpacing, d.lineSpacing, 0.8, 3, `${L} line spacing`),
      spaceBefore: num(v.spaceBefore, d.spaceBefore, 0, 72, `${L} space before`), spaceAfter: num(v.spaceAfter, d.spaceAfter, 0, 72, `${L} space after`),
      keepWithNext: bool(v.keepWithNext, d.keepWithNext), pageBreakBefore: bool(v.pageBreakBefore, d.pageBreakBefore),
    };
  }

  const t = r.tables ?? {}, td = S.tables;
  const tables = {
    borders: pick(t.borders, td.borders, BORDERS, 'Table borders'), borderColour: colour(t.borderColour, td.borderColour, 'Table border colour'),
    borderWidth: num(t.borderWidth, td.borderWidth, 0, 4, 'Table border weight'), fontSize: num(t.fontSize, td.fontSize, 6, 24, 'Table text size'),
    padding: num(t.padding, td.padding, 0, 10, 'Cell padding'), align: pick(t.align, td.align, ['left', 'centre'], 'Table alignment'),
    captionPosition: pick(t.captionPosition, td.captionPosition, ['above', 'below'], 'Caption position'),
    header: {
      fill: colour(t.header?.fill, td.header.fill, 'Header row fill'), bold: bool(t.header?.bold, td.header.bold), italic: bool(t.header?.italic, td.header.italic),
      colour: colour(t.header?.colour, td.header.colour, 'Header row text colour'), size: num(t.header?.size, td.header.size, 6, 24, 'Header row size'),
      repeat: bool(t.header?.repeat, td.header.repeat),
    },
    banding: { on: bool(t.banding?.on, td.banding.on), fill: colour(t.banding?.fill, td.banding.fill, 'Banding fill') },
    firstColumn: { on: bool(t.firstColumn?.on, td.firstColumn.on), fill: colour(t.firstColumn?.fill, td.firstColumn.fill, 'First column fill'),
      bold: bool(t.firstColumn?.bold, td.firstColumn.bold) },
  };

  const hf = r.headerFooter ?? {};
  const slots = (/** @type {any} */ v, /** @type {any} */ d) => ({ left: str(v?.left, d.left), centre: str(v?.centre, d.centre), right: str(v?.right, d.right) });
  const headerFooter = {
    firstDifferent: bool(hf.firstDifferent, S.headerFooter.firstDifferent),
    header: slots(hf.header, S.headerFooter.header), footer: slots(hf.footer, S.headerFooter.footer),
    firstHeader: slots(hf.firstHeader, S.headerFooter.firstHeader), firstFooter: slots(hf.firstFooter, S.headerFooter.firstFooter),
    ruleUnderHeader: bool(hf.ruleUnderHeader, S.headerFooter.ruleUnderHeader), ruleOverFooter: bool(hf.ruleOverFooter, S.headerFooter.ruleOverFooter),
  };
  const style = {
    id: str(r.id, S.id), name: str(r.name, S.name), ...(r.builtin === true ? { builtin: true } : {}),
    page: { paper, orientation, margins }, text, tables, headerFooter,
    marking: { show: bool(r.marking?.show, S.marking.show) },
    numbering: { on: bool(r.numbering?.on, S.numbering.on), format: pick(r.numbering?.format, S.numbering.format, FORMATS, 'Numbering format'),
      inToc: bool(r.numbering?.inToc, S.numbering.inToc) },
    toc: { include: bool(r.toc?.include, S.toc.include), title: str(r.toc?.title, S.toc.title), depth: num(r.toc?.depth, S.toc.depth, 1, 4, 'Contents depth'),
      leaders: bool(r.toc?.leaders, S.toc.leaders), pageNumbers: bool(r.toc?.pageNumbers, S.toc.pageNumbers) },
    refs: { pageInPdf: bool(r.refs?.pageInPdf, S.refs.pageInPdf) },
  };
  return { style, held };
}

/** The standard family nearest a TeX font package name. @param {string} f */
function familyOfTex(f) {
  const s = String(f ?? '');
  if (/mono|courier|tt$/i.test(s)) return 'courier';
  if (/heros|adventor|helvet|arial|sans|ss$/i.test(s)) return 'helvetica';
  return 'times';
}

/**
 * An old formatting profile as a Style. Sizes are points and margins millimetres, as
 * before; what only LaTeX understood (font packages, preamble, gaps) is dropped.
 * @param {any} p @param {(fontFamily: string) => string} [familyOf]
 */
export function fromProfile(p, familyOf = familyOfTex) {
  p = p ?? {};
  const pg = p.page ?? {};
  const n = (/** @type {any} */ v) => { const x = parseFloat(String(v)); return Number.isFinite(x) ? x : undefined; };
  const mm = (/** @type {any} */ v) => {
    const s = String(v ?? '').trim(), x = parseFloat(s);
    if (!Number.isFinite(x)) return undefined;
    return /cm$/i.test(s) ? x * 10 : /in$/i.test(s) ? x * 25.4 : /pt$/i.test(s) ? x * 25.4 / 72 : x;
  };
  const family = familyOf(pg.fontFamily ?? '');
  /** @type {Record<string, any>} */
  const text = { body: { family, size: n(pg.fontSize), lineSpacing: n(pg.lineSpacing), bold: pg.bold, italic: pg.italic } };
  for (const lv of p.levels ?? []) {
    const key = lv.level === 0 ? 'title' : `h${lv.level}`;
    if (!['title', 'h1', 'h2', 'h3', 'h4'].includes(key)) continue;
    text[key] = { family, size: n(lv.size), bold: lv.bold, italic: lv.italic, pageBreakBefore: lv.pageBreakBefore,
      spaceBefore: n(lv.spaceBefore), spaceAfter: n(lv.spaceAfter), keepWithNext: true };
  }
  for (const k of ['toc1', 'toc2', 'toc3', 'headerFooter', 'marking']) text[k] = { family };
  const tb = p.tables ?? {};
  text.caption = { family, size: n(tb.captionFontSize), bold: tb.captionBold, italic: tb.captionItalic };
  const hf = p.headerFooter ?? {};
  const out = {
    id: p.id, name: p.name, ...(p.builtin ? { builtin: true } : {}),
    page: { paper: String(pg.paper ?? 'a4').toLowerCase(), margins: { top: mm(pg.marginTop), bottom: mm(pg.marginBottom), left: mm(pg.marginLeft), right: mm(pg.marginRight) } },
    text,
    tables: {
      fontSize: n(tb.fontSize), align: tb.centre ? 'centre' : 'left', captionPosition: tb.captionPosition,
      header: { fill: tb.head?.shade, bold: tb.headBold, italic: tb.headItalic, size: n(tb.headFontSize) },
      firstColumn: { on: !!tb.firstColumn?.shade || tb.firstColBold === true, fill: tb.firstColumn?.shade, bold: tb.firstColBold },
    },
    headerFooter: { firstDifferent: hf.firstDifferent, header: hf.header, footer: hf.footer, firstHeader: hf.firstHeader, firstFooter: hf.firstFooter },
    numbering: { on: p.headings?.numbered !== false },
    toc: { include: p.toc?.include, depth: p.toc?.depth },
  };
  return normaliseStyle(out).style;
}
