#!/usr/bin/env node
/**
 * The whole build (DEC-003): read every module's source, embed each as an inline module in
 * one HTML file, and resolve the imports between them with an inline import map, so the
 * built pivot.html opens from the shared folder with no fetch of a second file (REQ-040,
 * REQ-041). No bundler, no dependency. The built file is generated, never committed.
 *
 * How: a page opened from a file path has a null origin, so one module file cannot import
 * another. Each source becomes a `data:` URL, the import map maps its project-relative
 * specifier (`modules/store/contract.js`) to that URL, and every relative import in the
 * sources is rewritten to that specifier, because a data: module has no base to resolve
 * `./x.js` against. The entry is one inline module that imports `views`.
 *
 *     node baseline/scripts/build.js                       # -> baseline/dist/pivot.html
 *     node baseline/scripts/build.js --out /path/pivot.html
 *     node baseline/scripts/build.js --root DIR --entry modules/x/src/main.js   # tests
 *
 * What is embedded: baseline/*.js (the runtime; scripts and tests are not), every
 * modules/<m>/contract.js, and every file under modules/<m>/src/. Nothing else runs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(HERE, '..', '..');
export const DEFAULT_ENTRY = 'modules/views/src/main.js';
export const DEFAULT_OUT = path.join(DEFAULT_ROOT, 'baseline', 'dist', 'pivot.html');

const IMPORT_RE = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\2/g;

/**
 * @param {string} dir absolute
 * @returns {string[]} absolute paths of every .js file below dir
 */
function jsFilesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  /** @type {string[]} */
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFilesUnder(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out.sort();
}

/**
 * @param {string} root
 * @returns {string[]} project-relative posix paths of every runtime source
 */
export function collectSources(root) {
  const rel = (/** @type {string} */ abs) => path.relative(root, abs).split(path.sep).join('/');
  /** @type {string[]} */
  const files = [];
  const baseline = path.join(root, 'baseline');
  if (fs.existsSync(baseline)) {
    for (const entry of fs.readdirSync(baseline, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.js')) files.push(rel(path.join(baseline, entry.name)));
    }
  }
  const modules = path.join(root, 'modules');
  if (fs.existsSync(modules)) {
    for (const m of fs.readdirSync(modules, { withFileTypes: true })) {
      if (!m.isDirectory()) continue;
      const contract = path.join(modules, m.name, 'contract.js');
      if (fs.existsSync(contract)) files.push(rel(contract));
      files.push(...jsFilesUnder(path.join(modules, m.name, 'src')).map(rel));
    }
  }
  return files.sort();
}

/**
 * Whether an import-shaped match at `offset` is not an import statement: it sits in a
 * comment line, or inside a string or template literal opened earlier on its line (a test
 * fixture holding source text, a message). Line-local, so a literal spanning lines is not
 * caught; the sources are written knowing that.
 * @param {string} source
 * @param {number} offset
 * @returns {boolean}
 */
export function inCommentOrString(source, offset) {
  const lineStart = source.lastIndexOf('\n', offset) + 1;
  const before = source.slice(lineStart, offset);
  const lead = before.trimStart();
  if (lead.startsWith('*') || lead.startsWith('//')) return true;
  for (const quote of ["'", '"', '`']) {
    let count = 0;
    for (let i = 0; i < before.length; i += 1) {
      if (before[i] === quote && before[i - 1] !== '\\') count += 1;
    }
    if (count % 2 === 1) return true;
  }
  return false;
}

/**
 * Rewrite every relative import in `source` to the project-relative specifier of its
 * target. A bare specifier is an error: the product has no dependency (DEC-003, IMP-06).
 * @param {string} source
 * @param {string} fileRel project-relative posix path of the file the source came from
 * @param {Set<string>} known every specifier the page will contain
 * @returns {string}
 */
export function rewriteImports(source, fileRel, known) {
  return source.replace(IMPORT_RE, (whole, lead, quote, spec, offset) => {
    if (inCommentOrString(source, offset)) return whole;
    let target;
    if (spec.startsWith('./') || spec.startsWith('../')) {
      target = path.posix.normalize(path.posix.join(path.posix.dirname(fileRel), spec));
    } else if (known.has(spec)) {
      target = spec;
    } else {
      throw new Error(`${fileRel}: imports "${spec}", which is not a file in this project; the product has no dependency (DEC-003)`);
    }
    if (!known.has(target)) {
      throw new Error(`${fileRel}: imports "${spec}", which resolves to ${target}, not a runtime source (baseline/*.js, modules/<m>/contract.js, modules/<m>/src/**)`);
    }
    return `${lead}${quote}${target}${quote}`;
  });
}

/**
 * @param {object} options
 * @param {string} [options.root]
 * @param {string} [options.entry] project-relative specifier of the module the page runs
 * @param {string} [options.builtAt] stamp put in the page's meta tag
 * @returns {string} the page
 */
export function build({ root = DEFAULT_ROOT, entry = DEFAULT_ENTRY, builtAt = new Date().toISOString() } = {}) {
  const sources = collectSources(root);
  const known = new Set(sources);
  if (!known.has(entry)) {
    throw new Error(`entry ${entry} is not among the runtime sources; nothing to run (is the views module built yet?)`);
  }
  /** @type {Record<string, string>} */
  const imports = {};
  for (const rel of sources) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    const rewritten = rewriteImports(text, rel, known);
    imports[rel] = `data:text/javascript;base64,${Buffer.from(rewritten, 'utf8').toString('base64')}`;
  }
  const tokensPath = path.join(root, 'baseline', 'tokens.css');
  const tokens = fs.existsSync(tokensPath) ? fs.readFileSync(tokensPath, 'utf8').replace(/<\/style/gi, '<\\/style') : '';
  const importMap = JSON.stringify({ imports }).replace(/</g, '\\u003c');
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta name="pivot-build" content="${builtAt}">`,
    '<title>Pivot</title>',
    `<style>\n${tokens}</style>`,
    `<script type="importmap">${importMap}</script>`,
    '</head>',
    '<body>',
    '<div id="pivot"></div>',
    `<script type="module">import ${JSON.stringify(entry)};</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/**
 * @param {string[]} argv
 * @returns {number} exit code
 */
export function main(argv) {
  const flag = (/** @type {string} */ name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const root = path.resolve(flag('--root') ?? DEFAULT_ROOT);
  const out = path.resolve(flag('--out') ?? (root === DEFAULT_ROOT ? DEFAULT_OUT : path.join(root, 'baseline', 'dist', 'pivot.html')));
  try {
    const page = build({ root, entry: flag('--entry') ?? DEFAULT_ENTRY });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, page);
    console.log(`OK wrote ${out} (${page.length} bytes, ${Object.keys(collectSources(root)).length} module(s))`);
    return 0;
  } catch (e) {
    console.error(`FAIL ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
