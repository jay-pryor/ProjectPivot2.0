/**
 * A minimal PDF reader for tests: checks the cross-reference table and pulls out what the
 * writer put in — objects, pages in order, each page's text, link targets, bookmarks.
 * Only the subset PIVOT writes (uncompressed, one xref section).
 * @param {Uint8Array} bytes
 */
export function readPdf(bytes) {
  const s = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  if (!s.startsWith('%PDF-1.')) throw new Error('no PDF header');
  const sx = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(s);
  if (!sx) throw new Error('no startxref');
  const xrefAt = Number(sx[1]);
  if (!s.startsWith('xref', xrefAt)) throw new Error(`startxref ${xrefAt} does not point at xref`);
  const head = /^xref\s+0 (\d+)\s+/.exec(s.slice(xrefAt));
  if (!head) throw new Error('bad xref header');
  const count = Number(head[1]);
  const entries = s.slice(xrefAt + head[0].length).split('\n').slice(0, count);
  /** @type {Record<number, string>} */
  const objects = {};
  entries.forEach((e, n) => {
    if (n === 0) return;
    const off = Number(e.slice(0, 10));
    const m = new RegExp(`^${n} 0 obj\\s*([\\s\\S]*?)\\s*endobj`).exec(s.slice(off));
    if (!m) throw new Error(`object ${n} is not at offset ${off}`);
    objects[n] = m[1];
  });
  const trailer = /trailer\s*<<([\s\S]*?)>>\s*startxref/.exec(s)?.[1] ?? '';
  const ref = (/** @type {string} */ dict, /** @type {string} */ key) => Number(new RegExp(`/${key} (\\d+) 0 R`).exec(dict)?.[1]);
  const root = objects[ref(trailer, 'Root')];
  const kids = [.../\/Kids \[([^\]]*)\]/.exec(objects[ref(root, 'Pages')])?.[1].matchAll(/(\d+) 0 R/g) ?? []].map((m) => Number(m[1]));
  const unescape = (/** @type {string} */ t) => t.replace(/\\([0-7]{3}|.)/g, (_, c) => (c.length === 3 ? String.fromCharCode(parseInt(c, 8)) : c));
  const pages = kids.map((k) => {
    const obj = objects[k];
    const stream = /stream\n([\s\S]*?)\nendstream/.exec(objects[ref(obj, 'Contents')])?.[1] ?? '';
    const text = [...stream.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) => unescape(m[1]));
    const annots = [.../\/Annots \[([^\]]*)\]/.exec(obj)?.[1].matchAll(/(\d+) 0 R/g) ?? []].map((m) => objects[Number(m[1])]);
    const links = annots.map((a) => kids.indexOf(Number(/\/Dest \[(\d+) 0 R/.exec(a)?.[1])));
    const fonts = [...obj.matchAll(/\/(F\d+) (\d+) 0 R/g)].map((m) => /\/BaseFont \/([\w-]+)/.exec(objects[Number(m[2])])?.[1]);
    return { obj, stream, text, links, fonts, mediaBox: /\/MediaBox \[([^\]]*)\]/.exec(obj)?.[1].trim().split(/\s+/).map(Number) };
  });
  const hex = (/** @type {string} */ h) => { let out = ''; for (let i = 4; i < h.length; i += 4) out += String.fromCharCode(parseInt(h.slice(i, i + 4), 16)); return out; };
  const outlines = Object.values(objects).filter((o) => /\/Title </.test(o) && /\/Parent /.test(o))
    .map((o) => ({ title: hex(/\/Title <([0-9A-F]+)>/.exec(o)?.[1] ?? ''), page: kids.indexOf(Number(/\/Dest \[(\d+) 0 R/.exec(o)?.[1])) }));
  const info = objects[ref(trailer, 'Info')] ?? '';
  return { objects, pages, outlines, title: hex(/\/Title <([0-9A-F]+)>/.exec(info)?.[1] ?? '') };
}
