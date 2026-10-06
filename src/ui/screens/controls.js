import { html, raw } from '../html.js';
import { dataAttrs, option, statusTag, stateTag, go, confirmButton, pageTabs, historyTable, historyCount, idTag } from './common.js';
import { sectionRail, stateCounts, glance } from './dashboard.js';
import { optionsMenu, plus } from './common.js';
import { dataTable } from './table.js';
import { referencesCard } from './references.js';
import { statusColumn, idColumn, newRecord, notFound } from './hazards.js';
import { get, live } from '../../core/data.js';
import { hazardLabel, controlLabel, platformLabel } from '../../core/ids.js';
import { controlRows, controlOrigins, controlUsage, existingUsage, platformsReached, controlOwner, controlOnPlatform, ownerText, referencesFor } from '../../core/queries.js';
import { CONTROL_STATUSES } from '../../core/ops/assessment.js';
import { rejectionCell, statusSelect } from './platforms.js';
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


const CONTROL_TABS = /** @type {const} */ ([['additional', 'Additional controls'], ['existing', 'Existing controls']]);

/**
 * The control library, as two sub-tabs: additional controls (proposed for hazards, C-…) first,
 * then existing controls (already in place on platforms, EC-…).
 * @param {any} state @param {Data} data
 */
export function controlsView(state, data) {
  const cat = state.view?.tab === 'existing' ? 'existing' : 'additional';
  const other = cat === 'existing' ? 'additional' : 'existing';
  const word = cat === 'existing' ? 'existing control' : 'additional control';
  const category = html`<input type="hidden" name="category" value="${cat}">`;
  return html`<div class="head"><h1>Controls</h1></div>
    <nav class="tabs">${CONTROL_TABS.map(([t, label]) => html`<button type="button" class="tab${t === cat ? ' on' : ''}" ${dataAttrs({ action: 'go', view: 'controls', tab: t })}>${label}</button>`)}</nav>
    <div class="head sub-head"><h2>${cat === 'existing' ? 'Existing controls' : 'Additional controls'}</h2>${newRecord(state, `new-${cat}-control`, 'createControl', 'title', `New ${word} title`, category)}</div>
    <p class="muted">${cat === 'existing'
      ? 'Controls already in place on a platform. Add them to a hazard on its platform tab, under Existing controls.'
      : 'Controls proposed to reduce a hazard\'s risk further. Link them to a hazard from its Overview; each platform then decides on them.'}</p>
    ${dataTable(state, {
      id: cat === 'existing' ? 'existingControlList' : 'controls',
      rowKey: (r) => r.control.id,
      rows: controlRows(data).filter((r) => (r.control.category === 'existing') === (cat === 'existing')),
      empty: `No ${word}s yet.`,
      rowAttrs: (r) => ({ dblclick: 'go', view: 'control', id: r.control.id }),
      columns: [
        { ...idColumn((r) => r.control, controlLabel, (r) => go(idTag(controlLabel(r.control)), 'control', { id: r.control.id })), width: 130 },
        { key: 'control', label: 'Control', width: 300, minWidth: 180, value: (r) => r.control.title, filter: 'text',
          render: (r) => go(r.control.title, 'control', { id: r.control.id }) },
        ...(cat === 'existing' ? [{ key: 'origin', label: 'Origin', width: 200, minWidth: 140, filter: /** @type {const} */ ('text'),
          value: (/** @type {any} */ r) => r.control.origin || null, render: (/** @type {any} */ r) => originBox(r.control) }] : []),
        { ...tierColumn((r) => r.control), width: 180 },
        { key: 'hazards', label: 'Hazards', width: 290, minWidth: 200, sortable: false, filter: 'text',
          value: (r) => r.hazards.map((/** @type {any} */ h) => `${hazardLabel(h)} ${h.title}`).join(' '),
          render: (r) => (r.hazards.length
            ? html`<ul class="plain">${r.hazards.map((/** @type {any} */ h) => html`<li>${go(`${hazardLabel(h)} ${h.title}`, 'hazard', { id: h.id })}</li>`)}</ul>`
            : html`<span class="muted">None</span>`) },
        { key: 'platforms', label: 'Platforms', width: 240, minWidth: 140, sortable: false, filter: 'select',
          options: live(data, 'platform').map((p) => /** @type {[string, string]} */ ([p.id, p.name])),
          match: (r, v) => r.platforms.some((/** @type {any} */ p) => p.id === v),
          render: (r) => (r.platforms.length
            ? html`<ul class="plain">${r.platforms.map((/** @type {any} */ p) => html`<li>${go(p.name, 'platform', { id: p.id })}</li>`)}</ul>`
            : html`<span class="muted">None</span>`) },
        statusColumn((r) => r.control.status),
      ],
      rowEnd: (r) => optionsMenu(`Options for ${r.control.title}`, [
        html`<button type="button" ${dataAttrs({ action: 'go', view: 'control', id: r.control.id })}>Open</button>`,
        r.control.status === 'live' ? html`<button type="button" ${dataAttrs({ action: 'openPicker', picker: 'controlHazards', 'control-id': r.control.id })}>Link to hazards…</button>` : '',
        r.control.status === 'deleted' ? '' : html`<button type="button" ${dataAttrs({ action: 'copyControlAs', from: r.control.id, category: other })}>Create as ${other} control</button>`,
      ]),
    })}${cat === 'existing' ? originList(data) : ''}`;
}

/** The suggestions an Origin box offers as you type: every origin already given. @param {Data} data */
function originList(data) {
  return html`<datalist id="control-origins">${controlOrigins(data).map((o) => html`<option value="${o}"></option>`)}</datalist>`;
}

/** Where an existing control came from: typed freely, suggesting origins already used. @param {any} c @param {string} [cls] */
function originBox(c, cls = 'cell-input') {
  return html`<input class="${cls}" name="origin" list="control-origins" autocomplete="off" placeholder="Add an origin…" aria-label="Origin of ${c.title}" value="${c.origin ?? ''}" ${dataAttrs({ change: 'updateControl', id: c.id })}${c.status === 'deleted' ? raw(' disabled') : ''}>`;
}

/** @param {any} state @param {Data} data @param {string} id */
export function controlView(state, data, id) {
  const c = get(data, 'control', id);
  if (!c) return notFound();
  const tab = state.view?.tab;
  const platformTabs = reachedPlatforms(data, c).map((p) => /** @type {[string, string]} */ ([`p:${p.id}`, p.name]));
  const changes = historyCount(state, data, 'control', id);
  const page = tab === 'history' ? 'History' : platformTabs.find(([t]) => t === tab)?.[1] ?? (tab?.startsWith('p:') ? 'Platform' : 'Overview');
  const head = html`<div class="doc-head"><h1 class="doc-page"><span class="doc-id">${idTag(controlLabel(c))}</span> <span class="doc-page-sep" aria-hidden="true">—</span> ${page}</h1>${statusTag(c.status)}</div>
    <label class="doc-subtitle"><span class="field-label">${c.category === 'existing' ? 'Existing control' : 'Additional control'}</span>
      <textarea class="doc-title small" name="title" rows="1" required aria-label="Control title" ${dataAttrs({ change: 'updateControl', id })}>${c.title}</textarea></label>
    ${pageTabs('control', { id }, tab, changes, platformTabs, 'Overview')}`;
  if (tab === 'history') return html`${head}${historyTable(state, data, 'control', id)}`;
  if (tab && tab.startsWith('p:')) return html`${head}${controlPlatformTab(state, data, c, tab.slice(2))}`;
  const usage = controlUsage(data, id);
  const existing = existingUsage(data, id);
  const actions = c.status === 'live'
    ? html`<button type="button" ${dataAttrs({ action: 'retireControl', id })}>Retire</button>
       ${usage.length || existing.length ? '' : confirmButton('Delete…', 'Delete this control', dataAttrs({ action: 'deleteControl', id }))}`
    : c.status === 'retired' ? html`<button type="button" ${dataAttrs({ action: 'restoreRecord', kind: 'control', id })}>Restore</button>` : '';
  const platforms = reachedPlatforms(data, c);
  const isExisting = c.category === 'existing';
  const states = usage.flatMap((u) => u.platforms.map((p) => p.state));
  return html`${head}
    <article class="doc dash">
      <div class="dash-grid two">
        <section class="dash-card" aria-label="Control">
          <div class="field-row"><span class="field-label" id="tier-label">Tier</span>${tierPick(state, c)}</div>
          ${isExisting ? html`<label class="field-row"><span class="field-label">Origin</span>${originBox(c, 'boxed')}${originList(data)}</label>` : ''}
          <label class="field-block dash-desc"><span class="field-label">Description</span>
            <textarea class="doc-text boxed" name="description" rows="3" placeholder="Add a description…" ${dataAttrs({ change: 'updateControl', id })}>${c.description}</textarea></label>
        </section>
        <section class="dash-card" aria-label="Use">
          <h3 class="dash-card-h">Use</h3>
          ${isExisting
            ? glance(existing.length, 'hazard on a platform it is in place for', 'hazards on platforms it is in place for')
            : glance(usage.length, 'hazard it applies to', 'hazards it applies to')}
          ${glance(platforms.length, 'platform')}
          ${states.length ? html`<p class="glance-line">Across platforms ${stateCounts(states)}</p>` : ''}
        </section>
      </div>
      <h2 class="dash-h">Platforms <span class="count">${platforms.length}</span></h2>
      ${platforms.length ? html`<div class="dash-grid cards">${platforms.map((p) => controlPlatformCard(data, c, /** @type {any} */ (p)))}</div>` : html`<p class="muted">Not used on any platform yet.</p>`}
      ${sectionRail(state, isExisting ? 'existingControl' : 'control', [
        ...(isExisting ? [] : [{ key: 'usage', label: 'Applies to', icon: 'analysis', badge: usage.length, body: () => dataTable(state, {
          id: 'controlUsage',
          rowKey: (u) => u.hazard.id,
          rows: usage,
          empty: 'Not linked to any hazard yet. Link it with the +.',
          tools: c.status === 'live' ? plus({ action: 'openPicker', picker: 'controlHazards', 'control-id': id }, 'Link to hazards') : '',
          columns: [
            { key: 'hazard', label: 'Applies to', width: 600, minWidth: 200, value: (u) => `${hazardLabel(u.hazard)} ${u.hazard.title}`,
              render: (u) => html`<span class="id">${idTag(hazardLabel(u.hazard))}</span> ${go(u.hazard.title, 'hazard', { id: u.hazard.id })}` },
            { key: 'kind', label: 'Kind', width: 260, minWidth: 130, value: (u) => u.kind },
            { key: 'platforms', label: 'Platforms', width: 720, minWidth: 200, value: (u) => u.platforms.map((p) => p.platform.name).join(', '),
              render: (u) => (u.platforms.length ? u.platforms.map((p) => html`<span class="onplat">${p.platform.name} ${stateTag(p.state)}</span> `) : '—') },
          ],
        }) }]),
        ...(isExisting ? [{ key: 'existing', label: 'In place on', icon: 'existing', badge: existing.length, body: () => dataTable(state, {
          id: 'controlExisting',
          rowKey: (u) => `${u.hazard.id}:${u.platform.id}`,
          rows: existing,
          empty: 'Not in place anywhere yet. Add it with the +.',
          tools: c.status === 'live' ? plus({ action: 'openPicker', picker: 'controlHazards', 'control-id': id }, 'Put in place for hazards') : '',
          columns: [
            { key: 'hazard', label: 'In place on', width: 600, minWidth: 200, value: (u) => `${hazardLabel(u.hazard)} ${u.hazard.title}`,
              render: (u) => html`<span class="id">${idTag(hazardLabel(u.hazard))}</span> ${go(u.hazard.title, 'hazard', { id: u.hazard.id, tab: `p:${u.platform.id}` })}` },
            { key: 'platform', label: 'Platform', width: 360, minWidth: 140, value: (u) => u.platform.name },
            { key: 'kind', label: 'Kind', width: 260, minWidth: 130, value: (u) => u.kind },
          ],
        }) }] : []),
        { key: 'references', label: 'References', icon: 'references', badge: referencesFor(data, 'control', id).length, body: () => referencesCard(state, data, { kind: 'control', id }) },
      ], isExisting ? 'existing' : 'usage')}
    </article>
    <div class="actions page-actions">${actions}</div>`;
}

/**
 * A platform the control is used on, as a tile: who owns it there, the hazards there that use it,
 * and the statuses it has there. Clicking it opens the control's tab for that platform.
 * @param {Data} data @param {any} c the control @param {any} p the platform
 */
function controlPlatformCard(data, c, p) {
  const uses = controlOnPlatform(data, c.id, p.id);
  const hazards = new Set(uses.map((u) => u.hazard.id)).size;
  const owner = ownerText(controlOwner(data, c.id, p.id));
  return html`<button type="button" class="dash-card plat-card" title="Open ${c.title} on ${p.name}" ${dataAttrs({ action: 'go', view: 'control', id: c.id, tab: `p:${p.id}` })}>
    <span class="plat-name"><span class="id">${idTag(platformLabel(p))}</span> ${p.name}</span>
    <span class="plat-sub">Control owner on this platform</span>
    <span>${owner || html`<span class="muted">Not set</span>`}</span>
    <span class="plat-count"><b>${hazards}</b> hazard${hazards === 1 ? '' : 's'} ${stateCounts(uses.map((u) => u.state))}</span>
  </button>`;
}

/**
 * The tier: only the chosen one shows until it is clicked, then every tier slides out to choose
 * from (the chosen one, clicked again, clears it).
 * @param {any} state @param {any} c
 */
function tierPick(state, c) {
  const id = c.id;
  if (!(state.editing?.kind === 'tier' && state.editing.id === id)) {
    return html`<button type="button" class="tier-current${c.tier ? '' : ' unset'}" aria-expanded="false" aria-labelledby="tier-label tier-now" title="Change the tier" ${dataAttrs({ action: 'startEdit', kind: 'tier', id })}><span id="tier-now">${c.tier || 'Not set'}</span><span class="tier-caret" aria-hidden="true">▸</span></button>`;
  }
  return html`<div class="tier-pick open" role="radiogroup" aria-labelledby="tier-label" data-reveal="tier:${id}">${CONTROL_TIERS.map((t, i) => html`<button type="button" role="radio" style="--i: ${i}" aria-checked="${c.tier === t ? 'true' : 'false'}" ${c.tier === t ? html`class="on" title="Click again to clear the tier"` : ''} ${dataAttrs({ action: 'updateControl', id, tier: c.tier === t ? '' : t })}>${t}</button>`)}<button type="button" class="tier-close" aria-label="Keep the tier" title="Keep the tier" ${dataAttrs({ action: 'cancelEdit' })}>✕</button></div>`;
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
  const additional = rows.filter((u) => u.role === 'additional');
  return html`<article class="doc dash">
    <div class="dash-grid two">
      <section class="dash-card" aria-label="Owner">
        <h3 class="dash-card-h">Owner on ${p.name}</h3>
        <p class="glance-line"><select class="quiet inline-select" name="owner" aria-label="Owner on ${p.name}" ${dataAttrs(at)}>${option('', 'Not set', o?.owner ?? '')}${OWNERS.map((w) => option(w, OWNER_WORD[/** @type {'us'} */ (w)], o?.owner ?? ''))}</select>
          ${o?.owner === 'other' ? html`<input class="quiet" name="ownerName" value="${o.ownerName}" placeholder="Who owns it…" aria-label="Owner's name" ${dataAttrs(at)}>` : ''}</p>
      </section>
      <section class="dash-card" aria-label="On ${p.name}">
        <h3 class="dash-card-h">On ${p.name}</h3>
        ${glance(new Set(rows.map((u) => u.hazard.id)).size, 'hazard uses it', 'hazards use it')}
        ${glance(additional.length, 'as an additional control', 'as an additional control', stateCounts(additional.map((u) => u.state)))}
        ${glance(rows.length - additional.length, 'as an existing control', 'as an existing control')}
      </section>
    </div>
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
            ? statusSelect(data, { hazardId: u.hazard.id, control: c, platformId, state: u.state })
            : html`<span class="muted">—</span>`) },
        { key: 'reason', label: 'Reason rejected, or who set it', width: 440, minWidth: 200, sortable: false,
          render: (u) => (u.role === 'additional' ? rejectionCell(state, u, u.hazard.id, platformId, p.name) : '') },
      ],
    })}</section>
  </article>`;
}
