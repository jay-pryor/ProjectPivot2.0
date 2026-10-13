import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageInfo, imagePath, FIGURE_LAYOUTS, boxCount, figureSources, MAX_IMAGE_BYTES } from '../../DocGen/doc-images.js';
import { makePng, makeJpeg } from './image-fixtures.js';

test('a PNG and a JPEG give their type and size', async () => {
  assert.deepEqual(imageInfo(await makePng({ width: 3, height: 2, sample: () => [1, 2, 3] })), { type: 'png', mime: 'image/png', width: 3, height: 2 });
  assert.deepEqual(imageInfo(makeJpeg(640, 480)), { type: 'jpeg', mime: 'image/jpeg', width: 640, height: 480 });
});

test('anything else, or a broken header, is not an image', async () => {
  assert.equal(imageInfo(new TextEncoder().encode('GIF89a......')), null);
  assert.equal(imageInfo(new Uint8Array([0xFF, 0xD8, 0xFF])), null);
  const png = await makePng({ width: 3, height: 2, sample: () => [1, 2, 3] });
  assert.equal(imageInfo(png.slice(0, 20)), null);
  assert.equal(imageInfo(new Uint8Array(0)), null);
});

test('stored images live in their own folders', () => {
  assert.equal(imagePath('report', 'ab12cd34.png'), 'files/report-images/ab12cd34.png');
  assert.equal(imagePath('standard', 'ab12cd34.jpg'), 'files/standard-images/ab12cd34.jpg');
  assert.equal(MAX_IMAGE_BYTES, 20 * 1024 * 1024);
});

test('the five layouts and how many boxes each has', () => {
  assert.deepEqual(Object.keys(FIGURE_LAYOUTS), ['single', 'pair', 'grid4', 'grid21', 'grid12']);
  assert.deepEqual(['single', 'pair', 'grid4', 'grid21', 'grid12', 'nonsense'].map(boxCount), [1, 2, 4, 3, 3, 1]);
  assert.deepEqual(FIGURE_LAYOUTS.grid21, [[0.5, 0.5], [1]]);
  assert.deepEqual(FIGURE_LAYOUTS.grid12, [[1], [0.5, 0.5]]);
});

test('the images a document uses, each once', () => {
  const doc = { blocks: [{ kind: 'paragraph', runs: [] },
    { kind: 'figure', images: [{ src: 'files/report-images/a.png' }, null, { src: 'files/standard-images/b.jpg' }] },
    { kind: 'figure', images: [{ src: 'files/report-images/a.png' }] }] };
  assert.deepEqual(figureSources(doc), ['files/report-images/a.png', 'files/standard-images/b.jpg']);
});
