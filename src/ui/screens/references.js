import { html } from '../html.js';
import { dataAttrs, go, idTag, statusTag, pageTabs, historyTable, historyCount, plus, removeColumn, removeButton, recordMenu, menuItem, optionsMenu } from './common.js';
import { dataTable } from './table.js';
import { statusColumn, idColumn, notFound } from './hazards.js';
import { all, get } from '../../core/data.js';
import { referenceLabel, hazardLabel, controlLabel, platformLabel } from '../../core/ids.js';
import { referenceTargets, referencesFor, hazardReferences, hazardReferenceRows } from '../../core/queries.js';
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

/**
 * What a reference points at, each a small box that opens it: the file (in a new tab where the
 * browser can show it), the web link in a new tab, and the network path copied, as a browser
 * cannot open one.
 * @param {any} r
 */
const pointsAt = (r) => {
  const href = safeHref(r.url);
  return html`${r.file ? html`<button type="button" class="chip chip-open" title="Open ${r.file.name}" ${dataAttrs({ action: 'openReferenceFile', stored: r.file.stored })}>File</button>` : ''}${r.url
    ? (href ? html`<a class="chip chip-open" href="${href}" target="_blank" rel="noopener" title="Open ${href} in a new tab">Link</a>` : html`<span class="chip" title="Not a web link that can be opened">Link</span>`)
    : ''}${r.path ? html`<button type="button" class="chip chip-open" title="Copy ${r.path}" ${dataAttrs({ action: 'copyPath', path: r.path })}>Path</button>` : ''}`;
};

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

/** The References page's sub-tabs: those in use, then the archive. */
const REFERENCE_TABS = /** @type {const} */ ([['active', 'Active'], ['archived', 'Archived']]);

/**
 * References, as two sub-tabs: Active, and Archived (out of use, kept apart and not offered for
 * linking). Each row's Options moves it from one to the other.
 * @param {any} state @param {Data} data
 */
export function referencesView(state, data) {
  const missing = new Set(state.missingFiles ?? []);
  const archived = state.view?.tab === 'archived';
  const rows = all(data, 'reference').filter((r) => Boolean(r.archived) === archived);
  const count = (/** @type {boolean} */ a) => all(data, 'reference').filter((r) => r.status !== 'deleted' && Boolean(r.archived) === a).length;
  return html`<div class="head"><h1>References</h1>${archived ? '' : newReference(state)}</div>
    <nav class="tabs">${REFERENCE_TABS.map(([t, label]) => html`<button type="button" class="tab${(t === 'archived') === archived ? ' on' : ''}" ${dataAttrs({ action: 'go', view: 'references', tab: t })}>${label} <span class="count">${count(t === 'archived')}</span></button>`)}</nav>
    ${dataTable(state, {
      id: archived ? 'referencesArchived' : 'references',
      rowKey: (r) => r.id,
      rows,
      empty: archived ? 'Nothing is archived.' : 'No references yet.',
      rowAttrs: (r) => ({ dblclick: 'go', view: 'reference', id: r.id }),
      rowEnd: (r) => (r.status === 'deleted' ? '' : optionsMenu(`Options for ${r.title}`, [
        html`<button type="button" ${dataAttrs({ action: 'go', view: 'reference', id: r.id })}>Open</button>`,
        html`<button type="button" ${dataAttrs({ action: 'setReferenceArchived', id: r.id, archived: archived ? 'false' : 'true' })}>${archived ? 'Move to Active' : 'Move to Archived'}</button>`,
      ])),
      columns: [
        idColumn((r) => r, referenceLabel, (r) => go(idTag(referenceLabel(r)), 'reference', { id: r.id })),
        { key: 'title', label: 'Reference', width: 560, minWidth: 200, value: (r) => r.title, filter: 'text',
          render: (r) => html`${go(r.title, 'reference', { id: r.id })}${missingTag(r, missing)}` },
        { key: 'docNumber', label: 'Doc number', width: 260, minWidth: 120, value: (r) => r.docNumber, filter: 'text' },
        { key: 'revision', label: 'Revision', width: 180, minWidth: 100, value: (r) => r.revision },
        { key: 'points', label: 'Points at', width: 240, minWidth: 180, sortable: false, render: (r) => pointsAt(r) },
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
    case 'hazardPhase': return html`<span class="id">${idTag(hazardLabel(hazard))}</span> ${go(hazard.title, 'hazard', { id: hazard.id })}: ${get(data, 'phase', target.phaseId)?.name ?? ''}`;
    case 'failureMode':
    case 'systemElement':
    case 'affectedGroup': return html`<span class="id">${idTag(hazardLabel(hazard))}</span> ${go(hazard.title, 'hazard', { id: hazard.id, tab: `p:${target.platformId}` })} on ${get(data, 'platform', target.platformId)?.name ?? ''}: ${target.text}`;
    case 'control': return html`<span class="id">${idTag(controlLabel(target))}</span> ${go(target.title, 'control', { id: target.id })}`;
    default: return html`<span class="id">${idTag(platformLabel(target))}</span> ${go(target.name, 'platform', { id: target.id })}`;
  }
}

const KIND_WORD = { hazard: 'Hazard', causalFactor: 'Causal factor', consequence: 'Consequence', hazardPhase: 'Lifecycle phase', failureMode: 'Element failure mode', systemElement: 'System/Element', affectedGroup: 'Affected group', control: 'Control', platform: 'Platform' };

/** @param {any} state @param {Data} data @param {string} id */
export function referenceView(state, data, id) {
  const r = get(data, 'reference', id);
  if (!r) return notFound();
  const tab = state.view?.tab;
  const page = tab === 'history' ? 'History' : 'Details';
  const targets = referenceTargets(data, id);
  const menu = recordMenu('Reference options', r.status === 'live'
    ? [menuItem(r.archived ? 'Move to Active' : 'Move to Archived', { action: 'setReferenceArchived', id, archived: r.archived ? 'false' : 'true' }),
      menuItem('Retire', { action: 'retireReference', id }),
      targets.length ? '' : menuItem('Delete…', { action: 'askConfirm', run: 'deleteReference', id, title: `Delete ${r.title}?`, text: 'It supports nothing. It will be deleted; its stored files stay in the folder.' }, true)]
    : r.status === 'retired' ? [menuItem('Restore', { action: 'restoreRecord', kind: 'reference', id })] : []);
  const head = html`<div class="doc-head"><h1 class="doc-page"><span class="doc-id">${idTag(referenceLabel(r))}</span> <span class="doc-page-sep" aria-hidden="true">—</span> ${page}</h1>${statusTag(r.status)}${r.archived ? html`<span class="tag">Archived</span>` : ''}${menu}</div>
    <label class="doc-subtitle"><span class="field-label">Reference</span>
      <input class="doc-title small" name="title" value="${r.title}" required aria-label="Reference title" ${dataAttrs({ change: 'updateReference', id })}></label>
    ${pageTabs('reference', { id }, tab, historyCount(state, data, 'reference', id))}`;
  if (tab === 'history') return html`${head}${historyTable(state, data, 'reference', id)}`;
  const missing = new Set(state.missingFiles ?? []);
  const edit = { change: 'updateReference', id };
  const href = safeHref(r.url);
  const pathHref = fileUrl(r.path);
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
          removeColumn((x) => removeButton(`Unlink ${KIND_WORD[/** @type {keyof typeof KIND_WORD} */ (x.link.targetKind)].toLowerCase()}`, 'Unlink this record?', `${referenceLabel(r)} will no longer support it.`,
            { run: 'unlinkReference', 'reference-id': id, 'target-kind': x.link.targetKind, 'target-id': x.link.targetId })),
        ],
      })}</section>
    </article>`;
}

/**
 * A record page's References card: the references linked to it (for a hazard, also to the parts of
 * it the page shows, each saying what it is for), a + to link more, and ✕ to unlink.
 * @param {any} state @param {Data} data
 * @param {{ kind: string, id: string, platformId?: string | null }} target platformId: the hazard's platform tab it is on
 */
export function referencesCard(state, data, { kind, id, platformId = null }) {
  // A hazard's references once each, with all the page has them for in one cell: General for the
  // hazard itself, then its parts. Any other record's, a row a link.
  const rows = kind === 'hazard'
    ? hazardReferenceRows(data, id, platformId)
    : referencesFor(data, kind, id).map((x) => ({ reference: x.reference, fors: [{ link: x.link, forText: '' }] }));
  const forWord = (/** @type {string} */ t) => t || 'General';
  /** @param {any} x */
  const forCell = (x) => html`<div class="for-cell"><ul class="plain for-list">${x.fors.map((/** @type {any} */ f) => html`<li><span class="for-text">${f.forText ? f.forText : html`<span class="muted">General</span>`}</span>${x.fors.length > 1
    ? html`<button type="button" class="icon-x for-x" title="Unlink from ${forWord(f.forText)}" aria-label="Unlink ${x.reference.title} from ${forWord(f.forText)}" ${dataAttrs({ action: 'unlinkReference', 'reference-id': x.reference.id, 'target-kind': f.link.targetKind, 'target-id': f.link.targetId })}>✕</button>` : ''}</li>`)}</ul>
    ${plus({ action: 'openPicker', picker: 'linkReferenceFor', 'reference-id': x.reference.id, 'hazard-id': id, 'platform-id': platformId ?? '' }, `Link ${x.reference.title} to more of this hazard`)}</div>`;
  return dataTable(state, {
    id: `refs-${kind}`,
    rowKey: (x) => x.reference.id,
    rows,
    empty: 'No references yet.',
    tools: plus({ action: 'openPicker', picker: 'linkReferences', 'target-kind': kind, 'target-id': id }, 'Link references'),
    columns: [
      { key: 'reference', label: 'References', width: 440, minWidth: 220, value: (x) => `${referenceLabel(x.reference)} ${x.reference.title}`,
        render: (x) => html`<span class="id">${idTag(referenceLabel(x.reference))}</span> ${go(x.reference.title, 'reference', { id: x.reference.id })}${statusTag(x.reference.status)}` },
      ...(kind === 'hazard' ? [{ key: 'for', label: 'Informs', width: 360, minWidth: 160, value: (/** @type {any} */ x) => x.fors.map((/** @type {any} */ f) => forWord(f.forText)).join(', '), render: forCell }] : []),
      { key: 'points', label: 'Points at', width: 220, minWidth: 180, sortable: false, render: (x) => pointsAt(x.reference) },
      removeColumn((x) => (x.fors.length === 1
        ? removeButton(`Unlink ${x.reference.title}`, `Unlink ${x.reference.title}?`, 'The reference stays in the library; it just no longer supports this record.',
          { run: 'unlinkReference', 'reference-id': x.reference.id, 'target-kind': x.fors[0].link.targetKind, 'target-id': x.fors[0].link.targetId })
        : removeButton(`Unlink ${x.reference.title} from all of these`, `Unlink ${x.reference.title} from all ${x.fors.length}?`, `It no longer supports ${x.fors.map((/** @type {any} */ f) => forWord(f.forText)).join(', ')} here. The reference stays in the library.`,
          { run: 'unlinkReferenceFrom', 'reference-id': x.reference.id, targets: x.fors.map((/** @type {any} */ f) => `${f.link.targetKind}|${f.link.targetId}`).join(',') }))),
    ],
  });
}
