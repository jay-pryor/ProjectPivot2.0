/**
 * bowtie conformance: errors (CORE-CON-002). Every condition in section 4 of
 * modules/bowtie/CONTRACT.md: `bowtieFor` passing on `registry`'s rejection unchanged, compared
 * with the registry's own on the same body; the three `registry` classes it signals itself;
 * `HazardOmittedError` carrying what the registry named; section 4's precedence when two
 * conditions hold at once; the body deep-equal to what it was afterwards (C-003); and C-011's
 * refusals of a value that is not a `Bowtie`, naming the first failing field. Written from the
 * contract before any implementation (P8).
 *
 * The null double must fail this file (CORE-TST-002, rung 1): an implementation that enforces
 * nothing resolves where every test below expects a rejection.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as bowtie from '../contract.js';
import { HazardOmittedError, InvalidBowtieError } from '../contract.js';
import { platformId } from '../../../baseline/types.js';
import {
  Builder, assertSameError, expectedBowtie, keyWhere, plain, rejectionOf, registry, snapshot, spoil, standardFixture,
} from './harness.js';

const platformIdFresh = () => platformId.fresh();

/**
 * `bowtieFor` rejects, and the body passed in is deep-equal to what it was (C-003).
 * @param {import('../../../baseline/schema.js').DataBody} body
 * @param {string} hazard
 * @param {string} platform
 * @param {string} what
 */
async function refusal(body, hazard, platform, what) {
  const before = snapshot(body);
  const e = await rejectionOf(() => bowtie.bowtieFor(body, /** @type {any} */ (hazard), /** @type {any} */ (platform)), what);
  assert.deepStrictEqual(body, before, `${what}: the body is unchanged (C-003)`);
  return e;
}

// ------------------------------------------------------------------ bowtieFor: listPlatformHazards rejects

test('bowtieFor on a platform no platform in the body has rejects with registry\'s UnknownPlatformError, unchanged; body unchanged (section 4 row 1, C-002)', async () => {
  const f = await standardFixture();
  const unknown = platformIdFresh();
  const expected = await rejectionOf(() => registry.listPlatformHazards(f.body, unknown), 'fixture: registry.listPlatformHazards');
  assert.ok(expected instanceof registry.UnknownPlatformError, 'fixture: the registry names the platform unknown');
  for (const hazard of [f.h1, f.h3, f.h4]) {
    assertSameError(await refusal(f.body, hazard, unknown, `hazard ${hazard} on an unknown platform`), expected, `hazard ${hazard} on an unknown platform`);
  }
  const empty = new Builder().body;
  const onEmpty = await rejectionOf(() => registry.listPlatformHazards(empty, unknown));
  assertSameError(await refusal(empty, 'H-0001', unknown, 'an empty body'), onEmpty, 'an empty body');
});

test('bowtieFor when the hazard, its hazard-platform link, or the platform record is malformed rejects with the error registry.listPlatformHazards gives, unchanged; body unchanged (section 4 row 1, C-002)', async () => {
  const f = await standardFixture();
  const linkKey = keyWhere(f.body, 'link', (l) => l.linkKind === 'hazard-platform' && l.hazardId === f.h1 && l.platformId === f.alpha);
  const cases = [
    ['a malformed hazard', spoil(f.body, 'hazard', f.h1, (h) => ({ ...h, status: 'not-a-status' }))],
    ['a malformed link', spoil(f.body, 'link', linkKey, (l) => ({ ...l, linkKind: 'not-a-link-kind' }))],
    ['a malformed platform', spoil(f.body, 'platform', f.alpha, (p) => ({ ...p, name: 7 }))],
  ];
  for (const [what, body] of /** @type {Array<[string, any]>} */ (cases)) {
    const expected = await rejectionOf(() => registry.listPlatformHazards(body, f.alpha), `fixture: registry.listPlatformHazards with ${what}`);
    assert.ok(expected instanceof registry.MalformedRecordError, `fixture: registry refuses ${what} with a Malformed*Error, got ${String(expected)}`);
    assertSameError(await refusal(body, f.h1, f.alpha, what), expected, what);
  }
});

// ------------------------------------------------------------------ bowtieFor: getHazardDetail rejects

test('bowtieFor when a causal factor, consequence, or control of the hazard is malformed rejects with the error registry.getHazardDetail gives, unchanged; body unchanged (section 4 row 2, C-002)', async () => {
  const f = await standardFixture();
  const cases = [
    ['a malformed causal factor', spoil(f.body, 'causal-factor', f.cf2, (c) => ({ ...c, text: 7 }))],
    ['a malformed consequence', spoil(f.body, 'consequence', f.cq1, (c) => ({ ...c, text: 7 }))],
    ['a malformed control', spoil(f.body, 'control', f.prevExcluded, (c) => ({ ...c, title: 7 }))],
  ];
  for (const [what, body] of /** @type {Array<[string, any]>} */ (cases)) {
    const expected = await rejectionOf(() => registry.getHazardDetail(body, f.h1), `fixture: registry.getHazardDetail with ${what}`);
    assert.ok(expected instanceof registry.MalformedRecordError, `fixture: registry refuses ${what} with a Malformed*Error, got ${String(expected)}`);
    await registry.listPlatformHazards(body, f.alpha).catch((e) => assert.fail(`fixture: registry.listPlatformHazards resolves with ${what}, got ${String(e)}`));
    const e = await refusal(body, f.h1, f.alpha, what);
    assertSameError(e, expected, what);
    assert.ok(!(e instanceof HazardOmittedError), `${what}: row 2 comes before the omission of row 6`);
  }
});

test('precedence: a platform no platform has is signalled before a malformed record of the hazard, an unknown hazard, or a hazard not live or not on the platform (section 4)', async () => {
  const f = await standardFixture();
  const unknown = platformIdFresh();
  const expected = await rejectionOf(() => registry.listPlatformHazards(f.body, unknown));
  const bodies = [
    ['a malformed causal factor', spoil(f.body, 'causal-factor', f.cf1, (c) => ({ ...c, text: 7 })), f.h1],
    ['an unknown hazard', f.body, 'H-9999'],
    ['a hazard not on any platform', f.body, f.h4],
  ];
  for (const [what, body, hazard] of /** @type {Array<[string, any, string]>} */ (bodies)) {
    const e = await refusal(body, hazard, unknown, what);
    assert.ok(e instanceof registry.UnknownPlatformError, `${what} and an unknown platform: UnknownPlatformError first, got ${String(e)}`);
    assert.equal(e.message, expected.message);
  }
});

// ------------------------------------------------------------------ bowtieFor: the conditions it signals with registry's classes

test('bowtieFor of a hazard id no hazard has rejects with registry\'s UnknownHazardError carrying the id; body unchanged (section 4 row 3)', async () => {
  const f = await standardFixture();
  for (const id of ['H-9999', 'H-0000', 'not a hazard id']) {
    const e = await refusal(f.body, id, f.alpha, `hazard ${id}`);
    assert.ok(e instanceof registry.UnknownHazardError, `hazard ${id}: UnknownHazardError, got ${String(e)}`);
    assert.equal(e.id, id, 'the error carries the id');
  }
  const b = new Builder();
  const p = await b.platform('Only platform');
  const e = await refusal(b.body, 'H-0001', p, 'a body with no hazards');
  assert.ok(e instanceof registry.UnknownHazardError, `a body with no hazard collection: UnknownHazardError, got ${String(e)}`);
});

test('bowtieFor of a deleted hazard, still linked to the platform, rejects with registry\'s HazardNotLiveError carrying the status; body unchanged (section 4 row 4)', async () => {
  const f = await standardFixture();
  await f.builder.deleteHazard(f.h2);
  const e = await refusal(f.builder.body, f.h2, f.alpha, 'a deleted hazard');
  assert.ok(e instanceof registry.HazardNotLiveError, `HazardNotLiveError, got ${String(e)}`);
  assert.equal(e.status, 'deleted');
  assert.equal(e.id, f.h2);
});

test('bowtieFor of a retired hazard rejects with HazardNotLiveError carrying retired, before HazardNotOnPlatformError (section 4 rows 4 and 5, precedence)', async () => {
  const f = await standardFixture();
  await f.builder.retireHazard(f.h4);
  const e = await refusal(f.builder.body, f.h4, f.alpha, 'a retired hazard on no platform');
  assert.ok(e instanceof registry.HazardNotLiveError, `HazardNotLiveError first, got ${String(e)}`);
  assert.equal(e.status, 'retired');
});

test('bowtieFor of a live hazard with no live hazard-platform link to the platform rejects with registry\'s HazardNotOnPlatformError; body unchanged (section 4 row 5)', async () => {
  const f = await standardFixture();
  for (const [hazard, what] of [[f.h3, 'a hazard on another platform only'], [f.h4, 'a hazard on no platform'], [f.h2, 'a hazard on alpha, asked for beta']]) {
    const platform = hazard === f.h2 ? f.beta : f.alpha;
    const e = await refusal(f.body, hazard, platform, what);
    assert.ok(e instanceof registry.HazardNotOnPlatformError, `${what}: HazardNotOnPlatformError, got ${String(e)}`);
    assert.equal(e.hazardId, hazard);
    assert.equal(e.platformId, platform);
  }
});

// ------------------------------------------------------------------ bowtieFor: omitted (C-002)

test('C-002: a hazard registry names as omitted, for a malformed residual rating or a malformed justification, rejects with HazardOmittedError carrying the hazard id, reason, key, and detail registry gave; never a bow-tie without the record; body unchanged (section 4 row 6)', async () => {
  const f = await standardFixture();
  const ratingKey = keyWhere(f.body, 'rating', (r) => r.hazardId === f.h1 && r.platformId === f.alpha && r.stage === 'residual' && r.status === 'live');
  const justificationKey = keyWhere(f.body, 'justification', (j) => j.hazardId === f.h1 && j.controlId === f.prevExcluded && j.platformId === f.alpha && j.status === 'live');
  const cases = [
    ['a malformed residual rating', spoil(f.body, 'rating', ratingKey, (r) => ({ ...r, consequence: 'one' }))],
    ['a malformed justification', spoil(f.body, 'justification', justificationKey, (j) => ({ ...j, text: 7 }))],
  ];
  for (const [what, body] of /** @type {Array<[string, any]>} */ (cases)) {
    const query = await registry.listPlatformHazards(body, f.alpha);
    const omitted = query.omitted.find((o) => o.id === f.h1);
    assert.ok(omitted, `fixture: registry names h1 as omitted with ${what}`);
    await registry.getHazardDetail(body, f.h1);
    const e = await refusal(body, f.h1, f.alpha, what);
    assert.ok(e instanceof HazardOmittedError, `${what}: HazardOmittedError, got ${String(e)}`);
    assert.equal(e.hazardId, f.h1, `${what}: carries the hazard id`);
    assert.equal(e.reason, omitted.reason, `${what}: carries registry's reason`);
    assert.equal(e.key, omitted.key, `${what}: carries registry's key`);
    assert.equal(e.detail, omitted.detail, `${what}: carries registry's detail`);
  }
});

// ------------------------------------------------------------------ renderBowtieSvg: C-011

/** @returns {Promise<any>} a valid bow-tie, as bowtieFor gives it, as a mutable copy */
async function validCopy() {
  const f = await standardFixture();
  return structuredClone(plain(await expectedBowtie(f.body, f.h1, f.alpha)));
}

/**
 * `renderBowtieSvg` refuses `value` with `InvalidBowtieError` naming `field`: the field itself, or
 * an entry of a list as `list[i]` and what follows it.
 * @param {unknown} value
 * @param {string | null} field null when the value is not an object and no field can be named
 * @param {string} what
 */
async function refused(value, field, what) {
  const e = await rejectionOf(() => bowtie.renderBowtieSvg(/** @type {any} */ (value)), what);
  assert.ok(e instanceof InvalidBowtieError, `${what}: InvalidBowtieError, got ${String(e)}`);
  if (field !== null) {
    assert.equal(typeof e.field, 'string', `${what}: the error names a field`);
    if (field.endsWith(']')) {
      assert.ok(e.field.startsWith(field), `${what}: names ${field}, got ${e.field}`);
    } else {
      assert.equal(e.field.split(/[.[]/)[0], field, `${what}: names ${field}, got ${e.field}`);
    }
  }
  return e;
}

test('C-011: renderBowtieSvg of a value that is not an object rejects with InvalidBowtieError', async () => {
  for (const value of [undefined, null, 'a bow-tie', 42, true]) await refused(value, null, `value ${String(value)}`);
});

test('C-011: renderBowtieSvg refuses a hazard with no string id or string title, a platform with no string name, and a report id that is not a non-empty string, naming the field', async () => {
  const cases = /** @type {Array<[string, (w: any) => void, string]>} */ ([
    ['no hazard', (w) => { delete w.hazard; }, 'hazard'],
    ['a hazard that is not an object', (w) => { w.hazard = 'H-0001'; }, 'hazard'],
    ['a hazard id that is a number', (w) => { w.hazard.id = 1; }, 'hazard'],
    ['a hazard with no title', (w) => { delete w.hazard.title; }, 'hazard'],
    ['a hazard title that is null', (w) => { w.hazard.title = null; }, 'hazard'],
    ['no platform', (w) => { delete w.platform; }, 'platform'],
    ['a platform name that is a number', (w) => { w.platform.name = 7; }, 'platform'],
    ['an empty report id', (w) => { w.reportId = ''; }, 'reportId'],
    ['a report id that is a number', (w) => { w.reportId = 7; }, 'reportId'],
    ['no report id', (w) => { delete w.reportId; }, 'reportId'],
  ]);
  for (const [what, change, field] of cases) {
    const w = await validCopy();
    change(w);
    await refused(w, field, what);
  }
});

test('C-011: renderBowtieSvg refuses a list that is not an array, naming the list', async () => {
  for (const list of ['causalFactors', 'consequences', 'preventativeControls', 'mitigatingControls']) {
    for (const bad of [undefined, null, {}, 'x']) {
      const w = await validCopy();
      w[list] = bad;
      await refused(w, list, `${list} as ${JSON.stringify(bad)}`);
    }
  }
});

test('C-011: renderBowtieSvg refuses a causal factor or consequence with no string id or string text, naming the entry by its index', async () => {
  for (const list of ['causalFactors', 'consequences']) {
    const cases = /** @type {Array<[string, (e: any) => any]>} */ ([
      ['no id', (e) => { delete e.id; return e; }],
      ['a numeric id', (e) => ({ ...e, id: 3 })],
      ['no text', (e) => { delete e.text; return e; }],
      ['a text that is null', (e) => ({ ...e, text: null })],
      ['an entry that is a string', () => 'text'],
    ]);
    for (const [what, change] of cases) {
      const w = await validCopy();
      w[list][1] = change(w[list][1]);
      await refused(w, `${list}[1]`, `${list}[1] with ${what}`);
    }
  }
});

test('C-011: renderBowtieSvg refuses a control entry with no control of string id and title, a state outside the three, or the other list\'s controlKind, naming the entry by its index', async () => {
  const f = await standardFixture();
  const valid = plain(await expectedBowtie(f.body, f.h1, f.alpha));
  const cases = /** @type {Array<[string, 'preventativeControls' | 'mitigatingControls', number, (e: any) => any]>} */ ([
    ['no control', 'preventativeControls', 1, (e) => { delete e.control; return e; }],
    ['a control id that is a number', 'preventativeControls', 0, (e) => ({ ...e, control: { ...e.control, id: 5 } })],
    ['a control with no title', 'mitigatingControls', 1, (e) => { delete e.control.title; return e; }],
    ['state linked', 'mitigatingControls', 0, (e) => ({ ...e, state: 'linked' })],
    ['no state', 'preventativeControls', 0, (e) => { delete e.state; return e; }],
    ['state Confirmed', 'preventativeControls', 1, (e) => ({ ...e, state: 'Confirmed' })],
    ['a mitigating control in the preventative list', 'preventativeControls', 1, (e) => ({ ...e, controlKind: 'mitigating' })],
    ['a preventative control in the mitigating list', 'mitigatingControls', 1, (e) => ({ ...e, controlKind: 'preventative' })],
    ['no controlKind', 'mitigatingControls', 0, (e) => { delete e.controlKind; return e; }],
  ]);
  for (const [what, list, index, change] of cases) {
    const w = structuredClone(valid);
    assert.ok(w[list].length > index, 'fixture: the list has the entry');
    w[list][index] = change(w[list][index]);
    await refused(w, `${list}[${index}]`, what);
  }
});

test('C-011: renderBowtieSvg refuses two entries of one list sharing an id, naming the list', async () => {
  const f = await standardFixture();
  const valid = plain(await expectedBowtie(f.body, f.h1, f.alpha));
  const cases = /** @type {Array<[string, (w: any) => void]>} */ ([
    ['causalFactors', (w) => { w.causalFactors[1] = { ...w.causalFactors[1], id: w.causalFactors[0].id }; }],
    ['consequences', (w) => { w.consequences.push(structuredClone(w.consequences[0])); }],
    ['preventativeControls', (w) => { w.preventativeControls[1].control.id = w.preventativeControls[0].control.id; }],
    ['mitigatingControls', (w) => { w.mitigatingControls.push(structuredClone(w.mitigatingControls[0])); }],
  ]);
  for (const [list, change] of cases) {
    const w = structuredClone(valid);
    change(w);
    await refused(w, list, `two entries of ${list} sharing an id`);
  }
});

test('C-011 precedence: the first failing field is named in the order hazard, platform, reportId, causalFactors, consequences, preventativeControls, mitigatingControls, and within a list the lowest index', async () => {
  const f = await standardFixture();
  const valid = plain(await expectedBowtie(f.body, f.h1, f.alpha));
  const cases = /** @type {Array<[string, (w: any) => void, string]>} */ ([
    ['every field bad', (w) => { w.hazard.title = 1; w.platform.name = 1; w.reportId = ''; w.causalFactors = null; w.consequences = null; w.preventativeControls = null; w.mitigatingControls = null; }, 'hazard'],
    ['platform and later fields bad', (w) => { w.platform.name = 1; w.reportId = ''; w.mitigatingControls = null; }, 'platform'],
    ['reportId and a causal factor bad', (w) => { w.reportId = 9; w.causalFactors[0].text = 1; }, 'reportId'],
    ['a causal factor and a consequence bad', (w) => { w.consequences[0].text = 1; w.causalFactors[1].text = 1; }, 'causalFactors[1]'],
    ['a consequence and a preventative control bad', (w) => { w.preventativeControls[0].state = 'x'; w.consequences[1].id = 1; }, 'consequences[1]'],
    ['a preventative and a mitigating control bad', (w) => { w.mitigatingControls[0].state = 'x'; w.preventativeControls[1].state = 'x'; }, 'preventativeControls[1]'],
    ['two entries of one list bad', (w) => { w.causalFactors.push({ id: 'x', text: 2 }); w.causalFactors[1].text = 1; }, 'causalFactors[1]'],
    ['two entries of the mitigating list bad', (w) => { w.mitigatingControls[1].state = 'x'; w.mitigatingControls[0].controlKind = 'preventative'; }, 'mitigatingControls[0]'],
  ]);
  for (const [what, change, field] of cases) {
    const w = structuredClone(valid);
    change(w);
    await refused(w, field, what);
  }
});
