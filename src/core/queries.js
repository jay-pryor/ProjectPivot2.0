import { live } from './data.js';

/** @typedef {import('./data.js').Data} Data */

/** @param {string[]} xs */
function sortedUnique(xs) {
  return [...new Set(xs)].sort();
}

/** @param {Data} data @param {string} hazardId @returns {string[]} */
export function platformsOfHazard(data, hazardId) {
  return sortedUnique(live(data, 'hazardPlatform').filter((l) => l.hazardId === hazardId).map((l) => l.platformId));
}

/**
 * Every platform a record reaches through the live links: the list an edit is warned about
 * and (in release 2) queued for acknowledgement on.
 * @param {Data} data @param {string} kind @param {Record<string, any>} rec
 * @returns {string[]}
 */
export function platformsReached(data, kind, rec) {
  switch (kind) {
    case 'hazard': return platformsOfHazard(data, rec.id);
    case 'causalFactor':
    case 'consequence':
    case 'hazardControl': return platformsOfHazard(data, rec.hazardId);
    case 'control':
      return sortedUnique(live(data, 'hazardControl').filter((l) => l.controlId === rec.id).flatMap((l) => platformsOfHazard(data, l.hazardId)));
    case 'platform': return [rec.id];
    case 'hazardPlatform':
    case 'ruling':
    case 'rating':
    case 'report': return [rec.platformId];
    default: return [];
  }
}
