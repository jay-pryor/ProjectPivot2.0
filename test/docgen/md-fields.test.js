import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../../DocGen/doc-designer.js';

const MD = App.md, RT = App.ui.richText;
const matchAll = (s) => { const re = new RegExp(MD.TOKEN.source, 'g'); return [...s.matchAll(re)].map((m) => m[2]); };

test('the token grammar takes field and fill tokens with options', () => {
  assert.deepEqual(matchAll('a {{f:hazard.title}} b {{f:report.text?sort=date:desc&list=num&empty=None%20yet}} {{fill:fill2?label=Why}}'),
    ['f:hazard.title', 'f:report.text?sort=date:desc&list=num&empty=None%20yet', 'fill:fill2?label=Why']);
});

test('a field prints what its resolver gives, inside the emphasis around it', () => {
  const rs = MD.runs('ID {{b}}{{f:hazard.id}}{{/b}} end', { resolveField: (tag) => (tag === 'f:hazard.id' ? [{ text: 'HAZ-001' }] : null) });
  assert.deepEqual(rs, [[{ text: 'ID ' }, { text: 'HAZ-001', bold: true }, { text: ' end' }]]);
});

test('register text from a field is never read as markup', () => {
  const rs = MD.runs('{{f:hazard.description}}', { resolveField: () => [{ text: '{{b}}x /[Tag] {{f:hazard.id}}' }] });
  assert.deepEqual(rs, [[{ text: '{{b}}x /[Tag] {{f:hazard.id}}' }]]);
});

test('a field\'s line breaks stay line breaks', () => {
  const rs = MD.runs('{{f:hazard.causes}}', { resolveField: () => [{ text: 'a' }, { br: true }, { text: 'b' }] });
  assert.deepEqual(rs, [[{ text: 'a' }, { br: true }, { text: 'b' }]]);
});

test('with no resolver a field reads as its label, or its path', () => {
  assert.deepEqual(MD.runs('{{f:hazard.id}}', { fieldLabel: () => 'Hazard › ID' }), [[{ text: '‹Hazard › ID›' }]]);
  assert.deepEqual(MD.runs('{{f:hazard.id}}'), [[{ text: '‹hazard.id›' }]]);
  assert.deepEqual(MD.runs('{{fill:fill1?label=Why}}'), [[{ text: '‹To fill in: Why›' }]]);
});

test('the plain reading names fields and fills', () => {
  assert.equal(MD.plain('{{f:hazard.id}} {{f:hazard.title}}', { fieldLabel: (t) => (t === 'f:hazard.id' ? 'Hazard › ID' : null) }), '‹Hazard › ID› ‹hazard.title›');
  assert.equal(MD.plain('x {{fill:fill1?label=Why}}'), 'x ‹To fill in: Why›');
});

test('the box shows a field as a chip, a fill as a fill chip, and an unknown one broken', () => {
  const html = RT.toHtml('a {{f:hazard.id}} {{f:hazard.zzz}} {{fill:fill1?label=Why}}', { fieldLabel: (t) => (t === 'f:hazard.id' ? 'Hazard › ID' : null) });
  assert.match(html, /<span class="rd-chip rd-field" contenteditable="false" data-rd-tok="f:hazard\.id"[^>]*>Hazard › ID<\/span>/);
  assert.match(html, /<span class="rd-chip rd-field rd-broken" contenteditable="false" data-rd-tok="f:hazard\.zzz"[^>]*>hazard\.zzz<\/span>/);
  assert.match(html, /<span class="rd-chip rd-fill" contenteditable="false" data-rd-tok="fill:fill1\?label=Why"[^>]*>✎ Why<\/span>/);
});

test('inserting a field or a fill puts a marker at the caret, replacing any selection', () => {
  assert.deepEqual(RT.applyToken('ab', 1, 1, 'f:hazard.id'), { text: 'a{{f:hazard.id}}b', caret: 16 });
  assert.deepEqual(RT.applyToken('abc', 1, 2, 'fill:fill1?label=X'), { text: 'a{{fill:fill1?label=X}}c', caret: 23 });
});
