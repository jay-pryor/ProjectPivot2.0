import { html } from '../html.js';
import { dataAttrs, option, go, bandTag, plus, confirmButton, statusTag, idTag, levelTag, removeColumn, removeButton } from './common.js';
import { RECEPTORS, RECEPTOR_WORD } from '../../core/receptors.js';
import { dataTable } from './table.js';
import { tierColumn } from './controls.js';
import { rejectionCell, statusSelect } from './platforms.js';
import { phaseCard } from './phases.js';
import { referencesCard } from './references.js';
import { numberedCard, platformListCard, sectionRail, descriptionField } from './dashboard.js';
import { get } from '../../core/data.js';
import { ids, controlLabel } from '../../core/ids.js';
import { copySources, stageCopySources, assessmentOf, ratingsOf, sfarpOf, hazardDetail, existingControlsOn, controlsOnPlatform, safetyReportsOn, causalFactorsOn, platformListOn, platformListEntries, hazardReferences, bandOf, worseBand } from '../../core/queries.js';
import { SAFETY_REPORT_TYPES } from '../../core/ops/safety-reports.js';
import { day } from '../names.js';
import { CONTROL_KINDS } from '../../core/ops/controls.js';
import { CONTROL_STATUSES } from '../../core/ops/assessment.js';
import { CONSEQUENCES, LIKELIHOODS } from '../../core/matrix.js';

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
      removeColumn((x) => removeButton(`Remove ${x.control.title}`, `Remove ${x.control.title}?`, 'It will no longer be an existing control for this hazard on this platform.',
        { run: 'unlinkExistingControl', 'hazard-id': h.id, 'platform-id': platformId, 'control-id': x.control.id })),
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
        render: (c) => statusSelect(data, { hazardId: h.id, control: c.control, platformId, state: c.state }) },
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
      { key: 'description', label: 'Description', width: 560, minWidth: 200, value: (r) => r.description, render: (r) => cell(r, r.description) },
      removeColumn((r) => removeButton(`Delete ${r.number || r.summary}`, 'Delete this safety report?', `${r.number ? `${r.number}: ` : ''}${r.summary} will be deleted.`, { run: 'deleteSafetyReport', id: r.id })),
    ],
  })}
  ${editing === `new:${platformId}` ? safetyReportForm(h, platformId, null) : edited ? safetyReportForm(h, platformId, edited) : ''}`;
}

const WORD = { initial: 'Initial', residual: 'Residual', ...RECEPTOR_WORD };

/**
 * Initial or residual risk: a panel per receptor side by side, each with likelihood and
 * consequence dropdowns, their justifications, and the assessed level.
 * @param {any} state @param {Data} data @param {any} h the hazard @param {string} platformId @param {'initial' | 'residual'} stage
 */
export function riskPanels(state, data, h, platformId, stage) {
  const ratings = ratingsOf(data, h.id, platformId);
  const panel = (/** @type {'personnel' | 'environment' | 'capability'} */ receptor) => {
    const a = assessmentOf(data, h.id, platformId, stage, receptor);
    const at = { change: 'setAssessment', 'hazard-id': h.id, 'platform-id': platformId, stage, receptor };
    const label = `${WORD[stage]} ${receptor}`;
    /** A copy icon for a justification box, when another platform of the hazard has text in the same box. @param {'likelihoodWhy' | 'consequenceWhy'} field */
    const copy = (field) => (copySources(data, h.id, platformId, stage, receptor, field).length
      ? html`<button type="button" class="copy-from" ${dataAttrs({ action: 'openPicker', picker: 'copyJustification', 'hazard-id': h.id, 'platform-id': platformId, stage, receptor, field })} title="Copy from another platform" aria-label="Copy the ${stage} ${receptor} ${field === 'likelihoodWhy' ? 'likelihood' : 'consequence'} justification from another platform"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="9" height="9"/><path d="M3 11V2h9"/></svg></button>`
      : '');
    return html`<div class="risk-panel"><h3>${WORD[receptor]}</h3>
      <label class="risk-field">Likelihood <select name="likelihood" aria-label="${label} likelihood" ${dataAttrs(at)}>${option('', '—', a?.likelihood ?? '')}${LIKELIHOODS.map((l) => option(l.letter, `${l.letter} · ${l.label}`, a?.likelihood ?? ''))}</select></label>
      <div class="why">${copy('likelihoodWhy')}<textarea name="likelihoodWhy" rows="3" placeholder="Why this likelihood…" aria-label="${label} likelihood justification" ${dataAttrs(at)}>${a?.likelihoodWhy ?? ''}</textarea></div>
      <label class="risk-field">Consequence <select name="consequence" aria-label="${label} consequence" ${dataAttrs(at)}>${option('', '—', a?.consequence == null ? '' : String(a.consequence))}${CONSEQUENCES.map((c) => option(String(c.level), `${c.level} · ${c.label}`, a?.consequence == null ? '' : String(a.consequence)))}</select></label>
      <div class="why">${copy('consequenceWhy')}<textarea name="consequenceWhy" rows="3" placeholder="Why this consequence…" aria-label="${label} consequence justification" ${dataAttrs(at)}>${a?.consequenceWhy ?? ''}</textarea></div>
      <div class="risk-level">Assessed level ${levelTag(ratings[stage][receptor])}</div>
    </div>`;
  };
  return html`<div class="risk-panels risk-${stage}">${RECEPTORS.map((r) => panel(/** @type {'personnel'} */ (r)))}</div>`;
}

/**
 * Copy a whole stage (every risk type's likelihood and consequence) from another platform of the
 * hazard; shown only when another platform has something at that stage.
 * @param {Data} data @param {any} h @param {string} platformId @param {'initial' | 'residual'} stage
 */
function copyStageButton(data, h, platformId, stage) {
  if (!stageCopySources(data, h.id, platformId, stage).length) return '';
  return html`<button type="button" class="copy-stage" ${dataAttrs({ action: 'openPicker', picker: 'copyStage', 'hazard-id': h.id, 'platform-id': platformId, stage })} title="Copy all ${stage} likelihoods and consequences from another platform"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="9" height="9"/><path d="M3 11V2h9"/></svg>Copy from…</button>`;
}

/**
 * The hazard's causal factors on its other platforms whose wording is not already here, once
 * each, with the platforms they come from.
 * @param {Data} data @param {string} hazardId @param {string} platformId
 */
function causalFactorSuggestions(data, hazardId, platformId) {
  const here = new Set(causalFactorsOn(data, hazardId, platformId).map((r) => String(r.text).trim().toLowerCase()));
  /** @type {Map<string, { text: string, from: string[] }>} */
  const found = new Map();
  for (const r of causalFactorsOn(data, hazardId)) {
    const key = String(r.text).trim().toLowerCase();
    if (!r.platformId || r.platformId === platformId || here.has(key)) continue;
    const name = String(get(data, 'platform', r.platformId)?.name ?? '');
    const e = found.get(key) ?? { text: r.text, from: [] };
    if (name && !e.from.includes(name)) e.from.push(name);
    found.set(key, e);
  }
  return [...found.values()].map((e) => ({ text: e.text, from: e.from.join(', ') }));
}

const SHARED = html`<span class="shared-mark">Shared across platforms</span>`;

/** The worst band over every receptor at one stage, as a dot on the rail; nothing until one is rated. @param {Record<string, any>} stage */
const worstDot = (stage) => {
  const band = RECEPTORS.map((x) => bandOf(stage[x])).reduce(worseBand);
  return band === 'Uncategorised' ? '' : html`<span class="band band-${band.toLowerCase().replace(/\s+/g, '-')} rail-dot" title="Worst: ${band}"></span>`;
};

/**
 * One platform's SSRA for a hazard, as a dashboard: its risk and controls at a glance, the
 * numbered causal factors and consequences, and a rail that opens one longer section at a time.
 * @param {any} state @param {Data} data @param {any} h the hazard @param {string} platformId
 */
export function platformTab(state, data, h, platformId) {
  const link = get(data, 'hazardPlatform', ids.hazardPlatform(h.id, platformId));
  const p = get(data, 'platform', platformId);
  if (!link || link.status !== 'live' || !p) return html`<p class="muted">This hazard is not on that platform. ${go('Back to the overview', 'hazard', { id: h.id })}</p>`;
  const d = /** @type {NonNullable<ReturnType<typeof hazardDetail>>} */ (hazardDetail(data, h.id));
  const sf = sfarpOf(data, h.id, platformId);
  const sfAt = { change: 'setSfarp', 'hazard-id': h.id, 'platform-id': platformId };
  const ratings = ratingsOf(data, h.id, platformId);
  const existing = existingControlsOn(data, h.id, platformId);
  const additional = controlsOnPlatform(data, h.id, platformId);
  const reports = safetyReportsOn(data, h.id, platformId);
  const byState = CONTROL_STATUSES.map((st) => [st, additional.filter((c) => c.state === st).length]).filter(([, n]) => n);
  return html`<article class="doc ssra dash">
    <div class="dash-grid three">
      <section class="dash-card" aria-label="Hazard">
        <h3 class="dash-card-h">Hazard ${SHARED}<button type="button" class="small bt-open-btn" ${dataAttrs({ action: 'openBowtie', 'hazard-id': h.id, 'platform-id': platformId })}>Open bow-tie</button></h3>
        ${descriptionField(h)}
      </section>
      <section class="dash-card" aria-label="Risk">
        <h3 class="dash-card-h">Risk</h3>
        <table class="risk-glance"><thead><tr><th></th>${RECEPTORS.map((x) => html`<th scope="col">${RECEPTOR_WORD[/** @type {'personnel'} */ (x)]}</th>`)}</tr></thead>
          <tbody>${(/** @type {const} */ (['initial', 'residual'])).map((stage) => html`<tr><th scope="row">${WORD[stage]}</th>${RECEPTORS.map((x) => html`<td>${ratings[stage][/** @type {'personnel'} */ (x)] ? levelTag(ratings[stage][/** @type {'personnel'} */ (x)]) : html`<span class="muted">—</span>`}</td>`)}</tr>`)}</tbody></table>
      </section>
      <section class="dash-card" aria-label="Controls">
        <h3 class="dash-card-h">Controls</h3>
        <p class="glance-line"><strong>${existing.length}</strong> existing</p>
        <p class="glance-line"><strong>${additional.length}</strong> additional${byState.length ? html` <span class="glance-tags">${byState.map(([st, n]) => html`<span class="tag state-${st}">${n} ${st}</span> `)}</span>` : ''}</p>
        <p class="glance-line"><strong>${reports.length}</strong> safety report${reports.length === 1 ? '' : 's'}</p>
      </section>
    </div>
    <div class="dash-grid five-even">
      ${numberedCard(state, { name: 'CausalFactor', items: causalFactorsOn(data, h.id, platformId), hazardId: h.id, platformId, suggestions: causalFactorSuggestions(data, h.id, platformId) })}
      ${numberedCard(state, { name: 'Consequence', items: d.consequences, hazardId: h.id })}
      ${platformListCard(state, { kind: 'systemElement', items: platformListOn(data, 'systemElement', h.id, platformId), hazardId: h.id, platformId, entries: platformListEntries(data, 'systemElement') })}
      ${phaseCard(data, h)}
      ${platformListCard(state, { kind: 'affectedGroup', items: platformListOn(data, 'affectedGroup', h.id, platformId), hazardId: h.id, platformId, entries: platformListEntries(data, 'affectedGroup') })}
    </div>
    ${sectionRail(state, 'ssra', [
      { key: 'reports', label: 'Safety reports', icon: 'reports', badge: reports.length, body: () => html`<h2>Safety reports</h2><section class="block">${safetyReportsSection(state, data, h, platformId)}</section>` },
      { key: 'existing', label: 'Existing controls', icon: 'existing', badge: existing.length, body: () => html`<h2>Existing controls</h2><section class="block">${existingSection(state, data, h, platformId)}</section>` },
      { key: 'references', label: 'References', icon: 'references', badge: hazardReferences(data, h.id).length, body: () => html`<h2>References ${SHARED}</h2><section class="block">${referencesCard(state, data, { kind: 'hazard', id: h.id })}</section>` },
      { key: 'initial', label: 'Initial risk', icon: 'initial', badge: worstDot(ratings.initial), body: () => html`<h2>Initial risk${copyStageButton(data, h, platformId, 'initial')}</h2>${riskPanels(state, data, h, platformId, 'initial')}` },
      { key: 'analysis', label: 'Additional controls', icon: 'analysis', badge: additional.length, body: () => html`<h2>Additional control analysis <span class="shared-mark">Recommendation and justification shared across platforms</span></h2><section class="block">${analysisSection(state, data, h, platformId, p.name)}</section>` },
      { key: 'residual', label: 'Residual risk', icon: 'residual', badge: worstDot(ratings.residual), body: () => html`<h2>Residual risk${copyStageButton(data, h, platformId, 'residual')}</h2>${riskPanels(state, data, h, platformId, 'residual')}` },
      { key: 'sfarp', label: 'SFARP', icon: 'sfarp', badge: sf.conclusion?.trim() ? '✓' : '', body: () => html`<h2>SFARP considerations</h2>
        <div class="sfarp">
          <label>SFARP justification<textarea name="justification" rows="4" aria-label="SFARP justification" ${dataAttrs(sfAt)}>${sf.justification}</textarea></label>
          <label>SFARP conclusion<textarea name="conclusion" rows="2" aria-label="SFARP conclusion" ${dataAttrs(sfAt)}>${sf.conclusion}</textarea></label>
          <label>Conditions of validity<textarea name="conditions" rows="3" aria-label="Conditions of validity" ${dataAttrs(sfAt)}>${sf.conditions}</textarea></label>
        </div>` },
    ], 'initial')}
  </article>`;
}
