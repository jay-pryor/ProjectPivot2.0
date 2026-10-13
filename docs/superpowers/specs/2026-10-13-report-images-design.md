# Report designer: images in sections

**Date:** 2026-10-13. **Status:** approved design, awaiting spec review.
**Where:**
- **Layout and output:** `DocGen/doc-layout.js`, `doc-pdf.js` and `doc-html.js` (drawing and writing images).
- **Image files:** `DocGen/doc-images.js`, which is new. It reads PNG and JPEG files.
- **Style:** `DocGen/doc-style.js`, for the Images settings.
- **Designer:** `DocGen/doc-designer.js` and `doc-designer.css`, for the Image block, the Standard Images section and the Images style section.
- **Host and controller:** `src/reports/docgen-host.js` and the controller. They read and write the image files.

## Purpose

Some reports need pictures as well as tables: a diagram of the platform, a photo of where a control is fitted, a drawing from a manual. You will be able to drop images into your own sections and lay them out in a grid. Each image or group gets a figure caption and number, and the text can link to it. The images are stored in the PIVOT folder next to the data, so everyone using the folder sees the same ones.

## What you can do

### 1. An Image block in your own sections

The **Content** category of a section you added gets a **+ Image** button, next to + Paragraph, + Table and the rest. An Image block holds:

- **Layout:** a dropdown with five choices. Each one draws empty drop boxes in its shape:

  | Layout | Boxes |
  |---|---|
  | Single image | 1 |
  | Side by side | 2 in a row |
  | 2×2 grid | 4 |
  | 2-1 grid | 2 on top, 1 below at full width |
  | 1-2 grid | 1 at full width on top, 2 below |

- **Drop boxes:** each box takes an image in one of two ways:
  - drag a file from the computer onto it;
  - click it and choose **From Standard Images…** or **From this computer…**.

  A filled box shows a thumbnail and has a ✕ to empty it. If you change the layout, the images keep their order: they fill the new boxes in order, and any extras are kept in the block but not drawn until there is room for them again.
- **Captions:** One caption, Separate captions or No caption.
  - **One caption** gives the whole block one figure number and one caption box.
  - **Separate captions** gives each image its own figure number and its own caption box under its box.

  To have two images share a caption and a third stand alone, use two Image blocks.
- **Per image:**
  - **Width:** a percentage of the text width, with up and down arrows that step by 5. The default is 100% for Single image and fills its grid cell otherwise. An image is never drawn wider than its cell.
  - **No border:** a tick that leaves this image without the Style's border.

  The height always follows the image's own shape.

### 2. Standard Images, in Templates

The Templates tab gets a **Standard Images** section, beside the section templates. It holds images that many reports reuse, such as a logo, a standard diagram or a symbol key.
- You can add images by dragging them in or with **Add image…**, rename them, and delete them.
- Deleting asks first, and says how many Image blocks use the image.
- A report uses a Standard Image **by reference**: change the file in Standard Images and every report that uses it picks up the change.

### 3. An Images section in Styles

The Images section sits after Tables, with these settings:
- **Border:** None or Line. For Line, set the thickness in points (with arrows, stepping by 0.25) and the colour (with the preset swatches and the picker, as for other colours).
- **Caption:** above or below the image.
- **Alignment:** left or centre. It applies to the image, or the whole grid, within the text width.

The caption text uses the existing **Caption** text style.

### 4. Figure numbers and links

- Images are numbered **Figure 1, Figure 2…** through the document, in order. These numbers are separate from table numbers.
- A caption reads "Figure 2: *your caption*". With No caption, the image has no number.
- The **Link** menu in text boxes lists the figures as well as the tables and sections. The link can read either "Figure 2" or "Figure 2: *caption*", in the same way as table links, and in PDF and HTML it jumps to the figure.

## Storage

The images are files in the PIVOT folder. They are not stored inside `data.json`.

| What | Where |
|---|---|
| Images dropped into sections | `files/report-images/<id>.<png\|jpg>` |
| Standard Images | `files/standard-images/<id>.<png\|jpg>` |

- An Image block in the report design stores, for each image, `{ source: 'report' | 'standard', file: '<id>.<ext>', width, noBorder, caption }`, plus the block's `layout` and `captions` mode.
- **No migration is needed.** Existing designs have no Image blocks. Per the pre-release rule, the design format's version is bumped only if the existing fields change, and they do not.
- A dropped image is copied into the folder as soon as it is dropped. Its id is new and random, so two people dropping the same file get two separate files.
- Deleting an Image block, or emptying a box, does not delete the file straight away, because another section or an undo may still use it.
  - **Section images (`files/report-images/`):** a file that no Image block uses is removed the next time the design is saved.
  - **Standard Images:** these are only ever removed by Delete in the Standard Images section.

## Formats

- **PNG** (including transparency) and **JPEG** are accepted.
- Any other file is refused with the message "Only PNG and JPEG images can be used".
- A file over 20 MB is refused, with a message giving its size.
- The new `DocGen/doc-images.js` reads the image width, height and colour data with no dependencies:
  - **JPEG** goes into the PDF as is (DCTDecode).
  - **PNG** is decoded (zlib inflate plus PNG row filters) and written as a Flate image. Its alpha channel becomes a soft mask, so transparency is kept.
  - **Interlaced PNG and 16-bit PNG** are supported. A PNG that cannot be read is treated as missing (see below).

## In the PDF

- An image, or a whole grid, and its caption **stay together**. If they do not fit in the space left on the page, they move to the next page, as a table's heading does.
- An image taller than a whole page is scaled down to fit the page.
- Each image file is written into the PDF **once**, however many times it is used.

## In HTML

- Each image is embedded as a `data:` URI, so the HTML file stays a single file you can send.
- The grids use CSS grid with the same proportions as the PDF.
- Captions are `<figcaption>` elements, with the same figure numbers and link anchors as the PDF.

## A missing image

If a file cannot be found, or cannot be read, these all show a **placeholder** in its place:
- the designer;
- the preview;
- the PDF;
- the HTML.

The placeholder is a grey box with a thin border, the same width as the image would have, at a 4:3 shape, with the words "Image missing: *file name*". The report is still produced. On the Generate tab, the list of things to check names the missing images.

## Producing a report

When you Make PDF or Make HTML, the images are read from the folder at that moment.
- The produced report record keeps the image **references**, not copies.
- If you download an old report again, it shows the images as they are now in the folder. You agreed to this; it keeps the data file small.
- A missing image gives the placeholder.

## Preview

The section and full previews draw images through the same layout as the PDF.
- The designer reads the files once and keeps them in memory while it is open.
- A newly dropped image appears as soon as it has been copied into the folder.

## What does not change

- Generated sections (Hazards, Controls and so on) do not get images. Images are only for your own sections.
- Table numbering, and existing links to tables and sections, stay as they are.

## Testing

- **`test/docgen/images.test.js` (new):**
  - reading the size and colour data from small PNG files (RGB, RGBA, palette, grey, 16-bit and interlaced) and from JPEG files;
  - refusing other formats and broken files.
- **Layout (`test/docgen/layout*.test.js`):**
  - each of the five layouts places its boxes in the right proportions;
  - the width percentage and the cell limit are both applied;
  - figure numbers run in order, apart from table numbers;
  - an image or grid moves to the next page together with its caption;
  - an image taller than a page is scaled to fit;
  - a missing image draws the placeholder.
- **PDF (`test/docgen/pdf.test.js`):**
  - the image objects are written (DCTDecode for JPEG; Flate plus an SMask for PNG with alpha);
  - an image used twice is written once.
- **HTML (`test/docgen/html.test.js`):** `data:` URIs, `<figure>`/`<figcaption>`, and figure link anchors.
- **Style (`test/docgen/style.test.js`):** the Images settings are normalised with their defaults.
- **Designer panes (`test/docgen/designer-panes.test.js`):**
  - the + Image button;
  - the layout dropdown and its drop boxes;
  - the caption modes;
  - the per-image width and No border controls;
  - the Standard Images section in Templates;
  - the Images section in Styles;
  - figures in the Link menu.
- **Host and controller (`test/reports/*`):**
  - images are saved under `files/report-images/` and `files/standard-images/`;
  - images no block uses are removed on save, and Standard Images are never removed that way;
  - the produced PDF and HTML read the images at download time;
  - a missing file gives the placeholder.
- **Browser walkthrough:**
  - drag a PNG with transparency and a JPEG into an own section;
  - try each layout, both caption modes, the width arrows and No border;
  - choose a Standard Image;
  - link to a figure from a paragraph;
  - Make PDF and Make HTML and open both;
  - delete a file from the folder and see the placeholder;
  - check both themes.
