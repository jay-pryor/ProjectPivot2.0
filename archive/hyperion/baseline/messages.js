/**
 * User-facing message conventions (docs/module-map.md "Baseline"): how a module tells the
 * user what was not saved (REQ-005), which data is affected (REQ-006), and which files
 * failed their check (REQ-074). One shape, so `views` renders every module's message the
 * same way and a hazard mitigation that says "tell the user" has one thing to test.
 *
 * Conventions:
 * - The headline is one plain sentence that names what happened. Never "an error
 *   occurred", never a code, never a stack.
 * - `items` names the things affected as the user knows them (a hazard's title, a file's
 *   name). A message whose requirement says "name the changes" is a defect with no items,
 *   so the constructors below refuse an empty list.
 * - `next` says what the user can do now, in one sentence.
 * - `severity` is `error` when data is not as the user believes, `warning` when the user
 *   must decide, `info` otherwise.
 */

/** @typedef {'error' | 'warning' | 'info'} MessageSeverity */

/**
 * @typedef {object} UserMessage
 * @property {MessageSeverity} severity
 * @property {string} headline
 * @property {readonly string[]} items
 * @property {string} next
 */

/**
 * @param {readonly string[]} items
 * @param {string} what
 * @returns {readonly string[]}
 */
function named(items, what) {
  const clean = items.map((s) => s.trim()).filter((s) => s !== '');
  if (clean.length === 0) throw new TypeError(`a message that names ${what} needs at least one`);
  return Object.freeze(clean);
}

/**
 * @param {MessageSeverity} severity
 * @param {string} headline
 * @param {readonly string[]} items
 * @param {string} next
 * @returns {UserMessage}
 */
export function message(severity, headline, items, next) {
  if (headline.trim() === '') throw new TypeError('a message needs a headline');
  if (next.trim() === '') throw new TypeError('a message says what the user can do next');
  return Object.freeze({ severity, headline: headline.trim(), items: Object.freeze([...items]), next: next.trim() });
}

/**
 * REQ-005: a save did not complete; these changes are not in the folder.
 * @param {readonly string[]} changes each change as the user would recognise it
 * @param {string} [next]
 * @returns {UserMessage}
 */
export function notSaved(changes, next = 'Your changes are still on screen. Save again, or check the data folder.') {
  const items = named(changes, 'the changes not saved');
  return message('error', `${items.length === 1 ? 'This change was' : 'These changes were'} not saved.`, items, next);
}

/**
 * REQ-006: stored data could not be read or is corrupted; this is what it affects.
 * @param {readonly string[]} affected the records or kinds of data the user cannot rely on
 * @param {string} cause one sentence, e.g. "data.json could not be read"
 * @param {string} [next]
 * @returns {UserMessage}
 */
export function dataAffected(affected, cause, next = 'Restore from a backup, or ask whoever last saved to check the folder.') {
  const items = named(affected, 'the data affected');
  return message('error', `${cause.trim().replace(/\.$/, '')}. This data is affected:`, items, next);
}

/**
 * REQ-074: these files failed the integrity check written with them.
 * @param {readonly string[]} files file names relative to the data folder
 * @param {string} [next]
 * @returns {UserMessage}
 */
export function integrityFailed(files, next = 'Nothing from these files is shown. Restore from a backup, or replace them with a copy you trust.') {
  const items = named(files, 'the files that failed');
  return message('error', `${items.length === 1 ? 'A file has' : `${items.length} files have`} changed since Pivot wrote ${items.length === 1 ? 'it' : 'them'}.`, items, next);
}
