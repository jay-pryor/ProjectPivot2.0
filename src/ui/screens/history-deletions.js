import { html } from '../html.js';
import { dataAttrs } from './common.js';
import { dataTable } from './table.js';
import { historyDeletions } from '../../core/history.js';
import { infoDeletions, FACET_WORD } from '../../core/ops/facets.js';
import { profileName, recordName, when } from '../names.js';

/** @typedef {import('../../core/data.js').Data} Data */

/**
 * Deletion history, from the ☰ menu: every change or bundle deleted from a history tab, and every
 * facet option or platform group deleted on Info, newest first, with who deleted it. A deletion
 * cannot itself be deleted; Restore brings back what it deleted, and the deletion stays listed,
 * marked with who restored it.
 * @param {any} state @param {Data} data
 */
export function historyDeletionsView(state, data) {
  const fromHistory = historyDeletions(data).map((d) => {
    const bundle = data.history[d.entryIds[0]]?.type === 'bundle' ? data.history[d.entryIds[0]] : null;
    const changes = d.entryIds.map((id) => data.history[id]).filter((e) => e?.type === 'change')
      .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    return { d, bundle, changes, info: null };
  });
  const fromInfo = infoDeletions(data).map((x) => ({ d: { id: x.id, at: x.at, by: x.by, restored: x.restored }, bundle: null, changes: [], info: x }));
  const rows = [...fromHistory, ...fromInfo].sort((a, b) => (a.d.at < b.d.at ? 1 : a.d.at > b.d.at ? -1 : 0));
  /** @param {any} e a change */
  const about = (e) => {
    const i = e.items[0];
    return i ? recordName(i.kind, data.records[i.kind]?.[i.id], data) : '';
  };
  /** @param {any} r */
  const what = (r) => {
    if (r.info) return `${infoWord(r.info)}: ${r.info.name}`;
    const actions = [...new Set(r.changes.map((/** @type {any} */ e) => e.action))];
    if (!r.bundle) return actions[0] ?? '';
    // Its latest What, if one was given, else its changes' action.
    const renamed = Object.values(data.history).filter((e) => e.type === 'bundleTitle' && e.entryId === r.bundle.id).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)).at(-1);
    const title = renamed ? renamed.title : r.bundle.title;
    return `Bundle of ${r.changes.length} changes: ${title || (actions.length === 1 ? actions[0] : 'Multiple changes')}`;
  };
  /** @param {any} r */
  const made = (r) => {
    if (r.info) return `${profileName(state, r.info.createdBy)}, ${when(r.info.createdAt)}`;
    const who = [...new Set(r.changes.map((/** @type {any} */ e) => profileName(state, e.by)))].join(', ');
    const first = r.changes[0] ? when(r.changes[0].at) : '';
    const last = r.changes.at(-1) ? when(r.changes.at(-1).at) : '';
    return `${who}, ${first === last ? first : `${first} – ${last}`}`;
  };
  return html`<div class="head"><h1>Deletion history</h1></div>
    <p class="muted">Changes and bundles deleted from a history tab, and options and platform groups deleted on Info. A deletion stays listed here; Restore brings back what it deleted.</p>
    ${dataTable(state, {
      id: 'historyDeletions',
      rowKey: (r) => r.d.id,
      rows,
      empty: 'Nothing has been deleted.',
      rowClass: (r) => (r.d.restored ? 'restored' : ''),
      columns: [
        { key: 'deleted', label: 'Deleted', width: 180, minWidth: 150, value: (r) => r.d.at, render: (r) => when(r.d.at) },
        { key: 'by', label: 'Deleted by', width: 160, minWidth: 110, value: (r) => profileName(state, r.d.by), filter: 'text' },
        { key: 'what', label: 'What was deleted', width: 420, minWidth: 200, value: what, filter: 'text',
          render: (r) => (r.info
            ? html`<span class="tag">Info</span> ${what(r)}${infoDetail(r.info) ? html`<div class="muted">${infoDetail(r.info)}</div>` : ''}`
            : html`${r.bundle ? html`<span class="tag bundle-tag">Bundle</span> ` : ''}${what(r)}${r.changes.length === 1 && about(r.changes[0]) ? html`<div class="muted">${about(r.changes[0])}</div>` : ''}`) },
        { key: 'made', label: 'Originally made by', width: 320, minWidth: 180, value: made },
        { key: 'state', label: '', width: 260, minWidth: 180, sortable: false, value: (r) => (r.d.restored ? 'restored' : 'deleted'),
          render: (r) => (r.d.restored
            ? html`<span class="muted">Restored by ${profileName(state, r.d.restored.by)}, ${when(r.d.restored.at)}</span>`
            : r.info
              ? html`<button type="button" ${dataAttrs({ action: 'restoreDeletion', 'entry-id': r.d.id })}>Restore</button>`
              : html`<button type="button" ${dataAttrs({ action: 'restoreHistory', id: r.d.id })}>Restore</button>`) },
      ],
    })}`;
}

/** What an Info deletion was, e.g. "Causal factor", "Platform group". @param {ReturnType<typeof infoDeletions>[number]} x */
function infoWord(x) {
  const w = x.kind === 'platformGroup' ? 'platform group' : FACET_WORD[/** @type {'phase'} */ (x.facet)] ?? 'option';
  return `${w[0].toUpperCase()}${w.slice(1)}`;
}

/** What an Info deletion took with it, e.g. "Also taken off 2 hazards". @param {ReturnType<typeof infoDeletions>[number]} x */
function infoDetail(x) {
  const n = (/** @type {number} */ k, /** @type {string} */ one, /** @type {string} */ many) => (k === 1 ? `1 ${one}` : `${k} ${many}`);
  const parts = [
    x.hazards ? `taken off ${n(x.hazards, 'hazard', 'hazards')}` : '',
    x.kind === 'platformGroup' && x.platforms ? `taken off ${n(x.platforms, 'platform', 'platforms')}` : '',
    x.groups ? (x.kind === 'platformGroup' ? `unassigned from ${n(x.groups, 'option', 'options')}` : `unassigned from ${n(x.groups, 'platform group', 'platform groups')}`) : '',
  ].filter(Boolean);
  return parts.length ? `Also ${parts.join(', ')}.` : '';
}
