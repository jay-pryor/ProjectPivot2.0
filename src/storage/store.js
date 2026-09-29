import { epochOf, formatAest, compactStamp } from '../core/time.js';
import { backupName, backupTime, BACKUP_RE } from './envelope.js';
import { listNames, removeFile } from './folder.js';
import { mergeData } from '../core/merge.js';
import { assignHazardNumbers } from '../core/ops/hazards.js';
import { recordOverride } from '../core/history.js';
import { newStamp, sameStamp, supersededName } from './envelope.js';
import { emptyData, validateData, needText } from '../core/data.js';
import { PivotError } from '../core/errors.js';
import { newId } from '../core/ids.js';
import { seal, serialize, openEnvelope } from './envelope.js';
import { readText, writeWhole } from './folder.js';

/** @typedef {import('../core/data.js').Data} Data */
/** @typedef {import('./envelope.js').SaveStamp} SaveStamp */
/** @typedef {import('../core/time.js').Clock} Clock */
/** @typedef {{ id: string, name: string, createdAt: string, prefs?: Record<string, any> }} Profile */
/** @typedef {FileSystemDirectoryHandle} Dir */

export const FILES = Object.freeze({
  data: 'data.json',
  profiles: 'profiles.json',
  backups: 'backups',
  superseded: 'Superseded Saves',
  files: 'files',
});

/** @param {Dir} handle @returns {Promise<{ failed: { file: string, reason: string, detail: string }[] }>} */
export async function checkFolder(handle) {
  const failed = [];
  for (const [file, kind] of /** @type {const} */ ([[FILES.data, 'data'], [FILES.profiles, 'profiles']])) {
    let text;
    try {
      text = await readText(handle, file);
    } catch (e) {
      failed.push({ file, reason: 'unreadable', detail: e instanceof Error ? e.message : String(e) });
      continue;
    }
    if (text === null) continue;
    const opened = await openEnvelope(text, kind);
    if (!opened.ok) {
      failed.push({ file, reason: opened.reason, detail: opened.detail });
      continue;
    }
    if (kind === 'data') {
      const problems = validateData(opened.envelope.body);
      if (problems.length) failed.push({ file, reason: 'invalid', detail: problems.slice(0, 5).join('; ') });
    }
  }
  return { failed };
}

/** @param {string} text @returns {Promise<{ data: Data, stamp: SaveStamp | null }>} */
async function openData(text) {
  const opened = await openEnvelope(text, 'data');
  if (!opened.ok) throw new PivotError('data.unreadable', `This data file cannot be used: ${opened.detail}.`, { reason: opened.reason });
  const problems = validateData(opened.envelope.body);
  if (problems.length) throw new PivotError('data.invalid', `This data file cannot be used: ${problems[0]}.`, { problems });
  return { data: opened.envelope.body, stamp: opened.envelope.stamp };
}

/** A data file's text as a restore source: checked like data.json. @param {string} text */
export async function dataFromText(text) {
  return (await openData(text)).data;
}

/** @param {Dir} handle @returns {Promise<{ text: string | null, data: Data, stamp: SaveStamp | null }>} */
export async function readDisk(handle) {
  const text = await readText(handle, FILES.data);
  if (text === null) return { text: null, data: emptyData(), stamp: null };
  return { text, ...(await openData(text)) };
}

/** @param {Dir} handle */
export async function load(handle) {
  const { data, stamp } = await readDisk(handle);
  return { data, stamp };
}

/** @param {Dir} handle @returns {Promise<Profile[]>} */
export async function readProfiles(handle) {
  const text = await readText(handle, FILES.profiles);
  if (text === null) return [];
  const opened = await openEnvelope(text, 'profiles');
  if (!opened.ok) throw new PivotError('profiles.unreadable', `profiles.json cannot be used: ${opened.detail}.`);
  /** @type {Profile[]} */
  const profiles = Object.values(opened.envelope.body.profiles ?? {});
  return profiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

/**
 * A person's settings (theme, column widths), kept on their profile so they follow them to any
 * machine. Re-reads the file first, like createProfile, and merges `patch` into the stored prefs.
 * @param {Dir} handle @param {string} profileId @param {Record<string, any>} patch @param {Clock} clock
 * @returns {Promise<Profile>}
 */
export async function updateProfilePrefs(handle, profileId, patch, clock) {
  const profiles = await readProfiles(handle);
  const current = profiles.find((p) => p.id === profileId);
  if (!current) throw new PivotError('not-found', 'That profile no longer exists.');
  const updated = { ...current, prefs: { ...(current.prefs ?? {}), ...patch } };
  const body = { profiles: Object.fromEntries(profiles.map((p) => [p.id, p.id === profileId ? updated : p])) };
  await writeWhole(handle, FILES.profiles, serialize(await seal('profiles', body, null, clock.now())));
  return updated;
}

/**
 * Re-reads the file and adds to it, so a profile someone else created a moment ago is kept.
 * @param {Dir} handle @param {string} name @param {Clock} clock @returns {Promise<Profile>}
 */
export async function createProfile(handle, name, clock) {
  const clean = needText(name, 'A profile name');
  const profiles = await readProfiles(handle);
  if (profiles.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
    throw new PivotError('profile.duplicate', `There is already a profile called ${clean}.`);
  }
  const at = clock.now();
  const profile = { id: newId(), name: clean, createdAt: at };
  const body = { profiles: Object.fromEntries([...profiles, profile].map((p) => [p.id, p])) };
  await writeWhole(handle, FILES.profiles, serialize(await seal('profiles', body, null, at)));
  return profile;
}

/** @typedef {{ base: Data, working: Data, loadedStamp: SaveStamp | null }} Session */
/**
 * @typedef {{ data: Data, stamp: SaveStamp, merged: boolean, lastSavedBy: string | null,
 *   conflicts: import('../core/merge.js').Conflict[], supersededFile: string | null,
 *   missingFromDisk: number }} SaveResult
 */

const SAVE_ATTEMPTS = 3;

/**
 * Save the working data. If someone else saved since this session loaded, merge with what
 * they saved (the current save wins conflicts), keep their file under Superseded Saves, and
 * record any overridden edits for their owners to see.
 * @param {Dir} handle @param {Session} session @param {string} profileId @param {Clock} clock
 * @param {{ beforeWrite?: () => Promise<void> }} [hooks] tests only
 * @returns {Promise<SaveResult>}
 */
export async function save(handle, session, profileId, clock, hooks = {}) {
  for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt++) {
    const at = clock.now();
    const act = { by: profileId, at };
    const disk = await readDisk(handle);
    // A data.json that has vanished since loading is not "the other user deleted everything".
    const changedOnDisk = disk.text !== null && !sameStamp(disk.stamp, session.loadedStamp);
    let merged = session.working;
    /** @type {import('../core/merge.js').Conflict[]} */
    let conflicts = [];
    let missingFromDisk = 0;
    if (changedOnDisk) ({ data: merged, conflicts, missingFromDisk } = mergeData(session.base, session.working, disk.data, act));
    merged = assignHazardNumbers(merged);
    if (conflicts.length) merged = recordOverride(merged, act, conflicts);
    const stamp = newStamp(profileId, at);
    const text = serialize(await seal('data', merged, stamp, at));

    if (hooks.beforeWrite) await hooks.beforeWrite();
    const now = await readDisk(handle);
    if (!sameStamp(now.stamp, disk.stamp)) continue;

    let supersededFile = null;
    if (changedOnDisk && disk.stamp) {
      supersededFile = `${FILES.superseded}/${supersededName(disk.stamp)}`;
      await writeWhole(handle, supersededFile, /** @type {string} */ (disk.text));
    }
    await writeWhole(handle, FILES.data, text);
    return { data: merged, stamp, merged: changedOnDisk, lastSavedBy: changedOnDisk ? disk.stamp?.savedBy ?? null : null, conflicts, supersededFile, missingFromDisk };
  }
  throw new PivotError('save.busy', 'Other people kept saving while Pivot was saving. Nothing was saved; save again.');
}

export const BACKUP_KEEP = 72;
export const BACKUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Write a backup of `data` if the newest backup is more than an hour old or there is none,
 * then keep only the newest 72.
 * @param {Dir} handle @param {Data} data @param {Clock} clock @returns {Promise<string | null>}
 */
export async function backupIfDue(handle, data, clock) {
  const names = (await listNames(handle, FILES.backups)).filter((n) => BACKUP_RE.test(n));
  const now = clock.now();
  const newest = names.at(-1);
  if (newest && epochOf(now) - backupTime(newest) <= BACKUP_INTERVAL_MS) return null;
  const name = backupName(now);
  await writeWhole(handle, `${FILES.backups}/${name}`, serialize(await seal('data', data, null, now)));
  const kept = [...new Set([...names, name])].sort();
  for (const old of kept.slice(0, Math.max(0, kept.length - BACKUP_KEEP))) await removeFile(handle, `${FILES.backups}/${old}`);
  return name;
}

/** @param {Dir} handle @returns {Promise<{ name: string, at: string }[]>} newest first */
export async function listBackups(handle) {
  const names = (await listNames(handle, FILES.backups)).filter((n) => BACKUP_RE.test(n));
  return names.reverse().map((name) => ({ name, at: formatAest(backupTime(name)) }));
}

/** @param {Dir} handle @param {string} name */
export async function readBackup(handle, name) {
  const text = await readText(handle, `${FILES.backups}/${name}`);
  if (text === null) throw new PivotError('not-found', `The backup ${name} is no longer there.`);
  return dataFromText(text);
}

/**
 * Replace the stored data with `data` (from a backup or a chosen file). The file it replaces
 * is kept under Superseded Saves first. Restore replaces; it does not merge.
 * @param {Dir} handle @param {Data} data @param {string} profileId @param {Clock} clock
 */
export async function restore(handle, data, profileId, clock) {
  const at = clock.now();
  const current = await readText(handle, FILES.data);
  let supersededFile = null;
  if (current !== null) {
    let stamp = null;
    try { stamp = (await readDisk(handle)).stamp; } catch { /* a damaged file is still kept, under a restore name */ }
    supersededFile = `${FILES.superseded}/${stamp ? supersededName(stamp) : `data-${compactStamp(at)}-restore.json`}`;
    await writeWhole(handle, supersededFile, current);
  }
  const stamp = newStamp(profileId, at);
  await writeWhole(handle, FILES.data, serialize(await seal('data', data, stamp, at)));
  return { data, stamp, supersededFile };
}

/** @param {FileSystemFileHandle} fileHandle @param {string} text */
export async function writeExport(fileHandle, text) {
  /** @type {FileSystemWritableFileStream | null} */
  let w = null;
  try {
    w = await fileHandle.createWritable();
    await w.write(text);
    await w.close();
  } catch (e) {
    if (w) {
      try { await w.abort(); } catch { /* nothing was committed */ }
    }
    throw new PivotError('export-failed', `${fileHandle.name} could not be written.`, { cause: e instanceof Error ? e.message : String(e) });
  }
}
