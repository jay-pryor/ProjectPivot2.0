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
import { renderHtml, renderPdf } from './doc-render.js';
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

      function words(tables) { return JSON.stringify(tables); }

      s.test('the module builds the table when render is absent', function () {
        var out = App.docProviders.sectionTables(provider, provider.rows(), {}, {});
        T.assertEqual(out.length, 1);
        T.assertDeepEqual(out[0].header, ['Thing', 'Note']);
        T.assert(words(out).indexOf('first') !== -1, 'a row is missing');
      });

      s.test('rows come out sorted by key, the key as code', function () {
        var rows = App.docProviders.sectionTables(provider, provider.rows(), {}, {})[0].rows;
        T.assertDeepEqual(rows.map(function (r) { return r[1].text; }), ['first', 'second']);
        T.assertEqual(rows[0][0].code, true);
      });

      s.test('a provider that renders its own text says this format cannot show it', function () {
        var own = Object.assign({}, provider, { render: function () { return 'HAND WRITTEN'; } });
        var out = App.docProviders.sectionTables(own, [], {}, {});
        T.assertEqual(out.length, 1);
        T.assert(/not shown in this format/.test(words(out)), words(out));
      });

      s.test('a missing provider is no tables, not a throw', function () {
        T.assertDeepEqual(App.docProviders.sectionTables(null, [], {}, {}), []);
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

      /** What a host's build() does: the finished document and its Style, for a subject. */
      function buildDoc(host, subjectId, opts) {
        var o = Object.assign({ subjectId: subjectId }, opts || {});
        return App.docGen.documentFor(host, o, { title: o.title || 'Roster', platform: 'Region One', date: '2026-01-01',
          classification: o.classification || '', utc: host.clock.nowIso() });
      }
      /** Every word in a built document. */
      function textOf(built) { return JSON.stringify(built.document.blocks); }

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
        T.assert(out && out.document && out.document.blocks.length, 'no document produced');
        ['Ada', 'Grace', 'Role', 'Region One'].forEach(function (w) {
          T.assert(textOf(out).indexOf(w) !== -1, w + ' is missing from the document');
        });
      });

      s.test('the same host and state produce the same bytes (DOD-7)', function () {
        var host = mockHost();
        var a = withHost(host, function () { return host.build('r1', {}); });
        var b = withHost(host, function () { return host.build('r1', {}); });
        T.assertEqual(JSON.stringify(a.document), JSON.stringify(b.document), 'two runs of one design differ');
        T.assertEqual(String(renderPdf(a.document, a.style, { date: '2026-01-01T00:00:00' }).bytes),
          String(renderPdf(b.document, b.style, { date: '2026-01-01T00:00:00' }).bytes), 'two PDFs of one design differ');
      });

      s.test('a placeholder is filled in, and an unfilled one is reported', function () {
        var host = mockHost();
        withHost(host, function () {
          App.docStore.addSection('Issued /[Date]');
          var open = host.build('r1', {});
          T.assert(open.tags.indexOf('Date') !== -1, 'the unfilled tag was not reported: ' + open.tags.join(','));
          var filled = host.build('r1', { tags: { Date: '9 September 2026' } });
          T.assert(textOf(filled).indexOf('Issued 9 September 2026') !== -1, 'the tag was not filled in');
          T.assertDeepEqual(filled.tags, [], 'a filled tag is still reported as open');
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
          var built = host.build('r1', { title: 'Roster <draft>', classification: 'OFFICIAL' });
          var html = renderHtml(built.document, built.style);
          T.assert(/^<!doctype html>/.test(html), 'not an HTML document');
          T.assert(html.indexOf('<title>Roster &lt;draft&gt;</title>') !== -1, 'the title is missing or unescaped');
          ['Ada', 'Grace', 'Region One'].forEach(function (w) {
            T.assert(html.indexOf(w) !== -1, w + ' is missing from the HTML');
          });
          T.assert(/<table class="doc-table"/.test(html), 'the rows did not become a table');
          T.assertEqual((html.match(/class="marking">OFFICIAL</g) || []).length, 2, 'the marking is not above and below');
          T.assert(/@page \{ size: a4 portrait;/.test(html), 'the Style\'s paper did not reach @page');
          T.assertEqual(html.indexOf('<link'), -1, 'the page must not fetch anything');
          T.assertEqual(html.indexOf('<script'), -1, 'the page must not run anything');
        });
      });

      s.test('HTML-1 the HTML is a function of the document: same input, same bytes', function () {
        var host = mockHost();
        withHost(host, function () {
          var built = host.build('r1', {});
          T.assertEqual(renderHtml(built.document, built.style), renderHtml(built.document, built.style));
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

      s.test('CLS-2 the classification marking is one of the host\'s, chosen per design', function () {
        var host = mockHost();
        host.classifications = ['OFFICIAL', 'PROTECTED'];
        withHost(host, function () {
          T.assertDeepEqual(App.docHost.validate(host), []);
          T.assert(App.docStore.setClassification('PROTECTED').ok, 'a listed marking is accepted');
          T.assertEqual(App.docSession.options().classification, 'PROTECTED');
          T.assert(!App.docStore.setClassification('SECRET').ok, 'an unlisted marking is refused');
          T.assertEqual(App.docSession.options().classification, 'PROTECTED');
          T.assert(App.docStore.setClassification('').ok);
          T.assertEqual(App.docSession.options().classification, '');
        });
        host.classifications = ['OK', 3];
        T.assert(App.docHost.validate(host).some(function (e) { return /classifications/.test(e); }), 'a bad list is refused');
      });

      s.test('CLS-2 the designer offers None and each marking, with the saved one selected', function () {
        var host = mockHost();
        host.classifications = ['OFFICIAL', 'OFFICIAL: Sensitive'];
        withHost(host, function () {
          App.docStore.setClassification('OFFICIAL: Sensitive');
          var RD = App.ui.views.reportDesign;
          RD.open(); RD.pane('styles'); RD._rd.styleSection = 'marking';
          var html = RD.render(host.getState());
          RD._rd.styleSection = null;
          RD.close();
          T.assert(/<select data-rd-classification/.test(html), 'no marking select');
          T.assert(/<option value="">None<\/option>/.test(html), 'no None option');
          T.assert(/<option value="OFFICIAL: Sensitive" selected>/.test(html), 'the saved marking is not selected');
        });
      });

      s.test('HOST-2 the section preview works for a host with no subject.context or chosenMeta', function () {
        var host = mockHost();
        withHost(host, function () {
          var RD = App.ui.views.reportDesign;
          RD.open(); RD.pane('section'); RD.select('staff');
          var html = RD.render(host.getState());
          RD.close();
          T.assertEqual(html.indexOf('could not be laid out'), -1, 'the preview failed');
          T.assert(/class="dp-page"[\s\S]*>Ada</.test(html), 'the preview does not show the rows on a page');
        });
      });
    });
  })(App);

  (function (App) {
    'use strict';
    var T = App.test, MD = App.md, DOC = App.doc;

    /* Heading levels, numbering and cross-references — App.doc's whole job,
     * exercised on literal block lists. A block is a plain object here, which is what
     * it is in the generator too; nothing in this file knows where blocks come from. */

    /** Blocks -> outline, with no project involved (pure level/numbering checks). */
    function outline(blocks, opts) { return DOC.outline(blocks, opts || {}); }
    function blk(id, label, level, kind) {
      return { id: id, label: label, level: level === undefined ? null : level, kind: kind || 'meta', included: true };
    }
    function nums(res) { return res.map(function (r) { return r.number + ':' + (r.level === DOC.BODY_LEVEL ? 'N' : 'H' + r.level); }); }

    /* ===== SUITES: heading levels, numbering and references (DOC-1..DOC-3) ===== */

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
        T.assertEqual(r[0].level, 1, 'the heading survives; only the number goes');
        T.assertEqual(r[0].anchor, 'sec-a');
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
        T.assertDeepEqual(MD.runs('see {{ref:gone}}', { resolveRef: function () { return null; } }),
          [[{ text: 'see ' }, { text: '[missing reference]', bold: true }]]);
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
        var built = App.docGen.buildDocument(null, res, {});
        var caps = built.document.blocks.filter(function (b) { return b.kind === 'table'; })
          .map(function (t) { return t.caption.runs[0].text; });
        T.assertDeepEqual(caps, ['Table 1: First', 'Table 2: Second']);
        // REF-1: a colon, because that is what the CAPTION prints ("Table 2: Second") —
        // a reference that reads differently from the thing it names is one the reader
        // has to translate.
        T.assertEqual(built.refs.resolve('p2').label, 'Table 2: Second');
        T.assertEqual(built.refs.resolve('p2').numberLabel, 'Table 2');
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
