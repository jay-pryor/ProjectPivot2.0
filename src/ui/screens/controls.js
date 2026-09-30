import { html } from '../html.js';
import { dataAttrs, option, statusTag, stateTag, go, confirmButton, pageTabs, historyTable, historyCount, idTag } from './common.js';
import { dataTable } from './table.js';
import { referencesCard } from './references.js';
import { statusColumn, idColumn, newRecord, notFound } from './hazards.js';
import { get, live } from '../../core/data.js';
import { hazardLabel, controlLabel } from '../../core/ids.js';
import { controlRows, controlUsage, existingUsage, platformsReached } from '../../core/queries.js';
import { CONTROL_TIERS, tierRank } from '../../core/ops/controls.js';

/** @typedef {import('../../core/data.js').Data} Data */

/** A Tier column: in hierarchy order, filtered by tier or not set. @param {(row: any) => any} controlOf */
export const tierColumn = (controlOf, filter = true) => ({
  key: 'tier', label: 'Tier', width: 260, minWidth: 130, value: (/** @type {any} */ r) => tierRank(controlOf(r)?.tier),
  render: (/** @type {any} */ r) => controlOf(r)?.tier || html`<span class="muted">Not set</span>`,
  ...(filter ? {
    filter: /** @type {const} */ ('select'),
    options: /** @type {[string, string][]} */ ([...CONTROL_TIERS.map((t) => [t, t]), ['none', 'Not set']]),
    match: (/** @type {any} */ r, /** @type {string} */ v) => (v === 'none' ? !controlOf(r)?.tier : controlOf(r)?.tier === v),
  } : {}),
});


/** @param {any} state @param {Data} data */
export function controlsView(state, data) {
  return html`<div class="head"><h1>Controls</h1>${newRecord(state, 'newControl', 'createControl', 'title', 'New control title')}</div>
    <p class="muted">Each control once, with the hazards and platforms it serves. Open a control for its detail on each platform.</p>
    ${dataTable(state, {
      id: 'controls',
      rowKey: (r) => r.control.id,
      rows: controlRows(data),
      empty: 'No controls yet.',
      columns: [
        idColumn((r) => r.control, controlLabel, (r) => go(idTag(controlLabel(r.control)), 'control', { id: r.control.id })),
        { key: 'control', label: 'Control', width: 440, minWidth: 180, value: (r) => r.control.title, filter: 'text',
          render: (r) => go(r.control.title, 'control', { id: r.control.id }) },
        tierColumn((r) => r.control),
        { key: 'hazards', label: 'Hazards', width: 520, minWidth: 200, sortable: false, filter: 'text',
          value: (r) => r.hazards.map((/** @type {any} */ h) => `${hazardLabel(h)} ${h.title}`).join(' '),
          render: (r) => (r.hazards.length
            ? html`<ul class="plain">${r.hazards.map((/** @type {any} */ h) => html`<li>${go(`${hazardLabel(h)} ${h.title}`, 'hazard', { id: h.id })}</li>`)}</ul>`
            : html`<span class="muted">None</span>`) },
        { key: 'platforms', label: 'Platforms', width: 360, minWidth: 160, sortable: false, filter: 'select',
          options: live(data, 'platform').map((p) => /** @type {[string, string]} */ ([p.id, p.name])),
          match: (r, v) => r.platforms.some((/** @type {any} */ p) => p.id === v),
          render: (r) => (r.platforms.length
            ? html`<ul class="plain">${r.platforms.map((/** @type {any} */ p) => html`<li>${go(p.name, 'platform', { id: p.id })}</li>`)}</ul>`
            : html`<span class="muted">None</span>`) },
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
    <div class="doc-head"><span class="doc-id">${idTag(controlLabel(c))}</span>${statusTag(c.status)}</div>
    <input class="doc-title" name="title" value="${c.title}" required aria-label="Control title" ${dataAttrs({ change: 'updateControl', id })}>
    ${pageTabs('control', { id }, tab, historyCount(state, data, 'control', id))}`;
  if (tab === 'history') return html`${head}${historyTable(state, data, 'control', id)}`;
  const usage = controlUsage(data, id);
  const existing = existingUsage(data, id);
  const reach = platformsReached(data, 'control', c).map((pid) => get(data, 'platform', pid)?.name ?? pid);
  const actions = c.status === 'live'
    ? html`<button type="button" ${dataAttrs({ action: 'retireControl', id })}>Retire</button>
       ${usage.length || existing.length ? '' : confirmButton('Delete…', 'Delete this control', dataAttrs({ action: 'deleteControl', id }))}`
    : c.status === 'retired' ? html`<button type="button" ${dataAttrs({ action: 'restoreRecord', kind: 'control', id })}>Restore</button>` : '';
  return html`${head}
    <article class="doc">
      <p class="doc-meta">${reach.length ? html`Used on ${reach.join(', ')}${reach.length > 1 ? '. Changes here reach all of them.' : '.'}` : 'Not used on any platform yet.'}</p>
      <p class="doc-meta">Tier <select class="quiet inline-select" name="tier" aria-label="Tier" ${dataAttrs({ change: 'updateControl', id })}>${option('', 'Not set', c.tier ?? '')}${CONTROL_TIERS.map((t) => option(t, t, c.tier ?? ''))}</select></p>
      <textarea class="doc-text" name="description" rows="3" placeholder="Add a description…" aria-label="Description" ${dataAttrs({ change: 'updateControl', id })}>${c.description}</textarea>
      <section class="block">
        ${dataTable(state, {
          id: 'controlUsage',
          rowKey: (u) => u.hazard.id,
          rows: usage,
          empty: 'Not linked to any hazard. Link it from a hazard\'s page.',
          columns: [
            { key: 'hazard', label: 'Additional control for hazards', width: 600, minWidth: 200, value: (u) => `${hazardLabel(u.hazard)} ${u.hazard.title}`,
              render: (u) => html`<span class="id">${idTag(hazardLabel(u.hazard))}</span> ${go(u.hazard.title, 'hazard', { id: u.hazard.id })}` },
            { key: 'kind', label: 'Kind', width: 260, minWidth: 130, value: (u) => u.kind },
            { key: 'platforms', label: 'Platforms', width: 720, minWidth: 200, value: (u) => u.platforms.map((p) => p.platform.name).join(', '),
              render: (u) => (u.platforms.length ? u.platforms.map((p) => html`<span class="onplat">${p.platform.name} ${stateTag(p.state)}</span> `) : '—') },
          ],
        })}
      </section>
      <section class="block">
        ${dataTable(state, {
          id: 'controlExisting',
          rowKey: (u) => `${u.hazard.id}:${u.platform.id}`,
          rows: existing,
          empty: 'Not an existing control anywhere.',
          columns: [
            { key: 'hazard', label: 'Existing control on', width: 600, minWidth: 200, value: (u) => `${hazardLabel(u.hazard)} ${u.hazard.title}`,
              render: (u) => html`<span class="id">${idTag(hazardLabel(u.hazard))}</span> ${go(u.hazard.title, 'hazard', { id: u.hazard.id, tab: `p:${u.platform.id}` })}` },
            { key: 'platform', label: 'Platform', width: 360, minWidth: 140, value: (u) => u.platform.name },
            { key: 'kind', label: 'Kind', width: 260, minWidth: 130, value: (u) => u.kind },
          ],
        })}
      </section>
      <section class="block">${referencesCard(state, data, { kind: 'control', id })}</section>
    </article>
    <div class="actions page-actions">${actions}</div>`;
}
