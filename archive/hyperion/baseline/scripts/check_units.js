#!/usr/bin/env node
/**
 * Run the type check, and prove that it distinguishes units (CORE-CON-001, IMP-05), in the
 * CI position the framework's check_units.py occupies for Python (DEC-003). Two things
 * must hold, and a clean `tsc` run alone gives neither:
 *
 *   clean           tsc reports no error over baseline/tsconfig.json, and checked more
 *                   than zero project files; a run that matched nothing passes vacuously.
 *   discriminating  a probe synthesised from baseline/types.js alone is rejected: the base
 *                   type where a unit is expected, and one unit where another of the same
 *                   base is expected. A probe that type-checks means the brands are not
 *                   being enforced, whatever the clean run said.
 *
 * The probe is derived from the `@typedef {<base> & { readonly __unit: '<Name>' }} <Name>`
 * lines, never hand-written, so it cannot fall behind them. It is written into baseline/,
 * checked, and removed.
 *
 *     node baseline/scripts/check_units.js      # exit 1 when either half fails
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = path.resolve(HERE, '..');
const ROOT = path.resolve(BASELINE, '..');
const TSC = path.join(BASELINE, 'node_modules', 'typescript', 'bin', 'tsc');
const PROBE = path.join(BASELINE, '_units_probe.js');
const UNIT_RE = /@typedef \{(\w+) & \{ readonly __unit: '(\w+)' \}\} (\w+)/g;
const LITERALS = /** @type {Record<string, string>} */ ({ number: '1', string: '"x"', boolean: 'true' });

/**
 * @param {string} typesSource
 * @returns {{ name: string, base: string }[]}
 */
export function unitTypes(typesSource) {
  return [...typesSource.matchAll(UNIT_RE)].map((m) => ({ base: m[1], name: m[3] }));
}

/**
 * One line per probe; every line must produce a type error.
 * @param {{ name: string, base: string }[]} units
 * @returns {string[]}
 */
export function probeLines(units) {
  /** @type {string[]} */
  const lines = [];
  for (const u of units) {
    const literal = LITERALS[u.base];
    if (literal === undefined) continue;
    lines.push(`/** @type {import('./types.js').${u.name}} */ export const base_${u.name} = ${literal};`);
  }
  /** @type {Map<string, string[]>} */
  const byBase = new Map();
  for (const u of units) byBase.set(u.base, [...(byBase.get(u.base) ?? []), u.name]);
  for (const [base, names] of byBase) {
    const literal = LITERALS[base];
    if (literal === undefined) continue;
    for (let i = 0; i + 1 < names.length; i += 1) {
      lines.push(`/** @type {import('./types.js').${names[i]}} */ export const cross_${names[i]} = /** @type {import('./types.js').${names[i + 1]}} */ (${literal});`);
    }
  }
  return lines;
}

/**
 * @param {string[]} args
 * @returns {{ status: number, out: string }}
 */
function tsc(args) {
  const r = spawnSync(process.execPath, [TSC, '-p', path.join(BASELINE, 'tsconfig.json'), '--pretty', 'false', ...args], { cwd: ROOT, encoding: 'utf8' });
  return { status: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/** @returns {number} exit code */
export function main() {
  if (!fs.existsSync(TSC)) {
    console.error(`FAIL ${path.relative(ROOT, TSC)} is not installed; run \`npm ci\` in baseline/`);
    return 1;
  }
  if (fs.existsSync(PROBE)) fs.unlinkSync(PROBE); // a leftover from a crashed run would pollute the clean half

  const listed = tsc(['--listFilesOnly']).out.split('\n').filter((l) => l.trim() && !l.includes(`${path.sep}node_modules${path.sep}`));
  const clean = tsc([]);
  if (clean.status !== 0) {
    console.log(clean.out.trim());
    console.log(`FAIL the type check reports errors over ${listed.length} file(s)`);
    return 1;
  }
  if (listed.length === 0) {
    console.log('FAIL the type check matched no project file; a run over nothing passes vacuously');
    return 1;
  }

  const units = unitTypes(fs.readFileSync(path.join(BASELINE, 'types.js'), 'utf8'));
  const lines = probeLines(units);
  if (lines.length === 0) {
    console.log('FAIL no unit type found in baseline/types.js to probe with');
    return 1;
  }
  fs.writeFileSync(PROBE, `${lines.join('\n')}\n`);
  /** @type {Set<number>} */
  let erroredLines;
  try {
    const probed = tsc([]);
    const probeRel = path.relative(ROOT, PROBE).split(path.sep).join('/');
    erroredLines = new Set(
      [...probed.out.matchAll(/^(.+?)\((\d+),\d+\): error TS\d+/gm)]
        .filter((m) => m[1].split(path.sep).join('/').endsWith(probeRel))
        .map((m) => Number(m[2])),
    );
    const foreign = [...probed.out.matchAll(/^(.+?)\(\d+,\d+\): error/gm)].filter((m) => !m[1].split(path.sep).join('/').endsWith(probeRel));
    if (foreign.length) {
      console.log(probed.out.trim());
      console.log('FAIL the probe produced errors outside itself');
      return 1;
    }
  } finally {
    fs.unlinkSync(PROBE);
  }
  const accepted = lines.map((l, i) => [i + 1, l]).filter(([n]) => !erroredLines.has(/** @type {number} */ (n)));
  if (accepted.length) {
    for (const [, l] of accepted) console.log(`ACCEPTED ${l}`);
    console.log(`FAIL ${accepted.length} of ${lines.length} unit confusion(s) type-check; the brands are not enforced`);
    return 1;
  }
  console.log(`OK type check clean over ${listed.length} file(s); ${units.length} unit type(s), ${lines.length} confusion(s) rejected`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
