/** @returns {string} a random UUID */
export function newId() {
  return globalThis.crypto.randomUUID();
}

/**
 * The id a person reads: `H-0042`, or `New` until the hazard is first saved and numbered.
 * @param {{ number?: number | null, [field: string]: any }} hazard
 */
export function hazardLabel(hazard) {
  return numberLabel('H', hazard);
}

/** @param {{ number?: number | null, [field: string]: any }} control */
export function controlLabel(control) {
  return numberLabel('C', control);
}

/** @param {{ number?: number | null, [field: string]: any }} platform */
export function platformLabel(platform) {
  return numberLabel('P', platform);
}

/** @param {string} prefix @param {{ number?: number | null }} rec */
function numberLabel(prefix, rec) {
  return rec.number == null ? 'New' : `${prefix}-${String(rec.number).padStart(4, '0')}`;
}

/**
 * Link, ruling and rating ids are built from what they join, so two users who make the same
 * link write the same record and the merge sees one record, not two that disagree.
 */
export const ids = Object.freeze({
  /** @param {string} h @param {string} c */
  hazardControl: (h, c) => `hc:${h}:${c}`,
  /** @param {string} h @param {string} p */
  hazardPlatform: (h, p) => `hp:${h}:${p}`,
  /** @param {string} h @param {string} c @param {string} p */
  ruling: (h, c, p) => `ru:${h}:${c}:${p}`,
  /** @param {string} h @param {string} p */
  rating: (h, p) => `rt:${h}:${p}`,
});
