import { esc } from './html.js';
import { hazardLabel, controlLabel } from '../core/ids.js';

/** @typedef {import('../core/bowtie.js').Bowtie} Bowtie */
/** @typedef {import('../core/bowtie.js').Item} Item */
/** @typedef {import('../core/bowtie.js').Tag} Tag */
/**
 * @typedef {{ kind: string, id: string | null, title: string, lines: string[], tags: Tag[], style: 'plain' | 'hazard' | 'existing' | 'additional',
 *   item: Item | null, x: number, y: number, width: number, height: number }} Box
 */

// The grid, in user units. A box is sized from an estimate of its text's width, never measured,
// so the same data always draws the same picture.
const CHARS_PER_LINE = 28;
const LINE_HEIGHT = 16;
const PAD = 8;
const COLUMN_GAP = 48;
const ROW_GAP = 16;
const MARGIN = 24;
const CAPTION_HEIGHT = 32;
const FONT_SIZE = 12;
const FONT = 'Atkinson Hyperlegible, Segoe UI, system-ui, sans-serif';
const LANE_HEAD = 30;
const HEAD_SIZE = 11;
// A control's tags sit in a row of badges under its name.
const TAG_SIZE = 10.5;
const TAG_HEIGHT = 16;
const TAG_PAD = 6;
const TAG_GAP = 4;
const TAG_ROW = TAG_HEIGHT + 6;
// Each colour is a variable the page sets to follow its theme; on its own (an exported file) the
// light fallback is used, so an export reads and prints the same in any viewer.
const LIGHT = Object.freeze({
  paper: '#ffffff', box: '#ffffff', lane: '#f3f5f8', 'hazard-lane': '#fff4e6', rule: '#d5d9e0',
  ink: '#1b1f24', muted: '#5d6673', edge: '#8a93a0', accent: '#fa9a26',
});
/** @param {keyof typeof LIGHT} name */
const c = (name) => `var(--bt-${name}, ${LIGHT[name]})`;
/** Each tag's badge, [background, text], light; the page sets --bt-tag-<tone>-bg and -fg for its theme. */
const TAG_LIGHT = Object.freeze({
  existing: ['#dff1f4', '#0d5c6b'], additional: ['#f1eafa', '#6b3fa0'], tier: ['#eceff3', '#3c4450'],
  recommended: ['#e3eefc', '#1f5aa8'], planned: ['#fff1d6', '#8a5300'], implemented: ['#e2f4e6', '#1e6b34'], rejected: ['#eceef1', '#5d6673'],
});
/** @param {Tag['tone']} tone @param {0 | 1} part */
const tagColour = (tone, part) => `var(--bt-tag-${tone}-${part ? 'fg' : 'bg'}, ${TAG_LIGHT[tone][part]})`;
/** A badge's width: its text, estimated as the boxes' text is, between its padding. @param {Tag} t */
const tagWidth = (t) => Math.ceil(textWidth(t.text, true) * (TAG_SIZE / FONT_SIZE)) + 2 * TAG_PAD;
/** @param {Tag[]} tags */
const tagsWidth = (tags) => tags.reduce((w, t) => w + tagWidth(t), 0) + Math.max(0, tags.length - 1) * TAG_GAP;

const COLUMNS = ['causal-factor', 'preventative-control', 'hazard', 'mitigating-control', 'consequence'];
const HEADINGS = ['Causal factors', 'Preventative controls', 'Hazard', 'Mitigating controls', 'Consequences'];

/**
 * The text's words, broken only at whitespace into lines of at most CHARS_PER_LINE characters
 * where a word allows; a longer word is a line of its own, never split.
 * @param {string} text @returns {string[]}
 */
export function wrap(text) {
  const words = String(text).trim().split(/\s+/).filter((w) => w !== '');
  /** @type {string[]} */
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line === '') line = word;
    else if (line.length + 1 + word.length <= CHARS_PER_LINE) line = `${line} ${word}`;
    else { lines.push(line); line = word; }
  }
  if (line !== '') lines.push(line);
  return lines;
}

/**
 * A line's width at FONT_SIZE, estimated generously by kind of character so capitals and wide
 * letters stay inside their box in any of the fallback fonts; bold is a tenth wider.
 * @param {string} line @param {boolean} bold
 */
function textWidth(line, bold) {
  let w = 0;
  for (const ch of line) {
    if (/[WM@%&]/.test(ch)) w += 12;
    else if (/[A-Z]/.test(ch)) w += 8.5;
    else if (/[ijlft.,:;'|!() ]/.test(ch)) w += 3.5;
    else if (/[mw]/.test(ch)) w += 10;
    else w += 7;
  }
  return bold ? w * 1.1 : w;
}

/** @param {string} kind @param {string | null} id @param {string} title @param {string[]} lines @param {Box['style']} style @param {Item | null} [item] @param {Tag[]} [tags] @returns {Box} */
function box(kind, id, title, lines, style, item = null, tags = []) {
  return { kind, id, title, lines, tags, style, item, x: 0, y: 0, width: 0, height: lines.length * LINE_HEIGHT + (tags.length ? TAG_ROW : 0) + 2 * PAD };
}

/** @param {Item} i @param {string} kind */
function controlBox(i, kind) {
  const name = `${controlLabel(i.control)} ${i.control.title}`;
  const title = i.tags.length ? `${name} (${i.tags.map((t) => t.text).join(', ')})` : name;
  return box(kind, i.control.id, title, wrap(name), i.source, i, i.tags);
}

/** The box's tags as a row of badges under its text. @param {Box} b */
function badges(b) {
  let x = b.x + PAD;
  const y = b.y + PAD + b.lines.length * LINE_HEIGHT + 6;
  return b.tags.map((t) => {
    const w = tagWidth(t);
    const out = `<g data-bowtie-tag="${t.tone}"><rect x="${x}" y="${y}" width="${w}" height="${TAG_HEIGHT}" rx="3" style="fill:${tagColour(t.tone, 0)}"/>`
      + `<text x="${x + w / 2}" y="${y + TAG_HEIGHT / 2 + TAG_SIZE * 0.36}" text-anchor="middle" font-family="${FONT}" font-size="${TAG_SIZE}" font-weight="700" style="fill:${tagColour(t.tone, 1)}">${esc(t.text)}</text></g>`;
    x += w + TAG_GAP;
    return out;
  }).join('');
}

/** @param {Box} b @returns {string} */
function drawBox(b) {
  const i = b.item;
  const attrs = i ? ` data-source="${i.source}"${i.state ? ` data-state="${esc(i.state)}"` : ''}` : '';
  const stroke = b.style === 'hazard' ? `stroke:${c('accent')}" stroke-width="3` : `stroke:${c('ink')}" stroke-width="1.5`;
  const dash = b.style === 'additional' ? ' stroke-dasharray="6 4"' : '';
  const ink = i?.state === 'rejected' ? c('muted') : c('ink');
  const weight = b.style === 'hazard' ? ' font-weight="700"' : '';
  return `<g data-bowtie-node="${b.kind}" data-record-id="${esc(b.id)}"${attrs}><title>${esc(b.title)}</title>`
    + `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" style="fill:${c('box')};${stroke}"${dash}/>`
    + `<text font-family="${FONT}" font-size="${FONT_SIZE}" style="fill:${ink}"${weight}>${tspans(b)}</text>${badges(b)}</g>`;
}

/** @param {Box} b */
function tspans(b) {
  return b.lines.map((l, n) => `<tspan x="${b.x + PAD}" y="${b.y + PAD + (n + 1) * LINE_HEIGHT - 4}">${esc(l)}</tspan>`).join('');
}

/**
 * The bow-tie as one self-contained SVG document: the same string is shown and exported.
 * @param {Bowtie} w @returns {string}
 */
export function bowtieSvg(w) {
  const hazard = box('hazard', w.hazard.id, String(w.hazard.title), [hazardLabel(w.hazard), ...wrap(w.hazard.title)], 'hazard');
  /** @type {Box[][]} */
  const columns = [
    w.causalFactors.map((f) => box('causal-factor', f.id, String(f.text), wrap(f.text), 'plain')),
    w.preventative.map((i) => controlBox(i, 'preventative-control')),
    [hazard],
    w.mitigating.map((i) => controlBox(i, 'mitigating-control')),
    w.consequences.map((q) => box('consequence', q.id, String(q.text), wrap(q.text), 'plain')),
  ];
  // An empty lane stays, headed but blank: what is missing is plain without saying so.
  const heights = columns.map((col) => (col.length ? col.reduce((sum, b) => sum + b.height, 0) + (col.length - 1) * ROW_GAP : 0));
  const contentHeight = Math.max(...heights);
  const lanesTop = MARGIN + CAPTION_HEIGHT;
  const top = lanesTop + LANE_HEAD;
  /** @type {{ x: number, width: number }[]} */
  const lanes = [];
  let x = MARGIN + COLUMN_GAP / 2;
  columns.forEach((col, n) => {
    // A column is at least as wide as its lane's heading, less the lane's own margins.
    const heading = textWidth(HEADINGS[n].toUpperCase(), true) * (HEAD_SIZE / FONT_SIZE) + 8 - COLUMN_GAP;
    const width = Math.ceil(Math.max(7, heading - 2 * PAD, ...col.flatMap((b) => [...b.lines.map((l) => textWidth(l, b.style === 'hazard')), tagsWidth(b.tags)]))) + 2 * PAD;
    lanes.push({ x: x - COLUMN_GAP / 2, width: width + COLUMN_GAP });
    let y = top + Math.floor((contentHeight - heights[n]) / 2);
    for (const b of col) {
      b.x = x;
      b.y = y;
      b.width = width;
      y += b.height + ROW_GAP;
    }
    x += width + COLUMN_GAP;
  });
  const width = x - COLUMN_GAP / 2 + MARGIN;
  const height = top + contentHeight + MARGIN;
  const laneHeight = height - MARGIN / 2 - lanesTop;
  // Vertical swimlanes, alternately shaded, the hazard's tinted; each headed with what it holds.
  const laneFill = (/** @type {number} */ n) => (n === 2 ? c('hazard-lane') : n % 2 ? c('lane') : c('paper'));
  const laneMarks = lanes.map((l, n) => `<g data-bowtie-lane="${COLUMNS[n]}"><rect x="${l.x}" y="${lanesTop}" width="${l.width}" height="${laneHeight}" style="fill:${laneFill(n)};stroke:${c('rule')}" stroke-width="1"/>`
    + `<text x="${l.x + l.width / 2}" y="${lanesTop + 19}" text-anchor="middle" font-family="${FONT}" font-size="${HEAD_SIZE}" font-weight="700" letter-spacing="0.6" style="fill:${c('muted')}">${esc(HEADINGS[n])}</text></g>`);

  // One line from each causal factor into the hazard, one from the hazard to each consequence;
  // controls sit on those lines as barriers.
  const midY = hazard.y + Math.floor(hazard.height / 2);
  const edges = [
    ...columns[0].map((b) => `<line data-bowtie-edge="${esc(b.id)}" x1="${b.x + b.width}" y1="${b.y + Math.floor(b.height / 2)}" x2="${hazard.x}" y2="${midY}" style="stroke:${c('edge')}" stroke-width="1.5"/>`),
    ...columns[4].map((b) => `<line data-bowtie-edge="${esc(b.id)}" x1="${hazard.x + hazard.width}" y1="${midY}" x2="${b.x}" y2="${b.y + Math.floor(b.height / 2)}" style="stroke:${c('edge')}" stroke-width="1.5"/>`),
  ];
  const caption = `<text data-bowtie-caption="true" x="${MARGIN}" y="${MARGIN + FONT_SIZE + 2}" font-family="${FONT}" font-size="${FONT_SIZE + 2}" font-weight="700" style="fill:${c('ink')}">${esc(w.caption)}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(`Bow-tie: ${w.hazard.title}, ${w.caption}`)}">`
    + `<rect width="${width}" height="${height}" style="fill:${c('paper')}"/>`
    + caption
    + laneMarks.join('')
    + edges.join('')
    + columns.flat().map(drawBox).join('')
    + '</svg>';
}
