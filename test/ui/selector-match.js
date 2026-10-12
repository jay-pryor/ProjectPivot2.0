/**
 * Whether rendered HTML has an element matching a simple selector: one or more space-separated
 * parts (descendant, checked loosely: each part must match some element), each part a tag, .class
 * (several allowed), and [attr] or [attr="value"].
 * @param {string} html @param {string} selector
 */
export function hasMatch(html, selector) {
  const tags = [...html.matchAll(/<([a-zA-Z][\w-]*)([^>]*)>/g)].map(([, tag, attrs]) => ({ tag: tag.toLowerCase(), attrs }));
  const attrOf = (/** @type {string} */ attrs, /** @type {string} */ name) => attrs.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? (new RegExp(`\\s${name}(\\s|$|>)`).test(attrs) ? '' : null);
  const matchPart = (/** @type {string} */ part) => tags.some(({ tag, attrs }) => {
    const m = part.match(/^([a-zA-Z][\w-]*)?((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/);
    if (!m) throw new Error(`unsupported selector part: ${part}`);
    if (m[1] && m[1].toLowerCase() !== tag) return false;
    const classes = (attrOf(attrs, 'class') ?? '').split(/\s+/);
    if (m[2] && !m[2].split('.').filter(Boolean).every((c) => classes.includes(c))) return false;
    for (const [, name, value] of m[3].matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
      const v = attrOf(attrs, name);
      if (v === null || (value !== undefined && v !== value)) return false;
    }
    return true;
  });
  return selector.trim().split(/\s+/).every(matchPart);
}
