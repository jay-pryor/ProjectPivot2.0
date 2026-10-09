import { html } from '../html.js';
import { idTag } from './common.js';

/** A hazard's onboarding cards (filled in by the next task). @param {any} _state @param {any} _data @param {any} _wf @param {{ hazard: any, reportId: string }} x @param {any} _prog @param {boolean} _mine */
export function hazardCards(_state, _data, _wf, x, _prog, _mine) {
  return html`<div class="wf-hazard-h"><h2>${idTag(x.reportId)} ${x.hazard.title}</h2></div>`;
}
