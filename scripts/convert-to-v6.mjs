#!/usr/bin/env node
/**
 * Throwaway: converts a practice folder's data.json from schema 5 to 6 (reports as PDF and HTML).
 * Not part of the app; delete once nobody has schema 5 data.
 *
 *     node scripts/convert-to-v6.mjs <folder>     # keeps the old file as data.v5.json
 *
 * The report designer's formatting profiles become Styles (an old profile's paper, margins, sizes,
 * headings, tables, header and footer carried over; what only LaTeX understood dropped). Produced
 * reports lose their markdown and keep their HTML, which is what they download as from now on.
 * Backups in the folder stay schema 5.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seal, serialize } from '../src/storage/envelope.js';
import { fromProfile, isStyle, normaliseStyle } from '../DocGen/doc-style.js';

/** @param {any} body the data inside a schema 5 envelope */
export function convertBody(body) {
  const design = body.reportDesign ?? {};
  const reportDesign = Array.isArray(design.formats)
    ? { ...design, formats: design.formats.map((/** @type {any} */ f) => (isStyle(f) ? normaliseStyle(f).style : fromProfile(f))) }
    : design;
  const report = Object.fromEntries(Object.entries(body.records.report ?? {}).map(([id, r]) => {
    const { markdown: _md, ...rest } = /** @type {any} */ (r);
    return [id, rest];
  }));
  return { ...body, reportDesign, records: { ...body.records, report } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const folder = process.argv[2];
  if (!folder) {
    console.error('Usage: node scripts/convert-to-v6.mjs <folder>');
    process.exit(1);
  }
  const file = path.join(folder, 'data.json');
  const env = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (env.schemaVersion !== 5) {
    console.error(`data.json is schema ${env.schemaVersion}, not 5.`);
    process.exit(1);
  }
  fs.copyFileSync(file, path.join(folder, 'data.v5.json'));
  fs.writeFileSync(file, serialize(await seal('data', convertBody(env.body), env.stamp, env.writtenAt)));
  console.log(`Converted ${file} to schema 6 (the old copy is data.v5.json).`);
  // profiles.json is refused under any other schema too; its contents are unchanged, only resealed.
  const pfile = path.join(folder, 'profiles.json');
  if (fs.existsSync(pfile)) {
    const penv = JSON.parse(fs.readFileSync(pfile, 'utf8'));
    if (penv.schemaVersion === 5) {
      fs.copyFileSync(pfile, path.join(folder, 'profiles.v5.json'));
      fs.writeFileSync(pfile, serialize(await seal('profiles', penv.body, penv.stamp, penv.writtenAt)));
      console.log(`Resealed ${pfile} as schema 6 (the old copy is profiles.v5.json).`);
    }
  }
}
