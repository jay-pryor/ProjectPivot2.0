import { html, raw } from '../html.js';
import { dataAttrs, go, idTag, confirmButton, changeDetail } from './common.js';
import { safetyReportsSection, controlsSection, riskPanels, sfarpArea } from './ssra.js';
import { referencesCard } from './references.js';
import { workflowSubject } from './workflows.js';
import { get } from '../../core/data.js';
import { workflowLabel, UNNUMBERED } from '../../core/ids.js';
import { dueOf } from '../../core/schedule.js';
import { CHECKS, CHECK_WORDS, CHECK_QUESTIONS, stepOf, workflowHazards, workflowProgress, workflowChanges, typeName } from '../../core/workflows.js';
import { profileName, when, recordName, KIND_LABEL } from '../names.js';

/** @typedef {import('../../core/data.js').Data} Data */

/** @param {any} wf */
const named = (wf) => (workflowLabel(wf) === UNNUMBERED ? 'this workflow' : workflowLabel(wf));

/**
 * Each hazard against each check: ✓ where ticked, and its note.
 * @param {Data} data @param {any} wf
 */
export function checkGrid(data, wf) {
  const hz = workflowHazards(data, wf);
  if (!hz.length) return html`<p class="muted">No hazards to check.</p>`;
  return html`<div class="wf-grid-wrap"><table class="wf-grid"><thead><tr><th scope="col">Hazard</th>${CHECKS.map((c) => html`<th scope="col">${CHECK_WORDS[c]}</th>`)}</tr></thead>
    <tbody>${hz.map((x) => html`<tr><th scope="row">${idTag(x.reportId)} ${x.hazard.title}</th>${CHECKS.map((c) => {
      const s = stepOf(data, wf.id, x.hazard.id, c);
      return html`<td class="${s?.checked ? 'yes' : 'no'}">${s?.checked ? '✓' : ''}${s?.note ? html`<div class="wf-note">${s.note}</div>` : ''}</td>`;
    })}</tr>`)}</tbody></table></div>`;
}

/** The hazards and the summary, each with how far along it is. @param {Data} data @param {any} wf @param {string | null} current */
function rail(data, wf, current) {
  const prog = workflowProgress(data, wf);
  const item = (/** @type {string} */ hazardId, /** @type {any} */ body, /** @type {boolean} */ done) => html`<button type="button" class="wf-rail-item${current === (hazardId || null) ? ' on' : ''}${done ? ' done' : ''}" ${dataAttrs({ action: 'showWorkflowHazard', 'workflow-id': wf.id, 'hazard-id': hazardId })}>${body}</button>`;
  return html`<nav class="wf-rail" aria-label="Hazards"><div class="wf-rail-h">Hazards <span class="muted">${prog.done}/${prog.total}</span></div>
    ${workflowHazards(data, wf).map((x) => {
      const n = prog.perHazard.get(x.hazard.id) ?? 0;
      return item(x.hazard.id, html`<span class="wf-mark" aria-hidden="true">${n === CHECKS.length ? '✓' : ''}</span><span class="wf-name">${idTag(x.reportId)} ${x.hazard.title}</span><span class="wf-count">${n}/${CHECKS.length}</span>`, n === CHECKS.length);
    })}
    ${item('', html`<span class="wf-mark" aria-hidden="true"></span><span class="wf-name">Summary &amp; complete</span>`, false)}</nav>`;
}

/** The editor a check shows: the same one the platform page uses. @param {any} state @param {Data} data @param {any} h @param {any} p @param {string} check */
function checkBody(state, data, h, p, check) {
  switch (check) {
    case 'safetyReports': return safetyReportsSection(state, data, h, p.id);
    case 'references': return referencesCard(state, data, { kind: 'hazard', id: h.id, platformId: p.id });
    case 'controls': return controlsSection(state, data, h, p.id, p.name);
    case 'residualRatings': return riskPanels(state, data, h, p.id, 'residual', 'ratings');
    case 'residualJustifications': return riskPanels(state, data, h, p.id, 'residual', 'justifications');
    default: return sfarpArea(data, h, p.id);
  }
}

/** One check on a hazard: its question, the editor, a note and the tick. @param {any} state @param {Data} data @param {any} wf @param {any} h @param {any} p @param {string} check @param {number} n */
function checkCard(state, data, wf, h, p, check, n) {
  const s = stepOf(data, wf.id, h.id, check);
  const at = { change: 'setStep', 'workflow-id': wf.id, 'hazard-id': h.id, check };
  return html`<section class="wf-check${s?.checked ? ' done' : ''}" aria-label="${CHECK_WORDS[check]}">
    <h3 class="wf-check-h"><span class="wf-n">${n}</span> ${CHECK_WORDS[check]} <span class="muted wf-q">${CHECK_QUESTIONS[check]}</span></h3>
    <div class="wf-check-body">${checkBody(state, data, h, p, check)}</div>
    <div class="wf-check-foot">
      <input class="grow" name="note" value="${s?.note ?? ''}" placeholder="Note (optional)…" aria-label="Note on ${CHECK_WORDS[check]}" ${dataAttrs(at)}>
      <label class="wf-tick"><input type="checkbox" name="checked"${s?.checked ? raw(' checked') : ''} ${dataAttrs(at)}> Checked</label>
    </div></section>`;
}

/** @param {any} wf @param {string} label @param {string} hazardId */
const navButton = (wf, label, hazardId) => html`<button type="button" ${dataAttrs({ action: 'showWorkflowHazard', 'workflow-id': wf.id, 'hazard-id': hazardId })}>${label}</button>`;

/** @param {any} state @param {Data} data @param {any} wf @param {{ hazard: any, reportId: string }} x @param {boolean} mine */
function hazardPage(state, data, wf, x, mine) {
  const p = get(data, 'platform', wf.platformId);
  const hz = workflowHazards(data, wf);
  const i = hz.findIndex((y) => y.hazard.id === x.hazard.id);
  const n = workflowProgress(data, wf).perHazard.get(x.hazard.id) ?? 0;
  return html`<div class="wf-hazard-h"><h2>${idTag(x.reportId)} ${go(x.hazard.title, 'hazard', { id: x.hazard.id })}</h2><span class="muted">${n}/${CHECKS.length} checked</span></div>
    <fieldset class="wf-fields"${mine ? '' : raw(' disabled')}>${CHECKS.map((c, k) => checkCard(state, data, wf, x.hazard, p, c, k + 1))}</fieldset>
    <div class="actions wf-nav">${i > 0 ? navButton(wf, '← Previous hazard', hz[i - 1].hazard.id) : ''}${i < hz.length - 1 ? navButton(wf, 'Next hazard →', hz[i + 1].hazard.id) : navButton(wf, 'Summary & complete →', '')}</div>`;
}

/** @param {any} state @param {Data} data @param {any} wf @param {boolean} mine */
function summary(state, data, wf, mine) {
  const { done, total } = workflowProgress(data, wf);
  const left = total - done;
  const scheduled = Boolean(dueOf(data, wf.platformId));
  const at = { 'workflow-id': wf.id };
  return html`<h2>Summary</h2>${checkGrid(data, wf)}
    <fieldset class="wf-fields"${mine ? '' : raw(' disabled')}>
      <label class="outcome">Outcome<textarea name="outcome" rows="3" placeholder="What the review found, and anything to follow up…" ${dataAttrs({ change: 'setWorkflowOutcome', ...at })}>${wf.outcome}</textarea></label>
      <label class="outcome">Additional notes<textarea name="notes" rows="4" placeholder="Anything else worth keeping with this review…" ${dataAttrs({ change: 'setWorkflowNotes', ...at })}>${wf.notes}</textarea></label>
      <div class="actions"><button type="button" class="primary" ${dataAttrs({ action: 'completeWorkflow', ...at })}${left || !scheduled ? raw(' disabled') : ''}>${left ? `Complete review — ${left} check${left === 1 ? '' : 's'} not ticked` : 'Complete review'}</button></div>
    </fieldset>
    ${scheduled ? '' : html`<p class="muted">Completing a review needs a review schedule: set one on its ${go('Reviews page', 'platformReview', { id: wf.platformId })}.</p>`}`;
}

/** What each change made through the workflow did, newest first. @param {any} state @param {Data} data @param {any} wf */
function changesList(state, data, wf) {
  const list = workflowChanges(data, wf.id).slice().reverse();
  if (!list.length) return html`<p class="muted">No changes were made through this workflow.</p>`;
  return html`<ul class="plain wf-changes">${list.map((e) => html`<li><strong>${e.action}</strong> <span class="muted">${profileName(state, e.by)}, ${when(e.at)}</span>
    <ul class="plain">${e.items.filter((/** @type {any} */ i) => i.kind !== 'workflow' && i.kind !== 'workflowStep').map((/** @type {any} */ i) => html`<li><span class="muted">${KIND_LABEL[/** @type {keyof typeof KIND_LABEL} */ (i.kind)] ?? i.kind}: ${recordName(i.kind, get(data, i.kind, i.id), data)}</span> ${changeDetail(i)}</li>`)}</ul></li>`)}</ul>`;
}

/** @param {any} state @param {Data} data @param {any} wf */
function endedBody(state, data, wf) {
  const word = wf.state === 'completed' ? 'Completed' : 'Cancelled';
  return html`<p class="doc-meta"><span class="tag wf-${wf.state}">${word}</span> by ${profileName(state, wf.endedBy)}, ${when(wf.endedAt)}. Started by ${profileName(state, wf.createdBy)}, ${when(wf.createdAt)}.</p>
    <article class="doc">${checkGrid(data, wf)}
      ${wf.outcome ? html`<h3>Outcome</h3><p class="outcome-text">${wf.outcome}</p>` : ''}
      ${wf.notes ? html`<h3>Additional notes</h3><p class="outcome-text">${wf.notes}</p>` : ''}
      <h2>Changes made through ${workflowLabel(wf)}</h2>${changesList(state, data, wf)}</article>`;
}

/**
 * A workflow's page. Open: a rail of hazards and the summary, with the chosen one's checks; only
 * its owner can change them, anyone else sees them read-only and can take it over. Ended: what it
 * recorded and the changes made through it.
 * @param {any} state @param {Data} data @param {string} id
 */
export function workflowView(state, data, id) {
  const wf = get(data, 'workflow', id);
  if (!wf || wf.status === 'deleted') return html`<p class="muted">That workflow no longer exists.</p>`;
  const mine = wf.ownerId === state.profileId;
  const title = html`<h1>${go('Workflows', 'workflows')} · ${idTag(workflowLabel(wf))} ${typeName(wf.type)} · ${get(data, 'platform', wf.platformId) ? go(workflowSubject(data, wf), 'platform', { id: wf.platformId }) : workflowSubject(data, wf)}</h1>`;
  if (wf.state !== 'open') return html`<div class="head">${title}</div>${endedBody(state, data, wf)}`;
  const tools = mine
    ? confirmButton('Cancel workflow…', `Cancel ${named(wf)}: its ticks and notes are kept in History as cancelled; changes you made to hazards stay`, dataAttrs({ action: 'cancelWorkflow', 'workflow-id': wf.id }))
    : confirmButton('Take over…', `Take over ${named(wf)} from ${profileName(state, wf.ownerId)}`, dataAttrs({ action: 'takeOverWorkflow', 'workflow-id': wf.id }));
  const head = html`<div class="head">${title}<span class="wf-owner muted">Owner: ${profileName(state, wf.ownerId)}</span>${tools}</div>
    ${mine ? '' : html`<p class="wf-banner">Owned by ${profileName(state, wf.ownerId)}. You can look through it; take it over to work on it.</p>`}`;
  const hz = workflowHazards(data, wf);
  const want = state.view?.hazardId === 'summary' ? null : state.view?.hazardId ?? wf.at?.hazardId ?? null;
  const x = want ? hz.find((y) => y.hazard.id === want) ?? (state.view?.hazardId ? null : hz[0] ?? null) : null;
  const current = x ? x.hazard.id : null;
  return html`${head}<div class="wf-layout">${rail(data, wf, current)}<div class="wf-main">${x ? hazardPage(state, data, wf, x, mine) : summary(state, data, wf, mine)}</div></div>`;
}
