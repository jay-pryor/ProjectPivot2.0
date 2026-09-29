import { renderApp } from './render.js';
import { captureDrafts, restoreDrafts, formIdentity } from './drafts.js';
import { themeOf } from './prefs.js';
import { App as DocGen } from '../../DocGen/doc-designer.js';

/**
 * Event delegation on a root that stays put, as DocGen's designer does.
 * @param {HTMLElement} el @param {(action: any) => Promise<void>} dispatch
 * @param {Set<string>} [submitting] forms being submitted, whose fields are meant to clear
 */
export function wire(el, dispatch, submitting = new Set()) {
  el.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-action]'));
    if (!t || t.tagName === 'FORM' || !el.contains(t)) return;
    e.preventDefault();
    void dispatch({ type: t.dataset.action, ...t.dataset });
  });
  el.addEventListener('submit', (e) => {
    const f = /** @type {HTMLFormElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('form[data-action]'));
    if (!f) return;
    e.preventDefault();
    const identity = formIdentity({ ...f.dataset });
    submitting.add(identity);
    void dispatch({ type: f.dataset.action, ...f.dataset, ...Object.fromEntries(new FormData(f)) }).finally(() => submitting.delete(identity));
  });
  // Header filters apply as you type, a moment after the last key.
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let typing;
  el.addEventListener('input', (e) => {
    const t = /** @type {HTMLInputElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-input]'));
    if (!t) return;
    clearTimeout(typing);
    typing = setTimeout(() => void dispatch({ type: t.dataset.input, ...t.dataset, value: t.value }), 250);
  });
  el.addEventListener('change', (e) => {
    const t = /** @type {HTMLSelectElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-change]'));
    if (!t) return;
    void dispatch({ type: t.dataset.change, ...t.dataset, [t.name || 'value']: t.value });
  });
}

/** @param {HTMLElement} root @param {ReturnType<typeof import('./controller.js').createController>} controller */
export function mount(root, controller) {
  root.innerHTML = '<div class="pivot-app"></div><div class="pivot-designer"></div>';
  const appEl = /** @type {HTMLElement} */ (root.querySelector('.pivot-app'));
  const designerEl = /** @type {HTMLElement} */ (root.querySelector('.pivot-designer'));
  const RD = DocGen.ui.views.reportDesign;
  const paintDesigner = () => {
    const host = DocGen.docHost.get();
    designerEl.innerHTML = host && RD.isOpen() ? RD.render(host.getState()) : '';
  };
  let designerRevision = 0;
  /** @type {Set<string>} */
  const submitting = new Set();
  /** @param {any} state */
  const paint = (state) => {
    document.documentElement.dataset.theme = themeOf(state);
    const drafts = captureDrafts(appEl, submitting);
    appEl.innerHTML = renderApp(state);
    restoreDrafts(appEl, drafts);
    // The designer repaints itself as it is edited; the app repaints it only when asked to open it.
    if (state.designerRevision !== designerRevision) {
      designerRevision = state.designerRevision;
      paintDesigner();
    }
  };
  wire(appEl, controller.dispatch, submitting);
  resizableColumns(appEl, controller.dispatch);
  RD.wire({ root: designerEl, refreshMain: paintDesigner, quietEdit: (/** @type {() => void} */ fn) => fn() });
  designerEl.addEventListener('click', (e) => {
    const b = /** @type {HTMLButtonElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-generate-action]'));
    if (!b || b.disabled) return;
    void controller.dispatch({ type: 'generateFromDesigner', format: b.getAttribute('data-generate-format') });
  });
  controller.subscribe(paint);
  paint(controller.getState());
}

/**
 * Drag a header's right edge to resize its column. The width is applied as you drag and kept on
 * the profile when you let go.
 * @param {HTMLElement} el @param {(action: any) => Promise<void>} dispatch
 */
function resizableColumns(el, dispatch) {
  el.addEventListener('pointerdown', (e) => {
    const grip = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-resize]'));
    if (!grip) return;
    e.preventDefault();
    const { table, key } = grip.dataset;
    const th = /** @type {HTMLElement} */ (grip.closest('th'));
    const col = /** @type {HTMLElement | null} */ (th.closest('table')?.querySelector(`col[data-col="${CSS.escape(String(key))}"]`) ?? null);
    const startX = e.clientX;
    const startWidth = th.getBoundingClientRect().width;
    let width = startWidth;
    grip.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing');
    /** @param {PointerEvent} m */
    const move = (m) => {
      width = Math.max(40, startWidth + m.clientX - startX);
      if (col) col.style.width = `${width}px`;
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      document.body.classList.remove('resizing');
      if (Math.round(width) !== Math.round(startWidth)) void dispatch({ type: 'setColumnWidth', table, column: key, width });
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  });
}
