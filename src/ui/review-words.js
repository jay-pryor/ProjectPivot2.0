import { get } from '../core/data.js';
import { hazardLabel } from '../core/ids.js';
import { periodWord } from './names.js';

/** @typedef {import('../core/data.js').Data} Data */

/**
 * How a platform's reviews are scheduled, and what sets the period, in a few words. Kept apart
 * from the screens so the Reviews tab, the platform page, Home and the pop-up can all use them
 * without importing each other.
 */

/** How a platform is scheduled. @param {Data} data @param {any} p */
export function ruleWord(data, p) {
  const r = p.reviewRule;
  if (r?.kind === 'fixed') return `Fixed · ${periodWord(r.months)}`;
  if (r?.kind === 'policy') {
    const pol = get(data, 'reviewPolicy', r.policyId);
    return pol && pol.status === 'live' ? `${pol.name} (policy)` : 'Policy missing';
  }
  return 'None';
}

/** What sets a policy's period; nothing for a fixed rule. @param {Data} data @param {any} driver from periodOf */
export function driverWord(data, driver) {
  if (driver?.kind === 'longest') return 'Policy’s longest period';
  if (driver?.kind !== 'hazard') return '';
  const h = get(data, 'hazard', driver.hazardId);
  return `${h ? hazardLabel(h) : 'A hazard'} residual ${driver.receptor}: ${driver.band}`;
}
