import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOUR_STEPS, targetsOf } from '../../src/ui/tour/steps.js';
import { renderApp } from '../../src/ui/render.js';
import { createController } from '../../src/ui/controller.js';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { hasMatch } from './selector-match.js';

/** The tutorial started in a real controller, so each step is seen as someone taking it sees it. */
async function touring() {
  const f = new MemoryFolder();
  const c = createController({ clock: fixedClock('2026-10-12T10:00:00+10:00'), storage: new MemoryStorage(), minSaveMs: 0,
    pickFolder: async () => f.handle, pickSaveFile: async (n) => f.handle.getFileHandle(n, { create: true }), pickOpenFile: async () => null });
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  await c.dispatch({ type: 'selectProfile', id: c.getState().profiles[0].id });
  await c.dispatch({ type: 'startTour' });
  return c;
}

/** The main tabs, by the page each opens. */
const MAIN_TABS = new Set(['hazards', 'controls', 'platforms', 'workflows', 'reviews', 'bowties', 'info', 'reports', 'references']);

test('every step has an id, a page, a title and text that fits a bubble, and no links away from the tour', () => {
  assert.equal(new Set(TOUR_STEPS.map((s) => s.id)).size, TOUR_STEPS.length);
  for (const s of TOUR_STEPS) {
    assert.ok(s.view?.name && s.title && s.text, s.id);
    assert.ok(s.text.length <= 900, `${s.id}: keep it to a bubble`);
    assert.doesNotMatch(s.text, /\[\[|\{\{/, `${s.id}: a link would leave the tour`);
    assert.doesNotMatch(s.text, /tab at the top\)/, `${s.id}: the tab is highlighted instead`);
  }
});

test('everything each step talks about is highlighted on its page, as the tour shows it', async () => {
  const c = await touring();
  for (let n = 0; n < TOUR_STEPS.length; n++) {
    await c.dispatch({ type: 'tourTo', step: n });
    const page = renderApp(c.getState());
    for (const sel of targetsOf(TOUR_STEPS[n])) assert.ok(hasMatch(page, sel), `${TOUR_STEPS[n].id}: nothing matches ${sel}`);
  }
});

test('a step on a main page highlights that page’s tab at the top too', () => {
  for (const s of TOUR_STEPS) {
    if (!MAIN_TABS.has(s.view.name)) continue;
    assert.ok(targetsOf(s).includes(`.topbar nav button[data-view="${s.view.name}"]`), s.id);
  }
});

test('Coming up and Workflows in progress are a step each, each highlighted', () => {
  const ids = TOUR_STEPS.map((s) => s.id);
  assert.ok(ids.includes('coming-up') && ids.includes('workflows-home'));
  assert.deepEqual(targetsOf(TOUR_STEPS[ids.indexOf('coming-up')]), ['.coming-panel']);
  assert.deepEqual(targetsOf(TOUR_STEPS[ids.indexOf('workflows-home')]), ['.wf-panel']);
});

test('adding a hazard highlights the + it talks about; the hazard tab’s Menu and the ☰ menu each have a step', () => {
  const by = Object.fromEntries(TOUR_STEPS.map((s) => [s.id, s]));
  assert.ok(targetsOf(by['add-hazard']).includes('main .head .plus'));
  assert.deepEqual(targetsOf(by['section-menu']), ['.rail']);
  assert.deepEqual(targetsOf(by['settings-menu']), ['.settings-menu']);
});

test('the Needs attention step explains each kind of item without defining justification', () => {
  const t = TOUR_STEPS.find((s) => s.id === 'attention').text;
  for (const kind of ['acknowledge', 'review', 'decision', 'implement', 'rating', 'justification', 'SFARP']) assert.match(t, new RegExp(kind, 'i'), kind);
  assert.doesNotMatch(t, /\(the reason/);
});

test('the Reviews step shows every platform, the overdue range too', async () => {
  const c = await touring();
  await c.dispatch({ type: 'tourTo', step: TOUR_STEPS.findIndex((s) => s.id === 'reviews') });
  const page = renderApp(c.getState());
  assert.match(page, /Training Range/);
  assert.match(page, /Harbour Patrol Boat/);
});

test('the Bow-ties step opens the saved diagram, drawn', async () => {
  const c = await touring();
  await c.dispatch({ type: 'tourTo', step: TOUR_STEPS.findIndex((s) => s.id === 'bowties') });
  assert.equal(c.getState().workspace.panes[0]?.viewId, 'tour-bv1');
  assert.match(renderApp(c.getState()), /class="bt-canvas"[\s\S]*?<svg/);
});

test('the review step’s tick to try is not ticked yet', async () => {
  const c = await touring();
  await c.dispatch({ type: 'tourTo', step: TOUR_STEPS.findIndex((s) => s.id === 'try-check') });
  const page = renderApp(c.getState());
  const foot = page.slice(page.indexOf('class="wf-check-foot"'));
  assert.match(foot.slice(0, foot.indexOf('</div>')), /name="checked"(?![^>]*checked)/, 'the first check’s tick is clear');
});

test('three try steps: acknowledge Sam’s change, set a residual likelihood, tick a check', () => {
  const tries = TOUR_STEPS.filter((s) => s.try);
  assert.deepEqual(tries.map((s) => s.id), ['try-acknowledge', 'try-rating', 'try-check']);
  assert.ok(tries[0].try.action.includes('acknowledge'));
  assert.ok(tries[1].try.action.includes('setAssessment'));
  assert.ok(tries[2].try.action.includes('setStep'));
});

test('the matcher itself: classes, attributes, tags and descendants', () => {
  const html = '<div class="a b"><span data-x="1" aria-label="Risk">t</span></div>';
  assert.ok(hasMatch(html, '.a.b'));
  assert.ok(hasMatch(html, 'span[data-x="1"]'));
  assert.ok(hasMatch(html, '.a [aria-label="Risk"]'));
  assert.ok(!hasMatch(html, '.c'));
  assert.ok(!hasMatch(html, 'span[data-x="2"]'));
});
