import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController } from '../../src/ui/controller.js';
import { renderApp } from '../../src/ui/render.js';

async function ready() {
  const f = new MemoryFolder();
  const c = createController({ clock: fixedClock('2026-09-28T10:00:00+10:00'), storage: new MemoryStorage(), minSaveMs: 0,
    pickFolder: async () => f.handle, pickSaveFile: async () => null, pickOpenFile: async () => null });
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  await c.dispatch({ type: 'selectProfile', id: c.getState().profiles[0].id });
  return c;
}
const controls = (c) => Object.values(c.getState().session.working.records.control);

test('+ on Controls opens the new control\'s page with its title ready; the rest can be filled first; a title makes it, with all of it', async () => {
  const c = await ready();
  await c.dispatch({ type: 'newControl' });
  assert.equal(c.getState().view.name, 'newControl');
  const page = renderApp(c.getState());
  assert.match(page, /<textarea class="doc-title small" name="title" rows="1" required placeholder="Its title…" aria-label="Control title" autofocus data-change="createDraftControl">/);
  assert.match(page, /New control<\/h1>[\s\S]*?<span class="field-label">Control<\/span>/, 'one kind of control: no additional or existing');
  assert.match(page, /Usual kind[\s\S]*?Origin/);
  assert.deepEqual(controls(c), [], 'nothing made yet');
  await c.dispatch({ type: 'setControlDraft', field: 'tier', value: 'Isolation' });
  await c.dispatch({ type: 'setControlDraft', field: 'kind', kind: 'mitigating' });
  await c.dispatch({ type: 'setControlDraft', field: 'description', value: 'Two-hour rated' });
  await c.dispatch({ type: 'setControlDraft', field: 'origin', value: 'Original build' });
  await c.dispatch({ type: 'createDraftControl', title: '  ' });
  assert.deepEqual(controls(c), [], 'no title, nothing made');
  await c.dispatch({ type: 'createDraftControl', title: 'Fire wall' });
  const [made] = controls(c);
  assert.deepEqual([made.title, made.tier, made.kind, made.description, made.origin], ['Fire wall', 'Isolation', 'mitigating', 'Two-hour rated', 'Original build']);
  assert.equal('category' in made, false, 'controls have no category any more');
  assert.deepEqual([c.getState().view.name, c.getState().view.id], ['control', made.id], 'its page opens');
  assert.equal(c.getState().draftControl, null);
});

test('leaving a new control\'s page with no title makes nothing', async () => {
  const c = await ready();
  await c.dispatch({ type: 'go', view: 'controls' });
  await c.dispatch({ type: 'newControl' });
  await c.dispatch({ type: 'setControlDraft', field: 'description', value: 'Half done' });
  await c.dispatch({ type: 'goBack' });
  assert.equal(c.getState().view.name, 'controls');
  assert.equal(c.getState().draftControl, null);
  assert.deepEqual(controls(c), []);
});

test('Copy from… opens its picker knowing which part to copy', async () => {
  const c = await ready();
  await c.dispatch({ type: 'openPicker', picker: 'copyPart', part: 'sfarp', hazardId: 'h1', platformId: 'p1' });
  assert.deepEqual(c.getState().picker, { picker: 'copyPart', part: 'sfarp', hazardId: 'h1', platformId: 'p1' });
});

test('every message closes the same way, with a ✕: a notice, the Undo offer and a warning', async () => {
  const { messages } = await import('../../src/ui/screens/common.js');
  const c = await ready();
  await c.dispatch({ type: 'createHazard', id: 'h1', title: 'Fire' });
  await c.dispatch({ type: 'askDelete', kind: 'hazard', id: 'h1' });
  await c.dispatch({ type: 'confirmDelete', kind: 'hazard', id: 'h1' });
  const s = c.getState();
  assert.ok(s.undo, 'the Undo offer');
  const out = messages({ ...s, message: { kind: 'error', text: 'Oops' }, warnings: ['Storage is full'] }).toString();
  assert.equal((out.match(/class="icon-x msg-x" title="Dismiss" aria-label="Dismiss"/g) ?? []).length, 3);
  assert.doesNotMatch(out, />Dismiss<\/button>/, 'no word button');
  assert.match(out, /data-action="dismissUndo"/);
  await c.dispatch({ type: 'dismissUndo' });
  assert.equal(c.getState().undo, null);
  assert.equal(c.getState().session.working.records.hazard.h1.status, 'deleted', 'closing the offer keeps the delete');
});
