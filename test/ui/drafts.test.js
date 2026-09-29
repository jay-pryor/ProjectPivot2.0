import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftKey } from '../../src/ui/drafts.js';

test('a field is identified by its form\'s action and data, and its own name, whatever order the data is in', () => {
  const a = draftKey({ action: 'updateHazard', id: 'h1' }, 'description');
  assert.equal(a, draftKey({ id: 'h1', action: 'updateHazard' }, 'description'));
  assert.notEqual(a, draftKey({ action: 'updateHazard', id: 'h2' }, 'description'), 'another hazard\'s form is another field');
  assert.notEqual(a, draftKey({ action: 'updateHazard', id: 'h1' }, 'title'));
  assert.notEqual(a, draftKey({ action: 'updateControl', id: 'h1' }, 'description'));
});
