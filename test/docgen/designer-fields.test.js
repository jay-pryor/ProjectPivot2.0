import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../../DocGen/doc-designer.js';

const RD = App.ui.views.reportDesign;

const COLLS = {
  platform: { label: 'Platform', fields: [{ id: 'name', label: 'Name', type: 'text' }], children: ['hazard', 'reference'] },
  hazard: { label: 'Hazard', plural: 'Hazards', fields: [{ id: 'id', label: 'ID', type: 'text' }, { id: 'title', label: 'Title', type: 'text' }], children: ['control'] },
  control: { label: 'Control', plural: 'Controls', fields: [{ id: 'id', label: 'ID', type: 'text' }, { id: 'status', label: 'Status', type: 'text' }], children: [] },
  reference: { label: 'Reference', plural: 'References', fields: [{ id: 'title', label: 'Title', type: 'text' }], children: [] },
};
const DATA = { key: 'p1', values: { name: 'Ship' }, children: { reference: [], hazard: [
  { key: 'h1', values: { id: 'HAZ-001', title: 'Fire' }, children: { control: [] } },
  { key: 'h2', values: { id: 'HAZ-002', title: 'Flood' }, children: { control: [] } }] } };

function host(sections, extra = {}, withCatalogue = true) {
  const state = { report: { sections, ...extra } };
  return {
    getState: () => state, commit: (m) => m(state), clock: { nowIso: () => '2026-10-14T00:00:00.000Z' },
    subject: { list: () => [{ id: 'p1', label: 'Ship' }], ready: () => true, meta: () => [] },
    sections: () => [],
    ...(withCatalogue ? { catalogue: (run) => ({ root: 'platform', collections: COLLS, data: run && run.subjectId ? DATA : null }) } : {}),
  };
}
const SECTIONS = () => [
  { id: 'sec1', title: '{{f:hazard.id}} {{f:hazard.title}}', repeat: { each: 'hazard' }, parts: [{ id: 'part1', kind: 'para', text: 'Risk of {{f:hazard.title}}' }] },
  { id: 'sec2', title: 'Controls', parts: [{ id: 'part2', kind: 'table', header: ['A'], rows: [['{{f:control.id}}']] }] },
  { id: 'sec3', title: 'Elsewhere', parts: [] },
];
const LEVELS = { sec1: 1, sec2: 2, sec3: 1 };

function render(h, set = {}) {
  App.docHost.set(h);
  RD.open();
  RD.pane('section');
  Object.assign(RD._rd, { selected: null, secCat: null, fieldFor: null, chipEdit: null }, set);
  const html = RD.render(h.getState());
  RD.close();
  Object.assign(RD._rd, { selected: null, secCat: null, fieldFor: null, chipEdit: null });
  return html;
}

test('the Sections list names a field by its label and marks a repeating section', () => {
  const html = render(host(SECTIONS(), { levels: LEVELS }));
  assert.match(html, /‹Hazard › ID› ‹Hazard › Title›/);
  assert.match(html, /<span class="rd-kind rd-repeats"[^>]*>↻ per Hazard<\/span>/);
});

test('a paragraph shows its field as a chip and offers the Field button', () => {
  const html = render(host(SECTIONS(), { levels: LEVELS }), { selected: 'sec1', secCat: 'content' });
  assert.match(html, /<span class="rd-chip rd-field" contenteditable="false" data-rd-tok="f:hazard\.title"[^>]*>Hazard › Title<\/span>/);
  assert.match(html, /data-rd-field-open="part1"/);
});

test('the Field menu offers what is in scope: inside a hazard group, the hazard and its controls', () => {
  const html = render(host(SECTIONS(), { levels: LEVELS }), { selected: 'sec2', secCat: 'content', fieldFor: 'part2' });
  assert.match(html, /class="rd-fieldmenu"/);
  assert.match(html, /data-rd-field-pick="f:hazard\.title"/);
  assert.match(html, /data-rd-field-pick="f:platform\.name"/);
  assert.match(html, /data-rd-field-pick="f:control\.status"[^>]*draggable="true"|draggable="true"[^>]*data-rd-field-pick="f:control\.status"/);
  assert.match(html, /Controls <em>list<\/em>/);
});

test('outside any repeat the menu has the platform and its lists, not a single hazard', () => {
  const html = render(host(SECTIONS(), { levels: LEVELS }), { selected: 'sec3', secCat: 'heading', fieldFor: 'head:sec3' });
  assert.match(html, /data-rd-field-pick="f:platform\.name"/);
  assert.match(html, /Hazards <em>list<\/em>/);
  assert.doesNotMatch(html, /data-rd-field-pick="f:control\./);
});

test('a field not available where it sits is a broken chip', () => {
  const html = render(host([{ id: 'sec3', title: 'X', parts: [{ id: 'part3', kind: 'para', text: '{{f:control.id}} {{f:nope.x}}' }] }]), { selected: 'sec3', secCat: 'content' });
  assert.match(html, /rd-chip rd-field rd-broken" contenteditable="false" data-rd-tok="f:nope\.x"/);
  assert.match(html, /rd-chip rd-field rd-broken" contenteditable="false" data-rd-tok="f:control\.id"/);
});

test('a custom section\'s heading is a one-line box that takes fields', () => {
  const html = render(host(SECTIONS(), { levels: LEVELS }), { selected: 'sec1', secCat: 'heading' });
  assert.match(html, /data-rd-rich[^>]*data-rd-sec-heading-rich="sec1"/);
  assert.match(html, /data-rd-field-open="head:sec1"/);
});

test('the Repeat category: what it can repeat for, the filter and the sort', () => {
  const html = render(host(SECTIONS(), { levels: LEVELS }), { selected: 'sec1', secCat: 'repeat' });
  assert.match(html, /data-rd-sec-cat="repeat"/);
  const opts = [...html.matchAll(/<option value="([^"]*)"[^>]*>[^<]*<\/option>/g)].map((m) => m[1]);
  assert.ok(opts.includes('hazard') && opts.includes('reference'), 'the platform\'s children');
  assert.match(html, /<select data-rd-repeat-each="sec1"[^>]*>[\s\S]*?<option value="hazard" selected>/);
  assert.match(html, /data-rd-repeat-wfield="sec1"/);
  assert.match(html, /data-rd-repeat-sfield="sec1"/);
  assert.match(html, /Repeats with: Controls/);
  assert.match(html, /2 hazards on Ship/);
});

test('inside a hazard group a section can repeat per control', () => {
  const html = render(host(SECTIONS(), { levels: LEVELS }), { selected: 'sec2', secCat: 'repeat' });
  assert.match(html, /<select data-rd-repeat-each="sec2"[\s\S]*?<option value="control">Control<\/option>/);
});

test('with no platform chosen the workspace still draws', () => {
  const h = host(SECTIONS(), { levels: LEVELS });
  h.subject.list = () => [];
  for (const cat of ['heading', 'repeat', 'content', 'placement']) assert.ok(render(h, { selected: 'sec1', secCat: cat }).length > 0, cat);
});

test('a host with no catalogue has no Field button and no Repeat category', () => {
  const html = render(host(SECTIONS(), { levels: LEVELS }, false), { selected: 'sec1', secCat: 'content' });
  assert.doesNotMatch(html, /data-rd-field-open|data-rd-sec-cat="repeat"/);
});

test('the section preview of a repeating section shows its first copy and says how many there are', () => {
  const html = render(host(SECTIONS(), { levels: LEVELS, pageBreak: { sec1: false, sec2: false, sec3: false } }), { selected: 'sec1', secCat: 'heading' });
  assert.match(html, /1 of 2 hazards/);
  assert.match(html, /HAZ-001/);
});

test('a field chip being edited shows its options: sort, filter, list style and empty wording for a list', () => {
  const secs = SECTIONS();
  secs[1].parts.push({ id: 'part4', kind: 'para', text: 'Controls: {{f:control.id?sort=status:desc}}' });
  const html = render(host(secs, { levels: LEVELS }), { selected: 'sec2', secCat: 'content', chipEdit: { owner: 'part4', key: '[data-rd-text="part4"]', at: 10, tag: 'f:control.id?sort=status:desc' } });
  assert.match(html, /class="rd-chipedit"/);
  assert.match(html, /<select data-rd-chip-sfield[^>]*>[\s\S]*?<option value="status" selected>/);
  assert.match(html, /<select data-rd-chip-sdir[^>]*>[\s\S]*?<option value="desc" selected>/);
  assert.match(html, /data-rd-chip-wfield/);
  assert.match(html, /<select data-rd-chip-list/);
  assert.match(html, /data-rd-chip-empty[^>]*placeholder="Nil"/);
});

test('a single-value chip offers only its empty wording', () => {
  const html = render(host(SECTIONS(), { levels: LEVELS }), { selected: 'sec1', secCat: 'content', chipEdit: { owner: 'part1', key: '[data-rd-text="part1"]', at: 8, tag: 'f:hazard.title' } });
  assert.match(html, /class="rd-chipedit"/);
  assert.match(html, /data-rd-chip-empty/);
  assert.doesNotMatch(html, /data-rd-chip-list|data-rd-chip-sfield/);
});
