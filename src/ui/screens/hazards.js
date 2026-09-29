import { html } from '../html.js';
import { dataAttrs, option, statusTag, bandTag, go, confirmButton, pageTabs, historyTable, historyCount, plus, idTag } from './common.js';
import { dataTable } from './table.js';
import { live } from '../../core/data.js';
import { hazardLabel, controlLabel, platformLabel } from '../../core/ids.js';
import { hazardRows, hazardDetail, ratingOf, bandOf } from '../../core/queries.js';
import { BANDS } from '../../core/matrix.js';
import { CONTROL_KINDS } from '../../core/ops/controls.js';

/** @typedef {import('../../core/data.js').Data} Data */

export const STATUS_OPTIONS = /** @type {[string, string][]} */ ([['live', 'Live'], ['retired', 'Retired'], ['deleted', 'Deleted'], ['any', 'Any']]);

/** A status column filter: live by default, "any" for all. @param {(row: any) => string} statusOf */
export const statusColumn = (statusOf) => ({
  key: 'status', label: 'Status', width: 220, minWidth: 110, value: statusOf,
  render: (/** @type {any} */ row) => statusTag(statusOf(row)) || 'live',
  filter: /** @type {const} */ ('select'), options: STATUS_OPTIONS, defaultFilter: 'live',
  match: (/** @type {any} */ row, /** @type {string} */ v) => v === 'any' || statusOf(row) === v,
});

/** An ID column: sorts by number, new records last; filters on the label. @param {(row: any) => any} recOf @param {(rec: any) => string} label @param {(row: any) => any} [render] */
export const idColumn = (recOf, label, render) => ({
  key: 'id', label: 'ID', width: 200, minWidth: 100, value: (/** @type {any} */ r) => recOf(r).number ?? Infinity, filter: /** @type {const} */ ('text'),
  match: (/** @type {any} */ r, /** @type {string} */ v) => label(recOf(r)).toLowerCase().includes(v.toLowerCase()),
  render: render ?? ((/** @type {any} */ r) => idTag(label(recOf(r)))),
});

/**
 * A page's "new record" line: a + beside the title, which becomes a one-field form.
 * @param {any} state @param {string} kind e.g. newHazard @param {string} action e.g. createHazard
 * @param {string} field @param {string} placeholder @param {any} [extra] more fields
 */
export function newRecord(state, kind, action, field, placeholder, extra = '') {
  if (state.editing?.kind !== kind) return plus({ action: 'startEdit', kind, id: 'new' }, placeholder);
  return html`<form data-action="${action}" class="row inline new-record"><input name="${field}" required placeholder="${placeholder}" aria-label="${placeholder}" autofocus>${extra}<button type="submit">Add</button><button type="button" ${dataAttrs({ action: 'cancelEdit' })}>Cancel</button></form>`;
}

export function notFound() {
  return html`<p class="muted">That record no longer exists.</p><p>${go('← Hazards', 'hazards')}</p>`;
}

/** @param {any} state @param {Data} data */
export function hazardsView(state, data) {
  const platformOptions = live(data, 'platform').map((p) => /** @type {[string, string]} */ ([p.id, p.name]));
  return html`<div class="head"><h1>Hazards</h1>${newRecord(state, 'newHazard', 'createHazard', 'title', 'New hazard title')}</div>
    ${dataTable(state, {
      id: 'hazards',
      rowKey: (r) => r.hazard.id,
      rows: hazardRows(data),
      empty: 'No hazards yet.',
      columns: [
        idColumn((r) => r.hazard, hazardLabel, (r) => go(idTag(hazardLabel(r.hazard)), 'hazard', { id: r.hazard.id })),
        { key: 'title', label: 'Hazard', width: 640, minWidth: 200, value: (r) => r.hazard.title, filter: 'text' },
        { key: 'platforms', label: 'Platforms (residual risk)', width: 640, minWidth: 200, value: (r) => r.platforms.map((p) => p.platform.name).join(', '),
          filter: 'select', options: platformOptions, match: (r, v) => r.platforms.some((p) => p.platform.id === v),
          render: (r) => (r.platforms.length
            ? html`<ul class="plain">${r.platforms.map((p) => html`<li>${p.platform.name} ${bandTag(p.band)}</li>`)}</ul>`
            : html`<span class="muted">On no platform</span>`) },
        { key: 'risk', label: 'Worst residual risk', width: 340, minWidth: 150, value: (r) => (r.worst ? BANDS.indexOf(r.worst) : null),
          filter: 'select', options: BANDS.map((b) => /** @type {[string, string]} */ ([b, b])),
          // On the platform filtered to, if one is; otherwise on any of its platforms.
          match: (r, v, f) => r.platforms.some((p) => p.band === v && (!f.platforms || p.platform.id === f.platforms)),
          render: (r) => (r.worst ? bandTag(r.worst) : '—') },
        statusColumn((r) => r.hazard.status),
      ],
    })}`;
}

/**
 * Causal factors or consequences: a table titled by its header, a + beside the title to add one,
 * and a row's text changed by double-clicking it.
 * @param {any} state @param {'CausalFactor' | 'Consequence'} name @param {any[]} items @param {string} hazardId
 */
function textTable(state, name, items, hazardId) {
  const kind = name === 'CausalFactor' ? 'causalFactor' : 'consequence';
  const what = name === 'CausalFactor' ? 'causal factor' : 'consequence';
  const editing = (/** @type {any} */ r) => state.editing?.kind === kind && state.editing.id === r.id;
  const adding = state.editing?.kind === `new${name}` && state.editing.id === hazardId;
  return html`${dataTable(state, {
      id: kind,
      rowKey: (r) => r.id,
      rows: items,
      empty: `No ${what}s yet.`,
      tools: plus({ action: 'startEdit', kind: `new${name}`, id: hazardId }, `Add a ${what}`),
      columns: [
        { key: 'text', label: name === 'CausalFactor' ? 'Causal factors' : 'Consequences', width: 1120, minWidth: 240, value: (r) => r.text,
          render: (r) => (editing(r)
            ? html`<input class="cell-edit" name="text" value="${r.text}" required aria-label="${what}" autofocus ${dataAttrs({ change: `update${name}`, id: r.id })}>`
            : html`<span class="cell-text" ${dataAttrs({ dblclick: 'startEdit', kind, id: r.id })} title="Double-click to change">${r.text}</span>`) },
        { key: 'actions', label: '', width: 120, minWidth: 80, sortable: false,
          render: (r) => html`<div class="row-actions">${confirmButton('✕', `Delete this ${what}`, dataAttrs({ action: `delete${name}`, id: r.id }))}</div>` },
      ],
    })}
    ${adding ? html`<form data-action="add${name}" ${dataAttrs({ 'hazard-id': hazardId })} class="row inline fill new-row"><input name="text" required placeholder="New ${what}…" aria-label="New ${what}" class="grow" autofocus><button type="submit">Add</button><button type="button" ${dataAttrs({ action: 'cancelEdit' })}>Cancel</button></form>` : ''}`;
}

/** @param {any} state @param {Data} data @param {string} id */
export function hazardView(state, data, id) {
  const d = hazardDetail(data, id);
  if (!d) return notFound();
  const h = d.hazard;
  const tab = state.view?.tab;
  const head = html`<p>${go('← Hazards', 'hazards')}</p>
    <div class="doc-head"><span class="doc-id">${idTag(hazardLabel(h))}</span>${statusTag(h.status)}</div>
    <input class="doc-title" name="title" value="${h.title}" required aria-label="Hazard title" ${dataAttrs({ change: 'updateHazard', id: h.id })}>
    ${pageTabs('hazard', { id: h.id }, tab, historyCount(state, data, 'hazard', h.id))}`;
  if (tab === 'history') return html`${head}${historyTable(state, data, 'hazard', h.id)}`;
  const actions = h.status === 'live'
    ? html`<button type="button" ${dataAttrs({ action: 'retireHazard', id: h.id })}>Retire</button>
       ${confirmButton('Delete…', 'Delete this hazard, its causal factors, consequences and control links', dataAttrs({ action: 'deleteHazard', id: h.id }))}`
    : h.status === 'retired' ? html`<button type="button" ${dataAttrs({ action: 'restoreRecord', kind: 'hazard', id: h.id })}>Restore</button>` : '';
  return html`${head}
    <article class="doc">
      <textarea class="doc-text" name="description" rows="3" placeholder="Add a description…" aria-label="Description" ${dataAttrs({ change: 'updateHazard', id: h.id })}>${h.description}</textarea>
      <section class="block">${textTable(state, 'CausalFactor', d.causalFactors, h.id)}</section>
      <section class="block">${textTable(state, 'Consequence', d.consequences, h.id)}</section>
      <section class="block">
        ${dataTable(state, {
          id: 'hazardControls',
          rowKey: (c) => c.control.id,
          rows: d.controls,
          empty: 'No controls linked yet.',
          tools: plus({ action: 'openPicker', picker: 'linkControls', 'hazard-id': h.id }, 'Link controls'),
          columns: [
            { key: 'control', label: 'Controls', width: 720, minWidth: 200, value: (c) => `${controlLabel(c.control)} ${c.control.title}`,
              render: (c) => html`<span class="id">${idTag(controlLabel(c.control))}</span> ${go(c.control.title, 'control', { id: c.control.id })}${statusTag(c.control.status)}` },
            { key: 'kind', label: 'Kind', width: 300, minWidth: 150, value: (c) => c.link.kind,
              render: (c) => html`<select class="quiet" name="kind" aria-label="Kind of ${c.control.title}" ${dataAttrs({ change: 'setControlKind', 'hazard-id': h.id, 'control-id': c.control.id })}>${CONTROL_KINDS.map((k) => option(k, k, c.link.kind))}</select>` },
            { key: 'actions', label: '', width: 120, minWidth: 80, sortable: false,
              render: (c) => html`<div class="row-actions">${confirmButton('✕', 'Unlink, clearing its decisions on every platform', dataAttrs({ action: 'unlinkControl', 'hazard-id': h.id, 'control-id': c.control.id }))}</div>` },
          ],
        })}
      </section>
      <section class="block">
        ${dataTable(state, {
          id: 'hazardPlatforms',
          rowKey: (p) => p.platform.id,
          rows: d.platforms,
          empty: 'On no platform. Link it from a platform\'s page.',
          columns: [
            { key: 'platform', label: 'Platforms', width: 520, minWidth: 200, value: (p) => p.platform.name,
              render: (p) => html`<span class="id">${idTag(platformLabel(p.platform))}</span> ${go(p.platform.name, 'platform', { id: p.platform.id })}` },
            { key: 'reportId', label: 'Report ID', width: 320, minWidth: 150, value: (p) => p.reportId, render: (p) => idTag(p.reportId) },
            { key: 'risk', label: 'Residual risk', width: 300, minWidth: 150, value: (p) => BANDS.indexOf(bandOf(ratingOf(data, h.id, p.platform.id).residual)),
              render: (p) => bandTag(bandOf(ratingOf(data, h.id, p.platform.id).residual)) },
          ],
        })}
      </section>
    </article>
    <div class="actions page-actions">${actions}</div>`;
}
