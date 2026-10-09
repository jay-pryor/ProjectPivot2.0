import { html, raw } from '../html.js';
import { dataAttrs, go } from './common.js';
import { get } from '../../core/data.js';
import { referenceItems, stepOf } from '../../core/workflows.js';
import { profileName, when } from '../names.js';

/** @typedef {import('../../core/data.js').Data} Data */

const KIND_WORD = Object.freeze({ hazard: 'Hazard', control: 'Control', platform: 'Platform', consequence: 'Consequence', hazardPhase: 'Lifecycle phase', causalFactor: 'Causal factor', failureMode: 'Element failure mode', systemElement: 'System/Element', affectedGroup: 'Affected group' });

/** @param {any} state @param {Data} data @param {any} wf @param {boolean} mine */
export function updateBody(state, data, wf, mine) {
  const r = get(data, 'reference', wf.referenceId);
  const dis = mine ? '' : raw(' disabled');
  const at = { change: 'setReferenceDraft', 'workflow-id': wf.id };
  const items = referenceItems(data, wf.referenceId);
  const draft = html`<section class="wf-check" aria-label="New revision"><h3 class="wf-check-h">New revision</h3>
    <div class="wf-rev"><span class="field-label">Current revision</span> <strong>${r?.revision || '—'}</strong></div>
    <label class="field-block"><span class="field-label">New revision</span><input name="revision" value="${wf.revision ?? ''}" required placeholder="e.g. C"${dis} ${dataAttrs(at)}></label>
    <div class="field-block"><span class="field-label">New file</span>${wf.file ? html`<span>${wf.file.name}</span> ` : ''}
      <form class="inline" data-action="uploadUpdateFile" ${dataAttrs({ 'workflow-id': wf.id })}><input type="file" name="file"${dis}><button type="submit" class="small"${dis}>Upload</button></form></div>
    <label class="field-block"><span class="field-label">New link</span><input name="url" value="${wf.url ?? ''}" placeholder="${r?.url ?? 'https://…'}"${dis} ${dataAttrs(at)}></label>
    <label class="field-block"><span class="field-label">New path</span><input name="path" value="${wf.path ?? ''}" placeholder="${r?.path ?? '\\\\share\\…'}"${dis} ${dataAttrs(at)}></label>
    <p class="muted">Give at least one of a file, a link or a path. Nothing reaches the reference until the update is confirmed.</p></section>`;
  const rows = items.map((i) => {
    const s = stepOf(data, wf.id, i.key, 'item');
    const st = { change: 'setStep', 'workflow-id': wf.id, 'hazard-id': i.key, check: 'item' };
    return html`<tr><td>${KIND_WORD[/** @type {keyof typeof KIND_WORD} */ (i.kind)] ?? i.kind}</td><td>${i.label}</td><td class="muted">${i.platforms.join(', ') || '—'}</td>
      <td><input name="note" value="${s?.note ?? ''}" placeholder="Note…" aria-label="Note on ${i.label}"${dis} ${dataAttrs(st)}></td>
      <td><label class="wf-tick"><input type="checkbox" name="checked"${s?.checked ? raw(' checked') : ''}${dis} ${dataAttrs(st)}> Checked</label></td>
      <td><button type="button" class="small" ${dataAttrs({ action: 'go', view: i.open.view, id: i.open.id, ...(i.open.tab ? { tab: i.open.tab } : {}), via: wf.id })}>Open →</button></td></tr>`;
  });
  const drafted = Boolean(String(wf.revision ?? '').trim() && wf.revision !== String(r?.revision ?? '').trim() && (wf.file || wf.url || wf.path));
  const left = Number(!drafted) + items.filter((i) => !stepOf(data, wf.id, i.key, 'item')?.checked).length;
  return html`<div class="wf-single">${draft}
    <section class="wf-check" aria-label="Affected items"><h3 class="wf-check-h">Affected items <span class="count">${items.length}</span></h3>
      ${items.length ? html`<table class="wf-controls"><thead><tr><th>Kind</th><th>Item</th><th>Platforms</th><th>Note</th><th>Checked</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
        : html`<p class="muted">This reference informs nothing yet.</p>`}</section>
    <div class="actions"><button type="button" class="primary" ${dataAttrs({ action: 'completeWorkflow', 'workflow-id': wf.id })}${left || !mine ? raw(' disabled') : ''}>${left ? `Confirm update — ${left} still needed` : 'Confirm update'}</button></div></div>`;
}

/** A completed or cancelled update: the revision it gave, and each item as it was ticked. @param {any} state @param {Data} data @param {any} wf */
export function updateEnded(state, data, wf) {
  const r = get(data, 'reference', wf.referenceId);
  const keys = Array.isArray(wf.covered) ? wf.covered : [];
  const status = wf.state === 'completed'
    ? html`<p class="doc-meta"><span class="tag wf-completed">Completed</span> Revision ${wf.before ?? '?'} → ${wf.revision}, by ${profileName(state, wf.endedBy)}, ${when(wf.endedAt)}.</p>`
    : html`<p class="doc-meta"><span class="tag wf-cancelled">Cancelled</span> by ${profileName(state, wf.endedBy)}, ${when(wf.endedAt)}. The reference was left as it was.</p>`;
  return html`${status}<article class="doc"><table class="wf-grid"><thead><tr><th>Item</th><th>Checked</th><th>Note</th></tr></thead>
    <tbody>${keys.map((k, n) => { const s = stepOf(data, wf.id, k, 'item'); return html`<tr><th scope="row">${wf.coveredLabels?.[n] ?? k}</th><td class="${s?.checked ? 'yes' : 'no'}">${s?.checked ? '✓' : ''}</td><td>${s?.note ?? ''}</td></tr>`; })}</tbody></table></article>`;
}
