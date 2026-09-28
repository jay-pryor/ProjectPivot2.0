import { canonicalJson } from '../core/json.js';
import { SCHEMA_VERSION } from '../core/data.js';
import { compactStamp, epochOf } from '../core/time.js';

export const MARKER = 'pivot';

/** @typedef {{ savedBy: string, savedAt: string, token: string }} SaveStamp */
/** @typedef {'data' | 'profiles'} FileKind */
/**
 * @typedef {{ pivot: string, schemaVersion: number, kind: FileKind, writtenAt: string,
 *   stamp: SaveStamp | null, integrity: string, body: any }} Envelope
 */

/** @param {Uint8Array} bytes */
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

/** @param {string} text @returns {Promise<string>} */
export async function sha256Hex(text) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return hex(new Uint8Array(digest));
}

/** @param {string} profileId @param {string} at @returns {SaveStamp} */
export function newStamp(profileId, at) {
  return { savedBy: profileId, savedAt: at, token: hex(globalThis.crypto.getRandomValues(new Uint8Array(16))) };
}

/** @param {SaveStamp | null} a @param {SaveStamp | null} b */
export function sameStamp(a, b) {
  if (a === null || b === null) return a === b;
  return a.token === b.token && a.savedAt === b.savedAt && a.savedBy === b.savedBy;
}

/** @param {FileKind} kind @param {any} body @param {SaveStamp | null} stamp @param {string} at @returns {Promise<Envelope>} */
export async function seal(kind, body, stamp, at) {
  return { pivot: MARKER, schemaVersion: SCHEMA_VERSION, kind, writtenAt: at, stamp, integrity: await sha256Hex(canonicalJson(body)), body };
}

/** @param {Envelope} envelope */
export function serialize(envelope) {
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

/**
 * Never throws for bad content: the caller names the file to the user.
 * @param {string} text @param {FileKind} kind
 * @returns {Promise<{ ok: boolean, envelope?: Envelope, reason?: string, detail?: string }>}
 */
export async function openEnvelope(text, kind) {
  let env;
  try {
    env = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: 'unreadable', detail: `it is not readable JSON (${e instanceof Error ? e.message : String(e)})` };
  }
  if (!env || typeof env !== 'object' || env.pivot !== MARKER) {
    return { ok: false, reason: 'not-pivot', detail: 'it is not a Pivot file' };
  }
  if (env.schemaVersion !== SCHEMA_VERSION) {
    const detail = typeof env.schemaVersion === 'number' && env.schemaVersion < SCHEMA_VERSION
      ? `it was written by an earlier Pivot (schema ${env.schemaVersion}), which this version does not read`
      : `it was written by a newer Pivot (schema ${String(env.schemaVersion)}); use that version`;
    return { ok: false, reason: 'wrong-version', detail };
  }
  if (env.kind !== kind) return { ok: false, reason: 'wrong-kind', detail: `it holds ${String(env.kind)}, not ${kind}` };
  if (!('body' in env) || typeof env.integrity !== 'string' || (await sha256Hex(canonicalJson(env.body))) !== env.integrity) {
    return { ok: false, reason: 'integrity', detail: 'it has been changed since Pivot wrote it' };
  }
  return { ok: true, envelope: env };
}

export const BACKUP_RE = /^data-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.json$/;

/** @param {string} at */
export function backupName(at) {
  return `data-${compactStamp(at)}.json`;
}

/** @param {string} name a backup file name @returns {number} epoch ms */
export function backupTime(name) {
  const m = BACKUP_RE.exec(name);
  if (!m) throw new RangeError(`not a backup file name: ${name}`);
  return epochOf(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+10:00`);
}

/** The name another user's save is kept under: their save time and token. @param {SaveStamp} stamp */
export function supersededName(stamp) {
  return `data-${compactStamp(stamp.savedAt)}-${stamp.token.slice(0, 8)}.json`;
}
