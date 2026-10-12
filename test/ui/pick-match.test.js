import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickMatches } from '../../src/ui/pick-match.js';

const text = 'residual risk is how serious a hazard is with its controls in place; sfarp and reviews';

test('a search matches by any part of the words, every word of it', () => {
  assert.ok(pickMatches(text, ''));
  assert.ok(pickMatches(text, 'resid'));
  assert.ok(pickMatches(text, 'hazard controls'));
  assert.ok(!pickMatches(text, 'hazard bowtie'));
});

test('a word one letter off still matches: a wrong, missing or extra letter, or two swapped', () => {
  assert.ok(pickMatches(text, 'hazrd'), 'missing letter');
  assert.ok(pickMatches(text, 'hazzard'), 'extra letter');
  assert.ok(pickMatches(text, 'hezard'), 'wrong letter');
  assert.ok(pickMatches(text, 'hazadr'), 'two swapped');
  assert.ok(pickMatches(text, 'reveiws'), 'swapped, in a longer word');
  assert.ok(pickMatches(text, 'contrl'), 'the start of a longer word, one letter off');
});

test('two letters off, or a short word off at all, does not match', () => {
  assert.ok(!pickMatches(text, 'hzrd'));
  assert.ok(!pickMatches(text, 'xyzard'));
  assert.ok(!pickMatches(text, 'rsk'), 'too short to guess at');
});

test('words written together find words written apart or hyphenated: bowtie finds Bow-ties', () => {
  assert.ok(pickMatches('Diagrams on the Bow-ties page', 'bowtie'));
  assert.ok(pickMatches('Diagrams on the Bow-ties page', 'bowties'));
  assert.ok(pickMatches('anything to follow up', 'followup'));
  assert.ok(pickMatches('Diagrams on the Bow-ties page', 'botwie'), 'and with a slip');
});
