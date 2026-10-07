import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_VERSION } from '../../src/core/data.js';
import { seal, serialize, openEnvelope, newStamp, sameStamp, backupName, backupTime, BACKUP_RE, supersededName, sha256Hex } from '../../src/storage/envelope.js';
import { epochOf } from '../../src/core/time.js';

const at = '2026-09-28T10:00:00+10:00';

test('seal then open gives the body back', async () => {
  const stamp = newStamp('u1', at);
  const text = serialize(await seal('data', { b: 1, a: [2, 1] }, stamp, at));
  const opened = await openEnvelope(text, 'data');
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.envelope.body, { b: 1, a: [2, 1] });
  assert.deepEqual(opened.envelope.stamp, stamp);
  assert.equal(opened.envelope.schemaVersion, SCHEMA_VERSION);
});

test('a file changed outside Pivot fails its integrity check', async () => {
  const text = serialize(await seal('data', { title: 'Fire' }, null, at));
  const opened = await openEnvelope(text.replace('Fire', 'Flood'), 'data');
  assert.deepEqual([opened.ok, opened.reason], [false, 'integrity']);
});

test('every other bad file is named for what is wrong with it', async () => {
  assert.equal((await openEnvelope('{not json', 'data')).reason, 'unreadable');
  assert.equal((await openEnvelope('{"hello":1}', 'data')).reason, 'not-pivot');
  const profiles = serialize(await seal('profiles', { profiles: {} }, null, at));
  assert.equal((await openEnvelope(profiles, 'data')).reason, 'wrong-kind');
  const old = JSON.parse(serialize(await seal('data', {}, null, at)));
  old.schemaVersion = SCHEMA_VERSION - 1;
  const r = await openEnvelope(JSON.stringify(old), 'data');
  assert.equal(r.reason, 'wrong-version');
  assert.match(r.detail, /earlier Pivot/);
  old.schemaVersion = SCHEMA_VERSION + 1;
  assert.match((await openEnvelope(JSON.stringify(old), 'data')).detail, /newer Pivot/);
});

test('stamps: fresh token each time; compared by all three parts', () => {
  const a = newStamp('u1', at);
  const b = newStamp('u1', at);
  assert.match(a.token, /^[0-9a-f]{32}$/);
  assert.notEqual(a.token, b.token);
  assert.ok(sameStamp(a, { ...a }));
  assert.ok(!sameStamp(a, b));
  assert.ok(sameStamp(null, null));
  assert.ok(!sameStamp(a, null));
});

test('file names sort by time and are legal on Windows', () => {
  assert.equal(backupName(at), 'data-20260928-100000.json');
  assert.ok(BACKUP_RE.test(backupName(at)));
  assert.equal(backupTime('data-20260928-100000.json'), epochOf(at));
  const s = { savedBy: 'u1', savedAt: at, token: 'abcdef0123456789abcdef0123456789' };
  assert.equal(supersededName(s), 'data-20260928-100000-abcdef01.json');
});

test('sha256Hex', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
