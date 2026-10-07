import { PivotError } from '../core/errors.js';

/** The longest side an image is kept at: plenty for a card or a page, small in the folder. */
const MAX_SIDE = 1024;
/** How far a pixel's colour may stray from the background's and still be background (0–255 a channel). */
const TOLERANCE = 12;

/**
 * Ready a chosen PNG or SVG to be a platform's image. Its background, if it has one, is taken
 * away: the top-left pixel's colour is the background, and every pixel joined to it (side by side,
 * not corner to corner) of that colour becomes see-through. What is left is trimmed to its edges and
 * centred on a square. An SVG with no background is kept as it is, so it stays sharp; one with a
 * background becomes a PNG, as a drawing's background cannot be found pixel by pixel.
 * @param {File} file
 * @returns {Promise<{ blob: Blob, name: string, type: string }>}
 */
export async function prepareImage(file) {
  const svg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
  const png = file.type === 'image/png' || /\.png$/i.test(file.name);
  if (!svg && !png) throw new PivotError('image.type', 'Choose a PNG or SVG image.');
  const img = await load(file);
  const w0 = img.naturalWidth || 512;
  const h0 = img.naturalHeight || 512;
  // A drawing is drawn at the full size, being sharp at any; a PNG is only ever made smaller.
  const scale = svg ? MAX_SIDE / Math.max(w0, h0) : Math.min(1, MAX_SIDE / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { willReadFrequently: true }));
  ctx.drawImage(img, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h);
  const hasBackground = pixels.data[3] !== 0;
  if (svg && !hasBackground) return { blob: file, name: file.name, type: 'image/svg+xml' };
  if (hasBackground) clearBackground(pixels.data, w, h);
  const out = squared(pixels, w, h);
  const blob = await new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new PivotError('image.read', 'That image could not be read.'))), 'image/png'));
  return { blob, name: `${file.name.replace(/\.(png|svg)$/i, '')}.png`, type: 'image/png' };
}

/** @param {File} file @returns {Promise<HTMLImageElement>} */
function load(file) {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new PivotError('image.read', `${file.name} could not be read as an image.`)); };
    img.src = url;
  });
}

/**
 * Make the background see-through: every pixel joined to the top-left one, side by side, whose
 * colour is within TOLERANCE of it. A flood fill with a stack, not recursion, so a large
 * background cannot overflow it.
 * @param {Uint8ClampedArray} d RGBA, row by row @param {number} w @param {number} h
 */
export function clearBackground(d, w, h) {
  const [r, g, b, a] = [d[0], d[1], d[2], d[3]];
  const same = (/** @type {number} */ i) => Math.abs(d[i] - r) <= TOLERANCE && Math.abs(d[i + 1] - g) <= TOLERANCE
    && Math.abs(d[i + 2] - b) <= TOLERANCE && Math.abs(d[i + 3] - a) <= TOLERANCE;
  const seen = new Uint8Array(w * h);
  const stack = [0];
  seen[0] = 1;
  /** @param {number} p */
  const around = (p) => {
    const x = p % w;
    const y = (p - x) / w;
    return [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
  };
  while (stack.length) {
    const p = /** @type {number} */ (stack.pop());
    d[p * 4 + 3] = 0;
    for (const q of around(p)) {
      if (q < 0 || seen[q] || !same(q * 4)) continue;
      seen[q] = 1;
      stack.push(q);
    }
  }
  // The edge left behind: a smoothed edge blends picture into background, which would leave a pale
  // fringe on a dark page. A pixel beside the cleared background is measured against its neighbour
  // farthest from the background's colour (the picture it blends): partway between the two, it
  // becomes that much see-through, and the background is taken out of its colour. A shallow slope
  // blends over two or three pixels, so this works inwards a few pixels deep.
  const far = (/** @type {number} */ i) => Math.max(Math.abs(d[i] - r), Math.abs(d[i + 1] - g), Math.abs(d[i + 2] - b));
  let edge = seen;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = edge.slice();
    for (let p = 0; p < w * h; p += 1) {
      if (edge[p] || !around(p).some((q) => q >= 0 && edge[q])) continue;
      const i = p * 4;
      const inner = Math.max(0, ...around(p).filter((q) => q >= 0 && !edge[q]).map((q) => far(q * 4)));
      const own = far(i);
      if (own >= inner * 0.95) continue;
      const k = Math.max(own / inner, 1 / 255);
      d[i] = (d[i] - r * (1 - k)) / k;
      d[i + 1] = (d[i + 1] - g * (1 - k)) / k;
      d[i + 2] = (d[i + 2] - b * (1 - k)) / k;
      d[i + 3] = Math.round(d[i + 3] * k);
      next[p] = 1;
    }
    edge = next;
  }
}

/**
 * The picture trimmed to what is not see-through and centred on a square canvas.
 * @param {ImageData} pixels @param {number} w @param {number} h @returns {HTMLCanvasElement}
 */
function squared(pixels, w, h) {
  const d = pixels.data;
  let [x0, y0, x1, y1] = [w, h, -1, -1];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (d[(y * w + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) [x0, y0, x1, y1] = [0, 0, w - 1, h - 1];
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const side = Math.max(cw, ch);
  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  /** @type {CanvasRenderingContext2D} */ (src.getContext('2d')).putImageData(pixels, 0, 0);
  const out = document.createElement('canvas');
  out.width = side;
  out.height = side;
  /** @type {CanvasRenderingContext2D} */ (out.getContext('2d')).drawImage(src, x0, y0, cw, ch, Math.floor((side - cw) / 2), Math.floor((side - ch) / 2), cw, ch);
  return out;
}
