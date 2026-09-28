import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SCHEMA_VERSION, DATA_FOLDER, BACKUP_RING_SIZE, BACKUP_INTERVAL_MS,
  canonicalJson, digestSha256Hex, freshStamp, sameStamp, seal, serialize, open,
  emptyDataBody, compactTimestamp, backupFileName, supersededFileName, BACKUP_FILE_RE,
} from '../schema.js';
import { fixClock, releaseClock } from '../clock.js';
import { timestampAest, userProfileId } from '../types.js';

const AT = timestampAest('2026-09-14T18:19:51+10:00');
const PROFILE = userProfileId.fresh();

test('the folder layout and limits are the requirements', () => {
  assert.equal(DATA_FOLDER.supersededSaves, 'Superseded Saves'); // REQ-014 names it
  assert.equal(BACKUP_RING_SIZE, 72);                            // REQ-063
  assert.equal(BACKUP_INTERVAL_MS, 3_600_000);                   // REQ-062
  assert.equal(SCHEMA_VERSION, 1);
});

test('canonical JSON sorts keys at every level and keeps array order', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [3, 1, 2], c: null } }), '{"a":{"c":null,"d":[3,1,2]},"b":1}');
  assert.equal(canonicalJson({ a: 1, b: 2 }), canonicalJson({ b: 2, a: 1 }));
});

test('SHA-256 matches the known digest of an empty string', async () => {
  assert.equal(await digestSha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('a fresh stamp names the saver, the fixed time, and a unique token', () => {
  fixClock(AT);
  try {
    const a = freshStamp(PROFILE);
    const b = freshStamp(PROFILE);
    assert.equal(a.savedByProfileId, PROFILE);
    assert.equal(a.savedAtAest, AT);
    assert.match(a.token, /^[0-9a-f]{32}$/);
    assert.notEqual(a.token, b.token);
    assert.equal(sameStamp(a, a), true);
    assert.equal(sameStamp(a, b), false);
    assert.equal(sameStamp(null, null), true);
    assert.equal(sameStamp(a, null), false);
  } finally {
    releaseClock();
  }
});

test('seal then open round-trips, and a data file needs a stamp', async () => {
  fixClock(AT);
  try {
    const body = emptyDataBody();
    const env = await seal('data', body, freshStamp(PROFILE));
    assert.equal(env.pivot, 'pivot');
    assert.equal(env.schemaVersion, SCHEMA_VERSION);
    assert.equal(env.writtenAtAest, AT);
    const result = await open(serialize(env));
    assert.ok(result.ok);
    assert.deepEqual(result.envelope.body, body);
    await assert.rejects(() => seal('data', body, null), TypeError);
    const profiles = await seal('profiles', { profiles: {} }, null);
    assert.equal(profiles.stamp, null);
  } finally {
    releaseClock();
  }
});

test('open names each way a file can be wrong instead of throwing', async () => {
  const env = await seal('data', emptyDataBody(), freshStamp(PROFILE));

  const unreadable = await open('{not json');
  assert.deepEqual(unreadable.ok, false);
  assert.equal(!unreadable.ok && unreadable.reason, 'unreadable');

  const stray = await open(JSON.stringify({ hello: 'world' }));
  assert.equal(!stray.ok && stray.reason, 'not-a-pivot-file');

  const newer = await open(serialize({ ...env, schemaVersion: SCHEMA_VERSION + 1 }));
  assert.equal(!newer.ok && newer.reason, 'newer-schema');

  const tampered = await open(serialize({ ...env, body: { ...env.body, sequences: { hazard: 99 } } }));
  assert.equal(!tampered.ok && tampered.reason, 'integrity-failed');

  const stripped = await open(JSON.stringify({ ...env, integrity: undefined }));
  assert.equal(!stripped.ok && stripped.reason, 'integrity-failed');

  const reordered = JSON.stringify({ body: env.body, integrity: env.integrity, stamp: env.stamp, writtenAtAest: env.writtenAtAest, kind: env.kind, schemaVersion: env.schemaVersion, pivot: env.pivot });
  const ok = await open(reordered);
  assert.equal(ok.ok, true, 'key order is not content');
});

test('file names sort by time and are legal on Windows', () => {
  assert.equal(compactTimestamp(AT), '20260914-181951');
  assert.equal(backupFileName(AT), 'data-20260914-181951.json');
  assert.match(backupFileName(AT), BACKUP_FILE_RE);
  assert.doesNotMatch('data.json', BACKUP_FILE_RE);
  const later = backupFileName(timestampAest('2026-09-14T18:19:52+10:00'));
  assert.ok(backupFileName(AT) < later);
  fixClock(AT);
  try {
    const stamp = freshStamp(PROFILE);
    const name = supersededFileName(stamp);
    assert.equal(name, `data-20260914-181951-${stamp.token.slice(0, 8)}.json`);
    assert.doesNotMatch(name, /[:<>"|?*]/);
  } finally {
    releaseClock();
  }
});
