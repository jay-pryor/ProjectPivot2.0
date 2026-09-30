import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignNumbers, updateHazard, addCausalFactor } from '../../src/core/ops/hazards.js';
import { linkExistingControl } from '../../src/core/ops/controls.js';
import { bowtieOf, DEFAULT_FILTERS } from '../../src/core/bowtie.js';
import { bowtieSvg, wrap } from '../../src/ui/bowtie-svg.js';
import { seed, act } from '../helpers.js';

const ORDER = ['causal-factor', 'preventative-control', 'hazard', 'mitigating-control', 'consequence'];
/** Every box and empty-column note, with its rect. @param {string} svg */
function boxes(svg) {
  return [...svg.matchAll(/<g data-bowtie-(node|empty)="([^"]+)"([^>]*)>[\s\S]*?<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"([^>]*)>/g)]
    .map((m) => ({ type: m[1], kind: m[2], attrs: m[3], x: +m[4], y: +m[5], w: +m[6], h: +m[7], rect: m[8] }));
}
function drawn(d, filters = DEFAULT_FILTERS) {
  const b = bowtieOf(d, 'h1', 'p1', filters);
  assert.equal(b.ok, true);
  return bowtieSvg(/** @type {any} */ (b));
}

test('wrap breaks only at spaces and keeps every word, however long', () => {
  assert.deepEqual(wrap('  one two  three '), ['one two three']);
  assert.deepEqual(wrap('a'.repeat(40) + ' b'), ['a'.repeat(40), 'b']);
  assert.equal(wrap('The quick brown fox jumps over the lazy dog again and again').join(' '), 'The quick brown fox jumps over the lazy dog again and again');
  assert.ok(wrap('The quick brown fox jumps over the lazy dog again and again').every((l) => l.length <= 28));
});

test('one box per thing, in five columns left to right, each column in order, nothing overlapping', () => {
  let d = seed();
  d = addCausalFactor(d, act, { id: 'cf2', hazardId: 'h1', text: 'Electrical fault in the switchboard room during maintenance' });
  d = linkExistingControl(d, act, { hazardId: 'h1', platformId: 'p1', controlId: 'c1', kind: 'preventative' });
  const svg = drawn(assignNumbers(d));
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 \d+ \d+"/);
  const b = boxes(svg);
  assert.deepEqual(b.map((x) => x.kind), ['causal-factor', 'causal-factor', 'preventative-control', 'preventative-control', 'hazard', 'mitigating-control', 'consequence']);
  assert.match(svg, /data-bowtie-node="causal-factor" data-record-id="cf1"/);
  assert.match(svg, /data-bowtie-node="hazard" data-record-id="h1"/);
  for (const a of b) {
    for (const c of b) {
      if (a === c) continue;
      const apart = a.x + a.w < c.x || c.x + c.w < a.x || a.y + a.h < c.y || c.y + c.h < a.y;
      assert.ok(apart, `${a.kind} and ${c.kind} overlap`);
      if (ORDER.indexOf(a.kind) < ORDER.indexOf(c.kind)) assert.ok(a.x + a.w < c.x, `${a.kind} is left of ${c.kind}`);
    }
  }
  const causes = b.filter((x) => x.kind === 'causal-factor');
  assert.ok(causes[0].y + causes[0].h < causes[1].y, 'in the hazard\'s order, top to bottom');
  assert.equal([...svg.matchAll(/data-bowtie-edge=/g)].length, 3, 'two causal factors in, one consequence out');
});

test('existing and additional controls look different and say which they are in words', () => {
  const d = linkExistingControl(seed(), act, { hazardId: 'h1', platformId: 'p1', controlId: 'c1', kind: 'preventative' });
  const svg = drawn(assignNumbers(d));
  const controls = boxes(svg).filter((x) => x.kind.endsWith('-control'));
  const existing = controls.find((x) => x.attrs.includes('data-source="existing"'));
  const additional = controls.find((x) => x.attrs.includes('data-source="additional"'));
  assert.ok(existing && additional);
  assert.doesNotMatch(existing.rect, /stroke-dasharray/);
  assert.match(additional.rect, /stroke-dasharray="6 4"/);
  assert.match(additional.attrs, /data-state="recommended"/);
  assert.match(svg, />Existing<\/tspan>/);
  assert.match(svg, />Additional · Recommended<\/tspan>/);
  assert.match(svg, />C-0001 Sprinklers<\/tspan>/);
  assert.match(svg, /<text data-bowtie-caption="true"[^>]*>Alpha · Existing \+ Additional \(Recommended, Planned, Implemented\)<\/text>/);
});

test('an empty wing says so rather than vanishing', () => {
  const svg = drawn(assignNumbers(seed()), { set: 'existing', statuses: [] });
  assert.match(svg, /data-bowtie-empty="preventative-control"[\s\S]*?No preventative controls in this view/);
  assert.match(svg, /data-bowtie-empty="mitigating-control"[\s\S]*?No mitigating controls in this view/);
  assert.equal(boxes(svg).filter((x) => x.type === 'empty').length, 2);
});

test('stored text is drawn as text, whole, never as markup; a long word widens its box', () => {
  let d = updateHazard(seed(), act, { id: 'h1', title: '<script>alert("x")</script> & fire' });
  d = addCausalFactor(d, act, { id: 'cf2', hazardId: 'h1', text: 'Supercalifragilisticexpialidociousnessness-of-wiring' });
  const svg = drawn(assignNumbers(d));
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /<title>&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; fire<\/title>/);
  assert.match(svg, />Supercalifragilisticexpialidociousnessness-of-wiring<\/tspan>/);
  const long = boxes(svg).find((x) => x.attrs.includes('data-record-id="cf2"'));
  assert.ok(long && long.w >= 52 * 5, 'the box is as wide as the word');
});

test('capitals and bold text fit their box: an all-caps hazard title stays inside the hazard border', () => {
  const d = updateHazard(seed(), act, { id: 'h1', title: 'LOSS OF WATERTIGHT INTEGRITY' });
  const hazard = boxes(drawn(assignNumbers(d))).find((x) => x.kind === 'hazard');
  // 28 bold capitals measure about 223 units at 12px; a flat 7 per character gave 28 × 7 + 16 = 212.
  assert.ok(hazard && hazard.w >= 8 * 28 + 16, `the hazard box is ${hazard?.w} wide`);
  const ws = addCausalFactor(seed(), act, { id: 'cf9', hazardId: 'h1', text: 'W'.repeat(28) });
  const wide = boxes(drawn(assignNumbers(ws))).find((x) => x.attrs.includes('data-record-id="cf9"'));
  assert.ok(wide && wide.w >= 332, `a line of Ws is ${wide?.w} wide`);
});

test('five labelled swimlanes, full height, side by side, each holding its own column', () => {
  const svg = drawn(assignNumbers(linkExistingControl(seed(), act, { hazardId: 'h1', platformId: 'p1', controlId: 'c1', kind: 'preventative' })));
  const lanes = [...svg.matchAll(/<g data-bowtie-lane="([^"]+)"><rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"[^>]*\/><text[^>]*>([^<]+)<\/text>/g)]
    .map((m) => ({ kind: m[1], x: +m[2], y: +m[3], w: +m[4], h: +m[5], heading: m[6] }));
  assert.deepEqual(lanes.map((l) => l.heading), ['Causal factors', 'Preventative controls', 'Hazard', 'Mitigating controls', 'Consequences']);
  assert.deepEqual(lanes.map((l) => l.kind), ORDER);
  assert.ok(lanes.every((l) => l.y === lanes[0].y && l.h === lanes[0].h), 'every lane runs the same full height');
  lanes.slice(1).forEach((l, n) => assert.equal(l.x, lanes[n].x + lanes[n].w, 'lanes meet edge to edge'));
  for (const b of boxes(svg)) {
    const lane = lanes.find((l) => l.kind === b.kind);
    assert.ok(lane && b.x >= lane.x && b.x + b.w <= lane.x + lane.w && b.y >= lane.y && b.y + b.h <= lane.y + lane.h, `${b.kind} sits inside its lane`);
  }
  // A lane is at least as wide as its heading, even over a short column.
  assert.ok(lanes[4].w >= 'CONSEQUENCES'.length * 8, `the Consequences lane is ${lanes[4].w} wide`);
});

test('colours come from the page when it sets them, and fall back to a light palette on their own', () => {
  const svg = drawn(assignNumbers(seed()));
  assert.doesNotMatch(svg, /(fill|stroke)="#/, 'no fixed colour attributes');
  assert.match(svg, /style="fill:var\(--bt-box, #ffffff\);stroke:var\(--bt-ink, #1b1f24\)/);
  assert.match(svg, /stroke:var\(--bt-accent, #fa9a26\)/);
  assert.match(svg, /<rect width="\d+" height="\d+" style="fill:var\(--bt-paper, #ffffff\)"\/>/);
  const colours = [...svg.matchAll(/(?:fill|stroke):([^;"]+)/g)].map((m) => m[1]).filter((c) => c !== 'none');
  assert.ok(colours.length > 0 && colours.every((c) => /^var\(--bt-[a-z-]+, #[0-9a-f]{6}\)$/.test(c)), `every colour is a variable with a light fallback: ${colours.find((c) => !/^var\(--bt-[a-z-]+, #[0-9a-f]{6}\)$/.test(c))}`);
});
