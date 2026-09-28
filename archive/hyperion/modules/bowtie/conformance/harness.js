/**
 * Test support for the bowtie conformance suite (CORE-CON-002). Not a test file: the runner
 * collects `*.test.js` only.
 *
 * Section 2 of modules/bowtie/CONTRACT.md: a conformance test builds a body through
 * `registry`'s changing operations from `schema.emptyDataBody()`, compares against
 * `registry.getHazardDetail` and `registry.listPlatformHazards` on the same body, needs no
 * folder and no browser, and reads a document through the syntax C-009 restricts it to, so no
 * XML library is needed (IMP-06). So this file imports only what modules/bowtie/manifest.yaml
 * declares (CORE-CON-003, `declared`): baseline/types, baseline/schema, and
 * modules/registry/contract.
 *
 * Provides: a builder that threads a body through `registry`'s changing operations; the
 * standard fixture most tests start from; the bow-tie C-001 derives from the registry; a
 * reader for C-009's syntax and the document model C-004 to C-008 are stated over, with one
 * assertion per clause; hand-built `Bowtie` values for `renderBowtieSvg` alone; spies on the
 * browser's storage, the document, and the clock for C-003; and a seeded generator
 * (CORE-TST-001: the seed is fixed and recorded).
 */

import assert from 'node:assert/strict';

import * as schema from '../../../baseline/schema.js';
import { hazardId, timestampAest, userProfileId } from '../../../baseline/types.js';
import * as registry from '../../registry/contract.js';

/** @typedef {import('../../../baseline/types.js').ActiveProfile} ActiveProfile */
/** @typedef {import('../../../baseline/types.js').HazardId} HazardId */
/** @typedef {import('../../../baseline/types.js').ControlId} ControlId */
/** @typedef {import('../../../baseline/types.js').PlatformId} PlatformId */
/** @typedef {import('../../../baseline/types.js').ControlKind} ControlKind */
/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */
/** @typedef {import('../contract.js').Bowtie} Bowtie */
/** @typedef {import('../contract.js').BowtieNodeKind} BowtieNodeKind */

/** The one seed this suite's property tests use (CORE-TST-001); change it only on purpose, and record why. */
export const SEED = 0x424f5754;

/** C-004's kinds in `BowtieNodeKind`'s order, which is C-007's left-to-right order. */
export const NODE_KINDS = /** @type {readonly BowtieNodeKind[]} */ (Object.freeze([
  'causal-factor', 'preventative-control', 'hazard', 'mitigating-control', 'consequence',
]));

/** The three control states C-006 draws in words (registry C-021). */
export const STATES = Object.freeze(/** @type {const} */ (['confirmed', 'excluded', 'awaiting']));

/** C-009's elements, and the only ones. */
export const ALLOWED_ELEMENTS = Object.freeze(['svg', 'g', 'title', 'rect', 'text', 'tspan', 'line', 'polyline', 'path']);

export const SVG_NS = 'http://www.w3.org/2000/svg';

// ------------------------------------------------------------------ profiles and acts

/**
 * @param {string} name
 * @returns {ActiveProfile}
 */
export function newProfile(name) {
  return { id: userProfileId.fresh(), name };
}

/**
 * @param {ActiveProfile} profile
 * @param {PlatformId | null} [platform]
 * @returns {import('../../registry/contract.js').Act}
 */
export function actOf(profile, platform = null) {
  return { profile, madeForPlatformId: platform };
}

// ------------------------------------------------------------------ building a body through registry

/**
 * Threads one working body through `registry`'s changing operations, as `views` would carry it
 * (registry section 2). Every method replaces `body` with the one the operation resolved with
 * and returns the record it made.
 */
export class Builder {
  /** @param {DataBody} [body] */
  constructor(body = schema.emptyDataBody()) {
    /** @type {DataBody} */
    this.body = body;
    this.profile = newProfile('Assessor');
  }

  get act() {
    return actOf(this.profile);
  }

  /** @param {string} title */
  async hazard(title) {
    const r = await registry.createHazard(this.body, this.act, { title });
    this.body = r.body;
    return r.hazard.id;
  }

  /** @param {HazardId} id @param {string} title */
  async retitle(id, title) {
    this.body = (await registry.updateHazard(this.body, this.act, id, { title })).body;
  }

  /** @param {HazardId} id */
  async deleteHazard(id) {
    this.body = (await registry.deleteHazard(this.body, this.act, id)).body;
  }

  /** @param {HazardId} id */
  async retireHazard(id) {
    this.body = (await registry.retireHazard(this.body, this.act, id)).body;
  }

  /** @param {HazardId} h @param {string} text */
  async causalFactor(h, text) {
    const r = await registry.addCausalFactor(this.body, this.act, h, { text });
    this.body = r.body;
    return r.causalFactor.id;
  }

  /** @param {HazardId} h @param {string} text */
  async consequence(h, text) {
    const r = await registry.addConsequence(this.body, this.act, h, { text });
    this.body = r.body;
    return r.consequence.id;
  }

  /** @param {string} title */
  async control(title) {
    const r = await registry.createControl(this.body, this.act, { title });
    this.body = r.body;
    return r.control.id;
  }

  /** @param {ControlId} id */
  async retireControl(id) {
    this.body = (await registry.retireControl(this.body, this.act, id)).body;
  }

  /** @param {HazardId} hazard @param {ControlId} control @param {ControlKind} controlKind */
  async linkControl(hazard, control, controlKind) {
    this.body = (await registry.linkControlToHazard(this.body, this.act, { hazardId: hazard, controlId: control, controlKind })).body;
  }

  /** @param {string} name */
  async platform(name) {
    const r = await registry.createPlatform(this.body, this.act, { name, ownerProfileId: this.profile.id });
    this.body = r.body;
    return r.platform.id;
  }

  /** @param {PlatformId} id */
  async retirePlatform(id) {
    this.body = (await registry.retirePlatform(this.body, this.act, id)).body;
  }

  /** @param {HazardId} hazard @param {PlatformId} platform */
  async onPlatform(hazard, platform) {
    this.body = (await registry.linkHazardToPlatform(this.body, this.act, { hazardId: hazard, platformId: platform })).body;
  }

  /** @param {HazardId} hazard @param {PlatformId} platform @param {string} reportId */
  async reportId(hazard, platform, reportId) {
    this.body = (await registry.setPlatformReportId(this.body, this.act, {
      hazardId: hazard, platformId: platform, reportId: /** @type {any} */ (reportId),
    })).body;
  }

  /** @param {HazardId} hazard @param {ControlId} control @param {PlatformId} platform */
  async confirm(hazard, control, platform) {
    this.body = (await registry.confirmControlForPlatform(this.body, this.act, { hazardId: hazard, controlId: control, platformId: platform })).body;
  }

  /** @param {HazardId} hazard @param {ControlId} control @param {PlatformId} platform @param {string} text */
  async exclude(hazard, control, platform, text) {
    this.body = (await registry.excludeControlFromPlatform(this.body, this.act, { hazardId: hazard, controlId: control, platformId: platform, text })).body;
  }

  /** @param {HazardId} hazard @param {PlatformId} platform @param {'initial' | 'residual'} stage */
  async rate(hazard, platform, stage) {
    this.body = (await registry.setRating(this.body, this.act, {
      hazardId: hazard, platformId: platform, stage, consequence: /** @type {any} */ (3), likelihood: /** @type {any} */ ('C'),
    })).body;
  }
}

/**
 * The fixture most tests start from. Platform `alpha` holds hazard `h1` with two causal factors,
 * two consequences, and four controls in every state C-006 draws: `prevConfirmed`
 * (preventative, confirmed), `prevExcluded` (preventative, excluded), `mitAwaiting`
 * (mitigating, awaiting), and `mitRetired` (mitigating, confirmed, then retired in the library,
 * so still on the platform by registry C-027). `h1`'s report id on `alpha` is set. `h2` is on
 * `alpha` too, with its own causal factor and `prevConfirmed` linked as mitigating and left
 * awaiting. On `beta`, `h1` has `prevConfirmed` excluded and `mitAwaiting` confirmed. `h3` is on
 * `beta` only. `h4` is live and on no platform. Ratings exist on both stages for `h1` on `alpha`.
 */
export async function standardFixture() {
  const b = new Builder();
  const alpha = await b.platform('Alpha Ship');
  const beta = await b.platform('Beta & Sons <Tug>');
  const h1 = await b.hazard('Loss of propulsion in restricted waters');
  const h2 = await b.hazard('Fire in the engine room');
  const h3 = await b.hazard('Grounding');
  const h4 = await b.hazard('Unlinked hazard');
  const cf1 = await b.causalFactor(h1, 'Fuel contamination');
  const cf2 = await b.causalFactor(h1, 'Governor failure "hunting" at low load');
  const cq1 = await b.consequence(h1, 'Collision with a berthed vessel');
  const cq2 = await b.consequence(h1, 'Grounding & hull breach');
  const h2cf = await b.causalFactor(h2, 'Oil leak onto a hot surface');
  await b.causalFactor(h3, 'Chart error');
  const prevConfirmed = await b.control('Fuel polishing before bunkering');
  const prevExcluded = await b.control('Redundant governor');
  const mitAwaiting = await b.control('Emergency anchoring procedure');
  const mitRetired = await b.control('Tug on standby');
  await b.linkControl(h1, prevConfirmed, 'preventative');
  await b.linkControl(h1, prevExcluded, 'preventative');
  await b.linkControl(h1, mitAwaiting, 'mitigating');
  await b.linkControl(h1, mitRetired, 'mitigating');
  await b.linkControl(h2, prevConfirmed, 'mitigating');
  await b.onPlatform(h1, alpha);
  await b.onPlatform(h2, alpha);
  await b.onPlatform(h1, beta);
  await b.onPlatform(h3, beta);
  await b.reportId(h1, alpha, 'ALPHA 007');
  await b.confirm(h1, prevConfirmed, alpha);
  await b.exclude(h1, prevExcluded, alpha, 'Single-engine vessel; no second governor fitted');
  await b.confirm(h1, mitRetired, alpha);
  await b.retireControl(mitRetired);
  await b.exclude(h1, prevConfirmed, beta, 'Beta bunkers polished fuel only');
  await b.confirm(h1, mitAwaiting, beta);
  await b.rate(h1, alpha, 'initial');
  await b.rate(h1, alpha, 'residual');
  return {
    builder: b, body: b.body, alpha, beta, h1, h2, h3, h4, cf1, cf2, cq1, cq2, h2cf, prevConfirmed, prevExcluded, mitAwaiting, mitRetired,
  };
}

// ------------------------------------------------------------------ the bow-tie C-001 reads from the registry

/**
 * What C-001 says `bowtieFor(body, hazard, platform)` resolves with, read from the registry's own
 * contract on the same body. Fails the test if the hazard is not a row of the platform's query.
 * @param {DataBody} body
 * @param {HazardId} hazard
 * @param {PlatformId} platform
 * @returns {Promise<Bowtie>}
 */
export async function expectedBowtie(body, hazard, platform) {
  const detail = await registry.getHazardDetail(body, hazard);
  assert.ok(detail, `fixture: registry has hazard ${hazard}`);
  const query = await registry.listPlatformHazards(body, platform);
  const row = query.rows.find((r) => r.hazard.id === hazard);
  assert.ok(row, `fixture: hazard ${hazard} is a row of the platform's query`);
  return {
    platform: query.platform,
    hazard: row.hazard,
    reportId: row.reportId,
    causalFactors: detail.causalFactors,
    consequences: detail.consequences,
    preventativeControls: row.controls.filter((c) => c.controlKind === 'preventative'),
    mitigatingControls: row.controls.filter((c) => c.controlKind === 'mitigating'),
  };
}

/**
 * C-001 exactly: every field deep-equal, same elements, same order.
 * @param {Bowtie} actual
 * @param {Bowtie} expected
 * @param {string} [where]
 */
export function assertSameBowtie(actual, expected, where = '') {
  const at = where ? ` (${where})` : '';
  assert.deepStrictEqual(plain(actual.platform), plain(expected.platform), `C-001: platform is the query's platform${at}`);
  assert.deepStrictEqual(plain(actual.hazard), plain(expected.hazard), `C-001: hazard is the row's hazard${at}`);
  assert.equal(actual.reportId, expected.reportId, `C-001: reportId is the row's reportId${at}`);
  assert.deepStrictEqual(plain(actual.causalFactors), plain(expected.causalFactors), `C-001: causal factors are getHazardDetail's, in order${at}`);
  assert.deepStrictEqual(plain(actual.consequences), plain(expected.consequences), `C-001: consequences are getHazardDetail's, in order${at}`);
  assert.deepStrictEqual(plain(actual.preventativeControls), plain(expected.preventativeControls), `C-001: preventative controls are the row's, in order${at}`);
  assert.deepStrictEqual(plain(actual.mitigatingControls), plain(expected.mitigatingControls), `C-001: mitigating controls are the row's, in order${at}`);
  assert.deepStrictEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `C-001: nothing is added to the bow-tie${at}`);
}

/**
 * A value as plain JSON-shaped data, so a frozen array compares equal to an unfrozen one.
 * @param {unknown} value
 * @returns {unknown}
 */
export function plain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

// ------------------------------------------------------------------ reading a document (C-009)

/**
 * @typedef {object} SvgElement
 * @property {string} name
 * @property {Record<string, string>} attrs decoded values
 * @property {Array<SvgElement | string>} children decoded text, and elements
 * @property {SvgElement | null} parent
 */

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_.:-]*/;
const ENTITIES = /** @type {Record<string, string>} */ ({ amp: '&', lt: '<', gt: '>', quot: '"' });

/**
 * Decode raw text or an attribute value, refusing any entity reference but C-009's four.
 * @param {string} raw
 * @param {string} where
 * @returns {string}
 */
function decode(raw, where) {
  return raw.replace(/&([^;]*);?/g, (match, name) => {
    if (!match.endsWith(';') || !(name in ENTITIES)) {
      throw new assert.AssertionError({ message: `C-009: only &amp; &lt; &gt; &quot; may be referenced; found ${JSON.stringify(match.slice(0, 12))} in ${where}` });
    }
    return ENTITIES[name];
  });
}

/**
 * Parse a document in C-009's syntax: one element beginning at the first character and ending at
 * the last; attribute values double-quoted; no declaration, doctype, comment, CDATA section, or
 * processing instruction; no entity but the four. Fails the test on anything else.
 * @param {string} text
 * @returns {SvgElement}
 */
export function parseSvg(text) {
  assert.equal(typeof text, 'string', 'C-009: the document is a string');
  assert.ok(text.startsWith('<svg'), `C-009: the text begins with <svg; it begins ${JSON.stringify(text.slice(0, 20))}`);
  let i = 0;
  const fail = (/** @type {string} */ what) => {
    throw new assert.AssertionError({ message: `C-009: not well-formed at offset ${i}: ${what}; near ${JSON.stringify(text.slice(Math.max(0, i - 20), i + 20))}` });
  };
  const ws = () => { while (i < text.length && /[ \t\n\r]/.test(text[i])) i += 1; };

  /** @param {SvgElement | null} parent @returns {SvgElement} */
  const element = (parent) => {
    if (text[i] !== '<') fail('expected <');
    i += 1;
    const m = NAME_RE.exec(text.slice(i));
    if (!m) fail('expected an element name');
    const name = /** @type {RegExpExecArray} */ (m)[0];
    i += name.length;
    /** @type {SvgElement} */
    const el = { name, attrs: {}, children: [], parent };
    for (;;) {
      const before = i;
      ws();
      if (text.startsWith('/>', i)) { i += 2; return el; }
      if (text[i] === '>') { i += 1; break; }
      if (i === before) fail('expected whitespace before an attribute');
      const a = NAME_RE.exec(text.slice(i));
      if (!a) fail('expected an attribute name');
      const attr = /** @type {RegExpExecArray} */ (a)[0];
      i += attr.length;
      ws();
      if (text[i] !== '=') fail(`expected = after ${attr}`);
      i += 1;
      ws();
      if (text[i] !== '"') fail(`attribute ${attr} is not double-quoted`);
      const end = text.indexOf('"', i + 1);
      if (end < 0) fail('unterminated attribute value');
      const raw = text.slice(i + 1, end);
      if (raw.includes('<')) fail(`attribute ${attr} holds a raw <`);
      if (Object.prototype.hasOwnProperty.call(el.attrs, attr)) fail(`attribute ${attr} is repeated`);
      el.attrs[attr] = decode(raw, `attribute ${attr} of <${name}>`);
      i = end + 1;
    }
    for (;;) {
      const lt = text.indexOf('<', i);
      if (lt < 0) fail(`<${name}> is not closed`);
      if (lt > i) el.children.push(decode(text.slice(i, lt), `the text of <${name}>`));
      i = lt;
      if (text.startsWith('</', i)) {
        i += 2;
        if (!text.startsWith(name, i)) fail(`expected </${name}>`);
        i += name.length;
        ws();
        if (text[i] !== '>') fail(`expected > closing </${name}`);
        i += 1;
        return el;
      }
      if (text.startsWith('<!', i) || text.startsWith('<?', i)) fail('a comment, CDATA section, doctype, or processing instruction');
      el.children.push(element(el));
    }
  };

  const root = element(null);
  if (i !== text.length) fail('content after the root element');
  return root;
}

/**
 * Every element of the tree in document order, the root first.
 * @param {SvgElement} root
 * @returns {SvgElement[]}
 */
export function allElements(root) {
  /** @type {SvgElement[]} */
  const out = [root];
  for (const c of root.children) if (typeof c !== 'string') out.push(...allElements(c));
  return out;
}

/**
 * @param {SvgElement} el
 * @returns {SvgElement[]}
 */
export function childElements(el) {
  return /** @type {SvgElement[]} */ (el.children.filter((c) => typeof c !== 'string'));
}

/**
 * All text below an element, each text run in document order, joined as given.
 * @param {SvgElement} el
 * @returns {string[]}
 */
export function textRuns(el) {
  return el.children.flatMap((c) => (typeof c === 'string' ? [c] : textRuns(c)));
}

/**
 * @param {string} s
 * @returns {string} trimmed, every run of whitespace one space (C-005)
 */
export function normalise(s) {
  return s.trim().replace(/\s+/g, ' ');
}

/**
 * The nodes of a document (C-004): every `<g>` carrying `data-bowtie-node`.
 * @param {SvgElement} root
 */
export function nodesOf(root) {
  return allElements(root).filter((e) => e.name === 'g' && Object.prototype.hasOwnProperty.call(e.attrs, 'data-bowtie-node'));
}

/**
 * A node's visible lines: the text of each `<tspan>` child of its one `<text>` child (C-005).
 * @param {SvgElement} node
 * @returns {string[]}
 */
export function linesOf(node) {
  const texts = childElements(node).filter((e) => e.name === 'text');
  assert.equal(texts.length, 1, `C-005: node ${node.attrs['data-record-id']} has exactly one child <text>`);
  return childElements(texts[0]).filter((e) => e.name === 'tspan').map((t) => textRuns(t).join(''));
}

// ------------------------------------------------------------------ the clauses over a document

/**
 * The `(kind, record id, state)` triples C-004 says a document holds for `w`, sorted.
 * @param {Bowtie} w
 * @returns {string[]}
 */
export function expectedTriples(w) {
  /** @type {string[]} */
  const out = [JSON.stringify(['hazard', w.hazard.id, null])];
  for (const c of w.causalFactors) out.push(JSON.stringify(['causal-factor', c.id, null]));
  for (const c of w.consequences) out.push(JSON.stringify(['consequence', c.id, null]));
  for (const c of w.preventativeControls) out.push(JSON.stringify(['preventative-control', c.control.id, c.state]));
  for (const c of w.mitigatingControls) out.push(JSON.stringify(['mitigating-control', c.control.id, c.state]));
  return out.sort();
}

/**
 * The triples a document actually holds, one per node, sorted.
 * @param {SvgElement} root
 * @returns {string[]}
 */
export function actualTriples(root) {
  return nodesOf(root).map((n) => JSON.stringify([
    n.attrs['data-bowtie-node'], n.attrs['data-record-id'] ?? null, n.attrs['data-control-state'] ?? null,
  ])).sort();
}

/**
 * C-004: one node per thing, marked with what it is, none inside another, and no other element
 * marked; the triples equal the ones the bow-tie holds (the registry's, by C-001).
 * @param {SvgElement} root
 * @param {Bowtie} w
 */
export function assertC004(root, w) {
  for (const e of allElements(root)) {
    if (Object.prototype.hasOwnProperty.call(e.attrs, 'data-bowtie-node')) {
      assert.equal(e.name, 'g', `C-004: only a <g> carries data-bowtie-node; a <${e.name}> does`);
    }
  }
  for (const n of nodesOf(root)) {
    for (let p = n.parent; p; p = p.parent) {
      assert.ok(!Object.prototype.hasOwnProperty.call(p.attrs, 'data-bowtie-node'), `C-004: node ${n.attrs['data-record-id']} is inside another node`);
    }
  }
  assert.deepStrictEqual(actualTriples(root), expectedTriples(w), 'C-004: the nodes are exactly the bow-tie\'s things, each once, with each control\'s state');
}

/**
 * Every node of `root` with the element of `w` it draws, by kind and record id.
 * @param {SvgElement} root
 * @param {Bowtie} w
 * @returns {Array<{ node: SvgElement, kind: BowtieNodeKind, stored: string, state: string | null, index: number }>}
 */
export function nodeTable(root, w) {
  const nodes = nodesOf(root);
  /** @param {string} kind @param {string} id */
  const find = (kind, id) => {
    const n = nodes.find((x) => x.attrs['data-bowtie-node'] === kind && x.attrs['data-record-id'] === id);
    assert.ok(n, `C-004: a ${kind} node for ${id}`);
    return /** @type {SvgElement} */ (n);
  };
  return [
    ...w.causalFactors.map((c, index) => ({ node: find('causal-factor', c.id), kind: /** @type {const} */ ('causal-factor'), stored: c.text, state: null, index })),
    ...w.preventativeControls.map((c, index) => ({ node: find('preventative-control', c.control.id), kind: /** @type {const} */ ('preventative-control'), stored: c.control.title, state: c.state, index })),
    { node: find('hazard', w.hazard.id), kind: /** @type {const} */ ('hazard'), stored: w.hazard.title, state: null, index: 0 },
    ...w.mitigatingControls.map((c, index) => ({ node: find('mitigating-control', c.control.id), kind: /** @type {const} */ ('mitigating-control'), stored: c.control.title, state: c.state, index })),
    ...w.consequences.map((c, index) => ({ node: find('consequence', c.id), kind: /** @type {const} */ ('consequence'), stored: c.text, state: null, index })),
  ];
}

/**
 * C-005: each node's `<title>` is the stored text exactly; its lines, none empty, are the stored
 * text broken only at whitespace, the hazard's led by the report id and a control's followed by
 * its state line; one caption naming the platform and the report id; no other `<text>`.
 * Returns each control node's state line, for C-006.
 * @param {SvgElement} root
 * @param {Bowtie} w
 * @returns {Array<{ state: string, line: string }>}
 */
export function assertC005(root, w) {
  /** @type {Array<{ state: string, line: string }>} */
  const stateLines = [];
  for (const { node, kind, stored, state } of nodeTable(root, w)) {
    const id = node.attrs['data-record-id'];
    const titles = childElements(node).filter((e) => e.name === 'title');
    assert.equal(titles.length, 1, `C-005: ${kind} ${id} has exactly one child <title>`);
    assert.equal(textRuns(titles[0]).join(''), stored, `C-005: the <title> of ${kind} ${id} is the stored text exactly`);
    let lines = linesOf(node);
    for (const line of lines) assert.notEqual(line, '', `C-005: no line of ${kind} ${id} is empty`);
    if (kind === 'hazard') {
      assert.ok(lines.length >= 1, 'C-005: the hazard node has a first line');
      assert.equal(lines[0], w.reportId, 'C-005: the hazard node\'s first line is the report id exactly');
      lines = lines.slice(1);
    }
    if (state !== null) {
      assert.ok(lines.length >= 1, `C-006: control ${id} has a state line`);
      stateLines.push({ state, line: lines[lines.length - 1] });
      lines = lines.slice(0, -1);
    }
    assert.equal(lines.map((l) => l.trim()).join(' '), normalise(stored),
      `C-005: the lines of ${kind} ${id}, trimmed and joined with single spaces, are its stored text with whitespace runs made one space; nothing split, truncated, or added`);
  }
  const texts = allElements(root).filter((e) => e.name === 'text');
  const captions = texts.filter((e) => Object.prototype.hasOwnProperty.call(e.attrs, 'data-bowtie-caption'));
  assert.equal(captions.length, 1, 'C-005: exactly one <text> carries data-bowtie-caption');
  for (let p = captions[0].parent; p; p = p.parent) {
    assert.ok(!Object.prototype.hasOwnProperty.call(p.attrs, 'data-bowtie-node'), 'C-005: the caption is outside every node');
  }
  const caption = normalise(textRuns(captions[0]).join(' '));
  assert.ok(caption.includes(normalise(w.platform.name)), `C-005: the caption ${JSON.stringify(caption)} contains the platform's name ${JSON.stringify(w.platform.name)}`);
  assert.ok(caption.includes(w.reportId), `C-005: the caption ${JSON.stringify(caption)} contains the report id ${JSON.stringify(w.reportId)}`);
  assert.equal(texts.length, nodesOf(root).length + 1, 'C-005: there is no <text> but one per node and the caption');
  return stateLines;
}

/**
 * C-006 across any number of documents: every control in one state has one state line, and the
 * three states' lines are different and not empty. `seen` carries what earlier documents drew.
 * @param {Array<{ state: string, line: string }>} stateLines
 * @param {Map<string, string>} [seen]
 * @returns {Map<string, string>}
 */
export function assertC006(stateLines, seen = new Map()) {
  for (const { state, line } of stateLines) {
    assert.notEqual(line.trim(), '', `C-006: the state line for ${state} is not empty`);
    const before = seen.get(state);
    if (before === undefined) seen.set(state, line);
    else assert.equal(line, before, `C-006: every ${state} control has the same state line in every document`);
  }
  const lines = [...seen.values()];
  assert.equal(new Set(lines).size, lines.length, `C-006: the states' lines differ: ${JSON.stringify(Object.fromEntries(seen))}`);
  return seen;
}

/**
 * @param {string | undefined} s
 * @param {string} what
 * @returns {number}
 */
function numeric(s, what) {
  assert.ok(typeof s === 'string' && s !== '' && s.trim() === s && Number.isFinite(Number(s)), `C-007: ${what} is numeric, got ${JSON.stringify(s)}`);
  return Number(s);
}

/**
 * The root's `viewBox` size, as C-009 fixes it.
 * @param {SvgElement} root
 */
export function viewBoxOf(root) {
  const m = /^0 0 (\S+) (\S+)$/.exec(root.attrs.viewBox ?? '');
  assert.ok(m, `C-009: viewBox is "0 0 W H", got ${JSON.stringify(root.attrs.viewBox)}`);
  const [W, H] = [Number(/** @type {RegExpExecArray} */ (m)[1]), Number(/** @type {RegExpExecArray} */ (m)[2])];
  assert.ok(Number.isFinite(W) && W > 0 && Number.isFinite(H) && H > 0, `C-009: W and H are positive numbers, got ${root.attrs.viewBox}`);
  return { W, H };
}

/**
 * C-007: one `<rect>` per node, no `transform` anywhere, every box inside the `viewBox`, no two
 * boxes intersecting, the kinds strictly left to right, and each kind top to bottom in its
 * list's order.
 * @param {SvgElement} root
 * @param {Bowtie} w
 */
export function assertC007(root, w) {
  for (const e of allElements(root)) assert.ok(!Object.prototype.hasOwnProperty.call(e.attrs, 'transform'), `C-007: no element carries a transform; a <${e.name}> does`);
  const { W, H } = viewBoxOf(root);
  const boxes = nodeTable(root, w).map(({ node, kind, index }) => {
    const rects = childElements(node).filter((e) => e.name === 'rect');
    const id = node.attrs['data-record-id'];
    assert.equal(rects.length, 1, `C-007: ${kind} ${id} has exactly one child <rect>`);
    const r = rects[0].attrs;
    const x = numeric(r.x, `x of ${kind} ${id}`);
    const y = numeric(r.y, `y of ${kind} ${id}`);
    const width = numeric(r.width, `width of ${kind} ${id}`);
    const height = numeric(r.height, `height of ${kind} ${id}`);
    assert.ok(width > 0 && height > 0, `C-007: the box of ${kind} ${id} has positive width and height`);
    return { id, kind, index, left: x, right: x + width, top: y, bottom: y + height };
  });
  for (const b of boxes) {
    assert.ok(b.left >= 0 && b.top >= 0 && b.right <= W && b.bottom <= H, `C-007: the box of ${b.kind} ${b.id} lies inside the viewBox`);
  }
  for (const a of boxes) {
    for (const b of boxes) {
      if (a === b) continue;
      const intersect = a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom;
      assert.ok(!intersect, `C-007: the boxes of ${a.kind} ${a.id} and ${b.kind} ${b.id} do not intersect`);
      if (NODE_KINDS.indexOf(a.kind) < NODE_KINDS.indexOf(b.kind)) {
        assert.ok(a.right < b.left, `C-007: ${a.kind} ${a.id} lies wholly left of ${b.kind} ${b.id}`);
      }
      if (a.kind === b.kind && b.index === a.index + 1) {
        assert.ok(a.bottom < b.top, `C-007: ${a.kind} ${a.id} lies wholly above the next of its list, ${b.id}`);
      }
    }
  }
}

/**
 * C-008: every line, polyline, and path is an edge naming one causal-factor or consequence node,
 * each of those named by exactly one edge, and nothing else named.
 * @param {SvgElement} root
 * @param {Bowtie} w
 */
export function assertC008(root, w) {
  const edges = allElements(root).filter((e) => ['line', 'polyline', 'path'].includes(e.name));
  const named = edges.map((e) => {
    assert.ok(Object.prototype.hasOwnProperty.call(e.attrs, 'data-bowtie-edge'), `C-008: every <${e.name}> carries data-bowtie-edge`);
    return e.attrs['data-bowtie-edge'];
  }).sort();
  const expected = [...w.causalFactors.map((c) => c.id), ...w.consequences.map((c) => c.id)].sort();
  assert.deepStrictEqual(named, expected, 'C-008: the edges name each causal factor and consequence exactly once, and no control or hazard');
}

/**
 * C-009 beyond what `parseSvg` refuses: the root, its namespace and size, the element set, and the
 * attributes that could reach outside the document or run anything.
 * @param {SvgElement} root
 */
export function assertC009(root) {
  assert.equal(root.name, 'svg', 'C-009: the root is svg');
  assert.equal(root.attrs.xmlns, SVG_NS, 'C-009: the root carries the SVG namespace');
  const { W, H } = viewBoxOf(root);
  assert.equal(Number(root.attrs.width), W, 'C-009: width is W');
  assert.equal(Number(root.attrs.height), H, 'C-009: height is H');
  for (const e of allElements(root)) {
    assert.ok(ALLOWED_ELEMENTS.includes(e.name), `C-009: <${e.name}> is not one of the elements allowed`);
    for (const [name, value] of Object.entries(e.attrs)) {
      assert.ok(!['style', 'href', 'xlink:href', 'class'].includes(name) && !name.startsWith('on'), `C-009: <${e.name}> carries the forbidden attribute ${name}`);
      assert.ok(!value.includes('url('), `C-009: attribute ${name} of <${e.name}> contains url(`);
    }
  }
}

/**
 * Every clause over one document drawn from `w`. Returns the parsed tree and the state lines.
 * @param {string} svg
 * @param {Bowtie} w
 * @param {Map<string, string>} [seen] state lines of earlier documents, for C-006
 */
export function assertDocument(svg, w, seen) {
  const root = parseSvg(svg);
  assertC009(root);
  assertC004(root, w);
  const stateLines = assertC005(root, w);
  assertC006(stateLines, seen);
  assertC007(root, w);
  assertC008(root, w);
  return { root, stateLines };
}

// ------------------------------------------------------------------ hand-built bow-ties (renderBowtieSvg alone)

/** @type {import('../../../baseline/types.js').TimestampAest} */
export const STAMP = timestampAest('2026-09-15T10:30:00+10:00');

/**
 * A valid UUID drawn from the generator, so a run is reproducible.
 * @param {() => number} random
 * @returns {string}
 */
export function uuidFrom(random) {
  const hex = (/** @type {number} */ n) => Array.from({ length: n }, () => '0123456789abcdef'[pick(random, 16)]).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`;
}

/**
 * @param {() => number} random
 * @param {string} kind
 * @param {string} id
 * @param {Record<string, unknown>} fields
 */
function record(random, kind, id, fields) {
  const by = uuidFrom(random);
  return { id, kind, status: 'live', createdBy: by, createdAtAest: STAMP, updatedBy: by, updatedAtAest: STAMP, ...fields };
}

/**
 * A `Bowtie` as the registry's values would make one, built by hand from the generator: every
 * field C-011 checks is well formed, so `renderBowtieSvg` must accept it.
 * @param {() => number} random
 * @param {{ causalFactors?: number, consequences?: number, preventative?: number, mitigating?: number, text?: () => string }} [shape]
 * @returns {Bowtie}
 */
export function handBuiltBowtie(random, shape = {}) {
  const text = shape.text ?? (() => randomText(random));
  const hazard = record(random, 'hazard', hazardIdFrom(random), { title: text() });
  const platform = record(random, 'platform', uuidFrom(random), { name: randomName(random), ownerProfileId: uuidFrom(random) });
  const count = (/** @type {number | undefined} */ n) => n ?? pick(random, 5);
  /** @param {ControlKind} controlKind */
  const control = (controlKind) => {
    const state = STATES[pick(random, 3)];
    const c = record(random, 'control', uuidFrom(random), { title: text() });
    return {
      control: c,
      controlKind,
      state,
      confirmation: state === 'confirmed' ? { byProfileId: uuidFrom(random), atAest: STAMP } : null,
      justification: state === 'excluded' ? record(random, 'justification', uuidFrom(random), { hazardId: hazard.id, controlId: c.id, platformId: platform.id, text: 'a reason' }) : null,
    };
  };
  return /** @type {Bowtie} */ (/** @type {unknown} */ ({
    platform,
    hazard,
    reportId: pick(random, 2) === 0 ? hazard.id : randomName(random),
    causalFactors: Array.from({ length: count(shape.causalFactors) }, () => record(random, 'causal-factor', uuidFrom(random), { hazardId: hazard.id, text: text() })),
    consequences: Array.from({ length: count(shape.consequences) }, () => record(random, 'consequence', uuidFrom(random), { hazardId: hazard.id, text: text() })),
    preventativeControls: Array.from({ length: count(shape.preventative) }, () => control('preventative')),
    mitigatingControls: Array.from({ length: count(shape.mitigating) }, () => control('mitigating')),
  }));
}

/**
 * @param {() => number} random
 * @returns {string}
 */
function hazardIdFrom(random) {
  return hazardId.fromSequence(1 + pick(random, 20000));
}

/** Words a stored text is made of: XML's special characters, entity look-alikes, markup look-alikes, other scripts, and one long word. */
export const WORDS = Object.freeze([
  'loss', 'of', 'control', 'fire', 'in', 'engine', 'room', 'A&B', '<b>', 'x<y', 'y>x', '"quoted"', "it's", '&amp;', '&lt;', '&#60;',
  ']]>', '<!--', '-->', '<?xml', 'url(#a)', 'onload="x"', 'style=', '火災', 'Überlast', '🔥', 'a',
  'Supercalifragilisticexpialidociousandthensomemorelettersbeyondanylinewidthanyonewoulddrawatall',
]);

/** Whitespace between words: space, tab, and newline only, so what "whitespace" means is not in question. */
const GAPS = Object.freeze([' ', ' ', ' ', '  ', '\t', '\n', ' \n  ']);

/**
 * A stored text as a trimmed, non-empty user entry: one to forty words, with the whitespace
 * inside it left as typed.
 * @param {() => number} random
 * @returns {string}
 */
export function randomText(random) {
  const n = 1 + pick(random, pick(random, 4) === 0 ? 40 : 8);
  let s = WORDS[pick(random, WORDS.length)];
  for (let k = 1; k < n; k += 1) s += GAPS[pick(random, GAPS.length)] + WORDS[pick(random, WORDS.length)];
  return s;
}

/**
 * A platform name or report id: single-spaced words, no outer whitespace.
 * @param {() => number} random
 * @returns {string}
 */
export function randomName(random) {
  const pool = ['Alpha', 'Tug', '7', 'B&C', '<Ship>', '"Bravo"', '火災', 'HMAS-01'];
  return Array.from({ length: 1 + pick(random, 3) }, () => pool[pick(random, pool.length)]).join(' ');
}

// ------------------------------------------------------------------ the body is a value (C-003)

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function snapshot(value) {
  return structuredClone(value);
}

/**
 * Freeze a value and everything reachable from it, so a write throws instead of passing unseen.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/**
 * A body with one stored record replaced, for the malformed cases section 4 passes on from
 * the registry. Does not touch `body`.
 * @param {DataBody} body
 * @param {string} collection
 * @param {string} key
 * @param {(record: any) => unknown} change
 * @returns {DataBody}
 */
export function spoil(body, collection, key, change) {
  const out = snapshot(body);
  const c = /** @type {Record<string, any>} */ (out.collections[collection]);
  assert.ok(c && c[key], `fixture: ${collection} holds ${key}`);
  c[key] = change(c[key]);
  return out;
}

/**
 * The key of the one entry of `collection` that `match` picks.
 * @param {DataBody} body
 * @param {string} collection
 * @param {(record: any) => boolean} match
 * @returns {string}
 */
export function keyWhere(body, collection, match) {
  const keys = Object.entries(/** @type {Record<string, any>} */ (body.collections[collection] ?? {})).filter(([, r]) => match(r)).map(([k]) => k);
  assert.equal(keys.length, 1, `fixture: exactly one ${collection} entry matches`);
  return keys[0];
}

// ------------------------------------------------------------------ rejections

/**
 * The error a call rejects with; fails the test if it resolves.
 * @param {() => Promise<unknown>} call
 * @param {string} [what]
 * @returns {Promise<any>}
 */
export async function rejectionOf(call, what = 'the call') {
  /** @type {unknown} */
  let error = null;
  let rejected = false;
  await call().then(
    () => { throw new assert.AssertionError({ message: `${what} resolved; a rejection was expected` }); },
    (e) => { error = e; rejected = true; },
  );
  if (!rejected) throw new assert.AssertionError({ message: `${what} did not reject` });
  return error;
}

/**
 * Section 4's "that error unchanged": the same class, message, and carried fields as the
 * registry's own rejection on the same body.
 * @param {any} actual
 * @param {any} expected
 * @param {string} what
 */
export function assertSameError(actual, expected, what) {
  assert.ok(actual instanceof Error, `${what}: rejects with an Error, got ${String(actual)}`);
  assert.equal(actual.constructor, expected.constructor, `${what}: rejects with registry's ${expected.name}, got ${actual.name}: ${actual.message}`);
  assert.equal(actual.message, expected.message, `${what}: the error is registry's, unchanged`);
  assert.deepStrictEqual(plain({ ...actual }), plain({ ...expected }), `${what}: the error carries what registry's carries`);
}

// ------------------------------------------------------------------ ambient reads (C-003)

/**
 * Run `fn` with the browser's storage, a document, and the clock replaced by spies that record
 * every use: `localStorage`, `sessionStorage`, and `document` as proxies that record any
 * property read, and `Date` recording `Date.now()` and `new Date()` with no argument, which is
 * what reading the clock is. Everything is restored after.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<{ result: T, uses: string[] }>}
 */
export async function withAmbientSpies(fn) {
  /** @type {string[]} */
  const uses = [];
  /** @param {string} which */
  const spy = (which) => new Proxy({}, {
    get: (_t, prop) => { uses.push(`${which}.${String(prop)}`); return () => null; },
    set: (_t, prop) => { uses.push(`${which}.${String(prop)}=`); return true; },
    has: (_t, prop) => { uses.push(`${which} has ${String(prop)}`); return false; },
  });
  const RealDate = globalThis.Date;
  const SpyDate = new Proxy(RealDate, {
    construct: (target, args) => {
      if (args.length === 0) uses.push('new Date()');
      return Reflect.construct(target, args);
    },
    apply: () => { uses.push('Date()'); return RealDate(); },
    get: (target, prop) => {
      if (prop === 'now') return () => { uses.push('Date.now()'); return RealDate.now(); };
      return Reflect.get(target, prop);
    },
  });
  const names = ['localStorage', 'sessionStorage', 'document'];
  const saved = Object.fromEntries(names.map((n) => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
  const g = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (globalThis));
  for (const n of names) Object.defineProperty(globalThis, n, { value: spy(n), configurable: true, writable: true });
  globalThis.Date = /** @type {DateConstructor} */ (SpyDate);
  try {
    const result = await fn();
    return { result, uses };
  } finally {
    globalThis.Date = RealDate;
    for (const n of names) {
      const d = saved[n];
      if (d) Object.defineProperty(globalThis, n, d);
      else delete g[n];
    }
  }
}

// ------------------------------------------------------------------ seeded randomness (CORE-TST-001)

/**
 * mulberry32: small, deterministic, good enough to pick cases with.
 * @param {number} seed
 * @returns {() => number} uniform in [0, 1)
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
 * @param {() => number} random
 * @param {number} maxExclusive
 * @returns {number}
 */
export function pick(random, maxExclusive) {
  return Math.floor(random() * maxExclusive);
}

export { registry, schema };
