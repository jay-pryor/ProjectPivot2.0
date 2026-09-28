import { get, live } from './data.js';
import { ids, hazardLabel } from './ids.js';

/** @typedef {import('./data.js').Data} Data */
/** @typedef {{ rule: string, message: string, records: { kind: string, id: string }[] }} Violation */

/**
 * The rules that span records. Every op keeps them; the merge re-checks them, because two
 * users' changes that were each fine can break one together.
 * @param {Data} data
 * @returns {Violation[]}
 */
export function checkRules(data) {
  /** @type {Violation[]} */
  const out = [];
  /** @param {string} kind @param {string} id */
  const liveRec = (kind, id) => {
    const r = get(data, kind, id);
    return r && r.status === 'live' ? r : null;
  };
  const gone = (/** @type {any} */ r) => !r || r.status === 'deleted';

  for (const l of live(data, 'hazardPlatform')) {
    const h = get(data, 'hazard', l.hazardId);
    const p = get(data, 'platform', l.platformId);
    if (!h || h.status !== 'live') {
      out.push({ rule: 'hazard-not-live-on-platform', message: `${h ? hazardLabel(h) : l.hazardId} is on a platform but is not live.`, records: [{ kind: 'hazard', id: l.hazardId }, { kind: 'hazardPlatform', id: l.id }] });
    }
    if (gone(p)) {
      out.push({ rule: 'platform-deleted', message: 'A hazard is linked to a deleted platform.', records: [{ kind: 'platform', id: l.platformId }, { kind: 'hazardPlatform', id: l.id }] });
    }
  }
  for (const l of live(data, 'hazardControl')) {
    if (gone(get(data, 'hazard', l.hazardId))) {
      out.push({ rule: 'parent-deleted', message: 'A control is linked to a deleted hazard.', records: [{ kind: 'hazard', id: l.hazardId }, { kind: 'hazardControl', id: l.id }] });
    }
    if (gone(get(data, 'control', l.controlId))) {
      out.push({ rule: 'control-deleted', message: 'A deleted control is still linked to a hazard.', records: [{ kind: 'control', id: l.controlId }, { kind: 'hazardControl', id: l.id }] });
    }
  }
  for (const kind of ['causalFactor', 'consequence']) {
    for (const r of live(data, kind)) {
      if (gone(get(data, 'hazard', r.hazardId))) {
        out.push({ rule: 'parent-deleted', message: `A ${kind === 'causalFactor' ? 'causal factor' : 'consequence'} belongs to a deleted hazard.`, records: [{ kind: 'hazard', id: r.hazardId }, { kind, id: r.id }] });
      }
    }
  }
  for (const r of live(data, 'ruling')) {
    const hc = ids.hazardControl(r.hazardId, r.controlId);
    const hp = ids.hazardPlatform(r.hazardId, r.platformId);
    if (!liveRec('hazardControl', hc)) out.push({ rule: 'ruling-without-control-link', message: 'A control is ruled on for a hazard it is not linked to.', records: [{ kind: 'ruling', id: r.id }, { kind: 'hazardControl', id: hc }] });
    if (!liveRec('hazardPlatform', hp)) out.push({ rule: 'ruling-without-platform-link', message: 'A control is ruled on for a platform the hazard is not on.', records: [{ kind: 'ruling', id: r.id }, { kind: 'hazardPlatform', id: hp }] });
    if (r.state === 'excluded' && !String(r.reason ?? '').trim()) out.push({ rule: 'exclusion-without-reason', message: 'A control is excluded with no reason.', records: [{ kind: 'ruling', id: r.id }] });
  }
  for (const r of live(data, 'rating')) {
    const hp = ids.hazardPlatform(r.hazardId, r.platformId);
    if (!liveRec('hazardPlatform', hp)) out.push({ rule: 'rating-without-platform-link', message: 'A rating exists for a platform the hazard is not on.', records: [{ kind: 'rating', id: r.id }, { kind: 'hazardPlatform', id: hp }] });
  }
  return out;
}
