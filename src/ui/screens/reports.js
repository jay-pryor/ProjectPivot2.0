import { html } from '../html.js';
import { dataAttrs, removeButton, removeColumn } from './common.js';
import { dataTable } from './table.js';
import { all } from '../../core/data.js';
import { hasUnsavedRecords } from '../../storage/mirror.js';
import { profileName, when } from '../names.js';

/** @param {any} state @param {import('../../core/data.js').Data} data */
export function reportsView(state, data) {
  const unsaved = state.session ? hasUnsavedRecords(state.session) : false;
  const reports = all(data, 'report').filter((r) => r.status !== 'deleted').reverse();
  return html`<div class="head"><h1>Reports</h1><button type="button" class="primary" ${dataAttrs({ action: 'openDesigner' })}>Open the report designer</button></div>
    <p class="muted">Reports are made in the report designer: choose the platform there, then <strong>Make PDF</strong> or <strong>Make HTML</strong> on its Generate tab. Sections, wording, layout and the classification marking are set there too, and are shared by everyone using this folder.</p>
    ${unsaved ? html`<p class="note">Save your changes first: a report is made from what is stored.</p>` : ''}
    <section><h2>Produced reports</h2>
      ${dataTable(state, {
        id: 'reports',
        rowKey: (r) => r.id,
        rows: reports,
        empty: 'No reports yet.',
        columns: [
          { key: 'produced', label: 'Produced', width: 160, value: (r) => r.producedAt, render: (r) => when(r.producedAt) },
          { key: 'platform', label: 'Platform', width: 180, value: (r) => r.platformName },
          { key: 'title', label: 'Title', width: 320, value: (r) => r.title,
            render: (r) => html`${r.title}${r.review?.state === 'overdue' ? html` <span class="tag review-overdue" title="Produced while ${r.platformName} was overdue for review">Overdue</span>` : ''}` },
          { key: 'marking', label: 'Marking', width: 170, value: (r) => r.classification || '—' },
          { key: 'by', label: 'By', width: 140, value: (r) => profileName(state, r.producedBy) },
          { key: 'download', label: 'Download', width: 150, sortable: false, render: (r) => html`<div class="actions">
            ${r.document ? html`<button type="button" ${dataAttrs({ action: 'downloadReport', id: r.id, format: 'pdf' })}>PDF</button>` : ''}
            <button type="button" ${dataAttrs({ action: 'downloadReport', id: r.id, format: 'html' })}>HTML</button></div>` },
          removeColumn((r) => removeButton(`Delete ${r.title}`, `Delete ${r.title}?`, `The report produced for ${r.platformName} on ${when(r.producedAt)} will be deleted for everyone using this folder.`, { run: 'deleteReport', id: r.id })),
        ],
      })}
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
    ${dataTable(state, {
      id: 'backups',
      rowKey: (b) => b.name,
      rows: state.backups,
      empty: 'No backups yet.',
      columns: [
        { key: 'taken', label: 'Taken', width: 200, value: (b) => b.at, render: (b) => when(b.at) },
        { key: 'restore', label: '', width: 140, sortable: false, render: (b) => html`<button type="button" ${dataAttrs({ action: 'prepareRestore', name: b.name })}>Restore…</button>` },
      ],
    })}`;
}
