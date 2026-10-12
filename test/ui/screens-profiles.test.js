import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profilesView } from '../../src/ui/screens/profiles.js';
import { profileScreen } from '../../src/ui/screens/start.js';
import { shell } from '../../src/ui/screens/common.js';
import { homeView } from '../../src/ui/screens/home.js';
import { platformsView } from '../../src/ui/screens/platforms.js';
import { profileName } from '../../src/ui/names.js';
import { activeProfiles } from '../../src/ui/prefs.js';
import { state as base } from './screens-workflows.test.js';
import { seed } from '../helpers.js';

const gone = { by: 'u1', at: '2026-10-01T10:00:00+10:00' };
const st = (view = { name: 'profiles' }) => ({ ...base, view, profiles: [...base.profiles, { id: 'u3', name: 'Sid', createdAt: '', retired: gone }] });

test('active profiles leave out the retired; names still show for what they did', () => {
  assert.deepEqual(activeProfiles(st()).map((p) => p.name), ['Ada', 'Grace']);
  assert.equal(profileName(st(), 'u3'), 'Sid');
});

test('the Profiles page: each profile, Retire… for the active, Restore for the retired, what each still owns', () => {
  const out = profilesView(st(), seed()).toString();
  assert.match(out, /<h1>Profiles<\/h1>/);
  assert.match(out, /Grace[\s\S]*?Owns Bravo[\s\S]*?data-run="retireProfile"[^>]*data-id="u2"/);
  assert.match(out, /Sid[\s\S]*?Retired[\s\S]*?data-action="restoreProfile"[^>]*data-id="u3"/);
  assert.match(out, /Ada[\s\S]*?You/, 'your own has no Retire');
});

test('a retired profile that has since been given something is flagged', () => {
  const s = { ...st(), profiles: [base.profiles[0], { ...base.profiles[1], retired: gone }] };
  assert.match(profilesView(s, seed()).toString(), /Retired, but owns Bravo/);
});

test('the ☰ menu has Profiles', () => {
  assert.match(shell(st({ name: 'home' }), '').toString(), /data-view="profiles"[^>]*>Profiles</);
});

test('the Log In screen shows active profiles, and a link to show the retired ones', () => {
  const s = { ...st(), screen: 'profile' };
  const out = profileScreen(s).toString();
  assert.doesNotMatch(out, />Sid</);
  assert.match(out, /data-action="toggleRetiredProfiles"[^>]*>Show retired profiles \(1\)/);
  assert.match(profileScreen({ ...s, showRetiredProfiles: true }).toString(), />Sid<[\s\S]*?Retired/);
});

test('people to choose from leave out the retired: Home’s owner switch, a new platform’s owner', () => {
  assert.doesNotMatch(homeView(st({ name: 'home' }), seed()).toString(), /<option value="u3"/);
  const form = platformsView({ ...st({ name: 'platforms' }), editing: { kind: 'newPlatform', id: 'new' } }, seed()).toString().match(/<form data-action="onboardPlatform"[\s\S]*?<\/form>/)[0];
  assert.match(form, /<option value="u2"/);
  assert.doesNotMatch(form, /<option value="u3"/, 'the table’s Owner filter still lists everyone: a record can show a retired owner');
});
