import { PivotError } from '../errors.js';
import { newId, ids } from '../ids.js';
import { get, live, created, changed, need, needText } from '../data.js';
import { commit } from '../apply.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Act} Act */
/** @typedef {import('../data.js').Rec} Rec */
/** @typedef {{ name: string, stored: string, size: number, type: string, addedBy: string, addedAt: string }} StoredFile */

/** The kinds of record a reference can support. */
export const TARGET_KINDS = Object.freeze(['hazard', 'causalFactor', 'consequence', 'control', 'platform']);

/** @param {unknown} v */
const text = (v) => String(v ?? '').trim();

/** @param {Rec} r */
function needSomething(r) {
  if (!r.url && !r.path && !r.file) throw new PivotError('reference.empty', 'A reference needs a file, a web link or a network path.');
}

/**
 * @param {Data} data @param {Act} act
 * @param {{ id?: string, title: string, docNumber?: string, revision?: string, note?: string, url?: string, path?: string, file?: StoredFile | null }} args
 */
export function createReference(data, act, { id = newId(), title, docNumber, revision, note, url, path, file = null }) {
  const rec = created(act, id, {
    number: null, title: needText(title, 'A reference title'), docNumber: text(docNumber), revision: text(revision), note: text(note),
    url: text(url), path: text(path), file: file ?? null, pastFiles: [],
  });
  needSomething(rec);
  return commit(data, act, 'Create reference', [{ kind: 'reference', rec }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string, title?: string, docNumber?: string, revision?: string, note?: string, url?: string, path?: string }} args */
export function updateReference(data, act, { id, ...fields }) {
  const r = need(data, 'reference', id);
  /** @type {Record<string, string>} */
  const next = {};
  if (fields.title !== undefined) next.title = needText(fields.title, 'A reference title');
  for (const f of /** @type {const} */ (['docNumber', 'revision', 'note', 'url', 'path'])) if (fields[f] !== undefined) next[f] = text(fields[f]);
  const rec = changed(r, act, next);
  needSomething(rec);
  return commit(data, act, 'Edit reference', [{ kind: 'reference', rec }]);
}

/** A file just stored in the folder becomes the reference's file; the one before it is kept as a past file. @param {Data} data @param {Act} act @param {{ id: string, file: StoredFile }} args */
export function attachFile(data, act, { id, file }) {
  const r = need(data, 'reference', id);
  if (!file || !file.stored) throw new PivotError('reference.file', 'Choose a file to store.');
  const pastFiles = r.file ? [r.file, ...r.pastFiles] : r.pastFiles;
  return commit(data, act, r.file ? 'Replace reference file' : 'Add reference file', [{ kind: 'reference', rec: changed(r, act, { file, pastFiles }) }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string }} args */
export function retireReference(data, act, { id }) {
  const r = need(data, 'reference', id);
  if (r.status === 'retired') return data;
  return commit(data, act, 'Retire reference', [{ kind: 'reference', rec: changed(r, act, { status: 'retired' }) }]);
}

/** @param {Data} data @param {Act} act @param {{ id: string }} args */
export function deleteReference(data, act, { id }) {
  const r = need(data, 'reference', id);
  const n = live(data, 'referenceLink').filter((l) => l.referenceId === id).length;
  if (n) throw new PivotError('reference.in-use', `${r.title} still supports ${n === 1 ? 'a record' : `${n} records`}. Unlink it first.`);
  return commit(data, act, 'Delete reference', [{ kind: 'reference', rec: changed(r, act, { status: 'deleted' }) }]);
}

/** @param {Data} data @param {Act} act @param {{ referenceId: string, targetKind: string, targetId: string }} args */
export function linkReference(data, act, { referenceId, targetKind, targetId }) {
  need(data, 'reference', referenceId);
  if (!TARGET_KINDS.includes(targetKind)) throw new PivotError('reference.target', 'A reference supports hazards, causal factors, consequences, controls and platforms.');
  need(data, targetKind, targetId);
  const id = ids.referenceLink(referenceId, targetKind, targetId);
  const existing = get(data, 'referenceLink', id);
  if (existing && existing.status === 'live') return data;
  const rec = existing ? changed(existing, act, { status: 'live' }) : created(act, id, { referenceId, targetKind, targetId });
  return commit(data, act, 'Link reference', [{ kind: 'referenceLink', rec }]);
}

/** @param {Data} data @param {Act} act @param {{ referenceId: string, targetKind: string, targetId: string }} args */
export function unlinkReference(data, act, { referenceId, targetKind, targetId }) {
  const l = need(data, 'referenceLink', ids.referenceLink(referenceId, targetKind, targetId));
  return commit(data, act, 'Unlink reference', [{ kind: 'referenceLink', rec: changed(l, act, { status: 'deleted' }) }]);
}

/**
 * The live reference links to some records, marked deleted, for an op deleting those records.
 * @param {Data} data @param {Act} act @param {{ kind: string, id: string }[]} targets
 * @returns {{ kind: string, rec: Rec }[]}
 */
export function linksTo(data, act, targets) {
  const keys = new Set(targets.map((t) => `${t.kind}:${t.id}`));
  return live(data, 'referenceLink').filter((l) => keys.has(`${l.targetKind}:${l.targetId}`))
    .map((l) => ({ kind: 'referenceLink', rec: changed(l, act, { status: 'deleted' }) }));
}
