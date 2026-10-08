import { RECEPTORS, RECEPTOR_LETTER, stageKey } from '../../core/receptors.js';
import { html, raw } from '../html.js';
import { dataAttrs, confirmButton, reviewTag, go, bandTag, idTag, option } from './common.js';
import { dataTable } from './table.js';
import { get, live, all } from '../../core/data.js';
import { openReview, lastReviewed, completedReviews, bandOf, listPlatformGroups, groupsOf } from '../../core/queries.js';
import { scheduleOf, POLICY_BANDS } from '../../core/schedule.js';
import { MAX_REVIEW_MONTHS } from '../../core/ops/reviews.js';
import { workflowLabel } from '../../core/ids.js';
import { BANDS } from '../../core/matrix.js';
import { day, when, profileName, periodWord } from '../names.js';
import { ruleWord, driverWord } from '../review-words.js';
import { DEFAULT_REVIEWS_PREFS } from '../reviews-prefs.js';
import { timelineView } from './timeline.js';
import { sectionRail } from './dashboard.js';

/** @typedef {import('../../core/data.js').Data} Data */

/**
 * A platform's review rule as it stands, with Edit: nothing on the card changes it directly, so
 * trying a setting never saves (or warns about) one not yet chosen.
 * @param {Data} data @param {any} p
 */
function ruleText(data, p) {
  const r = p.reviewRule;
  const pol = r?.kind === 'policy' ? get(data, 'reviewPolicy', r.policyId) : null;
  const what = !r ? html`<div class="rv-big muted">No schedule</div>`
    : r.kind === 'fixed' ? html`<div class="rv-big">Fixed · every ${periodWord(r.months)}</div>`
      : html`<div class="rv-big">${ruleWord(data, p)}</div>`;
  return html`${what}
    ${r && p.reviewStart ? html`<div class="rv-line muted">Counted from ${day(p.reviewStart)}</div>` : ''}
    <div class="rv-foot"><button type="button" class="small" ${dataAttrs({ action: 'editRule', 'platform-id': p.id })}>Edit review rule</button>
      ${pol && pol.status === 'live' ? html`<button type="button" class="link" ${dataAttrs({ action: 'showPolicy', id: pol.id })}>Edit policy →</button>` : ''}</div>`;
}

/**
 * The rule being edited: a draft kept on screen until Confirm saves it in one step (and only then
 * may the review date move and say so), or Cancel drops it.
 * @param {Data} data @param {any} p @param {{ kind: string, value: string, unit: string, policyId: string | null, start: string }} draft
 */
function ruleForm(data, p, draft) {
  const field = { change: 'setRuleDraft', 'platform-id': p.id };
  const policies = live(data, 'reviewPolicy').sort((a, b) => a.order - b.order);
  const k = draft.kind;
  return html`<div class="rv-big"><select name="kind" aria-label="Review rule" ${dataAttrs(field)}>
      ${option('none', 'No schedule', k)}${option('fixed', 'Fixed period', k)}${policies.length || k === 'policy' ? option('policy', 'Review policy', k) : ''}</select></div>
    ${k === 'fixed' ? html`<div class="rv-line">Every <input type="number" name="value" value="${draft.value}" min="1" max="${MAX_REVIEW_MONTHS}" aria-label="Period" ${dataAttrs(field)}>
      <select name="unit" aria-label="Period unit" ${dataAttrs(field)}>${option('months', 'months', draft.unit)}${option('years', 'years', draft.unit)}</select></div>` : ''}
    ${k === 'policy' ? html`<div class="rv-line"><select name="policyId" aria-label="Review policy" ${dataAttrs(field)}>${policies.map((x) => option(x.id, x.name, draft.policyId ?? ''))}</select></div>` : ''}
    ${k !== 'none' ? html`<div class="rv-line"><label>Counted from <input type="date" name="start" value="${draft.start}" ${dataAttrs(field)}></label></div>` : ''}
    <div class="rv-foot"><button type="button" class="primary small" ${dataAttrs({ action: 'confirmRule', 'platform-id': p.id })}>Confirm</button>
      <button type="button" class="small" ${dataAttrs({ action: 'cancelRule' })}>Cancel</button></div>`;
}

/**
 * The top of a platform's review page as three cards: the rule (none, a fixed period or a review
 * policy, with the date reviews count from; changed through Edit and Confirm), the next review due (how
 * long until it or how overdue, what sets the period, and whether it has moved since the owner
 * last saw it), and the last review, with Start review.
 * @param {any} state @param {Data} data @param {any} p the platform
 */
export function reviewLine(state, data, p) {
  const s = scheduleOf(data, p.id, state.today);
  const last = lastReviewed(data, p.id);
  const inProgress = openReview(data, p.id);
  const rule = state.ruleDraft?.platformId === p.id ? ruleForm(data, p, state.ruleDraft) : ruleText(data, p);
  const days = s.due ? Math.round((Date.parse(`${s.due}T00:00:00Z`) - Date.parse(`${String(state.today).slice(0, 10)}T00:00:00Z`)) / 86_400_000) : null;
  const until = days === null ? '' : days < 0 ? `${-days} day${days === -1 ? '' : 's'} overdue` : days === 0 ? 'Due today' : `In ${days} day${days === 1 ? '' : 's'}`;
  const why = driverWord(data, s.driver);
  const due = s.due
    ? html`<div class="rv-big">${day(s.due)}</div>
      <div class="rv-line muted">Every ${periodWord(/** @type {number} */ (s.months))}${why ? `, because ${why}` : ''}</div>
      <div class="rv-foot"><span class="rv-until${days !== null && days < 0 ? ' late' : ''}">${until}</span>${reviewTag(s.state)}
        ${s.moved ? html`<span class="tag review-moved${s.urgent ? ' urgent' : ''}">Moved from ${day(/** @type {string} */ (s.seen))}</span>
          <button type="button" class="small" ${dataAttrs({ action: 'acknowledgeReviewDate', 'platform-id': p.id })}>Acknowledge</button>` : ''}</div>`
    : html`<div class="rv-big muted">—</div><div class="rv-foot muted">Set a rule to have one</div>`;
  const start = inProgress
    ? html`<span class="tag">${workflowLabel(inProgress) === 'TBC' ? 'Review' : workflowLabel(inProgress)} in progress</span> ${go('Resume →', 'workflow', { id: inProgress.id })}`
    : p.status !== 'live' ? html`<span class="muted">${p.name} is retired</span>`
      : html`<button type="button" class="primary rv-action" ${dataAttrs({ action: 'beginReview', 'platform-id': p.id })}>Start review</button>`;
  return html`<div class="dash-grid three-even review-cards">
    <section class="dash-card rv-card" aria-label="Review rule"><h3 class="dash-card-h">Review rule</h3>${rule}</section>
    <section class="dash-card rv-card${s.state === 'overdue' ? ' rv-overdue' : s.state === 'dueSoon' ? ' rv-soon' : ''}" aria-label="Next review due"><h3 class="dash-card-h">Next review due</h3>${due}</section>
    <section class="dash-card rv-card" aria-label="Last reviewed"><h3 class="dash-card-h">Last reviewed</h3>
      <div class="rv-big${last ? '' : ' muted'}">${last ? day(last) : 'Never'}</div>
      <div class="rv-foot">${start}</div></section>
  </div>`;
}

const needsSchedule = html`<p class="muted">Completing a review needs a review schedule: set one above.</p>`;

/** @param {any} state @param {Data} data @param {any} p @param {any} review */
function completedReview(state, data, p, review) {
  return html`<p class="doc-meta">Completed by ${profileName(state, review.completedBy)}, ${when(review.completedAt)}. It cleared the review due ${day(review.dueBefore)}; the next was then due ${day(review.dueAfter)}.</p>
    ${review.outcome ? html`<p class="outcome-text">${review.outcome}</p>` : ''}
    ${review.notes ? html`<h3>Additional notes</h3><p class="outcome-text">${review.notes}</p>` : ''}
    ${review.workflowId && get(data, 'workflow', review.workflowId)
      ? go(`Open ${workflowLabel(get(data, 'workflow', review.workflowId))} →`, 'workflow', { id: review.workflowId })
      : html`<p class="muted">Recorded before workflows.</p>`}`;
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
        render: (c) => go(day(c.review.completedAt), 'platformReview', { id: p.id, 'review-id': c.review.id }) },
      { key: 'by', label: 'By', width: 170, minWidth: 100, value: (c) => profileName(state, c.review.completedBy) },
      { key: 'cleared', label: 'Review due', width: 180, minWidth: 130, value: (c) => c.review.dueBefore, render: (c) => day(c.review.dueBefore) },
      { key: 'outcome', label: 'Outcome', width: 460, minWidth: 200, value: (c) => c.review.outcome },
      { key: 'notes', label: 'Additional notes', width: 460, minWidth: 200, value: (c) => c.review.notes ?? '' },
    ],
  });
}

/**
 * The body of a platform's review page: the rule and dates, the review in progress (or a way to
 * start one), and the past reviews, one of which can be opened read-only.
 * @param {any} state @param {Data} data @param {any} p
 */
function reviewsTab(state, data, p) {
  const chosen = state.view?.reviewId ? get(data, 'review', state.view.reviewId) : null;
  if (chosen && chosen.status === 'live' && chosen.state === 'completed' && chosen.platformId === p.id) return completedReview(state, data, p, chosen);
  const open = openReview(data, p.id);
  const top = open ? html`<p>${idTag(workflowLabel(open))} is in progress, owned by ${profileName(state, open.ownerId)}. ${go('Resume →', 'workflow', { id: open.id })}</p>`
    : p.status !== 'live' ? html`<p class="muted">${p.name} is retired, so it cannot be reviewed.</p>`
      : html`<p>No review in progress.</p>${scheduleOf(data, p.id, state.today).due ? '' : needsSchedule}`;
  return html`${reviewLine(state, data, p)}${top}<h2>Past reviews</h2><section class="block">${pastReviews(state, data, p)}</section>`;
}

/**
 * A platform's page in the Reviews tab, where its reviews are scheduled and carried out.
 * @param {any} state @param {Data} data @param {string} id
 */
export function platformReviewView(state, data, id) {
  const p = get(data, 'platform', id);
  if (!p || p.status === 'deleted') return html`<p class="muted">That platform no longer exists.</p>`;
  return html`<div class="head"><h1>${go('Reviews', 'reviews')} · ${go(p.name, 'platform', { id })}</h1></div>
    <article class="doc">${reviewsTab(state, data, p)}</article>`;
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
 * field (value or unit); the handler takes the other from the record. An empty cell shows the
 * unit chosen for it on screen, if any, so years can be picked before the number is typed.
 * @param {number | null} months @param {Record<string, string>} attrs the change and what it is for @param {string} label @param {string} [chosen] the unit picked for an empty cell
 */
function periodInput(months, attrs, label, chosen) {
  const { n, unit } = asUnit(months);
  const shown = months == null && chosen ? chosen : unit;
  return html`<span class="period-input"><input type="number" name="value" value="${n}" min="1" max="${MAX_REVIEW_MONTHS}" aria-label="${label}" ${dataAttrs(attrs)}>
    <select name="unit" aria-label="${label}: unit" ${dataAttrs(attrs)}>${option('months', 'months', shown)}${option('years', 'years', shown)}</select></span>`;
}

const RECEPTOR_TITLE = { personnel: 'Personnel', environment: 'Environment', capability: 'Capability' };

/**
 * One policy, as its menu opens it: its name, a grid of a period for each residual band and
 * receptor, the platforms using it, and Delete.
 * @param {any} state @param {Data} data @param {any} pol @param {any[]} users the platforms (not deleted) it schedules
 */
function policyPanel(state, data, pol, users) {
  const title = (/** @type {string} */ r) => RECEPTOR_TITLE[/** @type {'personnel'} */ (r)];
  const grid = html`<table class="policy-grid"><thead><tr><th scope="col">Residual band</th>${RECEPTORS.map((r) => html`<th scope="col">
      <label class="considered"><input type="checkbox" name="considered"${pol.receptors[r].considered ? raw(' checked') : ''} ${dataAttrs({ change: 'updateReviewPolicy', id: pol.id, receptor: r })}> ${title(r)}</label></th>`)}</tr></thead>
    <tbody>${POLICY_BANDS.map((band) => html`<tr><th scope="row">${bandTag(band)}</th>${RECEPTORS.map((r) => html`<td class="${pol.receptors[r].considered ? '' : 'off'}">
      ${periodInput(pol.receptors[r].periods[band] ?? null, { change: 'setPolicyCell', id: pol.id, receptor: r, band }, `${title(r)}, ${band}`, state.policyUnits?.[`${pol.id}|${r}|${band}`])}</td>`)}</tr>`)}</tbody></table>`;
  return html`<label class="doc-subtitle"><span class="field-label">Policy</span>
      <input class="quiet title" name="name" value="${pol.name}" aria-label="Policy name" ${dataAttrs({ change: 'renameReviewPolicy', id: pol.id })}></label>
    <p class="muted">Leave a cell blank when that band should not drive a review, and untick a receptor to leave it out. A platform is reviewed at the shortest period any of its hazards gives; when none falls in a band with a period, it has no review date.</p>
    ${grid}
    <p>Used by ${users.length ? users.map((p, i) => html`${i ? ', ' : ''}${go(p.name, 'platformReview', { id: p.id })}`) : html`<span class="muted">no platforms</span>`}</p>
    <div class="actions"><button type="button" class="danger" ${dataAttrs({ action: 'removeReviewPolicy', id: pol.id })}${users.length ? raw(' disabled title="Give its platforms another rule first"') : ''}>Delete policy</button></div>`;
}

/**
 * The Policies sub-tab: a way to add one at the top; below the line, the policies as a menu, the
 * one chosen open beside it.
 * @param {any} state @param {Data} data
 */
function policiesView(state, data) {
  const policies = live(data, 'reviewPolicy').sort((a, b) => a.order - b.order);
  const usersOf = (/** @type {any} */ pol) => all(data, 'platform').filter((p) => p.status !== 'deleted' && p.reviewRule?.kind === 'policy' && p.reviewRule.policyId === pol.id);
  const top = html`<div class="policy-top">
    <h3 class="policy-top-h">New policy</h3>
    <form data-action="newReviewPolicy" class="new-policy"><input name="name" placeholder="Policy name" aria-label="New policy name" required><button type="submit" class="small">Add policy</button></form>
  </div>`;
  if (!policies.length) return html`${top}<p class="muted">No review policies yet.</p>`;
  return html`${top}${sectionRail(state, 'reviewPolicies', policies.map((pol) => {
    const users = usersOf(pol);
    return { key: pol.id, label: pol.name, icon: 'calendar', badge: users.length, body: () => policyPanel(state, data, pol, users) };
  }), policies[0].id, 'Policies')}`;
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
