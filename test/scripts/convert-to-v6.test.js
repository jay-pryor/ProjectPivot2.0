import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertBody } from '../../scripts/convert-to-v6.mjs';
import { emptyData, created, validateData } from '../../src/core/data.js';
import { isStyle } from '../../DocGen/doc-style.js';
import { act } from '../helpers.js';

/** A schema 5 body: an old LaTeX-era formatting profile, a Style, and a report with its markdown and html. */
function v5() {
  const d = /** @type {any} */ (emptyData());
  d.reportDesign = { formatId: 'p1', formats: [
    { id: 'p1', name: 'House', page: { paper: 'letter', fontSize: '12pt', marginTop: '20mm' }, headings: { numbered: false }, levels: [] },
    { id: 's2', name: 'Already', page: { paper: 'a5', margins: { top: 10 } }, text: {} },
  ] };
  d.records.report.r1 = created(act, 'r1', { platformId: 'p1', title: 'Old', markdown: '# Old', html: '<p>Old</p>' });
  return d;
}

test('formatting profiles become Styles, a report keeps its HTML and loses its markdown', () => {
  const out = convertBody(v5());
  const [p1, s2] = out.reportDesign.formats;
  assert.ok(isStyle(p1) && isStyle(s2));
  assert.deepEqual([p1.id, p1.name, p1.page.paper, p1.text.body.size, p1.page.margins.top, p1.numbering.on], ['p1', 'House', 'letter', 12, 20, false]);
  assert.deepEqual([s2.page.paper, s2.page.margins.top], ['a5', 10]);
  assert.equal(out.reportDesign.formatId, 'p1');
  assert.equal(out.records.report.r1.html, '<p>Old</p>');
  assert.ok(!('markdown' in out.records.report.r1));
  assert.deepEqual(validateData(out), []);
});

test('a design with no formats converts to itself', () => {
  const d = /** @type {any} */ (emptyData());
  assert.deepEqual(convertBody(d), d);
});
