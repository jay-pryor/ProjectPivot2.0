/**
 * rating conformance: errors (CORE-CON-002). Every condition in section 4 of
 * modules/rating/CONTRACT.md, signalled as the named rejected promise carrying what was
 * given, and never as a resolved `'Uncategorised'` (C-003). Written from the contract before
 * any implementation (P8).
 *
 * The null double must fail this file (CORE-TST-002, rung 1): an implementation that
 * enforces nothing resolves where every test below expects a rejection.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as rating from '../contract.js';
import { ConsequenceOutOfScaleError, LikelihoodOutOfScaleError } from '../contract.js';
import {
  ABSENT, CONSEQUENCES_OUT_OF_SCALE, CONSEQUENCE_LEVELS, LIKELIHOODS_OUT_OF_SCALE, LIKELIHOOD_LETTERS, consequenceLevel, likelihoodLetter, settle, show,
} from './harness.js';

/**
 * Assert the call rejected with `ErrorClass` carrying `given`, and did not resolve at all.
 * @param {() => Promise<unknown>} call
 * @param {Function} ErrorClass
 * @param {unknown} given
 * @param {string} what
 */
async function assertRefused(call, ErrorClass, given, what) {
  const outcome = await settle(call);
  if (outcome.resolved) {
    assert.fail(`${what} resolved with ${show(outcome.value)}; it must be refused, not rated`);
  }
  assert.ok(outcome.error instanceof ErrorClass, `${what} rejects with ${ErrorClass.name}, got ${show(outcome.error?.name ?? outcome.error)}`);
  assert.ok(Object.is(outcome.error.given, given), `${what}: the error carries what was given`);
}

test('a consequence present and not a whole number 1 to 5 rejects with ConsequenceOutOfScaleError carrying it, whatever the likelihood in scale (section 4, C-003)', async () => {
  for (const bad of CONSEQUENCES_OUT_OF_SCALE) {
    for (const l of LIKELIHOOD_LETTERS) {
      await assertRefused(() => rating.ratingFor(/** @type {any} */ (bad), likelihoodLetter(l)), ConsequenceOutOfScaleError, bad, `ratingFor(${show(bad)}, ${show(l)})`);
    }
  }
});

test('a likelihood present and not one of A to G rejects with LikelihoodOutOfScaleError carrying it, whatever the consequence in scale (section 4, C-003)', async () => {
  for (const bad of LIKELIHOODS_OUT_OF_SCALE) {
    for (const c of CONSEQUENCE_LEVELS) {
      await assertRefused(() => rating.ratingFor(consequenceLevel(c), /** @type {any} */ (bad)), LikelihoodOutOfScaleError, bad, `ratingFor(${c}, ${show(bad)})`);
    }
  }
});

test('the DEC-001 integer likelihood is refused, not read as a letter: 1 is not Frequent (section 4, explicitly not promised)', async () => {
  for (let n = 1; n <= 7; n += 1) {
    await assertRefused(() => rating.ratingFor(consequenceLevel(1), /** @type {any} */ (n)), LikelihoodOutOfScaleError, n, `ratingFor(1, ${n})`);
  }
});

test('a value out of scale beside an absent one is refused, not Uncategorised (C-003)', async () => {
  for (const absent of ABSENT) {
    for (const bad of CONSEQUENCES_OUT_OF_SCALE) {
      await assertRefused(() => rating.ratingFor(/** @type {any} */ (bad), absent), ConsequenceOutOfScaleError, bad, `ratingFor(${show(bad)}, ${show(absent)})`);
    }
    for (const bad of LIKELIHOODS_OUT_OF_SCALE) {
      await assertRefused(() => rating.ratingFor(absent, /** @type {any} */ (bad)), LikelihoodOutOfScaleError, bad, `ratingFor(${show(absent)}, ${show(bad)})`);
    }
  }
});

test('when both values are out of scale, ConsequenceOutOfScaleError is the one signalled, carrying the consequence (section 4)', async () => {
  for (const badC of CONSEQUENCES_OUT_OF_SCALE) {
    for (const badL of LIKELIHOODS_OUT_OF_SCALE) {
      await assertRefused(() => rating.ratingFor(/** @type {any} */ (badC), /** @type {any} */ (badL)), ConsequenceOutOfScaleError, badC, `ratingFor(${show(badC)}, ${show(badL)})`);
    }
  }
});

test('the error classes are Errors, named as section 4 names them', () => {
  const c = new ConsequenceOutOfScaleError(6);
  const l = new LikelihoodOutOfScaleError('H');
  assert.ok(c instanceof Error);
  assert.ok(l instanceof Error);
  assert.equal(c.name, 'ConsequenceOutOfScaleError');
  assert.equal(l.name, 'LikelihoodOutOfScaleError');
});
