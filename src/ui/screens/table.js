import { html, raw } from '../html.js';
import { dataAttrs, option } from './common.js';
import { columnWidth } from '../prefs.js';

/**
 * One table for every list in Pivot: each header sorts its column and, where it makes sense,
 * filters it, and every column can be dragged to a new width, remembered on the profile.
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
 * @property {boolean} [sortable] default true
 */

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
 * @param {any} state
 * @param {{ id: string, columns: Column[], rows: any[], rowKey: (row: any) => string, empty?: string }} spec
 */
export function dataTable(state, { id, columns, rows, rowKey, empty = 'Nothing here yet.' }) {
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

  const filtering = columns.some((c) => c.filter && filters[c.key] && filters[c.key] !== c.defaultFilter);
  const head = columns.map((c) => {
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
    return html`<th data-col="${c.key}"><div class="th">${label}${control}</div><span class="col-resize" data-resize ${dataAttrs({ table: id, key: c.key })} title="Drag to resize"></span></th>`;
  });
  const cols = columns.map((c) => {
    const w = columnWidth(state, id, c.key) ?? c.width;
    return w ? html`<col data-col="${c.key}" style="width:${raw(String(w))}px">` : html`<col data-col="${c.key}">`;
  });
  return html`<div class="table-wrap"><table class="grid" data-table="${id}">
    <colgroup>${cols}</colgroup>
    <thead><tr>${head}</tr></thead>
    <tbody>${shown.map((row) => html`<tr data-row="${rowKey(row)}">${columns.map((c) => html`<td>${c.render ? c.render(row) : text(valueOf(c, row))}</td>`)}</tr>`)}</tbody>
  </table></div>
  ${shown.length ? '' : html`<p class="muted">${filtering ? 'No rows match the filters.' : empty}</p>`}`;
}
