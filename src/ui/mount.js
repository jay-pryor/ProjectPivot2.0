import { renderApp } from './render.js';
import { captureDrafts, restoreDrafts, formIdentity, formValues } from './drafts.js';
import { themeOf } from './prefs.js';
import { clampZoom, ZOOM_MIN, ZOOM_MAX } from './workspace.js';
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
    if (t.dataset.action === 'acknowledge' || t.dataset.action === 'acknowledgeAll') { acknowledged(t, () => Promise.resolve(dispatch({ type: t.dataset.action, ...t.dataset }))); return; }
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
  // A row's Options menu drops below its button, exactly as wide, placed in the window so a table
  // that scrolls sideways cannot clip it; it follows the button as the page scrolls. One menu is
  // open at a time, and a click elsewhere closes it.
  const placeMenu = (/** @type {HTMLDetailsElement} */ d) => {
    const r = /** @type {HTMLElement} */ (d.querySelector('summary')).getBoundingClientRect();
    const body = /** @type {HTMLElement | null} */ (d.querySelector('.row-menu-body'));
    if (!body) return;
    body.style.left = `${r.left}px`;
    body.style.width = `${r.width}px`;
    body.style.top = `${r.bottom + 2}px`;
  };
  el.addEventListener('toggle', (e) => {
    const d = /** @type {HTMLDetailsElement} */ (e.target);
    if (!d.classList?.contains('row-menu') || !d.open) return;
    for (const other of /** @type {NodeListOf<HTMLDetailsElement>} */ (el.querySelectorAll('details.row-menu[open]'))) if (other !== d) other.open = false;
    placeMenu(d);
  }, true);
  document.addEventListener('click', (e) => {
    for (const d of /** @type {NodeListOf<HTMLDetailsElement>} */ (el.querySelectorAll('details.row-menu[open], details.settings-menu[open]'))) if (!d.contains(/** @type {Node} */ (e.target))) d.open = false;
  });
  // Escape closes the settings menu and puts focus back on its three lines.
  document.addEventListener('keydown', (e) => {
    const d = /** @type {HTMLDetailsElement | null} */ (el.querySelector('details.settings-menu[open]'));
    if (e.key !== 'Escape' || !d) return;
    d.open = false;
    d.querySelector('summary')?.focus();
  });
  const followMenus = () => { for (const d of /** @type {NodeListOf<HTMLDetailsElement>} */ (el.querySelectorAll('details.row-menu[open]'))) placeMenu(d); };
  window.addEventListener('scroll', followMenus, true);
  window.addEventListener('resize', followMenus);
  // Double-click a value to change it in place.
  el.addEventListener('dblclick', (e) => {
    // Double-clicking a word in a box selects it, not the row the box sits in.
    if (/** @type {HTMLElement} */ (e.target).closest?.('input, textarea, select')) return;
    const t = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-dblclick]'));
    if (t) void dispatch({ type: t.dataset.dblclick, ...t.dataset });
  });
  // In a box opened in place: Enter applies (or just closes if nothing changed), Escape cancels.
  el.addEventListener('keydown', (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    if (e.key === 'Escape') {
      if (t.closest?.('.confirm-overlay')) { void dispatch({ type: 'confirmCancel' }); return; }
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
  // The first drawing of a new screen plays its short arrival (the profile tiles rising in, the app
  // after choosing a profile); any redraw after that shows the screen as it is, without replaying it.
  let screen = '';
  let theme = '';
  // A panel that has just appeared (a rail section, the tier choices) plays its opening once; the
  // redraws that follow every edit inside it leave it still.
  /** @type {Set<string>} */
  let shown = new Set();
  // A title that wraps (a textarea) is still one line: Enter finishes it and a pasted line break is a space.
  appEl.addEventListener('keydown', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (e.key === 'Enter' && t.tagName === 'TEXTAREA' && t.classList.contains('doc-title')) { e.preventDefault(); t.blur(); }
  });
  appEl.addEventListener('input', (e) => {
    const t = /** @type {HTMLTextAreaElement} */ (e.target);
    if (t.tagName === 'TEXTAREA' && t.classList.contains('doc-title') && /[\r\n]/.test(t.value)) t.value = t.value.replace(/\s*[\r\n]+\s*/g, ' ');
  });
  /** @param {any} state */
  const paint = (state) => {
    document.documentElement.dataset.theme = themeOf(state);
    const drafts = captureDrafts(appEl, submitting, moving);
    appEl.classList.toggle('arrive', state.screen !== screen);
    screen = state.screen;
    // Likewise the theme switch's knob slides across only on the drawing that changes the theme.
    const t = themeOf(state);
    appEl.classList.toggle('theme-flipped', theme !== '' && t !== theme);
    theme = t;
    appEl.innerHTML = renderApp(state);
    restoreDrafts(appEl, drafts);
    const now = new Set();
    for (const el of /** @type {NodeListOf<HTMLElement>} */ (appEl.querySelectorAll('[data-reveal]'))) {
      const key = /** @type {string} */ (el.dataset.reveal);
      now.add(key);
      if (!shown.has(key)) el.classList.add('reveal');
    }
    shown = now;
    fitAttention(appEl);
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
  window.addEventListener('resize', () => fitAttention(appEl));
  wire(appEl, controller.dispatch, submitting);
  resizableColumns(appEl, controller.dispatch);
  bowtieDrag(appEl, controller.dispatch);
  bowtiePanZoom(appEl, controller.dispatch);
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
 * Acknowledging shows that it took: the rows flash orange and fold away, the change is made, and
 * the rows below slide up into the space (any that now fit rise in). Without motion, the rows
 * simply go. A screen reader hears that it was acknowledged.
 * @param {HTMLElement} button @param {() => Promise<unknown>} act
 */
function acknowledged(button, act) {
  const all = button.dataset.action === 'acknowledgeAll';
  const rows = /** @type {HTMLElement[]} */ (all
    ? [...(button.closest('section, article, .rail-panel')?.querySelectorAll('tr:has([data-action="acknowledge"])') ?? [])]
    : [button.closest('tr')].filter(Boolean));
  const n = all ? rows.length || 1 : 1;
  const still = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  for (const b of /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll('[data-action="acknowledge"], [data-action="acknowledgeAll"]'))) b.disabled = true;
  for (const r of rows) r.classList.add('ack-out');
  setTimeout(async () => {
    const before = rowPositions();
    await act();
    if (!still) slideRows(before);
    const note = document.createElement('div');
    note.className = 'sr-only';
    note.setAttribute('role', 'status');
    note.textContent = n === 1 ? 'Acknowledged' : `${n} acknowledged`;
    document.body.append(note);
    setTimeout(() => note.remove(), 2000);
  }, still || !rows.length ? 0 : 420);
}

/** The rows of the open-item lists that are showing, by key, and where they sit. */
function rowPositions() {
  /** @type {Map<string, number>} */
  const at = new Map();
  for (const tr of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('table.attn tr[data-key], table[data-table^="home"] tr[data-row]'))) {
    if (!tr.hidden) at.set(listKey(tr), tr.getBoundingClientRect().top);
  }
  return at;
}

/** @param {HTMLElement} tr */
const listKey = (tr) => tr.dataset.key ?? `${tr.closest('table')?.dataset.table}:${tr.dataset.row}`;

/**
 * After a redraw, each row that was showing slides from where it was to where it is now; a row
 * that was not showing before rises in.
 * @param {Map<string, number>} before
 */
function slideRows(before) {
  const now = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('table.attn tr[data-key], table[data-table^="home"] tr[data-row]')].filter((tr) => !(/** @type {HTMLElement} */ (tr)).hidden));
  for (const tr of now) {
    const was = before.get(listKey(tr));
    if (was === undefined) { tr.classList.add('ack-in'); continue; }
    const dy = was - tr.getBoundingClientRect().top;
    if (!dy) continue;
    tr.style.transition = 'none';
    tr.style.transform = `translateY(${dy}px)`;
    void tr.offsetHeight;
    tr.style.transition = 'transform .32s cubic-bezier(.2, .8, .2, 1)';
    tr.style.transform = '';
  }
}

/**
 * Needs attention is a fixed share of the window's height and shows only the rows that fit whole;
 * when some are left out, its link says how many there are in all.
 * @param {HTMLElement} root
 */
function fitAttention(root) {
  for (const fit of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll('.attn-fit'))) {
    const rows = /** @type {HTMLElement[]} */ ([...fit.querySelectorAll('tbody tr')]);
    for (const r of rows) r.hidden = false;
    const bottom = fit.getBoundingClientRect().bottom;
    let hidden = 0;
    for (const r of rows) {
      if (hidden || r.getBoundingClientRect().bottom > bottom + 0.5) { r.hidden = true; hidden += 1; }
    }
    const more = /** @type {HTMLElement | null} */ (fit.parentElement?.querySelector('[data-attn-more] button'));
    const total = Number(/** @type {HTMLElement} */ (fit.parentElement?.querySelector('[data-attn-more]'))?.dataset.total ?? 0);
    if (more) more.textContent = hidden ? `See all ${total} →` : total > rows.length ? `See all ${total} →` : 'Open items →';
  }
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

/**
 * A bow-tie window's drawing zooms with the wheel, gliding to where the wheel sends it and keeping
 * the point under the pointer still, and moves when dragged. The zoom buttons glide the same way.
 * It all happens on screen alone; once the drawing settles, the window's view is kept (one redraw).
 * @param {HTMLElement} el @param {(action: any) => Promise<void>} dispatch
 */
function bowtiePanZoom(el, dispatch) {
  const still = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  /**
   * Each window's view as shown, and where it is gliding to: a zoom about a point (the wheel, the
   * buttons) or a whole view (Fit). Read afresh from the drawing whenever the window is at rest.
   * @typedef {{ z: number, x: number, y: number, to: null | { z: number, ax?: number, ay?: number, x?: number, y?: number },
   *   frame: number, last: number, settle: ReturnType<typeof setTimeout> | undefined, dragging: boolean }} Live
   */
  /** @type {Map<string, Live>} */
  const live = new Map();
  const diagramOf = (/** @type {string} */ side) => /** @type {HTMLElement | null} */ (el.querySelector(`.bt-diagram.pannable[data-side="${side}"]`));
  /** @param {HTMLElement} d @returns {Live} */
  const liveOf = (d) => {
    const side = String(d.dataset.side);
    let v = live.get(side);
    const busy = v && (v.frame || v.dragging || v.settle);
    if (!v || !busy) {
      const c = /** @type {HTMLElement} */ (d.querySelector('.bt-canvas'));
      v = { z: Number(c.dataset.zoom) || 1, x: Number(c.dataset.x) || 0, y: Number(c.dataset.y) || 0, to: null, frame: 0, last: 0, settle: undefined, dragging: false };
      live.set(side, v);
    }
    return v;
  };
  /** Where the drawing's own top-left corner sits on screen, before it is moved. @param {HTMLElement} d @param {Live} v */
  const origin = (d, v) => {
    const r = /** @type {HTMLElement} */ (d.querySelector('.bt-canvas')).getBoundingClientRect();
    return { left: r.left - v.x, top: r.top - v.y };
  };
  /** @param {string} side @param {Live} v */
  const show = (side, v) => {
    const d = diagramOf(side);
    if (!d) return;
    const c = /** @type {HTMLElement} */ (d.querySelector('.bt-canvas'));
    c.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`;
    const bar = d.closest('.bt-window');
    const level = bar?.querySelector('[data-bt-zoom="fit"]');
    if (level) level.textContent = Math.abs(v.z - 1) < 0.0005 && !Math.round(v.x) && !Math.round(v.y) ? 'Fit' : `${Math.round(v.z * 100)}%`;
    const out = /** @type {HTMLButtonElement | null | undefined} */ (bar?.querySelector('[data-bt-zoom="out"]'));
    const inn = /** @type {HTMLButtonElement | null | undefined} */ (bar?.querySelector('[data-bt-zoom="in"]'));
    if (out) out.disabled = v.z <= ZOOM_MIN + 1e-6;
    if (inn) inn.disabled = v.z >= ZOOM_MAX - 1e-6;
  };
  /** Keep the view once the drawing has been still a moment. @param {string} side @param {Live} v */
  const settle = (side, v) => {
    clearTimeout(v.settle);
    v.settle = setTimeout(() => {
      v.settle = undefined;
      if (v.frame || v.dragging) return;
      void dispatch({ type: 'viewBowtie', side, zoom: v.z, x: v.x, y: v.y });
    }, 250);
  };
  /** One step of the glide, a fixed share of the way per moment whatever the frame rate. @param {string} side @param {Live} v @param {number} now */
  const step = (side, v, now) => {
    v.frame = 0;
    const to = v.to;
    if (!to) return;
    const k = still() ? 1 : 1 - Math.exp(-(now - (v.last || now - 16)) / 70);
    v.last = now;
    const z = Math.abs(Math.log(to.z / v.z)) < 0.002 ? to.z : v.z * (to.z / v.z) ** k;
    if (to.ax !== undefined && to.ay !== undefined) {
      // The point under the pointer stays where it is as the drawing grows or shrinks about it.
      v.x = to.ax - (to.ax - v.x) * (z / v.z);
      v.y = to.ay - (to.ay - v.y) * (z / v.z);
      v.z = z;
      if (z === to.z) v.to = null;
    } else {
      const tx = to.x ?? 0, ty = to.y ?? 0;
      v.z = z;
      v.x += (tx - v.x) * k;
      v.y += (ty - v.y) * k;
      if (z === to.z && Math.abs(tx - v.x) < 0.5 && Math.abs(ty - v.y) < 0.5) { v.x = tx; v.y = ty; v.to = null; }
    }
    show(side, v);
    if (v.to) v.frame = requestAnimationFrame((t) => step(side, v, t));
    else { v.last = 0; settle(side, v); }
  };
  /** @param {string} side @param {Live} v */
  const glide = (side, v) => {
    clearTimeout(v.settle);
    v.settle = undefined;
    if (!v.frame) v.frame = requestAnimationFrame((t) => step(side, v, t));
  };
  /** Zoom by a factor about a point on screen. @param {HTMLElement} d @param {number} factor @param {number} cx @param {number} cy */
  const zoomBy = (d, factor, cx, cy) => {
    const side = String(d.dataset.side);
    const v = liveOf(d);
    const o = origin(d, v);
    const z = clampZoom((v.to?.z ?? v.z) * factor);
    v.to = { z, ax: cx - o.left, ay: cy - o.top };
    glide(side, v);
  };
  el.addEventListener('wheel', (e) => {
    const d = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest?.('.bt-diagram.pannable'));
    if (!d) return;
    e.preventDefault();
    // Lines and pages become pixels; a trackpad pinch (sent as the wheel with Ctrl) moves in small steps, so counts for more.
    const px = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
    zoomBy(d, Math.exp(-px * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY);
  }, { passive: false });
  el.addEventListener('click', (e) => {
    const b = /** @type {HTMLButtonElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-bt-zoom]'));
    const d = /** @type {HTMLElement | null | undefined} */ (b?.closest('.bt-window')?.querySelector('.bt-diagram.pannable'));
    if (!b || !d) return;
    const r = d.getBoundingClientRect();
    if (b.dataset.btZoom === 'fit') {
      const v = liveOf(d);
      v.to = { z: 1, x: 0, y: 0 };
      glide(String(d.dataset.side), v);
      return;
    }
    zoomBy(d, b.dataset.btZoom === 'in' ? 1.25 : 1 / 1.25, r.left + r.width / 2, r.top + r.height / 2);
  });
  el.addEventListener('pointerdown', (e) => {
    const d = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('.bt-diagram.pannable'));
    if (!d || e.button !== 0) return;
    e.preventDefault();
    const side = String(d.dataset.side);
    const v = liveOf(d);
    if (v.frame) cancelAnimationFrame(v.frame);
    v.frame = 0;
    v.to = null;
    v.last = 0;
    clearTimeout(v.settle);
    v.settle = undefined;
    v.dragging = true;
    const start = { px: e.clientX, py: e.clientY, x: v.x, y: v.y };
    // However far it is dragged, a strip of the drawing stays in the window to drag it back by.
    const box = d.getBoundingClientRect();
    const o = origin(d, v);
    const c = /** @type {HTMLElement} */ (d.querySelector('.bt-canvas'));
    const keep = 60;
    const clamp = (/** @type {number} */ n, /** @type {number} */ lo, /** @type {number} */ hi) => Math.min(Math.max(n, lo), Math.max(lo, hi));
    let moved = false;
    d.setPointerCapture(e.pointerId);
    d.classList.add('panning');
    /** @param {PointerEvent} m */
    const move = (m) => {
      const dx = m.clientX - start.px, dy = m.clientY - start.py;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      v.x = clamp(start.x + dx, box.left + keep - o.left - c.offsetWidth * v.z, box.right - keep - o.left);
      v.y = clamp(start.y + dy, box.top + keep - o.top - c.offsetHeight * v.z, box.bottom - keep - o.top);
      if (!v.frame) v.frame = requestAnimationFrame(() => { v.frame = 0; show(side, v); });
    };
    const up = () => {
      d.removeEventListener('pointermove', move);
      d.removeEventListener('pointerup', up);
      d.removeEventListener('pointercancel', up);
      d.classList.remove('panning');
      if (v.frame) cancelAnimationFrame(v.frame);
      v.frame = 0;
      v.dragging = false;
      if (!moved) return;
      show(side, v);
      settle(side, v);
    };
    d.addEventListener('pointermove', move);
    d.addEventListener('pointerup', up);
    d.addEventListener('pointercancel', up);
  });
}
