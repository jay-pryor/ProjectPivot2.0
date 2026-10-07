import { html } from '../html.js';
import { dataAttrs, option, go, bandTag, plus, confirmButton, statusTag, idTag, levelTag, removeColumn, removeButton, rowDotsMenu, stateWord } from './common.js';
import { RECEPTORS, RECEPTOR_WORD } from '../../core/receptors.js';
import { dataTable } from './table.js';
import { tierColumn } from './controls.js';
import { rejectionCell, statusSelect, implementedBySelect, withPlatformImage } from './platforms.js';
import { phaseCard } from './phases.js';
import { referencesCard } from './references.js';
import { numberedCard, platformListCard, sectionRail, descriptionField } from './dashboard.js';
import { get } from '../../core/data.js';
import { ids, controlLabel } from '../../core/ids.js';
import { copySources, stageCopySources, assessmentOf, ratingsOf, sfarpOf, hazardDetail, controlsOnPlatform, safetyReportsOn, causalFactorsOn, partCopySources, platformListOn, platformListEntries, hazardReferences, hazardReferenceRows, bandOf, worseBand, implementedByOf, implementedByText } from '../../core/queries.js';
import { SAFETY_REPORT_TYPES } from '../../core/ops/safety-reports.js';
import { safetyReportId } from '../../core/ops/report-ids.js';
import { idColumn } from './hazards.js';
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

/**
 * What a control prevents or mitigates here, one a line, and a + (shown on pointing at the cell)
 * to choose them: this platform's causal factors for a preventative one, the hazard's consequences
 * for a mitigating one.
 * @param {any} c a controlsOnPlatform row @param {string} hazardId @param {string} platformId
 */
function targetsCell(c, hazardId, platformId) {
  const word = c.kind === 'mitigating' ? 'consequences it mitigates' : 'causal factors it prevents';
  return html`<div class="for-cell"><ul class="plain for-list${c.targets.length ? ' dots' : ''}">${c.targets.length
    ? c.targets.map((/** @type {any} */ t) => html`<li><span class="for-text">${t.text}</span></li>`)
    : html`<li><span class="muted">None chosen</span></li>`}</ul>
    ${plus({ action: 'openPicker', picker: 'controlTargets', 'hazard-id': hazardId, 'platform-id': platformId, 'control-id': c.control.id }, `Choose the ${word}`)}</div>`;
}

/** The column of what each control prevents or mitigates. @param {string} hazardId @param {string} platformId */
const targetsColumn = (hazardId, platformId) => ({ key: 'targets', label: 'Prevents / Mitigates', width: 320, minWidth: 200, sortable: false,
  value: (/** @type {any} */ c) => c.targets.map((/** @type {any} */ t) => t.text).join(', '), render: (/** @type {any} */ c) => targetsCell(c, hazardId, platformId) });

/** @param {any} c */
const controlCell = (c) => html`${go(c.control.title, 'control', { id: c.control.id })}${statusTag(c.control.status)}`;

/** A control table's own column for the control's number (C-…), opening its page. Made when a table is drawn, not as this file loads, as it comes from hazards.js, which needs this file. */
const controlIdColumn = () => ({ ...idColumn((/** @type {any} */ c) => c.control, controlLabel, (/** @type {any} */ c) => go(idTag(controlLabel(c.control)), 'control', { id: c.control.id })), label: 'Control ID', width: 180, minWidth: 150 });

/**
 * The hazard's controls on this platform: this platform's status, who implements it and how far it
 * has got, its kind here and what it prevents or mitigates, and the analysis shared across the
 * hazard's platforms. + adds controls here; ✕ takes one off this platform alone.
 * @param {any} state @param {Data} data @param {any} h @param {string} platformId @param {string} platformName
 */
function controlsSection(state, data, h, platformId, platformName) {
  const rows = controlsOnPlatform(data, h.id, platformId);
  return dataTable(state, {
    id: 'controlAnalysis',
    rowKey: (c) => c.control.id,
    rows,
    empty: 'No controls on this platform yet. Add them with the +.',
    tools: plus({ action: 'openPicker', picker: 'addControlsHere', 'hazard-id': h.id, 'platform-id': platformId }, 'Add controls'),
    columns: [
      controlIdColumn(),
      { key: 'control', label: 'Control', width: 300, minWidth: 180, value: (c) => c.control.title, filter: 'text', render: controlCell },
      { key: 'state', label: `Status on ${platformName}`, width: 230, minWidth: 150, value: (c) => CONTROL_STATUSES.indexOf(c.state),
        render: (c) => statusSelect(data, { hazardId: h.id, control: c.control, platformId, state: c.state }) },
      { key: 'implementedBy', label: 'Implemented by', width: 190, minWidth: 150, value: (c) => implementedByText(implementedByOf(data, c.control.id, platformId)),
        render: (c) => implementedBySelect(data, c.control, platformId, platformName) },
      { key: 'reason', label: 'Reason rejected, or who set it', width: 320, minWidth: 200, sortable: false, render: (c) => rejectionCell(state, c, h.id, platformId, platformName) },
      tierColumn((c) => c.control, false),
      // Its kind here: the hazard's to begin with, changeable for this platform alone.
      { key: 'kind', label: 'Kind', width: 180, minWidth: 140, value: (c) => c.kind,
        render: (c) => html`<select class="quiet" name="kind" aria-label="Kind of ${c.control.title} on ${platformName}" ${dataAttrs({ change: 'setControlKindOnPlatform', 'hazard-id': h.id, 'platform-id': platformId, 'control-id': c.control.id })}>${CONTROL_KINDS.map((k) => option(k, k, c.kind))}</select>` },
      targetsColumn(h.id, platformId),
      { key: 'recommendation', label: 'Recommendation', width: 420, minWidth: 200, sortable: false, render: (c) => analysisArea('recommendation', c, h.id) },
      { key: 'justification', label: 'Justification', width: 420, minWidth: 200, sortable: false, render: (c) => analysisArea('justification', c, h.id) },
      // This platform's own words on how far it has got, beside its status.
      { key: 'implementation', label: 'Implementation Status', width: 420, minWidth: 200, sortable: false,
        value: (c) => get(data, 'implementationStatus', ids.implementationStatus(h.id, c.control.id, platformId))?.text ?? '',
        render: (c) => {
          const rec = get(data, 'implementationStatus', ids.implementationStatus(h.id, c.control.id, platformId));
          return html`<textarea class="cell-area" name="text" rows="2" placeholder="Implementation status…" aria-label="Implementation status of ${c.control.title} on ${platformName}" ${dataAttrs({ change: 'setImplementationStatus', 'hazard-id': h.id, 'control-id': c.control.id, 'platform-id': platformId })}>${rec && rec.status === 'live' ? rec.text : ''}</textarea>`;
        } },
      removeColumn((c) => removeButton(`Remove ${c.control.title} from ${platformName}`, `Remove ${c.control.title} from ${platformName}?`, `It stays linked to the hazard on its other platforms, and its status and notes here are kept if it is added back.`,
        { run: 'removeControlHere', 'hazard-id': h.id, 'platform-id': platformId, 'control-id': c.control.id })),
    ],
  });
}

/** The form to add a safety report, or to edit one. @param {any} h the hazard @param {string} platformId @param {any} r the report, or null to add */
function safetyReportForm(h, platformId, r) {
  const at = r ? { action: 'updateSafetyReport', id: r.id } : { action: 'createSafetyReport', 'hazard-id': h.id, 'platform-id': platformId };
  const v = r ?? { date: '', type: 'Occurrence', summary: '', description: '', location: '', parties: '' };
  return html`<form ${dataAttrs(at)} class="report-form">
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
  // A cell is changed in place: double-click it, then Enter (or leave it) to keep, Escape to cancel.
  const cellEditing = state.editing?.kind === 'safetyReportCell' ? String(state.editing.id) : null;
  /**
   * @param {any} r @param {string} field the report's field (type is sent as reportType)
   * @param {unknown} text what the cell shows @param {'text' | 'date' | 'type' | 'long'} [as]
   */
  const cell = (r, field, text, as = 'text') => {
    if (cellEditing !== `${r.id}:${field}`) {
      return html`<span class="cell-text" ${dataAttrs({ dblclick: 'startEdit', kind: 'safetyReportCell', id: `${r.id}:${field}` })} title="Double-click to change">${text}</span>`;
    }
    const at = dataAttrs({ change: 'updateSafetyReport', id: r.id });
    const label = `${field === 'parties' ? 'Parties involved' : field[0].toUpperCase() + field.slice(1)} of ${named(r)}`;
    if (as === 'type') return html`<select class="cell-edit" name="reportType" aria-label="${label}" autofocus ${at}>${SAFETY_REPORT_TYPES.map((t) => option(t, t, r.type))}</select>`;
    if (as === 'long') return html`<textarea class="cell-edit" name="${field}" rows="3" aria-label="${label}" autofocus ${at}>${r[field] ?? ''}</textarea>`;
    return html`<input class="cell-edit" name="${field}" type="${as === 'date' ? 'date' : 'text'}" value="${r[field] ?? ''}"${field === 'summary' ? html` required` : ''} aria-label="${label}" autofocus ${at}>`;
  };
  const edited = editing && rows.find((r) => r.id === editing);
  // Its Report ID, given at save and never edited: TBC until then, with any it had before a move.
  /** @param {any} r */
  const rid = (r) => safetyReportId(data, r);
  /** @param {any} r */
  const named = (r) => (rid(r).id === 'TBC' ? r.summary : rid(r).id);
  // The ⋯ beside ✕ moves a report to another platform the hazard is on, when it was filed against the wrong one.
  const others = hazardDetail(data, h.id)?.platforms.map((x) => x.platform).filter((pl) => pl.id !== platformId) ?? [];
  /** @param {any} r */
  const moveMenu = (r) => rowDotsMenu(`More for ${named(r)}`, others.length
    ? others.map((pl) => html`<button type="button" ${dataAttrs({ action: 'moveSafetyReport', id: r.id, 'platform-id': pl.id })}>Move to ${pl.name}</button>`)
    : [html`<button type="button" disabled title="The hazard is on no other platform">No other platform to move it to</button>`]);
  return html`${dataTable(state, {
    id: 'safetyReports',
    rowKey: (r) => r.id,
    rows,
    empty: 'No safety reports for this platform yet.',
    tools: plus({ action: 'startEdit', kind: 'safetyReport', id: `new:${platformId}` }, 'Add a safety report'),
    columns: [
      { key: 'reportId', label: 'Report ID', width: 200, minWidth: 130, value: (r) => rid(r).id, render: (r) => {
        const { id, past } = rid(r);
        return html`<span class="report-id" title="${id === 'TBC' ? 'Given when you save' : 'Given at save; never changes'}">${idTag(id)}</span>${past.length ? html`<div class="muted small-text">was ${past.join(', ')}</div>` : ''}`;
      } },
      { key: 'date', label: 'Date', width: 190, minWidth: 120, value: (r) => r.date ?? '', render: (r) => cell(r, 'date', r.date ? day(r.date) : '—', 'date') },
      { key: 'type', label: 'Type', width: 210, minWidth: 120, value: (r) => r.type, render: (r) => cell(r, 'type', r.type, 'type') },
      { key: 'summary', label: 'Summary', width: 560, minWidth: 200, value: (r) => r.summary, render: (r) => cell(r, 'summary', r.summary) },
      { key: 'location', label: 'Location', width: 260, minWidth: 120, value: (r) => r.location, render: (r) => cell(r, 'location', r.location || '—') },
      { key: 'parties', label: 'Parties involved', width: 300, minWidth: 140, value: (r) => r.parties, render: (r) => cell(r, 'parties', r.parties || '—') },
      { key: 'description', label: 'Description', width: 560, minWidth: 200, value: (r) => r.description, render: (r) => cell(r, 'description', r.description || '—', 'long') },
      { ...removeColumn((r) => html`${moveMenu(r)}${removeButton(`Delete ${named(r)}`, 'Delete this safety report?', `${rid(r).id === 'TBC' ? '' : `${rid(r).id}: `}${r.summary} will be deleted. Its Report ID is not used again.`, { run: 'deleteSafetyReport', id: r.id })}`), width: 84, minWidth: 84 },
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
 * Copy from… for a section of a hazard's platform tab (controls, SFARP), when another platform of
 * the hazard has some to copy.
 * @param {Data} data @param {any} h @param {string} platformId @param {'controls' | 'sfarp'} part @param {string} what
 */
function copyPartButton(data, h, platformId, part, what) {
  if (!partCopySources(data, h.id, platformId, part).length) return '';
  return html`<button type="button" class="copy-stage" ${dataAttrs({ action: 'openPicker', picker: 'copyPart', part, 'hazard-id': h.id, 'platform-id': platformId })} title="Copy ${what} from another platform"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="9" height="9"/><path d="M3 11V2h9"/></svg>Copy from…</button>`;
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

/**
 * For a hazard's typed list on one platform, each entry (in lower case) its other platforms have,
 * with their names: what the box's suggestions say they are already used on.
 * @param {Data} data @param {'failureMode' | 'systemElement' | 'affectedGroup'} kind @param {string} hazardId @param {string} platformId
 */
function usedOnOthers(data, kind, hazardId, platformId) {
  /** @type {Map<string, string[]>} */
  const on = new Map();
  for (const { platform } of hazardDetail(data, hazardId)?.platforms ?? []) {
    if (platform.id === platformId) continue;
    for (const r of platformListOn(data, kind, hazardId, platform.id)) {
      const key = String(r.text).trim().toLowerCase();
      const names = on.get(key) ?? [];
      if (!names.includes(platform.name)) on.set(key, [...names, platform.name]);
    }
  }
  return on;
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
  const controls = controlsOnPlatform(data, h.id, platformId);
  const reports = safetyReportsOn(data, h.id, platformId);
  const byState = CONTROL_STATUSES.map((st) => [st, controls.filter((c) => c.state === st).length]).filter(([, n]) => n);
  return html`<article class="doc ssra dash">
    ${withPlatformImage(p, html`<div class="dash-grid three">
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
        <p class="glance-line"><strong>${controls.length}</strong> control${controls.length === 1 ? '' : 's'}${byState.length ? html` <span class="glance-tags">${byState.map(([st, n]) => html`<span class="tag state-${st}">${n} ${stateWord(String(st))}</span> `)}</span>` : ''}</p>
        <p class="glance-line"><strong>${reports.length}</strong> safety report${reports.length === 1 ? '' : 's'}</p>
      </section>
    </div>`)}
    <div class="dash-grid hazard-lists">
      ${numberedCard(state, { name: 'CausalFactor', items: causalFactorsOn(data, h.id, platformId), hazardId: h.id, platformId, suggestions: causalFactorSuggestions(data, h.id, platformId) })}
      ${numberedCard(state, { name: 'Consequence', items: d.consequences, hazardId: h.id })}
      ${platformListCard(state, { kind: 'failureMode', items: platformListOn(data, 'failureMode', h.id, platformId), hazardId: h.id, platformId, entries: platformListEntries(data, 'failureMode'), usedOn: usedOnOthers(data, 'failureMode', h.id, platformId) })}
      ${platformListCard(state, { kind: 'systemElement', items: platformListOn(data, 'systemElement', h.id, platformId), hazardId: h.id, platformId, entries: platformListEntries(data, 'systemElement'), usedOn: usedOnOthers(data, 'systemElement', h.id, platformId) })}
      ${phaseCard(data, h)}
      ${platformListCard(state, { kind: 'affectedGroup', items: platformListOn(data, 'affectedGroup', h.id, platformId), hazardId: h.id, platformId, entries: platformListEntries(data, 'affectedGroup'), usedOn: usedOnOthers(data, 'affectedGroup', h.id, platformId) })}
    </div>
    ${sectionRail(state, 'ssra', [
      { key: 'reports', label: 'Safety reports', icon: 'reports', badge: reports.length, body: () => html`<h2>Safety reports</h2><section class="block">${safetyReportsSection(state, data, h, platformId)}</section>` },
      { key: 'references', label: 'References', icon: 'references', badge: hazardReferenceRows(data, h.id, platformId).length, body: () => html`<h2>References</h2><section class="block">${referencesCard(state, data, { kind: 'hazard', id: h.id, platformId })}</section>` },
      { key: 'initial', label: 'Initial risk', icon: 'initial', badge: worstDot(ratings.initial), body: () => html`<h2>Initial risk${copyStageButton(data, h, platformId, 'initial')}</h2>${riskPanels(state, data, h, platformId, 'initial')}` },
      { key: 'controls', label: 'Controls', icon: 'controls', badge: controls.length, body: () => html`<h2>Controls <span class="shared-mark">Recommendation and justification shared across platforms</span>${copyPartButton(data, h, platformId, 'controls', 'the controls and their statuses')}</h2><section class="block">${controlsSection(state, data, h, platformId, p.name)}</section>` },
      { key: 'residual', label: 'Residual risk', icon: 'residual', badge: worstDot(ratings.residual), body: () => html`<h2>Residual risk${copyStageButton(data, h, platformId, 'residual')}</h2>${riskPanels(state, data, h, platformId, 'residual')}` },
      { key: 'sfarp', label: 'SFARP', icon: 'sfarp', badge: sf.conclusion?.trim() ? '✓' : '', body: () => html`<h2>SFARP considerations${copyPartButton(data, h, platformId, 'sfarp', 'the SFARP considerations')}</h2>
        <div class="sfarp">
          <label>SFARP justification<textarea name="justification" rows="4" aria-label="SFARP justification" ${dataAttrs(sfAt)}>${sf.justification}</textarea></label>
          <label>SFARP conclusion<textarea name="conclusion" rows="2" aria-label="SFARP conclusion" ${dataAttrs(sfAt)}>${sf.conclusion}</textarea></label>
          <label>Conditions of validity<textarea name="conditions" rows="3" aria-label="Conditions of validity" ${dataAttrs(sfAt)}>${sf.conditions}</textarea></label>
        </div>` },
    ], 'initial')}
  </article>`;
}
