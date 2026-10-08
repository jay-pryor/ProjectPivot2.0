import { RECEPTORS, RECEPTOR_LETTER, stageKey } from '../../core/receptors.js';
import { html, raw } from '../html.js';
import { dataAttrs, confirmButton, reviewTag, go, bandTag, idTag } from './common.js';
import { dataTable } from './table.js';
import { get } from '../../core/data.js';
import { openReview, lastReviewed, reviewRows, completedReviews, bandOf } from '../../core/queries.js';
import { scheduleOf } from '../../core/schedule.js';
import { MAX_REVIEW_MONTHS } from '../../core/ops/reviews.js';
import { BANDS } from '../../core/matrix.js';
import { day, when, profileName } from '../names.js';

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
