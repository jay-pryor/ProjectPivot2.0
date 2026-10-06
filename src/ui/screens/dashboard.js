import { html, raw } from '../html.js';
import { dataAttrs, removeButton, plus } from './common.js';

/** @typedef {{ key: string, label: string, icon: string, badge?: unknown, body: () => unknown }} Section */

/** Small line icons for a section rail, drawn in a 16-unit box with the current colour. */
export const ICONS = {
  reports: '<path d="M4 1.5h6l3 3v10H4z"/><path d="M10 1.5v3h3M6.5 8h4M6.5 10.5h4M6.5 13h2.5"/>',
  existing: '<path d="M8 1.5l5.5 2v4.2c0 3.3-2.3 5.6-5.5 6.8-3.2-1.2-5.5-3.5-5.5-6.8V3.5z"/><path d="M5.5 8l1.8 1.8 3.2-3.4"/>',
  references: '<path d="M2.5 3h4a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 0 6.5 12h-4z"/><path d="M13.5 3h-4A1.5 1.5 0 0 0 8 4.5v9A1.5 1.5 0 0 1 9.5 12h4z"/>',
  initial: '<path d="M8 2l6.5 11.5h-13z"/><path d="M8 6.5v3.2M8 11.6v.2"/>',
  analysis: '<path d="M6.5 4h7M6.5 8h7M6.5 12h7"/><path d="M2 4l1 1 1.6-1.8M2 8l1 1 1.6-1.8M2 12l1 1 1.6-1.8"/>',
  residual: '<path d="M2 12.5a6 6 0 0 1 12 0"/><path d="M8 12.5l-2.8-4"/><path d="M1.5 14.5h13"/>',
  sfarp: '<path d="M8 2v12M4.5 14h7M3 4.5h10"/><path d="M3 4.5l-1.8 4.3a1.9 1.9 0 0 0 3.6 0zM13 4.5l-1.8 4.3a1.9 1.9 0 0 0 3.6 0z"/>',
  acks: '<circle cx="8" cy="8" r="6.2"/><path d="M5.2 8.2l1.9 1.9 3.8-4"/>',
  calendar: '<rect x="2" y="3" width="12" height="11"/><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3"/>',
  controls: '<path d="M8 1.5l5.5 2v4.2c0 3.3-2.3 5.6-5.5 6.8-3.2-1.2-5.5-3.5-5.5-6.8V3.5z"/><path d="M8 5.5v5M5.5 8h5"/>',
};

/** @param {string} name a key of ICONS */
export const icon = (name) => raw(`<svg class="icon" viewBox="0 0 16 16" aria-hidden="true">${ICONS[/** @type {keyof typeof ICONS} */ (name)] ?? ''}</svg>`);

/**
 * A rail of section icons beside one open section. Clicking a section's icon opens it; clicking
 * the open one again closes it. Only the open section is drawn.
 * @param {any} state @param {string} page where the choice is kept, e.g. "ssra"
 * @param {Section[]} sections @param {string} fallback the section open until one is chosen
 */
export function sectionRail(state, page, sections, fallback, title = 'Menu') {
  const chosen = state.sections?.[page];
  const open = sections.find((s) => s.key === (chosen === undefined ? fallback : chosen)) ?? null;
  return html`<div class="rail-layout${open ? '' : ' closed'}">
    <nav class="rail" aria-label="${title}"><h2 class="rail-title">${title}</h2>${sections.map((s) => html`<button type="button" class="rail-item${s === open ? ' on' : ''}" aria-pressed="${s === open ? 'true' : 'false'}" title="${s === open ? `Close ${s.label}` : s.label}" ${dataAttrs({ action: 'showSection', page, section: s.key })}>${icon(s.icon)}<span class="rail-label">${s.label}</span>${s.badge === undefined || s.badge === '' ? '' : html`<span class="rail-badge">${s.badge}</span>`}</button>`)}</nav>
    ${open
      ? html`<section class="rail-panel" data-reveal="${page}:${open.key}" aria-label="${open.label}">${open.body()}</section>`
      : html`<p class="rail-hint muted">Choose a section on the left to open it.</p>`}
  </div>`;
}

/** Control statuses counted, as tags in the order a control moves through them. @param {(string | null | undefined)[]} states */
export function stateCounts(states) {
  const order = ['recommended', 'planned', 'implemented', 'rejected'];
  const shown = order.map((st) => [st, states.filter((x) => x === st).length]).filter(([, n]) => n);
  return shown.length ? html`<span class="glance-tags">${shown.map(([st, n]) => html`<span class="tag state-${st}">${n} ${st}</span> `)}</span>` : '';
}

/** A headline number and what it counts. @param {number} n @param {string} one @param {string} [many] @param {unknown} [extra] */
export function glance(n, one, many = `${one}s`, extra = '') {
  return html`<p class="glance-line"><strong>${n}</strong> ${n === 1 ? one : many}${extra ? html` ${extra}` : ''}</p>`;
}

/** The hazard's description, labelled, edited in place. @param {any} h */
export function descriptionField(h) {
  return html`<label class="field-block dash-desc"><span class="field-label">Description</span>
    <textarea class="doc-text boxed" name="description" rows="2" placeholder="Add a description…" ${dataAttrs({ change: 'updateHazard', id: h.id })}>${h.description}</textarea></label>`;
}

/**
 * Causal factors or consequences as a short numbered list on a card: 1, 2, 3… in the order they
 * were added. A row's text is changed by double-clicking it. On a platform's tab a new causal
 * factor is that platform's, and + also offers the hazard's causal factors from its other
 * platforms, to add here with a click.
 * @param {any} state
 * @param {{ name: 'CausalFactor' | 'Consequence', items: any[], hazardId: string, platformId?: string | null,
 *   suggestions?: { text: string, from: string }[] }} o
 *   platformId: the platform the page is for; suggestions: causal factors on other platforms, not yet here
 */
export function numberedCard(state, { name, items, hazardId, platformId = null, suggestions = [] }) {
  const causal = name === 'CausalFactor';
  const kind = causal ? 'causalFactor' : 'consequence';
  const what = causal ? 'causal factor' : 'consequence';
  const adding = state.editing?.kind === `new${name}` && state.editing.id === hazardId;
  const here = causal && platformId ? html`<input type="hidden" name="platformId" value="${platformId}">` : '';
  return html`<section class="dash-card nl-card" aria-label="${causal ? 'Causal factors' : 'Consequences'}">
    <h3 class="dash-card-h">${causal ? 'Causal factors' : 'Consequences'} <span class="count">${items.length}</span>${plus({ action: 'startEdit', kind: `new${name}`, id: hazardId }, `Add a ${what}`)}</h3>
    ${items.length ? html`<ol class="nl">${items.map((r, i) => {
      const editing = state.editing?.kind === kind && state.editing.id === r.id;
      return html`<li class="nl-item"><span class="nl-num">${i + 1}</span>
        ${editing
          ? html`<input class="cell-edit" name="text" value="${r.text}" required aria-label="${what}" autofocus ${dataAttrs({ change: `update${name}`, id: r.id })}>`
          : html`<span class="cell-text nl-text" ${dataAttrs({ dblclick: 'startEdit', kind, id: r.id })} title="Double-click to change">${r.text}</span>`}
        <span class="row-actions">${removeButton(`Delete ${what} ${i + 1}`, `Delete ${what} ${i + 1}?`, `“${r.text}” will be deleted.`, { run: `delete${name}`, id: r.id })}</span></li>`;
    })}</ol>` : html`<p class="muted nl-empty">No ${what}s yet.</p>`}
    ${adding ? html`<form data-action="add${name}" ${dataAttrs({ 'hazard-id': hazardId })} class="row inline fill new-row"><input name="text" required placeholder="New ${what}…" aria-label="New ${what}" class="grow" autofocus>${here}<button type="submit">Add</button><button type="button" ${dataAttrs({ action: 'cancelEdit' })}>Cancel</button></form>
      ${suggestions.length ? html`<div class="suggest" data-reveal="suggest:${hazardId}:${platformId}"><p class="suggest-h">On this hazard's other platforms</p><ul class="suggest-list">${suggestions.map((x) => html`<li><button type="button" class="suggest-item" title="Add it here" ${dataAttrs({ action: `add${name}`, 'hazard-id': hazardId, 'platform-id': platformId, text: x.text })}><span class="suggest-plus" aria-hidden="true">+</span><span class="suggest-text">${x.text}</span><span class="suggest-from">${x.from}</span></button></li>`)}</ul></div>` : ''}` : ''}
  </section>`;
}

/** What each of a hazard's typed lists on a platform is called. */
const PLATFORM_LISTS = Object.freeze({
  systemElement: { name: 'SystemElement', title: 'System/Element', what: 'system or element' },
  affectedGroup: { name: 'AffectedGroup', title: 'Affected groups', what: 'affected group' },
});

/**
 * A hazard's systems or elements, or its affected groups, on one platform, as a numbered card
 * like its causal factors: + opens a box that suggests what has been typed before, on any hazard
 * or platform; a row is changed by double-clicking it.
 * @param {any} state
 * @param {{ kind: 'systemElement' | 'affectedGroup', items: any[], hazardId: string, platformId: string, entries: string[] }} o
 *   entries: every one already given, the box's suggestions
 */
export function platformListCard(state, { kind, items, hazardId, platformId, entries }) {
  const { name, title, what } = PLATFORM_LISTS[kind];
  const pair = `${hazardId}:${platformId}`;
  const adding = state.editing?.kind === `new${name}` && state.editing.id === pair;
  const list = `${kind}-entries`;
  const suggestions = html`<datalist id="${list}">${entries.map((t) => html`<option value="${t}"></option>`)}</datalist>`;
  return html`<section class="dash-card nl-card" aria-label="${title}">
    <h3 class="dash-card-h">${title} <span class="count">${items.length}</span>${plus({ action: 'startEdit', kind: `new${name}`, id: pair }, `Add a ${what}`)}</h3>
    ${items.length ? html`<ol class="nl">${items.map((r, i) => {
      const editing = state.editing?.kind === kind && state.editing.id === r.id;
      return html`<li class="nl-item"><span class="nl-num">${i + 1}</span>
        ${editing
          ? html`<input class="cell-edit" name="text" value="${r.text}" required list="${list}" autocomplete="off" aria-label="${what}" autofocus ${dataAttrs({ change: `update${name}`, id: r.id })}>`
          : html`<span class="cell-text nl-text" ${dataAttrs({ dblclick: 'startEdit', kind, id: r.id })} title="Double-click to change">${r.text}</span>`}
        <span class="row-actions">${removeButton(`Delete ${what} ${i + 1}`, `Delete ${what} ${i + 1}?`, `“${r.text}” will be deleted.`, { run: `delete${name}`, id: r.id })}</span></li>`;
    })}</ol>` : html`<p class="muted nl-empty">No ${what === 'affected group' ? 'affected groups' : 'systems or elements'} yet.</p>`}
    ${adding ? html`<form data-action="add${name}" ${dataAttrs({ 'hazard-id': hazardId, 'platform-id': platformId })} class="row inline fill new-row"><input name="text" required list="${list}" autocomplete="off" placeholder="New ${what}…" aria-label="New ${what}" class="grow" autofocus><button type="submit">Add</button><button type="button" ${dataAttrs({ action: 'cancelEdit' })}>Cancel</button></form>` : ''}
    ${adding || items.some((r) => state.editing?.kind === kind && state.editing.id === r.id) ? suggestions : ''}
  </section>`;
}
