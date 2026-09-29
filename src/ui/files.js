/**
 * The files Pivot opens in a browser tab, by extension: PDFs, images and plain text. Anything
 * else (a saved web page or an SVG above all, which could run script beside the app) downloads.
 */
const VIEWABLE = Object.freeze({
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', txt: 'text/plain',
});

/** The type to open a stored file as, or null to download it. @param {string} name @returns {string | null} */
export function viewableType(name) {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(name ?? ''));
  return m ? VIEWABLE[/** @type {keyof typeof VIEWABLE} */ (m[1].toLowerCase())] ?? null : null;
}
