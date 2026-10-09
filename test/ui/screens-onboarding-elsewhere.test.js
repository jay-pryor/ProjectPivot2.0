import { test } from 'node:test';
import assert from 'node:assert/strict';
import { platformsView, platformView } from '../../src/ui/screens/platforms.js';
import { workflowsView } from '../../src/ui/screens/workflows.js';
import { homeView } from '../../src/ui/screens/home.js';
import { platformReviewView } from '../../src/ui/screens/reviews.js';
import { cancelWorkflow } from '../../src/core/ops/workflows.js';
import { onboardingData } from './screens-onboarding.test.js';
import { state } from './screens-workflows.test.js';
import { act } from '../helpers.js';

test('New platform onboards; the dashboard card starts one too', () => {
  const list = platformsView({ ...state, editing: { kind: 'newPlatform', id: 'new' } }, onboardingData()).toString();
  assert.match(list, /data-action="onboardPlatform"/);
  const dash = workflowsView({ ...state, view: { name: 'workflows' } }, onboardingData()).toString();
  assert.match(dash, /Platform Onboarding[\s\S]*?data-action="onboardPlatform"/);
  assert.doesNotMatch(dash, /Platform Onboarding<\/h3>[^<]*<span class="tag">Coming soon/);
});

test('an Onboarding platform is tagged in the list, on its page and on Home, and its review start says finish onboarding first', () => {
  const d = onboardingData();
  assert.match(platformsView(state, d).toString(), /Gamma[\s\S]*?Onboarding/);
  assert.match(platformView({ ...state, view: { name: 'platform', id: 'p9' } }, d, 'p9').toString(), /class="tag onboarding-tag"[^>]*>Onboarding · WF-001/);
  assert.match(homeView({ ...state, homeOwner: 'everyone' }, d).toString(), /Gamma[\s\S]*?onboarding-tag/);
  assert.match(platformReviewView({ ...state, view: { name: 'platformReview', id: 'p9' } }, d, 'p9').toString(), /Finish onboarding first/);
});

test('a cancelled onboarding offers Onboard again on the platform page', () => {
  const d = cancelWorkflow(onboardingData(), act, { workflowId: 'w9' });
  const out = platformView({ ...state, view: { name: 'platform', id: 'p9' } }, d, 'p9').toString();
  assert.match(out, /data-action="onboardAgain"[^>]*data-platform-id="p9"|data-platform-id="p9"[^>]*data-action="onboardAgain"/);
  assert.doesNotMatch(platformView({ ...state, view: { name: 'platform', id: 'p9' } }, onboardingData(), 'p9').toString(), /onboardAgain/, 'not while one is open');
});
