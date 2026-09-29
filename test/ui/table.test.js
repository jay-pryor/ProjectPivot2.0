import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataTable } from '../../src/ui/screens/table.js';
import { initialState } from '../../src/ui/controller.js';

const rows = [
  { id: 'a', name: 'Fire', n: 10, kind: 'x', status: 'live' },
  { id: 'b', name: 'flood', n: 2, kind: 'y', status: 'retired' },
  { id: 'c', name: 'Wind', n: 1, kind: 'x', status: 'live' },
];
const columns = [
  { key: 'name', label: 'Name', value: (r) => r.name, filter: 'text' },
  { key: 'n', label: 'Number', value: (r) => r.n },
  { key: 'kind', label: 'Kind', value: (r) => r.kind, filter: 'select', options: [['x', 'X'], ['y', 'Y']] },
  { key: 'status', label: 'Status', value: (r) => r.status, filter: 'select', options: [['live', 'Live'], ['retired', 'Retired'], ['any', 'Any']], defaultFilter: 'live', match: (r, v) => v === 'any' || r.status === v },
];
const state = (tables = {}, prefs = undefined) => ({ ...initialState(), profiles: [{ id: 'u1', name: 'Ada', createdAt: '', prefs }], profileId: 'u1', tables });
const shown = (html) => [...html.matchAll(/<tr data-row="([^"]+)"/g)].map((m) => m[1]);
const render = (st) => dataTable(st, { id: 't', columns, rows, rowKey: (r) => r.id }).toString();

test('every header carries a sort button; filters sit in the header, text or a list', () => {
  const out = render(state());
  assert.match(out, /<th data-col="name"[\s\S]*?data-action="sortTable" data-table="t" data-key="name"/);
  assert.match(out, /<input class="col-filter" data-input="filterTable" data-table="t" data-key="name"/);
  assert.match(out, /<select class="col-filter" name="value" data-change="filterTable" data-table="t" data-key="kind"/);
  assert.doesNotMatch(out, /data-key="n"[^>]*class="col-filter"|class="col-filter"[^>]*data-key="n"/, 'a column without a filter has none');
});

test('a default filter applies until changed: live rows only', () => {
  assert.deepEqual(shown(render(state())), ['a', 'c']);
  assert.deepEqual(shown(render(state({ t: { filters: { status: 'any' } } }))), ['a', 'b', 'c']);
});

test('text filters match anywhere, ignoring case; list filters match exactly; together they narrow', () => {
  assert.deepEqual(shown(render(state({ t: { filters: { status: 'any', name: 'FL' } } }))), ['b']);
  assert.deepEqual(shown(render(state({ t: { filters: { status: 'any', kind: 'x' } } }))), ['a', 'c']);
  assert.deepEqual(shown(render(state({ t: { filters: { kind: 'x', name: 'w' } } }))), ['c']);
});

test('sorting: text ignoring case, numbers as numbers, either way; the header shows which', () => {
  const byName = render(state({ t: { sort: { key: 'name', dir: 'asc' }, filters: { status: 'any' } } }));
  assert.deepEqual(shown(byName), ['a', 'b', 'c']);
  assert.match(byName, /data-key="name"[^>]*aria-sort="ascending"|aria-sort="ascending"[^>]*data-key="name"/);
  assert.deepEqual(shown(render(state({ t: { sort: { key: 'n', dir: 'asc' }, filters: { status: 'any' } } }))), ['c', 'b', 'a']);
  assert.deepEqual(shown(render(state({ t: { sort: { key: 'n', dir: 'desc' }, filters: { status: 'any' } } }))), ['a', 'b', 'c']);
});

test('columns can be resized: a drag handle per column, and widths from the profile', () => {
  const out = render(state({}, { columnWidths: { 't.name': 250 } }));
  assert.match(out, /<col data-col="name" style="width:250px"/);
  assert.match(out, /<span class="col-resize" data-resize data-table="t" data-key="n"/);
});

test('the table spans the page: one fill column takes the leftover space, the rest keep exact widths', () => {
  const out = render(state({}, { columnWidths: { 't.name': 250 } }));
  const widths = [...out.matchAll(/<col data-col="[^"]+"[^>]*data-width="(\d+)"/g)].map((m) => Number(m[1]));
  assert.equal(widths.length, columns.length, 'a column with no width given gets the default');
  const total = widths.reduce((a, b) => a + b, 0);
  assert.match(out, new RegExp(`<table class="grid" data-table="t" style="width:100%;min-width:${total}px">`), 'never narrower than its columns');
  // name was narrowed to 250, so the widest column (the first at the default 320) fills
  assert.match(out, /<col data-col="n" data-grow data-width="320">/, 'the fill column has no fixed width');
  assert.match(out, /<col data-col="name" style="width:250px" data-width="250">/);
  assert.match(out, /<col data-col="kind" style="width:320px" data-width="320">/, 'ties go to the first');
});

test('a column can ask to be the fill column', () => {
  const cols = columns.map((c) => (c.key === 'status' ? { ...c, grow: true } : c));
  const out = dataTable(state(), { id: 't', columns: cols, rows, rowKey: (r) => r.id }).toString();
  assert.match(out, /<col data-col="status" data-grow data-width="320">/);
  assert.match(out, /<col data-col="name" style="width:320px" data-width="320">/);
});

test('nothing matching says so, and the filters stay so they can be cleared', () => {
  const out = render(state({ t: { filters: { name: 'zzz' } } }));
  assert.deepEqual(shown(out), []);
  assert.match(out, /No rows match the filters/);
  assert.match(out, /data-input="filterTable"[^>]*value="zzz"/);
});

test('a column never renders narrower than its minimum, whatever the profile says', () => {
  const cols = [{ key: 'id', label: 'Report ID', value: (r) => r.id, width: 300, minWidth: 180 }];
  const out = dataTable(state({}, { columnWidths: { 't.id': 60 } }), { id: 't', columns: cols, rows, rowKey: (r) => r.id }).toString();
  assert.match(out, /<col data-col="id" data-grow data-width="180">/);
  assert.match(out, /style="width:100%;min-width:180px"/);
  assert.match(out, /data-resize data-table="t" data-key="id" data-min="180"/);
});

test('the default column width is doubled to 320px', async () => {
  const { DEFAULT_WIDTH } = await import('../../src/ui/screens/table.js');
  assert.equal(DEFAULT_WIDTH, 320);
});
