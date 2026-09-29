import { html } from '../html.js';
import { dataAttrs, go, idTag, statusTag, confirmButton, pageTabs, historyTable, historyCount, plus } from './common.js';
import { dataTable } from './table.js';
import { statusColumn, idColumn, notFound } from './hazards.js';
import { all, get } from '../../core/data.js';
import { referenceLabel, hazardLabel, controlLabel, platformLabel } from '../../core/ids.js';
import { referenceTargets, referencesFor, hazardReferences } from '../../core/queries.js';
import { profileName, when } from '../names.js';

/** @typedef {import('../../core/data.js').Data} Data */

/** A web link only when it is http, https or mailto; anything else (javascript: above all) is never clickable. @param {string} url */
export function safeHref(url) {
  const u = String(url ?? '').trim();
  return /^(https?:|mailto:)/i.test(u) ? u : '';
}

/** A network path as a file URL: \\server\share\… or X:\…; anything else, none. @param {string} path */
export function fileUrl(path) {
  const s = String(path ?? '').trim().replace(/\\/g, '/');
  if (s.startsWith('//')) return encodeURI(`file:${s}`);
  if (/^[A-Za-z]:\//.test(s)) return encodeURI(`file:///${s}`);
  return '';
}

/** @param {number} n bytes */
const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} bytes`);

/** @param {any} r @param {Set<string>} missing */
const missingTag = (r, missing) => ([r.file, ...(r.pastFiles ?? [])].some((f) => f && missing.has(f.stored)) ? html` <span class="tag tag-missing">File missing</span>` : '');

/** @param {any} r */
const pointsAt = (r) => html`${r.file ? html`<span class="chip">File</span>` : ''}${r.url ? html`<span class="chip">Link</span>` : ''}${r.path ? html`<span class="chip">Path</span>` : ''}`;

/** @param {any} state */
function newReference(state) {
  if (state.editing?.kind !== 'newReference') return plus({ action: 'startEdit', kind: 'newReference', id: 'new' }, 'New reference');
  return html`<form data-action="addReference" class="new-reference">
    <input name="title" required placeholder="Reference title" aria-label="Reference title" autofocus>
    <label class="ref-file">File <input type="file" name="file"></label>
    <input name="url" placeholder="Web link (https://…)" aria-label="Web link">
    <input name="path" placeholder="Network path" aria-label="Network path">
    <p class="muted">Give a file, a web link or a network path (at least one).</p>
    <div class="actions"><button type="submit" class="primary">Add</button><button type="button" ${dataAttrs({ action: 'cancelEdit' })}>Cancel</button></div></form>`;
}

/** @param {any} state @param {Data} data */
export function referencesView(state, data) {
  const missing = new Set(state.missingFiles ?? []);
  return html`<div class="head"><h1>References</h1>${newReference(state)}</div>
    ${dataTable(state, {
      id: 'references',
      rowKey: (r) => r.id,
      rows: all(data, 'reference'),
      empty: 'No references yet.',
      columns: [
        idColumn((r) => r, referenceLabel, (r) => go(idTag(referenceLabel(r)), 'reference', { id: r.id })),
        { key: 'title', label: 'Reference', width: 560, minWidth: 200, value: (r) => r.title, filter: 'text',
          render: (r) => html`${go(r.title, 'reference', { id: r.id })}${missingTag(r, missing)}` },
        { key: 'docNumber', label: 'Doc number', width: 260, minWidth: 120, value: (r) => r.docNumber, filter: 'text' },
        { key: 'revision', label: 'Revision', width: 180, minWidth: 100, value: (r) => r.revision },
        { key: 'points', label: 'Points at', width: 240, minWidth: 140, sortable: false, render: (r) => pointsAt(r) },
        { key: 'supports', label: 'Supports', width: 180, minWidth: 110, value: (r) => referenceTargets(data, r.id).length },
        statusColumn((r) => r.status),
      ],
    })}`;
}

/** @param {any} state @param {any} f a stored file @param {Set<string>} missing */
function fileLine(state, f, missing) {
  return html`<button type="button" class="link" ${dataAttrs({ action: 'openReferenceFile', stored: f.stored })}>${f.name}</button>
    <span class="muted">${size(f.size)} · added by ${profileName(state, f.addedBy)}, ${when(f.addedAt)}</span>${missing.has(f.stored) ? html` <span class="tag tag-missing">File missing</span>` : ''}`;
}

/** A linked record, named and linked for a person. @param {Data} data @param {any} x from referenceTargets */
function targetCell(data, x) {
  const { link, target, hazard } = x;
  switch (link.targetKind) {
    case 'hazard': return html`<span class="id">${idTag(hazardLabel(target))}</span> ${go(target.title, 'hazard', { id: target.id })}`;
    case 'causalFactor':
    case 'consequence': return html`<span class="id">${idTag(hazardLabel(hazard))}</span> ${go(hazard.title, 'hazard', { id: hazard.id })}: ${target.text}`;
    case 'control': return html`<span class="id">${idTag(controlLabel(target))}</span> ${go(target.title, 'control', { id: target.id })}`;
    default: return html`<span class="id">${idTag(platformLabel(target))}</span> ${go(target.name, 'platform', { id: target.id })}`;
  }
}

const KIND_WORD = { hazard: 'Hazard', causalFactor: 'Causal factor', consequence: 'Consequence', control: 'Control', platform: 'Platform' };

/** @param {any} state @param {Data} data @param {string} id */
export function referenceView(state, data, id) {
  const r = get(data, 'reference', id);
  if (!r) return notFound();
  const tab = state.view?.tab;
  const head = html`<p>${go('← References', 'references')}</p>
    <div class="doc-head"><span class="doc-id">${idTag(referenceLabel(r))}</span>${statusTag(r.status)}</div>
    <input class="doc-title" name="title" value="${r.title}" required aria-label="Reference title" ${dataAttrs({ change: 'updateReference', id })}>
    ${pageTabs('reference', { id }, tab, historyCount(state, data, 'reference', id))}`;
  if (tab === 'history') return html`${head}${historyTable(state, data, 'reference', id)}`;
  const missing = new Set(state.missingFiles ?? []);
  const edit = { change: 'updateReference', id };
  const targets = referenceTargets(data, id);
  const href = safeHref(r.url);
  const pathHref = fileUrl(r.path);
  const actions = r.status === 'live'
    ? html`<button type="button" ${dataAttrs({ action: 'retireReference', id })}>Retire</button>
       ${targets.length ? '' : confirmButton('Delete…', 'Delete this reference', dataAttrs({ action: 'deleteReference', id }))}`
    : r.status === 'retired' ? html`<button type="button" ${dataAttrs({ action: 'restoreRecord', kind: 'reference', id })}>Restore</button>` : '';
  return html`${head}
    <article class="doc">
      <div class="ref-fields">
        <label class="ref-field">Doc number <input class="quiet" name="docNumber" value="${r.docNumber}" placeholder="—" aria-label="Doc number" ${dataAttrs(edit)}></label>
        <label class="ref-field">Revision <input class="quiet" name="revision" value="${r.revision}" placeholder="—" aria-label="Revision" ${dataAttrs(edit)}></label>
      </div>
      <textarea class="doc-text" name="note" rows="2" placeholder="Add a note…" aria-label="Note" ${dataAttrs(edit)}>${r.note}</textarea>
      <section class="block ref-where">
        <div class="ref-row"><strong>File</strong>${r.file ? fileLine(state, r.file, missing) : html`<span class="muted">No file stored.</span>`}</div>
        <form data-action="uploadReferenceFile" ${dataAttrs({ id })} class="ref-row"><strong></strong><input type="file" name="file" required aria-label="${r.file ? 'New revision' : 'File to store'}"><button type="submit">${r.file ? 'Replace with new revision' : 'Upload file'}</button></form>
        ${r.pastFiles.length ? html`<div class="ref-row"><strong>Past files</strong><ul class="plain">${r.pastFiles.map((pf) => html`<li>${fileLine(state, pf, missing)}</li>`)}</ul></div>` : ''}
        <div class="ref-row"><strong>Web link</strong><input class="quiet grow" name="url" value="${r.url}" placeholder="https://…" aria-label="Web link" ${dataAttrs(edit)}>${href ? html`<a href="${href}" target="_blank" rel="noopener">Open</a>` : ''}</div>
        <div class="ref-row"><strong>Network path</strong><input class="quiet grow" name="path" value="${r.path}" placeholder="\\\\server\\share\\…" aria-label="Network path" ${dataAttrs(edit)}>${r.path ? html`<button type="button" ${dataAttrs({ action: 'copyPath', path: r.path })}>Copy path</button>` : ''}${pathHref ? html`<a href="${pathHref}" target="_blank" rel="noopener">Open</a>` : ''}</div>
      </section>
      <section class="block">${dataTable(state, {
        id: 'referenceTargets',
        rowKey: (x) => x.link.id,
        rows: targets,
        empty: 'Supports nothing yet. Link it with the +.',
        tools: r.status !== 'deleted' ? plus({ action: 'openPicker', picker: 'linkTargets', 'reference-id': id }, 'Link records') : '',
        columns: [
          { key: 'kind', label: 'Supports', width: 240, minWidth: 140, value: (x) => KIND_WORD[/** @type {keyof typeof KIND_WORD} */ (x.link.targetKind)] },
          { key: 'record', label: 'Record', width: 900, minWidth: 260, sortable: false, render: (x) => targetCell(data, x) },
          { key: 'actions', label: '', width: 120, minWidth: 80, sortable: false,
            render: (x) => html`<div class="row-actions">${confirmButton('✕', 'Unlink', dataAttrs({ action: 'unlinkReference', 'reference-id': id, 'target-kind': x.link.targetKind, 'target-id': x.link.targetId }))}</div>` },
        ],
      })}</section>
    </article>
    <div class="actions page-actions">${actions}</div>`;
}

/**
 * A record page's References card: the references linked to it (for a hazard, also to its causal
 * factors and consequences), a + to link more, and ✕ to unlink.
 * @param {any} state @param {Data} data @param {{ kind: string, id: string }} target
 */
export function referencesCard(state, data, { kind, id }) {
  const rows = kind === 'hazard' ? hazardReferences(data, id) : referencesFor(data, kind, id).map((x) => ({ ...x, forText: '' }));
  return dataTable(state, {
    id: `refs-${kind}`,
    rowKey: (x) => x.link.id,
    rows,
    empty: 'No references yet.',
    tools: plus({ action: 'openPicker', picker: 'linkReferences', 'target-kind': kind, 'target-id': id }, 'Link references'),
    columns: [
      { key: 'reference', label: 'References', width: 640, minWidth: 220, value: (x) => `${referenceLabel(x.reference)} ${x.reference.title}`,
        render: (x) => html`<span class="id">${idTag(referenceLabel(x.reference))}</span> ${go(x.reference.title, 'reference', { id: x.reference.id })}${statusTag(x.reference.status)}` },
      ...(kind === 'hazard' ? [{ key: 'for', label: 'For', width: 420, minWidth: 160, value: (/** @type {any} */ x) => x.forText }] : []),
      { key: 'points', label: 'Points at', width: 220, minWidth: 130, sortable: false, render: (x) => pointsAt(x.reference) },
      { key: 'actions', label: '', width: 120, minWidth: 80, sortable: false,
        render: (x) => html`<div class="row-actions">${confirmButton('✕', 'Unlink', dataAttrs({ action: 'unlinkReference', 'reference-id': x.reference.id, 'target-kind': x.link.targetKind, 'target-id': x.link.targetId }))}</div>` },
    ],
  });
}
