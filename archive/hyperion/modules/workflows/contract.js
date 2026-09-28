/**
 * Contract: workflows, version 2.0. The module's sole import surface (CORE-CON-003). Owns the
 * record kind `workflow-record` (DEC-004, DEC-005) and the five guided workflows SL-07 names:
 * add data, onboard a platform, review data, remove a control from a platform, and transfer
 * platform ownership (REQ-008, REQ-036, REQ-037, REQ-038, REQ-039, REQ-077). It is one of the
 * two composing modules DEC-004 placed above the record modules: it makes the acts its steps
 * name through `registry` and `review-schedule`, and records the step that made them in the
 * same call, so a step the record shows is an act that happened and an act is never made with
 * no step to show it (DEC-025). Clause IDs (C-nnn) are defined in CONTRACT.md beside this file
 * and cited by the conformance suite.
 *
 * Every operation is a function of the working `DataBody` a consumer holds between
 * `store.load` and `store.save` (DEC-006): this module reads no folder and writes nothing
 * anywhere. It owns no record kind of another module and derives nothing another contract
 * already derives — a platform's hazards are `registry.listPlatformHazards` (registry C-019),
 * the platforms an act reaches are `registry.platformsAffected` (registry C-024), a last
 * reviewed date is `review-schedule.completeReview` (review-schedule C-007), and a control
 * leaves a platform only by `registry.excludeControlFromPlatform` (registry C-020).
 *
 * A workflow is a stored record from its first step, not a value held in a screen: it is in
 * `collections['workflow-record']` from `startWorkflow`, it changes as the user works, and at
 * `completeWorkflow` it is sealed — every changing operation of this contract refuses a record
 * whose `state` is `'complete'`, and no operation of any contract writes this collection but
 * this module's (C-011, REQ-039). Like every record module, it records its own history: each
 * changing operation appends its entry through `change-log.recordChange` in the same call
 * (C-010), so nothing here changes stored data and leaves no record of the change (HZ-005).
 *
 * Every operation delegates to the selected implementation: `src/workflows.js` in production,
 * `null_double.js` when `WORKFLOWS_IMPL=null` is set in the environment (CORE-TST-002, rung 1).
 * The null double is test-only and never embedded in the built pivot.html, which is why its
 * specifier is held in a variable: the build inlines only quoted import specifiers.
 */

/** @typedef {import('../../baseline/types.js').WorkflowRecordId} WorkflowRecordId */
/** @typedef {import('../../baseline/types.js').HazardId} HazardId */
/** @typedef {import('../../baseline/types.js').ControlId} ControlId */
/** @typedef {import('../../baseline/types.js').PlatformId} PlatformId */
/** @typedef {import('../../baseline/types.js').UserProfileId} UserProfileId */
/** @typedef {import('../../baseline/types.js').ActiveProfile} ActiveProfile */
/** @typedef {import('../../baseline/types.js').ControlKind} ControlKind */
/** @typedef {import('../../baseline/types.js').ConsequenceLevel1to5} ConsequenceLevel1to5 */
/** @typedef {import('../../baseline/types.js').LikelihoodLetterAtoG} LikelihoodLetterAtoG */
/** @typedef {import('../../baseline/types.js').DateAest} DateAest */
/** @typedef {import('../../baseline/types.js').TimestampAest} TimestampAest */
/** @typedef {import('../../baseline/types.js').RecordKind} RecordKind */
/** @typedef {import('../../baseline/types.js').RecordStatus} RecordStatus */
/** @typedef {import('../../baseline/types.js').RecordRef} RecordRef */
/** @typedef {import('../../baseline/schema.js').DataBody} DataBody */
/** @typedef {import('../registry/contract.js').Act} Act */
/** @typedef {import('../registry/contract.js').OmissionReason} OmissionReason */

// ------------------------------------------------------------------ the five workflows

/**
 * The five workflows SL-07 names, and the only values `startWorkflow` accepts. A sixth is an
 * Interface change to this contract, not a value a caller may pass (C-001).
 * @typedef {'add-data' | 'onboard-platform' | 'review-data' | 'remove-control'
 *   | 'transfer-ownership'} WorkflowKind
 */
export const WORKFLOW_KINDS = Object.freeze(/** @type {readonly WorkflowKind[]} */ ([
  'add-data', 'onboard-platform', 'review-data', 'remove-control', 'transfer-ownership',
]));

/**
 * Every named step of every workflow. A step's name is data a consumer shows and a
 * conformance test names; it is not a label, and its wording on a screen is `views`' (DEC-007).
 * @typedef {'name-the-hazard' | 'describe-the-hazard' | 'choose-controls'
 *   | 'name-the-platform' | 'select-hazards'
 *   | 'review-the-hazards'
 *   | 'choose-the-control' | 'settle-the-ratings' | 'record-the-reason'
 *   | 'choose-the-owner'
 *   | 'record-the-outcome'} WorkflowStep
 */

/**
 * The steps of each workflow, in order, fixed by this contract and by nothing a caller
 * supplies: this is what criterion 1's "sequence of named steps" is, and what `progressOf`
 * divides into the step done, the step current, and the steps remaining (C-002, REQ-037).
 * Every workflow ends at `record-the-outcome`, which is the step `completeWorkflow` is called
 * at and the step at which criterion 4's outcome is entered.
 * @type {Readonly<Record<WorkflowKind, readonly WorkflowStep[]>>}
 */
export const WORKFLOW_STEPS = Object.freeze({
  'add-data': Object.freeze(/** @type {readonly WorkflowStep[]} */ ([
    'name-the-hazard', 'describe-the-hazard', 'choose-controls', 'record-the-outcome',
  ])),
  'onboard-platform': Object.freeze(/** @type {readonly WorkflowStep[]} */ ([
    'name-the-platform', 'select-hazards', 'record-the-outcome',
  ])),
  'review-data': Object.freeze(/** @type {readonly WorkflowStep[]} */ ([
    'review-the-hazards', 'record-the-outcome',
  ])),
  'remove-control': Object.freeze(/** @type {readonly WorkflowStep[]} */ ([
    'choose-the-control', 'settle-the-ratings', 'record-the-reason', 'record-the-outcome',
  ])),
  'transfer-ownership': Object.freeze(/** @type {readonly WorkflowStep[]} */ ([
    'choose-the-owner', 'record-the-outcome',
  ])),
});

/**
 * The record kinds a workflow's `subject` may name: `platform` for the three workflows that
 * are performed on a platform, and `hazard` for the record `add-data` creates as its first
 * step. A subject is never resolved by this module beyond the one check C-001 names, which it
 * makes through `registry`'s contract; what it points at is that module's (C-003).
 * @type {readonly RecordKind[]}
 */
export const SUBJECT_KINDS = Object.freeze(/** @type {readonly RecordKind[]} */ (['hazard', 'platform']));

// ------------------------------------------------------------------ record shapes

/**
 * The fields every record of this module carries, from the baseline record header (schema.js
 * `RecordHeader`). `createdBy` and `createdAtAest` are who started the workflow and when;
 * `updatedBy` and `updatedAtAest` are the last act that changed it, which is a `submitStep`, an
 * `advanceStep`, a `completeWorkflow`, or an `abandonWorkflow` and nothing else (C-010, C-011).
 * `status` is `'live'` from `startWorkflow` and `'deleted'` after `abandonWorkflow`; the row
 * stays either way (C-012, REQ-010).
 * @typedef {object} WorkflowHeader
 * @property {WorkflowRecordId} id
 * @property {'workflow-record'} kind
 * @property {RecordStatus} status
 * @property {UserProfileId} createdBy
 * @property {TimestampAest} createdAtAest
 * @property {UserProfileId} updatedBy
 * @property {TimestampAest} updatedAtAest
 */

/**
 * What one entry of a workflow record holds: one thing the user decided, one act the workflow
 * made, one outcome they wrote, or one hazard the review could not carry.
 *
 * `decision` is a choice a person made with no stored record changed by it — a hazard marked
 * reviewed, a residual rating confirmed as it stands, a control chosen for removal.
 * `action` is an act this module made through another contract, naming the record it changed.
 * `outcome` is what the user wrote at `record-the-outcome`.
 * `omission` is a hazard `registry.listPlatformHazards` named in `omitted` rather than carried
 * as a row, recorded so a completed review says which hazards it could not cover (HZ-004,
 * REQ-008); it is the one entry kind beyond criterion 4's three and C-006 is why.
 * @typedef {'decision' | 'action' | 'outcome' | 'omission'} EntryKind
 */

/**
 * One entry of a workflow record, appended once and never altered (C-011). `text` is what the
 * user entered, trimmed, or — for an `action` — one line naming what was done, in this
 * module's words and never a message to show (`views` speaks). `ref` is the record the entry
 * concerns, null for an `outcome`.
 * @typedef {object} WorkflowEntry
 * @property {WorkflowStep} step the step it was entered at
 * @property {EntryKind} entryKind
 * @property {string} text
 * @property {RecordRef | null} ref
 * @property {UserProfileId} byProfileId who entered it (REQ-038, STK-029)
 * @property {TimestampAest} atAest when, from the baseline clock
 */

/** @typedef {'in-progress' | 'complete'} WorkflowState what `completeWorkflow` changes and nothing else (C-005) */

/**
 * One run of one workflow, in `collections['workflow-record']` keyed by its id. Plain data
 * throughout, so it survives a save and a load unchanged (C-003).
 *
 * `subject` is the record the workflow is performed on: the platform given at `startWorkflow`
 * for the three that take one, the hazard `add-data` creates at its first step, the platform
 * `onboard-platform` creates at its first step, and null until then (C-001). `currentStep` is
 * the step the workflow is at and is null exactly when `state` is `'complete'` (C-002).
 * `completedOnAest` is criterion 4's AEST date and `completedBy` its user; both are null while
 * the workflow is in progress and neither is ever changed once set (C-005, C-011).
 * @typedef {WorkflowHeader & {
 *   workflowKind: WorkflowKind,
 *   subject: RecordRef | null,
 *   state: WorkflowState,
 *   currentStep: WorkflowStep | null,
 *   startedOnAest: DateAest,
 *   completedOnAest: DateAest | null,
 *   completedBy: UserProfileId | null,
 *   outcome: string | null,
 *   entries: readonly WorkflowEntry[],
 * }} WorkflowRecord
 */

// ------------------------------------------------------------------ what a consumer supplies

/**
 * What `startWorkflow` is given. `subject` is required and never defaulted, as an `Act`'s
 * `madeForPlatformId` is (DEC-016): `review-data`, `remove-control`, and `transfer-ownership`
 * name the live platform they are performed on, and `add-data` and `onboard-platform` pass
 * null, because the record each is about does not exist until its first step (C-001).
 * @typedef {object} StartFields
 * @property {WorkflowKind} workflowKind
 * @property {RecordRef | null} subject
 */

/** @typedef {{ step: 'name-the-hazard', title: string }} NameTheHazard the hazard `add-data` creates (registry C-001) */
/** @typedef {{ step: 'describe-the-hazard', part: 'causal-factor' | 'consequence', text: string }} DescribeTheHazard one causal factor or one consequence (registry C-010) */
/** @typedef {{ step: 'choose-controls', controlId: ControlId, controlKind: ControlKind }} ChooseControls one library control on one side of the hazard (registry C-012) */
/** @typedef {{ step: 'name-the-platform', name: string, ownerProfileId: UserProfileId }} NameThePlatform the platform `onboard-platform` creates (registry C-014) */
/** @typedef {{ step: 'select-hazards', hazardId: HazardId }} SelectHazards one existing hazard linked to the new platform, which brings its controls across (C-013, registry C-015) */
/** @typedef {{ step: 'review-the-hazards', hazardId: HazardId, note: string }} ReviewTheHazards one hazard of the platform marked reviewed, with what the reviewer decided (C-006) */
/** @typedef {{ step: 'choose-the-control', controlId: ControlId }} ChooseTheControl the control to be taken off the platform (C-007) */
/** @typedef {{ step: 'choose-the-owner', ownerProfileId: UserProfileId }} ChooseTheOwner the profile to own the platform (registry C-028) */
/** @typedef {{ step: 'record-the-reason', text: string }} RecordTheReason the reason every exclusion this workflow makes will carry (registry C-020, REQ-058) */

/**
 * One hazard's residual rating settled before the control is taken off the platform: the
 * consequence and the likelihood as the user confirms or re-enters them (REQ-077; HZ-002).
 * The values are given whether they are changed or not, so confirming is an act of the same
 * shape as re-entering and the step cannot be passed by saying nothing (C-008).
 * @typedef {object} SettleTheRatings
 * @property {'settle-the-ratings'} step
 * @property {HazardId} hazardId
 * @property {ConsequenceLevel1to5 | null} consequence
 * @property {LikelihoodLetterAtoG | null} likelihood
 */

/**
 * What `submitStep` takes: one submission for the step the workflow is at, told from the
 * others by `step`, which must equal the record's `currentStep` (C-004).
 * @typedef {NameTheHazard | DescribeTheHazard | ChooseControls | NameThePlatform
 *   | SelectHazards | ReviewTheHazards | ChooseTheControl | SettleTheRatings
 *   | RecordTheReason | ChooseTheOwner} StepSubmission
 */

/** @typedef {{ outcome: string }} CompletionFields what the user wrote at `record-the-outcome` (REQ-038) */

// ------------------------------------------------------------------ what a read returns

/**
 * A workflow as a sequence of named steps, with the step it is at, the steps done, and the
 * steps remaining — criterion 1's three, from one call (C-002). `done`, the `current` step
 * where there is one, and `remaining` concatenate in that order to `steps`, which is
 * `WORKFLOW_STEPS[record.workflowKind]`.
 * @typedef {object} WorkflowProgress
 * @property {WorkflowRecord} record
 * @property {readonly WorkflowStep[]} steps every step of this workflow, in order
 * @property {readonly WorkflowStep[]} done the steps passed
 * @property {WorkflowStep | null} current null exactly when the workflow is complete
 * @property {readonly WorkflowStep[]} remaining the steps after the current one
 */

/**
 * What the current step still asks of the user, derived from the body at the moment of the
 * call and from no state of this module's own (C-008). Before `record-the-outcome`, `satisfied`
 * is false exactly when `advanceStep` would reject with `StepIncompleteError`. At
 * `record-the-outcome` it is always false, because that step is passed by completing, and
 * `outstanding` is exactly the refs `completeWorkflow` would reject with in a
 * `StepIncompleteError` — for `remove-control` the confirmed hazards with no settlement, and
 * otherwise none (C-007). `outstanding` is ascending as strings within a kind, and is empty for
 * a step that asks about no record.
 * @typedef {object} StepDemand
 * @property {WorkflowStep} step
 * @property {boolean} satisfied
 * @property {readonly RecordRef[]} outstanding
 */

/**
 * A hazard a review workflow could not carry as a row, as `registry.listPlatformHazards` named
 * it (registry C-019). Carried here so criterion 3's "or lists it as omitted" is a fact about
 * the completed record and not only about a screen (C-006; HZ-004).
 * @typedef {object} ReviewOmission
 * @property {HazardId} id
 * @property {OmissionReason} reason
 * @property {string} detail
 */

// ------------------------------------------------------------------ what a change returns

/**
 * What every changing operation returns: the body as it now is, and the workflow record as it
 * now is in that body. The body passed in is untouched (C-003); the consumer replaces its
 * working body with `body` and passes that to `store.save` when the user saves. No change
 * shape carries the entries the act wrote to `collections['change-log-entry']`: they are in
 * the returned body and are read from there through `change-log` (C-010), as registry's and
 * review-schedule's are.
 * @typedef {{ body: DataBody, workflow: WorkflowRecord }} WorkflowChange
 */

// ------------------------------------------------------------------ error conditions: what the caller asked for

/** C-001: `startWorkflow` given a `workflowKind` outside `WORKFLOW_KINDS`. The body is unchanged. */
export class UnknownWorkflowKindError extends Error {
  /** @param {unknown} given */
  constructor(given) {
    super('a workflow is one of the five this version guides');
    this.name = 'UnknownWorkflowKindError';
    this.given = given;
  }
}

/**
 * C-001: `startWorkflow` given a `subject` the workflow kind does not take — absent, null for
 * a workflow performed on a platform, non-null for one that creates its own subject, of a kind
 * outside `SUBJECT_KINDS`, or a platform id no live platform has. The property is required and
 * never defaulted: a workflow whose subject is guessed is a workflow performed on the wrong
 * platform.
 */
export class InvalidSubjectError extends Error {
  /**
   * @param {WorkflowKind | null} workflowKind
   * @param {unknown} given
   */
  constructor(workflowKind, given) {
    super('a workflow names the record it is performed on, or null for one that creates it');
    this.name = 'InvalidSubjectError';
    this.workflowKind = workflowKind;
    this.given = given;
  }
}

/** C-004: an id no entry of `collections['workflow-record']` has. The body is unchanged. */
export class UnknownWorkflowError extends Error {
  /** @param {unknown} id */
  constructor(id) {
    super('no workflow record has that id');
    this.name = 'UnknownWorkflowError';
    this.given = id;
  }
}

/**
 * C-004, C-012: the workflow's own `status` is not `'live'` — it was abandoned. Said apart
 * from an unknown workflow and from a complete one, so a consumer can tell the three.
 */
export class WorkflowNotLiveError extends Error {
  /**
   * @param {WorkflowRecordId} id
   * @param {RecordStatus} status
   */
  constructor(id, status) {
    super('that workflow was abandoned');
    this.name = 'WorkflowNotLiveError';
    this.id = id;
    this.status = status;
  }
}

/**
 * C-011: any changing operation on a workflow whose `state` is `'complete'`. This is REQ-039's
 * refusal, and it is the only thing this contract says about a complete record: no field of it
 * can be changed, by any operation of this surface, whatever the profile.
 */
export class WorkflowCompleteError extends Error {
  /** @param {WorkflowRecordId} id */
  constructor(id) {
    super('that workflow is complete; nothing about it can be changed');
    this.name = 'WorkflowCompleteError';
    this.id = id;
  }
}

/** C-004: `submitStep` given a submission whose `step` is not the workflow's `currentStep`. */
export class WrongStepError extends Error {
  /**
   * @param {WorkflowStep} expected the step the workflow is at
   * @param {unknown} given
   */
  constructor(expected, given) {
    super(`that workflow is at the step ${expected}`);
    this.name = 'WrongStepError';
    this.expected = expected;
    this.given = given;
  }
}

/**
 * C-008: `advanceStep` or `completeWorkflow` on a step whose demand is unmet, carrying the
 * records still outstanding. It is REQ-077's refusal at `settle-the-ratings` and criterion 3's
 * at `review-the-hazards`: the workflow does not move on, and nothing is written. From 2.0
 * `completeWorkflow` on `remove-control` raises it with `step` `'settle-the-ratings'` for a hazard
 * confirmed for the control after that step was passed (C-007).
 */
export class StepIncompleteError extends Error {
  /**
   * @param {WorkflowStep} step
   * @param {readonly RecordRef[]} outstanding as `stepDemand` gives them; empty for a step that names no record
   */
  constructor(step, outstanding) {
    super(`the step ${step} is not finished`);
    this.name = 'StepIncompleteError';
    this.step = step;
    this.outstanding = outstanding;
  }
}

/** C-002: `advanceStep` at `record-the-outcome`, which is passed by completing the workflow and not by advancing. */
export class LastStepError extends Error {
  /** @param {WorkflowRecordId} id */
  constructor(id) {
    super('the last step of a workflow is passed by completing it');
    this.name = 'LastStepError';
    this.id = id;
  }
}

/** C-005: `completeWorkflow` before the workflow has reached `record-the-outcome`. */
export class NotAtOutcomeError extends Error {
  /**
   * @param {WorkflowRecordId} id
   * @param {WorkflowStep} currentStep
   */
  constructor(id, currentStep) {
    super(`that workflow is at ${currentStep} and is not ready to be completed`);
    this.name = 'NotAtOutcomeError';
    this.id = id;
    this.currentStep = currentStep;
  }
}

/** C-005: `completeWorkflow` given an outcome that is empty once trimmed. Nothing is written. */
export class InvalidOutcomeError extends Error {
  /** @param {unknown} given */
  constructor(given) {
    super('an outcome must have at least one character that is not a space');
    this.name = 'InvalidOutcomeError';
    this.given = given;
  }
}

/**
 * C-007: `record-the-reason` given a text that is empty once trimmed. Refused at the step
 * rather than at the exclusion it will carry, so the user is told where they typed it; the
 * same text is refused again by `registry.excludeControlFromPlatform` (registry C-020,
 * REQ-058).
 */
export class InvalidReasonError extends Error {
  /** @param {unknown} given */
  constructor(given) {
    super('a reason for taking a control off a platform must have at least one character that is not a space');
    this.name = 'InvalidReasonError';
    this.given = given;
  }
}

/** C-006: `review-the-hazards` given a note that is empty once trimmed. */
export class InvalidNoteError extends Error {
  /** @param {unknown} given */
  constructor(given) {
    super('a hazard marked reviewed carries what the reviewer decided');
    this.name = 'InvalidNoteError';
    this.given = given;
  }
}

/**
 * C-004: a second submission at a step that takes one record — `name-the-hazard`,
 * `name-the-platform`, `choose-the-control`, `choose-the-owner`, `record-the-reason` — whatever
 * it names, carrying the ref of the entry already recorded (null for `record-the-reason`); or a
 * repeat of the same hazard or control at a step that takes one per record — a hazard reviewed
 * twice, a residual settled twice, a control linked twice, a hazard selected twice.
 * `describe-the-hazard` never raises it. An entry is appended once and never altered (C-011), so
 * a correction is a new workflow rather than a rewritten entry; the not-promised section says so.
 */
export class AlreadyRecordedError extends Error {
  /**
   * @param {WorkflowStep} step
   * @param {RecordRef | null} ref
   */
  constructor(step, ref) {
    super(`that step has already recorded ${ref === null ? 'an entry' : `${ref.kind} ${ref.id}`}`);
    this.name = 'AlreadyRecordedError';
    this.step = step;
    this.ref = ref;
  }
}

/**
 * C-007: `choose-the-control` given a control that is on no hazard of this platform — no row of
 * `registry.listPlatformHazards` carries it with the state `'confirmed'` (registry C-021). A
 * control that is not on the platform has nothing to be taken off it.
 */
export class ControlNotOnPlatformError extends Error {
  /**
   * @param {ControlId} controlId
   * @param {PlatformId} platformId
   */
  constructor(controlId, platformId) {
    super(`control ${String(controlId)} is not confirmed for any hazard on that platform`);
    this.name = 'ControlNotOnPlatformError';
    this.controlId = controlId;
    this.platformId = platformId;
  }
}

/**
 * C-006: `review-the-hazards` given a hazard `registry.listPlatformHazards` does not carry as a
 * row for this platform — one not linked to it, one not live, or one it named in `omitted`. A
 * hazard the query could not build a row for is recorded as an omission at completion and is
 * never marked reviewed (HZ-004).
 */
export class HazardNotInReviewError extends Error {
  /**
   * @param {HazardId} hazardId
   * @param {PlatformId} platformId
   */
  constructor(hazardId, platformId) {
    super(`hazard ${String(hazardId)} is not a row of that platform's hazards`);
    this.name = 'HazardNotInReviewError';
    this.hazardId = hazardId;
    this.platformId = platformId;
  }
}

// ------------------------------------------------------------------ error conditions: the act

/**
 * C-010: any changing operation given no `Act`, or one whose `profile` is missing or whose
 * profile id is not a user profile id. The body is unchanged. A profile is how a record's
 * header says who changed it and how the entry C-010 writes says who performed the act, and it
 * is what `byProfileId` on every entry of a workflow record records (REQ-038, STK-029).
 */
export class MissingProfileError extends Error {
  /** @param {unknown} given */
  constructor(given) {
    super('no user profile is selected; a workflow records who performed each step');
    this.name = 'MissingProfileError';
    this.given = given;
  }
}

/**
 * C-010: an `Act` whose `madeForPlatformId` is absent, or is neither null nor a platform id.
 * It is not defaulted (DEC-016): it is passed unchanged to every act this module makes and to
 * the entry for the workflow record itself, where it decides which platforms await the change.
 */
export class InvalidActError extends Error {
  /** @param {unknown} given */
  constructor(given) {
    super('an act names the platform it was made for, or null; the property is not optional');
    this.name = 'InvalidActError';
    this.given = given;
  }
}

/**
 * C-004: an entry of `collections['workflow-record']` this module cannot read. Every operation
 * rejects, so a list of workflows is never shown with one silently missing from it and no
 * workflow is shown as in progress because its record could not be read.
 */
export class MalformedWorkflowError extends Error {
  /**
   * @param {string} key the entry's key in the collection
   * @param {string} detail one sentence naming the field
   */
  constructor(key, detail) {
    super(`a workflow record cannot be read: ${detail}`);
    this.name = 'MalformedWorkflowError';
    this.key = key;
    this.detail = detail;
  }
}

// ------------------------------------------------------------------ operations: running a workflow

/**
 * Start one of the five workflows, creating its record in `collections['workflow-record']` at
 * the first step of `WORKFLOW_STEPS[workflowKind]`, with `state: 'in-progress'`, no entries,
 * and `startedOnAest` the baseline clock's today. Records the act through `change-log` in the
 * same call (C-010). Rejects a kind outside the five, a subject the kind does not take, an
 * unknown or not-live platform, a missing profile, and an ill-formed act, changing nothing.
 * C-001, C-002, C-003, C-010.
 * @param {DataBody} body the working body, as loaded or as last changed
 * @param {Act} act the profile this session acts as (REQ-055) and the platform the act was made for
 * @param {StartFields} fields
 * @returns {Promise<WorkflowChange>}
 */
export async function startWorkflow(body, act, fields) {
  return (await impl()).startWorkflow(body, act, fields);
}

/**
 * Record one submission at the step the workflow is at: it makes the act that step names
 * through `registry`, where the step has one, and appends the entry for it to the workflow
 * record in the same call, so a step the record shows is an act that happened (C-004, DEC-025).
 * The `currentStep` does not move: `advanceStep` moves it, and a step that takes any number of
 * submissions takes them by repeated calls. Rejects a complete or abandoned workflow, a
 * submission for a step the workflow is not at, a second submission for a record the step has
 * already recorded, whatever the step's own clause refuses, a missing profile, and an
 * ill-formed act, changing nothing; a rejection from `registry` is passed on unchanged, with
 * nothing of this module's written.
 * C-003, C-004, C-006, C-007, C-008, C-010, C-011, C-013.
 * @param {DataBody} body
 * @param {Act} act
 * @param {WorkflowRecordId} id
 * @param {StepSubmission} submission
 * @returns {Promise<WorkflowChange>}
 */
export async function submitStep(body, act, id, submission) {
  return (await impl()).submitStep(body, act, id, submission);
}

/**
 * Move the workflow to the next step of its sequence. Rejects with `StepIncompleteError`,
 * carrying the records still outstanding, when the current step's demand is unmet — which at
 * `settle-the-ratings` is REQ-077's refusal and at `review-the-hazards` is criterion 3's.
 * Rejects at `record-the-outcome` with `LastStepError`: the last step is passed by completing
 * the workflow. Records the act through `change-log` in the same call (C-010). Rejects a
 * complete or abandoned workflow, an unknown id, a missing profile, and an ill-formed act,
 * changing nothing. C-002, C-003, C-008, C-010, C-011.
 * @param {DataBody} body
 * @param {Act} act
 * @param {WorkflowRecordId} id
 * @returns {Promise<WorkflowChange>}
 */
export async function advanceStep(body, act, id) {
  return (await impl()).advanceStep(body, act, id);
}

/**
 * Complete the workflow at `record-the-outcome`: make the completing acts its kind names — the
 * last reviewed date of each record reviewed for `review-data` (C-006), the exclusion of the
 * chosen control from each hazard that carries it confirmed on the platform at the moment of this
 * call for `remove-control` (C-007), and none for the other three — then seal the record. A
 * removal rejects with `StepIncompleteError` for `settle-the-ratings` while any such hazard has
 * no settlement, so no control comes off a hazard whose residual nobody settled (REQ-077). Every act and the sealing are one call: if any of them rejects,
 * the whole call rejects with that error and the body passed in is unchanged, so a completion
 * never leaves half its acts made (C-009). Once it resolves, `state` is `'complete'`,
 * `currentStep` is null, `completedOnAest` is the baseline clock's today, `completedBy` is
 * `act.profile.id`, and no operation of this contract will change any field of the record
 * again (C-005, C-011; REQ-038, REQ-039). Records the act through `change-log` in the same call
 * (C-010). Rejects a workflow not at `record-the-outcome`, a blank outcome, an unsettled hazard of a removal, a complete or
 * abandoned workflow, an unknown id, a missing profile, and an ill-formed act, changing
 * nothing. C-003, C-005, C-006, C-007, C-009, C-010, C-011.
 * @param {DataBody} body
 * @param {Act} act
 * @param {WorkflowRecordId} id
 * @param {CompletionFields} fields
 * @returns {Promise<WorkflowChange>}
 */
export async function completeWorkflow(body, act, id, fields) {
  return (await impl()).completeWorkflow(body, act, id, fields);
}

/**
 * Abandon a workflow in progress: its `status` becomes `'deleted'`, its row stays with every
 * entry it had, and it leaves `listWorkflows`. No act this workflow already made is undone —
 * there is no undo on any contract of this project, and the records stand as they were at the
 * moment of abandonment, each with its own entry in the history (C-012). Records the act
 * through `change-log` in the same call (C-010). Rejects a complete or already abandoned
 * workflow, an unknown id, a missing profile, and an ill-formed act, changing nothing.
 * C-003, C-010, C-011, C-012.
 * @param {DataBody} body
 * @param {Act} act
 * @param {WorkflowRecordId} id
 * @returns {Promise<WorkflowChange>}
 */
export async function abandonWorkflow(body, act, id) {
  return (await impl()).abandonWorkflow(body, act, id);
}

// ------------------------------------------------------------------ operations: reading

/**
 * The workflow record with this id as it is in the body, whatever its status, or null when no
 * workflow record has the id. A read: no clock is consulted and nothing is written. Rejects
 * only a malformed workflow record. C-004.
 * @param {DataBody} body
 * @param {WorkflowRecordId} id
 * @returns {Promise<WorkflowRecord | null>}
 */
export async function getWorkflow(body, id) {
  return (await impl()).getWorkflow(body, id);
}

/**
 * Every live workflow record, in progress and complete, once each, in ascending order of
 * `createdAtAest` then id; empty when the body holds none. An abandoned workflow is not
 * listed, and its row is still readable through `getWorkflow` (C-012). Rejects only a
 * malformed workflow record. C-004, C-012.
 * @param {DataBody} body
 * @returns {Promise<readonly WorkflowRecord[]>}
 */
export async function listWorkflows(body) {
  return (await impl()).listWorkflows(body);
}

/**
 * One workflow as a sequence of named steps, with the step it is at, the steps done, and the
 * steps remaining: criterion 1's three from one call, so no consumer keeps a step list of its
 * own (REQ-037). Rejects an unknown id and a malformed workflow record. C-002, C-004.
 * @param {DataBody} body
 * @param {WorkflowRecordId} id
 * @returns {Promise<WorkflowProgress>}
 */
export async function progressOf(body, id) {
  return (await impl()).progressOf(body, id);
}

/**
 * What the current step still asks of the user, and whether `advanceStep` would move past it.
 * Derived from the body at the moment of the call — a hazard linked to the platform after the
 * review began is outstanding, one whose row the query can no longer build is not — so the
 * demand and the refusal cannot disagree (C-008). Rejects an unknown id, a complete workflow,
 * an abandoned workflow, and a malformed workflow record. C-004, C-008.
 * @param {DataBody} body
 * @param {WorkflowRecordId} id
 * @returns {Promise<StepDemand>}
 */
export async function stepDemand(body, id) {
  return (await impl()).stepDemand(body, id);
}

/**
 * Every hazard of a review workflow's platform that `registry.listPlatformHazards` named in
 * `omitted` rather than carrying as a row, as at this body: what criterion 3's "or lists it as
 * omitted" names, readable while the review is in progress and recorded on the record at
 * completion (C-006; HZ-004, REQ-008). Empty for a workflow whose kind is not `review-data`.
 * Rejects an unknown id, a malformed workflow record, and whatever `registry` rejects with.
 * C-004, C-006.
 * @param {DataBody} body
 * @param {WorkflowRecordId} id
 * @returns {Promise<readonly ReviewOmission[]>}
 */
export async function reviewOmissions(body, id) {
  return (await impl()).reviewOmissions(body, id);
}

// ------------------------------------------------------------------ implementation selection

/**
 * @typedef {object} WorkflowsImplementation
 * @property {(body: DataBody, act: Act, fields: StartFields) => Promise<WorkflowChange>} startWorkflow
 * @property {(body: DataBody, act: Act, id: WorkflowRecordId, submission: StepSubmission) => Promise<WorkflowChange>} submitStep
 * @property {(body: DataBody, act: Act, id: WorkflowRecordId) => Promise<WorkflowChange>} advanceStep
 * @property {(body: DataBody, act: Act, id: WorkflowRecordId, fields: CompletionFields) => Promise<WorkflowChange>} completeWorkflow
 * @property {(body: DataBody, act: Act, id: WorkflowRecordId) => Promise<WorkflowChange>} abandonWorkflow
 * @property {(body: DataBody, id: WorkflowRecordId) => Promise<WorkflowRecord | null>} getWorkflow
 * @property {(body: DataBody) => Promise<readonly WorkflowRecord[]>} listWorkflows
 * @property {(body: DataBody, id: WorkflowRecordId) => Promise<WorkflowProgress>} progressOf
 * @property {(body: DataBody, id: WorkflowRecordId) => Promise<StepDemand>} stepDemand
 * @property {(body: DataBody, id: WorkflowRecordId) => Promise<readonly ReviewOmission[]>} reviewOmissions
 */

/** @type {Promise<WorkflowsImplementation> | null} */
let selected = null;

/** @returns {Promise<WorkflowsImplementation>} */
function impl() {
  if (selected === null) {
    const env = /** @type {{ process?: { env?: Record<string, string | undefined> } }} */ (globalThis).process?.env;
    if (env?.WORKFLOWS_IMPL === 'null') {
      const nullDouble = './null_double.js'; // test-only; not a runtime source, so never inlined by the build
      selected = import(nullDouble);
    } else {
      selected = import('./src/workflows.js');
    }
  }
  return selected;
}
