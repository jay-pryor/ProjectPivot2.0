/**
 * bowtie, implementing contract version 1.0 (modules/bowtie/CONTRACT.md). Selected by
 * contract.js unless BOWTIE_IMPL=null. Clause IDs (C-nnn) cite the contract.
 *
 * `bowtieFor` is the two registry reads C-001 names and nothing else; `renderBowtieSvg` lays
 * the value out on a fixed grid from its text's length, measuring no font (C-007, C-010), and
 * writes the document as a string in the syntax C-009 allows.
 */

import {
  getHazardDetail, listPlatformHazards, HazardNotLiveError, HazardNotOnPlatformError, UnknownHazardError,
} from '../../registry/contract.js';
import { HazardOmittedError, InvalidBowtieError } from '../contract.js';

/** @typedef {import('../contract.js').BowtieImplementation} Impl */
/** @typedef {import('../contract.js').Bowtie} Bowtie */
/** @typedef {import('../contract.js').BowtieNodeKind} BowtieNodeKind */
/** @typedef {import('../../registry/contract.js').PlatformControl} PlatformControl */

// ------------------------------------------------------------------ reading (C-001, C-002)

/** @type {Impl['bowtieFor']} */
export async function bowtieFor(body, hazardId, platformId) {
  const list = await listPlatformHazards(body, platformId);
  const detail = await getHazardDetail(body, hazardId);
  if (detail === null) throw new UnknownHazardError(hazardId);
  if (detail.hazard.status !== 'live') throw new HazardNotLiveError(hazardId, detail.hazard.status);
  const row = list.rows.find((r) => r.hazard.id === hazardId);
  if (row === undefined) {
    const omitted = list.omitted.find((o) => o.id === hazardId);
    if (omitted === undefined) throw new HazardNotOnPlatformError(hazardId, platformId);
    throw new HazardOmittedError(hazardId, omitted.reason, omitted.key, omitted.detail);
  }
  return Object.freeze({
    platform: list.platform,
    hazard: row.hazard,
    reportId: row.reportId,
    causalFactors: Object.freeze([...detail.causalFactors]),
    consequences: Object.freeze([...detail.consequences]),
    preventativeControls: Object.freeze(row.controls.filter((c) => c.controlKind === 'preventative')),
    mitigatingControls: Object.freeze(row.controls.filter((c) => c.controlKind === 'mitigating')),
  });
}

// ------------------------------------------------------------------ checking (C-011)

const STATES = Object.freeze(['confirmed', 'excluded', 'awaiting']);

/**
 * @param {unknown} v
 * @returns {v is Record<string, any>}
 */
function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * The first failing field in C-011's order, or null when `w` is a `Bowtie`.
 * @param {unknown} w
 * @returns {string | null}
 */
function invalidField(w) {
  if (!isObject(w)) return 'bowtie';
  if (!isObject(w.hazard) || typeof w.hazard.id !== 'string') return 'hazard.id';
  if (typeof w.hazard.title !== 'string') return 'hazard.title';
  if (!isObject(w.platform) || typeof w.platform.name !== 'string') return 'platform.name';
  if (typeof w.reportId !== 'string' || w.reportId === '') return 'reportId';
  for (const name of ['causalFactors', 'consequences']) {
    const list = w[name];
    if (!Array.isArray(list)) return name;
    const seen = new Set();
    for (let i = 0; i < list.length; i += 1) {
      const e = list[i];
      if (!isObject(e) || typeof e.id !== 'string') return `${name}[${i}].id`;
      if (typeof e.text !== 'string') return `${name}[${i}].text`;
      if (seen.has(e.id)) return `${name}[${i}].id`;
      seen.add(e.id);
    }
  }
  for (const [name, kind] of [['preventativeControls', 'preventative'], ['mitigatingControls', 'mitigating']]) {
    const list = w[name];
    if (!Array.isArray(list)) return name;
    const seen = new Set();
    for (let i = 0; i < list.length; i += 1) {
      const e = list[i];
      if (!isObject(e) || !isObject(e.control) || typeof e.control.id !== 'string') return `${name}[${i}].control.id`;
      if (typeof e.control.title !== 'string') return `${name}[${i}].control.title`;
      if (!STATES.includes(e.state)) return `${name}[${i}].state`;
      if (e.controlKind !== kind) return `${name}[${i}].controlKind`;
      if (seen.has(e.control.id)) return `${name}[${i}].control.id`;
      seen.add(e.control.id);
    }
  }
  return null;
}

// ------------------------------------------------------------------ drawing

/** C-006: one line per state, the same in every document, three different strings. */
const STATE_LINES = Object.freeze({
  confirmed: 'Confirmed on this platform',
  excluded: 'Excluded on this platform',
  awaiting: 'Awaiting a ruling',
});

// The grid, in user units. A box is laid out from its text's length, never measured (C-010).
const CHARS_PER_LINE = 28;
const CHAR_WIDTH = 7;
const LINE_HEIGHT = 16;
const PAD = 8;
const COLUMN_GAP = 48;
const ROW_GAP = 16;
const MARGIN = 24;
const CAPTION_HEIGHT = 32;
const FONT_SIZE = 12;

/**
 * C-005: the text's words, broken only at whitespace into lines of at most `CHARS_PER_LINE`
 * characters where a word allows; a longer word is a line of its own, never split.
 * @param {string} text
 * @returns {string[]}
 */
function wrap(text) {
  const words = text.trim().split(/\s+/).filter((w) => w !== '');
  /** @type {string[]} */
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line === '') line = word;
    else if (line.length + 1 + word.length <= CHARS_PER_LINE) line = `${line} ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

/**
 * C-009: the four entity references, and nothing else.
 * @param {string} s
 */
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * @typedef {object} Node
 * @property {BowtieNodeKind} kind
 * @property {string} id
 * @property {string} title the stored text, whole (C-005)
 * @property {string[]} lines the visible lines
 * @property {string | null} state a control's state, else null
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * @param {BowtieNodeKind} kind
 * @param {string} id
 * @param {string} title
 * @param {string[]} lines
 * @param {string | null} state
 * @returns {Node}
 */
function node(kind, id, title, lines, state) {
  return { kind, id, title, lines, state, x: 0, y: 0, width: 0, height: lines.length * LINE_HEIGHT + 2 * PAD };
}

/** @param {PlatformControl} c */
function controlNode(c, /** @type {BowtieNodeKind} */ kind) {
  return node(kind, c.control.id, c.control.title, [...wrap(c.control.title), STATE_LINES[c.state]], c.state);
}

/**
 * @param {Node} n
 * @returns {string}
 */
function drawNode(n) {
  const state = n.state === null ? '' : ` data-control-state="${esc(n.state)}"`;
  const tx = n.x + PAD;
  const tspans = n.lines
    .map((l, i) => `<tspan x="${tx}" y="${n.y + PAD + (i + 1) * LINE_HEIGHT - 4}">${esc(l)}</tspan>`)
    .join('');
  return `<g data-bowtie-node="${n.kind}" data-record-id="${esc(n.id)}"${state}>`
    + `<title>${esc(n.title)}</title>`
    + `<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="4" fill="#ffffff" stroke="#333333"/>`
    + `<text font-family="sans-serif" font-size="${FONT_SIZE}" fill="#111111">${tspans}</text>`
    + '</g>';
}

/** @type {Impl['renderBowtieSvg']} */
export async function renderBowtieSvg(bowtie) {
  const field = invalidField(bowtie);
  if (field !== null) throw new InvalidBowtieError(field);
  const w = bowtie;

  const hazard = node('hazard', w.hazard.id, w.hazard.title, [w.reportId, ...wrap(w.hazard.title)], null);
  /** @type {Node[][]} C-007's left-to-right order */
  const columns = [
    w.causalFactors.map((f) => node('causal-factor', f.id, f.text, wrap(f.text), null)),
    w.preventativeControls.map((c) => controlNode(c, 'preventative-control')),
    [hazard],
    w.mitigatingControls.map((c) => controlNode(c, 'mitigating-control')),
    w.consequences.map((q) => node('consequence', q.id, q.text, wrap(q.text), null)),
  ];

  const heights = columns.map((col) => col.reduce((sum, n) => sum + n.height, 0) + Math.max(0, col.length - 1) * ROW_GAP);
  const contentHeight = Math.max(...heights);
  const top = MARGIN + CAPTION_HEIGHT;
  let x = MARGIN;
  columns.forEach((col, i) => {
    const longest = Math.max(1, ...col.flatMap((n) => n.lines.map((l) => l.length)));
    const width = longest * CHAR_WIDTH + 2 * PAD;
    let y = top + Math.floor((contentHeight - heights[i]) / 2);
    for (const n of col) {
      n.x = x;
      n.y = y;
      n.width = width;
      y += n.height + ROW_GAP;
    }
    // An empty column still takes its gap, so the sides stay where a reader expects them.
    x += (col.length === 0 ? 0 : width) + COLUMN_GAP;
  });
  const width = x - COLUMN_GAP + MARGIN;
  const height = top + contentHeight + MARGIN;

  // C-008: one edge per causal factor into the hazard, one per consequence out of it.
  const hazardMidY = hazard.y + Math.floor(hazard.height / 2);
  const edges = [
    ...columns[0].map((n) => `<line data-bowtie-edge="${esc(n.id)}" x1="${n.x + n.width}" y1="${n.y + Math.floor(n.height / 2)}" x2="${hazard.x}" y2="${hazardMidY}" stroke="#888888"/>`),
    ...columns[4].map((n) => `<line data-bowtie-edge="${esc(n.id)}" x1="${hazard.x + hazard.width}" y1="${hazardMidY}" x2="${n.x}" y2="${n.y + Math.floor(n.height / 2)}" stroke="#888888"/>`),
  ];

  const caption = `<text data-bowtie-caption="true" x="${MARGIN}" y="${MARGIN + FONT_SIZE}" font-family="sans-serif" font-size="${FONT_SIZE + 2}" fill="#111111">`
    + `${esc(`${w.platform.name} · ${w.reportId}`)}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`
    + caption
    + edges.join('')
    + columns.flat().map(drawNode).join('')
    + '</svg>';
}
