import { html } from '../html.js';
import { dataAttrs, statusTag, bandTag, stateTag, go, confirmButton, pageTabs, historyTable, historyCount } from './common.js';
import { dataTable } from './table.js';
import { statusColumn, notFound } from './hazards.js';
import { get, live } from '../../core/data.js';
import { hazardLabel } from '../../core/ids.js';
import { BANDS } from '../../core/matrix.js';
import { filterControls, controlUsage, platformsReached } from '../../core/queries.js';
import { CONTROL_KINDS } from '../../core/ops/controls.js';

/** @typedef {import('../../core/data.js').Data} Data */

const STATES = /** @type {[string, string][]} */ ([['confirmed', 'confirmed'], ['excluded', 'excluded'], ['awaiting', 'awaiting']]);

/** @param {any} state @param {Data} data */
export function controlsView(state, data) {
  return html`<div class="head"><h1>Controls</h1>
    <form data-action="createControl" class="row"><input name="title" required placeholder="New control title" aria-label="New control title"><button type="submit">Add control</button></form></div>
    <p class="muted">One row per control on each hazard and platform it serves, so its state there can be seen and filtered.</p>
    ${dataTable(state, {
      id: 'controls',
      rowKey: (r) => `${r.control.id}:${r.hazard?.id ?? ''}:${r.platform?.id ?? ''}`,
      rows: filterControls(data, { status: 'any' }),
      empty: 'No controls yet.',
      columns: [
        { key: 'control', label: 'Control', width: 220, value: (r) => r.control.title, filter: 'text',
          render: (r) => go(r.control.title, 'control', { id: r.control.id }) },
        { key: 'hazard', label: 'Hazard', width: 220, value: (r) => (r.hazard ? `${hazardLabel(r.hazard)} ${r.hazard.title}` : ''), filter: 'text',
          render: (r) => (r.hazard ? go(`${hazardLabel(r.hazard)} ${r.hazard.title}`, 'hazard', { id: r.hazard.id }) : '—') },
        { key: 'platform', label: 'Platform', width: 140, value: (r) => r.platform?.name ?? '', filter: 'select',
          options: live(data, 'platform').map((p) => /** @type {[string, string]} */ ([p.id, p.name])),
          match: (r, v) => r.platform?.id === v, render: (r) => r.platform?.name ?? '—' },
        { key: 'kind', label: 'Kind', width: 120, value: (r) => r.kind ?? '', filter: 'select',
          options: CONTROL_KINDS.map((k) => /** @type {[string, string]} */ ([k, k])), render: (r) => r.kind ?? '—' },
        { key: 'state', label: 'State', width: 120, value: (r) => r.state ?? '', filter: 'select', options: STATES,
          render: (r) => (r.state ? stateTag(r.state) : '—') },
        { key: 'risk', label: 'Residual risk', width: 130, value: (r) => (r.band ? BANDS.indexOf(r.band) : null), filter: 'select',
          options: BANDS.map((b) => /** @type {[string, string]} */ ([b, b])), match: (r, v) => r.band === v,
          render: (r) => (r.band ? bandTag(r.band) : '—') },
        statusColumn((r) => r.control.status),
      ],
    })}`;
}

/** @param {any} state @param {Data} data @param {string} id */
export function controlView(state, data, id) {
  const c = get(data, 'control', id);
  if (!c) return notFound();
  const tab = state.view?.tab;
  const head = html`<p>${go('← Controls', 'controls')}</p>
    <h1>${c.title}${statusTag(c.status)}</h1>
    ${pageTabs('control', { id }, tab, historyCount(state, data, 'control', id))}`;
  if (tab === 'history') return html`${head}${historyTable(state, data, 'control', id)}`;
  const usage = controlUsage(data, id);
  const reach = platformsReached(data, 'control', c).map((pid) => get(data, 'platform', pid)?.name ?? pid);
  const actions = c.status === 'live'
    ? html`<button type="button" ${dataAttrs({ action: 'retireControl', id })}>Retire</button>
       ${usage.length ? '' : confirmButton('Delete…', 'Delete this control', dataAttrs({ action: 'deleteControl', id }))}`
    : c.status === 'retired' ? html`<button type="button" ${dataAttrs({ action: 'restoreRecord', kind: 'control', id })}>Restore</button>` : '';
  return html`${head}
    ${reach.length > 1 ? html`<p class="note">Changes to this control reach ${reach.length} platforms: ${reach.join(', ')}.</p>` : ''}
    <div class="stack fields">
      <label>Title <input name="title" value="${c.title}" required ${dataAttrs({ change: 'updateControl', id })}></label>
      <label>Description <textarea name="description" rows="3" ${dataAttrs({ change: 'updateControl', id })}>${c.description}</textarea></label>
    </div>
    <section>
      ${dataTable(state, {
        id: 'controlUsage',
        rowKey: (u) => u.hazard.id,
        rows: usage,
        empty: 'Not linked to any hazard.',
        columns: [
          { key: 'hazard', label: 'Used by hazards', width: 300, value: (u) => `${hazardLabel(u.hazard)} ${u.hazard.title}`,
            render: (u) => go(`${hazardLabel(u.hazard)} ${u.hazard.title}`, 'hazard', { id: u.hazard.id }) },
          { key: 'kind', label: 'Kind', width: 130, value: (u) => u.kind },
          { key: 'platforms', label: 'Platforms', width: 360, value: (u) => u.platforms.map((p) => p.platform.name).join(', '),
            render: (u) => (u.platforms.length ? u.platforms.map((p) => html`<span class="onplat">${p.platform.name} ${stateTag(p.state)}</span> `) : '—') },
        ],
      })}
    </section>
    <div class="actions page-actions">${actions}</div>`;
}
