import { html } from '../html.js';
import { dataAttrs, option, statusTag, bandTag, stateTag, go, confirmButton, historyBlock } from './common.js';
import { all, get, live } from '../../core/data.js';
import { hazardLabel, ids } from '../../core/ids.js';
import { platformHazards, hazardsNotOn, bandOf } from '../../core/queries.js';
import { CONSEQUENCES, LIKELIHOODS, BANDS, formatRating, ratingFor } from '../../core/matrix.js';
import { profileName, when } from '../names.js';
import { notFound, statusColumn } from './hazards.js';
import { dataTable } from './table.js';

/** @typedef {import('../../core/data.js').Data} Data */

/** @param {any} state @param {Data} data */
export function platformsView(state, data) {
  const count = (/** @type {string} */ id) => live(data, 'hazardPlatform').filter((l) => l.platformId === id).length;
  return html`<div class="head"><h1>Platforms</h1>
    <form data-action="createPlatform" class="row"><input name="name" required placeholder="New platform name" aria-label="New platform name">
      <select name="ownerId" aria-label="Owner">${state.profiles.map((/** @type {any} */ p) => option(p.id, p.name, state.profileId))}</select>
      <button type="submit">Add platform</button></form></div>
    ${dataTable(state, {
      id: 'platforms',
      rowKey: (p) => p.id,
      rows: all(data, 'platform'),
      empty: 'No platforms yet.',
      columns: [
        { key: 'name', label: 'Platform', width: 280, value: (p) => p.name, filter: 'text', render: (p) => go(p.name, 'platform', { id: p.id }) },
        { key: 'owner', label: 'Owner', width: 200, value: (p) => profileName(state, p.ownerId), filter: 'select',
          options: state.profiles.map((/** @type {any} */ pr) => /** @type {[string, string]} */ ([pr.id, pr.name])), match: (p, v) => p.ownerId === v },
        { key: 'hazards', label: 'Hazards', width: 110, value: (p) => count(p.id) },
        statusColumn((p) => p.status),
      ],
    })}`;
}

/** @param {any} state @param {Data} data @param {string} id */
export function platformView(state, data, id) {
  const p = get(data, 'platform', id);
  if (!p) return notFound();
  const rows = platformHazards(data, id);
  const addable = hazardsNotOn(data, id);
  const actions = p.status === 'live'
    ? html`<button type="button" ${dataAttrs({ action: 'retirePlatform', id })}>Retire</button>
       ${rows.length ? '' : confirmButton('Delete…', 'Delete this platform', dataAttrs({ action: 'deletePlatform', id }))}`
    : p.status === 'retired' ? html`<button type="button" ${dataAttrs({ action: 'restoreRecord', kind: 'platform', id })}>Restore</button>` : '';
  return html`<p>${go('← Platforms', 'platforms')}</p>
    <h1>${p.name}${statusTag(p.status)}</h1>
    <div class="row">
      <form data-action="updatePlatform" ${dataAttrs({ id })} class="row"><input name="name" value="${p.name}" required aria-label="Platform name"><button type="submit">Rename</button></form>
      <label>Owner <select name="ownerId" ${dataAttrs({ change: 'setOwner', id })}>${state.profiles.map((/** @type {any} */ pr) => option(pr.id, pr.name, p.ownerId))}</select></label>
      <div class="actions">${actions}</div>
    </div>
    <section><h2>Hazards on ${p.name}</h2>
      ${dataTable(state, {
        id: 'platformHazards',
        rowKey: (r) => r.hazard.id,
        rows,
        empty: 'No hazards on this platform yet.',
        columns: [
          { key: 'reportId', label: 'Report ID', width: 190, value: (r) => r.reportId,
            render: (r) => html`<form data-action="setReportId" ${dataAttrs({ 'hazard-id': r.hazard.id, 'platform-id': id })} class="row inline"><input name="reportId" value="${r.link.reportId ?? ''}" placeholder="${hazardLabel(r.hazard)}" size="10" aria-label="Report ID"><button type="submit">Set</button></form>` },
          { key: 'hazard', label: 'Hazard', width: 280, value: (r) => `${hazardLabel(r.hazard)} ${r.hazard.title}`, render: (r) => go(`${hazardLabel(r.hazard)} ${r.hazard.title}`, 'hazard', { id: r.hazard.id }) },
          { key: 'risk', label: 'Residual risk', width: 150, value: (r) => BANDS.indexOf(bandOf(r.rating.residual)), render: (r) => bandTag(bandOf(r.rating.residual)) },
          { key: 'controls', label: 'Controls', width: 220, sortable: false, render: (r) => {
            const counts = { confirmed: 0, excluded: 0, awaiting: 0 };
            for (const c of r.controls) counts[/** @type {'confirmed'} */ (c.state)] += 1;
            return Object.entries(counts).filter(([, n]) => n > 0).map(([st, n]) => html`${stateTag(st)} ${n} `);
          } },
          { key: 'actions', label: '', width: 190, sortable: false, render: (r) => {
            const at = { 'hazard-id': r.hazard.id, 'platform-id': id };
            return html`<div class="actions">${go('Assess', 'assessment', at)} ${confirmButton('Unlink…', 'Unlink, clearing its ratings and control decisions here', dataAttrs({ action: 'unlinkHazard', ...at }))}</div>`;
          } },
        ],
      })}
      ${p.status === 'live' && addable.length
        ? html`<form data-action="linkHazard" ${dataAttrs({ 'platform-id': id })} class="row"><select name="hazardId" aria-label="Hazard">${addable.map((h) => option(h.id, `${hazardLabel(h)} ${h.title}`))}</select><button type="submit">Link hazard</button></form>`
        : ''}
    </section>
    ${historyBlock(state, data, 'platform', id)}`;
}

/** @param {string} hazardId @param {string} platformId @param {'initial' | 'residual'} stage @param {any} pair */
function ratingForm(hazardId, platformId, stage, pair) {
  const c = pair?.consequence == null ? '' : String(pair.consequence);
  const l = pair?.likelihood ?? '';
  return html`<form data-action="setRating" ${dataAttrs({ 'hazard-id': hazardId, 'platform-id': platformId, stage })} class="row">
    <strong class="stage">${stage === 'initial' ? 'Initial' : 'Residual'}</strong>
    <label>Consequence <select name="consequence"><option value="">Not entered</option>${CONSEQUENCES.map((x) => option(String(x.level), `${x.level} ${x.label}`, c))}</select></label>
    <label>Likelihood <select name="likelihood"><option value="">Not entered</option>${LIKELIHOODS.map((x) => option(x.letter, `${x.letter} ${x.label}`, l))}</select></label>
    <button type="submit">Apply</button> ${bandTag(bandOf(pair))}${ratingFor(pair?.consequence ?? null, pair?.likelihood ?? null).cell ? html` <span class="cell">${formatRating(pair)}</span>` : ''}</form>`;
}

/** @param {any} state @param {Data} data @param {string} hazardId @param {string} platformId */
export function assessmentView(state, data, hazardId, platformId) {
  const row = platformHazards(data, platformId).find((r) => r.hazard.id === hazardId);
  const p = get(data, 'platform', platformId);
  if (!row || !p) return html`<p class="muted">That hazard is not on this platform.</p><p>${go('← Platforms', 'platforms')}</p>`;
  const h = row.hazard;
  return html`<p>${go(`← ${p.name}`, 'platform', { id: platformId })}</p>
    <h1>${hazardLabel(h)} ${h.title} <span class="muted">on ${p.name}</span></h1>
    <section><h2>Risk</h2>
      ${ratingForm(h.id, platformId, 'initial', row.rating.initial)}
      ${ratingForm(h.id, platformId, 'residual', row.rating.residual)}
    </section>
    <section><h2>Controls on ${p.name}</h2>
      ${dataTable(state, {
        id: 'assessment',
        rowKey: (c) => c.control.id,
        rows: row.controls,
        empty: 'This hazard has no controls. Link them on the hazard\'s page.',
        columns: [
          { key: 'control', label: 'Control', width: 230, value: (c) => c.control.title, render: (c) => html`${c.control.title}${statusTag(c.control.status)}` },
          { key: 'kind', label: 'Kind', width: 120, value: (c) => c.kind },
          { key: 'state', label: 'State', width: 260, value: (c) => c.state, render: (c) => html`${stateTag(c.state)}
            ${c.state === 'confirmed' ? html` <span class="muted">by ${profileName(state, c.ruling.updatedBy)}, ${when(c.ruling.updatedAt)}</span>` : ''}
            ${c.state === 'excluded' ? html` <span class="reason">${c.ruling.reason}</span>` : ''}` },
          { key: 'actions', label: '', width: 380, sortable: false, render: (c) => {
            const t = { 'hazard-id': h.id, 'control-id': c.control.id, 'platform-id': platformId };
            return html`<div class="actions">
              ${c.state !== 'confirmed' ? html`<button type="button" ${dataAttrs({ action: 'confirmControl', ...t })}>Confirm</button>` : ''}
              <form data-action="excludeControl" ${dataAttrs(t)} class="row inline"><input name="reason" required placeholder="Reason for excluding" aria-label="Reason for excluding ${c.control.title}"><button type="submit">Exclude</button></form>
              ${c.state !== 'awaiting' ? html`<button type="button" ${dataAttrs({ action: 'resetControl', ...t })}>Reset</button>` : ''}
            </div>`;
          } },
        ],
      })}
    </section>
    ${historyBlock(state, data, 'rating', ids.rating(h.id, platformId))}`;
}
