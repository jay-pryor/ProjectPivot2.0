import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPLASH_SVG } from '../../src/ui/splash.js';

test('the opening lines trace the shield with nothing on their ends', () => {
  assert.match(SPLASH_SVG, /id="hc-trace-l"/);
  assert.match(SPLASH_SVG, /id="hc-trace-r"/);
  assert.doesNotMatch(SPLASH_SVG, /spark/, 'no arrowheads (or dots) riding the lines');
});
