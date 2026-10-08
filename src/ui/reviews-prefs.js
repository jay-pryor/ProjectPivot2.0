/** How the Reviews tab is filtered, and the timeline's range: remembered per browser, folder and profile. */

/** @typedef {{ owner: string, groupId: string | null, start: string | null, length: number, past: boolean }} ReviewsPrefs */

/** The timeline's lengths, in months. */
export const TIMELINE_LENGTHS = Object.freeze([6, 12, 24, 36, 60, 120]);

/** @type {ReviewsPrefs} */
export const DEFAULT_REVIEWS_PREFS = Object.freeze({ owner: 'me', groupId: null, start: null, length: 36, past: false });

/** @param {string} folderName @param {string} profileId */
export function reviewsPrefsKey(folderName, profileId) {
  return `pivot.reviews:${folderName}:${profileId}`;
}

/**
 * The remembered filters and range; anything missing, refused or malformed is the defaults.
 * @param {Pick<Storage, 'getItem'>} storage @param {string} key @returns {ReviewsPrefs}
 */
export function readReviewsPrefs(storage, key) {
  try {
    const v = JSON.parse(storage.getItem(key) ?? 'null');
    if (!v || typeof v !== 'object') return DEFAULT_REVIEWS_PREFS;
    const ok = typeof v.owner === 'string' && (v.groupId === null || typeof v.groupId === 'string')
      && (v.start === null || (typeof v.start === 'string' && /^\d{4}-\d{2}$/.test(v.start))) && TIMELINE_LENGTHS.includes(v.length) && typeof v.past === 'boolean';
    return ok ? { owner: v.owner, groupId: v.groupId, start: v.start, length: v.length, past: v.past } : DEFAULT_REVIEWS_PREFS;
  } catch {
    return DEFAULT_REVIEWS_PREFS;
  }
}

/** @param {Pick<Storage, 'setItem'>} storage @param {string} key @param {ReviewsPrefs} prefs */
export function writeReviewsPrefs(storage, key, prefs) {
  try {
    storage.setItem(key, JSON.stringify(prefs));
  } catch {
    // A convenience only: a full or refused storage just forgets the filters.
  }
}
