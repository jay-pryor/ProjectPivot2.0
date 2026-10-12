/**
 * PDF-1: laid-out pages drawn on screen — the designer's live preview. Each page is a box
 * of absolutely placed text, fills and rules, from the same pages the PDF writer draws, so
 * what the preview shows is where things land in the PDF.
 */

/** Screen faces for the standard fonts. Single-quoted: these go inside a style="" attribute. */
const FAMILY_CSS = { Helvetica: 'Helvetica, Arial, sans-serif', Times: "'Times New Roman', Times, serif", Courier: "'Courier New', Courier, monospace" };
const esc = (/** @type {any} */ s) => String(s ?? '').replace(/[&<>"']/g, (c) => /** @type {any} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** WinAnsi codes 0x80..0x9F back to Unicode, for the screen. */
const HIGH = /** @type {Record<number, string>} */ ({ 128: '€', 130: '‚', 131: 'ƒ', 132: '„', 133: '…', 134: '†', 135: '‡', 136: 'ˆ', 137: '‰', 138: 'Š', 139: '‹',
  140: 'Œ', 142: 'Ž', 145: '‘', 146: '’', 147: '“', 148: '”', 149: '•', 150: '–', 151: '—', 152: '˜', 153: '™', 154: 'š', 155: '›', 156: 'œ', 158: 'ž', 159: 'Ÿ' });
const uni = (/** @type {string} */ t) => [...t].map((c) => HIGH[c.charCodeAt(0)] ?? c).join('');
/** A length in pixels, without float noise. @param {number} n */
const px = (n) => `${Math.round(n * 1000) / 1000}px`;

/**
 * Pages as HTML. Points become pixels at `scale` (1 = one pixel per point).
 * `anchors` (from the layout) become empty spans with those ids, where each lands, so a
 * contents entry or a reference can jump to it.
 * @param {{ size: [number, number], items: any[] }[]} pages
 * @param {{ scale?: number, anchors?: Record<string, { page: number, y: number }> }} [o]
 */
export function pagesHtml(pages, o = {}) {
  const k = o.scale ?? 1;
  const anchors = Object.entries(o.anchors ?? {});
  return pages.map((p, i) => `<div class="dp-page" data-page="${i + 1}" style="width:${px(p.size[0] * k)};height:${px(p.size[1] * k)}">` +
    anchors.filter(([, a]) => a.page === i).map(([id, a]) => `<span class="dp-anchor" id="${esc(id)}" style="top:${px(a.y * k)}"></span>`).join('') + p.items.map((it) => {
    if (it.kind === 'fill') return `<div class="dp-fill" style="left:${px(it.x * k)};top:${px(it.y * k)};width:${px(it.w * k)};height:${px(it.h * k)};background:${esc(it.colour)}"></div>`;
    if (it.kind === 'rule') {
      const flat = it.y1 === it.y2;
      const w = it.width * k;
      return `<div class="dp-rule" style="left:${px(Math.min(it.x1, it.x2) * k - (flat ? 0 : w / 2))};top:${px(Math.min(it.y1, it.y2) * k - (flat ? w / 2 : 0))};` +
        `width:${px(flat ? Math.abs(it.x2 - it.x1) * k : w)};height:${px(flat ? w : Math.abs(it.y2 - it.y1) * k)};background:${esc(it.colour)}"></div>`;
    }
    if (it.kind === 'text') {
      const [fam, face = ''] = String(it.font).split('-');
      return `<span class="dp-text" style="left:${px(it.x * k)};top:${px((it.y - it.size * 0.78) * k)};font-size:${px(it.size * k)};line-height:1;color:${esc(it.colour)};` +
        `font-family:${FAMILY_CSS[/** @type {'Times'} */ (fam)] ?? FAMILY_CSS.Helvetica};font-weight:${/Bold/.test(face) ? 700 : 400};font-style:${/Oblique|Italic/.test(face) ? 'italic' : 'normal'}">${esc(uni(it.text))}</span>`;
    }
    if (it.kind === 'link') return `<a class="dp-link" data-prv-jump="${esc(it.to)}" style="left:${px(it.x * k)};top:${px(it.y * k)};width:${px(it.w * k)};height:${px(it.h * k)}"></a>`;
    return '';
  }).join('') + '</div>').join('');
}

/**
 * A band of a page, from `top` to `bottom` (points), as a page of its own: what lies in the
 * band, moved up so the band starts at 0. Text is kept by its baseline; fills and rules are
 * cut to the band; links are dropped.
 * @param {{ size: [number, number], items: any[] }} page @param {number} top @param {number} bottom
 */
export function cropPage(page, top, bottom) {
  /** @type {any[]} */
  const items = [];
  for (const it of page.items) {
    if (it.kind === 'text') { if (it.y > top && it.y <= bottom + 0.01) items.push({ ...it, y: it.y - top }); continue; }
    if (it.kind === 'fill') {
      const y0 = Math.max(top, it.y), y1 = Math.min(bottom, it.y + it.h);
      if (y1 > y0) items.push({ ...it, y: y0 - top, h: y1 - y0 });
      continue;
    }
    if (it.kind === 'rule') {
      const lo = Math.min(it.y1, it.y2), hi = Math.max(it.y1, it.y2);
      if (hi < top || lo > bottom) continue;
      if (it.y1 === it.y2) items.push({ ...it, y1: it.y1 - top, y2: it.y2 - top });
      else items.push({ ...it, y1: Math.max(lo, top) - top, y2: Math.min(hi, bottom) - top });
    }
  }
  return { size: [page.size[0], bottom - top], items };
}
