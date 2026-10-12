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
