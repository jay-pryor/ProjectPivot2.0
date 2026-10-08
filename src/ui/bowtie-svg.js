import { esc } from './html.js';
import { hazardLabel, controlLabel } from '../core/ids.js';

/** @typedef {import('../core/bowtie.js').Bowtie} Bowtie */
/** @typedef {import('../core/bowtie.js').Item} Item */
/** @typedef {import('../core/bowtie.js').Tag} Tag */
/** @typedef {import('../core/data.js').Rec} Rec */
/**
 * @typedef {{ kind: string, id: string | null, title: string, lines: string[], tags: Tag[], style: 'plain' | 'hazard' | 'implemented' | 'proposed',
 *   item: Item | null, x: number, y: number, width: number, height: number, unguarded?: boolean, row?: string, num?: number, label?: string }} Box  unguarded: a causal factor or consequence no control is linked to; row: the traditional view's row it is drawn on; num: a causal factor's or consequence's number, as on the hazard's platform tab;
 *   label: a control's number, e.g. C-001, which starts its first line in the accent colour
 */

// The grid, in user units. A box is sized from an estimate of its text's width, never measured,
// so the same data always draws the same picture.
const CHARS_PER_LINE = 28;
const LINE_HEIGHT = 16;
const PAD = 8;
// Wide enough between the columns that the lines running across them, and a control's links, read apart.
const COLUMN_GAP = 128;
const ROW_GAP = 28;
const MARGIN = 24;
const CAPTION_HEIGHT = 32;
const FONT_SIZE = 12;
const FONT = 'Atkinson Hyperlegible, Segoe UI, system-ui, sans-serif';
const LANE_HEAD = 30;
// Clear space inside a lane above its first card (below the heading) and below its last.
const LANE_PAD_Y = 40;
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
  ink: '#1b1f24', muted: '#5d6673', edge: '#8a93a0', accent: '#fa9a26', unguarded: '#c27a00',
});
/** @param {keyof typeof LIGHT} name */
const c = (name) => `var(--bt-${name}, ${LIGHT[name]})`;
/** Each tag's badge, [background, text], light; the page sets --bt-tag-<tone>-bg and -fg for its theme. */
const TAG_LIGHT = Object.freeze({
  tier: ['#eceff3', '#3c4450'],
  recommended: ['#e3eefc', '#1f5aa8'], planned: ['#fff1d6', '#8a5300'], implemented: ['#e2f4e6', '#1e6b34'], rejected: ['#eceef1', '#5d6673'],
});
/** @param {Tag['tone']} tone @param {0 | 1} part */
const tagColour = (tone, part) => `var(--bt-tag-${tone}-${part ? 'fg' : 'bg'}, ${TAG_LIGHT[tone][part]})`;
/** A badge's width: its text, estimated as the boxes' text is, between its padding. @param {Tag} t */
const tagWidth = (t) => Math.ceil(textWidth(t.text, true) * (TAG_SIZE / FONT_SIZE)) + 2 * TAG_PAD;
/** @param {Tag[]} tags */
const tagsWidth = (tags) => tags.reduce((w, t) => w + tagWidth(t), 0) + Math.max(0, tags.length - 1) * TAG_GAP;

// The traditional view: the room between boxes along a row, above and below them in it, at each
// row's outer end, and between the rows' controls and the hazard, where their lines gather.
const SEQ_GAP = 40;
const ROW_PAD = 22;
const SIDE_PAD = 28;
const FAN = 96;
const HAZARD_PAD = 36;

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
function controlBox(i, kind, showTags = true) {
  const name = `${controlLabel(i.control)} ${i.control.title}`;
  const title = i.tags.length ? `${name} (${i.tags.map((t) => t.text).join(', ')})` : name;
  // With tags hidden the box is only its name (its tags still in its title, for pointing at it).
  // Implemented on the platform: drawn solid; recommended, planned or rejected: dashed.
  const b = box(kind, i.control.id, title, wrap(name), i.state === 'implemented' ? 'implemented' : 'proposed', i, showTags ? i.tags : []);
  b.label = controlLabel(i.control);
  return b;
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
  const attrs = i ? ` data-state="${esc(i.state)}"` : '';
  const loose = b.kind === 'unlinked';
  const stroke = loose ? `stroke:${c('muted')}" stroke-width="1` : b.style === 'hazard' ? `stroke:${c('accent')}" stroke-width="3` : b.unguarded ? `stroke:${c('unguarded')}" stroke-width="1.5` : `stroke:${c('ink')}" stroke-width="1.5`;
  const dash = loose ? ' stroke-dasharray="2 3"' : b.style === 'proposed' ? ' stroke-dasharray="6 4"' : b.unguarded ? ' stroke-dasharray="3 3"' : '';
  // No control stands against it: a dashed amber border and a small ! at its corner.
  const mark = b.unguarded
    ? `<g data-bowtie-unguarded="true"><circle cx="${b.x + b.width}" cy="${b.y}" r="7" style="fill:${c('unguarded')}"/><text x="${b.x + b.width}" y="${b.y + 4}" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="700" style="fill:${c('paper')}">!</text></g>`
    : '';
  const ink = loose || i?.state === 'rejected' ? c('muted') : c('ink');
  const weight = b.style === 'hazard' ? ' font-weight="700"' : '';
  const row = b.row ? ` data-bowtie-row="${esc(b.row)}"` : '';
  // Its number, in the accent colour, ahead of its first line, as the platform tab lists it.
  const num = b.num ? `<text data-bowtie-num="${b.num}" x="${b.x + PAD}" y="${b.y + PAD + LINE_HEIGHT - 4}" font-family="${FONT}" font-size="${FONT_SIZE}" font-weight="700" style="fill:${c('accent')}">${b.num}</text>` : '';
  return `<g data-bowtie-node="${b.kind}" data-record-id="${esc(b.id)}"${attrs}${row} role="img" aria-label="${esc(b.title)}">`
    + `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" style="fill:${c('box')};${stroke}"${dash}/>${num}`
    + `<text font-family="${FONT}" font-size="${FONT_SIZE}" style="fill:${ink}"${weight}>${tspans(b)}</text>${badges(b)}${mark}</g>`;
}

/** @param {Box} b */
function tspans(b) {
  return b.lines.map((l, n) => {
    // A control's number, starting its first line, in bold and the accent colour (muted when rejected).
    const lead = n === 0 && b.label && l.startsWith(b.label) ? b.label : '';
    const text = lead
      ? `<tspan data-bowtie-label="${esc(lead)}" font-weight="700" style="fill:${b.item?.state === 'rejected' ? c('muted') : c('accent')}">${esc(lead)}</tspan>${esc(l.slice(lead.length))}`
      : esc(l);
    return `<tspan x="${b.x + PAD + numWidth(b)}" y="${b.y + PAD + (n + 1) * LINE_HEIGHT - 4}">${text}</tspan>`;
  }).join('');
}

/** @param {Bowtie} w */
const hazardBox = (w) => box('hazard', w.hazard.id, String(w.hazard.title), [hazardLabel(w.hazard), ...wrap(w.hazard.title)], 'hazard');
/** @param {Rec} f */
const factorBox = (f) => box('causal-factor', f.id, String(f.text), wrap(f.text), 'plain');
/** The room a box's number takes before its text, none when it has none. @param {Box} b */
const numWidth = (b) => (b.num ? Math.ceil(textWidth(String(b.num), true)) + 8 : 0);
/** The boxes numbered 1, 2, 3… in their order, as on the hazard's platform tab, when numbers are shown. @param {Box[]} boxes @param {boolean} on */
const numbered = (boxes, on) => {
  if (on) boxes.forEach((b, n) => { b.num = n + 1; b.title = `${n + 1}. ${b.title}`; });
  return boxes;
};
/** @param {Rec} q */
const consequenceBox = (q) => box('consequence', q.id, String(q.text), wrap(q.text), 'plain');

/**
 * Marks each causal factor or consequence no control on the diagram is linked to.
 * @param {Bowtie} w @param {Box[]} boxes
 */
function markGaps(w, boxes) {
  const guarded = new Set([...w.preventative, ...w.mitigating].flatMap((i) => i.targets ?? []));
  for (const b of boxes) {
    if (guarded.has(String(b.id))) continue;
    b.unguarded = true;
    b.title = `${b.title} (no control stands against it)`;
  }
}

/** @param {Bowtie} w @param {number} width @param {number} height @param {'focus' | 'traditional'} layout @param {string} body */
function svgDocument(w, width, height, layout, body) {
  const caption = `<text data-bowtie-caption="true" x="${MARGIN}" y="${MARGIN + FONT_SIZE + 2}" font-family="${FONT}" font-size="${FONT_SIZE + 2}" font-weight="700" style="fill:${c('ink')}">${esc(w.caption)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" data-bowtie-layout="${layout}" role="img" aria-label="${esc(`Bow-tie: ${w.hazard.title}, ${w.caption}`)}">`
    + `<rect width="${width}" height="${height}" style="fill:${c('paper')}"/>`
    + caption
    + body
    + '</svg>';
}

/** A lane's heading, centred on x. @param {number} x @param {number} y @param {string} text */
const heading = (x, y, text) => `<text x="${x}" y="${y}" text-anchor="middle" font-family="${FONT}" font-size="${HEAD_SIZE}" font-weight="700" letter-spacing="0.6" style="fill:${c('muted')}">${esc(text)}</text>`;
/**
 * A lane's heading in a cell of its own, a shade darker than the lane and ruled off below it.
 * @param {string} kind @param {number} x @param {number} y @param {number} width @param {string} text
 */
const laneHead = (kind, x, y, width, text) => `<rect data-bowtie-lane-head="${kind}" x="${x}" y="${y}" width="${width}" height="${LANE_HEAD}" style="fill:${c('ink')};stroke:${c('rule')}" fill-opacity="0.07" stroke-width="1"/>`
  + heading(x + width / 2, y + 19, text);
/** A heading's width, so the space under it is never narrower. @param {string} text */
const headingWidth = (text) => Math.ceil(textWidth(text.toUpperCase(), true) * (HEAD_SIZE / FONT_SIZE)) + 8;
/** The widest of the boxes' contents, between their padding. @param {Box[]} boxes @param {number} [least] */
const contentWidth = (boxes, least = 7) => Math.ceil(Math.max(least, ...boxes.flatMap((b) => [...b.lines.map((l, n) => numWidth(b) + textWidth(l, b.style === 'hazard') + (n === 0 && b.label ? textWidth(b.label, false) / 10 : 0)), tagsWidth(b.tags)]))) + 2 * PAD;

/**
 * The bow-tie as one self-contained SVG document: the same string is shown and exported.
 * Focus (this function's default; a bow-tie window opens in traditional) draws each control once, in columns, joined to what it stands against;
 * traditional draws a row for each causal factor and each consequence with its controls in
 * sequence along it, a control repeated on every row it stands on.
 * @param {Bowtie} w @param {{ tags?: boolean, gaps?: boolean, numbers?: boolean, layout?: 'focus' | 'traditional' }} [opts] tags: the badges on control boxes; gaps: the
 *   mark on causal factors and consequences no control is linked to; numbers: causal factors and consequences numbered as on
 *   the hazard's platform tab (each shown unless false) @returns {string}
 */
export function bowtieSvg(w, { tags = true, gaps = true, numbers = true, layout = 'focus' } = {}) {
  return layout === 'traditional' ? traditionalSvg(w, tags, gaps, numbers) : focusSvg(w, tags, gaps, numbers);
}

/** @param {Bowtie} w @param {boolean} tags @param {boolean} gaps @param {boolean} numbers */
function focusSvg(w, tags, gaps, numbers) {
  const hazard = hazardBox(w);
  /** @type {Box[][]} */
  const columns = [
    numbered(w.causalFactors.map(factorBox), numbers),
    w.preventative.map((i) => controlBox(i, 'preventative-control', tags)),
    [hazard],
    w.mitigating.map((i) => controlBox(i, 'mitigating-control', tags)),
    numbered(w.consequences.map(consequenceBox), numbers),
  ];
  // A causal factor or consequence no control on the diagram is linked to is marked.
  if (gaps) markGaps(w, [...columns[0], ...columns[4]]);
  // An empty lane stays, headed but blank: what is missing is plain without saying so.
  const heights = columns.map((col) => (col.length ? col.reduce((sum, b) => sum + b.height, 0) + (col.length - 1) * ROW_GAP : 0));
  const contentHeight = Math.max(...heights);
  const lanesTop = MARGIN + CAPTION_HEIGHT;
  const top = lanesTop + LANE_HEAD + LANE_PAD_Y;
  /** @type {{ x: number, width: number }[]} */
  const lanes = [];
  let x = MARGIN + COLUMN_GAP / 2;
  columns.forEach((col, n) => {
    // A column is at least as wide as its lane's heading, less the lane's own margins.
    const width = contentWidth(col, headingWidth(HEADINGS[n]) - COLUMN_GAP - 2 * PAD);
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
  const laneHeight = LANE_HEAD + LANE_PAD_Y + contentHeight + LANE_PAD_Y;
  const height = lanesTop + laneHeight + MARGIN / 2;
  // Vertical swimlanes, alternately shaded, the hazard's tinted; each headed with what it holds.
  const laneFill = (/** @type {number} */ n) => (n === 2 ? c('hazard-lane') : n % 2 ? c('lane') : c('paper'));
  const laneMarks = lanes.map((l, n) => `<g data-bowtie-lane="${COLUMNS[n]}"><rect x="${l.x}" y="${lanesTop}" width="${l.width}" height="${laneHeight}" style="fill:${laneFill(n)};stroke:${c('rule')}" stroke-width="1"/>`
    + `${laneHead(COLUMNS[n], l.x, lanesTop, l.width, HEADINGS[n])}</g>`);

  // One line from each preventative control into the hazard, one from the hazard to each
  // mitigating control: the barriers on either side of it. What each stands against is shown by its
  // own links to causal factors and consequences (below).
  const midY = hazard.y + Math.floor(hazard.height / 2);
  const edges = [
    ...columns[1].map((b) => `<line data-bowtie-edge="${esc(b.id)}" x1="${b.x + b.width}" y1="${b.y + Math.floor(b.height / 2)}" x2="${hazard.x}" y2="${midY}" style="stroke:${c('edge')}" stroke-width="1.5"/>`),
    ...columns[3].map((b) => `<line data-bowtie-edge="${esc(b.id)}" x1="${hazard.x + hazard.width}" y1="${midY}" x2="${b.x}" y2="${b.y + Math.floor(b.height / 2)}" style="stroke:${c('edge')}" stroke-width="1.5"/>`),
  ];
  // Each control joined to what it prevents (a causal factor, left) or mitigates (a consequence,
  // right) by a curve, so which barrier stands on which line is plain to see.
  /** @type {Map<string, Box>} */
  const byId = new Map([...columns[0], ...columns[4]].map((b) => [String(b.id), b]));
  const links = [...columns[1], ...columns[3]].flatMap((b) => (b.item?.targets ?? []).map((t) => {
    const to = byId.get(t);
    if (!to) return '';
    const left = b.kind === 'preventative-control';
    const x1 = left ? b.x : b.x + b.width;
    const y1 = b.y + Math.floor(b.height / 2);
    const x2 = left ? to.x + to.width : to.x;
    const y2 = to.y + Math.floor(to.height / 2);
    const bend = (x1 - x2) / 2;
    return `<path data-bowtie-link="${esc(b.id)}" data-bowtie-target="${esc(t)}" d="M${x1} ${y1} C${x1 - bend} ${y1} ${x2 + bend} ${y2} ${x2} ${y2}" fill="none" style="stroke:${c('accent')}" stroke-width="1.75" stroke-dasharray="5 3" opacity="0.8"/>`;
  }));
  return svgDocument(w, width, height, 'focus', laneMarks.join('') + edges.join('') + links.join('') + columns.flat().map(drawBox).join(''));
}


/**
 * The traditional view: on the left a row for each causal factor, its preventative controls in
 * sequence from it to the hazard; on the right a row for each consequence, its mitigating
 * controls in sequence from the hazard to it. A control standing on several rows is drawn on each.
 * A control linked to none of them has a row of its own, so nothing on the diagram goes missing.
 * @param {Bowtie} w @param {boolean} tags @param {boolean} gaps @param {boolean} numbers
 */
function traditionalSvg(w, tags, gaps, numbers) {
  const hazard = hazardBox(w);
  /** @typedef {{ key: string, end: Box, controls: Box[], y: number, height: number }} Row */
  /**
   * @param {Box[]} ends @param {Item[]} items @param {string} kind @param {string} none
   * @returns {Row[]}
   */
  const rowsOf = (ends, items, kind, none) => {
    const ids = new Set(ends.map((e) => String(e.id)));
    /** @type {Row[]} */
    const rows = ends.map((e) => ({ key: String(e.id), end: e, controls: items.filter((i) => (i.targets ?? []).includes(String(e.id))).map((i) => controlBox(i, kind, tags)), y: 0, height: 0 }));
    const loose = items.filter((i) => !(i.targets ?? []).some((t) => ids.has(t)));
    if (loose.length) rows.push({ key: `${kind}-unlinked`, end: box('unlinked', null, none, wrap(none), 'plain'), controls: loose.map((i) => controlBox(i, kind, tags)), y: 0, height: 0 });
    for (const r of rows) for (const b of [r.end, ...r.controls]) b.row = r.key;
    return rows;
  };
  const left = rowsOf(numbered(w.causalFactors.map(factorBox), numbers), w.preventative, 'preventative-control', 'Linked to no causal factor');
  const right = rowsOf(numbered(w.consequences.map(consequenceBox), numbers), w.mitigating, 'mitigating-control', 'Linked to no consequence');
  if (gaps) markGaps(w, [...left, ...right].map((r) => r.end).filter((b) => b.kind !== 'unlinked'));

  // Every box in a column of the grid is as wide as the widest in it, so the rows line up.
  const endWidthL = contentWidth(left.map((r) => r.end), headingWidth(HEADINGS[0]) - 2 * PAD);
  const endWidthR = contentWidth(right.map((r) => r.end), headingWidth(HEADINGS[4]) - 2 * PAD);
  const controlWidthL = contentWidth(left.flatMap((r) => r.controls));
  const controlWidthR = contentWidth(right.flatMap((r) => r.controls));
  const slotsL = Math.max(0, ...left.map((r) => r.controls.length));
  const slotsR = Math.max(0, ...right.map((r) => r.controls.length));
  const span = (/** @type {number} */ n, /** @type {number} */ cw, /** @type {string} */ head) => Math.max(n * (cw + SEQ_GAP), headingWidth(head) + SEQ_GAP);
  const controlsL = span(slotsL, controlWidthL, HEADINGS[1]);
  const controlsR = span(slotsR, controlWidthR, HEADINGS[3]);
  hazard.width = contentWidth([hazard], headingWidth(HEADINGS[2]) - 2 * PAD);

  const lanesTop = MARGIN + CAPTION_HEIGHT;
  const top = lanesTop + LANE_HEAD;
  const rowHeight = (/** @type {Row} */ r) => Math.max(...[r.end, ...r.controls].map((b) => b.height)) + 2 * ROW_PAD;
  const stack = (/** @type {Row[]} */ rows) => rows.reduce((sum, r) => sum + rowHeight(r), 0);
  const contentHeight = Math.max(stack(left), stack(right), hazard.height + 2 * LANE_PAD_Y);

  // Across: the causal factors, their controls, the gathering lines, the hazard, and the same mirrored.
  const leftX = MARGIN;
  const endXL = leftX + SIDE_PAD;
  // A causal factor or consequence sits SIDE_PAD inside both edges of its lane, so the gap to the
  // controls beside it is wider than theirs to each other by what that adds.
  const laneEdge = 2 * SIDE_PAD - SEQ_GAP;
  const controlsEndL = endXL + endWidthL + laneEdge + controlsL;
  const hazardLaneX = controlsEndL + FAN;
  const hazardLaneW = hazard.width + 2 * HAZARD_PAD;
  const rightX = hazardLaneX + hazardLaneW;
  const controlsStartR = rightX + FAN;
  const endXR = controlsStartR + controlsR + laneEdge;
  const width = endXR + endWidthR + SIDE_PAD + MARGIN;
  const height = top + contentHeight + MARGIN / 2;
  hazard.x = hazardLaneX + HAZARD_PAD;
  hazard.y = top + Math.floor((contentHeight - hazard.height) / 2);
  const hazardMid = hazard.y + Math.floor(hazard.height / 2);

  /** @type {string[]} */
  const bands = [];
  /** @type {string[]} */
  const lines = [];
  const line = (/** @type {string} */ key, /** @type {number} */ x1, /** @type {number} */ y1, /** @type {number} */ x2, /** @type {number} */ y2) => {
    // Straight along a row; a curve where it gathers into the hazard or spreads out of it.
    const bend = (x2 - x1) / 2;
    const d = y1 === y2 ? `M${x1} ${y1} L${x2} ${y2}` : `M${x1} ${y1} C${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2} ${y2}`;
    lines.push(`<path data-bowtie-row="${esc(key)}" d="${d}" fill="none" style="stroke:${c('edge')}" stroke-width="1.5"/>`);
  };
  /** @param {Row[]} rows @param {boolean} isLeft */
  const place = (rows, isLeft) => {
    let y = top + Math.floor((contentHeight - stack(rows)) / 2);
    rows.forEach((r, n) => {
      r.y = y;
      r.height = rowHeight(r);
      const mid = y + Math.floor(r.height / 2);
      const at = (/** @type {Box} */ b, /** @type {number} */ x, /** @type {number} */ bw) => { b.x = x; b.width = bw; b.y = mid - Math.floor(b.height / 2); };
      const x0 = isLeft ? leftX : rightX;
      const x1 = isLeft ? hazardLaneX : width - MARGIN;
      // Laid over the columns' lanes: every other row faintly shaded, each ruled off from the next.
      bands.push(`<rect data-bowtie-band="${esc(r.key)}" x="${x0}" y="${y}" width="${x1 - x0}" height="${r.height}" style="fill:${n % 2 ? 'none' : c('ink')};stroke:${c('rule')}" fill-opacity="0.04" stroke-width="1"/>`);
      // The controls sit together nearest the hazard, in their order, the first nearest the causal
      // factor or consequence.
      const k = r.controls.length;
      if (isLeft) {
        at(r.end, endXL, endWidthL);
        r.controls.forEach((b, i) => at(b, controlsEndL - (k - i) * (controlWidthL + SEQ_GAP) + SEQ_GAP, controlWidthL));
        const chain = [r.end, ...r.controls];
        chain.forEach((b, i) => { const next = chain[i + 1]; if (next) line(r.key, b.x + b.width, mid, next.x, mid); });
        // Straight on past the controls' column, then gathering into the hazard.
        const last = chain[chain.length - 1];
        if (last.x + last.width < controlsEndL) line(r.key, last.x + last.width, mid, controlsEndL, mid);
        line(r.key, Math.max(controlsEndL, last.x + last.width), mid, hazard.x, hazardMid);
      } else {
        r.controls.forEach((b, i) => at(b, controlsStartR + i * (controlWidthR + SEQ_GAP), controlWidthR));
        at(r.end, endXR, endWidthR);
        const chain = [...r.controls, r.end];
        line(r.key, hazard.x + hazard.width, hazardMid, controlsStartR, mid);
        if (chain[0].x > controlsStartR) line(r.key, controlsStartR, mid, chain[0].x, mid);
        chain.forEach((b, i) => { const next = chain[i + 1]; if (next) line(r.key, b.x + b.width, mid, next.x, mid); });
      }
      y += r.height;
    });
  };
  place(left, true);
  place(right, false);
  // Vertical lanes for the five columns, as in the focus view, so a control never reads as a
  // causal factor or consequence.
  const splitL = endXL + endWidthL + SIDE_PAD;
  const splitR = endXR - SIDE_PAD;
  const edges = [leftX, splitL, hazardLaneX, rightX, splitR, width - MARGIN];
  const laneFill = (/** @type {number} */ n) => (n === 2 ? c('hazard-lane') : n % 2 ? c('lane') : c('paper'));
  const lanes = COLUMNS.map((kind, n) => {
    const x0 = edges[n];
    const lw = edges[n + 1] - x0;
    return `<g data-bowtie-lane="${kind}"><rect x="${x0}" y="${lanesTop}" width="${lw}" height="${LANE_HEAD + contentHeight}" style="fill:${laneFill(n)};stroke:${c('rule')}" stroke-width="1"/>`
      + `${laneHead(kind, x0, lanesTop, lw, HEADINGS[n])}</g>`;
  });
  const boxes = [...left, ...right].flatMap((r) => [r.end, ...r.controls]);
  return svgDocument(w, width, height, 'traditional', lanes.join('') + bands.join('') + lines.join('') + [...boxes, hazard].map(drawBox).join(''));
}
