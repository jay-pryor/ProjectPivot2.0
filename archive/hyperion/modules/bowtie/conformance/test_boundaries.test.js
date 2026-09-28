/**
 * bowtie conformance: boundaries (CORE-CON-002). Empty, degenerate, and edge cases of
 * modules/bowtie/CONTRACT.md: one side of the bow-tie empty; a control retired in the library
 * and a platform retired, which the registry keeps (registry C-027); a control linked to two
 * hazards on different sides; a control's state flipped back and forth; another hazard on the
 * platform omitted; a report id set by a user; texts full of XML's special characters, runs of
 * whitespace, and a word longer than any line; a body carrying collections of kinds this module
 * does not read; and a result that does not depend on an earlier call. Written from the contract
 * before any implementation (P8).
 *
 * The null double must fail this file (CORE-TST-002, rung 1).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as bowtie from '../contract.js';
import {
  Builder, WORDS, actualTriples, assertDocument, assertSameBowtie, deepFreeze, expectedBowtie, keyWhere, linesOf, nodesOf, parseSvg, plain,
  snapshot, spoil, standardFixture, textRuns,
} from './harness.js';

/**
 * The bow-tie and its document, each checked against the registry and every clause.
 * @param {import('../../../baseline/schema.js').DataBody} body
 * @param {string} hazard
 * @param {string} platform
 * @param {string} where
 */
async function drawn(body, hazard, platform, where) {
  const w = await bowtie.bowtieFor(body, /** @type {any} */ (hazard), /** @type {any} */ (platform));
  const expected = await expectedBowtie(body, /** @type {any} */ (hazard), /** @type {any} */ (platform));
  assertSameBowtie(w, expected, where);
  const svg = await bowtie.renderBowtieSvg(w);
  const { root } = assertDocument(svg, expected);
  return { w, svg, root };
}

test('a bow-tie with only causal factors and preventative controls, and one with only consequences and mitigating controls, draws one side and the hazard, with an edge for each causal factor or consequence (C-004, C-007, C-008)', async () => {
  const b = new Builder();
  const p = await b.platform('Sides');
  const left = await b.hazard('Left only');
  await b.causalFactor(left, 'Cause');
  const lc = await b.control('Prevent');
  await b.linkControl(left, lc, 'preventative');
  const right = await b.hazard('Right only');
  await b.consequence(right, 'Effect one');
  await b.consequence(right, 'Effect two');
  const rc = await b.control('Mitigate');
  await b.linkControl(right, rc, 'mitigating');
  await b.onPlatform(left, p);
  await b.onPlatform(right, p);

  const l = await drawn(b.body, left, p, 'left only');
  assert.deepStrictEqual(nodesOf(l.root).map((n) => n.attrs['data-bowtie-node']).sort(), ['causal-factor', 'hazard', 'preventative-control']);
  const r = await drawn(b.body, right, p, 'right only');
  assert.deepStrictEqual(nodesOf(r.root).map((n) => n.attrs['data-bowtie-node']).sort(), ['consequence', 'consequence', 'hazard', 'mitigating-control']);
});

test('a hazard with controls and no causal factor or consequence draws no edge: an edge names only a causal factor or consequence (C-008)', async () => {
  const b = new Builder();
  const p = await b.platform('Edges');
  const h = await b.hazard('Controls only');
  for (const [title, kind] of /** @type {const} */ ([['One', 'preventative'], ['Two', 'mitigating']])) {
    const c = await b.control(title);
    await b.linkControl(h, c, kind);
  }
  await b.onPlatform(h, p);
  const { root } = await drawn(b.body, h, p, 'controls only');
  assert.equal(nodesOf(root).length, 3);
  assert.equal(root.children.filter((c) => typeof c !== 'string' && ['line', 'polyline', 'path'].includes(c.name)).length, 0, 'no edge at the top level');
});

test('a control retired in the library and a retired platform stay in the bow-tie as the registry keeps them, the control with its state and its stored status (C-001; registry C-027)', async () => {
  const f = await standardFixture();
  const { w } = await drawn(f.body, f.h1, f.alpha, 'a retired control confirmed on alpha');
  const retired = w.mitigatingControls.find((c) => c.control.id === f.mitRetired);
  assert.ok(retired, 'the retired control is still on the hazard\'s mitigating side');
  assert.equal(retired.state, 'confirmed');
  assert.equal(retired.control.status, 'retired');

  await f.builder.retirePlatform(f.beta);
  const onRetired = await drawn(f.builder.body, f.h1, f.beta, 'a retired platform');
  assert.equal(onRetired.w.platform.status, 'retired');
});

test('one control linked to two hazards on different sides is drawn on each hazard\'s own side, with its state for that hazard on that platform (C-001, C-004, C-007)', async () => {
  const f = await standardFixture();
  const h1 = await drawn(f.body, f.h1, f.alpha, 'h1');
  const h2 = await drawn(f.body, f.h2, f.alpha, 'h2');
  const inH1 = nodesOf(h1.root).find((n) => n.attrs['data-record-id'] === f.prevConfirmed);
  const inH2 = nodesOf(h2.root).find((n) => n.attrs['data-record-id'] === f.prevConfirmed);
  assert.deepStrictEqual([inH1?.attrs['data-bowtie-node'], inH1?.attrs['data-control-state']], ['preventative-control', 'confirmed']);
  assert.deepStrictEqual([inH2?.attrs['data-bowtie-node'], inH2?.attrs['data-control-state']], ['mitigating-control', 'awaiting']);
});

test('a control confirmed, excluded, and confirmed again is drawn in the state the registry gives now, never an earlier one (C-001, C-006)', async () => {
  const f = await standardFixture();
  const b = f.builder;
  /** @type {Map<string, string>} */
  const seen = new Map();
  for (const [act, state] of /** @type {const} */ ([['exclude', 'excluded'], ['confirm', 'confirmed'], ['exclude', 'excluded']])) {
    if (act === 'exclude') await b.exclude(f.h1, f.prevConfirmed, f.alpha, `reason for ${state}`);
    else await b.confirm(f.h1, f.prevConfirmed, f.alpha);
    const w = await bowtie.bowtieFor(b.body, f.h1, f.alpha);
    assertSameBowtie(w, await expectedBowtie(b.body, f.h1, f.alpha));
    assert.equal(w.preventativeControls.find((c) => c.control.id === f.prevConfirmed)?.state, state);
    const { root } = assertDocument(await bowtie.renderBowtieSvg(w), w, seen);
    assert.equal(nodesOf(root).find((n) => n.attrs['data-record-id'] === f.prevConfirmed)?.attrs['data-control-state'], state);
  }
});

test('another hazard on the platform named as omitted does not stop this hazard\'s bow-tie (C-002: only this hazard in omitted is refused)', async () => {
  const f = await standardFixture();
  const key = keyWhere(f.body, 'rating', (r) => r.hazardId === f.h1 && r.platformId === f.alpha && r.stage === 'residual' && r.status === 'live');
  const body = spoil(f.body, 'rating', key, (r) => ({ ...r, consequence: 'one' }));
  await drawn(body, f.h2, f.alpha, 'h2 while h1 is omitted');
});

test('a report id a user set is the hazard node\'s first line exactly and is in the caption; the hazard\'s global id is its record id (C-004, C-005)', async () => {
  const f = await standardFixture();
  await f.builder.reportId(f.h1, f.beta, 'BETA-REPORT 12 & <13>');
  const { root, w } = await drawn(f.builder.body, f.h1, f.beta, 'a set report id');
  assert.equal(w.reportId, 'BETA-REPORT 12 & <13>');
  const hazard = nodesOf(root).find((n) => n.attrs['data-bowtie-node'] === 'hazard');
  assert.ok(hazard);
  assert.equal(hazard.attrs['data-record-id'], f.h1);
  assert.equal(linesOf(hazard)[0], 'BETA-REPORT 12 & <13>');
});

test('texts made of XML\'s special characters, entity and markup look-alikes, runs of spaces, tabs, and newlines, other scripts, and a word longer than any line are drawn whole: each <title> is the stored text exactly and no word is split (C-005, C-009)', async () => {
  const b = new Builder();
  const p = await b.platform('Tug "Bravo" & <Co>');
  const h = await b.hazard(WORDS.join(' '));
  await b.causalFactor(h, 'Tab\tseparated   and\n\nnewline  separated');
  await b.causalFactor(h, WORDS[WORDS.length - 1]);
  await b.consequence(h, '&amp; is not & and &lt; is not <; ]]> <!-- --> <?pi?>');
  const c = await b.control('onload="alert(1)" style="x" href="url(#y)"');
  await b.linkControl(h, c, 'mitigating');
  await b.onPlatform(h, p);
  await b.exclude(h, c, p, 'A reason');
  const { root } = await drawn(b.body, h, p, 'hostile texts');
  const longest = WORDS[WORDS.length - 1];
  const lines = nodesOf(root).flatMap((n) => linesOf(n));
  assert.ok(lines.some((l) => l.split(' ').includes(longest)), 'the longest word is on one line, whole');
  const titles = nodesOf(root).flatMap((n) => n.children.filter((c) => typeof c !== 'string' && c.name === 'title')).map((t) => textRuns(/** @type {any} */ (t)).join(''));
  assert.ok(titles.includes('Tab\tseparated   and\n\nnewline  separated'), 'the whitespace inside a stored text is kept in its <title>');
});

test('a body carrying collections of kinds this module does not read, however shaped, gives the same bow-tie and document, and is left deep-equal; a deep-frozen body is read without being written (C-003)', async () => {
  const f = await standardFixture();
  const plainBody = f.body;
  const withOthers = snapshot(f.body);
  /** @type {any} */ (withOthers.collections)['reference-entry'] = { junk: [1, 2, 3], 'R-1': { title: 'no header at all' } };
  /** @type {any} */ (withOthers.collections)['workflow-record'] = 'not even an object of records';
  deepFreeze(withOthers);
  const before = snapshot(withOthers);
  const a = await drawn(plainBody, f.h1, f.alpha, 'without other collections');
  const b = await drawn(withOthers, f.h1, f.alpha, 'with other collections');
  assert.deepStrictEqual(plain(b.w), plain(a.w));
  assert.equal(b.svg, a.svg);
  assert.deepStrictEqual(withOthers, before);
});

test('a result depends on its arguments alone: a bow-tie read after one from a changed body, and a document drawn after another, is what it was when read first (C-003, C-010)', async () => {
  const f = await standardFixture();
  const first = await drawn(f.body, f.h1, f.alpha, 'first');
  await f.builder.retitle(f.h1, 'A different title');
  const changed = await drawn(f.builder.body, f.h1, f.alpha, 'after the edit');
  assert.notEqual(changed.svg, first.svg, 'the edit is drawn');
  const other = await drawn(f.body, f.h2, f.alpha, 'another hazard');
  assert.notDeepEqual(actualTriples(other.root), actualTriples(first.root));
  const again = await drawn(f.body, f.h1, f.alpha, 'the first body again');
  assert.deepStrictEqual(plain(again.w), plain(first.w));
  assert.equal(again.svg, first.svg);
});
