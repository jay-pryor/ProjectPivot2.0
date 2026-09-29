import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewableType } from '../../src/ui/files.js';

test('Final I1: only PDFs, images and plain text open in a tab, typed by their extension; everything else downloads', () => {
  assert.equal(viewableType('Safety case.PDF'), 'application/pdf');
  assert.equal(viewableType('photo.jpeg'), 'image/jpeg');
  assert.equal(viewableType('photo.JPG'), 'image/jpeg');
  assert.equal(viewableType('diagram.png'), 'image/png');
  assert.equal(viewableType('notes.txt'), 'text/plain');
  for (const name of ['page.html', 'page.htm', 'drawing.svg', 'x.xhtml', 'x.xml', 'spec.docx', 'noext', 'evil.pdf.html']) assert.equal(viewableType(name), null, name);
});
