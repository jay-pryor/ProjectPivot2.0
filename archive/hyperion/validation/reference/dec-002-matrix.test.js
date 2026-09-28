/**
 * Reference validation of REQ-017 (validation class `reference`): every rating the `rating`
 * module gives equals the DEC-002 risk severity matrix, for all 35 cells and the
 * uncategorised case (SL-03 criterion 6).
 *
 * The fixture below is transcribed from docs/decisions/DEC-002.md as the decision lays it
 * out — one row per likelihood, one column per consequence, each cell written as the
 * decision writes it, parenthetical labels included — and independently of the table in
 * C-001 of modules/rating/CONTRACT.md, which lays it out the other way round (contract
 * section 2). Where the two disagree this file is the one that is right, because it is the
 * decision's own words; a failure here is a question about the contract, not the fixture.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as rating from '../../modules/rating/contract.js';
import { consequenceLevel, likelihoodLetter, riskCell } from '../../baseline/types.js';

/** DEC-002 "Risk severity matrix", columns in the decision's order. */
const COLUMNS = ['Catastrophic (1)', 'Critical (2)', 'Marginal (3)', 'Negligible (4)', 'None (5)', 'Uncategorised'];

/** DEC-002 "Risk severity matrix", rows in the decision's order, cells verbatim. */
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

/**
 * The value inside a heading's parentheses (`Remote (D)` is `D`, `None (5)` is `5`), or
 * null for the Uncategorised row and column, which stand for a value not entered.
 * @param {string} heading
 * @returns {string | null}
 */
function valueOf(heading) {
  const m = /\(([^)]+)\)$/.exec(heading);
  return m ? m[1] : null;
}

/**
 * The band a cell names: the decision's words before any parenthetical label.
 * @param {string} text
 * @returns {string}
 */
function bandOf(text) {
  return text.replace(/\s*\([^)]*\)$/, '');
}

/** Every fixture case: the consequence and likelihood (null when not entered) and the band. */
const CASES = ROWS.flatMap(([rowHeading, cells]) => /** @type {string[]} */ (cells).map((text, i) => ({
  consequence: valueOf(COLUMNS[i]),
  likelihood: valueOf(/** @type {string} */ (rowHeading)),
  band: bandOf(text),
})));

test('the fixture transcribes the whole of DEC-002: 8 rows by 6 columns, 35 entered cells, 13 uncategorised', () => {
  assert.equal(ROWS.length, 8);
  for (const [, cells] of ROWS) assert.equal(cells.length, COLUMNS.length);
  assert.equal(CASES.filter((k) => k.consequence !== null && k.likelihood !== null).length, 35);
  assert.equal(CASES.filter((k) => k.consequence === null || k.likelihood === null).length, 13);
});

test('every one of the 35 DEC-002 cells: ratingFor gives the band the decision gives, with the cell entered (REQ-017, HZ-010)', async () => {
  const wrong = [];
  for (const k of CASES.filter((x) => x.consequence !== null && x.likelihood !== null)) {
    const c = consequenceLevel(Number(k.consequence));
    const l = likelihoodLetter(/** @type {string} */ (k.likelihood));
    const r = await rating.ratingFor(c, l);
    if (r.band !== k.band || r.cell !== riskCell(c, l)) wrong.push(`${c}${l}: DEC-002 gives ${k.band}, got ${r.band} ${r.cell}`);
  }
  assert.deepEqual(wrong, []);
});

test("DEC-002's Uncategorised row and column: a consequence or a likelihood not entered, as null or undefined, rates Uncategorised with no cell (REQ-017)", async () => {
  const wrong = [];
  for (const k of CASES.filter((x) => x.consequence === null || x.likelihood === null)) {
    assert.equal(k.band, 'Uncategorised');
    for (const absent of [null, undefined]) {
      const c = k.consequence === null ? absent : consequenceLevel(Number(k.consequence));
      const l = k.likelihood === null ? absent : likelihoodLetter(k.likelihood);
      const r = await rating.ratingFor(c, l);
      if (r.band !== 'Uncategorised' || r.cell !== null) wrong.push(`(${String(c)}, ${String(l)}): got ${r.band} ${r.cell}`);
    }
  }
  assert.deepEqual(wrong, []);
});
