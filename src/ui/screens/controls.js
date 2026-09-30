import { html } from '../html.js';
import { dataAttrs, option, statusTag, stateTag, go, confirmButton, pageTabs, historyTable, historyCount, idTag } from './common.js';
import { dataTable } from './table.js';
import { referencesCard } from './references.js';
import { statusColumn, idColumn, newRecord, notFound } from './hazards.js';
import { get, live } from '../../core/data.js';
import { hazardLabel, controlLabel } from '../../core/ids.js';
import { controlRows, controlUsage, existingUsage, platformsReached, controlOwner, controlOnPlatform } from '../../core/queries.js';
import { CONTROL_STATUSES } from '../../core/ops/assessment.js';
import { rejectionCell } from './platforms.js';
import { CONTROL_TIERS, OWNERS, tierRank } from '../../core/ops/controls.js';

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
    ${pageTabs('control', { id }, tab, historyCount(state, data, 'control', id), reachedPlatforms(data, c).map((p) => /** @type {[string, unknown]} */ ([`p:${p.id}`, p.name])), 'Overview')}`;
  if (tab === 'history') return html`${head}${historyTable(state, data, 'control', id)}`;
  if (tab && tab.startsWith('p:')) return html`${head}${controlPlatformTab(state, data, c, tab.slice(2))}`;
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

/** The platforms a control is used on, by name. @param {Data} data @param {any} c */
function reachedPlatforms(data, c) {
  return platformsReached(data, 'control', c).map((pid) => get(data, 'platform', pid)).filter(Boolean)
    .sort((a, b) => String(a?.name).localeCompare(String(b?.name)));
}

const OWNER_WORD = { us: 'Us', customer: 'Customer', other: 'Other' };

/**
 * A control on one platform: who owns it there, and each hazard there that uses it, with the
 * status of an additional control (changed here as on the platform page).
 * @param {any} state @param {Data} data @param {any} c the control @param {string} platformId
 */
function controlPlatformTab(state, data, c, platformId) {
  const p = get(data, 'platform', platformId);
  if (!p || !platformsReached(data, 'control', c).includes(platformId)) {
    return html`<p class="muted">This control is not used on that platform. ${go('Back to the overview', 'control', { id: c.id })}</p>`;
  }
  const o = controlOwner(data, c.id, platformId);
  const at = { change: 'setControlOwner', 'control-id': c.id, 'platform-id': platformId };
  const rows = controlOnPlatform(data, c.id, platformId).map((u) => ({ ...u, control: c }));
  return html`<article class="doc">
    <p class="doc-meta">Owner on ${p.name}
      <select class="quiet inline-select" name="owner" aria-label="Owner on ${p.name}" ${dataAttrs(at)}>${option('', 'Not set', o?.owner ?? '')}${OWNERS.map((w) => option(w, OWNER_WORD[/** @type {'us'} */ (w)], o?.owner ?? ''))}</select>
      ${o?.owner === 'other' ? html`<input class="quiet" name="ownerName" value="${o.ownerName}" placeholder="Who owns it…" aria-label="Owner's name" ${dataAttrs(at)}>` : ''}</p>
    <section class="block">${dataTable(state, {
      id: 'controlPlatformUses',
      rowKey: (u) => `${u.hazard.id}:${u.role}`,
      rows,
      empty: 'No hazard on this platform uses it.',
      columns: [
        { key: 'hazard', label: `Hazards on ${p.name}`, width: 520, minWidth: 200, value: (u) => `${hazardLabel(u.hazard)} ${u.hazard.title}`,
          render: (u) => html`<span class="id">${idTag(hazardLabel(u.hazard))}</span> ${go(u.hazard.title, 'hazard', { id: u.hazard.id, tab: `p:${platformId}` })}` },
        { key: 'role', label: 'Role', width: 200, minWidth: 110, value: (u) => u.role, render: (u) => (u.role === 'existing' ? 'Existing' : 'Additional') },
        { key: 'kind', label: 'Kind', width: 200, minWidth: 110, value: (u) => u.kind },
        { key: 'state', label: 'Status', width: 240, minWidth: 150, value: (u) => (u.state ? CONTROL_STATUSES.indexOf(u.state) : -1),
          render: (u) => (u.role === 'additional'
            ? html`<select class="quiet state-select state-${u.state}" name="value" aria-label="Status of ${c.title}" ${dataAttrs({ change: 'setControlState', 'hazard-id': u.hazard.id, 'control-id': c.id, 'platform-id': platformId })}>${CONTROL_STATUSES.map((s) => option(s, s, u.state))}</select>`
            : html`<span class="muted">—</span>`) },
        { key: 'reason', label: 'Reason rejected, or who set it', width: 440, minWidth: 200, sortable: false,
          render: (u) => (u.role === 'additional' ? rejectionCell(state, u, u.hazard.id, platformId, p.name) : '') },
      ],
    })}</section>
  </article>`;
}
