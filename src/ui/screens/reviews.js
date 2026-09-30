import { html, raw } from '../html.js';
import { dataAttrs, confirmButton, reviewTag, go, bandTag, idTag } from './common.js';
import { dataTable } from './table.js';
import { get } from '../../core/data.js';
import { openReview, lastReviewed, reviewRows, completedReviews, bandOf } from '../../core/queries.js';
import { reviewState } from '../../core/time.js';
import { MAX_REVIEW_MONTHS } from '../../core/ops/reviews.js';
import { BANDS } from '../../core/matrix.js';
import { day, when, profileName } from '../names.js';

/** @typedef {import('../../core/data.js').Data} Data */

/**
 * The platform's review schedule as a line at the top of its Reviews tab, changed in place, with
 * the button that starts a review when none is open.
 * @param {any} state @param {Data} data @param {any} p the platform
 */
export function reviewLine(state, data, p) {
  const s = reviewState(p, state.today);
  const last = lastReviewed(data, p.id);
  const lastText = last ? html`<span class="muted">· last reviewed ${day(last)}</span>` : html`<span class="muted">· never reviewed</span>`;
  const start = p.status !== 'live' || openReview(data, p.id) ? ''
    : html`<button type="button" ${dataAttrs({ action: 'beginReview', 'platform-id': p.id })}>Start review</button>`;
  if (s === 'none') {
    if (state.editing?.kind === 'schedule' && state.editing.id === p.id) {
      return html`<form data-action="setSchedule" ${dataAttrs({ 'platform-id': p.id })} class="doc-meta review-line fill">
        Reviewed every <input type="number" class="months" name="months" min="1" max="${MAX_REVIEW_MONTHS}" required aria-label="Months between reviews" autofocus> months, next due
        <input type="date" name="due" required aria-label="Next review due">
        <button type="submit">Set</button><button type="button" ${dataAttrs({ action: 'cancelEdit' })}>Cancel</button></form>`;
    }
    return html`<div class="doc-meta review-line">No review schedule
      <button type="button" class="link" ${dataAttrs({ action: 'startEdit', kind: 'schedule', id: p.id })}>Set schedule</button> ${lastText} ${start}</div>`;
  }
  const field = { change: 'setScheduleField', 'platform-id': p.id };
  return html`<div class="doc-meta review-line">Reviewed every
    <input type="number" class="quiet months" name="months" min="1" max="${MAX_REVIEW_MONTHS}" value="${p.reviewMonths}" aria-label="Months between reviews" ${dataAttrs(field)}> months · next due
    <input type="date" class="quiet" name="due" value="${p.reviewDue}" aria-label="Next review due" ${dataAttrs(field)}>${reviewTag(s)}
    ${lastText}
    ${confirmButton('✕', 'Remove the review schedule', dataAttrs({ action: 'setSchedule', 'platform-id': p.id }))}
    ${start}</div>`;
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
        { key: 'residualPersonnel', label: 'Residual (P)', width: 150, minWidth: 120, value: (i) => (i.ratings ? BANDS.indexOf(band(i.ratings.residual.personnel)) : null),
          render: (i) => (i.ratings ? bandTag(band(i.ratings.residual.personnel)) : '—') },
        { key: 'residualEnvironment', label: 'Residual (E)', width: 150, minWidth: 120, value: (i) => (i.ratings ? BANDS.indexOf(band(i.ratings.residual.environment)) : null),
          render: (i) => (i.ratings ? bandTag(band(i.ratings.residual.environment)) : '—') },
        { key: 'controls', label: 'Controls', width: 260, minWidth: 180, sortable: false, render: (i) => (i.counts ? controlSummary(i.counts) : '—') },
        { key: 'reviewed', label: 'Reviewed', width: 130, minWidth: 110, value: (i) => (i.reviewed ? 'yes' : 'no'), filter: 'select', options: [['yes', 'Yes'], ['no', 'No']],
          render: (i) => html`<input type="checkbox" name="reviewed" aria-label="Reviewed: ${i.hazard.title}"${i.reviewed ? raw(' checked') : ''}${i.onPlatform ? '' : raw(' disabled')} ${dataAttrs({ change: 'tickReviewRow', 'review-id': review.id, 'hazard-id': i.hazard.id })}>` },
        { key: 'note', label: 'Note', width: 420, minWidth: 220, value: (i) => i.note, filter: 'text',
          render: (i) => (noting(i)
            ? html`<input class="cell-edit" name="note" value="${i.note}" placeholder="What was checked or found…" aria-label="Note on ${i.hazard.title}" autofocus ${dataAttrs({ change: 'markRow', 'review-id': review.id, 'hazard-id': i.hazard.id })}>`
            : i.onPlatform
              ? html`<button type="button" class="cell-text cell-button" ${dataAttrs({ action: 'startEdit', kind: 'reviewNote', id: i.hazard.id })} title="Click to change">${i.note || html`<span class="muted">Add a note…</span>`}</button>`
              : html`<span class="cell-text">${i.note}</span>`) },
      ],
    })}</section>
    <label class="outcome">Outcome
      <textarea name="outcome" rows="3" placeholder="What the review found, and anything to follow up…" ${dataAttrs({ change: 'setReviewOutcome', 'review-id': review.id })}>${review.outcome}</textarea></label>
    <div class="actions">
      <button type="button" class="primary" ${dataAttrs({ action: 'completeReview', 'review-id': review.id })}${p.reviewMonths ? '' : raw(' disabled')}>${unticked ? `Complete — ${unticked} not ticked` : 'Complete review'}</button>
      ${confirmButton('Abandon…', 'Abandon this review, discarding its ticks and notes', dataAttrs({ action: 'abandonReview', 'review-id': review.id }))}
    </div>
    ${p.reviewMonths ? '' : needsSchedule}`;
}

/** @param {any} state @param {Data} data @param {any} p @param {any} review */
function completedReview(state, data, p, review) {
  return html`<p>${go('← All reviews', 'platform', { id: p.id, tab: 'reviews' })}</p>
    <p class="doc-meta">Completed by ${profileName(state, review.completedBy)}, ${when(review.completedAt)}. It cleared the review due ${day(review.dueBefore)}; the next was then due ${day(review.dueAfter)}.</p>
    ${review.outcome ? html`<p class="outcome-text">${review.outcome}</p>` : ''}
    <section class="block">${dataTable(state, {
      id: 'reviewRecord',
      rowKey: (i) => i.hazard.id,
      rows: reviewRows(data, review.id),
      empty: 'The platform had no hazards when this review was completed.',
      columns: [
        { key: 'reportId', label: 'ID', width: 140, minWidth: 100, value: (i) => i.reportId, render: (i) => idTag(i.reportId) },
        { key: 'hazard', label: 'Hazard', width: 440, minWidth: 200, value: (i) => i.hazard.title, render: (i) => go(i.hazard.title, 'hazard', { id: i.hazard.id }) },
        { key: 'reviewed', label: 'Reviewed', width: 150, minWidth: 110, value: (i) => (i.reviewed ? 'Yes' : 'No'), filter: 'select', options: [['Yes', 'Yes'], ['No', 'No']] },
        { key: 'note', label: 'Note', width: 600, minWidth: 220, value: (i) => i.note },
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
      : html`<p>No review in progress.</p>${p.reviewMonths ? '' : needsSchedule}`;
  return html`${reviewLine(state, data, p)}${top}<h2>Past reviews</h2><section class="block">${pastReviews(state, data, p)}</section>`;
}
