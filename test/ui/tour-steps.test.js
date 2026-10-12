import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOUR_STEPS } from '../../src/ui/tour/steps.js';
import { sampleRegister, SAMPLE_PROFILE } from '../../src/ui/tour/sample.js';
import { renderApp } from '../../src/ui/render.js';
import { initialState } from '../../src/ui/controller.js';
import { hasMatch } from './selector-match.js';

const today = '2026-10-12';
const sample = sampleRegister('u1', today);
const stateAt = (step, n) => ({
  ...initialState(), screen: 'main', today, folderName: 'f', profileId: 'u1',
  profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }, SAMPLE_PROFILE],
  session: { base: sample, working: sample, loadedStamp: null },
  view: step.view, sections: step.sections ?? {}, tour: { step: n, real: {} },
});

test('there are 23 steps, each with an id, a page, a title and text that fits a bubble, and no links away from the tour', () => {
  assert.equal(TOUR_STEPS.length, 23);
  assert.equal(new Set(TOUR_STEPS.map((s) => s.id)).size, 23);
  for (const s of TOUR_STEPS) {
    assert.ok(s.view?.name && s.title && s.text, s.id);
    assert.ok(s.text.length <= 900, `${s.id}: keep it to a bubble`);
    assert.doesNotMatch(s.text, /\[\[|\{\{/, `${s.id}: a link would leave the tour`);
  }
});

test('between a hazard’s Overview and its patrol boat tab, a step shows its row of platform tabs', () => {
  const ids = TOUR_STEPS.map((s) => s.id);
  assert.deepEqual(ids.slice(ids.indexOf('hazard'), ids.indexOf('hazard') + 3), ['hazard', 'platform-tabs', 'hazard-platform']);
  const t = TOUR_STEPS[ids.indexOf('platform-tabs')];
  assert.deepEqual([t.view, t.target], [{ name: 'hazard', id: 'tour-h1' }, 'nav.tabs']);
});

test('the Needs attention step explains each kind of item', () => {
  const t = TOUR_STEPS.find((s) => s.id === 'attention').text;
  for (const kind of ['acknowledge', 'review', 'decision', 'implement', 'rating', 'justification', 'SFARP']) assert.match(t, new RegExp(kind, 'i'), kind);
});

test('every step’s highlight is on its page with the sample data', () => {
  TOUR_STEPS.forEach((s, n) => {
    if (!s.target) return;
    assert.ok(hasMatch(renderApp(stateAt(s, n)), s.target), `${s.id}: nothing matches ${s.target}`);
  });
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
