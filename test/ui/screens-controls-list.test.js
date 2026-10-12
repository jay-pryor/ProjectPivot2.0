import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlsView } from '../../src/ui/screens/controls.js';
import { assignNumbers } from '../../src/core/ops/hazards.js';
import { state } from './screens-workflows.test.js';
import { seed } from '../helpers.js';

const row = () => {
  const out = controlsView({ ...state, view: { name: 'controls' } }, assignNumbers(seed())).toString();
  return out.slice(out.indexOf('<tr', out.indexOf('<tbody')), out.indexOf('</tr>', out.indexOf('<tbody')));
};

test('a control’s name is plain text: its number and the row open it', () => {
  assert.match(row(), /data-view="control"[^>]*>C-001</);
  assert.doesNotMatch(row(), /<button[^>]*>Sprinklers<\/button>/);
  assert.match(row(), />Sprinklers</);
});

test('its hazards are dot points, only the HAZ number a link, the name beside it as text', () => {
  assert.match(row(), /<ul class="plain dots"><li><button type="button" class="link" data-action="go" data-view="hazard" data-id="h1">HAZ-001<\/button> Fire<\/li><\/ul>/);
});

test('its platforms are dot points of plain names, as on the Hazards tab', () => {
  assert.match(row(), /<ul class="plain dots"><li>Alpha<\/li><li>Bravo<\/li><\/ul>/);
});
