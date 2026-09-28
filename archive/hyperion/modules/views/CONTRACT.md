# Contract: views
Version: 11.0 · Status: draft

Written for SL-01 at 1.0, extended for SL-02 at 2.0, for SL-03 at 3.0, for SL-04 at 4.0, for
SL-05 at 5.0, for SL-06 at 6.0, for SL-10 at 7.0, for SL-07 at 8.0, for SL-08 at 9.0, for SL-09
at 10.0, and for SL-11 at 11.0.
At 1.0 it promised the walking skeleton's screens: the folder picker, the profile screen, the
top bar, the hazard screen (one form to add a hazard, above the hazards the working body
holds), and the save that says when another user saved in between. At 2.0 it added what the
user is told and asked while HZ-003 is kept closed: the check of every file on opening, the
changes a failed save did not store, telling `store` of every change so it can back up and
mirror, the offer to recover unsaved working state, and restore with a warning and a
confirmation. At 3.0 it added the five screens SL-03's record model is entered and read on — a
hazard's own detail, the control library, the platforms, one platform's hazards, and one
hazard's assessment on one platform — and with them the two halves of SL-03 this module owns:
every list of a platform's hazards is one `registry` query (C-020, REQ-009, HZ-004), and every
rating shown is `rating.ratingFor` of the values as entered (C-021, REQ-017, HZ-010). At 4.0
it promises what a user sees and does about one of a hazard's controls on one platform: every
one of them shown in the one state registry 3.0 gives it — confirmed, excluded with the reason
a person wrote, or awaiting a ruling — and the two acts that move between those states, one
control at a time (C-024, C-025; REQ-002; HZ-001, HZ-007). The contract is the screen as plain
data and the operations the user can perform on it; the drawing of that data into the page is
the implementation's and is verified by demonstration (DEC-010).

C-001 to C-014 keep their 2.0 meaning. C-001 widens to the five new screens and the order
they are reached in (C-015); C-002's table gains a row per new screen kind; C-008 widens to
every new operation; C-009's confinement gains `rating` as the only source of a band and
names the `registry` reads this version adds; C-012 widens from one changing operation to
the thirteen this version has. C-015 to C-024 are new at 3.0.

At 4.0 every 3.0 clause holds but five, and each of the five changes only where 3.0 named
`linkControlToPlatform` or `unlinkControlFromPlatform`, the two operations DEC-014 replaced
with `confirmControlForPlatform` and `excludeControlFromPlatform`: C-002's assessment row and
its list of changing operations, C-008 through section 4's rows, C-012's list of the
operations that tell `store`, and C-022's list of what leaves a rating untouched. C-024 is
rewritten: 3.0 showed a control's place on a platform as `PlatformControl.linkedToPlatform`, a
boolean that said nothing about which of the two not-linked states a control was in, and it is
replaced by the three states registry C-021 gives. C-025 is new: the two acts, each naming one
control, and what each does to the screen. The assessment screen gains `profiles`, so a
confirmation's `byProfileId` is drawn as a name the way a platform's owner already is (C-018);
no screen changes otherwise, and every other screen of 3.0 is as it was.

At 5.0 it promises what a user reads and does about the history of every change, and about a
change a platform has not seen: the whole history as one screen any user reaches, every act
with the previous and new value of each field it changed (C-028; REQ-010 and REQ-045 are
`change-log`'s); the platforms an edit reaches, listed and proceeded past before the edit is
made (C-027; REQ-011; SL-05 criterion 3); the queue of every platform the active profile owns
and the one act that clears an entry from it (C-029; REQ-012 and REQ-081 are `change-log`'s);
and the three retirements with the refusal that names the platforms standing in the way
(C-030; REQ-067 and REQ-076 are `registry`'s). With them comes the shape DEC-016 gave every
changing call: the `Act` this module builds from the selected profile and the platform the
screen holds (C-026), which is what decides whose queue a change lands in.

At 5.0 every 4.0 clause holds but nine, and each changes only where a new screen, a new
operation, or the `Act` reaches it. C-001's order gains the history, the acknowledgement, and
the confirm-edit screens; C-002's table gains a row per new screen kind and its operations,
and its list of what changes stored data widens from sixteen operations to twenty-two;
C-009's confinement gains `change-log` as the only source of an entry or a queue and
`registry.platformsAffected` as the only source of the platforms a change reaches; C-012's
list of the operations that tell `store` widens to the same twenty-two less `save` and
`confirmRestore`; C-015's table gains the two edges the hazards screen now has; C-016, C-017,
and C-018 gain the operations that retire, transfer, and gate; C-022 and C-023 lose the
idempotency of a second `enterRating` or `setReportId` with the value already stored, which
registry C-029 now refuses. C-024's three states are unchanged, and a control retired in the
library is still shown in the state it was in on every platform it was already on (registry
C-027). C-026 to C-030 are new. No screen of 4.0 loses a field, and nothing stored changes
shape: `collections['change-log-entry']` is a collection 4.0 did not write and this module
never reads directly (C-009).

At 6.0 it promises what a user reads and sets about when each record is next reviewed: every
screen that shows a record of a schedulable kind carries that body's review standing — the
tempo and the due date a user set for each of them, and which of them are overdue — from one
`review-schedule.listSchedules` and one `review-schedule.listOverdue` of that same body and
from no rule of this module's own (C-031; REQ-019, REQ-023; HZ-012); and one operation sets the
tempo and the due date of one hazard, one control, or one platform, from the screen that lists
it (C-032; SL-06 criterion 1). Nothing at this version completes a review: the last reviewed
date moves only through `review-schedule.completeReview`, which this surface does not offer and
`workflows` calls at SL-07, so no act of this contract sets it and editing a record here leaves
it as it was (SL-06 criterion 3).

At 6.0 every 5.0 clause holds but seven, and each changes only where the new field, the new
operation, or the `ScheduleAct` reaches it. C-002's table gains `setReviewTempo` on three screen
kinds, and its list of what changes stored data widens from twenty-two operations to
twenty-three; C-008 widens to the new operation's rows; C-009's confinement gains
`review-schedule` as the only source of a schedule, a due date, and an overdue flag, and gains
the `ScheduleFields` and the `ScheduleAct` this module passes; C-012's list of the operations
that tell `store` widens from eighteen to nineteen, which is those twenty-three less `save`,
`confirmRestore`, `acceptRecovery`, and `declineRecovery`, none of which calls `noteChange`;
C-015 gains
no edge, because no screen is added, and every screen it names is built with two more reads;
C-026 gains the `ScheduleAct`, which is the `Act` plus the platforms
`registry.platformsAffected` named (DEC-020); and C-027 gains a sixth gated operation and a
sixth `PendingEdit` variant (DEC-021). C-031 and C-032 are new. No screen of 5.0 loses a field,
none is added or removed, and nothing stored changes shape: `collections['review-schedule']` is
a collection 5.0 did not write, this module never reads it directly (C-009), and the kind
baseline gained for it at DEC-018 left the envelope, the header, and `DataBody` as they were,
so schema v1 stands.

At 7.0 it promises the two screens the reference register is kept on: the register itself, every
entry as `reference-register.listEntries` gave it with what the user entered shown back (C-033;
REQ-028; SL-10 criterion 1), and one entry's own screen, everything that entry is linked to in
one list from the entry's own `links` and from no second place (C-034; REQ-031; SL-10 criterion
3). Both carry the flag SL-10 criterion 4 asks for: every screen that lists a reference entry
carries that register's file standing, from one `reference-register.checkEntryFiles` of that body
and that folder and from no rule of this module's own, so an entry whose stored file has gone is
flagged in every list that shows it and one whose file is there is not (C-035; REQ-078). The two
acts are `createReference`, which carries a chosen file to the folder through
`reference-register` and stores only where it went (C-033; REQ-029 is `store`'s), and
`linkReference`, which links the entry the screen holds to one hazard, control, or platform of
that screen's own lists (C-034; REQ-030). With them comes the derivation DEC-024 settled: the
platforms a reference act reaches are the union of `registry.platformsAffected` over the entry's
links, which is what this module passes as the act's `affectedPlatformIds` and what the
confirm-edit screen lists when the act is gated (C-026, C-027).

At 7.0 every 6.0 clause holds but eight, and each changes only where a new screen, a new
operation, or the `EntryAct` reaches it. C-001's order gains the register and the entry screens;
C-002's table gains a row per new screen kind and its operations, and its list of what changes
stored data widens from twenty-three operations to twenty-five; C-009's confinement gains
`reference-register` as the only source of an entry, its links, and its file standing, and gains
`reference-register.createEntry` as a second path by which this module's act reaches the folder —
the file `store.putStoredFile` keeps, which is the first write to `files/` any screen of this
module causes (DEC-022); C-012's list of the operations that tell `store` widens from nineteen to
twenty-one; C-015's table gains the two edges the register now has; C-026 gains the `EntryAct`,
which is the `Act` plus the union DEC-024 names; C-027 gains a seventh gated operation and a
seventh `PendingEdit` variant (DEC-024); and C-031 gains the two new screens, which is where
REQ-023's reference-document half is answered — views 6.0 recorded that it waited for the version
adding these screens, and this is that version. C-033 to C-035 are new. No screen of 6.0 loses a
field, none is removed, and nothing stored changes shape:
`collections['reference-entry']` is a collection 6.0 did not write, this module never reads it
directly (C-009), and the kind has been in the baseline since it was instantiated, so schema v1
stands. Nothing at this version sets a review tempo for a reference entry: `setReviewTempo`
keeps the three screens and three kinds C-032 gave it, which is what `docs/slices/SL-10.md`
puts out of scope, so a reference entry's tempo is set over `review-schedule`'s own surface and
read back here (C-031, C-035).

At 8.0 it promises the screens the five guided workflows are run on: the register of workflows,
every live one as `workflows.listWorkflows` gave it beside the name of the record it is performed
on, and the one act that starts one of the five (C-036); and one workflow's own screen, the step
it is at with the steps done and the steps remaining from one `workflows.progressOf` and what
that step still asks from one `workflows.stepDemand`, which is the visible half of REQ-037 that
`workflows` 1.0 could not claim (C-037; SL-07 criterion 1). On that screen the record the
workflow is performed on is shown the way that record's own screen shows it and from the same
call: a platform's hazards from the one `registry.listPlatformHazards`, each row carrying its
controls and the band `rating` gave for its residual and each omitted hazard named, which is
criterion 3's presentation (C-020, C-021, C-024); a hazard's detail from the one
`registry.getHazardDetail` (C-016). The four acts of a running workflow — submit a step, advance,
complete, abandon — are each one call to `workflows` and nothing of this module's own (C-038):
this module holds no step list, derives no demand, makes no act a step makes, and seals nothing,
and a complete workflow refuses every one of the four with the message criterion 4 asks for
(REQ-039).

At 8.0 every 7.0 clause holds but eleven, and each changes only where a new screen, a new
operation, or the workflow `Act` reaches it. C-001's order gains the workflows and workflow
screens; C-002's table gains a row per new screen kind and its operations, and its list of what
changes stored data widens from twenty-five operations to thirty; C-009's confinement gains
`workflows` as the only source of a workflow record, a step list, a step's progress, and a step's
demand, and records that a completed review workflow moves a last reviewed date through
`workflows` and through no call of this module's; C-012's list of the operations that tell
`store` widens from twenty-one to twenty-six; C-015's table gains the two edges the register of
workflows now has; C-016's detail and C-020's one query gain the workflow screen as a second
screen each is read on, and C-021 and C-024 gain that screen's rows; C-026 gains the `Act` a
workflow operation carries, which is registry's own `Act` and not a third act shape, because
`workflows` derives its own `affectedPlatformIds` from the subject rather than taking one
(DEC-026); C-027 gains the five changing workflow operations and four `PendingEdit` variants, and
states outright the invariant it has kept since 5.0 (DEC-027); C-031 gains the two new screens;
C-032's last paragraph is rewritten, because at this version a user does reach a last reviewed
date from a screen of this module — through `completeWorkflow`, which is `workflows`' call and
not this module's; and C-035 gains the two new screens to its exception list, neither listing a
reference entry. C-036 to C-038 are new. No screen of 7.0 loses a field, none is removed, and
nothing stored changes shape: `collections['workflow-record']` is a collection 7.0 did not write,
this module never reads it directly (C-009), and the kind has been in the baseline since CHG-001,
so schema v1 stands. Nothing at this version sets a review tempo for a workflow record:
`setReviewTempo` keeps the three screens and three kinds C-032 gave it, and
`workflow-record` is outside `SCHEDULABLE_KINDS`, which `workflows` section 7 records and this
slice does not widen.

At 9.0 it promises the bow-tie screen and the export. One hazard on one platform is shown as its
bow-tie on a screen reached from that pair's assessment screen: the `Bowtie` value
`bowtie.bowtieFor` gave for the working body and the SVG document `bowtie.renderBowtieSvg` drew
from it, both from calls made when the screen is built, so the drawing is the registry's data as it
now is and a hazard edited since is drawn as edited (C-039; REQ-059's shown half; SL-08 criteria 1
and 2). Nothing about the diagram is written to the data folder or the browser's storage, and no
screen of this module keeps a drawing after the screen that showed it. Exporting generates the
bow-tie again from the same working body and writes that text through `store.writeExportFile` to
the file the user chose with `store.chooseExportFile`, and resolves with the bow-tie screen whose
`svg` is the text written; the drawing shown before the export and the one written are the same
string, because `bowtie` C-010 gives one document for one value and nothing can change the working
body while the bow-tie screen is shown (C-040; REQ-060; SL-08 criterion 3; DEC-030, DEC-031).

At 9.0 every 8.0 clause holds but nine, and each changes only where the new screen or its two acts
reach it. C-001's order gains the bow-tie screen, reached from and returned to the assessment
screen; C-002's table gains `openBowtie` on the assessment screen and a row for the bow-tie
screen, and its list of what changes stored data is unchanged at thirty, because neither act
changes the working body, the folder, or the browser's storage; C-009's confinement gains `bowtie`
as the only source of a bow-tie and its drawing, and `store.writeExportFile` as the one write this
module causes outside the data folder and the browser's storage; C-012 is unchanged in substance
and names the two acts among those that do not call `noteChange`; C-015's table gains the one edge;
C-024 gains the bow-tie screen's two control lists; C-026 names the bow-tie screen as one that
holds a platform and builds no act; C-031 gains the bow-tie screen; and C-035 gains it to its
exception list. C-039 and C-040 are new. No screen of 8.0 loses a field, none is removed, nothing
stored changes shape, and no collection is added: a bow-tie is stored nowhere (REQ-059), so schema
v1 stands. No rating is on the bow-tie screen, which is the reading `bowtie` 1.0 took of SL-08's
"consumes rating" and which awaits jay-pryor's ruling there; adding one is an Interface change to
C-039.

At 10.0 it promises the screens reports are made and read on, each over `reports` 1.0 and from no
rule of this module's own. The reports screen lists every live template and report as `reports`
gave them, with the platforms a report may be produced on, and saves a template (C-041; REQ-046;
SL-09 criterion 1). A report is produced in two steps. `beginReport` shows the prepare-report
screen: the platform's hazards from the one `registry.listPlatformHazards` every list of them is
made from, each omitted hazard named, the bow-ties chosen from those rows, and — whenever
`reports.outOfDateFor` names a record the report would use that is past its review due date — one
warning naming each such record with its last reviewed date, and no warning when it names none.
`produceReport` then hands `reports` exactly the list that screen showed, which that contract
refuses when the list has changed, so no report is produced from out-of-date data past a warning
the user did not see (C-042; REQ-016; HZ-009; SL-09 criteria 2, 3 and 5; DEC-034). A report's own
screen shows it as stored, with the platforms, hazards, and controls `reports.includesOf` reads
from it, and downloads it in either output form through `store.writeExportFile` (C-043; REQ-027;
SL-09 criterion 4 and its G3 decision; DEC-030). A hazard's own screen gains the platforms it is
linked to, each with that hazard's controls on it from that platform's one query, and the reports
that include it (C-044; REQ-026; SL-09 criterion 4).

At 10.0 every 9.0 clause holds but fourteen, and each changes only where a new screen, a new
operation, or the hazard screen's two new fields reach it. C-001's order gains the three report
screens; C-002's table gains a row per new screen kind and `openReports` on the hazards screen, and
its list of what changes stored data widens from thirty operations to thirty-two; C-009's
confinement gains `reports` as the only source of a template, a report, what a report includes, the
reports that include a record, the records a report would use that are past due, and a report's
documents; C-012's list of the operations that tell `store` widens from twenty-six to twenty-eight
and names the two downloads among those that do not; C-015's table gains four edges; C-016's
hazard screen gains the reads of C-044; C-020 and C-021 gain the prepare-report screen; C-024 gains
the hazard screen's platforms and the prepare-report screen's rows; C-026 gains the `Act` a reports
operation carries; C-027 names the two new changing operations among those never gated; C-031 gains
the reports and prepare-report screens and the report screen to its exception list; and C-035 gains
the three to its exception list. C-041 to C-044 are new. No screen of 9.0 loses a field, none is
removed, and nothing stored changes shape: `collections['report-template']` and
`collections.report` are collections 9.0 did not write, this module never reads them directly
(C-009), and both kinds have been in the baseline since CHG-001, so schema v1 stands.

At 11.0 it promises the last three screens of `views`, each reached from the hazards screen,
each only reading, and each composed from reads other contracts give, with the readings
jay-pryor ruled in `docs/slices/SL-11.md` as the rules of composition (DEC-037). The filter
screen lists every hazard and every control whatever its status, each against every platform
whose one query shows it, and narrows both lists by platform, residual band, record status,
control state, and reference entry, singly and together, so the filtered lists are the
unfiltered ones less what fails a filter (C-045; REQ-047; SL-11 criterion 1). The dashboard
shows, for each live platform the active profile owns, the overdue reviews of that platform and
of what is on it, its controls awaiting a ruling, the workflows in progress on it, and the
changes it has not acknowledged, and nothing of any platform another profile owns (C-046;
REQ-049; SL-11 criterion 2). The open-items view shows the same items for every live platform
whatever its owner, the overdue reviews and in-progress workflows on no live platform, and every
live hazard, control, platform, and reference entry linked to nothing (C-047, C-048; REQ-066,
REQ-068; SL-11 criteria 3 and 4). Which links make a record linked is this module's rule, over
`registry` 5.0's `listLinks` and `getHazardDetail` and the entries and workflows that name the
record (C-048; registry C-030, C-031, DEC-036).

At 11.0 every 10.0 clause holds but nine, and each changes only where a new screen reaches it.
C-001's order gains the three screens; C-002's table gains `openDashboard`, `openOpenItems`, and
`openFilter` on the hazards screen and a row for each new screen, and its list of what changes
stored data is unchanged at thirty-two, because no new operation changes anything; C-009's
confinement gains `registry.listAllHazards`, `listAllControls`, `listAllPlatforms`, and
`listLinks` as reads, and names the rules of composition this version adds as this module's own;
C-012 names the four new operations among those that do not call `noteChange`; C-015's table
gains three edges; C-020, C-021, and C-024 gain the new screens' rows; C-031 gains the three
screens; and C-035 gains the filter and open-items screens, which list reference entries, and
the dashboard to its exception list. C-045 to C-048 are new. No screen of 10.0 loses a field,
none is removed, nothing stored changes shape, and no collection is added, so schema v1 stands.

## 1. Purpose
Show the user the working state as one screen at a time, and carry what the user does on
that screen to the module that owns the data. The "and" is DEC-004's: `views` is the one
module that draws, and the two halves are one loop, so nothing depends on this module and
it may be replaced whole.

## 2. Operations
In `contract.js`. Every operation is asynchronous and returns a promise (DEC-012). Every
operation but `start` takes the `App` and resolves with the `Screen` the app now shows,
having set `app.screen` to the same value.

| Operation | Signature | Verified by |
|---|---|---|
| start | `() → App` | conformance |
| chooseFolder | `(app: App) → Screen` | demonstration (SL-01 criterion 1; REQ-040, REQ-041) |
| openFolder | `(app: App, handle: DataFolderHandle) → Screen` | conformance |
| acknowledgeCheck | `(app: App) → Screen` | conformance |
| createProfile | `(app: App, name: string) → Screen` | conformance |
| selectProfile | `(app: App, id: UserProfileId) → Screen` | conformance |
| acceptRecovery | `(app: App) → Screen` | conformance |
| declineRecovery | `(app: App) → Screen` | conformance |
| addHazard | `(app: App, fields: HazardFields) → Screen` | conformance |
| save | `(app: App) → Screen` | conformance |
| beginRestore | `(app: App) → Screen` | conformance |
| chooseSaveState | `(app: App) → Screen` | demonstration (SL-02 criterion 4) |
| prepareRestore | `(app: App, source: RestoreSource) → Screen` | conformance |
| confirmRestore | `(app: App) → Screen` | conformance |
| cancelRestore | `(app: App) → Screen` | conformance |
| openHazard | `(app: App, id: HazardId) → Screen` | conformance |
| renameHazard | `(app: App, fields: HazardFields) → Screen` | conformance |
| addCausalFactor | `(app: App, fields: TextFields) → Screen` | conformance |
| addConsequence | `(app: App, fields: TextFields) → Screen` | conformance |
| linkControlToHazard | `(app: App, controlId: ControlId, controlKind: ControlKind) → Screen` | conformance |
| retireHazard | `(app: App) → Screen` | conformance |
| openControls | `(app: App) → Screen` | conformance |
| createControl | `(app: App, fields: ControlFields) → Screen` | conformance |
| retireControl | `(app: App, controlId: ControlId) → Screen` | conformance |
| openPlatforms | `(app: App) → Screen` | conformance |
| createPlatform | `(app: App, fields: PlatformFields) → Screen` | conformance |
| retirePlatform | `(app: App, platformId: PlatformId) → Screen` | conformance |
| setPlatformOwner | `(app: App, platformId: PlatformId, ownerProfileId: UserProfileId) → Screen` | conformance |
| openPlatform | `(app: App, id: PlatformId) → Screen` | conformance |
| linkHazardToPlatform | `(app: App, hazardId: HazardId) → Screen` | conformance |
| openAssessment | `(app: App, hazardId: HazardId) → Screen` | conformance |
| setReportId | `(app: App, reportId: PlatformReportId) → Screen` | conformance |
| enterRating | `(app: App, stage: RatingStage, values: RatingValues) → Screen` | conformance |
| confirmControlForPlatform | `(app: App, controlId: ControlId) → Screen` | conformance |
| excludeControlFromPlatform | `(app: App, controlId: ControlId, text: string) → Screen` | conformance |
| openBowtie | `(app: App) → Screen` | conformance |
| chooseExportTarget | `(app: App) → Screen` | demonstration (SL-08 criterion 3) |
| exportBowtie | `(app: App, target: ExportFileHandle) → Screen` | conformance |
| openReports | `(app: App) → Screen` | conformance |
| createTemplate | `(app: App, fields: TemplateFields) → Screen` | conformance |
| beginReport | `(app: App, fields: BeginReportFields) → Screen` | conformance |
| produceReport | `(app: App, bowtieHazardIds: readonly HazardId[]) → Screen` | conformance |
| openReport | `(app: App, id: ReportId) → Screen` | conformance |
| chooseReportExportTarget | `(app: App, format: ReportFormat) → Screen` | demonstration (SL-09's G3 decision: the download) |
| exportReport | `(app: App, target: ExportFileHandle, format: ReportFormat) → Screen` | conformance |
| openFilter | `(app: App) → Screen` | conformance |
| applyFilter | `(app: App, filter: ItemFilter) → Screen` | conformance |
| openDashboard | `(app: App) → Screen` | conformance |
| openOpenItems | `(app: App) → Screen` | conformance |
| openHistory | `(app: App) → Screen` | conformance |
| openAcknowledgements | `(app: App) → Screen` | conformance |
| acknowledgeChange | `(app: App, entryId: ChangeLogEntryId, platformId: PlatformId) → Screen` | conformance |
| setReviewTempo | `(app: App, fields: ScheduleFields) → Screen` | conformance |
| openReferences | `(app: App) → Screen` | conformance |
| createReference | `(app: App, fields: EntryFields) → Screen` | conformance |
| openReference | `(app: App, id: ReferenceEntryId) → Screen` | conformance |
| linkReference | `(app: App, ref: RecordRef) → Screen` | conformance |
| openWorkflows | `(app: App) → Screen` | conformance |
| startWorkflow | `(app: App, fields: StartFields) → Screen` | conformance |
| openWorkflow | `(app: App, id: WorkflowRecordId) → Screen` | conformance |
| submitStep | `(app: App, submission: StepSubmission) → Screen` | conformance |
| advanceStep | `(app: App) → Screen` | conformance |
| completeWorkflow | `(app: App, fields: CompletionFields) → Screen` | conformance |
| abandonWorkflow | `(app: App) → Screen` | conformance |
| confirmEdit | `(app: App) → Screen` | conformance |
| cancelEdit | `(app: App) → Screen` | conformance |
| back | `(app: App) → Screen` | conformance |

`chooseFolder` is `store.chooseDataFolder` followed by what `openFolder` does, and
`chooseSaveState` is `store.chooseSaveStateFile` followed by what `prepareRestore` does
with a `save-state` source. They are the only operations that talk to the browser and the
only ones the suite cannot exercise. `openFolder` and `prepareRestore` are the same paths
from a handle or a source already in hand, which is what a conformance test supplies
through `store`'s in-memory folder. The operations added at 3.0 name only the ids of the
thing the user picked on the screen they are called from: the hazard, the platform, and the
stage the rest of the operation needs are the ones the screen already holds, which is why
none of them takes a `hazardId` and a `platformId` together (C-015). The two operations added
at 4.0 name one `controlId` and never a list, so no call of this surface confirms or excludes
more than one control (C-025; HZ-007). The operations added at 5.0 name the same way: the one
control or platform the user picked on the list they are called from, the entry and platform of
the queue row they are on, and, for `retireHazard`, `confirmEdit`, and `cancelEdit`, nothing at
all, because the hazard and the pending edit are what the screen already holds (C-026, C-027,
C-030). The one operation added at 6.0 names the record it schedules the other way, by the
`RecordRef` in its `ScheduleFields`, because one operation serves three screens and each of
them offers a tempo for a different kind: it is a `hazard` on the hazard screen, a `control` on
the controls screen, and a `platform` on the platforms screen, and a ref of any other kind, or
one naming a record that screen does not offer a tempo for, is refused before anything is
called (C-032). `ScheduleFields` is `review-schedule`'s bundle and is passed through untouched,
as `HazardFields` and `ControlFields` are `registry`'s. The two operations added at 7.0 name the
same way: `createReference` takes `reference-register`'s own `EntryFields` and passes it through
untouched, the file included, and names no entry because it is making one; it is verified by
conformance rather than by demonstration because it takes an `IncomingFile` — a name and bytes
already in hand — and never a picker: choosing the file and reading its bytes is the page's, in
`src/main.js`, as drawing a `Screen` is, and a test constructs one (store section 3); `linkReference` names
only the `ref` the user picked, because the entry is the one the entry screen already holds, as
`renameHazard`'s hazard is (C-034). The `ref` must be one of that screen's own linkable lists —
a hazard, a control, or a platform — and a ref of any other kind, or one naming a record that
screen does not list, is refused before anything is called (C-034), as C-032 refuses a
`ScheduleFields.ref` outside its screen's row. The seven operations added at 8.0 name the same
way: `startWorkflow` takes `workflows`' own `StartFields` and passes it through untouched, and
names no workflow because it is making one; its `subject` must be null or a
`{ kind: 'platform', id }` for an entry of the workflows screen's own `platforms`, and any other
is refused before anything is called (C-036), as C-032 refuses a `ScheduleFields.ref` outside its
screen's row and C-034 a `ref` outside its screen's lists. `openWorkflow` names one id of that
screen's list; and `submitStep`, `advanceStep`, `completeWorkflow`, and `abandonWorkflow` name no
workflow at all, because the workflow is the one the workflow screen already holds, as
`renameHazard`'s hazard is and `linkReference`'s entry is. `StepSubmission` and
`CompletionFields` are `workflows`' bundles and are passed through untouched, as `ScheduleFields`
is `review-schedule`'s and `EntryFields` is `reference-register`'s; which step a submission
belongs to is `workflows` C-004's refusal and no check of this module's, because the step list is
that contract's and this one keeps none (C-009, C-038). The three operations added at 9.0 name the
same way: `openBowtie` names nothing, because the hazard and the platform are the pair the
assessment screen already holds, which is why it takes neither a `hazardId` nor a `platformId`
(C-015, C-039); and `exportBowtie` names only the `target` the user chose, because the bow-tie is
the one the bow-tie screen already holds. `chooseExportTarget` is `store.chooseExportFile`
followed by what `exportBowtie` does with the handle it resolved with, as `chooseFolder` is
`store.chooseDataFolder` followed by what `openFolder` does; it talks to the browser and is
verified by demonstration, and `exportBowtie` is the same path from a handle already in hand, which
a conformance test supplies through `store`'s in-memory route (store C-020). The seven operations
added at 10.0 name the same way: `createTemplate` takes `reports`' own `TemplateFields` and passes
it through untouched, and names no template because it is making one; `beginReport` names a
template and a platform of the reports screen's own lists, and one outside them is refused before
anything is called, as C-032 refuses a `ScheduleFields.ref` outside its screen's row (C-042);
`produceReport` names only the bow-ties chosen, each a hazard of the prepare-report screen's own
`rows`, because the template, the platform, and the out-of-date list are what that screen already
holds, which is why it takes none of them (C-042); `openReport` names one id of the reports
screen's list; and `exportReport` names the `target` the user chose and which of the two documents,
because the report is the one the report screen already holds. `chooseReportExportTarget` is
`store.chooseExportFile` followed by what `exportReport` does with the handle it resolved with, as
`chooseExportTarget` is; it talks to the browser and is verified by demonstration (C-043). The
four operations added at 11.0 name the same way: `openFilter`, `openDashboard`, and
`openOpenItems` name nothing, because what each shows is decided by the working body and the
active profile; and `applyFilter` names only the `ItemFilter`, each of whose values is null, or
one of the filter screen's own `platforms` or `entries`, or one of the seven bands, three record
statuses, or three control states, and any other is refused before anything is called, as C-032
refuses a `ScheduleFields.ref` outside its screen's row (C-045). The
drawing of a `Screen` into the page is entered from `modules/views/src/main.js`, the entry the build
names (DEC-003); it is inside the module, verified by demonstration, and not on this surface.

The folder and the browser's storage are reached only through `modules/store/contract.js`,
profiles only through `modules/profiles/contract.js`, hazards and everything linked to them
only through `modules/registry/contract.js`, a rating band only through
`modules/rating/contract.js`, the history, the queue, and an acknowledgement only through
`modules/change-log/contract.js`, and a review tempo, a due date, a last reviewed date, and an
overdue flag only through `modules/review-schedule/contract.js`, and a reference entry, its
links, and whether its stored file is still there only through
`modules/reference-register/contract.js`, and a workflow record, its steps, its progress, and its
demand only through `modules/workflows/contract.js`, and a bow-tie and its drawing only through
`modules/bowtie/contract.js`, and a file the user chose to export to only through
`modules/store/contract.js`, and a template, a report, what a report includes, the reports that
include a hazard, the records a report would use that are past due, and a report's documents only
through `modules/reports/contract.js`. This module holds the one working `DataBody`
per open
(DEC-006): from `store.load`, replaced by what each `registry` operation returns, by what
`change-log.acknowledge` returns, by what `review-schedule.setSchedule` returns, by what each
changing `reference-register` operation returns, by the `body` of the `WorkflowChange` each
changing `workflows` operation returns, by the `body` of the `TemplateChange` or `ReportChange`
each changing `reports` operation returns, by what
`store.recoverWorkingState` returns, or by a restored plan's body, and passed to
`store.noteChange` and `store.save`.

## 3. Data shapes
From `baseline/types.js`: `UserProfile`, `UserProfileId`, `HazardId`, `ControlId`,
`PlatformId`, `PlatformReportId`, `ChangeLogEntryId`, `ControlKind`, `RatingStage`,
`TimestampAest`, `DateAest`, `ReviewTempoMonths`, `RecordRef`, `ReferenceEntryId`,
`WorkflowRecordId`. From `baseline/schema.js`: `SaveStamp`. From `baseline/messages.js`:
`UserMessage`. From `modules/store/contract.js`: `DataFolderHandle`, `BackupEntry`,
`RestoreSource`, `ExportFileHandle`. From `modules/registry/contract.js`: `Hazard`, `HazardFields`, `Control`,
`ControlFields`, `Platform`, `PlatformFields`, `CausalFactor`, `Consequence`, `TextFields`,
`HazardControl`, `PlatformControl`, `ControlPlatformState`, `Confirmation`, `Justification`,
`PlatformHazardRow`, `OmittedHazard`, `RatingValues`.
From `modules/rating/contract.js`: `Rating`. From `modules/change-log/contract.js`:
`ChangeLogEntry`, `RecordChangeEntry`, `ChangedItem`, `FieldChange`, `ItemAction`.
From `modules/review-schedule/contract.js`: `ReviewSchedule`, `ReviewState`, `ScheduleFields`,
`SCHEDULABLE_KINDS`. From `modules/reference-register/contract.js`: `ReferenceEntry`,
`EntryFields`, `EntryFileState`, `LINKABLE_KINDS`; and through it, from
`modules/store/contract.js`, `IncomingFile` and `StoredFileLocation`, which this module passes
and shows and never builds or parses (C-009).
From `modules/workflows/contract.js`: `WorkflowRecord`, `WorkflowProgress`, `StepDemand`,
`StartFields`, `StepSubmission`, `CompletionFields`; and through them `WorkflowKind`,
`WorkflowStep`, and `WorkflowEntry`, which this module shows and never constructs, orders, or
interprets (C-009, C-038).
From `modules/bowtie/contract.js`: `Bowtie` and `BowtieSvgText`, which this module shows, passes to
`store.writeExportFile`, and never constructs, edits, parses, or draws a second way (C-009, C-039).
From `baseline/types.js` at 10.0: `ReportId`, `ReportTemplateId`. From
`modules/reports/contract.js`: `Report`, `ReportTemplate`, `TemplateFields`, `OutOfDateRecord`,
`ReportIncludes`, and the two document texts `ReportHtmlText` and `ReportMarkdownText`, which this
module shows or passes to `store.writeExportFile` and never constructs, edits, or draws a second
way (C-009, C-041 to C-043).
From `baseline/types.js` at 11.0: `RecordStatus`. From `modules/rating/contract.js` at 11.0:
`RatingBand`, which this module compares for equality in a filter and never orders (C-045).
Defined in `contract.js`:

- `App`: one open of Pivot, from the page's load to its close. `screen` is the `Screen` it
  shows now. Opaque beyond `screen`.
- `TopBar`: `{ folderName: string | null, profileName: string | null }`, drawn on every
  screen. `folderName` is the chosen folder's name once one is open; `profileName` is the
  active profile's name once one is selected.
- `PlatformRow`: a `PlatformHazardRow` — `{ hazard, reportId, controls, residual }` —
  plus `residualRating: Rating`, the band `rating.ratingFor` gave for that row's `residual`
  (C-021). Nothing of the row is otherwise changed, reordered, or dropped, so each of its
  `controls` carries the `state`, the `confirmation`, and the `justification` `registry` gave
  it (C-024).
- `Reviews`: `{ schedules: readonly ReviewSchedule[], overdue: readonly ReviewState[] }` — one
  body's review standing, and the only thing any screen of this module says about when a record
  is next reviewed. `schedules` is exactly what `review-schedule.listSchedules` gave for the
  body the screen is built from, in its order, and `overdue` exactly what
  `review-schedule.listOverdue` gave for that same body, in its order, neither filtered,
  reordered, nor added to (C-031). A screen's `reviews` is `null` when a schedule in that body
  could not be read, which is not the same as empty and is never drawn as a record having no
  schedule (section 4; `review-schedule` C-004).
- A record's schedule: for a record of a kind in `SCHEDULABLE_KINDS` on a screen whose `reviews`
  is not null, the entry of `reviews.schedules` whose `ref` is that record's kind and id, and
  null when no entry of it has one, which means no tempo has been set for that record. Its
  `tempoMonths`, `nextDueAest`, and `lastReviewedAest` are that entry's, unchanged (C-031).
- A record's overdue flag: for the same record, true when an entry of `reviews.overdue` has that
  `ref` and false when none has, which is `review-schedule` C-010's arrangement and the whole of
  what this module means by overdue; unknown, and never false, when `reviews` is null (C-031).
- `Files`: `readonly EntryFileState[]` — one register's file standing, and the only thing any
  screen of this module says about whether a reference entry's stored file is still there. It is
  exactly what `reference-register.checkEntryFiles` gave for the body the screen is built from
  and the folder that screen's app has open, in its order, one per live entry, neither filtered,
  reordered, nor added to (C-035). A screen's `files` is `null` when the data folder could not be
  read, which is not the same as empty and is never drawn as an entry's file being present
  (section 4; store C-019).
- An entry's file standing: for a reference entry on a screen whose `files` is not null, the
  entry of `files` whose `entryId` is that entry's id. Its `flagged` and its `reason` are that
  entry's, unchanged, and `flagged` is the whole of what this module means by an entry whose file
  cannot be found; unknown, and never false, when `files` is null (C-035). An entry whose
  `fileLocation` is null carries `flagged: false` and `reason: null`, which says the entry has no
  file, not that a file is there (`reference-register` C-010).
- `LinkedRecord`: `{ ref: RecordRef, name: string | null }` — one record a reference entry is
  linked to. `ref` is the ref the entry holds, unchanged and never resolved to anything else;
  `name` is the `title` of the live hazard or control, or the `name` of the live platform, that
  the entry screen's own `registry` lists give with that id, and null in every other case — a ref
  of a kind those three lists do not carry, and a ref of one of those kinds naming a record no
  longer live. A null `name` is a record this module cannot name, never a record it drops
  (C-034).
- `WorkflowRow`: `{ workflow: WorkflowRecord, subjectName: string | null }` — one workflow in the
  register of workflows. `workflow` is the record `workflows.listWorkflows` gave, every field
  unchanged and none resolved to anything else; `subjectName` is the `title` of the live hazard or
  the `name` of the live platform that the workflows screen's own `registry` lists give with
  `workflow.subject`'s id, and null in every other case — a subject that is null because the
  record the workflow is about does not exist yet (`workflows` C-001), and a subject naming a
  record no longer live. A null `subjectName` is a workflow this module cannot name, never a
  workflow it drops, by the same rule as a `LinkedRecord`'s null name (C-034, C-036).
- A workflow's progress: `progress` on the workflow screen is exactly what `workflows.progressOf`
  gave for that workflow — the record, the steps of its kind, the steps done, the step current,
  and the steps remaining — in that call's order, neither filtered, reordered, joined, renamed,
  nor added to. This module holds no step list of any workflow kind, counts no step, and computes
  no `done` or `remaining` of its own: which step follows which is `workflows` C-002's and is read
  here and nowhere else (C-009, C-037).
- A step's demand: `demand` on the workflow screen is exactly what `workflows.stepDemand` gave,
  its `outstanding` in that call's order. It is null exactly when the workflow is complete or
  abandoned, which is a workflow that asks nothing more and for which that operation is not
  called; it is never null because a demand could not be read, which is an error condition that
  carries the screen section 4 names. This module decides nothing about whether a step is
  satisfied and derives no outstanding record of its own (C-037, C-038).
- `Screen`: one of
  - `FolderScreen`: `{ kind: 'folder', topBar, messages }`
  - `CheckScreen`: `{ kind: 'check', topBar, messages }`, the files that failed their
    check, shown before anything from the folder (C-010)
  - `ProfileScreen`: `{ kind: 'profile', topBar, messages, profiles: readonly UserProfile[] }`
  - `RecoverScreen`: `{ kind: 'recover', topBar, messages, mirroredAtAest: TimestampAest,
    basedOn: SaveStamp | null, hazards: readonly Hazard[], reviews: Reviews | null }`, the
    unsaved working state the browser holds, with that state's review standing and not the
    loaded body's (C-013, C-031)
  - `HazardsScreen`: `{ kind: 'hazards', topBar, messages, hazards: readonly Hazard[],
    unsaved: boolean, lastSave: SaveStamp | null, reviews: Reviews | null }`
  - `RestoreScreen`: `{ kind: 'restore', topBar, messages, backups: readonly BackupEntry[] }`
  - `ConfirmRestoreScreen`: `{ kind: 'confirm-restore', topBar, messages, restoring:
    string, stampInFile: SaveStamp, replaces: SaveStamp | null, replacesSavedBy: string |
    null, hazards: readonly Hazard[], reviews: Reviews | null }`, the warning before a
    restore, with the restored file's review standing (C-014, C-031)
  - `HazardScreen`: `{ kind: 'hazard', topBar, messages, hazard: Hazard, causalFactors:
    readonly CausalFactor[], consequences: readonly Consequence[], controls: readonly
    HazardControl[], linkableControls: readonly Control[], platforms: readonly
    HazardOnPlatform[], reports: readonly Report[], reviews: Reviews | null }`, one
    hazard as stored, on no platform, with the platforms it is linked to and the reports that
    include it (C-016, C-017, C-044)
  - `ControlsScreen`: `{ kind: 'controls', topBar, messages, controls: readonly Control[],
    reviews: Reviews | null }`, the control library (C-017)
  - `PlatformsScreen`: `{ kind: 'platforms', topBar, messages, platforms: readonly
    Platform[], profiles: readonly UserProfile[], reviews: Reviews | null }`, the platforms
    and the profiles one may be owned by (C-018)
  - `PlatformScreen`: `{ kind: 'platform', topBar, messages, platform: Platform, rows:
    readonly PlatformRow[], omitted: readonly OmittedHazard[], linkableHazards: readonly
    Hazard[], reviews: Reviews | null }`, one platform's hazards from the one query (C-020)
  - `AssessmentScreen`: `{ kind: 'assessment', topBar, messages, platform: Platform,
    hazard: Hazard, reportId: PlatformReportId, controls: readonly PlatformControl[],
    profiles: readonly UserProfile[], initial: RatingValues, initialRating: Rating,
    residual: RatingValues, residualRating: Rating, reviews: Reviews | null }`, one hazard
    on one platform (C-021 to
    C-025). Each entry of `controls` carries the `state`, the `confirmation`, and the
    `justification` `registry` gave it (C-024); `profiles` is every stored profile, how a
    confirmation's `byProfileId` is drawn as a name
  - `HistoryScreen`: `{ kind: 'history', topBar, messages, entries: readonly
    ChangeLogEntry[], profiles: readonly UserProfile[] }`, every act ever recorded in the
    working body, of both entry kinds, as `change-log.listEntries` gave them, with `profiles`
    the names an entry's `createdBy` is drawn with (C-028)
  - `AcknowledgeScreen`: `{ kind: 'acknowledge', topBar, messages, queues: readonly
    PlatformQueue[], profiles: readonly UserProfile[], reviews: Reviews | null }`, what each
    platform the active profile owns has yet to acknowledge (C-029)
  - `ConfirmEditScreen`: `{ kind: 'confirm-edit', topBar, messages, editing: PendingEdit,
    affected: readonly AffectedPlatform[], reviews: Reviews | null }`, the edit the user has
    not yet proceeded past and every platform it changes, always two or more of them (C-027)
  - `ReferencesScreen`: `{ kind: 'references', topBar, messages, entries: readonly
    ReferenceEntry[], files: Files | null, reviews: Reviews | null }`, the reference register:
    every live entry as `reference-register.listEntries` gave it, with the file standing every
    row is flagged from (C-033, C-035)
  - `ReferenceScreen`: `{ kind: 'reference', topBar, messages, entry: ReferenceEntry, links:
    readonly LinkedRecord[], linkableHazards: readonly Hazard[], linkableControls: readonly
    Control[], linkablePlatforms: readonly Platform[], files: Files | null, reviews: Reviews |
    null }`, one entry as stored and everything it is linked to, with the three lists a further
    link is chosen from (C-034, C-035)
  - `WorkflowsScreen`: `{ kind: 'workflows', topBar, messages, workflows: readonly
    WorkflowRow[], platforms: readonly Platform[], profiles: readonly UserProfile[], reviews:
    Reviews | null }`, the register of workflows: every live workflow as
    `workflows.listWorkflows` gave it with the name of the record it is on, and the platforms one
    may be started on (C-036)
  - `WorkflowScreen`: `{ kind: 'workflow', topBar, messages, progress: WorkflowProgress, demand:
    StepDemand | null, subjectName: string | null, platform: Platform | null, rows: readonly
    PlatformRow[] | null, omitted: readonly OmittedHazard[] | null, hazard: Hazard | null,
    causalFactors: readonly CausalFactor[] | null, consequences: readonly Consequence[] | null,
    controls: readonly HazardControl[] | null, linkableHazards: readonly Hazard[],
    linkableControls: readonly Control[], profiles: readonly UserProfile[], reviews: Reviews |
    null }`, one workflow's steps and what the step it is at still asks, with the record it is
    performed on shown as that record's own screen shows it (C-037). The platform group and the
    hazard group are each null for a workflow whose subject is not a live record of that kind,
    which says the workflow is not performed on one and never that the record is empty;
    `subjectName` is `WorkflowRow`'s rule over whichever group is not null
  - `BowtieScreen`: `{ kind: 'bowtie', topBar, messages, bowtie: Bowtie, svg: BowtieSvgText,
    reviews: Reviews | null }`, one hazard on one platform as its bow-tie: `bowtie` exactly what
    `bowtie.bowtieFor` gave for the working body, the hazard, and the platform the assessment
    screen held, and `svg` exactly what `bowtie.renderBowtieSvg` gave for that `bowtie`, both from
    the calls made to build this screen (C-039, C-040). Neither is null: a bow-tie that could not
    be read is no bow-tie screen at all (section 4)
  - `ReportsScreen`: `{ kind: 'reports', topBar, messages, templates: readonly ReportTemplate[],
    reports: readonly Report[], platforms: readonly Platform[], reviews: Reviews | null }`, every
    live template and report as `reports` gave them and the platforms a report may be produced on
    (C-041)
  - `PrepareReportScreen`: `{ kind: 'prepare-report', topBar, messages, template: ReportTemplate,
    platform: Platform, rows: readonly PlatformRow[], omitted: readonly OmittedHazard[], outOfDate:
    readonly OutOfDateRecord[], reviews: Reviews | null }`, a report not yet produced: the template
    and platform picked, that platform's hazards from the one query, and exactly what
    `reports.outOfDateFor` gave for it (C-042)
  - `ReportScreen`: `{ kind: 'report', topBar, messages, report: Report, includes: ReportIncludes
    }`, one report as `reports.getReport` gave it and what `reports.includesOf` reads from it
    (C-043). It carries no `reviews` (C-031)
  - `FilterScreen`: `{ kind: 'filter', topBar, messages, filter: ItemFilter, hazards: readonly
    HazardItem[], controls: readonly ControlItem[], platforms: readonly Platform[], entries:
    readonly ReferenceEntry[], files: Files | null, reviews: Reviews | null }`, every hazard and
    control whatever its status, each against the platforms whose one query shows it, less what
    fails an active filter, with the platforms and the reference entries a filter is chosen from
    (C-045)
  - `DashboardScreen`: `{ kind: 'dashboard', topBar, messages, platforms: readonly
    PlatformItems[], profiles: readonly UserProfile[], reviews: Reviews | null }`, the open items
    of each live platform the active profile owns and of no other (C-046)
  - `OpenItemsScreen`: `{ kind: 'open-items', topBar, messages, platforms: readonly
    PlatformItems[], unplaced: UnplacedItems, unlinked: readonly UnlinkedRecord[] | null,
    profiles: readonly UserProfile[], files: Files | null, reviews: Reviews | null }`, every open
    item whatever its owner: each live platform's, those on no live platform, and every record
    linked to nothing (C-047, C-048)
- `HazardOnPlatform`: `{ platform: Platform, controls: readonly PlatformControl[] | null, omitted:
  OmittedHazard | null }` — one platform a hazard is linked to, on that hazard's own screen.
  `platform` is what that platform's one `registry.listPlatformHazards` gave; `controls` is the
  `controls` of that result's row for the hazard, unchanged and in its order, and `omitted` is null;
  or, when that result names the hazard in `omitted` instead, `controls` is null and `omitted` is that
  entry. Exactly one of the two is null, which says the hazard is on that platform and either has its
  controls there or could not be read there, never that it has no controls (C-044).
- `ReportFormat`: `'html' | 'markdown'`, the two output forms of SL-09's G3 decision, drawn by
  `reports.renderReportHtml` and `reports.renderReportMarkdown` (C-043).
- `BeginReportFields`: `{ templateId: ReportTemplateId, platformId: PlatformId }`, a template and a
  platform of the reports screen's own lists (C-042).
- `ItemFilter`: `{ platformId: PlatformId | null, band: RatingBand | null, recordStatus:
  RecordStatus | null, controlState: ControlPlatformState | null, referenceEntryId:
  ReferenceEntryId | null }` — the five filters of SL-11 criterion 1, each null when it is not
  active. `openFilter` shows the screen with every one null (C-045).
- `HazardItem`: `{ hazard: Hazard, platform: Platform | null, omitted: OmittedHazard | null,
  residualRating: Rating | null }` — one hazard listed against one platform, or against none.
  With `platform` not null it is a row of that platform's one `registry.listPlatformHazards`, and
  then `residualRating` is the band `rating.ratingFor` gave for that row's `residual` and
  `omitted` is null; or it is a hazard that query named as omitted, and then `omitted` is that
  entry and `residualRating` is null, which is a rating that could not be read and never an
  unrated one. With `platform` null it is a hazard no platform's query shows, in a row or as
  omitted, and both other fields are null (C-045).
- `ControlItem`: `{ control: Control, hazard: Hazard | null, platform: Platform | null,
  platformControl: PlatformControl | null, residualRating: Rating | null }` — one control listed
  against one hazard row of one platform, or against none. With `platform` not null,
  `platformControl` is that control's entry of that row's `controls`, unchanged, `control` is its
  `control`, `hazard` is the row's hazard, and `residualRating` is that row's `HazardItem`'s,
  which is the control's residual band as SL-11 criterion 1 rules it. With `platform` null it is
  a control on no row of any platform's query, and every field but `control` is null (C-045).
- `UnconfirmedControl`: `{ hazard: Hazard, control: PlatformControl }` — one of a row's controls
  whose `state` is `awaiting`, beside the row's hazard, the `PlatformControl` unchanged (C-024,
  C-046).
- `PlatformItems`: `{ platform: Platform, overdue: readonly ReviewState[] | null, unconfirmed:
  readonly UnconfirmedControl[], omitted: readonly OmittedHazard[], workflows: readonly
  WorkflowRecord[], awaiting: readonly RecordChangeEntry[] }` — the open items of one live
  platform. `overdue` is the entries of `reviews.overdue`, in its order, whose `ref` is in that
  platform's review set (C-046), and null when `reviews` is null or the reference entries could
  not be read; `unconfirmed` and `omitted` are from that platform's one query; `workflows` the
  in-progress workflows whose `subject` is that platform; `awaiting` exactly what
  `change-log.listAwaiting` gave for it (C-046).
- A platform's review set: the refs `{ kind: 'platform', id }` of that platform;
  `{ kind: 'hazard', id }` of each hazard of its query's `rows` and `omitted`;
  `{ kind: 'control', id }` of each control of its rows' `controls`; and
  `{ kind: 'reference-entry', id }` of each live reference entry any of whose `links` is one of
  those refs (SL-11 criterion 2; C-046).
- `UnplacedItems`: `{ overdue: readonly ReviewState[] | null, workflows: readonly WorkflowRow[]
  }` — the open items on the open-items screen that belong to no live platform: the entries of
  `reviews.overdue`, in its order, whose `ref` is in no live platform's review set, null when any
  platform's `overdue` is; and the in-progress workflows whose `subject` is not a live platform,
  each a `WorkflowRow` by that section's rule (C-047).
- `UnlinkedRecord`: `{ ref: RecordRef, name: string | null }` — one live hazard, control,
  platform, or reference entry linked to nothing (C-048). `ref` is its kind and id; `name` is the
  hazard's or control's `title`, the platform's `name`, or the entry's `name`, which is null for an
  entry made without one.
- An out-of-date warning: on the prepare-report screen, when `outOfDate` is not empty, one `warning`
  message whose items are one per record of `outOfDate`, in its order, each naming the record's
  kind, its `name`, and its `lastReviewedAest`, or saying it has never been reviewed when that is
  null. The wording of each item beyond carrying those values is not promised (C-042).
- `PendingEdit`: the operation the confirm-edit screen is waiting on, carrying the values it
  was given, as the user gave them and untrimmed, and the records the screen it was called on
  holds. One of `{ operation: 'renameHazard', hazard: Hazard, title: string }`,
  `{ operation: 'addCausalFactor', hazard: Hazard, text: string }`,
  `{ operation: 'addConsequence', hazard: Hazard, text: string }`,
  `{ operation: 'linkControlToHazard', hazard: Hazard, control: Control | null, controlId:
  ControlId, controlKind: ControlKind }`, `{ operation: 'retireControl', control: Control |
  null, controlId: ControlId }`, `{ operation: 'setReviewTempo', fields: ScheduleFields }`,
  `{ operation: 'linkReference', entry: ReferenceEntry, ref: RecordRef }`,
  `{ operation: 'submitStep', workflow: WorkflowRecord, submission: StepSubmission }`,
  `{ operation: 'advanceStep', workflow: WorkflowRecord }`,
  `{ operation: 'completeWorkflow', workflow: WorkflowRecord, fields: CompletionFields }`, or
  `{ operation: 'abandonWorkflow', workflow: WorkflowRecord }`.
  `control` is the entry of the screen's own list with that
  `controlId` (C-016's `linkableControls`, C-017's `controls`) and null when no entry of it
  has one, which `confirmEdit` then carries `registry`'s refusal for (section 4). The
  `setReviewTempo` variant carries no record: `fields.ref` names it, and C-032 has already
  refused a ref the screen it was called on does not offer a tempo for, so the ref on this
  screen is always one of that screen's own (DEC-021). The `linkReference` variant carries
  `entry`, the reference entry the entry screen holds, as `renameHazard`'s variant carries the
  hazard; its `ref` is one of that screen's own linkable lists, C-034 having refused any other
  before the gate (DEC-024). The four workflow variants each carry `workflow`, the
  `WorkflowRecord` the workflow screen holds, and the values the operation was given untrimmed;
  none of them carries a step list or a demand, because `confirmEdit` makes the same one call to
  `workflows` the gated operation would have made and that contract refuses a submission for the
  wrong step, a step whose demand is unmet, and a complete workflow itself (C-038; `workflows`
  C-004, C-008, C-011). `startWorkflow` has no variant: a subject that is a platform reaches
  exactly the one platform it names and one that is null reaches none, so it cannot gate, as
  `createReference` cannot (C-027, DEC-027).
- `PlatformQueue`: `{ platform: Platform, entries: readonly RecordChangeEntry[] }` — one
  platform the active profile owns and exactly what `change-log.listAwaiting` gave for it, in
  its order; `entries` empty when it awaits nothing (C-029).
- `AffectedPlatform`: `{ id: PlatformId, name: string }` — one platform a change reaches,
  `id` as `registry.platformsAffected` gave it and `name` its platform name below (C-027).
- `messages`: `readonly UserMessage[]`, what the last operation had to tell the user, in
  the baseline's one message shape; empty when it had nothing to say.
- A change's name: for a `RecordRef` from `store.unsavedChanges`, the string `` `${id} ${title}` ``
  when the working body lists a live hazard with that id, and `id` alone otherwise (C-011).
- An affected-data name: for a `FileCheckFailure`, `stored data` when `affects` is
  `stored-data`, `profiles` for `profiles`, `` `backup taken ${takenAtAest}` `` for a
  `backup`, and `superseded save` for `superseded-save` (C-010).
- A platform's name: for a `PlatformId`, the `name` of the platform `registry.listPlatforms`
  gives with that id, and the id itself when none has it, which is a platform retired since
  (registry C-025). It names an `AffectedPlatform` (C-027) and the platforms a refused
  retirement carries (C-030), the way a saver and a confirmer are named from `profiles`
  (C-007, C-014, C-024).

A `Screen` is plain data and read-only: every field is a string, a boolean, null, or a
value another contract made (a `UserProfile`, a `Hazard`, a `Control`, a `Platform`, a
`CausalFactor`, a `Consequence`, a `RatingValues`, a `Rating`, a `SaveStamp`, a
`BackupEntry`, a `ChangeLogEntry`, a `ReviewSchedule`, a `ReviewState`, a `ReferenceEntry`, an
`EntryFileState`, a `WorkflowRecord`, a `WorkflowProgress`, a `StepDemand`, a `Bowtie`, a
`BowtieSvgText`, a `ReportTemplate`, a `Report`, an `OutOfDateRecord`, a `ReportIncludes`, a
`PlatformControl`, an `OmittedHazard`, a `RatingBand`, a `RecordStatus`, a `UserMessage`), so it
survives JSON serialisation unchanged and a test compares screens by deep equality. A carried
file never reaches a `Screen`: an `IncomingFile` goes in through `createReference` and what comes
back on the entry is the `StoredFileLocation` alone (C-033; `reference-register` C-003). An `ExportFileHandle`
never reaches a `Screen` either: it goes in through `exportBowtie` or `exportReport` and nothing
about it is kept (C-040, C-043). Nor does a report's document: the text `reports` renders for a
download is written and not kept, and the report screen carries the `Report` it was drawn from
(C-043).

## 4. Error conditions
Two ways. A `WrongScreenError` is a rejected promise: the app is unchanged and no module
operation was called. Every other failure is one a module this module calls signalled; it
is turned into a message and the operation resolves with the screen carrying it. "App
unchanged" means `app.screen` is deep-equal to what it was before the call; "body kept"
means the working body is the one held before the call, still this user's to save. "The
key" is `schema.BROWSER_STORAGE_KEY`, which a `store` error names. "The screen as before"
means the screen the operation was called on, re-read as its clause says, with only
`messages` different. The severity and the items of each message are promised; the wording
of its headline and next step is not.

| Operation | Condition | Signalled as | Caller obligation |
|---|---|---|---|
| any but start | the operation is not one of the current screen's kind (table in C-002) | `WrongScreenError` naming the operation and the screen kind; app unchanged | Draw only the operations the screen kind offers; never reached from the drawn page |
| chooseFolder | the user cancels the picker | folder screen, one `info` message; nothing opened | Offer to choose again |
| chooseFolder | the browser denies access to the folder | folder screen, one `error` message; nothing opened | Offer to choose again; a denial on a target machine is DEC-003's reversal trigger |
| chooseFolder, openFolder | `store` rejects the open, the check, the load, or the profile list with `StoreReadError` | folder screen, `topBar.folderName` null, one `error` message whose items name the file; nothing from the folder is shown or kept | Choose the folder again; nothing from it is stored data |
| chooseFolder, openFolder | `store.checkFolder` lists a failure whose `affects` is `stored-data` or `profiles` | folder screen, `topBar.folderName` null, one `error` message per failure listed (C-010); nothing loaded, shown, or kept | Choose the folder again; restoring such a folder is not promised (FND-039) |
| createProfile | `InvalidProfileNameError` from `profiles` | profile screen, one `warning` message; list re-read; nothing written | Ask for a name |
| createProfile | `DuplicateProfileNameError` from `profiles` | profile screen, one `warning` message whose items name the existing profile; list re-read; nothing written | Offer the existing profile from the list, or ask for a different name |
| createProfile | `StoreWriteError` passed through `profiles` | profile screen, one `error` message whose items name the profile name given; list re-read | Tell the user the profile was not saved |
| selectProfile | `UnknownProfileError` from `profiles` | profile screen, one `warning` message; list re-read; `topBar.profileName` still null | List again and ask again |
| createProfile, selectProfile | `StoreReadError` passed through `profiles` when the list is re-read | folder screen, `topBar.folderName` null, one `error` message whose items name the file; nothing from the folder kept | As `openFolder`: choose again |
| openPlatforms, openAssessment, openHistory, openAcknowledgements, `back` to any of them, and every changing operation of those screens | `StoreReadError` passed through `profiles.listProfiles` when the names are read (C-018, C-024, C-028, C-029) | the screen the operation would have shown, with `profiles` empty and one `warning` message whose items name the file; every other field as its clause says; the change, if any, is made and told to `store` as its clause says; the working body is kept | Draw a stored `ownerProfileId`, a confirmation's `byProfileId`, and an entry's `createdBy` as the id (C-024, C-028); tell the user the profile names could not be read; the folder's data is untouched |
| selectProfile | `store.readRecoverable` rejects with `StoreReadError` | hazards screen as with no recoverable state (C-004), one `warning` message whose items name the key; no recovery offered; nothing written | Tell the user the working state in the browser could not be recovered |
| selectProfile | `MalformedHazardError` from `registry` listing the recoverable state's body | recover screen with `hazards` empty and one `error` message whose items name the record's key | Name the record; the user may still accept or decline |
| acceptRecovery | `store.recoverWorkingState` rejects with `StoreReadError` | hazards screen of the loaded body, `unsaved` false, one `error` message whose items name the key; nothing written | Tell the user the working state could not be recovered |
| declineRecovery | `store.discardWorkingState` rejects with `StoreWriteError` | hazards screen of the loaded body, `unsaved` false, one `warning` message whose items name the key | Tell the user recovery will be offered again |
| selectProfile, acceptRecovery, addHazard, confirmRestore | `MalformedHazardError` from `registry` listing the working body | hazards screen with `hazards` empty and one `error` message whose items name the record's key; body kept | Name the record to the user; show nothing from the collection as hazards |
| addHazard, renameHazard | `InvalidHazardTitleError` from `registry` | the screen as before, one `warning` message; nothing on it but `messages` changed; `noteChange` not called | Ask for a title |
| addHazard | `HazardSequenceError` from `registry` | hazards screen, one `error` message whose items name the id; `hazards`, `unsaved`, body unchanged; `noteChange` not called | Do not adjust the sequence to get past this |
| addCausalFactor | `InvalidCausalFactorTextError` from `registry` | hazard screen as before, one `warning` message; `noteChange` not called | Ask for the causal factor |
| addConsequence | `InvalidConsequenceTextError` from `registry` | hazard screen as before, one `warning` message; `noteChange` not called | Ask for the consequence |
| createControl | `InvalidControlTitleError` from `registry` | controls screen as before, one `warning` message; `noteChange` not called | Ask for a control |
| createPlatform | `InvalidPlatformNameError` from `registry` | platforms screen as before, one `warning` message; `noteChange` not called | Ask for a platform name |
| createPlatform, setPlatformOwner | `InvalidOwnerError` from `registry` | platforms screen as before, one `warning` message; `noteChange` not called | Ask which of the listed profiles owns the platform (REQ-065) |
| retireHazard | `HazardOnPlatformsError` from `registry` | hazard screen as before, one `warning` message whose items are the platform names (section 3) of every platform the error carries, in its order; nothing on the screen but `messages` changed; `noteChange` not called | Name the platforms and say the hazard cannot be retired while it is linked to them (REQ-076; SL-05 criterion 6) |
| retireControl, retirePlatform, setPlatformOwner | `UnknownControlError`, `UnknownPlatformError`, `ControlNotLiveError`, or `PlatformNotLiveError` from `registry` | the screen as before, one `warning` message whose items name the id; `noteChange` not called | List again and ask again; a retired control or platform is no longer on these lists (C-030) |
| renameHazard, setReportId, enterRating, setPlatformOwner, setReviewTempo, confirmEdit | `NoChangeError` from `registry` or from `review-schedule` | the screen as before, one `info` message whose items name the field the error carries; nothing on it but `messages` changed; nothing stored; `noteChange` not called | Say nothing changed; the value given is the value stored (registry C-029, `review-schedule` C-013) |
| every operation that builds a screen carrying `reviews` | `MalformedScheduleError` from `review-schedule.listSchedules` or `listOverdue` | the screen the operation would have shown, with `reviews` null and one `error` message whose items name the entry's key; every other field as its clause says; the change, if any, is made and told to `store` as its clause says; the working body is kept | Show no tempo, no due date and no overdue flag for any record on the screen, and never show one as not overdue: `reviews` null is a standing that could not be read, not an absence of schedules (`review-schedule` C-004; HZ-012) |
| setReviewTempo | `InvalidTempoError` from `review-schedule` | the screen as before, one `warning` message whose items name what was given; nothing on it but `messages` changed; nothing stored; `noteChange` not called | Ask for a whole number of calendar months, at least one (REQ-020, REQ-022) |
| setReviewTempo | `InvalidDueDateError` from `review-schedule` | the screen as before, one `warning` message whose items name what was given; nothing stored; `noteChange` not called | Ask when the review next falls due, as a calendar date in AEST (REQ-021) |
| setReviewTempo | `fields.ref` is not a record this screen offers a tempo for (C-032) | the screen as before, one `warning` message whose items name the ref's kind and id; `registry.platformsAffected` and `review-schedule.setSchedule` not called and nothing written | Offer a tempo only for the hazard the hazard screen holds, a control of the controls screen's list, or a platform of the platforms screen's list; never reached from the drawn page |
| setReviewTempo, confirmEdit | `ScheduleNotLiveError` from `review-schedule` | cannot arise: nothing at `review-schedule` 1.0 sets a schedule's status, so no body this version wrote holds one that is not live. If it does, the screen as before and one `warning` message whose items name the ref's kind and id; `noteChange` not called | Say the record's review schedule is deleted or retired; nothing at this version sets a status back |
| setReviewTempo, confirmEdit | `InvalidRefError` or `UnschedulableKindError` from `review-schedule` | cannot arise: C-032 refuses a ref that is not one of the screen's own before `review-schedule` is called, and the three kinds those screens offer are all in `SCHEDULABLE_KINDS`. If it does, as the row for any other rejection of that operation | As above |
| openReferences, openReference, createReference, linkReference, `back` to the register | `MalformedEntryError` from `reference-register` reading `collections['reference-entry']` | the screen the operation would have shown, with `entries` or `links` empty, `files` null, and one `error` message whose items name the entry's key; nothing changed, nothing written, `noteChange` not called; body kept | Name the record to the user; show nothing from the register, and no entry's file as present |
| every operation that builds a screen carrying `files` | `StoreReadError` from `reference-register.checkEntryFiles` when the data folder cannot be read | the screen the operation would have shown, with `files` null and one `error` message whose items name the folder; every other field as its clause says; the change, if any, is made and told to `store` as its clause says; the working body is kept | Show no file standing for any entry on the screen, and never show one as not flagged: `files` null is a standing that could not be read, not an absence of missing files (store C-019; REQ-078) |
| createReference | `InvalidFieldError` from `reference-register` | references screen as before, one `warning` message whose items name the field the error carries; nothing on it but `messages` changed; nothing stored; no file kept; `noteChange` not called | Ask for that field or leave it out; a blank is not an absence (`reference-register` C-001) |
| createReference | `EmptyEntryError` from `reference-register` | references screen as before, one `warning` message; nothing stored; no file kept; `noteChange` not called | Ask for at least one of a name, a link, a path, and a file (`reference-register` C-001; SL-10 criterion 1) |
| createReference | `StoreWriteError` at `stage: 'stored-file'`, passed through `reference-register.createEntry` from `store.putStoredFile` | references screen as before, one `error` message whose items name the file's name as given; no entry created, no location stored, no file left under `files/`; `noteChange` not called | Tell the user the file was not kept and that no entry was made; offer the file again (store C-018; `reference-register` C-004) |
| linkReference | `DuplicateLinkError` from `reference-register` | reference screen as before, one `warning` message whose items name the ref's kind and id; `noteChange` not called | Show it as already linked; the screen's linkable lists exclude what the entry already holds, so another copy of Pivot linked it since this one read the entry (C-034) |
| linkReference | `ref` is not a record this screen offers a link to (C-034) | reference screen as before, one `warning` message whose items name the ref's kind and id; `registry.platformsAffected` and `reference-register.linkEntry` not called and nothing written | Offer only a hazard of `linkableHazards`, a control of `linkableControls`, or a platform of `linkablePlatforms`; never reached from the drawn page |
| openReference, linkReference | `UnknownEntryError` or `EntryNotLiveError` from `reference-register` | references screen re-listed, one `warning` message whose items name the entry's id; `noteChange` not called | List the register again and ask again |
| createReference, linkReference | `MissingProfileError` or `InvalidActError` from `reference-register` | cannot arise: `profile` is the one `profiles.selectProfile` resolved with, `madeForPlatformId` is null on both screens, and `affectedPlatformIds` is exactly the union C-026 built (C-026, DEC-024). If it does, as the row for any other rejection of that operation | As above |
| linkReference, confirmEdit | `InvalidRefError` or `UnlinkableKindError` from `reference-register` | cannot arise: C-034 refuses a ref that is not one of the screen's own before `reference-register` is called, and the three kinds those lists carry are all in `LINKABLE_KINDS`. If it does, as the row for any other rejection of that operation | As above |
| every workflow operation | `MalformedWorkflowError` from `workflows` reading `collections['workflow-record']` | the screen the operation would have shown, with `workflows` empty for a workflows screen and, for an operation of the workflow screen, the workflows screen re-listed with it empty, and one `error` message whose items name the entry's key; nothing changed, nothing written, `noteChange` not called; body kept | Name the record to the user; show no workflow and no progress from that collection, and never a shorter list (`workflows` C-004) |
| openWorkflow and every changing workflow operation | `UnknownWorkflowError` or `WorkflowNotLiveError` from `workflows` | workflows screen re-listed, one `warning` message whose items name the workflow's id; `noteChange` not called | List the register again and ask again; an abandoned workflow is no longer on it (`workflows` C-012) |
| submitStep, advanceStep, completeWorkflow, abandonWorkflow | `WorkflowCompleteError` from `workflows` | workflow screen as before, one `warning` message whose items name the workflow's id; nothing on it but `messages` changed; nothing stored; `noteChange` not called | Say the workflow is complete and that no field of its record can be changed; offer only `back` (REQ-039; SL-07 criterion 4) |
| startWorkflow | `UnknownWorkflowKindError` or `InvalidSubjectError` from `workflows` | workflows screen as before, one `warning` message whose items name the kind and the value the error carries; nothing started; `noteChange` not called | Offer the five kinds of `WORKFLOW_KINDS`, and a platform of this screen's `platforms` for the three performed on one |
| startWorkflow | `fields.subject` is not null and is not a platform this screen lists (C-036) | workflows screen as before, one `warning` message whose items name the ref's kind and id; `registry.platformsAffected` and `workflows.startWorkflow` not called and nothing written | Offer only a platform of `platforms`, or null; never reached from the drawn page |
| submitStep | `WrongStepError` from `workflows` | workflow screen as before, one `warning` message whose items name the step expected and the step given; `noteChange` not called | Submit for the step `progress.current` gives; never reached from the drawn page (`workflows` C-004) |
| submitStep | `AlreadyRecordedError` from `workflows` | workflow screen as before, one `warning` message whose items name the step and the ref; `noteChange` not called | Show what the step has already recorded; an entry is appended once and a correction is a new workflow (`workflows` C-011) |
| submitStep | `InvalidNoteError`, `InvalidReasonError`, `HazardNotInReviewError`, or `ControlNotOnPlatformError` from `workflows` | workflow screen as before, one `warning` message whose items name what the error carries; nothing on it but `messages` changed; nothing stored; `noteChange` not called | Ask for what the step asks: what the reviewer decided, why the control is coming off, a hazard of `rows`, or a control a row carries `confirmed` |
| submitStep, confirmEdit | any rejection `workflows` passes on unchanged from `registry` (`workflows` section 4) | workflow screen as before, one message of the severity and with the items the row for that error already gives on the screen it is named on; nothing stored; `noteChange` not called | As that row; the step has not been recorded and the act was not made (`workflows` C-009) |
| advanceStep | `StepIncompleteError` from `workflows` | workflow screen as before, one `warning` message whose items are the step and the kind and id of each ref the error carries, in its order; nothing stored; `noteChange` not called | Show what is outstanding; at `settle-the-ratings` this is REQ-077's refusal and at `review-the-hazards` criterion 3's, and neither is passed by saying nothing (`workflows` C-008) |
| advanceStep | `LastStepError` from `workflows` | workflow screen as before, one `info` message whose items name the workflow's id; `noteChange` not called | Offer `completeWorkflow` at the last step; the last step is passed by completing the workflow |
| completeWorkflow | `NotAtOutcomeError` or `InvalidOutcomeError` from `workflows` | workflow screen as before, one `warning` message whose items name the step or the value the error carries; nothing stored; `noteChange` not called | Finish the steps before it, or ask what the workflow produced (REQ-038) |
| completeWorkflow | one of the completing acts rejects — whatever `registry.excludeControlFromPlatform` or `review-schedule.completeReview` rejects with, passed on by `workflows` | workflow screen as before, one `error` message whose items name what that error carries; no act of the completion made, no last reviewed date set, no justification written, nothing stored; `noteChange` not called; body kept | Name it to the user; the workflow is still at `record-the-outcome` and may be completed again once the cause is cleared (`workflows` C-009) |
| openBowtie, exportBowtie | `HazardOmittedError` from `bowtie` | platform screen as `openPlatform` gives, with its omitted messages; no bow-tie screen; `store.writeExportFile` not called and nothing written anywhere | Show the hazard as omitted; there is no complete bow-tie to show or export until the record is fixed (`bowtie` C-002; HZ-011) |
| openBowtie, exportBowtie | any `Malformed*Error` or `UnknownPlatformError` `bowtie` passes on from `registry` | platform screen as `openPlatform` gives, with one more `error` message, last, whose items name the record's key and its kind; no bow-tie screen; `store.writeExportFile` not called and nothing written anywhere | Name the record; show no diagram and export none, never one drawn without the record (`bowtie` C-002; HZ-011) |
| openBowtie, exportBowtie | `UnknownHazardError`, `HazardNotLiveError`, or `HazardNotOnPlatformError` from `bowtie` | cannot arise: the assessment screen is reached only through a row of `listPlatformHazards`, which is a live hazard on a live link, and no operation offered on the assessment or bow-tie screen deletes, retires, or unlinks one. If it does, platform screen as `openPlatform` gives, with one more `warning` message, last, whose items name the hazard's id and the platform's name (section 3); `store.writeExportFile` not called | List again and ask again |
| openBowtie, exportBowtie | `InvalidBowtieError` from `bowtie` | cannot arise: this module passes `renderBowtieSvg` only what `bowtieFor` resolved with, which it accepts (`bowtie` C-011). If it does, as the row for a `Malformed*Error`, with the items naming the field the error carries | As that row |
| exportBowtie, chooseExportTarget | `StoreWriteError` at `stage: 'export'` from `store.writeExportFile` | bow-tie screen rebuilt from the same working body, so `bowtie` and `svg` deep-equal to what they were, with one `error` message whose items name the target's name as the error carries it; the target holds what it held before (store C-020); nothing else written anywhere | Tell the user the export did not happen; offer to export again |
| chooseExportTarget | the user cancels the picker | bow-tie screen as before, one `info` message; nothing written; `bowtie` not called again | Offer to choose again; a cancelled export is not a failure (store section 4) |
| chooseExportTarget | the browser denies the picker | bow-tie screen as before, one `error` message; nothing written | Offer to choose again |
| openReports, openHazard, openReport, `back` to the reports or hazard screen, and every operation of the reports, prepare-report, report, and hazard screens | `MalformedTemplateError` or `MalformedReportError` from `reports` | the screen the operation would have shown — the reports screen for an operation of the reports, prepare-report, or report screen — with `templates` and `reports` empty, or the hazard screen's `reports` empty, and one `error` message whose items name the entry's key; no template saved, no report produced, nothing written, `noteChange` not called; body kept | Name the record to the user; show no template and no report from that collection, and never a shorter list (`reports` C-012) |
| createTemplate | `InvalidTemplateNameError`, `InvalidTemplateTitleError`, or `InvalidSectionError` from `reports` | reports screen as before, one `warning` message whose items name what the error carries; nothing on it but `messages` changed; nothing stored; `noteChange` not called | Ask for the name, the title, or the section; a template has exactly one place for the hazards (`reports` C-001) |
| beginReport | `fields.templateId` is not a template of this screen's `templates`, or `fields.platformId` is not a platform of its `platforms` (C-042) | reports screen as before, one `warning` message whose items are the two ids; `reports` and `registry` not called and nothing written | Offer only the listed templates and platforms; never reached from the drawn page |
| beginReport, produceReport | `MalformedScheduleError` from `reports.outOfDateFor` or `reports.produceReport`, or any `Malformed*Error` from `registry` reading the platform's hazards, directly or through `reports` | reports screen rebuilt, one `error` message whose items name the record's key and its kind, and `reviews` null for a schedule; no prepare-report screen and no report; `noteChange` not called; body kept. This row, not the general one for a `registry` read, is what these two operations resolve with | Name the record; offer no report while what it would hold, or what is past due in it, cannot be read — never a report prepared as though nothing were past due (HZ-009) |
| beginReport, produceReport | `reports.getTemplate` resolves with null, or `UnknownTemplateError` or `TemplateNotLiveError` from `reports`, or `registry`'s `UnknownPlatformError` or `PlatformNotLiveError` | cannot arise: C-042 refuses a template or platform outside the reports screen's live lists before `reports` is called, and nothing on the prepare-report screen retires a platform or a template. If it does, reports screen rebuilt, one `warning` message whose items name the id; `noteChange` not called | List again and ask again |
| produceReport | a `bowtieHazardIds` entry is not the `hazard.id` of a row of this screen's `rows`, or appears twice (C-042) | prepare-report screen as before, one `warning` message whose items name the ids; `reports.produceReport` not called and nothing written | Offer a bow-tie only for a hazard of `rows`, once each; never reached from the drawn page |
| produceReport | `OutOfDateNotAcknowledgedError` from `reports` | prepare-report screen rebuilt as `beginReport` gives it for the same template and platform, so `outOfDate` is the list as it now is and `messages` carries its warning; nothing produced; `noteChange` not called | Show the user the list as it now is and let them produce again; the list changed since it was shown, and a report is never produced past a list the user has not seen (`reports` C-006; HZ-009) |
| produceReport | any rejection `reports` passes on from `bowtie` | prepare-report screen as before, one `error` message whose items name the hazard's id and what the error carries; nothing produced; `noteChange` not called | Name it; the report is not produced with a bow-tie missing that was asked for (`reports` C-005; HZ-011) |
| openReport | `reports.getReport` resolves with null, or `id` is not a report of this screen's `reports` | reports screen re-listed, one `warning` message whose items name the id; nothing written | List again and ask again |
| exportReport, chooseReportExportTarget | `format` is not `html` or `markdown` | report screen as before, one `warning` message whose items name the value; `reports`, `store.chooseExportFile`, and `store.writeExportFile` not called | Offer the two forms; never reached from the drawn page |
| exportReport, chooseReportExportTarget | `StoreWriteError` at `stage: 'export'` from `store.writeExportFile` | report screen rebuilt, one `error` message whose items name the target's name as the error carries it; the target holds what it held before (store C-020); nothing else written anywhere | Tell the user the download did not happen; offer it again |
| chooseReportExportTarget | the user cancels the picker | report screen as before, one `info` message; nothing written; `reports` not called | Offer to choose again |
| chooseReportExportTarget | the browser denies the picker | report screen as before, one `error` message; nothing written | Offer to choose again |
| exportReport, chooseReportExportTarget | `InvalidReportError` from `reports`, or `ConsequenceOutOfScaleError` or `LikelihoodOutOfScaleError` passed on from `rating` | cannot arise: the report is one `reports.getReport` gave, which is well formed (`reports` C-012). If it does, report screen as before, one `error` message whose items name the field or the hazard's id; `store.writeExportFile` not called | Show no document and write none |
| createTemplate, produceReport | `MissingProfileError` or `InvalidActError` from `reports`, or `UnincludableKindError` from `reports.reportsIncluding` on the hazard screen | cannot arise: `profile` is the one `profiles.selectProfile` resolved with, `madeForPlatformId` is null or the prepare-report screen's platform (C-026), and the hazard screen asks only about a `hazard` ref. If it does, as the row for any other rejection of that operation | As above |
| applyFilter | a value of `filter` is not null and is not one of the filter screen's `platforms` ids, one of its `entries` ids, one of `RatingBand`'s seven, one of `RecordStatus`'s three, or one of `ControlPlatformState`'s three (C-045) | filter screen as before, one `warning` message whose items name the field and the value; no module operation called and nothing written | Offer only the listed platforms and entries and the named values; never reached from the drawn page |
| openFilter, applyFilter | any `Malformed*Error` from `registry.listAllHazards`, `listAllControls`, `listAllPlatforms`, or `listPlatformHazards` of any platform | filter screen with `hazards` and `controls` empty, `platforms` empty when the platforms could not be listed, and one `error` message whose items name the record's key and its kind; nothing written | Name the record; show no hazard and no control, never a shorter list read as a filtered one |
| openFilter, applyFilter | `MalformedEntryError` from `reference-register.listEntries` | filter screen with `entries` empty and `files` null, one `error` message whose items name the entry's key; when `filter.referenceEntryId` is not null, `hazards` and `controls` empty as well; nothing written | Name the record; offer no reference-entry filter while the register cannot be read |
| openDashboard, openOpenItems | any `Malformed*Error` from `registry.listPlatforms` or from the `listPlatformHazards` of a platform the screen shows | the screen, with `platforms` empty when the platforms could not be listed, or that platform's `unconfirmed` and `omitted` empty and its `overdue` null when its query rejected, and one `error` message whose items name the record's key and its kind; nothing written | Name the record; never show a platform's items as none because they could not be read |
| openDashboard, openOpenItems | `MalformedEntryError` from `reference-register.listEntries` | the screen, with every `overdue` null — each platform's, and on the open-items screen `unplaced.overdue` — and on the open-items screen `unlinked` null and `files` null, and one `error` message whose items name the entry's key; nothing written | Show no overdue review and no unlinked record as settled while the register cannot be read (HZ-012's shape) |
| openDashboard, openOpenItems | `MalformedWorkflowError` from `workflows.listWorkflows` | the screen, with every platform's `workflows` empty, on the open-items screen `unplaced.workflows` empty and `unlinked` null, and one `error` message whose items name the entry's key; nothing written | Name the record; show no workflow, never a shorter list (`workflows` C-004) |
| openDashboard, openOpenItems | `MalformedEntryError` from `change-log.listAwaiting` | the screen, with every platform's `awaiting` empty and one `error` message whose items name the entry's key; nothing written | Name the entry; show nothing from the history, as C-029's screen does |
| openOpenItems | `MalformedLinkError` from `registry.listLinks`, or any `Malformed*Error` from `registry.listHazards`, `listControls`, or `getHazardDetail` | open-items screen with `unlinked` null and one `error` message whose items name the record's key and its kind; every other field as C-047 says; nothing written | Show no record as linked or as unlinked while a link cannot be read: `unlinked` null is a flag that could not be read, not an absence of unlinked records (C-048) |
| openDashboard, openOpenItems, openFilter, applyFilter | `StoreReadError` passed through `profiles.listProfiles`, or from `reference-register.checkEntryFiles` | as the rows above for `profiles` (profiles empty, one `warning`) and for `files` (files null, one `error`) | As those rows |
| acknowledgeChange | `UnknownEntryError`, `NotAcknowledgeableError`, `PlatformNotAwaitingError`, or `AlreadyAcknowledgedError` from `change-log` | acknowledgement screen rebuilt, one `warning` message whose items name the entry's id and the platform's name (section 3); nothing acknowledged; `noteChange` not called | Show the queue as it now is; another copy of Pivot may have acknowledged it since this one read the queue |
| acknowledgeChange | `platformId` is one the screen has no queue for, or `entryId` is not in that queue | acknowledgement screen rebuilt, one `warning` message whose items are the two ids; `change-log.acknowledge` not called and nothing written | Offer only the rows the screen shows; never reached from the drawn page (C-029) |
| every changing operation, through `registry`, `change-log`, `review-schedule`, `reference-register`, `workflows`, or `reports` | `MalformedEntryError` from `change-log` (registry section 4, `review-schedule` section 4, `reference-register` section 4, `workflows` section 4, `reports` section 4) | the screen as before, one `error` message whose items name the entry's key; nothing changed anywhere, nothing acknowledged, no schedule written, no reference entry written and no file kept, no workflow started, stepped, completed, or abandoned, no template saved and no report produced, `noteChange` not called; body kept | Name the entry to the user; nothing may be changed while the history cannot be read (registry C-023, `review-schedule` C-012, `reference-register` C-004 and C-011, `workflows` C-010, `reports` C-011; HZ-005) |
| openHistory, openAcknowledgements | `MalformedEntryError` from `change-log` | the screen the operation would have shown, with `entries` or `queues` empty and one `error` message whose items name the entry's key; nothing written | Name the entry to the user; show nothing from the history |
| confirmEdit | any rejection of the operation it was waiting on | the screen that operation was called on, rebuilt from the working body, with the messages that operation's row above gives; nothing stored; `noteChange` not called | As that row; the pending edit is discarded and the user may make it again (C-027) |
| linkControlToHazard | `InvalidControlKindError` from `registry` | hazard screen as before, one `warning` message; `noteChange` not called | Ask which side of the hazard the control sits on (REQ-044) |
| linkControlToHazard, confirmControlForPlatform, excludeControlFromPlatform | `UnknownControlError`, or `ControlNotLiveError` from `linkControlToHazard` | the screen as before, one `warning` message whose items name the control's id; `noteChange` not called | List the library again and ask again |
| linkControlToHazard, linkHazardToPlatform, confirmControlForPlatform | `DuplicateLinkError` from `registry` | the screen as before, one `warning` message whose items name the existing link's id; `noteChange` not called | Show it as already linked or already confirmed; do not offer to confirm it twice |
| excludeControlFromPlatform | `AlreadyExcludedError` from `registry` | assessment screen as before, one `warning` message whose items name the live justification's id; `noteChange` not called | Show the control as already excluded, with the reason stored; a reason is reworded by confirming and excluding again (registry's not-promised section) |
| excludeControlFromPlatform | `InvalidJustificationTextError` from `registry` | assessment screen as before, one `warning` message whose items name the control's id; nothing on it but `messages` changed; `noteChange` not called | Ask why the control is not on this platform; the control stays in the state it was in, and nothing is stored without a reason (REQ-058; SL-04 criterion 3) |
| linkHazardToPlatform, openAssessment | `UnknownHazardError` or `HazardNotLiveError` from `registry` | platform screen as before, one `warning` message whose items name the hazard's id; `noteChange` not called | List again and ask again |
| setReportId | `InvalidPlatformReportIdError` from `registry` | assessment screen as before, one `warning` message whose items name what was given; `noteChange` not called | Ask for the ID this platform's reports use, with no leading or trailing space (REQ-052) |
| enterRating | `InvalidRatingValueError` or `InvalidRatingStageError` from `registry` | assessment screen as before, one `warning` message whose items name the field and the value; nothing stored and no rating for that entry shown; `noteChange` not called | Refuse the entry and say the scales; never show a rating for a value the matrix did not rate (SL-03 criterion 6) |
| openHazard, openPlatform, openAssessment, openControls, openPlatforms, openAcknowledgements, openWorkflows, openWorkflow, back, and every changing operation | any `Malformed*Error` from `registry` reading a collection the screen needs, `registry.platformsAffected` included (C-027), and any such error `workflows` passes on from a `registry` read a step or a screen made (C-037) | the screen the operation would have shown, with every list the malformed collection feeds empty and one `error` message whose items name the record's key and its kind; body kept; `noteChange` not called | Name the record to the user; show nothing from that collection |
| openPlatform, openAssessment, back to the platform screen, openWorkflow and every operation that rebuilds a workflow screen whose subject is a platform | `registry.listPlatformHazards` names hazards in `omitted` | the screen resolves; `omitted` is exactly what it gave and the screen carries one `error` message per omitted hazard, in its order, whose items are the hazard's id and the omitting record's key | Show each omitted hazard and name the record; never drop it silently, and on a review workflow's screen this is criterion 3's "or lists it as omitted" (HZ-004; C-037) |
| openAssessment | the hazard is in `omitted` rather than in `rows` | platform screen as `openPlatform` gives, with its omitted messages; no assessment screen | Show the hazard as omitted; there is nothing to assess until the record is fixed |
| any operation that shows a band | `ConsequenceOutOfScaleError` or `LikelihoodOutOfScaleError` from `rating` | cannot arise: `registry` refuses an out-of-scale entry (registry C-018) and omits a malformed rating (registry C-019). If it does, the screen resolves with that rating's `RatingValues` shown, no band in its place, and one `error` message whose items name the hazard's id | Show no band; never substitute one (HZ-010) |
| every changing operation | `store.noteChange` resolves with `mirrorError`, `backupError`, or both, or rejects | the change is made as its clause says, with one `warning` message per error in store's order (mirror, then backup), whose items name the error's `file`; a rejection is one `warning` message whose items name `schema.BROWSER_STORAGE_KEY` and `backups` | Tell the user the working state is not being kept in the browser, or no backup was taken |
| save | `StoreWriteError` at any stage, `StoreReadError`, or any other rejection from `store.save` | hazards screen, one `error` message whose items are the names of `store.unsavedChanges` (C-011); `unsaved`, `lastSave`, `hazards`, body unchanged | Tell the user which changes are not in the folder; they can save again |
| save, confirmRestore | the outcome carries `mirrorError` | the screen C-007 gives, with one more `warning` message, last, whose items name the key | Tell the user recovery may be offered for data already saved |
| beginRestore | `store.listBackups` rejects with `StoreReadError` | hazards screen as before, one `error` message whose items name the file | Offer to try again |
| chooseSaveState | the user cancels the picker | restore screen as before, one `info` message; nothing read | Offer to choose again |
| chooseSaveState | the browser denies access to the file | restore screen as before, one `error` message; nothing read | Offer to choose again |
| chooseSaveState, prepareRestore | `store.prepareRestore` rejects with `StoreReadError` | restore screen as before, one `error` message whose items name the file; nothing written | Name the file; offer another |
| chooseSaveState, prepareRestore | `MalformedHazardError` from `registry` listing the plan's body | restore screen as before, one `error` message whose items name the record's key; nothing written | Name the record; offer another file |
| confirmRestore | `store.restore` rejects, for any reason | hazards screen deep-equal to the one `beginRestore` was called on except `messages`, which is one `error` message whose items name `restoring`; body kept | Tell the user the restore did not happen; the folder's data is as it was (store C-010) |
| renameHazard, addCausalFactor, addConsequence, linkControlToHazard, retireHazard | `UnknownHazardError` or `HazardNotLiveError` for the hazard the screen holds | cannot arise: only `openHazard` reaches this screen, it is reached only for a live hazard (C-016), no operation of this version deletes one, and the one that retires one leaves the screen (C-030). If it does, hazards screen re-listed, one `warning` message whose items name the id; `noteChange` not called | List again and ask again |
| setReportId, enterRating, confirmControlForPlatform, excludeControlFromPlatform | `HazardNotOnPlatformError`, `ControlNotOnHazardError`, or `UnknownPlatformError` from `registry` | cannot arise: the assessment screen is reached only through a row of `listPlatformHazards`, which is a live `hazard-platform` link, and its `controls` are the hazard's own. If it does, as the row for any other rejection of that operation | As above |
| save, confirmRestore, noteChange | `NoActiveProfileError` or `NotLoadedError` from `store`, or `MissingProfileError` from `registry` or `change-log` | cannot arise (C-002, C-003 by construction); if it does, as the row for any other rejection | As above |
| every changing operation | `InvalidActError`, `MissingProfileError`, or `UnknownPlatformError` from the `Act`, the `ScheduleAct`, or the `EntryAct` this module built, `workflows`' own `MissingProfileError` and `InvalidActError` included | cannot arise: `madeForPlatformId` is present on every call and is either null or the id of a platform `registry` gave the screen or the id the workflow's own subject names, `profile` is the one `profiles.selectProfile` resolved with, and `affectedPlatformIds`, where a call takes one, is exactly what `registry.platformsAffected` gave (C-026). If it does, as the row for any other rejection of that operation | As above |
| the twelve operations of C-027 | `UnownedRecordKindError` from `registry.platformsAffected` | cannot arise: the only refs this module passes are a `hazard`, a `control`, a `platform`, a `causal-factor`, and a `consequence`, all kinds `registry` owns; a `report` ref on a reference entry's links is skipped rather than passed (DEC-024); and a workflow's `subject` is a `hazard` or a `platform` and is not passed at all while it is null, so no `workflow-record` ref reaches that call (C-027, C-032, C-038; DEC-026, DEC-027). If it does, as the row for any other rejection of that operation | As above |
| every changing operation | `EmptyChangeError`, `InvalidRecordError`, `SelfLoggingError`, `MismatchedRecordError`, `UnchangedRecordError`, or `InvalidPlatformError` from `change-log` | cannot arise: this module never calls `change-log.recordChange`, and `registry` C-023 and C-029 are what hand it an act (C-009). If it does, as the row for any other rejection of that operation | As above |

A folder with no `data.json` or no `profiles.json` is not an error: it opens with no
hazards and no profiles (store C-007, C-008). A folder with no backups opens a restore
screen with `backups` empty. A body with no controls, no platforms, or no links is not an
error either: the lists those feed are empty (registry C-006, C-011, C-014, C-019). A body
with no history is not an error: `entries` is empty and so is every queue (`change-log`
C-006), and a profile that owns no platform sees no queue at all (C-029). A body in which no
tempo has been set is not an error either: `reviews` is a `Reviews` with both lists empty, which
says every record has no schedule and none is overdue, and is not the same as `reviews` null
(C-031). A body with no reference entries is not an error: `entries` is empty and so is `files`,
which says the register is empty and not that a standing could not be read, and an entry linked
to nothing shows `links` empty (`reference-register` C-005, C-010; C-033, C-034). An entry with
no file is not flagged and is not an error: its `EntryFileState` carries `flagged: false` with
`reason: null`, which is an entry that never had a file (C-035). A body with no workflow records
is not an error: `workflows` is empty, which is a register with nothing in it, and a workflow
that has recorded nothing yet shows `progress.record.entries` empty (`workflows` C-001; C-036).
A workflow whose subject is null is not an error either: its `subjectName`, and both of the
screen's subject groups, are null, which says the record the workflow is about does not exist yet
and is set at the step that creates it (`workflows` C-013; C-037).
A hazard with no causal factors, no consequences, or no controls is not an error either: its
bow-tie screen carries a `Bowtie` with those lists empty and the drawing `bowtie` gives for it
(`bowtie` section 5; C-039).
A body with no templates or no reports is not an error: `templates` or `reports` is empty, which is
a body that holds none. A platform with no hazards prepares a report with `rows` and `omitted`
empty. Nothing past its review due date is not an error and is not a warning: `outOfDate` is empty
and the prepare-report screen carries no warning at all (C-042). A hazard linked to no platform and
included in no report shows `platforms` and `reports` empty (C-044).
A body with no hazards and no controls shows the filter screen with both lists empty, and a filter
that nothing satisfies shows them empty too, which is a filter with no match and not an error
(C-045). A profile that owns no live platform shows the dashboard with `platforms` empty; a
platform with nothing open shows a `PlatformItems` with every list empty rather than no entry
(C-046). A body in which every live record is linked shows `unlinked` empty, which is not the
same as `unlinked` null (C-048).

## 5. Behavioural promises

- **C-001 One screen at a time, from the folder.** `start` resolves with an `App` whose
  screen is the folder screen with both `topBar` fields null and no messages, and has read
  and written nothing. Every operation resolves with a `Screen` and afterwards `app.screen`
  is deep-equal to it; `app.screen` is the only thing about an `App` a consumer reads. The
  screens are reached in one order: folder; then check, when a kept backup or superseded
  save failed (C-010); then profile; then recover, when the browser holds unsaved working
  state (C-013); then hazards. From hazards the user may go to restore, then to
  confirm-restore, and each returns to hazards; and, at 3.0, to a hazard's own screen, to
  the control library, and to the platforms, from which one platform and then one
  assessment are reached, each returning the way it came (C-015); and, at 5.0, to the history
  and to the acknowledgement screen, each of which also returns to hazards (C-028, C-029); and,
  at 7.0, to the reference register, from which one entry's own screen is reached and returns to
  it (C-033, C-034); and, at 8.0, to the register of workflows, from which one workflow's own
  screen is reached and returns to it (C-036, C-037); and, at 9.0, from the assessment screen to
  the bow-tie of that hazard on that platform, which returns to it (C-039); and, at 10.0, to the
  reports screen, from which the prepare-report screen and one report's own screen are reached, and
  each returns to it, and from the prepare-report screen to the report it produced (C-041 to C-043);
  and, at 11.0, to the filter screen, the dashboard, and the open-items screen, each of which
  returns to hazards (C-045 to C-047).
  The confirm-edit screen is in no order: it is reached from the hazard screen or the controls
  screen by an operation that would change more than one platform, and left by `confirmEdit`
  or `cancelEdit` back to the screen it was reached from (C-027), as restore and
  confirm-restore are reached from and returned to the hazards screen. The only step back to
  the folder is a folder that cannot be read or whose stored data or profiles failed their
  check (section 4), with nothing kept.
- **C-002 Nothing that changes stored data is offered before a profile is selected.** Each
  operation belongs to the screen kinds in this table; called on any other kind it rejects
  with `WrongScreenError`, the app is unchanged, and no module operation was called.

  | Screen kind | Operations |
  |---|---|
  | folder | `chooseFolder`, `openFolder` |
  | check | `acknowledgeCheck` |
  | profile | `createProfile`, `selectProfile` |
  | recover | `acceptRecovery`, `declineRecovery` |
  | hazards | `addHazard`, `save`, `beginRestore`, `openHazard`, `openControls`, `openPlatforms`, `openHistory`, `openAcknowledgements`, `openReferences`, `openWorkflows`, `openReports`, `openFilter`, `openDashboard`, `openOpenItems` |
  | restore | `chooseSaveState`, `prepareRestore`, `cancelRestore` |
  | confirm-restore | `confirmRestore`, `cancelRestore` |
  | hazard | `renameHazard`, `addCausalFactor`, `addConsequence`, `linkControlToHazard`, `retireHazard`, `setReviewTempo`, `back` |
  | controls | `createControl`, `retireControl`, `setReviewTempo`, `back` |
  | platforms | `createPlatform`, `openPlatform`, `retirePlatform`, `setPlatformOwner`, `setReviewTempo`, `back` |
  | platform | `linkHazardToPlatform`, `openAssessment`, `back` |
  | assessment | `setReportId`, `enterRating`, `confirmControlForPlatform`, `excludeControlFromPlatform`, `openBowtie`, `back` |
  | bowtie | `chooseExportTarget`, `exportBowtie`, `back` |
  | history | `back` |
  | acknowledge | `acknowledgeChange`, `back` |
  | references | `createReference`, `openReference`, `back` |
  | reference | `linkReference`, `back` |
  | workflows | `startWorkflow`, `openWorkflow`, `back` |
  | workflow | `submitStep`, `advanceStep`, `completeWorkflow`, `abandonWorkflow`, `back` |
  | reports | `createTemplate`, `beginReport`, `openReport`, `back` |
  | prepare-report | `produceReport`, `back` |
  | report | `chooseReportExportTarget`, `exportReport`, `back` |
  | filter | `applyFilter`, `back` |
  | dashboard | `back` |
  | open-items | `back` |
  | confirm-edit | `confirmEdit`, `cancelEdit` |

  Every operation that changes the working body, the stored data, the backups, or the
  browser's storage belongs to a screen only `selectProfile` leads to, so before a profile
  is selected no call this module makes writes anything but a profile: at 8.0 those
  operations are `acceptRecovery`, `declineRecovery`, `addHazard`, `save`, `confirmRestore`,
  `renameHazard`, `addCausalFactor`, `addConsequence`, `linkControlToHazard`, `retireHazard`,
  `createControl`, `retireControl`, `createPlatform`, `retirePlatform`, `setPlatformOwner`,
  `linkHazardToPlatform`, `setReportId`, `enterRating`,
  `confirmControlForPlatform`, `excludeControlFromPlatform`, `acknowledgeChange`,
  `setReviewTempo`, `createReference`, `linkReference`, `startWorkflow`, `submitStep`,
  `advanceStep`, `completeWorkflow`, `abandonWorkflow`, and, at 10.0, `createTemplate` and
  `produceReport`, and
  `confirmEdit` — thirty-two — and every one of their screens
  is reached only from the hazards screen (C-015), the confirm-edit screen only from four of
  those (C-027). `createReference` is the only operation of this contract that writes a file to
  the data folder rather than a record, and it does so only through `reference-register`, which
  needs the same active profile every other write does (store C-002, C-018; C-033).
  `exportBowtie` and `chooseExportTarget` are not among the thirty: they write one file the user
  chose outside the data folder and change no stored data, no working body, no backup, and no
  browser storage (store C-009, C-020; C-040), and the bow-tie screen they belong to is reached
  only through the assessment screen, so they too are offered only after a profile is selected.
  `exportReport` and `chooseReportExportTarget` are not among the thirty-two either, for the same
  reason: they write one document the user chose outside the data folder and change nothing else,
  and the report screen is reached only through the reports screen (C-043).
  The four operations added at 11.0 are not among them either: `openFilter`, `applyFilter`,
  `openDashboard`, and `openOpenItems` change no stored data and write nothing (C-045 to C-047).
  `createProfile` writes a profile, which
  REQ-069 lists apart from stored data and which store C-002 and profiles C-001 permit
  before selection. This module never constructs an `ActiveProfile`: the value it passes to
  `store.save`, `store.noteChange`, `store.restore`, `change-log.acknowledge`, the `Act`
  of every changing `registry` operation, the `ScheduleAct` of every changing
  `review-schedule` operation, the `EntryAct` of every changing `reference-register`
  operation, the `Act` of every changing `workflows` operation, and the `Act` of every changing
  `reports` operation
  is the one `profiles.selectProfile` resolved with (C-026). (REQ-055 as this module's half,
  store C-002 the other; SL-01 criterion 2.)
- **C-003 Opening a folder checks it, loads it, lists its profiles, and selects no one.**
  `openFolder(app, handle)` calls `store.openDataFolder`, then `store.checkFolder`, then,
  unless the check stops it (C-010), `store.load` and `profiles.listProfiles`. When it
  resolves with a profile screen: `topBar.folderName` is the handle's name;
  `topBar.profileName` is null; `profiles` is what `profiles.listProfiles` gave (complete
  and ordered, profiles C-005; empty for a folder with none); the working body is what
  `store.load` gave (store C-001, C-007), held and shown on no screen until a profile is
  selected; `messages` is empty; nothing was written anywhere (store C-009, profiles C-006).
  When it resolves with a check screen, `acknowledgeCheck` resolves with exactly that
  profile screen, calling no module operation. `profileName` is null whatever any open
  before it, in this copy of Pivot or another, created or selected: this module records a
  selection nowhere, not in the folder and not in the browser's storage, so no open can
  pre-select. A second `start` in the same page is a new `App` at the folder screen.
  (REQ-054, REQ-073 as this module's half, profiles C-003 the other; SL-01 criterion 2.)
- **C-004 The profile screen creates and lists but does not select.** After
  `createProfile(app, name)` resolves: the screen is the profile screen; `profiles` lists
  every profile listed before plus one whose `name` is `name` trimmed (profiles C-001);
  `topBar.profileName` is still null; `messages` is empty. After `selectProfile(app, id)`
  resolves for a listed `id`, and `store.readRecoverable` resolved with null: the screen is
  the hazards screen; `topBar.profileName` is that profile's `name`; `hazards` is
  `registry.listHazards` of the working body (every live hazard, in id order, registry
  C-006; empty for a folder never saved to); `unsaved` is false; `lastSave` is what
  `store.load` gave; `messages` is empty. When `readRecoverable` resolved with a state, the
  screen is the recover screen instead (C-013). Rejections are section 4's, and the list
  shown after any of them is re-read from the folder. (REQ-054, REQ-056 as this module's
  half; SL-01 criterion 2.)
- **C-005 The active profile's name is in the top bar of every screen after selection.**
  From the moment `selectProfile` resolves until the `App` is discarded, every `Screen` any
  operation resolves with, of any kind, resolved or carrying a message, has
  `topBar.profileName` equal to the selected profile's `name`; no operation at 5.0 changes
  or clears it. Before selection it is null on every screen. The page draws
  `topBar.profileName` in the top bar of every screen, in the place and weight
  `baseline/tokens.css` gives the top bar's profile, and draws that no profile is selected
  while it is null; the drawing is verified by demonstration and recorded as a review row
  (SL-01 criterion 3). (REQ-057.)
- **C-006 A hazard added is shown at once, kept until saved, and carried whole to the
  folder.** After `addHazard(app, { title })` resolves with the hazards screen: `hazards`
  is the list before plus the hazard `registry.createHazard` returned, whose `id` is the
  next in the working body's sequence and whose `title` is `title` trimmed (registry
  C-001); `unsaved` is true; the working body is the one `registry` returned; `data.json`
  was not written, because an add is not a save (what `noteChange` writes is C-012's).
  After a later `save` resolves, what `store` wrote is that body (store C-001), so
  `openFolder` on the same folder afterwards, in this copy of Pivot or another, followed by
  `selectProfile`, shows `hazards` deep-equal to this screen's: the same ids and the same
  titles. Adding two hazards before saving lists both, in id order, and one save carries
  both. (The end-to-end of SL-01 criterion 4, composed from registry C-001, C-002, C-004 and
  store C-001; REQ-004, REQ-024, REQ-050 are those modules' promises.)
- **C-007 A save says when another user saved in between, and says nothing when not.**
  `save(app)` calls `store.save` once, with the active profile and the working body. When
  the outcome's `superseded` is not null: the screen carries first one message, of
  severity `warning`, whose items name the other user (the `name` of the stored profile
  whose id is `superseded.savedByProfileId`, or that id itself when no stored profile has
  it) and the file the other user's data was kept as (`keptAs`); the folder is as store
  C-004 leaves it, this user's data in `data.json` and the other's under `Superseded
  Saves`. When `superseded` is null: no such message, and nothing under `Superseded Saves`
  was created (store C-005). A `mirrorError` adds the one message section 4 gives, after
  it; with neither, `messages` is empty. Either way, afterwards `unsaved` is false,
  `lastSave` equals the outcome's `stamp`, and `hazards` is unchanged; a second save with
  no one else in between says nothing (store C-006). `confirmRestore` says the same of the
  outcome `store.restore` resolves with. (REQ-071 as this module's half, store C-004 the
  other; HZ-008's telling; SL-01 criteria 5 and 6.)
- **C-008 A failed operation changes nothing but the messages.** When a module operation
  this module calls rejects, the screen resolved with has the kind section 4 names, the
  same `topBar` as before (except the folder cases, which clear `folderName`), every other
  field of that screen as section 4 says — `unsaved` and `lastSave` unchanged, `hazards`,
  `controls`, `platforms`, `rows`, `omitted`, and the ratings unchanged or re-read as
  section 4 says — and the messages section 4 names and no others; the working body is kept,
  except where section 4 says the hazards screen is the loaded body's; and the `App` is
  still usable: the next operation proceeds as if the failed one had not been called. A
  `noteChange` error does not undo the change it follows (section 4), and a `registry`
  rejection means `noteChange` was not called at all (C-012). Messages are the last
  operation's alone: the next operation that resolves replaces them, so a message never
  outlives the operation after it. No error from a module escapes an operation of this
  module; the only rejection this contract has is `WrongScreenError`. (REQ-005, REQ-006 as
  C-010 and C-011 word them.)
- **C-009 Confinement.** This module writes to the folder only through `store.save`,
  `store.restore`, `store.noteChange`, `profiles.createProfile`, and, at 7.0, the one
  `store.putStoredFile` that `reference-register.createEntry` makes on its behalf, which is the
  only write to `files/` any operation of this contract causes and the only one it makes through
  a module other than `store` itself (DEC-022, DEC-006's carve-out; C-033). It reads
  `files/` only through `reference-register.checkEntryFiles`, and it never opens, names, parses,
  builds, compares, or shows the contents of a stored file: what crosses this surface is a
  `StoredFileLocation` on an entry and an `EntryFileState` beside it, both opaque here (C-035).
  It writes the browser's
  storage only through `store.noteChange`, `store.recoverWorkingState`,
  `store.discardWorkingState`, and the mirror a `store.save` or `store.restore` updates
  (store C-015). It reads the folder and the browser's storage only through
  `store.openDataFolder`, `store.chooseDataFolder`, `store.checkFolder`, `store.load`,
  `store.unsavedChanges`, `store.readRecoverable`, `store.listBackups`,
  `store.chooseSaveStateFile`, `store.prepareRestore`, and `profiles.listProfiles`. It reads
  hazards, controls, platforms, links, and ratings only through `registry.listHazards`,
  `registry.getHazardDetail`, `registry.listControls`, `registry.listPlatforms`,
  `registry.getRatings`, `registry.listPlatformHazards`, and `registry.platformsAffected`,
  and changes them only through
  the changing operations of `registry`; it reads no collection of a `DataBody` itself. It
  obtains a band only through `rating.ratingFor` (C-021). It reads a review tempo, a due date,
  a last reviewed date, and an overdue flag only through `review-schedule.listSchedules` and
  `review-schedule.listOverdue`, and changes a schedule only through
  `review-schedule.setSchedule`; it calls `review-schedule.completeReview` at no version of
  this contract, and it derives no due date, no overdue flag, and no tempo of its own — it
  holds no month arithmetic, no overdue boundary, and no clock to compare a date to (C-031,
  C-032). At 8.0 it still calls `review-schedule.completeReview` at no version, and a completed
  review workflow does move a last reviewed date: the call is made by
  `workflows.completeWorkflow`, which decides which records it is made for and derives each one's
  `affectedPlatformIds` itself (`workflows` C-006, DEC-026). This module neither makes that call,
  nor names the records it is made for, nor derives a platform for it. It reads a workflow
  record, the steps of a workflow kind, a workflow's progress, and a step's demand only through
  `workflows.listWorkflows`, `workflows.progressOf`, and `workflows.stepDemand`, and changes a
  workflow only through `workflows.startWorkflow`, `submitStep`, `advanceStep`,
  `completeWorkflow`, and `abandonWorkflow`; it reads `collections['workflow-record']` never,
  holds no step list of any workflow kind, computes no `done` and no `remaining`, decides no
  step's demand, seals no record, and makes no act a step makes — every `registry` and
  `review-schedule` call a step causes is made by `workflows` inside the one call this module
  made, which is what keeps a step the record shows an act that happened (DEC-025; C-037, C-038).
  It reads the history and the queue
  only through `change-log.listEntries` and `change-log.listAwaiting`, and writes an
  acknowledgement only through `change-log.acknowledge`; it never calls
  `change-log.recordChange`, because the entry for a change to a `registry` record is written
  by the operation that makes the change (registry C-023), and it derives no entry, no item, no
  field change, and no platform of its own: the platforms an edit reaches come from
  `registry.platformsAffected` and from nowhere else (C-027). It writes nothing to the browser's
  storage itself; it holds no state outside the `App` and the page it draws; it reads no
  clock; and it constructs no `ActiveProfile`, `DataBody`, `Hazard`, `Control`, `Platform`,
  `CausalFactor`, `Consequence`, `Link`, `Rating`, `RatingValues`, `UserProfile`,
  `SaveStamp`, `BackupEntry`, `ChangeLogEntry`, `ReviewSchedule`, `ReviewState`,
  `ReferenceEntry`, `EntryFileState`, `StoredFileLocation`, `WorkflowRecord`, `WorkflowEntry`,
  `WorkflowProgress`, `StepDemand`, or
  `RestorePlan` of its own: every such value
  it shows or
  passes on came from the module that owns it, except the `RatingValues` an assessor typed,
  which it passes to `registry.setRating` and shows back only as `registry` returned it
  (C-022), and the `ScheduleFields` a user typed, which it passes to
  `review-schedule.setSchedule` untouched and shows back only as `review-schedule` returned it
  (C-032), and the `EntryFields` a user typed and the file they chose, which it passes to
  `reference-register.createEntry` untouched and shows back only as that module returned it
  (C-033), and the `StartFields`, `StepSubmission`, and `CompletionFields` a user typed, which it
  passes to `workflows` untouched and shows back only as the entries and the record that module
  returned (C-036, C-038). It reads a reference entry, its links, and its file standing only through
  `reference-register.listEntries`, `getEntry`, and `checkEntryFiles`, and changes an entry only
  through `createEntry` and `linkEntry`; it reads `collections['reference-entry']` never, holds
  no second list of an entry's links, and derives no flag of its own — whether a stored file is
  there is `checkEntryFiles`' answer and nothing else (C-034, C-035).
  The values it does build are the `Act` of C-026, from a profile and a platform
  id `registry` and `profiles` gave it; the `ScheduleAct` of C-026, which is that `Act` plus
  exactly the ids `registry.platformsAffected` gave; the `EntryAct` of C-026, which is that `Act`
  plus exactly the union of the ids `registry.platformsAffected` gave for the entry's links
  (DEC-024); the `AcknowledgementFields` of C-029, from an
  entry id and a platform id the screen showed; the `Reviews` of C-031, which is two lists
  `review-schedule` gave and nothing else; the `Files` of C-035, which is one list
  `reference-register` gave and nothing else; the `LinkedRecord` values of C-034 and the
  `WorkflowRow` values of C-036, each a ref or a record another contract gave beside a name one of
  that screen's own `registry` lists gave; and the `RecordRef`
  values it passes to
  `registry.platformsAffected`, each the kind and id of a record the screen it is on holds or of
  a record one of its entries is linked to
  (C-027, C-032, C-034). At 9.0 it obtains a bow-tie and its drawing only through
  `bowtie.bowtieFor` and `bowtie.renderBowtieSvg`, and constructs no `Bowtie` and no
  `BowtieSvgText` of its own: it draws no second bow-tie, lays out no node, and neither edits,
  filters, re-serialises, nor caches across a screen what `bowtie` gave (C-039). It writes outside
  the data folder and the browser's storage only through `store.writeExportFile`, with the one
  handle `store.chooseExportFile` resolved with or the one `exportBowtie` was given, and the text
  written is the `BowtieSvgText` `renderBowtieSvg` gave for that export and nothing else (C-040);
  it opens no picker of its own and writes a bow-tie to the folder, to `data.json`, to a backup,
  and to the browser's storage never (REQ-059; SL-08 criterion 2). At 10.0 it reads a template and
  a report only through `reports.listTemplates`, `reports.listReports`, and `reports.getReport`,
  what a report includes only through `reports.includesOf`, the reports that include a hazard only
  through `reports.reportsIncluding`, and the records a report would use that are past their review
  due date only through `reports.outOfDateFor`; it changes a template or a report only through
  `reports.createTemplate` and `reports.produceReport`; it obtains a report's document only through
  `reports.renderReportHtml` and `reports.renderReportMarkdown` and writes it only through
  `store.writeExportFile`, with the handle `store.chooseExportFile` resolved with or the one
  `exportReport` was given. It reads `collections['report-template']` and `collections.report`
  never, derives no due date, no out-of-date list, and no inclusion of its own, draws no document,
  constructs no `ReportTemplate`, `Report`, `OutOfDateRecord`, or `ReportIncludes`, and keeps no
  document after the write — the `TemplateFields` a user typed it passes to `reports` untouched,
  and the `acknowledgedOutOfDate` it passes is exactly the refs of the `outOfDate` its
  prepare-report screen showed and nothing else (C-041 to C-043). At 11.0 it reads hazards,
  controls, and platforms of every status only through `registry.listAllHazards`,
  `listAllControls`, and `listAllPlatforms`, and the live links that name a record only through
  `registry.listLinks`; it reads `collections.link` never. Three rules of composition are this
  module's own at 11.0, and each is stated in the clause that uses it and in
  `docs/slices/SL-11.md` rather than derived here: which hazards and controls pass a filter
  (C-045), which overdue reviews, controls, and workflows are a platform's open items (C-046), and
  which links make a record linked (C-048). None of them derives a band, a state, an overdue flag,
  a link, or a queue: each selects, by equality, from what the owning contract gave, and it
  constructs no `ReviewState`, `PlatformControl`, `OmittedHazard`, `WorkflowRecord`, or
  `RecordChangeEntry` of its own. It never imports another
  module's `src/`.
  (REQ-069 and REQ-073 as this module keeps them.)
- **C-010 Opening checks every file Pivot wrote before showing anything from the folder.**
  `openFolder` shows nothing from the folder until `store.checkFolder` has resolved. When it
  lists a failure whose `affects` is `stored-data` or `profiles`, the operation resolves
  with the folder screen, `topBar.folderName` null, and one `error` message per failure
  listed, in the order `checkFolder` gave, whose items are exactly two: the failure's
  `file` and its affected-data name (section 3); `store.load` and `profiles.listProfiles`
  were not called, and nothing from the folder is kept. When every failure is a `backup` or
  a `superseded-save`, the operation resolves with the check screen: `topBar.folderName` is
  the handle's name, `profileName` null, and `messages` is one `error` message per failure
  in the same order and form; nothing from the folder is on it. `acknowledgeCheck` then
  resolves with the profile screen C-003 gives, and the stored data is shown after
  selection as C-004 gives. When the list is empty, no check screen is shown. The check is
  made on every open; an acknowledgement is recorded nowhere. (REQ-006, REQ-074 as this
  module's half, store C-012 the other; SL-02 criterion 1.)
- **C-011 A save that did not happen names the changes it did not store.** When
  `store.save` rejects, this module calls `store.unsavedChanges` once with the working body
  and resolves with the hazards screen carrying one `error` message whose items are the
  change names (section 3) of the refs it resolved with, one per ref, in its order. An
  empty result gives a message with no items. Nothing on the screen but `messages` changes,
  and the working body is kept, so a later `save` carries the same changes. Stopping a save
  partway, at a `store` fault point or through the in-memory folder's `failWrite`, is the
  same rejection, and store C-010 leaves the previously saved data readable and unchanged.
  (REQ-005 as this module's half, store C-010 and C-011 the other; SL-02 criterion 2.)
- **C-012 Every change to the working state is told to `store`.** After a changing
  `registry`, `change-log`, `review-schedule`, `reference-register`, or `workflows` operation
  resolves, this
  module calls
  `store.noteChange` once, with the active
  profile and the body that operation returned, before the operation resolves; an operation
  the module rejects calls it not at all. At 8.0 the operations that do this are
  `addHazard`, `renameHazard`, `addCausalFactor`, `addConsequence`, `linkControlToHazard`,
  `retireHazard`, `createControl`, `retireControl`, `createPlatform`, `retirePlatform`,
  `setPlatformOwner`, `linkHazardToPlatform`, `setReportId`, `enterRating`,
  `confirmControlForPlatform`, `excludeControlFromPlatform`, `acknowledgeChange`,
  `setReviewTempo`, `createReference`, `linkReference`, `startWorkflow`, `submitStep`,
  `advanceStep`, `completeWorkflow`, `abandonWorkflow`, `createTemplate`, `produceReport`, and
  `confirmEdit` for the operation it was waiting on — twenty-eight, every operation of this
  contract that changes the working body, once each, so no change is made that `store`
  is not told of, the entry each `registry`, `review-schedule`, `reference-register`, and
  `workflows` act
  appends to the body
  included (registry C-023, `review-schedule` C-012, `reference-register` C-011, `workflows`
  C-010). A workflow operation is one call to `store` however many entries it caused: a step
  that makes an act appends the act's entry and the workflow record's, and a completion appends
  one per completing act as well, and all of them are in the one body `noteChange` is given
  (DEC-025, DEC-026). The file a
  `createReference` kept is not part of the working state and is in the folder already: it was
  written by `store.putStoredFile` before the body came back, is not mirrored, is not backed up,
  and is not undone by a save that never happens (`reference-register` C-004; store C-018). What
  `noteChange` carries is the entry holding its location, like any other record.
  No other operation calls `noteChange`: opening, selecting, saving,
  recovering, declining, restoring, every navigation of C-015, showing and exporting a bow-tie
  (C-039, C-040), preparing a report and downloading one (C-042, C-043), filtering and showing the
  dashboard and the open items (C-045 to C-047), and an operation that resolves
  with the confirm-edit screen instead of changing anything (C-027) do not change the working
  state as `store` counts it (store C-013), so no backup follows them. A `ChangeOutcome`
  with no error adds no message, whether or not a backup was written; its errors are section
  4's. (REQ-062 and REQ-079 as this module's half, store C-013 to C-015 the other; SL-02
  criteria 3 and 5.)
- **C-013 Unsaved working state is offered for recovery once a profile is selected, and the
  folder waits for a save.** `selectProfile`, after `profiles.selectProfile` resolves, calls
  `store.readRecoverable` once. When it resolves with a state: the screen is the recover
  screen, `mirroredAtAest` and `basedOn` are the state's `mirroredAtAest` and `loadedStamp`,
  `hazards` is `registry.listHazards` of the state's body, `messages` is empty, and nothing
  was written anywhere. `acceptRecovery` calls `store.recoverWorkingState` with that state
  and resolves with the hazards screen: `hazards` is `registry.listHazards` of the body it
  returned, which becomes the working body; `unsaved` is true; `lastSave` is what
  `store.load` gave; `messages` is empty. `declineRecovery` calls
  `store.discardWorkingState` and resolves with the hazards screen of the loaded body,
  exactly as C-004 gives with no recoverable state. Neither calls `store.save`,
  `store.restore`, or `store.noteChange`, so `data.json` and `backups/` are unchanged until
  the user saves (store C-016). A state from another folder is offered like any other
  (ASM-006, DEC-009). (REQ-080 as this module's half, store C-016 the other; SL-02
  criterion 5.)
- **C-014 A restore warns, names the unsaved changes it would discard, and writes nothing
  until confirmed.** `beginRestore` calls `store.listBackups` once and resolves with the
  restore screen: `backups` is what it gave, newest first; `messages` empty. `prepareRestore
  (app, source)` calls `store.prepareRestore` with `source`, `store.unsavedChanges` with the
  working body, `registry.listHazards` with the plan's body, and, when the plan's `replaces`
  is not null, `profiles.listProfiles`; it resolves with the confirm-restore screen:
  `restoring` is `source.file` for a backup and `source.saveState.name` for a save state
  file; `stampInFile` and `replaces` are the plan's; `replacesSavedBy` is the name of the
  stored profile whose id is `replaces.savedByProfileId`, or that id when no stored profile
  has it, or null when `replaces` is null; `hazards` is what the plan's body lists; and
  `messages` is exactly one `warning` message, whose items are the change names (section
  3) of the unsaved changes, in `unsavedChanges`' order, empty when there are none. A
  backup and a save state file reach this screen through this one operation. Nothing is
  written anywhere by `beginRestore`, `chooseSaveState`, `prepareRestore`, or
  `cancelRestore`. `cancelRestore` resolves with the hazards screen the user left at
  `beginRestore`, with `messages` empty, and calls no module operation. `confirmRestore`
  calls `store.restore` once with the active profile and the plan, and on resolving shows
  the hazards screen: `hazards` is `registry.listHazards` of the plan's body, which becomes
  the working body; `unsaved` false; `lastSave` the outcome's `stamp`; `messages` as C-007
  gives for the outcome. So `openFolder` on the folder afterwards, followed by
  `selectProfile`, shows the restored file's hazards. (REQ-075 as this module's half,
  REQ-064; store C-017 the other; SL-02 criterion 4.)
- **C-015 The hazards screen is where the user goes from and comes back to, and a screen is
  built when it is shown.** The hazards screen leads to five screens and each of those to
  at most one more; `back` returns along the same edge, and every screen it resolves with
  is built again from the working body at the moment it resolves, not from what was shown
  before:

  | On | Operation | Shows | `back` returns to |
  |---|---|---|---|
  | hazards | `openHazard(app, id)` | the hazard screen for `id` (C-016) | hazards |
  | hazards | `openControls(app)` | the controls screen (C-017) | hazards |
  | hazards | `openPlatforms(app)` | the platforms screen (C-018) | hazards |
  | hazards | `openHistory(app)` | the history screen (C-028) | hazards |
  | hazards | `openAcknowledgements(app)` | the acknowledgement screen (C-029) | hazards |
  | hazards | `openReferences(app)` | the reference register (C-033) | hazards |
  | platforms | `openPlatform(app, id)` | the platform screen for `id` (C-020) | platforms |
  | platform | `openAssessment(app, hazardId)` | the assessment screen for that hazard on that platform (C-021) | platform |
  | references | `openReference(app, id)` | that entry's own screen (C-034) | references |
  | hazards | `openWorkflows(app)` | the register of workflows (C-036) | hazards |
  | workflows | `openWorkflow(app, id)` | that workflow's own screen (C-037) | workflows |
  | assessment | `openBowtie(app)` | the bow-tie of that hazard on that platform (C-039) | assessment |
  | hazards | `openReports(app)` | the reports screen (C-041) | hazards |
  | reports | `beginReport(app, fields)` | the prepare-report screen for that template and platform (C-042) | reports |
  | reports | `openReport(app, id)` | that report's own screen (C-043) | reports |
  | prepare-report | `produceReport(app, bowtieHazardIds)` | the produced report's own screen (C-042, C-043) | reports |
  | hazards | `openFilter(app)` | the filter screen with no filter active (C-045) | hazards |
  | hazards | `openDashboard(app)` | the active profile's dashboard (C-046) | hazards |
  | hazards | `openOpenItems(app)` | the open-items screen (C-047) | hazards |

  At 11.0 `applyFilter` resolves with the filter screen it was called on, rebuilt with the filter
  given, and none of the three new screens leads anywhere but back to hazards.

  At 10.0 the report screen is reached two ways — from the reports screen and, once a report is
  produced, from the prepare-report screen — and `back` from it resolves with the reports screen
  either way, rebuilt, so the prepare-report screen is not returned to and a report is never
  produced twice by going back (C-042). At 9.0 the assessment screen leads to one more, the bow-tie screen, which holds the same hazard
  and platform pair and whose `back` resolves with that assessment screen rebuilt (C-022, C-039).
  A navigation operation calls only the `registry`, `profiles`, `change-log`,
  `review-schedule`, `reference-register`, `workflows`, `bowtie`, and `reports` reads its screen's clause
  names — C-031's two on every screen that carries `reviews`, and C-035's one on every screen
  that carries `files` —
  writes nothing anywhere, calls no `store` operation, and resolves with `messages`
  empty except for the omitted-hazard messages C-020 requires. `reference-register.checkEntryFiles`
  reads the data folder and writes nothing to it, so a navigation to a register screen still
  writes nowhere (C-035; store C-019). The hazards screen `back`
  resolves with is C-004's: `hazards` is `registry.listHazards` of the working body as it
  now is, `lastSave` is unchanged, and `unsaved` is true when any operation since the last
  `save` or `confirmRestore` changed the working body, on whichever screen it was made, and
  false when none did. The screen a changing operation resolves with is the screen it was
  called on, rebuilt the same way, so a change made on one screen is visible on every screen
  built after it. This module holds the hazard, the platform, and the assessment pair the
  current screen is for, the pending edit while the confirm-edit screen is shown (C-027), and
  nothing else about where the user has been: there is no record of where the user came from
  beyond the one edge in this table, and a second `openHazard` on a hazards screen reached
  by `back` is a fresh read. The history screen and the acknowledgement screen lead nowhere:
  `back` is the only operation either offers (C-002). At 8.0 the workflow this module holds is
  added to that list, and it is held as an id: every screen a workflow operation resolves with is
  built from a fresh `workflows.progressOf` of the working body as it now is, so the steps a
  screen shows are never the steps a previous screen showed (C-037). (SL-03 criteria 1, 2, 3, 5, 8, 9 and
  SL-05 criteria 1, 2, 4 and 5 are reached through these edges; no requirement is promised by
  this clause alone.)
- **C-016 A hazard's screen shows what is stored against the hazard, and its title is
  changed on the one record.** `openHazard(app, id)` calls `registry.getHazardDetail` once
  with the working body and `id`, and `registry.listControls` once, and resolves with the
  hazard screen: `hazard`, `causalFactors`, `consequences`, and `controls` are exactly what
  the detail gave, in registry C-010's and C-012's order, each `text` and `title` as stored;
  `linkableControls` is every control `listControls` gave that no entry of `controls` names,
  in registry C-011's order; `messages` is empty. An `id` the body has no live hazard for
  resolves with the hazards screen re-listed and one `warning` message whose items name the
  id. `renameHazard(app, { title })` calls `registry.updateHazard` with the hazard the
  screen holds, tells `store` (C-012), and resolves with the hazard screen rebuilt: `hazard`
  is what `registry` returned, its `title` `title` trimmed and its `id` unchanged; nothing
  else on the screen changes. `addCausalFactor(app, { text })` and `addConsequence(app,
  { text })` each call the `registry` operation of that name once, tell `store`, and resolve
  with the hazard screen rebuilt, the new record last in its list and its `text` as stored.
  Because a hazard is one record (registry C-004, C-009), the title this screen shows after
  a rename is the title every platform's row shows for that hazard (C-020), and a hazard
  linked to two platforms has one detail screen, not two — which is why each of the four
  changing operations of this screen is gated when the hazard is on more than one platform
  (C-027), and why the title given is refused when it is the title already stored (registry
  C-029, section 4). `retireHazard(app)` is C-030's and leaves this screen. At 8.0 the workflow
  screen of a workflow whose subject is a live hazard shows that hazard the same way and from one
  `registry.getHazardDetail` of its own: its `hazard`, `causalFactors`, `consequences`, and
  `controls` are exactly what that detail gave, in the same orders, and no second read assembles
  them, so an `add-data` workflow shows the hazard it is building as the hazard's own screen
  would (C-037). At 10.0 every hazard screen this clause resolves with — from `openHazard` and
  from each of its changing operations — also carries `platforms` and `reports`, from the reads
  C-044 names and from no read of this clause's own, and its `messages` carry C-044's message for
  each platform on which the hazard is omitted, which is the one case in which `openHazard` does not
  resolve with `messages` empty. (SL-03 criteria 1 and 2; REQ-044
  as what this module shows of registry C-010 and C-012.)
- **C-017 The control library is one list, and a control is linked to a hazard as
  preventative or mitigating.** `openControls(app)` calls `registry.listControls` once and
  resolves with the controls screen: `controls` is every live control, once each, in
  registry C-011's order; `messages` empty. `createControl(app, { title })` calls
  `registry.createControl`, tells `store` (C-012), and resolves with the controls screen
  rebuilt, listing every control listed before plus the new one, whose `title` is `title`
  trimmed. The library is the one list every hazard links from: the same control appears on
  this screen once however many hazards it is linked to, and nothing on this screen names a
  hazard or a platform (DEC-013); at 5.0 it lists the live controls only, so a control retired
  by `retireControl` leaves this screen and every `linkableControls` while staying on every
  hazard and every platform it was already on (C-030, registry C-027).
  `linkControlToHazard(app, controlId, controlKind)` calls
  `registry.linkControlToHazard` with the hazard the hazard screen holds, `controlId`, and
  `controlKind`, tells `store`, and resolves with the hazard screen rebuilt: `controls`
  lists the control with that `controlKind`, `linkableControls` no longer does, and the
  control's entry in the library is unchanged. Linking the same control to a second hazard
  is the same call from that hazard's screen and adds nothing to the library. (SL-03
  criteria 2 and 3; REQ-032 and REQ-033 as what this module shows of registry C-011 and
  C-012.)
- **C-018 A platform is created with an owner chosen from the stored profiles.**
  `openPlatforms(app)` calls `registry.listPlatforms` and `profiles.listProfiles` once each
  and resolves with the platforms screen: `platforms` is every live platform in registry
  C-014's order; `profiles` is every stored profile in profiles C-005's order, which is what
  the page offers as the owner and how a stored `ownerProfileId` is drawn as a name;
  `messages` empty. `createPlatform(app, { name, ownerProfileId })` calls
  `registry.createPlatform`, tells `store` (C-012), and resolves with the platforms screen
  rebuilt: `platforms` is the list before plus the new platform, whose `name` is `name`
  trimmed and whose `ownerProfileId` is the one given — exactly one, never absent and never
  a list. `setPlatformOwner(app, platformId, ownerProfileId)` calls
  `registry.setPlatformOwner` with those two ids, tells `store` (C-012), and resolves with the
  platforms screen rebuilt: that platform's `ownerProfileId` is the one given, every other
  field of it and every other platform is deep-equal to what it was (registry C-028), and
  `profiles` is re-read. Nothing of that platform's queue is touched, so what the outgoing
  owner had not acknowledged is what the incoming owner reads on the acknowledgement screen
  (C-029, `change-log` C-012; REQ-081; SL-05 criterion 5). An owner equal to the one stored is
  refused (registry C-029, section 4), and `retirePlatform(app, platformId)` is C-030's.
  Every other screen built afterwards is what it would have been: the hazards
  screen's `hazards`, every hazard screen's detail, the controls screen's `controls`, and
  every other platform's screen are deep-equal to what they were before the call, because
  registry C-014 changed one entry of one collection. (SL-03 criteria 4 and 7; REQ-035 and
  REQ-065 as what this module shows of registry C-014.)
- **C-019 A hazard is linked to a platform from that platform's screen, and linking copies
  nothing.** `linkHazardToPlatform(app, hazardId)` calls `registry.linkHazardToPlatform`
  with `hazardId` and the platform the screen holds, tells `store` (C-012), and resolves
  with the platform screen rebuilt (C-020): `rows` is the rows before plus one for that
  hazard, carrying the hazard as stored, the `reportId` registry C-015 gave it, every one of
  the hazard's controls in the `awaiting` state and none on this platform (C-024, registry
  C-015), and both residual values null; `linkableHazards` no longer
  names it. The hazard's own screen is deep-equal to what it was: linking adds a link and
  copies no causal factor, consequence, control, or rating. A hazard may be linked from any
  number of platform screens, and after a `renameHazard` every one of those platforms' rows
  carries the new title, because all of them read the one record (C-016, registry C-004).
  (SL-03 criterion 1; REQ-025 as what this module shows of registry C-015.)
- **C-020 Every list of a platform's hazards is one `registry.listPlatformHazards`, and an
  omitted hazard is named, never dropped.** Every screen this module shows that lists the
  hazards of a platform is built from exactly one `registry.listPlatformHazards` call for
  that platform and from no other list of hazards: at 5.0 that screen is the platform
  screen; at 8.0 it is the platform screen and the workflow screen of a workflow whose subject
  is a live platform, which is the review view this clause always said would be built the same
  way; at 10.0 it is also the prepare-report screen, which is the report view this clause said
  would be built the same way, and whose query is the same one `reports.produceReport` reads, so
  the hazards a user chose bow-ties from and the hazards the report then holds are one answer
  (`reports` C-004; C-042); at 11.0 it is also the filter screen, whose items against a platform
  are that platform's query for every platform `registry.listAllPlatforms` gives (C-045), and the
  dashboard and open-items screens, whose `unconfirmed` and `omitted` for a platform are that
  platform's query (C-046, C-047) — which is the filter and dashboard this clause said would be
  built the same way; and any list, filter, dashboard, or report view a later version adds is
  built the same way. This module never assembles a platform's hazards from `listHazards`,
  from `getHazardDetail`, or from links of its own, and it never asks a second contract the same
  question: `workflows.reviewOmissions` gives a review workflow's omitted hazards and is called
  at no version of this contract, because the one query has already given them and two answers
  could disagree (C-037, DEC-027). `openPlatform(app, id)` makes that call
  and resolves with the platform screen: `platform` is what it gave; `rows` is exactly its
  rows, in its order, each a `PlatformRow` — its row unchanged plus `residualRating`
  (C-021); `omitted` is exactly its `omitted`, in its order; and `messages` is one `error`
  message per omitted hazard, in that order, whose items are the hazard's id and the
  omitting record's key. So a live hazard linked to the platform is in `rows` or in
  `omitted`, never in neither and never in both, and the user is told of every one that is
  omitted. `linkableHazards` is `registry.listHazards` of the working body without every
  hazard named in `rows` or in `omitted`, in registry C-006's order; it is the picker for
  `linkHazardToPlatform` and is not a list of this platform's hazards. (REQ-009 as this
  module's half, registry C-019 the other; HZ-004; SL-03 criterion 9.)
- **C-021 Every rating shown is `rating.ratingFor` of the values as entered.** Every band
  and every cell this module shows for a consequence and a likelihood is the `Rating` that
  `rating.ratingFor` resolved with when passed exactly those two values, as `registry` gave
  them and with nothing added, defaulted, or rounded: `residualRating` on each
  `PlatformRow` for that row's `residual`, and `initialRating` and `residualRating` on the
  assessment screen for its `initial` and `residual`. This module holds no table of bands,
  no order over them, and no mapping from a cell to a word; it never computes, caches
  across a change, stores, or infers a band, and it never shows a band beside values other
  than the ones it was given for. A rating with either value null is shown with the
  `Uncategorised` band `rating` C-002 gives, which is the only way a screen says a rating
  was not entered. `openPlatform` and `back` to it call `ratingFor` once per row;
  `openAssessment` twice; and, at 8.0, `openWorkflow` and every operation that rebuilds a
  workflow screen whose subject is a live platform call it once per row of that screen, which is
  the residual rating criterion 3 asks a review to present beside each hazard's controls (C-037);
  and, at 10.0, `beginReport` and every operation that rebuilds a prepare-report screen call it
  once per row of that screen; and, at 11.0, `openFilter` and `applyFilter` call it once per row of
  every platform's query, which is the `residualRating` of every `HazardItem` and `ControlItem`
  listed against a row, and a filter by band compares that `Rating`'s `band` for equality and
  nothing else (C-045). The band a report's document carries is `reports`' call to
  `rating.ratingFor` and not this module's; the report screen shows no band (C-043; `reports`
  C-008). (REQ-017 as this module's half, `rating` C-001 the other; HZ-010;
  SL-03 criterion 6.)
- **C-022 An assessment is entered per hazard, per platform, per stage, and shown exactly
  as entered.** `openAssessment(app, hazardId)` calls `registry.listPlatformHazards` for the
  platform the screen holds (C-020) and `registry.getRatings` for `hazardId` and that
  platform, and `profiles.listProfiles` for the names of C-024's confirmations, once each,
  and resolves with the assessment screen: `platform` and `hazard` are
  that platform and that row's hazard; `reportId` and `controls` are that row's, each control
  in the state registry gave it (C-024); `profiles` is what `listProfiles` gave; `initial`
  and `residual` are the two `RatingValues` `getRatings` gave; `initialRating` and
  `residualRating` are C-021's; `messages` is empty. `enterRating(app, stage, values)`
  calls `registry.setRating` once with the hazard and platform the screen holds, `stage`,
  and `values`, tells `store` (C-012), and resolves with the assessment screen rebuilt: the
  `RatingValues` of that stage are deep-equal to the `consequence` and `likelihood` given —
  the same level and the same letter, or null where null was given — and the other stage's
  are unchanged. What is shown is what was entered: no control, no link, no justification, no
  state, and no count of controls in any state is passed to `registry.setRating` or to
  `rating.ratingFor`, so `confirmControlForPlatform` and `excludeControlFromPlatform` leave
  `initial`, `residual`,
  `initialRating`, and `residualRating` deep-equal to what they were (C-025), and so does
  every operation of this contract but `enterRating` for that stage. A value the scales do
  not carry is refused by `registry` and shown nowhere (section 4), and from 5.0 so is a pair
  equal to the pair already stored, which resolves with one `info` message and stores nothing
  (registry C-029). The same hazard on
  another platform has its own assessment screen and its own two ratings, reached through
  that platform. (REQ-003, REQ-042, REQ-043 as what this module shows of registry C-017;
  HZ-002; SL-03 criteria 5 and 6.)
- **C-023 A hazard's ID in a platform's reports is shown on that platform and changed by the
  user.** The `reportId` on the assessment screen and on every `PlatformRow` is the one the
  `hazard-platform` link carries (registry C-016): it is the hazard's global ID when the
  link was made (C-019), and every screen built afterwards shows the same value until
  `setReportId` changes it. `setReportId(app, reportId)` calls
  `registry.setPlatformReportId` with the hazard and platform the screen holds, tells
  `store` (C-012), and resolves with the assessment screen rebuilt, its `reportId` the value
  given; the hazard's global ID, its detail screen, and its `reportId` on every other
  platform are unchanged. An empty or space-padded value is refused, and from 5.0 so is a
  value equal to the one the link already carries, which resolves with one `info` message and
  stores nothing (registry C-029; section 4).
  (REQ-051 and REQ-052 as what this module shows of registry C-016; SL-03 criterion 8.)
- **C-024 Every one of a hazard's controls is shown against a platform, in one of three
  states, as `registry` gave it.** Every screen of this module that shows a control against a
  platform shows every one of that hazard's controls, once each, in registry C-019's order,
  each carrying the `state`, the `confirmation`, and the `justification` of that
  `PlatformControl` unchanged: at 5.0 those screens are the assessment screen's `controls`
  and the `controls` of each `PlatformRow` on the platform screen; at 8.0 they also include the
  `controls` of each `PlatformRow` on the workflow screen, which is criterion 3's "with its
  controls" and is the same rows from the same query (C-020, C-037); at 9.0 they also include the
  bow-tie screen's `bowtie.preventativeControls` and `bowtie.mitigatingControls`, which between
  them are every one of that row's controls, once each, split by `controlKind` and each list in
  registry C-019's order, with the `state`, `confirmation`, and `justification` registry gave
  (`bowtie` C-001; C-039); at 10.0 they also include the `controls` of each `PlatformRow` on the
  prepare-report screen, from the same query (C-042), and the `controls` of each
  `HazardOnPlatform` on the hazard screen, which are that hazard's row of each platform's query
  unchanged (C-044); at 11.0 they also include the `platformControl` of each `ControlItem` on the
  filter screen and the `control` of each `UnconfirmedControl` on the dashboard and open-items
  screens, each that row's `PlatformControl` unchanged — the dashboard selecting the `awaiting`
  ones, which is a selection by state and not a second state (C-045, C-046); and any list or
  report view a later version adds shows them the same way. A produced report's controls are not
  among these: the report screen shows the `ReportControl` values `reports` stored, which say what
  each control's state was when the report was produced and not what it is now (C-043; `reports`
  C-003). This module derives no state,
  reads no link and no justification of its own (C-009), treats no absence as a state, hides
  no control for the state it is in, and counts controls nowhere. A control's status is not a
  state either: a control retired in the library is shown on both screens in the `state`,
  with the `confirmation` and the `justification`, it had before it was retired, because
  `registry` still gives it (registry C-027; C-030 here).
  - `confirmed`: the control is on the platform, and this is the only state in which any
    screen of this module shows it as the platform's own. Its `confirmation` is
    `registry`'s — `byProfileId`, the profile that confirmed it, and `atAest`, when — and on
    the assessment screen `profiles` is every stored profile in profiles C-005's order, from
    one `profiles.listProfiles`, which is how `byProfileId` is drawn as a name, or as the id
    itself when no stored profile has it or the list could not be read (section 4), as C-007
    and C-014 name a saver. Within one working body a control stops
    being shown as the platform's exactly when its link stops being live, which is the
    exclusion of C-025 and nothing else: no rating, no act on another platform, no rename, and
    no navigation changes what a control is shown as, and a `save` changes no state, only
    where the body is kept. `acceptRecovery` and `confirmRestore` replace the working body
    (C-013, C-014), so every screen built afterwards shows the states that body holds
    (REQ-001; SL-04 criterion 1).
  - `excluded`: the control is shown against the platform carrying the live `Justification`
    `registry` gave, its `text` as stored, so the reason for leaving it off is on the same
    screen as the control (REQ-002; SL-04 criterion 2).
  - `awaiting`: the control is shown with `confirmation` and `justification` both null and is
    shown as awaiting a ruling — neither as the platform's nor as one a user decided against.
    It is what every one of a hazard's controls is from the moment the hazard is linked to the
    platform (registry C-015, C-021) until a person acts (SL-04 criterion 4).

  Each control's `controlKind` is the one the hazard's own link carries (C-017), whatever its
  state, and a control excluded from this platform is still one of the hazard's controls on
  its own screen (C-016). (REQ-002 as this module's half, registry C-019 and C-021 the other;
  HZ-001, HZ-007; SL-04 criteria 1, 2 and 4.)
- **C-025 A control reaches a platform only by a confirmation, and leaves it only with a
  reason, one control per act.** `confirmControlForPlatform(app, controlId)` calls
  `registry.confirmControlForPlatform` with the hazard and the platform the screen holds and
  `controlId`, tells `store` (C-012), and resolves with the assessment screen rebuilt: that
  control's `state` is `confirmed`; its `confirmation.byProfileId` is the active profile's id,
  which is the profile `profiles.selectProfile` resolved with and never one this module
  constructs (C-002, C-009); every other entry of `controls` is deep-equal to what it was.
  `excludeControlFromPlatform(app, controlId, text)` is the same call to
  `registry.excludeControlFromPlatform` carrying `text`: that control's `state` is `excluded`,
  its `justification.text` is `text` trimmed, and its `confirmation` is null. A blank `text`
  is refused by `registry` and nothing is stored (section 4), so no screen of this module ever
  shows a control excluded with no reason and no act of this surface removes a control from a
  platform without one (REQ-058; SL-04 criterion 3).

  Each act names exactly one control: this surface has no operation that confirms or excludes
  a set of controls, a hazard's controls, or a platform's, and none that takes a default
  (HZ-007). Version 4.0 recorded that the onboarding workflow would walk a user through a
  platform's `awaiting` controls and be built from these two acts; at 8.0 that is corrected.
  `workflows` 1.0's `onboard-platform` has three steps and none of them confirms a control
  (`workflows` C-013): a hazard linked to the new platform brings its controls across
  `awaiting`, which is what SL-07 criterion 2 asks for, and each is confirmed afterwards on the
  assessment screen, one control per act, by this clause and by nothing the workflow adds. So
  no version of this contract offers a bulk confirmation and no workflow of `workflows` 1.0 needs
  one. No other operation of this contract puts a
  control on a platform or takes one off: `linkHazardToPlatform` leaves every one of the
  hazard's controls `awaiting` on the new platform (registry C-015), and `createControl`,
  `linkControlToHazard`, `renameHazard`, `setReportId`, `enterRating`, and `save` change no
  control's state on any platform; `acceptRecovery` and `confirmRestore` change no state
  either, they replace the working body with one whose states are its own (C-013, C-014).
  (REQ-013; SL-04 criterion 4.)

  The hazard's own screen is unchanged by both acts — the control stays one of the hazard's
  controls (DEC-013) — and so is the assessment screen of the same hazard on any other
  platform, and of any other hazard on this platform: after confirming a control here, that
  other screen's `controls` is deep-equal to what it was, so the same control is confirmed on
  one platform and awaiting on another. The ratings are unchanged by both (C-022). (REQ-034
  and, as what this module shows of registry C-013, C-020, C-021 and C-022, REQ-001, REQ-013,
  REQ-058 and REQ-070; HZ-001, HZ-007; SL-03 criterion 3, SL-04 criteria 1, 3 and 4.)
- **C-026 The act carries the profile selected and the platform the screen holds.** Every
  changing `registry` operation this module calls takes an `Act` (registry section 3), and
  this module builds it: `profile` is the `ActiveProfile` `profiles.selectProfile` resolved
  with and never one this module constructs (C-002, C-009), and `madeForPlatformId` is the
  `PlatformId` of the platform the screen the operation was called on holds — the platform
  screen's and the assessment screen's `platform` (C-020, C-022), and, at 8.0, the workflow
  screen's `platform` where its subject is a live platform — and null on every screen
  that holds no platform, which at 8.0 is the hazards, hazard, controls, platforms,
  confirm-edit, references, reference, and workflows screens, and the workflow screen of a
  workflow whose subject is not a live platform. The bow-tie screen added at 9.0 holds a platform
  and offers no changing operation, so no `Act` is built on it (C-002, C-040). It is passed on
  every call and never left off, so no call of this
  module is refused for the field DEC-016 made mandatory (registry C-023, section 4). What it
  decides is whose queue a change lands in and nothing else: an edit made while reading one
  platform does not await that platform's own owner, and an edit made on a hazard's own
  screen, which is platform-independent (C-016), is made for no platform and awaits
  acknowledgement on every platform it reaches (`change-log` C-010, C-029 here). This module
  passes the platform and nothing more about where the user is: it computes no affected
  platform of its own (C-027), reads no queue while making a change, and never asks whether
  the profile performing an act owns the platform it was made for, which no contract requires
  of it.

  A changing `review-schedule` operation takes a `ScheduleAct` (`review-schedule` section 3),
  which is that same `Act` plus `affectedPlatformIds`, and this module builds it the same way:
  `profile` and `madeForPlatformId` exactly as above — null on all three screens a tempo is set
  from — and `affectedPlatformIds` exactly the ids the one `registry.platformsAffected` call of
  C-032 gave for `fields.ref`, in its order, with nothing added, dropped, reordered, or
  defaulted. `review-schedule` holds no link and cannot derive that list (DEC-020), so this
  module is where it is answered; it is the same value the confirm-edit screen listed when the
  act was gated, so what the user was warned about and what then awaits acknowledgement are one
  list and not two derivations that have to agree (C-027; DEC-021). This module never passes an
  `affectedPlatformIds` of its own making, and it makes no second `platformsAffected` call for
  an act it has already gated.

  A changing `reference-register` operation takes an `EntryAct` (`reference-register` section 3),
  which is that same `Act` plus `affectedPlatformIds`, and this module builds it the same way,
  with one difference in where the ids come from: `profile` and `madeForPlatformId` exactly as
  above — `madeForPlatformId` null on both register screens, neither of which holds a platform —
  and `affectedPlatformIds` the union of `registry.platformsAffected(body, ref)` over the entry's
  own `links` as they will be after the act, each id once, ascending as strings, with nothing
  added, dropped, or defaulted (DEC-024). A ref whose `kind` is `report` is not passed to
  `platformsAffected` and adds nothing to the union, because `registry` owns no such kind and
  refuses one rather than answering empty (registry C-024, section 4); every other kind of
  `LINKABLE_KINDS` is one `registry` owns and is passed. For `createReference` the entry has no
  links, so the union is empty and exactly one call is made — none — and the act reaches no
  platform (C-033). For `linkReference` the links are the entry's before the act plus the `ref`
  being linked, so the union is one `platformsAffected` call per such ref and is the same list
  before and after the act, `linkEntry` changing no `hazard-platform` link (C-034). It is the
  same value the confirm-edit screen listed when the act was gated, and the same value
  `reference-register` C-011 puts on the entry it writes, so what the user was warned about and
  what then awaits acknowledgement are one list here too (C-027; DEC-024).

  A changing `workflows` operation takes registry's `Act` itself and no third act shape, because
  `workflows` imports `registry` and derives its own `affectedPlatformIds` from the workflow's
  subject rather than taking one from the caller (`workflows` section 3, DEC-026). So this module
  supplies `profile` and `madeForPlatformId` only: `profile` exactly as above, and
  `madeForPlatformId` the `PlatformId` of the platform the workflow is performed on — the id of
  `workflow.subject` when that is a `{ kind: 'platform', id }`, and null otherwise, which is null
  for a workflow on a hazard and for one whose subject is not yet created. For `startWorkflow`,
  which has no workflow yet, `fields.subject` decides it by that same rule, and C-036 has already
  refused a subject that is not null and not a platform of that screen's own list. It is the
  platform the screen holds, as it is everywhere else: a workflow run on a platform is made for
  that platform, so its own steps do not fill that platform's owner's queue (`change-log` C-010;
  DEC-026). This module passes no `affectedPlatformIds` to `workflows` and makes no
  `platformsAffected` call on its behalf; the one call it does make for a workflow operation is
  C-027's gate, over the same ref `workflows` uses for the entry, which is why the two cannot
  disagree (DEC-027).

  A changing `reports` operation takes registry's `Act` too, and `reports` derives its own
  `affectedPlatformIds` (`reports` C-011), so this module supplies `profile` and
  `madeForPlatformId` only: `profile` exactly as above; `madeForPlatformId` null for
  `createTemplate`, the reports screen holding no platform, and the prepare-report screen's
  `platform.id` for `produceReport`, that screen holding the platform the report is on. A report is
  made for the platform it is on, as a workflow run on a platform is, so producing one does not fill
  that platform's owner's queue (`change-log` C-010; DEC-035). This module makes no
  `platformsAffected` call for either. (DEC-016, DEC-020,
  DEC-021, DEC-024, DEC-026, DEC-027, DEC-035; SL-05 criteria 3 and 4; SL-06 criterion 1; SL-07
  criterion 4; SL-10 criterion 3.)
- **C-027 An edit that reaches more than one platform lists them and waits for the user.**
  The rule this clause has kept since 5.0, stated outright at 8.0: **an operation of this contract
  is gated exactly when the entry its act appends carries two or more platform ids.** The list
  shown is `registry.platformsAffected` of the ref that entry's `affectedPlatformIds` is derived
  from, so what the user is warned about and what then awaits acknowledgement are one derivation
  and not two that have to agree (DEC-017, DEC-021, DEC-024, DEC-026, DEC-027).

  Twelve operations of this contract can change a record, a record's review schedule, a
  reference entry, or a workflow record that more
  than one platform reads:
  `renameHazard`, `addCausalFactor`, `addConsequence`, and `linkControlToHazard` on the hazard
  screen, `retireControl` on the controls screen, `setReviewTempo` on any of the three
  screens it is offered on (C-032, DEC-021), `linkReference` on the entry screen (C-034,
  DEC-024), and `startWorkflow` on the workflows screen with `submitStep`, `advanceStep`,
  `completeWorkflow`, and `abandonWorkflow` on the workflow screen (C-036, C-038, DEC-027).
  Each calls
  `registry.platformsAffected` with the working body before it calls any changing
  operation — once, with `{ kind: 'hazard', id }`, for the four, whose records are that hazard's and
  reach exactly what the hazard reaches (registry C-024); once, with
  `{ kind: 'control', id: controlId }`, for `retireControl`, which is the act's own record; once,
  with `fields.ref` itself, for `setReviewTempo`, whose kind is a `hazard`, a `control`, or a
  `platform` (C-032); for `linkReference`, once per link of an owned kind the entry will
  hold, whose union is the act's `affectedPlatformIds` (C-026, DEC-024); and, for the five
  workflow operations, once with the workflow's `subject` — `fields.subject` for `startWorkflow` —
  and not at all while that subject is null, which is the ref `workflows` derives the workflow
  record's entry from (DEC-026) —
  and then, when those calls gave two or more platform ids between them, resolves with the confirm-edit
  screen: `editing` is the `PendingEdit` for that operation and the values it was given
  (section 3), `affected` is one `AffectedPlatform` per id in the order `platformsAffected`
  gave (ascending as strings, registry C-024) with each `name` from the one
  `registry.listPlatforms` this module makes to name them, and `messages` is empty. No
  changing operation of any module was called, `store.noteChange` was not called, nothing was
  written to the folder or to the browser's storage, and the working body is the one held
  before the call, so the edit is not made and not recorded until the user has been past the
  list. `confirmEdit(app)` then makes exactly the call the gated operation would have made,
  tells `store` (C-012), and resolves with the screen that operation's clause gives, rebuilt
  (C-016, C-017, C-032, C-038); `cancelEdit(app)` resolves with the screen the operation was called on,
  rebuilt from the working body with `messages` empty, and calls no module operation. Neither
  is offered on any other screen, and no other operation is offered on this one (C-002), so
  the list is the only way through and leaving it changes nothing.

  When `platformsAffected` gave one platform id or none, the operation proceeds as its own
  clause says and no confirm-edit screen is shown: a change that reaches one platform or none
  is not an edit that changes more than one. So a `setReviewTempo` whose `fields.ref` is a
  `platform` is never gated, that ref reaching exactly the one platform it names (registry
  C-024), and the platforms screen never leads to the confirm-edit screen; and a
  `createReference` is never gated, a new entry having no links and so reaching nothing (C-026,
  C-033). Of the five workflow operations, `startWorkflow` is likewise never gated in fact — a
  subject that is a platform reaches the one platform it names and one that is null reaches none —
  and nor is any operation of a workflow whose subject is a platform or is not yet created, which
  is four of the five workflow kinds outright and `add-data` until its first step. The gate can
  fire on a workflow only for an `add-data` workflow whose hazard has since been linked to two or
  more platforms, and then it fires on every one of the four operations of that workflow's screen,
  because every one of them appends an entry that reaches those platforms (DEC-026, DEC-027).
  Every other changing
  operation of this contract
  reaches one platform or none by registry C-024 and is never gated — `addHazard` and
  `createControl` reach none, `retireHazard` reaches none because a hazard on any platform
  cannot be retired at all (registry C-026), `createPlatform`, `retirePlatform`,
  `setPlatformOwner`, `linkHazardToPlatform`, `setReportId`, `enterRating`,
  `confirmControlForPlatform`, and `excludeControlFromPlatform` reach the one platform they
  name, and `acknowledgeChange` changes no record any platform reads (C-029). At 10.0
  `createTemplate` reaches none and `produceReport` reaches the one platform the report is on
  (`reports` C-011), so neither is ever gated and neither makes a `platformsAffected` call, which
  keeps the invariant above with no exception: the entry each appends carries no platform id or one.

  The ids listed are the ids the entry the act writes carries: `platformsAffected` of the same
  refs on the body before the act and on the body after it is the same list for every one of the
  twelve — none of the first seven changes a `hazard-platform` link at all, and the one workflow
  step that does, `select-hazards`, is gated on its workflow's subject, which is the platform
  being onboarded, and a `platform` ref reaches the one platform it names whatever links change
  (registry C-024) — and that list is the entry's
  `affectedPlatformIds` — derived by `registry` for the five (registry C-023, C-024), passed
  by this module for `setReviewTempo` and for `linkReference`, where it is literally the same
  value (C-026, DEC-020, DEC-024), and derived by `workflows` from the same ref this module gated
  on for the five workflow operations, which is the one place the value is derived twice and the
  one place it is provably the same derivation of the same ref on the same body (DEC-026,
  DEC-027).
  What the user was warned about is therefore
  exactly what then awaits acknowledgement (`change-log` C-010, C-029 here), which is the one
  thing criteria 3 and 4 cannot be allowed to disagree on. A refusal of the pending call is
  section 4's and is carried on the screen the gated operation was called on, so a blank title,
  a blank text, or a tempo the scales do not carry is told to the user after the list rather
  than before it, and nothing is stored.

  A review schedule is a record of its own kind and not the stored content of the hazard,
  control, or platform it names (DEC-018), so REQ-011's words do not reach `setReviewTempo`;
  the sixth gate is a promise beyond that requirement, taken so that this clause holds without
  an exception and so that where a tempo is stored does not decide what a user is told before
  changing one. DEC-021 records the alternative, which was to leave it ungated. A reference
  entry is a record of its own kind too, and REQ-011 names a hazard, a control, and a
  justification and not a reference, so the seventh gate is a promise beyond the requirement
  on the same ground: a reference linked to a hazard is content that hazard's platforms read,
  and a clause with one exception is a clause every later version has to re-argue. DEC-024
  records that alternative too. A workflow record is a record of its own kind as well, and
  REQ-011 does not name one either; but four of the five workflow operations change the stored
  content of a hazard through the acts their steps make (`workflows` C-013), which REQ-011 does
  name, so the requirement reaches this surface here whatever the workflow record is. Gating all
  five rather than only `submitStep` is the eighth gate taken on the same ground as the sixth and
  the seventh, and on one more: every one of the five appends an entry carrying
  `platformsAffected` of the subject, so leaving `advanceStep` or `abandonWorkflow` ungated would
  put an entry in a platform's acknowledgement queue that the user was never warned about, which
  is the asymmetry this clause exists to prevent. DEC-027 records the alternative.
  The confirm-edit screen carries no `files`: it lists the
  platforms an edit reaches, not the register, and the one entry in `editing` is the edit being
  described rather than an entry being listed (C-035). It carries no workflow progress either,
  for the same reason: the workflow in `editing` is the record the edit is being made on, not a
  workflow being shown (C-037).
  (REQ-011; HZ-006; DEC-016, DEC-021, DEC-024, DEC-027; SL-05 criterion 3; SL-06 criterion 1;
  SL-07 criterion 4; SL-10 criterion 3.)
- **C-028 The history is one screen, complete, and readable by any user.** `openHistory(app)`
  calls `change-log.listEntries` once with the working body and `profiles.listProfiles` once,
  and resolves with the history screen: `entries` is exactly what `listEntries` gave, in its
  order (ascending `createdAtAest` then id, `change-log` C-009), every entry of both kinds and
  none dropped, each carrying its `items` and each item's `fields` as the entry holds them —
  the record's kind and id, what the act did to it, and each field's previous and new value,
  none trimmed, summarised, reordered, or resolved to anything else (`change-log` C-002,
  C-004); `profiles` is every stored profile in profiles C-005's order, which is how an
  entry's `createdBy` is drawn as a name, or as the id itself when no stored profile has it,
  as C-007, C-014, and C-024 name a saver and a confirmer; `messages` is empty. It writes
  nothing, calls no `store` operation, and takes no profile and no platform of its own: the
  screen is the same whoever is reading it and whatever screen they came from, which is what
  makes the history viewable by any user. So every act this module performs is on this screen
  once it is in the working body — a creation, an edit, a deletion, a retirement, and an
  acknowledgement alike — and what a deleted or retired record contained is here whether or
  not it is still shown anywhere else (`change-log` C-004, C-005, C-006). This module shows the
  history and never writes it: it calls no `change-log` operation that appends an entry but
  `acknowledge` (C-029), and it neither filters, groups, nor pages what it was given.
  (REQ-010 and REQ-045 as this module's half, `change-log` C-004, C-005 and C-009 the other,
  reached through registry C-023; HZ-005; SL-05 criteria 1 and 2.)
- **C-029 Every platform the active profile owns has its queue on one screen, and
  acknowledging clears one of them.** `openAcknowledgements(app)` calls
  `registry.listPlatforms` once, `profiles.listProfiles` once, and `change-log.listAwaiting`
  once per platform whose `ownerProfileId` is the active profile's `id`, and resolves with the
  acknowledgement screen: `queues` is one `PlatformQueue` per such platform, in registry
  C-014's order, each carrying that `Platform` and exactly the entries `listAwaiting` gave for
  it, in its order, each entry whole — every record the act changed, with each field's
  previous and new value (`change-log` C-002, C-004, C-010) — and no entry for a platform this
  profile does not own; `profiles` is as C-028's; `messages` is empty. A platform that awaits
  nothing is a `PlatformQueue` with `entries` empty rather than an absent one, and a profile
  that owns no platform gets `queues` empty. Nothing is written and no `store` operation is
  called.

  `acknowledgeChange(app, entryId, platformId)` calls `change-log.acknowledge` once with the
  active profile and those two ids, tells `store` (C-012), and resolves with the
  acknowledgement screen rebuilt from the body it returned: that entry is gone from that
  platform's queue, every other queue on the screen is deep-equal to what it was, and the
  entry itself is still on the history screen (`change-log` C-006, C-011; C-028 here). It is
  called only for a `platformId` the screen has a queue for and an `entryId` that queue holds;
  any other pair resolves with the screen rebuilt and one `warning` message, with
  `change-log.acknowledge` not called (section 4), which is this module's half of who may
  acknowledge — the half `change-log` leaves to its consumer.

  Because the queue is keyed by platform and names no owner (`change-log` C-012), the
  platforms on this screen are decided by `Platform.ownerProfileId` as the working body now
  holds it: after a `setPlatformOwner` (C-018) the incoming owner's screen carries every entry
  the outgoing owner had not acknowledged, in the same order and unchanged, and the outgoing
  owner's screen carries none of them, while anything the outgoing owner did acknowledge stays
  cleared. This module keeps no queue of its own, marks nothing read, and drops no entry for
  its age: an entry is on this screen until it is acknowledged for that platform.
  (REQ-012 and REQ-081 as this module's half, `change-log` C-010, C-011 and C-012 the other;
  HZ-006; SL-05 criteria 4 and 5.)
- **C-030 Retiring takes a thing out of the lists this module offers and off nothing else.**
  `retireHazard(app)` calls `registry.retireHazard` with the hazard the hazard screen holds,
  tells `store` (C-012), and resolves with the hazards screen built from the returned body:
  that hazard is not in `hazards` (registry C-006, C-025), `unsaved` is true, `lastSave` is
  unchanged, and `messages` is empty. When the hazard is linked to any platform `registry`
  rejects it, and this module resolves with the hazard screen as before and one `warning`
  message naming every platform the refusal carries (section 4), having stored nothing: the
  attempt is refused with the platforms named, which is the whole of what this module promises
  about it (REQ-076; SL-05 criterion 6). `retireControl(app, controlId)` and
  `retirePlatform(app, platformId)` are the same act on the controls and platforms screens,
  each resolving with its own screen rebuilt: the control is no longer in `controls` and no
  longer in any `linkableControls` (C-016, C-017), and the platform is no longer in
  `platforms` and so is not opened again (C-018), because each list is `registry`'s of the
  live records (registry C-011, C-014, C-025).

  Retiring takes nothing off a platform. After `retireControl`, every hazard screen still
  lists that control among the hazard's `controls` with the same `controlKind`, and every
  `PlatformRow` and every assessment screen still shows it in the same `state` with the same
  `confirmation` and the same `justification` (C-024; registry C-012, C-019, C-027); after
  `retirePlatform`, every row of that platform is as it was, and its queue is still that
  platform's (`change-log` C-012). So no screen of this module stops showing a control a
  person confirmed for a platform, and none drops a hazard from a platform's list, because a
  hazard on a platform cannot be retired and a control leaves a platform only by C-025's
  exclusion with a reason. No operation of this contract un-retires anything, and none deletes
  a record. (REQ-067 and REQ-076 as what this module shows of registry C-025, C-026 and C-027;
  HZ-001, HZ-004, HZ-005; SL-05 criterion 6.)
- **C-031 Every screen that shows a schedulable record carries that body's review standing,
  from two calls and no rule of this module's own.** Every screen this module shows that shows
  one or more records of a kind in `SCHEDULABLE_KINDS` carries a `reviews` field, built from
  exactly one `review-schedule.listSchedules` and one `review-schedule.listOverdue` of the body
  that screen is built from: `reviews.schedules` is the first call's result and
  `reviews.overdue` the second's, each in the order it was given, neither filtered, reordered,
  trimmed, summarised, joined, nor added to. At 8.0 those screens are the recover, hazards,
  confirm-restore, hazard, controls, platforms, platform, assessment, acknowledge,
  confirm-edit, references, reference, workflows, and workflow screens, and at 9.0 the bow-tie
  screen, which shows a hazard, a platform, and controls (C-039), and at 10.0 the reports screen,
  which lists the platforms a report may be produced on, and the prepare-report screen, which shows
  a platform's hazards and controls as they now are (C-041, C-042), and at 11.0 the filter,
  dashboard, and open-items screens, each of which shows hazards, controls, or platforms (C-045 to
  C-047), and any list, filter, dashboard, or report view a later version
  adds is built the same way. The overdue reviews the dashboard and the open-items screen show are
  entries of that one `reviews.overdue`, selected by ref and never re-derived (C-046, C-047). The two added at 8.0 carry it because both show schedulable
  records: the workflows screen lists the platforms a workflow may be started on, and the
  workflow screen shows the hazard or the platform the workflow is performed on and, where that
  is a platform, every hazard and control of its rows (C-036, C-037). A workflow record is not
  among them: `workflow-record` is outside `SCHEDULABLE_KINDS` and carries no schedule, which
  `workflows` section 7 records as standing at this slice. The folder, check, and profile screens show nothing from a body;
  the restore screen shows kept backups and no record; and the history screen shows entries,
  which say what an act did to a record rather than showing the record as it now is, so a past
  act does not fall due — none of those five carries `reviews`. At 10.0 the report screen joins
  them on the history screen's ground: it shows what a report held when it was produced, which
  says what records were rather than showing them as they now are, and a produced report does not
  fall due; what was past due when it was produced is the report's own `outOfDate` (`reports`
  C-006). That is the whole of the exception list. The out-of-date warning on the prepare-report
  screen is not this clause's flag and is not read from `reviews`: it is `reports.outOfDateFor`,
  which reads the same `review-schedule.listOverdue`, so the two cannot disagree about a record
  (C-042).

  The two screens added at 7.0 are where REQ-023's third kind is answered. `reference-entry` is
  in `SCHEDULABLE_KINDS` and `review-schedule` has scheduled and flagged it since 1.0
  (`review-schedule` C-011), and views 6.0 recorded that no screen showed one and that the
  reference-document half waited for the version adding the register's screens. This is that
  version: a reference entry on either screen carries the tempo, the due date, the last reviewed
  date, and the overdue flag of the entry of `reviews` with its ref, by the same rule as a
  hazard, a control, and a platform, and by no rule of this module's own. No operation of this
  version sets one: `setReviewTempo` keeps C-032's three screens and three kinds, so a reference
  entry's tempo is set over `review-schedule`'s own surface and read back here, as a last
  reviewed date is (C-032; `docs/slices/SL-10.md`, *Out of scope*).

  This module derives nothing about a review. It holds no month arithmetic, no overdue
  boundary, no notion of "past due", and no clock (C-009): the date an overdue flag was decided
  at is the `asAtAest` `review-schedule` put on every `ReviewState` of the one `listOverdue`
  call, and this module neither reads a clock to check it nor compares a `nextDueAest` to
  anything. A record listed on such a screen is shown as overdue exactly when an entry of
  `reviews.overdue` has that record's kind and id, and its tempo, due date, and last reviewed
  date are the entry of `reviews.schedules` with that ref, or none when no entry has one
  (section 3). So "flagged overdue in every list that shows it" is one thing to verify and not
  one per list, as C-020 makes a platform's hazards one query and C-021 makes every band one
  call.

  `reviews` is null exactly when `review-schedule` rejected with `MalformedScheduleError`, which
  it does rather than omitting a schedule it cannot read (`review-schedule` C-004). The screen
  then carries the `error` message section 4 gives, every other field as its own clause says,
  and no review standing at all — never an empty `Reviews`, and never a record shown as having
  no schedule or as not overdue, which is HZ-012's shape. An empty `Reviews` means the body
  holds no live schedule and nothing is overdue, which is a fact and not a failure.

  The body is the screen's own: the recover screen's `reviews` is of the recoverable state's
  body and the confirm-restore screen's of the plan's body, so each says what would be overdue
  in the state the user is being offered rather than in the one they hold; every other screen's
  is of the working body as it is at the moment that screen resolves. Nothing is cached across a
  change or across a screen: a screen built after a `setReviewTempo`, an `acceptRecovery`, a
  `confirmRestore`, or a `completeWorkflow` makes both calls again, and so does every navigation
  of C-015 (section 6). So a review workflow completed through `completeWorkflow` is followed by a
  screen whose `reviews` is read afresh, and the last reviewed dates that completion set, and any
  overdue flag they cleared, are what that screen shows (`workflows` C-006; C-038).
  (REQ-019 and REQ-023 as this module's half, `review-schedule` C-009 and C-010 the other;
  HZ-012; SL-06 criterion 4.) *Mitigation support for HZ-012: the mitigation clause is
  `review-schedule` C-009, and this clause is what every list of this module reaches it by.*
- **C-032 A review tempo is set for one record from the screen that lists it, and nothing else
  about the record changes.** `setReviewTempo(app, fields)` sets the review tempo and the due
  date of exactly one record, named by `fields.ref`. Each of the three screens it is offered on
  offers it for one kind and for the records that screen holds:

  | On | `fields.ref` may name | Shows on resolving |
  |---|---|---|
  | hazard | `{ kind: 'hazard', id }` for the hazard the screen holds, and no other | the hazard screen rebuilt (C-016) |
  | controls | `{ kind: 'control', id }` for an entry of `controls` | the controls screen rebuilt (C-017) |
  | platforms | `{ kind: 'platform', id }` for an entry of `platforms` | the platforms screen rebuilt (C-018) |

  A `ref` outside its screen's row — another kind, or an id that screen does not list — is
  refused with the message section 4 gives, and neither `registry.platformsAffected` nor
  `review-schedule.setSchedule` is called. Otherwise the operation calls
  `registry.platformsAffected` once for that ref, gates on two or more ids (C-027), and, when it
  does not gate, calls `review-schedule.setSchedule` once with the working body, the
  `ScheduleAct` of C-026, and `fields` passed through untouched, then tells `store` (C-012), and
  resolves with its screen rebuilt: `reviews.schedules` holds one schedule for `fields.ref`
  whose `tempoMonths` and `nextDueAest` are the values given (`review-schedule` C-001, C-005,
  C-006), and every other entry of both of `reviews`' lists is deep-equal to what it was
  (`review-schedule` C-002, C-010). Every other field of the screen is deep-equal to what it
  was: setting a tempo changes no hazard, control, platform, link, causal factor, consequence,
  justification, confirmation, or rating, because a schedule is a record of its own kind and no
  changing `registry` operation is called (DEC-018, `review-schedule` C-002). A `save` then
  carries the schedule to the folder with everything else, so `openFolder` and `selectProfile`
  on the same folder afterwards show the same tempo and the same due date (C-006, store C-001;
  SL-06 criterion 1).

  Each call names one `ref`, so this surface has no operation that sets a tempo for a kind, for
  a list, for every hazard on a platform, or by default, and no screen of this module offers
  one: a record has the tempo a person set for it on its own screen or no schedule at all
  (`review-schedule` C-005). The same record has one schedule however many platforms it is
  linked to and however many screens show it, so a tempo set here is the tempo every screen then
  shows (`review-schedule` C-001; C-031 here), as a renamed hazard's title is (C-016).

  No act of this clause sets a last reviewed date, and `review-schedule.completeReview` is the one
  operation of any contract that moves it (`review-schedule` C-007). This module calls it at
  no version: no `setReviewTempo`, no `renameHazard`, no `addCausalFactor`, no `addConsequence`,
  no `linkControlToHazard`, no rating, no confirmation, no exclusion, no retirement, no save,
  and no restore touches it, so editing a record through this surface leaves its
  `lastReviewedAest` deep-equal to what it was, and so does setting a tempo for it
  (`review-schedule` C-006, C-007). Version 6.0 said that nothing a user does on any screen of
  this module sets one, and at 8.0 that is narrowed rather than kept: one operation of this
  contract causes it, `completeWorkflow` of a `review-data` workflow, and it causes it by making
  the one call `workflows.completeWorkflow` makes — which records the call is made for, and
  what platforms each carries, are that contract's and this module derives neither (C-009,
  C-038; `workflows` C-006, DEC-026). Every other operation of every other screen still leaves a
  last reviewed date as it was, which is what keeps SL-06 criterion 3 checkable: a hazard edited
  on its own screen, rated on an assessment screen, or given a tempo here does not read as
  reviewed. (REQ-020 and REQ-022 are `review-schedule` C-005's and this clause is the screen
  they are set on, which this contract does not claim; REQ-015 is `review-schedule`'s and
  `workflows` C-006 is what reaches it; SL-06 criteria 1 and 3.)
- **C-033 The register is one list, and an entry is created with what the user gave, the file
  kept and only its location shown back.** `openReferences(app)` calls
  `reference-register.listEntries` once with the working body and `reference-register.checkEntryFiles`
  once (C-035), and resolves with the references screen: `entries` is every live entry, once
  each, in `reference-register` C-005's order, each with its `name`, `link`, `path`,
  `fileLocation`, and `links` exactly as stored and neither trimmed, normalised, joined, nor
  resolved to anything else; `messages` is empty. An empty register is `entries` empty, which is
  a register with nothing in it and not a standing that could not be read.

  `createReference(app, fields)` calls `reference-register.createEntry` once with the working
  body, the `EntryAct` of C-026, the store the app has open, and `fields` passed through
  untouched, tells `store` (C-012), and resolves with the references screen rebuilt: `entries` is
  the list before plus the entry that call returned, whose `name`, `link`, and `path` are the
  values given once trimmed and null exactly where null was given, so an entry made with one of
  the four alone is shown back with that one and three nulls (`reference-register` C-001; SL-10
  criterion 1). When `fields.file` is not null, that entry's `fileLocation` is the location
  `store.putStoredFile` resolved with, unchanged and opaque here, and no field of the entry and
  no screen of this module holds the file's bytes, its size, its type, or any part of its
  contents: what this surface shows of a carried file is a location and the flag C-035 gives it
  (`reference-register` C-003, C-007; REQ-029 is `store`'s and this is what this module shows of
  it; SL-10 criterion 2). When `fields.file` is null, `fileLocation` is null and nothing is
  written under `files/` at all. A blank field, an entry with none of the four, and a file that
  was not kept are refused with the messages section 4 gives, nothing is stored, and
  `noteChange` is not called, so no entry appears on this screen that is not in the working body.
  `createReference` is never gated: a new entry has no links and reaches no platform (C-026,
  C-027). (REQ-028 as this module's half, `reference-register` C-001 and C-005 the other; SL-10
  criteria 1 and 2.)
- **C-034 An entry's own screen lists everything it is linked to, from the entry's links and
  from no second place, and one act adds one link.** `openReference(app, id)` calls
  `reference-register.getEntry` once with the working body and `id`, `registry.listHazards`,
  `registry.listControls`, and `registry.listPlatforms` once each, and
  `reference-register.checkEntryFiles` once (C-035), and resolves with the reference screen:
  `entry` is what `getEntry` gave; `links` is one `LinkedRecord` per ref of `entry.links`, all of
  them, once each, in `reference-register` C-008's order, each carrying that ref unchanged and
  the name section 3's rule gives it — so everything the entry is linked to is on this screen,
  whatever its kind and whatever became of the record it names (`reference-register` C-009;
  REQ-031; SL-10 criterion 3). An `id` the body has no live entry for resolves with the
  references screen re-listed and one `warning` message whose items name the id.
  `linkableHazards`, `linkableControls`, and `linkablePlatforms` are every live hazard, control,
  and platform, in registry C-006's, C-011's, and C-014's order, less every record a ref of
  `entry.links` already names; each is the picker for `linkReference` and none is a list of what
  the entry is linked to.

  `linkReference(app, ref)` links the entry this screen holds, and no other, to the one record
  `ref` names. A `ref` that is not `{ kind: 'hazard', id }` for an entry of `linkableHazards`,
  `{ kind: 'control', id }` for one of `linkableControls`, or `{ kind: 'platform', id }` for one
  of `linkablePlatforms` is refused with the message section 4 gives, and neither
  `registry.platformsAffected` nor `reference-register.linkEntry` is called. Otherwise the
  operation makes the `platformsAffected` calls C-026 names, gates on two or more ids (C-027),
  and, when it does not gate, calls `reference-register.linkEntry` once with the working body,
  the `EntryAct`, and `{ entryId: entry.id, ref }`, then tells `store` (C-012), and resolves with
  this screen rebuilt: `links` holds the refs it held plus `ref`, in the same order rule, the
  three linkable lists no longer name that record, and `entry`'s `name`, `link`, `path`, and
  `fileLocation` are deep-equal to what they were. Linking copies nothing: no field of the record
  named is stored on the entry, so a hazard renamed afterwards is shown under its new title on
  this screen from the one record (registry C-004; `reference-register` C-008, DEC-023), and the
  hazard's own screen, the control library, and the platforms screen are deep-equal to what they
  were. One entry may be linked to any number of records and one record from any number of
  entries. A second link to a ref the entry already holds is refused (section 4); this surface
  has no operation that unlinks, that links more than one record in a call, or that links an
  entry to another entry, to a causal factor, to a consequence, or to a report, the last three
  being kinds of `LINKABLE_KINDS` that no screen of this version offers and that an entry
  written elsewhere may still hold and this screen still lists. (REQ-030 and REQ-031 as this
  module's half, `reference-register` C-008 and C-009 the other; SL-10 criterion 3.)
- **C-035 Every screen that lists a reference entry carries that register's file standing, from
  one call and no rule of this module's own.** Every screen this module shows that lists one or
  more reference entries carries a `files` field, built from exactly one
  `reference-register.checkEntryFiles` of the body that screen is built from and the folder that
  app has open: `files` is that call's result, in its order, neither filtered, reordered,
  trimmed, joined, nor added to. At 7.0 those screens are the references and reference screens,
  and any list, filter, dashboard, review, or report view a later version adds is built the same
  way. No other screen of this version lists an entry: the confirm-edit screen carries the one
  entry a gated `linkReference` is waiting on inside `editing`, which is the edit being described
  rather than the register being listed, and the history screen shows entries that name a
  reference entry without showing the entry as it now is, so neither carries `files`. At 8.0 the
  two workflow screens join that exception list and for a plainer reason: neither lists a
  reference entry at all. `workflows` imports no `reference-register` and no step of any of the
  five names one, so no workflow record and no workflow screen holds an entry — criterion 2's
  reference-register links come across with an onboarded hazard by not being copied, the links
  being refs on the entry that name no platform (DEC-023; `workflows` C-013), which is a fact
  about what onboarding does not do and not a list this screen shows. At 9.0 the bow-tie screen
  joins the list for the same plain reason: `bowtie` imports no `reference-register` and a
  `Bowtie` holds no reference entry (C-039). At 10.0 the reports, prepare-report, and report screens
  join it for the same reason: a report at `reports` 1.0 includes no reference entry, and none of
  the three lists one (`reports` preamble). At 11.0 the filter screen, whose `entries` lists every
  live reference entry, and the open-items screen, whose `unlinked` lists reference entries linked
  to nothing, join the screens that carry `files`; the dashboard joins the exception list, because
  it names a reference entry only by the `ref` of an overdue `ReviewState` and lists no entry. That
  is the whole of the exception list.

  A reference entry on such a screen is flagged exactly when the entry of `files` with its
  `entryId` has `flagged` true, and is not flagged exactly when that entry has `flagged` false;
  the reason shown is that entry's `reason`, unchanged. This module derives nothing about a
  stored file: it holds no notion of where `files/` is, never opens or lists it, never compares a
  `StoredFileLocation` to a file name, and never treats a null `fileLocation` as a file that has
  gone — an entry that never had a file is `flagged: false` with `reason: null` and is shown as
  an entry with no file (`reference-register` C-010; store C-019). So "flagged wherever it is
  listed" is one thing to verify and not one per list, as C-020 makes a platform's hazards one
  query, C-021 makes every band one call, and C-031 makes every overdue flag one call.

  `files` is null exactly when `reference-register.checkEntryFiles` rejected, which it does only
  when the data folder itself cannot be read (`reference-register` C-010; store C-019). The
  screen then carries the `error` message section 4 gives, every other field as its own clause
  says, and no file standing at all — never an empty `Files`, and never an entry shown as having
  a file that is there. An empty `Files` means the register is empty; a `Files` in which every
  entry is unflagged means every stored file was found. Nothing is cached across a change or
  across a screen: a screen built after a `createReference`, a `linkReference`, an
  `acceptRecovery`, or a `confirmRestore` makes the call again, and so does every navigation of
  C-015, because the answer is a function of the folder's contents at the call and a file put
  back by hand is unflagged on the next screen (store C-019). This is the file half of criterion
  4 and the whole of what any contract answers: an entry's `path` is text a user typed, which no
  module can stat under DEC-003, and what criterion 4 means for a path is an open GATE ruling
  that this version neither closes nor works around (DEC-022; `docs/slices/SL-10.md`).
  (REQ-078 as this module's half, `reference-register` C-010 and store C-019 the other; SL-10
  criterion 4, for the file half only.)
- **C-036 The register of workflows is one list, and one act starts one of the five on the record
  it is performed on.** `openWorkflows(app)` calls `workflows.listWorkflows` once with the working
  body, `registry.listHazards` and `registry.listPlatforms` once each for the names and the
  picker, and `profiles.listProfiles` once, and resolves with the workflows screen: `workflows` is
  one `WorkflowRow` per record that call gave, all of them, once each, in `workflows` C-012's
  order, each carrying that record unchanged and the `subjectName` section 3's rule gives it;
  `platforms` is every live platform in registry C-014's order, which is the subject a workflow
  performed on one is started with; `profiles` is every stored profile in profiles C-005's order,
  which is how a workflow's `createdBy` and `completedBy` are drawn as names, as C-028 draws an
  entry's; `messages` is empty. A workflow in progress and a workflow complete are both on this
  screen and are told apart by `state`; an abandoned one is not on it and its record is still in
  the body, readable through the history (`workflows` C-012; C-028). An empty register is
  `workflows` empty, which is a body that holds no workflow and not a standing that could not be
  read. This module neither filters, groups, sorts, counts, nor pages what it was given, and it
  shows no workflow of its own: every one of the five kinds and every step name on this screen is
  `workflows`' (C-009).

  `startWorkflow(app, fields)` starts one workflow and no more. `fields.subject` must be null, or
  `{ kind: 'platform', id }` for an entry of this screen's `platforms`; any other is refused with
  the message section 4 gives, and neither `registry.platformsAffected` nor
  `workflows.startWorkflow` is called, as C-032 refuses a `ScheduleFields.ref` and C-034 a `ref`
  outside its screen's lists. Otherwise the operation makes the `platformsAffected` call C-027
  names — none while `fields.subject` is null — gates on two or more ids, which for a platform
  subject it cannot reach, and calls `workflows.startWorkflow` once with the working body, the
  `Act` of C-026, and `fields` passed through untouched, then tells `store` (C-012), and resolves
  with that workflow's own screen (C-037): `progress.record` is the record that call returned, at
  the first step of its kind's list, with `state` `'in-progress'`, no entries, and the AEST date
  and profile `workflows` C-001 gives it, and the workflows screen built afterwards lists it.
  Which kinds may be started, and which of them take a subject, are `workflows` C-001's and are
  refused there; this module holds no list of the five and adds none (C-009). A blank or unknown
  kind, or a subject the kind does not take, resolves with this screen as before and the message
  section 4 gives, with nothing started. (REQ-037 as this module's half of the showing,
  `workflows` C-001 and C-002 the other; SL-07 criterion 1.)
- **C-037 A workflow is shown as its steps, what the step it is at still asks, and the record it
  is performed on, each from one call.** `openWorkflow(app, id)` calls `workflows.progressOf` once
  with the working body and `id`, `workflows.stepDemand` once unless the workflow is complete or
  abandoned, `profiles.listProfiles` once, and the one read its subject's kind names — one
  `registry.listPlatformHazards` for a `platform` subject, one `registry.getHazardDetail` for a
  `hazard` subject, and neither while the subject is null — and resolves with the workflow screen:

  - `progress` is exactly what `progressOf` gave: the record, `steps`, `done`, `current`, and
    `remaining`, in that call's order and with nothing filtered, reordered, renamed, or added.
    The current step, the steps done, and the steps remaining criterion 1 asks to be visible are
    those three fields and are read from this one call; this module keeps no step list of any
    kind, counts no step, and computes neither `done` nor `remaining` (C-009; `workflows` C-002).
    That they partition the step list is `workflows`' promise and this clause is that a screen
    carries them; that a user can see them is the drawing's and is verified by demonstration and
    recorded as a review row, as REQ-057 is (DEC-007, DEC-010).
  - `demand` is exactly what `stepDemand` gave, `outstanding` in its order, and is null exactly
    when the workflow is complete or abandoned. Whether a step is satisfied and which records it
    still asks about are derived by `workflows` from the body at the moment of the call and by no
    rule of this module's, so what this screen shows as outstanding and what `advanceStep` refuses
    for cannot disagree (`workflows` C-008).
  - For a subject that is a live platform, `platform`, `rows`, and `omitted` are that one
    `registry.listPlatformHazards` result: `platform` as it gave, `rows` exactly its rows in its
    order each a `PlatformRow` — its row unchanged plus `residualRating` (C-021) — and `omitted`
    exactly its `omitted` in its order, with one `error` message per omitted hazard as C-020
    requires. So a review workflow presents every hazard linked to that platform that is neither
    deleted nor retired, with the controls each carries in the state `registry` gave it (C-024)
    and the residual rating `rating` gave, or lists it as omitted, and never neither and never
    both — which is criterion 3's presentation, reached through the one query every other list of
    a platform's hazards is made from and not through a list of this module's (C-020; HZ-004;
    REQ-008 is `workflows` C-006's).
  - For a subject that is a live hazard, `hazard`, `causalFactors`, `consequences`, and `controls`
    are that one `registry.getHazardDetail` result, in registry C-010's and C-012's orders,
    exactly as the hazard's own screen carries them (C-016).
  - The group its subject is not, and both groups while the subject is null, are null rather than
    empty, which says the workflow is not performed on a record of that kind and never that the
    record is empty. `subjectName` is section 3's rule over whichever group is not null.
  - `linkableHazards` is, at `select-hazards` and only there, every live hazard no entry of `rows`
    and no entry of `omitted` names, in registry C-006's order, from one `registry.listHazards`;
    `linkableControls` is, at `choose-controls` and only there, every live control no entry of
    `controls` names, in registry C-011's order, from one `registry.listControls`. Each is empty
    at every other step, and neither is a list of what the workflow has already done: what a step
    has already recorded is on `progress.record.entries` and what `registry` will refuse is that
    contract's (`workflows` C-004).
  - `profiles` is every stored profile in profiles C-005's order: the owner a platform is named
    or transferred to at `name-the-platform` and `choose-the-owner`, and how each entry's
    `byProfileId` and the record's `createdBy` and `completedBy` are drawn as names.
  - `messages` is empty but for the omitted-hazard messages above.

  An `id` the body has no workflow record for, and one whose record was abandoned, resolve with
  the workflows screen re-listed and the message section 4 gives. A complete workflow is shown
  like any other, with `current` null, `done` the whole step list, `remaining` empty, and `demand`
  null, and the four acts of C-038 refused on it (REQ-039). Every screen this clause resolves
  with is built again from the working body at the moment it resolves, as every screen of C-015
  is, so the step a screen shows is the step the record now holds and never one a previous screen
  showed. (REQ-037 as this module's half, `workflows` C-002 the other, verified by demonstration;
  REQ-008 and REQ-077 are `workflows`' and this is the screen they are read and refused on;
  HZ-004; SL-07 criteria 1, 2, 3 and 5.)
- **C-038 The four acts of a running workflow are each one call to `workflows`, and nothing of
  this module's own.** `submitStep(app, submission)`, `advanceStep(app)`,
  `completeWorkflow(app, fields)`, and `abandonWorkflow(app)` each act on the workflow the screen
  holds and on no other. Each makes the `platformsAffected` call C-027 names, gates on two or
  more ids, and, when it does not gate, calls the `workflows` operation of that name exactly once
  with the working body, the `Act` of C-026, that workflow's id, and `submission` or `fields`
  passed through untouched, then tells `store` (C-012). `submitStep`, `advanceStep`, and
  `completeWorkflow` resolve with this screen rebuilt from the body that call returned;
  `abandonWorkflow` resolves with the workflows screen without that workflow (C-036).

  What each call does is that contract's and none of it is repeated here. This module does not
  decide which step follows which, whether a step's demand is met, which act a step makes, which
  records a completed review sets a last reviewed date on, or what a completed record holds: it
  makes no `registry` and no `review-schedule` call of its own for any of them, and every act a
  step causes is made by `workflows` inside the one call this module made, with the step's entry
  appended in the same call (DEC-025; C-009). So a step this screen shows as recorded is an act
  that happened, and there is no state in which this module made an act a workflow record does
  not name.

  The refusals are the user's to see, on the screen as before, with nothing stored and
  `noteChange` not called (section 4): a submission for a step the workflow is not at, a second
  submission for a record the step has already recorded, an advance while any record the step
  asks about is outstanding — which at `settle-the-ratings` is REQ-077's refusal, naming each
  hazard whose residual the user has not confirmed or re-entered, and at `review-the-hazards` is
  criterion 3's — an outcome that is blank, a completion before the last step, and every changing
  act on a workflow whose `state` is `'complete'`, which is criterion 4's "the attempt is refused"
  and is refused by `workflows` having no operation that would make it rather than by a check this
  module remembers (REQ-039, P2). A completion whose acts reject leaves the workflow at
  `record-the-outcome` with nothing made, because a completion is all of its acts or none
  (`workflows` C-009), and this module resolves with the screen as before and the error named.

  Nothing on this surface un-abandons a workflow, edits an entry of one, goes back a step, or
  reaches a step's act by any second route: the acts a step makes are `registry`'s and
  `review-schedule`'s and are offered on their own screens for use outside a workflow, which is
  two surfaces onto the same acts and not two implementations of them (DEC-025, registry C-023).
  `abandonWorkflow` undoes nothing: a hazard the workflow created is still there with its global
  ID, a control it confirmed is still on its platform, a rating it re-entered still holds the
  values entered, and each is in the history with the entry its own module wrote — which is the
  reading of SL-07's partial-failure note `workflows` C-012 records, and a rollback is reachable
  through no contract of this project. (REQ-038 and REQ-039 as `workflows` C-005 and C-011's,
  reached from here; REQ-008 and REQ-077 as `workflows` C-006 and C-008's; SL-07 criteria 1, 2,
  3, 4 and 5.)
- **C-039 A bow-tie is shown from one `bowtie.bowtieFor` and one `bowtie.renderBowtieSvg` of the
  working body, generated when its screen is built and kept nowhere.** `openBowtie(app)` calls
  `bowtie.bowtieFor` once with the working body and the ids of the `hazard` and the `platform` the
  assessment screen holds, `bowtie.renderBowtieSvg` once with the value it resolved with, and
  C-031's two reads, and resolves with the bow-tie screen: `bowtie` is exactly what `bowtieFor`
  gave and `svg` is exactly what `renderBowtieSvg` gave, neither trimmed, edited, re-serialised,
  nor added to; `messages` is empty. So the causal factors, consequences, preventative controls,
  and mitigating controls on this screen, and the state of each control, are the ones `bowtie`
  C-001 reads from `registry` for that body, and the nodes of `svg` are the ones `bowtie` C-004
  marks for them; this module draws no bow-tie of its own, and the page draws `svg` and no other
  drawing of the pair, which is verified by demonstration and recorded as a review row (DEC-010).
  A hazard or a platform `bowtie` refuses is no bow-tie screen, and the user is told why
  (section 4): a bow-tie is never shown in part (`bowtie` C-002; HZ-011).

  Nothing is kept. `openBowtie` and `back` from the bow-tie screen write nothing to the data folder
  or the browser's storage, call no `store` operation, and change no working body, and no screen
  of this module holds a `Bowtie` or a `BowtieSvgText` beyond the bow-tie screen that carries it:
  every `openBowtie` makes both calls again on the working body as it then is, so a hazard renamed,
  a causal factor or consequence added, a control linked, or a control confirmed or excluded
  before it is on the bow-tie shown after it (C-015; `bowtie` C-001, C-003; REQ-059; SL-08
  criterion 2). No rating is on this screen: the ratings of the pair are the assessment screen's
  (C-021, C-022), which is the reading `bowtie` 1.0's preamble took and which awaits jay-pryor's
  ruling. (REQ-018 and REQ-059 as this module's half, `bowtie` C-001 to C-006 the other; HZ-011;
  SL-08 criteria 1 and 2.)
- **C-040 An export writes the drawing the screen shows, generated again, to the file the user
  chose, and changes nothing else.** `exportBowtie(app, target)` calls `bowtie.bowtieFor` once
  with the working body and the pair the bow-tie screen holds, `bowtie.renderBowtieSvg` once with
  what it gave, and then `store.writeExportFile` once with `target` and exactly the text
  `renderBowtieSvg` resolved with, and resolves with the bow-tie screen built from those same two
  results and C-031's two reads: its `svg` is the text written, byte for byte as `store` C-020
  writes it, and `messages` is empty. The export is generated rather than copied from the screen,
  so REQ-059's "each time it is exported" holds; and it is the same drawing as the one shown,
  because nothing offered on the bow-tie screen changes the working body and `bowtie` C-010 gives
  one document for deep-equal arguments, so `svg` after `exportBowtie` is identical to `svg`
  before it. The set of nodes in the file is therefore the set on the screen, which a conformance
  test checks by comparing the in-memory target's contents with the screen's `svg` (SL-08
  criterion 3). `chooseExportTarget(app)` calls `store.chooseExportFile` once and then does what
  `exportBowtie` does with the handle it resolved with; which name is suggested to the picker is
  not promised.

  An export is not a change: `store.noteChange` is not called, `platformsAffected` is not called
  and no gate is shown, no entry is appended to the history, the working body is the one held
  before the call, and nothing under the data folder or in the browser's storage is written
  (store C-009, C-020; C-002, C-012). `target` is used for that one write and kept nowhere, so a
  second export asks again. A bow-tie that `bowtie` refuses is not exported and `writeExportFile`
  is not called; a write that did not complete leaves `target` as it was and resolves with the
  bow-tie screen and the message section 4 gives. (REQ-060, allocated to this module at 9.0;
  REQ-059's exported half; SL-08 criterion 3; DEC-030, DEC-031.)
- **C-041 The reports screen lists every template and report, and a template is saved from it.**
  `openReports(app)` calls `reports.listTemplates` and `reports.listReports` once each with the
  working body, `registry.listPlatforms` once, and C-031's two reads, and resolves with the reports
  screen: `templates` is exactly what `listTemplates` gave and `reports` exactly what `listReports`
  gave, each in its order and neither filtered, grouped, sorted, nor added to; `platforms` is every
  live platform in registry C-014's order, which is what a report may be produced on; `messages` is
  empty. An empty `templates` or `reports` is a body that holds none, not a list that could not be
  read (section 4).

  `createTemplate(app, fields)` calls `reports.createTemplate` once with the working body, the
  `Act` of C-026, and `fields` passed through untouched, tells `store` (C-012), and resolves with
  the reports screen rebuilt: `templates` is the list before plus the template that call returned,
  whose `name` and `title` are the values given trimmed and whose `sections` are the sections given
  in the same order (`reports` C-001). A blank name or title, and sections without exactly one place
  for the hazards, are refused by `reports` with the message section 4 gives, and nothing is stored.
  A saved template is in the working body like any other record, so a `save` carries it to the
  folder and `openFolder` and `selectProfile` on the same folder afterwards list it again (C-006;
  store C-001) — which is REQ-046's "save". `createTemplate` is never gated: a template reaches no
  platform (C-027). (REQ-046 as this module's half, `reports` C-001 the other; SL-09 criterion 1.)
- **C-042 Before a report is produced the user sees the hazards it will hold and every record it
  would use that is past its review due date, and the report is produced only past that list.**
  `beginReport(app, { templateId, platformId })` prepares a report from a template of the reports
  screen's `templates` on a platform of its `platforms`; either id outside those lists is refused
  with the message section 4 gives, and nothing is called. Otherwise it calls
  `reports.getTemplate` once with the working body and `templateId`,
  `registry.listPlatformHazards` once for `platformId` (C-020), `rating.ratingFor` once per row
  (C-021), `reports.outOfDateFor` once for `platformId`, and C-031's two reads, and resolves with the
  prepare-report screen: `template` is what `getTemplate` gave; `platform`, `rows` — each a
  `PlatformRow`, its row unchanged plus `residualRating` — and `omitted` are that query's, in its
  order; `outOfDate` is exactly what `outOfDateFor` gave, in its order, neither filtered nor added
  to; and `messages` is, first, when `outOfDate` is not empty, the one out-of-date warning section 3
  describes, whose items name every record of `outOfDate` and each one's last reviewed date, and
  then one `error` message per omitted hazard as C-020 gives. When `outOfDate` is empty there is no
  warning at all: no message, no item, and nothing on the screen says the data is out of date. So
  the user is warned before producing a report exactly when a record it would use is past its review
  due date, and is shown each such record's last reviewed date, and is never warned otherwise; which
  records those are is `reports` C-006's and `review-schedule` C-009's, and this module holds no
  clock, no due-date rule, and no list of its own (C-009). Nothing is written, and no `store`
  operation is called. That the page draws the warning where the user sees it before producing is
  verified by demonstration (DEC-010).

  `produceReport(app, bowtieHazardIds)` produces the report this screen prepares. Each id must be
  the `hazard.id` of a row of `rows`, once; any other, or a repeat, is refused with the message
  section 4 gives, and nothing is called. Otherwise it calls `reports.produceReport` once with the
  working body, the `Act` of C-026, and `{ templateId: template.id, platformId: platform.id,
  bowtieHazardIds, acknowledgedOutOfDate }`, where `bowtieHazardIds` is passed untouched and
  `acknowledgedOutOfDate` is the `ref` of each record of this screen's `outOfDate`, in its order,
  and nothing else; tells `store` (C-012); and resolves with the report's own screen for the report
  that call returned (C-043). So the list `reports` requires back is literally the list the user was
  shown. When the list has changed since this screen was built — the clock has crossed a due date,
  or the body differs — `reports` refuses and nothing is produced, and this module resolves with the
  prepare-report screen rebuilt as `beginReport` gives it, whose warning is the list as it now is;
  the user may produce again from that screen. No report is produced through this surface from data
  past its review due date without the warning for exactly that data having been on the screen the
  act was made from, and none with a warning the data does not call for. The report holds every
  hazard of `rows` with its controls and residual rating and every hazard of `omitted` as omitted,
  and the bow-tie of each hazard named as drawn at that moment, which are `reports` C-004 and C-005
  over the same query this screen showed. `produceReport` is never gated: a report reaches the one
  platform it is on (C-027). `back` resolves with the reports screen rebuilt, and nothing is
  produced. (REQ-016 as this module's half, `reports` C-006 the other; REQ-007 and REQ-061 as what
  this module shows of `reports` C-004 and C-005; HZ-009; SL-09 criteria 2, 3 and 5; DEC-034,
  DEC-035.)
- **C-043 A report's screen shows what it includes, read from the report, and downloads it in
  either form.** `openReport(app, id)` for a report of the reports screen's `reports` calls
  `reports.getReport` once with the working body and `id` and `reports.includesOf` once with what it
  gave, and resolves with the report screen: `report` is exactly what `getReport` gave and
  `includes` exactly what `includesOf` gave; `messages` is empty. So the hazards, platforms, and
  controls a report includes are shown from the report as it was produced — `includes` naming them
  by id and `report` carrying the name, title, state, and residual values of each as they were then
  — and never from the records as they now are: a hazard renamed or retired, or a control excluded,
  since the report was produced leaves this screen deep-equal to what it was (`reports` C-003,
  C-007). The screen reached by `produceReport` is built the same way from the report that call
  returned. An id with no report resolves with the reports screen re-listed and the message section
  4 gives. It carries no `reviews` and no band (C-021, C-031).

  `exportReport(app, target, format)` calls `reports.getReport` and `reports.includesOf` once each
  as `openReport` does, then `reports.renderReportHtml` once with that report when `format` is
  `html` or `reports.renderReportMarkdown` once when it is `markdown`, then
  `store.writeExportFile` once with `target` and exactly the text that call resolved with, and
  resolves with the report screen built from those reads, `messages` empty. A `format` outside the
  two is refused with nothing called. The document is drawn from the stored report and not from the
  working body, so the same report downloaded twice in one form writes the same text, whatever has
  changed in the body between (`reports` C-008). `chooseReportExportTarget(app, format)` calls
  `store.chooseExportFile` once and then does what `exportReport` does with the handle it resolved
  with; which name is suggested to the picker is not promised. A download is not a change:
  `store.noteChange` is not called, no gate is shown, no entry is appended, the working body is the
  one held before the call, and nothing under the data folder or in the browser's storage is written
  (store C-009, C-020; C-002, C-012). `target` is used for that one write and kept nowhere. This is
  the reading `reports`' preamble records of SL-09's "offered to the user as a browser download".
  (REQ-027 as this module's half, `reports` C-007 the other; SL-09 criterion 4 and its G3 decision;
  DEC-030, DEC-035.)
- **C-044 A hazard's own screen shows every platform it is linked to, that hazard's controls on
  each, and every report that includes it.** Every hazard screen this module resolves with — from
  `openHazard`, from each changing operation of the hazard screen, from `back` to it, and from
  `confirmEdit` and `cancelEdit` to it — calls `registry.platformsAffected` once with the working
  body and `{ kind: 'hazard', id }` for the hazard the screen holds, `registry.listPlatformHazards`
  once for each platform id that call gave, in its order, and `reports.reportsIncluding` once with
  the working body and that same ref. `platforms` is one `HazardOnPlatform` per id, in
  `platformsAffected`' order: `platform` is that platform's query result's `platform`; and `controls`
  is the `controls` of the row of that result whose `hazard.id` is this hazard's, unchanged and in
  its order, with `omitted` null — or, when that result names this hazard in `omitted` instead,
  `controls` is null and `omitted` is that entry, and the screen's `messages` carry one `error`
  message for it, after any other message the operation gives, whose items are the hazard's id, the
  omitting record's key, and the platform's name. The platforms listed are exactly those a live
  `hazard-platform` link joins the hazard to, a retired platform included, which is registry C-024's
  derivation for a hazard and no list of this module's, and each platform's controls are this
  hazard's row of the one query every list of that platform's hazards is made from, so what this
  screen says a control is on a platform is what the platform's own screen and its assessment screen
  say (C-020, C-024). `reports` is exactly what `reportsIncluding` gave, in its order: every live
  report that carries this hazard as a row, and no report that lists it only as omitted (`reports`
  C-007). Nothing is written. This is not a list of a platform's hazards — it takes one row of each
  platform's query — and it is not a second derivation of a platform's controls. The workflow
  screen's hazard group is C-016's four fields and does not carry these two (C-037). (REQ-026;
  `reports` C-007 for its third part; SL-09 criterion 4.)
- **C-045 Hazards and controls are filtered by platform, band, record status, control state, and
  reference entry, and a filtered list is the unfiltered list less what fails a filter.**
  `openFilter(app)` calls `registry.listAllHazards`, `listAllControls`, and `listAllPlatforms`
  once each, `registry.listPlatformHazards` once for each platform `listAllPlatforms` gave, in its
  order, `rating.ratingFor` once per row of each (C-021), `reference-register.listEntries` once,
  C-035's one read, and C-031's two, and resolves with the filter screen: `filter` has every value
  null; `platforms` is exactly what `listAllPlatforms` gave and `entries` exactly what
  `listEntries` gave, which are what a platform filter and a reference-entry filter are chosen
  from; `hazards` and `controls` are the unfiltered lists below; and `messages` is one `error`
  message per hazard a query named as omitted, in platform order then that query's order, whose
  items are the hazard's id, the omitting record's key, and the platform's name (C-020).

  The unfiltered `hazards` is, for each hazard of `listAllHazards` in its order, one `HazardItem`
  for each platform whose query has that hazard in `rows` or in `omitted`, in `listAllPlatforms`'
  order, and one `HazardItem` with `platform` null when no query has it. So a live hazard linked to
  a platform is listed against that platform, from the one query (C-020), once per platform it is
  on; and a retired or deleted hazard, which no query shows (registry C-019), is listed against no
  platform, whatever links it still has. The unfiltered `controls` is, for each control of
  `listAllControls` in its order, one `ControlItem` for each row, of any platform's query, whose
  `controls` include an entry for that control, in the order of the row's hazard in
  `listAllHazards` then of its platform in `listAllPlatforms`, and one `ControlItem` with
  `platform` null when no row includes it. A retired control is on the rows it was on (registry
  C-027), so it is listed against them in the state it has there. A hazard a query omitted has no
  controls read on that platform, so no control is listed against it there; its message says so.

  `applyFilter(app, filter)` refuses a value outside the screen's own lists and the named values
  (section 4); otherwise it makes the reads `openFilter` makes and resolves with the filter screen
  rebuilt, `filter` as given, and `hazards` and `controls` each exactly the items of the unfiltered
  list, in the same order, that satisfy every filter whose value is not null:

  | Filter | A `HazardItem` satisfies it when | A `ControlItem` satisfies it when |
  |---|---|---|
  | `platformId` | `platform` is not null and its `id` is the value | `platform` is not null and its `id` is the value |
  | `band` | `residualRating` is not null and its `band` is the value | `residualRating` is not null and its `band` is the value |
  | `recordStatus` | `hazard.status` is the value | `control.status` is the value |
  | `controlState` | never: a hazard has no control state, so `hazards` is empty | `platformControl` is not null and its `state` is the value |
  | `referenceEntryId` | the entry of `entries` with that id has a `links` ref of kind `hazard` and `hazard.id` | that entry has a `links` ref of kind `control` and `control.id` |

  So with no filter active each list is the unfiltered one; each filtered list is a sub-sequence
  of the unfiltered one; every item in it satisfies every active filter; the five filters apply
  singly and in any combination; and applying the same filter to the same body twice resolves with
  deep-equal screens. A reference-entry filter matches only what the entry links to directly, not a
  control on a hazard the entry names nor anything on a platform it names, and a band filter
  matches only an item listed against a row, because a band is a hazard's residual on the platform
  it is listed against and a control's is that of the row it is on (`docs/slices/SL-11.md`,
  criterion 1). Nothing is written, no `store` operation is called, and the filter is held by
  this screen only: `back` and `openFilter` again show no filter active. (REQ-047 as this module's,
  over registry C-019 and C-030 and `reference-register` C-005; SL-11 criterion 1; DEC-037.)
- **C-046 A user's dashboard shows the open items of each live platform that user owns, and of
  no other.** `openDashboard(app)` calls `registry.listPlatforms` and `profiles.listProfiles` once
  each; for each platform `listPlatforms` gave whose `ownerProfileId` is the active profile's
  `id`, in its order, `registry.listPlatformHazards` once and `change-log.listAwaiting` once;
  `workflows.listWorkflows` and `reference-register.listEntries` once each; and C-031's two reads.
  It resolves with the dashboard: `platforms` is one `PlatformItems` per such platform, in that
  order, whose
  - `overdue` is the entries of `reviews.overdue`, in its order, whose `ref` has the kind and id of
    a ref in that platform's review set (section 3): the platform itself, every hazard its query
    names in `rows` or `omitted`, every control of those rows, and every live reference entry
    linked to any of them; and is null when `reviews` is null or `listEntries` rejected;
  - `unconfirmed` is, for each row of the query in its order, each of its `controls` in its order
    whose `state` is `awaiting`, beside the row's hazard; a control `confirmed` or `excluded` is not
    in it, an exclusion being a ruling a person made (C-024; `docs/slices/SL-11.md`);
  - `omitted` is exactly the query's `omitted`, with the messages C-020 gives, since what a hazard
    omitted there has awaiting or overdue cannot be read and is never shown as nothing;
  - `workflows` is every record `listWorkflows` gave, in its order, whose `state` is `in-progress`
    and whose `subject` is `{ kind: 'platform', id }` of that platform; and
  - `awaiting` is exactly what `listAwaiting` gave for it (C-029).

  `profiles` is every stored profile in profiles C-005's order, how an entry's `createdBy` is drawn;
  `messages` is one `error` per omitted hazard, in platform order then query order. Nothing on this
  screen belongs to another user: a platform another profile owns has no `PlatformItems`, and
  nothing is selected from its query, its queue, or its workflows, so a hazard or a reference entry
  on two platforms is on this dashboard only under the platform this profile owns. A workflow on a
  hazard, or with no subject yet, and a retired platform are on no dashboard, as a retired
  platform's queue is on no acknowledgement screen (C-029). Every value is selected by equality from
  what its contract gave: no overdue flag, state, entry, or workflow is derived here (C-009). Nothing
  is written, and the dashboard is built afresh each time it is shown, so an act on any screen is on
  the next dashboard. (REQ-049 as this module's; SL-11 criterion 2; DEC-037.)
- **C-047 The open-items view shows every open item whatever its owner, apart from the dashboard.**
  `openOpenItems(app)` makes the reads C-046 makes, for every platform `registry.listPlatforms`
  gives rather than the owned ones, plus `registry.listHazards` once for the names below, C-035's
  one read, and C-048's reads, and resolves with the open-items screen: `platforms` is one
  `PlatformItems` per live platform, in registry C-014's order, each built exactly as C-046 builds
  one, whatever its `ownerProfileId`, so a platform's `PlatformItems` here is deep-equal to the one
  its owner's dashboard shows on the same body; `unplaced.overdue` is the entries of
  `reviews.overdue`, in its order, whose `ref` is in no live platform's review set, and null when
  any platform's `overdue` is null; `unplaced.workflows` is one `WorkflowRow` (C-036's rule, over
  `listHazards` and `listPlatforms`) per record of `listWorkflows`, in its order, whose `state` is
  `in-progress` and whose `subject` is not a live platform — a hazard, a retired platform, or none
  yet; `unlinked` is C-048's; `profiles` as C-046's; `messages` as C-046's over every live platform.

  So every open item of every kind REQ-049 and REQ-068 name is on this one screen: every overdue
  review is in a live platform's `overdue` or in `unplaced.overdue`, every `awaiting` control and
  every unacknowledged change of every live platform is in its `PlatformItems`, every workflow in
  progress is in a live platform's `workflows` or in `unplaced.workflows`, and every live record
  linked to nothing is in `unlinked`. It is a screen kind of its own, reached by its own operation,
  filtered by no profile, and it shares no field with the dashboard beyond the shape of a
  `PlatformItems`. A retired platform's queue and awaiting controls are not on it, as C-029 keeps
  them off the acknowledgement screen. Nothing is written. (REQ-066 as this module's; SL-11
  criterion 3; DEC-037.)
- **C-048 A live hazard, control, platform, or reference entry linked to nothing is flagged as an
  open item, and a link or a retirement clears the flag.** `unlinked` on the open-items screen is,
  in this order, each hazard of `registry.listHazards` (C-006's order), each control of
  `registry.listControls` (C-011's), each platform of `registry.listPlatforms` (C-014's), and each
  entry of `reference-register.listEntries` (its C-005's) that is linked to nothing, once each, as
  an `UnlinkedRecord`. A record is linked exactly when one of these holds:

  | Record | Linked when |
  |---|---|
  | hazard | `registry.listLinks` of `{ kind: 'hazard', id }` gives a link whose `linkKind` is `hazard-control` or `hazard-platform`; or `registry.getHazardDetail` gives it a causal factor or a consequence |
  | control | `registry.listLinks` of `{ kind: 'control', id }` gives a `hazard-control` link |
  | platform | `registry.listLinks` of `{ kind: 'platform', id }` gives a `hazard-platform` link |
  | reference entry | its own `links` is not empty |
  | any of the four | an entry of `listEntries` has a `links` ref of the record's kind and id; or a record of `workflows.listWorkflows` whose `state` is `in-progress` has a `subject` of the record's kind and id |

  A link counts by its own status and never by the status of the record at its other end (registry
  C-031): a control whose only `hazard-control` link names a retired or deleted hazard is linked,
  and so is a platform whose only `hazard-platform` link names a deleted hazard. A
  `control-platform` link is not consulted: one exists only over a live `hazard-control` link and a
  live `hazard-platform` link of the same ids (registry C-013), and no operation of any contract
  ends either, so it could change no answer. A complete or abandoned workflow does not link its
  subject. Only live records are listed, so a retired record and a deleted one are never flagged
  (`docs/slices/SL-11.md`); a reference entry is live at every version of `reference-register` to
  date, nothing there setting another status.

  The flag clears by the acts that make one of those hold, each on its own screen:
  `linkControlToHazard`, `linkHazardToPlatform`, `addCausalFactor`, `addConsequence`,
  `linkReference`, `createReference` with links (none at `reference-register` 1.0), and
  `startWorkflow` on the record; and by `retireHazard`, `retireControl`, and `retirePlatform`, which
  take the record out of the live lists (C-030). The next open-items screen shows it: nothing is
  cached (section 6). A record linked only by a workflow in progress is flagged again once that
  workflow is complete or abandoned. `unlinked` is null, never empty, when any read of this clause
  rejects (section 4). (REQ-068 as this module's, over registry C-010, C-031 and
  `reference-register` C-005; SL-11 criterion 4; DEC-037.)

Ordering: screens as C-001 and C-015; `profiles` in profiles C-005's order; `hazards` and
`linkableHazards` in registry C-006's; `controls` on the controls screen and
`linkableControls` in registry C-011's; `platforms` in registry C-014's; a hazard's
`causalFactors`, `consequences`, and `controls` in registry C-010's and C-012's; `rows`,
`omitted`, and an assessment's `controls` in registry C-019's; `backups` newest first (store
C-014); `entries` on the history screen and the `entries` of every queue in `change-log`
C-009's and C-010's order, ascending `createdAtAest` then id; `queues` in registry C-014's
order and `affected` in `platformsAffected`' order (C-027, C-029); `messages` in the order
each clause and row gives: check failures in `checkFolder`'s
order; omitted hazards in `listPlatformHazards`' order; the platforms of a refused retirement
in the order the error carries them; a supersession before a mirror error;
a mirror error before a backup error; `reviews.schedules` and `reviews.overdue` in
`review-schedule` C-001's and C-010's order, ascending `nextDueAest` then the schedule's id
(C-031); `entries` and `files` in `reference-register` C-005's order, ascending `createdAtAest`
then id, and `files` one per entry of `entries` in that same order (C-033, C-035); an entry's
`links` in `reference-register` C-008's order, ascending kind then id as strings (C-034);
`linkableHazards`, `linkableControls`, and `linkablePlatforms` in registry C-006's, C-011's, and
C-014's order (C-034); `workflows` on the register of workflows in `workflows` C-012's order,
ascending `createdAtAest` then id, and each row's `workflow.entries` in the order that contract
appended them (C-036); a workflow's `steps`, `done`, and `remaining` in `WORKFLOW_STEPS`' order
for its kind, and `demand.outstanding` in `workflows` C-008's order, ascending as strings within
a kind, all four as `progressOf` and `stepDemand` gave them (C-037); a workflow screen's `rows`
and `omitted` in `listPlatformHazards`' order and its `causalFactors`, `consequences`, and
`controls` in registry C-010's and C-012's, as the platform and hazard screens carry them
(C-020, C-016); and a bow-tie screen's `bowtie` lists in `bowtie` C-001's order, which is
registry's (C-039); `templates` and `reports` on the reports screen in `reports`' order, ascending
`createdAtAest` then id (C-041); a prepare-report screen's `rows` and `omitted` in
`listPlatformHazards`' order and its `outOfDate` in `reports.outOfDateFor`'s, which is
`review-schedule.listOverdue`'s, with its warning before its omitted-hazard messages (C-042); a
report screen's `report` and `includes` in `reports`' own orders (C-043); and a hazard screen's
`platforms` in `registry.platformsAffected`' order, ascending as strings, each platform's `controls`
in its row's order, `reports` in `reports.reportsIncluding`' order, and its omitted-platform
messages in `platforms`' order (C-044); a filter screen's `hazards` by hazard in
`listAllHazards`' order then platform in `listAllPlatforms`' order with the item against no
platform last, `controls` by control in `listAllControls`' order then the row's hazard then its
platform with the item against no row last, `platforms` and `entries` in those calls' orders, and
its omitted-hazard messages in platform order then query order (C-045); a dashboard's and an
open-items screen's `platforms` in registry C-014's order, each `overdue` and `unplaced.overdue` in
`reviews.overdue`'s, `unconfirmed` in row then control order, `workflows` and `unplaced.workflows`
in `workflows` C-012's, and `awaiting` in `change-log` C-010's (C-046, C-047); and `unlinked`
hazards, then controls, then platforms, then reference entries, each in its list's order (C-048).
Idempotency: `start` twice gives two independent apps; `save` twice with no one else in
between writes twice and says nothing the second time (C-007); `openFolder` twice on one
app rejects the second time (C-002); opening the same folder again shows the same check
screen while the file still fails (C-010); `beginRestore` then `cancelRestore` leaves the
hazards screen as it was but for `messages`; every navigation of C-015 is harmless and
resolves with the same screen while the working body is the same; `enterRating` twice with
the same values leaves the screen deep-equal but for what registry C-017 restamps;
`linkControlToHazard`, `linkHazardToPlatform`, and `confirmControlForPlatform` fail the second
time (section 4), as does a second `excludeControlFromPlatform`; confirming a control this
screen shows as `excluded`, and excluding one it shows as `confirmed`, each succeed and leave
it in the other state (registry C-021). From 5.0 a second `renameHazard`, `setReportId`,
`enterRating`, or `setPlatformOwner` with the value already stored resolves with an `info`
message and changes nothing (registry C-029), rather than restamping the record and recording
a second act; `openHistory` and `openAcknowledgements` are harmless and, on the same body,
resolve with deep-equal screens; a second `acknowledgeChange` over the same entry and platform
fails (section 4); a second `retireHazard`, `retireControl`, or `retirePlatform` of the same
record cannot be reached from the screen the first left, and reaching it anyway fails
(section 4); a gated operation repeated on the confirm-edit screen rejects with
`WrongScreenError`, and so does a `confirmEdit` or `cancelEdit` after the first, because
neither belongs to the screen it resolves with (C-002, C-027). From 6.0 a second
`setReviewTempo` with the tempo and the due date already stored resolves with an `info` message
and changes nothing (`review-schedule` C-013), as a second `renameHazard` does; with either
value changed it succeeds and leaves one schedule for that record (`review-schedule` C-001).
Every screen of C-031 is built from two reads that write nothing, so building the same screen
twice on the same body resolves deep-equal unless the clock has crossed a due date in between,
which is the flag doing its job (`review-schedule` C-009). From 7.0 `openReferences` and
`openReference` are harmless and, on the same body and the same folder, resolve with deep-equal
screens; `createReference` is not idempotent by design, two calls with equal fields giving two
entries with two ids and, when a file was given, two files at two locations
(`reference-register` C-001; store C-018), which is the one place on this surface where a
repeated call is a second record rather than an `info` message; and a second `linkReference` of
the same ref on the same entry fails (section 4), as a second `linkControlToHazard` does. Every
screen of C-035 is built from a call that writes nothing, so building the same screen twice on
the same body resolves deep-equal unless a stored file has gone or come back in between, which
is that flag doing its job (store C-019). From 8.0 `openWorkflows` and `openWorkflow` are harmless
and, on the same body, resolve with deep-equal screens; `startWorkflow` is not idempotent by
design, two calls with equal fields giving two workflow records with two ids, which is two runs
and not a repeat (`workflows` C-001), as `createReference` gives two entries; a second
`submitStep` with the same submission fails (section 4); two `advanceStep` calls move two steps,
and one at the last step resolves with an `info` message and moves nothing; a second
`completeWorkflow`, and an `abandonWorkflow` after a completion, fail with the refusal criterion 4
asks for, which is what makes a completion's acts unrepeatable — `review-schedule.completeReview`
is not idempotent and would advance a due date twice, and this is the surface that cannot reach it
twice through one workflow (`workflows` C-011 and its idempotency section); and a second
`abandonWorkflow` cannot be reached from the screen the first left, and reaching it anyway fails
(section 4), as a second `retireHazard` does. From 9.0 `openBowtie` is harmless and, on the same
body, resolves with a deep-equal screen whose `svg` is the identical string (`bowtie` C-010);
`exportBowtie` twice to the same target writes the same text twice and leaves the file as one
export would (store C-020), resolving with deep-equal screens and no message the second time,
because an export is not a change and records nothing (C-040). From 10.0 `openReports`,
`beginReport`, and `openReport` are harmless and, on the same body, resolve with deep-equal screens,
`beginReport` unless the clock has crossed a due date in between, which is the warning doing its job
(C-042); `createTemplate` twice with equal fields gives two templates and `produceReport` twice from
the same prepare-report screen cannot be reached, because the first leaves it for the report screen
and `back` from there goes to the reports screen — a second report is a second `beginReport` and is a
second record, not a repeat (`reports`' idempotency section); and `exportReport` twice to the same
target in the same form writes the same text twice, resolving with deep-equal screens (C-043).
From 11.0 `openFilter`, `applyFilter`, `openDashboard`, and `openOpenItems` are harmless and, on
the same body and the same folder, resolve with deep-equal screens, unless the clock has crossed a
due date in between, which moves an overdue review in or out (C-031), or a stored file has gone or
come back, which changes `files` (C-035).
Determinism: a function of the folder's contents, the browser storage key, the baseline clock,
and the sequence of calls, except what store's stamps, `store`'s stored-file locations, and
registry's, `review-schedule`'s, `reference-register`'s, and `workflows`'
fresh ids add. A bow-tie screen adds nothing to that: `bowtie` is total over its arguments
(`bowtie` C-010). From 8.0 the clock also reaches a screen as a workflow record's `startedOnAest`,
`completedOnAest`, and each entry's `atAest`, all `workflows`' and none this module's, which is
why a conformance test for criterion 4's date fixes the baseline clock rather than passing a date
to any operation of this contract. The clock reaches a screen only as the overdue flag and the `asAtAest` on it,
both `review-schedule`'s (C-031), which is why a conformance test for criterion 4 fixes the
baseline clock rather than passing a date to any operation of this contract. From 10.0 it also
reaches the prepare-report screen as the records in `outOfDate`, through `reports.outOfDateFor`,
which is why a conformance test for SL-09 criterion 3 fixes the clock too; and it reaches a report
only as that report's stored `createdAtAest`, which a document is drawn from and no later screen
reads the clock for (`reports` C-008).
Null and empty semantics: a folder never saved to opens with no profiles and, after
selection, no hazards; a body with no controls, platforms, or links shows empty lists;
`messages` is empty when there is nothing to say; `lastSave` is null until the folder has
been saved to; `topBar` fields are null until set (C-003, C-005); no check screen when
nothing failed (C-010); no recover screen when the browser holds no unsaved state (C-013);
`backups` empty when none are kept; a restore warning with no items when nothing is unsaved
(C-014); a hazard on a platform with no rating entered shows both values null and the
`Uncategorised` band (C-021); a control nobody has ruled on is shown as `awaiting`, with
`confirmation` and `justification` both null, which is not an absence of data but a state
(C-024); a hazard with no controls shows `controls` empty on both screens; a body with no
history shows `entries` empty and every queue empty (`change-log` C-006); a profile that owns
no platform shows `queues` empty, and one whose platforms await nothing shows a queue with
`entries` empty (C-029); `affected` on a confirm-edit screen never has fewer than two
entries, because one platform or none is not a gate (C-027); a `PendingEdit`'s `control` is
null only when no entry of the screen's own list had the id given (section 3); a body in which
no tempo has been set shows `reviews` with both lists empty, which says every record has no
schedule and none is overdue, while `reviews` null says the standing could not be read and is
never drawn as either (C-031); a record with no entry in `reviews.schedules` has no tempo, no
due date, and no last reviewed date, and is not overdue (`review-schedule` C-009); a body with
no reference entries shows `entries` empty and `files` empty, which says the register is empty
and not that a standing could not be read, while `files` null says the standing could not be
read and is never drawn as either (C-033, C-035); an entry with no links shows `links` empty,
and one whose `fileLocation` is null carries `flagged: false` with `reason: null`, which is an
entry that never had a file and not a file that was found (C-034, C-035); a body with no workflow
records shows `workflows` empty, which is a register with nothing in it, and a workflow that has
recorded nothing yet shows `progress.record.entries` empty, which is a run that has entered
nothing and not one whose entries could not be read (C-036); a workflow's `demand` is null exactly
when it is complete or abandoned, which is a workflow that asks nothing more, while a `demand`
whose `outstanding` is empty and whose `satisfied` is false is a step that asks for something
naming no record (`workflows` C-008); and a workflow screen's platform group and hazard group are
null when the subject is not a live record of that kind, which is never drawn as a platform with
no hazards or a hazard with nothing against it, while `linkableHazards` and `linkableControls`
empty means the step the workflow is at offers no picker (C-037); and a hazard with no causal
factors, consequences, or controls shows a bow-tie with those lists empty and the hazard drawn
alone, which is the stored data and not a bow-tie that could not be read (C-039); a body with no
templates or reports shows `templates` or `reports` empty (C-041); a prepare-report screen whose
`outOfDate` is empty carries no warning, which says nothing the report would use is past due and is
never shown as a warning with no items (C-042); a hazard linked to no platform shows `platforms`
empty and one included in no report shows `reports` empty, and a `HazardOnPlatform` has exactly one
of `controls` and `omitted` null, so an empty `controls` is a hazard with no controls on that
platform and never one that could not be read there (C-044); an `ItemFilter` value of null is a
filter not active and never a filter for an absent value; a `HazardItem` or `ControlItem` with
`platform` null is a record no platform's query shows and never one on a platform with nothing
read; a `residualRating` null is an item not against a row and never the `Uncategorised` band,
which a row with no residual entered carries (C-021, C-045); a `PlatformItems` whose lists are
empty is a platform with nothing open, while an `overdue` null says its overdue reviews could not
be read (C-046); and `unlinked` empty says every live record is linked, while `unlinked` null says
the flag could not be read (C-048).
Concurrency safety: two copies of Pivot on one folder are the designed case (ASM-004) and
C-007 is the whole of what this module promises about them; a conformance test opens two
apps on one in-memory handle to reach it. One browser storage key per machine is ASM-006.
Within one app, calls are made one at a time by the caller; overlapping calls are not
promised.
Side effects: the writes in C-009, the one export file of C-040, and the page's drawing.
Tolerance and precision: none; every comparison is exact, and a consequence and a
likelihood are compared as the values entered, never as a band (C-021, C-022).

This module places no fault points at 5.0. C-008 and C-011 are reached by making `store`
fail through its in-memory folder's `failWrite` and `denyRead`, and by arming `store`'s own
fault points (store section 5) through `baseline/faults.js` from test code; C-013 by a
state a first app's `noteChange` left in an in-memory `localStorage` on `globalThis`; C-007
by a second app saving in between; C-020's omitted hazards by a body whose control, rating,
or justification record is malformed, built in test code and opened through `store`'s
in-memory folder. C-024's three states are reached through the operations alone: a hazard
linked to a platform starts every control `awaiting`, `confirmControlForPlatform` makes one
`confirmed`, and `excludeControlFromPlatform` makes one `excluded`, so no suite needs to build
a link or a justification by hand; the profile-name failure of section 4 is `denyRead` on
`profiles.json` after the folder is open. The paths added at 5.0 are reached the same way:
C-027's gate by a hazard linked to two platforms and a control on two of them, both built
through the operations; C-028 and C-029 by the entries those acts wrote, read back through
`change-log`; C-029's transfer by a `setPlatformOwner` between two profiles this suite
created; C-030's refusal by retiring a hazard that is on a platform; and the
`MalformedEntryError` of section 4 by a body whose `collections['change-log-entry']` holds an
entry `change-log` C-008 refuses, built in test code and opened through `store`'s in-memory
folder, as C-020's malformed records are. Nothing here needs arming of its own.

This module places no fault points at 6.0 either. The paths added at 6.0 are reached the same
way: C-032's setting by `setReviewTempo` on each of its three screens; C-031's two directions by
`clock.fixClock` either side of a due date the suite set through `setReviewTempo`, released in a
finally block, which is the one place this module's suite touches the baseline clock and is test
code (manifest); C-032's survival across a save and a load by saving and opening the same
in-memory folder again, as C-006 does for a hazard; C-027's sixth gate by a tempo set on a
hazard linked to two platforms; and `reviews` null by a body whose `collections['review-schedule']`
holds an entry `review-schedule` C-004 refuses, built in test code and opened through `store`'s
in-memory folder. The last reviewed date of C-032's last paragraph is reached by the suite
calling `review-schedule.completeReview` itself and then reading the screen, which is the one
place this module's suite calls a module operation this surface does not offer.

This module places no fault points at 7.0 either. The paths added at 7.0 are reached the same
way: C-033's creation by `createReference` with each combination of the four fields, the file
half by an `IncomingFile` the suite constructs; C-033's refusal after a file was kept by arming
`store`'s own fault point `store.stored-file.staged` through `baseline/faults.js`, which is the
same route `reference-register`'s suite takes for C-004; C-034's links by `linkReference` from
the entry screen, and its order by linking one entry to a hazard, a control, and a platform;
C-035's two directions by opening the register with the file there and then removing it from
`files/` through `store`'s in-memory folder, which is a value and not a rejection (store C-019),
and `files` null by making the data folder unreadable with `denyRead` after it is open;
C-027's seventh gate by an entry linked to a hazard that is on two platforms; and C-031's
reference-document flag by the suite calling `review-schedule.setSchedule` for a
`{ kind: 'reference-entry', id }` ref itself and then reading the register, over that contract's
surface and never over this one, which is the second place this module's suite calls a module
operation this surface does not offer and is what `docs/slices/SL-10.md` putting the tempo out
of scope leaves. Nothing here needs arming of its own beyond that one `store` fault point.

This module places no fault points at 8.0 either. The paths added at 8.0 are reached the same way,
through the operations: C-036's register by `startWorkflow` for each of the five kinds, its
refusals by a subject outside the screen's `platforms` and by a kind outside the five; C-037's
three lists by `progressOf` after each `advanceStep`, and its demand by reading the screen between
submissions; criterion 3's presentation by an `onboard-platform` run that links two hazards to a
new platform, then a `review-data` run on that platform, whose `rows` carry the controls those
hazards brought across `awaiting` (registry C-021); C-037's omitted half by a body whose control,
rating, or justification record is malformed, as C-020's is, opened through `store`'s in-memory
folder; C-038's completion and its sealing by completing a workflow and then calling each of the
four acts again and asserting the refusal (REQ-039); the last reviewed date a completed review
sets by `review-schedule.setSchedule` before the run and `review-schedule.getSchedule` after it,
over that contract's surface as C-032's paragraph is read, which is the third place this module's
suite calls a module operation this surface does not offer; REQ-077's refusal by a
`remove-control` run on a control confirmed for two hazards of one platform, advancing at
`settle-the-ratings` with one of them unsettled; C-009's all-or-nothing as `workflows` section 5
reaches it, by a body in which one of a completion's acts must reject, asserting the screen is the
one before and the folder untouched; and C-027's eighth gate by an `add-data` run whose hazard is
linked to two platforms between its first and second steps, which is reached by `back` to the
platforms screen and a `linkHazardToPlatform` on each. Nothing here needs arming of its own.

This module places no fault points at 9.0 either. The paths added at 9.0 are reached the same way,
through the operations: C-039's bow-tie by building a hazard with causal factors, consequences, and
controls of both kinds through the operations, linking it to a platform, confirming one control and
excluding another, and comparing the screen's `bowtie` and `svg` with `bowtie.bowtieFor` and
`bowtie.renderBowtieSvg` of the same body, called by the suite over that contract's surface, which
is the fourth place this module's suite calls a module operation this surface does not offer;
criterion 2 by a `renameHazard` and an `addCausalFactor` on the hazard screen, then the platforms,
platform, and assessment screens and `openBowtie` again, with the in-memory folder's files and the
in-memory `localStorage` compared before and after the `openBowtie`, `exportBowtie`, and `back`
calls; C-040 by an in-memory `ExportFileHandle` from `store`'s conformance harness, whose contents
after `exportBowtie` equal the screen's `svg`; section 4's refused bow-tie by a body whose control,
rating, or justification record is malformed, as C-020's is; and the failed export by arming
`store`'s own fault point `store.export.staged` through `baseline/faults.js`, the route
`reference-register`'s suite takes for `store.stored-file.staged`. Nothing here needs arming of its
own beyond that one `store` fault point.

This module places no fault points at 10.0 either. The paths added at 10.0 are reached the same way,
through the operations: C-041 by `createTemplate` and reading the reports screen, and across a save
and a load of the same in-memory folder; criterion 1 by two `beginReport` and `produceReport` runs
from one template, comparing both reports' `sections` and both documents' section marks with the
template's; C-042's two directions by `review-schedule.setSchedule` on the platform, a hazard, and a
control over that contract's surface, then `clock.fixClock` either side of a due date around
`beginReport`, which is the fifth place this module's suite calls a module operation this surface
does not offer; C-042's refusal by `beginReport` with the clock before a due date and `produceReport`
with it after, asserting no report and the prepare-report screen's new warning; C-042's omitted half
by a body whose control, rating, or justification record is malformed, as C-020's is; criterion 5 by
a `produceReport` naming a hazard's bow-tie, then a `renameHazard` and an `addCausalFactor`, and
`openReport` again, comparing the report's `svg` with `bowtie.renderBowtieSvg` of the body before the
change; C-043's download by an in-memory `ExportFileHandle` from `store`'s conformance harness, whose
contents equal `reports.renderReportHtml` or `renderReportMarkdown` of the report, and the failed
download by arming `store.export.staged`; and C-044 by a hazard linked to two platforms, one of them
with a malformed rating, and one report produced on the other. Nothing here needs arming of its own
beyond that one `store` fault point.

This module places no fault points at 11.0 either. The paths added at 11.0 are reached through the
operations: C-045 by hazards and controls built on two platforms, one control confirmed, one
excluded and one awaiting, ratings entered in two bands, a hazard deleted over `registry`'s own
surface after linking and a control retired, and an entry linked to one hazard and one control,
then `applyFilter` with each filter alone and in combinations, each result compared with the
unfiltered lists (the sixth place this module's suite calls a module operation this surface does
not offer is `registry.deleteHazard`, which no screen offers); C-046 by two profiles each owning a
platform, a tempo set and `clock.fixClock` past its due date, a workflow started on each platform,
and an edit on a hazard both platforms read, then each profile's dashboard compared with the
other's; C-047 by the same body's open-items screen, with a workflow on a hazard and an overdue
schedule on a record on no platform; C-048 by a hazard, a control, a platform, and an entry each
created alone and flagged, then each linked by one act and not flagged, a control linked only to a
deleted hazard not flagged, and a retirement clearing a flag; and the null flags by a malformed
link, entry, or workflow built in test code and opened through `store`'s in-memory folder, as
C-020's malformed records are. Nothing here needs arming of its own.

## 6. Performance envelope
Per `openFolder`: one `store.openDataFolder`, one `store.checkFolder`, and, unless a stored
data or profiles failure stops it, one `store.load` and one `profiles.listProfiles`.
`acknowledgeCheck` and `cancelRestore`: no module call. Per `createProfile`: one `profiles`
call plus one `listProfiles`. Per `selectProfile`: one `profiles` call, one `listProfiles`
only when it rejects, one `store.readRecoverable`, and one `registry.listHazards`. Per
`acceptRecovery` or `declineRecovery`: one `store` call and one `listHazards`. Per
`addHazard`: one `registry.createHazard`, one `store.noteChange`, and one `listHazards`. Per
`save`: one `store.save`, plus one `profiles.listProfiles` only when the outcome is a
supersession, and one `store.unsavedChanges` only when it rejects. Per `beginRestore`: one
`store.listBackups`. Per `prepareRestore`: one `store.prepareRestore`, one
`store.unsavedChanges`, one `listHazards`, and at most one `listProfiles`. Per
`confirmRestore`: one `store.restore`, one `listHazards`, and at most one `listProfiles`.

Per `openHazard` and per changing operation of the hazard screen: one
`registry.getHazardDetail`, one `registry.listControls`, and, for a changing one, the one
`registry` change plus one `store.noteChange` before them. Per `openControls` and
`createControl`: one `registry.listControls`, plus the change and one `noteChange`. Per
`openPlatforms` and `createPlatform`: one `registry.listPlatforms` and one
`profiles.listProfiles`, plus the change and one `noteChange`. Per `openPlatform` and per
changing operation of the platform screen: one `registry.listPlatformHazards`, one
`registry.listHazards` for the picker, and one `rating.ratingFor` per row, plus the change
and one `noteChange`. Per `openAssessment` and per changing operation of the assessment
screen: one `registry.listPlatformHazards`, one `registry.getRatings`, two
`rating.ratingFor`, and one `profiles.listProfiles` for the names a confirmation is drawn with
(C-024), plus the change and one `noteChange`. Per `back`: the reads of the
screen it resolves with and nothing else. So a screen costs one pass over the collections
registry C-019 and its neighbours read, and a list of a platform's hazards costs one query
however many rows it has (C-020).

Per operation added at 5.0: `openHistory`, one `change-log.listEntries` and one
`profiles.listProfiles`. `openAcknowledgements`, one `registry.listPlatforms`, one
`profiles.listProfiles`, and one `change-log.listAwaiting` per platform the active profile
owns — so a scan of the entry collection per owned platform, which is the cost
`change-log` section 6 states and the only place in this contract where a read is repeated
per row. `acknowledgeChange`, one `change-log.acknowledge`, one `store.noteChange`, and the
reads of the screen it rebuilds. `retireHazard`, `retireControl`, `retirePlatform`, and
`setPlatformOwner`, the one `registry` change, one `store.noteChange`, and the reads of the
screen each resolves with, plus one `registry.listPlatforms` only when a retirement is refused
(section 4). Each of the five gated operations of C-027 costs one
`registry.platformsAffected` before anything else, and, only when the gate fires, one
`registry.listPlatforms` to name the platforms and no change at all; `confirmEdit` then costs
what the gated operation costs, and `cancelEdit` the reads of the screen it returns to. From
5.0 every changing operation also carries the cost `registry` C-023 adds, which grows with
`collections['change-log-entry']` (registry section 6).

Per screen that carries `reviews`, at 6.0: one `review-schedule.listSchedules` and one
`review-schedule.listOverdue` of the body that screen is built from, whatever the operation and
however many records the screen lists — so the ten screens of C-031 each cost two more passes
over `collections['review-schedule']` than they did at 5.0, and none costs a call per row.
`setReviewTempo` costs one `registry.platformsAffected`, and then either one
`registry.listPlatforms` and nothing else when it gates (C-027), or one
`review-schedule.setSchedule`, one `store.noteChange`, and the reads of the screen it rebuilds;
`confirmEdit` of a `setReviewTempo` costs the same less the `platformsAffected`, which was made
before the gate and is not made again (C-026). `collections['review-schedule']` holds at most
one entry per scheduled record, so these two reads are bounded by how many records a user has
set a tempo for and not by the history's growth (`review-schedule` section 6).

Per operation added at 7.0: `openReferences`, one `reference-register.listEntries` and the one
`checkEntryFiles` of C-035, which is one listing of `files/` however many entries carry a file
(store C-019), plus the two reads of C-031. `createReference`, one
`reference-register.createEntry` — which is one `store.putStoredFile` when a file is given, the
file's size in the folder's I/O, and one `change-log.recordChange` — one `store.noteChange`, and
the reads of the screen it rebuilds. `openReference`, one `reference-register.getEntry`, one
`registry.listHazards`, one `registry.listControls`, and one `registry.listPlatforms` for the
names and the three pickers, plus the one `checkEntryFiles` and the two reads of C-031.
`linkReference`, one `registry.platformsAffected` per link of an owned kind the entry will hold
— the only place in this contract where a read is repeated per link, as
`openAcknowledgements` is the only place one is repeated per platform — and then either one
`registry.listPlatforms` and nothing else when it gates (C-027), or one
`reference-register.linkEntry`, one `store.noteChange`, and the reads of the screen it rebuilds;
`confirmEdit` of a `linkReference` costs the same less those `platformsAffected` calls, which
were made before the gate and are not made again (C-026). So the two register screens cost one
read of the folder each, however many entries they list, and no screen costs a folder read per
row (C-035).

Per operation added at 8.0: `openWorkflows`, one `workflows.listWorkflows`, one
`registry.listHazards` and one `registry.listPlatforms` for the names and the picker, and one
`profiles.listProfiles`, plus the two reads of C-031 — so one pass over
`collections['workflow-record']` however many workflows it holds, and no read per row.
`startWorkflow`, one `registry.platformsAffected` only when `fields.subject` is not null, then
either one `registry.listPlatforms` and nothing else when it gates, which it cannot for a platform
subject (C-027), or one `workflows.startWorkflow`, one `store.noteChange`, and the reads of the
workflow screen it resolves with. `openWorkflow`, one `workflows.progressOf`, one
`workflows.stepDemand` unless the workflow is complete or abandoned, one `profiles.listProfiles`,
and the one subject read its kind names — one `registry.listPlatformHazards` with one
`rating.ratingFor` per row, or one `registry.getHazardDetail`, or neither — plus one
`registry.listHazards` at `select-hazards` and one `registry.listControls` at `choose-controls`
and neither at any other step, and the two reads of C-031. `submitStep`, `advanceStep`,
`completeWorkflow`, and `abandonWorkflow`, one `registry.platformsAffected` before anything else
and none while the subject is null, then either one `registry.listPlatforms` and no change at all
when the gate fires, or the one `workflows` call, one `store.noteChange`, and the reads of the
screen each resolves with; `confirmEdit` of one of them costs the same less that
`platformsAffected`, which was made before the gate and is not made again (C-026). The `workflows`
call carries that contract's own cost, which for a completion is one `listPlatformHazards`, one
`review-schedule.getSchedule` and one `registry.platformsAffected` per record reviewed, and one
`registry.excludeControlFromPlatform` per hazard a removal covers (`workflows` section 6); this
module makes none of those calls and pays them through the one it makes. So a workflow screen
costs one pass over the collections its subject's own screen reads, and a step does not cost a
read per entry the workflow has recorded.

Per operation added at 9.0: `openBowtie`, one `bowtie.bowtieFor` — which is `bowtie`'s own
`registry.getHazardDetail` and `registry.listPlatformHazards` (`bowtie` section 6) — one
`bowtie.renderBowtieSvg`, linear in the nodes and their text, and the two reads of C-031.
`exportBowtie`, the same plus one `store.writeExportFile` of the whole text. `chooseExportTarget`,
one `store.chooseExportFile` plus what `exportBowtie` costs, or nothing more when the picker is
cancelled or denied. `back` from the bow-tie screen, the reads of the assessment screen. No
latency budget is claimed: a bow-tie is drawn on request, one at a time.

Per operation added at 10.0: `openReports`, one `reports.listTemplates`, one `reports.listReports`,
one `registry.listPlatforms`, and the two reads of C-031. `createTemplate`, one
`reports.createTemplate`, one `store.noteChange`, and the reads of the reports screen.
`beginReport`, one `reports.getTemplate`, one `registry.listPlatformHazards` with one
`rating.ratingFor` per row, one `reports.outOfDateFor` — which is `reports`' own
`listPlatformHazards` and `listOverdue`, so the platform's query is made twice per prepared screen,
once here and once there, and the two cannot differ on one body — and the two reads of C-031.
`produceReport`, one `reports.produceReport` — which carries one `outOfDateFor` and one
`bowtie.bowtieFor` and `renderBowtieSvg` per bow-tie asked for (`reports` section 6) — one
`store.noteChange`, and the reads of the report screen; or, when refused for its list, the reads of
the prepare-report screen instead. `openReport`, one `reports.getReport` and one
`reports.includesOf`. `exportReport`, the same plus one render, linear in the report's size and
every bow-tie it holds, and one `store.writeExportFile` of the whole text; `chooseReportExportTarget`
one `store.chooseExportFile` more. Every hazard screen gains one `registry.platformsAffected`, one
`registry.listPlatformHazards` per platform the hazard is linked to, and one
`reports.reportsIncluding` (C-044) — the third place in this contract where a read is repeated per
platform, after `openAcknowledgements`, and it is paid on every changing operation of the hazard
screen as well as on opening it.

Per operation added at 11.0: `openFilter` and `applyFilter`, one each of `listAllHazards`,
`listAllControls`, `listAllPlatforms`, `reference-register.listEntries`, and `checkEntryFiles`,
C-031's two reads, and one `registry.listPlatformHazards` per platform of any status with one
`rating.ratingFor` per row — so one query per platform however many filters are active, and the
filtering itself linear in the items; a refused `applyFilter` calls nothing. `openDashboard`, one
`registry.listPlatforms`, one `profiles.listProfiles`, one `workflows.listWorkflows`, one
`reference-register.listEntries`, C-031's two reads, and one `listPlatformHazards` and one
`change-log.listAwaiting` per platform the active profile owns. `openOpenItems`, the same for every
live platform, plus one `registry.listHazards`, one `registry.listControls`, one `checkEntryFiles`,
and, for C-048, one `registry.listLinks` per live hazard, control, and platform and one
`registry.getHazardDetail` per live hazard — the fourth place a read is repeated per row, and the
only one repeated per record of the whole body, which is the cost of asking whether each record is
linked when no contract holds that answer in one call (registry section 6, DEC-036). No latency
budget is claimed for any of the three.

No caching beyond the working body, the body last loaded, the recoverable state and restore
plan while their screens are shown, the hazards screen `beginRestore` left, the hazard,
platform, assessment pair, reference entry, and workflow the current screen is for, the template,
platform, and out-of-date list the prepare-report screen shows (C-042), the report the report screen
is for, the filter the filter screen shows (C-045), and the
pending edit
while the
confirm-edit screen is shown; no `Rating` is cached across a
change (C-021); no entry, queue, affected-platform list, schedule, overdue flag, file
standing, step list, progress, demand, bow-tie, drawing, template, report, out-of-date list,
inclusion, report document, filtered list, open item, or unlinked flag is cached
across a change either,
and every one of them is read again for the screen that shows it (C-027, C-028, C-029, C-031,
C-035, C-037, C-039, C-040);
the folder is read again only where a clause says so. The screen is linear
in what it lists.

## 7. Trace
Allocated to this module in `trace/requirements.yaml`; checked by `check_traces.py`.

Promised at version 2.0 and unchanged: REQ-057, verified by demonstration (a review row,
SL-01 criterion 3); this module's halves of requirements allocated to `store` — REQ-005
(C-011), REQ-006 and REQ-074 (C-010), REQ-062 and REQ-079 (C-012), REQ-064 and REQ-075
(C-014), REQ-080 (C-013).

Promised at version 3.0: REQ-009 (C-020), this module's half of REQ-017 (C-021). The rest
of SL-03's requirements are allocated to `registry` and to `rating`; what this version adds
for them is the screen they are entered and read on, cited in the clause that shows each —
REQ-003, REQ-042, REQ-043 (C-022), REQ-025 (C-019), REQ-032, REQ-033 (C-017), REQ-034
(C-025), REQ-035, REQ-065 (C-018), REQ-044 (C-016), REQ-051, REQ-052 (C-023) — and this
contract does not claim them. HZ-003 is mitigated at store C-010; C-010 and C-011 here are
its telling. HZ-004 is mitigated at registry C-019 and C-020 here is this module's half of
it; HZ-010 at `rating` C-001 and C-021 here is this module's half; HZ-002 at registry C-017,
kept here by C-022 showing the values as entered and by C-009 keeping bands to `rating`.

Promised at version 4.0: REQ-002 (C-024), this module's half of it, registry C-019 and C-021
the other. SL-04's other requirements are allocated to `registry` — REQ-001, REQ-013, REQ-058,
REQ-070 — and what this version adds for them is the screen a control's state is read on and
the two acts it is changed by (C-024, C-025); this contract does not claim them. HZ-001 is
mitigated at registry C-021 and HZ-007 at registry C-013; C-024 is this module's half of both,
by showing every control in the state `registry` gave it and none as the platform's until it
is `confirmed`, and C-025 by taking one control per act and offering no bulk or default
confirmation.

Promised at version 5.0: REQ-011 (C-027), written to `allocated_to: views` by this session —
the before-save list of platforms is this module's, over the one derivation registry C-024
supplies. SL-05's other requirements are allocated to `change-log` and to `registry`, and what
this version adds for them is the screen each is read on and the acts each is changed by:
REQ-010 and REQ-045 (C-028), REQ-012 and REQ-081 (C-029), REQ-067 and REQ-076 (C-030); this
contract does not claim them. HZ-005 is mitigated at `change-log` C-004 and HZ-006 at
`change-log` C-010, both reached through registry C-023; this module's contribution is C-027,
which shows the platforms an edit reaches before it is made, C-028, which shows the history to
any user, C-029, which shows each owner what their platform has not acknowledged, and C-030,
which keeps a retirement from taking anything off a platform (HZ-001, HZ-004).

Promised at version 6.0: REQ-019 and REQ-023 (C-031), both written to `allocated_to: views` by
this session — `review-schedule` 1.0 supplies the flag and the one call every list's flag comes
from (`review-schedule` C-009, C-010) and left the allocation here rather than writing it on
this module's behalf, as REQ-002's and REQ-009's were at SL-04 and SL-03. What is promised is
that every list showing a record of a schedulable kind carries that one call's result and shows
no record as not overdue when it could not be read. SL-06's other requirements are allocated to
`review-schedule` — REQ-015, REQ-020, REQ-021, REQ-022, REQ-072 — and what this version adds for
them is the screen a tempo is set on and read back from (C-031, C-032); this contract does not
claim them. HZ-012 is mitigated at `review-schedule` C-009; C-031 is this module's contribution,
by taking every flag from `listOverdue` and by refusing to draw a standing it could not read.
HZ-009 is not reachable at this version by any clause of this contract: its never-statement is
about a report produced from out-of-date data without the user being told, the telling is
REQ-016, and SL-06 puts it out of scope (`review-schedule` section 7 records the same gap).

REQ-023 names controls, platforms, and reference documents. Version 6.0 flagged a control and a
platform, which are two of the three, and showed no reference entry at all: no module owned that
record kind until SL-10, so no screen of that version listed one. That is closed at 7.0. C-031's
list of screens gains the references and reference screens, so a reference entry is flagged
overdue by the same one `listOverdue` every other kind is, and REQ-023 is verified for all three
kinds at this version. The tempo of a reference entry is not set here: SL-10 puts it out of
scope, `setReviewTempo` keeps C-032's three kinds, and the conformance test for the third kind
sets the tempo over `review-schedule`'s own surface, as the test for SL-06 criterion 3 completes
a review over it (section 5, fault points). REQ-023 is SL-06's row in `trace/slices.yaml`, not
SL-10's, so the ordering is worth naming: SL-06 cannot claim REQ-023 verified until this version
of `views` exists, which SL-10 brings.

Promised at version 7.0: REQ-078 (C-035), written to `allocated_to: views` by this session —
`reference-register` C-010 supplies the fact for every live entry in one call, over store C-019,
and "wherever it is listed" is the screen's, so that contract left the allocation here rather
than writing it on this module's behalf, as `review-schedule` 1.0 left REQ-019's and REQ-023's at
SL-06 and `registry` left REQ-002's and REQ-009's at SL-04 and SL-03. It is verified for the file
half only: an entry's `path` is text a user typed, which no module can stat under DEC-003, and
what SL-10 criterion 4 means for a path is an open GATE ruling (DEC-022, Consequences), carried
in `docs/slices/SL-10.md` and neither closed nor worked around here. SL-10's other requirements
are allocated to `reference-register` and to `store` — REQ-028, REQ-029, REQ-030, REQ-031 — and
what this version adds for them is the screens each is entered and read on, cited in the clause
that shows each: REQ-028 (C-033), REQ-029 (C-033, as what this module shows of store C-018 and
`reference-register` C-003), REQ-030 and REQ-031 (C-034); this contract does not claim them.
SL-10 names no hazard (`trace/slices.yaml`), so this version adds no mitigation clause.

Promised at version 8.0: no requirement is newly allocated to this module. Every requirement
SL-07 claims is allocated to `workflows` — REQ-008, REQ-036, REQ-037, REQ-038, REQ-039, REQ-077 —
and what this version adds for them is the screens each is read, entered, and refused on, cited in
the clause that shows each: REQ-037 (C-036 with C-037), REQ-008 (C-037's rows, over C-020),
REQ-036 (C-037's pickers, the acts being `workflows` C-013's), REQ-038 and REQ-039 (C-038),
REQ-077 (C-038's refusal, the demand being `workflows` C-008's). This contract claims none of
them.

What this version does change for REQ-037 is that it can now be verified at all. Its
`verification_method` is `demonstration` and its `verified_by` is a `REV-nnn`, as REQ-057's is:
what conformance holds is that `progressOf` gives the three lists and that they partition the step
list (`workflows` C-002), and what a review row holds is that a user can see the current step, the
steps done, and the steps remaining on a screen. `workflows` 1.0 recorded that the row could not
be taken until this version existed; C-036 and C-037 are that version, and the row is SL-07's to
record at its acceptance. REQ-049's "the workflows that user has in progress" is still this
module's at SL-11 and is not answered here: C-036 lists every live workflow of the body, filtered
by nothing and sorted by nothing, as C-028 shows the whole history and a per-record view waits for
a later version (DEC-017).

REQ-011 is kept across the new surface rather than re-allocated. C-027 gains the five changing
workflow operations, and 8.0 states the invariant the clause has kept since 5.0 outright: an
operation is gated exactly when the entry its act appends carries two or more platform ids
(DEC-027). Four of the five workflow operations change the stored content of a hazard through the
acts their steps make, which is what REQ-011 names; the fifth changes only the workflow record,
whose kind REQ-011 does not name, and is gated on the same ground DEC-021 and DEC-024 gated a
review schedule and a reference entry. SL-07 names no hazard (`trace/slices.yaml`), so this
version adds no mitigation clause; HZ-004's mitigation stays registry C-019, and C-020 gaining the
workflow screen is what keeps a review workflow reading the same one query the assessment screen
and a report will.

Promised at version 9.0: REQ-060 (C-040), written to `allocated_to: views` by this session — letting
a user export is an act on a screen, which `bowtie` 1.0 section 7 left here, and the write it needs
is `store` C-020's, which `store` 4.0 section 7 left here too (DEC-030). SL-08's other requirements
are allocated to `bowtie` — REQ-018 and REQ-059 — and what this version adds for them is the screen
the bow-tie is shown on and the export it is written by, each generated from the working body on
every call and kept nowhere (C-039, C-040); this contract does not claim them. HZ-011 is mitigated
at `bowtie` C-004 with C-001 and C-005; C-039 is this module's contribution, by showing exactly the
drawing `bowtie` gave for the working body as it now is and no bow-tie at all when one cannot be
read, and C-040 by writing that same drawing and nothing else.

Promised at version 10.0: REQ-026 (C-044), allocated to this module at G3 and promised here — for
any hazard, the platforms it is linked to from `registry.platformsAffected`, the controls linked to
each of those platforms for it from that platform's one `registry.listPlatformHazards`, and the
reports that include it from `reports.reportsIncluding`, composed on the hazard's own screen as
DEC-004 says an operation spanning record modules is composed. SL-09's other requirements are
allocated to `reports` — REQ-007, REQ-016, REQ-027, REQ-046, REQ-061 — and what this version adds for
them is the screens each is entered, warned on, and read on, cited in the clause that shows each:
REQ-046 (C-041), REQ-016 with REQ-007 and REQ-061 (C-042), REQ-027 (C-043); this contract does not
claim them. HZ-009's telling is `reports` C-006 and C-042 here is the screen it is told on; the
hazard's `mitigation_contract` stays `review-schedule` C-009 and SL-09 does not claim the hazard in
`trace/slices.yaml`, and moving either is a GATE decision (`reports` section 7). The download of
SL-09's G3 decision is verified by demonstration for its picker, as `chooseExportTarget` is, and by
conformance for the write (C-043).

Promised at version 11.0: REQ-047 (C-045), REQ-049 (C-046), REQ-066 (C-047), and REQ-068 (C-048),
each allocated to this module at G3 and each read as jay-pryor ruled in `docs/slices/SL-11.md`.
`registry` 5.0 supplies the reads the status filter and the link rule need (registry C-030,
C-031, DEC-036); which items pass a filter, which are a platform's open items, and which links
make a record linked are this module's rules over them (DEC-037). REQ-049's "the workflows that
user has in progress", which 8.0 recorded as waiting for this version, is answered at C-046 as the
ruling reads it: the workflows in progress on a platform the user owns. SL-11 names no hazard
(`trace/slices.yaml`), so this version adds no mitigation clause; C-046 and C-047 show an overdue
review only from `reviews.overdue` and never as none when it could not be read, which keeps
C-031's half of HZ-012 on the two new screens, and show an omitted hazard as C-020 does, which
keeps HZ-004's.

No requirement allocated to this module waits on a later version.

## Explicitly not promised
- Any rating on the bow-tie screen. The pair's ratings are on the assessment screen (C-021, C-022);
  whether SL-08's "consumes rating" asks for them beside the bow-tie awaits jay-pryor's ruling, and
  adding them is an Interface change to C-039 (`bowtie` 1.0 preamble).
- The name suggested to the export picker, where the user saves the file, the picker's warning
  before replacing a file, and that a file once exported can be written again without asking: the
  handle is used once and kept nowhere (C-040; store's not-promised section).
- That an exported file stays the same as the bow-tie shown after the stored data changes. An
  export is the drawing at the moment of the export; nothing records that it was made, links it to
  the hazard, or flags it as out of date, and the diagram in Pivot is generated afresh each time it
  is shown (REQ-059).
- How the page puts `svg` into the page, and that the drawing fits the window. The drawing is
  verified by demonstration (DEC-010), and `bowtie`'s not-promised section says the document is not
  promised as a string to concatenate into HTML.
- Reaching a bow-tie from anywhere but the assessment screen of the pair: not from the hazard's own
  screen, which holds no platform, not from a platform's row, and not from a workflow screen. The
  bow-tie inside a report is `reports`' and is chosen on the prepare-report screen, not reached
  from this one (C-042); editing anything from the diagram is out of SL-08's scope.
- The file picker `createReference`'s `IncomingFile` came from. Choosing a file and reading its
  bytes is the page's, in `src/main.js`, and is verified by demonstration; this surface takes the
  name and the bytes already in hand, so nothing here is promised about cancelling the picker,
  a browser denial, or a file the page could not read (C-033).
- The drawing: layout, wording of any headline or next step, element structure, styling
  beyond using the baseline tokens, keyboard and focus behaviour. Only the `Screen` data is
  promised; the page may be redrawn wholesale without this contract changing (DEC-010).
- Restoring or recovering into a folder whose `data.json` or `profiles.json` failed its
  check or could not be read. Store 2.0's `restore` and `recoverWorkingState` need a
  completed `load`, which such a file refuses; the folder screen and its message are the
  whole of what is promised (FND-039). The browser's copy is left untouched in that case.
- Changing the profile once one is selected. Profiles C-004 permits a second
  `selectProfile`; this surface has no operation for it, so a new user opens the page again.
- Showing unsaved state anywhere but the hazards screen. `unsaved` is that screen's field;
  a change made on a hazard, controls, platforms, platform, or assessment screen is told to
  `store` at once (C-012) and is seen as unsaved on the hazards screen `back` resolves with
  (C-015). Saving from any other screen is a later version.
- Any navigation but the edges in C-015: no way from a hazard's screen to a platform, from
  a platform to a hazard's detail, or from any screen to any other except along those edges
  and `back`. For any hazard, the platforms it is linked to and the controls linked to each
  of them are shown on its own screen at 10.0 (C-044), with no edge from there to a platform, an
  assessment, or a report: the hazard screen shows them and leads nowhere new.
- Deleting a hazard from the screen, or editing a control, a causal factor, a consequence, or
  a hazard-control link, or retiring or editing anything registry C-025 does not retire. Only
  a hazard's title
  is changed (C-016), a hazard's ID in a platform's reports (C-023), a control's state on
  a platform (C-025), a platform's owner (C-018), and the status of a hazard, a control, or a
  platform (C-030), which is what SL-03 to SL-05 ask for; registry C-005 exists and a
  delete control is a later version. Nothing here un-retires a record: what was retired in
  error is answered by the history (C-028), as registry's not-promised section says.
- Rewording a stored justification. A reason is changed only by confirming the control and
  excluding it again with a new text, which is what registry 3.0 offers; an edit in place is
  a later version, and this surface has no operation for one.
- Confirming or excluding more than one control in a call, any default or bulk confirmation,
  and any screen that acts on a platform's `awaiting` controls together. Each act names one
  control (C-025), and at 8.0 `workflows` 1.0's `onboard-platform` has no step that confirms one:
  a hazard linked to a new platform brings its controls across `awaiting` and each is confirmed
  afterwards on the assessment screen (HZ-007; `workflows` C-013).
- Showing, on the platform screen, a confirmation's `byProfileId` as a name: `profiles` is
  the assessment screen's field (C-024), and the rows of the platform screen carry the
  `Confirmation` as `registry` gave it. Which platforms a control is confirmed on is shown from
  the hazard at 10.0, each platform with that hazard's controls in their states (C-044); seen from
  the control, across every hazard it is linked to, it is shown on no screen of this version.
- Any history of a control's states on the screens that show them. The platform and
  assessment screens show the live state and the live reason; the acts that produced them are
  entries on the history screen like any other (C-028), which is not a per-control or
  per-platform view of them. REQ-026's view at 10.0 shows each control's state as it now is and
  not the acts that produced it (C-044).
- The history of one record on a screen of its own. `change-log.listHistory` gives it and this
  version calls only `listEntries`: the whole history in one place is what criteria 1 and 2
  ask for, and a per-record view is a later version (DEC-017). Nothing here filters, groups,
  pages, searches, or sorts the entries either, or shows an entry's items as anything but the
  fields the entry holds — a field's name is the stored field's name, not a label
  (`change-log`'s not-promised section). The unacknowledged changes on the dashboard and the
  open-items screen are each platform's `listAwaiting`, not the history (C-046, C-047).
- A queue for a platform the active profile does not own, or for a platform retired since the
  entries were written. The acknowledgement screen is built from `registry.listPlatforms`,
  which lists the live platforms (registry C-025), so a retired platform's entries stay
  awaiting and are shown to nobody, on the dashboard and the open-items screen at 11.0 too, which
  are built from the same live list (C-046, C-047); and the real name of such
  a platform is not shown anywhere, because the platform-name rule of section 3 has only the
  live list to read (C-027, C-030).
- Any check that the profile acknowledging is entitled to. This module offers only the rows
  of the platforms the active profile owns (C-029), which is the half `change-log` leaves to
  its consumer; nothing here stops another copy of Pivot from acknowledging the same entry
  first, and store C-004 decides which body is kept.
- Listing, at `save`, the platforms every unsaved change reaches, or gating a save at all.
  The list is shown before the edit is made and once per edit (C-027, DEC-017); `save` says
  what C-007 and C-011 say and nothing about platforms.
- Setting a last reviewed date directly. This surface has no operation that sets one and it
  never calls `review-schedule.completeReview` (C-032). From 8.0 one operation causes it —
  `completeWorkflow` of a `review-data` workflow, through `workflows` (C-038) — and nothing else
  on any screen of this version sets, clears, or backdates one, which is what keeps SL-06
  criterion 3 checkable here. Which records that completion sets a date on, and in what order, is
  `workflows` C-006's and DEC-026's and is promised by no clause of this contract.
- Confirming or excluding a control from a workflow screen, or any ratings gate on the direct
  path. `views` 4.0 C-025 offers `excludeControlFromPlatform` on the assessment screen with no
  requirement that a residual be settled first, and 8.0 leaves that path exactly as it was:
  REQ-077's words are scoped to the remove-a-control workflow, HZ-002's mitigation is registry
  C-017, which keeps a residual exactly what the assessor entered, and a direct exclusion changes
  no rating (C-022). So a user who takes a control off a platform from the assessment screen is
  not asked to confirm any hazard's residual, and a user who does it through the workflow is
  (C-038; `workflows` C-008). `docs/slices/SL-07.md` names this as a question for this version and
  this is the answer; gating the direct path would be an Interface change to C-025 and a change to
  REQ-077's statement, neither of which is this session's (P10).
- Correcting a step, going back a step, skipping one, reordering them, editing an entry of a
  workflow record, or un-abandoning a workflow. `workflows` 1.0 has no such operation and this
  surface has none either (C-038): a workflow entered wrongly is abandoned and started again, and
  the records it acted on are corrected through the contracts that own them, each with its own
  entry in the history (C-028).
- Any undo of what a workflow did. Abandoning ends the guidance, not the acts (`workflows`
  C-012), and no contract of this project offers a rollback: a global ID is assigned once
  (registry C-002) and a deletion keeps its row (registry C-005). This surface adds none.
- Any filter, grouping, count, sort, or search over the register of workflows — by kind, by
  state, by who started it, by the platform it is on, or by age. `workflows` on the register is the
  one list `workflows.listWorkflows` gave, in its order (C-036). The dashboard's and the open-items
  screen's workflows are a selection of in-progress records by subject (C-046, C-047), not a filter
  over the register, and a workflow started by the active profile on a platform another owns is on
  that owner's dashboard and not on this profile's.
- A second route to the acts a step makes, or a way to run a step's act outside its workflow from
  a workflow screen. The acts are `registry`'s and `review-schedule`'s and are already offered on
  the screens that own them (C-016 to C-025, C-032); a workflow reaches them through
  `workflows` and never around it (C-009, C-038).
- Running one workflow across two copies of Pivot, or continuing one another user started. A
  workflow record is in the working body and reaches another copy only by a save and a load
  (store C-001), and nothing here compares the active profile to the one a record names —
  `workflows`' not-promised section says the same and ASM-002 is why.
- Any guard against two workflows on one record, or two reviews of one platform in a day. Two
  `startWorkflow` calls give two records and two completed reviews advance a due date twice
  (`workflows` C-001 and its idempotency section); this surface neither counts nor refuses them.
- A review tempo, a due date, or an overdue flag on a workflow record. `workflow-record` is
  outside `SCHEDULABLE_KINDS`, `setReviewTempo` keeps C-032's three kinds, and no screen of this
  version offers a tempo for one; whether a workflow record should carry one is recorded in
  `workflows` section 7 and is not widened here.
- Showing a reference entry on either workflow screen, or any list of what an onboarded hazard
  brought across. Criterion 2's reference-register links come across by not being copied
  (DEC-023; `workflows` C-013), which is a fact about the entry and not a list this module draws;
  the register is C-033's two screens and is reached from the hazards screen (C-035).
- The wording of a step's name, the form drawn for a step, the order the fields of a submission
  are asked in, or any progress bar, count, or percentage. Only the `Screen` data is promised
  (DEC-010): `steps`, `done`, `current`, and `remaining` are `workflows`' values and this module
  neither counts them nor renders them.
- Setting a review tempo for anything but the hazard the hazard screen holds, a control of the
  controls screen's list, or a platform of the platforms screen's list (C-032). A reference
  entry is schedulable by `review-schedule` and is flagged overdue on both register screens from
  7.0 (C-031), but no screen of this version offers a tempo for one: SL-10 puts it out of scope,
  so a reference entry's tempo is set over `review-schedule`'s own surface and only read back
  here. The six kinds outside `SCHEDULABLE_KINDS` carry
  no schedule at all. Nothing here offers a tempo per kind, per platform, per list, by default,
  or by inheritance, and nothing asks whether a record ought to have one.
- Clearing, retiring, or un-setting a schedule, or any second route by which a tempo or a due
  date changes. `review-schedule` 1.0 has no such operation and this surface has none either;
  what a retired hazard's still-falling-due schedule should do is named in that contract's
  not-promised section and is a later version's.
- Showing the review standing on the folder, check, profile, restore, or history screen, or
  anywhere a record of a schedulable kind is not shown (C-031). An entry on the history screen
  names the record an act changed and is not that record, and an act does not fall due.
- Any order, grouping, filter, count, or search over `reviews`, and any list sorted by due date
  or of the overdue records alone. The two lists are carried in the order `review-schedule` gave
  them and joined to a record only by ref (section 3); the overdue reviews of the dashboard and the
  open-items screen are entries of `reviews.overdue` selected by ref, in its order (C-046, C-047),
  and nothing is sorted by due date or by rating.
- Any warning, reminder, or escalation about a due date but the out-of-date warning before a
  report, which is C-042's and is `reports.outOfDateFor`'s list. There is one boundary and it is
  `review-schedule` C-009's; this module shows the flag, shows that warning, and says nothing else
  about a due date.
- The wording, placement, colour, or icon of an overdue flag, a tempo, or a date on the page.
  Only the `Screen` data is promised, as for every other field (DEC-010); what is promised of
  the drawing is only that a record is never drawn as not overdue while `reviews` is null
  (section 4).
- Any screen but the twenty-six, any field of a record but those in section 3, any record kind
  but the seven registry owns, the entry `change-log` owns, the schedule `review-schedule`
  owns, the reference entry `reference-register` owns, the workflow record `workflows`
  owns, and the template and the report `reports` owns.
- Any filter but C-045's five, any value of one but a single one, filtering the controls on a
  hazard's own screen or a platform's rows, and any sort, search, count, or saved filter. A filter
  is held by the filter screen alone and is gone on `back` (C-045).
- A deleted hazard listed against a platform. A live `hazard-platform` link to a deleted hazard
  remains in the body, but no platform's query shows a hazard that is not live (registry C-019),
  so on the filter screen such a hazard is listed against no platform, and a platform filter does
  not find it (C-045). A band for a hazard against no platform, and the initial rating as a filter.
- Navigating from an item on the dashboard, the open-items screen, or the filter screen to the
  record it names: each leads only back to hazards (C-015). Acting on an item from them,
  acknowledging included, is done on the screen that owns the act.
- Flagging a record linked to nothing anywhere but the open-items screen, or on the dashboard;
  flagging a retired or deleted record; and treating a complete or abandoned workflow, a
  `control-platform` link, or a report's inclusion as a link (C-048). A reference entry linked
  only to a record since deleted is linked.
- The dashboard of a profile other than the active one, a dashboard item for a workflow on a
  hazard or with no subject, and any notification beyond what the dashboard shows (SL-11 out of
  scope).
- Editing, deleting, or retiring a template or a report, choosing which hazards of a platform a
  report holds, ordering them, or producing a report on more than one platform. `reports` 1.0 has no
  such operation and this surface has none either (`reports`' not-promised section).
- Which name is suggested to the download picker, where the user saves a report, and that a report
  is downloaded at the moment it is produced: `produceReport` resolves with the report screen, from
  which either form is downloaded on request (C-043).
- That the page draws the out-of-date warning in any particular place, colour, or wording. What is
  promised is the `Screen` data — the warning and its items on the prepare-report screen exactly
  when `outOfDate` is not empty — and that the page shows it before `produceReport` is offered is
  verified by demonstration (DEC-010, C-042).
- Showing a produced report's content as the records now are, or flagging a report whose hazards
  have changed since. The report screen shows the report as produced (C-043), and a hazard screen
  lists the reports that include it without saying whether any is out of date (C-044).
- Editing or deleting a reference entry, unlinking one, retiring one, or replacing its file.
  `reference-register` 1.0 has no such operation and this surface has none either: an entry's
  `name`, `link`, `path`, and `fileLocation` are what `createReference` stored, only `links`
  grows (C-034), and a reference made in error is answered by the history (C-028) rather than by
  a reversal. Retirement is REQ-067's fourth kind, which that contract records as having no home
  until a GATE ruling.
- Anything about a `link` or a `path` a user typed: that it is well formed, that it opens, that
  it resolves, or that it names the same thing on two machines. This surface shows both back as
  stored and neither is part of C-035's flag; nothing here opens, fetches, stats, or warns about
  one (`reference-register`'s not-promised section; DEC-003, DEC-022). The path half of REQ-078
  and of SL-10 criterion 4 is an open GATE ruling and is promised by no clause of this contract.
- The contents, integrity, type, or size of a stored file, and any way to open one from a screen
  of this module. What crosses this surface is a `StoredFileLocation` and an `EntryFileState`
  (C-033, C-035); the bytes are the user's, in the user's folder, opened with the program that
  made them (DEC-022). A file altered or truncated after Pivot wrote it is shown unflagged.
- Offering a link to a causal factor, a consequence, a report, or another reference entry. Three
  of those are in `LINKABLE_KINDS` and an entry written elsewhere may hold one, which C-034 still
  lists; no screen of this version offers one, because naming a causal factor or a consequence
  from a ref needs a `registry` read no contract exposes. `reports` owns `report` from 10.0, and a
  reference entry is still not offered a link to one: SL-09 asks for none and a report includes no
  reference entry (`reports` preamble). Widening the pickers is a later version.
- Naming a linked record beyond what the entry screen's own three `registry` lists give.
  `LinkedRecord.name` is null for a ref of any other kind and for a record no longer live
  (section 3); the ref is always shown, so the link is never dropped, but the user may see a kind
  and an id where a title would be better. Section 3's platform-name rule draws an id the same
  way, and SL-10 criterion 3 asks that everything the entry is linked to be listed, which C-034
  promises; the reading under which it also asks for a name for every kind is recorded in
  `docs/slices/SL-10.md` and is the one that would change C-034.
- The reverse direction: what a hazard, a control, or a platform is linked to. An entry holds its
  links and no other collection holds them (`reference-register` C-009, DEC-023), so a record's
  references are found by reading the register. At 11.0 a reference-entry filter lists the
  hazards and controls one entry links to (C-045), which is the direction from the entry; no
  screen lists, from a hazard, a control, or a platform, the entries that link to it.
- Any grouping, filtering, paging, search, count, or sort over the register — by kind linked to,
  by whether a file is flagged, by platform, or by author. `entries` is the one list in
  `reference-register` C-005's order (C-033). The filter by reference entry filters hazards and
  controls, not the register (C-045).
- That a `createReference` whose file was kept and whose entry was then refused leaves nothing
  behind. `store` 3.0 removes nothing from `files/`, so such a file stays in the folder
  unreferenced and this surface neither names it nor collects it (`reference-register` C-004,
  store's not-promised section). The screen reports the entry as not made, which is what it is.
- Any order, comparison, or grouping of `RatingBand`, and any colour, icon, or word beside
  a band: `rating` C-001 gives the band and this contract carries it unchanged (C-021).
  Filtering by band compares for equality alone (C-045); nothing filters above or below a band,
  and nothing sorts by one.
- That the same control linked to two hazards, or the same hazard on two platforms, is
  shown in one place: each is reached through its own screen, and this version says nothing
  about how a user finds the other.
- Re-reading the folder after it is opened, except where a clause says so. Another copy's
  save since this open is seen at `save` or `confirmRestore` (C-007) and on the next open,
  not before. Every screen is built from the working body, never from the folder.
- That a message survives the next operation, or that the check screen's messages are
  shown again after `acknowledgeCheck`.
- That a save or restore that rejected after `data.json` was committed
  (`store.save.data-written`) is reported as having happened: it is reported as not done,
  with the changes named as store's not-promised section describes, which errs toward
  saving again, and store C-004 makes that safe.
- A backup of recovered or restored working state before the next change to it (store C-013).
- Deleting or renaming a backup, choosing where a save state file is written, or writing
  one at all; restore reads one.
- Which screen follows a failure beyond what section 4 states.
- That `App` has any field but `screen`, or that two `Screen` values are the same object.
