import { html } from '../html.js';
import { dataAttrs, option, statusTag, stateTag, go, confirmButton, pageTabs, historyTable, plus, idTag, reviewTag } from './common.js';
import { reviewLine, reviewsTab } from './reviews.js';
import { REVIEW_DETAIL_ACTIONS } from '../../core/ops/reviews.js';
import { waitingChanges } from '../../core/acks.js';
import { reviewState } from '../../core/time.js';
import { dataTable } from './table.js';
import { referencesCard } from './references.js';
import { notFound, statusColumn, idColumn, newRecord } from './hazards.js';
import { all, get, live } from '../../core/data.js';
import { hazardLabel, controlLabel, platformLabel } from '../../core/ids.js';
import { platformHazards, bandOf, openReview } from '../../core/queries.js';
import { historyReaching } from '../../core/history.js';
import { CONSEQUENCES, LIKELIHOODS, BANDS, ratingFor } from '../../core/matrix.js';
import { profileName, when, day } from '../names.js';

/** @typedef {import('../../core/data.js').Data} Data */

/** @param {any} state @param {Data} data */
export function platformsView(state, data) {
  const count = (/** @type {string} */ id) => live(data, 'hazardPlatform').filter((l) => l.platformId === id).length;
  const owner = html`<select name="ownerId" aria-label="Owner">${state.profiles.map((/** @type {any} */ p) => option(p.id, p.name, state.profileId))}</select>`;
  return html`<div class="head"><h1>Platforms</h1>${newRecord(state, 'newPlatform', 'createPlatform', 'name', 'New platform name', owner)}</div>
    ${dataTable(state, {
      id: 'platforms',
      rowKey: (p) => p.id,
      rows: all(data, 'platform'),
      empty: 'No platforms yet.',
      columns: [
        idColumn((p) => p, platformLabel, (p) => go(idTag(platformLabel(p)), 'platform', { id: p.id })),
        { key: 'name', label: 'Platform', width: 560, minWidth: 180, value: (p) => p.name, filter: 'text', render: (p) => go(p.name, 'platform', { id: p.id }) },
        { key: 'owner', label: 'Owner', width: 400, minWidth: 140, value: (p) => profileName(state, p.ownerId), filter: 'select',
          options: state.profiles.map((/** @type {any} */ pr) => /** @type {[string, string]} */ ([pr.id, pr.name])), match: (p, v) => p.ownerId === v },
        { key: 'hazards', label: 'Hazards', width: 220, minWidth: 100, value: (p) => count(p.id) },
        { key: 'review', label: 'Next review', width: 340, minWidth: 170, value: (p) => p.reviewDue ?? null, filter: 'select',
          options: [['overdue', 'Overdue'], ['dueSoon', 'Due soon'], ['ok', 'Not due yet'], ['none', 'No schedule']],
          match: (p, v) => reviewState(p, state.today) === v,
          render: (p) => (p.reviewDue ? html`${day(p.reviewDue)}${reviewTag(reviewState(p, state.today))}` : '—') },
        statusColumn((p) => p.status),
      ],
    })}`;
}

/** Every matrix cell as one dropdown, grouped by consequence, with its band. @param {any} pair */
function ratingOptions(pair) {
  const r = ratingFor(pair?.consequence ?? null, pair?.likelihood ?? null);
  const current = r.cell ?? '';
  return html`<option value=""${current ? '' : ' selected'}>—</option>
    ${CONSEQUENCES.map((c) => html`<optgroup label="${c.level} ${c.label}">${LIKELIHOODS.map((l) => {
      const cell = `${c.level}${l.letter}`;
      return option(cell, `${cell} ${ratingFor(c.level, l.letter).band}`, current);
    })}</optgroup>`)}`;
}

/** @param {any} pair @param {Record<string, string>} attrs */
function ratingCell(pair, attrs) {
  const band = bandOf(pair);
  return html`<select class="quiet rating band-edge band-${band.toLowerCase().replace(/\s+/g, '-')}" name="value" aria-label="${attrs.stage} rating" ${dataAttrs({ change: 'setRatingCell', ...attrs })}>${ratingOptions(pair)}</select>`;
}

/** @param {any} state @param {Data} data @param {string} id */
export function platformView(state, data, id) {
  const p = get(data, 'platform', id);
  if (!p) return notFound();
  const tab = state.view?.tab;
  // Ticks, notes and outcome edits stay in the review itself rather than crowding the History tab.
  const reaching = historyReaching(data, id).filter((e) => !REVIEW_DETAIL_ACTIONS.includes(e.action));
  const head = html`<p>${go('← Platforms', 'platforms')}</p>
    <div class="doc-head"><span class="doc-id">${idTag(platformLabel(p))}</span>${statusTag(p.status)}</div>
    <input class="doc-title" name="name" value="${p.name}" required aria-label="Platform name" ${dataAttrs({ change: 'updatePlatform', id })}>
    ${pageTabs('platform', { id }, tab, reaching.length, [['reviews', openReview(data, id) ? 'Reviews (in progress)' : 'Reviews']])}`;
  if (tab === 'history') return html`${head}${historyTable(state, data, 'platform', id, reaching)}`;
  if (tab === 'reviews') return html`${head}<article class="doc">${reviewsTab(state, data, p)}</article>`;

  const rows = platformHazards(data, id);
  const controlRows = rows.flatMap((r) => r.controls.map((c) => ({ ...c, hazard: r.hazard })));
  const editing = (/** @type {string} */ kind, /** @type {string} */ key) => state.editing?.kind === kind && state.editing.id === key;
  const actions = p.status === 'live'
    ? html`<button type="button" ${dataAttrs({ action: 'retirePlatform', id })}>Retire</button>
       ${rows.length ? '' : confirmButton('Delete…', 'Delete this platform', dataAttrs({ action: 'deletePlatform', id }))}`
    : p.status === 'retired' ? html`<button type="button" ${dataAttrs({ action: 'restoreRecord', kind: 'platform', id })}>Restore</button>` : '';
  return html`${head}
    <article class="doc">
      <p class="doc-meta">Owned by <select class="quiet inline-select" name="ownerId" aria-label="Owner" ${dataAttrs({ change: 'setOwner', id })}>${state.profiles.map((/** @type {any} */ pr) => option(pr.id, pr.name, p.ownerId))}</select></p>
      ${reviewLine(state, data, p)}
      ${(() => {
        const n = waitingChanges(data, id).length;
        return n ? html`<p class="doc-meta"><button type="button" class="link" ${dataAttrs({ action: 'setHomeOwner', 'owner-id': p.ownerId, show: 'home' })}>${n} ${n === 1 ? 'change' : 'changes'} to acknowledge</button></p>` : '';
      })()}
      <section class="block">
        ${dataTable(state, {
          id: 'platformHazards',
          rowKey: (r) => r.hazard.id,
          rows,
          empty: 'No hazards on this platform yet.',
          tools: p.status === 'live' ? plus({ action: 'openPicker', picker: 'linkHazards', 'platform-id': id }, 'Link hazards') : '',
          columns: [
            { key: 'reportId', label: 'Report ID', width: 300, minWidth: 150, value: (r) => r.reportId,
              render: (r) => (editing('reportId', r.hazard.id)
                ? html`<input class="cell-edit" name="reportId" value="${r.link.reportId ?? ''}" placeholder="${hazardLabel(r.hazard)}" aria-label="Report ID" autofocus ${dataAttrs({ change: 'setReportId', 'hazard-id': r.hazard.id, 'platform-id': id })}>`
                : html`<span class="cell-text" ${dataAttrs({ dblclick: 'startEdit', kind: 'reportId', id: r.hazard.id })} title="Double-click to change">${idTag(r.reportId)}</span>`) },
            { key: 'hazard', label: 'Hazards', width: 600, minWidth: 200, value: (r) => `${hazardLabel(r.hazard)} ${r.hazard.title}`,
              render: (r) => html`<span class="id">${idTag(hazardLabel(r.hazard))}</span> ${go(r.hazard.title, 'hazard', { id: r.hazard.id })}` },
            { key: 'initial', label: 'Initial risk', width: 300, minWidth: 170, value: (r) => BANDS.indexOf(bandOf(r.rating.initial)),
              render: (r) => ratingCell(r.rating.initial, { 'hazard-id': r.hazard.id, 'platform-id': id, stage: 'initial' }) },
            { key: 'residual', label: 'Residual risk', width: 300, minWidth: 170, value: (r) => BANDS.indexOf(bandOf(r.rating.residual)),
              render: (r) => ratingCell(r.rating.residual, { 'hazard-id': r.hazard.id, 'platform-id': id, stage: 'residual' }) },
            { key: 'actions', label: '', width: 120, minWidth: 80, sortable: false,
              render: (r) => html`<div class="row-actions">${confirmButton('✕', 'Unlink, clearing its ratings and control decisions here', dataAttrs({ action: 'unlinkHazard', 'hazard-id': r.hazard.id, 'platform-id': id }))}</div>` },
          ],
        })}
      </section>
      <section class="block">
        ${dataTable(state, {
          id: 'platformControls',
          rowKey: (c) => `${c.hazard.id}:${c.control.id}`,
          rows: controlRows,
          empty: 'The hazards here have no controls yet. Link controls on a hazard\'s page.',
          columns: [
            { key: 'control', label: `Controls on ${p.name}`, width: 520, minWidth: 200, value: (c) => `${controlLabel(c.control)} ${c.control.title}`,
              render: (c) => html`<span class="id">${idTag(controlLabel(c.control))}</span> ${go(c.control.title, 'control', { id: c.control.id })}${statusTag(c.control.status)}` },
            { key: 'hazard', label: 'For hazard', width: 300, minWidth: 140, value: (c) => hazardLabel(c.hazard), filter: 'text',
              render: (c) => go(idTag(hazardLabel(c.hazard)), 'hazard', { id: c.hazard.id }) },
            { key: 'kind', label: 'Kind', width: 240, minWidth: 120, value: (c) => c.kind },
            { key: 'state', label: 'State', width: 260, minWidth: 150, value: (c) => c.state, filter: 'select',
              options: [['confirmed', 'confirmed'], ['excluded', 'excluded'], ['awaiting', 'awaiting']],
              render: (c) => html`<select class="quiet state-select state-${c.state}" name="value" aria-label="State of ${c.control.title}" ${dataAttrs({ change: 'setControlState', 'hazard-id': c.hazard.id, 'control-id': c.control.id, 'platform-id': id })}>
                ${['awaiting', 'confirmed', 'excluded'].map((s) => option(s, s, c.state))}</select>` },
            { key: 'reason', label: 'Reason excluded, or who confirmed', width: 640, minWidth: 220, sortable: false, render: (c) => {
              const key = `${c.hazard.id}|${c.control.id}|${id}`;
              if (editing('exclusion', key)) {
                return html`<input class="cell-edit" name="reason" value="${c.ruling?.state === 'excluded' ? c.ruling.reason : ''}" required placeholder="Why this control is left off ${p.name}…" aria-label="Reason for excluding ${c.control.title}" autofocus ${dataAttrs({ change: 'excludeControl', 'hazard-id': c.hazard.id, 'control-id': c.control.id, 'platform-id': id })}>`;
              }
              if (c.state === 'excluded') return html`<span class="cell-text reason" ${dataAttrs({ dblclick: 'startEdit', kind: 'exclusion', id: key })} title="Double-click to change">${c.ruling.reason}</span>`;
              if (c.state === 'confirmed') return html`<span class="muted">${profileName(state, c.ruling.updatedBy)}, ${when(c.ruling.updatedAt)}</span>`;
              return '';
            } },
          ],
        })}
      </section>
      <section class="block">${referencesCard(state, data, { kind: 'platform', id })}</section>
    </article>
    <div class="actions page-actions">${actions}</div>`;
}

export { stateTag };
