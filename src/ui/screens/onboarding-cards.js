import { html, raw } from '../html.js';
import { dataAttrs, idTag, go } from './common.js';
import { numberedCard, platformListCard } from './dashboard.js';
import { controlsSection, riskPanels, sfarpArea, causalFactorSuggestions, otherChoices, copyStageButton } from './ssra.js';
import { get } from '../../core/data.js';
import { platformListEntries } from '../../core/queries.js';
import { groupSuggestions, stepOf, workflowHazards, facetEntriesOn, FACET_KINDS } from '../../core/workflows.js';

/** @typedef {import('../../core/data.js').Data} Data */

/** A card's state beside its title: met, needed, or (optional) filled or empty. @param {boolean} required @param {boolean} ok */
const badge = (required, ok) => html`<span class="tag wf-badge ${ok ? 'met' : required ? 'needed' : 'empty'}">${ok ? (required ? '✓' : 'Filled') : required ? 'Needed' : 'Empty'}</span>`;

/** @param {number} n @param {string} title @param {any} b @param {any} body */
const card = (n, title, b, body) => html`<section class="wf-check" aria-label="${title}"><h3 class="wf-check-h"><span class="wf-n">${n}</span> ${title} ${b}</h3><div class="wf-check-body">${body}</div></section>`;

/** A None applies tick, kept off while there are entries. @param {Data} data @param {any} wf @param {string} hazardId @param {string} check @param {string} label @param {boolean} blocked */
function noneTick(data, wf, hazardId, check, label, blocked) {
  const s = stepOf(data, wf.id, hazardId, check);
  return html`<label class="wf-tick wf-none"><input type="checkbox" name="checked"${s?.checked && !blocked ? raw(' checked') : ''}${blocked ? raw(' disabled') : ''} ${dataAttrs({ change: 'setStep', 'workflow-id': wf.id, 'hazard-id': hazardId, check })}> ${label}</label>`;
}

/** @param {{ text: string, from: string }[]} xs */
const grouped = (xs) => xs.map((s) => ({ text: s.text, from: s.from }));

/** @param {any} state @param {Data} data @param {any} wf @param {any} h @param {string} pid */
function facetsCard(state, data, wf, h, pid) {
  const cards = FACET_KINDS.map((kind) => {
    const items = facetEntriesOn(data, kind, h.id, pid);
    const fromGroups = grouped(groupSuggestions(data, { kind, platformId: pid, hazardId: h.id }));
    const body = kind === 'causalFactor'
      ? numberedCard(state, { name: 'CausalFactor', items, hazardId: h.id, platformId: pid, suggestions: causalFactorSuggestions(data, h.id, pid), grouped: fromGroups, others: otherChoices(data, 'causalFactor', items) })
      : kind === 'consequence'
        ? html`${numberedCard(state, { name: 'Consequence', items, hazardId: h.id, grouped: fromGroups, others: otherChoices(data, 'consequence', items) })}<p class="muted wf-shared">Shared by all of this hazard’s platforms.</p>`
        : platformListCard(state, { kind: /** @type {any} */ (kind), items, hazardId: h.id, platformId: pid, entries: platformListEntries(data, /** @type {any} */ (kind)), grouped: fromGroups });
    return html`<div class="wf-facet">${body}${noneTick(data, wf, h.id, `none:${kind}`, 'None applies', items.length > 0)}</div>`;
  });
  return html`<div class="dash-grid hazard-lists">${cards}</div>`;
}

/** The controls on this hazard here, with those suggested from the platform's groups to add. @param {any} state @param {Data} data @param {any} h @param {any} p */
function controlsCard(state, data, h, p) {
  const sugg = groupSuggestions(data, { kind: 'control', platformId: p.id, hazardId: h.id });
  return html`${sugg.length ? html`<form data-action="addSuggestedControls" ${dataAttrs({ 'hazard-id': h.id, 'platform-id': p.id })} class="suggest wf-suggest"><p class="suggest-h">Suggested from your groups</p>
      <ul class="suggest-list">${sugg.map((s) => html`<li><label class="suggest-item"><input type="checkbox" name="controlId" value="${s.id}"><span class="suggest-text">${s.text}</span><span class="suggest-from">${s.from}</span></label></li>`)}</ul>
      <button type="submit" class="small">Add ticked controls</button></form>` : ''}
    ${controlsSection(state, data, h, p.id, p.name)}`;
}

/**
 * A hazard's onboarding cards: facets (required), then controls, risk ratings, their
 * justifications and SFARP (optional), each with how it stands.
 * @param {any} state @param {Data} data @param {any} wf @param {{ hazard: any, reportId: string }} x @param {any} prog @param {boolean} _mine the cards are ordinary platform edits, open to anyone
 */
export function hazardCards(state, data, wf, x, prog, _mine) {
  const h = x.hazard;
  const p = get(data, 'platform', wf.platformId);
  const st = prog.perHazard.get(h.id);
  const facetsMet = FACET_KINDS.every((f) => st.facets[f]);
  const hz = workflowHazards(data, wf);
  const i = hz.findIndex((y) => y.hazard.id === h.id);
  const nav = (/** @type {string} */ label, /** @type {string} */ pos) => html`<button type="button" ${dataAttrs({ action: 'showWorkflowHazard', 'workflow-id': wf.id, 'hazard-id': pos })}>${label}</button>`;
  return html`<div class="wf-hazard-h"><h2>${idTag(x.reportId)} ${go(h.title, 'hazard', { id: h.id })}</h2><span class="muted">${st.required}/1 required</span></div>
    ${card(1, 'Facets', badge(true, facetsMet), facetsCard(state, data, wf, h, p.id))}
    ${card(2, 'Controls', badge(false, st.optional.controls), controlsCard(state, data, h, p))}
    ${card(3, 'Risk ratings', badge(false, st.optional.ratings), html`<h4>Initial${copyStageButton(data, h, p.id, 'initial')}</h4>${riskPanels(state, data, h, p.id, 'initial', 'ratings')}<h4>Residual${copyStageButton(data, h, p.id, 'residual')}</h4>${riskPanels(state, data, h, p.id, 'residual', 'ratings')}`)}
    ${card(4, 'Risk justifications', badge(false, st.optional.justifications), html`<h4>Initial</h4>${riskPanels(state, data, h, p.id, 'initial', 'justifications')}<h4>Residual</h4>${riskPanels(state, data, h, p.id, 'residual', 'justifications')}`)}
    ${card(5, 'SFARP', badge(false, st.optional.sfarp), sfarpArea(data, h, p.id))}
    <div class="actions wf-nav">${i > 0 ? nav('← Previous hazard', hz[i - 1].hazard.id) : nav('← Hazards', '@hazards')}${i < hz.length - 1 ? nav('Next hazard →', hz[i + 1].hazard.id) : nav('Summary & complete →', '')}</div>`;
}
