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
  assert.match(s, /\(Image\) Tj[\s\S]*?\(missing:\) Tj[\s\S]*?\(gone\.png\) Tj/, 'the placeholder, written a word at a time');
});
