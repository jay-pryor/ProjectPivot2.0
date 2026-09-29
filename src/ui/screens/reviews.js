import { html } from '../html.js';
import { dataAttrs, confirmButton, reviewTag } from './common.js';
import { openReview, lastReviewed } from '../../core/queries.js';
import { reviewState } from '../../core/time.js';
import { MAX_REVIEW_MONTHS } from '../../core/ops/reviews.js';
import { day } from '../names.js';

/** @typedef {import('../../core/data.js').Data} Data */

/**
 * The platform's review schedule as a line of the document, changed in place, with the button
 * that starts or continues a review.
 * @param {any} state @param {Data} data @param {any} p the platform
 */
export function reviewLine(state, data, p) {
  const s = reviewState(p, state.today);
  const last = lastReviewed(data, p.id);
  const lastText = last ? html`<span class="muted">· last reviewed ${day(last)}</span>` : html`<span class="muted">· never reviewed</span>`;
  const start = p.status !== 'live' ? ''
    : openReview(data, p.id)
      ? html`<button type="button" ${dataAttrs({ action: 'go', view: 'platform', id: p.id, tab: 'reviews' })}>Continue review</button>`
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
