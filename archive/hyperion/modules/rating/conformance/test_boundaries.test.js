/**
 * rating conformance: boundaries (CORE-CON-002). The absent cases of C-002, the corners and
 * edges of the matrix in C-001, and the degenerate calls. Written from the contract before
 * any implementation (P8).
 *
 * The null double must fail this file (CORE-TST-002, rung 1): fixed data cannot be
 * `'Uncategorised'` with a null cell for an absent value and a band with a cell otherwise.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as rating from '../contract.js';
import { ABSENT, CONSEQUENCE_LEVELS, LIKELIHOOD_LETTERS, consequenceLevel, likelihoodLetter, show } from './harness.js';

/**
 * @param {unknown} c
 * @param {unknown} l
 */
async function assertUncategorised(c, l) {
  const r = await rating.ratingFor(/** @type {any} */ (c), /** @type {any} */ (l));
  const at = `ratingFor(${show(c)}, ${show(l)})`;
  assert.equal(r.band, 'Uncategorised', `${at} is Uncategorised`);
  assert.equal(r.cell, null, `${at} has a null cell`);
  assert.ok(Object.isFrozen(r), `${at} is frozen`);
}

test('both values absent, as null or undefined in any combination, is Uncategorised with a null cell (C-002)', async () => {
  for (const c of ABSENT) {
    for (const l of ABSENT) await assertUncategorised(c, l);
  }
});

test('ratingFor called with no arguments is Uncategorised: undefined is absent (C-002)', async () => {
  const r = await /** @type {any} */ (rating.ratingFor)();
  assert.equal(r.band, 'Uncategorised');
  assert.equal(r.cell, null);
});

test('every consequence level with the likelihood absent is Uncategorised, not a band read off the level (C-002)', async () => {
  for (const c of CONSEQUENCE_LEVELS) {
    for (const l of ABSENT) await assertUncategorised(consequenceLevel(c), l);
  }
});

test('every likelihood letter with the consequence absent is Uncategorised, not a band read off the letter (C-002)', async () => {
  for (const l of LIKELIHOOD_LETTERS) {
    for (const c of ABSENT) await assertUncategorised(c, likelihoodLetter(l));
  }
});

test('the corners of the matrix: 1A High, 1G Not Credible, 5A Not Credible, 5G Not Credible (C-001)', async () => {
  for (const [c, l, band] of /** @type {const} */ ([[1, 'A', 'High'], [1, 'G', 'Not Credible'], [5, 'A', 'Not Credible'], [5, 'G', 'Not Credible']])) {
    const r = await rating.ratingFor(consequenceLevel(c), likelihoodLetter(l));
    assert.equal(r.band, band, `${c}${l} is ${band}`);
    assert.equal(r.cell, `${c}${l}`);
  }
});

test('row F is Eliminated for consequences 1 to 4, and 5F is Not Credible: the None column wins over row F (C-001)', async () => {
  for (const c of [1, 2, 3, 4]) {
    const r = await rating.ratingFor(consequenceLevel(c), likelihoodLetter('F'));
    assert.equal(r.band, 'Eliminated', `${c}F is Eliminated`);
    assert.equal(r.cell, `${c}F`);
  }
  const fiveF = await rating.ratingFor(consequenceLevel(5), likelihoodLetter('F'));
  assert.equal(fiveF.band, 'Not Credible', '5F is Not Credible');
  assert.equal(fiveF.cell, '5F');
});

test('consequence 5 is Not Credible at every likelihood, and likelihood G is Not Credible at every consequence (C-001)', async () => {
  for (const l of LIKELIHOOD_LETTERS) {
    assert.equal((await rating.ratingFor(consequenceLevel(5), likelihoodLetter(l))).band, 'Not Credible', `5${l}`);
  }
  for (const c of CONSEQUENCE_LEVELS) {
    assert.equal((await rating.ratingFor(consequenceLevel(c), likelihoodLetter('G'))).band, 'Not Credible', `${c}G`);
  }
});

test('the edges where a band changes: 1C High then 1D Serious, 2B High then 2C Serious, 3B Serious then 3C Medium, 4B Medium then 4C Low, 1E Medium (C-001)', async () => {
  const edges = /** @type {const} */ ([
    [1, 'C', 'High'], [1, 'D', 'Serious'], [1, 'E', 'Medium'],
    [2, 'B', 'High'], [2, 'C', 'Serious'], [2, 'D', 'Medium'],
    [3, 'B', 'Serious'], [3, 'C', 'Medium'], [3, 'E', 'Medium'],
    [4, 'B', 'Medium'], [4, 'C', 'Low'], [4, 'E', 'Low'],
  ]);
  for (const [c, l, band] of edges) {
    assert.equal((await rating.ratingFor(consequenceLevel(c), likelihoodLetter(l))).band, band, `${c}${l} is ${band}`);
  }
});
