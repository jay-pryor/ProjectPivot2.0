import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController } from '../../src/ui/controller.js';
import { openScreen } from '../../src/ui/screens/start.js';

/** An env whose remembered folder is `remembered`, and whose permission answer is `answer`. */
function env(f, { remembered = null, answer = 'granted' } = {}) {
  const saved = [];
  const handle = remembered && Object.assign(Object.create(Object.getPrototypeOf(remembered)), remembered, {
    requestPermission: async () => answer,
  });
  return {
    saved,
    env: {
      clock: fixedClock('2026-09-28T10:00:00+10:00'), storage: new MemoryStorage(), minSaveMs: 0,
      pickFolder: async () => f.handle, pickSaveFile: async () => null, pickOpenFile: async () => null,
      rememberFolder: async (h) => { saved.push(h); },
      recallFolder: async () => handle,
    },
  };
}

test('choosing a folder remembers it for next time', async () => {
  const f = new MemoryFolder('Safety');
  const { env: e, saved } = env(f);
  const c = createController(e);
  await c.dispatch({ type: 'chooseFolder' });
  assert.deepEqual(saved, [f.handle]);
});

test('on opening, a remembered folder is offered to reconnect to, beside choosing a different one', async () => {
  const f = new MemoryFolder('Safety');
  const c = createController(env(f, { remembered: f.handle }).env);
  await c.dispatch({ type: 'recallFolder' });
  assert.equal(c.getState().lastFolder, 'Safety');
  const out = openScreen(c.getState()).toString();
  assert.match(out, /<button type="button" class="primary" data-action="reconnectFolder">Reconnect to Safety<\/button>/);
  assert.match(out, /<button type="button" data-action="chooseFolder">Choose a different folder…<\/button>/);
  const none = createController(env(f).env);
  await none.dispatch({ type: 'recallFolder' });
  assert.doesNotMatch(openScreen(none.getState()).toString(), /Reconnect/);
});

test('reconnecting asks for access again, then opens the folder as choosing it would', async () => {
  const f = new MemoryFolder('Safety');
  const c = createController(env(f, { remembered: f.handle }).env);
  await c.dispatch({ type: 'recallFolder' });
  await c.dispatch({ type: 'reconnectFolder' });
  assert.equal(c.getState().screen, 'profile');
  assert.equal(c.getState().folderName, 'Safety');
});

test('if access is refused, Pivot says so and stays on the opening screen', async () => {
  const f = new MemoryFolder('Safety');
  const c = createController(env(f, { remembered: f.handle, answer: 'denied' }).env);
  await c.dispatch({ type: 'recallFolder' });
  await c.dispatch({ type: 'reconnectFolder' });
  assert.equal(c.getState().screen, 'open');
  assert.match(c.getState().message.text, /Safety/);
});

test('a remembered folder with no name is still offered', async () => {
  const f = new MemoryFolder('');
  const c = createController(env(f, { remembered: f.handle }).env);
  await c.dispatch({ type: 'recallFolder' });
  assert.match(openScreen(c.getState()).toString(), />Reconnect to the last folder</);
});
