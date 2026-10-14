import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../../DocGen/doc-designer.js';
import * as D from '../../DocGen/doc-data.js';

const cat = (data) => ({ root: 'platform', data, collections: {
  platform: { label: 'Platform', fields: [{ id: 'name', label: 'Name', type: 'text' }], children: ['hazard'] },
  hazard: { label: 'Hazard', plural: 'Hazards', fields: [{ id: 'id', label: 'ID', type: 'text' }, { id: 'title', label: 'Title', type: 'text' }, { id: 'risk', label: 'Risk', type: 'rating' }], children: ['control'] },
  control: { label: 'Control', plural: 'Controls', fields: [{ id: 'id', label: 'ID', type: 'text' }, { id: 'status', label: 'Status', type: 'text' }], children: [] } } });
const ctl = (key, id, status) => ({ key, values: { id, status }, children: {} });
const DATA = { key: 'p1', values: { name: 'Ship' }, children: { hazard: [
  { key: 'h1', values: { id: 'HAZ-001', title: 'Fire', risk: { text: 'Low', sort: 1 } }, children: { control: [ctl('c1', 'C-001', 'Implemented'), ctl('c2', 'C-002', 'Rejected')] } },
  { key: 'h2', values: { id: 'HAZ-002', title: 'Flood', risk: { text: 'High', sort: 3 } }, children: { control: [ctl('c3', 'C-003', 'Implemented')] } }] } };

const blk = (id, level, extra = {}) => ({ id, kind: 'custom', title: id, label: id, level, parts: [], included: true, ...extra });
const levels = (bs) => Object.fromEntries(bs.map((b) => [b.id, b.level]));

test('a repeating section gives a copy per entry, its id and its parts\' ids suffixed by the entry key', () => {
  const bs = [blk('s1', 1, { repeat: { each: 'hazard' }, title: '{{f:hazard.id}} {{f:hazard.title}}', parts: [{ id: 'p1', kind: 'para', text: 'x' }, { id: 't1', kind: 'table', caption: 'Of {{f:hazard.id}}', header: ['a'], rows: [] }] })];
  const out = D.expandRepeats(bs, cat(DATA), levels(bs));
  assert.deepEqual(out.map((b) => b.id), ['s1~h1', 's1~h2']);
  assert.deepEqual(out[0].parts.map((p) => p.id), ['p1~h1', 't1~h1']);
  assert.equal(out[0].title, 'HAZ-001 Fire', 'the heading is plain text');
  assert.equal(out[1].parts[1].caption, 'Of HAZ-002');
  assert.equal(out[0].templateId, 's1');
  assert.equal(D.instanceKey(out[1].scope), 'hazard:h2');
});

test('the sections under a repeating one repeat with it, levels pinned so an automatic level cannot drift', () => {
  const bs = [blk('top', 1), blk('s1', null, { repeat: { each: 'hazard' } }), blk('sub', 3), blk('after', 1)];
  const lv = { top: 1, s1: 1, sub: 2, after: 1 };
  // s1 resolved to 1 (a sibling of `top`), so `sub` (2) is in its group and `after` (1) is not.
  const out = D.expandRepeats(bs, cat(DATA), lv);
  assert.deepEqual(out.map((b) => b.id), ['top', 's1~h1', 'sub~h1', 's1~h2', 'sub~h2', 'after']);
  assert.deepEqual(out.map((b) => b.level), [1, 1, 2, 1, 2, 1]);
});

test('repeats nest: an inner repeat uses the outer entry\'s children', () => {
  const bs = [blk('s1', 2, { repeat: { each: 'hazard' } }), blk('c', 3, { repeat: { each: 'control', where: { field: 'status', op: 'is', value: 'Implemented' } }, title: '{{f:control.id}}' })];
  const out = D.expandRepeats(bs, cat(DATA), levels(bs));
  assert.deepEqual(out.map((b) => b.id), ['s1~h1', 'c~h1~c1', 's1~h2', 'c~h2~c3']);
  assert.deepEqual(out.map((b) => b.title), ['s1', 'C-001', 's1', 'C-003']);
  assert.equal(D.instanceKey(out[1].scope), 'hazard:h1/control:c1');
});

test('the filter and sort choose and order the copies', () => {
  const bs = [blk('s1', 1, { repeat: { each: 'hazard', sort: { field: 'risk', dir: 'desc' } } })];
  assert.deepEqual(D.expandRepeats(bs, cat(DATA), levels(bs)).map((b) => b.id), ['s1~h2', 's1~h1']);
  const none = [blk('s1', 1, { repeat: { each: 'hazard', where: { field: 'id', op: 'is', value: 'nope' } } }), blk('s2', 2), blk('s3', 1)];
  assert.deepEqual(D.expandRepeats(none, cat(DATA), levels(none)).map((b) => b.id), ['s3'], 'no entries: the group prints nothing');
});

test('unbound, a repeat prints nothing and nothing throws', () => {
  const bs = [blk('s1', 1, { repeat: { each: 'hazard' } }), blk('s2', 1, { title: 'On {{f:platform.name}}' })];
  const out = D.expandRepeats(bs, cat(null), levels(bs));
  assert.deepEqual(out.map((b) => [b.id, b.title]), [['s2', 'On ‹Name›']]);
  assert.deepEqual(D.expandRepeats(bs, null, levels(bs)).map((b) => b.id), ['s2'], 'no catalogue at all');
});

test('contents and metadata inside a group print once, before the copies', () => {
  const bs = [blk('s1', 1, { repeat: { each: 'hazard' } }), { id: 'toc', kind: 'toc', level: 2, included: true }];
  assert.deepEqual(D.expandRepeats(bs, cat(DATA), levels(bs)).map((b) => b.id), ['toc', 's1~h1', 's1~h2']);
});

test('a repeat over a collection not available where it sits prints once with no entry', () => {
  const bs = [blk('c', 1, { repeat: { each: 'control' }, title: '{{f:control.id}}' })];
  const out = D.expandRepeats(bs, cat(DATA), levels(bs));
  assert.deepEqual(out.map((b) => [b.id, b.title]), [['c', '[unknown field]']]);
});

// ---- end to end, through the document builder ------------------------------------------

function host(sections, extra = {}) {
  const state = { report: { sections, pageBreak: Object.fromEntries(sections.map((s) => [s.id, false])), options: { sections: { toc: false, meta: false } }, ...extra } };
  return {
    getState: () => state, commit: (m) => m(state), clock: { nowIso: () => '2026-10-14T00:00:00.000Z' },
    subject: { list: () => [{ id: 'p1', label: 'Ship' }], ready: () => true, meta: () => [] },
    sections: () => [],
    catalogue: (run) => cat(run && run.subjectId ? DATA : null),
  };
}
const build = (h, subjectId = 'p1') => App.docGen.documentFor(h, { ...App.docSession.options(h.getState()), subjectId }, { utc: '2026-10-14T00:00:00Z' }).document;
const text = (rs) => (rs || []).map((r) => (r.br ? '\n' : r.text)).join('');

test('a document repeats a section per hazard with its fields filled in', () => {
  const h = host([
    { id: 's0', title: 'Hazards', parts: [{ id: 'p0', kind: 'para', text: 'On {{f:platform.name}}: {{f:hazard.id?list=comma}}.' }] },
    { id: 's1', title: '{{f:hazard.id}} {{f:hazard.title}}', repeat: { each: 'hazard' }, parts: [
      { id: 'p1', kind: 'para', text: 'Controls: {{f:control.id?list=comma&where=status:is:Implemented}}' },
      { id: 't1', kind: 'table', header: ['Field', 'Value'], rows: [['Title', '{{f:hazard.title}}'], ['Controls', '{{f:control.id?list=num}}']] }] },
    // Controls hang off hazards, so outside a hazard there is none to read.
    { id: 's2', title: 'After', parts: [{ id: 'p2', kind: 'para', text: '{{f:control.id}}' }] },
  ], { levels: { s0: 1, s1: 2, s2: 1 } });
  const blocks = build(h).blocks;
  const heads = blocks.filter((b) => b.kind === 'heading').map((b) => [b.number, text(b.runs)]);
  assert.deepEqual(heads, [['1', 'Hazards'], ['1.1', 'HAZ-001 Fire'], ['1.2', 'HAZ-002 Flood'], ['2', 'After']]);
  const paras = blocks.filter((b) => b.kind === 'paragraph').map((b) => text(b.runs));
  assert.deepEqual(paras, ['On Ship: HAZ-001, HAZ-002.', 'Controls: C-001', 'Controls: C-003', '[unknown field]']);
  const unknown = blocks.filter((b) => b.kind === 'paragraph').pop().runs[0];
  assert.equal(unknown.bold, true);
  const tables = blocks.filter((b) => b.kind === 'table');
  assert.deepEqual(tables[0].rows.map((r) => r.map(text)), [['Title', 'Fire'], ['Controls', '1. C-001\n2. C-002']]);
  assert.deepEqual(tables.map((t) => t.caption && text(t.caption.runs)), ['Table 1: HAZ-001 Fire', 'Table 2: HAZ-002 Flood']);
  assert.notEqual(tables[0].anchor, tables[1].anchor);
});

test('a reference to a repeating section reaches its first copy, and from inside a copy its own', () => {
  const h = host([
    { id: 's1', title: '{{f:hazard.id}}', repeat: { each: 'hazard' }, parts: [{ id: 'p1', kind: 'para', text: 'Here: {{refn:s1}}' }] },
    { id: 's2', title: 'After', parts: [{ id: 'p2', kind: 'para', text: 'See {{refn:s1}}' }] },
  ], { levels: { s1: 1, s2: 1 } });
  const paras = build(h).blocks.filter((b) => b.kind === 'paragraph').map((b) => text(b.runs));
  assert.deepEqual(paras, ['Here: Section 1', 'Here: Section 2', 'See Section 1']);
});

test('with no platform the document builds without the copies', () => {
  const h = host([{ id: 's1', title: '{{f:hazard.id}}', repeat: { each: 'hazard' }, parts: [] }, { id: 's2', title: 'Kept', parts: [] }]);
  const heads = build(h, null).blocks.filter((b) => b.kind === 'heading').map((b) => text(b.runs));
  assert.deepEqual(heads, ['Kept']);
});
