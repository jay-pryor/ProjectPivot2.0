import { html, raw } from '../html.js';
import { dataAttrs, idTag, option, go } from './common.js';
import { numberedCard, platformListCard } from './dashboard.js';
import { controlsSection, riskPanels, sfarpArea } from './ssra.js';
import { implementedBySelect } from './platforms.js';
import { get } from '../../core/data.js';
import { causalFactorsOn, platformListOn, platformListEntries, controlsOnPlatform, implementedByOf, hazardDetail } from '../../core/queries.js';
import { groupSuggestions, stepOf, workflowHazards, FACET_KINDS } from '../../core/workflows.js';
import { CONTROL_TIERS } from '../../core/ops/controls.js';

/** @typedef {import('../../core/data.js').Data} Data */

/** A card's state beside its title: met, needed, or (optional) filled or empty. @param {boolean} required @param {boolean} ok */
const badge = (required, ok) => html`<span class="tag wf-badge ${ok ? 'met' : required ? 'needed' : 'empty'}">${ok ? (required ? '✓' : 'Filled') : required ? 'Needed' : 'Empty'}</span>`;

/** @param {number} n @param {string} title @param {any} b @param {any} body */
const card = (n, title, b, body) => html`<section class="wf-check" aria-label="${title}"><h3 class="wf-check-h"><span class="wf-n">${n}</span> ${title} ${b}</h3><div class="wf-check-body">${body}</div></section>`;

/** A None applies (or No controls implemented) tick, kept off while there are entries. @param {Data} data @param {any} wf @param {string} hazardId @param {string} check @param {string} label @param {boolean} blocked */
function noneTick(data, wf, hazardId, check, label, blocked) {
  const s = stepOf(data, wf.id, hazardId, check);
  return html`<label class="wf-tick wf-none"><input type="checkbox" name="checked"${s?.checked && !blocked ? raw(' checked') : ''}${blocked ? raw(' disabled') : ''} ${dataAttrs({ change: 'setStep', 'workflow-id': wf.id, 'hazard-id': hazardId, check })}> ${label}</label>`;
}

/** @param {{ text: string, from: string }[]} xs */
const grouped = (xs) => xs.map((s) => ({ text: s.text, from: s.from }));

/** @param {any} state @param {Data} data @param {any} wf @param {any} h @param {string} pid */
function facetsCard(state, data, wf, h, pid) {
  const lists = FACET_KINDS.filter((f) => f !== 'causalFactor').map((kind) => {
    const items = platformListOn(data, /** @type {any} */ (kind), h.id, pid);
    return html`<div class="wf-facet">${platformListCard(state, { kind: /** @type {any} */ (kind), items, hazardId: h.id, platformId: pid, entries: platformListEntries(data, /** @type {any} */ (kind)), grouped: grouped(groupSuggestions(data, { kind, platformId: pid, hazardId: h.id })) })}
      ${noneTick(data, wf, h.id, `none:${kind}`, 'None applies', items.length > 0)}</div>`;
  });
  const cfs = causalFactorsOn(data, h.id, pid);
  const cause = html`<div class="wf-facet">${numberedCard(state, { name: 'CausalFactor', items: cfs, hazardId: h.id, platformId: pid, grouped: grouped(groupSuggestions(data, { kind: 'causalFactor', platformId: pid, hazardId: h.id })) })}
    ${noneTick(data, wf, h.id, 'none:causalFactor', 'None applies', cfs.length > 0)}</div>`;
  const d = hazardDetail(data, h.id);
  return html`<div class="dash-grid hazard-lists">${lists}${cause}</div>
    <p class="muted wf-shared">Shared by all of this hazard’s platforms — Consequences: ${d?.consequences.map((/** @type {any} */ c) => c.text).join('; ') || 'none'}.</p>`;
}

/** @param {Data} data @param {any} c a control @param {string} pid */
function missing(data, c, pid) {
  return [c.tier ? '' : 'tier', String(c.origin ?? '').trim() ? '' : 'origin', String(c.description ?? '').trim() ? '' : 'description', implementedByOf(data, c.id, pid) ? '' : 'implemented by'].filter(Boolean);
}

/** @param {any} state @param {Data} data @param {any} wf @param {any} h @param {any} p */
function implementedCard(state, data, wf, h, p) {
  const rows = controlsOnPlatform(data, h.id, p.id).filter((c) => c.state === 'implemented');
  const sugg = groupSuggestions(data, { kind: 'control', platformId: p.id, hazardId: h.id });
  const at = (/** @type {any} */ c) => ({ change: 'updateControl', id: c.control.id });
  return html`${sugg.length ? html`<form data-action="addSuggestedControls" ${dataAttrs({ 'hazard-id': h.id, 'platform-id': p.id })} class="suggest wf-suggest"><p class="suggest-h">Suggested from your groups</p>
      <ul class="suggest-list">${sugg.map((s) => html`<li><label class="suggest-item"><input type="checkbox" name="controlId" value="${s.id}"><span class="suggest-text">${s.text}</span><span class="suggest-from">${s.from}</span></label></li>`)}</ul>
      <button type="submit" class="small">Add as implemented</button></form>` : ''}
    ${rows.length ? html`<table class="wf-controls"><thead><tr><th>Control</th><th>Tier</th><th>Origin</th><th>Description</th><th>Implemented by</th></tr></thead><tbody>
      ${rows.map((c) => { const m = missing(data, c.control, p.id); return html`<tr>
        <td>${go(c.control.title, 'control', { id: c.control.id })}${m.length ? html`<div class="wf-missing">Missing: ${m.join(', ')}</div>` : ''}</td>
        <td><select name="tier" aria-label="Tier of ${c.control.title}" ${dataAttrs(at(c))}>${option('', 'Not set', c.control.tier ?? '')}${CONTROL_TIERS.map((t) => option(t, t, c.control.tier ?? ''))}</select></td>
        <td><input name="origin" value="${c.control.origin ?? ''}" placeholder="Origin…" aria-label="Origin of ${c.control.title}" ${dataAttrs(at(c))}></td>
        <td><textarea class="cell-area" name="description" rows="2" placeholder="Description…" aria-label="Description of ${c.control.title}" ${dataAttrs(at(c))}>${c.control.description ?? ''}</textarea></td>
        <td>${implementedBySelect(data, c.control, p.id, p.name)}</td></tr>`; })}</tbody></table>`
      : html`<p class="muted">No controls set Implemented here yet. Add them from the suggestions, or set one Implemented under Other controls.</p>`}
    ${noneTick(data, wf, h.id, 'none:controls', 'No controls implemented', rows.length > 0)}`;
}

/**
 * A hazard's onboarding cards: facets and implemented controls (required), then other controls,
 * risk ratings, their justifications and SFARP (optional), each with how it stands.
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
  return html`<div class="wf-hazard-h"><h2>${idTag(x.reportId)} ${go(h.title, 'hazard', { id: h.id })}</h2><span class="muted">${st.required}/2 required</span></div>
    ${card(1, 'Facets', badge(true, facetsMet), facetsCard(state, data, wf, h, p.id))}
    ${card(2, 'Implemented controls', badge(true, st.implemented), implementedCard(state, data, wf, h, p))}
    ${card(3, 'Other controls', badge(false, st.optional.otherControls), controlsSection(state, data, h, p.id, p.name, (c) => c.state !== 'implemented'))}
    ${card(4, 'Risk ratings', badge(false, st.optional.ratings), html`<h4>Initial</h4>${riskPanels(state, data, h, p.id, 'initial', 'ratings')}<h4>Residual</h4>${riskPanels(state, data, h, p.id, 'residual', 'ratings')}`)}
    ${card(5, 'Risk justifications', badge(false, st.optional.justifications), html`<h4>Initial</h4>${riskPanels(state, data, h, p.id, 'initial', 'justifications')}<h4>Residual</h4>${riskPanels(state, data, h, p.id, 'residual', 'justifications')}`)}
    ${card(6, 'SFARP', badge(false, st.optional.sfarp), sfarpArea(data, h, p.id))}
    <div class="actions wf-nav">${i > 0 ? nav('← Previous hazard', hz[i - 1].hazard.id) : nav('← Hazards', '@hazards')}${i < hz.length - 1 ? nav('Next hazard →', hz[i + 1].hazard.id) : nav('Summary & complete →', '')}</div>`;
}
