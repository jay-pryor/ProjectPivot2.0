import { html } from '../html.js';
import { dataAttrs, option, idTag } from './common.js';
import { live } from '../../core/data.js';
import { hazardLabel, controlLabel } from '../../core/ids.js';
import { hazardsNotOn, hazardDetail } from '../../core/queries.js';
import { CONTROL_KINDS } from '../../core/ops/controls.js';

/**
 * A list to tick things in, opened by a small + next to a table. Typing in its search box narrows
 * the list on screen only, so ticks are never lost.
 * @param {any} state @param {import('../../core/data.js').Data} data
 */
export function pickerView(state, data) {
  const p = state.picker;
  if (!p) return '';
  if (p.picker === 'linkHazards') {
    const hazards = hazardsNotOn(data, p.platformId);
    return frame('Link hazards', html`<form data-action="linkHazards" ${dataAttrs({ 'platform-id': p.platformId })} class="picker-form">
      ${search()}
      <ul class="pick-list">${hazards.map((h) => html`<li data-pick-text="${`${hazardLabel(h)} ${h.title}`.toLowerCase()}"><label><input type="checkbox" name="hazardId" value="${h.id}"> <span class="id">${idTag(hazardLabel(h))}</span> ${h.title}</label></li>`)}</ul>
      ${hazards.length ? '' : html`<p class="muted">Every live hazard is already on this platform.</p>`}
      ${buttons('Link')}</form>`);
  }
  if (p.picker === 'linkControls') {
    const d = hazardDetail(data, p.hazardId);
    const linked = new Set((d?.controls ?? []).map((c) => c.control.id));
    const controls = live(data, 'control').filter((c) => !linked.has(c.id));
    return frame('Link controls', html`<form data-action="linkControls" ${dataAttrs({ 'hazard-id': p.hazardId })} class="picker-form">
      ${search()}
      <ul class="pick-list">${controls.map((c) => html`<li data-pick-text="${`${controlLabel(c)} ${c.title}`.toLowerCase()}"><label><input type="checkbox" name="controlId" value="${c.id}"> <span class="id">${idTag(controlLabel(c))}</span> ${c.title}</label>
        <select name="kind:${c.id}" aria-label="Kind of ${c.title}">${CONTROL_KINDS.map((k) => option(k, k))}</select></li>`)}</ul>
      ${controls.length ? '' : html`<p class="muted">${live(data, 'control').length ? 'Every control in the library is already linked.' : 'The control library is empty: add controls on the Controls page.'}</p>`}
      ${buttons('Link')}</form>`);
  }
  return '';
}

function search() {
  return html`<input class="pick-search" data-filter-list placeholder="Search…" aria-label="Search the list" autofocus>`;
}

/** @param {string} label */
function buttons(label) {
  return html`<div class="actions"><button type="submit" class="primary">${label}</button><button type="button" ${dataAttrs({ action: 'closePicker' })}>Cancel</button></div>`;
}

/** @param {string} title @param {import('../html.js').Raw} body */
function frame(title, body) {
  return html`<div class="picker-overlay"><div class="picker" role="dialog" aria-modal="true" aria-label="${title}"><h2>${title}</h2>${body}</div></div>`;
}
