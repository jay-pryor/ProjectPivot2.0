import { FONT_NAMES } from './doc-fonts.js';

/** @typedef {{ size: [number, number], items: any[] }} Page */

/** A number as PDF writes it: at most three decimals, no trailing zeros. @param {number} n */
const num = (n) => String(Math.round(n * 1000) / 1000);
/** '#rrggbb' as three PDF colour components. @param {string} c */
function rgb(c) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c ?? ''));
  const v = m ? m[1] : '000000';
  return [0, 2, 4].map((i) => num(parseInt(v.slice(i, i + 2), 16) / 255)).join(' ');
}
/** A WinAnsi string as a PDF literal string: brackets and backslash escaped, other bytes outside ASCII as octal. @param {string} s */
function lit(s) {
  let out = '(';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x28 || c === 0x29 || c === 0x5C) out += '\\' + s[i];
    else if (c < 32 || c > 126) out += '\\' + (c & 0xFF).toString(8).padStart(3, '0');
    else out += s[i];
  }
  return out + ')';
}
/** Any text as a UTF-16BE hex string (titles and bookmarks may be any Unicode). @param {string} s */
function hex(s) {
  let out = '<FEFF';
  for (let i = 0; i < s.length; i++) out += s.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0');
  return out + '>';
}
/** Bytes as a string of the same length, one character a byte, for a stream. @param {Uint8Array} b */
function bin(b) {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return s;
}
/** An ISO date as a PDF date. @param {string} iso */
function pdfDate(iso) {
  const d = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(String(iso ?? ''));
  return d ? `(D:${d.slice(1).join('')})` : '(D:20000101000000)';
}

/**
 * Pages to a PDF file. Pages are in points from the top-left; PDF counts from the
 * bottom-left, so every y is flipped here. Text is WinAnsi in the standard fonts.
 * @param {Page[]} pages
 * @param {{ title?: string, anchors?: Record<string, { page: number, y: number }>,
 *   outline?: { title: string, anchor: string, level: number }[], producer?: string, date?: string, images?: Record<string, any> }} [opts]
 * @returns {Uint8Array}
 */
export function writePdf(pages, opts = {}) {
  const anchors = opts.anchors ?? {};
  /** @type {string[]} object bodies; object n is objs[n - 1] */
  const objs = [];
  const reserve = () => { objs.push(''); return objs.length; };
  const set = (/** @type {number} */ n, /** @type {string} */ body) => { objs[n - 1] = body; };
  const catalog = reserve();
  const pagesObj = reserve();
  const used = FONT_NAMES.filter((f) => pages.some((p) => p.items.some((it) => it.kind === 'text' && it.font === f)));
  const fontObj = Object.fromEntries(used.map((f) => {
    const n = reserve();
    set(n, `<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`);
    return [f, n];
  }));
  const fontRes = used.map((f) => `/F${FONT_NAMES.indexOf(f) + 1} ${fontObj[f]} 0 R`).join(' ');
  // Images: one XObject each (and its mask), however many times it is drawn.
  const imgs = opts.images ?? {};
  /** @type {string[]} */
  const used_ = [];
  for (const p of pages) for (const it of p.items) if (it.kind === 'image' && imgs[it.src] && !used_.includes(it.src)) used_.push(it.src);
  /** @type {Record<string, string>} */
  const imgName = {};
  const xobjRes = used_.map((src, i) => {
    const im = imgs[src].pdf, w = imgs[src].width, h = imgs[src].height;
    let smask = '';
    if (im.alpha) {
      const m = reserve();
      set(m, `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${im.alpha.length} >>\nstream\n${bin(im.alpha)}\nendstream`);
      smask = ` /SMask ${m} 0 R`;
    }
    const n = reserve();
    set(n, `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /${im.colourSpace} /BitsPerComponent 8 /Filter /${im.filter}${smask}` +
      `${im.decode ? ` /Decode ${im.decode}` : ''} /Length ${im.data.length} >>\nstream\n${bin(im.data)}\nendstream`);
    imgName[src] = `Im${i + 1}`;
    return `/Im${i + 1} ${n} 0 R`;
  }).join(' ');
  const pageObjs = pages.map(() => reserve());
  const dest = (/** @type {string} */ to) => {
    const a = anchors[to];
    if (!a || !pages[a.page]) return null;
    return `[${pageObjs[a.page]} 0 R /XYZ 0 ${num(pages[a.page].size[1] - a.y + 4)} null]`;
  };
  pages.forEach((p, i) => {
    const h = p.size[1];
    const ops = [];
    for (const it of p.items) {
      if (it.kind === 'fill') ops.push(`${rgb(it.colour)} rg ${num(it.x)} ${num(h - it.y - it.h)} ${num(it.w)} ${num(it.h)} re f`);
      else if (it.kind === 'rule') ops.push(`${rgb(it.colour)} RG ${num(it.width)} w ${num(it.x1)} ${num(h - it.y1)} m ${num(it.x2)} ${num(h - it.y2)} l S`);
      else if (it.kind === 'text') ops.push(`BT /F${FONT_NAMES.indexOf(it.font) + 1} ${num(it.size)} Tf ${rgb(it.colour)} rg ${num(it.x)} ${num(h - it.y)} Td ${lit(it.text)} Tj ET`);
      else if (it.kind === 'image' && imgName[it.src]) ops.push(`q ${num(it.w)} 0 0 ${num(it.h)} ${num(it.x)} ${num(h - it.y - it.h)} cm /${imgName[it.src]} Do Q`);
    }
    // Square line ends: a line runs half its width past each end, so the sides of a thick border meet in full corners.
    const content = ['2 J', ...ops].join('\n');
    const contentObj = reserve();
    set(contentObj, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const annots = p.items.filter((it) => it.kind === 'link').map((it) => {
      const d = dest(it.to);
      if (!d) return null;
      const n = reserve();
      set(n, `<< /Type /Annot /Subtype /Link /Rect [${num(it.x)} ${num(h - it.y - it.h)} ${num(it.x + it.w)} ${num(h - it.y)}] /Border [0 0 0] /Dest ${d} >>`);
      return `${n} 0 R`;
    }).filter(Boolean);
    set(pageObjs[i], `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${num(p.size[0])} ${num(h)}] /Resources << /Font << ${fontRes} >>${xobjRes ? ` /XObject << ${xobjRes} >>` : ''} >> /Contents ${contentObj} 0 R${annots.length ? ` /Annots [${annots.join(' ')}]` : ''} >>`);
  });
  set(pagesObj, `<< /Type /Pages /Kids [${pageObjs.map((n) => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>`);

  // Bookmarks: a tree from the flat heading list, nested by level.
  const marks = (opts.outline ?? []).filter((o) => dest(o.anchor));
  let outlinesObj = 0;
  if (marks.length) {
    outlinesObj = reserve();
    /** @type {{ n: number, mark: any, kids: any[], parent: any }[]} */
    const nodes = [];
    const root = { n: outlinesObj, mark: null, kids: /** @type {any[]} */ ([]), parent: null, level: 0 };
    let stack = [root];
    for (const m of marks) {
      const level = Math.max(1, m.level);
      while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
      const parent = stack[stack.length - 1];
      const node = { n: reserve(), mark: m, kids: [], parent, level };
      parent.kids.push(node);
      nodes.push(node);
      stack.push(node);
    }
    const count = (/** @type {any} */ node) => node.kids.reduce((s, k) => s + 1 + count(k), 0);
    for (const node of nodes) {
      const sib = node.parent.kids;
      const i = sib.indexOf(node);
      const parts = [`/Title ${hex(node.mark.title)}`, `/Parent ${node.parent.n} 0 R`, `/Dest ${dest(node.mark.anchor)}`];
      if (i > 0) parts.push(`/Prev ${sib[i - 1].n} 0 R`);
      if (i < sib.length - 1) parts.push(`/Next ${sib[i + 1].n} 0 R`);
      if (node.kids.length) parts.push(`/First ${node.kids[0].n} 0 R`, `/Last ${node.kids[node.kids.length - 1].n} 0 R`, `/Count ${count(node)}`);
      set(node.n, `<< ${parts.join(' ')} >>`);
    }
    set(outlinesObj, `<< /Type /Outlines /First ${root.kids[0].n} 0 R /Last ${root.kids[root.kids.length - 1].n} 0 R /Count ${count(root)} >>`);
  }
  set(catalog, `<< /Type /Catalog /Pages ${pagesObj} 0 R${outlinesObj ? ` /Outlines ${outlinesObj} 0 R /PageMode /UseOutlines` : ''} >>`);
  const info = reserve();
  set(info, `<< /Title ${hex(opts.title ?? '')} /Producer ${hex(opts.producer ?? 'PIVOT')} /CreationDate ${pdfDate(opts.date ?? '')} >>`);

  let out = '%PDF-1.4\n%' + String.fromCharCode(0xE2, 0xE3, 0xCF, 0xD3) + '\n';
  const offsets = objs.map((body, i) => { const at = out.length; out += `${i + 1} 0 obj\n${body}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xFF;
  return bytes;
}
