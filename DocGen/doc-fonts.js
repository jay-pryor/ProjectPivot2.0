import { WIDTHS } from './doc-fonts-data.js';

/** The font families a Style can choose: the PDF standard fonts, so nothing is embedded. */
export const FAMILIES = Object.freeze(['helvetica', 'times', 'courier']);

const NAMES = {
  helvetica: ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'],
  times: ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'],
  courier: ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'],
};
/** All twelve, in a fixed order. */
export const FONT_NAMES = Object.freeze([...NAMES.helvetica, ...NAMES.times, ...NAMES.courier]);

/** The PDF base font for a family, weight and slope. @param {string} family @param {boolean} bold @param {boolean} italic */
export function fontName(family, bold, italic) {
  const f = NAMES[/** @type {keyof typeof NAMES} */ (family)] ?? NAMES.helvetica;
  return f[(bold ? 1 : 0) + (italic ? 2 : 0)];
}

/** Unicode characters WinAnsi places in 0x80..0x9F. */
const HIGH = new Map([[0x20AC, 128], [0x201A, 130], [0x0192, 131], [0x201E, 132], [0x2026, 133], [0x2020, 134], [0x2021, 135],
  [0x02C6, 136], [0x2030, 137], [0x0160, 138], [0x2039, 139], [0x0152, 140], [0x017D, 142], [0x2018, 145], [0x2019, 146],
  [0x201C, 147], [0x201D, 148], [0x2022, 149], [0x2013, 150], [0x2014, 151], [0x02DC, 152], [0x2122, 153], [0x0161, 154],
  [0x203A, 155], [0x0153, 156], [0x017E, 158], [0x0178, 159]]);

/** What a character the fonts cannot show is written as instead. */
const SUBS = new Map([['≥', '>='], ['≤', '<='], ['≠', '!='], ['✓', 'Yes'], ['✔', 'Yes'], ['✗', 'No'], ['✘', 'No'], ['→', '->'], ['←', '<-']]);

/**
 * Text as WinAnsi: each character of the result is one byte, its code the WinAnsi code.
 * A tab is a space; anything else the fonts cannot show is substituted (or `?`), and
 * listed in `replaced`, once each, in the order first met.
 * @param {string} text
 */
export function toWinAnsi(text) {
  let out = '';
  /** @type {string[]} */
  const replaced = [];
  for (const ch of String(text ?? '')) {
    const cp = /** @type {number} */ (ch.codePointAt(0));
    if (ch === '\t') { out += ' '; continue; }
    if ((cp >= 0x20 && cp <= 0x7E) || (cp >= 0xA0 && cp <= 0xFF)) { out += ch; continue; }
    const hi = HIGH.get(cp);
    if (hi !== undefined) { out += String.fromCharCode(hi); continue; }
    if (cp < 0x20) continue; // control characters print nothing
    if (!replaced.includes(ch)) replaced.push(ch);
    out += SUBS.get(ch) ?? '?';
  }
  return { text: out, replaced };
}

/**
 * The width of WinAnsi text in a font at a size, in points.
 * @param {string} font a FONT_NAMES entry @param {number} size points @param {string} winText from toWinAnsi
 */
export function textWidth(font, size, winText) {
  const w = WIDTHS[/** @type {keyof typeof WIDTHS} */ (font)] ?? WIDTHS.Helvetica;
  let units = 0;
  for (let i = 0; i < winText.length; i++) {
    const c = winText.charCodeAt(i);
    units += c >= 32 && c <= 255 ? w[c - 32] : 0;
  }
  return Math.round(units * size) / 1000;
}
