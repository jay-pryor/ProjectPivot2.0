import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { build, collectSources, rewriteImports } from '../scripts/build.js';

/**
 * A throwaway project: one baseline file, one module with a contract and a source that
 * imports both, a test file and a null double that must not be embedded.
 * @returns {string} its root
 */
function fixtureProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pivot-build-'));
  const write = (/** @type {string} */ rel, /** @type {string} */ text) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  write('baseline/types.js', 'export const answer = 42;\n');
  write('baseline/tokens.css', ':root { --x: 1; }\n');
  write('baseline/scripts/build.js', 'export const notRuntime = true;\n');
  write('modules/m/contract.js', "import { answer } from '../../baseline/types.js';\nexport function get() { return answer; }\n");
  write('modules/m/src/main.js', "import { get } from '../contract.js';\nimport('./lazy.js');\ndocument.body.textContent = String(get());\n");
  write('modules/m/src/lazy.js', 'export const lazy = 1;\n');
  write('modules/m/null_double.js', 'export function get() { return 0; }\n');
  write('modules/m/conformance/m.test.js', "import '../contract.js';\n");
  return root;
}

test('runtime sources are baseline/*.js, each contract, and each src tree, nothing else', () => {
  const root = fixtureProject();
  assert.deepEqual(collectSources(root), ['baseline/types.js', 'modules/m/contract.js', 'modules/m/src/lazy.js', 'modules/m/src/main.js']);
});

test('relative imports become project-relative specifiers; comments are left alone', () => {
  const known = new Set(['baseline/types.js', 'modules/m/contract.js', 'modules/m/src/main.js']);
  const out = rewriteImports("import { a } from '../../../baseline/types.js';\nexport * from \"../contract.js\";\n// import x from './nothing.js'\n", 'modules/m/src/main.js', known);
  assert.equal(out, "import { a } from 'baseline/types.js';\nexport * from \"modules/m/contract.js\";\n// import x from './nothing.js'\n");
});

test('a bare or unknown import fails the build with the file named', () => {
  const known = new Set(['modules/m/src/main.js']);
  assert.throws(() => rewriteImports("import yaml from 'js-yaml';\n", 'modules/m/src/main.js', known), /modules\/m\/src\/main.js: imports "js-yaml".*no dependency/);
  assert.throws(() => rewriteImports("import x from './gone.js';\n", 'modules/m/src/main.js', known), /resolves to modules\/m\/src\/gone.js/);
});

test('the page holds every module in one import map, the tokens, and the entry', () => {
  const root = fixtureProject();
  const page = build({ root, entry: 'modules/m/src/main.js', builtAt: 'TEST' });
  assert.match(page, /^<!doctype html>/);
  assert.ok(page.includes('<meta name="pivot-build" content="TEST">'));
  assert.ok(page.includes(':root { --x: 1; }'));
  const mapText = /<script type="importmap">(.*?)<\/script>/s.exec(page);
  assert.ok(mapText);
  const map = JSON.parse(mapText[1]);
  assert.deepEqual(Object.keys(map.imports).sort(), ['baseline/types.js', 'modules/m/contract.js', 'modules/m/src/lazy.js', 'modules/m/src/main.js']);
  const decode = (/** @type {string} */ spec) => Buffer.from(map.imports[spec].replace('data:text/javascript;base64,', ''), 'base64').toString('utf8');
  assert.equal(decode('modules/m/contract.js'), "import { answer } from 'baseline/types.js';\nexport function get() { return answer; }\n");
  assert.equal(decode('modules/m/src/main.js'), "import { get } from 'modules/m/contract.js';\nimport('modules/m/src/lazy.js');\ndocument.body.textContent = String(get());\n");
  assert.ok(page.includes('<script type="module">import "modules/m/src/main.js";</script>'));
  assert.ok(!page.includes('notRuntime') && !page.includes('return 0;'), 'scripts and null doubles are not embedded');
});

test('an entry that is not a runtime source fails the build', () => {
  const root = fixtureProject();
  assert.throws(() => build({ root, entry: 'modules/views/src/main.js' }), /entry modules\/views\/src\/main.js is not among the runtime sources/);
});
