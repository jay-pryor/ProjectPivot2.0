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

/** A tab that is a page of its own, or null for a page's first tab. @param {unknown} tab */
const tabOf = (tab) => (typeof tab === 'string' && tab !== '' && tab !== 'details' ? tab : null);

/**
 * The pages the active profile has starred, in its order: each a view name, for a record's page
 * its id, and for a page within it (a hazard on one platform, a history) its tab.
 * @param {any} state @returns {{ name: string, id: string | null, tab: string | null }[]}
 */
export function favouritesOf(state) {
  const list = activeProfile(state)?.prefs?.favourites;
  return Array.isArray(list) ? list.filter((f) => f && typeof f.name === 'string')
    .map((f) => ({ name: f.name, id: typeof f.id === 'string' && f.id ? f.id : null, tab: tabOf(f.tab) })) : [];
}

/** The same page: name, id and tab alike. @param {{ name?: string, id?: string | null, tab?: string | null }} a @param {{ name?: string, id?: string | null, tab?: string | null }} b */
export const samePage = (a, b) => a?.name === b?.name && (a?.id || null) === (b?.id || null) && tabOf(a?.tab) === tabOf(b?.tab);

/** Whether a page (a view's name, id and tab) is starred. @param {any} state @param {{ name?: string, id?: string | null, tab?: string | null }} view */
export function isFavourite(state, view) {
  return favouritesOf(state).some((f) => samePage(f, view));
}

/** How Favourite pages shows them: a table, small blocks sized to their names, or large blocks filling the box. */
export const FAVOURITE_LAYOUTS = Object.freeze(['table', 'small', 'large']);

/** How far ahead Coming up looks, in days, with the words the menu shows for each. */
export const COMING_UP_WINDOWS = /** @type {readonly [number, string][]} */ (Object.freeze([[7, 'Next 7 days'], [14, 'Next 14 days'], [30, 'Next 30 days'], [60, 'Next 60 days'], [90, 'Next 90 days'], [180, 'Next 6 months'], [365, 'Next 12 months']]));

/** @param {any} state @returns {number} */
export function comingUpDays(state) {
  const d = activeProfile(state)?.prefs?.comingUpDays;
  return COMING_UP_WINDOWS.some(([n]) => n === d) ? d : 90;
}

/** @param {any} state */
export function favouriteLayout(state) {
  const l = activeProfile(state)?.prefs?.favouriteLayout;
  return FAVOURITE_LAYOUTS.includes(l) ? l : 'table';
}
