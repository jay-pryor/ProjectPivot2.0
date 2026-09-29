import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PivotError } from '../../src/core/errors.js';
import { formatAest, epochOf, aestDate, compactStamp, toIsoUtc, fixedClock } from '../../src/core/time.js';
import { newId, hazardLabel, ids } from '../../src/core/ids.js';
import { canonicalJson, sameJson } from '../../src/core/json.js';

test('PivotError carries a code and details', () => {
  const e = new PivotError('empty', 'A title cannot be empty', { field: 'title' });
  assert.ok(e instanceof Error);
  assert.equal(e.name, 'PivotError');
  assert.equal(e.code, 'empty');
  assert.deepEqual(e.details, { field: 'title' });
});

test('formatAest shows an instant in AEST, UTC+10 with no daylight saving', () => {
  assert.equal(formatAest(Date.UTC(2026, 8, 28, 14, 0, 0)), '2026-09-29T00:00:00+10:00');
  assert.equal(formatAest(Date.UTC(2026, 0, 15, 3, 4, 5)), '2026-01-15T13:04:05+10:00');
});

test('epochOf reads an AEST timestamp back and refuses anything else', () => {
  assert.equal(epochOf('2026-09-29T00:00:00+10:00'), Date.UTC(2026, 8, 28, 14));
  assert.throws(() => epochOf('2026-09-29T00:00:00Z'), RangeError);
});

test('aestDate, compactStamp and toIsoUtc', () => {
  assert.equal(aestDate('2026-09-29T00:30:00+10:00'), '2026-09-29');
  assert.equal(compactStamp('2026-09-29T08:07:06+10:00'), '20260929-080706');
  assert.equal(toIsoUtc('2026-09-29T00:00:00+10:00'), '2026-09-28T14:00:00.000Z');
});

test('fixedClock holds the time until advanced', () => {
  const c = fixedClock('2026-09-28T10:00:00+10:00');
  assert.equal(c.now(), '2026-09-28T10:00:00+10:00');
  c.advance(61_000);
  assert.equal(c.now(), '2026-09-28T10:01:01+10:00');
});

test('ids: uuids, link ids, and the hazard label', () => {
  assert.match(newId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(ids.hazardControl('h', 'c'), 'hc:h:c');
  assert.equal(ids.hazardPlatform('h', 'p'), 'hp:h:p');
  assert.equal(ids.ruling('h', 'c', 'p'), 'ru:h:c:p');
  assert.equal(ids.rating('h', 'p'), 'rt:h:p');
  assert.equal(hazardLabel({ number: 7 }), 'H-0007');
  assert.equal(hazardLabel({ number: 12345 }), 'H-12345');
  assert.equal(hazardLabel({ number: null }), 'TBC');
});

test('canonicalJson sorts keys at every level and keeps array order', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [2, 1], c: null } }), '{"a":{"c":null,"d":[2,1]},"b":1}');
  assert.ok(sameJson({ a: 1, b: 2 }, { b: 2, a: 1 }));
  assert.ok(sameJson(undefined, undefined));
  assert.ok(!sameJson(undefined, { a: 1 }));
});
