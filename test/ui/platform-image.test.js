import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFolder } from '../fakes/folder.js';
import { MemoryStorage } from '../fakes/storage.js';
import { fixedClock } from '../../src/core/time.js';
import { createController, initialState } from '../../src/ui/controller.js';
import { clearBackground } from '../../src/ui/image.js';
import { platformView } from '../../src/ui/screens/platforms.js';
import { homeView } from '../../src/ui/screens/home.js';
import { setPlatformImage } from '../../src/core/ops/platforms.js';
import { seed, act } from '../helpers.js';

test('the background goes: every pixel joined to the top-left one, side by side, of its colour (near enough); the rest stays', () => {
  // 4×3: white background around a red block, a white pixel shut inside it, and one white pixel
  // touching the background only at a corner.
  const W = [255, 255, 255, 255];
  const N = [252, 250, 255, 255]; // near enough to white
  const R = [200, 0, 0, 255];
  const px = [
    W, N, W, W,
    W, R, R, W,
    W, R, W, R,
  ];
  // Make (2,2) shut in: red all round it except the edge below, which is the image's edge.
  px[7] = R;
  const d = new Uint8ClampedArray(px.flat());
  clearBackground(d, 4, 3);
  const alpha = [...Array(12).keys()].map((i) => d[i * 4 + 3]);
  assert.deepEqual(alpha, [
    0, 0, 0, 0,
    0, 255, 255, 255,
    0, 255, 255, 255,
  ]);
});

test('a smoothed edge leaves no pale fringe: a pixel half picture, half background, becomes half see-through in the picture\'s own colour', () => {
  // A row: white background, a half-white half-blue blend, then blue.
  const d = new Uint8ClampedArray([255, 255, 255, 255, 157, 189, 236, 255, 58, 123, 213, 255]);
  clearBackground(d, 3, 1);
  assert.equal(d[3], 0, 'the background goes');
  assert.ok(d[7] > 80 && d[7] < 200, `the blend is part see-through (alpha ${d[7]})`);
  assert.ok(d[4] < 120 && d[6] > 180, `and blue, not pale (${d[4]}, ${d[5]}, ${d[6]})`);
  assert.deepEqual([...d.slice(8)], [58, 123, 213, 255], 'the picture itself is untouched');
});

function setup(prepareImage) {
  const f = new MemoryFolder();
  const c = createController({ clock: fixedClock('2026-09-28T10:00:00+10:00'), storage: new MemoryStorage(), minSaveMs: 0,
    pickFolder: async () => f.handle, pickSaveFile: async (n) => f.handle.getFileHandle(n, { create: true }), pickOpenFile: async () => null, prepareImage });
  return { f, c };
}

test('Add image: the image readied (background away, squared), copied into the folder, and the platform pointed at it; Remove takes it away', async () => {
  const seen = [];
  const { f, c } = setup(async (file) => { seen.push(file.name); return { blob: new Blob(['PNGDATA']), name: 'logo.png', type: 'image/png' }; });
  await c.dispatch({ type: 'chooseFolder' });
  await c.dispatch({ type: 'createProfile', name: 'Ada' });
  await c.dispatch({ type: 'selectProfile', id: c.getState().profiles[0].id });
  await c.dispatch({ type: 'createPlatform', id: 'p1', name: 'Alpha', ownerId: c.getState().profileId });
  await c.dispatch({ type: 'addPlatformImage', id: 'p1', file: new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }) });
  const p = c.getState().session.working.records.platform.p1;
  assert.deepEqual(seen, ['logo.svg']);
  assert.match(p.image.stored, /^files\/platforms\/p1\/[0-9a-f]{8}-logo\.png$/);
  assert.deepEqual([p.image.name, p.image.type, p.image.addedAt], ['logo.png', 'image/png', '2026-09-28T10:00:00+10:00']);
  assert.equal(f.read(p.image.stored), 'PNGDATA');
  assert.equal(await (await c.readStoredFile(p.image.stored)).text(), 'PNGDATA');
  await c.dispatch({ type: 'setPlatformImage', id: 'p1' });
  assert.equal(c.getState().session.working.records.platform.p1.image, null);
  assert.ok(f.exists(p.image.stored), 'the file stays, for older saves');
});

test('the image shows on the platform\'s page, left of its boxes, and on its card on Home; the ⋯ menu adds, changes or removes it', () => {
  const state = { ...initialState(), screen: 'main', today: '2026-09-28', profileId: 'u1', homeOwner: 'everyone', view: { name: 'platform', id: 'p1' },
    profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }, { id: 'u2', name: 'Grace', createdAt: '' }] };
  const plain = seed();
  const before = platformView(state, plain, 'p1').toString();
  assert.match(before, /<details class="dots-menu doc-menu">[\s\S]*?Add image…<input type="file" accept="image\/png,image\/svg\+xml,.png,.svg" hidden data-image-for="p1"><\/label>/);
  assert.doesNotMatch(before, /Remove image|image-box/);
  assert.match(before, /<div class="plat-top">\s*<div class="dash-grid three">/);
  const d = setPlatformImage(plain, act, { id: 'p1', image: { stored: 'files/platforms/p1/ab-logo.png', name: 'logo.png', type: 'image/png', addedBy: 'u1', addedAt: act.at } });
  const out = platformView(state, d, 'p1').toString();
  assert.match(out, /<div class="plat-top with-image"><div class="plat-image image-box"><img alt="Alpha" data-stored="files\/platforms\/p1\/ab-logo.png"><\/div>\s*<div class="dash-grid three">\s*<section class="dash-card" aria-label="Platform">/);
  assert.match(out, /Change image…[\s\S]*?data-action="setPlatformImage" data-id="p1">[\s\S]*?Remove image/);
  const home = homeView(state, d).toString();
  assert.match(home, /No review schedule<\/span>\s*<div class="pcard-image image-box"><img alt="Alpha" data-stored="files\/platforms\/p1\/ab-logo.png"><\/div>/);
  assert.equal((home.match(/image-box/g) ?? []).length, 1, 'only Alpha has one');
});

test('the image also shows on a hazard\'s and a control\'s tab for that platform, left of their top boxes; not on another platform\'s tab', async () => {
  const { hazardView } = await import('../../src/ui/screens/hazards.js');
  const { controlView } = await import('../../src/ui/screens/controls.js');
  const state = { ...initialState(), screen: 'main', today: '2026-09-28', profileId: 'u1', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }] };
  const d = setPlatformImage(seed(), act, { id: 'p1', image: { stored: 'files/platforms/p1/ab-logo.png', name: 'logo.png', type: 'image/png', addedBy: 'u1', addedAt: act.at } });
  const img = /<div class="plat-top with-image"><div class="plat-image image-box"><img alt="Alpha" data-stored="files\/platforms\/p1\/ab-logo.png"><\/div><div class="dash-grid (three|two)">/;
  const hazard = hazardView({ ...state, view: { name: 'hazard', id: 'h1', tab: 'p:p1' } }, d, 'h1').toString();
  assert.match(hazard, img);
  assert.match(hazard, /plat-image[\s\S]*?<section class="dash-card" aria-label="Hazard">/, 'left of the Hazard box');
  const control = controlView({ ...state, view: { name: 'control', id: 'c1', tab: 'p:p1' } }, d, 'c1').toString();
  assert.match(control, img);
  assert.match(control, /plat-image[\s\S]*?<section class="dash-card" aria-label="Implemented by">/, 'left of Implemented by on the platform');
  assert.doesNotMatch(hazardView({ ...state, view: { name: 'hazard', id: 'h1', tab: 'p:p2' } }, d, 'h1').toString(), /image-box/, 'Bravo has none');
});

test('a hazard\'s Overview shows each platform\'s image on its tile, and the platform number as large as its name', async () => {
  const { hazardView } = await import('../../src/ui/screens/hazards.js');
  const state = { ...initialState(), screen: 'main', today: '2026-09-28', profileId: 'u1', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }], view: { name: 'hazard', id: 'h1' } };
  const d = setPlatformImage(seed(), act, { id: 'p1', image: { stored: 'files/platforms/p1/ab-logo.png', name: 'logo.png', type: 'image/png', addedBy: 'u1', addedAt: act.at } });
  const out = hazardView(state, d, 'h1').toString();
  assert.match(out, /class="dash-card plat-card"[^>]*data-tab="p:p1">[\s\S]*?causal factors?<\/span>\s*<div class="pcard-image image-box"><img alt="Alpha" data-stored="files\/platforms\/p1\/ab-logo.png"><\/div>\s*<\/button>/);
  assert.equal((out.match(/image-box/g) ?? []).length, 1, 'Bravo has none');
});

test('a control\'s Overview shows each platform\'s image on its tile too', async () => {
  const { controlView } = await import('../../src/ui/screens/controls.js');
  const state = { ...initialState(), screen: 'main', today: '2026-09-28', profileId: 'u1', profiles: [{ id: 'u1', name: 'Ada', createdAt: '' }], view: { name: 'control', id: 'c1' } };
  const d = setPlatformImage(seed(), act, { id: 'p1', image: { stored: 'files/platforms/p1/ab-logo.png', name: 'logo.png', type: 'image/png', addedBy: 'u1', addedAt: act.at } });
  const out = controlView(state, d, 'c1').toString();
  assert.match(out, /class="dash-card plat-card"[^>]*data-tab="p:p1">[\s\S]*?class="plat-count">[\s\S]*?<\/span>\s*<div class="pcard-image image-box"><img alt="Alpha" data-stored="files\/platforms\/p1\/ab-logo.png"><\/div>\s*<\/button>/);
  assert.equal((out.match(/image-box/g) ?? []).length, 1, 'Bravo has none');
});
