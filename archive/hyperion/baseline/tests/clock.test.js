import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatTimestampAest, epochMsOf, nowAest, todayAest, fixClock, releaseClock, isClockFixed } from '../clock.js';
import { timestampAest } from '../types.js';

test('epoch 0 is 10:00 on 1 January 1970 in AEST', () => {
  assert.equal(formatTimestampAest(0), '1970-01-01T10:00:00+10:00');
});

test('format and parse round-trip at second resolution', () => {
  const ts = timestampAest('2026-09-14T18:19:51+10:00');
  assert.equal(formatTimestampAest(epochMsOf(ts)), ts);
  assert.equal(formatTimestampAest(epochMsOf(ts) + 999), ts); // milliseconds are dropped, never rounded up
});

test('a fixed clock is what every reader sees until released', () => {
  const held = timestampAest('2026-12-31T23:59:59+10:00');
  try {
    fixClock(held);
    assert.equal(isClockFixed(), true);
    assert.equal(nowAest(), held);
    assert.equal(todayAest(), '2026-12-31');
    fixClock(timestampAest('2027-01-01T00:00:00+10:00'));
    assert.equal(todayAest(), '2027-01-01');
  } finally {
    releaseClock();
  }
  assert.equal(isClockFixed(), false);
  const now = nowAest();
  assert.ok(Math.abs(epochMsOf(now) - Date.now()) < 5000, `released clock follows the machine, got ${now}`);
});
