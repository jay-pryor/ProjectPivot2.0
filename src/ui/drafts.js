/**
 * Text typed into a form but not yet submitted survives a redraw. The app redraws the whole
 * screen when its state changes, and some changes arrive on their own (a save or a backup
 * finishing), so without this a half-typed description vanishes under the user's fingers.
 */

const FIELDS = 'form[data-action] input, form[data-action] textarea, form[data-action] select, [data-input], input[data-change], textarea[data-change]';

/**
 * The same field before and after a redraw: its form's action and data, and its own name.
 * @param {Record<string, string | undefined>} formData the form's dataset
 * @param {string} name the field's name
 */
export function draftKey(formData, name) {
  return `${formIdentity(formData)}|${name}`;
}

/** A form, whichever of its fields: its action and data. @param {Record<string, string | undefined>} formData */
export function formIdentity(formData) {
  return Object.keys(formData).sort().map((k) => `${k}=${formData[k]}`).join('&');
}

/** @param {Element} el @returns {string | null} */
function keyOf(el) {
  // A header filter is not in a form; it is identified by its own data.
  if (/** @type {HTMLElement} */ (el).dataset?.input) return draftKey({ ...(/** @type {HTMLElement} */ (el)).dataset }, 'input');
  // A field that applies when left (a title, a name) is identified by its own data and name.
  const own = /** @type {HTMLInputElement} */ (el);
  if (own.dataset?.change && (own.tagName === 'INPUT' || own.tagName === 'TEXTAREA') && !own.closest('form[data-action]')) {
    return draftKey({ ...own.dataset }, own.name);
  }
  const form = /** @type {HTMLFormElement | null} */ (el.closest('form[data-action]'));
  const name = /** @type {HTMLInputElement} */ (el).name;
  return form && name ? draftKey({ ...form.dataset }, name) : null;
}

/** @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} el */
function edited(el) {
  if (el instanceof HTMLSelectElement) return [...el.options].some((o) => o.selected !== o.defaultSelected);
  if (el.type === 'checkbox' || el.type === 'radio') return false;
  return el.value !== el.defaultValue;
}

/**
 * Note every edited, unsubmitted field and where the cursor is.
 * @param {HTMLElement} root
 * @param {Set<string>} submitting form identities (formIdentity) being submitted:
 *   their fields are meant to clear, so they are not kept
 */
export function captureDrafts(root, submitting) {
  /** @type {Map<string, string>} */
  const values = new Map();
  for (const el of /** @type {NodeListOf<HTMLInputElement>} */ (root.querySelectorAll(FIELDS))) {
    const key = keyOf(el);
    if (!key || submitting.has(key.slice(0, key.lastIndexOf('|'))) || !edited(el)) continue;
    values.set(key, el.value);
  }
  const active = /** @type {HTMLInputElement | null} */ (document.activeElement);
  const focus = active && root.contains(active) ? { key: keyOf(active), start: active.selectionStart, end: active.selectionEnd } : null;
  return { values, focus };
}

/**
 * Put the noted values back into the redrawn fields, and the cursor back where it was.
 * @param {HTMLElement} root @param {ReturnType<typeof captureDrafts>} drafts
 */
export function restoreDrafts(root, { values, focus }) {
  for (const el of /** @type {NodeListOf<HTMLInputElement>} */ (root.querySelectorAll(FIELDS))) {
    const key = keyOf(el);
    if (!key) continue;
    if (values.has(key)) el.value = /** @type {string} */ (values.get(key));
    if (focus && focus.key === key) {
      el.focus();
      try { el.setSelectionRange(focus.start, focus.end); } catch { /* selects and some inputs have no caret */ }
    }
  }
}

/**
 * A form's fields as an object; a field given more than once (ticked checkboxes) becomes a list.
 * @param {Iterable<[string, FormDataEntryValue]>} entries
 * @returns {Record<string, string | string[]>}
 */
export function formValues(entries) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const [k, v] of entries) {
    const s = String(v);
    if (!(k in out)) out[k] = s;
    else if (Array.isArray(out[k])) out[k].push(s);
    else out[k] = [out[k], s];
  }
  return out;
}
