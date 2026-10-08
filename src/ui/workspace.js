import { normalizeFilters, sameFilters, DEFAULT_FILTERS } from '../core/bowtie.js';

/** @typedef {import('../core/bowtie.js').Filters} Filters */
/** @typedef {{ viewId: string | null, hazardId: string, platformId: string, filters: Filters, zoom?: number, pan?: { x: number, y: number }, showTags?: boolean, showGaps?: boolean, hideNumbers?: boolean, layout?: 'focus' }} Pane  zoom: times the fitted size, absent is 1; pan: pixels the drawing is moved by, absent is none; showTags: the control boxes drawn with their badges (absent, without); showGaps: the mark on what no control stands against (absent, none); hideNumbers: causal factors and consequences drawn unnumbered; layout: drawn as the focus view, absent is the traditional view */

/** How far a window zooms out and in, as multiples of the drawing fitted to its window. */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 6;

/** @param {number} z */
export const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

/**
 * What a window keeps of how it is viewed: the zoom (fitted is left out) and the pan (none is left out).
 * @param {unknown} zoom @param {unknown} x @param {unknown} y
 * @returns {{ zoom?: number, pan?: { x: number, y: number } }}
 */
export function paneView(zoom, x, y) {
  const z = Number(zoom);
  const px = Math.round(Number(x) || 0);
  const py = Math.round(Number(y) || 0);
  const z2 = Number.isFinite(z) ? Math.round(clampZoom(z) * 1000) / 1000 : 1;
  return { ...(z2 !== 1 ? { zoom: z2 } : {}), ...(px || py ? { pan: { x: px, y: py } } : {}) };
}
/** @typedef {{ panes: [Pane | null, Pane | null], lastUsed: 0 | 1 }} Workspace */
/** @typedef {0 | 1 | 'last'} Side */

/** No windows. One open window is always kept in the first slot, and fills the stage. @returns {Workspace} */
export function emptyWorkspace() {
  return { panes: [null, null], lastUsed: 0 };
}

/** @param {Workspace} ws */
export function paneCount(ws) {
  return ws.panes.filter(Boolean).length;
}

/** The window a placement would replace, or null when it replaces none. @param {Workspace} ws @param {Side} side @returns {0 | 1 | null} */
export function replacedBy(ws, side) {
  const n = paneCount(ws);
  if (n === 0) return null;
  if (side === 'last') return n === 1 ? 0 : ws.lastUsed;
  return n === 2 ? side : null;
}

/**
 * Put a window on the stage. Onto an empty stage it fills it; dropped beside one window it takes
 * that half and the other window the other; with two it replaces its half. A click ('last')
 * replaces the only window, or the one used last.
 * @param {Workspace} ws @param {Side} side @param {Pane} pane @returns {Workspace}
 */
export function placePane(ws, side, pane) {
  const n = paneCount(ws);
  const [a, b] = ws.panes;
  if (n === 0) return { panes: [pane, null], lastUsed: 0 };
  if (side === 'last') {
    if (n === 1) return { panes: [pane, null], lastUsed: 0 };
    return ws.lastUsed === 0 ? { panes: [pane, b], lastUsed: 0 } : { panes: [a, pane], lastUsed: 1 };
  }
  if (n === 1) return side === 0 ? { panes: [pane, a], lastUsed: 0 } : { panes: [a, pane], lastUsed: 1 };
  return side === 0 ? { panes: [pane, b], lastUsed: 0 } : { panes: [a, pane], lastUsed: 1 };
}

/** Drag a window to the other half: the two change places. @param {Workspace} ws @param {0 | 1} from @param {0 | 1} to @returns {Workspace} */
export function movePane(ws, from, to) {
  if (paneCount(ws) < 2 || from === to) return ws;
  return { panes: [ws.panes[1], ws.panes[0]], lastUsed: to };
}

/** @param {Workspace} ws @returns {Workspace} */
export function swapPanes(ws) {
  if (paneCount(ws) < 2) return ws;
  return { panes: [ws.panes[1], ws.panes[0]], lastUsed: ws.lastUsed === 0 ? 1 : 0 };
}

/** Close a window; the other, if any, fills the stage. @param {Workspace} ws @param {0 | 1} i @returns {Workspace} */
export function closePane(ws, i) {
  const other = ws.panes[i === 0 ? 1 : 0];
  return other ? { panes: [other, null], lastUsed: 0 } : emptyWorkspace();
}

/** @param {Workspace} ws @param {0 | 1} i @param {Partial<Pane>} patch @returns {Workspace} */
export function updatePane(ws, i, patch) {
  const p = ws.panes[i];
  if (!p) return ws;
  const panes = /** @type {[Pane | null, Pane | null]} */ ([...ws.panes]);
  panes[i] = { ...p, ...patch };
  return { panes, lastUsed: i };
}

/**
 * Whether replacing the window would lose choices: its filters differ from its live view's, or
 * from the defaults when it has none.
 * @param {Pane} pane @param {import('../core/data.js').Data} data
 */
export function paneDirty(pane, data) {
  if (!pane.viewId) return !sameFilters(pane.filters, DEFAULT_FILTERS);
  const v = data.records.bowtieView?.[pane.viewId];
  return !v || v.status !== 'live' || !sameFilters(pane.filters, v.filters);
}

/** @param {string} folderName @param {string} profileId */
export function workspaceKey(folderName, profileId) {
  return `pivot.bowtieWorkspace:${folderName}:${profileId}`;
}

/** @param {unknown} p @returns {Pane | null} */
function readPane(p) {
  if (!p || typeof p !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (p);
  if (typeof o.hazardId !== 'string' || typeof o.platformId !== 'string') return null;
  const pan = /** @type {Record<string, unknown> | undefined} */ (o.pan && typeof o.pan === 'object' ? o.pan : undefined);
  return { viewId: typeof o.viewId === 'string' ? o.viewId : null, hazardId: o.hazardId, platformId: o.platformId, filters: normalizeFilters(o.filters), ...paneView(o.zoom ?? 1, pan?.x, pan?.y), ...(o.showTags === true ? { showTags: true } : {}), ...(o.showGaps === true ? { showGaps: true } : {}), ...(o.hideNumbers === true ? { hideNumbers: true } : {}), ...(o.layout === 'focus' ? { layout: 'focus' } : {}) };
}

/**
 * The windows this browser last had open for the folder and profile. A convenience only: a
 * missing, refused or unreadable value is an empty stage.
 * @param {Storage} storage @param {string} key @returns {Workspace}
 */
export function readWorkspace(storage, key) {
  try {
    const v = JSON.parse(storage.getItem(key) ?? 'null');
    if (!v || !Array.isArray(v.panes) || v.panes.length !== 2) return emptyWorkspace();
    const kept = v.panes.map(readPane).filter(Boolean);
    if (kept.length !== v.panes.filter(Boolean).length) return emptyWorkspace();
    if (kept.length === 2) return { panes: [kept[0], kept[1]], lastUsed: v.lastUsed === 1 ? 1 : 0 };
    return kept.length === 1 ? { panes: [kept[0], null], lastUsed: 0 } : emptyWorkspace();
  } catch {
    return emptyWorkspace();
  }
}

/** @param {Storage} storage @param {string} key @param {Workspace} ws */
export function writeWorkspace(storage, key, ws) {
  try {
    storage.setItem(key, JSON.stringify(ws));
  } catch {
    // Remembering the windows is a convenience; a full or refused storage just forgets them.
  }
}
