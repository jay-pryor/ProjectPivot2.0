/**
 * rating conformance: operations (CORE-CON-002). The single operation of section 2 of
 * modules/rating/CONTRACT.md on its happy path: both values present, resolving with the
 * cell entered and the band C-001's table gives. Written from the contract before any
 * implementation (P8).
 *
 * The null double may pass this file (CORE-TST-002, rung 1); it will not pass the 35-cell
 * test, but nothing here relies on that.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as rating from '../contract.js';
import { BANDS, allCells, consequenceLevel, likelihoodLetter, riskCell } from './harness.js';

test('ratingFor returns a promise and resolves with a frozen Rating carrying a band and the cell entered (section 2, section 3)', async () => {
  const c = consequenceLevel(2);
  const l = likelihoodLetter('C');
  const pending = rating.ratingFor(c, l);
  assert.ok(pending instanceof Promise, 'ratingFor is asynchronous (DEC-012)');
  const r = await pending;
  assert.ok(Object.isFrozen(r), 'the Rating is frozen');
  assert.ok(BANDS.includes(r.band), `band ${String(r.band)} is one of the seven`);
  assert.equal(r.cell, riskCell(c, l));
});

test("DEC-002's own example: 2C is Serious (C-001)", async () => {
  const r = await rating.ratingFor(consequenceLevel(2), likelihoodLetter('C'));
  assert.equal(r.band, 'Serious');
  assert.equal(r.cell, '2C');
});

test('the band is the C-001 table cell and the cell is the level then letter entered, for all 35 cells (C-001)', async () => {
  const cells = allCells();
  assert.equal(cells.length, 35);
  for (const { consequence, likelihood, band } of cells) {
    const r = await rating.ratingFor(consequence, likelihood);
    const at = `${consequence}${likelihood}`;
    assert.equal(r.band, band, `${at} is ${band}`);
    assert.equal(r.cell, riskCell(consequence, likelihood), `${at} carries the cell entered`);
    assert.ok(Object.isFrozen(r), `${at} is frozen`);
  }
});

test('a cell the decision labels with another cell keeps the cell entered: 4A is 4A Medium, 5A is 5A Not Credible, 1G is 1G Not Credible (section 3)', async () => {
  for (const [c, l, band] of /** @type {const} */ ([[4, 'A', 'Medium'], [5, 'A', 'Not Credible'], [1, 'G', 'Not Credible'], [3, 'F', 'Eliminated']])) {
    const r = await rating.ratingFor(consequenceLevel(c), likelihoodLetter(l));
    assert.equal(r.cell, `${c}${l}`, `${c}${l} is not relabelled`);
    assert.equal(r.band, band);
  }
});
