/**
 * Test support for the reports conformance suite (CORE-CON-002). Not a test file: the runner
 * collects `*.test.js` only.
 *
 * Section 2 of modules/reports/CONTRACT.md: a conformance test builds a body through `registry`'s
 * changing operations from `schema.emptyDataBody()`, sets schedules through
 * `review-schedule.setSchedule`, holds the baseline clock either side of a due date, and compares
 * what a report holds against `registry.listPlatformHazards`, `review-schedule.listOverdue`, and
 * `bowtie.renderBowtieSvg` on the same body; it needs no folder and no browser, and reads a
 * document through the syntax C-009 and C-010 restrict it to, so no HTML, XML, or Markdown library
 * is needed (IMP-06). So this file imports only what modules/reports/manifest.yaml declares
 * (CORE-CON-003, `declared`): baseline/types, baseline/schema, baseline/clock, and the registry,
 * rating, review-schedule, bowtie, and change-log contracts.
 *
 * Provides: profiles, acts, and held times; a world of two platforms, five hazards, and four
 * controls in every state, built through `registry`; schedules set through `review-schedule`;
 * templates and reports built directly, for malformed records (C-012) and for documents drawn from
 * a report alone (C-008); what C-004 and C-006 say a report holds, read from the contracts that own
 * it on the same body; the C-011 check that an act wrote its record's one entry; a reader for each
 * document syntax that yields one mark model, and the C-008 check over it; the "body is a value"
 * helpers of C-003; a seeded generator (CORE-TST-001: the seed is fixed and recorded); and spies on
 * the browser's storage, the document, and the clock.
 */

import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

import { fixClock, releaseClock } from '../../../baseline/clock.js';
import * as schema from '../../../baseline/schema.js';
import {
  hazardId, platformId, reportId, reportTemplateId, timestampAest, userProfileId,
} from '../../../baseline/types.js';
import * as bowtie from '../../bowtie/contract.js';
import * as changeLog from '../../change-log/contract.js';
import * as rating from '../../rating/contract.js';
import * as registry from '../../registry/contract.js';
import * as rs from '../../review-schedule/contract.js';
import * as reports from '../contract.js';

/** @typedef {import('../../../baseline/types.js').ActiveProfile} ActiveProfile */
/** @typedef {import('../../../baseline/types.js').PlatformId} PlatformId */
/** @typedef {import('../../../baseline/types.js').HazardId} HazardId */
/** @typedef {import('../../../baseline/types.js').ControlId} ControlId */
/** @typedef {import('../../../baseline/types.js').RecordRef} RecordRef */
/** @typedef {import('../../../baseline/types.js').TimestampAest} TimestampAest */
/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */
/** @typedef {import('../../registry/contract.js').Act} Act */
/** @typedef {import('../../change-log/contract.js').ChangeLogEntry} ChangeLogEntry */
/** @typedef {import('../../change-log/contract.js').RecordChangeEntry} RecordChangeEntry */
/** @typedef {import('../contract.js').Report} Report */
/** @typedef {import('../contract.js').ReportTemplate} ReportTemplate */
/** @typedef {import('../contract.js').TemplateSection} TemplateSection */
/** @typedef {import('../contract.js').ReportFields} ReportFields */
/** @typedef {import('../contract.js').OutOfDateRecord} OutOfDateRecord */

/** The one seed this suite's property tests use (CORE-TST-001); change it only on purpose, and record why. */
export const SEED = 0x52505254;

export const TEMPLATES = /** @type {const} */ ('report-template');
export const REPORTS = /** @type {const} */ ('report');
export const LOG = /** @type {const} */ ('change-log-entry');

/** Section 3's kinds, written out here rather than read from the contract, so the suite checks the constant too. */
export const SECTION_KINDS = Object.freeze(['heading', 'text', 'hazards']);

/** The kinds a report includes (C-007) and the only kinds an out-of-date record names (C-006, C-012). */
export const INCLUDABLE_KINDS = Object.freeze(['platform', 'hazard', 'control']);

// ------------------------------------------------------------------ profiles, acts, and time

/**
 * The profile a session acts as, as `views` would pass it on (REQ-055).
 * @param {string} name
 * @returns {ActiveProfile}
 */
export function newProfile(name) {
  return { id: userProfileId.fresh(), name };
}

export const alice = newProfile('Alice');
export const bob = newProfile('Bob');

/**
 * One act (registry section 3). Both properties are always given, as DEC-016 requires.
 * @param {ActiveProfile} profile
 * @param {PlatformId | null} [madeFor]
 * @returns {Act}
 */
export function actOf(profile, madeFor = null) {
  return { profile, madeForPlatformId: madeFor };
}

/**
 * A valid UUID whose string order is the order of `n`, for ids a test needs sorted; `salt`
 * keeps ids of different uses apart.
 * @param {number} n
 * @param {number} [salt]
 * @returns {string}
 */
export function orderedUuid(n, salt = 0) {
  return `${n.toString(16).padStart(8, '0')}-0000-4000-8000-${salt.toString(16).padStart(12, '0')}`;
}

/** @type {TimestampAest} the time a world is built at, and a body's direct records are stamped with */
export const EARLIER = timestampAest('2026-09-01T08:00:00+10:00');

/** @type {TimestampAest} the time most tests hold the clock at */
export const HELD = timestampAest('2026-09-15T10:30:00+10:00');

/** @type {TimestampAest} a later time, for an act that must be told apart from one at HELD */
export const LATER = timestampAest('2026-09-16T14:05:00+10:00');

/**
 * Run `fn` with the baseline clock held at `ts`, releasing it after whatever happens.
 * @template T
 * @param {TimestampAest} ts
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withClock(ts, fn) {
  fixClock(ts);
  try {
    return await fn();
  } finally {
    releaseClock();
  }
}

/**
 * The start of a calendar day in AEST, as a timestamp.
 * @param {string} date `YYYY-MM-DD`
 * @param {string} [time] `HH:mm:ss`
 * @returns {TimestampAest}
 */
export function at(date, time = '09:00:00') {
  return timestampAest(`${date}T${time}+10:00`);
}

/** @param {string} id @returns {RecordRef} */
export const platformRef = (id) => ({ kind: 'platform', id });
/** @param {string} id @returns {RecordRef} */
export const hazardRef = (id) => ({ kind: 'hazard', id });
/** @param {string} id @returns {RecordRef} */
export const controlRef = (id) => ({ kind: 'control', id });

// ------------------------------------------------------------------ a world built through registry

/**
 * @typedef {object} World
 * @property {DataBody} body
 * @property {PlatformId} P the platform most reports are on; its name has characters every document must escape
 * @property {PlatformId} Q a second platform
 * @property {HazardId} H1 on P and Q; report id `P-001` on P; C confirmed and D awaiting on P; residual on P 3 C; two causal factors and a consequence
 * @property {HazardId} H2 on P; C excluded on P with a reason; no residual; one causal factor
 * @property {HazardId} H3 on P; E confirmed on P; residual on P 2 B
 * @property {HazardId} H4 on Q only
 * @property {HazardId} H5 on no platform
 * @property {ControlId} C preventative on H1 and H2
 * @property {ControlId} D mitigating on H1
 * @property {ControlId} E mitigating on H3
 * @property {ControlId} F in the library and on no hazard
 */

/** Texts the world stores: each has whitespace runs and characters both document syntaxes must escape. */
export const WORLD_TEXT = Object.freeze({
  P: 'Platform  P & <Sons> "Tug"',
  Q: 'Platform Q',
  H1: 'Loss of propulsion   in *restricted* waters [A&B]',
  H2: 'Fire in the {engine} room: #1 & #2',
  H3: 'Grounding\ton `chart` error',
  H4: 'Collision',
  H5: 'Unlinked hazard',
  C: 'Fuel polishing <before> bunkering',
  D: 'Emergency  anchoring \\ procedure',
  E: 'Tug on "standby"',
  F: 'Library only',
  exclusion: 'Single-engine vessel;  no second  governor & no <spare>',
});

/**
 * The world most tests start from, built through `registry` with the clock at EARLIER.
 * @returns {Promise<World>}
 */
export async function buildWorld() {
  return withClock(EARLIER, async () => {
    const act = actOf(alice);
    let body = schema.emptyDataBody();
    const P = await registry.createPlatform(body, act, { name: WORLD_TEXT.P, ownerProfileId: alice.id });
    body = P.body;
    const Q = await registry.createPlatform(body, act, { name: WORLD_TEXT.Q, ownerProfileId: bob.id });
    body = Q.body;
    /** @type {HazardId[]} */
    const hazards = [];
    for (const title of [WORLD_TEXT.H1, WORLD_TEXT.H2, WORLD_TEXT.H3, WORLD_TEXT.H4, WORLD_TEXT.H5]) {
      const h = await registry.createHazard(body, act, { title });
      body = h.body;
      hazards.push(h.hazard.id);
    }
    const [H1, H2, H3, H4, H5] = hazards;
    /** @type {ControlId[]} */
    const controls = [];
    for (const title of [WORLD_TEXT.C, WORLD_TEXT.D, WORLD_TEXT.E, WORLD_TEXT.F]) {
      const c = await registry.createControl(body, act, { title });
      body = c.body;
      controls.push(c.control.id);
    }
    const [C, D, E, F] = controls;
    const p = P.platform.id;
    const q = Q.platform.id;
    for (const [h, pl] of [[H1, p], [H2, p], [H3, p], [H1, q], [H4, q]]) {
      body = (await registry.linkHazardToPlatform(body, act, { hazardId: h, platformId: pl })).body;
    }
    body = (await registry.linkControlToHazard(body, act, { hazardId: H1, controlId: C, controlKind: 'preventative' })).body;
    body = (await registry.linkControlToHazard(body, act, { hazardId: H1, controlId: D, controlKind: 'mitigating' })).body;
    body = (await registry.linkControlToHazard(body, act, { hazardId: H2, controlId: C, controlKind: 'preventative' })).body;
    body = (await registry.linkControlToHazard(body, act, { hazardId: H3, controlId: E, controlKind: 'mitigating' })).body;
    body = (await registry.confirmControlForPlatform(body, act, { hazardId: H1, controlId: C, platformId: p })).body;
    body = (await registry.excludeControlFromPlatform(body, act, { hazardId: H2, controlId: C, platformId: p, text: WORLD_TEXT.exclusion })).body;
    body = (await registry.confirmControlForPlatform(body, act, { hazardId: H3, controlId: E, platformId: p })).body;
    body = (await registry.setPlatformReportId(body, act, { hazardId: H1, platformId: p, reportId: /** @type {any} */ ('P-001') })).body;
    body = (await registry.setRating(body, act, { hazardId: H1, platformId: p, stage: 'residual', consequence: /** @type {any} */ (3), likelihood: /** @type {any} */ ('C') })).body;
    body = (await registry.setRating(body, act, { hazardId: H3, platformId: p, stage: 'residual', consequence: /** @type {any} */ (2), likelihood: /** @type {any} */ ('B') })).body;
    body = (await registry.addCausalFactor(body, act, H1, { text: 'Fuel contamination' })).body;
    body = (await registry.addCausalFactor(body, act, H1, { text: 'Governor <hunting> & surging' })).body;
    body = (await registry.addConsequence(body, act, H1, { text: 'Collision with a berthed vessel' })).body;
    body = (await registry.addCausalFactor(body, act, H2, { text: 'Oil leak onto a hot surface' })).body;
    return { body, P: p, Q: q, H1, H2, H3, H4, H5, C, D, E, F };
  });
}

/**
 * Give `ref` a live review schedule with this due date, through `review-schedule`'s own contract,
 * with the clock at EARLIER.
 * @param {DataBody} body
 * @param {RecordRef} ref
 * @param {string} nextDueAest
 * @returns {Promise<DataBody>}
 */
export async function scheduled(body, ref, nextDueAest) {
  return withClock(EARLIER, async () => {
    const affectedPlatformIds = ref.kind === 'reference-entry' ? [] : [...(await registry.platformsAffected(body, ref))];
    const act = { profile: alice, madeForPlatformId: null, affectedPlatformIds };
    return (await rs.setSchedule(body, /** @type {any} */ (act), { ref, tempoMonths: /** @type {any} */ (12), nextDueAest: /** @type {any} */ (nextDueAest) })).body;
  });
}

/**
 * Complete a review of `ref` with the clock at `ts`, so its schedule gains a last reviewed date.
 * @param {DataBody} body
 * @param {RecordRef} ref
 * @param {TimestampAest} ts
 * @returns {Promise<DataBody>}
 */
export async function reviewed(body, ref, ts) {
  return withClock(ts, async () => {
    const affectedPlatformIds = [...(await registry.platformsAffected(body, ref))];
    const act = { profile: alice, madeForPlatformId: null, affectedPlatformIds };
    return (await rs.completeReview(body, /** @type {any} */ (act), ref)).body;
  });
}

/**
 * The world with schedules on P, H1, H2, H3, C, D, and E, on H4 and Q (which a report on P does not
 * use), and on a reference entry, all due `due`; E is due a day later than the rest.
 * @param {World} w
 * @param {string} [due]
 * @param {string} [dueE]
 * @returns {Promise<DataBody>}
 */
export async function scheduledWorld(w, due = '2026-09-10', dueE = '2026-09-11') {
  let body = w.body;
  for (const ref of [platformRef(w.P), hazardRef(w.H1), hazardRef(w.H2), hazardRef(w.H3), controlRef(w.C), controlRef(w.D), hazardRef(w.H4), platformRef(w.Q)]) {
    body = await scheduled(body, ref, due);
  }
  body = await scheduled(body, controlRef(w.E), dueE);
  body = await scheduled(body, { kind: 'reference-entry', id: orderedUuid(1, 0xf) }, due);
  return body;
}

// ------------------------------------------------------------------ templates

/** @type {readonly TemplateSection[]} a layout with all three kinds, a heading after the hazards, and text needing escape */
export const LAYOUT = Object.freeze([
  { sectionKind: 'heading', text: 'Introduction & <scope>' },
  { sectionKind: 'text', text: 'This report   covers every hazard *linked* to the platform.' },
  { sectionKind: 'hazards' },
  { sectionKind: 'heading', text: 'Close' },
]);

/**
 * @param {Partial<import('../contract.js').TemplateFields>} [overrides]
 * @returns {import('../contract.js').TemplateFields}
 */
export function templateFields(overrides = {}) {
  return { name: 'Quarterly report', title: 'Safety  report: "Q3" & <all>', sections: structuredClone(LAYOUT), ...overrides };
}

/**
 * Create a template with the clock at `ts`.
 * @param {DataBody} body
 * @param {Act} act
 * @param {import('../contract.js').TemplateFields} [fields]
 * @param {TimestampAest} [ts]
 */
export function createTemplate(body, act, fields = templateFields(), ts = HELD) {
  return withClock(ts, () => reports.createTemplate(body, act, fields));
}

/**
 * The fields a report on `platform` from `template` needs to be produced as the body stands at
 * `ts`: the out-of-date list acknowledged exactly, and the bow-ties given.
 * @param {DataBody} body
 * @param {string} template
 * @param {string} platform
 * @param {readonly string[]} [bowtieHazardIds]
 * @param {TimestampAest} [ts]
 * @returns {Promise<ReportFields>}
 */
export async function reportFields(body, template, platform, bowtieHazardIds = [], ts = HELD) {
  const list = await withClock(ts, () => reports.outOfDateFor(body, /** @type {any} */ (platform)));
  return /** @type {any} */ ({ templateId: template, platformId: platform, bowtieHazardIds: [...bowtieHazardIds], acknowledgedOutOfDate: list.map((r) => ({ kind: r.ref.kind, id: r.ref.id })) });
}

/**
 * Produce a report with the clock at `ts`.
 * @param {DataBody} body
 * @param {Act} act
 * @param {ReportFields} fields
 * @param {TimestampAest} [ts]
 */
export function produce(body, act, fields, ts = HELD) {
  return withClock(ts, () => reports.produceReport(body, act, fields));
}

/**
 * The world with a template, and a report on P from it holding H1's bow-tie, produced at HELD.
 * @param {World} [world]
 */
export async function worldWithReport(world) {
  const w = world ?? await buildWorld();
  const t = await createTemplate(w.body, actOf(alice));
  const fields = await reportFields(t.body, t.template.id, w.P, [w.H1]);
  const r = await produce(t.body, actOf(alice, w.P), fields);
  return { w, template: t.template, withTemplate: t.body, fields, report: r.report, body: r.body };
}

// ------------------------------------------------------------------ what a report holds (C-004 to C-006)

/**
 * What C-004 says `r.hazards` and `r.omitted` are, read from `registry.listPlatformHazards` on
 * the same body; and the platform's name (C-003).
 * @param {DataBody} body
 * @param {string} platform
 */
export async function expectedContent(body, platform) {
  const q = await registry.listPlatformHazards(body, /** @type {any} */ (platform));
  return {
    platformName: q.platform.name,
    hazards: q.rows.map((row) => ({
      hazardId: row.hazard.id,
      title: row.hazard.title,
      reportId: row.reportId,
      controls: row.controls.map((c) => ({
        controlId: c.control.id,
        title: c.control.title,
        controlKind: c.controlKind,
        state: c.state,
        justificationText: c.justification === null ? null : c.justification.text,
      })),
      residual: { consequence: row.residual.consequence, likelihood: row.residual.likelihood },
    })),
    omitted: q.omitted.map((o) => ({ hazardId: o.id, reason: o.reason })),
  };
}

/**
 * What C-006 says `outOfDateFor(body, platform)` resolves with at `ts`, read from
 * `review-schedule.listOverdue` and `registry.listPlatformHazards` on the same body.
 * @param {DataBody} body
 * @param {string} platform
 * @param {TimestampAest} [ts]
 * @returns {Promise<OutOfDateRecord[]>}
 */
export async function expectedOutOfDate(body, platform, ts = HELD) {
  const q = await registry.listPlatformHazards(body, /** @type {any} */ (platform));
  const overdue = await withClock(ts, () => rs.listOverdue(body));
  /** @type {Map<string, string>} */
  const names = new Map([[`platform:${q.platform.id}`, q.platform.name]]);
  for (const row of q.rows) {
    names.set(`hazard:${row.hazard.id}`, row.hazard.title);
    for (const c of row.controls) names.set(`control:${c.control.id}`, c.control.title);
  }
  return overdue
    .filter((s) => names.has(`${s.ref.kind}:${s.ref.id}`))
    .map((s) => /** @type {any} */ ({
      ref: { kind: s.ref.kind, id: s.ref.id },
      name: names.get(`${s.ref.kind}:${s.ref.id}`),
      nextDueAest: /** @type {any} */ (s.schedule).nextDueAest,
      lastReviewedAest: /** @type {any} */ (s.schedule).lastReviewedAest,
    }));
}

/**
 * The drawing C-005 says a report holds for one hazard, from `bowtie` on the same body.
 * @param {DataBody} body
 * @param {string} hazard
 * @param {string} platform
 * @returns {Promise<string>}
 */
export async function expectedSvg(body, hazard, platform) {
  return bowtie.renderBowtieSvg(await bowtie.bowtieFor(body, /** @type {any} */ (hazard), /** @type {any} */ (platform)));
}

/**
 * C-003 and C-004 exactly, for a report produced on `input` by `act` at `ts`.
 * @param {Report} r
 * @param {{ input: DataBody, act: Act, fields: ReportFields, template: ReportTemplate, ts: TimestampAest, what?: string }} e
 */
export async function assertProduced(r, e) {
  const what = e.what ?? 'the report';
  const content = await expectedContent(e.input, e.fields.platformId);
  reportId.parse(r.id);
  assert.ok(!Object.prototype.hasOwnProperty.call(collectionOf(e.input, REPORTS), r.id), `C-003: ${what}'s id is held by no report the input body had`);
  assert.equal(r.kind, 'report', `C-003: ${what}'s kind is 'report'`);
  assert.equal(r.status, 'live', `C-003: ${what}'s status is 'live'`);
  assert.equal(r.createdBy, e.act.profile.id, `C-003: ${what}'s createdBy is act.profile.id`);
  assert.equal(r.updatedBy, e.act.profile.id, `C-003: ${what}'s updatedBy is act.profile.id`);
  assert.equal(r.createdAtAest, e.ts, `C-003: ${what}'s createdAtAest is the baseline clock's now`);
  assert.equal(r.updatedAtAest, e.ts, `C-003: ${what}'s updatedAtAest is the baseline clock's now`);
  assert.equal(r.templateId, e.template.id, `C-002: ${what}'s templateId is the template's id`);
  assert.equal(r.templateName, e.template.name, `C-002: ${what}'s templateName is the template's name`);
  assert.equal(r.title, e.template.title, `C-002: ${what}'s title is the template's title`);
  assert.deepEqual(plain(r.sections), plain(e.template.sections), `C-002: ${what}'s sections are the template's`);
  assert.equal(r.platformId, e.fields.platformId, `C-003: ${what}'s platformId is fields.platformId`);
  assert.equal(r.platformName, content.platformName, `C-003: ${what}'s platformName is the name listPlatformHazards gave`);
  assert.deepEqual(plain(r.hazards), content.hazards, `C-004: ${what}'s hazards are the query's rows, in order, each with its controls and residual values, nothing added, dropped, merged, reordered, or reworded`);
  assert.deepEqual(plain(r.omitted), content.omitted, `C-004: ${what}'s omitted are the query's omitted, in order, each with its reason`);
}

/**
 * A value as plain JSON-shaped data, so a frozen array compares equal to an unfrozen one.
 * @param {unknown} value
 * @returns {any}
 */
export function plain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

// ------------------------------------------------------------------ records and bodies built directly

/**
 * @param {DataBody} body
 * @param {string} name
 * @returns {Record<string, any>}
 */
export function collectionOf(body, name) {
  return /** @type {Record<string, any>} */ (/** @type {any} */ (body.collections)[name] ?? {});
}

/**
 * A stored template, well-formed unless `overrides` makes it otherwise.
 * @param {string} id
 * @param {Record<string, unknown>} [overrides]
 * @returns {ReportTemplate}
 */
export function templateRow(id, overrides = {}) {
  return /** @type {any} */ ({
    id,
    kind: TEMPLATES,
    status: 'live',
    createdBy: alice.id,
    createdAtAest: EARLIER,
    updatedBy: alice.id,
    updatedAtAest: EARLIER,
    name: 'Stored template',
    title: 'Stored title',
    sections: [{ sectionKind: 'heading', text: 'Heading' }, { sectionKind: 'hazards' }],
    ...overrides,
  });
}

/** A small drawing in bowtie C-009's syntax, for reports built directly. */
export const SMALL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20" viewBox="0 0 40 20"><g data-bowtie-node="hazard" data-record-id="H-0001"><title>A &amp; &lt;B&gt; &quot;C&quot;</title><rect x="1" y="1" width="30" height="10"/><text x="2" y="8"><tspan x="2" y="8">A &amp; B</tspan></text></g><text data-bowtie-caption="" x="0" y="19">P</text></svg>';

/**
 * A stored report, well-formed unless `overrides` makes it otherwise: one hazard with two
 * controls, one excluded, its bow-tie, one omission, and one out-of-date record.
 * @param {string} id
 * @param {Record<string, unknown>} [overrides]
 * @returns {Report}
 */
export function reportRow(id, overrides = {}) {
  const c1 = orderedUuid(1, 0xc);
  const c2 = orderedUuid(2, 0xc);
  const p = orderedUuid(1, 0xa);
  return /** @type {any} */ ({
    id,
    kind: REPORTS,
    status: 'live',
    createdBy: alice.id,
    createdAtAest: EARLIER,
    updatedBy: alice.id,
    updatedAtAest: EARLIER,
    templateId: orderedUuid(1, 0xb),
    templateName: 'Stored template',
    title: 'Stored title',
    sections: [{ sectionKind: 'heading', text: 'Heading' }, { sectionKind: 'hazards' }],
    platformId: p,
    platformName: 'Stored platform',
    hazards: [{
      hazardId: 'H-0001',
      title: 'Stored hazard',
      reportId: 'H-0001',
      controls: [
        { controlId: c1, title: 'Control one', controlKind: 'preventative', state: 'confirmed', justificationText: null },
        { controlId: c2, title: 'Control two', controlKind: 'mitigating', state: 'excluded', justificationText: 'Not fitted' },
      ],
      residual: { consequence: 4, likelihood: 'D' },
    }],
    omitted: [{ hazardId: 'H-0002', reason: 'malformed-rating' }],
    bowties: [{ hazardId: 'H-0001', svg: SMALL_SVG }],
    outOfDate: [{ ref: { kind: 'hazard', id: 'H-0001' }, name: 'Stored hazard', nextDueAest: '2026-08-01', lastReviewedAest: null }],
    ...overrides,
  });
}

/**
 * `body` with these rows added to `collection` under their ids (or under `key` where a pair is
 * given), leaving the input untouched.
 * @param {DataBody} body
 * @param {string} collection
 * @param {(any | [string, unknown])[]} rows
 * @returns {DataBody}
 */
export function withRows(body, collection, rows) {
  const copy = structuredClone(body);
  const collections = /** @type {Record<string, any>} */ (/** @type {unknown} */ (copy.collections));
  collections[collection] = { ...(collections[collection] ?? {}) };
  for (const row of rows) {
    if (Array.isArray(row)) collections[collection][row[0]] = row[1];
    else collections[collection][row.id] = row;
  }
  return copy;
}

/**
 * `body` with a change-log entry `change-log` C-008 refuses — a record change with no items —
 * so that `recordChange`, and every act that calls it, rejects with `MalformedEntryError`.
 * @param {DataBody} body
 * @returns {DataBody}
 */
export function withUnreadableLog(body) {
  const id = orderedUuid(1, 0xe);
  return withRows(body, LOG, [{
    id, kind: LOG, status: 'live', createdBy: alice.id, createdAtAest: EARLIER, updatedBy: alice.id, updatedAtAest: EARLIER,
    entryKind: 'record-change', items: [], madeForPlatformId: null, affectedPlatformIds: [],
  }]);
}

/**
 * `body` with every review schedule's tempo made zero, which `review-schedule` C-004 refuses, so
 * every operation of that contract rejects with `MalformedScheduleError`. The body must hold one.
 * @param {DataBody} body
 * @returns {DataBody}
 */
export function withUnreadableSchedules(body) {
  const copy = structuredClone(body);
  const schedules = collectionOf(copy, 'review-schedule');
  assert.ok(Object.keys(schedules).length > 0, 'fixture: the body holds a schedule to spoil');
  for (const s of Object.values(schedules)) s.tempoMonths = 0;
  return copy;
}

/**
 * `body` with the live residual rating of `hazard` made unreadable (a consequence of 9), so
 * `registry.listPlatformHazards` names that hazard in `omitted` rather than as a row (registry
 * C-008, C-019).
 * @param {DataBody} body
 * @param {string} hazard
 * @returns {DataBody}
 */
export function withOmittedHazard(body, hazard) {
  const copy = structuredClone(body);
  const found = Object.values(collectionOf(copy, 'rating')).find((r) => r.hazardId === hazard && r.stage === 'residual' && r.status === 'live');
  assert.ok(found, `fixture: hazard ${hazard} has a residual rating to spoil`);
  found.consequence = 9;
  return copy;
}

/**
 * `body` with one stored record changed by `change`, leaving the input untouched.
 * @param {DataBody} body
 * @param {string} collection
 * @param {string} key
 * @param {(record: any) => unknown} change
 * @returns {DataBody}
 */
export function spoil(body, collection, key, change) {
  const copy = structuredClone(body);
  const c = collectionOf(copy, collection);
  assert.ok(c[key], `fixture: ${collection} holds ${key}`);
  c[key] = change(c[key]);
  return copy;
}

/**
 * The key of the one entry of `collection` that `match` picks.
 * @param {DataBody} body
 * @param {string} collection
 * @param {(record: any) => boolean} match
 * @returns {string}
 */
export function keyWhere(body, collection, match) {
  const keys = Object.entries(collectionOf(body, collection)).filter(([, r]) => match(r)).map(([k]) => k);
  assert.equal(keys.length, 1, `fixture: exactly one ${collection} entry matches`);
  return keys[0];
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
 * @param {DataBody} body
 * @returns {DataBody}
 */
export function jsonRoundTrip(body) {
  return JSON.parse(JSON.stringify(body));
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
 * Where two bodies differ, outside the change-log collection: `collection/key` for an entry
 * added, removed, or changed, the collection's name for one that is not a map, and
 * `sequences.name` for a sequence.
 * @param {DataBody} input
 * @param {DataBody} output
 * @returns {string[]}
 */
export function differences(input, output) {
  /** @type {string[]} */
  const out = [];
  const isMap = (/** @type {unknown} */ v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const ic = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (input.collections));
  const oc = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (output.collections ?? {}));
  for (const name of new Set([...Object.keys(ic), ...Object.keys(oc)])) {
    if (name === LOG) continue;
    const a = ic[name];
    const b = oc[name];
    if ((a === undefined || isMap(a)) && (b === undefined || isMap(b))) {
      const am = /** @type {Record<string, unknown>} */ (a ?? {});
      const bm = /** @type {Record<string, unknown>} */ (b ?? {});
      for (const key of new Set([...Object.keys(am), ...Object.keys(bm)])) {
        const inA = Object.prototype.hasOwnProperty.call(am, key);
        const inB = Object.prototype.hasOwnProperty.call(bm, key);
        if (inA !== inB || !isDeepStrictEqual(am[key], bm[key])) out.push(`${name}/${key}`);
      }
    } else if (!isDeepStrictEqual(a, b)) {
      out.push(name);
    }
  }
  const is = /** @type {Record<string, unknown>} */ (input.sequences ?? {});
  const os = /** @type {Record<string, unknown>} */ (output.sequences ?? {});
  for (const name of new Set([...Object.keys(is), ...Object.keys(os)])) if (!isDeepStrictEqual(is[name], os[name])) out.push(`sequences.${name}`);
  return out.sort();
}

// ------------------------------------------------------------------ the entry an act wrote (C-011)

/**
 * The item `change-log` gives for a record created (change-log C-002, C-004, C-005): action
 * `created`, and one field change per field of the record but `updatedBy` and `updatedAtAest`,
 * ascending by field, each from null.
 * @param {any} after
 * @returns {any}
 */
export function createdItem(after) {
  const fields = Object.keys(after).filter((f) => f !== 'updatedBy' && f !== 'updatedAtAest').sort()
    .map((field) => ({ field, before: null, after: after[field] }));
  return { ref: { kind: after.kind, id: after.id }, action: 'created', fields };
}

/**
 * C-011 for one resolved changing call: `output` holds every entry `input` held, as it was, and
 * exactly one more; that entry's one item is `record` created; it is stamped with the act's
 * profile and `ts`; its `madeForPlatformId` is the act's unchanged; and its `affectedPlatformIds`
 * are `affected`. Nothing but the record's own collection entry and the log differ.
 * @param {DataBody} input
 * @param {DataBody} output
 * @param {{ act: Act, ts: TimestampAest, record: any, collection: string, affected: readonly string[], what: string }} e
 */
export async function assertRecorded(input, output, e) {
  const { what } = e;
  const had = [...(await changeLog.listEntries(input))];
  const has = [...(await changeLog.listEntries(output))];
  for (const x of had) assert.deepEqual(plain(has.find((y) => y.id === x.id)), plain(x), `C-011: ${what}: entry ${x.id} is still in the log as it was`);
  const added = has.filter((x) => !had.some((y) => y.id === x.id));
  assert.equal(added.length, 1, `C-011: ${what}: exactly one entry is added to the log, got ${added.length}`);
  const entry = /** @type {RecordChangeEntry} */ (added[0]);
  assert.equal(entry.entryKind, 'record-change', `C-011: ${what}: the entry is a record change`);
  assert.equal(entry.createdBy, e.act.profile.id, `C-011: ${what}: the entry is stamped with act.profile`);
  assert.equal(entry.createdAtAest, e.ts, `C-011: ${what}: the entry is stamped with the clock's now`);
  assert.equal(entry.madeForPlatformId, e.act.madeForPlatformId, `C-011: ${what}: madeForPlatformId is act.madeForPlatformId unchanged`);
  assert.deepEqual([...entry.affectedPlatformIds], [...e.affected], `C-011: ${what}: affectedPlatformIds`);
  assert.deepEqual(plain(entry.items), [plain(createdItem(e.record))], `C-011: ${what}: the one item is the record created, before null and after the record, every field it held`);
  assert.deepEqual(differences(input, output), [`${e.collection}/${e.record.id}`], `C-003, C-011: ${what}: the body differs only by the record and its entry`);
}

// ------------------------------------------------------------------ the mark model both documents are read into (C-008)

/**
 * One mark of C-008 as a document holds it, whichever syntax drew it.
 * @typedef {object} Mark
 * @property {'header' | 'notice' | 'record' | 'section' | 'hazard' | 'control' | 'bowtie' | 'omitted'} type
 * @property {Record<string, string>} values the mark's values: `recordKind`, `recordId`, `sectionKind`, `hazardId`, `band`, `controlId`, `state`, `controlKind`, `reason`
 * @property {string} text the mark's own text, outside every mark inside it, unescaped and normalised
 * @property {Mark[]} marks the marks directly inside it, in document order
 * @property {string | null} svg a bow-tie's drawing exactly as the document holds it
 * @property {string} where where the mark is, for messages
 */

/**
 * @param {Mark['type']} type
 * @param {string} where
 * @returns {Mark}
 */
function mark(type, where) {
  return { type, values: {}, text: '', marks: [], svg: null, where };
}

/**
 * @param {string} s
 * @returns {string} trimmed, every run of whitespace one space (section 3)
 */
export function normalise(s) {
  return String(s).trim().replace(/\s+/g, ' ');
}

/**
 * C-008 over one document's marks, against the report drawn and the band `rating` gives each
 * hazard's residual values. Everything the report holds is marked once, in C-008's order and
 * nesting, and nothing it does not hold is marked. Dates are not compared (FND-049).
 * @param {Mark} root
 * @param {Report} r
 * @param {string} doc `HTML` or `Markdown`
 */
export async function assertMarks(root, r, doc) {
  const at = (/** @type {string} */ s) => `${doc}: ${s}`;
  const includes = (/** @type {Mark} */ m, /** @type {string} */ stored, /** @type {string} */ what) => {
    assert.ok(m.text.includes(normalise(stored)), at(`C-008: the ${m.type} mark's text ${JSON.stringify(m.text)} holds ${what} ${JSON.stringify(normalise(stored))}`));
  };
  const top = root.marks;
  const expectTop = ['header', ...(r.outOfDate.length > 0 ? ['notice'] : []), ...r.sections.map(() => 'section')];
  assert.deepEqual(top.map((m) => m.type), expectTop, at('C-008: one header, one out-of-date notice exactly when outOfDate is not empty, then one section per entry of sections, in that order, and no other mark outside them'));

  const header = top[0];
  assert.equal(header.marks.length, 0, at('C-008: nothing is marked inside the header'));
  includes(header, r.title, 'the normalised title');
  includes(header, r.platformName, 'the normalised platform name');

  let next = 1;
  if (r.outOfDate.length > 0) {
    const notice = top[next];
    next += 1;
    assert.deepEqual(notice.marks.map((m) => m.type), r.outOfDate.map(() => 'record'), at('C-008: the notice holds one record mark per entry of outOfDate, and no other mark'));
    r.outOfDate.forEach((o, i) => {
      const m = notice.marks[i];
      assert.equal(m.values.recordKind, o.ref.kind, at(`C-008: out-of-date record ${i} carries its kind, in outOfDate's order`));
      assert.equal(m.values.recordId, o.ref.id, at(`C-008: out-of-date record ${i} carries its id, in outOfDate's order`));
      assert.equal(m.marks.length, 0, at('C-008: nothing is marked inside an out-of-date record'));
      includes(m, o.name, `out-of-date record ${o.ref.id}'s normalised name`);
    });
  }

  const bands = await Promise.all(r.hazards.map((h) => rating.ratingFor(h.residual.consequence, h.residual.likelihood)));
  r.sections.forEach((section, i) => {
    const m = top[next + i];
    assert.equal(m.values.sectionKind, section.sectionKind, at(`C-008: section ${i} carries its sectionKind, in sections' order`));
    if (section.sectionKind !== 'hazards') {
      assert.equal(m.marks.length, 0, at(`C-008: nothing is marked inside ${section.sectionKind} section ${i}`));
      assert.equal(m.text, normalise(/** @type {any} */ (section).text), at(`C-008: ${section.sectionKind} section ${i} carries its normalised text and nothing else`));
      return;
    }
    assert.deepEqual(m.marks.map((x) => x.type), [...r.hazards.map(() => 'hazard'), ...r.omitted.map(() => 'omitted')],
      at('C-008: the hazards section holds one hazard mark per entry of hazards, then one omission mark per entry of omitted, and no other mark'));
    r.hazards.forEach((h, k) => {
      const hm = m.marks[k];
      assert.equal(hm.values.hazardId, h.hazardId, at(`C-008: hazard mark ${k} carries its hazardId, in hazards' order`));
      assert.equal(hm.values.band, bands[k].band, at(`C-008: hazard ${h.hazardId} carries the band rating.ratingFor gives its residual values`));
      includes(hm, h.reportId, `hazard ${h.hazardId}'s reportId`);
      includes(hm, h.title, `hazard ${h.hazardId}'s normalised title`);
      if (h.residual.consequence !== null) includes(hm, String(h.residual.consequence), `hazard ${h.hazardId}'s residual consequence`);
      if (h.residual.likelihood !== null) includes(hm, h.residual.likelihood, `hazard ${h.hazardId}'s residual likelihood`);
      const drawn = r.bowties.filter((b) => b.hazardId === h.hazardId);
      const controls = hm.marks.filter((x) => x.type === 'control');
      const ties = hm.marks.filter((x) => x.type === 'bowtie');
      assert.equal(controls.length + ties.length, hm.marks.length, at(`C-008: hazard ${h.hazardId} holds only control and bow-tie marks`));
      assert.equal(controls.length, h.controls.length, at(`C-008: hazard ${h.hazardId} holds one control mark per ReportControl`));
      h.controls.forEach((c, j) => {
        const cm = controls[j];
        assert.equal(cm.values.controlId, c.controlId, at(`C-008: control mark ${j} of ${h.hazardId} carries its controlId, in controls' order`));
        assert.equal(cm.values.state, c.state, at(`C-008: control ${c.controlId} of ${h.hazardId} carries its state`));
        assert.equal(cm.values.controlKind, c.controlKind, at(`C-008: control ${c.controlId} of ${h.hazardId} carries its controlKind`));
        assert.equal(cm.marks.length, 0, at('C-008: nothing is marked inside a control'));
        includes(cm, c.title, `control ${c.controlId}'s normalised title`);
        if (c.justificationText !== null) includes(cm, c.justificationText, `control ${c.controlId}'s normalised justification`);
      });
      assert.equal(ties.length, drawn.length, at(`C-008: hazard ${h.hazardId} holds a bow-tie mark exactly when bowties has an entry for it`));
      if (drawn.length === 1) {
        assert.equal(ties[0].values.hazardId, h.hazardId, at(`C-008: the bow-tie mark inside ${h.hazardId} names that hazard`));
        assert.equal(ties[0].svg, drawn[0].svg, at(`C-008: the bow-tie mark inside ${h.hazardId} holds that entry's svg exactly`));
      }
    });
    r.omitted.forEach((o, k) => {
      const om = m.marks[r.hazards.length + k];
      assert.equal(om.values.hazardId, o.hazardId, at(`C-008: omission mark ${k} carries its hazardId, in omitted's order`));
      assert.equal(om.values.reason, o.reason, at(`C-008: omission ${o.hazardId} carries its reason`));
      assert.equal(om.marks.length, 0, at('C-008: nothing is marked inside an omission'));
    });
  });
}

/**
 * What C-008 promises is read equally from either document: section kinds in order, hazard ids,
 * control ids with their states, bands, omitted ids, drawings, and out-of-date records.
 * @param {Mark} root
 * @returns {unknown}
 */
export function summary(root) {
  /** @param {Mark} m @returns {unknown} */
  const walk = (m) => ({ type: m.type, values: m.values, svg: m.svg, marks: m.marks.map(walk) });
  return root.marks.map(walk);
}

// ------------------------------------------------------------------ reading the HTML (C-009)

/**
 * @typedef {object} HtmlElement
 * @property {string} name
 * @property {Record<string, string>} attrs decoded values
 * @property {Array<HtmlElement | string>} children decoded text, and elements
 * @property {HtmlElement | null} parent
 * @property {boolean} selfClosed
 * @property {number} contentStart offset of the first character after the start tag
 * @property {number} contentEnd offset of the end tag's `<`, or of `/>` when self-closed
 */

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_.:-]*/;
const ENTITIES = /** @type {Record<string, string>} */ ({ amp: '&', lt: '<', gt: '>', quot: '"' });
export const DOCTYPE = '<!DOCTYPE html>\n';
export const VOID_ELEMENTS = Object.freeze(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
export const FORBIDDEN_ELEMENTS = Object.freeze(['script', 'link', 'base', 'iframe', 'frame', 'object', 'embed', 'img', 'form', 'input']);
export const FORBIDDEN_ATTRIBUTES = Object.freeze(['src', 'srcset', 'href', 'xlink:href', 'action', 'formaction', 'style']);
export const HTML_MARKS = Object.freeze({
  'data-report-header': 'header',
  'data-report-out-of-date': 'notice',
  'data-report-section': 'section',
  'data-report-hazard': 'hazard',
  'data-report-control': 'control',
  'data-report-bowtie': 'bowtie',
  'data-report-omitted': 'omitted',
});

/**
 * @param {string} raw
 * @param {string} where
 * @returns {string}
 */
function decodeEntities(raw, where) {
  return raw.replace(/&([^;]*);?/g, (match, name) => {
    if (!match.endsWith(';') || !(name in ENTITIES)) {
      throw new assert.AssertionError({ message: `C-009: only &amp; &lt; &gt; &quot; may be referenced; found ${JSON.stringify(match.slice(0, 12))} in ${where}` });
    }
    return ENTITIES[name];
  });
}

/**
 * Parse an HTML document in C-009's syntax: `<!DOCTYPE html>` and a newline, then one element
 * ending at the last character; every element closed; attribute values double-quoted; no XML
 * declaration, comment, CDATA section, or processing instruction; no entity but the four. Fails
 * the test on anything else.
 * @param {string} text
 * @returns {HtmlElement} the `html` element
 */
export function parseHtml(text) {
  assert.equal(typeof text, 'string', 'C-009: the document is a string');
  assert.ok(text.startsWith(DOCTYPE), `C-009: the text begins with <!DOCTYPE html> and a newline; it begins ${JSON.stringify(text.slice(0, 20))}`);
  let i = DOCTYPE.length;
  const fail = (/** @type {string} */ what) => {
    throw new assert.AssertionError({ message: `C-009: not well-formed at offset ${i}: ${what}; near ${JSON.stringify(text.slice(Math.max(0, i - 30), i + 30))}` });
  };
  const ws = () => { while (i < text.length && /[ \t\n\r]/.test(text[i])) i += 1; };

  /** @param {HtmlElement | null} parent @returns {HtmlElement} */
  const element = (parent) => {
    if (text[i] !== '<') fail('expected <');
    i += 1;
    const m = NAME_RE.exec(text.slice(i));
    if (!m) fail('expected an element name');
    const name = /** @type {RegExpExecArray} */ (m)[0];
    i += name.length;
    /** @type {HtmlElement} */
    const el = { name, attrs: {}, children: [], parent, selfClosed: false, contentStart: -1, contentEnd: -1 };
    for (;;) {
      const before = i;
      ws();
      if (text.startsWith('/>', i)) {
        el.selfClosed = true;
        el.contentStart = i;
        el.contentEnd = i;
        i += 2;
        return el;
      }
      if (text[i] === '>') { i += 1; break; }
      if (i === before) fail('expected whitespace before an attribute');
      const a = NAME_RE.exec(text.slice(i));
      if (!a) fail('expected an attribute name');
      const attr = /** @type {RegExpExecArray} */ (a)[0];
      i += attr.length;
      if (text[i] !== '=') fail(`expected = after ${attr}`);
      i += 1;
      if (text[i] !== '"') fail(`attribute ${attr} is not double-quoted`);
      const end = text.indexOf('"', i + 1);
      if (end < 0) fail('unterminated attribute value');
      const raw = text.slice(i + 1, end);
      if (raw.includes('<')) fail(`attribute ${attr} holds a raw <`);
      if (Object.prototype.hasOwnProperty.call(el.attrs, attr)) fail(`attribute ${attr} is repeated`);
      el.attrs[attr] = decodeEntities(raw, `attribute ${attr} of <${name}>`);
      i = end + 1;
    }
    el.contentStart = i;
    for (;;) {
      const lt = text.indexOf('<', i);
      if (lt < 0) fail(`<${name}> is not closed`);
      if (lt > i) el.children.push(decodeEntities(text.slice(i, lt), `the text of <${name}>`));
      i = lt;
      if (text.startsWith('</', i)) {
        el.contentEnd = i;
        i += 2;
        if (!text.startsWith(name, i)) fail(`expected </${name}>`);
        i += name.length;
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
 * @param {HtmlElement} root
 * @returns {HtmlElement[]} every element in document order, the root first
 */
export function allElements(root) {
  /** @type {HtmlElement[]} */
  const out = [root];
  for (const c of root.children) if (typeof c !== 'string') out.push(...allElements(c));
  return out;
}

/**
 * @param {HtmlElement} el
 * @returns {HtmlElement[]}
 */
export function childElements(el) {
  return /** @type {HtmlElement[]} */ (el.children.filter((c) => typeof c !== 'string'));
}

/**
 * @param {HtmlElement} el
 * @returns {string} all decoded text below an element, runs joined with a space
 */
export function textOf(el) {
  return el.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join(' ');
}

/**
 * C-009 beyond what `parseHtml` refuses: `html` holds one `head` and one `body`; `head` holds the
 * charset, one title whose text is the normalised title, and at most one safe `style`; no
 * forbidden element or attribute anywhere, no `url(` in an attribute, every void element
 * self-closed; and every attribute beginning `data-report-` is one of the seven marks.
 * @param {string} text
 * @param {Report} r
 * @returns {HtmlElement} the `html` element
 */
export function assertHtmlSyntax(text, r) {
  const html = parseHtml(text);
  assert.equal(html.name, 'html', 'C-009: the one element is html');
  for (const c of html.children) if (typeof c === 'string') assert.equal(c.trim(), '', 'C-009: html holds no text but whitespace');
  assert.deepEqual(childElements(html).map((e) => e.name), ['head', 'body'], 'C-009: html holds one head and one body');
  const [head] = childElements(html);
  const heads = childElements(head);
  assert.ok(heads.some((e) => e.name === 'meta' && e.selfClosed && isDeepStrictEqual(e.attrs, { charset: 'utf-8' })), 'C-009: head holds <meta charset="utf-8"/>');
  assert.ok(text.slice(head.contentStart, head.contentEnd).includes('<meta charset="utf-8"/>'), 'C-009: head holds <meta charset="utf-8"/> as written');
  const titles = heads.filter((e) => e.name === 'title');
  assert.equal(titles.length, 1, 'C-009: head holds one title');
  assert.equal(textOf(titles[0]), normalise(r.title), 'C-009: the title\'s text is the normalised report title');
  const styles = heads.filter((e) => e.name === 'style');
  assert.ok(styles.length <= 1, 'C-009: head holds at most one style');
  for (const s of styles) {
    const raw = text.slice(s.contentStart, s.contentEnd);
    for (const bad of ['<', '&', 'url(', '@import']) assert.ok(!raw.includes(bad), `C-009: the style text holds no ${bad}`);
  }
  for (const e of allElements(html)) {
    assert.ok(!FORBIDDEN_ELEMENTS.includes(e.name), `C-009: no element is named ${e.name}`);
    if (VOID_ELEMENTS.includes(e.name)) assert.ok(e.selfClosed, `C-009: the void element <${e.name}> is written self-closed`);
    for (const [name, value] of Object.entries(e.attrs)) {
      assert.ok(!FORBIDDEN_ATTRIBUTES.includes(name) && !name.startsWith('on'), `C-009: <${e.name}> carries the forbidden attribute ${name}`);
      assert.ok(!value.includes('url('), `C-009: attribute ${name} of <${e.name}> contains url(`);
      if (name.startsWith('data-report-')) assert.ok(name in HTML_MARKS, `C-009: no element carries ${name}; the only data-report- attributes are the seven marks`);
    }
  }
  return html;
}

/**
 * Read the marks of an HTML document (C-009) into the mark model: each element carrying a
 * `data-report-` attribute, and each element carrying `data-record-kind`, with the values C-009
 * names; each mark's text is its decoded text outside every mark inside it, and outside the
 * drawing a bow-tie mark holds.
 * @param {string} text
 * @param {Report} r
 * @returns {{ root: Mark, html: HtmlElement }}
 */
export function htmlMarks(text, r) {
  const html = assertHtmlSyntax(text, r);
  const root = mark('header', 'the document');
  /** @type {Array<{ mark: Mark, el: HtmlElement }>} */
  const found = [];

  /**
   * @param {HtmlElement} el
   * @param {Mark} current
   * @param {string[]} texts
   */
  const walk = (el, current, texts) => {
    const names = Object.keys(el.attrs).filter((a) => a in HTML_MARKS);
    const isRecord = Object.prototype.hasOwnProperty.call(el.attrs, 'data-record-kind');
    assert.ok(names.length + (isRecord ? 1 : 0) <= 1, `C-009: <${el.name}> carries one mark at most, got ${JSON.stringify(Object.keys(el.attrs))}`);
    let here = current;
    let ownTexts = texts;
    if (names.length === 1 || isRecord) {
      const type = isRecord ? 'record' : /** @type {Mark['type']} */ (/** @type {any} */ (HTML_MARKS)[names[0]]);
      here = mark(type, `<${el.name} ${names[0] ?? 'data-record-kind'}>`);
      const a = el.attrs;
      const need = (/** @type {string} */ attr) => {
        assert.ok(Object.prototype.hasOwnProperty.call(a, attr), `C-009: the ${type} mark carries ${attr}`);
        return a[attr];
      };
      if (type === 'record') { here.values.recordKind = need('data-record-kind'); here.values.recordId = need('data-record-id'); }
      if (type === 'section') here.values.sectionKind = need('data-report-section');
      if (type === 'hazard') { here.values.hazardId = need('data-report-hazard'); here.values.band = need('data-rating-band'); }
      if (type === 'control') { here.values.controlId = need('data-report-control'); here.values.state = need('data-control-state'); here.values.controlKind = need('data-control-kind'); }
      if (type === 'bowtie') here.values.hazardId = need('data-report-bowtie');
      if (type === 'omitted') { here.values.hazardId = need('data-report-omitted'); here.values.reason = need('data-omission-reason'); }
      current.marks.push(here);
      found.push({ mark: here, el });
      ownTexts = [];
      if (type === 'bowtie') {
        assert.ok(!el.selfClosed, 'C-009: a bow-tie mark is not empty');
        const kids = childElements(el);
        assert.equal(kids.length, 1, 'C-009: a bow-tie mark\'s only child is the svg');
        for (const c of el.children) if (typeof c === 'string') assert.fail('C-009: a bow-tie mark holds nothing but the svg text, not even whitespace');
        here.svg = text.slice(el.contentStart, el.contentEnd);
        return;
      }
    }
    for (const c of el.children) {
      if (typeof c === 'string') ownTexts.push(c);
      else walk(c, here, ownTexts);
    }
    if (here !== current) here.text = normalise(ownTexts.join(' '));
  };
  walk(html, root, []);

  const sections = found.filter((f) => f.mark.type === 'section');
  if (sections.length > 0) {
    const parent = sections[0].el.parent;
    for (const s of sections) assert.equal(s.el.parent, parent, 'C-009: the sections are siblings');
    for (let p = parent; p; p = p.parent) if (p.name === 'body') return { root, html };
    assert.fail('C-009: the sections are in body');
  }
  return { root, html };
}

// ------------------------------------------------------------------ reading the Markdown (C-010)

const PUNCTUATION_RE = /[!-/:-@[-`{-~]/;
export const MD_CLASSES = Object.freeze({
  'report-header': { type: 'header', construct: 'div' },
  'report-out-of-date': { type: 'notice', construct: 'div' },
  'report-section': { type: 'section', construct: 'div' },
  'report-hazard': { type: 'hazard', construct: 'div' },
  'report-omitted': { type: 'omitted', construct: 'div' },
  'report-stale': { type: 'record', construct: 'span' },
  'report-control': { type: 'control', construct: 'span' },
  'report-bowtie': { type: 'bowtie', construct: 'image' },
});

/**
 * Every character of `s` escaped as C-010 escapes a text: each ASCII punctuation character
 * preceded by a backslash.
 * @param {string} s
 * @returns {string}
 */
export function markdownEscape(s) {
  return [...s].map((ch) => (PUNCTUATION_RE.test(ch) && ch.length === 1 ? `\\${ch}` : ch)).join('');
}

/**
 * A mark's text as a reader takes it: a backslash-escaped ASCII punctuation character is that
 * character; every other ASCII punctuation character is Markdown syntax and is not text; then
 * normalised. Since C-010 escapes every punctuation character of a stored text, this gives the
 * normalised stored text back and nothing of the syntax around it.
 * @param {string} raw
 * @returns {string}
 */
export function markdownText(raw) {
  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === '\\' && i + 1 < raw.length && PUNCTUATION_RE.test(raw[i + 1])) { out += raw[i + 1]; i += 1; } else if (!PUNCTUATION_RE.test(ch)) out += ch;
  }
  return normalise(out);
}

/**
 * Parse a pandoc attribute block's inside: one or more `.class`, `#id`, and `key="value"`.
 * @param {string} inside
 * @param {string} where
 * @returns {{ classes: string[], pairs: Record<string, string> }}
 */
export function parseAttributes(inside, where) {
  /** @type {string[]} */
  const classes = [];
  /** @type {Record<string, string>} */
  const pairs = {};
  const re = /\s*(?:\.([^\s{}"=]+)|#([^\s{}"=]+)|([A-Za-z_][A-Za-z0-9_:.-]*)="([^"]*)")/y;
  let i = 0;
  while (i < inside.length) {
    if (inside.slice(i).trim() === '') break;
    re.lastIndex = i;
    const m = re.exec(inside);
    assert.ok(m, `C-010: ${where}: not a pandoc attribute block: {${inside}}`);
    if (m[1] !== undefined) classes.push(m[1]);
    if (m[3] !== undefined) {
      assert.ok(!Object.prototype.hasOwnProperty.call(pairs, m[3]), `C-010: ${where}: attribute ${m[3]} is repeated`);
      pairs[m[3]] = m[4];
    }
    i = re.lastIndex;
  }
  return { classes, pairs };
}

/**
 * The mark an attribute block makes, or null when it carries no `report-` class. Fails the test
 * when the block carries more than one class, a `report-` class C-010 does not name, or a class on
 * a construct C-010 does not put it on.
 * @param {{ classes: string[], pairs: Record<string, string> }} attrs
 * @param {'div' | 'span' | 'image'} construct
 * @param {string} where
 * @returns {Mark | null}
 */
function markdownMark(attrs, construct, where) {
  const report = attrs.classes.filter((c) => c.startsWith('report-'));
  if (report.length === 0) return null;
  assert.equal(attrs.classes.length, 1, `C-010: ${where}: a mark's attributes hold one class, got ${JSON.stringify(attrs.classes)}`);
  const cls = report[0];
  const spec = /** @type {any} */ (MD_CLASSES)[cls];
  assert.ok(spec, `C-010: ${where}: no attribute block carries the class ${cls}; the only report- classes are C-010's`);
  assert.equal(spec.construct, construct, `C-010: ${where}: class ${cls} is on a ${spec.construct}, not a ${construct}`);
  const m = mark(spec.type, where);
  const need = (/** @type {string} */ key) => {
    assert.ok(Object.prototype.hasOwnProperty.call(attrs.pairs, key), `C-010: ${where}: the ${cls} mark carries ${key}`);
    return attrs.pairs[key];
  };
  if (m.type === 'section') m.values.sectionKind = need('data-section');
  if (m.type === 'hazard') { m.values.hazardId = need('data-hazard'); m.values.band = need('data-rating-band'); }
  if (m.type === 'omitted') { m.values.hazardId = need('data-hazard'); m.values.reason = need('data-omission-reason'); }
  if (m.type === 'record') { m.values.recordKind = need('data-record-kind'); m.values.recordId = need('data-record-id'); }
  if (m.type === 'control') { m.values.controlId = need('data-control'); m.values.state = need('data-control-state'); m.values.controlKind = need('data-control-kind'); }
  if (m.type === 'bowtie') m.values.hazardId = need('data-hazard');
  return m;
}

const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const SVG_URI = 'data:image/svg+xml;base64,';

/**
 * Read the inline content of one div — its own lines joined with newlines — adding a mark to
 * `into` for every bracketed span and image with a `report-` class and returning the text outside
 * them. Escape-aware: a backslash and the character after it are text.
 * @param {string} content
 * @param {Mark} into
 * @param {string} where
 * @returns {string} the raw text outside every span and image, for `markdownText`
 */
function inline(content, into, where) {
  let out = '';
  let i = 0;
  /** @param {number} from @param {string} close @returns {number} the index of the first unescaped `close` */
  const find = (from, close) => {
    for (let k = from; k < content.length; k += 1) {
      if (content[k] === '\\') { k += 1; continue; }
      if (content[k] === close) return k;
    }
    return -1;
  };
  while (i < content.length) {
    const ch = content[i];
    if (ch === '\\') { out += content.slice(i, i + 2); i += 2; continue; }
    const image = ch === '!' && content[i + 1] === '[';
    if (image || ch === '[') {
      const open = image ? i + 1 : i;
      const closeBracket = find(open + 1, ']');
      let k = closeBracket + 1;
      let url = null;
      if (closeBracket >= 0 && image && content[k] === '(') {
        const closeParen = content.indexOf(')', k);
        if (closeParen >= 0) { url = content.slice(k + 1, closeParen); k = closeParen + 1; }
      }
      if (closeBracket >= 0 && content[k] === '{') {
        const closeBrace = content.indexOf('}', k);
        assert.ok(closeBrace >= 0, `C-010: ${where}: an attribute block is not closed`);
        const attrs = parseAttributes(content.slice(k + 1, closeBrace), where);
        const m = markdownMark(attrs, image ? 'image' : 'span', `${where} ${image ? 'image' : 'span'}`);
        if (m) {
          const inner = content.slice(open + 1, closeBracket);
          if (m.type === 'bowtie') {
            assert.ok(url !== null && url.startsWith(SVG_URI), `C-010: ${where}: a bow-tie's source is data:image/svg+xml;base64,`);
            const b64 = /** @type {string} */ (url).slice(SVG_URI.length);
            assert.ok(BASE64_RE.test(b64), `C-010: ${where}: a bow-tie's source is standard padded base64 with no line breaks`);
            m.svg = Buffer.from(b64, 'base64').toString('utf8');
            assert.equal(Buffer.from(m.svg, 'utf8').toString('base64'), b64, `C-010: ${where}: the base64 is of the UTF-8 bytes of the svg text`);
          } else {
            m.text = markdownText(inline(inner, m, `${where} span`));
          }
          into.marks.push(m);
          i = closeBrace + 1;
          continue;
        }
        if (!image) out += content.slice(open + 1, closeBracket);
        i = closeBrace + 1;
        continue;
      }
    }
    if (ch === '{') {
      const closeBrace = content.indexOf('}', i);
      if (closeBrace > i) {
        const attrs = parseAttributes(content.slice(i + 1, closeBrace), where);
        assert.ok(!attrs.classes.some((c) => c.startsWith('report-')), `C-010: ${where}: no attribute block but a mark's carries a report- class`);
        i = closeBrace + 1;
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Parse a Markdown document in C-010's syntax into the mark model: `\n` line endings, no `\r` and
 * no tab, one final `\n`; the metadata block; fenced divs opened by a line of at least three
 * colons and an attribute block, closed by a line of colons alone, every div closed; spans and
 * images within them. Returns the marks and the title line's text.
 * @param {string} text
 * @returns {{ root: Mark, titleLine: string }}
 */
export function markdownMarks(text) {
  assert.equal(typeof text, 'string', 'C-010: the document is a string');
  assert.ok(!text.includes('\r'), 'C-010: the text holds no \\r');
  assert.ok(!text.includes('\t'), 'C-010: the text holds no tab');
  assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'), 'C-010: the text ends with one \\n');
  const lines = text.slice(0, -1).split('\n');
  assert.equal(lines[0], '---', 'C-010: the text begins with the line ---');
  assert.ok(lines.length >= 3 && lines[1].startsWith('title: "') && lines[1].endsWith('"') && lines[1].length >= 'title: ""'.length, `C-010: the second line is title: "..."; got ${JSON.stringify(lines[1])}`);
  assert.equal(lines[2], '---', 'C-010: the metadata block is closed by the line --- after the title line');
  const titleLine = lines[1];

  const root = mark('header', 'the document');
  /** @type {Array<{ mark: Mark, lines: string[] }>} */
  const stack = [{ mark: root, lines: [] }];
  const flush = (/** @type {{ mark: Mark, lines: string[] }} */ frame) => {
    const raw = inline(frame.lines.join('\n'), frame.mark, frame.mark.where);
    if (frame.mark !== root) frame.mark.text = normalise([frame.mark.text, markdownText(raw)].join(' '));
    frame.lines = [];
  };
  for (let n = 3; n < lines.length; n += 1) {
    const line = lines[n];
    const where = `line ${n + 1}`;
    const open = /^:{3,} *\{([^{}]*)\} *$/.exec(line);
    if (open) {
      flush(stack[stack.length - 1]);
      const attrs = parseAttributes(open[1], where);
      const m = markdownMark(attrs, 'div', `${where} div`) ?? mark('header', `${where} unmarked div`);
      const unmarked = !attrs.classes.some((c) => c.startsWith('report-'));
      if (!unmarked) stack[stack.length - 1].mark.marks.push(m);
      stack.push({ mark: unmarked ? stack[stack.length - 1].mark : m, lines: [] });
      continue;
    }
    if (/^:{3,} *$/.test(line)) {
      assert.ok(stack.length > 1, `C-010: ${where}: a div is closed that was not opened`);
      flush(stack[stack.length - 1]);
      stack.pop();
      continue;
    }
    assert.ok(!/^:{3,}/.test(line), `C-010: ${where}: a line of colons is a div's opening with its attributes or a closing alone, got ${JSON.stringify(line)}`);
    stack[stack.length - 1].lines.push(line);
  }
  assert.equal(stack.length, 1, 'C-010: every div opened is closed');
  flush(stack[0]);
  return { root, titleLine };
}

/**
 * C-010's title line for a report title: `title: "`, the normalised title Markdown-escaped and
 * then with each `\` and `"` preceded by `\`, and `"`.
 * @param {string} title
 * @returns {string}
 */
export function expectedTitleLine(title) {
  return `title: "${markdownEscape(normalise(title)).replace(/[\\"]/g, (c) => `\\${c}`)}"`;
}

/**
 * Every clause over both documents of one report (C-008 to C-010), and that the two hold the same
 * things. Returns both texts.
 * @param {Report} r
 */
export async function assertDocuments(r) {
  const html = await reports.renderReportHtml(r);
  const md = await reports.renderReportMarkdown(r);
  const h = htmlMarks(html, r);
  await assertMarks(h.root, r, 'HTML');
  const m = markdownMarks(md);
  assert.equal(m.titleLine, expectedTitleLine(r.title), 'C-010: the title line holds the normalised title, Markdown-escaped, then YAML-escaped');
  await assertMarks(m.root, r, 'Markdown');
  assert.deepEqual(summary(m.root), summary(h.root), 'C-008: the two documents of one report hold the same things');
  return { html, md, htmlRoot: h.root, markdownRoot: m.root };
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
 * A call rejects with `type`, and `body` is deep-equal to what it was (section 4).
 * @param {() => Promise<unknown>} call
 * @param {Function} type
 * @param {DataBody | null} body
 * @param {string} what
 * @returns {Promise<any>}
 */
export async function assertRefused(call, type, body, what) {
  const before = body === null ? null : snapshot(body);
  const e = await rejectionOf(call, what);
  assert.ok(e instanceof type, `${what}: rejects with ${type.name}, got ${e && e.name}: ${String(e && e.message)}`);
  if (body !== null) assert.deepEqual(body, before, `${what}: body unchanged`);
  return e;
}

/**
 * Section 4's "that error unchanged": the same class, message, and carried fields as the owning
 * module's own rejection on the same body.
 * @param {any} actual
 * @param {any} expected
 * @param {string} what
 */
export function assertSameError(actual, expected, what) {
  assert.ok(actual instanceof Error, `${what}: rejects with an Error, got ${String(actual)}`);
  assert.equal(actual.constructor, expected.constructor, `${what}: rejects with ${expected.name}, got ${actual.name}: ${actual.message}`);
  assert.equal(actual.message, expected.message, `${what}: the error is the owning module's, unchanged`);
  assert.deepEqual(plain({ ...actual }), plain({ ...expected }), `${what}: the error carries what the owning module's carries`);
}

// ------------------------------------------------------------------ ambient reads (C-003, C-008)

/**
 * Run `fn` with the browser's storage, a document, and the clock replaced by spies that record
 * every use: `localStorage`, `sessionStorage`, and `document` as proxies that record any property
 * read, and `Date` recording `Date.now()` and `new Date()` with no argument. Restored after.
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ clock?: boolean }} [options] whether to spy on `Date` as well
 * @returns {Promise<{ result: T, uses: string[] }>}
 */
export async function withAmbientSpies(fn, options = {}) {
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
  if (options.clock) globalThis.Date = /** @type {DateConstructor} */ (SpyDate);
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

/**
 * @template T
 * @param {() => number} random
 * @param {readonly T[]} list
 * @returns {T}
 */
export function oneOf(random, list) {
  return list[pick(random, list.length)];
}

/** Words a stored text is made of: both syntaxes' special characters, look-alikes of every mark, other scripts, and one long word. */
export const WORDS = Object.freeze([
  'loss', 'of', 'control', 'fire', 'A&B', '<b>', 'x<y', 'y>x', '"quoted"', "it's", '&amp;', '&#60;', ']]>', '<!--', '-->',
  'url(#a)', 'onload="x"', '@import', '*bold*', '_under_', '#1', '[link](x)', '{.report-hazard}', ':::', '\\', '`code`',
  '---', '|', '~~', '$math$', '<svg>', 'data-report-header="x"', '火災', 'Überlast', '🔥', 'a',
  'Supercalifragilisticexpialidociousandthensomemorelettersbeyondanylinewidthanyonewoulddrawatall',
]);

/** Whitespace between words: space, tab, and newline only. */
const GAPS = Object.freeze([' ', ' ', ' ', '  ', '\t', '\n', ' \n  ']);

/**
 * A stored text as a trimmed, non-empty user entry, with the whitespace inside it left as typed.
 * @param {() => number} random
 * @returns {string}
 */
export function randomText(random) {
  const n = 1 + pick(random, pick(random, 4) === 0 ? 20 : 6);
  let s = oneOf(random, WORDS);
  for (let k = 1; k < n; k += 1) s += oneOf(random, GAPS) + oneOf(random, WORDS);
  return s;
}

/**
 * A well-formed report built directly from the generator (C-012), for drawing alone.
 * @param {() => number} random
 * @returns {Report}
 */
export function randomReport(random) {
  const controlKinds = ['preventative', 'mitigating'];
  const states = ['confirmed', 'excluded', 'awaiting'];
  const reasons = ['malformed-control', 'malformed-rating', 'malformed-justification'];
  const levels = [null, 1, 2, 3, 4, 5];
  const letters = [null, 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
  let seq = 1;
  const nextHazard = () => hazardId.fromSequence(seq++);
  const controlPool = Array.from({ length: 4 }, (_, k) => ({ controlId: orderedUuid(k + 1, 0xc), title: randomText(random) }));
  const hazards = Array.from({ length: pick(random, 4) }, () => ({
    hazardId: nextHazard(),
    title: randomText(random),
    reportId: normalise(randomText(random)),
    controls: controlPool.filter(() => pick(random, 2) === 0).map((c) => {
      const state = oneOf(random, states);
      return { controlId: c.controlId, title: c.title, controlKind: oneOf(random, controlKinds), state, justificationText: state === 'excluded' ? randomText(random) : null };
    }),
    residual: { consequence: oneOf(random, levels), likelihood: oneOf(random, letters) },
  }));
  const omitted = Array.from({ length: pick(random, 3) }, () => ({ hazardId: nextHazard(), reason: oneOf(random, reasons) }));
  /** @type {any[]} */
  const sections = [];
  const hazardsAt = pick(random, 3);
  for (let k = 0; k < 3; k += 1) {
    if (k === hazardsAt) sections.push({ sectionKind: 'hazards' });
    if (pick(random, 2) === 0) sections.push({ sectionKind: oneOf(random, ['heading', 'text']), text: randomText(random) });
  }
  const kinds = /** @type {const} */ (['platform', 'hazard', 'control']);
  return reportRow(orderedUuid(1 + pick(random, 1000), 0xd), {
    title: randomText(random),
    templateName: randomText(random),
    platformName: randomText(random),
    sections,
    hazards,
    omitted,
    bowties: hazards.filter(() => pick(random, 2) === 0).map((h) => ({ hazardId: h.hazardId, svg: SMALL_SVG })),
    outOfDate: Array.from({ length: pick(random, 3) }, (_, k) => ({
      ref: { kind: oneOf(random, kinds), id: orderedUuid(k + 1, 0x5) },
      name: randomText(random),
      nextDueAest: `2026-0${1 + pick(random, 8)}-1${pick(random, 9)}`,
      lastReviewedAest: pick(random, 2) === 0 ? null : '2025-12-01',
    })),
  });
}

export {
  bowtie, changeLog, hazardId, platformId, rating, registry, reportId, reportTemplateId, reports, rs, schema,
};
