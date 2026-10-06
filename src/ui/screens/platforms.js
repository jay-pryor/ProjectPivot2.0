import { html } from '../html.js';
import { dataAttrs, option, statusTag, stateTag, go, confirmButton, deletePanel, deleteName, levelTag, pageTabs, historyTable, plus, idTag, reviewTag, removeColumn, removeButton } from './common.js';
import { reviewsTab } from './reviews.js';
import { REVIEW_DETAIL_ACTIONS } from '../../core/ops/reviews.js';
import { waitingChanges } from '../../core/acks.js';
import { reviewState } from '../../core/time.js';
import { dataTable } from './table.js';
import { referencesCard } from './references.js';
import { tierColumn } from './controls.js';
import { CONTROL_TIERS, CONTROL_KINDS, OWNERS } from '../../core/ops/controls.js';
import { notFound, statusColumn, idColumn, newRecord } from './hazards.js';
import { all, get, live } from '../../core/data.js';
import { hazardLabel, controlLabel, platformLabel } from '../../core/ids.js';
import { platformHazards, bandOf, worseBand, openReview, controlOwner, ownerText, referencesFor } from '../../core/queries.js';
import { sectionRail, stateCounts, glance } from './dashboard.js';
import { historyReaching } from '../../core/history.js';
import { BANDS } from '../../core/matrix.js';
import { profileName, when, day } from '../names.js';
import { CONTROL_STATUSES } from '../../core/ops/assessment.js';
import { RECEPTORS, stageKey } from '../../core/receptors.js';

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
      rowAttrs: (p) => ({ dblclick: 'go', view: 'platform', id: p.id }),
      columns: [
        idColumn((p) => p, platformLabel, (p) => go(idTag(platformLabel(p)), 'platform', { id: p.id })),
        { key: 'name', label: 'Platform', width: 560, minWidth: 180, value: (p) => p.name, filter: 'text', render: (p) => go(p.name, 'platform', { id: p.id }) },
        { key: 'owner', label: 'Owner', width: 400, minWidth: 140, value: (p) => profileName(state, p.ownerId), filter: 'select',
          options: state.profiles.map((/** @type {any} */ pr) => /** @type {[string, string]} */ ([pr.id, pr.name])), match: (p, v) => p.ownerId === v },
        { key: 'hazards', label: 'Hazard count', width: 220, minWidth: 100, value: (p) => count(p.id) },
        { key: 'review', label: 'Next review', width: 340, minWidth: 170, value: (p) => p.reviewDue ?? null, filter: 'select',
          options: [['overdue', 'Overdue'], ['dueSoon', 'Due soon'], ['ok', 'Not due yet'], ['none', 'No schedule']],
          match: (p, v) => reviewState(p, state.today) === v,
          render: (p) => (p.reviewDue ? html`${day(p.reviewDue)}${reviewTag(reviewState(p, state.today))}` : '—') },
        statusColumn((p) => p.status),
      ],
    })}`;
}

/**
 * The reason a control is rejected (double-click to change), or who set its status and when.
 * @param {any} state @param {any} c a controlsOnPlatform row @param {string} hazardId @param {string} platformId @param {string} platformName
 */
export function rejectionCell(state, c, hazardId, platformId, platformName) {
  const key = `${hazardId}|${c.control.id}|${platformId}`;
  if (state.editing?.kind === 'rejection' && state.editing.id === key) {
    return html`<input class="cell-edit" name="reason" value="${c.ruling?.state === 'rejected' ? c.ruling.reason : ''}" required placeholder="Why this control is not used on ${platformName}…" aria-label="Reason for rejecting ${c.control.title}" autofocus ${dataAttrs({ change: 'rejectControl', 'hazard-id': hazardId, 'control-id': c.control.id, 'platform-id': platformId })}>`;
  }
  if (c.state === 'rejected') return html`<span class="cell-text reason" ${dataAttrs({ dblclick: 'startEdit', kind: 'rejection', id: key })} title="Double-click to change">${c.ruling.reason}</span>`;
  if (c.ruling) return html`<span class="muted">${profileName(state, c.ruling.updatedBy)}, ${when(c.ruling.updatedAt)}</span>`;
  return '';
}

/** @param {any} state @param {Data} data @param {string} id */
export function platformView(state, data, id) {
  const p = get(data, 'platform', id);
  if (!p) return notFound();
  const tab = state.view?.tab;
  // Ticks, notes and outcome edits stay in the review itself rather than crowding the History tab.
  const reaching = historyReaching(data, id).filter((e) => !REVIEW_DETAIL_ACTIONS.includes(e.action));
  const page = tab === 'history' ? 'History' : tab === 'reviews' ? 'Reviews' : 'Details';
  const head = html`<div class="doc-head"><h1 class="doc-page"><span class="doc-id">${idTag(platformLabel(p))}</span> <span class="doc-page-sep" aria-hidden="true">—</span> ${page}</h1>${statusTag(p.status)}</div>
    <label class="doc-subtitle"><span class="field-label">Platform</span>
      <input class="doc-title small" name="name" value="${p.name}" required aria-label="Platform name" ${dataAttrs({ change: 'updatePlatform', id })}></label>
    ${pageTabs('platform', { id }, tab, reaching.length, [['reviews', openReview(data, id) ? 'Reviews (in progress)' : 'Reviews']])}`;
  if (tab === 'history') return html`${head}${historyTable(state, data, 'platform', id, reaching)}`;
  if (tab === 'reviews') return html`${head}<article class="doc">${reviewsTab(state, data, p)}</article>`;

  const rows = platformHazards(data, id);
  const controlRows = rows.flatMap((r) => r.controls.map((c) => ({ ...c, hazard: r.hazard })));
  const worst = rows.map((r) => RECEPTORS.map((x) => bandOf(r.ratings.residual[x])).reduce(worseBand));
  const existingCount = live(data, 'existingControl').filter((l) => l.platformId === id).length;
  const waiting = waitingChanges(data, id).length;
  const editing = (/** @type {string} */ kind, /** @type {string} */ key) => state.editing?.kind === kind && state.editing.id === key;
  const actions = p.status === 'live'
    ? html`<button type="button" ${dataAttrs({ action: 'retirePlatform', id })}>Retire</button>
       ${rows.length ? '' : confirmButton('Delete…', 'Delete this platform and its safety reports', dataAttrs({ action: 'askDelete', kind: 'platform', id }))}`
    : p.status === 'retired' ? html`<button type="button" ${dataAttrs({ action: 'restoreRecord', kind: 'platform', id })}>Restore</button>` : '';
  return html`${head}
    <article class="doc dash">
      <div class="dash-grid three">
        <section class="dash-card" aria-label="Platform">
          <h3 class="dash-card-h">Platform</h3>
          <p class="glance-line">Owned by <select class="quiet inline-select" name="ownerId" aria-label="Owner" ${dataAttrs({ change: 'setOwner', id })}>${state.profiles.map((/** @type {any} */ pr) => option(pr.id, pr.name, p.ownerId))}</select></p>
          <p class="glance-line">${p.reviewDue ? html`Next review ${day(p.reviewDue)}${reviewTag(reviewState(p, state.today))}` : 'No review schedule'}
            ${go('Reviews →', 'platform', { id, tab: 'reviews' })}</p>
          ${waiting ? html`<p class="glance-line"><button type="button" class="link" ${dataAttrs({ action: 'setHomeOwner', 'owner-id': p.ownerId, show: 'home' })}>${waiting} ${waiting === 1 ? 'change' : 'changes'} to acknowledge</button></p>` : ''}
        </section>
        <section class="dash-card" aria-label="Risk">
          <h3 class="dash-card-h">Worst residual by hazard</h3>
          ${glance(rows.length, 'hazard')}
          ${rows.length ? html`<p class="glance-line glance-tags">${BANDS.map((b) => [b, worst.filter((x) => x === b).length]).filter(([, n]) => n).map(([b, n]) => html`<span class="band band-${String(b).toLowerCase().replace(/\s+/g, '-')}">${n} ${b === 'Uncategorised' ? 'not rated' : b}</span> `)}</p>` : ''}
        </section>
        <section class="dash-card" aria-label="Controls">
          <h3 class="dash-card-h">Controls</h3>
          ${glance(existingCount, 'existing', 'existing')}
          ${glance(controlRows.length, 'additional', 'additional', stateCounts(controlRows.map((c) => c.state)))}
        </section>
      </div>
      ${sectionRail(state, 'platform', [
        { key: 'hazards', label: 'Hazards', icon: 'initial', badge: rows.length, body: () => dataTable(state, {
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
              render: (r) => html`<span class="id">${idTag(hazardLabel(r.hazard))}</span> ${go(r.hazard.title, 'hazard', { id: r.hazard.id, tab: `p:${id}` })}` },
            // Calculated levels only: likelihood and consequence are set on the hazard's platform tab.
            ...['initial', 'residual'].flatMap((stage) => RECEPTORS.map((receptor) => ({
              key: stageKey(stage, receptor), label: `${stage === 'initial' ? 'Initial' : 'Residual'} (${receptor})`, width: 210, minWidth: 150, className: `tint-${stage}`,
              value: (/** @type {any} */ r) => BANDS.indexOf(bandOf(r.ratings[stage][receptor])),
              render: (/** @type {any} */ r) => levelTag(r.ratings[stage][receptor]),
            }))),
            removeColumn((r) => removeButton(`Unlink ${r.hazard.title}`, `Unlink ${r.hazard.title} from ${p.name}?`, 'Unlinking clears its risk assessments, justifications, SFARP considerations and control decisions here.',
              { run: 'unlinkHazard', 'hazard-id': r.hazard.id, 'platform-id': id })),
          ],
        }) },
        { key: 'controls', label: 'Controls', icon: 'controls', badge: controlRows.length, body: () => dataTable(state, {
          id: 'platformControls',
          rowKey: (c) => `${c.hazard.id}:${c.control.id}`,
          rows: controlRows,
          empty: 'The hazards here have no controls yet. Link controls on a hazard\'s page.',
          columns: [
            idColumn((c) => c.control, controlLabel, (c) => go(idTag(controlLabel(c.control)), 'control', { id: c.control.id })),
            { key: 'control', label: `Controls on ${p.name}`, width: 440, minWidth: 180, value: (c) => c.control.title, filter: 'text',
              render: (c) => html`${go(c.control.title, 'control', { id: c.control.id })}${statusTag(c.control.status)}` },
            { key: 'hazard', label: 'For hazard', width: 300, minWidth: 140, value: (c) => hazardLabel(c.hazard), filter: 'text',
              render: (c) => go(idTag(hazardLabel(c.hazard)), 'hazard', { id: c.hazard.id }) },
            { ...tierColumn((c) => c.control), render: (c) => html`<select class="quiet" name="tier" aria-label="Tier of ${c.control.title}" ${dataAttrs({ change: 'updateControl', id: c.control.id })}>${option('', 'Not set', c.control.tier ?? '')}${CONTROL_TIERS.map((t) => option(t, t, c.control.tier ?? ''))}</select>` },
            { key: 'kind', label: 'Kind', width: 240, minWidth: 140, value: (c) => c.kind,
              render: (c) => html`<select class="quiet" name="kind" aria-label="Kind of ${c.control.title}" title="Kind for this hazard, on every platform it is on" ${dataAttrs({ change: 'setControlKind', 'hazard-id': c.hazard.id, 'control-id': c.control.id })}>${CONTROL_KINDS.map((k) => option(k, k, c.kind))}</select>` },
            { key: 'owner', label: 'Owner', width: 260, minWidth: 150, value: (c) => ownerText(controlOwner(data, c.control.id, id)), render: (c) => ownerSelect(data, c.control, id, p.name) },
            { key: 'state', label: 'Status', width: 280, minWidth: 180, value: (c) => CONTROL_STATUSES.indexOf(c.state), filter: 'select',
              options: CONTROL_STATUSES.map((s) => /** @type {[string, string]} */ ([s, s])), match: (c, v) => c.state === v,
              render: (c) => statusSelect(data, { hazardId: c.hazard.id, control: c.control, platformId: id, state: c.state }) },
            { key: 'reason', label: 'Reason rejected, or who set it', width: 640, minWidth: 220, sortable: false, render: (c) => rejectionCell(state, c, c.hazard.id, id, p.name) },
          ],
        }) },
        { key: 'references', label: 'References', icon: 'references', badge: referencesFor(data, 'platform', id).length, body: () => referencesCard(state, data, { kind: 'platform', id }) },
      ], 'hazards')}
    </article>
    ${state.confirmDelete?.kind === 'platform' && state.confirmDelete.id === id ? deletePanel('platform', id, deleteName('platform', p)) : html`<div class="actions page-actions">${actions}</div>`}`;
}

export { stateTag };

/** How a status reads when the control's owner on the platform is the customer, or us. */
const STATE_WORDS = {
  customer: { recommended: 'Recommended to customer', planned: 'Planned by customer', implemented: 'Implemented by customer', rejected: 'Rejected by customer' },
  us: { recommended: 'Recommended', planned: 'Planned', implemented: 'Implemented', rejected: 'Rejected' },
};

/**
 * An additional control's status on a platform, worded for who owns it there: the customer's
 * four, or our three (Planned, Implemented, Rejected: nothing for us to recommend to ourselves,
 * though one not yet decided still shows as Recommended). With no owner, the plain words.
 * @param {Data} data @param {{ hazardId: string, control: any, platformId: string, state: string }} c
 */
export function statusSelect(data, { hazardId, control, platformId, state }) {
  const owner = controlOwner(data, control.id, platformId)?.owner;
  const words = owner === 'customer' || owner === 'us' ? STATE_WORDS[owner] : null;
  const shown = owner === 'us' ? CONTROL_STATUSES.filter((s) => s !== 'recommended' || s === state) : CONTROL_STATUSES;
  return html`<select class="quiet state-select state-${state}" name="value" aria-label="Status of ${control.title}" ${dataAttrs({ change: 'setControlState', 'hazard-id': hazardId, 'control-id': control.id, 'platform-id': platformId })}>${shown.map((s) => option(s, words ? words[/** @type {'planned'} */ (s)] : s, state))}</select>`;
}

const OWNER_WORD = { us: 'Us', customer: 'Customer', other: 'Other' };

/** Who owns a control on a platform, chosen in place; another party is named beside it. @param {Data} data @param {any} control @param {string} platformId @param {string} platformName */
export function ownerSelect(data, control, platformId, platformName) {
  const o = controlOwner(data, control.id, platformId);
  const at = { change: 'setControlOwner', 'control-id': control.id, 'platform-id': platformId };
  return html`<select class="quiet" name="owner" aria-label="Owner of ${control.title} on ${platformName}" ${dataAttrs(at)}>${option('', 'Not set', o?.owner ?? '')}${OWNERS.map((w) => option(w, OWNER_WORD[/** @type {'us'} */ (w)], o?.owner ?? ''))}</select>${o?.owner === 'other' ? html` <input class="quiet owner-name" name="ownerName" value="${o.ownerName}" placeholder="Who owns it…" aria-label="Owner's name" ${dataAttrs(at)}>` : ''}`;
}
