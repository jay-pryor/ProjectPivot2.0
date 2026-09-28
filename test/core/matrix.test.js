import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ratingFor, formatRating, CONSEQUENCES, LIKELIHOODS } from '../../src/core/matrix.js';
import { PivotError } from '../../src/core/errors.js';

const COLUMNS = ['Catastrophic (1)', 'Critical (2)', 'Marginal (3)', 'Negligible (4)', 'None (5)', 'Uncategorised'];
const ROWS = [
  ['Frequent (A)', ['High (1A)', 'High (2A)', 'Serious (3A)', 'Medium (4A)', 'Not Credible (5G)', 'Uncategorised']],
  ['Probable (B)', ['High (1B)', 'High (2B)', 'Serious (3B)', 'Medium (4B)', 'Not Credible (5G)', 'Uncategorised']],
  ['Occasional (C)', ['High (1C)', 'Serious (2C)', 'Medium (3C)', 'Low (4C)', 'Not Credible (5G)', 'Uncategorised']],
  ['Remote (D)', ['Serious (1D)', 'Medium (2D)', 'Medium (3D)', 'Low (4D)', 'Not Credible (5G)', 'Uncategorised']],
  ['Improbable (E)', ['Medium (1E)', 'Medium (2E)', 'Medium (3E)', 'Low (4E)', 'Not Credible (5G)', 'Uncategorised']],
  ['Eliminated (F)', ['Eliminated', 'Eliminated', 'Eliminated', 'Eliminated', 'Not Credible (5G)', 'Uncategorised']],
  ['Not Credible (G)', ['Not Credible (5G)', 'Not Credible (5G)', 'Not Credible (5G)', 'Not Credible (5G)', 'Not Credible (5G)', 'Uncategorised']],
  ['Uncategorised', ['Uncategorised', 'Uncategorised', 'Uncategorised', 'Uncategorised', 'Uncategorised', 'Uncategorised']],
];
const valueOf = (h) => { const m = /\(([^)]+)\)$/.exec(h); return m ? m[1] : null; };
const bandOf = (t) => t.replace(/\s*\([^)]*\)$/, '');
const CASES = ROWS.flatMap(([row, cells]) => cells.map((text, i) => ({
  consequence: valueOf(COLUMNS[i]) === null ? null : Number(valueOf(COLUMNS[i])),
  likelihood: valueOf(row),
  band: bandOf(text),
})));

test('the fixture is the whole of DEC-002: 35 entered cells and 13 uncategorised', () => {
  assert.equal(CASES.filter((k) => k.consequence !== null && k.likelihood !== null).length, 35);
  assert.equal(CASES.filter((k) => k.consequence === null || k.likelihood === null).length, 13);
});

test('every one of the 35 cells rates as DEC-002 says, with the cell written level then letter', () => {
  const wrong = [];
  for (const k of CASES.filter((x) => x.consequence !== null && x.likelihood !== null)) {
    const r = ratingFor(k.consequence, k.likelihood);
    if (r.band !== k.band || r.cell !== `${k.consequence}${k.likelihood}`) wrong.push(`${k.consequence}${k.likelihood}: ${r.band}`);
  }
  assert.deepEqual(wrong, []);
});

test('a value not entered, as null or undefined, rates Uncategorised with no cell', () => {
  for (const k of CASES.filter((x) => x.consequence === null || x.likelihood === null)) {
    for (const absent of [null, undefined]) {
      const r = ratingFor(k.consequence ?? absent, k.likelihood ?? absent);
      assert.deepEqual(r, { band: 'Uncategorised', cell: null });
    }
  }
});

test('a value outside the scales is refused, not rated', () => {
  assert.throws(() => ratingFor(0, 'A'), PivotError);
  assert.throws(() => ratingFor(6, 'A'), PivotError);
  assert.throws(() => ratingFor(2, 'H'), PivotError);
  assert.throws(() => ratingFor(2, 'c'), PivotError);
  assert.throws(() => ratingFor('2', 'C'), PivotError);
});

test('formatRating writes a rating the way DEC-002 locks in', () => {
  assert.equal(formatRating({ consequence: 2, likelihood: 'C' }), '2C = Serious');
  assert.equal(formatRating({ consequence: 2, likelihood: null }), 'Uncategorised');
  assert.equal(formatRating(null), 'Uncategorised');
});

test('the scales carry their DEC-002 labels', () => {
  assert.deepEqual(CONSEQUENCES.map((c) => c.label), ['Catastrophic', 'Critical', 'Marginal', 'Negligible', 'None']);
  assert.deepEqual(LIKELIHOODS.map((l) => `${l.letter} ${l.label}`), ['A Frequent', 'B Probable', 'C Occasional', 'D Remote', 'E Improbable', 'F Eliminated', 'G Not Credible']);
});
