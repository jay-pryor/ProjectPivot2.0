# Reports as PDF and HTML, part 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the designer's Markdown/pandoc output with PDF and HTML that PIVOT writes itself, driven by user-editable **Styles**, with a live page preview in the designer.

**Architecture:** The designer builds a structured **Document** (heading, paragraph, table, contents, page-break, space and rule blocks made of text runs) instead of Markdown. A **layout engine** turns Document + Style into positioned **pages** (two or three passes, so page numbers in the contents and in "(page N)" references settle). A **PDF writer** turns pages into PDF bytes using the 12 standard Type1 fonts (no embedding). An **HTML writer** writes the Document as one flowing page with CSS from the Style. The designer's preview draws the same pages. New code lives in new files under `DocGen/`; `doc-designer.js` is reworked and loses its Markdown/LaTeX code last.

**Tech Stack:** vanilla ES modules + JSDoc; `node:test` (`npm test` runs `test/**/*.test.js` and `node DocGen/doc-designer.test.js`); `npm run typecheck`; `npm run build` → `dist/pivot.html` (single file, inline import map, no libraries).

**Spec:** `docs/superpowers/specs/2026-10-12-docgen-pdf-part1-design.md`

## Global Constraints

- No libraries, no network: every new file is hand-written and bundled by `scripts/build.js` (add each new `DocGen/*.js` to `EXTRA_SOURCES`).
- `npm run build` after every source change; commit messages end `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Units: the layout works in **points** from the **top-left** of the page; `MM = 72 / 25.4`. The PDF writer flips y.
- Fonts: families `helvetica | times | courier`; PDF base names `Helvetica, Helvetica-Bold, Helvetica-Oblique, Helvetica-BoldOblique, Times-Roman, Times-Bold, Times-Italic, Times-BoldItalic, Courier, Courier-Bold, Courier-Oblique, Courier-BoldOblique`; text is WinAnsi-encoded; characters outside it are substituted (`≥`→`>=`, `≤`→`<=`, `≠`→`!=`, `✓ ✔`→`Yes`, `✗ ✘`→`No`, `→`→`->`, `←`→`<-`, tab→space, else `?`) and reported.
- Data: `SCHEMA_VERSION` 5 → 6 with a throwaway `scripts/convert-to-v6.mjs`; no in-app migrations. The bag keys `reportDesign.formats` / `formatId` keep their names; their contents become Styles.
- Sharp corners in app CSS (`corners.test.js`).
- Blocks never mutate their inputs; the builder, layout and writers are pure (no DOM, no clock).

## Review Focus

1. **A report whose contents page or "(page N)" references push headings onto later pages** — the passes must settle (or stop at 3) and every printed page number must equal the page its target lands on. Pinned in Task 4.
2. **Text the standard fonts cannot show** (≥, ✓, emoji, CJK) — never a broken PDF or a crash; substituted and listed. Pinned in Tasks 1 and 4.
3. **A table taller than the page, or one cell taller than a page** — header repeats, nothing is lost silently, no infinite loop. Pinned in Task 5.
4. **PDF string escaping** — `(`, `)`, `\` and bytes ≥ 0x80 in text, titles and bookmarks must not corrupt the file. Pinned in Task 2.
5. **A Style with hostile values** (margins wider than the page, size 0, colour "red") — held to the nearest workable value with a message, never a negative-width layout or an endless page loop. Pinned in Task 3.

---

### Task 1: Standard-font widths and WinAnsi encoding

**Files:**
- Create: `scripts/gen-doc-fonts.mjs` (one-off generator; reads groff's devps metrics, which are Adobe's Core 14 AFM widths)
- Create: `DocGen/doc-fonts-data.js` (generated, committed)
- Create: `DocGen/doc-fonts.js`
- Modify: `scripts/build.js:17` (`EXTRA_SOURCES` gains `'DocGen/doc-fonts.js', 'DocGen/doc-fonts-data.js'`)
- Test: `test/docgen/fonts.test.js`

**Interfaces — Produces:**
- `FAMILIES: readonly ['helvetica','times','courier']`
- `fontName(family, bold, italic) → string` (PDF base font name; unknown family → helvetica)
- `FONT_NAMES: readonly string[]` (the 12, in a fixed order — the PDF writer numbers them by this)
- `toWinAnsi(text) → { text: string /* each char code 0..255 = WinAnsi code */, replaced: string[] /* distinct originals */ }`
- `textWidth(font, sizePt, winText) → number` (points)

- [ ] **Step 1: Write the generator and run it**

```js
#!/usr/bin/env node
/**
 * One-off: write DocGen/doc-fonts-data.js — the advance widths (1/1000 em) of the 12 PDF
 * standard fonts for WinAnsi codes 32..255. Read from groff's devps font files, which
 * afmtodit generated from Adobe's Core 14 AFMs (the widths every PDF reader uses for
 * the standard fonts). Run again only if the table needs regenerating.
 *
 *     node scripts/gen-doc-fonts.mjs [/usr/share/groff/1.23.0/font/devps]
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2] ?? '/usr/share/groff/1.23.0/font/devps';
const FILES = {
  Helvetica: 'HR', 'Helvetica-Bold': 'HB', 'Helvetica-Oblique': 'HI', 'Helvetica-BoldOblique': 'HBI',
  'Times-Roman': 'TR', 'Times-Bold': 'TB', 'Times-Italic': 'TI', 'Times-BoldItalic': 'TBI',
  Courier: 'CR', 'Courier-Bold': 'CB', 'Courier-Oblique': 'CI', 'Courier-BoldOblique': 'CBI',
};
const ASCII = ['space', 'exclam', 'quotedbl', 'numbersign', 'dollar', 'percent', 'ampersand', 'quotesingle', 'parenleft', 'parenright',
  'asterisk', 'plus', 'comma', 'hyphen', 'period', 'slash', 'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'colon', 'semicolon', 'less', 'equal', 'greater', 'question', 'at', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'bracketleft', 'backslash',
  'bracketright', 'asciicircum', 'underscore', 'grave', ...'abcdefghijklmnopqrstuvwxyz', 'braceleft', 'bar', 'braceright', 'asciitilde', 'bullet'];
const HIGH = ['Euro', null, 'quotesinglbase', 'florin', 'quotedblbase', 'ellipsis', 'dagger', 'daggerdbl', 'circumflex', 'perthousand', 'Scaron',
  'guilsinglleft', 'OE', null, 'Zcaron', null, null, 'quoteleft', 'quoteright', 'quotedblleft', 'quotedblright', 'bullet', 'endash', 'emdash',
  'tilde', 'trademark', 'scaron', 'guilsinglright', 'oe', null, 'zcaron', 'Ydieresis',
  'space', 'exclamdown', 'cent', 'sterling', 'currency', 'yen', 'brokenbar', 'section', 'dieresis', 'copyright', 'ordfeminine', 'guillemotleft',
  'logicalnot', 'hyphen', 'registered', 'macron', 'degree', 'plusminus', 'twosuperior', 'threesuperior', 'acute', 'mu', 'paragraph',
  'periodcentered', 'cedilla', 'onesuperior', 'ordmasculine', 'guillemotright', 'onequarter', 'onehalf', 'threequarters', 'questiondown',
  'Agrave', 'Aacute', 'Acircumflex', 'Atilde', 'Adieresis', 'Aring', 'AE', 'Ccedilla', 'Egrave', 'Eacute', 'Ecircumflex', 'Edieresis',
  'Igrave', 'Iacute', 'Icircumflex', 'Idieresis', 'Eth', 'Ntilde', 'Ograve', 'Oacute', 'Ocircumflex', 'Otilde', 'Odieresis', 'multiply',
  'Oslash', 'Ugrave', 'Uacute', 'Ucircumflex', 'Udieresis', 'Yacute', 'Thorn', 'germandbls',
  'agrave', 'aacute', 'acircumflex', 'atilde', 'adieresis', 'aring', 'ae', 'ccedilla', 'egrave', 'eacute', 'ecircumflex', 'edieresis',
  'igrave', 'iacute', 'icircumflex', 'idieresis', 'eth', 'ntilde', 'ograve', 'oacute', 'ocircumflex', 'otilde', 'odieresis', 'divide',
  'oslash', 'ugrave', 'uacute', 'ucircumflex', 'udieresis', 'yacute', 'thorn', 'ydieresis'];
const GLYPHS = [...ASCII, ...HIGH]; // codes 32..255
if (GLYPHS.length !== 224) throw new Error(`glyph table has ${GLYPHS.length} entries, not 224`);

/** psname -> width, from a groff font file's charset section. */
function widthsOf(file) {
  const lines = fs.readFileSync(path.join(DIR, file), 'latin1').split('\n');
  const at = lines.indexOf('charset');
  const out = {};
  for (const line of lines.slice(at + 1)) {
    const f = line.split('\t');
    if (f.length < 5 || f[1] === '"') continue;
    out[f[4]] = Number(f[1].split(',')[0]);
  }
  return out;
}

const table = {};
for (const [font, file] of Object.entries(FILES)) {
  const w = widthsOf(file);
  table[font] = GLYPHS.map((g) => (g && w[g] !== undefined ? w[g] : w.space));
}
const body = Object.entries(table).map(([f, ws]) => `  '${f}': [${ws.join(',')}],`).join('\n');
fs.writeFileSync('DocGen/doc-fonts-data.js', `// Generated by scripts/gen-doc-fonts.mjs from Adobe's Core 14 AFM widths (via groff devps). Do not edit.
/** Advance widths in 1/1000 em for WinAnsi codes 32..255, per PDF standard font. */
export const WIDTHS = {
${body}
};
`);
console.log('wrote DocGen/doc-fonts-data.js');
```

Run: `node scripts/gen-doc-fonts.mjs`
Expected: `wrote DocGen/doc-fonts-data.js`; the file has 12 arrays of 224 numbers; every Courier entry is 600.

- [ ] **Step 2: Write the failing test** — `test/docgen/fonts.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAMILIES, FONT_NAMES, fontName, toWinAnsi, textWidth } from '../../DocGen/doc-fonts.js';

test('the twelve standard fonts, by family, weight and slope', () => {
  assert.deepEqual(FAMILIES, ['helvetica', 'times', 'courier']);
  assert.equal(FONT_NAMES.length, 12);
  assert.equal(fontName('helvetica', false, false), 'Helvetica');
  assert.equal(fontName('times', true, true), 'Times-BoldItalic');
  assert.equal(fontName('courier', false, true), 'Courier-Oblique');
  assert.equal(fontName('comic', true, false), 'Helvetica-Bold', 'an unknown family falls back to Helvetica');
});

test('widths are Adobe\'s: Helvetica A 667, W 944; Times A 722; Courier always 600', () => {
  assert.equal(textWidth('Helvetica', 10, 'A'), 6.67);
  assert.equal(textWidth('Helvetica', 1000, 'W'), 944);
  assert.equal(textWidth('Times-Roman', 1000, 'A'), 722);
  assert.equal(textWidth('Courier', 10, 'abc'), 18);
  assert.equal(textWidth('Helvetica', 12, ''), 0);
});

test('text is encoded as WinAnsi: Latin-1 as is, curly quotes and dashes to their codes', () => {
  const r = toWinAnsi('“Café” – €5…');
  assert.deepEqual([...r.text].map((c) => c.charCodeAt(0)), [147, 67, 97, 102, 233, 148, 32, 150, 32, 128, 53, 133]);
  assert.deepEqual(r.replaced, []);
});

test('what the fonts cannot show is substituted, and listed once each', () => {
  const r = toWinAnsi('a ≥ b, ✓ done, ✓ again, 中\tx');
  assert.equal(r.text, 'a >= b, Yes done, Yes again, ? x');
  assert.deepEqual(r.replaced, ['≥', '✓', '中']);
});
```

Run: `node --test test/docgen/fonts.test.js` → Expected: FAIL (module not found).

- [ ] **Step 3: Write `DocGen/doc-fonts.js`**

```js
import { WIDTHS } from './doc-fonts-data.js';

/** The font families a Style can choose: the PDF standard fonts, so nothing is embedded. */
export const FAMILIES = Object.freeze(['helvetica', 'times', 'courier']);

const NAMES = {
  helvetica: ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'],
  times: ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'],
  courier: ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'],
};
/** All twelve, in a fixed order. */
export const FONT_NAMES = Object.freeze([...NAMES.helvetica, ...NAMES.times, ...NAMES.courier]);

/** The PDF base font for a family, weight and slope. @param {string} family @param {boolean} bold @param {boolean} italic */
export function fontName(family, bold, italic) {
  const f = NAMES[/** @type {keyof typeof NAMES} */ (family)] ?? NAMES.helvetica;
  return f[(bold ? 1 : 0) + (italic ? 2 : 0)];
}

/** Unicode characters WinAnsi places in 0x80..0x9F. */
const HIGH = new Map([[0x20AC, 128], [0x201A, 130], [0x0192, 131], [0x201E, 132], [0x2026, 133], [0x2020, 134], [0x2021, 135],
  [0x02C6, 136], [0x2030, 137], [0x0160, 138], [0x2039, 139], [0x0152, 140], [0x017D, 142], [0x2018, 145], [0x2019, 146],
  [0x201C, 147], [0x201D, 148], [0x2022, 149], [0x2013, 150], [0x2014, 151], [0x02DC, 152], [0x2122, 153], [0x0161, 154],
  [0x203A, 155], [0x0153, 156], [0x017E, 158], [0x0178, 159]]);

/** What a character the fonts cannot show is written as instead. */
const SUBS = new Map([['≥', '>='], ['≤', '<='], ['≠', '!='], ['✓', 'Yes'], ['✔', 'Yes'], ['✗', 'No'], ['✘', 'No'], ['→', '->'], ['←', '<-']]);

/**
 * Text as WinAnsi: each character of the result is one byte, its code the WinAnsi code.
 * A tab is a space; anything else the fonts cannot show is substituted (or `?`), and
 * listed in `replaced`, once each, in the order first met.
 * @param {string} text
 */
export function toWinAnsi(text) {
  let out = '';
  /** @type {string[]} */
  const replaced = [];
  for (const ch of String(text ?? '')) {
    const cp = /** @type {number} */ (ch.codePointAt(0));
    if (ch === '\t') { out += ' '; continue; }
    if ((cp >= 0x20 && cp <= 0x7E) || (cp >= 0xA0 && cp <= 0xFF)) { out += ch; continue; }
    const hi = HIGH.get(cp);
    if (hi !== undefined) { out += String.fromCharCode(hi); continue; }
    if (cp < 0x20) continue; // control characters print nothing
    if (!replaced.includes(ch)) replaced.push(ch);
    out += SUBS.get(ch) ?? '?';
  }
  return { text: out, replaced };
}

/**
 * The width of WinAnsi text in a font at a size, in points.
 * @param {string} font a FONT_NAMES entry @param {number} size points @param {string} winText from toWinAnsi
 */
export function textWidth(font, size, winText) {
  const w = WIDTHS[/** @type {keyof typeof WIDTHS} */ (font)] ?? WIDTHS.Helvetica;
  let units = 0;
  for (let i = 0; i < winText.length; i++) {
    const c = winText.charCodeAt(i);
    units += c >= 32 && c <= 255 ? w[c - 32] : 0;
  }
  return Math.round(units * size) / 1000;
}
```

- [ ] **Step 4: Run tests, suite, typecheck** — `node --test test/docgen/fonts.test.js && npm test 2>&1 | grep -E "ℹ (pass|fail)" && npm run typecheck` → all pass. (If `tsconfig.json` does not include `DocGen/`, nothing to do; if it includes it and complains about `WIDTHS` indexing, keep the casts shown.)

- [ ] **Step 5: Register the files in the build and commit**

Add `'DocGen/doc-fonts.js', 'DocGen/doc-fonts-data.js'` to `EXTRA_SOURCES` in `scripts/build.js`. Run `npm run build` (expect `OK wrote …`).

```bash
git add scripts/gen-doc-fonts.mjs DocGen/doc-fonts.js DocGen/doc-fonts-data.js scripts/build.js test/docgen/fonts.test.js
git commit -m "Report engine: the PDF standard fonts' widths (Adobe's, generated once from groff's metrics) and WinAnsi encoding, with what the fonts cannot show substituted and listed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The PDF writer

**Files:**
- Create: `DocGen/doc-pdf.js`
- Create: `test/docgen/pdf-read.js` (a minimal PDF reader for tests)
- Modify: `scripts/build.js` (`EXTRA_SOURCES` += `'DocGen/doc-pdf.js'`)
- Test: `test/docgen/pdf.test.js`

**Interfaces:**
- Consumes: `FONT_NAMES` (Task 1).
- Produces:
  - Page/Item shapes (shared with Task 4):
    ```
    Page = { size: [w, h], items: Item[] }      // points, origin top-left
    Item = { kind: 'text', x, y /* baseline */, font, size, colour /* '#rrggbb' */, text /* WinAnsi */ }
         | { kind: 'rule', x1, y1, x2, y2, width, colour }
         | { kind: 'fill', x, y, w, h, colour }
         | { kind: 'link', x, y, w, h, to /* anchor name */ }
    ```
  - `writePdf(pages, { title?, anchors?: Record<string, {page:number,y:number}>, outline?: {title:string, anchor:string, level:number}[], producer?, date?: string /* ISO */ }) → Uint8Array`

Ruling carried from the spec: the content streams are written **uncompressed** — `CompressionStream` is asynchronous and the writer is synchronous and deterministic; report sizes make compression unnecessary.

- [ ] **Step 1: Write the test reader** — `test/docgen/pdf-read.js`

```js
/**
 * A minimal PDF reader for tests: checks the cross-reference table and pulls out what the
 * writer put in — objects, pages in order, each page's text, link targets, bookmarks.
 * Only the subset PIVOT writes (uncompressed, one xref section).
 * @param {Uint8Array} bytes
 */
export function readPdf(bytes) {
  const s = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  if (!s.startsWith('%PDF-1.')) throw new Error('no PDF header');
  const sx = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(s);
  if (!sx) throw new Error('no startxref');
  const xrefAt = Number(sx[1]);
  if (!s.startsWith('xref', xrefAt)) throw new Error(`startxref ${xrefAt} does not point at xref`);
  const head = /^xref\s+0 (\d+)\s+/.exec(s.slice(xrefAt));
  if (!head) throw new Error('bad xref header');
  const count = Number(head[1]);
  const entries = s.slice(xrefAt + head[0].length).split('\n').slice(0, count);
  /** @type {Record<number, string>} */
  const objects = {};
  entries.forEach((e, n) => {
    if (n === 0) return;
    const off = Number(e.slice(0, 10));
    const m = new RegExp(`^${n} 0 obj\\s*([\\s\\S]*?)\\s*endobj`).exec(s.slice(off));
    if (!m) throw new Error(`object ${n} is not at offset ${off}`);
    objects[n] = m[1];
  });
  const trailer = /trailer\s*<<([\s\S]*?)>>\s*startxref/.exec(s)?.[1] ?? '';
  const ref = (/** @type {string} */ dict, /** @type {string} */ key) => Number(new RegExp(`/${key} (\\d+) 0 R`).exec(dict)?.[1]);
  const root = objects[ref(trailer, 'Root')];
  const kids = [.../\/Kids \[([^\]]*)\]/.exec(objects[ref(root, 'Pages')])?.[1].matchAll(/(\d+) 0 R/g) ?? []].map((m) => Number(m[1]));
  const unescape = (/** @type {string} */ t) => t.replace(/\\([0-7]{3}|.)/g, (_, c) => (c.length === 3 ? String.fromCharCode(parseInt(c, 8)) : c));
  const pages = kids.map((k) => {
    const obj = objects[k];
    const stream = /stream\n([\s\S]*?)\nendstream/.exec(objects[ref(obj, 'Contents')])?.[1] ?? '';
    const text = [...stream.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) => unescape(m[1]));
    const annots = [.../\/Annots \[([^\]]*)\]/.exec(obj)?.[1].matchAll(/(\d+) 0 R/g) ?? []].map((m) => objects[Number(m[1])]);
    const links = annots.map((a) => kids.indexOf(Number(/\/Dest \[(\d+) 0 R/.exec(a)?.[1])));
    const fonts = [...obj.matchAll(/\/(F\d+) (\d+) 0 R/g)].map((m) => /\/BaseFont \/([\w-]+)/.exec(objects[Number(m[2])])?.[1]);
    return { obj, stream, text, links, fonts, mediaBox: /\/MediaBox \[([^\]]*)\]/.exec(obj)?.[1].trim().split(/\s+/).map(Number) };
  });
  const hex = (/** @type {string} */ h) => { let out = ''; for (let i = 4; i < h.length; i += 4) out += String.fromCharCode(parseInt(h.slice(i, i + 4), 16)); return out; };
  const outlines = Object.values(objects).filter((o) => /\/Title </.test(o) && /\/Parent /.test(o))
    .map((o) => ({ title: hex(/\/Title <([0-9A-F]+)>/.exec(o)?.[1] ?? ''), page: kids.indexOf(Number(/\/Dest \[(\d+) 0 R/.exec(o)?.[1])) }));
  const info = objects[ref(trailer, 'Info')] ?? '';
  return { objects, pages, outlines, title: hex(/\/Title <([0-9A-F]+)>/.exec(info)?.[1] ?? '') };
}
```

- [ ] **Step 2: Write the failing tests** — `test/docgen/pdf.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writePdf } from '../../DocGen/doc-pdf.js';
import { readPdf } from './pdf-read.js';

const A4 = [595.28, 841.89];
const text = (x, y, t, font = 'Helvetica', size = 11) => ({ kind: 'text', x, y, font, size, colour: '#000000', text: t });

test('a well-formed PDF: header, every object where the xref says, pages in order with their size', () => {
  const pdf = readPdf(writePdf([{ size: A4, items: [text(72, 80, 'One')] }, { size: [612, 792], items: [text(72, 80, 'Two')] }], { title: 'Report' }));
  assert.equal(pdf.pages.length, 2);
  assert.deepEqual(pdf.pages[0].mediaBox, [0, 0, 595.28, 841.89]);
  assert.deepEqual(pdf.pages[1].mediaBox, [0, 0, 612, 792]);
  assert.deepEqual(pdf.pages.map((p) => p.text), [['One'], ['Two']]);
  assert.equal(pdf.title, 'Report');
});

test('text is placed with y flipped, in its font, size and colour; only the fonts used are listed', () => {
  const pdf = readPdf(writePdf([{ size: A4, items: [{ ...text(72, 100, 'Hi', 'Times-Bold', 14), colour: '#ff0000' }] }]));
  assert.match(pdf.pages[0].stream, /BT \/F\d+ 14 Tf 1 0 0 rg 72 741\.89 Td \(Hi\) Tj ET/);
  assert.deepEqual(pdf.pages[0].fonts, ['Times-Bold']);
});

test('brackets, backslashes and high bytes in text are escaped and read back unchanged', () => {
  const tricky = 'a (b) \\ c ' + String.fromCharCode(233, 147, 148);
  assert.deepEqual(readPdf(writePdf([{ size: A4, items: [text(72, 80, tricky)] }])).pages[0].text, [tricky]);
});

test('rules and fills are drawn', () => {
  const pdf = readPdf(writePdf([{ size: A4, items: [
    { kind: 'fill', x: 72, y: 100, w: 200, h: 20, colour: '#d9e2f3' },
    { kind: 'rule', x1: 72, y1: 120, x2: 272, y2: 120, width: 0.5, colour: '#000000' },
  ] }]));
  assert.match(pdf.pages[0].stream, /0\.851 0\.886 0\.953 rg 72 721\.89 200 20 re f/);
  assert.match(pdf.pages[0].stream, /0 0 0 RG 0\.5 w 72 721\.89 m 272 721\.89 l S/);
});

test('links land on the page their anchor is on; bookmarks follow the headings, nested by level', () => {
  const anchors = { 'sec-a': { page: 0, y: 72 }, 'sec-b': { page: 1, y: 72 }, 'sec-b1': { page: 1, y: 300 } };
  const pages = [{ size: A4, items: [text(72, 80, 'A'), { kind: 'link', x: 72, y: 90, w: 50, h: 12, to: 'sec-b' }] }, { size: A4, items: [text(72, 80, 'B')] }];
  const pdf = readPdf(writePdf(pages, { anchors, outline: [{ title: 'A (intro)', anchor: 'sec-a', level: 1 }, { title: 'B', anchor: 'sec-b', level: 1 }, { title: 'B.1 é', anchor: 'sec-b1', level: 2 }] }));
  assert.deepEqual(pdf.pages[0].links, [1]);
  assert.deepEqual(pdf.outlines.map((o) => [o.title, o.page]).sort(), [['A (intro)', 0], ['B', 1], ['B.1 é', 1]]);
  assert.match(Object.values(pdf.objects).find((o) => /\/Type \/Outlines/.test(o)) ?? '', /\/Count 3/);
});

test('a link to an anchor that does not exist is left out, not a broken annotation', () => {
  const pdf = readPdf(writePdf([{ size: A4, items: [{ kind: 'link', x: 1, y: 1, w: 1, h: 1, to: 'nowhere' }] }]));
  assert.deepEqual(pdf.pages[0].links, []);
});
```

Run: `node --test test/docgen/pdf.test.js` → FAIL (module not found).

- [ ] **Step 3: Write `DocGen/doc-pdf.js`**

```js
import { FONT_NAMES } from './doc-fonts.js';

/** @typedef {{ size: [number, number], items: any[] }} Page */

/** A number as PDF writes it: at most three decimals, no trailing zeros. @param {number} n */
const num = (n) => String(Math.round(n * 1000) / 1000);
/** '#rrggbb' as three PDF colour components. @param {string} c */
function rgb(c) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c ?? ''));
  const v = m ? m[1] : '000000';
  return [0, 2, 4].map((i) => num(parseInt(v.slice(i, i + 2), 16) / 255)).join(' ');
}
/** A WinAnsi string as a PDF literal string: brackets and backslash escaped, other bytes outside ASCII as octal. @param {string} s */
function lit(s) {
  let out = '(';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x28 || c === 0x29 || c === 0x5C) out += '\\' + s[i];
    else if (c < 32 || c > 126) out += '\\' + (c & 0xFF).toString(8).padStart(3, '0');
    else out += s[i];
  }
  return out + ')';
}
/** Any text as a UTF-16BE hex string (titles and bookmarks may be any Unicode). @param {string} s */
function hex(s) {
  let out = '<FEFF';
  for (let i = 0; i < s.length; i++) out += s.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0');
  return out + '>';
}
/** An ISO date as a PDF date. @param {string} iso */
function pdfDate(iso) {
  const d = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(String(iso ?? ''));
  return d ? `(D:${d.slice(1).join('')})` : '(D:20000101000000)';
}

/**
 * Pages to a PDF file. Pages are in points from the top-left; PDF counts from the
 * bottom-left, so every y is flipped here. Text is WinAnsi in the standard fonts.
 * @param {Page[]} pages
 * @param {{ title?: string, anchors?: Record<string, { page: number, y: number }>,
 *   outline?: { title: string, anchor: string, level: number }[], producer?: string, date?: string }} [opts]
 * @returns {Uint8Array}
 */
export function writePdf(pages, opts = {}) {
  const anchors = opts.anchors ?? {};
  /** @type {string[]} object bodies; object n is objs[n - 1] */
  const objs = [];
  const reserve = () => { objs.push(''); return objs.length; };
  const set = (/** @type {number} */ n, /** @type {string} */ body) => { objs[n - 1] = body; };
  const catalog = reserve();
  const pagesObj = reserve();
  const used = FONT_NAMES.filter((f) => pages.some((p) => p.items.some((it) => it.kind === 'text' && it.font === f)));
  const fontObj = Object.fromEntries(used.map((f) => {
    const n = reserve();
    set(n, `<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`);
    return [f, n];
  }));
  const fontRes = used.map((f) => `/F${FONT_NAMES.indexOf(f) + 1} ${fontObj[f]} 0 R`).join(' ');
  const pageObjs = pages.map(() => reserve());
  const dest = (/** @type {string} */ to) => {
    const a = anchors[to];
    if (!a || !pages[a.page]) return null;
    return `[${pageObjs[a.page]} 0 R /XYZ 0 ${num(pages[a.page].size[1] - a.y + 4)} null]`;
  };
  pages.forEach((p, i) => {
    const h = p.size[1];
    const ops = [];
    for (const it of p.items) {
      if (it.kind === 'fill') ops.push(`${rgb(it.colour)} rg ${num(it.x)} ${num(h - it.y - it.h)} ${num(it.w)} ${num(it.h)} re f`);
      else if (it.kind === 'rule') ops.push(`${rgb(it.colour)} RG ${num(it.width)} w ${num(it.x1)} ${num(h - it.y1)} m ${num(it.x2)} ${num(h - it.y2)} l S`);
      else if (it.kind === 'text') ops.push(`BT /F${FONT_NAMES.indexOf(it.font) + 1} ${num(it.size)} Tf ${rgb(it.colour)} rg ${num(it.x)} ${num(h - it.y)} Td ${lit(it.text)} Tj ET`);
    }
    const content = ops.join('\n');
    const contentObj = reserve();
    set(contentObj, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const annots = p.items.filter((it) => it.kind === 'link').map((it) => {
      const d = dest(it.to);
      if (!d) return null;
      const n = reserve();
      set(n, `<< /Type /Annot /Subtype /Link /Rect [${num(it.x)} ${num(h - it.y - it.h)} ${num(it.x + it.w)} ${num(h - it.y)}] /Border [0 0 0] /Dest ${d} >>`);
      return `${n} 0 R`;
    }).filter(Boolean);
    set(pageObjs[i], `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${num(p.size[0])} ${num(h)}] /Resources << /Font << ${fontRes} >> >> /Contents ${contentObj} 0 R${annots.length ? ` /Annots [${annots.join(' ')}]` : ''} >>`);
  });
  set(pagesObj, `<< /Type /Pages /Kids [${pageObjs.map((n) => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>`);

  // Bookmarks: a tree from the flat heading list, nested by level.
  const marks = (opts.outline ?? []).filter((o) => dest(o.anchor));
  let outlinesObj = 0;
  if (marks.length) {
    outlinesObj = reserve();
    /** @type {{ n: number, mark: any, kids: any[], parent: any }[]} */
    const nodes = [];
    const root = { n: outlinesObj, mark: null, kids: /** @type {any[]} */ ([]), parent: null, level: 0 };
    let stack = [root];
    for (const m of marks) {
      const level = Math.max(1, m.level);
      while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
      const parent = stack[stack.length - 1];
      const node = { n: reserve(), mark: m, kids: [], parent, level };
      parent.kids.push(node);
      nodes.push(node);
      stack.push(node);
    }
    const count = (/** @type {any} */ node) => node.kids.reduce((s, k) => s + 1 + count(k), 0);
    for (const node of nodes) {
      const sib = node.parent.kids;
      const i = sib.indexOf(node);
      const parts = [`/Title ${hex(node.mark.title)}`, `/Parent ${node.parent.n} 0 R`, `/Dest ${dest(node.mark.anchor)}`];
      if (i > 0) parts.push(`/Prev ${sib[i - 1].n} 0 R`);
      if (i < sib.length - 1) parts.push(`/Next ${sib[i + 1].n} 0 R`);
      if (node.kids.length) parts.push(`/First ${node.kids[0].n} 0 R`, `/Last ${node.kids[node.kids.length - 1].n} 0 R`, `/Count ${count(node)}`);
      set(node.n, `<< ${parts.join(' ')} >>`);
    }
    set(outlinesObj, `<< /Type /Outlines /First ${root.kids[0].n} 0 R /Last ${root.kids[root.kids.length - 1].n} 0 R /Count ${count(root)} >>`);
  }
  set(catalog, `<< /Type /Catalog /Pages ${pagesObj} 0 R${outlinesObj ? ` /Outlines ${outlinesObj} 0 R /PageMode /UseOutlines` : ''} >>`);
  const info = reserve();
  set(info, `<< /Title ${hex(opts.title ?? '')} /Producer ${hex(opts.producer ?? 'PIVOT')} /CreationDate ${pdfDate(opts.date ?? '')} >>`);

  let out = '%PDF-1.4\n%' + String.fromCharCode(0xE2, 0xE3, 0xCF, 0xD3) + '\n';
  const offsets = objs.map((body, i) => { const at = out.length; out += `${i + 1} 0 obj\n${body}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xFF;
  return bytes;
}
```

Note the xref entry lines are 20 bytes (`nnnnnnnnnn ggggg n \n`), which the reader's `split('\n')` handles because each ends in `\n`.

- [ ] **Step 4: Run tests, suite, typecheck** → pass. If the colour regex in the test differs only by rounding (e.g. `0.851` vs `0.85`), fix the **test** expectation to what `num()` writes (three decimals) — the writer's rounding is the contract.

- [ ] **Step 5: Build and commit**

Add `'DocGen/doc-pdf.js'` to `EXTRA_SOURCES`; `npm run build`.
```bash
git add DocGen/doc-pdf.js test/docgen/pdf-read.js test/docgen/pdf.test.js scripts/build.js
git commit -m "Report engine: a PDF writer — pages of text, rules and fills in the standard fonts, links to anchors, bookmarks from the headings — and a small reader that checks what it writes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: Styles — the model, its limits, and converting old profiles

**Files:**
- Create: `DocGen/doc-style.js`
- Modify: `scripts/build.js` (`EXTRA_SOURCES` += `'DocGen/doc-style.js'`)
- Test: `test/docgen/style.test.js`

**Interfaces — Produces:**
- `PAPERS: readonly ['a4','letter','a5','legal']`, `TEXT_KEYS` (13, in display order), `TEXT_LABELS: Record<key,string>`
- `STANDARD` (frozen built-in Style, id `'standard'`)
- `normaliseStyle(raw) → { style, held: string[] }` — every field present and within limits; `held` names each given value that was changed
- `fromProfile(profile, familyOf?) → Style` — an old formatting profile as a Style (used by `scripts/convert-to-v6.mjs` and by import)
- `isStyle(x) → boolean` — has the Style shape (`text` and `page.margins`), as opposed to an old profile

- [ ] **Step 1: Write the failing tests** — `test/docgen/style.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STANDARD, TEXT_KEYS, normaliseStyle, fromProfile, isStyle } from '../../DocGen/doc-style.js';

test('the Standard style is complete and within its own limits', () => {
  const { style, held } = normaliseStyle(STANDARD);
  assert.deepEqual(held, []);
  assert.deepEqual(Object.keys(style.text), TEXT_KEYS);
  assert.equal(style.page.paper, 'a4');
  assert.ok(isStyle(style));
});

test('a partial style is filled from Standard', () => {
  const { style, held } = normaliseStyle({ id: 'x', name: 'Mine', text: { body: { size: 12 } } });
  assert.deepEqual(held, []);
  assert.equal(style.text.body.size, 12);
  assert.equal(style.text.body.family, STANDARD.text.body.family);
  assert.equal(style.text.h1.size, STANDARD.text.h1.size);
  assert.equal(style.name, 'Mine');
});

test('impossible values are held to the nearest workable one, and each is named', () => {
  const { style, held } = normaliseStyle({
    page: { paper: 'A9', margins: { top: -3, bottom: 25, left: 120, right: 120 } },
    text: { body: { size: 0, colour: 'red', family: 'comic', align: 'middle' } },
    tables: { borders: 'zigzag', padding: 99 },
    toc: { depth: 9 },
  });
  assert.equal(style.page.paper, 'a4');
  assert.equal(style.page.margins.top, 5);
  const textWidth = 210 - style.page.margins.left - style.page.margins.right;
  assert.ok(textWidth >= 60, `text width ${textWidth}mm`);
  assert.equal(style.text.body.size, 6);
  assert.equal(style.text.body.colour, STANDARD.text.body.colour);
  assert.equal(style.text.body.family, 'helvetica');
  assert.equal(style.text.body.align, STANDARD.text.body.align);
  assert.equal(style.tables.borders, 'all');
  assert.equal(style.tables.padding, 10);
  assert.equal(style.toc.depth, 4);
  for (const word of ['Paper', 'Top margin', 'Body size', 'Body colour', 'Body font', 'Table borders', 'Cell padding', 'Contents depth']) {
    assert.ok(held.some((h) => h.startsWith(word)), `${word} held: ${held.join(' | ')}`);
  }
});

test('an old formatting profile becomes a Style: sizes, margins, levels, tables, header and footer', () => {
  const old = {
    id: 'p1', name: 'House',
    page: { paper: 'letter', marginTop: '20mm', marginBottom: '2cm', marginLeft: '25', marginRight: '25mm', fontSize: '11pt', lineSpacing: 1.3, fontFamily: 'tgheros' },
    headings: { numbered: false },
    levels: [{ level: 0, size: 22, bold: true }, { level: 1, size: 15, bold: true, pageBreakBefore: true, spaceBefore: 14, spaceAfter: 5 }, { level: 2, size: 12, italic: true }],
    headerFooter: { firstDifferent: true, header: { left: 'Left', centre: '', right: '#page' }, footer: { left: '', centre: 'x', right: '' } },
    toc: { include: false, depth: 2 },
    tables: { fontSize: 8, headFontSize: 8.5, headBold: true, head: { shade: '#112233' }, firstColumn: { shade: '#445566' }, firstColBold: true, captionPosition: 'above', captionItalic: false, captionBold: true, captionFontSize: 9, centre: true },
  };
  const s = fromProfile(old);
  assert.deepEqual([s.id, s.name, s.page.paper], ['p1', 'House', 'letter']);
  assert.deepEqual(s.page.margins, { top: 20, bottom: 20, left: 25, right: 25 });
  assert.deepEqual([s.text.body.size, s.text.body.lineSpacing, s.text.body.family], [11, 1.3, 'helvetica']);
  assert.deepEqual([s.text.title.size, s.text.h1.size, s.text.h1.pageBreakBefore, s.text.h1.spaceBefore, s.text.h2.italic], [22, 15, true, 14, true]);
  assert.equal(s.numbering.on, false);
  assert.deepEqual([s.toc.include, s.toc.depth], [false, 2]);
  assert.deepEqual([s.tables.fontSize, s.tables.header.size, s.tables.header.fill, s.tables.firstColumn.on, s.tables.firstColumn.fill, s.tables.captionPosition, s.tables.align], [8, 8.5, '#112233', true, '#445566', 'above', 'centre']);
  assert.deepEqual([s.text.caption.bold, s.text.caption.italic, s.text.caption.size], [true, false, 9]);
  assert.deepEqual(s.headerFooter.header, { left: 'Left', centre: '', right: '#page' });
  assert.equal(s.headerFooter.firstDifferent, true);
  assert.deepEqual(normaliseStyle(s).held, []);
});

test('the font a profile named maps to the nearest standard family', () => {
  const fam = (f) => fromProfile({ page: { fontFamily: f } }).text.body.family;
  assert.deepEqual([fam(''), fam('tgtermes'), fam('tgheros'), fam('tgadventor'), fam('charter')], ['times', 'times', 'helvetica', 'helvetica', 'times']);
});
```

Run: `node --test test/docgen/style.test.js` → FAIL (module not found).

- [ ] **Step 2: Write `DocGen/doc-style.js`**

```js
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
```

- [ ] **Step 3: Run tests, suite, typecheck** → pass. If the `held` wording test misses a word, change the **message label** in the code to start with that word (the test is the contract for what the designer shows).

- [ ] **Step 4: Build and commit** — add `'DocGen/doc-style.js'` to `EXTRA_SOURCES`; `npm run build`.
```bash
git add DocGen/doc-style.js test/docgen/style.test.js scripts/build.js
git commit -m "Report Styles: the built-in Standard, every setting held within workable limits with a message, and old formatting profiles converted

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The layout engine — text, flow, pages, headers and footers, contents, references

**Files:**
- Create: `DocGen/doc-layout.js`
- Modify: `scripts/build.js` (`EXTRA_SOURCES` += `'DocGen/doc-layout.js'`)
- Test: `test/docgen/layout.test.js`

**Interfaces:**
- Consumes: Task 1 (`fontName`, `toWinAnsi`, `textWidth`), Task 3 (`normaliseStyle`, `PAPER_MM`), Task 2's Page/Item shapes.
- Produces — the **Document** shape (Task 7 builds it):
  ```
  Document = { title, meta: { title, platform, date, marking }, blocks: Block[] }
  Block = { kind: 'heading', level: 0..4, number, anchor, runs, centre?, pageBreakBefore?, spaceBefore? /* mm */, noToc? }
        | { kind: 'paragraph', style: 'body'|'caption'|'code', runs, centre?, anchor? }
        | { kind: 'table', anchor?, caption?: { runs }, titleRow?: runs, columns: { width?: number /* fraction */, align?: 'left'|'centre'|'right' }[],
            header: Run[][], rows: Run[][][], key?: number, rowHeight?: number /* mm */, tallRows?: boolean[], centre? }
        | { kind: 'toc' } | { kind: 'pageBreak' } | { kind: 'space', mm } | { kind: 'rule' }
  Run = { text, bold?, italic?, code?, br?, ref?: { anchor } }
  ```
- Produces: `layout(doc, style) → { pages: Page[], anchors: Record<string,{page,y}>, headings: {title,anchor,level}[], replaced: string[], passes: number }`

The table half of `layoutTable` is Task 5; this task writes a simple placeholder that lays a table out as its rows of text (no grid), so the flow can be tested, and Task 5 replaces it.

- [ ] **Step 1: Write the failing tests** — `test/docgen/layout.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, MM } from '../../DocGen/doc-layout.js';
import { normaliseStyle } from '../../DocGen/doc-style.js';
import { textWidth } from '../../DocGen/doc-fonts.js';

const style = (over = {}) => normaliseStyle(over).style;
const para = (text, extra = {}) => ({ kind: 'paragraph', style: 'body', runs: [{ text }], ...extra });
const head = (level, text, anchor, extra = {}) => ({ kind: 'heading', level, number: level ? '1' : '', anchor, runs: [{ text }], ...extra });
const doc = (blocks, meta = {}) => ({ title: 'T', meta: { title: 'T', platform: 'Alpha', date: '2026-10-12', marking: '', ...meta }, blocks });
const texts = (page) => page.items.filter((i) => i.kind === 'text');
const words = (page) => texts(page).map((t) => t.text).join(' ');
const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua';

test('one short paragraph: one page, A4, the text inside the margins', () => {
  const r = layout(doc([para('Hello world')]), style());
  assert.equal(r.pages.length, 1);
  assert.deepEqual(r.pages[0].size, [595.28, 841.89]);
  const t = texts(r.pages[0]).filter((i) => i.text === 'Hello');
  assert.equal(t.length, 1);
  assert.ok(Math.abs(t[0].x - 25 * MM) < 0.01);
  assert.ok(t[0].y > 25 * MM && t[0].y < 25 * MM + 20);
});

test('long text wraps within the text width; every line fits', () => {
  const s = style({ text: { body: { align: 'left' } } });
  const r = layout(doc([para(LOREM.repeat(3))]), s);
  const right = 595.28 - 25 * MM;
  for (const t of texts(r.pages[0])) assert.ok(t.x + textWidth(t.font, t.size, t.text) <= right + 0.01, `"${t.text}" overruns`);
  const lines = new Set(texts(r.pages[0]).map((t) => t.y));
  assert.ok(lines.size > 2);
});

test('alignment: centre and right place a short line in the middle and at the margin', () => {
  const W = 595.28 - 50 * MM;
  const w = textWidth('Helvetica', 10.5, 'Hi');
  const at = (align) => texts(layout(doc([para('Hi')]), style({ text: { body: { align } } })).pages[0]).find((t) => t.text === 'Hi').x;
  assert.ok(Math.abs(at('centre') - (25 * MM + (W - w) / 2)) < 0.01);
  assert.ok(Math.abs(at('right') - (25 * MM + W - w)) < 0.01);
});

test('justified lines reach the right margin, except the last', () => {
  const r = layout(doc([para(LOREM.repeat(4))]), style({ text: { body: { align: 'justify' } } }));
  const byLine = new Map();
  for (const t of texts(r.pages[0])) byLine.set(t.y, [...(byLine.get(t.y) ?? []), t]);
  const ends = [...byLine.values()].map((ts) => { const last = ts[ts.length - 1]; return last.x + textWidth(last.font, last.size, last.text); });
  const right = 595.28 - 25 * MM;
  ends.slice(0, -1).forEach((e) => assert.ok(Math.abs(e - right) < 0.05));
  assert.ok(ends[ends.length - 1] < right - 1);
});

test('a word wider than the line is broken across lines', () => {
  const r = layout(doc([para('x'.repeat(400))]), style());
  assert.ok(texts(r.pages[0]).length > 1);
});

test('content flows onto new pages; a long paragraph splits, leaving at least two lines each side', () => {
  const r = layout(doc(Array.from({ length: 30 }, () => para(LOREM.repeat(2)))), style());
  assert.ok(r.pages.length > 1);
  for (const p of r.pages) for (const t of texts(p)) assert.ok(t.y < 841.89 - 25 * MM + 0.01, 'nothing below the bottom margin');
});

test('a heading is kept with what follows: it never sits alone at the foot of a page', () => {
  const blocks = [];
  for (let i = 0; i < 40; i++) blocks.push(head(1, `Section ${i}`, `sec-${i}`), para(LOREM));
  const r = layout(doc(blocks), style());
  for (let p = 0; p < r.pages.length - 1; p++) {
    const ts = texts(r.pages[p]);
    const lastHeading = ts.filter((t) => t.text.startsWith('Section') || /^\d+$/.test(t.text)).pop();
    const lastText = ts[ts.length - 1];
    assert.ok(!lastHeading || lastHeading.y < lastText.y, `page ${p + 1} ends on a heading`);
  }
});

test('a heading that starts a page, by the block or by its style, starts one', () => {
  const r = layout(doc([para('a'), head(1, 'B', 'sec-b', { pageBreakBefore: true }), para('c')]), style());
  assert.equal(r.pages.length, 2);
  assert.equal(r.anchors['sec-b'].page, 1);
  const r2 = layout(doc([para('a'), head(1, 'B', 'sec-b')]), style({ text: { h1: { pageBreakBefore: true } } }));
  assert.equal(r2.anchors['sec-b'].page, 1);
  const r3 = layout(doc([head(1, 'B', 'sec-b', { pageBreakBefore: true })]), style());
  assert.equal(r3.pages.length, 1, 'no blank first page');
});

test('a page break block and a space block', () => {
  const r = layout(doc([para('a'), { kind: 'pageBreak' }, para('b')]), style());
  assert.equal(r.pages.length, 2);
  const a = texts(layout(doc([para('a'), { kind: 'space', mm: 50 }, para('b')]), style()).pages[0]);
  assert.ok(a.find((t) => t.text === 'b').y - a.find((t) => t.text === 'a').y > 50 * MM);
});

test('header and footer slots carry their fields; a different first page uses its own', () => {
  const s = style({ headerFooter: { firstDifferent: true, firstFooter: { centre: 'Cover' }, header: { left: '#title', right: '#platform #date' }, footer: { centre: 'Page #page of #pages' } } });
  const r = layout(doc([para('a'), { kind: 'pageBreak' }, para('b'), { kind: 'pageBreak' }, para('c')]), s);
  assert.equal(r.pages.length, 3);
  assert.match(words(r.pages[0]), /Cover/);
  assert.doesNotMatch(words(r.pages[0]), /Page 1/);
  assert.match(words(r.pages[1]), /Page 2 of 3/);
  assert.match(words(r.pages[1]), /T .*Alpha 2026-10-12|Alpha 2026-10-12.*T/);
});

test('the marking is printed at the top and bottom of every page, when there is one', () => {
  const r = layout(doc([para('a'), { kind: 'pageBreak' }, para('b')], { marking: 'OFFICIAL: Sensitive' }), style());
  for (const p of r.pages) {
    const m = texts(p).filter((t) => t.text.includes('OFFICIAL'));
    assert.equal(m.length, 2);
    assert.ok(m[0].y < 25 * MM && m[1].y > 841.89 - 25 * MM);
  }
  const off = layout(doc([para('a')], { marking: 'OFFICIAL' }), style({ marking: { show: false } }));
  assert.doesNotMatch(words(off.pages[0]), /OFFICIAL/);
});

test('the contents lists headings to its depth with the pages they land on, as links', () => {
  const blocks = [head(1, 'Contents', 'sec-toc', { noToc: true }), { kind: 'toc' }, { kind: 'pageBreak' }];
  for (let i = 1; i <= 3; i++) blocks.push(head(1, `Part ${i}`, `sec-${i}`), head(2, `Sub ${i}`, `sec-${i}s`), { kind: 'pageBreak' });
  const r = layout(doc(blocks), style({ toc: { depth: 1 } }));
  const first = words(r.pages[0]);
  assert.match(first, /Part 1/);
  assert.doesNotMatch(first, /Sub 1/, 'depth 1');
  assert.doesNotMatch(first, /Contents.*Contents/, 'the contents does not list itself');
  for (let i = 1; i <= 3; i++) assert.ok(texts(r.pages[0]).some((t) => t.text === String(r.anchors[`sec-${i}`].page + 1)));
  const links = r.pages[0].items.filter((x) => x.kind === 'link').map((x) => x.to);
  assert.deepEqual(links.filter((l) => l.startsWith('sec-')), ['sec-1', 'sec-2', 'sec-3']);
});

test('page numbers settle even when the contents itself pushes the headings on', () => {
  const blocks = [head(1, 'Contents', 'sec-toc', { noToc: true }), { kind: 'toc' }];
  for (let i = 1; i <= 60; i++) blocks.push(head(1, `Section number ${i}`, `sec-${i}`), para('x'));
  const r = layout(doc(blocks), style());
  const tocPages = r.pages.filter((p) => p.items.some((x) => x.kind === 'link'));
  const printed = tocPages.flatMap((p) => p.items.filter((x) => x.kind === 'link' && x.to === 'sec-60')
    .map((link) => texts(p).filter((t) => Math.abs(t.y - (link.y + link.h * 0.75)) < link.h && /^\d+$/.test(t.text)).pop()?.text));
  assert.deepEqual(printed, [String(r.anchors['sec-60'].page + 1)]);
  assert.ok(r.passes <= 3);
});

test('a reference prints its words, adds "(page N)" in the PDF when the style says, and links to its target', () => {
  const blocks = [para('See', {}), { kind: 'paragraph', style: 'body', runs: [{ text: 'See ' }, { text: 'Section 2', ref: { anchor: 'sec-2' } }] },
    { kind: 'pageBreak' }, head(1, 'Two', 'sec-2')];
  const r = layout(doc(blocks), style());
  assert.match(words(r.pages[0]), /Section 2 \(page 2\)/);
  assert.ok(r.pages[0].items.some((x) => x.kind === 'link' && x.to === 'sec-2'));
  assert.doesNotMatch(words(layout(doc(blocks), style({ refs: { pageInPdf: false } })).pages[0]), /page 2/);
});

test('code runs are set in Courier; bold and italic runs in the matching face', () => {
  const r = layout(doc([{ kind: 'paragraph', style: 'body', runs: [{ text: 'a' }, { text: 'b', bold: true }, { text: 'c', italic: true }, { text: 'd', code: true }] }]), style({ text: { body: { family: 'times' } } }));
  const font = (x) => texts(r.pages[0]).find((t) => t.text === x).font;
  assert.deepEqual(['a', 'b', 'c', 'd'].map(font), ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Courier']);
});

test('underline in a style draws a line under the words; a rule block draws across the page', () => {
  const r = layout(doc([para('Under'), { kind: 'rule' }]), style({ text: { body: { underline: true } } }));
  assert.ok(r.pages[0].items.filter((x) => x.kind === 'rule').length >= 2);
});

test('characters the fonts cannot show are substituted and reported', () => {
  const r = layout(doc([para('x ≥ 5 ✓ 中')]), style());
  assert.match(words(r.pages[0]), />= 5 Yes \?/);
  assert.deepEqual(r.replaced, ['≥', '✓', '中']);
});

test('headings are reported in order for bookmarks, with their levels', () => {
  const r = layout(doc([head(0, 'Title', 'sec-t'), head(1, 'One', 'sec-1'), head(2, 'One A', 'sec-1a')]), style());
  assert.deepEqual(r.headings.map((h) => [h.title, h.level]), [['Title', 0], ['1 One', 1], ['1 One A', 2]]);
});

test('landscape swaps the page', () => {
  assert.deepEqual(layout(doc([para('a')]), style({ page: { orientation: 'landscape' } })).pages[0].size, [841.89, 595.28]);
});
```

Run: `node --test test/docgen/layout.test.js` → FAIL (module not found).

- [ ] **Step 2: Write `DocGen/doc-layout.js`**

```js
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
```

- [ ] **Step 3: Run tests, suite, typecheck.** Expected: pass. Where a geometric assertion fails by tolerance only, find the cause (baseline formula, epsilon) — do not widen tolerances beyond 0.05pt without a ledgered ruling.

- [ ] **Step 4: Build and commit** — add `'DocGen/doc-layout.js'` to `EXTRA_SOURCES`; `npm run build`.
```bash
git add DocGen/doc-layout.js test/docgen/layout.test.js scripts/build.js
git commit -m "Report engine: the layout — wrapping, alignment and justification, pages with headings kept with what follows, page breaks and space, header and footer fields, the marking on every page, a contents list with real page numbers, and references with their pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: Tables in the layout

**Files:**
- Modify: `DocGen/doc-layout.js` (replace the placeholder `layoutTable`; add `columnWidths`)
- Test: `test/docgen/layout-tables.test.js`

**Interfaces:** consumes the Table block (Task 4) and `style.tables`; produces `columnWidths(b, n, W, pad, bodyTs, headTs, ctx) → number[]` (exported for tests).

Ruling carried in: the Style's header row and first column apply to **every** table (the user's "global table styles"); the per-section header/first-column ticks become meaningless and are removed from the designer in Task 9. Automatic widths are **measured with the real fonts** (minimum = longest word, preferred = longest unwrapped line, then filled to the text width), replacing the old em heuristic.

- [ ] **Step 1: Write the failing tests** — `test/docgen/layout-tables.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, MM } from '../../DocGen/doc-layout.js';
import { normaliseStyle } from '../../DocGen/doc-style.js';
import { textWidth } from '../../DocGen/doc-fonts.js';

const style = (tables = {}) => normaliseStyle({ tables }).style;
const cell = (text) => [{ text }];
const tbl = (rows, extra = {}) => ({ kind: 'table', anchor: 'tbl-t', caption: { runs: [{ text: 'Table 1: Things' }] }, columns: [{}, {}, {}],
  header: [cell('ID'), cell('Name'), cell('Notes')], rows: rows.map((r) => r.map(cell)), ...extra });
const doc = (blocks) => ({ title: 'T', meta: { title: 'T' }, blocks });
const texts = (p) => p.items.filter((i) => i.kind === 'text');
const W = 595.28 - 50 * MM;

test('a table fills the text width; every cell\'s text stays inside its column', () => {
  const r = layout(doc([tbl([['HAZ-001', 'Fire', 'Short'], ['HAZ-002', 'Flood', 'A much longer note that will need to wrap across a few lines in its column']])]), style());
  const fills = r.pages[0].items.filter((i) => i.kind === 'fill');
  const headFill = fills[0];
  assert.ok(Math.abs(headFill.w - W) < 0.5 || fills.length >= 3, 'header row shaded across the table');
  const rules = r.pages[0].items.filter((i) => i.kind === 'rule');
  const xs = [...new Set(rules.filter((l) => l.x1 === l.x2).map((l) => Math.round(l.x1 * 10) / 10))].sort((a, b) => a - b);
  assert.equal(xs.length, 4, 'all borders: four vertical lines for three columns');
  assert.ok(Math.abs(xs[3] - xs[0] - W) < 0.5);
  for (const t of texts(r.pages[0])) {
    const col = xs.findIndex((x, i) => i < 3 && t.x >= x - 0.01 && t.x < xs[i + 1]);
    if (col === -1) continue;
    assert.ok(t.x + textWidth(t.font, t.size, t.text) <= xs[col + 1] + 0.01, `"${t.text}" overruns its column`);
  }
});

test('the header row repeats on every page a long table runs onto, and nothing below the margin', () => {
  const rows = Array.from({ length: 120 }, (_, i) => [`HAZ-${i}`, `Row ${i}`, 'note']);
  const r = layout(doc([tbl(rows)]), style());
  assert.ok(r.pages.length >= 3);
  for (const p of r.pages) {
    assert.ok(texts(p).some((t) => t.text === 'Notes'), 'header on this page');
    for (const t of texts(p)) if (!/Page|of/.test(t.text)) assert.ok(t.y < 841.89 - 25 * MM + 0.01);
  }
  const all = r.pages.flatMap(texts).map((t) => t.text);
  for (let i = 0; i < 120; i++) assert.ok(all.includes(`HAZ-${i}`), `row ${i} is there`);
});

test('not repeating the header, when the style says so', () => {
  const r = layout(doc([tbl(Array.from({ length: 120 }, (_, i) => [`H${i}`, 'x', 'y']))]), style({ header: { repeat: false } }));
  assert.equal(r.pages.filter((p) => texts(p).some((t) => t.text === 'Notes')).length, 1);
});

test('border styles: horizontal only, outer frame, none', () => {
  const rules = (b) => layout(doc([tbl([['a', 'b', 'c'], ['d', 'e', 'f']])]), style({ borders: b })).pages[0].items.filter((i) => i.kind === 'rule');
  assert.ok(rules('horizontal').every((l) => l.y1 === l.y2));
  const outer = rules('outer');
  assert.equal(outer.filter((l) => l.x1 === l.x2).length, 2);
  assert.equal(outer.filter((l) => l.y1 === l.y2).length, 2);
  assert.equal(rules('none').length, 0);
});

test('banded rows and the first column take their fills; the first column is bold', () => {
  const r = layout(doc([tbl([['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i']])]), style({ banding: { on: true, fill: '#eeeeee' }, firstColumn: { on: true, fill: '#dddddd', bold: true } }));
  const fills = r.pages[0].items.filter((i) => i.kind === 'fill').map((f) => f.colour);
  assert.ok(fills.includes('#eeeeee'));
  assert.ok(fills.includes('#dddddd'));
  assert.equal(texts(r.pages[0]).find((t) => t.text === 'd').font, 'Helvetica-Bold');
  assert.equal(texts(r.pages[0]).find((t) => t.text === 'e').font, 'Helvetica');
});

test('given widths are kept as fractions of the text width', () => {
  const r = layout(doc([tbl([['a', 'b', 'c']], { columns: [{ width: 0.2 }, { width: 0.3 }, { width: 0.5 }] })]), style());
  const xs = [...new Set(r.pages[0].items.filter((i) => i.kind === 'rule' && i.x1 === i.x2).map((l) => l.x1))].sort((a, b) => a - b);
  assert.ok(Math.abs(xs[1] - xs[0] - 0.2 * W) < 0.5 && Math.abs(xs[2] - xs[1] - 0.3 * W) < 0.5);
});

test('the caption goes below by default and above when asked, and the table is a link target', () => {
  const at = (pos) => { const r = layout(doc([tbl([['a', 'b', 'c']])]), style({ captionPosition: pos })); const t = texts(r.pages[0]);
    return [t.find((x) => x.text === 'Things').y, t.find((x) => x.text === 'ID').y, r.anchors['tbl-t']]; };
  const [capBelow, headBelow, anchor] = at('below');
  assert.ok(capBelow > headBelow);
  const [capAbove, headAbove] = at('above');
  assert.ok(capAbove < headAbove);
  assert.equal(anchor.page, 0);
});

test('a cell taller than a page is cut, and says so; the table still ends', () => {
  const huge = Array.from({ length: 400 }, (_, i) => `line ${i}`).join(' ');
  const r = layout(doc([{ ...tbl([['a', huge, 'c']]), rows: [[cell('a'), Array.from({ length: 300 }, (_, i) => [{ text: `L${i}` }, { br: true }]).flat(), cell('c')]] }]), style());
  const all = r.pages.flatMap(texts).map((t) => t.text).join(' ');
  assert.match(all, /continues beyond the page/);
  assert.ok(r.pages.length < 6);
});

test('a title row spans the table above the header', () => {
  const r = layout(doc([tbl([['a', 'b', 'c']], { titleRow: [{ text: 'Removed packages' }] })]), style());
  const t = texts(r.pages[0]);
  assert.ok(t.find((x) => x.text === 'Removed').y < t.find((x) => x.text === 'ID').y);
});
```

Run: `node --test test/docgen/layout-tables.test.js` → FAIL (placeholder has no grid).

- [ ] **Step 2: Replace `layoutTable` in `DocGen/doc-layout.js`**

```js
/**
 * Column widths in points. Given fractions are kept (scaled down if they add to more than
 * one); otherwise each column gets at least its longest word and the table is filled to
 * the text width in proportion to how much more each column would like.
 * @param {any} b @param {number} n @param {number} W @param {number} pad @param {any} body @param {any} head @param {any} ctx
 */
export function columnWidths(b, n, W, pad, body, head, ctx) {
  const given = (b.columns ?? []).map((/** @type {any} */ c) => Number(c?.width));
  if (given.length === n && given.every((w) => w > 0)) {
    const sum = given.reduce((a, c) => a + c, 0);
    const k = sum > 1 ? 1 / sum : 1;
    return given.map((w) => w * k * W);
  }
  const minW = Array(n).fill(2 * pad + 6), prefW = Array(n).fill(2 * pad + 6);
  const measure = (/** @type {any[]} */ runs, /** @type {any} */ ts, /** @type {number} */ k) => {
    let line = 0, longest = 0, max = 0;
    for (const a of atomsOf(runs ?? [], ts, ctx)) {
      if (a.br) { max = Math.max(max, line); line = 0; continue; }
      line += a.width;
      if (!a.space) longest = Math.max(longest, a.width);
    }
    max = Math.max(max, line);
    minW[k] = Math.max(minW[k], Math.min(longest, W * 0.5) + 2 * pad);
    prefW[k] = Math.max(prefW[k], max + 2 * pad);
  };
  (b.header ?? []).forEach((/** @type {any} */ c, /** @type {number} */ k) => measure(c, head, k));
  (b.rows ?? []).forEach((/** @type {any[]} */ r) => r.forEach((c, k) => { if (k < n) measure(c, body, k); }));
  const sumPref = prefW.reduce((a, c) => a + c, 0), sumMin = minW.reduce((a, c) => a + c, 0);
  if (sumPref <= W) return prefW.map((p) => p + (W - sumPref) * (p / sumPref));
  if (sumMin >= W) return minW.map((x) => (x * W) / sumMin);
  const slack = prefW.map((p, k) => Math.max(0, p - minW[k]));
  const sumSlack = slack.reduce((a, c) => a + c, 0);
  return minW.map((x, k) => x + (W - sumMin) * (sumSlack ? slack[k] / sumSlack : 1 / n));
}

const ALIGN = { l: 'left', c: 'centre', r: 'right', left: 'left', centre: 'centre', center: 'centre', right: 'right' };

/**
 * A table: caption, optional title row, header row (repeated on each page if the style
 * says), body rows that never split unless taller than a page (then cut, and said so),
 * fills for the header, banding and first column, and borders as the style asks.
 * @param {any} b @param {any} f the flow's state
 */
export function layoutTable(b, f) {
  const st = f.style, tb = st.tables;
  const n = Math.max(b.header?.length ?? 0, ...(b.rows ?? []).map((/** @type {any[]} */ r) => r.length), 0);
  if (!n) return;
  const pad = tb.padding * MM;
  const body = textStyle(st, 'body', { size: tb.fontSize, lineSpacing: 1, align: 'left' });
  const head = { ...body, size: tb.header.size, bold: tb.header.bold, italic: tb.header.italic, colour: tb.header.colour, leading: tb.header.size * 1.2 };
  const firstCol = tb.firstColumn.on && tb.firstColumn.bold ? { ...body, bold: true } : body;
  const widths = columnWidths(b, n, f.W, pad, body, head, f.ctx);
  const total = widths.reduce((a, c) => a + c, 0);
  const x0 = f.left + ((tb.align === 'centre' || b.centre) && total < f.W - EPS ? (f.W - total) / 2 : 0);
  const pageH = (f.style.page.margins ? (/** @type {any} */ (f.page).size[1] - (st.page.margins.top + st.page.margins.bottom) * MM) : 700);

  /** @typedef {{ cells: { lines: any[], ts: any, align: string, fill?: string }[], h: number, kind: string, span?: boolean }} Row */
  /** A row laid out: each cell's lines, and the row's height (cut to the page if it must be). */
  const rowOf = (/** @type {any[][]} */ cells, /** @type {string} */ kind, /** @type {number} */ idx) => {
    /** @type {Row} */
    const row = { cells: [], h: 0, kind };
    for (let k = 0; k < n; k++) {
      const ts = kind === 'head' ? head : k === 0 ? firstCol : body;
      const align = /** @type {any} */ (ALIGN)[b.columns?.[k]?.align ?? 'l'] ?? 'left';
      const lines = breakLines(atomsOf(cells[k] ?? [], ts, f.ctx), Math.max(1, widths[k] - 2 * pad));
      row.cells.push({ lines, ts, align, fill: kind === 'body' && k === 0 && tb.firstColumn.on ? tb.firstColumn.fill : undefined });
      row.h = Math.max(row.h, lines.length * ts.leading);
    }
    const extra = kind === 'body' && b.rowHeight > 0 && (!b.tallRows || b.tallRows[idx]) ? b.rowHeight * MM : 0;
    row.h += 2 * pad + extra;
    if (row.h > pageH) {
      for (const c of row.cells) {
        const keep = Math.max(1, Math.floor((pageH - 2 * pad) / c.ts.leading) - 1);
        if (c.lines.length > keep) {
          c.lines = c.lines.slice(0, keep);
          c.lines.push(breakLines(atomsOf([{ text: '[this cell continues beyond the page]', italic: true }], c.ts, f.ctx), Math.max(1, widths[0] * 4))[0]);
        }
      }
      row.h = pageH;
    }
    return row;
  };
  const titleRow = b.titleRow ? (() => {
    const ts = { ...head, align: 'centre' };
    const lines = breakLines(atomsOf(b.titleRow, ts, f.ctx), Math.max(1, total - 2 * pad));
    return /** @type {Row} */ ({ cells: [{ lines, ts, align: 'centre' }], h: lines.length * ts.leading + 2 * pad, kind: 'title', span: true });
  })() : null;
  const headRow = rowOf(b.header ?? [], 'head', 0);
  const bodyRows = (b.rows ?? []).map((/** @type {any[][]} */ r, /** @type {number} */ i) => rowOf(r, 'body', i));
  const heads = /** @type {Row[]} */ ([titleRow, headRow].filter(Boolean));
  const headsH = heads.reduce((a, r) => a + r.h, 0);

  const lw = tb.borders === 'none' ? 0 : tb.borderWidth;
  const line = (/** @type {number} */ x1, /** @type {number} */ y1, /** @type {number} */ x2, /** @type {number} */ y2) => {
    if (lw > 0) f.page.items.push({ kind: 'rule', x1, y1, x2, y2, width: lw, colour: tb.borderColour });
  };
  let segTop = 0, drawn = 0;
  const drawRow = (/** @type {Row} */ row, /** @type {number} */ bodyIdx) => {
    const top = f.y;
    if (!drawn) segTop = top;
    const fill = row.kind === 'head' || row.kind === 'title' ? tb.header.fill : (tb.banding.on && bodyIdx % 2 === 1 ? tb.banding.fill : null);
    if (fill) f.page.items.push({ kind: 'fill', x: x0, y: top, w: total, h: row.h, colour: fill });
    let x = x0;
    row.cells.forEach((c, k) => {
      const w = row.span ? total : widths[k];
      if (c.fill && !(row.kind === 'body' && fill && false)) f.page.items.push({ kind: 'fill', x, y: top, w, h: row.h, colour: c.fill });
      let ly = top + pad;
      c.lines.forEach((ln, i) => {
        f.page.items.push(...lineItems(ln, x + pad, ly + (c.ts.leading - c.ts.size) / 2 + c.ts.size * ASCENT, w - 2 * pad, c.align, i === c.lines.length - 1));
        ly += c.ts.leading;
      });
      x += w;
    });
    if (tb.borders === 'all' || tb.borders === 'horizontal') { line(x0, top, x0 + total, top); line(x0, top + row.h, x0 + total, top + row.h); }
    if (tb.borders === 'outer' && !drawn) line(x0, top, x0 + total, top);
    if (tb.borders === 'all') {
      let vx = x0;
      line(vx, top, vx, top + row.h);
      for (const w of row.span ? [total] : widths) { vx += w; line(vx, top, vx, top + row.h); }
    }
    f.y = top + row.h;
    drawn++;
  };
  const closeSegment = () => {
    if (!drawn) return;
    if (tb.borders === 'outer') {
      line(x0, f.y, x0 + total, f.y);
      line(x0, segTop, x0, f.y);
      line(x0 + total, segTop, x0 + total, f.y);
    }
    drawn = 0;
  };
  const caption = () => {
    if (!b.caption) return;
    const ts = textStyle(st, 'caption');
    const lines = breakLines(atomsOf(b.caption.runs, ts, f.ctx), f.W);
    if (tb.captionPosition === 'below' && lines.length * ts.leading + ts.spaceBefore > f.room() && !f.atTop()) f.newPage();
    if (!f.atTop()) f.y += ts.spaceBefore;
    lines.forEach((ln, i) => {
      f.page.items.push(...lineItems(ln, f.left, f.y + (ts.leading - ts.size) / 2 + ts.size * ASCENT, f.W, b.centre ? 'centre' : ts.align, i === lines.length - 1));
      f.y += ts.leading;
    });
    f.y += ts.spaceAfter;
  };

  const capAbove = tb.captionPosition === 'above';
  const firstH = headsH + (bodyRows[0]?.h ?? 0) + (capAbove && b.caption ? 3 * textStyle(st, 'caption').leading : 0);
  if (firstH > f.room() && !f.atTop()) f.newPage();
  f.mark(b.anchor);
  if (capAbove) caption();
  heads.forEach((r) => drawRow(r, -1));
  bodyRows.forEach((row, i) => {
    if (row.h > f.room() + EPS) {
      closeSegment();
      f.newPage();
      if (tb.header.repeat) heads.forEach((r) => drawRow(r, -1));
    }
    drawRow(row, i);
  });
  closeSegment();
  if (!capAbove) caption();
  else f.y += 4;
}
```

Also delete the Task 4 placeholder body. In `flow()`, `layoutTable` already receives `f` with `page` as a getter, so `f.page.items` always targets the current page after `f.newPage()`.

- [ ] **Step 3: Run the table tests, the Task 4 tests, the suite, typecheck** → pass. A failing geometric check means a real fault (e.g. a border drawn at the wrong edge) — fix the code.

- [ ] **Step 4: Build and commit**
```bash
git add DocGen/doc-layout.js test/docgen/layout-tables.test.js
git commit -m "Report engine: tables — measured column widths filled to the page, header and title rows repeated on each page, borders all/horizontal/outer/none, header, banding and first-column fills, captions above or below, and a cell taller than a page cut with a note

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The HTML writer, and rendering a document to PDF

**Files:**
- Create: `DocGen/doc-html.js` — `renderHtml(doc, style) → string`
- Create: `DocGen/doc-render.js` — `renderPdf(doc, style) → { bytes: Uint8Array, replaced: string[] }` (layout + writePdf); re-exports `renderHtml`
- Modify: `scripts/build.js` (`EXTRA_SOURCES` += both)
- Test: `test/docgen/html.test.js`, `test/docgen/render.test.js`

- [ ] **Step 1: Write the failing tests**

`test/docgen/html.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHtml } from '../../DocGen/doc-html.js';
import { normaliseStyle } from '../../DocGen/doc-style.js';

const style = (o = {}) => normaliseStyle(o).style;
const doc = {
  title: 'Alpha <safety>', meta: { title: 'Alpha <safety>', platform: 'Alpha', date: '2026-10-12', marking: 'OFFICIAL' },
  blocks: [
    { kind: 'heading', level: 1, number: '1', anchor: 'sec-a', runs: [{ text: 'Scope & aims' }] },
    { kind: 'paragraph', style: 'body', runs: [{ text: 'See ' }, { text: 'Table 1', ref: { anchor: 'tbl-x' } }, { text: ' and ' }, { text: 'bold', bold: true }, { br: true }, { text: 'code', code: true }] },
    { kind: 'table', anchor: 'tbl-x', caption: { runs: [{ text: 'Table 1: Things' }] }, columns: [{ width: 0.3 }, { width: 0.7 }], header: [[{ text: 'ID' }], [{ text: 'Name' }]], rows: [[[{ text: 'H-1' }], [{ text: '<b>x</b>' }]]] },
    { kind: 'toc' }, { kind: 'pageBreak' }, { kind: 'space', mm: 10 }, { kind: 'rule' },
  ],
};

test('one escaped, standalone page: title, marking above and below, headings with numbers and anchors', () => {
  const h = renderHtml(doc, style());
  assert.match(h, /^<!doctype html>/);
  assert.match(h, /<title>Alpha &lt;safety&gt;<\/title>/);
  assert.equal((h.match(/class="marking">OFFICIAL</g) ?? []).length, 2);
  assert.match(h, /<h2 class="h1" id="sec-a"><span class="num">1<\/span> Scope &amp; aims<\/h2>/);
  assert.doesNotMatch(h, /<b>x<\/b>/);
  assert.match(h, /&lt;b&gt;x&lt;\/b&gt;/);
});

test('runs: references are links (no page numbers), bold, line breaks and code', () => {
  const h = renderHtml(doc, style());
  assert.match(h, /See <a href="#tbl-x">Table 1<\/a> and <strong>bold<\/strong><br><code>code<\/code>/);
  assert.doesNotMatch(h, /\(page/);
});

test('a table with its caption, widths and header; the contents links to the headings', () => {
  const h = renderHtml(doc, style());
  assert.match(h, /<table class="doc-table" id="tbl-x">/);
  assert.match(h, /<col style="width:30%">/);
  assert.match(h, /<caption>Table 1: Things<\/caption>/);
  assert.match(h, /<th>ID<\/th>/);
  assert.match(h, /<nav class="toc">[\s\S]*<a href="#sec-a">1 Scope &amp; aims<\/a>/);
});

test('CSS comes from the style: fonts, sizes, colours, table header fill, page size and margins', () => {
  const h = renderHtml(doc, style({ page: { paper: 'letter', margins: { top: 20 } }, text: { body: { family: 'times', size: 12, colour: '#112233' } }, tables: { header: { fill: '#abcdef' } } }));
  assert.match(h, /@page \{ size: letter portrait; margin: 20mm 25mm 25mm 25mm; \}/);
  assert.match(h, /p\.body \{[^}]*font-family: "Times New Roman"[^}]*font-size: 12pt[^}]*color: #112233/);
  assert.match(h, /\.doc-table thead th \{[^}]*background: #abcdef/);
});
```

`test/docgen/render.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPdf } from '../../DocGen/doc-render.js';
import { normaliseStyle } from '../../DocGen/doc-style.js';
import { readPdf } from './pdf-read.js';

test('a document to a PDF: its text, page count, bookmarks, and characters it had to replace', () => {
  const doc = { title: 'Alpha', meta: { title: 'Alpha', marking: '' }, blocks: [
    { kind: 'heading', level: 1, number: '1', anchor: 'sec-a', runs: [{ text: 'Scope' }] },
    { kind: 'paragraph', style: 'body', runs: [{ text: 'x ≥ y' }] },
    { kind: 'pageBreak' },
    { kind: 'heading', level: 1, number: '2', anchor: 'sec-b', runs: [{ text: 'Two' }] },
  ] };
  const { bytes, replaced } = renderPdf(doc, normaliseStyle({}).style);
  const pdf = readPdf(bytes);
  assert.equal(pdf.pages.length, 2);
  assert.ok(pdf.pages[0].text.includes('Scope'));
  assert.deepEqual(pdf.outlines.map((o) => o.title).sort(), ['1 Scope', '2 Two']);
  assert.deepEqual(replaced, ['≥']);
  assert.equal(pdf.title, 'Alpha');
});
```

Run → FAIL (modules missing).

- [ ] **Step 2: Write `DocGen/doc-html.js`**

```js
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
    if (b.kind === 'space') return `<div style="height:${Number(b.mm) || 0}mm"></div>`;
    if (b.kind === 'rule') return '<hr>';
    return '';
  }).join('\n');
  const marking = meta.marking && style.marking.show ? `<div class="marking">${esc(meta.marking)}</div>` : '';
  return ['<!doctype html>', '<html lang="en">', '<head>', '<meta charset="utf-8">', '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(meta.title || doc.title || 'Report')}</title>`, '<style>', css(style), '</style>', '</head>', '<body>', marking,
    '<main>', body, '</main>', marking, '</body>', '</html>', ''].join('\n');
}
```

`<h${level+1}>`: a level-1 heading is `<h2 class="h1">` because `<h1>` is the title — the test pins that.

- [ ] **Step 3: Write `DocGen/doc-render.js`**

```js
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
```

- [ ] **Step 4: Run, suite, typecheck → pass. Build (add both files to `EXTRA_SOURCES`) and commit**
```bash
git add DocGen/doc-html.js DocGen/doc-render.js test/docgen/html.test.js test/docgen/render.test.js scripts/build.js
git commit -m "Report engine: the HTML writer (one styled page, the marking above and below, references as links) and rendering a document straight to a PDF

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The document builder (designer content → Document)

**Files:**
- Modify: `DocGen/doc-designer.js`
  - `App.md`: add `runs(text, opts) → Run[][]` (one array of runs per paragraph) beside `rich()`.
  - `App.report`: add `tables(sectionLabel, keyCol, columns, items, opts, ctx, groups) → TableData[]` beside `buildSection`, and `metaData(meta, headings) → TableData`.
  - `App.docProviders`: add `sectionTables(provider, rows, ctx, opts) → TableData[]`.
  - `App.docGen`: add `contentOf` (a block plus `content: TableData[] | 'toc'`), `buildDocument(host, blocks, meta) → { document, style, tags, held }`, `documentFor(host, opts, meta) → same`; `sectionContent` keeps its old behaviour until Task 10.
  - `App.docFormat`: `standard()`, `normalise()`, `list()`, `resolve()` now return **Styles** (via `doc-style.js`); old profiles found in a bag or an import are converted with `fromProfile`.
- Test: `test/docgen/builder.test.js` (node:test, importing `App` from `DocGen/doc-designer.js`)

`doc-designer.js` gains its first imports: `import { STANDARD, normaliseStyle, fromProfile, isStyle } from './doc-style.js';` at the top of the file (it is already an ES module — it ends `export { App }`).

**Interfaces:**
- `TableData = { captionId, captionText, noCaption, titleRow?: string, header: string[], rows: { text: string, code?: boolean }[][], widths?: number[], centre? }`
- `buildDocument(host, prepared, meta /* { title, date, platform, classification, tags? } */) → { document: Document, style, tags: string[] }` — `style` is the resolved Style with `/[Tag]` values filled into its header and footer slots.
- `documentFor(host, opts /* designer options + subjectId */, meta /* + utc */)` → the same, built the way `produce` builds it (reportBlocks → included → contentOf → buildDocument).

- [ ] **Step 1: Write the failing tests** — `test/docgen/builder.test.js`

Build a minimal host (as `CONF-1` in `DocGen/doc-designer.test.js` does) with: two provider sections (one grouped), a custom section with a paragraph containing `{{b}}bold{{/b}}`, `{{c}}code{{/c}}`, `{{br}}`, `{{ref:ID}}` / `{{refn:ID}}` / `{{reft:ID}}` / `{{ref:ID}}own words{{/ref}}` / a missing ref, a hand-made table with a caption, widths and `noCaption` on a second one, a rule, a page break and a space; a section with an introduction (`introNumbered`), a section with `pageBreakBefore`, a centred section, a `noToc` section, a title-level section, and a `/[Date]` tag in a heading and in a footer slot. Assert:

```js
// shapes
assert.deepEqual(kinds(doc), [/* the expected sequence of block kinds, e.g. 'heading','toc','heading','paragraph','table',… */]);
// numbering follows the outline; the title is unnumbered; numbering.format '1.1' leaves H3 unnumbered
// tables are numbered in emitted order across generated and hand-made tables; noCaption takes no number
// references: section → 'Section 2.1 — Title', refn → 'Section 2.1', reft → 'Title', own words kept, table → 'Table 2: …',
//   each with ref.anchor; a missing one is a bold '[missing reference]' run
// an intro paragraph sits under its heading, prefixed with its number
// a generated table: header from column labels (with the operator's wording), rows sorted by key, the key column code,
//   an empty one is a single 'None.' row, the title row, widths from b.widths, its anchor 'tbl-<captionId>'
// pageBreakBefore → a pageBreak block before the heading; spaceBefore → heading.spaceBefore (mm); centre carried
// tags: '/[Date]' replaced in a heading run and in the returned style's footer slot; an unfilled tag stays visible and is listed in `tags`
// style: resolve() of a bag holding an OLD profile returns a Style (isStyle) converted from it
```

Write these as concrete `test()` cases against the host fixture (one behaviour per test), each asserting exact values. Where the expected value depends on an existing DocGen behaviour (e.g. the outline's level rules), copy the expectation from the matching suite in `DocGen/doc-designer.test.js` (DOC-1/2, REF-1, CAP-1, SEC-1/2/4, TBL-1, GEN-TAB) so behaviour carries over.

Run → FAIL (`App.docGen.buildDocument` is not a function).

- [ ] **Step 2: `App.md.runs`** — beside `rich()`:

```js
    /**
     * PDF-1: rich text as RUNS rather than markdown — one array per paragraph. The same
     * grammar and the same balancing as richPara: an unmatched close is dropped, a code
     * span and a reference's own words are taken whole, a missing target reads
     * "[missing reference]" in bold.
     * @returns {Array<Array<{text?:string,bold?:boolean,italic?:boolean,code?:boolean,br?:boolean,ref?:{anchor:string}}>>}
     */
    function runs(s, opts) {
      opts = opts || {};
      return String(s == null ? '' : s).split(/\n{2,}/).map(function (p) { return runsPara(p, opts); })
        .filter(function (rs) { return rs.some(function (r) { return r.text; }); });
    }
    function runsPara(p, opts) {
      var out = [], last = 0, m, open = { b: false, i: false };
      function run(text, extra) {
        var r = { text: text };
        if (open.b) r.bold = true;
        if (open.i) r.italic = true;
        Object.keys(extra || {}).forEach(function (k) { r[k] = extra[k]; });
        return r;
      }
      function lit(t) {
        String(t || '').split('\n').forEach(function (piece, k) {
          if (k) out.push({ br: true });
          if (piece) out.push(run(piece));
        });
      }
      TOKEN.lastIndex = 0;
      while ((m = TOKEN.exec(p)) !== null) {
        lit(p.slice(last, m.index));
        var close = m[1] === '/', tag = m[2];
        if (tag === 'c' && !close) {
          var at = p.indexOf('{{/c}}', TOKEN.lastIndex);
          var inner = at === -1 ? p.slice(TOKEN.lastIndex) : p.slice(TOKEN.lastIndex, at);
          if (inner) out.push(run(inner, { code: true }));
          last = at === -1 ? p.length : at + 6;
          TOKEN.lastIndex = last;
          continue;
        }
        if (tag === 'b' || tag === 'i') {
          if (close === open[tag]) open[tag] = !close;
        } else if (tag === 'br') {
          out.push({ br: true });
        } else if (REF_TAG.test(tag) && !close) {
          var bits = REF_TAG.exec(tag);
          var at2 = p.indexOf('{{/ref}}', TOKEN.lastIndex);
          var wrapped = at2 === -1 ? null : p.slice(TOKEN.lastIndex, at2);
          if (wrapped !== null) { last = at2 + 8; TOKEN.lastIndex = last; }
          var r = opts.resolveRef ? opts.resolveRef(bits[2]) : null;
          if (!r) {
            if (wrapped !== null) lit(wrapped + ' ');
            out.push({ text: '[missing reference]', bold: true });
          } else {
            out.push(run(wrapped !== null ? wrapped : String(r[REF_READING[bits[1]]] || r.label || ''), { ref: { anchor: r.anchor } }));
          }
          if (wrapped !== null) continue;
        }
        last = m.index + m[0].length;
      }
      lit(p.slice(last));
      while (out.length && out[out.length - 1].br) out.pop();
      return out;
    }
```
Export it in `App.md = { …, runs: runs }`.

- [ ] **Step 3: `App.report.tables` / `metaData`, `App.docProviders.sectionTables`**

```js
    /** PDF-1: buildSection's tables as data, not markdown. Same columns, wording, sorting and grouping. */
    function tables(sectionLabel, keyCol, columns, items, opts, ctx, groups) {
      opts = opts || {};
      var colOpts = opts.columns || {};
      var visible = (columns || []).filter(function (c) { return columnOn(c, colOpts); });
      var cols = [Object.assign({ id: '_key' }, keyCol)].concat(visible);
      function rowsFor(list) {
        return list.slice().sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; })
          .map(function (it) {
            return cols.map(function (c, i) {
              var v = c.get(it, ctx);
              return i === 0 ? { text: v == null ? '' : String(v), code: true } : { text: v == null ? '' : MD.human ? MD.human(v) : String(v) };
            });
          });
      }
      function tableFor(list, key, capId, dfltCaption) {
        var text = tableText(opts, key);
        var title = String(text.title || '').trim();
        var rows = rowsFor(list);
        if (!rows.length) {
          var empty = [{ text: 'None.' }];
          for (var i = 1; i < cols.length; i++) empty.push({ text: '' });
          rows = [empty];
        }
        return {
          captionId: capId, noCaption: text.noCaption === true || !capId,
          captionText: String(text.caption || '').trim() || title || dfltCaption,
          titleRow: title, header: cols.map(function (c) { return headerFor(c, text.columns); }), rows: rows,
          widths: (opts.widths && opts.widths.length === cols.length) ? opts.widths.slice() : null
        };
      }
      var capBase = opts.captionId || '';
      var capName = opts.captionText || sectionLabel;
      if (groups && groups.field) {
        var groupOpts = opts.groups || {};
        return groups.options.filter(function (g) { return groupOpts[g.value] !== false; }).map(function (g) {
          return tableFor(items.filter(function (it) { return it.decision && it.decision[groups.field] === g.value; }),
            g.value, capBase ? capBase + '-' + g.value : '', capName);
        });
      }
      return [tableFor(items, ONE_TABLE, capBase, capName)];
    }
    function metaData(meta, headings) {
      return { header: headings || ['Field', 'Value'], rows: (meta || []).map(function (m) {
        return [{ text: String(m.label) }, m.code === false ? { text: String(m.value) } : { text: String(m.value), code: true }];
      }) };
    }
```
(`MD.human` exists — line ~1340 — and formats arrays/objects into lines; use it if it returns a plain string, otherwise `String(v)`; check its signature when implementing.) Export both. In `App.docProviders` add `sectionTables(provider, rows, ctx, opts)`: providers with `render()` return their markdown as one paragraph-less note — `[{ captionId: '', noCaption: true, header: ['Note'], rows: [[{ text: '(This section is produced by its host as text and is not shown in this format.)' }]] }]`; otherwise `App.report.tables(provider.label, key, provider.columns || [], rows || [], opts || {}, ctx || {}, provider.groups || null)`.

- [ ] **Step 4: `App.docFormat` returns Styles** — in the docFormat module, replace the bodies of `standard()` → `return JSON.parse(JSON.stringify(STANDARD));`, and `normalise(p)` → `return isStyle(p) ? normaliseStyle(p).style : fromProfile(p);` — keeping their names, so `list`, `resolve`, `App.docStore.addFormat/updateFormat` and `wireFormatting`'s path patches work on Styles unchanged. Every caller that reads profile-only fields (`page.marginTop`, `levels`, `tables.headBold`, `toc.include` etc.) is either the Markdown/LaTeX path (left until Task 10, which deletes it) or the Formatting/Header & Footer panes (replaced in Task 9). `hostBlocks` reads `resolve(state).toc.include`, which the Style has. Run `node DocGen/doc-designer.test.js` — LaTeX/markdown-format suites (FNT-*, FMT-*, CAP-*, HDR-*) will now fail; that is expected and they are deleted in Task 10. **Record the failing suite names in the ledger** and continue.

- [ ] **Step 5: `App.docGen.contentOf`, `buildDocument`, `documentFor`**

```js
    /** PDF-1: one block with its generated content as data — tables, or the contents marker. */
    function contentOf(host, b, opts, ctx, metaRows) {
      opts = opts || {};
      var capText = String(b.title || '').trim() || b.label;
      var tblOpts = { captionId: b.id, captionText: capText, widths: (b.widths && b.widths.length) ? b.widths : null };
      if (b.kind === 'toc') return Object.assign({}, b, { content: 'toc' });
      if (b.kind === 'meta') {
        var text = App.docBlocks.tableWording(b, '_all');
        var data = App.report.metaData(metaRows || [], App.docBlocks.headingsFor(['field', 'value'], ['Field', 'Value'], text.columns));
        var title = String(text.title || '').trim();
        return Object.assign({}, b, { content: [Object.assign(data, { captionId: text.noCaption === true ? '' : b.id, noCaption: text.noCaption === true,
          captionText: String(text.caption || '').trim() || title || capText, titleRow: title, widths: tblOpts.widths })] });
      }
      var pv = providerOf(opts, b.id, null, host);
      if (pv) {
        var ck = columnKey(b, pv);
        return Object.assign({}, b, { content: App.docProviders.sectionTables(pv, pv.rows ? pv.rows() : [], ctx, Object.assign({
          columns: (opts.columns || {})[ck], groups: groupTicks(pv, opts, ck), tables: b.tables || null, block: b }, tblOpts)) });
      }
      return Object.assign({}, b, { content: [] });
    }

    /** The heading-number depth a numbering format allows. */
    function numberDepth(style) { return String(style.numbering.format || '1.1.1').split('.').length; }

    /**
     * PDF-1: the finished DOCUMENT — blocks of runs — from content-filled blocks. Owns what
     * App.doc.render owned for markdown: the outline and its numbers, table numbers in
     * emitted order, the reference index, intros, custom parts, and `/[Tag]` values.
     */
    function buildDocument(host, blocks, meta) {
      meta = meta || {};
      var state = (host && typeof host.getState === 'function' && host.getState()) || {};
      var style = App.docFormat.resolve(state);
      var resolved = App.doc.outline(blocks, { baseLevel: 1, clampSkips: true, numbered: style.numbering.on });
      var depth = numberDepth(style);
      // Table numbers, in the order the tables will be emitted.
      var tableList = [], n = 0;
      resolved.forEach(function (b) {
        if (b.kind === 'custom') {
          (b.parts || []).forEach(function (p) {
            if (p.kind === 'table' && p.noCaption !== true && (p.header || []).length) {
              n++; tableList.push({ id: p.id, number: String(n), caption: App.doc.autoCaption(b, p), anchor: App.md.anchor('tbl-' + p.id) });
            }
          });
        } else if (Array.isArray(b.content)) {
          b.content.forEach(function (t) {
            if (!t.noCaption && t.captionId) { n++; tableList.push({ id: t.captionId, number: String(n), caption: t.captionText, anchor: App.md.anchor('tbl-' + t.captionId) }); }
          });
        }
      });
      var resolveRef = App.doc.refResolver(resolved, tableList);
      var byId = {}; tableList.forEach(function (t) { byId[t.id] = t; });
      var tags = meta.tags || {};
      function tag(s) { return applyTags(s, tags, true); }
      function runs1(s) { var ps = App.md.runs(s, { resolveRef: resolveRef }); return ps.length ? ps.reduce(function (a, p, i) { return i ? a.concat([{ br: true }, { br: true }], p) : p; }, []) : []; }
      function textRuns(s) { return [{ text: tag(String(s == null ? '' : s)) }]; }
      function caption(t) { return t ? { runs: [{ text: 'Table ' + t.number + ': ' + tag(t.caption) }] } : null; }
      var out = [];
      resolved.forEach(function (b) {
        if (b.pageBreakBefore) out.push({ kind: 'pageBreak' });
        var title = String(b.title == null ? b.label : b.title).trim();
        var heading = b.level !== App.doc.BODY_LEVEL && title;
        if (heading) {
          var num = b.number && b.number.split('.').length <= depth ? b.number : '';
          out.push({ kind: 'heading', level: b.level, number: num, anchor: b.anchor, runs: textRuns(title),
            centre: !!b.centre, spaceBefore: b.spaceBefore || 0, noToc: b.kind === 'toc' || !!b.noToc });
        } else if (b.spaceBefore) out.push({ kind: 'space', mm: b.spaceBefore });
        var intro = App.md.runs(b.intro || '', { resolveRef: resolveRef });
        intro.forEach(function (rs, i) {
          out.push({ kind: 'paragraph', style: 'body', centre: !!b.centre,
            runs: (i === 0 && b.introNumber ? [{ text: b.introNumber + ' ' }] : []).concat(rs) });
        });
        if (b.content === 'toc') { out.push({ kind: 'toc' }); return; }
        if (b.kind === 'custom') {
          (b.parts || []).forEach(function (p) {
            var centre = !!(p.centre || b.centre);
            if (p.kind === 'rule') out.push({ kind: 'rule' });
            else if (p.kind === 'pagebreak') out.push({ kind: 'pageBreak' });
            else if (p.kind === 'space') out.push({ kind: 'space', mm: Number(p.height) || 0 });
            else if (p.kind === 'para') {
              App.md.runs(p.text, { resolveRef: resolveRef }).forEach(function (rs, i) {
                out.push({ kind: 'paragraph', style: 'body', centre: centre, anchor: i === 0 && p.id ? App.md.anchor('par-' + p.id) : undefined, runs: rs });
              });
            } else if (p.kind === 'table' && (p.header || []).length) {
              var cols = (p.header || []).map(function (h, k) {
                return { width: (p.widths && p.widths.length === p.header.length) ? p.widths[k] : undefined, align: (p.align || [])[k] || 'l' };
              });
              out.push({ kind: 'table', anchor: App.md.anchor('tbl-' + p.id), caption: caption(byId[p.id]), columns: cols, centre: centre,
                header: p.header.map(runs1), rows: (p.rows || []).map(function (r) { return p.header.map(function (_, k) { return runs1(r && r[k] != null ? r[k] : ''); }); }),
                rowHeight: Number(p.rowHeight) || 0, tallRows: (p.tallRows && p.tallRows.length === (p.rows || []).length) ? p.tallRows : null });
            }
          });
          return;
        }
        (Array.isArray(b.content) ? b.content : []).forEach(function (t) {
          out.push({ kind: 'table', anchor: t.captionId ? App.md.anchor('tbl-' + t.captionId) : undefined, caption: t.noCaption ? null : caption(byId[t.captionId]),
            titleRow: t.titleRow ? textRuns(t.titleRow) : null, centre: !!b.centre,
            columns: t.header.map(function (_, k) { return { width: t.widths ? t.widths[k] : undefined }; }),
            header: t.header.map(textRuns), rows: t.rows.map(function (r) { return r.map(function (c) { return c.code ? [{ text: tag(c.text), code: true }] : textRuns(c.text); }); }) });
        });
      });
      // Tags in hand-written runs, too (headings and generated cells were filled above).
      out.forEach(function (blk) {
        [blk.runs, blk.caption && blk.caption.runs].concat(blk.header || [], [].concat.apply([], blk.rows || [])).forEach(function (rs) {
          (rs || []).forEach(function (r) { if (r && r.text) r.text = tag(r.text); });
        });
      });
      var tagged = JSON.parse(JSON.stringify(style));
      ['header', 'footer', 'firstHeader', 'firstFooter'].forEach(function (k) {
        ['left', 'centre', 'right'].forEach(function (s) { tagged.headerFooter[k][s] = tag(tagged.headerFooter[k][s]); });
      });
      var all = JSON.stringify(out) + JSON.stringify(tagged.headerFooter);
      var docTitle = tag(String(meta.title || ''));
      return {
        document: { title: docTitle, meta: { title: docTitle, platform: meta.platform || '', date: meta.date || '', marking: meta.classification || '' }, blocks: out },
        style: tagged, tags: findTags(all)
      };
    }

    /** PDF-1: the whole document for a run, built the way the host's produce builds it. */
    function documentFor(host, opts, meta) {
      var o = opts || {};
      var blocks = hostBlocks(host, o).filter(function (b) { return b.included; });
      var utc = (meta && meta.utc) || (host && host.clock && host.clock.nowIso ? host.clock.nowIso() : '');
      var m = o.subjectId ? App.docHost.chosenMeta(o.subjectId, utc) : null;
      var ctx = o.subjectId ? App.docHost.context(o.subjectId, utc) : {};
      var prepared = blocks.map(function (b) { return contentOf(host, b, o, ctx, m); });
      return buildDocument(host, prepared, Object.assign({}, meta, { tags: (meta && meta.tags) || o.tags || {} }));
    }
```
Export `contentOf`, `buildDocument`, `documentFor` on `App.docGen`. (Check `App.docHost.chosenMeta`/`context` names against `docgen-host.js produce` — they are what it calls today.)

- [ ] **Step 6: Run the builder tests, the suite (expect only the Step 4 known DocGen suites failing), typecheck → pass otherwise.** Build and commit:
```bash
git add DocGen/doc-designer.js test/docgen/builder.test.js
git commit -m "Report designer: the document is built as blocks of runs — numbering, table numbers, references, intros, hand-written parts, generated tables and tags — and formatting profiles are Styles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Ledger: `Task 7: known failing DocGen suites until Task 10: <names>`.

---

### Task 8: PIVOT produces PDF and HTML

**Files:**
- Modify: `src/reports/docgen-host.js` — `produce()` builds with `App.docGen.documentFor` and returns `{ report: { ...snapshot, document, style }, baseName }`
- Modify: `src/ui/controller.js` — `downloadReport({ id, format })`: `pdf` → `renderPdf(r.document, r.style).bytes`; `html` → `r.document ? renderHtml(r.document, r.style) : r.html`; a report with no `document` offers HTML only (refuse `pdf` with "This report was made before PDF; download its HTML."); `generateFromDesigner` unchanged in shape
- Modify: `src/storage/store.js` — `writeExport(fileHandle, content /* string | Uint8Array */)` (no change needed if `createWritable().write` takes both — it does; update the JSDoc type)
- Modify: `src/ui/screens/reports.js` — the row's downloads become **PDF** and **HTML** (`data-format="pdf|html"`); PDF only when the record has `document`
- Modify: `src/core/data.js` — `SCHEMA_VERSION = 6`
- Create: `scripts/convert-to-v6.mjs` — modelled on `scripts/convert-to-v5.mjs`: for each data file, `reportDesign.formats` → `fromProfile` each that is not already a Style; delete `markdown` from `report` records; set `schemaVersion: 6`; re-seal
- Tests: update `test/reports/docgen-host.test.js` (produce asserts `report.document.blocks` and `report.style`, no `markdown`), `test/ui/controller-reports.test.js` (downloads `.pdf` bytes start `%PDF-1.4` and `.html`; legacy record HTML only), `test/build.test.js` (the new DocGen files are in the import map), `test/scripts/convert-to-v6.test.js` (a v5 file with an old profile and a markdown report converts)

- [ ] **Step 1: Write the failing tests** (update the three suites; add the conversion test). Concretely in `controller-reports.test.js`:

```js
test('a report downloads as a PDF and as HTML; one made before PDF offers HTML only', async () => {
  // produce as the existing tests do, then:
  await c.dispatch({ type: 'downloadReport', id, format: 'pdf' });
  assert.equal(saved.name.endsWith('.pdf'), true);
  assert.equal(new TextDecoder('latin1').decode(saved.bytes.slice(0, 8)), '%PDF-1.4');
  await c.dispatch({ type: 'downloadReport', id, format: 'html' });
  assert.match(saved.text, /<!doctype html>/);
  // legacy: a report record with `html` and no `document`
  await c.dispatch({ type: 'downloadReport', id: legacyId, format: 'pdf' });
  assert.match(c.getState().message.text, /made before PDF/);
});
```
(Adapt `saved` to how the existing tests capture `writeExport` — read the file's current download test and reuse its fake `pickSaveFile`.)

- [ ] **Step 2: Implement** the host, controller, store type, screen, schema bump and conversion script as listed. In the controller, import `renderPdf, renderHtml` from `'../../DocGen/doc-render.js'`.

- [ ] **Step 3: Run the suite (only the known Task-7 DocGen suites may fail), typecheck, build.** Commit:
```bash
git add src scripts test
git commit -m "Reports come out as PDF and HTML: produced reports keep their finished document and Style, downloads draw the PDF or HTML from them, older reports keep their HTML; data version 6 with a one-off conversion script

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The designer — Styles pane and the live page preview

**Files:**
- Create: `DocGen/doc-preview.js` — `pagesHtml(pages, { scale }) → string` (each page a box of absolutely positioned text spans, fills and rules; links as `<a data-prv-jump>`)
- Modify: `DocGen/doc-designer.js`:
  - `PANES`: `formatting` → `{ id: 'styles', label: 'Styles' }`; remove `headerfooter`
  - `paneFormatting` → `paneStyles(project)`: Style picker head (reuse the existing `data-rd-fmt-active` / `-edit` / `-new` / `-del` controls and wiring), left list of sections (Page, Title, Heading 1–4, Body, Caption, Code, Tables, Header & footer, Marking, Numbering & contents) as `data-rd-style-section`, middle the chosen section's fields (all `data-rd-fmt="<path>"` / `data-rd-fmt-bool="<path>"` so `wireFormatting`'s `fmtPatch` saves them), right `data-rd-style-preview` with the live pages; held messages from `normaliseStyle` shown above the fields
  - remove `paneHeaderFooter` (its fields move into the Header & footer section, same `data-rd-hf-*` attributes)
  - `panePreview` → pages from `App.docGen.documentFor(host, opts, …)` + `layout` → `pagesHtml`; the Pages toggle goes (it is always pages)
  - remove the per-section header/first-column table-style ticks (`tableStyleField`) — the Style decides for all tables
  - `paneGenerate`: buttons `data-generate-format="pdf"` ("Make PDF") and `"html"` ("Make HTML"); a note listing characters the fonts will replace (from a layout of the current document)
- Modify: `DocGen/doc-designer.css` — the Styles pane grid and preview page boxes (sharp corners)
- Modify: `scripts/build.js` (`EXTRA_SOURCES` += `'DocGen/doc-preview.js'`)
- Modify: `src/ui/mount.js:345-347` — nothing to change if it passes `data-generate-format` through (it does)
- Test: `test/docgen/preview.test.js` (pagesHtml geometry and escaping); DocGen designer tests for `paneStyles` (fields present per section, `data-rd-fmt` paths valid against the Style, held messages shown) and the Generate pane buttons — add them to `test/docgen/designer-panes.test.js`, rendering the panes through `App.ui.views.reportDesign`'s exported pane functions (export `paneStyles`, `paneGenerate` on the module for testing if not already reachable)

`pagesHtml`:
```js
const FAMILY_CSS = { Helvetica: 'Helvetica, Arial, sans-serif', Times: '"Times New Roman", Times, serif', Courier: '"Courier New", Courier, monospace' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** WinAnsi text back to Unicode for the screen. */
const HIGH = { 128: '€', 130: '‚', 131: 'ƒ', 132: '„', 133: '…', 134: '†', 135: '‡', 136: 'ˆ', 137: '‰', 138: 'Š', 139: '‹', 140: 'Œ', 142: 'Ž', 145: '‘', 146: '’', 147: '“', 148: '”', 149: '•', 150: '–', 151: '—', 152: '˜', 153: '™', 154: 'š', 155: '›', 156: 'œ', 158: 'ž', 159: 'Ÿ' };
const uni = (t) => [...t].map((c) => HIGH[c.charCodeAt(0)] ?? c).join('');
/** @param {any[]} pages @param {{ scale?: number }} [o] */
export function pagesHtml(pages, o = {}) {
  const k = o.scale ?? 1;
  return pages.map((p, i) => `<div class="dp-page" data-page="${i + 1}" style="width:${p.size[0] * k}px;height:${p.size[1] * k}px">` + p.items.map((it) => {
    if (it.kind === 'fill') return `<div class="dp-fill" style="left:${it.x * k}px;top:${it.y * k}px;width:${it.w * k}px;height:${it.h * k}px;background:${it.colour}"></div>`;
    if (it.kind === 'rule') {
      const h = it.y1 === it.y2;
      return `<div class="dp-rule" style="left:${Math.min(it.x1, it.x2) * k}px;top:${Math.min(it.y1, it.y2) * k - (it.width * k) / 2}px;width:${h ? Math.abs(it.x2 - it.x1) * k : it.width * k}px;height:${h ? it.width * k : Math.abs(it.y2 - it.y1) * k}px;background:${it.colour}"></div>`;
    }
    if (it.kind === 'text') {
      const [fam, face = ''] = it.font.split('-');
      return `<span class="dp-text" style="left:${it.x * k}px;top:${(it.y - it.size * 0.78) * k}px;font-size:${it.size * k}px;line-height:1;color:${it.colour};font-family:${FAMILY_CSS[fam] ?? FAMILY_CSS.Helvetica};font-weight:${/Bold/.test(face) ? 700 : 400};font-style:${/Oblique|Italic/.test(face) ? 'italic' : 'normal'}">${esc(uni(it.text))}</span>`;
    }
    if (it.kind === 'link') return `<a class="dp-link" data-prv-jump="${esc(it.to)}" style="left:${it.x * k}px;top:${it.y * k}px;width:${it.w * k}px;height:${it.h * k}px"></a>`;
    return '';
  }).join('') + '</div>').join('');
}
```

- [ ] **Steps:** write the preview and pane tests → see them fail → implement `doc-preview.js`, the pane changes and CSS → run the suite (only the known Task-7 DocGen suites may fail), typecheck, build → commit:
```bash
git commit -m "Report designer: a Styles pane — pick, copy and edit Styles section by section with the live pages beside it — the whole-document preview drawn by the PDF layout, and Make PDF / Make HTML

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Remove Markdown and LaTeX; rewrite the DocGen tests

**Files:**
- Modify: `DocGen/doc-designer.js` — delete: `App.md`'s table writers (`pipeTable`, `gridTable`, `table` and the em layout helpers, `rawLatex`, `vspace`, `mmLen`, `centred`, `pageBreak`, `rule`, `heading`, the LaTeX escaping) keeping `TOKEN`, `REF_TAG`, `REF_READING`, `runs`, `plain`, `anchor`; `App.docFormat`'s LaTeX/YAML generation (`preamble`, `frontMatter`, `levelPreamble`, `styleMacro`, `centreMacros`, `gapMacro`, `tablePreamble`, `fontPreamble`, `codePreamble`, `captionPreamble`, `tocPreamble`, `headerFooterPreamble`, `previewCss`, `pageMetrics`, `tableMetrics`, `tableStyle`, `levelBreaks`, FONTS, LATEX_LEVELS, HF_MACROS); `App.doc.render`/`renderPart`/`renderParts`/`headingFor`/`gapFor`/`captionise`/`scanTables`/`tableIndex`; `App.report.renderTable`/`buildSection`/`metaTable`/`tableOpts`; `App.docProviders.renderSection`; `App.docGen.emitDocument`/`emitHtml`/`taggedProfile`/`HTML_PAGE_CSS`; `App.ui.mdPreview`; the old per-section preview (`sectionPreview`, `customPreview`, `introMd`) replaced by a small page preview of the section via `documentFor` with only that block included; `sectionContent` becomes `contentOf`
- Modify: `DocGen/doc-designer.test.js` — delete the Markdown/LaTeX suites (MD-1, CODE-1, BR-1 (markdown half), RTX-2 (markdown half), D-061, FNT-4, FNT-6, PRV-3, CAP-1 (markdown half), D-036/AUTO-* em widths, HDR/FMT LaTeX assertions); keep PROV-1, BLK-1, HOSTOBJ-1, DOC-1/2 outline, DOC-3 refs, CTR-1 (outline part); port each deleted behaviour that still matters to `test/docgen/builder.test.js` (numbering, refs, captions, centring, breaks, intros, tags — most are already there from Task 7)
- Modify: `DocGen/example.html` — call `documentFor` + `renderPdf`/`renderHtml` instead of `emitDocument`/`emitHtml`

- [ ] **Steps:** delete in small slices, running `npm test` after each slice; anything still referring to a deleted function is either moved to the new path or deleted with it. Grep afterwards: `grep -n "rawLatex\|emitDocument\|mdPreview\|frontMatter\|preamble\|\\\\ch[A-Z]" DocGen/doc-designer.js` → nothing. Run the whole suite (now **all** green, including `node DocGen/doc-designer.test.js`), typecheck, build. Note the size: `wc -c DocGen/*.js` before and after, for the report. Commit:
```bash
git commit -m "Report designer: the Markdown and LaTeX paths are gone — pandoc settings, the Markdown preview and writers — and their tests are rewritten against the document

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Browser walkthrough

- [ ] Serve `dist/`, seed data with a platform that has hazards and controls (the existing seed scripts), open Reports → produce a report → download PDF → open it in the browser's PDF viewer: contents with page numbers that match, clickable references and contents entries, bookmarks, header/footer fields and the marking on every page, a table over a page break with its header repeated.
- [ ] Download HTML and open it: styled, marking above and below, references link.
- [ ] Designer → Styles: copy Standard, change body font to Times, Heading 1 colour, table header fill and borders, margins, a footer field — the live pages follow each change; an impossible margin shows its held message.
- [ ] Generate pane: Make PDF / Make HTML work from the designer; a `≥` in a custom paragraph is listed as replaced.
- [ ] Clean up (`dist/_seed.json`, `.playwright-mcp`, the server). Ledger the walkthrough. Commit any fixes with their tests.
