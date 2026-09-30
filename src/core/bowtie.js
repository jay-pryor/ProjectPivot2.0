import { PivotError } from './errors.js';
import { get, live, isObject } from './data.js';
import { hazardLabel, ids, UNNUMBERED } from './ids.js';
import { controlsOnPlatform, existingControlsOn } from './queries.js';
import { CONTROL_STATUSES } from './ops/assessment.js';

/** @typedef {import('./data.js').Data} Data */
/** @typedef {import('./data.js').Rec} Rec */
/** @typedef {{ set: string, statuses: string[] }} Filters */
/** @typedef {{ control: Rec, kind: string, source: 'existing' | 'additional', state: string | null, line: string }} Item */
/**
 * @typedef {{ ok: true, hazard: Rec, platform: Rec, filters: Filters, caption: string,
 *   causalFactors: Rec[], consequences: Rec[], preventative: Item[], mitigating: Item[] }} Bowtie
 */
/** @typedef {{ ok: false, reason: 'hazard-gone' | 'hazard-retired' | 'platform-gone' | 'not-on-platform', message: string }} Cannot */

/** Which controls a diagram draws: those already in place, the additional ones, or both. */
export const SETS = Object.freeze(['existing', 'additional', 'all']);

export const SET_WORD = Object.freeze({ existing: 'Existing', additional: 'Additional', all: 'All' });
export const STATUS_WORD = Object.freeze({ recommended: 'Recommended', planned: 'Planned', implemented: 'Implemented', rejected: 'Rejected' });

/** Existing and additional controls, rejected ones hidden. */
export const DEFAULT_FILTERS = Object.freeze({ set: 'all', statuses: Object.freeze(['recommended', 'planned', 'implemented']) });

/**
 * Filters as they are kept, whatever was read: an unknown set or a missing list becomes the
 * default's, unknown statuses are dropped, and the rest are in the statuses' own order.
 * @param {unknown} f @returns {Filters}
 */
export function normalizeFilters(f) {
  const set = isObject(f) && SETS.includes(f.set) ? f.set : DEFAULT_FILTERS.set;
  const statuses = isObject(f) && Array.isArray(f.statuses)
    ? CONTROL_STATUSES.filter((s) => f.statuses.includes(s))
    : [...DEFAULT_FILTERS.statuses];
  return { set, statuses };
}

/** Filters an op is asked to store, refused when they are not filters. @param {unknown} f @returns {Filters} */
export function needFilters(f) {
  if (!isObject(f) || !SETS.includes(f.set)) {
    throw new PivotError('bowtie.filters', 'A bow-tie shows existing controls, additional controls, or all.');
  }
  if (!Array.isArray(f.statuses) || f.statuses.some((s) => !CONTROL_STATUSES.includes(s))) {
    throw new PivotError('bowtie.filters', `A bow-tie's statuses are among ${CONTROL_STATUSES.join(', ')}.`);
  }
  return normalizeFilters(f);
}

/** @param {unknown} a @param {unknown} b */
export function sameFilters(a, b) {
  const x = normalizeFilters(a);
  const y = normalizeFilters(b);
  return x.set === y.set && x.statuses.join('|') === y.statuses.join('|');
}

/** The filters in words, for the caption: e.g. "Existing + Additional (Planned, Implemented)". @param {unknown} f */
export function filterWords(f) {
  const { set, statuses } = normalizeFilters(f);
  const additional = `Additional (${statuses.length ? statuses.map((s) => STATUS_WORD[/** @type {keyof typeof STATUS_WORD} */ (s)]).join(', ') : 'none'})`;
  if (set === 'existing') return 'Existing';
  if (set === 'additional') return additional;
  return `Existing + ${additional}`;
}

/** "H-0001 Fire", or just the title until the hazard is numbered. @param {Rec} h */
export function hazardName(h) {
  const label = hazardLabel(h);
  return label === UNNUMBERED ? String(h.title) : `${label} ${h.title}`;
}

/**
 * What the bow-tie of a hazard on a platform holds under these filters, read from the data every
 * time; or why it cannot be drawn.
 * @param {Data} data @param {string} hazardId @param {string} platformId @param {unknown} filters
 * @returns {Bowtie | Cannot}
 */
export function bowtieOf(data, hazardId, platformId, filters) {
  const f = normalizeFilters(filters);
  const hazard = get(data, 'hazard', hazardId);
  if (!hazard || hazard.status === 'deleted') return { ok: false, reason: 'hazard-gone', message: 'The hazard in this view has been deleted.' };
  if (hazard.status === 'retired') return { ok: false, reason: 'hazard-retired', message: `${hazardName(hazard)} is retired.` };
  const platform = get(data, 'platform', platformId);
  if (!platform || platform.status === 'deleted') return { ok: false, reason: 'platform-gone', message: 'The platform in this view has been deleted.' };
  const link = get(data, 'hazardPlatform', ids.hazardPlatform(hazardId, platformId));
  if (!link || link.status !== 'live') return { ok: false, reason: 'not-on-platform', message: `${hazardName(hazard)} is no longer on ${platform.name}.` };
  /** @type {Item[]} */
  const existing = f.set === 'additional' ? [] : existingControlsOn(data, hazardId, platformId).map((x) => ({
    control: x.control, kind: x.kind, source: 'existing', state: null,
    line: x.control.tier ? `Existing · ${x.control.tier}` : 'Existing',
  }));
  /** @type {Item[]} */
  const additional = f.set === 'existing' ? [] : controlsOnPlatform(data, hazardId, platformId)
    .filter((x) => f.statuses.includes(x.state))
    .map((x) => ({
      control: x.control, kind: /** @type {string} */ (x.kind), source: 'additional', state: x.state,
      line: `Additional · ${STATUS_WORD[/** @type {keyof typeof STATUS_WORD} */ (x.state)]}`,
    }));
  const items = [...existing, ...additional];
  return {
    ok: true, hazard, platform, filters: f, caption: `${platform.name} · ${filterWords(f)}`,
    causalFactors: live(data, 'causalFactor').filter((r) => r.hazardId === hazardId),
    consequences: live(data, 'consequence').filter((r) => r.hazardId === hazardId),
    preventative: items.filter((i) => i.kind === 'preventative'),
    mitigating: items.filter((i) => i.kind === 'mitigating'),
  };
}
