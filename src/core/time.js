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

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** @param {unknown} s @returns {boolean} whether `s` is a real calendar date `YYYY-MM-DD` */
export function isDate(s) {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** @param {string} date @returns {[number, number, number]} */
function dateParts(date) {
  if (!isDate(date)) throw new RangeError(`not a date: ${String(date)}`);
  const [y, m, d] = date.split('-').map(Number);
  return [y, m, d];
}

/** @param {number} y @param {number} m 1-12 @param {number} d */
const dateOf = (y, m, d) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** @param {string} date `YYYY-MM-DD` @param {number} n @returns {string} */
export function addDays(date, n) {
  const [y, m, d] = dateParts(date);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * Calendar months. A day the target month lacks becomes its last day, and the day does not come
 * back later: 31 Jan + 1 = 28 Feb, and 28 Feb + 1 = 28 Mar.
 * @param {string} date `YYYY-MM-DD` @param {number} n @returns {string}
 */
export function addMonths(date, n) {
  const [y, m, d] = dateParts(date);
  const total = y * 12 + (m - 1) + n;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return dateOf(ty, tm, Math.min(d, last));
}

/** A review is "due soon" when its date is this many days away or fewer. */
export const DUE_SOON_DAYS = 30;

/**
 * @param {{ reviewMonths?: number | null, reviewDue?: string | null }} platform
 * @param {string} today `YYYY-MM-DD`, AEST
 * @returns {'none' | 'ok' | 'dueSoon' | 'overdue'}
 */
export function reviewState(platform, today) {
  const due = platform.reviewDue;
  if (!platform.reviewMonths || !due) return 'none';
  if (today > due) return 'overdue';
  if (due <= addDays(today, DUE_SOON_DAYS)) return 'dueSoon';
  return 'ok';
}
