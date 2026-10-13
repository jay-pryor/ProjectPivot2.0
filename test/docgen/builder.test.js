import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../../DocGen/doc-designer.js';
import { isStyle } from '../../DocGen/doc-style.js';

const STAFF = [{ name: 'Grace', role: 'Engineer', band: 'lo' }, { name: 'Ada', role: 'Lead', band: 'hi' }];

/**
 * A minimal host: a grouped and an ungrouped provider section, and a report design with
 * hand-written sections exercising every part kind and section setting.
 * @param {Record<string, any>} [design] merged over the default design
 */
function hostWith(design = {}) {
  const state = {
    report: {
      sections: [
        { id: 'c1', title: 'Notes for /[Date]', parts: [
          { id: 'p1', kind: 'para', text: 'Plain {{b}}bold{{/b}} and {{c}}a_b{{/c}}{{br}}next line.' },
          { id: 'p2', kind: 'para', text: 'See {{ref:staff}}the staff part{{/ref}}, {{ref:staff}}, {{refn:staff}}, {{reft:staff}}, {{ref:t1}}, {{ref:tbl-staff}} and {{ref:gone}}.' },
          { id: 't1', kind: 'table', caption: 'Hand table', header: ['A', 'B'], rows: [['1', '{{b}}2{{/b}}']], widths: [0.25, 0.75] },
          { id: 't2', kind: 'table', noCaption: true, header: ['X'], rows: [['y']] },
          { id: 'r1', kind: 'rule' }, { id: 'b1', kind: 'pagebreak' }, { id: 's1', kind: 'space', height: 12 },
        ] },
        { id: 'c2', title: 'Annex', parts: [{ id: 'p3', kind: 'para', text: 'Annex text.' }] },
        { id: 'c3', title: 'Deep', parts: [] },
        { id: 'c4', title: 'Cover', parts: [] },
      ],
      order: ['c4', 'toc', 'meta', 'staff', 'teams', 'c1', 'c2', 'c3'],
      levels: { c4: 0, staff: 1, teams: 2, c1: 1, c2: 1, c3: 3 },
      intros: { staff: 'About the staff.', teams: 'Unnumbered intro, see {{refn:c2}}.' },
      introNumbered: { staff: true },
      // Every section starts a page unless told not to; here only the Annex does.
      pageBreak: { c4: false, toc: false, meta: false, staff: false, teams: false, c1: false, c3: false },
      space: { c2: 30 },
      centred: { teams: true },
      noToc: { c3: true },
      tables: { staff: { _all: { title: 'Everyone', columns: { role: 'Job' } } } },
      ...design,
    },
  };
  return {
    getState: () => state,
    commit: (m) => m(state),
    clock: { nowIso: () => '2026-10-12T00:00:00.000Z' },
    subject: {
      metaLabel: 'About this region',
      list: () => [{ id: 'r1', label: 'Region One' }],
      ready: () => true,
      meta: () => [{ id: 'region', label: 'Region', value: 'Region One', code: false }],
    },
    sections: () => [
      { id: 'staff', label: 'Staff', keyColumn: { id: '_key', label: 'Name', get: (r) => r.name },
        columns: [{ id: 'role', label: 'Role', get: (r) => r.role }], rows: () => STAFF.map((r) => ({ ...r, key: r.name })) },
      { id: 'teams', label: 'Teams', keyColumn: { id: '_key', label: 'Team', get: (r) => r.name },
        columns: [{ id: 'size', label: 'Size', get: (r) => r.size }], rows: () => [],
        include: { perGroup: true, map: 'datasets', key: 'teams' },
        groups: { field: 'kind', options: [{ value: 'core', label: 'Core' }, { value: 'extra', label: 'Extra' }] } },
    ],
  };
}

function build(design, meta = {}) {
  const host = hostWith(design);
  App.docHost.set(host);
  return App.docGen.documentFor(host, { subjectId: 'r1', tags: { Date: '12 Oct 2026' } }, { title: 'Roster /[Date]', date: '12 Oct 2026', platform: 'Region One', classification: 'OFFICIAL', ...meta });
}
const plain = (runs) => (runs ?? []).map((r) => (r.br ? '\n' : r.text)).join('');
const headings = (doc) => doc.blocks.filter((b) => b.kind === 'heading');
const heading = (doc, text) => headings(doc).find((h) => plain(h.runs) === text);
const tables = (doc) => doc.blocks.filter((b) => b.kind === 'table');

test('the document is blocks in the outline\'s order: title, contents, metadata, sections, hand-written parts', () => {
  const { document } = build();
  assert.deepEqual(document.blocks.map((b) => b.kind), [
    'heading',                                     // Cover (title level)
    'heading', 'toc',                              // Contents
    'heading', 'table',                            // About this region
    'heading', 'paragraph', 'table',               // Staff: intro, table
    'heading', 'paragraph', 'table', 'table',      // Teams: intro, two group tables
    'heading', 'paragraph', 'paragraph', 'table', 'table', 'rule', 'pageBreak', 'space', // Notes
    'pageBreak', 'heading', 'paragraph',          // Annex starts a page
    'heading',                                     // Deep
  ]);
  assert.deepEqual(document.meta, { title: 'Roster 12 Oct 2026', platform: 'Region One', date: '12 Oct 2026', marking: 'OFFICIAL' });
});

test('numbering follows the outline; titles take none; an intro takes its own when asked', () => {
  const { document } = build();
  assert.deepEqual(headings(document).map((h) => [plain(h.runs), h.level, h.number]), [
    ['Cover', 0, ''], ['Contents', 0, ''], ['About this region', 1, '1'], ['Staff', 1, '2'], ['Teams', 2, '2.2'],
    ['Notes for 12 Oct 2026', 1, '3'], ['Annex', 1, '4'], ['Deep', 2, '4.1'],
  ]);
  const intro = document.blocks[document.blocks.indexOf(heading(document, 'Staff')) + 1];
  assert.equal(plain(intro.runs), '2.1 About the staff.');
  const teamsIntro = document.blocks[document.blocks.indexOf(heading(document, 'Teams')) + 1];
  assert.equal(plain(teamsIntro.runs), 'Unnumbered intro, see Section 4.');
  assert.equal(teamsIntro.runs.find((r) => r.ref).ref.anchor, 'sec-c2', 'a reference in an introduction is a link (REF-1)');
});

test('a numbering format of 1.1 leaves third-level headings unnumbered; numbering off numbers nothing', () => {
  const style = (numbering) => ({ id: 's1', name: 'S', page: { margins: {} }, text: {}, numbering });
  const { document } = build({ formats: [style({ format: '1.1' })], formatId: 's1', levels: { c4: 0, staff: 1, teams: 2, c1: 1, c2: 1, c3: 3 }, noToc: {} });
  assert.equal(heading(document, 'Deep').level, 2, 'clamped to one below Annex');
  const off = build({ formats: [style({ on: false })], formatId: 's1' }).document;
  assert.ok(headings(off).every((h) => h.number === ''));
});

test('section settings reach the heading: a page break before, space before, centring and staying out of the contents', () => {
  const { document } = build();
  const annex = document.blocks.indexOf(heading(document, 'Annex'));
  assert.equal(document.blocks[annex - 1].kind, 'pageBreak');
  assert.equal(heading(document, 'Annex').spaceBefore, 30);
  assert.equal(heading(document, 'Teams').centre, true);
  assert.equal(tables(document).filter((t) => t.centre).length, 2, 'the Teams tables are centred');
  const centred = document.blocks.filter((b) => b.centre).map((b) => b.kind);
  assert.deepEqual(centred, ['heading', 'paragraph', 'table', 'table'], 'centring one section centres only that section (D-044)');
  assert.equal(heading(document, 'Deep').noToc, true);
  assert.equal(heading(document, 'Contents').noToc, true);
  assert.equal(heading(document, 'Staff').anchor, 'sec-staff');
});

test('tables are numbered in the order they appear; an uncaptioned one takes no number', () => {
  const { document } = build();
  assert.deepEqual(tables(document).map((t) => (t.caption ? plain(t.caption.runs) : null)), [
    'Table 1: About this region', 'Table 2: Everyone', 'Table 3: Teams', 'Table 4: Teams', 'Table 5: Hand table', null,
  ]);
  assert.deepEqual(tables(document).map((t) => t.anchor), ['tbl-meta', 'tbl-staff', 'tbl-teams-core', 'tbl-teams-extra', 'tbl-t1', 'tbl-t2']);
});

test('a generated table: header with the operator\'s wording, title row, rows sorted by key, key column as code', () => {
  const t = tables(build().document)[1];
  assert.deepEqual(t.header.map(plain), ['Name', 'Job']);
  assert.equal(plain(t.titleRow), 'Everyone');
  assert.deepEqual(t.rows.map((r) => r.map(plain)), [['Ada', 'Lead'], ['Grace', 'Engineer']]);
  assert.equal(t.rows[0][0][0].code, true);
  assert.equal(t.rows[0][1][0].code, undefined);
});

test('an empty generated table is one "None." row; the metadata table lists the subject', () => {
  const ts = tables(build().document);
  assert.deepEqual(ts[2].rows.map((r) => r.map(plain)), [['None.', '']]);
  assert.deepEqual(ts[0].header.map(plain), ['Field', 'Value']);
  assert.deepEqual(ts[0].rows.map((r) => r.map(plain)), [['Region', 'Region One']]);
});

test('hand-written text becomes runs: bold, code taken whole, line breaks', () => {
  const p = build().document.blocks.find((b) => b.kind === 'paragraph' && plain(b.runs).startsWith('Plain'));
  assert.deepEqual(p.runs, [{ text: 'Plain ' }, { text: 'bold', bold: true }, { text: ' and ' }, { text: 'a_b', code: true }, { br: true }, { text: 'next line.' }]);
  assert.equal(p.anchor, 'par-p1');
});

test('references read as the old ones did, each linked; a missing one says so in bold', () => {
  const p = build().document.blocks.find((b) => b.kind === 'paragraph' && plain(b.runs).startsWith('See'));
  const refs = p.runs.filter((r) => r.ref).map((r) => [r.text, r.ref.anchor]);
  // A bare reference with a later {{/ref}} would take everything up to it as its words (the grammar), so own words come first.
  assert.deepEqual(refs, [['the staff part', 'sec-staff'], ['Section 2 — Staff', 'sec-staff'], ['Section 2', 'sec-staff'], ['Staff', 'sec-staff'],
    ['Table 5: Hand table', 'tbl-t1'], ['Table 2: Everyone', 'tbl-staff']]);
  assert.ok(p.runs.some((r) => r.text === '[missing reference]' && r.bold && !r.ref));
});

test('a hand-made table keeps its widths and its cells\' formatting', () => {
  const t = tables(build().document)[4];
  assert.deepEqual(t.columns.map((c) => c.width), [0.25, 0.75]);
  assert.deepEqual(t.rows[0][1], [{ text: '2', bold: true }]);
});

test('/[Tags] are filled in headings, the title and the footer; one with no value stays and is listed', () => {
  const r = build({ formats: [{ id: 's1', name: 'S', page: { margins: {} }, text: {}, headerFooter: { footer: { left: 'Issued /[Date]', right: '/[Ref]' } } }], formatId: 's1' });
  assert.equal(r.style.headerFooter.footer.left, 'Issued 12 Oct 2026');
  assert.equal(r.style.headerFooter.footer.right, '/[Ref]');
  assert.deepEqual(r.tags, ['Ref']);
  assert.ok(heading(r.document, 'Notes for 12 Oct 2026'));
});

test('the style is the project\'s, and an old LaTeX-era profile is converted to a Style', () => {
  const old = { id: 'p1', name: 'House', page: { paper: 'letter', fontSize: '12pt' }, headings: { numbered: true }, levels: [] };
  const r = build({ formats: [old], formatId: 'p1' });
  assert.ok(isStyle(r.style));
  assert.equal(r.style.page.paper, 'letter');
  assert.equal(r.style.text.body.size, 12);
  assert.equal(build().style.id, 'standard');
});

test('App.md.runs balances a stray close and drops trailing breaks', () => {
  assert.deepEqual(App.md.runs('a{{/b}}b{{i}}c{{br}}'), [[{ text: 'a' }, { text: 'b' }, { text: 'c', italic: true }]]);
  assert.deepEqual(App.md.runs('one\n\ntwo').map((p) => p.map((r) => r.text)), [['one'], ['two']]);
});

test('Final review I1: a line break in register text is a line break in the cell, not words run together', () => {
  const blocks = [{ id: 's', kind: 'section', label: 'S', title: 'S', included: true, level: 1,
    content: [{ captionId: 's', captionText: 'S', header: ['A'], rows: [[{ text: 'one\ntwo\r\nthree' }]] }] }];
  const t = App.docGen.buildDocument(null, blocks, {}).document.blocks.find((b) => b.kind === 'table');
  assert.deepEqual(t.rows[0][0], [{ text: 'one' }, { br: true }, { text: 'two' }, { br: true }, { text: 'three' }]);
});

test('Final review I4: a section with a level but no title is still a reference target with a place on the page', () => {
  const blocks = [{ id: 'c1', kind: 'custom', label: '', title: '', included: true, level: 1, parts: [{ id: 'p1', kind: 'para', text: 'Body text.' }] },
    { id: 'c2', kind: 'custom', label: 'Two', title: 'Two', included: true, level: 1, parts: [{ id: 'p2', kind: 'para', text: 'See {{ref:c1}}.' }] }];
  const built = App.docGen.buildDocument(null, blocks, {});
  const first = built.document.blocks[0];
  assert.equal(first.anchor, 'sec-c1', 'the untitled section\'s anchor sits on its first block');
});

test('Final review I5: a Style that leaves out the contents list leaves out the contents section', () => {
  const r = build({ formats: [{ id: 's1', name: 'S', page: { margins: {} }, text: {}, toc: { include: false } }], formatId: 's1' });
  assert.ok(!r.document.blocks.some((b) => b.kind === 'toc'));
});

test('centring is chosen per part: heading, introduction and table separately; an old "centre everything" still centres everything', () => {
  const kindsCentred = (design) => build(design).document.blocks
    .filter((b) => b.centre && (b.kind === 'heading' ? plain(b.runs) === 'Teams' : true)).map((b) => b.kind);
  assert.deepEqual(kindsCentred({ centred: { teams: { heading: true } } }), ['heading']);
  assert.deepEqual(kindsCentred({ centred: { teams: { intro: true } } }), ['paragraph']);
  assert.deepEqual(kindsCentred({ centred: { teams: { table: true } } }), ['table', 'table']);
  assert.deepEqual(kindsCentred({ centred: { teams: true } }), ['heading', 'paragraph', 'table', 'table']);
});

test('your own section centres its heading and its content separately', () => {
  const doc = build({ centred: { c2: { content: true } } }).document;
  assert.equal(heading(doc, 'Annex').centre, false);
  assert.equal(doc.blocks.find((b) => b.kind === 'paragraph' && plain(b.runs) === 'Annex text.').centre, true);
  const doc2 = build({ centred: { c2: { heading: true } } }).document;
  assert.equal(heading(doc2, 'Annex').centre, true);
  assert.equal(doc2.blocks.find((b) => b.kind === 'paragraph' && plain(b.runs) === 'Annex text.').centre, false);
});

const pic = (file, o = {}) => ({ source: 'report', file, name: file, ...o });

test('image parts are figures, numbered apart from tables, with one caption or one each', () => {
  const { document, refs } = build({ sections: [{ id: 'c1', title: 'Pictures', parts: [
    { id: 'i1', kind: 'image', layout: 'pair', captions: 'one', caption: 'Both of them', images: [pic('a.png', { width: 40 }), pic('b.png', { source: 'standard', noBorder: true })] },
    { id: 't1', kind: 'table', caption: 'A table', header: ['A'], rows: [['1']] },
    { id: 'i2', kind: 'image', layout: 'grid4', captions: 'separate', caption: '', images: [pic('c.png', { caption: 'Third' }), null, pic('d.png')] },
    { id: 'i3', kind: 'image', layout: 'single', captions: 'none', images: [pic('e.png')] },
    { id: 'i4', kind: 'image', layout: 'single', captions: 'one', caption: 'Empty', images: [null] },
  ] }], order: ['c1'] });
  const figs = document.blocks.filter((b) => b.kind === 'figure');
  assert.equal(figs.length, 3, 'a block with no image is left out');
  assert.equal(plain(figs[0].caption.runs), 'Figure 1: Both of them');
  assert.equal(figs[0].anchor, 'fig-i1');
  assert.deepEqual(figs[0].images.map((i) => [i.src, i.width, i.border]), [['files/report-images/a.png', 0.4, true], ['files/standard-images/b.png', 1, false]]);
  assert.equal(figs[1].caption, null);
  assert.equal(figs[1].images.length, 4);
  assert.equal(plain(figs[1].images[0].caption.runs), 'Figure 2: Third');
  assert.equal(figs[1].images[0].anchor, 'fig-i2-1');
  assert.equal(figs[1].images[1], null);
  assert.equal(plain(figs[1].images[2].caption.runs), 'Figure 3');
  assert.equal(figs[2].caption, null);
  assert.equal(figs[2].images[0].caption, null);
  const t = document.blocks.find((b) => b.kind === 'table' && b.anchor === 'tbl-t1');
  assert.match(plain(t.caption.runs), /^Table \d+: A table$/);
  const f = refs.targets.filter((x) => x.kind === 'figure');
  assert.deepEqual(f.map((x) => [x.id, x.label, x.numberLabel, x.titleLabel]), [
    ['i1', 'Figure 1: Both of them', 'Figure 1', 'Both of them'], ['i2.1', 'Figure 2: Third', 'Figure 2', 'Third'], ['i2.3', 'Figure 3', 'Figure 3', 'Figure 3']]);
});

test('a link to a figure reads as the figure and jumps to it', () => {
  const { document } = build({ sections: [{ id: 'c1', title: 'Pictures', parts: [
    { id: 'p1', kind: 'para', text: 'See {{refn:i1}} and {{ref:i2.1}}.' },
    { id: 'i1', kind: 'image', layout: 'single', captions: 'one', caption: 'Map', images: [pic('a.png')] },
    { id: 'i2', kind: 'image', layout: 'pair', captions: 'separate', images: [pic('b.png', { caption: 'Left' }), pic('c.png')] },
  ] }], order: ['c1'] });
  const para = document.blocks.find((b) => b.kind === 'paragraph' && /See/.test(plain(b.runs)));
  assert.equal(plain(para.runs), 'See Figure 1 and Figure 2: Left.');
  assert.ok(para.runs.some((r) => r.ref && r.ref.anchor === 'fig-i1'));
});

test('more images than the layout has boxes: the extra ones are kept but not shown', () => {
  const { document } = build({ sections: [{ id: 'c1', title: 'P', parts: [
    { id: 'i1', kind: 'image', layout: 'single', captions: 'none', images: [pic('a.png'), pic('b.png')] }] }], order: ['c1'] });
  assert.deepEqual(document.blocks.find((b) => b.kind === 'figure').images.map((i) => i.name), ['a.png']);
});

test('every section starts on a new page unless it is told not to', () => {
  const { document } = build({ pageBreak: undefined });
  for (const t of ['Contents', 'Staff', 'Teams', 'Notes for 12 Oct 2026', 'Annex', 'Deep']) {
    const at = document.blocks.indexOf(heading(document, t));
    assert.equal(document.blocks[at - 1].kind, 'pageBreak', t);
  }
  const { document: d2 } = build({ pageBreak: { staff: false } });
  const staff = d2.blocks.indexOf(heading(d2, 'Staff'));
  assert.notEqual(d2.blocks[staff - 1].kind, 'pageBreak');
});
