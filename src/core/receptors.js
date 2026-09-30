/** Whom or what a risk falls on: one list, so every screen, count and report covers each. */
export const RECEPTORS = Object.freeze(['personnel', 'environment', 'capability']);
export const RECEPTOR_WORD = Object.freeze({ personnel: 'Personnel', environment: 'Environment', capability: 'Capability' });
export const RECEPTOR_LETTER = Object.freeze({ personnel: 'P', environment: 'E', capability: 'C' });
/** e.g. `residualCapability`, the key reports use. @param {string} stage @param {string} receptor */
export const stageKey = (stage, receptor) => `${stage}${RECEPTOR_WORD[/** @type {keyof typeof RECEPTOR_WORD} */ (receptor)]}`;
