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
  for (const s of ['page', 'title', 'h1', 'body', 'caption', 'code', 'tables', 'images', 'headerFooter', 'marking', 'numbering']) {
    const html = paneOf(host(), 'styles', s);
    const paths = [...html.matchAll(/data-rd-fmt(?:-bool)?="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(paths.length > 0, `${s} has fields`);
    for (const p of paths) assert.notEqual(at(style, p), undefined, `${s}: ${p} is not in the Style`);
  }
});

test('a text section offers font, size, weight, slope, underline, colour, alignment, spacing and breaks', () => {
  const html = paneOf(host(), 'styles', 'h1');
  for (const f of ['family', 'size', 'align', 'lineSpacing', 'spaceBefore', 'spaceAfter']) assert.match(html, new RegExp(`data-rd-fmt="text\\.h1\\.${f}"`), f);
  assert.match(html, /data-rd-colour-open="text\.h1\.colour"/, 'colour');
  for (const f of ['bold', 'italic', 'underline', 'keepWithNext', 'pageBreakBefore']) assert.match(html, new RegExp(`data-rd-fmt-bool="text\\.h1\\.${f}"`), f);
  assert.ok(TEXT_KEYS.includes('h1'));
});

test('the tables section sets every table: borders, header row, banding and first column', () => {
  const html = paneOf(host(), 'styles', 'tables');
  for (const p of ['tables.borders', 'tables.captionPosition']) assert.match(html, new RegExp(`data-rd-fmt="${p.replace(/\./g, '\\.')}"`), p);
  for (const p of ['tables.header.fill', 'tables.banding.fill', 'tables.firstColumn.fill']) assert.match(html, new RegExp(`data-rd-colour-open="${p.replace(/\./g, '\\.')}"`), p);
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
  assert.match(dflt, />100%</);
  assert.ok(Math.abs(at(dflt) - 595.28) < 0.01);
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

test('pressing a lit B, I or code with nothing selected ends that style at the cursor', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../DocGen/doc-designer.js', import.meta.url), 'utf8');
  const wrap = /function wrapSelection\(btn, tag\) \{([\s\S]*?)\n    \}\n/.exec(src);
  assert.ok(wrap && /endFormat\(/.test(wrap[1]), 'wrapSelection ends a style that is on at a collapsed caret');
  assert.match(src, /function endFormat\(el, tag\) \{/);
});

test('Placement: centring under "Centre content", the rest under "Section placement", no "On the page"', () => {
  const html = sectionAt(host(), 'things', 'placement');
  const f = html.slice(html.indexOf('data-rd-sec-fields'), html.indexOf('data-rd-sec-prev'));
  assert.doesNotMatch(f, /On the page/);
  assert.match(f, /<strong>Centre content<\/strong>[\s\S]*data-rd-centre-part="heading"[\s\S]*data-rd-centre-part="table"[\s\S]*<strong>Section placement<\/strong>[\s\S]*data-rd-pagebreak[\s\S]*data-rd-notoc[\s\S]*data-rd-space-block/);
});

test('Table: column ticks sit in a three-column grid, and the wording is "Table Headers and Caption"', async () => {
  const html = sectionAt(host(), 'things', 'table');
  assert.match(html, /<strong>Columns<\/strong><div class="rd-ticks">[\s\S]*data-rd-key="v"[\s\S]*data-rd-key="extra"[\s\S]*<\/div>/);
  assert.match(html, /<strong[^>]*>Table Headers and Caption<\/strong>/);
  assert.doesNotMatch(html, />Table wording</);
  const fs = await import('node:fs');
  const css = fs.readFileSync(new URL('../../DocGen/doc-designer.css', import.meta.url), 'utf8');
  assert.match(css, /\.docgen \.rd-ticks \{[^}]*display: grid;[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
});

/** Toggle a format over the visible text between two markers [ and ] in a token string. */
function toggled(marked, tag) {
  const s = marked.indexOf('['), e = marked.indexOf(']') - 1;
  const text = marked.replace('[', '').replace(']', '');
  const r = App.ui.richText.toggleFormat(text, s, e, tag);
  return r.text.slice(0, r.start) + '[' + r.text.slice(r.start, r.end) + ']' + r.text.slice(r.end);
}

test('formatting a selection follows the usual editor rule: all on → off; none or some → all on; the selection stays', () => {
  assert.equal(toggled('a [plain] b', 'i'), 'a [{{i}}plain{{/i}}] b');
  assert.equal(toggled('a [{{i}}slanted{{/i}}] b', 'i'), 'a [slanted] b', 'all italic → none');
  assert.equal(toggled('{{i}}ab[cd{{/i}}ef]g', 'i'), '{{i}}ab[cdef{{/i}}]g', 'part italic → all italic');
  assert.equal(toggled('{{i}}ab[cd]ef{{/i}}', 'i'), '{{i}}ab{{/i}}[cd]{{i}}ef{{/i}}', 'a middle piece un-italicised');
  assert.equal(toggled('[{{b}}one{{/b}} two]', 'b'), '[{{b}}one two{{/b}}]');
  assert.equal(toggled('{{b}}[bold {{i}}both{{/i}}]{{/b}}', 'b'), '[bold {{i}}both{{/i}}]', 'bold off, italic kept');
});

test('formatting keeps references whole and never runs across a paragraph break', () => {
  assert.equal(toggled('[see {{ref:x}} now]', 'b'), '[{{b}}see {{ref:x}} now{{/b}}]');
  assert.equal(toggled('[one\n\ntwo]', 'i'), '[{{i}}one{{/i}}\n\n{{i}}two{{/i}}]');
  assert.equal(toggled('[{{c}}code{{/c}} x]', 'c'), '[{{c}}code x{{/c}}]');
  assert.equal(toggled('{{c}}[code]{{/c}}', 'c'), '[code]');
});

test('a colour field shows its colour and opens preset swatches, with the full picker behind "More colours…"', () => {
  const h = host();
  const closed = paneOf(h, 'styles', 'tables');
  const fields = closed.slice(closed.indexOf('rd-style-fields'), closed.indexOf('rd-style-preview'));
  assert.doesNotMatch(fields, /type="color"/, 'no full picker up front');
  assert.match(fields, /data-rd-colour-open="tables\.header\.fill"[^>]*style="background:#d9e2f3"/);
  RD._rd.colourOpen = 'tables.header.fill';
  const open = paneOf(h, 'styles', 'tables');
  RD._rd.colourOpen = null;
  const pal = open.slice(open.indexOf('class="rd-palette"'));
  const picks = [...pal.matchAll(/data-rd-colour-pick="(#[0-9a-f]{6})" data-rd-colour-key="tables\.header\.fill"/g)].map((m) => m[1]);
  assert.ok(picks.length >= 20, `${picks.length} presets`);
  for (const c of ['#000000', '#ffffff', '#c00000', '#0070c0', '#f4cccc', '#ddebf7', '#d9e2f3']) assert.ok(picks.includes(c), c);
  assert.match(pal, /More colours&hellip;<input type="color"[^>]*data-rd-fmt="tables\.header\.fill"/);
  assert.match(pal, /data-rd-colour-pick="#d9e2f3"[^>]*class="rd-sw on"|class="rd-sw on"[^>]*data-rd-colour-pick="#d9e2f3"/, 'the current colour is marked');
});

test('the palette is the same everywhere: preset rows of greys, colours and their pastels', () => {
  assert.deepEqual(RD.PALETTE.map((row) => row.length), [6, 8, 8]);
  for (const row of RD.PALETTE) for (const [hex, name] of row) { assert.match(hex, /^#[0-9a-f]{6}$/); assert.ok(name); }
});

test('the section list is shown on the Sections tab only', () => {
  assert.match(paneOf(host(), 'section'), /id="rd-order-host"[\s\S]*data-rd-split/);
  for (const pane of ['styles', 'templates', 'preview', 'generate']) {
    const html = paneOf(host(), pane);
    assert.doesNotMatch(html, /id="rd-order-host"|data-rd-split/, pane);
  }
});

test('the Styles preview is laid out like the Sections one: its own column, at 100%, with zoom', () => {
  const html = paneOf(host(), 'styles', 'page');
  assert.match(html, /data-rd-style-preview[\s\S]*data-rd-zoom="in" data-rd-zoom-for="styles"/);
  assert.match(html, />100%</);
  assert.match(html, /class="dp-page" data-page="1" style="width:595.28px/);
});

test('Styles calls the marking "Security Classification"', () => {
  const html = paneOf(host(), 'styles', 'marking');
  assert.match(html, /data-rd-style-section="marking"[^>]*>Security Classification</);
  assert.doesNotMatch(html, />Marking</);
});

test('Styles lists Numbering and Contents separately, straight after Page, with the Table of Contents wording', () => {
  const html = paneOf(host(), 'styles', 'numbering');
  const order = [...html.matchAll(/data-rd-style-section="([a-zA-Z0-9]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order.slice(0, 5), ['document', 'page', 'numbering', 'contents', 'title']);
  assert.match(html, />\s*Show the numbers in the Table of Contents</);
  const contents = paneOf(host(), 'styles', 'contents');
  assert.match(contents, />\s*Include a Table of Contents</);
  assert.match(contents, /data-rd-fmt="toc\.depth"/);
  assert.doesNotMatch(html.slice(html.indexOf('rd-style-fields'), html.indexOf('rd-style-preview')), /toc\.include|Contents level/, 'contents settings are in Contents');
});

test('every number box has up and down arrows that step by a sensible amount', () => {
  const steps = (section) => {
    const html = paneOf(host(), 'styles', section);
    return Object.fromEntries([...html.matchAll(/data-rd-step="\+" data-rd-step-key="([^"]+)" data-rd-step-by="([^"]+)"/g)].map((m) => [m[1], Number(m[2])]));
  };
  const h1 = steps('h1');
  assert.deepEqual([h1['text.h1.size'], h1['text.h1.lineSpacing'], h1['text.h1.spaceBefore'], h1['text.h1.spaceAfter']], [0.5, 0.05, 1, 1]);
  const page = steps('page');
  assert.equal(page['page.margins.top'], 1);
  const t = steps('tables');
  assert.deepEqual([t['tables.fontSize'], t['tables.header.size'], t['tables.borderWidth'], t['tables.padding']], [0.5, 0.5, 0.25, 0.5]);
  const html = paneOf(host(), 'styles', 'h1');
  assert.match(html, /data-rd-step="-" data-rd-step-key="text\.h1\.size" data-rd-step-by="0\.5"/);
});

test('a step moves the value by its step from what is there, without float noise', () => {
  assert.equal(RD._stepped('10.5', 0.5, 1), 11);
  assert.equal(RD._stepped('1.15', 0.05, 1), 1.2);
  assert.equal(RD._stepped('1.15', 0.05, -1), 1.1);
  assert.equal(RD._stepped('', 1, 1), 1);
  assert.equal(RD._stepped('0.5', 0.25, -1), 0.25);
});

test('double-clicking a section in the list edits its heading there', () => {
  const h = host({ sections: [{ id: 'mine', title: 'Mine', parts: [] }] });
  App.docHost.set(h); RD.open(); RD.pane('section'); RD._rd.renaming = 'things';
  const html = RD.render(h.getState()); RD.close(); RD._rd.renaming = null;
  const list = html.slice(html.indexOf('rd-order-host'), html.indexOf('rd-split'));
  assert.match(list, /<input class="rd-rename" data-rd-rename="things" value="Things"/);
  assert.doesNotMatch(list, /data-rd-select="things"/, 'the name is the box while it is being edited');
  assert.match(list, /data-rd-select="mine"/);
});

test('a renamed section saves its heading where its Heading box does; blank puts back the standard wording', () => {
  const h = host({ sections: [{ id: 'mine', title: 'Mine', parts: [] }] });
  App.docHost.set(h);
  RD._renameSection('things', 'Our things');
  assert.equal(h.getState().report.headings.things, 'Our things');
  RD._renameSection('mine', 'My own');
  assert.equal(h.getState().report.sections[0].title, 'My own');
  RD._renameSection('things', '');
  assert.equal((h.getState().report.headings || {}).things, undefined);
});

test('Styles starts with Document, set apart, then Page Setup and Section Numbering; Header & Footer capitalised', () => {
  const html = paneOf(host(), 'styles', 'document');
  const list = html.slice(html.indexOf('rd-style-list'), html.indexOf('rd-style-fields'));
  const names = [...list.matchAll(/data-rd-style-section="[^"]+"[^>]*>([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(names.slice(0, 4), ['Document', 'Page Setup', 'Section Numbering', 'Contents']);
  assert.ok(names.includes('Header &amp; Footer'));
  assert.match(list, /data-rd-style-section="document"[^>]*>Document<\/button><hr class="rd-style-divider"/);
  const f = html.slice(html.indexOf('rd-style-fields'), html.indexOf('rd-style-preview'));
  for (const k of ['renumberHazards', 'renumberControls', 'renumberReferences']) assert.match(f, new RegExp(`data-rd-fmt-bool="document\\.${k}"`), k);
});

test('an image part: added blank, boxes filled and emptied, fields held to their limits', () => {
  const h = host({ sections: [{ id: 'mine', title: 'Mine', parts: [] }] });
  App.docHost.set(h);
  const r = App.docStore.addPart('mine', 'image');
  assert.equal(r.ok, true);
  const part = () => h.getState().report.sections[0].parts[0];
  assert.deepEqual(part(), { id: r.id, kind: 'image', layout: 'single', captions: 'one', caption: '', images: [] });
  App.docStore.setPartImage('mine', r.id, 2, { source: 'report', file: 'a.png', name: 'a.png' });
  assert.deepEqual(part().images, [null, null, { source: 'report', file: 'a.png', name: 'a.png' }]);
  App.docStore.setPartImageField('mine', r.id, 2, 'width', '42.6');
  App.docStore.setPartImageField('mine', r.id, 2, 'noBorder', true);
  App.docStore.setPartImageField('mine', r.id, 2, 'caption', 'Left');
  assert.deepEqual(part().images[2], { source: 'report', file: 'a.png', name: 'a.png', width: 43, noBorder: true, caption: 'Left' });
  App.docStore.setPartImageField('mine', r.id, 2, 'width', 900);
  assert.equal(part().images[2].width, undefined, '100% is the default, so it is not stored');
  App.docStore.setPartImageField('mine', r.id, 2, 'width', 1);
  assert.equal(part().images[2].width, 5);
  App.docStore.setPartImage('mine', r.id, 2, null);
  assert.deepEqual(part().images, [null, null, null]);
});

test('a layout with fewer boxes keeps the extra images for later', () => {
  const h = host({ sections: [{ id: 'mine', title: 'Mine', parts: [{ id: 'i1', kind: 'image', layout: 'grid4', captions: 'one', caption: '',
    images: [{ source: 'report', file: 'a.png', name: 'a' }, { source: 'report', file: 'b.png', name: 'b' }, { source: 'report', file: 'c.png', name: 'c' }] }] }] });
  App.docHost.set(h);
  App.docStore.updatePart('mine', 'i1', { layout: 'single' });
  App.docStore.updatePart('mine', 'i1', { layout: 'grid21' });
  assert.deepEqual(h.getState().report.sections[0].parts[0].images.map((i) => i.name), ['a', 'b', 'c']);
});

test('Standard Images: added, renamed, counted where used, removed', () => {
  const h = host({ sections: [{ id: 'mine', title: 'Mine', parts: [{ id: 'i1', kind: 'image', layout: 'pair', captions: 'one', caption: '',
    images: [{ source: 'standard', file: 's1.png', name: 'Logo' }, { source: 'standard', file: 's1.png', name: 'Logo' }] }] }],
    sectionTemplates: [{ id: 'tpl1', name: 'T', parts: [{ id: 'i9', kind: 'image', layout: 'single', images: [{ source: 'standard', file: 's1.png', name: 'Logo' }] }] }] });
  App.docHost.set(h);
  const a = App.docStore.addStandardImage('Logo', 's1.png');
  assert.equal(a.ok, true);
  App.docStore.renameStandardImage(a.id, 'Company logo');
  assert.deepEqual(h.getState().report.standardImages, [{ id: a.id, name: 'Company logo', file: 's1.png' }]);
  assert.equal(App.docStore.standardImageUses('s1.png'), 3);
  assert.equal(App.docStore.addStandardImage('  ', 'x.png').ok, false);
  App.docStore.removeStandardImage(a.id);
  assert.deepEqual(h.getState().report.standardImages, []);
});

test('a section template may hold image parts', () => {
  const parsed = App.docTemplates.parseImport(JSON.stringify({ kind: 'ch-config-tool/section-templates', items: [{ name: 'Pics', parts: [{ kind: 'image', layout: 'pair', images: [] }] }] }), 'sections');
  assert.equal(parsed.issues.filter((i) => i.severity === 'error').length, 0, JSON.stringify(parsed.issues));
});

/** The Sections tab, on one section's Content. */
function contentOf(h, id) {
  App.docHost.set(h); RD.open(); RD.pane('section'); RD.select(id); RD._rd.secCat = 'content';
  const html = RD.render(h.getState()); RD.close();
  return html;
}

test('the Content category offers + Image; an image part shows its layout, caption mode and boxes', () => {
  const h = host({ sections: [{ id: 'mine', title: 'Mine', parts: [{ id: 'i1', kind: 'image', layout: 'grid21', captions: 'separate', caption: '',
    images: [{ source: 'report', file: 'a.png', name: 'a.png', width: 40, noBorder: true, caption: 'Left' }] }] }], order: ['mine'] });
  const html = contentOf(h, 'mine');
  assert.match(html, /data-rd-addpart="image"[^>]*>\+ Image</);
  assert.match(html, /<select data-rd-img-layout="i1"[^>]*>[\s\S]*?<option value="single">Single image<\/option><option value="pair">Side by side<\/option><option value="grid4">2×2 grid<\/option><option value="grid21" selected>2-1 grid<\/option><option value="grid12">1-2 grid<\/option>/);
  assert.match(html, /<select data-rd-img-captions="i1"[^>]*>[\s\S]*?One caption[\s\S]*?value="separate" selected>Separate captions[\s\S]*?No caption/);
  assert.equal((html.match(/data-rd-imgbox="\d"/g) ?? []).length, 3);
  assert.match(html, /data-rd-imgbox="0"[\s\S]*?a\.png[\s\S]*?data-rd-img-width[^>]*value="40"[\s\S]*?data-rd-img-noborder[^>]*checked[\s\S]*?data-rd-img-capk[^>]*value="Left"/);
  assert.match(html, /data-rd-imgbox="1"[\s\S]*?Drop an image here, or click to choose/);
  assert.doesNotMatch(html, /data-rd-img-caption="i1"/, 'separate captions: no shared caption box');
});

test('one caption: a caption box for the whole block', () => {
  const h = host({ sections: [{ id: 'mine', title: 'Mine', parts: [{ id: 'i1', kind: 'image', layout: 'single', captions: 'one', caption: 'Our map', images: [] }] }], order: ['mine'] });
  assert.match(contentOf(h, 'mine'), /data-rd-img-caption="i1"[^>]*value="Our map"/);
});

test('a clicked box offers Standard Images or a file from this computer', () => {
  const h = host({ standardImages: [{ id: 'img1', name: 'Logo', file: 's1.png' }],
    sections: [{ id: 'mine', title: 'Mine', parts: [{ id: 'i1', kind: 'image', layout: 'single', captions: 'one', caption: '', images: [] }] }], order: ['mine'] });
  RD._rd.imgMenu = 'i1:0'; RD._rd.imgPick = false;
  let html = contentOf(h, 'mine');
  assert.match(html, /data-rd-img-from="standard"[^>]*>From Standard Images&hellip;</);
  assert.match(html, /From this computer&hellip;<input type="file" accept="image\/png,image\/jpeg" data-rd-img-file/);
  RD._rd.imgPick = true;
  html = contentOf(h, 'mine');
  assert.match(html, /data-rd-img-std="s1\.png"[^>]*>[\s\S]*?Logo/);
  RD._rd.imgMenu = null; RD._rd.imgPick = false;
});

test('the previews lay out images at their own size once read, and the Generate tab names missing ones', async () => {
  const { makePng } = await import('./image-fixtures.js');
  const png = await makePng({ width: 40, height: 10, sample: () => [1, 2, 3] });
  const h = host({ sections: [{ id: 'mine', title: 'Mine', parts: [{ id: 'i1', kind: 'image', layout: 'pair', captions: 'none',
    images: [{ source: 'report', file: 'a.png', name: 'a.png' }, { source: 'report', file: 'gone.png', name: 'gone.png' }] }] }], order: ['mine'] });
  h.images = { read: async (p) => (p === 'files/report-images/a.png' ? png : null) };
  App.docHost.set(h);
  RD._imageAssets.clear();
  RD.laidOut(h.getState(), null, {});            // starts the reads
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(RD._imageAssets.get('files/report-images/a.png').state, 'ok');
  assert.equal(RD._imageAssets.get('files/report-images/gone.png').state, 'missing');
  const laid = RD.laidOut(h.getState(), null, {});
  const im = laid.pages.flatMap((p) => p.items).find((it) => it.kind === 'image');
  assert.equal(Math.round(im.h * 4), Math.round(im.w));
  App.docHost.set(h); RD.open(); RD.pane('generate');
  const gen = RD.render(h.getState()); RD.close();
  assert.match(gen, /Images missing from the folder[\s\S]*?gone\.png/);
  RD._imageAssets.clear();
});

test('Styles has an Images section after Tables: border, weight and colour when a line, caption position, alignment', () => {
  const names = (html) => [...html.matchAll(/data-rd-style-section="([a-zA-Z0-9]+)"/g)].map((m) => m[1]);
  const html = paneOf(host(), 'styles', 'images');
  const order = names(html);
  assert.equal(order[order.indexOf('tables') + 1], 'images');
  assert.match(html, /data-rd-style-section="images"[^>]*>Images</);
  const f = html.slice(html.indexOf('rd-style-fields'), html.indexOf('rd-style-preview'));
  for (const k of ['images.border', 'images.captionPosition', 'images.align']) assert.match(f, new RegExp(`data-rd-fmt="${k.replace('.', '\\.')}"`), k);
  assert.doesNotMatch(f, /images\.borderWidth/, 'no weight until there is a line');
  const lined = host();
  lined.getState().report.formats[0].images = { border: 'line' };
  const g = paneOf(lined, 'styles', 'images');
  assert.match(g, /data-rd-fmt="images\.borderWidth"/);
  assert.match(g, /data-rd-colour-open="images\.borderColour"/);
});

test('Templates lists Standard Images with Rename and Delete, and a way to add one', () => {
  const html = paneOf(host({ standardImages: [{ id: 'img1', name: 'Logo', file: 's1.png' }] }), 'templates');
  assert.match(html, /<div class="rd-fieldset rd-stdimgs" data-rd-std-drop><strong>Standard Images<\/strong>/);
  assert.match(html, /Logo[\s\S]*?data-rd-std-rename="img1"[\s\S]*?data-rd-std-del="img1"/);
  assert.match(html, /Add image&hellip;<input type="file" accept="image\/png,image\/jpeg" data-rd-std-file>/);
  assert.match(paneOf(host(), 'templates'), /No standard images yet\./);
});
