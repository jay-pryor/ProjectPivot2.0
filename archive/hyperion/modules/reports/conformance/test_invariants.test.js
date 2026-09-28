/**
 * reports conformance: invariants (CORE-CON-002, property-based where an invariant exists,
 * CORE-TST-001). The promises of modules/reports/CONTRACT.md that hold across every body and every
 * report: a report is what was true when it was produced, whatever changes after (C-003, C-005,
 * C-007); every hazard of the platform's one query is in a report once, as a row or as omitted
 * (C-004, HZ-004); the out-of-date list is review-schedule's overdue flag over what the report uses
 * and nothing else, turning over the day after a due date (C-006, HZ-009); what a report includes
 * and the reports that include a record are one rule read two ways (C-007); a document is a
 * function of the report alone, holds everything it holds in both syntaxes, and is identical for
 * deep-equal reports (C-008 to C-010); and the body is a value (C-003). Random bodies and reports
 * are drawn from the fixed seed in harness.js. Written from the contract before any implementation
 * (P8).
 *
 * The null double must fail this file (CORE-TST-002, rung 1): fixed data neither follows the
 * registry, nor holds as at production, nor draws what a report holds.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as reports from '../contract.js';
import {
  EARLIER, HELD, LATER, SEED, actOf, alice, assertDocuments, assertProduced, at, bob, bowtie, buildWorld, controlRef,
  createTemplate, deepFreeze, expectedOutOfDate, expectedSvg, hazardRef, jsonRoundTrip, keyWhere, oneOf, pick, platformRef, plain,
  prng, produce, randomReport, randomText, registry, reportFields, reviewed, rs, scheduled, schema, snapshot, spoil, templateFields,
  withAmbientSpies, withClock, withOmittedHazard, worldWithReport,
} from './harness.js';

/**
 * Every platform, hazard, and control ref a body holds, through registry's own reads.
 * @param {any} body
 */
async function everyRef(body) {
  return [
    ...(await registry.listAllPlatforms(body)).map((p) => platformRef(p.id)),
    ...(await registry.listAllHazards(body)).map((h) => hazardRef(h.id)),
    ...(await registry.listAllControls(body)).map((c) => controlRef(c.id)),
  ];
}

/**
 * C-007 in both directions over one body: for every report and every platform, hazard, and control
 * the body holds, the report is in `reportsIncluding` exactly when `includesOf` names the record in
 * the list for its kind; and `includesOf` is read from the report's own fields.
 * @param {any} body
 * @param {string} what
 */
async function assertIncludesAgree(body, what) {
  const all = await reports.listReports(body);
  /** @type {Map<string, any>} */
  const includes = new Map();
  for (const r of all) {
    const inc = await reports.includesOf(r);
    /** @type {string[]} */
    const controls = [];
    for (const h of r.hazards) for (const c of h.controls) if (!controls.includes(c.controlId)) controls.push(c.controlId);
    assert.deepEqual(plain(inc), {
      platformIds: [r.platformId],
      hazardIds: r.hazards.map((h) => h.hazardId),
      omittedHazardIds: r.omitted.map((o) => o.hazardId),
      controlIds: controls,
    }, `C-007: ${what}: includesOf of ${r.id} is read from the report alone`);
    includes.set(r.id, inc);
  }
  for (const ref of await everyRef(body)) {
    const listKey = { platform: 'platformIds', hazard: 'hazardIds', control: 'controlIds' }[/** @type {'platform'} */ (ref.kind)];
    const expected = all.filter((r) => includes.get(r.id)[listKey].includes(ref.id)).map((r) => r.id);
    const actual = (await reports.reportsIncluding(body, ref)).map((r) => r.id);
    assert.deepEqual(actual, expected, `C-007: ${what}: reportsIncluding ${ref.kind} ${ref.id} is every report whose includes name it, in listReports' order`);
  }
}

// ------------------------------------------------------------------ as at production (C-003, C-005, C-007)

test('C-003, C-005, C-007: after a hazard is renamed, a causal factor added, a control confirmed and another excluded, a rating re-entered, and a hazard linked to the platform, the report, its includes, the reports that include each record, its bow-tie, and both documents are what they were at production (REQ-027, REQ-061; SL-09 criteria 4 and 5)', async () => {
  const { w, body, report: r } = await worldWithReport();
  const html = await reports.renderReportHtml(r);
  const md = await reports.renderReportMarkdown(r);
  const includes = await reports.includesOf(r);
  const drawnThen = r.bowties[0].svg;
  assert.equal(drawnThen, await expectedSvg(body, w.H1, w.P), 'fixture: the drawing at production');
  const includingThen = await Promise.all((await everyRef(body)).map(async (ref) => [ref, (await reports.reportsIncluding(body, ref)).map((x) => x.id)]));

  let b = body;
  const act = actOf(bob, w.P);
  await withClock(LATER, async () => {
    b = (await registry.updateHazard(b, act, w.H1, { title: 'A new title' })).body;
    b = (await registry.addCausalFactor(b, act, w.H1, { text: 'A new cause' })).body;
    b = (await registry.confirmControlForPlatform(b, act, { hazardId: w.H1, controlId: w.D, platformId: w.P })).body;
    b = (await registry.excludeControlFromPlatform(b, act, { hazardId: w.H1, controlId: w.C, platformId: w.P, text: 'No longer fitted' })).body;
    b = (await registry.setRating(b, act, { hazardId: w.H1, platformId: w.P, stage: 'residual', consequence: /** @type {any} */ (5), likelihood: /** @type {any} */ ('A') })).body;
    b = (await registry.linkHazardToPlatform(b, act, { hazardId: w.H5, platformId: w.P })).body;
  });
  assert.notEqual(await expectedSvg(b, w.H1, w.P), drawnThen, 'fixture: bowtie now draws H1 differently');

  const later = await reports.getReport(b, r.id);
  assert.deepEqual(plain(later), plain(r), 'C-003: getReport gives the report deep-equal to what it was');
  assert.deepEqual(plain(await reports.includesOf(/** @type {any} */ (later))), plain(includes), 'C-007: what the report includes is what it included');
  assert.equal(/** @type {any} */ (later).bowties[0].svg, drawnThen, 'C-005: the drawing is as generated at production');
  assert.equal(await reports.renderReportHtml(/** @type {any} */ (later)), html, 'C-008: the HTML is the same text');
  assert.equal(await reports.renderReportMarkdown(/** @type {any} */ (later)), md, 'C-008: the Markdown is the same text');
  for (const [ref, ids] of /** @type {Array<[any, string[]]>} */ (includingThen)) {
    assert.deepEqual((await reports.reportsIncluding(b, ref)).map((x) => x.id), ids, `C-007: the reports including ${ref.kind} ${ref.id} are as they were`);
  }
  assert.deepEqual((await reports.reportsIncluding(b, hazardRef(w.H5))).map((x) => x.id), [], 'C-007: a hazard linked after production is in no report produced before');
});

test('C-003: a report produced from a body stays deep-equal in every later body carried from it, and a second report on the changed body holds the change (REQ-007)', async () => {
  const { w, body, report: first, template } = await worldWithReport();
  const renamed = (await withClock(LATER, () => registry.updateHazard(body, actOf(alice), w.H2, { title: 'Renamed' }))).body;
  const second = await produce(renamed, actOf(alice, w.P), await reportFields(renamed, template.id, w.P, [], LATER), LATER);
  assert.equal(second.report.hazards[1].title, 'Renamed', 'C-004: the new report reads the body as it now is');
  assert.deepEqual(plain(await reports.getReport(second.body, first.id)), plain(first), 'C-003: the first report is unchanged');
  assert.deepEqual((await reports.listReports(second.body)).map((r) => r.id), [first.id, second.report.id], 'section 5 ordering: ascending createdAtAest');
});

// ------------------------------------------------------------------ every hazard once (C-004; HZ-004)

test('C-004, HZ-004: with hazards omitted for a malformed rating, a malformed justification, and a malformed control, a report\'s rows and omitted are exactly the query\'s, each hazard linked and live once and in neither twice (REQ-007; SL-09 criterion 2)', async () => {
  const w = await buildWorld();
  const t = await createTemplate(w.body, actOf(alice));
  const justKey = keyWhere(t.body, 'justification', (j) => j.hazardId === w.H2);
  const bodies = [
    ['a malformed rating', withOmittedHazard(t.body, w.H3)],
    ['a malformed justification', spoil(t.body, 'justification', justKey, (j) => ({ ...j, text: 7 }))],
    ['a malformed control', spoil(t.body, 'control', w.E, (c) => ({ ...c, title: 7 }))],
  ];
  for (const [what, body] of /** @type {Array<[string, any]>} */ (bodies)) {
    const q = await registry.listPlatformHazards(body, w.P);
    assert.ok(q.omitted.length > 0, `fixture: ${what} omits a hazard`);
    const fields = await reportFields(body, t.template.id, w.P);
    const { report: r } = await produce(body, actOf(alice, w.P), fields);
    await assertProduced(r, { input: body, act: actOf(alice, w.P), fields, template: t.template, ts: HELD, what });
    const inReport = [...r.hazards.map((h) => h.hazardId), ...r.omitted.map((o) => o.hazardId)];
    assert.equal(new Set(inReport).size, inReport.length, `C-004: ${what}: no hazard is both a row and omitted, or twice`);
    assert.deepEqual([...inReport].sort(), [w.H1, w.H2, w.H3].sort(), `C-004: ${what}: the report's hazards are exactly the platform's live linked hazards`);
    const inc = await reports.includesOf(r);
    assert.ok(q.omitted.every((o) => !inc.hazardIds.includes(o.id) && inc.omittedHazardIds.includes(o.id)), `C-007: ${what}: an omitted hazard is not one the report includes, and is named as omitted`);
    await assertDocuments(r);
  }
});

test('C-004: over random bodies built through registry, every report holds exactly the query\'s rows and omitted, the drawings bowtie gives, the out-of-date list listOverdue gives, includes that agree in both directions, and documents that draw it all (seeded)', async () => {
  const random = prng(SEED);
  for (let round = 0; round < 6; round += 1) {
    const { body: built, platforms, hazards } = await randomWorld(random);
    let body = (await createTemplate(built, actOf(alice), templateFields({ title: randomText(random) }))).body;
    const templateId = (await reports.listTemplates(body))[0].id;
    for (const platform of platforms) {
      const day = at(`2026-09-${String(10 + pick(random, 10)).padStart(2, '0')}`, oneOf(random, ['00:00:00', '12:00:00', '23:59:59']));
      const q = await registry.listPlatformHazards(body, platform);
      const asked = q.rows.filter(() => pick(random, 3) === 0).map((row) => row.hazard.id).reverse();
      const fields = await reportFields(body, templateId, platform, asked, day);
      const expectedList = await expectedOutOfDate(body, platform, day);
      assert.deepEqual(plain(fields.acknowledgedOutOfDate), expectedList.map((x) => x.ref), `C-006: round ${round}: outOfDateFor is listOverdue over what the report uses`);
      const template = /** @type {any} */ (await reports.getTemplate(body, templateId));
      const act = actOf(oneOf(random, [alice, bob]), oneOf(random, [platform, null]));
      const { body: next, report: r } = await produce(body, act, fields, day);
      await assertProduced(r, { input: body, act, fields, template, ts: day, what: `round ${round}` });
      assert.deepEqual(plain(r.outOfDate), plain(expectedList), `C-006: round ${round}: the report carries the list`);
      const order = q.rows.map((row) => row.hazard.id).filter((id) => asked.includes(id));
      assert.deepEqual(r.bowties.map((x) => x.hazardId), order, `C-005: round ${round}: bowties in the rows' order`);
      for (const x of r.bowties) assert.equal(x.svg, await expectedSvg(body, x.hazardId, platform), `C-005: round ${round}: ${x.hazardId}'s drawing`);
      await assertDocuments(r);
      body = next;
    }
    await assertIncludesAgree(body, `round ${round}`);
    assert.ok(hazards.length > 0);
  }
});

/**
 * A body built through registry and review-schedule from the generator: two or three platforms,
 * up to six hazards linked at random, up to four controls on them at random sides and states,
 * ratings, report ids, schedules due across the middle of September, a completed review, and now
 * and then a malformed rating that omits a hazard.
 * @param {() => number} random
 */
async function randomWorld(random) {
  /** @type {any} */
  let body = schema.emptyDataBody();
  const act = actOf(alice);
  /** @type {string[]} */
  const platforms = [];
  /** @type {string[]} */
  const hazards = [];
  /** @type {string[]} */
  const controls = [];
  /** @type {Array<[string, string]>} */
  const links = [];
  await withClock(EARLIER, async () => {
    for (let k = 0; k < 2 + pick(random, 2); k += 1) {
      const r = await registry.createPlatform(body, act, { name: randomText(random), ownerProfileId: oneOf(random, [alice, bob]).id });
      body = r.body;
      platforms.push(r.platform.id);
    }
    for (let k = 0; k < 1 + pick(random, 6); k += 1) {
      const r = await registry.createHazard(body, act, { title: randomText(random) });
      body = r.body;
      hazards.push(r.hazard.id);
      if (pick(random, 2) === 0) body = (await registry.addCausalFactor(body, act, r.hazard.id, { text: randomText(random) })).body;
    }
    for (let k = 0; k < pick(random, 5); k += 1) {
      const r = await registry.createControl(body, act, { title: randomText(random) });
      body = r.body;
      controls.push(r.control.id);
    }
    for (const h of hazards) {
      for (const c of controls) {
        if (pick(random, 2) === 0) body = (await registry.linkControlToHazard(body, act, { hazardId: h, controlId: c, controlKind: oneOf(random, ['preventative', 'mitigating']) })).body;
      }
      for (const p of platforms) {
        if (pick(random, 3) === 0) continue;
        body = (await registry.linkHazardToPlatform(body, act, { hazardId: h, platformId: p })).body;
        links.push([h, p]);
        if (pick(random, 3) === 0) body = (await registry.setPlatformReportId(body, act, { hazardId: h, platformId: p, reportId: /** @type {any} */ (`R-${pick(random, 900) + 100}`) })).body;
        if (pick(random, 2) === 0) {
          body = (await registry.setRating(body, act, { hazardId: h, platformId: p, stage: 'residual', consequence: /** @type {any} */ (oneOf(random, [null, 1, 2, 3, 4, 5])), likelihood: /** @type {any} */ (oneOf(random, [null, 'A', 'C', 'G'])) })).body;
        }
        const detail = await registry.getHazardDetail(body, /** @type {any} */ (h));
        for (const hc of /** @type {any} */ (detail).controls) {
          const choice = pick(random, 3);
          if (choice === 1) body = (await registry.confirmControlForPlatform(body, act, { hazardId: h, controlId: hc.control.id, platformId: p })).body;
          if (choice === 2) body = (await registry.excludeControlFromPlatform(body, act, { hazardId: h, controlId: hc.control.id, platformId: p, text: randomText(random) })).body;
        }
      }
    }
  });
  const refs = [...platforms.map(platformRef), ...hazards.map(hazardRef), ...controls.map(controlRef)];
  for (const ref of refs) {
    if (pick(random, 2) === 0) body = await scheduled(body, ref, `2026-09-${String(8 + pick(random, 12)).padStart(2, '0')}`);
  }
  const withSchedule = refs.filter(() => pick(random, 4) === 0);
  for (const ref of withSchedule) {
    if (await withClock(EARLIER, () => rs.getSchedule(body, ref)) !== null) body = await reviewed(body, ref, at('2026-09-05'));
  }
  if (links.length > 0 && pick(random, 3) === 0) {
    const [h, p] = oneOf(random, links);
    const rated = Object.values(body.collections.rating ?? {}).find((/** @type {any} */ x) => x.hazardId === h && x.platformId === p && x.stage === 'residual');
    if (rated) body = withOmittedHazard(body, h);
  }
  return { body, platforms, hazards };
}

// ------------------------------------------------------------------ out of date (C-006; HZ-009)

test('C-006, HZ-009: a record is out of date from the day after its due date at any hour, not on the due date at any hour, and outOfDateFor always equals listOverdue over what the report uses (REQ-016; SL-09 criterion 3)', async () => {
  const w = await buildWorld();
  let body = await scheduled(w.body, controlRef(w.D), '2026-09-15');
  body = await scheduled(body, platformRef(w.P), '2026-09-20');
  body = await scheduled(body, hazardRef(w.H4), '2026-09-01');
  const days = [
    ['2026-09-14', '23:59:59', []],
    ['2026-09-15', '00:00:00', []],
    ['2026-09-15', '23:59:59', []],
    ['2026-09-16', '00:00:00', [w.D]],
    ['2026-09-20', '12:00:00', [w.D]],
    ['2026-09-21', '00:00:00', [w.D, w.P]],
  ];
  for (const [date, time, ids] of /** @type {Array<[string, string, string[]]>} */ (days)) {
    const ts = at(date, time);
    const list = await withClock(ts, () => reports.outOfDateFor(body, /** @type {any} */ (w.P)));
    assert.deepEqual(list.map((x) => x.ref.id), ids, `C-006: at ${date} ${time}`);
    assert.deepEqual(plain(list), plain(await expectedOutOfDate(body, w.P, ts)), `C-006: at ${date} ${time}, listOverdue over what the report uses`);
  }
});

test('C-006: the list is not affected by a record\'s last reviewed date or tempo, only by the flag review-schedule gives, and a completed review takes a record off it', async () => {
  const w = await buildWorld();
  let body = await scheduled(w.body, hazardRef(w.H1), '2026-09-10');
  const ts = at('2026-09-12');
  assert.deepEqual((await withClock(ts, () => reports.outOfDateFor(body, /** @type {any} */ (w.P)))).map((x) => x.ref.id), [w.H1]);
  body = await reviewed(body, hazardRef(w.H1), at('2026-09-11'));
  const state = await withClock(ts, () => rs.reviewStateOf(body, hazardRef(w.H1)));
  const list = await withClock(ts, () => reports.outOfDateFor(body, /** @type {any} */ (w.P)));
  assert.deepEqual(list.map((x) => x.ref.id), state.overdue ? [w.H1] : [], 'C-006: out of date exactly when review-schedule flags it overdue');
  body = await scheduled(body, hazardRef(w.H1), '2026-09-11');
  const again = await withClock(ts, () => reports.outOfDateFor(body, /** @type {any} */ (w.P)));
  assert.deepEqual(again.map((x) => [x.ref.id, x.lastReviewedAest, x.nextDueAest]), [[w.H1, '2026-09-11', '2026-09-11']], 'C-006: a reviewed record past a new due date carries its last reviewed date');
});

// ------------------------------------------------------------------ the body is a value (C-003)

test('C-003: every operation leaves a deep-frozen body deep-equal to what it was, reads no browser storage and no document, and every body it returns survives a JSON round trip with the same reads and the same documents', async () => {
  const { w, body, report: r, template, fields } = await worldWithReport();
  const frozen = deepFreeze(snapshot(body));
  const copy = snapshot(frozen);
  const { uses, result } = await withAmbientSpies(async () => {
    const t = await createTemplate(frozen, actOf(alice), templateFields());
    const f2 = { ...fields, bowtieHazardIds: /** @type {any} */ ([w.H1, w.H3]) };
    const p = await produce(frozen, actOf(alice, w.P), f2);
    await reports.getTemplate(frozen, template.id);
    await reports.listTemplates(frozen);
    await withClock(HELD, () => reports.outOfDateFor(frozen, /** @type {any} */ (w.P)));
    await reports.getReport(frozen, r.id);
    await reports.listReports(frozen);
    await reports.reportsIncluding(frozen, hazardRef(w.H1));
    await reports.includesOf(deepFreeze(snapshot(r)));
    await reports.renderReportHtml(deepFreeze(snapshot(r)));
    await reports.renderReportMarkdown(deepFreeze(snapshot(r)));
    return { t, p };
  });
  assert.deepEqual(uses, [], 'C-003: no browser storage or document is read');
  assert.deepEqual(frozen, copy, 'C-003: the body is deep-equal to what it was');
  for (const out of [result.t.body, result.p.body]) {
    const trip = jsonRoundTrip(out);
    assert.deepEqual(trip, out, 'section 3: the returned body is deep-equal to itself after JSON');
    assert.deepEqual(plain(await reports.listTemplates(trip)), plain(await reports.listTemplates(out)));
    assert.deepEqual(plain(await reports.listReports(trip)), plain(await reports.listReports(out)));
  }
  const tripped = /** @type {any} */ (await reports.getReport(jsonRoundTrip(result.p.body), result.p.report.id));
  assert.equal(await reports.renderReportHtml(tripped), await reports.renderReportHtml(result.p.report), 'C-008: the same HTML after a JSON round trip');
  assert.equal(await reports.renderReportMarkdown(tripped), await reports.renderReportMarkdown(result.p.report), 'C-008: the same Markdown after a JSON round trip');
});

test('C-001, C-003: producing twice with equal fields gives two reports with two ids, and creating twice two templates; each call adds one record to what it was given', async () => {
  const { w, withTemplate, fields } = await worldWithReport();
  const a = await produce(withTemplate, actOf(alice, w.P), fields);
  const b = await produce(a.body, actOf(alice, w.P), fields);
  assert.notEqual(a.report.id, b.report.id);
  assert.deepEqual({ ...plain(a.report), id: null }, { ...plain(b.report), id: null }, 'the two reports differ by id alone');
  assert.equal((await reports.listReports(b.body)).length, (await reports.listReports(withTemplate)).length + 2);
  const t1 = await createTemplate(w.body, actOf(alice));
  const t2 = await createTemplate(t1.body, actOf(alice));
  assert.notEqual(t1.template.id, t2.template.id);
});

// ------------------------------------------------------------------ documents (C-008 to C-010)

test('C-008 to C-010: over random reports built directly — texts with every character either syntax treats specially, whitespace runs, empty and full lists — both documents mark exactly what the report holds, and deep-equal reports draw identical text (seeded)', async () => {
  const random = prng(SEED ^ 0x0d0c);
  for (let round = 0; round < 40; round += 1) {
    const r = randomReport(random);
    const { html, md } = await assertDocuments(r);
    assert.equal(await reports.renderReportHtml(plain(r)), html, `C-008: round ${round}: identical HTML for a deep-equal report`);
    assert.equal(await reports.renderReportMarkdown(plain(r)), md, `C-008: round ${round}: identical Markdown for a deep-equal report`);
  }
});

test('C-008: a render reads no clock, no storage, and no document: the same report drawn with the clock held on different days, or following the machine, is the same text', async () => {
  const r = detachedReport();
  const { result: first, uses } = await withAmbientSpies(async () => [await reports.renderReportHtml(r), await reports.renderReportMarkdown(r)], { clock: true });
  assert.deepEqual(uses, [], 'C-008: no clock, storage, or document is read');
  for (const ts of [EARLIER, LATER, at('2031-01-01')]) {
    const again = await withClock(ts, async () => [await reports.renderReportHtml(r), await reports.renderReportMarkdown(r)]);
    assert.deepEqual(again, first, `C-008: the same text with the clock at ${ts}`);
  }
});

/** A report drawn in no body at all: from the generator, so no world holds it. */
function detachedReport() {
  return randomReport(prng(SEED ^ 0x77));
}

test('C-008: the band beside each hazard is rating.ratingFor\'s for its stored residual values, across every cell and the uncategorised case', async () => {
  const levels = [null, 1, 2, 3, 4, 5];
  const letters = [null, 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
  const base = randomReport(prng(SEED ^ 0xba));
  const hazards = [];
  let n = 1;
  for (const consequence of levels) {
    for (const likelihood of letters) {
      hazards.push({ hazardId: `H-${String(n).padStart(4, '0')}`, title: `Hazard ${n}`, reportId: `R ${n}`, controls: [], residual: { consequence, likelihood } });
      n += 1;
    }
  }
  const r = /** @type {any} */ ({ ...base, sections: [{ sectionKind: 'hazards' }], hazards, omitted: [], bowties: [] });
  await assertDocuments(r);
});

test('C-005, C-008: a bow-tie drawn from a real body is held whole in the HTML and exactly recoverable from the Markdown\'s base64', async () => {
  const w = await buildWorld();
  const t = await createTemplate(w.body, actOf(alice));
  const { report: r } = await produce(t.body, actOf(alice, w.P), await reportFields(t.body, t.template.id, w.P, [w.H1, w.H2, w.H3]));
  const drawn = await Promise.all([w.H1, w.H2, w.H3].map((h) => expectedSvg(t.body, h, w.P)));
  assert.deepEqual(r.bowties.map((x) => x.svg), drawn);
  await assertDocuments(r);
});
