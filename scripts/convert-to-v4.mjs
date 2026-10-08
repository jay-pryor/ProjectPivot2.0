#!/usr/bin/env node
/**
 * Throwaway: converts a practice folder's data.json from schema 3 to 4 (review rules). Not part
 * of the app; delete once nobody has schema 3 data.
 *
 *     node scripts/convert-to-v4.mjs <folder>     # keeps the old file as data.v3.json
 *
 * Backups in the folder stay schema 3, so they will not restore.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seal, serialize } from '../src/storage/envelope.js';
import { addMonths } from '../src/core/time.js';
import { dueOf } from '../src/core/schedule.js';

/**
 * Each platform's months and due date become a fixed rule counted from one period before the due
 * date. The date marked seen is the one Pivot will now calculate (a due date on a short month's
 * end can come out a day or so earlier), so no platform opens with a "review date moved" item.
 * @param {any} body the data inside a schema 3 envelope
 */
export function convertBody(body) {
  const platform = Object.fromEntries(Object.entries(body.records.platform ?? {}).map(([id, p]) => {
    const { reviewMonths, reviewDue, ...rest } = /** @type {any} */ (p);
    const scheduled = Number.isInteger(reviewMonths) && typeof reviewDue === 'string';
    return [id, {
      ...rest,
      reviewRule: scheduled ? { kind: 'fixed', months: reviewMonths } : null,
      reviewStart: scheduled ? addMonths(reviewDue, -reviewMonths) : null,
    }];
  }));
  const out = { ...body, records: { ...body.records, platform, reviewPolicy: body.records.reviewPolicy ?? {}, reviewSeen: {} } };
  for (const p of Object.values(platform)) {
    const due = dueOf(out, p.id);
    if (due) out.records.reviewSeen[p.id] = { id: p.id, status: 'live', createdBy: p.updatedBy, createdAt: p.updatedAt, updatedBy: p.updatedBy, updatedAt: p.updatedAt, platformId: p.id, due };
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const folder = process.argv[2];
  if (!folder) {
    console.error('Usage: node scripts/convert-to-v4.mjs <folder>');
    process.exit(1);
  }
  const file = path.join(folder, 'data.json');
  const env = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (env.schemaVersion !== 3) {
    console.error(`data.json is schema ${env.schemaVersion}, not 3.`);
    process.exit(1);
  }
  fs.copyFileSync(file, path.join(folder, 'data.v3.json'));
  const sealed = await seal('data', convertBody(env.body), env.stamp, env.writtenAt);
  fs.writeFileSync(file, serialize(sealed));
  console.log(`Converted ${file} to schema 4 (the old copy is data.v3.json).`);
}
