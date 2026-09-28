/**
 * bowtie conformance: operations (CORE-CON-002). Each operation of modules/bowtie/CONTRACT.md
 * doing what its clauses say on the standard fixture: the bow-tie is the registry's data for
 * that hazard on that platform (C-001), drawn as one node per thing compared with the registry
 * and not by eye (C-004 to C-009), an edit shown in the next diagram (C-001, C-003), each control
 * state in words (C-006), and the shown and exported drawing one text (C-010). SL-08 criteria 1
 * to 3, this module's half. Written from the contract before any implementation (P8).
 *
 * The null double may pass this file (CORE-TST-002, rung 1); errors, invariants, and boundaries
 * are the ones it must fail.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as bowtie from '../contract.js';
import {
  Builder, actualTriples, assertDocument, assertSameBowtie, expectedBowtie, expectedTriples, linesOf, nodesOf, parseSvg, plain, registry,
  standardFixture,
} from './harness.js';

/**
 * A list's controls as a sorted set of `[control id, state]`. Records made in the same second
 * are ordered by a random id (registry section 5, Determinism), so a test states membership here
 * and leaves order to the comparison with the registry.
 * @param {readonly import('../../registry/contract.js').PlatformControl[]} controls
 */
function controlStates(controls) {
  return controls.map((c) => JSON.stringify([c.control.id, c.state])).sort();
}

/**
 * @param {Array<[string, string]>} pairs
 */
function statesOf(pairs) {
  return pairs.map((p) => JSON.stringify(p)).sort();
}

test('bowtieFor resolves with the registry\'s data for that hazard on that platform: the query\'s platform, the row\'s hazard and report id, getHazardDetail\'s causal factors and consequences, and the row\'s controls split by controlKind, each in order with its state on that platform (C-001; SL-08 criterion 1)', async () => {
  const f = await standardFixture();
  const onAlpha = await bowtie.bowtieFor(f.body, f.h1, f.alpha);
  assertSameBowtie(onAlpha, await expectedBowtie(f.body, f.h1, f.alpha), 'h1 on alpha');
  assert.deepStrictEqual(controlStates(onAlpha.preventativeControls), statesOf([[f.prevConfirmed, 'confirmed'], [f.prevExcluded, 'excluded']]));
  assert.deepStrictEqual(controlStates(onAlpha.mitigatingControls), statesOf([[f.mitAwaiting, 'awaiting'], [f.mitRetired, 'confirmed']]));
  assert.equal(onAlpha.reportId, 'ALPHA 007');

  const onBeta = await bowtie.bowtieFor(f.body, f.h1, f.beta);
  assertSameBowtie(onBeta, await expectedBowtie(f.body, f.h1, f.beta), 'h1 on beta');
  assert.deepStrictEqual(controlStates(onBeta.preventativeControls), statesOf([[f.prevConfirmed, 'excluded'], [f.prevExcluded, 'awaiting']]),
    'the state of each control is the state on this platform, not another');
  assert.equal(onBeta.reportId, f.h1, 'the report id is this platform\'s');

  const h2 = await bowtie.bowtieFor(f.body, f.h2, f.alpha);
  assertSameBowtie(h2, await expectedBowtie(f.body, f.h2, f.alpha), 'h2 on alpha');
  assert.deepStrictEqual(h2.causalFactors.map((c) => c.id), [f.h2cf], 'another hazard\'s causal factors are not in it');
  assert.deepStrictEqual(h2.preventativeControls, [], 'a control is on the side its link to this hazard says');
  assert.deepStrictEqual(controlStates(h2.mitigatingControls), statesOf([[f.prevConfirmed, 'awaiting']]));
});

test('a Bowtie is frozen (section 3)', async () => {
  const f = await standardFixture();
  const w = await bowtie.bowtieFor(f.body, f.h1, f.alpha);
  assert.ok(Object.isFrozen(w));
});

test('renderBowtieSvg draws the bow-tie as one self-contained document whose nodes equal the set the registry query returns, compared and not read by eye: each text whole, each state in words, each thing on its side in order, edges only for what the registry relates (C-004 to C-009; SL-08 criterion 1)', async () => {
  const f = await standardFixture();
  for (const [hazard, platform] of [[f.h1, f.alpha], [f.h1, f.beta], [f.h2, f.alpha], [f.h3, f.beta]]) {
    const w = await bowtie.bowtieFor(f.body, hazard, platform);
    const svg = await bowtie.renderBowtieSvg(w);
    assertDocument(svg, await expectedBowtie(f.body, hazard, platform));
  }
  const w = await bowtie.bowtieFor(f.body, f.h1, f.alpha);
  const root = parseSvg(await bowtie.renderBowtieSvg(w));
  assert.equal(nodesOf(root).length, 1 + 2 + 2 + 4, 'h1 on alpha draws the hazard, two causal factors, two consequences, and four controls');
});

test('each control\'s state is drawn in words: the three states have three different state lines, and a control awaiting a ruling is not drawn as confirmed (C-006; REQ-018)', async () => {
  const f = await standardFixture();
  const w = await bowtie.bowtieFor(f.body, f.h1, f.alpha);
  const { stateLines } = assertDocument(await bowtie.renderBowtieSvg(w), w);
  const byState = new Map(stateLines.map((s) => [s.state, s.line]));
  assert.deepStrictEqual([...byState.keys()].sort(), ['awaiting', 'confirmed', 'excluded'], 'fixture: all three states are drawn');
  assert.equal(new Set(byState.values()).size, 3);
  const root = parseSvg(await bowtie.renderBowtieSvg(w));
  const awaiting = nodesOf(root).find((n) => n.attrs['data-record-id'] === f.mitAwaiting);
  assert.ok(awaiting);
  const lines = linesOf(awaiting);
  assert.equal(lines[lines.length - 1], byState.get('awaiting'));
  assert.notEqual(lines[lines.length - 1], byState.get('confirmed'));
});

test('an edit to the hazard is in the next bow-tie and the next drawing: a new title, causal factor, consequence, control, confirmation, and exclusion (C-001, C-003; SL-08 criterion 2)', async () => {
  const f = await standardFixture();
  const b = f.builder;
  const shown = await bowtie.bowtieFor(b.body, f.h1, f.alpha);

  await b.retitle(f.h1, 'Loss of propulsion near the berth');
  const cf3 = await b.causalFactor(f.h1, 'Blocked sea chest');
  const cq3 = await b.consequence(f.h1, 'Allision with the quay');
  const newControl = await b.control('Pre-arrival engine test');
  await b.linkControl(f.h1, newControl, 'preventative');
  await b.confirm(f.h1, newControl, f.alpha);
  await b.exclude(f.h1, f.mitAwaiting, f.alpha, 'Anchoring prohibited in this berth');
  await b.confirm(f.h1, f.prevExcluded, f.alpha);

  const next = await bowtie.bowtieFor(b.body, f.h1, f.alpha);
  assertSameBowtie(next, await expectedBowtie(b.body, f.h1, f.alpha), 'after the edits');
  assert.equal(next.hazard.title, 'Loss of propulsion near the berth');
  assert.deepStrictEqual(next.causalFactors.map((c) => c.id).sort(), [f.cf1, f.cf2, cf3].sort());
  assert.deepStrictEqual(next.consequences.map((c) => c.id).sort(), [f.cq1, f.cq2, cq3].sort());
  assert.deepStrictEqual(controlStates(next.preventativeControls), statesOf([[f.prevConfirmed, 'confirmed'], [f.prevExcluded, 'confirmed'], [newControl, 'confirmed']]));
  assert.deepStrictEqual(controlStates(next.mitigatingControls), statesOf([[f.mitAwaiting, 'excluded'], [f.mitRetired, 'confirmed']]));

  const svg = await bowtie.renderBowtieSvg(next);
  assertDocument(svg, next);
  assert.notDeepEqual(actualTriples(parseSvg(svg)), expectedTriples(shown), 'the drawing is not the one shown before the edits');

  const again = await bowtie.bowtieFor(f.body, f.h1, f.alpha);
  assertSameBowtie(again, shown, 'the body from before the edits still gives the bow-tie it gave');
});

test('the diagram shown and the diagram exported are one text: two renders of the same bow-tie, of a deep-equal copy, and of a bow-tie read again from the same body are identical strings holding the same nodes (C-010; SL-08 criterion 3)', async () => {
  const f = await standardFixture();
  const w = await bowtie.bowtieFor(f.body, f.h1, f.alpha);
  const shown = await bowtie.renderBowtieSvg(w);
  const exported = await bowtie.renderBowtieSvg(w);
  assert.equal(exported, shown);
  assert.equal(await bowtie.renderBowtieSvg(/** @type {any} */ (plain(w))), shown, 'a deep-equal, unfrozen copy draws the same text');
  const reread = await bowtie.bowtieFor(structuredClone(f.body), f.h1, f.alpha);
  assert.deepStrictEqual(plain(reread), plain(w), 'bowtieFor of a deep-equal body is deep-equal');
  assert.equal(await bowtie.renderBowtieSvg(reread), shown);
  assert.deepStrictEqual(actualTriples(parseSvg(exported)), actualTriples(parseSvg(shown)));
});

test('a hazard with nothing but its link to the platform is a bow-tie with every list empty, drawn as the hazard node alone with no edges (section 5, null and empty semantics)', async () => {
  const b = new Builder();
  const p = await b.platform('Solo');
  const h = await b.hazard('Bare hazard');
  await b.onPlatform(h, p);
  const w = await bowtie.bowtieFor(b.body, h, p);
  assertSameBowtie(w, await expectedBowtie(b.body, h, p));
  for (const list of [w.causalFactors, w.consequences, w.preventativeControls, w.mitigatingControls]) assert.deepStrictEqual([...list], []);
  const svg = await bowtie.renderBowtieSvg(w);
  const { root } = assertDocument(svg, w);
  assert.deepStrictEqual(actualTriples(root), [JSON.stringify(['hazard', h, null])]);
  const detail = await registry.getHazardDetail(b.body, h);
  assert.ok(detail);
});
