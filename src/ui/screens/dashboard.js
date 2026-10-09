import { html, raw } from '../html.js';
import { dataAttrs, removeButton, plus, stateWord } from './common.js';

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
  groups: '<path d="M1.5 2.5h5.5l7 7-4.5 4.5-7-7z"/><circle cx="5" cy="6" r="1.1"/>',
  causal: '<path d="M1.5 8h8.5M7 4.5L10.5 8 7 11.5"/><path d="M14 2.5v11"/>',
  consequence: '<path d="M2 2.5v11"/><path d="M5 8h8.5M10 4.5L13.5 8 10 11.5"/>',
  failure: '<path d="M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z"/>',
  element: '<rect x="2" y="2" width="5" height="5"/><rect x="9" y="2" width="5" height="5"/><rect x="2" y="9" width="5" height="5"/><rect x="9" y="9" width="5" height="5"/>',
  phases: '<circle cx="3" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="13" cy="8" r="1.5"/><path d="M4.5 8h2M9.5 8h2"/>',
  people: '<circle cx="5.5" cy="5" r="2"/><circle cx="11" cy="5.5" r="1.7"/><path d="M1.5 13.5c0-2.4 1.8-4 4-4s4 1.6 4 4M9.5 9.6c.5-.2 1-.3 1.5-.3 1.9 0 3.5 1.4 3.5 3.6"/>',
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
  return shown.length ? html`<span class="glance-tags">${shown.map(([st, n]) => html`<span class="tag state-${st}">${n} ${stateWord(String(st))}</span> `)}</span>` : '';
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
 * platforms, to tick and add with what is typed.
 * @param {any} state
 * @param {{ name: 'CausalFactor' | 'Consequence', items: any[], hazardId: string, platformId?: string | null,
 *   suggestions?: { text: string, from: string }[], grouped?: { text: string, from: string }[] }} o
 *   platformId: the platform the page is for; suggestions: causal factors on other platforms, not yet here;
 *   grouped: suggestions from the platform's groups, shown first
 */
export function numberedCard(state, { name, items, hazardId, platformId = null, suggestions = [], grouped = [] }) {
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
    ${adding ? addForm({ action: `add${name}`, attrs: { 'hazard-id': hazardId }, what, extra: here, heading: 'On this hazard\'s other platforms', suggestions, grouped, reveal: `suggest:${hazardId}:${platformId}` }) : ''}
  </section>`;
}

/** What each of a hazard's typed lists on a platform is called. */
const PLATFORM_LISTS = Object.freeze({
  failureMode: { name: 'FailureMode', title: 'Element failure modes', what: 'element failure mode', none: 'No element failure modes yet.' },
  systemElement: { name: 'SystemElement', title: 'System/Element', what: 'system or element', none: 'No systems or elements yet.' },
  affectedGroup: { name: 'AffectedGroup', title: 'Affected groups', what: 'affected group', none: 'No affected groups yet.' },
});

/**
 * A hazard's element failure modes, systems or elements, or affected groups on one platform, as a numbered card
 * like its causal factors: + opens a box that suggests what has been typed before, on any hazard
 * or platform, and lists those entries to tick and add with it; a row is changed by double-clicking it.
 * @param {any} state
 * @param {{ kind: 'failureMode' | 'systemElement' | 'affectedGroup', items: any[], hazardId: string, platformId: string, entries: string[],
 *   usedOn?: Map<string, string[]>, grouped?: { text: string, from: string }[] }} o
 *   entries: every one already given, the box's suggestions; usedOn: for each (in lower case), the
 *   hazard's other platforms it is on, named beside it and listed first
 */
export function platformListCard(state, { kind, items, hazardId, platformId, entries, usedOn = new Map(), grouped = [] }) {
  const { name, title, what, none } = PLATFORM_LISTS[kind];
  const pair = `${hazardId}:${platformId}`;
  const adding = state.editing?.kind === `new${name}` && state.editing.id === pair;
  const list = `${kind}-entries`;
  const here = new Set(items.map((r) => String(r.text).trim().toLowerCase()));
  const suggestions = html`<datalist id="${list}">${entries.map((t) => html`<option value="${t}"></option>`)}</datalist>`;
  return html`<section class="dash-card nl-card" aria-label="${title}">
    <h3 class="dash-card-h">${title} <span class="count">${items.length}</span>${plus({ action: 'startEdit', kind: `new${name}`, id: pair }, `Add ${/^[aeiou]/.test(what) ? 'an' : 'a'} ${what}`)}</h3>
    ${items.length ? html`<ol class="nl">${items.map((r, i) => {
      const editing = state.editing?.kind === kind && state.editing.id === r.id;
      return html`<li class="nl-item"><span class="nl-num">${i + 1}</span>
        ${editing
          ? html`<input class="cell-edit" name="text" value="${r.text}" required list="${list}" autocomplete="off" aria-label="${what}" autofocus ${dataAttrs({ change: `update${name}`, id: r.id })}>`
          : html`<span class="cell-text nl-text" ${dataAttrs({ dblclick: 'startEdit', kind, id: r.id })} title="Double-click to change">${r.text}</span>`}
        <span class="row-actions">${removeButton(`Delete ${what} ${i + 1}`, `Delete ${what} ${i + 1}?`, `“${r.text}” will be deleted.`, { run: `delete${name}`, id: r.id })}</span></li>`;
    })}</ol>` : html`<p class="muted nl-empty">${none}</p>`}
    ${adding ? addForm({ action: `add${name}`, attrs: { 'hazard-id': hazardId, 'platform-id': platformId }, what, list, heading: 'Used before',
      suggestions: entries.filter((t) => !here.has(t.toLowerCase()))
        .map((text) => ({ text, from: (usedOn.get(text.toLowerCase()) ?? []).join(', ') }))
        .sort((a, b) => Number(!a.from) - Number(!b.from)), grouped: grouped.filter((g) => !here.has(g.text.toLowerCase())), reveal: `suggest:${kind}:${pair}` }) : ''}
    ${adding || items.some((r) => state.editing?.kind === kind && state.editing.id === r.id) ? suggestions : ''}
  </section>`;
}

/**
 * The form a numbered card's + opens: a box for a new entry, and the entries offered from
 * elsewhere as ticks. Add puts in what is typed and every one ticked; with any ticked, the box may
 * be left empty (see pickedEntries in mount.js).
 * @param {{ action: string, attrs: Record<string, string>, what: string, extra?: unknown, list?: string, heading: string,
 *   suggestions: { text: string, from: string }[], reveal: string, grouped?: { text: string, from: string }[] }} o
 *   list: the id of a datalist the box suggests from as you type
 */
function addForm({ action, attrs, what, extra = '', list, heading, suggestions, reveal, grouped = [] }) {
  const block = (/** @type {string} */ h, /** @type {{ text: string, from: string }[]} */ xs, /** @type {string} */ key) => (xs.length
    ? html`<div class="suggest" data-reveal="${key}"><p class="suggest-h">${h}</p><ul class="suggest-list">${xs.map((x) => html`<li><label class="suggest-item"><input type="checkbox" name="pick" value="${x.text}"><span class="suggest-text">${x.text}</span>${x.from ? html`<span class="suggest-from">${x.from}</span>` : ''}</label></li>`)}</ul></div>`
    : '');
  const groupedTexts = new Set(grouped.map((g) => g.text.toLowerCase()));
  return html`<form data-action="${action}" ${dataAttrs(attrs)} class="new-row new-entries" data-picks>
    <div class="row inline fill"><input name="text" required${list ? html` list="${list}" autocomplete="off"` : ''} placeholder="New ${what}…" aria-label="New ${what}" class="grow" autofocus>${extra}<button type="submit">Add</button><button type="button" ${dataAttrs({ action: 'cancelEdit' })}>Cancel</button></div>
    ${block('Suggested from your groups', grouped, `${reveal}:groups`)}
    ${block(heading, suggestions.filter((x) => !groupedTexts.has(x.text.toLowerCase())), reveal)}
  </form>`;
}
