import { html, raw, esc } from '../html.js';
import { dataTable } from './table.js';
import { historyOf, commentsOn, hazardOfItem, bundlesOf } from '../../core/history.js';
import { hasUnsaved } from '../../storage/mirror.js';
import { profileName, when } from '../names.js';
import { themeOf, isFavourite } from '../prefs.js';
import { ratingFor, LIKELIHOODS, CONSEQUENCES } from '../../core/matrix.js';
import { openItems, attentionItems } from '../../core/queries.js';
import { UNNUMBERED, hazardLabel, controlLabel, referenceLabel, platformLabel } from '../../core/ids.js';
import { FULCRUM_SVG } from '../logo.js';
import { safetyReportId } from '../../core/ops/report-ids.js';
import { wordDiff } from '../text-diff.js';

/** @param {Record<string, unknown>} obj kebab-case keys @returns {import('../html.js').Raw} */
export function dataAttrs(obj) {
  return raw(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' '));
}

/** @param {string} value @param {unknown} label @param {string} [current] */
export function option(value, label, current) {
  return html`<option value="${value}"${value === current ? raw(' selected') : ''}>${label}</option>`;
}

/** @param {string} status */
export function statusTag(status) {
  return status === 'live' ? '' : html` <span class="tag tag-${status}">${status}</span>`;
}

/** A calculated level as a band tag, e.g. "2C Serious"; half an assessment says so. @param {any} pair */
export function levelTag(pair) {
  const r = ratingFor(pair?.consequence ?? null, pair?.likelihood ?? null);
  return r.cell ? html`<span class="band band-${r.band.toLowerCase().replace(/\s+/g, '-')}">${r.cell} ${r.band}</span>` : html`<span class="band band-uncategorised">Not yet assessed</span>`;
}

/** @param {string} band */
export function bandTag(band) {
  return html`<span class="band band-${band.toLowerCase().replace(/\s+/g, '-')}">${band}</span>`;
}

/** @param {string} state recommended | planned | implemented | rejected */
export function stateTag(state) {
  return html`<span class="tag state-${state}">${stateWord(state)}</span>`;
}

/** A control's status as a person reads it: Recommended, Planned, Implemented, Rejected. @param {string} state */
export const stateWord = (state) => (state ? state[0].toUpperCase() + state.slice(1) : '');

/** A link-styled button that navigates. @param {unknown} label @param {string} view @param {Record<string, unknown>} [extra] */
export function go(label, view, extra = {}) {
  return html`<button type="button" class="link" ${dataAttrs({ action: 'go', view, ...extra })}>${label}</button>`;
}

/**
 * A ✕ that removes something (deletes it, or unlinks it), asking first in a pop-up with the
 * consequence and Continue or Cancel.
 * @param {string} label what the button does, e.g. "Unlink Sprinklers"
 * @param {string} title the pop-up's question @param {string} text what happens
 * @param {Record<string, unknown>} act the action, as `run` and its fields
 */
export function removeButton(label, title, text, act) {
  return html`<button type="button" class="icon-x" title="${label}" aria-label="${label}" ${dataAttrs({ action: 'askConfirm', ...act, title, text })}>✕</button>`;
}

/** A table's last column for a row's ✕: just wide enough, centred, shown when the row is hovered. @param {(row: any) => unknown} render */
export function removeColumn(render) {
  return { key: 'actions', label: '', width: 52, minWidth: 52, sortable: false, fixed: true, className: 'col-act',
    render: (/** @type {any} */ row) => html`<div class="row-actions">${render(row)}</div>` };
}

/**
 * A row's Options: a button that opens a short menu of what can be done to it.
 * @param {string} label whose options, e.g. "Options for Design" @param {unknown[]} items buttons
 */
export function optionsMenu(label, items) {
  const shown = items.filter(Boolean);
  if (!shown.length) return '';
  return html`<details class="row-menu"><summary aria-label="${label}" title="${label}">Options <span aria-hidden="true">▾</span></summary><div class="row-menu-body">${shown}</div></details>`;
}

/**
 * A row's ⋯ menu: like Options, a short list of what can be done to it, opening leftwards from a
 * small ⋯ at the row's end.
 * @param {string} label for a screen reader @param {unknown[]} items buttons; falsy ones left out
 */
export function rowDotsMenu(label, items) {
  const shown = items.filter(Boolean);
  if (!shown.length) return '';
  return html`<details class="row-menu dots"><summary aria-label="${label}" title="More">${raw(DOTS)}</summary><div class="row-menu-body">${shown}</div></details>`;
}

/**
 * A destructive action behind one extra click, with its consequence spelled out.
 * @param {string} summary @param {string} text @param {import('../html.js').Raw} attrs
 */
export function confirmButton(summary, text, attrs) {
  return html`<details class="confirm"><summary>${summary}</summary><button type="button" class="danger" ${attrs}>${text}</button></details>`;
}

const DOTS = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="13" cy="8" r="1.5"/></svg>';

/**
 * A page's ⋯ menu, at the right of its heading: what can be done to its record (Retire, Restore,
 * Delete…, and on a platform its image). Nothing to offer, no menu.
 * @param {string} label e.g. "Hazard options" @param {unknown[]} items from menuItem, falsy ones left out
 */
export function recordMenu(label, items) {
  const shown = items.filter(Boolean);
  if (!shown.length) return '';
  return html`<details class="dots-menu doc-menu"><summary aria-label="${label}" title="Options">${raw(DOTS)}</summary><div class="dots-body" role="menu">${shown}</div></details>`;
}

/** One choice in a ⋯ menu; a dangerous one (Delete…) is red. @param {string} text @param {Record<string, unknown>} attrs @param {boolean} [danger] */
export function menuItem(text, attrs, danger = false) {
  return html`<button type="button" role="menuitem"${danger ? raw(' class="danger-item"') : ''} ${dataAttrs(attrs)}><span class="dots-check" aria-hidden="true"></span>${text}</button>`;
}

/** How a hazard or platform is named when deleting it. @param {'hazard' | 'platform'} kind @param {any} rec */
export function deleteName(kind, rec) {
  if (kind === 'platform') return rec.name;
  const label = hazardLabel(rec);
  return label === UNNUMBERED ? rec.title : `${label} ${rec.title}`;
}

/**
 * The last step before deleting a hazard or platform: it replaces the page's actions, so the
 * delete takes three deliberate clicks.
 * @param {'hazard' | 'platform'} kind @param {string} id @param {string} what e.g. "HAZ-001 Fire"
 * @param {string} [note] what else goes with it
 */
export function deletePanel(kind, id, what, note = '') {
  return html`<div class="delete-panel" role="alertdialog" aria-label="Confirm delete">
    <p><strong>Delete ${what}?</strong>${note ? ` ${note}` : ''} You can undo it straight after, until you make another change or save.</p>
    <div class="actions"><button type="button" class="danger" ${dataAttrs({ action: 'confirmDelete', kind, id })}>Yes, delete ${what}</button>
      <button type="button" ${dataAttrs({ action: 'cancelDelete' })}>Keep it</button></div></div>`;
}

/** @param {any} state */
export function messages(state) {
  const m = state.message;
  const warnings = state.warnings ?? [];
  const u = state.undo && !state.saving && state.session?.working === state.undo.after && state.session?.base === state.undo.base ? state.undo : null;
  // Every message closes the same way: a small ✕ at its top right.
  const close = (/** @type {string} */ label, /** @type {Record<string, unknown>} */ act) => html`<button type="button" class="icon-x msg-x" title="${label}" aria-label="${label}" ${dataAttrs(act)}>✕</button>`;
  return html`${m ? html`<div class="msg msg-${m.kind}" role="${m.kind === 'error' ? 'alert' : 'status'}">
      <div class="msg-body"><strong>${m.text}</strong>${m.items?.length ? html`<ul>${m.items.map((/** @type {string} */ i) => html`<li>${i}</li>`)}</ul>` : ''}</div>
      ${close('Dismiss', { action: 'dismissMessage' })}</div>` : ''}${u ? html`<div class="msg msg-info" role="status"><div class="msg-body"><strong>${u.text}</strong> <button type="button" ${dataAttrs({ action: 'undoDelete' })}>Undo</button></div>${close('Dismiss', { action: 'dismissUndo' })}</div>` : ''}${warnings.map((/** @type {string} */ w, /** @type {number} */ i) => html`<div class="msg msg-warning" role="status"><div class="msg-body">${w}</div>${close('Dismiss', { action: 'dismissWarning', index: i })}</div>`)}`;
}

/**
 * A platform's groups as small plain tags, all one colour: on its Home card, its page, and the lists.
 * @param {any[]} groups platform group records
 */
export function groupTags(groups) {
  return groups.length ? html`<span class="group-tags">${groups.map((g) => html`<span class="tag group-tag">${g.name}</span>`)}</span>` : '';
}

const NAV = [['home', 'Home'], ['hazards', 'Hazards'], ['controls', 'Controls'], ['platforms', 'Platforms'], ['reviews', 'Reviews'], ['bowties', 'Bow-ties'], ['info', 'Info'], ['reports', 'Reports'], ['references', 'References']];

/** The settings menu, opened from the three lines at the end of the top bar. */
const SETTINGS = [['backups', 'Backups'], ['historyDeletions', 'Deletion history']];

/** The top-bar section each view belongs to. */
const SECTION = { home: 'home', openItems: 'home', hazards: 'hazards', hazard: 'hazards', controls: 'controls', control: 'controls', newControl: 'controls', platforms: 'platforms', platform: 'platforms', reviews: 'reviews', platformReview: 'reviews', bowties: 'bowties', references: 'references', reference: 'references', info: 'info', reports: 'reports', backups: 'backups', historyDeletions: 'historyDeletions' };

/** The three lines that open the settings menu. */
const MENU_SVG = '<svg viewBox="0 0 20 20" width="20" height="20" focusable="false" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="2" stroke-linecap="square"/></svg>';

/** The moon on the theme switch: a solid crescent (the text moon draws only an outline in some fonts). */
const MOON_SVG = '<svg class="moon" viewBox="0 0 16 16" focusable="false"><path d="M10.6 1.2A7 7 0 1 0 14.8 10.4 5.6 5.6 0 0 1 10.6 1.2Z" fill="currentColor"/></svg>';

/** @param {any} state @param {import('../html.js').Raw} body */
export function shell(state, body) {
  const unsaved = state.session ? hasUnsaved(state.session) : false;
  const current = SECTION[/** @type {keyof typeof SECTION} */ (state.view?.name)] ?? '';
  const theme = themeOf(state);
  const other = theme === 'dark' ? 'light' : 'dark';
  // One button says where things stand: Unsaved (click to save), Saving… with a bar, or Saved.
  const save = state.saving
    ? html`<button type="button" class="save saving" ${dataAttrs({ action: 'save' })} disabled>Saving…</button>`
    : unsaved
      ? html`<button type="button" class="save unsaved" ${dataAttrs({ action: 'save' })} title="You have unsaved changes: click to save">Unsaved</button>`
      : html`<button type="button" class="save saved" ${dataAttrs({ action: 'save' })} title="Everything is saved">Saved</button>`;
  // Home carries a dot while the active profile's platforms need attention: changes to
  // acknowledge, overdue reviews, controls awaiting a status decision, unrated hazards (Home's own list).
  const data = state.session?.working;
  const attention = Boolean(data && state.profileId && attentionItems(openItems(data, state.today, state.profileId)).length);
  const dot = html`<span class="nav-dot" role="img" aria-label="Things need your attention" title="Things need your attention"></span>`;
  return html`<header class="topbar">
    <span class="brand">${raw(FULCRUM_SVG)}PIVOT</span>
    <nav>${NAV.map(([view, label]) => html`<button type="button" class="nav${current === view ? ' on' : ''}" ${dataAttrs({ action: 'go', view })}>${label}${view === 'home' && attention ? dot : ''}</button>`)}</nav>
    <span class="spacer"></span>
    <span class="topbar-end">
      <button type="button" class="folder" ${dataAttrs({ action: 'changeFolder' })} title="Choose a different data folder">Folder: ${state.folderName}</button>
      ${save}
      <button type="button" class="theme" role="switch" aria-checked="${theme === 'dark' ? 'true' : 'false'}" aria-label="Dark mode" ${dataAttrs({ action: 'setTheme', theme: other })} title="Switch to ${other} mode"><span class="theme-track"><span class="theme-knob" aria-hidden="true">${theme === 'dark' ? raw(MOON_SVG) : '☀'}</span></span></button>
      <span class="profile" title="Active profile">${profileName(state, state.profileId)}</span>
      <details class="settings-menu${SETTINGS.some(([v]) => v === current) ? ' on' : ''}">
        <summary aria-label="Settings" title="Settings">${raw(MENU_SVG)}</summary>
        <div class="settings-body" role="menu">${SETTINGS.map(([view, label]) => html`<button type="button" role="menuitem" class="${current === view ? 'on' : ''}" ${dataAttrs({ action: 'go', view })}>${label}</button>`)}</div>
      </details>
    </span>
    ${state.saving ? html`<div class="save-progress" role="progressbar" aria-label="Saving"><span></span></div>` : ''}
  </header>
  <div class="messages">${messages(state)}</div>
  <main class="view">${state.view?.name === 'bowties' ? '' : backButton(state)}${body}</main>
  ${confirmDialog(state)}`;
}

/** Back to the page open before this one, whichever it was, and the page's star. @param {any} state */
export function backButton(state) {
  const prev = (state.viewHistory ?? []).at(-1);
  const where = prev ? pageName(state, prev) : '';
  return html`<p class="back-row"><button type="button" class="back" ${dataAttrs({ action: 'goBack' })}${prev ? html` title="Back to ${where}"` : raw(' disabled title="Nothing to go back to"')}><span aria-hidden="true">←</span> Back${where ? html`<span class="back-to"> to ${where}</span>` : ''}</button>${favouriteStar(state)}</p>`;
}

const STAR = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.6l1.9 4.1 4.5.5-3.4 3 1 4.4L8 11.3l-4 2.3 1-4.4-3.4-3 4.5-.5z"/></svg>';

/**
 * A quiet star beside Back: click to add this page to your Favourite pages on Home, again to take
 * it off. Home itself has none; it is where the favourites are.
 * @param {any} state
 */
function favouriteStar(state) {
  const v = state.view;
  if (!v?.name || v.name === 'home' || v.name === 'newControl') return '';
  const on = isFavourite(state, v);
  const label = on ? 'Remove from favourite pages' : 'Add to favourite pages';
  return html`<button type="button" class="fav-star${on ? ' on' : ''}" aria-pressed="${on ? 'true' : 'false'}" aria-label="${label}" title="${label}" ${dataAttrs({ action: 'toggleFavourite', page: v.name, id: v.id ?? '', tab: v.tab ?? '' })}>${raw(STAR)}</button>`;
}

/** The star on a favourite in the Favourite pages list, which takes it off. @param {{ name: string, id: string | null, tab: string | null }} f @param {string} label */
export function unfavouriteStar(f, label) {
  return html`<button type="button" class="fav-star on" aria-label="Remove ${label} from favourite pages" title="Remove from favourite pages" ${dataAttrs({ action: 'toggleFavourite', page: f.name, id: f.id ?? '', tab: f.tab ?? '' })}>${raw(STAR)}</button>`;
}

/** What a record's page is called in Favourite pages. */
const FAVOURITE_KIND = { hazard: 'Hazard', control: 'Control', platform: 'Platform', reference: 'Reference' };

/** What a tab that is a page of its own is called, after its page's name. */
const TAB_WORD = { history: 'History', reviews: 'Reviews', phases: 'Lifecycle phases', archived: 'Archived', active: 'Active' };

/**
 * A favourite as Favourite pages lists it: its name (with the tab's, for a page within a page,
 * e.g. "HAZ-005 Fire · Alpha"), what kind of page it is, and whether its record is gone.
 * @param {any} state @param {{ name: string, id: string | null, tab: string | null }} f
 * Also the large heading the page itself shows (e.g. "HAZ-005 — Alpha", "Controls"), for a block's
 * title, and the record's own name beneath it.
 * @returns {{ label: string, kind: string, gone: boolean, heading: string, detail: string }}
 */
export function favouriteLabel(state, f) {
  const data = state.session?.working;
  const kind = FAVOURITE_KIND[/** @type {keyof typeof FAVOURITE_KIND} */ (f.name)];
  const tabWord = !f.tab ? '' : f.tab.startsWith('p:') ? String(data?.records?.platform?.[f.tab.slice(2)]?.name ?? 'a platform') : TAB_WORD[/** @type {keyof typeof TAB_WORD} */ (f.tab)] ?? f.tab;
  const withTab = (/** @type {string} */ label) => (tabWord ? `${label} · ${tabWord}` : label);
  if (!kind || !f.id) {
    const word = PAGE_WORD[/** @type {keyof typeof PAGE_WORD} */ (f.name)] ?? f.name;
    return { label: withTab(word), kind: 'Page', gone: false, heading: word, detail: tabWord };
  }
  const rec = data?.records?.[f.name]?.[f.id];
  if (!rec || rec.status === 'deleted') return { label: `A deleted ${kind.toLowerCase()}`, kind, gone: true, heading: 'Deleted', detail: `A deleted ${kind.toLowerCase()}` };
  // The page's own heading: its record's number, then which page of it (Overview, Details, a platform, History).
  const code = f.name === 'hazard' ? hazardLabel(rec) : f.name === 'control' ? controlLabel(rec) : f.name === 'reference' ? referenceLabel(rec) : platformLabel(rec);
  const heading = `${code} — ${tabWord || (f.name === 'hazard' || f.name === 'control' ? 'Overview' : 'Details')}`;
  const label = f.name === 'hazard' ? `${hazardLabel(rec)} ${rec.title}` : f.name === 'control' ? `${controlLabel(rec)} ${rec.title}`
    : f.name === 'reference' ? `${referenceLabel(rec)} ${rec.title}` : String(rec.name);
  const sub = f.tab?.startsWith('p:') ? `${kind} on a platform` : f.tab ? `${kind} ${TAB_WORD[/** @type {keyof typeof TAB_WORD} */ (f.tab)]?.toLowerCase() ?? 'page'}` : kind;
  return { label: withTab(label), kind: sub, gone: false, heading, detail: String(rec.title ?? rec.name ?? '') };
}

const PAGE_WORD = { home: 'Home', openItems: 'Open items', reviews: 'Reviews', platformReview: 'Review', hazards: 'Hazards', controls: 'Controls', platforms: 'Platforms', references: 'References', info: 'Info', reports: 'Reports', bowties: 'Bow-ties', backups: 'Backups', historyDeletions: 'Deletion history', newControl: 'New control' };

/**
 * A page as Back names it: a list by its name; a record's page by its own title, e.g.
 * "C-004 — Overview" (until it is numbered, by its name).
 * @param {any} state @param {any} v a view
 */
function pageName(state, v) {
  const data = state.session?.working;
  const rec = data && v.id ? data.records?.[v.name]?.[v.id] : null;
  if (rec && v.name in FAVOURITE_KIND && rec.number != null && rec.status !== 'deleted') return favouriteLabel(state, { name: v.name, id: v.id, tab: v.tab ?? null }).heading;
  if (rec) return rec.name ?? rec.title ?? PAGE_WORD[/** @type {keyof typeof PAGE_WORD} */ (`${v.name}s`)] ?? v.name;
  return PAGE_WORD[/** @type {keyof typeof PAGE_WORD} */ (v.name)] ?? v.name;
}

/** The question asked before a consequential action: Continue or Cancel. @param {any} state */
export function confirmDialog(state) {
  const c = state.confirm;
  if (!c) return '';
  return html`<div class="picker-overlay confirm-overlay"><div class="picker confirm-box" role="alertdialog" aria-modal="true" aria-label="${c.title}">
    <h2>${c.title}</h2><p>${c.text}</p>
    <div class="actions"><button type="button" class="danger" ${dataAttrs({ action: 'confirmContinue' })}>Continue</button>
      <button type="button" ${dataAttrs({ action: 'confirmCancel' })} autofocus>Cancel</button></div></div></div>`;
}

/**
 * A value as a person reads it: a rating as its matrix cell and band ("2C Serious"), a stored file
 * or image by its name, a list item by item, yes or no; never raw data.
 * @param {any} v @returns {string}
 */
function show(v) {
  if (v == null || v === '') return '(none)';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v !== 'object') return String(v);
  if (Array.isArray(v)) return v.length ? v.map(show).join(', ') : '(none)';
  if ('consequence' in v && 'likelihood' in v) {
    const r = ratingFor(v.consequence ?? null, v.likelihood ?? null);
    return r.cell ? `${r.cell} ${r.band}` : '(none)';
  }
  if (typeof v.stored === 'string') return String(v.name ?? v.stored.split('/').at(-1));
  return Object.entries(v).map(([k, x]) => `${fieldWord(k)} ${show(x)}`).join('; ');
}

/** What a record's field is called in its history, where its own name would not read well. */
const FIELD_WORD = {
  likelihoodWhy: 'likelihood justification', consequenceWhy: 'consequence justification',
  reportId: 'report ID', ownerId: 'owner', docNumber: 'document number',
  reviewRule: 'review rule', reviewStart: 'reviews counted from', reviewDueSeen: 'review date acknowledged', longest: 'longest period', dueAfter: 'due after', dueBefore: 'due before',
  completedAt: 'completed on', completedBy: 'completed by', pastFiles: 'earlier files', sharedWith: 'shared with',
  filters: 'diagram filters', url: 'web link', path: 'network path', considerations: 'SFARP considerations',
  implementedBy: 'implemented by', off: 'taken off the platform', category: 'type', state: 'status', hazardId: 'hazard', platformId: 'platform', controlId: 'control', phaseId: 'lifecycle phase',
  statuses: 'statuses', set: 'controls',
};

/** A field's name as words: from FIELD_WORD, or its own name split at its capitals. @param {string} field */
function fieldWord(field) {
  return FIELD_WORD[/** @type {keyof typeof FIELD_WORD} */ (field)] ?? field.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

/** A control's owner on a platform, as a person says it. */
/** Who implements a control on a platform, as a person says it. */
const IMPLEMENTED_VALUE = { oem: 'OEM', highcom: 'HighCom', customer: 'Customer' };

/** Nothing there: no value, an empty text or an empty list. @param {any} v */
const blank = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

/**
 * Details, any extra tabs, and History, as tabs of a record's page.
 * @param {string} view @param {Record<string, string>} where e.g. { id } or { 'hazard-id', 'platform-id' }
 * @param {string | undefined} tab @param {number} changes
 * @param {[string, unknown][]} [extra] [tab, label] pairs shown between the first tab and History
 * @param {string} [first] the first tab's label
 */
export function pageTabs(view, where, tab, changes, extra = [], first = 'Details') {
  const current = tab || 'details';
  const on = (/** @type {string} */ t) => (current === t ? ' on' : '');
  return html`<nav class="tabs">
    <button type="button" class="tab${on('details')}" ${dataAttrs({ action: 'go', view, ...where })}>${first}</button>
    ${extra.map(([t, label]) => html`<button type="button" class="tab${on(t)}" ${dataAttrs({ action: 'go', view, ...where, tab: t })}>${label}</button>`)}
    <button type="button" class="tab${on('history')}" ${dataAttrs({ action: 'go', view, ...where, tab: 'history' })}>History (${changes})</button>
  </nav>`;
}

/** A badge for a review that is due soon or overdue; nothing otherwise. @param {string} state from reviewState */
export function reviewTag(state) {
  if (state === 'overdue') return html` <span class="tag review-overdue">Overdue</span>`;
  if (state === 'dueSoon') return html` <span class="tag review-due-soon">Due soon</span>`;
  return '';
}

const CHANGE_WORD = { created: 'Created', deleted: 'Deleted', retired: 'Retired', restored: 'Restored' };

/**
 * One history item's change. An edit is a line a field, each saying what was done to it: Set (it
 * had no value), Changed (before → after) or Cleared (and what it was). Anything else is a word.
 * @param {any} item
 */
export function changeDetail(item) {
  /** @param {any} f @param {any} v */
  const value = (f, v) => (item.kind === 'assessment' ? scaleValue(f.field, v) : f.field === 'implementedBy' && IMPLEMENTED_VALUE[/** @type {keyof typeof IMPLEMENTED_VALUE} */ (v)] ? IMPLEMENTED_VALUE[/** @type {keyof typeof IMPLEMENTED_VALUE} */ (v)] : show(v));
  /** @param {any} f */
  const line = (f) => {
    const what = fieldWord(f.field);
    if (isLong(f)) return longLine(f, what);
    if (blank(f.before)) return html`<strong>Set ${what}</strong>: ${value(f, f.after)}`;
    if (blank(f.after)) return html`<strong>Cleared ${what}</strong> <span class="muted">(was ${value(f, f.before)})</span>`;
    return html`<strong>Changed ${what}</strong>: ${value(f, f.before)} → ${value(f, f.after)}`;
  };
  return item.change === 'edited'
    ? html`<ul class="plain">${item.fields.map((/** @type {any} */ f) => html`<li>${line(f)}</li>`)}</ul>`
    : CHANGE_WORD[/** @type {keyof typeof CHANGE_WORD} */ (item.change)] ?? item.change;
}

/** Fields whose text runs long: justifications, SFARP, analysis, descriptions and notes. */
const LONG_FIELDS = new Set(['likelihoodWhy', 'consequenceWhy', 'justification', 'conclusion', 'conditions', 'recommendation', 'description', 'notes', 'considerations']);

/** A field whose change is shown folded: one of LONG_FIELDS, or any text past a line's length. @param {any} f */
const isLong = (f) => (typeof f.before === 'string' || typeof f.after === 'string')
  && (LONG_FIELDS.has(f.field) || String(f.before ?? '').length > 80 || String(f.after ?? '').length > 80);

/**
 * A long text's change, folded: just what was done (Set, Changed, Cleared) until its ▸ is clicked.
 * Open, a change shows the old text, an arrow on its own line, then the new, the words taken out
 * and put in marked, so one word changed in a long justification is plain to see.
 * @param {any} f @param {string} what
 */
function longLine(f, what) {
  const verb = blank(f.before) ? 'Set' : blank(f.after) ? 'Cleared' : 'Changed';
  const marked = (/** @type {{ text: string, changed: boolean }[]} */ parts, /** @type {string} */ cls) => parts.map((p) => (p.changed ? html`<mark class="${cls}">${p.text}</mark>` : p.text));
  let body;
  if (verb === 'Set') body = html`<div class="text-new">${f.after}</div>`;
  else if (verb === 'Cleared') body = html`<div class="text-old">${f.before}</div>`;
  else {
    const d = wordDiff(String(f.before), String(f.after));
    body = html`<div class="text-old">${marked(d.before, 'diff-out')}</div><div class="text-arrow" aria-label="became">↓</div><div class="text-new">${marked(d.after, 'diff-in')}</div>`;
  }
  return html`<details class="long-change"><summary><strong>${verb} ${what}</strong></summary>${body}</details>`;
}

/** An assessment's likelihood or consequence as the matrix names it, e.g. "C Occasional". @param {string} field @param {any} v */
function scaleValue(field, v) {
  const named = field === 'likelihood' ? LIKELIHOODS.find((x) => x.letter === v) : field === 'consequence' ? CONSEQUENCES.find((x) => x.level === v) : null;
  return named ? `${v} ${named.label}` : show(v);
}

/** An owner change as a person reads it: who was made owner, or that it was cleared. @param {any} item */
function ownerDetail(item) {
  if (item.change === 'edited') return changeDetail(item);
  if (item.change === 'deleted') return html`<strong>Cleared implemented by</strong>`;
  const after = Object.fromEntries(item.fields.map((/** @type {any} */ f) => [f.field, f.after]));
  return html`<strong>Set implemented by</strong>: ${IMPLEMENTED_VALUE[/** @type {keyof typeof IMPLEMENTED_VALUE} */ (after.implementedBy)] ?? after.implementedBy}`;
}

/** What an SSRA item is about, e.g. "Alpha · Residual personnel", read from its id. @param {any} data @param {any} item */
function itemLabel(data, item) {
  const parts = String(item.id).split(':');
  const name = (/** @type {string} */ kind, /** @type {string} */ id) => data.records[kind]?.[id]?.[kind === 'platform' ? 'name' : 'title'] ?? id;
  if (item.kind === 'hazardControl') return `Control ${name('control', parts[2])}`;
  if (item.kind === 'implementer') return `${name('platform', parts[2])} · ${name('control', parts[1])}`;
  if (item.kind === 'ruling') return `${name('platform', parts[3])} · Status of ${name('control', parts[2])}`;
  if (item.kind === 'controlOn') return `${name('platform', parts[3])} · ${name('control', parts[2])}`;
  if (item.kind === 'implementationStatus') return `${name('platform', parts[3])} · Implementation status of ${name('control', parts[2])}`;
  if (item.kind === 'hazardPhase') return `Phase ${data.records.phase?.[parts[2]]?.name ?? ''}`;
  if (item.kind === 'safetyReport') {
    const r = data.records.safetyReport?.[item.id];
    const sid = r ? safetyReportId(data, r).id : 'TBC';
    return `${name('platform', r?.platformId)} · Safety report ${sid !== 'TBC' ? sid : r?.summary || ''}`;
  }
  const [, , platformId, stage, receptor] = parts;
  const platform = data.records.platform[platformId]?.name ?? platformId;
  return item.kind === 'sfarp' ? `${platform} · SFARP` : `${platform} · ${stage[0].toUpperCase()}${stage.slice(1)} ${receptor}`;
}

/** The page a bundle mode is for: bundle mode ends on leaving it. @param {any} view */
export const bundlePage = (view) => `${view?.name}:${view?.id ?? ''}:${view?.tab ?? ''}`;

/**
 * A record's history, newest first, one row per change. Bundles group changes into one row,
 * whose changes open beneath it; a bundle shows wherever any of its changes would, holding those.
 * The Bundle button turns on bundle mode: rows are chosen by dragging over them, Shift-click
 * (from the last row chosen) and Ctrl-click (one at a time), then confirmed as a bundle (the
 * choosing happens on screen alone: see historySelect in mount.js).
 * @param {any} state @param {import('../../core/data.js').Data} data @param {string} kind @param {string} id @param {any[]} [list]
 */
export function historyTable(state, data, kind, id, list = historyOf(data, kind, id)) {
  const itemOf = (/** @type {any} */ e) => e.items.find((/** @type {any} */ i) => i.kind === kind && i.id === id) ?? (e.items.length === 1 ? e.items[0] : null);
  const here = new Set(list.map((e) => e.id));
  const bundles = bundlesOf(data).map((b) => ({ b, members: b.entryIds.filter((x) => here.has(x)).map((x) => data.history[x]).sort((p, q) => (p.at < q.at ? -1 : p.at > q.at ? 1 : 0)) }))
    .filter((x) => x.members.length);
  const inBundle = new Set(bundles.flatMap((x) => x.members.map((e) => e.id)));
  const bundling = state.bundling === bundlePage(state.view);
  const open = new Set(state.openBundles ?? []);
  /** @type {any[]} */
  const rows = [
    // Newest first; changes made in the same second keep that order too.
    ...list.slice().reverse().filter((e) => !inBundle.has(e.id)).map((e) => ({ e, item: itemOf(e) })),
    ...bundles.map(({ b, members }) => ({ bundle: b, members: members.map((e) => ({ e, item: itemOf(e), child: true })) })),
  ].sort((p, q) => {
    const at = (/** @type {any} */ r) => (r.bundle ? r.members.at(-1).e.at : r.e.at);
    return at(p) < at(q) ? 1 : at(p) > at(q) ? -1 : 0;
  });
  // SSRA edits (assessments, SFARP) say which platform and which assessment each item is.
  /** @param {any} e */
  const ssra = (e) => e.items.every((/** @type {any} */ i) => hazardOfItem(data, i) !== null || i.kind === 'implementer');
  /** @param {any} e */
  const labelled = (e) => html`${e.items.map((/** @type {any} */ i) => html`<div><span class="muted">${itemLabel(data, i)}</span> ${i.kind === 'implementer' ? ownerDetail(i) : changeDetail(i)}</div>`)}`;
  /** @param {any} r */
  const who = (r) => (r.bundle ? [...new Set(r.members.map((/** @type {any} */ m) => profileName(state, m.e.by)))].join(', ') : profileName(state, r.e.by));
  /** A bundle's What when none is given: its changes' action, or Multiple changes. @param {any} r */
  const actionOf = (r) => {
    const actions = new Set(r.members.map((/** @type {any} */ m) => m.e.action));
    return actions.size === 1 ? [...actions][0] : 'Multiple changes';
  };
  /** @param {any} r */
  const what = (r) => {
    if (!r.bundle) return r.e.action;
    return r.bundle.title || actionOf(r);
  };
  /** @param {any} r */
  const span = (r) => {
    const first = when(r.members[0].e.at);
    const last = when(r.members.at(-1).e.at);
    return first === last ? first : `${first} – ${last}`;
  };
  /** @param {string} entryId */
  const comments = (entryId) => {
    const adding = state.editing?.kind === 'comment' && state.editing.id === entryId;
    // The comments, each its words then who and when; + at the right adds one.
    return html`<div class="comments-cell"><ul class="plain comments">${commentsOn(data, entryId).map((c) => html`<li>${c.text} <span class="muted comment-by">— ${profileName(state, c.by)}, ${when(c.at)}</span></li>`)}</ul>
      ${adding
        ? html`<form data-action="addComment" ${dataAttrs({ 'entry-id': entryId })} class="row inline fill"><input name="text" required placeholder="Add a comment…" aria-label="Comment" class="grow" autofocus><button type="submit">Add</button><button type="button" ${dataAttrs({ action: 'cancelEdit' })}>Cancel</button></form>`
        : plus({ action: 'startEdit', kind: 'comment', id: entryId }, 'Add a comment')}</div>`;
  };
  const loose = rows.filter((r) => !r.bundle).length;
  // The tools above the table: Bundle, which turns into the bundle bar while choosing.
  const icon = raw('<svg class="tool-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2" width="11" height="3" rx="1"/><rect x="2.5" y="6.5" width="11" height="3" rx="1"/><path d="M1 11.5v2.5h14v-2.5"/></svg>');
  const tools = bundling
    ? html`<form class="tools bundle-bar" data-bundle-form><span class="tools-label">Tools:</span><span class="tool-on">${icon}Bundle</span>
        <span class="bundle-hint">Drag over rows, or Shift-click and Ctrl-click, to choose changes.</span>
        <span class="bundle-count" data-bundle-count>None chosen</span>
        <input name="bundleTitle" class="grow" placeholder="What (optional)…" aria-label="What the bundle is" title="Left empty, What is the changes' action, or Multiple changes">
        <input name="bundleComment" class="grow" placeholder="Comment (optional)…" aria-label="Comment on the bundle">
        <button type="submit" class="primary" data-bundle-confirm disabled>Confirm Bundle</button>
        <button type="button" ${dataAttrs({ action: 'toggleBundling' })}>Cancel</button></form>`
    : html`<div class="tools"><span class="tools-label">Tools:</span>${loose >= 2
      ? html`<button type="button" class="tool" ${dataAttrs({ action: 'toggleBundling' })} title="Group several changes into one">${icon}Bundle</button>`
      : html`<span class="muted">None while there are fewer than two changes to bundle.</span>`}</div>`;
  return html`<div class="history${bundling ? ' bundling' : ''}">${tools}${dataTable(state, {
    id: 'history',
    rowKey: (r) => (r.bundle ? `b:${r.bundle.id}` : r.child ? `c:${r.e.id}` : r.e.id),
    rows,
    empty: 'No changes recorded.',
    rowClass: (r) => (r.bundle ? 'bundle-row' : r.child ? 'bundle-child' : ''),
    rowAttrs: (r) => (bundling && !r.bundle && !r.child ? { selectable: '' } : {}),
    children: (r) => (r.bundle && open.has(r.bundle.id) ? r.members.slice().reverse() : []),
    columns: [
      { key: 'when', label: 'When', width: 300, minWidth: 150, value: (r) => (r.bundle ? r.members.at(-1).e.at : r.e.at),
        render: (r) => (r.bundle
          ? html`<button type="button" class="bundle-toggle" aria-expanded="${open.has(r.bundle.id) ? 'true' : 'false'}" title="${open.has(r.bundle.id) ? 'Hide' : 'Show'} its changes" ${dataAttrs({ action: 'toggleBundleOpen', id: r.bundle.id })}><span class="bundle-caret" aria-hidden="true">▸</span> ${span(r)}</button>`
          : when(r.e.at)) },
      { key: 'who', label: 'Who', width: 260, minWidth: 100, value: who, filter: 'text' },
      { key: 'what', label: 'What', width: 400, minWidth: 140, value: what, filter: 'text',
        render: (r) => {
          if (!r.bundle) return what(r);
          // A bundle's What is changed by double-clicking it; left empty, it is its changes' action.
          if (state.editing?.kind === 'bundleTitle' && state.editing.id === r.bundle.id) {
            return html`<input class="cell-edit" name="title" value="${r.bundle.title ?? ''}" placeholder="${actionOf(r)}" aria-label="What the bundle is" autofocus ${dataAttrs({ change: 'renameBundle', id: r.bundle.id })}>`;
          }
          return html`<div class="bundle-what"><span class="cell-text" ${dataAttrs({ dblclick: 'startEdit', kind: 'bundleTitle', id: r.bundle.id })} title="Double-click to change">${what(r)}</span><span class="tag bundle-tag">Bundle</span></div>`;
        } },
      { key: 'changes', label: 'Changes', width: 720, minWidth: 240, sortable: false,
        render: (r) => (r.bundle
          ? html`<span class="muted">${r.members.length} change${r.members.length === 1 ? '' : 's'}</span> <button type="button" class="small unbundle" ${dataAttrs({ action: 'unbundle', id: r.bundle.id })} title="Show these changes on their own again">Unbundle</button>`
          : ssra(r.e) ? labelled(r.e) : r.item ? changeDetail(r.item) : '') },
      { key: 'comments', label: 'Comments', width: 560, minWidth: 200, sortable: false, render: (r) => comments(r.bundle ? r.bundle.id : r.e.id) },
      removeColumn((r) => (r.bundle
        ? removeButton('Delete this bundle', 'Delete this bundle from the history?', `The bundle and its ${r.members.length} changes leave the history. It can be restored from Deletion history in the ☰ menu.`, { run: 'deleteHistory', 'entry-id': r.bundle.id })
        : removeButton('Delete this change', 'Delete this change from the history?', `“${r.e.action}” leaves the history. It can be restored from Deletion history in the ☰ menu.`, { run: 'deleteHistory', 'entry-id': r.e.id }))),
    ],
  })}</div>`;
}

/** A small, quiet + button, drawn rather than typed so it sits dead centre. @param {Record<string, unknown>} attrs @param {string} label what it does, for its tooltip */
export function plus(attrs, label) {
  return html`<button type="button" class="plus" ${dataAttrs(attrs)} title="${label}" aria-label="${label}"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5v9M1.5 6h9"/></svg></button>`;
}

/** A record's ID, or a TBC badge until it is first saved and numbered. @param {string} label */
export function idTag(label) {
  return label === UNNUMBERED ? html`<span class="tag tag-tbc" title="Numbered when first saved">${label}</span>` : label;
}

/** @param {any} state @param {import('../../core/data.js').Data} data @param {string} kind @param {string} id */
export function historyCount(state, data, kind, id) {
  return rowsCounted(data, historyOf(data, kind, id));
}

/**
 * How many rows a list of changes makes in a History table: each change on its own, but a bundle of
 * them (those of its changes in the list) as one, as the table shows it.
 * @param {import('../../core/data.js').Data} data @param {any[]} list
 */
export function rowsCounted(data, list) {
  const here = new Set(list.map((e) => e.id));
  const bundles = bundlesOf(data).filter((b) => b.entryIds.some((x) => here.has(x)));
  const inBundles = new Set(bundles.flatMap((b) => b.entryIds));
  return list.filter((e) => !inBundles.has(e.id)).length + bundles.length;
}
