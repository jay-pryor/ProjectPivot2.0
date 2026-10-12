import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, MM } from '../../DocGen/doc-layout.js';
import { normaliseStyle } from '../../DocGen/doc-style.js';
import { textWidth } from '../../DocGen/doc-fonts.js';

/** Tables in a style with no footer: the page-number footer sits in the bottom margin by design. */
const style = (tables = {}) => normaliseStyle({ tables, headerFooter: { footer: { centre: '' } } }).style;
const cell = (text) => [{ text }];
const tbl = (rows, extra = {}) => ({ kind: 'table', anchor: 'tbl-t', caption: { runs: [{ text: 'Table 1: Things' }] }, columns: [{}, {}, {}],
  header: [cell('ID'), cell('Name'), cell('Notes')], rows: rows.map((r) => r.map(cell)), ...extra });
const doc = (blocks) => ({ title: 'T', meta: { title: 'T' }, blocks });
const texts = (p) => p.items.filter((i) => i.kind === 'text');
const W = 595.28 - 50 * MM;

test('a table fills the text width; every cell\'s text stays inside its column', () => {
  const r = layout(doc([tbl([['HAZ-001', 'Fire', 'Short'], ['HAZ-002', 'Flood', 'A much longer note that will need to wrap across a few lines in its column']])]), style());
  const fills = r.pages[0].items.filter((i) => i.kind === 'fill');
  const headFill = fills[0];
  assert.ok(Math.abs(headFill.w - W) < 0.5 || fills.length >= 3, 'header row shaded across the table');
  const rules = r.pages[0].items.filter((i) => i.kind === 'rule');
  const xs = [...new Set(rules.filter((l) => l.x1 === l.x2).map((l) => Math.round(l.x1 * 10) / 10))].sort((a, b) => a - b);
  assert.equal(xs.length, 4, 'all borders: four vertical lines for three columns');
  assert.ok(Math.abs(xs[3] - xs[0] - W) < 0.5);
  const tableBottom = Math.max(...rules.filter((l) => l.y1 === l.y2).map((l) => l.y1));
  for (const t of texts(r.pages[0]).filter((x) => x.y < tableBottom)) { // the caption below is not in a column
    const col = xs.findIndex((x, i) => i < 3 && t.x >= x - 0.01 && t.x < xs[i + 1]);
    if (col === -1) continue;
    assert.ok(t.x + textWidth(t.font, t.size, t.text) <= xs[col + 1] + 0.01, `"${t.text}" overruns its column`);
  }
});

test('the header row repeats on every page a long table runs onto, and nothing below the margin', () => {
  const rows = Array.from({ length: 120 }, (_, i) => [`HAZ-${i}`, `Row ${i}`, 'note']);
  const r = layout(doc([tbl(rows)]), style());
  assert.ok(r.pages.length >= 3);
  for (const p of r.pages) {
    assert.ok(texts(p).some((t) => t.text === 'Notes'), 'header on this page');
    for (const t of texts(p)) if (!/Page|of/.test(t.text)) assert.ok(t.y < 841.89 - 25 * MM + 0.01);
  }
  const all = r.pages.flatMap(texts).map((t) => t.text);
  for (let i = 0; i < 120; i++) assert.ok(all.includes(`HAZ-${i}`), `row ${i} is there`);
});

test('not repeating the header, when the style says so', () => {
  const r = layout(doc([tbl(Array.from({ length: 120 }, (_, i) => [`H${i}`, 'x', 'y']))]), style({ header: { repeat: false } }));
  assert.equal(r.pages.filter((p) => texts(p).some((t) => t.text === 'Notes')).length, 1);
});

test('border styles: horizontal only, outer frame, none', () => {
  const rules = (b) => layout(doc([tbl([['a', 'b', 'c'], ['d', 'e', 'f']])]), style({ borders: b })).pages[0].items.filter((i) => i.kind === 'rule');
  assert.ok(rules('horizontal').every((l) => l.y1 === l.y2));
  const outer = rules('outer');
  assert.equal(outer.filter((l) => l.x1 === l.x2).length, 2);
  assert.equal(outer.filter((l) => l.y1 === l.y2).length, 2);
  assert.equal(rules('none').length, 0);
});

test('banded rows and the first column take their fills; the first column is bold', () => {
  const r = layout(doc([tbl([['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i']])]), style({ banding: { on: true, fill: '#eeeeee' }, firstColumn: { on: true, fill: '#dddddd', bold: true } }));
  const fills = r.pages[0].items.filter((i) => i.kind === 'fill').map((f) => f.colour);
  assert.ok(fills.includes('#eeeeee'));
  assert.ok(fills.includes('#dddddd'));
  assert.equal(texts(r.pages[0]).find((t) => t.text === 'd').font, 'Helvetica-Bold');
  assert.equal(texts(r.pages[0]).find((t) => t.text === 'e').font, 'Helvetica');
});

test('given widths are kept as fractions of the text width', () => {
  const r = layout(doc([tbl([['a', 'b', 'c']], { columns: [{ width: 0.2 }, { width: 0.3 }, { width: 0.5 }] })]), style());
  const xs = [...new Set(r.pages[0].items.filter((i) => i.kind === 'rule' && i.x1 === i.x2).map((l) => l.x1))].sort((a, b) => a - b);
  assert.ok(Math.abs(xs[1] - xs[0] - 0.2 * W) < 0.5 && Math.abs(xs[2] - xs[1] - 0.3 * W) < 0.5);
});

test('the caption goes below by default and above when asked, and the table is a link target', () => {
  const at = (pos) => { const r = layout(doc([tbl([['a', 'b', 'c']])]), style({ captionPosition: pos })); const t = texts(r.pages[0]);
    return [t.find((x) => x.text === 'Things').y, t.find((x) => x.text === 'ID').y, r.anchors['tbl-t']]; };
  const [capBelow, headBelow, anchor] = at('below');
  assert.ok(capBelow > headBelow);
  const [capAbove, headAbove] = at('above');
  assert.ok(capAbove < headAbove);
  assert.equal(anchor.page, 0);
});

test('a cell taller than a page is cut, and says so; the table still ends', () => {
  const huge = Array.from({ length: 400 }, (_, i) => `line ${i}`).join(' ');
  const r = layout(doc([{ ...tbl([['a', huge, 'c']]), rows: [[cell('a'), Array.from({ length: 300 }, (_, i) => [{ text: `L${i}` }, { br: true }]).flat(), cell('c')]] }]), style());
  const all = r.pages.flatMap(texts).map((t) => t.text).join(' ');
  assert.match(all, /continues beyond the page/);
  assert.ok(r.pages.length < 6);
});

test('a title row spans the table above the header', () => {
  const r = layout(doc([tbl([['a', 'b', 'c']], { titleRow: [{ text: 'Removed packages' }] })]), style());
  const t = texts(r.pages[0]);
  assert.ok(t.find((x) => x.text === 'Removed').y < t.find((x) => x.text === 'ID').y);
});

test('a table too wide for every word keeps the data whole and wraps the long headings instead', () => {
  const heads = ['Hazard', 'ID', 'Control measure', 'Tier', 'Description', 'Kind', 'Recommendation', 'Justification', 'Status', 'Reason rejected'];
  const row = ['HAZ-007', 'C-001', 'Fixed fire suppression', '', '', 'preventative', '', '', 'Recommended', ''];
  const b = { kind: 'table', columns: heads.map(() => ({})), header: heads.map(cell), rows: Array.from({ length: 3 }, () => row.map(cell)) };
  const r = layout(doc([b]), style());
  const words = new Set(texts(r.pages[0]).map((t) => t.text));
  for (const w of ['HAZ-007', 'C-001', 'suppression', 'preventative', 'Recommended']) assert.ok(words.has(w), `${w} is broken across lines`);
});

test('when even the data cannot all fit, only the widest columns are squeezed; short words stay whole', () => {
  const n = 9;
  const b = { kind: 'table', columns: Array.from({ length: n }, () => ({})), header: Array.from({ length: n }, (_, k) => cell(`H${k}`)),
    rows: [['HAZ-001', 'Fire', ...Array(n - 2).fill('Uncategorised')].map(cell)] };
  const words = new Set(texts(layout(doc([b]), style()).pages[0]).map((t) => t.text));
  for (const w of ['HAZ-001', 'Fire']) assert.ok(words.has(w), `${w} is broken across lines`);
});

test('a squeezed column with nothing in it still keeps room for a few letters of its heading', () => {
  const n = 10;
  const b = { kind: 'table', columns: Array.from({ length: n }, () => ({})), header: [...Array.from({ length: n - 1 }, (_, k) => cell(`H${k}`)), cell('Description')],
    rows: [[...Array(n - 1).fill('Uncategorised'), ''].map(cell)] };
  const p = layout(doc([b]), style()).pages[0];
  const pieces = texts(p).filter((t) => /^[Description]+$/.test(t.text) && t.text.length < 11 && 'Description'.includes(t.text));
  assert.ok(pieces.length <= 3, `the heading is cut into ${pieces.length} lines: ${pieces.map((t) => t.text).join('|')}`);
});
