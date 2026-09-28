/**
 * Contract: rating, version 1.0. The module's sole import surface (CORE-CON-003). Gives the
 * DEC-002 risk matrix band for a consequence and a likelihood, and nothing else: DEC-004
 * kept the matrix values in a module rather than in `baseline/` so that HZ-010 could have a
 * contract clause and a conformance test. Clause IDs (C-nnn) are defined in CONTRACT.md
 * beside this file and cited by the conformance suite.
 *
 * The operation is asynchronous like every other Pivot module's (DEC-012) and is
 * nonetheless pure: it reads no clock, no folder, no storage, and no global state, and
 * writes nothing (C-004).
 *
 * It delegates to the selected implementation: `src/rating.js` in production,
 * `null_double.js` when `RATING_IMPL=null` is set in the environment (CORE-TST-002,
 * rung 1). The null double is test-only and never embedded in the built pivot.html, which
 * is why its specifier is held in a variable: the build inlines only quoted import
 * specifiers.
 */

/** @typedef {import('../../baseline/types.js').ConsequenceLevel1to5} ConsequenceLevel1to5 */
/** @typedef {import('../../baseline/types.js').LikelihoodLetterAtoG} LikelihoodLetterAtoG */
/** @typedef {import('../../baseline/types.js').RiskCell} RiskCell */

// ------------------------------------------------------------------ data shapes

/**
 * One of the seven bands DEC-002 gives, spelled as the decision spells it. Not baseline:
 * the level and letter types are baseline, the matrix values are this module's (DEC-004).
 * @typedef {'High' | 'Serious' | 'Medium' | 'Low' | 'Not Credible' | 'Eliminated' | 'Uncategorised'} RatingBand
 */

/**
 * The matrix's answer for one consequence and one likelihood. `cell` is the level then
 * letter the assessor entered, never a relabelling of it, and is null exactly when `band`
 * is `'Uncategorised'` (C-002). Frozen; treat it as read-only.
 * @typedef {object} Rating
 * @property {RatingBand} band
 * @property {RiskCell | null} cell
 */

// ------------------------------------------------------------------ error conditions

/**
 * C-003: `ratingFor` given a consequence that is present and is not a whole number 1 to 5.
 * Nothing was rated; a value the matrix cannot read is not an unentered value.
 */
export class ConsequenceOutOfScaleError extends Error {
  /** @param {unknown} given */
  constructor(given) {
    super(`a consequence must be absent or a whole number 1 to 5, got ${String(given)}`);
    this.name = 'ConsequenceOutOfScaleError';
    this.given = given;
  }
}

/**
 * C-003: `ratingFor` given a likelihood that is present and is not one of A to G. Never
 * the DEC-001 integer encoding, which is for trace/ records only (DEC-002).
 */
export class LikelihoodOutOfScaleError extends Error {
  /** @param {unknown} given */
  constructor(given) {
    super(`a likelihood must be absent or one of A to G, got ${String(given)}`);
    this.name = 'LikelihoodOutOfScaleError';
    this.given = given;
  }
}

// ------------------------------------------------------------------ operations

/**
 * The DEC-002 band for this consequence and likelihood, with the cell they entered.
 * Total over all 35 cells (C-001). Either value absent — null or undefined — rates as
 * `'Uncategorised'` with a null cell (C-002); either value present and outside its scale
 * is refused, not rated (C-003).
 * @param {ConsequenceLevel1to5 | null | undefined} consequence as the assessor entered it
 * @param {LikelihoodLetterAtoG | null | undefined} likelihood as the assessor entered it
 * @returns {Promise<Rating>}
 */
export async function ratingFor(consequence, likelihood) {
  return (await impl()).ratingFor(consequence, likelihood);
}

// ------------------------------------------------------------------ implementation selection

/**
 * @typedef {object} RatingImplementation
 * @property {(consequence: ConsequenceLevel1to5 | null | undefined, likelihood: LikelihoodLetterAtoG | null | undefined) => Promise<Rating>} ratingFor
 */

/** @type {Promise<RatingImplementation> | null} */
let selected = null;

/** @returns {Promise<RatingImplementation>} */
function impl() {
  if (selected === null) {
    const env = /** @type {{ process?: { env?: Record<string, string | undefined> } }} */ (globalThis).process?.env;
    if (env?.RATING_IMPL === 'null') {
      const nullDouble = './null_double.js'; // test-only; not a runtime source, so never inlined by the build
      selected = import(nullDouble);
    } else {
      selected = import('./src/rating.js');
    }
  }
  return selected;
}
