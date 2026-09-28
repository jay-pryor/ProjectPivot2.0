import { test } from 'node:test';
import assert from 'node:assert/strict';
import { html, raw, esc } from '../../src/ui/html.js';
import { shell, messages, dataAttrs, historyBlock, filterBar } from '../../src/ui/screens/common.js';
import { openScreen, checkScreen, profileScreen, recoverScreen, noticesScreen } from '../../src/ui/screens/start.js';
import { initialState } from '../../src/ui/controller.js';
import { emptyData } from '../../src/core/data.js';
import { updateHazard } from '../../src/core/ops/hazards.js';
import { seed, act } from '../helpers.js';

const evil = '<img src=x onerror=alert(1)>&"';

test('html escapes values, keeps nested html, joins arrays, and drops null and booleans', () => {
  assert.equal(esc(evil), '&lt;img src=x onerror=alert(1)&gt;&amp;&quot;');
  const out = html`<p title="${evil}">${evil}${html`<b>${'x'}</b>`}${[1, 2]}${null}${false}${raw('<i>ok</i>')}</p>`.toString();
  assert.equal(out, `<p title="${esc(evil)}">${esc(evil)}<b>x</b>12<i>ok</i></p>`);
  assert.equal(dataAttrs({ action: 'go', 'hazard-id': 'a"b' }).toString(), 'data-action="go" data-hazard-id="a&quot;b"');
});

test('Review focus 4: every opening screen shows user text literally', () => {
  const state = { ...initialState(), folderName: evil, profiles: [{ id: 'p', name: evil, createdAt: '' }], check: { failed: [{ file: 'data.json', reason: 'integrity', detail: evil }] } };
  for (const screen of [openScreen, checkScreen, profileScreen, recoverScreen]) {
    const out = screen(state).toString();
    assert.equal(out.includes('<img'), false, `${screen.name} leaks markup`);
  }
});

test('the open screen offers the folder picker; the profile screen lists profiles and a create form', () => {
  assert.match(openScreen(initialState()).toString(), /data-action="chooseFolder"/);
  const out = profileScreen({ ...initialState(), profiles: [{ id: 'p1', name: 'Ada', createdAt: '' }] }).toString();
  assert.match(out, /data-action="selectProfile" data-id="p1"/);
  assert.match(out, /<form data-action="createProfile"/);
});

test('the check screen offers to continue only when profiles.json is sound', () => {
  const s = (file) => ({ ...initialState(), check: { failed: [{ file, reason: 'integrity', detail: 'changed' }] } });
  assert.match(checkScreen(s('data.json')).toString(), /data-action="continueFromCheck"/);
  assert.doesNotMatch(checkScreen(s('profiles.json')).toString(), /continueFromCheck/);
});

test('the notices screen says what replaced each of the user\'s edits', () => {
  const state = {
    ...initialState(), profiles: [{ id: 'u2', name: 'Grace', createdAt: '' }],
    notices: [{ id: 'n1', at: '2026-09-28T10:00:00+10:00', by: 'u2', items: [{ kind: 'hazard', id: 'h1', theirs: { number: 1, title: 'Mine' }, mine: { number: 1, title: 'Grace\'s' } }] }],
  };
  const out = noticesScreen(state).toString();
  assert.match(out, /H-0001 Mine/);
  assert.match(out, /H-0001 Grace&#39;s/);
  assert.match(out, /Grace/);
  assert.match(out, /data-action="dismissNotices"/);
});

test('the shell shows the active profile prominently, an unsaved marker, and Save', () => {
  const data = emptyData();
  const base = { ...initialState(), screen: 'main', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }], profileId: 'u1' };
  const clean = shell({ ...base, session: { base: data, working: data, loadedStamp: null } }, html`<p>body</p>`).toString();
  assert.match(clean, /class="profile"[^>]*>Ada</);
  assert.doesNotMatch(clean, /Unsaved changes/);
  assert.match(clean, /data-action="save"/);
  const dirty = shell({ ...base, session: { base: data, working: seed(), loadedStamp: null } }, html``).toString();
  assert.match(dirty, /Unsaved changes/);
});

test('messages show kind, text and items, escaped', () => {
  const out = messages({ ...initialState(), message: { kind: 'warning', text: evil, items: [evil] }, warnings: ['w'] }).toString();
  assert.match(out, /msg-warning/);
  assert.equal(out.includes('<img'), false);
  assert.match(out, />w</);
});

test('filterBar and historyBlock', () => {
  const d = updateHazard(seed(), act, { id: 'h1', title: 'Big fire' });
  const state = { ...initialState(), profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }] };
  const bar = filterBar(state, d, 'controls', true).toString();
  assert.match(bar, /data-change="setFilter" data-list="controls" data-field="platformId"/);
  assert.match(bar, /data-field="controlState"/);
  assert.match(bar, /<option value="p1">Alpha<\/option>/);
  const hist = historyBlock(state, d, 'hazard', 'h1').toString();
  assert.match(hist, /Edit hazard/);
  assert.match(hist, /title: Fire → Big fire/);
  assert.match(hist, /Ada/);
});
