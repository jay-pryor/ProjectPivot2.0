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

test('Final review I1: a line break that reaches the encoder is a space, never words run together', () => {
  assert.equal(toWinAnsi('a\nb\r\nc').text, 'a b  c');
});
