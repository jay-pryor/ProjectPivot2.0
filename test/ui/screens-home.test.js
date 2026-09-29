import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeDetail } from '../../src/ui/screens/common.js';

test('changeDetail: an edit as before → after, escaped; other changes as a word', () => {
  const out = changeDetail({ change: 'edited', fields: [{ field: 'title', before: '<b>x</b>', after: 'Fire' }] }).toString();
  assert.match(out, /<li><strong>title<\/strong>: &lt;b&gt;x&lt;\/b&gt; → Fire<\/li>/);
  assert.equal(String(changeDetail({ change: 'created', fields: [] })), 'Created');
});
