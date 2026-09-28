/**
 * The page: draws the `Screen` the app shows into `#pivot`, and turns what the user does into
 * the operations of `views` it stands for. The entry the build names (DEC-003). Everything shown
 * is a field of the screen, drawn as text; nothing here reads a module, a folder, or the browser's
 * storage but through the operations of `../contract.js`, and nothing is derived that a screen does
 * not carry (DEC-010). Verified by demonstration, not by the conformance suite.
 *
 * Flags use the baseline token classes (baseline/tokens.css) and a word each, never colour alone;
 * the top bar carries the active profile on every screen (REQ-057, C-005). A review or file
 * standing that could not be read is drawn as "unknown", never as not overdue or as present (C-031,
 * C-035). A band is drawn as the word `rating` gave and nothing beside it (C-021).
 *
 * The sidebar reaches every section from anywhere: it walks `back` to the hazards screen, the one
 * screen every section is opened from (C-015), and opens the section there. The page's colours
 * follow the system's light or dark setting, with a toggle for this page only; nothing is stored.
 */

import * as views from '../contract.js';

/** @typedef {import('../contract.js').App} App */

const LIKELIHOODS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const CONSEQUENCES = [1, 2, 3, 4, 5];
const WORKFLOW_NAMES = /** @type {Record<string, string>} */ ({
  'add-data': 'Add a hazard',
  'onboard-platform': 'Onboard a platform',
  'review-data': 'Review a platform',
  'remove-control': 'Remove a control from a platform',
  'transfer-ownership': 'Transfer platform ownership',
});
/** Steps whose one entry is all they take; once recorded, the next thing to do is move on. */
const ONE_ENTRY_STEPS = ['name-the-hazard', 'name-the-platform', 'choose-the-control', 'choose-the-owner', 'record-the-reason'];
/** Screens from which the sidebar may walk back to the hazards screen. */
const LEAVES_BY_BACK = ['hazard', 'controls', 'platforms', 'platform', 'assessment', 'bowtie', 'history', 'acknowledge', 'references', 'reference',
  'workflows', 'workflow', 'reports', 'prepare-report', 'report', 'filter', 'dashboard', 'open-items'];

/** @type {App | null} */
let app = null;
let busy = false;
/** @type {'system' | 'light' | 'dark'} */
let theme = 'system';
/** @type {Record<string, string>} what each list screen's find box holds, kept across redraws */
const found = {};

// ------------------------------------------------------------------ elements

/**
 * An element with attributes and children; strings are text, never HTML.
 * @param {string} tag
 * @param {Record<string, any>} [attrs]
 * @param {...any} children
 * @returns {HTMLElement}
 */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/**
 * @param {string} kind overdue, open-item, missing-file, or unconfirmed
 * @param {string} label
 */
const flag = (kind, label) => h('span', { class: `pivot-flag pivot-flag--${kind}` }, label);

/**
 * Run operations of `views` and draw the screen the last resolves with.
 * @param {(app: App) => Promise<unknown>} call
 */
async function act(call) {
  if (busy || app === null) return;
  busy = true;
  document.body.setAttribute('aria-busy', 'true');
  try {
    await call(app);
  } catch (e) {
    // Only WrongScreenError leaves `views` (C-008); the page never offers one, so this is a defect.
    console.error(e);
  } finally {
    busy = false;
    document.body.removeAttribute('aria-busy');
    draw();
  }
}

/**
 * Walk back to the hazards screen, then run `open` there (C-015).
 * @param {(app: App) => Promise<unknown>} open
 */
function fromHazards(open) {
  return act(async (a) => {
    for (let i = 0; i < 6 && a.screen.kind !== 'hazards'; i += 1) {
      if (a.screen.kind === 'restore' || a.screen.kind === 'confirm-restore') await views.cancelRestore(a);
      else if (LEAVES_BY_BACK.includes(a.screen.kind)) await views.back(a);
      else return;
    }
    if (a.screen.kind === 'hazards') await open(a);
  });
}

/**
 * A button that runs one operation.
 * @param {string} label
 * @param {(app: App) => Promise<unknown>} call
 * @param {'primary' | 'quiet' | 'danger' | 'link'} [look]
 */
const button = (label, call, look = 'quiet') => h('button', { type: 'button', class: `pv-button pv-button--${look}`, onclick: () => act(call) }, label);

/**
 * A form whose submit reads its fields and runs one operation.
 * @param {(fields: Record<string, string>, form: HTMLFormElement) => ((app: App) => Promise<unknown>) | null} onSubmit
 * @param {...any} children
 */
function form(onSubmit, ...children) {
  const el = /** @type {HTMLFormElement} */ (h('form', { class: 'pv-form' }, ...children));
  el.addEventListener('submit', (event) => {
    event.preventDefault();
    const fields = /** @type {Record<string, string>} */ ({});
    new FormData(el).forEach((v, k) => { fields[k] = typeof v === 'string' ? v : ''; });
    const call = onSubmit(fields, el);
    if (call) act(call);
  });
  return el;
}

/**
 * @param {string} name
 * @param {string} label
 * @param {Record<string, any>} [attrs]
 */
const input = (name, label, attrs = {}) => h('label', { class: 'pv-field' }, h('span', {}, label), h('input', { name, ...attrs }));

/**
 * @param {string} name
 * @param {string} label
 * @param {readonly [string, string][]} options value, text
 */
const select = (name, label, options) => h('label', { class: 'pv-field' }, h('span', {}, label), h('select', { name }, options.map(([value, text]) => h('option', { value }, text))));

/**
 * @param {string} label
 * @param {'primary' | 'quiet'} [look]
 */
const submit = (label, look = 'primary') => h('button', { type: 'submit', class: `pv-button pv-button--${look}` }, label);

/**
 * A titled block of the page.
 * @param {string} title
 * @param {...any} children
 */
const section = (title, ...children) => h('section', { class: 'pv-section' }, h('h2', {}, title), ...children);

/**
 * A plain list, or a sentence saying it is empty.
 * @param {readonly any[]} items
 * @param {(item: any) => any} row
 * @param {string} [empty]
 */
const list = (items, row, empty = 'None.') => (items.length === 0 ? h('p', { class: 'pv-empty' }, empty) : h('ul', { class: 'pv-list' }, items.map((x) => h('li', {}, row(x)))));

/** @type {Record<string, { col: number, dir: 1 | -1 }>} each table's sort, kept across redraws */
const sorts = {};
/** @type {Record<string, number[]>} each table's column widths in px once a user drags one */
const widths = {};
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * A table, or a sentence saying it is empty. A heading sorts the rows by that column, and the
 * edge of a heading drags to resize it; both only rearrange what is drawn and call nothing.
 * @param {readonly string[]} headings
 * @param {readonly any[]} items
 * @param {(item: any) => any[]} cells
 * @param {string} [empty]
 */
function table(headings, items, cells, empty = 'None.') {
  if (items.length === 0) return h('p', { class: 'pv-empty' }, empty);
  const key = `${app?.screen.kind ?? ''}|${headings.join('|')}`;
  const rows = items.map((x) => cells(x).map((c) => h('td', {}, c)));
  const sort = sorts[key];
  if (sort) rows.sort((a, b) => sort.dir * collator.compare(a[sort.col]?.textContent?.trim() ?? '', b[sort.col]?.textContent?.trim() ?? ''));
  const width = widths[key];
  const el = h('table', { class: `pv-table${width ? ' pv-table--fixed' : ''}`, style: width ? `width: ${width.reduce((x, y) => x + y, 0)}px` : null },
    width ? h('colgroup', {}, width.map((w) => h('col', { style: `width: ${w}px` }))) : null,
    h('thead', {}, h('tr', {}, headings.map((t, i) => h('th', { scope: 'col', 'aria-sort': sort?.col === i ? (sort.dir === 1 ? 'ascending' : 'descending') : null },
      t === '' ? null : h('button', {
        type: 'button', class: 'pv-sort',
        onclick: () => { sorts[key] = { col: i, dir: sort?.col === i && sort.dir === 1 ? -1 : 1 }; draw(); },
      }, t, h('span', { class: 'pv-sort__mark', 'aria-hidden': 'true' }, sort?.col === i ? (sort.dir === 1 ? '▲' : '▼') : '')),
      h('span', { class: 'pv-grip', 'aria-hidden': 'true', onpointerdown: (/** @type {PointerEvent} */ e) => resize(e, key, i), ondblclick: () => { delete widths[key]; draw(); } }))))),
    h('tbody', {}, rows.map((r) => h('tr', {}, r))));
  return h('div', { class: 'pv-table-wrap' }, el);
}

/**
 * Drag one column's edge; the first drag fixes every column at the width it was drawn.
 * @param {PointerEvent} e
 * @param {string} key
 * @param {number} col
 */
function resize(e, key, col) {
  e.preventDefault();
  const grip = /** @type {HTMLElement} */ (e.target);
  const table = /** @type {HTMLTableElement} */ (grip.closest('table'));
  /** @type {number[]} */
  const start = [];
  table.querySelectorAll('thead th').forEach((th) => { start.push(/** @type {HTMLElement} */ (th).getBoundingClientRect().width); });
  const x0 = e.clientX;
  grip.setPointerCapture(e.pointerId);
  const move = (/** @type {PointerEvent} */ m) => {
    const w = start.slice();
    w[col] = Math.max(48, start[col] + m.clientX - x0);
    widths[key] = w;
    /** @type {HTMLElement | null} */
    let cols = table.querySelector('colgroup');
    if (cols === null) { cols = h('colgroup', {}, w.map(() => h('col', {}))); table.prepend(cols); table.classList.add('pv-table--fixed'); }
    cols.querySelectorAll('col').forEach((c, i) => { /** @type {HTMLElement} */ (c).style.width = `${w[i]}px`; });
    table.style.width = `${w.reduce((x, y) => x + y, 0)}px`;
  };
  const up = () => { grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); };
  grip.addEventListener('pointermove', move);
  grip.addEventListener('pointerup', up);
}

/**
 * The header of a screen: its title, what it is about, and its main action.
 * @param {string} title
 * @param {any} [aside]
 * @param {any} [actions]
 */
const header = (title, aside = null, actions = null) => h('header', { class: 'pv-head' },
  h('div', {}, h('h1', {}, title), aside ? h('p', { class: 'pv-head__aside' }, aside) : null),
  actions ? h('div', { class: 'pv-head__actions' }, actions) : null);

/**
 * A small button that opens a form in a panel, so adding stays out of the way of reading.
 * @param {string} label
 * @param {...any} children
 */
const adder = (label, ...children) => h('details', { class: 'pv-adder' },
  h('summary', { class: 'pv-button pv-button--quiet pv-button--small' }, label), h('div', { class: 'pv-panel' }, ...children));

/**
 * A box that narrows the rows of this screen's tables to those containing its text. It hides
 * rows already drawn and calls nothing; the structured filter is the Search screen's.
 * @param {string} kind
 * @param {string} label
 */
const finder = (kind, label) => h('input', {
  type: 'search', class: 'pv-find', placeholder: label, 'aria-label': label, value: found[kind] ?? '',
  oninput: (/** @type {Event} */ e) => { found[kind] = /** @type {HTMLInputElement} */ (e.target).value; applyFind(); },
});

function applyFind() {
  const root = document.getElementById('pivot');
  const box = /** @type {HTMLInputElement | null} */ (root?.querySelector('.pv-find') ?? null);
  if (!root || !box) return;
  const q = box.value.trim().toLowerCase();
  root.querySelectorAll('.pv-table tbody tr').forEach((tr) => { /** @type {HTMLElement} */ (tr).hidden = q !== '' && !(tr.textContent ?? '').toLowerCase().includes(q); });
}

// ------------------------------------------------------------------ values as people read them

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * An AEST date or timestamp as a person reads it; anything else as it is.
 * @param {string | null | undefined} value
 */
function when(value) {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
  if (!m) return value;
  const date = `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  return m[4] ? `${date}, ${m[4]}:${m[5]}` : date;
}

/**
 * The name a profile id is drawn as: the stored profile's, or the id itself (C-024, C-028).
 * @param {readonly any[] | undefined} profiles
 * @param {string | null} id
 */
function who(profiles, id) {
  if (id === null) return '';
  return (profiles ?? []).find((p) => p.id === id)?.name ?? id;
}

/**
 * A rating's values and the band `rating` gave for them, as entered (C-021).
 * @param {any} rating
 * @param {any} values
 */
function band(rating, values) {
  if (values.consequence === null && values.likelihood === null) {
    return h('span', { class: 'pv-rating' }, rating ? rating.band : '', h('span', { class: 'pv-muted' }, ', not rated'));
  }
  const cell = `${values.consequence ?? '–'}${values.likelihood ?? '–'}`;
  return h('span', { class: 'pv-rating' }, h('span', { class: 'pv-num' }, cell), rating ? ` ${rating.band}` : '');
}

/**
 * A record's review standing on a screen that carries `reviews` (C-031).
 * @param {any} reviews
 * @param {string} kind
 * @param {string} id
 * @param {string | null} [none] what a record with no schedule shows; null for nothing
 */
function review(reviews, kind, id, none = '—') {
  if (reviews === undefined) return null;
  if (reviews === null) return flag('overdue', 'review unknown');
  const schedule = reviews.schedules.find((/** @type {any} */ s) => s.ref.kind === kind && s.ref.id === id);
  const overdue = reviews.overdue.some((/** @type {any} */ s) => s.ref.kind === kind && s.ref.id === id);
  if (overdue) return [flag('overdue', 'review overdue'), h('span', { class: 'pv-muted' }, ` since ${when(schedule?.nextDueAest)}`)];
  if (schedule) return h('span', { class: 'pv-muted' }, `review due ${when(schedule.nextDueAest)}`);
  return none === null ? null : h('span', { class: 'pv-muted' }, none);
}

/**
 * A reference entry's file standing on a screen that carries `files` (C-035).
 * @param {any} files
 * @param {string} id
 */
function fileFlag(files, id) {
  if (files === null) return flag('missing-file', 'file unknown');
  const state = files.find((/** @type {any} */ f) => f.entryId === id);
  if (state?.flagged) return flag('missing-file', state.reason === 'missing' ? 'file missing' : `file ${state.reason}`);
  return state?.location ? h('span', { class: 'pv-muted' }, 'file kept') : null;
}

/**
 * A control against a platform, in the state `registry` gave it (C-024).
 * @param {any} pc
 * @param {readonly any[]} [profiles]
 */
function controlState(pc, profiles) {
  if (pc.state === 'confirmed') return h('span', {}, 'Confirmed', pc.confirmation ? h('span', { class: 'pv-muted' }, ` by ${who(profiles, pc.confirmation.byProfileId)}, ${when(pc.confirmation.atAest)}`) : '');
  if (pc.state === 'excluded') return h('span', {}, 'Excluded', h('span', { class: 'pv-muted' }, `: ${pc.justification?.text ?? ''}`));
  return flag('unconfirmed', 'awaiting');
}

/**
 * A record changed by an act, as a person names it: its title, name, or text where the entry
 * holds one, otherwise its kind and id.
 * @param {any} item
 */
function itemName(item) {
  /** @param {string} field */
  const value = (field) => {
    const change = item.fields.find((/** @type {any} */ c) => c.field === field);
    return change ? (change.after ?? change.before) : null;
  };
  if (item.ref.kind === 'review-schedule' && value('tempoMonths') !== null) return `every ${value('tempoMonths')} months, next due ${when(value('nextDueAest'))}`;
  if (item.ref.kind === 'workflow-record' && value('workflowKind') !== null) return WORKFLOW_NAMES[value('workflowKind')] ?? value('workflowKind');
  const entries = value('entries');
  if (item.ref.kind === 'workflow-record' && Array.isArray(entries) && entries.length > 0) return `step recorded: ${entries[entries.length - 1].text}`;
  if (item.ref.kind === 'workflow-record' && value('currentStep') !== null) return `now at ${value('currentStep')}`;
  for (const field of ['title', 'name', 'text', 'outcome']) {
    const change = item.fields.find((/** @type {any} */ c) => c.field === field);
    const value = change ? (change.after ?? change.before) : null;
    if (typeof value === 'string' && value !== '') return value;
  }
  return item.ref.id;
}

const KIND_NAMES = /** @type {Record<string, string>} */ ({
  hazard: 'hazard', control: 'control', platform: 'platform', 'causal-factor': 'causal factor', consequence: 'consequence', justification: 'exclusion',
  rating: 'rating', 'reference-entry': 'reference', 'review-schedule': 'review schedule', 'workflow-record': 'workflow', report: 'report',
  'report-template': 'report template', link: 'link', 'user-profile': 'profile', 'change-log-entry': 'history entry',
});
/** Header fields an entry records for every record; shown only on request. */
const HEADER_FIELDS = ['id', 'kind', 'status', 'createdBy', 'createdAtAest', 'updatedBy', 'updatedAtAest'];

/**
 * One act of the history, as a sentence with its field changes folded away (C-028).
 * @param {any} e
 * @param {readonly any[]} [profiles]
 */
function entrySummary(e, profiles) {
  const by = h('div', { class: 'pv-muted pv-by' }, `${who(profiles, e.createdBy)}, ${when(e.createdAtAest)}`);
  if (e.entryKind !== 'record-change') return h('span', {}, 'Acknowledged a change for this platform', by);
  return h('div', { class: 'pv-entry' }, e.items.map((/** @type {any} */ item) => {
    const verb = { created: 'Created', edited: 'Changed', deleted: 'Deleted', retired: 'Retired' }[/** @type {'created'} */ (item.action)] ?? item.action;
    const kind = KIND_NAMES[item.ref.kind] ?? item.ref.kind;
    const shown = item.fields.filter((/** @type {any} */ c) => !HEADER_FIELDS.includes(c.field));
    return h('div', {},
      h('span', {}, `${verb} ${kind} `, h('strong', {}, itemName(item))),
      shown.length > 0 ? h('details', { class: 'pv-details' }, h('summary', {}, item.action === 'created' ? 'Values' : 'What changed'),
        h('dl', {}, shown.map((/** @type {any} */ c) => [h('dt', {}, c.field),
          h('dd', {}, item.action === 'created' ? display(c.after) : [display(c.before), ' → ', display(c.after)])]))) : null);
  }), by);
}

/** @param {unknown} v @returns {string} */
function display(v) {
  if (v === null || v === undefined) return '(none)';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.length === 0 ? '(none)' : v.map((/** @type {any} */ x) => (x && typeof x === 'object' && 'text' in x ? x.text : display(x))).join('; ');
  if (typeof v === 'object' && v !== null && 'kind' in v && 'id' in v) return `${KIND_NAMES[/** @type {any} */ (v).kind] ?? /** @type {any} */ (v).kind} ${/** @type {any} */ (v).id}`;
  return JSON.stringify(v);
}

// ------------------------------------------------------------------ the frame

/** @param {any} screen */
function topBar(screen) {
  const next = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
  return h('header', { class: 'pivot-topbar' },
    h('span', { class: 'pv-brand' }, 'Pivot'),
    screen.topBar.folderName ? h('span', { class: 'pv-topbar__folder' }, `Folder: ${screen.topBar.folderName}`) : null,
    h('span', { class: 'pivot-topbar__profile' }, screen.topBar.profileName ?? 'No profile selected'),
    h('button', {
      type: 'button', class: 'pv-theme', 'aria-label': `Colours: ${theme}. Switch to ${next}.`,
      onclick: () => { theme = next; applyTheme(); draw(); },
    }, theme === 'system' ? 'Auto' : theme === 'light' ? 'Light' : 'Dark'));
}

/** @param {any} screen */
function sidebar(screen) {
  const kind = screen.kind;
  if (['folder', 'check', 'profile', 'recover', 'confirm-edit', 'confirm-restore'].includes(kind)) return null;
  /** @type {[string, string[], ((a: App) => Promise<unknown>) | null][]} */
  const items = [
    ['My dashboard', ['dashboard', 'acknowledge'], (a) => views.openDashboard(a)],
    ['Hazards', ['hazards', 'hazard'], null],
    ['Platforms', ['platforms', 'platform', 'assessment', 'bowtie'], (a) => views.openPlatforms(a)],
    ['Controls', ['controls'], (a) => views.openControls(a)],
    ['Workflows', ['workflows', 'workflow'], (a) => views.openWorkflows(a)],
    ['Reports', ['reports', 'prepare-report', 'report'], (a) => views.openReports(a)],
    ['References', ['references', 'reference'], (a) => views.openReferences(a)],
    ['Search', ['filter'], (a) => views.openFilter(a)],
  ];
  /** @type {typeof items} */
  const records = [
    ['Open items', ['open-items'], (a) => views.openOpenItems(a)],
    ['History', ['history'], (a) => views.openHistory(a)],
  ];
  const nav = (/** @type {typeof items} */ xs) => h('ul', {}, xs.map(([label, kinds, open]) => h('li', {}, h('button', {
    type: 'button',
    class: `pv-nav${kinds.includes(kind) ? ' pv-nav--current' : ''}`,
    'aria-current': kinds.includes(kind) ? 'page' : null,
    onclick: () => fromHazards(open ?? (async () => {})),
  }, label))));
  return h('nav', { class: 'pv-sidebar', 'aria-label': 'Sections' },
    nav(items), h('hr', { class: 'pv-divider' }), nav(records),
    h('div', { class: 'pv-sidebar__foot' },
      kind === 'hazards' && screen.unsaved ? h('p', { class: 'pv-unsaved' }, 'Unsaved changes') : null,
      h('button', { type: 'button', class: 'pv-button pv-button--primary pv-save', onclick: () => fromHazards((a) => views.save(a)) }, 'Save to folder'),
      h('button', { type: 'button', class: 'pv-button pv-button--link', onclick: () => fromHazards((a) => views.beginRestore(a)) }, 'Restore from a backup')));
}

/** @param {any} screen */
function messages(screen) {
  if (screen.messages.length === 0) return null;
  return h('div', { class: 'pv-messages', role: 'status', 'aria-live': 'polite' }, screen.messages.map((/** @type {any} */ m) => h('div', { class: `pv-message pv-message--${m.severity}` },
    h('p', { class: 'pv-message__headline' }, m.headline),
    m.items.length > 0 ? h('ul', {}, m.items.map((/** @type {string} */ i) => h('li', {}, i))) : null,
    h('p', { class: 'pv-message__next' }, m.next))));
}

/**
 * Open the dashboard when the app has just landed on the hazards screen, so a session starts there.
 * @param {App} a
 */
async function toDashboard(a) {
  if (a.screen.kind === 'hazards') await views.openDashboard(a);
}

/** A way back along the one edge a screen was reached by (C-015). */
const back = (/** @type {string} */ label = 'Back') => h('button', { type: 'button', class: 'pv-back', onclick: () => act((a) => views.back(a)) }, `‹ ${label}`);

// ------------------------------------------------------------------ the screens

/** @type {Record<string, (s: any) => any>} */
const SCREENS = {
  folder: () => h('div', { class: 'pv-welcome' },
    h('h1', {}, 'Open your hazard log'),
    h('p', {}, 'Pivot keeps everything in a shared data folder. Choose the folder your team uses.'),
    button('Choose data folder', (a) => views.chooseFolder(a), 'primary')),

  check: () => h('div', { class: 'pv-welcome' },
    h('h1', {}, 'Some files failed their check'),
    h('p', {}, 'Those files are listed above and nothing from them is shown. The rest of the folder can be opened.'),
    button('Continue', (a) => views.acknowledgeCheck(a), 'primary')),

  profile: (s) => h('div', { class: 'pv-welcome' },
    h('h1', {}, 'Who is working?'),
    s.profiles.length === 0 ? h('p', {}, 'No one has used this folder yet. Add yourself to start.') : h('ul', { class: 'pv-choices' },
      s.profiles.map((/** @type {any} */ p) => h('li', {}, button(p.name, (a) => views.selectProfile(a, p.id).then(() => toDashboard(a)), 'quiet')))),
    form((f) => (a) => views.createProfile(a, f.name), input('name', 'Add a profile', { required: true, autocomplete: 'name' }), submit('Add'))),

  recover: (s) => h('div', { class: 'pv-welcome' },
    h('h1', {}, 'Recover unsaved work?'),
    h('p', {}, `This browser holds work last changed ${when(s.mirroredAtAest)} that was never saved to the folder.`),
    table(['ID', 'Hazard'], s.hazards, (hz) => [h('span', { class: 'pv-num' }, hz.id), hz.title], 'It holds no hazards.'),
    h('div', { class: 'pv-row' }, button('Recover it', (a) => views.acceptRecovery(a).then(() => toDashboard(a)), 'primary'), button('Discard it', (a) => views.declineRecovery(a).then(() => toDashboard(a)), 'danger'))),

  hazards: (s) => [
    header('Hazards', s.lastSave ? `Last saved ${when(s.lastSave.savedAtAest)}` : 'Not yet saved to the folder',
      [finder('hazards', 'Find a hazard'), adder('New hazard', form((f) => (a) => views.addHazard(a, { title: f.title }), input('title', 'Hazard', { required: true, placeholder: 'What could go wrong' }), submit('Add')))]),
    table(['ID', 'Hazard', 'Review'], s.hazards, (hz) => [
      h('span', { class: 'pv-num' }, hz.id),
      h('button', { type: 'button', class: 'pv-button pv-button--link', onclick: () => act((a) => views.openHazard(a, hz.id)) }, hz.title),
      review(s.reviews, 'hazard', hz.id),
    ], 'No hazards yet.'),
  ],

  restore: (s) => [
    header('Restore from a backup', 'Restoring replaces the stored data. You will see what it holds before anything is written.', button('Cancel', (a) => views.cancelRestore(a))),
    table(['Taken', ''], s.backups, (b) => [when(b.takenAtAest), button('Restore this backup', (a) => views.prepareRestore(a, { kind: 'backup', file: b.file }))], 'No backups have been kept yet.'),
    section('From a saved file', button('Choose a save state file', (a) => views.chooseSaveState(a))),
  ],

  'confirm-restore': (s) => [
    header(`Restore ${s.restoring}?`, s.replaces ? `This replaces the data ${s.replacesSavedBy} saved ${when(s.replaces.savedAtAest)}.` : 'Nothing has been saved to this folder yet.',
      [button('Restore', (a) => views.confirmRestore(a), 'danger'), button('Cancel', (a) => views.cancelRestore(a))]),
    section('What it holds', table(['ID', 'Hazard'], s.hazards, (hz) => [h('span', { class: 'pv-num' }, hz.id), hz.title], 'No hazards.')),
  ],

  hazard: (s) => [
    back('Hazards'),
    header(s.hazard.title, h('span', {}, h('span', { class: 'pv-num' }, s.hazard.id), ' ', review(s.reviews, 'hazard', s.hazard.id, 'no review set'))),
    h('div', { class: 'pv-grid' },
      section('Causal factors', list(s.causalFactors, (c) => c.text, 'None recorded.'),
        adder('Add', form((f) => (a) => views.addCausalFactor(a, { text: f.text }), input('text', 'Causal factor', { required: true }), submit('Add')))),
      section('Consequences', list(s.consequences, (c) => c.text, 'None recorded.'),
        adder('Add', form((f) => (a) => views.addConsequence(a, { text: f.text }), input('text', 'Consequence', { required: true }), submit('Add'))))),
    section('Controls', table(['Control', 'Side'], s.controls, (c) => [c.control.title, c.controlKind], 'No controls linked.'),
      s.linkableControls.length > 0 ? adder('Link a control', form((f) => (a) => views.linkControlToHazard(a, /** @type {any} */ (f.controlId), /** @type {any} */ (f.controlKind)),
        select('controlId', 'Control', s.linkableControls.map((/** @type {any} */ c) => [c.id, c.title])),
        select('controlKind', 'Side', [['preventative', 'Preventative'], ['mitigating', 'Mitigating']]), submit('Link'))) : null),
    section('On platforms', s.platforms.length === 0 ? h('p', { class: 'pv-empty' }, 'Not on any platform.') : s.platforms.map((/** @type {any} */ p) => h('div', { class: 'pv-sub' },
      h('h3', {}, p.platform.name),
      p.omitted ? h('p', {}, flag('open-item', 'omitted'), ` Could not be read here: ${p.omitted.reason}.`)
        : table(['Control', 'On this platform'], p.controls, (pc) => [pc.control.title, controlState(pc)], 'No controls.')))),
    section('In reports', list(s.reports, (r) => `${r.title}, ${r.platformName}, ${when(r.createdAtAest)}`, 'In no report.')),
    h('details', { class: 'pv-details pv-manage' }, h('summary', {}, 'Manage this hazard'),
      form((f) => (a) => views.renameHazard(a, { title: f.title }), input('title', 'Title', { value: s.hazard.title, required: true }), submit('Rename', 'quiet')),
      tempoForm('hazard', s.hazard.id),
      h('div', { class: 'pv-row' }, button('Retire this hazard', (a) => views.retireHazard(a), 'danger'))),
  ],

  controls: (s) => [
    header('Control library', 'Every control, once. A control is linked to hazards on each hazard\'s own page.',
      [finder('controls', 'Find a control'), adder('New control', form((f) => (a) => views.createControl(a, { title: f.title }), input('title', 'Control', { required: true }), submit('Create')))]),
    table(['Control', 'Review', ''], s.controls, (c) => [c.title, review(s.reviews, 'control', c.id),
      h('details', { class: 'pv-details' }, h('summary', {}, 'Manage'), tempoForm('control', c.id), button('Retire', (a) => views.retireControl(a, c.id), 'danger'))], 'No controls yet.'),
  ],

  platforms: (s) => {
    const owners = s.profiles.map((/** @type {any} */ p) => [p.id, p.name]);
    return [
      header('Platforms', null, [finder('platforms', 'Find a platform'),
        adder('New platform', form((f) => (a) => views.createPlatform(a, { name: f.name, ownerProfileId: /** @type {any} */ (f.owner) }), input('name', 'Name', { required: true }), select('owner', 'Owner', owners), submit('Create')))]),
      table(['Platform', 'Owner', 'Review', ''], s.platforms, (p) => [
        h('button', { type: 'button', class: 'pv-button pv-button--link', onclick: () => act((a) => views.openPlatform(a, p.id)) }, p.name),
        who(s.profiles, p.ownerProfileId), review(s.reviews, 'platform', p.id),
        h('details', { class: 'pv-details' }, h('summary', {}, 'Manage'),
          form((f) => (a) => views.setPlatformOwner(a, p.id, /** @type {any} */ (f.owner)), select('owner', 'Owner', owners), submit('Transfer', 'quiet')),
          tempoForm('platform', p.id), button('Retire', (a) => views.retirePlatform(a, p.id), 'danger'))], 'No platforms yet.'),
    ];
  },

  platform: (s) => [
    back('Platforms'),
    header(s.platform.name, review(s.reviews, 'platform', s.platform.id, null),
      s.linkableHazards.length > 0 ? adder('Add a hazard', form((f) => (a) => views.linkHazardToPlatform(a, /** @type {any} */ (f.hazardId)),
        select('hazardId', 'Hazard', s.linkableHazards.map((/** @type {any} */ hz) => [hz.id, `${hz.id} ${hz.title}`])), submit('Add'))) : null),
    table(['Report ID', 'Hazard', 'Residual', 'Controls', 'Review'], s.rows, (r) => [
      h('span', { class: 'pv-num' }, r.reportId),
      h('button', { type: 'button', class: 'pv-button pv-button--link', onclick: () => act((a) => views.openAssessment(a, r.hazard.id)) }, r.hazard.title),
      band(r.residualRating, r.residual),
      controlCounts(r.controls),
      review(s.reviews, 'hazard', r.hazard.id),
    ], 'No hazards on this platform yet.'),
    s.omitted.length > 0 ? section('Could not be read', list(s.omitted, (o) => [h('span', { class: 'pv-num' }, o.id), ' ', flag('open-item', 'omitted'), ` ${o.detail}`])) : null,
  ],

  assessment: (s) => [
    back(s.platform.name),
    header(s.hazard.title, h('span', {}, 'On ', s.platform.name, ' as ', h('span', { class: 'pv-num' }, s.reportId)), button('Bow-tie', (a) => views.openBowtie(a))),
    h('div', { class: 'pv-grid' }, ratingForm('initial', 'Initial rating', s.initial, s.initialRating), ratingForm('residual', 'Residual rating', s.residual, s.residualRating)),
    section('Controls on this platform', table(['Control', 'Side', 'State', ''], s.controls, (pc) => [pc.control.title, pc.controlKind, controlState(pc, s.profiles), h('div', { class: 'pv-row' },
      pc.state !== 'confirmed' ? button('Confirm', (a) => views.confirmControlForPlatform(a, pc.control.id)) : null,
      pc.state !== 'excluded' ? h('details', { class: 'pv-details' }, h('summary', {}, 'Exclude'),
        form((f) => (a) => views.excludeControlFromPlatform(a, pc.control.id, f.text), input('text', 'Why is it not on this platform?', { required: true }), submit('Exclude', 'quiet'))) : null)], 'This hazard has no controls.')),
    h('details', { class: 'pv-details pv-manage' }, h('summary', {}, 'Change the report ID'),
      form((f) => (a) => views.setReportId(a, /** @type {any} */ (f.reportId)), input('reportId', 'ID in this platform\'s reports', { value: s.reportId, required: true }), submit('Set', 'quiet'))),
  ],

  bowtie: (s) => [back(s.bowtie.hazard.title), header('Bow-tie', `${s.bowtie.hazard.title} on ${s.bowtie.platform?.name ?? 'this platform'}`, button('Export SVG', (a) => views.chooseExportTarget(a))), h('div', { class: 'pv-figure' }, svgOf(s.svg))],

  history: (s) => [header('History', 'Every change made to this data, oldest first.'), list(s.entries, (e) => entrySummary(e, s.profiles), 'Nothing has been recorded yet.')],

  acknowledge: (s) => [
    h('button', { type: 'button', class: 'pv-back', onclick: () => fromHazards((a) => views.openDashboard(a)) }, '‹ My dashboard'),
    header('Changes to acknowledge', 'Changes that reach the platforms you own.'),
    s.queues.length === 0 ? h('p', { class: 'pv-empty' }, 'You own no platform.') : s.queues.map((/** @type {any} */ q) => section(q.platform.name,
      list(q.entries, (e) => h('div', { class: 'pv-row pv-row--spread' }, entrySummary(e, s.profiles), h('button', { type: 'button', class: 'pv-button pv-button--quiet pv-button--small', onclick: () => act((a) => views.acknowledgeChange(a, e.id, q.platform.id)) }, 'Acknowledge')), 'Nothing to acknowledge.'))),
  ],

  'confirm-edit': (s) => h('div', { class: 'pv-welcome' },
    h('h1', {}, 'This change reaches more than one platform'),
    h('p', {}, 'Each platform\'s owner will be asked to acknowledge it:'),
    list(s.affected, (p) => p.name),
    h('div', { class: 'pv-row' }, button('Make the change', (a) => views.confirmEdit(a), 'primary'), button('Cancel', (a) => views.cancelEdit(a)))),

  references: (s) => [
    header('References', 'Documents, links, and files the hazard log relies on.', adder('New reference', referenceForm())),
    table(['Reference', 'File', 'Review'], s.entries, (e) => [
      h('button', { type: 'button', class: 'pv-button pv-button--link', onclick: () => act((a) => views.openReference(a, e.id)) }, e.name ?? e.link ?? e.path ?? 'Untitled'),
      fileFlag(s.files, e.id), review(s.reviews, 'reference-entry', e.id)], 'No references yet.'),
  ],

  reference: (s) => [
    back('References'),
    header(s.entry.name ?? 'Reference', [fileFlag(s.files, s.entry.id), ' ', review(s.reviews, 'reference-entry', s.entry.id, null)]),
    h('dl', { class: 'pv-facts' },
      s.entry.link ? [h('dt', {}, 'Link'), h('dd', {}, s.entry.link)] : null,
      s.entry.path ? [h('dt', {}, 'Path'), h('dd', {}, s.entry.path)] : null,
      s.entry.fileLocation ? [h('dt', {}, 'File'), h('dd', {}, s.entry.fileLocation)] : null),
    section('Linked to', list(s.links, (l) => `${KIND_NAMES[l.ref.kind] ?? l.ref.kind}: ${l.name ?? l.ref.id}`, 'Nothing yet.'),
      adder('Link', linkForm('hazard', 'Hazard', s.linkableHazards, (x) => `${x.id} ${x.title}`), linkForm('control', 'Control', s.linkableControls, (x) => x.title), linkForm('platform', 'Platform', s.linkablePlatforms, (x) => x.name))),
  ],

  workflows: (s) => [
    header('Workflows', 'Guided steps for the common jobs. Each step is recorded as you go.', adder('Start a workflow', form((f) => (a) => views.startWorkflow(a, { workflowKind: /** @type {any} */ (f.kind), subject: f.platform ? { kind: 'platform', id: f.platform } : null }),
      select('kind', 'Workflow', Object.entries(WORKFLOW_NAMES)),
      select('platform', 'Platform', [['', 'None (to add a hazard or onboard a new platform)'], ...s.platforms.map((/** @type {any} */ p) => [p.id, p.name])]), submit('Start')))),
    table(['Workflow', 'On', 'State', 'Started'], s.workflows, (r) => [
      h('button', { type: 'button', class: 'pv-button pv-button--link', onclick: () => act((a) => views.openWorkflow(a, r.workflow.id)) }, WORKFLOW_NAMES[r.workflow.workflowKind] ?? r.workflow.workflowKind),
      r.subjectName ?? '—', r.workflow.state === 'complete' ? 'Complete' : 'In progress', `${when(r.workflow.startedOnAest)}, ${who(s.profiles, r.workflow.createdBy)}`], 'No workflows yet.'),
  ],

  workflow: (s) => workflowScreen(s),

  reports: (s) => [
    header('Reports', null, [s.templates.length > 0 && s.platforms.length > 0 ? adder('Prepare a report', form((f) => (a) => views.beginReport(a, { templateId: /** @type {any} */ (f.template), platformId: /** @type {any} */ (f.platform) }),
      select('template', 'Template', s.templates.map((/** @type {any} */ t) => [t.id, t.name])), select('platform', 'Platform', s.platforms.map((/** @type {any} */ p) => [p.id, p.name])), submit('Prepare'))) : null, adder('New template', templateForm())]),
    section('Produced', table(['Report', 'Platform', 'Produced'], s.reports, (r) => [
      h('button', { type: 'button', class: 'pv-button pv-button--link', onclick: () => act((a) => views.openReport(a, r.id)) }, r.title), r.platformName, when(r.createdAtAest)], 'No reports yet.')),
    section('Templates', table(['Name', 'Title'], s.templates, (t) => [t.name, t.title], 'No templates yet. Add one to start producing reports.')),
  ],

  'prepare-report': (s) => [
    back('Reports'),
    header(s.template.title, `On ${s.platform.name}`),
    form((f, el) => {
      /** @type {string[]} */
      const ids = [];
      el.querySelectorAll('input[name="bowtie"]:checked').forEach((i) => { ids.push(/** @type {HTMLInputElement} */ (i).value); });
      return (a) => views.produceReport(a, /** @type {any} */ (ids));
    },
    table(['Include bow-tie', 'Report ID', 'Hazard', 'Residual'], s.rows, (r) => [
      h('input', { type: 'checkbox', name: 'bowtie', value: r.hazard.id, 'aria-label': `Include the bow-tie of ${r.hazard.title}` }),
      h('span', { class: 'pv-num' }, r.reportId), r.hazard.title, band(r.residualRating, r.residual)], 'No hazards on this platform.'),
    submit(s.outOfDate.length > 0 ? 'Produce anyway' : 'Produce report')),
  ],

  report: (s) => [
    back('Reports'),
    header(s.report.title, `${s.report.platformName}, produced ${when(s.report.createdAtAest)}`,
      [button('Download HTML', (a) => views.chooseReportExportTarget(a, 'html')), button('Download Markdown', (a) => views.chooseReportExportTarget(a, 'markdown'))]),
    table(['Report ID', 'Hazard', 'Residual'], s.report.hazards, (hz) => [h('span', { class: 'pv-num' }, hz.reportId), hz.title, h('span', { class: 'pv-num' }, `${hz.residual.consequence ?? '–'}${hz.residual.likelihood ?? '–'}`)], 'No hazards.'),
  ],

  filter: (s) => [
    header('Search', 'Hazards and controls by platform, band, status, and reference.'),
    filterForm(s),
    section('Hazards', table(['ID', 'Hazard', 'Status', 'Platform', 'Residual'], s.hazards, (i) => [
      h('span', { class: 'pv-num' }, i.hazard.id), i.hazard.title, i.hazard.status, i.platform?.name ?? '—',
      i.omitted ? flag('open-item', 'omitted') : i.residualRating ? i.residualRating.band : '—'], 'Nothing matches.')),
    section('Controls', table(['Control', 'Status', 'Platform', 'Hazard', 'State'], s.controls, (i) => [
      i.control.title, i.control.status, i.platform?.name ?? '—', i.hazard?.id ?? '—', i.platformControl ? controlState(i.platformControl) : '—'], 'Nothing matches.')),
  ],

  dashboard: (s) => [header('My dashboard', 'Everything open on the platforms you own.',
    s.platforms.some((/** @type {any} */ p) => p.awaiting.length > 0) ? h('button', { type: 'button', class: 'pv-button pv-button--primary pv-button--small', onclick: () => fromHazards((a) => views.openAcknowledgements(a)) }, 'Acknowledge changes') : null),
    s.platforms.length === 0 ? h('p', { class: 'pv-empty' }, 'You own no live platform.') : s.platforms.map((/** @type {any} */ p) => platformItems(p, s.profiles))],

  'open-items': (s) => [
    header('Open items', 'Everything open, on every platform.'),
    s.platforms.map((/** @type {any} */ p) => platformItems(p, s.profiles)),
    section('On no platform',
      h('h3', {}, 'Overdue reviews'),
      s.unplaced.overdue === null ? flag('overdue', 'unknown') : list(s.unplaced.overdue, (r) => [`${KIND_NAMES[r.ref.kind] ?? r.ref.kind} ${r.ref.id} `, flag('overdue', 'overdue')], 'None.'),
      h('h3', {}, 'Workflows in progress'),
      list(s.unplaced.workflows, (r) => `${WORKFLOW_NAMES[r.workflow.workflowKind] ?? r.workflow.workflowKind}${r.subjectName ? `: ${r.subjectName}` : ''}`, 'None.')),
    section('Linked to nothing', s.unlinked === null ? flag('open-item', 'unknown')
      : list(s.unlinked, (u) => [`${KIND_NAMES[u.ref.kind] ?? u.ref.kind}: ${u.name ?? u.ref.id} `, flag('open-item', 'unlinked')], 'Every record is linked.')),
  ],
};

// ------------------------------------------------------------------ parts of screens

/** @param {readonly any[]} controls */
function controlCounts(controls) {
  const awaiting = controls.filter((c) => c.state === 'awaiting').length;
  const confirmed = controls.filter((c) => c.state === 'confirmed').length;
  if (controls.length === 0) return h('span', { class: 'pv-muted' }, 'No controls');
  return h('span', {}, `${confirmed} of ${controls.length} confirmed`, awaiting > 0 ? [' ', flag('unconfirmed', `${awaiting} awaiting`)] : null);
}

/**
 * @param {string} kind
 * @param {string} id
 */
function tempoForm(kind, id) {
  return form((f) => (a) => views.setReviewTempo(a, /** @type {any} */ ({ ref: { kind, id }, tempoMonths: Number(f.tempo), nextDueAest: f.due })),
    input('tempo', 'Review every (months)', { type: 'number', min: 1, required: true, inputmode: 'numeric' }), input('due', 'Next review due', { type: 'date', required: true }), submit('Set review', 'quiet'));
}

/**
 * @param {'initial' | 'residual'} stage
 * @param {string} title
 * @param {any} values
 * @param {any} rating
 */
function ratingForm(stage, title, values, rating) {
  const options = (/** @type {readonly (string | number)[]} */ xs, /** @type {any} */ current) => h('select', {}, [['', '–'], ...xs.map((x) => [String(x), String(x)])].map(([v, t]) => h('option', { value: v, selected: String(current ?? '') === v }, t)));
  const c = options(CONSEQUENCES, values.consequence);
  c.setAttribute('name', 'consequence');
  const l = options(LIKELIHOODS, values.likelihood);
  l.setAttribute('name', 'likelihood');
  return section(title, h('p', { class: 'pv-big' }, band(rating, values)),
    form((f) => (a) => views.enterRating(a, stage, /** @type {any} */ ({
      consequence: f.consequence === '' ? null : Number(f.consequence), likelihood: f.likelihood === '' ? null : f.likelihood,
    })),
    h('label', { class: 'pv-field' }, h('span', {}, 'Consequence'), c),
    h('label', { class: 'pv-field' }, h('span', {}, 'Likelihood'), l),
    submit('Enter', 'quiet')));
}

/** @param {string} svgText */
function svgOf(svgText) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const root = doc.documentElement;
  return root && root.nodeName.toLowerCase() === 'svg' ? document.importNode(root, true) : h('pre', {}, svgText);
}

function referenceForm() {
  return form((f, el) => {
    const file = /** @type {HTMLInputElement} */ (el.querySelector('input[name="file"]')).files?.[0] ?? null;
    const blank = (/** @type {string} */ v) => (v.trim() === '' ? null : v);
    return async (a) => views.createReference(a, /** @type {any} */ ({
      name: blank(f.name ?? ''), link: blank(f.link ?? ''), path: blank(f.path ?? ''),
      file: file ? { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) } : null,
    }));
  }, input('name', 'Name'), input('link', 'Link', { type: 'url' }), input('path', 'Path on a shared drive'),
  h('label', { class: 'pv-field' }, h('span', {}, 'File'), h('input', { type: 'file', name: 'file' })), submit('Add reference'));
}

/**
 * @param {string} kind
 * @param {string} label
 * @param {readonly any[]} options
 * @param {(x: any) => string} name
 */
function linkForm(kind, label, options, name) {
  if (options.length === 0) return null;
  return form((f) => (a) => views.linkReference(a, /** @type {any} */ ({ kind, id: f.id })), select('id', `Link to a ${label.toLowerCase()}`, options.map((x) => [x.id, name(x)])), submit('Link', 'quiet'));
}

function templateForm() {
  return form((f) => {
    // One section per line: "# text" a heading, "[hazards]" the hazards, anything else a paragraph.
    const sections = f.layout.split('\n').map((l) => l.trim()).filter((l) => l !== '').map((l) => (l === '[hazards]'
      ? { sectionKind: 'hazards' }
      : l.startsWith('#') ? { sectionKind: 'heading', text: l.replace(/^#+/, '').trim() } : { sectionKind: 'text', text: l }));
    return (a) => views.createTemplate(a, /** @type {any} */ ({ name: f.name, title: f.title, sections }));
  }, input('name', 'Template name', { required: true }), input('title', 'Report title', { required: true }),
  h('label', { class: 'pv-field pv-field--wide' }, h('span', {}, 'Layout: one section per line. Start a line with # for a heading, write [hazards] where the hazards go.'),
    h('textarea', { name: 'layout', rows: 4 }, '# Hazards\n[hazards]')),
  submit('Save template', 'quiet'));
}

/** @param {any} s */
function filterForm(s) {
  /**
   * @param {string} name
   * @param {string} label
   * @param {readonly [string, string][]} xs
   */
  const choice = (name, label, xs) => {
    const el = h('select', { name }, [['', 'Any'], ...xs].map(([v, t]) => h('option', { value: v, selected: (s.filter[name] ?? '') === v }, t)));
    return h('label', { class: 'pv-field' }, h('span', {}, label), el);
  };
  return form((f) => (a) => views.applyFilter(a, /** @type {any} */ ({
    platformId: f.platformId || null, band: f.band || null, recordStatus: f.recordStatus || null, controlState: f.controlState || null, referenceEntryId: f.referenceEntryId || null,
  })),
  choice('platformId', 'Platform', s.platforms.map((/** @type {any} */ p) => [p.id, p.name])),
  choice('band', 'Residual band', ['High', 'Serious', 'Medium', 'Low', 'Not Credible', 'Eliminated', 'Uncategorised'].map((b) => /** @type {[string, string]} */ ([b, b]))),
  choice('recordStatus', 'Status', [['live', 'Live'], ['retired', 'Retired'], ['deleted', 'Deleted']]),
  choice('controlState', 'Control state', [['confirmed', 'Confirmed'], ['excluded', 'Excluded'], ['awaiting', 'Awaiting']]),
  choice('referenceEntryId', 'Reference', s.entries.map((/** @type {any} */ e) => [e.id, e.name ?? e.link ?? e.id])),
  submit('Apply'));
}

/**
 * One platform's open items (C-046).
 * @param {any} p
 * @param {readonly any[]} profiles
 */
function platformItems(p, profiles) {
  return section(`${p.platform.name}`,
    h('p', { class: 'pv-muted' }, `Owned by ${who(profiles, p.platform.ownerProfileId)}`),
    h('div', { class: 'pv-grid' },
      h('div', {}, h('h3', {}, 'Overdue reviews'), p.overdue === null ? flag('overdue', 'unknown')
        : list(p.overdue, (r) => [r.ref.kind === 'platform' && r.ref.id === p.platform.id ? 'This platform ' : [`${KIND_NAMES[r.ref.kind] ?? r.ref.kind} `, h('span', { class: 'pv-num' }, r.ref.id), ' '],
          flag('overdue', 'overdue'), h('span', { class: 'pv-muted' }, ` since ${when(r.schedule?.nextDueAest)}`)], 'None.')),
      h('div', {}, h('h3', {}, 'Controls awaiting a ruling'), list(p.unconfirmed, (u) => [`${u.control.control.title} on ${u.hazard.title} `, flag('unconfirmed', 'awaiting')], 'None.')),
      h('div', {}, h('h3', {}, 'Workflows in progress'), list(p.workflows, (w) => `${WORKFLOW_NAMES[w.workflowKind] ?? w.workflowKind}, at ${w.currentStep}`, 'None.')),
      p.omitted.length > 0 ? h('div', {}, h('h3', {}, 'Could not be read'), list(p.omitted, (o) => [h('span', { class: 'pv-num' }, o.id), ' ', flag('open-item', 'omitted')])) : null),
    h('h3', {}, 'Changes to acknowledge'),
    list(p.awaiting, (e) => entrySummary(e, profiles), 'None.'));
}

/** @param {any} s */
function workflowScreen(s) {
  const record = s.progress.record;
  const owners = s.profiles.map((/** @type {any} */ p) => [p.id, p.name]);
  const rowOptions = (s.rows ?? []).map((/** @type {any} */ r) => [r.hazard.id, `${r.reportId} ${r.hazard.title}`]);
  const current = s.progress.current;
  const recordedHere = current ? record.entries.filter((/** @type {any} */ e) => e.step === current) : [];
  const done = current !== null && ONE_ENTRY_STEPS.includes(current) && recordedHere.length > 0;
  const rating = (/** @type {string} */ name, /** @type {string} */ label, /** @type {readonly (string | number)[]} */ xs) => select(name, label, [['', '–'], ...xs.map((x) => /** @type {[string, string]} */ ([String(x), String(x)]))]);
  /** @type {Record<string, () => any>} */
  const steps = {
    'name-the-hazard': () => form((f) => (a) => views.submitStep(a, /** @type {any} */ ({ step: 'name-the-hazard', title: f.title })), input('title', 'What is the hazard?', { required: true }), submit('Record')),
    'describe-the-hazard': () => form((f) => (a) => views.submitStep(a, /** @type {any} */ ({ step: 'describe-the-hazard', part: f.part, text: f.text })),
      select('part', 'Add a', [['causal-factor', 'Causal factor'], ['consequence', 'Consequence']]), input('text', 'Text', { required: true }), submit('Add')),
    'choose-controls': () => (s.linkableControls.length === 0 ? h('p', { class: 'pv-empty' }, 'Every control in the library is already linked.') : form((f) => (a) => views.submitStep(a, /** @type {any} */ ({ step: 'choose-controls', controlId: f.controlId, controlKind: f.controlKind })),
      select('controlId', 'Control', s.linkableControls.map((/** @type {any} */ c) => [c.id, c.title])), select('controlKind', 'Side', [['preventative', 'Preventative'], ['mitigating', 'Mitigating']]), submit('Link'))),
    'name-the-platform': () => form((f) => (a) => views.submitStep(a, /** @type {any} */ ({ step: 'name-the-platform', name: f.name, ownerProfileId: f.owner })),
      input('name', 'Platform name', { required: true }), select('owner', 'Owner', owners), submit('Record')),
    'select-hazards': () => (s.linkableHazards.length === 0 ? h('p', { class: 'pv-empty' }, 'Every hazard is already on this platform.') : form((f) => (a) => views.submitStep(a, /** @type {any} */ ({ step: 'select-hazards', hazardId: f.hazardId })),
      select('hazardId', 'Hazard', s.linkableHazards.map((/** @type {any} */ hz) => [hz.id, `${hz.id} ${hz.title}`])), submit('Bring across'))),
    'review-the-hazards': () => (rowOptions.length === 0 ? h('p', { class: 'pv-empty' }, 'This platform has no hazards to review.') : form((f) => (a) => views.submitStep(a, /** @type {any} */ ({ step: 'review-the-hazards', hazardId: f.hazardId, note: f.note })),
      select('hazardId', 'Hazard', rowOptions), input('note', 'What did you decide?', { required: true }), submit('Mark reviewed'))),
    'choose-the-control': () => {
      const confirmed = new Map();
      for (const r of s.rows ?? []) for (const pc of r.controls) if (pc.state === 'confirmed') confirmed.set(pc.control.id, pc.control.title);
      return confirmed.size === 0 ? h('p', { class: 'pv-empty' }, 'No control is confirmed on this platform.') : form((f) => (a) => views.submitStep(a, /** @type {any} */ ({ step: 'choose-the-control', controlId: f.controlId })),
        select('controlId', 'Control to remove', [...confirmed.entries()]), submit('Choose'));
    },
    'settle-the-ratings': () => ((s.demand?.outstanding ?? []).length === 0 ? null : form((f) => (a) => views.submitStep(a, /** @type {any} */ ({
      step: 'settle-the-ratings', hazardId: f.hazardId, consequence: f.consequence === '' ? null : Number(f.consequence), likelihood: f.likelihood === '' ? null : f.likelihood,
    })),
    select('hazardId', 'Hazard', (s.demand?.outstanding ?? []).map((/** @type {any} */ r) => [r.id, (s.rows ?? []).find((/** @type {any} */ x) => x.hazard.id === r.id)?.hazard.title ?? r.id])),
    rating('consequence', 'Residual consequence', CONSEQUENCES), rating('likelihood', 'Residual likelihood', LIKELIHOODS), submit('Settle'))),
    'record-the-reason': () => form((f) => (a) => views.submitStep(a, /** @type {any} */ ({ step: 'record-the-reason', text: f.text })), input('text', 'Why is the control coming off?', { required: true }), submit('Record')),
    'choose-the-owner': () => form((f) => (a) => views.submitStep(a, /** @type {any} */ ({ step: 'choose-the-owner', ownerProfileId: f.owner })), select('owner', 'New owner', owners), submit('Transfer')),
    'record-the-outcome': () => form((f) => (a) => views.completeWorkflow(a, { outcome: f.outcome }), input('outcome', 'What did this workflow produce?', { required: true }), submit('Complete workflow')),
  };
  const ready = s.demand?.satisfied === true;
  return [
    back('Workflows'),
    header(WORKFLOW_NAMES[record.workflowKind] ?? record.workflowKind, s.subjectName ? `On ${s.subjectName}` : null,
      record.state === 'complete' ? null : button('Abandon', (a) => views.abandonWorkflow(a), 'danger')),
    h('ol', { class: 'pv-steps' }, s.progress.steps.map((/** @type {string} */ step) => h('li', {
      class: step === current ? 'pv-step pv-step--current' : s.progress.done.includes(step) ? 'pv-step pv-step--done' : 'pv-step',
      'aria-current': step === current ? 'step' : null,
    }, step.replace(/-/g, ' ')))),
    record.state === 'complete'
      ? section('Complete', h('p', {}, `${when(record.completedOnAest)}, ${who(s.profiles, record.completedBy)}: ${record.outcome}`))
      : section(current ? current.replace(/-/g, ' ').replace(/^./, (/** @type {string} */ c) => c.toUpperCase()) : '',
        recordedHere.length > 0 ? list(recordedHere, (e) => h('span', {}, '✓ ', e.text), '') : null,
        done ? null : (current && steps[current] ? steps[current]() : null),
        s.demand && s.demand.outstanding.length > 0 ? h('p', { class: 'pv-muted' }, `Still to do: ${s.demand.outstanding.map((/** @type {any} */ r) => (s.rows ?? []).find((/** @type {any} */ x) => x.hazard.id === r.id)?.hazard.title ?? r.id).join(', ')}`) : null,
        current !== 'record-the-outcome' ? h('div', { class: 'pv-row' }, h('button', {
          type: 'button', class: `pv-button pv-button--${ready ? 'primary' : 'quiet'}`, onclick: () => act((a) => views.advanceStep(a)),
        }, 'Next step')) : null),
    s.rows ? section('Hazards on the platform', table(['Report ID', 'Hazard', 'Residual', 'Controls'], s.rows, (r) => [h('span', { class: 'pv-num' }, r.reportId), r.hazard.title, band(r.residualRating, r.residual), controlCounts(r.controls)], 'None yet.')) : null,
    s.hazard ? section('The hazard', h('div', { class: 'pv-grid' },
      h('div', {}, h('h3', {}, 'Causal factors'), list(s.causalFactors, (c) => c.text, 'None.')),
      h('div', {}, h('h3', {}, 'Consequences'), list(s.consequences, (c) => c.text, 'None.')),
      h('div', {}, h('h3', {}, 'Controls'), list(s.controls, (c) => `${c.control.title} (${c.controlKind})`, 'None.')))) : null,
    section('Recorded', list(record.entries, (e) => h('span', {}, h('span', { class: 'pv-muted' }, `${when(e.atAest)}, ${who(s.profiles, e.byProfileId)}: `), `${e.step.replace(/-/g, ' ')} — ${e.text}`), 'Nothing recorded yet.')),
  ];
}

// ------------------------------------------------------------------ drawing

const STYLE = `
:root {
  --pv-bg: #f5f7f9; --pv-surface: #ffffff; --pv-sidebar: #eaeef2; --pv-ink: #16202b; --pv-muted: #5d6b78; --pv-line: #d8dee4;
  --pv-accent: #1e5a8c; --pv-accent-ink: #ffffff; --pv-danger: #a1261d; --pv-focus: #1e5a8c;
  --pv-error: #a1261d; --pv-warning: #8a5a00; --pv-info: #1e5a8c;
  color-scheme: light;
}
:root[data-theme="dark"] {
  --pv-bg: #0f151b; --pv-surface: #161e26; --pv-sidebar: #121a21; --pv-ink: #e3e9ef; --pv-muted: #93a1ae; --pv-line: #2a3642;
  --pv-accent: #6fa8dc; --pv-accent-ink: #0f151b; --pv-danger: #f0877e; --pv-focus: #6fa8dc;
  --pv-error: #f0877e; --pv-warning: #e8b964; --pv-info: #6fa8dc;
  color-scheme: dark;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --pv-bg: #0f151b; --pv-surface: #161e26; --pv-sidebar: #121a21; --pv-ink: #e3e9ef; --pv-muted: #93a1ae; --pv-line: #2a3642;
    --pv-accent: #6fa8dc; --pv-accent-ink: #0f151b; --pv-danger: #f0877e; --pv-focus: #6fa8dc;
    --pv-error: #f0877e; --pv-warning: #e8b964; --pv-info: #6fa8dc;
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
body { margin: 0; font-family: "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif; font-size: 14px; line-height: 1.45; color: var(--pv-ink); background: var(--pv-bg); }
h1, h2, h3 { line-height: 1.25; margin: 0; font-weight: 600; }
h1 { font-size: 21px; letter-spacing: -0.01em; }
h2 { font-size: 15px; }
h3 { font-size: 13px; margin-top: 8px; color: var(--pv-muted); font-weight: 600; }
p { margin: 0; }
.pv-num { font-variant-numeric: tabular-nums; }
.pv-muted { color: var(--pv-muted); }
.pv-empty { color: var(--pv-muted); padding: 4px 0; }

.pivot-topbar { z-index: 2; }
.pv-brand { font-weight: 700; letter-spacing: 0.02em; }
.pv-topbar__folder { opacity: 0.75; font-size: 13px; padding-left: 12px; border-left: 1px solid rgba(255,255,255,0.3); }
.pv-theme { background: transparent; color: inherit; border: 1px solid rgba(255,255,255,0.35); border-radius: 4px; padding: 3px 10px; font: inherit; font-size: 12px; cursor: pointer; }

.pv-frame { display: grid; grid-template-columns: 184px minmax(0, 1fr); min-height: calc(100vh - var(--pivot-topbar-height)); }
.pv-frame--bare { grid-template-columns: minmax(0, 1fr); }
.pv-sidebar { background: var(--pv-sidebar); border-right: 1px solid var(--pv-line); padding: 12px 8px; display: flex; flex-direction: column; gap: 8px; }
.pv-sidebar ul { list-style: none; margin: 0; padding: 0; }
.pv-nav { display: block; width: 100%; text-align: left; background: none; border: 0; border-radius: 4px; padding: 5px 10px; font: inherit; color: var(--pv-ink); cursor: pointer; }
.pv-nav:hover { background: var(--pv-surface); }
.pv-nav--current { background: var(--pv-surface); font-weight: 600; box-shadow: inset 3px 0 0 var(--pv-accent); }
.pv-sidebar__foot { margin-top: auto; display: flex; flex-direction: column; gap: 6px; }
.pv-unsaved { color: var(--pv-warning); font-weight: 600; font-size: 13px; }
.pv-save { width: 100%; }

.pv-main { padding: 16px 24px 40px; max-width: 1180px; width: 100%; }
.pv-head { display: flex; gap: 16px; align-items: flex-end; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px solid var(--pv-line); margin-bottom: 8px; }
.pv-head__aside { color: var(--pv-muted); margin-top: 2px; font-size: 13px; }
.pv-head__actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.pv-back { background: none; border: 0; padding: 0; margin-bottom: 4px; color: var(--pv-accent); font: inherit; font-size: 13px; cursor: pointer; }
.pv-section { padding: 10px 0; border-bottom: 1px solid var(--pv-line); }
.pv-section > h2 { margin-bottom: 4px; }
.pv-section > .pv-adder { margin-top: 4px; }
.pv-sub { margin: 8px 0 12px; }
.pv-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0 32px; }
.pv-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 8px; }
.pv-row--spread { justify-content: space-between; align-items: flex-start; }
.pv-list { list-style: none; padding: 0; margin: 4px 0; }
.pv-list > li { padding: 4px 0; border-bottom: 1px solid var(--pv-line); }
.pv-list > li:last-child { border-bottom: 0; }
.pv-big { font-size: 18px; margin: 2px 0 4px; }
.pv-facts { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 0 0 8px; }
.pv-facts dt { color: var(--pv-muted); }
.pv-facts dd { margin: 0; overflow-wrap: anywhere; }

.pv-table-wrap { overflow-x: auto; }
.pv-table { width: 100%; border-collapse: collapse; margin: 4px 0; }
.pv-table th { text-align: left; font-weight: 600; font-size: 12px; color: var(--pv-muted); padding: 4px 12px 4px 0; border-bottom: 2px solid var(--pv-line); }
.pv-table td { padding: 5px 12px 5px 0; border-bottom: 1px solid var(--pv-line); vertical-align: top; }
.pv-table tbody tr:hover { background: var(--pv-sidebar); }
.pv-table--fixed { table-layout: fixed; }
.pv-table--fixed td { overflow: hidden; text-overflow: ellipsis; }
.pv-table th { position: relative; user-select: none; }
.pv-sort { background: none; border: 0; padding: 0; font: inherit; color: inherit; cursor: pointer; display: inline-flex; gap: 4px; align-items: center; text-align: left; }
.pv-sort:hover { color: var(--pv-ink); }
.pv-sort__mark { font-size: 9px; color: var(--pv-accent); min-width: 8px; }
.pv-grip { position: absolute; top: 0; right: 0; width: 7px; height: 100%; cursor: col-resize; touch-action: none; }
.pv-grip::after { content: ""; position: absolute; top: 25%; bottom: 25%; right: 3px; border-right: 1px solid var(--pv-line); }
.pv-grip:hover::after { border-right: 2px solid var(--pv-accent); }

.pv-form { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: flex-end; margin: 8px 0; }
.pv-field { display: flex; flex-direction: column; gap: 2px; font-size: 13px; color: var(--pv-muted); }
.pv-field--wide { flex-basis: 100%; }
.pv-field input, .pv-field select, .pv-field textarea { font: inherit; font-size: 14px; color: var(--pv-ink); background: var(--pv-surface); border: 1px solid var(--pv-line); border-radius: 4px; padding: 4px 8px; min-width: 12rem; }
.pv-field textarea { width: 100%; font-family: inherit; }
.pv-button { font: inherit; font-size: 13px; border-radius: 4px; padding: 5px 12px; cursor: pointer; border: 1px solid var(--pv-line); background: var(--pv-surface); color: var(--pv-ink); }
.pv-button--primary { background: var(--pv-accent); border-color: var(--pv-accent); color: var(--pv-accent-ink); font-weight: 600; }
.pv-button--danger { color: var(--pv-danger); border-color: var(--pv-danger); background: transparent; }
.pv-button--link { border: 0; background: none; padding: 0; color: var(--pv-accent); text-align: left; text-decoration: underline; text-underline-offset: 2px; }
button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, summary:focus-visible { outline: 2px solid var(--pv-focus); outline-offset: 2px; }
.pv-details summary { cursor: pointer; color: var(--pv-accent); }
.pv-details[open] { padding-bottom: 4px; }
.pv-details dl { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 4px 0 0; font-size: 13px; }
.pv-details dt { color: var(--pv-muted); }
.pv-details dd { margin: 0; overflow-wrap: anywhere; }
.pv-entry > div { margin-bottom: 2px; }
.pv-button--small { font-size: 12px; padding: 3px 10px; }
.pv-adder { position: relative; display: inline-block; }
.pv-adder > summary { list-style: none; display: inline-block; }
.pv-adder > summary::-webkit-details-marker { display: none; }
.pv-adder > summary::before { content: "+ "; }
.pv-adder[open] > summary { background: var(--pv-sidebar); }
.pv-panel { position: absolute; right: 0; top: calc(100% + 4px); z-index: 5; background: var(--pv-surface); border: 1px solid var(--pv-line); border-radius: 6px; padding: 10px 12px; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18); min-width: 20rem; }
.pv-section .pv-panel { left: 0; right: auto; }
.pv-panel .pv-form { margin: 0; }
.pv-find { font: inherit; font-size: 13px; color: var(--pv-ink); background: var(--pv-surface); border: 1px solid var(--pv-line); border-radius: 4px; padding: 3px 8px; width: 14rem; }
.pv-manage { margin-top: 10px; font-size: 13px; }
.pv-divider { border: 0; border-top: 1px solid var(--pv-line); margin: 4px 10px; }
.pv-by { font-size: 13px; }

.pv-messages { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.pv-message { border: 1px solid var(--pv-line); border-left: 4px solid var(--pv-info); background: var(--pv-surface); border-radius: 4px; padding: 10px 14px; }
.pv-message--error { border-left-color: var(--pv-error); }
.pv-message--warning { border-left-color: var(--pv-warning); }
.pv-message__headline { font-weight: 600; }
.pv-message ul { margin: 4px 0; padding-left: 18px; }
.pv-message__next { color: var(--pv-muted); }

.pv-welcome { max-width: 32rem; margin: 10vh auto 0; display: flex; flex-direction: column; gap: 14px; }
.pv-welcome h1 { font-size: 30px; }
.pv-choices { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 8px; }

.pv-steps { list-style: none; counter-reset: step; display: flex; flex-wrap: wrap; gap: 4px; padding: 0; margin: 0 0 8px; }
.pv-step { counter-increment: step; padding: 6px 12px 6px 8px; border-radius: 4px; color: var(--pv-muted); background: var(--pv-sidebar); font-size: 13px; }
.pv-step::before { content: counter(step) ". "; font-variant-numeric: tabular-nums; }
.pv-step--done { color: var(--pv-ink); }
.pv-step--done::before { content: "✓ "; }
.pv-step--current { background: var(--pv-accent); color: var(--pv-accent-ink); font-weight: 600; }

.pv-figure { background: #ffffff; border: 1px solid var(--pv-line); border-radius: 4px; padding: 12px; overflow: auto; }
.pv-figure svg { max-width: 100%; height: auto; }
body[aria-busy] { cursor: progress; }

@media (max-width: 760px) {
  .pv-frame { grid-template-columns: minmax(0, 1fr); }
  .pv-sidebar { border-right: 0; border-bottom: 1px solid var(--pv-line); padding: 8px; }
  .pv-sidebar ul { display: flex; overflow-x: auto; gap: 4px; }
  .pv-nav { white-space: nowrap; }
  .pv-main { padding: 16px; }
  .pv-head { flex-direction: column; align-items: flex-start; }
}
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto; } }
`;

function applyTheme() {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}

function draw() {
  const root = document.getElementById('pivot');
  if (!root || app === null) return;
  const screen = /** @type {any} */ (app.screen);
  const body = SCREENS[screen.kind] ? SCREENS[screen.kind](screen) : h('p', {}, `No drawing for the ${screen.kind} screen.`);
  const side = sidebar(screen);
  root.replaceChildren(topBar(screen), h('div', { class: side ? 'pv-frame' : 'pv-frame pv-frame--bare' }, side, h('main', { class: 'pv-main' }, messages(screen), body)));
  applyFind();
}

async function boot() {
  document.head.append(h('style', {}, STYLE));
  app = await views.start();
  draw();
}

if (typeof document !== 'undefined') boot();
