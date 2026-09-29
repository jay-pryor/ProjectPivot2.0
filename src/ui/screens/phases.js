import { html } from '../html.js';
import { dataAttrs, statusTag, confirmButton, plus } from './common.js';
import { dataTable } from './table.js';
import { newRecord } from './hazards.js';
import { listPhases, phaseUsage, phasesOf } from '../../core/queries.js';

/** @typedef {import('../../core/data.js').Data} Data */

/** The managed list of lifecycle phases. @param {any} state @param {Data} data */
export function phasesView(state, data) {
  const renaming = (/** @type {string} */ id) => state.editing?.kind === 'phaseName' && state.editing.id === id;
  return html`<div class="head"><h1>Lifecycle phases</h1>${newRecord(state, 'newPhase', 'createPhase', 'name', 'New phase name')}</div>
    <p class="muted">The stages of a platform's life a hazard can arise in. Each hazard ticks its phases on its page.</p>
    ${dataTable(state, {
      id: 'phases',
      rowKey: (p) => p.id,
      rows: listPhases(data),
      empty: 'No phases yet.',
      columns: [
        { key: 'name', label: 'Phase', width: 520, minWidth: 200, value: (p) => p.name,
          render: (p) => (renaming(p.id)
            ? html`<input class="cell-edit" name="name" value="${p.name}" required aria-label="Phase name" autofocus ${dataAttrs({ change: 'renamePhase', id: p.id })}>`
            : html`<span class="cell-text" ${dataAttrs({ dblclick: 'startEdit', kind: 'phaseName', id: p.id })} title="Double-click to rename">${p.name}</span>`) },
        { key: 'used', label: 'Used by', width: 240, minWidth: 120, value: (p) => phaseUsage(data, p.id).length,
          render: (p) => { const n = phaseUsage(data, p.id).length; return `${n} ${n === 1 ? 'hazard' : 'hazards'}`; } },
        { key: 'status', label: 'Status', width: 200, minWidth: 110, value: (p) => p.status, render: (p) => statusTag(p.status) || 'live' },
        { key: 'actions', label: '', width: 300, minWidth: 160, sortable: false, render: (p) => (p.status === 'live'
          ? html`<div class="row-actions"><button type="button" ${dataAttrs({ action: 'retirePhase', id: p.id })}>Retire</button>${phaseUsage(data, p.id).length ? '' : confirmButton('Delete…', `Delete ${p.name}`, dataAttrs({ action: 'deletePhase', id: p.id }))}</div>`
          : html`<div class="row-actions"><button type="button" ${dataAttrs({ action: 'restoreRecord', kind: 'phase', id: p.id })}>Restore</button></div>`) },
      ],
    })}`;
}

/** A hazard's lifecycle phases as chips, with + to add and ✕ to remove. @param {Data} data @param {any} h the hazard */
export function phaseChips(data, h) {
  const list = phasesOf(data, h.id);
  return html`<div class="phases"><span class="phases-label">Lifecycle phases</span>
    ${list.map(({ phase }) => html`<span class="chip">${phase.name}${statusTag(phase.status)}<button type="button" class="chip-x" ${dataAttrs({ action: 'unlinkPhase', 'hazard-id': h.id, 'phase-id': phase.id })} title="Remove ${phase.name}" aria-label="Remove ${phase.name}">✕</button></span>`)}
    ${list.length ? '' : html`<span class="muted">None yet</span>`}
    ${plus({ action: 'openPicker', picker: 'linkPhases', 'hazard-id': h.id }, 'Add lifecycle phases')}</div>`;
}
