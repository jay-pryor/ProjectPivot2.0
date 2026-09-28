const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** @param {unknown} v */
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ESC[/** @type {keyof typeof ESC} */ (c)]);
}

/** Markup that is already safe. */
export class Raw {
  /** @param {string} s */
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

/** @param {string} s trusted markup (never user text) */
export function raw(s) {
  return new Raw(String(s));
}

/** @param {unknown} v @returns {string} */
function part(v) {
  if (v === null || v === undefined || v === false || v === true) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(part).join('');
  return esc(v);
}

/**
 * Every interpolated value is escaped unless it is itself `html` or `raw`, so user text can
 * never become markup.
 * @param {TemplateStringsArray} strings @param {...unknown} values @returns {Raw}
 */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += part(values[i]) + strings[i + 1];
  return new Raw(out);
}
