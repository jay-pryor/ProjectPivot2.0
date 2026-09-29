import { html } from '../html.js';
import { dataAttrs, statusTag, bandTag, stateTag, go, confirmButton, filterBar, historyBlock } from './common.js';
import { get } from '../../core/data.js';
import { hazardLabel } from '../../core/ids.js';
import { filterControls, controlUsage, platformsReached } from '../../core/queries.js';
import { notFound } from './hazards.js';

/** @typedef {import('../../core/data.js').Data} Data */

/** @param {any} state @param {Data} data */
export function controlsView(state, data) {
  const rows = filterControls(data, state.filters.controls);
  return html`<div class="head"><h1>Controls</h1>
    <form data-action="createControl" class="row"><input name="title" required placeholder="New control title" aria-label="New control title"><button type="submit">Add control</button></form></div>
    ${filterBar(state, data, 'controls', true)}
    <table class="grid"><thead><tr><th>Control</th><th>Hazard</th><th>Platform</th><th>Kind</th><th>State</th><th>Residual risk</th></tr></thead><tbody>
    ${rows.map((r) => html`<tr><td>${go(r.control.title, 'control', { id: r.control.id })}${statusTag(r.control.status)}</td>
      <td>${r.hazard ? go(`${hazardLabel(r.hazard)} ${r.hazard.title}`, 'hazard', { id: r.hazard.id }) : '—'}</td>
      <td>${r.platform ? r.platform.name : '—'}</td><td>${r.kind ?? '—'}</td>
      <td>${r.state ? stateTag(r.state) : '—'}</td><td>${r.band ? bandTag(r.band) : '—'}</td></tr>`)}
    </tbody></table>${rows.length ? '' : html`<p class="muted">No controls match.</p>`}`;
}

/** @param {any} state @param {Data} data @param {string} id */
export function controlView(state, data, id) {
  const c = get(data, 'control', id);
  if (!c) return notFound();
  const usage = controlUsage(data, id);
  const actions = c.status === 'live'
    ? html`<button type="button" ${dataAttrs({ action: 'retireControl', id })}>Retire</button>
       ${usage.length ? '' : confirmButton('Delete…', 'Delete this control', dataAttrs({ action: 'deleteControl', id }))}`
    : c.status === 'retired' ? html`<button type="button" ${dataAttrs({ action: 'restoreRecord', kind: 'control', id })}>Restore</button>` : '';
  const reach = platformsReached(data, 'control', c).map((pid) => get(data, 'platform', pid)?.name ?? pid);
  return html`<p>${go('← Controls', 'controls')}</p>
    <h1>${c.title}${statusTag(c.status)}</h1>
    ${reach.length > 1 ? html`<p class="note">Changes to this control reach ${reach.length} platforms: ${reach.join(', ')}.</p>` : ''}
    <form data-action="updateControl" ${dataAttrs({ id })} class="stack">
      <label>Title <input name="title" value="${c.title}" required></label>
      <label>Description <textarea name="description" rows="3">${c.description}</textarea></label>
      <div><button type="submit">Apply</button></div></form>
    <div class="actions">${actions}</div>
    <section><h2>Used by</h2>
      ${usage.length ? html`<table class="grid"><thead><tr><th>Hazard</th><th>Kind</th><th>Platforms</th></tr></thead><tbody>
        ${usage.map((u) => html`<tr><td>${go(`${hazardLabel(u.hazard)} ${u.hazard.title}`, 'hazard', { id: u.hazard.id })}</td><td>${u.kind}</td>
          <td>${u.platforms.length ? u.platforms.map((p) => html`<span class="onplat">${p.platform.name} ${stateTag(p.state)}</span> `) : '—'}</td></tr>`)}
      </tbody></table>` : html`<p class="muted">Not linked to any hazard.</p>`}
    </section>
    ${historyBlock(state, data, 'control', id)}`;
}
