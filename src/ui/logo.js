/**
 * The Pivot fulcrum: a beam on a triangle, over a stepped plinth. The triangle's right face is in
 * shadow, the beam is tipped in orange at both ends and turns on a pin at the point. One drawing for
 * the top bar (ink follows the text colour) and the browser tab icon (its own colours, light and dark).
 */

const SHADE = '#c46f0c';
/** The drawing's shapes, in the given ink and accent colours. */
export const SHAPES = (/** @type {string} */ ink, /** @type {string} */ accent) => `<polygon points="32,27 48,57 16,57" fill="${accent}"/>
  <polygon points="32,27 48,57 32,57" fill="${SHADE}"/>
  <g transform="rotate(-11 32 24.5)"><rect x="3" y="21" width="58" height="7" fill="${ink}"/>
  <rect x="3" y="21" width="3.5" height="7" fill="${accent}"/><rect x="57.5" y="21" width="3.5" height="7" fill="${accent}"/>
  <circle cx="32" cy="24.5" r="3.6" fill="${accent}"/><circle cx="32" cy="24.5" r="1.5" fill="${SHADE}"/></g>
  <rect x="12" y="57" width="40" height="2" fill="${ink}"/>
  <rect x="7" y="59" width="50" height="2.5" fill="${ink}"/>`;

/** The logo inline, beside the name: cropped to the drawing, so its height is the drawing's and it can match the letters. */
export const FULCRUM_SVG = `<svg class="brand-logo" viewBox="2 15 60 47" aria-hidden="true" focusable="false">${SHAPES('currentColor', 'var(--p-accent, #fa9a26)')}</svg>`;

/** The logo as a standalone file for the tab icon: dark ink, pale on a dark browser. */
export const FULCRUM_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><style>.ink{fill:#1f2933}@media (prefers-color-scheme: dark){.ink{fill:#e6e8ec}}</style>${SHAPES('#1f2933', '#fa9a26').replaceAll('fill="#1f2933"', 'class="ink"')}</svg>`;
