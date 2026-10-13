// @ts-nocheck
import { STANDARD as STYLE_STANDARD, PAPER_MM as STYLE_PAPER_MM, normaliseStyle, fromProfile, isStyle } from './doc-style.js';
import { layout } from './doc-layout.js';
import { pagesHtml, cropPage } from './doc-preview.js';
import { toWinAnsi } from './doc-fonts.js';
import { boxCount as FIG_BOXES, imagePath as IMAGE_PATH, imageInfo as IMAGE_INFO, figureSources as FIGURE_SOURCES, FIGURE_LAYOUTS } from './doc-images.js';
  /* App namespace root. Exported at the bottom of this file. */
  var App = {};

  /* =============================================================================
   * MODULE: App.util.html
   * PURPOSE: HTML escaping and tiny string builders. ALL data-derived text written
   *          into HTML (tables, reports, generated docs) MUST pass through esc()
   *          to prevent markup corruption / injection (spec §10.3, §13.4).
   * PURITY:  pure (string -> string; no DOM)
   * DEPENDS: (none)
   * INVARIANTS: esc() is total over any input (coerces to string first).
   * ============================================================================= */
  (function (App) {
    'use strict';

    var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

    /**
     * Escape text for safe insertion into HTML element content or quoted attributes.
     * @param {*} s  Coerced to string.
     * @returns {string}
     * @example App.util.html.esc('<a>') // '&lt;a&gt;'
     */
    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return ESC_MAP[ch]; });
    }

    /**
     * Escape a value for use inside a double-quoted HTML attribute.
     * (Same as esc; provided as an explicit, intention-revealing alias.)
     * @param {*} s
     * @returns {string}
     */
    function attr(s) { return esc(s); }

    /**
     * Build an HTML element string from tag, attributes, and children.
     * Attribute values are escaped; children are NOT escaped (callers pass
     * already-escaped strings or nested el() output).
     * @param {string} tag
     * @param {Object<string,*>} [attrs]
     * @param {(string|string[])} [kids]
     * @returns {string}
     * @example App.util.html.el('span', {class:'x'}, esc(userText))
     */
    function el(tag, attrs, kids) {
      var a = '';
      if (attrs) {
        for (var k in attrs) {
          if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
          var v = attrs[k];
          if (v == null || v === false) continue;
          if (v === true) { a += ' ' + k; continue; }
          a += ' ' + k + '="' + attr(v) + '"';
        }
      }
      var inner = kids == null ? '' : (Array.isArray(kids) ? kids.join('') : kids);
      // Void elements get no closing tag.
      if (/^(br|hr|img|input|meta|link)$/i.test(tag)) return '<' + tag + a + '>';
      return '<' + tag + a + '>' + inner + '</' + tag + '>';
    }

    App.util = App.util || {};
    App.util.html = { esc: esc, attr: attr, el: el };
  })(App);

  /* =============================================================================
   * MODULE: App.util.dom
   * PURPOSE: Thin DOM helpers + the download primitive. This is the ONLY util that
   *          touches the DOM / FileReader / downloads (spec §4.1, §7).
   * PURITY:  NOT pure (UI/IO) — kept tiny and dumb.
   * DEPENDS: (none)
   * INVARIANTS: download() uses Blob + object URL + <a download> (file://-safe);
   *             readFileText() resolves with text via FileReader (never fetch).
   * ============================================================================= */
  (function (App) {
    'use strict';

    /** Replace an element's children with the given HTML string. */
    function mount(elOrId, html) {
      var node = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
      node.innerHTML = html;
      return node;
    }

    /** Remove all children of a node. */
    function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

    /**
     * Delegated event binding helper.
     * @param {Element} root
     * @param {string} type
     * @param {string} selector
     * @param {(e:Event, matched:Element)=>void} handler
     */
    function on(root, type, selector, handler) {
      root.addEventListener(type, function (e) {
        var t = e.target;
        while (t && t !== root) {
          if (t.matches && t.matches(selector)) { handler(e, t); return; }
          t = t.parentNode;
        }
      });
    }

    /**
     * Trigger a browser download of a Blob under file://.
     * @param {Blob} blob
     * @param {string} filename
     * @returns {void}
     */
    function download(blob, filename) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke after a tick so the download has begun.
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    /**
     * Read a File object to text via FileReader (no fetch; file://-safe).
     * @param {File} file
     * @returns {Promise<string>}
     */
    function readFileText(file) {
      return new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onload = function () { resolve(String(fr.result)); };
        fr.onerror = function () { reject(fr.error || new Error('read failed')); };
        fr.readAsText(file);
      });
    }

    App.util = App.util || {};
    App.util.dom = { mount: mount, clear: clear, on: on, download: download, readFileText: readFileText };
  })(App);

  /* =============================================================================
   * MODULE: App.util.stable
   * PURPOSE: Deterministic JSON serialization (spec §8.6). The single canonical
   *          stringifier used for the project file, manifests, and tactical artifact.
   * PURITY:  pure
   * DEPENDS: (none)
   * INVARIANTS:
   *   * Object keys sorted ascending; undefined-valued keys omitted (JSON parity).
   *   * Array ORDER IS PRESERVED — callers that need item-sorting (e.g. project
   *     RegisterItem arrays) sort BEFORE calling. This preserves tactical template
   *     array order, which is semantically significant (spec §8.2).
   *   * 2-space indent, '\n' newlines, no trailing whitespace.
   * ============================================================================= */
  (function (App) {
    'use strict';

    function ser(v, indent) {
      if (v === null || v === undefined) return 'null';
      var t = typeof v;
      if (t === 'number') return isFinite(v) ? String(v) : 'null';
      if (t === 'boolean') return v ? 'true' : 'false';
      if (t === 'string') return JSON.stringify(v); // delegates correct string escaping
      var ni = indent + '  ';
      if (Array.isArray(v)) {
        if (v.length === 0) return '[]';
        var parts = [];
        for (var i = 0; i < v.length; i++) parts.push(ni + ser(v[i], ni));
        return '[\n' + parts.join(',\n') + '\n' + indent + ']';
      }
      if (t === 'object') {
        var keys = [];
        for (var k in v) {
          if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
          if (v[k] === undefined) continue; // mirror JSON.stringify: drop undefined values
          keys.push(k);
        }
        keys.sort();
        if (keys.length === 0) return '{}';
        var oparts = [];
        for (var j = 0; j < keys.length; j++) {
          oparts.push(ni + JSON.stringify(keys[j]) + ': ' + ser(v[keys[j]], ni));
        }
        return '{\n' + oparts.join(',\n') + '\n' + indent + '}';
      }
      return 'null'; // functions/symbols -> null (JSON parity in arrays)
    }

    /**
     * Deterministically stringify a JSON-compatible value.
     * @param {*} value
     * @returns {string}
     * @example App.util.stable.stableStringify({b:1,a:2}) // '{\n  "a": 2,\n  "b": 1\n}'
     */
    function stableStringify(value) { return ser(value, ''); }

    App.util = App.util || {};
    App.util.stable = { stableStringify: stableStringify };
  })(App);

  /* =============================================================================
   * MODULE: App.md  — rich text: the token grammar a designer's prose is written in
   * PURPOSE: Read the {{b}} {{i}} {{c}} {{br}} {{ref:ID}} token markup the editors
   *          store into RUNS of text for the document, its plain reading for titles
   *          and summaries, and the anchor names references point at.
   * PURITY:  pure. No DOM, no I/O, no clock.
   * DEPENDS: (none)
   * ============================================================================= */
  (function (App) {
    'use strict';

    var TOKEN = /\{\{(\/?)(b|i|c|br|(?:ref|refn|reft):[A-Za-z0-9:._-]+|ref)\}\}/g;
    var REF_TAG = /^(ref|refn|reft):(.+)$/;
    /** What a resolved reference reads as, per token. */
    var REF_READING = { ref: 'label', refn: 'numberLabel', reft: 'titleLabel' };

    /**
     * PDF-1: rich text as RUNS — one array per paragraph. Emphasis is BALANCED per
     * paragraph, so one damaged token cannot bold the rest of the document: an unmatched close is dropped, a code
     * span and a reference's own words are taken whole, a missing target reads
     * "[missing reference]" in bold.
     * @returns {Array<Array<{text?:string,bold?:boolean,italic?:boolean,code?:boolean,br?:boolean,ref?:{anchor:string}}>>}
     */
    function runs(s, opts) {
      opts = opts || {};
      return String(s == null ? '' : s).split(/\n{2,}/).map(function (p) { return runsPara(p, opts); })
        .filter(function (rs) { return rs.some(function (r) { return r.text; }); });
    }
    function runsPara(p, opts) {
      var out = [], last = 0, m, open = { b: false, i: false };
      function run(text, extra) {
        var r = { text: text };
        if (open.b) r.bold = true;
        if (open.i) r.italic = true;
        Object.keys(extra || {}).forEach(function (k) { r[k] = extra[k]; });
        return r;
      }
      function lit(t) {
        String(t || '').split('\n').forEach(function (piece, k) {
          if (k) out.push({ br: true });
          if (piece) out.push(run(piece));
        });
      }
      TOKEN.lastIndex = 0;
      while ((m = TOKEN.exec(p)) !== null) {
        lit(p.slice(last, m.index));
        var close = m[1] === '/', tag = m[2];
        if (tag === 'c' && !close) {
          var at = p.indexOf('{{/c}}', TOKEN.lastIndex);
          var inner = at === -1 ? p.slice(TOKEN.lastIndex) : p.slice(TOKEN.lastIndex, at);
          if (inner) out.push(run(inner, { code: true }));
          last = at === -1 ? p.length : at + 6;
          TOKEN.lastIndex = last;
          continue;
        }
        if (tag === 'b' || tag === 'i') {
          if (close === open[tag]) open[tag] = !close;
        } else if (tag === 'br') {
          out.push({ br: true });
        } else if (REF_TAG.test(tag) && !close) {
          var bits = REF_TAG.exec(tag);
          var at2 = p.indexOf('{{/ref}}', TOKEN.lastIndex);
          var wrapped = at2 === -1 ? null : p.slice(TOKEN.lastIndex, at2);
          if (wrapped !== null) { last = at2 + 8; TOKEN.lastIndex = last; }
          var r = opts.resolveRef ? opts.resolveRef(bits[2]) : null;
          if (!r) {
            if (wrapped !== null) lit(wrapped + ' ');
            out.push({ text: '[missing reference]', bold: true });
          } else {
            out.push(run(wrapped !== null ? wrapped : String(r[REF_READING[bits[1]]] || r.label || ''), { ref: { anchor: r.anchor } }));
          }
          if (wrapped !== null) continue;
        }
        last = m.index + m[0].length;
      }
      lit(p.slice(last));
      while (out.length && out[out.length - 1].br) out.pop();
      return out;
    }

    /** The plain-text reading of a token string — for previews, summaries and titles. */
    function plain(s) {
      return String(s == null ? '' : s).replace(TOKEN, function (m0, close, tag) {
        return (!close && REF_TAG.test(tag)) ? '→' : tag === 'br' ? ' ' : '';
      });
    }

    /**
     * An anchor name, from an id. Anchors are DERIVED FROM IDS, never from
     * titles — that is what lets a cross-reference survive a rename (see App.doc).
     */
    function anchor(id) {
      return String(id == null ? '' : id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
    }

    App.md = { runs: runs, plain: plain, anchor: anchor, TOKEN: TOKEN, REF_TAG: REF_TAG, REF_READING: REF_READING };
  })(App);
  /* =============================================================================
   * MODULE: App.docFormat  — named Styles: how the finished document looks
   * PURPOSE: The Styles a project has — the built-in Standard first, then its own —
   *          and the one it is set to use. What a Style holds, and the limits each
   *          setting is held to, live in doc-style.js; an old LaTeX-era formatting
   *          profile found in a project or an import is converted on the way in.
   * PURITY:  pure.
   * INVARIANTS: the built-in Style is never edited in place — editing it duplicates
   *             it first, so a project can always be read against a known-good one.
   * ============================================================================= */
  (function (App) {
    'use strict';

    function clone(o) { return JSON.parse(JSON.stringify(o)); }

    /** A fresh copy of the built-in Style — the starting point for any new one. */
    function standard() { return clone(STYLE_STANDARD); }

    /** PDF-1: any saved Style as a complete one — an old LaTeX-era profile converted. */
    function normalise(p) {
      return isStyle(p) ? normaliseStyle(p).style : fromProfile(p);
    }

    /** Every Style available to a project: the built-in first, then the saved ones. */
    function list(project) {
      var saved = ((project && project.report && project.report.formats) || []).map(normalise);
      return [standard()].concat(saved.filter(function (f) { return f.id !== 'standard'; }));
    }

    /** FMT-2: the Style the project is set to use. Falls back to the built-in when the
     *  saved id no longer resolves — a deleted Style must never block a report. */
    function resolve(project) {
      var want = (project && project.report && project.report.formatId) || 'standard';
      var found = list(project).filter(function (f) { return f.id === want; })[0];
      return found || standard();
    }

    /** A Style (or an old profile) arriving in an import, checked and made whole. */
    function validate(raw, loc) {
      var issues = [];
      function bad(msg) { issues.push({ category: 'validation', severity: 'error', message: msg, location: loc || 'format' }); }
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { bad('A Style must be an object.'); return { ok: false, issues: issues, profile: null }; }
      if (!raw.id || typeof raw.id !== 'string') bad('A Style needs a string id.');
      if (!raw.name || typeof raw.name !== 'string') bad('A Style needs a name.');
      if (issues.length) return { ok: false, issues: issues, profile: null };
      var p = normalise(raw);
      delete p.builtin;                       // an imported Style is never the built-in
      return { ok: true, issues: [], profile: p };
    }

    App.docFormat = { standard: standard, normalise: normalise, list: list, resolve: resolve, validate: validate };
  })(App);
  /* =============================================================================
   * MODULE: App.doc  — DOC-1..DOC-3: the document outline, numbering and references
   * PURPOSE: Turn an ordered list of report BLOCKS into a numbered outline with
   *          stable cross-references. Owns three things the builder must not
   *          re-invent: heading-level resolution (DOC-1), hierarchical auto-numbering
   *          (DOC-2) and stable cross-references (DOC-3).
   * PURITY:  pure. No DOM, no I/O, no clock — the same blocks always outline the
   *          same way, which is what DOD-7 requires of every generated artifact.
   * DEPENDS: App.md
   * INVARIANTS: an anchor is derived from a block ID and never from its title, which
   *             is what lets a cross-reference survive both a rename and a reorder.
   * ============================================================================= */
  (function (App) {
    'use strict';
    var MD = App.md;

    /* -------------------------------------------------------------------------
     * DOC-1: five levels, and what "auto" means.
     *
     * A block carries a level of 1..4 (a heading) or 5 (body text with no heading
     * of its own), or `null` meaning "decide for me". The decision is deliberately
     * boring, because a surprising rule in a document outline is worse than a
     * slightly dumb one:
     *
     *   * an explicit level always wins — this is the "controllable" half;
     *   * a custom section with no title resolves to 5, so writing a paragraph with
     *     no heading gives you a paragraph rather than an empty heading;
     *   * anything else takes the level of the last HEADING before it, making it a
     *     sibling. Not the last block: a body-text block must not drag the sections
     *     after it down to level 5.
     *
     * That single rule produces the nesting behaviour asked for. Set one section to
     * H1 and the H2s that follow become its children automatically, because the
     * numbering below reads the level sequence as a tree — no parent has to be
     * nominated anywhere.
     * ---------------------------------------------------------------------- */

    var BODY_LEVEL = 5;
    /* TTL-1: a TITLE is a heading that takes no number and gives none away.
     *
     * A document that opens with a title page, a foreword or an executive summary wants
     * that page to carry a heading and wants the numbering to start at 1 on the section
     * AFTER it. Levelling it H1 numbers it 1; levelling it N gives it no heading at all.
     * Neither is what a title is, so it is its own level: printed at the top level,
     * never numbered, and — the part that matters — it does not touch the counters, so
     * the first real H1 that follows is still 1.
     */
    var TITLE_LEVEL = 0;
    var LEVELS = [
      { value: TITLE_LEVEL, label: 'T', hint: 'Title — a heading with no number, and it does not consume one' },
      { value: 1, label: 'H1', hint: 'Top-level section' },
      { value: 2, label: 'H2', hint: 'Sub-section' },
      { value: 3, label: 'H3', hint: 'Sub-sub-section' },
      { value: 4, label: 'H4', hint: 'Fourth-level heading' },
      { value: BODY_LEVEL, label: 'N', hint: 'Normal text — no heading, keeps the level above it' }
    ];
    /** The short name of a resolved level — 'T', 'N' or 'H2'. One place, three views. */
    function levelLabel(lv) {
      return lv === TITLE_LEVEL ? 'T' : lv === BODY_LEVEL ? 'N' : 'H' + lv;
    }

    /**
     * DOC-1 + DOC-2: resolve levels and assign hierarchical numbers.
     *
     * Numbering is a counter stack: a level-N block increments counter N and clears
     * every counter below it, so 1 → 1.1 → 1.2 → 1.2.1 → 2 falls out of the order
     * alone. Body-text blocks are not numbered and do not disturb the counters.
     *
     * A level SKIP (an H3 with no H2 above it) has no single right answer. A typesetter
     * would number it 1.0.1; most authors mean "one level in". The formatting
     * profile decides via `clampSkips` — on by default, so the common case is the
     * friendly one — and either way the skip is reported on the block so the
     * designer can show it rather than silently reinterpreting the author.
     *
     * @param {Array<{id:string,label:string,level?:?number,title?:string,kind?:string,included?:boolean}>} blocks
     * @param {{baseLevel?:number, clampSkips?:boolean, numbered?:boolean}} [opts]
     * @returns {Array<Object>} the blocks, each with resolved
     *          {level, autoLevel:boolean, number:string, anchor:string, skipped:boolean}
     */
    function outline(blocks, opts) {
      opts = opts || {};
      var base = opts.baseLevel || 1;
      var clamp = opts.clampSkips !== false;
      var numbered = opts.numbered !== false;
      var counters = [], lastHeading = 0, depth = 0;
      var out = [];

      /** Take the next number at `lvl`, clearing everything below it. The counter stack
       *  is what makes 1 -> 1.1 -> 1.2 -> 1.2.1 -> 2 fall out of the order alone. */
      function bump(lvl) {
        counters.length = lvl;
        for (var i = 0; i < lvl; i++) if (counters[i] == null) counters[i] = 0;
        counters[lvl - 1]++;
        depth = lvl;
        return numbered ? counters.slice(0, lvl).join('.') : '';
      }

      /**
       * Resolve one block's level, advance the counters, and record it.
       *
       * `forced` marks a CHILD (a grouped dataset's group). A child advances the
       * counters and the depth, but deliberately does NOT become the "last heading"
       * the automatic rule reads: the groups under Packages are structural, not part
       * of the author's level sequence, and letting one set lastHeading made the next
       * top-level section a sibling of "Packages — Kept" rather than of "Packages".
       */
      function place(b, forced) {
        var explicit = (b.level === TITLE_LEVEL || b.level === 1 || b.level === 2 || b.level === 3 || b.level === 4 || b.level === BODY_LEVEL);
        var lvl;
        if (forced != null) {
          lvl = forced;                           // a child's level is set by its parent
        } else if (explicit) {
          lvl = b.level;
        } else if (b.kind === 'custom' && !String(b.title == null ? b.label : b.title).trim()) {
          lvl = BODY_LEVEL;                       // no header written ⇒ a paragraph
        } else {
          lvl = lastHeading || base;              // sibling of the last heading
        }

        var skipped = false;
        // TTL-1: a title is deliberately outside the counter machinery — not numbered,
        // not counted, and not the "last heading" the automatic rule reads. So a title
        // followed by an automatic section leaves that section at the base level, and
        // the first H1 after a title is still 1.
        if (lvl !== BODY_LEVEL && lvl !== TITLE_LEVEL) {
          if (lvl > depth + 1) { skipped = true; if (clamp) lvl = depth + 1; }
          bump(lvl);
          if (forced == null) lastHeading = lvl;
        }

        var res = Object.assign({}, b, {
          level: lvl,
          autoLevel: forced != null ? true : !explicit,
          skipped: skipped,
          number: (numbered && lvl !== BODY_LEVEL && lvl !== TITLE_LEVEL) ? counters.slice(0, lvl).join('.') : '',
          anchor: MD.anchor('sec-' + b.id)
        });
        out.push(res);
        return res;
      }

      (blocks || []).filter(function (b) { return b && b.included !== false; }).forEach(function (b) {
        var parent = place(b);
        var childLevel = parent.level === BODY_LEVEL ? base : Math.min(parent.level + 1, 4);
        /* SEC-2: a numbered introduction takes the FIRST of its section's child numbers,
         * so a register's groups shift down to make room for it — 4 Tactical, 4.1 the
         * introduction; 5 Packages, 5.1 the introduction, 5.2 Removed, 5.3 Disabled.
         *
         * It takes a number without becoming a BLOCK, because it is not one: it has no
         * heading, so it emits no anchor, so it is not something a cross-reference could
         * point at. The number is recorded on the parent and App.doc.render prefixes it
         * to the text. An empty introduction consumes nothing. */
        // `introBody` is the RENDERED introduction, which only the generator has built by
        // the time it outlines; the designer outlines the raw blocks, which carry the
        // unrendered `intro`. Either is evidence that there is one to number, and taking
        // both is what stops the preview numbering a section the document does not.
        var hasIntro = String((b.introBody == null ? b.intro : b.introBody) || '').trim();
        if (b.introNumbered && hasIntro && parent.level !== TITLE_LEVEL) {
          parent.introNumber = bump(childLevel);
        }
        /* TBL-1: a grouped dataset's groups are TABLES, not sub-sections.
         *
         * They used to be placed here as children one level down, which gave each of
         * them a numbered heading — "5.2 Removed", "5.3 Disabled" — and pushed a
         * heading between a section's introduction and the tables it introduces. The
         * group's declared name is no longer printed anywhere; a title row above each
         * table carries whatever the operator wants it to say instead.
         *
         * They keep their `children` array and their own table captions and anchors, so
         * a cross-reference can still point at one particular table; what they no longer
         * have is a heading, a number, or a place in the contents list.
         */
      });
      return out;
    }

    /* -------------------------------------------------------------------------
     * DOC-3: references that endure.
     *
     * The requirement is a link that survives both reordering and renaming. That
     * rules out linking by title (renaming breaks it) and by position (reordering
     * breaks it), which leaves linking by ID — so a reference stores nothing but the
     * target's id, and BOTH halves of what the reader sees are derived at render
     * time: the number comes from the outline, the title from the block.
     *
     * Deleting a target is the one case that cannot be derived away. It renders as a
     * visible "[missing reference]" rather than a silent gap, and the designer lists
     * the dangling ids, for the same reason the report states its omitted sections:
     * a document that quietly drops something is worse than one that admits it.
     * ---------------------------------------------------------------------- */

    /**
     * Build the reference resolver handed to App.md.runs().
     * @param {Array} resolved  the output of outline()
     * @param {Array<{id:string,number:string,caption:string,anchor:string}>} [tables]
     * @returns {(id:string)=>?{label:string,anchor:string}}
     */
    /* REF-1: a reference has three readings, and the designer picks one.
     *
     *   label       "Table 4: Packages removed" / "Section 2.1 — Firmware"
     *   numberLabel "Table 4"                   / "Section 2.1"
     *   titleLabel  "Packages removed"          / "Firmware"
     *
     * All three are derived here, from the outline and the table index, so a section
     * that moves or a table that gains one before it changes every reading of every
     * reference to it at the next render and nothing has to be re-inserted.
     *
     * The table's full reading uses a COLON rather than a dash, because that is the
     * separator the caption itself prints ("Table 4: Packages removed") — a reference
     * that reads differently from the thing it points at is a reference a reader has to
     * translate.
     */
    function sectionRef(b) {
      var title = String(b.title == null ? b.label : b.title).trim();
      var num = b.number ? 'Section ' + b.number : '';
      return {
        anchor: b.anchor,
        numberLabel: num || title,
        titleLabel: title || num,
        label: num ? (title ? num + ' — ' + title : num) : title
      };
    }
    function tableRef(t) {
      var num = 'Table ' + t.number;
      return {
        anchor: t.anchor, numberLabel: num, titleLabel: t.caption || num,
        label: num + (t.caption ? ': ' + t.caption : '')
      };
    }
    function figureRef(f) {
      var num = 'Figure ' + f.number;
      return {
        anchor: f.anchor, numberLabel: num, titleLabel: f.caption || num,
        label: num + (f.caption ? ': ' + f.caption : '')
      };
    }
    /* REF-1: a PARAGRAPH is a link target too.
     *
     * "See section 4" is often more precision than the writer has and less than the
     * reader wants — the thing being pointed at is one paragraph inside it. A paragraph
     * has no number of its own, so its readings are its opening words, which is what a
     * reader scanning for it will recognise. */
    var PARA_WORDS = 8;
    function paraRef(part, block) {
      var words = MD.plain(String(part.text || '')).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
      var snippet = words.slice(0, PARA_WORDS).join(' ') + (words.length > PARA_WORDS ? '…' : '');
      var where = String(block.title == null ? block.label : block.title).trim();
      var name = snippet || ('a paragraph' + (where ? ' in ' + where : ''));
      return { anchor: MD.anchor('par-' + part.id), numberLabel: name, titleLabel: name, label: name };
    }

    /** Every link target in the document, keyed by id. One walk, three consumers. */
    function refIndex(resolved, tables, figures) {
      var byId = {}, order = [];
      function add(id, kind, ref) { if (!byId[id]) order.push({ id: id, kind: kind }); byId[id] = ref; }
      (resolved || []).forEach(function (b) {
        // Body text has no heading, so there is nothing on the page to land on — but the
        // PARAGRAPHS inside it still have anchors of their own.
        if (b.level !== BODY_LEVEL) add(b.id, 'section', sectionRef(b));
        if (b.kind === 'custom') {
          (b.parts || []).forEach(function (p) {
            if (p && p.kind === 'para' && String(p.text || '').trim()) add(p.id, 'paragraph', paraRef(p, b));
          });
        }
      });
      (tables || []).forEach(function (t) { add(t.id, 'table', tableRef(t)); });
      (figures || []).forEach(function (f) { add(f.id, 'figure', figureRef(f)); });
      return { byId: byId, order: order };
    }

    /**
     * Build the reference resolver handed to App.md.runs().
     * @param {Array} resolved  the output of outline()
     * @param {Array<{id:string,number:string,caption:string,anchor:string}>} [tables]
     */
    function refResolver(resolved, tables, figures) {
      var idx = refIndex(resolved, tables, figures);
      return function (id) { return idx.byId[id] || null; };
    }

    /** The pickable link targets, for the designer's "insert reference" menu. */
    function refTargets(resolved, tables, figures) {
      var idx = refIndex(resolved, tables, figures);
      return idx.order.map(function (e) {
        var r = idx.byId[e.id];
        return { id: e.id, kind: e.kind, label: r.label, numberLabel: r.numberLabel, titleLabel: r.titleLabel };
      });
    }

    /**
     * CAP-1: the caption a hand-authored table carries. An author who typed one gets
     * theirs; one who did not still gets a caption, because an uncaptioned table would
     * desynchronise the numbering (above) — and because a numbered, named table is what
     * makes "see Table 4" possible at all.
     */
    function autoCaption(block, part) {
      var own = MD.plain(part.caption || '').trim();
      if (own) return own;
      var sec = String(block.title == null ? block.label : block.title).trim() || String(block.label || '').trim();
      return sec || 'Table';
    }

    App.doc = {
      LEVELS: LEVELS, BODY_LEVEL: BODY_LEVEL, TITLE_LEVEL: TITLE_LEVEL, levelLabel: levelLabel,
      outline: outline, refResolver: refResolver, refTargets: refTargets, autoCaption: autoCaption
    };
  })(App);
  /* =============================================================================
   * MODULE: App.report
   * PURPOSE: Turn a provider's DECLARED report columns, and the subject's metadata,
   *          into table data for the document. Produces tables only — headings,
   *          numbering and anchors belong to App.doc and the builder.
   * PURITY:  pure (data -> data)
   * ============================================================================= */
  (function (App) {
    'use strict';
    var MD = App.md;

    /* -------------------------------------------------------------------------
     * COL-3: an optional column's own default, and why "missing means included" was
     * not enough.
     *
     * The include-map is the generator's standard shape — a MISSING key means the thing
     * is in (§20.6) — which works when everything declared is wanted by default. It is
     * not true of every column: Rationale and Rollback are working notes rather than
     * things a signed report leads with, and turning them off in every section on every
     * project was a chore the tool was creating for itself.
     *
     * So a column may declare `defaultOff`, and a missing key means THAT column's
     * default rather than a blanket yes. An explicit key still wins in both directions,
     * so an operator who wants Rationale ticks it once and it travels with the project.
     * Declared by the adapter (DOD-11), never listed here.
     *
     * One function, used by the section builder, by the control-coverage builder and by
     * the designer's column list, so the three cannot disagree about what is showing.
     */
    function columnOn(col, colOpts) {
      if (!col) return true;
      var v = (colOpts || {})[col.id];
      return v === undefined ? col.defaultOff !== true : v !== false;
    }

    /**
     * TBL-1: the per-table wording for one of a section's tables.
     *
     * A section can produce several tables (a grouped register produces one per group),
     * and each of them wants its own title row, its own caption and — since the columns
     * carry different content in each — its own column headings. Keyed by the group
     * value, or `_all` for a section that produces one table, so the shape is the same
     * either way and nothing has to special-case "ungrouped".
     */
    var ONE_TABLE = '_all';
    function tableText(opts, key) { return ((opts.tables || {})[key] || {}); }
    /** The heading a column prints: what the operator typed, or what the adapter declares. */
    function headerFor(col, custom) {
      var own = String((custom || {})[col.id] || '').trim();
      return own || col.label;
    }

    /**
     * A section's tables as data, from the provider's DECLARED columns (spec §20.3) —
     * column- and group-aware, with no knowledge of any particular dataset (DOD-11). A
     * grouped section gives one table per group, told apart by the title row the
     * operator writes. Rows are sorted by key; an empty table is one "None." row.
     */
    function tables(sectionLabel, keyCol, columns, items, opts, ctx, groups) {
      opts = opts || {};
      var colOpts = opts.columns || {};
      var visible = (columns || []).filter(function (c) { return columnOn(c, colOpts); });
      var cols = [Object.assign({ id: '_key' }, keyCol)].concat(visible);
      function rowsFor(list) {
        return list.slice().sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; })
          .map(function (it) {
            return cols.map(function (c, i) {
              var v = c.get(it, ctx);
              return i === 0 ? { text: v == null ? '' : String(v), code: true } : { text: v == null ? '' : String(v) };
            });
          });
      }
      function tableFor(list, key, capId, dfltCaption) {
        var text = tableText(opts, key);
        var title = String(text.title || '').trim();
        var rows = rowsFor(list);
        if (!rows.length) {
          var empty = [{ text: 'None.' }];
          for (var i = 1; i < cols.length; i++) empty.push({ text: '' });
          rows = [empty];
        }
        return {
          captionId: capId, noCaption: text.noCaption === true || !capId,
          captionText: String(text.caption || '').trim() || title || dfltCaption,
          titleRow: title, header: cols.map(function (c) { return headerFor(c, text.columns); }), rows: rows,
          widths: (opts.widths && opts.widths.length === cols.length) ? opts.widths.slice() : null
        };
      }
      var capBase = opts.captionId || '';
      var capName = opts.captionText || sectionLabel;
      if (groups && groups.field) {
        var groupOpts = opts.groups || {};
        return groups.options.filter(function (g) { return groupOpts[g.value] !== false; }).map(function (g) {
          return tableFor(items.filter(function (it) { return it.decision && it.decision[groups.field] === g.value; }),
            g.value, capBase ? capBase + '-' + g.value : '', capName);
        });
      }
      return [tableFor(items, ONE_TABLE, capBase, capName)];
    }
    function metaData(meta, headings) {
      return { header: headings || ['Field', 'Value'], rows: (meta || []).map(function (m) {
        return [{ text: String(m.label) }, m.code === false ? { text: String(m.value) } : { text: String(m.value), code: true }];
      }) };
    }

    App.report = { tables: tables, metaData: metaData,
      // COL-3: the one answer to "is this optional column showing?".
      columnOn: columnOn };
  })(App);

  /* =============================================================================
   * MODULE: App.docHost — the contract between the module and its host application
   * PURPOSE: Hold the one object the host supplies, and say plainly when it is
   *          malformed. Everything the module needs from the outside world arrives
   *          here; nothing is ambient, so a test constructs a host inline rather
   *          than setting up and tearing down globals.
   * PURITY:  holds one reference. No DOM, no I/O, no clock of its own.
   * DEPENDS: nothing
   * INVARIANTS: the module NEVER persists anything itself. State is read through
   *             getState() and written through commit(), so the host keeps undo,
   *             dirty-tracking and autosave working.
   * ============================================================================= */
  (function (App) {
    'use strict';

    var _host = null;

    /**
     * @returns {string[]} one message per contract violation; empty means valid.
     *
     * Only four members are REQUIRED, because only four have no sensible default:
     * where state is read, where it is written, what the time is, and what sections
     * the host offers. `subject`, `filter` and `log` are each optional and each
     * degrade to something coherent — no subject picker, no filter axis, no log.
     */
    function validate(host) {
      var errs = [];
      if (!host || typeof host !== 'object') return ['host: not an object'];
      ['getState', 'commit'].forEach(function (k) {
        if (typeof host[k] !== 'function') errs.push('host.' + k + ' is required and must be a function');
      });
      if (!host.clock || typeof host.clock.nowIso !== 'function') {
        errs.push('host.clock is required and must expose nowIso()');
      }
      // A host whose section list depends on what is loaded declares a FUNCTION; a
      // host whose sections never change may hand over the array itself.
      if (!Array.isArray(host.sections) && typeof host.sections !== 'function') {
        errs.push('host.sections is required and must be an array or a function returning one');
      }
      if (host.subject) {
        ['list', 'ready', 'meta'].forEach(function (k) {
          if (typeof host.subject[k] !== 'function') errs.push('host.subject.' + k + ' must be a function');
        });
        // Optional: what the UI calls one subject ("platform", "site"). Defaults to "subject".
        if (host.subject.noun !== undefined && typeof host.subject.noun !== 'string') {
          errs.push('host.subject.noun must be a string');
        }
      }
      // CLS-2: the markings a design may carry. The host's vocabulary, never free text.
      if (host.classifications !== undefined && !(Array.isArray(host.classifications) &&
          host.classifications.every(function (c) { return typeof c === 'string' && c.trim() !== ''; }))) {
        errs.push('host.classifications must be an array of non-empty strings');
      }
      // build() and linkTerms() are a host's own business — the designer builds the
      // document itself (App.docGen.documentFor) — but a host that declares one must
      // declare a function.
      ['build', 'linkTerms'].forEach(function (k) {
        if (host[k] !== undefined && typeof host[k] !== 'function') errs.push('host.' + k + ' must be a function');
      });
      if (host.filter) {
        ['categories', 'categoryOf'].forEach(function (k) {
          if (typeof host.filter[k] !== 'function') errs.push('host.filter.' + k + ' must be a function');
        });
      }
      return errs;
    }

    function set(host) {
      var errs = validate(host);
      if (errs.length) throw new Error('invalid document host:\n  ' + errs.join('\n  '));
      _host = host;
      return _host;
    }

    function get() { return _host; }

    /**
     * The host's sections for one run.
     *
     * `run` is `{subjectId, categories}` — which subject the document is about and
     * which of the filter's categories it carries. A provider closes over that run,
     * so the module never carries it (design D12). Called with NO run, the host
     * returns the same providers unbound: their declarations — id, label, key
     * column, columns — are all the designer needs to draw a section it is not yet
     * generating.
     */
    function sections(run) {
      var h = _host;
      if (!h) return [];
      var s = h.sections;
      return (typeof s === 'function' ? s(run || null) : s) || [];
    }

    /**
     * The host's log sink, or a no-op.
     *
     * Takes an ISSUE — {severity, message, category?, location?} — because that is
     * what the module already produces everywhere else, and a host that shows a
     * warning differently from an error needs the severity, not a sentence with the
     * word "warning" in it. A host that declares no sink simply loses the message,
     * which is why every call site can be a bare statement with no null check.
     */
    function log(issue) {
      if (_host && typeof _host.log === 'function') _host.log(issue);
    }

    /* -------------------------------------------------------------------------
     * The ephemeral description of ONE generation run: which subject it is about,
     * what the file will be called, and the answers to its /[Tag] placeholders.
     *
     * NOT persisted, and deliberately so — a tag value is typically today's date or
     * the name of the person issuing the document, and the point of a placeholder is
     * that the same design produces a different document each time. Everything about
     * what the report is MADE of lives in the project instead.
     *
     * It belongs to the module because the designer is what decides it. It used to
     * live in CH's Generate tab as a plain object the designer reached in and wrote
     * to — two views sharing one mutable bag with no owner, which is how a key nobody
     * declared ends up in the generator's options.
     * ---------------------------------------------------------------------- */
    var _session = { subjectId: null, filename: '', tags: {} };
    var SESSION_KEYS = Object.keys(_session);

    function sessionGet() { return _session; }

    /** Only declared keys, because a typo that silently sticks is worse than a throw. */
    function sessionSet(patch) {
      Object.keys(patch || {}).forEach(function (k) {
        if (SESSION_KEYS.indexOf(k) === -1) {
          throw new Error('docSession: unknown key "' + k + '" (expected one of ' + SESSION_KEYS.join(', ') + ')');
        }
        _session[k] = patch[k];
      });
      return _session;
    }

    /* What describes one RUN, as distinct from what is selected in the workspace.
     * Kept apart because the run half travels into the generator's options, and a
     * subject id in there would quietly outrank the subject the caller asked for. */
    function sessionRun() { return { filename: _session.filename, tags: _session.tags }; }

    /** The subject the document is about: the host's, if the session's has gone. */
    function selectedSubjectId() {
      var h = _host;
      if (!h || !h.subject) return null;
      var list = h.subject.list() || [];
      if (_session.subjectId && list.some(function (c) { return c.id === _session.subjectId; })) return _session.subjectId;
      return list.length ? list[0].id : null;
    }

    /**
     * OPT-2: everything the generator is told about this document, in one object.
     *
     * Two halves, and the split is the whole point. What the report is MADE OF —
     * which sections, which groups, which columns, which of the filter's categories —
     * is stored WITH the project, because it is a decision about the report. The
     * filename and the tag answers are this run's, and are not stored at all.
     *
     * READ-ONLY: assembled fresh on every call. Writing to what it returns changes
     * nothing; the maps are written through App.docStore.setReportInclude and the run
     * fields through App.docSession.set.
     */
    function sessionOptions(state) {
      var st = state || (_host && _host.getState()) || {};
      var bag = st.report || {};
      var stored = bag.options || {};
      // A filter category that ships OFF says so itself, so the module never has to
      // hold an opinion about which of the host's categories is the awkward one.
      var rel = {};
      if (_host && _host.filter) {
        _host.filter.categories().forEach(function (c) { if (c.defaultOn === false) rel[c.key] = false; });
      }
      return Object.assign({}, sessionRun(), {
        sections: stored.sections || {},
        datasetSections: stored.datasetSections || {},
        columns: stored.columns || {},
        relevance: Object.assign(rel, stored.relevance || {}),
        // CLS-1: from the PROJECT, so it survives a reload and travels with the file.
        classification: typeof bag.classification === 'string' ? bag.classification : ''
      });
    }

    /** HOST-2: the run context a section is filled with: the host's, or the subject and the time. */
    function subjectContext(subjectId, generatedUtc) {
      var sj = _host && _host.subject;
      if (sj && typeof sj.context === 'function') return sj.context(subjectId, generatedUtc);
      return { subjectId: subjectId, generatedUtc: generatedUtc };
    }

    /** HOST-2 / META-1: the subject's metadata rows this design keeps: the host's, or meta() less the unticked. */
    function chosenMeta(subjectId, generatedUtc) {
      var sj = _host && _host.subject;
      if (sj && typeof sj.chosenMeta === 'function') return sj.chosenMeta(subjectId, generatedUtc);
      if (!sj || typeof sj.meta !== 'function') return [];
      var chosen = (((_host.getState() || {}).report) || {}).meta || {};
      return (sj.meta(subjectId) || []).filter(function (r) { return chosen[r.id] !== false; });
    }

    App.docHost = { set: set, get: get, validate: validate, sections: sections, log: log,
                    context: subjectContext, chosenMeta: chosenMeta };
    App.docSession = { get: sessionGet, set: sessionSet, run: sessionRun, options: sessionOptions,
                       selectedSubjectId: selectedSubjectId, KEYS: SESSION_KEYS };
  }(App));

  /* =============================================================================
   * MODULE: App.docProviders — the declarative half of the section contract
   * PURPOSE: Turn a section PROVIDER — a declaration of rows, a key column and
   *          columns — into table data, so a host that only wants a table does not
   *          have to write the code that draws one.
   * PURITY:  pure. No DOM, no I/O, no clock.
   * DEPENDS: App.report
   * ============================================================================= */
  (function (App) {
    'use strict';

    /** PDF-1: a provider's section as TABLE DATA. A provider that renders its own text
     *  (a render() function) has nothing these documents can show, and says so. */
    function sectionTables(provider, rows, ctx, opts) {
      if (!provider) return [];
      if (typeof provider.render === 'function') {
        return [{ captionId: '', noCaption: true, captionText: '', header: ['Note'],
          rows: [[{ text: '(This section is produced by its host as text and is not shown in this format.)' }]] }];
      }
      var key = provider.keyColumn || { id: '_key', label: 'Key', get: function (r) { return r.key; } };
      return App.report.tables(provider.label, key, provider.columns || [], rows || [], opts || {}, ctx || {}, provider.groups || null);
    }

    App.docProviders = { sectionTables: sectionTables };
  }(App));

  /* =============================================================================
   * MODULE: App.docBlocks — how a block is ordered, and how its table is worded
   * PURPOSE: Four helpers that decide the ORDER blocks are emitted in and the
   *          WORDING a generated table carries — its column headings, its title row
   *          and its caption. Nothing here knows what a device or a control is.
   * PURITY:  pure. No DOM, no I/O, no clock, no host state.
   * DEPENDS: App.md
   * INVARIANTS: an order naming a block that no longer exists is IGNORED, never
   *             fatal — deleting a dataset must not invalidate an arrangement.
   * ============================================================================= */
  (function (App) {
    'use strict';
    var MD = App.md;

    /**
     * Blocks in the operator's chosen order: those named first, in the order named;
     * everything else after, in declaration order. Ids that no longer exist are
     * simply ignored (same rule as procedure.order).
     */
    function applySectionOrder(list, order) {
      var pos = {}, n = (order || []).length;
      (order || []).forEach(function (id, i) { if (pos[id] === undefined) pos[id] = i; });
      return list.map(function (x, i) { return { x: x, k: pos[x.id] === undefined ? n + i : pos[x.id], i: i }; })
        .sort(function (a, b) { return (a.k - b.k) || (a.i - b.i); })
        .map(function (e) { return e.x; });
    }

    /** The operator's wording for one of a block's tables, or nothing. */
    function tableWording(b, key) { return ((b && b.tables) || {})[key] || {}; }

    /** Column headings after the operator's own wording is applied. */
    function headingsFor(ids, labels, custom) {
      return labels.map(function (l, i) {
        var own = String((custom || {})[ids[i]] || '').trim();
        return own || l;
      });
    }

    App.docBlocks = {
      applySectionOrder: applySectionOrder,
      tableWording: tableWording,
      headingsFor: headingsFor
    };
  }(App));

  /* =============================================================================
   * MODULE: App.docGen — DOC-GEN: the document, built from a host's declarations
   * PURPOSE: Turn what a HOST declares — its sections, its subject, its filter —
   *          into the blocks a document is made of, the columns each block prints
   *          and the finished document they make. This is the generator half of
   *          the module: the designer shows what this produces, and the host's
   *          own Generate button emits it.
   * PURITY:  pure. No DOM, no I/O, no clock — the time arrives on the context.
   * DEPENDS: App.docHost, App.docBlocks, App.docProviders, App.docFormat, App.doc,
   *          App.report, App.md
   * INVARIANTS: nothing in here knows what a device, a dataset or a control is.
   *             Everything specific to the app it is attached to arrives through a
   *             provider or through the host, which is what lets the same code
   *             generate CH's hardening report and something else entirely.
   * ============================================================================= */
  (function (App) {
    'use strict';

    /** The host's sections for a run, whether it declared an array or a function. */
    function sectionsOf(host, run) {
      var s = host && host.sections;
      return (typeof s === 'function' ? s(run || null) : s) || [];
    }

    /** Which subject, and which of the filter's categories, this document is about. */
    function runOf(opts) {
      return { subjectId: (opts && opts.subjectId) || null,
               categories: (opts && opts.categories) || (opts && opts.relevance) || null,
               // The Style's Document settings (numbering from 1), for a host that numbers its rows.
               numbering: (opts && opts.numbering) || null };
    }

    /**
     * The provider behind a block, if there is one.
     *
     * By block id first, because that is what a block IS. A block assembled by hand —
     * a designer probe asking "what columns would this section have?" — may carry only
     * the host's own key for it, so that is tried second.
     */
    function providerOf(opts, id, block, host) {
      var list = (opts && opts.providers) || [];
      // A caller that did not pre-bind the host's sections gets them bound here, from
      // the same run the options describe. Pre-binding is an optimisation for a whole
      // document — one binding for every block — not a precondition.
      if (!list.length && host) list = sectionsOf(host, runOf(opts));
      var hit = list.filter(function (x) { return x && x.id === id; })[0];
      if (hit || !block) return hit || null;
      var key = block.dsId || block.kind;
      return list.filter(function (x) { return x && includeOf(x).key === key; })[0] || null;
    }

    /* Where a section's per-column and per-group ticks live.
     *
     * A provider says where its own tick is stored — `include.map` names one of the
     * state's tick maps and `include.key` the entry in it — because CH keeps a
     * register's ticks in a different map from a one-off section's, and a module that
     * hardcoded either would have to be edited to add a section (DOD-11). */
    function includeOf(pv) {
      var inc = (pv && pv.include) || {};
      return { map: inc.map || 'sections', key: inc.key || (pv && pv.id), perGroup: inc.perGroup === true };
    }
    function columnKey(block, pv) {
      if (pv) return includeOf(pv).key;
      return block.dsId || block.kind;
    }
    function groupTicks(pv, opts, key) {
      var inc = includeOf(pv);
      return inc.perGroup ? ((opts[inc.map] || {})[key] || {}) : {};
    }

    /**
     * One provider, as the orderable block it becomes.
     *
     * `available()` is the reason a block can be a candidate at all: GUIDE-1 exists
     * only when something actually diverges, and a section that exists solely to say
     * "nothing diverges" is noise. A provider that never has nothing to say declares
     * no available(), and gets no `empty` flag to be greyed out by.
     */
    function providerBlock(pv, opts) {
      var inc = includeOf(pv);
      var map = opts[inc.map] || {};
      var b = Object.assign({}, pv.blockFields || {},
        { id: pv.id, kind: pv.kind || 'section', label: pv.label });
      if (inc.perGroup) {
        var entry = map[inc.key] || {};
        if (pv.groups && pv.groups.field) {
          b.groups = pv.groups.options.map(function (g) {
            return { value: g.value, label: g.label, included: entry[g.value] !== false };
          });
          // A grouped section is "included" while any one of its groups is.
          b.included = b.groups.some(function (g) { return g.included; });
        } else {
          b.groups = null;
          b.included = entry._all !== false;
        }
      } else {
        b.included = map[inc.key] !== false;
      }
      if (typeof pv.available === 'function') {
        var ok = pv.available();
        b.included = b.included && ok;
        b.empty = !ok;
      }
      return b;
    }

    /**
     * How many rows fall into each of the host's declared filter categories.
     * Shared by the designer's toggles and the document's omission note, so the
     * count shown before generating is the count the document states afterwards.
     */
    function filterCounts(host, rows) {
      var f = host && host.filter;
      if (!f) return {};
      var out = {};
      f.categories().forEach(function (c) { out[c.key] = 0; });
      (rows || []).forEach(function (r) {
        var k = f.categoryOf(r);
        if (out[k] !== undefined) out[k] += 1;
      });
      return out;
    }

    /**
     * The report's candidate BLOCKS, in the order they will be emitted (spec §20.4 /
     * GEN-4, RPT-3, DOC-1). The "Sections included" table, the report body and the
     * Report Design workspace are all built from THIS, so the three cannot drift.
     *
     * A block is the orderable unit and carries a stable id — `toc`, `meta`,
     * one per section the HOST declares, plus one per hand-authored custom section.
     * Ids come from the host's providers and from the project, so a host that adds a
     * section makes it orderable with no edit here (DOD-11).
     *
     * DOC-1: each block also carries its explicit heading `level` when the operator
     * has pinned one, or null for "decide automatically". Resolution happens in
     * App.doc.outline, not here — this function only reports what was chosen.
     *
     * @returns {Array<{id:string,kind:string,label:string,included:boolean,level:?number,
     *                  dsId?:string,title?:string,parts?:Array,
     *                  groups?:Array<{value:string,label:string,included:boolean}>}>}
     */
    var CENTRE_PARTS = ['heading', 'intro', 'table', 'content'];
    function centreParts(v) {
      var out = {};
      CENTRE_PARTS.forEach(function (k) { out[k] = v === true || !!(v && v[k] === true); });
      return out;
    }

    function hostBlocks(host, opts) {
      opts = opts || {};
      var state = (host && typeof host.getState === 'function' && host.getState()) || {};
      var sec = opts.sections || {}, d = [];
      var bag = state.report || {};
      var levels = bag.levels || {};

      /* TOC-1: the contents list is a section, so it can be ordered, levelled, renamed
       * and given an introduction like any other — placed wherever the section order
       * puts it, with the heading the operator gives it.
       *
       * TWO switches, and both mean something: "Include a contents list" in the
       * Style is the house decision and travels with the Style; the
       * section's own tick is this report's decision, like every other section's. A
       * profile with no contents list offers no row to tick. */
      var wantToc = !!(App.docFormat.resolve(state).toc || {}).include;
      d.push({ id: 'toc', kind: 'toc', label: 'Contents', included: wantToc && sec.toc !== false, empty: !wantToc });
      /* META-2: the provenance section exists only where the host has a SUBJECT to
       * describe. A host generating a document about nothing in particular — a policy,
       * a template — is not offered a section it could only leave blank. */
      if (host && host.subject && typeof host.subject.meta === 'function') {
        d.push({ id: 'meta', kind: 'meta', label: host.subject.metaLabel || 'Metadata', included: sec.meta !== false });
      }
      /* One block per section the host declares, in the order it declares them. This
       * used to iterate the platform's datasets and then push `control` and
       * `guidelines` by hand, which is what made three of CH's concepts structural
       * facts about the document module. */
      sectionsOf(host, runOf(opts)).forEach(function (pv) { d.push(providerBlock(pv, opts)); });

      // DOC-4: hand-authored sections join the SAME list, which is what lets them be
      // interleaved with the generated ones rather than bolted on at the end.
      (bag.sections || []).forEach(function (s) {
        d.push({
          id: s.id, kind: 'custom', label: String(s.title || '').trim() || '(untitled section)',
          title: s.title || '', parts: s.parts || [], included: sec[s.id] !== false
        });
      });

      var names = bag.names || {}, intros = bag.intros || {}, twidths = bag.tableWidths || {};
      var heads = bag.headings || {}, introNums = bag.introNumbered || {};
      var centred = bag.centred || {};
      var tableText = bag.tables || {}, breaks = bag.pageBreak || {}, noToc = bag.noToc || {};
      var space = bag.space || {};   // SPC-1
      return App.docBlocks.applySectionOrder(d, bag.order).map(function (b) {
        // NAM-2: a GENERATED section's heading is editable too. It has to be: once a
        // name and a heading are two different strings, a section whose name is a
        // shorthand needs somewhere to say what the long form actually is — and
        // "Deviations from Security Guidelines" is exactly the heading a house wants to
        // reword. A hand-authored section keeps its own Heading box (`title`) and is
        // deliberately not overridden here, so its heading has one home, not two.
        var dflt = b.title === undefined ? b.label : b.title;
        var heading = dflt;
        if (b.kind !== 'custom' && typeof heads[b.id] === 'string') heading = heads[b.id];
        var name = String(names[b.id] || '').trim();
        return Object.assign({}, b, {
          title: heading,
          // The wording the platform declares, so the designer can offer it as the
          // placeholder and tell a reworded heading from an untouched one.
          defaultTitle: dflt,
          // The list shows each section by its heading (a separate list name was more confusing than useful).
          label: String(heading).trim() || b.label,
          name: name,
          // TOC-1: a contents list starts as a TITLE — "1 Contents" numbered ahead of
          // the section it lists reads as a section of the report, which it is not. It
          // is only a default; the level picker moves it like any other block's.
          level: levels[b.id] === undefined ? (b.kind === 'toc' ? App.doc.TITLE_LEVEL : null) : levels[b.id],
          // Which parts are centred: the heading, the introduction, the table, an own
          // section's content. An old `true` centres them all.
          centre: centreParts(centred[b.id]),
          // SEC-1: prose the operator wrote to sit between this section's heading and
          // its generated table. Stored as the same rich-text token markup a custom
          // paragraph uses, so one editor serves both.
          intro: String(intros[b.id] || ''),
          // SEC-2: whether that introduction takes a number of its own.
          introNumbered: introNums[b.id] === true,
          // TW-2: hand-set column widths for this section's generated table.
          widths: Array.isArray(twidths[b.id]) ? twidths[b.id].slice() : null,
          // TBL-1: the title row, caption and column headings of each table this section
          // produces, keyed by group value (or `_all` when it produces just the one).
          tables: tableText[b.id] || null,
          /* SEC-4: whether this section starts a page of its own.
           *
           * Distinct from the formatting profile's per-LEVEL `pageBreakBefore`, which is
           * a house rule ("every H1 starts a page"); this is a decision about ONE
           * section, which is what an annex or a title page needs. App.doc emits the
           * break, so it lands ahead of the heading rather than inside the body. */
          pageBreakBefore: breaks[b.id] === true,
          /* SPC-1: millimetres of empty page above this section's heading.
           *
           * Composes with the page break above rather than replacing it: "start a new
           * page, then come down 60mm on it" is one signature page, and the two decisions
           * are made separately because either is useful without the other. */
          spaceBefore: Number(space[b.id]) > 0 ? Number(space[b.id]) : 0,
          // SEC-4: a section that prints a heading but is not listed in the contents —
          // a title block, a colophon, anything that is not part of the argument.
          noToc: noToc[b.id] === true
        });
      });
    }
    /**
     * TW-2/CCOL-1: the COLUMNS a generated section's table will have, as they will be
     * after the optional ones are filtered.
     *
     * The Report Design pane needs this twice over: to offer a tick per optional column,
     * and to draw a width editor with the right number of slots and the right labels.
     * Deriving it here rather than in the view is what keeps the designer's picture and
     * the generated table the same picture — the same rule as reportBlocks.
     *
     * @returns {?{fixed:Array<{id,label}>, optional:Array<{id,label}>, all:Array<{id,label}>}}
     *          null for a hand-authored section, whose parts carry their own columns
     */
    /**
     * The key a section's column ticks are stored under: the provider's own (its
     * include key, which is its id unless it says otherwise) — the key the document
     * builder reads them back under. Unbound, so the designer can ask with no run.
     */
    function sectionColumnKey(host, block, opts) {
      var pv = providerOf(opts || {}, block.id, block, host) || providerOf({ providers: sectionsOf(host, null) }, block.id, block);
      return columnKey(block, pv);
    }

    function hostColumns(host, block, opts) {
      opts = opts || {};
      if (!block || block.kind === 'custom') return null;
      var colOpts = (opts.columns || {})[sectionColumnKey(host, block, opts)] || {};
      function pack(fixed, optional) {
        // COL-3: the same predicate the builders use, so the designer's column list and
        // the table it is describing cannot disagree about what a blank answer means.
        var shown = optional.filter(function (c) { return App.report.columnOn(c, colOpts); });
        return { fixed: fixed, optional: optional, all: fixed.concat(shown) };
      }
      // A provider's COLUMNS are static, but its rows() and render() are bound to a
      // run. The designer asks for columns with no run in hand, so it falls back to
      // the host's UNBOUND providers: only the declarations are read here.
      var unbound = { providers: sectionsOf(host, null) };
      var hp = providerOf(opts, block.id, block, host) || providerOf(unbound, block.id, block);
      if (hp) {
        // KEY-1: the key column is DECLARED. It used to be recovered by rendering an
        // empty section and scraping the first pipe-table header row out of the result,
        // which returned nothing at all for a provider whose section is not a pipe
        // table — a trap for the next section rather than for these three.
        var key = hp.keyColumn || { id: '_key', label: 'Key' };
        var declared = hp.columns || [];
        // A column the provider did not mark `optional` is FIXED: it is in the table,
        // and it takes a width slot, but it is offered no tick — because a tick that
        // cannot turn anything off is worse than no tick at all.
        // Every declared column can be switched off; only the key column (the row's
        // identifier) is always there.
        return pack([{ id: key.id || '_key', label: key.label }], declared);
      }
      if (block.kind === 'meta') return pack([{ id: 'field', label: 'Field' }, { id: 'value', label: 'Value' }], []);
      return null;
    }
    /* =========================================================================
     * GEN-TAB: `/[Tag]` — a placeholder filled in at generate time.
     *
     * Write `/[Date]` in a heading, an introduction, a table cell, a footer — anywhere
     * you type text — and the Generate pane lists it once with a box beside it. What you
     * put in the box replaces every occurrence in the document.
     *
     * Found and replaced on the FINISHED document's text, not on the strings that went
     * into it: a tag can appear in a heading, an introduction, a table's title row, a
     * column heading, a paragraph, a cell or a header slot, and the document is the one
     * place they have all arrived at. The body is deliberately narrow — letters, digits,
     * spaces, `_` and `-`, up to 40 characters — so that a `/[` inside captured data
     * cannot be mistaken for one. (The backslashes are optional so a tag written into
     * older, escaped text still matches.)
     */
    var TAG_RE = /\/(\\?)\[([A-Za-z0-9 _-]{1,40})(\\?)\]/g;

    /** Every distinct tag in a document, in the order it is first written. */
    function findTags(md) {
      var seen = {}, out = [], m;
      TAG_RE.lastIndex = 0;
      while ((m = TAG_RE.exec(String(md == null ? '' : md))) !== null) {
        var name = m[2];
        if (!seen[name]) { seen[name] = true; out.push(name); }
      }
      return out;
    }

    /**
     * Replace each tag with what the operator typed for it.
     *
     * A tag with no value is LEFT AS IT IS rather than blanked. A document with
     * `/[Date]` still printed in it is obviously unfinished; one with a silent gap where
     * the date should be reads as complete and is not — the same rule the rest of this
     * file follows for a missing cross-reference and an unstated omission.
     */
    function applyTags(text, values) {
      values = values || {};
      return String(text == null ? '' : text).replace(TAG_RE, function (whole, e1, name) {
        var v = values[name];
        if (v === undefined || v === null || !String(v).length) return whole;
        return String(v);
      });
    }
    /** PDF-1: one block with its generated content as data — tables, or the contents marker. */
    function contentOf(host, b, opts, ctx, metaRows) {
      opts = opts || {};
      var capText = String(b.title || '').trim() || b.label;
      var tblOpts = { captionId: b.id, captionText: capText, widths: (b.widths && b.widths.length) ? b.widths : null };
      if (b.kind === 'toc') return Object.assign({}, b, { content: 'toc' });
      if (b.kind === 'meta') {
        var text = App.docBlocks.tableWording(b, '_all');
        var data = App.report.metaData(metaRows || [], App.docBlocks.headingsFor(['field', 'value'], ['Field', 'Value'], text.columns));
        var title = String(text.title || '').trim();
        return Object.assign({}, b, { content: [Object.assign(data, { captionId: text.noCaption === true ? '' : b.id, noCaption: text.noCaption === true,
          captionText: String(text.caption || '').trim() || title || capText, titleRow: title, widths: tblOpts.widths })] });
      }
      var pv = providerOf(opts, b.id, null, host);
      if (pv) {
        var ck = columnKey(b, pv);
        return Object.assign({}, b, { content: App.docProviders.sectionTables(pv, pv.rows ? pv.rows() : [], ctx, Object.assign({
          columns: (opts.columns || {})[ck], groups: groupTicks(pv, opts, ck), tables: b.tables || null, block: b }, tblOpts)) });
      }
      return Object.assign({}, b, { content: [] });
    }

    /** The heading-number depth a numbering format allows. */
    function numberDepth(style) { return String(style.numbering.format || '1.1.1').split('.').length; }

    /**
     * PDF-1: the finished DOCUMENT — blocks of runs — from content-filled blocks. Owns what
     * the outline and its numbers, table numbers in
     * emitted order, the reference index, intros, custom parts, and `/[Tag]` values.
     */
    function buildDocument(host, blocks, meta) {
      meta = meta || {};
      var state = (host && typeof host.getState === 'function' && host.getState()) || {};
      var style = App.docFormat.resolve(state);
      var resolved = App.doc.outline(blocks, { baseLevel: 1, clampSkips: true, numbered: style.numbering.on });
      var depth = numberDepth(style);
      // Table numbers, in the order the tables will be emitted.
      var tableList = [], n = 0;
      var figureList = [], nf = 0;
      resolved.forEach(function (b) {
        if (b.kind === 'custom') {
          (b.parts || []).forEach(function (p) {
            if (p.kind === 'table' && p.noCaption !== true && (p.header || []).length) {
              n++; tableList.push({ id: p.id, number: String(n), caption: App.doc.autoCaption(b, p), anchor: App.md.anchor('tbl-' + p.id) });
            }
            if (p.kind === 'image' && (p.images || []).slice(0, FIG_BOXES(p.layout)).some(Boolean)) {
              if (p.captions === 'separate') {
                (p.images || []).slice(0, FIG_BOXES(p.layout)).forEach(function (im, k) {
                  if (!im) return;
                  nf++; var fid = p.id + '.' + (k + 1);
                  figureList.push({ id: fid, number: String(nf), caption: String(im.caption || '').trim(), anchor: App.md.anchor('fig-' + fid) });
                });
              } else if (p.captions !== 'none') {
                nf++; figureList.push({ id: p.id, number: String(nf), caption: String(p.caption || '').trim(), anchor: App.md.anchor('fig-' + p.id) });
              }
            }
          });
        } else if (Array.isArray(b.content)) {
          b.content.forEach(function (t) {
            if (!t.noCaption && t.captionId) { n++; var anc = App.md.anchor('tbl-' + t.captionId); tableList.push({ id: anc, number: String(n), caption: t.captionText, anchor: anc }); }
          });
        }
      });
      var resolveRef = App.doc.refResolver(resolved, tableList, figureList);
      var figById = {}; figureList.forEach(function (f) { figById[f.id] = f; });
      var byId = {}; tableList.forEach(function (t) { byId[t.id] = t; });
      var tags = meta.tags || {};
      function tag(s) { return applyTags(s, tags); }
      function runs1(s) { var ps = App.md.runs(s, { resolveRef: resolveRef }); return ps.length ? ps.reduce(function (a, p, i) { return i ? a.concat([{ br: true }, { br: true }], p) : p; }, []) : []; }
      // A line break typed into register text (a description, a justification) is a break in the cell.
      function textRuns(s, extra) {
        var out = [];
        tag(String(s == null ? '' : s)).split(/\r?\n/).forEach(function (line, i) {
          if (i) out.push({ br: true });
          if (line) out.push(Object.assign({ text: line }, extra || {}));
        });
        return out.length ? out : [Object.assign({ text: '' }, extra || {})];
      }
      function caption(t) { return t ? { runs: [{ text: 'Table ' + t.number + ': ' + tag(t.caption) }] } : null; }
      function figCaption(f) { return f ? { runs: [{ text: 'Figure ' + f.number + (f.caption ? ': ' + tag(f.caption) : '') }] } : null; }
      /** An image part as a figure block, or null when it has no image in any of its boxes. */
      function figureBlock(p) {
        var count = FIG_BOXES(p.layout);
        var ims = (p.images || []).slice(0, count);
        if (!ims.some(Boolean)) return null;
        while (ims.length < count) ims.push(null);
        var sep = p.captions === 'separate';
        return {
          kind: 'figure', layout: FIGURE_LAYOUTS[p.layout] ? p.layout : 'single',
          anchor: sep ? undefined : App.md.anchor('fig-' + p.id),
          caption: sep ? null : figCaption(figById[p.id]),
          images: ims.map(function (im, k) {
            if (!im) return null;
            var fid = p.id + '.' + (k + 1);
            var pct = Math.min(100, Math.max(5, Number(im.width) || 100));
            return { src: IMAGE_PATH(im.source, im.file), name: String(im.name || im.file), width: pct / 100, border: !im.noBorder,
              caption: sep ? figCaption(figById[fid]) : null, anchor: sep ? App.md.anchor('fig-' + fid) : undefined };
          })
        };
      }
      /** Whether a part of a block is centred (`centre` is per part, or `true` for all). */
      function centres(b, part) { return b.centre === true || !!(b.centre && b.centre[part]); }
      var out = [];
      resolved.forEach(function (b) {
        if (b.pageBreakBefore) out.push({ kind: 'pageBreak' });
        var title = String(b.title == null ? b.label : b.title).trim();
        var heading = b.level !== App.doc.BODY_LEVEL && title;
        if (heading) {
          var num = b.number && b.number.split('.').length <= depth ? b.number : '';
          out.push({ kind: 'heading', level: b.level, number: num, anchor: b.anchor, runs: textRuns(title),
            centre: centres(b, 'heading'), spaceBefore: b.spaceBefore || 0, noToc: b.kind === 'toc' || !!b.noToc });
        } else out.push({ kind: 'space', mm: b.spaceBefore || 0, anchor: b.anchor });   // where a reference to it lands
        var intro = App.md.runs(b.intro || '', { resolveRef: resolveRef });
        intro.forEach(function (rs, i) {
          out.push({ kind: 'paragraph', style: 'body', centre: centres(b, 'intro'),
            runs: (i === 0 && b.introNumber ? [{ text: b.introNumber + ' ' }] : []).concat(rs) });
        });
        if (b.content === 'toc') { out.push({ kind: 'toc' }); return; }
        if (b.kind === 'custom') {
          (b.parts || []).forEach(function (p) {
            var centre = !!(p.centre || centres(b, 'content'));
            if (p.kind === 'rule') out.push({ kind: 'rule' });
            else if (p.kind === 'pagebreak') out.push({ kind: 'pageBreak' });
            else if (p.kind === 'space') out.push({ kind: 'space', mm: Number(p.height) || 0 });
            else if (p.kind === 'para') {
              App.md.runs(p.text, { resolveRef: resolveRef }).forEach(function (rs, i) {
                out.push({ kind: 'paragraph', style: 'body', centre: centre, anchor: i === 0 && p.id ? App.md.anchor('par-' + p.id) : undefined, runs: rs });
              });
            } else if (p.kind === 'table' && (p.header || []).length) {
              var cols = (p.header || []).map(function (h, k) {
                return { width: (p.widths && p.widths.length === p.header.length) ? p.widths[k] : undefined, align: (p.align || [])[k] || 'l' };
              });
              out.push({ kind: 'table', anchor: App.md.anchor('tbl-' + p.id), caption: caption(byId[p.id]), columns: cols, centre: centre,
                header: p.header.map(runs1), rows: (p.rows || []).map(function (r) { return p.header.map(function (_, k) { return runs1(r && r[k] != null ? r[k] : ''); }); }),
                rowHeight: Number(p.rowHeight) || 0, tallRows: (p.tallRows && p.tallRows.length === (p.rows || []).length) ? p.tallRows : null });
            } else if (p.kind === 'image') { var fb = figureBlock(p); if (fb) out.push(fb); }
          });
          return;
        }
        (Array.isArray(b.content) ? b.content : []).forEach(function (t) {
          out.push({ kind: 'table', anchor: t.captionId ? App.md.anchor('tbl-' + t.captionId) : undefined, caption: t.noCaption ? null : caption(byId[App.md.anchor('tbl-' + t.captionId)]),
            titleRow: t.titleRow ? textRuns(t.titleRow) : null, centre: centres(b, 'table'),
            columns: t.header.map(function (_, k) { return { width: t.widths ? t.widths[k] : undefined }; }),
            header: t.header.map(function (h) { return textRuns(h); }), rows: t.rows.map(function (r) { return r.map(function (c) { return c.code ? textRuns(c.text, { code: true }) : textRuns(c.text); }); }) });
        });
      });
      // Tags in hand-written runs, too (headings and generated cells were filled above).
      out.forEach(function (blk) {
        [blk.runs, blk.caption && blk.caption.runs].concat(blk.header || [], [].concat.apply([], blk.rows || [])).forEach(function (rs) {
          (rs || []).forEach(function (r) { if (r && r.text) r.text = tag(r.text); });
        });
      });
      var tagged = JSON.parse(JSON.stringify(style));
      ['header', 'footer', 'firstHeader', 'firstFooter'].forEach(function (k) {
        ['left', 'centre', 'right'].forEach(function (s) { tagged.headerFooter[k][s] = tag(tagged.headerFooter[k][s]); });
      });
      var all = JSON.stringify(out) + JSON.stringify(tagged.headerFooter);
      var docTitle = tag(String(meta.title || ''));
      return {
        document: { title: docTitle, meta: { title: docTitle, platform: meta.platform || '', date: meta.date || '', marking: meta.classification || '' }, blocks: out },
        style: tagged, tags: findTags(all),
        // What a reference can point at, and how each reads — for the designer's link menu and editors.
        refs: { resolve: resolveRef, targets: App.doc.refTargets(resolved, tableList, figureList) }
      };
    }

    /** PDF-1: the whole document for a run, built the way the host's produce builds it. */
    function documentFor(host, opts, meta) {
      var o = Object.assign({}, opts || {});
      if (!o.numbering) {
        var st = (host && typeof host.getState === 'function' && host.getState()) || {};
        o.numbering = App.docFormat.resolve(st).document;
      }
      var blocks = hostBlocks(host, o).filter(function (b) { return b.included; });
      var utc = (meta && meta.utc) || (host && host.clock && host.clock.nowIso ? host.clock.nowIso() : '');
      var m = o.subjectId ? App.docHost.chosenMeta(o.subjectId, utc) : null;
      var ctx = o.subjectId ? App.docHost.context(o.subjectId, utc) : {};
      var prepared = blocks.map(function (b) { return contentOf(host, b, o, ctx, m); });
      return buildDocument(host, prepared, Object.assign({}, meta, { tags: (meta && meta.tags) || o.tags || {} }));
    }

    App.docGen = {
      // The blocks a document is made of, and the columns a generated one prints.
      reportBlocks: hostBlocks, sectionColumns: hostColumns, sectionColumnKey: sectionColumnKey,
      // How many rows sit in each of the host's filter categories.
      filterCounts: filterCounts,
      // GEN-TAB: `/[Tag]` placeholders — finding them and filling them.
      findTags: findTags, applyTags: applyTags, TAG_RE: TAG_RE,
      // PDF-1: blocks in, the finished document (blocks of runs) and its Style out.
      contentOf: contentOf, buildDocument: buildDocument, documentFor: documentFor,
      // Exposed for a host that assembles its own run: the sections for a run, and
      // the provider behind one block.
      sectionsOf: sectionsOf, providerOf: providerOf
    };
  })(App);

  /* =============================================================================
   * MODULE: App.docStore  — DS-1..DS-6: the Report Design mutators
   * PURPOSE: Every write the Report Design workspace makes to the project — heading
   *          levels, custom sections and their parts, formatting profiles, section
   *          templates, report templates. Kept out of App.store because none of it
   *          touches the register, the devices or the controls; it is document
   *          composition, and App.store is already the largest module in the file.
   * PURITY:  NOT pure (mutates the project) — but every id it mints is DERIVED, never
   *          random, so the same sequence of edits produces the same project bytes.
   * DEPENDS: App.docHost (getState/commit), App.docFormat
   * INVARIANTS: ids are stable for the life of the thing they name — renaming a
   *             section or reordering the document never re-mints one, because
   *             cross-references (DOC-3) are stored against exactly those ids.
   * ============================================================================= */
  (function (App) {
    'use strict';

    /* The project, read through the host — never off a store this module knows the
     * name of. Everything below runs against whatever the host handed over. */
    function P() { return App.docHost.get().getState(); }
    function errNoProject() { return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'No project loaded.' }] }; }
    function err(msg, loc) { return { ok: false, issues: [{ category: 'validation', severity: 'error', message: msg, location: loc }] }; }
    function ok() { return { ok: true, issues: [] }; }

    /** The `report` sub-object, created on demand. Callers run inside _commit. */
    function bag(p) { p.report = p.report || {}; return p.report; }

    /**
     * DS-1: mint the next id in a family.
     *
     * Deterministic by construction — the next free integer suffix, not a random or
     * clock-derived value. Two operators performing the same edits on the same
     * project get the same ids, which is what keeps the project file byte-stable
     * (DOD-7) and makes a cross-reference portable between their two copies.
     */
    function nextId(prefix, existing) {
      var max = 0;
      (existing || []).forEach(function (x) {
        var m = /(\d+)$/.exec(String((x && x.id) || x));
        if (m) max = Math.max(max, parseInt(m[1], 10));
      });
      return prefix + (max + 1);
    }

    /** Every part id currently in use, across every section AND every template —
     *  a part id must be unique document-wide or a table reference could aim at two. */
    function allParts(p) {
      var out = [];
      ((p.report && p.report.sections) || []).forEach(function (s) { out = out.concat(s.parts || []); });
      ((p.report && p.report.sectionTemplates) || []).forEach(function (t) { out = out.concat(t.parts || []); });
      return out;
    }

    function findSection(p, id) {
      return ((p.report && p.report.sections) || []).filter(function (s) { return s.id === id; })[0] || null;
    }

    /**
     * RPT-3: the order the sections are emitted in — block ids first, everything
     * unnamed keeping its declared position behind them.
     *
     * An EMPTY list is the reset: it deletes the key rather than storing `[]`, so a
     * project that was never reordered and one that was reordered back are the same
     * bytes (DOD-7).
     */
    function setReportOrder(order) {
      if (!P()) return errNoProject();
      var ids = (order || []).map(String);
      App.docHost.get().commit(function (p) {
        bag(p).order = ids;
        if (!ids.length) delete p.report.order;
        if (!Object.keys(p.report).length) delete p.report;
      });
      return ok();
    }

    // ---- DS-2: heading levels ------------------------------------------------

    /**
     * Pin a block to a heading level, or hand it back to the automatic rule.
     * @param {string} blockId  any block id — a built-in section or a custom one
     * @param {?number} level   1..5, or null/'' to return to automatic
     */
    function setBlockLevel(blockId, level) {
      if (!P()) return errNoProject();
      if (!blockId) return err('A section is required.');
      var lv = (level === null || level === undefined || level === '') ? null : Number(level);
      if (lv !== null && [App.doc.TITLE_LEVEL, 1, 2, 3, 4, App.doc.BODY_LEVEL].indexOf(lv) === -1) {
        return err('Heading level must be 1-4, 5 for normal text, or 0 for an unnumbered title.');
      }
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.levels = b.levels || {};
        // Automatic is the ABSENT state rather than a stored null, so a section that
        // was never touched and one handed back to automatic serialise identically.
        if (lv === null) delete b.levels[blockId]; else b.levels[blockId] = lv;
        if (!Object.keys(b.levels).length) delete b.levels;
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    /**
     * Centre a whole section's body. Absent means "not centred", so a section that was
     * centred and un-centred leaves no trace in the file (DOD-7).
     */
    function setBlockCentre(blockId, on) { return setBlockFlag('centred', blockId, on); }

    /**
     * Centre one part of a section: its heading, introduction, table or (an own
     * section's) content. An old whole-section `true` is first spread over every part,
     * so un-ticking one keeps the others; nothing centred leaves nothing stored.
     */
    function setBlockCentrePart(blockId, part, on) {
      if (!P()) return errNoProject();
      if (!blockId) return err('A section is required.');
      var parts = ['heading', 'intro', 'table', 'content'];
      if (parts.indexOf(part) === -1) return err('Unknown part "' + part + '".');
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.centred = b.centred || {};
        var cur = b.centred[blockId];
        var next = {};
        parts.forEach(function (k) { if (cur === true || (cur && cur[k] === true)) next[k] = true; });
        if (on) next[part] = true; else delete next[part];
        if (Object.keys(next).length) b.centred[blockId] = next; else delete b.centred[blockId];
        if (!Object.keys(b.centred).length) delete b.centred;
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    /**
     * A per-section boolean, stored as PRESENCE. Off leaves no trace in the file, so a
     * section that was switched on and off again serialises exactly as one that never
     * was (DOD-7) — the rule every block-keyed field here follows.
     *
     * SEC-4 added two more of these (`pageBreak`, `noToc`) to the one that existed
     * (`centred`), which is what turned three copies of the same eight lines into one.
     * @param {'centred'|'pageBreak'|'noToc'} bagKey
     */
    var BLOCK_FLAGS = ['centred', 'pageBreak', 'noToc'];
    function setBlockFlag(bagKey, blockId, on) {
      if (!P()) return errNoProject();
      if (!blockId) return err('A section is required.');
      if (BLOCK_FLAGS.indexOf(bagKey) === -1) return err('Unknown section flag "' + bagKey + '".');
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b[bagKey] = b[bagKey] || {};
        if (on) b[bagKey][blockId] = true; else delete b[bagKey][blockId];
        if (!Object.keys(b[bagKey]).length) delete b[bagKey];
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    /**
     * SPC-1: how far down the page a section's HEADING starts, in millimetres.
     *
     * A number, so it is not one of BLOCK_FLAGS — but it follows the same presence rule:
     * zero is stored as absence, so a gap that was set and cleared leaves the project
     * exactly as it found it (DOD-7).
     *
     * Above the heading rather than below it, which is the whole reason it cannot be a
     * Space part: a signature page wants its heading two thirds of the way down, and
     * every part a section has is already underneath that heading.
     */
    function setBlockSpace(blockId, mm) {
      if (!P()) return errNoProject();
      if (!blockId) return err('A section is required.');
      var v = mmValue(mm);
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.space = b.space || {};
        if (v > 0) b.space[blockId] = v; else delete b.space[blockId];
        if (!Object.keys(b.space).length) delete b.space;
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    /**
     * CLS-1 / CLS-2: the classification marking the report carries on every page: one of the
     * host's `classifications`, or none ('').
     *
     * It used to live in the session block with the filename and the `/[Tag]` values, on
     * the reasoning that it was an answer for one run. It is not: the sensitivity of what
     * a report contains is a property of the report, and a house that classifies one
     * classifies all of them — so re-ticking it every time the tool was opened was work
     * with no decision in it, and a document issued from an unticked session went out
     * unmarked. Stored with the design; none is stored as absence.
     */
    function setClassification(marking) {
      if (!P()) return errNoProject();
      var text = marking == null ? '' : String(marking);
      var allowed = App.docHost.get().classifications || [];
      if (text && allowed.indexOf(text) === -1) {
        return err('"' + text + '" is not one of the classification markings this application offers.', 'classification');
      }
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        if (text) b.classification = text; else delete b.classification;
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    /**
     * NAM-1: the name the designer's section list calls a block, when that is not the
     * same string as the heading the document prints. Blank hands it back to the
     * heading, and is stored as absence so a named-then-unnamed section leaves no trace.
     */
    function setBlockName(blockId, name) {
      return setBlockText('names', blockId, name);
    }

    /**
     * SEC-1: prose that sits between a generated section's heading and its table.
     * Same rich-text token markup a custom paragraph uses (App.md.runs), so the one
     * editor serves both.
     */
    function setBlockIntro(blockId, text) {
      return setBlockText('intros', blockId, text);
    }

    /**
     * SEC-2: whether a section's introduction takes a number of its own.
     *
     * It takes the FIRST of the section's child numbers, so a register's groups shift
     * down to make room — 5 Packages, 5.1 the introduction, 5.2 Removed. Off is the
     * absent state, so a numbered-then-unnumbered introduction leaves no trace.
     */
    function setBlockIntroNumbered(blockId, on) {
      if (!P()) return errNoProject();
      if (!blockId) return err('A section is required.');
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.introNumbered = b.introNumbered || {};
        if (on) b.introNumbered[blockId] = true; else delete b.introNumbered[blockId];
        if (!Object.keys(b.introNumbered).length) delete b.introNumbered;
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    /**
     * NAM-2: the heading a GENERATED section prints, when the platform's own label is
     * not the wording this house uses. Blank hands it back to the label, so a reworded
     * and then blanked heading leaves no trace in the file.
     *
     * Hand-authored sections are not covered here on purpose: they already own their
     * heading as `title`, and two places to set one thing is how they end up disagreeing.
     */
    function setBlockHeading(blockId, heading) {
      return setBlockText('headings', blockId, heading);
    }

    function setBlockText(bagKey, blockId, value) {
      if (!P()) return errNoProject();
      if (!blockId) return err('A section is required.');
      var v = String(value == null ? '' : value);
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b[bagKey] = b[bagKey] || {};
        if (v.trim()) b[bagKey][blockId] = v; else delete b[bagKey][blockId];
        if (!Object.keys(b[bagKey]).length) delete b[bagKey];
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    /* TBL-1: the wording of ONE of a section's generated tables.
     *
     * A grouped register produces several tables from one block, and they used to be
     * distinguished by a sub-heading carrying the group's declared name. With those gone
     * the operator names each table instead — a title row above it, a caption under it,
     * and a heading per column, because the same column carries different content in
     * each of them ("Package" in one, "Package removed" in another).
     *
     * Keyed `report.tables[blockId][tableKey]`, where tableKey is the group value or
     * `_all` for a section that produces a single table. Blank is stored as ABSENCE at
     * every level, so a table that was named and then un-named leaves no trace in the
     * file (DOD-7), exactly as the heading and name fields do.
     */
    function pruneTables(b, blockId, key) {
      var byBlock = b.tables && b.tables[blockId];
      if (!byBlock) return;
      var e = byBlock[key];
      if (e && e.columns && !Object.keys(e.columns).length) delete e.columns;
      if (e && !Object.keys(e).length) delete byBlock[key];
      if (!Object.keys(byBlock).length) delete b.tables[blockId];
      if (b.tables && !Object.keys(b.tables).length) delete b.tables;
    }

    /** @param {'title'|'caption'} field */
    function setTableText(blockId, tableKey, field, value) {
      if (!P()) return errNoProject();
      if (!blockId || !tableKey) return err('A table is required.');
      if (field !== 'title' && field !== 'caption') return err('A table carries a "title" or a "caption".');
      var v = String(value == null ? '' : value);
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.tables = b.tables || {};
        var byBlock = b.tables[blockId] = b.tables[blockId] || {};
        var e = byBlock[tableKey] = byBlock[tableKey] || {};
        if (v.trim()) e[field] = v; else delete e[field];
        pruneTables(b, blockId, tableKey);
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    /**
     * CAP-4: whether one of a section's tables prints a caption at all.
     *
     * Stored beside the wording, because it is the same decision one step further: a
     * caption you did not write, then a caption you do not want. An uncaptioned table
     * is also left out of the NUMBERING (see App.docGen.buildDocument), so the numbers a
     * reader counts and the numbers a cross-reference names stay the same numbers.
     * @param {string} blockId @param {string} tableKey @param {boolean} off
     */
    function setTableNoCaption(blockId, tableKey, off) {
      if (!P()) return errNoProject();
      if (!blockId || !tableKey) return err('A table is required.');
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.tables = b.tables || {};
        var byBlock = b.tables[blockId] = b.tables[blockId] || {};
        var e = byBlock[tableKey] = byBlock[tableKey] || {};
        if (off) e.noCaption = true; else delete e.noCaption;
        pruneTables(b, blockId, tableKey);
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    /** TBL-1: one column's heading on one of a section's tables. Blank = the adapter's. */
    function setTableColumnLabel(blockId, tableKey, colId, label) {
      if (!P()) return errNoProject();
      if (!blockId || !tableKey || !colId) return err('A table column is required.');
      var v = String(label == null ? '' : label);
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.tables = b.tables || {};
        var byBlock = b.tables[blockId] = b.tables[blockId] || {};
        var e = byBlock[tableKey] = byBlock[tableKey] || {};
        e.columns = e.columns || {};
        if (v.trim()) e.columns[colId] = v; else delete e.columns[colId];
        pruneTables(b, blockId, tableKey);
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    /* -------------------------------------------------------------------------
     * OPT-2: what the report is MADE OF now lives in the project.
     *
     * Which sections are in, which groups of a register are in, which optional columns
     * each of them carries and which Security Relevance categories are reported were
     * session state — the same footing as "make the scripts .txt". That was wrong about
     * what they are. A report that carries Rationale but not Rollback, and reports
     * everything but the parked items, is a decision about the DOCUMENT, made once and
     * lived with; losing it on reload meant re-making it on every run, and it never
     * reached the operator on the other end of the file at all.
     *
     * Stored as DEVIATIONS from the default rather than as a full picture, which is what
     * keeps the file byte-stable (DOD-7): a project that has never opened the workspace
     * carries nothing, and one that switched a column on and off again carries nothing
     * either. The default itself is not stored, because it is not the operator's — it is
     * the column's declaration (COL-3) or the vocabulary's.
     *
     * `filename` and the `/[Tag]` values stay in the session, deliberately: they are
     * answers for THIS run, and the point of a tag is that the same design produces a
     * different document each time.
     *
     * @param {'sections'|'datasetSections'|'columns'|'relevance'} map
     * @param {string} key      section id / dataset id / relevance value
     * @param {?string} subKey  group value or column id, for the two nested maps
     * @param {boolean} on      included?
     * @param {boolean} dflt    what "not stored" means for this one
     */
    var INCLUDE_MAPS = ['sections', 'datasetSections', 'columns', 'relevance'];
    function setReportInclude(map, key, subKey, on, dflt) {
      if (!P()) return errNoProject();
      if (INCLUDE_MAPS.indexOf(map) === -1) return err('Unknown report option map "' + map + '".');
      if (!key) return err('A report option needs something to apply to.');
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        var o = b.options = b.options || {};
        var m = o[map] = o[map] || {};
        var holder = m, field = key;
        if (subKey != null) { holder = m[key] = m[key] || {}; field = subKey; }
        if (!!on === (dflt !== false)) delete holder[field]; else holder[field] = !!on;
        // Prune at every level, so switching something back leaves no fingerprint.
        if (subKey != null && !Object.keys(m[key]).length) delete m[key];
        if (!Object.keys(m).length) delete o[map];
        if (!Object.keys(o).length) delete b.options;
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    /**
     * META-1: include or exclude one row of the subject's metadata block.
     *
     * Stored in the PROJECT rather than in the session options, unlike the dataset
     * column ticks. Which provenance a report carries — hashes or no hashes — is a
     * house decision that belongs with the heading levels and the section order, and a
     * report template that did not carry it would only be half a template.
     * Included is the absent state, so the default costs nothing in the file.
     */
    function setMetaField(fieldId, on) {
      if (!P()) return errNoProject();
      if (!fieldId) return err('A field is required.');
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.meta = b.meta || {};
        if (on) delete b.meta[fieldId]; else b.meta[fieldId] = false;
        if (!Object.keys(b.meta).length) delete b.meta;
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    // ---- DS-3: custom sections and their parts -------------------------------

    /** @returns {{ok:boolean, id?:string, issues:Issue[]}} */
    function addSection(title, opts) {
      if (!P()) return errNoProject();
      opts = opts || {};
      var id = null;
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.sections = b.sections || [];
        id = nextId('sec', b.sections);
        b.sections.push({ id: id, title: String(title == null ? '' : title), parts: opts.parts ? JSON.parse(JSON.stringify(opts.parts)) : [] });
        // A new section lands at the END of the document, so it has to be named in
        // the order explicitly — an order that does not mention it would float it to
        // the end anyway, but only until something else is reordered.
        if (Array.isArray(b.order) && b.order.length && b.order.indexOf(id) === -1) b.order.push(id);
      });
      return { ok: true, id: id, issues: [] };
    }

    function updateSection(id, fields) {
      if (!P()) return errNoProject();
      var s0 = findSection(P(), id);
      if (!s0) return err('Unknown section.', id);
      App.docHost.get().commit(function (p) {
        var s = findSection(p, id);
        if (fields.title !== undefined) s.title = String(fields.title == null ? '' : fields.title);
      });
      return ok();
    }

    function removeSection(id) {
      if (!P()) return errNoProject();
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.sections = (b.sections || []).filter(function (s) { return s.id !== id; });
        if (!b.sections.length) delete b.sections;
        // Everything keyed by block id goes with the block, or a deleted section would
        // leave a name and an introduction behind for an id nothing can reach.
        ['levels', 'centred', 'names', 'headings', 'intros', 'introNumbered', 'tableStyles', 'tableWidths',
          'tables', 'pageBreak', 'noToc', 'space'].forEach(function (k) {
          if (!b[k]) return;
          delete b[k][id];
          if (!Object.keys(b[k]).length) delete b[k];
        });
        if (Array.isArray(b.order)) b.order = b.order.filter(function (x) { return x !== id; });
        if (Array.isArray(b.order) && !b.order.length) delete b.order;
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    /** A new part of the given kind, with the empty shape that kind needs. */
    function blankPart(kind, id) {
      if (kind === 'image') return { id: id, kind: 'image', layout: 'single', captions: 'one', caption: '', images: [] };
      if (kind === 'table') {
        return { id: id, kind: 'table', caption: '', centre: false, align: ['l', 'l'], header: ['Column 1', 'Column 2'], rows: [['', '']] };
      }
      if (kind === 'rule') return { id: id, kind: 'rule' };
      if (kind === 'pagebreak') return { id: id, kind: 'pagebreak' };
      // SPC-1: 10mm is about four blank lines at 11pt — visibly a gap, and small enough
      // that a part added by accident does not throw the page out.
      if (kind === 'space') return { id: id, kind: 'space', height: DEFAULT_SPACE_MM };
      return { id: id, kind: 'para', text: '', centre: false };
    }

    /** SPC-1: the gap a new Space part starts at, in millimetres. */
    var DEFAULT_SPACE_MM = 10;
    /** SPC-1: the largest gap that is a layout rather than a mistake (App.md clamps too). */
    var MAX_SPACE_MM = 500;

    /**
     * SPC-1: a millimetre figure on its way into the project.
     *
     * The editors are text boxes, so what arrives is a string — and it ends up as a
     * distance on the page. Everything that is not a number in range becomes 0, and 0
     * is stored as absence.
     * @returns {number} 0 when there is no usable measurement
     */
    function mmValue(v) {
      var n = Number(String(v == null ? '' : v).replace(/\s|mm$/gi, ''));
      if (!isFinite(n) || n <= 0) return 0;
      return Math.round(Math.min(n, MAX_SPACE_MM) * 100) / 100;
    }

    /**
     * @param {string} sectionId @param {'para'|'table'|'rule'|'pagebreak'|'space'|'image'} kind
     * @param {number} [at]  insert position; appended when omitted
     */
    function addPart(sectionId, kind, at) {
      if (!P()) return errNoProject();
      if (!findSection(P(), sectionId)) return err('Unknown section.', sectionId);
      if (['para', 'table', 'rule', 'pagebreak', 'space', 'image'].indexOf(kind) === -1) return err('Unknown part type "' + kind + '".');
      var id = null;
      App.docHost.get().commit(function (p) {
        var s = findSection(p, sectionId);
        s.parts = s.parts || [];
        id = nextId('part', allParts(p));
        var part = blankPart(kind, id);
        if (at === undefined || at === null || at < 0 || at > s.parts.length) s.parts.push(part);
        else s.parts.splice(at, 0, part);
      });
      return { ok: true, id: id, issues: [] };
    }

    function updatePart(sectionId, partId, fields) {
      if (!P()) return errNoProject();
      var s0 = findSection(P(), sectionId);
      if (!s0) return err('Unknown section.', sectionId);
      if (!(s0.parts || []).some(function (x) { return x.id === partId; })) return err('Unknown part.', partId);
      App.docHost.get().commit(function (p) {
        var part = findSection(p, sectionId).parts.filter(function (x) { return x.id === partId; })[0];
        Object.keys(fields || {}).forEach(function (k) {
          if (k === 'id' || k === 'kind') return;             // identity is not editable
          // SPC-1: the two measurements are sanitised HERE rather than at the point of
          // use, because this is where a text box's contents enter the project. Zero is
          // no measurement, so it is absence.
          if (k === 'height' || k === 'rowHeight') {
            var mm = mmValue(fields[k]);
            if (mm > 0) part[k] = mm; else delete part[k];
            return;
          }
          part[k] = fields[k];
        });
      });
      return ok();
    }

    function removePart(sectionId, partId) {
      if (!P()) return errNoProject();
      if (!findSection(P(), sectionId)) return err('Unknown section.', sectionId);
      App.docHost.get().commit(function (p) {
        var s = findSection(p, sectionId);
        s.parts = (s.parts || []).filter(function (x) { return x.id !== partId; });
      });
      return ok();
    }

    /** IMG-1: one box of an image part: an image ({ source, file, name }) or null to empty it. */
    function setPartImage(sectionId, partId, index, img) {
      if (!P()) return errNoProject();
      var s0 = findSection(P(), sectionId);
      if (!s0 || !(s0.parts || []).some(function (x) { return x.id === partId && x.kind === 'image'; })) return err('Unknown image part.', partId);
      App.docHost.get().commit(function (p) {
        var part = findSection(p, sectionId).parts.filter(function (x) { return x.id === partId; })[0];
        part.images = part.images || [];
        while (part.images.length <= index) part.images.push(null);
        part.images[index] = img ? { source: img.source === 'standard' ? 'standard' : 'report', file: String(img.file), name: String(img.name || img.file) } : null;
      });
      return ok();
    }

    /** IMG-1: an image's width (% of the text width, 5–100), its "no border" tick, or its own caption. */
    function setPartImageField(sectionId, partId, index, field, value) {
      if (!P()) return errNoProject();
      if (['width', 'noBorder', 'caption'].indexOf(field) === -1) return err('Unknown image setting "' + field + '".');
      var s0 = findSection(P(), sectionId);
      var p0 = s0 && (s0.parts || []).filter(function (x) { return x.id === partId; })[0];
      if (!p0 || !(p0.images || [])[index]) return err('There is no image there.', partId);
      App.docHost.get().commit(function (p) {
        var im = findSection(p, sectionId).parts.filter(function (x) { return x.id === partId; })[0].images[index];
        if (field === 'width') {
          var n = Math.round(Number(value));
          if (!isFinite(n) || n >= 100) delete im.width; else im.width = Math.max(5, n);
        } else if (field === 'noBorder') {
          if (value) im.noBorder = true; else delete im.noBorder;
        } else {
          var c = String(value == null ? '' : value);
          if (c.trim()) im.caption = c; else delete im.caption;
        }
      });
      return ok();
    }

    /** IMG-2: Standard Images — images any report can use, by reference. */
    function addStandardImage(name, file) {
      if (!P()) return errNoProject();
      if (!String(name || '').trim()) return err('A standard image needs a name.');
      var id = null;
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.standardImages = b.standardImages || [];
        id = nextId('img', b.standardImages);
        b.standardImages.push({ id: id, name: String(name).trim(), file: String(file) });
      });
      return { ok: true, id: id, issues: [] };
    }
    function renameStandardImage(id, name) {
      if (!P()) return errNoProject();
      if (!String(name || '').trim()) return err('A standard image needs a name.');
      App.docHost.get().commit(function (p) {
        (bag(p).standardImages || []).forEach(function (s) { if (s.id === id) s.name = String(name).trim(); });
      });
      return ok();
    }
    function removeStandardImage(id) {
      if (!P()) return errNoProject();
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.standardImages = (b.standardImages || []).filter(function (s) { return s.id !== id; });
      });
      return ok();
    }
    /** How many image boxes, in sections and section templates, show this standard image. */
    function standardImageUses(file) {
      var n = 0;
      if (!P()) return 0;
      allParts(P()).forEach(function (part) {
        if (part && part.kind === 'image') (part.images || []).forEach(function (im) { if (im && im.source === 'standard' && im.file === file) n++; });
      });
      return n;
    }

    /**
     * Reorder parts within a section: by one step, or before a named part (drag).
     * @param {number} delta  -1 / +1, ignored when beforeId is given
     */
    function movePart(sectionId, partId, delta, beforeId) {
      if (!P()) return errNoProject();
      var s0 = findSection(P(), sectionId);
      if (!s0) return err('Unknown section.', sectionId);
      App.docHost.get().commit(function (p) {
        var s = findSection(p, sectionId), parts = s.parts || [];
        var from = parts.map(function (x) { return x.id; }).indexOf(partId);
        if (from === -1) return;
        var moved = parts.splice(from, 1)[0], to;
        if (beforeId != null) {
          var at = parts.map(function (x) { return x.id; }).indexOf(beforeId);
          to = at === -1 ? parts.length : at;
        } else {
          to = from + delta;
          if (to < 0) to = 0;
          if (to > parts.length) to = parts.length;
        }
        parts.splice(to, 0, moved);
      });
      return ok();
    }

    // ---- DS-4: table editing -------------------------------------------------

    /** Read a part out of the live project (helper for the table ops below). */
    function part(p, sectionId, partId) {
      var s = findSection(p, sectionId);
      return s ? (s.parts || []).filter(function (x) { return x.id === partId; })[0] : null;
    }

    /** Set one cell. `row === -1` addresses the header. */
    function setCell(sectionId, partId, row, col, value) {
      if (!P()) return errNoProject();
      var t0 = part(P(), sectionId, partId);
      if (!t0 || t0.kind !== 'table') return err('Unknown table.', partId);
      App.docHost.get().commit(function (p) {
        var t = part(p, sectionId, partId);
        var v = String(value == null ? '' : value);
        if (row === -1) { t.header[col] = v; return; }
        while (t.rows.length <= row) t.rows.push(t.header.map(function () { return ''; }));
        while (t.rows[row].length < t.header.length) t.rows[row].push('');
        t.rows[row][col] = v;
      });
      return ok();
    }

    function addRow(sectionId, partId, at) {
      if (!P()) return errNoProject();
      var t0 = part(P(), sectionId, partId);
      if (!t0 || t0.kind !== 'table') return err('Unknown table.', partId);
      App.docHost.get().commit(function (p) {
        var t = part(p, sectionId, partId);
        var blank = t.header.map(function () { return ''; });
        var i = (at === undefined || at === null || at < 0 || at > t.rows.length) ? t.rows.length : at;
        t.rows.splice(i, 0, blank);
        // SPC-1: the tick list travels WITH the rows, for the same reason the widths
        // travel with the columns — a list that is not one-per-row is meaningless, and
        // the schema rejects it. A new row is tall, because a table that asked for the
        // height asked for it as its shape.
        if (Array.isArray(t.tallRows)) t.tallRows.splice(i, 0, true);
      });
      return ok();
    }
    function removeRow(sectionId, partId, at) {
      if (!P()) return errNoProject();
      App.docHost.get().commit(function (p) {
        var t = part(p, sectionId, partId);
        if (t && t.rows && at >= 0 && at < t.rows.length) {
          t.rows.splice(at, 1);
          if (Array.isArray(t.tallRows)) t.tallRows.splice(at, 1);   // SPC-1
        }
      });
      return ok();
    }

    /**
     * SPC-1: whether ONE row takes the table's extra height.
     *
     * Stored as the deviation: no list at all means every row, which is what a height on
     * its own has always meant and what a project written before the ticks says. The list
     * appears the moment a row is unticked and disappears again when they are all back
     * on, so a table fiddled with and put back serialises as one that never was (DOD-7).
     */
    function setRowTall(sectionId, partId, at, on) {
      if (!P()) return errNoProject();
      var t0 = part(P(), sectionId, partId);
      if (!t0 || t0.kind !== 'table') return err('Unknown table.', partId);
      if (!(at >= 0 && at < (t0.rows || []).length)) return err('Unknown row.', String(at));
      App.docHost.get().commit(function (p) {
        var t = part(p, sectionId, partId);
        var list = (Array.isArray(t.tallRows) && t.tallRows.length === t.rows.length)
          ? t.tallRows.map(function (v) { return v !== false; })
          : t.rows.map(function () { return true; });
        list[at] = !!on;
        if (list.every(Boolean)) delete t.tallRows; else t.tallRows = list;
      });
      return ok();
    }

    /** SPC-1: does this row take the extra height? Absent list ⇒ yes, as for every row. */
    function rowTall(table, at) {
      if (!table || !Array.isArray(table.tallRows) || table.tallRows.length !== (table.rows || []).length) return true;
      return table.tallRows[at] !== false;
    }
    /* TW-1: widths travel WITH the columns.
     *
     * A widths array that is not exactly one-per-column is meaningless, and the schema
     * rejects it — so adding or removing a column has to keep the array in step in the
     * same commit, exactly as `align` already does. On removal the freed share is given
     * back to the survivors in proportion, which is the only redistribution that leaves
     * a table looking like the one the author laid out. A table that never had widths
     * stays without them: auto is a real state, not a missing one. */

    /* TW-1/TW-3: a width is a share OF THE PAGE, and the shares need not fill it.
     *
     * Three columns at 20% each is a table 60% of the text width, not three equal
     * columns stretched across it. So the total is meaningful in its own right, and the
     * two ways of setting a width differ in exactly what they do to it:
     *
     *   DRAG moves a boundary. The columns either side share a fixed total, so one
     *   growing means the others giving way — the table stays the width it was, which
     *   is the only thing a boundary you moved with a mouse can mean.
     *
     *   TYPING sets one column outright and leaves the others alone, so it is what
     *   changes the total: three columns typed to 20% make the table narrower, and a
     *   60% beside a 50% asks for more page than there is and is flagged in red.
     *
     * A column is never below MIN_WIDTH: at zero it is not a column, and there is no
     * edge left to drag it back by.
     */
    var MIN_WIDTH = 0.05;

    /** Rescale so the array sums to 1. `[]` in, `[]` out. */
    function renormalise(ws) {
      var sum = ws.reduce(function (a, w) { return a + (w > 0 ? w : 0); }, 0);
      if (!ws.length) return ws;
      if (sum <= 0) return ws.map(function () { return 1 / ws.length; });
      return ws.map(function (w) { return (w > 0 ? w : 0) / sum; });
    }

    /** An even set, the starting point for a table that has no widths yet. */
    function evenWidths(n) {
      var out = [];
      for (var i = 0; i < n; i++) out.push(1 / n);
      return out;
    }

    /**
     * The new width array after setting column `col`.
     * @param {number[]} cur  the current widths (already one-per-column)
     * @param {number} col @param {number} f  the wanted share
     * @param {boolean} exact  true = typed (others untouched); false = dragged
     */
    function applyWidth(cur, col, f, exact) {
      var n = cur.length;
      if (exact) {
        var out = cur.slice();
        // A typed value is capped at the whole table: "120%" is not a share of anything.
        out[col] = Math.max(MIN_WIDTH, Math.min(1, f));
        return out;
      }
      // `f` is a share of the PAGE, because that is what both editors are drawn at —
      // which is what lets the strip show a 60% table as filling 60% of its width and
      // still have the drag land where the pointer did.
      var total = cur.reduce(function (a, w) { return a + w; }, 0) || 1;
      var most = Math.max(MIN_WIDTH, total - MIN_WIDTH * (n - 1));
      var want = Math.max(MIN_WIDTH, Math.min(most, f));
      var others = total - cur[col];
      var room = total - want;
      return cur.map(function (w, i) {
        if (i === col) return want;
        // Nothing left over anywhere: an even split of what remains, rather than a
        // division by zero writing NaN into the project.
        var share = others > 0 ? (w / others) * room : room / (n - 1);
        return Math.max(Math.min(MIN_WIDTH, room / (n - 1)), share);
      });
    }

    function addColumn(sectionId, partId) {
      if (!P()) return errNoProject();
      var t0 = part(P(), sectionId, partId);
      if (!t0 || t0.kind !== 'table') return err('Unknown table.', partId);
      App.docHost.get().commit(function (p) {
        var t = part(p, sectionId, partId);
        var n = t.header.length;
        t.header.push('Column ' + (n + 1));
        t.align.push('l');
        t.rows.forEach(function (r) { r.push(''); });
        if (Array.isArray(t.widths) && t.widths.length === n) {
          // The newcomer takes an equal share of the widened table, and the others are
          // squeezed in proportion — nobody's relative width changes.
          var share = 1 / (n + 1), keep = 1 - share;
          t.widths = renormalise(t.widths).map(function (w) { return w * keep; }).concat([share]);
        }
      });
      return ok();
    }
    function removeColumn(sectionId, partId, at) {
      if (!P()) return errNoProject();
      App.docHost.get().commit(function (p) {
        var t = part(p, sectionId, partId);
        // A table with no columns cannot render, so the last one is not removable.
        if (!t || !t.header || t.header.length <= 1 || at < 0 || at >= t.header.length) return;
        var had = Array.isArray(t.widths) && t.widths.length === t.header.length;
        t.header.splice(at, 1);
        t.align.splice(at, 1);
        t.rows.forEach(function (r) { r.splice(at, 1); });
        if (had) { t.widths.splice(at, 1); t.widths = renormalise(t.widths); }
      });
      return ok();
    }

    /**
     * TW-1: set one column's width on a HAND-AUTHORED table.
     * @param {string} sectionId @param {string} partId @param {number} col
     * @param {number} fraction  a share of the table, 0 < f <= 1
     * @param {boolean} [exact]  true when typed rather than dragged (see applyWidth)
     */
    function setWidth(sectionId, partId, col, fraction, exact) {
      if (!P()) return errNoProject();
      var t0 = part(P(), sectionId, partId);
      if (!t0 || t0.kind !== 'table') return err('Unknown table.', partId);
      var n = (t0.header || []).length;
      if (n < 2) return err('A one-column table has no width to set.', partId);
      if (!(col >= 0 && col < n)) return err('No such column.', partId);
      var f = Number(fraction);
      if (!isFinite(f)) return err('A column width must be a number.', partId);
      App.docHost.get().commit(function (p) {
        var t = part(p, sectionId, partId);
        var cur = (Array.isArray(t.widths) && t.widths.length === n) ? t.widths.slice() : evenWidths(n);
        t.widths = applyWidth(cur, col, f, exact === true);
      });
      return ok();
    }

    /** TW-1: hand a table back to automatic column widths. */
    function clearWidths(sectionId, partId) {
      if (!P()) return errNoProject();
      var t0 = part(P(), sectionId, partId);
      if (!t0 || t0.kind !== 'table') return err('Unknown table.', partId);
      App.docHost.get().commit(function (p) {
        var t = part(p, sectionId, partId);
        delete t.widths;
      });
      return ok();
    }

    /**
     * TW-2: the same, for a GENERATED section's table.
     *
     * Keyed by block id rather than by part, because a generated section has no parts —
     * and because a register split into groups produces several tables of the same
     * columns, which should all be the width the operator set once.
     *
     * The column COUNT has to be passed in: it depends on the platform's adapter and on
     * which optional columns are switched on, neither of which this module knows. A
     * stored set whose length no longer matches is simply replaced, which is the right
     * answer — widths for four columns mean nothing to a table that now has three.
     *
     * @param {string} blockId @param {number} count  columns the table has now
     * @param {number} col @param {number} fraction @param {boolean} [exact]
     */
    function setBlockWidth(blockId, count, col, fraction, exact) {
      if (!P()) return errNoProject();
      if (!blockId) return err('A section is required.');
      var n = Number(count) | 0;
      if (n < 2) return err('A one-column table has no width to set.', blockId);
      if (!(col >= 0 && col < n)) return err('No such column.', blockId);
      var f = Number(fraction);
      if (!isFinite(f)) return err('A column width must be a number.', blockId);
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.tableWidths = b.tableWidths || {};
        var stored = b.tableWidths[blockId];
        var cur = (Array.isArray(stored) && stored.length === n) ? stored.slice() : evenWidths(n);
        b.tableWidths[blockId] = applyWidth(cur, col, f, exact === true);
      });
      return ok();
    }

    /** TW-2: hand a generated section's table back to automatic widths. */
    function clearBlockWidths(blockId) {
      if (!P()) return errNoProject();
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        if (!b.tableWidths) return;
        delete b.tableWidths[blockId];
        if (!Object.keys(b.tableWidths).length) delete b.tableWidths;
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    /**
     * TW-1/TW-2: what a set of widths adds up to, and whether that is a problem.
     * One place, so the two editors cannot disagree about when to show the red flag.
     * @returns {{total:number, over:boolean, under:boolean, ok:boolean}} total as a percentage
     */
    function widthTotal(ws) {
      var sum = (ws || []).reduce(function (a, w) { return a + (Number(w) > 0 ? Number(w) : 0); }, 0);
      var pct = Math.round(sum * 1000) / 10;
      // Half a percent of slack: the widths come from dividing pixels by pixels, and
      // flagging 99.9% would make the warning meaningless.
      return { total: pct, over: pct > 100.5, under: pct < 99.5, ok: pct >= 99.5 && pct <= 100.5 };
    }

    /** Column alignment: 'l' | 'c' | 'r'. */
    function setAlign(sectionId, partId, col, value) {
      if (!P()) return errNoProject();
      if (['l', 'c', 'r'].indexOf(value) === -1) return err('Alignment must be l, c or r.');
      App.docHost.get().commit(function (p) {
        var t = part(p, sectionId, partId);
        if (t && t.align) t.align[col] = value;
      });
      return ok();
    }

    // ---- DS-5: formatting profiles -------------------------------------------

    function addFormat(name, from) {
      if (!P()) return errNoProject();
      if (!String(name || '').trim()) return err('A formatting profile needs a name.');
      var id = null;
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.formats = b.formats || [];
        id = nextId('fmt', b.formats);
        var base = App.docFormat.normalise(from || App.docFormat.standard());
        delete base.builtin;                        // a copy of the built-in is not the built-in
        base.id = id;
        base.name = String(name).trim();
        b.formats.push(base);
      });
      return { ok: true, id: id, issues: [] };
    }

    /** Patch a saved profile. The built-in is not editable — the UI duplicates it
     *  first — so an attempt to write to it is refused rather than silently ignored. */
    function updateFormat(id, patch) {
      if (!P()) return errNoProject();
      if (id === 'standard') return err('The Standard profile cannot be edited. Duplicate it first.');
      var found = ((P().report && P().report.formats) || []).some(function (f) { return f.id === id; });
      if (!found) return err('Unknown formatting profile.', id);
      App.docHost.get().commit(function (p) {
        var f = p.report.formats.filter(function (x) { return x.id === id; })[0];
        var merged = App.docFormat.normalise(Object.assign({}, f, patch || {}));
        delete merged.builtin;
        merged.id = id;
        p.report.formats = p.report.formats.map(function (x) { return x.id === id ? merged : x; });
      });
      return ok();
    }

    function removeFormat(id) {
      if (!P()) return errNoProject();
      if (id === 'standard') return err('The Standard profile cannot be removed.');
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.formats = (b.formats || []).filter(function (f) { return f.id !== id; });
        if (!b.formats.length) delete b.formats;
        // Deleting the profile in use falls back to the built-in rather than leaving
        // the project pointing at nothing.
        if (b.formatId === id) delete b.formatId;
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    function setFormatId(id) {
      if (!P()) return errNoProject();
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        if (!id || id === 'standard') delete b.formatId; else b.formatId = String(id);
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    // ---- DS-6: section templates and report templates -------------------------

    /**
     * Save a section's shape (its title and every part) as a reusable template.
     * Part ids are re-minted when the template is USED, not when it is saved, so two
     * sections created from one template never share a table id — which would make a
     * cross-reference ambiguous.
     */
    function saveSectionTemplate(sectionId, name) {
      if (!P()) return errNoProject();
      var s = findSection(P(), sectionId);
      if (!s) return err('Unknown section.', sectionId);
      if (!String(name || '').trim()) return err('A section template needs a name.');
      var id = null;
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.sectionTemplates = b.sectionTemplates || [];
        id = nextId('tpl', b.sectionTemplates);
        var src = findSection(p, sectionId);
        b.sectionTemplates.push({
          id: id, name: String(name).trim(),
          title: src.title || '',
          parts: JSON.parse(JSON.stringify(src.parts || []))
        });
      });
      return { ok: true, id: id, issues: [] };
    }

    function removeSectionTemplate(id) {
      if (!P()) return errNoProject();
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.sectionTemplates = (b.sectionTemplates || []).filter(function (t) { return t.id !== id; });
        if (!b.sectionTemplates.length) delete b.sectionTemplates;
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    /** Create a new section from a template, with fresh part ids. */
    function useSectionTemplate(templateId) {
      if (!P()) return errNoProject();
      var t = ((P().report && P().report.sectionTemplates) || []).filter(function (x) { return x.id === templateId; })[0];
      if (!t) return err('Unknown section template.', templateId);
      var id = null;
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.sections = b.sections || [];
        id = nextId('sec', b.sections);
        var used = allParts(p), parts = [];
        (t.parts || []).forEach(function (src) {
          var copy = JSON.parse(JSON.stringify(src));
          copy.id = nextId('part', used);
          used.push(copy);
          parts.push(copy);
        });
        b.sections.push({ id: id, title: t.title || '', parts: parts });
        if (Array.isArray(b.order) && b.order.length && b.order.indexOf(id) === -1) b.order.push(id);
      });
      return { ok: true, id: id, issues: [] };
    }

    /**
     * A whole report template: the arrangement, the levels, every custom section and
     * the formatting profile in force — everything the designer decides, in one
     * named thing that can be applied to another project.
     */
    function saveReportTemplate(name) {
      if (!P()) return errNoProject();
      if (!String(name || '').trim()) return err('A report template needs a name.');
      var id = null;
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.reportTemplates = b.reportTemplates || [];
        id = nextId('rpt', b.reportTemplates);
        b.reportTemplates.push({
          id: id, name: String(name).trim(),
          order: (b.order || []).slice(),
          levels: JSON.parse(JSON.stringify(b.levels || {})),
          centred: JSON.parse(JSON.stringify(b.centred || {})),
          meta: JSON.parse(JSON.stringify(b.meta || {})),
          // NAM-1/SEC-1/TBS-1 are part of the DESIGN, so a template that left them
          // behind would only be half the arrangement it claims to save.
          names: JSON.parse(JSON.stringify(b.names || {})),
          headings: JSON.parse(JSON.stringify(b.headings || {})),
          intros: JSON.parse(JSON.stringify(b.intros || {})),
          introNumbered: JSON.parse(JSON.stringify(b.introNumbered || {})),
          tableStyles: JSON.parse(JSON.stringify(b.tableStyles || {})),
          tableWidths: JSON.parse(JSON.stringify(b.tableWidths || {})),
          // TBL-1/SEC-4: the wording of each generated table, which sections start a
          // page, and which are kept out of the contents list — all design decisions.
          tables: JSON.parse(JSON.stringify(b.tables || {})),
          pageBreak: JSON.parse(JSON.stringify(b.pageBreak || {})),
          noToc: JSON.parse(JSON.stringify(b.noToc || {})),
          // SPC-1: how far down the page each section starts is an arrangement decision
          // like the page break beside it, so it travels with the template too.
          space: JSON.parse(JSON.stringify(b.space || {})),
          sections: JSON.parse(JSON.stringify(b.sections || [])),
          format: JSON.parse(JSON.stringify(App.docFormat.resolve(p)))
        });
      });
      return { ok: true, id: id, issues: [] };
    }

    function removeReportTemplate(id) {
      if (!P()) return errNoProject();
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.reportTemplates = (b.reportTemplates || []).filter(function (t) { return t.id !== id; });
        if (!b.reportTemplates.length) delete b.reportTemplates;
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    /**
     * Apply a report template: REPLACES the arrangement, the levels and the custom
     * sections wholesale, and installs its formatting profile as a saved profile.
     * Destructive by design — "apply this template" means "make the document look
     * like that" — so the UI confirms first and the whole thing is one undo step.
     */
    function useReportTemplate(id) {
      if (!P()) return errNoProject();
      var t = ((P().report && P().report.reportTemplates) || []).filter(function (x) { return x.id === id; })[0];
      if (!t) return err('Unknown report template.', id);
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.order = (t.order || []).slice();
        b.levels = JSON.parse(JSON.stringify(t.levels || {}));
        b.centred = JSON.parse(JSON.stringify(t.centred || {}));
        b.meta = JSON.parse(JSON.stringify(t.meta || {}));
        b.names = JSON.parse(JSON.stringify(t.names || {}));
        b.headings = JSON.parse(JSON.stringify(t.headings || {}));
        b.intros = JSON.parse(JSON.stringify(t.intros || {}));
        b.introNumbered = JSON.parse(JSON.stringify(t.introNumbered || {}));
        b.tableStyles = JSON.parse(JSON.stringify(t.tableStyles || {}));
        b.tableWidths = JSON.parse(JSON.stringify(t.tableWidths || {}));
        b.tables = JSON.parse(JSON.stringify(t.tables || {}));
        b.pageBreak = JSON.parse(JSON.stringify(t.pageBreak || {}));
        b.noToc = JSON.parse(JSON.stringify(t.noToc || {}));
        b.space = JSON.parse(JSON.stringify(t.space || {}));
        b.sections = JSON.parse(JSON.stringify(t.sections || []));
        if (!b.order.length) delete b.order;
        if (!b.sections.length) delete b.sections;
        ['levels', 'centred', 'meta', 'names', 'headings', 'intros', 'introNumbered', 'tableStyles', 'tableWidths',
          'tables', 'pageBreak', 'noToc', 'space'].forEach(function (k) {
          if (!Object.keys(b[k]).length) delete b[k];
        });
        if (t.format) {
          var f = App.docFormat.normalise(t.format);
          delete f.builtin;
          if (f.id === 'standard') { f.id = nextId('fmt', b.formats || []); f.name = t.name + ' formatting'; }
          b.formats = (b.formats || []).filter(function (x) { return x.id !== f.id; }).concat([f]);
          b.formatId = f.id;
        }
      });
      return ok();
    }

    App.docStore = {
      nextId: nextId, blankPart: blankPart,
      // RPT-3: the section order. It lived on App.store, which meant the module
      // reached into the host to reorder its own document.
      setReportOrder: setReportOrder,
      setBlockLevel: setBlockLevel, setBlockCentre: setBlockCentre, setBlockCentrePart: setBlockCentrePart, setMetaField: setMetaField,
      // SEC-4: per-section placement — centring, a page of its own, out of the contents.
      setBlockFlag: setBlockFlag,
      // SPC-1: …and how far down the page its heading starts.
      setBlockSpace: setBlockSpace, mmValue: mmValue,
      DEFAULT_SPACE_MM: DEFAULT_SPACE_MM, MAX_SPACE_MM: MAX_SPACE_MM,
      // CLS-1: the classification banner, which is a document decision, not a per-run one.
      setClassification: setClassification,
      // NAM-1 / SEC-1 / TBS-1: a section's name, its introduction, its table styling.
      setBlockName: setBlockName, setBlockHeading: setBlockHeading, setBlockIntro: setBlockIntro,
      setBlockIntroNumbered: setBlockIntroNumbered,
      // TBL-1: a generated table's own title row, caption and column headings.
      setTableText: setTableText, setTableColumnLabel: setTableColumnLabel, ONE_TABLE: '_all',
      setTableNoCaption: setTableNoCaption,
      // OPT-2: what the report is made of, stored with the report rather than the session.
      setReportInclude: setReportInclude, INCLUDE_MAPS: INCLUDE_MAPS,
      addSection: addSection, updateSection: updateSection, removeSection: removeSection,
      addPart: addPart, updatePart: updatePart, removePart: removePart, movePart: movePart,
      setPartImage: setPartImage, setPartImageField: setPartImageField, addStandardImage: addStandardImage, renameStandardImage: renameStandardImage, removeStandardImage: removeStandardImage, standardImageUses: standardImageUses,
      setCell: setCell, addRow: addRow, removeRow: removeRow,
      // SPC-1: which rows take the table's extra height.
      setRowTall: setRowTall, rowTall: rowTall,
      addColumn: addColumn, removeColumn: removeColumn, setAlign: setAlign,
      // TW-1/TW-2: per-column widths, dragged or typed, on authored and generated tables.
      setWidth: setWidth, clearWidths: clearWidths, renormalise: renormalise,
      setBlockWidth: setBlockWidth, clearBlockWidths: clearBlockWidths,
      applyWidth: applyWidth, evenWidths: evenWidths, widthTotal: widthTotal, MIN_WIDTH: MIN_WIDTH,
      addFormat: addFormat, updateFormat: updateFormat, removeFormat: removeFormat, setFormatId: setFormatId,
      saveSectionTemplate: saveSectionTemplate, removeSectionTemplate: removeSectionTemplate,
      useSectionTemplate: useSectionTemplate,
      saveReportTemplate: saveReportTemplate, removeReportTemplate: removeReportTemplate,
      useReportTemplate: useReportTemplate
    };
  })(App);

  /* =============================================================================
   * MODULE: App.docTemplates  — TPL-1..TPL-4: templates in and out, on their own
   * PURPOSE: Export and import section templates, formatting profiles and whole
   *          report templates as standalone files, independently of the project.
   *          Owns the merge rule: an import ADDS, never replaces wholesale, and
   *          every collision is a decision the operator makes (TPL-3).
   * PURITY:  parse/validate/plan are pure; apply() writes through App.docStore.
   * DEPENDS: App.docHost (getState/clock), App.docFormat, App.docStore, App.util.stable
   * INVARIANTS: importing never removes something the project already had. The worst
   *             an import can do to existing work is overwrite an entry the operator
   *             explicitly chose to replace.
   * ============================================================================= */
  (function (App) {
    'use strict';

    /* -------------------------------------------------------------------------
     * TPL-3: what counts as a conflict, and why it is the NAME.
     *
     * Ids are minted per project (docStore.nextId), so two projects that each added
     * three section templates both hold tpl1..tpl3 describing entirely different
     * things. Matching on id would therefore report collisions that are not real and
     * miss the one that is: two templates the operator would both call "Annex A".
     *
     * So conflicts are detected on the trimmed, case-folded NAME — the thing the
     * operator actually recognises — and ids are re-minted on the way in whenever
     * they would collide. Choosing "replace" keeps the EXISTING id and overwrites its
     * contents, because a formatting profile's id is what `report.formatId` points
     * at: replacing a profile must not silently switch the document back to Standard.
     * ---------------------------------------------------------------------- */

    var KINDS = {
      sections: {
        kind: 'ch-config-tool/section-templates',
        label: 'Section templates',
        file: 'section-templates',
        bag: 'sectionTemplates'
      },
      formats: {
        kind: 'ch-config-tool/formatting-profiles',
        label: 'Formatting profiles',
        file: 'formatting-profiles',
        bag: 'formats'
      },
      reports: {
        kind: 'ch-config-tool/report-templates',
        label: 'Report templates',
        file: 'report-templates',
        bag: 'reportTemplates'
      }
    };

    var FORMAT_VERSION = 1;

    function issue(sev, message, location) {
      return { category: 'validation', severity: sev, message: message, location: location };
    }
    function norm(name) { return String(name == null ? '' : name).trim().toLowerCase(); }
    function held(project, kindKey) {
      return ((project && project.report && project.report[KINDS[kindKey].bag]) || []).slice();
    }

    // ---- TPL-1: export -------------------------------------------------------

    /**
     * @param {Project} project @param {'sections'|'formats'|'reports'} kindKey
     * @param {string[]} [ids]  a subset; every entry when omitted
     * @returns {{name:string, text:string, count:number}}
     */
    function exportFile(project, kindKey, ids) {
      var K = KINDS[kindKey];
      var all = held(project, kindKey);
      var items = ids && ids.length ? all.filter(function (x) { return ids.indexOf(x.id) !== -1; }) : all;
      var payload = {
        kind: K.kind,
        version: FORMAT_VERSION,
        exportedUtc: App.docHost.get().clock.nowIso(),
        items: JSON.parse(JSON.stringify(items))
      };
      return {
        // stableStringify so two exports of the same templates are byte-identical
        // and can be diffed or checked into a repo (DOD-7's spirit, applied here).
        text: App.util.stable.stableStringify(payload),
        name: K.file + '.json',
        count: items.length
      };
    }

    // ---- TPL-2: parse + validate ---------------------------------------------

    function validParts(parts, loc, issues) {
      if (parts === undefined) return true;
      if (!Array.isArray(parts)) { issues.push(issue('error', 'parts must be an array.', loc)); return false; }
      var ok = true;
      parts.forEach(function (p, i) {
        var l = loc + '.parts[' + i + ']';
        if (!p || typeof p !== 'object') { issues.push(issue('error', 'A part must be an object.', l)); ok = false; return; }
        if (['para', 'table', 'rule', 'pagebreak', 'space', 'image'].indexOf(p.kind) === -1) {
          issues.push(issue('error', 'Unknown part kind "' + p.kind + '".', l)); ok = false; return;
        }
        if (p.kind === 'para' && p.text !== undefined && typeof p.text !== 'string') {
          issues.push(issue('error', 'A paragraph\'s text must be a string.', l)); ok = false;
        }
        if (p.kind === 'image' && p.images !== undefined && !Array.isArray(p.images)) {
          issues.push(issue('error', 'An image part\'s images must be an array.', l)); ok = false;
        }
        if (p.kind === 'table') {
          if (!Array.isArray(p.header) || !p.header.length) { issues.push(issue('error', 'A table needs a header row.', l)); ok = false; }
          if (p.rows !== undefined && !Array.isArray(p.rows)) { issues.push(issue('error', 'A table\'s rows must be an array.', l)); ok = false; }
        }
      });
      return ok;
    }

    /** Per-kind structural check. Returns the cleaned item, or null when unusable. */
    function validItem(kindKey, raw, loc, issues) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { issues.push(issue('error', 'Each entry must be an object.', loc)); return null; }
      if (!raw.name || typeof raw.name !== 'string') { issues.push(issue('error', 'Each entry needs a name.', loc)); return null; }
      if (kindKey === 'formats') {
        var v = App.docFormat.validate(Object.assign({ id: raw.id || 'imported' }, raw), loc);
        v.issues.forEach(function (i) { issues.push(i); });
        return v.ok ? v.profile : null;
      }
      if (kindKey === 'sections') {
        if (!validParts(raw.parts, loc, issues)) return null;
        return { id: String(raw.id || ''), name: String(raw.name), title: String(raw.title || ''), parts: raw.parts || [] };
      }
      // reports
      if (raw.order !== undefined && !Array.isArray(raw.order)) { issues.push(issue('error', 'order must be an array.', loc)); return null; }
      if (raw.sections !== undefined && !Array.isArray(raw.sections)) { issues.push(issue('error', 'sections must be an array.', loc)); return null; }
      var sectionsOk = true;
      (raw.sections || []).forEach(function (s, i) {
        if (!s || typeof s !== 'object') { issues.push(issue('error', 'A section must be an object.', loc + '.sections[' + i + ']')); sectionsOk = false; return; }
        if (!validParts(s.parts, loc + '.sections[' + i + ']', issues)) sectionsOk = false;
      });
      if (!sectionsOk) return null;
      var out = {
        id: String(raw.id || ''), name: String(raw.name),
        order: (raw.order || []).map(String),
        levels: (raw.levels && typeof raw.levels === 'object') ? raw.levels : {},
        sections: raw.sections || []
      };
      if (raw.format) {
        var fv = App.docFormat.validate(Object.assign({ id: 'standard', name: raw.name }, raw.format), loc + '.format');
        if (fv.ok) out.format = fv.profile; else fv.issues.forEach(function (i) { issues.push(i); });
      }
      return out;
    }

    /**
     * Parse an exported file.
     * @param {string} text @param {'sections'|'formats'|'reports'} [expectKind]
     * @returns {{ok:boolean, kindKey:?string, items:Object[], issues:Issue[]}}
     */
    function parseImport(text, expectKind) {
      var issues = [], data;
      try { data = JSON.parse(String(text || '')); }
      catch (e) { return { ok: false, kindKey: null, items: [], issues: [issue('error', 'Not valid JSON: ' + (e && e.message), 'file')] }; }
      if (!data || typeof data !== 'object') return { ok: false, kindKey: null, items: [], issues: [issue('error', 'The file must contain an object.', 'file')] };

      var kindKey = Object.keys(KINDS).filter(function (k) { return KINDS[k].kind === data.kind; })[0] || null;
      if (!kindKey) {
        return { ok: false, kindKey: null, items: [], issues: [issue('error', 'Unrecognised file — "kind" is "' + data.kind + '". Expected one of: ' +
          Object.keys(KINDS).map(function (k) { return KINDS[k].kind; }).join(', ') + '.', 'kind')] };
      }
      if (expectKind && kindKey !== expectKind) {
        return { ok: false, kindKey: kindKey, items: [], issues: [issue('error', 'This is a ' + KINDS[kindKey].label.toLowerCase() +
          ' file. Import it from the ' + KINDS[kindKey].label + ' list instead.', 'kind')] };
      }
      if (!Array.isArray(data.items)) return { ok: false, kindKey: kindKey, items: [], issues: [issue('error', 'The file has no "items" array.', 'items')] };

      var items = [];
      data.items.forEach(function (raw, i) {
        var cleaned = validItem(kindKey, raw, 'items[' + i + ']', issues);
        if (cleaned) items.push(cleaned);
      });
      // A file with SOME usable entries still imports — the unusable ones are reported
      // rather than silently dropped, and the rest are not held hostage to them.
      return { ok: items.length > 0, kindKey: kindKey, items: items, issues: issues };
    }

    // ---- TPL-3: plan the merge -----------------------------------------------

    /**
     * Work out what an import would do, without doing it.
     * @returns {{kindKey:string, additions:Object[],
     *            conflicts:Array<{incoming:Object, existingId:string, existingName:string}>}}
     */
    function plan(project, kindKey, items) {
      var existing = held(project, kindKey);
      var byName = {};
      existing.forEach(function (x) { byName[norm(x.name)] = x; });
      var additions = [], conflicts = [];
      items.forEach(function (inc) {
        var hit = byName[norm(inc.name)];
        if (hit) conflicts.push({ incoming: inc, existingId: hit.id, existingName: hit.name });
        else additions.push(inc);
      });
      return { kindKey: kindKey, additions: additions, conflicts: conflicts };
    }

    /**
     * TPL-4: carry out a planned import.
     *
     * @param {{kindKey:string, additions:Object[], conflicts:Array}} pl
     * @param {Object<string,'replace'|'keep'>} decisions  keyed by the incoming NAME
     *        (normalised). A conflict with no decision defaults to 'keep' — silence
     *        must never overwrite the operator's own work.
     * @returns {{ok:boolean, added:number, replaced:number, kept:number, issues:Issue[]}}
     */
    function apply(pl, decisions) {
      if (!App.docHost.get().getState()) return { ok: false, added: 0, replaced: 0, kept: 0, issues: [issue('error', 'No project loaded.', 'project')] };
      decisions = decisions || {};
      var K = KINDS[pl.kindKey], bagName = K.bag;
      var added = 0, replaced = 0, kept = 0;

      App.docHost.get().commit(function (p) {
        p.report = p.report || {};
        var list = p.report[bagName] = (p.report[bagName] || []);

        function freshId(prefix) {
          var id = App.docStore.nextId(prefix, list);
          list.push({ id: id });                 // reserve, so a batch cannot collide
          list.pop();
          return id;
        }
        var prefix = pl.kindKey === 'formats' ? 'fmt' : pl.kindKey === 'sections' ? 'tpl' : 'rpt';

        pl.additions.forEach(function (inc) {
          var copy = JSON.parse(JSON.stringify(inc));
          var clash = list.some(function (x) { return x.id === copy.id; });
          if (!copy.id || clash) copy.id = freshId(prefix);
          list.push(copy);
          added++;
        });

        pl.conflicts.forEach(function (c) {
          if (decisions[norm(c.incoming.name)] !== 'replace') { kept++; return; }
          var copy = JSON.parse(JSON.stringify(c.incoming));
          // The EXISTING id is kept: report.formatId (and anything else pointing at
          // this entry) must survive a replacement.
          copy.id = c.existingId;
          var i = list.map(function (x) { return x.id; }).indexOf(c.existingId);
          if (i === -1) list.push(copy); else list[i] = copy;
          replaced++;
        });

        if (!list.length) delete p.report[bagName];
        if (!Object.keys(p.report).length) delete p.report;
      });

      return { ok: true, added: added, replaced: replaced, kept: kept, issues: [] };
    }

    App.docTemplates = {
      KINDS: KINDS, FORMAT_VERSION: FORMAT_VERSION,
      exportFile: exportFile, parseImport: parseImport, plan: plan, apply: apply,
      _norm: norm
    };
  })(App);

  /* =============================================================================
   * MODULE: App.ui.richText  — RTX-1: the box shows what it holds
   * PURPOSE: Turn the {{...}} token markup App.md.runs reads into HTML a
   *          contenteditable box can be edited in, and turn the edited box back into
   *          tokens. Bold reads as bold, a code span as code, a line break as a line
   *          break, and a cross-reference as the SECTION OR TABLE IT NAMES rather than
   *          as `{{ref:ds:android.packages}}`.
   * PURITY:  the two string functions are pure; the three DOM ones read and write a
   *          node the caller owns. No store access, no rendering of its own.
   * DEPENDS: App.util.html (esc), App.md (TOKEN, REF_TAG)
   * INVARIANTS: toHtml escapes everything data-derived — the box is a live DOM, so an
   *             unescaped captured string here would be an injection route. fromNode is
   *             its exact inverse for everything toHtml emits, so a box that is opened
   *             and closed without being typed in leaves the project byte-identical.
   * ============================================================================= */
  (function (App) {
    'use strict';
    var esc = App.util.html.esc;
    var MD = App.md;

    /* -------------------------------------------------------------------------
     * Why the storage stays tokens.
     *
     * The obvious move is to store HTML and be done with it. It is the wrong one: the
     * document is built from runs of text on its way to a PDF, and HTML would need a
     * second reader and a second set of things that can go wrong on the way — for a box
     * that is only ever used to write four kinds of emphasis.
     *
     * So the TOKENS remain the truth, exactly as they were, and this module is a lens
     * over them. Everything that reads the project — the generator, the preview, the
     * templates, the round-trip test — is untouched, and a project written before this
     * opens in it unchanged.
     *
     * The lens has to be exact in one direction: whatever toHtml emits, fromNode must
     * read back to the same tokens. Anything the box acquires that toHtml did not put
     * there — a pasted <span style>, a browser's <div> on Enter — is read for its TEXT
     * and its line breaks and nothing else, which is the safe direction to fail in.
     * ---------------------------------------------------------------------- */

    var CHIP = 'rd-chip';        // a reference that prints the target's own words
    var REFLINK = 'rd-reflink';  // a reference over words the author wrote

    /** What a resolved reference reads as, per token — the same three App.md uses. */
    var REF_READING = { ref: 'label', refn: 'numberLabel', reft: 'titleLabel' };

    /**
     * RTX-1: tokens -> the HTML the box is edited in.
     *
     * @param {string} tokens
     * @param {{resolveRef?:function(string):?Object}} [opts]
     * @returns {string}
     */
    function toHtml(tokens, opts) {
      opts = opts || {};
      var s = String(tokens == null ? '' : tokens);
      var out = '', last = 0, m;
      // Emphasis is BALANCED here for the same reason App.md balances it: a lone `{{b}}`
      // would otherwise open a <strong> that never closes and swallow the rest of the
      // box — and unlike a paragraph of markdown, this one is live DOM.
      var open = { b: false, i: false };
      var TAGS = { b: 'strong', i: 'em' };
      function lit(t) { return esc(t).split('\n').join('<br>'); }
      MD.TOKEN.lastIndex = 0;
      while ((m = MD.TOKEN.exec(s)) !== null) {
        out += lit(s.slice(last, m.index));
        var close = m[1] === '/', tag = m[2];
        last = m.index + m[0].length;
        if (tag === 'c' && !close) {
          // Taken whole, like App.md takes it: nothing inside a code span is a token.
          var at = s.indexOf('{{/c}}', MD.TOKEN.lastIndex);
          var inner = at === -1 ? s.slice(MD.TOKEN.lastIndex) : s.slice(MD.TOKEN.lastIndex, at);
          out += '<code>' + esc(inner) + '</code>';
          last = at === -1 ? s.length : at + 6;
          MD.TOKEN.lastIndex = last;
          continue;
        }
        if (TAGS[tag]) {
          if (close === open[tag]) { open[tag] = !close; out += (close ? '</' : '<') + TAGS[tag] + '>'; }
          continue;
        }
        if (tag === 'br') { out += '<br>'; continue; }
        if (MD.REF_TAG.test(tag) && !close) {
          var bits = MD.REF_TAG.exec(tag);
          var r = opts.resolveRef ? opts.resolveRef(bits[2]) : null;
          var ref = s.indexOf('{{/ref}}', MD.TOKEN.lastIndex);
          var wrapped = ref === -1 ? null : s.slice(MD.TOKEN.lastIndex, ref);
          if (wrapped !== null) { last = ref + 8; MD.TOKEN.lastIndex = last; }
          var attrs = ' data-rd-tok="' + esc(tag) + '" title="' +
            esc(r ? 'Links to ' + r.label : 'This link points at something that is no longer in the document') + '"';
          if (wrapped !== null) {
            // The author's own words are the link text, so they stay EDITABLE — the
            // marker is the underline, not a lump you cannot type inside.
            out += '<span class="' + REFLINK + (r ? '' : ' rd-broken') + '"' + attrs + '>' + lit(wrapped) + '</span>';
          } else {
            /* RTX-1: the whole point of this module, in one line.
             *
             * A reference that carries no words of its own prints the TARGET's — "Table
             * 4: Packages removed" — and the box now shows that rather than the token
             * that will become it. It is one uneditable chip, because what it says is
             * derived: typing into half of "Table 4" would mean nothing, and deleting it
             * has to take the whole reference or leave a broken one behind. */
            var shown = r ? String(r[REF_READING[bits[1]]] || r.label || '') : '[missing reference]';
            out += '<span class="' + CHIP + (r ? '' : ' rd-broken') + '" contenteditable="false"' + attrs + '>' +
              esc(shown) + '</span>';
          }
          continue;
        }
        // An unknown or unmatched token is literal text, exactly as App.md reads it.
        out += lit(m[0]);
      }
      out += lit(s.slice(last));
      ['i', 'b'].forEach(function (t) { if (open[t]) out += '</' + TAGS[t] + '>'; });
      return out;
    }

    /* -------------------------------------------------------------------------
     * The walk, shared by all three DOM functions.
     *
     * Every one of them is the same traversal asking a different question: what tokens
     * does this box hold, where in those tokens is the caret, and where in the box is a
     * given token offset. Written once, so the three cannot disagree — which they would,
     * eventually, and the symptom would be a caret that jumps somewhere else after every
     * button press.
     *
     * `emit` is called with ('text', string, node) for editable content and
     * ('markup', string) for the tokens the markup itself stands for. The token offset
     * of anything is the sum of both, in order.
     * ---------------------------------------------------------------------- */
    var BLOCKISH = { DIV: 1, P: 1, LI: 1, TR: 1, BLOCKQUOTE: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1 };

    /**
     * Walk the CONTENTS of the box. `st.len` is how much has been emitted so far, which
     * is what a block element needs to know: a `<div>` is a line break BETWEEN things,
     * and one at the very start of the box would be a break before anything.
     */
    function run(node, emit, mark) {
      var st = { len: 0 };
      function E(kind, s, n) { emit(kind, s, n); st.len += s.length; }
      children(node, E, mark, st);
    }

    function walk(node, emit, mark, st) {
      if (!node) return;
      // U+200B is the placeholder a format button leaves to type into; it is not text.
      if (node.nodeType === 3) { emit('text', String(node.nodeValue || '').replace(/\u200B/g, ''), node); return; }
      if (node.nodeType !== 1) return;
      var name = node.nodeName;
      if (name === 'BR') { emit('markup', '\n'); return; }
      var tok = node.getAttribute && node.getAttribute('data-rd-tok');
      var cls = node.className || '';
      if (tok && String(cls).indexOf(CHIP) !== -1) { emit('markup', '{{' + tok + '}}'); return; }
      if (tok && String(cls).indexOf(REFLINK) !== -1) {
        emit('markup', '{{' + tok + '}}');
        children(node, emit, mark, st);
        emit('markup', '{{/ref}}');
        return;
      }
      if (name === 'CODE') {
        // Verbatim: a code span's content is not tokenised, here or in App.md.
        emit('markup', '{{c}}');
        children(node, emit, mark, st);
        emit('markup', '{{/c}}');
        return;
      }
      if (name === 'STRONG' || name === 'B') { pair(node, 'b', emit, mark, st); return; }
      if (name === 'EM' || name === 'I') { pair(node, 'i', emit, mark, st); return; }
      if (BLOCKISH[name]) {
        // A browser's own block on Enter, or a pasted one. It is a line break and
        // nothing else — the box has no blocks of its own.
        if (st.len) emit('markup', '\n');
        children(node, emit, mark, st);
        return;
      }
      children(node, emit, mark, st);
    }
    function pair(node, tag, emit, mark, st) {
      emit('markup', '{{' + tag + '}}');
      children(node, emit, mark, st);
      emit('markup', '{{/' + tag + '}}');
    }
    function children(node, emit, mark, st) {
      var ns = node.childNodes;
      for (var i = 0; i < ns.length; i++) { if (mark) mark(node, i); walk(ns[i], emit, mark, st); }
      if (mark) mark(node, ns.length);
    }

    /** RTX-1: the box -> the tokens it stands for. @param {Node} node @returns {string} */
    function fromNode(node) {
      var out = '';
      run(node, function (kind, s) { out += s; });
      // A contenteditable renders a trailing space as U+00A0; it is a space to the
      // author, so it is stored as one rather than as a character App.md would have to
      // decide about.
      return out.replace(/ /g, ' ');
    }

    /**
     * The token offset of a DOM position inside the box.
     * @param {Node} node the box @param {Node} container @param {number} offset
     * @returns {number} clamped into the box's own text
     */
    function offsetOf(node, container, offset) {
      var len = 0, found = -1;
      run(node, function (kind, s, n) {
        if (kind === 'text' && n === container && found === -1) found = len + Math.min(offset, s.length);
        len += s.length;
      }, function (parent, i) {
        if (parent === container && i === offset && found === -1) found = len;
      });
      return found === -1 ? len : found;
    }

    /**
     * RTX-1: the selection inside a box, as offsets into its tokens.
     * @returns {?{start:number, end:number}} null when the selection is not in this box
     */
    function selectionIn(node, sel) {
      if (!node || !sel || !sel.rangeCount) return null;
      var r = sel.getRangeAt(0);
      if (!node.contains || !node.contains(r.startContainer) || !node.contains(r.endContainer)) return null;
      var a = offsetOf(node, r.startContainer, r.startOffset);
      var b = offsetOf(node, r.endContainer, r.endOffset);
      return { start: Math.min(a, b), end: Math.max(a, b) };
    }

    /** Put the caret at a token offset. Silent when the box cannot take it. */
    /** Select from one token offset to another (after a format was toggled over them). */
    function placeSelection(node, from, to, win) {
      var w = win || (node && node.ownerDocument && node.ownerDocument.defaultView);
      if (!w || !w.getSelection || !node) return;
      // `atStart`: a start on the edge between two runs belongs to the run after it.
      function point(at, atStart) {
        var len = 0, hit = null, lastText = null;
        run(node, function (kind, s, n) {
          if (hit) return;
          if (kind === 'text') {
            lastText = { node: n, offset: n.nodeValue ? n.nodeValue.length : 0 };
            if (atStart ? len + s.length > at : len + s.length >= at) { hit = { node: n, offset: Math.max(0, at - len) }; return; }
          }
          len += s.length;
        });
        // Past the last text (after a closing mark): the end of that text.
        return hit || lastText;
      }
      try {
        if (node.focus) node.focus();
        var a = point(from, from < to), b = point(to);
        if (!a || !b) { placeCaret(node, to, w); return; }
        var r = node.ownerDocument.createRange();
        r.setStart(a.node, a.offset); r.setEnd(b.node, b.offset);
        var sel = w.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      } catch (e) { /* a detached box */ }
    }

    function placeCaret(node, at, win) {
      var w = win || (node && node.ownerDocument && node.ownerDocument.defaultView);
      if (!w || !w.getSelection || !node) return;
      var len = 0, hit = null;
      run(node, function (kind, s, n) {
        if (hit) return;
        /* `Math.max(0, …)` is the whole of the markup case.
         *
         * A token offset can land INSIDE markup — the caret after a wrap is at the end
         * of `{{/b}}`, which is not a position in the DOM at all. The nearest one that
         * is, is the start of the next run of text, which is where a reader would say
         * the caret is. Without the clamp the offset came out negative and the range
         * threw, so the caret silently stayed where it was and the next button acted at
         * the beginning of the box. */
        if (kind === 'text' && len + s.length >= at) { hit = { node: n, offset: Math.max(0, at - len) }; return; }
        len += s.length;
      });
      try {
        /* FOCUS FIRST, then the range.
         *
         * Focusing an editable element puts the caret at the start of it — that is what
         * focusing an editable element means — so a `focus()` after the range silently
         * throws the range away and the caret lands at the beginning of the box. The
         * symptom was one button press acting where the last one had, and the next one
         * acting at the start of the paragraph. Measured in jsdom, and the same order is
         * what every browser wants for the same reason.
         */
        if (node.focus) node.focus();
        var r = node.ownerDocument.createRange();
        if (hit) { r.setStart(hit.node, hit.offset); r.setEnd(hit.node, hit.offset); }
        else { r.selectNodeContents(node); r.collapse(false); }
        var sel = w.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      } catch (e) { /* a detached box, or an engine that will not have it */ }
    }

    /**
     * RTX-1: what a toolbar button does, expressed on the TOKENS rather than on the DOM.
     *
     * Doing it on the string is what makes the box's behaviour testable without a
     * browser, and what lets a repaint happen in the middle of it: the selection is two
     * numbers into a string, so it survives the box being destroyed and rebuilt, which
     * is exactly what opening the reference menu does.
     *
     * @param {string} text @param {number} start @param {number} end @param {string} tag
     * @returns {{text:string, caret:number}}
     */
    function applyToken(text, start, end, tag) {
      var v = String(text == null ? '' : text);
      var s = Math.max(0, Math.min(v.length, start | 0));
      var e = Math.max(s, Math.min(v.length, end | 0));
      var sel = v.slice(s, e);
      /* A line break is written as a NEWLINE, not as `{{br}}`.
       *
       * The two mean the same thing to App.md and always have, and a newline is what
       * fromNode reads a `<br>` back as — so writing `{{br}}` here would mean the stored
       * text flipped between the two spellings depending on whether the author typed
       * anything after pressing Enter. `{{br}}` is still understood everywhere it
       * appears; nothing new writes one. */
      if (tag === 'br') return { text: v.slice(0, s) + '\n' + v.slice(e), caret: s + 1 };
      var isRef = MD.REF_TAG.test(tag);
      var open = '{{' + tag + '}}', close;
      if (isRef) close = sel ? '{{/ref}}' : '';
      else close = '{{/' + tag + '}}';
      // With a closing token the selection is kept BETWEEN the two; without one the
      // token is a marker and simply lands at the caret, leaving the text either side.
      var body = close ? sel : '';
      return { text: v.slice(0, s) + open + body + close + v.slice(e),
        caret: s + open.length + body.length + close.length };
    }

    /**
     * Bold, italic or code over a selection, the way any editor does it: if everything
     * selected already has it, it comes off; if none or only some does, all of it gets
     * it. The text is read into characters (and whole references and breaks) each
     * carrying its formatting, the formatting is changed for the selected ones, and the
     * tokens are written back afresh — so nothing is left half-open, a paragraph break
     * is never spanned, and a code span is never asked to hold a token.
     * @param {string} text tokens @param {number} start @param {number} end token offsets
     * @param {'b'|'i'|'c'} tag
     * @returns {{text:string, start:number, end:number}} the new text and the selection in it
     */
    function toggleFormat(text, start, end, tag) {
      var v = String(text == null ? '' : text);
      var atoms = [], open = { b: false, i: false }, last = 0, m;
      function chars(str, at, code) {
        for (var k = 0; k < str.length; k++) atoms.push({ v: str[k], at: at + k, b: open.b, i: open.i, c: !!code });
      }
      var re = new RegExp(MD.TOKEN.source, 'g');
      while ((m = re.exec(v)) !== null) {
        chars(v.slice(last, m.index), last, false);
        var close = m[1] === '/', t = m[2];
        if (t === 'c' && !close) {
          var stop = v.indexOf('{{/c}}', re.lastIndex);
          var inner = stop === -1 ? v.slice(re.lastIndex) : v.slice(re.lastIndex, stop);
          chars(inner, re.lastIndex, true);
          last = stop === -1 ? v.length : stop + 6;
          re.lastIndex = last;
          continue;
        }
        if (t === 'b' || t === 'i') { if (close === open[t]) open[t] = !close; }
        else if (MD.REF_TAG.test(t) && !close) {
          var w = v.indexOf('{{/ref}}', re.lastIndex);
          var whole = w === -1 ? m[0] : v.slice(m.index, w + 8);
          atoms.push({ v: whole, at: m.index, b: open.b, i: open.i, c: false, opaque: true });
          last = m.index + whole.length;
          re.lastIndex = last;
          continue;
        } else if (!close) {
          atoms.push({ v: m[0], at: m.index, b: open.b, i: open.i, c: false, opaque: true });
        }
        last = m.index + m[0].length;
      }
      chars(v.slice(last), last, false);

      var chosen = atoms.filter(function (a) { return a.at >= start && a.at < end; });
      var visible = chosen.filter(function (a) { return a.v !== '\n' && !(tag === 'c' && a.opaque); });
      var on = !(visible.length && visible.every(function (a) { return a[tag]; }));
      chosen.forEach(function (a) { if (!(tag === 'c' && a.opaque)) a[tag] = on; });

      var out = '', cur = { b: false, i: false, c: false }, s0 = -1, e0 = -1, endOpen = false;
      function closes(want) {
        if (cur.c && (!want.c || want.b !== cur.b || want.i !== cur.i)) { out += '{{/c}}'; cur.c = false; }
        if (cur.b && !want.b) { out += '{{/b}}'; cur.b = false; }
        if (cur.i && !want.i) { out += '{{/i}}'; cur.i = false; }
      }
      function opens(want) {
        if (want.b && !cur.b) { out += '{{b}}'; cur.b = true; }
        if (want.i && !cur.i) { out += '{{i}}'; cur.i = true; }
        if (want.c && !cur.c) { out += '{{c}}'; cur.c = true; }
      }
      var none = { b: false, i: false, c: false };
      atoms.forEach(function (a) {
        var sel = a.at >= start && a.at < end;
        var want = a.v === '\n' ? none : { b: a.b, i: a.i, c: a.c };
        closes(want);
        // Closing tokens that end the selection belong to it; opening ones that start it do too.
        if (endOpen && !sel) { e0 = out.length; endOpen = false; }
        if (sel && s0 === -1) s0 = out.length;
        opens(want);
        out += a.v;
        if (sel) { e0 = out.length; endOpen = true; }
      });
      closes(none);
      if (endOpen) e0 = out.length;
      if (s0 === -1) { s0 = e0 = Math.min(out.length, start); }
      return { text: out, start: s0, end: e0 };
    }

    App.ui = App.ui || {};
    App.ui.richText = {
      toHtml: toHtml, fromNode: fromNode, selectionIn: selectionIn, offsetOf: offsetOf,
      placeCaret: placeCaret, placeSelection: placeSelection, applyToken: applyToken, toggleFormat: toggleFormat, CHIP: CHIP, REFLINK: REFLINK
    };
  })(App);

  /* =============================================================================
   * MODULE: App.ui.views.reportDesign  — RD-1..RD-7: the Report Design workspace
   * PURPOSE: The full-screen workspace that decides what the document contains, in
   *          what order, at what heading level, with what hand-authored sections,
   *          under which formatting profile — plus the live preview and the template
   *          catalogues. Replaces the old "Report options" modal.
   * PURITY:  UI/DOM
   * DEPENDS: App.docHost (the host contract), App.generate, App.doc, App.docFormat,
   *          App.docStore, App.docTemplates, App.ui.richText,
   *          App.docSession (this run's filename and tag values)
   * INVARIANTS: everything shown is derived from hostBlocks and App.doc.outline — the
   *             same two calls the generator itself makes — so the panel cannot
   *             describe a document the generator would not produce. Everything it
   *             knows about the APP it is attached to arrives through App.docHost:
   *             which subjects there are, which is ready, what sections are on offer
   *             and what the rows are filtered by.
   * ============================================================================= */
  (function (App) {
    'use strict';
    var esc = App.util.html.esc;
    var MD = App.md;

    /* -------------------------------------------------------------------------
     * Layout: an ordered section list on the left, a pane switcher on the right.
     *
     * The list is the spine of the document and stays visible whatever you are doing,
     * because every other decision in here — a heading level, a paragraph, a
     * formatting profile — is answering "what does this do to the document?", and
     * that question is unanswerable if the document's shape is on another screen.
     *
     * Six panes rather than one long column: the formatting controls alone are about
     * forty fields, and stacking them under the section list would bury the section
     * list. A new pane is one entry in PANES.
     * ---------------------------------------------------------------------- */

    var PANES = [
      { id: 'section', label: 'Sections' },
      // PDF-1: one pane for everything about how the document looks — page, text,
      // tables, header and footer, marking, numbering — with the pages beside it.
      { id: 'styles', label: 'Styles' },
      { id: 'templates', label: 'Templates' },
      { id: 'preview', label: 'Preview' },
      // GEN-TAB: generation is the last thing you do, so it is the last tab. It is also
      // the only pane that WRITES a file, which is reason enough not to have its button
      // sitting in the footer of every other one.
      { id: 'generate', label: 'Generate' }
    ];

    var _rd = {
      open: false,
      pane: 'section',
      selected: null,        // block id being edited in the Section pane
      fmtId: null,           // Style being edited in the Styles pane
      styleSection: null,    // which part of that Style is open (PDF-1)
      held: null,            // what the last edit asked for that the Style could not use
      colourOpen: null,      // the colour field whose palette is open (its Style path)
      renaming: null,        // the section whose heading is being edited in the list
      secCat: null,          // the open category of the Sections pane
      imgMenu: null,         // 'partId:box' whose choose-menu is open
      imgPick: false,        // that menu showing Standard Images
      secWhole: false,       // whether the section preview shows the whole document
      listWidth: null,       // the Sections list's width, once dragged
      secZoom: null,         // the section preview's zoom, when changed from the default
      prevZoom: null,        // the Preview pane's zoom, likewise
      conflict: null,        // { kindKey, plan, decisions } while an import is being resolved
      refFor: null,          // part id whose "insert reference" menu is open
      preview: null,         // cached layout of the document, so switching panes is not a re-layout
      refs: null             // cached reference targets of the built document
    };
    var _ctx = null;
    var _dragId = null;      // section being dragged
    var _dragPart = null;    // part being dragged inside a section

    /* OPT-2: the report options, exactly as the Generate button will see them — the
     * project's four include-maps plus this run's filename, tags and classification.
     * READ-ONLY: it is assembled fresh on every call, so the four maps are written
     * through App.docStore.setReportInclude and the three session fields through
     * `session()` below. Mutating what this returns would change nothing. */
    function opts() { return App.docSession.options(); }
    /** The per-run half, which is still a live object and still written to directly. */
    function session() { return App.docSession.get(); }
    /* The subjects the document could be about, as the HOST describes them. A
     * subject is {id, label, sublabel} to the module; `config` is whatever the host
     * needs handed back to it, and only the host ever reads it. */
    function H() { return App.docHost.get(); }
    function latest() { var h = H(); return (h && h.subject) ? h.subject.list() : []; }
    /** The host's declaration for one block, unbound — labels, columns, table keys. */
    function providerFor(block) {
      var id = block && block.id;
      return App.docHost.sections(null).filter(function (x) { return x && x.id === id; })[0] || null;
    }
    function selectedSubjectId() { return App.docSession.selectedSubjectId(); }
    /** What the host calls the thing a document is about (`host.subject.noun`), for the UI's wording. */
    function noun() { var sj = H() && H().subject; return (sj && sj.noun) || 'subject'; }
    function bag(project) { return (project && project.report) || {}; }
    function customSection(project, id) {
      return (bag(project).sections || []).filter(function (s) { return s.id === id; })[0] || null;
    }
    function cb(attrs, label, on) {
      return '<label class="gen-opt"><input type="checkbox" ' + attrs + (on ? ' checked' : '') + '> ' + esc(label) + '</label>';
    }
    function incMapOn(map, ds, key) {
      var m = opts()[map] || {};
      if (key != null) { var d = m[ds] || {}; return d[key] !== false; }
      return m[ds] !== false;
    }

    /** Blocks + their resolved levels/numbers — the same pair the generator uses. */
    function outlineNow(project) {
      // The subject goes in: a section can exist only for some subjects,
      // so the section list would otherwise offer a section the document will not have.
      var blocks = App.docGen.reportBlocks(H(),
        Object.assign({}, opts(), { subjectId: selectedSubjectId(project) }));
      var profile = App.docFormat.resolve(project);
      return {
        blocks: blocks,
        resolved: App.doc.outline(blocks, {
          baseLevel: 1,
          clampSkips: true,
          numbered: profile.numbering.on
        }),
        profile: profile
      };
    }

    // ======================================================================
    // RD-1: the section list
    // ======================================================================

    /** A heading level by its plain name. */
    function levelName(lv) {
      return lv === App.doc.TITLE_LEVEL ? 'Title' : lv === App.doc.BODY_LEVEL ? 'Normal text' : 'Heading ' + lv;
    }
    var LEVEL_OPTS = [{ value: '', label: 'Auto' }].concat(App.doc.LEVELS.map(function (l) {
      return { value: String(l.value), label: levelName(l.value) };
    }));

    function levelSelect(b, resolvedFor) {
      var cur = b.level == null ? '' : String(b.level);
      var shown = resolvedFor ? resolvedFor.level : null;
      var title = b.level == null
        ? 'Automatic — currently ' + levelName(shown) + '. Pick a level to pin it.'
        : 'Pinned. Choose Auto to let it follow the section above.';
      return '<select class="rd-level" data-rd-level="' + esc(b.id) + '" title="' + esc(title) + '" aria-label="Heading level for ' + esc(b.label) + '">' +
        LEVEL_OPTS.map(function (o) {
          var label = (o.value === '' && shown != null)
            ? 'Auto (' + levelName(shown) + ')'
            : o.label;
          return '<option value="' + o.value + '"' + (o.value === cur ? ' selected' : '') + '>' + esc(label) + '</option>';
        }).join('') + '</select>';
    }


    /** A section's heading, set from the list: an own section's title, or a generated one's
     *  heading (its standard wording, or blank, stores nothing). */
    function renameSection(id, value) {
      var p = App.docHost.get() && App.docHost.get().getState();
      var block = p ? outlineNow(p).blocks.filter(function (b) { return b.id === id; })[0] : null;
      if (!block) return { ok: false, issues: [] };
      var v = String(value == null ? '' : value).trim();
      if (block.kind === 'custom') return App.docStore.updateSection(id, { title: v });
      return App.docStore.setBlockHeading(id, v === String(block.defaultTitle || '').trim() ? '' : v);
    }

    /** The Sections list's width in pixels: dragged by its grip, remembered in this browser. */
    var LIST_WIDTH = { dflt: 420, min: 260, max: 900 };
    var LIST_KEY = 'docgen.rd.listWidth';
    function listWidth() {
      var w = _rd.listWidth;
      if (w == null) { try { w = Number(window.localStorage.getItem(LIST_KEY)) || null; } catch (e) { w = null; } }
      return Math.round(Math.min(LIST_WIDTH.max, Math.max(LIST_WIDTH.min, w || LIST_WIDTH.dflt)));
    }

    function renderSectionList(project, view) {
      var byId = {};
      view.resolved.forEach(function (r) { if (!r.parentId) byId[r.id] = r; });

      var rows = view.blocks.map(function (b, i) {
        var off = !b.included;
        var r = byId[b.id];
        var num = (off || !r) ? '—' : (r.number || '·');
        var aria = ' aria-label="Include ' + esc(b.label) + '"';
        var inc = b.groups
          ? '<input type="checkbox" data-rd-ds-all="' + esc(b.dsId) + '"' + (off ? '' : ' checked') + aria + '>'
          : b.kind === 'dataset'
            ? '<input type="checkbox" data-rd-inc-ds="' + esc(b.dsId) + '"' + (off ? '' : ' checked') + aria + '>'
            : '<input type="checkbox" data-rd-inc="' + esc(b.kind === 'custom' ? b.id : b.kind) + '"' + (off ? '' : ' checked') + aria + '>';

        // A level skip is reported rather than silently reinterpreted (DOC-2).
        var warn = (r && r.skipped)
          ? '<span class="rd-warn" title="There is no heading one level above this one. It has been pulled up to ' + levelName(r.level) + '.">↰ ' + levelName(r.level) + '</span>'
          : '';
        var kind = b.kind === 'custom' ? ''
          : '<span class="rd-kind">' + esc(b.kind === 'meta' ? 'Meta' : b.kind === 'toc' ? 'Table of Contents' : 'Auto-populated') + '</span>';
        var sel = _rd.selected === b.id ? ' sel' : '';

        return '<li class="ord-step rd-row' + (off ? ' off' : '') + sel + '" draggable="true" data-rd-block="' + esc(b.id) + '">' +
          '<span class="ord-num">' + esc(num) + '</span>' +
          '<label class="ord-inc" title="Include this section in the document">' + inc + '</label>' +
          '<span class="ord-body">' +
            (_rd.renaming === b.id
              ? '<input class="rd-rename" data-rd-rename="' + esc(b.id) + '" value="' + esc(String(b.title == null ? b.label : b.title)) + '"' +
                ' placeholder="' + esc(b.defaultTitle || 'No heading') + '" aria-label="Heading for ' + esc(b.label) + '">'
              : '<button type="button" class="rd-open" data-rd-select="' + esc(b.id) + '" title="Double-click to rename">' + esc(b.label) + '</button>') +
            '<span class="rd-meta">' + kind + warn + '</span>' +
          '</span>' +
          levelSelect(b, r) +
          '<span class="ord-move">' +
            '<button type="button" data-rd-up="' + esc(b.id) + '"' + (i === 0 ? ' disabled' : '') + ' title="Move earlier" aria-label="Move ' + esc(b.label) + ' earlier">▲</button>' +
            '<button type="button" data-rd-down="' + esc(b.id) + '"' + (i === view.blocks.length - 1 ? ' disabled' : '') + ' title="Move later" aria-label="Move ' + esc(b.label) + ' later">▼</button>' +
          '</span></li>';
      }).join('');

      var tpls = (bag(project).sectionTemplates || []);
      var tplPicker = tpls.length
        ? '<select data-rd-use-template aria-label="Add a section from a template">' +
            '<option value="">From template&hellip;</option>' +
            tpls.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>'; }).join('') +
          '</select>'
        : '';

      return '<div class="rpt-pane rpt-pane-main" style="flex-basis:' + listWidth() + 'px"><h4>Sections</h4>' +
        '<div class="rd-addbar"><button type="button" class="primary" data-rd-add-section>+ Add section</button>' + tplPicker + '</div>' +
        '<div id="rd-order-host"><ol class="ord-list">' + rows + '</ol></div></div>';
    }

    // ======================================================================
    // RD-2: the Section pane — hand-authored content, or a register's options
    // ======================================================================

    /** PDF-1: which characters in this text the PDF's standard fonts cannot show. */
    function hostileHint(text) {
      var chars = toWinAnsi(MD.plain(text)).replaced.filter(function (c) { return c !== '→'; });
      if (!chars.length) return '';
      return '<div class="rd-esc" title="The PDF uses the standard fonts every PDF reader has. Your text is stored exactly as typed, and the HTML shows it as typed.">' +
        'The PDF writes these another way: ' + chars.map(function (c) { return '<code>' + esc(c) + '</code>'; }).join(' ') + '</div>';
    }

    /* -------------------------------------------------------------------------
     * RTX-1: the box that shows what it holds.
     *
     * Every place the designer writes prose used to be a `<textarea>` holding the raw
     * token markup, so a cross-reference to the packages register read
     * `{{ref:ds:android.packages}}` while you were writing the sentence around it — the
     * one thing about it you cannot check by looking. The box is a contenteditable now
     * and shows the same text the page will: bold as bold, a code span as code, a line
     * break as a line break, and a reference as the name of what it points at.
     *
     * The STORAGE is unchanged (see App.ui.richText): the tokens are still the truth,
     * and a project written before this opens in it unaltered.
     *
     * `resolveRef` is the document's own resolver — the same one App.doc renders with —
     * so a chip reads exactly what the PDF will print, renumbering included.
     * ---------------------------------------------------------------------- */
    function refResolver(project) {
      var r = docRefs(project);
      return r ? r.resolve : null;
    }
    /**
     * PDF-1: what a reference can point at, from the document as it will be built —
     * generated tables included, numbered as they will print. Cached until the next
     * change, because every rich-text box on a pane asks.
     */
    function docRefs(project) {
      if (_rd.refs) return _rd.refs;
      var selId = selectedSubjectId(project);
      try {
        var built = App.docGen.documentFor(H(), Object.assign({}, opts(), { subjectId: selId }), { utc: H().clock && H().clock.nowIso ? H().clock.nowIso() : '' });
        _rd.refs = built.refs;
      } catch (e) {
        _rd.refs = null;                 // a half-built document must not break the editor
      }
      return _rd.refs;
    }

    /**
     * @param {string} attrs   the data attributes identifying what this box writes to
     * @param {string} tokens  the stored token text
     */
    function richBox(project, attrs, tokens, cls, placeholder) {
      return '<div class="rd-rich ' + (cls || '') + '" contenteditable="true" role="textbox"' +
        ' aria-multiline="true" spellcheck="true" data-rd-rich data-rd-live ' + attrs +
        (placeholder ? ' data-rd-ph="' + esc(placeholder) + '"' : '') + '>' +
        App.ui.richText.toHtml(tokens || '', { resolveRef: refResolver(project) }) + '</div>';
    }

    /* RTX-1: the four formatting buttons, wherever prose is written. `host` is the data
     * attributes that say which box they act on, so one row of buttons serves a
     * paragraph, an introduction and a table cell without three copies of it. */
    var TOOLBAR = [['b', 'B', 'Bold'], ['i', 'I', 'Italic'], ['c', '‹›', 'Code'], ['br', '↵', 'Line break']];
    function toolbar(host) {
      return TOOLBAR.map(function (t) {
        return '<button type="button" class="rd-tb" data-rd-wrap="' + t[0] + '" ' + host +
          ' title="' + esc(t[2]) + '">' + esc(t[1]) + '</button>';
      }).join('');
    }

    function partControls(sec, part, i, n) {
      return '<span class="rd-part-move">' +
        '<button type="button" data-rd-part-up="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '"' + (i === 0 ? ' disabled' : '') + ' title="Move up">▲</button>' +
        '<button type="button" data-rd-part-down="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '"' + (i === n - 1 ? ' disabled' : '') + ' title="Move down">▼</button>' +
        '<button type="button" class="danger" data-rd-part-del="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '" title="Delete this block">✕</button>' +
        '</span>';
    }

    /* REF-1: the insert-a-reference menu, and the two questions it has to answer.
     *
     * WHAT to point at is the list of targets — now sections, tables AND paragraphs,
     * all derived from the same outline the document is built from.
     *
     * WHAT IT SHOULD SAY is the second question, and it used only to have one answer.
     * A writer wants "see Table 4" as often as "see Table 4: Packages removed", and
     * when the sentence already reads "…in the packages table" they want the words they
     * already typed to become the link. So a target offers a reading per column, and
     * selecting text before pressing the button pre-empts all three: the selection is
     * the link text and the reading buttons are not shown for it.
     *
     * `own` — the section the paragraph being edited lives in — is dropped from the list
     * for a section target: a link from a section to itself is a link to where you are.
     */
    var REF_READINGS = [
      { tag: 'ref', label: 'Full', hint: 'Table 4: Packages removed' },
      { tag: 'refn', label: 'Number', hint: 'Table 4' },
      { tag: 'reft', label: 'Title', hint: 'Packages removed' }
    ];

    /**
     * @param {string} host  the data attributes identifying the box being written into
     */
    function refMenuFor(project, ownId, host) {
      // From the built document, so the generated tables are in the list.
      var refs = docRefs(project);
      var targets = (refs ? refs.targets : []).filter(function (t) { return t.id !== ownId; });
      if (!targets.length) return '<div class="rd-refmenu"><em>Nothing to link to yet.</em></div>';
      return '<div class="rd-refmenu">' +
        '<div class="rd-refmenu-h" title="Select text first to link those words; otherwise pick how the link reads. Links follow renames and renumbering.">Link to&hellip;</div>' +
        targets.map(function (t) {
          return '<div class="rd-reftarget">' +
            '<span class="rd-kind">' + esc(t.kind) + '</span>' +
            '<span class="rd-reftarget-l" title="' + esc(t.label) + '">' + esc(t.label) + '</span>' +
            '<span class="rd-refreadings">' + REF_READINGS.map(function (r) {
              var reading = r.tag === 'refn' ? t.numberLabel : r.tag === 'reft' ? t.titleLabel : t.label;
              return '<button type="button" data-rd-ref-pick="' + esc(t.id) + '" data-rd-ref-tag="' + r.tag + '" ' + host +
                ' title="' + esc('Reads as: ' + reading) + '">' + esc(r.label) + '</button>';
            }).join('') + '</span></div>';
        }).join('') + '</div>';
    }

    function refMenu(project, sec, part) {
      if (_rd.refFor !== part.id) return '';
      return refMenuFor(project, sec.id,
        'data-rd-part="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '"');
    }

    function paraEditor(project, sec, part, i, n) {
      var host = 'data-rd-part="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '"';
      return '<div class="rd-part" draggable="true" data-rd-partrow="' + esc(part.id) + '">' +
        '<div class="rd-part-head"><span class="rd-part-kind">Paragraph</span>' +
          '<span class="rd-tbs">' + toolbar(host) +
            '<button type="button" class="rd-tb" data-rd-ref-open="' + esc(part.id) + '" title="Insert a cross-reference that survives renaming and reordering">🔗 Link</button>' +
          '</span>' +
          cb('data-rd-part-flag="centre" ' + host, 'Centre', part.centre === true) +
          partControls(sec, part, i, n) + '</div>' +
        refMenu(project, sec, part) +
        richBox(project, 'data-rd-text="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '"',
          part.text, '', 'Write the paragraph. Enter is a line break; a blank line starts a new paragraph.') +
        hostileHint(part.text || '') + '</div>';
    }

    /**
     * TW-1: the editor table is constrained to the PROFILE's text width, and the widths
     * are shown as a `<colgroup>` of percentages.
     *
     * Both for the same reason: a drag has to mean something. Dragging a column edge
     * inside a box of arbitrary width tells you the ratio but not the result, and a
     * table that fills a 1400px pane while the page is 160mm wide invites layouts that
     * do not survive the conversion. Constrained, what the operator drags is the shape
     * the PDF will have — at a scale, but honestly at a scale.
     * @returns {number} the editor table's width in px
     */
    function textWidthPx(style) {
      var dims = STYLE_PAPER_MM[style.page.paper] || STYLE_PAPER_MM.a4;
      var w = style.page.orientation === 'landscape' ? dims[1] : dims[0];
      return Math.round((w - style.page.margins.left - style.page.margins.right) * 96 / 25.4);
    }

    /* -------------------------------------------------------------------------
     * TW-1/TW-2: one column-width editor, two places it appears.
     *
     * A hand-authored table has a real table to drag on, so its grips sit on the header
     * cells. A GENERATED table has no editable table in the pane at all — its content
     * comes from the register — so the same grips sit on a strip of labelled segments
     * that stands in for it. Both write through the same two docStore calls and both
     * read their totals from the same `widthTotal`, so the two editors cannot end up
     * disagreeing about what a width is.
     *
     * `data-rd-wt` is the target: `p|<sectionId>|<partId>` for a part, `b|<blockId>|<n>`
     * for a block. One string means one drag handler and one typed-value handler rather
     * than two of each.
     * ---------------------------------------------------------------------- */

    function partTarget(secId, partId) { return 'p|' + secId + '|' + partId; }
    function blockTarget(blockId, count) { return 'b|' + blockId + '|' + count; }

    /** The percentage chip: reads as text, and edits as a number on double-click. */
    function pctChip(target, col, pct, auto) {
      return '<span class="rd-colpct' + (auto ? ' auto' : '') + '" data-rd-pct="' + esc(target) + '" data-rd-col="' + col + '"' +
        ' tabindex="0" role="button"' +
        ' title="' + (auto
          ? 'Automatic — as wide as the content. Drag an edge, or double-click here to type a width.'
          : 'This column’s share of the table. Double-click to type one.') + '">' + pct + '%</span>';
    }

    /** The resize grip. The LAST column has none: its edge is the page's, not the table's. */
    function grip(target, col, last) {
      if (last) return '';
      return '<span class="rd-colresize" data-rd-colresize data-rd-wt="' + esc(target) + '" data-rd-col="' + col + '"' +
        ' title="Drag to set this column’s share of the table"></span>';
    }

    /** TW-1/TW-3: the line under a width editor — what the shares add up to, and what
     *  that means for the table. */
    function widthNote(widths, auto, resetAttr) {
      var reset = '<button type="button" ' + resetAttr + (auto ? ' disabled' : '') +
        ' title="Hand the columns back to automatic widths">Reset widths</button>';
      if (auto) {
        return '<div class="rd-tablebtns">' + reset +
          '<span class="rd-state" title="Drag a column edge, or double-click a percentage to type one">Automatic widths</span></div>';
      }
      var t = App.docStore.widthTotal(widths);
      var msg = t.ok
        ? '<span class="rd-state">Columns total ' + t.total + '%</span>'
        : t.over
          // Asked for more page than there is. Said in red, because the table WILL be
          // rendered — capped at the full width, with the columns scaled to fit — and a
          // silently different table is worse than a stated one.
          ? '<span class="rd-wflag">⚠ Columns total ' + t.total + '% — more than the page has. The table will be capped at full width and the columns scaled to fit, so none will be the width you typed.</span>'
          // Under is not a fault. It is how you make a table narrower than the page.
          : '<span class="rd-wnote">Columns total ' + t.total + '% — the table will be ' + t.total + '% of the page width, centred.</span>';
      return '<div class="rd-tablebtns">' + reset + msg + '</div>';
    }

    /**
     * TW-2: the stand-in strip for a generated section's table.
     * @param {Array<{id:string,label:string}>} columns @param {?number[]} widths
     */
    function widthStrip(project, blockId, columns, widths) {
      var n = columns.length;
      var auto = !(widths && widths.length === n);
      var shown = auto ? App.docStore.evenWidths(n) : widths;
      var target = blockTarget(blockId, n);
      var px = textWidthPx(App.docFormat.resolve(project));
      // Drawn TO SCALE against the page: each segment is its own share of the strip, so
      // a set totalling 60% visibly leaves 40% of the strip empty — which is the whole
      // point of allowing it. It also makes the drag arithmetic honest, since a pointer
      // position over the strip is directly a share of the page.
      var segs = columns.map(function (c, i) {
        var pct = Math.round(shown[i] * 1000) / 10;
        return '<span class="rd-wseg" style="width:' + Math.min(100, shown[i] * 100) + '%">' +
          '<span class="rd-wlabel" title="' + esc(c.label) + '">' + esc(c.label) + '</span>' +
          pctChip(target, i, pct, auto) + grip(target, i, i === n - 1) + '</span>';
      }).join('');
      return '<div class="rd-fieldset"><strong title="Drag an edge to change the split, or double-click a percentage to type one. The strip is the page\'s text width.">Column widths</strong>' +
        (n < 2
          ? '<p class="rd-state">One column: no width to set.</p>'
          : '<div class="rd-widthbar" style="width:' + px + 'px">' + segs + '</div>' +
            widthNote(auto ? null : widths, auto, 'data-rd-block-autowidth="' + esc(blockId) + '"')) +
        '</div>';
    }

    function tableEditor(project, sec, part, i, n) {
      var head = part.header || [], rows = part.rows || [], align = part.align || [];
      var widths = (part.widths && part.widths.length === head.length) ? part.widths : null;
      var auto = !widths;
      var px = textWidthPx(App.docFormat.resolve(project));
      // TW-3: the table is drawn at its share of the page, inside a full-width box. So a
      // set totalling 60% shows a 60% table, and the drag — measured against the BOX,
      // not the table — still reads as a share of the page.
      var sum = widths ? Math.min(1, widths.reduce(function (a, w) { return a + w; }, 0)) : 1;
      var tablePx = Math.max(180, Math.round(px * (sum > 0 ? sum : 1)));
      // SPC-1: with a height set, each row says whether it takes it — see the tick below.
      var rowMm = App.docStore.mmValue(part.rowHeight);
      var group = '<colgroup>' + head.map(function (_, c) {
        return '<col style="width:' + (widths ? (widths[c] / sum * 100) : (100 / head.length)) + '%">';
      }).join('') + '<col style="width:' + (rowMm ? 58 : 34) + 'px"></colgroup>';

      var target = partTarget(sec.id, part.id);
      var ths = head.map(function (h, c) {
        var pct = widths ? Math.round(widths[c] * 1000) / 10 : Math.round(1000 / head.length) / 10;
        // RTX-2: a heading is prose like any other cell, so it takes the same box.
        return '<th>' + richBox(project,
            'data-rd-cell="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '" data-rd-row="-1" data-rd-col="' + c + '"' +
            ' aria-label="Column ' + (c + 1) + ' heading"', h, 'rd-cellbox') +
          '<span class="rd-colbar">' +
            '<select data-rd-align="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '" data-rd-col="' + c + '" aria-label="Column ' + (c + 1) + ' alignment" title="Column alignment">' +
              ['l', 'c', 'r'].map(function (a) { return '<option value="' + a + '"' + ((align[c] || 'l') === a ? ' selected' : '') + '>' + (a === 'l' ? '⇤' : a === 'c' ? '↔' : '⇥') + '</option>'; }).join('') +
            '</select>' +
            pctChip(target, c, pct, auto) +
            '<button type="button" class="danger" data-rd-delcol="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '" data-rd-col="' + c + '"' + (head.length <= 1 ? ' disabled' : '') + ' title="Delete this column">✕</button>' +
          '</span>' + grip(target, c, c === head.length - 1) + '</th>';
      }).join('');
      /* SPC-1: the tick only appears once there is a height to apply — a column of ticks
       * that do nothing is worse than no column at all. */
      var trs = rows.map(function (r, ri) {
        var tall = App.docStore.rowTall(part, ri);
        return '<tr>' + head.map(function (_, c) {
          return '<td>' + richBox(project,
            'data-rd-cell="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '" data-rd-row="' + ri + '" data-rd-col="' + c + '"' +
            ' aria-label="Row ' + (ri + 1) + ' column ' + (c + 1) + '"', r[c], 'rd-cellbox') + '</td>';
        }).join('') + '<td class="rd-rowdel">' +
          (rowMm
            ? '<input type="checkbox" class="rd-tallbox" data-rd-tallrow="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) +
              '" data-rd-row="' + ri + '"' + (tall ? ' checked' : '') +
              ' title="' + (tall ? 'This row is ' + esc(String(rowMm)) + 'mm taller — untick to leave it at its content'
                                 : 'Tick to make this row ' + esc(String(rowMm)) + 'mm taller') + '"' +
              ' aria-label="Extra height on row ' + (ri + 1) + '">'
            : '') +
          '<button type="button" class="danger" data-rd-delrow="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '" data-rd-row="' + ri + '" title="Delete this row">✕</button></td></tr>';
      }).join('');
      var host = 'data-rd-part="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '"';
      return '<div class="rd-part" draggable="true" data-rd-partrow="' + esc(part.id) + '">' +
        '<div class="rd-part-head"><span class="rd-part-kind">Table</span>' +
          /* RTX-2: the same toolbar a paragraph has, acting on whichever CELL was last
           * written in. A cell holds the same token markup a paragraph does, so there is
           * no reason for it to be the one place bold and a cross-reference are missing —
           * and every reason for it not to be, since a table is where the prose that
           * needs a reference usually ends up. */
          '<span class="rd-tbs">' + toolbar(host) +
            '<button type="button" class="rd-tb" data-rd-ref-open="' + esc(part.id) + '" title="Insert a cross-reference into the cell you were writing in">🔗 Link</button>' +
          '</span>' +
          cb('data-rd-part-flag="centre" ' + host, 'Centre', part.centre === true) +
          // TBS-1: this table opts in; the Formatting pane decides what opting in looks like.

          // CAP-4: a table that names itself in its own title row, or one that is simply
          // a layout, does not want "Table 7:" underneath it.
          cb('data-rd-part-flag="noCaption" data-rd-part="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '"', 'No caption', part.noCaption === true) +
          partControls(sec, part, i, n) + '</div>' +
        refMenu(project, sec, part) +
        (part.noCaption === true
          ? '<p class="rd-state">No caption: this table is not numbered.</p>'
          : '<input class="rd-cap" value="' + esc(part.caption || '') + '" data-rd-caption="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '" placeholder="Table caption — left blank, the section’s heading is used" aria-label="Table caption">') +
        '<div class="rd-tablewrap"><div class="rd-tablescale" style="width:' + px + 'px">' +
          '<table class="rd-table rd-table-fixed" style="width:' + tablePx + 'px">' + group +
          '<thead><tr>' + ths + '<th class="rd-rowdel' + (rowMm ? ' rd-rowdel-wide' : '') + '"' +
            (rowMm ? ' title="Which rows take the extra height">↕' : '>') + '</th></tr></thead><tbody>' + trs + '</tbody></table></div></div>' +
        '<div class="rd-tablebtns">' +
          '<button type="button" data-rd-addrow="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '">+ Row</button>' +
          '<button type="button" data-rd-addcol="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '">+ Column</button>' +
          /* SPC-1: the table as a FORM. A signature block is a table whose cells are
           * mostly empty and need to be big enough to write in, and nothing in the
           * cells can say how tall a row is — so it is said here, in the same
           * millimetres the Space part uses. */
          '<label class="rd-mmlab rd-rowh">Extra row height' +
            '<input class="rd-mm" type="number" min="0" max="' + App.docStore.MAX_SPACE_MM + '" step="1"' +
              ' value="' + esc(String(App.docStore.mmValue(part.rowHeight) || '')) + '"' +
              ' data-rd-rowheight="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '"' +
              ' placeholder="0" aria-label="Extra height for every row of this table, in millimetres"> mm' +
          '</label>' +
        '</div>' +
        (rowMm ? rowHeightNote(part, rows.length, rowMm) : '') +
        widthNote(widths, auto, 'data-rd-autowidth="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '"') +
        '</div>';
    }

    /**
     * SPC-1: what the extra row height is currently doing, in a sentence.
     *
     * It says WHICH rows because the answer is not visible from the number: a table with
     * two of five rows ticked and a table with all five look the same in the editor until
     * you count the ticks.
     */
    function rowHeightNote(part, n, mm) {
      var tall = 0;
      for (var i = 0; i < n; i++) if (App.docStore.rowTall(part, i)) tall++;
      var which = tall === n
        ? 'Every body row is'
        : tall === 0
          ? 'No row is currently ticked, so nothing is'
          : tall + ' of the ' + n + ' body rows are';
      return '<p class="rd-state" title="The ticks in the last column choose which rows">' + which + ' <strong>' + esc(String(mm)) + 'mm</strong> taller.</p>';
    }

    function simplePart(sec, part, i, n, label, note) {
      return '<div class="rd-part rd-part-simple" draggable="true" data-rd-partrow="' + esc(part.id) + '">' +
        '<div class="rd-part-head"><span class="rd-part-kind">' + esc(label) + '</span>' +
          partControls(sec, part, i, n) + '</div></div>';
    }

    /**
     * SPC-1: the Space part — a gap with a size, placed and moved like any other part.
     *
     * It shows the measurement AND draws it, because a number of millimetres means very
     * little until you have seen one: the strip under the box is the gap, at the scale
     * the paper beside it is drawn at.
     */
    function spaceEditor(sec, part, i, n) {
      var mm = App.docStore.mmValue(part.height);
      return '<div class="rd-part rd-part-simple" draggable="true" data-rd-partrow="' + esc(part.id) + '">' +
        '<div class="rd-part-head"><span class="rd-part-kind">Space</span>' +
          '<label class="rd-mmlab">' +
            '<input class="rd-mm" type="number" min="0" max="' + App.docStore.MAX_SPACE_MM + '" step="1"' +
              ' value="' + esc(String(mm || '')) + '" data-rd-space="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '"' +
              ' aria-label="Height of this space in millimetres"> mm' +
          '</label>' +
          partControls(sec, part, i, n) + '</div>' +
        (mm ? '<div class="rd-mmshow" style="height:' + Math.round(mm * 96 / 25.4) + 'px"></div>' : '') +
        '</div>';
    }

    var IMAGE_LAYOUTS = [{ value: 'single', label: 'Single image' }, { value: 'pair', label: 'Side by side' }, { value: 'grid4', label: '2×2 grid' },
      { value: 'grid21', label: '2-1 grid' }, { value: 'grid12', label: '1-2 grid' }];
    var IMAGE_CAPTIONS = [{ value: 'one', label: 'One caption' }, { value: 'separate', label: 'Separate captions' }, { value: 'none', label: 'No caption' }];
    function imgSelect(attr, partId, secId, val, options, label) {
      return '<label class="rd-lab rd-lab-s">' + esc(label) + '<select ' + attr + '="' + esc(partId) + '" data-rd-sec="' + esc(secId) + '" aria-label="' + esc(label) + '">' +
        options.map(function (o) { return '<option value="' + o.value + '"' + (o.value === val ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') +
        '</select></label>';
    }

    /** IMG-1: one box of an image part: its image and settings, or a place to drop one. */
    function imageBox(project, sec, part, k) {
      var im = (part.images || [])[k] || null;
      var key = part.id + ':' + k;
      var ids = ' data-rd-part="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '"';
      var menu = '';
      if (_rd.imgMenu === key) {
        var std = bag(project).standardImages || [];
        menu = '<div class="rd-imgmenu">' + (_rd.imgPick
          ? (std.length ? std.map(function (s) {
              var a = imageAsset(IMAGE_PATH('standard', s.file));
              return '<button type="button" data-rd-img-std="' + esc(s.file) + '" data-rd-img-name="' + esc(s.name) + '"' + ids + ' data-rd-img-k="' + k + '">' +
                (a.url ? '<img class="rd-std-thumb" src="' + esc(a.url) + '" alt="">' : '') + esc(s.name) + '</button>';
            }).join('') : '<p class="rd-state">No standard images yet.</p>')
          : '<button type="button" data-rd-img-from="standard"' + ids + ' data-rd-img-k="' + k + '">From Standard Images&hellip;</button>' +
            '<label class="rd-filebtn">From this computer&hellip;<input type="file" accept="image/png,image/jpeg" data-rd-img-file' + ids + ' data-rd-img-k="' + k + '"></label>') +
          '</div>';
      }
      if (!im) {
        return '<div class="rd-imgbox rd-imgbox-empty" data-rd-imgbox="' + k + '"' + ids + ' tabindex="0">' +
          '<span class="rd-imgdrop">Drop an image here, or click to choose</span>' + menu + '</div>';
      }
      var path = IMAGE_PATH(im.source, im.file);
      var a = imageAsset(path);
      var sep = part.captions === 'separate';
      var w = im.width || 100;
      return '<div class="rd-imgbox" data-rd-imgbox="' + k + '"' + ids + ' tabindex="0">' +
        (a.state === 'ok' && a.url ? '<img class="rd-imgthumb" src="' + esc(a.url) + '" alt="">'
          : '<span class="rd-imgthumb rd-imgthumb-none">' + (a.state === 'missing' ? 'Missing' : '') + '</span>') +
        '<span class="rd-imgname" title="' + esc(im.name) + '">' + esc(im.name) + (im.source === 'standard' ? ' <span class="rd-kind">Standard</span>' : '') + '</span>' +
        '<button type="button" class="rd-imgclear" data-rd-img-clear' + ids + ' data-rd-img-k="' + k + '" aria-label="Take this image out">✕</button>' +
        '<div class="rd-imgopts">' +
          '<label class="rd-lab rd-lab-s" title="A share of the text width; never wider than its box">Width (%)<span class="rd-num">' +
            '<input inputmode="numeric" data-rd-img-width' + ids + ' data-rd-img-k="' + k + '" value="' + esc(String(w)) + '" aria-label="Width, percent of the text width">' +
            '<span class="rd-steps">' +
              '<button type="button" data-rd-img-step="+"' + ids + ' data-rd-img-k="' + k + '" aria-label="Width up" tabindex="-1">&#9650;</button>' +
              '<button type="button" data-rd-img-step="-"' + ids + ' data-rd-img-k="' + k + '" aria-label="Width down" tabindex="-1">&#9660;</button>' +
            '</span></span></label>' +
          '<label class="gen-opt"><input type="checkbox" data-rd-img-noborder' + ids + ' data-rd-img-k="' + k + '"' + (im.noBorder ? ' checked' : '') + '> No border</label>' +
          (sep ? '<input class="rd-imgcap" placeholder="Caption" data-rd-live data-rd-img-capk' + ids + ' data-rd-img-k="' + k + '" value="' + esc(im.caption || '') + '" aria-label="Caption for this image">' : '') +
        '</div>' + menu + '</div>';
    }

    /** IMG-1: an image part: its layout, its caption mode, its boxes and (one caption) its caption. */
    function imageEditor(project, sec, part, i, n) {
      var count = FIG_BOXES(part.layout);
      var boxes = '';
      for (var k = 0; k < count; k++) boxes += imageBox(project, sec, part, k);
      return '<div class="rd-part rd-part-image" draggable="true" data-rd-partrow="' + esc(part.id) + '">' +
        '<div class="rd-part-head"><span class="rd-part-kind">Image</span>' +
          imgSelect('data-rd-img-layout', part.id, sec.id, FIGURE_LAYOUTS[part.layout] ? part.layout : 'single', IMAGE_LAYOUTS, 'Layout') +
          imgSelect('data-rd-img-captions', part.id, sec.id, part.captions || 'one', IMAGE_CAPTIONS, 'Captions') +
          partControls(sec, part, i, n) + '</div>' +
        '<div class="rd-imggrid rd-imggrid-' + esc(FIGURE_LAYOUTS[part.layout] ? part.layout : 'single') + '">' + boxes + '</div>' +
        ((part.captions || 'one') === 'one'
          ? '<label class="rd-lab">Caption<input data-rd-img-caption="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '" value="' + esc(part.caption || '') + '" data-rd-live placeholder="What the figure shows"></label>'
          : '') +
        '</div>';
    }

    /** The zoom steps of the page previews, and where each starts. */
    var ZOOMS = [0.4, 0.5, 0.6, 0.8, 1, 1.25, 1.5, 2];
    var ZOOM_FROM = { section: 1, preview: 1, styles: 1 };
    var ZOOM_KEY = { section: 'secZoom', preview: 'prevZoom', styles: 'styleZoom' };
    function zoomOf(which) { return _rd[ZOOM_KEY[which]] || ZOOM_FROM[which]; }
    /**
     * IMG-3: the images the previews draw, read from the folder once and kept while the
     * designer is open: their size (for the layout) and a URL (for the screen).
     */
    var _imageAssets = new Map();
    function imageAsset(path) {
      var a = _imageAssets.get(path);
      if (a) return a;
      var h = H();
      if (!h || !h.images || typeof h.images.read !== 'function') {
        a = { state: 'missing' };
        _imageAssets.set(path, a);
        return a;
      }
      a = { state: 'loading' };
      _imageAssets.set(path, a);
      Promise.resolve().then(function () { return h.images.read(path); }).then(function (bytes) {
        var info = bytes ? IMAGE_INFO(bytes) : null;
        if (!info) { a.state = 'missing'; } else {
          a.state = 'ok'; a.width = info.width; a.height = info.height;
          a.url = (typeof URL !== 'undefined' && URL.createObjectURL && typeof Blob !== 'undefined')
            ? URL.createObjectURL(new Blob([bytes], { type: info.mime })) : null;
        }
      }, function () { a.state = 'missing'; }).then(function () {
        _rd.preview = null;
        if (!_rd.open) return;
        // A read that finishes while someone is typing redraws only the preview, so the caret stays.
        var act = typeof document !== 'undefined' && document.activeElement;
        if (act && act.closest && act.closest('.docgen') && (act.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(act.tagName))) refreshSectionPreview();
        else repaint();
      });
      return a;
    }
    /** The sizes the layout needs for a document's images: loading ones as boxes, missing ones left out. */
    function imageSizes(doc) {
      var out = {};
      FIGURE_SOURCES(doc).forEach(function (src) {
        var a = imageAsset(src);
        if (a.state === 'ok') out[src] = { width: a.width, height: a.height };
        else if (a.state === 'loading') out[src] = { pending: true };
      });
      return out;
    }
    function imageUrl(src) { var a = _imageAssets.get(src); return a && a.state === 'ok' ? a.url : null; }
    /** − 60% + : the zoom buttons for one of the page previews. */
    function zoomBar(which) {
      var k = zoomOf(which);
      return '<span class="rd-zoom">' +
        '<button type="button" data-rd-zoom="out" data-rd-zoom-for="' + which + '" title="Smaller"' + (k <= ZOOMS[0] ? ' disabled' : '') + '>−</button>' +
        '<span class="rd-zoom-n">' + Math.round(k * 100) + '%</span>' +
        '<button type="button" data-rd-zoom="in" data-rd-zoom-for="' + which + '" title="Larger"' + (k >= ZOOMS[ZOOMS.length - 1] ? ' disabled' : '') + '>+</button></span>';
    }

    /**
     * PDF-1: a section previewed as it lands on the page — cut from the whole document's
     * layout, so its numbers, captions, references and page breaks are the real ones, and
     * cropped to the section itself: from its heading to where the next section starts,
     * over as many pages as it runs.
     */
    function sectionPreview(project, block) {
      var p = _rd.preview || (_rd.preview = laidOut(project));
      if (p.error) return '<p class="rd-state">' + esc(p.error) + '</p>';
      var view = outlineNow(project);
      var included = view.resolved.filter(function (r) { return r.included !== false; });
      var at = included.map(function (r) { return r.id; }).indexOf(block.id);
      var mine = at === -1 ? null : p.anchors[included[at].anchor];
      if (!mine) return '<p class="rd-state">' + (at === -1 ? 'This section is not in the document.' : 'This section is not on the page.') + '</p>';
      var end = null;
      for (var i = at + 1; i < included.length && !end; i++) end = p.anchors[included[i].anchor] || null;
      var m = p.style.page.margins, MMPT = 72 / 25.4;
      var bands = [];
      var lastPage = end ? end.page : p.pages.length - 1;
      for (var pg = mine.page; pg <= lastPage; pg++) {
        var page = p.pages[pg];
        var top = pg === mine.page ? Math.max(0, mine.y - 2) : m.top * MMPT - 2;
        var bottom = end && pg === end.page ? end.y - 1 : page.size[1] - m.bottom * MMPT + 2;
        if (bottom - top > 1) bands.push(cropPage(page, top, bottom));
      }
      var k = zoomOf('section');
      var zoom = zoomBar('section');
      var pages = lastPage - mine.page + 1;
      var whole = !!_rd.secWhole;
      var scope = '<span class="rd-scope">' + [['section', 'This section'], ['whole', 'Whole document']].map(function (o) {
        var on = (o[0] === 'whole') === whole;
        return '<button type="button" class="' + (on ? 'on' : '') + '" data-rd-prev-scope="' + o[0] + '" aria-pressed="' + on + '">' + o[1] + '</button>';
      }).join('') + '</span>';
      return '<div class="rd-secprev-head">' + scope + '<span class="rd-state">' + (pages > 1 ? 'Pages ' + (mine.page + 1) + ' to ' + (lastPage + 1) : 'Page ' + (mine.page + 1)) +
        ' of ' + p.pages.length + '.</span>' + zoom + '</div>' +
        // The whole document, opened at this section; or just this section, cut from it.
        '<div class="rd-secprev rd-preview-pages">' + (whole
          ? pagesHtml(p.pages, { scale: k, anchors: p.anchors, here: included[at].anchor, imageUrl: imageUrl })
          : pagesHtml(bands, { scale: k, imageUrl: imageUrl })) + '</div>';
    }

    function metaPane(project) {
      var selId = selectedSubjectId(project);
      if (!selId) return '<p class="rd-state">No ' + esc(noun()) + ' selected.</p>';
      var chosen = (bag(project).meta) || {};
      // Every row the host CAN state, ticked or not — this is the picker, so a row
      // switched off still has to appear in it.
      var rows = H().subject.meta(selId);
      return '<div class="rd-fieldset"><strong>Rows</strong>' +
        rows.map(function (r) {
          var v = String(r.value);
          return '<label class="gen-opt rd-metarow"><input type="checkbox" data-rd-meta="' + esc(r.id) + '"' +
            (chosen[r.id] === false ? '' : ' checked') + ' aria-label="Include ' + esc(r.label) + '"> ' +
            esc(r.label) + '<span class="rd-metaval">' + esc(v.slice(0, 28) + (v.length > 28 ? '…' : '')) + '</span></label>';
        }).join('') + '</div>';
    }

    /** Centring, part by part, in the order the parts sit on the page. */
    function centreTicks(block) {
      var c = block.centre || {};
      var parts = block.kind === 'toc' ? [['heading', 'Centre heading']]
        : block.kind === 'custom' ? [['heading', 'Centre heading'], ['content', 'Centre content']]
        : [['heading', 'Centre heading'], ['intro', 'Centre introduction'], ['table', 'Centre table']];
      return parts.map(function (p) {
        return cb('data-rd-centre-part="' + p[0] + '" data-rd-block="' + esc(block.id) + '"', p[1], c === true || c[p[0]] === true);
      }).join('');
    }

    /** Centre a whole section's body — available to generated and authored alike. */
    function centreToggle(project, block, resolved) {
      /* SEC-4: the per-section page break, greyed out when the LEVEL already makes one.
       *
       * The two are different decisions — a house rule about every H1, against a decision
       * about one section — but they aim at the same thing, and both firing emitted two
       * breaks and therefore a blank page between them. App.doc now suppresses the
       * second; this says so, rather than leaving a tick that visibly does nothing. */
      var lvl = resolved ? resolved.level : null;
      var lvStyle = App.docFormat.resolve(project).text[lvl === App.doc.TITLE_LEVEL ? 'title' : 'h' + lvl];
      var byLevel = !!(lvStyle && lvStyle.pageBreakBefore);
      return '<div class="rd-fieldset"><strong>Centre content</strong><div class="rd-flags">' + centreTicks(block) + '</div></div>' +
        '<div class="rd-fieldset"><strong>Section placement</strong>' +
        cb('data-rd-pagebreak="' + esc(block.id) + '"',
          'Start this section on a new page', byLevel || block.pageBreakBefore === true, byLevel) +
        (byLevel ? '<p class="rd-state">' + esc(levelName(lvl)) + ' starts a new page in this Style.</p>' : '') +
        cb('data-rd-notoc="' + esc(block.id) + '"',
          'Leave this section out of the contents list', block.noToc === true) +
        /* SPC-1: space ABOVE the heading, which is the one gap no part can make \u2014 every
         * part a section has is already below it. With the page break above, this is how
         * a signature page is composed: its own page, and its heading two thirds down. */
        '<label class="rd-mmlab rd-secspace">Start this section <input class="rd-mm" type="number" min="0" max="' +
          App.docStore.MAX_SPACE_MM + '" step="5" value="' + esc(String(App.docStore.mmValue(block.spaceBefore) || '')) +
          '" data-rd-space-block="' + esc(block.id) + '" placeholder="0" aria-label="Millimetres of space above this section"> mm ' +
          'further down the page</label>' +
        '</div>';
    }

    /* TBL-1: the wording of each table a generated section produces.
     *
     * A grouped register produces one table per group. They used to be told apart by a
     * sub-heading carrying the group's declared name \u2014 "Removed", "Disabled", "Kept" \u2014
     * which put the same word on the page three times over and left nothing editable.
     * Those headings are gone, so each table names itself here: a title row above it, a
     * caption under it, and a heading per column, because the same column carries
     * different content in each ("Package" against "Package removed").
     */
    function tableWordingEditor(project, block) {
      var cols = App.docGen.sectionColumns(H(), block, opts());
      if (!cols || !cols.all.length) return '';
      // One editor per table the section will produce: one per group, or — for a
      // section that splits its tables on an axis of its own — one per key the
      // PROVIDER names. The divergence section splits per register, which is a fact
      // about that section and not about documents, so it is the provider that says so.
      var keys = (block.groups || []).filter(function (g) { return g.included; })
        .map(function (g) { return { key: g.value, label: g.label }; });
      var pv = providerFor(block);
      if (!keys.length && pv && typeof pv.tableKeys === 'function') keys = pv.tableKeys();
      if (!keys.length) keys = [{ key: '_all', label: '' }];
      var stored = block.tables || {};
      var body = keys.map(function (k) {
        var e = stored[k.key] || {}, custom = e.columns || {};
        var attrs = 'data-rd-tbl-block="' + esc(block.id) + '" data-rd-tbl-key="' + esc(k.key) + '"';
        return '<div class="rd-tblword">' +
          (k.label ? '<div class="rd-tblword-h">' + esc(k.label) + '</div>' : '') +
          '<label class="rd-lab">Title row' +
            '<input class="rd-title" value="' + esc(e.title || '') + '" ' + attrs + ' data-rd-live data-rd-tbl-field="title"' +
              ' placeholder="Optional \u2014 a row above the column headings" aria-label="Title row"></label>' +
          // CAP-4: the caption box is hidden rather than disabled when there is to be no
          // caption — a box you may type into that will not be printed is a trap.
          (e.noCaption === true
            ? '<p class="rd-state">No caption: this table is not numbered.</p>'
            : '<label class="rd-lab">Caption' +
              '<input class="rd-title" value="' + esc(e.caption || '') + '" ' + attrs + ' data-rd-live data-rd-tbl-field="caption"' +
                ' placeholder="' + esc(String(e.title || '').trim() || block.title || block.label) + '" aria-label="Caption"></label>') +
          cb(attrs + ' data-rd-tbl-nocap', 'No caption', e.noCaption === true) +
          '<div class="rd-grid">' + cols.all.map(function (c) {
            return '<label class="rd-lab rd-lab-s">' + esc(c.label) +
              '<input value="' + esc(custom[c.id] || '') + '" ' + attrs + ' data-rd-live data-rd-tbl-col="' + esc(c.id) + '"' +
                ' placeholder="' + esc(c.label) + '" aria-label="Heading for the ' + esc(c.label) + ' column"></label>';
          }).join('') + '</div></div>';
      }).join('');
      return '<div class="rd-fieldset"><strong title="Blank means the standard wording">Table Headers and Caption</strong>' + body + '</div>';
    }

    /**
     * NAM-1: the name the section list calls this block, when that is not its heading.
     *
     * Offered on every kind of section, because the reason for wanting one \u2014 a heading
     * that is long, or that changes with how the report is being used \u2014 applies just as
     * much to "Deviations from Security Guidelines" as to a hand-written section.
     */
    /* HEADING FIRST, then the name \u2014 the same order a hand-authored section puts them
     * in, because they are the same two questions. A generated section used to ask for
     * the name first, which read as though the name were the primary string and the
     * heading an afterthought; it is the other way round on the page. */
    function nameField(block, dflt) {
      var heading = String(block.title || '').trim();
      return (dflt === undefined ? '' :
          // NAM-2: a generated section has a heading too, and once the name stopped
          // being it there was nowhere to say what it should read.
          '<label class="rd-lab">Heading in the document' +
            '<input class="rd-title" value="' + esc(heading === dflt ? '' : heading) + '" data-rd-live data-rd-sec-heading="' + esc(block.id) + '"' +
              ' placeholder="' + esc(dflt) + '" aria-label="Heading for ' + esc(block.label) + '"></label>' +
          '');
    }

    /** SEC-1: prose between this section's heading and its generated table. */
    function introField(project, block) {
      /* REF-1: the same toolbar a hand-authored paragraph has.
       *
       * An introduction is a paragraph in the same token markup, rendered by the same
       * App.md.runs \u2014 the only thing it was missing was the two buttons, and (until
       * REF-1) a reference resolver at render time, so a link inserted here would not
       * have resolved anyway. Both are fixed together; one without the other is a button
       * that produces "[missing reference]". */
      var refOpen = _rd.refFor === 'intro:' + block.id;
      return '<div class="rd-fieldset"><strong>Introduction</strong>' +
        '<div class="rd-part-head"><span class="rd-tbs">' + toolbar('data-rd-block="' + esc(block.id) + '"') +
          '<button type="button" class="rd-tb" data-rd-ref-open="' + esc('intro:' + block.id) + '"' +
            ' title="Insert a cross-reference that survives renaming and reordering">\ud83d\udd17 Link</button>' +
        '</span></div>' +
        (refOpen ? refMenuFor(project, block.id, 'data-rd-ref-block="' + esc(block.id) + '"') : '') +
        richBox(project, 'data-rd-intro="' + esc(block.id) + '"' +
          ' aria-label="Introduction for ' + esc(block.label) + '"', block.intro, '',
          'Optional. A blank line starts a new paragraph.') +
        hostileHint(block.intro || '') +
        '<span title="The introduction takes the section\'s first number, such as 5.1">' + cb('data-rd-intro-num="' + esc(block.id) + '"', 'Number it', block.introNumbered === true) + '</span>' +
        '</div>';
    }

    /** The categories of a section's settings, by kind. */
    var SEC_CATEGORIES = { heading: 'Heading', placement: 'Placement', introduction: 'Introduction', table: 'Table', rows: 'Rows', content: 'Content' };
    function categoriesFor(block) {
      var ids = block.kind === 'toc' ? ['heading', 'placement']
        : block.kind === 'custom' ? ['heading', 'placement', 'content']
        : ['heading', 'introduction', 'placement'].concat(
            ((App.docGen.sectionColumns(H(), block, opts()) || { all: [] }).all.length ? ['table'] : []),
            block.kind === 'meta' ? ['rows'] : []);
      return ids.map(function (id) { return { id: id, label: SEC_CATEGORIES[id] }; });
    }

    /** Which groups and optional columns a generated section carries (the former ☰ menu). */
    function tableChoices(project, b) {
      var cols = App.docGen.sectionColumns(H(), b, opts());
      var optional = (cols && cols.optional) || [];
      var groups = b.groups || [];
      var out = '';
      if (groups.length) {
        out += '<div class="rd-fieldset"><strong>Groups</strong><div class="rd-ticks">' + groups.map(function (g) {
          return cb('data-rd-dsmap="datasetSections" data-rd-ds="' + esc(b.dsId) + '" data-rd-key="' + esc(g.value) + '"', g.label, g.included);
        }).join('') + '</div></div>';
      }
      if (optional.length) {
        // COL-3: ticked iff the column will actually be there; stored under the key the builder reads.
        var key = App.docGen.sectionColumnKey(H(), b, opts());
        var colOpts = (opts().columns || {})[key] || {};
        out += '<div class="rd-fieldset"><strong>Columns</strong><div class="rd-ticks">' + optional.map(function (c) {
          return cb('data-rd-dsmap="columns" data-rd-ds="' + esc(key) + '" data-rd-key="' + esc(c.id) + '"', c.label, App.report.columnOn(c, colOpts));
        }).join('') + '</div></div>';
      }
      return out;
    }

    /** The fields of one category of a section. */
    function categoryFields(project, view, block, resolved, cat) {
      var sec = block.kind === 'custom' ? customSection(project, block.id) : null;
      if (cat === 'heading') {
        return (sec
          ? '<label class="rd-lab">Heading<input class="rd-title" value="' + esc(sec.title || '') + '" data-rd-live data-rd-sec-title="' + esc(sec.id) + '"' +
              ' placeholder="None: the section is body text" aria-label="Section heading"></label>'
          : nameField(block, block.defaultTitle));
      }
      if (cat === 'placement') return centreToggle(project, block, resolved);
      if (cat === 'introduction') return introField(project, block);
      if (cat === 'rows') return metaPane(project);
      if (cat === 'table') {
        var cols = App.docGen.sectionColumns(H(), block, opts());
        return tableChoices(project, block) + tableWordingEditor(project, block) +
          (cols && cols.all.length ? widthStrip(project, block.id, cols.all, block.widths) : '');
      }
      if (cat === 'content' && sec) {
        var parts = sec.parts || [];
        var body = parts.map(function (p, i) {
          if (p.kind === 'para') return paraEditor(project, sec, p, i, parts.length);
          if (p.kind === 'table') return tableEditor(project, sec, p, i, parts.length);
          if (p.kind === 'rule') return simplePart(sec, p, i, parts.length, 'Horizontal line', 'A rule across the page.');
          if (p.kind === 'space') return spaceEditor(sec, p, i, parts.length);
          if (p.kind === 'image') return imageEditor(project, sec, p, i, parts.length);
          return simplePart(sec, p, i, parts.length, 'Page break', 'Forces what follows onto a new page.');
        }).join('');
        return '<div class="rd-sec-edit"><div class="rd-parts">' + (body || '<p class="rd-state">Nothing in this section yet.</p>') + '</div>' +
          '<div class="rd-addbar">' +
            '<button type="button" data-rd-addpart="para" data-rd-sec="' + esc(sec.id) + '">+ Paragraph</button>' +
            '<button type="button" data-rd-addpart="table" data-rd-sec="' + esc(sec.id) + '">+ Table</button>' +
            '<button type="button" data-rd-addpart="image" data-rd-sec="' + esc(sec.id) + '">+ Image</button>' +
            '<button type="button" data-rd-addpart="rule" data-rd-sec="' + esc(sec.id) + '">+ Line</button>' +
            '<button type="button" data-rd-addpart="space" data-rd-sec="' + esc(sec.id) + '" title="A measured gap down the page">+ Space</button>' +
            '<button type="button" data-rd-addpart="pagebreak" data-rd-sec="' + esc(sec.id) + '">+ Page break</button>' +
            '<span class="spacer"></span>' +
            '<button type="button" data-rd-save-template="' + esc(sec.id) + '" title="Save this section\'s shape for reuse in any project">Save as template&hellip;</button>' +
            '<button type="button" class="danger" data-rd-del-section="' + esc(sec.id) + '">Delete section</button>' +
          '</div></div>';
      }
      return '';
    }

    /**
     * The Sections pane: the chosen section's settings in categories, with the section
     * as it lands on the page beside them. With nothing chosen (or the chosen section
     * gone) it opens the first section; a category the section lacks opens its first.
     */
    function paneSection(project, view) {
      var id = _rd.selected;
      var block = view.blocks.filter(function (b) { return b.id === id; })[0] || view.blocks[0];
      if (!block) return '<p class="rd-state">There are no sections yet.</p>';
      _rd.selected = block.id;
      var resolved = view.resolved.filter(function (r) { return r.id === block.id; })[0];
      var cats = categoriesFor(block);
      var cat = cats.filter(function (c) { return c.id === _rd.secCat; })[0] || cats[0];
      var list = '<nav class="rd-cat-list">' + cats.map(function (c) {
        return '<button type="button" class="rd-cat' + (c.id === cat.id ? ' on' : '') + '" data-rd-sec-cat="' + c.id + '"' +
          (c.id === cat.id ? ' aria-current="true"' : '') + '>' + esc(c.label) + '</button>';
      }).join('') + '</nav>';
      return '<div class="rd-secgrid">' + list +
        '<div class="rd-sec-fields" data-rd-sec-fields><h5>' + esc(block.label) + ' \u2014 ' + esc(cat.label) + '</h5>' +
          categoryFields(project, view, block, resolved, cat.id) + '</div>' +
        '<div class="rd-sec-prev" data-rd-sec-prev>' + sectionPreview(project, block) + '</div></div>';
    }

    /** A number box; with a step, small up and down arrows beside it that move it by the step. */
    function num(label, key, val, hint, step) {
      var box = '<input value="' + esc(val == null ? '' : val) + '" data-rd-fmt="' + esc(key) + '" aria-label="' + esc(label) + '"' + (step ? ' inputmode="decimal"' : '') + '>';
      if (step) {
        box = '<span class="rd-num">' + box + '<span class="rd-steps">' +
          '<button type="button" data-rd-step="+" data-rd-step-key="' + esc(key) + '" data-rd-step-by="' + step + '" aria-label="' + esc(label) + ' up" tabindex="-1">&#9650;</button>' +
          '<button type="button" data-rd-step="-" data-rd-step-key="' + esc(key) + '" data-rd-step-by="' + step + '" aria-label="' + esc(label) + ' down" tabindex="-1">&#9660;</button>' +
          '</span></span>';
      }
      return '<label class="rd-lab rd-lab-s" title="' + esc(hint || '') + '">' + esc(label) + box + '</label>';
    }
    /** A number moved by one step up (+1) or down (−1), kept to the step's decimals. */
    function stepped(value, step, dir) {
      var n = Number(value);
      if (!isFinite(n) || String(value).trim() === '') n = 0;
      var dp = (String(step).split('.')[1] || '').length;
      return Number((n + dir * step).toFixed(dp));
    }
    function pick(label, key, val, options, hint) {
      return '<label class="rd-lab rd-lab-s" title="' + esc(hint || '') + '">' + esc(label) +
        '<select data-rd-fmt="' + esc(key) + '" aria-label="' + esc(label) + '">' +
        options.map(function (o) {
          var v = typeof o === 'string' ? o : o.value, l = typeof o === 'string' ? o : o.label;
          return '<option value="' + esc(v) + '"' + (String(val) === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>';
        }).join('') + '</select></label>';
    }
    var CAPTION_POSITIONS = [
      { value: 'below', label: 'Below the table' },
      { value: 'above', label: 'Above the table' }
    ];
    function flag(label, key, on, hint) {
      return '<label class="gen-opt" title="' + esc(hint || '') + '"><input type="checkbox" data-rd-fmt-bool="' + esc(key) + '"' + (on ? ' checked' : '') + '> ' + esc(label) + '</label>';
    }

    // ======================================================================
    // PDF-1: the Styles pane — every setting of a Style, section by section, with the
    // document laid out beside it, so a change is seen on the page as it is made.
    // ======================================================================

    /** The sections of a Style, in the order the left list shows them. */
    var STYLE_SECTIONS = [
      { id: 'document', label: 'Document' },
      { id: 'page', label: 'Page Setup' },
      { id: 'numbering', label: 'Section Numbering' },
      { id: 'contents', label: 'Contents' },
      { id: 'title', label: 'Title' }, { id: 'h1', label: 'Heading 1' }, { id: 'h2', label: 'Heading 2' },
      { id: 'h3', label: 'Heading 3' }, { id: 'h4', label: 'Heading 4' },
      { id: 'body', label: 'Body' }, { id: 'caption', label: 'Caption' }, { id: 'code', label: 'Code' },
      { id: 'tables', label: 'Tables' },
      { id: 'headerFooter', label: 'Header & Footer' },
      { id: 'marking', label: 'Security Classification' }
    ];
    var FAMILY_LABELS = [{ value: 'helvetica', label: 'Helvetica (sans serif)' }, { value: 'times', label: 'Times (serif)' }, { value: 'courier', label: 'Courier (fixed width)' }];
    var ALIGN_LABELS = [{ value: 'left', label: 'Left' }, { value: 'centre', label: 'Centre' }, { value: 'right', label: 'Right' }, { value: 'justify', label: 'Justified' }];

    /** Preset colours: greys, then main colours, then a pastel of each for light shading. */
    var PALETTE = [
      [['#000000', 'Black'], ['#404040', 'Dark grey'], ['#808080', 'Grey'], ['#bfbfbf', 'Light grey'], ['#f2f2f2', 'Pale grey'], ['#ffffff', 'White']],
      [['#c00000', 'Red'], ['#e46c0a', 'Orange'], ['#ffc000', 'Yellow'], ['#00b050', 'Green'], ['#008080', 'Teal'], ['#0070c0', 'Blue'], ['#1f3864', 'Navy'], ['#7030a0', 'Purple']],
      [['#f4cccc', 'Pastel red'], ['#fce4d6', 'Pastel orange'], ['#fff2cc', 'Pastel yellow'], ['#e2efda', 'Pastel green'], ['#d9f0ef', 'Pastel teal'], ['#ddebf7', 'Pastel blue'], ['#d9e2f3', 'Pastel navy'], ['#e4dfec', 'Pastel purple']]
    ];

    /** A colour: its swatch and code; pressed, the preset swatches, with the full picker behind "More colours…". */
    function colourField(label, key, val) {
      var cur = String(val || '#000000').toLowerCase();
      var open = _rd.colourOpen === key;
      var palette = open
        ? '<div class="rd-palette" role="dialog" aria-label="' + esc(label) + '">' + PALETTE.map(function (row) {
            return '<div class="rd-palrow">' + row.map(function (c) {
              return '<button type="button" data-rd-colour-pick="' + c[0] + '" data-rd-colour-key="' + esc(key) + '" class="rd-sw' + (c[0] === cur ? ' on' : '') + '"' +
                ' style="background:' + c[0] + '" title="' + esc(c[1]) + '" aria-label="' + esc(c[1]) + '"></button>';
            }).join('') + '</div>';
          }).join('') +
          '<label class="rd-more">More colours&hellip;<input type="color" value="' + esc(cur) + '" data-rd-fmt="' + esc(key) + '" aria-label="' + esc(label) + ', any colour"></label>' +
          '</div>'
        : '';
      return '<div class="rd-lab rd-lab-s rd-colour">' + esc(label) +
        '<span class="rd-colour-now"><button type="button" class="rd-swatch-btn" data-rd-colour-open="' + esc(key) + '" style="background:' + esc(cur) + '"' +
          ' aria-expanded="' + open + '" aria-label="' + esc(label) + ': ' + esc(cur) + '. Choose a colour"></button>' +
          '<span class="rd-colour-hex">' + esc(cur) + '</span></span>' + palette + '</div>';
    }
    function flagField(label, key, on) {
      return '<label class="gen-opt"><input type="checkbox" data-rd-fmt-bool="' + esc(key) + '"' + (on ? ' checked' : '') + '> ' + esc(label) + '</label>';
    }

    /** One kind of text: its font, size, weight, slope, colour, alignment, spacing and breaks. */
    function textFields(f, key, opts2) {
      var t = f.text[key], p = 'text.' + key + '.';
      var o = opts2 || {};
      return '<div class="rd-grid">' +
          pick('Font', p + 'family', t.family, FAMILY_LABELS) +
          num('Size (pt)', p + 'size', t.size, '6 to 72 points', 0.5) +
          colourField('Colour', p + 'colour', t.colour) +
          pick('Alignment', p + 'align', t.align, ALIGN_LABELS) +
          num('Line spacing', p + 'lineSpacing', t.lineSpacing, '1 = single, 1.15, 1.5 …', 0.05) +
          num('Space before (pt)', p + 'spaceBefore', t.spaceBefore, '', 1) +
          num('Space after (pt)', p + 'spaceAfter', t.spaceAfter, '', 1) +
        '</div>' +
        '<div class="rd-flags">' +
          flagField('Bold', p + 'bold', t.bold) + flagField('Italic', p + 'italic', t.italic) + flagField('Underline', p + 'underline', t.underline) +
          (o.heading ? flagField('Keep with the next paragraph', p + 'keepWithNext', t.keepWithNext) + flagField('Start a new page', p + 'pageBreakBefore', t.pageBreakBefore) : '') +
        '</div>';
    }

    /**
     * HDR-1: six slots, and a second six for the first page when it is asked to be
     * different — a three-column strip, because what is being decided is a POSITION.
     */
    function hfRow(f, set, label) {
      var hfv = f.headerFooter[set];
      return '<div class="rd-hf"><div class="rd-hf-h">' + esc(label) + '</div>' +
        '<div class="rd-hf-slots">' + ['left', 'centre', 'right'].map(function (s) {
          return '<label class="rd-lab rd-lab-s">' + esc(s === 'centre' ? 'Centre' : s === 'left' ? 'Left' : 'Right') +
            '<input value="' + esc(hfv[s] || '') + '" data-rd-hf-set="' + esc(set) + '" data-rd-hf-slot="' + s + '"' +
              ' title="Filled in on each page: #page, #pages, #title, #platform, #date, #marking" placeholder="e.g. Page #page of #pages"' +
              ' aria-label="' + esc(label + ', ' + s) + '"></label>';
        }).join('') + '</div></div>';
    }

    /** The fields of one section of the Style. */
    function styleSectionFields(project, f, section) {
      if (section === 'document') {
        var d = f.document;
        return '<div class="rd-fieldset"><strong title="For a document that leaves the house: its own numbers, from 1, not the register\'s">Numbering in this document</strong><div class="rd-flags rd-flags-col">' +
            flagField('Number hazards from HAZ-001', 'document.renumberHazards', d.renumberHazards) +
            flagField('Number controls from C-001', 'document.renumberControls', d.renumberControls) +
            flagField('Number references from REF-001', 'document.renumberReferences', d.renumberReferences) +
          '</div></div>';
      }
      if (section === 'page') {
        var m = f.page.margins;
        return '<div class="rd-grid">' +
            pick('Paper', 'page.paper', f.page.paper, [{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }, { value: 'a5', label: 'A5' }, { value: 'legal', label: 'Legal' }]) +
            pick('Orientation', 'page.orientation', f.page.orientation, [{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]) +
            num('Top margin (mm)', 'page.margins.top', m.top, '', 1) + num('Bottom margin (mm)', 'page.margins.bottom', m.bottom, '', 1) +
            num('Left margin (mm)', 'page.margins.left', m.left, '', 1) + num('Right margin (mm)', 'page.margins.right', m.right, '', 1) +
          '</div>';
      }
      if (/^(title|h[1-4])$/.test(section)) return textFields(f, section, { heading: true });
      if (section === 'body' || section === 'caption' || section === 'code') {
        return textFields(f, section);
      }
      if (section === 'tables') {
        var t = f.tables;
        return '<div class="rd-grid">' +
            pick('Borders', 'tables.borders', t.borders, [{ value: 'all', label: 'All lines' }, { value: 'horizontal', label: 'Between rows only' }, { value: 'outer', label: 'Outside only' }, { value: 'none', label: 'None' }]) +
            colourField('Border colour', 'tables.borderColour', t.borderColour) +
            num('Border weight (pt)', 'tables.borderWidth', t.borderWidth, '', 0.25) +
            num('Text size (pt)', 'tables.fontSize', t.fontSize, '', 0.5) +
            num('Cell padding (mm)', 'tables.padding', t.padding, '', 0.5) +
            pick('Table position', 'tables.align', t.align, [{ value: 'left', label: 'Left' }, { value: 'centre', label: 'Centre' }]) +
            pick('Caption', 'tables.captionPosition', t.captionPosition, [{ value: 'below', label: 'Below the table' }, { value: 'above', label: 'Above the table' }]) +
          '</div>' +
          '<div class="rd-fieldset"><strong>Header row</strong><div class="rd-grid">' +
            colourField('Fill', 'tables.header.fill', t.header.fill) + colourField('Text colour', 'tables.header.colour', t.header.colour) +
            num('Text size (pt)', 'tables.header.size', t.header.size, '', 0.5) +
          '</div><div class="rd-flags">' + flagField('Bold', 'tables.header.bold', t.header.bold) + flagField('Italic', 'tables.header.italic', t.header.italic) +
            flagField('Repeat on every page', 'tables.header.repeat', t.header.repeat) + '</div></div>' +
          '<div class="rd-fieldset"><strong>Rows</strong><div class="rd-flags">' + flagField('Shade every other row', 'tables.banding.on', t.banding.on) + '</div>' +
            '<div class="rd-grid">' + colourField('Shade', 'tables.banding.fill', t.banding.fill) + '</div></div>' +
          '<div class="rd-fieldset"><strong>First column</strong><div class="rd-flags">' + flagField('Style the first column', 'tables.firstColumn.on', t.firstColumn.on) +
            flagField('Bold', 'tables.firstColumn.bold', t.firstColumn.bold) + '</div>' +
            '<div class="rd-grid">' + colourField('Fill', 'tables.firstColumn.fill', t.firstColumn.fill) + '</div></div>';
      }
      if (section === 'headerFooter') {
        var first = f.headerFooter.firstDifferent;
        return hfRow(f, 'header', 'Header') + hfRow(f, 'footer', 'Footer') +
          '<div class="rd-flags">' + flagField('A line under the header', 'headerFooter.ruleUnderHeader', f.headerFooter.ruleUnderHeader) +
            flagField('A line over the footer', 'headerFooter.ruleOverFooter', f.headerFooter.ruleOverFooter) + '</div>' +
          '<div class="rd-fieldset"><strong>The first page</strong>' +
            cb('data-rd-hf-first', 'Give the first page its own header and footer', first) +
            (first ? hfRow(f, 'firstHeader', 'First-page header') + hfRow(f, 'firstFooter', 'First-page footer')
              : '') +
          '</div>' +
          '<div class="rd-fieldset"><strong>How the header and footer look</strong>' + textFields(f, 'headerFooter') + '</div>';
      }
      if (section === 'marking') {
        var marking = (project.report || {}).classification;
        var markings = H().classifications || [];
        return '<label class="rd-lab">Security classification for this document <select data-rd-classification aria-label="Security classification">' +
            '<option value=""' + (marking ? '' : ' selected') + '>None</option>' +
            markings.map(function (x) { return '<option value="' + esc(x) + '"' + (x === marking ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') +
          '</select></label>' +
          '<div class="rd-flags">' + flagField('Print the classification on every page', 'marking.show', f.marking.show) + '</div>' +
          textFields(f, 'marking');
      }
      if (section === 'numbering') {
        return '<div class="rd-fieldset"><strong>Heading numbers</strong><div class="rd-flags">' +
            flagField('Number the headings', 'numbering.on', f.numbering.on) + flagField('Show the numbers in the Table of Contents', 'numbering.inToc', f.numbering.inToc) + '</div>' +
            '<div class="rd-grid">' + pick('Number down to', 'numbering.format', f.numbering.format, [{ value: '1', label: '1 (Heading 1)' }, { value: '1.1', label: '1.1 (Heading 2)' }, { value: '1.1.1', label: '1.1.1 (Heading 3)' }]) + '</div></div>' +
          '<div class="rd-fieldset"><strong>Cross-references</strong><div class="rd-flags">' +
            flagField('Add the page in the PDF, as in “Section 2 (page 4)”', 'refs.pageInPdf', f.refs.pageInPdf) + '</div></div>';
      }
      if (section === 'contents') {
        return '<div class="rd-fieldset"><strong>Table of Contents</strong><div class="rd-flags">' +
            flagField('Include a Table of Contents', 'toc.include', f.toc.include) + flagField('Page numbers', 'toc.pageNumbers', f.toc.pageNumbers) +
            flagField('Dot leaders to the page numbers', 'toc.leaders', f.toc.leaders) + '</div>' +
            '<div class="rd-grid">' +
              pick('Headings listed', 'toc.depth', f.toc.depth, [{ value: 1, label: 'Heading 1' }, { value: 2, label: 'Down to heading 2' }, { value: 3, label: 'Down to heading 3' }, { value: 4, label: 'Down to heading 4' }]) + '</div>' +
          '</div>' +
          ['toc1', 'toc2', 'toc3'].map(function (k, i) { return '<div class="rd-fieldset"><strong>Contents level ' + (i + 1) + '</strong>' + textFields(f, k) + '</div>'; }).join('');
      }
      return '';
    }

    function paneStyles(project) {
      var all = App.docFormat.list(project);
      var active = App.docFormat.resolve(project);
      var editId = _rd.fmtId || active.id;
      var f = all.filter(function (x) { return x.id === editId; })[0] || active;
      var builtin = !!f.builtin;
      var section = _rd.styleSection || 'document';

      var head = '<div class="rd-fmt-head">' +
        '<label class="rd-lab">Style in use' +
          '<select data-rd-fmt-active aria-label="Style in use">' +
            all.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === active.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') +
          '</select></label>' +
        '<label class="rd-lab">Editing' +
          '<select data-rd-fmt-edit aria-label="Style being edited">' +
            all.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === f.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') +
          '</select></label>' +
        '<span class="spacer"></span>' +
        '<button type="button" data-rd-fmt-new>Duplicate</button>' +
        '<button type="button" class="danger" data-rd-fmt-del' + (builtin ? ' disabled' : '') + '>Delete</button>' +
        '</div>';
      var locked = builtin
        ? '<div class="rd-locked">The <strong>Standard</strong> style comes with the tool and cannot be changed. <strong>Duplicate</strong> it and change the copy.</div>'
        : '';
      var held = (_rd.held && _rd.held.length)
        ? '<div class="rd-held"><strong>Some values could not be used:</strong><ul>' + _rd.held.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>'
        : '';
      var list = '<nav class="rd-style-list">' + STYLE_SECTIONS.map(function (s) {
        return '<button type="button" class="rd-style-sec' + (s.id === section ? ' on' : '') + '" data-rd-style-section="' + s.id + '"' +
          (s.id === section ? ' aria-current="true"' : '') + '>' + esc(s.label) + '</button>' +
          // Document is about the document as a whole; the rest are about how it looks.
          (s.id === 'document' ? '<hr class="rd-style-divider">' : '');
      }).join('') + '</nav>';
      var label = (STYLE_SECTIONS.filter(function (s) { return s.id === section; })[0] || {}).label || '';
      var fields = '<div class="rd-style-fields"><h5>' + esc(label) + '</h5>' + held +
        '<fieldset class="rd-fmt-body"' + (builtin ? ' disabled' : '') + '>' + styleSectionFields(project, f, section) + '</fieldset></div>';
      // The pages are drawn in the Style being EDITED, so a change is seen before it is put in use.
      var laid = laidOut(project, f);
      var pages = '<div class="rd-style-preview" data-rd-style-preview>' +
        '<div class="rd-secprev-head">' + (laid.error ? '' : '<span class="rd-state">' + laid.pages.length + ' page' + (laid.pages.length === 1 ? '' : 's') + '</span>') + zoomBar('styles') + '</div>' +
        (laid.error
          ? '<p class="rd-err">' + esc(laid.error) + '</p>'
          : '<div class="rd-preview-pages rd-style-pages">' + pagesHtml(laid.pages, { scale: zoomOf('styles'), imageUrl: imageUrl }) + '</div>') + '</div>';
      return head + locked + '<div class="rd-styles">' + list + fields + pages + '</div>';
    }

    /**
     * PDF-1: the document for the selected subject, laid out on pages — what Make PDF
     * will write. `style` overrides the one in use (the Styles pane shows the one being
     * edited). Never throws: a failure is returned as `error`, for the pane to say.
     */
    function laidOut(project, style, tagsOverride) {
      var selId = selectedSubjectId(project);
      if (!selId) return { error: 'No ' + noun() + ' selected.' };
      try {
        var subj = latest().filter(function (c) { return c.id === selId; })[0] || {};
        var o = Object.assign({}, opts(), { subjectId: selId });
        if (tagsOverride) o.tags = tagsOverride;
        // The Style being edited decides the numbering in its own preview.
        if (style) o.numbering = App.docFormat.normalise(style).document;
        var utc = H().clock && H().clock.nowIso ? H().clock.nowIso() : '';
        var built = App.docGen.documentFor(H(), o, { title: subj.label || '', platform: subj.label || '', date: String(utc).slice(0, 10), utc: utc,
          classification: o.classification || (project.report || {}).classification || '' });
        var s = style ? App.docFormat.normalise(style) : built.style;
        if (style) {
          ['header', 'footer', 'firstHeader', 'firstFooter'].forEach(function (k) {
            ['left', 'centre', 'right'].forEach(function (slot) { s.headerFooter[k][slot] = App.docGen.applyTags(s.headerFooter[k][slot], o.tags || {}); });
          });
        }
        var r = layout(built.document, s, { images: imageSizes(built.document) });
        return { document: built.document, style: s, tags: built.tags, pages: r.pages, anchors: r.anchors, headings: r.headings, replaced: r.replaced };
      } catch (e) {
        return { error: 'The pages could not be laid out: ' + (e && e.message) };
      }
    }

    // ======================================================================
    // RD-5: templates (TPL-1..TPL-4)
    // ======================================================================

    function templateList(items, kind, emptyNote) {
      if (!items.length) return '<p class="rd-state">' + esc(emptyNote) + '</p>';
      return '<ul class="rd-tpl-list">' + items.map(function (t) {
        return '<li><span class="rd-tpl-name">' + esc(t.name) + '</span>' +
          (kind === 'sections'
            ? '<button type="button" data-rd-tpl-use="' + esc(t.id) + '" title="Add a new section from this template">Use</button>'
            : '<button type="button" data-rd-rpt-use="' + esc(t.id) + '" title="Replace the current arrangement with this one">Apply</button>') +
          '<button type="button" class="danger" data-rd-tpl-del="' + esc(kind) + '" data-rd-tpl-id="' + esc(t.id) + '" title="Delete this template">✕</button></li>';
      }).join('') + '</ul>';
    }

    function paneTemplates(project) {
      var b = bag(project);
      var profiles = (b.formats || []);
      return '<div class="rd-fieldset"><strong>Styles</strong>' +
          (profiles.length
            ? '<ul class="rd-tpl-list">' + profiles.map(function (f) {
                return '<li><span class="rd-tpl-name">' + esc(f.name) + '</span></li>';
              }).join('') + '</ul>'
            : '<p class="rd-state">Only the built-in Standard style so far.</p>') +
          '<div class="rd-addbar">' +
            '<button type="button" data-rd-export="formats"' + (profiles.length ? '' : ' disabled') + '>Export</button>' +
            '<label class="rd-filebtn" title="An import never deletes what you have; a clash of names asks which to keep">Import<input type="file" accept=".json,application/json" data-rd-import="formats"></label>' +
          '</div></div>' +
        '<div class="rd-fieldset"><strong>Section templates</strong>' +
          templateList(b.sectionTemplates || [], 'sections', 'No section templates yet.') +
          '<div class="rd-addbar">' +
            '<button type="button" data-rd-export="sections"' + ((b.sectionTemplates || []).length ? '' : ' disabled') + '>Export</button>' +
            '<label class="rd-filebtn" title="An import never deletes what you have; a clash of names asks which to keep">Import<input type="file" accept=".json,application/json" data-rd-import="sections"></label>' +
          '</div></div>' +
        '<div class="rd-fieldset"><strong>Report templates</strong>' +
          templateList(b.reportTemplates || [], 'reports', 'No report templates yet.') +
          '<div class="rd-addbar">' +
            '<button type="button" class="primary" data-rd-rpt-save>Save current design&hellip;</button>' +
            '<button type="button" data-rd-export="reports"' + ((b.reportTemplates || []).length ? '' : ' disabled') + '>Export</button>' +
            '<label class="rd-filebtn" title="An import never deletes what you have; a clash of names asks which to keep">Import<input type="file" accept=".json,application/json" data-rd-import="reports"></label>' +
          '</div></div>';
    }

    /** TPL-3: the conflict resolver, shown over the workspace while a merge is pending. */
    function renderConflict() {
      var c = _rd.conflict;
      if (!c) return '';
      var K = App.docTemplates.KINDS[c.kindKey];
      var rows = c.plan.conflicts.map(function (x) {
        var key = App.docTemplates._norm(x.incoming.name);
        var choice = c.decisions[key] || 'keep';
        return '<li><span class="rd-tpl-name">' + esc(x.incoming.name) + '</span>' +
          '<label class="rd-radio"><input type="radio" name="cf-' + esc(key) + '" data-rd-cf="' + esc(key) + '" value="keep"' + (choice === 'keep' ? ' checked' : '') + '> Keep mine</label>' +
          '<label class="rd-radio"><input type="radio" name="cf-' + esc(key) + '" data-rd-cf="' + esc(key) + '" value="replace"' + (choice === 'replace' ? ' checked' : '') + '> Use imported</label>' +
          '</li>';
      }).join('');
      return '<div class="modal-overlay" id="rd-conflict-host">' +
        '<div class="modal" role="dialog" aria-modal="true" aria-label="Resolve import conflicts">' +
        '<div class="modal-head"><div><h3>' + esc(K.label) + ' — name conflicts</h3>' +
          '<div class="modal-sub">' + c.plan.additions.length + ' will be added. ' + c.plan.conflicts.length +
          ' already exist' + (c.plan.conflicts.length === 1 ? 's' : '') + ' under the same name — choose which to keep.</div></div>' +
          '<button type="button" class="modal-close" data-rd-cf-cancel aria-label="Cancel">×</button></div>' +
        '<div class="modal-body"><ul class="rd-tpl-list rd-cf-list">' + rows + '</ul></div>' +
        '<div class="modal-foot">' +
          '<button type="button" data-rd-cf-all="keep">Keep all mine</button>' +
          '<button type="button" data-rd-cf-all="replace">Replace all</button>' +
          '<span class="spacer"></span>' +
          '<button type="button" data-rd-cf-cancel>Cancel</button>' +
          '<button type="button" class="primary" data-rd-cf-apply>Import</button>' +
        '</div></div></div>';
    }

    // ======================================================================
    // GEN-TAB: the Generate pane
    // ======================================================================

    /**
     * The last pane, and the only one that writes a file.
     *
     * Every `/[Tag]` written anywhere in the document is listed with a box beside it, so
     * the same design can be issued repeatedly with a new date, a new author, a new
     * reference number; and the characters the PDF's fonts cannot show are named before
     * anything is made.
     *
     * The tag list is read off the FINISHED document, which is why this pane builds one
     * to draw itself. That is the only way the list can be complete: a tag in a footer
     * slot, in a column heading and in a paragraph all arrive in the same string in the
     * end, and nothing short of the end sees all three.
     */
    function paneGenerate(project, view) {
      var selId = selectedSubjectId(project);
      if (!selId) return '<p class="rd-state">No ' + esc(noun()) + ' selected.</p>';
      var ready = H().subject.ready(selId);
      var o = opts();
      // Laid out with no values, so every tag written anywhere is found, and the characters
      // the standard fonts cannot show are known before anything is made.
      var laid = laidOut(project, null, {});
      var tags = laid.error ? [] : laid.tags;
      var replaced = laid.error ? [] : laid.replaced;
      var missingImgs = [];
      if (!laid.error) (laid.document.blocks || []).forEach(function (b) {
        if (b.kind === 'figure') (b.images || []).forEach(function (im) {
          if (im && imageAsset(im.src).state === 'missing' && missingImgs.indexOf(im.name) === -1) missingImgs.push(im.name);
        });
      });
      var values = o.tags || {};
      var unfilled = tags.filter(function (t) { return !String(values[t] || '').trim(); });

      var tagRows = tags.length
        ? tags.map(function (t) {
            var v = String(values[t] || '');
            return '<label class="rd-lab rd-tagrow"><code>/[' + esc(t) + ']</code>' +
              '<input value="' + esc(v) + '" data-rd-tag="' + esc(t) + '"' +
                ' placeholder="What should this read?" aria-label="Value for the ' + esc(t) + ' tag"></label>';
          }).join('')
        : '<p class="rd-state">None yet. Write <code>/[Date]</code> in any text to add one.</p>';

      return '<div class="rd-fieldset"><strong title="Each /[Tag] in the document is replaced by what you write here; one left blank prints as it stands.">Placeholders</strong>' +
          tagRows +
          (unfilled.length
            ? '<p class="rpt-omit"><strong>' + unfilled.length + '</strong> placeholder' + (unfilled.length === 1 ? '' : 's') +
              ' still to fill in: ' + unfilled.map(function (t) { return '<code>/[' + esc(t) + ']</code>'; }).join(' ') + '</p>'
            : (tags.length ? '<p class="rpt-omit muted">Every placeholder has a value.</p>' : '')) +
        '</div>' +
        (replaced.length
          ? '<div class="rd-fieldset rd-replaced"><strong title="The PDF\'s standard fonts write these another way (≥ as >=, ✓ as Yes) or as ?. The HTML shows them as they are.">Characters the PDF cannot show</strong>' +
              '<p>' + replaced.map(function (c) { return '<code>' + esc(c) + '</code>'; }).join(' ') + '</p></div>'
          : '') +
        (missingImgs.length
          ? '<div class="rd-fieldset rd-replaced"><strong title="These show as a grey box until the file is back in the folder">Images missing from the folder</strong>' +
              '<p>' + missingImgs.map(function (n) { return '<code>' + esc(n) + '</code>'; }).join(' ') + '</p></div>'
          : '') +
        '<div class="rd-fieldset"><strong>Make the report</strong>' +
          (ready ? '' : '<p class="rd-state">This ' + esc(noun()) + ' is not ready.</p>') +
          (laid.error ? '<p class="rd-err">' + esc(laid.error) + '</p>' : '') +
          '<div class="rd-addbar">' +
            // The HOST wires these ([data-generate-action], reading data-generate-format):
            // where a file goes is its business, not the designer's.
            '<button type="button" class="primary" data-generate-action="document" data-generate-format="pdf"' + (ready ? '' : ' disabled') + '>Make PDF</button>' +
            '<button type="button" data-generate-action="document" data-generate-format="html"' + (ready ? '' : ' disabled') + '>Make HTML</button>' +
          '</div>' +
        '</div>';
    }

    // ======================================================================
    // RD-6: the preview
    // ======================================================================

    function panePreview(project) {
      var p = _rd.preview || (_rd.preview = laidOut(project));
      if (p.error) return '<div class="rd-preview"><p class="rd-state">' + esc(p.error) + '</p></div>';
      var nav = (p.headings || []).map(function (o) {
        return '<a class="rd-nav rd-nav-' + Math.max(1, o.level) + '" href="#' + esc(o.anchor) + '" data-prv-jump="' + esc(o.anchor) + '">' + esc(o.title) + '</a>';
      }).join('');
      return '<div class="rd-preview">' +
        '<div class="rd-addbar"><button type="button" data-rd-refresh-preview>↻ Refresh</button>' +
          '<span class="rd-state">' + p.pages.length + ' page' + (p.pages.length === 1 ? '' : 's') + '</span>' +
          zoomBar('preview') + '</div>' +
        '<div class="rd-preview-body">' +
          '<nav class="rd-preview-nav">' + (nav || '<span class="rd-state">No sections.</span>') + '</nav>' +
          '<article class="rd-preview-doc rd-preview-pages" id="rd-preview-doc">' + pagesHtml(p.pages, { scale: zoomOf('preview'), anchors: p.anchors, imageUrl: imageUrl }) + '</article>' +
        '</div></div>';
    }

    // ======================================================================
    // assembly
    // ======================================================================

    function inner(project) {
      var selId = selectedSubjectId(project);
      var subj = latest().filter(function (c) { return c.id === selId; })[0];
      var ready = selId ? H().subject.ready(selId) : false;
      var view = outlineNow(project);
      var included = view.blocks.filter(function (b) { return b.included; }).length;
      var paneBody =
        _rd.pane === 'section' ? paneSection(project, view) :
        _rd.pane === 'styles' ? paneStyles(project) :
        _rd.pane === 'templates' ? paneTemplates(project) :
        _rd.pane === 'generate' ? paneGenerate(project, view) :
        panePreview(project);

      var tabs = PANES.map(function (p) {
        return '<button type="button" class="rd-tab' + (_rd.pane === p.id ? ' on' : '') + '" data-rd-pane="' + p.id + '"' +
          (_rd.pane === p.id ? ' aria-current="true"' : '') + '>' + esc(p.label) + '</button>';
      }).join('');

      return '<div class="modal modal-full" role="dialog" aria-modal="true" aria-label="Report Design">' +
        '<div class="modal-head"><div><h3>Report Design</h3>' +
          '<div class="modal-sub">' + (subj ? subjectPicker(selId) : 'No ' + esc(noun()) + ' selected.') + '</div></div>' +
          '<button type="button" class="modal-close" data-rd-close aria-label="Close">×</button></div>' +
        '<div class="modal-body"><div class="rpt-body rd-layout">' +
          // The section list belongs to the Sections tab; the other tabs have the width.
          (_rd.pane === 'section'
            ? renderSectionList(project, view) +
              '<div class="rd-split" data-rd-split role="separator" aria-orientation="vertical" aria-label="Drag to widen or narrow the Sections list" title="Drag to resize"></div>'
            : '') +
          '<div class="rd-right"><div class="rd-tabs">' + tabs + '</div>' +
            '<div class="rpt-pane rd-pane">' + paneBody + '</div></div>' +
        '</div></div>' +
        '<div class="modal-foot">' +
          '<span class="foot-summary">' + included + ' of ' + view.blocks.length + ' section' + (view.blocks.length === 1 ? '' : 's') + ' included' +
            ' &middot; ' + esc(view.profile.name) +
            (ready ? '' : ' &middot; ' + esc(noun()) + ' not ready') + '</span>' +
          '<span class="spacer"></span>' +
          '<button type="button" data-rd-reset-order title="Put the sections back in the order the platform declares them">Reset order</button>' +
          // GEN-TAB: the Generate button has moved to the Generate pane, where the file
          // is named and the placeholders are filled in. A button that writes a file
          // sitting in the footer of every pane meant it could be pressed from five
          // screens away from the two things that decide what it writes.
          '<button type="button" data-rd-close>Close</button>' +
        '</div></div>' + renderConflict();
    }

    /** Which of the host's subjects (for PIVOT, which platform) the report is about. */
    function subjectPicker(selId) {
      var n = noun();
      return '<select data-rd-subject aria-label="' + esc(n.charAt(0).toUpperCase() + n.slice(1)) + '" class="rd-subject">' +
        latest().map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === selId ? ' selected' : '') + '>' + esc(c.label) + '</option>'; }).join('') +
        '</select>';
    }

    /** @returns {string} the workspace, or '' when closed. */
    function render(project) {
      if (!_rd.open || !project || !H()) return '';
      return '<div class="modal-overlay overlay-full" id="rd-modal-host" data-rd-modal>' + inner(project) + '</div>';
    }

    /**
     * Repaint in place, keeping the body's scroll position.
     *
     * Same reasoning as PRO-3 and the old RPT-4 modal: a tick changes numbering and the
     * footer summary, so the workspace genuinely has to be redrawn — but the page
     * behind it has not changed, and routing this through the app's full re-render
     * threw away where you were in a long section list on every click.
     * @returns {boolean} false when the workspace is not open (caller falls back)
     */
    /* Replacing the workspace removes the box that has focus, which fires its save, which
     * asks for another redraw while this one is still writing. That one waits its turn. */
    var _painting = false, _paintAgain = false;
    function refresh() {
      var host = document.getElementById('rd-modal-host');
      if (!host) return false;
      var project = App.docHost.get().getState(); if (!project) return false;
      if (!H()) return false;
      if (_painting) { _paintAgain = true; return true; }
      _painting = true;
      try { paintInto(host, project); } finally { _painting = false; }
      if (_paintAgain) { _paintAgain = false; setTimeout(repaint, 0); }
      return true;
    }
    function paintInto(host, project) {
      var body = host.querySelector('.modal-body');
      var top = body ? body.scrollTop : 0;
      var pane = host.querySelector('.rd-pane');
      var paneTop = pane ? pane.scrollTop : 0;
      host.innerHTML = inner(project);
      var again = host.querySelector('.modal-body');
      if (again) again.scrollTop = top;
      var pane2 = host.querySelector('.rd-pane');
      if (pane2) pane2.scrollTop = paneTop;
      scrollToHere();
      showFormats();
    }
    /* Leaving a text box saves it and redraws — on the press of whatever was clicked
     * next. Redrawn then, the button under the pointer is a new one by the release, and
     * the click is lost. So a redraw asked for while a button is held waits for the
     * release; the click's own handler then runs on the button that was pressed. */
    var _gate = { pressing: false, pending: false };
    /** Whether a press holds redraws: a plain left press on something other than a form
     *  field. A drop-down or a right-click opens a menu that can eat the release. */
    function holds(e) {
      return e.button === 0 && !(e.target && e.target.closest && e.target.closest('select, input, textarea, [contenteditable]'));
    }
    /** Every event that ends a press, whatever became of it. */
    var RELEASE_ON = ['pointerup', 'pointercancel', 'dragend', 'drop', 'click', 'contextmenu'];
    function repaint() {
      if (_gate.pressing) { _gate.pending = true; return; }
      if (!refresh() && _ctx) _ctx.refreshMain();
    }
    function quietly(fn) { if (_ctx && _ctx.quietEdit) _ctx.quietEdit(fn); else fn(); }
    /** Any project write invalidates the cached preview — it is a render of the project. */
    function dirty() { _rd.preview = null; _rd.refs = null; }

    /** RPT-3: persist a reorder — move one block id by a step, or before another. */
    function moveSection(project, id, delta, beforeId) {
      var ids = App.docGen.reportBlocks(H(), opts()).map(function (b) { return b.id; });
      var from = ids.indexOf(id);
      if (from === -1) return;
      var to;
      if (beforeId != null) {
        ids.splice(from, 1);
        var at = ids.indexOf(beforeId);
        to = at === -1 ? ids.length : at;
        ids.splice(to, 0, id);
      } else {
        to = from + delta;
        if (to < 0 || to >= ids.length) return;
        ids.splice(from, 1);
        ids.splice(to, 0, id);
      }
      App.docStore.setReportOrder(ids);
    }

    function logIssues(res) {
      ((res && res.issues) || []).forEach(function (i) { App.docHost.log(i); });
      return res;
    }

    // ---- import / export ------------------------------------------------------

    function doExport(kindKey) {
      var project = App.docHost.get().getState(); if (!project) return;
      var f = App.docTemplates.exportFile(project, kindKey, null);
      if (!f.count) { App.docHost.log({ severity: 'warning', message: 'Nothing to export.' }); return; }
      App.util.dom.download(new Blob([f.text], { type: 'application/json' }), f.name);
      App.docHost.log({ severity: 'success', message: 'Exported ' + f.count + ' ' + App.docTemplates.KINDS[kindKey].label.toLowerCase() + ' to ' + f.name });
    }

    function doImport(kindKey, file) {
      App.util.dom.readFileText(file).then(function (text) {
        var parsed = App.docTemplates.parseImport(text, kindKey);
        parsed.issues.forEach(function (i) { App.docHost.log(i); });
        if (!parsed.ok) { repaint(); return; }
        var project = App.docHost.get().getState();
        var plan = App.docTemplates.plan(project, kindKey, parsed.items);
        if (!plan.conflicts.length) {
          var res = App.docTemplates.apply(plan, {});
          dirty();
          App.docHost.log({ severity: 'success', message: 'Imported ' + res.added + ' ' + App.docTemplates.KINDS[kindKey].label.toLowerCase() + '.' });
          repaint();
          return;
        }
        // TPL-3: nothing is written until every collision has an answer.
        _rd.conflict = { kindKey: kindKey, plan: plan, decisions: {} };
        repaint();
      }).catch(function (e) {
        App.docHost.log({ severity: 'error', message: 'Could not read that file: ' + (e && e.message) });
      });
    }

    function applyConflict() {
      var c = _rd.conflict; if (!c) return;
      var res = App.docTemplates.apply(c.plan, c.decisions);
      dirty();
      App.docHost.log({
        severity: 'success',
        message: 'Imported ' + App.docTemplates.KINDS[c.kindKey].label.toLowerCase() + ': ' +
          res.added + ' added, ' + res.replaced + ' replaced, ' + res.kept + ' kept.'
      });
      _rd.conflict = null;
      repaint();
    }

    // ---- rich-text token insertion -------------------------------------------

    /* -------------------------------------------------------------------------
     * RTX-1: what a toolbar button acts on, now that the box is not a textarea.
     *
     * REF-1: a reference is the interesting case, because it has two shapes.
     *   * with a selection: `{{ref:ID}}the selected words{{/ref}}` — the words become
     *     the link text, which is what someone who highlighted them meant.
     *   * without one: `{{refn:ID}}` and friends, which render as the target's own
     *     number / title / full label at render time.
     * `br` is a marker and never wraps anything; bold/italic/code always wrap.
     *
     * The selection a button is about to act on used to be two character offsets into a
     * textarea's value. It is now two offsets into the box's TOKENS — computed by
     * App.ui.richText, which walks the DOM the box actually holds — and that is what
     * makes the rest of this work unchanged: a pair of numbers into a string survives
     * the workspace repainting, and the box being destroyed and rebuilt, which is
     * exactly what opening the reference menu does.
     *
     * `mousedown` on the buttons is still prevented, so focus never leaves the box.
     *
     * RTX-2: `_sel` also answers "WHICH box" — a table part has one per cell, and the
     * one row of buttons above them acts on whichever was last written in.
     * ---------------------------------------------------------------------- */
    var RT = App.ui.richText;
    var _sel = null;

    /** A selector that finds this box again after the workspace has repainted. */
    function boxKey(el) {
      if (!el || !el.getAttribute) return '';
      if (el.hasAttribute('data-rd-text')) return '[data-rd-text="' + el.getAttribute('data-rd-text') + '"]';
      if (el.hasAttribute('data-rd-intro')) return '[data-rd-intro="' + el.getAttribute('data-rd-intro') + '"]';
      if (el.hasAttribute('data-rd-cell')) {
        return '[data-rd-cell="' + el.getAttribute('data-rd-cell') + '"]' +
          '[data-rd-row="' + el.getAttribute('data-rd-row') + '"]' +
          '[data-rd-col="' + el.getAttribute('data-rd-col') + '"]';
      }
      return '';
    }

    /** Where writing in this box is saved. One place, so every surface commits alike. */
    function boxSaver(el) {
      var sec = el.getAttribute('data-rd-sec');
      if (el.hasAttribute('data-rd-text')) {
        var part = el.getAttribute('data-rd-text');
        return function (next) { return App.docStore.updatePart(sec, part, { text: next }); };
      }
      if (el.hasAttribute('data-rd-intro')) {
        var block = el.getAttribute('data-rd-intro');
        return function (next) { return App.docStore.setBlockIntro(block, next); };
      }
      if (el.hasAttribute('data-rd-cell')) {
        var tbl = el.getAttribute('data-rd-cell');
        var row = Number(el.getAttribute('data-rd-row')), col = Number(el.getAttribute('data-rd-col'));
        return function (next) { return App.docStore.setCell(sec, tbl, row, col, next); };
      }
      return function () { return { ok: true, issues: [] }; };
    }

    /** The store write a live box makes, without any repaint: the same calls its change/blur handler makes. */
    function liveSave(el) {
      if (el.hasAttribute('data-rd-rich')) return boxSaver(el)(RT.fromNode(el));
      if (el.hasAttribute('data-rd-sec-heading')) return App.docStore.setBlockHeading(el.getAttribute('data-rd-sec-heading'), el.value);
      if (el.hasAttribute('data-rd-sec-title')) return App.docStore.updateSection(el.getAttribute('data-rd-sec-title'), { title: el.value });
      if (el.hasAttribute('data-rd-img-caption')) return App.docStore.updatePart(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-img-caption'), { caption: el.value });
      if (el.hasAttribute('data-rd-img-capk')) return App.docStore.setPartImageField(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-part'), Number(el.getAttribute('data-rd-img-k')), 'caption', el.value);
      if (el.hasAttribute('data-rd-tbl-block')) {
        var block = el.getAttribute('data-rd-tbl-block'), key = el.getAttribute('data-rd-tbl-key'), col = el.getAttribute('data-rd-tbl-col');
        return col ? App.docStore.setTableColumnLabel(block, key, col, el.value)
          : App.docStore.setTableText(block, key, el.getAttribute('data-rd-tbl-field'), el.value);
      }
      return { ok: true, issues: [] };
    }
    /** Redraw the Sections pane's preview column alone, so focus and the caret stay where they are. */
    function refreshSectionPreview() {
      var col = document.querySelector('[data-rd-sec-prev]');
      var project = App.docHost.get() && App.docHost.get().getState();
      if (!col || !project) return;
      var view = outlineNow(project);
      var block = view.blocks.filter(function (b) { return b.id === _rd.selected; })[0];
      if (block) col.innerHTML = sectionPreview(project, block);
      scrollToHere();
    }
    /** In the whole-document preview, bring the selected section's start into view. */
    function scrollToHere() {
      var box = document.querySelector('[data-rd-sec-prev]');
      var here = box && box.querySelector('[data-rd-here]');
      if (!here) return;
      var head = box.querySelector('.rd-secprev-head');
      box.scrollTop += here.getBoundingClientRect().top - box.getBoundingClientRect().top - (head ? head.offsetHeight : 0) - 8;
    }

    /** Which of bold, italic and code apply at a node inside a box: b, i, c, in that order. */
    function formatsAt(node, box) {
      var on = {};
      for (var n = node; n && n !== box; n = n.parentNode) {
        var name = n.nodeName;
        if (name === 'STRONG' || name === 'B') on.b = true;
        if (name === 'EM' || name === 'I') on.i = true;
        if (name === 'CODE') on.c = true;
        if (!n.parentNode) return [];           // walked out without meeting the box
      }
      return ['b', 'i', 'c'].filter(function (k) { return on[k]; });
    }
    /** Light the toolbar buttons for the formatting where the cursor is in the focused box. */
    function showFormats() {
      if (typeof document === 'undefined') return;
      var box = document.activeElement && document.activeElement.closest ? document.activeElement.closest('[data-rd-rich]') : null;
      var sel = window.getSelection && window.getSelection();
      var on = box && sel && sel.anchorNode && box.contains(sel.anchorNode) ? formatsAt(sel.anchorNode, box) : [];
      var scope = box ? (box.closest('.rd-part, .rd-fieldset') || box.parentNode) : null;
      Array.prototype.forEach.call(document.querySelectorAll('[data-rd-wrap].on'), function (b) { if (!scope || !scope.contains(b)) { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); } });
      if (!scope) return;
      Array.prototype.forEach.call(scope.querySelectorAll('[data-rd-wrap]'), function (b) {
        var k = b.getAttribute('data-rd-wrap');
        if (k === 'br') return;
        var lit = on.indexOf(k) !== -1;
        b.classList.toggle('on', lit);
        b.setAttribute('aria-pressed', lit ? 'true' : 'false');
      });
    }

    /** The document's reference resolver, for re-rendering a box after an edit. */
    function boxHtml(tokens) {
      var p = App.docHost.get().getState();
      return RT.toHtml(tokens, { resolveRef: p && H() ? refResolver(p) : null });
    }

    /** Remember where the caret is, in tokens, so a repaint cannot take it away. */
    function noteSelection(el) {
      var key = boxKey(el);
      if (!key) return;
      var at = RT.selectionIn(el, window.getSelection());
      _sel = { key: key, start: at ? at.start : 0, end: at ? at.end : 0 };
    }

    /** The box in this button's group that the caret is actually in, if any. */
    function liveBox(btn) {
      var host = btn && btn.closest ? btn.closest('.rd-part, .rd-fieldset') : null;
      var sel = window.getSelection();
      if (!host || !sel || !sel.rangeCount) return null;
      var n = sel.getRangeAt(0).startContainer;
      while (n && n !== host) {
        if (n.nodeType === 1 && n.hasAttribute && n.hasAttribute('data-rd-rich')) return host.contains(n) ? n : null;
        n = n.parentNode;
      }
      return null;
    }

    /** The box a toolbar button belongs to: the one last written in, else the first. */
    function boxFor(btn) {
      if (_sel) {
        var remembered = document.querySelector(_sel.key);
        if (remembered && btn && btn.closest && btn.closest('.rd-part, .rd-fieldset') &&
            btn.closest('.rd-part, .rd-fieldset').contains(remembered)) return remembered;
      }
      var host = btn && btn.closest ? btn.closest('.rd-part, .rd-fieldset') : null;
      return host ? host.querySelector('[data-rd-rich]') : null;
    }

    function insertToken(el, tag) {
      if (!el) return;
      var text = RT.fromNode(el);
      var s = 0, e = 0;
      var live = RT.selectionIn(el, window.getSelection());
      if (live) { s = live.start; e = live.end; }
      // The box may have been rebuilt since the selection was made (the reference menu
      // repaints), so the remembered offsets are the authority when they are for it.
      if (_sel && el.matches && el.matches(_sel.key) && (!live || _sel.end > _sel.start)) {
        s = _sel.start; e = _sel.end;
      }
      if (s < e && (tag === 'b' || tag === 'i' || tag === 'c')) {
        // A selection: on if any of it lacks the style, off if all of it has it.
        var t = RT.toggleFormat(text, s, e, tag);
        quietly(function () { logIssues(boxSaver(el)(t.text)); });
        dirty();
        el.innerHTML = boxHtml(t.text);
        _sel = { key: boxKey(el), start: t.start, end: t.end };
        RT.placeSelection(el, t.start, t.end, window);
        showFormats();
        return;
      }
      var res = RT.applyToken(text, s, e, tag);
      var save = boxSaver(el);
      quietly(function () { logIssues(save(res.text)); });
      dirty();
      // Re-rendered in place rather than by a repaint: a repaint would rebuild the whole
      // workspace and throw the caret away, which is the thing this is trying to keep.
      el.innerHTML = boxHtml(res.text);
      // The caret is remembered as well as placed, so a button pressed straight after —
      // Link, most often — acts where the last one left off rather than at the start.
      _sel = { key: boxKey(el), start: res.caret, end: res.caret };
      RT.placeCaret(el, res.caret, window);
      // Nothing was selected: the button opened an empty bold/italic/code run. A browser
      // types beside an empty element, not in it, so it is given a placeholder to hold
      // the caret, and what is typed next is in that style.
      if (s === e && (tag === 'b' || tag === 'i' || tag === 'c')) {
        var empty = Array.prototype.filter.call(el.querySelectorAll('strong, b, em, i, code'), function (n) { return !n.textContent; })[0];
        if (empty) {
          var hold = document.createTextNode('\u200B');
          empty.appendChild(hold);
          var r = document.createRange();
          r.setStart(hold, 1); r.collapse(true);
          var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
          showFormats();
        }
      }
    }

    /** RTX-1: one entry point for all three surfaces — the button says which box. */
    function wrapSelection(btn, tag) {
      var el = boxFor(btn);
      if (el && endFormat(el, tag)) return;
      insertToken(el, tag);
    }

    /**
     * A lit B, I or code pressed with nothing selected: the style ends at the caret, so
     * what is typed next is plain. Mid-run, the run is split there; either way the caret
     * is given a placeholder outside it to type into. False when it does not apply.
     */
    function endFormat(el, tag) {
      var names = { b: ['STRONG', 'B'], i: ['EM', 'I'], c: ['CODE'] }[tag];
      var sel = window.getSelection();
      if (!names || !sel || !sel.rangeCount || !sel.isCollapsed || !el.contains(sel.anchorNode)) return false;
      var run = null;
      for (var n = sel.anchorNode; n && n !== el; n = n.parentNode) if (names.indexOf(n.nodeName) !== -1) run = n;
      if (!run) return false;
      // What follows the caret inside the run moves to a run of its own after it.
      var rest = document.createRange();
      rest.setStart(sel.anchorNode, sel.anchorOffset);
      rest.setEndAfter(run.lastChild || run);
      var tail = rest.extractContents();
      var hold = document.createTextNode('\u200B');
      run.parentNode.insertBefore(hold, run.nextSibling);
      if (tail.textContent) {
        var again = run.cloneNode(false);
        again.appendChild(tail);
        run.parentNode.insertBefore(again, hold.nextSibling);
      }
      if (!run.textContent) run.parentNode.removeChild(run);
      var r = document.createRange();
      r.setStart(hold, 1); r.collapse(true);
      sel.removeAllRanges(); sel.addRange(r);
      quietly(function () { logIssues(boxSaver(el)(RT.fromNode(el))); });
      dirty();
      showFormats();
      return true;
    }

    // ======================================================================
    // wiring
    //
    // wire(ctx) binds every event handler in the workspace. It used to be one
    // 680-line function — the whole thing in one body, on the line-cap allowlist
    // because no file boundary can cut a function in half. It is now five
    // per-concern helpers, one per fragment beside this one, each handed the same
    // small bag of shared closures. Nothing else changed: the handlers were moved
    // verbatim, in the order they were registered.
    // ======================================================================

    /** The closures every wiring helper needs: the delegation root, the DOM helper,
     *  and the project accessor. Everything else a handler reaches for — dirty,
     *  repaint, quietly, logIssues, the drag state — is declared at the module's
     *  own level and already in scope in every fragment of this block. */
    function wireHelpers(ctx) {
      return {
        ctx: ctx,
        dom: App.util.dom,
        P: function () { return App.docHost.get().getState(); }
      };
    }

    function wire(ctx) {
      _ctx = ctx;
      // doc-designer.css is scoped under .docgen, so the host page keeps its own styles.
      if (ctx && ctx.root && ctx.root.classList) ctx.root.classList.add('docgen');
      var h = wireHelpers(ctx);
      wireShell(h);
      wireSections(h);
      wireText(h);
      wireTables(h);
      wireFormatting(h);
    }

    // ======================================================================
    // wiring: wireShell
    //
    // The workspace itself: opening and closing it, which pane is showing, which
    // section is selected — plus the two things that are ways of LOOKING at the
    // document rather than changes to it, the preview controls and the import
    // conflict dialogue.
    //
    // Called by wire(ctx) in 070-wire.js with the shared helper bag. Split out of
    // that one function so no file in this block sits over the 500-line cap; the
    // handlers themselves are unchanged.
    // ======================================================================

    function wireShell(h) {
      var dom = h.dom, ctx = h.ctx;

      var holdTimer = null;
      ctx.root.addEventListener('pointerdown', function (e) {
        if (!holds(e)) return;
        _gate.pressing = true;
        // However the press ends, the hold never outlasts a second and a half.
        clearTimeout(holdTimer);
        holdTimer = setTimeout(release, 1500);
      }, true);
      function release() {
        if (!_gate.pressing) return;
        _gate.pressing = false;
        if (_gate.pending) setTimeout(function () { _gate.pending = false; repaint(); }, 0);
      }
      // A press that becomes a drag (reordering sections) ends without a pointerup.
      RELEASE_ON.forEach(function (t) { document.addEventListener(t, release, true); });
      window.addEventListener('blur', release);

      dom.on(ctx.root, 'click', '[data-rd-open]', function () {
        _rd.open = true; dirty(); ctx.refreshMain();
      });
      dom.on(ctx.root, 'click', '[data-rd-close]', function () { _rd.open = false; ctx.refreshMain(); });
      dom.on(ctx.root, 'click', '[data-rd-modal]', function (e, el) {
        if (e.target === el) { _rd.open = false; ctx.refreshMain(); }
      });
      dom.on(ctx.root, 'click', '[data-rd-pane]', function (e, el) {
        _rd.pane = el.getAttribute('data-rd-pane');
        if (_rd.pane === 'preview') dirty();
        repaint();
      });
      /* Selecting a section does NOT change which pane is showing.
       *
       * It used to jump to the Section pane, which made the Preview unusable for the
       * thing it is best at: clicking down the list and watching the document change.
       * Every trip cost two more clicks to get back. The row still shows as selected,
       * and the Section pane still follows the selection when it is the one on screen. */
      // A click selects; a second click on the same name within a moment (a double-click,
      // even though the first one redrew the list) edits its heading in place.
      var lastPick = { id: null, at: 0 };
      dom.on(ctx.root, 'click', '[data-rd-select]', function (e, el) {
        var id = el.getAttribute('data-rd-select'), now = Date.now();
        var twice = lastPick.id === id && now - lastPick.at < 450;
        lastPick = { id: twice ? null : id, at: now };
        _rd.selected = id;
        if (twice) _rd.renaming = id;
        repaint();
        if (twice) {
          var box = document.querySelector('[data-rd-rename="' + id + '"]');
          if (box) { box.focus(); box.select(); }
        }
      });
      function finishRename(el, keep) {
        if (_rd.renaming !== el.getAttribute('data-rd-rename')) return;
        _rd.renaming = null;
        if (keep) quietly(function () { logIssues(renameSection(el.getAttribute('data-rd-rename'), el.value)); });
        dirty(); repaint();
      }
      dom.on(ctx.root, 'keydown', '[data-rd-rename]', function (e, el) {
        if (e.key === 'Enter') { e.preventDefault(); finishRename(el, true); }
        else if (e.key === 'Escape') { e.preventDefault(); finishRename(el, false); }
      });
      dom.on(ctx.root, 'focusout', '[data-rd-rename]', function (e, el) { finishRename(el, true); });
      // ---- conflict resolution ---------------------------------------------
      dom.on(ctx.root, 'change', '[data-rd-cf]', function (e, el) {
        if (!_rd.conflict) return;
        _rd.conflict.decisions[el.getAttribute('data-rd-cf')] = el.value;
      });
      dom.on(ctx.root, 'click', '[data-rd-cf-all]', function (e, el) {
        if (!_rd.conflict) return;
        var v = el.getAttribute('data-rd-cf-all');
        _rd.conflict.plan.conflicts.forEach(function (c) {
          _rd.conflict.decisions[App.docTemplates._norm(c.incoming.name)] = v;
        });
        repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-cf-cancel]', function () { _rd.conflict = null; repaint(); });
      dom.on(ctx.root, 'click', '[data-rd-cf-apply]', function () { applyConflict(); });
      // ---- preview ----------------------------------------------------------
      dom.on(ctx.root, 'click', '[data-rd-refresh-preview]', function () { dirty(); repaint(); });
      dom.on(ctx.root, 'click', '[data-rd-sec-cat]', function (e, el) { _rd.secCat = el.getAttribute('data-rd-sec-cat'); repaint(); });
      dom.on(ctx.root, 'click', '[data-rd-prev-scope]', function (e, el) { _rd.secWhole = el.getAttribute('data-rd-prev-scope') === 'whole'; repaint(); });
      // The Sections list's grip: dragging resizes the list in place; the width is kept on release.
      dom.on(ctx.root, 'pointerdown', '[data-rd-split]', function (e, el) {
        var pane = el.previousElementSibling, layout = el.parentNode;
        if (!pane || !layout) return;
        e.preventDefault();
        var startX = e.clientX, startW = pane.getBoundingClientRect().width;
        var most = Math.min(LIST_WIDTH.max, layout.getBoundingClientRect().width - 360);
        var w = startW;
        document.body.classList.add('resizing');
        function move(ev) {
          w = Math.max(LIST_WIDTH.min, Math.min(most, startW + ev.clientX - startX));
          pane.style.flexBasis = Math.round(w) + 'px';
        }
        function up() {
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
          document.body.classList.remove('resizing');
          _rd.listWidth = Math.round(w);
          try { window.localStorage.setItem(LIST_KEY, String(_rd.listWidth)); } catch (err) { /* kept for this session only */ }
        }
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
      });
      // The subject the report is about: a session choice, and everything shown is redrawn for it.
      dom.on(ctx.root, 'change', '[data-rd-subject]', function (e, el) { session().subjectId = el.value; dirty(); repaint(); });
      // The page previews' zoom: a way of looking, so the laid-out pages are kept.
      dom.on(ctx.root, 'click', '[data-rd-zoom]', function (e, el) {
        var which = ZOOM_KEY[el.getAttribute('data-rd-zoom-for')] ? el.getAttribute('data-rd-zoom-for') : 'section';
        var i = ZOOMS.indexOf(zoomOf(which));
        if (i === -1) i = ZOOMS.indexOf(ZOOM_FROM[which]);
        i += el.getAttribute('data-rd-zoom') === 'in' ? 1 : -1;
        _rd[ZOOM_KEY[which]] = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i))];
        repaint();
      });
      dom.on(ctx.root, 'click', '[data-prv-jump]', function (e, el) {
        e.preventDefault();
        var target = document.getElementById(el.getAttribute('data-prv-jump'));
        var doc = document.getElementById('rd-preview-doc');
        if (!target || !doc) return;
        /* PRV-4: measured, not accumulated.
         *
         * `offsetTop` is relative to the nearest positioned ancestor, and in page view
         * that is the SHEET rather than the scrolling article — so every link jumped to
         * the target's offset within its own page, which for anything past page one is
         * the wrong place entirely and for page one looked like nothing happening.
         * Two rectangles and the current scroll position work in both views.
         */
        doc.scrollTop += target.getBoundingClientRect().top - doc.getBoundingClientRect().top;
      });
    }
    // ======================================================================
    // wiring: wireSections
    //
    // What the document contains and in what order: inclusion ticks, the ordering
    // buttons and the drag that does the same job, per-section placement and naming,
    // heading levels, the hand-authored sections and the parts inside them.
    //
    // Called by wire(ctx) in 070-wire.js with the shared helper bag. Split out of
    // that one function so no file in this block sits over the 500-line cap; the
    // handlers themselves are unchanged.
    // ======================================================================

    function wireSections(h) {
      var dom = h.dom, ctx = h.ctx;
      var P = h.P;

      /* ---- inclusion + ordering ------------------------------------------
       *
       * OPT-2: all five of these are PROJECT writes now. Each hands the mutator what
       * "not stored" means for the thing being switched, so the file only ever records a
       * departure from the default and switching something back leaves no trace. */
      function include(map, key, subKey, on, dflt) {
        quietly(function () { logIssues(App.docStore.setReportInclude(map, key, subKey, on, dflt)); });
        dirty(); repaint();
      }
      dom.on(ctx.root, 'change', '[data-rd-inc]', function (e, el) {
        include('sections', el.getAttribute('data-rd-inc'), null, el.checked, true);
      });
      dom.on(ctx.root, 'change', '[data-rd-inc-ds]', function (e, el) {
        include('datasetSections', el.getAttribute('data-rd-inc-ds'), '_all', el.checked, true);
      });
      dom.on(ctx.root, 'change', '[data-rd-ds-all]', function (e, el) {
        var dsId = el.getAttribute('data-rd-ds-all'), p = P(); if (!p) return;
        // The groups come off the BLOCK, which is where the host already declared them
        // — asking the registry for the adapter meant knowing what a dataset was.
        var block = (outlineNow(p).blocks || []).filter(function (b) { return b.dsId === dsId; })[0];
        var groups = (block && block.groups) || [];
        quietly(function () {
          groups.forEach(function (g) {
            logIssues(App.docStore.setReportInclude('datasetSections', dsId, g.value, el.checked, true));
          });
        });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-dsmap]', function (e, el) {
        var map = el.getAttribute('data-rd-dsmap'), ds = el.getAttribute('data-rd-ds'), key = el.getAttribute('data-rd-key');
        // COL-3: a column's default is the column's to declare, so it is read off the
        // declaration rather than assumed to be "on".
        var dflt = true;
        if (map === 'columns') {
          var block = (outlineNow(P()).blocks || []).filter(function (b) { return App.docGen.sectionColumnKey(H(), b, opts()) === ds; })[0];
          var cols = block ? App.docGen.sectionColumns(H(), block, opts()) : null;
          var col = ((cols && cols.optional) || []).filter(function (c) { return c.id === key; })[0];
          dflt = !col || col.defaultOff !== true;
        }
        include(map, ds, key, el.checked, dflt);
      });
      // GEN-TAB: the placeholder values. Session state, like the relevance filter
      // beside them — a tag value is an answer for THIS run.
      dom.on(ctx.root, 'change', '[data-rd-tag]', function (e, el) {
        var s = session();
        s.tags = s.tags || {};
        var k = el.getAttribute('data-rd-tag');
        if (String(el.value).trim()) s.tags[k] = el.value; else delete s.tags[k];
        dirty(); repaint();
      });
      // CLS-1: the classification banner is a decision about the DOCUMENT, so it is
      // stored with the project — the same shape as the title block beside it, and the
      // reason `data-rd-flag` is no longer a session flag at all.
      dom.on(ctx.root, 'change', '[data-rd-classification]', function (e, el) {
        quietly(function () { logIssues(App.docStore.setClassification(el.value)); });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-up]', function (e, el) {
        var p = P(); if (!p) return;
        quietly(function () { moveSection(p, el.getAttribute('data-rd-up'), -1); });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-down]', function (e, el) {
        var p = P(); if (!p) return;
        quietly(function () { moveSection(p, el.getAttribute('data-rd-down'), 1); });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-reset-order]', function () {
        quietly(function () { App.docStore.setReportOrder([]); });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-centre-part]', function (e, el) {
        quietly(function () { logIssues(App.docStore.setBlockCentrePart(el.getAttribute('data-rd-block'), el.getAttribute('data-rd-centre-part'), el.checked)); });
        dirty(); repaint();
      });
      // SEC-4: two more per-section placement switches, on the same shape as centring.
      dom.on(ctx.root, 'change', '[data-rd-pagebreak]', function (e, el) {
        quietly(function () { logIssues(App.docStore.setBlockFlag('pageBreak', el.getAttribute('data-rd-pagebreak'), el.checked)); });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-notoc]', function (e, el) {
        quietly(function () { logIssues(App.docStore.setBlockFlag('noToc', el.getAttribute('data-rd-notoc'), el.checked)); });
        dirty(); repaint();
      });
      // SPC-1: the three millimetre boxes — space above a section, a Space part's height,
      // and a table's extra row height. All three are the same gesture into a different
      // mutator, and all three sanitise in docStore rather than here.
      dom.on(ctx.root, 'change', '[data-rd-space-block]', function (e, el) {
        quietly(function () { logIssues(App.docStore.setBlockSpace(el.getAttribute('data-rd-space-block'), el.value)); });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-space]', function (e, el) {
        quietly(function () {
          logIssues(App.docStore.updatePart(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-space'), { height: el.value }));
        });
        dirty(); repaint();
      });
      // SPC-1: which rows take that height.
      dom.on(ctx.root, 'change', '[data-rd-tallrow]', function (e, el) {
        quietly(function () {
          logIssues(App.docStore.setRowTall(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-tallrow'),
            Number(el.getAttribute('data-rd-row')), el.checked));
        });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-rowheight]', function (e, el) {
        quietly(function () {
          logIssues(App.docStore.updatePart(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-rowheight'), { rowHeight: el.value }));
        });
        dirty(); repaint();
      });
      // TBL-1: a generated table's title row, caption and column headings. One handler:
      // the three differ only in which docStore call they land in.
      dom.on(ctx.root, 'change', '[data-rd-tbl-block]', function (e, el) {
        var block = el.getAttribute('data-rd-tbl-block'), key = el.getAttribute('data-rd-tbl-key');
        var col = el.getAttribute('data-rd-tbl-col'), field = el.getAttribute('data-rd-tbl-field');
        // CAP-4: the one tick among the wording boxes, so it rides the same handler.
        var noCap = el.hasAttribute('data-rd-tbl-nocap');
        quietly(function () {
          logIssues(noCap
            ? App.docStore.setTableNoCaption(block, key, el.checked)
            : col
              ? App.docStore.setTableColumnLabel(block, key, col, el.value)
              : App.docStore.setTableText(block, key, field, el.value));
        });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-meta]', function (e, el) {
        quietly(function () { logIssues(App.docStore.setMetaField(el.getAttribute('data-rd-meta'), el.checked)); });
        dirty(); repaint();
      });
      // NAM-1 / SEC-1 / TBS-1 — all three keyed by block id, so one handler each covers
      // a generated section and a hand-authored one alike.
      dom.on(ctx.root, 'change', '[data-rd-sec-name]', function (e, el) {
        quietly(function () { logIssues(App.docStore.setBlockName(el.getAttribute('data-rd-sec-name'), el.value)); });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-sec-heading]', function (e, el) {
        quietly(function () { logIssues(App.docStore.setBlockHeading(el.getAttribute('data-rd-sec-heading'), el.value)); });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-intro-num]', function (e, el) {
        quietly(function () { logIssues(App.docStore.setBlockIntroNumbered(el.getAttribute('data-rd-intro-num'), el.checked)); });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-level]', function (e, el) {
        var v = el.value === '' ? null : Number(el.value);
        quietly(function () { logIssues(App.docStore.setBlockLevel(el.getAttribute('data-rd-level'), v)); });
        dirty(); repaint();
      });
      // drag to reorder sections (`_dragId` rather than dataTransfer alone because
      // Firefox will not read dataTransfer during dragover, where the target is decided)
      dom.on(ctx.root, 'dragstart', '[data-rd-block]', function (e, el) {
        _dragId = el.getAttribute('data-rd-block');
        if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', _dragId); } catch (err) {} }
        el.classList.add('dragging');
      });
      dom.on(ctx.root, 'dragend', '[data-rd-block]', function (e, el) { el.classList.remove('dragging'); _dragId = null; });
      dom.on(ctx.root, 'dragover', '[data-rd-block]', function (e, el) {
        if (!_dragId) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        el.classList.add('drop-target');
      });
      dom.on(ctx.root, 'dragleave', '[data-rd-block]', function (e, el) { el.classList.remove('drop-target'); });
      dom.on(ctx.root, 'drop', '[data-rd-block]', function (e, el) {
        e.preventDefault();
        el.classList.remove('drop-target');
        var target = el.getAttribute('data-rd-block'), p = P();
        if (p && _dragId && _dragId !== target) {
          quietly(function () { moveSection(p, _dragId, 0, target); });
          dirty(); repaint();
        }
        _dragId = null;
      });
      // ---- custom sections ------------------------------------------------
      dom.on(ctx.root, 'click', '[data-rd-add-section]', function () {
        var res = logIssues(App.docStore.addSection(''));
        if (res.id) { _rd.selected = res.id; _rd.pane = 'section'; }
        dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-use-template]', function (e, el) {
        if (!el.value) return;
        var res = logIssues(App.docStore.useSectionTemplate(el.value));
        if (res.id) { _rd.selected = res.id; _rd.pane = 'section'; }
        dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-sec-title]', function (e, el) {
        quietly(function () { logIssues(App.docStore.updateSection(el.getAttribute('data-rd-sec-title'), { title: el.value })); });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-del-section]', function (e, el) {
        var id = el.getAttribute('data-rd-del-section');
        if (!window.confirm('Delete this section and everything in it? Any cross-reference to it will read "[missing reference]".')) return;
        logIssues(App.docStore.removeSection(id));
        if (_rd.selected === id) _rd.selected = null;
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-save-template]', function (e, el) {
        var id = el.getAttribute('data-rd-save-template');
        var name = window.prompt('Name this section template:', '');
        if (name == null || !name.trim()) return;
        logIssues(App.docStore.saveSectionTemplate(id, name));
        App.docHost.log({ severity: 'success', message: 'Saved section template "' + name.trim() + '".' });
        repaint();
      });
      // ---- parts ------------------------------------------------------------
      dom.on(ctx.root, 'click', '[data-rd-addpart]', function (e, el) {
        logIssues(App.docStore.addPart(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-addpart')));
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-part-del]', function (e, el) {
        logIssues(App.docStore.removePart(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-part-del')));
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-part-up]', function (e, el) {
        logIssues(App.docStore.movePart(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-part-up'), -1));
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-part-down]', function (e, el) {
        logIssues(App.docStore.movePart(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-part-down'), 1));
        dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-part-flag]', function (e, el) {
        var f = {}; f[el.getAttribute('data-rd-part-flag')] = el.checked;
        quietly(function () { logIssues(App.docStore.updatePart(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-part'), f)); });
        dirty(); repaint();
      });
      // drag to reorder parts within the open section
      dom.on(ctx.root, 'dragstart', '[data-rd-partrow]', function (e, el) {
        _dragPart = el.getAttribute('data-rd-partrow');
        if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', _dragPart); } catch (err) {} }
        el.classList.add('dragging');
        e.stopPropagation();
      });
      dom.on(ctx.root, 'dragend', '[data-rd-partrow]', function (e, el) { el.classList.remove('dragging'); _dragPart = null; });
      dom.on(ctx.root, 'dragover', '[data-rd-partrow]', function (e, el) {
        if (!_dragPart) return;
        e.preventDefault();
        el.classList.add('drop-target');
      });
      dom.on(ctx.root, 'dragleave', '[data-rd-partrow]', function (e, el) { el.classList.remove('drop-target'); });
      dom.on(ctx.root, 'drop', '[data-rd-partrow]', function (e, el) {
        e.preventDefault();
        el.classList.remove('drop-target');
        var target = el.getAttribute('data-rd-partrow');
        if (_dragPart && _dragPart !== target && _rd.selected) {
          App.docStore.movePart(_rd.selected, _dragPart, 0, target);
          dirty(); repaint();
        }
        _dragPart = null;
      });
      // ---- IMG-1: image parts ----------------------------------------------
      function imgIds(el) { return { sec: el.getAttribute('data-rd-sec'), part: el.getAttribute('data-rd-part'), k: Number(el.getAttribute('data-rd-img-k')) }; }
      function hasFiles(e) { var t = e.dataTransfer && e.dataTransfer.types; return !!t && Array.prototype.indexOf.call(t, 'Files') !== -1; }
      /** Copy a chosen or dropped file into the folder and put it in the box. */
      function putImage(sec, part, k, file) {
        var h = H();
        if (!h.images || typeof h.images.store !== 'function') { App.docHost.log({ severity: 'error', message: 'Images can only be added with a data folder open.' }); return; }
        h.images.store('report', file).then(function (r) {
          logIssues(App.docStore.setPartImage(sec, part, k, { source: 'report', file: r.file, name: file.name }));
          _rd.imgMenu = null; dirty(); repaint();
        }, function (e) { App.docHost.log({ severity: 'error', message: (e && e.message) || 'That image could not be added.' }); });
      }
      dom.on(ctx.root, 'dragover', '[data-rd-imgbox]', function (e, el) {
        if (!hasFiles(e)) return;
        e.preventDefault(); e.stopPropagation();
        el.classList.add('drop-target');
      });
      dom.on(ctx.root, 'dragleave', '[data-rd-imgbox]', function (e, el) { el.classList.remove('drop-target'); });
      dom.on(ctx.root, 'drop', '[data-rd-imgbox]', function (e, el) {
        if (!hasFiles(e)) return;
        e.preventDefault(); e.stopPropagation();
        el.classList.remove('drop-target');
        var f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) putImage(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-part'), Number(el.getAttribute('data-rd-imgbox')), f);
      });
      // A click on the box itself (not its buttons or boxes) opens or closes its menu.
      dom.on(ctx.root, 'click', '[data-rd-imgbox]', function (e, el) {
        if (e.target && e.target.closest && e.target.closest('button, input, select, label, .rd-imgmenu')) return;
        var key = el.getAttribute('data-rd-part') + ':' + el.getAttribute('data-rd-imgbox');
        _rd.imgMenu = _rd.imgMenu === key ? null : key; _rd.imgPick = false;
        repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-img-from]', function () { _rd.imgPick = true; repaint(); });
      dom.on(ctx.root, 'change', '[data-rd-img-file]', function (e, el) {
        var f = el.files && el.files[0], d = imgIds(el);
        if (f) putImage(d.sec, d.part, d.k, f);
        el.value = '';
      });
      dom.on(ctx.root, 'click', '[data-rd-img-std]', function (e, el) {
        var d = imgIds(el);
        logIssues(App.docStore.setPartImage(d.sec, d.part, d.k, { source: 'standard', file: el.getAttribute('data-rd-img-std'), name: el.getAttribute('data-rd-img-name') }));
        _rd.imgMenu = null; _rd.imgPick = false; dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-img-clear]', function (e, el) {
        var d = imgIds(el);
        logIssues(App.docStore.setPartImage(d.sec, d.part, d.k, null)); dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-img-layout]', function (e, el) {
        logIssues(App.docStore.updatePart(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-img-layout'), { layout: el.value }));
        _rd.imgMenu = null; dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-img-captions]', function (e, el) {
        logIssues(App.docStore.updatePart(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-img-captions'), { captions: el.value })); dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-img-caption]', function (e, el) {
        logIssues(App.docStore.updatePart(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-img-caption'), { caption: el.value })); dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-img-width]', function (e, el) {
        var d = imgIds(el);
        logIssues(App.docStore.setPartImageField(d.sec, d.part, d.k, 'width', el.value)); dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-img-step]', function (e, el) {
        var d = imgIds(el);
        var box = el.closest('.rd-num') && el.closest('.rd-num').querySelector('[data-rd-img-width]');
        var next = stepped(box ? box.value : 100, 5, el.getAttribute('data-rd-img-step') === '+' ? 1 : -1);
        logIssues(App.docStore.setPartImageField(d.sec, d.part, d.k, 'width', Math.min(100, Math.max(5, next)))); dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-img-noborder]', function (e, el) {
        var d = imgIds(el);
        logIssues(App.docStore.setPartImageField(d.sec, d.part, d.k, 'noBorder', el.checked)); dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-img-capk]', function (e, el) {
        var d = imgIds(el);
        logIssues(App.docStore.setPartImageField(d.sec, d.part, d.k, 'caption', el.value)); dirty(); repaint();
      });
    }
    // ======================================================================
    // wiring: wireText
    //
    // The rich-text boxes (RTX-1/RTX-2). Every one of these handlers exists to keep a
    // caret and a selection where the author put them across a repaint, which is why
    // they are gathered here rather than filed under whatever they are editing.
    //
    // Called by wire(ctx) in 070-wire.js with the shared helper bag. Split out of
    // that one function so no file in this block sits over the 500-line cap; the
    // handlers themselves are unchanged.
    // ======================================================================

    function wireText(h) {
      var dom = h.dom, ctx = h.ctx;

      // The toolbar follows the cursor: bold, italic and code light up where they apply.
      document.addEventListener('selectionchange', showFormats);
      dom.on(ctx.root, 'focusin', '[data-rd-rich]', function () { showFormats(); });
      dom.on(ctx.root, 'input', '[data-rd-rich]', function () {
        var sel = window.getSelection();
        var n = sel && sel.anchorNode;
        if (!n || n.nodeType !== 3 || n.nodeValue.indexOf('\u200B') === -1 || n.nodeValue.length < 2) return;
        var at = sel.anchorOffset - (n.nodeValue.slice(0, sel.anchorOffset).split('\u200B').length - 1);
        n.nodeValue = n.nodeValue.replace(/\u200B/g, '');
        var r = document.createRange(); r.setStart(n, Math.max(0, Math.min(at, n.nodeValue.length))); r.collapse(true);
        sel.removeAllRanges(); sel.addRange(r);
      });

      // The Sections preview follows typing: half a second after a live box stops
      // changing, its value is saved and the preview column alone is redrawn.
      var liveTimer = null;
      dom.on(ctx.root, 'input', '[data-rd-live]', function (e, el) {
        clearTimeout(liveTimer);
        liveTimer = setTimeout(function () {
          if (!el.isConnected) return;               // already saved by leaving it, and redrawn
          quietly(function () { logIssues(liveSave(el)); });
          dirty();
          refreshSectionPreview();
        }, 500);
      });
      // Leaving a live box saves it there and then, so a save still waiting is dropped.
      dom.on(ctx.root, 'focusout', '[data-rd-live]', function () { clearTimeout(liveTimer); });

      /* Keep the caret and the selection where the author put them.
       *
       * `mousedown` is the event that moves focus, so preventing its default is what
       * stops the textarea losing the selection the button is about to act on — and it
       * has to be on every one of them (bold, italic, code, line break, the Link button
       * and each target in the menu), because they all act on the same selection.
       */
      /* Keep the caret and the selection where the author put them.
       *
       * `mousedown` is the event that moves focus, so preventing its default is what
       * stops the box losing the selection the button is about to act on — and it has to
       * be on every one of them (bold, italic, code, line break, the Link button and each
       * target in the menu), because they all act on the same selection.
       *
       * The selection is recorded here too. It is live in the DOM at this moment and it
       * will not be after the reference menu has repainted, and recording it as TOKEN
       * offsets is what lets it survive that. A button pressed while the caret is
       * somewhere else entirely leaves the last recorded selection alone. */
      dom.on(ctx.root, 'mousedown', '[data-rd-wrap], [data-rd-ref-open], [data-rd-ref-pick]',
        function (e, el) {
          e.preventDefault();
          var live = liveBox(el);
          if (live) noteSelection(live);
        });

      dom.on(ctx.root, 'click', '[data-rd-wrap]', function (e, el) {
        wrapSelection(el, el.getAttribute('data-rd-wrap'));
      });
      dom.on(ctx.root, 'click', '[data-rd-ref-open]', function (e, el) {
        var id = el.getAttribute('data-rd-ref-open');
        _rd.refFor = _rd.refFor === id ? null : id;
        // The remembered selection is two offsets into the box's TOKENS (RTX-1), so it
        // survives the repaint that opens the menu — which is what lets picking a target
        // link the words that were highlighted when the button was pressed.
        repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-ref-pick]', function (e, el) {
        // REF-1: the reading (`ref` / `refn` / `reft`) rides on the button, so the same
        // menu serves a paragraph, a table cell and a section introduction.
        var tag = (el.getAttribute('data-rd-ref-tag') || 'ref') + ':' + el.getAttribute('data-rd-ref-pick');
        wrapSelection(el, tag);
        _rd.refFor = null;
        repaint();
      });

      /* RTX-1: the box commits on BLUR, like every text box in the tool — a commit per
       * keystroke would repaint the workspace and take the caret with it. The selection
       * is recorded on the way out too, so the toolbar and the reference menu know which
       * box was being written in and where in it. */
      dom.on(ctx.root, 'focusout', '[data-rd-rich]', function (e, el) {
        noteSelection(el);
        var save = boxSaver(el);
        var next = RT.fromNode(el);
        quietly(function () { logIssues(save(next)); });
        dirty();
        /* A CELL does not repaint, and the others do.
         *
         * Leaving a paragraph or an introduction means the workspace can catch up — the
         * escape hint under the box, the preview beside it. Leaving a cell usually means
         * the caret has gone to the NEXT cell, and rebuilding the table around it would
         * take the focus out of the row being filled in. */
        if (!el.hasAttribute('data-rd-cell')) repaint();
      });
      // While the caret is in the box, keep track of where it is: a toolbar button
      // prevents its own mousedown, so the selection is still live when it is pressed —
      // but only this knows which of a table's cells it belongs to.
      ['keyup', 'mouseup'].forEach(function (ev) {
        dom.on(ctx.root, ev, '[data-rd-rich]', function (e, el) { noteSelection(el); });
      });
      /* Enter is a LINE BREAK, not a block.
       *
       * Left to itself a contenteditable wraps what follows in a <div> or a <p> depending
       * on the browser, and the box has no blocks — its whole content is one paragraph of
       * token markup. The walker reads a stray block back as a break anyway, so this is
       * about producing the same DOM in every browser rather than about correctness.
       */
      dom.on(ctx.root, 'keydown', '[data-rd-rich]', function (e, el) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        insertToken(el, 'br');
      });
      /* Paste arrives as PLAIN TEXT.
       *
       * Pasting from a word processor brings a document's worth of markup with it —
       * fonts, colours, tables — none of which this box can store and all of which the
       * walker would have to be defensive about. The text is what was meant.
       */
      dom.on(ctx.root, 'paste', '[data-rd-rich]', function (e, el) {
        if (!e.clipboardData) return;
        e.preventDefault();
        var text = e.clipboardData.getData('text/plain') || '';
        var at = RT.selectionIn(el, window.getSelection()) || { start: 0, end: 0 };
        var cur = RT.fromNode(el);
        var next = cur.slice(0, at.start) + text + cur.slice(at.end);
        quietly(function () { logIssues(boxSaver(el)(next)); });
        dirty();
        el.innerHTML = boxHtml(next);
        RT.placeCaret(el, at.start + text.length, window);
      });
    }
    // ======================================================================
    // wiring: wireTables
    //
    // Tables: cells, rows and columns, and the two ways a column width is set — dragged
    // on an edge (TW-1/TW-2) or typed into the percentage chip.
    //
    // Called by wire(ctx) in 070-wire.js with the shared helper bag. Split out of
    // that one function so no file in this block sits over the 500-line cap; the
    // handlers themselves are unchanged.
    // ======================================================================

    function wireTables(h) {
      var dom = h.dom, ctx = h.ctx;

      // ---- table editing ----------------------------------------------------
      // RTX-2: a cell is a rich box like any other, so it commits through the same
      // focusout handler above — and, like the others, without a repaint: the box
      // already shows what was typed, and a repaint mid-table would move focus out of
      // the row being filled in.
      dom.on(ctx.root, 'change', '[data-rd-caption]', function (e, el) {
        quietly(function () { App.docStore.updatePart(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-caption'), { caption: el.value }); });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-align]', function (e, el) {
        quietly(function () { App.docStore.setAlign(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-align'), Number(el.getAttribute('data-rd-col')), el.value); });
        dirty();
      });
      dom.on(ctx.root, 'click', '[data-rd-addrow]', function (e, el) {
        App.docStore.addRow(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-addrow'));
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-addcol]', function (e, el) {
        App.docStore.addColumn(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-addcol'));
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-delrow]', function (e, el) {
        App.docStore.removeRow(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-delrow'), Number(el.getAttribute('data-rd-row')));
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-delcol]', function (e, el) {
        App.docStore.removeColumn(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-delcol'), Number(el.getAttribute('data-rd-col')));
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-autowidth]', function (e, el) {
        quietly(function () { logIssues(App.docStore.clearWidths(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-autowidth'))); });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-block-autowidth]', function (e, el) {
        quietly(function () { logIssues(App.docStore.clearBlockWidths(el.getAttribute('data-rd-block-autowidth'))); });
        dirty(); repaint();
      });

      /** One place that turns a `data-rd-wt` target into the right docStore call. */
      function writeWidth(target, col, fraction, exact) {
        var bits = String(target || '').split('|');
        if (bits[0] === 'p') return App.docStore.setWidth(bits[1], bits[2], col, fraction, exact);
        if (bits[0] === 'b') return App.docStore.setBlockWidth(bits[1], Number(bits[2]), col, fraction, exact);
        return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'Unknown width target.' }] };
      }

      /* TW-1/TW-2: drag an edge to set that column's share.
       *
       * Modelled on the data-table handle in App.ui.app, with one deliberate difference:
       * that one writes a pixel width into UI state, and this one writes a FRACTION into
       * the project. A width that only existed in the session would be gone by the next
       * generate, and localStorage is never canonical here — so the drag ends in
       * docStore, and the document is what proves it landed.
       *
       * The pixel-to-fraction conversion is against the container's own width, which is
       * the profile's text width in both editors, so what is dragged is the shape the
       * page gets. The repaint is held until mouseup: repainting per mousemove would
       * rebuild the very element being dragged.
       */
      dom.on(ctx.root, 'mousedown', '[data-rd-colresize]', function (e, el) {
        e.preventDefault(); e.stopPropagation();
        var target = el.getAttribute('data-rd-wt');
        var col = Number(el.getAttribute('data-rd-col'));
        // A header cell in the table editor, or a segment in the width strip.
        var cell = el.parentNode;
        while (cell && cell.tagName !== 'TH' && !(cell.classList && cell.classList.contains('rd-wseg'))) cell = cell.parentNode;
        // The measuring box is the PAGE-width container in both editors — the strip
        // itself, or the box the (possibly narrower) table sits in — so a pointer
        // position is directly a share of the page (TW-3).
        var box = cell && cell.parentNode;
        while (box && !(box.classList && (box.classList.contains('rd-widthbar') || box.classList.contains('rd-tablescale')))) box = box.parentNode;
        var table = cell;
        while (table && table.tagName !== 'TABLE') table = table.parentNode;
        if (!cell || !box) return;
        var total = box.offsetWidth || 1;
        var startX = e.clientX, startW = cell.offsetWidth;
        // The table editor is `table-layout: fixed` with a colgroup, so live feedback
        // there has to move the <col>; the strip moves the segment itself.
        var cols = table ? table.querySelectorAll('col') : null;
        function width(ev) { return Math.max(16, startW + (ev.clientX - startX)); }
        function onMove(ev) {
          // A colgroup percentage is relative to the TABLE, the strip's to the box —
          // the two differ whenever the table is narrower than the page.
          if (cols && cols[col]) cols[col].style.width = (width(ev) / (table.offsetWidth || total) * 100) + '%';
          else cell.style.width = (width(ev) / total * 100) + '%';
        }
        function onUp(ev) {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          quietly(function () { logIssues(writeWidth(target, col, width(ev) / total, false)); });
          dirty(); repaint();
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });

      /* TW-1: double-click a percentage to type one.
       *
       * A drag is good for "a bit wider" and useless for "exactly 60". Typed values also
       * behave differently on purpose — they set ONE column and leave the rest alone,
       * which is how a set can end up totalling more than 100% and earning the red flag
       * under the editor. Dragging redistributes; typing does not.
       *
       * The chip swaps to an input in place rather than repainting, because a repaint
       * would take the element out from under the double-click that asked for it.
       */
      function editPct(el) {
        if (el.querySelector('input')) return;
        var target = el.getAttribute('data-rd-pct'), col = Number(el.getAttribute('data-rd-col'));
        var cur = parseFloat(el.textContent) || 0;
        el.innerHTML = '<input class="rd-pctbox" type="number" min="5" max="100" step="1" value="' + Math.round(cur) + '" aria-label="Column width, percent">';
        var box = el.querySelector('input');
        box.focus(); box.select();
        var done = false;
        /* Tab walks to the next column's box, Shift+Tab to the previous — because
         * setting a row of widths is one job, and doing it a double-click at a time is
         * three gestures per column. The repaint has already rebuilt the chips by the
         * time we look for the next one, so it is found by its target and column rather
         * than held onto across the rebuild. */
        function move(by) {
          var chips = Array.prototype.slice.call(document.querySelectorAll('[data-rd-pct="' + target + '"]'));
          var next = chips.filter(function (c) { return Number(c.getAttribute('data-rd-col')) === col + by; })[0];
          if (next) editPct(next);
        }
        function commit(keep, by) {
          if (done) return;
          done = true;
          var v = keep ? Number(box.value) : NaN;
          if (isFinite(v) && v > 0) {
            quietly(function () { logIssues(writeWidth(target, col, v / 100, true)); });
            dirty();
          }
          repaint();
          if (by) move(by);
        }
        box.addEventListener('blur', function () { commit(true); });
        box.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') { ev.preventDefault(); commit(true); }
          else if (ev.key === 'Escape') { ev.preventDefault(); commit(false); }
          else if (ev.key === 'Tab') { ev.preventDefault(); commit(true, ev.shiftKey ? -1 : 1); }
        });
      }
      dom.on(ctx.root, 'dblclick', '[data-rd-pct]', function (e, el) { e.preventDefault(); editPct(el); });
      // Keyboard parity: the chip is focusable, so Enter must open it too.
      dom.on(ctx.root, 'keydown', '[data-rd-pct]', function (e, el) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editPct(el); }
      });
    }
    // ======================================================================
    // wiring: wireFormatting
    //
    // Formatting profiles, the title block, the header and footer slots, and the
    // template catalogues with their export and import.
    //
    // Called by wire(ctx) in 070-wire.js with the shared helper bag. Split out of
    // that one function so no file in this block sits over the 500-line cap; the
    // handlers themselves are unchanged.
    // ======================================================================

    function wireFormatting(h) {
      var dom = h.dom, ctx = h.ctx;
      var P = h.P;

      // ---- formatting -------------------------------------------------------
      dom.on(ctx.root, 'change', '[data-rd-fmt-active]', function (e, el) {
        quietly(function () { logIssues(App.docStore.setFormatId(el.value)); });
        _rd.fmtId = el.value; dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-fmt-edit]', function (e, el) { _rd.fmtId = el.value; _rd.held = null; repaint(); });
      dom.on(ctx.root, 'click', '[data-rd-style-section]', function (e, el) { _rd.styleSection = el.getAttribute('data-rd-style-section'); _rd.held = null; repaint(); });
      dom.on(ctx.root, 'click', '[data-rd-fmt-new]', function () {
        var project = P(); if (!project) return;
        var from = App.docFormat.list(project).filter(function (x) { return x.id === (_rd.fmtId || App.docFormat.resolve(project).id); })[0];
        var name = window.prompt('Name for the new Style:', (from ? from.name : 'Standard') + ' copy');
        if (name == null || !name.trim()) return;
        var res = logIssues(App.docStore.addFormat(name, from));
        if (res.id) { _rd.fmtId = res.id; App.docStore.setFormatId(res.id); }
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-fmt-del]', function () {
        if (!_rd.fmtId || _rd.fmtId === 'standard') return;
        if (!window.confirm('Delete this Style? Any document using it falls back to Standard.')) return;
        logIssues(App.docStore.removeFormat(_rd.fmtId));
        _rd.fmtId = null; dirty(); repaint();
      });
      function fmtPatch(key, value) {
        var project = P(); if (!project) return;
        var id = _rd.fmtId || App.docFormat.resolve(project).id;
        var cur = App.docFormat.list(project).filter(function (x) { return x.id === id; })[0];
        if (!cur || cur.builtin) return;
        // Dotted paths ('page.marginTop', 'levels.2.size') are patched into a copy so
        // the store only ever sees a whole, valid profile.
        var patch = JSON.parse(JSON.stringify(cur));
        var parts = key.split('.'), o = patch;
        for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]];
        o[parts[parts.length - 1]] = value;
        // PDF-1: a value the Style cannot use is held to the nearest one that works, and said.
        _rd.held = normaliseStyle(patch).held;
        quietly(function () { logIssues(App.docStore.updateFormat(id, patch)); });
        dirty(); repaint();
      }
      // HDR-1: a slot writes through the same dotted-path patcher every other profile
      // field uses, so nothing new has to know how a profile is saved.
      dom.on(ctx.root, 'change', '[data-rd-hf-set]', function (e, el) {
        fmtPatch('headerFooter.' + el.getAttribute('data-rd-hf-set') + '.' + el.getAttribute('data-rd-hf-slot'), el.value);
      });
      dom.on(ctx.root, 'change', '[data-rd-hf-first]', function (e, el) {
        fmtPatch('headerFooter.firstDifferent', el.checked);
      });
      dom.on(ctx.root, 'change', '[data-rd-fmt]', function (e, el) {
        if (el.type === 'color') _rd.colourOpen = null;
        fmtPatch(el.getAttribute('data-rd-fmt'), el.value);
      });
      // The arrows beside a number box: one step up or down from what the box holds.
      dom.on(ctx.root, 'click', '[data-rd-step]', function (e, el) {
        var box = el.closest('.rd-num') && el.closest('.rd-num').querySelector('input');
        var next = stepped(box ? box.value : '', Number(el.getAttribute('data-rd-step-by')), el.getAttribute('data-rd-step') === '+' ? 1 : -1);
        if (box) box.value = String(next);
        fmtPatch(el.getAttribute('data-rd-step-key'), next);
      });
      // Colours: the swatch opens the presets; a preset is chosen with one click.
      dom.on(ctx.root, 'click', '[data-rd-colour-open]', function (e, el) {
        var key = el.getAttribute('data-rd-colour-open');
        _rd.colourOpen = _rd.colourOpen === key ? null : key;
        repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-colour-pick]', function (e, el) {
        _rd.colourOpen = null;
        fmtPatch(el.getAttribute('data-rd-colour-key'), el.getAttribute('data-rd-colour-pick'));
      });
      // A click anywhere else closes an open palette.
      ctx.root.addEventListener('click', function (e) {
        if (!_rd.colourOpen || (e.target && e.target.closest && e.target.closest('.rd-colour'))) return;
        _rd.colourOpen = null;
        repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-fmt-bool]', function (e, el) { fmtPatch(el.getAttribute('data-rd-fmt-bool'), el.checked); });

      // ---- templates --------------------------------------------------------
      dom.on(ctx.root, 'click', '[data-rd-tpl-use]', function (e, el) {
        var res = logIssues(App.docStore.useSectionTemplate(el.getAttribute('data-rd-tpl-use')));
        if (res.id) { _rd.selected = res.id; _rd.pane = 'section'; }
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-tpl-del]', function (e, el) {
        var kind = el.getAttribute('data-rd-tpl-del'), id = el.getAttribute('data-rd-tpl-id');
        if (!window.confirm('Delete this template?')) return;
        logIssues(kind === 'sections' ? App.docStore.removeSectionTemplate(id) : App.docStore.removeReportTemplate(id));
        repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-rpt-save]', function () {
        var name = window.prompt('Name this report template:', '');
        if (name == null || !name.trim()) return;
        logIssues(App.docStore.saveReportTemplate(name));
        App.docHost.log({ severity: 'success', message: 'Saved report template "' + name.trim() + '".' });
        repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-rpt-use]', function (e, el) {
        if (!window.confirm('Apply this template? It replaces the current section order, heading levels and custom sections.')) return;
        logIssues(App.docStore.useReportTemplate(el.getAttribute('data-rd-rpt-use')));
        _rd.selected = null; _rd.fmtId = null; dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-export]', function (e, el) { doExport(el.getAttribute('data-rd-export')); });
      dom.on(ctx.root, 'change', '[data-rd-import]', function (e, el) {
        var f = el.files && el.files[0];
        if (f) doImport(el.getAttribute('data-rd-import'), f);
        el.value = '';                    // so re-picking the same file fires again
      });
    }
    App.ui = App.ui || {};
    App.ui.views = App.ui.views || {};
    App.ui.views.reportDesign = {
      render: render, wire: wire, refresh: refresh,
      open: function () { _rd.open = true; _rd.preview = null; },
      close: function () { _rd.open = false; },
      isOpen: function () { return !!_rd.open; },
      select: function (id) { _rd.selected = id; _rd.pane = 'section'; },
      pane: function (id) { if (id) { _rd.pane = id; _rd.preview = null; } return _rd.pane; },
      laidOut: laidOut, LIST_WIDTH: LIST_WIDTH, PALETTE: PALETTE, SEC_CATEGORIES: SEC_CATEGORIES, _gate: _gate, _repaint: repaint, _stepped: stepped, _renameSection: renameSection, _formatsAt: formatsAt, _holds: holds, _releaseOn: RELEASE_ON,
      PANES: PANES, _rd: _rd, _imageAssets: _imageAssets
    };
  })(App);

export { App };
export default App;
