/**
 * reports conformance: boundaries (CORE-CON-002). The empty, null, and degenerate cases of
 * modules/reports/CONTRACT.md: a body with no collections; a platform with no hazards, whose
 * hazards section is drawn with no marks; a layout of the hazards section alone; what a section
 * keeps and drops (C-001); a report with nothing out of date, no bow-tie, no justification, no
 * residual values, and a record never reviewed (section 5, null and empty semantics); one out-of-date
 * record; and every field C-012 names, each made malformed on its own in a stored template or report
 * and in a report handed to `includesOf` and the renders, beside the well-formed edge values C-012
 * accepts. Written from the contract before any implementation (P8).
 *
 * The null double must fail this file (CORE-TST-002, rung 1): fixed data neither refuses a
 * malformed record nor draws an empty report as empty.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as reports from '../contract.js';
import { InvalidReportError, MalformedReportError, MalformedTemplateError } from '../contract.js';
import {
  EARLIER, HELD, REPORTS, TEMPLATES, actOf, alice, assertDocuments, assertProduced, assertRecorded, assertRefused, buildWorld,
  collectionOf, controlRef, createTemplate, hazardRef, htmlMarks, markdownMarks, orderedUuid, platformRef, plain, produce, rating,
  registry, reportFields, reportRow, reportTemplateId, schema, scheduled, snapshot, templateFields, templateRow, withClock, withRows,
  worldWithReport,
} from './harness.js';

// ------------------------------------------------------------------ empty bodies

test('section 4 and section 5: a body with no template or report collection reads as empty — getTemplate and getReport null, the lists and reportsIncluding empty — and createTemplate on it creates the collection', async () => {
  const body = schema.emptyDataBody();
  const before = snapshot(body);
  assert.equal(await reports.getTemplate(body, /** @type {any} */ (reportTemplateId.fresh())), null);
  assert.equal(await reports.getReport(body, /** @type {any} */ (orderedUuid(1))), null);
  assert.deepEqual([...await reports.listTemplates(body)], []);
  assert.deepEqual([...await reports.listReports(body)], []);
  for (const ref of [platformRef(orderedUuid(1)), hazardRef('H-0001'), controlRef(orderedUuid(2))]) {
    assert.deepEqual([...await reports.reportsIncluding(body, ref)], [], `C-007: ${ref.kind} in an empty body`);
  }
  assert.deepEqual(body, before, 'body unchanged');
  const { body: b, template: t } = await createTemplate(body, actOf(alice), templateFields());
  assert.deepEqual(Object.keys(collectionOf(b, TEMPLATES)), [t.id], 'the first template creates the collection');
  await assertRecorded(body, b, { act: actOf(alice), ts: HELD, record: t, collection: TEMPLATES, affected: [], what: 'createTemplate on an empty body' });
});

test('C-007: reportsIncluding a record nothing has, in a body with reports, is an empty list', async () => {
  const { body } = await worldWithReport();
  for (const ref of [platformRef(orderedUuid(5)), hazardRef('H-9999'), controlRef(orderedUuid(6)), hazardRef('not-an-id')]) {
    assert.deepEqual([...await reports.reportsIncluding(body, ref)], [], `${ref.kind} ${ref.id}`);
  }
});

// ------------------------------------------------------------------ a platform with no hazards

test('section 5: a report on a platform with no hazards and nothing scheduled has hazards, omitted, bowties, and outOfDate empty; its includes name only the platform; its hazards section is drawn with no marks inside, and no notice is drawn', async () => {
  const w = await buildWorld();
  const empty = await withClock(EARLIER, () => registry.createPlatform(w.body, actOf(alice), { name: 'Empty', ownerProfileId: alice.id }));
  const t = await createTemplate(empty.body, actOf(alice), templateFields({ sections: [{ sectionKind: 'hazards' }] }));
  const fields = await reportFields(t.body, t.template.id, empty.platform.id);
  assert.deepEqual([...await withClock(HELD, () => reports.outOfDateFor(t.body, empty.platform.id))], [], 'C-006: nothing past due');
  const { body: b, report: r } = await produce(t.body, actOf(alice, empty.platform.id), fields);
  await assertProduced(r, { input: t.body, act: actOf(alice, empty.platform.id), fields, template: t.template, ts: HELD });
  for (const list of [r.hazards, r.omitted, r.bowties, r.outOfDate]) assert.deepEqual([...list], []);
  assert.deepEqual(plain(await reports.includesOf(r)), { platformIds: [empty.platform.id], hazardIds: [], omittedHazardIds: [], controlIds: [] });
  const { htmlRoot, markdownRoot } = await assertDocuments(r);
  for (const root of [htmlRoot, markdownRoot]) {
    assert.deepEqual(root.marks.map((m) => m.type), ['header', 'section'], 'C-008: a header and the one hazards section, no notice');
    assert.deepEqual(root.marks[1].marks, [], 'section 5: the hazards section holds no mark');
  }
  assert.deepEqual((await reports.reportsIncluding(b, platformRef(empty.platform.id))).map((x) => x.id), [r.id]);
});

// ------------------------------------------------------------------ what a template keeps (C-001)

test('C-001: a template of the hazards section alone is saved; a section keeps its kind and its text trimmed and nothing else — a hazards section given text keeps none, and extra properties are dropped', async () => {
  const w = await buildWorld();
  const only = await createTemplate(w.body, actOf(alice), templateFields({ sections: [{ sectionKind: 'hazards' }] }));
  assert.deepEqual(plain(only.template.sections), [{ sectionKind: 'hazards' }]);
  const extra = await createTemplate(w.body, actOf(alice), templateFields({
    sections: /** @type {any} */ ([
      { sectionKind: 'hazards', text: 'ignored', colour: 'red' },
      { sectionKind: 'heading', text: ' Kept ', level: 2 },
      { sectionKind: 'text', text: 'a', id: 'x' },
    ]),
  }));
  assert.deepEqual(plain(extra.template.sections), [{ sectionKind: 'hazards' }, { sectionKind: 'heading', text: 'Kept' }, { sectionKind: 'text', text: 'a' }]);
  assert.deepEqual(Object.keys(plain(extra.template)).sort(), ['createdAtAest', 'createdBy', 'id', 'kind', 'name', 'sections', 'status', 'title', 'updatedAtAest', 'updatedBy'], 'section 3: a template has its header, name, title, and sections, and nothing else');
  const one = await createTemplate(w.body, actOf(alice), templateFields({ name: 'x', title: 'y' }));
  assert.equal(one.template.name, 'x', 'C-001: a one-character name');
  assert.equal(one.template.title, 'y', 'C-001: a one-character title');
});

// ------------------------------------------------------------------ null and empty values in a report

test('section 5: a hazard with no residual values draws the Uncategorised band; a control not excluded has a null justification; a record never reviewed has a null last reviewed date; one out-of-date record draws a notice of one', async () => {
  const w = await buildWorld();
  const body = await scheduled(w.body, hazardRef(w.H2), '2026-09-01');
  const t = await createTemplate(body, actOf(alice));
  const { report: r } = await produce(t.body, actOf(alice, w.P), await reportFields(t.body, t.template.id, w.P));
  assert.deepEqual(plain(r.outOfDate).map((/** @type {any} */ x) => [x.ref.kind, x.ref.id, x.lastReviewedAest, x.nextDueAest]), [['hazard', w.H2, null, '2026-09-01']]);
  const h2 = r.hazards.find((h) => h.hazardId === w.H2);
  assert.deepEqual(plain(h2?.residual), { consequence: null, likelihood: null });
  assert.equal((await rating.ratingFor(null, null)).band, 'Uncategorised', 'fixture: rating C-002');
  assert.ok(r.hazards[0].controls.every((c) => (c.state === 'excluded') === (c.justificationText !== null)), 'C-004: a justification exactly when excluded');
  const { htmlRoot } = await assertDocuments(r);
  const hazardsSection = htmlRoot.marks.find((m) => m.values.sectionKind === 'hazards');
  assert.equal(hazardsSection?.marks.find((m) => m.values.hazardId === w.H2)?.values.band, 'Uncategorised');
  assert.equal(htmlRoot.marks[1].type, 'notice');
  assert.equal(htmlRoot.marks[1].marks.length, 1);
});

test('C-008 to C-010: a report whose stored texts are single characters, punctuation only, whitespace runs, or very long draws each normalised and escaped, and the HTML title is the normalised title', async () => {
  const long = Array.from({ length: 400 }, (_, k) => `word${k}`).join(' \n ');
  const cases = [
    { title: 'x', platformName: '!', text: '\\' },
    { title: '<>&"\'', platformName: '*_`#[]{}:|~', text: '---' },
    { title: ' a \n\t b ', platformName: 'P \n  Q', text: '::: {.report-hazard data-hazard="H-0001"}' },
    { title: long, platformName: long, text: long },
  ];
  for (const c of cases) {
    const base = reportRow(orderedUuid(3, 0x3));
    const r = /** @type {any} */ ({
      ...base,
      title: c.title,
      platformName: c.platformName,
      sections: [{ sectionKind: 'heading', text: c.text }, { sectionKind: 'text', text: c.title }, { sectionKind: 'hazards' }],
      hazards: [{ ...base.hazards[0], title: c.text, controls: base.hazards[0].controls.map((x) => ({ ...x, title: c.platformName, justificationText: x.justificationText === null ? null : c.text })) }],
      outOfDate: [{ ...base.outOfDate[0], name: c.text }],
    });
    const { html, md } = await assertDocuments(r);
    assert.ok(htmlMarks(html, r).root.marks.length > 0 && markdownMarks(md).root.marks.length > 0);
  }
});

// ------------------------------------------------------------------ malformed stored records (C-012)

const BAD_DATE = '2026-09-01T08:00:00+10:00';

/** @type {Array<[string, Record<string, unknown>]>} each makes a stored template malformed on its own (C-012) */
const TEMPLATE_BREAKS = [
  ['a kind that is not report-template', { kind: 'report' }],
  ['a status that is not a RecordStatus', { status: 'archived' }],
  ['a createdBy that is not a user profile id', { createdBy: 'alice' }],
  ['an updatedBy that is not a user profile id', { updatedBy: 7 }],
  ['a createdAtAest that is not a TimestampAest', { createdAtAest: '2026-09-01' }],
  ['an updatedAtAest that is not a TimestampAest', { updatedAtAest: '2026-09-01T08:00:00Z' }],
  ['a name that is not a string', { name: 7 }],
  ['a blank name', { name: ' \n ' }],
  ['a title that is not a string', { title: null }],
  ['a blank title', { title: '' }],
  ['sections that are not a list', { sections: 'hazards' }],
  ['sections with no hazards section', { sections: [{ sectionKind: 'heading', text: 'A' }] }],
  ['sections with two hazards sections', { sections: [{ sectionKind: 'hazards' }, { sectionKind: 'hazards' }] }],
  ['a section of an unknown kind', { sections: [{ sectionKind: 'hazards' }, { sectionKind: 'chart' }] }],
  ['a blank heading', { sections: [{ sectionKind: 'hazards' }, { sectionKind: 'heading', text: '  ' }] }],
];

test('C-012: every operation\'s read of the templates rejects with MalformedTemplateError naming the key, for each field made malformed on its own, a key that differs from the id, and an id that is not a ReportTemplateId', async () => {
  const good = orderedUuid(4, 0x4);
  const cases = [
    ...TEMPLATE_BREAKS.map(([what, o]) => [what, good, templateRow(good, o)]),
    ['a key that differs from its id', good, templateRow(orderedUuid(5, 0x4))],
    ['an id that is not a uuid', 'T-1', templateRow('T-1')],
  ];
  for (const [what, key, row] of /** @type {Array<[string, string, any]>} */ (cases)) {
    const body = withRows(schema.emptyDataBody(), TEMPLATES, [[key, row]]);
    const e = await assertRefused(() => reports.listTemplates(body), MalformedTemplateError, body, `listTemplates with ${what}`);
    assert.equal(e.key, key, `${what}: the error names the key`);
    await assertRefused(() => reports.getTemplate(body, /** @type {any} */ (orderedUuid(9, 0x9))), MalformedTemplateError, body, `getTemplate of another id with ${what}`);
  }
});

test('C-012: a stored template with untrimmed texts, a retired status, and a hazards section with text is well formed: listed, read, and not refused', async () => {
  const id = orderedUuid(4, 0x4);
  const row = templateRow(id, { status: 'retired', name: ' spaced ', sections: [{ sectionKind: 'text', text: ' t ' }, { sectionKind: 'hazards', text: 'x' }] });
  const body = withRows(schema.emptyDataBody(), TEMPLATES, [row]);
  assert.deepEqual(plain(await reports.getTemplate(body, /** @type {any} */ (id))), plain(row), 'getTemplate gives a template whatever its status');
});

/**
 * Each makes a report malformed on its own (C-012). Built over `reportRow`, whose hazard H-0001
 * has two controls, a bow-tie, and whose omitted H-0002 and out-of-date record are one each.
 * @type {Array<[string, (r: any) => any]>}
 */
const REPORT_BREAKS = [
  ['a kind that is not report', (r) => ({ ...r, kind: 'report-template' })],
  ['a status that is not a RecordStatus', (r) => ({ ...r, status: 'final' })],
  ['a createdBy that is not a user profile id', (r) => ({ ...r, createdBy: 'alice' })],
  ['an updatedAtAest that is not a TimestampAest', (r) => ({ ...r, updatedAtAest: 17 })],
  ['a templateId that is not a ReportTemplateId', (r) => ({ ...r, templateId: 'template' })],
  ['a templateName that is not a string', (r) => ({ ...r, templateName: 7 })],
  ['a title that is not a string', (r) => ({ ...r, title: null })],
  ['a platformName that is not a string', (r) => ({ ...r, platformName: ['P'] })],
  ['sections C-001 would not accept', (r) => ({ ...r, sections: [{ sectionKind: 'heading', text: 'x' }] })],
  ['sections that are not a list', (r) => ({ ...r, sections: {} })],
  ['a platformId that is not a platform id', (r) => ({ ...r, platformId: 'P' })],
  ['hazards that are not a list', (r) => ({ ...r, hazards: {} })],
  ['a hazardId that is not a HazardId', (r) => ({ ...r, hazards: [{ ...r.hazards[0], hazardId: 'hazard-1' }], bowties: [] })],
  ['a hazard title that is not a string', (r) => ({ ...r, hazards: [{ ...r.hazards[0], title: 7 }] })],
  ['a hazard reportId that is not a string', (r) => ({ ...r, hazards: [{ ...r.hazards[0], reportId: null }] })],
  ['a residual consequence of 0', (r) => ({ ...r, hazards: [{ ...r.hazards[0], residual: { consequence: 0, likelihood: 'A' } }] })],
  ['a residual consequence of 6', (r) => ({ ...r, hazards: [{ ...r.hazards[0], residual: { consequence: 6, likelihood: null } }] })],
  ['a residual consequence of 2.5', (r) => ({ ...r, hazards: [{ ...r.hazards[0], residual: { consequence: 2.5, likelihood: 'A' } }] })],
  ['a residual consequence of "3"', (r) => ({ ...r, hazards: [{ ...r.hazards[0], residual: { consequence: '3', likelihood: 'A' } }] })],
  ['a residual likelihood of H', (r) => ({ ...r, hazards: [{ ...r.hazards[0], residual: { consequence: 1, likelihood: 'H' } }] })],
  ['a residual likelihood of lower-case a', (r) => ({ ...r, hazards: [{ ...r.hazards[0], residual: { consequence: null, likelihood: 'a' } }] })],
  ['a residual likelihood of 3', (r) => ({ ...r, hazards: [{ ...r.hazards[0], residual: { consequence: 1, likelihood: 3 } }] })],
  ['a control whose controlId is not a control id', (r) => ({ ...r, hazards: [{ ...r.hazards[0], controls: [{ ...r.hazards[0].controls[0], controlId: 'C1' }] }] })],
  ['a control whose title is not a string', (r) => ({ ...r, hazards: [{ ...r.hazards[0], controls: [{ ...r.hazards[0].controls[0], title: 7 }] }] })],
  ['a control whose controlKind is not a ControlKind', (r) => ({ ...r, hazards: [{ ...r.hazards[0], controls: [{ ...r.hazards[0].controls[0], controlKind: 'both' }] }] })],
  ['a control whose state is not a ControlPlatformState', (r) => ({ ...r, hazards: [{ ...r.hazards[0], controls: [{ ...r.hazards[0].controls[0], state: 'pending' }] }] })],
  ['a control whose justificationText is neither null nor a string', (r) => ({ ...r, hazards: [{ ...r.hazards[0], controls: [{ ...r.hazards[0].controls[1], justificationText: 7 }] }] })],
  ['an omitted hazardId that is not a HazardId', (r) => ({ ...r, omitted: [{ hazardId: 7, reason: 'malformed-rating' }] })],
  ['an omission reason that is not an OmissionReason', (r) => ({ ...r, omitted: [{ hazardId: 'H-0002', reason: 'deleted' }] })],
  ['a bow-tie of a hazard no entry of hazards has', (r) => ({ ...r, bowties: [{ hazardId: 'H-0002', svg: r.bowties[0].svg }] })],
  ['a bow-tie whose svg is not a string', (r) => ({ ...r, bowties: [{ hazardId: 'H-0001', svg: null }] })],
  ['two bow-ties of one hazard', (r) => ({ ...r, bowties: [r.bowties[0], r.bowties[0]] })],
  ['an out-of-date ref of a kind a report does not use', (r) => ({ ...r, outOfDate: [{ ...r.outOfDate[0], ref: { kind: 'reference-entry', id: orderedUuid(1) } }] })],
  ['an out-of-date ref whose id is not a string', (r) => ({ ...r, outOfDate: [{ ...r.outOfDate[0], ref: { kind: 'hazard', id: 1 } }] })],
  ['an out-of-date name that is not a string', (r) => ({ ...r, outOfDate: [{ ...r.outOfDate[0], name: null }] })],
  ['an out-of-date nextDueAest that is not a DateAest', (r) => ({ ...r, outOfDate: [{ ...r.outOfDate[0], nextDueAest: '2026-02-30' }] })],
  ['an out-of-date nextDueAest that is null', (r) => ({ ...r, outOfDate: [{ ...r.outOfDate[0], nextDueAest: null }] })],
  ['an out-of-date lastReviewedAest that is not a DateAest', (r) => ({ ...r, outOfDate: [{ ...r.outOfDate[0], lastReviewedAest: BAD_DATE }] })],
];

test('C-012: every operation\'s read of the reports rejects with MalformedReportError naming the key, and includesOf and both renders reject with InvalidReportError, for each field made malformed on its own; a key that differs from the id is refused in a body', async () => {
  const good = orderedUuid(6, 0x6);
  for (const [what, breakIt] of REPORT_BREAKS) {
    const row = breakIt(reportRow(good));
    const body = withRows(schema.emptyDataBody(), REPORTS, [row]);
    const e = await assertRefused(() => reports.listReports(body), MalformedReportError, body, `listReports with ${what}`);
    assert.equal(e.key, good, `${what}: the error names the key`);
    await assertRefused(() => reports.getReport(body, /** @type {any} */ (orderedUuid(9, 0x9))), MalformedReportError, body, `getReport of another id with ${what}`);
    for (const [name, call] of /** @type {Array<[string, (r: any) => Promise<unknown>]>} */ ([
      ['includesOf', reports.includesOf], ['renderReportHtml', reports.renderReportHtml], ['renderReportMarkdown', reports.renderReportMarkdown],
    ])) {
      await assertRefused(() => call(row), InvalidReportError, null, `${name} of a report with ${what}`);
    }
  }
  const moved = withRows(schema.emptyDataBody(), REPORTS, [[orderedUuid(7, 0x6), reportRow(good)]]);
  const e = await assertRefused(() => reports.listReports(moved), MalformedReportError, moved, 'a key that differs from the id');
  assert.equal(e.key, orderedUuid(7, 0x6));
});

test('C-012: a report with empty lists, untrimmed and empty stored strings, a retired status, both residual values null, and a justification on a control that is not excluded is well formed: listed, included, and drawn', async () => {
  const id = orderedUuid(8, 0x8);
  const base = reportRow(id);
  /** @type {any[]} */
  const rows = [
    { ...base, hazards: [], omitted: [], bowties: [], outOfDate: [] },
    { ...base, templateName: '', platformName: '  ', title: ' t ' },
    { ...base, status: 'retired' },
    { ...base, hazards: [{ ...base.hazards[0], title: '', reportId: '', residual: { consequence: null, likelihood: null } }] },
    { ...base, hazards: [{ ...base.hazards[0], controls: [{ ...base.hazards[0].controls[0], justificationText: 'a note' }] }] },
    { ...base, outOfDate: [{ ...base.outOfDate[0], lastReviewedAest: '2026-01-31' }, { ref: { kind: 'platform', id: 'any string' }, name: '', nextDueAest: '2026-02-28', lastReviewedAest: null }] },
  ];
  for (const row of rows) {
    const body = withRows(schema.emptyDataBody(), REPORTS, [row]);
    assert.deepEqual(plain(await reports.getReport(body, /** @type {any} */ (id))), plain(row), 'getReport gives the stored report');
    await reports.listReports(body);
    await reports.includesOf(row);
    await assertDocuments(row);
  }
});

test('C-007: includesOf names a control carried by two hazards once, at the place it is first met', async () => {
  const base = reportRow(orderedUuid(2, 0x2));
  const [c1, c2] = base.hazards[0].controls;
  const r = /** @type {any} */ ({
    ...base,
    hazards: [
      { ...base.hazards[0], controls: [c2] },
      { ...base.hazards[0], hazardId: 'H-0003', controls: [c1, c2] },
    ],
    bowties: [],
  });
  assert.deepEqual(plain(await reports.includesOf(r)), {
    platformIds: [base.platformId], hazardIds: ['H-0001', 'H-0003'], omittedHazardIds: ['H-0002'], controlIds: [c2.controlId, c1.controlId],
  });
});

test('C-011: a template is recorded as reaching no platform, whatever platform the act was made for', async () => {
  const w = await buildWorld();
  const act = actOf(alice, w.P);
  const { body: b, template: t } = await createTemplate(w.body, act, templateFields(), EARLIER);
  await assertRecorded(w.body, b, { act, ts: EARLIER, record: t, collection: TEMPLATES, affected: [], what: 'a template made on P' });
});
