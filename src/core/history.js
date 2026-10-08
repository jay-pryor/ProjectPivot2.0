import { newId } from './ids.js';
import { canonicalJson } from './json.js';
import { PivotError } from './errors.js';

/** @typedef {import('./data.js').Data} Data */
/** @typedef {import('./data.js').Rec} Rec */
/** @typedef {import('./data.js').Act} Act */

/** Restamped on every edit, and the entry's own `by` and `at` already say who and when. */
export const RESTAMP = Object.freeze(['updatedBy', 'updatedAt']);

/** Fields a history item never copies: a report's documents are the record itself, and large. */
const NOT_IN_HISTORY = Object.freeze({ report: ['markdown', 'html'] });

/** @param {Rec | null} before @param {Rec} after */
export function changeOf(before, after) {
  if (!before) return 'created';
  if (after.status !== before.status) {
    if (after.status === 'deleted') return 'deleted';
    if (after.status === 'retired') return 'retired';
    return 'restored';
  }
  return 'edited';
}

/**
 * @param {string} kind @param {Rec | null} before @param {Rec} after
 * @returns {{ kind: string, id: string, change: string, fields: { field: string, before: any, after: any }[] }}
 */
export function itemOf(kind, before, after) {
  const change = changeOf(before, after);
  const b = before ?? /** @type {Record<string, any>} */ ({});
  const skip = [...RESTAMP, ...(NOT_IN_HISTORY[/** @type {keyof typeof NOT_IN_HISTORY} */ (kind)] ?? [])];
  const names = [...new Set([...Object.keys(b), ...Object.keys(after)])].filter((f) => !skip.includes(f)).sort();
  const everything = change === 'created' || change === 'deleted';
  const fields = [];
  for (const field of names) {
    if (!everything && canonicalJson(b[field]) === canonicalJson(after[field])) continue;
    fields.push({
      field,
      before: field in b ? structuredClone(b[field]) : null,
      after: field in after ? structuredClone(after[field]) : null,
    });
  }
  return { kind, id: after.id, change, fields };
}

/** @param {Data} data @param {any} entry @returns {Data} */
function append(data, entry) {
  return { ...data, history: { ...data.history, [entry.id]: entry } };
}

/**
 * @param {Data} data @param {Act} act @param {string} action what the user did, e.g. "Edit hazard"
 * @param {{ kind: string, before: Rec | null, after: Rec }[]} pairs
 * @param {string[]} platforms every platform the action reaches
 * @returns {Data}
 */
export function recordChange(data, act, action, pairs, platforms) {
  const items = pairs.map((p) => itemOf(p.kind, p.before, p.after));
  if (items.length === 0) return data;
  return append(data, {
    id: newId(), type: 'change', at: act.at, by: act.by, action, items,
    platforms: [...new Set(platforms)].sort(),
    ...(act.workflowId ? { workflow: act.workflowId } : {}),
  });
}

/**
 * Every entry, oldest first. Entries made in the same second keep the order they were made in:
 * the history object keeps insertion order, and the sort is stable.
 * @param {Data} data
 */
export function entries(data) {
  return Object.values(data.history).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/** A record's changes, oldest first, leaving out those deleted from the history. @param {Data} data @param {string} kind @param {string} id */
export function historyOf(data, kind, id) {
  const gone = deletedEntries(data);
  return entries(data).filter((e) => e.type === 'change' && !gone.has(e.id) && e.items.some((/** @type {any} */ i) => (i.kind === kind && i.id === id) || (kind === 'hazard' && hazardOfItem(data, i) === id) || (kind === 'control' && i.kind === 'implementer' && String(i.id).split(':')[1] === id)));
}

/**
 * The hazard a history item belongs to, when it is one of the hazard's per-platform or linked
 * records (an assessment, SFARP, existing control, control status, control link, lifecycle phase
 * link or safety report), so the hazard's History includes it; null for any other item.
 * @param {Data} data @param {{ kind: string, id: string }} item
 */
export function hazardOfItem(data, item) {
  switch (item.kind) {
    case 'assessment':
    case 'sfarp':
    case 'ruling':
    case 'implementationStatus':
    case 'controlOn':
    case 'hazardControl':
    case 'hazardPhase': return String(item.id).split(':')[1];
    case 'safetyReport': return data.records.safetyReport?.[item.id]?.hazardId ?? null;
    default: return null;
  }
}

/**
 * @param {Data} data @param {Act} act the saving user
 * @param {{ kind: string, id: string, reason: string, overriddenBy: string | null, theirs: any, mine: any }[]} conflicts
 */
export function recordOverride(data, act, conflicts) {
  return append(data, {
    id: newId(), type: 'override', at: act.at, by: act.by,
    items: conflicts.map((c) => ({ kind: c.kind, id: c.id, reason: c.reason, overriddenBy: c.overriddenBy, theirs: c.theirs, mine: c.mine })),
  });
}

/**
 * The override entries naming this profile that it has not yet seen, each cut down to that
 * profile's own items.
 * @param {Data} data @param {string} profileId
 */
export function unseenOverrides(data, profileId) {
  const all = entries(data);
  const seen = new Set(all.filter((e) => e.type === 'noticeSeen' && e.by === profileId).map((e) => e.entryId));
  return all
    .filter((e) => e.type === 'override' && !seen.has(e.id))
    .map((e) => ({ ...e, items: e.items.filter((/** @type {any} */ i) => i.overriddenBy === profileId) }))
    .filter((e) => e.items.length > 0);
}

/** @param {Data} data @param {Act} act @param {string[]} entryIds */
export function markNoticesSeen(data, act, entryIds) {
  let d = data;
  for (const entryId of entryIds) d = append(d, { id: newId(), type: 'noticeSeen', at: act.at, by: act.by, entryId });
  return d;
}

/**
 * A remark against one history entry: who, when, and what they said. Kept as an entry of its own,
 * so it merges like the rest of the history and can never be altered afterwards.
 * @param {Data} data @param {Act} act @param {{ entryId: string, text: string }} args
 */
export function addComment(data, act, { entryId, text }) {
  const t = typeof text === 'string' ? text.trim() : '';
  if (!t) throw new PivotError('empty', 'A comment cannot be empty.');
  const target = data.history[entryId];
  if (!target || (target.type !== 'change' && target.type !== 'bundle')) throw new PivotError('not-found', 'That history entry no longer exists.');
  return append(data, { id: newId(), type: 'comment', at: act.at, by: act.by, entryId, text: t });
}

/** The comments on one history entry, oldest first. @param {Data} data @param {string} entryId */
export function commentsOn(data, entryId) {
  return entries(data).filter((e) => e.type === 'comment' && e.entryId === entryId);
}

/**
 * Group changes into one bundle, with an optional comment. The changes stay as they are: the
 * bundle is an entry of its own naming them, so it merges like the rest of the history. A change
 * already in a bundle cannot be bundled again until that bundle is undone.
 * Its What is the title given, if any; otherwise the action its changes share, or Multiple changes.
 * @param {Data} data @param {Act} act @param {{ entryIds: string | string[], text?: string, title?: string }} args
 */
export function createBundle(data, act, { entryIds, text, title }) {
  const ids = [...new Set(Array.isArray(entryIds) ? entryIds : String(entryIds ?? '').split(',').filter(Boolean))];
  if (ids.length < 2) throw new PivotError('bundle', 'Choose at least two changes to bundle.');
  const taken = bundledEntries(data);
  const gone = deletedEntries(data);
  for (const id of ids) {
    if (data.history[id]?.type !== 'change' || gone.has(id)) throw new PivotError('not-found', 'One of those changes no longer exists.');
    if (taken.has(id)) throw new PivotError('bundle', 'One of those changes is already in a bundle. Unbundle it first.');
  }
  const name = typeof title === 'string' ? title.trim() : '';
  const bundle = { id: newId(), type: 'bundle', at: act.at, by: act.by, entryIds: ids, ...(name ? { title: name } : {}) };
  const d = append(data, bundle);
  const t = typeof text === 'string' ? text.trim() : '';
  return t ? addComment(d, act, { entryId: bundle.id, text: t }) : d;
}

/**
 * Give a bundle a new What, or none (blank) to go back to its changes' action. Recorded as an entry
 * of its own, as the history never changes; the latest is the bundle's What.
 * @param {Data} data @param {Act} act @param {{ id: string, title?: string }} args
 */
export function renameBundle(data, act, { id, title }) {
  const b = bundlesOf(data).find((x) => x.id === id);
  if (!b) throw new PivotError('not-found', 'That bundle has been undone or deleted.');
  const name = typeof title === 'string' ? title.trim() : '';
  if (name === (b.title ?? '')) return data;
  return append(data, { id: newId(), type: 'bundleTitle', at: act.at, by: act.by, entryId: id, title: name });
}

/** Undo a bundle: its changes are shown on their own again. Recorded, so nothing is lost. @param {Data} data @param {Act} act @param {{ id: string }} args */
export function unbundle(data, act, { id }) {
  if (!bundlesOf(data).some((b) => b.id === id)) throw new PivotError('not-found', 'That bundle has already been undone.');
  return append(data, { id: newId(), type: 'unbundle', at: act.at, by: act.by, entryId: id });
}

/**
 * The bundles in force, oldest first, each with the changes that are its own. Should two people
 * bundle the same change before seeing each other's work, it belongs to the older bundle.
 * Each has its latest title, if one was given.
 * @param {Data} data @returns {{ id: string, at: string, by: string, entryIds: string[], title?: string }[]}
 */
export function bundlesOf(data) {
  const all = entries(data);
  /** @type {Map<string, string>} */
  const titles = new Map();
  for (const e of all) if (e.type === 'bundleTitle') titles.set(e.entryId, e.title);
  const undone = new Set(all.filter((e) => e.type === 'unbundle').map((e) => e.entryId));
  const gone = deletedEntries(data);
  /** @type {Set<string>} */
  const taken = new Set();
  const out = [];
  for (const b of all) {
    if (b.type !== 'bundle' || undone.has(b.id) || gone.has(b.id)) continue;
    const own = b.entryIds.filter((/** @type {string} */ id) => !taken.has(id) && data.history[id]?.type === 'change' && !gone.has(id));
    for (const id of own) taken.add(id);
    const title = titles.has(b.id) ? titles.get(b.id) : b.title;
    const { title: _given, ...rest } = b;
    if (own.length) out.push({ ...rest, entryIds: own, ...(title ? { title } : {}) });
  }
  return out;
}

/** Every change that is in a bundle in force. @param {Data} data */
function bundledEntries(data) {
  return new Set(bundlesOf(data).flatMap((b) => b.entryIds));
}

/** Every change that reached a platform, oldest first: its own edits, its links, ratings and control decisions. @param {Data} data @param {string} platformId */
export function historyReaching(data, platformId) {
  const gone = deletedEntries(data);
  return entries(data).filter((e) => e.type === 'change' && !gone.has(e.id) && e.platforms.includes(platformId));
}

/**
 * Delete a change, or a bundle with its changes, from the history. Nothing is erased: the
 * deletion is an entry of its own, listed under Deletion history, where it can be restored.
 * @param {Data} data @param {Act} act @param {{ entryId: string }} args
 */
export function deleteHistory(data, act, { entryId }) {
  const e = data.history[entryId];
  const gone = deletedEntries(data);
  if (!e || (e.type !== 'change' && e.type !== 'bundle') || gone.has(entryId)) throw new PivotError('not-found', 'That history entry has already been deleted.');
  const bundle = e.type === 'bundle' ? bundlesOf(data).find((b) => b.id === entryId) : null;
  if (e.type === 'bundle' && !bundle) throw new PivotError('not-found', 'That bundle has been undone.');
  const entryIds = bundle ? [bundle.id, ...bundle.entryIds] : [entryId];
  return append(data, { id: newId(), type: 'historyDeletion', at: act.at, by: act.by, entryIds });
}

/** Undo a deletion from the history: what it deleted shows again. Recorded, as the deletion stays listed. @param {Data} data @param {Act} act @param {{ id: string }} args */
export function restoreHistory(data, act, { id }) {
  const d = historyDeletions(data).find((x) => x.id === id);
  if (!d) throw new PivotError('not-found', 'That deletion no longer exists.');
  if (d.restored) throw new PivotError('not-found', 'That deletion has already been restored.');
  return append(data, { id: newId(), type: 'historyRestore', at: act.at, by: act.by, entryId: id });
}

/**
 * Mark a deletion made on Info as restored (the restore itself is a change of its own), so
 * Deletion history shows who restored it.
 * @param {Data} data @param {Act} act @param {string} entryId the change that deleted it
 */
export function markDeletionRestored(data, act, entryId) {
  return append(data, { id: newId(), type: 'deletionRestore', at: act.at, by: act.by, entryId });
}

/**
 * Every deletion from the history, newest first, with whether (and by whom) it was restored.
 * @param {Data} data
 * @returns {{ id: string, at: string, by: string, entryIds: string[], restored: { at: string, by: string } | null }[]}
 */
export function historyDeletions(data) {
  const all = entries(data);
  /** @type {Map<string, { at: string, by: string }>} */
  const restored = new Map();
  for (const e of all) if (e.type === 'historyRestore' && !restored.has(e.entryId)) restored.set(e.entryId, { at: e.at, by: e.by });
  return all.filter((e) => e.type === 'historyDeletion').map((e) => ({ ...e, restored: restored.get(e.id) ?? null })).reverse();
}

/** Every history entry deleted and not restored. @param {Data} data */
export function deletedEntries(data) {
  const restored = new Set(Object.values(data.history).filter((e) => e.type === 'historyRestore').map((e) => e.entryId));
  return new Set(Object.values(data.history).filter((e) => e.type === 'historyDeletion' && !restored.has(e.id)).flatMap((e) => e.entryIds));
}
