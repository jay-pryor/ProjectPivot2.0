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

import { prepareImage } from '../../DocGen/doc-images.js';

async function inflate(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return [...new Uint8Array(await new Response(s).arrayBuffer())];
}

test('a JPEG goes into the PDF as it is, its colours from its components', async () => {
  const rgb = await prepareImage(makeJpeg(4, 3, 3));
  assert.equal(rgb.pdf.filter, 'DCTDecode');
  assert.equal(rgb.pdf.colourSpace, 'DeviceRGB');
  assert.deepEqual([...rgb.pdf.data], [...makeJpeg(4, 3, 3)]);
  assert.equal((await prepareImage(makeJpeg(4, 3, 1))).pdf.colourSpace, 'DeviceGray');
  const cmyk = await prepareImage(makeJpeg(4, 3, 4));
  assert.equal(cmyk.pdf.colourSpace, 'DeviceCMYK');
  assert.equal(cmyk.pdf.decode, '[1 0 1 0 1 0 1 0]');
});

test('an RGB PNG with every filter gives back its pixels, with no mask', async () => {
  for (const filter of [0, 1, 2, 3, 4]) {
    const png = await makePng({ width: 3, height: 2, filter, sample: (x, y) => [x * 50, y * 100, 7] });
    const p = await prepareImage(png);
    assert.equal(p.pdf.filter, 'FlateDecode');
    assert.equal(p.pdf.colourSpace, 'DeviceRGB');
    assert.deepEqual(await inflate(p.pdf.data), [0, 0, 7, 50, 0, 7, 100, 0, 7, 0, 100, 7, 50, 100, 7, 100, 100, 7], `filter ${filter}`);
    assert.equal(p.pdf.alpha, undefined);
    assert.equal(p.mime, 'image/png');
    assert.deepEqual([...p.bytes], [...png]);
  }
});

test('an RGBA PNG keeps its transparency as a mask', async () => {
  const p = await prepareImage(await makePng({ width: 2, height: 1, colourType: 6, sample: (x) => [255, 0, 0, x ? 0 : 255] }));
  assert.deepEqual(await inflate(p.pdf.data), [255, 0, 0, 255, 0, 0]);
  assert.deepEqual(await inflate(p.pdf.alpha), [255, 0]);
});

test('grey, grey with alpha, low bit depths and 16 bits come out as 8-bit samples', async () => {
  const g1 = await prepareImage(await makePng({ width: 3, height: 1, colourType: 0, bitDepth: 1, sample: (x) => [x % 2] }));
  assert.equal(g1.pdf.colourSpace, 'DeviceGray');
  assert.deepEqual(await inflate(g1.pdf.data), [0, 255, 0]);
  const g4 = await prepareImage(await makePng({ width: 2, height: 1, colourType: 0, bitDepth: 4, sample: (x) => [x ? 15 : 5] }));
  assert.deepEqual(await inflate(g4.pdf.data), [85, 255]);
  const ga = await prepareImage(await makePng({ width: 2, height: 1, colourType: 4, sample: (x) => [9, x ? 128 : 255] }));
  assert.deepEqual(await inflate(ga.pdf.data), [9, 9]);
  assert.deepEqual(await inflate(ga.pdf.alpha), [255, 128]);
  const deep = await prepareImage(await makePng({ width: 1, height: 1, bitDepth: 16, sample: () => [0x1234, 0xFF00, 0x00FF] }));
  assert.deepEqual(await inflate(deep.pdf.data), [0x12, 0xFF, 0x00]);
});

test('a paletted PNG becomes RGB, a transparent index becomes the mask', async () => {
  const p = await prepareImage(await makePng({ width: 3, height: 1, colourType: 3, bitDepth: 2, palette: [[10, 20, 30], [40, 50, 60], [70, 80, 90]],
    trns: [0], sample: (x) => [x] }));
  assert.equal(p.pdf.colourSpace, 'DeviceRGB');
  assert.deepEqual(await inflate(p.pdf.data), [10, 20, 30, 40, 50, 60, 70, 80, 90]);
  assert.deepEqual(await inflate(p.pdf.alpha), [0, 255, 255]);
});

test('a colour key in tRNS makes those grey or RGB pixels transparent', async () => {
  const g = await prepareImage(await makePng({ width: 2, height: 1, colourType: 0, trns: [0, 7], sample: (x) => [x ? 7 : 8] }));
  assert.deepEqual(await inflate(g.pdf.alpha), [255, 0]);
  const c = await prepareImage(await makePng({ width: 2, height: 1, colourType: 2, trns: [0, 1, 0, 2, 0, 3], sample: (x) => (x ? [1, 2, 3] : [1, 2, 4]) }));
  assert.deepEqual(await inflate(c.pdf.alpha), [255, 0]);
});

test('an interlaced PNG gives the same pixels as a plain one', async () => {
  const sample = (x, y) => [x * 20, y * 30, (x + y) % 256];
  const plain = await prepareImage(await makePng({ width: 9, height: 7, sample }));
  const laced = await prepareImage(await makePng({ width: 9, height: 7, interlace: true, filter: 4, sample }));
  assert.deepEqual(await inflate(laced.pdf.data), await inflate(plain.pdf.data));
});

test('a broken PNG or an unknown file is refused', async () => {
  const png = await makePng({ width: 3, height: 2, sample: () => [1, 2, 3] });
  await assert.rejects(prepareImage(png.slice(0, png.length - 20)));
  await assert.rejects(prepareImage(new TextEncoder().encode('not an image at all')), /Only PNG and JPEG images can be used/);
});

import { loadImages, dataUri } from '../../DocGen/doc-images.js';

test('loading a document\'s images: present ones prepared, missing and broken ones null', async () => {
  const png = await makePng({ width: 2, height: 2, sample: () => [1, 2, 3] });
  const files = { 'files/report-images/a.png': png, 'files/report-images/broken.png': png.slice(0, 30) };
  const doc = { blocks: [{ kind: 'figure', images: [{ src: 'files/report-images/a.png' }, { src: 'files/report-images/gone.png' }, { src: 'files/report-images/broken.png' }] }] };
  const read = async (p) => files[p] ?? null;
  const got = await loadImages(doc, read);
  assert.deepEqual(Object.keys(got).sort(), ['files/report-images/a.png', 'files/report-images/broken.png', 'files/report-images/gone.png']);
  assert.equal(got['files/report-images/a.png'].width, 2);
  assert.equal(got['files/report-images/gone.png'], null);
  assert.equal(got['files/report-images/broken.png'], null);
  const throwing = await loadImages(doc, async () => { throw new Error('denied'); });
  assert.equal(throwing['files/report-images/a.png'], null);
});

test('a data URI carries the original file', () => {
  assert.equal(dataUri({ mime: 'image/png', bytes: new Uint8Array([1, 2, 255]) }), 'data:image/png;base64,AQL/');
});

test('a phone photo\'s orientation: turned a quarter, its width and height swap', () => {
  assert.deepEqual(imageInfo(makeJpeg(640, 480, 3, 6)), { type: 'jpeg', mime: 'image/jpeg', width: 480, height: 640, orientation: 6 });
  assert.deepEqual(imageInfo(makeJpeg(640, 480, 3, 8, true)), { type: 'jpeg', mime: 'image/jpeg', width: 480, height: 640, orientation: 8 });
  assert.deepEqual(imageInfo(makeJpeg(640, 480, 3, 3)), { type: 'jpeg', mime: 'image/jpeg', width: 640, height: 480, orientation: 3 });
  assert.deepEqual(imageInfo(makeJpeg(640, 480, 3, 1)), { type: 'jpeg', mime: 'image/jpeg', width: 640, height: 480 });
});

test('prepared for the PDF, a turned photo keeps its stored size and how to turn it', async () => {
  const p = await prepareImage(makeJpeg(640, 480, 3, 6));
  assert.deepEqual([p.width, p.height, p.pdf.width, p.pdf.height, p.pdf.orientation], [480, 640, 640, 480, 6]);
});

test('an image over 50 megapixels is refused before it is decoded', async () => {
  const { MAX_IMAGE_PIXELS } = await import('../../DocGen/doc-images.js');
  assert.equal(MAX_IMAGE_PIXELS, 50_000_000);
  const huge = await makePng({ width: 1, height: 1, sample: () => [0, 0, 0] });
  huge.set([0, 0, 0x4E, 0x20, 0, 0, 0x4E, 0x20], 16);          // 20000 × 20000 in the header
  await assert.rejects(prepareImage(huge), /20000 × 20000 pixels; an image can be at most 50 megapixels/);
});
