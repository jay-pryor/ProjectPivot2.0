import { createReport, deleteReport } from '../core/ops/reports.js';
import { reportFileBase } from '../reports/docgen-host.js';
import { when } from './names.js';
import * as store from '../storage/store.js';
import { writeMirror, readMirror, clearMirror, hasUnsaved, hasUnsavedRecords, restoreReportDocuments } from '../storage/mirror.js';
import { PivotError } from '../core/errors.js';
import { newId } from '../core/ids.js';
import { deleteName, bundlePage } from './screens/common.js';
import { emptyData, NUMBERED, need, normalizeData } from '../core/data.js';
import { epochOf, aestDate, systemClock } from '../core/time.js';
import { entries, unseenOverrides, markNoticesSeen, addComment, createBundle, unbundle, renameBundle, deleteHistory, restoreHistory } from '../core/history.js';
import * as hazards from '../core/ops/hazards.js';
import * as controls from '../core/ops/controls.js';
import * as platforms from '../core/ops/platforms.js';
import * as assessment from '../core/ops/assessment.js';
import * as reviews from '../core/ops/reviews.js';
import * as acks from '../core/acks.js';
import * as references from '../core/ops/references.js';
import * as phases from '../core/ops/phases.js';
import * as platformGroups from '../core/ops/platform-groups.js';
import * as facets from '../core/ops/facets.js';
import * as safetyReports from '../core/ops/safety-reports.js';
import * as bowtieViews from '../core/ops/bowtie-views.js';
import { bowtieOf, canSee, normalizeFilters, DEFAULT_FILTERS, hazardName } from '../core/bowtie.js';
import { bowtieSvg } from './bowtie-svg.js';
import { emptyWorkspace, placePane, movePane, swapPanes, closePane, updatePane, replacedBy, paneDirty, workspaceKey, readWorkspace, writeWorkspace, paneView } from './workspace.js';
import { setReportDesign } from '../core/ops/reports.js';
import { createDocHost } from '../reports/docgen-host.js';
import { App as DocGen } from '../../DocGen/doc-designer.js';
import { recordName, profileName, KIND_LABEL } from './names.js';
import { THEMES, MIN_COLUMN_WIDTH, activeProfile, favouritesOf, samePage, FAVOURITE_LAYOUTS, COMING_UP_WINDOWS } from './prefs.js';
import { mergeData } from '../core/merge.js';
import { unlistedEntries, listPlatformGroups } from '../core/queries.js';

/** Every edit is an op called with the working data, the act, and the action's own fields. */
const EDITS = {
  createHazard: hazards.createHazard, updateHazard: hazards.updateHazard, retireHazard: hazards.retireHazard,
  deleteHazard: hazards.deleteHazard, restoreRecord: hazards.restoreRecord,
  addCausalFactor: hazards.addCausalFactor, updateCausalFactor: hazards.updateCausalFactor, deleteCausalFactor: hazards.deleteCausalFactor,
  addConsequence: hazards.addConsequence, updateConsequence: hazards.updateConsequence, deleteConsequence: hazards.deleteConsequence,
  addFailureMode: hazards.addFailureMode, updateFailureMode: hazards.updateFailureMode, deleteFailureMode: hazards.deleteFailureMode,
  addSystemElement: hazards.addSystemElement, updateSystemElement: hazards.updateSystemElement, deleteSystemElement: hazards.deleteSystemElement,
  addAffectedGroup: hazards.addAffectedGroup, updateAffectedGroup: hazards.updateAffectedGroup, deleteAffectedGroup: hazards.deleteAffectedGroup,
  createControl: controls.createControl, updateControl: controls.updateControl, retireControl: controls.retireControl,
  deleteControl: controls.deleteControl, linkControl: controls.linkControl, setControlKind: controls.setControlKind,
  unlinkControl: controls.unlinkControl, setControlAnalysis: controls.setControlAnalysis, setImplementedBy: controls.setImplementedBy,
  addControlHere: controls.addControlHere, removeControlHere: controls.removeControlHere, createControlOn: controls.createControlOn,
  setControlKindOnPlatform: controls.setControlKindOnPlatform, setControlTargets: controls.setControlTargets,
  createPlatform: platforms.createPlatform, updatePlatform: platforms.updatePlatform, setOwner: platforms.setOwner,
  retirePlatform: platforms.retirePlatform, deletePlatform: platforms.deletePlatform, linkHazard: platforms.linkHazard,
  unlinkHazard: platforms.unlinkHazard, setReportId: platforms.setReportId, setPlatformImage: platforms.setPlatformImage,
  setControlStatus: assessment.setControlStatus, setRating: assessment.setRating,
  setAssessment: assessment.setAssessment, copyStageRisk: assessment.copyStageRisk, setSfarp: assessment.setSfarp,
  setImplementationStatus: assessment.setImplementationStatus, copyControls: assessment.copyControls, copySfarp: assessment.copySfarp,
  setRule: reviews.setRule, acknowledgeReviewDate: reviews.acknowledgeReviewDate, startReview: reviews.startReview, markRow: reviews.markRow,
  createReviewPolicy: reviews.createReviewPolicy, updateReviewPolicy: reviews.updateReviewPolicy, renameReviewPolicy: reviews.renameReviewPolicy, deleteReviewPolicy: reviews.deleteReviewPolicy,
  setReviewOutcome: reviews.setReviewOutcome, setReviewNotes: reviews.setReviewNotes, completeReview: reviews.completeReview, abandonReview: reviews.abandonReview,
  acknowledge: acks.acknowledge, acknowledgeAll: acks.acknowledgeAll,
  createReference: references.createReference, updateReference: references.updateReference, attachFile: references.attachFile,
  retireReference: references.retireReference, setReferenceArchived: references.setReferenceArchived, deleteReference: references.deleteReference,
  createPhase: phases.createPhase, renamePhase: phases.renamePhase, retirePhase: phases.retirePhase, deletePhase: phases.deletePhase,
  linkPhase: phases.linkPhase, unlinkPhase: phases.unlinkPhase,
  createPlatformGroup: platformGroups.createPlatformGroup, renamePlatformGroup: platformGroups.renamePlatformGroup, deletePlatformGroup: platformGroups.deletePlatformGroup,
  tagPlatform: platformGroups.tagPlatform, untagPlatform: platformGroups.untagPlatform,
  createFacetOption: facets.createFacetOption, renameFacetOption: facets.renameFacetOption, deleteFacetOption: facets.deleteFacetOption,
  setOptionGroup: facets.setOptionGroup, restoreDeletion: facets.restoreDeletion, assignOptionsToGroup: facets.assignToGroup,
  createSafetyReport: safetyReports.createSafetyReport, updateSafetyReport: safetyReports.updateSafetyReport, deleteSafetyReport: safetyReports.deleteSafetyReport, moveSafetyReport: safetyReports.moveSafetyReport,
  linkReference: references.linkReference, unlinkReference: references.unlinkReference, unlinkReferenceFrom: references.unlinkReferenceFrom,
  createBowtieView: bowtieViews.createBowtieView, updateBowtieView: bowtieViews.updateBowtieView,
  setBowtieSharing: bowtieViews.setBowtieSharing, deleteBowtieView: bowtieViews.deleteBowtieView,
  addComment, createBundle, unbundle, renameBundle, deleteHistory, restoreHistory, deleteReport,
};

/** After creating one of these, show it. */
const SHOW_CREATED = { createHazard: 'hazard', createControl: 'control', createPlatform: 'platform', createReference: 'reference' };

/** The section a page's rail opens until another is chosen; it matches the page's own fallback. */
const DEFAULT_SECTION = { info: 'groups', ssra: 'initial', hazard: 'controls', openItems: 'acks', control: 'usage', platform: 'hazards' };

/** How many pages Back can step through. */
const HISTORY_LIMIT = 50;

/** @param {any} a @param {any} b */
const sameView = (a, b) => ['name', 'id', 'tab', 'reviewId', 'hazardId', 'platformId'].every((k) => (a?.[k] ?? null) === (b?.[k] ?? null));

const BACKUP_CHECK_MS = 60_000;

/** Actions that only change what is on screen or a preference: they never mark the app busy. */
const QUIET = new Set(['setColumnWidth', 'resetColumnWidth', 'setTheme', 'newControl', 'setControlDraft', 'toggleFavourite', 'moveFavourite', 'setFavouriteLayout', 'setComingUpDays', 'toggleFavouriteEdit', 'sortTable', 'filterTable', 'startEdit', 'cancelEdit', 'go', 'dismissMessage', 'openPicker', 'closePicker', 'chooseReportPlatform', 'setHomeOwner', 'askDelete', 'cancelDelete', 'recallFolder',
  'openBowtie', 'newBowtie', 'openBowtieView', 'dropBowtie', 'swapBowtiePanes', 'closeBowtiePane', 'setPaneStatus', 'confirmBowtieReplace', 'cancelBowtieReplace', 'toggleBowtieDetails', 'toggleBundling', 'toggleBundleOpen', 'showSection', 'goBack', 'viewBowtie', 'toggleBowtieTags', 'toggleBowtieGaps', 'setBowtieLayout', 'dismissUndo', 'dismissWarning', 'askConfirm', 'confirmCancel', 'confirmContinue',
  'startAssignToGroup', 'chooseAssignGroup', 'cancelAssignToGroup', 'toggleInfoGroup', 'showInfoGroups', 'toggleInfoByGroup',
]);

export function initialState() {
  return {
    screen: 'open', folderName: '', check: { failed: [] }, profiles: [], profileId: null, dataBlocked: false,
    session: null, recoverable: null, notices: [], view: { name: 'hazards' },
    filters: { hazards: {}, controls: {} }, backups: [], pendingRestore: null,
    message: null, warnings: [], busy: false, designerRevision: 0, lastReportId: null,
    tables: {}, editing: null, saving: false, picker: null, confirmDelete: null, undo: null, lastFolder: null,
    today: aestDate(systemClock.now()), reportPlatformId: null, homeOwner: 'me', missingFiles: [],
    workspace: emptyWorkspace(), bowtieReplace: null, bowtieDetails: [], bundling: null, openBundles: [], favouritesEditing: false, draftControl: null, sections: {}, viewHistory: [], confirm: null,
    infoTools: { assigning: null, hidden: [], byGroup: false, groupId: null },
  };
}

/**
 * @param {{ clock: import('../core/time.js').Clock, storage: Storage,
 *   pickFolder: () => Promise<FileSystemDirectoryHandle>,
 *   pickSaveFile: (name: string) => Promise<FileSystemFileHandle>,
 *   pickOpenFile: () => Promise<string>, minSaveMs?: number,
 *   prepareImage?: (file: File) => Promise<{ blob: Blob, name: string, type: string }>,
 *   openFile?: (file: File, name: string) => void, copyText?: (text: string) => Promise<void>,
 *   rememberFolder?: (handle: FileSystemDirectoryHandle) => Promise<void>, recallFolder?: () => Promise<any> }} env  minSaveMs: shortest time a save shows as saving (default 900)
 */
export function createController(env) {
  let state = initialState();
  /** @type {FileSystemDirectoryHandle | null} */
  let handle = null;
  /** The folder chosen last time, kept by the browser, until it is reconnected to. @type {any} */
  let remembered = null;
  let lastBackupCheck = -Infinity;
  let running = 0;
  /** When this session opened the data: the acknowledgement start, if the data has none yet. */
  let openedAt = /** @type {string | null} */ (null);
  /** @type {Set<(s: any) => void>} */
  const listeners = new Set();

  /** @param {Record<string, any>} patch */
  // Back returns to the page before, as a browser does: every move to another page (or tab) while
  // working is remembered, except the move Back itself makes.
  let goingBack = false;
  function set(patch) {
    if (patch.view && !goingBack && state.screen === 'main' && !sameView(patch.view, state.view)) {
      patch = { ...patch, viewHistory: [...(state.viewHistory ?? []), state.view].slice(-HISTORY_LIMIT) };
    }
    state = { ...state, ...patch, today: aestDate(env.clock.now()) };
    for (const f of listeners) f(state);
  }
  const act = () => ({ by: /** @type {string} */ (state.profileId), at: env.clock.now() });
  const nameOf = (/** @type {string | null} */ id) => profileName(state, id);

  const docs = createDocHost({
    getData: () => state.session?.working ?? emptyData(),
    setDesign: (design) => {
      if (!state.session) return;
      const working = setReportDesign(state.session.working, design);
      if (working !== state.session.working) {
        set({ session: { ...state.session, working } });
        void afterChange();
      }
    },
    clock: env.clock,
    profileName: nameOf,
  });

  /** Mirror the working state, and take a backup if one is due. Never throws. */
  async function afterChange() {
    const warnings = [];
    const mirrorWarning = writeMirror(env.storage, { folderName: state.folderName, ...state.session });
    if (mirrorWarning) warnings.push(mirrorWarning);
    const nowMs = epochOf(env.clock.now());
    if (handle && nowMs - lastBackupCheck >= BACKUP_CHECK_MS) {
      lastBackupCheck = nowMs;
      try {
        await store.backupIfDue(handle, state.session.working, env.clock);
      } catch (e) {
        warnings.push(`A backup could not be written (${e instanceof Error ? e.message : String(e)}).`);
      }
    }
    set({ warnings });
  }

  function finishOpening() {
    openedAt = env.clock.now();
    DocGen.docHost.set(docs.host);
    const notices = unseenOverrides(state.session.working, /** @type {string} */ (state.profileId));
    const workspace = readWorkspace(env.storage, workspaceKey(state.folderName, /** @type {string} */ (state.profileId)));
    set({ notices, screen: notices.length ? 'notices' : 'main', view: { name: 'home' }, workspace, bowtieReplace: null });
  }


  /** The actions made since the last save, for the restore warning. */
  function unsavedActions() {
    if (!state.session) return [];
    return entries(state.session.working).filter((e) => e.type === 'change' && !state.session.base.history[e.id]).map((e) => e.action);
  }

  /** @param {import('../storage/store.js').SaveResult} r */
  function saveMessage(r) {
    // A plain save says so on the Save button itself; only a merge has something to tell.
    if (!r.merged) return null;
    const who = nameOf(r.lastSavedBy);
    const kept = r.supersededFile ? [`Their previous file is kept as ${r.supersededFile}.`] : [];
    if (r.missingFromDisk > 0) {
      const n = r.missingFromDisk;
      kept.unshift(`${n} ${n === 1 ? 'record was' : 'records were'} missing from data.json on disk (the file had been replaced) and ${n === 1 ? 'is' : 'are'} kept.`);
    }
    // A review the other user completed is kept over this user's own changes to it.
    const ownLost = r.conflicts.filter((c) => c.reason === 'review-completed' && c.overriddenBy === state.profileId);
    if (ownLost.length) {
      const reviews = new Set(ownLost.map((c) => (c.kind === 'review' ? c.id : (c.theirs ?? c.mine)?.reviewId)));
      kept.unshift(`${reviews.size === 1 ? 'A review you changed was' : `${reviews.size} reviews you changed were`} already completed by ${who}, so the completed ${reviews.size === 1 ? 'review is' : 'reviews are'} kept and your changes to ${reviews.size === 1 ? 'it' : 'them'} are not.`);
      r = { ...r, conflicts: r.conflicts.filter((c) => !ownLost.includes(c)) };
      if (r.conflicts.length === 0) return { kind: 'warning', text: `Saved. ${who} had saved since you opened Pivot; their changes are merged in.`, items: kept };
    }
    if (r.conflicts.length === 0 && r.missingFromDisk > 0) {
      return { kind: 'warning', text: `Saved. ${who} had saved a different data.json since you opened Pivot; both are merged.`, items: kept };
    }
    if (r.conflicts.length === 0) {
      return { kind: 'info', text: `Saved. ${who} had saved since you opened Pivot; their changes are merged in.`, items: kept };
    }
    return {
      kind: 'warning',
      text: `Saved, but ${r.conflicts.length} of ${who}'s changes ${r.conflicts.length === 1 ? 'was' : 'were'} replaced by yours.`,
      items: [...r.conflicts.map((c) => `${KIND_LABEL[c.kind] ?? c.kind}: ${recordName(c.kind, c.theirs ?? c.mine, state.session?.working)}`), ...kept],
    };
  }

  /** Merge settings into the active profile, kept in profiles.json. @param {Record<string, any>} patch */
  async function savePrefs(patch) {
    if (!state.profileId || !handle) throw new PivotError('no-profile', 'Pick your profile first.');
    // Shown at once, before the file is written, so nothing redraws with the old setting.
    const id = state.profileId;
    set({ profiles: state.profiles.map((p) => (p.id === id ? { ...p, prefs: { ...(p.prefs ?? {}), ...patch } } : p)) });
    const updated = await store.updateProfilePrefs(handle, id, patch, env.clock);
    set({ profiles: state.profiles.map((p) => (p.id === updated.id ? updated : p)) });
  }

  /** A chosen file from a form, or null when none was chosen (an empty file input sends a nameless, empty file). @param {unknown} v */
  const chosenFile = (v) => (v && typeof v === 'object' && typeof (/** @type {any} */ (v).arrayBuffer) === 'function' && /** @type {any} */ (v).name && /** @type {any} */ (v).size > 0
    ? /** @type {File} */ (v) : null);

  /** Copy a chosen file into the folder and describe it for its reference. @param {string} referenceId @param {number} n @param {File} file */
  async function storeFile(referenceId, n, file) {
    if (!handle) throw new PivotError('no-data', 'Open the data folder first.');
    const stored = await store.storeReferenceFile(handle, referenceId, n, file);
    return { name: file.name, stored, size: file.size, type: file.type || '', addedBy: /** @type {string} */ (state.profileId), addedAt: env.clock.now() };
  }

  /** Show and remember the bow-tie windows. @param {import('./workspace.js').Workspace} ws */
  function setWorkspace(ws) {
    set({ workspace: ws });
    writeWorkspace(env.storage, workspaceKey(state.folderName, /** @type {string} */ (state.profileId)), ws);
  }

  /** A side from a data attribute: '0' or '1', or the last-used window when absent. @param {unknown} s @returns {0 | 1 | 'last'} */
  const sideOf = (s) => (s === '0' || s === 0 ? 0 : s === '1' || s === 1 ? 1 : 'last');

  /** @param {unknown} s @returns {0 | 1} */
  const paneIndex = (s) => (s === '1' || s === 1 ? 1 : 0);

  /** The window at a side, or an error when there is none. @param {unknown} s */
  function paneAt(s) {
    const p = state.workspace.panes[paneIndex(s)];
    if (!p) throw new PivotError('not-found', 'That window is closed.');
    return p;
  }

  /** Turn one of a window's switches (each off when present) on or off. @param {unknown} side @param {'hideTags' | 'hideGaps'} flag */
  function togglePane(side, flag) {
    const p = paneAt(side);
    const i = paneIndex(side);
    const { [flag]: on, ...rest } = p;
    const panes = /** @type {[import('./workspace.js').Pane | null, import('./workspace.js').Pane | null]} */ ([...state.workspace.panes]);
    panes[i] = on ? rest : { ...rest, [flag]: true };
    setWorkspace({ panes, lastUsed: i });
  }

  /**
   * Put a window on the Bow-ties stage; if it would replace a window with unsaved choices, ask first.
   * @param {0 | 1 | 'last'} side @param {import('./workspace.js').Pane} pane
   */
  function place(side, pane) {
    const index = replacedBy(state.workspace, side);
    const existing = index === null ? null : state.workspace.panes[index];
    if (existing && state.session && paneDirty(existing, state.session.working)) {
      set({ bowtieReplace: { side, pane, index }, view: { name: 'bowties' } });
      return;
    }
    setWorkspace(placePane(state.workspace, side, pane));
    set({ view: { name: 'bowties' }, bowtieReplace: null, message: null });
  }

  /** A window for a view the active profile may open. @param {string} id */
  function paneForView(id) {
    const v = state.session?.working.records.bowtieView?.[id];
    if (!v || !canSee(v, state.profileId)) throw new PivotError('not-found', 'That view no longer exists or is not shared with you.');
    return { viewId: v.id, hazardId: v.hazardId, platformId: v.platformId, filters: normalizeFilters(v.filters) };
  }

  /** @type {Record<string, (args: any) => Promise<void>>} */
  const handlers = {
    async recallFolder() {
      // The folder chosen last time, if the browser kept it; opening it again needs a click.
      try {
        remembered = (await env.recallFolder?.()) ?? null;
      } catch {
        remembered = null;
      }
      set({ lastFolder: remembered ? remembered.name || 'the last folder' : null });
    },
    async reconnectFolder() {
      const h = remembered;
      if (!h) throw new PivotError('not-found', 'There is no folder to reconnect to. Choose one.');
      // Asked straight away, while the click still counts as the person's own action.
      const answer = h.requestPermission ? await h.requestPermission({ mode: 'readwrite' }) : 'granted';
      if (answer !== 'granted') {
        set({ message: { kind: 'error', text: `Pivot was not given access to ${h.name}. Reconnect and allow it, or choose the folder again.` } });
        return;
      }
      await openFolder(h);
    },
    async changeFolder() {
      // Switching mid-session would lose unsaved work with the folder it belongs to.
      if (state.session && hasUnsaved(state.session)) {
        set({ message: { kind: 'warning', text: 'Save your changes before choosing a different folder.' } });
        return;
      }
      await handlers.chooseFolder();
    },
    async chooseFolder() {
      const h = await env.pickFolder();
      try { await env.rememberFolder?.(h); } catch { /* remembering is a convenience; opening goes on without it */ }
      remembered = h;
      await openFolder(h);
    },
    async continueFromCheck() {
      if (state.check.failed.some((x) => x.file === store.FILES.profiles)) return;
      set({ screen: 'profile' });
    },
    async createProfile({ name }) {
      const p = await store.createProfile(/** @type {any} */ (handle), name, env.clock);
      set({ profiles: await store.readProfiles(/** @type {any} */ (handle)), message: { kind: 'info', text: `Profile ${p.name} created. Select it to continue.` } });
    },
    async selectProfile({ id }) {
      if (!state.profiles.some((p) => p.id === id)) throw new PivotError('not-found', 'That profile no longer exists.');
      set({ profileId: id, message: null });
      if (state.dataBlocked) {
        DocGen.docHost.set(docs.host);
        set({ screen: 'main', view: { name: 'backups' }, backups: await store.listBackups(/** @type {any} */ (handle)) });
        return;
      }
      const { data, stamp } = await store.load(/** @type {any} */ (handle));
      set({ session: { base: data, working: data, loadedStamp: stamp } });
      const m = readMirror(env.storage, state.folderName);
      if (m && hasUnsaved(m)) {
        set({ recoverable: m, screen: 'recover' });
        return;
      }
      finishOpening();
    },
    async recover() {
      if (!state.recoverable) return;
      const m = restoreReportDocuments(state.recoverable, state.session.base);
      // Kept by an earlier version, it is brought up to date as data opened from the folder is.
      set({ session: { base: normalizeData(m.base), working: normalizeData(m.working), loadedStamp: m.loadedStamp }, recoverable: null });
      await afterChange();
      finishOpening();
    },
    async discardRecovery() {
      clearMirror(env.storage);
      set({ recoverable: null });
      finishOpening();
    },
    async dismissNotices() {
      const working = markNoticesSeen(state.session.working, act(), state.notices.map((n) => n.id));
      set({ session: { ...state.session, working }, notices: [], screen: 'main' });
      await afterChange();
    },
    async askDelete({ kind, id }) {
      if (kind !== 'hazard' && kind !== 'platform') throw new PivotError('not-found', 'Only a hazard or a platform is deleted this way.');
      set({ confirmDelete: { kind, id } });
    },
    async cancelDelete() {
      set({ confirmDelete: null });
    },
    async confirmDelete({ kind, id }) {
      const before = state.session?.working;
      const rec = before?.records[kind]?.[id];
      if (!before || !rec || (kind !== 'hazard' && kind !== 'platform')) throw new PivotError('not-found', 'That record no longer exists.');
      await applyEdit(kind === 'hazard' ? 'deleteHazard' : 'deletePlatform', { id });
      const name = deleteName(kind, rec);
      set({ confirmDelete: null, undo: { text: `Deleted ${name}.`, before, after: state.session?.working, base: state.session?.base }, view: { name: kind === 'hazard' ? 'hazards' : 'platforms' } });
    },
    async undoDelete() {
      const u = state.undo;
      if (!u || !state.session || state.saving || state.session.working !== u.after || state.session.base !== u.base) { set({ undo: null }); return; }
      set({ session: { ...state.session, working: u.before }, undo: null, message: { kind: 'info', text: u.text.replace(/^Deleted/, 'Restored') } });
      await afterChange();
    },
    async dismissMessage() {
      set({ message: null });
    },
    // Closing the Undo offer: what was deleted stays deleted.
    async dismissUndo() {
      set({ undo: null });
    },
    async dismissWarning({ index }) {
      set({ warnings: (state.warnings ?? []).filter((/** @type {string} */ _w, /** @type {number} */ i) => i !== Number(index)) });
    },
    async go({ view, id, hazardId, platformId, tab, reviewId }) {
      // Leaving a control being made, untitled, makes nothing.
      set({ view: { name: view, id, hazardId, platformId, tab, reviewId }, message: null, editing: null, confirmDelete: null, favouritesEditing: false, infoTools: { ...state.infoTools, assigning: null }, ...(view === 'newControl' ? {} : { draftControl: null }) });
      if (view === 'backups' && handle) set({ backups: await store.listBackups(handle) });
      if (view === 'references') await handlers.checkReferenceFiles();
      if (view === 'reference') await handlers.checkReferenceFiles({ id });
    },
    async save() {
      if (!state.session) throw new PivotError('no-data', 'There is nothing to save yet.');
      const startWorking = state.session.working;
      // A save ends the Undo offer: undoing after it would unwrite a delete already on disk.
      set({ saving: true, undo: null });
      /** @type {import('../storage/store.js').SaveResult} */
      let r;
      try {
        // Never quicker than the minimum, so the progress bar is seen and the click feels taken.
        [r] = await Promise.all([
          store.save(/** @type {any} */ (handle), state.session, /** @type {string} */ (state.profileId), env.clock),
          new Promise((done) => setTimeout(done, env.minSaveMs ?? 900)),
        ]);
      } finally {
        set({ saving: false });
      }
      // Edits made while the save was running are laid back over what was saved.
      const during = state.session.working !== startWorking;
      let working = during ? mergeData(startWorking, state.session.working, r.data, act()).data : r.data;
      if (during) {
        // The numbers the save gave stay with their records, whatever was edited meanwhile.
        const records = { ...working.records };
        for (const { kind, counter } of NUMBERED) {
          const recs = { ...records[kind] };
          for (const rec of Object.values(recs)) {
            const savedNumber = r.data.records[kind][rec.id]?.number;
            if (rec.number == null && savedNumber != null) recs[rec.id] = { ...rec, number: savedNumber };
          }
          records[kind] = recs;
          working = { ...working, [counter]: /** @type {any} */ (r.data)[counter] };
        }
        // So do the platform letters and safety report IDs it gave.
        for (const [kind, field] of [['hazardPlatform', 'letter'], ['safetyReport', 'reportNos']]) {
          const recs = { ...records[kind] };
          for (const rec of Object.values(recs)) {
            const saved = r.data.records[kind]?.[rec.id]?.[field];
            if (saved !== undefined && JSON.stringify(saved) !== JSON.stringify(rec[field]) && (rec[field] == null || (Array.isArray(saved) && saved.length > (rec[field]?.length ?? 0)))) recs[rec.id] = { ...rec, [field]: saved };
          }
          records[kind] = recs;
        }
        working = { ...working, records };
      }
      set({ session: { base: r.data, working, loadedStamp: r.stamp } });
      if (during) await afterChange(); else clearMirror(env.storage);
      // Someone who saved in between may have created their profile since this copy read the list.
      const warnings = during ? [...state.warnings] : [];
      if (r.merged) {
        try {
          set({ profiles: await store.readProfiles(/** @type {any} */ (handle)) });
        } catch (e) {
          warnings.push(`Saved, but profiles.json could not be read just now (${e instanceof Error ? e.message : String(e)}), so some names may show as "someone".`);
        }
      }
      set({ message: saveMessage(r), warnings });
    },
    async setTheme({ theme }) {
      if (!THEMES.includes(theme)) throw new PivotError('prefs.theme', `There is no ${theme} theme.`);
      await savePrefs({ theme });
    },
    // Star a page, or take its star away: kept on the profile, so each person has their own.
    async toggleFavourite({ page, id, tab }) {
      if (!page) return;
      const key = { name: String(page), id: id ? String(id) : null, tab: tab && tab !== 'details' ? String(tab) : null };
      const list = favouritesOf(state);
      const starred = list.some((f) => samePage(f, key));
      await savePrefs({ favourites: starred ? list.filter((f) => !samePage(f, key)) : [...list, key] });
    },
    // Favourite pages in a new order: the one at `from` moved to where `to` is.
    async moveFavourite({ from, to }) {
      const list = favouritesOf(state);
      const i = Number(from);
      const j = Number(to);
      if (!Number.isInteger(i) || !Number.isInteger(j) || i === j || !list[i] || j < 0 || j >= list.length) return;
      const next = [...list];
      const [moved] = next.splice(i, 1);
      next.splice(j, 0, moved);
      await savePrefs({ favourites: next });
    },
    async setComingUpDays({ days }) {
      const n = Number(days);
      if (!COMING_UP_WINDOWS.some(([d]) => d === n)) return;
      await savePrefs({ comingUpDays: n });
    },
    async setFavouriteLayout({ layout }) {
      if (!FAVOURITE_LAYOUTS.includes(layout)) return;
      await savePrefs({ favouriteLayout: layout });
    },
    // Edit turns on dragging to reorder; it is only on screen, so it ends on leaving Home.
    async toggleFavouriteEdit() {
      set({ favouritesEditing: !state.favouritesEditing });
    },
    async setColumnWidth({ table, column, width }) {
      const px = Math.max(MIN_COLUMN_WIDTH, Math.round(Number(width)));
      if (!Number.isFinite(px)) return;
      const widths = { ...(activeProfile(state)?.prefs?.columnWidths ?? {}), [`${table}.${column}`]: px };
      await savePrefs({ columnWidths: widths });
    },
    async resetColumnWidth({ table, column }) {
      const widths = { ...(activeProfile(state)?.prefs?.columnWidths ?? {}) };
      delete widths[`${table}.${column}`];
      await savePrefs({ columnWidths: widths });
    },
    async sortTable({ table, key }) {
      // Ascending, then descending, then off.
      const t = state.tables[table] ?? {};
      const same = t.sort?.key === key;
      const sort = !same ? { key, dir: 'asc' } : t.sort.dir === 'asc' ? { key, dir: 'desc' } : null;
      set({ tables: { ...state.tables, [table]: { ...t, sort } } });
    },
    async filterTable({ table, key, value }) {
      const t = state.tables[table] ?? {};
      const filters = { ...(t.filters ?? {}) };
      if (value) filters[key] = value; else delete filters[key];
      set({ tables: { ...state.tables, [table]: { ...t, filters } } });
    },
    async openPicker({ picker, hazardId, platformId, referenceId, targetKind, targetId, stage, receptor, field, controlId, part, existing }) {
      const extra = { hazardId, platformId, referenceId, targetKind, targetId, stage, receptor, field, controlId, part, existing };
      set({ picker: { picker, ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v)) } });
    },
    async addReference({ title, url, path, file }) {
      const id = newId();
      const f = chosenFile(file);
      const stored = f ? await storeFile(id, 1, f) : null;
      await applyEdit('createReference', { id, title, url, path, file: stored });
      await handlers.checkReferenceFiles({ id });
    },
    async uploadReferenceFile({ id, file }) {
      const r = state.session?.working.records.reference[id];
      if (!r) throw new PivotError('not-found', 'That reference no longer exists.');
      const f = chosenFile(file);
      if (!f) throw new PivotError('reference.file', 'Choose a file to upload.');
      await applyEdit('attachFile', { id, file: await storeFile(id, 1 + (r.file ? 1 : 0) + r.pastFiles.length, f) });
      await handlers.checkReferenceFiles({ id });
    },
    // A platform's image: its background taken away and squared (in the browser), then copied into
    // the folder, and the platform pointed at it.
    async addPlatformImage({ id, file }) {
      if (!handle) throw new PivotError('no-data', 'Open the data folder first.');
      need(/** @type {any} */ (state.session?.working), 'platform', id);
      const f = chosenFile(file);
      if (!f) throw new PivotError('image.type', 'Choose a PNG or SVG image.');
      const img = env.prepareImage ? await env.prepareImage(f) : { blob: f, name: f.name, type: f.type };
      const stored = await store.storePlatformImage(handle, id, img.blob, img.name);
      await applyEdit('setPlatformImage', { id, image: { stored, name: img.name, type: img.type, addedBy: /** @type {string} */ (state.profileId), addedAt: env.clock.now() } });
    },
    async openReferenceFile({ stored }) {
      if (!handle) throw new PivotError('no-data', 'Open the data folder first.');
      const file = await store.openReferenceFile(handle, stored);
      // Shown or downloaded under the name it was uploaded with, not its name in the folder.
      const known = Object.values(state.session?.working.records.reference ?? {}).flatMap((r) => [r.file, ...r.pastFiles]).find((f) => f && f.stored === stored);
      env.openFile?.(file, known?.name ?? file.name);
    },
    async copyPath({ path }) {
      await env.copyText?.(path);
      set({ message: { kind: 'info', text: 'Copied the path.' } });
    },
    async checkReferenceFiles({ id } = {}) {
      if (!handle || !state.session) return;
      // One reference's page checks only its files; the list checks them all. Each check updates
      // only the files it looked at, so checks that overlap do not undo each other.
      const refs = Object.values(state.session.working.records.reference).filter((r) => r.status !== 'deleted' && (!id || r.id === id));
      const paths = [...new Set(refs.flatMap((r) => [r.file, ...r.pastFiles]).filter(Boolean).map((f) => f.stored))];
      const missing = await store.missingFiles(handle, paths);
      const checked = new Set(paths);
      set({ missingFiles: [...state.missingFiles.filter((p) => !checked.has(p)), ...missing] });
    },
    async linkReferences(args) {
      for (const referenceId of list(args.referenceId)) await applyEdit('linkReference', { referenceId, targetKind: args.targetKind, targetId: args.targetId });
      set({ picker: null });
    },
    async linkTargets(args) {
      for (const t of list(args.target)) {
        const [targetKind, targetId] = t.split('|');
        await applyEdit('linkReference', { referenceId: args.referenceId, targetKind, targetId });
      }
      set({ picker: null });
    },
    async closePicker() {
      set({ picker: null, bowtieReplace: null });
    },
    async linkControls(args) {
      for (const controlId of list(args.controlId)) {
        await applyEdit('linkControl', { hazardId: args.hazardId, controlId, kind: args[`kind:${controlId}`] || 'preventative' });
      }
      set({ picker: null });
    },
    /** From a control's side: link the control to the hazards ticked, each with its kind. */
    async linkControlToHazards(args) {
      for (const hazardId of list(args.hazardId)) {
        await applyEdit('linkControl', { hazardId, controlId: args.controlId, kind: args[`kind:${hazardId}`] || 'preventative' });
      }
      set({ picker: null });
    },
    /** From a hazard's platform tab: add the controls ticked there, each with its kind, and any new one typed under Add new. */
    async addControlsHere(args) {
      for (const controlId of list(args.controlId)) {
        await applyEdit('addControlHere', { hazardId: args.hazardId, platformId: args.platformId, controlId, kind: args[`kind:${controlId}`] || 'preventative' });
      }
      const title = String(args.newTitle ?? '').trim();
      if (title) await applyEdit('createControlOn', { title, hazardId: args.hazardId, platformId: args.platformId, kind: args.newKind || 'preventative' });
      set({ picker: null });
    },
    async linkPhases(args) {
      for (const phaseId of list(args.phaseId)) await applyEdit('linkPhase', { hazardId: args.hazardId, phaseId });
      set({ picker: null });
    },
    /** Make every entry given on hazards for a facet, not yet among its options, an option. */
    async addUnlistedOptions({ facet }) {
      const d = state.session?.working;
      if (!d) return;
      for (const e of unlistedEntries(d, facet)) await applyEdit('createFacetOption', { facet, name: e.text });
    },
    async tagPlatforms(args) {
      for (const groupId of list(args.groupId)) await applyEdit('tagPlatform', { platformId: args.platformId, groupId });
      set({ picker: null });
    },
    async linkPlatforms(args) {
      for (const platformId of list(args.platformId)) await applyEdit('linkHazard', { hazardId: args.hazardId, platformId });
      set({ picker: null });
    },
    async copyJustification({ hazardId, platformId, stage, receptor, field, from }) {
      if (field !== 'likelihoodWhy' && field !== 'consequenceWhy') throw new PivotError('not-found', 'Only a likelihood or consequence justification can be copied.');
      const source = state.session?.working.records.assessment?.[`ra:${hazardId}:${from}:${stage}:${receptor}`];
      if (!source || source.status !== 'live' || !source[field]) throw new PivotError('not-found', 'That platform has no justification to copy.');
      await applyEdit('setAssessment', { hazardId, platformId, stage, receptor, [field]: source[field] });
      set({ picker: null });
    },
    // What a control prevents or mitigates, from its picker: none ticked clears them.
    async saveControlTargets({ hazardId, platformId, controlId, targets }) {
      await applyEdit('setControlTargets', { hazardId, platformId, controlId, targets: list(targets) });
      set({ picker: null });
    },
    // Copy from another platform of the hazard: its controls (with their statuses) or SFARP.
    async copyPlatformPart({ part, hazardId, platformId, from }) {
      const op = { controls: 'copyControls', sfarp: 'copySfarp' }[/** @type {'controls'} */ (part)];
      if (!op) return;
      await applyEdit(op, { hazardId, platformId, from });
      set({ picker: null });
    },
    async copyStage({ hazardId, platformId, stage, from, withWhy }) {
      // A tick sends its value only when ticked: not there means leave the justifications.
      await applyEdit('copyStageRisk', { hazardId, platformId, stage, from, withWhy: withWhy === 'true' });
      set({ picker: null });
    },
    async linkHazards(args) {
      for (const hazardId of list(args.hazardId)) await applyEdit('linkHazard', { hazardId, platformId: args.platformId });
      set({ picker: null });
    },
    async setControlState({ hazardId, controlId, platformId, value }) {
      if (value === 'rejected') set({ editing: { kind: 'rejection', id: `${hazardId}|${controlId}|${platformId}` } });
      else await applyEdit('setControlStatus', { hazardId, controlId, platformId, status: value });
    },
    async rejectControl({ hazardId, controlId, platformId, reason }) {
      await applyEdit('setControlStatus', { hazardId, controlId, platformId, status: 'rejected', reason });
    },
    async setHomeOwner({ ownerId, show }) {
      set({ homeOwner: ownerId || 'me', ...(show === 'home' ? { view: { name: 'home' }, editing: null } : {}) });
    },
    async beginReview({ platformId }) {
      await applyEdit('startReview', { platformId });
      set({ view: { name: 'platform', id: platformId, tab: 'reviews' } });
    },
    async tickReviewRow({ reviewId, hazardId, reviewed }) {
      await applyEdit('markRow', { reviewId, hazardId, reviewed: reviewed === 'true' });
    },
    async chooseReportPlatform({ platformId }) {
      set({ reportPlatformId: platformId });
    },
    async startEdit({ kind, id }) {
      set({ editing: { kind, id } });
    },
    async cancelEdit() {
      set({ editing: null });
    },
    async setFilter({ list, field, value }) {
      const next = { ...state.filters[list] };
      if (value) next[field] = value; else delete next[field];
      set({ filters: { ...state.filters, [list]: next } });
    },
    async openDesigner() {
      if (!state.session) throw new PivotError('no-data', 'Open the data before designing reports.');
      DocGen.docHost.set(docs.host);
      DocGen.ui.views.reportDesign.open();
      set({ designerRevision: state.designerRevision + 1 });
    },
    async produceReport({ platformId, title }) {
      if (!state.session) throw new PivotError('no-data', 'There is no data to report on.');
      if (hasUnsavedRecords(state.session)) {
        throw new PivotError('report.unsaved', 'Save your changes before producing a report, so the report matches what is stored.');
      }
      const at = env.clock.now();
      const platform = state.session.working.records.platform[platformId];
      if (!platform) throw new PivotError('not-found', 'Choose a platform to report on.');
      const t = String(title ?? '').trim() || `${platform.name} hazard report`;
      const { report } = docs.produce(platformId, { at, by: /** @type {string} */ (state.profileId), title: t });
      const id = newId();
      const working = createReport(state.session.working, { by: /** @type {string} */ (state.profileId), at }, { id, report });
      set({ session: { ...state.session, working }, view: { name: 'reports' }, lastReportId: id, message: { kind: 'info', text: `Report produced for ${platform.name}. Save to keep it.` } });
      await afterChange();
    },
    async downloadReport({ id, format }) {
      const r = state.session?.working.records.report[id];
      if (!r) throw new PivotError('not-found', 'That report no longer exists.');
      const ext = format === 'html' ? 'html' : 'md';
      const file = await env.pickSaveFile(`${reportFileBase(r)}.${ext}`);
      await store.writeExport(file, ext === 'html' ? r.html : r.markdown);
      set({ message: { kind: 'info', text: `Saved ${file.name}.` } });
    },
    async generateFromDesigner({ format }) {
      const platformId = DocGen.docSession.selectedSubjectId();
      if (!platformId) throw new PivotError('not-found', 'Choose a platform in the designer first.');
      await handlers.produceReport({ platformId });
      if (state.message?.kind === 'error') return;
      await handlers.downloadReport({ id: state.lastReportId, format });
    },
    async showBackups() {
      set({ view: { name: 'backups' }, backups: await store.listBackups(/** @type {any} */ (handle)) });
    },
    async prepareRestore({ name }) {
      const data = await store.readBackup(/** @type {any} */ (handle), name);
      const b = state.backups.find((x) => x.name === name);
      set({ pendingRestore: { label: `the backup from ${b ? when(b.at) : name}`, data, lost: unsavedActions() } });
    },
    async prepareRestoreFromFile() {
      const text = await env.pickOpenFile();
      const data = await store.dataFromText(text);
      set({ pendingRestore: { label: 'the chosen file', data, lost: unsavedActions() } });
    },
    async confirmRestore() {
      const pending = state.pendingRestore;
      if (!pending) return;
      const r = await store.restore(/** @type {any} */ (handle), pending.data, /** @type {string} */ (state.profileId), env.clock);
      clearMirror(env.storage);
      set({
        session: { base: r.data, working: r.data, loadedStamp: r.stamp }, pendingRestore: null, dataBlocked: false,
        message: { kind: 'info', text: `Restored from ${pending.label}.`, items: r.supersededFile ? [`The data it replaced is kept as ${r.supersededFile}.`] : [] },
      });
      DocGen.docHost.set(docs.host);
    },
    async cancelRestore() {
      set({ pendingRestore: null });
    },
    async openBowtie({ hazardId, platformId }) {
      place('last', { viewId: null, hazardId, platformId, filters: normalizeFilters(DEFAULT_FILTERS) });
    },
    async newBowtie({ pair }) {
      const [hazardId, platformId] = String(pair ?? '').split('|');
      const d = state.session?.working;
      if (!d || !hazardId || !platformId || !bowtieOf(d, hazardId, platformId, DEFAULT_FILTERS).ok) {
        throw new PivotError('not-found', 'Choose a hazard and a platform it is on.');
      }
      if (state.editing?.kind === 'bowtieNew') set({ editing: null });
      place('last', { viewId: null, hazardId, platformId, filters: normalizeFilters(DEFAULT_FILTERS) });
    },
    /** Open a section of a page's rail, or close it if it is the one open (unless asked to keep it open). */
    async showSection({ page, section, keep }) {
      const sections = state.sections ?? {};
      const open = sections[page] === undefined ? DEFAULT_SECTION[/** @type {keyof typeof DEFAULT_SECTION} */ (page)] : sections[page];
      set({ sections: { ...sections, [page]: open === section && !keep ? null : section } });
    },
    async goBack() {
      const history = state.viewHistory ?? [];
      const prev = history.at(-1);
      if (!prev) return;
      goingBack = true;
      try {
        set({ viewHistory: history.slice(0, -1) });
        await handlers.go({ ...prev, view: prev.name });
      } finally {
        goingBack = false;
      }
    },
    /** Ask before an action: a pop-up with the warning, Continue or Cancel. `run` is the action to take. */
    async askConfirm({ run, title, text, action: _self, ...rest }) {
      set({ confirm: { title, text, action: { type: run, ...rest } } });
    },
    async confirmCancel() {
      set({ confirm: null });
    },
    async confirmContinue() {
      const action = state.confirm?.action;
      set({ confirm: null });
      if (action) await dispatch(action);
    },
    // Bundle mode on a history tab: rows can be chosen and confirmed as one bundle. It belongs to
    // the page it was turned on for, so leaving the page ends it.
    async toggleBundling() {
      const here = bundlePage(state.view);
      set({ bundling: state.bundling === here ? null : here });
    },
    // Info's tools. Assign to platform group: choose a group, then rows (see assignSelect in
    // mount.js), then Confirm. View setup: which platform groups are shown, and whether the table
    // is displayed by platform group. Both are this session's alone.
    async startAssignToGroup({ facet, groupId }) {
      if (!groupId) throw new PivotError('empty', 'Choose a platform group first.');
      set({ infoTools: { ...state.infoTools, assigning: { facet, groupId }, groupId } });
    },
    /** The group chosen in Assign to platform group stays chosen until another is. */
    async chooseAssignGroup({ groupId }) {
      set({ infoTools: { ...state.infoTools, groupId: groupId || null } });
    },
    async cancelAssignToGroup() {
      set({ infoTools: { ...state.infoTools, assigning: null } });
    },
    async assignToGroup({ facet, groupId, optionIds }) {
      await applyEdit('assignOptionsToGroup', { facet, groupId, optionIds });
      set({ infoTools: { ...state.infoTools, assigning: null } });
    },
    async toggleInfoGroup({ groupId, on }) {
      const hidden = (state.infoTools.hidden ?? []).filter((/** @type {string} */ g) => g !== groupId);
      set({ infoTools: { ...state.infoTools, hidden: on === 'true' ? hidden : [...hidden, groupId] } });
    },
    async showInfoGroups({ all }) {
      const groups = ['all', ...(state.session ? listPlatformGroups(state.session.working).map((g) => g.id) : [])];
      set({ infoTools: { ...state.infoTools, hidden: all === 'true' ? [] : groups } });
    },
    async toggleInfoByGroup() {
      set({ infoTools: { ...state.infoTools, byGroup: !state.infoTools.byGroup } });
    },
    async toggleBundleOpen({ id }) {
      const open = state.openBundles ?? [];
      set({ openBundles: open.includes(id) ? open.filter((x) => x !== id) : [...open, id] });
    },
    // + on the Controls page: a new control's page, as a draft until it has a title.
    async newControl() {
      await handlers.go({ view: 'newControl' });
      set({ draftControl: { title: '', description: '', tier: '', kind: 'preventative', origin: '' } });
    },
    async setControlDraft({ field, value, kind }) {
      const d = state.draftControl;
      if (!d || !['tier', 'kind', 'origin', 'description'].includes(field)) return;
      set({ draftControl: { ...d, [field]: field === 'kind' ? kind ?? value : value } });
    },
    async createDraftControl({ title }) {
      const d = state.draftControl;
      if (!d || !String(title ?? '').trim()) return;
      await applyEdit('createControl', { title, description: d.description, tier: d.tier || null, kind: d.kind, origin: d.origin });
      set({ draftControl: null });
    },
    async toggleBowtieDetails({ id }) {
      const shown = state.bowtieDetails ?? [];
      set({ bowtieDetails: shown.includes(id) ? shown.filter((x) => x !== id) : [...shown, id] });
    },
    async openBowtieView({ id, side }) {
      place(sideOf(side), paneForView(id));
    },
    async dropBowtie({ side, viewId, pane }) {
      const to = paneIndex(side);
      if (pane !== undefined) { setWorkspace(movePane(state.workspace, paneIndex(pane), to)); return; }
      if (viewId) { place(to, paneForView(viewId)); return; }
    },
    async swapBowtiePanes() {
      setWorkspace(swapPanes(state.workspace));
    },
    async closeBowtiePane({ side }) {
      setWorkspace(closePane(state.workspace, paneIndex(side)));
    },
    // Where a window's drawing is zoomed and moved to, once the wheel or a drag settles.
    // Show tags: the badges on a window's control boxes, on or off for that window.
    async toggleBowtieTags({ side }) {
      togglePane(side, 'hideTags');
    },
    // Show gaps: the mark on causal factors and consequences no control stands against.
    async toggleBowtieGaps({ side }) {
      togglePane(side, 'hideGaps');
    },
    // The window's view: focus (each control once, joined to what it stands against) or traditional
    // (a row for each causal factor and consequence); a newly opened window is always focus.
    async setBowtieLayout({ side, layout }) {
      const i = paneIndex(side);
      const { layout: _was, ...rest } = paneAt(side);
      const panes = /** @type {[import('./workspace.js').Pane | null, import('./workspace.js').Pane | null]} */ ([...state.workspace.panes]);
      panes[i] = layout === 'traditional' ? { ...rest, layout: 'traditional' } : rest;
      setWorkspace({ panes, lastUsed: i });
    },
    async viewBowtie({ side, zoom, x, y }) {
      const i = paneIndex(side);
      const p = state.workspace.panes[i];
      if (!p) return;
      const { zoom: _z, pan: _p, ...rest } = p;
      const panes = /** @type {[import('./workspace.js').Pane | null, import('./workspace.js').Pane | null]} */ ([...state.workspace.panes]);
      panes[i] = { ...rest, ...paneView(zoom, x, y) };
      setWorkspace({ panes, lastUsed: i });
    },
    async setPaneStatus({ side, status, on }) {
      const p = paneAt(side);
      const rest = p.filters.statuses.filter((s) => s !== status);
      const statuses = on === 'true' ? [...rest, status] : rest;
      setWorkspace(updatePane(state.workspace, paneIndex(side), { filters: normalizeFilters({ ...p.filters, statuses }) }));
    },
    async confirmBowtieReplace() {
      const r = state.bowtieReplace;
      if (!r) return;
      setWorkspace(placePane(state.workspace, r.side, r.pane));
      set({ bowtieReplace: null });
    },
    async cancelBowtieReplace() {
      set({ bowtieReplace: null });
    },
    async saveBowtiePane({ side }) {
      const p = paneAt(side);
      const v = p.viewId ? state.session?.working.records.bowtieView?.[p.viewId] : null;
      if (v && v.status === 'live' && v.ownerId === state.profileId) {
        await applyEdit('updateBowtieView', { id: v.id, filters: p.filters });
        return;
      }
      set({ editing: { kind: 'bowtieName', id: String(paneIndex(side)) } });
    },
    async saveBowtiePaneAs({ side, name }) {
      const p = paneAt(side);
      const id = newId();
      await applyEdit('createBowtieView', { id, name, hazardId: p.hazardId, platformId: p.platformId, filters: p.filters });
      setWorkspace(updatePane(state.workspace, paneIndex(side), { viewId: id }));
    },
    async shareBowtieView({ id, profileId }) {
      const known = new Set(state.profiles.map((p) => p.id));
      await applyEdit('setBowtieSharing', { id, sharedWith: list(profileId).filter((p) => known.has(p)) });
    },
    async renameBowtieView({ id, name }) {
      await applyEdit('updateBowtieView', { id, name });
    },
    async removeBowtieView({ id }) {
      const before = state.session?.working;
      const v = before?.records.bowtieView?.[id];
      if (!before || !v) throw new PivotError('not-found', 'That view no longer exists.');
      await applyEdit('deleteBowtieView', { id });
      set({ undo: { text: `Deleted ${v.name}.`, before, after: state.session?.working, base: state.session?.base } });
    },
    async exportBowtie({ side }) {
      const p = paneAt(side);
      const d = state.session?.working;
      const b = d ? bowtieOf(d, p.hazardId, p.platformId, p.filters) : null;
      if (!b) throw new PivotError('no-data', 'There is no data to draw.');
      if (!b.ok) throw new PivotError('bowtie.cannot-draw', /** @type {import('../core/bowtie.js').Cannot} */ (b).message);
      const base = `${hazardName(b.hazard)} ${b.platform.name} bow-tie`.replace(/[^A-Za-z0-9._-]+/g, '-');
      const file = await env.pickSaveFile(`${base}.svg`);
      await store.writeExport(file, bowtieSvg(b, { tags: !p.hideTags, gaps: !p.hideGaps, layout: p.layout ?? 'focus' }));
      set({ message: { kind: 'info', text: `Saved ${file.name}.` } });
    },
  };

  /** @param {unknown} v @returns {string[]} */
  const list = (v) => (Array.isArray(v) ? v : v ? [String(v)] : []);

  /** Make one edit to the working data. @param {string} type @param {Record<string, any>} args */
  /** Open a folder the person chose, or allowed again: check its files, then ask who they are. @param {any} h */
  async function openFolder(h) {
    handle = h;
    // A different folder is a fresh start: nothing of the last one's session carries over.
    set({ session: null, profileId: null, view: initialState().view, viewHistory: [], editing: null, picker: null, confirmDelete: null, undo: null, recoverable: null });
    const check = await store.checkFolder(h);
    const profilesBad = check.failed.some((x) => x.file === store.FILES.profiles);
    const dataBlocked = check.failed.some((x) => x.file === store.FILES.data);
    set({
      folderName: h.name, check, dataBlocked, message: null,
      profiles: profilesBad ? [] : await store.readProfiles(h),
      screen: check.failed.length ? 'check' : 'profile',
    });
  }

  async function applyEdit(type, args) {
    if (!state.session || !state.profileId) throw new PivotError('no-data', 'Select your profile before changing anything.');
    const shows = SHOW_CREATED[/** @type {keyof typeof SHOW_CREATED} */ (type)];
    if (shows && !args.id) args.id = newId();
    // Acknowledgement starts with the session's first real edit, dated when the session opened, so
    // opening Pivot alone never leaves unsaved work.
    const current = state.session.working;
    const from = openedAt && acks.ackStart(current) === null ? acks.startAcks(current, { by: /** @type {string} */ (state.profileId), at: openedAt }) : current;
    const next = EDITS[/** @type {keyof typeof EDITS} */ (type)](from, act(), /** @type {any} */ (args));
    const working = next === from ? current : next;
    set({ session: { ...state.session, working }, message: null, editing: null, ...(type === 'createBundle' ? { bundling: null } : {}) });
    if (shows) set({ view: { name: shows, id: args.id } });
    await afterChange();
  }

  /** @param {{ type: string, [k: string]: any }} action */
  async function dispatch(action) {
    const { type, ...args } = action;
    try {
      if (type in EDITS) {
        await applyEdit(type, args);
        return;
      }
      const h = handlers[type];
      if (!h) throw new Error(`unknown action: ${type}`);
      const quiet = QUIET.has(type);
      if (!quiet) { running += 1; set({ busy: true }); }
      await h(args);
    } catch (e) {
      if (e && typeof e === 'object' && /** @type {any} */ (e).name === 'AbortError') return;
      set({
        message: e instanceof PivotError
          ? { kind: 'error', text: e.message }
          : { kind: 'error', text: `Something went wrong: ${e instanceof Error ? e.message : String(e)}`, items: ['This is a fault in Pivot. Your unsaved changes are still here; save them if you can.'] },
      });
    } finally {
      if (!(type in EDITS) && handlers[type] && !QUIET.has(type)) running -= 1;
      if (running === 0 && state.busy) set({ busy: false });
    }
  }

  return {
    getState: () => state,
    dispatch,
    /** A file stored in the data folder (a platform's image), for showing on screen. @param {string} stored */
    async readStoredFile(stored) {
      if (!handle) throw new PivotError('no-data', 'Open the data folder first.');
      return store.openReferenceFile(handle, stored);
    },
    /** @param {(s: any) => void} fn */
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
