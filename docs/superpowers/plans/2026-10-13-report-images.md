# Report Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Images in your own report sections — dropped in or picked from Standard Images, laid out singly or in grids, captioned and numbered as figures, linkable, styled by a Style's Images section, and drawn in the preview, the PDF and the HTML.

**Architecture:** A new dependency-free `DocGen/doc-images.js` reads PNG and JPEG headers (sync, for sizes) and prepares images for the PDF (async, using the built-in `DecompressionStream`/`CompressionStream`). The designer turns an `image` part into a `figure` document block; a new `DocGen/doc-figure.js` lays it out into `image` page items (or a placeholder); the PDF writer, the page preview and the HTML renderer each learn to draw them. The PIVOT host stores the files under `files/report-images/` and `files/standard-images/` through a small `files` interface the controller provides, and reads them again whenever a report is downloaded.

**Tech Stack:** Plain ES modules (engine), ES5 IIFEs (`DocGen/doc-designer.js`), node:test, Playwright for the browser walkthrough. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-13-report-images-design.md`

## Global Constraints

- No dependencies: PNG/JPEG reading is our own code; zlib is the platform's `DecompressionStream('deflate')` / `CompressionStream('deflate')` (Node ≥ 22 and every current browser have them).
- `DocGen/doc-designer.js` stays ES5 (`var`, `function`, no arrow functions, no template strings).
- Sharp corners in CSS (no `border-radius` other than 0).
- Formats: PNG (with transparency, interlaced and 16-bit included) and JPEG only; anything else is refused with exactly "Only PNG and JPEG images can be used".
- Files over 20 MB are refused with a message giving the size.
- Paths: `files/report-images/<id>.<png|jpg>` and `files/standard-images/<id>.<png|jpg>`; `<id>` is 8 random hex characters.
- Figure numbers are "Figure N", counted separately from tables; a caption reads "Figure N: text" ("Figure N" when the text is blank).
- Missing or unreadable image → placeholder: grey box, thin border, the image's width, 4:3, "Image missing: <file name>".
- Pre-release: no migrations; the design format gains new fields only.
- Run `npm run build` after every source change; commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A file drop landing on a part row** — the part rows are drag-reorderable and already have `drop` handlers; a file dropped on an image box must store the image and must not move a part (Task 11 pins this: `_dragPart` is null for a file drag, and the box handler checks `dataTransfer.types` has `Files`).
2. **A figure taller than the page** (a 2×2 grid of tall portraits) — must scale to fit the text area rather than loop on new pages (Task 5 test "a figure taller than the page is scaled to fit on one page").
3. **Changing the layout to fewer boxes and back** — the extra images must come back in order (Task 10 test "a layout with fewer boxes keeps the extra images for later").
4. **Deleting an image another person's unsaved design still uses** — the sweep must not delete a file dropped in the last 24 hours, or one a produced report uses (Task 14 tests).
5. **Paletted PNG with a transparent index, and a grey PNG with a colour key** — tRNS must become a soft mask (Task 2 tests).

---

### Task 1: Reading image headers (`doc-images.js`) and test fixtures

**Files:**
- Create: `DocGen/doc-images.js`
- Create: `test/docgen/image-fixtures.js`
- Test: `test/docgen/images.test.js`

**Interfaces:**
- Produces:
  - `imageInfo(bytes: Uint8Array) → { type: 'png'|'jpeg', mime: 'image/png'|'image/jpeg', width: number, height: number } | null`
  - `imagePath(source: 'report'|'standard', file: string) → string`
  - `FIGURE_LAYOUTS: Record<'single'|'pair'|'grid4'|'grid21'|'grid12', number[][]>`, `boxCount(layout: string) → number`
  - `figureSources(doc) → string[]` (unique `src` of every image in every `figure` block, in order)
  - `MAX_IMAGE_BYTES = 20 * 1024 * 1024`
  - Test fixtures: `makePng(opts) → Promise<Uint8Array>`, `makeJpeg(width, height, components = 3) → Uint8Array`

- [ ] **Step 1: Write the fixtures** (`test/docgen/image-fixtures.js`)

```js
/**
 * Small PNG and JPEG files for the tests, made here so no binary files are checked in.
 * makePng writes real PNGs (any colour type, bit depth, filter, Adam7 interlace);
 * makeJpeg writes only the markers a JPEG reader looks at (SOI, APP0, SOF0, EOI).
 */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (/** @type {Uint8Array} */ b) => { let c = 0xFFFFFFFF; for (const x of b) c = CRC[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
function chunk(type, data) {
  const body = new Uint8Array([...ascii(type), ...data]);
  return [...u32(data.length), ...body, ...u32(crc32(body))];
}
async function deflate(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];
const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };

/**
 * @param {{ width: number, height: number, colourType?: 0|2|3|4|6, bitDepth?: 1|2|4|8|16, filter?: 0|1|2|3|4,
 *   interlace?: boolean, sample: (x: number, y: number) => number[], palette?: number[][], trns?: number[] }} o
 *   `sample` gives the raw samples of one pixel at the bit depth (a palette index for type 3).
 */
export async function makePng(o) {
  const ct = o.colourType ?? 2, bd = o.bitDepth ?? 8, filter = o.filter ?? 0;
  const ch = CHANNELS[ct], bitsPx = ch * bd, bpp = Math.max(1, Math.ceil(bitsPx / 8));
  /** One image (or interlace pass) of w×h pixels taken from (x0 + i*dx, y0 + j*dy). */
  const raw = (w, h, at) => {
    const stride = Math.ceil((w * bitsPx) / 8);
    const out = [];
    let prev = new Uint8Array(stride);
    for (let j = 0; j < h; j++) {
      const row = new Uint8Array(stride);
      let bit = 0;
      for (let i = 0; i < w; i++) {
        for (const v of o.sample(...at(i, j))) {
          if (bd === 16) { row[bit >> 3] = v >> 8; row[(bit >> 3) + 1] = v & 255; }
          else if (bd === 8) row[bit >> 3] = v;
          else row[bit >> 3] |= v << (8 - bd - (bit & 7));
          bit += bd;
        }
      }
      const f = new Uint8Array(stride);
      for (let k = 0; k < stride; k++) {
        const a = k >= bpp ? row[k - bpp] : 0, b = prev[k], c = k >= bpp ? prev[k - bpp] : 0;
        f[k] = (row[k] - [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter]) & 255;
      }
      out.push(filter, ...f);
      prev = row;
    }
    return out;
  };
  let data = [];
  if (o.interlace) {
    for (const [x0, y0, dx, dy] of ADAM7) {
      const w = Math.ceil((o.width - x0) / dx), h = Math.ceil((o.height - y0) / dy);
      if (w > 0 && h > 0) data.push(...raw(w, h, (i, j) => [x0 + i * dx, y0 + j * dy]));
    }
  } else data = raw(o.width, o.height, (i, j) => [i, j]);
  const ihdr = [...u32(o.width), ...u32(o.height), bd, ct, 0, 0, o.interlace ? 1 : 0];
  return new Uint8Array([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    ...chunk('IHDR', ihdr),
    ...(o.palette ? chunk('PLTE', o.palette.flat()) : []),
    ...(o.trns ? chunk('tRNS', o.trns) : []),
    ...chunk('IDAT', [...await deflate(new Uint8Array(data))]),
    ...chunk('IEND', []),
  ]);
}

/** The markers of a baseline JPEG: enough for a reader of sizes, not a picture. */
export function makeJpeg(width, height, components = 3) {
  const sof = [0xFF, 0xC0, 0, 8 + 3 * components, 8, height >> 8, height & 255, width >> 8, width & 255, components];
  for (let c = 1; c <= components; c++) sof.push(c, 0x11, 0);
  return new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 16, ...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, ...sof, 0xFF, 0xD9]);
}
```

- [ ] **Step 2: Write the failing tests** (`test/docgen/images.test.js`)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageInfo, imagePath, FIGURE_LAYOUTS, boxCount, figureSources, MAX_IMAGE_BYTES } from '../../DocGen/doc-images.js';
import { makePng, makeJpeg } from './image-fixtures.js';

test('a PNG and a JPEG give their type and size', async () => {
  assert.deepEqual(imageInfo(await makePng({ width: 3, height: 2, sample: () => [1, 2, 3] })), { type: 'png', mime: 'image/png', width: 3, height: 2 });
  assert.deepEqual(imageInfo(makeJpeg(640, 480)), { type: 'jpeg', mime: 'image/jpeg', width: 640, height: 480 });
});

test('anything else, or a broken header, is not an image', async () => {
  assert.equal(imageInfo(new TextEncoder().encode('GIF89a......')), null);
  assert.equal(imageInfo(new Uint8Array([0xFF, 0xD8, 0xFF])), null);
  const png = await makePng({ width: 3, height: 2, sample: () => [1, 2, 3] });
  assert.equal(imageInfo(png.slice(0, 20)), null);
  assert.equal(imageInfo(new Uint8Array(0)), null);
});

test('stored images live in their own folders', () => {
  assert.equal(imagePath('report', 'ab12cd34.png'), 'files/report-images/ab12cd34.png');
  assert.equal(imagePath('standard', 'ab12cd34.jpg'), 'files/standard-images/ab12cd34.jpg');
  assert.equal(MAX_IMAGE_BYTES, 20 * 1024 * 1024);
});

test('the five layouts and how many boxes each has', () => {
  assert.deepEqual(Object.keys(FIGURE_LAYOUTS), ['single', 'pair', 'grid4', 'grid21', 'grid12']);
  assert.deepEqual(['single', 'pair', 'grid4', 'grid21', 'grid12', 'nonsense'].map(boxCount), [1, 2, 4, 3, 3, 1]);
  assert.deepEqual(FIGURE_LAYOUTS.grid21, [[0.5, 0.5], [1]]);
  assert.deepEqual(FIGURE_LAYOUTS.grid12, [[1], [0.5, 0.5]]);
});

test('the images a document uses, each once', () => {
  const doc = { blocks: [{ kind: 'paragraph', runs: [] },
    { kind: 'figure', images: [{ src: 'files/report-images/a.png' }, null, { src: 'files/standard-images/b.jpg' }] },
    { kind: 'figure', images: [{ src: 'files/report-images/a.png' }] }] };
  assert.deepEqual(figureSources(doc), ['files/report-images/a.png', 'files/standard-images/b.jpg']);
});
```

- [ ] **Step 3: Run to see them fail**

Run: `node --test test/docgen/images.test.js`
Expected: FAIL — `Cannot find module '…/DocGen/doc-images.js'`.

- [ ] **Step 4: Write `DocGen/doc-images.js`**

```js
/**
 * Images for reports: what a PNG or JPEG file is (sync, from its header) and, for the PDF,
 * its pixels ready to embed (async, see prepareImage). No dependencies: zlib is the
 * platform's DecompressionStream / CompressionStream.
 */

/** The largest image file accepted. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** The boxes of each image layout: rows of widths, as fractions of the text width. */
export const FIGURE_LAYOUTS = Object.freeze({
  single: [[1]],
  pair: [[0.5, 0.5]],
  grid4: [[0.5, 0.5], [0.5, 0.5]],
  grid21: [[0.5, 0.5], [1]],
  grid12: [[1], [0.5, 0.5]],
});
/** @param {string} layout */
export const boxCount = (layout) => (/** @type {any} */ (FIGURE_LAYOUTS)[layout] ?? FIGURE_LAYOUTS.single).flat().length;

/** Where an image file is kept in the data folder. @param {'report'|'standard'|string} source @param {string} file */
export const imagePath = (source, file) => `files/${source === 'standard' ? 'standard-images' : 'report-images'}/${file}`;

const u16 = (/** @type {Uint8Array} */ b, /** @type {number} */ i) => (b[i] << 8) | b[i + 1];
const u32 = (/** @type {Uint8Array} */ b, /** @type {number} */ i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const PNG_SIG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

/**
 * A PNG's or JPEG's type and size in pixels, or null when the bytes are neither (or broken).
 * @param {Uint8Array} bytes
 * @returns {{ type: 'png'|'jpeg', mime: 'image/png'|'image/jpeg', width: number, height: number } | null}
 */
export function imageInfo(bytes) {
  const b = bytes;
  if (!b || b.length < 4) return null;
  if (PNG_SIG.every((v, i) => b[i] === v)) {
    if (b.length < 24 || String.fromCharCode(b[12], b[13], b[14], b[15]) !== 'IHDR') return null;
    const width = u32(b, 16), height = u32(b, 20);
    return width && height ? { type: 'png', mime: 'image/png', width, height } : null;
  }
  if (b[0] === 0xFF && b[1] === 0xD8) {
    const sof = jpegFrame(b);
    return sof ? { type: 'jpeg', mime: 'image/jpeg', width: sof.width, height: sof.height } : null;
  }
  return null;
}

/** A JPEG's frame header: its size and number of colour components. @param {Uint8Array} b */
function jpegFrame(b) {
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xFF) return null;
    const m = b[i + 1];
    if (m === 0xFF) { i++; continue; }
    if (m === 0x01 || (m >= 0xD0 && m <= 0xD9)) { i += 2; continue; }
    const len = u16(b, i + 2);
    // SOF0..SOF15, except DHT (C4), JPG (C8) and DAC (CC).
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      if (i + 10 > b.length) return null;
      const height = u16(b, i + 5), width = u16(b, i + 7), components = b[i + 9];
      return width && height ? { width, height, components } : null;
    }
    i += 2 + len;
  }
  return null;
}

/** Every image a document's figures use, each once, in order. @param {any} doc */
export function figureSources(doc) {
  /** @type {string[]} */
  const out = [];
  for (const b of doc?.blocks ?? []) {
    if (b.kind !== 'figure') continue;
    for (const im of b.images ?? []) if (im && im.src && !out.includes(im.src)) out.push(im.src);
  }
  return out;
}
```

- [ ] **Step 5: Run the tests**

Run: `node --test test/docgen/images.test.js`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add DocGen/doc-images.js test/docgen/image-fixtures.js test/docgen/images.test.js
git commit -m "Report images: read PNG and JPEG sizes, the five layouts, where image files are kept

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Preparing an image for the PDF (`prepareImage`)

**Files:**
- Modify: `DocGen/doc-images.js`
- Test: `test/docgen/images.test.js`

**Interfaces:**
- Consumes: `imageInfo`, `jpegFrame` (Task 1).
- Produces:
  ```
  /** @typedef {{ type: 'png'|'jpeg', mime: string, width: number, height: number, bytes: Uint8Array,
   *   pdf: { filter: 'DCTDecode'|'FlateDecode', colourSpace: 'DeviceRGB'|'DeviceGray'|'DeviceCMYK',
   *          data: Uint8Array, decode?: string, alpha?: Uint8Array } }} PreparedImage */
  prepareImage(bytes: Uint8Array) → Promise<PreparedImage>   // throws Error on anything unreadable
  ```
  `pdf.data` for PNG is the zlib-compressed 8-bit colour samples; `pdf.alpha` (zlib-compressed, one byte per pixel) only when some pixel is not fully opaque. `bytes` is the original file (for HTML).

- [ ] **Step 1: Write the failing tests** (append to `test/docgen/images.test.js`)

```js
import { prepareImage } from '../../DocGen/doc-images.js';

async function inflate(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return [...new Uint8Array(await new Response(s).arrayBuffer())];
}

test('a JPEG goes into the PDF as it is, its colours from its components', async () => {
  const rgb = await prepareImage(makeJpeg(4, 3, 3));
  assert.equal(rgb.pdf.filter, 'DCTDecode');
  assert.equal(rgb.pdf.colourSpace, 'DeviceRGB');
  assert.deepEqual([...rgb.pdf.data], [...makeJpeg(4, 3, 3)]);
  assert.equal((await prepareImage(makeJpeg(4, 3, 1))).pdf.colourSpace, 'DeviceGray');
  const cmyk = await prepareImage(makeJpeg(4, 3, 4));
  assert.equal(cmyk.pdf.colourSpace, 'DeviceCMYK');
  assert.equal(cmyk.pdf.decode, '[1 0 1 0 1 0 1 0]');
});

test('an RGB PNG with every filter gives back its pixels, with no mask', async () => {
  for (const filter of [0, 1, 2, 3, 4]) {
    const png = await makePng({ width: 3, height: 2, filter, sample: (x, y) => [x * 50, y * 100, 7] });
    const p = await prepareImage(png);
    assert.equal(p.pdf.filter, 'FlateDecode');
    assert.equal(p.pdf.colourSpace, 'DeviceRGB');
    assert.deepEqual(await inflate(p.pdf.data), [0, 0, 7, 50, 0, 7, 100, 0, 7, 0, 100, 7, 50, 100, 7, 100, 100, 7], `filter ${filter}`);
    assert.equal(p.pdf.alpha, undefined);
    assert.equal(p.mime, 'image/png');
    assert.deepEqual([...p.bytes], [...png]);
  }
});

test('an RGBA PNG keeps its transparency as a mask', async () => {
  const p = await prepareImage(await makePng({ width: 2, height: 1, colourType: 6, sample: (x) => [255, 0, 0, x ? 0 : 255] }));
  assert.deepEqual(await inflate(p.pdf.data), [255, 0, 0, 255, 0, 0]);
  assert.deepEqual(await inflate(p.pdf.alpha), [255, 0]);
});

test('grey, grey with alpha, low bit depths and 16 bits come out as 8-bit samples', async () => {
  const g1 = await prepareImage(await makePng({ width: 3, height: 1, colourType: 0, bitDepth: 1, sample: (x) => [x % 2] }));
  assert.equal(g1.pdf.colourSpace, 'DeviceGray');
  assert.deepEqual(await inflate(g1.pdf.data), [0, 255, 0]);
  const g4 = await prepareImage(await makePng({ width: 2, height: 1, colourType: 0, bitDepth: 4, sample: (x) => [x ? 15 : 5] }));
  assert.deepEqual(await inflate(g4.pdf.data), [85, 255]);
  const ga = await prepareImage(await makePng({ width: 2, height: 1, colourType: 4, sample: (x) => [9, x ? 128 : 255] }));
  assert.deepEqual(await inflate(ga.pdf.data), [9, 9]);
  assert.deepEqual(await inflate(ga.pdf.alpha), [255, 128]);
  const deep = await prepareImage(await makePng({ width: 1, height: 1, bitDepth: 16, sample: () => [0x1234, 0xFF00, 0x00FF] }));
  assert.deepEqual(await inflate(deep.pdf.data), [0x12, 0xFF, 0x00]);
});

test('a paletted PNG becomes RGB, a transparent index becomes the mask', async () => {
  const p = await prepareImage(await makePng({ width: 3, height: 1, colourType: 3, bitDepth: 2, palette: [[10, 20, 30], [40, 50, 60], [70, 80, 90]],
    trns: [0], sample: (x) => [x] }));
  assert.equal(p.pdf.colourSpace, 'DeviceRGB');
  assert.deepEqual(await inflate(p.pdf.data), [10, 20, 30, 40, 50, 60, 70, 80, 90]);
  assert.deepEqual(await inflate(p.pdf.alpha), [0, 255, 255]);
});

test('a colour key in tRNS makes those grey or RGB pixels transparent', async () => {
  const g = await prepareImage(await makePng({ width: 2, height: 1, colourType: 0, trns: [0, 7], sample: (x) => [x ? 7 : 8] }));
  assert.deepEqual(await inflate(g.pdf.alpha), [255, 0]);
  const c = await prepareImage(await makePng({ width: 2, height: 1, colourType: 2, trns: [0, 1, 0, 2, 0, 3], sample: (x) => (x ? [1, 2, 3] : [1, 2, 4]) }));
  assert.deepEqual(await inflate(c.pdf.alpha), [255, 0]);
});

test('an interlaced PNG gives the same pixels as a plain one', async () => {
  const sample = (x, y) => [x * 20, y * 30, (x + y) % 256];
  const plain = await prepareImage(await makePng({ width: 9, height: 7, sample }));
  const laced = await prepareImage(await makePng({ width: 9, height: 7, interlace: true, filter: 4, sample }));
  assert.deepEqual(await inflate(laced.pdf.data), await inflate(plain.pdf.data));
});

test('a broken PNG or an unknown file is refused', async () => {
  const png = await makePng({ width: 3, height: 2, sample: () => [1, 2, 3] });
  await assert.rejects(prepareImage(png.slice(0, png.length - 20)));
  await assert.rejects(prepareImage(new TextEncoder().encode('not an image at all')), /Only PNG and JPEG images can be used/);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/docgen/images.test.js`
Expected: FAIL — `prepareImage` is not exported.

- [ ] **Step 3: Implement `prepareImage`** (append to `DocGen/doc-images.js`)

```js
/** zlib in or out, through the platform's streams. @param {Uint8Array} data @param {boolean} inflate */
async function zlib(data, inflate) {
  const s = new Blob([data]).stream().pipeThrough(inflate ? new DecompressionStream('deflate') : new CompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/**
 * @typedef {{ type: 'png'|'jpeg', mime: string, width: number, height: number, bytes: Uint8Array,
 *   pdf: { filter: 'DCTDecode'|'FlateDecode', colourSpace: 'DeviceRGB'|'DeviceGray'|'DeviceCMYK',
 *          data: Uint8Array, decode?: string, alpha?: Uint8Array } }} PreparedImage
 */

/**
 * An image ready for the PDF: a JPEG as it is; a PNG decoded to 8-bit grey or RGB samples
 * (zlib-compressed again) with its transparency, if it has any, as a separate mask.
 * @param {Uint8Array} bytes
 * @returns {Promise<PreparedImage>}
 */
export async function prepareImage(bytes) {
  const info = imageInfo(bytes);
  if (!info) throw new Error('Only PNG and JPEG images can be used');
  if (info.type === 'jpeg') {
    const n = /** @type {{ components: number }} */ (jpegFrame(bytes)).components;
    return { ...info, bytes, pdf: { filter: 'DCTDecode', colourSpace: n === 1 ? 'DeviceGray' : n === 4 ? 'DeviceCMYK' : 'DeviceRGB', data: bytes,
      // Adobe's CMYK JPEGs are stored inverted; nearly every CMYK JPEG is Adobe's.
      ...(n === 4 ? { decode: '[1 0 1 0 1 0 1 0]' } : {}) } };
  }
  const png = await decodePng(bytes);
  return { ...info, bytes, pdf: { filter: 'FlateDecode', colourSpace: png.grey ? 'DeviceGray' : 'DeviceRGB',
    data: await zlib(png.colour, false), ...(png.alpha ? { alpha: await zlib(png.alpha, false) } : {}) } };
}

const CHANNELS = /** @type {Record<number, number>} */ ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 });
const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];

/**
 * A PNG's pixels as 8-bit grey or RGB, one byte a sample, and an 8-bit alpha when any pixel
 * is not fully opaque.
 * @param {Uint8Array} b
 * @returns {Promise<{ grey: boolean, colour: Uint8Array, alpha: Uint8Array | null }>}
 */
async function decodePng(b) {
  const bad = (/** @type {string} */ why) => new Error(`The PNG could not be read: ${why}`);
  let i = 8, width = 0, height = 0, bd = 0, ct = 0, laced = false;
  /** @type {Uint8Array | null} */ let plte = null;
  /** @type {Uint8Array | null} */ let trns = null;
  /** @type {Uint8Array[]} */ const idat = [];
  let ended = false;
  while (i + 8 <= b.length) {
    const len = u32(b, i), type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    if (i + 12 + len > b.length) throw bad('it ends part-way through');
    const data = b.subarray(i + 8, i + 8 + len);
    if (type === 'IHDR') { width = u32(data, 0); height = u32(data, 4); bd = data[8]; ct = data[9]; laced = data[12] === 1; }
    else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') { ended = true; break; }
    i += 12 + len;
  }
  if (!ended || !idat.length) throw bad('it ends part-way through');
  const ch = CHANNELS[ct];
  if (!ch || ![1, 2, 4, 8, 16].includes(bd) || (ct === 3 && !plte)) throw bad('its colour type is not one PNG allows');
  const joined = new Uint8Array(idat.reduce((s, d) => s + d.length, 0));
  let at = 0;
  for (const d of idat) { joined.set(d, at); at += d.length; }
  let raw;
  try { raw = await zlib(joined, true); } catch { throw bad('its picture data is damaged'); }

  const bitsPx = ch * bd, bpp = Math.max(1, Math.ceil(bitsPx / 8));
  const grey = ct === 0 || ct === 4;
  const outCh = grey ? 1 : 3;
  const colour = new Uint8Array(width * height * outCh);
  const alpha = new Uint8Array(width * height).fill(255);
  let translucent = false;
  const max = (1 << Math.min(bd, 8)) - 1;
  // The colour key, at the image's own bit depth (tRNS for types 0 and 2).
  const key = trns && ct === 0 ? [u16(trns, 0)] : trns && ct === 2 ? [u16(trns, 0), u16(trns, 2), u16(trns, 4)] : null;
  let pos = 0;

  /** Unfilter w×h pixels from `raw` at `pos`, placing pixel (i, j) at put(i, j). */
  const pass = (/** @type {number} */ w, /** @type {number} */ h, /** @type {(i: number, j: number) => number} */ put) => {
    const stride = Math.ceil((w * bitsPx) / 8);
    let prev = new Uint8Array(stride);
    for (let j = 0; j < h; j++) {
      if (pos + 1 + stride > raw.length) throw bad('its picture data is short');
      const f = raw[pos], row = raw.slice(pos + 1, pos + 1 + stride);
      pos += 1 + stride;
      for (let k = 0; k < stride; k++) {
        const a = k >= bpp ? row[k - bpp] : 0, up = prev[k], c = k >= bpp ? prev[k - bpp] : 0;
        if (f === 1) row[k] = (row[k] + a) & 255;
        else if (f === 2) row[k] = (row[k] + up) & 255;
        else if (f === 3) row[k] = (row[k] + ((a + up) >> 1)) & 255;
        else if (f === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); row[k] = (row[k] + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c)) & 255; }
        else if (f !== 0) throw bad('a row has an unknown filter');
      }
      for (let x = 0; x < w; x++) {
        /** @type {number[]} */ const s = [];
        for (let n = 0; n < ch; n++) {
          const bit = (x * ch + n) * bd;
          s.push(bd === 16 ? (row[bit >> 3] << 8) | row[(bit >> 3) + 1] : bd === 8 ? row[bit >> 3] : (row[bit >> 3] >> (8 - bd - (bit & 7))) & max);
        }
        const px = put(x, j);
        const to8 = (/** @type {number} */ v) => (bd === 16 ? v >> 8 : bd === 8 ? v : Math.round((v * 255) / max));
        let a8 = 255;
        if (ct === 3) {
          const p = /** @type {Uint8Array} */ (plte), idx = s[0];
          colour.set([p[idx * 3] ?? 0, p[idx * 3 + 1] ?? 0, p[idx * 3 + 2] ?? 0], px * 3);
          if (trns && idx < trns.length) a8 = trns[idx];
        } else {
          for (let n = 0; n < outCh; n++) colour[px * outCh + n] = to8(s[n]);
          if (ct === 4 || ct === 6) a8 = to8(s[ch - 1]);
          else if (key && key.every((v, n) => v === s[n])) a8 = 0;
        }
        alpha[px] = a8;
        if (a8 !== 255) translucent = true;
      }
      prev = row;
    }
  };
  if (laced) {
    for (const [x0, y0, dx, dy] of ADAM7) {
      const w = Math.ceil((width - x0) / dx), h = Math.ceil((height - y0) / dy);
      if (w > 0 && h > 0) pass(w, h, (x, y) => (y0 + y * dy) * width + x0 + x * dx);
    }
  } else pass(width, height, (x, y) => y * width + x);
  return { grey, colour, alpha: translucent ? alpha : null };
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/docgen/images.test.js`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add DocGen/doc-images.js test/docgen/images.test.js
git commit -m "Report images: PNG decoding (every filter, bit depth, palette, transparency, interlace) and JPEG pass-through for the PDF

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Loading a document's images and data URIs

**Files:**
- Modify: `DocGen/doc-images.js`
- Test: `test/docgen/images.test.js`

**Interfaces:**
- Consumes: `figureSources`, `prepareImage`.
- Produces:
  - `loadImages(doc, read: (path: string) => Promise<Uint8Array | null>) → Promise<Record<string, PreparedImage | null>>` — every source in the document, `null` for one that is missing or unreadable. Never rejects.
  - `dataUri(img: { mime: string, bytes: Uint8Array }) → string`

- [ ] **Step 1: Write the failing tests**

```js
import { loadImages, dataUri } from '../../DocGen/doc-images.js';

test('loading a document\'s images: present ones prepared, missing and broken ones null', async () => {
  const png = await makePng({ width: 2, height: 2, sample: () => [1, 2, 3] });
  const files = { 'files/report-images/a.png': png, 'files/report-images/broken.png': png.slice(0, 30) };
  const doc = { blocks: [{ kind: 'figure', images: [{ src: 'files/report-images/a.png' }, { src: 'files/report-images/gone.png' }, { src: 'files/report-images/broken.png' }] }] };
  const read = async (p) => files[p] ?? null;
  const got = await loadImages(doc, read);
  assert.deepEqual(Object.keys(got).sort(), ['files/report-images/a.png', 'files/report-images/broken.png', 'files/report-images/gone.png']);
  assert.equal(got['files/report-images/a.png'].width, 2);
  assert.equal(got['files/report-images/gone.png'], null);
  assert.equal(got['files/report-images/broken.png'], null);
  const throwing = await loadImages(doc, async () => { throw new Error('denied'); });
  assert.equal(throwing['files/report-images/a.png'], null);
});

test('a data URI carries the original file', () => {
  assert.equal(dataUri({ mime: 'image/png', bytes: new Uint8Array([1, 2, 255]) }), 'data:image/png;base64,AQL/');
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/docgen/images.test.js`
Expected: FAIL — `loadImages` is not exported.

- [ ] **Step 3: Implement** (append to `DocGen/doc-images.js`)

```js
/**
 * Every image a document uses, read and prepared; null for one missing or unreadable, so the
 * report is still made, with a placeholder in its place.
 * @param {any} doc @param {(path: string) => Promise<Uint8Array | null>} read
 * @returns {Promise<Record<string, PreparedImage | null>>}
 */
export async function loadImages(doc, read) {
  /** @type {Record<string, PreparedImage | null>} */
  const out = {};
  await Promise.all(figureSources(doc).map(async (src) => {
    try {
      const bytes = await read(src);
      out[src] = bytes ? await prepareImage(bytes) : null;
    } catch {
      out[src] = null;
    }
  }));
  return out;
}

/** The original file as a data: URI, for the HTML. @param {{ mime: string, bytes: Uint8Array }} img */
export function dataUri(img) {
  let s = '';
  for (let i = 0; i < img.bytes.length; i += 0x8000) s += String.fromCharCode(...img.bytes.subarray(i, i + 0x8000));
  return `data:${img.mime};base64,${btoa(s)}`;
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/docgen/images.test.js`
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
git add DocGen/doc-images.js test/docgen/images.test.js
git commit -m "Report images: load a document's images (missing ones as null) and data URIs for HTML

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The Style's Images settings

**Files:**
- Modify: `DocGen/doc-style.js` (STANDARD after `tables`; `normaliseStyle` after `tables`; the returned `style`)
- Test: `test/docgen/style.test.js`

**Interfaces:**
- Produces: `style.images = { border: 'none'|'line', borderWidth: number (0.25–6), borderColour: '#rrggbb', captionPosition: 'above'|'below', align: 'left'|'centre' }`. Standard: `{ border: 'none', borderWidth: 0.5, borderColour: '#999999', captionPosition: 'below', align: 'centre' }`.

- [ ] **Step 1: Write the failing test** (append to `test/docgen/style.test.js`)

```js
test('Images: a border, its weight and colour, where the caption goes, and alignment', () => {
  assert.deepEqual(normaliseStyle({}).style.images, { border: 'none', borderWidth: 0.5, borderColour: '#999999', captionPosition: 'below', align: 'centre' });
  const r = normaliseStyle({ images: { border: 'line', borderWidth: 9, borderColour: '#1F4E79', captionPosition: 'above', align: 'left' } });
  assert.deepEqual(r.style.images, { border: 'line', borderWidth: 6, borderColour: '#1f4e79', captionPosition: 'above', align: 'left' });
  assert.ok(r.held.some((h) => /Image border weight/.test(h)));
  assert.equal(normaliseStyle({ images: { border: 'dotted' } }).style.images.border, 'none');
});
```

(`normaliseStyle` is already imported at the top of `style.test.js`; check with `grep -n "^import" test/docgen/style.test.js`.)

- [ ] **Step 2: Run to see it fail**

Run: `node --test test/docgen/style.test.js`
Expected: FAIL — `style.images` is undefined.

- [ ] **Step 3: Implement**

In `STANDARD`, after the `tables: { … },` entry:

```js
  images: { border: 'none', borderWidth: 0.5, borderColour: '#999999', captionPosition: 'below', align: 'centre' },
```

In `normaliseStyle`, after the `const tables = { … };` statement:

```js
  const im = r.images ?? {}, imd = S.images;
  const images = {
    border: pick(im.border, imd.border, ['none', 'line'], 'Image border'),
    borderWidth: num(im.borderWidth, imd.borderWidth, 0.25, 6, 'Image border weight'),
    borderColour: colour(im.borderColour, imd.borderColour, 'Image border colour'),
    captionPosition: pick(im.captionPosition, imd.captionPosition, ['above', 'below'], 'Image caption position'),
    align: pick(im.align, imd.align, ['left', 'centre'], 'Image alignment'),
  };
```

and in the returned `style` object change `page: { paper, orientation, margins }, text, tables, headerFooter,` to `page: { paper, orientation, margins }, text, tables, images, headerFooter,`.

- [ ] **Step 4: Run the style tests and the full DocGen tests**

Run: `node --test test/docgen/*.test.js`
Expected: PASS. (If a test compares a whole normalised Style to a literal, add the `images` entry to that literal — that is the only kind of breakage expected.)

- [ ] **Step 5: Commit**

```bash
git add DocGen/doc-style.js test/docgen/style.test.js
git commit -m "Styles: Images settings (border, weight, colour, caption position, alignment)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Laying out figures (`doc-figure.js`)

**Files:**
- Create: `DocGen/doc-figure.js`
- Modify: `DocGen/doc-layout.js` (export `ASCENT` and `EPS`; `layout(doc, style, assets)`; `flow(…, assets)`; the `figure` branch)
- Test: `test/docgen/layout-figures.test.js`

**Interfaces:**
- Consumes: `FIGURE_LAYOUTS` (Task 1), `style.images` (Task 4), `textStyle`, `atomsOf`, `breakLines`, `lineItems`, `MM` from `doc-layout.js`.
- Produces:
  - Document block: `{ kind: 'figure', layout: string, anchor?: string, caption: { runs } | null, images: Array<{ src: string, name: string, width: number /* fraction of the text width, 0–1 */, border: boolean, caption: { runs } | null, anchor?: string } | null> }`
  - `layout(doc, style, assets?: { images?: Record<string, { width: number, height: number } | { pending: true } | null> })` — a source absent from `assets.images` or `null` is missing.
  - Page item: `{ kind: 'image', x, y, w, h, src }` (points, top-left origin). Borders are `rule` items; the placeholder is a `fill`, four `rule`s and `text`.
  - `GAP_MM = 4` (space between boxes), exported from `doc-figure.js`.

- [ ] **Step 1: Write the failing tests** (`test/docgen/layout-figures.test.js`)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, MM } from '../../DocGen/doc-layout.js';
import { normaliseStyle } from '../../DocGen/doc-style.js';
import { GAP_MM } from '../../DocGen/doc-figure.js';

const style = (images = {}) => normaliseStyle({ images, page: { margins: { top: 20, bottom: 20, left: 20, right: 20 } } }).style;
const W = (595.276 - 40 * MM);          // A4 text width in points
const img = (src, o = {}) => ({ src, name: src.split('/').pop(), width: 1, border: true, caption: null, ...o });
const sizes = { 'a.png': { width: 400, height: 200 }, 'b.png': { width: 100, height: 100 }, 'c.png': { width: 300, height: 600 } };
const images = (p) => p.items.filter((it) => it.kind === 'image');
const texts = (p) => p.items.filter((it) => it.kind === 'text').map((t) => t.text).join(' ');

test('a single image fills the text width at its own shape, centred', () => {
  const r = layout({ blocks: [{ kind: 'figure', layout: 'single', caption: null, images: [img('a.png')] }] }, style(), { images: sizes });
  const [im] = images(r.pages[0]);
  assert.equal(Math.round(im.w), Math.round(W));
  assert.equal(Math.round(im.h), Math.round(W / 2));
  assert.equal(im.src, 'a.png');
});

test('the width is a share of the text width, never wider than its box; centre or left', () => {
  const half = layout({ blocks: [{ kind: 'figure', layout: 'single', caption: null, images: [img('b.png', { width: 0.5 })] }] }, style(), { images: sizes });
  const [c] = images(half.pages[0]);
  assert.equal(Math.round(c.w), Math.round(W / 2));
  assert.equal(Math.round(c.x), Math.round(20 * MM + W / 4));
  const left = layout({ blocks: [{ kind: 'figure', layout: 'single', caption: null, images: [img('b.png', { width: 0.5 })] }] }, style({ align: 'left' }), { images: sizes });
  assert.equal(Math.round(images(left.pages[0])[0].x), Math.round(20 * MM));
  const pair = layout({ blocks: [{ kind: 'figure', layout: 'pair', caption: null, images: [img('b.png'), img('b.png')] }] }, style(), { images: sizes });
  const [p1, p2] = images(pair.pages[0]);
  const cell = W / 2 - GAP_MM * MM / 2;
  assert.equal(Math.round(p1.w), Math.round(cell));
  assert.equal(Math.round(p2.x - p1.x), Math.round(cell + GAP_MM * MM));
  assert.equal(p1.y, p2.y);
});

test('each layout places its boxes in rows of its shape; an empty box keeps its place', () => {
  const at = (layoutName, n) => images(layout({ blocks: [{ kind: 'figure', layout: layoutName, caption: null,
    images: Array.from({ length: n }, (_, k) => (k === 1 ? null : img('b.png'))) }] }, style(), { images: sizes }).pages[0]);
  const rows = (items) => [...new Set(items.map((i) => Math.round(i.y)))].length;
  assert.equal(at('grid4', 4).length, 3);                 // box 2 empty
  assert.equal(rows(at('grid4', 4)), 2);
  const g21 = at('grid21', 3);                            // top row: one image (box 2 empty); bottom: full width
  assert.equal(rows(g21), 2);
  assert.equal(Math.round(g21[1].w), Math.round(W));
  const g12 = images(layout({ blocks: [{ kind: 'figure', layout: 'grid12', caption: null, images: [img('b.png'), img('b.png'), img('b.png')] }] }, style(), { images: sizes }).pages[0]);
  assert.equal(Math.round(g12[0].w), Math.round(W));
  assert.ok(g12[1].y > g12[0].y && g12[1].y === g12[2].y);
});

test('one caption under the whole figure, or above it, or a caption under each image', () => {
  const one = { kind: 'figure', layout: 'pair', caption: { runs: [{ text: 'Figure 1: Both' }] }, images: [img('b.png'), img('b.png')] };
  const below = layout({ blocks: [one] }, style(), { images: sizes }).pages[0];
  const capY = below.items.find((it) => it.kind === 'text' && /Figure/.test(it.text)).y;
  assert.ok(capY > images(below)[0].y + images(below)[0].h);
  const above = layout({ blocks: [one] }, style({ captionPosition: 'above' }), { images: sizes }).pages[0];
  assert.ok(above.items.find((it) => it.kind === 'text' && /Figure/.test(it.text)).y < images(above)[0].y);
  const sep = layout({ blocks: [{ kind: 'figure', layout: 'pair', caption: null, images: [
    img('b.png', { caption: { runs: [{ text: 'Figure 1: Left' }] }, anchor: 'fig-l' }), img('b.png', { caption: { runs: [{ text: 'Figure 2: Right' }] }, anchor: 'fig-r' })] }] },
    style(), { images: sizes });
  assert.match(texts(sep.pages[0]), /Figure 1: Left.*Figure 2: Right/);
  assert.ok(sep.anchors['fig-l'] && sep.anchors['fig-r']);
});

test('a border is four lines in the Style\'s weight and colour, unless the image has none', () => {
  const s = style({ border: 'line', borderWidth: 1, borderColour: '#ff0000' });
  const p = layout({ blocks: [{ kind: 'figure', layout: 'pair', caption: null, images: [img('b.png'), img('b.png', { border: false })] }] }, s, { images: sizes }).pages[0];
  const rules = p.items.filter((it) => it.kind === 'rule');
  assert.equal(rules.length, 4);
  assert.ok(rules.every((r) => r.width === 1 && r.colour === '#ff0000'));
  const none = layout({ blocks: [{ kind: 'figure', layout: 'single', caption: null, images: [img('b.png')] }] }, style(), { images: sizes }).pages[0];
  assert.equal(none.items.filter((it) => it.kind === 'rule').length, 0);
});

test('a figure that does not fit moves to the next page with its caption', () => {
  const blocks = [{ kind: 'space', mm: 230 }, { kind: 'figure', layout: 'single', anchor: 'fig-x', caption: { runs: [{ text: 'Figure 1: Wide' }] }, images: [img('a.png')] }];
  const r = layout({ blocks }, style(), { images: sizes });
  assert.equal(r.pages.length, 2);
  assert.equal(images(r.pages[1]).length, 1);
  assert.match(texts(r.pages[1]), /Figure 1: Wide/);
  assert.equal(r.anchors['fig-x'].page, 1);
});

test('a figure taller than the page is scaled to fit on one page', () => {
  const tall = { 'c.png': { width: 100, height: 2000 } };
  const r = layout({ blocks: [{ kind: 'figure', layout: 'grid4', caption: { runs: [{ text: 'Figure 1: Tall' }] }, images: [img('c.png'), img('c.png'), img('c.png'), img('c.png')] }] }, style(), { images: tall });
  assert.equal(r.pages.length, 1);
  const ims = images(r.pages[0]);
  assert.equal(ims.length, 4);
  const textH = 841.89 - 40 * MM;
  assert.ok(Math.max(...ims.map((i) => i.y + i.h)) <= 20 * MM + textH + 0.01);
  assert.match(texts(r.pages[0]), /Figure 1: Tall/);
});

test('a missing image is a grey box with its name; one still loading is a plain box', () => {
  const r = layout({ blocks: [{ kind: 'figure', layout: 'pair', caption: null, images: [img('files/report-images/gone.png'), img('wait.png')] }] }, style(), { images: { 'wait.png': { pending: true } } });
  const p = r.pages[0];
  assert.equal(images(p).length, 0);
  assert.match(texts(p), /Image missing: gone\.png/);
  const fills = p.items.filter((it) => it.kind === 'fill');
  assert.equal(fills.length, 2);
  assert.equal(Math.round(fills[0].h), Math.round(fills[0].w * 0.75));
});

test('a heading just before a figure goes over to the next page with it', () => {
  const blocks = [{ kind: 'space', mm: 225 }, { kind: 'heading', level: 1, runs: [{ text: 'Pictures' }], anchor: 'h' },
    { kind: 'figure', layout: 'single', caption: null, images: [img('a.png')] }];
  const r = layout({ blocks }, style(), { images: sizes });
  assert.equal(r.anchors.h.page, 1);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/docgen/layout-figures.test.js`
Expected: FAIL — `Cannot find module '…/DocGen/doc-figure.js'`.

- [ ] **Step 3: Export `ASCENT` and `EPS` from `doc-layout.js`**

Change lines 6–7 of `DocGen/doc-layout.js`:

```js
export const ASCENT = 0.78;   // of the size: where the baseline sits in a line box
export const EPS = 0.01;
```

- [ ] **Step 4: Write `DocGen/doc-figure.js`**

```js
import { MM, ASCENT, EPS, textStyle, atomsOf, breakLines, lineItems } from './doc-layout.js';
import { FIGURE_LAYOUTS } from './doc-images.js';

/** The space between two boxes of a grid, in millimetres. */
export const GAP_MM = 4;
const PLACEHOLDER_FILL = '#eeeeee';
const PLACEHOLDER_LINE = '#999999';

/**
 * A figure: one image or a grid of them, with one caption or a caption each. Kept whole on
 * one page (moving to the next, heading and all, when it does not fit); scaled down when even
 * a whole page is too short for it.
 * @param {any} b the figure block
 * @param {{ style: any, ctx: any, left: number, W: number, y: number, page: any, pageH: number, images: Record<string, any>,
 *   newPage: () => void, atTop: () => boolean, room: () => number, mark: (name?: string) => void, carryHeading: () => boolean }} f
 */
export function layoutFigure(b, f) {
  const is = f.style.images;
  const gap = GAP_MM * MM;
  const ts = textStyle(f.style, 'caption');
  const align = is.align === 'left' ? 'left' : 'centre';
  const lines = (/** @type {any} */ cap, /** @type {number} */ w) => (cap ? breakLines(atomsOf(cap.runs, ts, f.ctx), w) : []);
  const capH = (/** @type {any[]} */ ls) => (ls.length ? ls.length * ts.leading + ts.spaceBefore : 0);

  const shape = /** @type {number[][]} */ (/** @type {any} */ (FIGURE_LAYOUTS)[b.layout] ?? FIGURE_LAYOUTS.single);
  let k = 0;
  const rows = shape.map((fr) => fr.map((share) => {
    const cw = share * f.W - (gap * (fr.length - 1)) / fr.length;
    const im = (b.images ?? [])[k++] ?? null;
    if (!im) return { im: null, cw, w: 0, h: 0, cap: [] };
    const info = f.images[im.src];
    const w = Math.min(cw, f.W * (im.width > 0 ? Math.min(1, im.width) : 1));
    const ratio = info && info.width > 0 && info.height > 0 ? info.height / info.width : 0.75;
    return { im, info, cw, w, h: w * ratio, cap: lines(im.caption, cw) };
  }));
  const one = lines(b.caption, f.W);
  const imgH = (/** @type {any[]} */ r, /** @type {number} */ s) => Math.max(0, ...r.map((c) => c.h * s));
  const rowCapH = (/** @type {any[]} */ r) => Math.max(0, ...r.map((c) => capH(c.cap)));
  const height = (/** @type {number} */ s) => rows.reduce((a, r, i) => a + (i ? gap : 0) + imgH(r, s) + rowCapH(r), 0) + capH(one);
  // Scaled so the whole figure fits one page's text area when it would not.
  let s = 1;
  if (height(1) > f.pageH) {
    const fixed = height(0);
    s = Math.max(0.05, (f.pageH - fixed) / (height(1) - fixed));
  }
  if (height(s) > f.room() + EPS && !f.atTop() && !f.carryHeading()) f.newPage();

  const above = is.captionPosition === 'above';
  const caption = (/** @type {any[]} */ ls, /** @type {number} */ x, /** @type {number} */ w) => {
    if (!ls.length) return;
    f.y += ts.spaceBefore;
    ls.forEach((ln, i) => {
      f.page.items.push(...lineItems(ln, x, f.y + (ts.leading - ts.size) / 2 + ts.size * ASCENT, w, align, i === ls.length - 1));
      f.y += ts.leading;
    });
  };
  f.mark(b.anchor);
  if (above) caption(one, f.left, f.W);
  rows.forEach((r, i) => {
    if (i) f.y += gap;
    const top = f.y, ih = imgH(r, s), ch = rowCapH(r);
    let x = f.left;
    for (const c of r) {
      if (c.im) {
        const w = c.w * s, h = c.h * s;
        const ix = align === 'centre' ? x + (c.cw - w) / 2 : x;
        f.y = top;
        f.mark(c.im.anchor);
        if (above) { caption(c.cap, x, c.cw); f.y = top + ch; } else f.y = top;
        draw(f, c, ix, f.y, w, h);
        if (!above) { f.y = top + ih; caption(c.cap, x, c.cw); }
      }
      x += c.cw + gap;
    }
    f.y = top + ih + ch;
  });
  if (!above) caption(one, f.left, f.W);
  f.y += 4;
}

/** One image, its border, or its placeholder. @param {any} f @param {any} c @param {number} x @param {number} y @param {number} w @param {number} h */
function draw(f, c, x, y, w, h) {
  const is = f.style.images;
  const box = (/** @type {number} */ width, /** @type {string} */ colour) => {
    f.page.items.push({ kind: 'rule', x1: x, y1: y, x2: x + w, y2: y, width, colour }, { kind: 'rule', x1: x, y1: y + h, x2: x + w, y2: y + h, width, colour },
      { kind: 'rule', x1: x, y1: y, x2: x, y2: y + h, width, colour }, { kind: 'rule', x1: x + w, y1: y, x2: x + w, y2: y + h, width, colour });
  };
  if (c.info && c.info.pending) { f.page.items.push({ kind: 'fill', x, y, w, h, colour: '#f2f2f2' }); return; }
  if (!c.info) {
    f.page.items.push({ kind: 'fill', x, y, w, h, colour: PLACEHOLDER_FILL });
    box(0.5, PLACEHOLDER_LINE);
    const ts = textStyle(f.style, 'caption', { size: 8, italic: false, bold: false, colour: '#555555' });
    const ls = breakLines(atomsOf([{ text: `Image missing: ${c.im.name}` }], ts, f.ctx), Math.max(10, w - 8));
    const startY = y + Math.max(2, (h - ls.length * ts.leading) / 2);
    ls.forEach((ln, i) => {
      if (startY + (i + 1) * ts.leading > y + h) return;
      f.page.items.push(...lineItems(ln, x + 4, startY + i * ts.leading + (ts.leading - ts.size) / 2 + ts.size * ASCENT, w - 8, 'centre', true));
    });
    return;
  }
  f.page.items.push({ kind: 'image', x, y, w, h, src: c.im.src });
  if (is.border === 'line' && c.im.border !== false) box(is.borderWidth, is.borderColour);
}
```

- [ ] **Step 5: Wire it into `doc-layout.js`**

At the top of `DocGen/doc-layout.js` add `import { layoutFigure } from './doc-figure.js';` (a circular import: `doc-figure.js` only calls `doc-layout.js`'s functions when a figure is laid out, after both modules have loaded).

Change `layout`:

```js
/**
 * …existing comment…
 * @param {any} doc @param {any} style a normalised Style
 * @param {{ images?: Record<string, any> }} [assets] the size of each image a figure shows, by source; one not here is missing
 */
export function layout(doc, style, assets = {}) {
```

and inside its loop `res = flow(doc, style, pageOf, assets);`. Change `flow`'s signature to `function flow(doc, style, pageOf, assets)` (with `@param {{ images?: Record<string, any> }} assets` in its JSDoc) and add, after the `table` branch in the block loop:

```js
    else if (b.kind === 'figure') layoutFigure(b, { style, ctx, left, W, get y() { return y; }, set y(v) { y = v; }, get page() { return page; },
      pageH: bottom - top, images: assets.images ?? {}, newPage, atTop, room, mark, carryHeading });
```

- [ ] **Step 6: Run the tests**

Run: `node --test test/docgen/layout-figures.test.js test/docgen/layout.test.js test/docgen/layout-tables.test.js`
Expected: PASS (all). Then `npm run typecheck`; expected: no errors (fix any JSDoc types it reports in the new file).

- [ ] **Step 7: Commit**

```bash
git add DocGen/doc-figure.js DocGen/doc-layout.js test/docgen/layout-figures.test.js
git commit -m "Report layout: figures (five layouts, captions, borders, kept whole, scaled to fit, placeholders)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Images in the PDF

**Files:**
- Modify: `DocGen/doc-pdf.js`, `DocGen/doc-render.js`
- Test: `test/docgen/pdf.test.js`, `test/docgen/render.test.js`

**Interfaces:**
- Consumes: `PreparedImage` (Task 2), `image` page items (Task 5).
- Produces:
  - `writePdf(pages, { …existing, images?: Record<string, PreparedImage | null> })` — each image used is one XObject (plus an `/SMask` object when it has alpha), written once however often drawn; an `image` item without a prepared image is skipped.
  - `renderPdf(doc, style, { date?, images? })` passes `images` to both `layout` (as sizes) and `writePdf`.

- [ ] **Step 1: Write the failing tests**

Append to `test/docgen/pdf.test.js` (it already imports `writePdf` and `readPdf`; check with `grep -n "^import" test/docgen/pdf.test.js`):

```js
import { prepareImage } from '../../DocGen/doc-images.js';
import { makePng, makeJpeg } from './image-fixtures.js';

test('images are XObjects, written once, drawn where the page puts them', async () => {
  const png = await prepareImage(await makePng({ width: 2, height: 1, colourType: 6, sample: (x) => [255, 0, 0, x ? 0 : 255] }));
  const jpg = await prepareImage(makeJpeg(4, 3));
  const pages = [{ size: [595, 842], items: [{ kind: 'image', x: 50, y: 100, w: 200, h: 100, src: 'a.png' }, { kind: 'image', x: 50, y: 300, w: 200, h: 100, src: 'a.png' },
    { kind: 'image', x: 300, y: 100, w: 40, h: 30, src: 'b.jpg' }, { kind: 'image', x: 0, y: 0, w: 10, h: 10, src: 'gone.png' }] }];
  const bytes = writePdf(pages, { images: { 'a.png': png, 'b.jpg': jpg, 'gone.png': null } });
  const s = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  assert.equal((s.match(/\/Subtype \/Image/g) ?? []).length, 3, 'a.png, its mask, b.jpg');
  assert.match(s, /\/Width 2 \/Height 1 \/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/Filter \/FlateDecode \/SMask \d+ 0 R/);
  assert.match(s, /\/ColorSpace \/DeviceGray \/BitsPerComponent 8 \/Filter \/FlateDecode/);
  assert.match(s, /\/Width 4 \/Height 3 \/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/Filter \/DCTDecode/);
  assert.match(s, /\/XObject << \/Im1 \d+ 0 R \/Im2 \d+ 0 R >>/);
  assert.match(s, /q 200 0 0 100 50 642 cm \/Im1 Do Q/);
  assert.match(s, /q 200 0 0 100 50 442 cm \/Im1 Do Q/);
  assert.match(s, /q 40 0 0 30 300 712 cm \/Im2 Do Q/);
  assert.doesNotThrow(() => readPdf(bytes));
});
```

Append to `test/docgen/render.test.js` (check its imports; add these if missing):

```js
import { prepareImage } from '../../DocGen/doc-images.js';
import { makePng } from './image-fixtures.js';

test('renderPdf lays out and draws the images it is given; a missing one is a placeholder', async () => {
  const style = normaliseStyle({}).style;
  const doc = { blocks: [{ kind: 'figure', layout: 'pair', caption: null, images: [
    { src: 'files/report-images/a.png', name: 'a.png', width: 1, border: true, caption: null },
    { src: 'files/report-images/gone.png', name: 'gone.png', width: 1, border: true, caption: null }] }] };
  const a = await prepareImage(await makePng({ width: 4, height: 2, sample: () => [0, 0, 0] }));
  const { bytes } = renderPdf(doc, style, { images: { 'files/report-images/a.png': a, 'files/report-images/gone.png': null } });
  const s = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  assert.equal((s.match(/\/Subtype \/Image/g) ?? []).length, 1);
  assert.match(s, /Image missing: gone\.png/);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/docgen/pdf.test.js test/docgen/render.test.js`
Expected: FAIL — no `/Subtype /Image` in the output.

- [ ] **Step 3: Implement in `DocGen/doc-pdf.js`**

Add a helper after `hex`:

```js
/** Bytes as a string of the same length, one character a byte, for a stream. @param {Uint8Array} b */
function bin(b) {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return s;
}
```

Extend the `opts` JSDoc of `writePdf` with `images?: Record<string, any>`. After `const fontRes = …;` add:

```js
  // Images: one XObject each (and its mask), however many times it is drawn.
  const imgs = opts.images ?? {};
  /** @type {string[]} */
  const used_ = [];
  for (const p of pages) for (const it of p.items) if (it.kind === 'image' && imgs[it.src] && !used_.includes(it.src)) used_.push(it.src);
  /** @type {Record<string, string>} */
  const imgName = {};
  const xobjRes = used_.map((src, i) => {
    const im = imgs[src].pdf, w = imgs[src].width, h = imgs[src].height;
    let smask = '';
    if (im.alpha) {
      const m = reserve();
      set(m, `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${im.alpha.length} >>\nstream\n${bin(im.alpha)}\nendstream`);
      smask = ` /SMask ${m} 0 R`;
    }
    const n = reserve();
    set(n, `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /${im.colourSpace} /BitsPerComponent 8 /Filter /${im.filter}${smask}` +
      `${im.decode ? ` /Decode ${im.decode}` : ''} /Length ${im.data.length} >>\nstream\n${bin(im.data)}\nendstream`);
    imgName[src] = `Im${i + 1}`;
    return `/Im${i + 1} ${n} 0 R`;
  }).join(' ');
```

In the page loop add, after the `text` branch:

```js
      else if (it.kind === 'image' && imgName[it.src]) ops.push(`q ${num(it.w)} 0 0 ${num(it.h)} ${num(it.x)} ${num(h - it.y - it.h)} cm /${imgName[it.src]} Do Q`);
```

and change the page's resources from `/Resources << /Font << ${fontRes} >> >>` to `/Resources << /Font << ${fontRes} >>${xobjRes ? ` /XObject << ${xobjRes} >>` : ''} >>`.

The image objects must be reserved **before** `pageObjs` so object numbers stay in creation order; put the block above `const pageObjs = …`.

- [ ] **Step 4: Implement in `DocGen/doc-render.js`**

```js
/**
 * A document as a PDF: laid out, then written, with bookmarks from its headings.
 * `images` are the document's images, prepared (doc-images loadImages); one missing is a placeholder.
 * @param {any} doc @param {any} style a normalised Style @param {{ date?: string, images?: Record<string, any> }} [opts]
 */
export function renderPdf(doc, style, opts = {}) {
  const r = layout(doc, style, { images: opts.images ?? {} });
  const bytes = writePdf(r.pages, { title: doc.meta?.title || doc.title || '', anchors: r.anchors, outline: r.headings, date: opts.date, images: opts.images ?? {} });
  return { bytes, replaced: r.replaced, pages: r.pages.length };
}
```

- [ ] **Step 5: Run the tests**

Run: `node --test test/docgen/*.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add DocGen/doc-pdf.js DocGen/doc-render.js test/docgen/pdf.test.js test/docgen/render.test.js
git commit -m "PDF: images as XObjects with soft masks, each written once; renderPdf takes the document's images

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Images in the page preview

**Files:**
- Modify: `DocGen/doc-preview.js`, `DocGen/doc-designer.css`
- Test: `test/docgen/preview.test.js`

**Interfaces:**
- Produces: `pagesHtml(pages, { …existing, imageUrl?: (src: string) => string | null })` draws an `image` item as `<img class="dp-image" …>` (or a grey `dp-fill` box when `imageUrl` gives nothing); `cropPage` keeps an image that overlaps the band, moved up by `top`.

- [ ] **Step 1: Write the failing tests** (append to `test/docgen/preview.test.js`; check its imports include `pagesHtml` and `cropPage`)

```js
test('an image is drawn from the URL the designer gives, or as a grey box', () => {
  const page = { size: [100, 100], items: [{ kind: 'image', x: 10, y: 20, w: 30, h: 15, src: 'files/report-images/a.png' }] };
  assert.match(pagesHtml([page], { imageUrl: () => 'blob:x' }), /<img class="dp-image" src="blob:x" alt="" style="left:10px;top:20px;width:30px;height:15px">/);
  assert.match(pagesHtml([page], { scale: 2 }), /class="dp-fill" style="left:20px;top:40px;width:60px;height:30px;background:#eeeeee"/);
});

test('a band keeps the images that overlap it', () => {
  const page = { size: [100, 300], items: [{ kind: 'image', x: 0, y: 50, w: 10, h: 40, src: 'a' }, { kind: 'image', x: 0, y: 200, w: 10, h: 10, src: 'b' }] };
  const band = cropPage(page, 60, 150);
  assert.deepEqual(band.items, [{ kind: 'image', x: 0, y: -10, w: 10, h: 40, src: 'a' }]);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/docgen/preview.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `pagesHtml`, extend the options JSDoc with `imageUrl?: (src: string) => string | null` and add before the `link` branch:

```js
    if (it.kind === 'image') {
      const u = o.imageUrl ? o.imageUrl(it.src) : null;
      const box = `left:${px(it.x * k)};top:${px(it.y * k)};width:${px(it.w * k)};height:${px(it.h * k)}`;
      return u ? `<img class="dp-image" src="${esc(u)}" alt="" style="${box}">` : `<div class="dp-fill" style="${box};background:#eeeeee"></div>`;
    }
```

In `cropPage`, before the `fill` branch:

```js
    if (it.kind === 'image') { if (it.y < bottom && it.y + it.h > top) items.push({ ...it, y: it.y - top }); continue; }
```

In `DocGen/doc-designer.css`, after the `.docgen .dp-fill, …` rule add:

```css
  .docgen .dp-image { position: absolute; display: block; object-fit: fill;}
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/docgen/preview.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add DocGen/doc-preview.js DocGen/doc-designer.css test/docgen/preview.test.js
git commit -m "Page preview: images drawn from the designer's URLs, a grey box until one is there; kept in section bands

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Images in the HTML

**Files:**
- Modify: `DocGen/doc-html.js`
- Test: `test/docgen/html.test.js`

**Interfaces:**
- Consumes: `FIGURE_LAYOUTS`, `dataUri` (Tasks 1, 3), `style.images` (Task 4).
- Produces: `renderHtml(doc, style, { images?: Record<string, PreparedImage | null> })`; a figure is `<div class="figure">` with one `<div class="fig-row">` per layout row (CSS grid), each image a `<figure class="fig-cell">` holding `<img src="data:…">` (or `<div class="fig-missing">Image missing: name</div>`) and its `<figcaption>`; one caption is a `<p class="caption fig-caption">` before or after the rows. Anchors are `id`s.

- [ ] **Step 1: Write the failing test** (append to `test/docgen/html.test.js`)

```js
import { prepareImage } from '../../DocGen/doc-images.js';
import { makePng } from './image-fixtures.js';

test('figures are embedded images in grid rows, with figcaptions, anchors and the Style\'s border', async () => {
  const style = normaliseStyle({ images: { border: 'line', borderWidth: 1, borderColour: '#ff0000', captionPosition: 'above', align: 'left' } }).style;
  const a = await prepareImage(await makePng({ width: 2, height: 2, sample: () => [1, 2, 3] }));
  const doc = { blocks: [
    { kind: 'figure', layout: 'grid21', anchor: 'fig-p1', caption: { runs: [{ text: 'Figure 1: All' }] }, images: [
      { src: 'a', name: 'a.png', width: 0.25, border: true, caption: null }, null, { src: 'gone', name: 'gone.png', width: 1, border: false, caption: null }] },
    { kind: 'figure', layout: 'single', caption: null, images: [{ src: 'a', name: 'a.png', width: 1, border: false, caption: { runs: [{ text: 'Figure 2: Own' }] }, anchor: 'fig-p2-1' }] }] };
  const html = renderHtml(doc, style, { images: { a, gone: null } });
  assert.match(html, /<div class="figure" id="fig-p1"><p class="caption fig-caption">Figure 1: All<\/p><div class="fig-row" style="grid-template-columns:1fr 1fr">/);
  assert.match(html, /<img class="bordered" src="data:image\/png;base64,[A-Za-z0-9+/=]+" alt="a\.png" style="width:50%">/);
  assert.match(html, /<div class="fig-cell"><\/div>/);
  assert.match(html, /<div class="fig-missing">Image missing: gone\.png<\/div>/);
  assert.match(html, /<figure class="fig-cell" id="fig-p2-1"><figcaption class="caption">Figure 2: Own<\/figcaption><img src="data:image\/png/);
  assert.match(html, /\.fig-cell img\.bordered \{ border: 1pt solid #ff0000; \}/);
  assert.match(html, /\.figure \{[^}]*text-align: left;/);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `node --test test/docgen/html.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement in `DocGen/doc-html.js`**

Add at the top: `import { FIGURE_LAYOUTS, dataUri } from './doc-images.js';`.

In `css(s)`, before the `.page-break` entries, add:

```js
    `.figure { margin: 6pt 0; break-inside: avoid; text-align: ${s.images.align === 'left' ? 'left' : 'center'}; }`,
    '.fig-row { display: grid; gap: 4mm; margin-bottom: 4mm; }', '.fig-cell { margin: 0; }', '.fig-cell img { max-width: 100%; height: auto; }',
    `.fig-cell img.bordered { border: ${s.images.borderWidth}pt solid ${s.images.borderColour}; }`,
    '.fig-missing { display: inline-block; width: 100%; aspect-ratio: 4 / 3; background: #eeeeee; border: 0.5pt solid #999999; color: #555555; font-size: 8pt; }',
```

Change the signature to `export function renderHtml(doc, style, opts = {})` (JSDoc: `@param {{ images?: Record<string, any> }} [opts]`), and add a branch before `toc`:

```js
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
        const pic = got ? `<img${im.border ? ' class="bordered"' : ''} src="${dataUri(got)}" alt="${esc(im.name)}" style="width:${pct}%">`
          : `<div class="fig-missing">Image missing: ${esc(im.name)}</div>`;
        const cap = im.caption ? `<figcaption class="caption">${runsHtml(im.caption.runs)}</figcaption>` : '';
        return `<figure class="fig-cell"${im.anchor ? ` id="${esc(im.anchor)}"` : ''}>${above ? cap : ''}${pic}${above ? '' : cap}</figure>`;
      }).join('') + '</div>').join('');
      const one = b.caption ? `<p class="caption fig-caption">${runsHtml(b.caption.runs)}</p>` : '';
      return `<div class="figure"${id}>${above ? one : ''}${rows}${above ? '' : one}</div>`;
    }
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/docgen/html.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add DocGen/doc-html.js test/docgen/html.test.js
git commit -m "HTML: figures as embedded images in grid rows with figcaptions and the Style's border

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Image parts become numbered, linkable figures (designer's document builder)

**Files:**
- Modify: `DocGen/doc-designer.js` (`tableRef`/`refIndex`/`refResolver`/`refTargets` near lines 575–635; `buildDocument` near 1418–1515; the import line 1–5)
- Test: `test/docgen/builder.test.js`

**Interfaces:**
- Consumes: `boxCount`, `imagePath` (Task 1); the figure block shape (Task 5).
- Produces:
  - Image part: `{ id, kind: 'image', layout: 'single'|'pair'|'grid4'|'grid21'|'grid12', captions: 'one'|'separate'|'none', caption: string, images: Array<{ source: 'report'|'standard', file: string, name: string, width?: number /* % 5–100 */, noBorder?: boolean, caption?: string } | null> }`
  - Figure ids for links: the part id (one caption) or `<partId>.<n>` (separate, n from 1); anchors `App.md.anchor('fig-' + id)`.
  - `refTargets(resolved, tables, figures)` and `refIndex(…)` gain a `figures` list `{ id, number, caption, anchor }`; a figure target has `kind: 'figure'`, `label: 'Figure 2: Caption'`, `numberLabel: 'Figure 2'`, `titleLabel: caption || 'Figure 2'`.

- [ ] **Step 1: Write the failing tests** (append to `test/docgen/builder.test.js`)

```js
const pic = (file, o = {}) => ({ source: 'report', file, name: file, ...o });

test('image parts are figures, numbered apart from tables, with one caption or one each', () => {
  const { document, refs } = build({ sections: [{ id: 'c1', title: 'Pictures', parts: [
    { id: 'i1', kind: 'image', layout: 'pair', captions: 'one', caption: 'Both of them', images: [pic('a.png', { width: 40 }), pic('b.png', { source: 'standard', noBorder: true })] },
    { id: 't1', kind: 'table', caption: 'A table', header: ['A'], rows: [['1']] },
    { id: 'i2', kind: 'image', layout: 'grid4', captions: 'separate', caption: '', images: [pic('c.png', { caption: 'Third' }), null, pic('d.png')] },
    { id: 'i3', kind: 'image', layout: 'single', captions: 'none', images: [pic('e.png')] },
    { id: 'i4', kind: 'image', layout: 'single', captions: 'one', caption: 'Empty', images: [null] },
  ] }], order: ['c1'] });
  const figs = document.blocks.filter((b) => b.kind === 'figure');
  assert.equal(figs.length, 3, 'a block with no image is left out');
  assert.equal(plain(figs[0].caption.runs), 'Figure 1: Both of them');
  assert.equal(figs[0].anchor, 'fig-i1');
  assert.deepEqual(figs[0].images.map((i) => [i.src, i.width, i.border]), [['files/report-images/a.png', 0.4, true], ['files/standard-images/b.png', 1, false]]);
  assert.equal(figs[1].caption, null);
  assert.equal(figs[1].images.length, 4);
  assert.equal(plain(figs[1].images[0].caption.runs), 'Figure 2: Third');
  assert.equal(figs[1].images[0].anchor, 'fig-i2-1');
  assert.equal(figs[1].images[1], null);
  assert.equal(plain(figs[1].images[2].caption.runs), 'Figure 3');
  assert.equal(figs[2].caption, null);
  assert.equal(figs[2].images[0].caption, null);
  const t = document.blocks.find((b) => b.kind === 'table' && b.anchor === 'tbl-t1');
  assert.match(plain(t.caption.runs), /^Table \d+: A table$/);
  const f = refs.targets.filter((x) => x.kind === 'figure');
  assert.deepEqual(f.map((x) => [x.id, x.label, x.numberLabel, x.titleLabel]), [
    ['i1', 'Figure 1: Both of them', 'Figure 1', 'Both of them'], ['i2.1', 'Figure 2: Third', 'Figure 2', 'Third'], ['i2.3', 'Figure 3', 'Figure 3', 'Figure 3']]);
});

test('a link to a figure reads as the figure and jumps to it', () => {
  const { document } = build({ sections: [{ id: 'c1', title: 'Pictures', parts: [
    { id: 'p1', kind: 'para', text: 'See {{refn:i1}} and {{ref:i2.1}}.' },
    { id: 'i1', kind: 'image', layout: 'single', captions: 'one', caption: 'Map', images: [pic('a.png')] },
    { id: 'i2', kind: 'image', layout: 'pair', captions: 'separate', images: [pic('b.png', { caption: 'Left' }), pic('c.png')] },
  ] }], order: ['c1'] });
  const para = document.blocks.find((b) => b.kind === 'paragraph' && /See/.test(plain(b.runs)));
  assert.equal(plain(para.runs), 'See Figure 1 and Figure 2: Left.');
  assert.ok(para.runs.some((r) => r.ref && r.ref.anchor === 'fig-i1'));
});

test('more images than the layout has boxes: the extra ones are kept but not shown', () => {
  const { document } = build({ sections: [{ id: 'c1', title: 'P', parts: [
    { id: 'i1', kind: 'image', layout: 'single', captions: 'none', images: [pic('a.png'), pic('b.png')] }] }], order: ['c1'] });
  assert.deepEqual(document.blocks.find((b) => b.kind === 'figure').images.map((i) => i.name), ['a.png']);
});
```

`build(design)` merges `design` over the default design (`hostWith`); the `sections` and `order` given replace the defaults. (If `hostWith` spreads `design` over `report`, nothing more is needed; check with `sed -n 30,58p test/docgen/builder.test.js`.)

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/docgen/builder.test.js`
Expected: FAIL — no `figure` blocks.

- [ ] **Step 3: Implement**

a) Import (top of `DocGen/doc-designer.js`): add `import { boxCount as FIG_BOXES, imagePath as IMAGE_PATH, imageInfo as IMAGE_INFO, figureSources as FIGURE_SOURCES, FIGURE_LAYOUTS } from './doc-images.js';`

b) After `tableRef`, add:

```js
    function figureRef(f) {
      var num = 'Figure ' + f.number;
      return {
        anchor: f.anchor, numberLabel: num, titleLabel: f.caption || num,
        label: num + (f.caption ? ': ' + f.caption : '')
      };
    }
```

c) Give `refIndex`, `refResolver` and `refTargets` a third parameter `figures` and in `refIndex`, after the tables loop: `(figures || []).forEach(function (f) { add(f.id, 'figure', figureRef(f)); });`. Pass it through: `refResolver(resolved, tables, figures)` calls `refIndex(resolved, tables, figures)`; same for `refTargets`.

d) In `buildDocument`, next to the table numbering (inside `if (b.kind === 'custom') { (b.parts || []).forEach(function (p) {`), count figures too. Declare `var figureList = [], nf = 0;` beside `var tableList = [], n = 0;` and add:

```js
            if (p.kind === 'image' && (p.images || []).slice(0, FIG_BOXES(p.layout)).some(Boolean)) {
              if (p.captions === 'separate') {
                (p.images || []).slice(0, FIG_BOXES(p.layout)).forEach(function (im, k) {
                  if (!im) return;
                  nf++; var fid = p.id + '.' + (k + 1);
                  figureList.push({ id: fid, number: String(nf), caption: String(im.caption || '').trim(), anchor: App.md.anchor('fig-' + fid) });
                });
              } else if (p.captions !== 'none') {
                nf++; figureList.push({ id: p.id, number: String(nf), caption: String(p.caption || '').trim(), anchor: App.md.anchor('fig-' + p.id) });
              }
            }
```

Then `var resolveRef = App.doc.refResolver(resolved, tableList, figureList);`, `var figById = {}; figureList.forEach(function (f) { figById[f.id] = f; });`, and in the return value `targets: App.doc.refTargets(resolved, tableList, figureList)`.

e) A figure block, after `function caption(t) {…}`:

```js
      function figCaption(f) { return f ? { runs: [{ text: 'Figure ' + f.number + (f.caption ? ': ' + tag(f.caption) : '') }] } : null; }
      /** An image part as a figure block, or null when it has no image in any of its boxes. */
      function figureBlock(p) {
        var count = FIG_BOXES(p.layout);
        var ims = (p.images || []).slice(0, count);
        if (!ims.some(Boolean)) return null;
        while (ims.length < count) ims.push(null);
        var sep = p.captions === 'separate';
        return {
          kind: 'figure', layout: FIGURE_LAYOUTS[p.layout] ? p.layout : 'single',
          anchor: sep ? undefined : App.md.anchor('fig-' + p.id),
          caption: sep ? null : figCaption(figById[p.id]),
          images: ims.map(function (im, k) {
            if (!im) return null;
            var fid = p.id + '.' + (k + 1);
            var pct = Math.min(100, Math.max(5, Number(im.width) || 100));
            return { src: IMAGE_PATH(im.source, im.file), name: String(im.name || im.file), width: pct / 100, border: !im.noBorder,
              caption: sep ? figCaption(figById[fid]) : null, anchor: sep ? App.md.anchor('fig-' + fid) : undefined };
          })
        };
      }
```

f) In the custom-parts emission, after the `table` branch: `else if (p.kind === 'image') { var fb = figureBlock(p); if (fb) out.push(fb); }`

g) The tags pass at the end iterates `blk.runs`, `blk.caption.runs`, `header`, `rows`; figure captions were tagged in `figCaption`, so nothing to add.

- [ ] **Step 4: Run the tests**

Run: `node --test test/docgen/*.test.js && node DocGen/doc-designer.test.js`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add DocGen/doc-designer.js test/docgen/builder.test.js
git commit -m "Report designer: image parts become figures, numbered apart from tables, with one caption or one each, and are link targets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Storing image parts and Standard Images (`App.docStore`)

**Files:**
- Modify: `DocGen/doc-designer.js` (`blankPart` ~2023, `addPart` ~2058, `validParts` ~2776, the `App.docStore` export ~2660)
- Test: `test/docgen/designer-panes.test.js`

**Interfaces:**
- Produces (all on `App.docStore`, each returning `{ ok, issues }` like the existing ones):
  - `addPart(sectionId, 'image')` → a blank image part `{ id, kind: 'image', layout: 'single', captions: 'one', caption: '', images: [] }`.
  - `setPartImage(sectionId, partId, index, img | null)` — puts an image (or empties) box `index`; pads with `null`.
  - `setPartImageField(sectionId, partId, index, field: 'width'|'noBorder'|'caption', value)` — width held to a whole number 5–100 (100 removes it).
  - `addStandardImage(name, file)` → `{ ok, id }`; `renameStandardImage(id, name)`; `removeStandardImage(id)`; `standardImageUses(file) → number` (image boxes in sections and section templates that use it).
  - Stored as `report.standardImages: Array<{ id, name, file }>`.

- [ ] **Step 1: Write the failing tests** (append to `test/docgen/designer-panes.test.js`)

```js
test('an image part: added blank, boxes filled and emptied, fields held to their limits', () => {
  const h = host({ sections: [{ id: 'mine', title: 'Mine', parts: [] }] });
  App.docHost.set(h);
  const r = App.docStore.addPart('mine', 'image');
  assert.equal(r.ok, true);
  const part = () => h.getState().report.sections[0].parts[0];
  assert.deepEqual(part(), { id: r.id, kind: 'image', layout: 'single', captions: 'one', caption: '', images: [] });
  App.docStore.setPartImage('mine', r.id, 2, { source: 'report', file: 'a.png', name: 'a.png' });
  assert.deepEqual(part().images, [null, null, { source: 'report', file: 'a.png', name: 'a.png' }]);
  App.docStore.setPartImageField('mine', r.id, 2, 'width', '42.6');
  App.docStore.setPartImageField('mine', r.id, 2, 'noBorder', true);
  App.docStore.setPartImageField('mine', r.id, 2, 'caption', 'Left');
  assert.deepEqual(part().images[2], { source: 'report', file: 'a.png', name: 'a.png', width: 43, noBorder: true, caption: 'Left' });
  App.docStore.setPartImageField('mine', r.id, 2, 'width', 900);
  assert.equal(part().images[2].width, undefined, '100% is the default, so it is not stored');
  App.docStore.setPartImageField('mine', r.id, 2, 'width', 1);
  assert.equal(part().images[2].width, 5);
  App.docStore.setPartImage('mine', r.id, 2, null);
  assert.deepEqual(part().images, [null, null, null]);
});

test('a layout with fewer boxes keeps the extra images for later', () => {
  const h = host({ sections: [{ id: 'mine', title: 'Mine', parts: [{ id: 'i1', kind: 'image', layout: 'grid4', captions: 'one', caption: '',
    images: [{ source: 'report', file: 'a.png', name: 'a' }, { source: 'report', file: 'b.png', name: 'b' }, { source: 'report', file: 'c.png', name: 'c' }] }] }] });
  App.docHost.set(h);
  App.docStore.updatePart('mine', 'i1', { layout: 'single' });
  App.docStore.updatePart('mine', 'i1', { layout: 'grid21' });
  assert.deepEqual(h.getState().report.sections[0].parts[0].images.map((i) => i.name), ['a', 'b', 'c']);
});

test('Standard Images: added, renamed, counted where used, removed', () => {
  const h = host({ sections: [{ id: 'mine', title: 'Mine', parts: [{ id: 'i1', kind: 'image', layout: 'pair', captions: 'one', caption: '',
    images: [{ source: 'standard', file: 's1.png', name: 'Logo' }, { source: 'standard', file: 's1.png', name: 'Logo' }] }] }],
    sectionTemplates: [{ id: 'tpl1', name: 'T', parts: [{ id: 'i9', kind: 'image', layout: 'single', images: [{ source: 'standard', file: 's1.png', name: 'Logo' }] }] }] });
  App.docHost.set(h);
  const a = App.docStore.addStandardImage('Logo', 's1.png');
  assert.equal(a.ok, true);
  App.docStore.renameStandardImage(a.id, 'Company logo');
  assert.deepEqual(h.getState().report.standardImages, [{ id: a.id, name: 'Company logo', file: 's1.png' }]);
  assert.equal(App.docStore.standardImageUses('s1.png'), 3);
  assert.equal(App.docStore.addStandardImage('  ', 'x.png').ok, false);
  App.docStore.removeStandardImage(a.id);
  assert.deepEqual(h.getState().report.standardImages, []);
});

test('a section template may hold image parts', () => {
  const parsed = App.docTemplates.parse(JSON.stringify({ kind: 'pivot-section-templates', items: [{ name: 'Pics', parts: [{ kind: 'image', layout: 'pair', images: [] }] }] }), 'sections');
  assert.equal(parsed.issues.filter((i) => i.severity === 'error').length, 0, JSON.stringify(parsed.issues));
});
```

Before writing the last test, confirm the template parse entry point and file shape with `grep -n "function parse\|kind: 'pivot-\|parse: parse" DocGen/doc-designer.js`; use the real function name and envelope (the test's assertion — no errors for an image part — stays the same).

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/docgen/designer-panes.test.js`
Expected: FAIL — `Unknown part type "image"`.

- [ ] **Step 3: Implement**

a) `blankPart`: first line `if (kind === 'image') return { id: id, kind: 'image', layout: 'single', captions: 'one', caption: '', images: [] };`

b) `addPart`: the allowed kinds become `['para', 'table', 'rule', 'pagebreak', 'space', 'image']` and its JSDoc `@param {'para'|'table'|'rule'|'pagebreak'|'space'|'image'} kind`.

c) `validParts`: the allowed kinds become `['para', 'table', 'rule', 'pagebreak', 'space', 'image']` and add:

```js
        if (p.kind === 'image' && p.images !== undefined && !Array.isArray(p.images)) {
          issues.push(issue('error', 'An image part\'s images must be an array.', l)); ok = false;
        }
```

d) New store functions, after `removePart`:

```js
    /** IMG-1: one box of an image part: an image ({ source, file, name }) or null to empty it. */
    function setPartImage(sectionId, partId, index, img) {
      if (!P()) return errNoProject();
      var s0 = findSection(P(), sectionId);
      if (!s0 || !(s0.parts || []).some(function (x) { return x.id === partId && x.kind === 'image'; })) return err('Unknown image part.', partId);
      App.docHost.get().commit(function (p) {
        var part = findSection(p, sectionId).parts.filter(function (x) { return x.id === partId; })[0];
        part.images = part.images || [];
        while (part.images.length <= index) part.images.push(null);
        part.images[index] = img ? { source: img.source === 'standard' ? 'standard' : 'report', file: String(img.file), name: String(img.name || img.file) } : null;
      });
      return ok();
    }

    /** IMG-1: an image's width (% of the text width, 5–100), its "no border" tick, or its own caption. */
    function setPartImageField(sectionId, partId, index, field, value) {
      if (!P()) return errNoProject();
      if (['width', 'noBorder', 'caption'].indexOf(field) === -1) return err('Unknown image setting "' + field + '".');
      var s0 = findSection(P(), sectionId);
      var p0 = s0 && (s0.parts || []).filter(function (x) { return x.id === partId; })[0];
      if (!p0 || !(p0.images || [])[index]) return err('There is no image there.', partId);
      App.docHost.get().commit(function (p) {
        var im = findSection(p, sectionId).parts.filter(function (x) { return x.id === partId; })[0].images[index];
        if (field === 'width') {
          var n = Math.round(Number(value));
          if (!isFinite(n) || n >= 100) delete im.width; else im.width = Math.max(5, n);
        } else if (field === 'noBorder') {
          if (value) im.noBorder = true; else delete im.noBorder;
        } else {
          var c = String(value == null ? '' : value);
          if (c.trim()) im.caption = c; else delete im.caption;
        }
      });
      return ok();
    }

    /** IMG-2: Standard Images — images any report can use, by reference. */
    function addStandardImage(name, file) {
      if (!P()) return errNoProject();
      if (!String(name || '').trim()) return err('A standard image needs a name.');
      var id = null;
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.standardImages = b.standardImages || [];
        id = nextId('img', b.standardImages);
        b.standardImages.push({ id: id, name: String(name).trim(), file: String(file) });
      });
      return { ok: true, id: id, issues: [] };
    }
    function renameStandardImage(id, name) {
      if (!P()) return errNoProject();
      if (!String(name || '').trim()) return err('A standard image needs a name.');
      App.docHost.get().commit(function (p) {
        (bag(p).standardImages || []).forEach(function (s) { if (s.id === id) s.name = String(name).trim(); });
      });
      return ok();
    }
    function removeStandardImage(id) {
      if (!P()) return errNoProject();
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.standardImages = (b.standardImages || []).filter(function (s) { return s.id !== id; });
      });
      return ok();
    }
    /** How many image boxes, in sections and section templates, show this standard image. */
    function standardImageUses(file) {
      var n = 0;
      if (!P()) return 0;
      allParts(P()).forEach(function (part) {
        if (part && part.kind === 'image') (part.images || []).forEach(function (im) { if (im && im.source === 'standard' && im.file === file) n++; });
      });
      return n;
    }
```

e) Export them: in the `App.docStore = { … }` object add the line
`setPartImage: setPartImage, setPartImageField: setPartImageField, addStandardImage: addStandardImage, renameStandardImage: renameStandardImage, removeStandardImage: removeStandardImage, standardImageUses: standardImageUses,`.

- [ ] **Step 4: Run the tests**

Run: `node --test test/docgen/*.test.js && node DocGen/doc-designer.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add DocGen/doc-designer.js test/docgen/designer-panes.test.js
git commit -m "Report designer store: image parts (boxes, width, border, captions) and Standard Images

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: The Image block in the Sections tab, drawn in the previews

**Files:**
- Modify: `DocGen/doc-designer.js` (the `content` category ~4219–4236; a new `imageEditor` next to `spaceEditor`; `laidOut` ~4520; every `pagesHtml(` call: ~4015, ~4016, ~4511, ~4695; `paneGenerate` ~4660; `wireSections` ~5329; `_rd` state ~3422)
- Modify: `DocGen/doc-designer.css`
- Test: `test/docgen/designer-panes.test.js`

**Interfaces:**
- Consumes: `App.docStore.setPartImage/setPartImageField/updatePart/addPart` (Task 10); `FIGURE_LAYOUTS`, `IMAGE_PATH`, `IMAGE_INFO`, `FIGURE_SOURCES` (Task 1); the host's `images` interface (Task 13): `host.images.store(source, file) → Promise<{ file, width, height }>`, `host.images.read(path) → Promise<Uint8Array | null>`.
- Produces:
  - Markup: `data-rd-addpart="image"` button; per part `data-rd-img-layout`, `data-rd-img-captions`, `data-rd-img-caption` (one caption); per box `data-rd-imgbox="<k>"` with `data-rd-part`, `data-rd-sec`; inside a filled box `data-rd-img-clear`, `data-rd-img-width` (number box) with `data-rd-img-step="+"|"-"`, `data-rd-img-noborder`, `data-rd-img-capk` (separate caption); the box menu `data-rd-img-from="standard"`, `data-rd-img-file` (file input), `data-rd-img-std="<file>"`.
  - Designer image cache: `imageAsset(path) → { state: 'loading'|'ok'|'missing', width?, height?, url? }`; `RD._imageAssets` exposes the cache for tests.

- [ ] **Step 1: Write the failing tests** (append to `test/docgen/designer-panes.test.js`)

```js
/** The Sections tab, on one section's Content. */
function contentOf(h, id) {
  App.docHost.set(h); RD.open(); RD.pane('section'); RD.select(id); RD._rd.secCat = 'content';
  const html = RD.render(h.getState()); RD.close();
  return html;
}

test('the Content category offers + Image; an image part shows its layout, caption mode and boxes', () => {
  const h = host({ sections: [{ id: 'mine', title: 'Mine', parts: [{ id: 'i1', kind: 'image', layout: 'grid21', captions: 'separate', caption: '',
    images: [{ source: 'report', file: 'a.png', name: 'a.png', width: 40, noBorder: true, caption: 'Left' }] }] }], order: ['mine'] });
  const html = contentOf(h, 'mine');
  assert.match(html, /data-rd-addpart="image"[^>]*>\+ Image</);
  assert.match(html, /<select data-rd-img-layout="i1"[^>]*>[\s\S]*?<option value="single">Single image<\/option><option value="pair">Side by side<\/option><option value="grid4">2×2 grid<\/option><option value="grid21" selected>2-1 grid<\/option><option value="grid12">1-2 grid<\/option>/);
  assert.match(html, /<select data-rd-img-captions="i1"[^>]*>[\s\S]*?One caption[\s\S]*?value="separate" selected>Separate captions[\s\S]*?No caption/);
  assert.equal((html.match(/data-rd-imgbox="\d"/g) ?? []).length, 3);
  assert.match(html, /data-rd-imgbox="0"[\s\S]*?a\.png[\s\S]*?data-rd-img-width[^>]*value="40"[\s\S]*?data-rd-img-noborder[^>]*checked[\s\S]*?data-rd-img-capk[^>]*value="Left"/);
  assert.match(html, /data-rd-imgbox="1"[\s\S]*?Drop an image here, or click to choose/);
  assert.doesNotMatch(html, /data-rd-img-caption="i1"/, 'separate captions: no shared caption box');
});

test('one caption: a caption box for the whole block', () => {
  const h = host({ sections: [{ id: 'mine', title: 'Mine', parts: [{ id: 'i1', kind: 'image', layout: 'single', captions: 'one', caption: 'Our map', images: [] }] }], order: ['mine'] });
  assert.match(contentOf(h, 'mine'), /data-rd-img-caption="i1"[^>]*value="Our map"/);
});

test('a clicked box offers Standard Images or a file from this computer', () => {
  const h = host({ standardImages: [{ id: 'img1', name: 'Logo', file: 's1.png' }],
    sections: [{ id: 'mine', title: 'Mine', parts: [{ id: 'i1', kind: 'image', layout: 'single', captions: 'one', caption: '', images: [] }] }], order: ['mine'] });
  RD._rd.imgMenu = 'i1:0'; RD._rd.imgPick = false;
  let html = contentOf(h, 'mine');
  assert.match(html, /data-rd-img-from="standard"[^>]*>From Standard Images&hellip;</);
  assert.match(html, /From this computer&hellip;<input type="file" accept="image\/png,image\/jpeg" data-rd-img-file/);
  RD._rd.imgPick = true;
  html = contentOf(h, 'mine');
  assert.match(html, /data-rd-img-std="s1\.png"[^>]*>[\s\S]*?Logo/);
  RD._rd.imgMenu = null; RD._rd.imgPick = false;
});

test('the previews lay out images at their own size once read, and the Generate tab names missing ones', async () => {
  const { makePng } = await import('./image-fixtures.js');
  const png = await makePng({ width: 40, height: 10, sample: () => [1, 2, 3] });
  const h = host({ sections: [{ id: 'mine', title: 'Mine', parts: [{ id: 'i1', kind: 'image', layout: 'pair', captions: 'none',
    images: [{ source: 'report', file: 'a.png', name: 'a.png' }, { source: 'report', file: 'gone.png', name: 'gone.png' }] }] }], order: ['mine'] });
  h.images = { read: async (p) => (p === 'files/report-images/a.png' ? png : null) };
  App.docHost.set(h);
  RD._imageAssets.clear();
  RD.laidOut(h.getState(), null, {});            // starts the reads
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(RD._imageAssets.get('files/report-images/a.png').state, 'ok');
  assert.equal(RD._imageAssets.get('files/report-images/gone.png').state, 'missing');
  const laid = RD.laidOut(h.getState(), null, {});
  const im = laid.pages.flatMap((p) => p.items).find((it) => it.kind === 'image');
  assert.equal(Math.round(im.h * 4), Math.round(im.w));
  App.docHost.set(h); RD.open(); RD.pane('generate');
  const gen = RD.render(h.getState()); RD.close();
  assert.match(gen, /Images missing from the folder[\s\S]*?gone\.png/);
  RD._imageAssets.clear();
});
```

`RD.select(id)` sets the pane to `section`; `RD._rd.secCat = 'content'` picks the category (check the name of the state field with `grep -n "secCat" DocGen/doc-designer.js | head -3`).

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/docgen/designer-panes.test.js`
Expected: FAIL.

- [ ] **Step 3: The image cache, `laidOut` and the previews**

Near `zoomOf` (after the `ZOOMS` declarations), add:

```js
    /**
     * IMG-3: the images the previews draw, read from the folder once and kept while the
     * designer is open: their size (for the layout) and a URL (for the screen).
     */
    var _imageAssets = new Map();
    function imageAsset(path) {
      var a = _imageAssets.get(path);
      if (a) return a;
      var h = H();
      if (!h || !h.images || typeof h.images.read !== 'function') {
        a = { state: 'missing' };
        _imageAssets.set(path, a);
        return a;
      }
      a = { state: 'loading' };
      _imageAssets.set(path, a);
      Promise.resolve().then(function () { return h.images.read(path); }).then(function (bytes) {
        var info = bytes ? IMAGE_INFO(bytes) : null;
        if (!info) { a.state = 'missing'; } else {
          a.state = 'ok'; a.width = info.width; a.height = info.height;
          a.url = (typeof URL !== 'undefined' && URL.createObjectURL && typeof Blob !== 'undefined')
            ? URL.createObjectURL(new Blob([bytes], { type: info.mime })) : null;
        }
      }, function () { a.state = 'missing'; }).then(function () {
        _rd.preview = null;
        if (_rd.open) repaint();
      });
      return a;
    }
    /** The sizes the layout needs for a document's images: loading ones as boxes, missing ones left out. */
    function imageSizes(doc) {
      var out = {};
      FIGURE_SOURCES(doc).forEach(function (src) {
        var a = imageAsset(src);
        if (a.state === 'ok') out[src] = { width: a.width, height: a.height };
        else if (a.state === 'loading') out[src] = { pending: true };
      });
      return out;
    }
    function imageUrl(src) { var a = _imageAssets.get(src); return a && a.state === 'ok' ? a.url : null; }
```

In `laidOut`, change `var r = layout(built.document, s);` to `var r = layout(built.document, s, { images: imageSizes(built.document) });`.

Add `imageUrl: imageUrl` to the options of every `pagesHtml(` call in the designer (find them with `grep -n "pagesHtml(" DocGen/doc-designer.js`): e.g. `pagesHtml(laid.pages, { scale: zoomOf('styles'), imageUrl: imageUrl })` and `pagesHtml(bands, { scale: k, imageUrl: imageUrl })`.

Export for tests: add `_imageAssets: _imageAssets` to the `App.ui.views.reportDesign` object.

Because `repaint()` from a finished read may land while a text box has focus, check how `repaint` treats focus (`grep -n "function repaint" -A6 DocGen/doc-designer.js`); if it redraws the whole workspace, use `refresh()` (the preview-only redraw used by `liveSave`) instead when `document.activeElement` is inside `.docgen` and is an input or contenteditable.

- [ ] **Step 4: The Image block editor**

Add `_rd` fields in the state object (~3422): `imgMenu: null,   // 'partId:box' whose choose-menu is open` and `imgPick: false  // that menu showing Standard Images`.

Add after `spaceEditor`:

```js
    var IMAGE_LAYOUTS = [{ value: 'single', label: 'Single image' }, { value: 'pair', label: 'Side by side' }, { value: 'grid4', label: '2×2 grid' },
      { value: 'grid21', label: '2-1 grid' }, { value: 'grid12', label: '1-2 grid' }];
    var IMAGE_CAPTIONS = [{ value: 'one', label: 'One caption' }, { value: 'separate', label: 'Separate captions' }, { value: 'none', label: 'No caption' }];
    function imgSelect(attr, partId, secId, val, options, label) {
      return '<label class="rd-lab rd-lab-s">' + esc(label) + '<select ' + attr + '="' + esc(partId) + '" data-rd-sec="' + esc(secId) + '" aria-label="' + esc(label) + '">' +
        options.map(function (o) { return '<option value="' + o.value + '"' + (o.value === val ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') +
        '</select></label>';
    }

    /** IMG-1: one box of an image part: its image and settings, or a place to drop one. */
    function imageBox(project, sec, part, k) {
      var im = (part.images || [])[k] || null;
      var key = part.id + ':' + k;
      var ids = ' data-rd-part="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '"';
      var menu = '';
      if (_rd.imgMenu === key) {
        var std = bag(project).standardImages || [];
        menu = '<div class="rd-imgmenu">' + (_rd.imgPick
          ? (std.length ? std.map(function (s) {
              var a = imageAsset(IMAGE_PATH('standard', s.file));
              return '<button type="button" data-rd-img-std="' + esc(s.file) + '" data-rd-img-name="' + esc(s.name) + '"' + ids + ' data-rd-img-k="' + k + '">' +
                (a.url ? '<img class="rd-std-thumb" src="' + esc(a.url) + '" alt="">' : '') + esc(s.name) + '</button>';
            }).join('') : '<p class="rd-state">No standard images yet.</p>')
          : '<button type="button" data-rd-img-from="standard"' + ids + ' data-rd-img-k="' + k + '">From Standard Images&hellip;</button>' +
            '<label class="rd-filebtn">From this computer&hellip;<input type="file" accept="image/png,image/jpeg" data-rd-img-file' + ids + ' data-rd-img-k="' + k + '"></label>') +
          '</div>';
      }
      if (!im) {
        return '<div class="rd-imgbox rd-imgbox-empty" data-rd-imgbox="' + k + '"' + ids + ' tabindex="0">' +
          '<span class="rd-imgdrop">Drop an image here, or click to choose</span>' + menu + '</div>';
      }
      var path = IMAGE_PATH(im.source, im.file);
      var a = imageAsset(path);
      var sep = part.captions === 'separate';
      var w = im.width || 100;
      return '<div class="rd-imgbox" data-rd-imgbox="' + k + '"' + ids + ' tabindex="0">' +
        (a.state === 'ok' && a.url ? '<img class="rd-imgthumb" src="' + esc(a.url) + '" alt="">'
          : '<span class="rd-imgthumb rd-imgthumb-none">' + (a.state === 'missing' ? 'Missing' : '') + '</span>') +
        '<span class="rd-imgname" title="' + esc(im.name) + '">' + esc(im.name) + (im.source === 'standard' ? ' <span class="rd-kind">Standard</span>' : '') + '</span>' +
        '<button type="button" class="rd-imgclear" data-rd-img-clear' + ids + ' data-rd-img-k="' + k + '" aria-label="Take this image out">✕</button>' +
        '<div class="rd-imgopts">' +
          '<label class="rd-lab rd-lab-s" title="A share of the text width; never wider than its box">Width (%)<span class="rd-num">' +
            '<input value="' + esc(String(w)) + '" inputmode="numeric" data-rd-img-width' + ids + ' data-rd-img-k="' + k + '" aria-label="Width, percent of the text width">' +
            '<span class="rd-steps">' +
              '<button type="button" data-rd-img-step="+"' + ids + ' data-rd-img-k="' + k + '" aria-label="Width up" tabindex="-1">&#9650;</button>' +
              '<button type="button" data-rd-img-step="-"' + ids + ' data-rd-img-k="' + k + '" aria-label="Width down" tabindex="-1">&#9660;</button>' +
            '</span></span></label>' +
          '<label class="gen-opt"><input type="checkbox" data-rd-img-noborder' + ids + ' data-rd-img-k="' + k + '"' + (im.noBorder ? ' checked' : '') + '> No border</label>' +
          (sep ? '<input class="rd-imgcap" value="' + esc(im.caption || '') + '" placeholder="Caption" data-rd-img-capk' + ids + ' data-rd-img-k="' + k + '" aria-label="Caption for this image">' : '') +
        '</div>' + menu + '</div>';
    }

    /** IMG-1: an image part: its layout, its caption mode, its boxes and (one caption) its caption. */
    function imageEditor(project, sec, part, i, n) {
      var count = FIG_BOXES(part.layout);
      var boxes = '';
      for (var k = 0; k < count; k++) boxes += imageBox(project, sec, part, k);
      return '<div class="rd-part rd-part-image" draggable="true" data-rd-partrow="' + esc(part.id) + '">' +
        '<div class="rd-part-head"><span class="rd-part-kind">Image</span>' +
          imgSelect('data-rd-img-layout', part.id, sec.id, FIGURE_LAYOUTS[part.layout] ? part.layout : 'single', IMAGE_LAYOUTS, 'Layout') +
          imgSelect('data-rd-img-captions', part.id, sec.id, part.captions || 'one', IMAGE_CAPTIONS, 'Captions') +
          partControls(sec, part, i, n) + '</div>' +
        '<div class="rd-imggrid rd-imggrid-' + esc(FIGURE_LAYOUTS[part.layout] ? part.layout : 'single') + '">' + boxes + '</div>' +
        ((part.captions || 'one') === 'one'
          ? '<label class="rd-lab">Caption<input value="' + esc(part.caption || '') + '" data-rd-img-caption="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '" data-rd-live placeholder="What the figure shows"></label>'
          : '') +
        '</div>';
    }
```

In the `content` category: add `if (p.kind === 'image') return imageEditor(project, sec, p, i, parts.length);` before the `rule` line, and the button `'<button type="button" data-rd-addpart="image" data-rd-sec="' + esc(sec.id) + '">+ Image</button>' +` after `+ Table`.

`data-rd-live` is the attribute the Sections tab already uses for "preview follows typing" (check with `grep -n "data-rd-live" DocGen/doc-designer.js | head`); the caption box saves through the handler added in Step 5, the same way as other `data-rd-live` boxes.

- [ ] **Step 5: Wiring** (in `wireSections`, after the part drag handlers)

```js
      // ---- IMG-1: image parts ----------------------------------------------
      function imgIds(el) { return { sec: el.getAttribute('data-rd-sec'), part: el.getAttribute('data-rd-part'), k: Number(el.getAttribute('data-rd-img-k')) }; }
      function hasFiles(e) { var t = e.dataTransfer && e.dataTransfer.types; return !!t && Array.prototype.indexOf.call(t, 'Files') !== -1; }
      /** Copy a chosen or dropped file into the folder and put it in the box. */
      function putImage(sec, part, k, file) {
        var h = H();
        if (!h.images || typeof h.images.store !== 'function') { App.docHost.log({ severity: 'error', message: 'Images can only be added with a data folder open.' }); return; }
        h.images.store('report', file).then(function (r) {
          logIssues(App.docStore.setPartImage(sec, part, k, { source: 'report', file: r.file, name: file.name }));
          _rd.imgMenu = null; dirty(); repaint();
        }, function (e) { App.docHost.log({ severity: 'error', message: (e && e.message) || 'That image could not be added.' }); });
      }
      dom.on(ctx.root, 'dragover', '[data-rd-imgbox]', function (e, el) {
        if (!hasFiles(e)) return;
        e.preventDefault(); e.stopPropagation();
        el.classList.add('drop-target');
      });
      dom.on(ctx.root, 'dragleave', '[data-rd-imgbox]', function (e, el) { el.classList.remove('drop-target'); });
      dom.on(ctx.root, 'drop', '[data-rd-imgbox]', function (e, el) {
        if (!hasFiles(e)) return;
        e.preventDefault(); e.stopPropagation();
        el.classList.remove('drop-target');
        var f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) putImage(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-part'), Number(el.getAttribute('data-rd-imgbox')), f);
      });
      // A click on the box itself (not its buttons or boxes) opens or closes its menu.
      dom.on(ctx.root, 'click', '[data-rd-imgbox]', function (e, el) {
        if (e.target && e.target.closest && e.target.closest('button, input, select, label, .rd-imgmenu')) return;
        var key = el.getAttribute('data-rd-part') + ':' + el.getAttribute('data-rd-imgbox');
        _rd.imgMenu = _rd.imgMenu === key ? null : key; _rd.imgPick = false;
        repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-img-from]', function () { _rd.imgPick = true; repaint(); });
      dom.on(ctx.root, 'change', '[data-rd-img-file]', function (e, el) {
        var f = el.files && el.files[0], d = imgIds(el);
        if (f) putImage(d.sec, d.part, d.k, f);
        el.value = '';
      });
      dom.on(ctx.root, 'click', '[data-rd-img-std]', function (e, el) {
        var d = imgIds(el);
        logIssues(App.docStore.setPartImage(d.sec, d.part, d.k, { source: 'standard', file: el.getAttribute('data-rd-img-std'), name: el.getAttribute('data-rd-img-name') }));
        _rd.imgMenu = null; _rd.imgPick = false; dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-img-clear]', function (e, el) {
        var d = imgIds(el);
        logIssues(App.docStore.setPartImage(d.sec, d.part, d.k, null)); dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-img-layout]', function (e, el) {
        logIssues(App.docStore.updatePart(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-img-layout'), { layout: el.value }));
        _rd.imgMenu = null; dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-img-captions]', function (e, el) {
        logIssues(App.docStore.updatePart(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-img-captions'), { captions: el.value })); dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-img-caption]', function (e, el) {
        logIssues(App.docStore.updatePart(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-img-caption'), { caption: el.value })); dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-img-width]', function (e, el) {
        var d = imgIds(el);
        logIssues(App.docStore.setPartImageField(d.sec, d.part, d.k, 'width', el.value)); dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-img-step]', function (e, el) {
        var d = imgIds(el);
        var box = el.closest('.rd-num') && el.closest('.rd-num').querySelector('[data-rd-img-width]');
        var next = stepped(box ? box.value : 100, 5, el.getAttribute('data-rd-img-step') === '+' ? 1 : -1);
        logIssues(App.docStore.setPartImageField(d.sec, d.part, d.k, 'width', Math.min(100, Math.max(5, next)))); dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-img-noborder]', function (e, el) {
        var d = imgIds(el);
        logIssues(App.docStore.setPartImageField(d.sec, d.part, d.k, 'noBorder', el.checked)); dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-img-capk]', function (e, el) {
        var d = imgIds(el);
        logIssues(App.docStore.setPartImageField(d.sec, d.part, d.k, 'caption', el.value)); dirty(); repaint();
      });
```

The existing `data-rd-partrow` `drop` handler only moves a part when `_dragPart` is set, which a file drag never sets, so a file dropped on a box never moves a part.

Check the name of the helper bag variables inside `wireSections(h)` (`grep -n "function wireSections" -A12 DocGen/doc-designer.js`): use the same `ctx`/`dom`/`repaint`/`dirty`/`logIssues` names it already uses (they may come from `h.` — follow the surrounding handlers exactly).

- [ ] **Step 6: Generate tab — missing images**

In `paneGenerate`, after `var replaced = …;` add:

```js
      var missingImgs = [];
      if (!laid.error) (laid.document.blocks || []).forEach(function (b) {
        if (b.kind === 'figure') (b.images || []).forEach(function (im) {
          if (im && imageAsset(im.src).state === 'missing' && missingImgs.indexOf(im.name) === -1) missingImgs.push(im.name);
        });
      });
```

and after the `replaced.length ? … : ''` block:

```js
        (missingImgs.length
          ? '<div class="rd-fieldset rd-replaced"><strong title="These show as a grey box until the file is back in the folder">Images missing from the folder</strong>' +
              '<p>' + missingImgs.map(function (n) { return '<code>' + esc(n) + '</code>'; }).join(' ') + '</p></div>'
          : '') +
```

- [ ] **Step 7: CSS** (append to `DocGen/doc-designer.css`)

```css
  .docgen .rd-imggrid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 6px 0;}
  .docgen .rd-imggrid-single .rd-imgbox, .docgen .rd-imggrid-grid21 .rd-imgbox:nth-child(3), .docgen .rd-imggrid-grid12 .rd-imgbox:first-child { grid-column: 1 / -1;}
  .docgen .rd-imgbox { position: relative; min-height: 90px; border: 1px dashed var(--c-border); padding: 6px; display: flex; flex-direction: column; gap: 4px; cursor: pointer; border-radius: 0;}
  .docgen .rd-imgbox.drop-target { border-color: var(--c-accent); background: var(--c-hover, rgba(127,127,127,0.12));}
  .docgen .rd-imgbox-empty { align-items: center; justify-content: center; color: var(--c-muted);}
  .docgen .rd-imgthumb { max-width: 100%; max-height: 120px; object-fit: contain; align-self: center;}
  .docgen .rd-imgthumb-none { width: 100%; height: 60px; background: #eeeeee; color: #555; display: flex; align-items: center; justify-content: center; font-size: 12px;}
  .docgen .rd-imgname { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;}
  .docgen .rd-imgclear { position: absolute; top: 4px; right: 4px;}
  .docgen .rd-imgopts { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; cursor: default;}
  .docgen .rd-imgcap { width: 100%;}
  .docgen .rd-imgmenu { position: absolute; z-index: 5; top: 100%; left: 0; min-width: 220px; background: var(--c-surface); border: 1px solid var(--c-border); padding: 6px; display: flex; flex-direction: column; gap: 4px; cursor: default;}
  .docgen .rd-std-thumb { width: 28px; height: 28px; object-fit: contain; margin-right: 6px; vertical-align: middle;}
```

Use the colour tokens the file already uses (check with `grep -o "var(--c-[a-z-]*" DocGen/doc-designer.css | sort -u`) and replace any above that do not exist.

- [ ] **Step 8: Run the tests and build**

Run: `node --test test/docgen/*.test.js && node DocGen/doc-designer.test.js && npm run typecheck && npm run build`
Expected: PASS; build writes `dist/pivot.html`.

- [ ] **Step 9: Commit**

```bash
git add DocGen/doc-designer.js DocGen/doc-designer.css test/docgen/designer-panes.test.js
git commit -m "Report designer: the Image block (layouts, drop boxes, Standard Images or a file, width, border, captions), images in the previews, missing images on Generate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Images in Styles, Standard Images in Templates

**Files:**
- Modify: `DocGen/doc-designer.js` (`STYLE_SECTIONS` ~4304; `styleSectionFields` after `tables`; `paneTemplates` ~4560; `wire` templates handlers ~6000)
- Modify: `DocGen/doc-designer.css`
- Test: `test/docgen/designer-panes.test.js`

**Interfaces:**
- Consumes: `style.images` (Task 4); `App.docStore.addStandardImage/renameStandardImage/removeStandardImage/standardImageUses` (Task 10); `host.images.store('standard', file)`, `host.images.remove('standard', file)` (Task 13); `imageAsset` (Task 11).
- Produces: Styles section `images` (label "Images", after Tables); Templates fieldset "Standard Images" with `data-rd-std-drop`, `data-rd-std-file`, `data-rd-std-rename`, `data-rd-std-del`.

- [ ] **Step 1: Write the failing tests**

```js
test('Styles has an Images section after Tables: border, weight and colour when a line, caption position, alignment', () => {
  const names = (html) => [...html.matchAll(/data-rd-style-section="([a-zA-Z0-9]+)"/g)].map((m) => m[1]);
  const html = paneOf(host(), 'styles', 'images');
  const order = names(html);
  assert.equal(order[order.indexOf('tables') + 1], 'images');
  assert.match(html, /data-rd-style-section="images"[^>]*>Images</);
  const f = html.slice(html.indexOf('rd-style-fields'), html.indexOf('rd-style-preview'));
  for (const k of ['images.border', 'images.captionPosition', 'images.align']) assert.match(f, new RegExp(`data-rd-fmt="${k.replace('.', '\\.')}"`), k);
  assert.doesNotMatch(f, /images\.borderWidth/, 'no weight until there is a line');
  const lined = host();
  lined.getState().report.formats[0].images = { border: 'line' };
  const g = paneOf(lined, 'styles', 'images');
  assert.match(g, /data-rd-fmt="images\.borderWidth"/);
  assert.match(g, /data-rd-colour-open="images\.borderColour"/);
});

test('Templates lists Standard Images with Rename and Delete, and a way to add one', () => {
  const html = paneOf(host({ standardImages: [{ id: 'img1', name: 'Logo', file: 's1.png' }] }), 'templates');
  assert.match(html, /<div class="rd-fieldset rd-stdimgs" data-rd-std-drop><strong>Standard Images<\/strong>/);
  assert.match(html, /Logo[\s\S]*?data-rd-std-rename="img1"[\s\S]*?data-rd-std-del="img1"/);
  assert.match(html, /Add image&hellip;<input type="file" accept="image\/png,image\/jpeg" data-rd-std-file>/);
  assert.match(paneOf(host(), 'templates'), /No standard images yet\./);
});
```

Also add `'images'` to the section list in the existing test "every field on every Styles section names a real path in the Style" (its `for (const s of [...])` list).

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/docgen/designer-panes.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement the Styles section**

In `STYLE_SECTIONS` change `{ id: 'tables', label: 'Tables' },` to `{ id: 'tables', label: 'Tables' }, { id: 'images', label: 'Images' },`.

In `styleSectionFields`, after the `tables` branch:

```js
      if (section === 'images') {
        var im = f.images;
        return '<div class="rd-grid">' +
            pick('Border', 'images.border', im.border, [{ value: 'none', label: 'None' }, { value: 'line', label: 'Line' }]) +
            (im.border === 'line'
              ? num('Border weight (pt)', 'images.borderWidth', im.borderWidth, '', 0.25) + colourField('Border colour', 'images.borderColour', im.borderColour)
              : '') +
            pick('Caption', 'images.captionPosition', im.captionPosition, [{ value: 'below', label: 'Below the image' }, { value: 'above', label: 'Above the image' }]) +
            pick('Alignment', 'images.align', im.align, [{ value: 'centre', label: 'Centre' }, { value: 'left', label: 'Left' }]) +
          '</div>';
      }
```

- [ ] **Step 4: Implement Standard Images in Templates**

In `paneTemplates`, before the `Styles` fieldset is returned, build and prepend:

```js
      var std = b.standardImages || [];
      var stdImages = '<div class="rd-fieldset rd-stdimgs" data-rd-std-drop><strong>Standard Images</strong>' +
          (std.length
            ? '<ul class="rd-tpl-list">' + std.map(function (s) {
                var a = imageAsset(IMAGE_PATH('standard', s.file));
                return '<li>' + (a.url ? '<img class="rd-std-thumb" src="' + esc(a.url) + '" alt="">' : '<span class="rd-std-thumb rd-imgthumb-none"></span>') +
                  '<span class="rd-tpl-name">' + esc(s.name) + '</span>' +
                  '<button type="button" data-rd-std-rename="' + esc(s.id) + '">Rename</button>' +
                  '<button type="button" class="danger" data-rd-std-del="' + esc(s.id) + '" title="Delete this image">✕</button></li>';
              }).join('') + '</ul>'
            : '<p class="rd-state">No standard images yet.</p>') +
          '<div class="rd-addbar"><label class="rd-filebtn" title="Or drop PNG or JPEG files here">Add image&hellip;<input type="file" accept="image/png,image/jpeg" data-rd-std-file></label></div>' +
        '</div>';
```

and return `stdImages + '<div class="rd-fieldset"><strong>Styles</strong>' + …` (the rest unchanged).

In `wire`, beside the template handlers:

```js
      // ---- IMG-2: Standard Images -------------------------------------------
      function addStandard(file) {
        var h = H();
        if (!h.images || typeof h.images.store !== 'function') { App.docHost.log({ severity: 'error', message: 'Images can only be added with a data folder open.' }); return; }
        h.images.store('standard', file).then(function (r) {
          logIssues(App.docStore.addStandardImage(String(file.name).replace(/\.(png|jpe?g)$/i, ''), r.file));
          repaint();
        }, function (e) { App.docHost.log({ severity: 'error', message: (e && e.message) || 'That image could not be added.' }); });
      }
      dom.on(ctx.root, 'change', '[data-rd-std-file]', function (e, el) {
        Array.prototype.forEach.call(el.files || [], addStandard);
        el.value = '';
      });
      dom.on(ctx.root, 'dragover', '[data-rd-std-drop]', function (e, el) {
        var t = e.dataTransfer && e.dataTransfer.types;
        if (!t || Array.prototype.indexOf.call(t, 'Files') === -1) return;
        e.preventDefault(); el.classList.add('drop-target');
      });
      dom.on(ctx.root, 'dragleave', '[data-rd-std-drop]', function (e, el) { el.classList.remove('drop-target'); });
      dom.on(ctx.root, 'drop', '[data-rd-std-drop]', function (e, el) {
        e.preventDefault(); el.classList.remove('drop-target');
        Array.prototype.forEach.call((e.dataTransfer && e.dataTransfer.files) || [], addStandard);
      });
      dom.on(ctx.root, 'click', '[data-rd-std-rename]', function (e, el) {
        var id = el.getAttribute('data-rd-std-rename');
        var cur = ((bag(H().getState()).standardImages) || []).filter(function (s) { return s.id === id; })[0];
        var name = window.prompt('Name for this image:', cur ? cur.name : '');
        if (name == null || !name.trim()) return;
        logIssues(App.docStore.renameStandardImage(id, name)); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-std-del]', function (e, el) {
        var id = el.getAttribute('data-rd-std-del');
        var cur = ((bag(H().getState()).standardImages) || []).filter(function (s) { return s.id === id; })[0];
        if (!cur) return;
        var uses = App.docStore.standardImageUses(cur.file);
        if (!window.confirm('Delete "' + cur.name + '"?' + (uses ? ' It is used in ' + uses + ' image box' + (uses === 1 ? '' : 'es') + ', which will show a placeholder.' : ''))) return;
        logIssues(App.docStore.removeStandardImage(id));
        var h = H();
        if (h.images && typeof h.images.remove === 'function') Promise.resolve(h.images.remove('standard', cur.file)).catch(function () {});
        _imageAssets.delete(IMAGE_PATH('standard', cur.file));
        dirty(); repaint();
      });
```

(`bag` in the render half of the file is `function bag(project) { return (project && project.report) || {}; }`, which is what these handlers want.)

Append to `DocGen/doc-designer.css`: `  .docgen .rd-stdimgs.drop-target { outline: 2px dashed var(--c-accent);}`

- [ ] **Step 5: Run the tests and build**

Run: `node --test test/docgen/*.test.js && node DocGen/doc-designer.test.js && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add DocGen/doc-designer.js DocGen/doc-designer.css test/docgen/designer-panes.test.js
git commit -m "Report designer: an Images section in Styles and Standard Images in Templates (add, drop, rename, delete)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: The PIVOT host stores and reads image files

**Files:**
- Modify: `src/reports/docgen-host.js`
- Test: `test/reports/docgen-host.test.js`

**Interfaces:**
- Consumes: `imageInfo`, `imagePath`, `MAX_IMAGE_BYTES` (Task 1); `newId` from `src/core/ids.js`.
- Produces:
  - `createDocHost(ctx)` takes an optional `ctx.files: { read(path) → Promise<Uint8Array|null>, write(path, blob) → Promise<void>, exists(path) → Promise<boolean>, remove(path) → Promise<void> }`.
  - `host.images = { store(source, file) → Promise<{ file, width, height }>, read(path) → Promise<Uint8Array|null>, remove(source, file) → Promise<void> }`.
  - `imagesInUse(data) → Set<string>` (exported): the `files/report-images/` file names any section, section template, report template or produced report uses.

- [ ] **Step 1: Write the failing tests** (append to `test/reports/docgen-host.test.js`; check its existing imports and how it builds `ctx` with `grep -n "createDocHost(" test/reports/docgen-host.test.js | head -3`)

```js
import { imagesInUse } from '../../src/reports/docgen-host.js';
import { makePng, makeJpeg } from '../docgen/image-fixtures.js';

function memFiles() {
  const files = new Map();
  return { files, api: {
    read: async (p) => files.get(p) ?? null,
    write: async (p, blob) => { files.set(p, new Uint8Array(await blob.arrayBuffer())); },
    exists: async (p) => files.has(p),
    remove: async (p) => { files.delete(p); },
  } };
}
const fileOf = (bytes, name) => new File([bytes], name);

test('the host stores a PNG or JPEG under its folder with a new name, and reads it back', async () => {
  const m = memFiles();
  const { host } = createDocHost({ ...ctxFor(), files: m.api });
  const png = await makePng({ width: 3, height: 2, sample: () => [1, 2, 3] });
  const r = await host.images.store('report', fileOf(png, 'site.png'));
  assert.match(r.file, /^[0-9a-f]{8}\.png$/);
  assert.deepEqual([r.width, r.height], [3, 2]);
  assert.deepEqual([...await host.images.read(`files/report-images/${r.file}`)], [...png]);
  const j = await host.images.store('standard', fileOf(makeJpeg(10, 5), 'logo.jpeg'));
  assert.match(j.file, /^[0-9a-f]{8}\.jpg$/);
  assert.ok(m.files.has(`files/standard-images/${j.file}`));
  await host.images.remove('standard', j.file);
  assert.equal(m.files.has(`files/standard-images/${j.file}`), false);
});

test('other files, and files over 20 MB, are refused with a reason', async () => {
  const { host } = createDocHost({ ...ctxFor(), files: memFiles().api });
  await assert.rejects(host.images.store('report', fileOf(new TextEncoder().encode('GIF89a'), 'a.gif')), /Only PNG and JPEG images can be used/);
  const big = { name: 'huge.png', size: 21 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(0) };
  await assert.rejects(host.images.store('report', big), /huge\.png is 21 MB; an image can be at most 20 MB/);
  const { host: none } = createDocHost(ctxFor());
  await assert.rejects(none.images.store('report', fileOf(makeJpeg(1, 1), 'a.jpg')), /Open the data folder first/);
  assert.equal(await none.images.read('files/report-images/a.png'), null);
});

test('the report images in use: in sections, templates and produced reports', () => {
  const img = (file, source = 'report') => ({ kind: 'image', images: [{ source, file }, null] });
  const data = { reportDesign: { sections: [{ parts: [img('a.png'), img('s.png', 'standard')] }], sectionTemplates: [{ parts: [img('b.png')] }],
    reportTemplates: [{ sections: [{ parts: [img('c.png')] }] }] },
    records: { report: { r1: { document: { blocks: [{ kind: 'figure', images: [{ src: 'files/report-images/d.png' }, { src: 'files/standard-images/s.png' }, null] }] } } } } };
  assert.deepEqual([...imagesInUse(data)].sort(), ['a.png', 'b.png', 'c.png', 'd.png']);
});
```

`ctxFor()` stands for however the file already builds a context for `createDocHost` (a `getData`, `setDesign`, `clock`, `profileName`); use the existing helper's real name, or add one that returns the context the existing tests use.

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/reports/docgen-host.test.js`
Expected: FAIL — `host.images` is undefined.

- [ ] **Step 3: Implement**

Imports at the top of `src/reports/docgen-host.js`:

```js
import { imageInfo, imagePath, MAX_IMAGE_BYTES } from '../../DocGen/doc-images.js';
import { newId } from '../core/ids.js';
```

(Check `newId` is not already imported.) Extend the `createDocHost` JSDoc `ctx` type with
`files?: { read: (path: string) => Promise<Uint8Array | null>, write: (path: string, blob: Blob) => Promise<void>, exists: (path: string) => Promise<boolean>, remove: (path: string) => Promise<void> }`.

Add to the `host` object:

```js
    // Report images, kept in the data folder: files/report-images/ and files/standard-images/.
    images: {
      /** @param {'report'|'standard'} source @param {File | { name: string, size: number, arrayBuffer: () => Promise<ArrayBuffer> }} file */
      async store(source, file) {
        if (!ctx.files) throw new Error('Open the data folder first.');
        if (file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name} is ${Math.round(file.size / (1024 * 1024))} MB; an image can be at most 20 MB.`);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const info = imageInfo(bytes);
        if (!info) throw new Error('Only PNG and JPEG images can be used');
        let name = '';
        do name = `${newId().replace(/-/g, '').slice(0, 8)}.${info.type === 'png' ? 'png' : 'jpg'}`;
        while (await ctx.files.exists(imagePath(source, name)));
        await ctx.files.write(imagePath(source, name), new Blob([bytes], { type: info.mime }));
        return { file: name, width: info.width, height: info.height };
      },
      /** @param {string} path */
      read: async (path) => (ctx.files ? ctx.files.read(path) : null),
      /** @param {'report'|'standard'} source @param {string} file */
      async remove(source, file) { if (ctx.files) await ctx.files.remove(imagePath(source, file)); },
    },
```

Check what `newId()` returns (`sed -n 1,30p src/core/ids.js`); the name must come out as 8 lower-case hex characters — adjust the `replace`/`slice` so it does (the test pins `^[0-9a-f]{8}\.png$`).

Add the exported function after `renumbered`:

```js
/**
 * The files in files/report-images/ that something still uses: an image part in a section, a
 * section template or a report template, or a figure in a produced report (downloaded again later).
 * @param {{ reportDesign?: any, records: { report?: Record<string, any> } }} data
 */
export function imagesInUse(data) {
  /** @type {Set<string>} */
  const used = new Set();
  /** @param {any[] | undefined} parts */
  const visit = (parts) => {
    for (const p of parts ?? []) if (p?.kind === 'image') for (const im of p.images ?? []) if (im && im.source !== 'standard' && im.file) used.add(im.file);
  };
  const d = data.reportDesign ?? {};
  for (const s of d.sections ?? []) visit(s.parts);
  for (const t of d.sectionTemplates ?? []) visit(t.parts);
  for (const t of d.reportTemplates ?? []) for (const s of t.sections ?? []) visit(s.parts);
  const prefix = 'files/report-images/';
  for (const r of Object.values(data.records.report ?? {})) {
    for (const b of r?.document?.blocks ?? []) {
      if (b.kind === 'figure') for (const im of b.images ?? []) if (im?.src?.startsWith(prefix)) used.add(im.src.slice(prefix.length));
    }
  }
  return used;
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/reports/*.test.js && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/reports/docgen-host.js test/reports/docgen-host.test.js
git commit -m "Report host: store and read report and standard images in the data folder; which report images are in use

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: The controller: folder access, images at download, the sweep on save

**Files:**
- Modify: `src/ui/controller.js` (imports; `createDocHost({ … })` ~185; `downloadReport` ~988; `save` ~464)
- Test: `test/ui/controller-report-images.test.js` (new)

**Interfaces:**
- Consumes: `host.images` and `imagesInUse` (Task 13); `loadImages` (Task 3); `renderPdf(doc, style, { date, images })` (Task 6); `renderHtml(doc, style, { images })` (Task 8); folder functions `readFile`, `writeWhole`, `exists`, `removeFile`, `listNames` from `src/storage/folder.js`.
- Produces: downloads read images from the folder at that moment; after a successful save, files in `files/report-images/` that nothing uses and that were last changed more than 24 hours ago are removed (`SWEEP_AFTER_MS = 24 * 60 * 60 * 1000`, exported for the test).

- [ ] **Step 1: Write the failing tests** (`test/ui/controller-report-images.test.js`)

Model the setup on `/tmp/…/seed-pdf.mjs` and the existing controller tests (`sed -n 1,40p test/ui/controller.test.js` shows the helpers):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController, SWEEP_AFTER_MS } from '../../src/ui/controller.js';
import { App as DocGen } from '../../DocGen/doc-designer.js';
import { makePng } from '../docgen/image-fixtures.js';

async function setup() {
  const f = new MemoryFolder();
  const c = createController({ clock: fixedClock('2026-10-12T10:00:00+10:00'), storage: new MemoryStorage(), minSaveMs: 0,
    pickFolder: async () => f.handle, pickSaveFile: async (n) => f.handle.getFileHandle(n, { create: true }), pickOpenFile: async () => null });
  const go = async (a) => { await c.dispatch(a); const m = c.getState().message; if (m?.kind === 'error') throw new Error(`${a.type}: ${m.text}`); };
  await go({ type: 'chooseFolder' });
  await go({ type: 'createProfile', name: 'Ada' });
  await go({ type: 'selectProfile', id: c.getState().profiles[0].id });
  await go({ type: 'createPlatform', id: 'p1', name: 'Boat', ownerId: c.getState().profiles[0].id });
  await go({ type: 'save' });
  await go({ type: 'openDesigner' });
  return { f, c, go };
}
/** Put an image part holding these files into a new own section. */
function designWith(files) {
  DocGen.docHost.get().commit((s) => {
    s.report = s.report || {};
    s.report.sections = [{ id: 'pics', title: 'Pictures', parts: [{ id: 'i1', kind: 'image', layout: 'pair', captions: 'one', caption: 'Site',
      images: files.map((file) => ({ source: 'report', file, name: file })) }] }];
    s.report.order = [...(s.report.order || []), 'pics'];
  });
}
const text = (bytes) => Array.from(bytes, (b) => String.fromCharCode(b)).join('');

test('images are stored through the host and drawn in the downloaded PDF and HTML; a missing one is a placeholder', async () => {
  const { f, c, go } = await setup();
  const png = await makePng({ width: 4, height: 2, sample: () => [10, 20, 30] });
  const r = await DocGen.docHost.get().images.store('report', new File([png], 'site.png'));
  assert.ok(f.readBytes(`files/report-images/${r.file}`));
  designWith([r.file, 'gone.png']);
  await go({ type: 'generateFromDesigner', format: 'pdf' });
  const pdf = text(f.readBytes(f.list().find((p) => p.endsWith('.pdf'))));
  assert.equal((pdf.match(/\/Subtype \/Image/g) ?? []).length, 1);
  assert.match(pdf, /Image missing: gone\.png/);
  await go({ type: 'downloadReport', id: c.getState().lastReportId, format: 'html' });
  const html = f.read(f.list().find((p) => p.endsWith('.html')));
  assert.match(html, /<img[^>]*src="data:image\/png;base64,/);
  assert.match(html, /Image missing: gone\.png/);
});

test('a save removes old report images nothing uses, and keeps recent or used ones', async () => {
  const { f, go } = await setup();
  const png = await makePng({ width: 1, height: 1, sample: () => [0, 0, 0] });
  for (const n of ['used.png', 'old.png', 'new.png']) f.writeBytes(`files/report-images/${n}`, png);
  const age = (n, ms) => { const at = f.locate(`files/report-images/${n}`, false); at.dir.entries.get(at.name).lastModified = Date.now() - ms; };
  age('used.png', 2 * SWEEP_AFTER_MS); age('old.png', 2 * SWEEP_AFTER_MS); age('new.png', 60 * 1000);
  designWith(['used.png']);
  await go({ type: 'save' });
  await new Promise((r) => setTimeout(r, 20));
  const names = f.list().filter((p) => p.startsWith('files/report-images/')).sort();
  assert.deepEqual(names, ['files/report-images/new.png', 'files/report-images/used.png']);
});
```

`f.list()` lists every file path (used the same way in the seed script); `f.locate` is the fake's own lookup (check its signature at `test/fakes/folder.js:344`).

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/ui/controller-report-images.test.js`
Expected: FAIL — `SWEEP_AFTER_MS` is not exported / `images` is undefined.

- [ ] **Step 3: Implement in `src/ui/controller.js`**

Imports:

```js
import { reportFileBase, imagesInUse } from '../reports/docgen-host.js';
import { loadImages } from '../../DocGen/doc-images.js';
import { readFile, writeWhole, exists as fileExists, removeFile, listNames } from '../storage/folder.js';
```

(Merge `imagesInUse` into the existing `reportFileBase` import line; check none of the folder names clash with names already in the file — rename on import if they do.)

Below the imports:

```js
/** Report images nothing uses are removed on save only once this old, so one just dropped by someone yet to save is kept. */
export const SWEEP_AFTER_MS = 24 * 60 * 60 * 1000;
```

In `createDocHost({ … })` add:

```js
    files: {
      read: async (/** @type {string} */ path) => {
        if (!handle) return null;
        const f = await readFile(handle, path);
        return f ? new Uint8Array(await f.arrayBuffer()) : null;
      },
      write: async (/** @type {string} */ path, /** @type {Blob} */ blob) => { if (!handle) throw new PivotError('no-data', 'Open the data folder first.'); await writeWhole(handle, path, blob); },
      exists: async (/** @type {string} */ path) => (handle ? fileExists(handle, path) : false),
      remove: async (/** @type {string} */ path) => { if (handle) await removeFile(handle, path); },
    },
```

`ctx.files` is only useful with a folder; the host's `store` still checks for `handle` through `write`. If the host's `store` must say "Open the data folder first." when there is no folder, pass `files` as a getter-free object as above and let `write` throw that message (the host test with no `files` covers the other case).

In `downloadReport`, replace the `content` line:

```js
      const images = r.document ? await loadImages(r.document, docs.host.images.read) : {};
      // The PDF and HTML are drawn from the finished document when downloaded, with the images as they are in the folder now;
      // a report made before PDF has only its HTML.
      const content = ext === 'pdf' ? renderPdf(r.document, r.style, { date: r.producedAt, images }).bytes
        : r.document ? renderHtml(r.document, r.style, { images }) : r.html;
```

Add a function next to `afterChange`:

```js
  /** After a save: report images that nothing uses and that are a day old leave the folder. Never throws. */
  async function sweepReportImages() {
    if (!handle || !state.session) return;
    try {
      const used = imagesInUse(state.session.working);
      for (const name of await listNames(handle, 'files/report-images')) {
        if (used.has(name)) continue;
        const f = await readFile(handle, `files/report-images/${name}`);
        if (!f || Date.now() - f.lastModified < SWEEP_AFTER_MS) continue;
        await removeFile(handle, `files/report-images/${name}`);
      }
    } catch { /* a sweep that cannot finish leaves the files for the next save */ }
  }
```

In `save()`, after the saved state is set (find the `set({ session: … })` that follows `let working = …` — the end of the success path), add `void sweepReportImages();`.

- [ ] **Step 4: Run the tests**

Run: `node --test test/ui/controller-report-images.test.js && npm test 2>&1 | grep -E "^ℹ (pass|fail)|passed," && npm run typecheck && npm run build`
Expected: PASS; `fail 0`; `OK 45 passed`; build OK.

- [ ] **Step 5: Commit**

```bash
git add src/ui/controller.js test/ui/controller-report-images.test.js
git commit -m "Reports: images stored in and read from the data folder; downloads draw them; unused report images swept a day after on save

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Browser walkthrough

**Files:** none changed unless a defect is found (then: a failing test first, the fix, the suite, a commit).

- [ ] **Step 1: Build, seed and serve**

```bash
npm run build
node /tmp/claude-1000/-workspaces-ProjectPivot2-0/430778fa-504a-4c0f-be04-c29e6b50501c/scratchpad/seed-pdf.mjs | tail -1
(cd dist && nohup python3 -m http.server 8765 > /dev/null 2>&1 &)
```

Expected: `OK wrote …/dist/pivot.html`; the seed lists `data.json`, `profiles.json`.

- [ ] **Step 2: Walk through in Playwright** (load the seed into OPFS as in earlier walkthroughs; make images in the page with a canvas: a PNG with a transparent half via `canvas.toBlob(…, 'image/png')` and a JPEG via `'image/jpeg'`; deliver them with `DataTransfer` drop events on `[data-rd-imgbox]`, and with `setInputFiles` on `[data-rd-img-file]` / `[data-rd-std-file]`):

1. Add a section, + Image; drop the PNG on box 1; see the thumbnail and the section preview draw it.
2. Each layout in turn; images keep their order; switch to Single and back to 2×2 — all images return.
3. Width arrows (step 5) and No border with the Style's border set to Line in Styles → Images (also caption above, alignment left).
4. Captions: One (type a caption, preview updates), Separate (each image's caption), No caption.
5. Templates → Standard Images: add the JPEG, rename it; in a box choose From Standard Images…; delete it (the confirm names the use count) and see the placeholder.
6. In a paragraph, Link… lists "Figure 1" entries; insert one; preview shows "Figure 1".
7. Generate → Make PDF and Make HTML; open both (PDF via the test reader for `/Subtype /Image`; HTML in a page, the images visible).
8. Delete an image file from OPFS; reopen the designer: placeholder in the preview; "Images missing from the folder" on Generate.
9. Both themes: screenshots of the Image block and the Standard Images list.
10. No page errors throughout.

- [ ] **Step 3: Report**

Record what was seen for each step; any defect becomes a failing test, a fix and a commit before the branch is offered for merge.

---

## Self-review notes

- Spec coverage: insertion (T11), storage folders (T13–14), Standard Images by reference (T10, T12, T13), layouts (T1, T5, T8, T11), captions one/separate/none (T5, T8, T9, T11), per-image width and No border (T9, T10, T11), Style Images section (T4, T12), figure numbers and links (T9), PNG/JPEG incl. transparency/interlace/16-bit (T2), 20 MB limit (T13), PDF keep-together/scale/write-once (T5, T6), HTML data URIs (T8), placeholder everywhere (T5, T6, T7, T8, T11), Generate missing list (T11), read at download (T14), unused-file removal on save (T14).
- Rulings carried from the spec into the plan: the sweep keeps files younger than 24 hours and any file a produced report uses (the spec said "removed the next time the design is saved"; this protects a teammate's unsaved drop and old reports' re-downloads); zlib through the platform's streams (the spec said "zlib inflate" in `doc-images.js` — same result, less code).
