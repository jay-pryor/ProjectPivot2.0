import { html } from '../html.js';
import { dataAttrs, option, go, bandTag, plus, confirmButton, statusTag, idTag } from './common.js';
import { dataTable } from './table.js';
import { tierColumn } from './controls.js';
import { rejectionCell } from './platforms.js';
import { phaseChips } from './phases.js';
import { referencesCard } from './references.js';
import { textTable } from './hazards.js';
import { get } from '../../core/data.js';
import { ids, controlLabel } from '../../core/ids.js';
import { assessmentOf, ratingsOf, sfarpOf, hazardDetail, existingControlsOn, controlsOnPlatform, safetyReportsOn } from '../../core/queries.js';
import { SAFETY_REPORT_TYPES } from '../../core/ops/safety-reports.js';
import { day } from '../names.js';
import { CONTROL_KINDS } from '../../core/ops/controls.js';
import { CONTROL_STATUSES } from '../../core/ops/assessment.js';
import { CONSEQUENCES, LIKELIHOODS, ratingFor } from '../../core/matrix.js';

/** @typedef {import('../../core/data.js').Data} Data */

/** A shared text in a table cell, applied when left. @param {'recommendation' | 'justification'} name @param {any} row a controlsOnPlatform or hazardDetail control row @param {string} hazardId */
export function analysisArea(name, row, hazardId) {
  const word = name === 'recommendation' ? 'Recommendation' : 'Justification';
  return html`<textarea class="cell-area" name="${name}" rows="2" placeholder="${word}…" aria-label="${word} for ${row.control.title}" ${dataAttrs({ change: 'setControlAnalysis', 'hazard-id': hazardId, 'control-id': row.control.id })}>${row.link?.[name] ?? ''}</textarea>`;
}

/** @param {any} c */
const controlCell = (c) => html`<span class="id">${idTag(controlLabel(c.control))}</span> ${go(c.control.title, 'control', { id: c.control.id })}${statusTag(c.control.status)}`;

/** The controls already in place for the hazard on this platform, by tier. @param {any} state @param {Data} data @param {any} h @param {string} platformId */
function existingSection(state, data, h, platformId) {
  const rows = existingControlsOn(data, h.id, platformId);
  return dataTable(state, {
    id: 'existingControls',
    rowKey: (x) => x.control.id,
    rows,
    empty: 'No existing controls recorded for this platform yet.',
    tools: plus({ action: 'openPicker', picker: 'linkExistingControls', 'hazard-id': h.id, 'platform-id': platformId }, 'Add existing controls'),
    columns: [
      { key: 'control', label: 'Existing controls', width: 720, minWidth: 200, value: (x) => `${controlLabel(x.control)} ${x.control.title}`, render: controlCell },
      tierColumn((x) => x.control, false),
      { key: 'kind', label: 'Kind', width: 300, minWidth: 150, value: (x) => x.kind,
        render: (x) => html`<select class="quiet" name="kind" aria-label="Kind of ${x.control.title}" ${dataAttrs({ change: 'setExistingControlKind', 'hazard-id': h.id, 'platform-id': platformId, 'control-id': x.control.id })}>${CONTROL_KINDS.map((k) => option(k, k, x.kind))}</select>` },
      { key: 'actions', label: '', width: 120, minWidth: 80, sortable: false,
        render: (x) => html`<div class="row-actions">${confirmButton('✕', 'Remove this existing control from the platform', dataAttrs({ action: 'unlinkExistingControl', 'hazard-id': h.id, 'platform-id': platformId, 'control-id': x.control.id }))}</div>` },
    ],
  });
}

/** The hazard's additional controls: shared analysis, and this platform's status. @param {any} state @param {Data} data @param {any} h @param {string} platformId @param {string} platformName */
function analysisSection(state, data, h, platformId, platformName) {
  const rows = controlsOnPlatform(data, h.id, platformId);
  return dataTable(state, {
    id: 'controlAnalysis',
    rowKey: (c) => c.control.id,
    rows,
    empty: 'No additional controls. Link them on the Overview tab.',
    columns: [
      { key: 'control', label: 'Additional controls', width: 360, minWidth: 200, value: (c) => `${controlLabel(c.control)} ${c.control.title}`, render: controlCell },
      { key: 'state', label: `Status on ${platformName}`, width: 230, minWidth: 150, value: (c) => CONTROL_STATUSES.indexOf(c.state),
        render: (c) => html`<select class="quiet state-select state-${c.state}" name="value" aria-label="Status of ${c.control.title}" ${dataAttrs({ change: 'setControlState', 'hazard-id': h.id, 'control-id': c.control.id, 'platform-id': platformId })}>${CONTROL_STATUSES.map((s) => option(s, s, c.state))}</select>` },
      { key: 'reason', label: 'Reason rejected, or who set it', width: 320, minWidth: 200, sortable: false, render: (c) => rejectionCell(state, c, h.id, platformId, platformName) },
      tierColumn((c) => c.control, false),
      { key: 'kind', label: 'Kind', width: 180, minWidth: 120, value: (c) => c.kind },
      { key: 'recommendation', label: 'Recommendation', width: 420, minWidth: 200, sortable: false, render: (c) => analysisArea('recommendation', c, h.id) },
      { key: 'justification', label: 'Justification', width: 420, minWidth: 200, sortable: false, render: (c) => analysisArea('justification', c, h.id) },
    ],
  });
}

/** The form to add a safety report, or to edit one. @param {any} h the hazard @param {string} platformId @param {any} r the report, or null to add */
function safetyReportForm(h, platformId, r) {
  const at = r ? { action: 'updateSafetyReport', id: r.id } : { action: 'createSafetyReport', 'hazard-id': h.id, 'platform-id': platformId };
  const v = r ?? { number: '', date: '', type: 'Occurrence', summary: '', description: '', location: '', parties: '' };
  return html`<form ${dataAttrs(at)} class="report-form">
    <label>Report number<input name="number" value="${v.number}" autocomplete="off"></label>
    <label>Date<input type="date" name="date" value="${v.date ?? ''}"></label>
    <label>Type<select name="reportType" aria-label="Type">${SAFETY_REPORT_TYPES.map((t) => option(t, t, v.type))}</select></label>
    <label class="wide">Summary<input name="summary" required value="${v.summary}" autocomplete="off"></label>
    <label>Location<input name="location" value="${v.location}" autocomplete="off"></label>
    <label>Parties involved<input name="parties" value="${v.parties}" autocomplete="off"></label>
    <label class="wide">Description<textarea name="description" rows="4">${v.description}</textarea></label>
    <div class="actions wide"><button type="submit" class="primary">${r ? 'Save' : 'Add'}</button><button type="button" ${dataAttrs({ action: 'cancelEdit' })}>Cancel</button></div>
  </form>`;
}

/** This platform's safety reports for the hazard. @param {any} state @param {Data} data @param {any} h @param {string} platformId */
function safetyReportsSection(state, data, h, platformId) {
  const rows = safetyReportsOn(data, h.id, platformId);
  const editing = state.editing?.kind === 'safetyReport' ? state.editing.id : null;
  /** @param {any} r @param {unknown} text */
  const cell = (r, text) => html`<span class="cell-text" ${dataAttrs({ dblclick: 'startEdit', kind: 'safetyReport', id: r.id })} title="Double-click to edit">${text}</span>`;
  const edited = editing && rows.find((r) => r.id === editing);
  return html`${dataTable(state, {
    id: 'safetyReports',
    rowKey: (r) => r.id,
    rows,
    empty: 'No safety reports for this platform yet.',
    tools: plus({ action: 'startEdit', kind: 'safetyReport', id: `new:${platformId}` }, 'Add a safety report'),
    columns: [
      { key: 'number', label: 'Report', width: 200, minWidth: 110, value: (r) => r.number, render: (r) => cell(r, r.number || '—') },
      { key: 'date', label: 'Date', width: 190, minWidth: 120, value: (r) => r.date ?? '', render: (r) => cell(r, r.date ? day(r.date) : '—') },
      { key: 'type', label: 'Type', width: 210, minWidth: 120, value: (r) => r.type, render: (r) => cell(r, r.type) },
      { key: 'summary', label: 'Summary', width: 560, minWidth: 200, value: (r) => r.summary, render: (r) => cell(r, r.summary) },
      { key: 'location', label: 'Location', width: 260, minWidth: 120, value: (r) => r.location, render: (r) => cell(r, r.location) },
      { key: 'parties', label: 'Parties involved', width: 300, minWidth: 140, value: (r) => r.parties, render: (r) => cell(r, r.parties) },
      { key: 'actions', label: '', width: 110, minWidth: 80, sortable: false,
        render: (r) => html`<div class="row-actions">${confirmButton('✕', 'Delete this safety report', dataAttrs({ action: 'deleteSafetyReport', id: r.id }))}</div>` },
    ],
  })}
  ${editing === `new:${platformId}` ? safetyReportForm(h, platformId, null) : edited ? safetyReportForm(h, platformId, edited) : ''}`;
}

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
      ${phaseChips(data, h)}
      <section class="block">${textTable(state, 'CausalFactor', d.causalFactors, h.id)}</section>
      <section class="block">${textTable(state, 'Consequence', d.consequences, h.id)}</section>
    </section>
    <section class="ssra-sec"><h2>Safety reports</h2><section class="block">${safetyReportsSection(state, data, h, platformId)}</section></section>
    <section class="ssra-sec"><h2>Existing controls</h2><section class="block">${existingSection(state, data, h, platformId)}</section></section>
    <section class="ssra-sec"><h2>References ${SHARED}</h2><section class="block">${referencesCard(state, data, { kind: 'hazard', id: h.id })}</section></section>
    <section class="ssra-sec"><h2>Initial risk</h2>${riskPanels(state, data, h, platformId, 'initial')}</section>
    <section class="ssra-sec"><h2>Additional control analysis <span class="shared-mark">Recommendation and justification shared across platforms</span></h2><section class="block">${analysisSection(state, data, h, platformId, p.name)}</section></section>
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
