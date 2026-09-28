#!/usr/bin/env node
/**
 * Validate the real import graph against modules/<m>/manifest.yaml (CORE-CON-003), in the
 * CI position the framework's check_boundaries.py occupies for Python (DEC-003). The four
 * rules are the framework's, over ES module import statements:
 *
 *   surface   From outside a module, only modules/<m>/contract.js is importable, and
 *             modules/<m>/conformance/** from test code alone.
 *   declared  Every baseline/* or modules/* import a module makes is listed in its own
 *             manifest, extension dropped (`baseline/types`, `modules/store/contract`).
 *   drawn     Every manifest entry is imported by some file in the module.
 *   acyclic   No cycle among modules, and nothing under baseline/ imports a module.
 *
 * And one the language adds: a bare specifier that is not a `node:` built-in is a
 * third-party import, which the product does not have (DEC-003, IMP-06). Test code and
 * scripts may use `node:` built-ins; runtime code may not, since it runs in a browser, but
 * the build is where that fails, not here.
 *
 *     node baseline/scripts/check_boundaries.js [--root DIR]     # exit 1 on any violation
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { inCommentOrString } from './build.js';

export const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKIP = new Set(['node_modules', 'dist']);
const IMPORT_RE = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\2/g;

/**
 * @param {string} dir
 * @returns {string[]}
 */
function jsFilesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  /** @type {string[]} */
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFilesUnder(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out.sort();
}

/**
 * The manifest's two fields, read without a YAML dependency: `module: <name>` and the
 * `- item` lines under `allowed_imports:`.
 * @param {string} text
 * @returns {{ module: string | null, allowed_imports: string[] }}
 */
export function parseManifest(text) {
  /** @type {string | null} */
  let module = null;
  /** @type {string[]} */
  const allowed = [];
  let inList = false;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trimEnd();
    if (line.trim() === '') continue;
    const top = /^(\w+):\s*(.*)$/.exec(line);
    if (top) {
      inList = top[1] === 'allowed_imports';
      if (top[1] === 'module') module = top[2].trim() || null;
      if (inList && top[2].trim() === '[]') inList = false;
      continue;
    }
    const item = /^\s+-\s*(.+)$/.exec(line);
    if (inList && item) allowed.push(item[1].trim().replace(/^['"]|['"]$/g, ''));
  }
  return { module, allowed_imports: allowed };
}

/**
 * @param {string} rel project-relative posix path
 * @returns {boolean}
 */
export function isTestCode(rel) {
  const parts = rel.split('/');
  return parts.includes('conformance') || parts.includes('tests') || parts[0] === 'validation' || rel.endsWith('.test.js');
}

/**
 * @param {string} rel
 * @returns {string | null} the module a file belongs to, or null for baseline and the rest
 */
export function ownerOf(rel) {
  const parts = rel.split('/');
  return parts.length > 2 && parts[0] === 'modules' ? parts[1] : null;
}

/** @param {string} rel @returns {string} `baseline/types` for `baseline/types.js` */
export function manifestName(rel) {
  return rel.replace(/\.js$/, '');
}

/**
 * @param {string} target project-relative import target
 * @param {string} owner the module `target` is inside
 * @param {boolean} fromTest
 * @returns {string | null} the violation, or null
 */
export function surfaceViolation(target, owner, fromTest) {
  const rest = target.split('/').slice(2).join('/');
  if (/^contract\.js$/.test(rest)) return null;
  if (rest === 'conformance' || rest.startsWith('conformance/')) {
    return fromTest ? null : `imports ${owner}'s conformance suite from production code; a suite is promised to other tests, not to implementations`;
  }
  return `reaches into ${owner}'s internals (${rest || 'the module folder'}); only modules/${owner}/contract.js is importable, and modules/${owner}/conformance/** from test code`;
}

/**
 * @typedef {object} Graph
 * @property {Map<string | null, Map<string, string>>} uses owner -> (target -> "file:line") for imports that leave the owner
 * @property {string[]} errors
 */

/**
 * @param {string} root
 * @returns {Graph}
 */
export function collect(root) {
  /** @type {Map<string | null, Map<string, string>>} */
  const uses = new Map();
  /** @type {string[]} */
  const errors = [];
  const files = [...jsFilesUnder(path.join(root, 'baseline')), ...jsFilesUnder(path.join(root, 'modules')), ...jsFilesUnder(path.join(root, 'validation'))];
  for (const abs of files) {
    const rel = path.relative(root, abs).split(path.sep).join('/');
    const owner = ownerOf(rel);
    const fromTest = isTestCode(rel);
    const text = fs.readFileSync(abs, 'utf8');
    for (const match of text.matchAll(IMPORT_RE)) {
      const spec = match[3];
      const offset = match.index ?? 0;
      if (inCommentOrString(text, offset)) continue; // an example in a comment, or source text held in a string
      const line = text.slice(0, offset).split('\n').length;
      const where = `${rel}:${line}`;
      if (spec.startsWith('node:')) continue;
      if (!spec.startsWith('./') && !spec.startsWith('../')) {
        errors.push(`${where}: imports "${spec}", a bare specifier; the product has no third-party dependency (DEC-003, IMP-06)`);
        continue;
      }
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
      if (!fs.existsSync(path.join(root, target))) {
        errors.push(`${where}: imports "${spec}", which resolves to ${target}, and no such file exists`);
        continue;
      }
      if (owner && target.startsWith(`modules/${owner}/`)) continue; // a module's own internals
      if (!owner && target.startsWith('baseline/')) continue;        // baseline's own files
      if (target.startsWith('modules/')) {
        const other = target.split('/')[1];
        const bad = surfaceViolation(target, other, fromTest);
        if (bad) {
          errors.push(`${where}: ${bad}`);
          continue;
        }
      }
      if (!uses.has(owner)) uses.set(owner, new Map());
      const mine = /** @type {Map<string, string>} */ (uses.get(owner));
      if (!mine.has(target)) mine.set(target, where);
    }
  }
  return { uses, errors };
}

/**
 * @param {string} root
 * @param {Graph} graph
 * @returns {string[]}
 */
export function checkManifests(root, graph) {
  /** @type {string[]} */
  const errors = [];
  const modulesDir = path.join(root, 'modules');
  if (!fs.existsSync(modulesDir)) return errors;
  for (const m of fs.readdirSync(modulesDir, { withFileTypes: true })) {
    if (!m.isDirectory()) continue;
    const manifestPath = path.join(modulesDir, m.name, 'manifest.yaml');
    if (!fs.existsSync(manifestPath)) {
      errors.push(`modules/${m.name}: no manifest.yaml; the module declares no imports`);
      continue;
    }
    const manifest = parseManifest(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.module !== m.name) errors.push(`modules/${m.name}/manifest.yaml: module is ${JSON.stringify(manifest.module)}, not ${m.name}`);
    const declared = new Set(manifest.allowed_imports);
    const used = graph.uses.get(m.name) ?? new Map();
    const usedNames = new Map([...used].map(([target, where]) => [manifestName(target), where]));
    for (const [name, where] of [...usedNames].sort()) {
      if (!declared.has(name)) errors.push(`${where}: imports ${name}, which modules/${m.name}/manifest.yaml does not list`);
    }
    for (const name of [...declared].sort()) {
      if (!usedNames.has(name)) errors.push(`modules/${m.name}/manifest.yaml: declares ${name}, which no file in the module imports; the module map draws an edge that is not there`);
    }
  }
  return errors;
}

/**
 * @param {Graph} graph
 * @returns {string[]} cycles as `a -> b -> a`
 */
export function cycles(graph) {
  /** @type {Map<string, string[]>} */
  const edges = new Map();
  for (const [owner, targets] of graph.uses) {
    if (!owner) continue;
    edges.set(owner, [...new Set([...targets.keys()].filter((t) => t.startsWith('modules/')).map((t) => t.split('/')[1]))].sort());
  }
  /** @type {Set<string>} */
  const found = new Set();
  /** @type {string[]} */
  const trail = [];
  const onTrail = new Set();
  const done = new Set();
  /** @param {string} node */
  const walk = (node) => {
    trail.push(node);
    onTrail.add(node);
    for (const next of edges.get(node) ?? []) {
      if (onTrail.has(next)) found.add([...trail.slice(trail.indexOf(next)), next].join(' -> '));
      else if (!done.has(next)) walk(next);
    }
    trail.pop();
    onTrail.delete(node);
    done.add(node);
  };
  for (const m of [...edges.keys()].sort()) if (!done.has(m)) walk(m);
  return [...found].sort();
}

/**
 * @param {string} root
 * @returns {{ errors: string[], summary: string[] }}
 */
export function check(root) {
  const graph = collect(root);
  const errors = [...graph.errors, ...checkManifests(root, graph)];
  for (const [target, where] of [...(graph.uses.get(null) ?? new Map())].sort()) {
    if (target.startsWith('modules/') && where.startsWith('baseline/')) {
      errors.push(`baseline/: imports ${target} (${where}); baseline is the substrate every module inherits and cannot depend on one`);
    }
  }
  errors.push(...cycles(graph).map((c) => `circular dependency: ${c}; the decomposition is wrong, not the check`));
  const modulesDir = path.join(root, 'modules');
  const modules = fs.existsSync(modulesDir)
    ? fs.readdirSync(modulesDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
    : [];
  const summary = modules.map((m) => {
    const targets = [...(graph.uses.get(m) ?? new Map()).keys()].map(manifestName).sort();
    return `${m}  ${targets.length} import(s): ${targets.join(', ') || 'none'}`;
  });
  summary.push(errors.length
    ? `FAIL ${errors.length} boundary violation(s) across ${modules.length} module(s)`
    : `OK ${modules.length} module(s); the import graph matches the manifests and is acyclic`);
  return { errors, summary };
}

/**
 * @param {string[]} argv
 * @returns {number}
 */
export function main(argv) {
  const i = argv.indexOf('--root');
  const root = path.resolve(i >= 0 ? argv[i + 1] : DEFAULT_ROOT);
  const { errors, summary } = check(root);
  for (const line of summary.slice(0, -1)) console.log(line);
  for (const line of errors) console.log(`FAIL ${line}`);
  console.log(summary[summary.length - 1]);
  return errors.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
