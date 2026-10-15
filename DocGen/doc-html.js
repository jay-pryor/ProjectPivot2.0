import { FIGURE_LAYOUTS, dataUri } from './doc-images.js';

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

/** The page's CSS, from the style. @param {any} s */
function css(s) {
  const m = s.page.margins, t = s.text, tb = s.tables;
  const border = tb.borders === 'none' ? 'none' : `${tb.borderWidth}pt solid ${tb.borderColour}`;
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
    `.doc-table { border-collapse: collapse; width: 100%; margin: 6pt ${tb.align === 'centre' ? 'auto' : '0'}; font-family: ${FAMILY_CSS[/** @type {'times'} */ (t.body.family)]}; font-size: ${tb.fontSize}pt; }`,
    `.doc-table caption { caption-side: ${tb.captionPosition === 'above' ? 'top' : 'bottom'}; }`,
    `.doc-table th, .doc-table td { border: ${tb.borders === 'all' ? border : 'none'}; padding: ${tb.padding}mm; vertical-align: top; text-align: left; }`,
    tb.borders === 'horizontal' ? `.doc-table tr { border-top: ${border}; border-bottom: ${border}; }` : '',
    tb.borders === 'outer' ? `.doc-table { border: ${border}; }` : '',
    `.doc-table thead th { background: ${tb.header.fill}; color: ${tb.header.colour}; font-size: ${tb.header.size}pt; font-weight: ${tb.header.bold ? 700 : 400}; font-style: ${tb.header.italic ? 'italic' : 'normal'}; }`,
    `.doc-table thead { display: ${tb.header.repeat ? 'table-header-group' : 'table-row-group'}; }`,
    tb.listGap > 0 ? `.doc-table td .cell-gap { display: block; height: ${tb.listGap}pt; }` : '',
    tb.banding.on ? `.doc-table tbody tr:nth-child(even) td { background: ${tb.banding.fill}; }` : '',
    tb.firstColumn.on ? `.doc-table tbody td:first-child { background: ${tb.firstColumn.fill}; font-weight: ${tb.firstColumn.bold ? 700 : 400}; }` : '',
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
 * @param {{ images?: Record<string, any> }} [opts] the document's images, prepared; one missing is a placeholder
 */
export function renderHtml(doc, style, opts = {}) {
  const meta = doc.meta ?? {};
  const headings = (doc.blocks ?? []).filter((b) => b.kind === 'heading' && !b.noToc && b.level <= style.toc.depth);
  let wide = false;
  // The break between a list's entries in a body cell, spaced by the Style's gap as in the PDF.
  const cellBr = style.tables.listGap > 0 ? '<span class="cell-gap"></span>' : '<br>';
  const body = (doc.blocks ?? []).map((b) => {
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
      const title = b.titleRow ? `<tr><th colspan="${n}" class="centre">${runsHtml(b.titleRow)}</th></tr>` : '';
      return `<table class="doc-table"${id}>${b.caption ? `<caption>${runsHtml(b.caption.runs)}</caption>` : ''}${cols}` +
        `<thead>${title}<tr>${(b.header ?? []).map((/** @type {any} */ c) => `<th>${runsHtml(c)}</th>`).join('')}</tr></thead>` +
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
  }).join('\n') + (wide ? '\n</div>' : '');
  const marking = meta.marking && style.marking.show ? `<div class="marking">${esc(meta.marking)}</div>` : '';
  return ['<!doctype html>', '<html lang="en">', '<head>', '<meta charset="utf-8">', '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(meta.title || doc.title || 'Report')}</title>`, '<style>', css(style), '</style>', '</head>', '<body>', marking,
    '<main>', body, '</main>', marking, '</body>', '</html>', ''].join('\n');
}
