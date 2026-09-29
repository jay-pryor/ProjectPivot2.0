/**
 * The HIGHCOM splash that plays as Pivot opens: the shield traces, powers on and locks, then
 * docks left as the wordmark slides out. It plays over the app, which is already drawn beneath,
 * then fades away; a click or any key skips it, and reduced motion shows the finished logo.
 * Adapted from MediaAssets/highcom-splash.html without its preview controls or web fonts.
 */

const DUR = 2720;
const HOLD = 450;
const FADE = 380;
/** How long the splash lasts when left to play, from start to gone. */
export const SPLASH_MS = DUR + HOLD + FADE;

/** The drawing. Ids carry an `hc-` prefix so they cannot meet the app's. */
export const SPLASH_SVG = `<svg class="splash-logo" viewBox="-70 -95 1004 396" role="img" aria-label="HIGHCOM">
  <defs>
    <clipPath id="hc-sil-clip"><path d="M0,0 L185,0 L185,138.41 L92.5,206.4 L0,138.41 Z"/></clipPath>
    <clipPath id="hc-stripe-clip"><rect x="136" y="-40" width="70" height="260"/></clipPath>
    <clipPath id="hc-word-clip"><rect id="hc-word-clip-rect" x="197" y="-60" width="800" height="300"/></clipPath>
    <clipPath id="hc-ink-clip"><use href="#hc-frame"/><use href="#hc-column"/><use href="#hc-leg"/><use href="#hc-crossbar"/><use href="#hc-st0"/><use href="#hc-st1"/><use href="#hc-st2"/><use href="#hc-st3"/><use href="#hc-st4"/></clipPath>
    <clipPath id="hc-hot-clip"><rect x="138.8" y="-40" width="70" height="260"/></clipPath>
    <linearGradient id="hc-sheen-grad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" style="stop-color: var(--hc-accent); stop-opacity: 0"/>
      <stop offset=".2" style="stop-color: var(--hc-accent); stop-opacity: .12"/>
      <stop offset=".36" style="stop-color: var(--hc-accent); stop-opacity: .5"/>
      <stop offset=".5" style="stop-color: var(--hc-sheen-core); stop-opacity: .95"/>
      <stop offset=".64" style="stop-color: var(--hc-accent); stop-opacity: .5"/>
      <stop offset=".8" style="stop-color: var(--hc-accent); stop-opacity: .12"/>
      <stop offset="1" style="stop-color: var(--hc-accent); stop-opacity: 0"/>
    </linearGradient>
  </defs>
  <g id="hc-shield">
    <g id="hc-core">
      <g clip-path="url(#hc-sil-clip)">
        <path id="hc-frame" class="ink" d="M0,0 L118,0 L118,22 L22,22 L22,127.98 L92.5,179.8 L185,111.81 L185,138.41 L92.5,206.4 L0,138.41 Z" opacity="0"/>
        <path id="hc-column" class="ink" d="M112,0 L173.5,0 L138.8,25.51 L138.8,160 L112,178 Z" opacity="0"/>
        <path id="hc-leg" class="ink" d="M41.5,33.6 L73,33.6 L73,151.9 L41.5,129 Z" opacity="0"/>
        <path id="hc-crossbar" class="ink" d="M70,68.6 L115,68.6 L115,92.8 L70,92.8 Z" opacity="0"/>
        <g clip-path="url(#hc-stripe-clip)">
          <path id="hc-st0" class="ink stripe" transform="translate(-64.46 47.38)" d="M120,51.98 L185,4.2 L185,13.2 L120,60.98 Z"/>
          <path id="hc-st1" class="ink stripe" transform="translate(-64.46 47.38)" d="M120,73.62 L185,25.85 L185,34.85 L120,82.62 Z"/>
          <path id="hc-st2" class="ink stripe" transform="translate(-64.46 47.38)" d="M120,95.28 L185,47.5 L185,56.5 L120,104.28 Z"/>
          <path id="hc-st3" class="ink stripe" transform="translate(-64.46 47.38)" d="M120,116.92 L185,69.15 L185,78.15 L120,125.92 Z"/>
          <path id="hc-st4" class="ink stripe" transform="translate(-64.46 47.38)" d="M120,138.57 L185,90.8 L185,99.8 L120,147.57 Z"/>
        </g>
        <g clip-path="url(#hc-hot-clip)">
          <path class="hot" opacity="0" d="M120,51.98 L185,4.2 L185,13.2 L120,60.98 Z"/>
          <path class="hot" opacity="0" d="M120,73.62 L185,25.85 L185,34.85 L120,82.62 Z"/>
          <path class="hot" opacity="0" d="M120,95.28 L185,47.5 L185,56.5 L120,104.28 Z"/>
          <path class="hot" opacity="0" d="M120,116.92 L185,69.15 L185,78.15 L120,125.92 Z"/>
          <path class="hot" opacity="0" d="M120,138.57 L185,90.8 L185,99.8 L120,147.57 Z"/>
        </g>
        <g clip-path="url(#hc-ink-clip)">
          <rect id="hc-sheen" x="-62" y="-40" width="110" height="300" fill="url(#hc-sheen-grad)" opacity="0"/>
        </g>
      </g>
    </g>
    <path id="hc-trace-l" class="trace" d="M92.5,206.4 L0,138.41 L0,0 L92.5,0" opacity="0"/>
    <path id="hc-trace-r" class="trace" d="M92.5,206.4 L185,138.41 L185,0 L92.5,0" opacity="0"/>
    <g id="hc-spark-l" opacity="0"><path class="spark" d="M0,0 L-11,-5.5 L-7.5,0 L-11,5.5 Z"/></g>
    <g id="hc-spark-r" opacity="0"><path class="spark" d="M0,0 L-11,-5.5 L-7.5,0 L-11,5.5 Z"/></g>
  </g>
  <g clip-path="url(#hc-word-clip)">
    <g transform="translate(231.6 26.9) scale(1.685)">
      <path class="letter" data-x="0.0" transform="translate(0.0 0)" opacity="0" d="M0,0 H16.9 V25.2 H25.4 V0 H42.3 V68 H25.4 V37.9 H16.9 V68 H0 Z"/>
      <path class="letter" data-x="57.1" transform="translate(57.1 0)" opacity="0" d="M0,0 H17 V68 H0 Z"/>
      <path class="letter" data-x="88.5" transform="translate(88.5 0)" opacity="0" d="M0,10.5 A10.5,10.5 0 0 1 10.5,0 H31.8 A10.5,10.5 0 0 1 42.3,10.5 V21 H25.5 V12.3 H16.6 V55.1 H25.4 V42.7 L20.9,37.6 V29.4 H42.3 V68 H32.8 C30.6,68 28.2,66.2 26.4,64.2 C25.4,66.2 24.2,67.6 22.4,68 H10.5 A10.5,10.5 0 0 1 0,57.5 Z"/>
      <path class="letter" data-x="145.3" transform="translate(145.3 0)" opacity="0" d="M0,0 H16.9 V25.2 H25.4 V0 H42.3 V68 H25.4 V37.9 H16.9 V68 H0 Z"/>
      <path class="letter accent" data-x="202.4" transform="translate(202.4 0)" opacity="0" d="M0,10.5 A10.5,10.5 0 0 1 10.5,0 H31.8 A10.5,10.5 0 0 1 42.3,10.5 V25 H25 V12.3 H16.6 V55.1 H25 V42.2 H42.3 V57.5 A10.5,10.5 0 0 1 31.8,68 H10.5 A10.5,10.5 0 0 1 0,57.5 Z"/>
      <path class="letter accent" data-x="259.1" transform="translate(259.1 0)" opacity="0" d="M0,10.5 A10.5,10.5 0 0 1 10.5,0 H31.8 A10.5,10.5 0 0 1 42.3,10.5 V57.5 A10.5,10.5 0 0 1 31.8,68 H10.5 A10.5,10.5 0 0 1 0,57.5 Z M16.9,12.3 V55.1 H25.4 V12.3 Z"/>
      <path class="letter accent" data-x="316.1" transform="translate(316.1 0)" opacity="0" d="M0,0 H14.5 L29.6,29.3 L44.7,0 H59.2 V68 H42.7 V39.8 L29.6,64.6 L16.5,39.8 V68 H0 Z"/>
    </g>
  </g>
</svg>`;

/**
 * Play the splash over the page, then take it away. Resolves once it has gone.
 * @param {Document} doc
 * @returns {Promise<void>}
 */
export function playSplash(doc) {
  const win = /** @type {Window} */ (doc.defaultView);
  const overlay = doc.createElement('div');
  overlay.className = 'splash';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `<div class="splash-flash"></div>${SPLASH_SVG}`;
  doc.body.append(overlay);

  const $ = (/** @type {string} */ id) => /** @type {any} */ (overlay.querySelector(`#hc-${id}`));
  const CX = 92.5, CY = 103.2;
  const START_X = 339.5, START_S = 1.35;
  const STRIPE_DIR = [-64.46, 47.38];
  const clamp = (/** @type {number} */ v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const P = (/** @type {number} */ t, /** @type {number} */ s, /** @type {number} */ d) => clamp((t - s) / d);
  const lerp = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ p) => a + (b - a) * p;
  const ease = {
    outExpo: (/** @type {number} */ p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
    outCubic: (/** @type {number} */ p) => 1 - Math.pow(1 - p, 3),
    inOutCubic: (/** @type {number} */ p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    inQuad: (/** @type {number} */ p) => p * p,
    outBack: (/** @type {number} */ p) => { const c1 = 1.25, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
  };
  const mix = (/** @type {number} */ m) => (m <= 0 ? '' : `color-mix(in srgb, var(--hc-accent) ${(m * 100).toFixed(1)}%, var(--hc-fg))`);
  const tf = (/** @type {Element} */ el, /** @type {string} */ v) => el.setAttribute('transform', v);
  const op = (/** @type {Element} */ el, /** @type {number} */ v) => el.setAttribute('opacity', v.toFixed(3));

  const shield = $('shield'), core = $('core'), frame = $('frame'), column = $('column'), leg = $('leg'), bar = $('crossbar'), sheen = $('sheen');
  const clipRect = $('word-clip-rect');
  const flash = /** @type {HTMLElement} */ (overlay.querySelector('.splash-flash'));
  const traces = [$('trace-l'), $('trace-r')];
  const sparks = [$('spark-l'), $('spark-r')];
  const lens = traces.map((p) => p.getTotalLength());
  traces.forEach((p, i) => { p.style.strokeDasharray = `${lens[i]} ${lens[i]}`; });
  const stripes = [...overlay.querySelectorAll('.stripe')];
  const hots = [...overlay.querySelectorAll('.hot')];
  const letters = /** @type {SVGElement[]} */ ([...overlay.querySelectorAll('.letter')]);
  const FLICKER = [0.9, 0.12, 1];
  const flicker = (/** @type {number} */ p) => (p <= 0 ? 0 : p >= 1 ? 1 : FLICKER[Math.floor(p * FLICKER.length)]);

  /** @param {number} t milliseconds into the animation */
  function render(t) {
    // The hairline traces the silhouette from the chevron point; arrowheads meet at the top.
    const tp = ease.inOutCubic(P(t, 0, 520));
    const traceOp = t <= 0 ? 0 : 1 - P(t, 980, 240);
    traces.forEach((p, i) => { p.style.strokeDashoffset = String(lens[i] * (1 - tp)); op(p, traceOp); });
    sparks.forEach((s, i) => {
      const len = lens[i], l = len * tp;
      const pt = traces[i].getPointAtLength(l);
      const a = traces[i].getPointAtLength(Math.min(Math.max(l - 1, 0), len - 1));
      const b = traces[i].getPointAtLength(Math.min(Math.max(l, 1), len));
      const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      const v = t <= 0 ? 0 : Math.min(clamp((l - 7) / 18), clamp((len - l - 1) / 18));
      tf(s, `translate(${pt.x} ${pt.y}) rotate(${ang}) scale(${Math.max(v, 0.001)})`);
      op(s, Math.min(1, v * 1.6));
    });
    // The frame powers on, the legs extrude, the crossbar slams home.
    op(frame, flicker(P(t, 500, 100)));
    const pl = P(t, 600, 380);
    tf(leg, `translate(0 ${-62 * (1 - ease.outBack(pl))})`); op(leg, P(t, 600, 60));
    const pc = P(t, 640, 320);
    tf(column, `translate(0 ${-90 * (1 - ease.outExpo(pc))})`); op(column, P(t, 640, 50));
    const pb = ease.inQuad(P(t, 800, 180));
    tf(bar, `translate(115 0) scale(${Math.max(pb, 0.0001)} 1) translate(-115 0)`); op(bar, t > 800 ? 1 : 0);
    // Blades deploy from the column, bottom first.
    stripes.forEach((s, k) => {
      const order = stripes.length - 1 - k;
      const d = 1 - ease.outExpo(P(t, 840 + order * 55, 360));
      const move = `translate(${STRIPE_DIR[0] * d} ${STRIPE_DIR[1] * d})`;
      tf(s, move); tf(hots[k], move);
      const sg = 2000 + order * 60;
      op(hots[k], P(t, sg, 80) * (1 - ease.outCubic(P(t, sg + 80, 380))));
    });
    // Lock: a pulse, a sheen of orange across the plate, a breath of orange behind.
    const pulse = 1 - 0.035 * Math.sin(Math.PI * P(t, 980, 240));
    tf(core, `translate(${CX} ${CY}) scale(${pulse}) translate(${-CX} ${-CY})`);
    const ps = P(t, 930, 560);
    const sx = lerp(-155, 345, 0.5 - Math.cos(Math.PI * ps) / 2);
    tf(sheen, `translate(${sx} 0) rotate(24 -7 110)`);
    op(sheen, ps <= 0 || ps >= 1 ? 0 : Math.min(1, ps / 0.12, (1 - ps) / 0.2));
    const pf = P(t, 975, 520);
    flash.style.opacity = (pf <= 0 || pf >= 1 ? 0 : (pf < 0.08 ? pf / 0.08 : Math.pow(1 - (pf - 0.08) / 0.92, 2)) * 0.13).toFixed(3);
    // The shield docks left and the wordmark slides out from behind it.
    const pm = ease.inOutCubic(P(t, 1200, 620));
    const X = lerp(START_X, 0, pm), S = lerp(START_S, 1, pm);
    tf(shield, `translate(${CX + X} ${CY}) scale(${S}) translate(${-CX} ${-CY})`);
    clipRect.setAttribute('x', (CX + X + CX * S + 8).toFixed(2));
    letters.forEach((l, i) => {
      const s = 1350 + i * 45;
      const e = ease.outExpo(P(t, s, 560));
      tf(l, `translate(${Number(l.dataset.x) - 30 * (1 - e)} 0)`);
      op(l, P(t, s, 180));
      if (l.classList.contains('accent')) {
        const m = ease.outCubic(P(t, 1740 + (i - 4) * 70, 260));
        l.style.fill = m >= 1 ? 'var(--hc-accent)' : mix(m);
      }
    });
  }

  return new Promise((resolve) => {
    let finished = false;
    /** @param {number} fadeMs */
    const finish = (fadeMs) => {
      if (finished) return;
      finished = true;
      win.removeEventListener('keydown', skip, true);
      overlay.style.transition = `opacity ${fadeMs}ms ease`;
      overlay.style.opacity = '0';
      win.setTimeout(() => { overlay.remove(); resolve(); }, fadeMs);
    };
    const skip = (/** @type {Event} */ e) => { e.preventDefault(); e.stopPropagation(); finish(180); };
    overlay.addEventListener('pointerdown', skip);
    win.addEventListener('keydown', skip, true);

    if (win.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      render(DUR);
      win.setTimeout(() => finish(FADE), 700);
      return;
    }
    render(0);
    let start = /** @type {number | null} */ (null);
    const tick = (/** @type {number} */ now) => {
      if (finished) return;
      if (start === null) start = now;
      const t = Math.min(DUR, now - start);
      render(t);
      if (t < DUR) win.requestAnimationFrame(tick);
      else win.setTimeout(() => finish(FADE), HOLD);
    };
    win.requestAnimationFrame(tick);
  });
}
