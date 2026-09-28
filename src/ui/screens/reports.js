import { html, raw } from '../html.js';
import { dataAttrs, option } from './common.js';
import { all, live } from '../../core/data.js';
import { hasUnsavedRecords } from '../../storage/mirror.js';
import { profileName, when } from '../names.js';

/** @param {any} state @param {import('../../core/data.js').Data} data */
export function reportsView(state, data) {
  const unsaved = state.session ? hasUnsavedRecords(state.session) : false;
  const platforms = live(data, 'platform');
  const reports = all(data, 'report').slice().reverse();
  return html`<div class="head"><h1>Reports</h1><button type="button" ${dataAttrs({ action: 'openDesigner' })}>Open the report designer</button></div>
    <section><h2>Produce a report</h2>
      ${unsaved ? html`<p class="note">Save your changes first: a report is produced from what is stored.</p>` : ''}
      ${platforms.length
        ? html`<form data-action="produceReport" class="row">
            <label>Platform <select name="platformId">${platforms.map((p) => option(p.id, p.name))}</select></label>
            <label>Title <input name="title" placeholder="Platform hazard report"></label>
            <button type="submit" class="primary"${unsaved ? raw(' disabled') : ''}>Produce</button></form>`
        : html`<p class="muted">Add a platform first.</p>`}
      <p class="muted">Sections, wording, layout and the classification marking are set in the report designer, and are shared by everyone using this folder.</p>
    </section>
    <section><h2>Produced reports</h2>
      ${reports.length ? html`<table class="grid"><thead><tr><th>Produced</th><th>Platform</th><th>Title</th><th>Marking</th><th>By</th><th>Download</th></tr></thead><tbody>
        ${reports.map((r) => html`<tr><td>${when(r.producedAt)}</td><td>${r.platformName}</td><td>${r.title}</td><td>${r.classification || '—'}</td>
          <td>${profileName(state, r.producedBy)}</td>
          <td><button type="button" ${dataAttrs({ action: 'downloadReport', id: r.id, format: 'md' })}>.md</button>
              <button type="button" ${dataAttrs({ action: 'downloadReport', id: r.id, format: 'html' })}>.html</button></td></tr>`)}
      </tbody></table>` : html`<p class="muted">No reports yet.</p>`}
    </section>`;
}

/** @param {any} state */
export function backupsView(state) {
  const p = state.pendingRestore;
  return html`<h1>Backups</h1>
    ${p ? html`<div class="msg msg-warning" role="alert"><strong>Restoring ${p.label} replaces the stored data for everyone using this folder.</strong>
        <p>The data it replaces is kept under Superseded Saves.</p>
        ${p.lost.length ? html`<p>These unsaved changes would be lost:</p><ul>${p.lost.map((/** @type {string} */ a) => html`<li>${a}</li>`)}</ul>` : ''}
        <button type="button" class="danger" ${dataAttrs({ action: 'confirmRestore' })}>Restore</button>
        <button type="button" ${dataAttrs({ action: 'cancelRestore' })}>Cancel</button></div>` : ''}
    <p class="muted">A backup is taken when something changes and the newest backup is more than an hour old. The newest 72 are kept.</p>
    <p><button type="button" ${dataAttrs({ action: 'prepareRestoreFromFile' })}>Restore from a file…</button></p>
    ${state.backups.length ? html`<table class="grid"><thead><tr><th>Taken</th><th></th></tr></thead><tbody>
      ${state.backups.map((/** @type {any} */ b) => html`<tr><td>${when(b.at)}</td><td><button type="button" ${dataAttrs({ action: 'prepareRestore', name: b.name })}>Restore…</button></td></tr>`)}
    </tbody></table>` : html`<p class="muted">No backups yet.</p>`}`;
}
