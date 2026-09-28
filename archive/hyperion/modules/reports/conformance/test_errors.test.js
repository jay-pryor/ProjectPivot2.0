/**
 * reports conformance: errors (CORE-CON-002). Every condition in section 4 of
 * modules/reports/CONTRACT.md: the malformed collections every body-taking operation refuses
 * (C-012); the act and the template fields refused (C-001); an unknown or not-live template; the
 * platform refusals and the errors of `registry`, `review-schedule`, `bowtie`, and `change-log`
 * passed on unchanged, compared with the owning module's own rejection on the same body; the
 * bow-tie list refused (C-005); the out-of-date list not acknowledged (C-006); an unincludable
 * kind (C-007); a value that is not a report given to `includesOf` or a render (C-012); section
 * 4's precedence when two conditions hold at once; and the body deep-equal to what it was
 * afterwards (C-003). Written from the contract before any implementation (P8).
 *
 * The null double must fail this file (CORE-TST-002, rung 1): an implementation that enforces
 * nothing resolves where every test below expects a rejection.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as reports from '../contract.js';
import {
  DuplicateBowtieError, HazardNotInReportError, InvalidActError, InvalidReportError, InvalidSectionError, InvalidTemplateNameError,
  InvalidTemplateTitleError, MalformedReportError, MalformedTemplateError, MissingProfileError, OutOfDateNotAcknowledgedError,
  TemplateNotLiveError, UnincludableKindError, UnknownTemplateError,
} from '../contract.js';
import {
  HELD, REPORTS, TEMPLATES, actOf, alice, assertRefused, assertSameError, bowtie, buildWorld, changeLog, controlRef, createTemplate,
  expectedOutOfDate, hazardRef, keyWhere, orderedUuid, platformId, platformRef, plain, produce, registry, rejectionOf,
  reportRow, reportTemplateId, rs, scheduled, scheduledWorld, snapshot, spoil, templateFields, templateRow, withClock, withOmittedHazard,
  withRows, withUnreadableLog, withUnreadableSchedules, worldWithReport,
} from './harness.js';

/** A body holding one malformed template (a blank name) and one malformed report (a platform id that is not one). */
async function malformedBodies() {
  const { w, body, fields, template } = await worldWithReport();
  const badTemplate = withRows(body, TEMPLATES, [templateRow(orderedUuid(9, 0x1), { name: '   ' })]);
  const badReport = withRows(body, REPORTS, [reportRow(orderedUuid(9, 0x2), { platformId: 'not-a-platform' })]);
  return { w, body, fields, template, badTemplate, badReport, badTemplateKey: orderedUuid(9, 0x1), badReportKey: orderedUuid(9, 0x2) };
}

/**
 * Every operation that takes a body, called on `body`, for the malformed rows of section 4.
 * @param {any} f
 * @returns {Array<[string, (body: any) => Promise<unknown>]>}
 */
function bodyOperations(f) {
  return [
    ['createTemplate', (b) => createTemplate(b, actOf(alice), templateFields())],
    ['getTemplate', (b) => reports.getTemplate(b, f.template.id)],
    ['listTemplates', (b) => reports.listTemplates(b)],
    ['outOfDateFor', (b) => withClock(HELD, () => reports.outOfDateFor(b, f.w.P))],
    ['produceReport', (b) => produce(b, actOf(alice, f.w.P), f.fields)],
    ['getReport', (b) => reports.getReport(b, /** @type {any} */ (orderedUuid(1, 0x3)))],
    ['listReports', (b) => reports.listReports(b)],
    ['reportsIncluding', (b) => reports.reportsIncluding(b, hazardRef(f.w.H1))],
  ];
}

// ------------------------------------------------------------------ malformed collections (C-012)

test('section 4 rows 1 and 2: every operation taking a body rejects with MalformedTemplateError naming the key of a malformed template, and with MalformedReportError naming the key of a malformed report; nothing returned; body unchanged (C-012)', async () => {
  const f = await malformedBodies();
  for (const [name, call] of bodyOperations(f)) {
    const e1 = await assertRefused(() => call(f.badTemplate), MalformedTemplateError, f.badTemplate, `${name} with a malformed template`);
    assert.equal(e1.key, f.badTemplateKey, `${name}: the error names the entry's key`);
    assert.ok(typeof e1.detail === 'string' && e1.detail.trim() !== '', `${name}: the error names the field in a sentence`);
    const e2 = await assertRefused(() => call(f.badReport), MalformedReportError, f.badReport, `${name} with a malformed report`);
    assert.equal(e2.key, f.badReportKey, `${name}: the error names the entry's key`);
    assert.ok(typeof e2.detail === 'string' && e2.detail.trim() !== '', `${name}: the error names the field in a sentence`);
  }
});

test('precedence: a malformed template is signalled before a malformed report, and a malformed report before a missing profile (section 4)', async () => {
  const f = await malformedBodies();
  const both = withRows(f.badTemplate, REPORTS, [reportRow(orderedUuid(9, 0x2), { platformId: 'not-a-platform' })]);
  for (const [name, call] of bodyOperations(f)) {
    await assertRefused(() => call(both), MalformedTemplateError, both, `${name} with a malformed template and report`);
  }
  await assertRefused(() => withClock(HELD, () => reports.produceReport(f.badReport, /** @type {any} */ ({ madeForPlatformId: null }), f.fields)), MalformedReportError, f.badReport, 'produceReport with a malformed report and no profile');
  await assertRefused(() => withClock(HELD, () => reports.createTemplate(f.badReport, /** @type {any} */ (undefined), templateFields())), MalformedReportError, f.badReport, 'createTemplate with a malformed report and no act');
});

// ------------------------------------------------------------------ the act (C-011, DEC-016)

test('section 4 row 3: createTemplate and produceReport with no act, no profile, or a profile whose id is not a user profile id reject with MissingProfileError; body unchanged', async () => {
  const { w, withTemplate, fields } = await worldWithReport();
  const acts = [
    ['no act', undefined],
    ['null act', null],
    ['no profile', { madeForPlatformId: null }],
    ['a null profile', { profile: null, madeForPlatformId: null }],
    ['a profile with no id', { profile: { name: 'Alice' }, madeForPlatformId: null }],
    ['a profile id that is not a uuid', { profile: { id: 'alice', name: 'Alice' }, madeForPlatformId: null }],
  ];
  for (const [what, act] of acts) {
    await assertRefused(() => createTemplate(withTemplate, /** @type {any} */ (act)), MissingProfileError, withTemplate, `createTemplate with ${what}`);
    await assertRefused(() => produce(withTemplate, /** @type {any} */ (act), fields), MissingProfileError, withTemplate, `produceReport with ${what}`);
  }
  assert.ok(w);
});

test('section 4 row 4: createTemplate and produceReport with madeForPlatformId absent or neither null nor a platform id reject with InvalidActError naming the value; body unchanged; a missing profile is signalled first', async () => {
  const { withTemplate, fields } = await worldWithReport();
  for (const [what, act, given] of /** @type {Array<[string, any, unknown]>} */ ([
    ['absent', { profile: alice }, undefined],
    ['a string that is not a platform id', { profile: alice, madeForPlatformId: 'P' }, 'P'],
    ['a number', { profile: alice, madeForPlatformId: 7 }, 7],
  ])) {
    const e1 = await assertRefused(() => createTemplate(withTemplate, act), InvalidActError, withTemplate, `createTemplate with madeForPlatformId ${what}`);
    assert.equal(e1.given, given, 'the error names the value');
    const e2 = await assertRefused(() => produce(withTemplate, act, fields), InvalidActError, withTemplate, `produceReport with madeForPlatformId ${what}`);
    assert.equal(e2.given, given, 'the error names the value');
  }
  await assertRefused(() => createTemplate(withTemplate, /** @type {any} */ ({ profile: { id: 'x' } })), MissingProfileError, withTemplate, 'a bad profile and an absent madeForPlatformId');
});

// ------------------------------------------------------------------ template fields (C-001)

test('section 4 rows 5 and 6: createTemplate with a name or a title that is not a string or is blank rejects with InvalidTemplateNameError or InvalidTemplateTitleError naming the value; body unchanged; the act is checked first, then the name, then the title', async () => {
  const w = await buildWorld();
  for (const bad of ['', '   ', '\n\t', 7, null, undefined, ['x']]) {
    const e1 = await assertRefused(() => createTemplate(w.body, actOf(alice), templateFields({ name: /** @type {any} */ (bad) })), InvalidTemplateNameError, w.body, `name ${JSON.stringify(bad)}`);
    assert.deepEqual(e1.given, bad, 'the error names the value');
    const e2 = await assertRefused(() => createTemplate(w.body, actOf(alice), templateFields({ title: /** @type {any} */ (bad) })), InvalidTemplateTitleError, w.body, `title ${JSON.stringify(bad)}`);
    assert.deepEqual(e2.given, bad, 'the error names the value');
  }
  const allBad = templateFields({ name: ' ', title: ' ', sections: /** @type {any} */ ('x') });
  await assertRefused(() => createTemplate(w.body, actOf(alice), allBad), InvalidTemplateNameError, w.body, 'name, title, and sections all bad');
  await assertRefused(() => createTemplate(w.body, actOf(alice), templateFields({ title: ' ', sections: /** @type {any} */ ('x') })), InvalidTemplateTitleError, w.body, 'title and sections bad');
  await assertRefused(() => createTemplate(w.body, /** @type {any} */ ({ profile: alice, madeForPlatformId: 'x' }), allBad), InvalidActError, w.body, 'an ill-formed act and bad fields');
});

test('section 4 row 7: createTemplate with sections not a list, a section of an unknown kind, a blank heading or paragraph, or no hazards section or two, rejects with InvalidSectionError naming the first failing field in list order, or sections for the count; body unchanged; nothing saved (C-001)', async () => {
  const w = await buildWorld();
  const H = { sectionKind: 'hazards' };
  /** @type {Array<[string, unknown, string | null]>} */
  const cases = [
    ['not a list', 'heading', 'sections'],
    ['null', null, 'sections'],
    ['an object', { 0: H }, 'sections'],
    ['empty', [], 'sections'],
    ['no hazards section', [{ sectionKind: 'heading', text: 'A' }], 'sections'],
    ['two hazards sections', [H, { sectionKind: 'text', text: 'between' }, H], 'sections'],
    ['an unknown kind', [H, { sectionKind: 'table', text: 'x' }], 'sections[1].sectionKind'],
    ['no kind', [{ text: 'x' }, H], 'sections[0].sectionKind'],
    ['a blank heading', [{ sectionKind: 'heading', text: '  ' }, H], 'sections[0].text'],
    ['a blank paragraph', [H, { sectionKind: 'text', text: '\n' }], 'sections[1].text'],
    ['a heading with no text', [H, { sectionKind: 'heading' }], 'sections[1].text'],
    ['a paragraph whose text is a number', [{ sectionKind: 'text', text: 3 }, H], 'sections[0].text'],
    ['a section that is not an object', [H, 'heading'], null],
    ['the first of two failing fields', [{ sectionKind: 'text', text: '' }, { sectionKind: 'bogus' }, H], 'sections[0].text'],
  ];
  for (const [what, sections, field] of cases) {
    const e = await assertRefused(() => createTemplate(w.body, actOf(alice), templateFields({ sections: /** @type {any} */ (sections) })), InvalidSectionError, w.body, `sections ${what}`);
    if (field !== null) assert.equal(e.field, field, `sections ${what}: the error names ${field}`);
  }
  assert.deepEqual([...await reports.listTemplates(w.body)], [], 'nothing saved');
});

// ------------------------------------------------------------------ the template of a report (C-002, C-003)

test('section 4 rows 8 and 9: produceReport of a template id nothing has rejects with UnknownTemplateError naming it, and of a template that is not live with TemplateNotLiveError carrying the id and status; body unchanged; an unknown template before an unknown platform', async () => {
  const { w, withTemplate, fields } = await worldWithReport();
  for (const id of [reportTemplateId.fresh(), 'not-an-id', undefined]) {
    const e = await assertRefused(() => produce(withTemplate, actOf(alice, w.P), /** @type {any} */ ({ ...fields, templateId: id })), UnknownTemplateError, withTemplate, `template ${id}`);
    assert.equal(e.id, id, 'the error names the value');
  }
  const retiredId = orderedUuid(7, 0x7);
  for (const status of ['retired', 'deleted']) {
    const body = withRows(withTemplate, TEMPLATES, [templateRow(retiredId, { status })]);
    const e = await assertRefused(() => produce(body, actOf(alice, w.P), /** @type {any} */ ({ ...fields, templateId: retiredId })), TemplateNotLiveError, body, `a ${status} template`);
    assert.equal(e.id, retiredId);
    assert.equal(e.status, status);
    await assertRefused(() => produce(body, actOf(alice, w.P), /** @type {any} */ ({ ...fields, templateId: retiredId, platformId: platformId.fresh() })), TemplateNotLiveError, body, `a ${status} template on an unknown platform`);
  }
  await assertRefused(() => produce(withTemplate, actOf(alice, w.P), /** @type {any} */ ({ ...fields, templateId: reportTemplateId.fresh(), platformId: platformId.fresh() })), UnknownTemplateError, withTemplate, 'an unknown template on an unknown platform');
});

// ------------------------------------------------------------------ the platform (section 4 rows 10 to 12)

test('section 4 row 10: outOfDateFor and produceReport on a platform id nothing has reject with registry\'s UnknownPlatformError as listPlatformHazards rejects; body unchanged', async () => {
  const { withTemplate, fields } = await worldWithReport();
  for (const id of [platformId.fresh(), 'not-a-platform']) {
    const expected = await rejectionOf(() => registry.listPlatformHazards(withTemplate, /** @type {any} */ (id)), 'fixture: registry');
    assert.ok(expected instanceof registry.UnknownPlatformError, 'fixture: registry names the platform unknown');
    const before = snapshot(withTemplate);
    assertSameError(await rejectionOf(() => withClock(HELD, () => reports.outOfDateFor(withTemplate, /** @type {any} */ (id)))), expected, `outOfDateFor ${id}`);
    assertSameError(await rejectionOf(() => produce(withTemplate, actOf(alice), /** @type {any} */ ({ ...fields, platformId: id }))), expected, `produceReport on ${id}`);
    assert.deepEqual(withTemplate, before, 'body unchanged');
  }
});

test('section 4 row 11: outOfDateFor and produceReport on a retired platform reject with registry\'s PlatformNotLiveError carrying the id and the status; body unchanged (C-003)', async () => {
  const { w, withTemplate, fields } = await worldWithReport();
  const body = (await withClock(HELD, () => registry.retirePlatform(withTemplate, actOf(alice), w.Q))).body;
  const e1 = await assertRefused(() => withClock(HELD, () => reports.outOfDateFor(body, /** @type {any} */ (w.Q))), registry.PlatformNotLiveError, body, 'outOfDateFor a retired platform');
  assert.equal(e1.id, w.Q);
  assert.equal(e1.status, 'retired');
  const e2 = await assertRefused(() => produce(body, actOf(alice), /** @type {any} */ ({ ...fields, platformId: w.Q, acknowledgedOutOfDate: [] })), registry.PlatformNotLiveError, body, 'produceReport on a retired platform');
  assert.equal(e2.id, w.Q);
  assert.equal(e2.status, 'retired');
});

test('section 4 row 12: when registry.listPlatformHazards rejects for a malformed hazard, link, or platform, outOfDateFor and produceReport reject with that error unchanged, before a platform that is not live; body unchanged', async () => {
  const { w, withTemplate, fields } = await worldWithReport();
  const linkKey = keyWhere(withTemplate, 'link', (l) => l.linkKind === 'hazard-platform' && l.hazardId === w.H2 && l.platformId === w.P);
  const retired = (await withClock(HELD, () => registry.retirePlatform(withTemplate, actOf(alice), w.P))).body;
  const cases = [
    ['a malformed hazard', spoil(withTemplate, 'hazard', w.H2, (h) => ({ ...h, status: 'gone' }))],
    ['a malformed link', spoil(withTemplate, 'link', linkKey, (l) => ({ ...l, linkKind: 'nope' }))],
    ['a malformed platform', spoil(withTemplate, 'platform', w.P, (p) => ({ ...p, name: 7 }))],
    ['a malformed hazard on a retired platform', spoil(retired, 'hazard', w.H2, (h) => ({ ...h, status: 'gone' }))],
  ];
  for (const [what, body] of /** @type {Array<[string, any]>} */ (cases)) {
    const expected = await rejectionOf(() => registry.listPlatformHazards(body, w.P), `fixture: registry with ${what}`);
    assert.ok(expected instanceof registry.MalformedRecordError, `fixture: registry refuses ${what}`);
    const before = snapshot(body);
    assertSameError(await rejectionOf(() => withClock(HELD, () => reports.outOfDateFor(body, /** @type {any} */ (w.P)))), expected, `outOfDateFor with ${what}`);
    assertSameError(await rejectionOf(() => produce(body, actOf(alice), fields)), expected, `produceReport with ${what}`);
    assert.deepEqual(body, before, 'body unchanged');
  }
});

// ------------------------------------------------------------------ the schedules (section 4 row 13; HZ-009)

test('section 4 row 13: when review-schedule.listOverdue rejects, outOfDateFor and produceReport reject with that error unchanged and never as though nothing were past due; after a platform that is not live; body unchanged (HZ-009)', async () => {
  const { w, withTemplate, fields } = await worldWithReport();
  const scheduled_ = await scheduled(withTemplate, hazardRef(w.H1), '2026-12-01');
  const body = withUnreadableSchedules(scheduled_);
  const expected = await rejectionOf(() => withClock(HELD, () => rs.listOverdue(body)), 'fixture: review-schedule');
  assert.ok(expected instanceof rs.MalformedScheduleError, 'fixture: review-schedule refuses the body');
  const before = snapshot(body);
  assertSameError(await rejectionOf(() => withClock(HELD, () => reports.outOfDateFor(body, /** @type {any} */ (w.P)))), expected, 'outOfDateFor');
  for (const acknowledged of [[], [{ kind: 'hazard', id: w.H1 }]]) {
    assertSameError(await rejectionOf(() => produce(body, actOf(alice), /** @type {any} */ ({ ...fields, acknowledgedOutOfDate: acknowledged }))), expected, `produceReport acknowledging ${acknowledged.length}`);
  }
  assert.deepEqual(body, before, 'body unchanged');
  const retired = withUnreadableSchedules((await withClock(HELD, () => registry.retirePlatform(scheduled_, actOf(alice), w.P))).body);
  await assertRefused(() => produce(retired, actOf(alice), fields), registry.PlatformNotLiveError, retired, 'a retired platform and unreadable schedules');
  await assertRefused(() => produce(body, actOf(alice), /** @type {any} */ ({ ...fields, bowtieHazardIds: [w.H4] })), rs.MalformedScheduleError, body, 'unreadable schedules and a bow-tie hazard not in the report');
});

// ------------------------------------------------------------------ bow-ties (C-005)

test('section 4 row 14: produceReport with bowtieHazardIds not a list, or naming a hazard that is not a row — on another platform only, on no platform, unknown, or omitted — rejects with HazardNotInReportError carrying the value and the platform; body unchanged', async () => {
  const { w, withTemplate, fields } = await worldWithReport();
  const omittedBody = withOmittedHazard(withTemplate, w.H3);
  const q = await registry.listPlatformHazards(omittedBody, w.P);
  assert.deepEqual(q.omitted.map((o) => o.id), [w.H3], 'fixture: H3 is omitted');
  /** @type {Array<[string, any, unknown, any]>} */
  const cases = [
    ['not a list', withTemplate, w.H1, w.H1],
    ['null', withTemplate, null, null],
    ['a hazard on another platform only', withTemplate, [w.H1, w.H4], w.H4],
    ['a hazard on no platform', withTemplate, [w.H5], w.H5],
    ['a hazard id nothing has', withTemplate, ['H-9999'], 'H-9999'],
    ['an omitted hazard', omittedBody, [w.H3], w.H3],
  ];
  for (const [what, body, ids, value] of cases) {
    const e = await assertRefused(() => produce(body, actOf(alice), { ...fields, bowtieHazardIds: ids }), HazardNotInReportError, body, `bowtieHazardIds ${what}`);
    assert.deepEqual(e.hazardId, value, `${what}: the error carries the value`);
    assert.equal(e.platformId, w.P, `${what}: the error carries the platform`);
  }
});

test('section 4 row 15: produceReport naming one hazard twice rejects with DuplicateBowtieError carrying the id; a hazard not in the report is signalled first, and a duplicate before an out-of-date list not acknowledged', async () => {
  const { w, withTemplate, fields } = await worldWithReport();
  const e = await assertRefused(() => produce(withTemplate, actOf(alice), { ...fields, bowtieHazardIds: /** @type {any} */ ([w.H1, w.H2, w.H1]) }), DuplicateBowtieError, withTemplate, 'H1 twice');
  assert.equal(e.hazardId, w.H1);
  await assertRefused(() => produce(withTemplate, actOf(alice), { ...fields, bowtieHazardIds: /** @type {any} */ ([w.H1, w.H1, w.H4]) }), HazardNotInReportError, withTemplate, 'a duplicate, then a hazard not in the report');
  const stale = await scheduled(withTemplate, platformRef(w.P), '2026-09-01');
  await assertRefused(() => produce(stale, actOf(alice), { ...fields, bowtieHazardIds: /** @type {any} */ ([w.H2, w.H2]), acknowledgedOutOfDate: [] }), DuplicateBowtieError, stale, 'a duplicate and an unacknowledged list');
});

test('section 4 row 17: when bowtie rejects for a hazard asked for — a malformed causal factor registry.getHazardDetail refuses — produceReport rejects with that error unchanged and no report; the same body produces when no bow-tie is asked for; after an unacknowledged list, before a change-log that cannot be read (C-005)', async () => {
  const { w, withTemplate, fields } = await worldWithReport();
  const cf = keyWhere(withTemplate, 'causal-factor', (c) => c.hazardId === w.H2);
  const body = spoil(withTemplate, 'causal-factor', cf, (c) => ({ ...c, text: 7 }));
  const expected = await rejectionOf(() => bowtie.bowtieFor(body, /** @type {any} */ (w.H2), /** @type {any} */ (w.P)), 'fixture: bowtie');
  const before = snapshot(body);
  assertSameError(await rejectionOf(() => produce(body, actOf(alice), { ...fields, bowtieHazardIds: /** @type {any} */ ([w.H1, w.H2]) })), expected, 'a bow-tie bowtie refuses');
  assert.deepEqual(body, before, 'body unchanged');
  // registry C-008 refuses the whole causal-factor collection to getHazardDetail, so every bow-tie of this body is refused; no read of the produce path touches that collection (registry section 6)
  const ok = await produce(body, actOf(alice), { ...fields, bowtieHazardIds: [] });
  assert.deepEqual([...ok.report.bowties], [], 'the report is produced when no bow-tie is asked for');
  assert.deepEqual(ok.report.hazards.map((h) => h.hazardId), [w.H1, w.H2, w.H3], 'the hazard whose bow-tie is refused is still a row');
  const unreadableLog = withUnreadableLog(body);
  assertSameError(await rejectionOf(() => produce(unreadableLog, actOf(alice), { ...fields, bowtieHazardIds: /** @type {any} */ ([w.H2]) })), expected, 'a refused bow-tie and an unreadable log');
  const stale = await scheduled(body, hazardRef(w.H1), '2026-09-02');
  await assertRefused(() => produce(stale, actOf(alice), { ...fields, bowtieHazardIds: /** @type {any} */ ([w.H2]), acknowledgedOutOfDate: [] }), OutOfDateNotAcknowledgedError, stale, 'an unacknowledged list and a refused bow-tie');
});

// ------------------------------------------------------------------ out of date not acknowledged (C-006; HZ-009)

test('section 4 row 16: produceReport rejects with OutOfDateNotAcknowledgedError, carrying the list as it is and the value given, when acknowledgedOutOfDate is empty, missing a record, in another order, has one more, names another id, or is not a list; no report; body unchanged (C-006; REQ-016; HZ-009)', async () => {
  const w = await buildWorld();
  const scheduledBody = await scheduledWorld(w);
  const t = await createTemplate(scheduledBody, actOf(alice));
  const body = t.body;
  const list = await expectedOutOfDate(body, w.P, HELD);
  assert.ok(list.length >= 3, 'fixture: several records are past due');
  const refs = list.map((x) => ({ kind: x.ref.kind, id: x.ref.id }));
  const base = { templateId: t.template.id, platformId: w.P, bowtieHazardIds: [] };
  // records sharing a due date are ordered by schedule id, which a test must not assume (DEC-005), so the kind is changed on a ref that is a hazard wherever it falls
  const k = refs.findIndex((x) => x.kind === 'hazard');
  assert.ok(k >= 0, 'fixture: a hazard is past due');
  /** @type {Array<[string, unknown]>} */
  const cases = [
    ['empty', []],
    ['missing the last', refs.slice(0, -1)],
    ['missing the first', refs.slice(1)],
    ['reversed', [...refs].reverse()],
    ['with one more', [...refs, { kind: 'hazard', id: w.H4 }]],
    ['with the same id under another kind', refs.map((x, i) => (i === k ? { kind: 'control', id: x.id } : x))],
    ['with one repeated', [...refs, refs[0]]],
    ['not a list', refs[0]],
    ['undefined', undefined],
    ['null', null],
  ];
  for (const [what, acknowledged] of cases) {
    const e = await assertRefused(() => produce(body, actOf(alice), /** @type {any} */ ({ ...base, acknowledgedOutOfDate: acknowledged })), OutOfDateNotAcknowledgedError, body, `acknowledged ${what}`);
    assert.deepEqual(plain(e.outOfDate), plain(list), `${what}: the error carries the list as it now is`);
    assert.deepEqual(e.given, acknowledged, `${what}: the error carries the value given`);
  }
  assert.deepEqual([...await reports.listReports(body)], [], 'no report');
});

test('section 4 row 16: a list shown and then changed — a due date crossed at midnight, a schedule set, a hazard linked — is refused with the list as it now is, and the fresh list is accepted (C-006; HZ-009)', async () => {
  const w = await buildWorld();
  const t = await createTemplate(await scheduled(w.body, hazardRef(w.H1), '2026-09-15'), actOf(alice));
  const lateOn15 = /** @type {any} */ ('2026-09-15T23:59:59+10:00');
  const earlyOn16 = /** @type {any} */ ('2026-09-16T00:00:00+10:00');
  const shown = await withClock(lateOn15, () => reports.outOfDateFor(t.body, /** @type {any} */ (w.P)));
  assert.deepEqual([...shown], [], 'C-006: on its due date a record is not out of date');
  const fields = /** @type {any} */ ({ templateId: t.template.id, platformId: w.P, bowtieHazardIds: [], acknowledgedOutOfDate: [] });
  const e1 = await assertRefused(() => produce(t.body, actOf(alice), fields, earlyOn16), OutOfDateNotAcknowledgedError, t.body, 'the due date crossed at midnight');
  assert.deepEqual(e1.outOfDate.map((/** @type {any} */ x) => x.ref.id), [w.H1], 'the error carries H1, now past due');
  const fresh = e1.outOfDate.map((/** @type {any} */ x) => ({ kind: x.ref.kind, id: x.ref.id }));
  const ok = await produce(t.body, actOf(alice), { ...fields, acknowledgedOutOfDate: fresh }, earlyOn16);
  assert.deepEqual(plain(ok.report.outOfDate), plain(e1.outOfDate), 'the fresh list is accepted and carried');

  const setSince = await scheduled(t.body, controlRef(w.C), '2026-09-01');
  const e2 = await assertRefused(() => produce(setSince, actOf(alice), { ...fields, acknowledgedOutOfDate: fresh }, earlyOn16), OutOfDateNotAcknowledgedError, setSince, 'a schedule set since the list was shown');
  assert.deepEqual(e2.outOfDate.map((/** @type {any} */ x) => x.ref.id).sort(), [w.C, w.H1].sort());

  const h5Scheduled = await scheduled(t.body, hazardRef(w.H5), '2026-09-01');
  const shownBeforeLink = await withClock(earlyOn16, () => reports.outOfDateFor(h5Scheduled, /** @type {any} */ (w.P)));
  const linked = (await withClock(HELD, () => registry.linkHazardToPlatform(h5Scheduled, actOf(alice), { hazardId: w.H5, platformId: w.P }))).body;
  const e3 = await assertRefused(() => produce(linked, actOf(alice), { ...fields, acknowledgedOutOfDate: shownBeforeLink.map((x) => ({ kind: x.ref.kind, id: x.ref.id })) }, earlyOn16), OutOfDateNotAcknowledgedError, linked, 'a hazard linked since the list was shown');
  assert.ok(e3.outOfDate.some((/** @type {any} */ x) => x.ref.id === w.H5), 'the list now names H5');
});

// ------------------------------------------------------------------ change-log (C-011)

test('section 4 row 18: when change-log.recordChange rejects for an entry it cannot read, createTemplate and produceReport reject with that MalformedEntryError; nothing written; body unchanged; it is signalled last', async () => {
  const { w, withTemplate, fields } = await worldWithReport();
  const body = withUnreadableLog(withTemplate);
  const expected = await rejectionOf(() => changeLog.listEntries(body), 'fixture: change-log');
  assert.ok(expected instanceof changeLog.MalformedEntryError, 'fixture: change-log refuses the body');
  const e1 = await assertRefused(() => createTemplate(body, actOf(alice)), changeLog.MalformedEntryError, body, 'createTemplate');
  assert.equal(e1.key, expected.key);
  const e2 = await assertRefused(() => produce(body, actOf(alice, w.P), fields), changeLog.MalformedEntryError, body, 'produceReport');
  assert.equal(e2.key, expected.key);
  await assertRefused(() => createTemplate(body, actOf(alice), templateFields({ name: '' })), InvalidTemplateNameError, body, 'a blank name and an unreadable log');
  await assertRefused(() => produce(body, actOf(alice), { ...fields, acknowledgedOutOfDate: /** @type {any} */ ([{ kind: 'hazard', id: w.H1 }]) }), OutOfDateNotAcknowledgedError, body, 'an unacknowledged list and an unreadable log');
});

// ------------------------------------------------------------------ reads of a report (C-007, C-012)

test('section 4 row 19: reportsIncluding with a ref that is not an object, or of a kind a report does not include, rejects with UnincludableKindError naming the kind; body unchanged', async () => {
  const { body, w } = await worldWithReport();
  for (const [ref, kind] of /** @type {Array<[unknown, unknown]>} */ ([
    [null, undefined], [undefined, undefined], ['hazard', undefined], [{ id: w.H1 }, undefined],
    [{ kind: 'report', id: 'x' }, 'report'], [{ kind: 'reference-entry', id: orderedUuid(1) }, 'reference-entry'],
    [{ kind: 'causal-factor', id: orderedUuid(1) }, 'causal-factor'], [{ kind: 'link', id: orderedUuid(1) }, 'link'], [{ kind: 'Hazard', id: w.H1 }, 'Hazard'],
  ])) {
    const e = await assertRefused(() => reports.reportsIncluding(body, /** @type {any} */ (ref)), UnincludableKindError, body, `ref ${JSON.stringify(ref)}`);
    if (kind !== undefined) assert.equal(e.kind, kind, 'the error names the kind');
  }
});

test('section 4 row 20: includesOf, renderReportHtml, and renderReportMarkdown given a value that is not a well-formed report reject with InvalidReportError naming a field; a residual out of scale is refused here, not passed to rating (C-012)', async () => {
  const ok = reportRow(orderedUuid(1, 0x9));
  /** @type {Array<[string, unknown]>} */
  const bad = [
    ['null', null],
    ['a string', 'report'],
    ['a report with no hazards field', { ...ok, hazards: undefined }],
    ['a residual consequence of 9', { ...ok, hazards: [{ ...ok.hazards[0], residual: { consequence: 9, likelihood: 'A' } }] }],
    ['a residual likelihood of H', { ...ok, hazards: [{ ...ok.hazards[0], residual: { consequence: 1, likelihood: 'H' } }] }],
    ['the kind of a template', { ...ok, kind: 'report-template' }],
  ];
  for (const [what, value] of bad) {
    for (const [name, call] of /** @type {Array<[string, (r: any) => Promise<unknown>]>} */ ([
      ['includesOf', reports.includesOf], ['renderReportHtml', reports.renderReportHtml], ['renderReportMarkdown', reports.renderReportMarkdown],
    ])) {
      const e = await assertRefused(() => call(value), InvalidReportError, null, `${name} of ${what}`);
      assert.ok(typeof e.field === 'string' && e.field !== '', `${name} of ${what}: the error names a field`);
    }
  }
});
