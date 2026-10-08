#!/usr/bin/env node
/**
 * Throwaway: converts a practice folder's data.json from schema 4 to 5 (workflows). Not part of
 * the app; delete once nobody has schema 4 data.
 *
 *     node scripts/convert-to-v5.mjs <folder>     # keeps the old file as data.v4.json
 *
 * Open reviews are dropped (start them again as workflows); completed reviews are kept, marked as
 * recorded before workflows; review rows are dropped. Backups in the folder stay schema 4.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seal, serialize } from '../src/storage/envelope.js';

/** @param {any} body the data inside a schema 4 envelope */
export function convertBody(body) {
  const { reviewRow: _rows, ...records } = body.records;
  const review = Object.fromEntries(Object.entries(records.review ?? {})
    .filter(([, r]) => /** @type {any} */ (r).state === 'completed')
    .map(([id, r]) => [id, { ...r, workflowId: null }]));
  return { ...body, records: { ...records, review, workflow: {}, workflowStep: {} }, nextWorkflowNumber: 1 };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const folder = process.argv[2];
  if (!folder) {
    console.error('Usage: node scripts/convert-to-v5.mjs <folder>');
    process.exit(1);
  }
  const file = path.join(folder, 'data.json');
  const env = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (env.schemaVersion !== 4) {
    console.error(`data.json is schema ${env.schemaVersion}, not 4.`);
    process.exit(1);
  }
  fs.copyFileSync(file, path.join(folder, 'data.v4.json'));
  fs.writeFileSync(file, serialize(await seal('data', convertBody(env.body), env.stamp, env.writtenAt)));
  console.log(`Converted ${file} to schema 5 (the old copy is data.v4.json).`);
  // profiles.json is refused under any other schema too; its contents are unchanged, only resealed.
  const pfile = path.join(folder, 'profiles.json');
  if (fs.existsSync(pfile)) {
    const penv = JSON.parse(fs.readFileSync(pfile, 'utf8'));
    if (penv.schemaVersion === 4) {
      fs.copyFileSync(pfile, path.join(folder, 'profiles.v4.json'));
      fs.writeFileSync(pfile, serialize(await seal('profiles', penv.body, penv.stamp, penv.writtenAt)));
      console.log(`Resealed ${pfile} as schema 5 (the old copy is profiles.v4.json).`);
    }
  }
}
