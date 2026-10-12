import { layout } from './doc-layout.js';
import { writePdf } from './doc-pdf.js';
import { renderHtml } from './doc-html.js';

export { renderHtml };

/**
 * A document as a PDF: laid out, then written, with bookmarks from its headings.
 * @param {any} doc @param {any} style a normalised Style @param {{ date?: string }} [opts]
 */
export function renderPdf(doc, style, opts = {}) {
  const r = layout(doc, style);
  const bytes = writePdf(r.pages, { title: doc.meta?.title || doc.title || '', anchors: r.anchors, outline: r.headings, date: opts.date });
  return { bytes, replaced: r.replaced, pages: r.pages.length };
}
