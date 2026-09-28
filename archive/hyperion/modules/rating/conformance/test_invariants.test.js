/**
 * rating conformance: invariants (CORE-CON-002). Property-based over seeded random calls
 * (CORE-TST-001: the seed is fixed and recorded in harness.js), each against the model the
 * clause it names gives: C-001's table, C-002's "if and only if", C-003's refusal, and
 * C-004's purity. Written from the contract before any implementation (P8).
 *
 * The null double must fail this file (CORE-TST-002, rung 1): fixed data cannot agree with
 * the table, the absent cases, and the refusals at once.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as rating from '../contract.js';
import { ConsequenceOutOfScaleError, LikelihoodOutOfScaleError } from '../contract.js';
import {
  BANDS, MATRIX, SEED, anyConsequence, anyLikelihood, isAbsent, isConsequenceInScale, isLikelihoodInScale, prng, riskCell, settle, show, withAmbientRecorders,
} from './harness.js';

const CALLS = 2000;

/**
 * What the contract says a call with these arguments settles as.
 * @param {unknown} c
 * @param {unknown} l
 * @returns {{ rejects: Function } | { band: string, cell: string | null }}
 */
function expected(c, l) {
  if (!isAbsent(c) && !isConsequenceInScale(c)) return { rejects: ConsequenceOutOfScaleError };
  if (!isAbsent(l) && !isLikelihoodInScale(l)) return { rejects: LikelihoodOutOfScaleError };
  if (isAbsent(c) || isAbsent(l)) return { band: 'Uncategorised', cell: null };
  return { band: MATRIX[/** @type {number} */ (c)][/** @type {string} */ (l)], cell: riskCell(/** @type {any} */ (c), /** @type {any} */ (l)) };
}

test('the model: over seeded calls mixing values in scale, absent, and out of scale, each call settles as C-001 to C-003 say, and a band is always one of the seven (C-001, C-002, C-003)', async () => {
  const random = prng(SEED);
  for (let i = 0; i < CALLS; i += 1) {
    const c = anyConsequence(random);
    const l = anyLikelihood(random);
    const at = `call ${i}: ratingFor(${show(c)}, ${show(l)})`;
    const want = expected(c, l);
    const got = await settle(() => rating.ratingFor(/** @type {any} */ (c), /** @type {any} */ (l)));
    if ('rejects' in want) {
      assert.ok(!got.resolved, `${at} is refused, not rated`);
      assert.ok(!got.resolved && got.error instanceof want.rejects, `${at} rejects with ${want.rejects.name}`);
    } else {
      assert.ok(got.resolved, `${at} resolves; got ${got.resolved ? '' : show(got.error?.name)}`);
      const r = got.value;
      assert.ok(BANDS.includes(r.band), `${at} band ${show(r.band)} is one of the seven`);
      assert.equal(r.band, want.band, `${at} band`);
      assert.equal(r.cell, want.cell, `${at} cell`);
      assert.equal(r.band === 'Uncategorised', r.cell === null, `${at}: Uncategorised if and only if the cell is null`);
      assert.ok(Object.isFrozen(r), `${at} is frozen`);
    }
  }
});

test('holds nothing between calls: over a seeded sequence, every repeat of earlier arguments settles deep-equal to its first call, whatever was called between (C-004)', async () => {
  const random = prng(SEED ^ 0x0404);
  /** @type {{ c: unknown, l: unknown, first: Awaited<ReturnType<typeof settle>> }[]} */
  const seen = [];
  for (let i = 0; i < CALLS; i += 1) {
    if (seen.length > 0 && random() < 0.4) {
      const earlier = seen[Math.floor(random() * seen.length)];
      const again = await settle(() => rating.ratingFor(/** @type {any} */ (earlier.c), /** @type {any} */ (earlier.l)));
      const at = `call ${i}: repeat of ratingFor(${show(earlier.c)}, ${show(earlier.l)})`;
      assert.equal(again.resolved, earlier.first.resolved, `${at} settles the same way`);
      if (again.resolved && earlier.first.resolved) {
        assert.deepEqual(again.value, earlier.first.value, `${at} is deep-equal`);
        assert.ok(Object.isFrozen(again.value), `${at} is frozen`);
      } else if (!again.resolved && !earlier.first.resolved) {
        assert.equal(again.error.constructor, earlier.first.error.constructor, `${at} rejects with the same class`);
        assert.ok(Object.is(again.error.given, earlier.first.error.given), `${at} carries the same value`);
      }
    } else {
      const c = anyConsequence(random);
      const l = anyLikelihood(random);
      seen.push({ c, l, first: await settle(() => rating.ratingFor(/** @type {any} */ (c), /** @type {any} */ (l))) });
    }
  }
});

test('reads no clock, no random source, and no browser storage, and writes none: over seeded calls with each recorded, nothing is touched and every result is the model (C-004)', async () => {
  await rating.ratingFor(null, null); // settle the module load before the recorders go in
  const random = prng(SEED ^ 0x4004);
  const { result, touched } = await withAmbientRecorders(async () => {
    /** @type {string[]} */
    const wrong = [];
    for (let i = 0; i < 500; i += 1) {
      const c = anyConsequence(random);
      const l = anyLikelihood(random);
      const want = expected(c, l);
      const got = await settle(() => rating.ratingFor(/** @type {any} */ (c), /** @type {any} */ (l)));
      const ok = 'rejects' in want
        ? !got.resolved && got.error instanceof want.rejects
        : got.resolved && got.value.band === want.band && got.value.cell === want.cell;
      if (!ok) wrong.push(`ratingFor(${show(c)}, ${show(l)})`);
    }
    return wrong;
  });
  assert.deepEqual(touched, [], 'nothing ambient was read or written');
  assert.deepEqual(result, [], 'every call settled as the model says while the recorders were in');
});

test('a result cannot be changed by its caller, and changing one leaves the next call unchanged (C-004, section 3 "frozen")', async () => {
  const first = await rating.ratingFor(/** @type {any} */ (1), /** @type {any} */ ('A'));
  assert.ok(Object.isFrozen(first));
  assert.throws(() => { 'use strict'; /** @type {any} */ (first).band = 'Low'; }, TypeError);
  assert.throws(() => { 'use strict'; /** @type {any} */ (first).cell = '4E'; }, TypeError);
  const second = await rating.ratingFor(/** @type {any} */ (1), /** @type {any} */ ('A'));
  assert.equal(second.band, 'High');
  assert.equal(second.cell, '1A');
});

test('overlapping calls settle as the model, each with its own arguments (C-004, concurrency safety)', async () => {
  const random = prng(SEED ^ 0x0c0c);
  const args = Array.from({ length: 500 }, () => [anyConsequence(random), anyLikelihood(random)]);
  const outcomes = await Promise.all(args.map(([c, l]) => settle(() => rating.ratingFor(/** @type {any} */ (c), /** @type {any} */ (l)))));
  outcomes.forEach((got, i) => {
    const [c, l] = args[i];
    const want = expected(c, l);
    const at = `overlapping call ${i}: ratingFor(${show(c)}, ${show(l)})`;
    if ('rejects' in want) {
      assert.ok(!got.resolved && got.error instanceof want.rejects, `${at} rejects with ${want.rejects.name}`);
    } else {
      assert.ok(got.resolved, `${at} resolves`);
      assert.equal(got.value.band, want.band, `${at} band`);
      assert.equal(got.value.cell, want.cell, `${at} cell`);
    }
  });
});
