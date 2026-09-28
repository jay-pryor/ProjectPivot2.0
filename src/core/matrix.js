import { PivotError } from './errors.js';

/** The company risk matrix, fixed in Pivot (DEC-002). Never user-editable data. */
export const CONSEQUENCES = Object.freeze([
  { level: 1, label: 'Catastrophic' },
  { level: 2, label: 'Critical' },
  { level: 3, label: 'Marginal' },
  { level: 4, label: 'Negligible' },
  { level: 5, label: 'None' },
]);

export const LIKELIHOODS = Object.freeze([
  { letter: 'A', label: 'Frequent' },
  { letter: 'B', label: 'Probable' },
  { letter: 'C', label: 'Occasional' },
  { letter: 'D', label: 'Remote' },
  { letter: 'E', label: 'Improbable' },
  { letter: 'F', label: 'Eliminated' },
  { letter: 'G', label: 'Not Credible' },
]);

/** Bands from worst to least, for filters and sorting. */
export const BANDS = Object.freeze(['High', 'Serious', 'Medium', 'Low', 'Eliminated', 'Not Credible', 'Uncategorised']);

const LETTERS = 'ABCDEFG';

/** One row per consequence level, one column per likelihood letter A to G. */
const MATRIX = Object.freeze({
  1: ['High', 'High', 'High', 'Serious', 'Medium', 'Eliminated', 'Not Credible'],
  2: ['High', 'High', 'Serious', 'Medium', 'Medium', 'Eliminated', 'Not Credible'],
  3: ['Serious', 'Serious', 'Medium', 'Medium', 'Medium', 'Eliminated', 'Not Credible'],
  4: ['Medium', 'Medium', 'Low', 'Low', 'Low', 'Eliminated', 'Not Credible'],
  5: ['Not Credible', 'Not Credible', 'Not Credible', 'Not Credible', 'Not Credible', 'Not Credible', 'Not Credible'],
});

/** @param {unknown} v */
export function isConsequence(v) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;
}

/** @param {unknown} v */
export function isLikelihood(v) {
  return typeof v === 'string' && v.length === 1 && LETTERS.includes(v);
}

/** @param {unknown} v */
const absent = (v) => v === null || v === undefined;

/**
 * @param {unknown} consequence 1 to 5, or null when not entered
 * @param {unknown} likelihood A to G, or null when not entered
 * @returns {{ band: string, cell: string | null }}
 */
export function ratingFor(consequence, likelihood) {
  if (!absent(consequence) && !isConsequence(consequence)) {
    throw new PivotError('rating.consequence', `A consequence must be a whole number from 1 to 5, not ${String(consequence)}.`);
  }
  if (!absent(likelihood) && !isLikelihood(likelihood)) {
    throw new PivotError('rating.likelihood', `A likelihood must be a letter from A to G, not ${String(likelihood)}.`);
  }
  if (absent(consequence) || absent(likelihood)) return { band: 'Uncategorised', cell: null };
  const c = /** @type {1|2|3|4|5} */ (consequence);
  const l = /** @type {string} */ (likelihood);
  return { band: MATRIX[c][LETTERS.indexOf(l)], cell: `${c}${l}` };
}

/**
 * @param {{ consequence: number | null, likelihood: string | null } | null | undefined} pair
 * @returns {string} `2C = Serious`, or `Uncategorised`
 */
export function formatRating(pair) {
  const r = ratingFor(pair?.consequence ?? null, pair?.likelihood ?? null);
  return r.cell ? `${r.cell} = ${r.band}` : r.band;
}
