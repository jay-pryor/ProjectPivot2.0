import { html } from '../html.js';
import { dataAttrs, statusTag, plus } from './common.js';
import { phasesOf } from '../../core/queries.js';

/** @typedef {import('../../core/data.js').Data} Data */

/** A hazard's lifecycle phases as a numbered card, like its causal factors: + to add, ✕ to remove. @param {Data} data @param {any} h the hazard */
export function phaseCard(data, h) {
  const list = phasesOf(data, h.id);
  return html`<section class="dash-card nl-card" aria-label="Lifecycle phases">
    <h3 class="dash-card-h">Lifecycle phases <span class="count">${list.length}</span>${plus({ action: 'openPicker', picker: 'linkPhases', 'hazard-id': h.id }, 'Add lifecycle phases')}</h3>
    ${list.length ? html`<ol class="nl">${list.map(({ phase }, i) => html`<li class="nl-item"><span class="nl-num">${i + 1}</span><span class="nl-text">${phase.name}${statusTag(phase.status)}</span>
      <span class="row-actions"><button type="button" class="icon-x" title="Remove ${phase.name}" aria-label="Remove ${phase.name}" ${dataAttrs({ action: 'unlinkPhase', 'hazard-id': h.id, 'phase-id': phase.id })}>✕</button></span></li>`)}</ol>`
      : html`<p class="muted nl-empty">No lifecycle phases yet.</p>`}
  </section>`;
}
