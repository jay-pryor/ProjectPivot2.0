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

test('lines have square ends, so the sides of a thick border meet in full corners', () => {
  const pdf = readPdf(writePdf([{ size: [200, 200], items: [{ kind: 'rule', x1: 10, y1: 10, x2: 100, y2: 10, width: 4, colour: '#000000' }] }]));
  assert.match(pdf.pages[0].stream, /^2 J\n/);
});
