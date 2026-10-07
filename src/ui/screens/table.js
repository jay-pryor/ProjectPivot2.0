import { html, raw } from '../html.js';
import { dataAttrs, option } from './common.js';
import { columnWidth } from '../prefs.js';

/**
 * One table for every list in Pivot: each header sorts its column and, where it makes sense,
 * filters it, and every column can be dragged to a new width, remembered on the profile. The
 * table spans the page: one fill column takes whatever width the others leave.
 *
 * @typedef {object} Column
 * @property {string} key
 * @property {string} label
 * @property {(row: any) => unknown} [value] what the column sorts and text-filters by
 * @property {(row: any) => unknown} [render] what the cell shows (default: the value)
 * @property {'text' | 'select'} [filter]
 * @property {[string, string][]} [options] a select filter's [value, label] choices ("Any" is added)
 * @property {string} [defaultFilter] applies until the user changes it
 * @property {(row: any, value: string, filters: Record<string, string>) => boolean} [match]
 * @property {number} [width] starting width in px
 * @property {number} [minWidth] never narrower than this, so its content does not wrap badly
 * @property {boolean} [sortable] default true
 * @property {boolean} [grow] this column fills the table's leftover width (default: the widest column)
 * @property {string} [className] a class on the column's header and cells (a tint, an alignment);
 *   `row-out` makes it a gutter beside the table, unbordered, for a button at the end of each row
 * @property {boolean} [fixed] keeps its width: no handle to drag
 * @property {(row: any) => string} [merge] rows next to each other, as shown, with the same key
 *   share one cell in this column, its content shown once in the middle (rows shown by group)
 */

/** A column's width when neither the table nor the profile gives one. */
export const DEFAULT_WIDTH = 320;
/** The narrowest a column may be, unless the column says otherwise. */
export const DEFAULT_MIN_WIDTH = 80;

/** @param {unknown} v */
const text = (v) => (v == null ? '' : String(v));

/** @param {unknown} a @param {unknown} b */
function compare(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true });
}

/** @param {Column} c @param {any} row */
const valueOf = (c, row) => (c.value ? c.value(row) : undefined);

/**
 * The rows a table shows, after its filters (defaults, then the user's) and its sort.
 * @param {any} state @param {{ id: string, columns: Column[], rows: any[] }} spec
 */
function rowsView(state, { id, columns, rows }) {
  const t = state.tables?.[id] ?? {};
  /** @type {Record<string, string>} */
  const filters = {};
  for (const c of columns) if (c.defaultFilter) filters[c.key] = c.defaultFilter;
  Object.assign(filters, t.filters ?? {});
  let shown = rows.filter((row) => columns.every((c) => {
    const v = filters[c.key];
    if (!c.filter || !v) return true;
    if (c.match) return c.match(row, v, filters);
    const cell = text(valueOf(c, row));
    return c.filter === 'text' ? cell.toLowerCase().includes(v.toLowerCase()) : cell === v;
  }));
  const sortCol = t.sort && columns.find((c) => c.key === t.sort.key);
  if (sortCol) {
    const sign = t.sort.dir === 'desc' ? -1 : 1;
    shown = [...shown].sort((a, b) => sign * compare(valueOf(sortCol, a), valueOf(sortCol, b)));
  }
  return { t, filters, shown };
}

/** Exactly the rows `dataTable` shows for the same state and spec, in its order. @param {any} state @param {{ id: string, columns: Column[], rows: any[] }} spec */
export function shownRows(state, spec) {
  return rowsView(state, spec).shown;
}

/**
 * @param {any} state
 * @param {{ id: string, columns: Column[], rows: any[], rowKey: (row: any) => string, empty?: string, tools?: any, rowAttrs?: (row: any) => Record<string, unknown>, rowEnd?: (row: any) => unknown,
 *   rowClass?: (row: any) => string, children?: (row: any) => any[] }} spec
 *   tools: something small (a + button) shown beside the first column's title; rowAttrs: data
 *   attributes for a row, such as a double-click that opens its record; rowEnd: something small
 *   (an Options button) beside each row, in a gutter outside the table's border; rowClass: a
 *   class for a row; children: rows shown straight after a row, in their own order, neither
 *   sorted nor filtered with the rest (a bundle's changes, when it is open)
 */
export function dataTable(state, { id, columns: own, rows, rowKey, empty = 'Nothing here yet.', tools = '', rowAttrs, rowEnd, rowClass, children }) {
  /** @type {Column[]} */
  const columns = rowEnd ? [...own, { key: 'options', label: '', width: 100, minWidth: 100, sortable: false, fixed: true, className: 'row-out', render: rowEnd }] : own;
  const minOf = (/** @type {Column} */ c) => c.minWidth ?? DEFAULT_MIN_WIDTH;
  const { t, filters, shown } = rowsView(state, { id, columns, rows });
  const filtering = columns.some((c) => c.filter && filters[c.key] && filters[c.key] !== c.defaultFilter);
  const head = columns.map((c, i) => {
    const sorted = t.sort?.key === c.key ? t.sort.dir : null;
    const ariaSort = sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none';
    const control = c.filter === 'text'
      ? html`<input class="col-filter" ${dataAttrs({ input: 'filterTable', table: id, key: c.key })} value="${filters[c.key] ?? ''}" placeholder="Filter…" aria-label="Filter ${c.label}">`
      : c.filter === 'select'
        ? html`<select class="col-filter" name="value" ${dataAttrs({ change: 'filterTable', table: id, key: c.key })} aria-label="Filter ${c.label}">
            ${(c.options ?? []).some(([v]) => v === 'any') ? '' : html`<option value="">Any</option>`}
            ${(c.options ?? []).map(([v, l]) => option(v, l, filters[c.key] ?? ''))}</select>`
        : '';
    const label = c.sortable === false
      ? html`<span class="th-label">${c.label}</span>`
      : html`<button type="button" class="sort" ${dataAttrs({ action: 'sortTable', table: id, key: c.key })} aria-sort="${ariaSort}">${c.label}<span class="arrow" aria-hidden="true">${sorted === 'asc' ? '▲' : sorted === 'desc' ? '▼' : '↕'}</span></button>`;
    const resize = c.fixed ? '' : html`<span class="col-resize" data-resize ${dataAttrs({ table: id, key: c.key, min: minOf(c) })} title="Drag to resize"></span>`;
    return html`<th data-col="${c.key}"${c.className ? html` class="${c.className}"` : ''}><div class="th"><div class="th-title">${label}${i === 0 ? tools : ''}</div>${control}</div>${resize}</th>`;
  });
  // By default the table spans the page: every column but one keeps its exact width, so dragging it
  // moves only that column, and the fill column (no fixed width) takes what is left, its own width
  // being the least it takes. Once someone gives the fill column a width of their own, the table is
  // exactly as wide as its columns, so it can be narrower than the page. Either way, past the
  // window's width it scrolls rather than squeezing a column.
  const widths = columns.map((c) => Math.max(minOf(c), (c.fixed ? null : columnWidth(state, id, c.key)) ?? c.width ?? DEFAULT_WIDTH));
  const defaults = columns.map((c) => Math.max(minOf(c), c.width ?? DEFAULT_WIDTH));
  const asked = columns.findIndex((c) => c.grow);
  const fill = asked >= 0 ? asked : defaults.indexOf(Math.max(...defaults.map((w, i) => (columns[i].fixed ? 0 : w))));
  const stretch = columnWidth(state, id, columns[fill].key) == null;
  const cols = columns.map((c, i) => (i === fill && stretch
    ? html`<col data-col="${c.key}" data-grow data-width="${widths[i]}">`
    : html`<col data-col="${c.key}" style="width:${raw(String(widths[i]))}px" data-width="${widths[i]}"${i === fill ? raw(' data-fill') : ''}>`));
  const total = widths.reduce((a, b) => a + b, 0);
  const size = stretch ? `width:100%;min-width:${total}px` : `width:${total}px`;
  const gutter = columns.some((c) => c.className === 'row-out');
  const list = shown.flatMap((row) => [row, ...(children ? children(row) : [])]);
  // A merging column: the first of a run of rows with the same key spans the run (0: covered by it).
  const spans = columns.map((c) => {
    if (!c.merge) return null;
    const keys = list.map((row) => /** @type {(row: any) => string} */ (c.merge)(row));
    return keys.map((k, r) => {
      if (r > 0 && keys[r - 1] === k) return 0;
      let n = 1;
      while (r + n < keys.length && keys[r + n] === k) n += 1;
      return n;
    });
  });
  return html`<div class="table-wrap"><table class="grid${gutter ? ' has-gutter' : ''}" data-table="${id}"${stretch ? '' : raw(' data-fit')} style="${raw(size)}">
    <colgroup>${cols}</colgroup>
    <thead><tr>${head}</tr></thead>
    <tbody>${list.map((row, r) => {
      const cls = rowClass ? rowClass(row) : '';
      const attrs = rowAttrs ? rowAttrs(row) : {};
      return html`<tr data-row="${rowKey(row)}"${cls ? html` class="${cls}"` : ''}${Object.keys(attrs).length ? html` ${dataAttrs(attrs)}` : ''}>${columns.map((c, i) => {
        const span = spans[i]?.[r] ?? 1;
        if (span === 0) return '';
        const classes = [c.className, span > 1 ? 'merged' : ''].filter(Boolean).join(' ');
        return html`<td${classes ? html` class="${classes}"` : ''}${span > 1 ? html` rowspan="${span}"` : ''}>${c.render ? c.render(row) : text(valueOf(c, row))}</td>`;
      })}</tr>`;
    })}</tbody>
  </table></div>
  ${shown.length ? '' : html`<p class="muted">${filtering ? 'No rows match the filters.' : empty}</p>`}`;
}
