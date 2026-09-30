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
  assert.match(out, /<button type="button" class="primary beckon" data-action="reconnectFolder">Reconnect to Safety<\/button>/);
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

async function inside(folders) {
  let i = 0;
  const saved = [];
  const c = createController({
    clock: fixedClock('2026-09-28T10:00:00+10:00'), storage: new MemoryStorage(), minSaveMs: 0,
    pickFolder: async () => { const f = folders[i++]; if (!f) throw new DOMException('cancelled', 'AbortError'); return f.handle; },
    pickSaveFile: async () => null, pickOpenFile: async () => null,
    rememberFolder: async (h) => { saved.push(h.name); },
  });
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  await c.dispatch({ type: 'selectProfile', id: c.getState().profiles[0].id });
  return { c, saved };
}

test('the Folder part of the top bar chooses a different folder', async () => {
  const { shell } = await import('../../src/ui/screens/common.js');
  const { html } = await import('../../src/ui/html.js');
  const { c } = await inside([new MemoryFolder('Wrong')]);
  const out = shell(c.getState(), html``).toString();
  assert.match(out, /<button type="button" class="folder" data-action="changeFolder" title="Choose a different data folder">Folder: Wrong<\/button>/);
});

test('changing folder starts afresh in the new one, and it is remembered', async () => {
  const { c, saved } = await inside([new MemoryFolder('Wrong'), new MemoryFolder('Right')]);
  await c.dispatch({ type: 'save' });
  await c.dispatch({ type: 'changeFolder' });
  const s = c.getState();
  assert.deepEqual([s.screen, s.folderName, s.session, s.profileId], ['profile', 'Right', null, null]);
  assert.deepEqual(saved, ['Wrong', 'Right']);
});

test('changing folder with unsaved changes asks to save first, and changes nothing', async () => {
  const { c } = await inside([new MemoryFolder('Wrong'), new MemoryFolder('Right')]);
  await c.dispatch({ type: 'createHazard', title: 'Fire' });
  await c.dispatch({ type: 'changeFolder' });
  assert.equal(c.getState().folderName, 'Wrong');
  assert.equal(c.getState().screen, 'main');
  assert.match(c.getState().message.text, /Save/);
});

test('cancelling the folder picker leaves everything as it was', async () => {
  const { c } = await inside([new MemoryFolder('Wrong')]);
  await c.dispatch({ type: 'changeFolder' });
  assert.equal(c.getState().folderName, 'Wrong');
  assert.equal(c.getState().screen, 'main');
  assert.equal(c.getState().message, null);
});

test('the profile screen leaves the folder, and choosing another, to the screen before it', async () => {
  const { profileScreen } = await import('../../src/ui/screens/start.js');
  const f = new MemoryFolder('Wrong');
  const c = createController(env(f).env);
  await c.dispatch({ type: 'chooseFolder' });
  const out = profileScreen(c.getState()).toString();
  assert.doesNotMatch(out, /Wrong/);
  assert.doesNotMatch(out, /Choose a different folder/);
});
