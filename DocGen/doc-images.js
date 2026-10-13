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
