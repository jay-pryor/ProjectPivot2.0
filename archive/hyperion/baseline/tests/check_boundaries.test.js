import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { check, parseManifest, surfaceViolation, isTestCode } from '../scripts/check_boundaries.js';

/**
 * @param {Record<string, string | undefined>} files rel path -> text; undefined leaves the file out
 * @returns {string} root
 */
function project(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pivot-bounds-'));
  for (const [rel, text] of Object.entries(files)) {
    if (text === undefined) continue;
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}

const CLEAN = {
  'baseline/types.js': 'export const t = 1;\n',
  'baseline/faults.js': 'export function fault_point() {}\n',
  'modules/store/manifest.yaml': 'module: store\nallowed_imports:\n  - baseline/types\n',
  'modules/store/contract.js': "import { t } from '../../baseline/types.js';\nexport const store = t;\n",
  'modules/store/src/impl.js': "import '../contract.js';\n",
  'modules/registry/manifest.yaml': 'module: registry\nallowed_imports:\n  - modules/store/contract\n  - baseline/faults\n',
  'modules/registry/contract.js': "import { store } from '../store/contract.js';\nexport const r = store;\n",
  'modules/registry/conformance/registry.test.js': "import '../contract.js';\nimport { fault_point } from '../../../baseline/faults.js';\n",
  'modules/store/conformance/store.test.js': "import '../contract.js';\n",
};

test('manifest parsing needs no YAML library', () => {
  assert.deepEqual(parseManifest('module: trajectory\nallowed_imports:\n  - baseline/units   # a comment\n  - "modules/atmosphere/contract"\n'), { module: 'trajectory', allowed_imports: ['baseline/units', 'modules/atmosphere/contract'] });
  assert.deepEqual(parseManifest('module: views\nallowed_imports: []\n'), { module: 'views', allowed_imports: [] });
});

test('a clean graph passes and is summarised per module', () => {
  const { errors, summary } = check(project(CLEAN));
  assert.deepEqual(errors, []);
  assert.equal(summary.at(-1), 'OK 2 module(s); the import graph matches the manifests and is acyclic');
  assert.ok(summary.includes('registry  2 import(s): baseline/faults, modules/store/contract'));
});

test('surface: production code may not reach past a contract; tests may reuse a suite', () => {
  assert.equal(surfaceViolation('modules/store/contract.js', 'store', false), null);
  assert.match(String(surfaceViolation('modules/store/src/impl.js', 'store', false)), /reaches into store's internals \(src\/impl.js\)/);
  assert.match(String(surfaceViolation('modules/store/conformance/x.test.js', 'store', false)), /from production code/);
  assert.equal(surfaceViolation('modules/store/conformance/x.test.js', 'store', true), null);
  // A test reusing another module's suite is allowed at the surface, and, as in the
  // framework's Python checker, is still an import the manifest must declare.
  const reuse = check(project({
    ...CLEAN,
    'modules/registry/conformance/registry.test.js': "import '../contract.js';\nimport { fault_point } from '../../../baseline/faults.js';\nimport '../../store/conformance/store.test.js';\n",
  })).errors;
  assert.deepEqual(reuse, ['modules/registry/conformance/registry.test.js:3: imports modules/store/conformance/store.test, which modules/registry/manifest.yaml does not list']);
  assert.equal(isTestCode('modules/store/src/impl.js'), false);
  assert.equal(isTestCode('validation/invariants/x.test.js'), true);
  const root = project({ ...CLEAN, 'modules/registry/src/reach.js': "import '../../store/src/impl.js';\n" });
  const { errors } = check(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^modules\/registry\/src\/reach.js:1: reaches into store's internals/);
});

test('declared and drawn: the manifest and the code must agree both ways', () => {
  const undeclared = check(project({ ...CLEAN, 'modules/store/manifest.yaml': 'module: store\nallowed_imports: []\n' })).errors;
  assert.deepEqual(undeclared, ['modules/store/contract.js:1: imports baseline/types, which modules/store/manifest.yaml does not list']);
  const undrawn = check(project({ ...CLEAN, 'modules/store/manifest.yaml': 'module: store\nallowed_imports:\n  - baseline/types\n  - baseline/faults\n' })).errors;
  assert.deepEqual(undrawn, ['modules/store/manifest.yaml: declares baseline/faults, which no file in the module imports; the module map draws an edge that is not there']);
  const missing = check(project({ ...CLEAN, 'modules/store/manifest.yaml': undefined })).errors;
  assert.ok(missing.some((e) => e.includes('modules/store: no manifest.yaml')));
});

test('acyclic: a module cycle and a baseline import of a module both fail', () => {
  const cyclic = check(project({
    ...CLEAN,
    'modules/store/manifest.yaml': 'module: store\nallowed_imports:\n  - baseline/types\n  - modules/registry/contract\n',
    'modules/store/src/impl.js': "import '../contract.js';\nimport '../../registry/contract.js';\n",
  })).errors;
  assert.deepEqual(cyclic, ['circular dependency: registry -> store -> registry; the decomposition is wrong, not the check']);
  const inverted = check(project({ ...CLEAN, 'baseline/types.js': "import '../modules/store/contract.js';\nexport const t = 1;\n" })).errors;
  assert.ok(inverted.some((e) => e.startsWith('baseline/: imports modules/store/contract.js (baseline/types.js:1)')), inverted.join('\n'));
});

test('a bare specifier is a dependency the product does not have', () => {
  const { errors } = check(project({ ...CLEAN, 'modules/store/src/impl.js': "import yaml from 'js-yaml';\nimport fs from 'node:fs';\n" }));
  assert.deepEqual(errors, ['modules/store/src/impl.js:1: imports "js-yaml", a bare specifier; the product has no third-party dependency (DEC-003, IMP-06)']);
});
