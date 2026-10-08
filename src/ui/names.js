import { hazardLabel } from '../core/ids.js';
import { safetyReportId } from '../core/ops/report-ids.js';

/** @param {string} s */
const cap = (s) => `${s[0].toUpperCase()}${s.slice(1)}`;

export const KIND_LABEL = Object.freeze({
  hazard: 'Hazard', causalFactor: 'Causal factor', consequence: 'Consequence', control: 'Control',
  platform: 'Platform', hazardControl: 'Control link', hazardPlatform: 'Platform link',
  ruling: 'Control decision', rating: 'Rating', report: 'Report', reportDesign: 'Report design',
  review: 'Review', reviewRow: 'Review row', reference: 'Reference', referenceLink: 'Reference link',
  assessment: 'Risk assessment', sfarp: 'SFARP considerations',
  phase: 'Lifecycle phase', hazardPhase: 'Lifecycle phase link', safetyReport: 'Safety report', implementer: 'Control owner', implementationStatus: 'Implementation status', controlOn: 'Control on platform',
  bowtieView: 'Bow-tie view', systemElement: 'System/Element', affectedGroup: 'Affected group', failureMode: 'Element failure mode',
  platformGroup: 'Platform group', platformGroupLink: 'Platform group tag', facetOption: 'Facet option', optionGroup: 'Option in platform group',
});

/**
 * How a record is named to a person. A record that joins others (a control on a hazard, an
 * assessment on a platform) is named by what it joins when the data is given.
 * @param {string} kind @param {any} rec @param {any} [data]
 */
export function recordName(kind, rec, data) {
  if (kind === 'reportDesign') return 'the report design';
  if (!rec) return KIND_LABEL[kind] ?? kind;
  if (data) {
    const h = data.records.hazard?.[rec.hazardId];
    const hazard = h ? hazardLabel(h) : '';
    const control = data.records.control?.[rec.controlId]?.title ?? '';
    const platform = data.records.platform?.[rec.platformId]?.name ?? '';
    switch (kind) {
      case 'hazardControl': return `${control} for ${hazard}`;
      case 'implementationStatus': return `Implementation status of ${control} for ${hazard} on ${platform}`;
      case 'controlOn': return `${control} for ${hazard} on ${platform}`;
      case 'ruling': return `${control} for ${hazard} on ${platform}`;
      case 'assessment': return `${cap(rec.stage)} ${rec.receptor} risk of ${hazard} on ${platform}`;
      case 'sfarp': return `SFARP of ${hazard} on ${platform}`;
      case 'implementer': return `${control} on ${platform}`;
      case 'hazardPhase': return `${data.records.phase?.[rec.phaseId]?.name ?? ''} for ${hazard}`;
      case 'optionGroup': return `${data.records[rec.optionKind]?.[rec.optionId]?.name ?? ''} in ${rec.groupId === 'all' ? 'All platforms' : data.records.platformGroup?.[rec.groupId]?.name ?? ''}`;
      case 'platformGroupLink': return `${platform} in ${data.records.platformGroup?.[rec.groupId]?.name ?? ''}`;
      case 'safetyReport': {
        const sid = safetyReportId(data, rec).id;
        return `${sid !== 'TBC' ? sid : rec.summary} for ${hazard} on ${platform}`;
      }
      case 'failureMode':
      case 'systemElement':
      case 'affectedGroup': return `${rec.text} for ${hazard} on ${platform}`;
      default: break;
    }
  }
  switch (kind) {
    case 'hazard': return `${hazardLabel(rec)} ${rec.title}`;
    case 'control':
    case 'reference':
    case 'report': return rec.title;
    case 'platform':
    case 'phase':
    case 'platformGroup':
    case 'facetOption':
    case 'bowtieView': return rec.name;
    case 'safetyReport': return rec.summary;
    case 'causalFactor':
    case 'consequence':
    case 'failureMode':
    case 'systemElement':
    case 'affectedGroup': return rec.text;
    default: return KIND_LABEL[kind] ?? kind;
  }
}

/** @param {{ profiles: { id: string, name: string }[] }} state @param {string | null | undefined} id */
export function profileName(state, id) {
  return state.profiles.find((p) => p.id === id)?.name ?? 'someone';
}

/** @param {string} ts an AEST timestamp @returns {string} `YYYY-MM-DD HH:mm` */
export function when(ts) {
  return ts.slice(0, 16).replace('T', ' ');
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** @param {string} date `YYYY-MM-DD`, or an AEST timestamp @returns {string} e.g. `12 Aug 2026` */
export function day(date) {
  const [y, m, d] = date.slice(0, 10).split('-');
  return `${Number(d)} ${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

/** A review period as a person says it: whole years in years, otherwise months. @param {number} months */
export function periodWord(months) {
  if (months % 12 === 0) return `${months / 12} year${months === 12 ? '' : 's'}`;
  return `${months} month${months === 1 ? '' : 's'}`;
}
