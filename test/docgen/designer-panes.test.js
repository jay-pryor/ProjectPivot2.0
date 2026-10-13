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
    subject: { noun: 'platform', list: () => [{ id: 's1', label: 'Subject One' }, { id: 's2', label: 'Subject Two' }], ready: () => true, meta: () => [{ id: 'n', label: 'Name', value: 'One' }] },
    sections: () => [{ id: 'things', label: 'Things', keyColumn: { id: '_key', label: 'ID', get: (r) => r.id }, columns: [{ id: 'v', label: 'Value', get: (r) => r.v }, { id: 'extra', label: 'Extra', optional: true, get: (r) => r.v }],
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

test('the panes: Sections, Styles, Templates, Preview, Generate', () => {
  assert.deepEqual(RD.PANES.map((p) => p.label), ['Sections', 'Styles', 'Templates', 'Preview', 'Generate']);
  assert.deepEqual(RD.PANES.map((p) => p.id), ['section', 'styles', 'templates', 'preview', 'generate']);
  assert.doesNotMatch(paneOf(host(), 'section'), /data-rd-pane="relevance"|omitted by relevance/);
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

test('the Preview pane zooms too, separately from the section preview', () => {
  const at = (html) => Number(/class="dp-page"[^>]*style="width:([\d.]+)px/.exec(html)[1]);
  const dflt = paneOf(host(), 'preview');
  assert.match(dflt, /data-rd-zoom="in" data-rd-zoom-for="preview"/);
  assert.match(dflt, /data-rd-zoom="out" data-rd-zoom-for="preview"/);
  assert.match(dflt, />100%</);
  assert.ok(Math.abs(at(dflt) - 595.28) < 0.01);
  RD._rd.prevZoom = 1.5;
  const big = paneOf(host(), 'preview');
  RD._rd.prevZoom = null;
  assert.ok(Math.abs(at(big) - 595.28 * 1.5) < 0.01);
  assert.match(sectionPane(host(), 'things'), /data-rd-zoom="in" data-rd-zoom-for="section"/);
});

test('the designer chooses which platform the report is about, in its title bar', () => {
  const h = host();
  const first = paneOf(h, 'generate');
  assert.match(first, /<select data-rd-subject aria-label="Platform"[^>]*><option value="s1" selected>Subject One<\/option><option value="s2">Subject Two<\/option><\/select>/);
  App.docSession.get().subjectId = 's2';
  try { assert.match(paneOf(h, 'generate'), /<option value="s2" selected>Subject Two<\/option>/); }
  finally { App.docSession.get().subjectId = null; }
});

test('a section has no "Name in this list" box, and the list shows each section by its heading', () => {
  const h = host({ names: { things: 'Old shorthand' } });
  const html = sectionPane(h, 'things');
  App.docHost.set(h); RD.open(); RD.select('things');
  const all = RD.render(h.getState()); RD.close();
  assert.doesNotMatch(all, /Name in this list|data-rd-sec-name/);
  assert.match(all, /data-rd-sec-heading="things"/);
  assert.doesNotMatch(all, /Old shorthand/, 'a name saved before is no longer shown');
  assert.ok(html);
});

test('the Sections list is resizable: a grip, a default width, held between a minimum and a maximum', () => {
  const width = (w) => {
    const h = host();
    App.docHost.set(h); RD.open(); RD._rd.listWidth = w;
    const html = RD.render(h.getState()); RD.close(); RD._rd.listWidth = null;
    return html;
  };
  const dflt = width(null);
  assert.match(dflt, /<div class="rd-split" data-rd-split role="separator" aria-orientation="vertical"/);
  assert.match(dflt, /class="rpt-pane rpt-pane-main" style="flex-basis:420px"/);
  assert.match(width(300), /style="flex-basis:300px"/);
  assert.match(width(50), /style="flex-basis:260px"/, 'held at the minimum');
  assert.equal(RD.LIST_WIDTH.min, 260);
});
/** The Sections pane for a section, on a category. */
function sectionAt(h, id, cat) {
  App.docHost.set(h); RD.open(); RD.select(id); RD._rd.secCat = cat ?? null;
  const html = RD.render(h.getState()); RD.close(); RD._rd.secCat = null;
  return html;
}
const cats = (html) => [...html.matchAll(/data-rd-sec-cat="([a-z]+)"/g)].map((m) => m[1]);

test('Sections: three columns — categories, their fields, and the preview beside them', () => {
  const html = sectionAt(host(), 'things');
  assert.match(html, /class="rd-secgrid"[\s\S]*class="rd-cat-list"[\s\S]*data-rd-sec-fields[\s\S]*data-rd-sec-prev[\s\S]*class="dp-page"/);
});

test('each kind of section offers its own categories', () => {
  const h = host({ sections: [{ id: 'mine', title: 'Mine', parts: [] }] });
  assert.deepEqual(cats(sectionAt(h, 'things')), ['heading', 'introduction', 'placement', 'table']);
  assert.deepEqual(cats(sectionAt(h, 'meta')), ['heading', 'introduction', 'placement', 'table', 'rows']);
  assert.deepEqual(cats(sectionAt(h, 'toc')), ['heading', 'placement']);
  assert.deepEqual(cats(sectionAt(h, 'mine')), ['heading', 'placement', 'content']);
});

test('each category holds its existing controls', () => {
  const h = host({ sections: [{ id: 'mine', title: 'Mine', parts: [] }] });
  const at = (id, cat) => sectionAt(h, id, cat).slice(sectionAt(h, id, cat).indexOf('data-rd-sec-fields'));
  assert.match(at('things', 'heading'), /data-rd-sec-heading="things"/);
  assert.match(at('mine', 'heading'), /data-rd-sec-title="mine"/);
  assert.match(at('things', 'placement'), /data-rd-centre-part="heading" data-rd-block="things"[\s\S]*data-rd-pagebreak="things"[\s\S]*data-rd-notoc="things"[\s\S]*data-rd-space-block="things"/);
  assert.match(at('things', 'introduction'), /data-rd-intro="things"[\s\S]*data-rd-intro-num="things"/);
  assert.match(at('things', 'table'), /data-rd-tbl-field="title"[\s\S]*data-rd-tbl-col=/);
  assert.match(at('meta', 'rows'), /data-rd-meta=/);
  assert.match(at('mine', 'content'), /data-rd-addpart="para"[\s\S]*data-rd-del-section="mine"/);
});

test('the column and group ticks are in Table, and the ☰ button on the list is gone', () => {
  const html = sectionAt(host(), 'things', 'table');
  assert.doesNotMatch(html, /data-rd-optmenu/);
  assert.match(html.slice(html.indexOf('data-rd-sec-fields')), /data-rd-dsmap="columns" data-rd-ds="things" data-rd-key="extra"/);
});

test('a category the section lacks falls back to the first; with nothing chosen the first section opens', () => {
  const h = host({ sections: [{ id: 'mine', title: 'Mine', parts: [] }] });
  assert.match(sectionAt(h, 'mine', 'table'), /class="rd-cat on"[^>]*data-rd-sec-cat="heading"/);
  App.docHost.set(h); RD.open(); RD._rd.selected = null;
  const first = RD.render(h.getState()); RD.close();
  assert.match(first, /data-rd-sec-fields/);
  assert.doesNotMatch(first, /Pick a section on the left/);
  App.docHost.set(h); RD.open(); RD._rd.selected = 'gone';
  assert.match(RD.render(h.getState()), /data-rd-sec-fields/, 'a vanished section opens the first one');
  RD.close();
});

test('a column unticked in Table leaves the report: the ticks are stored under the key the report reads', () => {
  const h = host();
  App.docHost.set(h);
  const header = () => {
    const t = App.docGen.documentFor(h, Object.assign({}, App.docSession.options(), { subjectId: 's1' }), {}).document.blocks
      .filter((b) => b.kind === 'table').find((x) => x.anchor === 'tbl-things');
    return t.header.map((c) => c[0].text);
  };
  assert.deepEqual(header(), ['ID', 'Value', 'Extra']);
  const html = sectionAt(h, 'things', 'table');
  const key = /data-rd-dsmap="columns" data-rd-ds="([^"]+)" data-rd-key="extra"/.exec(html)[1];
  App.docStore.setReportInclude('columns', key, 'extra', false, true);
  assert.deepEqual(header(), ['ID', 'Value']);
});
test('the list uses plain level names and tags: Auto-populated, Meta, Table of Contents, none for your own', () => {
  const h = host({ sections: [{ id: 'mine', title: 'Mine', parts: [] }] });
  App.docHost.set(h); RD.open(); RD.select('things');
  const html = RD.render(h.getState()); RD.close();
  const list = html.slice(html.indexOf('rd-order-host'), html.indexOf('rd-split'));
  assert.match(list, /<option value="1"[^>]*>Heading 1<\/option>/);
  assert.match(list, /<option value="0"[^>]*>Title<\/option>/);
  assert.match(list, /<option value="5"[^>]*>Normal text<\/option>/);
  assert.match(list, />Auto \(Heading 1\)</);
  assert.doesNotMatch(list, />H1<|>T<|>N</);
  const row = (id) => list.slice(list.indexOf(`data-rd-block="${id}"`), list.indexOf('</li>', list.indexOf(`data-rd-block="${id}"`)));
  assert.match(row('things'), /class="rd-kind">Auto-populated</);
  assert.match(row('meta'), /class="rd-kind">Meta</);
  assert.match(row('toc'), /class="rd-kind">Table of Contents</);
  assert.doesNotMatch(row('mine'), /rd-kind/);
  assert.doesNotMatch(html, /Drag, or use/);
});
test('no one-line explanations anywhere in the designer: only messages about state remain', () => {
  const h = host({ sections: [{ id: 'mine', title: 'Mine', parts: [{ id: 'p1', kind: 'para', text: 'x' }, { id: 't1', kind: 'table', header: ['A'], rows: [['1']], align: ['l'] }, { id: 's1', kind: 'space', height: 10 }] }] });
  const pages = [];
  for (const pane of ['styles', 'templates', 'preview', 'generate']) pages.push(paneOf(h, pane));
  for (const sec of ['styles']) for (const s of ['page', 'body', 'tables', 'headerFooter', 'marking', 'numbering']) pages.push(paneOf(h, sec, s));
  for (const [id, cs] of [['things', ['heading', 'placement', 'introduction', 'table']], ['meta', ['rows']], ['toc', ['heading']], ['mine', ['heading', 'placement', 'content']]]) for (const c of cs) pages.push(sectionAt(h, id, c));
  const ALLOWED = [/^Nothing in this section yet\.$/, /^No .+ selected/, /^There are no sections yet\.$/, /^None written yet/, /page(s)? of \d+/i, /^Page \d+/, /^\d+ pages?$/];
  const notes = pages.flatMap((p) => [...p.matchAll(/<p class="muted[^"]*">([\s\S]*?)<\/p>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim()));
  const stray = [...new Set(notes.filter((t) => t && !ALLOWED.some((re) => re.test(t))))];
  assert.deepEqual(stray, []);
});

test('the title bar is the title and the platform picker, with no description after it', () => {
  assert.doesNotMatch(paneOf(host(), 'section'), /what the document contains|in what order, and how it looks/);
});
test('the Sections preview follows typing: a debounced input saves the box and redraws only the preview', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../DocGen/doc-designer.js', import.meta.url), 'utf8');
  const fn = /function liveSave\(el\) \{([\s\S]*?)\n    \}\n/.exec(src);
  assert.ok(fn, 'liveSave exists');
  for (const attr of ['data-rd-sec-heading', 'data-rd-sec-title', 'data-rd-tbl-block', 'data-rd-rich']) assert.match(fn[1], new RegExp(attr), attr);
  const wire = /dom\.on\(ctx\.root, 'input', '\[data-rd-live\]'[\s\S]*?\n      \}\);/.exec(src);
  assert.ok(wire, 'an input listener on [data-rd-live]');
  assert.match(wire[0], /setTimeout\([\s\S]*500\)/);
  assert.match(wire[0], /refreshSectionPreview\(\)/);
  assert.doesNotMatch(wire[0], /repaint\(\)/);
});
test('the boxes that drive the live preview are marked', () => {
  const h = host({ sections: [{ id: 'mine', title: 'Mine', parts: [{ id: 'p1', kind: 'para', text: 'x' }] }] });
  assert.match(sectionAt(h, 'things', 'heading'), /data-rd-sec-heading="things"[^>]*data-rd-live|data-rd-live[^>]*data-rd-sec-heading="things"/);
  assert.match(sectionAt(h, 'mine', 'heading'), /data-rd-live[^>]*data-rd-sec-title|data-rd-sec-title[^>]*data-rd-live/);
  assert.match(sectionAt(h, 'things', 'introduction'), /data-rd-intro="things"[^>]*data-rd-live|data-rd-live[^>]*data-rd-intro="things"/);
  assert.match(sectionAt(h, 'things', 'table'), /data-rd-tbl-field="title"[^>]*data-rd-live|data-rd-live[^>]*data-rd-tbl-field="title"/);
  assert.match(sectionAt(h, 'mine', 'content'), /data-rd-text="p1"[^>]*data-rd-live|data-rd-live[^>]*data-rd-text="p1"/);
});

test('a redraw asked for while a button is being pressed waits for the release, so the click lands on the button', () => {
  assert.ok(RD._gate, 'the press gate is exposed');
  RD._gate.pressing = true; RD._gate.pending = false;
  RD._repaint();                                   // would touch the DOM if it did not wait
  assert.equal(RD._gate.pending, true);
  RD._gate.pressing = false; RD._gate.pending = false;
});

test('Final review I1: leaving a live box cancels its pending save, and a late save on a box no longer on screen is skipped', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../DocGen/doc-designer.js', import.meta.url), 'utf8');
  assert.match(src, /dom\.on\(ctx\.root, 'focusout', '\[data-rd-live\]', function \(\) \{ clearTimeout\(liveTimer\); \}\);/);
  assert.match(src, /if \(!el\.isConnected\) return;/);
});

test('Final review I2: only a plain left press outside form fields holds redraws, and the hold always lets go', () => {
  const t = (sel) => ({ closest: (q) => (q.split(',').map((x) => x.trim()).includes(sel) ? {} : null) });
  assert.equal(RD._holds({ button: 0, target: t('button') }), true);
  assert.equal(RD._holds({ button: 0, target: t('select') }), false);
  assert.equal(RD._holds({ button: 0, target: t('input') }), false);
  assert.equal(RD._holds({ button: 2, target: t('button') }), false, 'a right-click opens a menu that eats the release');
  assert.deepEqual(RD._releaseOn, ['pointerup', 'pointercancel', 'dragend', 'drop', 'click', 'contextmenu']);
});

test('Final review I3: the three columns stack by the pane\'s own width, not the window\'s', async () => {
  const fs = await import('node:fs');
  const css = fs.readFileSync(new URL('../../DocGen/doc-designer.css', import.meta.url), 'utf8');
  assert.match(css, /\.docgen \.rd-pane \{[^}]*container-type: inline-size/);
  assert.match(css, /@container \(max-width: 820px\) \{ \.docgen \.rd-secgrid/);
  assert.doesNotMatch(css, /@media \(max-width: 1400px\) \{ \.docgen \.rd-secgrid/);
});

test('Heading has no level box (the list sets it); Introduction comes before Placement', () => {
  const h = host({ sections: [{ id: 'mine', title: 'Mine', parts: [] }] });
  assert.deepEqual(cats(sectionAt(h, 'things')), ['heading', 'introduction', 'placement', 'table']);
  assert.deepEqual(cats(sectionAt(h, 'meta')), ['heading', 'introduction', 'placement', 'table', 'rows']);
  const fields = (id, cat) => { const html = sectionAt(h, id, cat); return html.slice(html.indexOf('data-rd-sec-fields')); };
  assert.doesNotMatch(fields('things', 'heading').split('data-rd-sec-prev')[0], /data-rd-level/);
  assert.doesNotMatch(fields('mine', 'heading').split('data-rd-sec-prev')[0], /data-rd-level/);
});

test('Placement centres the heading, the introduction and the table separately, in that order', () => {
  const h = host({ sections: [{ id: 'mine', title: 'Mine', parts: [] }], centred: { things: { intro: true } } });
  const parts = (id) => { const html = sectionAt(h, id, 'placement'); return [...html.matchAll(/data-rd-centre-part="([a-z]+)"[^>]*?( checked)?>/g)].map((m) => m[1] + (m[2] ? '*' : '')); };
  assert.deepEqual(parts('things'), ['heading', 'intro*', 'table']);
  assert.deepEqual(parts('mine'), ['heading', 'content']);
  assert.deepEqual(parts('toc'), ['heading']);
  assert.doesNotMatch(sectionAt(h, 'things', 'placement'), /Centre this section/);
});

test('a centring tick is stored per part; ticking a part of an old "centre everything" keeps the others', () => {
  const h = host({ centred: { things: true } });
  App.docHost.set(h);
  App.docStore.setBlockCentrePart('things', 'table', false);
  assert.deepEqual(h.getState().report.centred.things, { heading: true, intro: true, content: true });
  App.docStore.setBlockCentrePart('things', 'heading', false);
  App.docStore.setBlockCentrePart('things', 'intro', false);
  App.docStore.setBlockCentrePart('things', 'content', false);
  assert.equal(h.getState().report.centred, undefined, 'nothing centred leaves nothing stored');
});

test('Table ticks every column of a pre-populated section except its first, identifying one', () => {
  const h = host();
  const html = sectionAt(h, 'things', 'table');
  const keys = [...html.matchAll(/data-rd-dsmap="columns" data-rd-ds="things" data-rd-key="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(keys, ['v', 'extra']);
  App.docHost.set(h);
  App.docStore.setReportInclude('columns', 'things', 'v', false, true);
  const t = App.docGen.documentFor(h, Object.assign({}, App.docSession.options(), { subjectId: 's1' }), {}).document.blocks.find((x) => x.anchor === 'tbl-things');
  assert.deepEqual(t.header.map((c) => c[0].text), ['ID', 'Extra']);
});

test('the section preview switches between this section (the default) and the whole document', () => {
  const h = host();
  const at = (whole) => { RD._rd.secWhole = whole; const html = sectionPane(h, 'things'); RD._rd.secWhole = false; return html; };
  const one = at(false);
  assert.match(one, /data-rd-prev-scope="section"[^>]*aria-pressed="true"/);
  assert.match(one, /data-rd-prev-scope="whole"[^>]*aria-pressed="false"/);
  assert.doesNotMatch(one, />O-1</, 'just this section');
  const all = at(true);
  assert.match(all, /data-rd-prev-scope="whole"[^>]*aria-pressed="true"/);
  assert.match(all, />O-1</, 'the other sections too');
  assert.match(all, /<span class="dp-anchor" id="sec-things"[^>]*data-rd-here/, 'it marks where this section starts, to scroll to');
});

test('the toolbar shows the formatting where the cursor is: bold, italic and code from the nodes around it', () => {
  const box = { nodeName: 'DIV', parentNode: null };
  const node = (name, parent) => ({ nodeName: name, parentNode: parent });
  const text = (parent) => ({ nodeName: '#text', parentNode: parent });
  assert.deepEqual(RD._formatsAt(text(box), box), []);
  assert.deepEqual(RD._formatsAt(text(node('EM', node('STRONG', box))), box), ['b', 'i']);
  assert.deepEqual(RD._formatsAt(text(node('B', box)), box), ['b']);
  assert.deepEqual(RD._formatsAt(text(node('CODE', box)), box), ['c']);
  assert.deepEqual(RD._formatsAt(text(node('STRONG', node('DIV', null))), box), [], 'outside the box counts for nothing');
});

test('the toolbar buttons centre their marks, and a link chip is the size of the text around it', async () => {
  const fs = await import('node:fs');
  const css = fs.readFileSync(new URL('../../DocGen/doc-designer.css', import.meta.url), 'utf8');
  assert.match(css, /\.docgen \.rd-tb \{[^}]*display: inline-flex;[^}]*align-items: center;[^}]*justify-content: center;/);
  assert.match(css, /\.docgen \.rd-tb\.on \{/);
  assert.match(css, /\.docgen \.rd-chip \{[^}]*display: inline;[^}]*font-size: inherit;[^}]*line-height: inherit;/);
});

test('a redraw asked for during a redraw waits for it to finish', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../DocGen/doc-designer.js', import.meta.url), 'utf8');
  assert.match(src, /if \(_painting\) \{ _paintAgain = true; return true; \}/);
});

test('typing after pressing I with nothing selected types in italics: the box\'s placeholder character never reaches the text', () => {
  const RT = App.ui.richText;
  const t = (v) => ({ nodeType: 3, nodeName: '#text', nodeValue: v, childNodes: [] });
  const el = (name, kids) => ({ nodeType: 1, nodeName: name, childNodes: kids, getAttribute: () => null, hasAttribute: () => false });
  assert.equal(RT.fromNode(el('DIV', [t('Plain '), el('EM', [t('​slanted')])])), 'Plain {{i}}slanted{{/i}}');
  assert.equal(RT.fromNode(el('DIV', [t('a​')])), 'a');
});
