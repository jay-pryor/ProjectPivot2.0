import { RECEPTORS, RECEPTOR_LETTER, stageKey } from '../../core/receptors.js';
import { html, raw } from '../html.js';
import { dataAttrs, confirmButton, reviewTag, go, bandTag, idTag, option } from './common.js';
import { dataTable } from './table.js';
import { get, live } from '../../core/data.js';
import { openReview, lastReviewed, reviewRows, completedReviews, bandOf, listPlatformGroups, groupsOf } from '../../core/queries.js';
import { scheduleOf, POLICY_BANDS } from '../../core/schedule.js';
import { MAX_REVIEW_MONTHS } from '../../core/ops/reviews.js';
import { BANDS } from '../../core/matrix.js';
import { day, when, profileName, periodWord } from '../names.js';
import { ruleWord, driverWord } from '../review-words.js';
import { DEFAULT_REVIEWS_PREFS } from '../reviews-prefs.js';
import { timelineView } from './timeline.js';

/** @typedef {import('../../core/data.js').Data} Data */

/**
 * The top of a platform's Reviews tab as three cards: the schedule (set with a button, then its
 * months changed in place, and removable), the next review due (its date changed in place, how
 * long until it or how overdue), and the last review, with Start review.
 * @param {any} state @param {Data} data @param {any} p the platform
 */
export function reviewLine(state, data, p) {
  const sched = scheduleOf(data, p.id, state.today);
  const s = sched.state;
  const last = lastReviewed(data, p.id);
  const inProgress = openReview(data, p.id);
  const setting = state.editing?.kind === 'schedule' && state.editing.id === p.id;
  // Interim: a fixed rule only, set from a form; the rule card is rebuilt with policies later.
  const schedule = p.reviewRule
    ? html`<div class="rv-big">${p.reviewRule.kind === 'fixed' ? `Every ${p.reviewRule.months} months` : 'Review policy'}</div>
      <div class="rv-foot">${confirmButton('Remove schedule', 'Remove the review schedule', dataAttrs({ action: 'setRule', 'platform-id': p.id, kind: 'none' }))}</div>`
    : setting
      ? html`<form data-action="setRule" ${dataAttrs({ 'platform-id': p.id, kind: 'fixed', unit: 'months' })} class="rv-form">
        <label>Every <input type="number" class="months" name="months" min="1" max="${MAX_REVIEW_MONTHS}" required aria-label="Months between reviews" autofocus> months</label>
        <label>Counted from <input type="date" name="start" required aria-label="Reviews counted from"></label>
        <div class="actions"><button type="submit" class="primary">Set schedule</button><button type="button" ${dataAttrs({ action: 'cancelEdit' })}>Cancel</button></div></form>`
      : html`<div class="rv-big muted">No schedule</div>
        <div class="rv-foot"><button type="button" class="primary rv-action" ${dataAttrs({ action: 'startEdit', kind: 'schedule', id: p.id })}>Set schedule</button></div>`;
  const days = sched.due ? Math.round((Date.parse(`${sched.due}T00:00:00Z`) - Date.parse(`${String(state.today).slice(0, 10)}T00:00:00Z`)) / 86_400_000) : null;
  const until = days === null ? '' : days < 0 ? `${-days} day${days === -1 ? '' : 's'} overdue` : days === 0 ? 'Due today' : `In ${days} day${days === 1 ? '' : 's'}`;
  const due = sched.due
    ? html`<div class="rv-big">${day(sched.due)}</div>
      <div class="rv-foot"><span class="rv-until${days !== null && days < 0 ? ' late' : ''}">${until}</span>${reviewTag(s)}</div>`
    : html`<div class="rv-big muted">—</div><div class="rv-foot muted">Set a schedule to have one</div>`;
  const start = inProgress
    ? html`<span class="tag">Review in progress</span>`
    : p.status !== 'live' ? html`<span class="muted">${p.name} is retired</span>`
      : html`<button type="button" class="primary rv-action" ${dataAttrs({ action: 'beginReview', 'platform-id': p.id })}>Start review</button>`;
  return html`<div class="dash-grid three-even review-cards">
    <section class="dash-card rv-card" aria-label="Review schedule"><h3 class="dash-card-h">Review schedule</h3>${schedule}</section>
    <section class="dash-card rv-card${s === 'overdue' ? ' rv-overdue' : s === 'dueSoon' ? ' rv-soon' : ''}" aria-label="Next review due"><h3 class="dash-card-h">Next review due</h3>${due}</section>
    <section class="dash-card rv-card" aria-label="Last reviewed"><h3 class="dash-card-h">Last reviewed</h3>
      <div class="rv-big${last ? '' : ' muted'}">${last ? day(last) : 'Never'}</div>
      <div class="rv-foot">${start}</div></section>
  </div>`;
}

/** @param {{ recommended: number, planned: number, implemented: number, rejected: number }} c */
function controlSummary(c) {
  const parts = /** @type {[string, number][]} */ ([['implemented', c.implemented], ['planned', c.planned], ['recommended', c.recommended], ['rejected', c.rejected]]).filter(([, n]) => n);
  return parts.length ? parts.map(([s, n]) => `${n} ${s}`).join(' · ') : html`<span class="muted">No controls</span>`;
}

const needsSchedule = html`<p class="muted">Completing a review needs a review schedule: set one above.</p>`;

/** @param {any} state @param {Data} data @param {any} p @param {any} review */
function openReviewBlock(state, data, p, review) {
  const items = reviewRows(data, review.id);
  const unticked = items.filter((i) => i.onPlatform && !i.reviewed).length;
  const noting = (/** @type {any} */ i) => state.editing?.kind === 'reviewNote' && state.editing.id === i.hazard.id;
  const band = (/** @type {any} */ pair) => bandOf(pair);
  return html`<p class="muted">Started by ${profileName(state, review.createdBy)}, ${when(review.createdAt)}. Tick each hazard once its ratings and controls are checked on the Details tab.</p>
    <section class="block">${dataTable(state, {
      id: 'reviewRows',
      rowKey: (i) => i.hazard.id,
      rows: items,
      empty: 'This platform has no hazards to review.',
      columns: [
        { key: 'reportId', label: 'ID', width: 140, minWidth: 100, value: (i) => i.reportId, render: (i) => idTag(i.reportId) },
        { key: 'hazard', label: 'Hazard', width: 340, minWidth: 200, value: (i) => i.hazard.title, filter: 'text',
          render: (i) => html`${go(i.hazard.title, 'hazard', { id: i.hazard.id })}${i.onPlatform ? '' : html` <span class="muted">(no longer on this platform)</span>`}` },
        ...RECEPTORS.map((x) => ({ key: stageKey('residual', x), label: `Residual (${RECEPTOR_LETTER[/** @type {'personnel'} */ (x)]})`, width: 150, minWidth: 120,
          value: (/** @type {any} */ i) => (i.ratings ? BANDS.indexOf(band(i.ratings.residual[x])) : null),
          render: (/** @type {any} */ i) => (i.ratings ? bandTag(band(i.ratings.residual[x])) : '—') })),
        { key: 'controls', label: 'Controls', width: 260, minWidth: 180, sortable: false, render: (i) => (i.counts ? controlSummary(i.counts) : '—') },
        { key: 'reviewed', label: 'Reviewed', width: 130, minWidth: 110, value: (i) => (i.reviewed ? 'yes' : 'no'), filter: 'select', options: [['yes', 'Yes'], ['no', 'No']],
          render: (i) => html`<input type="checkbox" name="reviewed" aria-label="Reviewed: ${i.hazard.title}"${i.reviewed ? raw(' checked') : ''}${i.onPlatform ? '' : raw(' disabled')} ${dataAttrs({ change: 'tickReviewRow', 'review-id': review.id, 'hazard-id': i.hazard.id })}>` },
        { key: 'note', label: 'Review note', width: 420, minWidth: 220, value: (i) => i.note, filter: 'text',
          render: (i) => (noting(i)
            ? html`<input class="cell-edit" name="note" value="${i.note}" placeholder="What was checked or found…" aria-label="Note on ${i.hazard.title}" autofocus ${dataAttrs({ change: 'markRow', 'review-id': review.id, 'hazard-id': i.hazard.id })}>`
            : i.onPlatform
              ? html`<button type="button" class="cell-text cell-button" ${dataAttrs({ action: 'startEdit', kind: 'reviewNote', id: i.hazard.id })} title="Click to change">${i.note || html`<span class="muted">Add a note…</span>`}</button>`
              : html`<span class="cell-text">${i.note}</span>`) },
      ],
    })}</section>
    <label class="outcome">Outcome
      <textarea name="outcome" rows="3" placeholder="What the review found, and anything to follow up…" ${dataAttrs({ change: 'setReviewOutcome', 'review-id': review.id })}>${review.outcome}</textarea></label>
    <label class="outcome">Additional notes
      <textarea name="notes" rows="4" placeholder="Anything else worth keeping with this review…" ${dataAttrs({ change: 'setReviewNotes', 'review-id': review.id })}>${review.notes ?? ''}</textarea></label>
    <div class="actions">
      <button type="button" class="primary" ${dataAttrs({ action: 'completeReview', 'review-id': review.id })}${scheduleOf(data, p.id, state.today).due ? '' : raw(' disabled')}>${unticked ? `Complete — ${unticked} not ticked` : 'Complete review'}</button>
      ${confirmButton('Abandon…', 'Abandon this review, discarding its ticks and notes', dataAttrs({ action: 'abandonReview', 'review-id': review.id }))}
    </div>
    ${scheduleOf(data, p.id, state.today).due ? '' : needsSchedule}`;
}

/** @param {any} state @param {Data} data @param {any} p @param {any} review */
function completedReview(state, data, p, review) {
  return html`<p class="doc-meta">Completed by ${profileName(state, review.completedBy)}, ${when(review.completedAt)}. It cleared the review due ${day(review.dueBefore)}; the next was then due ${day(review.dueAfter)}.</p>
    ${review.outcome ? html`<p class="outcome-text">${review.outcome}</p>` : ''}
    ${review.notes ? html`<h3>Additional notes</h3><p class="outcome-text">${review.notes}</p>` : ''}
    <section class="block">${dataTable(state, {
      id: 'reviewRecord',
      rowKey: (i) => i.hazard.id,
      rows: reviewRows(data, review.id),
      empty: 'The platform had no hazards when this review was completed.',
      columns: [
        { key: 'reportId', label: 'ID', width: 140, minWidth: 100, value: (i) => i.reportId, render: (i) => idTag(i.reportId) },
        { key: 'hazard', label: 'Hazard', width: 440, minWidth: 200, value: (i) => i.hazard.title, render: (i) => go(i.hazard.title, 'hazard', { id: i.hazard.id }) },
        { key: 'reviewed', label: 'Reviewed', width: 150, minWidth: 110, value: (i) => (i.reviewed ? 'Yes' : 'No'), filter: 'select', options: [['Yes', 'Yes'], ['No', 'No']] },
        { key: 'note', label: 'Review note', width: 600, minWidth: 220, value: (i) => i.note },
      ],
    })}</section>`;
}

/** @param {any} state @param {Data} data @param {any} p */
function pastReviews(state, data, p) {
  return dataTable(state, {
    id: 'pastReviews',
    rowKey: (c) => c.review.id,
    rows: completedReviews(data, p.id),
    empty: 'No completed reviews yet.',
    columns: [
      { key: 'completed', label: 'Completed', width: 190, minWidth: 140, value: (c) => c.review.completedAt,
        render: (c) => go(day(c.review.completedAt), 'platform', { id: p.id, tab: 'reviews', 'review-id': c.review.id }) },
      { key: 'by', label: 'By', width: 170, minWidth: 100, value: (c) => profileName(state, c.review.completedBy) },
      { key: 'cleared', label: 'Review due', width: 180, minWidth: 130, value: (c) => c.review.dueBefore, render: (c) => day(c.review.dueBefore) },
      { key: 'outcome', label: 'Outcome', width: 460, minWidth: 200, value: (c) => c.review.outcome },
      { key: 'notes', label: 'Additional notes', width: 460, minWidth: 200, value: (c) => c.review.notes ?? '' },
      { key: 'ticked', label: 'Reviewed', width: 140, minWidth: 100, value: (c) => c.ticked },
      { key: 'notTicked', label: 'Not reviewed', width: 160, minWidth: 110, value: (c) => c.notTicked },
    ],
  });
}

/**
 * The platform's Reviews tab: the review in progress (or a way to start one), and the past
 * reviews, one of which can be opened read-only.
 * @param {any} state @param {Data} data @param {any} p
 */
export function reviewsTab(state, data, p) {
  const chosen = state.view?.reviewId ? get(data, 'review', state.view.reviewId) : null;
  if (chosen && chosen.status === 'live' && chosen.state === 'completed' && chosen.platformId === p.id) return completedReview(state, data, p, chosen);
  const open = openReview(data, p.id);
  const top = open ? openReviewBlock(state, data, p, open)
    : p.status !== 'live' ? html`<p class="muted">${p.name} is retired, so it cannot be reviewed.</p>`
      : html`<p>No review in progress.</p>${scheduleOf(data, p.id, state.today).due ? '' : needsSchedule}`;
  return html`${reviewLine(state, data, p)}${top}<h2>Past reviews</h2><section class="block">${pastReviews(state, data, p)}</section>`;
}

/** Whose platforms the Reviews tab shows: the active profile for "me", everyone as null. @param {any} state */
export function reviewsOwnerId(state) {
  const o = state.reviewsPrefs?.owner || 'me';
  return o === 'everyone' ? null : o === 'me' ? state.profileId : o;
}

/** The live platforms the Reviews filters let through. @param {any} state @param {Data} data */
export function reviewsPlatforms(state, data) {
  const owner = reviewsOwnerId(state);
  const groupId = state.reviewsPrefs?.groupId ?? null;
  return live(data, 'platform')
    .filter((p) => owner == null || p.ownerId === owner)
    .filter((p) => !groupId || groupsOf(data, p.id).some((g) => g.id === groupId));
}

/** The owner and platform group choosers, shared by Schedule and Timeline. @param {any} state @param {Data} data */
function reviewsFilters(state, data) {
  const prefs = state.reviewsPrefs ?? DEFAULT_REVIEWS_PREFS;
  const groups = listPlatformGroups(data);
  return html`<div class="rv-filters">
    <label class="owner-pick">Owner <select name="owner" ${dataAttrs({ change: 'setReviewsFilter' })}>
      ${option('me', 'Me', prefs.owner)}${state.profiles.filter((/** @type {any} */ p) => p.id !== state.profileId).map((/** @type {any} */ p) => option(p.id, p.name, prefs.owner))}${option('everyone', 'Everyone', prefs.owner)}
    </select></label>
    ${groups.length ? html`<label class="owner-pick">Group <select name="groupId" ${dataAttrs({ change: 'setReviewsFilter' })}>
      ${option('', 'All', prefs.groupId ?? '')}${groups.map((g) => option(g.id, g.name, prefs.groupId ?? ''))}</select></label>` : ''}
  </div>`;
}

const STATE_RANK = { overdue: 0, dueSoon: 1, ok: 2, none: 3 };

/** Every platform the filters let through, with its schedule: overdue first, unscheduled last. @param {any} state @param {Data} data */
function scheduleTable(state, data) {
  const rows = reviewsPlatforms(state, data).map((platform) => ({
    platform, s: scheduleOf(data, platform.id, state.today), last: lastReviewed(data, platform.id), open: Boolean(openReview(data, platform.id)),
  }));
  const rank = (/** @type {any} */ r) => STATE_RANK[/** @type {'ok'} */ (r.s.state)];
  rows.sort((a, b) => rank(a) - rank(b) || String(a.s.due ?? '').localeCompare(String(b.s.due ?? '')) || String(a.platform.name).localeCompare(String(b.platform.name)));
  return dataTable(state, {
    id: 'reviewSchedule',
    rowKey: (r) => r.platform.id,
    rows,
    empty: 'No platforms match.',
    rowAttrs: (r) => ({ dblclick: 'go', view: 'platformReview', id: r.platform.id }),
    columns: [
      { key: 'platform', label: 'Platform', width: 260, minWidth: 160, value: (r) => r.platform.name, render: (r) => go(r.platform.name, 'platformReview', { id: r.platform.id }) },
      { key: 'owner', label: 'Owner', width: 160, minWidth: 100, value: (r) => profileName(state, r.platform.ownerId) },
      { key: 'rule', label: 'Rule', width: 220, minWidth: 140, value: (r) => ruleWord(data, r.platform) },
      { key: 'period', label: 'Period', width: 140, minWidth: 100, value: (r) => r.s.months, render: (r) => (r.s.months ? periodWord(r.s.months) : '—') },
      { key: 'driver', label: 'Set by', width: 300, minWidth: 160, value: (r) => driverWord(data, r.s.driver) },
      { key: 'start', label: 'Counted from', width: 170, minWidth: 120, value: (r) => r.s.start, render: (r) => (r.s.start ? day(r.s.start) : '—') },
      { key: 'due', label: 'Next due', width: 240, minWidth: 140, value: (r) => r.s.due,
        render: (r) => (r.s.due ? html`${day(r.s.due)}${reviewTag(r.s.state)}${r.s.moved ? html` <span class="tag review-moved${r.s.urgent ? ' urgent' : ''}">Moved</span>` : ''}` : '—') },
      { key: 'last', label: 'Last reviewed', width: 170, minWidth: 120, value: (r) => r.last, render: (r) => (r.last ? day(r.last) : html`<span class="muted">Never</span>`) },
      { key: 'open', label: 'In progress', width: 130, minWidth: 100, value: (r) => (r.open ? 'Yes' : ''), render: (r) => (r.open ? html`<span class="tag">In progress</span>` : '') },
    ],
  });
}

/** A period as the number and unit its inputs show: whole years in years. @param {number | null} months */
export const asUnit = (months) => (months == null ? { n: '', unit: 'months' } : months % 12 === 0 ? { n: String(months / 12), unit: 'years' } : { n: String(months), unit: 'months' });

/**
 * A period's number and its months/years chooser. Both send the same change, each with its own
 * field (value or unit); the handler takes the other from the record.
 * @param {number | null} months @param {Record<string, string>} attrs the change and what it is for @param {string} label
 */
function periodInput(months, attrs, label) {
  const { n, unit } = asUnit(months);
  return html`<span class="period-input"><input type="number" name="value" value="${n}" min="1" max="${MAX_REVIEW_MONTHS}" aria-label="${label}" ${dataAttrs(attrs)}>
    <select name="unit" aria-label="${label}: unit" ${dataAttrs(attrs)}>${option('months', 'months', unit)}${option('years', 'years', unit)}</select></span>`;
}

const RECEPTOR_TITLE = { personnel: 'Personnel', environment: 'Environment', capability: 'Capability' };

/**
 * The Policies sub-tab: the policies down the side, and the one chosen as a grid of a period for
 * each residual band and receptor, with the longest period and the platforms using it.
 * @param {any} state @param {Data} data
 */
function policiesView(state, data) {
  const policies = live(data, 'reviewPolicy').sort((a, b) => a.order - b.order);
  const make = html`<form data-action="newReviewPolicy" class="rv-form inline-form">
    <input name="name" placeholder="New policy name" aria-label="New policy name" required>
    <button type="submit" class="primary">Add policy</button></form>`;
  if (!policies.length) {
    return html`<p>A review policy sets how often a platform is reviewed from its residual risk: a period for each band, for each receptor you care about. The shortest period any hazard gives is used.</p>${make}`;
  }
  const pol = policies.find((x) => x.id === state.view?.id) ?? policies[0];
  const users = live(data, 'platform').filter((p) => p.reviewRule?.kind === 'policy' && p.reviewRule.policyId === pol.id);
  const title = (/** @type {string} */ r) => RECEPTOR_TITLE[/** @type {'personnel'} */ (r)];
  const list = html`<ul class="policy-list">${policies.map((x) => html`<li><button type="button" class="link${x.id === pol.id ? ' on' : ''}" ${dataAttrs({ action: 'go', view: 'reviews', tab: 'policies', id: x.id })}>${x.name}</button></li>`)}</ul>`;
  const grid = html`<table class="policy-grid"><thead><tr><th scope="col">Residual band</th>${RECEPTORS.map((r) => html`<th scope="col">
      <label class="considered"><input type="checkbox" name="considered"${pol.receptors[r].considered ? raw(' checked') : ''} ${dataAttrs({ change: 'updateReviewPolicy', id: pol.id, receptor: r })}> ${title(r)}</label></th>`)}</tr></thead>
    <tbody>${POLICY_BANDS.map((band) => html`<tr><th scope="row">${bandTag(band)}</th>${RECEPTORS.map((r) => html`<td class="${pol.receptors[r].considered ? '' : 'off'}">
      ${periodInput(pol.receptors[r].periods[band] ?? null, { change: 'setPolicyCell', id: pol.id, receptor: r, band }, `${title(r)}, ${band}`)}</td>`)}</tr>`)}</tbody></table>`;
  return html`<div class="policies">${list}<article class="doc policy">
    <label class="doc-subtitle"><span class="field-label">Policy</span>
      <input class="quiet title" name="name" value="${pol.name}" aria-label="Policy name" ${dataAttrs({ change: 'renameReviewPolicy', id: pol.id })}></label>
    <p class="muted">Leave a cell blank when that band should not drive a review, and untick a receptor to leave it out. The shortest period any hazard on the platform gives is used, and never longer than the longest period.</p>
    ${grid}
    <p class="longest">Longest period ${periodInput(pol.longest, { change: 'setPolicyLongest', id: pol.id }, 'Longest period')}</p>
    <p>Used by ${users.length ? users.map((p, i) => html`${i ? ', ' : ''}${go(p.name, 'platformReview', { id: p.id })}`) : html`<span class="muted">no platforms</span>`}</p>
    <div class="actions"><button type="button" class="danger" ${dataAttrs({ action: 'removeReviewPolicy', id: pol.id })}${users.length ? raw(' disabled title="Give its platforms another rule first"') : ''}>Delete policy</button></div>
    <h3>Another policy</h3>${make}</article></div>`;
}

/**
 * The Reviews tab: every platform's schedule, the timeline, and the review policies.
 * @param {any} state @param {Data} data
 */
export function reviewsView(state, data) {
  const tab = state.view?.tab || 'schedule';
  const on = (/** @type {string} */ t) => (tab === t ? ' on' : '');
  const tabs = html`<nav class="tabs">${[['schedule', 'Schedule'], ['timeline', 'Timeline'], ['policies', 'Policies']].map(([t, label]) => html`<button type="button" class="tab${on(t)}" ${dataAttrs({ action: 'go', view: 'reviews', tab: t })}>${label}</button>`)}</nav>`;
  const head = html`<div class="head"><h1>Reviews</h1>${tab === 'policies' ? '' : reviewsFilters(state, data)}</div>${tabs}`;
  if (tab === 'timeline') return html`${head}${timelineView(state, data, reviewsPlatforms(state, data))}`;
  if (tab === 'policies') return html`${head}${policiesView(state, data)}`;
  return html`${head}<section class="block">${scheduleTable(state, data)}</section>`;
}
