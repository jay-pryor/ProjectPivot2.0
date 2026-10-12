import { html, raw, esc } from '../html.js';
import { TOUR_STEPS } from '../tour/steps.js';

/** @param {Record<string, string | number>} a */
const attrs = (a) => raw(Object.entries(a).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' '));

/** Whether the page shown is the one a step is on. @param {any} view @param {any} sv */
const onStepPage = (view, sv) => view?.name === sv.name && (sv.id === undefined || view.id === sv.id) && (sv.tab === undefined || view.tab === sv.tab);

/**
 * The tutorial over the page: a spotlight (placed by mount over the step's target) and a bubble
 * saying what it is, or, away from the step's page, a card in the corner to come back.
 * @param {any} state
 */
export function tourOverlay(state) {
  if (!state.tour) return '';
  const n = state.tour.step;
  const step = TOUR_STEPS[n];
  if (!onStepPage(state.view, step.view)) {
    return html`<aside class="tour-card" aria-label="Tutorial"><span>Tutorial paused</span><button type="button" class="primary small" ${attrs({ action: 'tourTo', step: n })}>Back to the tutorial (step ${n + 1})</button></aside>`;
  }
  const last = n === TOUR_STEPS.length - 1;
  return html`<div class="tour-spotlight" aria-hidden="true"></div>
    <section class="tour-bubble${step.target ? '' : ' centred'}" role="dialog" aria-label="Tutorial" ${step.target ? attrs({ 'tour-target': step.target }) : ''} ${attrs({ 'tour-step': n })}>
      <p class="tour-count">Step ${n + 1} of ${TOUR_STEPS.length}</p>
      <h2>${step.title}</h2><p>${step.text}</p>
      ${step.try ? html`<p class="tour-try"><strong>✋ Your turn:</strong> ${step.try.says}</p>` : ''}
      <div class="tour-buttons">${n > 0 ? html`<button type="button" ${attrs({ action: 'tourBack' })}>Back</button>` : ''}
        <button type="button" class="primary" ${attrs({ action: 'tourNext' })}>${last ? 'Finish' : 'Next'}</button>
        <button type="button" class="link tour-skip" ${attrs({ action: 'tourSkip' })}>Skip tutorial</button></div>
    </section>`;
}

/** The line under the top bar while the tutorial runs. @param {any} state */
export function tourBanner(state) {
  if (!state.tour) return '';
  return html`<div class="tour-banner" role="status"><strong>Tutorial:</strong> sample data. Nothing here is saved. <button type="button" class="small" ${attrs({ action: 'endTour' })}>Leave tutorial</button></div>`;
}
