import { html, raw } from '../html.js';
import { dataAttrs, go, idTag, option, groupTags, plus } from './common.js';
import { platformImage } from './platforms.js';
import { get } from '../../core/data.js';
import { groupsOf } from '../../core/queries.js';
import { workflowHazards, onboardingProgress, groupSuggestions, FACET_KINDS } from '../../core/workflows.js';
import { hazardCards } from './onboarding-cards.js';

/** @typedef {import('../../core/data.js').Data} Data */

const STEPS = /** @type {const} */ ([['@details', 'Details', 'details'], ['@groups', 'Groups', 'groups'], ['@hazards', 'Hazards', 'hazards']]);

/** @param {any} wf @param {string} label @param {string} position */
const navButton = (wf, label, position) => html`<button type="button" ${dataAttrs({ action: 'showWorkflowHazard', 'workflow-id': wf.id, 'hazard-id': position })}>${label}</button>`;

/** The rail: the platform's steps, then its hazards, then the summary; each with how far along it is. @param {Data} data @param {any} wf @param {any} prog @param {string | null} current */
function rail(data, wf, prog, current) {
  const item = (/** @type {string} */ pos, /** @type {any} */ body, /** @type {boolean} */ done) => html`<button type="button" class="wf-rail-item${current === (pos || null) ? ' on' : ''}${done ? ' done' : ''}" ${dataAttrs({ action: 'showWorkflowHazard', 'workflow-id': wf.id, 'hazard-id': pos })}>${body}</button>`;
  const mark = (/** @type {boolean} */ ok) => html`<span class="wf-mark" aria-hidden="true">${ok ? '✓' : ''}</span>`;
  return html`<nav class="wf-rail" aria-label="Onboarding steps"><div class="wf-rail-h">Platform</div>
    ${STEPS.map(([pos, label, key]) => item(pos, html`${mark(prog[key])}<span class="wf-name">${label}</span><span class="wf-count">${prog[key] ? '' : 'Needed'}</span>`, prog[key]))}
    <div class="wf-rail-h">Hazards</div>
    ${workflowHazards(data, wf).map((x) => {
      const n = prog.perHazard.get(x.hazard.id)?.required ?? 0;
      return item(x.hazard.id, html`${mark(n === 2)}<span class="wf-name">${idTag(x.reportId)} ${x.hazard.title}</span><span class="wf-count">${n}/2</span>`, n === 2);
    })}
    ${item('', html`${mark(false)}<span class="wf-name">Summary &amp; complete</span>`, false)}</nav>`;
}

/** @param {any} state @param {Data} data @param {any} wf @param {any} p */
function detailsStep(state, data, wf, p) {
  return html`<h2>Details</h2>
    <label class="field-block"><span class="field-label">Name</span><input name="name" value="${p.name}" required aria-label="Platform name" ${dataAttrs({ change: 'updatePlatform', id: p.id })}></label>
    <label class="field-block"><span class="field-label">Description</span><textarea class="doc-text boxed" name="description" rows="3" placeholder="What the platform is, and what it is for…" aria-label="Platform description" ${dataAttrs({ change: 'updatePlatform', id: p.id })}>${p.description ?? ''}</textarea></label>
    <label class="field-block"><span class="field-label">Owner</span><select name="ownerId" aria-label="Platform owner" ${dataAttrs({ change: 'setOwner', id: p.id })}>${state.profiles.map((/** @type {any} */ pr) => option(pr.id, pr.name, p.ownerId))}</select></label>
    <div class="field-block"><span class="field-label">Image <span class="muted">(optional)</span></span>${p.image ? platformImage(p, 'wf-image') : ''}
      <label class="button-like">${p.image ? 'Change image' : 'Add image'}<input type="file" accept="image/png,image/svg+xml,.png,.svg" hidden ${dataAttrs({ 'image-for': p.id })}></label></div>
    <div class="actions wf-nav"><span></span>${navButton(wf, 'Groups →', '@groups')}</div>`;
}

/** @param {Data} data @param {any} wf @param {any} p */
function groupsStep(data, wf, p) {
  const gs = groupsOf(data, p.id);
  return html`<h2>Groups ${plus({ action: 'openPicker', picker: 'tagPlatforms', 'platform-id': p.id }, 'Add to platform groups')}</h2>
    ${gs.length ? groupTags(gs) : html`<p class="muted">Not in any platform group yet. Groups decide what onboarding suggests.</p>`}
    <div class="actions wf-nav">${navButton(wf, '← Details', '@details')}${navButton(wf, 'Hazards →', '@hazards')}</div>`;
}

/** @param {Data} data @param {any} wf @param {any} p */
function hazardsStep(data, wf, p) {
  const sugg = groupSuggestions(data, { kind: 'hazard', platformId: p.id });
  const hz = workflowHazards(data, wf);
  return html`<h2>Hazards ${plus({ action: 'openPicker', picker: 'linkHazards', 'platform-id': p.id }, 'Add any hazard')}</h2>
    ${sugg.length ? html`<form data-action="linkHazards" ${dataAttrs({ 'platform-id': p.id })} class="suggest wf-suggest"><p class="suggest-h">Suggested from your groups</p>
      <ul class="suggest-list">${sugg.map((s) => html`<li><label class="suggest-item"><input type="checkbox" name="hazardId" value="${s.id}"><span class="suggest-text">${s.text}</span><span class="suggest-from">${s.from}</span></label></li>`)}</ul>
      <button type="submit" class="small">Add ticked hazards</button></form>` : html`<p class="muted">Nothing suggested from this platform’s groups.</p>`}
    ${hz.length ? html`<ul class="plain wf-list">${hz.map((x) => html`<li>${idTag(x.reportId)} ${x.hazard.title}</li>`)}</ul>` : html`<p class="muted">No hazards on ${p.name} yet.</p>`}
    <div class="actions wf-nav">${navButton(wf, '← Groups', '@groups')}${hz.length ? navButton(wf, `${hz[0].hazard.title} →`, hz[0].hazard.id) : html`<span></span>`}</div>`;
}

/** @param {any} state @param {Data} data @param {any} wf @param {any} prog @param {boolean} mine */
function summary(state, data, wf, prog, mine) {
  const left = prog.unmet.length;
  return html`<h2>Summary</h2>
    ${left ? html`<p>Still needed:</p><ul class="plain wf-unmet">${prog.unmet.map((/** @type {any} */ u) => html`<li>${navButton(wf, u.what, u.hazardId ?? (u.what.startsWith('A description') ? '@details' : u.what.includes('group') ? '@groups' : '@hazards'))}</li>`)}</ul>`
      : html`<p>Everything onboarding needs is in place.</p>`}
    <fieldset class="wf-fields"${mine ? '' : raw(' disabled')}><div class="actions"><button type="button" class="primary" ${dataAttrs({ action: 'completeWorkflow', 'workflow-id': wf.id })}${left ? raw(' disabled') : ''}>${left ? `Complete onboarding — ${left} still needed` : 'Complete onboarding'}</button></div></fieldset>`;
}

/**
 * An open onboarding's body: the rail, and the chosen step, hazard or the summary. Only its owner
 * can change the workflow's own ticks; everyone edits the platform as they could on its page.
 * @param {any} state @param {Data} data @param {any} wf @param {boolean} mine
 */
export function onboardingBody(state, data, wf, mine) {
  const p = get(data, 'platform', wf.platformId);
  const prog = onboardingProgress(data, wf);
  const hz = workflowHazards(data, wf);
  const asked = state.view?.hazardId === 'summary' ? null : state.view?.hazardId ?? wf.at?.hazardId ?? '@details';
  const current = asked && (asked.startsWith('@') || hz.some((x) => x.hazard.id === asked)) ? asked : asked ? '@details' : null;
  const x = current && !current.startsWith('@') ? hz.find((y) => y.hazard.id === current) : null;
  const main = current === '@details' ? detailsStep(state, data, wf, p)
    : current === '@groups' ? groupsStep(data, wf, p)
      : current === '@hazards' ? hazardsStep(data, wf, p)
        : x ? hazardCards(state, data, wf, x, prog, mine)
          : summary(state, data, wf, prog, mine);
  return html`<div class="wf-layout">${rail(data, wf, prog, current)}<div class="wf-main">${main}</div></div>`;
}

/**
 * An ended onboarding's grid: each hazard it covered against its facets and implemented controls.
 * @param {Data} data @param {any} wf
 */
export function onboardingGrid(data, wf) {
  const hz = workflowHazards(data, wf);
  if (!hz.length) return html`<p class="muted">No hazards.</p>`;
  const prog = onboardingProgress(data, { ...wf, state: 'open' });
  const cell = (/** @type {boolean | undefined} */ ok) => html`<td class="${ok ? 'yes' : 'no'}">${ok ? '✓' : ''}</td>`;
  return html`<div class="wf-grid-wrap"><table class="wf-grid"><thead><tr><th scope="col">Hazard</th><th scope="col">Facets</th><th scope="col">Implemented controls</th></tr></thead>
    <tbody>${hz.map((x) => { const h = prog.perHazard.get(x.hazard.id); return html`<tr><th scope="row">${idTag(x.reportId)} ${x.hazard.title}</th>${cell(h && FACET_KINDS.every((f) => h.facets[f]))}${cell(h?.implemented)}</tr>`; })}</tbody></table></div>`;
}
