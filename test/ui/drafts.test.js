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

test('the cursor goes where the person was moving it, when a redraw lands mid-move', async () => {
  const { focusTarget } = await import('../../src/ui/drafts.js');
  const inside = new Set(['outcome', 'notes']);
  const root = { contains: (el) => inside.has(el) };
  assert.equal(focusTarget('outcome', root, 'notes'), 'outcome', 'focus settled: keep it');
  assert.equal(focusTarget('body', root, 'notes'), 'notes', 'focus on its way from one box to the next');
  assert.equal(focusTarget('body', root, null), null);
  assert.equal(focusTarget('body', root, 'elsewhere'), null, 'moving outside the app is not ours to keep');
});
