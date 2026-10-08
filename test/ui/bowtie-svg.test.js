import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignNumbers, updateHazard, addCausalFactor } from '../../src/core/ops/hazards.js';
import { createControlOn } from '../../src/core/ops/controls.js';
import { setControlStatus } from '../../src/core/ops/assessment.js';
import { bowtieOf, DEFAULT_FILTERS } from '../../src/core/bowtie.js';
import { bowtieSvg, wrap } from '../../src/ui/bowtie-svg.js';
import { seed, act } from '../helpers.js';

/** A third control, preventative, on h1 at Alpha alone. @param {any} d */
const withFireWatch = (d) => createControlOn(d, act, { id: 'c3', title: 'Fire watch', hazardId: 'h1', platformId: 'p1', kind: 'preventative' });

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
  d = withFireWatch(d);
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
  const edges = [...svg.matchAll(/data-bowtie-edge="([^"]+)"/g)].map((m) => m[1]);
  const controls = b.filter((x) => x.kind.endsWith('-control'));
  assert.equal(edges.length, controls.length, 'a line from each control to the hazard, none from causal factors or consequences');
  assert.ok(!edges.some((id) => svg.includes(`data-bowtie-node="causal-factor" data-record-id="${id}"`)), 'no line belongs to a causal factor');
});

test('a control implemented on the platform is drawn solid, any other dashed, its status in words', () => {
  const d = setControlStatus(seed(), act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', status: 'implemented' });
  const svg = drawn(assignNumbers(d));
  const controls = boxes(svg).filter((x) => x.kind.endsWith('-control'));
  const implemented = controls.find((x) => x.attrs.includes('data-state="implemented"'));
  const recommended = controls.find((x) => x.attrs.includes('data-state="recommended"'));
  assert.ok(implemented && recommended);
  assert.ok(controls.every((x) => !x.attrs.includes('data-source')), 'no longer existing or additional');
  assert.doesNotMatch(implemented.rect, /stroke-dasharray/);
  assert.match(recommended.rect, /stroke-dasharray="6 4"/);
  assert.doesNotMatch(svg, /data-bowtie-tag="(existing|additional)"|>(Existing|Additional)</);
  assert.match(svg, /<g data-bowtie-tag="implemented"><rect [^>]*style="fill:var\(--bt-tag-implemented-bg, #e2f4e6\)"\/><text [^>]*>Implemented<\/text><\/g>/, 'badges, coloured by tag, light in a file');
  assert.match(svg, /aria-label="C-001 Sprinklers \(Implemented\)"/);
  assert.match(svg, /<tspan x="\d+" y="\d+"><tspan data-bowtie-label="C-001" font-weight="700" style="fill:var\(--bt-accent[^"]*">C-001<\/tspan> Sprinklers<\/tspan>/, 'its number in the accent colour, its name after it on the same line');
  assert.match(svg, /<text data-bowtie-caption="true"[^>]*>Alpha · Recommended, Planned, Implemented<\/text>/);
});

test('an empty wing keeps its headed lane, with no box saying it is empty', () => {
  const svg = drawn(assignNumbers(seed()), { statuses: [] });
  assert.match(svg, /data-bowtie-lane="preventative-control"/);
  assert.match(svg, /data-bowtie-lane="mitigating-control"/);
  assert.doesNotMatch(svg, /in this view|data-bowtie-empty/);
  assert.equal(boxes(svg).filter((x) => x.type === 'preventative-control' || x.type === 'mitigating-control').length, 0);
});

test('stored text is drawn as text, whole, never as markup; a long word widens its box', () => {
  let d = updateHazard(seed(), act, { id: 'h1', title: '<script>alert("x")</script> & fire' });
  d = addCausalFactor(d, act, { id: 'cf2', hazardId: 'h1', text: 'Supercalifragilisticexpialidociousnessness-of-wiring' });
  const svg = drawn(assignNumbers(d));
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /aria-label="&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; fire"/);
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
  const svg = drawn(assignNumbers(withFireWatch(seed())));
  const lanes = [...svg.matchAll(/<g data-bowtie-lane="([^"]+)"><rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"[^>]*\/><rect data-bowtie-lane-head[^>]*\/><text[^>]*>([^<]+)<\/text>/g)]
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

test('traditional view: a row for each causal factor and consequence, a control repeated on each row it stands on, in sequence toward the hazard', async () => {
  const { setControlTargets } = await import('../../src/core/ops/controls.js');
  let d = seed();
  d = addCausalFactor(d, act, { id: 'cf2', hazardId: 'h1', text: 'Lightning' });
  d = withFireWatch(d);
  d = setControlTargets(d, act, { hazardId: 'h1', controlId: 'c1', platformId: 'p1', targets: ['cf1', 'cf2'] });
  d = setControlTargets(d, act, { hazardId: 'h1', controlId: 'c3', platformId: 'p1', targets: ['cf1'] });
  d = setControlTargets(d, act, { hazardId: 'h1', controlId: 'c2', platformId: 'p1', targets: ['cq1'] });
  const b = bowtieOf(assignNumbers(d), 'h1', 'p1', DEFAULT_FILTERS);
  const svg = bowtieSvg(/** @type {any} */ (b), { layout: 'traditional' });
  assert.match(svg, /data-bowtie-layout="traditional"/);
  assert.match(bowtieSvg(/** @type {any} */ (b)), /data-bowtie-layout="focus"/, 'focus unless asked');
  const all = boxes(svg);
  const at = (/** @type {string} */ id) => [...svg.matchAll(new RegExp(`<g data-bowtie-node="[^"]+" data-record-id="${id}"[^>]*data-bowtie-row="([^"]+)"`, 'g'))].map((m) => m[1]);
  assert.deepEqual(at('c1'), ['cf1', 'cf2'], 'on both causal factors\' rows');
  assert.deepEqual(at('c3'), ['cf1']);
  assert.deepEqual(at('c2'), ['cq1']);
  const row = (/** @type {string} */ key) => all.filter((x) => x.attrs.includes(`data-bowtie-row="${key}"`)).sort((p, q) => p.x - q.x);
  const cf1 = row('cf1');
  assert.deepEqual(cf1.map((x) => x.kind), ['causal-factor', 'preventative-control', 'preventative-control']);
  for (let i = 1; i < cf1.length; i++) assert.ok(cf1[i - 1].x + cf1[i - 1].w < cf1[i].x, 'left to right along the row');
  const mid = (/** @type {any} */ x) => x.y + Math.floor(x.h / 2);
  assert.ok(cf1.every((x) => mid(x) === mid(cf1[0])), 'on one line');
  const hazard = all.find((x) => x.kind === 'hazard');
  assert.ok(hazard && cf1.every((x) => x.x + x.w < hazard.x), 'left of the hazard');
  const cq = row('cq1');
  assert.deepEqual(cq.map((x) => x.kind), ['mitigating-control', 'consequence']);
  assert.ok(hazard && hazard.x + hazard.w < cq[0].x && cq[0].x + cq[0].w < cq[1].x, 'from the hazard out to the consequence');
  for (const a of all) for (const o of all) if (a !== o) assert.ok(a.x + a.w < o.x || o.x + o.w < a.x || a.y + a.h < o.y || o.y + o.h < a.y, `${a.kind} and ${o.kind} overlap`);
});

test('traditional view: a control linked to nothing has a row of its own, so it is not lost', async () => {
  const svg = bowtieSvg(/** @type {any} */ (bowtieOf(assignNumbers(withFireWatch(seed())), 'h1', 'p1', DEFAULT_FILTERS)), { layout: 'traditional' });
  assert.match(svg, /data-bowtie-node="unlinked"[^>]*data-bowtie-row="preventative-control-unlinked"/);
  assert.match(svg, /data-record-id="c3"[^>]*data-bowtie-row="preventative-control-unlinked"/);
  assert.match(svg, /Linked to no causal factor/);
});

test('causal factors and consequences numbered as on the platform tab, in both views, or not at all', () => {
  let d = seed();
  d = addCausalFactor(d, act, { id: 'cf2', hazardId: 'h1', text: 'Lightning' });
  const b = /** @type {any} */ (bowtieOf(assignNumbers(d), 'h1', 'p1', DEFAULT_FILTERS));
  for (const layout of /** @type {const} */ (['focus', 'traditional'])) {
    const svg = bowtieSvg(b, { layout });
    assert.match(svg, /data-record-id="cf1"[^>]*aria-label="1\. [^"]*">[\s\S]*?data-bowtie-num="1"/, layout);
    assert.match(svg, /data-record-id="cf2"[^>]*aria-label="2\. Lightning[^"]*">[\s\S]*?data-bowtie-num="2"/, layout);
    assert.match(svg, /data-record-id="cq1"[^>]*aria-label="1\. [^"]*">[\s\S]*?data-bowtie-num="1"/, layout);
    assert.doesNotMatch(bowtieSvg(b, { layout, numbers: false }), /data-bowtie-num/, `${layout}, numbers off`);
  }
});

test('traditional view: a causal factor or consequence sits as far from its lane\'s right edge as from its left', () => {
  const d = addCausalFactor(withFireWatch(seed()), act, { id: 'cf2', hazardId: 'h1', text: 'Electrical fault in the switchboard room during maintenance' });
  const svg = bowtieSvg(/** @type {any} */ (bowtieOf(assignNumbers(d), 'h1', 'p1', DEFAULT_FILTERS)), { layout: 'traditional' });
  for (const kind of ['causal-factor', 'consequence']) {
    const lane = /<g data-bowtie-lane="([^"]+)"><rect x="(\d+)" y="\d+" width="(\d+)"/g;
    const m = [...svg.matchAll(lane)].find((x) => x[1] === kind);
    assert.ok(m, kind);
    const x0 = +m[2];
    const x1 = x0 + +m[3];
    for (const b of boxes(svg).filter((x) => x.kind === kind)) assert.equal(b.x - x0, x1 - (b.x + b.w), `${kind}: left ${b.x - x0}, right ${x1 - (b.x + b.w)}`);
  }
});

test('both views head every lane with a shaded title cell', () => {
  const b = /** @type {any} */ (bowtieOf(assignNumbers(seed()), 'h1', 'p1', DEFAULT_FILTERS));
  for (const layout of /** @type {const} */ (['focus', 'traditional'])) {
    const heads = [...bowtieSvg(b, { layout }).matchAll(/data-bowtie-lane-head="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(heads, ORDER, layout);
  }
});
