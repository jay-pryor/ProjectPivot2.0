# Reports as PDF and HTML, part 1: the engine, styles and live preview

Date: 2026-10-12
Status: approved design, awaiting spec review

## Purpose

PIVOT's reports are produced as Markdown and turned into PDF outside the app with pandoc and tectonic. This replaces that with **PDF and HTML written by PIVOT itself, with no dependencies**. Every part of the look is set in a **Style** you configure in the report designer, so a report needs no hand formatting in Word.

### The parts

| Part | What it covers |
|---|---|
| **1 (this spec)** | The engine, Styles, the live page preview, PDF and HTML output, and existing cross-references. Markdown goes. |
| 2 | Bulleted and numbered lists, underline in text, web links, and images with captions and figure numbers (figures can be cross-referenced). |
| 3 | Cover page layouts with an uploaded logo, a watermark, and a document control or revision table. |

**Later:** embedded fonts, and the extra characters they would allow.

## Decisions

- **Outputs are PDF and HTML.** Markdown output, and the pandoc and LaTeX settings, are removed.
- **Styles are a fixed set of built-in styles, each fully configurable.** Every part of a report maps to one automatically. Nothing is applied by hand. Named custom paragraph or table styles may come later.
- **The designer shows a live page preview**, drawn by the same layout engine as the PDF.
- **Fonts** are the PDF standard families: Helvetica, Times and Courier, each in regular, bold, italic and bold italic. Nothing is embedded. Characters these fonts cannot show are replaced and listed.
- **Produced reports are frozen.** A report stores its finished document and the Style used, and PDF or HTML is drawn from those on download.

## Architecture

```
designer content + PIVOT data
        │  App.docGen (reworked): builds the document
        ▼
   Document (blocks of runs)  ──────────────► HTML writer (flowing page + CSS from the Style)
        │  + Style
        ▼
   Layout engine (two passes) → Pages (positioned text, rules, fills, link areas)
        ├──► PDF writer → .pdf
        └──► Preview renderer → pages in the designer
```

### New files

All are under `DocGen/`, self-contained, and use no libraries. They are bundled into `dist/pivot.html` like `doc-designer.js`, and `scripts/build.js` lists them.

| File | What it holds |
|---|---|
| `DocGen/doc-fonts.js` | Character widths for the 12 standard fonts (Adobe Core 14 AFM widths, WinAnsi encoding), `textWidth(font, size, text)`, and the WinAnsi encoder with its list of substitutions. |
| `DocGen/doc-layout.js` | The layout engine: document plus Style to pages. |
| `DocGen/doc-pdf.js` | The PDF writer: pages to PDF bytes. |
| `DocGen/doc-html.js` | The HTML writer: document plus Style to an HTML page. |

`doc-designer.js` keeps the designer, the outline and numbering, references, the rich-text grammar, the providers and the store. It loses everything listed under Removed.

### The document

```
Document  = { title, meta: { platform, date, marking, … }, blocks: Block[], tables: TableIndex, refs: RefIndex }
Block     = { kind: 'heading', level: 0..4, number: '3.2' | null, anchor, runs, centre?, pageBreakBefore?, spaceBefore?, noToc? }
          | { kind: 'paragraph', style: 'body' | 'caption' | 'code', runs, centre?, number? }
          | { kind: 'table', anchor?, caption?: { number, runs, position }, columns: [{ label, width?, align }],
              header: Run[][], rows: Run[][][], key?: number, rowHeights?, styleHead, styleFirstColumn, centre?, empty? }
          | { kind: 'toc' } | { kind: 'pageBreak' } | { kind: 'space', mm }
Run       = { text, bold?, italic?, code?, ref?: { target, form: 'number' | 'title' | 'words' }, br? }
```

- Level 0 is the title.
- `ref` runs keep their target. The engine fills in the printed text and page.

### Layout engine (`doc-layout.js`)

**Text:**
- Text is measured with `doc-fonts`.
- Lines are wrapped greedily at spaces. A word wider than the line is broken by character.
- Justification is the Style's alignment: left, centre, right or justify, with justify skipping the last line.

**Pages:**
- The page box comes from the Style's paper, orientation and margins.
- The header and footer are placed in the margins.
- The classification marking goes at the top and bottom edges.

**Flow rules:**
- Headings have keep with next and start on a new page.
- A block that would be cut at the foot of a page moves to the next page.
- A paragraph splits by line, leaving at least two lines at each end where it can.

**Tables:**
- Column widths come from the block's widths or from the existing auto-width calculation (kept from `App.md`, ported).
- Rows don't split unless taller than a page. The header row repeats on each page.
- A cell taller than a page is cut, with "(continued)" noted.

**Two passes:** pass 1 lays out with placeholder page numbers. Pass 2 lays out again with the real page numbers in the contents page, "(page N)" references, and "Page N of M".

**Output:**

```
Page    = { size: [w, h], items: Item[] }
Item    = { kind: 'text', x, y, font, size, colour, text } | { kind: 'rule', x1, y1, x2, y2, width, colour }
        | { kind: 'fill', x, y, w, h, colour } | { kind: 'link', x, y, w, h, to: anchor | page }
```

`pages.anchors` maps each anchor to its page and y position.

### PDF writer (`doc-pdf.js`)

- **Format:** PDF 1.4. The catalog, page tree and one content stream per page are compressed with `CompressionStream('deflate')` where available, and uncompressed otherwise.
- **Fonts:** the standard Type1 fonts with WinAnsiEncoding, so no font is embedded.
- **Links:** internal links are `/Link` annotations with `/Dest` to the target page and position.
- **Bookmarks:** an `/Outlines` tree from the headings.
- **Document info:** title, producer "PIVOT" and creation date.
- **Output:** a `Uint8Array`.

### HTML writer (`doc-html.js`)

- One HTML page with a `<style>` built from the Style (text styles, tables, page `@page` size and margins), the marking at the top and bottom, and a clickable contents list.
- No page numbers. References print without "(page N)".
- All text is escaped.

### Preview

- The Style workspace and the report designer's preview draw the layout engine's pages as positioned HTML (or SVG) page boxes at screen scale.
- Redrawing is debounced as you edit. Only a changed Style or report lays out again.
- The preview subject is the platform chosen in the designer. With none, it uses a small built-in sample.

## Styles

A **Style** replaces the "formatting profile" (the "Formatting profiles" export kind becomes "Styles"). A report template carries its Style.

```
Style = {
  id, name, builtin?,
  page: { paper: 'a4'|'letter'|'a5'|'legal', orientation: 'portrait'|'landscape', margins: { top, bottom, left, right } /* mm */ },
  text: { title, h1, h2, h3, h4, body, caption, toc1, toc2, toc3, headerFooter, marking, code }  // each a TextStyle
  tables: { borders: 'all'|'horizontal'|'outer'|'none', borderColour, borderWidth /* pt */,
            header: { fill, bold, italic, colour, size, repeat: true },
            banding: { on, fill }, firstColumn: { fill, bold }, padding /* mm */, align: 'left'|'centre',
            captionPosition: 'above'|'below', captionStyle: 'caption', fontSize },
  headerFooter: { firstDifferent, header, footer, firstHeader, firstFooter /* {left, centre, right} */,
                  ruleUnderHeader, ruleOverFooter },
  marking: { show: true },
  numbering: { on, format: '1' | '1.1' | '1.1.1', inToc },
  toc: { title, depth: 1..4, leaders, pageNumbers },
  refs: { pageInPdf: true },
}
TextStyle = { family: 'helvetica'|'times'|'courier', size /* pt */, bold, italic, underline, colour, align,
              lineSpacing, spaceBefore, spaceAfter /* pt */, keepWithNext?, pageBreakBefore? }
```

- **Header and footer slots** mix text with the fields `#page`, `#pages`, `#title`, `#platform`, `#date` and `#marking`, plus `/[Tag]` fill-ins.
- **Colours** are `#rrggbb`.
- **Validation** holds impossible values to the nearest workable one: sizes 6–72 pt, margins 5–60 mm with at least 60 mm of text width left, and so on. A message names what was held.

### The Styles workspace

The Styles workspace is a new view in the designer.

- **Above:** a Style picker with New, Copy, Rename, Delete, Import and Export.
- **Left:** the list of styles: Page, Title, Heading 1–4, Body, Caption, Code, Tables, Header & footer, Marking, Numbering & contents.
- **Middle:** the chosen style's controls.
- **Right:** the live page preview.

## Report content

- **Sections and numbering:**
  - The existing outline, levels and numbering produce heading blocks.
  - "Start on a new page", centring, space before and "leave out of contents" become block properties.
  - Numbered intros become numbered paragraphs.
- **Generated tables:**
  - Providers return structured tables: columns, rows of cell values formatted as text lines (as `MD.human` does today), and the key column.
  - The designer's per-table caption, no-caption and column-name overrides apply, and its widths apply where set.
  - An empty table shows "None.". Captions are numbered "Table N".
- **Hand-written sections:** rich text (bold, italic, code, line breaks, references) and hand-made tables (widths, row heights, alignment, header and first-column shading) carry across.
- **Cross-references:**
  - The forms are the existing number, title and own words.
  - The PDF adds " (page N)" when `refs.pageInPdf` is set.
  - References are clickable in PDF and HTML. A missing target prints **[missing reference]**.
- **Contents:** a `toc` block is laid out by the engine, with optional dotted leaders and right-aligned page numbers. Entries are clickable. PDF bookmarks mirror the headings.
- **Tags:** `/[Tag]` fill-ins are filled while the document is built.
- **Characters outside WinAnsi** are replaced:
  - "≥" with ">=", "≤" with "<=", and "≠" with "!=";
  - a tick with "Yes" and a cross with "No";
  - other symbols with "?".

  The designer lists any replaced characters for the report.

## PIVOT

- **Produce** (`docs.produce`) stores `{ ...snapshot, document, style }` on the `report` record instead of `markdown` and `html`.
- **Download:**
  - PDF and HTML are drawn on download; file names end `.pdf` and `.html`.
  - A report produced before this has its stored `html` and offers HTML only.
- **Designer:** Generate offers "Make PDF" and "Make HTML".
- **Data:**
  - Bump `SCHEMA_VERSION` to 6.
  - A throwaway script, `scripts/convert-to-v6.mjs`, turns `reportDesign.formats` profiles into Styles (pt and mm values kept, TeX font names mapped to helvetica, times or courier, numbering positions mapped into slots).
  - It drops `markdown` from old report records and removes LaTeX-only settings.
  - It is run on `ConversionFiles` on request.

## Removed

- `App.md`'s Markdown table writers (pipe and grid tables). The width calculation is kept.
- The LaTeX-safe escaping.
- From `docFormat`: `preamble`, `frontMatter` and the rest of the LaTeX and YAML generation, FONTS' TeX package names, and the LATEX_LEVELS and HF_MACROS tables.
- `App.ui.mdPreview`, the Markdown preview parser, replaced by the page preview.
- `emitDocument` and `emitHtml` as Markdown-based writers, replaced by the document builder and the writers.
- Markdown downloads.

## Errors

These are messages, not crashes:

- **A report with no included sections** is refused, as now.
- **A cell taller than a page** is cut and noted.
- **A Style value out of range** is held, and a message names it.
- **Characters replaced by the font fallback** are listed in the designer.
- **A PDF that cannot be built** (an engine fault) shows a "Something went wrong" message. The stored report is unaffected.

## Testing

**`doc-fonts`**
- Widths for known strings in each font.
- The WinAnsi encoder, and the substitutions.

**`doc-layout`**
- Wrapping against known widths, including alignment and justify.
- Page breaks, keep with next, start on a new page, and how paragraphs split across a page.
- Tables split across pages with the header repeated. A cell taller than a page is cut.
- The two passes settle the page numbers in the contents page and in references, and "Page N of M".
- Header and footer fields, and the first page shown differently.
- The marking at the top and bottom of every page.

**`doc-pdf`**
- A small PDF reader written for the tests checks:
  - the cross-reference table and offsets;
  - each page's text in order;
  - the font resources;
  - link annotations and their destinations;
  - the outline tree.

**`doc-html`**
- Structure, CSS built from the Style, escaping, and clickable references.

**Styles**
- Every setting changes the layout or HTML.
- Out-of-range values are held to the nearest workable one.
- Import and export.
- The v6 conversion script.

**Document builder**
- Each kind of block from each source: providers, custom parts, intros, the contents block and tags.
- Numbering and references carry through to the document.

**PIVOT**
- Produce stores the document and Style.
- PDF and HTML download, and the file names.
- A legacy report offers HTML only.

**Existing tests**
- The Markdown and LaTeX-string suites in `DocGen/doc-designer.test.js` are rewritten against the document blocks.
- The structural ones are kept: numbering, references, providers and blocks, and the width calculation.
- These are updated: the `test/reports/docgen-host.test.js` produce tests, `test/ui/controller-reports.test.js` downloads, and `test/build.test.js` for the new files.

**Browser**
- Produce a report, open the PDF in the browser's viewer, and check:
  - clickable contents and references, and bookmarks;
  - headers, footers and the marking;
  - a table across a page break.
- Change a Style and watch the preview follow.
- Download the HTML and open it.

## Out of scope (part 1)

- Lists, underline within text, web links and images (part 2).
- The cover page, logo, watermark, and document control table (part 3).
- Named custom styles.
- Embedded fonts and characters outside WinAnsi.
- Hyphenation.
