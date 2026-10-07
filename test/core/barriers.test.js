import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setControlKindOnPlatform, setControlTargets, unlinkControl, createControl, addControlHere } from '../../src/core/ops/controls.js';
import { addCausalFactor } from '../../src/core/ops/hazards.js';
import { unlinkHazard } from '../../src/core/ops/platforms.js';
import { controlsOnPlatform } from '../../src/core/queries.js';
import { bowtieOf, DEFAULT_FILTERS } from '../../src/core/bowtie.js';
import { bowtieSvg } from '../../src/ui/bowtie-svg.js';
import { checkRules } from '../../src/core/rules.js';
import { PivotError } from '../../src/core/errors.js';
import { seed, act } from '../helpers.js';

const on = (d, platformId, controlId) => controlsOnPlatform(d, 'h1', platformId).find((c) => c.control.id === controlId);

test('a control\'s kind on one platform: the hazard\'s to begin with, changeable there alone', () => {
  let d = seed();
  assert.equal(on(d, 'p1', 'c1').kind, 'preventative', 'the hazard\'s kind');
  d = setControlKindOnPlatform(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', kind: 'mitigating' });
  assert.equal(on(d, 'p1', 'c1').kind, 'mitigating');
  assert.equal(on(d, 'p2', 'c1').kind, 'preventative', 'Bravo keeps the hazard\'s');
  assert.equal(setControlKindOnPlatform(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', kind: 'mitigating' }), d, 'unchanged: nothing recorded');
  assert.throws(() => setControlKindOnPlatform(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', kind: 'sideways' }), PivotError);
  assert.deepEqual(checkRules(d), []);
});

test('a preventative control is linked to causal factors on its platform, a mitigating one to consequences; a new kind starts over', () => {
  let d = addCausalFactor(seed(), act, { id: 'cf9', hazardId: 'h1', platformId: 'p2', text: 'Bravo only' });
  d = setControlTargets(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', targets: ['cf1'] });
  assert.deepEqual(on(d, 'p1', 'c1').targets.map((t) => t.id), ['cf1']);
  assert.throws(() => setControlTargets(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', targets: ['cf9'] }), (e) => e instanceof PivotError && e.code === 'control.target', 'not Bravo\'s causal factor');
  assert.throws(() => setControlTargets(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', targets: ['cq1'] }), PivotError, 'a preventative one does not mitigate a consequence');
  d = setControlTargets(d, act, { hazardId: 'h1', controlId: 'c2', platformId: 'p1', targets: ['cq1'] });
  assert.deepEqual(on(d, 'p1', 'c2').targets.map((t) => t.text), ['Burns']);
  d = setControlKindOnPlatform(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', kind: 'mitigating' });
  assert.deepEqual(on(d, 'p1', 'c1').targets, [], 'its links go with its old kind');
  // A control added on one platform alone, the same way; targets given as a comma list.
  d = createControl(d, act, { id: 'c3', title: 'Fire blanket' });
  d = addControlHere(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c3', kind: 'preventative' });
  d = setControlTargets(d, act, { hazardId: 'h1', controlId: 'c3', platformId: 'p1', targets: 'cf1' });
  assert.deepEqual(on(d, 'p1', 'c3').targets.map((t) => t.id), ['cf1']);
  d = setControlKindOnPlatform(d, act, { hazardId: 'h1', controlId: 'c3', platformId: 'p1', kind: 'mitigating' });
  assert.deepEqual(on(d, 'p1', 'c3').targets, []);
  assert.equal(on(d, 'p2', 'c3'), undefined, 'still only on Alpha');
  assert.deepEqual(checkRules(d), []);
});

test('the bow-tie joins each control to what it prevents or mitigates; its links go when the control or the platform leaves the hazard', () => {
  let d = setControlTargets(seed(), act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', targets: ['cf1'] });
  d = setControlTargets(d, act, { hazardId: 'h1', controlId: 'c2', platformId: 'p1', targets: ['cq1'] });
  const b = bowtieOf(d, 'h1', 'p1', DEFAULT_FILTERS);
  assert.deepEqual([b.preventative[0].targets, b.mitigating[0].targets], [['cf1'], ['cq1']]);
  const svg = bowtieSvg(/** @type {any} */ (b));
  assert.match(svg, /<path data-bowtie-link="c1" data-bowtie-target="cf1" d="M/);
  assert.match(svg, /<path data-bowtie-link="c2" data-bowtie-target="cq1" d="M/);
  assert.equal(unlinkControl(d, act, { hazardId: 'h1', controlId: 'c1' }).records.controlOn['on:h1:c1:p1'].status, 'deleted');
  const off = unlinkHazard(d, act, { hazardId: 'h1', platformId: 'p1' });
  assert.equal(off.records.controlOn['on:h1:c2:p1'].status, 'deleted');
  assert.deepEqual(checkRules(off), []);
});

test('a control on the bow-tie shows its status and its tier as tags', async () => {
  const { updateControl } = await import('../../src/core/ops/controls.js');
  const { setControlStatus } = await import('../../src/core/ops/assessment.js');
  let d = updateControl(seed(), act, { id: 'c1', tier: 'Engineering' });
  d = setControlStatus(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', status: 'implemented' });
  const b = bowtieOf(d, 'h1', 'p1', DEFAULT_FILTERS);
  assert.deepEqual(b.preventative.find((i) => i.control.id === 'c1').tags.map((t) => t.text), ['Implemented', 'Engineering']);
  assert.deepEqual(b.mitigating.find((i) => i.control.id === 'c2').tags.map((t) => t.text), ['Recommended']);
  assert.match(bowtieSvg(/** @type {any} */ (b)), />Implemented<\/text>[\s\S]*?>Engineering<\/text>/);
});

test('on the bow-tie, a causal factor or consequence no control is linked to is marked, subtly', async () => {
  const { addCausalFactor: add } = await import('../../src/core/ops/hazards.js');
  let d = add(seed(), act, { id: 'cf8', hazardId: 'h1', platformId: 'p1', text: 'Lightning' });
  d = setControlTargets(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', targets: ['cf1'] });
  const svg = bowtieSvg(/** @type {any} */ (bowtieOf(d, 'h1', 'p1', DEFAULT_FILTERS)));
  const node = (id) => svg.slice(svg.indexOf(`data-record-id="${id}"`), svg.indexOf('</g>', svg.indexOf(`data-record-id="${id}"`) + 1) + 40);
  assert.doesNotMatch(node('cf1'), /data-bowtie-unguarded/, 'Hot works has Sprinklers');
  assert.match(node('cf8'), /aria-label="Lightning \(no control stands against it\)"[\s\S]*?stroke-dasharray="3 3"[\s\S]*?data-bowtie-unguarded="true"/);
  assert.match(node('cq1'), /data-bowtie-unguarded="true"/, 'Burns: nothing mitigates it yet');
});
