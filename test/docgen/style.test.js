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

test('references print no "(page N)" in the PDF unless a Style asks for it', () => {
  assert.equal(STANDARD.refs.pageInPdf, false);
  assert.equal(normaliseStyle({ refs: { pageInPdf: true } }).style.refs.pageInPdf, true);
});
