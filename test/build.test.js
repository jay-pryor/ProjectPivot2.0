import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build, collectSources, rewriteImports } from '../scripts/build.js';

test('the page embeds every module behind one import map and the styles inline', () => {
  const page = build({ builtAt: 'test' });
  const map = JSON.parse(/<script type="importmap">(.*?)<\/script>/s.exec(page)[1]);
  assert.ok(map.imports['src/main.js']);
  assert.ok(map.imports['DocGen/doc-designer.js']);
  assert.ok(map.imports['src/storage/store.js']);
  assert.match(page, /<script type="module">import "src\/main.js";<\/script>/);
  assert.match(page, /\.docgen \.modal/, 'DocGen styles inlined');
  assert.match(page, /\.topbar/, 'Pivot styles inlined');
  assert.match(page, /<div id="pivot"><\/div>/);
  const controller = Buffer.from(map.imports['src/ui/controller.js'].split(',')[1], 'base64').toString('utf8');
  assert.match(controller, /from 'src\/storage\/store.js'/, 'relative imports are rewritten to project paths');
  assert.match(controller, /from 'DocGen\/doc-designer.js'/);
});

test('sources are src/**/*.js and DocGen', () => {
  const s = collectSources(new URL('..', import.meta.url).pathname);
  assert.ok(s.includes('src/core/merge.js'));
  assert.ok(s.includes('DocGen/doc-designer.js'));
  assert.ok(!s.some((x) => x.startsWith('test/')));
});

test('a bare import is refused: the product has no dependencies', () => {
  assert.throws(() => rewriteImports("import x from 'lodash';", 'src/a.js', new Set(['src/a.js'])), /no dependenc/);
});
