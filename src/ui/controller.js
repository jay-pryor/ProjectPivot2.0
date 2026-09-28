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
    message: null, warnings: [], busy: false, designerRevision: 0,
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
      const r = await store.save(/** @type {any} */ (handle), state.session, /** @type {string} */ (state.profileId), env.clock);
      clearMirror(env.storage);
      // Someone who saved in between may have created their profile since this copy read the list.
      if (r.merged) set({ profiles: await store.readProfiles(/** @type {any} */ (handle)) });
      set({ session: { base: r.data, working: r.data, loadedStamp: r.stamp }, message: saveMessage(r), warnings: [] });
    },
    async setFilter({ list, field, value }) {
      const next = { ...state.filters[list] };
      if (value) next[field] = value; else delete next[field];
      set({ filters: { ...state.filters, [list]: next } });
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
