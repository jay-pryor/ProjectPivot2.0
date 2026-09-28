/**
 * The one source of "now", in AEST (ASM-005; docs/module-map.md "Baseline"). Every module
 * reads the time from here and never from `Date` directly, so a test can fix the clock and
 * a due date, an overdue flag, or a backup interval reads the same in every test run.
 *
 * AEST is UTC+10 with no daylight saving. The machine clock is assumed correct (ASM-005).
 */

import { dateAest, timestampAest } from './types.js';

/** @typedef {import('./types.js').DateAest} DateAest */
/** @typedef {import('./types.js').TimestampAest} TimestampAest */

export const AEST_OFFSET_MS = 10 * 60 * 60 * 1000;

/** @type {number | null} epoch milliseconds while a test holds the clock, else null */
let fixedEpochMs = null;

/**
 * @param {number} epochMs
 * @returns {TimestampAest}
 */
export function formatTimestampAest(epochMs) {
  if (!Number.isFinite(epochMs)) throw new RangeError(`epoch milliseconds must be finite, got ${String(epochMs)}`);
  const shifted = new Date(epochMs + AEST_OFFSET_MS).toISOString(); // e.g. 2026-09-14T18:19:51.398Z
  return timestampAest(`${shifted.slice(0, 19)}+10:00`);
}

/**
 * @param {TimestampAest} ts
 * @returns {number} epoch milliseconds
 */
export function epochMsOf(ts) {
  return Date.parse(timestampAest(ts));
}

/** @returns {TimestampAest} */
export function nowAest() {
  return formatTimestampAest(fixedEpochMs ?? Date.now());
}

/** @returns {DateAest} */
export function todayAest() {
  return dateAest(nowAest().slice(0, 10));
}

/**
 * Hold the clock at `ts` until `releaseClock()`. Test code only; a call from production
 * code is a defect. Calling it again moves the held clock.
 * @param {TimestampAest} ts
 */
export function fixClock(ts) {
  fixedEpochMs = epochMsOf(ts);
}

/** Let the clock follow the machine again. Call in a test's finally block. */
export function releaseClock() {
  fixedEpochMs = null;
}

/** @returns {boolean} whether a test currently holds the clock */
export function isClockFixed() {
  return fixedEpochMs !== null;
}
