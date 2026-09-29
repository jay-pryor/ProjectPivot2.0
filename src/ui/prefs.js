/** A person's settings, kept on their profile (profiles.json) so they follow them to any machine. */

export const THEMES = Object.freeze(['dark', 'light']);
export const MIN_COLUMN_WIDTH = 40;

/** @param {any} state */
export function activeProfile(state) {
  return state.profiles.find((/** @type {any} */ p) => p.id === state.profileId) ?? null;
}

/** Dark unless the active profile chose otherwise; dark before anyone is picked. @param {any} state */
export function themeOf(state) {
  const t = activeProfile(state)?.prefs?.theme;
  return THEMES.includes(t) ? t : 'dark';
}

/** @param {any} state @param {string} table @param {string} column @returns {number | null} */
export function columnWidth(state, table, column) {
  return activeProfile(state)?.prefs?.columnWidths?.[`${table}.${column}`] ?? null;
}
