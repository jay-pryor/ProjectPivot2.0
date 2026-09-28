/**
 * Contract: reports, version 1.0. The module's sole import surface (CORE-CON-003). Owns the record
 * kinds `report-template` and `report` (DEC-004, DEC-005), which baseline has held since CHG-001
 * and no module has written until now (REQ-007, REQ-016, REQ-027, REQ-046, REQ-061). It is the
 * second of the two composing modules DEC-004 placed above the record modules: what a report on a
 * platform holds is read through `registry.listPlatformHazards` (registry C-019), what is past its
 * review due date through `review-schedule.listOverdue` (review-schedule C-009), and a bow-tie
 * through `bowtie.bowtieFor` and `bowtie.renderBowtieSvg` (bowtie C-001, C-004), and nothing of
 * any of them is derived here a second way.
 *
 * A produced report is a stored record of what it held at the moment it was produced (DEC-032):
 * the template's layout, the platform, each hazard with its controls and residual values, each
 * hazard named as omitted, each bow-tie as the drawing generated then, and each record that was
 * past its review due date. Its two output documents, self-contained HTML and Pandoc Markdown,
 * are functions of that record alone, so the same report downloaded twice is the same text and a
 * report read a year later says what it said when it was produced (SL-09 criteria 4 and 5).
 *
 * A report is never produced from out-of-date data without the caller having been given the
 * list: `produceReport` refuses unless it is handed exactly the records `outOfDateFor` names for
 * that platform at that moment (C-006, DEC-034; HZ-009). Like every record module, each changing
 * operation appends its own entry through `change-log.recordChange` in the same call (C-011).
 *
 * Every operation is a function of the working `DataBody` a consumer holds between `store.load`
 * and `store.save` (DEC-006), or of a `Report` passed in: this module reads no folder and writes
 * nothing anywhere. Writing a document to a file is `views`' act over `store.writeExportFile`
 * (DEC-030). Clause IDs (C-nnn) are defined in CONTRACT.md beside this file and cited by the
 * conformance suite.
 *
 * Every rejection this module passes on from `registry`, `review-schedule`, `bowtie`, or
 * `change-log` is that module's own error class, unchanged, and so are `registry`'s
 * `UnknownPlatformError` and `PlatformNotLiveError`, which this module signals for a platform a
 * report cannot be produced on; every other error class below is this module's.
 *
 * Every operation delegates to the selected implementation: `src/reports.js` in production,
 * `null_double.js` when `REPORTS_IMPL=null` is set in the environment (CORE-TST-002, rung 1). The
 * null double is test-only and never embedded in the built pivot.html, which is why its specifier
 * is held in a variable: the build inlines only quoted import specifiers.
 */

/** @typedef {import('../../baseline/types.js').ReportId} ReportId */
/** @typedef {import('../../baseline/types.js').ReportTemplateId} ReportTemplateId */
/** @typedef {import('../../baseline/types.js').HazardId} HazardId */
/** @typedef {import('../../baseline/types.js').ControlId} ControlId */
/** @typedef {import('../../baseline/types.js').PlatformId} PlatformId */
/** @typedef {import('../../baseline/types.js').PlatformReportId} PlatformReportId */
/** @typedef {import('../../baseline/types.js').UserProfileId} UserProfileId */
/** @typedef {import('../../baseline/types.js').ControlKind} ControlKind */
/** @typedef {import('../../baseline/types.js').DateAest} DateAest */
/** @typedef {import('../../baseline/types.js').TimestampAest} TimestampAest */
/** @typedef {import('../../baseline/types.js').RecordKind} RecordKind */
/** @typedef {import('../../baseline/types.js').RecordStatus} RecordStatus */
/** @typedef {import('../../baseline/types.js').RecordRef} RecordRef */
/** @typedef {import('../../baseline/schema.js').DataBody} DataBody */
/** @typedef {import('../registry/contract.js').Act} Act */
/** @typedef {import('../registry/contract.js').RatingValues} RatingValues */
/** @typedef {import('../registry/contract.js').ControlPlatformState} ControlPlatformState */
/** @typedef {import('../registry/contract.js').OmissionReason} OmissionReason */
/** @typedef {import('../bowtie/contract.js').BowtieSvgText} BowtieSvgText */

// ------------------------------------------------------------------ what a template is made of

/**
 * The three kinds of section a template is laid out from, in no order of their own (C-002). A
 * fourth is an Interface change, not a value a caller may pass.
 * @typedef {'heading' | 'text' | 'hazards'} SectionKind
 */
export const SECTION_KINDS = Object.freeze(/** @type {readonly SectionKind[]} */ (['heading', 'text', 'hazards']));

/**
 * One section of a template, in the place the template puts it (C-002). `heading` and `text` carry
 * words the user wrote, which every report from the template repeats; `hazards` is where the
 * report's hazards, their controls and residual ratings, their bow-ties, and its omitted hazards
 * go, and a template has exactly one (C-001).
 * @typedef {{ sectionKind: 'heading', text: string }
 *   | { sectionKind: 'text', text: string }
 *   | { sectionKind: 'hazards' }} TemplateSection
 */

// ------------------------------------------------------------------ record shapes

/**
 * The fields every record of this module carries, from the baseline record header (schema.js
 * `RecordHeader`), narrowed to the kind. `createdBy` and `createdAtAest` are who made the record
 * and when; nothing at 1.0 changes one afterwards, so `updatedBy` and `updatedAtAest` equal them.
 * `status` is always `live` at 1.0 (C-012).
 * @template {RecordKind} K
 * @template I
 * @typedef {object} ReportsHeader
 * @property {I} id
 * @property {K} kind
 * @property {RecordStatus} status
 * @property {UserProfileId} createdBy
 * @property {TimestampAest} createdAtAest
 * @property {UserProfileId} updatedBy
 * @property {TimestampAest} updatedAtAest
 */

/**
 * A saved output document template, in `collections['report-template']` keyed by its id (C-001,
 * C-002; REQ-046). `name` is what a user picks it by; `title` is the title every report from it
 * carries. Written once and never changed at 1.0.
 * @typedef {ReportsHeader<'report-template', ReportTemplateId> & {
 *   name: string,
 *   title: string,
 *   sections: readonly TemplateSection[],
 * }} ReportTemplate
 */

/**
 * One of a hazard's controls as a report recorded it: the control's identity and title, the side it
 * sits on, its state on the report's platform, and the stored reason when that state is
 * `excluded`, all as `registry.listPlatformHazards` gave them at production (C-004).
 * @typedef {object} ReportControl
 * @property {ControlId} controlId
 * @property {string} title
 * @property {ControlKind} controlKind
 * @property {ControlPlatformState} state
 * @property {string | null} justificationText the live justification's text; null unless `excluded`
 */

/**
 * One hazard as a report recorded it: a row of `registry.listPlatformHazards` at production (C-004).
 * `residual` is the consequence and likelihood an assessor entered and never a band; the band is
 * `rating.ratingFor`'s, asked when a document is drawn (C-008, DEC-032).
 * @typedef {object} ReportHazard
 * @property {HazardId} hazardId
 * @property {string} title
 * @property {PlatformReportId} reportId the hazard's ID in this platform's reports
 * @property {readonly ReportControl[]} controls
 * @property {RatingValues} residual
 */

/**
 * A hazard linked to the platform and live that `registry.listPlatformHazards` named in `omitted`
 * at production, and why (C-004; REQ-007's "or lists that hazard as omitted").
 * @typedef {object} ReportOmission
 * @property {HazardId} hazardId
 * @property {OmissionReason} reason registry's own reason, never one of this module's
 */

/**
 * The bow-tie of one hazard of the report as `bowtie` drew it at production, kept as that text and
 * never drawn again for this report (C-005; REQ-061; SL-09 criterion 5).
 * @typedef {object} ReportBowtie
 * @property {HazardId} hazardId
 * @property {BowtieSvgText} svg
 */

/**
 * One record a report uses that is past its review due date, with what the user is shown about it
 * (C-006; REQ-016). `name` is the platform's `name`, the hazard's `title`, or the control's `title`
 * as the report's rows give it; the two dates are the live schedule's, unchanged.
 * @typedef {object} OutOfDateRecord
 * @property {RecordRef} ref a `platform`, a `hazard`, or a `control`
 * @property {string} name
 * @property {DateAest} nextDueAest the due date it is past
 * @property {DateAest | null} lastReviewedAest null when no review of it has been completed
 */

/**
 * A produced report, in `collections.report` keyed by its id (C-003 to C-007). Everything in it is
 * what was true at the moment of production and is never read again from the records it names:
 * the template's `name`, `title`, and `sections` as the template held them; the platform's id and
 * name; each hazard, omission, and bow-tie; and the records that were past due, which is the list
 * the producing user was given (C-006). `createdBy` is who produced it; `createdAtAest` is when.
 * @typedef {ReportsHeader<'report', ReportId> & {
 *   templateId: ReportTemplateId,
 *   templateName: string,
 *   title: string,
 *   sections: readonly TemplateSection[],
 *   platformId: PlatformId,
 *   platformName: string,
 *   hazards: readonly ReportHazard[],
 *   omitted: readonly ReportOmission[],
 *   bowties: readonly ReportBowtie[],
 *   outOfDate: readonly OutOfDateRecord[],
 * }} Report
 */

// ------------------------------------------------------------------ what a consumer supplies

/**
 * What a user saves as a template (C-001). `sections` holds exactly one `hazards` section.
 * @typedef {object} TemplateFields
 * @property {string} name
 * @property {string} title
 * @property {readonly TemplateSection[]} sections
 */

/**
 * What a user asks a report for (C-003 to C-006). `bowtieHazardIds` are the hazards of the report
 * whose bow-tie it is to hold, each once; empty for none. `acknowledgedOutOfDate` is the `ref` of
 * every record `outOfDateFor` gave for this platform, in its order, which is the caller's statement
 * that the user was shown that list; empty when it gave none.
 * @typedef {object} ReportFields
 * @property {ReportTemplateId} templateId
 * @property {PlatformId} platformId
 * @property {readonly HazardId[]} bowtieHazardIds
 * @property {readonly RecordRef[]} acknowledgedOutOfDate
 */

// ------------------------------------------------------------------ what a read or a change returns

/**
 * What a report includes, for REQ-027 and REQ-026's third part (C-007). `hazardIds` are the hazards
 * it carries as rows, `omittedHazardIds` those it lists as omitted, and `controlIds` every control
 * of every row, once each.
 * @typedef {object} ReportIncludes
 * @property {readonly PlatformId[]} platformIds
 * @property {readonly HazardId[]} hazardIds
 * @property {readonly HazardId[]} omittedHazardIds
 * @property {readonly ControlId[]} controlIds
 */

/**
 * The one self-contained, printable HTML document drawing one report (C-008, C-009).
 * @typedef {string} ReportHtmlText
 */

/**
 * The one Pandoc Markdown document drawing one report, the input to a pandoc document generation
 * stack outside Pivot (C-008, C-010).
 * @typedef {string} ReportMarkdownText
 */

/** @typedef {{ body: DataBody, template: ReportTemplate }} TemplateChange what `createTemplate` returns (C-001) */
/** @typedef {{ body: DataBody, report: Report }} ReportChange what `produceReport` returns (C-003) */

// ------------------------------------------------------------------ error conditions

/** C-012: an entry of `collections['report-template']` that is not a `ReportTemplate`. Nothing is returned. */
export class MalformedTemplateError extends Error {
  /**
   * @param {string} key the entry's key in the collection
   * @param {string} detail one sentence naming the field
   */
  constructor(key, detail) {
    super(`report template ${key} cannot be read: ${detail}`);
    this.name = 'MalformedTemplateError';
    this.key = key;
    this.detail = detail;
  }
}

/** C-012: an entry of `collections.report` that is not a `Report`. Nothing is returned. */
export class MalformedReportError extends Error {
  /**
   * @param {string} key the entry's key in the collection
   * @param {string} detail one sentence naming the field
   */
  constructor(key, detail) {
    super(`report ${key} cannot be read: ${detail}`);
    this.name = 'MalformedReportError';
    this.key = key;
    this.detail = detail;
  }
}

/** C-011: `act` or `act.profile` is missing, or the profile's id is not a user profile id. The body is unchanged. */
export class MissingProfileError extends Error {
  constructor() {
    super('a report or a template is made by a selected profile');
    this.name = 'MissingProfileError';
  }
}

/** C-011: `act.madeForPlatformId` is absent, or is neither null nor a platform id. The body is unchanged. */
export class InvalidActError extends Error {
  /** @param {unknown} given */
  constructor(given) {
    super(`an act names the platform it was made for, or null: got ${String(given)}`);
    this.name = 'InvalidActError';
    this.given = given;
  }
}

/** C-001: a template name that is empty once trimmed. The body is unchanged. */
export class InvalidTemplateNameError extends Error {
  /** @param {unknown} given */
  constructor(given) {
    super('a template name must have at least one character that is not a space');
    this.name = 'InvalidTemplateNameError';
    this.given = given;
  }
}

/** C-001: a template title that is empty once trimmed. The body is unchanged. */
export class InvalidTemplateTitleError extends Error {
  /** @param {unknown} given */
  constructor(given) {
    super('a template title must have at least one character that is not a space');
    this.name = 'InvalidTemplateTitleError';
    this.given = given;
  }
}

/**
 * C-001: `sections` is not a list; a section's `sectionKind` is outside `SECTION_KINDS`; a `heading`
 * or `text` section's `text` is empty once trimmed; or the list does not hold exactly one `hazards`
 * section. `field` names the first failing one (`sections[2].text`), or `sections` for the count.
 * The body is unchanged.
 */
export class InvalidSectionError extends Error {
  /**
   * @param {string} field
   * @param {string} detail
   */
  constructor(field, detail) {
    super(`not a template section: ${field}: ${detail}`);
    this.name = 'InvalidSectionError';
    this.field = field;
    this.detail = detail;
  }
}

/** C-003: no entry of `collections['report-template']` has the id. The body is unchanged. */
export class UnknownTemplateError extends Error {
  /** @param {unknown} id */
  constructor(id) {
    super(`no report template has the id ${String(id)}`);
    this.name = 'UnknownTemplateError';
    this.id = id;
  }
}

/** C-003: the template with this id has a status other than `live`. The body is unchanged. */
export class TemplateNotLiveError extends Error {
  /**
   * @param {ReportTemplateId} id
   * @param {RecordStatus} status
   */
  constructor(id, status) {
    super(`report template ${String(id)} is ${status}, not live`);
    this.name = 'TemplateNotLiveError';
    this.id = id;
    this.status = status;
  }
}

/**
 * C-005: `bowtieHazardIds` is not a list, or names a hazard that is not a row of the report — one the
 * platform's query did not give, or gave as omitted. The body is unchanged.
 */
export class HazardNotInReportError extends Error {
  /**
   * @param {unknown} hazardId
   * @param {PlatformId} platformId
   */
  constructor(hazardId, platformId) {
    super(`hazard ${String(hazardId)} is not a hazard this report on platform ${String(platformId)} carries`);
    this.name = 'HazardNotInReportError';
    this.hazardId = hazardId;
    this.platformId = platformId;
  }
}

/** C-005: `bowtieHazardIds` names one hazard more than once. The body is unchanged. */
export class DuplicateBowtieError extends Error {
  /** @param {HazardId} hazardId */
  constructor(hazardId) {
    super(`the bow-tie of hazard ${String(hazardId)} is asked for more than once`);
    this.name = 'DuplicateBowtieError';
    this.hazardId = hazardId;
  }
}

/**
 * C-006: `acknowledgedOutOfDate` is not exactly the refs `outOfDateFor` gives for that platform on
 * that body at the moment of the call, in its order. Carries both lists, so the caller can show the
 * user the list as it now is. No report is produced; the body is unchanged (HZ-009).
 */
export class OutOfDateNotAcknowledgedError extends Error {
  /**
   * @param {readonly OutOfDateRecord[]} outOfDate what `outOfDateFor` gives now
   * @param {unknown} given what the caller passed
   */
  constructor(outOfDate, given) {
    super('the records past their review due date are not the ones the caller says the user was shown');
    this.name = 'OutOfDateNotAcknowledgedError';
    this.outOfDate = outOfDate;
    this.given = given;
  }
}

/** C-007: `reportsIncluding` given a ref whose kind is not `platform`, `hazard`, or `control`. Nothing is returned. */
export class UnincludableKindError extends Error {
  /** @param {unknown} kind */
  constructor(kind) {
    super(`a report includes no record of kind ${String(kind)}`);
    this.name = 'UnincludableKindError';
    this.kind = kind;
  }
}

/** C-008: a render given a value that is not a well-formed `Report` (C-012). `field` names the first failing field. Nothing is drawn. */
export class InvalidReportError extends Error {
  /** @param {string} field */
  constructor(field) {
    super(`not a report: ${field}`);
    this.name = 'InvalidReportError';
    this.field = field;
  }
}

// ------------------------------------------------------------------ operations: templates

/**
 * Save a template: its name, its title, and its sections, trimmed, as one new record with its own
 * entry in the history. Rejects a blank name or title and a section list that is not a layout,
 * changing nothing. C-001, C-002, C-011.
 * @param {DataBody} body left unchanged
 * @param {Act} act
 * @param {TemplateFields} fields
 * @returns {Promise<TemplateChange>}
 */
export async function createTemplate(body, act, fields) {
  return (await impl()).createTemplate(body, act, fields);
}

/**
 * The template with this id, whatever its status, or null when none has it. C-001, C-012.
 * @param {DataBody} body
 * @param {ReportTemplateId} id
 * @returns {Promise<ReportTemplate | null>}
 */
export async function getTemplate(body, id) {
  return (await impl()).getTemplate(body, id);
}

/**
 * Every live template, once each, ascending `createdAtAest` then id. C-001, C-012.
 * @param {DataBody} body
 * @returns {Promise<readonly ReportTemplate[]>}
 */
export async function listTemplates(body) {
  return (await impl()).listTemplates(body);
}

// ------------------------------------------------------------------ operations: producing a report

/**
 * Every record a report on this platform would use that is past its review due date as at the
 * baseline clock's today, with its name and its last reviewed date, in `review-schedule.listOverdue`'s
 * order; empty when none is. The list a consumer shows before producing, and the list
 * `produceReport` requires back. C-006.
 * @param {DataBody} body
 * @param {PlatformId} platformId
 * @returns {Promise<readonly OutOfDateRecord[]>}
 */
export async function outOfDateFor(body, platformId) {
  return (await impl()).outOfDateFor(body, platformId);
}

/**
 * Produce a report on a platform from a template: every hazard of `registry.listPlatformHazards`
 * as a row or an omission, each bow-tie asked for as drawn now, and the out-of-date records the
 * caller acknowledged, stored as one new record with its own entry in the history. Refuses unless
 * `acknowledgedOutOfDate` is exactly what `outOfDateFor` gives now. C-003 to C-006, C-011.
 * @param {DataBody} body left unchanged
 * @param {Act} act
 * @param {ReportFields} fields
 * @returns {Promise<ReportChange>}
 */
export async function produceReport(body, act, fields) {
  return (await impl()).produceReport(body, act, fields);
}

// ------------------------------------------------------------------ operations: reading reports

/**
 * The report with this id, whatever its status, or null when none has it. C-003, C-012.
 * @param {DataBody} body
 * @param {ReportId} id
 * @returns {Promise<Report | null>}
 */
export async function getReport(body, id) {
  return (await impl()).getReport(body, id);
}

/**
 * Every live report, once each, ascending `createdAtAest` then id. C-003, C-012.
 * @param {DataBody} body
 * @returns {Promise<readonly Report[]>}
 */
export async function listReports(body) {
  return (await impl()).listReports(body);
}

/**
 * The platforms, hazards, omitted hazards, and controls a report includes, read from the report
 * alone. C-007.
 * @param {Report} report
 * @returns {Promise<ReportIncludes>}
 */
export async function includesOf(report) {
  return (await impl()).includesOf(report);
}

/**
 * Every live report whose `includesOf` names this platform, hazard, or control, in `listReports`'
 * order. C-007.
 * @param {DataBody} body
 * @param {RecordRef} ref of kind `platform`, `hazard`, or `control`
 * @returns {Promise<readonly Report[]>}
 */
export async function reportsIncluding(body, ref) {
  return (await impl()).reportsIncluding(body, ref);
}

// ------------------------------------------------------------------ operations: drawing a report

/**
 * The self-contained, printable HTML document of this report: the template's layout, every hazard,
 * control, omission, and bow-tie it holds, each marked with what it is. Identical for deep-equal
 * reports. C-008, C-009.
 * @param {Report} report
 * @returns {Promise<ReportHtmlText>}
 */
export async function renderReportHtml(report) {
  return (await impl()).renderReportHtml(report);
}

/**
 * The Pandoc Markdown document of this report, holding what the HTML holds, marked the same way.
 * Identical for deep-equal reports. C-008, C-010.
 * @param {Report} report
 * @returns {Promise<ReportMarkdownText>}
 */
export async function renderReportMarkdown(report) {
  return (await impl()).renderReportMarkdown(report);
}

// ------------------------------------------------------------------ implementation selection

/**
 * @typedef {object} ReportsImplementation
 * @property {(body: DataBody, act: Act, fields: TemplateFields) => Promise<TemplateChange>} createTemplate
 * @property {(body: DataBody, id: ReportTemplateId) => Promise<ReportTemplate | null>} getTemplate
 * @property {(body: DataBody) => Promise<readonly ReportTemplate[]>} listTemplates
 * @property {(body: DataBody, platformId: PlatformId) => Promise<readonly OutOfDateRecord[]>} outOfDateFor
 * @property {(body: DataBody, act: Act, fields: ReportFields) => Promise<ReportChange>} produceReport
 * @property {(body: DataBody, id: ReportId) => Promise<Report | null>} getReport
 * @property {(body: DataBody) => Promise<readonly Report[]>} listReports
 * @property {(report: Report) => Promise<ReportIncludes>} includesOf
 * @property {(body: DataBody, ref: RecordRef) => Promise<readonly Report[]>} reportsIncluding
 * @property {(report: Report) => Promise<ReportHtmlText>} renderReportHtml
 * @property {(report: Report) => Promise<ReportMarkdownText>} renderReportMarkdown
 */

/** @type {Promise<ReportsImplementation> | null} */
let selected = null;

/** @returns {Promise<ReportsImplementation>} */
function impl() {
  if (selected === null) {
    const env = /** @type {{ process?: { env?: Record<string, string | undefined> } }} */ (globalThis).process?.env;
    if (env?.REPORTS_IMPL === 'null') {
      const nullDouble = './null_double.js'; // test-only; not a runtime source, so never inlined by the build
      selected = import(nullDouble);
    } else {
      selected = import('./src/reports.js');
    }
  }
  return selected;
}
