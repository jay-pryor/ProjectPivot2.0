import { html, raw } from '../html.js';
import { dataAttrs, option, statusTag, stateTag, go, pageTabs, historyTable, historyCount, idTag, recordMenu, menuItem } from './common.js';
import { sectionRail, stateCounts, glance } from './dashboard.js';
import { optionsMenu, plus } from './common.js';
import { dataTable } from './table.js';
import { referencesCard } from './references.js';
import { statusColumn, idColumn, notFound } from './hazards.js';
import { get, live } from '../../core/data.js';
import { hazardLabel, controlLabel, platformLabel } from '../../core/ids.js';
import { controlRows, controlOrigins, controlUsage, platformsReached, implementedByOf, implementedByText, controlOnPlatform, referencesFor } from '../../core/queries.js';
import { CONTROL_STATUSES } from '../../core/ops/assessment.js';
import { rejectionCell, statusSelect, implementedBySelect, withPlatformImage, platformImage } from './platforms.js';
import { CONTROL_TIERS, CONTROL_KINDS, tierRank } from '../../core/ops/controls.js';

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


/**
 * The control library: every control, C-…, with the hazards it is linked to and the platforms it
 * is on for them.
 * @param {any} state @param {Data} data
 */
export function controlsView(state, data) {
  return html`<div class="head"><h1>Controls</h1>${plus({ action: 'newControl' }, 'New control')}</div>
    ${dataTable(state, {
      id: 'controls',
      rowKey: (r) => r.control.id,
      rows: controlRows(data),
      empty: 'No controls yet.',
      rowAttrs: (r) => ({ dblclick: 'go', view: 'control', id: r.control.id }),
      columns: [
        { ...idColumn((r) => r.control, controlLabel, (r) => go(idTag(controlLabel(r.control)), 'control', { id: r.control.id })), width: 130 },
        { key: 'control', label: 'Control', width: 300, minWidth: 180, value: (r) => r.control.title, filter: 'text',
          render: (r) => go(r.control.title, 'control', { id: r.control.id }) },
        { key: 'origin', label: 'Origin', width: 200, minWidth: 140, filter: 'text', value: (r) => r.control.origin || null, render: (r) => originBox(r.control) },
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
      ]),
    })}${originList(data)}`;
}

/** The suggestions an Origin box offers as you type: every origin already given. @param {Data} data */
function originList(data) {
  return html`<datalist id="control-origins">${controlOrigins(data).map((o) => html`<option value="${o}"></option>`)}</datalist>`;
}

/** Where a control came from: typed freely, suggesting origins already used. @param {any} c @param {string} [cls] */
function originBox(c, cls = 'cell-input') {
  return html`<input class="${cls}" name="origin" list="control-origins" autocomplete="off" placeholder="Add an origin…" aria-label="Origin of ${c.title}" value="${c.origin ?? ''}" ${dataAttrs({ change: 'updateControl', id: c.id })}${c.status === 'deleted' ? raw(' disabled') : ''}>`;
}

/**
 * A control being made: its page as it will be, the title box ready to type in. Everything is a
 * draft until it has a title; giving it one (Enter, or leaving the box) makes the control, with
 * whatever else was filled in, and opens its page. Leaving with no title makes nothing.
 * @param {any} state @param {Data} data
 */
export function newControlView(state, data) {
  const d = state.draftControl;
  if (!d) return html`<p class="muted">Nothing is being made. ${go('Back to Controls', 'controls')}</p>`;
  const set = (/** @type {string} */ field) => ({ change: 'setControlDraft', field });
  return html`<div class="doc-head"><h1 class="doc-page"><span class="doc-id">${idTag('TBC')}</span> <span class="doc-page-sep" aria-hidden="true">—</span> New control</h1></div>
    <label class="doc-subtitle"><span class="field-label">Control</span>
      <textarea class="doc-title small" name="title" rows="1" required placeholder="Its title…" aria-label="Control title" autofocus ${dataAttrs({ change: 'createDraftControl' })}>${d.title}</textarea></label>
    <p class="muted new-control-hint">Give it a title to make it. Leave this page without one and nothing is made.</p>
    <article class="doc dash">
      <div class="dash-grid two">
        <section class="dash-card" aria-label="Control">
          <label class="field-row"><span class="field-label">Control Tier</span><select class="boxed" name="value" aria-label="Control Tier" ${dataAttrs(set('tier'))}>${option('', 'Not set', d.tier ?? '')}${CONTROL_TIERS.map((t) => option(t, t, d.tier ?? ''))}</select></label>
          <label class="field-row"><span class="field-label">Usual kind</span>${kindPick(d.kind, set('kind'))}</label>
          <label class="field-row"><span class="field-label">Origin</span><input class="boxed" name="value" list="control-origins" autocomplete="off" placeholder="Add an origin…" aria-label="Origin" value="${d.origin}" ${dataAttrs(set('origin'))}>${originList(data)}</label>
          <label class="field-block dash-desc"><span class="field-label">Description</span>
            <textarea class="doc-text boxed" name="value" rows="3" placeholder="Add a description…" ${dataAttrs(set('description'))}>${d.description}</textarea></label>
        </section>
      </div>
    </article>`;
}

/** @param {any} state @param {Data} data @param {string} id */
export function controlView(state, data, id) {
  const c = get(data, 'control', id);
  if (!c) return notFound();
  const tab = state.view?.tab;
  const platformTabs = reachedPlatforms(data, c).map((p) => /** @type {[string, string]} */ ([`p:${p.id}`, p.name]));
  const changes = historyCount(state, data, 'control', id);
  const page = tab === 'history' ? 'History' : platformTabs.find(([t]) => t === tab)?.[1] ?? (tab?.startsWith('p:') ? 'Platform' : 'Overview');
  const usage = controlUsage(data, id);
  const menu = recordMenu('Control options', c.status === 'live'
    ? [menuItem('Retire', { action: 'retireControl', id }),
      usage.length ? '' : menuItem('Delete…', { action: 'askConfirm', run: 'deleteControl', id, title: `Delete ${c.title}?`, text: 'It is used nowhere. It will be deleted.' }, true)]
    : c.status === 'retired' ? [menuItem('Restore', { action: 'restoreRecord', kind: 'control', id })] : []);
  const head = html`<div class="doc-head"><h1 class="doc-page"><span class="doc-id">${idTag(controlLabel(c))}</span> <span class="doc-page-sep" aria-hidden="true">—</span> ${page}</h1>${statusTag(c.status)}${menu}</div>
    <label class="doc-subtitle"><span class="field-label">Control</span>
      <textarea class="doc-title small" name="title" rows="1" required aria-label="Control title" ${dataAttrs({ change: 'updateControl', id })}>${c.title}</textarea></label>
    ${pageTabs('control', { id }, tab, changes, platformTabs, 'Overview')}`;
  if (tab === 'history') return html`${head}${historyTable(state, data, 'control', id)}`;
  if (tab && tab.startsWith('p:')) return html`${head}${controlPlatformTab(state, data, c, tab.slice(2))}`;
  const platforms = reachedPlatforms(data, c);
  const states = usage.flatMap((u) => u.platforms.map((p) => p.state));
  return html`${head}
    <article class="doc dash">
      <div class="dash-grid two">
        <section class="dash-card" aria-label="Control">
          <div class="field-row"><span class="field-label" id="tier-label">Control Tier</span>${tierPick(state, c)}</div>
          <label class="field-row"><span class="field-label">Usual kind</span>${kindPick(c.kind ?? 'preventative', { change: 'updateControl', id })}</label>
          <label class="field-row"><span class="field-label">Origin</span>${originBox(c, 'boxed')}${originList(data)}</label>
          <label class="field-block dash-desc"><span class="field-label">Description</span>
            <textarea class="doc-text boxed" name="description" rows="3" placeholder="Add a description…" ${dataAttrs({ change: 'updateControl', id })}>${c.description}</textarea></label>
        </section>
        <section class="dash-card" aria-label="Use">
          <h3 class="dash-card-h">Use</h3>
          ${glance(usage.length, 'hazard it applies to', 'hazards it applies to')}
          ${glance(platforms.length, 'platform')}
          ${states.length ? html`<p class="glance-line">Across platforms ${stateCounts(states)}</p>` : ''}
        </section>
      </div>
      <h2 class="dash-h">Platforms <span class="count">${platforms.length}</span></h2>
      ${platforms.length ? html`<div class="dash-grid cards">${platforms.map((p) => controlPlatformCard(data, c, /** @type {any} */ (p)))}</div>` : html`<p class="muted">Not used on any platform yet.</p>`}
      ${sectionRail(state, 'control', [
        { key: 'usage', label: 'Applies to', icon: 'analysis', badge: usage.length, body: () => dataTable(state, {
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
        }) },
        { key: 'references', label: 'References', icon: 'references', badge: referencesFor(data, 'control', id).length, body: () => referencesCard(state, data, { kind: 'control', id }) },
      ], 'usage')}
    </article>`;
}

/**
 * A platform the control is used on, as a tile: who implements it there, the hazards there that use it,
 * and the statuses it has there. Clicking it opens the control's tab for that platform.
 * @param {Data} data @param {any} c the control @param {any} p the platform
 */
function controlPlatformCard(data, c, p) {
  const uses = controlOnPlatform(data, c.id, p.id);
  const hazards = new Set(uses.map((u) => u.hazard.id)).size;
  const by = implementedByText(implementedByOf(data, c.id, p.id));
  return html`<button type="button" class="dash-card plat-card" title="Open ${c.title} on ${p.name}" ${dataAttrs({ action: 'go', view: 'control', id: c.id, tab: `p:${p.id}` })}>
    <span class="plat-name"><span class="id">${idTag(platformLabel(p))}</span> ${p.name}</span>
    <span class="plat-sub">Implemented by on this platform</span>
    <span>${by || html`<span class="muted">Not set</span>`}</span>
    <span class="plat-count"><b>${hazards}</b> hazard${hazards === 1 ? '' : 's'} ${stateCounts(uses.map((u) => u.state))}</span>
    ${p.image ? platformImage(p, 'pcard-image') : ''}
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

/**
 * A control's usual kind, preventative or mitigating: where linking it to a hazard starts. Each
 * hazard's link keeps its own, changed there.
 * @param {string} kind @param {Record<string, unknown>} change the edit it sends
 */
function kindPick(kind, change) {
  return html`<select class="boxed" name="kind" aria-label="Usual kind" title="Linking it to a hazard starts from this; each hazard keeps its own" ${dataAttrs(change)}>${CONTROL_KINDS.map((k) => option(k, k[0].toUpperCase() + k.slice(1), kind))}</select>`;
}

/** The platforms a control is used on, by name. @param {Data} data @param {any} c */
function reachedPlatforms(data, c) {
  return platformsReached(data, 'control', c).map((pid) => get(data, 'platform', pid)).filter(Boolean)
    .sort((a, b) => String(a?.name).localeCompare(String(b?.name)));
}

/**
 * A control on one platform: who implements it there, and each hazard there it is on for, with its
 * status (changed here as on the platform page).
 * @param {any} state @param {Data} data @param {any} c the control @param {string} platformId
 */
function controlPlatformTab(state, data, c, platformId) {
  const p = get(data, 'platform', platformId);
  if (!p || !platformsReached(data, 'control', c).includes(platformId)) {
    return html`<p class="muted">This control is not used on that platform. ${go('Back to the overview', 'control', { id: c.id })}</p>`;
  }
  const rows = controlOnPlatform(data, c.id, platformId).map((u) => ({ ...u, control: c }));
  return html`<article class="doc dash">
    ${withPlatformImage(p, html`<div class="dash-grid two">
      <section class="dash-card" aria-label="Implemented by">
        <h3 class="dash-card-h">Implemented by on ${p.name}</h3>
        <p class="glance-line">${implementedBySelect(data, c, platformId, p.name)}</p>
      </section>
      <section class="dash-card" aria-label="On ${p.name}">
        <h3 class="dash-card-h">On ${p.name}</h3>
        ${glance(rows.length, 'hazard uses it', 'hazards use it', stateCounts(rows.map((u) => u.state)))}
      </section>
    </div>`)}
    <section class="block">${dataTable(state, {
      id: 'controlPlatformUses',
      rowKey: (u) => u.hazard.id,
      rows,
      empty: 'No hazard on this platform uses it.',
      columns: [
        { key: 'hazard', label: `Hazards on ${p.name}`, width: 520, minWidth: 200, value: (u) => `${hazardLabel(u.hazard)} ${u.hazard.title}`,
          render: (u) => html`<span class="id">${idTag(hazardLabel(u.hazard))}</span> ${go(u.hazard.title, 'hazard', { id: u.hazard.id, tab: `p:${platformId}` })}` },
        { key: 'kind', label: 'Kind', width: 200, minWidth: 110, value: (u) => u.kind },
        { key: 'state', label: 'Status', width: 240, minWidth: 150, value: (u) => CONTROL_STATUSES.indexOf(u.state),
          render: (u) => statusSelect(data, { hazardId: u.hazard.id, control: c, platformId, state: u.state }) },
        { key: 'reason', label: 'Reason rejected, or who set it', width: 440, minWidth: 200, sortable: false,
          render: (u) => rejectionCell(state, u, u.hazard.id, platformId, p.name) },
      ],
    })}</section>
  </article>`;
}
