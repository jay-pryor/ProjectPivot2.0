import { createReport } from '../core/ops/reports.js';
import { reportFileBase } from '../reports/docgen-host.js';
import { when } from './names.js';
import * as store from '../storage/store.js';
import { writeMirror, readMirror, clearMirror, hasUnsaved, hasUnsavedRecords } from '../storage/mirror.js';
import { PivotError } from '../core/errors.js';
import { newId } from '../core/ids.js';
import { emptyData } from '../core/data.js';
import { epochOf } from '../core/time.js';
import { entries, unseenOverrides, markNoticesSeen } from '../core/history.js';
import * as hazards from '../core/ops/hazards.js';
import * as controls from '../core/ops/controls.js';
import * as platforms from '../core/ops/platforms.js';
import * as assessment from '../core/ops/assessment.js';
import { setReportDesign } from '../core/ops/reports.js';
import { createDocHost } from '../reports/docgen-host.js';
import { App as DocGen } from '../../DocGen/doc-designer.js';
import { recordName, profileName, KIND_LABEL } from './names.js';
import { mergeData } from '../core/merge.js';

/** Every edit is an op called with the working data, the act, and the action's own fields. */
const EDITS = {
  createHazard: hazards.createHazard, updateHazard: hazards.updateHazard, retireHazard: hazards.retireHazard,
  deleteHazard: hazards.deleteHazard, restoreRecord: hazards.restoreRecord,
  addCausalFactor: hazards.addCausalFactor, updateCausalFactor: hazards.updateCausalFactor, deleteCausalFactor: hazards.deleteCausalFactor,
  addConsequence: hazards.addConsequence, updateConsequence: hazards.updateConsequence, deleteConsequence: hazards.deleteConsequence,
  createControl: controls.createControl, updateControl: controls.updateControl, retireControl: controls.retireControl,
  deleteControl: controls.deleteControl, linkControl: controls.linkControl, setControlKind: controls.setControlKind,
  unlinkControl: controls.unlinkControl,
  createPlatform: platforms.createPlatform, updatePlatform: platforms.updatePlatform, setOwner: platforms.setOwner,
  retirePlatform: platforms.retirePlatform, deletePlatform: platforms.deletePlatform, linkHazard: platforms.linkHazard,
  unlinkHazard: platforms.unlinkHazard, setReportId: platforms.setReportId,
  confirmControl: assessment.confirmControl, excludeControl: assessment.excludeControl,
  resetControl: assessment.resetControl, setRating: assessment.setRating,
};

/** After creating one of these, show it. */
const SHOW_CREATED = { createHazard: 'hazard', createControl: 'control', createPlatform: 'platform' };

const BACKUP_CHECK_MS = 60_000;

export function initialState() {
  return {
    screen: 'open', folderName: '', check: { failed: [] }, profiles: [], profileId: null, dataBlocked: false,
    session: null, recoverable: null, notices: [], view: { name: 'hazards' },
    filters: { hazards: {}, controls: {} }, backups: [], pendingRestore: null,
    message: null, warnings: [], busy: false, designerRevision: 0, lastReportId: null,
  };
}

/**
 * @param {{ clock: import('../core/time.js').Clock, storage: Storage,
 *   pickFolder: () => Promise<FileSystemDirectoryHandle>,
 *   pickSaveFile: (name: string) => Promise<FileSystemFileHandle>,
 *   pickOpenFile: () => Promise<string> }} env
 */
export function createController(env) {
  let state = initialState();
  /** @type {FileSystemDirectoryHandle | null} */
  let handle = null;
  let lastBackupCheck = -Infinity;
  /** @type {Set<(s: any) => void>} */
  const listeners = new Set();

  /** @param {Record<string, any>} patch */
  function set(patch) {
    state = { ...state, ...patch };
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
    DocGen.docHost.set(docs.host);
    const notices = unseenOverrides(state.session.working, /** @type {string} */ (state.profileId));
    set({ notices, screen: notices.length ? 'notices' : 'main', view: { name: 'hazards' } });
  }

  /** The actions made since the last save, for the restore warning. */
  function unsavedActions() {
    if (!state.session) return [];
    return entries(state.session.working).filter((e) => e.type === 'change' && !state.session.base.history[e.id]).map((e) => e.action);
  }

  /** @param {import('../storage/store.js').SaveResult} r */
  function saveMessage(r) {
    if (!r.merged) return { kind: 'info', text: 'Saved.' };
    const who = nameOf(r.lastSavedBy);
    const kept = r.supersededFile ? [`Their previous file is kept as ${r.supersededFile}.`] : [];
    if (r.missingFromDisk > 0) {
      const n = r.missingFromDisk;
      kept.unshift(`${n} ${n === 1 ? 'record was' : 'records were'} missing from data.json on disk (the file had been replaced) and ${n === 1 ? 'is' : 'are'} kept.`);
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
      items: [...r.conflicts.map((c) => `${KIND_LABEL[c.kind] ?? c.kind}: ${recordName(c.kind, c.theirs ?? c.mine)}`), ...kept],
    };
  }

  /** @type {Record<string, (args: any) => Promise<void>>} */
  const handlers = {
    async chooseFolder() {
      handle = await env.pickFolder();
      const check = await store.checkFolder(handle);
      const profilesBad = check.failed.some((x) => x.file === store.FILES.profiles);
      const dataBlocked = check.failed.some((x) => x.file === store.FILES.data);
      set({
        folderName: handle.name, check, dataBlocked, message: null,
        profiles: profilesBad ? [] : await store.readProfiles(handle),
        screen: check.failed.length ? 'check' : 'profile',
      });
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
      const m = state.recoverable;
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
    async dismissMessage() {
      set({ message: null });
    },
    async go({ view, id, hazardId, platformId }) {
      set({ view: { name: view, id, hazardId, platformId }, message: null });
      if (view === 'backups' && handle) set({ backups: await store.listBackups(handle) });
    },
    async save() {
      if (!state.session) throw new PivotError('no-data', 'There is nothing to save yet.');
      const startWorking = state.session.working;
      const r = await store.save(/** @type {any} */ (handle), state.session, /** @type {string} */ (state.profileId), env.clock);
      // Edits made while the save was running are laid back over what was saved.
      const during = state.session.working !== startWorking;
      let working = during ? mergeData(startWorking, state.session.working, r.data, act()).data : r.data;
      if (during) {
        // The numbers the save gave stay with their hazards, whatever was edited meanwhile.
        const hazards = { ...working.records.hazard };
        for (const h of Object.values(hazards)) {
          const savedNumber = r.data.records.hazard[h.id]?.number;
          if (h.number == null && savedNumber != null) hazards[h.id] = { ...h, number: savedNumber };
        }
        working = { ...working, records: { ...working.records, hazard: hazards }, nextHazardNumber: r.data.nextHazardNumber };
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

  /** @param {{ type: string, [k: string]: any }} action */
  async function dispatch(action) {
    const { type, ...args } = action;
    try {
      if (type in EDITS) {
        if (!state.session || !state.profileId) throw new PivotError('no-data', 'Select your profile before changing anything.');
        const shows = SHOW_CREATED[type];
        if (shows && !args.id) args.id = newId();
        const working = EDITS[type](state.session.working, act(), args);
        set({ session: { ...state.session, working }, message: null });
        if (shows) set({ view: { name: shows, id: args.id } });
        await afterChange();
        return;
      }
      const h = handlers[type];
      if (!h) throw new Error(`unknown action: ${type}`);
      set({ busy: true });
      await h(args);
    } catch (e) {
      if (e && typeof e === 'object' && /** @type {any} */ (e).name === 'AbortError') return;
      set({
        message: e instanceof PivotError
          ? { kind: 'error', text: e.message }
          : { kind: 'error', text: `Something went wrong: ${e instanceof Error ? e.message : String(e)}`, items: ['This is a fault in Pivot. Your unsaved changes are still here; save them if you can.'] },
      });
    } finally {
      if (state.busy) set({ busy: false });
    }
  }

  return {
    getState: () => state,
    dispatch,
    /** @param {(s: any) => void} fn */
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
