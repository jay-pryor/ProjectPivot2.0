# Landscape sections

**Date:** 2026-10-14. **Status:** approved design (agreed in chat), awaiting spec review.

**Where:**
- `DocGen/doc-designer.js`: the Placement tick, the block flag and the document builder
- `DocGen/doc-layout.js`: page size and text width per page
- `DocGen/doc-html.js`: printing landscape sections
- tests

## Why

Wide tables and diagrams in appendices read better on landscape pages. The report should be able to turn a single section landscape and then go back to portrait.

## What changes

### 1. The toggle

- **Where:** the Placement category, under "Section placement", for every section (auto-populated, Meta, your own and Contents). It is a **Landscape pages** tick, off by default.
- **Storage:** the report's design as `landscape: { <sectionId>: true }`, the same rule as `centred`, `pageBreak` and `noToc`. Only "on" is stored. It is added to `BLOCK_FLAGS`.
- **Templates:** report and section templates carry it, like the other section flags. It is added to the template save and apply lists beside `noToc`.

### 2. The document

- **Turning landscape:** where the orientation changes between one section and the next, the builder emits `{ kind: 'pageBreak', orientation: 'landscape' | 'portrait' }` instead of a plain page break.
  - A landscape section always starts on a new landscape page.
  - The section after it starts on a new portrait page, whatever its own "Start this section on a new page" says.
  - Consecutive landscape sections share landscape pages, following their own page-break settings.
- **What landscape means:** the Style's paper turned on its side.
  - If the Style itself is landscape, "Landscape pages" changes nothing.
  - "Portrait" means the Style's own orientation.

### 3. Layout

- **Each page's own size:** each page takes the orientation in force when it was started. The page-size values are recomputed for it:
  - the text width,
  - the left and top edges,
  - the bottom limit.
  The margins stay the Style's.
- **Overflow:** a page started by running out of room keeps the orientation in force.
- **Contents:** tables, figures, paragraphs and the contents list lay out to the page's own text width. Column widths and image widths are shares of that width, so they widen on landscape pages.
- **Header, footer and Security Classification:** already placed per page from the page's size, so they run along the long edge.
- **A page break with an orientation at the top of an empty page:** if the current page is still empty and of the other orientation, its size is changed instead of starting another page. No blank page appears.

### 4. HTML

- **The stylesheet** gains `@page landscape { size: <paper> landscape; }` and `.landscape { page: landscape; }`.
- **The sections:** a landscape stretch of the document is wrapped in `<div class="landscape">…</div>`, opened at an orientation break to landscape and closed at the break back.
- **Printing:** Chrome and Edge print it on landscape pages. Other browsers print it portrait.
- **On screen:** it looks the same.

### 5. Preview

Pages are already drawn at their own size, so landscape pages show wide in the full preview, the Styles preview and the whole-document section preview. A section's own preview crops from its pages as now.

## What does not change

- Page numbering, the Table of Contents, links and bookmarks.
- Styles.
- Reports that do not use the tick: identical output.

## Testing

**Layout (`test/docgen/layout.test.js`):**
- An orientation break gives landscape pages of swapped size.
- Text on them wraps to the wider width.
- A table spanning pages stays landscape on its overflow pages.
- The break back gives portrait pages.
- No blank page is made when the break falls at the top of an empty page.
- The header and footer sit on the long edge.

**Builder (`test/docgen/builder.test.js`):**
- A landscape section is preceded by a landscape break and followed by a portrait break.
- Two landscape sections in a row: one break before and one after.
- Turning it off leaves the document as before.

**Designer panes:** the Landscape pages tick in Placement, and `setBlockFlag('landscape', …)` stores only "on".

**HTML:** the `@page landscape` rule and the wrapping `div.landscape`.

**PDF:** the MediaBox of a landscape page.

**Browser:** tick an appendix landscape, then check the section preview, the full preview, and the PDF page sizes and header and footer positions.
