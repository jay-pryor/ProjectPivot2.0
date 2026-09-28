/**
 * doc-designer.test.js: the document designer's own test suites, kept out of the module
 * so they don't ship in a host's build. They run with no host application and no DOM.
 *
 *     node doc-designer.test.js
 *
 * The harness (App.test) is the one that used to be embedded in doc-designer.js; a host
 * that wants to run the suites in a browser can import this file and call App.test.run().
 */
import { App } from './doc-designer.js';
  /* =============================================================================
   * MODULE: App.test  — embedded test harness
   * PURPOSE: Tiny in-file test runner (spec §15). assert/assertEqual(deep)/
   *          assertDeepEqual + suite/test registrar. Runs only on #selftest or via
   *          a dev button; MUST NOT run in normal use.
   * PURITY:  harness is pure; rendering touches the DOM only when explicitly run.
   * DEPENDS: App.util.html (esc)
   * INVARIANTS:
   *   * registering a suite never executes it; run() executes all.
   *   * run() RESOLVES A PROMISE. A test fn may return a thenable (the folder-storage
   *     suites are promise-based end to end); one that returns anything else is
   *     treated as having passed the moment it returns, so the 170-odd synchronous
   *     suites needed no edit when this went async.
   *   * Tests run STRICTLY SEQUENTIALLY, and concurrent run() calls are serialised
   *     against each other (_running). Suites share global App state — App.store.init,
   *     the active platform, the injected clock — so any interleaving is a flake
   *     factory. Under #selftest in jsdom there ARE two callers (boot below, and
   *     tools/run-selftests.js), which is exactly the case this guards.
   * ============================================================================= */
  (function (App) {
    'use strict';

    var _suites = []; // {name, tests:[{name, fn}]}
    var _running = null; // tail of the serialised run chain (see INVARIANTS)

    /** Register a suite of tests. */
    function suite(name, registerFn) {
      var tests = [];
      registerFn({
        test: function (tname, fn) { tests.push({ name: tname, fn: fn }); }
      });
      _suites.push({ name: name, tests: tests });
    }

    function deepEqual(a, b) {
      if (a === b) return true;
      if (typeof a !== typeof b) return false;
      if (a == null || b == null) return a === b;
      if (typeof a !== 'object') return a === b;
      if (Array.isArray(a) !== Array.isArray(b)) return false;
      var ka = Object.keys(a), kb = Object.keys(b);
      if (ka.length !== kb.length) return false;
      ka.sort(); kb.sort();
      for (var i = 0; i < ka.length; i++) {
        if (ka[i] !== kb[i]) return false;
        if (!deepEqual(a[ka[i]], b[kb[i]])) return false;
      }
      return true;
    }

    function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert failed'); }
    function assertEqual(actual, expected, msg) {
      if (actual !== expected) throw new Error((msg || 'assertEqual failed') + '\n  actual:   ' + repr(actual) + '\n  expected: ' + repr(expected));
    }
    function assertDeepEqual(actual, expected, msg) {
      if (!deepEqual(actual, expected)) throw new Error((msg || 'assertDeepEqual failed') + '\n  actual:   ' + repr(actual) + '\n  expected: ' + repr(expected));
    }
    function assertThrows(fn, msg) {
      var threw = false;
      try { fn(); } catch (e) { threw = true; }
      if (!threw) throw new Error(msg || 'expected function to throw');
    }
    function repr(v) {
      try { return typeof v === 'string' ? v : JSON.stringify(v); } catch (e) { return String(v); }
    }

    function errText(e) { return (e && e.message) || String(e); }

    /**
     * Run all registered suites, sequentially, awaiting any test that returns a
     * thenable. Serialised against any run already in flight.
     * @returns {Promise<{suites:Object[], passed:number, failed:number}>}
     */
    function run() {
      _running = (_running || Promise.resolve()).then(runOnce);
      return _running;
    }

    function runOnce() {
      var results = [];
      var passed = 0, failed = 0;
      // One promise chain, appended to per test, so tests never overlap.
      var chain = Promise.resolve();
      _suites.forEach(function (su) {
        var suiteRes = { name: su.name, tests: [] };
        results.push(suiteRes);
        su.tests.forEach(function (tc) {
          chain = chain.then(function () {
            function pass() { suiteRes.tests.push({ name: tc.name, ok: true }); passed++; }
            function fail(e) { suiteRes.tests.push({ name: tc.name, ok: false, error: errText(e) }); failed++; }
            var out;
            try { out = tc.fn(); } catch (e) { fail(e); return; }
            // Anything that is not a thenable has already finished, synchronously.
            if (!out || typeof out.then !== 'function') { pass(); return; }
            return out.then(pass, fail);
          });
        });
      });
      return chain.then(function () {
        return { suites: results, passed: passed, failed: failed };
      });
    }

    /**
     * Run all suites and render the results into a fresh DOM panel.
     * @returns {Promise<{suites:Object[], passed:number, failed:number}>}
     */
    function runAndRender(rootEl) {
      rootEl.innerHTML = '<div id="selftest-root"><h2>Self-tests</h2><div class="st-summary">running…</div></div>';
      return run().then(function (res) { return render(rootEl, res); });
    }

    function render(rootEl, res) {
      var esc = App.util.html.esc;
      var html = '<div id="selftest-root">';
      html += '<h2>Self-tests</h2>';
      html += '<div class="st-summary ' + (res.failed ? 'st-fail' : 'st-pass') + '">' +
              esc(res.passed + ' passed, ' + res.failed + ' failed') + '</div>';
      for (var s = 0; s < res.suites.length; s++) {
        var su = res.suites[s];
        html += '<div class="st-suite"><h3>' + esc(su.name) + '</h3>';
        for (var t = 0; t < su.tests.length; t++) {
          var tc = su.tests[t];
          if (tc.ok) {
            html += '<div class="st-test st-pass">PASS  ' + esc(tc.name) + '</div>';
          } else {
            html += '<div class="st-test st-fail">FAIL  ' + esc(tc.name) + '</div>';
            html += '<div class="st-diff">' + esc(tc.error) + '</div>';
          }
        }
        html += '</div>';
      }
      html += '</div>';
      rootEl.innerHTML = html;
      return res;
    }

    App.test = {
      suite: suite, run: run, runAndRender: runAndRender,
      assert: assert, assertEqual: assertEqual, assertDeepEqual: assertDeepEqual,
      assertThrows: assertThrows, deepEqual: deepEqual
    };
  })(App);

  /* =============================================================================
   * SUITES: the document module's own tests
   * PURPOSE: Everything here runs with NO host application present. These are the
   *          suites that ship inside doc-designer.js, so the module can be trusted
   *          by a host that is not the CH Config Tool.
   * INVARIANTS: nothing in this block may reference a name src/app/ owns — the
   *             build enforces it. A fixture is a literal, never a project built
   *             through somebody's store.
   * ============================================================================= */
  (function (App) {
    'use strict';
    var T = App.test;

    /* ===== SUITES: declarative section rendering (PROV-1) ===== */

    /* A provider that declares its rows, its key column and its columns should not
     * also have to write the code that turns them into a table. All three CH adapters
     * implemented renderReportSection as a single pass-through to App.report
     * .buildSection with their own declared columns — boilerplate the module can do
     * once, and one more thing for a new host to get wrong. */
    T.suite('PROV-1 a provider that declares its columns needs no render function', function (s) {
      var provider = {
        id: 'demo', label: 'Demo',
        keyColumn: { id: '_key', label: 'Thing', w: 2, get: function (r) { return r.key; } },
        columns: [{ id: 'note', label: 'Note', w: 3, get: function (r) { return r.note; } }],
        rows: function () { return [{ key: 'b', note: 'second' }, { key: 'a', note: 'first' }]; }
      };

      s.test('the module builds the table when render is absent', function () {
        var out = App.docProviders.renderSection(provider, provider.rows(), {}, {});
        T.assert(out && typeof out.body === 'string', 'no body produced');
        T.assert(out.body.indexOf('Thing') !== -1, 'the key column heading is missing');
        T.assert(out.body.indexOf('Note') !== -1, 'the declared column heading is missing');
        T.assert(out.body.indexOf('first') !== -1, 'a row is missing');
      });

      s.test('rows come out in the order buildSection has always put them in', function () {
        var body = App.docProviders.renderSection(provider, provider.rows(), {}, {}).body;
        T.assert(body.indexOf('first') < body.indexOf('second'), 'rows are not sorted by key');
      });

      s.test('an explicit render function still wins', function () {
        var own = Object.assign({}, provider, {
          render: function () { return { body: 'HAND WRITTEN', children: [] }; }
        });
        T.assertEqual(App.docProviders.renderSection(own, [], {}, {}).body, 'HAND WRITTEN');
      });

      s.test('every result has the same shape, grouped or not', function () {
        var out = App.docProviders.renderSection(provider, provider.rows(), {}, {});
        T.assert(Array.isArray(out.children), 'children must always be an array');
        var none = App.docProviders.renderSection(null, [], {}, {});
        T.assertEqual(none.body, '', 'a missing provider must not throw');
      });
    });
  })(App);

  (function (App) {
    'use strict';
    var T = App.test;

  /* ===== SUITES: the block helpers (BLK-1) ===== */

  /* Four helpers that decide how a block is ORDERED and how its table is WORDED.
   * Nothing in them knows what a device or a control is, so they belong to the module
   * — but they lived in CH's generate block, sharing its closure, which is why the
   * fragment above them could not simply be moved. */
  T.suite('BLK-1 ordering and wording are the module’s, not the host’s', function (s) {
    var B = App.docBlocks;

    s.test('a section order puts the named blocks first, in the order named', function () {
      var list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      T.assertDeepEqual(B.applySectionOrder(list, ['c', 'a']).map(function (x) { return x.id; }),
        ['c', 'a', 'b']);
    });

    s.test('an id nobody named keeps its original position, after those named', function () {
      var list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      T.assertDeepEqual(B.applySectionOrder(list, ['c']).map(function (x) { return x.id; }),
        ['c', 'a', 'b'], 'unnamed blocks must stay in declaration order');
    });

    s.test('an order naming a block that no longer exists is ignored, not fatal', function () {
      // Deleting a dataset must never invalidate an arrangement.
      var list = [{ id: 'a' }, { id: 'b' }];
      T.assertDeepEqual(B.applySectionOrder(list, ['gone', 'b']).map(function (x) { return x.id; }),
        ['b', 'a']);
      T.assertDeepEqual(B.applySectionOrder(list, null).map(function (x) { return x.id; }),
        ['a', 'b'], 'no order at all leaves the list alone');
    });

    s.test('table wording is read off the block, and absent wording is an empty object', function () {
      T.assertDeepEqual(B.tableWording({ tables: { _all: { title: 'T' } } }, '_all'), { title: 'T' });
      T.assertDeepEqual(B.tableWording({}, '_all'), {});
      T.assertDeepEqual(B.tableWording(null, '_all'), {});
    });

    s.test('a column keeps its declared heading until somebody rewords it', function () {
      T.assertDeepEqual(B.headingsFor(['field', 'value'], ['Field', 'Value'], {}), ['Field', 'Value']);
      T.assertDeepEqual(B.headingsFor(['field', 'value'], ['Field', 'Value'], { value: 'Setting' }),
        ['Field', 'Setting']);
      T.assertDeepEqual(B.headingsFor(['field'], ['Field'], { field: '   ' }), ['Field'],
        'whitespace is not a rewording');
    });

    s.test('a caption falls back to the title, then to the default', function () {
      T.assertEqual(B.withWording({}, { title: 'A title' }, 'dflt').captionText, 'A title');
      T.assertEqual(B.withWording({}, {}, 'dflt').captionText, 'dflt');
      T.assertEqual(B.withWording({}, { caption: 'Own' }, 'dflt').captionText, 'Own');
    });

    s.test('CAP-4: no caption means no caption line, so the table takes no number', function () {
      var out = B.withWording({ captionId: 'x' }, { noCaption: true }, 'dflt');
      T.assertEqual(out.captionId, '', 'the caption id must be cleared, not merely blanked');
    });
  });
  })(App);

  (function (App) {
    'use strict';
    var T = App.test;

  /* ===== SUITES: the host contract (HOSTOBJ-1) ===== */

  /* The module used to reach for App.store, App.util.clock and App.ui.activity by
   * name, which is another way of saying it could only ever run inside CH. Everything
   * it needs from the outside world now arrives through one object it is handed. */
  T.suite('HOSTOBJ-1 the module is driven by an explicit host object', function (s) {
    function minimal() {
      var state = { report: {} };
      return {
        getState: function () { return state; },
        commit: function (m) { m(state); },
        // Its own clock, not the app's: a host supplies the time, and a test that
        // borrowed CH's would be proving less than it looks like it is proving.
        clock: { nowIso: function () { return '2026-01-01T00:00:00.000Z'; } },
        sections: []
      };
    }
    /** Run body with `host` installed, and put the real one back whatever happens. */
    function withHost(host, body) {
      var was = App.docHost.get();
      App.docHost.set(host);
      try { return body(); } finally { if (was) App.docHost.set(was); }
    }

    s.test('a minimal host validates', function () {
      T.assertDeepEqual(App.docHost.validate(minimal()), []);
    });

    s.test('a malformed host is refused, and says which member is wrong', function () {
      var good = minimal(), bad = minimal();
      bad.clock = {};
      // Installed FIRST, so the second half of this is a real assertion rather than a
      // reading of whatever host happened to be installed by the application around it
      // — inside CH there is always one, and in the module bundle there is not.
      withHost(good, function () {
        T.assertThrows(function () { App.docHost.set(bad); }, /host\.clock/);
        T.assertEqual(App.docHost.get(), good, 'a refused host must not replace the one installed');
      });
    });

    s.test('an optional member is optional, but not half-declared', function () {
      var half = minimal();
      half.filter = { categories: function () { return []; } };      // no categoryOf
      var errs = App.docHost.validate(half);
      T.assertEqual(errs.length, 1);
      T.assert(errs[0].indexOf('categoryOf') !== -1, errs[0]);
    });

    s.test('a mutation goes through the host commit, not through any store', function () {
      var host = minimal(), seen = 0;
      var wrapped = Object.assign({}, host, { commit: function (m) { seen += 1; host.commit(m); } });
      withHost(wrapped, function () { App.docStore.addSection({ title: 'A section' }); });
      T.assertEqual(seen, 1, 'docStore did not route its write through host.commit');
      T.assertEqual((host.getState().report.sections || []).length, 1, 'the section did not land in the host state');
    });

    s.test('state is READ through the host too', function () {
      var host = minimal(), reads = 0;
      var wrapped = Object.assign({}, host, { getState: function () { reads += 1; return host.getState(); } });
      withHost(wrapped, function () { App.docStore.setReportOrder(['a', 'b']); });
      T.assert(reads > 0, 'docStore read the project from somewhere other than the host');
      T.assertDeepEqual(host.getState().report.order, ['a', 'b']);
    });

    s.test('a host with no log sink loses the message rather than throwing', function () {
      withHost(minimal(), function () {
        App.docHost.log({ severity: 'error', message: 'nobody is listening' });
      });
    });

    /* Whether an application installs a host at boot is that APPLICATION's business,
     * and CH's is asserted in its own tree (HOSTBOOT-1). What belongs here is that a
     * host, once set, is the one the module hands back. */
    s.test('the installed host is the one that comes back', function () {
      var host = minimal();
      withHost(host, function () {
        T.assertEqual(App.docHost.get(), host);
        T.assertDeepEqual(App.docHost.validate(App.docHost.get()), []);
      });
    });
  });
  })(App);

  (function (App) {
    'use strict';
    var T = App.test;

    /* ===== SUITES: a host that is not CH (CONF-1) ===== */

    /* The direct descendant of the DOD-11 mock-platform test, one level up: that one
     * proved a new DATASET needs no core edits, this one proves a new APPLICATION
     * needs none either. If it passes, the contract is real — something with no
     * devices, no controls, no platform and no registry drives the document module
     * from an empty state to a finished .md.
     *
     * The fixture is deliberately nothing like CH. A roster of people in regions has
     * no readiness to compute, no capture to hash and no register to inherit from, so
     * anything in the module still shaped like a device config shows up here as a
     * missing member rather than as a subtly wrong document. */
    T.suite('CONF-1 a minimal foreign host generates a document', function (s) {

      function mockHost() {
        var state = { report: {} };
        var host = {
          getState: function () { return state; },
          commit: function (m) { m(state); },
          clock: { nowIso: function () { return '2026-01-01T00:00:00.000Z'; } },
          subject: {
            metaLabel: 'About this region',
            list: function () { return [{ id: 'r1', label: 'Region One' }, { id: 'r2', label: 'Region Two' }]; },
            ready: function (id) { return id === 'r1'; },
            meta: function (id) {
              return [{ id: 'region', label: 'Region', value: id === 'r1' ? 'Region One' : 'Region Two', code: false }];
            }
          },
          // Declared as a FUNCTION of the run, which is the half of the contract a
          // static array never exercises: these rows exist for r1 and not for r2.
          sections: function (run) {
            var subject = run && run.subjectId;
            return [{
              id: 'staff', label: 'Staff',
              keyColumn: { id: '_key', label: 'Name', w: 2, get: function (r) { return r.name; } },
              columns: [
                { id: 'role', label: 'Role', w: 3, get: function (r) { return r.role; } },
                { id: 'band', label: 'Band', w: 2, optional: true, get: function (r) { return r.band; } }
              ],
              rows: function () { return subject === 'r1' ? ROWS : []; }
            }];
          },
          filter: {
            id: 'band', label: 'Band',
            categories: function () {
              return [{ key: 'hi', label: 'High', defaultOn: true }, { key: 'lo', label: 'Low', defaultOn: false }];
            },
            categoryOf: function (row) { return row.band; }
          },
          build: function (subjectId, opts) { return buildDoc(host, subjectId, opts); }
        };
        return host;
      }

      var ROWS = [{ name: 'Ada', role: 'Lead', band: 'hi' }, { name: 'Grace', role: 'Engineer', band: 'lo' }];

      /** What a host's build() does: blocks in, content filled in, one document out. */
      function buildDoc(host, subjectId, opts) {
        var o = Object.assign({ subjectId: subjectId }, opts || {});
        var blocks = App.docGen.reportBlocks(host, o).filter(function (b) { return b.included; });
        var ctx = { subjectId: subjectId, generatedUtc: host.clock.nowIso() };
        var meta = host.subject.meta(subjectId);
        var prepared = blocks.map(function (b) { return App.docGen.sectionContent(host, b, o, ctx, meta); });
        return App.docGen.emitDocument(host, prepared, {
          title: 'Roster', subtitle: 'Region One', date: '2026-01-01',
          filename: o.filename, tags: o.tags,
          logicalName: 'roster.md', fallbackName: 'roster-r1.md'
        });
      }

      function withHost(host, body) {
        var was = App.docHost.get();
        App.docHost.set(host);
        try { return body(); } finally { if (was) App.docHost.set(was); }
      }

      s.test('the host validates against the contract', function () {
        T.assertDeepEqual(App.docHost.validate(mockHost()), []);
      });

      s.test('its sections become orderable blocks, beside the module\'s own', function () {
        var blocks = App.docGen.reportBlocks(mockHost(), {});
        var ids = blocks.map(function (b) { return b.id; });
        T.assert(ids.indexOf('staff') !== -1, 'the host section is not a block: ' + ids.join(','));
        T.assert(ids.indexOf('toc') !== -1, 'the contents block is missing');
        T.assert(ids.indexOf('meta') !== -1, 'the metadata block is missing');
        // META-2: the host names its own provenance section; it is not called "Device".
        T.assertEqual(blocks.filter(function (b) { return b.id === 'meta'; })[0].label, 'About this region');
      });

      s.test('the declared columns are the columns the designer would offer', function () {
        var host = mockHost();
        var block = App.docGen.reportBlocks(host, {}).filter(function (b) { return b.id === 'staff'; })[0];
        var cols = App.docGen.sectionColumns(host, block, {});
        T.assertDeepEqual(cols.fixed.map(function (c) { return c.label; }), ['Name', 'Role']);
        T.assertDeepEqual(cols.optional.map(function (c) { return c.label; }), ['Band']);
      });

      s.test('rows are counted by the host\'s own filter axis', function () {
        T.assertDeepEqual(App.docGen.filterCounts(mockHost(), ROWS), { hi: 1, lo: 1 });
      });

      s.test('it generates a document containing its own data', function () {
        var host = mockHost();
        var out = withHost(host, function () { return host.build('r1', {}); });
        T.assert(out && typeof out.text === 'string', 'no document produced');
        T.assert(out.text.indexOf('Ada') !== -1, 'a row is missing from the document');
        T.assert(out.text.indexOf('Grace') !== -1, 'a row is missing from the document');
        T.assert(out.text.indexOf('Role') !== -1, 'a declared column heading is missing');
        T.assert(out.text.indexOf('Region One') !== -1, 'the subject metadata is missing');
        T.assertEqual(out.files[0].name, 'roster.md');
        T.assertEqual(out.files[0].content, out.text);
        T.assertEqual(out.name, 'roster-r1.md', 'an unnamed run falls back to the host\'s name');
      });

      s.test('the same host and state produce the same bytes (DOD-7)', function () {
        var host = mockHost();
        var a = withHost(host, function () { return host.build('r1', {}); });
        var b = withHost(host, function () { return host.build('r1', {}); });
        T.assertEqual(a.text, b.text, 'two runs of one design differ');
      });

      s.test('a placeholder is filled in, and an unfilled one is reported', function () {
        var host = mockHost();
        withHost(host, function () {
          App.docStore.addSection('Issued /[Date]');
          var open = host.build('r1', {});
          T.assert(open.tags.indexOf('Date') !== -1, 'the unfilled tag was not reported: ' + open.tags.join(','));
          var filled = host.build('r1', { tags: { Date: '9 September 2026' }, filename: 'roster-2026.md' });
          T.assert(filled.text.indexOf('9 September 2026') !== -1, 'the tag was not filled in');
          T.assertDeepEqual(filled.tags, [], 'a filled tag is still reported as open');
          T.assertEqual(filled.name, 'roster-2026.md', 'the run\'s filename was not used');
        });
      });

      s.test('it needed no core edits — no CH name appears in the host', function () {
        var src = String(mockHost) + String(buildDoc);
        // Assembled rather than written out, because the build's boundary check reads
        // this file too and cannot tell a name in a string from a name being used.
        ['store', 'registry', 'generate', 'completeness', 'providers', 'overrides',
         'projectIo', 'ui'].forEach(function (n) {
          var name = 'App.' + n;
          T.assertEqual(src.indexOf(name), -1, 'the mock host reaches for ' + name);
        });
      });

      s.test('HTML-1 the same document comes out as one standalone HTML page', function () {
        var host = mockHost();
        withHost(host, function () {
          var md = host.build('r1', { filename: 'roster-2026.md' });
          var out = App.docGen.emitHtml(host, md, { title: 'Roster <draft>', classification: 'OFFICIAL' });
          T.assert(/^<!doctype html>/.test(out.text), 'not an HTML document');
          T.assertEqual(out.name, 'roster-2026.html', 'the .md name did not carry over');
          T.assertEqual(out.files[0].content, out.text);
          T.assert(out.text.indexOf('<title>Roster &lt;draft&gt;</title>') !== -1, 'the title is missing or unescaped');
          ['Ada', 'Grace', 'Region One'].forEach(function (w) {
            T.assert(out.text.indexOf(w) !== -1, w + ' is missing from the HTML');
          });
          T.assert(/<table class="prv-table/.test(out.text), 'the rows did not become a table');
          T.assertEqual((out.text.match(/class="doc-banner">OFFICIAL</g) || []).length, 2, 'the banner is not above and below');
          T.assert(/@page \{ size: A4; margin: \d+px/.test(out.text), 'the profile\'s paper did not reach @page');
          T.assertEqual(out.text.indexOf('<link'), -1, 'the page must not fetch anything');
          T.assertEqual(out.text.indexOf('<script'), -1, 'the page must not run anything');
          T.assertEqual(out.text.indexOf('header-includes'), -1, 'the YAML front matter leaked into the page');
          T.assertEqual(out.text.indexOf('Raw LaTeX'), -1, 'a raw-LaTeX marker leaked into the page');
        });
      });

      s.test('HTML-1 the HTML is a function of the markdown: same input, same bytes', function () {
        var host = mockHost();
        withHost(host, function () {
          var md = host.build('r1', {});
          T.assertEqual(App.docGen.emitHtml(host, md).text, App.docGen.emitHtml(host, md.text).text);
          T.assertEqual(App.docGen.emitHtml(host, md.text).name, 'document.html');
        });
      });

      s.test('a host may name its subject, and the name must be a string', function () {
        var named = mockHost();
        named.subject.noun = 'platform';
        T.assertDeepEqual(App.docHost.validate(named), []);
        named.subject.noun = 3;
        T.assert(App.docHost.validate(named).some(function (e) { return /subject\.noun/.test(e); }),
          'a non-string noun was accepted');
      });
    });
  })(App);

  (function (App) {
    'use strict';
    var T = App.test, MD = App.md;

    /* The markdown writer, on its own. Nothing here builds a document: these are the
     * primitives every generated section passes through on its way to the .md, and
     * they are the module's whether a host exists or not. */

    /* ===== SUITES: LaTeX-safe markdown (MD-1) · code spans (CODE-1) ===== */

    T.suite('MD-1 nothing hostile to LaTeX leaves the writer unescaped', function (s) {
      s.test('every character the pipeline chokes on is backslash-escaped', function () {
        // The set is not arbitrary: each one is load-bearing in LaTeX. % comments out
        // the rest of the line, & separates columns, $ opens math, _ and ^ are
        // sub/superscript, # is a macro parameter, ~ is a non-breaking space, {} group.
        T.assertEqual(MD.text('\\ { } $ & # ^ _ ~ %'), '\\\\ \\{ \\} \\$ \\& \\# \\^ \\_ \\~ \\%');
      });
      s.test('markdown structure characters are neutralised too', function () {
        T.assertEqual(MD.text('*a* `b` [c] |d| <e>'), '\\*a\\* \\`b\\` \\[c\\] \\|d\\| \\<e\\>');
      });
      s.test('column-1 constructs cannot start a list, a quote or a setext heading', function () {
        T.assertEqual(MD.text('- one\n1. two\n= three'), '\\- one\n1\\. two\n\\= three');
      });
      s.test('an identifier becomes a code span, verbatim and unescaped', function () {
        // Escaping a package name would put visible backslashes in the PDF; a code span
        // is literal by definition and reaches LaTeX as \texttt{}.
        T.assertEqual(MD.code('com.samsung.android.app_x'), '`com.samsung.android.app_x`');
        T.assertEqual(MD.code('a`b'), '``a`b``', 'the fence must outgrow the backticks inside it');
        T.assertEqual(MD.code('`x`'), '`` `x` ``', 'content starting/ending with a backtick needs padding');
        T.assertEqual(MD.code(''), '', 'an empty code span would render as two stray backticks');
      });
      s.test('escaping is idempotent per call, never doubled by accident', function () {
        var once = MD.text('50%');
        T.assertEqual(once, '50\\%');
        T.assert(App.report.renderTable(['A'], [['50%']]).indexOf('50\\\\%') === -1, 'renderTable must escape exactly once');
      });
      s.test('a multi-line cell forces a grid table, which is the only one that can hold it', function () {
        var pipe = MD.table([MD.cell('A')], [[MD.cell('one line')]]);
        T.assert(/^\| A \|/.test(pipe), 'single-line content should stay a pipe table');
        var grid = MD.table([MD.cell('A')], [[MD.cell('two\nlines')]]);
        T.assert(/^\+-/.test(grid), 'multi-line content needs a grid table: ' + grid);
        T.assert(/\| two/.test(grid) && /\| lines/.test(grid), 'both lines must survive');
      });
      s.test('rich text: the toolbar tokens become emphasis, and stay balanced', function () {
        T.assertEqual(MD.rich('a {{b}}B{{/b}} c'), 'a **B** c');
        T.assertEqual(MD.rich('{{b}}bold {{i}}both{{/i}}{{/b}}'), '**bold *both***');
        // A half-deleted token must not bold the rest of the document.
        T.assertEqual(MD.rich('a {{b}}B c'), 'a **B c**', 'an unclosed open must be closed at the paragraph end');
        T.assertEqual(MD.rich('a {{/b}}B c'), 'a B c', 'an unmatched close must be dropped');
      });
      s.test('rich text: a code span is verbatim, never escaped', function () {
        // Escaping inside backticks put a visible backslash in the PDF
        // (\\texttt{code\\textbackslash{}\\_span}) — confirmed against pandoc 3.1.11.
        T.assertEqual(MD.rich('a {{c}}code_span{{/c}} b'), 'a `code_span` b');
        T.assertEqual(MD.rich('{{c}}50% & $x{{/c}}'), '`50% & $x`');
        T.assertEqual(MD.rich('{{c}}a`b{{/c}}'), '``a`b``', 'the fence still outgrows inner backticks');
        T.assertEqual(MD.rich('{{c}}unclosed'), '`unclosed`', 'an unclosed code span still closes');
      });
      s.test('rich text: an unknown token is literal text, not a token', function () {
        T.assertEqual(MD.rich('{{zzz}}'), '\\{\\{zzz\\}\\}');
      });
      s.test('rich text: line breaks and paragraphs', function () {
        T.assertEqual(MD.rich('a\nb'), 'a\\\nb', 'a single newline is a hard break');
        T.assertEqual(MD.rich('a\n\nb'), 'a\n\nb', 'a blank line stays a paragraph split');
        T.assertEqual(MD.rich('a{{br}}b'), 'a\\\nb');
      });
      s.test('hostileChars reports what the author will see escaped, ignoring tokens', function () {
        T.assertDeepEqual(MD.hostileChars('a_b {{b}}c{{/b}} 50%'), ['_', '%']);
        T.assertDeepEqual(MD.hostileChars('nothing here'), []);
      });
    });

    T.suite('CODE-1 a code span is shaded, and a long one still wraps', function (s) {
      s.test('the shipped profile shades, and says so in one colour', function () {
        var pre = App.docFormat.preamble(App.docFormat.standard());
        T.assert(/\\definecolor\{chCodeShade\}\{HTML\}\{F2F2F2\}/.test(pre), 'the colour: ' + pre.slice(0, 400));
        T.assert(/\\colorbox\{chCodeShade\}/.test(pre), 'and a box that uses it');
      });

      s.test('the box is chosen by MEASURING, against the line and not the page', function () {
        // \colorbox is an unbreakable hbox: measured, a 64-character SHA-256 inside one
        // runs 49pt past the margin — the exact defect BRK-1 fixed. So a run that does
        // not fit takes the seqsplit route instead, and the width it is compared
        // against is \linewidth: inside a table cell \columnwidth is still the PAGE's
        // column, and measuring against it ran an identifier 38pt out of its cell.
        var pre = App.docFormat.preamble(App.docFormat.standard());
        T.assert(/\\settowidth\{\\chCodeWidth\}/.test(pre), 'it must measure');
        T.assert(/\\ifdim\\chCodeWidth>0\.95\\linewidth/.test(pre), 'against the line: ' + pre);
        T.assert(pre.indexOf('\\columnwidth') === -1 || !/chCodeWidth>[^\n]*columnwidth/.test(pre),
          'never against the page column');
        T.assert(/\\chOriginalTexttt\{\\seqsplit\{#1\}\}/.test(pre), 'and the long run must still be breakable');
      });

      s.test('no shade means no shade, on the page and in the preview', function () {
        var none = App.docFormat.normalise({ id: 'p', name: 'P', page: { codeShade: '' } });
        var pre = App.docFormat.preamble(none);
        T.assert(pre.indexOf('chCodeShade') === -1, 'nothing to define');
        T.assert(/\\renewcommand\{\\texttt\}\[1\]\{\\chOriginalTexttt\{\\seqsplit\{#1\}\}\}/.test(pre),
          'and \\texttt is the plain breakable form again');
        T.assert(/\.rd-paper code \{ background: transparent/.test(App.docFormat.previewCss(none)));
        T.assert(/\.rd-paper code \{ background: #f2f2f2/.test(App.docFormat.previewCss(App.docFormat.standard())),
          'the preview wears the profile’s colour');
      });

      s.test('a malformed colour is dropped, not passed to LaTeX', function () {
        var bad = App.docFormat.normalise({ id: 'p', name: 'P', page: { codeShade: 'red; } * { display:none' } });
        T.assertEqual(bad.page.codeShade, '');
        T.assert(App.docFormat.previewCss(bad).indexOf('display:none') === -1);
      });
    });

    /* ===== SUITES: line breaks and the rich-text box (BR-1 · RTX-2 · D-061) ===== */

    T.suite('BR-1 a line break renders wherever it is written (D-037)', function (s) {
      var NB = String.fromCharCode(0xA0);
      s.test('a trailing break lands on a line of its own', function () {
        // `\` at the end of a block is not a hard break to pandoc — there is no next
        // line for it to start — so it printed a literal backslash in the PDF (D-037).
        // The break is kept and given an empty line to start, rather than thrown away.
        T.assertEqual(MD.rich('Signed{{br}}'), 'Signed\\\n' + NB);
        T.assertEqual(MD.rich('Signed{{br}}{{br}}{{br}}'), 'Signed\\\n\\\n\\\n' + NB,
          'however many of them there are');
      });
      s.test('no lone backslash is left at the end of a paragraph', function () {
        ['Signed{{br}}', 'Signed{{br}}{{br}}', '{{br}}', '{{b}}Signed{{/b}}{{br}}'].forEach(function (src) {
          T.assert(!/\\$/.test(MD.rich(src)), 'trailing backslash in ' + JSON.stringify(MD.rich(src)));
        });
      });
      s.test('a break with nothing either side is still a break', function () {
        T.assertEqual(MD.rich('{{br}}'), '\\\n' + NB);
        T.assertEqual(MD.rich('{{br}}after'), '\\\nafter', 'and one with nothing before it');
      });
      s.test('emphasis closes before the trailing break, not after it', function () {
        T.assertEqual(MD.rich('{{b}}Signed{{/b}}{{br}}'), '**Signed**\\\n' + NB);
        T.assertEqual(MD.rich('{{b}}Signed{{br}}'), '**Signed**\\\n' + NB, 'an unclosed one too');
      });
      s.test('a break in the middle is untouched, consecutive ones included', function () {
        T.assertEqual(MD.rich('a{{br}}b'), 'a\\\nb');
        // `\` on a line of its own IS a hard break with no content, which is how a blank
        // line inside a paragraph is written — that one must survive.
        T.assertEqual(MD.rich('a{{br}}{{br}}b'), 'a\\\n\\\nb');
      });
      s.test('the preview reads it back the same way', function () {
        var html = App.ui.mdPreview.toHtml(MD.rich('Signed{{br}}')).html;
        T.assert(html.indexOf('\\') === -1, 'no backslash may be shown to the reader: ' + html);
        T.assert(html.indexOf('<br>') !== -1, 'and the trailing break draws one: ' + html);
        T.assert(App.ui.mdPreview.toHtml(MD.rich('a{{br}}b')).html.indexOf('<br>') !== -1,
          'while a real break still draws one');
      });
    });

    T.suite('RTX-2 a table cell takes the same formatting a paragraph does', function (s) {
      s.test('a cell renders its tokens into the document', function () {
        var ctx = { resolveRef: function () {
          return { label: 'Table 4: X', numberLabel: 'Table 4', titleLabel: 'X', anchor: 'tbl-1' }; } };
        var part = { id: 'p1', kind: 'table', header: ['{{b}}Setting{{/b}}', 'Notes'],
          rows: [['{{c}}io.x.y{{/c}}', 'See {{refn:t}} — {{i}}note{{/i}}']] };
        var md = App.doc.renderPart(part, ctx);
        T.assert(md.indexOf('**Setting**') !== -1, 'a heading takes emphasis: ' + md);
        T.assert(md.indexOf('`io.x.y`') !== -1, 'a cell takes a code span');
        T.assert(md.indexOf('[Table 4](#tbl-1)') !== -1, 'and a cross-reference');
        T.assert(md.indexOf('*note*') !== -1);
      });

      s.test('a line break in a cell is a HARD break, not a fold', function () {
        // Pandoc folds a grid cell's consecutive lines into one paragraph, so a break
        // without the trailing backslash does nothing at all on the page.
        var part = { id: 'p1', kind: 'table', header: ['A'], rows: [['one{{br}}two']] };
        var md = App.doc.renderPart(part, {});
        var cell = md.split('\n').filter(function (l) { return /^\|/.test(l); });
        T.assert(cell.some(function (l) { return /one\\\s*\|/.test(l); }),
          'the line must end with a backslash:\n' + md);
        T.assert(cell.some(function (l) { return /\btwo\b/.test(l); }), 'and the next line must follow');
      });

      s.test('a blank line in a cell is a paragraph in it', function () {
        var part = { id: 'p1', kind: 'table', header: ['A'], rows: [['one\n\ntwo']] };
        var md = App.doc.renderPart(part, {});
        var html = App.ui.mdPreview.toHtml(md).html;
        T.assert(/prv-cp/.test(html), 'the preview must read it back as two paragraphs: ' + html);
      });

      s.test('plain text in a cell is written exactly as it was', function () {
        // Nothing about the change may alter a table nobody has formatted — every
        // project written before this is full of them.
        var part = { id: 'p1', kind: 'table', header: ['Key'], rows: [['io.sdsasolutions.tacticalsettings']] };
        var md = App.doc.renderPart(part, {});
        T.assert(md.indexOf('`io.sdsasolutions.tacticalsettings`') !== -1,
          'a long identifier is still marked so it can wrap (BRK-1): ' + md);
        T.assertEqual(App.md.richCell('costs 50% & $x'), App.md.cell('costs 50% & $x'),
          'and ordinary text escapes exactly as it always did');
      });
    });

    T.suite('D-061 a line break in a table cell reaches the preview', function (s) {
      var PV = App.ui.mdPreview;
      // A cell's lines are separated by CELL_BREAK until gridTable draws them; what the
      // preview reads back is the drawn form, so that is what these hand over.
      function cell(tokens) { return MD.richCell(tokens).split(MD.CELL_BREAK).join('\n'); }
      s.test('a break in a cell draws one, and shows no backslash', function () {
        // A cell's hard break is a trailing backslash and a newline, exactly as a
        // paragraph's is (RTX-2/D-060). Folding the cell's lines with a space BEFORE the
        // inline pass left `\ `, which no rule recognises: the break vanished and the
        // backslash printed.
        var html = PV._cellHtml(cell('one{{br}}two'));
        T.assert(html.indexOf('<br>') !== -1, 'the break must be drawn: ' + html);
        T.assert(html.indexOf('\\') === -1, 'and no backslash shown: ' + html);
        T.assertEqual(html.replace(/<[^>]*>/g, ''), 'onetwo', 'with nothing else added');
      });

      s.test('a cell holding nothing but a break holds no backslash', function () {
        // Reported as "backslashes showing up in empty boxes": a spacer typed into an
        // otherwise empty cell came out as a lone `\` on the page's own preview.
        var html = PV._cellHtml(cell('{{br}}'));
        T.assert(html.indexOf('\\') === -1, 'an empty box must stay empty: ' + JSON.stringify(html));
      });

      s.test('through a whole table, as the document carries it', function () {
        var md = MD.gridTable(['A', 'B'], [[MD.richCell('one{{br}}two'), MD.richCell('x')]], {});
        var html = PV.toHtml(md).html;
        T.assert(html.indexOf('<br>') !== -1, 'the break survives the table walker: ' + html);
        T.assert(html.indexOf('\\') === -1, 'and nothing of how it is written is shown: ' + html);
      });

      s.test('and the empty box survives the table walker too', function () {
        /* The second half of the same defect, and the one the report named. A cell whose
         * last line is BR-1's non-breaking spacer had it read as padding — `String.trim()`
         * strips U+00A0 — so the line was dropped and the break's backslash was left with
         * nothing to break onto. */
        var md = MD.gridTable(['A', 'B'], [[MD.richCell('{{br}}'), MD.richCell('x')]], {});
        var html = PV.toHtml(md).html;
        T.assert(html.indexOf('\\') === -1, 'no backslash may reach the reader: ' + html);
        T.assert(/<td><br><\/td>/.test(html), 'the break is drawn, and the box is otherwise empty: ' + html);
      });

      s.test('a WRAPPED line is still one line, which is what pandoc does with it', function () {
        // Only a break is a break. Consecutive lines with no backslash are one paragraph
        // on the page, so they are one paragraph here — that is what D-025 settled, and
        // the fix must not undo it.
        T.assertEqual(PV._cellHtml('one\ntwo'), 'one two');
        T.assertEqual(PV._cellHtml('one\n\ntwo'), '<div class="prv-cp">one</div><div class="prv-cp">two</div>',
          'while a blank line is still two paragraphs');
      });

      s.test('a row anchor still costs the row nothing', function () {
        // The anchor sits on a line of its own so it takes no width; the newline after it
        // is part of that machinery and is consumed with it, or every anchored row would
        // start with a space the page does not have.
        T.assertEqual(PV._cellHtml('[]{#ctl-ahg-001}\nAHG-001').replace(/<[^>]*>/g, ''), 'AHG-001');
      });
    });

  })(App);

  (function (App) {
    'use strict';
    var T = App.test, MD = App.md, DOC = App.doc;

    /* Heading levels, numbering, cross-references and centring — App.doc's whole job,
     * exercised on literal block lists. A block is a plain object here, which is what
     * it is in the generator too; nothing in this file knows where blocks come from. */

    /** Blocks -> outline, with no project involved (pure level/numbering checks). */
    function outline(blocks, opts) { return DOC.outline(blocks, opts || {}); }
    function blk(id, label, level, kind) {
      return { id: id, label: label, level: level === undefined ? null : level, kind: kind || 'meta', included: true };
    }
    function nums(res) { return res.map(function (r) { return r.number + ':' + (r.level === DOC.BODY_LEVEL ? 'N' : 'H' + r.level); }); }

    /* ===== SUITES: heading levels, numbering and hand-authored parts (DOC-1..DOC-4) ===== */

    T.suite('DOC-1/DOC-2 heading levels resolve and number themselves', function (s) {
      s.test('an explicit level always wins', function () {
        var r = outline([blk('a', 'A', 1), blk('b', 'B', 3)], { clampSkips: false });
        T.assertDeepEqual(nums(r), ['1:H1', '1.0.1:H3'], 'without clamping a skip numbers as LaTeX would');
        T.assertEqual(r[1].skipped, true, 'and the skip is reported rather than hidden');
      });
      s.test('a skipped level is pulled up by default, and says so', function () {
        var r = outline([blk('a', 'A', 1), blk('b', 'B', 3)]);
        T.assertDeepEqual(nums(r), ['1:H1', '1.1:H2'], 'clamping makes an orphan H3 an H2');
        T.assertEqual(r[1].skipped, true);
      });
      s.test('auto makes a section a sibling of the last heading', function () {
        var r = outline([blk('a', 'A', 1), blk('b', 'B', 2), blk('c', 'C')]);
        T.assertDeepEqual(nums(r), ['1:H1', '1.1:H2', '1.2:H2'], 'auto should follow the H2, not restart');
      });
      s.test('the counters nest and reset exactly as an outline should', function () {
        var r = outline([blk('a', 'A', 1), blk('b', 'B', 2), blk('c', 'C', 2), blk('d', 'D', 3), blk('e', 'E', 1)]);
        T.assertDeepEqual(nums(r), ['1:H1', '1.1:H2', '1.2:H2', '1.2.1:H3', '2:H1']);
      });
      s.test('a custom section with no heading becomes body text and is not numbered', function () {
        var r = outline([blk('a', 'A', 1), { id: 'c', kind: 'custom', title: '', label: '', included: true, level: null }]);
        T.assertEqual(r[1].level, DOC.BODY_LEVEL);
        T.assertEqual(r[1].number, '', 'body text carries no number');
        T.assertEqual(DOC.headingFor(r[1]), '', 'and emits no heading line');
      });
      s.test('body text does not drag the sections after it down a level', function () {
        var r = outline([blk('a', 'A', 1), blk('t', 'T', 2),
          { id: 'c', kind: 'custom', title: '', label: '', included: true, level: null }, blk('d', 'D')]);
        T.assertEqual(r[3].level, 2, 'the section after a paragraph is still a sibling of the last HEADING');
      });
      s.test('TBL-1: a grouped dataset\'s groups take no heading and no number', function () {
        var r = outline([
          blk('p', 'Packages', null, 'dataset'),
          blk('t', 'Tactical', null, 'dataset')
        ].map(function (b, i) {
          return i === 0 ? Object.assign(b, { children: [{ id: 'keep', label: 'Kept', body: '' }] }) : b;
        }));
        // A group used to be placed here as a sub-section, which printed its declared
        // name ("Kept") as a numbered heading. It is a table under the section now, so
        // the outline holds the two datasets and nothing else — and the second dataset
        // is still 2, which is what the old test was really guarding.
        T.assertDeepEqual(nums(r), ['1:H1', '2:H1'], 'a group must not consume a number');
        T.assertEqual(r.length, 2, 'and must not appear in the outline at all');
      });
      s.test('numbering can be switched off entirely', function () {
        var r = outline([blk('a', 'A', 1)], { numbered: false });
        T.assertEqual(r[0].number, '');
        T.assertEqual(DOC.headingFor(r[0]), '# A {#sec-a}', 'the heading survives; only the number goes');
      });
      s.test('an excluded block is absent from the outline and from the numbering', function () {
        var r = outline([blk('a', 'A', 1), Object.assign(blk('b', 'B', 1), { included: false }), blk('c', 'C', 1)]);
        T.assertDeepEqual(r.map(function (x) { return x.id + x.number; }), ['a1', 'c2'], 'the numbers must close up');
      });
    });

    T.suite('DOC-3 a cross-reference survives renaming and reordering', function (s) {
      function refDoc(order) {
        var blocks = order.map(function (id) { return blk(id, id.toUpperCase(), 1); });
        var res = outline(blocks);
        return { res: res, resolve: DOC.refResolver(res, []) };
      }
      s.test('a reference names the number and the title, both derived at render time', function () {
        var d = refDoc(['intro', 'scope']);
        T.assertDeepEqual(d.resolve('scope'), {
          anchor: 'sec-scope', label: 'Section 2 — SCOPE',
          // REF-1: the number alone and the title alone, so the designer can insert
          // "see Section 2" or "see SCOPE" without either becoming a literal string.
          numberLabel: 'Section 2', titleLabel: 'SCOPE'
        });
      });
      s.test('reordering changes the NUMBER the reference reads, not the reference', function () {
        T.assertEqual(refDoc(['intro', 'scope']).resolve('scope').label, 'Section 2 — SCOPE');
        T.assertEqual(refDoc(['scope', 'intro']).resolve('scope').label, 'Section 1 — SCOPE',
          'the same stored id must now read as section 1');
      });
      s.test('renaming changes the TITLE it reads, and the anchor never moves', function () {
        var res = outline([Object.assign(blk('scope', 'Old name', 1), { title: 'Old name' })]);
        var a = DOC.refResolver(res, [])('scope');
        var res2 = outline([Object.assign(blk('scope', 'New name', 1), { title: 'New name' })]);
        var b = DOC.refResolver(res2, [])('scope');
        T.assertEqual(a.anchor, b.anchor, 'the anchor is derived from the id, so a rename cannot break the link');
        T.assert(/New name/.test(b.label), 'but the visible text follows the new title');
      });
      s.test('a dangling reference is stated in the document, never silently dropped', function () {
        T.assertEqual(MD.rich('see {{ref:gone}}', { resolveRef: function () { return null; } }),
          'see **\\[missing reference\\]**');
      });
      s.test('body text is not a link target — there is nothing to point at', function () {
        var res = outline([{ id: 'c', kind: 'custom', title: '', label: '', included: true, level: null }]);
        T.assertEqual(DOC.refResolver(res, [])('c'), null);
        T.assertEqual(DOC.refTargets(res, []).length, 0);
      });
      s.test('tables are numbered document-wide and are addressable', function () {
        var res = outline([
          { id: 's1', kind: 'custom', title: 'One', label: 'One', included: true, level: 1,
            parts: [{ id: 'p1', kind: 'table', caption: 'First', header: ['A'], rows: [['x']] }] },
          { id: 's2', kind: 'custom', title: 'Two', label: 'Two', included: true, level: 1,
            parts: [{ id: 'p2', kind: 'table', caption: 'Second', header: ['A'], rows: [['y']] }] }
        ]);
        var tables = DOC.tableIndex(res);
        T.assertDeepEqual(tables.map(function (t) { return t.number + ':' + t.caption; }), ['1:First', '2:Second']);
        // REF-1: a colon, because that is what the CAPTION prints ("Table 2: Second") —
        // a reference that reads differently from the thing it names is one the reader
        // has to translate.
        T.assertEqual(DOC.refResolver(res, tables)('p2').label, 'Table 2: Second');
        T.assertEqual(DOC.refResolver(res, tables)('p2').numberLabel, 'Table 2');
      });
    });

    T.suite('DOC-4 a hand-authored section renders its parts in order', function (s) {
      var ctx = { resolveRef: function () { return null; }, tables: [] };
      s.test('a paragraph, a rule and a page break', function () {
        T.assertEqual(DOC.renderPart({ kind: 'para', text: 'Hello 50%' }, ctx), 'Hello 50\\%');
        T.assertEqual(DOC.renderPart({ kind: 'rule' }, ctx), '* * *');
        T.assert(/\\newpage/.test(DOC.renderPart({ kind: 'pagebreak' }, ctx)), 'a page break must reach LaTeX');
      });
      s.test('centring survives to LaTeX as a real center environment', function () {
        // Verified against pandoc 3.1.11: a fenced div is DROPPED by the LaTeX writer,
        // so the centring has to travel as raw LaTeX around the block.
        var out = DOC.renderPart({ kind: 'para', text: 'mid', centre: true }, ctx);
        T.assert(/^```\{=latex\}\n\\begin\{center\}\n```/.test(out), 'no opening center: ' + out);
        T.assert(/```\{=latex\}\n\\end\{center\}\n```$/.test(out), 'no closing center: ' + out);
        T.assert(out.indexOf('\nmid\n') !== -1, 'the content must stay markdown between the fences');
      });
      s.test('a table escapes its cells and pads a ragged row rather than losing it', function () {
        var out = DOC.renderPart({ kind: 'table', id: 't', header: ['A', 'B'], rows: [['50%'], ['x', 'y']] }, ctx);
        T.assert(/\| 50\\% \|  \|/.test(out), 'a short row must be padded, not dropped: ' + out);
        T.assert(/\| x \| y \|/.test(out));
      });
      s.test('a captioned table carries its number, and its anchor precedes it', function () {
        var tables = [{ id: 't', number: '3', caption: 'Ports', anchor: 'tbl-t' }];
        var out = DOC.renderPart({ kind: 'table', id: 't', caption: 'Ports', header: ['A'], rows: [['x']] },
          { resolveRef: function () { return null; }, tables: tables });
        // Verified against pandoc 3.1.11: `{#id}` on a caption is NOT read as an
        // identifier — it came out as literal text. An empty span before the table
        // becomes \\phantomsection\\label{...}, which \\hyperref can reach.
        T.assert(/^\[\]\{#tbl-t\}\n\n/.test(out), 'anchor must precede the table: ' + out);
        // CAP-1: the caption is the TEXT only. LaTeX prints "Table 3: " in front of it
        // from its own counter — a number written here as well came out as
        // "Table 3: Table 3 — Ports" in the PDF (measured, pandoc 3.1.11 + tectonic).
        T.assert(/\n: Ports$/.test(out), 'caption missing, or carrying a number LaTeX also supplies: ' + out);
      });
      s.test('parts come out in their stored order', function () {
        var md = DOC.renderParts([
          { id: '1', kind: 'para', text: 'first' },
          { id: '2', kind: 'rule' },
          { id: '3', kind: 'para', text: 'second' }
        ], ctx);
        // REF-1: each paragraph carries an anchor of its own, so a reference can name
        // a paragraph rather than only the section it sits in.
        T.assertEqual(md, '[]{#par-1}\n\nfirst\n\n* * *\n\n[]{#par-3}\n\nsecond');
      });
      s.test('a paragraph with no id gets no anchor — there is nothing to address', function () {
        T.assertEqual(DOC.renderPart({ kind: 'para', text: 'x' }, ctx), 'x');
      });
    });

    /* ===== SUITES: references and centring (REF-1 · CTR-1 · D-044) ===== */

    T.suite('REF-1 a cross-reference reaches the document as a link', function (s) {
      function sectionAt(id, title, number) {
        return { id: id, kind: 'dataset', label: title, title: title, level: 1, included: true,
          number: number, anchor: MD.anchor('sec-' + id) };
      }
      function resolverFor(blocks) { return DOC.refResolver(blocks, []); }

      s.test('an id with a DOT in it is a token, not literal text', function () {
        /* The reported defect, exactly. `ds:android.packages` is the id of every register
         * section, and the token pattern's id charset had no `.` — so the most likely
         * reference a designer could insert never matched, fell through to the escaper
         * with the rest of the prose, and printed in the PDF as `{{ref:ds:android.packages}}`.
         * A reference to a hand-authored section (`sec1`) worked, which is what made it
         * read as "references are broken sometimes". */
        var res = resolverFor([sectionAt('ds:android.packages', 'Packages', '3')]);
        var md = MD.rich('see {{ref:ds:android.packages}}', { resolveRef: res });
        T.assertEqual(md, 'see [Section 3 — Packages](#sec-ds-android-packages)');
        T.assert(md.indexOf('{{') === -1, 'no token may survive into the document');
      });

      s.test('three readings, all derived at render time', function () {
        var res = resolverFor([sectionAt('s', 'Packages', '3')]);
        T.assertEqual(MD.rich('{{ref:s}}', { resolveRef: res }), '[Section 3 — Packages](#sec-s)');
        T.assertEqual(MD.rich('{{refn:s}}', { resolveRef: res }), '[Section 3](#sec-s)');
        T.assertEqual(MD.rich('{{reft:s}}', { resolveRef: res }), '[Packages](#sec-s)');
      });

      s.test('a renumber changes every reading of every reference to it', function () {
        var before = resolverFor([sectionAt('s', 'Packages', '3')]);
        var after = resolverFor([sectionAt('s', 'Packages', '7')]);
        T.assertEqual(MD.rich('{{refn:s}}', { resolveRef: before }), '[Section 3](#sec-s)');
        T.assertEqual(MD.rich('{{refn:s}}', { resolveRef: after }), '[Section 7](#sec-s)',
          'the stored token is unchanged; only what it reads as moved');
      });

      s.test('a table reference names the number the caption prints', function () {
        var tables = [{ id: 'p1', number: '4', caption: 'Packages removed', anchor: 'tbl-p1' }];
        var res = DOC.refResolver([], tables);
        T.assertEqual(MD.rich('{{ref:p1}}', { resolveRef: res }), '[Table 4: Packages removed](#tbl-p1)');
        T.assertEqual(MD.rich('{{refn:p1}}', { resolveRef: res }), '[Table 4](#tbl-p1)');
      });

      s.test('a selection becomes the link text, and is not eaten', function () {
        var res = resolverFor([sectionAt('s', 'Packages', '3')]);
        T.assertEqual(MD.rich('as {{ref:s}}the package list{{/ref}} shows', { resolveRef: res }),
          'as [the package list](#sec-s) shows');
      });

      s.test('an unresolvable reference is stated, and keeps the words around it', function () {
        var none = function () { return null; };
        T.assertEqual(MD.rich('see {{ref:gone}}', { resolveRef: none }), 'see **\\[missing reference\\]**');
        T.assertEqual(MD.rich('see {{ref:gone}}that{{/ref}} there', { resolveRef: none }),
          'see that **\\[missing reference\\]** there', 'the author\'s words are not thrown away with the link');
      });

      s.test('a PARAGRAPH is a link target, and carries an anchor to land on', function () {
        var blocks = [{ id: 'c', kind: 'custom', title: 'Annex', label: 'Annex', included: true, level: 1,
          number: '2', anchor: 'sec-c',
          parts: [{ id: 'part7', kind: 'para', text: 'The baseline was applied in full.' }] }];
        var t = DOC.refTargets(blocks, []).filter(function (x) { return x.kind === 'paragraph'; })[0];
        T.assert(!!t, 'a paragraph must be offered as a target');
        T.assertEqual(t.id, 'part7');
        T.assert(/The baseline was applied/.test(t.label), 'named by its opening words: ' + t.label);
        var md = DOC.renderParts(blocks[0].parts, { resolveRef: function () { return null; }, tables: [] });
        T.assert(md.indexOf('[]{#par-part7}') === 0, 'and the paragraph emits the anchor it is addressed by: ' + md);
      });

      s.test('an introduction resolves its references, which is what generated sections lacked', function () {
        /* The introduction used to be rendered by the GENERATOR, before the outline
         * existed, with `MD.rich(intro, {})` — no resolver, so every reference in one
         * resolved to nothing. It is rendered by App.doc now, with the same ctx a
         * hand-authored paragraph gets. */
        var blocks = DOC.outline([
          { id: 'a', kind: 'dataset', label: 'Packages', title: 'Packages', level: 1, included: true,
            intro: 'Compare with {{refn:b}}.' },
          { id: 'b', kind: 'dataset', label: 'Tactical', title: 'Tactical', level: 1, included: true }
        ], {});
        var md = DOC.render({ blocks: blocks });
        T.assert(/\[Section 2\]\(#sec-b\)/.test(md), 'the introduction\'s reference must resolve: ' + md);
        T.assert(md.indexOf('missing reference') === -1, 'and must not read as dangling');
      });

      s.test('the preview lands a paragraph anchor on the paragraph, not on the next table', function () {
        // It used to hold the anchor and give it to whatever table came next, so the
        // preview's links went somewhere the PDF's do not.
        var html = App.ui.mdPreview.toHtml('[]{#par-part7}\n\nSome prose.\n\n| A |\n| --- |\n| x |\n\n: Cap').html;
        T.assert(/<p id="par-part7">Some prose\.<\/p>/.test(html), 'the paragraph must carry it: ' + html);
        T.assert(!/prv-tablewrap" id="par-part7"/.test(html), 'and the table must not');
      });
    });

    T.suite('CTR-1 centring a section centres its heading too', function (s) {
      s.test('the heading is centred by its own titleformat, not by a center environment', function () {
        /* The environment was the obvious way and it was wrong twice: titlesec sets a
         * heading's text in a box `\centering` does not reach (so the title came out
         * JUSTIFIED across the measure), and the environment's glue fires before
         * `\sectionbreak` (so a level that starts a page got a blank one first). */
        var b = { id: 'a', kind: 'custom', title: 'Title page', label: 'Title page', level: 1, number: '1',
          anchor: 'sec-a', centre: true };
        var h = DOC.headingFor(b);
        T.assert(h.indexOf('\\begin{center}') === -1, 'no center environment may wrap a heading: ' + h);
        T.assert(h.indexOf('\\chCentreOne') < h.indexOf('# 1 Title page {#sec-a}'), 'the centred face opens first');
        T.assert(h.indexOf('# 1 Title page {#sec-a}') < h.indexOf('\\chPlainOne'), 'and is put back after');
      });

      s.test('every level has a centred face, and App.doc names the same ones', function () {
        // The two lists have to agree; this is what says they do.
        var pre = App.docFormat.preamble(App.docFormat.standard());
        ['One', 'Two', 'Three', 'Four'].forEach(function (w) {
          T.assert(pre.indexOf('\\newcommand{\\chCentre' + w + '}') !== -1, 'no centred face for ' + w);
          T.assert(pre.indexOf('\\newcommand{\\chPlain' + w + '}') !== -1, 'no plain face for ' + w);
        });
        T.assert(/\\newcommand\{\\chCentreOne\}\{\\titleformat\{\\section\}\{[^}]*\}?[^\n]*\\centering\}/.test(pre),
          'the centring must be in the FORMAT argument, where titlesec expects alignment: ' +
          (pre.match(/\\newcommand\{\\chCentreOne\}.*/) || ''));
        for (var lv = 1; lv <= 4; lv++) {
          var h = DOC.headingFor({ id: 'x', title: 'T', label: 'T', level: lv, anchor: 'sec-x', centre: true });
          T.assert(/\\chCentre(One|Two|Three|Four)/.test(h), 'level ' + lv + ' must name a macro the profile defines: ' + h);
        }
      });

      s.test('a TITLE has a centred face of its own', function () {
        var h = DOC.headingFor({ id: 'a', kind: 'custom', title: 'Foreword', label: 'Foreword',
          level: DOC.TITLE_LEVEL, anchor: 'sec-a', centre: true });
        T.assert(h.indexOf('\\chTitleStyleCentred') !== -1, 'the centred title face: ' + h);
        T.assert(h.indexOf('\\chSectionStyle') > h.indexOf('# Foreword'), 'and the restore comes after the heading');
        var plain = DOC.headingFor({ id: 'a', kind: 'custom', title: 'Foreword', label: 'Foreword',
          level: DOC.TITLE_LEVEL, anchor: 'sec-a' });
        T.assert(/\\chTitleStyle\b/.test(plain) && plain.indexOf('Centred') === -1, 'and an uncentred title is unchanged');
        var pre = App.docFormat.preamble(App.docFormat.standard());
        T.assert(pre.indexOf('\\newcommand{\\chTitleStyleCentred}') !== -1, 'the profile must define it');
      });

      s.test('a hand-authored section\'s body is centred in the DOCUMENT, not only the preview', function () {
        // A generated section is centred where its body is built (sectionContent); a
        // custom section's body is built by render(), and nothing was centring it — so
        // the switch worked in the per-section preview and did nothing in the .md.
        var md = DOC.render({ blocks: DOC.outline([
          { id: 'c', kind: 'custom', title: 'Title page', label: 'Title page', level: DOC.TITLE_LEVEL,
            included: true, centre: true, parts: [{ id: 'p1', kind: 'para', text: 'Prepared for ACME' }] }
        ], {}) });
        T.assert(/\\begin\{center\}/.test(md) && /\\end\{center\}/.test(md),
          'the body must be centred on the page: ' + md);
        T.assert(md.indexOf('Prepared for ACME') > md.indexOf('\\begin{center}'), 'and the prose inside it');
        var off = DOC.render({ blocks: DOC.outline([
          { id: 'c', kind: 'custom', title: 'T', label: 'T', level: 1, included: true,
            parts: [{ id: 'p1', kind: 'para', text: 'x' }] }
        ], {}) });
        T.assert(off.indexOf('\\begin{center}') === -1, 'and an uncentred section is untouched');
      });

      s.test('a centred heading no longer drags a blank page in front of it', function () {
        // The `center` environment contributed its glue BEFORE \sectionbreak fired, so a
        // level asking for a page break got the glue on a page of its own.
        var h = DOC.headingFor({ id: 'a', title: 'T', label: 'T', level: DOC.TITLE_LEVEL,
          anchor: 'sec-a', centre: true });
        T.assert(h.indexOf('center') === -1, 'nothing may sit between the declaration and the heading: ' + h);
      });

      s.test('the preview keeps a centred heading in the outline', function () {
        // The nested render's outline was thrown away, so a centred section vanished
        // from the navigation rail and from the contents list while still printing.
        var md = DOC.render({ blocks: DOC.outline([
          { id: 'a', kind: 'custom', title: 'Title page', label: 'Title page', level: 1, included: true, centre: true }
        ], {}) });
        var p = App.ui.mdPreview.toHtml(md);
        T.assertEqual(p.outline.length, 1, 'the heading must still be listed');
        T.assertEqual(p.outline[0].title, 'Title page');
        T.assert(/prv-centre/.test(p.html), 'and it is still drawn centred');
      });
    });

    T.suite('D-044 centring one section does not centre the document', function (s) {
      function doc() {
        return DOC.render({ blocks: DOC.outline([
          { id: 't', kind: 'custom', title: 'Title page', label: 'T', level: DOC.TITLE_LEVEL,
            included: true, centre: true,
            parts: [{ id: 'p1', kind: 'para', text: 'Prepared for ACME', centre: true }] },
          { id: 'a', kind: 'dataset', title: 'Packages', label: 'Packages', level: 1, included: true,
            body: MD.para('Ordinary prose that must not be centred.') }
        ], {}) });
      }

      s.test('a centred part inside a centred section is not wrapped twice', function () {
        // Two nested `center` environments contribute their vertical space twice, which
        // on a title page is a gap nobody asked for.
        var md = doc();
        T.assertEqual((md.match(/\\begin\{center\}/g) || []).length, 1, 'one centring, not two: ' + md);
      });

      s.test('the preview closes the centring where the document does', function () {
        /* Reported as "centring my title page centres the whole document". The preview's
         * fenced-div walker was not depth-aware: it stopped at the first closing `:::`,
         * which left the outer close as a bare `:::` — and `/^:::/` read that as an
         * OPENING fence, so it swallowed the rest of the document into a centred div. */
        var p = App.ui.mdPreview.toHtml(doc());
        var after = p.html.slice(p.html.indexOf('Packages'));
        T.assert(!/prv-centre/.test(after), 'nothing after the centred section may be inside it: ' + after);
        T.assert(/prv-centre/.test(p.html.slice(0, p.html.indexOf('Packages'))), 'while the section itself is');
        T.assert(p.html.indexOf(':::') === -1, 'and no fence is ever shown as content');
      });

      s.test('a nested centring is still read as one block, not as two', function () {
        var html = App.ui.mdPreview.toHtml(
          '::: {.center}\n\n::: {.center}\n\ninner\n\n:::\n\nouter\n\n:::\n\nafter').html;
        T.assert(/after/.test(html) && !/prv-centre[\s\S]*after[\s\S]*<\/div>\s*$/.test(html.replace(/\n/g, '')),
          'the text after the block must be outside it: ' + html);
        T.assertEqual((html.match(/prv-centre/g) || []).length, 2, 'two divs, one inside the other');
      });

      s.test('so the document is still many blocks, which is what a page view needs', function () {
        // The leak folded everything into one enormous div, and a single block cannot be
        // broken between — which is why the paged preview stopped after two sheets.
        var html = App.ui.mdPreview.toHtml(doc()).html;
        T.assert((html.match(/^<(div|h1|h2|h3|p|hr)/gm) || []).length > 2,
          'the flow must have blocks to paginate: ' + html.slice(0, 200));
      });
    });

  })(App);

  (function (App) {
    'use strict';
    var T = App.test, MD = App.md;

    /* How wide a table's columns come out, and how big its type is. Both are decided
     * from the formatting profile and the text itself, so both are testable with no
     * project, no host and no DOM. */

    /** Every grid rule and row in a grid table is the same width, or the PDF breaks. */
    function gridAligned(md) {
      var cur = null, ok = true, grids = 0;
      md.split('\n').forEach(function (l) {
        if (/^\+[-=:+]+\+$/.test(l)) { if (cur === null) { grids++; cur = l.length; } else if (l.length !== cur) ok = false; }
        else if (/^\|/.test(l)) { if (cur !== null && l.length !== cur) ok = false; }
        else cur = null;
      });
      return grids > 0 && ok;
    }

    /* ===== SUITES: automatic widths (AUTO-1 · AUTO-2 · D-036) ===== */

    T.suite('AUTO-1 a table that will not fit is laid out, not left to collapse', function (s) {
      s.test('a table that fits keeps its natural widths, byte for byte', function () {
        var md = MD.table(['A', 'B'], [['one', 'two']], {});
        T.assertEqual(md, MD.pipeTable(['A', 'B'], [['one', 'two']], {}));
        T.assertDeepEqual(MD.autoWidths([['A', 'B'], ['one', 'two']], 2), [3, 3]);
      });

      s.test('one long column no longer takes the whole table', function () {
        // The control-coverage shape: three short columns beside one that lists
        // everything satisfying a control. Proportional-to-characters gave the long one
        // ~90% and mashed the rest into the margins.
        var long = new Array(30).join('package ');
        var w = MD.autoWidths([['Control', 'Status', 'Items', 'Justification'],
          ['ISM-1 Bluetooth', 'Satisfied', long, 'Disabled in firmware.']], 4);
        var total = w.reduce(function (a, x) { return a + x; }, 0);
        T.assert(w[2] / total < 0.7, 'the long column should not take the page: ' + (w[2] / total).toFixed(2));
        T.assert(w[0] / total > 0.08, 'nor should the short ones vanish: ' + (w[0] / total).toFixed(2));
      });

      s.test('a heading is never squeezed below itself', function () {
        var long = new Array(60).join('x ');
        var w = MD.autoWidths([['Rationale', 'V'], ['', long]], 2);
        T.assert(w[0] >= 'Rationale'.length, 'the heading must fit its own column: ' + w[0]);
      });

      s.test('an unbreakable token is never cut in half by the automatic layout', function () {
        // A cut fence stops being a fence: pandoc rejoins the halves with a SPACE, so
        // the package name comes out wrong and the emphasis around it comes out literal.
        var key = '**`com.samsung.android.app.telephonyui.esimclient`**';
        var md = MD.table(['Package', 'Note'], [[key, new Array(40).join('word ')]], {});
        var lines = md.split('\n').filter(function (l) { return /^\|/.test(l); });
        T.assert(lines.some(function (l) { return l.indexOf(key) !== -1; }),
          'the key must survive whole:\n' + md);
      });

      s.test('a table too wide to fit becomes a GRID table so its cells can wrap', function () {
        // A pipe table is a LaTeX `tabular` of `l` columns, which do not wrap — long
        // prose in one runs off the page. Line breaks are not the only reason to switch.
        var md = MD.table(['Control', 'Justification'],
          [['ISM-1', 'Bluetooth is disabled by policy and the three Bluetooth packages are removed; there is no operational need on this fleet.']], {});
        T.assert(/^\+/.test(md), 'expected the grid form, got: ' + md.split('\n')[0]);
        T.assert(gridAligned(md), 'and it must still line up:\n' + md);
      });

      s.test('a short table is still a pipe table', function () {
        T.assert(/^\|/.test(MD.table(['Section', 'Status'], [['Packages', 'Included']], {})));
      });

      s.test('the pipe form is abandoned at pandoc\'s --columns limit, not at the page', function () {
        /* Measured on 3.1.11: up to 72 columns pandoc leaves a pipe table's widths to
         * LaTeX, which sizes them to their content. Past it, it invents them from the
         * SEPARATOR row — and `| --- | --- |` means an equal share for every column
         * whatever is in it. Seven equal columns, each too narrow for its own heading,
         * is worse than anything this module would compute, so the grid form takes over
         * there rather than at the page budget. */
        var head = ['Action Name', 'Description', 'Action', 'Procedure', 'Control', 'Rationale', 'Rollback'];
        var wide = MD.table(head, [['None.', '', '', '', '', '', '']], {});
        T.assert(/^\+/.test(wide), 'a table past 72 columns must take the grid form:\n' + wide.split('\n')[0]);
        var narrow = MD.table(['A', 'B'], [['one', 'two']], {});
        T.assert(/^\|/.test(narrow), 'and one under it must not');
      });

      s.test('the wrapper never leaves a lone asterisk on a line', function () {
        var lines = MD.wrapLine('**aaaaaaaaaaaaaaa**', 8);
        lines.forEach(function (l) {
          T.assert(!/(^|[^*])\*($|[^*])/.test(l), 'a split emphasis marker: ' + JSON.stringify(lines));
        });
      });
    });

    T.suite('AUTO-2 columns are measured in ems, not in characters', function (s) {
      // The em widths were measured out of Latin Modern at 11pt with \savebox/\the\wd,
      // which is why these can be asserted at all rather than eyeballed.
      s.test('a character is not a fixed width', function () {
        // Long enough to exceed the page, or nothing has to be decided and each column
        // simply takes its content — which is the right answer when it fits.
        var run = function (c) { return new Array(41).join(c); };
        var w = MD.autoWidths([['A', 'B'], [run('i'), run('m')]], 2);
        T.assert(w[1] > w[0] * 2, 'forty m must want far more room than forty i: ' + w.join('/'));
        T.assertDeepEqual(MD.autoWidths([['A', 'B'], ['iiii', 'mmmm']], 2), [4, 4], 'and a table that fits is untouched');
      });

      s.test('a bold heading is charged for being bold', function () {
        // The first cut of this model had bold at 1.06 and put "Description" 8pt past
        // its column; the measurement says 1.15 across the lowercase alphabet.
        var plain = MD.autoWidths([['Description', 'x'], ['a', new Array(200).join('word ')]], 2);
        var bold = MD.autoWidths([['**Description**', 'x'], ['a', new Array(200).join('word ')]], 2);
        T.assert(bold[0] > plain[0], 'bold must claim more than regular: ' + bold[0] + ' vs ' + plain[0]);
      });

      s.test('a heading is never short-changed by a monospace neighbour', function () {
        // The register shape: one column of `\texttt` identifiers beside four of prose.
        // Charging the page for an identifier that \seqsplit can break is what starved
        // the prose headings.
        var w = MD.autoWidths([
          ['**Path**', '**Description**', '**Value**', '**Control**', '**Rationale**'],
          ['`com.samsung.android.app.telephonyui`', '', new Array(40).join('word '), '', '']
        ], 5);
        var total = w.reduce(function (a, x) { return a + x; }, 0);
        // "Description" bold is 5.76em of a 36.8em text block: a shade under 16%.
        T.assert(w[1] / total > 0.15, 'the Description column should get its heading: ' + (w[1] / total).toFixed(3));
        T.assert(w[4] / total > 0.12, 'and so should Rationale: ' + (w[4] / total).toFixed(3));
      });

      s.test('an identifier is not minced just because it CAN be broken', function () {
        // \seqsplit means a code span is breakable on the page, so it is not a floor —
        // but six characters to a line is not a layout either, so it is asked for after
        // the hard floors and before anyone who merely wants to be wider.
        var w = MD.autoWidths([
          ['**Path**', '**Value**'],
          ['`com.samsung.android.app.telephonyui.esimclient`', new Array(60).join('word ')]
        ], 2);
        var total = w[0] + w[1];
        T.assert(w[0] / total > 0.2, 'the key column must stay readable: ' + (w[0] / total).toFixed(3));
      });

      s.test('the source is scaled up rather than letting a token set the proportions', function () {
        // Both floors have to hold: the source one includes code spans (a cut fence
        // corrupts), the page one does not. Taking the larger per column would let the
        // source floor decide the FRACTION, which is the bug this replaced.
        var w = MD.autoWidths([
          ['**Path**', '**Description**'],
          ['`com.samsung.android.app.telephonyui.esimclient`', new Array(40).join('word ')]
        ], 2);
        T.assert(w[0] >= '`com.samsung.android.app.telephonyui.esimclient`'.length,
          'the source column must still hold the whole token: ' + w[0]);
      });

      s.test('a table that fits is left exactly as its content sizes it', function () {
        T.assertDeepEqual(MD.autoWidths([['A', 'B'], ['one', 'two']], 2), [3, 3]);
        T.assertEqual(MD.table(['A', 'B'], [['one', 'two']], {}), MD.pipeTable(['A', 'B'], [['one', 'two']], {}));
      });
    });

    T.suite('D-036 a hand-set width still holds what cannot be broken', function (s) {
      s.test('a cross-reference is never cut through its own destination', function () {
        /* Reported: control links printing as `[AHG-002](#ctl-ahg- 002)`. Pandoc rejoins
         * a cell's lines with a SPACE, so a break anywhere inside a link puts one in the
         * destination — and a destination with a space in it is not a link at all. The
         * automatic width path has honoured unbreakable runs since D-021; the EXPLICIT
         * path had no floor and wrapped to whatever was dragged. */
        var cell = MD.autoLink(MD.cell('Removed to satisfy AHG-002 and ISM-1416 together.'),
          [{ text: 'AHG-002', anchor: 'ctl-ahg-002' }, { text: 'ISM-1416', anchor: 'ctl-ism-1416' }]);
        var md = MD.table(['Package', 'Rationale'].map(MD.cell), [[MD.code('com.a'), cell]],
          { widths: [0.5, 0.5] });
        T.assert(md.indexOf('[AHG-002](#ctl-ahg-002)') !== -1, 'the link must survive whole: ' + md);
        T.assert(md.indexOf('[ISM-1416](#ctl-ism-1416)') !== -1, 'both of them');
        T.assert(!/\(#[A-Za-z0-9-]*\s*\|/.test(md), 'no destination may run into a border: ' + md);
      });

      s.test('the fractions the operator dragged are preserved exactly', function () {
        // Only the RATIOS reach the PDF, so the answer to "it does not fit" is to draw
        // the .md wider, not to cut the token or to change the width that was asked for.
        function fracs(md) {
          var sep = md.split('\n').filter(function (l) { return /^\+/.test(l); })[0];
          var total = sep.length;
          return sep.slice(1, -1).split('+').map(function (seg) {
            return Math.round((seg.length + 1) / total * 100) / 100;
          });
        }
        var narrow = MD.table(['A', 'B'].map(MD.cell), [['x', 'y'].map(MD.cell)], { widths: [0.75, 0.25] });
        var long = MD.table(['A', 'B'].map(MD.cell), [[MD.cell('x'),
          '[a-very-long-control-title](#ctl-a-very-long-control-title)']], { widths: [0.75, 0.25] });
        // Within a character's worth of rounding — a field width is a whole number of
        // characters, so the fractions can only ever be that close to the ones asked for.
        var a = fracs(narrow), b = fracs(long);
        a.forEach(function (f, i) {
          T.assert(Math.abs(f - b[i]) <= 0.02, 'share ' + i + ' moved to make room: ' + f + ' -> ' + b[i]);
        });
        T.assert(long.split('\n')[0].length > narrow.split('\n')[0].length, 'the table is drawn wider instead');
      });

      s.test('a code span is not cut in half either', function () {
        // Same defect, same fix — D-021 in the path that had no floor.
        var md = MD.table(['Key', 'Note'].map(MD.cell),
          [[MD.code('io.sdsasolutions.tacticalsettings'), MD.cell('x')]], { widths: [0.2, 0.8] });
        T.assert(md.indexOf('`io.sdsasolutions.tacticalsettings`') !== -1, 'the fence must stay whole: ' + md);
      });

      s.test('a link is measured by what it prints, not by what it is written as', function () {
        /* `[AHG-001](#ctl-ahg-001)` is 23 characters of source and seven of page.
         * Charging the column for the source moved the proportions of every table
         * carrying a control mention — the D-024 lesson, in a new place: the model
         * converts between two currencies, and the destination is not set on the page.
         * The SOURCE width is a separate question and is still counted in full, which is
         * what stops the link being cut in half (above). */
        var plain = MD.table(['A', 'B'].map(MD.cell), [[MD.cell('AHG-001'), MD.cell('x')]], {});
        var linked = MD.table(['A', 'B'].map(MD.cell),
          [['[AHG-001](#ctl-ahg-001)', MD.cell('x')]], {});
        function fracs(md) {
          var sep = md.split('\n').filter(function (l) { return /^[|+]/.test(l); })[1] || '';
          return sep.length;
        }
        // Neither table is wide enough to need laying out, so both take their natural
        // widths — and a linked cell must be as wide as the word it prints, not wider.
        T.assertEqual(fracs(linked), fracs(plain),
          'the destination must not be charged to the column:\n' + linked + '\n' + plain);
      });

      s.test('and safeCut refuses to land inside a link even so', function () {
        var s1 = 'see [AHG-001](#ctl-ahg-001) now';
        for (var at = 5; at < 26; at++) {
          var cut = MD._safeCut(s1, at);
          T.assert(!(cut > 4 && cut < 27), 'a cut at ' + at + ' landed inside the link at ' + cut);
        }
      });
    });

    /* ===== SUITES: type sizes and what the preview shows (FNT-4 · FNT-6 · PRV-3) ===== */

    T.suite('FNT-4 every kind of text has a size, a weight and a slope', function (s) {
      s.test('a caption has a size of its own, and blank is the document\'s', function () {
        var f = App.docFormat.normalise({ id: 'p', name: 'P', tables: { captionFontSize: '8', captionBold: true, captionItalic: true } });
        var pre = App.docFormat.preamble(f);
        T.assert(/\\chCaptionOpen\}\{[^\n]*\\fontsize\{8pt\}\{9\.6pt\}\\selectfont\\bfseries\\itshape/.test(pre),
          'the caption macro must carry all three: ' + (pre.match(/chCaptionOpen.*/) || ''));
        var plain = App.docFormat.preamble(App.docFormat.standard());
        T.assert(!/\\chCaptionOpen\}\{[^\n]*\\fontsize/.test(plain), 'and blank names no size at all');
      });

      s.test('the body\'s weight reaches the document, and a table states its own', function () {
        var f = App.docFormat.normalise({ id: 'p', name: 'P', page: { bold: true }, tables: { headBold: false } });
        var pre = App.docFormat.preamble(f);
        T.assert(/\\AtBeginDocument\{\\bfseries\\upshape\}/.test(pre), 'the prose goes bold: ' + pre);
        // …and the table row fonts must say plainly that they are not, or they would
        // inherit it. This is why the machinery is emitted even with no size set.
        T.assert(/\\chTblBodyFont\}\{[^\n]*\\mdseries\\upshape\}/.test(pre),
          'a table must not inherit the body\'s weight: ' + (pre.match(/chTblBodyFont.*/) || ''));
      });

      s.test('the header row\'s weight reaches every table, not only the styled ones', function () {
        /* It used to be markdown emphasis written by tableStyle(), so it reached exactly
         * the sections that had ticked "style the header row" — and there was a second
         * bold switch in the Fonts table saying the same word about a different set of
         * tables. One switch now, and it is type. */
        var pre = App.docFormat.preamble(App.docFormat.standard());
        T.assert(/\\chTblHeadFont\}\{[^\n]*\\bfseries/.test(pre), 'the shipped profile sets a bold header');
        var style = App.docFormat.tableStyle(App.docFormat.standard(), { head: true });
        T.assertDeepEqual(Object.keys(style.head), ['shade'], 'opting in buys the shade and nothing else');
        T.assert(!/\*\*A\*\*/.test(MD.table(['A'], [['x']], { style: style })), 'so no emphasis is written into the table');
      });

      s.test('the preview says the same thing as the preamble', function () {
        var css = App.docFormat.previewCss(App.docFormat.normalise({ id: 'p', name: 'P',
          page: { italic: true }, tables: { headBold: false, captionBold: true } }));
        T.assert(/\.rd-paper p, \.rd-paper li \{[^}]*font-style: italic/.test(css), 'the body: ' + css);
        T.assert(/\.rd-paper \.prv-table th[^{]*\{[^}]*font-weight: 400/.test(css), 'an unbolded header');
        T.assert(/\.rd-paper \.prv-caption \{[^}]*font-weight: 700/.test(css), 'a bold caption');
      });
    });

    T.suite('FNT-6 the table\'s first column takes a size of its own', function (s) {
      function withCol(size) {
        return App.docFormat.normalise({ id: 'p', name: 'P', tables: { firstColFontSize: size } });
      }
      var H = ['Key', 'Value'], R = [['one', 'two'], ['three', 'four']];

      s.test('blank is the shipped profile, and the macro is defined either way', function () {
        T.assertEqual(App.docFormat.standard().tables.firstColFontSize, '');
        // Defined whatever the profile says, on the rule the shading macros follow: a
        // document naming a macro the preamble does not define is a compile error.
        T.assert(/\\newcommand\{\\chTblColFont\}\{\}/.test(App.docFormat.preamble(App.docFormat.standard())),
          'an empty macro when nothing is set');
        T.assertEqual(App.docFormat.tableStyle(App.docFormat.standard(), {}), null,
          'and nothing is handed to the table writer');
      });

      s.test('a size reaches the preamble as a macro of its own', function () {
        var pre = App.docFormat.preamble(withCol('8'));
        T.assert(/\\newcommand\{\\chTblColFont\}\{\\fontsize\{8pt\}\{9\.6pt\}\\selectfont\}/.test(pre),
          'the size and its leading: ' + pre);
      });

      s.test('and reaches every table, opted in or not, as a span on each body cell', function () {
        var st = App.docFormat.tableStyle(withCol('8'), {});
        T.assertEqual(st.firstColumn.fontSize, 8, 'the style carries it as a flag');
        var md = MD.table(H, R, { style: st });
        T.assert(md.indexOf('`\\chTblColFont`{=latex}') !== -1, 'the span must be emitted: ' + md);
        T.assertEqual(md.split('\\chTblColFont').length - 1, R.length, 'once per BODY row, and no more');
        T.assert(md.indexOf('+=') !== -1, 'and it forces the grid form, which is the only one that can carry it');
      });

      s.test('beside a shade, both spans travel together', function () {
        var f = withCol('8');
        var md = MD.table(H, R, { style: App.docFormat.tableStyle(f, { firstColumn: true }) });
        T.assert(/`\\chTblColShade`\{=latex\}`\\chTblColFont`\{=latex\}/.test(md),
          'the shade first, then the size: ' + md);
      });

      s.test('the preview shows the size and not the span that carries it', function () {
        var md = MD.table(H, R, { style: App.docFormat.tableStyle(withCol('8'), {}) });
        var html = App.ui.mdPreview.toHtml(md).html;
        T.assert(html.indexOf('chTblColFont') === -1, 'the raw span is machinery: ' + html);
        T.assert(/<td>one<\/td>/.test(html), 'and the cell is its content alone: ' + html);
        var css = App.docFormat.previewCss(withCol('8'));
        T.assert(/\.prv-table tbody td:first-child \{ font-size: 10\.67px/.test(css), 'the size is on the paper: ' + css);
        T.assert(App.docFormat.previewCss(App.docFormat.standard()).indexOf('td:first-child { font-size') === -1,
          'and a profile that sets none has the stylesheet it always had');
      });

      s.test('the width model is charged for it, which is what D-027 was about', function () {
        // A column set larger needs more room by exactly the ratio it was enlarged by.
        // Measured against the same table with no first-column size at all.
        var rows = [['Key', 'Value'], [new Array(60).join('word '), new Array(60).join('word ')]];
        var plain = MD.autoWidths(rows, 2, { pageEm: 36 });
        var big = MD.autoWidths(rows, 2, { pageEm: 36, firstCol: 2 });
        T.assert(big[0] / big[1] > plain[0] / plain[1],
          'a first column set larger must claim more of the page: ' + big.join('/') + ' vs ' + plain.join('/'));
        var small = MD.autoWidths(rows, 2, { pageEm: 36, firstCol: 0.5 });
        T.assert(small[0] / small[1] < plain[0] / plain[1], 'and one set smaller, less: ' + small.join('/'));
      });

      s.test('blank means the table body\'s size, in the model as in the macro', function () {
        var m = App.docFormat.tableMetrics(App.docFormat.normalise({ id: 'p', name: 'P', tables: { fontSize: '8' } }));
        T.assertEqual(m.firstCol, m.body, 'unset, it follows the body');
        var set = App.docFormat.tableMetrics(App.docFormat.normalise({ id: 'p', name: 'P',
          tables: { fontSize: '8', firstColFontSize: '11' } }));
        T.assertEqual(set.firstCol, 1, 'set, it is its own size against the document\'s');
      });

      s.test('a profile saved before this opens unchanged', function () {
        var old = App.docFormat.normalise({ id: 'p', name: 'P', tables: { firstColBold: true } });
        T.assertEqual(old.tables.firstColFontSize, '');
        T.assertEqual(old.tables.firstColBold, true, 'and keeps what it did ask for');
      });
    });

    T.suite('PRV-3 the preview reads the document back the way the page will', function (s) {
      s.test('the outline rail is plain text, with the escaping undone', function () {
        // It is written into the rail as text and HTML-escaped there, never parsed as
        // markdown — so a section called "Firmware & build" was listed as "Firmware \&".
        var o = App.ui.mdPreview.toHtml('# 1 Firmware \\& build 50\\% {#sec-x}\n').outline;
        T.assertEqual(o[0].title, 'Firmware & build 50%');
        T.assertEqual(o[0].number, '1');
      });

      s.test('unescapeMd undoes the writer, including code spans and emphasis', function () {
        var U = App.ui.mdPreview.unescapeMd;
        T.assertEqual(U('a\\_b \\$HOME \\{x\\}'), 'a_b $HOME {x}');
        T.assertEqual(U('**bold** and `code`'), 'bold and code');
      });

      s.test('each firewall rule is its own line in a cell', function () {
        var rules = [{ ruleType: 'DENY', portNumber: '443' }, { ruleType: 'ALLOW', portNumber: '80' }];
        var md = MD.table(['Path', 'Value'], [[MD.code('firewallRules'), MD.cell(MD.human(rules))]], {});
        var html = App.ui.mdPreview.toHtml(md).html;
        T.assertEqual((html.match(/class="prv-cp"/g) || []).length, 2, 'one block per rule: ' + html);
        T.assert(/1\. portNumber: 443; ruleType: DENY<\/div>/.test(html), 'and the rules must not run together');
      });

      s.test('a wrapped sentence is still one sentence', function () {
        // Consecutive lines in a cell are ONE paragraph on the page; only a blank line
        // starts a new one. Both halves of that have to be read back the same way.
        var md = MD.table(['A'], [['a very long\nsentence wrapped']], {});
        var html = App.ui.mdPreview.toHtml(md).html;
        T.assert(/a very long sentence wrapped/.test(html), 'wrapped lines must rejoin with a space: ' + html);
        T.assert(html.indexOf('prv-cp') === -1, 'and stay one block');
      });

      s.test('an interior blank line in a cell is not mistaken for padding', function () {
        var grid = MD.gridTable(['A', 'B'], [['one' + MD.CELL_BREAK + MD.CELL_BREAK + 'two', 'x']], {});
        var html = App.ui.mdPreview.toHtml(grid).html;
        T.assert(/>one<\/div>/.test(html) && /<div class="prv-cp">two</.test(html), 'both paragraphs must survive: ' + html);
      });

      s.test('an unstyled table is not painted with the app\'s own colours', function () {
        // `--c-surface-alt` is a near-black in dark mode, and the page is white. It also
        // showed an unstyled header as though it had been given a shade.
        var css = App.docFormat.previewCss(App.docFormat.standard());
        T.assert(/\.rd-paper \.prv-table th[^{]*\{[^}]*background: transparent/.test(css),
          'the page must state its own table background: ' + css);
        var idx = css.indexOf('background: transparent');
        T.assert(css.indexOf('prv-shade-head thead th { background:') > idx,
          'and the shade rule must come after it, or it would be overridden');
      });

      s.test('no shade in the profile means no shade in the preview', function () {
        var none = App.docFormat.normalise({ id: 'p', name: 'P', tables: { head: { shade: '' }, firstColumn: { shade: '' } } });
        var css = App.docFormat.previewCss(none);
        T.assert(!/prv-shade-head thead th/.test(css), 'an unshaded profile must paint nothing: ' + css);
        // FNT-4: the header row's weight is no longer tied to opting in, so it is stated
        // on every table header rather than on the shaded ones.
        T.assert(/\.rd-paper \.prv-table th[^{]*\{[^}]*font-weight/.test(css), 'while its weight still applies to every table');
      });
    });

  })(App);

  (function (App) {
    'use strict';
    var T = App.test, MD = App.md;

    /* Captions and their numbers, from a single table up to a whole document.
     *
     * The last test used to generate CH's report through App.store and App.generate,
     * which is why a suite about App.doc's numbering could only run inside CH. It
     * builds a document from a mock host instead — a grouped section, a plain one, the
     * provenance rows and a hand-authored annex, which between them produce every
     * shape of table the numbering has to keep in order. */

    var ROWS = [
      { key: 'alpha', note: 'first', decision: { band: 'hi' } },
      { key: 'bravo', note: 'second', decision: { band: 'lo' } },
      { key: 'charlie', note: 'third', decision: { band: 'hi' } }
    ];

    /** A host with four sections' worth of tables and nothing CH about it. */
    function mockHost() {
      var state = { report: { sections: [{ id: 'annex', title: 'Annex',
        parts: [{ id: 'p9', kind: 'table', header: ['A'], rows: [['x']] }] }] } };
      return {
        getState: function () { return state; },
        commit: function (m) { m(state); },
        clock: { nowIso: function () { return '2026-01-01T00:00:00.000Z'; } },
        subject: {
          list: function () { return [{ id: 's1', label: 'Subject One' }]; },
          ready: function () { return true; },
          meta: function () { return [{ id: 'who', label: 'Subject', value: 'Subject One', code: false }]; }
        },
        sections: [
          // Grouped: one section, two tables. A grouped section's tables used to be
          // counted twice, which put every later number out by the number of groups.
          { id: 'banded', label: 'Banded',
            keyColumn: { id: '_key', label: 'Item', w: 2, get: function (r) { return r.key; } },
            columns: [{ id: 'note', label: 'Note', w: 3, get: function (r) { return r.note; } }],
            groups: { field: 'band', options: [{ value: 'hi', label: 'High' }, { value: 'lo', label: 'Low' }] },
            rows: function () { return ROWS; } },
          { id: 'plain', label: 'Plain',
            keyColumn: { id: '_key', label: 'Item', w: 2, get: function (r) { return r.key; } },
            columns: [{ id: 'note', label: 'Note', w: 3, get: function (r) { return r.note; } }],
            rows: function () { return ROWS; } }
        ]
      };
    }

    /** The finished markdown of that host's document. */
    function documentMd() {
      var host = mockHost(), opts = { subjectId: 's1' };
      var blocks = App.docGen.reportBlocks(host, opts).filter(function (b) { return b.included; });
      var meta = host.subject.meta('s1');
      var prepared = blocks.map(function (b) {
        return App.docGen.sectionContent(host, b, opts, { subjectId: 's1' }, meta);
      });
      return App.docGen.emitDocument(host, prepared, { title: 'Captions', logicalName: 'captions.md' }).text;
    }

    /* ===== SUITES: automatic captions (CAP-1) ===== */

    T.suite('CAP-1 every table is captioned, and the numbers agree', function (s) {
      s.test('the caption text carries no number — LaTeX supplies that', function () {
        // Written here as well, the PDF read "Table 3: Table 3 — Ports".
        var md = MD.table(['A'], [['x']], { caption: { id: 't', text: 'Ports' } });
        T.assert(/\n: Ports$/.test(md), 'expected a bare caption, got: ' + md);
        T.assert(!/: Table \d/.test(md), 'the caption must not number itself');
      });

      s.test('the anchor precedes the table, as an empty span', function () {
        var md = MD.table(['A'], [['x']], { caption: { id: 't 1', text: 'Ports' } });
        T.assert(/^\[\]\{#tbl-t-1\}\n\n/.test(md), 'anchor missing or malformed: ' + md);
      });

      s.test('a hand-authored table with no caption takes its section heading', function () {
        var block = { id: 'sec1', kind: 'custom', title: 'Residual risks', label: 'Risks', parts: [{ id: 'p1', kind: 'table', header: ['A'], rows: [['x']] }] };
        T.assertEqual(App.doc.autoCaption(block, block.parts[0]), 'Residual risks');
        var idx = App.doc.tableIndex([block]);
        T.assertEqual(idx.length, 1);
        T.assertEqual(idx[0].caption, 'Residual risks');
        T.assertEqual(idx[0].number, '1');
      });

      s.test('a generated table is found by reading the body back', function () {
        var body = MD.table(['A'], [['x']], { caption: { id: 'ds-x', text: 'Packages' } });
        var found = App.doc.scanTables(body);
        T.assertEqual(found.length, 1);
        T.assertEqual(found[0].caption, 'Packages');
        T.assertEqual(found[0].anchor, 'tbl-ds-x');
      });

      s.test('generated and hand-authored tables share one numbering, in emitted order', function () {
        var blocks = [
          { id: 'a', kind: 'meta', label: 'Meta', body: MD.table(['A'], [['x']], { caption: { id: 'meta', text: 'Meta' } }) },
          { id: 'b', kind: 'dataset', label: 'Packages', body: '', children: [
            { id: 'g1', label: 'Kept', body: MD.table(['A'], [['x']], { caption: { id: 'ds-1', text: 'Packages — Kept' } }) }
          ] },
          { id: 'c', kind: 'custom', title: 'Annex', label: 'Annex', parts: [{ id: 'p9', kind: 'table', header: ['A'], rows: [['x']] }] }
        ];
        var idx = App.doc.tableIndex(blocks);
        T.assertDeepEqual(idx.map(function (t) { return t.number + ':' + t.caption; }),
          ['1:Meta', '2:Packages — Kept', '3:Annex']);
      });

      s.test('a cross-reference to a table names the number the page will print', function () {
        var blocks = [
          { id: 'a', kind: 'meta', label: 'Meta', body: MD.table(['A'], [['x']], { caption: { id: 'meta', text: 'Meta' } }) },
          { id: 'c', kind: 'custom', title: 'Annex', label: 'Annex', parts: [{ id: 'p9', kind: 'table', header: ['A'], rows: [['x']] }] }
        ];
        var idx = App.doc.tableIndex(blocks);
        var r = App.doc.refResolver(blocks, idx)('p9');
        T.assertEqual(r.label, 'Table 2: Annex');
        T.assertEqual(r.anchor, 'tbl-p9');
      });

      s.test('every table a whole document emits is captioned', function () {
        var md = documentMd();
        var anchors = (md.match(/^\[\]\{#tbl-[a-z0-9-]+\}$/gm) || []).length;
        // CAP-3: the caption is a numbered paragraph this file writes, not pandoc's
        // `: text` marker — which is what lets it sit below the table and carry the
        // same number the cross-references use.
        var captions = (md.match(/^Table \d+: \S/gm) || []).length;
        T.assert(anchors > 3, 'expected several captioned tables, got ' + anchors);
        T.assertEqual(captions, anchors, 'every anchor must have a caption and vice versa');
        T.assertEqual((md.match(/^: \S/gm) || []).length, 0, 'no unrewritten caption markers may survive');
        // The numbers run 1..n with no gaps and no repeats: a grouped dataset's tables
        // used to be counted twice, which put every later number out by three.
        var nums = (md.match(/^Table (\d+):/gm) || []).map(function (s) { return Number(/\d+/.exec(s)[0]); });
        T.assertDeepEqual(nums, nums.map(function (_, i) { return i + 1; }), 'table numbers must run in order: ' + nums.join(','));
        // Two tables answering to one anchor would make a reference ambiguous.
        var ids = (md.match(/#tbl-[a-z0-9-]+/g) || []);
        T.assertEqual(ids.length, new Set(ids).size, 'duplicate table anchor: ' + ids.join(', '));
      });

      s.test('the preview numbers the captions the same way', function () {
        var md = MD.join([
          MD.table(['A'], [['x']], { caption: { id: 'a', text: 'First' } }),
          MD.table(['A'], [['x']], { caption: { id: 'b', text: 'Second' } })
        ]);
        var html = App.ui.mdPreview.toHtml(md).html;
        T.assert(/<strong>Table 1:<\/strong> First/.test(html), 'first caption: ' + html);
        T.assert(/<strong>Table 2:<\/strong> Second/.test(html), 'second caption');
      });
    });
  })(App);

export { App };

// Run directly (`node doc-designer.test.js`): print a summary and fail on any failure.
if (typeof process !== 'undefined' && process.argv && process.argv[1] &&
    import.meta.url === new URL('file://' + process.argv[1]).href) {
  App.test.run().then(function (res) {
    var failures = [];
    (res.suites || []).forEach(function (s) {
      s.tests.forEach(function (t) { if (!t.ok) failures.push(s.name + ' > ' + t.name + '\n    ' + t.error); });
    });
    failures.forEach(function (f) { console.log('FAIL ' + f); });
    console.log((failures.length ? 'FAIL ' : 'OK ') + res.passed + ' passed, ' + res.failed + ' failed, ' +
      (res.suites || []).length + ' suites');
    process.exitCode = failures.length ? 1 : 0;
  });
}
