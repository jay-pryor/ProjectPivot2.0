import { html } from '../html.js';
import { dataAttrs, option, statusTag, bandTag, go, confirmButton, filterBar, historyBlock } from './common.js';
import { live } from '../../core/data.js';
import { hazardLabel } from '../../core/ids.js';
import { filterHazards, hazardDetail } from '../../core/queries.js';
import { CONTROL_KINDS } from '../../core/ops/controls.js';

/** @typedef {import('../../core/data.js').Data} Data */

export function notFound() {
  return html`<p class="muted">That record no longer exists.</p><p>${go('← Hazards', 'hazards')}</p>`;
}

/** @param {any} state @param {Data} data */
export function hazardsView(state, data) {
  const rows = filterHazards(data, state.filters.hazards);
  return html`<div class="head"><h1>Hazards</h1>
    <form data-action="createHazard" class="row"><input name="title" required placeholder="New hazard title" aria-label="New hazard title"><button type="submit">Add hazard</button></form></div>
    ${filterBar(state, data, 'hazards', false)}
    <table class="grid"><thead><tr><th>ID</th><th>Hazard</th><th>Platform</th><th>Residual risk</th><th>Status</th></tr></thead><tbody>
    ${rows.map((r) => html`<tr><td>${go(hazardLabel(r.hazard), 'hazard', { id: r.hazard.id })}</td><td>${r.hazard.title}</td>
      <td>${r.platform ? r.platform.name : '—'}</td><td>${r.band ? bandTag(r.band) : '—'}</td><td>${statusTag(r.hazard.status) || 'live'}</td></tr>`)}
    </tbody></table>${rows.length ? '' : html`<p class="muted">No hazards match.</p>`}`;
}

/** @param {'CausalFactor' | 'Consequence'} name @param {any[]} items @param {string} hazardId */
function textList(name, items, hazardId) {
  const what = name === 'CausalFactor' ? 'causal factor' : 'consequence';
  return html`<ul class="texts">${items.map((r) => html`<li><form data-action="update${name}" ${dataAttrs({ id: r.id })} class="row">
      <input name="text" value="${r.text}" required aria-label="${what}"><button type="submit">Apply</button>
      <button type="button" ${dataAttrs({ action: `delete${name}`, id: r.id })}>Delete</button></form></li>`)}</ul>
    <form data-action="add${name}" ${dataAttrs({ 'hazard-id': hazardId })} class="row"><input name="text" required placeholder="Add a ${what}…" aria-label="Add a ${what}"><button type="submit">Add</button></form>`;
}

/** @param {any} state @param {Data} data @param {string} id */
export function hazardView(state, data, id) {
  const d = hazardDetail(data, id);
  if (!d) return notFound();
  const h = d.hazard;
  const linkable = live(data, 'control').filter((c) => !d.controls.some((x) => x.control.id === c.id));
  const actions = h.status === 'live'
    ? html`<button type="button" ${dataAttrs({ action: 'retireHazard', id: h.id })}>Retire</button>
       ${confirmButton('Delete…', 'Delete this hazard, its causal factors, consequences and control links', dataAttrs({ action: 'deleteHazard', id: h.id }))}`
    : h.status === 'retired' ? html`<button type="button" ${dataAttrs({ action: 'restoreRecord', kind: 'hazard', id: h.id })}>Restore</button>` : '';
  return html`<p>${go('← Hazards', 'hazards')}</p>
    <h1>${hazardLabel(h)} ${h.title}${statusTag(h.status)}</h1>
    ${d.platforms.length > 1 ? html`<p class="note">Changes to this hazard reach ${d.platforms.length} platforms: ${d.platforms.map((p) => p.platform.name).join(', ')}.</p>` : ''}
    <form data-action="updateHazard" ${dataAttrs({ id: h.id })} class="stack">
      <label>Title <input name="title" value="${h.title}" required></label>
      <label>Description <textarea name="description" rows="3">${h.description}</textarea></label>
      <div><button type="submit">Apply</button></div></form>
    <div class="actions">${actions}</div>
    <section><h2>Causal factors</h2>${textList('CausalFactor', d.causalFactors, h.id)}</section>
    <section><h2>Consequences</h2>${textList('Consequence', d.consequences, h.id)}</section>
    <section><h2>Controls</h2>
      <table class="grid"><thead><tr><th>Control</th><th>Kind</th><th></th></tr></thead><tbody>
      ${d.controls.map((c) => html`<tr><td>${go(c.control.title, 'control', { id: c.control.id })}${statusTag(c.control.status)}</td>
        <td><select name="kind" aria-label="Kind of ${c.control.title}" ${dataAttrs({ change: 'setControlKind', 'hazard-id': h.id, 'control-id': c.control.id })}>${CONTROL_KINDS.map((k) => option(k, k, c.link.kind))}</select></td>
        <td>${confirmButton('Unlink…', 'Unlink, clearing its decisions on every platform', dataAttrs({ action: 'unlinkControl', 'hazard-id': h.id, 'control-id': c.control.id }))}</td></tr>`)}
      </tbody></table>
      ${linkable.length
        ? html`<form data-action="linkControl" ${dataAttrs({ 'hazard-id': h.id })} class="row">
            <select name="controlId" aria-label="Control">${linkable.map((c) => option(c.id, c.title))}</select>
            <select name="kind" aria-label="Kind">${CONTROL_KINDS.map((k) => option(k, k))}</select>
            <button type="submit">Link control</button></form>`
        : html`<p class="muted">${live(data, 'control').length ? 'Every control in the library is linked.' : 'The control library is empty.'} Add controls on the Controls page.</p>`}
    </section>
    <section><h2>Platforms</h2>
      ${d.platforms.length
        ? html`<ul>${d.platforms.map((p) => html`<li>${go(p.platform.name, 'assessment', { 'hazard-id': h.id, 'platform-id': p.platform.id })} as ${p.reportId}</li>`)}</ul>`
        : html`<p class="muted">On no platform. Link it from a platform's page.</p>`}
    </section>
    ${historyBlock(state, data, 'hazard', h.id)}`;
}
