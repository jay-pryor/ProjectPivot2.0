import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('blocks have sharp corners; only round things (the + buttons) are round', () => {
  const css = fs.readFileSync(new URL('../../src/ui/styles.css', import.meta.url), 'utf8');
  const radii = [...css.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1].trim());
  assert.deepEqual([...new Set(radii)].sort(), ['0', '0 !important', '50%']);
  assert.match(css, /\.docgen, \.docgen \* \{ border-radius: 0 !important; \}/, 'the report designer too');
});
