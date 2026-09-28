/** AEST is UTC+10 with no daylight saving; every time Pivot stores is written in it. */
const OFFSET_MS = 10 * 60 * 60 * 1000;
const TS_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\+10:00$/;

/** @typedef {{ now: () => string }} Clock */

/** @param {number} epochMs @returns {string} `YYYY-MM-DDTHH:mm:ss+10:00` */
export function formatAest(epochMs) {
  return `${new Date(epochMs + OFFSET_MS).toISOString().slice(0, 19)}+10:00`;
}

/** @param {string} ts @returns {number} */
export function epochOf(ts) {
  if (typeof ts !== 'string' || !TS_RE.test(ts)) throw new RangeError(`not an AEST timestamp: ${String(ts)}`);
  return Date.parse(ts);
}

/** @param {string} ts @returns {string} `YYYY-MM-DD` */
export function aestDate(ts) {
  epochOf(ts);
  return ts.slice(0, 10);
}

/** @param {string} ts @returns {string} `YYYYMMDD-HHMMSS`, safe in a Windows file name */
export function compactStamp(ts) {
  const m = TS_RE.exec(ts);
  if (!m) throw new RangeError(`not an AEST timestamp: ${String(ts)}`);
  return `${m[1]}${m[2]}${m[3]}-${m[4]}${m[5]}${m[6]}`;
}

/** @param {string} ts @returns {string} the same instant as an ISO UTC string (DocGen's clock format) */
export function toIsoUtc(ts) {
  return new Date(epochOf(ts)).toISOString();
}

/** @type {Clock} */
export const systemClock = { now: () => formatAest(Date.now()) };

/** A clock for tests: holds `start` until advanced. @param {string} start */
export function fixedClock(start) {
  let t = epochOf(start);
  return {
    now: () => formatAest(t),
    /** @param {number} ms */
    advance(ms) { t += ms; },
  };
}
