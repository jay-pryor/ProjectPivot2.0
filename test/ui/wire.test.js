import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formValues } from '../../src/ui/drafts.js';

test('form values: a field given several times (ticked boxes) becomes a list; once stays a string', () => {
  const entries = [['hazardId', 'h1'], ['controlId', 'c1'], ['controlId', 'c2'], ['kind:c1', 'mitigating']];
  assert.deepEqual(formValues(entries), { hazardId: 'h1', controlId: ['c1', 'c2'], 'kind:c1': 'mitigating' });
});
