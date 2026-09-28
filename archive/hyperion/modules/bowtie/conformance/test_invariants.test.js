/**
 * bowtie conformance: invariants (CORE-CON-002). Property-based over seeded random bodies built
 * through `registry`'s changing operations, and over seeded random `Bowtie` values built by hand
 * (CORE-TST-001: the seed is fixed and recorded in harness.js). Each test states the model it
 * checks against — the registry's own reads for C-001 and C-002, the document model in
 * harness.js for C-004 to C-009 — and the clauses of modules/bowtie/CONTRACT.md it comes from.
 * Written from the contract before any implementation (P8).
 *
 * The null double must fail this file (CORE-TST-002, rung 1): fixed data is not the registry's
 * data for any hazard, and a fixed document does not hold the nodes of any bow-tie.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as bowtie from '../contract.js';
import {
  Builder, SEED, STATES, assertDocument, assertSameBowtie, deepFreeze, expectedBowtie, handBuiltBowtie, pick, plain, prng, randomName,
  randomText, registry, snapshot, withAmbientSpies,
} from './harness.js';

/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */

/**
 * @template T
 * @param {() => number} random
 * @param {readonly T[]} list
 * @returns {T}
 */
function choose(random, list) {
  return list[pick(random, list.length)];
}

/**
 * A random body built through the registry: platforms, hazards with causal factors and
 * consequences, a library of controls linked to hazards on either side, hazards linked to
 * platforms with some report ids set, controls confirmed, excluded, re-confirmed, and re-excluded
 * at random, some controls and platforms retired, and some hazards deleted or retired.
 * @param {() => number} random
 */
async function randomBody(random) {
  const b = new Builder();
  const platforms = [];
  for (let k = 0; k < 1 + pick(random, 3); k += 1) platforms.push(await b.platform(randomName(random)));
  const hazards = [];
  for (let k = 0; k < 1 + pick(random, 5); k += 1) {
    const h = await b.hazard(randomText(random));
    hazards.push(h);
    for (let n = pick(random, 4); n > 0; n -= 1) await b.causalFactor(h, randomText(random));
    for (let n = pick(random, 4); n > 0; n -= 1) await b.consequence(h, randomText(random));
  }
  const controls = [];
  for (let k = 0; k < pick(random, 7); k += 1) controls.push(await b.control(randomText(random)));
  /** @type {Array<[string, string]>} */
  const hazardControls = [];
  for (const h of hazards) {
    for (const c of controls) {
      if (random() < 0.4) {
        await b.linkControl(h, c, random() < 0.5 ? 'preventative' : 'mitigating');
        hazardControls.push([h, c]);
      }
    }
  }
  /** @type {Array<[string, string]>} */
  const onPlatform = [];
  for (const h of hazards) {
    for (const p of platforms) {
      if (random() < 0.6) {
        await b.onPlatform(h, p);
        onPlatform.push([h, p]);
        if (random() < 0.3) await b.reportId(h, p, randomName(random));
      }
    }
  }
  for (const [h, p] of onPlatform) {
    for (const [hc, c] of hazardControls) {
      if (hc !== h) continue;
      /** @type {string} */
      let state = 'awaiting';
      for (let n = pick(random, 4); n > 0; n -= 1) {
        const next = random() < 0.5 ? 'confirmed' : 'excluded';
        if (next === state) continue;
        if (next === 'confirmed') await b.confirm(h, c, p);
        else await b.exclude(h, c, p, randomText(random));
        state = next;
      }
    }
  }
  for (const c of controls) if (random() < 0.2) await b.retireControl(c);
  for (const p of platforms) if (random() < 0.15) await b.retirePlatform(p);
  for (const h of hazards) {
    const linked = onPlatform.some(([x]) => x === h);
    const roll = random();
    if (roll < 0.1) await b.deleteHazard(h);
    else if (roll < 0.2 && !linked) await b.retireHazard(h);
  }
  return { body: b.body, platforms, hazards };
}

const TRIALS = 30;

test('HZ-011: over random bodies built through the registry, every bow-tie a platform\'s query lists is the registry\'s data for that hazard on that platform, and its drawing holds exactly those nodes with each text whole, each state in words, laid out by side and order, with no relation the registry does not store; every other hazard is refused, never drawn (C-001, C-002, C-004 to C-009; SL-08 criterion 1)', async () => {
  const random = prng(SEED);
  /** @type {Map<string, string>} */
  const seen = new Map();
  let drawn = 0;
  let refused = 0;
  for (let trial = 0; trial < TRIALS; trial += 1) {
    const { body, platforms, hazards } = await randomBody(random);
    for (const p of platforms) {
      const query = await registry.listPlatformHazards(body, /** @type {any} */ (p));
      const rows = new Set(query.rows.map((r) => r.hazard.id));
      for (const h of [...hazards, 'H-9999']) {
        const where = `trial ${trial}, hazard ${h}, platform ${p}`;
        if (rows.has(/** @type {any} */ (h))) {
          const w = await bowtie.bowtieFor(body, /** @type {any} */ (h), /** @type {any} */ (p));
          const expected = await expectedBowtie(body, /** @type {any} */ (h), /** @type {any} */ (p));
          assertSameBowtie(w, expected, where);
          assertDocument(await bowtie.renderBowtieSvg(w), expected, seen);
          drawn += 1;
        } else {
          await assert.rejects(bowtie.bowtieFor(body, /** @type {any} */ (h), /** @type {any} */ (p)), `C-002: ${where} is not a row and is refused`);
          refused += 1;
        }
      }
    }
  }
  assert.ok(drawn >= TRIALS && refused >= TRIALS, `the generator reaches both cases: ${drawn} drawn, ${refused} refused`);
  assert.deepStrictEqual([...seen.keys()].sort(), [...STATES].sort(), 'the generator reaches every state');
});

test('C-003 and C-010: over random bodies, bowtieFor and renderBowtieSvg read no browser storage, document, or clock; leave a deep-frozen body deep-equal to what it was; hold nothing between calls, so calls on other bodies in between change no result; and give deep-equal bow-ties and identical text for deep-equal arguments', async () => {
  const random = prng(SEED ^ 0x0c003);
  /** @type {Array<{ body: DataBody, pairs: Array<[string, string]> }>} */
  const bodies = [];
  for (let trial = 0; trial < 10; trial += 1) {
    const { body, platforms } = await randomBody(random);
    /** @type {Array<[string, string]>} */
    const pairs = [];
    for (const p of platforms) {
      for (const row of (await registry.listPlatformHazards(body, /** @type {any} */ (p))).rows) pairs.push([row.hazard.id, p]);
    }
    if (pairs.length > 0) bodies.push({ body: deepFreeze(body), pairs });
  }
  assert.ok(bodies.length >= 5, 'fixture: the generator gives bodies with bow-ties');

  const warm = bodies[0];
  await bowtie.renderBowtieSvg(await bowtie.bowtieFor(warm.body, /** @type {any} */ (warm.pairs[0][0]), /** @type {any} */ (warm.pairs[0][1])));

  /** @type {Array<{ body: DataBody, h: string, p: string, w: unknown, svg: string }>} */
  const first = [];
  const before = bodies.map((x) => snapshot(x.body));
  const { uses } = await withAmbientSpies(async () => {
    for (const { body, pairs } of bodies) {
      for (const [h, p] of pairs) {
        const w = await bowtie.bowtieFor(body, /** @type {any} */ (h), /** @type {any} */ (p));
        first.push({ body, h, p, w: plain(w), svg: await bowtie.renderBowtieSvg(w) });
      }
    }
  });
  assert.deepStrictEqual(uses, [], 'C-003: no read or write of the browser\'s storage, the document, or the clock');
  bodies.forEach((x, i) => assert.deepStrictEqual(x.body, before[i], 'C-003: the body is deep-equal to what it was'));

  for (let k = 0; k < 3; k += 1) {
    for (const i of first.map((_, n) => n).sort(() => random() - 0.5)) {
      const { body, h, p, w, svg } = first[i];
      const again = await bowtie.bowtieFor(structuredClone(body), /** @type {any} */ (h), /** @type {any} */ (p));
      assert.deepStrictEqual(plain(again), w, 'C-003, C-010: the same bow-tie whatever was asked before, from a deep-equal body');
      assert.equal(await bowtie.renderBowtieSvg(/** @type {any} */ (structuredClone(w))), svg, 'C-010: identical text for a deep-equal bow-tie');
    }
  }
});

test('C-004 to C-011 over random bow-ties built by hand: renderBowtieSvg accepts every well-formed value, from empty lists to forty-word texts full of markup characters, and every document holds every clause, with each state drawn by one line across every document', async () => {
  const random = prng(SEED ^ 0x0c011);
  /** @type {Map<string, string>} */
  const seen = new Map();
  const shapes = [
    { causalFactors: 0, consequences: 0, preventative: 0, mitigating: 0 },
    { causalFactors: 1, consequences: 0, preventative: 0, mitigating: 3 },
    { causalFactors: 0, consequences: 6, preventative: 4, mitigating: 0 },
    {},
  ];
  for (let trial = 0; trial < 150; trial += 1) {
    const w = handBuiltBowtie(random, choose(random, shapes));
    const svg = await bowtie.renderBowtieSvg(w);
    assertDocument(svg, w, seen);
    assert.equal(await bowtie.renderBowtieSvg(/** @type {any} */ (structuredClone(w))), svg, 'C-010');
  }
  assert.deepStrictEqual([...seen.keys()].sort(), [...STATES].sort(), 'the generator reaches every state');
});

test('C-006: a control\'s state line depends on its state alone, not on its title, its side, or the rest of the bow-tie', async () => {
  const random = prng(SEED ^ 0x0c006);
  /** @type {Map<string, string>} */
  const seen = new Map();
  for (let trial = 0; trial < 40; trial += 1) {
    const w = /** @type {any} */ (handBuiltBowtie(random, { preventative: 3, mitigating: 3, text: () => choose(random, ['confirmed', 'excluded', 'awaiting', 'Awaiting confirmation', randomText(random)]) }));
    assertDocument(await bowtie.renderBowtieSvg(w), w, seen);
  }
  assert.equal(seen.size, 3);
});
