import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../../DocGen/doc-data.js';

const cat = { root: 'platform', collections: {
  platform: { label: 'Platform', fields: [{ id: 'name', label: 'Name', type: 'text' }], children: ['hazard'] },
  hazard: { label: 'Hazard', plural: 'Hazards', fields: [{ id: 'id', label: 'ID', type: 'text' }, { id: 'causes', label: 'Causes', type: 'list' }, { id: 'risk', label: 'Risk', type: 'rating' }, { id: 'note', label: 'Note', type: 'text' }], children: ['report'] },
  report: { label: 'Safety report', fields: [{ id: 'date', label: 'Date', type: 'date' }, { id: 'text', label: 'Text', type: 'text' }, { id: 'type', label: 'Type', type: 'text' }], children: [] } } };
const r1 = { key: 'r1', values: { date: { text: '1 Jan 2026', sort: '2026-01-01' }, text: 'earlier', type: 'Near miss' }, children: {} };
const r2 = { key: 'r2', values: { date: { text: '2 Jan 2026', sort: '2026-01-02' }, text: 'later', type: 'Incident' }, children: {} };
const h1 = { key: 'h1', values: { id: 'HAZ-001', causes: ['a', 'b'], risk: { text: 'High (2B)', sort: 3 }, note: '' }, children: { report: [r2, r1] } };
const h2 = { key: 'h2', values: { id: 'HAZ-002', causes: [], risk: { text: 'Low (5G)', sort: 1 }, note: 'x' }, children: { report: [] } };
const h3 = { key: 'h3', values: { id: 'HAZ-010', causes: ['c'], risk: { text: 'High (1A)', sort: 3 }, note: '' }, children: { report: [] } };
const data = { key: 'p1', values: { name: 'Ship' }, children: { hazard: [h1, h2, h3] } };
const inH1 = () => D.rootScope(data).concat([{ coll: 'hazard', entry: h1 }]);

test('a field tag parses and formats back, options URI-encoded', () => {
  const p = D.parseFieldTag('f:report.text?sort=date:desc&where=type:is:Near%20miss&list=num&empty=None%20yet');
  assert.deepEqual(p, { coll: 'report', field: 'text', opts: { sort: { field: 'date', dir: 'desc' }, where: { field: 'type', op: 'is', value: 'Near miss' }, list: 'num', empty: 'None yet' } });
  assert.equal(D.fieldTag(p.coll, p.field, p.opts), 'f:report.text?sort=date:desc&where=type:is:Near%20miss&list=num&empty=None%20yet');
  assert.equal(D.fieldTag('hazard', 'id', {}), 'f:hazard.id');
  assert.equal(D.parseFieldTag('f:nodot'), null);
  assert.equal(D.parseFieldTag('ref:x'), null);
});

test('a value given as a colon survives the round trip', () => {
  const tag = D.fieldTag('report', 'text', { where: { field: 'type', op: 'is', value: 'a:b&c' } });
  assert.deepEqual(D.parseFieldTag(tag).opts.where, { field: 'type', op: 'is', value: 'a:b&c' });
});

test('a fill tag parses and formats back', () => {
  assert.deepEqual(D.parseFillTag('fill:fill3?label=Control%20rationale'), { id: 'fill3', label: 'Control rationale' });
  assert.equal(D.fillTag('fill3', 'Control rationale'), 'fill:fill3?label=Control%20rationale');
  assert.equal(D.parseFillTag('f:hazard.id'), null);
});

test('textOf and sortOf read plain and {text, sort} values', () => {
  assert.equal(D.textOf('x'), 'x');
  assert.equal(D.textOf(null), '');
  assert.equal(D.textOf({ text: 'High', sort: 3 }), 'High');
  assert.equal(D.sortOf({ text: 'High', sort: 3 }), 3);
  assert.equal(D.sortOf('abc'), 'abc');
});

test('each operator', () => {
  const keys = (w) => D.select([h1, h2, h3], w).map((e) => e.key);
  assert.deepEqual(keys({ field: 'id', op: 'is', value: 'haz-002' }), ['h2'], 'is ignores case');
  assert.deepEqual(keys({ field: 'id', op: 'not', value: 'HAZ-002' }), ['h1', 'h3']);
  assert.deepEqual(keys({ field: 'id', op: 'has', value: '01' }), ['h1', 'h3']);
  assert.deepEqual(keys({ field: 'causes', op: 'is', value: 'b' }), ['h1'], 'a list matches when any item does');
  assert.deepEqual(keys({ field: 'causes', op: 'empty' }), ['h2']);
  assert.deepEqual(keys({ field: 'note', op: 'set' }), ['h2']);
  assert.deepEqual(keys({ field: 'risk', op: 'gte', value: '2' }), ['h1', 'h3'], 'ratings compare by rank');
  assert.deepEqual(keys({ field: 'risk', op: 'lte', value: '1' }), ['h2']);
  assert.deepEqual(keys({ field: 'nope', op: 'is', value: 'x' }), ['h1', 'h2', 'h3'], 'a filter on an unknown field passes everything');
  assert.deepEqual(keys(null), ['h1', 'h2', 'h3']);
});

test('dates compare by their ISO sort key', () => {
  assert.deepEqual(D.select([r1, r2], { field: 'date', op: 'gte', value: '2026-01-02' }).map((e) => e.key), ['r2']);
});

test('sort is stable on ties and can run descending', () => {
  assert.deepEqual(D.select([h1, h2, h3], null, { field: 'risk' }).map((e) => e.key), ['h2', 'h1', 'h3']);
  assert.deepEqual(D.select([h1, h2, h3], null, { field: 'risk', dir: 'desc' }).map((e) => e.key), ['h1', 'h3', 'h2']);
  assert.deepEqual(D.select([h3, h1], null, { field: 'id' }).map((e) => e.key), ['h1', 'h3'], 'numeric-aware text');
});

test('rule 1: an entry in scope gives its value', () => {
  assert.deepEqual(D.resolveField(inH1(), D.parseFieldTag('f:hazard.id'), cat), { kind: 'value', text: 'HAZ-001' });
  assert.deepEqual(D.resolveField(inH1(), D.parseFieldTag('f:platform.name'), cat), { kind: 'value', text: 'Ship' });
});

test('rule 1: a list-type field is a list', () => {
  assert.deepEqual(D.resolveField(inH1(), D.parseFieldTag('f:hazard.causes'), cat), { kind: 'list', items: ['a', 'b'] });
});

test('rule 2: a child collection gives a list, filtered and sorted', () => {
  assert.deepEqual(D.resolveField(inH1(), D.parseFieldTag('f:report.text?sort=date'), cat), { kind: 'list', items: ['earlier', 'later'] });
  assert.deepEqual(D.resolveField(inH1(), D.parseFieldTag('f:report.text?where=type:is:Incident'), cat), { kind: 'list', items: ['later'] });
  assert.deepEqual(D.resolveField(D.rootScope(data), D.parseFieldTag('f:hazard.id'), cat), { kind: 'list', items: ['HAZ-001', 'HAZ-002', 'HAZ-010'] });
});

test('rule 3: undeclared or unreachable is unknown', () => {
  assert.deepEqual(D.resolveField(inH1(), D.parseFieldTag('f:hazard.nope'), cat), { kind: 'unknown' });
  assert.deepEqual(D.resolveField(inH1(), D.parseFieldTag('f:nothing.id'), cat), { kind: 'unknown' });
  const inReport = D.rootScope(data).concat([{ coll: 'report', entry: r1 }]);
  assert.deepEqual(D.resolveField(D.rootScope(data).slice(0, 1), D.parseFieldTag('f:report.text'), cat), { kind: 'unknown' }, 'reports hang off hazards, not the platform');
  assert.deepEqual(D.resolveField(inReport, D.parseFieldTag('f:report.text'), cat), { kind: 'value', text: 'earlier' });
  assert.deepEqual(D.resolveField(inH1(), null, cat), { kind: 'unknown' });
});

test('with no data a declared field is unbound', () => {
  assert.deepEqual(D.rootScope(null), []);
  assert.deepEqual(D.resolveField([], D.parseFieldTag('f:hazard.id'), cat), { kind: 'unbound' });
  assert.deepEqual(D.resolveField([], D.parseFieldTag('f:hazard.nope'), cat), { kind: 'unknown' });
});

test('fieldText prints a value, a list per style, and the empty wording', () => {
  assert.equal(D.fieldText({ kind: 'value', text: 'x' }), 'x');
  assert.equal(D.fieldText({ kind: 'value', text: '' }), 'Nil');
  assert.equal(D.fieldText({ kind: 'value', text: ' ' }, { empty: 'None' }), 'None');
  const list = { kind: 'list', items: ['a', 'b'] };
  assert.equal(D.fieldText(list), 'a\nb');
  assert.equal(D.fieldText(list, { list: 'num' }), '1. a\n2. b');
  assert.equal(D.fieldText(list, { list: 'bullet' }), '• a\n• b');
  assert.equal(D.fieldText(list, { list: 'comma' }), 'a, b');
  assert.equal(D.fieldText({ kind: 'list', items: ['', ''] }), 'Nil', 'blank items are left out');
  assert.equal(D.fieldText({ kind: 'list', items: [] }, { empty: 'None recorded' }), 'None recorded');
});

test('instanceKey names the entries below the root', () => {
  assert.equal(D.instanceKey(D.rootScope(data)), '');
  assert.equal(D.instanceKey(inH1().concat([{ coll: 'report', entry: r1 }])), 'hazard:h1/report:r1');
});

test('collections available in a scope: the in-scope ones and their children', () => {
  assert.deepEqual(D.available(['platform', 'hazard'], cat), { single: ['platform', 'hazard'], lists: ['report'] });
  assert.deepEqual(D.available(['platform'], cat), { single: ['platform'], lists: ['hazard'] });
});
