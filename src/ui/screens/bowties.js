import { html, raw } from '../html.js';
import { dataAttrs, option, confirmButton } from './common.js';
import { profileName } from '../names.js';
import { get, live } from '../../core/data.js';
import { byNumber } from '../../core/queries.js';
import { CONTROL_STATUSES } from '../../core/ops/assessment.js';
import { SETS, SET_WORD, STATUS_WORD, bowtieOf, canSee, myViews, sharedWithMe, hazardName } from '../../core/bowtie.js';
import { bowtieSvg } from '../bowtie-svg.js';
import { paneCount, paneDirty } from '../workspace.js';

/** @typedef {import('../../core/data.js').Data} Data */
/** @typedef {import('../../core/data.js').Rec} Rec */
/** @typedef {import('../workspace.js').Pane} Pane */

const SET_LABEL = { existing: 'Existing only', additional: 'Additional only', all: 'Existing and additional' };

/** @param {Data} data @param {string} id */
function hazardText(data, id) {
  const h = get(data, 'hazard', id);
  return h ? hazardName(h) : 'a deleted hazard';
}

/** @param {Data} data @param {string} id */
function platformText(data, id) {
  return get(data, 'platform', id)?.name ?? 'a deleted platform';
}

/** @param {unknown} label @param {Record<string, unknown>} attrs @param {boolean} [disabled] */
function button(label, attrs, disabled = false) {
  return html`<button type="button" ${dataAttrs(attrs)}${disabled ? raw(' disabled') : ''}>${label}</button>`;
}

/**
 * Saved views on the left, one or two diagram windows on the stage.
 * @param {any} state @param {Data} data
 */
export function bowtiesView(state, data) {
  const ws = state.workspace;
  const n = paneCount(ws);
  return html`<div class="head"><h1>Bow-ties</h1></div>
  <div class="bowties">
    <aside class="bt-side" data-filter-scope>${sideList(state, data)}</aside>
    <section class="bt-stage${n === 2 ? ' split' : ''}" aria-label="Bow-tie diagrams">
      ${n === 0
        ? html`<div class="bt-empty"><p><strong>Open a saved view, or start a new diagram.</strong></p><p class="muted">Drag a view or a window to the left or right to compare two side by side.</p></div>`
        : ws.panes.map((/** @type {Pane | null} */ p, /** @type {number} */ i) => (p ? paneView(state, data, p, i, n === 2) : ''))}
      <div class="bt-drop" data-drop-side="0">Left</div><div class="bt-drop" data-drop-side="1">Right</div>
    </section>
  </div>
  ${state.bowtieReplace ? replaceQuestion(state.bowtieReplace.index) : ''}`;
}

/** @param {any} state @param {Data} data */
function sideList(state, data) {
  const pairs = live(data, 'hazardPlatform')
    .map((l) => ({ h: get(data, 'hazard', l.hazardId), p: get(data, 'platform', l.platformId) }))
    .filter((x) => x.h && x.h.status === 'live' && x.p && x.p.status !== 'deleted')
    .sort((a, b) => byNumber(/** @type {Rec} */ (a.h), /** @type {Rec} */ (b.h)) || String(a.p?.name).localeCompare(String(b.p?.name)));
  const me = state.profileId;
  return html`<form data-action="newBowtie" class="bt-new">
      <label>New diagram<select name="pair" required aria-label="Hazard and platform"><option value="">Choose a hazard and platform…</option>
        ${pairs.map((x) => option(`${x.h?.id}|${x.p?.id}`, `${hazardName(/** @type {Rec} */ (x.h))} — ${x.p?.name}`))}</select></label>
      <button type="submit" class="primary">Open</button></form>
    <input class="bt-search" data-filter-list placeholder="Search views…" aria-label="Search views">
    <h2>My views</h2>${viewList(state, data, myViews(data, me), true, 'You have no saved views yet.')}
    <h2>Shared with me</h2>${viewList(state, data, sharedWithMe(data, me), false, 'Nothing is shared with you.')}`;
}

/** @param {any} state @param {Data} data @param {Rec[]} views @param {boolean} own @param {string} none */
function viewList(state, data, views, own, none) {
  if (!views.length) return html`<p class="muted">${none}</p>`;
  return html`<ul class="bt-list">${views.map((v) => {
    const where = `${hazardText(data, v.hazardId)} · ${platformText(data, v.platformId)}`;
    const broken = !bowtieOf(data, v.hazardId, v.platformId, v.filters).ok;
    const renaming = own && state.editing?.kind === 'bowtieRename' && state.editing.id === v.id;
    const sharing = own && state.editing?.kind === 'bowtieShare' && state.editing.id === v.id;
    return html`<li class="bt-item${broken ? ' broken' : ''}" draggable="true" ${dataAttrs({ 'drag-view': v.id, 'pick-text': `${v.name} ${where}`.toLowerCase() })}>
      <button type="button" class="bt-open" ${dataAttrs({ action: 'openBowtieView', id: v.id })}>
        <strong>${v.name}</strong><span class="muted">${where}</span>${own ? '' : html`<span class="muted">from ${profileName(state, v.ownerId)}</span>`}${broken ? html`<span class="tag tag-warn">Cannot draw</span>` : ''}</button>
      <details class="bt-menu"><summary aria-label="More for ${v.name}" title="More">⋯</summary><div class="bt-menu-body">
        ${button('Open left', { action: 'openBowtieView', id: v.id, side: '0' })}
        ${button('Open right', { action: 'openBowtieView', id: v.id, side: '1' })}
        ${own ? html`${button('Rename', { action: 'startEdit', kind: 'bowtieRename', id: v.id })}
          ${button('Share…', { action: 'startEdit', kind: 'bowtieShare', id: v.id })}
          ${confirmButton('Delete…', `Delete ${v.name}`, dataAttrs({ action: 'removeBowtieView', id: v.id }))}` : ''}
      </div></details>
      ${renaming ? html`<form data-action="renameBowtieView" ${dataAttrs({ id: v.id })} class="row inline fill"><input name="name" required class="grow" aria-label="View name" value="${v.name}" autofocus><button type="submit" class="primary">Rename</button><button type="button" ${dataAttrs({ action: 'cancelEdit' })}>Cancel</button></form>` : ''}
      ${sharing ? shareForm(state, v) : ''}
    </li>`;
  })}</ul>`;
}

/** @param {any} state @param {Rec} v */
function shareForm(state, v) {
  const others = state.profiles.filter((/** @type {any} */ p) => p.id !== v.ownerId);
  return html`<form data-action="shareBowtieView" ${dataAttrs({ id: v.id })} class="bt-share"><p><strong>Share ${v.name} with</strong></p>
    ${others.map((/** @type {any} */ p) => html`<label><input type="checkbox" name="profileId" value="${p.id}"${(v.sharedWith ?? []).includes(p.id) ? raw(' checked') : ''}> ${p.name}</label>`)}
    ${others.length ? '' : html`<p class="muted">There are no other profiles yet.</p>`}
    <div class="actions"><button type="submit" class="primary">Share</button><button type="button" ${dataAttrs({ action: 'cancelEdit' })}>Cancel</button></div></form>`;
}

/** @param {any} state @param {Data} data @param {Pane} pane @param {number} side @param {boolean} split */
function paneView(state, data, pane, side, split) {
  const rec = pane.viewId ? get(data, 'bowtieView', pane.viewId) : null;
  const view = rec && canSee(rec, state.profileId) ? rec : null;
  const own = Boolean(view && view.ownerId === state.profileId);
  const b = bowtieOf(data, pane.hazardId, pane.platformId, pane.filters);
  const title = view ? view.name : `Unsaved: ${hazardText(data, pane.hazardId)} on ${platformText(data, pane.platformId)}`;
  const dirty = paneDirty(pane, data);
  const s = String(side);
  const naming = state.editing?.kind === 'bowtieName' && state.editing.id === s;
  const f = pane.filters;
  return html`<article class="bt-window" aria-label="${title}">
    <header class="bt-bar" draggable="true" ${dataAttrs({ 'drag-pane': s })}>
      <span class="bt-grip" aria-hidden="true">⠿</span><h2>${title}</h2>${view && dirty ? html`<span class="tag">Changed</span>` : ''}
      <span class="spacer"></span>
      ${split ? button('Swap sides', { action: 'swapBowtiePanes' }) : ''}
      ${button('Close', { action: 'closeBowtiePane', side: s })}
    </header>
    <div class="bt-filters">
      <label>Controls <select name="value" aria-label="Which controls" ${dataAttrs({ change: 'setPaneSet', side: s })}>${SETS.map((x) => option(x, SET_LABEL[/** @type {keyof typeof SET_LABEL} */ (x)], f.set))}</select></label>
      <fieldset${f.set === 'existing' ? raw(' disabled') : ''}><legend>${SET_WORD.additional}</legend>
        ${CONTROL_STATUSES.map((st) => html`<label><input type="checkbox" name="on" ${dataAttrs({ change: 'setPaneStatus', side: s, status: st })}${f.statuses.includes(st) ? raw(' checked') : ''}> ${STATUS_WORD[/** @type {keyof typeof STATUS_WORD} */ (st)]}</label>`)}
      </fieldset>
    </div>
    <div class="bt-diagram">${b.ok ? diagram(bowtieSvg(b)) : html`<p class="bt-cannot">${/** @type {import('../../core/bowtie.js').Cannot} */ (b).message}</p>`}</div>
    <div class="actions bt-actions">
      ${own ? button(dirty ? 'Save' : 'Saved', { action: 'saveBowtiePane', side: s }, !dirty) : button(view ? 'Save a copy' : 'Save', { action: 'saveBowtiePane', side: s })}
      ${button('Save as…', { action: 'startEdit', kind: 'bowtieName', id: s })}
      ${own && view ? button('Share…', { action: 'startEdit', kind: 'bowtieShare', id: view.id }) : ''}
      ${b.ok ? button('Export SVG', { action: 'exportBowtie', side: s }) : ''}
    </div>
    ${naming ? html`<form data-action="saveBowtiePaneAs" ${dataAttrs({ side: s })} class="row inline fill bt-name"><input name="name" required class="grow" aria-label="View name" placeholder="Name this view…" value="${view ? `${view.name} (copy)` : ''}" autofocus><button type="submit" class="primary">Save</button><button type="button" ${dataAttrs({ action: 'cancelEdit' })}>Cancel</button></form>` : ''}
  </article>`;
}

/**
 * The drawing, shrunk to fit its window but never below 70% of its own size, so the text stays
 * readable when two windows share the stage; past that the window scrolls sideways.
 * @param {string} svg
 */
function diagram(svg) {
  const width = Number(/ width="(\d+)"/.exec(svg)?.[1] ?? 0);
  return html`<div class="bt-canvas" style="min-width: ${Math.round(width * 0.7)}px">${raw(svg)}</div>`;
}

/** @param {0 | 1} index the window that would be replaced */
function replaceQuestion(index) {
  return html`<div class="picker-overlay"><div class="picker" role="alertdialog" aria-modal="true" aria-label="Replace diagram">
    <h2>Replace the unsaved diagram?</h2>
    <p>The ${index === 0 ? 'left' : 'right'} window has choices that are not saved as a view. Replacing it loses them.</p>
    <div class="actions"><button type="button" class="danger" ${dataAttrs({ action: 'confirmBowtieReplace' })}>Replace it</button>
      <button type="button" ${dataAttrs({ action: 'cancelBowtieReplace' })} autofocus>Keep it</button></div></div></div>`;
}
