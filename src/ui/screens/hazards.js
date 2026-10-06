import { html } from '../html.js';
import { dataAttrs, option, statusTag, bandTag, go, confirmButton, deletePanel, deleteName, pageTabs, historyTable, historyCount, plus, idTag, removeColumn, removeButton } from './common.js';
import { dataTable } from './table.js';
import { referencesCard } from './references.js';
import { tierColumn } from './controls.js';
import { live } from '../../core/data.js';
import { hazardLabel, controlLabel, platformLabel } from '../../core/ids.js';
import { hazardRows, hazardDetail, ratingOf, ratingsOf, bandOf, worseBand, hazardLastReviewed, byNumber, hazardReferences, causalFactorsOn } from '../../core/queries.js';
import { platformTab } from './ssra.js';
import { RECEPTORS, RECEPTOR_WORD } from '../../core/receptors.js';
import { day } from '../names.js';
import { BANDS } from '../../core/matrix.js';
import { CONTROL_KINDS, tierRank } from '../../core/ops/controls.js';
import { analysisArea } from './ssra.js';
import { phaseCard } from './phases.js';
import { numberedCard, sectionRail, descriptionField } from './dashboard.js';

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
  return html`<p class="muted">That record no longer exists.</p>`;
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
      rowAttrs: (r) => ({ dblclick: 'go', view: 'hazard', id: r.hazard.id }),
      columns: [
        idColumn((r) => r.hazard, hazardLabel, (r) => go(idTag(hazardLabel(r.hazard)), 'hazard', { id: r.hazard.id })),
        { key: 'title', label: 'Hazard', width: 640, minWidth: 200, value: (r) => r.hazard.title, filter: 'text' },
        { key: 'platforms', label: 'Platforms', width: 640, minWidth: 200, value: (r) => r.platforms.map((p) => p.platform.name).join(', '),
          filter: 'select', options: platformOptions, match: (r, v) => r.platforms.some((p) => p.platform.id === v),
          render: (r) => (r.platforms.length
            ? html`<ul class="plain">${r.platforms.map((p) => html`<li>${p.platform.name}</li>`)}</ul>`
            : html`<span class="muted">On no platform</span>`) },
        // On the platform filtered to, if one is; otherwise on any of its platforms.
        ...RECEPTORS.map((field) => [`risk${RECEPTOR_WORD[/** @type {'personnel'} */ (field)]}`, field, `worst${RECEPTOR_WORD[/** @type {'personnel'} */ (field)]}`, `Worst residual (${field})`]).map(([key, field, worst, label]) => ({
          key, label, width: 300, minWidth: 150, value: (/** @type {any} */ r) => (r[worst] ? BANDS.indexOf(r[worst]) : null),
          filter: /** @type {const} */ ('select'), options: BANDS.map((b) => /** @type {[string, string]} */ ([b, b])),
          match: (/** @type {any} */ r, /** @type {string} */ v, /** @type {any} */ f) => r.platforms.some((/** @type {any} */ p) => p[field] === v && (!f.platforms || p.platform.id === f.platforms)),
          render: (/** @type {any} */ r) => (r[worst] ? bandTag(r[worst]) : '—'),
        })),
        statusColumn((r) => r.hazard.status),
      ],
    })}`;
}

/** What deleting a hazard still on (retired) platforms also takes. @param {string[]} names */
function retiredNote(names) {
  if (!names.length) return '';
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `It is on retired platform${names.length === 1 ? '' : 's'} ${list}; its risk assessments, controls and safety reports there go too.`;
}

/** @param {any} state @param {Data} data @param {string} id */
export function hazardView(state, data, id) {
  const d = hazardDetail(data, id);
  if (!d) return notFound();
  const h = d.hazard;
  const tab = state.view?.tab;
  const platformTabs = d.platforms.map((p) => {
    const r = ratingsOf(data, h.id, p.platform.id).residual;
    return /** @type {[string, unknown]} */ ([`p:${p.platform.id}`, html`${p.platform.name} ${bandTag(RECEPTORS.map((x) => bandOf(r[/** @type {'personnel'} */ (x)])).reduce(worseBand))}`]);
  });
  const onPlatform = tab?.startsWith('p:') ? d.platforms.find((p) => `p:${p.platform.id}` === tab)?.platform.name ?? 'Platform' : null;
  const page = tab === 'history' ? 'History' : onPlatform ?? 'Overview';
  const head = html`<div class="doc-head"><h1 class="doc-page"><span class="doc-id">${idTag(hazardLabel(h))}</span> <span class="doc-page-sep" aria-hidden="true">—</span> ${page}</h1>${statusTag(h.status)}</div>
    <label class="doc-subtitle"><span class="field-label">Hazard</span>
      <input class="doc-title small" name="title" value="${h.title}" required aria-label="Hazard title" ${dataAttrs({ change: 'updateHazard', id: h.id })}></label>
    ${pageTabs('hazard', { id: h.id }, tab, historyCount(state, data, 'hazard', h.id), platformTabs, 'Overview')}`;
  if (tab === 'history') return html`${head}${historyTable(state, data, 'hazard', h.id)}`;
  if (tab && tab.startsWith('p:')) return html`${head}${platformTab(state, data, h, tab.slice(2))}`;
  const actions = h.status === 'live'
    ? html`<button type="button" ${dataAttrs({ action: 'retireHazard', id: h.id })}>Retire</button>
       ${confirmButton('Delete…', 'Delete this hazard, its causal factors, consequences, control links, lifecycle phases and safety reports', dataAttrs({ action: 'askDelete', kind: 'hazard', id: h.id }))}`
    : h.status === 'retired' ? html`<button type="button" ${dataAttrs({ action: 'restoreRecord', kind: 'hazard', id: h.id })}>Restore</button>` : '';
  return html`${head}
    <article class="doc dash">
      <section class="dash-card dash-summary">${descriptionField(h)}</section>
      <div class="dash-grid two">
        ${numberedCard(state, { name: 'Consequence', items: d.consequences, hazardId: h.id })}
        ${phaseCard(data, h)}
      </div>
      <h2 class="dash-h">Platforms <span class="count">${d.platforms.length}</span>${h.status === 'live' ? plus({ action: 'openPicker', picker: 'linkPlatforms', 'hazard-id': h.id }, 'Link platforms') : ''}</h2>
      ${d.platforms.length ? html`<div class="dash-grid cards">${d.platforms.map((p) => platformCard(data, h, p))}</div>` : html`<p class="muted">On no platform yet.</p>`}
      ${sectionRail(state, 'hazard', [
        { key: 'controls', label: 'Additional controls', icon: 'controls', badge: d.controls.length, body: () => controlsTable(state, h, d) },
        { key: 'references', label: 'References', icon: 'references', badge: hazardReferences(data, h.id).length, body: () => referencesCard(state, data, { kind: 'hazard', id: h.id }) },
      ], 'controls')}
    </article>
    ${state.confirmDelete?.kind === 'hazard' && state.confirmDelete.id === h.id ? deletePanel('hazard', h.id, deleteName('hazard', h), retiredNote(d.platforms.map((p) => p.platform.name))) : html`<div class="actions page-actions">${actions}</div>`}`;
}

/**
 * A platform the hazard is on, as a tile: its residual risk for each receptor and how many causal
 * factors it has there. Clicking it opens the hazard's SSRA on that platform, where they are kept.
 * @param {Data} data @param {any} h @param {any} p a hazardDetail platform row
 */
function platformCard(data, h, p) {
  const residual = ratingsOf(data, h.id, p.platform.id).residual;
  const factors = causalFactorsOn(data, h.id, p.platform.id).length;
  return html`<button type="button" class="dash-card plat-card" title="Open the SSRA for ${p.platform.name}" ${dataAttrs({ action: 'go', view: 'hazard', id: h.id, tab: `p:${p.platform.id}` })}>
    <span class="plat-name"><span class="id">${idTag(platformLabel(p.platform))}</span> ${p.platform.name}</span>
    <span class="plat-sub">Residual risk</span>
    <span class="plat-risk">${RECEPTORS.map((x) => html`<span class="plat-rx"><span class="plat-rx-word">${RECEPTOR_WORD[/** @type {'personnel'} */ (x)]}</span>${residual[/** @type {'personnel'} */ (x)] ? bandTag(bandOf(residual[/** @type {'personnel'} */ (x)])) : html`<span class="muted">Not rated</span>`}</span>`)}</span>
    <span class="plat-count"><b>${factors}</b> causal factor${factors === 1 ? '' : 's'}</span>
  </button>`;
}

/** The hazard's additional controls, with the analysis shared across its platforms. @param {any} state @param {any} h @param {any} d hazardDetail */
function controlsTable(state, h, d) {
  return dataTable(state, {
    id: 'hazardControls',
    rowKey: (c) => c.control.id,
    rows: [...d.controls].sort((a, b) => tierRank(a.control.tier) - tierRank(b.control.tier) || byNumber(a.control, b.control)),
    empty: 'No controls linked yet.',
    tools: plus({ action: 'openPicker', picker: 'linkControls', 'hazard-id': h.id }, 'Link controls'),
    columns: [
      { key: 'control', label: 'Additional controls', width: 720, minWidth: 200, value: (c) => `${controlLabel(c.control)} ${c.control.title}`,
        render: (c) => html`<span class="id">${idTag(controlLabel(c.control))}</span> ${go(c.control.title, 'control', { id: c.control.id })}${statusTag(c.control.status)}` },
      tierColumn((c) => c.control, false),
      { key: 'kind', label: 'Kind', width: 300, minWidth: 150, value: (c) => c.link.kind,
        render: (c) => html`<select class="quiet" name="kind" aria-label="Kind of ${c.control.title}" ${dataAttrs({ change: 'setControlKind', 'hazard-id': h.id, 'control-id': c.control.id })}>${CONTROL_KINDS.map((k) => option(k, k, c.link.kind))}</select>` },
      { key: 'description', label: 'Description', width: 440, minWidth: 160, value: (c) => c.control.description ?? '', render: (c) => html`<span class="muted">${c.control.description ?? ''}</span>` },
      { key: 'recommendation', label: 'Recommendation', width: 520, minWidth: 200, sortable: false, render: (c) => analysisArea('recommendation', c, h.id) },
      { key: 'justification', label: 'Justification', width: 520, minWidth: 200, sortable: false, render: (c) => analysisArea('justification', c, h.id) },
      removeColumn((c) => removeButton(`Unlink ${c.control.title}`, `Unlink ${c.control.title}?`, `This unlinks the control from ${deleteName('hazard', h)} and clears its decisions on every platform.`,
        { run: 'unlinkControl', 'hazard-id': h.id, 'control-id': c.control.id })),
    ],
  });
}
