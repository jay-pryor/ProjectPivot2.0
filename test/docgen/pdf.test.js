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
