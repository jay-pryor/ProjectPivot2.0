/**
 * reports conformance: operations (CORE-CON-002). The success path of every operation in section 2
 * of modules/reports/CONTRACT.md, against a world built through `registry` and compared with
 * `registry.listPlatformHazards`, `review-schedule.listOverdue`, `bowtie.renderBowtieSvg`, and
 * `change-log.listEntries` on the same body: a template saved and read back (C-001), two reports
 * from it carrying its layout (C-002, SL-09 criterion 1), a report holding every hazard of its
 * platform (C-003, C-004, criterion 2), the out-of-date list and the report that carries it (C-006,
 * criterion 3), what a report includes in both directions (C-007, criterion 4), a bow-tie held as
 * drawn (C-005, criterion 5), both documents (C-008 to C-010), and the one entry each change writes
 * (C-011). Written from the contract before any implementation (P8).
 *
 * The null double may pass this file (CORE-TST-002, rung 1); errors, invariants, and boundaries
 * must not.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as reports from '../contract.js';
import {
  HELD, LATER, LAYOUT, TEMPLATES, REPORTS, actOf, alice, assertDocuments, assertProduced, assertRecorded, bob, buildWorld,
  collectionOf, controlRef, createTemplate, expectedOutOfDate, expectedSvg, hazardRef, platformRef, plain, produce,
  registry, reportFields, reportTemplateId, reviewed, scheduled, scheduledWorld, snapshot, templateFields, withClock, worldWithReport,
} from './harness.js';

// ------------------------------------------------------------------ templates (C-001)

test('C-001: createTemplate saves the name and title trimmed, each section with its kind and its text trimmed, stamped by the act at the clock\'s now, read back by getTemplate and added to listTemplates; nothing else in the body changes but its entry (REQ-046; SL-09 criterion 1)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  const before = snapshot(w.body);
  const listed = await reports.listTemplates(w.body);
  const fields = {
    name: '  Quarterly   report ',
    title: '\n Safety report \t',
    sections: [
      { sectionKind: 'heading', text: '  Introduction  ' },
      { sectionKind: 'text', text: ' Every hazard  is here. ' },
      { sectionKind: 'hazards' },
    ],
  };
  const { body: b, template: t } = await createTemplate(w.body, act, /** @type {any} */ (fields));
  assert.deepEqual(w.body, before, 'C-003: the body passed in is untouched');
  reportTemplateId.parse(t.id);
  assert.ok(!Object.prototype.hasOwnProperty.call(collectionOf(w.body, TEMPLATES), t.id), 'C-001: the id is held by no template the body had');
  assert.equal(t.kind, 'report-template');
  assert.equal(t.status, 'live');
  assert.equal(t.name, 'Quarterly   report', 'C-001: the name is trimmed, and only trimmed');
  assert.equal(t.title, 'Safety report', 'C-001: the title is trimmed');
  assert.deepEqual(plain(t.sections), [
    { sectionKind: 'heading', text: 'Introduction' },
    { sectionKind: 'text', text: 'Every hazard  is here.' },
    { sectionKind: 'hazards' },
  ], 'C-001: one section per section given, in order, each text trimmed and nothing else added');
  assert.equal(t.createdBy, alice.id);
  assert.equal(t.updatedBy, alice.id);
  assert.equal(t.createdAtAest, HELD, 'C-001: createdAtAest is the clock\'s now');
  assert.equal(t.updatedAtAest, HELD, 'C-001: updatedAtAest is the clock\'s now');
  assert.deepEqual(plain(await reports.getTemplate(b, t.id)), plain(t), 'C-001: getTemplate reads it back deep-equal');
  assert.deepEqual(plain(await reports.listTemplates(b)), plain([...listed, t]), 'C-001: listTemplates is what it was plus the template');
  assert.deepEqual(plain(collectionOf(b, TEMPLATES)[t.id]), plain(t), 'section 3: the template is in collections[\'report-template\'] under its id');
  await assertRecorded(w.body, b, { act, ts: HELD, record: t, collection: TEMPLATES, affected: [], what: 'createTemplate' });
});

test('C-001: two templates may share a name and are two records told apart by id, listed ascending by createdAtAest then id', async () => {
  const w = await buildWorld();
  const first = await createTemplate(w.body, actOf(bob), templateFields({ name: 'Same' }), LATER);
  const second = await createTemplate(first.body, actOf(alice), templateFields({ name: 'Same' }), HELD);
  const third = await createTemplate(second.body, actOf(alice), templateFields({ name: 'Same' }), HELD);
  assert.notEqual(first.template.id, second.template.id);
  const listed = await reports.listTemplates(third.body);
  const sameTime = [second.template, third.template].sort((a, b) => (a.id < b.id ? -1 : 1));
  assert.deepEqual(listed.map((t) => t.id), [...sameTime.map((t) => t.id), first.template.id], 'section 5 ordering: ascending createdAtAest, then id');
  assert.equal(listed[2].createdBy, bob.id);
});

test('C-001: getTemplate of an id nothing has, and listTemplates of a body with no template collection, resolve with null and empty', async () => {
  const w = await buildWorld();
  assert.equal(await reports.getTemplate(w.body, /** @type {any} */ (reportTemplateId.fresh())), null);
  assert.deepEqual([...await reports.listTemplates(w.body)], []);
});

// ------------------------------------------------------------------ producing a report (C-002 to C-005)

test('C-003 and C-004: produceReport on a live platform holds the platform\'s name and every row and omission of registry.listPlatformHazards, in order, with each control\'s state and justification and the residual values; read back by getReport and added to listReports (REQ-007; SL-09 criterion 2)', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  const t = await createTemplate(w.body, actOf(bob));
  const fields = await reportFields(t.body, t.template.id, w.P);
  const before = snapshot(t.body);
  const listed = await reports.listReports(t.body);
  const { body: b, report: r } = await produce(t.body, act, fields);
  assert.deepEqual(t.body, before, 'C-003: the body passed in is untouched');
  await assertProduced(r, { input: t.body, act, fields, template: t.template, ts: HELD });
  assert.deepEqual(r.hazards.map((h) => h.hazardId), [w.H1, w.H2, w.H3], 'fixture: P\'s rows are H1, H2, H3');
  assert.deepEqual(r.hazards[1].controls.map((c) => [c.state, c.justificationText]), [['excluded', 'Single-engine vessel;  no second  governor & no <spare>']], 'C-004: an excluded control carries its reason as stored');
  // C and D are linked at one held time, so their order is by id, which a test must not assume (DEC-005); assertProduced holds the order to registry's
  const h1Controls = new Map(r.hazards[0].controls.map((c) => [c.controlId, [c.state, c.justificationText]]));
  assert.deepEqual(plain([...h1Controls.keys()].sort()), plain([w.C, w.D].sort()), 'C-004: H1 carries C and D');
  assert.deepEqual(plain([h1Controls.get(w.C), h1Controls.get(w.D)]), [['confirmed', null], ['awaiting', null]], 'C-004: confirmed and awaiting carry null');
  assert.deepEqual(plain(r.hazards[1].residual), { consequence: null, likelihood: null }, 'C-004: a hazard with no residual rating holds both values null');
  assert.deepEqual([...r.bowties], [], 'C-005: no bow-tie asked for, none held');
  assert.deepEqual([...r.outOfDate], [], 'C-006: nothing scheduled, nothing out of date');
  assert.deepEqual(plain(await reports.getReport(b, r.id)), plain(r), 'C-003: getReport reads it back deep-equal');
  assert.deepEqual(plain(await reports.listReports(b)), plain([...listed, r]), 'C-003: listReports is what it was plus the report');
  assert.deepEqual(plain(collectionOf(b, REPORTS)[r.id]), plain(r), 'section 3: the report is in collections.report under its id');
  assert.deepEqual(plain(await reports.getTemplate(b, t.template.id)), plain(t.template), 'C-002: producing a report reads the template and never changes it');
});

test('C-011: produceReport writes one entry: the report created, by act.profile at the clock\'s now, made for act.madeForPlatformId, reaching registry.platformsAffected of the platform', async () => {
  const w = await buildWorld();
  const t = await createTemplate(w.body, actOf(alice));
  for (const act of [actOf(bob, w.P), actOf(alice, null), actOf(alice, w.Q)]) {
    const fields = await reportFields(t.body, t.template.id, w.P);
    const { body: b, report: r } = await produce(t.body, act, fields, LATER);
    const affected = [...await registry.platformsAffected(t.body, platformRef(w.P))];
    await assertRecorded(t.body, b, { act, ts: LATER, record: r, collection: REPORTS, affected, what: `produceReport made for ${act.madeForPlatformId}` });
  }
});

test('C-002: two reports from one template, on two platforms, both carry the template\'s name, title, and sections in order, and both documents of each draw that layout (REQ-046; SL-09 criterion 1)', async () => {
  const w = await buildWorld();
  const t = await createTemplate(w.body, actOf(alice));
  const onP = await produce(t.body, actOf(alice, w.P), await reportFields(t.body, t.template.id, w.P));
  const onQ = await produce(onP.body, actOf(bob, w.Q), await reportFields(onP.body, t.template.id, w.Q), LATER);
  for (const r of [onP.report, onQ.report]) {
    assert.equal(r.templateId, t.template.id);
    assert.equal(r.templateName, t.template.name);
    assert.equal(r.title, t.template.title);
    assert.deepEqual(plain(r.sections), plain(t.template.sections));
  }
  assert.deepEqual(plain(t.template.sections), plain(LAYOUT), 'fixture: the layout as given, which is already trimmed');
  const docs = [await assertDocuments(onP.report), await assertDocuments(onQ.report)];
  const kinds = (/** @type {any} */ root) => root.marks.filter((/** @type {any} */ m) => m.type === 'section').map((/** @type {any} */ m) => [m.values.sectionKind, m.text]);
  assert.deepEqual(kinds(docs[0].htmlRoot), kinds(docs[1].htmlRoot), 'C-008: the two reports\' HTML hold the same sequence of sections');
  assert.deepEqual(kinds(docs[0].markdownRoot), kinds(docs[1].markdownRoot), 'C-008: the two reports\' Markdown hold the same sequence of sections');
  assert.equal((await reports.listReports(onQ.body)).length, 2);
});

test('C-005: produceReport holds, for each hazard asked for, exactly the text bowtie.renderBowtieSvg draws for it on that platform now, in the order of the report\'s rows and not the order asked (REQ-061; SL-09 criterion 5)', async () => {
  const w = await buildWorld();
  const t = await createTemplate(w.body, actOf(alice));
  const fields = await reportFields(t.body, t.template.id, w.P, [w.H3, w.H1]);
  const { report: r } = await produce(t.body, actOf(alice, w.P), fields);
  assert.deepEqual(r.bowties.map((x) => x.hazardId), [w.H1, w.H3], 'C-005: bowties in the order of hazards');
  assert.equal(r.bowties[0].svg, await expectedSvg(t.body, w.H1, w.P), 'C-005: H1\'s drawing as bowtie draws it on P');
  assert.equal(r.bowties[1].svg, await expectedSvg(t.body, w.H3, w.P), 'C-005: H3\'s drawing as bowtie draws it on P');
});

// ------------------------------------------------------------------ out of date (C-006)

test('C-006: outOfDateFor names every overdue record a report on the platform uses — the platform, each row\'s hazard, each control of those rows once — in listOverdue\'s order, with its name as the query gives it and the schedule\'s dates; not a record of another platform, a reference entry, or one not yet due (REQ-016; SL-09 criterion 3)', async () => {
  const w = await buildWorld();
  let body = await scheduledWorld(w);
  body = await reviewed(body, hazardRef(w.H2), /** @type {any} */ ('2026-09-02T09:00:00+10:00'));
  body = await scheduled(body, hazardRef(w.H2), '2026-09-12');
  const list = await withClock(HELD, () => reports.outOfDateFor(body, /** @type {any} */ (w.P)));
  const expected = await expectedOutOfDate(body, w.P, HELD);
  assert.deepEqual(plain(list), plain(expected), 'C-006: the list is listOverdue filtered to what the report uses, in its order');
  assert.deepEqual(list.map((x) => `${x.ref.kind}:${x.ref.id}`).sort(), [
    `control:${w.C}`, `control:${w.D}`, `control:${w.E}`, `hazard:${w.H1}`, `hazard:${w.H2}`, `hazard:${w.H3}`, `platform:${w.P}`,
  ].sort(), 'fixture: P, its three hazards, and their three controls; not Q, H4, or the reference entry');
  const h2 = list.find((x) => x.ref.id === w.H2);
  assert.equal(h2?.lastReviewedAest, '2026-09-02', 'C-006: lastReviewedAest is the schedule\'s');
  assert.equal(h2?.nextDueAest, '2026-09-12', 'C-006: nextDueAest is the schedule\'s');
  assert.equal(list.find((x) => x.ref.id === w.P)?.name, (await registry.listPlatformHazards(body, w.P)).platform.name, 'C-006: the platform\'s name');
  assert.equal(list.find((x) => x.ref.id === w.C)?.lastReviewedAest, null, 'C-006: a record never reviewed has null');
  assert.equal(list.filter((x) => x.ref.id === w.C).length, 1, 'C-006: a control on two rows is named once');
});

test('C-006: a report produced with the list acknowledged exactly carries that list as outOfDate, and one produced with nothing past due carries an empty list (REQ-016; HZ-009; SL-09 criterion 3)', async () => {
  const w = await buildWorld();
  const body = await scheduledWorld(w);
  const t = await createTemplate(body, actOf(alice));
  const list = await withClock(HELD, () => reports.outOfDateFor(t.body, /** @type {any} */ (w.P)));
  assert.ok(list.length > 0, 'fixture: records are past due at HELD');
  const fields = /** @type {any} */ ({ templateId: t.template.id, platformId: w.P, bowtieHazardIds: [], acknowledgedOutOfDate: list.map((x) => ({ kind: x.ref.kind, id: x.ref.id })) });
  const { report: r } = await produce(t.body, actOf(alice, w.P), fields);
  assert.deepEqual(plain(r.outOfDate), plain(list), 'C-006: outOfDate is the list outOfDateFor gave, deep-equal');
  const early = /** @type {any} */ ('2026-09-05T09:00:00+10:00');
  assert.deepEqual([...await withClock(early, () => reports.outOfDateFor(t.body, /** @type {any} */ (w.P)))], [], 'fixture: nothing is past due on 5 September');
  const none = await produce(t.body, actOf(alice, w.P), /** @type {any} */ ({ ...fields, acknowledgedOutOfDate: [] }), early);
  assert.deepEqual([...none.report.outOfDate], [], 'C-006: nothing past due, an empty list, and the report is produced');
});

// ------------------------------------------------------------------ what a report includes (C-007)

test('C-007: includesOf reads the platform, the rows\' hazards, the omitted hazards, and every control of the rows once in the order first met, from the report alone (REQ-027; SL-09 criterion 4)', async () => {
  const { w, report: r } = await worldWithReport();
  const inc = await reports.includesOf(r);
  assert.deepEqual(plain(inc), {
    platformIds: [w.P],
    hazardIds: [w.H1, w.H2, w.H3],
    omittedHazardIds: [],
    // in the order first met in r; H1's C and D are ordered by id, which a test must not assume (DEC-005)
    controlIds: [...new Set(r.hazards.flatMap((h) => h.controls.map((c) => c.controlId)))],
  });
  assert.deepEqual(plain([...inc.controlIds].sort()), plain([w.C, w.D, w.E].sort()), 'C-007: the controls are C, D, and E, each once');
});

test('C-007: reportsIncluding names every report whose includes name the platform, hazard, or control, in listReports\' order; a record no report includes gives an empty list (REQ-026 third part, REQ-027; SL-09 criterion 4)', async () => {
  const w = await buildWorld();
  const t = await createTemplate(w.body, actOf(alice));
  const onP = await produce(t.body, actOf(alice, w.P), await reportFields(t.body, t.template.id, w.P));
  const onQ = await produce(onP.body, actOf(alice, w.Q), await reportFields(onP.body, t.template.id, w.Q), LATER);
  const b = onQ.body;
  const ids = async (/** @type {any} */ ref) => (await reports.reportsIncluding(b, ref)).map((r) => r.id);
  const [p, q] = [onP.report.id, onQ.report.id];
  assert.deepEqual(await ids(hazardRef(w.H1)), [p, q], 'C-007: H1 is on both platforms');
  assert.deepEqual(await ids(hazardRef(w.H2)), [p]);
  assert.deepEqual(await ids(hazardRef(w.H4)), [q]);
  assert.deepEqual(await ids(hazardRef(w.H5)), [], 'C-007: a hazard on no platform is in no report');
  assert.deepEqual(await ids(platformRef(w.P)), [p]);
  assert.deepEqual(await ids(platformRef(w.Q)), [q]);
  assert.deepEqual(await ids(controlRef(w.C)), [p, q], 'C-007: C is on H1, which is a row on both platforms');
  assert.deepEqual(await ids(controlRef(w.E)), [p]);
  assert.deepEqual(await ids(controlRef(w.F)), [], 'C-007: a control on no hazard is in no report');
  const full = await reports.reportsIncluding(b, hazardRef(w.H1));
  assert.deepEqual(plain(full), plain(await reports.listReports(b)), 'C-007: the reports themselves, as listReports gives them');
});

// ------------------------------------------------------------------ the documents (C-008 to C-010)

test('C-008 to C-010: both documents of a report with every kind of section, control state, a bow-tie, and an out-of-date notice mark everything it holds, in order, with texts normalised and escaped, and hold the same things', async () => {
  const w = await buildWorld();
  const body = await scheduledWorld(w);
  const t = await createTemplate(body, actOf(alice));
  const { report: r } = await produce(t.body, actOf(alice, w.P), await reportFields(t.body, t.template.id, w.P, [w.H1, w.H2]));
  assert.ok(r.outOfDate.length > 0 && r.bowties.length === 2, 'fixture: a notice and two bow-ties');
  await assertDocuments(r);
});

test('C-008: renderReportHtml and renderReportMarkdown of the same report resolve with identical text each call', async () => {
  const { report: r } = await worldWithReport();
  assert.equal(await reports.renderReportHtml(r), await reports.renderReportHtml(snapshot(r)));
  assert.equal(await reports.renderReportMarkdown(r), await reports.renderReportMarkdown(snapshot(r)));
});
