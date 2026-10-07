import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wordDiff } from '../../src/ui/text-diff.js';

const show = (parts) => parts.map((p) => (p.changed ? `[${p.text}]` : p.text)).join('');

test('only the words taken out and put in are marked; the rest joins back exactly', () => {
  const d = wordDiff('A long justification about the hangar fire risk.', 'A long justification about the workshop fire risk.');
  assert.equal(show(d.before), 'A long justification about the [hangar] fire risk.');
  assert.equal(show(d.after), 'A long justification about the [workshop] fire risk.');
  assert.equal(d.before.map((p) => p.text).join(''), 'A long justification about the hangar fire risk.');
});

test('words added at the end, words taken from the start, and nothing changed', () => {
  assert.equal(show(wordDiff('Fire', 'Fire in the hangar').after), 'Fire[ in the hangar]');
  assert.equal(show(wordDiff('Old note: keep', 'keep').before), '[Old note: ]keep');
  assert.deepEqual(wordDiff('Same text', 'Same text').after, [{ text: 'Same text', changed: false }]);
  assert.deepEqual(wordDiff('', 'New').after, [{ text: 'New', changed: true }]);
});
