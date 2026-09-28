import { html, raw, esc } from '../html.js';
import { live } from '../../core/data.js';
import { BANDS } from '../../core/matrix.js';
import { historyOf } from '../../core/history.js';
import { hasUnsaved } from '../../storage/mirror.js';
import { profileName, when } from '../names.js';

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

/** @param {any} state @param {import('../html.js').Raw} body */
export function shell(state, body) {
  const unsaved = state.session ? hasUnsaved(state.session) : false;
  const current = String(state.view?.name ?? '');
  return html`<header class="topbar">
    <span class="brand">Pivot</span><span class="folder">${state.folderName}</span>
    <nav>${NAV.map(([view, label]) => html`<button type="button" class="nav${current.startsWith(view.slice(0, -1)) ? ' on' : ''}" ${dataAttrs({ action: 'go', view })}>${label}</button>`)}</nav>
    <span class="spacer"></span>
    ${unsaved ? html`<span class="unsaved">Unsaved changes</span>` : ''}
    <button type="button" class="primary" ${dataAttrs({ action: 'save' })}${state.busy ? raw(' disabled') : ''}>Save</button>
    <span class="profile" title="Active profile">${profileName(state, state.profileId)}</span>
  </header>
  <div class="messages">${messages(state)}</div>
  <main class="view">${body}</main>`;
}

/** @param {any} state @param {import('../../core/data.js').Data} data @param {'hazards' | 'controls'} list @param {boolean} withControlState */
export function filterBar(state, data, list, withControlState) {
  const f = state.filters[list] ?? {};
  const attrs = (/** @type {string} */ field) => dataAttrs({ change: 'setFilter', list, field });
  return html`<div class="filters">
    <label>Platform <select ${attrs('platformId')}><option value="">Any</option>${live(data, 'platform').map((p) => option(p.id, p.name, f.platformId))}</select></label>
    <label>Residual risk <select ${attrs('band')}><option value="">Any</option>${BANDS.map((b) => option(b, b, f.band))}</select></label>
    <label>Status <select ${attrs('status')}>${[['live', 'Live'], ['retired', 'Retired'], ['deleted', 'Deleted'], ['any', 'Any']].map(([v, l]) => option(v, l, f.status || 'live'))}</select></label>
    ${withControlState ? html`<label>Control state <select ${attrs('controlState')}><option value="">Any</option>${['confirmed', 'excluded', 'awaiting'].map((s) => option(s, s, f.controlState))}</select></label>` : ''}
  </div>`;
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
