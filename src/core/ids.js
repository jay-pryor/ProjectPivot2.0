/** @returns {string} a random UUID */
export function newId() {
  return globalThis.crypto.randomUUID();
}

/** What a record's ID reads as until it is first saved and numbered. */
export const UNNUMBERED = 'TBC';

/**
 * The id a person reads: `HAZ-042`, or `TBC` (UNNUMBERED) until the hazard is first saved and numbered.
 * @param {{ number?: number | null, [field: string]: any }} hazard
 */
export function hazardLabel(hazard) {
  return numberLabel('HAZ', hazard);
}

/** An additional control reads C-001; an existing control EC-001. @param {{ number?: number | null, [field: string]: any }} control */
export function controlLabel(control) {
  return numberLabel('C', control);
}

/** @param {{ number?: number | null, [field: string]: any }} platform */
export function platformLabel(platform) {
  return numberLabel('P', platform);
}

/** @param {{ number?: number | null, [field: string]: any }} reference */
export function referenceLabel(reference) {
  return numberLabel('REF', reference);
}

/** @param {string} prefix @param {{ number?: number | null }} rec */
function numberLabel(prefix, rec) {
  return rec.number == null ? UNNUMBERED : `${prefix}-${String(rec.number).padStart(3, '0')}`;
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
  /** @param {string} h @param {string} c @param {string} p */
  implementationStatus: (h, c, p) => `is:${h}:${c}:${p}`,
  /** @param {string} h @param {string} c @param {string} p */
  controlOn: (h, c, p) => `on:${h}:${c}:${p}`,
  /** @param {string} h @param {string} p */
  rating: (h, p) => `rt:${h}:${p}`,
  /** @param {string} h @param {string} p @param {string} s stage @param {string} r receptor */
  assessment: (h, p, s, r) => `ra:${h}:${p}:${s}:${r}`,
  /** @param {string} h @param {string} p */
  sfarp: (h, p) => `sf:${h}:${p}`,
  /** @param {string} h @param {string} ph a phase id */
  hazardPhase: (h, ph) => `hph:${h}:${ph}`,
  /** @param {string} p a platform id @param {string} g a platform group id */
  platformGroupLink: (p, g) => `pgl:${p}:${g}`,
  /** @param {string} o a facet option or phase id @param {string} g a platform group id */
  optionGroup: (o, g) => `og:${o}:${g}`,
  /** @param {string} c a control id @param {string} p */
  implementer: (c, p) => `im:${c}:${p}`,
  /** @param {string} r a review id @param {string} h */
  reviewRow: (r, h) => `rr:${r}:${h}`,
  /** @param {string} r a reference id @param {string} k the target's kind @param {string} t the target's id */
  referenceLink: (r, k, t) => `rl:${r}:${k}:${t}`,
});
