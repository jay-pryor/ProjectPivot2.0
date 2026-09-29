import { get } from '../core/data.js';
import { PivotError } from '../core/errors.js';
import { platformHazards, hazardDetail, lastReviewed } from '../core/queries.js';
import { reviewState, aestDate } from '../core/time.js';

/** @typedef {import('../core/data.js').Data} Data */
/**
 * @typedef {{ platformId: string, platformName: string, ownerName: string, producedAt: string, producedBy: string,
 *   title: string, classification: string, rows: SnapshotRow[],
 *   review: { state: string, due: string | null, months: number | null, lastReviewed: string | null } }} Snapshot
 * @typedef {{ hazardId: string, number: number | null, reportId: string, title: string, description: string,
 *   causalFactors: string[], consequences: string[], controls: { title: string, kind: string, state: string, reason: string }[],
 *   initial: any, residual: any }} SnapshotRow
 */

/**
 * A platform as a report shows it, as values rather than references, so a report stays what it
 * was when produced.
 * @param {Data} data @param {string} platformId
 * @param {{ profileName: (id: string) => string, at: string, by: string, title: string, classification: string }} o
 * @returns {Snapshot}
 */
export function buildSnapshot(data, platformId, o) {
  const platform = get(data, 'platform', platformId);
  if (!platform || platform.status === 'deleted') throw new PivotError('not-found', 'That platform no longer exists.');
  const rows = platformHazards(data, platformId).map((r) => {
    const d = /** @type {NonNullable<ReturnType<typeof hazardDetail>>} */ (hazardDetail(data, r.hazard.id));
    return {
      hazardId: r.hazard.id,
      number: r.hazard.number,
      reportId: r.reportId,
      title: r.hazard.title,
      description: r.hazard.description ?? '',
      causalFactors: d.causalFactors.map((x) => x.text),
      consequences: d.consequences.map((x) => x.text),
      controls: r.controls.map((c) => ({ title: c.control.title, kind: c.kind, state: c.state, reason: c.state === 'excluded' ? c.ruling?.reason ?? '' : '' })),
      initial: r.rating.initial,
      residual: r.rating.residual,
    };
  });
  return structuredClone({
    platformId, platformName: platform.name, ownerName: o.profileName(platform.ownerId),
    producedAt: o.at, producedBy: o.by, title: o.title, classification: o.classification, rows,
    review: {
      state: reviewState(platform, aestDate(o.at)),
      due: platform.reviewDue ?? null,
      months: platform.reviewMonths ?? null,
      lastReviewed: lastReviewed(data, platformId),
    },
  });
}
