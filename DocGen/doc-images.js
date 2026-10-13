/**
 * Images for reports: what a PNG or JPEG file is (sync, from its header) and, for the PDF,
 * its pixels ready to embed (async, see prepareImage). No dependencies: zlib is the
 * platform's DecompressionStream / CompressionStream.
 */

/** The largest image file accepted. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** The boxes of each image layout: rows of widths, as fractions of the text width. */
export const FIGURE_LAYOUTS = Object.freeze({
  single: [[1]],
  pair: [[0.5, 0.5]],
  grid4: [[0.5, 0.5], [0.5, 0.5]],
  grid21: [[0.5, 0.5], [1]],
  grid12: [[1], [0.5, 0.5]],
});
/** @param {string} layout */
export const boxCount = (layout) => (/** @type {any} */ (FIGURE_LAYOUTS)[layout] ?? FIGURE_LAYOUTS.single).flat().length;

/** Where an image file is kept in the data folder. @param {'report'|'standard'|string} source @param {string} file */
export const imagePath = (source, file) => `files/${source === 'standard' ? 'standard-images' : 'report-images'}/${file}`;

const u16 = (/** @type {Uint8Array} */ b, /** @type {number} */ i) => (b[i] << 8) | b[i + 1];
const u32 = (/** @type {Uint8Array} */ b, /** @type {number} */ i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const PNG_SIG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

/**
 * A PNG's or JPEG's type and size in pixels, or null when the bytes are neither (or broken).
 * @param {Uint8Array} bytes
 * @returns {{ type: 'png'|'jpeg', mime: 'image/png'|'image/jpeg', width: number, height: number } | null}
 */
export function imageInfo(bytes) {
  const b = bytes;
  if (!b || b.length < 4) return null;
  if (PNG_SIG.every((v, i) => b[i] === v)) {
    if (b.length < 24 || String.fromCharCode(b[12], b[13], b[14], b[15]) !== 'IHDR') return null;
    const width = u32(b, 16), height = u32(b, 20);
    return width && height ? { type: 'png', mime: 'image/png', width, height } : null;
  }
  if (b[0] === 0xFF && b[1] === 0xD8) {
    const sof = jpegFrame(b);
    return sof ? { type: 'jpeg', mime: 'image/jpeg', width: sof.width, height: sof.height } : null;
  }
  return null;
}

/** A JPEG's frame header: its size and number of colour components. @param {Uint8Array} b */
function jpegFrame(b) {
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xFF) return null;
    const m = b[i + 1];
    if (m === 0xFF) { i++; continue; }
    if (m === 0x01 || (m >= 0xD0 && m <= 0xD9)) { i += 2; continue; }
    const len = u16(b, i + 2);
    // SOF0..SOF15, except DHT (C4), JPG (C8) and DAC (CC).
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      if (i + 10 > b.length) return null;
      const height = u16(b, i + 5), width = u16(b, i + 7), components = b[i + 9];
      return width && height ? { width, height, components } : null;
    }
    i += 2 + len;
  }
  return null;
}

/** Every image a document's figures use, each once, in order. @param {any} doc */
export function figureSources(doc) {
  /** @type {string[]} */
  const out = [];
  for (const b of doc?.blocks ?? []) {
    if (b.kind !== 'figure') continue;
    for (const im of b.images ?? []) if (im && im.src && !out.includes(im.src)) out.push(im.src);
  }
  return out;
}

/** zlib in or out, through the platform's streams. @param {Uint8Array} data @param {boolean} inflate */
async function zlib(data, inflate) {
  const s = new Blob([/** @type {BlobPart} */ (data)]).stream().pipeThrough(inflate ? new DecompressionStream('deflate') : new CompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/**
 * @typedef {{ type: 'png'|'jpeg', mime: string, width: number, height: number, bytes: Uint8Array,
 *   pdf: { filter: 'DCTDecode'|'FlateDecode', colourSpace: 'DeviceRGB'|'DeviceGray'|'DeviceCMYK',
 *          data: Uint8Array, decode?: string, alpha?: Uint8Array } }} PreparedImage
 */

/**
 * An image ready for the PDF: a JPEG as it is; a PNG decoded to 8-bit grey or RGB samples
 * (zlib-compressed again) with its transparency, if it has any, as a separate mask.
 * @param {Uint8Array} bytes
 * @returns {Promise<PreparedImage>}
 */
export async function prepareImage(bytes) {
  const info = imageInfo(bytes);
  if (!info) throw new Error('Only PNG and JPEG images can be used');
  if (info.type === 'jpeg') {
    const n = /** @type {{ components: number }} */ (jpegFrame(bytes)).components;
    return { ...info, bytes, pdf: { filter: 'DCTDecode', colourSpace: n === 1 ? 'DeviceGray' : n === 4 ? 'DeviceCMYK' : 'DeviceRGB', data: bytes,
      // Adobe's CMYK JPEGs are stored inverted; nearly every CMYK JPEG is Adobe's.
      ...(n === 4 ? { decode: '[1 0 1 0 1 0 1 0]' } : {}) } };
  }
  const png = await decodePng(bytes);
  return { ...info, bytes, pdf: { filter: 'FlateDecode', colourSpace: png.grey ? 'DeviceGray' : 'DeviceRGB',
    data: await zlib(png.colour, false), ...(png.alpha ? { alpha: await zlib(png.alpha, false) } : {}) } };
}

const CHANNELS = /** @type {Record<number, number>} */ ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 });
const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];

/**
 * A PNG's pixels as 8-bit grey or RGB, one byte a sample, and an 8-bit alpha when any pixel
 * is not fully opaque.
 * @param {Uint8Array} b
 * @returns {Promise<{ grey: boolean, colour: Uint8Array, alpha: Uint8Array | null }>}
 */
async function decodePng(b) {
  const bad = (/** @type {string} */ why) => new Error(`The PNG could not be read: ${why}`);
  let i = 8, width = 0, height = 0, bd = 0, ct = 0, laced = false;
  /** @type {Uint8Array | null} */ let plte = null;
  /** @type {Uint8Array | null} */ let trns = null;
  /** @type {Uint8Array[]} */ const idat = [];
  let ended = false;
  while (i + 8 <= b.length) {
    const len = u32(b, i), type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    if (i + 12 + len > b.length) throw bad('it ends part-way through');
    const data = b.subarray(i + 8, i + 8 + len);
    if (type === 'IHDR') { width = u32(data, 0); height = u32(data, 4); bd = data[8]; ct = data[9]; laced = data[12] === 1; }
    else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') { ended = true; break; }
    i += 12 + len;
  }
  if (!ended || !idat.length) throw bad('it ends part-way through');
  const ch = CHANNELS[ct];
  if (!ch || ![1, 2, 4, 8, 16].includes(bd) || (ct === 3 && !plte)) throw bad('its colour type is not one PNG allows');
  const joined = new Uint8Array(idat.reduce((s, d) => s + d.length, 0));
  let at = 0;
  for (const d of idat) { joined.set(d, at); at += d.length; }
  let raw;
  try { raw = await zlib(joined, true); } catch { throw bad('its picture data is damaged'); }

  const bitsPx = ch * bd, bpp = Math.max(1, Math.ceil(bitsPx / 8));
  const grey = ct === 0 || ct === 4;
  const outCh = grey ? 1 : 3;
  const colour = new Uint8Array(width * height * outCh);
  const alpha = new Uint8Array(width * height).fill(255);
  let translucent = false;
  const max = (1 << Math.min(bd, 8)) - 1;
  // The colour key, at the image's own bit depth (tRNS for types 0 and 2).
  const key = trns && ct === 0 ? [u16(trns, 0)] : trns && ct === 2 ? [u16(trns, 0), u16(trns, 2), u16(trns, 4)] : null;
  let pos = 0;

  /** Unfilter w×h pixels from `raw` at `pos`, placing pixel (i, j) at put(i, j). */
  const pass = (/** @type {number} */ w, /** @type {number} */ h, /** @type {(i: number, j: number) => number} */ put) => {
    const stride = Math.ceil((w * bitsPx) / 8);
    let prev = new Uint8Array(stride);
    for (let j = 0; j < h; j++) {
      if (pos + 1 + stride > raw.length) throw bad('its picture data is short');
      const f = raw[pos], row = raw.slice(pos + 1, pos + 1 + stride);
      pos += 1 + stride;
      for (let k = 0; k < stride; k++) {
        const a = k >= bpp ? row[k - bpp] : 0, up = prev[k], c = k >= bpp ? prev[k - bpp] : 0;
        if (f === 1) row[k] = (row[k] + a) & 255;
        else if (f === 2) row[k] = (row[k] + up) & 255;
        else if (f === 3) row[k] = (row[k] + ((a + up) >> 1)) & 255;
        else if (f === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); row[k] = (row[k] + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c)) & 255; }
        else if (f !== 0) throw bad('a row has an unknown filter');
      }
      for (let x = 0; x < w; x++) {
        /** @type {number[]} */ const s = [];
        for (let n = 0; n < ch; n++) {
          const bit = (x * ch + n) * bd;
          s.push(bd === 16 ? (row[bit >> 3] << 8) | row[(bit >> 3) + 1] : bd === 8 ? row[bit >> 3] : (row[bit >> 3] >> (8 - bd - (bit & 7))) & max);
        }
        const px = put(x, j);
        const to8 = (/** @type {number} */ v) => (bd === 16 ? v >> 8 : bd === 8 ? v : Math.round((v * 255) / max));
        let a8 = 255;
        if (ct === 3) {
          const p = /** @type {Uint8Array} */ (plte), idx = s[0];
          colour.set([p[idx * 3] ?? 0, p[idx * 3 + 1] ?? 0, p[idx * 3 + 2] ?? 0], px * 3);
          if (trns && idx < trns.length) a8 = trns[idx];
        } else {
          for (let n = 0; n < outCh; n++) colour[px * outCh + n] = to8(s[n]);
          if (ct === 4 || ct === 6) a8 = to8(s[ch - 1]);
          else if (key && key.every((v, n) => v === s[n])) a8 = 0;
        }
        alpha[px] = a8;
        if (a8 !== 255) translucent = true;
      }
      prev = row;
    }
  };
  if (laced) {
    for (const [x0, y0, dx, dy] of ADAM7) {
      const w = Math.ceil((width - x0) / dx), h = Math.ceil((height - y0) / dy);
      if (w > 0 && h > 0) pass(w, h, (x, y) => (y0 + y * dy) * width + x0 + x * dx);
    }
  } else pass(width, height, (x, y) => y * width + x);
  return { grey, colour, alpha: translucent ? alpha : null };
}

/**
 * Every image a document uses, read and prepared; null for one missing or unreadable, so the
 * report is still made, with a placeholder in its place.
 * @param {any} doc @param {(path: string) => Promise<Uint8Array | null>} read
 * @returns {Promise<Record<string, PreparedImage | null>>}
 */
export async function loadImages(doc, read) {
  /** @type {Record<string, PreparedImage | null>} */
  const out = {};
  await Promise.all(figureSources(doc).map(async (src) => {
    try {
      const bytes = await read(src);
      out[src] = bytes ? await prepareImage(bytes) : null;
    } catch {
      out[src] = null;
    }
  }));
  return out;
}

/** The original file as a data: URI, for the HTML. @param {{ mime: string, bytes: Uint8Array }} img */
export function dataUri(img) {
  let s = '';
  for (let i = 0; i < img.bytes.length; i += 0x8000) s += String.fromCharCode(...img.bytes.subarray(i, i + 0x8000));
  return `data:${img.mime};base64,${btoa(s)}`;
}
