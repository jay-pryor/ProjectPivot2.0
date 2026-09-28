/**
 * Test support for the rating conformance suite (CORE-CON-002). Not a test file: the runner
 * collects `*.test.js` only.
 *
 * Section 2 of modules/rating/CONTRACT.md: a conformance test calls `ratingFor` with values
 * built by `baseline/types.js` and needs no body, no folder, and no clock. So this file
 * imports only what modules/rating/manifest.yaml declares (CORE-CON-003, `declared`):
 * baseline/types. The seeded generator is written here rather than borrowed from another
 * module's harness for the same reason.
 *
 * `MATRIX` is the table in C-001 of the contract, transcribed as the contract lays it out
 * (one row per consequence level). The reference transcription of DEC-002 itself, laid out
 * as the decision lays it out, is validation/reference/dec-002-matrix.test.js; the two are
 * kept apart on purpose (contract section 2).
 */

import { CONSEQUENCE_LEVELS, LIKELIHOOD_LETTERS, consequenceLevel, likelihoodLetter, riskCell } from '../../../baseline/types.js';

export { CONSEQUENCE_LEVELS, LIKELIHOOD_LETTERS, consequenceLevel, likelihoodLetter, riskCell };

/** @typedef {import('../contract.js').RatingBand} RatingBand */
/** @typedef {import('../contract.js').Rating} Rating */

/** The one seed this suite's property tests use (CORE-TST-001); change it only on purpose, and record why. */
export const SEED = 0x52415445;

/** The seven band names of section 3, spelled as the contract spells them. */
export const BANDS = Object.freeze(['High', 'Serious', 'Medium', 'Low', 'Not Credible', 'Eliminated', 'Uncategorised']);

const H = 'High';
const S = 'Serious';
const M = 'Medium';
const L = 'Low';
const N = 'Not Credible';
const E = 'Eliminated';

/**
 * C-001's table: `MATRIX[level][letter]`, likelihood letters A to G left to right.
 * @type {Readonly<Record<number, Readonly<Record<string, RatingBand>>>>}
 */
export const MATRIX = Object.freeze({
  1: row([H, H, H, S, M, E, N]),
  2: row([H, H, S, M, M, E, N]),
  3: row([S, S, M, M, M, E, N]),
  4: row([M, M, L, L, L, E, N]),
  5: row([N, N, N, N, N, N, N]),
});

/**
 * @param {RatingBand[]} bands A to G
 * @returns {Readonly<Record<string, RatingBand>>}
 */
function row(bands) {
  if (bands.length !== 7) throw new Error('a matrix row has seven cells');
  return Object.freeze(Object.fromEntries(bands.map((b, i) => [LIKELIHOOD_LETTERS[i], b])));
}

/**
 * Every one of the 35 cells, as values built by baseline/types.js, with C-001's band.
 * @returns {{ consequence: import('../../../baseline/types.js').ConsequenceLevel1to5, likelihood: import('../../../baseline/types.js').LikelihoodLetterAtoG, band: RatingBand }[]}
 */
export function allCells() {
  return CONSEQUENCE_LEVELS.flatMap((c) => LIKELIHOOD_LETTERS.map((l) => ({
    consequence: consequenceLevel(c),
    likelihood: likelihoodLetter(l),
    band: MATRIX[c][l],
  })));
}

// ------------------------------------------------------------------ values outside the scales

/** "Absent" in section 4 and C-002: the assessor has not entered the value. */
export const ABSENT = Object.freeze([null, undefined]);

/**
 * Present and not a whole number 1 to 5 (section 4, C-003): out of range, fractional, not
 * finite, and not a number at all. `'2'` is a string, not a whole number, as
 * baseline/types.js's `consequenceLevel` reads it.
 */
export const CONSEQUENCES_OUT_OF_SCALE = Object.freeze([0, 6, -1, 7, 100, 2.5, 0.999, 5.0001, Number.NaN, Infinity, -Infinity, '2', '', 'Catastrophic', true, false, {}, [], [1]]);

/**
 * Present and not one of A to G (section 4, C-003): letters outside the scale, the right
 * letter in the wrong case or padded, the DEC-001 integer encoding the contract names, the
 * level's name, and values that are not strings.
 */
export const LIKELIHOODS_OUT_OF_SCALE = Object.freeze(['H', 'Z', 'a', 'g', ' A', 'A ', 'AB', '', 'Frequent', '1', 1, 7, 0, true, {}, ['A']]);

// ------------------------------------------------------------------ seeded generation

/**
 * A seeded generator of floats in [0, 1) (mulberry32), so a property failure reproduces.
 * @param {number} seed
 * @returns {() => number}
 */
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @template T
 * @param {() => number} random
 * @param {readonly T[]} list
 * @returns {T}
 */
export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

/**
 * A consequence as a caller might pass it: mostly in scale, sometimes absent, sometimes out.
 * @param {() => number} random
 * @returns {unknown}
 */
export function anyConsequence(random) {
  const r = random();
  if (r < 0.6) return consequenceLevel(pick(random, CONSEQUENCE_LEVELS));
  if (r < 0.8) return pick(random, ABSENT);
  return pick(random, CONSEQUENCES_OUT_OF_SCALE);
}

/**
 * @param {() => number} random
 * @returns {unknown}
 */
export function anyLikelihood(random) {
  const r = random();
  if (r < 0.6) return likelihoodLetter(pick(random, LIKELIHOOD_LETTERS));
  if (r < 0.8) return pick(random, ABSENT);
  return pick(random, LIKELIHOODS_OUT_OF_SCALE);
}

/** @param {unknown} v */
export function isAbsent(v) {
  return v === null || v === undefined;
}

/** @param {unknown} v */
export function isConsequenceInScale(v) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;
}

/** @param {unknown} v */
export function isLikelihoodInScale(v) {
  return typeof v === 'string' && LIKELIHOOD_LETTERS.includes(v);
}

/** @param {unknown} v */
export function show(v) {
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(show).join(', ')}]`;
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// ------------------------------------------------------------------ outcomes

/**
 * How a call settled, so a test can compare two calls whichever way each went.
 * @param {() => Promise<unknown>} call
 * @returns {Promise<{ resolved: true, value: any } | { resolved: false, error: any }>}
 */
export async function settle(call) {
  try {
    return { resolved: true, value: await call() };
  } catch (error) {
    return { resolved: false, error };
  }
}

// ------------------------------------------------------------------ ambient input

/**
 * Run `fn` with the clock, the random source, and the browser's storage replaced by
 * recorders, for C-004 ("reads no clock, no browser storage, and no global state"). Each
 * recorder answers as the real thing would, so an implementation that reads one is caught
 * by the record and not by a crash. Everything is restored afterwards.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<{ result: T, touched: string[] }>}
 */
export async function withAmbientRecorders(fn) {
  /** @type {string[]} */
  const touched = [];
  const g = /** @type {Record<string, any>} */ (/** @type {unknown} */ (globalThis));
  const RealDate = Date;
  const realRandom = Math.random;
  const perf = g.performance;
  const realPerfNow = perf ? perf.now : undefined;

  class RecordingDate extends RealDate {
    /** @param {any[]} args */
    constructor(...args) {
      touched.push('new Date()');
      // @ts-ignore spread into the real constructor
      super(...args);
    }

    static now() {
      touched.push('Date.now()');
      return RealDate.now();
    }
  }

  /** @param {string} which */
  const storage = (which) => ({
    length: 0,
    /** @param {string} key */
    getItem: (key) => (touched.push(`${which}.getItem(${key})`), null),
    /** @param {string} key @param {string} value */
    setItem: (key, value) => { touched.push(`${which}.setItem(${key}=${value})`); },
    /** @param {string} key */
    removeItem: (key) => { touched.push(`${which}.removeItem(${key})`); },
    clear: () => { touched.push(`${which}.clear()`); },
    /** @param {number} i */
    key: (i) => (touched.push(`${which}.key(${i})`), null),
  });

  const saved = {
    localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
    sessionStorage: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'),
  };
  g.Date = RecordingDate;
  Math.random = () => { touched.push('Math.random()'); return realRandom(); };
  if (perf) perf.now = () => { touched.push('performance.now()'); return /** @type {() => number} */ (realPerfNow).call(perf); };
  Object.defineProperty(globalThis, 'localStorage', { value: storage('localStorage'), configurable: true, writable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: storage('sessionStorage'), configurable: true, writable: true });
  try {
    const result = await fn();
    return { result, touched };
  } finally {
    g.Date = RealDate;
    Math.random = realRandom;
    if (perf) perf.now = realPerfNow;
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete g[name];
    }
  }
}
