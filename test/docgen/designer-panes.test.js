import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../../DocGen/doc-designer.js';
import { normaliseStyle, TEXT_KEYS } from '../../DocGen/doc-style.js';

const RD = App.ui.views.reportDesign;

/** A host with one subject and one section, and a design holding one editable Style. */
function host(design = {}) {
  const state = { report: { formats: [{ ...normaliseStyle({ id: 'mine', name: 'Mine' }).style }], formatId: 'mine', ...design } };
  return {
    getState: () => state,
    commit: (m) => m(state),
    clock: { nowIso: () => '2026-10-12T00:00:00.000Z' },
    classifications: ['OFFICIAL', 'PROTECTED'],
    subject: { list: () => [{ id: 's1', label: 'Subject One' }], ready: () => true, meta: () => [{ id: 'n', label: 'Name', value: 'One' }] },
    sections: () => [{ id: 'things', label: 'Things', keyColumn: { id: '_key', label: 'ID', get: (r) => r.id }, columns: [{ id: 'v', label: 'Value', get: (r) => r.v }],
      rows: () => [{ id: 'T-1', v: 'x ≥ y' }] },
      { id: 'others', label: 'Others', keyColumn: { id: '_key', label: 'ID', get: (r) => r.id }, columns: [{ id: 'v', label: 'Value', get: (r) => r.v }],
      rows: () => [{ id: 'O-1', v: 'other' }] }],
  };
}

/** The workspace as drawn on one pane. */
function paneOf(h, pane, styleSection) {
  App.docHost.set(h);
  RD.open();
  RD.pane(pane);
  RD._rd.fmtId = null;
  RD._rd.styleSection = styleSection ?? null;
  const html = RD.render(h.getState());
  RD.close();
  return html;
}
/** Every value a dotted path names in an object, or undefined. */
const at = (o, path) => path.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);

test('the panes: Styles replaces Formatting and Header & Footer', () => {
  assert.deepEqual(RD.PANES.map((p) => p.id), ['section', 'relevance', 'styles', 'templates', 'preview', 'generate']);
  assert.equal(RD.PANES.find((p) => p.id === 'styles').label, 'Styles');
});

test('the Styles pane lists its sections and the live pages beside them', () => {
  const html = paneOf(host(), 'styles');
  for (const s of ['page', 'title', 'h1', 'h2', 'h3', 'h4', 'body', 'caption', 'code', 'tables', 'headerFooter', 'marking', 'numbering']) {
    assert.match(html, new RegExp(`data-rd-style-section="${s}"`), s);
  }
  assert.match(html, /data-rd-style-preview[\s\S]*class="dp-page"/);
  assert.match(html, /data-rd-fmt-active/);
  assert.match(html, /data-rd-fmt-new/);
});

test('every field on every Styles section names a real path in the Style', () => {
  const style = normaliseStyle({}).style;
  for (const s of ['page', 'title', 'h1', 'body', 'caption', 'code', 'tables', 'headerFooter', 'marking', 'numbering']) {
    const html = paneOf(host(), 'styles', s);
    const paths = [...html.matchAll(/data-rd-fmt(?:-bool)?="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(paths.length > 0, `${s} has fields`);
    for (const p of paths) assert.notEqual(at(style, p), undefined, `${s}: ${p} is not in the Style`);
  }
});

test('a text section offers font, size, weight, slope, underline, colour, alignment, spacing and breaks', () => {
  const html = paneOf(host(), 'styles', 'h1');
  for (const f of ['family', 'size', 'colour', 'align', 'lineSpacing', 'spaceBefore', 'spaceAfter']) assert.match(html, new RegExp(`data-rd-fmt="text\\.h1\\.${f}"`), f);
  for (const f of ['bold', 'italic', 'underline', 'keepWithNext', 'pageBreakBefore']) assert.match(html, new RegExp(`data-rd-fmt-bool="text\\.h1\\.${f}"`), f);
  assert.ok(TEXT_KEYS.includes('h1'));
});

test('the tables section sets every table: borders, header row, banding and first column', () => {
  const html = paneOf(host(), 'styles', 'tables');
  for (const p of ['tables.borders', 'tables.header.fill', 'tables.banding.fill', 'tables.firstColumn.fill', 'tables.captionPosition']) assert.match(html, new RegExp(`data-rd-fmt="${p.replace(/\./g, '\\.')}"`), p);
  for (const p of ['tables.header.repeat', 'tables.banding.on', 'tables.firstColumn.on']) assert.match(html, new RegExp(`data-rd-fmt-bool="${p.replace(/\./g, '\\.')}"`), p);
});

test('the header and footer section has its slots, the first-page switch and the marking', () => {
  const html = paneOf(host(), 'styles', 'headerFooter');
  assert.match(html, /data-rd-hf-set="header" data-rd-hf-slot="left"/);
  assert.match(html, /data-rd-hf-set="footer" data-rd-hf-slot="centre"/);
  assert.match(html, /data-rd-hf-first/);
  assert.match(html, /#page/);
  assert.match(paneOf(host(), 'styles', 'marking'), /data-rd-classification/);
});

test('the built-in Standard style is locked: its fields are shown but not editable', () => {
  const html = paneOf(host({ formatId: 'standard' }), 'styles', 'body');
  assert.match(html, /<fieldset class="rd-fmt-body" disabled/);
  assert.match(html, /Duplicate/);
});

test('values the Style could not use are named above the fields', () => {
  RD._rd.held = ['Body size: 0 held at 6'];
  const html = paneOf(host(), 'styles', 'body');
  assert.match(html, /class="rd-held"[\s\S]*Body size: 0 held at 6/);
  RD._rd.held = null;
});

test('the Section pane no longer asks which tables wear the table styling', () => {
  const h = host();
  App.docHost.set(h);
  RD.open(); RD.select('things');
  const html = RD.render(h.getState());
  RD.close();
  assert.doesNotMatch(html, /data-rd-tstyle/);
});

test('the Preview pane is the document laid out on pages', () => {
  const html = paneOf(host(), 'preview');
  assert.match(html, /class="dp-page" data-page="1"/);
  assert.match(html, /T-1/);
  assert.doesNotMatch(html, /data-rd-pageview/, 'always pages');
});

test('the Generate pane makes a PDF or HTML, and lists the characters the fonts will replace', () => {
  const html = paneOf(host(), 'generate');
  assert.match(html, /data-generate-format="pdf"[^>]*>Make PDF</);
  assert.match(html, /data-generate-format="html"[^>]*>Make HTML</);
  assert.doesNotMatch(html, /data-generate-format="md"|pandoc|tectonic/);
  assert.match(html, /class="rd-fieldset rd-replaced"[\s\S]*<code>≥<\/code>/);
});

test('every wiring function that reads the project takes P from the helper bag (Duplicate and every Style edit threw without it)', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../DocGen/doc-designer.js', import.meta.url), 'utf8');
  const fns = [...src.matchAll(/\n    function (wire\w+)\(h\) \{([\s\S]*?)\n    \}\n/g)];
  assert.ok(fns.length >= 4);
  for (const [, name, body] of fns) if (/\bP\(\)/.test(body)) assert.match(body, /var P = h\.P;/, `${name} calls P() without defining it`);
});

test('Final review I5: the contents section offers no title box — the contents heading is the section\'s own title', () => {
  assert.doesNotMatch(paneOf(host(), 'styles', 'numbering'), /data-rd-fmt="toc\.title"/);
});

/** The Section pane for one section, at a zoom. */
function sectionPane(h, id, zoom) {
  App.docHost.set(h);
  RD.open(); RD.select(id);
  RD._rd.secZoom = zoom ?? null;
  const html = RD.render(h.getState());
  RD.close(); RD._rd.secZoom = null;
  return html.slice(html.indexOf('rd-secprev'));
}

test('a section\'s preview shows that section only, not the ones around it', () => {
  const things = sectionPane(host(), 'things');
  assert.match(things, />T-1</);
  assert.doesNotMatch(things, />O-1</);
  assert.doesNotMatch(things, />Others</);
  const others = sectionPane(host(), 'others');
  assert.match(others, />O-1</);
  assert.doesNotMatch(others, />T-1</);
});

test('the section preview zooms in and out', () => {
  const at = (html) => Number(/class="dp-page"[^>]*style="width:([\d.]+)px/.exec(html)[1]);
  const dflt = sectionPane(host(), 'things');
  assert.match(dflt, /data-rd-zoom="out"/);
  assert.match(dflt, /data-rd-zoom="in"/);
  assert.match(dflt, /60%/);
  assert.ok(Math.abs(at(dflt) - 595.28 * 0.6) < 0.01);
  assert.ok(Math.abs(at(sectionPane(host(), 'things', 1.2)) - 595.28 * 1.2) < 0.01);
});
