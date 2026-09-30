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
  assert.ok(SPLASH_MS > 2300 && SPLASH_MS < 2900, 'a little quicker than the original: about two and a half seconds, all told');
});

test('the start screen heads with the same logo and PIVOT', async () => {
  const { openScreen } = await import('../../src/ui/screens/start.js');
  assert.match(openScreen({ ...initialState(), screen: 'open' }).toString(), /<h1 class="brand-title"><svg class="brand-logo"[\s\S]*?<\/svg>PIVOT<\/h1>/);
});

test('the folder name sits on the right of the top bar, after the navigation', () => {
  const out = shell({ ...state, folderName: 'Safety' }, html``).toString();
  assert.ok(out.indexOf('</nav>') < out.indexOf('class="folder"'), 'the folder comes after the buttons');
  assert.ok(out.indexOf('class="spacer"') < out.indexOf('class="folder"'), 'pushed to the right');
});

test('the top-bar logo is cropped to its drawing, so it can be sized to the letters', () => {
  assert.match(FULCRUM_SVG, /viewBox="2 15 60 47"/);
});

test('the splash names Pivot under the HIGHCOM wordmark, right-aligned, with a rule between', () => {
  assert.match(SPLASH_SVG, /<line id="hc-rule"[^>]*x1="231\.6"[^>]*x2="864"/, 'the rule spans the wordmark');
  assert.match(SPLASH_SVG, /<text id="hc-product" class="product" x="864"[^>]*text-anchor="end"[^>]*>PIVOT<\/text>/);
});

test('the fulcrum\'s triangle is the HIGHCOM orange, in the app and the tab icon', () => {
  assert.match(FULCRUM_SVG, /<polygon[^>]*fill="var\(--p-accent, #fa9a26\)"/);
  assert.match(FULCRUM_ICON, /<polygon[^>]*fill="#fa9a26"/);
  for (const svg of [FULCRUM_SVG, FULCRUM_ICON]) assert.doesNotMatch(svg, /3f7fa6/i);
});

test('the navigation and page titles read in capitals; what people type stays as typed', async () => {
  const fs = await import('node:fs');
  const css = fs.readFileSync(new URL('../../src/ui/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.topbar \.nav \{[^}]*text-transform: uppercase;/);
  assert.match(css, /\.view h1 \{[^}]*text-transform: uppercase;/);
  assert.doesNotMatch(css, /\.doc-title \{[^}]*text-transform/, 'a record\'s own title is not changed');
});

test('links are the accent orange (a deeper orange on light, so they stay readable); info tags keep their blue', async () => {
  const fs = await import('node:fs');
  const css = fs.readFileSync(new URL('../../src/ui/styles.css', import.meta.url), 'utf8');
  const links = [...css.matchAll(/--p-link:\s*([^;]+);/g)].map((m) => m[1].trim());
  assert.deepEqual(links, ['#fa9a26', '#a85c00']);
  assert.match(css, /\.shared-mark \{[^}]*color: var\(--p-info-fg\)/);
  assert.match(css, /\.chip-change \{[^}]*color: var\(--p-info-fg\)/);
});

test('the browser tab reads PIVOT', () => {
  assert.match(build(), /<title>PIVOT<\/title>/);
});

test('the Saved button is just the word, no tick', async () => {
  const fs = await import('node:fs');
  const css = fs.readFileSync(new URL('../../src/ui/styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.save\.saved::before/);
});

test('the top-bar tabs and page titles carry the orange, square-edged', async () => {
  const fs = await import('node:fs');
  const css = fs.readFileSync(new URL('../../src/ui/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.topbar \.nav::after \{[^}]*background: var\(--p-accent\)/, 'an orange bar under each tab');
  assert.match(css, /\.topbar \.nav\.on::after \{[^}]*transform: scaleX\(1\)/, 'full under the current one');
  assert.match(css, /\.view h1::before \{[^}]*background: var\(--p-accent\)/, 'an orange block before each page title');
  assert.doesNotMatch(css.match(/\.topbar \.nav[^{]*\{[^}]*\}/g).join(''), /border-radius: (?!0)/);
});
