import { renderApp } from './render.js';
import { captureDrafts, restoreDrafts, formIdentity, formValues } from './drafts.js';
import { themeOf } from './prefs.js';
import { App as DocGen } from '../../DocGen/doc-designer.js';

/**
 * Event delegation on a root that stays put, as DocGen's designer does.
 * @param {HTMLElement} el @param {(action: any) => Promise<void>} dispatch
 * @param {Set<string>} [submitting] forms being submitted, whose fields are meant to clear
 */
export function wire(el, dispatch, submitting = new Set()) {
  // Leaving a field applies its edit, and that redraws the screen between pressing a button and
  // letting go, so the button under the pointer is replaced and its click never arrives (click
  // Save straight after typing a title). The button pressed is remembered; if it was replaced by
  // the time the pointer comes up, its action is dispatched as the click would have been.
  /** @type {HTMLElement | null} */
  let pressed = null;
  el.addEventListener('pointerdown', (e) => {
    const t = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-action]'));
    pressed = t && t.tagName !== 'FORM' && e.button === 0 ? t : null;
  }, true);
  document.addEventListener('pointerup', () => {
    const t = pressed;
    pressed = null;
    if (t && !t.isConnected && !/** @type {HTMLButtonElement} */ (t).disabled) void dispatch({ type: t.dataset.action, ...t.dataset });
  });
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
    void dispatch({ type: f.dataset.action, ...f.dataset, ...formValues(new FormData(f)) }).finally(() => submitting.delete(identity));
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
  // Double-click a value to change it in place.
  el.addEventListener('dblclick', (e) => {
    const t = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-dblclick]'));
    if (t) void dispatch({ type: t.dataset.dblclick, ...t.dataset });
  });
  // In a box opened in place: Enter applies (or just closes if nothing changed), Escape cancels.
  el.addEventListener('keydown', (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    if (e.key === 'Escape') {
      if (t.closest?.('.picker-overlay')) { void dispatch({ type: 'closePicker' }); return; }
      if (t.classList?.contains('cell-edit') || t.closest?.('.new-record, .new-row, .comments + form, form.fill')) void dispatch({ type: 'cancelEdit' });
      return;
    }
    if (e.key === 'Enter' && t.classList?.contains('cell-edit')) {
      e.preventDefault();
      if (t.value === t.defaultValue) void dispatch({ type: 'cancelEdit' }); else t.blur();
    }
  });
  el.addEventListener('focusout', (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    if (t.classList?.contains('cell-edit') && t.value === t.defaultValue) setTimeout(() => { if (t.isConnected) void dispatch({ type: 'cancelEdit' }); }, 0);
  });
  // A picker's search narrows its list on screen only, so nothing ticked is lost. The Bow-ties side
  // list works the same way, scoped to its aside.
  el.addEventListener('input', (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    if (!t.matches?.('[data-filter-list]')) return;
    const q = t.value.trim().toLowerCase();
    for (const li of /** @type {NodeListOf<HTMLElement>} */ (t.closest('form, [data-filter-scope]')?.querySelectorAll('[data-pick-text]') ?? [])) {
      li.hidden = q !== '' && !String(li.dataset.pickText).includes(q);
    }
  });
  // A click on the dimmed page around a picker closes it.
  el.addEventListener('click', (e) => {
    if (/** @type {HTMLElement} */ (e.target).classList?.contains('picker-overlay')) void dispatch({ type: 'closePicker' });
  });
  el.addEventListener('change', (e) => {
    const t = /** @type {HTMLInputElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-change]'));
    if (!t) return;
    // A tickbox says whether it is ticked, not its value (which is always "on").
    const value = t.type === 'checkbox' ? String(t.checked) : t.value;
    void dispatch({ type: t.dataset.change, ...t.dataset, [t.name || 'value']: value });
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
  // Where focus is heading: pressing on a field, or tabbing to one. Leaving a box applies its edit
  // and redraws before focus lands, so the redraw is told where it was going.
  /** @type {Element | null} */
  let moving = null;
  const fieldAt = (/** @type {EventTarget | null} */ t) => (/** @type {Element | null} */ (t))?.closest?.('input, textarea, select') ?? null;
  appEl.addEventListener('pointerdown', (e) => { moving = fieldAt(e.target); }, true);
  appEl.addEventListener('focusout', (e) => { moving = fieldAt(/** @type {FocusEvent} */ (e).relatedTarget) ?? moving; }, true);
  appEl.addEventListener('focusin', () => { moving = null; }, true);
  // Tab leaves a box (applying it) before the browser says where focus goes: work it out here.
  appEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const all = /** @type {HTMLElement[]} */ ([...appEl.querySelectorAll('input, textarea, select, button, a[href], [tabindex]:not([tabindex="-1"])')])
      .filter((x) => !(/** @type {any} */ (x).disabled) && x.offsetParent !== null);
    const i = all.indexOf(/** @type {HTMLElement} */ (e.target));
    moving = i < 0 ? null : all[i + (e.shiftKey ? -1 : 1)] ?? null;
  }, true);
  /** @param {any} state */
  const paint = (state) => {
    document.documentElement.dataset.theme = themeOf(state);
    const drafts = captureDrafts(appEl, submitting, moving);
    appEl.innerHTML = renderApp(state);
    restoreDrafts(appEl, drafts);
    // A box just opened in place (edit, add, a picker's search) takes the cursor.
    const opened = /** @type {HTMLInputElement | null} */ (appEl.querySelector('[autofocus]'));
    if (opened && !appEl.contains(document.activeElement)) {
      opened.focus();
      if (opened.classList.contains('cell-edit')) opened.select();
    }
    // The designer repaints itself as it is edited; the app repaints it only when asked to open it.
    if (state.designerRevision !== designerRevision) {
      designerRevision = state.designerRevision;
      paintDesigner();
    }
  };
  wire(appEl, controller.dispatch, submitting);
  resizableColumns(appEl, controller.dispatch);
  bowtieDrag(appEl, controller.dispatch);
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
 * Drag a header's right edge to resize its column. Only that column and the table's least width
 * change, once per frame, and the width is kept on the profile when you let go. The fill column
 * (data-grow) has no fixed width: dragging it sets the least it takes, starting from its width on
 * screen, so dragging it past the window's edge makes the table scroll.
 * @param {HTMLElement} el @param {(action: any) => Promise<void>} dispatch
 */
function resizableColumns(el, dispatch) {
  el.addEventListener('pointerdown', (e) => {
    const grip = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-resize]'));
    if (!grip || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const { table: tableId, key } = grip.dataset;
    const table = /** @type {HTMLTableElement} */ (grip.closest('table'));
    const col = /** @type {HTMLElement} */ (table.querySelector(`col[data-col="${CSS.escape(String(key))}"]`));
    const grows = col.hasAttribute('data-grow');
    const startX = e.clientX;
    const nominal = Number(col.dataset.width) || 0;
    const startWidth = grows ? /** @type {HTMLElement} */ (grip.closest('th')).getBoundingClientRect().width : nominal;
    const startTotal = parseFloat(table.style.minWidth) || parseFloat(table.style.width) || table.getBoundingClientRect().width;
    let width = startWidth;
    const stretching = Boolean(table.querySelector('col[data-grow]'));
    const apply = () => {
      const total = `${startTotal - nominal + width}px`;
      // Dragging the fill column fixes its width, and the table then follows its columns, so it can
      // shrink below the page; any other column moves alone.
      if (grows) { col.style.width = `${width}px`; table.style.width = total; table.setAttribute('data-fit', ''); } else col.style.width = `${width}px`;
      if (!stretching) table.style.width = total;
      table.style.minWidth = total;
    };
    let frame = 0;
    let moved = false;
    grip.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing');
    /** @param {PointerEvent} m */
    const move = (m) => {
      width = Math.max(Number(grip.dataset.min) || 40, Math.round(startWidth + m.clientX - startX));
      moved = true;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        apply();
      });
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      if (frame) cancelAnimationFrame(frame);
      document.body.classList.remove('resizing');
      if (!moved) return;
      apply();
      if (width === Math.round(startWidth)) return;
      void dispatch({ type: 'setColumnWidth', table: tableId, column: key, width });
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  });
  // Double-click a handle to forget that column's width: the fill column stretches again.
  el.addEventListener('dblclick', (e) => {
    const grip = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-resize]'));
    if (!grip) return;
    e.stopPropagation();
    void dispatch({ type: 'resetColumnWidth', table: grip.dataset.table, column: grip.dataset.key });
  });
}

/**
 * Drag a saved view, or a window by its title bar, onto the left or right half of the Bow-ties
 * stage. Nothing is dispatched until the drop, so nothing redraws mid-drag.
 * @param {HTMLElement} el @param {(action: any) => Promise<void>} dispatch
 */
function bowtieDrag(el, dispatch) {
  /** @type {{ viewId?: string, pane?: string } | null} */
  let dragging = null;
  const stage = () => el.querySelector('.bt-stage');
  const end = () => {
    stage()?.classList.remove('dragging');
    for (const o of el.querySelectorAll('.bt-drop.over')) o.classList.remove('over');
  };
  el.addEventListener('dragstart', (e) => {
    const t = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest?.('[data-drag-view], [data-drag-pane]'));
    if (!t) return;
    dragging = t.dataset.dragView ? { viewId: t.dataset.dragView } : { pane: t.dataset.dragPane };
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', t.dataset.dragView ?? `window ${t.dataset.dragPane}`);
      e.dataTransfer.effectAllowed = 'move';
    }
    // A frame later, so the browser takes the drag image before the targets cover the stage.
    requestAnimationFrame(() => { if (dragging) stage()?.classList.add('dragging'); });
  });
  el.addEventListener('dragover', (e) => {
    const z = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest?.('[data-drop-side]'));
    if (!z || !dragging) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    for (const o of el.querySelectorAll('[data-drop-side]')) o.classList.toggle('over', o === z);
  });
  el.addEventListener('drop', (e) => {
    const z = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest?.('[data-drop-side]'));
    if (!z || !dragging) return;
    e.preventDefault();
    const d = dragging;
    dragging = null;
    end();
    void dispatch({ type: 'dropBowtie', side: z.dataset.dropSide, ...d });
  });
  el.addEventListener('dragend', () => { dragging = null; end(); });
}
