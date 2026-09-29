import { html } from '../html.js';
import { dataAttrs, option, statusTag, bandTag, go, confirmButton, historyBlock } from './common.js';
import { dataTable } from './table.js';
import { live } from '../../core/data.js';
import { hazardLabel } from '../../core/ids.js';
import { hazardRows, hazardDetail } from '../../core/queries.js';
import { BANDS } from '../../core/matrix.js';
import { CONTROL_KINDS } from '../../core/ops/controls.js';

/** @typedef {import('../../core/data.js').Data} Data */

export const STATUS_OPTIONS = /** @type {[string, string][]} */ ([['live', 'Live'], ['retired', 'Retired'], ['deleted', 'Deleted'], ['any', 'Any']]);

/** A status column filter: live by default, "any" for all. @param {(row: any) => string} statusOf */
export const statusColumn = (statusOf) => ({
  key: 'status', label: 'Status', width: 110, value: statusOf,
  render: (/** @type {any} */ row) => statusTag(statusOf(row)) || 'live',
  filter: /** @type {const} */ ('select'), options: STATUS_OPTIONS, defaultFilter: 'live',
  match: (/** @type {any} */ row, /** @type {string} */ v) => v === 'any' || statusOf(row) === v,
});

export function notFound() {
  return html`<p class="muted">That record no longer exists.</p><p>${go('← Hazards', 'hazards')}</p>`;
}

/** @param {any} state @param {Data} data */
export function hazardsView(state, data) {
  const platformOptions = live(data, 'platform').map((p) => /** @type {[string, string]} */ ([p.id, p.name]));
  return html`<div class="head"><h1>Hazards</h1>
    <form data-action="createHazard" class="row"><input name="title" required placeholder="New hazard title" aria-label="New hazard title"><button type="submit">Add hazard</button></form></div>
    ${dataTable(state, {
      id: 'hazards',
      rowKey: (r) => r.hazard.id,
      rows: hazardRows(data),
      empty: 'No hazards yet.',
      columns: [
        { key: 'id', label: 'ID', width: 100, value: (r) => r.hazard.number ?? Infinity, filter: 'text',
          match: (r, v) => hazardLabel(r.hazard).toLowerCase().includes(v.toLowerCase()),
          render: (r) => go(hazardLabel(r.hazard), 'hazard', { id: r.hazard.id }) },
        { key: 'title', label: 'Hazard', width: 320, value: (r) => r.hazard.title, filter: 'text' },
        { key: 'platforms', label: 'Platforms (residual risk)', width: 320, value: (r) => r.platforms.map((p) => p.platform.name).join(', '),
          filter: 'select', options: platformOptions, match: (r, v) => r.platforms.some((p) => p.platform.id === v),
          render: (r) => (r.platforms.length
            ? html`<ul class="plain">${r.platforms.map((p) => html`<li>${p.platform.name} ${bandTag(p.band)}</li>`)}</ul>`
            : html`<span class="muted">On no platform</span>`) },
        { key: 'risk', label: 'Worst residual risk', width: 170, value: (r) => (r.worst ? BANDS.indexOf(r.worst) : null),
          filter: 'select', options: BANDS.map((b) => /** @type {[string, string]} */ ([b, b])),
          // On the platform filtered to, if one is; otherwise on any of its platforms.
          match: (r, v, f) => r.platforms.some((p) => p.band === v && (!f.platforms || p.platform.id === f.platforms)),
          render: (r) => (r.worst ? bandTag(r.worst) : '—') },
        statusColumn((r) => r.hazard.status),
      ],
    })}`;
}

/**
 * Causal factors or consequences as a table: text and actions; the row being edited becomes a form.
 * @param {any} state @param {'CausalFactor' | 'Consequence'} name @param {any[]} items @param {string} hazardId
 */
function textTable(state, name, items, hazardId) {
  const kind = name === 'CausalFactor' ? 'causalFactor' : 'consequence';
  const what = name === 'CausalFactor' ? 'causal factor' : 'consequence';
  const editing = (/** @type {any} */ r) => state.editing?.kind === kind && state.editing.id === r.id;
  return html`${dataTable(state, {
      id: kind,
      rowKey: (r) => r.id,
      rows: items,
      empty: `No ${what}s yet.`,
      columns: [
        { key: 'text', label: name === 'CausalFactor' ? 'Causal factor' : 'Consequence', width: 520, value: (r) => r.text,
          render: (r) => (editing(r)
            ? html`<form data-action="update${name}" ${dataAttrs({ id: r.id })} class="row inline"><input name="text" value="${r.text}" required aria-label="${what}" class="grow"><button type="submit">Save</button><button type="button" ${dataAttrs({ action: 'cancelEdit' })}>Cancel</button></form>`
            : r.text) },
        { key: 'actions', label: '', width: 170, sortable: false,
          render: (r) => (editing(r) ? '' : html`<div class="actions"><button type="button" ${dataAttrs({ action: 'startEdit', kind, id: r.id })}>Edit</button>
            ${confirmButton('Delete…', `Delete this ${what}`, dataAttrs({ action: `delete${name}`, id: r.id }))}</div>`) },
      ],
    })}
    <form data-action="add${name}" ${dataAttrs({ 'hazard-id': hazardId })} class="row"><input name="text" required placeholder="Add a ${what}…" aria-label="Add a ${what}" class="grow"><button type="submit">Add</button></form>`;
}

/** @param {any} state @param {Data} data @param {string} id */
export function hazardView(state, data, id) {
  const d = hazardDetail(data, id);
  if (!d) return notFound();
  const h = d.hazard;
  const linkable = live(data, 'control').filter((c) => !d.controls.some((x) => x.control.id === c.id));
  const actions = h.status === 'live'
    ? html`<button type="button" ${dataAttrs({ action: 'retireHazard', id: h.id })}>Retire</button>
       ${confirmButton('Delete…', 'Delete this hazard, its causal factors, consequences and control links', dataAttrs({ action: 'deleteHazard', id: h.id }))}`
    : h.status === 'retired' ? html`<button type="button" ${dataAttrs({ action: 'restoreRecord', kind: 'hazard', id: h.id })}>Restore</button>` : '';
  return html`<p>${go('← Hazards', 'hazards')}</p>
    <h1>${hazardLabel(h)} ${h.title}${statusTag(h.status)}</h1>
    ${d.platforms.length > 1 ? html`<p class="note">Changes to this hazard reach ${d.platforms.length} platforms: ${d.platforms.map((p) => p.platform.name).join(', ')}.</p>` : ''}
    <form data-action="updateHazard" ${dataAttrs({ id: h.id })} class="stack">
      <label>Title <input name="title" value="${h.title}" required></label>
      <label>Description <textarea name="description" rows="3">${h.description}</textarea></label>
      <div><button type="submit">Apply</button></div></form>
    <div class="actions">${actions}</div>
    <section><h2>Causal factors</h2>${textTable(state, 'CausalFactor', d.causalFactors, h.id)}</section>
    <section><h2>Consequences</h2>${textTable(state, 'Consequence', d.consequences, h.id)}</section>
    <section><h2>Controls</h2>
      ${dataTable(state, {
        id: 'hazardControls',
        rowKey: (c) => c.control.id,
        rows: d.controls,
        empty: 'No controls linked yet.',
        columns: [
          { key: 'control', label: 'Control', width: 320, value: (c) => c.control.title, render: (c) => html`${go(c.control.title, 'control', { id: c.control.id })}${statusTag(c.control.status)}` },
          { key: 'kind', label: 'Kind', width: 170, value: (c) => c.link.kind,
            render: (c) => html`<select name="kind" aria-label="Kind of ${c.control.title}" ${dataAttrs({ change: 'setControlKind', 'hazard-id': h.id, 'control-id': c.control.id })}>${CONTROL_KINDS.map((k) => option(k, k, c.link.kind))}</select>` },
          { key: 'actions', label: '', width: 150, sortable: false,
            render: (c) => confirmButton('Unlink…', 'Unlink, clearing its decisions on every platform', dataAttrs({ action: 'unlinkControl', 'hazard-id': h.id, 'control-id': c.control.id })) },
        ],
      })}
      ${linkable.length
        ? html`<form data-action="linkControl" ${dataAttrs({ 'hazard-id': h.id })} class="row">
            <select name="controlId" aria-label="Control">${linkable.map((c) => option(c.id, c.title))}</select>
            <select name="kind" aria-label="Kind">${CONTROL_KINDS.map((k) => option(k, k))}</select>
            <button type="submit">Link control</button></form>`
        : html`<p class="muted">${live(data, 'control').length ? 'Every control in the library is linked.' : 'The control library is empty.'} Add controls on the Controls page.</p>`}
    </section>
    <section><h2>Platforms</h2>
      ${dataTable(state, {
        id: 'hazardPlatforms',
        rowKey: (p) => p.platform.id,
        rows: d.platforms,
        empty: 'On no platform. Link it from a platform\'s page.',
        columns: [
          { key: 'platform', label: 'Platform', width: 260, value: (p) => p.platform.name, render: (p) => go(p.platform.name, 'assessment', { 'hazard-id': h.id, 'platform-id': p.platform.id }) },
          { key: 'reportId', label: 'Report ID', width: 160, value: (p) => p.reportId },
        ],
      })}
    </section>
    ${historyBlock(state, data, 'hazard', h.id)}`;
}
