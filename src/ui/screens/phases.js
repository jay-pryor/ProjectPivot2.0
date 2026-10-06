import { html } from '../html.js';
import { dataAttrs, statusTag, plus, bandTag, optionsMenu } from './common.js';
import { dataTable } from './table.js';
import { newRecord } from './hazards.js';
import { BANDS } from '../../core/matrix.js';
import { listPhases, phaseUsage, phasesOf, phaseStats } from '../../core/queries.js';

/** @typedef {import('../../core/data.js').Data} Data */

/** The Stats page's sub-tabs; Lifecycle phases is the first. */
const STATS_TABS = [['phases', 'Lifecycle phases']];

/**
 * Stats, opened on its Lifecycle phases sub-tab: the managed list of phases, each with what it
 * covers (hazards, platforms, controls, residual risk).
 * @param {any} state @param {Data} data
 */
export function phasesView(state, data) {
  const renaming = (/** @type {string} */ id) => state.editing?.kind === 'phaseName' && state.editing.id === id;
  const stats = new Map(listPhases(data).map((p) => [p.id, phaseStats(data, p.id)]));
  const of = (/** @type {any} */ p) => /** @type {ReturnType<typeof phaseStats>} */ (stats.get(p.id));
  return html`<div class="head"><h1>Stats</h1></div>
    <nav class="tabs">${STATS_TABS.map(([t, label]) => html`<button type="button" class="tab on" ${dataAttrs({ action: 'go', view: 'stats', tab: t })}>${label}</button>`)}</nav>
    <div class="head sub-head"><h2>Lifecycle phases</h2>${newRecord(state, 'newPhase', 'createPhase', 'name', 'New phase name')}</div>
    <p class="muted">The stages of a platform's life a hazard can arise in. Each hazard ticks its phases on its page.</p>
    ${dataTable(state, {
      id: 'phases',
      rowKey: (p) => p.id,
      rows: listPhases(data),
      empty: 'No phases yet.',
      columns: [
        { key: 'name', label: 'Phase', width: 300, minWidth: 160, value: (p) => p.name,
          render: (p) => (renaming(p.id)
            ? html`<input class="cell-edit" name="name" value="${p.name}" required aria-label="Phase name" autofocus ${dataAttrs({ change: 'renamePhase', id: p.id })}>`
            : html`<span class="cell-text" ${dataAttrs({ dblclick: 'startEdit', kind: 'phaseName', id: p.id })} title="Double-click to rename">${p.name}</span>`) },
        { key: 'used', label: 'Hazards', width: 110, minWidth: 90, value: (p) => of(p).hazards },
        { key: 'platforms', label: 'Platforms', width: 120, minWidth: 90, value: (p) => of(p).platforms },
        { key: 'pairs', label: 'Hazards on platforms', width: 170, minWidth: 110, value: (p) => of(p).pairs },
        { key: 'controls', label: 'Additional controls', width: 170, minWidth: 110, value: (p) => of(p).controls },
        { key: 'unrated', label: 'Not fully rated', width: 140, minWidth: 110, value: (p) => of(p).unrated,
          render: (p) => (of(p).unrated ? html`<span class="tag tag-warn">${of(p).unrated}</span>` : '0') },
        { key: 'worst', label: 'Worst residual', width: 160, minWidth: 130, value: (p) => BANDS.indexOf(of(p).worst),
          render: (p) => (of(p).pairs ? bandTag(of(p).worst) : html`<span class="muted">—</span>`) },
        { key: 'status', label: 'Status', width: 110, minWidth: 90, value: (p) => p.status, render: (p) => statusTag(p.status) || 'live' },
      ],
      rowEnd: (p) => optionsMenu(`Options for ${p.name}`, [
          html`<button type="button" ${dataAttrs({ action: 'startEdit', kind: 'phaseName', id: p.id })}>Rename</button>`,
          p.status === 'live'
            ? html`<button type="button" ${dataAttrs({ action: 'retirePhase', id: p.id })}>Retire</button>`
            : html`<button type="button" ${dataAttrs({ action: 'restoreRecord', kind: 'phase', id: p.id })}>Restore</button>`,
          p.status === 'live' && !phaseUsage(data, p.id).length
            ? html`<button type="button" class="danger" ${dataAttrs({ action: 'askConfirm', run: 'deletePhase', id: p.id, title: `Delete ${p.name}?`, text: 'No hazard uses it. It will be deleted.' })}>Delete…</button>`
            : '',
        ]),
    })}`;
}

/** A hazard's lifecycle phases as a numbered card, like its causal factors: + to add, ✕ to remove. @param {Data} data @param {any} h the hazard */
export function phaseCard(data, h) {
  const list = phasesOf(data, h.id);
  return html`<section class="dash-card nl-card" aria-label="Lifecycle phases">
    <h3 class="dash-card-h">Lifecycle phases <span class="count">${list.length}</span>${plus({ action: 'openPicker', picker: 'linkPhases', 'hazard-id': h.id }, 'Add lifecycle phases')}</h3>
    ${list.length ? html`<ol class="nl">${list.map(({ phase }, i) => html`<li class="nl-item"><span class="nl-num">${i + 1}</span><span class="nl-text">${phase.name}${statusTag(phase.status)}</span>
      <span class="row-actions"><button type="button" class="icon-x" title="Remove ${phase.name}" aria-label="Remove ${phase.name}" ${dataAttrs({ action: 'unlinkPhase', 'hazard-id': h.id, 'phase-id': phase.id })}>✕</button></span></li>`)}</ol>`
      : html`<p class="muted nl-empty">No lifecycle phases yet.</p>`}
  </section>`;
}
