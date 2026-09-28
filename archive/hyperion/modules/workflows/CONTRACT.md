# Contract: workflows
Version: 2.0 · Status: draft

At 2.0, three readings the 1.0 conformance session could not test are settled (DEC-038), and
every other 1.0 clause holds. **Which hazards a removal excludes from**: the rows that carry
the chosen control as confirmed at the moment of the completion call, not the hazards settled
at `settle-the-ratings`. This is C-008's rule that a demand is derived from the body at the
moment of the call, applied to the acts as well. So a completion also refuses while one of
those hazards has no settlement (C-007, C-008), and a control already excluded for a hazard is
not an act that can make a removal reject (C-009). **What a step that takes one record has
already recorded**: any entry at all, so a second submission is refused whichever record it
names (C-004). **Whether `describe-the-hazard` refuses a repeat**: it does not, because every
submission creates a new record (C-004). No operation, shape, stored field, or import changes.
The one new refusal is `StepIncompleteError` from `completeWorkflow`, an error class 1.0
already declared for that call.

Written for SL-07. Promises the guidance STK-007 asks for and the record of a completed workflow
STK-008 and STK-029 ask for: five named workflows, each a fixed sequence of named steps, each
step making the acts it names through the contracts that own the data, and each run stored as a
`workflow-record` that is sealed the moment it completes (REQ-008, REQ-036, REQ-037, REQ-038,
REQ-039, REQ-077). It owns the record kind `workflow-record`, which baseline has held since
CHG-001 and which no module has written until now.

This is one of the two composing modules DEC-004 placed above the record modules: "any operation
that spans record modules must be composed in `views` or `workflows`, never by one record module
reaching another". Every act a step makes is an act `registry` or `review-schedule` already
promises, made through its contract and never re-implemented here. What this module adds is the
sequence, the gate, and the record — and the fact that the act and the record of the step that
made it are written in one call, which is DEC-025 and is DEC-016's argument one layer up: a
consumer that made the act and then told the workflow could drop the second call, and no test of
either module would see the workflow record that is missing a step it in fact took.

A workflow is stored from its first step, not held in a screen. That is what makes REQ-049's "the
workflows that user has in progress" a fact about the saved data rather than about one open
browser tab, and it is what REQ-039 needs something to refuse: a record that only exists once it
is complete has no in-progress state to protect. The consequence is that every step is a change
to stored data and so carries its own change-log entry (C-010), which DEC-025 records as a cost
rather than hiding.

Three things SL-07's criteria do not settle are settled here, each with the reading it rejects
stated rather than passed over, as SL-10's were.

**What "add data" is.** Criterion 1 names five workflows and fixes the shape of all of them;
criteria 2 to 5 fix the content of four. Nothing fixes what the add-data workflow adds. The
reading taken is that it adds one hazard and what belongs to a hazard — its title, its causal
factors, its consequences, and the library controls on each side of it — because the other four
are each one subject and one family of acts, and because a hazard is the record every other kind
in this project hangs from (C-013). The rejected reading is a chooser over every record kind a
user may create, which would make the workflow's steps depend on the kind chosen and its step
list not a sequence but a tree; if that is the intended one, `WORKFLOW_STEPS['add-data']` and
C-013 are what change. This is the one thing in this contract that no acceptance criterion holds
up, and SL-07's criteria are recorded as drafted by a model for jay-pryor to accept or rewrite.

**What a completed review sets a last reviewed date on.** Criterion 3 says completing a review
workflow "sets the last reviewed date of each record reviewed". The reading taken is the platform
the review is on and each hazard the reviewer marked reviewed at `review-the-hazards` — the
records a person made a decision about (C-006). The rejected reading also takes in each control
shown under those hazards, which `SCHEDULABLE_KINDS` allows and which would set a date on a
record nobody entered a decision for; a control is reviewed as part of the hazard's row, and a
date set from a decision that was never made is what HZ-009 is about. If the second reading is
intended, C-006's list of refs is what changes and nothing else.

**What "a workflow abandoned mid-way must leave the records as they were" means.** SL-07's lens
list asks the partial-failure lens for it, and it admits two readings. The reading taken is that
abandoning writes nothing further: every act the workflow already made stands, each already in
the history with its own entry, and the abandoned record stays with every entry it had (C-012).
The rejected reading is a rollback, which no contract of this project offers and which `registry`
forbids by construction — a global ID is assigned once and never again (registry C-002) and a
deletion keeps the row (registry C-005), so "as they were" cannot be reached by undoing. What the
lens has left to find under the reading taken is the real risk, and it is C-009: a completion
makes several acts, and either all of them are made or none is.

## 1. Purpose
Guide a user through one of five named workflows, making the acts each step names and keeping the
record of what was decided, done, and produced.

## 2. Operations
In `contract.js`. Every operation is asynchronous and returns a promise (DEC-012). Every
operation is a function of the `DataBody` passed in and, for the five that change it, of the
baseline clock, of `change-log.recordChange`, and of whatever `registry` and `review-schedule`
operations its clause names. None reads or writes the data folder, the browser's storage, or
anything else (DEC-006). A consumer holds the working body from `store.load`, replaces it with
the `body` each changing operation returns, and passes it to `store.save` when the user saves.
Each changing operation takes registry's `Act`: one call, one profile, one instant, and the
platform the user was working on (DEC-016).

| Operation | Signature | Verified by |
|---|---|---|
| startWorkflow | `(body: DataBody, act: Act, fields: StartFields) → WorkflowChange` | conformance |
| submitStep | `(body: DataBody, act: Act, id: WorkflowRecordId, submission: StepSubmission) → WorkflowChange` | conformance |
| advanceStep | `(body: DataBody, act: Act, id: WorkflowRecordId) → WorkflowChange` | conformance |
| completeWorkflow | `(body: DataBody, act: Act, id: WorkflowRecordId, fields: CompletionFields) → WorkflowChange` | conformance |
| abandonWorkflow | `(body: DataBody, act: Act, id: WorkflowRecordId) → WorkflowChange` | conformance |
| getWorkflow | `(body: DataBody, id: WorkflowRecordId) → WorkflowRecord \| null` | conformance |
| listWorkflows | `(body: DataBody) → readonly WorkflowRecord[]` | conformance |
| progressOf | `(body: DataBody, id: WorkflowRecordId) → WorkflowProgress` | conformance |
| stepDemand | `(body: DataBody, id: WorkflowRecordId) → StepDemand` | conformance |
| reviewOmissions | `(body: DataBody, id: WorkflowRecordId) → readonly ReviewOmission[]` | conformance |

Criterion 1 is verified by demonstration and not by any of these: that the current step, the
steps done, and the steps remaining are *visible* is a property of a screen, and `views` 8.0 and
a review row carry it (DEC-007, DEC-010). What conformance holds is the half that is data —
that `progressOf` gives the three, that they concatenate to the workflow's step list, and that
every workflow has one — which is why REQ-037's `verification_method` stays `demonstration` and
its `verified_by` is a `REV-nnn`, not a test id (section 7).

A conformance test starts from `schema.emptyDataBody()` or a body it builds with `registry`'s
own operations, holds the baseline clock where a clause names it, and needs no folder. The
records a workflow acts on are made through `registry`'s contract and read back through it —
`listPlatformHazards`, `getHazardDetail`, `getRatings` — never by reading a collection of
registry's directly, as registry's own suite reads `change-log`'s entries through `change-log`
(registry section 2). The entries this module's acts wrote are read back through
`change-log.listEntries` and `listHistory`, and the last reviewed dates a completed review set
through `review-schedule.getSchedule`. C-009's all-or-nothing is reached by putting a body in a
state where one of a completion's acts must reject — a `review-schedule` entry that module cannot
read, or an entry of `collections['change-log-entry']` that `change-log` cannot read — and
asserting the input body is deep-equal to what it was. A control already excluded for a hazard
does not reach it: from 2.0 that hazard is not one the removal covers (C-007).

## 3. Data shapes
From `baseline/types.js`: `WorkflowRecordId`, `HazardId`, `ControlId`, `PlatformId`,
`UserProfileId`, `ActiveProfile`, `ControlKind`, `ConsequenceLevel1to5`, `LikelihoodLetterAtoG`,
`DateAest`, `TimestampAest`, `RecordKind`, `RecordStatus`, `RecordRef`. From
`baseline/schema.js`: `DataBody`, whose `collections['workflow-record']` is the one collection
this module reads and writes. From `modules/registry/contract.js`: `Act` and `OmissionReason`.
Defined in `contract.js`:

**The five workflows**: `WORKFLOW_KINDS` — `add-data`, `onboard-platform`, `review-data`,
`remove-control`, `transfer-ownership`, the five SL-07 names. A sixth is an Interface change,
not a value a caller may pass (C-001).

**The steps**: `WORKFLOW_STEPS`, one ordered list of `WorkflowStep` per kind, fixed by this
contract. Every list ends at `record-the-outcome`.

| Workflow | Steps |
|---|---|
| add-data | `name-the-hazard`, `describe-the-hazard`, `choose-controls`, `record-the-outcome` |
| onboard-platform | `name-the-platform`, `select-hazards`, `record-the-outcome` |
| review-data | `review-the-hazards`, `record-the-outcome` |
| remove-control | `choose-the-control`, `settle-the-ratings`, `record-the-reason`, `record-the-outcome` |
| transfer-ownership | `choose-the-owner`, `record-the-outcome` |

**What a subject may be**: `SUBJECT_KINDS` — `hazard` and `platform`. A `RecordRef` of any other
kind is refused (C-001).

**The record**, the baseline record header narrowed to this kind and id, plus its own fields
(DEC-005), in `collections['workflow-record']` keyed by its id:

- `WorkflowRecord`: `kind: 'workflow-record'`, `id: WorkflowRecordId`, `workflowKind:
  WorkflowKind`, `subject: RecordRef | null` — the record the workflow is performed on —
  `state: 'in-progress' | 'complete'`, `currentStep: WorkflowStep | null`, `startedOnAest:
  DateAest`, `completedOnAest: DateAest | null`, `completedBy: UserProfileId | null`,
  `outcome: string | null`, and `entries: readonly WorkflowEntry[]`. `createdBy` and
  `createdAtAest` are who started the workflow and when; `updatedBy` and `updatedAtAest` are the
  last act that changed it. `status` is `'live'` from `startWorkflow` and `'deleted'` after
  `abandonWorkflow`, and the row stays either way (C-012; REQ-010).
- `WorkflowEntry`: `step: WorkflowStep`, `entryKind: 'decision' | 'action' | 'outcome' |
  'omission'`, `text: string`, `ref: RecordRef | null`, `byProfileId: UserProfileId`, and
  `atAest: TimestampAest`. Appended once and never altered (C-011). `decision` is a choice a
  person made that changed no stored record; `action` names a record this module changed through
  another contract; `outcome` is what the user wrote at the last step; `omission` is a hazard the
  platform's query could not carry as a row (C-006).

The unit is in the type name and not in a comment (IMP-05): `startedOnAest` and `completedOnAest`
are a `DateAest`, a calendar date in AEST with no time and no zone to confuse (ASM-005), which is
criterion 4's "AEST date"; every entry's `atAest` is a `TimestampAest`, an instant. A residual
value is a `ConsequenceLevel1to5` or a `LikelihoodLetterAtoG` and never the DEC-001 integer
(DEC-002, `baseline/types.js`). This contract holds no band, no duration, and no count of
anything.

**The act**: registry's `Act` `{ profile: ActiveProfile, madeForPlatformId: PlatformId | null }`,
unchanged (registry section 3, DEC-016). It is passed through to every `registry` act a step
makes and to the entry C-010 writes for the workflow record itself. Both properties are required
and never defaulted. `review-schedule`'s `ScheduleAct` needs a third, `affectedPlatformIds`, and
this module supplies it from `registry.platformsAffected` of the record being reviewed rather
than from the caller (C-006, DEC-026) — the caller has no reason to know which platforms a
hazard reaches and this module imports the contract that does.

**Field bundles** a consumer supplies: `StartFields` `{ workflowKind, subject }`;
`CompletionFields` `{ outcome: string }`; and `StepSubmission`, one shape per step, told apart by
its `step`, which must equal the record's `currentStep` (C-004). The ten shapes are in
`contract.js`; `settle-the-ratings` carries a `consequence` and a `likelihood` whether the user
changed them or confirmed them, so confirming and re-entering are one shape and the step cannot
be passed by saying nothing (C-008; REQ-077).

**Reads**: `WorkflowProgress` `{ record, steps, done, current, remaining }`, criterion 1's three
from one call; `StepDemand` `{ step, satisfied, outstanding }`, what the current step still asks;
`ReviewOmission` `{ id, reason, detail }`, a hazard the platform's query named in `omitted`,
carrying `registry`'s own `OmissionReason` and never a reason of this module's (registry C-019).

**Changes**, what a changing operation returns: `WorkflowChange` `{ body: DataBody, workflow:
WorkflowRecord }`, the body as it now is and the record as it now is. The body passed in is
untouched (C-003).

Every field of every stored workflow record is a string, a boolean, null, or an array of objects
of those, so the body after any operation is deep-equal to itself after JSON serialisation and
parsing, which is what `store` C-001 carries across a save and a load. "Live" everywhere in this
contract means a workflow record whose own `status` is `'live'`; "complete" means its `state` is
`'complete'`, which is a different field and a different question — an abandoned workflow is not
live and is not complete, and a complete one is live.

## 4. Error conditions
Signalled as a rejected promise carrying the named error class. "Body unchanged" means the body
passed in is deep-equal to what it was before the call, which C-003 promises of every call, and
that nothing was returned as a new body.

| Operation | Condition | Signalled as | Caller obligation |
|---|---|---|---|
| every operation | an entry of `collections['workflow-record']` is not a `WorkflowRecord` (C-004) | `MalformedWorkflowError` naming the entry's key and one sentence naming the field; nothing returned; body unchanged | Name the record to the user; show no workflow and no progress from that collection |
| every operation but `startWorkflow` and `listWorkflows` | no entry of the collection has `id` | `UnknownWorkflowError` naming the value; body unchanged | Offer only workflows `listWorkflows` gave |
| every changing operation | the record's `state` is `'complete'` | `WorkflowCompleteError` carrying the id; body unchanged | Say the workflow is complete; offer nothing that would change it (REQ-039) |
| every changing operation but `startWorkflow` | the record's `status` is not `'live'` | `WorkflowNotLiveError` carrying the id and the status; body unchanged | Say the workflow was abandoned; nothing at this version sets a status back (not promised) |
| every changing operation | `act` is missing, or `act.profile` is missing, or its `id` is not a user profile id | `MissingProfileError`; body unchanged | Show the profile screen (REQ-055) |
| every changing operation | `act.madeForPlatformId` is absent or is neither null nor a platform id | `InvalidActError` naming the value; body unchanged | Pass the platform the screen is on, or null; never leave it off (DEC-016) |
| startWorkflow | `fields.workflowKind` is outside `WORKFLOW_KINDS` | `UnknownWorkflowKindError` naming the value; body unchanged | Offer the five of `WORKFLOW_KINDS` |
| startWorkflow | `fields.subject` is absent; or is null for `review-data`, `remove-control`, or `transfer-ownership`; or is not null for `add-data` or `onboard-platform`; or is of a kind outside `SUBJECT_KINDS`; or names a platform no live platform record has | `InvalidSubjectError` carrying the kind and the value; body unchanged | Ask which platform the workflow is on, from `registry.listPlatforms`; pass null for the two that create their own subject |
| submitStep | `submission.step` is not the record's `currentStep` | `WrongStepError` carrying the expected step and the value; body unchanged | Submit for the step `progressOf` gives as `current` |
| submitStep at `name-the-hazard`, `name-the-platform`, `choose-the-control`, `choose-the-owner`, or `record-the-reason` | the step has already recorded an entry for this workflow, whatever record the submission names | `AlreadyRecordedError` carrying the step and the ref of the entry already recorded, null for `record-the-reason`; body unchanged | Show what the step has recorded; a correction is a new workflow (not promised) |
| submitStep at `review-the-hazards`, `settle-the-ratings`, `choose-controls`, or `select-hazards` | the step has already recorded an entry naming the same hazard or control | `AlreadyRecordedError` carrying the step and that ref; body unchanged | Show what the step has recorded; a correction is a new workflow (not promised) |
| submitStep at `review-the-hazards` | `hazardId` is not a row of `registry.listPlatformHazards` for the subject platform | `HazardNotInReviewError` carrying both ids; body unchanged | Offer only the rows that query gave; an omitted hazard is recorded as one (C-006) |
| submitStep at `review-the-hazards` | `note` is empty once trimmed | `InvalidNoteError` naming the value; body unchanged | Ask what the reviewer decided |
| submitStep at `choose-the-control` | no row of `registry.listPlatformHazards` for the subject platform carries that control with state `'confirmed'` | `ControlNotOnPlatformError` carrying both ids; body unchanged | Offer only controls confirmed for a hazard of that platform (registry C-021) |
| submitStep at `record-the-reason` | `text` is empty once trimmed | `InvalidReasonError` naming the value; body unchanged | Ask why the control is coming off (REQ-058) |
| submitStep | the `registry` operation the step names rejects | that error unchanged; nothing of this module written; body unchanged | Name it to the user; the step has not been recorded |
| advanceStep | the current step's demand is unmet (`stepDemand(...).satisfied` is false) | `StepIncompleteError` carrying the step and the outstanding refs; body unchanged | Show what is outstanding; at `settle-the-ratings` this is REQ-077's refusal |
| advanceStep | the current step is `record-the-outcome` | `LastStepError` carrying the id; body unchanged | Complete the workflow instead |
| completeWorkflow | the current step is not `record-the-outcome` | `NotAtOutcomeError` carrying the id and the step; body unchanged | Finish the steps before it |
| completeWorkflow | `fields.outcome` is empty once trimmed | `InvalidOutcomeError` naming the value; body unchanged | Ask what the workflow produced (REQ-038) |
| completeWorkflow on `remove-control` | a row of `registry.listPlatformHazards` for the subject platform carries the chosen control as `'confirmed'`, as at the body of the call, and no `settle-the-ratings` entry names that hazard | `StepIncompleteError` carrying `'settle-the-ratings'` and the refs of every such hazard; no exclusion made; body unchanged (C-007, C-008) | Show the hazards whose residual has not been settled; the workflow cannot go back a step, so it is abandoned and started again (REQ-077) |
| completeWorkflow | one of the completing acts rejects — whatever `registry.excludeControlFromPlatform` or `review-schedule.completeReview` rejects with | that error unchanged; no act of the completion made; body unchanged (C-009) | Name it to the user; the workflow is still at `record-the-outcome` and may be completed again once the cause is cleared |
| every changing operation | `change-log.recordChange` rejects, which for a body this module wrote can only be an entry of `collections['change-log-entry']` that `change-log` cannot read | that error unchanged, `MalformedEntryError`; nothing written; body unchanged | Name the entry to the user; nothing may be changed while the history cannot be read (C-010) |
| stepDemand | the record's `state` is `'complete'`, or its `status` is not `'live'` | `WorkflowCompleteError` or `WorkflowNotLiveError`; nothing returned | Ask only of a workflow in progress; `progressOf` answers for any workflow |

A body with no `collections['workflow-record']` is not an error: it holds no workflow, so
`getWorkflow` is null, `listWorkflows` is empty, and the first `startWorkflow` creates the
collection (C-001). A read never rejects for an id nothing has except by naming it:
`getWorkflow` resolves with null, and the four reads that need a record reject with
`UnknownWorkflowError`.

When two conditions of an operation hold at once, the one signalled is the first of these that
applies, so that a conformance test has one expected rejection and not a choice: a malformed
workflow record in the collection; a missing profile; an ill-formed act; an unknown workflow; a
complete workflow; a workflow that is not live; a submission for the wrong step; a field value
(`InvalidOutcomeError`, `InvalidReasonError`, `InvalidNoteError`,
`UnknownWorkflowKindError`, `InvalidSubjectError`); a record the step has already recorded; a
record the step will not take (`HazardNotInReviewError`, `ControlNotOnPlatformError`); a step
whose demand is unmet, which for `completeWorkflow` is a hazard of a removal with no settlement
(`StepIncompleteError`); and last, whatever `registry`, `review-schedule`, or
`change-log.recordChange` rejects with, which this module reaches only once it has accepted the
call. The body is unchanged whichever fires. So a blank note for a hazard that is not on the
platform is `InvalidNoteError`, and an `advanceStep` on a complete workflow is
`WorkflowCompleteError` rather than `LastStepError`, and a blank outcome on a removal with an
unsettled hazard is `InvalidOutcomeError` rather than `StepIncompleteError`.

## 5. Behavioural promises

- **C-001 A workflow is one of five, started on the record it is performed on.** After
  `startWorkflow(body, act, { workflowKind, subject })` resolves with `{ body: b, workflow: w }`:
  `w.id` is a fresh `WorkflowRecordId` held by no entry of `collections['workflow-record']`;
  `w.workflowKind` is `workflowKind`; `w.subject` is `subject`; `w.state` is `'in-progress'`;
  `w.currentStep` is `WORKFLOW_STEPS[workflowKind][0]`; `w.startedOnAest` is the baseline clock's
  `todayAest()`; `w.completedOnAest`, `w.completedBy`, and `w.outcome` are null; `w.entries` is
  empty; `w.kind` is `'workflow-record'`; `w.status` is `'live'`; `w.createdBy` and `w.updatedBy`
  are `act.profile.id`; `w.createdAtAest` and `w.updatedAtAest` are the clock's now;
  `getWorkflow(b, w.id)` is deep-equal to `w`; and `listWorkflows(b)` is `listWorkflows(body)`
  plus `w`. `workflowKind` outside `WORKFLOW_KINDS` rejects, so this version guides five
  workflows and no others (REQ-037). `subject` is required and never defaulted:
  `review-data`, `remove-control`, and `transfer-ownership` each name a `{ kind: 'platform', id }`
  whose id a live entry of `collections.platform` has, checked through `registry.listPlatforms`
  and by no read of a collection this module does not own (C-003); `add-data` and
  `onboard-platform` pass null, because the record each is about does not exist until its first
  step and is set there (C-013). Any other combination rejects with `InvalidSubjectError` and
  nothing is written. Nothing stops two workflows of one kind running on one platform at once:
  they are two records, they are both in `listWorkflows`, and each is completed or abandoned on
  its own (not promised). (REQ-037, REQ-038; SL-07 criterion 1.)
- **C-002 A workflow is a sequence of named steps, and its progress is one call.** For every
  `WorkflowKind`, `WORKFLOW_STEPS[kind]` is a non-empty list of distinct `WorkflowStep` values
  whose last is `record-the-outcome`, and it is the same list in every call, in every body, and
  for every user: the sequence is this contract's, not data and not a caller's. `progressOf(body,
  id)` resolves with `{ record, steps, done, current, remaining }` where `steps` is
  `WORKFLOW_STEPS[record.workflowKind]`; `current` is `record.currentStep`; `done` is the steps
  of `steps` before `current`, in order; `remaining` is those after it, in order; and `done`,
  `current` where it is not null, and `remaining` concatenate in that order to `steps` exactly —
  no step is in two of them and none is in none. For a complete workflow `current` is null,
  `done` is `steps`, and `remaining` is empty (C-005). `advanceStep` moves `currentStep` to the
  next step of the list and to no other, one step per call, never backwards and never past
  `record-the-outcome`, which rejects with `LastStepError`. So every consumer showing which step
  a user is on, which are done, and which remain reads them here and keeps no step list of its
  own, and a workflow's steps cannot be shown in one place and counted differently in another
  (REQ-037 is `views`' half of the showing, at SL-07). (REQ-037; SL-07 criterion 1.)
- **C-003 The body is a value, and this module writes one collection.** No operation modifies the
  body passed in: after any call, resolved or rejected, that body is deep-equal to what it was.
  The `body` a changing operation returns differs from the one passed in only in the one entry of
  `collections['workflow-record']` that operation's clause names, in the entries the acts of
  C-006, C-007, and C-013 caused in the collections those acts' own contracts name, and in the
  entries of `collections['change-log-entry']` those acts and this module's own act appended
  (C-010); every other collection and every sequence is deep-equal to the input's.
  `collections['workflow-record']` is the only collection this module writes directly: a hazard,
  a control, a platform, a link, a justification, a rating, a review schedule, and a change-log
  entry are written by the contract that owns each, through the operations C-006, C-007, C-010,
  and C-013 name, and never by this module reaching into a collection. No operation reads or
  writes the data folder, the browser's storage, or any global state; the only things outside its
  arguments an operation reads are the baseline clock and the three module contracts the manifest
  lists.
  This module imports no `store`, `views`, `rating`, `profiles`, or `reference-register` at any
  version, and nothing imports it but `views` (DEC-004, DEC-006). It keeps no index, no cache,
  and no state between calls: two `submitStep` calls on the same body with the same submission
  behave the same way, whatever ran before. (DEC-006; REQ-004 as this module's half of it.)
- **C-004 A malformed record is refused or named, and a submission belongs to the step the
  workflow is at.** An entry of `collections['workflow-record']` is malformed when its key
  differs from its `id`, its `id` is not a `WorkflowRecordId`, its `kind` is not
  `'workflow-record'`, its `status` is not a `RecordStatus`, a header id is not a user profile id,
  a header time is not a `TimestampAest`, its `workflowKind` is outside `WORKFLOW_KINDS`, its
  `subject` is neither null nor a record kind and a string id, its `state` is outside the two,
  its `currentStep` is not a step of its kind's list or is null while `state` is `'in-progress'`
  or not null while it is `'complete'`, a date field is not a `DateAest` where it is not null,
  `completedBy` is neither null nor a user profile id, `outcome` is neither null nor a string, or
  an entry of `entries` is not a `WorkflowEntry`. Every operation rejects with
  `MalformedWorkflowError` naming the entry's key and returns nothing: a list of workflows is
  never shown with one silently missing from it, and no workflow is shown as in progress, or as
  finished, because its record could not be read. `submitStep` takes a submission whose `step`
  equals the record's `currentStep` and rejects any other with `WrongStepError`, so a step is
  never recorded out of order. A step that takes one record — `name-the-hazard`,
  `name-the-platform`, `choose-the-control`, `choose-the-owner`, `record-the-reason` — records
  one entry per workflow: once it has, a second submission rejects with `AlreadyRecordedError`
  whatever record or text it names, carrying the ref of the entry already recorded (null for
  `record-the-reason`) and changing nothing. So a second `name-the-hazard` creates no second
  hazard and does not move `subject`, and a second `choose-the-control` does not change which
  control the removal is about. The steps that take one per record — `review-the-hazards` and
  `settle-the-ratings` per hazard, `choose-controls` per control, `select-hazards` per hazard —
  record one entry per distinct record and refuse a repeat of the same one with
  `AlreadyRecordedError` carrying that ref. `describe-the-hazard` refuses nothing as a repeat:
  every accepted submission creates a new causal factor or consequence and records one entry
  for it, so two submissions with the same `part` and text are two records, as two hazards with
  one title are (registry C-010, not promised there). Either way an entry is appended and never
  altered (C-011). (REQ-037, REQ-038; SL-07 criteria 1 and 4; DEC-038.)
- **C-005 Completing records the workflow, the date, the user, and the outcome.** After
  `completeWorkflow(body, act, id, { outcome })` resolves with `{ body: b, workflow: w }`:
  `w.state` is `'complete'`; `w.currentStep` is null; `w.completedOnAest` is the baseline clock's
  `todayAest()`, which is criterion 4's AEST date; `w.completedBy` is `act.profile.id`, which is
  its user; `w.outcome` is `outcome` trimmed; `w.entries` is what it was plus the entries the
  completing acts of C-006 and C-007 caused and one `outcome` entry at step
  `record-the-outcome` carrying that text, `act.profile.id`, and the clock's now; `w.id`,
  `w.kind`, `w.workflowKind`, `w.status`, `w.startedOnAest`, `w.createdBy`, and `w.createdAtAest`
  are what they were; `w.subject` is what it was; and `w.updatedBy` and `w.updatedAtAest` are
  `act.profile.id` and the clock's now. So the completed record holds the workflow
  (`workflowKind` with `subject`), the date, the user, and every decision, action, and outcome
  entered, which is the whole of REQ-038, and it holds them on one record rather than across the
  history. A blank outcome rejects and nothing is written, so no workflow is recorded as complete
  with nothing said about what it produced. A workflow not at `record-the-outcome` rejects with
  `NotAtOutcomeError`: completion is the end of the sequence and not a way past it. (REQ-038;
  STK-008, STK-029; SL-07 criterion 4.)
- **C-006 A review workflow covers every hazard of its platform or names it omitted, and
  completing it sets the last reviewed date of each record reviewed.** For a `review-data`
  workflow on platform `P`, the hazards it is about are exactly
  `registry.listPlatformHazards(body, P)`: its `rows` are the hazards that may be marked
  reviewed, and `reviewOmissions(body, id)` gives one `ReviewOmission` per entry of its
  `omitted`, carrying that entry's `reason` and `detail` unchanged. So every hazard linked to
  that platform that is neither deleted nor retired is a hazard this workflow presents or names
  as omitted, never neither and never both — the property is registry C-019's and this clause is
  that it is reached from here and nowhere else, so a review cannot cover a different set of
  hazards from the assessment screen or a report (HZ-004; REQ-008). `submitStep` at
  `review-the-hazards` for a hazard that is not a row rejects with `HazardNotInReviewError` and
  records nothing: an omitted hazard is never marked reviewed. Each accepted submission appends
  one `decision` entry carrying the hazard's ref and the note trimmed. `stepDemand` is satisfied
  only when every row of the query, as at the body of the call, carries a decision (C-008).
  At `completeWorkflow`, one `omission` entry is appended per entry of `omitted` as at the body
  of that call, so the completed record says which hazards the review could not carry and why;
  and for each ref in the list — `{ kind: 'platform', id: P }` first, then each hazard given a
  decision, in ascending order of the number in its global ID — for which
  `review-schedule.getSchedule(body, ref)` is not null, `review-schedule.completeReview` is
  called once, with a `ScheduleAct` whose `profile` and `madeForPlatformId` are the act's and
  whose `affectedPlatformIds` is `registry.platformsAffected` of that ref, and one `action` entry
  is appended naming the ref. A ref with no live schedule has no last reviewed date to set and is
  not called for; it is still reviewed and still carries its `decision` entry. So the last
  reviewed date of a record moves only where a person decided about that record in a completed
  review, which is REQ-015's "only when a review workflow on it is completed" reached through the
  one operation review-schedule C-007 allows. The controls shown under a hazard's row are
  reviewed as part of it and are not called for; the preamble records the rejected reading.
  (REQ-008, REQ-015 as `review-schedule`'s; HZ-004; SL-07 criterion 3.) *Mitigation support for
  HZ-004: the mitigation clause is registry C-019, and this clause is what a review reaches it by.*
- **C-007 Removing a control from a platform is one exclusion per hazard, with one reason, at
  completion.** For a `remove-control` workflow on platform `P`: `choose-the-control` takes one
  `ControlId` that a row of `registry.listPlatformHazards(body, P)` carries with `state:
  'confirmed'`, rejecting any other with `ControlNotOnPlatformError`, and appends one `decision`
  entry naming the control. The hazards the removal is about are every row of that query
  carrying that control confirmed — which is the whole of "each hazard on that platform the
  control was linked to" (REQ-077) — and, like every demand of C-008, that set is read from the
  body at the moment of each call and is never a list kept from an earlier step: it is what
  `settle-the-ratings` demands (C-008), and it is what `completeWorkflow` excludes from.
  `record-the-reason` takes one text that is not empty once trimmed and appends one `decision`
  entry carrying it; the text is refused here as well as by `registry` so the user is told where
  they typed it (registry C-020, REQ-058). At `completeWorkflow`, the set is read again from the
  body of that call. If any hazard in it has no `settle-the-ratings` entry — one whose control
  was confirmed on `P` after the step was passed — the call rejects with `StepIncompleteError`
  carrying `'settle-the-ratings'` and the refs of every such hazard, ascending as strings, and
  nothing is written, so no control comes off a hazard whose residual nobody settled (REQ-077).
  Otherwise, for each hazard in the set in ascending order of the number in its global ID,
  `registry.excludeControlFromPlatform(body, act, { hazardId, controlId, platformId: P, text })`
  is called once with that one reason, and one `action` entry is appended naming the
  justification it wrote. A hazard settled at `settle-the-ratings` that is no longer in the set
  at completion — its control since excluded, or the hazard since deleted, retired, or omitted
  from the query — is not excluded from and gets no `action` entry; its settlement entry stands
  as recorded (C-011). A set that is empty at completion makes no exclusion, and the workflow
  completes with its decisions and outcome and no `action` entry for an exclusion. The
  exclusions are made at completion and never at
  `settle-the-ratings`, so every residual is settled before any control comes off, which is what
  criterion 5 means by "before the removal is saved" under DEC-017's reading of that phrase. No
  control is taken off any platform but `P`, and no control but the one chosen: a control
  confirmed for a hazard on another platform is untouched, which is the whole point of the
  hazard-control-platform triple (DEC-013, registry C-021). (REQ-058, REQ-077; SL-07 criterion 5;
  DEC-038.)
- **C-008 A step's demand is what it still asks, and no step is passed with it unmet.**
  `stepDemand(body, id)` resolves with `{ step, satisfied, outstanding }` for a live workflow in
  progress, where `step` is the record's `currentStep` and, at every step but
  `record-the-outcome`, `satisfied` is false exactly when `advanceStep(body, act, id)` would
  reject with `StepIncompleteError`. At `record-the-outcome`, which is never advanced past,
  `satisfied` is always false and `outstanding` is exactly the refs `completeWorkflow` would
  reject with in a `StepIncompleteError`: for `remove-control` the hazards C-007 names as
  confirmed for the chosen control with no settlement, and for every other kind empty. The
  demand of each step:
  `name-the-hazard`, `name-the-platform`, `choose-the-control`, `choose-the-owner`, and
  `record-the-reason` are satisfied once their one entry is recorded, with `outstanding` empty;
  `describe-the-hazard`, `choose-controls`, and `select-hazards` are always satisfied with
  `outstanding` empty, so a hazard may be added with no causal factor and a platform onboarded
  with no hazard; `record-the-outcome` is never satisfied, because it is passed by completing the
  workflow and not by advancing (C-002), and its `outstanding` is as above; `review-the-hazards` is satisfied when every row of
  `registry.listPlatformHazards(body, subject.id)` carries a decision, with `outstanding` the
  refs of those that do not; and `settle-the-ratings` is satisfied when every hazard the chosen
  control is confirmed for on that platform carries a settlement, with `outstanding` the refs of
  those that do not. `outstanding` is ascending as strings within a kind. The demand is derived
  from the body at the moment of the call and from no list kept when the step began, so a hazard
  linked to the platform after the review started is outstanding and one whose row the query can
  no longer build is not, and the demand and the refusal cannot disagree.
  At `settle-the-ratings` this is REQ-077: a submission carries the consequence and the
  likelihood whether the user confirmed them or re-entered them, so there is no way to satisfy
  the step by saying nothing, and `advanceStep` refuses while any hazard is outstanding and names
  which. Where the values given differ from the live residual rating,
  `registry.setRating(body, act, { hazardId, platformId, stage: 'residual', consequence,
  likelihood })` is called and one `action` entry is appended; where they equal it, no registry
  call is made — registry C-029 refuses a change that changes nothing — and one `decision` entry
  is appended recording that the values were confirmed as they stand, with the two values in its
  text. Either way the record says a person settled that hazard's residual before the control
  came off it. (REQ-008, REQ-077; HZ-002; SL-07 criteria 3 and 5.) *Mitigation support for
  HZ-002: the mitigation clause is registry C-017, which keeps a residual what the assessor
  entered; this clause is what makes a person enter it when a control is taken away.*
- **C-009 A completion is all of its acts or none of them.** `completeWorkflow` makes the acts
  C-006 and C-007 name, appends the entries for them, seals the record (C-005), and records its
  own act (C-010), in one call. If any of those rejects — a `review-schedule.completeReview` on a
  schedule that is not live, a `registry.excludeControlFromPlatform` whose own entry cannot be
  recorded, a `change-log.recordChange` on a history that cannot be read —
  the call rejects with that error and the body passed in is deep-equal to what it was: no last
  reviewed date is set, no justification is written, no link is superseded, no entry of any
  collection is appended, and the workflow record is untouched and still at `record-the-outcome`.
  There is no state in which a completion has made some of its acts, and no `WorkflowRecord`
  whose `state` is `'complete'` whose acts were not all made. This is what the partial-failure
  lens has to find, and it is reachable in a test because the body is a value (DEC-006): the
  implementation builds each act's body on the last and returns the chain only when every one has
  resolved. The same holds of `submitStep`: the `registry` act and the entry for it are one call
  or neither. (SL-07 criteria 3, 4 and 5; the partial-failure lens the slice names.)
- **C-010 No change this module makes is unrecorded, and no step is written without its entry.**
  Each of `startWorkflow`, `submitStep`, `advanceStep`, `completeWorkflow`, and
  `abandonWorkflow` calls `change-log.recordChange` exactly once for the workflow record, with
  `act.profile` and a `RecordedChange` whose `records` are that one record as it was — null where
  `startWorkflow` created it — and as it now is; `madeForPlatformId` is `act.madeForPlatformId`
  unchanged, and `affectedPlatformIds` is `registry.platformsAffected` of `w.subject` when it is
  not null and of a kind registry owns, and empty otherwise (DEC-026). The acts a step or a
  completion makes through `registry` and `review-schedule` each record their own entry in their
  own call (registry C-023, review-schedule C-012), so a step that makes an act appends two
  entries and a step that only records a decision appends one. There is no operation of this
  contract that writes a workflow record and no entry, so starting, every step, every advance,
  the completion, and the abandonment are each in the history with the previous and new value of
  every field that changed (`change-log` C-002) — which is what puts a workflow record under
  REQ-010's and REQ-045's clauses for the kind no module wrote until now. When `recordChange`
  rejects, the operation rejects with that error and the body passed in is unchanged (C-009). A
  read of this contract writes nothing and records nothing. (REQ-010, REQ-045 as `change-log`'s,
  reachable for this kind only through this clause; HZ-005; DEC-016, DEC-025, DEC-026.)
- **C-011 A complete record is sealed, and an entry is appended once and never altered.** Every
  changing operation of this contract — `submitStep`, `advanceStep`, `completeWorkflow`, and
  `abandonWorkflow` — rejects with `WorkflowCompleteError` when the record's `state` is
  `'complete'`, carrying its id, changing nothing and writing no entry. There is no operation on
  this surface that edits a field of a workflow record, complete or not: `outcome`,
  `completedOnAest`, `completedBy`, `workflowKind`, `startedOnAest`, and every entry of `entries`
  are written once by the operation whose clause names them and by nothing else, and `entries` is
  only ever appended to — no operation removes, reorders, or rewrites one, so a decision entered
  at step two reads the same after step three and after completion. Since
  `collections['workflow-record']` is written by this module alone (C-003) and no other contract
  of this project exposes an operation over it, a completed workflow record cannot be changed
  through any contract: that is REQ-039 kept by there being no operation that would do it rather
  than by a check anyone has to remember (P2). What a user may still change is the records the
  workflow acted on — a rating re-entered through `registry.setRating` after a review is
  completed is a change to the rating, with its own entry, and does not touch the review's record
  of what it found. (REQ-038, REQ-039; ASM-002; SL-07 criterion 4.)
- **C-012 Abandoning a workflow ends the guidance, not the acts.** After `abandonWorkflow(body,
  act, id)` resolves with `{ body: b, workflow: w }` for a live workflow in progress: `w.status`
  is `'deleted'`; `w.state`, `w.currentStep`, `w.entries`, `w.subject`, and every other field are
  what they were; `w.updatedBy` is `act.profile.id` and `w.updatedAtAest` is the clock's now;
  `getWorkflow(b, id)` is deep-equal to `w`; `listWorkflows(b)` is `listWorkflows(body)` without
  it; and `b` differs from `body` only by that entry and the entry of C-010. No act the workflow
  already made is undone: a hazard it created is still there with its global ID, a control it
  confirmed is still on its platform, a rating it re-entered still holds the values entered, and
  each of those is still in the history with the entry its own module wrote. So the records are
  left exactly as they were at the moment of abandonment, which is the reading of SL-07's
  partial-failure note the preamble records; the other, a rollback, is not reachable through any
  contract of this project and is named in the not-promised section. An abandoned workflow is
  readable for ever through `getWorkflow` and holds every entry it had, so what a half-finished
  workflow did is visible rather than lost (REQ-010). Abandoning a complete workflow rejects
  (C-011); abandoning an abandoned one rejects with `WorkflowNotLiveError`; nothing in this
  version sets a status back to `'live'`. (REQ-010 as `change-log`'s; SL-07's partial-failure
  lens.)
- **C-013 Adding data, onboarding a platform, and transferring ownership make the acts their
  steps name, and onboarding re-enters nothing.** For `add-data`: `name-the-hazard` calls `registry.createHazard` with the
  title given and sets the record's `subject` to the hazard created; `describe-the-hazard` calls
  `registry.addCausalFactor` or `registry.addConsequence` by its `part`; `choose-controls` calls
  `registry.linkControlToHazard` with the control and the side. For `onboard-platform`:
  `name-the-platform` calls `registry.createPlatform` with the name and the owner and sets the
  record's `subject` to the platform created, and `select-hazards` calls
  `registry.linkHazardToPlatform` once per hazard chosen. For `transfer-ownership`:
  `choose-the-owner` calls `registry.setPlatformOwner` on the subject platform. Each appends one
  `action` entry naming the record the act wrote, and each passes the `Act` through unchanged, so
  the entry `registry` writes carries the platform the user was working on (registry C-023).
  Onboarding copies nothing: linking a hazard to the platform brings that hazard's controls
  across because a `hazard-control` link names no platform (registry C-012, DEC-013), and each of
  them stands on the new platform as `awaiting` — not confirmed, not linked — until a person
  confirms it there (registry C-021, REQ-013; SL-04). A reference register entry linked to that
  hazard comes across for the same reason: its links are refs on the entry and name no platform
  (DEC-023), so nothing is re-entered and nothing is duplicated. No existing hazard, control,
  reference entry, or link is changed or deleted by onboarding, which is registry C-014's promise
  reached from here (REQ-035). What `add-data` adds is one hazard and what belongs to a hazard;
  the reading this rejects is in the preamble. (REQ-035, REQ-036, REQ-081 as `registry`'s;
  SL-07 criterion 2.)

Ordering: the steps of a workflow are `WORKFLOW_STEPS[kind]`, fixed by this contract (C-002);
`entries` is in the order the entries were appended and is never reordered (C-011);
`listWorkflows` is ascending `createdAtAest` then id; a completion's acts are in ascending order
of the number in the hazard's global ID, with the platform's own ref first for a review (C-006,
C-007); `outstanding` is ascending as strings within a kind (C-008). Collections are keyed, so
the order of their entries is not data.
Idempotency: every read is harmless and, on the same body, resolves with deep-equal results.
`startWorkflow` twice gives two workflows, which is two runs and not a repeat (C-001).
`submitStep` twice with the same submission fails the second time (C-004). `advanceStep` twice
moves two steps. `completeWorkflow` twice fails the second time with `WorkflowCompleteError`, and
so does `abandonWorkflow` after a completion (C-011) — which is what makes a completion's acts
unrepeatable: review-schedule's `completeReview` is not idempotent and would advance a due date
twice (review-schedule's not-promised section), and it is this clause that stops a user reaching
it twice through one workflow. Two workflows completed on one platform in one day do complete two
reviews, and nothing here guards that: whether that is wanted is a question for SL-11's open
items and is named in the not-promised section.
Determinism: with the baseline clock held, every operation is a function of its arguments and of
the ids `IdKind.fresh` returns; a new id is a random UUID, which is the one thing a conformance
test must not assume (DEC-005). The step list of a kind is a constant, so two runs of one
workflow pass through the same steps in the same order on every machine.
Null and empty semantics: a missing collection reads as empty (C-001); `getWorkflow` of an id
nothing has is null; a `subject` of null means the workflow's record does not exist yet and is
set at the step that creates it (C-013); `completedOnAest`, `completedBy`, and `outcome` are null
while the workflow is in progress and are values and not absences once it completes (C-005); an
empty `outstanding` with `satisfied` true means the step asks nothing more, and an empty
`outstanding` with `satisfied` false means it asks for something that names no record (C-008); an
empty `entries` is a workflow that has recorded nothing yet.
Concurrency safety: two copies of Pivot on one folder are the designed case (ASM-004). Each holds
its own working body, so two copies may run two workflows on one platform, and may both complete
a review of it before either saves; `store` C-004 keeps the first save when the second overwrites
it, and what `data.json` then holds is that clause's outcome, not this module's. A workflow
started in one copy is not visible in the other until a save and a load, so a user cannot continue
another user's in-progress workflow within a session; whether they may continue it after a load is
not guarded here — the record names who started it and each entry names who entered it (C-005).
Within one copy, calls are made one at a time by the caller on the body it holds; overlapping
calls on one body are not promised, and a consumer that discards a returned body discards the step
and its entries together.
Side effects: none (C-003). A changing operation resolves with a body carrying every act it made
and every entry for them, or it rejects and the body it was given is unchanged (C-009).
Tolerance and precision: none; every comparison is exact. A residual value is compared as the
level and the letter an assessor entered and never as a band or a score (C-008, DEC-002); a date
is compared as a calendar date and never as an instant.

This module places no fault points at 1.0 or 2.0. C-004 is reached by an entry of
`collections['workflow-record']` built in test code, as registry's malformed records are; C-005's
dates by `clock.fixClock`, released in a finally block; C-009's all-or-nothing by a body in which
one of a completion's acts must reject — a `review-schedule` entry that module cannot read, or an
entry of `collections['change-log-entry']` that `change-log` cannot read — and by asserting the
input body deep-equal afterwards (a control already excluded for a hazard is, from 2.0, not a
hazard the removal covers, so it reaches no rejection; C-007); and the `MalformedEntryError` of section 4 by a body whose
`collections['change-log-entry']` holds an entry `change-log` C-008 refuses. Nothing here needs
arming of its own.

## 6. Performance envelope
Each operation is linear in `collections['workflow-record']` for the lookup by id, which is a
scan because no index is kept, plus the cost of the acts its clause names. That collection grows
with the number of workflow runs and is never pruned, so it grows like the change log rather than
like the record collections. `submitStep` and `advanceStep` at `review-the-hazards` and
`settle-the-ratings` each carry one `registry.listPlatformHazards`, which is that contract's cost
over the platform's links (registry section 6), and `stepDemand` carries the same, so a screen
that redraws the demand on every keystroke would repeat that query — the demand is derived and
not cached, which C-008 requires and which the consumer paces. A completion of a review carries
one `listPlatformHazards`, one `review-schedule.getSchedule` and one
`registry.platformsAffected` per record reviewed, and one `review-schedule.completeReview` for
each that has a schedule; a completion of a removal carries one
`registry.excludeControlFromPlatform` per hazard the control was on. Each of those writes a
change-log entry, so one completion may append several entries to a collection that only grows
(`change-log` section 6). The clock is read once per stamp, never once per entry. No bound beyond
DEC-003's is claimed: the body is in memory, and the folder's I/O is `store`'s.

## 7. Trace
Allocated to this module in `trace/requirements.yaml`; mitigations in `trace/hazards.yaml`; the
dependency graph in `modules/workflows/manifest.yaml`, checked against the real imports. These
are the sources, not this list (DEC-011 retired `docs/module-map.md`). Checked by
`check_traces.py` and `check_boundaries.js`.

Promised at version 1.0: REQ-008 (C-006), REQ-036 (C-013), REQ-037 (C-001 with C-002), REQ-038
(C-005 with C-004), REQ-039 (C-011), REQ-077 (C-008 with C-007). All six are written to
`allocated_to: workflows` by this session. REQ-037's `verification_method` is `demonstration`
and its `verified_by` stays a `REV-nnn`: what conformance holds is that `progressOf` gives the
three lists and that they partition the step list, and what a review row holds is that a user can
see them, which is DEC-007's division and the same one REQ-057 is under.

Promised at version 2.0: no requirement newly claimed. REQ-077 stays with C-008 and C-007, and
2.0 closes its one gap under DEC-038's reading: a hazard confirmed for the chosen control after
`settle-the-ratings` was passed is refused at completion rather than excluded from with no
residual settled.

Not claimed at version 1.0, and expected at `views`' own CONTRACT session: the step screens.
`views` 8.0 is what shows a workflow's steps, draws each step's form, and calls this surface;
which screens do that is the screen's and its `allocated_to` is `views`' to write, as REQ-019's
and REQ-023's were at SL-06. SL-07 criterion 1's "visible" half cannot be verified until that
version exists, so REQ-037 cannot reach `verified` on this contract alone.

Not claimed at version 1.0, and reachable only through this version: REQ-010 and REQ-045 are
`change-log`'s, and C-010 is what every act of this module reaches them by — without it a
workflow could be started, stepped, completed, or abandoned with no entry, for the record kind
baseline reserved at CHG-001 and no module wrote until now. REQ-015 is `review-schedule`'s, and
C-006 is the one call by which a last reviewed date is ever set for a hazard or a platform in the
built application: review-schedule C-007 says "a test calls it at SL-06 and `workflows` calls it
at SL-07", and this is that call. REQ-035 and REQ-081 are `registry`'s, reached by C-013.
REQ-058 is `registry`'s, reached by C-007.

REQ-049's "the workflows that user has in progress" is `views`' at SL-11 and is out of SL-07's
scope. This version stores an in-progress workflow as a record from its first step, which is what
makes that list possible at all; the read it needs is `listWorkflows` filtered by `state` and
`createdBy`, and whether a narrower operation belongs on this surface is SL-11's to decide. None
is added here on its behalf.

HZ-002 and HZ-004 each have a clause here besides the registry clause their
`mitigation_contract` names, and neither is claimed by SL-07 in `trace/slices.yaml`: HZ-002's
mitigation clause is registry C-017, and C-008 is what makes a person settle a residual when a
control is taken away (REQ-077); HZ-004's is registry C-019, and C-006 is what makes a review
read that one query rather than a list of its own (REQ-008). Both are recorded as support so
neither is discovered as a gap, and moving either hazard's claim to this slice is a GATE
decision, not this session's (P10) — SL-03 already claims both.

`review-schedule`'s `SCHEDULABLE_KINDS` is not widened by this slice. Its section 7 names SL-07
as a place a widening might be needed, for a schedule on a workflow record; REQ-015 names workflow
records among the ten kinds that may carry a last reviewed date, SL-07 claims no REQ-015, and no
criterion of this slice asks for a review of a workflow record. The four kinds stand, and the gap
stays recorded there.

## Explicitly not promised
- Any undo. Abandoning a workflow, or a step rejecting, never reverses an act already made
  (C-012). No contract of this project offers one, and `registry` forbids it by construction: a
  global ID is assigned once and never again (registry C-002) and a deletion keeps the row
  (registry C-005). The rollback reading of SL-07's partial-failure note is in the preamble.
- Correcting an entry of a workflow record, or a step already recorded. An entry is appended once
  and never altered (C-011), and a second submission for the same record rejects (C-004). A
  workflow entered wrongly is abandoned and started again; the records it acted on are corrected
  through the contracts that own them, each with its own history.
- Going back a step, skipping a step, reordering steps, or a step list that depends on what the
  user entered. `advanceStep` moves forward one step of a fixed list (C-002). A workflow whose
  shape depends on a choice is the rejected reading of `add-data` in the preamble.
- Any guard against two workflows on one record, or two reviews of one record in a day. Two
  `startWorkflow` calls give two records (C-001), and two completed reviews are two reviews —
  which advances a due date twice, as `review-schedule`'s idempotency section says. Whether that
  should be refused is a question for the consumer that lists open items (REQ-066, REQ-068, at
  SL-11).
- Continuing, reassigning, or taking over another user's workflow, and any rule about who may. The
  record names who started it and every entry names who entered it (C-005); nothing here compares
  a profile to them, and ASM-002 says safeguards prevent mistakes rather than tampering.
- That a `subject`, a `RecordRef` on an entry, or an id inside a submission still names a record
  that exists, is live, or is of the kind it claims, at any time after the call that recorded it.
  The checks C-001, C-006, C-007, and C-013 make are made at the moment of the call, through
  `registry`'s contract; a hazard deleted after being marked reviewed stays marked reviewed, and
  the completed record says what was true when it was entered.
- What a completed review means for a record whose review schedule was deleted or retired between
  the decision and the completion. C-006 calls `completeReview` only where
  `review-schedule.getSchedule` gives a live schedule at the moment of completion; a record whose
  schedule has gone is reviewed, carries its decision entry, and has no date set.
- Any tempo, due date, or overdue flag. Those are `review-schedule`'s (C-006 calls one operation
  of it and no other), and which lists show them is `views`' (views C-031).
- Any band, score, or rating word. A residual is the two values an assessor entered (C-008); what
  they mean is `rating.ratingFor`'s and is asked on the screen that shows them (DEC-002).
- Any report, bow-tie, or export of a workflow record. Those are SL-08's and SL-09's, and this
  contract produces nothing but the record.
- The clock. `nowAest` and `todayAest` are `baseline/clock.js`'s and are read by the five changing
  operations; this module holds no clock, no offset, and no zone, and a test fixes the baseline
  clock rather than passing a date in (ASM-005).
- Whether a returned workflow record is the same object as the entry in the returned body, or a
  copy. Treat every returned value as read-only.
- The order of entries inside the collection, or anything about the body a consumer reads directly
  rather than through this contract. `DataBody` is baseline;
  `collections['workflow-record']` is this module's to interpret.
- What a consumer may do with a body between calls, including saving it. `store` C-002 decides
  what a save needs; a workflow in progress is in the body like anything else and is saved with it.
- The wording of anything shown to the user, which screen shows it, and how a step is drawn. The
  `text` of an entry is what the user typed or one line this module wrote for its own record, not
  a message. This module signals; `views` speaks.
