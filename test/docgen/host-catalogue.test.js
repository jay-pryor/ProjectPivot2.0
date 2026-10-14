import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../../DocGen/doc-designer.js';

const base = () => ({ getState: () => ({}), commit: () => {}, clock: { nowIso: () => '2026-10-14T00:00:00Z' }, sections: [] });

test('a host without a catalogue has none', () => {
  App.docHost.set(base());
  assert.equal(App.docHost.catalogue({ subjectId: 's1' }), null);
});

test('a host\'s catalogue is asked with the run', () => {
  let seen;
  App.docHost.set({ ...base(), catalogue: (run) => { seen = run; return { root: 'r', collections: { r: { label: 'R', fields: [], children: [] } }, data: null }; } });
  assert.equal(App.docHost.catalogue({ subjectId: 's1' }).root, 'r');
  assert.deepEqual(seen, { subjectId: 's1' });
  App.docHost.catalogue();
  assert.equal(seen, null, 'unbound: asked with no run');
});

test('a catalogue that is not a function is refused', () => {
  assert.match(App.docHost.validate({ ...base(), catalogue: {} }).join('\n'), /host\.catalogue must be a function/);
});
