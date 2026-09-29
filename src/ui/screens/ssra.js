import { html } from '../html.js';
import { dataAttrs, option, go, bandTag } from './common.js';
import { referencesCard } from './references.js';
import { textTable } from './hazards.js';
import { get } from '../../core/data.js';
import { ids } from '../../core/ids.js';
import { assessmentOf, ratingsOf, sfarpOf, hazardDetail } from '../../core/queries.js';
import { CONSEQUENCES, LIKELIHOODS, ratingFor } from '../../core/matrix.js';

/** @typedef {import('../../core/data.js').Data} Data */

const WORD = { initial: 'Initial', residual: 'Residual', personnel: 'Personnel', environment: 'Environment' };

/** The assessed level of a pair, as a band tag; a half-entered one says so. @param {any} pair */
function level(pair) {
  const r = ratingFor(pair?.consequence ?? null, pair?.likelihood ?? null);
  return r.cell ? html`<span class="band band-${r.band.toLowerCase().replace(/\s+/g, '-')}">${r.cell} ${r.band}</span>` : html`<span class="band band-uncategorised">Not yet assessed</span>`;
}

/**
 * Initial or residual risk: personnel and environment side by side, each with likelihood and
 * consequence dropdowns, their justifications, and the assessed level.
 * @param {any} state @param {Data} data @param {any} h the hazard @param {string} platformId @param {'initial' | 'residual'} stage
 */
export function riskPanels(state, data, h, platformId, stage) {
  const ratings = ratingsOf(data, h.id, platformId);
  const panel = (/** @type {'personnel' | 'environment'} */ receptor) => {
    const a = assessmentOf(data, h.id, platformId, stage, receptor);
    const at = { change: 'setAssessment', 'hazard-id': h.id, 'platform-id': platformId, stage, receptor };
    const label = `${WORD[stage]} ${receptor}`;
    return html`<div class="risk-panel"><h3>${WORD[receptor]}</h3>
      <label class="risk-field">Likelihood <select name="likelihood" aria-label="${label} likelihood" ${dataAttrs(at)}>${option('', '—', a?.likelihood ?? '')}${LIKELIHOODS.map((l) => option(l.letter, `${l.letter} · ${l.label}`, a?.likelihood ?? ''))}</select></label>
      <textarea name="likelihoodWhy" rows="3" placeholder="Why this likelihood…" aria-label="${label} likelihood justification" ${dataAttrs(at)}>${a?.likelihoodWhy ?? ''}</textarea>
      <label class="risk-field">Consequence <select name="consequence" aria-label="${label} consequence" ${dataAttrs(at)}>${option('', '—', a?.consequence == null ? '' : String(a.consequence))}${CONSEQUENCES.map((c) => option(String(c.level), `${c.level} · ${c.label}`, a?.consequence == null ? '' : String(a.consequence)))}</select></label>
      <textarea name="consequenceWhy" rows="3" placeholder="Why this consequence…" aria-label="${label} consequence justification" ${dataAttrs(at)}>${a?.consequenceWhy ?? ''}</textarea>
      <div class="risk-level">Assessed level ${level(ratings[stage][receptor])}</div>
    </div>`;
  };
  return html`<div class="risk-panels">${panel('personnel')}${panel('environment')}</div>`;
}

const SHARED = html`<span class="shared-mark">Shared across platforms</span>`;

/**
 * One platform's SSRA for a hazard, in the document's order.
 * @param {any} state @param {Data} data @param {any} h the hazard @param {string} platformId
 */
export function platformTab(state, data, h, platformId) {
  const link = get(data, 'hazardPlatform', ids.hazardPlatform(h.id, platformId));
  const p = get(data, 'platform', platformId);
  if (!link || link.status !== 'live' || !p) return html`<p class="muted">This hazard is not on that platform. ${go('Back to the overview', 'hazard', { id: h.id })}</p>`;
  const d = /** @type {NonNullable<ReturnType<typeof hazardDetail>>} */ (hazardDetail(data, h.id));
  const sf = sfarpOf(data, h.id, platformId);
  const sfAt = { change: 'setSfarp', 'hazard-id': h.id, 'platform-id': platformId };
  return html`<article class="doc ssra">
    <section class="ssra-sec"><h2>Overview ${SHARED}</h2>
      <textarea class="doc-text" name="description" rows="3" placeholder="Add a description…" aria-label="Description" ${dataAttrs({ change: 'updateHazard', id: h.id })}>${h.description}</textarea>
      <section class="block">${textTable(state, 'CausalFactor', d.causalFactors, h.id)}</section>
      <section class="block">${textTable(state, 'Consequence', d.consequences, h.id)}</section>
    </section>
    <section class="ssra-sec"><h2>References ${SHARED}</h2><section class="block">${referencesCard(state, data, { kind: 'hazard', id: h.id })}</section></section>
    <section class="ssra-sec"><h2>Initial risk</h2>${riskPanels(state, data, h, platformId, 'initial')}</section>
    <section class="ssra-sec"><h2>Residual risk</h2>${riskPanels(state, data, h, platformId, 'residual')}</section>
    <section class="ssra-sec"><h2>SFARP considerations</h2>
      <div class="sfarp">
        <label>SFARP justification<textarea name="justification" rows="4" aria-label="SFARP justification" ${dataAttrs(sfAt)}>${sf.justification}</textarea></label>
        <label>SFARP conclusion<textarea name="conclusion" rows="2" aria-label="SFARP conclusion" ${dataAttrs(sfAt)}>${sf.conclusion}</textarea></label>
        <label>Conditions of validity<textarea name="conditions" rows="3" aria-label="Conditions of validity" ${dataAttrs(sfAt)}>${sf.conditions}</textarea></label>
      </div>
    </section>
  </article>`;
}
