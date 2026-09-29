#!/usr/bin/env node
/**
 * The whole build: embed every module as an inline `data:` module and resolve the imports
 * between them with an inline import map, so dist/pivot.html opens from a file path (a null
 * origin cannot import a second file) with no fetch of anything. No bundler, no dependency.
 *
 *     node scripts/build.js            # -> dist/pivot.html
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FULCRUM_ICON } from '../src/ui/logo.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
const ENTRY = 'src/main.js';
const EXTRA_SOURCES = ['DocGen/doc-designer.js'];
const STYLES = ['DocGen/doc-designer.css', 'src/ui/styles.css'];
/** Embedded so the page needs no network: [file, weight, style]. Licence: assets/fonts/OFL.txt. */
const FONTS = [
  ['atkinson-hyperlegible-latin-400-normal.woff2', 400, 'normal'],
  ['atkinson-hyperlegible-latin-400-italic.woff2', 400, 'italic'],
  ['atkinson-hyperlegible-latin-700-normal.woff2', 700, 'normal'],
  ['atkinson-hyperlegible-latin-700-italic.woff2', 700, 'italic'],
];

/** @param {string} root */
function fontFaces(root) {
  return FONTS.map(([file, weight, style]) => {
    const data = fs.readFileSync(path.join(root, 'assets', 'fonts', String(file))).toString('base64');
    return `@font-face { font-family: "Atkinson Hyperlegible"; font-weight: ${weight}; font-style: ${style}; font-display: swap; src: url(data:font/woff2;base64,${data}) format("woff2"); }`;
  }).join('\n');
}
const IMPORT_RE = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\2/g;

/** @param {string} dir @returns {string[]} */
function jsFilesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFilesUnder(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/** @param {string} root @returns {string[]} project-relative posix paths */
export function collectSources(root) {
  const rel = (/** @type {string} */ abs) => path.relative(root, abs).split(path.sep).join('/');
  return [...jsFilesUnder(path.join(root, 'src')).map(rel), ...EXTRA_SOURCES].sort();
}

/**
 * Whether an import-shaped match sits in a comment line or inside a string opened earlier on
 * its line. Line-local, as the sources are written knowing.
 * @param {string} source @param {number} offset
 */
export function inCommentOrString(source, offset) {
  const lineStart = source.lastIndexOf('\n', offset) + 1;
  const before = source.slice(lineStart, offset);
  const lead = before.trimStart();
  if (lead.startsWith('*') || lead.startsWith('//')) return true;
  for (const quote of ["'", '"', '`']) {
    let count = 0;
    for (let i = 0; i < before.length; i += 1) if (before[i] === quote && before[i - 1] !== '\\') count += 1;
    if (count % 2 === 1) return true;
  }
  return false;
}

/**
 * Rewrite relative imports to project-relative specifiers, because a data: module has no base
 * to resolve `./x.js` against.
 * @param {string} source @param {string} fileRel @param {Set<string>} known
 */
export function rewriteImports(source, fileRel, known) {
  return source.replace(IMPORT_RE, (whole, lead, quote, spec, offset) => {
    if (inCommentOrString(source, offset)) return whole;
    let target;
    if (spec.startsWith('./') || spec.startsWith('../')) target = path.posix.normalize(path.posix.join(path.posix.dirname(fileRel), spec));
    else if (known.has(spec)) target = spec;
    else throw new Error(`${fileRel}: imports "${spec}"; Pivot has no dependencies, so every import is a file in this project`);
    if (!known.has(target)) throw new Error(`${fileRel}: imports "${spec}", which resolves to ${target}, not a source file`);
    return `${lead}${quote}${target}${quote}`;
  });
}

/** @param {{ root?: string, builtAt?: string }} [o] @returns {string} */
export function build({ root = ROOT, builtAt = new Date().toISOString() } = {}) {
  const sources = collectSources(root);
  const known = new Set(sources);
  if (!known.has(ENTRY)) throw new Error(`the entry ${ENTRY} is missing`);
  /** @type {Record<string, string>} */
  const imports = {};
  for (const rel of sources) {
    const text = rewriteImports(fs.readFileSync(path.join(root, rel), 'utf8'), rel, known);
    imports[rel] = `data:text/javascript;base64,${Buffer.from(text, 'utf8').toString('base64')}`;
  }
  const css = [fontFaces(root), ...STYLES.map((s) => fs.readFileSync(path.join(root, s), 'utf8'))].join('\n').replace(/<\/style/gi, '<\\/style');
  const importMap = JSON.stringify({ imports }).replace(/</g, '\\u003c');
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta name="pivot-build" content="${builtAt}">`,
    '<title>Pivot</title>',
    `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(FULCRUM_ICON)}">`,
    `<style>\n${css}</style>`,
    `<script type="importmap">${importMap}</script>`,
    '</head>',
    '<body>',
    '<div id="pivot"></div>',
    `<script type="module">import ${JSON.stringify(ENTRY)};</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const page = build();
    const out = path.join(ROOT, 'dist', 'pivot.html');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, page);
    console.log(`OK wrote ${out} (${page.length} bytes)`);
  } catch (e) {
    console.error(`FAIL ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}
