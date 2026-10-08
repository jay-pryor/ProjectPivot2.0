import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readWorkflowsPrefs, writeWorkflowsPrefs, workflowsPrefsKey, DEFAULT_WORKFLOWS_PREFS } from '../../src/ui/workflows-prefs.js';
import { MemoryStorage } from '../fakes/storage.js';

test('the Workflows owner and range: Everyone and 30 days unless remembered; bad values are the defaults', () => {
  const s = new MemoryStorage();
  const key = workflowsPrefsKey('F', 'u1');
  assert.equal(key, 'pivot.workflows:F:u1');
  assert.deepEqual(readWorkflowsPrefs(s, key), { owner: 'everyone', days: 30 });
  writeWorkflowsPrefs(s, key, { owner: 'u2', days: 90 });
  assert.deepEqual(readWorkflowsPrefs(s, key), { owner: 'u2', days: 90 });
  s.setItem(key, JSON.stringify({ owner: 'u2', days: 12 }));
  assert.deepEqual(readWorkflowsPrefs(s, key), DEFAULT_WORKFLOWS_PREFS);
});
