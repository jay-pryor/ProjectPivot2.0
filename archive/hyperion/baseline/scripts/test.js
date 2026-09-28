#!/usr/bin/env node
/**
 * The project's test command (DEC-003): Node's built-in runner over every `*.test.js`
 * under baseline/tests, modules/<m>/conformance, modules/<m>/tests, and validation, with
 * the JUnit report written to trace/results.xml, which check_traces.py reads
 * (CORE-TRC-003, Results). Nothing is skipped or marked expected-to-fail here (IMP-15).
 *
 *     node baseline/scripts/test.js                 # the full suite
 *     node baseline/scripts/test.js --conformance   # modules/<m>/conformance only
 *     node baseline/scripts/test.js --validation    # validation only
 *
 * Exit 1 on any failing test, and on a run that found no test file: a run that matched
 * nothing passes vacuously and must not look green.
 */

import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { run } from 'node:test';
import { junit, spec } from 'node:test/reporters';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKIP = new Set(['node_modules', 'dist', '.git']);

/**
 * @param {string} dir absolute
 * @returns {string[]} absolute paths of every *.test.js below dir
 */
export function testFilesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  /** @type {string[]} */
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...testFilesUnder(full));
    else if (entry.isFile() && entry.name.endsWith('.test.js')) out.push(full);
  }
  return out.sort();
}

/**
 * @param {string} root
 * @param {'all' | 'conformance' | 'validation'} scope
 * @returns {string[]}
 */
export function selectFiles(root, scope) {
  const modules = fs.existsSync(path.join(root, 'modules'))
    ? fs.readdirSync(path.join(root, 'modules'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];
  /** @type {string[]} */
  const files = [];
  if (scope === 'all') files.push(...testFilesUnder(path.join(root, 'baseline', 'tests')));
  if (scope === 'all' || scope === 'conformance') {
    for (const m of modules) files.push(...testFilesUnder(path.join(root, 'modules', m, 'conformance')));
  }
  if (scope === 'all') {
    for (const m of modules) files.push(...testFilesUnder(path.join(root, 'modules', m, 'tests')));
  }
  if (scope === 'all' || scope === 'validation') files.push(...testFilesUnder(path.join(root, 'validation')));
  return files;
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>} exit code
 */
export async function main(argv) {
  const scope = argv.includes('--conformance') ? 'conformance' : argv.includes('--validation') ? 'validation' : 'all';
  const files = selectFiles(ROOT, scope);
  if (files.length === 0) {
    console.error(`FAIL no *.test.js found for scope ${scope}; a run that matches nothing is not a pass`);
    return 1;
  }
  const resultsPath = path.join(ROOT, 'trace', 'results.xml');
  fs.mkdirSync(path.dirname(resultsPath), { recursive: true });

  const source = run({ files, concurrency: 1 });
  let failed = 0;
  source.on('test:fail', () => { failed += 1; });
  const toFile = new PassThrough({ objectMode: true });
  const toConsole = new PassThrough({ objectMode: true });
  source.pipe(toFile);
  source.pipe(toConsole);
  const out = fs.createWriteStream(resultsPath);
  const written = new Promise((resolve, reject) => { out.on('finish', resolve); out.on('error', reject); });
  toFile.compose(junit).pipe(out);
  toConsole.compose(spec).pipe(process.stdout);
  await written;
  console.log(`${failed ? 'FAIL' : 'OK'} ${files.length} test file(s), ${failed} failing; report at ${path.relative(ROOT, resultsPath)}`);
  return failed ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
