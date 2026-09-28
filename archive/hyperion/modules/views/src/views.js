/**
 * views, implementing contract version 11.0 (modules/views/CONTRACT.md). Selected by contract.js
 * unless VIEWS_IMPL=null. Clause IDs (C-nnn) cite the contract.
 *
 * An `App` is `{ screen }`; everything else about an open is held beside it in a WeakMap, so
 * `screen` is the only thing a consumer can read (C-001). Every operation first checks that it
 * belongs to the current screen kind and rejects with `WrongScreenError` before any module is
 * called (C-002); every failure a module signals after that is turned into a message on the
 * screen section 4 names (C-008). Every screen is built afresh from the working body when it is
 * shown (C-015): a builder makes the reads its clause names, and turns a read that fails into the
 * message and the empty or null field section 4 gives. Identical messages are shown once, so a
 * malformed record read by two calls of one screen is named once.
 *
 * Nothing here derives what an owning contract gives: no band, state, due date, overdue flag,
 * step list, demand, link, or platform list is computed; the three rules of composition of 11.0
 * (C-045, C-046, C-048) select by equality from what their contracts gave (C-009).
 */

import { message } from '../../../baseline/messages.js';
import { BROWSER_STORAGE_KEY } from '../../../baseline/schema.js';
import * as store from '../../store/contract.js';
import * as profiles from '../../profiles/contract.js';
import * as registry from '../../registry/contract.js';
import * as rating from '../../rating/contract.js';
import * as changeLog from '../../change-log/contract.js';
import * as reviewSchedule from '../../review-schedule/contract.js';
import * as referenceRegister from '../../reference-register/contract.js';
import * as workflows from '../../workflows/contract.js';
import * as bowtie from '../../bowtie/contract.js';
import * as reports from '../../reports/contract.js';
import { WrongScreenError } from '../contract.js';

/** @typedef {import('../contract.js').ViewsImplementation} Impl */
/** @typedef {import('../contract.js').App} App */
/** @typedef {import('../contract.js').Screen} Screen */
/** @typedef {import('../contract.js').ScreenKind} ScreenKind */
/** @typedef {import('../../../baseline/messages.js').UserMessage} UserMessage */

// ------------------------------------------------------------------ the C-002 table

/** @type {Record<ScreenKind, readonly string[]>} */
const OFFERED = Object.freeze({
  folder: ['chooseFolder', 'openFolder'],
  check: ['acknowledgeCheck'],
  profile: ['createProfile', 'selectProfile'],
  recover: ['acceptRecovery', 'declineRecovery'],
  hazards: ['addHazard', 'save', 'beginRestore', 'openHazard', 'openControls', 'openPlatforms', 'openHistory', 'openAcknowledgements',
    'openReferences', 'openWorkflows', 'openReports', 'openFilter', 'openDashboard', 'openOpenItems'],
  restore: ['chooseSaveState', 'prepareRestore', 'cancelRestore'],
  'confirm-restore': ['confirmRestore', 'cancelRestore'],
  hazard: ['renameHazard', 'addCausalFactor', 'addConsequence', 'linkControlToHazard', 'retireHazard', 'setReviewTempo', 'back'],
  controls: ['createControl', 'retireControl', 'setReviewTempo', 'back'],
  platforms: ['createPlatform', 'openPlatform', 'retirePlatform', 'setPlatformOwner', 'setReviewTempo', 'back'],
  platform: ['linkHazardToPlatform', 'openAssessment', 'back'],
  assessment: ['setReportId', 'enterRating', 'confirmControlForPlatform', 'excludeControlFromPlatform', 'openBowtie', 'back'],
  bowtie: ['chooseExportTarget', 'exportBowtie', 'back'],
  history: ['back'],
  acknowledge: ['acknowledgeChange', 'back'],
  references: ['createReference', 'openReference', 'back'],
  reference: ['linkReference', 'back'],
  workflows: ['startWorkflow', 'openWorkflow', 'back'],
  workflow: ['submitStep', 'advanceStep', 'completeWorkflow', 'abandonWorkflow', 'back'],
  reports: ['createTemplate', 'beginReport', 'openReport', 'back'],
  'prepare-report': ['produceReport', 'back'],
  report: ['chooseReportExportTarget', 'exportReport', 'back'],
  filter: ['applyFilter', 'back'],
  dashboard: ['back'],
  'open-items': ['back'],
  'confirm-edit': ['confirmEdit', 'cancelEdit'],
});

/** The named values an `ItemFilter` may hold besides the screen's own lists (C-045). */
const BANDS = Object.freeze(['High', 'Serious', 'Medium', 'Low', 'Not Credible', 'Eliminated', 'Uncategorised']);
const RECORD_STATUSES = Object.freeze(['live', 'retired', 'deleted']);
const CONTROL_STATES = Object.freeze(['confirmed', 'excluded', 'awaiting']);
/** The record kinds `registry` owns and answers `platformsAffected` for (registry C-024; DEC-024). */
const REGISTRY_KINDS = Object.freeze(['hazard', 'control', 'platform', 'causal-factor', 'consequence']);

// ------------------------------------------------------------------ the open, beside the App

/** @type {WeakMap<App, any>} */
const states = new WeakMap();

/** @returns {any} */
function freshState() {
  return {
    dataStore: null,
    session: null,
    profile: null,
    folderName: null,
    body: null,
    loadedBody: null,
    lastSave: null,
    unsaved: false,
    pendingProfiles: null,
    recoverable: null,
    restoreLeft: null,
    plan: null,
    hazardId: null,
    platformId: null,
    entryId: null,
    workflowId: null,
    templateId: null,
    reportId: null,
    pending: null,
  };
}

/**
 * Run one operation: check it belongs to the screen (C-002), then build the screen it resolves
 * with. No error but `WrongScreenError` leaves this module (C-008).
 * @param {App} app
 * @param {string} operation
 * @param {(st: any) => Promise<any>} fn
 * @returns {Promise<Screen>}
 */
async function run(app, operation, fn) {
  const kind = /** @type {ScreenKind} */ (app.screen.kind);
  if (!OFFERED[kind].includes(operation)) throw new WrongScreenError(operation, kind);
  const st = states.get(app);
  /** @type {any} */
  let screen;
  try {
    screen = await fn(st);
  } catch (e) {
    screen = { ...app.screen, messages: [describe(e)] };
  }
  app.screen = screen;
  return screen;
}

// ------------------------------------------------------------------ messages

/**
 * @param {unknown} v
 * @returns {string}
 */
const text = (v) => (typeof v === 'string' ? v : v === undefined ? 'undefined' : JSON.stringify(v) ?? String(v));

/**
 * @param {any} ref
 * @returns {string}
 */
const refText = (ref) => (ref && typeof ref === 'object' ? `${text(ref.kind)} ${text(ref.id)}` : text(ref));

/**
 * @param {'error' | 'warning' | 'info'} severity
 * @param {string} headline
 * @param {readonly unknown[]} items
 * @param {string} [next]
 * @returns {UserMessage}
 */
function say(severity, headline, items, next) {
  const fallback = severity === 'info' ? 'Nothing needs doing.' : severity === 'warning' ? 'Check what you entered and try again.' : 'Name this to whoever looks after the data folder, and try again.';
  return message(severity, headline, items.map(text), next ?? fallback);
}

/**
 * The kind of record a malformed-record error names, or null when `e` is not one.
 * @param {any} e
 * @returns {string | null}
 */
function malformedKind(e) {
  if (e instanceof registry.MalformedRecordError) return e.recordKind;
  if (e instanceof reviewSchedule.MalformedScheduleError) return 'review-schedule';
  if (e instanceof changeLog.MalformedEntryError) return 'change-log-entry';
  if (e instanceof referenceRegister.MalformedEntryError) return 'reference-entry';
  if (e instanceof workflows.MalformedWorkflowError) return 'workflow-record';
  if (e instanceof reports.MalformedTemplateError) return 'report-template';
  if (e instanceof reports.MalformedReportError) return 'report';
  return null;
}

/** @param {any} e */
const isMalformed = (e) => malformedKind(e) !== null;

/**
 * The one message section 4 gives for an error a module signalled, where the row's items can be
 * read from the error alone.
 * @param {any} e
 * @returns {UserMessage}
 */
function describe(e) {
  const kind = malformedKind(e);
  if (kind !== null) return say('error', 'A stored record could not be read.', [e.key, kind], 'Nothing from that collection is shown. Restore from a backup, or ask whoever last saved to check the folder.');
  const name = e && typeof e === 'object' ? e.name : '';
  if (e instanceof store.StoreReadError) return say('error', 'A file could not be read.', [e.file]);
  if (e instanceof store.StoreWriteError) return say('error', 'A write did not complete.', [e.file]);
  if (e instanceof profiles.InvalidProfileNameError) return say('warning', 'A profile needs a name.', [/** @type {any} */ (e).given ?? '']);
  if (e instanceof profiles.DuplicateProfileNameError) return say('warning', 'A profile with that name already exists.', [/** @type {any} */ (e).existing.name], 'Choose that profile from the list, or use a different name.');
  if (e instanceof profiles.UnknownProfileError) return say('warning', 'That profile is not stored in this folder.', [/** @type {any} */ (e).id ?? /** @type {any} */ (e).given ?? ''], 'Choose a profile from the list.');
  if (e instanceof registry.InvalidRatingValueError) return say('warning', 'That rating is not on the scale.', [e.field, e.given], 'Enter a consequence from 1 to 5 and a likelihood from A to G.');
  if (e instanceof registry.HazardSequenceError) return say('error', 'The next hazard ID is already taken.', [e.id]);
  if (e instanceof registry.NoChangeError) return say('info', 'Nothing changed: that is the value already stored.', [e.field]);
  if (e instanceof reviewSchedule.NoChangeError) return say('info', 'Nothing changed: that review schedule is already stored.', [refText(e.ref), e.detail]);
  if (e instanceof registry.DuplicateLinkError || e instanceof registry.AlreadyExcludedError) return say('warning', 'That is already recorded.', [e.existing]);
  if (e instanceof registry.HazardNotOnPlatformError) return say('warning', 'That hazard is not on that platform.', [e.hazardId, e.platformId]);
  if (e instanceof registry.ControlNotOnHazardError) return say('warning', 'That control is not one of the hazard\'s.', [e.controlId, e.hazardId]);
  if (e instanceof referenceRegister.DuplicateLinkError) return say('warning', 'The entry is already linked to that.', [refText(e.ref)]);
  if (e instanceof referenceRegister.InvalidFieldError) return say('warning', 'That field is blank.', [e.field], 'Fill it in, or leave it out.');
  if (e instanceof referenceRegister.EmptyEntryError) return say('warning', 'A reference needs a name, a link, a path, or a file.', []);
  if (e instanceof referenceRegister.UnknownEntryError) return say('warning', 'That reference is not in the register.', [e.given]);
  if (e instanceof workflows.StepIncompleteError) return say('warning', 'That step is not finished.', [e.step, ...e.outstanding.map(refText)], 'Finish what the step still asks for.');
  if (e instanceof workflows.WrongStepError) return say('warning', 'That is not the step the workflow is at.', [e.expected, e.given]);
  if (e instanceof workflows.AlreadyRecordedError) return say('warning', 'That step has already recorded it.', [e.step, e.ref === null ? 'nothing named' : refText(e.ref)]);
  if (e instanceof workflows.UnknownWorkflowKindError) return say('warning', 'That is not one of the five workflows.', [e.given]);
  if (e instanceof workflows.InvalidSubjectError) return say('warning', 'That workflow is not performed on that record.', [e.workflowKind, refText(e.given)]);
  if (e instanceof workflows.HazardNotInReviewError) return say('warning', 'That hazard is not one this review covers.', [e.hazardId, e.platformId]);
  if (e instanceof workflows.ControlNotOnPlatformError) return say('warning', 'That control is not confirmed on this platform.', [e.controlId, e.platformId]);
  if (e instanceof workflows.LastStepError) return say('info', 'This is the last step: complete the workflow instead.', [e.id]);
  if (e instanceof workflows.NotAtOutcomeError) return say('warning', 'The workflow is not at its last step.', [e.id, e.currentStep]);
  if (e instanceof workflows.WorkflowCompleteError) return say('warning', 'That workflow is complete, and nothing about it can be changed.', [e.id], 'Go back to the workflows.');
  if (e instanceof workflows.WorkflowNotLiveError || e instanceof workflows.UnknownWorkflowError) return say('warning', 'That workflow is not in the register.', [/** @type {any} */ (e).id ?? /** @type {any} */ (e).given]);
  if (e instanceof reports.InvalidSectionError) return say('warning', 'That layout cannot be saved.', [e.field], 'A template has exactly one place for the hazards.');
  if (e instanceof reports.UnknownTemplateError || e instanceof reports.TemplateNotLiveError) return say('warning', 'That template is not listed.', [e.id]);
  if (e instanceof reports.InvalidReportError) return say('error', 'That report cannot be drawn.', [e.field]);
  if (e instanceof bowtie.HazardOmittedError) return say('error', 'That hazard\'s bow-tie cannot be drawn.', [e.hazardId, e.key]);
  if (e instanceof bowtie.InvalidBowtieError) return say('error', 'That bow-tie cannot be drawn.', [e.field]);
  if (e instanceof reviewSchedule.ScheduleNotLiveError) return say('warning', 'That review schedule is not live.', [refText(e.ref)]);
  if (e instanceof changeLog.PlatformNotAwaitingError) return say('warning', 'That change is not awaiting that platform.', [e.entryId, e.platformId]);
  if (name === 'AbortError') return say('info', 'Nothing was chosen.', [], 'Choose again when you are ready.');
  if (e && typeof e === 'object' && 'given' in e) return say('warning', 'That value cannot be used.', [e.given]);
  if (e && typeof e === 'object' && 'id' in e && typeof e.id === 'string') return say('warning', 'That record is not listed.', [e.id], 'List again and choose again.');
  return say('error', 'That could not be done.', [e instanceof Error ? e.message : text(e)]);
}

/**
 * Messages in order, each shown once.
 * @param {readonly UserMessage[]} list
 * @returns {UserMessage[]}
 */
function once(list) {
  const seen = new Set();
  return list.filter((m) => {
    const key = JSON.stringify([m.severity, m.headline, m.items]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ------------------------------------------------------------------ building a screen

/** @param {any} st */
function topBar(st) {
  return { folderName: st.folderName, profileName: st.profile ? st.profile.name : null };
}

/**
 * @param {any} st
 * @param {ScreenKind} kind
 * @param {readonly UserMessage[]} messages
 * @param {Record<string, unknown>} fields
 * @returns {any}
 */
function screenOf(st, kind, messages, fields) {
  return { kind, topBar: topBar(st), messages: once(messages), ...fields };
}

/**
 * Call a read; on a malformed-record error push its message and give `fallback`.
 * @template T
 * @param {() => Promise<T>} read
 * @param {UserMessage[]} msgs
 * @param {T} fallback
 * @returns {Promise<T>}
 */
async function orMalformed(read, msgs, fallback) {
  try {
    return await read();
  } catch (e) {
    if (!isMalformed(e)) throw e;
    msgs.push(describe(e));
    return fallback;
  }
}

/**
 * C-031: the two review-schedule lists of a body, or null with the error when one cannot be read.
 * @param {any} body
 * @param {UserMessage[]} msgs
 */
async function reviewsOf(body, msgs) {
  try {
    return { schedules: await reviewSchedule.listSchedules(body), overdue: await reviewSchedule.listOverdue(body) };
  } catch (e) {
    if (!(e instanceof reviewSchedule.MalformedScheduleError)) throw e;
    msgs.push(describe(e));
    return null;
  }
}

/**
 * C-035: the register's file standing, or null with the error.
 * @param {any} st
 * @param {UserMessage[]} msgs
 */
async function filesOf(st, msgs) {
  try {
    return await referenceRegister.checkEntryFiles(st.body, st.dataStore);
  } catch (e) {
    if (!(e instanceof store.StoreReadError) && !isMalformed(e)) throw e;
    msgs.push(describe(e));
    return null;
  }
}

/**
 * Every stored profile, or empty with the warning section 4 gives.
 * @param {any} st
 * @param {UserMessage[]} msgs
 */
async function profilesOf(st, msgs) {
  try {
    return await profiles.listProfiles(st.session);
  } catch (e) {
    if (!(e instanceof store.StoreReadError)) throw e;
    msgs.push(say('warning', 'The profile names could not be read.', [e.file], 'Profiles are shown by their IDs until the folder can be read.'));
    return [];
  }
}

/**
 * The rows of one platform's query, each with the band `rating` gives for its residual (C-021).
 * @param {readonly any[]} rows
 */
async function withBands(rows) {
  const out = [];
  for (const row of rows) out.push({ ...row, residualRating: await rating.ratingFor(row.residual.consequence, row.residual.likelihood) });
  return out;
}

/**
 * One `error` per hazard a query omitted (C-020).
 * @param {readonly any[]} omitted
 * @param {string | null} [platformName] added to the items when the screen lists several platforms
 */
function omittedMessages(omitted, platformName = null) {
  return omitted.map((o) => say('error', 'A hazard on this platform could not be read, and is listed as omitted.', platformName === null ? [o.id, o.key] : [o.id, o.key, platformName], 'Name the record to whoever looks after the data folder.'));
}

/**
 * A platform's name by section 3's rule.
 * @param {readonly any[]} live
 * @param {string} id
 */
function platformNameIn(live, id) {
  const found = live.find((p) => p.id === id);
  return found ? found.name : id;
}

/**
 * @param {any} a
 * @param {any} b
 */
const sameRef = (a, b) => a.kind === b.kind && a.id === b.id;

// ------------------------------------------------------------------ the screens

/** @param {any} st @param {readonly UserMessage[]} [pre] */
async function hazardsScreen(st, pre = []) {
  /** @type {UserMessage[]} */
  const msgs = [...pre];
  const hazards = await orMalformed(() => registry.listHazards(st.body), msgs, []);
  const reviews = await reviewsOf(st.body, msgs);
  return screenOf(st, 'hazards', msgs, { hazards, unsaved: st.unsaved, lastSave: st.lastSave, reviews });
}

/** @param {any} st @param {readonly UserMessage[]} [pre] */
function folderScreen(st, pre = []) {
  return { kind: 'folder', topBar: { folderName: null, profileName: null }, messages: once(pre) };
}

/** @param {any} st @param {readonly any[]} list @param {readonly UserMessage[]} [pre] */
function profileScreen(st, list, pre = []) {
  return screenOf(st, 'profile', pre, { profiles: list });
}

/**
 * C-016 and C-044: one hazard's screen, or the hazards screen when the body has no live hazard
 * with that id.
 * @param {any} st
 * @param {string} id
 * @param {readonly UserMessage[]} [pre]
 */
async function hazardScreen(st, id, pre = []) {
  /** @type {UserMessage[]} */
  const msgs = [...pre];
  /** @type {any} */
  let detail = null;
  try {
    detail = await registry.getHazardDetail(st.body, /** @type {any} */ (id));
  } catch (e) {
    if (!isMalformed(e)) throw e;
    msgs.push(describe(e));
    const hazard = await orMalformed(() => registry.getHazard(st.body, /** @type {any} */ (id)), msgs, null);
    detail = hazard === null ? null : { hazard, causalFactors: [], consequences: [], controls: [] };
  }
  if (detail === null || detail.hazard.status !== 'live') {
    st.hazardId = null;
    return hazardsScreen(st, [...msgs, say('warning', 'That hazard is not listed.', [id], 'Choose a hazard from the list.')]);
  }
  st.hazardId = id;
  const mine = detail.controls.map((/** @type {any} */ c) => c.control.id);
  const library = await orMalformed(() => registry.listControls(st.body), msgs, []);
  const linkableControls = library.filter((c) => !mine.includes(c.id));

  const ref = { kind: 'hazard', id };
  /** @type {UserMessage[]} */
  const late = [];
  const ids = await orMalformed(() => registry.platformsAffected(st.body, /** @type {any} */ (ref)), msgs, []);
  const platforms = [];
  for (const pid of ids) {
    const q = await orMalformed(() => registry.listPlatformHazards(st.body, pid), msgs, null);
    if (q === null) continue;
    const row = q.rows.find((r) => r.hazard.id === id);
    const omitted = q.omitted.find((o) => o.id === id) ?? null;
    if (row) platforms.push({ platform: q.platform, controls: row.controls, omitted: null });
    else if (omitted) {
      platforms.push({ platform: q.platform, controls: null, omitted });
      late.push(...omittedMessages([omitted], q.platform.name));
    }
  }
  const included = await orMalformed(() => reports.reportsIncluding(st.body, /** @type {any} */ (ref)), msgs, []);
  const reviews = await reviewsOf(st.body, msgs);
  return screenOf(st, 'hazard', [...msgs, ...late], {
    hazard: detail.hazard,
    causalFactors: detail.causalFactors,
    consequences: detail.consequences,
    controls: detail.controls,
    linkableControls,
    platforms,
    reports: included,
    reviews,
  });
}

/** C-017 @param {any} st @param {readonly UserMessage[]} [pre] */
async function controlsScreen(st, pre = []) {
  /** @type {UserMessage[]} */
  const msgs = [...pre];
  const controls = await orMalformed(() => registry.listControls(st.body), msgs, []);
  const reviews = await reviewsOf(st.body, msgs);
  return screenOf(st, 'controls', msgs, { controls, reviews });
}

/** C-018 @param {any} st @param {readonly UserMessage[]} [pre] */
async function platformsScreen(st, pre = []) {
  /** @type {UserMessage[]} */
  const msgs = [...pre];
  const platforms = await orMalformed(() => registry.listPlatforms(st.body), msgs, []);
  const list = await profilesOf(st, msgs);
  const reviews = await reviewsOf(st.body, msgs);
  return screenOf(st, 'platforms', msgs, { platforms, profiles: list, reviews });
}

/**
 * C-020: one platform's hazards from the one query. A query that cannot be made at all is the
 * platforms screen with its message.
 * @param {any} st
 * @param {string} pid
 * @param {readonly UserMessage[]} [pre]
 */
async function platformScreen(st, pid, pre = []) {
  /** @type {UserMessage[]} */
  const msgs = [...pre];
  /** @type {any} */
  let q;
  try {
    q = await registry.listPlatformHazards(st.body, /** @type {any} */ (pid));
  } catch (e) {
    if (!isMalformed(e) && !(e instanceof registry.UnknownPlatformError) && !(e instanceof registry.PlatformNotLiveError)) throw e;
    msgs.push(describe(e));
    const all = isMalformed(e) ? await orMalformed(() => registry.listAllPlatforms(st.body), msgs, []) : [];
    const platform = all.find((p) => p.id === pid);
    if (!platform) {
      st.platformId = null;
      return platformsScreen(st, msgs);
    }
    q = { platform, rows: [], omitted: [] };
  }
  st.platformId = pid;
  const rows = await withBands(q.rows);
  msgs.push(...omittedMessages(q.omitted));
  const named = [...q.rows.map((/** @type {any} */ r) => r.hazard.id), ...q.omitted.map((/** @type {any} */ o) => o.id)];
  const live = await orMalformed(() => registry.listHazards(st.body), msgs, []);
  const reviews = await reviewsOf(st.body, msgs);
  return screenOf(st, 'platform', msgs, {
    platform: q.platform, rows, omitted: q.omitted, linkableHazards: live.filter((h) => !named.includes(h.id)), reviews,
  });
}

/**
 * C-022: one hazard on one platform, or the platform screen when the hazard is not a row of it.
 * @param {any} st
 * @param {string} pid
 * @param {string} hid
 * @param {readonly UserMessage[]} [pre]
 */
async function assessmentScreen(st, pid, hid, pre = []) {
  /** @type {UserMessage[]} */
  const msgs = [...pre];
  /** @type {any} */
  let q;
  try {
    q = await registry.listPlatformHazards(st.body, /** @type {any} */ (pid));
  } catch (e) {
    if (!isMalformed(e) && !(e instanceof registry.UnknownPlatformError) && !(e instanceof registry.PlatformNotLiveError)) throw e;
    return platformScreen(st, pid, [...pre, describe(e)]);
  }
  const row = q.rows.find((/** @type {any} */ r) => r.hazard.id === hid);
  if (!row) {
    st.hazardId = null;
    const omitted = q.omitted.some((/** @type {any} */ o) => o.id === hid);
    return platformScreen(st, pid, omitted ? pre : [...pre, say('warning', 'That hazard is not on this platform.', [hid], 'Choose a hazard from this platform\'s list.')]);
  }
  st.platformId = pid;
  st.hazardId = hid;
  const ratings = await registry.getRatings(st.body, /** @type {any} */ (hid), /** @type {any} */ (pid));
  const list = await profilesOf(st, msgs);
  const initialRating = await rating.ratingFor(ratings.initial.consequence, ratings.initial.likelihood);
  const residualRating = await rating.ratingFor(ratings.residual.consequence, ratings.residual.likelihood);
  const reviews = await reviewsOf(st.body, msgs);
  return screenOf(st, 'assessment', msgs, {
    platform: q.platform,
    hazard: row.hazard,
    reportId: row.reportId,
    controls: row.controls,
    profiles: list,
    initial: ratings.initial,
    initialRating,
    residual: ratings.residual,
    residualRating,
    reviews,
  });
}

/**
 * C-039: the bow-tie of the pair the assessment screen held, or the platform screen with the
 * refusal last when `bowtie` refuses it.
 * @param {any} st
 * @param {readonly UserMessage[]} [pre]
 * @param {{ value: any, svg: string } | null} [drawn] the drawing an export has just generated
 */
async function bowtieScreen(st, pre = [], drawn = null) {
  /** @type {UserMessage[]} */
  const msgs = [...pre];
  let value;
  let svg;
  if (drawn) {
    ({ value, svg } = drawn);
  } else {
    try {
      value = await bowtie.bowtieFor(st.body, st.hazardId, st.platformId);
      svg = await bowtie.renderBowtieSvg(value);
    } catch (e) {
      return refusedBowtie(st, e);
    }
  }
  const reviews = await reviewsOf(st.body, msgs);
  return screenOf(st, 'bowtie', msgs, { bowtie: value, svg, reviews });
}

/**
 * Section 4's bow-tie rows: the platform screen as `openPlatform` gives it, with the refusal last.
 * @param {any} st
 * @param {any} e
 */
async function refusedBowtie(st, e) {
  const screen = await platformScreen(st, st.platformId);
  if (e instanceof bowtie.HazardOmittedError) return screen;
  const extra = e instanceof registry.UnknownHazardError || e instanceof registry.HazardNotLiveError || e instanceof registry.HazardNotOnPlatformError
    ? say('warning', 'That hazard is not on this platform.', [st.hazardId, platformNameIn(screen.kind === 'platform' ? [screen.platform] : [], st.platformId)])
    : describe(e);
  return { ...screen, messages: once([...screen.messages, extra]) };
}

/** C-028 @param {any} st @param {readonly UserMessage[]} [pre] */
async function historyScreen(st, pre = []) {
  /** @type {UserMessage[]} */
  const msgs = [...pre];
  const entries = await orMalformed(() => changeLog.listEntries(st.body), msgs, []);
  const list = await profilesOf(st, msgs);
  return screenOf(st, 'history', msgs, { entries, profiles: list });
}

/** C-029 @param {any} st @param {readonly UserMessage[]} [pre] */
async function acknowledgeScreen(st, pre = []) {
  /** @type {UserMessage[]} */
  const msgs = [...pre];
  const platforms = await orMalformed(() => registry.listPlatforms(st.body), msgs, []);
  const list = await profilesOf(st, msgs);
  /** @type {any[]} */
  let queues = [];
  try {
    for (const platform of platforms.filter((p) => p.ownerProfileId === st.profile.id)) {
      queues.push({ platform, entries: await changeLog.listAwaiting(st.body, platform.id) });
    }
  } catch (e) {
    if (!isMalformed(e)) throw e;
    msgs.push(describe(e));
    queues = [];
  }
  const reviews = await reviewsOf(st.body, msgs);
  return screenOf(st, 'acknowledge', msgs, { queues, profiles: list, reviews });
}

/** C-033 @param {any} st @param {readonly UserMessage[]} [pre] */
async function referencesScreen(st, pre = []) {
  /** @type {UserMessage[]} */
  const msgs = [...pre];
  /** @type {any} */
  let entries;
  /** @type {any} */
  let files = null;
  try {
    entries = await referenceRegister.listEntries(st.body);
    files = await filesOf(st, msgs);
  } catch (e) {
    if (!isMalformed(e)) throw e;
    msgs.push(describe(e));
    entries = [];
  }
  const reviews = await reviewsOf(st.body, msgs);
  st.entryId = null;
  return screenOf(st, 'references', msgs, { entries, files, reviews });
}

/**
 * C-034: one entry's own screen, or the register when the body has no live entry with that id.
 * @param {any} st
 * @param {string} id
 * @param {readonly UserMessage[]} [pre]
 */
async function referenceScreen(st, id, pre = []) {
  /** @type {UserMessage[]} */
  const msgs = [...pre];
  /** @type {any} */
  let entry;
  try {
    entry = await referenceRegister.getEntry(st.body, /** @type {any} */ (id));
  } catch (e) {
    if (!isMalformed(e)) throw e;
    return referencesScreen(st, [...pre, describe(e)]);
  }
  if (entry === null || entry.status !== 'live') return referencesScreen(st, [...pre, say('warning', 'That reference is not in the register.', [id], 'Choose a reference from the register.')]);
  st.entryId = id;
  const hazards = await orMalformed(() => registry.listHazards(st.body), msgs, []);
  const controls = await orMalformed(() => registry.listControls(st.body), msgs, []);
  const platforms = await orMalformed(() => registry.listPlatforms(st.body), msgs, []);
  /** @param {any} ref */
  const nameOf = (ref) => {
    if (ref.kind === 'hazard') return hazards.find((h) => h.id === ref.id)?.title ?? null;
    if (ref.kind === 'control') return controls.find((c) => c.id === ref.id)?.title ?? null;
    if (ref.kind === 'platform') return platforms.find((p) => p.id === ref.id)?.name ?? null;
    return null;
  };
  /** @param {string} kind */
  const linked = (kind) => entry.links.filter((/** @type {any} */ r) => r.kind === kind).map((/** @type {any} */ r) => r.id);
  const files = await filesOf(st, msgs);
  const reviews = await reviewsOf(st.body, msgs);
  return screenOf(st, 'reference', msgs, {
    entry,
    links: entry.links.map((/** @type {any} */ ref) => ({ ref, name: nameOf(ref) })),
    linkableHazards: hazards.filter((h) => !linked('hazard').includes(h.id)),
    linkableControls: controls.filter((c) => !linked('control').includes(c.id)),
    linkablePlatforms: platforms.filter((p) => !linked('platform').includes(p.id)),
    files,
    reviews,
  });
}

/**
 * `WorkflowRow`'s subject name over the screen's own live lists (C-036).
 * @param {any} subject
 * @param {readonly any[]} hazards
 * @param {readonly any[]} platforms
 */
function subjectNameOf(subject, hazards, platforms) {
  if (!subject) return null;
  if (subject.kind === 'hazard') return hazards.find((h) => h.id === subject.id)?.title ?? null;
  if (subject.kind === 'platform') return platforms.find((p) => p.id === subject.id)?.name ?? null;
  return null;
}

/** C-036 @param {any} st @param {readonly UserMessage[]} [pre] */
async function workflowsScreen(st, pre = []) {
  /** @type {UserMessage[]} */
  const msgs = [...pre];
  const records = await orMalformed(() => workflows.listWorkflows(st.body), msgs, []);
  const hazards = await orMalformed(() => registry.listHazards(st.body), msgs, []);
  const platforms = await orMalformed(() => registry.listPlatforms(st.body), msgs, []);
  const list = await profilesOf(st, msgs);
  const reviews = await reviewsOf(st.body, msgs);
  st.workflowId = null;
  return screenOf(st, 'workflows', msgs, {
    workflows: records.map((workflow) => ({ workflow, subjectName: subjectNameOf(workflow.subject, hazards, platforms) })),
    platforms,
    profiles: list,
    reviews,
  });
}

/**
 * C-037: one workflow's own screen, or the register when the body has no live workflow with that id.
 * @param {any} st
 * @param {string} id
 * @param {readonly UserMessage[]} [pre]
 */
async function workflowScreen(st, id, pre = []) {
  /** @type {UserMessage[]} */
  const msgs = [...pre];
  /** @type {any} */
  let progress;
  try {
    progress = await workflows.progressOf(st.body, /** @type {any} */ (id));
  } catch (e) {
    if (isMalformed(e)) return workflowsScreen(st, [...pre, describe(e)]);
    if (e instanceof workflows.UnknownWorkflowError) return workflowsScreen(st, [...pre, describe(e)]);
    throw e;
  }
  const record = progress.record;
  if (record.status !== 'live') return workflowsScreen(st, [...pre, say('warning', 'That workflow is not in the register.', [id], 'Choose a workflow from the register.')]);
  st.workflowId = id;
  const demand = record.state === 'in-progress' ? await workflows.stepDemand(st.body, /** @type {any} */ (id)) : null;

  /** @type {any} */
  const group = { subjectName: null, platform: null, rows: null, omitted: null, hazard: null, causalFactors: null, consequences: null, controls: null };
  const subject = record.subject;
  if (subject && subject.kind === 'platform') {
    const q = await orMalformed(() => registry.listPlatformHazards(st.body, subject.id), msgs, null);
    if (q !== null && q.platform.status === 'live') {
      Object.assign(group, { platform: q.platform, rows: await withBands(q.rows), omitted: q.omitted, subjectName: q.platform.name });
      msgs.push(...omittedMessages(q.omitted));
    }
  } else if (subject && subject.kind === 'hazard') {
    const detail = await orMalformed(() => registry.getHazardDetail(st.body, subject.id), msgs, null);
    if (detail !== null && detail.hazard.status === 'live') {
      Object.assign(group, {
        hazard: detail.hazard, causalFactors: detail.causalFactors, consequences: detail.consequences, controls: detail.controls, subjectName: detail.hazard.title,
      });
    }
  }
  /** @type {any[]} */
  let linkableHazards = [];
  /** @type {any[]} */
  let linkableControls = [];
  if (progress.current === 'select-hazards') {
    const named = [...(group.rows ?? []).map((/** @type {any} */ r) => r.hazard.id), ...(group.omitted ?? []).map((/** @type {any} */ o) => o.id)];
    linkableHazards = (await orMalformed(() => registry.listHazards(st.body), msgs, [])).filter((h) => !named.includes(h.id));
  }
  if (progress.current === 'choose-controls') {
    const mine = (group.controls ?? []).map((/** @type {any} */ c) => c.control.id);
    linkableControls = (await orMalformed(() => registry.listControls(st.body), msgs, [])).filter((c) => !mine.includes(c.id));
  }
  const list = await profilesOf(st, msgs);
  const reviews = await reviewsOf(st.body, msgs);
  return screenOf(st, 'workflow', msgs, { progress, demand, ...group, linkableHazards, linkableControls, profiles: list, reviews });
}

/** C-041 @param {any} st @param {readonly UserMessage[]} [pre] */
async function reportsScreen(st, pre = []) {
  /** @type {UserMessage[]} */
  const msgs = [...pre];
  /** @type {any} */
  let templates;
  /** @type {any} */
  let produced;
  try {
    templates = await reports.listTemplates(st.body);
    produced = await reports.listReports(st.body);
  } catch (e) {
    if (!isMalformed(e)) throw e;
    msgs.push(describe(e));
    templates = [];
    produced = [];
  }
  const platforms = await orMalformed(() => registry.listPlatforms(st.body), msgs, []);
  const reviews = await reviewsOf(st.body, msgs);
  st.templateId = null;
  st.reportId = null;
  st.platformId = null;
  return screenOf(st, 'reports', msgs, { templates, reports: produced, platforms, reviews });
}

/**
 * C-042: the report not yet produced, or the reports screen with the refusal when what it would
 * hold cannot be read.
 * @param {any} st
 * @param {string} tid
 * @param {string} pid
 * @param {readonly UserMessage[]} [pre]
 */
async function prepareScreen(st, tid, pid, pre = []) {
  /** @type {UserMessage[]} */
  const msgs = [...pre];
  try {
    const template = await reports.getTemplate(st.body, /** @type {any} */ (tid));
    if (template === null) return reportsScreen(st, [...pre, say('warning', 'That template is not listed.', [tid], 'List again and choose again.')]);
    const q = await registry.listPlatformHazards(st.body, /** @type {any} */ (pid));
    const rows = await withBands(q.rows);
    const outOfDate = await reports.outOfDateFor(st.body, /** @type {any} */ (pid));
    if (outOfDate.length > 0) {
      msgs.push(say(
        'warning',
        'Records this report would use are past their review due date.',
        outOfDate.map((r) => `${r.ref.kind} ${r.name}: ${r.lastReviewedAest === null ? 'never reviewed' : `last reviewed ${r.lastReviewedAest}`}`),
        'Review them first, or produce the report knowing they are out of date.',
      ));
    }
    msgs.push(...omittedMessages(q.omitted));
    const reviews = await reviewsOf(st.body, msgs);
    st.templateId = tid;
    st.platformId = pid;
    return screenOf(st, 'prepare-report', msgs, { template, platform: q.platform, rows, omitted: q.omitted, outOfDate, reviews });
  } catch (e) {
    if (isMalformed(e) || e instanceof registry.UnknownPlatformError || e instanceof registry.PlatformNotLiveError
      || e instanceof reports.UnknownTemplateError || e instanceof reports.TemplateNotLiveError) {
      return reportsScreen(st, [...pre, describe(e)]);
    }
    throw e;
  }
}

/**
 * C-043: one report's own screen, or the reports screen when the body has no report with that id.
 * @param {any} st
 * @param {string} id
 * @param {readonly UserMessage[]} [pre]
 */
async function reportScreen(st, id, pre = []) {
  /** @type {any} */
  let report;
  try {
    report = await reports.getReport(st.body, /** @type {any} */ (id));
  } catch (e) {
    if (!isMalformed(e)) throw e;
    return reportsScreen(st, [...pre, describe(e)]);
  }
  if (report === null) return reportsScreen(st, [...pre, say('warning', 'That report is not listed.', [id], 'List again and choose again.')]);
  st.reportId = id;
  const includes = await reports.includesOf(report);
  return screenOf(st, 'report', pre, { report, includes });
}

/**
 * C-027: the confirm-edit screen for an edit that reaches two or more platforms.
 * @param {any} st
 * @param {any} editing
 * @param {readonly string[]} ids
 */
async function confirmEditScreen(st, editing, ids) {
  /** @type {UserMessage[]} */
  const msgs = [];
  const live = await orMalformed(() => registry.listPlatforms(st.body), msgs, []);
  const reviews = await reviewsOf(st.body, msgs);
  return screenOf(st, 'confirm-edit', msgs, { editing, affected: ids.map((id) => ({ id, name: platformNameIn(live, id) })), reviews });
}

// ------------------------------------------------------------------ C-045 to C-048

/**
 * Every live platform's query, or null for one whose query rejected.
 * @param {any} st
 * @param {readonly any[]} platforms
 * @param {UserMessage[]} msgs
 */
async function queriesOf(st, platforms, msgs) {
  /** @type {Map<string, any>} */
  const out = new Map();
  for (const p of platforms) out.set(p.id, await orMalformed(() => registry.listPlatformHazards(st.body, p.id), msgs, null));
  return out;
}

/**
 * The filter screen (C-045).
 * @param {any} st
 * @param {any} filter
 * @param {readonly UserMessage[]} [pre]
 */
async function filterScreen(st, filter, pre = []) {
  /** @type {UserMessage[]} */
  const msgs = [...pre];
  /** @type {any[]} */
  let hazardItems = [];
  /** @type {any[]} */
  let controlItems = [];
  /** @type {any[]} */
  let platforms = [];
  let readable = true;
  try {
    const allHazards = await registry.listAllHazards(st.body);
    const allControls = await registry.listAllControls(st.body);
    try {
      platforms = [...await registry.listAllPlatforms(st.body)];
    } catch (e) {
      if (!isMalformed(e)) throw e;
      platforms = [];
      throw e;
    }
    const queries = [];
    for (const p of platforms) {
      const q = await registry.listPlatformHazards(st.body, p.id);
      queries.push({ platform: q.platform, rows: await withBands(q.rows), omitted: q.omitted });
      msgs.push(...omittedMessages(q.omitted, p.name));
    }
    for (const h of allHazards) {
      let any = false;
      for (const q of queries) {
        const row = q.rows.find((/** @type {any} */ r) => r.hazard.id === h.id);
        const omitted = q.omitted.find((/** @type {any} */ o) => o.id === h.id);
        if (row) {
          hazardItems.push({ hazard: h, platform: q.platform, omitted: null, residualRating: row.residualRating });
          any = true;
        } else if (omitted) {
          hazardItems.push({ hazard: h, platform: q.platform, omitted, residualRating: null });
          any = true;
        }
      }
      if (!any) hazardItems.push({ hazard: h, platform: null, omitted: null, residualRating: null });
    }
    for (const c of allControls) {
      let any = false;
      for (const h of allHazards) {
        for (const q of queries) {
          const row = q.rows.find((/** @type {any} */ r) => r.hazard.id === h.id);
          const pc = row?.controls.find((/** @type {any} */ x) => x.control.id === c.id);
          if (pc) {
            controlItems.push({ control: pc.control, hazard: row.hazard, platform: q.platform, platformControl: pc, residualRating: row.residualRating });
            any = true;
          }
        }
      }
      if (!any) controlItems.push({ control: c, hazard: null, platform: null, platformControl: null, residualRating: null });
    }
  } catch (e) {
    if (!isMalformed(e)) throw e;
    msgs.push(describe(e));
    hazardItems = [];
    controlItems = [];
    readable = false;
  }
  /** @type {any[]} */
  let entries = [];
  /** @type {any} */
  let files = null;
  let entriesRead = true;
  try {
    entries = [...await referenceRegister.listEntries(st.body)];
    files = await filesOf(st, msgs);
  } catch (e) {
    if (!isMalformed(e)) throw e;
    msgs.push(describe(e));
    entries = [];
    entriesRead = false;
  }
  if (!entriesRead && filter.referenceEntryId !== null) {
    hazardItems = [];
    controlItems = [];
  }
  const reviews = await reviewsOf(st.body, msgs);
  /**
   * @param {'hazard' | 'control'} kind
   * @param {any} item
   */
  const satisfies = (kind, item) => {
    if (filter.platformId !== null && item.platform?.id !== filter.platformId) return false;
    if (filter.band !== null && item.residualRating?.band !== filter.band) return false;
    if (filter.recordStatus !== null && item[kind].status !== filter.recordStatus) return false;
    if (filter.controlState !== null && (kind === 'hazard' || item.platformControl?.state !== filter.controlState)) return false;
    if (filter.referenceEntryId !== null) {
      const entry = entries.find((e) => e.id === filter.referenceEntryId);
      if (!entry || !entry.links.some((/** @type {any} */ r) => r.kind === kind && r.id === item[kind].id)) return false;
    }
    return true;
  };
  return screenOf(st, 'filter', msgs, {
    filter,
    hazards: readable ? hazardItems.filter((i) => satisfies('hazard', i)) : [],
    controls: readable ? controlItems.filter((i) => satisfies('control', i)) : [],
    platforms,
    entries,
    files,
    reviews,
  });
}

/**
 * A platform's review set (section 3).
 * @param {any} platform
 * @param {any} q
 * @param {readonly any[]} entries
 */
function reviewSetOf(platform, q, entries) {
  const refs = [{ kind: 'platform', id: platform.id }];
  for (const r of q.rows) refs.push({ kind: 'hazard', id: r.hazard.id });
  for (const o of q.omitted) refs.push({ kind: 'hazard', id: o.id });
  for (const r of q.rows) for (const c of r.controls) refs.push({ kind: 'control', id: c.control.id });
  for (const e of entries) if (e.links.some((/** @type {any} */ l) => refs.some((x) => sameRef(x, l)))) refs.push({ kind: 'reference-entry', id: e.id });
  return refs;
}

/**
 * The reads C-046 and C-047 share, each made once.
 * @param {any} st
 * @param {boolean} everyOwner
 * @param {UserMessage[]} msgs
 */
async function openItemsOf(st, everyOwner, msgs) {
  const live = await orMalformed(() => registry.listPlatforms(st.body), msgs, []);
  const list = await profilesOf(st, msgs);
  const shown = everyOwner ? live : live.filter((p) => p.ownerProfileId === st.profile.id);
  const records = /** @type {any[] | null} */ (await orMalformed(async () => [...await workflows.listWorkflows(st.body)], msgs, null));
  const entries = /** @type {any[] | null} */ (await orMalformed(async () => [...await referenceRegister.listEntries(st.body)], msgs, null));
  const reviews = await reviewsOf(st.body, msgs);
  const queries = await queriesOf(st, shown, msgs);
  /** @type {any[]} */
  const platforms = [];
  /** @type {UserMessage[]} */
  const omittedMsgs = [];
  /** @type {(any[] | null)[]} */
  const sets = [];
  let awaitingRead = true;
  for (const platform of shown) {
    const q = queries.get(platform.id);
    /** @type {any[]} */
    let awaiting = [];
    if (awaitingRead) {
      try {
        awaiting = [...await changeLog.listAwaiting(st.body, platform.id)];
      } catch (e) {
        if (!isMalformed(e)) throw e;
        msgs.push(describe(e));
        awaitingRead = false;
      }
    }
    const inProgress = (records ?? []).filter((r) => r.state === 'in-progress' && r.subject?.kind === 'platform' && r.subject.id === platform.id);
    if (q === null) {
      platforms.push({ platform, overdue: null, unconfirmed: [], omitted: [], workflows: inProgress, awaiting });
      sets.push(null);
      continue;
    }
    const set = entries === null ? null : reviewSetOf(platform, q, entries);
    sets.push(set);
    omittedMsgs.push(...omittedMessages(q.omitted, platform.name));
    platforms.push({
      platform,
      overdue: reviews === null || set === null ? null : reviews.overdue.filter((s) => set.some((r) => sameRef(r, s.ref))),
      unconfirmed: q.rows.flatMap((/** @type {any} */ r) => r.controls.filter((/** @type {any} */ c) => c.state === 'awaiting').map((/** @type {any} */ c) => ({ hazard: r.hazard, control: c }))),
      omitted: q.omitted,
      workflows: inProgress,
      awaiting,
    });
  }
  if (!awaitingRead) for (const p of platforms) p.awaiting = [];
  msgs.push(...omittedMsgs);
  return { live, list, platforms, records, entries, reviews, sets };
}

/** C-046 @param {any} st @param {readonly UserMessage[]} [pre] */
async function dashboardScreen(st, pre = []) {
  /** @type {UserMessage[]} */
  const msgs = [...pre];
  const { list, platforms, reviews } = await openItemsOf(st, false, msgs);
  return screenOf(st, 'dashboard', msgs, { platforms, profiles: list, reviews });
}

/** C-047, C-048 @param {any} st @param {readonly UserMessage[]} [pre] */
async function openItemsScreen(st, pre = []) {
  /** @type {UserMessage[]} */
  const msgs = [...pre];
  const { live, list, platforms, records, entries, reviews, sets } = await openItemsOf(st, true, msgs);
  const hazards = await orMalformed(() => registry.listHazards(st.body), msgs, null);
  const files = entries === null ? null : await filesOf(st, msgs);

  const unplacedOverdue = reviews === null || platforms.some((p) => p.overdue === null)
    ? null
    : reviews.overdue.filter((s) => !sets.some((set) => set !== null && set.some((r) => sameRef(r, s.ref))));
  const unplacedWorkflows = (records ?? [])
    .filter((r) => r.state === 'in-progress' && !(r.subject?.kind === 'platform' && live.some((p) => p.id === r.subject.id)))
    .map((workflow) => ({ workflow, subjectName: subjectNameOf(workflow.subject, hazards ?? [], live) }));

  /** @type {any[] | null} */
  let unlinked = null;
  if (records !== null && entries !== null && hazards !== null) {
    try {
      const inProgress = records.filter((r) => r.state === 'in-progress');
      /** @param {any} ref */
      const byOthers = (ref) => entries.some((e) => e.links.some((/** @type {any} */ l) => sameRef(l, ref)))
        || inProgress.some((r) => r.subject && sameRef(r.subject, ref));
      /** @type {any[]} */
      const out = [];
      for (const h of hazards) {
        const ref = { kind: 'hazard', id: h.id };
        const links = await registry.listLinks(st.body, /** @type {any} */ (ref));
        const detail = /** @type {any} */ (await registry.getHazardDetail(st.body, h.id));
        const linked = links.some((l) => l.linkKind === 'hazard-control' || l.linkKind === 'hazard-platform')
          || detail.causalFactors.length > 0 || detail.consequences.length > 0 || byOthers(ref);
        if (!linked) out.push({ ref, name: h.title });
      }
      for (const c of await registry.listControls(st.body)) {
        const ref = { kind: 'control', id: c.id };
        const linked = (await registry.listLinks(st.body, /** @type {any} */ (ref))).some((l) => l.linkKind === 'hazard-control') || byOthers(ref);
        if (!linked) out.push({ ref, name: c.title });
      }
      for (const p of live) {
        const ref = { kind: 'platform', id: p.id };
        const linked = (await registry.listLinks(st.body, /** @type {any} */ (ref))).some((l) => l.linkKind === 'hazard-platform') || byOthers(ref);
        if (!linked) out.push({ ref, name: p.name });
      }
      for (const e of entries) {
        const ref = { kind: 'reference-entry', id: e.id };
        if (e.links.length === 0 && !byOthers(ref)) out.push({ ref, name: e.name });
      }
      unlinked = out;
    } catch (e) {
      if (!isMalformed(e)) throw e;
      msgs.push(describe(e));
      unlinked = null;
    }
  }
  return screenOf(st, 'open-items', msgs, {
    platforms,
    unplaced: { overdue: unplacedOverdue, workflows: unplacedWorkflows },
    unlinked,
    profiles: list,
    files,
    reviews,
  });
}

// ------------------------------------------------------------------ changes (C-012, C-026, C-027)

/**
 * Hold the body a changing operation returned and tell `store` of it (C-012); the messages
 * section 4 gives for what `noteChange` could not write.
 * @param {any} st
 * @param {any} body
 * @returns {Promise<UserMessage[]>}
 */
async function commit(st, body) {
  st.body = body;
  st.unsaved = true;
  try {
    const outcome = await store.noteChange(st.dataStore, st.profile, body);
    /** @type {UserMessage[]} */
    const out = [];
    if (outcome.mirrorError) out.push(say('warning', 'The working state is not being kept in this browser.', [outcome.mirrorError.file], 'Save to the data folder soon.'));
    if (outcome.backupError) out.push(say('warning', 'No backup was taken of this change.', [outcome.backupError.file], 'Save to the data folder soon.'));
    return out;
  } catch {
    return [say('warning', 'The working state is not being kept in this browser, and no backup was taken.', [BROWSER_STORAGE_KEY, 'backups'], 'Save to the data folder soon.')];
  }
}

/**
 * The act of C-026.
 * @param {any} st
 * @param {string | null} madeForPlatformId
 * @returns {any} registry's `Act`: the selected profile, never one built here, and a platform id `registry` gave
 */
function actOf(st, madeForPlatformId) {
  return { profile: st.profile, madeForPlatformId };
}

/**
 * Make one change: `change` returns the new body; on success tell `store` and show `after`, on a
 * refusal show `origin` with the message.
 * @param {any} st
 * @param {() => Promise<any>} change
 * @param {(msgs: UserMessage[]) => Promise<any>} after
 * @param {(msgs: UserMessage[]) => Promise<any>} origin
 * @param {(e: any) => Promise<any> | any} [refuse] the screen for a refusal, when it is not the origin with the error's message
 */
async function changing(st, change, after, origin, refuse) {
  /** @type {any} */
  let body;
  try {
    body = await change();
  } catch (e) {
    if (refuse) {
      const special = await refuse(e);
      if (special) return special;
    }
    return origin([describe(e)]);
  }
  return after(await commit(st, body));
}

/**
 * C-027: gate an edit on the platforms it reaches; show the confirm-edit screen for two or more,
 * or make it now.
 * @param {any} st
 * @param {readonly string[]} ids
 * @param {any} editing
 * @param {() => Promise<any>} perform
 * @param {(msgs: UserMessage[]) => Promise<any>} origin
 */
async function gated(st, ids, editing, perform, origin) {
  if (ids.length < 2) return perform();
  st.pending = { perform, origin };
  return confirmEditScreen(st, editing, ids);
}

/**
 * `registry.platformsAffected` of a ref, for a gate; null with the origin's screen when it cannot
 * be read.
 * @param {any} st
 * @param {any} ref
 */
async function reach(st, ref) {
  return [...await registry.platformsAffected(st.body, ref)];
}

// ------------------------------------------------------------------ folder and profiles (C-001 to C-005, C-010)

/** @type {Impl['start']} */
export async function start() {
  const app = /** @type {App} */ ({ screen: { kind: 'folder', topBar: { folderName: null, profileName: null }, messages: [] } });
  states.set(app, freshState());
  return app;
}

/**
 * The affected-data name of a check failure (section 3).
 * @param {any} affects
 */
function affectedName(affects) {
  if (affects.kind === 'stored-data') return 'stored data';
  if (affects.kind === 'profiles') return 'profiles';
  if (affects.kind === 'backup') return `backup taken ${affects.takenAtAest}`;
  return 'superseded save';
}

/**
 * Open a data store already in hand: check, load, list the profiles (C-003, C-010).
 * @param {App} app
 * @param {any} st
 * @param {any} dataStore
 * @param {string} folderName
 */
async function openStore(app, st, dataStore, folderName) {
  const fresh = freshState();
  const failures = await store.checkFolder(dataStore);
  const failed = failures.map((f) => say('error', 'A file has changed since Pivot wrote it.', [f.file, affectedName(f.affects)], 'Nothing from it is shown. Restore from a backup, or replace it with a copy you trust.'));
  if (failures.some((f) => f.affects.kind === 'stored-data' || f.affects.kind === 'profiles')) {
    states.set(app, fresh);
    return folderScreen(fresh, failed);
  }
  const loaded = await store.load(dataStore);
  const session = await profiles.openProfiles(dataStore);
  const list = await profiles.listProfiles(session);
  Object.assign(fresh, {
    dataStore, session, folderName, body: loaded.body, loadedBody: loaded.body, lastSave: loaded.lastSave, unsaved: false,
  });
  states.set(app, fresh);
  if (failed.length > 0) {
    fresh.pendingProfiles = list;
    return screenOf(fresh, 'check', failed, {});
  }
  return profileScreen(fresh, list);
}

/**
 * A folder that could not be opened: the folder screen, nothing kept.
 * @param {App} app
 * @param {any} e
 */
function notOpened(app, e) {
  const fresh = freshState();
  states.set(app, fresh);
  return folderScreen(fresh, [e instanceof store.StoreReadError ? describe(e) : say('error', 'The data folder could not be opened.', [e instanceof Error ? e.message : text(e)])]);
}

/** @type {Impl['chooseFolder']} */
export function chooseFolder(app) {
  return run(app, 'chooseFolder', async (st) => {
    /** @type {any} */
    let dataStore;
    try {
      dataStore = await store.chooseDataFolder();
    } catch (e) {
      const cancelled = e && typeof e === 'object' && /** @type {any} */ (e).name === 'AbortError';
      return folderScreen(st, [cancelled
        ? say('info', 'No folder was chosen.', [], 'Choose the data folder when you are ready.')
        : say('error', 'The browser did not give access to that folder.', [e instanceof Error ? e.message : text(e)], 'Choose the folder again.')]);
    }
    try {
      return await openStore(app, st, dataStore, dataStore.folderName);
    } catch (e) {
      return notOpened(app, e);
    }
  });
}

/** @type {Impl['openFolder']} */
export function openFolder(app, handle) {
  return run(app, 'openFolder', async (st) => {
    try {
      const dataStore = await store.openDataFolder(handle);
      return await openStore(app, st, dataStore, handle.name);
    } catch (e) {
      return notOpened(app, e);
    }
  });
}

/** @type {Impl['acknowledgeCheck']} */
export function acknowledgeCheck(app) {
  return run(app, 'acknowledgeCheck', async (st) => {
    const list = st.pendingProfiles ?? [];
    st.pendingProfiles = null;
    return profileScreen(st, list);
  });
}

/**
 * The profile list re-read after a profile operation, or the folder screen when it cannot be read.
 * @param {App} app
 * @param {any} st
 * @param {UserMessage[]} msgs
 */
async function relisted(app, st, msgs) {
  try {
    return profileScreen(st, await profiles.listProfiles(st.session), msgs);
  } catch (e) {
    if (!(e instanceof store.StoreReadError)) throw e;
    return notOpened(app, e);
  }
}

/** @type {Impl['createProfile']} */
export function createProfile(app, name) {
  return run(app, 'createProfile', async (st) => {
    try {
      await profiles.createProfile(st.session, name);
    } catch (e) {
      if (e instanceof store.StoreReadError) return notOpened(app, e);
      if (e instanceof store.StoreWriteError) return relisted(app, st, [say('error', 'The profile was not saved.', [text(name).trim() || text(name)], 'Try again once the folder can be written.')]);
      return relisted(app, st, [describe(e)]);
    }
    return relisted(app, st, []);
  });
}

/** @type {Impl['selectProfile']} */
export function selectProfile(app, id) {
  return run(app, 'selectProfile', async (st) => {
    try {
      st.profile = await profiles.selectProfile(st.session, id);
    } catch (e) {
      if (e instanceof store.StoreReadError) return notOpened(app, e);
      return relisted(app, st, [describe(e)]);
    }
    /** @type {any} */
    let state;
    try {
      state = await store.readRecoverable(st.dataStore);
    } catch (e) {
      if (!(e instanceof store.StoreReadError)) throw e;
      return hazardsScreen(st, [say('warning', 'The working state in this browser could not be recovered.', [e.file], 'Your data folder is shown as last saved.')]);
    }
    if (state === null) return hazardsScreen(st);
    st.recoverable = state;
    /** @type {UserMessage[]} */
    const msgs = [];
    const hazards = await orMalformed(() => registry.listHazards(state.body), msgs, []);
    const reviews = await reviewsOf(state.body, msgs);
    return screenOf(st, 'recover', msgs, { mirroredAtAest: state.mirroredAtAest, basedOn: state.loadedStamp, hazards, reviews });
  });
}

/** @type {Impl['acceptRecovery']} */
export function acceptRecovery(app) {
  return run(app, 'acceptRecovery', async (st) => {
    try {
      st.body = await store.recoverWorkingState(st.dataStore, st.recoverable);
    } catch (e) {
      if (!(e instanceof store.StoreReadError)) throw e;
      st.body = st.loadedBody;
      st.unsaved = false;
      return hazardsScreen(st, [say('error', 'The working state could not be recovered.', [e.file], 'Your data folder is shown as last saved.')]);
    }
    st.recoverable = null;
    st.unsaved = true;
    return hazardsScreen(st);
  });
}

/** @type {Impl['declineRecovery']} */
export function declineRecovery(app) {
  return run(app, 'declineRecovery', async (st) => {
    st.recoverable = null;
    st.body = st.loadedBody;
    st.unsaved = false;
    try {
      await store.discardWorkingState(st.dataStore);
    } catch (e) {
      if (!(e instanceof store.StoreWriteError)) throw e;
      return hazardsScreen(st, [say('warning', 'The working state in this browser could not be cleared.', [e.file], 'Recovery will be offered again next time.')]);
    }
    return hazardsScreen(st);
  });
}

// ------------------------------------------------------------------ the hazards screen, saving, restoring (C-006, C-007, C-011, C-014)

/** @type {Impl['addHazard']} */
export function addHazard(app, fields) {
  return run(app, 'addHazard', async (st) => changing(
    st,
    async () => (await registry.createHazard(st.body, actOf(st, null), fields)).body,
    (msgs) => hazardsScreen(st, msgs),
    (msgs) => hazardsScreen(st, msgs),
  ));
}

/**
 * The name of a profile id: the stored profile's name, or the id itself (C-007, C-014).
 * @param {any} st
 * @param {string} id
 */
async function savedByName(st, id) {
  try {
    return (await profiles.listProfiles(st.session)).find((p) => p.id === id)?.name ?? id;
  } catch {
    return id;
  }
}

/**
 * C-007's messages for what `save` or `restore` resolved with.
 * @param {any} st
 * @param {any} outcome
 */
async function saveMessages(st, outcome) {
  /** @type {UserMessage[]} */
  const out = [];
  if (outcome.superseded !== null) {
    out.push(say('warning', 'Another user saved while you were working. Their data was kept aside.', [await savedByName(st, outcome.superseded.savedByProfileId), outcome.keptAs ?? ''], 'Check with them what to keep.'));
  }
  if (outcome.mirrorError) out.push(say('warning', 'The browser\'s copy of your work could not be marked saved.', [outcome.mirrorError.file], 'Recovery may be offered for data already saved.'));
  return out;
}

/**
 * The change names of section 3 for what `store.unsavedChanges` gives.
 * @param {any} st
 */
async function changeNames(st) {
  try {
    const refs = await store.unsavedChanges(st.dataStore, st.body);
    /** @type {any[]} */
    let live = [];
    try {
      live = [...await registry.listHazards(st.body)];
    } catch {
      live = [];
    }
    return refs.map((ref) => {
      const hazard = live.find((h) => h.id === ref.id);
      return hazard ? `${ref.id} ${hazard.title}` : ref.id;
    });
  } catch {
    return [];
  }
}

/** @type {Impl['save']} */
export function save(app) {
  return run(app, 'save', async (st) => {
    /** @type {any} */
    let outcome;
    // C-007, C-011: a save changes `unsaved`, `lastSave`, and the messages, and nothing else on
    // the screen, so the hazards and the review standing are the ones already shown.
    const shown = /** @type {any} */ (app.screen);
    try {
      outcome = await store.save(st.dataStore, st.profile, st.body);
    } catch {
      return { ...shown, messages: [say('error', 'Your changes were not saved.', await changeNames(st), 'Your changes are still on screen. Save again, or check the data folder.')] };
    }
    st.lastSave = outcome.stamp;
    st.unsaved = false;
    return { ...shown, unsaved: false, lastSave: outcome.stamp, messages: once(await saveMessages(st, outcome)) };
  });
}

/** @type {Impl['beginRestore']} */
export function beginRestore(app) {
  return run(app, 'beginRestore', async (st) => {
    const left = { ...app.screen, messages: [] };
    try {
      const backups = await store.listBackups(st.dataStore);
      st.restoreLeft = left;
      return screenOf(st, 'restore', [], { backups });
    } catch (e) {
      if (!(e instanceof store.StoreReadError)) throw e;
      return { ...left, messages: [describe(e)] };
    }
  });
}

/**
 * C-014: the confirm-restore screen for a source, or the restore screen as before with the refusal.
 * @param {App} app
 * @param {any} st
 * @param {any} source
 */
async function preparing(app, st, source) {
  const asBefore = { ...app.screen, messages: [] };
  /** @type {any} */
  let plan;
  try {
    plan = await store.prepareRestore(st.dataStore, source);
  } catch (e) {
    if (!(e instanceof store.StoreReadError)) throw e;
    return { ...asBefore, messages: [describe(e)] };
  }
  /** @type {UserMessage[]} */
  const msgs = [];
  /** @type {any} */
  let hazards;
  try {
    hazards = await registry.listHazards(plan.body);
  } catch (e) {
    if (!isMalformed(e)) throw e;
    return { ...asBefore, messages: [describe(e)] };
  }
  const names = await changeNames(st);
  const replacesSavedBy = plan.replaces === null ? null : await savedByName(st, plan.replaces.savedByProfileId);
  const reviews = await reviewsOf(plan.body, msgs);
  st.plan = plan;
  return screenOf(st, 'confirm-restore', [
    say('warning', 'Restoring replaces the stored data, and discards these unsaved changes.', names, 'Confirm to restore, or cancel to keep working.'),
    ...msgs,
  ], {
    restoring: source.kind === 'backup' ? source.file : source.saveState.name,
    stampInFile: plan.stampInFile,
    replaces: plan.replaces,
    replacesSavedBy,
    hazards,
    reviews,
  });
}

/** @type {Impl['chooseSaveState']} */
export function chooseSaveState(app) {
  return run(app, 'chooseSaveState', async (st) => {
    /** @type {any} */
    let saveState;
    try {
      saveState = await store.chooseSaveStateFile();
    } catch (e) {
      const cancelled = e && typeof e === 'object' && /** @type {any} */ (e).name === 'AbortError';
      return {
        ...app.screen,
        messages: [cancelled ? say('info', 'No file was chosen.', [], 'Choose a file when you are ready.') : say('error', 'The browser did not give access to that file.', [e instanceof Error ? e.message : text(e)], 'Choose again.')],
      };
    }
    return preparing(app, st, { kind: 'save-state', saveState });
  });
}

/** @type {Impl['prepareRestore']} */
export function prepareRestore(app, source) {
  return run(app, 'prepareRestore', (st) => preparing(app, st, source));
}

/** @type {Impl['confirmRestore']} */
export function confirmRestore(app) {
  return run(app, 'confirmRestore', async (st) => {
    const plan = st.plan;
    const restoring = /** @type {any} */ (app.screen).restoring;
    /** @type {any} */
    let outcome;
    try {
      outcome = await store.restore(st.dataStore, st.profile, plan);
    } catch {
      st.plan = null;
      return { ...st.restoreLeft, messages: [say('error', 'The restore did not happen. The stored data is as it was.', [restoring], 'Try again, or choose another file.')] };
    }
    st.plan = null;
    st.body = plan.body;
    st.lastSave = outcome.stamp;
    st.unsaved = false;
    return hazardsScreen(st, await saveMessages(st, outcome));
  });
}

/** @type {Impl['cancelRestore']} */
export function cancelRestore(app) {
  return run(app, 'cancelRestore', async (st) => {
    st.plan = null;
    return { ...st.restoreLeft, messages: [] };
  });
}

// ------------------------------------------------------------------ a hazard's screen (C-016, C-017, C-027, C-030)

/** @type {Impl['openHazard']} */
export function openHazard(app, id) {
  return run(app, 'openHazard', (st) => hazardScreen(st, id));
}

/**
 * One of the four gated operations of the hazard screen (C-016, C-017, C-027).
 * @param {App} app
 * @param {string} operation
 * @param {(st: any) => any} editing
 * @param {(st: any, hazardId: string) => Promise<any>} change
 */
function hazardEdit(app, operation, editing, change) {
  return run(app, operation, async (st) => {
    const hid = st.hazardId;
    const origin = (/** @type {UserMessage[]} */ msgs) => hazardScreen(st, hid, msgs);
    /** @type {string[]} */
    let ids;
    try {
      ids = await reach(st, { kind: 'hazard', id: hid });
    } catch (e) {
      return origin([describe(e)]);
    }
    return gated(st, ids, editing(st), () => changing(st, () => change(st, hid), (msgs) => hazardScreen(st, hid, msgs), origin), origin);
  });
}

/** @type {Impl['renameHazard']} */
export function renameHazard(app, fields) {
  return hazardEdit(app, 'renameHazard',
    () => ({ operation: 'renameHazard', hazard: /** @type {any} */ (app.screen).hazard, title: fields.title }),
    async (st, hid) => (await registry.updateHazard(st.body, actOf(st, null), /** @type {any} */ (hid), fields)).body);
}

/** @type {Impl['addCausalFactor']} */
export function addCausalFactor(app, fields) {
  return hazardEdit(app, 'addCausalFactor',
    () => ({ operation: 'addCausalFactor', hazard: /** @type {any} */ (app.screen).hazard, text: fields.text }),
    async (st, hid) => (await registry.addCausalFactor(st.body, actOf(st, null), /** @type {any} */ (hid), fields)).body);
}

/** @type {Impl['addConsequence']} */
export function addConsequence(app, fields) {
  return hazardEdit(app, 'addConsequence',
    () => ({ operation: 'addConsequence', hazard: /** @type {any} */ (app.screen).hazard, text: fields.text }),
    async (st, hid) => (await registry.addConsequence(st.body, actOf(st, null), /** @type {any} */ (hid), fields)).body);
}

/** @type {Impl['linkControlToHazard']} */
export function linkControlToHazard(app, controlId, controlKind) {
  return hazardEdit(app, 'linkControlToHazard',
    () => ({
      operation: 'linkControlToHazard',
      hazard: /** @type {any} */ (app.screen).hazard,
      control: /** @type {any} */ (app.screen).linkableControls.find((/** @type {any} */ c) => c.id === controlId) ?? null,
      controlId,
      controlKind,
    }),
    async (st, hid) => (await registry.linkControlToHazard(st.body, actOf(st, null), { hazardId: /** @type {any} */ (hid), controlId, controlKind })).body);
}

/** @type {Impl['retireHazard']} */
export function retireHazard(app) {
  return run(app, 'retireHazard', async (st) => {
    const hid = st.hazardId;
    return changing(
      st,
      async () => (await registry.retireHazard(st.body, actOf(st, null), hid)).body,
      (msgs) => hazardsScreen(st, msgs),
      (msgs) => hazardScreen(st, hid, msgs),
      async (e) => {
        if (!(e instanceof registry.HazardOnPlatformsError)) return null;
        const live = await orMalformed(() => registry.listPlatforms(st.body), [], []);
        return hazardScreen(st, hid, [say('warning', 'This hazard cannot be retired while it is linked to these platforms.', e.platformIds.map((id) => platformNameIn(live, id)), 'Unlink it from each platform first.')]);
      },
    );
  });
}

// ------------------------------------------------------------------ the control library and the platforms (C-017, C-018, C-030)

/** @type {Impl['openControls']} */
export function openControls(app) {
  return run(app, 'openControls', (st) => controlsScreen(st));
}

/** @type {Impl['createControl']} */
export function createControl(app, fields) {
  return run(app, 'createControl', async (st) => changing(
    st,
    async () => (await registry.createControl(st.body, actOf(st, null), fields)).body,
    (msgs) => controlsScreen(st, msgs),
    (msgs) => controlsScreen(st, msgs),
  ));
}

/** @type {Impl['retireControl']} */
export function retireControl(app, controlId) {
  return run(app, 'retireControl', async (st) => {
    const origin = (/** @type {UserMessage[]} */ msgs) => controlsScreen(st, msgs);
    /** @type {string[]} */
    let ids;
    try {
      ids = await reach(st, { kind: 'control', id: controlId });
    } catch (e) {
      return origin([describe(e)]);
    }
    const control = /** @type {any} */ (app.screen).controls.find((/** @type {any} */ c) => c.id === controlId) ?? null;
    return gated(st, ids, { operation: 'retireControl', control, controlId }, () => changing(
      st,
      async () => (await registry.retireControl(st.body, actOf(st, null), controlId)).body,
      origin,
      origin,
    ), origin);
  });
}

/** @type {Impl['openPlatforms']} */
export function openPlatforms(app) {
  return run(app, 'openPlatforms', (st) => platformsScreen(st));
}

/** @type {Impl['createPlatform']} */
export function createPlatform(app, fields) {
  return run(app, 'createPlatform', async (st) => changing(
    st,
    async () => (await registry.createPlatform(st.body, actOf(st, null), fields)).body,
    (msgs) => platformsScreen(st, msgs),
    (msgs) => platformsScreen(st, msgs),
  ));
}

/** @type {Impl['retirePlatform']} */
export function retirePlatform(app, platformId) {
  return run(app, 'retirePlatform', async (st) => changing(
    st,
    async () => (await registry.retirePlatform(st.body, actOf(st, null), platformId)).body,
    (msgs) => platformsScreen(st, msgs),
    (msgs) => platformsScreen(st, msgs),
  ));
}

/** @type {Impl['setPlatformOwner']} */
export function setPlatformOwner(app, platformId, ownerProfileId) {
  return run(app, 'setPlatformOwner', async (st) => changing(
    st,
    async () => (await registry.setPlatformOwner(st.body, actOf(st, null), { platformId, ownerProfileId })).body,
    (msgs) => platformsScreen(st, msgs),
    (msgs) => platformsScreen(st, msgs),
  ));
}

// ------------------------------------------------------------------ a platform and an assessment (C-019 to C-025)

/** @type {Impl['openPlatform']} */
export function openPlatform(app, id) {
  return run(app, 'openPlatform', (st) => platformScreen(st, id));
}

/** @type {Impl['linkHazardToPlatform']} */
export function linkHazardToPlatform(app, hazardId) {
  return run(app, 'linkHazardToPlatform', async (st) => {
    const pid = st.platformId;
    return changing(
      st,
      async () => (await registry.linkHazardToPlatform(st.body, actOf(st, pid), { hazardId, platformId: pid })).body,
      (msgs) => platformScreen(st, pid, msgs),
      (msgs) => platformScreen(st, pid, msgs),
    );
  });
}

/** @type {Impl['openAssessment']} */
export function openAssessment(app, hazardId) {
  return run(app, 'openAssessment', (st) => assessmentScreen(st, st.platformId, hazardId));
}

/**
 * One changing operation of the assessment screen.
 * @param {App} app
 * @param {string} operation
 * @param {(st: any, pid: string, hid: string) => Promise<any>} change
 * @param {(e: any, st: any) => UserMessage | null} [message] the refusal's message when the error alone cannot give it
 */
function assessmentEdit(app, operation, change, message) {
  return run(app, operation, async (st) => {
    const pid = st.platformId;
    const hid = st.hazardId;
    const origin = (/** @type {UserMessage[]} */ msgs) => assessmentScreen(st, pid, hid, msgs);
    return changing(st, () => change(st, pid, hid), origin, origin, async (e) => {
      const m = message ? message(e, st) : null;
      return m ? origin([m]) : null;
    });
  });
}

/** @type {Impl['setReportId']} */
export function setReportId(app, reportId) {
  return assessmentEdit(app, 'setReportId',
    async (st, pid, hid) => (await registry.setPlatformReportId(st.body, actOf(st, pid), { hazardId: /** @type {any} */ (hid), platformId: /** @type {any} */ (pid), reportId })).body);
}

/** @type {Impl['enterRating']} */
export function enterRating(app, stage, values) {
  return assessmentEdit(app, 'enterRating',
    async (st, pid, hid) => (await registry.setRating(st.body, actOf(st, pid), {
      hazardId: /** @type {any} */ (hid), platformId: /** @type {any} */ (pid), stage, consequence: values?.consequence, likelihood: values?.likelihood,
    })).body);
}

/** @type {Impl['confirmControlForPlatform']} */
export function confirmControlForPlatform(app, controlId) {
  return assessmentEdit(app, 'confirmControlForPlatform',
    async (st, pid, hid) => (await registry.confirmControlForPlatform(st.body, actOf(st, pid), { hazardId: /** @type {any} */ (hid), controlId, platformId: /** @type {any} */ (pid) })).body);
}

/** @type {Impl['excludeControlFromPlatform']} */
export function excludeControlFromPlatform(app, controlId, reason) {
  return assessmentEdit(app, 'excludeControlFromPlatform',
    async (st, pid, hid) => (await registry.excludeControlFromPlatform(st.body, actOf(st, pid), { hazardId: /** @type {any} */ (hid), controlId, platformId: /** @type {any} */ (pid), text: reason })).body,
    (e) => (e instanceof registry.InvalidJustificationTextError ? say('warning', 'A control is taken off a platform only with a reason.', [controlId], 'Say why the control is not on this platform.') : null));
}

// ------------------------------------------------------------------ the bow-tie (C-039, C-040)

/** @type {Impl['openBowtie']} */
export function openBowtie(app) {
  return run(app, 'openBowtie', (st) => bowtieScreen(st));
}

/**
 * C-040: generate the drawing again, write it to `target`, and show it.
 * @param {any} st
 * @param {any} target
 */
async function exporting(st, target) {
  /** @type {any} */
  let value;
  /** @type {string} */
  let svg;
  try {
    value = await bowtie.bowtieFor(st.body, st.hazardId, st.platformId);
    svg = await bowtie.renderBowtieSvg(value);
  } catch (e) {
    return refusedBowtie(st, e);
  }
  try {
    await store.writeExportFile(target, svg);
  } catch (e) {
    return bowtieScreen(st, [say('error', 'The export did not happen.', [exportName(target, e)], 'Export again.')], { value, svg });
  }
  return bowtieScreen(st, [], { value, svg });
}

/**
 * The name a failed export is told by: the target's, as `store`'s error carries it (store C-020).
 * @param {any} target
 * @param {any} e
 */
function exportName(target, e) {
  if (e instanceof store.StoreWriteError && e.file) return e.file;
  return target && typeof target.name === 'string' ? target.name : text(e?.file);
}

/** @type {Impl['exportBowtie']} */
export function exportBowtie(app, target) {
  return run(app, 'exportBowtie', (st) => exporting(st, target));
}

/** @type {Impl['chooseExportTarget']} */
export function chooseExportTarget(app) {
  return run(app, 'chooseExportTarget', async (st) => {
    /** @type {any} */
    let target;
    try {
      target = await store.chooseExportFile(`${st.hazardId} bow-tie.svg`);
    } catch (e) {
      const cancelled = e && typeof e === 'object' && /** @type {any} */ (e).name === 'AbortError';
      return {
        ...app.screen,
        messages: [cancelled ? say('info', 'No file was chosen.', [], 'Export when you are ready.') : say('error', 'The browser did not give access to that file.', [e instanceof Error ? e.message : text(e)], 'Choose again.')],
      };
    }
    return exporting(st, target);
  });
}

// ------------------------------------------------------------------ reports (C-041 to C-044)

/** @type {Impl['openReports']} */
export function openReports(app) {
  return run(app, 'openReports', (st) => reportsScreen(st));
}

/** @type {Impl['createTemplate']} */
export function createTemplate(app, fields) {
  return run(app, 'createTemplate', async (st) => changing(
    st,
    async () => (await reports.createTemplate(st.body, actOf(st, null), fields)).body,
    (msgs) => reportsScreen(st, msgs),
    (msgs) => reportsScreen(st, msgs),
  ));
}

/** @type {Impl['beginReport']} */
export function beginReport(app, fields) {
  return run(app, 'beginReport', async (st) => {
    const screen = /** @type {any} */ (app.screen);
    const tid = fields?.templateId;
    const pid = fields?.platformId;
    if (!screen.templates.some((/** @type {any} */ t) => t.id === tid) || !screen.platforms.some((/** @type {any} */ p) => p.id === pid)) {
      return { ...screen, messages: [say('warning', 'That template or platform is not on this screen.', [tid, pid], 'Choose from the lists shown.')] };
    }
    return prepareScreen(st, tid, pid);
  });
}

/** @type {Impl['produceReport']} */
export function produceReport(app, bowtieHazardIds) {
  return run(app, 'produceReport', async (st) => {
    const screen = /** @type {any} */ (app.screen);
    const rows = screen.rows.map((/** @type {any} */ r) => r.hazard.id);
    const ids = Array.isArray(bowtieHazardIds) ? bowtieHazardIds : [];
    const outside = ids.filter((id) => !rows.includes(id));
    const twice = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (!Array.isArray(bowtieHazardIds) || outside.length > 0 || twice.length > 0) {
      return { ...screen, messages: [say('warning', 'A bow-tie can be included only for a hazard of this report, once.', outside.length > 0 ? outside : twice.length > 0 ? twice : [text(bowtieHazardIds)], 'Choose from the hazards shown.')] };
    }
    const tid = st.templateId;
    const pid = st.platformId;
    /** @type {any} */
    let produced;
    try {
      produced = await reports.produceReport(st.body, actOf(st, pid), {
        templateId: tid, platformId: pid, bowtieHazardIds, acknowledgedOutOfDate: screen.outOfDate.map((/** @type {any} */ r) => r.ref),
      });
    } catch (e) {
      // Section 4 rows 844 to 848: the list changed; what the report would hold cannot be read;
      // the history cannot be read; or a bow-tie asked for cannot be drawn. A causal factor or a
      // consequence is read by `bowtie` and by no query of the platform's hazards.
      if (e instanceof reports.OutOfDateNotAcknowledgedError) return prepareScreen(st, tid, pid);
      if (e instanceof changeLog.MalformedEntryError) return { ...screen, messages: [describe(e)] };
      const drawnOnly = e instanceof bowtie.HazardOmittedError || e instanceof bowtie.InvalidBowtieError
        || e instanceof registry.MalformedCausalFactorError || e instanceof registry.MalformedConsequenceError;
      if (!drawnOnly) return reportsScreen(st, [describe(e)]);
      return { ...screen, messages: [say('error', 'The report was not produced: a bow-tie it asks for cannot be drawn.', [/** @type {any} */ (e).hazardId ?? '', ...describe(e).items], 'Leave that bow-tie out, or fix the record first.')] };
    }
    const msgs = await commit(st, produced.body);
    return reportScreen(st, produced.report.id, msgs);
  });
}

/** @type {Impl['openReport']} */
export function openReport(app, id) {
  return run(app, 'openReport', async (st) => {
    const screen = /** @type {any} */ (app.screen);
    if (!screen.reports.some((/** @type {any} */ r) => r.id === id)) return reportsScreen(st, [say('warning', 'That report is not listed.', [id], 'List again and choose again.')]);
    return reportScreen(st, id);
  });
}

/**
 * C-043: draw the report in a form and write it to `target`.
 * @param {App} app
 * @param {any} st
 * @param {any} target
 * @param {string} format
 */
async function downloading(app, st, target, format) {
  const rebuilt = await reportScreen(st, st.reportId);
  if (rebuilt.kind !== 'report') return rebuilt;
  const document = format === 'html' ? await reports.renderReportHtml(rebuilt.report) : await reports.renderReportMarkdown(rebuilt.report);
  try {
    await store.writeExportFile(target, document);
  } catch (e) {
    return { ...rebuilt, messages: [say('error', 'The download did not happen.', [exportName(target, e)], 'Download again.')] };
  }
  return rebuilt;
}

/**
 * @param {App} app
 * @param {unknown} format
 */
function badFormat(app, format) {
  return { ...app.screen, messages: [say('warning', 'A report is downloaded as HTML or Markdown.', [text(format)], 'Choose one of the two.')] };
}

/** @type {Impl['exportReport']} */
export function exportReport(app, target, format) {
  return run(app, 'exportReport', async (st) => {
    if (format !== 'html' && format !== 'markdown') return badFormat(app, format);
    return downloading(app, st, target, format);
  });
}

/** @type {Impl['chooseReportExportTarget']} */
export function chooseReportExportTarget(app, format) {
  return run(app, 'chooseReportExportTarget', async (st) => {
    if (format !== 'html' && format !== 'markdown') return badFormat(app, format);
    /** @type {any} */
    let target;
    try {
      target = await store.chooseExportFile(`${/** @type {any} */ (app.screen).report.title}.${format === 'html' ? 'html' : 'md'}`);
    } catch (e) {
      const cancelled = e && typeof e === 'object' && /** @type {any} */ (e).name === 'AbortError';
      return {
        ...app.screen,
        messages: [cancelled ? say('info', 'No file was chosen.', [], 'Download when you are ready.') : say('error', 'The browser did not give access to that file.', [e instanceof Error ? e.message : text(e)], 'Choose again.')],
      };
    }
    return downloading(app, st, target, format);
  });
}

// ------------------------------------------------------------------ the filter, the dashboard, the open items (C-045 to C-048)

const NO_FILTER = Object.freeze({ platformId: null, band: null, recordStatus: null, controlState: null, referenceEntryId: null });

/** @type {Impl['openFilter']} */
export function openFilter(app) {
  return run(app, 'openFilter', (st) => filterScreen(st, { ...NO_FILTER }));
}

/** @type {Impl['applyFilter']} */
export function applyFilter(app, filter) {
  return run(app, 'applyFilter', async (st) => {
    const screen = /** @type {any} */ (app.screen);
    const f = /** @type {any} */ (filter ?? {});
    /** @type {[string, (v: any) => boolean][]} */
    const checks = [
      ['platformId', (v) => screen.platforms.some((/** @type {any} */ p) => p.id === v)],
      ['band', (v) => BANDS.includes(v)],
      ['recordStatus', (v) => RECORD_STATUSES.includes(v)],
      ['controlState', (v) => CONTROL_STATES.includes(v)],
      ['referenceEntryId', (v) => screen.entries.some((/** @type {any} */ e) => e.id === v)],
    ];
    for (const [field, ok] of checks) {
      if (f[field] !== null && !ok(f[field])) {
        return { ...screen, messages: [say('warning', 'That filter is not one this screen offers.', [field, text(f[field])], 'Choose from the values shown.')] };
      }
    }
    return filterScreen(st, {
      platformId: f.platformId, band: f.band, recordStatus: f.recordStatus, controlState: f.controlState, referenceEntryId: f.referenceEntryId,
    });
  });
}

/** @type {Impl['openDashboard']} */
export function openDashboard(app) {
  return run(app, 'openDashboard', (st) => dashboardScreen(st));
}

/** @type {Impl['openOpenItems']} */
export function openOpenItems(app) {
  return run(app, 'openOpenItems', (st) => openItemsScreen(st));
}

// ------------------------------------------------------------------ history and acknowledgements (C-028, C-029)

/** @type {Impl['openHistory']} */
export function openHistory(app) {
  return run(app, 'openHistory', (st) => historyScreen(st));
}

/** @type {Impl['openAcknowledgements']} */
export function openAcknowledgements(app) {
  return run(app, 'openAcknowledgements', (st) => acknowledgeScreen(st));
}

/** @type {Impl['acknowledgeChange']} */
export function acknowledgeChange(app, entryId, platformId) {
  return run(app, 'acknowledgeChange', async (st) => {
    const screen = /** @type {any} */ (app.screen);
    const queue = screen.queues.find((/** @type {any} */ q) => q.platform.id === platformId);
    if (!queue || !queue.entries.some((/** @type {any} */ e) => e.id === entryId)) {
      return acknowledgeScreen(st, [say('warning', 'That change is not in a queue on this screen.', [entryId, platformId], 'Acknowledge a change from the queues shown.')]);
    }
    return changing(
      st,
      async () => (await changeLog.acknowledge(st.body, st.profile, { entryId, platformId })).body,
      (msgs) => acknowledgeScreen(st, msgs),
      (msgs) => acknowledgeScreen(st, msgs),
      async (e) => {
        if (isMalformed(e)) return null;
        return acknowledgeScreen(st, [say('warning', 'That change could not be acknowledged; the queue may have changed.', [entryId, queue.platform.name], 'Look at the queue as it now is.')]);
      },
    );
  });
}

// ------------------------------------------------------------------ review tempo (C-031, C-032)

/** @type {Impl['setReviewTempo']} */
export function setReviewTempo(app, fields) {
  return run(app, 'setReviewTempo', async (st) => {
    const screen = /** @type {any} */ (app.screen);
    const ref = fields?.ref;
    /** @type {(msgs: UserMessage[]) => Promise<any>} */
    let origin;
    let offered = false;
    if (screen.kind === 'hazard') {
      const hid = st.hazardId;
      origin = (msgs) => hazardScreen(st, hid, msgs);
      offered = ref?.kind === 'hazard' && ref.id === hid;
    } else if (screen.kind === 'controls') {
      origin = (msgs) => controlsScreen(st, msgs);
      offered = ref?.kind === 'control' && screen.controls.some((/** @type {any} */ c) => c.id === ref.id);
    } else {
      origin = (msgs) => platformsScreen(st, msgs);
      offered = ref?.kind === 'platform' && screen.platforms.some((/** @type {any} */ p) => p.id === ref.id);
    }
    if (!offered) {
      return { ...screen, messages: [say('warning', 'A review tempo is not offered for that record here.', [text(ref?.kind), text(ref?.id)], 'Set a tempo from the record\'s own list.')] };
    }
    /** @type {string[]} */
    let ids;
    try {
      ids = await reach(st, ref);
    } catch (e) {
      return origin([describe(e)]);
    }
    return gated(st, ids, { operation: 'setReviewTempo', fields }, () => changing(
      st,
      async () => (await reviewSchedule.setSchedule(st.body, { profile: st.profile, madeForPlatformId: null, affectedPlatformIds: /** @type {any} */ (ids) }, fields)).body,
      origin,
      origin,
    ), origin);
  });
}

// ------------------------------------------------------------------ the reference register (C-033 to C-035)

/** @type {Impl['openReferences']} */
export function openReferences(app) {
  return run(app, 'openReferences', (st) => referencesScreen(st));
}

/** @type {Impl['createReference']} */
export function createReference(app, fields) {
  return run(app, 'createReference', async (st) => changing(
    st,
    async () => (await referenceRegister.createEntry(st.body, { profile: st.profile, madeForPlatformId: null, affectedPlatformIds: [] }, st.dataStore, fields)).body,
    (msgs) => referencesScreen(st, msgs),
    (msgs) => referencesScreen(st, msgs),
    async (e) => {
      // Section 4: a file not kept is any rejection on the way to `files/` — `store`'s
      // StoreWriteError, or a fault stopping `putStoredFile` partway (store C-018).
      const own = isMalformed(e) || [referenceRegister.InvalidFieldError, referenceRegister.EmptyEntryError, referenceRegister.MissingProfileError, referenceRegister.InvalidActError]
        .some((c) => e instanceof c);
      if (!own && fields?.file) {
        return referencesScreen(st, [say('error', 'The file was not kept, and no reference was made.', [fields.file.name], 'Offer the file again.')]);
      }
      return null;
    },
  ));
}

/** @type {Impl['openReference']} */
export function openReference(app, id) {
  return run(app, 'openReference', (st) => referenceScreen(st, id));
}

/** @type {Impl['linkReference']} */
export function linkReference(app, ref) {
  return run(app, 'linkReference', async (st) => {
    const screen = /** @type {any} */ (app.screen);
    const eid = st.entryId;
    const origin = (/** @type {UserMessage[]} */ msgs) => referenceScreen(st, eid, msgs);
    const lists = { hazard: screen.linkableHazards, control: screen.linkableControls, platform: screen.linkablePlatforms };
    const list = ref && typeof ref === 'object' ? /** @type {any} */ (lists)[ref.kind] : undefined;
    if (!list || !list.some((/** @type {any} */ r) => r.id === ref.id)) {
      return { ...screen, messages: [say('warning', 'That record is not offered for a link here.', [text(ref?.kind), text(ref?.id)], 'Link to a record from the lists shown.')] };
    }
    /** @type {string[]} */
    let ids;
    try {
      const union = new Set();
      for (const r of [...screen.entry.links, ref]) {
        if (!REGISTRY_KINDS.includes(r.kind)) continue;
        for (const id of await registry.platformsAffected(st.body, r)) union.add(id);
      }
      ids = /** @type {string[]} */ ([...union]).sort();
    } catch (e) {
      return origin([describe(e)]);
    }
    return gated(st, ids, { operation: 'linkReference', entry: screen.entry, ref }, () => changing(
      st,
      async () => (await referenceRegister.linkEntry(st.body, { profile: st.profile, madeForPlatformId: null, affectedPlatformIds: /** @type {any} */ (ids) }, { entryId: eid, ref })).body,
      origin,
      origin,
    ), origin);
  });
}

// ------------------------------------------------------------------ workflows (C-036 to C-038)

/** @type {Impl['openWorkflows']} */
export function openWorkflows(app) {
  return run(app, 'openWorkflows', (st) => workflowsScreen(st));
}

/** @type {Impl['startWorkflow']} */
export function startWorkflow(app, fields) {
  return run(app, 'startWorkflow', async (st) => {
    const screen = /** @type {any} */ (app.screen);
    const subject = fields?.subject;
    const offered = subject === null || (subject?.kind === 'platform' && screen.platforms.some((/** @type {any} */ p) => p.id === subject.id));
    if (!offered) {
      return { ...screen, messages: [say('warning', 'A workflow is started on a platform of this screen, or on none.', [text(subject?.kind), text(subject?.id)], 'Choose a platform from the list.')] };
    }
    // C-027: the gate's one call is made for a subject; a platform reaches the one platform it
    // names, so it cannot fire, and `startWorkflow` has no pending-edit variant (DEC-027).
    const origin = (/** @type {UserMessage[]} */ msgs) => workflowsScreen(st, msgs);
    try {
      if (subject !== null) await reach(st, subject);
    } catch (e) {
      return origin([describe(e)]);
    }
    /** @type {any} */
    let started;
    try {
      started = await workflows.startWorkflow(st.body, actOf(st, subject === null ? null : subject.id), fields);
    } catch (e) {
      return origin([describe(e)]);
    }
    const msgs = await commit(st, started.body);
    return workflowScreen(st, started.workflow.id, msgs);
  });
}

/** @type {Impl['openWorkflow']} */
export function openWorkflow(app, id) {
  return run(app, 'openWorkflow', (st) => workflowScreen(st, id));
}

/**
 * One of the four acts of a running workflow (C-038), gated on its subject (C-027).
 * @param {App} app
 * @param {string} operation
 * @param {(record: any) => any} editing
 * @param {(st: any, act: any, id: string) => Promise<any>} call
 */
function workflowAct(app, operation, editing, call) {
  return run(app, operation, async (st) => {
    const screen = /** @type {any} */ (app.screen);
    const record = screen.progress.record;
    const wid = record.id;
    const subject = record.subject;
    const origin = (/** @type {UserMessage[]} */ msgs) => workflowScreen(st, wid, msgs);
    /** @type {string[]} */
    let ids = [];
    try {
      if (subject) ids = await reach(st, subject);
    } catch (e) {
      return origin([describe(e)]);
    }
    const act = actOf(st, subject?.kind === 'platform' ? subject.id : null);
    const perform = async () => {
      /** @type {any} */
      let changed;
      try {
        changed = await call(st, act, wid);
      } catch (e) {
        if (e instanceof workflows.UnknownWorkflowError || e instanceof workflows.WorkflowNotLiveError) return workflowsScreen(st, [describe(e)]);
        if (e instanceof workflows.MalformedWorkflowError) return workflowsScreen(st, [describe(e)]);
        if (operation === 'completeWorkflow' && !isWorkflowsRefusal(e)) {
          return origin([say('error', 'The workflow was not completed: one of its acts could not be made, so none was.', describe(e).items, 'Clear the cause and complete the workflow again.')]);
        }
        return origin([describe(e)]);
      }
      const msgs = await commit(st, changed.body);
      return operation === 'abandonWorkflow' ? workflowsScreen(st, msgs) : workflowScreen(st, wid, msgs);
    };
    return gated(st, ids, editing(record), perform, origin);
  });
}

/**
 * Whether an error is one of `workflows`' own refusals rather than an act it passed on.
 * @param {any} e
 */
function isWorkflowsRefusal(e) {
  return [
    workflows.WorkflowCompleteError, workflows.NotAtOutcomeError, workflows.InvalidOutcomeError, workflows.StepIncompleteError,
    workflows.MissingProfileError, workflows.InvalidActError,
  ].some((c) => e instanceof c);
}

/** @type {Impl['submitStep']} */
export function submitStep(app, submission) {
  return workflowAct(app, 'submitStep', (workflow) => ({ operation: 'submitStep', workflow, submission }),
    async (st, act, id) => workflows.submitStep(st.body, act, /** @type {any} */ (id), submission));
}

/** @type {Impl['advanceStep']} */
export function advanceStep(app) {
  return workflowAct(app, 'advanceStep', (workflow) => ({ operation: 'advanceStep', workflow }),
    async (st, act, id) => workflows.advanceStep(st.body, act, /** @type {any} */ (id)));
}

/** @type {Impl['completeWorkflow']} */
export function completeWorkflow(app, fields) {
  return workflowAct(app, 'completeWorkflow', (workflow) => ({ operation: 'completeWorkflow', workflow, fields }),
    async (st, act, id) => workflows.completeWorkflow(st.body, act, /** @type {any} */ (id), fields));
}

/** @type {Impl['abandonWorkflow']} */
export function abandonWorkflow(app) {
  return workflowAct(app, 'abandonWorkflow', (workflow) => ({ operation: 'abandonWorkflow', workflow }),
    async (st, act, id) => workflows.abandonWorkflow(st.body, act, /** @type {any} */ (id)));
}

// ------------------------------------------------------------------ the gate and the way back (C-015, C-027)

/** @type {Impl['confirmEdit']} */
export function confirmEdit(app) {
  return run(app, 'confirmEdit', async (st) => {
    const pending = st.pending;
    st.pending = null;
    return pending.perform();
  });
}

/** @type {Impl['cancelEdit']} */
export function cancelEdit(app) {
  return run(app, 'cancelEdit', async (st) => {
    const pending = st.pending;
    st.pending = null;
    return pending.origin([]);
  });
}

/** @type {Impl['back']} */
export function back(app) {
  return run(app, 'back', async (st) => {
    switch (app.screen.kind) {
      case 'platform': return platformsScreen(st);
      case 'assessment': return platformScreen(st, st.platformId);
      case 'bowtie': return assessmentScreen(st, st.platformId, st.hazardId);
      case 'reference': return referencesScreen(st);
      case 'workflow': return workflowsScreen(st);
      case 'prepare-report':
      case 'report': return reportsScreen(st);
      default:
        st.hazardId = null;
        st.platformId = null;
        return hazardsScreen(st);
    }
  });
}
