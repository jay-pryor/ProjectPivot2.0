import { renderApp } from './render.js';
import { App as DocGen } from '../../DocGen/doc-designer.js';

/**
 * Event delegation on a root that stays put, as DocGen's designer does.
 * @param {HTMLElement} el @param {(action: any) => Promise<void>} dispatch
 */
export function wire(el, dispatch) {
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
    void dispatch({ type: f.dataset.action, ...f.dataset, ...Object.fromEntries(new FormData(f)) });
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
  /** @param {any} state */
  const paint = (state) => {
    appEl.innerHTML = renderApp(state);
    // The designer repaints itself as it is edited; the app repaints it only when asked to open it.
    if (state.designerRevision !== designerRevision) {
      designerRevision = state.designerRevision;
      paintDesigner();
    }
  };
  wire(appEl, controller.dispatch);
  RD.wire({ root: designerEl, refreshMain: paintDesigner, quietEdit: (/** @type {() => void} */ fn) => fn() });
  designerEl.addEventListener('click', (e) => {
    const b = /** @type {HTMLButtonElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-generate-action]'));
    if (!b || b.disabled) return;
    void controller.dispatch({ type: 'generateFromDesigner', format: b.getAttribute('data-generate-format') });
  });
  controller.subscribe(paint);
  paint(controller.getState());
}
