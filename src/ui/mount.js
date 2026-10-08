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
    // The button pressed is sent too (a picker's choices are its buttons, each with its own value).
    const submitter = /** @type {SubmitEvent} */ (e).submitter;
    void dispatch({ type: f.dataset.action, ...f.dataset, ...formValues(new FormData(f, submitter?.getAttribute('name') ? submitter : null)) }).finally(() => submitting.delete(identity));
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
    // A ⋯ menu is wider than its button, so it opens leftwards from the button's right edge.
    const dots = d.classList.contains('dots');
    if (!dots) body.style.width = `${r.width}px`;
    else body.style.width = '';
    const left = dots ? Math.max(4, r.right - body.offsetWidth) : r.left;
    const top = r.bottom + 2;
    body.style.left = `${left}px`;
    body.style.top = `${top}px`;
    // Inside a panel still moving into place (a transform), "fixed" is measured from the panel, not
    // the window: where it landed says how far off that is, and it is moved by as much.
    const at = body.getBoundingClientRect();
    if (Math.abs(at.left - left) > 0.5 || Math.abs(at.top - top) > 0.5) {
      body.style.left = `${left - (at.left - left)}px`;
      body.style.top = `${top - (at.top - top)}px`;
    }
  };
  el.addEventListener('toggle', (e) => {
    const d = /** @type {HTMLDetailsElement} */ (e.target);
    if (!d.classList?.contains('row-menu') || !d.open) return;
    for (const other of /** @type {NodeListOf<HTMLDetailsElement>} */ (el.querySelectorAll('details.row-menu[open]'))) if (other !== d) other.open = false;
    placeMenu(d);
  }, true);
  document.addEventListener('click', (e) => {
    for (const d of /** @type {NodeListOf<HTMLDetailsElement>} */ (el.querySelectorAll('details.row-menu[open], details.settings-menu[open], details.dots-menu[open]'))) if (!d.contains(/** @type {Node} */ (e.target))) d.open = false;
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
      // A box being edited in place is put back first: closing it would otherwise report what was
      // typed as a change, and keep it.
      if (t.classList?.contains('cell-edit')) restore(t);
      if (t.classList?.contains('cell-edit') || t.closest?.('.new-record, .new-row, .comments + form, form.fill')) void dispatch({ type: 'cancelEdit' });
      return;
    }
    // In a box of several lines, Shift+Enter starts a new line; Enter alone applies, as in one.
    if (e.key === 'Enter' && t.classList?.contains('cell-edit') && !(t.tagName === 'TEXTAREA' && e.shiftKey)) {
      e.preventDefault();
      if (unchanged(t)) void dispatch({ type: 'cancelEdit' }); else t.blur();
    }
  });
  el.addEventListener('focusout', (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    if (t.classList?.contains('cell-edit') && unchanged(t)) setTimeout(() => { if (t.isConnected) void dispatch({ type: 'cancelEdit' }); }, 0);
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
  // A picker's Add new shows its new-record fields in place (nothing redraws, so ticks stay) and
  // puts the cursor in them; again, it hides and empties them.
  el.addEventListener('click', (e) => {
    const b = /** @type {HTMLButtonElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-show-new]'));
    const section = /** @type {HTMLElement | null | undefined} */ (b?.closest('form')?.querySelector('[data-new-section]'));
    if (!b || !section) return;
    const show = section.hidden;
    section.hidden = !show;
    b.setAttribute('aria-expanded', String(show));
    b.classList.toggle('on', show);
    const box = /** @type {HTMLInputElement | null} */ (section.querySelector('input'));
    if (show) box?.focus(); else if (box) box.value = '';
  });
  // A click on the dimmed page around a picker closes it.
  el.addEventListener('click', (e) => {
    if (/** @type {HTMLElement} */ (e.target).classList?.contains('picker-overlay')) void dispatch({ type: 'closePicker' });
  });
  // In an add form offering entries to tick, the box may be left empty while any is ticked.
  el.addEventListener('change', (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    const form = t.name === 'pick' ? t.closest('form[data-picks]') : null;
    const box = /** @type {HTMLInputElement | null | undefined} */ (form?.querySelector('input[name="text"]'));
    if (box) box.required = !form?.querySelector('input[name="pick"]:checked');
  });
  el.addEventListener('change', (e) => {
    const t = /** @type {HTMLInputElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-change]'));
    if (!t) return;
    // A tickbox says whether it is ticked, not its value (which is always "on").
    const value = t.type === 'checkbox' ? String(t.checked) : t.value;
    void dispatch({ type: t.dataset.change, ...t.dataset, [t.name || 'value']: value });
  });
}

/**
 * A box opened in place still holds what it opened with: its text, or for a list the option it
 * opened on.
 * @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} t
 */
function unchanged(t) {
  if (t instanceof HTMLSelectElement) return [...t.options].every((o) => o.selected === o.defaultSelected);
  return t.value === t.defaultValue;
}

/** Put a box opened in place back to what it opened with. @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} t */
function restore(t) {
  if (t instanceof HTMLSelectElement) for (const o of t.options) o.selected = o.defaultSelected;
  else t.value = t.defaultValue;
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
    reselect();
    showImages();
    fitAll(appEl);
    // A box just opened in place (edit, add, a picker's search) takes the cursor.
    const opened = /** @type {HTMLInputElement | null} */ (appEl.querySelector('[autofocus]'));
    if (opened && !appEl.contains(document.activeElement)) {
      opened.focus();
      // A text box opened in place has its words selected, ready to type over; a list has none to select.
      if (opened.classList.contains('cell-edit') && opened instanceof HTMLInputElement && opened.type === 'text') opened.select();
    }
    // The designer repaints itself as it is edited; the app repaints it only when asked to open it.
    if (state.designerRevision !== designerRevision) {
      designerRevision = state.designerRevision;
      paintDesigner();
    }
  };
  window.addEventListener('resize', () => { fitAttention(appEl); fitAll(appEl); });
  // A box of several lines grows (and shrinks back) to fit its text as it is typed in.
  appEl.addEventListener('input', (e) => { const t = /** @type {HTMLElement} */ (e.target); if (t instanceof HTMLTextAreaElement) fit(t); });
  wire(appEl, controller.dispatch, submitting);
  resizableColumns(appEl, controller.dispatch);
  bowtieDrag(appEl, controller.dispatch);
  bowtiePanZoom(appEl, controller.dispatch);
  bowtieLinkFocus(appEl);
  favouriteDrag(appEl, controller.dispatch);
  const reselectHistory = historySelect(appEl, controller.dispatch);
  const reselectOptions = assignSelect(appEl, controller.dispatch);
  const reselect = () => { reselectHistory(); reselectOptions(); };
  const showImages = platformImages(appEl, controller);
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

/**
 * Choosing rows on screen alone, while a tool that works on rows is on (bundling a history's
 * changes, assigning facet options to a platform group): press and drag over rows to choose a run
 * of them, Shift-click to choose from the last row clicked to this one, Ctrl-click (Cmd on a Mac)
 * to add or take away one row. The tool's Confirm sends the rows chosen. The choice survives a
 * redraw, and ends when the tool is turned off. A click outside the table and the tool's form lets
 * go of the rows; Escape does too, and with none chosen, turns the tool off.
 * @param {HTMLElement} el @param {(action: any) => Promise<void>} dispatch
 * @param {{ scope: string, form: string, count: string, confirm: string, min: number, cancel: any,
 *   submit: (form: HTMLFormElement, rows: HTMLElement[]) => any }} o
 *   scope: the element present while choosing; submit: the action to send for the rows chosen (null for none)
 * @returns {() => void} call after each redraw, to show the rows still chosen
 */
function rowSelect(el, dispatch, { scope, form: formSel, count: countSel, confirm: confirmSel, min, cancel, submit }) {
  const rowSel = `${scope} tr[data-selectable]`;
  /** @type {Set<string>} */
  let chosen = new Set();
  /** @type {string | null} */
  let anchor = null;
  const rows = () => /** @type {HTMLElement[]} */ ([...el.querySelectorAll(rowSel)]);
  const show = () => {
    const all = rows();
    if (!el.querySelector(scope)) { chosen = new Set(); anchor = null; return; }
    for (const tr of all) {
      const on = chosen.has(String(tr.dataset.row));
      tr.classList.toggle('chosen', on);
      tr.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    const n = all.filter((tr) => chosen.has(String(tr.dataset.row))).length;
    const count = el.querySelector(countSel);
    if (count) count.textContent = n ? `${n} chosen` : 'None chosen';
    const confirm = /** @type {HTMLButtonElement | null} */ (el.querySelector(confirmSel));
    if (confirm) confirm.disabled = n < min;
  };
  /** The rows from one to another, in the order shown. @param {string} a @param {string} b */
  const between = (a, b) => {
    const keys = rows().map((tr) => String(tr.dataset.row));
    const [i, j] = [keys.indexOf(a), keys.indexOf(b)].sort((x, y) => x - y);
    return i < 0 ? [b] : keys.slice(i, j + 1);
  };
  el.addEventListener('pointerdown', (e) => {
    const tr = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest(rowSel));
    if (!tr || e.button !== 0 || /** @type {HTMLElement} */ (e.target).closest('button, a, input, textarea, select, form')) return;
    e.preventDefault();
    const key = String(tr.dataset.row);
    const add = e.ctrlKey || e.metaKey;
    if (e.shiftKey && anchor) {
      // Shift: from the last row clicked to this one; with Ctrl too, added to what is chosen.
      const run = between(anchor, key);
      chosen = add ? new Set([...chosen, ...run]) : new Set(run);
      show();
      return;
    }
    if (add) {
      if (chosen.has(key)) chosen.delete(key); else chosen.add(key);
      anchor = key;
      show();
      return;
    }
    // A plain press starts afresh from this row; dragging stretches the run to the row under the pointer.
    anchor = key;
    chosen = new Set([key]);
    show();
    const move = (/** @type {PointerEvent} */ m) => {
      const over = /** @type {HTMLElement | null} */ (document.elementFromPoint(m.clientX, m.clientY)?.closest(rowSel) ?? null);
      if (!over || !anchor) return;
      chosen = new Set(between(anchor, String(over.dataset.row)));
      show();
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.body.classList.remove('choosing');
    };
    document.body.classList.add('choosing');
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  });
  const clear = () => {
    if (!chosen.size) return false;
    chosen = new Set();
    anchor = null;
    show();
    return true;
  };
  document.addEventListener('pointerdown', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (!el.querySelector(scope) || t.closest?.(`${scope} table, ${formSel}`)) return;
    clear();
  });
  // A box being edited in the table keeps Escape to itself.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !el.querySelector(scope) || document.querySelector('.confirm-overlay, .picker-overlay')) return;
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.closest?.(`${scope} table input, ${scope} table textarea, ${scope} table form`)) return;
    e.preventDefault();
    if (!clear()) void dispatch(cancel);
  });
  el.addEventListener('submit', (e) => {
    const form = /** @type {HTMLFormElement | null} */ (/** @type {HTMLElement} */ (e.target).closest(formSel));
    if (!form) return;
    e.preventDefault();
    const picked = rows().filter((tr) => chosen.has(String(tr.dataset.row)));
    if (picked.length < min) return;
    const action = submit(form, picked);
    if (action) void dispatch(action);
  });
  return show;
}

/**
 * Choosing history rows in bundle mode: two or more changes, sent with the bundle's What and comment.
 * @param {HTMLElement} el @param {(action: any) => Promise<void>} dispatch
 */
function historySelect(el, dispatch) {
  return rowSelect(el, dispatch, {
    scope: '.history.bundling', form: 'form[data-bundle-form]', count: '[data-bundle-count]', confirm: '[data-bundle-confirm]', min: 2,
    cancel: { type: 'toggleBundling' },
    submit: (form, picked) => {
      const field = (/** @type {string} */ name) => /** @type {HTMLInputElement | null} */ (form.querySelector(`input[name="${name}"]`))?.value ?? '';
      return { type: 'createBundle', entryIds: picked.map((tr) => String(tr.dataset.row)), text: field('bundleComment'), title: field('bundleTitle') };
    },
  });
}

/**
 * Choosing a facet's options on Info to assign to a platform group: one or more rows (a row shown
 * once per group it is in counts once), sent with the group and facet the tool is on.
 * @param {HTMLElement} el @param {(action: any) => Promise<void>} dispatch
 */
function assignSelect(el, dispatch) {
  return rowSelect(el, dispatch, {
    scope: '.info-assigning', form: 'form[data-assign-form]', count: '[data-assign-count]', confirm: '[data-assign-confirm]', min: 1,
    cancel: { type: 'cancelAssignToGroup' },
    submit: (form, picked) => ({ type: 'assignToGroup', facet: form.dataset.facet, groupId: form.dataset.groupId, optionIds: [...new Set(picked.map((tr) => String(tr.dataset.optionId)))] }),
  });
}

/**
 * Favourite pages in edit mode: drag a row or block onto another to put it there. A favourite
 * that opens its page (role="link") opens with Enter too.
 * @param {HTMLElement} el @param {(action: any) => Promise<void>} dispatch
 */
function favouriteDrag(el, dispatch) {
  /** @type {string | null} */
  let from = null;
  const clear = () => { for (const o of el.querySelectorAll('.drop-before, .drop-after, .dragging-fav')) o.classList.remove('drop-before', 'drop-after', 'dragging-fav'); };
  el.addEventListener('dragstart', (e) => {
    const t = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest?.('[data-fav-index]'));
    if (!t) return;
    from = String(t.dataset.favIndex);
    t.classList.add('dragging-fav');
    if (e.dataTransfer) { e.dataTransfer.setData('text/plain', `favourite ${Number(from) + 1}`); e.dataTransfer.effectAllowed = 'move'; }
  });
  el.addEventListener('dragover', (e) => {
    const t = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest?.('[data-fav-index]'));
    if (!t || from === null) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    for (const o of el.querySelectorAll('.drop-before, .drop-after')) if (o !== t) o.classList.remove('drop-before', 'drop-after');
    // Moving down, it lands after the one dropped on; moving up, before it.
    const later = Number(t.dataset.favIndex) > Number(from);
    t.classList.toggle('drop-after', later);
    t.classList.toggle('drop-before', !later && t.dataset.favIndex !== from);
  });
  el.addEventListener('drop', (e) => {
    const t = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest?.('[data-fav-index]'));
    if (!t || from === null) return;
    e.preventDefault();
    const to = String(t.dataset.favIndex);
    const was = from;
    from = null;
    clear();
    if (to !== was) void dispatch({ type: 'moveFavourite', from: was, to });
  });
  el.addEventListener('dragend', () => { from = null; clear(); });
  el.addEventListener('keydown', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (e.key === 'Enter' && t.matches?.('[role="link"][data-action]')) { e.preventDefault(); t.click(); }
  });
}

/**
 * Platform images: each <img data-stored> drawn is filled from the data folder, read once and kept
 * as an object URL, so a redraw shows it at once. A file missing from the folder says so in its box.
 * Choosing a file in a platform's Add image picker hands it to the controller.
 * @param {HTMLElement} el @param {{ dispatch: (action: any) => Promise<void>, readStoredFile: (stored: string) => Promise<File> }} controller
 * @returns {() => void} call after each redraw
 */
function platformImages(el, controller) {
  /** @type {Map<string, Promise<string | null>>} */
  const urls = new Map();
  const url = (/** @type {string} */ stored) => {
    let u = urls.get(stored);
    if (!u) {
      u = controller.readStoredFile(stored).then((f) => URL.createObjectURL(f), () => null);
      urls.set(stored, u);
    }
    return u;
  };
  el.addEventListener('change', (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    if (t.type !== 'file' || !t.dataset.imageFor) return;
    const file = t.files?.[0];
    t.closest('details')?.removeAttribute('open');
    if (file) void controller.dispatch({ type: 'addPlatformImage', id: t.dataset.imageFor, file });
    t.value = '';
  });
  return () => {
    for (const img of /** @type {NodeListOf<HTMLImageElement>} */ (el.querySelectorAll('img[data-stored]'))) {
      const stored = String(img.dataset.stored);
      void url(stored).then((u) => {
        if (!img.isConnected) return;
        if (u) img.src = u;
        else img.closest('.image-box')?.classList.add('missing');
      });
    }
  };
}

/**
 * A box of several lines (justifications, SFARP, descriptions, notes) as tall as its text, so all of
 * it shows without scrolling inside it; never shorter than its rows ask for. Not a one-line title.
 * @param {HTMLTextAreaElement} t
 */
function fit(t) {
  // One not drawn (in a closed part of the page) has no height to measure: left as it is.
  if (t.classList.contains('doc-title') || !t.isConnected || t.offsetParent === null) return;
  t.style.height = 'auto';
  const cs = getComputedStyle(t);
  const edge = cs.boxSizing === 'border-box' ? parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth) : -(parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom));
  t.style.height = `${t.scrollHeight + edge}px`;
}

/** Every box of several lines on the screen fitted to its text. @param {HTMLElement} root */
function fitAll(root) {
  for (const t of /** @type {NodeListOf<HTMLTextAreaElement>} */ (root.querySelectorAll('textarea'))) fit(t);
}

/**
 * Pointing at a box on a bow-tie brings forward its links and what they reach, and fades the rest:
 * a control, the causal factors it prevents or the consequences it mitigates, and its line to the
 * hazard; a causal factor or a consequence, the controls that stand against it and their lines.
 * @param {HTMLElement} el
 */
function bowtieLinkFocus(el) {
  const clear = (/** @type {Element} */ svg) => {
    svg.classList.remove('bt-focus');
    for (const o of svg.querySelectorAll('.bt-on, .bt-same')) o.classList.remove('bt-on', 'bt-same');
  };
  const NODES = 'g[data-bowtie-node$="-control"], g[data-bowtie-node="causal-factor"], g[data-bowtie-node="consequence"]';
  el.addEventListener('pointerover', (e) => {
    const g = /** @type {SVGGElement | null} */ (/** @type {Element} */ (e.target).closest?.(NODES));
    const svg = g?.closest('svg');
    if (!g || !svg) return;
    clear(svg);
    const id = g.getAttribute('data-record-id') ?? '';
    svg.classList.add('bt-focus');
    // The traditional view: the rows the box stands on (every row a control is repeated on) and all
    // on them; the box itself and its copies on the other rows marked apart from the rest.
    if (svg.getAttribute('data-bowtie-layout') === 'traditional') {
      const same = [...svg.querySelectorAll('g[data-record-id]')].filter((b) => b.getAttribute('data-record-id') === id);
      const rows = new Set(same.map((b) => b.getAttribute('data-bowtie-row')));
      for (const o of svg.querySelectorAll('[data-bowtie-row]')) if (rows.has(o.getAttribute('data-bowtie-row'))) o.classList.add('bt-on');
      for (const b of same) b.classList.add('bt-same');
      return;
    }
    const control = String(g.getAttribute('data-bowtie-node')).endsWith('-control');
    // From a control, its links go out by its id; to a causal factor or consequence, they come in by its.
    const links = [...svg.querySelectorAll('[data-bowtie-link]')].filter((p) => p.getAttribute(control ? 'data-bowtie-link' : 'data-bowtie-target') === id);
    // The controls concerned: this one, or those standing against this causal factor or consequence.
    const controls = new Set(control ? [id] : links.map((p) => String(p.getAttribute('data-bowtie-link'))));
    // One no control stands against fades every line: nothing leads to it.
    g.classList.add('bt-on');
    for (const p of links) {
      p.classList.add('bt-on');
      const other = p.getAttribute(control ? 'data-bowtie-target' : 'data-bowtie-link');
      for (const box of svg.querySelectorAll('g[data-record-id]')) if (box.getAttribute('data-record-id') === other) box.classList.add('bt-on');
    }
    // And each one's line to the hazard.
    for (const edge of svg.querySelectorAll('[data-bowtie-edge]')) if (controls.has(String(edge.getAttribute('data-bowtie-edge')))) edge.classList.add('bt-on');
  });
  el.addEventListener('pointerout', (e) => {
    const g = /** @type {Element} */ (e.target).closest?.(NODES);
    const svg = g?.closest('svg');
    if (g && svg && !g.contains(/** @type {Node | null} */ (e.relatedTarget))) clear(svg);
  });
}
