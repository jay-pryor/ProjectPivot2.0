import { emptyData, validateData, needText } from '../core/data.js';
import { PivotError } from '../core/errors.js';
import { newId } from '../core/ids.js';
import { seal, serialize, openEnvelope } from './envelope.js';
import { readText, writeWhole } from './folder.js';

/** @typedef {import('../core/data.js').Data} Data */
/** @typedef {import('./envelope.js').SaveStamp} SaveStamp */
/** @typedef {import('../core/time.js').Clock} Clock */
/** @typedef {{ id: string, name: string, createdAt: string }} Profile */
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
