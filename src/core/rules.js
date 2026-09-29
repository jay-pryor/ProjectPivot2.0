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
    if (r.state === 'rejected' && !String(r.reason ?? '').trim()) out.push({ rule: 'rejection-without-reason', message: 'A control is rejected with no reason.', records: [{ kind: 'ruling', id: r.id }] });
  }
  for (const kind of ['rating', 'assessment', 'sfarp']) {
    for (const r of live(data, kind)) {
      const hp = ids.hazardPlatform(r.hazardId, r.platformId);
      if (!liveRec('hazardPlatform', hp)) out.push({ rule: `${kind}-without-platform-link`, message: `A ${kind === 'sfarp' ? 'SFARP record' : 'risk assessment'} exists for a platform the hazard is not on.`, records: [{ kind, id: r.id }, { kind: 'hazardPlatform', id: hp }] });
    }
  }
  // Reviews: an open review needs a live platform, and there is one at a time per platform.
  /** @type {Map<string, any>} */
  const openOn = new Map();
  for (const r of live(data, 'review')) {
    if (r.state !== 'open') continue;
    const p = get(data, 'platform', r.platformId);
    if (!p || p.status !== 'live') {
      out.push({ rule: 'review-on-platform-not-live', message: 'A review is in progress on a platform that is not live.', records: [{ kind: 'review', id: r.id }, { kind: 'platform', id: r.platformId }] });
    }
    const first = openOn.get(r.platformId);
    if (first) out.push({ rule: 'two-open-reviews', message: 'A platform has two reviews in progress.', records: [{ kind: 'review', id: first.id }, { kind: 'review', id: r.id }] });
    else openOn.set(r.platformId, r);
  }
  // A review's rows go with it, and a completed review is never changed again.
  for (const row of live(data, 'reviewRow')) {
    const r = get(data, 'review', row.reviewId);
    const reviewLive = Boolean(r && r.status === 'live');
    if (!reviewLive) {
      out.push({ rule: 'review-row-orphaned', message: 'A review row belongs to a review that no longer exists.', records: [{ kind: 'review', id: row.reviewId }, { kind: 'reviewRow', id: row.id }] });
    } else if (r && r.state === 'completed' && row.updatedAt > r.completedAt) {
      out.push({ rule: 'completed-review-changed', message: 'A completed review was changed after it was completed.', records: [{ kind: 'reviewRow', id: row.id }] });
    }
  }
  // A reference link needs its reference and its record; a live reference points at something.
  for (const l of live(data, 'referenceLink')) {
    if (gone(get(data, 'reference', l.referenceId))) {
      out.push({ rule: 'reference-link-orphaned', message: 'A reference link belongs to a deleted reference.', records: [{ kind: 'reference', id: l.referenceId }, { kind: 'referenceLink', id: l.id }] });
    }
    if (gone(get(data, l.targetKind, l.targetId))) {
      out.push({ rule: 'reference-link-target-deleted', message: 'A reference is linked to a deleted record.', records: [{ kind: l.targetKind, id: l.targetId }, { kind: 'referenceLink', id: l.id }] });
    }
  }
  for (const r of live(data, 'reference')) {
    if (!r.url && !r.path && !r.file) out.push({ rule: 'reference-empty', message: 'A reference points at nothing.', records: [{ kind: 'reference', id: r.id }] });
  }
  return out;
}
