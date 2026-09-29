import { createReport } from '../core/ops/reports.js';
import { reportFileBase } from '../reports/docgen-host.js';
import { when } from './names.js';
import * as store from '../storage/store.js';
import { writeMirror, readMirror, clearMirror, hasUnsaved, hasUnsavedRecords, restoreReportDocuments } from '../storage/mirror.js';
import { PivotError } from '../core/errors.js';
import { newId } from '../core/ids.js';
import { deleteName } from './screens/common.js';
import { emptyData, NUMBERED } from '../core/data.js';
import { epochOf, aestDate, systemClock } from '../core/time.js';
import { entries, unseenOverrides, markNoticesSeen, addComment } from '../core/history.js';
import * as hazards from '../core/ops/hazards.js';
import * as controls from '../core/ops/controls.js';
import * as platforms from '../core/ops/platforms.js';
import * as assessment from '../core/ops/assessment.js';
import * as reviews from '../core/ops/reviews.js';
import * as acks from '../core/acks.js';
import * as references from '../core/ops/references.js';
import * as phases from '../core/ops/phases.js';
import * as safetyReports from '../core/ops/safety-reports.js';
import { setReportDesign } from '../core/ops/reports.js';
import { createDocHost } from '../reports/docgen-host.js';
import { App as DocGen } from '../../DocGen/doc-designer.js';
import { recordName, profileName, KIND_LABEL } from './names.js';
import { THEMES, MIN_COLUMN_WIDTH, activeProfile } from './prefs.js';
import { mergeData } from '../core/merge.js';

/** Every edit is an op called with the working data, the act, and the action's own fields. */
const EDITS = {
  createHazard: hazards.createHazard, updateHazard: hazards.updateHazard, retireHazard: hazards.retireHazard,
  deleteHazard: hazards.deleteHazard, restoreRecord: hazards.restoreRecord,
  addCausalFactor: hazards.addCausalFactor, updateCausalFactor: hazards.updateCausalFactor, deleteCausalFactor: hazards.deleteCausalFactor,
  addConsequence: hazards.addConsequence, updateConsequence: hazards.updateConsequence, deleteConsequence: hazards.deleteConsequence,
  createControl: controls.createControl, updateControl: controls.updateControl, retireControl: controls.retireControl,
  deleteControl: controls.deleteControl, linkControl: controls.linkControl, setControlKind: controls.setControlKind,
  unlinkControl: controls.unlinkControl, setControlAnalysis: controls.setControlAnalysis,
  linkExistingControl: controls.linkExistingControl, unlinkExistingControl: controls.unlinkExistingControl, setExistingControlKind: controls.setExistingControlKind,
  createPlatform: platforms.createPlatform, updatePlatform: platforms.updatePlatform, setOwner: platforms.setOwner,
  retirePlatform: platforms.retirePlatform, deletePlatform: platforms.deletePlatform, linkHazard: platforms.linkHazard,
  unlinkHazard: platforms.unlinkHazard, setReportId: platforms.setReportId,
  setControlStatus: assessment.setControlStatus, setRating: assessment.setRating, setRatingCell: assessment.setRatingCell,
  setAssessment: assessment.setAssessment, setSfarp: assessment.setSfarp,
  setSchedule: reviews.setSchedule, startReview: reviews.startReview, markRow: reviews.markRow,
  setReviewOutcome: reviews.setReviewOutcome, completeReview: reviews.completeReview, abandonReview: reviews.abandonReview,
  acknowledge: acks.acknowledge, acknowledgeAll: acks.acknowledgeAll,
  createReference: references.createReference, updateReference: references.updateReference, attachFile: references.attachFile,
  retireReference: references.retireReference, deleteReference: references.deleteReference,
  createPhase: phases.createPhase, renamePhase: phases.renamePhase, retirePhase: phases.retirePhase, deletePhase: phases.deletePhase,
  linkPhase: phases.linkPhase, unlinkPhase: phases.unlinkPhase,
  createSafetyReport: safetyReports.createSafetyReport, updateSafetyReport: safetyReports.updateSafetyReport, deleteSafetyReport: safetyReports.deleteSafetyReport,
  linkReference: references.linkReference, unlinkReference: references.unlinkReference,
  addComment,
};

/** After creating one of these, show it. */
const SHOW_CREATED = { createHazard: 'hazard', createControl: 'control', createPlatform: 'platform', createReference: 'reference' };

const BACKUP_CHECK_MS = 60_000;

/** Actions that only change what is on screen or a preference: they never mark the app busy. */
const QUIET = new Set(['setColumnWidth', 'resetColumnWidth', 'setTheme', 'sortTable', 'filterTable', 'startEdit', 'cancelEdit', 'go', 'dismissMessage', 'openPicker', 'closePicker', 'chooseReportPlatform', 'setHomeOwner', 'askDelete', 'cancelDelete', 'recallFolder']);

export function initialState() {
  return {
    screen: 'open', folderName: '', check: { failed: [] }, profiles: [], profileId: null, dataBlocked: false,
    session: null, recoverable: null, notices: [], view: { name: 'hazards' },
    filters: { hazards: {}, controls: {} }, backups: [], pendingRestore: null,
    message: null, warnings: [], busy: false, designerRevision: 0, lastReportId: null,
    tables: {}, editing: null, saving: false, picker: null, confirmDelete: null, undo: null, lastFolder: null,
    today: aestDate(systemClock.now()), reportPlatformId: null, homeOwner: 'me', missingFiles: [],
  };
}

/**
 * @param {{ clock: import('../core/time.js').Clock, storage: Storage,
 *   pickFolder: () => Promise<FileSystemDirectoryHandle>,
 *   pickSaveFile: (name: string) => Promise<FileSystemFileHandle>,
 *   pickOpenFile: () => Promise<string>, minSaveMs?: number,
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
  function set(patch) {
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
    set({ notices, screen: notices.length ? 'notices' : 'main', view: { name: 'home' } });
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
      set({ session: { base: m.base, working: m.working, loadedStamp: m.loadedStamp }, recoverable: null });
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
    async go({ view, id, hazardId, platformId, tab, reviewId }) {
      set({ view: { name: view, id, hazardId, platformId, tab, reviewId }, message: null, editing: null, confirmDelete: null });
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
    async openPicker({ picker, hazardId, platformId, referenceId, targetKind, targetId }) {
      const extra = { hazardId, platformId, referenceId, targetKind, targetId };
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
      set({ picker: null });
    },
    async linkControls(args) {
      for (const controlId of list(args.controlId)) {
        await applyEdit('linkControl', { hazardId: args.hazardId, controlId, kind: args[`kind:${controlId}`] || 'preventative' });
      }
      set({ picker: null });
    },
    async linkExistingControls(args) {
      for (const controlId of list(args.controlId)) {
        await applyEdit('linkExistingControl', { hazardId: args.hazardId, platformId: args.platformId, controlId, kind: args[`kind:${controlId}`] || 'preventative' });
      }
      set({ picker: null });
    },
    async linkPhases(args) {
      for (const phaseId of list(args.phaseId)) await applyEdit('linkPhase', { hazardId: args.hazardId, phaseId });
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
    async setScheduleField({ platformId, months, due }) {
      const p = state.session?.working.records.platform[platformId];
      if (!p) throw new PivotError('not-found', 'That platform no longer exists.');
      await applyEdit('setSchedule', { platformId, months: months ?? p.reviewMonths, due: due ?? p.reviewDue });
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
  };

  /** @param {unknown} v @returns {string[]} */
  const list = (v) => (Array.isArray(v) ? v : v ? [String(v)] : []);

  /** Make one edit to the working data. @param {string} type @param {Record<string, any>} args */
  /** Open a folder the person chose, or allowed again: check its files, then ask who they are. @param {any} h */
  async function openFolder(h) {
    handle = h;
    // A different folder is a fresh start: nothing of the last one's session carries over.
    set({ session: null, profileId: null, view: initialState().view, editing: null, picker: null, confirmDelete: null, undo: null, recoverable: null });
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
    set({ session: { ...state.session, working }, message: null, editing: null });
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
    /** @param {(s: any) => void} fn */
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
