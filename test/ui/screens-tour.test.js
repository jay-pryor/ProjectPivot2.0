import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tourOverlay } from '../../src/ui/screens/tour.js';
import { helpView } from '../../src/ui/screens/help.js';
import { shell } from '../../src/ui/screens/common.js';
import { TOUR_STEPS } from '../../src/ui/tour/steps.js';
import { sampleRegister } from '../../src/ui/tour/sample.js';
import { state as base } from './screens-workflows.test.js';
import { seed } from '../helpers.js';

const sample = sampleRegister('u1', '2026-09-28');
const at = (n, view = TOUR_STEPS[n].view) => ({ ...base, session: { base: sample, working: sample, loadedStamp: null }, view, tour: { step: n, real: {} } });

test('nothing is drawn outside the tutorial', () => {
  assert.equal(String(tourOverlay({ ...base, tour: null })), '');
});

test('the bubble: step count, title, text, Back hidden on the first, Next, Skip; centred with no target', () => {
  const out = tourOverlay(at(0)).toString();
  assert.match(out, /Step 1 of 22/);
  assert.match(out, new RegExp(TOUR_STEPS[0].title));
  assert.match(out, /class="tour-bubble centred"/);
  assert.doesNotMatch(out, /data-action="tourBack"/);
  assert.match(out, /data-action="tourNext"[^>]*>Next/);
  assert.match(out, /data-action="tourSkip"/);
  assert.match(out, /class="tour-spotlight"/);
});

test('a targeted step names its target; the last step says Finish; a try step says what to do', () => {
  assert.match(tourOverlay(at(1)).toString(), /data-tour-target="\.topbar nav"/);
  assert.match(tourOverlay(at(21)).toString(), /data-action="tourNext"[^>]*>Finish/);
  const n = TOUR_STEPS.findIndex((s) => s.try);
  assert.match(tourOverlay(at(n)).toString(), /Your turn:<\/strong> /);
});

test('away from the step’s page, the bubble folds into a corner card to come back', () => {
  const out = tourOverlay(at(1, { name: 'controls' })).toString();
  assert.doesNotMatch(out, /tour-bubble/);
  assert.match(out, /class="tour-card"[\s\S]*data-action="tourTo"[^>]*data-step="1"|data-step="1"[^>]*data-action="tourTo"/);
});

test('the top of the app shows the tutorial banner with Leave tutorial', () => {
  const out = shell(at(0), '').toString();
  assert.match(out, /class="tour-banner"[\s\S]*Nothing here is saved[\s\S]*data-action="endTour"/);
});

test('Getting started has Start the tutorial, and the invitation for a new profile until it is answered', () => {
  const view = { name: 'help', topic: 'getting-started' };
  const invited = { ...base, view, profiles: [{ id: 'u1', name: 'Ada', createdAt: '', prefs: { tutorialOffered: false } }] };
  const out = helpView(invited, seed()).toString();
  assert.match(out, /data-action="startTour"[^>]*>Start the tutorial/);
  assert.match(out, /class="tour-invite"[\s\S]*data-action="startTour"[\s\S]*data-action="dismissTourInvite"/);
  assert.doesNotMatch(helpView({ ...base, view }, seed()).toString(), /tour-invite/, 'older profiles are not invited');
  assert.doesNotMatch(helpView({ ...invited, view: { name: 'help', topic: 'hazards' } }, seed()).toString(), /startTour/, 'only on Getting started');
});

test('Start the tutorial sits in Getting started’s Getting help section; the invitation stays at the top', () => {
  const view = { name: 'help', topic: 'getting-started' };
  const out = helpView({ ...base, view, profiles: [{ id: 'u1', name: 'Ada', createdAt: '', prefs: { tutorialOffered: false } }] }, seed()).toString();
  const help = out.indexOf('<h3>Getting help</h3>');
  assert.ok(help > 0);
  assert.ok(out.indexOf('class="primary tour-start"') > help, 'the button comes after the Getting help heading');
  assert.ok(out.indexOf('class="tour-invite"') < out.indexOf('<h3>'), 'the invitation is above the first section');
});
