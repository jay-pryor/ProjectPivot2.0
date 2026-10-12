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
    `p.body { ${textCss(t.body)} }`, `p.caption, caption { ${textCss(t.caption)} }`, `p.code { ${textCss(t.code)} white-space: pre-wrap; }`,
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
    tb.banding.on ? `.doc-table tbody tr:nth-child(even) td { background: ${tb.banding.fill}; }` : '',
    tb.firstColumn.on ? `.doc-table tbody td:first-child { background: ${tb.firstColumn.fill}; font-weight: ${tb.firstColumn.bold ? 700 : 400}; }` : '',
    '.doc-table tr { break-inside: avoid; }', '.page-break { break-after: page; }', 'hr { border: 0; border-top: 1px solid #999; }',
    '@media screen { .page-break { border-top: 1px dashed #bbb; margin: 16pt 0; } }',
  ].filter(Boolean).join('\n');
}

/** Runs as HTML. @param {any[]} runs */
function runsHtml(runs) {
  return (runs ?? []).map((r) => {
    if (r.br) return '<br>';
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
 */
export function renderHtml(doc, style) {
  const meta = doc.meta ?? {};
  const headings = (doc.blocks ?? []).filter((b) => b.kind === 'heading' && !b.noToc && b.level <= style.toc.depth);
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
        `<tbody>${(b.rows ?? []).map((/** @type {any[]} */ r) => `<tr>${r.map((c) => `<td>${runsHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    if (b.kind === 'toc') {
      return `<nav class="toc">${headings.map((h) => `<p class="toc${Math.min(3, Math.max(1, h.level))}"><a href="#${esc(h.anchor)}">${style.numbering.inToc && h.number ? `${esc(h.number)} ` : ''}${esc(plain(h.runs))}</a></p>`).join('')}</nav>`;
    }
    if (b.kind === 'pageBreak') return '<div class="page-break"></div>';
    if (b.kind === 'space') return `<div${id} style="height:${Number(b.mm) || 0}mm"></div>`;
    if (b.kind === 'rule') return '<hr>';
    return '';
  }).join('\n');
  const marking = meta.marking && style.marking.show ? `<div class="marking">${esc(meta.marking)}</div>` : '';
  return ['<!doctype html>', '<html lang="en">', '<head>', '<meta charset="utf-8">', '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(meta.title || doc.title || 'Report')}</title>`, '<style>', css(style), '</style>', '</head>', '<body>', marking,
    '<main>', body, '</main>', marking, '</body>', '</html>', ''].join('\n');
}
