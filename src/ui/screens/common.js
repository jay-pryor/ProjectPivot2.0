import { html, raw, esc } from '../html.js';
import { dataTable } from './table.js';
import { historyOf, commentsOn } from '../../core/history.js';
import { hasUnsaved } from '../../storage/mirror.js';
import { profileName, when } from '../names.js';
import { themeOf } from '../prefs.js';
import { ratingFor } from '../../core/matrix.js';
import { UNNUMBERED } from '../../core/ids.js';

/** @param {Record<string, unknown>} obj kebab-case keys @returns {import('../html.js').Raw} */
export function dataAttrs(obj) {
  return raw(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' '));
}

/** @param {string} value @param {unknown} label @param {string} [current] */
export function option(value, label, current) {
  return html`<option value="${value}"${value === current ? raw(' selected') : ''}>${label}</option>`;
}

/** @param {string} status */
export function statusTag(status) {
  return status === 'live' ? '' : html` <span class="tag tag-${status}">${status}</span>`;
}

/** @param {string} band */
export function bandTag(band) {
  return html`<span class="band band-${band.toLowerCase().replace(/\s+/g, '-')}">${band}</span>`;
}

/** @param {string} state confirmed | excluded | awaiting */
export function stateTag(state) {
  return html`<span class="tag state-${state}">${state}</span>`;
}

/** A link-styled button that navigates. @param {unknown} label @param {string} view @param {Record<string, unknown>} [extra] */
export function go(label, view, extra = {}) {
  return html`<button type="button" class="link" ${dataAttrs({ action: 'go', view, ...extra })}>${label}</button>`;
}

/**
 * A destructive action behind one extra click, with its consequence spelled out.
 * @param {string} summary @param {string} text @param {import('../html.js').Raw} attrs
 */
export function confirmButton(summary, text, attrs) {
  return html`<details class="confirm"><summary>${summary}</summary><button type="button" class="danger" ${attrs}>${text}</button></details>`;
}

/** @param {any} state */
export function messages(state) {
  const m = state.message;
  const warnings = state.warnings ?? [];
  return html`${m ? html`<div class="msg msg-${m.kind}" role="${m.kind === 'error' ? 'alert' : 'status'}">
      <strong>${m.text}</strong>${m.items?.length ? html`<ul>${m.items.map((/** @type {string} */ i) => html`<li>${i}</li>`)}</ul>` : ''}
      <button type="button" class="link" ${dataAttrs({ action: 'dismissMessage' })}>Dismiss</button></div>` : ''}${warnings.map((/** @type {string} */ w) => html`<div class="msg msg-warning" role="status">${w}</div>`)}`;
}

const NAV = [['hazards', 'Hazards'], ['controls', 'Controls'], ['platforms', 'Platforms'], ['reports', 'Reports'], ['backups', 'Backups']];

/** The top-bar section each view belongs to. */
const SECTION = { hazards: 'hazards', hazard: 'hazards', controls: 'controls', control: 'controls', platforms: 'platforms', platform: 'platforms', reports: 'reports', backups: 'backups' };

/** @param {any} state @param {import('../html.js').Raw} body */
export function shell(state, body) {
  const unsaved = state.session ? hasUnsaved(state.session) : false;
  const current = SECTION[/** @type {keyof typeof SECTION} */ (state.view?.name)] ?? '';
  const theme = themeOf(state);
  const other = theme === 'dark' ? 'light' : 'dark';
  // One button says where things stand: Unsaved (click to save), Saving… with a bar, or Saved.
  const save = state.saving
    ? html`<button type="button" class="save saving" ${dataAttrs({ action: 'save' })} disabled>Saving…</button>`
    : unsaved
      ? html`<button type="button" class="save unsaved" ${dataAttrs({ action: 'save' })} title="You have unsaved changes: click to save">Unsaved</button>`
      : html`<button type="button" class="save saved" ${dataAttrs({ action: 'save' })} title="Everything is saved">Saved</button>`;
  return html`<header class="topbar">
    <span class="brand">Pivot</span><span class="folder" title="The data folder">Folder: ${state.folderName}</span>
    <nav>${NAV.map(([view, label]) => html`<button type="button" class="nav${current === view ? ' on' : ''}" ${dataAttrs({ action: 'go', view })}>${label}</button>`)}</nav>
    <span class="spacer"></span>
    ${save}
    <button type="button" class="theme" ${dataAttrs({ action: 'setTheme', theme: other })} title="Switch to ${other} mode" aria-label="Switch to ${other} mode">${theme === 'dark' ? '☀' : '☾'}</button>
    <span class="profile" title="Active profile">${profileName(state, state.profileId)}</span>
    ${state.saving ? html`<div class="save-progress" role="progressbar" aria-label="Saving"><span></span></div>` : ''}
  </header>
  <div class="messages">${messages(state)}</div>
  <main class="view">${body}</main>`;
}

/** A rating reads as its matrix cell and band, e.g. "2C Serious". @param {any} v */
function show(v) {
  if (v == null) return '(none)';
  if (typeof v !== 'object') return String(v);
  if ('consequence' in v && 'likelihood' in v) {
    const r = ratingFor(v.consequence ?? null, v.likelihood ?? null);
    return r.cell ? `${r.cell} ${r.band}` : '(none)';
  }
  return JSON.stringify(v);
}

/**
 * Details, any extra tabs, and History, as tabs of a record's page.
 * @param {string} view @param {Record<string, string>} where e.g. { id } or { 'hazard-id', 'platform-id' }
 * @param {string | undefined} tab @param {number} changes
 * @param {[string, unknown][]} [extra] [tab, label] pairs shown between Details and History
 */
export function pageTabs(view, where, tab, changes, extra = []) {
  const current = tab || 'details';
  const on = (/** @type {string} */ t) => (current === t ? ' on' : '');
  return html`<nav class="tabs">
    <button type="button" class="tab${on('details')}" ${dataAttrs({ action: 'go', view, ...where })}>Details</button>
    ${extra.map(([t, label]) => html`<button type="button" class="tab${on(t)}" ${dataAttrs({ action: 'go', view, ...where, tab: t })}>${label}</button>`)}
    <button type="button" class="tab${on('history')}" ${dataAttrs({ action: 'go', view, ...where, tab: 'history' })}>History (${changes})</button>
  </nav>`;
}

/** A badge for a review that is due soon or overdue; nothing otherwise. @param {string} state from reviewState */
export function reviewTag(state) {
  if (state === 'overdue') return html` <span class="tag review-overdue">Overdue</span>`;
  if (state === 'dueSoon') return html` <span class="tag review-due-soon">Due soon</span>`;
  return '';
}

const CHANGE_WORD = { created: 'Created', deleted: 'Deleted', retired: 'Retired', restored: 'Restored' };

/** One history item's change: an edit as each field's before → after, otherwise a word. @param {any} item */
export function changeDetail(item) {
  return item.change === 'edited'
    ? html`<ul class="plain">${item.fields.map((/** @type {any} */ f) => html`<li><strong>${f.field}</strong>: ${show(f.before)} → ${show(f.after)}</li>`)}</ul>`
    : CHANGE_WORD[/** @type {keyof typeof CHANGE_WORD} */ (item.change)] ?? item.change;
}

/**
 * A record's history as a table: when, who, what, and each field's before and after.
 * @param {any} state @param {import('../../core/data.js').Data} data @param {string} kind @param {string} id
 * @param {any[]} [list] the entries to show (default: that record's own)
 */
export function historyTable(state, data, kind, id, list = historyOf(data, kind, id)) {
  const rows = list.slice().reverse().map((e) => ({ e, item: e.items.find((/** @type {any} */ i) => i.kind === kind && i.id === id) ?? (e.items.length === 1 ? e.items[0] : null) }));
  return dataTable(state, {
    id: 'history',
    rowKey: (r) => r.e.id,
    rows,
    empty: 'No changes recorded.',
    columns: [
      { key: 'when', label: 'When', width: 300, minWidth: 150, value: (r) => r.e.at, render: (r) => when(r.e.at) },
      { key: 'who', label: 'Who', width: 260, minWidth: 100, value: (r) => profileName(state, r.e.by), filter: 'text' },
      { key: 'what', label: 'What', width: 400, minWidth: 140, value: (r) => r.e.action, filter: 'text' },
      { key: 'changes', label: 'Changes', width: 720, minWidth: 240, sortable: false, render: (r) => (r.item ? changeDetail(r.item) : '') },
      { key: 'comments', label: 'Comments', width: 560, minWidth: 200, sortable: false, render: (r) => {
        const comments = commentsOn(data, r.e.id);
        const adding = state.editing?.kind === 'comment' && state.editing.id === r.e.id;
        return html`<ul class="plain comments">${comments.map((c) => html`<li><span class="muted">${profileName(state, c.by)}, ${when(c.at)}:</span> ${c.text}</li>`)}</ul>
          ${adding
            ? html`<form data-action="addComment" ${dataAttrs({ 'entry-id': r.e.id })} class="row inline fill"><input name="text" required placeholder="Add a comment…" aria-label="Comment" class="grow" autofocus><button type="submit">Add</button><button type="button" ${dataAttrs({ action: 'cancelEdit' })}>Cancel</button></form>`
            : plus({ action: 'startEdit', kind: 'comment', id: r.e.id }, 'Add a comment')}`;
      } },
    ],
  });
}

/** A small, quiet + button, drawn rather than typed so it sits dead centre. @param {Record<string, unknown>} attrs @param {string} label what it does, for its tooltip */
export function plus(attrs, label) {
  return html`<button type="button" class="plus" ${dataAttrs(attrs)} title="${label}" aria-label="${label}"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5v9M1.5 6h9"/></svg></button>`;
}

/** A record's ID, or a TBC badge until it is first saved and numbered. @param {string} label */
export function idTag(label) {
  return label === UNNUMBERED ? html`<span class="tag tag-tbc" title="Numbered when first saved">${label}</span>` : label;
}

/** @param {any} state @param {import('../../core/data.js').Data} data @param {string} kind @param {string} id */
export function historyCount(state, data, kind, id) {
  return historyOf(data, kind, id).length;
}
