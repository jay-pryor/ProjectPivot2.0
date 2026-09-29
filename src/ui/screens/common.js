import { html, raw, esc } from '../html.js';
import { historyOf } from '../../core/history.js';
import { hasUnsaved } from '../../storage/mirror.js';
import { profileName, when } from '../names.js';
import { themeOf } from '../prefs.js';

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
const SECTION = { hazards: 'hazards', hazard: 'hazards', controls: 'controls', control: 'controls', platforms: 'platforms', platform: 'platforms', assessment: 'platforms', reports: 'reports', backups: 'backups' };

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

/** @param {unknown} v */
const show = (v) => (v == null ? '(none)' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** @param {any} state @param {import('../../core/data.js').Data} data @param {string} kind @param {string} id */
export function historyBlock(state, data, kind, id) {
  const list = historyOf(data, kind, id).slice().reverse();
  return html`<details class="history"><summary>History (${list.length})</summary>
    ${list.length ? html`<ol>${list.map((e) => {
      const item = e.items.find((/** @type {any} */ i) => i.kind === kind && i.id === id);
      const fields = item && item.change === 'edited'
        ? html`<ul>${item.fields.map((/** @type {any} */ f) => html`<li>${f.field}: ${show(f.before)} → ${show(f.after)}</li>`)}</ul>`
        : '';
      return html`<li><span class="when">${when(e.at)}</span> ${profileName(state, e.by)}: ${e.action}${fields}</li>`;
    })}</ol>` : html`<p class="muted">No changes recorded.</p>`}
  </details>`;
}
