import { FIGURE_LAYOUTS, dataUri } from './doc-images.js';
import { applyLook } from './doc-style.js';

const FAMILY_CSS = {
  helvetica: 'Helvetica, Arial, "Liberation Sans", sans-serif',
  times: '"Times New Roman", Times, "Liberation Serif", serif',
  courier: '"Courier New", Courier, "Liberation Mono", monospace',
};
const esc = (/** @type {any} */ s) => String(s ?? '').replace(/[&<>"']/g, (c) => /** @type {any} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const align = (/** @type {string} */ a) => (a === 'centre' ? 'center' : a);

/** CSS for one text style. @param {any} t */
function textCss(t) {
  return `font-family: ${FAMILY_CSS[/** @type {'times'} */ (t.family)] ?? FAMILY_CSS.helvetica}; font-size: ${t.size}pt; font-weight: ${t.bold ? 700 : 400}; ` +
    `font-style: ${t.italic ? 'italic' : 'normal'}; text-decoration: ${t.underline ? 'underline' : 'none'}; color: ${t.colour}; ` +
    `text-align: ${align(t.align)}; line-height: ${Math.round(120 * t.lineSpacing) / 100}; margin: ${t.spaceBefore}pt 0 ${t.spaceAfter}pt;`;
}

/**
 * One set of table rules, for the Style's tables (`sel` skips those with a look of their own)
 * or for one table's own look.
 * @param {string} sel @param {any} tb a Style's `tables`, with any look laid over @param {string} family
 */
function tableCss(sel, tb, family) {
  const border = tb.borders === 'none' ? 'none' : `${tb.borderWidth}pt solid ${tb.borderColour}`;
  return [
    `${sel} { border-collapse: collapse; width: 100%; margin: 6pt ${tb.align === 'centre' ? 'auto' : '0'}; font-family: ${FAMILY_CSS[/** @type {'times'} */ (family)]}; font-size: ${tb.fontSize}pt; }`,
    `${sel} caption { caption-side: ${tb.captionPosition === 'above' ? 'top' : 'bottom'}; }`,
    `${sel} th, ${sel} td { border: ${tb.borders === 'all' ? border : 'none'}; padding: ${tb.padding}mm; vertical-align: top; text-align: left; }`,
    tb.borders === 'horizontal' ? `${sel} tr { border-top: ${border}; border-bottom: ${border}; }` : '',
    tb.borders === 'outer' ? `${sel} { border: ${border}; }` : '',
    `${sel} thead th { background: ${tb.header.fill}; color: ${tb.header.colour}; font-size: ${tb.header.size}pt; font-weight: ${tb.header.bold ? 700 : 400}; font-style: ${tb.header.italic ? 'italic' : 'normal'}; }`,
    `${sel} thead { display: ${tb.header.repeat ? 'table-header-group' : 'table-row-group'}; }`,
    tb.listGap > 0 ? `${sel} td .cell-gap { display: block; height: ${tb.listGap}pt; }` : '',
    tb.banding.on ? `${sel} tbody tr:nth-child(even) td { background: ${tb.banding.fill}; }` : '',
    tb.firstColumn.on ? `${sel} tbody td:first-child { background: ${tb.firstColumn.fill}; font-weight: ${tb.firstColumn.bold ? 700 : 400}; }` : '',
  ].filter(Boolean);
}

/** The page's CSS, from the style. @param {any} s */
function css(s) {
  const m = s.page.margins, t = s.text, tb = s.tables;
  return [
    `@page { size: ${s.page.paper} ${s.page.orientation}; margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm; }`,
    'body { margin: 0; background: #fff; }',
    `main { max-width: 190mm; margin: 0 auto; padding: 8mm; }`,
    `.marking { ${textCss(t.marking)} text-align: center; margin: 4pt 0; }`,
    `h1.title { ${textCss(t.title)} }`, ...[1, 2, 3, 4].map((n) => `h${n + 1}.h${n} { ${textCss(t[`h${n}`])} }`),
    `p.body { ${textCss(t.body)} }`, `p.caption, caption, figcaption.caption { ${textCss(t.caption)} }`, `p.code { ${textCss(t.code)} white-space: pre-wrap; }`,
    `code { font-family: ${FAMILY_CSS.courier}; }`, '.num { margin-right: .4em; }', '.centre { text-align: center; }',
    `.toc .toc1 { ${textCss(t.toc1)} } .toc .toc2 { ${textCss(t.toc2)} padding-left: 14pt; } .toc .toc3 { ${textCss(t.toc3)} padding-left: 28pt; }`,
    '.toc a { color: inherit; text-decoration: none; }',
    ...tableCss('.doc-table:not(.own)', tb, t.body.family),
    `.figure { margin: 6pt 0; break-inside: avoid; text-align: ${s.images.align === 'left' ? 'left' : 'center'}; }`,
    '.fig-row { display: grid; gap: 4mm; margin-bottom: 4mm; }', '.fig-cell { margin: 0; }', '.fig-cell img { max-width: 100%; height: auto; }',
    s.images.border === 'line' ? `.fig-cell img.bordered { border: ${s.images.borderWidth}pt solid ${s.images.borderColour}; }` : '',
    '.fig-missing { display: inline-block; width: 100%; aspect-ratio: 4 / 3; background: #eeeeee; border: 0.5pt solid #999999; color: #555555; font-size: 8pt; }',
    '.doc-table tr { break-inside: avoid; }', '.page-break { break-after: page; }', 'hr { border: 0; border-top: 1px solid #999; }',
    '@media screen { .page-break { border-top: 1px dashed #bbb; margin: 16pt 0; } }',
    // A landscape section prints on landscape pages (where the browser honours named pages).
    `@page landscape { size: ${s.page.paper} landscape; }`, '.landscape { page: landscape; }',
  ].filter(Boolean).join('\n');
}

/** Runs as HTML. @param {any[]} runs */
function runsHtml(runs, itemBr = '<br>') {
  return (runs ?? []).map((r) => {
    if (r.br) return r.item ? itemBr : '<br>';
    let h = esc(r.text);
    if (r.code) h = `<code>${h}</code>`;
    if (r.italic) h = `<em>${h}</em>`;
    if (r.bold) h = `<strong>${h}</strong>`;
    if (r.ref?.anchor) h = `<a href="#${esc(r.ref.anchor)}">${h}</a>`;
    return h;
  }).join('');
}
const plain = (/** @type {any[]} */ runs) => (runs ?? []).map((r) => (r.br ? ' ' : r.text ?? '')).join('');

/**
 * The document as one standalone HTML page, styled from the Style: no page numbers
 * (it is a web page), references are links, the marking sits above and below.
 * @param {any} doc @param {any} style a normalised Style
 * @param {{ images?: Record<string, any>, review?: { markup?: any[], comments?: any[] } }} [opts] the document's images, prepared;
 *   one missing is a placeholder. `review`: markup and comments to draw over their blocks (only when the export asked for them).
 */
export function renderHtml(doc, style, opts = {}) {
  const meta = doc.meta ?? {};
  const headings = (doc.blocks ?? []).filter((b) => b.kind === 'heading' && !b.noToc && b.level <= style.toc.depth);
  let wide = false, looks = 0;
  // The break between a list's entries in a body cell, spaced by the Style's gap as in the PDF.
  const cellBr = style.tables.listGap > 0 ? '<span class="cell-gap"></span>' : '<br>';
  const blockHtml = (/** @type {any} */ b) => {
    const id = b.anchor ? ` id="${esc(b.anchor)}"` : '';
    const centre = b.centre ? ' centre' : '';
    if (b.kind === 'heading') {
      const num = b.number ? `<span class="num">${esc(b.number)}</span> ` : '';
      return b.level === 0 ? `<h1 class="title${centre}"${id}>${num}${runsHtml(b.runs)}</h1>` : `<h${b.level + 1} class="h${b.level}${centre}"${id}>${num}${runsHtml(b.runs)}</h${b.level + 1}>`;
    }
    if (b.kind === 'paragraph') return `<p class="${b.style === 'caption' ? 'caption' : b.style === 'code' ? 'code' : 'body'}${centre}"${id}>${runsHtml(b.runs)}</p>`;
    if (b.kind === 'table') {
      const cols = (b.columns ?? []).some((/** @type {any} */ c) => c?.width) ? `<colgroup>${b.columns.map((/** @type {any} */ c) => `<col style="width:${Math.round((c?.width ?? 0) * 100)}%">`).join('')}</colgroup>` : '';
      const n = b.header?.length ?? 0;
      const title = !b.titleRow ? '' : b.titleAlign === 'left' || b.titleAlign === 'right'
        ? `<tr><th colspan="${n}" style="text-align: ${b.titleAlign}">${runsHtml(b.titleRow)}</th></tr>`
        : `<tr><th colspan="${n}" class="centre">${runsHtml(b.titleRow)}</th></tr>`;
      // A table with a look of its own carries its own rules, just before it.
      const tb = applyLook(style.tables, b.look);
      const lk = tb === style.tables ? '' : `lk${++looks}`;
      const rules = lk ? `<style>\n${tableCss(`.doc-table.own.${lk}`, tb, style.text.body.family).join('\n')}\n</style>\n` : '';
      const head = tb.header.show ? `<tr>${(b.header ?? []).map((/** @type {any} */ c) => `<th>${runsHtml(c)}</th>`).join('')}</tr>` : '';
      return `${rules}<table class="doc-table${lk ? ` own ${lk}` : ''}"${id}>${b.caption ? `<caption>${runsHtml(b.caption.runs)}</caption>` : ''}${cols}` +
        `<thead>${title}${head}</thead>` +
        `<tbody>${(b.rows ?? []).map((/** @type {any[]} */ r) => `<tr>${r.map((c) => `<td>${runsHtml(c, cellBr)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    if (b.kind === 'figure') {
      const above = style.images.captionPosition === 'above';
      const imgs = opts.images ?? {};
      const shape = /** @type {number[][]} */ (/** @type {any} */ (FIGURE_LAYOUTS)[b.layout] ?? FIGURE_LAYOUTS.single);
      // Every layout's rows are equal shares, so one 1fr column per box is exact.
      const cols = (/** @type {number[]} */ fr) => fr.map(() => '1fr').join(' ');
      let k = 0;
      const rows = shape.map((fr) => `<div class="fig-row" style="grid-template-columns:${cols(fr)}">` + fr.map((share) => {
        const im = (b.images ?? [])[k++];
        if (!im) return '<div class="fig-cell"></div>';
        const got = imgs[im.src];
        const pct = Math.min(100, Math.round((100 * Math.min(1, im.width || 1)) / share));
        const pic = got ? `<img${style.images.border === 'line' && im.border ? ' class="bordered"' : ''} src="${dataUri(got)}" alt="${esc(im.name)}" style="width:${pct}%">`
          : `<div class="fig-missing">Image missing: ${esc(im.name)}</div>`;
        const cap = im.caption ? `<figcaption class="caption">${runsHtml(im.caption.runs)}</figcaption>` : '';
        return `<figure class="fig-cell"${im.anchor ? ` id="${esc(im.anchor)}"` : ''}>${above ? cap : ''}${pic}${above ? '' : cap}</figure>`;
      }).join('') + '</div>').join('');
      const one = b.caption ? `<p class="caption fig-caption">${runsHtml(b.caption.runs)}</p>` : '';
      return `<div class="figure"${id}>${above ? one : ''}${rows}${above ? '' : one}</div>`;
    }
    if (b.kind === 'toc') {
      return `<nav class="toc">${headings.map((h) => `<p class="toc${Math.min(3, Math.max(1, h.level))}"><a href="#${esc(h.anchor)}">${style.numbering.inToc && h.number ? `${esc(h.number)} ` : ''}${esc(plain(h.runs))}</a></p>`).join('')}</nav>`;
    }
    if (b.kind === 'pageBreak' && b.orientation) {
      // A turn to landscape opens a wrapper the turn back closes. The break goes inside it: outside, the change of
      // named page breaks once and the break div again, printing a blank page.
      const out = '<div class="page-break"></div>' + (wide ? '</div>' : '') + (b.orientation === 'landscape' ? '\n<div class="landscape">' : '');
      wide = b.orientation === 'landscape';
      return out;
    }
    if (b.kind === 'pageBreak') return '<div class="page-break"></div>';
    if (b.kind === 'space') return `<div${id} style="height:${Number(b.mm) || 0}mm"></div>`;
    if (b.kind === 'rule') return '<hr>';
    return '';
  };
  const review = reviewByBlock(doc.blocks ?? [], opts.review);
  const body = (doc.blocks ?? []).map((/** @type {any} */ b, /** @type {number} */ bi) => withReview(blockHtml(b), review[bi])).join('\n') + (wide ? '\n</div>' : '');
  const marking = meta.marking && style.marking.show ? `<div class="marking">${esc(meta.marking)}</div>` : '';
  return ['<!doctype html>', '<html lang="en">', '<head>', '<meta charset="utf-8">', '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(meta.title || doc.title || 'Report')}</title>`, '<style>', css(style), review.length ? REVIEW_CSS : '', '</style>', '</head>', '<body>', marking,
    '<main>', body, '</main>', marking, '</body>', '</html>', ''].join('\n');
}

/* ---- Review: markup and comments, when the export asks for them --------------------------
 *
 * The HTML flows rather than being cut into pages, so what was drawn on a page is placed by
 * the block it was drawn on (`at`: the section, which of that section's blocks, and where in
 * it as fractions of its box) and drawn over that block. A comment shows as a symbol at the
 * block's right; its thread opens on hover. */

/**
 * The review items for each block, by index; empty when there are none.
 * @param {any[]} blocks @param {{ markup?: any[], comments?: any[] } | undefined} review
 * @returns {{ markup: any[], comments: any[] }[]}
 */
function reviewByBlock(blocks, review) {
  /** @type {{ markup: any[], comments: any[] }[]} */
  const out = [];
  if (!review || (!(review.markup ?? []).length && !(review.comments ?? []).length)) return out;
  /** @type {Record<string, number>} */
  const seen = {}, at = {};
  blocks.forEach((b, i) => {
    if (!b.sec) return;
    const n = seen[b.sec] = (seen[b.sec] ?? -1) + 1;
    at[`${b.sec}#${n}`] = i;
  });
  const put = (/** @type {any} */ x, /** @type {'markup' | 'comments'} */ k) => {
    const i = x && x.at ? at[`${x.at.sec}#${x.at.n}`] : undefined;
    if (i === undefined) return;
    (out[i] = out[i] ?? { markup: [], comments: [] })[k].push(x);
  };
  (review.markup ?? []).forEach((m) => put(m, 'markup'));
  (review.comments ?? []).forEach((c) => put(c, 'comments'));
  return out;
}

const pct = (/** @type {number} */ f) => `${Math.round(Math.max(0, f) * 10000) / 100}%`;
const BUBBLE = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 2.5h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7l-3.5 3v-3H2a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z" fill="currentColor"/></svg>';

/** A block, wrapped with its markup and comments when it has any. @param {string} html @param {{ markup: any[], comments: any[] } | undefined} r */
function withReview(html, r) {
  if (!r) return html;
  const marks = r.markup.map((m) => `<div class="rv-mk rv-${m.kind === 'box' ? 'box' : 'hl'}" style="left:${pct(m.at.fx)};top:${pct(m.at.fy)};width:${pct(m.at.fw)};height:${pct(m.at.fh)}"></div>`).join('');
  const notes = r.comments.map((c) => `<div class="rv-cmt" style="top:${pct(c.at.fy)}"><span class="rv-cmt-i" tabindex="0">${BUBBLE}</span><div class="rv-cmt-pop">` +
    (c.posts ?? []).map((/** @type {any} */ p) => `<div class="rv-post"><div class="rv-meta">${esc(p.by || 'Someone')}${p.at ? ` · ${esc(String(p.at).slice(0, 16).replace('T', ' '))}` : ''}</div><div>${esc(p.text)}</div></div>`).join('') +
    '</div></div>').join('');
  return `<div class="rv-wrap">${html}${marks}${notes}</div>`;
}

const REVIEW_CSS = [
  '.rv-wrap { position: relative; }',
  '.rv-mk { position: absolute; pointer-events: none; box-sizing: border-box; }',
  '.rv-hl { background: rgba(224, 36, 36, .25); }',
  '.rv-box { border: 2px solid rgba(224, 36, 36, .75); }',
  '.rv-cmt { position: absolute; right: -30px; }',
  '.rv-cmt-i { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: #e02424; color: #fff; cursor: pointer; }',
  '.rv-cmt-pop { display: none; position: absolute; right: 28px; top: 0; width: 280px; background: #fff; color: #222; border: 1px solid #bbb; border-radius: 6px; box-shadow: 0 4px 14px rgba(0,0,0,.2); padding: 8px 10px; font-size: 13px; z-index: 5; }',
  '.rv-cmt:hover .rv-cmt-pop, .rv-cmt-i:focus + .rv-cmt-pop { display: block; }',
  '.rv-post + .rv-post { border-top: 1px solid #ddd; margin-top: 6px; padding-top: 6px; }',
  '.rv-meta { font-size: 11px; color: #777; margin-bottom: 2px; }',
  '@media print { .rv-cmt { display: none; } }',
].join('\n');
