import { test } from 'node:test';
import assert from 'node:assert/strict';

import { message, notSaved, dataAffected, integrityFailed } from '../messages.js';

test('a message that must name things refuses an empty list', () => {
  assert.throws(() => notSaved([]), TypeError);
  assert.throws(() => notSaved(['  ']), TypeError);
  assert.throws(() => dataAffected([], 'data.json could not be read'), TypeError);
  assert.throws(() => integrityFailed([]), TypeError);
});

test('not saved names the changes and reads as one plain sentence', () => {
  const m = notSaved(['Hazard H-0007: title', ' Control "Guard rail" linked to platform Alpha ']);
  assert.equal(m.severity, 'error');
  assert.equal(m.headline, 'These changes were not saved.');
  assert.deepEqual(m.items, ['Hazard H-0007: title', 'Control "Guard rail" linked to platform Alpha']);
  assert.ok(m.next.length > 0);
  assert.equal(notSaved(['one']).headline, 'This change was not saved.');
  assert.ok(Object.isFrozen(m) && Object.isFrozen(m.items));
});

test('data affected leads with the cause', () => {
  const m = dataAffected(['Every hazard', 'Every control'], 'data.json could not be read.');
  assert.equal(m.headline, 'data.json could not be read. This data is affected:');
  assert.deepEqual(m.items, ['Every hazard', 'Every control']);
});

test('integrity failed counts the files', () => {
  assert.equal(integrityFailed(['data.json']).headline, 'A file has changed since Pivot wrote it.');
  assert.equal(integrityFailed(['data.json', 'profiles.json']).headline, '2 files have changed since Pivot wrote them.');
});

test('a bare message needs a headline and a next step', () => {
  assert.throws(() => message('info', '', [], 'Carry on.'), TypeError);
  assert.throws(() => message('info', 'Saved.', [], ''), TypeError);
  assert.deepEqual(message('info', ' Saved. ', [], ' Carry on. '), { severity: 'info', headline: 'Saved.', items: [], next: 'Carry on.' });
});
