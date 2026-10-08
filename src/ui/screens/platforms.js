import { html } from '../html.js';
import { dataAttrs, option, statusTag, stateTag, go, deletePanel, deleteName, levelTag, pageTabs, historyTable, plus, idTag, reviewTag, removeColumn, removeButton, recordMenu, menuItem, stateWord, rowsCounted, groupTags } from './common.js';
import { ruleWord, driverWord } from '../review-words.js';
import { REVIEW_DETAIL_ACTIONS } from '../../core/ops/reviews.js';
import { waitingChanges } from '../../core/acks.js';
import { scheduleOf } from '../../core/schedule.js';
import { dataTable } from './table.js';
import { referencesCard } from './references.js';
import { tierColumn } from './controls.js';
import { CONTROL_TIERS, CONTROL_KINDS, IMPLEMENTERS, IMPLEMENTER_WORD } from '../../core/ops/controls.js';
import { notFound, statusColumn, idColumn, newRecord } from './hazards.js';
import { all, get, live } from '../../core/data.js';
import { hazardLabel, controlLabel, platformLabel } from '../../core/ids.js';
import { platformHazards, bandOf, worseBand, openReview, lastReviewed, implementedByOf, implementedByText, referencesFor, groupsOf, listPlatformGroups } from '../../core/queries.js';
import { sectionRail, stateCounts, glance } from './dashboard.js';
import { historyReaching } from '../../core/history.js';
import { BANDS } from '../../core/matrix.js';
import { profileName, when, day, periodWord } from '../names.js';
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
        { key: 'groups', label: 'Groups', width: 300, minWidth: 120, value: (p) => groupsOf(data, p.id).map((g) => g.name).join(', '), filter: 'select',
          options: listPlatformGroups(data).map((g) => /** @type {[string, string]} */ ([g.id, g.name])), match: (p, v) => groupsOf(data, p.id).some((g) => g.id === v),
          render: (p) => groupTags(groupsOf(data, p.id)) },
        { key: 'hazards', label: 'Hazard count', width: 220, minWidth: 100, value: (p) => count(p.id) },
        { key: 'review', label: 'Next review', width: 340, minWidth: 170, value: (p) => scheduleOf(data, p.id, state.today).due, filter: 'select',
          options: [['overdue', 'Overdue'], ['dueSoon', 'Due soon'], ['ok', 'Not due yet'], ['none', 'No schedule']],
          match: (p, v) => scheduleOf(data, p.id, state.today).state === v,
          render: (p) => {
            const s = scheduleOf(data, p.id, state.today);
            return s.due ? html`${day(s.due)}${reviewTag(s.state)}` : '—';
          } },
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

/**
 * The platform page's ⋯ menu: Add image (or Change image) opens a picker for a PNG or SVG,
 * whose background is taken away before it is kept (see addPlatformImage); Remove image; Review
 * schedule… (its schedule at a glance); then Retire, Restore, or Delete… (only with no hazards on it).
 * @param {Data} data @param {any} p the platform
 */
function platformMenu(data, p) {
  if (p.status === 'deleted') return '';
  const id = p.id;
  return recordMenu('Platform options', [
    html`<label class="dots-item" role="menuitem"><span class="dots-check" aria-hidden="true"></span>${p.image ? 'Change image…' : 'Add image…'}<input type="file" accept="image/png,image/svg+xml,.png,.svg" hidden ${dataAttrs({ 'image-for': id })}></label>`,
    p.image ? menuItem('Remove image', { action: 'setPlatformImage', id }) : '',
    menuItem('Review schedule…', { action: 'showReviewPanel', id }),
    html`<hr>`,
    p.status === 'live' ? menuItem('Retire', { action: 'retirePlatform', id }) : menuItem('Restore', { action: 'restoreRecord', kind: 'platform', id }),
    p.status === 'live' && !platformHazards(data, id).length ? menuItem('Delete…', { action: 'askDelete', kind: 'platform', id }, true) : '',
  ]);
}

/**
 * The review schedule at a glance, from the platform's ⋯ menu: the rule, the period and what sets
 * it, the next review due, the last, and whether one is in progress. It is changed in Reviews.
 * @param {any} state @param {Data} data @param {any} p the platform
 */
function reviewPanel(state, data, p) {
  const s = scheduleOf(data, p.id, state.today);
  const last = lastReviewed(data, p.id);
  const why = driverWord(data, s.driver);
  return html`<div class="picker-overlay"><div class="picker review-panel" role="dialog" aria-modal="true" aria-label="Review schedule">
    <h2>Review schedule · ${p.name}</h2>
    <dl class="facts">
      <dt>Rule</dt><dd>${ruleWord(data, p)}</dd>
      <dt>Period</dt><dd>${s.months ? html`${periodWord(s.months)}${why ? html` <span class="muted">· ${why}</span>` : ''}` : '—'}</dd>
      <dt>Next due</dt><dd>${s.due ? html`${day(s.due)}${reviewTag(s.state)}${s.moved ? html` <span class="tag review-moved${s.urgent ? ' urgent' : ''}">Moved</span>` : ''}` : '—'}</dd>
      <dt>Last reviewed</dt><dd>${last ? day(last) : 'Never'}</dd>
      <dt>In progress</dt><dd>${openReview(data, p.id) ? 'Yes' : 'No'}</dd>
    </dl>
    <div class="actions">${go('Open in Reviews →', 'platformReview', { id: p.id })}
      <button type="button" ${dataAttrs({ action: 'closeReviewPanel' })} autofocus>Close</button></div></div></div>`;
}

/**
 * A platform's image in a square, bordered box with a little room around it; the picture is read
 * from the folder once the page is drawn (see platformImages in mount.js).
 * @param {any} p the platform @param {string} cls
 */
export function platformImage(p, cls) {
  return html`<div class="${cls} image-box"><img alt="${p.name}" ${dataAttrs({ stored: p.image.stored })}></div>`;
}

/**
 * A page's top row of boxes with the platform's image, if it has one, on its left, the boxes as
 * tall as the image: on the platform's page, a hazard's platform tab and a control's platform tab.
 * @param {any} p the platform @param {unknown} boxes the row (a dash-grid)
 */
export function withPlatformImage(p, boxes) {
  return html`<div class="plat-top${p.image ? ' with-image' : ''}">${p.image ? platformImage(p, 'plat-image') : ''}${boxes}</div>`;
}

/** @param {any} state @param {Data} data @param {string} id */
export function platformView(state, data, id) {
  const p = get(data, 'platform', id);
  if (!p) return notFound();
  const tab = state.view?.tab;
  const sched = scheduleOf(data, id, state.today);
  // Ticks, notes and outcome edits stay in the review itself rather than crowding the History tab.
  const reaching = historyReaching(data, id).filter((e) => !REVIEW_DETAIL_ACTIONS.includes(e.action));
  const page = tab === 'history' ? 'History' : 'Details';
  const head = html`<div class="doc-head"><h1 class="doc-page"><span class="doc-id">${idTag(platformLabel(p))}</span> <span class="doc-page-sep" aria-hidden="true">—</span> ${page}</h1>${statusTag(p.status)}${platformMenu(data, p)}</div>${state.confirmDelete?.kind === 'platform' && state.confirmDelete.id === id ? deletePanel('platform', id, deleteName('platform', p), 'Its safety reports go with it.') : ''}
    <label class="doc-subtitle"><span class="field-label">Platform</span>
      <input class="doc-title small" name="name" value="${p.name}" required aria-label="Platform name" ${dataAttrs({ change: 'updatePlatform', id })}></label>
    ${pageTabs('platform', { id }, tab, rowsCounted(data, reaching))}${state.reviewPanel === id ? reviewPanel(state, data, p) : ''}`;
  if (tab === 'history') return html`${head}${historyTable(state, data, 'platform', id, reaching)}`;

  const rows = platformHazards(data, id);
  const controlRows = rows.flatMap((r) => r.controls.map((c) => ({ ...c, hazard: r.hazard })));
  const worst = rows.map((r) => RECEPTORS.map((x) => bandOf(r.ratings.residual[x])).reduce(worseBand));
  const waiting = waitingChanges(data, id).length;
  const editing = (/** @type {string} */ kind, /** @type {string} */ key) => state.editing?.kind === kind && state.editing.id === key;
  return html`${head}
    <article class="doc dash">
      ${withPlatformImage(p, html`<div class="dash-grid three">
        <section class="dash-card" aria-label="Platform">
          <h3 class="dash-card-h">Platform</h3>
          <p class="glance-line">Owned by <select class="quiet inline-select" name="ownerId" aria-label="Owner" ${dataAttrs({ change: 'setOwner', id })}>${state.profiles.map((/** @type {any} */ pr) => option(pr.id, pr.name, p.ownerId))}</select></p>
          <p class="glance-line plat-groups">Groups ${groupsOf(data, id).map((g) => html`<span class="tag group-tag">${g.name}<button type="button" class="icon-x" title="Take ${p.name} out of ${g.name}" aria-label="Take ${p.name} out of ${g.name}" ${dataAttrs({ action: 'untagPlatform', 'platform-id': id, 'group-id': g.id })}>✕</button></span> `)}${p.status === 'deleted' ? '' : plus({ action: 'openPicker', picker: 'tagPlatforms', 'platform-id': id }, 'Add to platform groups')}</p>
          <p class="glance-line">${sched.due ? html`Next review ${day(sched.due)}${reviewTag(sched.state)}` : 'No review schedule'}
            ${go('Reviews →', 'platformReview', { id })}</p>
          ${waiting ? html`<p class="glance-line"><button type="button" class="link" ${dataAttrs({ action: 'setHomeOwner', 'owner-id': p.ownerId, show: 'home' })}>${waiting} ${waiting === 1 ? 'change' : 'changes'} to acknowledge</button></p>` : ''}
        </section>
        <section class="dash-card" aria-label="Risk">
          <h3 class="dash-card-h">Worst residual by hazard</h3>
          ${glance(rows.length, 'hazard')}
          ${rows.length ? html`<p class="glance-line glance-tags">${BANDS.map((b) => [b, worst.filter((x) => x === b).length]).filter(([, n]) => n).map(([b, n]) => html`<span class="band band-${String(b).toLowerCase().replace(/\s+/g, '-')}">${n} ${b === 'Uncategorised' ? 'not rated' : b}</span> `)}</p>` : ''}
        </section>
        <section class="dash-card" aria-label="Controls">
          <h3 class="dash-card-h">Controls</h3>
          ${glance(controlRows.length, 'control', 'controls', stateCounts(controlRows.map((c) => c.state)))}
        </section>
      </div>`)}
      ${sectionRail(state, 'platform', [
        { key: 'hazards', label: 'Hazards', icon: 'initial', badge: rows.length, body: () => dataTable(state, {
          id: 'platformHazards',
          rowKey: (r) => r.hazard.id,
          rows,
          empty: 'No hazards on this platform yet.',
          // The hazard's name opens it on this platform, and so does a double-click anywhere on its
          // row (on the Report ID, a double-click changes that instead).
          rowAttrs: (r) => ({ dblclick: 'go', view: 'hazard', id: r.hazard.id, tab: `p:${id}` }),
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
            { key: 'implementedBy', label: 'Implemented by', width: 230, minWidth: 150, value: (c) => implementedByText(implementedByOf(data, c.control.id, id)), render: (c) => implementedBySelect(data, c.control, id, p.name) },
            { key: 'state', label: 'Status', width: 280, minWidth: 180, value: (c) => CONTROL_STATUSES.indexOf(c.state), filter: 'select',
              options: CONTROL_STATUSES.map((s) => /** @type {[string, string]} */ ([s, s])), match: (c, v) => c.state === v,
              render: (c) => statusSelect(data, { hazardId: c.hazard.id, control: c.control, platformId: id, state: c.state }) },
            { key: 'reason', label: 'Reason rejected, or who set it', width: 640, minWidth: 220, sortable: false, render: (c) => rejectionCell(state, c, c.hazard.id, id, p.name) },
          ],
        }) },
        { key: 'references', label: 'References', icon: 'references', badge: referencesFor(data, 'platform', id).length, body: () => referencesCard(state, data, { kind: 'platform', id }) },
      ], 'hazards')}
    </article>`;
}

export { stateTag };

/**
 * A control's status on a platform, chosen in place: Recommended, Planned, Implemented or
 * Rejected, whoever implements it (that is its own column).
 * @param {Data} _data @param {{ hazardId: string, control: any, platformId: string, state: string }} c
 */
export function statusSelect(_data, { hazardId, control, platformId, state }) {
  return html`<select class="quiet state-select state-${state}" name="value" aria-label="Status of ${control.title}" ${dataAttrs({ change: 'setControlState', 'hazard-id': hazardId, 'control-id': control.id, 'platform-id': platformId })}>${CONTROL_STATUSES.map((s) => option(s, stateWord(s), state))}</select>`;
}

/** Who implements a control on a platform, chosen in place: OEM, HighCom or Customer. @param {Data} data @param {any} control @param {string} platformId @param {string} platformName */
export function implementedBySelect(data, control, platformId, platformName) {
  const by = implementedByOf(data, control.id, platformId) ?? '';
  return html`<select class="quiet" name="implementedBy" aria-label="Who implements ${control.title} on ${platformName}" ${dataAttrs({ change: 'setImplementedBy', 'control-id': control.id, 'platform-id': platformId })}>${option('', 'Not set', by)}${IMPLEMENTERS.map((w) => option(w, IMPLEMENTER_WORD[/** @type {'oem'} */ (w)], by))}</select>`;
}
