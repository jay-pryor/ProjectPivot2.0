import { html } from '../html.js';
import { dataAttrs, option, idTag } from './common.js';
import { live } from '../../core/data.js';
import { hazardLabel, controlLabel, referenceLabel, platformLabel } from '../../core/ids.js';
import { hazardsNotOn, hazardDetail, referencesFor, referenceTargets, existingControlsOn } from '../../core/queries.js';
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
  if (p.picker === 'linkExistingControls') {
    const listed = new Set(existingControlsOn(data, p.hazardId, p.platformId).map((x) => x.control.id));
    const controls = live(data, 'control').filter((c) => !listed.has(c.id));
    return frame('Add existing controls', html`<form data-action="linkExistingControls" ${dataAttrs({ 'hazard-id': p.hazardId, 'platform-id': p.platformId })} class="picker-form">
      ${search()}
      <ul class="pick-list">${controls.map((c) => html`<li data-pick-text="${`${controlLabel(c)} ${c.title}`.toLowerCase()}"><label><input type="checkbox" name="controlId" value="${c.id}"> <span class="id">${idTag(controlLabel(c))}</span> ${c.title}</label>
        <select name="kind:${c.id}" aria-label="Kind of ${c.title}">${CONTROL_KINDS.map((k) => option(k, k))}</select></li>`)}</ul>
      ${controls.length ? '' : html`<p class="muted">${live(data, 'control').length ? 'Every live control is already listed here.' : 'The control library is empty: add controls on the Controls page.'}</p>`}
      ${buttons('Add')}</form>`);
  }
  if (p.picker === 'linkReferences') {
    const linked = new Set(referencesFor(data, p.targetKind, p.targetId).map((x) => x.reference.id));
    const refs = live(data, 'reference').filter((r) => !linked.has(r.id));
    return frame('Link references', html`<form data-action="linkReferences" ${dataAttrs({ 'target-kind': p.targetKind, 'target-id': p.targetId })} class="picker-form">
      ${search()}
      <ul class="pick-list">${refs.map((r) => html`<li data-pick-text="${`${referenceLabel(r)} ${r.title} ${r.docNumber}`.toLowerCase()}"><label><input type="checkbox" name="referenceId" value="${r.id}"> <span class="id">${idTag(referenceLabel(r))}</span> ${r.title}</label></li>`)}</ul>
      ${refs.length ? '' : html`<p class="muted">${live(data, 'reference').length ? 'Every reference is already linked here.' : 'No references yet: add them on the References page.'}</p>`}
      ${buttons('Link')}</form>`);
  }
  if (p.picker === 'linkTargets') {
    const linked = new Set(referenceTargets(data, p.referenceId).map((x) => `${x.link.targetKind}|${x.link.targetId}`));
    /** @param {string} kind @param {string} id @param {string} text @param {any} label */
    const item = (kind, id, text, label) => (linked.has(`${kind}|${id}`) ? '' : html`<li data-pick-text="${text.toLowerCase()}"><label><input type="checkbox" name="target" value="${kind}|${id}"> ${label}</label></li>`);
    const hazards = live(data, 'hazard');
    return frame('Link records', html`<form data-action="linkTargets" ${dataAttrs({ 'reference-id': p.referenceId })} class="picker-form">
      ${search()}
      <ul class="pick-list">
        ${live(data, 'platform').map((pl) => item('platform', pl.id, `platform ${pl.name}`, html`Platform <span class="id">${idTag(platformLabel(pl))}</span> ${pl.name}`))}
        ${hazards.map((h) => html`${item('hazard', h.id, `${hazardLabel(h)} ${h.title}`, html`Hazard <span class="id">${idTag(hazardLabel(h))}</span> ${h.title}`)}
          ${live(data, 'causalFactor').filter((x) => x.hazardId === h.id).map((x) => item('causalFactor', x.id, `${hazardLabel(h)} ${x.text}`, html`<span class="indent">Causal factor of ${hazardLabel(h)}: ${x.text}</span>`))}
          ${live(data, 'consequence').filter((x) => x.hazardId === h.id).map((x) => item('consequence', x.id, `${hazardLabel(h)} ${x.text}`, html`<span class="indent">Consequence of ${hazardLabel(h)}: ${x.text}</span>`))}`)}
        ${live(data, 'control').map((c) => item('control', c.id, `${controlLabel(c)} ${c.title}`, html`Control <span class="id">${idTag(controlLabel(c))}</span> ${c.title}`))}
      </ul>
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
