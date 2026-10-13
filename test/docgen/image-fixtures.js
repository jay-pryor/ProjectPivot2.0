/**
 * Small PNG and JPEG files for the tests, made here so no binary files are checked in.
 * makePng writes real PNGs (any colour type, bit depth, filter, Adam7 interlace);
 * makeJpeg writes only the markers a JPEG reader looks at (SOI, APP0, SOF0, EOI).
 */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (/** @type {Uint8Array} */ b) => { let c = 0xFFFFFFFF; for (const x of b) c = CRC[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
function chunk(type, data) {
  const body = new Uint8Array([...ascii(type), ...data]);
  return [...u32(data.length), ...body, ...u32(crc32(body))];
}
async function deflate(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];
const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };

/**
 * @param {{ width: number, height: number, colourType?: 0|2|3|4|6, bitDepth?: 1|2|4|8|16, filter?: 0|1|2|3|4,
 *   interlace?: boolean, sample: (x: number, y: number) => number[], palette?: number[][], trns?: number[] }} o
 *   `sample` gives the raw samples of one pixel at the bit depth (a palette index for type 3).
 */
export async function makePng(o) {
  const ct = o.colourType ?? 2, bd = o.bitDepth ?? 8, filter = o.filter ?? 0;
  const ch = CHANNELS[ct], bitsPx = ch * bd, bpp = Math.max(1, Math.ceil(bitsPx / 8));
  /** One image (or interlace pass) of w×h pixels taken from (x0 + i*dx, y0 + j*dy). */
  const raw = (w, h, at) => {
    const stride = Math.ceil((w * bitsPx) / 8);
    const out = [];
    let prev = new Uint8Array(stride);
    for (let j = 0; j < h; j++) {
      const row = new Uint8Array(stride);
      let bit = 0;
      for (let i = 0; i < w; i++) {
        for (const v of o.sample(...at(i, j))) {
          if (bd === 16) { row[bit >> 3] = v >> 8; row[(bit >> 3) + 1] = v & 255; }
          else if (bd === 8) row[bit >> 3] = v;
          else row[bit >> 3] |= v << (8 - bd - (bit & 7));
          bit += bd;
        }
      }
      const f = new Uint8Array(stride);
      for (let k = 0; k < stride; k++) {
        const a = k >= bpp ? row[k - bpp] : 0, b = prev[k], c = k >= bpp ? prev[k - bpp] : 0;
        f[k] = (row[k] - [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter]) & 255;
      }
      out.push(filter, ...f);
      prev = row;
    }
    return out;
  };
  let data = [];
  if (o.interlace) {
    for (const [x0, y0, dx, dy] of ADAM7) {
      const w = Math.ceil((o.width - x0) / dx), h = Math.ceil((o.height - y0) / dy);
      if (w > 0 && h > 0) data.push(...raw(w, h, (i, j) => [x0 + i * dx, y0 + j * dy]));
    }
  } else data = raw(o.width, o.height, (i, j) => [i, j]);
  const ihdr = [...u32(o.width), ...u32(o.height), bd, ct, 0, 0, o.interlace ? 1 : 0];
  return new Uint8Array([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    ...chunk('IHDR', ihdr),
    ...(o.palette ? chunk('PLTE', o.palette.flat()) : []),
    ...(o.trns ? chunk('tRNS', o.trns) : []),
    ...chunk('IDAT', [...await deflate(new Uint8Array(data))]),
    ...chunk('IEND', []),
  ]);
}

/** The markers of a baseline JPEG: enough for a reader of sizes, not a picture. */
export function makeJpeg(width, height, components = 3) {
  const sof = [0xFF, 0xC0, 0, 8 + 3 * components, 8, height >> 8, height & 255, width >> 8, width & 255, components];
  for (let c = 1; c <= components; c++) sof.push(c, 0x11, 0);
  return new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 16, ...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, ...sof, 0xFF, 0xD9]);
}
