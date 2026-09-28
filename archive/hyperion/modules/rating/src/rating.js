/**
 * rating, implementing contract version 1.0 (modules/rating/CONTRACT.md). Selected by
 * contract.js unless RATING_IMPL=null. Clause IDs (C-nnn) cite the contract.
 *
 * A lookup in the DEC-002 matrix and nothing else: no clock, no storage, no state held
 * between calls (C-004). The table is C-001's, one row per consequence level.
 */

import { LIKELIHOOD_LETTERS, consequenceLevel, likelihoodLetter, riskCell } from '../../../baseline/types.js';
import { ConsequenceOutOfScaleError, LikelihoodOutOfScaleError } from '../contract.js';

/** @typedef {import('../contract.js').RatingImplementation} Impl */
/** @typedef {import('../contract.js').RatingBand} RatingBand */
/** @typedef {import('../contract.js').Rating} Rating */
/** @typedef {import('../../../baseline/types.js').ConsequenceLevel1to5} ConsequenceLevel1to5 */
/** @typedef {import('../../../baseline/types.js').LikelihoodLetterAtoG} LikelihoodLetterAtoG */

/**
 * C-001's table, likelihood A to G left to right. Consequence 5 is `'Not Credible'` in
 * every column, F included.
 * @type {Readonly<Record<number, readonly RatingBand[]>>}
 */
const MATRIX = Object.freeze({
  1: row(['High', 'High', 'High', 'Serious', 'Medium', 'Eliminated', 'Not Credible']),
  2: row(['High', 'High', 'Serious', 'Medium', 'Medium', 'Eliminated', 'Not Credible']),
  3: row(['Serious', 'Serious', 'Medium', 'Medium', 'Medium', 'Eliminated', 'Not Credible']),
  4: row(['Medium', 'Medium', 'Low', 'Low', 'Low', 'Eliminated', 'Not Credible']),
  5: row(['Not Credible', 'Not Credible', 'Not Credible', 'Not Credible', 'Not Credible', 'Not Credible', 'Not Credible']),
});

/**
 * @param {RatingBand[]} bands A to G
 * @returns {readonly RatingBand[]}
 */
function row(bands) {
  return Object.freeze(bands);
}

/** @type {Rating} */
const UNCATEGORISED = Object.freeze({ band: 'Uncategorised', cell: null });

/** @param {unknown} v */
function isAbsent(v) {
  return v === null || v === undefined;
}

/**
 * Section 4: a present value outside its scale is refused, the consequence checked first
 * so the rejection is a function of the arguments (C-003, C-004). Absent is not an error.
 * @param {unknown} consequence
 * @param {unknown} likelihood
 */
function refuseOutOfScale(consequence, likelihood) {
  if (!isAbsent(consequence) && !(typeof consequence === 'number' && Number.isInteger(consequence) && consequence >= 1 && consequence <= 5)) {
    throw new ConsequenceOutOfScaleError(consequence);
  }
  if (!isAbsent(likelihood) && !(typeof likelihood === 'string' && LIKELIHOOD_LETTERS.includes(likelihood))) {
    throw new LikelihoodOutOfScaleError(likelihood);
  }
}

/** @type {Impl['ratingFor']} */
export async function ratingFor(consequence, likelihood) {
  refuseOutOfScale(consequence, likelihood);
  // C-002: either value not entered rates as Uncategorised, never off the entered half.
  if (isAbsent(consequence) || isAbsent(likelihood)) return UNCATEGORISED;
  const level = consequenceLevel(/** @type {number} */ (consequence));
  const letter = likelihoodLetter(/** @type {string} */ (likelihood));
  return Object.freeze({
    band: MATRIX[level][LIKELIHOOD_LETTERS.indexOf(letter)],
    cell: riskCell(level, letter),
  });
}
