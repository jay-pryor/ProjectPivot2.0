/**
 * workflows, implementing contract version 2.0 (modules/workflows/CONTRACT.md). Selected by
 * contract.js unless WORKFLOWS_IMPL=null. Clause IDs (C-nnn) cite the contract.
 *
 * Every operation is a function of the `DataBody` passed in, of the baseline clock, and of the
 * `registry`, `review-schedule`, and `change-log` operations its clause names (C-003). Every
 * operation first reads `collections['workflow-record']` whole and rejects a malformed entry
 * (C-004), then applies section 4's checks in its stated order. A changing operation builds each
 * act's body on the last and returns the chain only when every act and the workflow record's own
 * entry have resolved, so a rejection anywhere leaves nothing made (C-009).
 *
 * An `action` entry at `settle-the-ratings`, `choose-controls`, or `select-hazards` names the
 * record the act wrote (a rating or a link), not the hazard or control the step is per; its text
 * begins with that hazard or control as `<kind> <id>: `, and that prefix is how this module reads
 * back which record a step has already recorded (C-004, C-008) without reading a collection it
 * does not own.
 */

import { RECORD_KINDS, dateAest, platformId, timestampAest, userProfileId, workflowRecordId } from '../../../baseline/types.js';
import { nowAest, todayAest } from '../../../baseline/clock.js';
import * as registry from '../../registry/contract.js';
import * as reviewSchedule from '../../review-schedule/contract.js';
import { recordChange } from '../../change-log/contract.js';
import {
  AlreadyRecordedError, ControlNotOnPlatformError, HazardNotInReviewError, InvalidActError, InvalidNoteError, InvalidOutcomeError,
  InvalidReasonError, InvalidSubjectError, LastStepError, MalformedWorkflowError, MissingProfileError, NotAtOutcomeError,
  StepIncompleteError, UnknownWorkflowError, UnknownWorkflowKindError, WORKFLOW_KINDS, WORKFLOW_STEPS, WorkflowCompleteError,
  WorkflowNotLiveError, WrongStepError,
} from '../contract.js';

/** @typedef {import('../contract.js').WorkflowsImplementation} Impl */
/** @typedef {import('../contract.js').WorkflowRecord} WorkflowRecord */
/** @typedef {import('../contract.js').WorkflowEntry} WorkflowEntry */
/** @typedef {import('../contract.js').WorkflowStep} WorkflowStep */
/** @typedef {import('../contract.js').WorkflowKind} WorkflowKind */
/** @typedef {import('../contract.js').WorkflowChange} WorkflowChange */
/** @typedef {import('../../registry/contract.js').Act} Act */
/** @typedef {import('../../../baseline/types.js').RecordRef} RecordRef */
/** @typedef {import('../../../baseline/types.js').HazardId} HazardId */
/** @typedef {import('../../../baseline/types.js').PlatformId} PlatformId */
/** @typedef {import('../../../baseline/types.js').TimestampAest} TimestampAest */
/** @typedef {import('../../../baseline/schema.js').DataBody} DataBody */
/** @typedef {import('../../../baseline/schema.js').StoredRecord} StoredRecord */

const KIND = 'workflow-record';
const STATUSES = Object.freeze(['live', 'retired', 'deleted']);
const STATES = Object.freeze(['in-progress', 'complete']);
const ENTRY_KINDS = Object.freeze(['decision', 'action', 'outcome', 'omission']);
const EVERY_STEP = Object.freeze([...new Set(Object.values(WORKFLOW_STEPS).flat())]);
const ON_A_PLATFORM = Object.freeze(['review-data', 'remove-control', 'transfer-ownership']);
/** The steps that record one entry per workflow, whatever it names (C-004). */
const ONE_RECORD_STEPS = Object.freeze(['name-the-hazard', 'name-the-platform', 'choose-the-control', 'choose-the-owner', 'record-the-reason']);
/** Record kinds `registry` owns and answers `platformsAffected` for (C-010, DEC-026). */
const REGISTRY_KINDS = Object.freeze(['hazard', 'platform']);

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
const isWorkflowId = (v) => parses(v, workflowRecordId.parse);
/** @param {unknown} v */
const isTimestamp = (v) => parses(v, timestampAest);
/** @param {unknown} v */
const isDate = (v) => parses(v, dateAest);
/** @param {unknown} v */
const isBlank = (v) => typeof v !== 'string' || v.trim() === '';

/**
 * A record kind and a string id.
 * @param {unknown} ref
 * @returns {ref is RecordRef}
 */
function isRef(ref) {
  return isObject(ref) && RECORD_KINDS.includes(/** @type {any} */ (ref.kind)) && typeof ref.id === 'string';
}

/**
 * @param {string} a
 * @param {string} b
 */
const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Ascending by the number in a hazard's global ID (C-006, C-007).
 * @param {string} a
 * @param {string} b
 */
const byHazardNumber = (a, b) => Number(a.slice(2)) - Number(b.slice(2));

/**
 * @param {string} id
 * @returns {RecordRef}
 */
const hazardRef = (id) => ({ kind: 'hazard', id });

// ------------------------------------------------------------------ the collection (C-004)

/**
 * @param {unknown} e
 * @returns {boolean} whether it is a `WorkflowEntry`
 */
function isEntry(e) {
  return isObject(e) && EVERY_STEP.includes(e.step) && ENTRY_KINDS.includes(e.entryKind) && typeof e.text === 'string'
    && (e.ref === null || isRef(e.ref)) && isProfileId(e.byProfileId) && isTimestamp(e.atAest);
}

/**
 * One sentence naming what is wrong with an entry, or null when it is a `WorkflowRecord`.
 * @param {string} key
 * @param {unknown} e
 * @returns {string | null}
 */
function malformation(key, e) {
  if (!isObject(e)) return 'the entry is not a record';
  if (e.id !== key) return 'its id differs from its key';
  if (!isWorkflowId(e.id)) return 'its id is not a workflow record id';
  if (e.kind !== KIND) return 'its kind is not workflow-record';
  if (!STATUSES.includes(e.status)) return 'its status is not a record status';
  if (!isProfileId(e.createdBy)) return 'its createdBy is not a user profile id';
  if (!isProfileId(e.updatedBy)) return 'its updatedBy is not a user profile id';
  if (!isTimestamp(e.createdAtAest)) return 'its createdAtAest is not an AEST timestamp';
  if (!isTimestamp(e.updatedAtAest)) return 'its updatedAtAest is not an AEST timestamp';
  if (!WORKFLOW_KINDS.includes(e.workflowKind)) return 'its workflowKind is not one of the five workflows';
  if (e.subject !== null && !isRef(e.subject)) return 'its subject is neither null nor a record kind and a string id';
  if (!STATES.includes(e.state)) return 'its state is neither in-progress nor complete';
  if (e.state === 'in-progress' && !WORKFLOW_STEPS[/** @type {WorkflowKind} */ (e.workflowKind)].includes(e.currentStep)) {
    return 'its currentStep is not a step of its workflow';
  }
  if (e.state === 'complete' && e.currentStep !== null) return 'its currentStep is not null though it is complete';
  for (const field of ['startedOnAest', 'completedOnAest']) {
    if (e[field] !== null && !isDate(e[field])) return `its ${field} is not an AEST date`;
  }
  if (e.completedBy !== null && !isProfileId(e.completedBy)) return 'its completedBy is neither null nor a user profile id';
  if (e.outcome !== null && typeof e.outcome !== 'string') return 'its outcome is neither null nor a string';
  if (!Array.isArray(e.entries)) return 'its entries is not a list';
  if (!e.entries.every(isEntry)) return 'an entry of its entries is not a workflow entry';
  return null;
}

/**
 * Every entry of the collection, each checked; a missing collection is empty (section 4).
 * @param {DataBody} body
 * @returns {WorkflowRecord[]}
 */
function readWorkflows(body) {
  const rows = /** @type {any} */ (body)?.collections?.[KIND];
  if (rows === undefined) return [];
  if (!isObject(rows)) throw new MalformedWorkflowError(KIND, 'the workflow-record collection is not keyed records');
  return Object.keys(rows).map((key) => {
    const detail = malformation(key, rows[key]);
    if (detail !== null) throw new MalformedWorkflowError(key, detail);
    return /** @type {WorkflowRecord} */ (rows[key]);
  });
}

/**
 * @param {WorkflowRecord[]} workflows
 * @param {unknown} id
 * @returns {WorkflowRecord}
 */
function requireWorkflow(workflows, id) {
  const found = workflows.find((w) => w.id === id);
  if (found === undefined) throw new UnknownWorkflowError(id);
  return found;
}

/**
 * Section 4's profile and act conditions, in their order.
 * @param {unknown} act
 * @returns {Act}
 */
function requireAct(act) {
  if (!isObject(act) || !isObject(act.profile) || !isProfileId(act.profile.id)) throw new MissingProfileError(act);
  if (!has(act, 'madeForPlatformId')) throw new InvalidActError(undefined);
  const madeFor = act.madeForPlatformId;
  if (madeFor !== null && !isPlatformId(madeFor)) throw new InvalidActError(madeFor);
  return /** @type {Act} */ (act);
}

/**
 * A workflow a changing operation may act on: live and in progress (C-011, C-012), complete
 * checked first (section 4).
 * @param {WorkflowRecord} record
 */
function requireInProgress(record) {
  if (record.state === 'complete') throw new WorkflowCompleteError(record.id);
  if (record.status !== 'live') throw new WorkflowNotLiveError(record.id, record.status);
}

// ------------------------------------------------------------------ what a record has recorded

/**
 * @param {WorkflowRecord} record
 * @param {WorkflowStep} step
 * @returns {WorkflowEntry[]}
 */
const entriesAt = (record, step) => record.entries.filter((e) => e.step === step);

/**
 * The hazard or control a step's entry is about: the entry's ref for a decision, and for an
 * action the record named by its text's `<kind> <id>: ` prefix (see the file comment).
 * @param {WorkflowEntry} entry
 * @returns {RecordRef | null}
 */
function aboutOf(entry) {
  if (entry.entryKind !== 'action') return entry.ref;
  const m = /^(hazard|control) (\S+): /.exec(entry.text);
  return m === null ? null : { kind: /** @type {'hazard' | 'control'} */ (m[1]), id: m[2] };
}

/**
 * The ids of the records of `kind` a step has recorded an entry about.
 * @param {WorkflowRecord} record
 * @param {WorkflowStep} step
 * @param {'hazard' | 'control'} kind
 * @returns {Set<string>}
 */
function recordedAbout(record, step, kind) {
  const out = new Set();
  for (const e of entriesAt(record, step)) {
    const about = aboutOf(e);
    if (about !== null && about.kind === kind) out.add(about.id);
  }
  return out;
}

/**
 * The control a removal chose, or null before `choose-the-control` has recorded it (C-007).
 * @param {WorkflowRecord} record
 * @returns {string | null}
 */
function chosenControl(record) {
  return entriesAt(record, 'choose-the-control')[0]?.ref?.id ?? null;
}

/**
 * The hazards a removal is about, as at `body`: every row of the platform's query carrying the
 * chosen control confirmed (C-007).
 * @param {DataBody} body
 * @param {WorkflowRecord} record
 * @returns {Promise<string[]>} hazard ids
 */
async function removalSet(body, record) {
  const controlId = chosenControl(record);
  if (controlId === null) return [];
  const { rows } = await registry.listPlatformHazards(body, /** @type {PlatformId} */ (record.subject?.id));
  return rows
    .filter((r) => r.controls.some((c) => c.control.id === controlId && c.state === 'confirmed'))
    .map((r) => r.hazard.id);
}

/**
 * The hazards of a removal with no settlement, as at `body`, ascending as strings (C-007, C-008).
 * @param {DataBody} body
 * @param {WorkflowRecord} record
 * @returns {Promise<RecordRef[]>}
 */
async function unsettled(body, record) {
  const settled = recordedAbout(record, 'settle-the-ratings', 'hazard');
  return (await removalSet(body, record)).filter((id) => !settled.has(id)).sort(byString).map(hazardRef);
}

/**
 * What the current step still asks, as at `body` (C-008). The caller has checked the record is
 * live and in progress.
 * @param {DataBody} body
 * @param {WorkflowRecord} record
 * @returns {Promise<{ step: WorkflowStep, satisfied: boolean, outstanding: RecordRef[] }>}
 */
async function demandOf(body, record) {
  const step = /** @type {WorkflowStep} */ (record.currentStep);
  if (ONE_RECORD_STEPS.includes(step)) return { step, satisfied: entriesAt(record, step).length > 0, outstanding: [] };
  if (step === 'review-the-hazards') {
    const decided = recordedAbout(record, step, 'hazard');
    const { rows } = await registry.listPlatformHazards(body, /** @type {PlatformId} */ (record.subject?.id));
    const outstanding = rows.map((r) => r.hazard.id).filter((id) => !decided.has(id)).sort(byString).map(hazardRef);
    return { step, satisfied: outstanding.length === 0, outstanding };
  }
  if (step === 'settle-the-ratings') {
    const outstanding = await unsettled(body, record);
    return { step, satisfied: outstanding.length === 0, outstanding };
  }
  if (step === 'record-the-outcome') {
    return { step, satisfied: false, outstanding: record.workflowKind === 'remove-control' ? await unsettled(body, record) : [] };
  }
  return { step, satisfied: true, outstanding: [] };
}

// ------------------------------------------------------------------ writing (C-010)

/**
 * The body with the one workflow record put, then its act recorded through `change-log`.
 * @param {DataBody} body the body every earlier act of this call has already been made on
 * @param {Act} act
 * @param {WorkflowRecord | null} before
 * @param {WorkflowRecord} after
 * @returns {Promise<WorkflowChange>}
 */
async function write(body, act, before, after) {
  const withRecord = /** @type {DataBody} */ (/** @type {unknown} */ ({
    ...body,
    collections: { ...body.collections, [KIND]: { .../** @type {any} */ (body.collections)?.[KIND], [after.id]: after } },
  }));
  const subject = after.subject;
  const affectedPlatformIds = subject !== null && REGISTRY_KINDS.includes(subject.kind)
    ? [...(await registry.platformsAffected(withRecord, subject))]
    : [];
  const recorded = await recordChange(withRecord, act.profile, {
    records: [{
      before: /** @type {StoredRecord | null} */ (/** @type {unknown} */ (before)),
      after: /** @type {StoredRecord} */ (/** @type {unknown} */ (after)),
    }],
    madeForPlatformId: act.madeForPlatformId,
    affectedPlatformIds,
  });
  return { body: recorded.body, workflow: after };
}

/**
 * @param {WorkflowStep} step
 * @param {WorkflowEntry['entryKind']} entryKind
 * @param {string} text
 * @param {RecordRef | null} ref
 * @param {Act} act
 * @param {TimestampAest} at
 * @returns {WorkflowEntry}
 */
function entry(step, entryKind, text, ref, act, at) {
  return { step, entryKind, text, ref, byProfileId: act.profile.id, atAest: at };
}

/**
 * @param {unknown} v
 * @returns {string}
 */
const valueText = (v) => (v === null ? 'none' : String(v));

// ------------------------------------------------------------------ operations: running a workflow

/** @type {Impl['startWorkflow']} */
export async function startWorkflow(body, act, fields) {
  const workflows = readWorkflows(body);
  const a = requireAct(act);
  const f = /** @type {Record<string, any>} */ (isObject(fields) ? fields : {});
  const workflowKind = f.workflowKind;
  if (!WORKFLOW_KINDS.includes(workflowKind)) throw new UnknownWorkflowKindError(workflowKind);
  const subject = f.subject;
  if (ON_A_PLATFORM.includes(workflowKind)) {
    if (!isRef(subject) || subject.kind !== 'platform') throw new InvalidSubjectError(workflowKind, subject);
    const live = await registry.listPlatforms(body);
    if (!live.some((p) => p.id === subject.id)) throw new InvalidSubjectError(workflowKind, subject);
  } else if (subject !== null) {
    throw new InvalidSubjectError(workflowKind, subject);
  }
  const at = nowAest();
  const by = a.profile.id;
  const ids = new Set(workflows.map((w) => w.id));
  let id = workflowRecordId.fresh();
  while (ids.has(id)) id = workflowRecordId.fresh();
  /** @type {WorkflowRecord} */
  const created = {
    id, kind: KIND, status: 'live', createdBy: by, createdAtAest: at, updatedBy: by, updatedAtAest: at,
    workflowKind,
    subject: subject === null ? null : { kind: subject.kind, id: subject.id },
    state: 'in-progress',
    currentStep: WORKFLOW_STEPS[/** @type {WorkflowKind} */ (workflowKind)][0],
    startedOnAest: todayAest(),
    completedOnAest: null,
    completedBy: null,
    outcome: null,
    entries: [],
  };
  return write(body, a, null, created);
}

/** @type {Impl['submitStep']} */
export async function submitStep(body, act, id, submission) {
  const workflows = readWorkflows(body);
  const a = requireAct(act);
  const record = requireWorkflow(workflows, id);
  requireInProgress(record);
  const step = /** @type {WorkflowStep} */ (record.currentStep);
  const s = /** @type {Record<string, any>} */ (isObject(submission) ? submission : {});
  // No submission belongs to record-the-outcome: it is passed by completing (C-002).
  if (s.step !== step || step === 'record-the-outcome') throw new WrongStepError(step, s.step);

  // Field values (section 4's order).
  if (step === 'review-the-hazards' && isBlank(s.note)) throw new InvalidNoteError(s.note);
  if (step === 'record-the-reason' && isBlank(s.text)) throw new InvalidReasonError(s.text);

  // A record the step has already recorded (C-004).
  if (ONE_RECORD_STEPS.includes(step)) {
    const first = entriesAt(record, step)[0];
    if (first !== undefined) throw new AlreadyRecordedError(step, first.ref);
  }
  /** @type {[WorkflowStep, 'hazard' | 'control', string][]} */
  const perRecord = [
    ['review-the-hazards', 'hazard', 'hazardId'], ['settle-the-ratings', 'hazard', 'hazardId'],
    ['select-hazards', 'hazard', 'hazardId'], ['choose-controls', 'control', 'controlId'],
  ];
  for (const [perStep, kind, field] of perRecord) {
    if (step === perStep && recordedAbout(record, step, kind).has(s[field])) {
      throw new AlreadyRecordedError(step, { kind, id: s[field] });
    }
  }

  // A record the step will not take (C-006, C-007).
  const platform = /** @type {PlatformId} */ (record.subject?.id);
  if (step === 'review-the-hazards') {
    const { rows } = await registry.listPlatformHazards(body, platform);
    if (!rows.some((r) => r.hazard.id === s.hazardId)) throw new HazardNotInReviewError(s.hazardId, platform);
  }
  if (step === 'choose-the-control') {
    const { rows } = await registry.listPlatformHazards(body, platform);
    const confirmed = rows.some((r) => r.controls.some((c) => c.control.id === s.controlId && c.state === 'confirmed'));
    if (!confirmed) throw new ControlNotOnPlatformError(s.controlId, platform);
  }

  // The act the step names, then the entry for it, in one call (C-009, C-013).
  const at = nowAest();
  let b = body;
  let subject = record.subject;
  /** @type {WorkflowEntry} */
  let added;
  switch (step) {
    case 'name-the-hazard': {
      const made = await registry.createHazard(b, a, { title: s.title });
      b = made.body;
      subject = { kind: 'hazard', id: made.hazard.id };
      added = entry(step, 'action', `Created hazard ${made.hazard.id} ${made.hazard.title}`, subject, a, at);
      break;
    }
    case 'describe-the-hazard': {
      const hazardId = /** @type {HazardId} */ (record.subject?.id);
      if (s.part === 'causal-factor') {
        const made = await registry.addCausalFactor(b, a, hazardId, { text: s.text });
        b = made.body;
        added = entry(step, 'action', `Added causal factor: ${made.causalFactor.text}`, { kind: 'causal-factor', id: made.causalFactor.id }, a, at);
      } else if (s.part === 'consequence') {
        const made = await registry.addConsequence(b, a, hazardId, { text: s.text });
        b = made.body;
        added = entry(step, 'action', `Added consequence: ${made.consequence.text}`, { kind: 'consequence', id: made.consequence.id }, a, at);
      } else {
        throw new TypeError(`describe-the-hazard takes a causal-factor or a consequence, got ${String(s.part)}`);
      }
      break;
    }
    case 'choose-controls': {
      const made = await registry.linkControlToHazard(b, a, { hazardId: /** @type {HazardId} */ (record.subject?.id), controlId: s.controlId, controlKind: s.controlKind });
      b = made.body;
      added = entry(step, 'action', `control ${s.controlId}: linked as ${s.controlKind}`, { kind: 'link', id: made.link.id }, a, at);
      break;
    }
    case 'name-the-platform': {
      const made = await registry.createPlatform(b, a, { name: s.name, ownerProfileId: s.ownerProfileId });
      b = made.body;
      subject = { kind: 'platform', id: made.platform.id };
      added = entry(step, 'action', `Created platform ${made.platform.name}`, subject, a, at);
      break;
    }
    case 'select-hazards': {
      const made = await registry.linkHazardToPlatform(b, a, { hazardId: s.hazardId, platformId: platform });
      b = made.body;
      added = entry(step, 'action', `hazard ${s.hazardId}: linked to the platform`, { kind: 'link', id: made.link.id }, a, at);
      break;
    }
    case 'review-the-hazards':
      added = entry(step, 'decision', s.note.trim(), hazardRef(s.hazardId), a, at);
      break;
    case 'choose-the-control':
      added = entry(step, 'decision', 'chosen to be taken off the platform', { kind: 'control', id: s.controlId }, a, at);
      break;
    case 'settle-the-ratings': {
      // C-008: registry C-029 refuses a change that changes nothing, so equal values are a decision.
      const { residual } = await registry.getRatings(b, s.hazardId, platform);
      if (residual.consequence === s.consequence && residual.likelihood === s.likelihood) {
        added = entry(step, 'decision', `residual confirmed as it stands: ${valueText(s.consequence)} ${valueText(s.likelihood)}`, hazardRef(s.hazardId), a, at);
      } else {
        const made = await registry.setRating(b, a, { hazardId: s.hazardId, platformId: platform, stage: 'residual', consequence: s.consequence, likelihood: s.likelihood });
        b = made.body;
        added = entry(step, 'action', `hazard ${s.hazardId}: residual re-entered as ${valueText(s.consequence)} ${valueText(s.likelihood)}`, { kind: 'rating', id: made.rating.id }, a, at);
      }
      break;
    }
    case 'record-the-reason':
      added = entry(step, 'decision', s.text.trim(), null, a, at);
      break;
    case 'choose-the-owner': {
      const made = await registry.setPlatformOwner(b, a, { platformId: platform, ownerProfileId: s.ownerProfileId });
      b = made.body;
      added = entry(step, 'action', `owner set to ${s.ownerProfileId}`, { kind: 'platform', id: made.platform.id }, a, at);
      break;
    }
    default:
      throw new WrongStepError(step, s.step);
  }
  return write(b, a, record, {
    ...record, subject, entries: [...record.entries, added], updatedBy: a.profile.id, updatedAtAest: at,
  });
}

/** @type {Impl['advanceStep']} */
export async function advanceStep(body, act, id) {
  const workflows = readWorkflows(body);
  const a = requireAct(act);
  const record = requireWorkflow(workflows, id);
  requireInProgress(record);
  const steps = WORKFLOW_STEPS[record.workflowKind];
  const at = steps.indexOf(/** @type {WorkflowStep} */ (record.currentStep));
  if (at === steps.length - 1) throw new LastStepError(record.id);
  const demand = await demandOf(body, record);
  if (!demand.satisfied) throw new StepIncompleteError(demand.step, demand.outstanding);
  return write(body, a, record, { ...record, currentStep: steps[at + 1], updatedBy: a.profile.id, updatedAtAest: nowAest() });
}

/** @type {Impl['completeWorkflow']} */
export async function completeWorkflow(body, act, id, fields) {
  const workflows = readWorkflows(body);
  const a = requireAct(act);
  const record = requireWorkflow(workflows, id);
  requireInProgress(record);
  if (record.currentStep !== 'record-the-outcome') throw new NotAtOutcomeError(record.id, /** @type {WorkflowStep} */ (record.currentStep));
  const outcome = isObject(fields) ? fields.outcome : undefined;
  if (isBlank(outcome)) throw new InvalidOutcomeError(outcome);
  const step = 'record-the-outcome';

  // C-007: the removal's set is read again from this body, and refused while any is unsettled.
  /** @type {string[]} */
  let toExclude = [];
  if (record.workflowKind === 'remove-control') {
    const outstanding = await unsettled(body, record);
    if (outstanding.length > 0) throw new StepIncompleteError('settle-the-ratings', outstanding);
    toExclude = (await removalSet(body, record)).sort(byHazardNumber);
  }

  // The completing acts, each on the body the last returned (C-009).
  const at = nowAest();
  let b = body;
  /** @type {WorkflowEntry[]} */
  const added = [];
  const platform = /** @type {PlatformId} */ (record.subject?.id);
  if (record.workflowKind === 'review-data') {
    const { omitted } = await registry.listPlatformHazards(b, platform);
    for (const o of omitted) added.push(entry(step, 'omission', `${o.reason}: ${o.detail}`, hazardRef(o.id), a, at));
    const decided = [...recordedAbout(record, 'review-the-hazards', 'hazard')].sort(byHazardNumber);
    for (const ref of [{ kind: 'platform', id: platform }, ...decided.map(hazardRef)]) {
      const r = /** @type {RecordRef} */ (ref);
      if ((await reviewSchedule.getSchedule(b, r)) === null) continue;
      const affectedPlatformIds = [...(await registry.platformsAffected(b, r))];
      b = (await reviewSchedule.completeReview(b, { profile: a.profile, madeForPlatformId: a.madeForPlatformId, affectedPlatformIds }, r)).body;
      added.push(entry(step, 'action', 'last reviewed date set', r, a, at));
    }
  }
  if (record.workflowKind === 'remove-control') {
    const controlId = /** @type {any} */ (chosenControl(record));
    const text = entriesAt(record, 'record-the-reason')[0]?.text ?? '';
    for (const hazardId of toExclude) {
      const made = await registry.excludeControlFromPlatform(b, a, { hazardId: /** @type {HazardId} */ (hazardId), controlId, platformId: platform, text });
      b = made.body;
      added.push(entry(step, 'action', `control ${controlId}: excluded from hazard ${hazardId}`, { kind: 'justification', id: made.justification.id }, a, at));
    }
  }
  const trimmed = /** @type {string} */ (outcome).trim();
  added.push(entry(step, 'outcome', trimmed, null, a, at));
  return write(b, a, record, {
    ...record,
    state: 'complete',
    currentStep: null,
    completedOnAest: todayAest(),
    completedBy: a.profile.id,
    outcome: trimmed,
    entries: [...record.entries, ...added],
    updatedBy: a.profile.id,
    updatedAtAest: at,
  });
}

/** @type {Impl['abandonWorkflow']} */
export async function abandonWorkflow(body, act, id) {
  const workflows = readWorkflows(body);
  const a = requireAct(act);
  const record = requireWorkflow(workflows, id);
  requireInProgress(record);
  return write(body, a, record, { ...record, status: 'deleted', updatedBy: a.profile.id, updatedAtAest: nowAest() });
}

// ------------------------------------------------------------------ operations: reading

/** @type {Impl['getWorkflow']} */
export async function getWorkflow(body, id) {
  return readWorkflows(body).find((w) => w.id === id) ?? null;
}

/** @type {Impl['listWorkflows']} */
export async function listWorkflows(body) {
  return readWorkflows(body)
    .filter((w) => w.status === 'live')
    .sort((x, y) => byString(x.createdAtAest, y.createdAtAest) || byString(x.id, y.id));
}

/** @type {Impl['progressOf']} */
export async function progressOf(body, id) {
  const record = requireWorkflow(readWorkflows(body), id);
  const steps = WORKFLOW_STEPS[record.workflowKind];
  if (record.currentStep === null) return { record, steps, done: [...steps], current: null, remaining: [] };
  const at = steps.indexOf(record.currentStep);
  return { record, steps, done: steps.slice(0, at), current: record.currentStep, remaining: steps.slice(at + 1) };
}

/** @type {Impl['stepDemand']} */
export async function stepDemand(body, id) {
  const record = requireWorkflow(readWorkflows(body), id);
  requireInProgress(record);
  return demandOf(body, record);
}

/** @type {Impl['reviewOmissions']} */
export async function reviewOmissions(body, id) {
  const record = requireWorkflow(readWorkflows(body), id);
  if (record.workflowKind !== 'review-data') return [];
  const { omitted } = await registry.listPlatformHazards(body, /** @type {PlatformId} */ (record.subject?.id));
  return omitted.map((o) => ({ id: o.id, reason: o.reason, detail: o.detail }));
}
