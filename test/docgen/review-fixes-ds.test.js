import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../../DocGen/doc-designer.js';

const RD = App.ui.views.reportDesign;
const COLLS = {
  platform: { label: 'Platform', fields: [{ id: 'name', label: 'Name', type: 'text' }], children: ['hazard'] },
  hazard: { label: 'Hazard', plural: 'Hazards', fields: [{ id: 'id', label: 'ID', type: 'text' }, { id: 'title', label: 'Title', type: 'text' }], children: ['control'] },
  control: { label: 'Control', plural: 'Controls', fields: [{ id: 'id', label: 'ID', type: 'text' }], children: [] },
};
const ctl = (key, id) => ({ key, values: { id }, children: {} });
const hz = (key, id, title, controls) => ({ key, values: { id, title }, children: { control: controls } });
const DATA = { key: 'p1', values: { name: 'Ship' }, children: { hazard: [hz('h1', 'HAZ-001', 'Fire /[Date] {{b}}y{{/b}}', [ctl('c1', 'C-001'), ctl('c2', 'C-002')]), hz('h2', 'HAZ-002', 'Flood', [ctl('c3', 'C-003')])] } };

function host(report) {
  const state = { report: { options: { sections: { toc: false, meta: false } }, ...report } };
  const h = {
    getState: () => state, commit: (m) => m(state), clock: { nowIso: () => '2026-10-14T00:00:00.000Z' },
    subject: { list: () => [{ id: 'p1', label: 'Ship' }], ready: () => true, meta: () => [] },
    sections: () => [],
    catalogue: (run) => ({ root: 'platform', collections: COLLS, data: run && run.subjectId ? DATA : null }),
  };
  App.docHost.set(h);
  return h;
}
const text = (rs) => (rs || []).map((r) => (r.br ? '\n' : r.text)).join('');
const build = (h, tags = {}) => App.docGen.documentFor(h, { ...App.docSession.options(h.getState()), subjectId: 'p1', tags }, { utc: '2026-10-14T00:00:00Z', tags });

test('register text in a field is never a placeholder or markup: in a heading, a paragraph, a cell or a caption', () => {
  const h = host({ sections: [{ id: 's1', title: '{{f:hazard.title}} /[Date]', repeat: { each: 'hazard' }, parts: [
    { id: 'p1', kind: 'para', text: '{{f:hazard.title}} /[Date]' },
    { id: 't1', kind: 'table', caption: 'Cap {{f:hazard.title}}', header: ['A'], rows: [['{{f:hazard.title}}']] }] }] });
  const built = build(h, { Date: 'TAGGED' });
  const b = built.document.blocks;
  const raw = 'Fire /[Date] {{b}}y{{/b}}';
  assert.equal(text(b.find((x) => x.kind === 'heading').runs), raw + ' TAGGED', 'the template\'s own tag is filled; the value\'s is not');
  assert.equal(text(b.find((x) => x.kind === 'paragraph').runs), raw + ' TAGGED');
  const t = b.find((x) => x.kind === 'table');
  assert.equal(text(t.rows[0][0]), raw);
  assert.equal(text(t.caption.runs), 'Table 1: Cap ' + raw);
  assert.deepEqual(build(h).tags, ['Date'], 'a tag in register text is not asked about');
  assert.doesNotMatch(JSON.stringify(built.document), /[]/);
});

test('a reference to a part inside a Repeat part reaches the first copy, and from inside a copy its own', () => {
  const h = host({ levels: { s1: 1, s2: 1 }, sections: [
    { id: 's1', title: '{{f:hazard.id}}', repeat: { each: 'hazard' }, parts: [
      { id: 'rp', kind: 'repeat', repeat: { each: 'control' }, parts: [
        { id: 'tB', kind: 'table', caption: 'C {{f:control.id}}', header: ['A'], rows: [['x']] },
        { id: 'pB', kind: 'para', text: 'Here {{refn:tB}}' }] }] },
    { id: 's2', title: 'After', parts: [{ id: 'p2', kind: 'para', text: 'See {{refn:tB}}' }] }] });
  const paras = build(h).document.blocks.filter((x) => x.kind === 'paragraph').map((x) => text(x.runs));
  assert.deepEqual(paras, ['Here Table 1', 'Here Table 2', 'Here Table 3', 'See Table 1']);
});

test('the link targets offer a repeated section or part once, by its own id, never a copy\'s', () => {
  const h = host({ levels: { s1: 1 }, sections: [{ id: 's1', title: '{{f:hazard.id}}', repeat: { each: 'hazard' }, parts: [{ id: 't1', kind: 'table', header: ['A'], rows: [['x']] }] }] });
  const targets = build(h).refs.targets;
  assert.ok(targets.every((t) => !t.id.includes('~')), targets.map((t) => t.id).join(' '));
  const s1 = targets.find((t) => t.id === 's1');
  assert.match(s1.label, /HAZ-001.*\(each copy\)/);
  assert.ok(targets.find((t) => t.id === 't1'));
});

test('a section made from a template gets fresh ids for nested parts and fresh blanks', () => {
  const h = host({ sections: [{ id: 'sec1', title: 'A', parts: [{ id: 'rp1', kind: 'repeat', repeat: { each: 'control' }, parts: [
    { id: 'part2', kind: 'para', text: 'x {{fill:fill1?label=Why}}' }] }] }] });
  const t = App.docStore.saveSectionTemplate('sec1', 'T');
  const made = App.docStore.useSectionTemplate(t.id);
  const st = h.getState().report;
  const copy = st.sections.find((s) => s.id === made.id);
  const ids = (ps) => ps.flatMap((p) => [p.id, ...(p.parts ? ids(p.parts) : [])]);
  const before = ids(st.sections[0].parts);
  assert.ok(ids(copy.parts).every((id) => !before.includes(id)), ids(copy.parts).join(' '));
  assert.doesNotMatch(JSON.stringify(copy.parts), /fill:fill1\b/);
  assert.match(JSON.stringify(copy.parts), /\{\{fill:fill\d+\?label=Why\}\}/);
});

test('removing leftover answers from one section keeps those of a section left out for now', () => {
  const h = host({ levels: { s1: 1, s2: 1 }, options: { sections: { toc: false, meta: false, s2: false } },
    sections: [{ id: 's1', title: '{{f:hazard.id}}', repeat: { each: 'hazard' }, parts: [{ id: 'p1', kind: 'para', text: '{{fill:fill1?label=A}}' }] },
      { id: 's2', title: '{{f:hazard.id}}', repeat: { each: 'hazard' }, parts: [{ id: 'p2', kind: 'para', text: '{{fill:fill2?label=B}}' }] }],
    fills: { fill1: { 'hazard:h9': 'gone' }, fill2: { 'hazard:h1': 'kept while left out' } } });
  const f = App.docGen.fillsIn(h, { ...App.docSession.options(h.getState()), subjectId: 'p1' });
  assert.deepEqual(f.leftovers, { fill1: 1 }, 'a left-out section\'s answers are not leftovers');
  App.docStore.pruneFills(f.live, ['fill1']);
  assert.deepEqual(h.getState().report.fills, { fill2: { 'hazard:h1': 'kept while left out' } });
});

test('the preview of a plain section inside a repeating group shows its first copy', () => {
  const h = host({ levels: { s1: 1, sub: 2 }, pageBreak: { s1: false, sub: false }, sections: [
    { id: 's1', title: '{{f:hazard.id}}', repeat: { each: 'hazard' }, parts: [] },
    { id: 'sub', title: 'Controls of {{f:hazard.id}}', parts: [] }] });
  RD.open(); RD.pane('section');
  Object.assign(RD._rd, { selected: 'sub', secCat: 'heading', preview: null });
  const html = RD.render(h.getState());
  RD.close(); Object.assign(RD._rd, { selected: null, secCat: null });
  assert.doesNotMatch(html, /This section is not on the page/);
  assert.match(html, /rd-secprev[\s\S]*>Controls<[\s\S]*>HAZ-001</, 'its first copy, on the page');
});

test('drawing a section full of field chips asks the host for its sections a handful of times, not once per chip', () => {
  const cells = Array.from({ length: 30 }, (_, i) => ['{{f:hazard.id}}', '{{f:hazard.title}} ' + i]);
  const h = host({ levels: { s1: 1 }, sections: [{ id: 's1', title: '{{f:hazard.id}}', repeat: { each: 'hazard' }, parts: [
    { id: 't1', kind: 'table', header: ['A', 'B'], rows: cells }, { id: 'p1', kind: 'para', text: '{{f:hazard.id}}' }] }] });
  let calls = 0;
  const inner = h.sections;
  h.sections = (run) => { calls++; return inner(run); };
  RD.open(); RD.pane('section');
  Object.assign(RD._rd, { selected: 's1', secCat: 'content', preview: null });
  RD.render(h.getState());
  RD.close(); Object.assign(RD._rd, { selected: null, secCat: null });
  assert.ok(calls <= 10, `${calls} calls`);
});
