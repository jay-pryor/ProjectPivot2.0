import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell } from '../../src/ui/screens/common.js';
import { html } from '../../src/ui/html.js';
import { initialState } from '../../src/ui/controller.js';
import { FULCRUM_SVG, FULCRUM_ICON } from '../../src/ui/logo.js';
import { SPLASH_SVG, SPLASH_MS } from '../../src/ui/splash.js';
import { build } from '../../scripts/build.js';

const state = { ...initialState(), screen: 'main', profileId: 'u1', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }], view: { name: 'home' } };

test('the top bar shows the fulcrum beside PIVOT', () => {
  const out = shell(state, html``).toString();
  assert.match(out, /<span class="brand"><svg class="brand-logo"[^>]*aria-hidden="true"[\s\S]*?<\/svg>PIVOT<\/span>/);
});

test('the logo carries no embedded metadata, and the tab icon has its own colours', () => {
  for (const svg of [FULCRUM_SVG, FULCRUM_ICON]) assert.doesNotMatch(svg, /metadata|c2pa/);
  assert.match(FULCRUM_SVG, /fill="currentColor"/);
  assert.match(FULCRUM_ICON, /prefers-color-scheme: dark/);
  assert.doesNotMatch(FULCRUM_ICON, /currentColor|var\(/, 'a tab icon cannot use the page\'s colours');
});

test('the page has the fulcrum as its tab icon', () => {
  assert.match(build(), /<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,[^"]+">/);
});

test('the splash drawing is self-contained: every id is prefixed, every reference resolves, nothing loads from the network', () => {
  const ids = [...SPLASH_SVG.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length > 10);
  assert.ok(ids.every((id) => id.startsWith('hc-')), `unprefixed: ${ids.filter((id) => !id.startsWith('hc-'))}`);
  const refs = [...SPLASH_SVG.matchAll(/url\(#([^)]+)\)|href="#([^"]+)"/g)].map((m) => m[1] ?? m[2]);
  assert.ok(refs.length > 5);
  for (const r of refs) assert.ok(ids.includes(r), `${r} is referenced but not defined`);
  assert.doesNotMatch(SPLASH_SVG, /https?:\/\/(?!www\.w3\.org)/);
  assert.doesNotMatch(SPLASH_SVG, /Replay|scrub|Slow/, 'the preview controls are not part of the app');
  assert.ok(SPLASH_MS > 2700 && SPLASH_MS < 4500, 'about three and a half seconds, all told');
});

test('the start screen heads with the same logo and PIVOT', async () => {
  const { openScreen } = await import('../../src/ui/screens/start.js');
  assert.match(openScreen({ ...initialState(), screen: 'open' }).toString(), /<h1 class="brand-title"><svg class="brand-logo"[\s\S]*?<\/svg>PIVOT<\/h1>/);
});
