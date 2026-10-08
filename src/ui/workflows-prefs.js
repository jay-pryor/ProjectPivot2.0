/** How the Workflows tab is filtered: whose workflows, and how far back Recently completed looks. Remembered per browser, folder and profile. */

/** @typedef {{ owner: string, days: number }} WorkflowsPrefs */

/** How far back Recently completed looks, in days. */
export const RECENT_DAYS = Object.freeze([7, 30, 90, 365]);

/** @type {WorkflowsPrefs} */
export const DEFAULT_WORKFLOWS_PREFS = Object.freeze({ owner: 'everyone', days: 30 });

/** @param {string} folderName @param {string} profileId */
export function workflowsPrefsKey(folderName, profileId) {
  return `pivot.workflows:${folderName}:${profileId}`;
}

/** @param {Pick<Storage, 'getItem'>} storage @param {string} key @returns {WorkflowsPrefs} */
export function readWorkflowsPrefs(storage, key) {
  try {
    const v = JSON.parse(storage.getItem(key) ?? 'null');
    return v && typeof v.owner === 'string' && RECENT_DAYS.includes(v.days) ? { owner: v.owner, days: v.days } : DEFAULT_WORKFLOWS_PREFS;
  } catch {
    return DEFAULT_WORKFLOWS_PREFS;
  }
}

/** @param {Pick<Storage, 'setItem'>} storage @param {string} key @param {WorkflowsPrefs} prefs */
export function writeWorkflowsPrefs(storage, key, prefs) {
  try {
    storage.setItem(key, JSON.stringify(prefs));
  } catch {
    // A convenience only: a full or refused storage just forgets the filter.
  }
}
