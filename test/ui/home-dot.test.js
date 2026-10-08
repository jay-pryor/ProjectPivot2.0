import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell } from '../../src/ui/screens/common.js';
import { html } from '../../src/ui/html.js';
import { initialState } from '../../src/ui/controller.js';
import { emptyData } from '../../src/core/data.js';
import { createPlatform } from '../../src/core/ops/platforms.js';
import { seed, act, scheduleFixed } from '../helpers.js';

const top = (data, profileId) => shell({ ...initialState(), screen: 'main', today: '2026-09-30', profileId,
  profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }, { id: 'u3', name: 'Cy', createdAt: '' }],
  session: { base: data, working: data, loadedStamp: null }, view: { name: 'hazards' } }, html``).toString();
const home = (out) => /data-view="home">([\s\S]*?)<\/button>/.exec(out)?.[1];

test('Home shows an orange dot, not a count, when the active profile\'s platforms have things to do', () => {
  // seed(): h1 is on p1 (owned by u1) with no ratings, so it is unrated there.
  const busy = home(top(seed(), 'u1'));
  assert.match(busy, /^Home<span class="nav-dot" role="img" aria-label="Things need your attention" title="Things need your attention"><\/span>$/);
  assert.doesNotMatch(busy, /\(/, 'no count in brackets');
  assert.equal(home(top(seed(), 'u3')), 'Home', 'someone who owns no platform with work has no dot');
  const unscheduled = createPlatform(emptyData(), act, { id: 'p1', name: 'Alpha', ownerId: 'u1' });
  assert.match(home(top(unscheduled, 'u1')), /nav-dot/, 'a platform with no review schedule needs one');
  const quiet = scheduleFixed(unscheduled, 'p1', 12, '2027-06-01');
  assert.equal(home(top(quiet, 'u1')), 'Home', 'a platform with nothing to do has no dot');
});

test('a review date moved since its owner last saw it lights the dot', () => {
  const quiet = scheduleFixed(createPlatform(emptyData(), act, { id: 'p1', name: 'Alpha', ownerId: 'u1' }), 'p1', 12, '2027-06-01');
  const moved = { ...quiet, records: { ...quiet.records, platform: { p1: { ...quiet.records.platform.p1, reviewDueSeen: '2028-06-01' } } } };
  assert.match(home(top(moved, 'u1')), /nav-dot/);
});
