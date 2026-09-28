/**
 * reports, implementing contract version 1.0 (modules/reports/CONTRACT.md). Selected by contract.js
 * unless REPORTS_IMPL=null. Clause IDs (C-nnn) cite the contract.
 *
 * Every operation taking a body first reads `collections['report-template']` and then
 * `collections.report` whole and rejects a malformed entry (C-012), then applies section 4's checks
 * in its stated order. What a report holds is copied from `registry.listPlatformHazards`,
 * `review-schedule.listOverdue`, and `bowtie` at production and never read again (C-003); the two
 * documents are functions of the report alone and of `rating.ratingFor` (C-008), and read no clock.
 */

import { dateAest, dateOfTimestamp, hazardId, platformId, reportId, reportTemplateId, timestampAest, userProfileId, controlId } from '../../../baseline/types.js';
import { nowAest } from '../../../baseline/clock.js';
import * as registry from '../../registry/contract.js';
import { ratingFor } from '../../rating/contract.js';
import { listOverdue } from '../../review-schedule/contract.js';
import { bowtieFor, renderBowtieSvg } from '../../bowtie/contract.js';
import { recordChange } from '../../change-log/contract.js';
import {
  DuplicateBowtieError, HazardNotInReportError, InvalidActError, InvalidReportError, InvalidSectionError, InvalidTemplateNameError,
  InvalidTemplateTitleError, MalformedReportError, MalformedTemplateError, MissingProfileError, OutOfDateNotAcknowledgedError,
  SECTION_KINDS, TemplateNotLiveError, UnincludableKindError, UnknownTemplateError,
} from '../contract.js';

/** @typedef {import('../contract.js').ReportsImplementation} Impl */
/** @typedef {import('../contract.js').ReportTemplate} ReportTemplate */
/** @typedef {import('../contract.js').Report} Report */
/** @typedef {import('../contract.js').TemplateSection} TemplateSection */
/** @typedef {import('../contract.js').OutOfDateRecord} OutOfDateRecord */
/** @typedef {import('../contract.js').ReportHazard} ReportHazard */
/** @typedef {import('../../registry/contract.js').Act} Act */
/** @typedef {import('../../../baseline/types.js').PlatformId} PlatformId */
/** @typedef {import('../../../baseline/types.js').HazardId} HazardId */
/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */
/** @typedef {import('../../../baseline/schema.js').StoredRecord} StoredRecord */

const TEMPLATES = 'report-template';
const REPORTS = 'report';
const STATUSES = Object.freeze(['live', 'retired', 'deleted']);
const INCLUDABLE_KINDS = Object.freeze(['platform', 'hazard', 'control']);
const CONTROL_KINDS = Object.freeze(['preventative', 'mitigating']);
const CONTROL_STATES = Object.freeze(['confirmed', 'excluded', 'awaiting']);
const OMISSION_REASONS = Object.freeze(['malformed-control', 'malformed-rating', 'malformed-justification']);
const LEVELS = Object.freeze([1, 2, 3, 4, 5]);
const LETTERS = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F', 'G']);

// ------------------------------------------------------------------ value checks

/**
 * @param {unknown} v
 * @returns {v is Record<string, any>}
 */
function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * @param {object} o
 * @param {string} key
 */
function has(o, key) {
  return Object.prototype.hasOwnProperty.call(o, key);
}

/**
 * @param {unknown} v
 * @param {(s: string) => unknown} parse a baseline parser, which throws on a bad value
 */
function parses(v, parse) {
  if (typeof v !== 'string') return false;
  try {
    parse(v);
    return true;
  } catch {
    return false;
  }
}

/** @param {unknown} v */
const isProfileId = (v) => parses(v, userProfileId.parse);
/** @param {unknown} v */
const isPlatformId = (v) => parses(v, platformId.parse);
/** @param {unknown} v */
const isTimestamp = (v) => parses(v, timestampAest);
/** @param {unknown} v */
const isDate = (v) => parses(v, dateAest);
/** @param {unknown} v */
const isBlank = (v) => typeof v !== 'string' || v.trim() === '';

/**
 * @param {string} a
 * @param {string} b
 */
const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Trimmed, every run of whitespace one space (section 3).
 * @param {string} s
 */
const normalise = (s) => s.trim().replace(/\s+/g, ' ');

// ------------------------------------------------------------------ the records (C-001, C-012)

/**
 * The first failing field of a section list C-001 would refuse, or null when it would accept it.
 * @param {unknown} sections
 * @returns {{ field: string, detail: string } | null}
 */
function sectionFault(sections) {
  if (!Array.isArray(sections)) return { field: 'sections', detail: 'the sections are not a list' };
  for (let i = 0; i < sections.length; i += 1) {
    const s = sections[i];
    if (!isObject(s)) return { field: `sections[${i}]`, detail: 'the section is not an object' };
    if (!SECTION_KINDS.includes(s.sectionKind)) return { field: `sections[${i}].sectionKind`, detail: 'the section is not a heading, a text, or the hazards' };
    if (s.sectionKind !== 'hazards' && isBlank(s.text)) return { field: `sections[${i}].text`, detail: 'the section has no text' };
  }
  if (sections.filter((s) => s.sectionKind === 'hazards').length !== 1) {
    return { field: 'sections', detail: 'a layout holds exactly one hazards section' };
  }
  return null;
}

/**
 * The header's first failing field, for either kind.
 * @param {Record<string, any>} e
 * @param {string} kind
 * @param {(s: string) => unknown} parseId
 * @returns {string | null}
 */
function headerFault(e, kind, parseId) {
  if (!parses(e.id, parseId)) return 'id';
  if (e.kind !== kind) return 'kind';
  if (!STATUSES.includes(e.status)) return 'status';
  if (!isProfileId(e.createdBy)) return 'createdBy';
  if (!isProfileId(e.updatedBy)) return 'updatedBy';
  if (!isTimestamp(e.createdAtAest)) return 'createdAtAest';
  if (!isTimestamp(e.updatedAtAest)) return 'updatedAtAest';
  return null;
}

/**
 * The first failing field of a stored template, or null when it is a `ReportTemplate`.
 * @param {unknown} e
 * @returns {string | null}
 */
function templateFault(e) {
  if (!isObject(e)) return 'the entry';
  const header = headerFault(e, TEMPLATES, reportTemplateId.parse);
  if (header !== null) return header;
  if (isBlank(e.name)) return 'name';
  if (isBlank(e.title)) return 'title';
  return sectionFault(e.sections)?.field ?? null;
}

/**
 * @param {unknown} residual
 * @returns {boolean}
 */
function isResidual(residual) {
  return isObject(residual)
    && (residual.consequence === null || LEVELS.includes(residual.consequence))
    && (residual.likelihood === null || LETTERS.includes(residual.likelihood));
}

/**
 * The first failing field of a report, or null when it is a `Report` (C-012).
 * @param {unknown} r
 * @returns {string | null}
 */
function reportFault(r) {
  if (!isObject(r)) return 'the report';
  const header = headerFault(r, REPORTS, reportId.parse);
  if (header !== null) return header;
  if (!parses(r.templateId, reportTemplateId.parse)) return 'templateId';
  for (const f of ['templateName', 'title', 'platformName']) if (typeof r[f] !== 'string') return f;
  const sections = sectionFault(r.sections);
  if (sections !== null) return sections.field;
  if (!isPlatformId(r.platformId)) return 'platformId';
  if (!Array.isArray(r.hazards)) return 'hazards';
  for (let i = 0; i < r.hazards.length; i += 1) {
    const h = r.hazards[i];
    const at = `hazards[${i}]`;
    if (!isObject(h)) return at;
    if (!parses(h.hazardId, hazardId.parse)) return `${at}.hazardId`;
    if (typeof h.title !== 'string') return `${at}.title`;
    if (typeof h.reportId !== 'string') return `${at}.reportId`;
    if (!isResidual(h.residual)) return `${at}.residual`;
    if (!Array.isArray(h.controls)) return `${at}.controls`;
    for (let j = 0; j < h.controls.length; j += 1) {
      const c = h.controls[j];
      const cat = `${at}.controls[${j}]`;
      if (!isObject(c)) return cat;
      if (!parses(c.controlId, controlId.parse)) return `${cat}.controlId`;
      if (typeof c.title !== 'string') return `${cat}.title`;
      if (!CONTROL_KINDS.includes(c.controlKind)) return `${cat}.controlKind`;
      if (!CONTROL_STATES.includes(c.state)) return `${cat}.state`;
      if (c.justificationText !== null && typeof c.justificationText !== 'string') return `${cat}.justificationText`;
    }
  }
  if (!Array.isArray(r.omitted)) return 'omitted';
  for (let i = 0; i < r.omitted.length; i += 1) {
    const o = r.omitted[i];
    if (!isObject(o) || !parses(o.hazardId, hazardId.parse)) return `omitted[${i}].hazardId`;
    if (!OMISSION_REASONS.includes(o.reason)) return `omitted[${i}].reason`;
  }
  if (!Array.isArray(r.bowties)) return 'bowties';
  const rows = new Set(r.hazards.map((/** @type {any} */ h) => h.hazardId));
  const drawn = new Set();
  for (let i = 0; i < r.bowties.length; i += 1) {
    const b = r.bowties[i];
    if (!isObject(b) || !rows.has(b.hazardId) || drawn.has(b.hazardId)) return `bowties[${i}].hazardId`;
    if (typeof b.svg !== 'string') return `bowties[${i}].svg`;
    drawn.add(b.hazardId);
  }
  if (!Array.isArray(r.outOfDate)) return 'outOfDate';
  for (let i = 0; i < r.outOfDate.length; i += 1) {
    const o = r.outOfDate[i];
    const at = `outOfDate[${i}]`;
    if (!isObject(o)) return at;
    if (!isObject(o.ref) || !INCLUDABLE_KINDS.includes(o.ref.kind) || typeof o.ref.id !== 'string') return `${at}.ref`;
    if (typeof o.name !== 'string') return `${at}.name`;
    if (!isDate(o.nextDueAest)) return `${at}.nextDueAest`;
    if (o.lastReviewedAest !== null && !isDate(o.lastReviewedAest)) return `${at}.lastReviewedAest`;
  }
  return null;
}

/**
 * Every entry of one collection, each checked; a missing collection is empty (section 4).
 * @template T
 * @param {DataBody} body
 * @param {string} name
 * @param {(e: unknown) => string | null} fault
 * @param {new (key: string, detail: string) => Error} Malformed
 * @returns {T[]}
 */
function readCollection(body, name, fault, Malformed) {
  const rows = /** @type {any} */ (body)?.collections?.[name];
  if (rows === undefined) return [];
  if (!isObject(rows)) throw new Malformed(name, `the ${name} collection is not keyed records`);
  return Object.keys(rows).map((key) => {
    const e = rows[key];
    if (isObject(e) && e.id !== key) throw new Malformed(key, 'its id differs from its key');
    const field = fault(e);
    if (field !== null) throw new Malformed(key, `its ${field} is not well formed`);
    return /** @type {T} */ (e);
  });
}

/**
 * Both collections, templates first (section 4's order).
 * @param {DataBody} body
 * @returns {{ templates: ReportTemplate[], reports: Report[] }}
 */
function readAll(body) {
  const templates = /** @type {ReportTemplate[]} */ (readCollection(body, TEMPLATES, templateFault, MalformedTemplateError));
  const reports = /** @type {Report[]} */ (readCollection(body, REPORTS, reportFault, MalformedReportError));
  return { templates, reports };
}

/**
 * @template {{ status: string, createdAtAest: string, id: string }} T
 * @param {T[]} records
 * @returns {T[]}
 */
function liveInOrder(records) {
  return records.filter((r) => r.status === 'live').sort((a, b) => byString(a.createdAtAest, b.createdAtAest) || byString(a.id, b.id));
}

/**
 * Section 4's profile and act conditions, in their order.
 * @param {unknown} act
 * @returns {Act}
 */
function requireAct(act) {
  if (!isObject(act) || !isObject(act.profile) || !isProfileId(act.profile.id)) throw new MissingProfileError();
  if (!has(act, 'madeForPlatformId')) throw new InvalidActError(undefined);
  const madeFor = act.madeForPlatformId;
  if (madeFor !== null && !isPlatformId(madeFor)) throw new InvalidActError(madeFor);
  return /** @type {Act} */ (act);
}

/**
 * @param {unknown} report
 * @returns {Report}
 */
function requireReport(report) {
  const field = reportFault(report);
  if (field !== null) throw new InvalidReportError(field);
  return /** @type {Report} */ (report);
}

// ------------------------------------------------------------------ writing (C-011)

/**
 * The body with the one record put, then its creation recorded through `change-log`.
 * @param {DataBody} body
 * @param {Act} act
 * @param {string} collection
 * @param {ReportTemplate | Report} record
 * @param {readonly PlatformId[]} affectedPlatformIds
 * @returns {Promise<DataBody>}
 */
async function write(body, act, collection, record, affectedPlatformIds) {
  const withRecord = /** @type {DataBody} */ (/** @type {unknown} */ ({
    ...body,
    collections: { ...body.collections, [collection]: { .../** @type {any} */ (body.collections)?.[collection], [record.id]: record } },
  }));
  const recorded = await recordChange(withRecord, act.profile, {
    records: [{ before: null, after: /** @type {StoredRecord} */ (/** @type {unknown} */ (record)) }],
    madeForPlatformId: act.madeForPlatformId,
    affectedPlatformIds: [...affectedPlatformIds],
  });
  return recorded.body;
}

/**
 * A fresh id held by no record of the list.
 * @template T
 * @param {{ fresh: () => T }} kind
 * @param {{ id: unknown }[]} records
 * @returns {T}
 */
function freshId(kind, records) {
  const ids = new Set(records.map((r) => r.id));
  let id = kind.fresh();
  while (ids.has(id)) id = kind.fresh();
  return id;
}

// ------------------------------------------------------------------ operations: templates

/** @type {Impl['createTemplate']} */
export async function createTemplate(body, act, fields) {
  const { templates } = readAll(body);
  const a = requireAct(act);
  const f = /** @type {Record<string, any>} */ (isObject(fields) ? fields : {});
  if (isBlank(f.name)) throw new InvalidTemplateNameError(f.name);
  if (isBlank(f.title)) throw new InvalidTemplateTitleError(f.title);
  const fault = sectionFault(f.sections);
  if (fault !== null) throw new InvalidSectionError(fault.field, fault.detail);
  const at = nowAest();
  /** @type {ReportTemplate} */
  const template = {
    id: freshId(reportTemplateId, templates),
    kind: TEMPLATES,
    status: 'live',
    createdBy: a.profile.id,
    createdAtAest: at,
    updatedBy: a.profile.id,
    updatedAtAest: at,
    name: f.name.trim(),
    title: f.title.trim(),
    sections: f.sections.map((/** @type {any} */ s) => (s.sectionKind === 'hazards'
      ? { sectionKind: 'hazards' }
      : { sectionKind: s.sectionKind, text: s.text.trim() })),
  };
  return { body: await write(body, a, TEMPLATES, template, []), template };
}

/** @type {Impl['getTemplate']} */
export async function getTemplate(body, id) {
  return readAll(body).templates.find((t) => t.id === id) ?? null;
}

/** @type {Impl['listTemplates']} */
export async function listTemplates(body) {
  return liveInOrder(readAll(body).templates);
}

// ------------------------------------------------------------------ operations: producing a report

/**
 * The platform's one query, refused for a platform that is not live (section 4 rows 10 to 12).
 * @param {DataBody} body
 * @param {PlatformId} platform
 */
async function liveQuery(body, platform) {
  const q = await registry.listPlatformHazards(body, platform);
  if (q.platform.status !== 'live') throw new registry.PlatformNotLiveError(q.platform.id, q.platform.status);
  return q;
}

/**
 * C-006 over one query: `listOverdue` filtered to the records a report on the platform uses.
 * @param {DataBody} body
 * @param {import('../../registry/contract.js').PlatformHazards} q
 * @returns {Promise<OutOfDateRecord[]>}
 */
async function outOfDateOf(body, q) {
  /** @type {Map<string, string>} */
  const names = new Map([[`platform:${q.platform.id}`, q.platform.name]]);
  for (const row of q.rows) {
    names.set(`hazard:${row.hazard.id}`, row.hazard.title);
    for (const c of row.controls) names.set(`control:${c.control.id}`, c.control.title);
  }
  const overdue = await listOverdue(body);
  return overdue
    .filter((s) => names.has(`${s.ref.kind}:${s.ref.id}`))
    .map((s) => {
      const schedule = /** @type {NonNullable<typeof s.schedule>} */ (s.schedule);
      return {
        ref: { kind: s.ref.kind, id: s.ref.id },
        name: /** @type {string} */ (names.get(`${s.ref.kind}:${s.ref.id}`)),
        nextDueAest: schedule.nextDueAest,
        lastReviewedAest: schedule.lastReviewedAest,
      };
    });
}

/** @type {Impl['outOfDateFor']} */
export async function outOfDateFor(body, platform) {
  readAll(body);
  return outOfDateOf(body, await liveQuery(body, platform));
}

/** @type {Impl['produceReport']} */
export async function produceReport(body, act, fields) {
  const { templates, reports } = readAll(body);
  const a = requireAct(act);
  const f = /** @type {Record<string, any>} */ (isObject(fields) ? fields : {});
  const template = templates.find((t) => t.id === f.templateId);
  if (template === undefined) throw new UnknownTemplateError(f.templateId);
  if (template.status !== 'live') throw new TemplateNotLiveError(template.id, template.status);
  const platform = /** @type {PlatformId} */ (f.platformId);
  const q = await liveQuery(body, platform);
  const outOfDate = await outOfDateOf(body, q);

  // C-005: every hazard asked for is a row, then each is asked for once.
  const asked = f.bowtieHazardIds;
  if (!Array.isArray(asked)) throw new HazardNotInReportError(asked, platform);
  const rowIds = q.rows.map((row) => row.hazard.id);
  for (const id of asked) if (!rowIds.includes(id)) throw new HazardNotInReportError(id, platform);
  const seen = new Set();
  for (const id of asked) {
    if (seen.has(id)) throw new DuplicateBowtieError(id);
    seen.add(id);
  }

  // C-006: exactly the list as it is now, in its order.
  const given = f.acknowledgedOutOfDate;
  const acknowledged = Array.isArray(given) && given.length === outOfDate.length
    && outOfDate.every((o, i) => isObject(given[i]) && given[i].kind === o.ref.kind && given[i].id === o.ref.id);
  if (!acknowledged) throw new OutOfDateNotAcknowledgedError(outOfDate, given);

  /** @type {Report['bowties'][number][]} */
  const bowties = [];
  for (const id of rowIds) {
    if (!seen.has(id)) continue;
    bowties.push({ hazardId: id, svg: await renderBowtieSvg(await bowtieFor(body, id, platform)) });
  }

  const at = nowAest();
  /** @type {Report} */
  const report = {
    id: freshId(reportId, reports),
    kind: REPORTS,
    status: 'live',
    createdBy: a.profile.id,
    createdAtAest: at,
    updatedBy: a.profile.id,
    updatedAtAest: at,
    templateId: template.id,
    templateName: template.name,
    title: template.title,
    sections: JSON.parse(JSON.stringify(template.sections)),
    platformId: q.platform.id,
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
    bowties,
    outOfDate,
  };
  const affected = await registry.platformsAffected(body, { kind: 'platform', id: q.platform.id });
  return { body: await write(body, a, REPORTS, report, affected), report };
}

// ------------------------------------------------------------------ operations: reading reports

/** @type {Impl['getReport']} */
export async function getReport(body, id) {
  return readAll(body).reports.find((r) => r.id === id) ?? null;
}

/** @type {Impl['listReports']} */
export async function listReports(body) {
  return liveInOrder(readAll(body).reports);
}

/**
 * C-007, read from a report already checked.
 * @param {Report} r
 */
function includes(r) {
  /** @type {string[]} */
  const controlIds = [];
  for (const h of r.hazards) for (const c of h.controls) if (!controlIds.includes(c.controlId)) controlIds.push(c.controlId);
  return {
    platformIds: [r.platformId],
    hazardIds: r.hazards.map((h) => h.hazardId),
    omittedHazardIds: r.omitted.map((o) => o.hazardId),
    controlIds: /** @type {any[]} */ (controlIds),
  };
}

/** @type {Impl['includesOf']} */
export async function includesOf(report) {
  return includes(requireReport(report));
}

/** @type {Impl['reportsIncluding']} */
export async function reportsIncluding(body, ref) {
  const { reports } = readAll(body);
  const kind = isObject(ref) ? ref.kind : undefined;
  if (!INCLUDABLE_KINDS.includes(/** @type {any} */ (kind))) throw new UnincludableKindError(kind);
  const list = /** @type {'platformIds' | 'hazardIds' | 'controlIds'} */ ({ platform: 'platformIds', hazard: 'hazardIds', control: 'controlIds' }[/** @type {'platform'} */ (kind)]);
  const id = /** @type {Record<string, any>} */ (ref).id;
  return liveInOrder(reports).filter((r) => /** @type {string[]} */ (includes(r)[list]).includes(id));
}

// ------------------------------------------------------------------ drawing (C-008 to C-010)

/**
 * What both documents draw, in C-008's order: every text normalised, and the band for each hazard.
 * @param {Report} r
 */
async function drawable(r) {
  const bands = [];
  for (const h of r.hazards) bands.push((await ratingFor(h.residual.consequence, h.residual.likelihood)).band);
  return { produced: dateOfTimestamp(r.createdAtAest), bands };
}

/**
 * @param {unknown} v a residual value, or null
 */
const valueText = (v) => (v === null ? 'not entered' : String(v));

/**
 * Entity-escaped for C-009: the four references and nothing else.
 * @param {string} s
 */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * A stored text as the HTML writes it: normalised, then escaped.
 * @param {string} s
 */
const htmlText = (s) => esc(normalise(s));

const STYLE = 'body{font-family:sans-serif;margin:2em;line-height:1.4}'
  + 'article{border-top:1px solid #999;margin-top:1em;padding-top:0.5em}'
  + '[data-report-out-of-date]{border:2px solid #b00;padding:0.5em 1em}'
  + '[data-report-bowtie] svg{max-width:100%;height:auto}';

/** @type {Impl['renderReportHtml']} */
export async function renderReportHtml(report) {
  const r = requireReport(report);
  const { produced, bands } = await drawable(r);
  const out = [];
  out.push(`<header data-report-header=""><h1>${htmlText(r.title)}</h1><p>Platform: ${htmlText(r.platformName)}</p><p>Produced ${produced}</p></header>`);
  if (r.outOfDate.length > 0) {
    const items = r.outOfDate.map((o) => `<li data-record-kind="${esc(o.ref.kind)}" data-record-id="${esc(o.ref.id)}">${esc(o.ref.kind)} ${esc(o.ref.id)}: ${htmlText(o.name)}, due for review ${o.nextDueAest}, ${o.lastReviewedAest === null ? 'never reviewed' : `last reviewed ${o.lastReviewedAest}`}</li>`);
    out.push(`<section data-report-out-of-date=""><h2>Records past their review due date</h2><ul>${items.join('')}</ul></section>`);
  }
  for (const s of r.sections) {
    if (s.sectionKind === 'heading') out.push(`<section data-report-section="heading"><h2>${htmlText(s.text)}</h2></section>`);
    else if (s.sectionKind === 'text') out.push(`<section data-report-section="text"><p>${htmlText(s.text)}</p></section>`);
    else {
      const parts = r.hazards.map((h, k) => {
        const controls = h.controls.map((c) => `<li data-report-control="${esc(c.controlId)}" data-control-state="${c.state}" data-control-kind="${c.controlKind}">${htmlText(c.title)} (${c.state}, ${c.controlKind})${c.justificationText === null ? '' : `: ${htmlText(c.justificationText)}`}</li>`);
        const drawn = r.bowties.find((b) => b.hazardId === h.hazardId);
        return `<article data-report-hazard="${esc(h.hazardId)}" data-rating-band="${esc(bands[k])}">`
          + `<h3>${htmlText(h.reportId)} ${htmlText(h.title)}</h3>`
          + `<p>Hazard ${esc(h.hazardId)}. Residual consequence ${valueText(h.residual.consequence)}, likelihood ${valueText(h.residual.likelihood)}: ${esc(bands[k])}</p>`
          + (controls.length > 0 ? `<ul>${controls.join('')}</ul>` : '')
          + (drawn === undefined ? '' : `<div data-report-bowtie="${esc(h.hazardId)}">${drawn.svg}</div>`)
          + '</article>';
      });
      for (const o of r.omitted) {
        parts.push(`<p data-report-omitted="${esc(o.hazardId)}" data-omission-reason="${o.reason}">Hazard ${esc(o.hazardId)} is omitted: ${o.reason}</p>`);
      }
      out.push(`<section data-report-section="hazards">${parts.join('\n')}</section>`);
    }
  }
  return '<!DOCTYPE html>\n'
    + `<html lang="en"><head><meta charset="utf-8"/><title>${htmlText(r.title)}</title><style>${STYLE}</style></head>\n`
    + `<body>\n${out.join('\n')}\n</body></html>`;
}

/**
 * Each ASCII punctuation character preceded by a backslash (C-010's Markdown escape).
 * @param {string} s
 */
const mdEscape = (s) => s.replace(/[!-/:-@[-`{-~]/g, (c) => `\\${c}`);

/**
 * A stored text as the Markdown writes it: normalised, then escaped.
 * @param {string} s
 */
const mdText = (s) => mdEscape(normalise(s));

/**
 * The standard padded base64 of a text's UTF-8 bytes (C-010), without a Node-only API.
 * @param {string} s
 */
function base64Utf8(s) {
  let binary = '';
  for (const byte of new TextEncoder().encode(s)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** @type {Impl['renderReportMarkdown']} */
export async function renderReportMarkdown(report) {
  const r = requireReport(report);
  const { produced, bands } = await drawable(r);
  const title = mdText(r.title).replace(/[\\"]/g, (c) => `\\${c}`);
  /** @type {string[]} */
  const blocks = [];
  blocks.push(['::::: {.report-header}', `# ${mdText(r.title)}`, '', mdEscape(`Platform: `) + mdText(r.platformName), '', mdEscape(`Produced ${produced}`), ':::::'].join('\n'));
  if (r.outOfDate.length > 0) {
    const items = r.outOfDate.map((o) => `[${mdEscape(`${o.ref.kind} ${o.ref.id}: `)}${mdText(o.name)}${mdEscape(`, due for review ${o.nextDueAest}, ${o.lastReviewedAest === null ? 'never reviewed' : `last reviewed ${o.lastReviewedAest}`}`)}]{.report-stale data-record-kind="${o.ref.kind}" data-record-id="${o.ref.id}"}`);
    blocks.push(['::::: {.report-out-of-date}', `## ${mdEscape('Records past their review due date')}`, '', items.join('\n\n'), ':::::'].join('\n'));
  }
  for (const s of r.sections) {
    if (s.sectionKind === 'heading') blocks.push(['::::: {.report-section data-section="heading"}', `## ${mdText(s.text)}`, ':::::'].join('\n'));
    else if (s.sectionKind === 'text') blocks.push(['::::: {.report-section data-section="text"}', mdText(s.text), ':::::'].join('\n'));
    else {
      const parts = r.hazards.map((h, k) => {
        const lines = [
          `:::: {.report-hazard data-hazard="${h.hazardId}" data-rating-band="${bands[k]}"}`,
          `### ${mdText(h.reportId)} ${mdText(h.title)}`,
          '',
          mdEscape(`Hazard ${h.hazardId}. Residual consequence ${valueText(h.residual.consequence)}, likelihood ${valueText(h.residual.likelihood)}: ${bands[k]}`),
        ];
        for (const c of h.controls) {
          const reason = c.justificationText === null ? '' : `${mdEscape(': ')}${mdText(c.justificationText)}`;
          lines.push('', `[${mdText(c.title)} ${mdEscape(`(${c.state}, ${c.controlKind})`)}${reason}]{.report-control data-control="${c.controlId}" data-control-state="${c.state}" data-control-kind="${c.controlKind}"}`);
        }
        const drawn = r.bowties.find((b) => b.hazardId === h.hazardId);
        if (drawn !== undefined) {
          lines.push('', `![${mdEscape(`Bow-tie of ${h.hazardId}`)}](data:image/svg+xml;base64,${base64Utf8(drawn.svg)}){.report-bowtie data-hazard="${h.hazardId}"}`);
        }
        lines.push('::::');
        return lines.join('\n');
      });
      for (const o of r.omitted) {
        parts.push([`:::: {.report-omitted data-hazard="${o.hazardId}" data-omission-reason="${o.reason}"}`, mdEscape(`Hazard ${o.hazardId} is omitted: ${o.reason}`), '::::'].join('\n'));
      }
      blocks.push(['::::: {.report-section data-section="hazards"}', ...parts.flatMap((p) => ['', p]), ':::::'].join('\n'));
    }
  }
  return `---\ntitle: "${title}"\n---\n\n${blocks.join('\n\n')}\n`;
}
