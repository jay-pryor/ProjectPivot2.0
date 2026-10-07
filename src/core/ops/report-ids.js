import { all, put } from '../data.js';
import { hazardLabel, ids, UNNUMBERED } from '../ids.js';

/** @typedef {import('../data.js').Data} Data */
/** @typedef {import('../data.js').Rec} Rec */
/** @typedef {{ letter: string, n: number }} ReportNo */

const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * A hazard's platform letter from its place in the order linked, from 0: A to Z, then BA, BB…
 * (counting in letters, A as nought), so there is always another and none is ever used twice.
 * @param {number} i
 */
export function platformLetter(i) {
  return i < 26 ? ABC[i] : platformLetter(Math.floor(i / 26)) + ABC[i % 26];
}

/** A platform letter's place in the order: A is 0, Z 25, BA 26. @param {string} letter */
export function letterIndex(letter) {
  return [...String(letter)].reduce((n, ch) => n * 26 + ABC.indexOf(ch), 0);
}

/** @param {Rec} rec @returns {ReportNo[]} */
const issuedOf = (rec) => (Array.isArray(rec.reportNos) ? rec.reportNos : []);

/** In the order made: by time, then the order added (safety reports keep it), then id. @param {Rec} a @param {Rec} b */
const byCreated = (a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || (a.seq ?? 0) - (b.seq ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Give each of a hazard's platforms its letter, in the order they were linked to it: the first A,
 * the next B. A platform keeps its letter for good, even taken off the hazard, so no letter is ever
 * given to another. Run at save time, after the merge, as numbers are.
 * @param {Data} data @returns {Data}
 */
export function assignPlatformLetters(data) {
  let d = data;
  /** @type {Map<string, Rec[]>} */
  const byHazard = new Map();
  for (const l of all(d, 'hazardPlatform')) byHazard.set(l.hazardId, [...(byHazard.get(l.hazardId) ?? []), l]);
  for (const links of byHazard.values()) {
    const fresh = links.filter((l) => !l.letter && l.status !== 'deleted').sort(byCreated);
    if (!fresh.length) continue;
    let next = Math.max(-1, ...links.filter((l) => l.letter).map((l) => letterIndex(l.letter))) + 1;
    for (const l of fresh) d = put(d, 'hazardPlatform', { ...l, letter: platformLetter(next++) });
  }
  return d;
}

/**
 * Give each safety report that needs one its Report ID: one with none, or one moved to a platform
 * whose letter is not its ID's. Its number is the next for its hazard and platform letter, counting
 * every ID ever given there, deleted reports' and moved ones' too, so none is ever used twice. An
 * ID once given never changes; a moved report's old one stays with it as retired. Run at save time,
 * after platform letters.
 * @param {Data} data @returns {Data}
 */
export function assignReportIds(data) {
  let d = data;
  const reports = all(d, 'safetyReport');
  for (const r of reports.filter((x) => x.status !== 'deleted').sort(byCreated)) {
    const letter = d.records.hazardPlatform?.[ids.hazardPlatform(r.hazardId, r.platformId)]?.letter;
    if (!letter) continue;
    const cur = issuedOf(r).at(-1);
    if (cur && cur.letter === letter) continue;
    const used = all(d, 'safetyReport').filter((x) => x.hazardId === r.hazardId)
      .flatMap((x) => issuedOf(x)).filter((x) => x.letter === letter).map((x) => x.n);
    d = put(d, 'safetyReport', { ...d.records.safetyReport[r.id], reportNos: [...issuedOf(r), { letter, n: Math.max(0, ...used) + 1 }] });
  }
  return d;
}

/**
 * A safety report's Report ID as it reads, e.g. HAZ-005-B-8, and the IDs it had before a move.
 * TBC until it is given one at the next save (also straight after a move), or while its hazard has
 * no number yet.
 * @param {Data} data @param {Rec} r
 * @returns {{ id: string, past: string[] }}
 */
export function safetyReportId(data, r) {
  const h = data.records.hazard?.[r.hazardId];
  const label = h ? hazardLabel(h) : UNNUMBERED;
  const issued = issuedOf(r);
  const letter = data.records.hazardPlatform?.[ids.hazardPlatform(r.hazardId, r.platformId)]?.letter;
  const cur = issued.at(-1);
  const current = cur && cur.letter === letter && label !== UNNUMBERED ? cur : null;
  const text = (/** @type {ReportNo} */ x) => `${label}-${x.letter}-${x.n}`;
  return { id: current ? text(current) : UNNUMBERED, past: (current ? issued.slice(0, -1) : issued).map(text) };
}
