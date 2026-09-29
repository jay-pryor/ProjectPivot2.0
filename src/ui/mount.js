import { renderApp } from './render.js';
import { captureDrafts, restoreDrafts, formIdentity } from './drafts.js';
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
  RD.wire({ root: designerEl, refreshMain: paintDesigner, quietEdit: (/** @type {() => void} */ fn) => fn() });
  designerEl.addEventListener('click', (e) => {
    const b = /** @type {HTMLButtonElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-generate-action]'));
    if (!b || b.disabled) return;
    void controller.dispatch({ type: 'generateFromDesigner', format: b.getAttribute('data-generate-format') });
  });
  controller.subscribe(paint);
  paint(controller.getState());
}
