import { hazardLabel } from '../core/ids.js';

export const KIND_LABEL = Object.freeze({
  hazard: 'Hazard', causalFactor: 'Causal factor', consequence: 'Consequence', control: 'Control',
  platform: 'Platform', hazardControl: 'Control link', hazardPlatform: 'Platform link',
  ruling: 'Control decision', rating: 'Rating', report: 'Report', reportDesign: 'Report design',
  review: 'Review', reviewRow: 'Review row',
});

/** How a record is named to a person. @param {string} kind @param {any} rec */
export function recordName(kind, rec) {
  if (kind === 'reportDesign') return 'the report design';
  if (!rec) return KIND_LABEL[kind] ?? kind;
  switch (kind) {
    case 'hazard': return `${hazardLabel(rec)} ${rec.title}`;
    case 'control':
    case 'report': return rec.title;
    case 'platform': return rec.name;
    case 'causalFactor':
    case 'consequence': return rec.text;
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
