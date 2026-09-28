# Contract: reports
Version: 1.0 · Status: draft

Written for SL-09. Promises what STK-021 and STK-002 ask of a report: a template a user saves and
reuses (REQ-046), a report on a platform that holds every hazard of that platform or names it as
omitted (REQ-007), the warning before a report uses out-of-date data (REQ-016, HZ-009's telling),
what a report includes read back later (REQ-027, and the reports half of REQ-026), and a bow-tie
held in a report as it was drawn (REQ-061). It owns the record kinds `report-template` and
`report`, which baseline has held since CHG-001 and which no module has written until now.

This is the second of the two composing modules DEC-004 placed above the record modules. Every
fact a report holds is read through the contract that owns it and derived here no second way: a
platform's hazards, their controls, and their residual values are one
`registry.listPlatformHazards` (registry C-019); what is past its review due date is one
`review-schedule.listOverdue` (review-schedule C-009); a bow-tie is `bowtie.bowtieFor` and
`bowtie.renderBowtieSvg` (bowtie C-001, C-004); and a band is `rating.ratingFor` (rating C-001).
What this module adds is the template, the record of what a report held, the refusal that keeps a
report from being produced past the warning unseen, and the two documents.

A report is stored as what it held at the moment it was produced, not as a pointer to the records
it names (DEC-032). SL-09's G3 decision stores it "so REQ-026 and REQ-027 can be answered later",
and criterion 5 says the report "holds that diagram as generated at the time of production"; a
report that re-read the registry would answer both with today's data. The two documents, HTML and
Pandoc Markdown, are functions of that record alone, so they are not stored beside it.

Six things SL-09's criteria do not settle are settled here, each with the reading it rejects stated
rather than passed over. The criteria are recorded in `docs/slices/SL-09.md` as drafted by a model
for jay-pryor to accept or rewrite, and every reading below is open to that review.

**What a template's layout is.** Criterion 1 says both reports "carry the template's layout", and
nothing says what a layout is. The reading taken is an ordered list of sections of three kinds — a
heading the user wrote, a paragraph the user wrote, and the one place the report's hazards go — and
a title every report from the template carries (C-001, DEC-033). The rejected readings are a
free-text document with placeholders, which a conformance test could compare only as text and
which could drop the hazards; and a choice of columns or fields per hazard, which would let a
template leave out a hazard's controls or residual rating and so break criterion 2 by design. That
a template holds exactly one hazards section is what keeps criterion 2 true of every template.

**Whether a report uses reference entries.** Criterion 3 names a reference entry among the records
whose being past due draws the warning, and criterion 2 lists what a report holds without naming
one. On the first reading a report includes the reference entries linked to its platform, hazards,
or controls, and warns when any of them is past due. On the second a report includes no reference
entry at 1.0, so none can make it out of date and criterion 3's reference-entry half applies to
nothing yet. This version takes the second, the smaller promise: HZ-009 is about a report produced
from out-of-date data, and data a report does not hold cannot make it so. The check is over the
records a report includes (C-006), so a later version that includes reference entries brings them
under the warning with no change to the check. If the first reading is intended, a report gains a
list of entries, this module imports `reference-register`, and C-004, C-006, and C-007 are what
change.

**What a report "uses".** The reading taken is the platform, every hazard the report carries as a
row, and every control of those rows in whatever state it is on the platform — every record whose
stored content the documents show (C-006). A hazard named as omitted is not used: the report holds
its id and why, and none of its content. The rejected reading also takes in omitted hazards, which
would warn about data the report does not contain.

**What "the controls" and "residual rating" of a hazard are in a report.** Every one of the
hazard's controls on the platform in the state `registry` gives it — confirmed, excluded with its
reason, or awaiting — as views C-024 shows them; and the residual values an assessor entered, with
the band `rating` gives for them when a document is drawn. The band is not stored (DEC-032): a
stored band is a copy of the matrix's answer that could come to disagree with it (HZ-010).

**What "offered as a browser download" is.** SL-09's G3 decision offers a produced report as a
browser download. The reading taken is the file-write `store` 4.0 already provides for exports:
the user chooses a file with the browser's save picker and the document is written to it
(DEC-030, which named SL-09's reports as its second use). The rejected reading is an anchor-element
download from the page, which would sit outside every contract as DEC-030's rejected alternative
did. Writing is `views`'; this module gives the text.

**How a bow-tie travels in the Markdown.** The Markdown holds each bow-tie as an image whose
source is a `data:` URI of the SVG text, so the one file carries everything, as the HTML does
(C-010, DEC-032). Whether the owner's pandoc-to-tectonic stack renders an SVG image is that stack's
and is outside Pivot, as SL-09 puts it; the rejected alternative, a Markdown file beside separate
SVG files, needs a write of several files that no contract offers.

## 1. Purpose
Keep report templates and the reports produced from them, each report as what it held when it was
produced, and draw a report as a document.

## 2. Operations
In `contract.js`. Every operation is asynchronous and returns a promise (DEC-012). The eight that
take a `DataBody` are functions of it and, for `outOfDateFor` and the two changing operations, of
the baseline clock and of the `registry`, `review-schedule`, `bowtie`, and `change-log` operations
their clauses name. The three that take a `Report` are functions of it alone and of
`rating.ratingFor`. None reads or writes the data folder, the browser's storage, or anything else
(DEC-006). A consumer holds the working body from `store.load`, replaces it with the `body` each
changing operation returns, and passes it to `store.save` when the user saves. Each changing
operation takes registry's `Act` (DEC-016).

| Operation | Signature | Verified by |
|---|---|---|
| createTemplate | `(body: DataBody, act: Act, fields: TemplateFields) → TemplateChange` | conformance |
| getTemplate | `(body: DataBody, id: ReportTemplateId) → ReportTemplate \| null` | conformance |
| listTemplates | `(body: DataBody) → readonly ReportTemplate[]` | conformance |
| outOfDateFor | `(body: DataBody, platformId: PlatformId) → readonly OutOfDateRecord[]` | conformance |
| produceReport | `(body: DataBody, act: Act, fields: ReportFields) → ReportChange` | conformance |
| getReport | `(body: DataBody, id: ReportId) → Report \| null` | conformance |
| listReports | `(body: DataBody) → readonly Report[]` | conformance |
| includesOf | `(report: Report) → ReportIncludes` | conformance |
| reportsIncluding | `(body: DataBody, ref: RecordRef) → readonly Report[]` | conformance |
| renderReportHtml | `(report: Report) → ReportHtmlText` | conformance |
| renderReportMarkdown | `(report: Report) → ReportMarkdownText` | conformance |

A conformance test builds a body through `registry`'s changing operations from
`schema.emptyDataBody()`, sets schedules through `review-schedule.setSchedule`, holds the baseline
clock either side of a due date, and compares what a report holds against
`registry.listPlatformHazards`, `review-schedule.listOverdue`, and `bowtie.renderBowtieSvg` on the
same body; it needs no folder and no browser. It reads a document through the syntax C-009 and
C-010 restrict it to, so no HTML, XML, or Markdown library is needed (IMP-06). That pandoc reads
the Markdown as C-010 marks it is verified by demonstration, on a machine with pandoc, and recorded
as a review row; the suite does not run pandoc.

## 3. Data shapes
From `baseline/types.js`: `ReportId`, `ReportTemplateId`, `HazardId`, `ControlId`, `PlatformId`,
`PlatformReportId`, `UserProfileId`, `ControlKind`, `DateAest`, `TimestampAest`, `RecordKind`,
`RecordStatus`, `RecordRef`. From `baseline/schema.js`: `DataBody`, whose
`collections['report-template']` and `collections.report` are the two collections this module
reads and writes. From `modules/registry/contract.js`: `Act`, `RatingValues`,
`ControlPlatformState`, `OmissionReason`. From `modules/bowtie/contract.js`: `BowtieSvgText`.
Defined in `contract.js`:

**Sections**: `SECTION_KINDS` — `heading`, `text`, `hazards`. `TemplateSection` is
`{ sectionKind: 'heading', text }`, `{ sectionKind: 'text', text }`, or `{ sectionKind: 'hazards' }`.

**The records**, the baseline record header narrowed to each kind and id, plus its own fields
(DEC-005):

- `ReportTemplate`, in `collections['report-template']` keyed by its id: `kind:
  'report-template'`, `id: ReportTemplateId`, `name: string`, `title: string`, `sections: readonly
  TemplateSection[]`.
- `Report`, in `collections.report` keyed by its id: `kind: 'report'`, `id: ReportId`,
  `templateId: ReportTemplateId`, `templateName: string`, `title: string`, `sections: readonly
  TemplateSection[]`, `platformId: PlatformId`, `platformName: string`, `hazards: readonly
  ReportHazard[]`, `omitted: readonly ReportOmission[]`, `bowties: readonly ReportBowtie[]`,
  `outOfDate: readonly OutOfDateRecord[]`.
- `ReportHazard`: `{ hazardId, title, reportId: PlatformReportId, controls: readonly
  ReportControl[], residual: RatingValues }`.
- `ReportControl`: `{ controlId, title, controlKind, state: ControlPlatformState,
  justificationText: string | null }`.
- `ReportOmission`: `{ hazardId, reason: OmissionReason }`.
- `ReportBowtie`: `{ hazardId, svg: BowtieSvgText }`.
- `OutOfDateRecord`: `{ ref: RecordRef, name: string, nextDueAest: DateAest, lastReviewedAest:
  DateAest | null }`.

On both kinds `createdBy` and `createdAtAest` are who made the record and when, `updatedBy` and
`updatedAtAest` equal them, and `status` is `'live'`: nothing at 1.0 changes a template or a report
once written (C-012). A report's production date is the calendar date of its `createdAtAest` in
AEST, `types.dateOfTimestamp(createdAtAest)`, and no field of its own.

**Field bundles** a consumer supplies: `TemplateFields` `{ name, title, sections }`; `ReportFields`
`{ templateId, platformId, bowtieHazardIds, acknowledgedOutOfDate }`.

**Reads and changes**: `ReportIncludes` `{ platformIds, hazardIds, omittedHazardIds, controlIds }`;
`TemplateChange` `{ body, template }`; `ReportChange` `{ body, report }`. The body passed in is
untouched (C-003).

**Documents**: `ReportHtmlText` and `ReportMarkdownText`, each a string holding one document
(C-008 to C-010). The unit is in the type name (IMP-05): the two are not interchangeable, and a
`BowtieSvgText` is a third.

Every field of every stored record is a string, a number, null, or an array or object of those, so
the body after any operation is deep-equal to itself after JSON serialisation and parsing, which is
what `store` C-001 carries across a save and a load. "Normalised text" everywhere in this contract
means a stored text trimmed of outer whitespace with every run of whitespace inside it replaced by
one space, which is how bowtie C-005 draws a text.

## 4. Error conditions
Signalled as a rejected promise carrying the named error class. "Body unchanged" means the body
passed in is deep-equal to what it was before the call, which C-003 promises of every call, and
that nothing was returned as a new body.

| Operation | Condition | Signalled as | Caller obligation |
|---|---|---|---|
| every operation taking a body | an entry of `collections['report-template']` is not a `ReportTemplate` (C-012) | `MalformedTemplateError` naming the entry's key and one sentence naming the field; nothing returned; body unchanged | Name the record to the user; show no template from that collection, and produce no report |
| every operation taking a body | an entry of `collections.report` is not a `Report` (C-012) | `MalformedReportError` naming the entry's key and one sentence naming the field; nothing returned; body unchanged | Name the record to the user; show no report from that collection, and never a shorter list |
| createTemplate, produceReport | `act` is missing, or `act.profile` is missing, or its `id` is not a user profile id | `MissingProfileError`; body unchanged | Show the profile screen (REQ-055) |
| createTemplate, produceReport | `act.madeForPlatformId` is absent or is neither null nor a platform id | `InvalidActError` naming the value; body unchanged | Pass the platform the screen is on, or null; never leave it off (DEC-016) |
| createTemplate | `fields.name` is not a string or is empty once trimmed | `InvalidTemplateNameError` naming the value; body unchanged | Ask what the template is called |
| createTemplate | `fields.title` is not a string or is empty once trimmed | `InvalidTemplateTitleError` naming the value; body unchanged | Ask for the title its reports carry |
| createTemplate | `fields.sections` is not a list; a section's `sectionKind` is outside `SECTION_KINDS`; a `heading` or `text` section's `text` is not a string or is empty once trimmed; or the list does not hold exactly one `hazards` section | `InvalidSectionError` naming the first failing field in list order, or `sections` for the count; body unchanged | Ask for the section; a template has one place its reports' hazards go (C-001) |
| produceReport | no entry of `collections['report-template']` has `fields.templateId` | `UnknownTemplateError` naming the value; body unchanged | Offer only templates `listTemplates` gave |
| produceReport | the template's `status` is not `'live'` | `TemplateNotLiveError` carrying the id and the status; body unchanged | Cannot arise from a body this version wrote (C-012); offer only live templates |
| outOfDateFor, produceReport | no platform has the id | `registry`'s `UnknownPlatformError`, as `listPlatformHazards` rejects; body unchanged | Offer only platforms `registry.listPlatforms` gave |
| outOfDateFor, produceReport | the platform `listPlatformHazards` gives has a `status` other than `'live'` | `registry`'s `PlatformNotLiveError` carrying the id and the status; body unchanged | Say the platform is retired or deleted; a report is on a live platform (C-003) |
| outOfDateFor, produceReport | `registry.listPlatformHazards` rejects for any other reason | that error unchanged (`registry`'s `Malformed*Error`); body unchanged | Name the record; produce no report |
| outOfDateFor, produceReport | `review-schedule.listOverdue` rejects | that error unchanged (`MalformedScheduleError`); body unchanged | Name the record; produce no report, and never produce one as though nothing were past due (HZ-009) |
| produceReport | `fields.bowtieHazardIds` is not a list, or names a hazard that is not the `hazard.id` of a row of the platform's query | `HazardNotInReportError` carrying the value and the platform id; body unchanged | Offer only the hazards the report carries as rows; an omitted hazard has no bow-tie (bowtie C-002) |
| produceReport | `fields.bowtieHazardIds` names one hazard twice | `DuplicateBowtieError` carrying the id; body unchanged | Ask for each bow-tie once |
| produceReport | `fields.acknowledgedOutOfDate` is not exactly the `ref` of each record `outOfDateFor(body, fields.platformId)` gives at the moment of the call, in its order, each with the same kind and id | `OutOfDateNotAcknowledgedError` carrying that list and the value given; no report; body unchanged | Show the user the list the error carries, with each record's last reviewed date, and ask again (C-006; REQ-016; HZ-009) |
| produceReport | `bowtie.bowtieFor` or `bowtie.renderBowtieSvg` rejects for a hazard asked for | that error unchanged; no report; body unchanged | Name it to the user; a report is never produced with a bow-tie missing that was asked for (C-005) |
| createTemplate, produceReport | `change-log.recordChange` rejects, which for a body this module wrote can only be an entry of `collections['change-log-entry']` that `change-log` cannot read | that error unchanged, `MalformedEntryError`; nothing written; body unchanged | Name the entry to the user; nothing may be changed while the history cannot be read (C-011) |
| reportsIncluding | `ref` is not an object, or its `kind` is not `platform`, `hazard`, or `control` | `UnincludableKindError` naming the kind; nothing returned | Ask only about a platform, a hazard, or a control; a report includes nothing else (C-007) |
| includesOf, renderReportHtml, renderReportMarkdown | `report` is not a well-formed `Report` as C-012 defines one | `InvalidReportError` naming the first failing field; nothing drawn | Pass what `getReport`, `listReports`, or `produceReport` gave |
| renderReportHtml, renderReportMarkdown | `rating.ratingFor` rejects for a hazard's residual values | that error unchanged (`ConsequenceOutOfScaleError`, `LikelihoodOutOfScaleError`); nothing drawn | Cannot arise from a report this version produced: the values are registry's, which refuses one out of scale (registry C-018) and C-012 refuses one here. Show no document |

A body with no `collections['report-template']` or no `collections.report` is not an error: it
holds no template or no report, so the reads are null or empty and the first `createTemplate` or
`produceReport` creates the collection. A read never rejects for an id nothing has: `getTemplate`
and `getReport` resolve with null.

When two conditions of an operation hold at once, the one signalled is the first of these that
applies, so that a conformance test has one expected rejection and not a choice: a malformed
template; a malformed report; a missing profile; an ill-formed act; a field value
(`InvalidTemplateNameError`, `InvalidTemplateTitleError`, `InvalidSectionError`, in that order); an
unknown template; a template that is not live; whatever `listPlatformHazards` rejects with; a
platform that is not live; whatever `listOverdue` rejects with; a bow-tie hazard not in the report;
a duplicate bow-tie; an out-of-date list not acknowledged; whatever `bowtie` rejects with; and last,
whatever `change-log.recordChange` rejects with. The body is unchanged whichever fires.

## 5. Behavioural promises

- **C-001 A template is saved with a name, a title, and a layout that has one place for the
  hazards.** After `createTemplate(body, act, { name, title, sections })` resolves with `{ body: b,
  template: t }`: `t.id` is a fresh `ReportTemplateId` held by no entry of
  `collections['report-template']`; `t.name` is `name` trimmed and `t.title` is `title` trimmed;
  `t.sections` has one entry per entry of `sections`, in the same order, each with the same
  `sectionKind`, a `heading` or `text` section's `text` trimmed, and no other property; `t.kind` is
  `'report-template'`; `t.status` is `'live'`; `t.createdBy` and `t.updatedBy` are `act.profile.id`;
  `t.createdAtAest` and `t.updatedAtAest` are the baseline clock's now; `getTemplate(b, t.id)` is
  deep-equal to `t`; and `listTemplates(b)` is `listTemplates(body)` plus `t`. A blank name, a blank
  title, a section of an unknown kind, a blank heading or paragraph, and a list with no `hazards`
  section or more than one are refused and nothing is written, so no template is saved that cannot
  lay out a report holding every hazard (C-004). Two templates may share a name: they are two
  records, told apart by id. (REQ-046; SL-09 criterion 1.)
- **C-002 A template is reused whole: every report from it carries its layout.** When
  `produceReport` resolves with a report `r` for `fields.templateId` equal to `t.id`: `r.templateId`
  is `t.id`; `r.templateName` is `t.name`; `r.title` is `t.title`; and `r.sections` is deep-equal to
  `t.sections`. So any two reports produced from one template hold the same title and the same
  sections in the same order, whatever platform each is on, and C-008 draws that layout into every
  document of each in that order. The template is read and never changed by producing a report
  from it, and a report holds its layout as it was at production. (REQ-046's reuse; SL-09 criterion
  1.)
- **C-003 A report is one live template on one live platform, stored as what it held then.** After
  `produceReport(body, act, fields)` resolves with `{ body: b, report: r }`: `r.id` is a fresh
  `ReportId` held by no entry of `collections.report`; `r.platformId` is `fields.platformId` and
  `r.platformName` is the `name` of the platform `registry.listPlatformHazards(body,
  fields.platformId)` gave; `r.kind` is `'report'`; `r.status` is `'live'`; `r.createdBy` and
  `r.updatedBy` are `act.profile.id`; `r.createdAtAest` and `r.updatedAtAest` are the baseline
  clock's now; `getReport(b, r.id)` is deep-equal to `r`; and `listReports(b)` is
  `listReports(body)` plus `r`. The template must be live and the platform must be live (section 4).
  No operation of this contract reads a report's content from anywhere but the report: after any
  later change to the body — a hazard renamed, a control confirmed or excluded, a rating re-entered,
  a hazard linked to the platform or retired, a platform renamed — `getReport` of that body gives
  the report deep-equal to `r`. A report is what was true when it was produced, and saying so is
  the whole of its purpose (DEC-032). (REQ-007, REQ-027 as they are answered later; SL-09's G3
  decision.)
- **C-004 A report holds every hazard of its platform's one query, as a row with its controls and
  residual rating or as omitted.** Let `q` be `registry.listPlatformHazards(body,
  fields.platformId)`. When `produceReport` resolves with `r`: `r.hazards` has one `ReportHazard`
  per row of `q.rows`, in `q.rows`' order, whose `hazardId` is the row's `hazard.id`, `title` its
  `hazard.title`, `reportId` its `reportId`, `residual` deep-equal to its `residual`, and `controls`
  one `ReportControl` per element of the row's `controls` in that order, whose `controlId` is the
  element's `control.id`, `title` its `control.title`, `controlKind` and `state` its own, and
  `justificationText` the `text` of its `justification` when that is not null and null otherwise;
  and `r.omitted` has one `ReportOmission` per entry of `q.omitted`, in its order, carrying its `id`
  as `hazardId` and its `reason`. Nothing is added, dropped, merged, reordered, or reworded. So the
  hazards of `r.hazards` and `r.omitted` together are exactly the hazards of `q`, each once and none
  in both: every hazard linked to the platform that is neither deleted nor retired is in the report
  with its controls and residual values or is listed as omitted, which is the one property registry
  C-019 gives every list of a platform's hazards, reached here and from no list of this module's.
  This module reads no link, no rating, and no justification of its own. (REQ-007; HZ-004; SL-09
  criterion 2.) *Mitigation support for HZ-004: the mitigation clause is registry C-019, and this
  clause is what a report reaches it by.*
- **C-005 A bow-tie a user asks for is held in the report as drawn at production.** For each id in
  `fields.bowtieHazardIds`, which must be the `hazard.id` of a row of `q` and appear once (section
  4), `produceReport` calls `bowtie.bowtieFor(body, hazardId, fields.platformId)` once and
  `bowtie.renderBowtieSvg` once with what it gave. `r.bowties` has one `ReportBowtie` per id asked
  for and no other, in `q.rows`' order and not in the order asked, each whose `svg` is exactly the
  text `renderBowtieSvg` resolved with. So any hazard the report covers as a row may have its
  bow-tie included, and a report holds each drawing as generated at the moment of production: a
  causal factor added, a control confirmed, or a hazard renamed afterwards changes the next
  `bowtie.renderBowtieSvg` of the body and leaves `getReport(...).bowties` deep-equal to what it
  was (C-003). A bow-tie that `bowtie` refuses is not drawn in part and the report is not produced
  (bowtie C-002). An empty `bowtieHazardIds` gives a report with `bowties` empty, which is not an
  error. (REQ-061; REQ-059's "included in a report", this module's half; HZ-011; SL-09 criterion 5.)
- **C-006 No report is produced past the warning unseen.** `outOfDateFor(body, platformId)` resolves
  with one `OutOfDateRecord` per `ReviewState` `s` of `review-schedule.listOverdue(body)` whose
  `ref` names a record the report would use, in `listOverdue`'s order and with nothing else. The
  records a report on that platform uses are the platform, each hazard of `q.rows`, and each control
  of those rows, each control once however many rows carry it (preamble). Each record's `ref` is
  `s.ref`; `name` is the platform's `name`, the row's `hazard.title`, or the element's
  `control.title` as `q` gives it; `nextDueAest` and `lastReviewedAest` are `s.schedule`'s,
  unchanged. So a record is out of date here exactly when review-schedule C-009 flags it overdue —
  from the day after its due date, against the baseline clock — and this module decides nothing
  about a due date, holds no clock of its own, and compares no date. An empty list means nothing
  the report uses is past its review due date, and is not the same as a list that could not be read,
  which rejects (section 4).

  `produceReport` calls `outOfDateFor` of its body and platform before anything is written, and
  resolves only when `fields.acknowledgedOutOfDate` is exactly the `ref` of each record it gave, in
  its order; otherwise it rejects with `OutOfDateNotAcknowledgedError` carrying the list as it now
  is, and nothing is produced. The report it resolves with carries that list as `r.outOfDate`,
  deep-equal to it, and C-008 draws it into both documents. So a report cannot be produced through
  this contract from data past its review due date without the caller having been handed the
  records and their last reviewed dates in the same body at the same moment, and a list that has
  changed since it was shown — a due date crossed at midnight, a tempo set, a hazard linked — is
  refused rather than passed; with nothing past due the list is empty, the caller has nothing to
  show, and the report is produced. That the list is shown to the user before the call is `views`'
  (views C-042). The records this module names are the whole of what "uses" means at 1.0; a report
  includes no reference entry, which is the reading the preamble records. (REQ-016; HZ-009; SL-09
  criterion 3.) *Mitigation support for HZ-009: the mitigation clause is review-schedule C-009,
  which makes "out of date" a fact; this clause is the telling that hazard names.*
- **C-007 What a report includes is read from the report, and the reports that include a record
  from the reports.** `includesOf(r)` resolves with `platformIds` `[r.platformId]`; `hazardIds` the
  `hazardId` of each entry of `r.hazards`, in its order; `omittedHazardIds` the `hazardId` of each
  entry of `r.omitted`, in its order; and `controlIds` the `controlId` of each `ReportControl` of
  each entry of `r.hazards`, in the order first met, each once. It reads nothing but `r`, so what a
  report includes is what it included when it was produced, whatever has changed in the body since
  (C-003). `reportsIncluding(body, ref)` resolves with every report of `listReports(body)` whose
  `includesOf` names `ref.id` in `platformIds` for a `platform`, in `hazardIds` for a `hazard`, or in
  `controlIds` for a `control`, in `listReports`' order and with nothing else; a hazard a report
  lists as omitted is not one it includes. A `ref` naming a record nothing has resolves with an
  empty list, as a read does. So "the hazards, platforms, and controls a report includes" and "the
  reports that include a hazard" are one rule read in two directions, and cannot disagree. (REQ-027;
  REQ-026's third part, `views`' to show; SL-09 criterion 4.)
- **C-008 A document is a function of the report alone, and draws everything the report holds, each
  marked with what it is.** `renderReportHtml(r)` and `renderReportMarkdown(r)` read `r` and call
  `rating.ratingFor` once per entry of `r.hazards` with its `residual`'s `consequence` and
  `likelihood`, and nothing else: no body, no registry, no bow-tie, no clock. Each document holds,
  marked as C-009 and C-010 say, in this order: one header carrying the normalised `r.title`,
  `r.platformName`, and the report's production date (section 3); one out-of-date notice when
  `r.outOfDate` is not empty, and none when it is, carrying one mark per record in its order, each
  with the record's kind and id, its normalised `name`, its `nextDueAest`, and its
  `lastReviewedAest` or, when that is null, no date; and one section per entry of `r.sections`, in
  its order. A `heading` or `text` section carries its normalised `text` and nothing else. The one
  `hazards` section carries one hazard mark per entry of `r.hazards` in its order — with its
  `hazardId`, its `reportId` and normalised `title`, its residual `consequence` and `likelihood`
  where not null, and the `band` `ratingFor` gave — inside which is one control mark per
  `ReportControl` in its order, with its `controlId`, `state`, `controlKind`, normalised `title`,
  and normalised `justificationText` where not null, and, when `r.bowties` has an entry for that
  hazard, one bow-tie mark holding that entry's `svg`; then one omission mark per entry of
  `r.omitted` in its order, with its `hazardId` and `reason`. No mark is added for anything the
  report does not hold. So the set of section kinds in order, hazard ids, control ids with their
  states, bands, omitted ids, bow-tie drawings, and out-of-date records read from either document
  equals the set read from `r`, and the two documents of one report hold the same things; and two
  reports from one template hold the same sequence of sections (C-002). Two calls with deep-equal
  reports resolve with identical strings, in this copy of Pivot and any other. (REQ-007, REQ-046,
  REQ-061 as they reach a document; REQ-017 for the band; HZ-010; SL-09 criteria 1, 2 and 5; SL-09's
  G3 decision for the two output forms.)
- **C-009 The HTML is one self-contained, printable document in a syntax a small reader can check.**
  The text begins with `<!DOCTYPE html>` and a newline, and the rest is one well-formed XML element
  `html` with no XML declaration, comment, CDATA section, or processing instruction: every element
  is closed, a void element is written self-closed, attribute values are double-quoted, and the only
  entity references are `&amp;`, `&lt;`, `&gt;`, and `&quot;`. `html` holds one `head` and one
  `body`. `head` holds `<meta charset="utf-8"/>`, one `title` whose text is the normalised
  `r.title`, and at most one `style` element whose text holds no `<`, `&`, `url(`, or `@import`. No
  element is named `script`, `link`, `base`, `iframe`, `frame`, `object`, `embed`, `img`, `form`, or
  `input`; no attribute is named `src`, `srcset`, `href`, `xlink:href`, `action`, `formaction`, or
  `style`, or begins `on`; and no attribute value contains `url(`. So the document references nothing
  outside itself, runs nothing, and prints the same wherever it is opened. The marks of C-008 are
  attributes: the header is the one element carrying `data-report-header`; the notice the one
  carrying `data-report-out-of-date`, holding one element per record carrying `data-record-kind` and
  `data-record-id`; a section an element carrying `data-report-section` whose value is its
  `sectionKind`, the sections being siblings in `body` after the header and the notice; a hazard an
  element inside the hazards section carrying `data-report-hazard` (its `hazardId`) and
  `data-rating-band` (the band); a control an element inside its hazard's carrying
  `data-report-control` (its `controlId`), `data-control-state`, and `data-control-kind`; a bow-tie
  an element inside its hazard's carrying `data-report-bowtie` (the `hazardId`) whose only child is
  the `svg` text exactly as the report holds it, which bowtie C-009 already restricts to this syntax;
  and an omission an element inside the hazards section carrying `data-report-omitted` (its
  `hazardId`) and `data-omission-reason`. No other element carries an attribute beginning
  `data-report-`. The text of a mark is where C-008's texts and values are: every text is written
  normalised and entity-escaped (`&`, `<`, `>`, `"`), so unescaping it gives the normalised stored
  text. (SL-09's G3 decision: HTML, self-contained and printable; SL-09 criteria 1, 2 and 5.)
- **C-010 The Markdown is one Pandoc Markdown document, marked the same way.** The text uses `\n`
  line endings, holds no `\r` and no tab, and ends with one `\n`. It begins with a YAML metadata
  block: the line `---`, the line `title: "` then the title text then `"`, and the line `---`, where
  the title text is the normalised `r.title` Markdown-escaped and then with each `\` and `"`
  preceded by `\`. A text is Markdown-escaped when every ASCII punctuation character in it is
  preceded by a backslash, which pandoc's `backslash_escapes` reads as that character. The marks of
  C-008 are pandoc attributes in `{...}` holding one class and `key="value"` pairs whose values are
  ids, kinds, states, bands, reasons, or dates and so need no escaping: the header, the notice, each
  section, each hazard, and each omission is a fenced div — a line of at least three colons followed
  by its attributes, closed by a line of colons alone — with class `report-header`,
  `report-out-of-date`, `report-section` and `data-section` its `sectionKind`, `report-hazard` and
  `data-hazard` and `data-rating-band`, or `report-omitted` and `data-hazard` and
  `data-omission-reason`; each out-of-date record and each control is a bracketed span
  `[...]{...}` with class `report-stale` and `data-record-kind` and `data-record-id`, or
  `report-control` and `data-control`, `data-control-state`, and `data-control-kind`; and each
  bow-tie is an image `![...](data:image/svg+xml;base64,B){.report-bowtie data-hazard="..."}` inside
  its hazard's div, where `B` is the standard base64 (RFC 4648, padded, no line breaks) of the UTF-8
  bytes of the `svg` text, so decoding it gives that text exactly. Divs nest as C-009's elements do,
  every div opened is closed, and no other attribute block carries a class beginning `report-`.
  Every text inside a mark is written normalised and Markdown-escaped, so removing the escapes gives
  the normalised stored text. That pandoc's reader with the `yaml_metadata_block`, `fenced_divs`,
  `bracketed_spans`, `link_attributes`, and `backslash_escapes` extensions reads the document as
  these marks say is verified by demonstration (section 2); rendering it to PDF is the owner's
  stack, outside Pivot. (SL-09's G3 decision: Pandoc Markdown, where Pivot's promise ends; SL-09
  criteria 1, 2 and 5.)
- **C-011 No change this module makes is unrecorded.** Each of `createTemplate` and `produceReport`
  calls `change-log.recordChange` exactly once, with `act.profile` and a `RecordedChange` whose
  `records` are the one record it created, `before` null and `after` that record;
  `madeForPlatformId` is `act.madeForPlatformId` unchanged; and `affectedPlatformIds` is empty for a
  template, which no platform reads, and `registry.platformsAffected(body, { kind: 'platform', id:
  fields.platformId })` for a report, which is that one platform (registry C-024). There is no
  operation of this contract that writes a template or a report and no entry, so every template
  saved and every report produced is in the history with every field it held (`change-log` C-002).
  When `recordChange` rejects, the operation rejects with that error and the body passed in is
  unchanged. A read and a render write nothing and record nothing. (REQ-010, REQ-045 as
  `change-log`'s, reachable for these two kinds only through this clause; HZ-005; DEC-016.)
- **C-012 A malformed record is refused, and a record is written once.** An entry of
  `collections['report-template']` is malformed when its key differs from its `id`, its `id` is not a
  `ReportTemplateId`, its `kind` is not `'report-template'`, its `status` is not a `RecordStatus`, a
  header id is not a user profile id, a header time is not a `TimestampAest`, its `name` or `title`
  is not a string that is not empty once trimmed, or its `sections` is not a list C-001 would accept.
  An entry of `collections.report` is malformed when the header is malformed in the same way for
  `'report'` and a `ReportId`; `templateId` is not a `ReportTemplateId`; `templateName`, `title`, or
  `platformName` is not a string; `sections` is not a list C-001 would accept; `platformId` is not a
  platform id; an entry of `hazards` has a `hazardId` that is not a `HazardId`, a `title` or
  `reportId` that is not a string, a `residual` whose `consequence` is neither null nor a whole
  number 1 to 5 or whose `likelihood` is neither null nor a letter A to G, or a `controls` entry
  whose `controlId` is not a control id, `title` not a string, `controlKind` not a `ControlKind`,
  `state` not a `ControlPlatformState`, or `justificationText` neither null nor a string; an entry of
  `omitted` has a `hazardId` that is not a `HazardId` or a `reason` that is not an `OmissionReason`;
  an entry of `bowties` has a `hazardId` that no entry of `hazards` has, or an `svg` that is not a
  string, or two share a `hazardId`; or an entry of `outOfDate` has a `ref` whose `kind` is not
  `platform`, `hazard`, or `control` or whose `id` is not a string, a `name` that is not a string, a
  `nextDueAest` that is not a `DateAest`, or a `lastReviewedAest` neither null nor a `DateAest`.
  Every operation taking a body rejects with the malformed error naming the entry's key, so a list
  of templates or reports is never shown with one silently missing, and `includesOf` and the two
  renders reject a report malformed in the same way with `InvalidReportError`. Every value
  `produceReport` resolves with is well formed. No operation of this contract changes a template or
  a report once written, and `collections['report-template']` and `collections.report` are written
  by this module alone, so a report cannot be changed through any contract: what it held when it
  was produced is what it holds. (REQ-027 and SL-09's G3 decision, a report answered later.)

Ordering: `listTemplates` and `listReports` ascending `createdAtAest` then id; a template's
`sections` in the order given (C-001); a report's `hazards` and `omitted` in
`registry.listPlatformHazards`' order and each hazard's `controls` in its row's (C-004); `bowties`
in the order of `hazards` (C-005); `outOfDate` in `review-schedule.listOverdue`'s order, ascending
`nextDueAest` then the schedule's id (C-006); `includesOf` in the report's own orders, controls by
first appearance (C-007); `reportsIncluding` in `listReports`' order (C-007); a document's marks in
C-008's order. Collections are keyed, so the order of their entries is not data.
Idempotency: every read and both renders are harmless and, on the same arguments, resolve with
deep-equal results, and a render with identical text (C-008). `createTemplate` twice with equal
fields gives two templates, and `produceReport` twice with equal fields gives two reports with two
ids, which is two reports produced and not a repeat; nothing here refuses either.
Determinism: with the baseline clock held, every operation is a function of its arguments and of
the ids `IdKind.fresh` returns, which a conformance test must not assume (DEC-005). `outOfDateFor`
and so `produceReport` read the clock through `review-schedule.listOverdue`, which is why a test of
C-006 fixes the baseline clock rather than passing a date. A render reads no clock: the production
date is the report's own.
Null and empty semantics: a missing collection reads as empty; `getTemplate` and `getReport` of an
id nothing has are null; a platform with no hazards gives a report with `hazards` and `omitted`
empty, whose hazards section is drawn with no marks inside it, which is the stored data and not a
report that could not be read; `bowties` empty is a report with no bow-tie asked for; `outOfDate`
empty is a report produced with nothing past due, and draws no notice (C-008); a `justificationText`
of null is a control that is not excluded; a `lastReviewedAest` of null is a record never reviewed,
not one whose date could not be read; a residual with both values null draws the `Uncategorised`
band `rating` C-002 gives.
Concurrency safety: two copies of Pivot on one folder are the designed case (ASM-004). Each holds
its own working body, so two copies may each produce a report before either saves; `store` C-004
decides what `data.json` then holds. Within one copy, calls are made one at a time by the caller on
the body it holds; a consumer that discards a returned body discards the report and its entry
together. The two renders hold no state and are safe without qualification.
Side effects: none (C-003). A changing operation resolves with a body carrying its record and its
entry, or it rejects and the body it was given is unchanged.
Tolerance and precision: none. Every comparison is exact; a residual is the level and the letter an
assessor entered and never a band, a score, or a number derived from them (DEC-002).

This module places no fault points at 1.0. C-012 is reached by an entry of either collection built
in test code, as registry's malformed records are; C-006 by `review-schedule.setSchedule` on the
platform, a hazard, and a control, and `clock.fixClock` either side of a due date, released in a
finally block; C-006's refusal by producing with the list shown before a `setSchedule` or a clock
change and asserting the body unchanged; C-003 and C-005's "as at production" by a `renameHazard`,
an `addCausalFactor`, and a `confirmControlForPlatform` through `registry` after production and
reading the report back; C-004's omitted half by a body whose control, rating, or justification
record is malformed, as registry's suite builds one; and the `MalformedEntryError` of section 4 by
a body whose `collections['change-log-entry']` holds an entry `change-log` C-008 refuses. Nothing
here needs arming of its own.

## 6. Performance envelope
`createTemplate` is linear in `collections['report-template']` for the fresh id, plus one
`change-log.recordChange`. `outOfDateFor` is one `registry.listPlatformHazards` and one
`review-schedule.listOverdue` (registry section 6, review-schedule section 6), then linear in the
rows and the overdue list. `produceReport` is one `outOfDateFor`, one `bowtie.bowtieFor` and one
`bowtie.renderBowtieSvg` per bow-tie asked for — each `bowtieFor` itself two registry reads (bowtie
section 6) — one `registry.platformsAffected`, and one `change-log.recordChange`, whose cost grows
with the history (`change-log` section 6). The reads are linear in their collection; no index is
kept. `reportsIncluding` is linear in the reports and what they hold. A render is linear in the
report's size, including every bow-tie's text, plus one `rating.ratingFor` per hazard. A report
holds each bow-tie drawing whole, so `collections.report` grows with every report produced and
every drawing included and is never pruned, which grows `data.json` and every backup of it; no
bound beyond DEC-003's is claimed.

## 7. Trace
Allocated to this module in `trace/requirements.yaml`; mitigations in `trace/hazards.yaml`; the
dependency graph in `modules/reports/manifest.yaml`, checked against the real imports. These are
the sources, not this list (DEC-011). Checked by `check_traces.py` and `check_boundaries.js`.

Promised at version 1.0: REQ-007 (C-004), REQ-016 (C-006), REQ-027 (C-007), REQ-046 (C-001 with
C-002), REQ-061 (C-005). All five are written to `allocated_to: reports` by this session.
SL-09's criteria 1, 2, 3, and 5 are this module's to hold in data and in the documents (C-002,
C-004 to C-006, C-008); that a user sees a warning, a report's contents, and a download is `views`
10.0's (views C-041 to C-044).

Not claimed at version 1.0. REQ-026 is allocated to `views`: for any hazard, the platforms it is
linked to and each one's controls are `registry`'s and the hazard screen's, and "the reports that
include it" is `reportsIncluding` here, which `views` 10.0 C-044 calls. REQ-010 and REQ-045 are
`change-log`'s, reached for the two kinds this module owns only through C-011. REQ-017 is `rating`'s
and `views`', and C-008 is how a document's bands reach it.

HZ-009 is not claimed by SL-09 in `trace/slices.yaml`, and its `mitigation_contract` stays
review-schedule C-009, whose own section 7 recorded that the hazard's telling is REQ-016 at SL-09.
C-006 is that telling and is recorded here as mitigation support so it is not discovered as a gap;
moving the hazard's mitigation to this clause, or claiming HZ-009 for this slice, is a GATE
decision and not this session's (P10). HZ-004 is registry C-019's and SL-03's; C-004 is support, as
workflows C-006 is. HZ-011 is bowtie C-004's; C-005 keeps what bowtie drew unchanged.

`review-schedule`'s `SCHEDULABLE_KINDS` is not widened. REQ-015 names reports among the kinds that
may carry a last reviewed date; no criterion of SL-09 asks for a report to be reviewed, and a report
is written once and never changed (C-012), so the four kinds stand and the gap stays recorded there.

## Explicitly not promised
- Editing, deleting, retiring, renaming, or copying a template or a report. `status` is `'live'` on
  every record this version writes and no operation changes one (C-012). A template made in error is
  answered by making another; a report produced in error by the history (C-011). Report versions as
  separate records beyond what REQ-051 already needs are out of SL-09's scope.
- That template names are unique, or any search, filter, sort, or grouping over templates or reports
  beyond the two lists' order.
- Any reference register entry in a report, and so any warning about one (preamble). REQ-016's
  "reference document" is reached at this version by there being none in a report.
- A hazard's initial rating, causal factors, or consequences in a report's rows, or a control's
  confirmation (who and when). A row is what criterion 2 names: the hazard, its controls, and its
  residual rating. Causal factors and consequences are in a report only inside a bow-tie asked for.
- Any layout beyond what a template expresses (SL-09, *Out of scope*): column choice, per-hazard
  fields, ordering or filtering of hazards, page breaks, a table of contents, numbering, a logo,
  fonts, colours, or any wording, element, or tag beyond C-008 to C-010's marks. The header's and
  notice's wording, and how a mark's text is arranged inside it, are not promised.
- That a document fits a page, prints on a given paper size, or that drawn text fits inside a
  bow-tie's box (bowtie's not-promised section).
- That pandoc, tectonic, or any stack renders the Markdown, or renders an SVG image from a `data:`
  URI, or that the PDF looks like the HTML. Pivot's promise ends at the Markdown file (SL-09's G3
  decision).
- That a report's out-of-date list is still true after production. It says what was past due when
  the report was produced, as every field of a report does (C-003).
- Whether the producing user's name appears in a document. `createdBy` holds their profile id;
  naming it needs `profiles`, which this module does not import.
- A report on more than one platform, or on no platform.
- Which file a document is written to, what it is named, and how the user chooses it: `views`' and
  `store`'s (DEC-030).
- Any guard against producing two reports that are the same, or against a template no report uses.
- That a `hazardId`, `controlId`, `platformId`, or `templateId` held by a report still names a
  record that exists or is live at any time after production (C-003).
- Whether a returned record is the same object as the entry in the returned body, or a copy. Treat
  every returned value as read-only.
- The order of entries inside either collection, or anything about the body a consumer reads
  directly rather than through this contract.
- That `Report`, `ReportTemplate`, `SECTION_KINDS`, or the marks of C-009 and C-010 gain nothing.
  Adding any is an Interface change.
